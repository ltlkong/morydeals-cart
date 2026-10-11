import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Modal,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Pressable } from "../primitives/Pressable";
import { X } from "lucide-react-native";
import { colors } from "../theme/index";
import { Copy } from "../content/Copy";
import { IconButton } from "../actions/IconButton";

// The card rises like a store page slides in and leaves a little quicker; the backdrop fades on the same clock.
const OPEN = {
  duration: 260,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
const CLOSE = {
  duration: 220,
  easing: Easing.in(Easing.quad),
  reduceMotion: ReduceMotion.System,
};
/** If the closing animation never reports back (a backgrounded app can drop it), the modal unmounts anyway. */
const UNMOUNT_MS = CLOSE.duration + 120;

/**
 * A bottom sheet over the current screen: the dimmed backdrop fades in and out while only the card slides; closing
 * plays out (backdrop fades, card slides down) before the modal unmounts. Reduce Motion skips both animations.
 */
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
  const { height } = useWindowDimensions();
  // Mounted from opening until the closing animation ends.
  const [mounted, setMounted] = useState(visible);
  if (visible && !mounted) setMounted(true);
  // While closing, keep showing what was there: hosts often clear the content together with `visible`.
  const shown = useRef({ title, children });
  if (visible) shown.current = { title, children };
  const progress = useSharedValue(0);
  // Until the card is measured, a screen's height is far enough to start it out of view.
  const cardHeight = useSharedValue(height);
  useEffect(() => {
    if (!mounted) return undefined;
    if (visible) {
      progress.set(withTiming(1, OPEN));
      return undefined;
    }
    const unmount = () => setMounted(false);
    // The field's keyboard goes down with the card instead of waiting for the unmount.
    Keyboard.dismiss();
    progress.set(
      withTiming(0, CLOSE, (finished) => {
        // An interrupted close (reopened meanwhile) keeps the modal.
        if (finished) scheduleOnRN(unmount);
      }),
    );
    const timer = setTimeout(unmount, UNMOUNT_MS);
    return () => clearTimeout(timer);
  }, [visible, mounted, progress]);
  const backdrop = useAnimatedStyle(() => ({ opacity: progress.get() }));
  const card = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.get()) * cardHeight.get() }],
  }));
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
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        // A closing sheet takes no more taps (a second Save, a second close).
        pointerEvents={visible ? "auto" : "none"}
        style={s.frame}
      >
        <Animated.View style={[s.scrim, backdrop]}>
          <Pressable
            pressedScale={1}
            accessibilityRole="button"
            accessibilityLabel="Close dialog"
            onPress={onClose}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          role="dialog"
          aria-label={shown.current.title}
          onLayout={(event) => cardHeight.set(event.nativeEvent.layout.height)}
          style={[s.sheet, card]}
        >
          <View style={s.handle} />
          <View style={s.header}>
            <Copy weight="extra" style={{ fontSize: 23, lineHeight: 30 }}>
              {shown.current.title}
            </Copy>
            <IconButton label="Close" onPress={onClose}>
              <X color={colors.ink} size={20} />
            </IconButton>
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={s.body}
          >
            {shown.current.children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = StyleSheet.create({
  frame: { flex: 1, justifyContent: "flex-end", alignItems: "center" },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.scrim,
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
