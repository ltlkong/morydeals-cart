import type { ReactNode } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Copy, colors } from "@morydeals/ui";

/**
 * A native page sheet (swipe down to close) with an iOS-style bar: Cancel on the left, the title, and an
 * optional confirm action on the right. A modal is its own native root, so gestures inside get their own root.
 */
export function SheetScreen({
  visible,
  title,
  onClose,
  cancel = "Cancel",
  confirm,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  cancel?: string;
  confirm?: { label: string; disabled?: boolean; onPress: () => void };
  children: ReactNode;
}) {
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={s.root}>
        <View style={s.bar}>
          <BarButton label={cancel} onPress={onClose} />
          <Copy weight="extra" numberOfLines={1} style={s.title}>
            {title}
          </Copy>
          {confirm ? (
            <BarButton
              label={confirm.label}
              strong
              disabled={confirm.disabled}
              onPress={confirm.onPress}
            />
          ) : (
            <View style={s.side} />
          )}
        </View>
        {children}
      </GestureHandlerRootView>
    </Modal>
  );
}
function BarButton({
  label,
  strong = false,
  disabled = false,
  onPress,
}: {
  label: string;
  strong?: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={s.side}
    >
      <Copy
        weight={strong ? "extra" : "semibold"}
        style={[
          s.barLabel,
          strong && { color: colors.accentInk },
          disabled && { color: colors.faint },
          strong ? { textAlign: "right" } : null,
        ]}
      >
        {label}
      </Copy>
    </Pressable>
  );
}
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  side: { width: 80 },
  title: { flex: 1, textAlign: "center", fontSize: 17, lineHeight: 23 },
  barLabel: { fontSize: 16, lineHeight: 22, color: colors.ink },
});
