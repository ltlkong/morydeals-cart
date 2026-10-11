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
    (deal) =>
      !restatesCompareAt(deal, offer.compareAtAmountMinor) &&
      (!deal.validUntil || Date.parse(deal.validUntil) > now),
  );
}
/**
 * A `sale` deal that only restates the struck price ("Was $2,299.99", "List Price $249.99"), as products cached
 * from parser 3.17.0 hold: the price row already shows it, so it is no deal of its own.
 */
export function restatesCompareAt(
  deal: ProductDeal,
  compareAtAmountMinor: number | undefined,
) {
  if (deal.type !== "sale" || !compareAtAmountMinor) return false;
  const stated =
    /^[A-Za-z][A-Za-z ]{1,30}:?\s+\$\s?([\d,]+(?:\.\d{1,2})?)$/.exec(
      deal.text.trim(),
    );
  return (
    !!stated &&
    Math.round(Number(stated[1].replace(/,/g, "")) * 100) ===
      compareAtAmountMinor
  );
}
/** The offer's savings against its struck price: the percent the store states, else computed from the two prices. */
export const savingsOf = (offer: MobileOffer) =>
  offer.compareAtAmountMinor && offer.compareAtAmountMinor > offer.amountMinor
    ? (offer.savingsPercent ??
      percentOff(offer.amountMinor, offer.compareAtAmountMinor))
    : undefined;
/** The product's Prime member price: a members-only offer, never the primary. */
export const memberOffer = (product: MobileProduct) =>
  product.offers.find((offer, i) => i > 0 && offer.purchaseType === "member");
/**
 * What members save: the percent the member price states ("-10%"), else against the regular price; nothing when the
 * member price is not lower.
 */
export function memberSaving(
  product: MobileProduct,
  offer: MobileOffer,
): number | undefined {
  const regular = product.offers[0];
  if (!regular || offer.amountMinor >= regular.amountMinor) return undefined;
  return (
    offer.deals?.find((deal) => deal.type === "member")?.percentOff ??
    (offer.compareAtAmountMinor === regular.amountMinor
      ? offer.savingsPercent
      : undefined) ??
    percentOff(offer.amountMinor, regular.amountMinor)
  );
}
/** "Prime member price $197.10 · save 10%" for the product page. */
export function memberLine(
  product: MobileProduct,
  format: (amountMinor: number, currency: string) => string,
): string | undefined {
  const offer = memberOffer(product);
  if (!offer) return undefined;
  const saving = memberSaving(product, offer);
  return `Prime member price ${format(offer.amountMinor, offer.currency)}${saving ? ` · save ${saving}%` : ""}`;
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
      return deal.kind === "lightning"
        ? "Lightning deal"
        : deal.kind === "deal_of_the_day"
          ? "Deal of the Day"
          : deal.kind === "prime_day"
            ? "Prime Day deal"
            : deal.kind === "prime_exclusive"
              ? "Prime exclusive deal"
              : "Limited-time deal";
    case "coupon":
      return deal.percentOff ? `${deal.percentOff}% coupon` : "Coupon";
    case "promo_code":
      return "Promo code";
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
  "promo_code",
  "sale",
  "member",
  "multi_buy",
  "subscription",
  "credit",
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
  // A cheaper price for Prime members is worth a tag of its own.
  const member = memberOffer(product);
  if (member && memberSaving(product, member) !== undefined)
    tags.push({ label: "Prime price", tone: "accent" });
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
const dollars = (minor: number) =>
  `$${(minor / 100).toFixed(minor % 100 ? 2 : 0)}`;
/**
 * The deal line on the product page: its own words, the code, the percent or amount off it states (when its words
 * do not already say it), and when it ends.
 */
export function dealLine(
  deal: ProductDeal,
  formatDay: (iso: string) => string,
  now = Date.now(),
): string {
  const words = deal.text.replace(/,/g, "");
  return [
    deal.text,
    deal.code && !deal.text.includes(deal.code)
      ? `Code ${deal.code}`
      : undefined,
    deal.percentOff && !words.includes(`${deal.percentOff}%`)
      ? `${deal.percentOff}% off`
      : undefined,
    deal.amountOffMinor &&
    !words.includes(dollars(deal.amountOffMinor)) &&
    !words.includes(`$${(deal.amountOffMinor / 100).toFixed(2)}`)
      ? `${dollars(deal.amountOffMinor)} off`
      : undefined,
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
        PURCHASE_ORDER.indexOf(a.purchaseType ?? "one_time") -
          PURCHASE_ORDER.indexOf(b.purchaseType ?? "one_time") ||
        a.amountMinor - b.amountMinor,
    ),
  ];
}
const subscribed = (offer: MobileOffer) =>
  offer.purchaseType === "subscription";
const PURCHASE_ORDER = ["one_time", "member", "subscription"];
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
  /** What the former price is, as the store labels it ("Was", "List Price"). */
  wasLabel?: string;
  /** "-12%" against the former price. */
  percent?: string;
  /** What the store states about this offer besides its price: "Only 3 left", "Ships from Amazon", a fee. */
  details: string[];
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
    const member = offer.purchaseType === "member";
    // A member price's own member deal is its label ("Prime price", its saving in the row's % pill), not a line.
    const lines = deals
      .filter((deal) => !(member && deal.type === "member"))
      .sort((a, b) => DEAL_ORDER.indexOf(a.type) - DEAL_ORDER.indexOf(b.type))
      .map((deal) => dealLine(deal, formatDay, now));
    const saved = subscribed(offer)
      ? deals
          .map((deal) => /\bsave\s+(\d{1,2})\s*%/i.exec(deal.text)?.[1])
          .find(Boolean)
      : undefined;
    const label = subscribed(offer)
      ? `Subscribe & Save${saved ? ` · ${saved}% off` : ""}`
      : member
        ? "Prime price"
        : condition
          ? conditionWords[condition]
          : undefined;
    const off = savingsOf(offer);
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
      ...(offer.compareAtLabel &&
      offer.compareAtAmountMinor &&
      offer.compareAtAmountMinor > offer.amountMinor
        ? { wasLabel: offer.compareAtLabel }
        : {}),
      ...(off ? { percent: `-${off}%` } : {}),
      details: offerFacts(offer),
      deals: lines,
      ...(ending ? { endsAt: ending.at } : {}),
      estimated: !!ending?.estimated,
    };
  });
}
/** The rows shown: the first OFFERS_SHOWN until expanded. */
export const shownRows = (rows: OfferRow[], expanded: boolean) =>
  expanded ? rows : rows.slice(0, OFFERS_SHOWN);

/** What the store states about an offer besides its price, as short lines: stock count, shipper, fee (never delivery). */
export function offerFacts(offer: MobileOffer): string[] {
  return [
    offer.stockQuantity !== undefined && offer.stockQuantity > 0
      ? `Only ${offer.stockQuantity} left`
      : undefined,
    offer.shipsFrom ? `Ships from ${offer.shipsFrom}` : undefined,
    offer.fee,
  ].filter((line): line is string => !!line);
}
/** The store's badges, then its sales signal: "Amazon's Choice", "100+ bought in past month". */
export const productHighlights = (product: MobileProduct): string[] =>
  [...(product.badges ?? []), product.boughtRecently].filter(
    (line): line is string => !!line,
  );
/** The offers the store counts but does not list, in its words: "New (3) from $699.99". */
export const offerSummaryLine = (product: MobileProduct) =>
  product.offerSummary?.text.replace(/^compare\s+/i, "") || undefined;
/** "Home & Kitchen › Vacuums › Robotic Vacuums". */
export const categoryPath = (product: MobileProduct) =>
  product.categories?.length ? product.categories.join(" › ") : undefined;
/** How many specifications show on the product page. */
export const SPECS_SHOWN = 6;
/** The specifications to show: in page order, without the brand the title already shows. */
export const specRows = (product: MobileProduct) =>
  (product.specifications ?? [])
    .filter(
      (spec) =>
        !(
          /^brand$/i.test(spec.name) &&
          spec.value.toLowerCase() === product.brand?.toLowerCase()
        ),
    )
    .slice(0, SPECS_SHOWN);
