import { amazonPageChallenge } from './amazon-page.ts';
import type { PageDocument, Product } from '../types.ts';
import { all, one, content, textAt, values, htmlDocument, type HtmlNode } from '../shared/html.ts';
import {
  requireValue,
  check,
  checkLoaded,
  imageUrls,
  merchantUrl,
  parseRetailer,
  NON_NEW,
} from '../shared/retailer.ts';
import { displayedMinorUnits } from '../money.ts';

function asin(value: string): string {
  const url = merchantUrl(value, 'amazon.ca');
  return requireValue(
    /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|$)/i
      .exec(url.pathname)?.[1]
      ?.toUpperCase(),
    'Unsupported Amazon product URL',
  );
}
function hidden(node: HtmlNode): boolean {
  for (let current: HtmlNode | null = node; current; current = current.parent) {
    if (
      'attribs' in current &&
      // aria-hidden only hides from assistive technology; Amazon uses it on visible list prices.
      (current.attribs.hidden !== undefined ||
        /(?:^|\s)aok-hidden(?:\s|$)/.test(current.attribs.class ?? '') ||
        /display\s*:\s*none|visibility\s*:\s*hidden/i.test(current.attribs.style ?? ''))
    )
      return true;
  }
  return false;
}
function labels(root: HtmlNode, selector: string): string[] {
  return [
    ...new Set(
      all(root, selector)
        .filter((node) => !hidden(node))
        .flatMap((node) => {
          const accessible = all(node, '.a-offscreen').map(content).filter(Boolean);
          if (accessible.length) return accessible;
          const whole = textAt(node, '.a-price-whole').replace(/\.$/, '');
          const fraction = textAt(node, '.a-price-fraction');
          if (whole && fraction) return [`${textAt(node, '.a-price-symbol')}${whole}.${fraction}`];
          return content(node) ? [content(node)] : [];
        }),
    ),
  ];
}
function uniquePrice(labels: string[], required: boolean): number | undefined {
  if (!labels.length && !required) return;
  // A price widget still may contain a monthly amount or another currency.
  check(
    labels.every((value) =>
      /^(?:(?:CAD|CDN|CA|C)?\s*\$\s*|CAD\s+)?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?(?:\s*CAD)?$/.test(
        value,
      ),
    ),
    'Amazon price label is not a full CAD amount',
  );
  const amounts = labels.map((value) => displayedMinorUnits(value, 'CAD'));
  check(
    amounts.length && amounts.every((v) => v !== undefined) && new Set(amounts).size === 1,
    'Amazon price missing, ambiguous, or not a product amount',
  );
  return amounts[0];
}
/** Option types of an ordinary new one-time purchase; a bundle product's one-time row is typed BUNDLE. */
const NEW_PURCHASE = new Set(['NEW', 'BUNDLE']);
function read(document: PageDocument): Product {
  const challenge = amazonPageChallenge(document.url, 200, document.html);
  check(!challenge, challenge ?? 'Amazon verification page');
  const requested = asin(document.requestedUrl ?? document.url);
  const root = htmlDocument(requireValue(document.html, 'Amazon requires original HTML'));
  const mobile = !!one(root, '#mobile_buybox_feature_div');
  // A capture taken before client rendering holds only the page frame.
  checkLoaded(
    !!one(root, '#ASIN, #productTitle, #title, #mobile_buybox_feature_div, #desktop_buybox'),
    'Amazon page had not finished loading',
  );
  const shown = mobile
    ? values(root, 'link[rel="canonical"]', 'href').map(asin)
    : values(root, '#ASIN', 'value');
  // Switching a variant in-page refreshes the buy box but keeps the canonical
  // link of the variant first loaded; accept that only for a sibling variant
  // while the URL's variant is the checked option.
  const variants = mobile ? all(root, 'li[data-defaultasin]') : [];
  const variant = (value: string, checked: boolean) =>
    variants.some(
      (node) =>
        node.attribs['data-defaultasin'] === value &&
        (!checked || one(node, '[aria-checked="true"]')),
    );
  // An in-page switch can also leave the URL on the first variant. The page then shows the switched
  // one; follow it only when the buy box and the checked swatch agree on a sibling of the URL's variant.
  const selling = mobile
    ? [
        ...new Set(
          values(root, '#mobile_buybox_feature_div input[name="items[0.base][asin]"]', 'value'),
        ),
      ]
    : [];
  const switched =
    selling.length === 1 &&
    selling[0] !== requested &&
    variant(selling[0], true) &&
    variant(requested, false);
  const expected = switched ? selling[0] : requested;
  check(
    shown.length === 1 &&
      (shown[0] === expected || (variant(expected, true) && variant(shown[0], false))),
    'Amazon selected ASIN mismatch',
  );
  if (asin(document.url) !== requested) {
    const canonical = values(root, 'link[rel="canonical"]', 'href');
    check(
      canonical.length === 1 && asin(canonical[0]) === requested,
      'Amazon redirected to a different ASIN',
    );
  }
  const title = textAt(root, mobile ? '#title' : '#productTitle');
  check(title && !NON_NEW.test(title), 'Amazon title is missing or product is not new');
  const purchaseRegion = mobile ? '#mobile_buybox_feature_div' : '#desktop_buybox';
  const boxes = all(root, `${purchaseRegion} #buybox`);
  const candidates = boxes.length ? boxes : all(root, purchaseRegion);
  check(candidates.length === 1, 'Amazon purchase region missing or ambiguous');
  const box = candidates[0];
  check(
    !one(box, '#unqualifiedBuyBox') || one(box, '#qualifiedBuybox'),
    'Amazon has no featured offer',
  );
  const rows = all(box, '[data-a-accordion-row-name]').filter((row) =>
    one(row, '[data-csa-c-buying-option-type]'),
  );
  const newRows = rows.filter((row) => {
    const types = values(row, '[data-csa-c-buying-option-type]', 'data-csa-c-buying-option-type');
    return types.length > 0 && types.every((type) => NEW_PURCHASE.has(type));
  });
  const regions = rows.length
    ? newRows
    : all(root, '#newAccordionRow_0').length
      ? all(root, '#newAccordionRow_0')
      : [box];
  check(regions.length === 1, 'Amazon new one-time purchase option is ambiguous');
  const region = regions[0];
  // Device pages (Kindle, Echo, Fire) buy through a buy-now form instead of the cart inputs.
  const identities = [
    ...new Set(
      values(
        region,
        mobile
          ? 'input[name="items[0.base][asin]"], form#buyNow input[name="asin"]'
          : 'input[name="ASIN"]',
        'value',
      ),
    ),
  ];
  check(
    identities.length === 1 && identities[0] === expected,
    'Amazon purchase option ASIN is unconfirmed',
  );
  const condition =
    textAt(region, '#conditionInfoFeature_feature_div') +
    ' ' +
    textAt(region, '.accordion-caption .a-text-bold');
  check(
    !NON_NEW.test(condition) && !/subscribe|subscription|prime.member/i.test(condition),
    'Amazon purchase option is not an ordinary new offer',
  );
  const currencies = [
    ...values(root, '#attach-currency-of-preference, #currencyOfPreference', 'value'),
    ...values(region, 'input[name$="[customerVisiblePrice][currencyCode]"]', 'value'),
  ];
  check(
    currencies.every((v) => v === 'CAD'),
    'Amazon display currency conflicts with Canadian storefront',
  );
  const rowName = region.attribs['data-a-accordion-row-name'];
  const prices = labels(region, '.apex-pricetopay-value');
  if (!prices.length) prices.push(...labels(region, '.offer-price'));
  const centers = mobile
    ? // Single-offer mobile pages show the price only in the main price display;
      // the buy box then holds just a quantity subtotal.
      rows.length || prices.length
      ? []
      : all(root, '#corePriceDisplay_mobile_feature_div').filter((n) => !hidden(n))
    : rows.length
      ? all(root, '[id]').filter((n) => n.attribs.id === `apex_desktop_${rowName}`)
      : all(root, '#apex_desktop').filter((n) => !one(n, '[id^="apex_desktop_"]'));
  check(centers.length <= 1, 'Ambiguous Amazon price center');
  const center = centers[0];
  if (center) prices.push(...labels(center, '.apex-pricetopay-value, .apexPriceToPay'));
  const current = requireValue(uniquePrice(prices, true), 'Missing Amazon price');
  const references = labels(
    region,
    '.a-text-price:not(.apex-priceperunit-value):not([data-a-color="price"])',
  );
  if (mobile) references.push(...labels(region, '.apex-basisprice-value'));
  if (center)
    references.push(
      ...labels(
        center,
        '.apex-basisprice-value, table.a-lineitem .a-text-price[data-a-strike="true"]',
      ),
    );
  const former = uniquePrice(references, false);
  check(former == null || former >= current, 'Amazon reference price is below current price');
  const seller =
    textAt(region, '#merchantInfoFeature_feature_div .offer-display-feature-text-message') ||
    textAt(region, '#sellerProfileTriggerId') ||
    textAt(region, '#merchant-info a[href*="seller="]');
  const stock = textAt(region, '#availability') || textAt(region, '#outOfStock');
  const url = `https://www.amazon.ca/dp/${expected}`;
  const evidence = `${purchaseRegion}/${rowName ?? 'featured'}${center ? ` + #${center.attribs.id}` : ''}`;
  const image = one(root, mobile ? '#main-image' : '#landingImage');
  // The mobile gallery: one carousel item per slide, in order, naming its image even before the slide has loaded
  // (unloaded slides hold only loader images). Videos are skipped; any image id is served at full size as SL1500.
  const gallery = mobile
    ? all(root, '#image-block li[data-csa-c-media-type="IMAGE"]').flatMap((node) => {
        const id = node.attribs['data-csa-c-content-id'];
        return id && /^[A-Za-z0-9+-]{6,}$/.test(id)
          ? [`https://m.media-amazon.com/images/I/${id}._AC_SL1500_.jpg`]
          : [];
      })
    : [];
  const mainImage =
    image?.attribs['data-a-hires'] || image?.attribs['data-old-hires'] || image?.attribs.src;
  // The main image is loaded at its page rendition; its carousel item repeats its id.
  const mainId = mainImage && /\/images\/I\/([^.]+)\./.exec(mainImage)?.[1];
  return {
    url,
    title,
    sku: expected,
    images: imageUrls(
      [mainImage, ...gallery.filter((src) => !mainId || !src.includes(`/I/${mainId}.`))],
      url,
    ),
    description: textAt(root, '#feature-bullets') || undefined,
    evidence: mobile ? 'canonical + #title + purchase option ASIN' : '#ASIN + #productTitle',
    offers: [
      {
        amountMinor: current,
        ...(former != null && former > current
          ? {
              compareAtAmountMinor: former,
              compareAtEvidence: `${evidence}/reference-price`,
            }
          : {}),
        currency: 'CAD',
        currencyEvidence: currencies.length
          ? '#currencyOfPreference / purchase option'
          : 'storefront:amazon.ca',
        url,
        seller: seller || undefined,
        availability: /out of stock|unavailable/i.test(stock)
          ? 'OutOfStock'
          : /in stock/i.test(stock)
            ? 'InStock'
            : /pre.?order/i.test(stock)
              ? 'PreOrder'
              : undefined,
        evidence,
      },
    ],
  };
}
export const parseAmazonProduct = (document: PageDocument) =>
  parseRetailer('amazon-ca', document, read);
