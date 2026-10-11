import { useEffect } from "react";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  useReducedMotion,
} from "react-native-reanimated";

import * as Haptics from "../lib/haptics";

/**
 * Mory's entrance, as a short clip: it falls into the frame and lands with a squash, a puff of dust and
 * a heavy thump in the hand; a beat later the orange drops onto its head and bounces three times, each
 * bounce a lighter tap. Every haptic lands on the frame its landing does (the times below are the
 * animations' own). The whole entrance lasts ENTRANCE_MS; with Reduce Motion it is skipped, still.
 */
/** After the screen has faded in (the intro fades, 180 ms). */
const START = 260;
const FALL = 420;
const LANDED = START + FALL;
const ORANGE_START = LANDED + 200;
const ORANGE_FALL = 460;
/** Easing.bounce touches down at these fractions of its run. */
const BOUNCES = [0.3636, 0.7273, 0.9091];
export const ENTRANCE_MS = ORANGE_START + ORANGE_FALL + 120;

const TAPS: [number, Haptics.ImpactFeedbackStyle][] = [
  [LANDED, Haptics.ImpactFeedbackStyle.Heavy],
  [
    ORANGE_START + BOUNCES[0]! * ORANGE_FALL,
    Haptics.ImpactFeedbackStyle.Medium,
  ],
  [ORANGE_START + BOUNCES[1]! * ORANGE_FALL, Haptics.ImpactFeedbackStyle.Light],
  [ORANGE_START + BOUNCES[2]! * ORANGE_FALL, Haptics.ImpactFeedbackStyle.Soft],
];

/**
 * Returns null when there is no entrance to play; else `orangeLift` (1 while the orange is out of frame
 * above, 0 seated), the body's fall-and-squash style (pivot at its feet), the ground shadow's style and
 * the dust puff's style.
 */
export function useDropIn(enabled: boolean, height: number) {
  const reduced = useReducedMotion();
  const playing = enabled && !reduced;
  const fall = useSharedValue(playing ? 1 : 0);
  const squash = useSharedValue(0);
  const dust = useSharedValue(0);
  const orangeLift = useSharedValue(playing ? 1 : 0);

  useEffect(() => {
    if (!playing) return;
    fall.set(
      withDelay(
        START,
        withTiming(0, { duration: FALL, easing: Easing.in(Easing.quad) }),
      ),
    );
    squash.set(
      withDelay(
        LANDED,
        withSequence(
          withTiming(1, { duration: 70 }),
          withSpring(0, { damping: 7, stiffness: 260 }),
        ),
      ),
    );
    dust.set(
      withDelay(
        LANDED,
        withSequence(
          withTiming(0, { duration: 0 }),
          withTiming(1, { duration: 520 }),
        ),
      ),
    );
    orangeLift.set(
      withDelay(
        ORANGE_START,
        withTiming(0, { duration: ORANGE_FALL, easing: Easing.bounce }),
      ),
    );
    const timers = TAPS.map(([at, style]) =>
      setTimeout(() => void Haptics.impactAsync(style), at),
    );
    return () => timers.forEach(clearTimeout);
  }, [playing, fall, squash, dust, orangeLift]);

  const bodyStyle = useAnimatedStyle(() => ({
    transform: [
      // From well above the top of the screen.
      { translateY: -fall.get() * height * 3 },
      // Stretched a little while falling, squashed wide on impact.
      { scaleX: 1 + 0.16 * squash.get() - 0.06 * fall.get() },
      { scaleY: 1 - 0.2 * squash.get() + 0.08 * fall.get() },
    ],
  }));
  const shadowStyle = useAnimatedStyle(() => ({
    opacity: 1 - 0.7 * fall.get(),
    transform: [{ scaleX: 1 - 0.6 * fall.get() + 0.15 * squash.get() }],
  }));
  const dustStyle = useAnimatedStyle(() => ({
    opacity: dust.get() > 0 && dust.get() < 1 ? 0.55 * (1 - dust.get()) : 0,
    transform: [
      { translateX: dust.get() * height * 0.28 },
      { scale: 0.4 + dust.get() },
    ],
  }));

  return playing ? { orangeLift, bodyStyle, shadowStyle, dustStyle } : null;
}
