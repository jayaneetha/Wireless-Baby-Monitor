#include <WiFi.h>
#include "esp_camera.h"
#include "esp_http_server.h"
#include "img_converters.h"

#include "secrets.h"

constexpr uint16_t kHttpPort = 8080;
constexpr unsigned long kWifiRetryDelayMs = 1000;
constexpr int kLedPin = 4;
constexpr int kFlashPin = 4;
constexpr unsigned long kBlinkOnMs = 120;
constexpr unsigned long kBlinkOffMs = 120;
constexpr uint8_t kJpegQuality = 40;
constexpr unsigned long kFrameIntervalMs = 350;
// If true, rotate the camera image 180 degrees (vertical flip + horizontal mirror)
constexpr bool kRotate180 = false;

static const char *kIndexMimeType = "text/html";
static const char *kStreamMimeType = "multipart/x-mixed-replace;boundary=frame";
static const char *kStreamBoundary = "\r\n--frame\r\n";
static const char *kStreamPart = "Content-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n";

httpd_handle_t gHttpServer = nullptr;
bool gStreamEnabled = false;
bool gFlashEnabled = false;
bool gPendingServerRestart = false;

void blinkTimes(int count) {
  for (int i = 0; i < count; ++i) {
    digitalWrite(kLedPin, HIGH);
    delay(kBlinkOnMs);
    digitalWrite(kLedPin, LOW);
    delay(kBlinkOffMs);
  }
}

void setFlash(bool enabled) {
  gFlashEnabled = enabled;
  digitalWrite(kFlashPin, enabled ? HIGH : LOW);
}

bool initCamera() {
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = 5;
  config.pin_d1 = 18;
  config.pin_d2 = 19;
  config.pin_d3 = 21;
  config.pin_d4 = 36;
  config.pin_d5 = 39;
  config.pin_d6 = 34;
  config.pin_d7 = 35;
  config.pin_xclk = 0;
  config.pin_pclk = 22;
  config.pin_vsync = 25;
  config.pin_href = 23;
  config.pin_sccb_sda = 26;
  config.pin_sccb_scl = 27;
  config.pin_pwdn = 32;
  config.pin_reset = -1;
  config.xclk_freq_hz = 20000000;
  config.frame_size = FRAMESIZE_VGA;
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = kJpegQuality;
  config.fb_count = 1;

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.print("Camera init failed, err=0x");
    Serial.println(static_cast<uint32_t>(err), HEX);
    return false;
  }

  // Optionally rotate the image 180 degrees by flipping vertically and mirroring horizontally
  sensor_t *s = esp_camera_sensor_get();
  if (s) {
    if (kRotate180) {
      s->set_vflip(s, 1);
      s->set_hmirror(s, 1);
    } else {
      s->set_vflip(s, 0);
      s->set_hmirror(s, 0);
    }
  }

  return true;
}

esp_err_t handleIndex(httpd_req_t *req) {
  String page = "<!doctype html><html><head><meta charset='utf-8'>"
                "<title>ESP32 Camera Stream</title></head><body>"
                "<h1>ESP32 Camera Feed</h1><p>Stream status: <strong>";
  page += gStreamEnabled ? "running" : "stopped";
  page += "</strong></p><p>Flash: <strong>";
  page += gFlashEnabled ? "on" : "off";
  page += "</strong></p>"
          "<p><a href='/start-stream'>Start stream</a> | "
          "<a href='/stop-stream'>Stop stream</a> | "
          "<a href='/stream'>Open stream</a> | "
          "<a href='/flash?state=on'>Flash on</a> | "
          "<a href='/flash?state=off'>Flash off</a> | "
          "<a href='/restart-server'>Restart server</a></p>"
          "<img src='/stream' alt='ESP32 camera stream'/>"
          "</body></html>";
  httpd_resp_set_type(req, kIndexMimeType);
  return httpd_resp_send(req, page.c_str(), page.length());
}

esp_err_t handleStartStream(httpd_req_t *req) {
  gStreamEnabled = true;
  // blinkTimes(3);
  return httpd_resp_sendstr(req, "Stream started.");
}

esp_err_t handleStopStream(httpd_req_t *req) {
  gStreamEnabled = false;
  blinkTimes(1);
  return httpd_resp_sendstr(req, "Stream stopped.");
}

esp_err_t handleFlash(httpd_req_t *req) {
  char query[64] = {0};
  char state[16] = {0};
  if (httpd_req_get_url_query_len(req) <= 0 ||
      httpd_req_get_url_query_str(req, query, sizeof(query)) != ESP_OK ||
      httpd_query_key_value(query, "state", state, sizeof(state)) != ESP_OK) {
    httpd_resp_set_status(req, "400 Bad Request");
    return httpd_resp_sendstr(req, "Missing query parameter: state=on|off");
  }

  String value(state);
  value.toLowerCase();
  if (value == "on" || value == "1" || value == "true") {
    setFlash(true);
    return httpd_resp_sendstr(req, "Flash turned on.");
  }
  if (value == "off" || value == "0" || value == "false") {
    setFlash(false);
    return httpd_resp_sendstr(req, "Flash turned off.");
  }

  httpd_resp_set_status(req, "400 Bad Request");
  return httpd_resp_sendstr(req, "Invalid state. Use on|off.");
}

esp_err_t handleHandshake(httpd_req_t *req) {
  return httpd_resp_sendstr(req, HANDSHAKE_UUID);
}

esp_err_t handleRestartServer(httpd_req_t *req) {
  gPendingServerRestart = true;
  gStreamEnabled = false;
  return httpd_resp_sendstr(req, "Server restart scheduled.");
}

esp_err_t handleStream(httpd_req_t *req) {
  if (!gStreamEnabled) {
    httpd_resp_set_status(req, "503 Service Unavailable");
    return httpd_resp_sendstr(req, "Stream is stopped. Call /start-stream first.");
  }

  esp_err_t res = httpd_resp_set_type(req, kStreamMimeType);
  if (res != ESP_OK) {
    return res;
  }
  httpd_resp_set_hdr(req, "Cache-Control", "no-cache");
  httpd_resp_set_hdr(req, "Pragma", "no-cache");
  httpd_resp_set_hdr(req, "Connection", "close");

  while (gStreamEnabled) {
    camera_fb_t *fb = esp_camera_fb_get();
    if (!fb) {
      return ESP_FAIL;
    }

    uint8_t *jpgBuf = fb->buf;
    size_t jpgLen = fb->len;
    bool converted = false;

    if (fb->format != PIXFORMAT_JPEG) {
      converted = frame2jpg(fb, kJpegQuality, &jpgBuf, &jpgLen);
      if (!converted) {
        esp_camera_fb_return(fb);
        return ESP_FAIL;
      }
    }

    char partHeader[64];
    size_t headerLen =
        static_cast<size_t>(snprintf(partHeader, sizeof(partHeader), kStreamPart, (unsigned)jpgLen));

    res = httpd_resp_send_chunk(req, kStreamBoundary, strlen(kStreamBoundary));
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, partHeader, headerLen);
    }
    if (res == ESP_OK) {
      res = httpd_resp_send_chunk(req, reinterpret_cast<const char *>(jpgBuf), jpgLen);
    }

    if (converted) {
      free(jpgBuf);
    }
    esp_camera_fb_return(fb);

    if (res != ESP_OK) {
      break;
    }
    vTaskDelay(kFrameIntervalMs / portTICK_PERIOD_MS);
  }

  httpd_resp_send_chunk(req, nullptr, 0);
  return res;
}

bool startHttpServer() {
  if (gHttpServer != nullptr) {
    return true;
  }

  httpd_config_t config = HTTPD_DEFAULT_CONFIG();
  config.server_port = kHttpPort;
  config.ctrl_port = kHttpPort + 1;
  config.max_open_sockets = 8;
  config.lru_purge_enable = true;
  config.recv_wait_timeout = 15;
  config.send_wait_timeout = 15;

  if (httpd_start(&gHttpServer, &config) != ESP_OK) {
    return false;
  }

  httpd_uri_t indexUri = {.uri = "/", .method = HTTP_GET, .handler = handleIndex, .user_ctx = nullptr};
  httpd_uri_t startUri = {.uri = "/start-stream",
                          .method = HTTP_GET,
                          .handler = handleStartStream,
                          .user_ctx = nullptr};
  httpd_uri_t stopUri = {
      .uri = "/stop-stream", .method = HTTP_GET, .handler = handleStopStream, .user_ctx = nullptr};
  httpd_uri_t flashUri = {.uri = "/flash", .method = HTTP_GET, .handler = handleFlash, .user_ctx = nullptr};
  httpd_uri_t handshakeUri = {
      .uri = "/handshake", .method = HTTP_GET, .handler = handleHandshake, .user_ctx = nullptr};
  httpd_uri_t restartUri = {
      .uri = "/restart-server", .method = HTTP_GET, .handler = handleRestartServer, .user_ctx = nullptr};
  httpd_uri_t streamUri = {.uri = "/stream", .method = HTTP_GET, .handler = handleStream, .user_ctx = nullptr};

  httpd_register_uri_handler(gHttpServer, &indexUri);
  httpd_register_uri_handler(gHttpServer, &startUri);
  httpd_register_uri_handler(gHttpServer, &stopUri);
  httpd_register_uri_handler(gHttpServer, &flashUri);
  httpd_register_uri_handler(gHttpServer, &handshakeUri);
  httpd_register_uri_handler(gHttpServer, &restartUri);
  httpd_register_uri_handler(gHttpServer, &streamUri);

  return true;
}

void stopHttpServer() {
  if (gHttpServer != nullptr) {
    httpd_stop(gHttpServer);
    gHttpServer = nullptr;
  }
}

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("Starting ESP32 camera server...");
  pinMode(kLedPin, OUTPUT);
  digitalWrite(kLedPin, LOW);
  pinMode(kFlashPin, OUTPUT);
  setFlash(false);

  if (!initCamera()) {
    while (true) {
      blinkTimes(2);
      delay(1000);
    }
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(kWifiRetryDelayMs);
    Serial.print(".");
  }
  Serial.println();
  Serial.println("Wi-Fi connected.");

  if (!startHttpServer()) {
    Serial.println("Failed to start HTTP server.");
    while (true) {
      blinkTimes(5);
      delay(1000);
    }
  }

  Serial.print("Server URL: http://");
  Serial.print(WiFi.localIP());
  Serial.print(":");
  Serial.print(kHttpPort);
  Serial.println("/");
}

void loop() {
  if (gPendingServerRestart) {
    gPendingServerRestart = false;
    gStreamEnabled = false;
    stopHttpServer();
    delay(100);
    startHttpServer();
    Serial.println("Server runtime restarted.");
  }
  delay(10);
}
