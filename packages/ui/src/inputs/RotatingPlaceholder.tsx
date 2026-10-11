import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";

import { colors } from "../theme/tokens";
import { font } from "../theme/typography";

const LINE_HEIGHT = 20;

type Props = {
  hints: readonly string[];
  /** How long each hint stays before the next rolls in. */
  intervalMs?: number;
  /** Hold the current hint (the screen is not showing). */
  paused?: boolean;
};

/**
 * A search pill's placeholder: the hints roll upward one after another, each rising in from below as the last one
 * leaves through the top. Product words to try, not claims about stock or price.
 */
export function RotatingPlaceholder({
  hints,
  intervalMs = 3000,
  paused = false,
}: Props) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (paused || hints.length < 2) return;
    const timer = setInterval(
      () => setIndex((current) => (current + 1) % hints.length),
      intervalMs,
    );
    return () => clearInterval(timer);
  }, [paused, hints.length, intervalMs]);
  return (
    <View style={styles.window}>
      {/* A new key per hint lets the old line play its exit while the new one enters. */}
      <Animated.Text
        key={index}
        entering={FadeInDown.duration(350)}
        exiting={FadeOutUp.duration(350)}
        style={styles.hint}
        numberOfLines={1}
      >
        {hints[index % hints.length]}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Clips the rising lines to one row, so they appear from and vanish into the pill's middle. Its height is the row's:
  // a flexible height would fill the pill and leave the text at the top.
  window: { height: LINE_HEIGHT, overflow: "hidden" },
  hint: {
    position: "absolute",
    left: 0,
    right: 0,
    lineHeight: LINE_HEIGHT,
    fontFamily: font.semibold,
    fontSize: 14,
    color: colors.muted,
  },
});
