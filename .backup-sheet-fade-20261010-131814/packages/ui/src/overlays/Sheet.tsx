import { useEffect } from "react";
import type { ReactNode } from "react";
import {
  Modal,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
} from "react-native";
import { Pressable } from "../primitives/Pressable";
import { X } from "lucide-react-native";
import { colors } from "../theme/index";
import { Copy } from "../content/Copy";
import { IconButton } from "../actions/IconButton";

export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (Platform.OS !== "web" || !visible) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", close);
    return () => globalThis.removeEventListener("keydown", close);
  }, [visible, onClose]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={s.scrim}
      >
        <Pressable
          pressedScale={1}
          accessibilityRole="button"
          accessibilityLabel="Close dialog"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View
          accessibilityViewIsModal
          role="dialog"
          aria-label={title}
          style={s.sheet}
        >
          <View style={s.handle} />
          <View style={s.header}>
            <Copy weight="extra" style={{ fontSize: 23, lineHeight: 30 }}>
              {title}
            </Copy>
            <IconButton label="Close" onPress={onClose}>
              <X color={colors.ink} size={20} />
            </IconButton>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.body}
          >
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: colors.scrim,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "92%",
    backgroundColor: colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    overflow: "hidden",
  },
  handle: {
    height: 4,
    width: 34,
    borderRadius: 2,
    backgroundColor: colors.lineStrong,
    alignSelf: "center",
    marginBottom: 6,
  },
  header: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  body: { paddingHorizontal: 22, paddingBottom: 42, gap: 18 },
});
