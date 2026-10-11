import type { ReactNode } from "react";
import {
  View,
  StyleSheet,
  ActivityIndicator,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Pressable } from "../primitives/Pressable";
import { Copy } from "../content/Copy";
import { colors } from "../theme/index";

/** `checked` turns the button into an accessible toggle. */
export function Button({
  children,
  onPress,
  secondary = false,
  danger = false,
  disabled = false,
  loading = false,
  icon,
  style,
  label,
  checked,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
  label?: string;
  checked?: boolean;
}) {
  const inactive = disabled || loading;
  const ink = disabled
    ? colors.faint
    : secondary
      ? danger
        ? colors.danger
        : colors.ink
      : colors.onAccent;
  return (
    <Pressable
      accessibilityRole={checked === undefined ? "button" : "checkbox"}
      accessibilityLabel={label ?? children}
      accessibilityState={{ disabled: inactive, busy: loading, checked }}
      disabled={inactive}
      onPress={onPress}
      pressedScale={0.97}
      style={({ hovered, focused }) => [
        s.button,
        secondary && s.secondary,
        danger && { borderColor: colors.danger },
        hovered &&
          !inactive && {
            backgroundColor: secondary ? colors.accentSoft : colors.accentDeep,
          },
        focused && { borderColor: colors.ink },
        disabled && s.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={ink} />
      ) : icon ? (
        <View
          style={[
            s.buttonIcon,
            {
              backgroundColor: disabled
                ? colors.line
                : secondary
                  ? colors.surfaceSunken
                  : "rgba(255,255,255,0.14)",
            },
          ]}
        >
          {icon}
        </View>
      ) : null}
      <Copy weight="bold" style={{ color: ink, fontSize: 14 }}>
        {children}
      </Copy>
    </Pressable>
  );
}
const s = StyleSheet.create({
  button: {
    minHeight: 44,
    borderRadius: 999,
    backgroundColor: colors.accentInk,
    borderWidth: 1,
    borderColor: colors.accentInk,
    flexDirection: "row",
    gap: 9,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 17,
    paddingVertical: 9,
  },
  buttonIcon: {
    width: 27,
    height: 27,
    borderRadius: 999,
    justifyContent: "center",
    alignItems: "center",
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.lineStrong,
  },
  disabled: { backgroundColor: colors.surfaceSunken, borderColor: colors.line },
});
