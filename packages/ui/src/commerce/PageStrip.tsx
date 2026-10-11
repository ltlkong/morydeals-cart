import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";

import { Pressable } from "../primitives/Pressable";
import { colors, radius, space } from "../theme/tokens";
import { font } from "../theme/typography";

export const PAGE_STRIP_HEIGHT = 44;

type Props = {
  /** The store, shown when the page is not a product (or while it is being checked). */
  merchant: { name: string; logoUrl?: string | null };
  /** The product found on the current page, if any. */
  product?: {
    title: string;
    price?: string;
    /** The advertised former price, struck through beside the current one. */
    was?: string;
    imageUrl?: string;
  };
  /** In place of the store's name when there is no product yet, e.g. a product page waiting for a size choice. */
  hint?: string;
  /** The page is being checked. */
  busy?: boolean;
  /** Opens the product's page (price history, cart and lists). */
  onView?: () => void;
};

/**
 * A low strip above an in-app store page: the product found on the page with a control that opens its page, or the
 * store's logo and name (or a hint about the page) when there is none.
 */
export function PageStrip({
  merchant,
  product,
  hint,
  busy = false,
  onView,
}: Props) {
  return (
    <View style={styles.strip}>
      {product ? (
        <>
          {product.imageUrl ? (
            <Image
              source={{ uri: product.imageUrl }}
              resizeMode="contain"
              style={styles.thumb}
            />
          ) : null}
          <View style={styles.text}>
            <Text style={styles.title} numberOfLines={1}>
              {product.title}
            </Text>
            {product.price ? (
              <Text style={styles.price} numberOfLines={1}>
                {product.price}
                {product.was ? (
                  <>
                    {"  "}
                    <Text style={styles.was}>{product.was}</Text>
                  </>
                ) : null}
              </Text>
            ) : null}
          </View>
          {onView ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View ${product.title}`}
              onPress={onView}
              hitSlop={6}
              style={styles.view}
            >
              <Text style={styles.viewLabel}>View</Text>
              <ChevronRight
                size={16}
                color={colors.onAccent}
                strokeWidth={2.6}
              />
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          {merchant.logoUrl ? (
            <Image
              source={{ uri: merchant.logoUrl }}
              resizeMode="contain"
              style={styles.logo}
            />
          ) : null}
          <Text style={hint ? styles.hint : styles.merchant} numberOfLines={1}>
            {hint ?? merchant.name}
          </Text>
          {busy ? (
            <ActivityIndicator
              size="small"
              color={colors.muted}
              style={styles.busy}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: PAGE_STRIP_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.md,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  thumb: {
    width: 32,
    height: 32,
    borderRadius: 6,
    backgroundColor: colors.surfaceSunken,
  },
  text: { flex: 1, minWidth: 0 },
  title: { fontFamily: font.semibold, fontSize: 13, color: colors.ink },
  price: { fontFamily: font.extra, fontSize: 13, color: colors.accentInk },
  was: {
    fontFamily: font.semibold,
    fontSize: 12,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  view: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    height: 30,
    paddingLeft: 12,
    paddingRight: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
  },
  viewLabel: { fontFamily: font.extra, fontSize: 13, color: colors.onAccent },
  logo: { width: 22, height: 22 },
  merchant: {
    flex: 1,
    fontFamily: font.extra,
    fontSize: 14,
    color: colors.ink,
  },
  hint: {
    flex: 1,
    fontFamily: font.semibold,
    fontSize: 13,
    color: colors.muted,
  },
  busy: { marginLeft: "auto" },
});
