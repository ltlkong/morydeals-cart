import { apiFailure } from "../errors";
import { baseUrl } from "../api-base";
import { productEntry } from "../product-data";
import type { MobileProduct } from "../products-api";

/** One page of the shared catalog (GET /catalog/products): pass `nextCursor` back as `cursor`; null is the end. */
export type CatalogPage = { items: MobileProduct[]; nextCursor: string | null };

/** The catalog is the same for everyone, so it needs no device token (like the store list). */
export async function getCatalogPage({
  cursor,
  merchant,
  limit,
  signal,
}: {
  cursor?: string | null;
  merchant?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<CatalogPage> {
  const query = new URLSearchParams();
  if (cursor) query.set("cursor", cursor);
  if (merchant) query.set("merchant", merchant);
  if (limit) query.set("limit", String(limit));
  const search = query.size ? `?${query}` : "";
  const response = await fetch(`${baseUrl}/catalog/products${search}`, {
    signal,
  });
  if (!response.ok)
    throw await apiFailure(
      response,
      "Could not load products. Please try again.",
    );
  const body = (await response.json()) as {
    items?: { product?: unknown; history?: unknown }[];
    nextCursor?: unknown;
  };
  return {
    items: (body.items ?? []).flatMap((item) => {
      const product = productEntry(item);
      return product ? [product] : [];
    }),
    nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null,
  };
}
