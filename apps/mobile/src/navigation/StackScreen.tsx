import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  BackHandler,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  SlideInRight,
  SlideOutRight,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { ChevronLeft, X } from "lucide-react-native";
import { Copy, Pressable, colors } from "@morydeals/ui";
import { EDGE_WIDTH, closesOnRelease } from "../product/swipe-back";

/**
 * A pushed screen over the app: it slides in from the right and out when closed, follows a swipe back from the
 * left edge (closing past a third of the screen), and closes on Android back. The header has a back button and
 * a title; `zIndex` orders stacked screens (a later screen above an earlier one).
 */
export function StackScreen({
  title,
  onClose,
  zIndex,
  inSheet = false,
  sheetRoot = false,
  action,
  children,
}: {
  title: string;
  onClose: () => void;
  zIndex: number;
  /** Inside a sheet, which has no status bar to clear. */
  inSheet?: boolean;
  /** The sheet's first screen: it arrives with the sheet, so it neither slides nor swipes back, and closes with ✕. */
  sheetRoot?: boolean;
  /** A control at the header's right (a menu). */
  action?: ReactNode;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const offset = useSharedValue(0);
  // A screen closed by the swipe is already off screen; its exit slide would replay from the start.
  const [swiped, setSwiped] = useState(false);
  const finishSwipe = () => {
    setSwiped(true);
    requestAnimationFrame(onClose);
  };
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 0, width: EDGE_WIDTH })
        .activeOffsetX(10)
        .failOffsetY([-20, 20])
        .onUpdate((event) => {
          offset.value = Math.max(0, event.translationX);
        })
        .onEnd((event) => {
          if (closesOnRelease(event.translationX, event.velocityX, width))
            offset.value = withTiming(width, { duration: 180 }, (done) => {
              if (done) scheduleOnRN(finishSwipe);
            });
          else offset.value = withSpring(0, { damping: 40, stiffness: 420 });
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width],
  );
  // A sheet's own swipe down closes it; no edge swipe competes.
  const none = useMemo(() => Gesture.Pan().enabled(false), []);
  const follow = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onClose]);
  return (
    <GestureDetector gesture={sheetRoot ? none : swipe}>
      <Animated.View
        entering={sheetRoot ? undefined : SlideInRight.duration(240)}
        exiting={sheetRoot || swiped ? undefined : SlideOutRight.duration(200)}
        style={[
          s.root,
          { zIndex, paddingTop: inSheet ? 8 : insets.top },
          follow,
        ]}
      >
        <View style={s.header}>
          <HeaderButton label={sheetRoot ? "Close" : "Back"} onPress={onClose}>
            {sheetRoot ? (
              <X size={20} color={colors.ink} />
            ) : (
              <ChevronLeft size={28} color={colors.ink} />
            )}
          </HeaderButton>
          <Copy weight="bold" numberOfLines={1} style={s.title}>
            {title}
          </Copy>
          <View style={s.headerSpace}>{action}</View>
        </View>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
/** A bare icon in a screen header: no plate, a full 44pt target. */
export function HeaderButton({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      style={s.headerButton}
    >
      {children}
    </Pressable>
  );
}
const s = StyleSheet.create({
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  root: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 4,
    gap: 8,
  },
  title: { flex: 1, textAlign: "center", fontSize: 15, lineHeight: 21 },
  headerSpace: { width: 44 },
});
