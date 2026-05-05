import {
  DEFAULT_SCAN_CONCURRENCY,
  ESP_HANDSHAKE_UUID,
  REQUEST_TIMEOUT_MS,
  buildBaseUrl,
  buildCommandUrl,
  buildStreamUrl,
} from "../config";
import type { ScanProgress } from "../types";

export interface HandshakeResult {
  host: string;
  body: string;
  matched: boolean;
  url: string;
}

export interface ProbeOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface ScanOptions {
  signal?: AbortSignal;
  concurrency?: number;
  timeoutMs?: number;
  onProgress?: (progress: ScanProgress) => void;
}

export function deriveSubnetPrefix(
  ipAddress: string | null | undefined,
): string | null {
  if (!ipAddress) {
    return null;
  }

  const parts = ipAddress.trim().split(".");
  if (parts.length !== 4) {
    return null;
  }

  const [first, second, third, fourth] = parts;
  if (![first, second, third, fourth].every((part) => /^\d+$/.test(part))) {
    return null;
  }

  const octets = parts.map((part) => Number(part));
  if (octets.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return null;
  }

  // 0.0.0.0/8 is not a usable LAN subnet for scanning.
  if (octets[0] === 0) {
    return null;
  }

  return `${octets[0]}.${octets[1]}.${octets[2]}`;
}

export function isValidIpv4Host(host: string): boolean {
  const parts = host.trim().split(".");
  if (parts.length !== 4) {
    return false;
  }

  return parts.every(
    (part) => /^\d+$/.test(part) && Number(part) >= 0 && Number(part) <= 255,
  );
}

function createTimedAbortSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): AbortSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const clear = () => {
    clearTimeout(timeoutId);
  };

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener(
        "abort",
        () => {
          controller.abort();
          clear();
        },
        { once: true },
      );
    }
  }

  controller.signal.addEventListener("abort", clear, { once: true });
  return controller.signal;
}

export async function requestText(
  url: string,
  options: ProbeOptions = {},
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const signal = createTimedAbortSignal(options.signal, timeoutMs);

  try {
    const response = await fetch(url, { method: "GET", signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }

    return await response.text();
  } catch (error) {
    if (signal.aborted) {
      throw new Error(`Request timed out for ${url}`);
    }

    throw error;
  }
}

export async function probeHandshake(
  host: string,
  options: ProbeOptions = {},
): Promise<HandshakeResult> {
  const url = `${buildBaseUrl(host)}/handshake`;
  const body = await requestText(url, options);
  return {
    host,
    body,
    matched: body.trim() === ESP_HANDSHAKE_UUID,
    url,
  };
}

export async function sendCommand(
  host: string,
  path: string,
  options: ProbeOptions = {},
): Promise<string> {
  const url = buildCommandUrl(host, path);
  return requestText(url, options);
}

export function getStreamUrl(host: string): string {
  return buildStreamUrl(host);
}

export async function scanSubnet(
  prefix: string,
  options: ScanOptions = {},
): Promise<HandshakeResult | null> {
  const concurrency = Math.max(
    1,
    options.concurrency ?? DEFAULT_SCAN_CONCURRENCY,
  );
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const signal = options.signal;
  const hosts = Array.from(
    { length: 254 },
    (_, index) => `${prefix}.${index + 1}`,
  );

  let cursor = 0;
  let found: HandshakeResult | null = null;
  let completed = 0;

  const reportProgress = (currentHost?: string) => {
    options.onProgress?.({
      scanned: completed,
      total: hosts.length,
      currentHost,
    });
  };

  const worker = async (): Promise<void> => {
    while (!signal?.aborted) {
      const hostIndex = cursor++;
      if (hostIndex >= hosts.length || found) {
        return;
      }

      const host = hosts[hostIndex];
      try {
        const result = await probeHandshake(host, { signal, timeoutMs });
        completed += 1;
        reportProgress(host);
        if (result.matched) {
          found = result;
          return;
        }
      } catch {
        completed += 1;
        reportProgress(host);
      }

      if (found || signal?.aborted) {
        return;
      }
    }
  };

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  if (signal?.aborted) {
    throw new Error("Scan cancelled");
  }

  return found;
}
