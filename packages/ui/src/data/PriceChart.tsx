import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import Svg, {
  G,
  Circle,
  Defs,
  Line,
  LinearGradient,
  Path,
  Stop,
} from "react-native-svg";
import { scheduleOnRN } from "react-native-worklets";

import { colors, fonts, radius, space } from "../theme/index";
import { chartGeometry, dayAt, type PriceDay } from "./price-history";

export type PriceChartProps = {
  /** One entry per day, oldest first (see `dailyPrices`); null days draw no line. */
  days: readonly PriceDay[];
  /** Minor units to a label; the host chooses currency and precision. */
  formatAmount: (amount: number) => string;
  formatDay: (day: number) => string;
  height?: number;
  /** A tick (haptics) each time the scrubbed day changes. */
  onStep?: () => void;
};

const LABEL_ROW = 22;
/** Room at each side so the end dot and the line's caps are not clipped by the frame. */
const INSET = 8;
const DOT = 12;

/**
 * A price history as a step line with a soft gradient under it. Dragging sideways (or tapping) shows a guide, the
 * day's price and its date; the guide follows the finger on the UI thread, vertical swipes still scroll the page.
 */
export function PriceChart({
  days,
  formatAmount,
  formatDay,
  height = 180,
  onStep,
}: PriceChartProps) {
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const geometry = useMemo(
    () =>
      width > INSET * 2
        ? chartGeometry(days, { width: width - INSET * 2, height })
        : null,
    [days, width, height],
  );
  // Plain arrays for the worklets: positions of each day's point.
  const points = useMemo(
    () =>
      days.map((day, index) =>
        geometry && day.amountMinor !== null
          ? [INSET + geometry.x(index), geometry.y(day.amountMinor)]
          : [0, 0],
      ),
    [days, geometry],
  );
  const index = useSharedValue(-1);
  const pick = (at: number) => {
    setActive(at < 0 ? null : at);
    if (at >= 0) onStep?.();
  };
  const scrub = (x: number) => {
    "worklet";
    const at = dayAt(x - INSET, days, width - INSET * 2);
    if (at === index.value) return;
    index.value = at;
    scheduleOnRN(pick, at);
  };
  const release = () => {
    "worklet";
    index.value = -1;
    scheduleOnRN(pick, -1);
  };
  const gesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Pan()
          .activeOffsetX([-6, 6])
          .failOffsetY([-12, 12])
          .onStart((event) => scrub(event.x))
          .onUpdate((event) => scrub(event.x))
          .onFinalize(release),
        Gesture.Tap().onEnd((event) => scrub(event.x)),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, width],
  );
  const guide = useAnimatedStyle(() => {
    const point = points[index.value];
    return {
      opacity: point ? 1 : 0,
      transform: [{ translateX: point ? point[0]! : 0 }],
    };
  });
  const dot = useAnimatedStyle(() => {
    const point = points[index.value];
    return {
      opacity: point ? 1 : 0,
      transform: [
        { translateX: (point ? point[0]! : 0) - DOT / 2 },
        { translateY: (point ? point[1]! : 0) - DOT / 2 },
      ],
    };
  });

  const first = 0;
  const last = days.length - 1;
  const end = days[last]?.amountMinor ?? null;
  const shown = active === null ? null : days[active];
  const tooltipLeft =
    active === null || !geometry
      ? 0
      : Math.min(
          Math.max(INSET + geometry.x(active) - 70, 0),
          Math.max(0, width - 140),
        );
  const labels = [first, Math.round((first + last) / 2), last].filter(
    (value, at, all) => all.indexOf(value) === at,
  );

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        end === null
          ? "Price history"
          : `Price history over ${days.length - first} days, now ${formatAmount(end)}`
      }
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
    >
      <GestureDetector gesture={gesture}>
        <View collapsable={false} style={{ height }}>
          {geometry ? (
            <>
              <Svg width={width} height={height}>
                <Defs>
                  <LinearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
                    <Stop
                      offset="0"
                      stopColor={colors.accent}
                      stopOpacity={0.22}
                    />
                    <Stop
                      offset="1"
                      stopColor={colors.accent}
                      stopOpacity={0.02}
                    />
                  </LinearGradient>
                </Defs>
                {[0.25, 0.5, 0.75].map((ratio) => (
                  <Line
                    key={ratio}
                    x1={0}
                    x2={width}
                    y1={height * ratio}
                    y2={height * ratio}
                    stroke={colors.line}
                    strokeDasharray="3 4"
                  />
                ))}
                <G x={INSET}>
                  <Path d={geometry.area} fill="url(#price-fill)" />
                  {geometry.reference ? (
                    <Path
                      d={geometry.reference}
                      stroke={colors.accent}
                      strokeOpacity={0.55}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      fill="none"
                    />
                  ) : null}
                  <Path
                    d={geometry.line}
                    stroke={colors.accent}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinejoin="round"
                  />
                  {end !== null ? (
                    <Circle
                      cx={geometry.x(last)}
                      cy={geometry.y(end)}
                      r={4}
                      fill={colors.accent}
                      stroke={colors.surface}
                      strokeWidth={2}
                    />
                  ) : null}
                </G>
              </Svg>
              <Animated.View
                pointerEvents="none"
                style={[styles.guide, { height }, guide]}
              />
              <Animated.View pointerEvents="none" style={[styles.dot, dot]} />
            </>
          ) : null}
        </View>
      </GestureDetector>
      <View style={styles.labels}>
        {geometry
          ? labels.map((at, slot) => (
              <Text
                key={at}
                style={[
                  styles.label,
                  slot === 0
                    ? { left: 0 }
                    : slot === labels.length - 1
                      ? { right: 0 }
                      : {
                          left: INSET + geometry.x(at) - 40,
                          width: 80,
                          textAlign: "center",
                        },
                ]}
              >
                {at === last ? "Today" : formatDay(days[at]!.day)}
              </Text>
            ))
          : null}
      </View>
      {shown && shown.amountMinor !== null ? (
        <View
          pointerEvents="none"
          style={[styles.tooltip, { left: tooltipLeft }]}
        >
          <Text style={styles.tooltipDay}>
            {active === last ? "Today" : formatDay(shown.day)}
          </Text>
          <Text style={styles.tooltipValue}>
            {formatAmount(shown.amountMinor)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  guide: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 1.5,
    backgroundColor: colors.muted,
    opacity: 0.7,
  },
  dot: {
    position: "absolute",
    top: 0,
    left: 0,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 3,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  labels: { height: LABEL_ROW },
  label: {
    position: "absolute",
    top: 6,
    fontFamily: fonts.semibold,
    fontSize: 11,
    color: colors.muted,
  },
  tooltip: {
    position: "absolute",
    top: -6,
    width: 140,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    boxShadow: "0 2px 8px rgba(34,30,27,0.12)",
  },
  tooltipDay: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
  tooltipValue: { fontFamily: fonts.extra, fontSize: 15, color: colors.ink },
});
