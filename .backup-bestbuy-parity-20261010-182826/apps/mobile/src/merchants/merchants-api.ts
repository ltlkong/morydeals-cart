import { apiFailure } from "../errors";
import { baseUrl } from "../api-base";
export type Merchant = {
  id: string;
  name: string;
  homeUrl: string;
  logoUrl: string | null;
  domains: string[];
};
export type MerchantCatalog = { merchants: Merchant[]; allowOthers: boolean };
export async function getMerchants(
  signal: AbortSignal,
): Promise<MerchantCatalog> {
  const response = await fetch(`${baseUrl}/merchants`, { signal });
  if (!response.ok)
    throw await apiFailure(
      response,
      "Could not load stores. Please try again.",
    );
  return response.json();
}
