import { StyleSheet } from "react-native";
import { Copy, colors } from "@morydeals/ui";
import { capturedAgo, countdownText, countdownTick } from "./product-facts";
import { useNow } from "./use-now";

/**
 * A deal's live countdown ("Ends in 3h 12m", each second in its last hour); nothing once it has ended. An end
 * estimated from the store's own countdown says so, and from which capture (`observedAt`) it counts.
 */
export function DealCountdown({
  endsAt,
  estimated,
  observedAt,
  compact = false,
}: {
  endsAt: number;
  estimated: boolean;
  observedAt?: string;
  /** A row's short form, without the capture note. */
  compact?: boolean;
}) {
  const now = useNow(countdownTick(endsAt, Date.now()));
  const text = countdownText(endsAt, now, { estimated });
  if (!text) return null;
  const note =
    estimated && !compact
      ? ["estimated from the store's countdown", capturedAgo(observedAt, now)]
          .filter(Boolean)
          .join(", ")
      : undefined;
  return (
    <Copy
      weight="bold"
      style={compact ? s.compact : s.text}
      accessibilityLabel={`${text.replace("~", "about ")}${note ? `, ${note}` : ""}`}
    >
      {text}
      {note ? <Copy style={s.note}>{` · ${note}`}</Copy> : null}
    </Copy>
  );
}

const s = StyleSheet.create({
  text: { fontSize: 13, lineHeight: 18, color: colors.accentInk },
  compact: { fontSize: 12, lineHeight: 16, color: colors.accentInk },
  note: { fontSize: 12, lineHeight: 18, color: colors.muted },
});
