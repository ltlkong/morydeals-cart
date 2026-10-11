import { useEffect } from "react";
import {
  cancelAnimation,
  Easing,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
  useReducedMotion,
} from "react-native-reanimated";

import { useMotionPaused } from "./motion-pause";

/**
 * One looping clock, 0 → 1 every `durationMs`, that a whole illustration reads its timing from, so its
 * parts stay in step however long it runs; `delayMs` holds it at 0 first (while an entrance plays). With Reduce Motion on it stands still at `restAt`, the
 * moment the illustration reads best as a still. Out of view (MotionPause) it stops where it is and resumes when shown.
 */
export function useClock(
  durationMs: number,
  restAt: number,
  delayMs = 0,
): SharedValue<number> {
  const reduced = useReducedMotion();
  const paused = useMotionPaused();
  const clock = useSharedValue(reduced ? restAt : 0);

  useEffect(() => {
    if (reduced) {
      clock.set(restAt);
      return;
    }
    if (paused) {
      cancelAnimation(clock);
      return;
    }
    clock.set(0);
    clock.set(
      withDelay(
        delayMs,
        withRepeat(
          withTiming(1, { duration: durationMs, easing: Easing.linear }),
          -1,
        ),
      ),
    );
    return () => cancelAnimation(clock);
  }, [clock, durationMs, restAt, delayMs, reduced, paused]);

  return clock;
}
