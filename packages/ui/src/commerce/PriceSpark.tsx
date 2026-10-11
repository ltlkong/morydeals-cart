import { Platform } from "react-native";
import Svg, { Circle, G, Path } from "react-native-svg";

import { colors } from "../theme/tokens";
import { sparkLayout, type PriceDay } from "../data/price-history";

export type PriceSparkState = "low" | "drop" | "steady";
/** A price line: the window's days (as the big chart has them, today last) and what the price says now. */
export type PriceSparkTrend = {
  state: PriceSparkState;
  days: readonly PriceDay[];
};

const COLOR: Record<PriceSparkState, string> = {
  low: colors.success,
  drop: colors.accent,
  steady: colors.muted,
};
const OPACITY: Record<PriceSparkState, number> = {
  low: 0.9,
  drop: 0.9,
  steady: 0.7,
};

const DOT = 2.5;

/**
 * A small decorative price line beside a card's store, drawn like the product page's chart: steps where there is a
 * price, dashed where there is none, and a dot at today's price (kept whole inside the frame). Hidden from screen
 * readers; the card's label says what it means.
 */
export function PriceSpark({
  trend,
  width = 44,
  height = 14,
}: {
  trend?: PriceSparkTrend;
  width?: number;
  height?: number;
}) {
  const known = trend?.days.some((day) => day.amountMinor !== null);
  if (!trend || !known)
    return (
      <Svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        accessibilityLabel="Price history not available"
        accessibilityRole="image"
      >
        <Path
          d={`M${DOT} ${height / 2} H${width - DOT}`}
          stroke={colors.lineStrong}
          strokeWidth={1}
          strokeDasharray="2 3"
        />
      </Svg>
    );
  const spark = sparkLayout(trend.days, { width, height, dot: DOT });
  const color = COLOR[trend.state];
  const opacity = OPACITY[trend.state];
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      {...(Platform.OS === "web"
        ? { "aria-hidden": true }
        : {
            accessibilityElementsHidden: true,
            importantForAccessibility: "no-hide-descendants" as const,
          })}
    >
      <G x={spark.offset} y={spark.offset}>
        {spark.reference ? (
          <Path
            d={spark.reference}
            fill="none"
            stroke={color}
            strokeWidth={1.25}
            strokeDasharray="2 2.5"
            strokeOpacity={opacity * 0.6}
          />
        ) : null}
        <Path
          d={spark.line}
          fill="none"
          stroke={color}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeOpacity={opacity}
        />
      </G>
      {spark.dot ? (
        <Circle
          cx={spark.dot.x}
          cy={spark.dot.y}
          r={DOT}
          fill={color}
          fillOpacity={opacity + 0.1}
        />
      ) : null}
    </Svg>
  );
}
