export interface PageDocument {
  version: '1';
  url: string;
  /** Original user URL, retained across redirects to verify selected-item identity. */
  requestedUrl?: string;
  /** Original inert HTML for deterministic retailer readers. Never executed. */
  html?: string;
  storefront?: {
    target: import('./shopify/store.ts').ShopifyTarget;
    response: unknown;
  };
  fetchedAt: string;
  markdown: string;
  metadata: Record<string, string[]>;
  jsonLd: unknown[];
  /** Inert product JSON captured before script removal; never evaluated. */
  embeddedProducts?: {
    kind: 'selected-variant' | 'product';
    source: string;
    value: unknown;
  }[];
}

/**
 * The item's condition as the source states it (schema.org itemCondition, or the store's own wording). Renewed
 * covers refurbished and reconditioned; open_box is new but opened.
 */
export type Condition = 'new' | 'used' | 'renewed' | 'open_box' | 'damaged';
/**
 * A deal the source shows beside the price (the vocabulary of morydeals-price `promotions[]`, plus `deal` for a
 * limited-time or lightning deal). It never replaces the shown price.
 */
export interface Promotion {
  type:
    | 'sale'
    | 'coupon'
    | 'promo_code'
    | 'member'
    | 'multi_buy'
    | 'subscription'
    | 'credit'
    | 'deal'
    | 'other';
  /** What the shopper sees ("Limited time deal", "Save $10 with coupon"); never a field name or a dump. */
  text: string;
  /** A coupon code, only when the source names one. */
  code?: string;
  /** A price the source itself states for this promotion ("$79.99 with coupon"); never computed. */
  effectiveMinor?: number;
  /**
   * When the deal ends (UTC): the instant the source states with its zone, or, when the page shows only a running
   * countdown ("Ends in 5h 12m"), the capture time plus that countdown (then `validUntilEstimated`). Never guessed.
   */
  validUntil?: string;
  /** validUntil was computed from the page's relative countdown and the capture time, not stated by the source. */
  validUntilEstimated?: true;
  /** The kind of time-limited deal the source names ("Lightning Deal", "Deal of the Day", "Limited-time deal"). */
  kind?: 'lightning' | 'deal_of_the_day' | 'limited_time' | 'prime_day' | 'prime_exclusive';
  /** The percent off the deal's own words state ("Apply 15% coupon", "Save 5%"); never computed. */
  percentOff?: number;
  /** The amount off the deal's own words state ("Save $5 with coupon", "$10 off"), in minor units. */
  amountOffMinor?: number;
  /** The store's own id for the promotion (Amazon `amzn1.promotion.…`). */
  promotionId?: string;
  /** How much of a Lightning Deal is claimed, as the page states it ("57% claimed"). */
  claimedPercent?: number;
  evidence: string;
}

export interface Offer {
  /** Integer smallest currency units; CAD 89.99 = 8999. */
  amountMinor: number;
  /** Advertised former price, never a second purchasable offer. */
  compareAtAmountMinor?: number;
  compareAtEvidence?: string;
  currencyEvidence: string;
  currency: string;
  url?: string;
  /** schema.org ItemAvailability name of the selected variant (see AVAILABILITY); omitted when unknown. */
  availability?: string;
  /** Stated condition of this offer; omitted when the source does not say. */
  condition?: Condition;
  /** Deals the source shows for this offer (sale, coupon, limited-time deal, member price…). */
  promotions?: Promotion[];
  seller?: string;
  /** What the struck price is, as the page labels it: "Was", "List Price", "Typical price". */
  compareAtLabel?: string;
  /** Who ships this offer, as stated ("Amazon"). */
  shipsFrom?: string;
  /** The delivery the page states for this offer ("FREE delivery Monday, October 19"). */
  delivery?: string;
  /** Units left when the page states a count ("Only 3 left in stock"). */
  stockQuantity?: number;
  /** A fee stated beside the price ("$0.55 eco fee might apply"). */
  fee?: string;
  /**
   * How this price is bought: once, or as a subscription (Amazon Subscribe & Save). Omitted means one-time. A
   * subscription price is its own offer and never the product's primary price.
   */
  purchaseType?: PurchaseType;
  validUntil?: string;
  evidence: string;
}
export type PurchaseType = 'one_time' | 'subscription';

/** One chosen option of the selected variant, as the store names it (e.g. Colour: Black). */
export interface VariantOption {
  name: string;
  value: string;
}
/**
 * The variant that was selected on the page. Its price is this variant's; a sibling variant is another product
 * (its own URL, identity and price history).
 */
export interface ProductVariant {
  /** The store's variant identifier (Shopify variant id, SKU, ASIN) when the page states one. */
  id?: string;
  /** The options joined for display, e.g. "Black · 256GB". */
  label: string;
  options: VariantOption[];
  evidence: string;
}
/** The store's average rating as published; never computed or estimated. */
export interface ProductRating {
  value: number;
  /** The best possible rating (schema.org bestRating; 5 when the source omits it, as schema.org defines). */
  scale: number;
  /** Ratings or reviews counted, when the source says. */
  count?: number;
  evidence: string;
}

export interface Product {
  url: string;
  title: string;
  description?: string;
  brand?: string;
  sku?: string;
  variantId?: string;
  variant?: ProductVariant;
  rating?: ProductRating;
  /** Badges the store shows for the product ("Amazon's Choice", "#1 Best Seller"). */
  badges?: string[];
  /** The store's own sales signal as shown ("100+ bought in past month"). */
  boughtRecently?: string;
  /** The store's category path, broadest first. */
  categories?: string[];
  /** Specifications the page lists (Brand, Model name…), in page order. */
  specifications?: { name: string; value: string }[];
  /** Offers the page counts without listing them ("New (3) from $699.99"). */
  offerSummary?: OfferSummary;
  images: string[];
  offers: Offer[];
  evidence: string;
}

export interface OfferSummary {
  count: number;
  condition?: Condition;
  /** The lowest price the page states for them. */
  fromMinor?: number;
  currency?: string;
  text: string;
}

export interface ParseResult {
  parserVersion: string;
  strategy: string;
  status: 'parsed' | 'needs_review';
  products: Product[];
  issues: string[];
  /** The page had not finished loading when it was read: reading it again can work; guessing from it cannot. */
  incomplete?: true;
}

export interface ParserStrategy {
  id: string;
  parse(document: PageDocument): ParseResult;
}
