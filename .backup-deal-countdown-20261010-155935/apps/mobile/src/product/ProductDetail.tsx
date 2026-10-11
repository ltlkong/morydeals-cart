import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { BookmarkPlus } from "lucide-react-native";
import {
  Button,
  Copy,
  IconButton,
  ImageGallery,
  PriceHistory,
  colors,
  dailyPrices,
} from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { money } from "../money";
import { percentOff } from "./product-store";
import { StackScreen } from "../navigation/StackScreen";
import {
  availabilityLabels,
  availabilityOf,
  conditionLabel,
  dealLine,
  otherOffersLine,
  ratingText,
} from "./product-facts";

const dayLabel = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
});
const tick = () => {
  void Haptics.selectionAsync().catch(() => undefined);
};

/**
 * A product's page: its images, title, price and 90-day price history, with shopping actions fixed at the bottom.
 * It covers the tab bar; the store browser opens over it, so leaving the store returns here.
 */
export function ProductDetail({
  product,
  store,
  inCart,
  onClose,
  onShop,
  onSave,
  onAddToCart,
  onRemove,
  inSheet = false,
  sheetRoot = false,
}: {
  product: MobileProduct;
  /** The store's display name, for the shop button. */
  store: string;
  inCart: boolean;
  onClose: () => void;
  onShop: () => void;
  onSave: () => void;
  onAddToCart: () => Promise<void>;
  onRemove: () => Promise<void>;
  /** Shown inside a sheet, which has no status bar to clear. */
  inSheet?: boolean;
  /** The sheet's first screen (opened from a store's product strip). */
  sheetRoot?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const offer = product.offers[0]!;
  const days = useMemo(
    () => dailyPrices(product.history ?? [], offer.amountMinor),
    [product.history, offer.amountMinor],
  );
  const percent = percentOff(offer.amountMinor, offer.compareAtAmountMinor);
  const format = (amount: number) => money(amount, offer.currency);
  const stock = availabilityOf(product);
  const condition = conditionLabel(product.condition);
  const stars = ratingText(product.rating);
  const also = otherOffersLine(product, money);
  const facts = [
    stock ? availabilityLabels[stock] : undefined,
    offer.seller ? `Sold by ${offer.seller}` : undefined,
  ].filter(Boolean);
  const act = (action: () => Promise<void>, failure: string) => {
    setBusy(true);
    setError("");
    void action()
      .catch(() => setError(failure))
      .finally(() => setBusy(false));
  };
  return (
    <StackScreen
      title={store}
      onClose={onClose}
      zIndex={90}
      inSheet={inSheet || sheetRoot}
      sheetRoot={sheetRoot}
    >
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingBottom: 110 + insets.bottom },
        ]}
      >
        <ImageGallery
          images={product.images}
          height={Math.round(Math.min(width, 700) * 0.8)}
          label={product.title}
        />
        <View style={s.titleBlock}>
          {product.brand ? (
            <Copy weight="bold" style={s.brand}>
              {product.brand}
            </Copy>
          ) : null}
          <Copy weight="extra" style={s.title}>
            {product.title}
          </Copy>
          {product.variant ? (
            <Copy weight="bold" style={s.variant}>
              {product.variant.label}
            </Copy>
          ) : null}
          {stars ? (
            <Copy
              style={s.rating}
              accessibilityLabel={`Rated ${product.rating!.value} out of ${product.rating!.scale}${product.rating!.count ? ` from ${product.rating!.count} reviews` : ""}`}
            >
              {stars}
            </Copy>
          ) : null}
        </View>
        <View style={s.priceRow}>
          <Copy weight="extra" style={s.price}>
            {format(offer.amountMinor)}
          </Copy>
          {offer.compareAtAmountMinor &&
          offer.compareAtAmountMinor > offer.amountMinor ? (
            <Copy style={s.was}>{format(offer.compareAtAmountMinor)}</Copy>
          ) : null}
          {percent ? (
            <View style={s.pill}>
              <Copy weight="extra" style={s.pillText}>
                -{percent}%
              </Copy>
            </View>
          ) : null}
          {condition ? (
            // The shown price is not a new item's: say so on the price itself.
            <View style={s.conditionPill}>
              <Copy weight="extra" style={s.conditionText}>
                {condition}
              </Copy>
            </View>
          ) : null}
        </View>
        {stock ? (
          <Copy
            weight="bold"
            style={[
              s.stock,
              (stock === "out_of_stock" || stock === "discontinued") && {
                color: colors.danger,
              },
            ]}
          >
            {facts.join(" · ")}
          </Copy>
        ) : null}
        {also ? (
          <Copy weight="bold" style={s.also}>
            {also}
          </Copy>
        ) : null}
        {(product.deals ?? []).map((deal, i) => (
          <View key={`${deal.type}-${i}`} style={s.deal}>
            <Copy weight="bold" style={s.dealText}>
              {dealLine(deal, (day) => dayLabel.format(new Date(day)))}
            </Copy>
          </View>
        ))}
        <Copy weight="extra" style={s.section}>
          Price history
        </Copy>
        <PriceHistory
          days={days}
          formatAmount={format}
          formatDay={(day) => dayLabel.format(new Date(day))}
          onStep={tick}
        />
      </ScrollView>
      <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {error ? (
          <Copy accessibilityRole="alert" style={s.error}>
            {error}
          </Copy>
        ) : null}
        <View style={s.actions}>
          <IconButton label="Save to a list" onPress={onSave}>
            <BookmarkPlus size={20} color={colors.ink} />
          </IconButton>
          {inCart ? (
            <Button
              secondary
              disabled={busy}
              style={s.secondary}
              onPress={() => act(onRemove, "Could not remove it. Try again.")}
            >
              Remove
            </Button>
          ) : (
            <Button
              secondary
              disabled={busy}
              style={s.secondary}
              onPress={() => act(onAddToCart, "Could not add it. Try again.")}
            >
              Add to cart
            </Button>
          )}
          <Button style={s.primary} onPress={onShop}>
            {`Shop at ${store}`}
          </Button>
        </View>
      </View>
    </StackScreen>
  );
}

const s = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 14,
    alignSelf: "center",
    width: "100%",
    maxWidth: 700,
  },
  titleBlock: { gap: 4 },
  brand: { fontSize: 13, lineHeight: 18, color: colors.muted },
  title: { fontSize: 20, lineHeight: 27 },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexWrap: "wrap",
  },
  // Copy sets a 21pt line; larger type needs its own or its glyphs are clipped.
  price: { fontSize: 26, lineHeight: 34, color: colors.accentInk },
  was: {
    fontSize: 15,
    color: colors.muted,
    textDecorationLine: "line-through",
  },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  pillText: { fontSize: 13, lineHeight: 18, color: colors.accentInk },
  stock: { fontSize: 13, lineHeight: 18, color: colors.success },
  variant: { fontSize: 14, lineHeight: 20, color: colors.ink },
  rating: { fontSize: 13, lineHeight: 18, color: colors.muted },
  deal: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: colors.accentSoft,
  },
  dealText: { fontSize: 13, lineHeight: 18, color: colors.accentInk },
  conditionPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.surfaceSunken,
  },
  conditionText: { fontSize: 13, lineHeight: 18, color: colors.ink },
  also: { fontSize: 13, lineHeight: 18, color: colors.ink },
  section: { fontSize: 18, lineHeight: 24, marginTop: 6 },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 6,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderColor: colors.line,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  secondary: { paddingHorizontal: 14 },
  primary: { flex: 1 },
  error: { fontSize: 13, color: colors.danger, textAlign: "center" },
});
