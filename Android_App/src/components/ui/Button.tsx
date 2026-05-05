import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
}

export function Button({ title, onPress, variant = "primary", loading = false, disabled = false }: ButtonProps) {
  const isDisabled = disabled || loading;
  const labelStyle = labelStyles[variant];

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      <View style={styles.content}>
        {loading ? <ActivityIndicator color={variant === "primary" ? "#0b0f14" : "#e5e7eb"} size="small" /> : null}
        <Text style={[styles.label, labelStyle]}>{title}</Text>
      </View>
    </Pressable>
  );
}

const labelStyles = {
  primary: { color: "#0b0f14" },
  secondary: { color: "#e5e7eb" },
  danger: { color: "#fee2e2" },
  ghost: { color: "#cbd5e1" },
} as const;

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  label: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  pressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.45,
  },
  primary: {
    backgroundColor: "#f8fafc",
  },
  secondary: {
    backgroundColor: "#111827",
    borderColor: "#334155",
  },
  danger: {
    backgroundColor: "#7f1d1d",
    borderColor: "#fca5a5",
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "#334155",
  },
});
