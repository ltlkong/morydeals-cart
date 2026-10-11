import { StyleSheet, Text, View } from "react-native";

import { PriceChart } from "../data/PriceChart";
import { priceSummary, type PriceDay } from "../data/price-history";
import { colors, fonts, radius, space } from "../theme/index";

/**
 * Where today's price stands, in one sentence (the telling case: first seen, steady, the lowest, the highest or in
 * between), the low / average / high of the window, and the chart.
 */
export function PriceHistory({
  days,
  formatAmount,
  formatDay,
  onStep,
}: {
  days: readonly PriceDay[];
  formatAmount: (amount: number) => string;
  formatDay: (day: number) => string;
  onStep?: () => void;
}) {
  const summary = priceSummary(days);
  const tracked = days.length - summary.since;
  const strong = (amount: number) => (
    <Text style={styles.price}>{formatAmount(amount)}</Text>
  );
  const sentence =
    summary.key === "first" ? (
      <>
        First price recorded at {strong(summary.now)}. Its history builds from
        here.
      </>
    ) : summary.key === "steady" ? (
      <>
        Steady at {strong(summary.now)} for {tracked} days.
      </>
    ) : summary.key === "lowest" ? (
      <>
        {strong(summary.now)} is the lowest price in {tracked} days.
      </>
    ) : summary.key === "highest" ? (
      <>
        {strong(summary.now)} is the highest price in {tracked} days.
      </>
    ) : (
      <>
        Now {strong(summary.now)}, between {strong(summary.low)} and{" "}
        {strong(summary.high)}.
      </>
    );
  return (
    <View style={styles.box}>
      <Text style={styles.summary}>{sentence}</Text>
      {summary.key !== "first" ? (
        <View style={styles.stats}>
          <Stat label="Lowest" value={formatAmount(summary.low)} />
          <Stat label="Average" value={formatAmount(summary.average)} />
          <Stat label="Highest" value={formatAmount(summary.high)} />
        </View>
      ) : null}
      {/* Always drawn: days without a price are dashed, so even a first price reads as the start of a timeline. */}
      <PriceChart
        days={days}
        formatAmount={formatAmount}
        formatDay={formatDay}
        onStep={onStep}
      />
      <Text style={styles.caption}>
        {summary.since > 0
          ? `Tracked since ${formatDay(days[summary.since]!.day)}`
          : `Last ${days.length} days`}
      </Text>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  summary: {
    fontFamily: fonts.semibold,
    fontSize: 16,
    lineHeight: 24,
    color: colors.ink,
  },
  price: { fontFamily: fonts.extra, color: colors.ink },
  stats: { flexDirection: "row", gap: space.sm },
  stat: {
    flex: 1,
    paddingVertical: space.sm,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceAlt,
    gap: 2,
  },
  statLabel: { fontFamily: fonts.semibold, fontSize: 11, color: colors.muted },
  statValue: { fontFamily: fonts.extra, fontSize: 13, color: colors.ink },
  caption: { fontFamily: fonts.semibold, fontSize: 12, color: colors.muted },
});
