export const ESP_HTTP_PORT = 8080;
export const ESP_HANDSHAKE_UUID = "2f1f6dc4-3021-45f2-a8a4-53f73090e6c7";

export const DEFAULT_SCAN_CONCURRENCY = 12;
export const REQUEST_TIMEOUT_MS = 1400;
export const MANUAL_CONNECT_TIMEOUT_MS = 1800;

// Common Android/iOS hotspot private subnets used by different vendors.
export const HOTSPOT_SCAN_PREFIXES = [
  "192.168.43",
  "192.168.137",
  "172.20.10",
  "192.168.232",
  "192.168.1",
  "10.14.98"
];

export function buildBaseUrl(host: string): string {
  return `http://${host}:${ESP_HTTP_PORT}`;
}

export function buildStreamUrl(host: string): string {
  return `${buildBaseUrl(host)}/stream`;
}

export function buildCommandUrl(host: string, path: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${buildBaseUrl(host)}${normalizedPath}`;
}
