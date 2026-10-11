import { baseUrl } from "../api-base";
import type { MobileProduct } from "../products-api";
import { productEntry } from "../product-data";
import { authorizedFetch } from "../session";
import { apiFailure } from "../errors";

export type ListSummary = {
  id: string;
  name: string;
  itemCount: number;
  covers: string[];
  updatedAt: string;
  /** Whether the list holds the product asked about (only when one was). */
  contains?: boolean;
};
export type ListDetail = {
  id: string;
  name: string;
  products: MobileProduct[];
};

const json = (body: object) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function getLists(
  productUrl?: string,
  signal?: AbortSignal,
): Promise<ListSummary[]> {
  const query = productUrl ? `?url=${encodeURIComponent(productUrl)}` : "";
  const response = await authorizedFetch(`${baseUrl}/lists${query}`, {
    signal,
  });
  if (!response.ok)
    throw await apiFailure(response, "Could not load your lists.");
  const body = (await response.json()) as { lists?: ListSummary[] };
  return body.lists ?? [];
}
export async function createList(name: string, productUrl?: string) {
  const response = await authorizedFetch(`${baseUrl}/lists`, {
    method: "POST",
    ...json(productUrl ? { name, url: productUrl } : { name }),
  });
  if (!response.ok)
    throw await apiFailure(response, "Could not create the list.");
  return ((await response.json()) as { id: string }).id;
}
export async function getList(
  id: string,
  signal?: AbortSignal,
): Promise<ListDetail> {
  const response = await authorizedFetch(`${baseUrl}/lists/${id}`, { signal });
  if (!response.ok)
    throw await apiFailure(response, "Could not load this list.");
  const body = (await response.json()) as {
    id: string;
    name: string;
    items?: { product?: unknown; history?: unknown }[];
  };
  return {
    id: body.id,
    name: body.name,
    products: (body.items ?? []).flatMap((item) => {
      const product = productEntry(item);
      return product ? [product] : [];
    }),
  };
}
export async function renameList(id: string, name: string) {
  const response = await authorizedFetch(`${baseUrl}/lists/${id}`, {
    method: "PATCH",
    ...json({ name }),
  });
  if (!response.ok)
    throw await apiFailure(response, "Could not rename the list.");
}
export async function deleteList(id: string) {
  const response = await authorizedFetch(`${baseUrl}/lists/${id}`, {
    method: "DELETE",
  });
  if (!response.ok)
    throw await apiFailure(response, "Could not delete the list.");
}
export async function addToList(id: string, productUrl: string) {
  const response = await authorizedFetch(`${baseUrl}/lists/${id}/items`, {
    method: "PUT",
    ...json({ url: productUrl }),
  });
  if (!response.ok)
    throw await apiFailure(response, "Could not save to the list.");
}
export async function removeFromList(id: string, productUrl: string) {
  const response = await authorizedFetch(
    `${baseUrl}/lists/${id}/items?url=${encodeURIComponent(productUrl)}`,
    { method: "DELETE" },
  );
  if (!response.ok)
    throw await apiFailure(response, "Could not remove it from the list.");
}
