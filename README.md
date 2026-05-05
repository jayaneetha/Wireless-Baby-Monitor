# Wireless Baby Camera

Baby camera monitor using an ESP32-Camera module and an Android (React Native) viewer app.

## Table of Contents

- Introduction
- Architecture
- Components
- Getting started
- Build & flash (Arduino / ESP32)
- Build & run (Android app)
- Create Android APK / Release build
- Troubleshooting
- Contributing
- License

## Introduction

Wireless Baby Camera is a minimal baby-monitor system consisting of two cooperating components:

- An Arduino-based ESP32 camera module that streams video over HTTP.
- An Android application (React Native) that connects to the ESP32 stream and displays a live preview.

The common use-case: create a Wi‑Fi hotspot on an Android device and have the ESP32 join that hotspot. This allows the phone and ESP32 to communicate directly without a third-party Wi‑Fi router.

## Architecture

High level:

- Android device creates a hotspot (AP).
- ESP32 camera connects as a station (STA) to that hotspot network.
- ESP32 serves a small MJPEG/HTTP stream endpoint.
- Android app fetches and displays the stream.

Mermaid diagram:

```mermaid
flowchart LR
  Phone[Android Phone (Hotspot + Viewer App)]
  ESP[ESP32-Camera Module]
  Phone ---"Wi‑Fi Hotspot (SSID)"--- ESP
  ESP ---"HTTP/MJPEG Stream (http://<ip>/stream)"--- Phone
  subgraph LocalNetwork
    Phone
    ESP
  end
```

## Components

- `Arduino/` — ESP32 firmware, `Arduino.ino`, `secrets.h.tmpl`, and `flash_and_print_url.sh` helper script.
- `Android_App/` — React Native / Expo app. Contains `App.tsx`, `app.json` and native `android/` directory.

## Getting started (prerequisites)

- Hardware
  - ESP32 with camera (e.g., ESP32-CAM or similar module).
  - Android device capable of creating a Wi‑Fi hotspot.

- Software
  - Arduino IDE or `arduino-cli` / PlatformIO (for flashing ESP32), or use the included flash script.
  - Node.js (16+ recommended), `npm` or `yarn` for the Android app.
  - Java JDK and Android SDK + Gradle (for building a release APK locally), or `eas` if using Expo Application Services.

## Prepare the ESP32 (Arduino) firmware

1. Edit the secrets: copy `Arduino/secrets.h.tmpl` -> `Arduino/secrets.h` and fill in values. Typical fields you will set are the hotspot SSID and password the Android phone will broadcast.

   Example (conceptual):

   ```c
   // Arduino/secrets.h
   #define WIFI_SSID "MyPhoneHotspot"
   #define WIFI_PASS "hotspotPassword"
   ```

2. Option A — Use the helper script (recommended if present):

   ```bash
   cd Arduino
   ./flash_and_print_url.sh
   ```

   The script will attempt to flash the board and print the camera stream URL or the assigned IP address (check the script contents to confirm required tools and serial port args).

3. Option B — Use Arduino IDE / Arduino CLI / PlatformIO
   - Arduino IDE: open `Arduino/Arduino.ino`, select the correct board (ESP32), set the serial port, and Upload.

   - Arduino CLI example:

   ```bash
   # compile
   arduino-cli compile --fqbn esp32:esp32:esp32 Arduino
   # upload (adjust port)
   arduino-cli upload -p /dev/tty.SLAB_USBtoUART --fqbn esp32:esp32:esp32 Arduino
   ```

4. After the ESP32 boots and connects to the hotspot, it will host a small HTTP stream endpoint (commonly `/stream` or `/capture`). The helper script or the serial monitor will typically print the assigned IP and stream URL.

## Running the Android app (development)

1. Install dependencies and start Metro

```bash
cd Android_App
npm install
# or
# yarn install

# start dev server
npx expo start
# or for a bare React Native workflow
npx react-native start
```

2. On your Android device, enable hotspot with the SSID/password you put into `secrets.h`.

3. Either run the app from your dev machine to the connected device or install the debug build and open it on the phone. For a managed Expo workflow, scan the QR code with the Expo Go app; for bare, use `npx react-native run-android`.

## How the Android app connects to the stream

The app expects a network-accessible HTTP MJPEG or JPEG stream. If the ESP32 publishes the stream at `http://192.168.43.123:81/stream`, open the app and ensure it requests that URL. The project likely contains code that builds the streaming URL or reads it from a settings screen; inspect `Android_App/src` or `Android_App/App.tsx` for `stream` or `preview` references.

## Create an Android APK / Release build

There are two common ways depending on how your app is set up (Expo managed vs. native/bare):

Option A — Native Gradle build (no EAS)

1. Generate a signing key (if you want a signed release):

```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
```

2. Build release with Gradle (from `Android_App/android`):

```bash
cd Android_App/android
./gradlew assembleRelease
# or to produce an AAB
./gradlew bundleRelease
```

3. The unsigned/signed APK will be in:

- `Android_App/android/app/build/outputs/apk/release/app-release.apk`
- `Android_App/android/app/build/outputs/bundle/release/app-release.aab`

4. Sign and align the APK if required (if you didn't configure Gradle signing configs):

```bash
jarsigner -keystore my-release-key.jks app-release-unsigned.apk my-key-alias
zipalign -v 4 app-release-unsigned.apk app-release.apk
apksigner verify app-release.apk
```

Option B — Expo + EAS (if using Expo and `eas.json` present)

1. Install EAS CLI and configure credentials: https://docs.expo.dev/build/setup/

```bash
npm install -g eas-cli
eas login
cd Android_App
eas build -p android --profile production
```

2. The result will be an `.aab` or `.apk` downloadable from Expo/EAS build page. Follow Expo docs for signing or letting EAS handle signing.

## Troubleshooting

- ESP32 won't connect to hotspot: confirm SSID/password in `secrets.h`, check hotspot is visible to other devices, check channel/security settings.
- No stream or blank image: open the device serial monitor to observe logs; ensure camera wiring (if using external board) and camera type in code match your hardware.
- App can't reach stream: ensure the phone is running the hotspot and the ESP32 connected to the same AP; check the ESP32-assigned IP (printed to serial); try accessing stream URL from a browser on the phone.
- Gradle build fails: install appropriate Android SDK components, set `ANDROID_HOME` / `ANDROID_SDK_ROOT` environment variables, ensure JDK version is compatible.

## Security & Privacy

- Hotspot network created by the phone is used only for local streaming and does not require internet access.
- Be cautious exposing the stream on public networks. Use strong hotspot passwords and avoid open hotspots.

## Contributing

1. Open an issue describing the feature or bug.
2. Fork and create a topic branch for pull requests.


