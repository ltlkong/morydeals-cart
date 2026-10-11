import { UserFacingError, apiFailure } from "./errors";
import type { PageSnapshot } from "@morydeals/capture-contracts/snapshot";
import { baseUrl } from "./api-base";
import { authorizedFetch } from "./session";
export type MobileProduct = {
  url: string;
  title: string;
  images: string[];
  brand?: string;
  offers: {
    amountMinor: number;
    compareAtAmountMinor?: number;
    currency: string;
    availability?: string;
    seller?: string;
  }[];
  /** The selected variant the store names, e.g. "Black · 256GB". */
  variant?: {
    id?: string;
    label: string;
    options: { name: string; value: string }[];
  };
  /** The store's published rating, e.g. 4.6 of 5 from 1,284 reviews. */
  rating?: { value: number; scale: number; count?: number };
  /** The shown offer's stock as the store states it; null or absent when it does not say. */
  availability?: ProductAvailability | null;
  /** The item's stated condition; null or absent when unstated (most stores sell new without saying so). */
  condition?: ProductCondition | null;
  /** Deals the store shows beside the price that are still running. */
  deals?: ProductDeal[];
  /** The cheapest offer of each other condition (new is the primary when the store has one). */
  otherOffers?: OtherOffer[];
  /** When the product was last captured. */
  observedAt?: string;
  /** Up to 90 days of prices from the server cart (Keepa Buy Box and our captures); null is a gap. */
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
  type: "sale" | "coupon" | "member" | "multi_buy" | "deal" | "other";
  text: string;
  code?: string;
  effectiveMinor?: number;
  validUntil?: string;
};
export type OtherOffer = {
  condition: ProductCondition;
  amountMinor: number;
  compareAtAmountMinor?: number;
  currency: string;
  seller?: string;
  availability?: ProductAvailability | null;
  deals?: ProductDeal[];
  count: number;
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
    product.offers.length === 1 &&
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
