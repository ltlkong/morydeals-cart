import type { PageDocument, Product } from '../types.ts';
import {
  check,
  imageUrls,
  list,
  parseRetailer,
  record,
  requireValue,
  text,
} from '../shared/retailer.ts';
import { toMinorUnits } from '../money.ts';
import { rating, variant } from '../shared/facts.ts';
import { plainHtml } from '../shared/html.ts';

/** A homedepot.ca product URL's 10-digit article code ("/product/<slug>/1001769719", "/produit/…"). */
export function homeDepotProductId(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.port || url.username || url.password || !['https:', 'http:'].includes(url.protocol))
      return;
    if (url.hostname.replace(/^www\./, '') !== 'homedepot.ca') return;
    return /^\/(?:product|produit)\/(?:[^/]+\/)?(\d{10})\/?$/i.exec(url.pathname)?.[1];
  } catch {
    return;
  }
}

/** The page's server-rendered state (`<script id="hdca-state">`): the catalogue entry for this product only. */
export function homeDepotStateProduct(state: unknown, productId: string): unknown {
  const entry = record(record(state)[`product-${productId}`]);
  // A product that does not exist renders as a skeleton with every field null.
  return text(entry.code) === productId && text(entry.name) ? entry : undefined;
}

const STOCK: Record<string, string> = {
  instock: 'InStock',
  lowstock: 'LimitedAvailability',
  limitedstock: 'LimitedAvailability',
  outofstock: 'OutOfStock',
  backorder: 'BackOrder',
  preorder: 'PreOrder',
  discontinued: 'Discontinued',
};
const stockStatus = (value: unknown) =>
  STOCK[text(record(value).stockLevelStatus)?.toLowerCase() ?? ''];

/**
 * The localized row for this product (`products-localized-basic` answers a list, one row per product asked for).
 */
function localizedRow(value: unknown, productId: string): Record<string, unknown> {
  const rows = list(value).map(record);
  const own = rows.filter((row) => [row.productId, row.code].map(text).includes(productId));
  check(own.length === 1, 'Home Depot localized price does not name this product');
  return own[0];
}

function read(document: PageDocument, issues: string[]): Product {
  const productId = requireValue(
    homeDepotProductId(document.requestedUrl ?? document.url),
    'Unsupported Home Depot product URL',
  );
  const source = requireValue(document.homeDepot, 'Missing Home Depot product data');
  check(source.productId === productId, 'Home Depot data is for a different product');
  const product = record(
    requireValue(
      homeDepotStateProduct({ [`product-${productId}`]: source.product }, productId),
      'Home Depot page has no product entry',
    ),
  );
  const row = localizedRow(source.localized, productId);
  const optimized = record(row.optimizedPrice);
  const shown = record(optimized.displayPrice);
  const status = text(optimized.productStatus) ?? text(row.productStatus);
  const currency = text(shown.currencyIso) ?? 'CAD';
  check(currency === 'CAD', 'Home Depot price is not in CAD');
  // No display price (status "OU" and similar) is no online price at this store: the catalogue price is not one.
  const amountMinor = requireValue(
    shown.value == null ? undefined : toMinorUnits(shown.value, currency),
    `Home Depot shows no online price at store ${source.store}${status ? ` (status ${status})` : ''}`,
  );
  check(amountMinor > 0, 'Home Depot price is zero');
  const was = record(optimized.wasprice).value;
  const wasMinor = was == null ? undefined : toMinorUnits(was, currency);
  const percent = /^(\d{1,2})\s*%$/.exec(text(optimized.percentSaving) ?? '')?.[1];
  // A unit other than "each" is part of what the price buys ("$4.50 /linear foot").
  const unit = text(shown.unitOfMeasureCode)?.toUpperCase();
  if (unit && unit !== 'EA')
    issues.push(`Home Depot price is per ${text(shown.unitOfMeasure) ?? unit}`);
  const availability = stockStatus(row.stock) ?? stockStatus(product.stock);
  const crumbs = list(product.breadCrumbs)
    .map(record)
    .flatMap((crumb) => {
      const title = text(crumb.title);
      return title && crumb.categoryId != null && title !== productId ? [title] : [];
    });
  const specifications = [
    ...(text(product.modelNumber) ? [{ name: 'Model #', value: text(product.modelNumber)! }] : []),
    ...list(product.classifications)
      .flatMap((group) => list(record(group).features))
      .map(record)
      .flatMap((feature) => {
        const name = text(feature.name);
        const value = list(feature.featureValues)
          .map((v) => text(record(v).value))
          .filter(Boolean)
          .join(', ');
        const symbol = text(record(feature.featureUnit).symbol);
        return name && value
          ? [
              {
                name,
                value:
                  symbol && !value.endsWith(symbol) && !name.includes(symbol)
                    ? `${value} ${symbol}`
                    : value,
              },
            ]
          : [];
      }),
  ]
    .filter((spec, i, all) => all.findIndex((s) => s.name === spec.name) === i)
    .slice(0, 30);
  const selection = variant(
    list(product.variantOptionsSorted)
      .map(record)
      .map((option) => ({
        name: option.name,
        value: record(option.selectedVariantOptionQualifier).value,
      })),
    'hdca-state.variantOptionsSorted',
    productId,
  );
  const stars = rating(
    { value: product.averageRating, scale: 5, count: product.numberOfReviews },
    'hdca-state.averageRating',
  );
  const badges = list(product.badges).flatMap((badge) => {
    const name = text(badge) ?? text(record(badge).name) ?? text(record(badge).label);
    return name ? [name] : [];
  });
  const url = `https://www.homedepot.ca/${source.lang === 'fr' ? 'produit' : 'product'}/${productId}`;
  return {
    url: document.url,
    title: requireValue(text(product.name), 'Home Depot title is missing'),
    brand: text(product.manufacturer),
    sku: productId,
    description: plainHtml(product.description),
    ...(selection ? { variant: selection } : {}),
    ...(stars ? { rating: stars } : {}),
    ...(badges.length ? { badges } : {}),
    ...(crumbs.length ? { categories: crumbs } : {}),
    ...(specifications.length ? { specifications } : {}),
    images: imageUrls(
      [...list(product.images), ...list(product.alternateImages)].map((image) => record(image).url),
      url,
    ),
    offers: [
      {
        amountMinor,
        currency,
        currencyEvidence: 'products-localized-basic.optimizedPrice.displayPrice.currencyIso',
        ...(wasMinor !== undefined && wasMinor > amountMinor
          ? {
              compareAtAmountMinor: wasMinor,
              compareAtEvidence: 'products-localized-basic.optimizedPrice.wasprice',
              compareAtLabel: 'Was',
              ...(percent ? { savingsPercent: Number(percent) } : {}),
            }
          : {}),
        ...(availability ? { availability } : {}),
        url: document.url,
        // The price and stock are the store's: Home Depot prices by store.
        evidence: `products-localized-basic (store ${source.store})`,
      },
    ],
    evidence: `hdca-state product-${productId} + products-localized-basic store ${source.store}`,
  };
}

export const parseHomeDepotProduct = (document: PageDocument) =>
  parseRetailer('homedepot-ca', document, read);
