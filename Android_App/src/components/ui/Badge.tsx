import { StyleSheet, Text, View } from "react-native";

interface BadgeProps {
  label: string;
  tone?: "neutral" | "success" | "warning" | "danger";
}

export function Badge({ label, tone = "neutral" }: BadgeProps) {
  return (
    <View style={[styles.base, styles[tone]]}>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  label: {
    color: "#e2e8f0",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  neutral: {
    backgroundColor: "rgba(148, 163, 184, 0.12)",
    borderColor: "rgba(148, 163, 184, 0.24)",
  },
  success: {
    backgroundColor: "rgba(16, 185, 129, 0.16)",
    borderColor: "rgba(16, 185, 129, 0.28)",
  },
  warning: {
    backgroundColor: "rgba(245, 158, 11, 0.16)",
    borderColor: "rgba(245, 158, 11, 0.28)",
  },
  danger: {
    backgroundColor: "rgba(239, 68, 68, 0.16)",
    borderColor: "rgba(239, 68, 68, 0.28)",
  },
});
