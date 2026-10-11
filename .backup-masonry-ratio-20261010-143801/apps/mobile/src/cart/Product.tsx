import { ProductCard } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { money } from "../money";
import { percentOff } from "../product/product-store";
import { priceTrend } from "./price-trend";

/** A product card's height for its width, so every masonry of cards lays out the same. */
export const productCardHeight = (width: number) =>
  Math.round(width * 0.85) + 138;

/**
 * A saved product as a card: image, price, trend and store. It has no buttons: a press opens the product's page,
 * where buying, saving and the cart live; in edit mode a press selects it.
 */
export function Product({
  product,
  width,
  onPress,
  selected,
}: {
  product: MobileProduct;
  width: number;
  /** Opens the product's page, or (editing) selects the card. */
  onPress: () => void;
  /** Editing a collection: the card shows whether it is selected. */
  selected?: boolean;
}) {
  const offer = product.offers[0];
  const percent = offer
    ? percentOff(offer.amountMinor, offer.compareAtAmountMinor)
    : undefined;
  return (
    <ProductCard
      width={width}
      variant="vertical-small"
      imageHeight={Math.round(width * 0.85)}
      card={{
        title: product.title,
        imageUrl: product.images[0],
        price: offer ? money(offer.amountMinor, offer.currency) : undefined,
        was:
          offer?.compareAtAmountMinor &&
          offer.compareAtAmountMinor > offer.amountMinor
            ? money(offer.compareAtAmountMinor, offer.currency)
            : undefined,
        badge: percent ? `${percent}% off` : undefined,
        where: new URL(product.url).hostname.replace(/^(www|ca)\./, ""),
        trend: offer
          ? priceTrend(product.history ?? [], offer.amountMinor)
          : undefined,
        productTags:
          offer?.availability === "OutOfStock"
            ? [{ label: "Out of stock" }]
            : [],
      }}
      selected={selected}
      onPress={onPress}
    />
  );
}
