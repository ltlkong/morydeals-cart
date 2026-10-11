/** Price history math, free of native imports so it runs under node tests. Amounts are minor units. */

export type PricePoint = { at: string; amountMinor: number | null };
/** One day of the window: the price in effect at that moment, or null (untracked, or no price offered). */
export type PriceDay = { day: number; amountMinor: number | null };

const DAY_MS = 86_400_000;
/** Every price chart shows the last 30 days. */
export const HISTORY_DAYS = 30;

/**
 * The window as one entry per day, oldest first: the last known price at each day's moment, carried forward (a
 * null point is a gap, e.g. no Buy Box, until the next price), with today the live price.
 */
export function dailyPrices(
  points: readonly PricePoint[],
  currentMinor: number,
  now = Date.now(),
  days = HISTORY_DAYS,
): PriceDay[] {
  const known = points
    .map((point) => ({
      at: Date.parse(point.at),
      amountMinor: point.amountMinor,
    }))
    .filter((point) => Number.isFinite(point.at) && point.at <= now)
    .sort((a, b) => a.at - b.at);
  const result: PriceDay[] = [];
  let next = 0;
  let amount: number | null = null;
  for (let index = 0; index < days; index++) {
    const day = now - (days - 1 - index) * DAY_MS;
    while (next < known.length && known[next]!.at <= day)
      amount = known[next++]!.amountMinor;
    result.push({
      day,
      amountMinor: index === days - 1 ? currentMinor : amount,
    });
  }
  return result;
}

export type PriceSummary = {
  /** Where today's price stands: the one telling case, not four figures that may all be equal. */
  key: "first" | "steady" | "lowest" | "highest" | "between";
  now: number;
  low: number;
  high: number;
  /** Average over the tracked days, so a price that held longer weighs more. */
  average: number;
  /** Index of the first tracked day. */
  since: number;
};

export function priceSummary(days: readonly PriceDay[]): PriceSummary {
  const known = days.flatMap((day) =>
    day.amountMinor === null ? [] : [day.amountMinor],
  );
  const now = known.at(-1) ?? 0;
  const low = Math.min(...known);
  const high = Math.max(...known);
  const key =
    known.length <= 1
      ? "first"
      : low === high
        ? "steady"
        : now === low
          ? "lowest"
          : now === high
            ? "highest"
            : "between";
  return {
    key,
    now,
    low,
    high,
    average: Math.round(
      known.reduce((sum, value) => sum + value, 0) / Math.max(1, known.length),
    ),
    since: Math.max(
      0,
      days.findIndex((day) => day.amountMinor !== null),
    ),
  };
}

export type ChartGeometry = {
  /** Step line: each price holds flat until the next day, then jumps; it breaks where there is no price. */
  line: string;
  /** The same runs closed down to the baseline, for the gradient fill. */
  area: string;
  /**
   * Days without a price, dashed: before tracking began at the first price, and gaps (no offer) at the last price
   * before them, each running to where the line resumes. Empty when every day has a price.
   */
  reference: string;
  x: (index: number) => number;
  y: (amount: number) => number;
  /** The plotted range, padded so the line never touches the top or bottom. */
  top: number;
  bottom: number;
};

const round = (value: number) => Math.round(value * 100) / 100;

export function chartGeometry(
  days: readonly PriceDay[],
  { width, height }: { width: number; height: number },
): ChartGeometry {
  const known = days.flatMap((day) =>
    day.amountMinor === null ? [] : [day.amountMinor],
  );
  const low = Math.min(...known);
  const high = Math.max(...known);
  // A flat history sits mid-plot.
  const pad = high > low ? (high - low) * 0.15 : Math.max(low * 0.05, 1);
  const top = high + pad;
  const bottom = low - pad;
  const pitch = days.length > 1 ? width / (days.length - 1) : 0;
  const x = (index: number) => round(days.length > 1 ? index * pitch : width);
  const y = (amount: number) =>
    round(((top - amount) / (top - bottom)) * height);
  let line = "";
  let area = "";
  for (let start = 0; start < days.length; start++) {
    if (days[start]!.amountMinor === null) continue;
    let end = start;
    let run = `M ${x(start)} ${y(days[start]!.amountMinor!)}`;
    while (end + 1 < days.length && days[end + 1]!.amountMinor !== null) {
      end++;
      run += ` H ${x(end)} V ${y(days[end]!.amountMinor!)}`;
    }
    // The last price of a run holds through its day.
    if (end + 1 < days.length) run += ` H ${x(end + 1)}`;
    const right = end + 1 < days.length ? x(end + 1) : x(end);
    line += `${line ? " " : ""}${run}`;
    area += `${area ? " " : ""}${run} H ${right} V ${height} H ${x(start)} Z`;
    start = end;
  }
  const spans: string[] = [];
  let previous: number | null = null;
  for (let index = 0; index < days.length; index++) {
    if (days[index]!.amountMinor !== null) {
      previous = days[index]!.amountMinor;
      continue;
    }
    let resume = index;
    while (resume < days.length && days[resume]!.amountMinor === null) resume++;
    if (resume === days.length) break;
    // A gap starts where the last price's day ends; untracked days start at the window's edge.
    const from = previous === null ? x(0) : x(index);
    const next = days[resume]!.amountMinor!;
    // A gap closes with a step to the price the line resumes at; untracked days are already at it.
    const join = previous !== null && previous !== next ? ` V ${y(next)}` : "";
    spans.push(`M ${from} ${y(previous ?? next)} H ${x(resume)}${join}`);
    index = resume - 1;
  }
  const reference = spans.join(" ");
  return { line, area, reference, x, y, top, bottom };
}

/**
 * The mini chart on a product card: the same day series as the big chart, inset by the end dot's radius so the dot
 * (today) is drawn whole. Draw `line` and `reference` translated by `offset`; `dot` is in frame coordinates.
 */
export function sparkLayout(
  days: readonly PriceDay[],
  { width, height, dot }: { width: number; height: number; dot: number },
) {
  const geometry = chartGeometry(days, {
    width: width - dot * 2,
    height: height - dot * 2,
  });
  const last = days.length - 1;
  const end = days[last]?.amountMinor;
  return {
    line: geometry.line,
    reference: geometry.reference,
    offset: dot,
    dot:
      end == null
        ? null
        : { x: dot + geometry.x(last), y: dot + geometry.y(end) },
  };
}

/** The tracked day nearest a finger at `x` across a plot `width` wide (untracked days snap to the closest price). */
export function dayAt(
  x: number,
  days: readonly PriceDay[],
  width: number,
): number {
  "worklet";
  const last = days.length - 1;
  const index =
    last > 0 ? Math.min(Math.max(Math.round((x / width) * last), 0), last) : 0;
  if (days[index]?.amountMinor !== null) return index;
  for (let offset = 1; offset <= last; offset++) {
    if (days[index + offset] && days[index + offset]!.amountMinor !== null)
      return index + offset;
    if (days[index - offset] && days[index - offset]!.amountMinor !== null)
      return index - offset;
  }
  return index;
}
