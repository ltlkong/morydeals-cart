import type { PageDocument, Product } from '../types.ts';
import { ShopifyStoreSchema } from '@morydeals/capture-contracts';
import { shopifyLink } from './selection.ts';
import {
  record,
  text,
  check,
  requireValue,
  amount,
  compareAt,
  imageUrls,
  parseRetailer,
} from '../shared/retailer.ts';

function read(document: PageDocument, issues: string[]): Product {
  const source = requireValue(document.storefront, 'Missing Shopify Storefront response');
  const { target } = source;
  ShopifyStoreSchema.parse({
    shopDomain: target.shopDomain,
    country: target.country,
    language: target.language,
    currency: target.currency,
  });
  const requested = shopifyLink(document.requestedUrl ?? document.url);
  const captured = shopifyLink(target.url);
  check(
    requested.url.href === captured.url.href &&
      (!requested.variantId || requested.variantId === target.variantId),
    'Shopify request identity mismatch',
  );
  check(/^[1-9]\d*$/.test(target.variantId), 'Invalid Shopify selected variant');
  const response = record(source.response);
  check(
    !response.errors || (Array.isArray(response.errors) && response.errors.length === 0),
    'Shopify Storefront returned GraphQL errors',
  );
  const context = record(record(response.extensions).context);
  check(
    context.country === target.country && context.language === target.language,
    'Shopify response market mismatch',
  );
  const data = record(response.data);
  const shop = record(data.shop);
  const primary = new URL(
    requireValue(text(record(shop.primaryDomain).url), 'Missing Shopify primary domain'),
  );
  check(
    primary.protocol === 'https:' &&
      !primary.username &&
      !primary.password &&
      !primary.port &&
      [requested.url.hostname.replace(/^www\./, ''), target.shopDomain].includes(
        primary.hostname.replace(/^www\./, ''),
      ),
    'Shopify response storefront mismatch',
  );
  const product = record(data.product);
  check(
    product.handle === requested.handle &&
      typeof product.id === 'string' &&
      /^gid:\/\/shopify\/Product\/[1-9]\d*$/.test(product.id),
    'Shopify product identity mismatch',
  );
  check(
    product.requiresSellingPlan === false,
    'Shopify subscription requirement is unconfirmed or mandatory',
  );
  const variant = record(data.selected);
  check(
    variant.id === `gid://shopify/ProductVariant/${target.variantId}` &&
      record(variant.product).id === product.id,
    'Shopify variant does not belong to the requested product',
  );
  const price = record(variant.price);
  const former = variant.compareAtPrice == null ? undefined : record(variant.compareAtPrice);
  check(
    price.currencyCode === target.currency && (!former || former.currencyCode === target.currency),
    'Shopify price currency mismatch',
  );
  check(
    typeof price.amount === 'string' && (!former || typeof former.amount === 'string'),
    'Shopify MoneyV2 amount must be a decimal string',
  );
  const current = amount(price.amount, target.currency);
  check(
    typeof variant.availableForSale === 'boolean' &&
      typeof variant.currentlyNotInStock === 'boolean',
    'Missing Shopify availability',
  );
  const name = requireValue(text(product.title), 'Missing Shopify product title');
  const option = requireValue(text(variant.title), 'Missing Shopify variant title');
  const url = new URL(target.url);
  url.searchParams.set('variant', target.variantId);
  url.hash = '';
  const evidence = 'storefront.data.selected';
  return {
    url: url.href,
    title: option === 'Default Title' ? name : `${name} - ${option}`,
    sku: text(variant.sku),
    variantId: target.variantId,
    brand: text(product.vendor),
    description: text(product.description),
    images: imageUrls([record(variant.image).url], url.href),
    evidence,
    offers: [
      {
        amountMinor: current,
        ...compareAt(
          former?.amount,
          current,
          target.currency,
          `${evidence}.compareAtPrice`,
          issues,
        ),
        currency: target.currency,
        currencyEvidence: `${evidence}.price.currencyCode`,
        url: url.href,
        seller: text(shop.name),
        availability: !variant.availableForSale
          ? 'OutOfStock'
          : variant.currentlyNotInStock
            ? 'BackOrder'
            : 'InStock',
        evidence: `${evidence}.price`,
      },
    ],
  };
}
export const parseShopifyStorefront = (document: PageDocument) =>
  parseRetailer('shopify', document, read);
