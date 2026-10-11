import Heart from "lucide-react-native/icons/heart";
import { StyleSheet } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";

import { MORY_COLORS } from "../theme/mory";
import { colors } from "../theme/tokens";

/** Where an effect sits in Mory's box, as fractions of it. */
export type Spot = { x: number; y: number };

type EffectProps = {
  clock: SharedValue<number>;
  at: Spot;
  size: number;
  phase?: number;
};

function place(at: Spot) {
  return { left: `${at.x * 100}%` as const, top: `${at.y * 100}%` as const };
}

/** A four-point sparkle that twinkles at its own point of the loop. */
export function Sparkle({ clock, at, size, phase = 0 }: EffectProps) {
  const style = useAnimatedStyle(() => {
    const t = (clock.get() + phase) % 1;
    return {
      opacity: interpolate(t, [0, 0.15, 0.35, 0.5], [0, 1, 1, 0], "clamp"),
      transform: [
        { scale: interpolate(t, [0, 0.15, 0.5], [0.3, 1, 0.6], "clamp") },
        { rotate: `${t * 90}deg` },
      ],
    };
  });
  return (
    <Animated.View style={[styles.spot, place(at), style]}>
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M12 0 C 13 8, 16 11, 24 12 C 16 13, 13 16, 12 24 C 11 16, 8 13, 0 12 C 8 11, 11 8, 12 0 Z"
          fill={MORY_COLORS.orange}
        />
      </Svg>
    </Animated.View>
  );
}

/** A camera flash: a white burst at the start of each loop, centred on `at`. */
export function Flash({ clock, at, size }: EffectProps) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(clock.get(), [0, 0.02, 0.12], [0, 0.95, 0], "clamp"),
    transform: [
      { scale: interpolate(clock.get(), [0, 0.12], [0.3, 3.2], "clamp") },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.spot,
        styles.flash,
        place(at),
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: -size / 2,
          marginTop: -size / 2,
        },
        style,
      ]}
    />
  );
}

/** A heart rising and fading, drifting side to side. */
export function RisingHeart({ clock, at, size, phase = 0 }: EffectProps) {
  const style = useAnimatedStyle(() => {
    const t = (clock.get() + phase) % 1;
    return {
      opacity: interpolate(t, [0, 0.15, 0.6, 0.8], [0, 1, 1, 0], "clamp"),
      transform: [
        { translateY: interpolate(t, [0, 0.8], [0, -size * 3], "clamp") },
        { translateX: (size / 3) * Math.sin(t * Math.PI * 3) },
        { scale: interpolate(t, [0, 0.3], [0.5, 1], "clamp") },
      ],
    };
  });
  return (
    <Animated.View style={[styles.spot, place(at), style]}>
      <Heart size={size} color={colors.accent} fill={colors.accent} />
    </Animated.View>
  );
}

/** A speech bubble with a heart that pops up, holds, and goes, once a loop. */
export function HeartPop({ clock, at, size }: EffectProps) {
  const style = useAnimatedStyle(() => {
    const t = clock.get();
    return {
      opacity: interpolate(t, [0.3, 0.36, 0.8, 0.88], [0, 1, 1, 0], "clamp"),
      transform: [
        { scale: interpolate(t, [0.3, 0.38, 0.44], [0.2, 1.15, 1], "clamp") },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.spot,
        styles.bubble,
        place(at),
        { width: size, height: size, borderRadius: size / 2 },
        style,
      ]}
    >
      <Heart size={size * 0.52} color={colors.accent} fill={colors.accent} />
    </Animated.View>
  );
}

/** A thought bubble whose three dots light one after another: Mory is looking (loading, searching). */
export function ThinkingDots({ clock, at, size }: EffectProps) {
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.spot,
        styles.thought,
        place(at),
        {
          width: size,
          height: size * 0.56,
          borderRadius: size * 0.28,
          gap: size * 0.08,
        },
      ]}
    >
      {[0, 1, 2].map((dot) => (
        <ThinkingDot key={dot} clock={clock} index={dot} size={size * 0.15} />
      ))}
    </Animated.View>
  );
}
function ThinkingDot({
  clock,
  index,
  size,
}: {
  clock: SharedValue<number>;
  index: number;
  size: number;
}) {
  const style = useAnimatedStyle(() => {
    // Each dot rises and darkens in its own third of every half turn.
    const t = (clock.get() * 2 - index / 3 + 1) % 1;
    const lit = interpolate(t, [0, 0.18, 0.36], [0, 1, 0], "clamp");
    return {
      opacity: 0.3 + 0.7 * lit,
      transform: [{ translateY: -size * 0.35 * lit }],
    };
  });
  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: MORY_COLORS.outline,
        },
        style,
      ]}
    />
  );
}

/** Two ring marks either side of a bell, flashing out while it rings (see ringAngle). */
export function RingLines({ clock, at, size }: EffectProps) {
  const style = useAnimatedStyle(() => {
    const t = clock.get();
    return {
      opacity: interpolate(t, [0, 0.04, 0.3, 0.38], [0, 1, 1, 0], "clamp"),
      transform: [
        { scale: interpolate(t, [0, 0.08, 0.38], [0.7, 1, 1.12], "clamp") },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.spot,
        place(at),
        { marginLeft: -size / 2, marginTop: -size / 2 },
        style,
      ]}
    >
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Path
          d="M14 30 Q6 50 14 70 M26 38 Q22 50 26 62 M86 30 Q94 50 86 70 M74 38 Q78 50 74 62"
          fill="none"
          stroke={MORY_COLORS.orange}
          strokeWidth={4.5}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  spot: { position: "absolute" },
  flash: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFF6C9",
    shadowOpacity: 1,
    shadowRadius: 18,
  },
  thought: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: MORY_COLORS.outline,
  },
  bubble: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: MORY_COLORS.outline,
  },
});
