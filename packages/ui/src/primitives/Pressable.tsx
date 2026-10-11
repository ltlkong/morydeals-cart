import { useState } from "react";

// The one place React Native's Pressable is imported.
import {
  Pressable as NativePressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const AnimatedPressable = Animated.createAnimatedComponent(NativePressable);

/** How far a pressed control shrinks: enough to feel, small enough that a full-width card doesn't jump. */
export const PRESSED_SCALE = 0.96;
const PRESS_IN = { duration: 90, reduceMotion: ReduceMotion.System };
// The release eases back without overshoot: a press settles, it never bounces.
const RELEASE = {
  duration: 160,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};

/**
 * The press zoom as a reusable piece: `style` scales whatever it is applied to, `pressIn`/`pressOut` drive it.
 * Pressable zooms itself with it; a control whose visible body is larger than its touch target (a card whose
 * frame holds the target and a row of buttons) applies `style` to that body instead.
 */
export function usePressScale(pressedScale = PRESSED_SCALE) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));
  return {
    style,
    pressIn: () => scale.set(withTiming(pressedScale, PRESS_IN)),
    pressOut: () => scale.set(withTiming(1, RELEASE)),
  };
}

/** What a style function sees: held, and (web) under the pointer or focused. */
export type PressState = {
  pressed: boolean;
  hovered: boolean;
  focused: boolean;
};

type Props = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle> | ((state: PressState) => StyleProp<ViewStyle>);
  /** The scale while held; 1 turns the zoom off (a full-screen scrim, say). */
  pressedScale?: number;
};

/**
 * The app's one Pressable: React Native's, plus a short zoom while it is held, so every control answers
 * the finger the same way. Takes every Pressable prop, a `({ pressed }) => style` function included.
 * The zoom follows the system's Reduce Motion setting.
 */
export function Pressable({
  pressedScale = PRESSED_SCALE,
  style,
  onPressIn,
  onPressOut,
  onHoverIn,
  onHoverOut,
  onFocus,
  onBlur,
  ...rest
}: Props) {
  const zoom = usePressScale(pressedScale);
  // Only a style function needs the pressed state as React state; the zoom itself runs on the UI thread.
  const [pressed, setPressed] = useState(false);
  // Web pointer hover, for style functions that show it (native never hovers).
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  function pressIn(event: GestureResponderEvent): void {
    zoom.pressIn();
    if (typeof style === "function") setPressed(true);
    onPressIn?.(event);
  }

  function pressOut(event: GestureResponderEvent): void {
    zoom.pressOut();
    if (typeof style === "function") setPressed(false);
    onPressOut?.(event);
  }

  const state: PressState = { pressed, hovered, focused };
  const resolved: StyleProp<ViewStyle> =
    typeof style === "function" ? style(state) : style;
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={pressIn}
      onPressOut={pressOut}
      onFocus={(event) => {
        if (typeof style === "function") setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        if (typeof style === "function") setFocused(false);
        onBlur?.(event);
      }}
      onHoverIn={(event) => {
        if (typeof style === "function") setHovered(true);
        onHoverIn?.(event);
      }}
      onHoverOut={(event) => {
        if (typeof style === "function") setHovered(false);
        onHoverOut?.(event);
      }}
      style={[resolved, zoom.style]}
    />
  );
}
