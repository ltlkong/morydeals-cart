import type { ProductTag } from "@morydeals/ui";
import type {
  MobileOffer,
  MobileProduct,
  ProductAvailability,
  ProductCondition,
  ProductDeal,
} from "../products-api";
import { percentOff } from "./product-store";

/** schema.org ItemAvailability names, for products cached before the API sent `availability`. */
const LEGACY: Record<string, ProductAvailability> = {
  InStock: "in_stock",
  OutOfStock: "out_of_stock",
  PreOrder: "preorder",
  BackOrder: "backorder",
  LimitedAvailability: "limited",
  Discontinued: "discontinued",
};
const STOCK = new Set<string>([
  "in_stock",
  "out_of_stock",
  "preorder",
  "backorder",
  "limited",
  "discontinued",
]);
/** An offer's stock, or null when the store does not say (older caches hold a schema.org name). */
export function offerAvailability(
  offer: MobileOffer | undefined,
): ProductAvailability | null | undefined {
  const value = offer?.availability;
  if (value === null) return null;
  if (value === undefined) return undefined;
  return STOCK.has(value)
    ? (value as ProductAvailability)
    : (LEGACY[value] ?? null);
}
/** The primary offer's stock, or null when the store does not say. */
export function availabilityOf(
  product: MobileProduct,
): ProductAvailability | null {
  const offer = product.offers[0];
  // An older API sent the stock on the product and a schema.org name on the offer.
  if (offer && STOCK.has(String(offer.availability)))
    return offer.availability as ProductAvailability;
  if (product.availability !== undefined) return product.availability;
  return offerAvailability(offer) ?? null;
}
/** The offer's stated condition (the primary falls back to the product-level field of older APIs). */
export function offerCondition(
  product: MobileProduct,
  offer: MobileOffer,
): ProductCondition | null {
  if (offer.condition !== undefined) return offer.condition;
  return offer === product.offers[0] ? (product.condition ?? null) : null;
}
/** An offer's deals still running at `now` (a deal past its end is never shown as active). */
export function offerDeals(
  product: MobileProduct,
  offer: MobileOffer,
  now: number,
): ProductDeal[] {
  const deals =
    offer.deals ?? (offer === product.offers[0] ? product.deals : undefined);
  return (deals ?? []).filter(
    (deal) => !deal.validUntil || Date.parse(deal.validUntil) > now,
  );
}
/** The soonest end among an offer's running deals, with whether it was estimated from the store's countdown. */
export function dealEnd(
  product: MobileProduct,
  offer: MobileOffer,
  now: number,
): { at: number; estimated: boolean } | undefined {
  const ends = offerDeals(product, offer, now)
    .filter((deal) => deal.validUntil)
    .map((deal) => ({
      at: Date.parse(deal.validUntil!),
      estimated: !!deal.validUntilEstimated,
    }));
  if (offer.dealEndsAt && Date.parse(offer.dealEndsAt) > now)
    ends.push({
      at: Date.parse(offer.dealEndsAt),
      estimated: !!offer.dealEndsEstimated,
    });
  return ends.sort((a, b) => a.at - b.at)[0];
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
export function productTags(
  product: MobileProduct,
  now = Date.now(),
): ProductTag[] {
  const tags: ProductTag[] = [];
  const stock = availabilityOf(product);
  if (stock && stock !== "in_stock" && stock !== "limited")
    tags.push({ label: availabilityLabels[stock] });
  const offer = product.offers[0];
  const condition = offer
    ? conditionLabel(offerCondition(product, offer))
    : undefined;
  if (condition) tags.push({ label: condition });
  // A plain "Sale" beside a struck-through price only repeats the card's "% off" badge.
  const discounted =
    !!offer?.compareAtAmountMinor &&
    offer.compareAtAmountMinor > offer.amountMinor;
  const deals = offer ? offerDeals(product, offer, now) : [];
  // A deal with an end shows its countdown instead of its name: "Ends in 3h 12m".
  const ending = offer ? dealEnd(product, offer, now) : undefined;
  const deal = ending
    ? countdownText(ending.at, now, { estimated: ending.estimated })
    : deals
        .filter(
          (d) => !(discounted && d.type === "sale" && /^sale$/i.test(d.text)),
        )
        .sort((a, b) => DEAL_ORDER.indexOf(a.type) - DEAL_ORDER.indexOf(b.type))
        .map(dealTag)
        .find(Boolean);
  if (deal) tags.push({ label: deal, tone: "accent" });
  return tags.slice(0, 2);
}

const HOUR = 3_600_000;
const pad = (n: number) => String(n).padStart(2, "0");
/**
 * "Ends in 2d 4h", "Ends in 3h 12m", or in the last hour "Ends in 12m 05s"; nothing once it has ended. An end
 * estimated from the store's countdown reads "Ends in ~3h 12m".
 */
export function countdownText(
  endsAt: number | string,
  now: number,
  { estimated = false }: { estimated?: boolean } = {},
): string | undefined {
  const left = (typeof endsAt === "string" ? Date.parse(endsAt) : endsAt) - now;
  if (!(left > 0)) return undefined;
  const seconds = Math.floor(left / 1000);
  const d = Math.floor(seconds / 86_400);
  const h = Math.floor((seconds % 86_400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const time =
    d > 0
      ? `${d}d ${h}h`
      : h > 0
        ? `${h}h ${m}m`
        : `${m}m ${pad(seconds % 60)}s`;
  return `Ends in ${estimated ? "~" : ""}${time}`;
}
/** How often a countdown must re-render: each second in its last hour, else each minute; never once ended. */
export function countdownTick(
  endsAt: number | undefined,
  now: number,
): number | null {
  if (endsAt === undefined || endsAt <= now) return null;
  return endsAt - now <= HOUR ? 1000 : 60_000;
}
/** "captured 2h ago" for the capture an estimated end counts from. */
export function capturedAgo(observedAt: string | undefined, now: number) {
  const at = observedAt ? Date.parse(observedAt) : NaN;
  if (Number.isNaN(at)) return undefined;
  const minutes = Math.max(0, Math.floor((now - at) / 60_000));
  if (minutes < 1) return "captured just now";
  if (minutes < 60) return `captured ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24
    ? `captured ${hours}h ago`
    : `captured ${Math.floor(hours / 24)}d ago`;
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
  now = Date.now(),
): string {
  return [
    deal.text,
    deal.code ? `Code ${deal.code}` : undefined,
    deal.claimedPercent !== undefined
      ? `${deal.claimedPercent}% claimed`
      : undefined,
    // A far stated end is dated; a near one (or an estimated one) shows as the live countdown beside it.
    deal.validUntil &&
    !deal.validUntilEstimated &&
    Date.parse(deal.validUntil) - now > 7 * 86_400_000
      ? `Ends ${formatDay(deal.validUntil)}`
      : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Every condition's word, new included, for listing offers side by side. */
export const conditionWords: Record<ProductCondition, string> = {
  new: "New",
  ...conditionLabels,
};
const CONDITION_ORDER: (ProductCondition | null)[] = [
  "new",
  null,
  "open_box",
  "renewed",
  "used",
  "damaged",
];
/** The product's offers to list: the primary first, then by condition (new, open box, renewed, used), then price. */
export function orderedOffers(product: MobileProduct): MobileOffer[] {
  const [primary, ...rest] = product.offers;
  if (!primary) return [];
  return [
    primary,
    ...[...rest].sort(
      (a, b) =>
        CONDITION_ORDER.indexOf(offerCondition(product, a)) -
          CONDITION_ORDER.indexOf(offerCondition(product, b)) ||
        Number(subscribed(a)) - Number(subscribed(b)) ||
        a.amountMinor - b.amountMinor,
    ),
  ];
}
const subscribed = (offer: MobileOffer) =>
  offer.purchaseType === "subscription";
/** How many offers show before "Show all". */
export const OFFERS_SHOWN = 3;
/** One offer's row on the product page: its condition, seller and stock, its price and former price, its deal. */
export type OfferRow = {
  key: string;
  /** "New", "Used"…, or "Subscribe & Save" (with the percent its message states) for a subscription price. */
  condition?: string;
  /** Only when the store names one. */
  seller?: string;
  stock?: string;
  outOfStock: boolean;
  price: string;
  was?: string;
  /** "-12%" against the former price. */
  percent?: string;
  /** Every running deal of this offer, as its line reads ("Save $5 with coupon · Code FALL5"). */
  deals: string[];
  endsAt?: number;
  estimated: boolean;
};
export function offerRows(
  product: MobileProduct,
  format: (amountMinor: number, currency: string) => string,
  now: number,
  formatDay: (iso: string) => string = (iso) => iso.slice(0, 10),
): OfferRow[] {
  return orderedOffers(product).map((offer, i) => {
    const condition = offerCondition(product, offer);
    const stock =
      i === 0 ? availabilityOf(product) : (offerAvailability(offer) ?? null);
    const deals = offerDeals(product, offer, now);
    const ending = dealEnd(product, offer, now);
    const lines = [...deals]
      .sort((a, b) => DEAL_ORDER.indexOf(a.type) - DEAL_ORDER.indexOf(b.type))
      .map((deal) => dealLine(deal, formatDay, now));
    const saved = subscribed(offer)
      ? deals
          .map((deal) => /\bsave\s+(\d{1,2})\s*%/i.exec(deal.text)?.[1])
          .find(Boolean)
      : undefined;
    const label = subscribed(offer)
      ? `Subscribe & Save${saved ? ` · ${saved}% off` : ""}`
      : condition
        ? conditionWords[condition]
        : undefined;
    const off = percentOff(offer.amountMinor, offer.compareAtAmountMinor);
    return {
      key: `${i}-${condition ?? ""}-${offer.purchaseType ?? ""}-${offer.seller ?? ""}-${offer.amountMinor}`,
      ...(label ? { condition: label } : {}),
      ...(offer.seller ? { seller: offer.seller } : {}),
      ...(stock ? { stock: availabilityLabels[stock] } : {}),
      outOfStock: stock === "out_of_stock" || stock === "discontinued",
      price: format(offer.amountMinor, offer.currency),
      ...(offer.compareAtAmountMinor &&
      offer.compareAtAmountMinor > offer.amountMinor
        ? { was: format(offer.compareAtAmountMinor, offer.currency) }
        : {}),
      ...(off ? { percent: `-${off}%` } : {}),
      deals: lines,
      ...(ending ? { endsAt: ending.at } : {}),
      estimated: !!ending?.estimated,
    };
  });
}
/** The rows shown: the first OFFERS_SHOWN until expanded. */
export const shownRows = (rows: OfferRow[], expanded: boolean) =>
  expanded ? rows : rows.slice(0, OFFERS_SHOWN);
