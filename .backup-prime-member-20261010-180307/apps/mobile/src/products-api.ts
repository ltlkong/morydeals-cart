import { UserFacingError, apiFailure } from "./errors";
import type { PageSnapshot } from "@morydeals/capture-contracts/snapshot";
import { baseUrl } from "./api-base";
import { authorizedFetch } from "./session";
export type MobileProduct = {
  url: string;
  title: string;
  images: string[];
  brand?: string;
  /** Every offer for this product (one price each), the primary first: new when the store has one. */
  offers: MobileOffer[];
  /** The selected variant the store names, e.g. "Black · 256GB". */
  variant?: {
    id?: string;
    label: string;
    options: { name: string; value: string }[];
  };
  /** The store's published rating, e.g. 4.6 of 5 from 1,284 reviews. */
  rating?: { value: number; scale: number; count?: number };
  /** Badges the store shows ("Amazon's Choice", "#1 Best Seller"). */
  badges?: string[];
  /** The store's own sales signal as shown ("100+ bought in past month"). */
  boughtRecently?: string;
  /** The store's category path, broadest first. */
  categories?: string[];
  /** Specifications the page lists, in page order. */
  specifications?: { name: string; value: string }[];
  /** Offers the store counts without listing them ("Compare New (3) from $699.99"). */
  offerSummary?: {
    count: number;
    condition?: ProductCondition;
    fromMinor?: number;
    currency?: string;
    text: string;
  };
  /** @deprecated The primary offer's stock; read `offers[0]` (kept for responses and caches from older APIs). */
  availability?: ProductAvailability | null;
  /** @deprecated The primary offer's condition; read `offers[0]`. */
  condition?: ProductCondition | null;
  /** @deprecated The primary offer's running deals; read `offers[0]`. */
  deals?: ProductDeal[];
  /** When the product was last captured: the capture time of its offers (deal countdowns count from it). */
  observedAt?: string;
  /** Up to 90 days of the primary offer's prices (Keepa Buy Box and our captures); null is a gap. */
  history?: { at: string; amountMinor: number | null }[];
};
export type ProductAvailability =
  | "in_stock"
  | "out_of_stock"
  | "preorder"
  | "backorder"
  | "limited"
  | "discontinued";
export type ProductCondition =
  "new" | "used" | "renewed" | "open_box" | "damaged";
export type ProductDeal = {
  type:
    | "sale"
    | "coupon"
    | "promo_code"
    | "member"
    | "multi_buy"
    | "subscription"
    | "credit"
    | "deal"
    | "other";
  text: string;
  code?: string;
  effectiveMinor?: number;
  /** When the deal ends (UTC). */
  validUntil?: string;
  /** The end was computed from the store's countdown plus the capture time, not stated by the store. */
  validUntilEstimated?: boolean;
  kind?:
    | "lightning"
    | "deal_of_the_day"
    | "limited_time"
    | "prime_day"
    | "prime_exclusive";
  /** A Lightning Deal's share claimed, as the store states it. */
  claimedPercent?: number;
  /** The percent off the deal's own words state ("Apply 15% coupon"). */
  percentOff?: number;
  /** The amount off the deal's own words state ("Save $5 with coupon"), minor units. */
  amountOffMinor?: number;
  promotionId?: string;
};
/** One offer: one price with its own condition, seller, stock, deals, deal end and history. */
export type MobileOffer = {
  amountMinor: number;
  compareAtAmountMinor?: number;
  currency: string;
  /** The app's stock value; products cached from older APIs hold a schema.org name here. */
  availability?: ProductAvailability | string | null;
  condition?: ProductCondition | null;
  seller?: string;
  /** A subscription price (Amazon Subscribe & Save) is its own offer, never the primary; absent means one-time. */
  purchaseType?: "one_time" | "subscription";
  /** What the struck price is, as the store labels it ("Was", "List Price", "Typical price"). */
  compareAtLabel?: string;
  /** Who ships it ("Amazon"). */
  shipsFrom?: string;
  /** The delivery the store states ("FREE delivery Monday, October 19"). */
  delivery?: string;
  /** Units left when the store states a count ("Only 3 left in stock"). */
  stockQuantity?: number;
  /** A fee stated beside the price ("$0.55 eco fee might apply"). */
  fee?: string;
  deals?: ProductDeal[];
  /** When the soonest-ending running deal ends; null or absent when no deal shows an end. */
  dealEndsAt?: string | null;
  dealEndsEstimated?: boolean;
  history?: { at: string; amountMinor: number | null }[];
};
type CaptureStatus =
  | { id: string; status: "pending" }
  | { id: string; status: "failed"; message: string }
  | { id: string; status: "ready"; product: MobileProduct };
/** The API rejected the request or the worker finished the job as failed; resending the same input will not help. */
export class CaptureRejectedError extends UserFacingError {}
export { baseUrl } from "./api-base";
export const isMobileProduct = (p: unknown): p is MobileProduct => {
  const product = p as Partial<MobileProduct> | null;
  return (
    !!product &&
    typeof product.url === "string" &&
    URL.canParse(product.url) &&
    typeof product.title === "string" &&
    Array.isArray(product.images) &&
    product.images.every((i) => typeof i === "string") &&
    Array.isArray(product.offers) &&
    product.offers.length >= 1 &&
    product.offers.every(
      (o) =>
        typeof o?.amountMinor === "number" &&
        o.amountMinor > 0 &&
        typeof o.currency === "string" &&
        /^[A-Z]{3}$/.test(o.currency),
    )
  );
};
const isCaptureStatus = (value: unknown): value is CaptureStatus => {
  const body = value as Partial<Record<string, unknown>> | null;
  if (!body || typeof body.id !== "string") return false;
  if (body.status === "pending") return true;
  if (body.status === "failed") return typeof body.message === "string";
  return body.status === "ready" && isMobileProduct(body.product);
};
export function productUrl(
  value: string,
  message = "Paste a complete product link starting with https://",
): string {
  try {
    const url = new URL(value.trim());
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      value.length > 4096
    )
      throw new Error();
    return url.href;
  } catch {
    throw new UserFacingError(message);
  }
}
async function request(
  path: string,
  signal: AbortSignal,
  body?: object,
): Promise<CaptureStatus> {
  const response = await authorizedFetch(`${baseUrl}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  if (!response.ok) {
    if (response.status >= 500)
      throw new UserFacingError(
        "Mory is temporarily unavailable. Please try again.",
      );
    // Business rejections keep their wording; validation text becomes our own.
    const failure = await apiFailure(
      response,
      "Mory could not accept this request.",
    );
    throw new CaptureRejectedError(failure.message);
  }
  const result: unknown = await response.json();
  if (!isCaptureStatus(result))
    throw new UserFacingError(
      "Mory sent an unexpected reply. Please try again.",
    );
  return result;
}
function pause(signal: AbortSignal, ms: number) {
  return new Promise<void>((resolve, reject) => {
    const stop = () => {
      clearTimeout(timer);
      reject(new Error("Request stopped"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", stop);
      resolve();
    }, ms);
    if (signal.aborted) stop();
    else signal.addEventListener("abort", stop, { once: true });
  });
}
export async function startCapture(
  url: string,
  signal: AbortSignal,
  snapshot?: PageSnapshot,
): Promise<string> {
  const job = await request(
    snapshot ? "/products/snapshots" : "/products",
    signal,
    snapshot ?? { url },
  );
  return job.id;
}
export async function waitForCapture(
  id: string,
  signal: AbortSignal,
): Promise<MobileProduct> {
  let failures = 0;
  while (!signal.aborted) {
    let result: CaptureStatus;
    try {
      result = await request(`/products/${encodeURIComponent(id)}`, signal);
      failures = 0;
    } catch (error) {
      // The job keeps running server-side; ride out brief network or API outages.
      if (
        error instanceof CaptureRejectedError ||
        signal.aborted ||
        ++failures > 3
      )
        throw error;
      await pause(signal, 1000 * 2 ** failures);
      continue;
    }
    if (result.status === "ready") return result.product;
    if (result.status === "failed")
      throw new CaptureRejectedError(result.message);
    await pause(signal, 1000);
  }
  throw new Error("Request stopped");
}
