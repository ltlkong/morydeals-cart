import type { PageSnapshot } from "@morydeals/capture-contracts/snapshot";
import { baseUrl } from "../api-base";
import type { MobileProduct } from "../products-api";
import { authorizedFetch } from "../session";
import { productEntry } from "../product-data";
import { apiFailure } from "../errors";
import { knownResult, visitResult, type VisitResult } from "./visit-result";

export { shouldVisit } from "./visit-filter";

export type { VisitResult } from "./visit-result";

/**
 * The product the server captured from this page in the last 12 hours, so the page need not be uploaded again; null
 * when it must be read. Failures count as unknown: the normal visit still runs.
 */
export async function knownPage(
  url: string,
  signal: AbortSignal,
): Promise<VisitResult | null> {
  try {
    const response = await authorizedFetch(`${baseUrl}/pages/known`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
      signal,
    });
    if (!response.ok) return null;
    return knownResult(
      (await response.json()) as { status?: string },
      (value) =>
        productEntry(value as { product?: unknown; history?: unknown }),
    );
  } catch {
    return null;
  }
}

/** Uploads a browsed page; the server says whether it is a product page and records products in history. */
export async function visitPage(
  snapshot: PageSnapshot,
  signal: AbortSignal,
): Promise<VisitResult> {
  return visit(`${baseUrl}/pages`, snapshot, signal);
}
/**
 * Sends only a browsed page's link (page uploads paused): the server's worker fetches the page itself and records it
 * in history when it is a product page.
 */
export async function visitLink(
  url: string,
  signal: AbortSignal,
): Promise<VisitResult> {
  return visit(`${baseUrl}/pages/links`, { url }, signal);
}
async function visit(
  endpoint: string,
  body: PageSnapshot | { url: string },
  signal: AbortSignal,
): Promise<VisitResult> {
  const submitted = await authorizedFetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!submitted.ok) return { kind: "none" };
  const { id } = (await submitted.json()) as { id?: unknown };
  if (typeof id !== "string") return { kind: "none" };
  for (let attempt = 0; attempt < 90 && !signal.aborted; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await authorizedFetch(
      `${baseUrl}/pages/${encodeURIComponent(id)}`,
      { signal },
    );
    if (!response.ok) return { kind: "none" };
    const body = (await response.json()) as {
      status?: string;
      productProbability?: unknown;
    };
    // With its price history, so the strip's product page shows the chart.
    const result = visitResult(body, (value) =>
      productEntry(value as { product?: unknown; history?: unknown }),
    );
    if (result) return result;
  }
  return { kind: "none" };
}

export async function getHistory(
  signal?: AbortSignal,
): Promise<MobileProduct[]> {
  const response = await authorizedFetch(`${baseUrl}/history`, { signal });
  if (!response.ok)
    throw await apiFailure(response, "Could not load your browsing history.");
  const body = (await response.json()) as {
    items?: { product?: unknown; history?: unknown }[];
  };
  return (body.items ?? []).flatMap((item) => {
    const product = productEntry(item);
    return product ? [product] : [];
  });
}
