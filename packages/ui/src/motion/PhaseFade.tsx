import { type ReactNode, useEffect, useState } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** Where a new phase starts: a little faint and small, then it settles to full size. */
const FROM_OPACITY = 0.35;
const FROM_SCALE = 0.96;
const ARRIVE = {
  duration: 240,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
/** After the animation should have ended, the layer is made plain and fully opaque from React state, whatever the animation did. */
const SETTLE_MS = ARRIVE.duration + 120;

type Props = {
  /** Which phase this is (e.g. coupon, copied, buy): a change makes the new content arrive; the first one just shows. */
  version: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
};

/**
 * One piece of content that changes in place (the coupon button becoming the buy button): each new phase rises from slightly
 * faint and small to full. Unlike an animation-only fade, the end state does not depend on the animation completing (a
 * frozen or backgrounded screen can interrupt it): a timer switches to plain styles at full opacity.
 */
export function PhaseFade({ version, style, children }: Props) {
  // The phase there from the start just shows; each later one arrives (derived from the previous render, as ContentSwap does).
  const [current, setCurrent] = useState({ version, animate: false });
  if (current.version !== version) setCurrent({ version, animate: true });
  return (
    <Layer key={current.version} animate={current.animate} style={style}>
      {children}
    </Layer>
  );
}

function Layer({
  animate: animateNow,
  style,
  children,
}: {
  animate: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  // Decided when this layer appears.
  const [animate] = useState(animateNow);
  const opacity = useSharedValue(animate ? FROM_OPACITY : 1);
  const scale = useSharedValue(animate ? FROM_SCALE : 1);
  const [settled, setSettled] = useState(!animate);
  useEffect(() => {
    if (!animate) return undefined;
    opacity.set(withTiming(1, ARRIVE));
    scale.set(withTiming(1, ARRIVE));
    const timer = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [animate, opacity, scale]);
  const arriving = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ scale: scale.get() }],
  }));
  // The same element type either way, so settling does not remount (or drop a press on) the content.
  return (
    <Animated.View style={settled ? style : [style, arriving]}>
      {children}
    </Animated.View>
  );
}
