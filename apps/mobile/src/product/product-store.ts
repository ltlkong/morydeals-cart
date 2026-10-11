import type { BrowserTarget } from "../merchants/MerchantPicker";
import type { MerchantCatalog } from "../merchants/merchants-api";

/** The in-app browser target for a product: its store's name and logo when the store is in the catalog. */
export function storeFor(
  url: string,
  catalog: MerchantCatalog | null,
): BrowserTarget {
  const host = new URL(url).hostname.toLowerCase();
  const merchant = catalog?.merchants.find((m) =>
    m.domains.some((domain) => host === domain || host.endsWith(`.${domain}`)),
  );
  return merchant
    ? {
        name: merchant.name,
        url,
        ...(merchant.logoUrl ? { logoUrl: merchant.logoUrl } : {}),
      }
    : { name: host.replace(/^www\./, ""), url };
}

/** The advertised discount, shown from 5% off; never rounds down to 0. */
export function percentOff(
  amountMinor: number,
  compareAtMinor: number | undefined,
): number | undefined {
  if (!compareAtMinor || compareAtMinor <= amountMinor) return;
  const percent = Math.max(
    1,
    Math.round(((compareAtMinor - amountMinor) / compareAtMinor) * 100),
  );
  return percent >= 5 ? percent : undefined;
}
