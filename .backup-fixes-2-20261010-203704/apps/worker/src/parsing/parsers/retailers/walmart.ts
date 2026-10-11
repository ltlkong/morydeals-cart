import type { PageDocument, Product } from '../types.ts';
import { all, content, htmlDocument, plainHtml, type HtmlNode } from '../shared/html.ts';
import {
  amount,
  check,
  checkLoaded,
  compareAt,
  imageUrls,
  oneOrMany,
  list,
  merchantUrl,
  parseRetailer,
  record,
  requireValue,
  text,
} from '../shared/retailer.ts';
import { aggregateRating, promotion, rating, schemaCondition, variant } from '../shared/facts.ts';
import type { Promotion } from '../types.ts';

function itemId(value: string): string {
  return requireValue(
    /^\/(?:en|fr)\/ip\/(?:[^/]+\/)?([A-Z0-9]+)\/?$/i.exec(
      merchantUrl(value, 'walmart.ca').pathname,
    )?.[1],
    'Unsupported Walmart product URL',
  );
}
function read(document: PageDocument, issues: string[]): Product {
  const expected = itemId(document.requestedUrl ?? document.url);
  check(itemId(document.url) === expected, 'Walmart redirected to a different item');
  const root = htmlDocument(requireValue(document.html, 'Walmart requires original HTML'));
  const scripts = all(root, 'script#__NEXT_DATA__');
  check(scripts.length === 1, 'Missing or ambiguous Walmart page data');
  const state = record(JSON.parse(content(scripts[0])));
  const data = record(record(record(record(state.props).pageProps).initialData).data);
  const url = new URL(document.url);
  url.search = '';
  url.hash = '';
  // In-app (client-side) navigation leaves __NEXT_DATA__ describing the first page loaded.
  if (data.product === undefined) return renderedProduct(root, url, expected);
  // Only the page's selected product, never recommendation cards or other sellers' offers.
  const product = record(data.product);
  check(product.usItemId === expected, 'Walmart selected item mismatch');
  const price = record(product.priceInfo);
  const current = record(price.currentPrice);
  check(current.currencyUnit === 'CAD', 'Walmart current price currency mismatch');
  const currentMinor = amount(current.price, 'CAD');
  const former = record(price.wasPrice);
  check(
    former.price == null || former.currencyUnit === 'CAD',
    'Walmart former price currency mismatch',
  );
  const evidence = '__NEXT_DATA__.props.pageProps.initialData.data.product';
  const availability = (
    {
      IN_STOCK: 'InStock',
      OUT_OF_STOCK: 'OutOfStock',
      PREORDER: 'PreOrder',
    } as Record<string, string>
  )[String(product.availabilityStatus)];
  // Each variant dimension names its chosen value with selected: true.
  const options = variant(
    list(product.variantCriteria).map((raw) => {
      const criterion = record(raw);
      const chosen = list(criterion.variantList)
        .map(record)
        .filter((v) => v.selected === true);
      return { name: criterion.name, value: chosen.length === 1 ? chosen[0].name : undefined };
    }),
    `${evidence}.variantCriteria`,
    expected,
  );
  const stars = rating(
    { value: product.averageRating, count: product.numberOfReviews },
    `${evidence}.averageRating`,
  );
  // Walmart's own price flags, worded as the page shows them (morydeals-price: Rollback / Clearance / Reduced price).
  const codes = record(price.priceDisplayCodes);
  const promotions = (
    [
      ['rollback', 'Rollback'],
      ['clearance', 'Clearance'],
      ['reducedPrice', 'Reduced price'],
    ] as const
  ).flatMap(([flag, words]) => {
    const found =
      codes[flag] === true
        ? promotion('sale', words, `${evidence}.priceInfo.priceDisplayCodes.${flag}`)
        : undefined;
    return found ? [found] : [];
  }) satisfies Promotion[];
  return {
    url: url.href,
    title: requireValue(text(product.name), 'Missing Walmart product title'),
    sku: expected,
    ...(options ? { variant: options } : {}),
    ...(stars ? { rating: stars } : {}),
    brand: text(product.brand),
    description: plainHtml(product.shortDescription),
    images: imageUrls(
      list(record(product.imageInfo).allImages).map((image) => record(image).url),
      url.href,
    ),
    evidence,
    offers: [
      {
        amountMinor: currentMinor,
        ...compareAt(
          former.price,
          currentMinor,
          'CAD',
          `${evidence}.priceInfo.wasPrice.price`,
          issues,
        ),
        currency: 'CAD',
        currencyEvidence: `${evidence}.priceInfo.currentPrice.currencyUnit`,
        seller: text(product.sellerName),
        availability,
        ...(promotions.length ? { promotions } : {}),
        url: url.href,
        evidence: `${evidence}.priceInfo.currentPrice.price`,
      },
    ],
  };
}
const schemaAvailability: Record<string, string> = {
  'https://schema.org/InStock': 'InStock',
  'https://schema.org/OutOfStock': 'OutOfStock',
  'https://schema.org/PreOrder': 'PreOrder',
};
/** The schema.org Product Walmart renders for the current route; used only when page data is stale. */
function renderedProduct(root: HtmlNode, url: URL, expected: string): Product {
  const scripts = all(root, 'script[type="application/ld+json"][data-seo-id="schema-org-product"]');
  // Neither page data nor a rendered product: the app read the page before it rendered.
  checkLoaded(scripts.length > 0, 'Walmart page had not finished loading');
  check(scripts.length === 1, 'Missing or ambiguous Walmart page data');
  // A product with sizes or colours renders a ProductGroup whose variants carry their own offers.
  const candidates = oneOrMany(JSON.parse(content(scripts[0])))
    .map(record)
    .flatMap((entry) =>
      entry['@type'] === 'ProductGroup'
        ? list(entry.hasVariant)
            .map(record)
            .map((variant) => ({
              ...variant,
              brand: variant.brand ?? entry.brand,
              aggregateRating: variant.aggregateRating ?? entry.aggregateRating,
            }))
        : [entry],
    )
    .filter((entry) => entry.sku === expected);
  check(candidates.length === 1, 'Walmart selected item mismatch');
  const product = candidates[0];
  // Schema.org allows a single offer object.
  const offers = oneOrMany(product.offers).map(record);
  check(offers.length === 1, 'Walmart offer missing or ambiguous');
  const offer = offers[0];
  check(
    typeof offer.url === 'string' && itemId(offer.url) === expected,
    'Walmart selected item mismatch',
  );
  // Every condition is collected; the offer carries the one it states (itemCondition).
  check(offer.priceCurrency === 'CAD', 'Walmart current price currency mismatch');
  const evidence = 'script[data-seo-id="schema-org-product"]';
  const stars = aggregateRating(product.aggregateRating, `${evidence}.aggregateRating`);
  const condition = schemaCondition(offer.itemCondition);
  return {
    url: url.href,
    title: requireValue(text(product.name), 'Missing Walmart product title'),
    sku: expected,
    ...(stars ? { rating: stars } : {}),
    brand: text(record(product.brand).name),
    images: imageUrls(oneOrMany(product.image), url.href),
    evidence,
    offers: [
      {
        amountMinor: amount(offer.price, 'CAD'),
        currency: 'CAD',
        currencyEvidence: `${evidence}.offers[0].priceCurrency`,
        availability: schemaAvailability[String(offer.availability)],
        ...(condition ? { condition } : {}),
        url: url.href,
        evidence: `${evidence}.offers[0].price`,
      },
    ],
  };
}
export const parseWalmartProduct = (document: PageDocument) =>
  parseRetailer('walmart-ca', document, read);
