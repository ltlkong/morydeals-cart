import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Copy, colors } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { money } from "../money";
import { DealCountdown } from "./DealCountdown";
import { OFFERS_SHOWN, offerRows, shownRows } from "./product-facts";

/**
 * Every offer for the product, one row each: condition, seller and stock; price and former price; its deal and
 * countdown. The primary offer first, then by condition and price; collapsed after OFFERS_SHOWN.
 */
export function OfferList({ product }: { product: MobileProduct }) {
  const [expanded, setExpanded] = useState(false);
  const rows = offerRows(product, money, Date.now());
  if (rows.length < 2) return null;
  return (
    <View style={s.list}>
      <Copy weight="extra" style={s.heading}>
        {`${rows.length} offers`}
      </Copy>
      {shownRows(rows, expanded).map((row) => (
        <View key={row.key} style={s.row}>
          <View style={s.top}>
            <View style={s.who}>
              {row.condition ? (
                <View style={s.pill}>
                  <Copy weight="extra" style={s.pillText}>
                    {row.condition}
                  </Copy>
                </View>
              ) : null}
              <Copy weight="bold" style={s.seller} numberOfLines={1}>
                {row.seller ?? "Seller not stated"}
              </Copy>
            </View>
            <View style={s.prices}>
              {row.was ? <Copy style={s.was}>{row.was}</Copy> : null}
              <Copy weight="extra" style={s.price}>
                {row.price}
              </Copy>
            </View>
          </View>
          {row.stock ? (
            <Copy style={[s.stock, row.outOfStock && { color: colors.danger }]}>
              {row.stock}
            </Copy>
          ) : null}
          {row.deal || row.endsAt ? (
            <View style={s.dealRow}>
              {row.deal ? (
                <Copy weight="bold" style={s.deal}>
                  {row.deal}
                </Copy>
              ) : null}
              {row.endsAt ? (
                <DealCountdown
                  endsAt={row.endsAt}
                  estimated={row.estimated}
                  compact
                />
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
      {rows.length > OFFERS_SHOWN ? (
        <Button secondary onPress={() => setExpanded((open) => !open)}>
          {expanded ? "Show fewer" : `Show all ${rows.length} offers`}
        </Button>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  list: { gap: 8 },
  heading: { fontSize: 17, lineHeight: 24 },
  row: {
    gap: 4,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  who: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceSunken,
  },
  pillText: { fontSize: 12, lineHeight: 16, color: colors.ink },
  seller: { flexShrink: 1, fontSize: 14, lineHeight: 19 },
  prices: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  price: { fontSize: 16, lineHeight: 22, color: colors.accentInk },
  was: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  stock: { fontSize: 13, lineHeight: 18, color: colors.success },
  dealRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  deal: { fontSize: 12, lineHeight: 16, color: colors.accentInk },
});
