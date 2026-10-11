import { baseUrl } from "../api-base";
import type { MobileProduct } from "../products-api";
import { productEntry } from "../product-data";
import { authorizedFetch } from "../session";
import { apiFailure } from "../errors";

/** The server cart's products, newest first; items the worker has not stored yet are left out. */
export async function getCart(signal?: AbortSignal): Promise<MobileProduct[]> {
  const response = await authorizedFetch(`${baseUrl}/cart`, { signal });
  if (!response.ok)
    throw await apiFailure(
      response,
      "Could not load your cart. Please try again.",
    );
  const body = (await response.json()) as {
    items?: { product?: unknown; history?: unknown }[];
  };
  return (body.items ?? []).flatMap((item) => {
    const product = productEntry(item);
    return product ? [product] : [];
  });
}
export async function addToCart(url: string) {
  const response = await authorizedFetch(`${baseUrl}/cart/items`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!response.ok)
    throw await apiFailure(response, "Could not save to your cart.");
}
export async function removeFromCart(url: string) {
  const response = await authorizedFetch(
    `${baseUrl}/cart/items?url=${encodeURIComponent(url)}`,
    { method: "DELETE" },
  );
  if (!response.ok)
    throw await apiFailure(response, "Could not remove this from your cart.");
}
