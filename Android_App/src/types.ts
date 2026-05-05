export type EspDiscoveryState =
  | "idle"
  | "scanning"
  | "connecting"
  | "ready"
  | "error";

export type EspFlashState = "on" | "off";

export interface ScanProgress {
  scanned: number;
  total: number;
  currentHost?: string;
}

export interface Esp32ControllerState {
  localIp: string | null;
  subnetPrefix: string | null;
  networkMode: "wifi" | "hotspot" | "cellular" | "unknown";
  networkSummary: string;
  activeHost: string | null;
  discoveredHost: string | null;
  discoveryState: EspDiscoveryState;
  isScanning: boolean;
  isCommandRunning: boolean;
  isStreaming: boolean;
  flashState: EspFlashState;
  streamVersion: number;
  lastHandshake: string | null;
  statusMessage: string;
  errorMessage: string | null;
}
