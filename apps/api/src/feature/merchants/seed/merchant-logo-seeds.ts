/**
 * Storefront logo sources used by the local seed command. The favicon service
 * returns PNGs so native Image can render every seed consistently.
 * The source URL is only an import location; the API stores the resulting
 * object id and resolves its public URL through core/storage.
 */
export const MERCHANT_LOGO_SEEDS = [
  {
    merchantId: "amazon-ca",
    sourceUrl: "https://www.google.com/s2/favicons?domain=www.amazon.ca&sz=128",
  },
  {
    merchantId: "walmart-ca",
    sourceUrl:
      "https://www.google.com/s2/favicons?domain=www.walmart.ca&sz=128",
  },
  {
    merchantId: "bestbuy-ca",
    sourceUrl:
      "https://www.google.com/s2/favicons?domain=www.bestbuy.ca&sz=128",
  },
  {
    merchantId: "newegg-ca",
    sourceUrl: "https://www.google.com/s2/favicons?domain=www.newegg.ca&sz=128",
  },
  {
    merchantId: "lululemon-ca",
    sourceUrl:
      "https://www.google.com/s2/favicons?domain=shop.lululemon.com&sz=128",
  },
  {
    merchantId: "uniqlo-ca",
    sourceUrl:
      "https://www.google.com/s2/favicons?domain=www.uniqlo.com&sz=128",
  },
  {
    merchantId: "canadiantire-ca",
    sourceUrl:
      "https://www.google.com/s2/favicons?domain=www.canadiantire.ca&sz=128",
  },
] as const;
