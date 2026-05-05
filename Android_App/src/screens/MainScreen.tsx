import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

import { StreamPreview } from "../components/StreamPreview";
import type { ControllerApi } from "../hooks/useEsp32Controller";

const FLASH_CONTROLS_HIDE_MS = 30000;

interface MainScreenProps {
  controller: ControllerApi;
  onOpenSettings: () => void;
}

export default function MainScreen({ controller, onOpenSettings }: MainScreenProps) {
  const { state, streamUrl, setFlashState } = controller;
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      setControlsVisible(false);
    }, FLASH_CONTROLS_HIDE_MS);
  }, [clearHideTimer]);

  const handleVideoTap = useCallback(() => {
    setControlsVisible(true);
    scheduleHide();
  }, [scheduleHide]);

  const nextFlashState = useMemo(() => (state.flashState === "on" ? "off" : "on"), [state.flashState]);
  const flashLabel = useMemo(() => (nextFlashState === "on" ? "Flash on" : "Flash off"), [nextFlashState]);
  const flashDisabled = !state.activeHost || state.isCommandRunning;

  const handleFlashPress = useCallback(() => {
    if (flashDisabled) {
      return;
    }

    void setFlashState(nextFlashState);
    scheduleHide();
  }, [flashDisabled, nextFlashState, scheduleHide, setFlashState]);

  const handleOpenSettings = useCallback(() => {
    clearHideTimer();
    setControlsVisible(false);
    onOpenSettings();
  }, [clearHideTimer, onOpenSettings]);

  useEffect(() => {
    if (!controlsVisible) {
      return;
    }

    scheduleHide();
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer, controlsVisible, scheduleHide]);

  useEffect(() => {
    return () => {
      clearHideTimer();
    };
  }, [clearHideTimer]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.container}>
        <StreamPreview
          host={state.activeHost}
          streamUrl={streamUrl}
          streamVersion={state.streamVersion}
          isStreaming={state.isStreaming}
          statusMessage={state.statusMessage}
          variant="full"
        />

        <View pointerEvents="box-none" style={styles.overlay}>
          <Pressable style={styles.tapLayer} onPress={handleVideoTap} />
          {controlsVisible ? (
            <View style={styles.controls} pointerEvents="box-none">
              <Pressable
                accessibilityRole="button"
                onPress={handleFlashPress}
                disabled={flashDisabled}
                style={({ pressed }) => [
                  styles.overlayButton,
                  flashDisabled ? styles.overlayButtonDisabled : null,
                  pressed && !flashDisabled ? styles.overlayButtonPressed : null,
                ]}
              >
                <Text style={styles.overlayButtonText}>{flashLabel}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={handleOpenSettings}
                style={({ pressed }) => [
                  styles.overlayButton,
                  pressed ? styles.overlayButtonPressed : null,
                ]}
              >
                <Text style={styles.overlayButtonText}>Settings</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#020617",
  },
  container: {
    flex: 1,
    backgroundColor: "#020617",
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
  },
  tapLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  controls: {
    zIndex: 2,
    padding: 16,
    gap: 12,
    alignItems: "flex-end",
  },
  overlayButton: {
    minWidth: 120,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "rgba(15, 23, 42, 0.9)",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.3)",
  },
  overlayButtonText: {
    color: "#e2e8f0",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  overlayButtonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.88,
  },
  overlayButtonDisabled: {
    opacity: 0.45,
  },
});
