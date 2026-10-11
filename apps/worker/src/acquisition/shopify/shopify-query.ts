import { shopifyLink, type ShopifyTarget } from '../../parsing/parsers/index.ts';

export const SHOPIFY_API_VERSION = '2026-10';
export const SHOPIFY_PRODUCT_QUERY = `query SelectedProduct($handle: String!, $variant: ID!, $country: CountryCode!, $language: LanguageCode!)
@inContext(country: $country, language: $language) {
  shop { name primaryDomain { url } }
  product(handle: $handle) { id handle title vendor description requiresSellingPlan }
  selected: node(id: $variant) {
    ... on ProductVariant {
      id title sku availableForSale currentlyNotInStock
      selectedOptions { name value }
      product { id }
      price { amount currencyCode }
      compareAtPrice { amount currencyCode }
      image { url }
    }
  }
}`;

export function shopifyQuery(target: ShopifyTarget) {
  return {
    query: SHOPIFY_PRODUCT_QUERY,
    variables: {
      handle: shopifyLink(target.url).handle,
      variant: `gid://shopify/ProductVariant/${target.variantId}`,
      country: target.country,
      language: target.language,
    },
  };
}
