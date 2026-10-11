import type { PageDocument, Product } from '../types.ts';
import {
  all,
  assignedJson,
  content,
  htmlDocument,
  one,
  plainHtml,
  textAt,
  values,
  type HtmlNode,
} from '../shared/html.ts';
import {
  record,
  list,
  text,
  requireValue,
  check,
  checkLoaded,
  amount,
  compareAt,
  imageUrls,
  oneOrMany,
  merchantUrl,
  parseRetailer,
} from '../shared/retailer.ts';
import {
  aggregateRating,
  conditionInText,
  promotion,
  rating,
  schemaCondition,
  variant,
} from '../shared/facts.ts';
import type { Condition } from '../types.ts';

function sku(url: string): string {
  const path = merchantUrl(url, 'bestbuy.ca').pathname;
  return requireValue(
    /^\/en-ca\/product\/(?:[^/]+\/)?(\d{6,9})\/?$/i.exec(path)?.[1],
    'Unsupported Best Buy product URL',
  );
}
function gallery(product: Record<string, unknown>, url: string): string[] {
  const selected = new Map<string, { area: number; url: string }>();
  const groups = record(product.media).images;
  for (const group of Array.isArray(groups) ? groups : Object.values(record(groups))) {
    for (const rendition of Object.values(record(group))) {
      const image = record(rendition);
      const source = text(image.url);
      if (!source) continue;
      const size = record(image.size);
      const area = Number(size.width ?? 0) * Number(size.height ?? 0);
      const key = source.split('?')[0].split('/').pop()!;
      if (!selected.has(key) || area > selected.get(key)!.area)
        selected.set(key, { area, url: source });
    }
  }
  for (const value of [
    product.highResImage,
    product.productImage,
    ...list(product.additionalImages),
  ]) {
    const source = text(value);
    if (source) {
      const key = source.split('?')[0].split('/').pop()!;
      if (!selected.has(key)) selected.set(key, { area: 0, url: source });
    }
  }
  return servable(
    imageUrls(
      [...selected.values()].map((v) => v.url),
      url,
    ),
  );
}
/**
 * Best Buy publishes every photo at 500x500; larger renditions exist only for some (17158465 and 19893114 answer 404
 * at 1500x1500, 1000x1000, 800x800 and 600x600), though the page state lists 1500x1500 for all. No page field tells
 * which exist, so every gallery image is stored at 500x500: smaller than 1500 but always there.
 */
export const BEST_BUY_IMAGE_SIZE = '500x500';
const servable = (images: string[]) => [
  ...new Set(
    images.map((image) => {
      const shown = RENDITION.exec(image);
      return shown && /(^|\.)bbycastatic\.ca$/i.test(new URL(image).hostname)
        ? `${shown[1]}${BEST_BUY_IMAGE_SIZE}${shown[3]}`
        : image;
    }),
  ),
];
/** Specifications as the page groups them ("Display", "Connectivity", …), flattened; the model number first. */
function stateSpecifications(product: Record<string, unknown>, model: string | undefined) {
  const rows: { name: string; value: string }[] = model
    ? [{ name: 'Model Number', value: model }]
    : [];
  for (const group of Object.values(record(product.specs)))
    for (const entry of list(group).map(record)) {
      const name = text(entry.name);
      const value = text(entry.value);
      if (name && value && !rows.some((row) => row.name === name)) rows.push({ name, value });
    }
  const included = list(product.whatsIncluded).map(text).filter(Boolean);
  if (included.length) rows.push({ name: "What's Included", value: included.join('; ') });
  return rows.slice(0, 80);
}
/** The product's own badges ("Top Deal", "Best Seller"): those in its summary, never other products' tiles. */
const pageBadges = (root: HtmlNode) => [
  ...new Set(
    all(root, '[data-automation="layout-product-summary"] [data-automation="promo-badge"]')
      .map((node) => content(node).trim())
      .filter((badge) => badge && badge.length <= 40),
  ),
];
/** The product's special offers ("Get $200 off … when you buy …"), each the page states once, with its id. */
function specialOffers(page: Record<string, unknown>, evidence: string) {
  return list(page.specialOffers)
    .map(record)
    .map((offer) =>
      promotion('other', offer.promotionText, `${evidence}.specialOffers`, {
        promotionId: text(offer.promotionId),
        validUntil: offer.endDate ?? offer.promotionEndDate,
      }),
    )
    .filter((deal): deal is NonNullable<typeof deal> => !!deal);
}
/**
 * The product's own price block: its offer details, or (when the page has not filled them in yet) its buy box. Other
 * products' tiles sit outside both.
 */
function priceBlock(root: HtmlNode): HtmlNode | undefined {
  for (const name of ['layout-product-offer-details', 'layout-product-state-actions']) {
    const blocks = all(root, `[data-automation="${name}"]`);
    if (blocks.length === 1 && one(blocks[0], '[data-automation="product-price"]'))
      return blocks[0];
  }
  return undefined;
}
/** "Plus $0.95 EHF": the environmental handling fee the product's own price block states. */
function shownFee(root: HtmlNode): string | undefined {
  const block = priceBlock(root);
  if (!block) return undefined;
  const fee = /Plus\s+\$\s?(\d+(?:\.\d{1,2})?)\s+(?:in\s+)?EHF/i.exec(content(block))?.[1];
  return fee && Number(fee) > 0 ? ehfText(Number(fee)) : undefined;
}
const ehfText = (fee: number) => `$${fee.toFixed(2)} environmental handling fee`;
function read(document: PageDocument, issues: string[]): Product {
  const expected = sku(document.requestedUrl ?? document.url);
  check(sku(document.url) === expected, 'Best Buy redirected to a different SKU');
  const root = htmlDocument(requireValue(document.html, 'Best Buy requires original HTML'));
  const state = record(assignedJson(root, '__INITIAL_STATE__'));
  const page = record(state.product);
  const product = record(page.product);
  // In-app navigation from another page leaves that page's state behind (no product, another route).
  const route = text(record(record(state.routing).locationBeforeTransitions).pathname) ?? '';
  if (product.sku == null && !route.includes(expected))
    return renderedProduct(root, expected, state);
  check(String(product.sku) === expected, 'Best Buy selected SKU mismatch');
  const title = requireValue(text(product.name), 'Missing Best Buy product title');
  const selectedOptions = list(product.productVariants)
    .flatMap(list)
    .map(record)
    .filter((v) => String(v.sku) === expected);
  check(
    !/monthly\s+(financing|tab)/i.test(title) &&
      !selectedOptions.some(
        (v) =>
          /monthly\s+(financing|tab)/i.test(text(v.name) ?? '') ||
          (text(v.label)?.toLowerCase().replaceAll(' ', '_') === 'wireless_carrier' &&
            v.value !== 'Unlocked'),
      ),
    'Best Buy carrier financing is not a product price',
  );
  const seller = record(product.seller);
  const marketplace = product.isMarketplace === true;
  const sellerName = marketplace
    ? requireValue(text(seller.name), 'Missing marketplace seller')
    : 'Best Buy Canada';
  if (!marketplace)
    check(
      (seller.id == null || seller.id === 'bbyca') &&
        (!text(seller.name) || ['Best Buy', 'Best Buy Canada'].includes(String(seller.name))),
      'Conflicting Best Buy seller',
    );
  // A Best Buy SKU is one seller's item in one condition: its stated grade ("Brand New", "Open Box",
  // "Refurbished (Excellent)", "Used - Good") or, ungraded, the title's words. An ungraded item is Best Buy's
  // new item, first-party or Marketplace alike (a Marketplace listing that is not new states a grade).
  const grade = text(product.grade);
  const condition: Condition | undefined = grade
    ? /^(new|brand new)$/i.test(grade)
      ? 'new'
      : (conditionInText(grade) ?? 'used')
    : (conditionInText(title) ?? 'new');
  check(
    [product.currency, product.currencyCode, product.priceCurrency].every(
      (value) => value == null || value === 'CAD',
    ),
    'Best Buy price currency mismatch',
  );
  const current = amount(
    product.salePrice ?? product.priceWithoutEhf ?? product.regularPrice,
    'CAD',
  );
  const availability = record(page.availability);
  check(
    availability.sku == null || String(availability.sku) === expected,
    'Best Buy availability SKU mismatch',
  );
  const shipping = record(availability.shipping);
  const status = text(shipping.status) ?? '';
  const stock =
    shipping.purchasable === true && /^InStock/i.test(status)
      ? 'InStock'
      : shipping.purchasable === true && /pre.?order/i.test(status)
        ? 'PreOrder'
        : shipping.purchasable === false &&
            /^(OutOfStock|NotAvailable|SoldOut|SoldOutOnline)$/i.test(status)
          ? 'OutOfStock'
          : undefined;
  const url = `https://www.bestbuy.ca/en-ca/product/${expected}`;
  const evidence = 'window.__INITIAL_STATE__.product.product';
  const options = variant(
    selectedOptions.map((v) => ({ name: v.label, value: v.value })),
    `${evidence}.productVariants`,
    expected,
  );
  const stars = rating(
    { value: product.customerRating, count: product.customerRatingCount },
    `${evidence}.customerRating`,
  );
  const former = compareAt(
    product.regularPrice,
    current,
    'CAD',
    `${evidence}.regularPrice`,
    issues,
  );
  // A sale below the regular price, ending at saleEndDate (epoch ms or an ISO instant with its offset), as
  // morydeals-price reads it: an exact end, the one the page counts down to. When Best Buy itself hides the end
  // (hideSaleEndDate), the page shows none, and none is kept.
  const end =
    product.hideSaleEndDate === true
      ? undefined
      : typeof product.saleEndDate === 'number'
        ? new Date(product.saleEndDate).toISOString()
        : product.saleEndDate;
  // The sale is a deal of its own only by its end: without one it just restates the struck regular price, which the
  // offer already carries.
  const sale =
    product.isOnSale === true && former.compareAtAmountMinor && end
      ? promotion('sale', 'Sale', `${evidence}.isOnSale`, { validUntil: end })
      : undefined;
  // The "SAVE $X" Best Buy states beside a sale price (product.saving), kept only when it is not just regular − sale.
  const saving =
    typeof product.saving === 'number' && product.saving > 0 ? Math.round(product.saving * 100) : 0;
  if (
    sale &&
    saving &&
    Number.isSafeInteger(saving) &&
    saving !== (former.compareAtAmountMinor ?? 0) - current
  )
    sale.amountOffMinor = saving;
  const clearance =
    product.isClearance === true
      ? promotion('sale', 'Clearance', `${evidence}.isClearance`)
      : undefined;
  const deals = [
    sale,
    clearance,
    ...specialOffers(page, 'window.__INITIAL_STATE__.product'),
  ].filter((p): p is NonNullable<typeof p> => !!p);
  const model = text(product.modelNumber);
  // The environmental handling fee Best Buy adds at checkout, when it states one: the state's, else the price block's
  // "Plus $X EHF" (the state can say 0 while the page, for the shopper's province, states one).
  const ehf =
    typeof product.ehf === 'number' && product.ehf > 0 ? ehfText(product.ehf) : shownFee(root);
  const specifications = stateSpecifications(product, model);
  const categories = list(record(page.category).categoryBreadcrumb)
    .map((entry) => text(record(entry).name))
    .filter((name): name is string => !!name && name !== 'All Categories');
  const badges = [...pageBadges(root), ...(product.isOnlineOnly === true ? ['Online only'] : [])];
  return {
    url,
    title,
    sku: expected,
    ...(options ? { variant: options } : {}),
    ...(stars ? { rating: stars } : {}),
    brand: text(product.brandName),
    ...(specifications.length ? { specifications } : {}),
    ...(categories.length ? { categories } : {}),
    ...(badges.length ? { badges } : {}),
    description: plainHtml(product.longDescription) ?? plainHtml(product.shortDescription),
    images: gallery(product, url),
    evidence,
    offers: [
      {
        amountMinor: current,
        ...former,
        currency: 'CAD',
        currencyEvidence: 'storefront:bestbuy.ca',
        seller: sellerName,
        availability: stock,
        ...(condition ? { condition } : {}),
        ...(deals.length ? { promotions: deals } : {}),
        ...(ehf ? { fee: ehf } : {}),
        url,
        evidence: `${evidence}.salePrice|priceWithoutEhf|regularPrice`,
      },
    ],
  };
}
const schemaAvailability: Record<string, string> = {
  'http://schema.org/InStock': 'InStock',
  'https://schema.org/InStock': 'InStock',
  'http://schema.org/OutOfStock': 'OutOfStock',
  'https://schema.org/OutOfStock': 'OutOfStock',
  'http://schema.org/PreOrder': 'PreOrder',
  'https://schema.org/PreOrder': 'PreOrder',
};
/**
 * The product React renders for the current route; used only when the page state is stale. Its SKU must agree with the
 * canonical link and the shown Web Code. Accessory cards carry offer microdata with other prices; it is never read.
 */
function renderedProduct(
  root: HtmlNode,
  expected: string,
  state: Record<string, unknown>,
): Product {
  const scripts = all(root, 'script#product-json-ld');
  // In-app navigation changes the address before the page: the DOM is still the previous page (its own canonical).
  checkLoaded(
    scripts.length > 0 ||
      values(root, 'link[rel="canonical"]', 'href').some((href) => href.includes('/product/')),
    'Best Buy page had not finished loading',
  );
  check(scripts.length === 1, 'Best Buy page data is stale and has no rendered product');
  const product = record(JSON.parse(content(scripts[0])));
  check(
    String(product['@type']) === 'Product' && String(product.sku) === expected,
    'Best Buy selected SKU mismatch',
  );
  const canonical = values(root, 'link[rel="canonical"]', 'href');
  check(canonical.length === 1 && sku(canonical[0]) === expected, 'Best Buy selected SKU mismatch');
  const codes = all(root, '[data-automation="SKU_ID"]').map(
    (node) => /\d{6,9}/.exec(content(node))?.[0],
  );
  check(
    codes.length > 0 && codes.every((code) => code === expected),
    'Best Buy selected SKU mismatch',
  );
  const title = requireValue(text(product.name), 'Missing Best Buy product title');
  const offered = product.offers;
  const offers = (Array.isArray(offered) ? offered : offered ? [offered] : []).map(record);
  check(offers.length === 1, 'Best Buy offer missing or ambiguous');
  check(offers[0].priceCurrency === 'CAD', 'Best Buy price currency mismatch');
  // The rendered offer's itemCondition, else the title's words; Best Buy's own unmarked item is new.
  const condition = schemaCondition(offers[0].itemCondition) ?? conditionInText(title) ?? 'new';
  const url = `https://www.bestbuy.ca/en-ca/product/${expected}`;
  const evidence = 'script#product-json-ld';
  const current = amount(offers[0].price, 'CAD');
  const shown = renderedGallery(root, expected);
  const stars = aggregateRating(product.aggregateRating, `${evidence}.aggregateRating`);
  const saving = renderedSaving(root, current);
  // A shown saving is a sale; the page states its end ("Sale ends: October 15, 2026*") and the structured data the
  // exact instant (offers.priceValidUntil, as the state's saleEndDate). Without a shown end, none is kept.
  const block = priceBlock(root);
  const ends = !!block && /Sale ends:/i.test(content(block));
  // Its "SAVE $X" is the struck price the offer carries; the sale is a deal of its own only by that end.
  const sale =
    saving.compareAtAmountMinor && ends
      ? promotion('sale', 'Sale', '[data-automation="product-saving"]', {
          validUntil: offers[0].priceValidUntil,
        })
      : undefined;
  const special = block
    ? all(block, '[data-automation="special-offer-tile"]')
        .map((tile) =>
          promotion(
            'other',
            content(tile)
              .replace(/^\s*See \d+ special offers? available\s*/i, '')
              .trim(),
            '[data-automation="special-offer-tile"]',
          ),
        )
        .filter((deal): deal is NonNullable<typeof deal> => !!deal)
    : [];
  const deals = [sale, ...special].filter((p): p is NonNullable<typeof p> => !!p);
  const model =
    text(product.model) ??
    /^Model:\s*(\S.*)$/i.exec(textAt(root, '[data-automation="MODEL_NUMBER_ID"]').trim())?.[1];
  const categories = breadcrumb(root);
  const badges = pageBadges(root);
  const fee = shownFee(root);
  return {
    url,
    title,
    sku: expected,
    ...(stars ? { rating: stars } : {}),
    brand: text(record(product.brand).name),
    ...(model ? { specifications: [{ name: 'Model Number', value: model }] } : {}),
    ...(categories.length ? { categories } : {}),
    ...(badges.length ? { badges } : {}),
    // The structured data names one thumbnail; the page shows the product's whole gallery.
    images: servable(
      shown.length
        ? shown
        : first(
            imageUrls(oneOrMany(product.image), url).map((image) => largestRendition(image, root)),
            stateImages(state, expected),
          ),
    ),
    evidence,
    offers: [
      {
        amountMinor: current,
        currency: 'CAD',
        currencyEvidence: `${evidence}.offers.priceCurrency`,
        ...saving,
        // The structured availability, else the price block's own "Available to ship".
        availability:
          schemaAvailability[String(offers[0].availability)] ??
          (block && /Available to ship/i.test(content(block)) ? 'InStock' : undefined),
        condition,
        ...(deals.length ? { promotions: deals } : {}),
        ...(fee ? { fee } : {}),
        url,
        evidence: `${evidence}.offers.price`,
      },
    ],
  };
}
const PRICE = /\$\s?([\d,]+(?:\.\d{2})?)/;
/**
 * Best Buy shows a sale as the current price and "SAVE $X", never the regular price; its page data defines the
 * regular price as their sum. Only the product's own pricing block counts, and only when it shows the structured price.
 */
function renderedSaving(root: HtmlNode, current: number) {
  const block = priceBlock(root);
  if (!block) return {};
  const shown = PRICE.exec(content(one(block, '[data-automation="product-price"]')))?.[1];
  const saving = /^SAVE\s*\$\s?([\d,]+(?:\.\d{2})?)$/i.exec(
    content(one(block, '[data-automation="product-saving"]')).trim(),
  )?.[1];
  if (!shown || !saving || amount(shown.replaceAll(',', ''), 'CAD') !== current) return {};
  const savingMinor = amount(saving.replaceAll(',', ''), 'CAD');
  return savingMinor > 0
    ? {
        compareAtAmountMinor: current + savingMinor,
        compareAtEvidence: '[data-automation="product-price"] + [data-automation="product-saving"]',
      }
    : {};
}
/** The page's category path (its BreadcrumbList), without Home and the product itself. */
function breadcrumb(root: HtmlNode): string[] {
  for (const script of all(root, 'script[type="application/ld+json"]')) {
    let data: unknown;
    try {
      data = JSON.parse(content(script));
    } catch {
      continue;
    }
    if (record(data)['@type'] !== 'BreadcrumbList') continue;
    return list(record(data).itemListElement)
      .flatMap((entry) => (Array.isArray(entry) ? entry : [entry]))
      .map((entry) => text(record(record(entry).item).name) ?? text(record(entry).name))
      .filter((name): name is string => !!name && !/^(home|product details)$/i.test(name));
  }
  return [];
}
const first = (...candidates: string[][]) => candidates.find((images) => images.length) ?? [];
/**
 * Before its gallery loads, the page's photo of the same SKU can still sit in the previous page's state (a search or
 * listing entry). Only images are taken from it, never prices.
 */
function stateImages(state: unknown, expected: string): string[] {
  const found = new Set<string>();
  const queue: unknown[] = [state];
  for (let visited = 0; queue.length && visited < 50_000; visited++) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) queue.push(...node);
    else {
      const entry = node as Record<string, unknown>;
      const image = text(entry.highResImage);
      if (String(entry.sku) === expected && image && RENDITION.test(image)) found.add(image);
      queue.push(...Object.values(entry));
    }
  }
  return imageUrls([...found], 'https://www.bestbuy.ca/');
}
/**
 * The product's gallery as the page shows it (thumbnails named by its SKU: 20099717.jpg, 20099717_1.jpg, …), in
 * order and at the size Best Buy publishes for every photo (500x500). Other products' images carry their own SKUs.
 */
function renderedGallery(root: HtmlNode, expected: string): string[] {
  const photos = new Map<string, { index: number; url: string }>();
  for (const source of values(root, 'img[src]', 'src')) {
    const shown = RENDITION.exec(source.split('?')[0]);
    const name =
      shown &&
      new RegExp(`^/${expected}(?:_(\\d+))?\\.(?:jpe?g|png|webp)$`, 'i').exec(
        shown[3].slice(shown[3].lastIndexOf('/')),
      );
    if (!shown || !name) continue;
    photos.set(shown[3], {
      index: Number(name[1] ?? 0),
      url: `${shown[1]}${BEST_BUY_IMAGE_SIZE}${shown[3]}`,
    });
  }
  return [...photos.values()].sort((a, b) => a.index - b.index).map((photo) => photo.url);
}
/** Best Buy names renditions by size (/multimedia/products/100x100/…); use the largest one the page shows. */
const RENDITION = /^(.*\/multimedia\/products\/)(\d+)x\d+(\/.+)$/;
function largestRendition(image: string, root: HtmlNode): string {
  const wanted = RENDITION.exec(image);
  if (!wanted) return image;
  let best = { image, size: Number(wanted[2]) };
  for (const source of values(root, 'img[src]', 'src')) {
    const shown = RENDITION.exec(source);
    if (shown && shown[1] === wanted[1] && shown[3] === wanted[3] && Number(shown[2]) > best.size)
      best = { image: source, size: Number(shown[2]) };
  }
  return best.image;
}
export const parseBestBuyProduct = (document: PageDocument) =>
  parseRetailer('bestbuy-ca', document, read);
