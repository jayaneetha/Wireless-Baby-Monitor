#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FQBN="${2:-esp32:esp32:esp32cam}"

detect_port() {
  arduino-cli board list | awk '
    /\/dev\/(cu\.usbserial|cu\.usbmodem|ttyUSB|ttyACM)/ { print $1; exit }
  '
}

PORT="${1:-$(detect_port)}"

if [[ -z "${PORT}" ]]; then
  echo "No ESP32 serial port found. Pass port explicitly: $0 /dev/cu.usbserial-10 [fqbn]" >&2
  exit 1
fi

echo "Using port: ${PORT}"
echo "Using FQBN: ${FQBN}"

cd "${SCRIPT_DIR}"

arduino-cli core install esp32:esp32 >/dev/null
arduino-cli compile --fqbn "${FQBN}" .
arduino-cli upload -p "${PORT}" --fqbn "${FQBN}" .

echo "Waiting for server URL from serial monitor..."
URL_LINE="$(
  LC_ALL=C arduino-cli monitor -p "${PORT}" -c baudrate=115200 2>&1 |
    strings -a |
    grep -m1 -E 'Server URL: http://[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+:[0-9]+/'
)"

if [[ -z "${URL_LINE}" ]]; then
  echo "Failed to read server URL from serial monitor." >&2
  exit 1
fi

echo "${URL_LINE}"
