import type { MobileProduct } from "../products-api";

export type VisitResult =
  | { kind: "product"; product: MobileProduct; productProbability: number }
  /** A likely product page whose details could not be confirmed, often because it had not finished rendering. */
  | { kind: "unconfirmed" }
  /** A product page waiting for the shopper's size, colour or configuration choice. */
  | { kind: "needs_selection" }
  | { kind: "none" };

/** A visit's status from the server, or null while it is still pending. */
export function visitResult(
  body: { status?: string; productProbability?: unknown },
  readProduct: (body: unknown) => MobileProduct | null,
): VisitResult | null {
  if (body.status === "pending") return null;
  if (body.status === "unconfirmed") return { kind: "unconfirmed" };
  if (body.status === "needs_selection") return { kind: "needs_selection" };
  const product = body.status === "product" ? readProduct(body) : null;
  return product && typeof body.productProbability === "number"
    ? {
        kind: "product",
        product,
        productProbability: body.productProbability,
      }
    : { kind: "none" };
}

/** The product the server captured from this page recently, or null when the page must be read and uploaded. */
export function knownResult(
  body: { status?: string },
  readProduct: (body: unknown) => MobileProduct | null,
): VisitResult | null {
  const product = body.status === "product" ? readProduct(body) : null;
  // Recognised by URL, so it is a product page for certain.
  return product ? { kind: "product", product, productProbability: 1 } : null;
}
