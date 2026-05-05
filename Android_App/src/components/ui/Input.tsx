import { forwardRef } from "react";
import { StyleSheet, TextInput, type TextInputProps } from "react-native";

export const Input = forwardRef<TextInput, TextInputProps>(function Input(props, ref) {
  return <TextInput ref={ref} placeholderTextColor="#64748b" style={styles.input} {...props} />;
});

const styles = StyleSheet.create({
  input: {
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#334155",
    backgroundColor: "#020617",
    color: "#e2e8f0",
    paddingHorizontal: 14,
    fontSize: 15,
  },
});
