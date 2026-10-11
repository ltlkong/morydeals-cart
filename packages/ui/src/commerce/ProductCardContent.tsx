import { StyleSheet, Text, View } from "react-native";
import { colors, font, fontSize, space } from "../theme";
import { PriceSpark } from "./PriceSpark";
import { TagRow } from "./TagRow";
import type { ProductCardData } from "./product-card";

/** The original ProductTile hierarchy, shared by all three shapes. */
export function ProductCardContent({
  card,
  compact = false,
  horizontal = false,
}: {
  card: ProductCardData;
  compact?: boolean;
  horizontal?: boolean;
}) {
  return (
    <View style={[styles.body, horizontal && styles.rowBody]}>
      <Text
        numberOfLines={2}
        style={[
          styles.name,
          compact && styles.smallName,
          horizontal && styles.rowName,
        ]}
      >
        {card.title}
      </Text>
      <TagRow tags={card.productTags} />
      <View style={styles.priceRow}>
        <Text
          numberOfLines={1}
          style={[
            styles.price,
            horizontal && { color: colors.ink },
            compact && styles.smallPrice,
            !card.price && styles.noPrice,
          ]}
        >
          {card.price ?? card.noPriceLabel ?? "Awaiting price"}
        </Text>
        {!!card.price && !!card.was && (
          <Text numberOfLines={1} style={styles.was}>
            {card.was}
          </Text>
        )}
      </View>
      <View style={[styles.whereRow, horizontal && { marginTop: "auto" }]}>
        <Text numberOfLines={1} style={styles.where}>
          {card.where}
        </Text>
        <PriceSpark trend={card.trend} />
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  body: {
    paddingHorizontal: space.sm,
    paddingTop: 3,
    paddingBottom: space.sm,
    gap: 3,
    minWidth: 0,
  },
  rowBody: { flex: 1, paddingHorizontal: 0, paddingBottom: 0 },
  name: {
    fontFamily: font.bold,
    fontSize: 14,
    lineHeight: 18,
    minHeight: 36,
    color: colors.ink,
  },
  rowName: { fontSize: 15, lineHeight: 19, minHeight: 38 },
  smallName: { fontSize: 13, lineHeight: 17, minHeight: 34 },
  priceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: 6,
    rowGap: 0,
    minHeight: 26,
    overflow: "hidden",
  },
  price: {
    fontFamily: font.extra,
    fontSize: fontSize.price,
    color: colors.accentInk,
  },
  smallPrice: { fontSize: 18 },
  was: {
    flexShrink: 1,
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  noPrice: { fontFamily: font.bold, fontSize: 12, color: colors.muted },
  whereRow: {
    flexDirection: "row",
    gap: space.sm,
    alignItems: "center",
    minHeight: 18,
  },
  where: {
    flex: 1,
    minWidth: 0,
    fontFamily: font.semibold,
    fontSize: 11,
    color: colors.muted,
  },
});
