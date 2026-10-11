export type {
  PageDocument,
  Offer,
  Product,
  ProductVariant,
  ProductRating,
  VariantOption,
  ParseResult,
  ParserStrategy,
} from './types.ts';
export {
  AVAILABILITY,
  canonicalProducts,
  identityUrl,
  schemaAvailability,
} from './shared/facts.ts';
export {
  parseProductDocument,
  jsonLdStrategy,
  openGraphStrategy,
  PARSER_VERSION,
} from './parser.ts';
export type { LlmProvider, LlmRequest, LlmResponse, LlmMetrics } from './llm/types.ts';
export { productPrompt, LLM_PROMPT_VERSION } from './llm/product-prompt.ts';
export { normalizeLlmProduct } from './llm/product-output.ts';

export { toMinorUnits, currencyDecimals } from './money.ts';
export { parseShopifyProduct } from './shopify/index.ts';

export { parseAmazonProduct } from './retailers/amazon.ts';
export { parseBestBuyProduct } from './retailers/bestbuy.ts';
export { parseNeweggProduct } from './retailers/newegg.ts';
export type { ShopifyTarget } from './shopify/store.ts';
export { resolveShopifyTarget, shopifyLink } from './shopify/selection.ts';
export { detectShopify } from './shopify/detection.ts';

export { amazonPageChallenge } from './retailers/amazon-page.ts';

export { parseWalmartProduct } from './retailers/walmart.ts';
export { parseCtcProduct } from './retailers/ctc.ts';
export { parseHomeDepotProduct, homeDepotProductId } from './retailers/homedepot.ts';
export { parseTargetProduct, targetTcin } from './retailers/target.ts';
export { amazonStore } from './retailers/amazon-page.ts';
export { retailerForUrl } from './retailers/routing.ts';
export { htmlCaptureStrategy } from './html-capture.ts';
