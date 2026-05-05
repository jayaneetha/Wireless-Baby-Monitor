import { useMemo } from "react";
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import { Badge } from "../components/ui/Badge";
import type { ControllerApi } from "../hooks/useEsp32Controller";

interface SettingsScreenProps {
  controller: ControllerApi;
  onClose: () => void;
}

export default function SettingsScreen({ controller, onClose }: SettingsScreenProps) {
  const {
    state,
    manualHost,
    setManualHost,
    scanForDevice,
    connectManually,
    startStream,
    stopStream,
    setFlashState,
  } = controller;

  const badgeTone = useMemo(() => {
    if (state.errorMessage) {
      return "danger" as const;
    }

    if (state.discoveryState === "scanning" || state.isCommandRunning) {
      return "warning" as const;
    }

    if (state.discoveryState === "ready") {
      return "success" as const;
    }

    return "neutral" as const;
  }, [state.discoveryState, state.errorMessage, state.isCommandRunning]);

  const connectionSummary = useMemo(() => {
    if (state.activeHost) {
      return `Connected to ${state.activeHost}`;
    }

    if (state.subnetPrefix) {
      return `${state.networkSummary} - scanning ${state.subnetPrefix}.x`;
    }

    return state.networkSummary;
  }, [state.activeHost, state.networkSummary, state.subnetPrefix]);

  const canUseManualHost = manualHost.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View>
            <Text style={styles.kicker}>CarBabyCam</Text>
            <Text style={styles.title}>Settings</Text>
            <Text style={styles.subtitle}>Manage connection, streaming, and flash controls.</Text>
          </View>
          <View style={styles.headerAction}>
            <Button title="Back" onPress={onClose} variant="ghost" />
          </View>
        </View>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Connection</Text>
              <Text style={styles.sectionSubtitle}>{connectionSummary}</Text>
            </View>
            <Badge label={state.discoveryState} tone={badgeTone} />
          </View>

          <View style={styles.stack}>
            <Input
              value={manualHost}
              onChangeText={setManualHost}
              placeholder="Manual ESP32 IP, e.g. 192.168.43.64"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="numbers-and-punctuation"
            />

            <View style={styles.buttonRow}>
              <View style={styles.buttonCell}>
                <Button title="Scan hotspot" onPress={() => void scanForDevice()} loading={state.isScanning} />
              </View>
              <View style={styles.buttonCell}>
                <Button
                  title="Connect host"
                  onPress={() => void connectManually()}
                  variant="secondary"
                  disabled={!canUseManualHost}
                  loading={state.isCommandRunning && state.discoveryState === "connecting"}
                />
              </View>
            </View>

            <View style={styles.metaGrid}>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Network</Text>
                <Text style={styles.metaValue}>{state.networkSummary}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Local IP</Text>
                <Text style={styles.metaValue}>{state.localIp ?? "Unknown"}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Subnet</Text>
                <Text style={styles.metaValue}>{state.subnetPrefix ? `${state.subnetPrefix}.x` : "Unknown"}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Stream</Text>
                <Text style={styles.metaValue}>{state.isStreaming ? "Running" : "Stopped"}</Text>
              </View>
              <View style={styles.metaItem}>
                <Text style={styles.metaLabel}>Flash</Text>
                <Text style={styles.metaValue}>{state.flashState}</Text>
              </View>
            </View>
          </View>
        </Card>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Controls</Text>
              <Text style={styles.sectionSubtitle}>The stream will pause before control commands and resume afterwards.</Text>
            </View>
            {state.isCommandRunning ? <Badge label="busy" tone="warning" /> : null}
          </View>

          <View style={styles.buttonGrid}>
            <Button title="Start stream" onPress={() => void startStream()} variant="primary" disabled={!state.activeHost || state.isStreaming} loading={state.isCommandRunning} />
            <Button title="Stop stream" onPress={() => void stopStream()} variant="secondary" disabled={!state.activeHost || !state.isStreaming} loading={state.isCommandRunning} />
            <Button title="Flash on" onPress={() => void setFlashState("on")} variant="danger" disabled={!state.activeHost} loading={state.isCommandRunning} />
            <Button title="Flash off" onPress={() => void setFlashState("off")} variant="ghost" disabled={!state.activeHost} loading={state.isCommandRunning} />
          </View>

          <View style={styles.statusBlock}>
            <Text style={styles.statusLabel}>Status</Text>
            <Text style={styles.statusValue}>{state.statusMessage}</Text>
            {state.errorMessage ? <Text style={styles.errorValue}>{state.errorMessage}</Text> : null}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
  scrollContent: {
    padding: 18,
    gap: 16,
    paddingBottom: 32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 16,
  },
  headerAction: {
    minWidth: 96,
  },
  kicker: {
    color: "#93c5fd",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 1.8,
    textTransform: "uppercase",
  },
  title: {
    color: "#f8fafc",
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
  },
  subtitle: {
    color: "#94a3b8",
    fontSize: 14,
    lineHeight: 20,
    marginTop: 6,
  },
  sectionCard: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitle: {
    color: "#f8fafc",
    fontSize: 18,
    fontWeight: "800",
  },
  sectionSubtitle: {
    marginTop: 4,
    color: "#94a3b8",
    fontSize: 13,
    lineHeight: 19,
  },
  stack: {
    gap: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
  },
  buttonCell: {
    flex: 1,
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  metaItem: {
    flexBasis: "48%",
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.14)",
    gap: 6,
  },
  metaLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#f8fafc",
    fontSize: 15,
    fontWeight: "700",
  },
  buttonGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  statusBlock: {
    gap: 6,
    borderRadius: 18,
    padding: 14,
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.14)",
  },
  statusLabel: {
    color: "#94a3b8",
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  statusValue: {
    color: "#e2e8f0",
    fontSize: 14,
    lineHeight: 20,
  },
  errorValue: {
    color: "#fca5a5",
    fontSize: 13,
    lineHeight: 20,
  },
});
