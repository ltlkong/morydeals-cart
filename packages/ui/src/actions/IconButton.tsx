import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Pressable } from "../primitives/Pressable";
import { colors } from "../theme/index";

export function IconButton({
  label,
  onPress,
  children,
  style,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={({ hovered, focused }) => [
        s.iconButton,
        (hovered || focused) && {
          backgroundColor: colors.accentSoft,
          borderColor: colors.chipLine,
        },
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}
const s = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    backgroundColor: colors.surface,
  },
});
