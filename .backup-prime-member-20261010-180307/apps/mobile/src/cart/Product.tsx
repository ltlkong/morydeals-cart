import { IMAGE_RATIO_FALLBACK, ProductCard } from "@morydeals/ui";
import type { MobileProduct } from "../products-api";
import { money } from "../money";
import { percentOff } from "../product/product-store";
import { priceTrend } from "./price-trend";
import { countdownTick, dealEnd, productTags } from "../product/product-facts";
import { useNow } from "../product/use-now";

/** The card's image box height: its width times the image's ratio (see useMeasuredItems), else the fixed shape. */
export const productImageHeight = (
  width: number,
  ratio = IMAGE_RATIO_FALLBACK,
) => Math.round(width * ratio);
/** A product card's height for its width and image ratio, so the masonry knows it before the card renders. */
export const productCardHeight = (width: number, ratio?: number) =>
  productImageHeight(width, ratio) + 138;
/** The image a product card shows, for measuring it first. */
export const productImageUrl = (product: MobileProduct) => product.images[0];
export const productKey = (product: MobileProduct) => product.url;

/**
 * A saved product as a card: image, price, trend and store. It has no buttons: a press opens the product's page,
 * where buying, saving and the cart live; in edit mode a press selects it.
 */
export function Product({
  product,
  width,
  onPress,
  selected,
  ratio,
}: {
  product: MobileProduct;
  width: number;
  /** The image box's height / width; the fixed 0.85 shape when not given (e.g. a shelf of equal cards). */
  ratio?: number;
  /** Opens the product's page, or (editing) selects the card. */
  onPress: () => void;
  /** Editing a collection: the card shows whether it is selected. */
  selected?: boolean;
}) {
  const offer = product.offers[0];
  // A deal with an end counts down on the card: each minute, each second in its last hour.
  const ending = offer ? dealEnd(product, offer, Date.now()) : undefined;
  const now = useNow(countdownTick(ending?.at, Date.now()));
  const percent = offer
    ? percentOff(offer.amountMinor, offer.compareAtAmountMinor)
    : undefined;
  return (
    <ProductCard
      width={width}
      variant="vertical-small"
      imageHeight={productImageHeight(width, ratio)}
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
        // The store, then the selected variant (as morydeals-affiliate's card does).
        where: [
          new URL(product.url).hostname.replace(/^(www|ca)\./, ""),
          product.variant?.label,
        ]
          .filter(Boolean)
          .join(" · "),
        trend: offer
          ? priceTrend(product.history ?? [], offer.amountMinor)
          : undefined,
        productTags: productTags(product, now),
      }}
      selected={selected}
      onPress={onPress}
    />
  );
}
