import { type ReactNode, useLayoutEffect, useRef } from "react";
import type { StyleProp, ViewStyle } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** A new page starts a little low and faint, then rises into place. */
const FROM_Y = 22;
const DURATION_MS = 260;
/** Both ease out; the opacity's gentler curve keeps a visible faint stage at the start. */
const RISE = {
  duration: DURATION_MS,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
};
const APPEAR = {
  duration: DURATION_MS,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
};

/**
 * Fades the content up whenever `page` changes (the first page just shows). Only this wrapper animates; the children are
 * not remounted, so pages keep their state across switches.
 */
export function PageFade({
  page,
  style,
  children,
}: {
  page: string;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const opacity = useSharedValue(1);
  const y = useSharedValue(0);
  const first = useRef(true);
  // Before paint, so the new page never flashes at full opacity first.
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    opacity.set(0);
    y.set(FROM_Y);
    // Rise once the new page is on screen: mounting a heavy page can take longer than the animation itself, which would
    // otherwise finish unseen. Two frames: the first lands after the commit, the second after it is drawn.
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        opacity.set(withTiming(1, APPEAR));
        y.set(withTiming(0, RISE));
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [page, opacity, y]);
  const arriving = useAnimatedStyle(() => ({
    opacity: opacity.get(),
    transform: [{ translateY: y.get() }],
  }));
  // The animated style stays attached: swapping it in on the switch let the new page paint solid for a frame first.
  // A later switch restarts from faint, so a cancelled start never leaves the page hidden.
  return <Animated.View style={[style, arriving]}>{children}</Animated.View>;
}
