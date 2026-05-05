import { memo, useMemo } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

import { Card } from "./ui/Card";

interface StreamPreviewProps {
  host: string | null;
  streamUrl: string | null;
  streamVersion: number;
  isStreaming: boolean;
  statusMessage: string;
  variant?: "card" | "full";
}

export const StreamPreview = memo(function StreamPreview({
  host,
  streamUrl,
  streamVersion,
  isStreaming,
  statusMessage,
  variant = "card",
}: StreamPreviewProps) {
  const html = useMemo(() => {
    if (!streamUrl) {
      return "";
    }

    return `
      <!doctype html>
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
          <style>
            html, body {
              margin: 0;
              width: 100%;
              height: 100%;
              background: #020617;
              overflow: hidden;
            }
            body {
              display: flex;
              align-items: center;
              justify-content: center;
            }
            img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              background: #020617;
            }
          </style>
        </head>
        <body>
          <img src="${streamUrl}" alt="ESP32 stream" />
        </body>
      </html>
    `;
  }, [streamUrl]);

  const content = (
    <View style={[styles.previewShell, variant === "full" ? styles.previewShellFull : null]}>
      {streamUrl ? (
        <WebView
          key={`${host ?? "no-host"}-${streamVersion}`}
          source={{ html }}
          originWhitelist={["*"]}
          javaScriptEnabled
          domStorageEnabled={false}
          scrollEnabled={false}
          mixedContentMode="always"
          style={styles.webview}
        />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator color="#e2e8f0" />
          <Text style={styles.placeholderText}>{statusMessage}</Text>
        </View>
      )}
    </View>
  );

  if (variant === "full") {
    return <View style={styles.fullWrap}>{content}</View>;
  }

  return (
    <Card style={styles.card}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Live Stream</Text>
          <Text style={styles.subtitle}>{host ? `http://${host}:8080/stream` : "Waiting for a device"}</Text>
        </View>
        <View style={styles.stateWrap}>
          <Text style={styles.stateText}>{isStreaming ? "Running" : "Paused"}</Text>
        </View>
      </View>

      {content}
    </Card>
  );
});

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  fullWrap: {
    flex: 1,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  subtitle: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 13,
  },
  stateWrap: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: "rgba(148, 163, 184, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.18)",
  },
  stateText: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  previewShell: {
    minHeight: 300,
    borderRadius: 22,
    overflow: "hidden",
    backgroundColor: "#020617",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.16)",
  },
  previewShellFull: {
    flex: 1,
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
  },
  webview: {
    flex: 1,
    backgroundColor: "#020617",
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  placeholderText: {
    color: "#cbd5e1",
    fontSize: 14,
    textAlign: "center",
  },
});
