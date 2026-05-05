import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Network from "expo-network";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { HOTSPOT_SCAN_PREFIXES, MANUAL_CONNECT_TIMEOUT_MS } from "../config";
import {
  deriveSubnetPrefix,
  getStreamUrl,
  isValidIpv4Host,
  probeHandshake,
  scanSubnet,
  sendCommand,
} from "../lib/esp32";
import type {
  Esp32ControllerState,
  EspDiscoveryState,
  ScanProgress,
  EspFlashState,
} from "../types";

interface ConnectOptions {
  autoStartStream?: boolean;
  source?: "scan" | "manual";
}

const CONTROL_COMMAND_TIMEOUT_MS = 5000;
const STREAM_SETTLE_DELAY_MS = 250;
const LAST_KNOWN_HOST_KEY = "esp32:lastKnownHost";

type NetworkMode = Esp32ControllerState["networkMode"];

export interface ControllerApi {
  state: Esp32ControllerState;
  manualHost: string;
  setManualHost: (host: string) => void;
  scanForDevice: () => Promise<void>;
  connectManually: () => Promise<void>;
  startStream: () => Promise<void>;
  stopStream: () => Promise<void>;
  setFlashState: (state: EspFlashState) => Promise<void>;
  refreshStream: () => void;
  streamUrl: string | null;
  scanProgress: ScanProgress | null;
}

const initialState: Esp32ControllerState = {
  localIp: null,
  subnetPrefix: null,
  networkMode: "unknown",
  networkSummary: "Network state unavailable",
  activeHost: null,
  discoveredHost: null,
  discoveryState: "idle",
  isScanning: false,
  isCommandRunning: false,
  isStreaming: false,
  flashState: "off",
  streamVersion: 0,
  lastHandshake: null,
  statusMessage: "Waiting to discover the ESP32",
  errorMessage: null,
};

function summarizeNetwork(
  networkState: Awaited<ReturnType<typeof Network.getNetworkStateAsync>>,
  localIp: string | null,
): { mode: NetworkMode; summary: string } {
  const ip = localIp?.trim() || null;
  const type = networkState.type;
  const internetReachable = networkState.isInternetReachable;
  const privatePrefix = deriveSubnetPrefix(ip);

  const isHotspotPrefix =
    privatePrefix !== null && HOTSPOT_SCAN_PREFIXES.includes(privatePrefix);

  if (type === Network.NetworkStateType.WIFI) {
    const likelyHotspot =
      isHotspotPrefix ||
      (internetReachable === false && privatePrefix !== null);

    if (likelyHotspot) {
      return {
        mode: "hotspot",
        summary: ip ? `Hotspot LAN (${ip})` : "Hotspot LAN",
      };
    }

    return {
      mode: "wifi",
      summary: ip ? `Wi-Fi LAN (${ip})` : "Wi-Fi network",
    };
  }

  if (type === Network.NetworkStateType.CELLULAR) {
    return {
      mode: "cellular",
      summary: ip ? `Cellular data (${ip})` : "Cellular data",
    };
  }

  if (isHotspotPrefix) {
    return {
      mode: "hotspot",
      summary: ip ? `Hotspot LAN (${ip})` : "Hotspot LAN",
    };
  }

  return {
    mode: "unknown",
    summary: ip ? `Network available (${ip})` : "Network unavailable",
  };
}

export function useEsp32Controller(): ControllerApi {
  const [state, setState] = useState<Esp32ControllerState>(initialState);
  const [manualHost, setManualHost] = useState("");
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);
  const lastKnownHostRef = useRef<string | null>(null);
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateState = useCallback(
    (updater: (current: Esp32ControllerState) => Esp32ControllerState) => {
      setState((current) => updater(current));
    },
    [],
  );

  const rememberHost = useCallback(async (host: string): Promise<void> => {
    lastKnownHostRef.current = host;
    try {
      await AsyncStorage.setItem(LAST_KNOWN_HOST_KEY, host);
    } catch {
      // Non-fatal: discovery can continue without persisted last-known host.
    }
  }, []);

  const commitConnection = useCallback(
    (
      host: string,
      handshake: string,
      source: ConnectOptions["source"] = "scan",
    ) => {
      updateState((current) => ({
        ...current,
        activeHost: host,
        discoveredHost:
          source === "scan" ? host : (current.discoveredHost ?? host),
        lastHandshake: handshake,
        discoveryState: "ready",
        errorMessage: null,
        statusMessage: `Connected to ${host}`,
      }));

      void rememberHost(host);
    },
    [rememberHost, updateState],
  );

  const setBusyState = useCallback(
    (discoveryState: EspDiscoveryState, statusMessage: string) => {
      updateState((current) => ({
        ...current,
        discoveryState,
        isScanning: discoveryState === "scanning",
        statusMessage,
        errorMessage: null,
      }));
    },
    [updateState],
  );

  const runCommand = useCallback(
    async (
      host: string,
      path: string,
      timeoutMs = MANUAL_CONNECT_TIMEOUT_MS,
    ) => {
      return sendCommand(host, path, { timeoutMs });
    },
    [],
  );

  const wait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      setTimeout(resolve, ms);
    });
  }, []);

  const isTimeoutError = useCallback((error: unknown): boolean => {
    if (!(error instanceof Error)) {
      return false;
    }

    return error.message.toLowerCase().includes("timed out");
  }, []);

  const runControlCommand = useCallback(
    async (host: string, path: string): Promise<string> => {
      try {
        return await runCommand(host, path, CONTROL_COMMAND_TIMEOUT_MS);
      } catch (error) {
        if (!isTimeoutError(error)) {
          throw error;
        }

        return runCommand(host, path, CONTROL_COMMAND_TIMEOUT_MS + 2500);
      }
    },
    [isTimeoutError, runCommand],
  );

  const startStreamOnHost = useCallback(
    async (host: string): Promise<void> => {
      updateState((stateSnapshot) => ({
        ...stateSnapshot,
        isCommandRunning: true,
        statusMessage: "Starting stream...",
        errorMessage: null,
      }));

      try {
        const response = await runControlCommand(host, "/start-stream");
        updateState((stateSnapshot) => ({
          ...stateSnapshot,
          isStreaming: true,
          isCommandRunning: false,
          streamVersion: stateSnapshot.streamVersion + 1,
          statusMessage: response.trim() || "Stream started.",
          errorMessage: null,
        }));
      } catch (error) {
        updateState((stateSnapshot) => ({
          ...stateSnapshot,
          isCommandRunning: false,
          errorMessage:
            error instanceof Error ? error.message : "Failed to start stream",
          statusMessage: "Start stream failed",
        }));
        throw error;
      }
    },
    [runControlCommand, updateState],
  );

  const stopStreamOnHost = useCallback(
    async (host: string): Promise<void> => {
      updateState((stateSnapshot) => ({
        ...stateSnapshot,
        isCommandRunning: true,
        statusMessage: "Stopping stream...",
        errorMessage: null,
      }));

      try {
        const response = await runControlCommand(host, "/stop-stream");
        updateState((stateSnapshot) => ({
          ...stateSnapshot,
          isStreaming: false,
          isCommandRunning: false,
          streamVersion: stateSnapshot.streamVersion + 1,
          statusMessage: response.trim() || "Stream stopped.",
          errorMessage: null,
        }));
      } catch (error) {
        updateState((stateSnapshot) => ({
          ...stateSnapshot,
          isCommandRunning: false,
          errorMessage:
            error instanceof Error ? error.message : "Failed to stop stream",
          statusMessage: "Stop stream failed",
        }));
        throw error;
      }
    },
    [runControlCommand, updateState],
  );

  const stopStream = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.activeHost) {
      throw new Error("No ESP32 host selected");
    }
    await stopStreamOnHost(current.activeHost);
  }, [stopStreamOnHost]);

  const startStream = useCallback(async (): Promise<void> => {
    const current = stateRef.current;
    if (!current.activeHost) {
      throw new Error("No ESP32 host selected");
    }
    await startStreamOnHost(current.activeHost);
  }, [startStreamOnHost]);

  const runPairedCommand = useCallback(
    async (path: string, nextFlashState: EspFlashState): Promise<void> => {
      const current = stateRef.current;
      if (!current.activeHost) {
        throw new Error("No ESP32 host selected");
      }

      updateState((stateSnapshot) => ({
        ...stateSnapshot,
        isCommandRunning: true,
        statusMessage: `Sending ${path}...`,
        errorMessage: null,
      }));

      const wasStreaming = current.isStreaming;
      try {
        if (wasStreaming) {
          updateState((stateSnapshot) => ({
            ...stateSnapshot,
            isStreaming: false,
            streamVersion: stateSnapshot.streamVersion + 1,
            statusMessage: "Pausing stream for control command...",
          }));

          await runControlCommand(current.activeHost, "/stop-stream");
          await wait(STREAM_SETTLE_DELAY_MS);
        }

        const commandResponse = await runControlCommand(
          current.activeHost,
          path,
        );
        updateState((stateSnapshot) => ({
          ...stateSnapshot,
          flashState: nextFlashState,
          statusMessage: commandResponse.trim() || "Command completed.",
          errorMessage: null,
        }));

        if (wasStreaming) {
          const restartResponse = await runControlCommand(
            current.activeHost,
            "/start-stream",
          );
          updateState((stateSnapshot) => ({
            ...stateSnapshot,
            isStreaming: true,
            streamVersion: stateSnapshot.streamVersion + 1,
            statusMessage: restartResponse.trim() || "Stream resumed.",
            errorMessage: null,
          }));
        }
      } catch (error) {
        updateState((stateSnapshot) => ({
          ...stateSnapshot,
          isCommandRunning: false,
          errorMessage:
            error instanceof Error ? error.message : "Failed to send command",
          statusMessage: "Control command failed",
        }));
        throw error;
      }

      updateState((stateSnapshot) => ({
        ...stateSnapshot,
        isCommandRunning: false,
      }));
    },
    [runControlCommand, updateState, wait],
  );

  const connectHost = useCallback(
    async (host: string, options: ConnectOptions = {}): Promise<void> => {
      const normalizedHost = host.trim();
      if (!isValidIpv4Host(normalizedHost)) {
        throw new Error("Enter a valid IPv4 address");
      }

      setBusyState("connecting", `Checking ${normalizedHost}...`);
      const handshake = await probeHandshake(normalizedHost, {
        timeoutMs: MANUAL_CONNECT_TIMEOUT_MS,
      });
      if (!handshake.matched) {
        updateState((current) => ({
          ...current,
          discoveryState: "error",
          isScanning: false,
          errorMessage: `Handshake mismatch from ${normalizedHost}`,
          statusMessage: "ESP32 handshake mismatch",
        }));
        throw new Error(`Handshake mismatch from ${normalizedHost}`);
      }

      commitConnection(normalizedHost, handshake.body, options.source);

      if (options.autoStartStream ?? true) {
        await startStreamOnHost(normalizedHost);
      }
    },
    [commitConnection, setBusyState, startStreamOnHost, updateState],
  );

  const scanForDevice = useCallback(async (): Promise<void> => {
    scanAbortRef.current?.abort();
    const controller = new AbortController();
    scanAbortRef.current = controller;

    setBusyState("scanning", "Preparing network scan...");

    try {
      const networkState = await Network.getNetworkStateAsync();
      const localIp = await Network.getIpAddressAsync();
      const subnetPrefix = deriveSubnetPrefix(localIp);
      const networkMeta = summarizeNetwork(networkState, localIp ?? null);

      updateState((current) => ({
        ...current,
        localIp: localIp ?? null,
        subnetPrefix,
        networkMode: networkMeta.mode,
        networkSummary: networkMeta.summary,
      }));

      const lastKnownHost = lastKnownHostRef.current?.trim() ?? "";
      if (isValidIpv4Host(lastKnownHost)) {
        setBusyState(
          "connecting",
          `Trying last known ESP32 host ${lastKnownHost}...`,
        );

        try {
          await connectHost(lastKnownHost, {
            autoStartStream: true,
            source: "manual",
          });
          setScanProgress(null);
          return;
        } catch {
          updateState((current) => ({
            ...current,
            errorMessage: null,
            statusMessage: `Last known host ${lastKnownHost} not reachable. Continuing scan...`,
          }));
        }
      }

      const candidates: string[] = [];
      const seen = new Set<string>();
      const addCandidate = (prefix: string | null | undefined) => {
        if (!prefix || seen.has(prefix)) {
          return;
        }
        seen.add(prefix);
        candidates.push(prefix);
      };

      addCandidate(subnetPrefix);
      addCandidate(deriveSubnetPrefix(manualHost));
      addCandidate(deriveSubnetPrefix(lastKnownHost));
      HOTSPOT_SCAN_PREFIXES.forEach((prefix) => addCandidate(prefix));

      if (candidates.length === 0) {
        throw new Error(
          "Could not derive a subnet. Enter the ESP32 IP manually.",
        );
      }

      const totalHosts = candidates.length * 254;
      setScanProgress({ scanned: 0, total: totalHosts });

      for (let index = 0; index < candidates.length; index += 1) {
        const prefix = candidates[index];
        const prefixOffset = index * 254;

        setBusyState(
          "scanning",
          `Scanning ${prefix}.x (${index + 1}/${candidates.length})...`,
        );

        const match = await scanSubnet(prefix, {
          signal: controller.signal,
          timeoutMs: MANUAL_CONNECT_TIMEOUT_MS,
          onProgress: (progress) => {
            setScanProgress({
              scanned: prefixOffset + progress.scanned,
              total: totalHosts,
              currentHost: progress.currentHost,
            });
          },
        });

        if (match) {
          await connectHost(match.host, {
            autoStartStream: true,
            source: "scan",
          });
          setScanProgress(null);
          return;
        }
      }

      updateState((current) => ({
        ...current,
        discoveryState: "error",
        isScanning: false,
        errorMessage: `No ESP32 handshake found on scanned subnets: ${candidates.map((prefix) => `${prefix}.x`).join(", ")}`,
        statusMessage: "Scan finished without a match",
      }));
    } catch (error) {
      if (controller.signal.aborted) {
        updateState((current) => ({
          ...current,
          discoveryState: "idle",
          isScanning: false,
          statusMessage: "Scan cancelled",
        }));
        return;
      }

      updateState((current) => ({
        ...current,
        discoveryState: "error",
        isScanning: false,
        errorMessage: error instanceof Error ? error.message : "Scan failed",
        statusMessage: "Could not find the ESP32",
      }));
    } finally {
      if (
        !controller.signal.aborted &&
        stateRef.current.discoveryState !== "ready"
      ) {
        setScanProgress((current) => current);
      }
    }
  }, [connectHost, manualHost, setBusyState, updateState]);

  const connectManually = useCallback(async (): Promise<void> => {
    if (!manualHost.trim()) {
      throw new Error("Enter the ESP32 IP address");
    }

    await connectHost(manualHost, { autoStartStream: true, source: "manual" });
  }, [connectHost, manualHost]);

  const refreshStream = useCallback(() => {
    updateState((current) => ({
      ...current,
      streamVersion: current.streamVersion + 1,
    }));
  }, [updateState]);

  const setFlashState = useCallback(
    async (nextState: EspFlashState): Promise<void> => {
      await runPairedCommand(`/flash?state=${nextState}`, nextState);
    },
    [runPairedCommand],
  );

  const streamUrl = useMemo(() => {
    if (!state.activeHost || !state.isStreaming) {
      return null;
    }

    return getStreamUrl(state.activeHost);
  }, [state.activeHost, state.isStreaming]);

  useEffect(() => {
    void (async () => {
      try {
        const storedHost = await AsyncStorage.getItem(LAST_KNOWN_HOST_KEY);
        const host = storedHost?.trim() ?? "";
        if (!isValidIpv4Host(host)) {
          return;
        }

        lastKnownHostRef.current = host;
        setManualHost((current) => (current.trim() ? current : host));
      } catch {
        // Ignore persistence read errors.
      }
    })();

    void scanForDevice();

    return () => {
      scanAbortRef.current?.abort();
    };
  }, [scanForDevice]);

  return {
    state,
    manualHost,
    setManualHost,
    scanForDevice,
    connectManually,
    startStream,
    stopStream,
    setFlashState,
    refreshStream,
    streamUrl,
    scanProgress,
  };
}
