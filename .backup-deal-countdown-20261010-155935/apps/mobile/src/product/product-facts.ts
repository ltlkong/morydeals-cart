import type { ProductTag } from "@morydeals/ui";
import type {
  MobileProduct,
  ProductAvailability,
  ProductCondition,
  ProductDeal,
} from "../products-api";

/** schema.org ItemAvailability names, for products cached before the API sent `availability`. */
const LEGACY: Record<string, ProductAvailability> = {
  InStock: "in_stock",
  OutOfStock: "out_of_stock",
  PreOrder: "preorder",
  BackOrder: "backorder",
  LimitedAvailability: "limited",
  Discontinued: "discontinued",
};
/** The shown offer's stock, or null when the store does not say. */
export function availabilityOf(
  product: MobileProduct,
): ProductAvailability | null {
  if (product.availability !== undefined) return product.availability;
  return LEGACY[product.offers[0]?.availability ?? ""] ?? null;
}
export const availabilityLabels: Record<ProductAvailability, string> = {
  in_stock: "In stock",
  out_of_stock: "Out of stock",
  preorder: "Pre-order",
  backorder: "Back-order",
  limited: "Limited stock",
  discontinued: "Discontinued",
};
/** Condition words for anything but new (new is the default and gets no tag). */
export const conditionLabels: Record<
  Exclude<ProductCondition, "new">,
  string
> = {
  used: "Used",
  renewed: "Renewed",
  open_box: "Open box",
  damaged: "Damaged",
};
export const conditionLabel = (
  condition: ProductCondition | null | undefined,
) =>
  condition && condition !== "new" ? conditionLabels[condition] : undefined;

/** A deal's short card label; the store's own words on the product page. */
export function dealTag(deal: ProductDeal): string | undefined {
  switch (deal.type) {
    case "deal":
      return "Limited-time deal";
    case "coupon":
      return "Coupon";
    case "member":
      return "Member price";
    case "multi_buy":
      return "Multi-buy";
    case "sale":
      return deal.text.length <= 16 ? deal.text : "Sale";
    default:
      return undefined;
  }
}
// Which deal a card shows first: the time-limited ones, then what changes what you pay.
const DEAL_ORDER: ProductDeal["type"][] = [
  "deal",
  "coupon",
  "sale",
  "member",
  "multi_buy",
  "other",
];

/**
 * A card's tags, at most two: a stock problem, a non-new condition, then the leading deal. Nothing is shown when
 * the product is in stock, new and has no deal, or when the store says nothing.
 */
export function productTags(product: MobileProduct): ProductTag[] {
  const tags: ProductTag[] = [];
  const stock = availabilityOf(product);
  if (stock && stock !== "in_stock" && stock !== "limited")
    tags.push({ label: availabilityLabels[stock] });
  const condition = conditionLabel(product.condition);
  if (condition) tags.push({ label: condition });
  const offer = product.offers[0];
  // A plain "Sale" beside a struck-through price only repeats the card's "% off" badge.
  const discounted =
    !!offer?.compareAtAmountMinor &&
    offer.compareAtAmountMinor > offer.amountMinor;
  const deal = [...(product.deals ?? [])]
    .filter((d) => !(discounted && d.type === "sale" && /^sale$/i.test(d.text)))
    .sort((a, b) => DEAL_ORDER.indexOf(a.type) - DEAL_ORDER.indexOf(b.type))
    .map(dealTag)
    .find(Boolean);
  if (deal) tags.push({ label: deal, tone: "accent" });
  return tags.slice(0, 2);
}

const count = new Intl.NumberFormat("en-CA");
/** "4.6 ★ (1,284)" for a 5-point rating; other scales say theirs ("8.4/10"). */
export function ratingText(
  rating: MobileProduct["rating"],
): string | undefined {
  if (!rating) return undefined;
  const value = rating.value.toFixed(1);
  const score = rating.scale === 5 ? `${value} ★` : `${value}/${rating.scale}`;
  return rating.count ? `${score} (${count.format(rating.count)})` : score;
}
/** The deal line on the product page: its own words, the code, and when it ends. */
export function dealLine(
  deal: ProductDeal,
  formatDay: (iso: string) => string,
): string {
  return [
    deal.text,
    deal.code ? `Code ${deal.code}` : undefined,
    deal.validUntil ? `Ends ${formatDay(deal.validUntil)}` : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

const CONDITION_WORDS: Record<ProductCondition, string> = {
  new: "New",
  ...conditionLabels,
};
/**
 * "Also: Used from $239.15 · Renewed from $219.99", the other conditions' cheapest prices the store showed, or
 * nothing. Out-of-stock offers are left out; nothing is shown that the store did not state.
 */
export function otherOffersLine(
  product: MobileProduct,
  format: (amountMinor: number, currency: string) => string,
): string | undefined {
  const shown = (product.otherOffers ?? []).filter(
    (offer) =>
      offer.availability !== "out_of_stock" &&
      offer.availability !== "discontinued",
  );
  if (!shown.length) return undefined;
  return `Also: ${shown
    .map(
      (offer) =>
        `${CONDITION_WORDS[offer.condition]} from ${format(offer.amountMinor, offer.currency)}`,
    )
    .join(" · ")}`;
}
