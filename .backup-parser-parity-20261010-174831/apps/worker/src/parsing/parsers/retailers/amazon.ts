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
} from '../shared/retailer.ts';
import { displayedMinorUnits } from '../money.ts';
import {
  conditionInText,
  countdownEnd,
  countdownMs,
  promotion,
  textRating,
  variant,
} from '../shared/facts.ts';
import type { Condition, Offer, Promotion } from '../types.ts';

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
/** Twister dimension keys (color_name) as names when the page shows no label. */
const dimensionName = (key: string) =>
  key
    .replace(/_name$/, '')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
/**
 * The variant the twister shows as selected: each dimension's chosen value (inline twister, or the classic
 * #variation_* rows). A subscription "configuration" is a way to buy, not a variant.
 */
function selectedVariant(root: HtmlNode, asin: string) {
  const options: { key: string; name?: string; value?: string }[] = [];
  for (const node of all(root, '[id^="inline-twister-expanded-dimension-text-"]')) {
    const key = node.attribs.id.slice('inline-twister-expanded-dimension-text-'.length);
    const label = node.parent ? textAt(node.parent, '.inline-twister-dim-title') : '';
    options.push({ key, name: label || dimensionName(key), value: content(node) });
  }
  for (const row of all(root, '[id^="variation_"]')) {
    const key = row.attribs.id.slice('variation_'.length);
    const value = textAt(row, '.selection');
    if (value)
      options.push({ key, name: textAt(row, 'label.a-form-label') || dimensionName(key), value });
  }
  return variant(
    options.filter((o) => !(o.key === 'configuration' && /subscri/i.test(o.value ?? ''))),
    '#twister selected dimensions',
    asin,
  );
}
/** The average rating and ratings count beside the title. */
function pageRating(root: HtmlNode) {
  const stars =
    one(root, '#acrPopover')?.attribs.title ||
    textAt(root, '#averageCustomerReviews .a-icon-alt') ||
    textAt(root, '#acrPopover .a-icon-alt');
  return textRating(stars, textAt(root, '#acrCustomerReviewText'), '#averageCustomerReviews');
}
/**
 * Deals shown with the selected offer (the regions morydeals-affiliate reads): a clip coupon, a limited-time or
 * lightning deal badge, a Prime member price and promotion messages. Text is kept as shown; nothing is computed.
 */
/** A countdown's own words inside a badge ("Ends in 05:12:33", "5h 12m left"), dropped from the deal's text. */
const COUNTDOWN_WORDS =
  /\s*(?:ends?\s+in|ending\s+in|expires?\s+in)?\s*(?:\d{1,3}:[0-5]\d:[0-5]\d|(?:\d{1,4}\s*(?:d|days?|h|hrs?|hours?|m|mins?|minutes?|s|secs?|seconds?)\b\s*)+)\s*(?:left)?\s*$/i;
/**
 * The limited-time / Lightning deal badge with what the page shows about its end. Amazon renders the time left
 * only in the browser: the badge's screen-reader labels ("Limited-time deal NO_OF_HOURS hours NO_OF_MINUTES
 * minutes" until the page script fills them in) and the visible timer. A filled countdown gives an estimated end:
 * the capture time plus the time shown. A Lightning Deal's "57% claimed" is kept as stated. Nothing else is
 * inferred: a badge with no countdown has no end.
 */
function amazonDeal(root: HtmlNode, capturedAt: string | undefined): Promotion | undefined {
  const badges = all(root, '#dealBadgeSupportingText, #dealBadge_feature_div .dealBadgeTextColor')
    .filter((node) => !hidden(node))
    .map((node) => content(node).replace(/\s*(?:Terms|Details)\s*$/i, ''));
  const labels = all(root, '#dealBadge_feature_div [id^="deals_countdown_timer_"]')
    .map(content)
    .filter((text) => /\d/.test(text) && !/NO_OF_/.test(text));
  const timers = [
    ...labels,
    ...all(root, '#dealTimer_feature_div, #dealBadge_feature_div')
      .filter((node) => !hidden(node))
      .map(content),
    ...badges,
  ];
  const countdown = timers.find((text) => countdownMs(text) !== undefined);
  // Mobile pages stamp the instant the badge counts down to on the timer itself: an exact end.
  const target = all(root, '#dealBadge_feature_div [data-target-time]')
    .map((node) => node.attribs['data-target-time'])
    .find((value) => /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})$/.test(value ?? ''));
  const words =
    badges.map((text) => text.replace(COUNTDOWN_WORDS, '').trim()).find(Boolean) ??
    labels.map((text) => text.replace(COUNTDOWN_WORDS, '').trim()).find(Boolean);
  const claimed = /(\d{1,3})\s*%\s*claimed/i.exec(textAt(root, '#dealProgress_feature_div'));
  // A badge that shows only its countdown ("Ends in 08:17:30") names no deal; it is still the page's deal badge.
  const shown = badges.length > 0 || labels.length > 0 || !!target;
  return promotion(
    'deal',
    words || (shown && (countdown || target) ? 'Deal' : undefined),
    target
      ? '#detailpage-dealBadge-countdown-timer[data-target-time]'
      : countdown
        ? '#dealBadge_feature_div countdown'
        : '#dealBadgeSupportingText',
    {
      validUntil: target ?? countdownEnd(countdown, capturedAt),
      validUntilEstimated: !target,
      ...(claimed ? { claimedPercent: +claimed[1] } : {}),
    },
  );
}
function pagePromotions(
  root: HtmlNode,
  region: HtmlNode,
  featured: boolean,
  capturedAt: string | undefined,
): Promotion[] {
  const read = (scope: HtmlNode, selector: string, type: Promotion['type']) =>
    all(scope, selector)
      .filter((node) => !hidden(node))
      .map((node) =>
        promotion(type, content(node).replace(/\s*(?:Terms|Details)\s*$/i, ''), selector),
      );
  return [
    ...read(region, '[id^="couponsInBuybox"], #couponText, #vpcButton, #couponFeature', 'coupon'),
    // Page-level badges belong to the featured new offer, never to a second-hand row.
    ...(featured
      ? [
          amazonDeal(root, capturedAt),
          ...read(root, '#primeSavingsUpsellCaption_feature_div', 'member'),
        ]
      : []),
    ...read(region, '#promotionMessageInsideBuyBox_feature_div', 'other'),
  ].filter((p): p is Promotion => !!p);
}
/**
 * The seller an offer row names: the merchant-info feature, the seller profile link, the row's abbreviated
 * "Ships from: … Sold by: …" header (how mobile used rows state it), or the "Sold by X and Fulfilled by Amazon" /
 * "Ships from and sold by X" line. Nothing when the row names no seller.
 */
function sellerIn(region: HtmlNode): string | undefined {
  const named =
    textAt(region, '#merchantInfoFeature_feature_div .offer-display-feature-text-message') ||
    textAt(region, '#sellerProfileTriggerId') ||
    textAt(region, '#merchant-info a[href*="seller="]');
  if (named) return named;
  for (const row of all(region, '#sfsb_accordion_head .a-row, .sfsb-header-text .a-row')) {
    const sold = /^sold by:?\s*(.+)$/i.exec(content(row));
    if (sold?.[1].trim()) return sold[1].trim();
  }
  const line =
    /(?:ships from and sold by|sold by)\s+(.+?)(?:\s+and\s+(?:fulfilled|shipped)\s+by\b.*)?\s*\.?\s*$/i.exec(
      textAt(region, '#merchant-info'),
    );
  return line?.[1].trim() || undefined;
}
/** Option types of a Subscribe & Save row: a subscription price for the new item. */
const SUBSCRIPTION = new Set(['SNS']);
/** Option types of an ordinary new one-time purchase; a bundle product's one-time row is typed BUNDLE. */
const NEW_PURCHASE = new Set(['NEW', 'BUNDLE']);
/** Option types of a second-hand one-time purchase (Used, Renewed, Amazon Warehouse / Resale). */
const SECOND_HAND = new Set(['USED', 'RENEWED', 'REFURBISHED', 'WAREHOUSE', 'RESALE']);
function read(document: PageDocument, issues: string[]): Product {
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
  check(title, 'Amazon title is missing');
  // A Renewed or Used listing is its own ASIN; its title states the condition of what it sells.
  const listed = conditionInText(title);
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
  // Every one-time purchase row is collected with its condition: new rows, and used / renewed / warehouse
  // rows. Subscriptions, membership upsells and other typed rows are not item prices and are skipped.
  type Entry = {
    region: ReturnType<typeof all>[number];
    kind: 'new' | 'second-hand' | 'featured' | 'subscription';
    type?: string;
  };
  const typed = rows.flatMap((row): Entry[] => {
    const types = values(row, '[data-csa-c-buying-option-type]', 'data-csa-c-buying-option-type');
    if (types.length && types.every((type) => NEW_PURCHASE.has(type)))
      return [{ region: row, kind: 'new' as const }];
    if (types.length && types.every((type) => SECOND_HAND.has(type)))
      return [{ region: row, kind: 'second-hand' as const, type: types[0] }];
    if (types.length && types.every((type) => SUBSCRIPTION.has(type)))
      return [{ region: row, kind: 'subscription' as const, type: types[0] }];
    return [];
  });
  const newRows = typed.filter((row) => row.kind === 'new');
  check(newRows.length <= 1, 'Amazon new one-time purchase option is ambiguous');
  const regions: Entry[] = rows.length
    ? typed
    : all(root, '#newAccordionRow_0').length
      ? [{ region: all(root, '#newAccordionRow_0')[0], kind: 'new' as const }]
      : [{ region: box, kind: 'featured' as const }];
  check(regions.length > 0, 'Amazon new one-time purchase option is ambiguous');
  const currencies = values(root, '#attach-currency-of-preference, #currencyOfPreference', 'value');
  const offerOf = (entry: Entry): Offer => {
    const region = entry.region;
    // Device pages (Kindle, Echo, Fire) buy through a buy-now form instead of the cart inputs.
    const identities = [
      ...new Set(
        values(
          region,
          mobile
            ? 'input[name="items[0.base][asin]"], form#buyNow input[name="asin"], input[name="snsAsin"]'
            : 'input[name="ASIN"], input[name="snsAsin"]',
          'value',
        ),
      ),
    ];
    check(
      identities.length === 1 && identities[0] === expected,
      'Amazon purchase option ASIN is unconfirmed',
    );
    const stated =
      textAt(region, '#conditionInfoFeature_feature_div') +
      ' ' +
      textAt(region, '.accordion-caption .a-text-bold');
    const subscription = entry.kind === 'subscription';
    check(
      subscription || !/subscribe|subscription|prime.member/i.test(stated),
      'Amazon purchase option is not a one-time purchase',
    );
    const condition: Condition | undefined = subscription
      ? 'new'
      : entry.kind === 'second-hand'
        ? (conditionInText(stated) ?? (entry.type === 'RENEWED' ? 'renewed' : 'used'))
        : entry.kind === 'new'
          ? (listed ?? 'new')
          : (conditionInText(stated) ?? listed ?? 'new');
    const regionCurrencies = values(
      region,
      'input[name$="[customerVisiblePrice][currencyCode]"]',
      'value',
    );
    check(
      [...currencies, ...regionCurrencies].every((v) => v === 'CAD'),
      'Amazon display currency conflicts with Canadian storefront',
    );
    const rowName = region.attribs['data-a-accordion-row-name'];
    // A Subscribe & Save row shows its first-delivery price (the tiered repeat price is hidden until chosen).
    const prices = labels(
      region,
      subscription && one(region, '#sns-base-price')
        ? '#sns-base-price .apex-pricetopay-value'
        : '.apex-pricetopay-value',
    );
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
    const seller = sellerIn(region);
    const stock = textAt(region, '#availability') || textAt(region, '#outOfStock');
    const evidence = `${purchaseRegion}/${rowName ?? 'featured'}${center ? ` + #${center.attribs.id}` : ''}`;
    const promotions = subscription
      ? [
          promotion(
            'other',
            textAt(region, '#snsUpsellMessage_feature_div .sns-delivery-buybox-upsell-message'),
            '#snsUpsellMessage_feature_div',
          ),
        ].filter((p): p is Promotion => !!p)
      : pagePromotions(root, region, entry.kind !== 'second-hand', document.fetchedAt);
    return {
      amountMinor: current,
      ...(former != null && former > current
        ? { compareAtAmountMinor: former, compareAtEvidence: `${evidence}/reference-price` }
        : {}),
      currency: 'CAD',
      currencyEvidence:
        currencies.length || regionCurrencies.length
          ? '#currencyOfPreference / purchase option'
          : 'storefront:amazon.ca',
      url: `https://www.amazon.ca/dp/${expected}`,
      seller: seller || undefined,
      ...(subscription ? { purchaseType: 'subscription' as const } : {}),
      availability: amazonStock(stock),
      ...(condition ? { condition } : {}),
      ...(promotions.length ? { promotions } : {}),
      evidence,
    };
  };
  // The featured offer decides the product: the new row when there is one, else the first second-hand row.
  const primary = newRows[0] ?? regions.find((entry) => entry.kind !== 'subscription');
  check(primary, 'Amazon has no one-time purchase option');
  const offers = [offerOf(primary)];
  for (const entry of regions)
    if (entry !== primary)
      try {
        const offer = offerOf(entry);
        // Subscribe & Save is sold by the featured offer's seller when its row names none.
        if (offer.purchaseType === 'subscription' && !offer.seller && offers[0].seller)
          offer.seller = offers[0].seller;
        offers.push(offer);
      } catch (error) {
        issues.push(`Amazon ${entry.type ?? 'other'} offer skipped: ${(error as Error).message}`);
      }
  offers.push(...otherOffers(root, expected, issues));
  const selection = selectedVariant(root, expected);
  const stars = pageRating(root);
  const url = `https://www.amazon.ca/dp/${expected}`;
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
    ...(selection ? { variant: selection } : {}),
    ...(stars ? { rating: stars } : {}),
    images: imageUrls(
      [mainImage, ...gallery.filter((src) => !mainId || !src.includes(`/I/${mainId}.`))],
      url,
    ),
    description: textAt(root, '#feature-bullets') || undefined,
    evidence: mobile ? 'canonical + #title + purchase option ASIN' : '#ASIN + #productTitle',
    offers,
  };
}
/**
 * The "All offers" panel (AOD) when the captured page holds it open: each offer's own condition heading
 * ("Used - Like New", "Renewed", "New"), price and seller. An offer is kept only when its own add-to-cart names
 * this ASIN and its price reads as one CAD amount; anything else is skipped, never guessed. The pinned offer
 * repeats the featured one and is not read again.
 */
function otherOffers(root: HtmlNode, expected: string, issues: string[]): Offer[] {
  const list = all(root, '#aod-offer-list #aod-offer');
  const offers: Offer[] = [];
  list.forEach((node, index) => {
    const evidence = `#aod-offer-list #aod-offer[${index}]`;
    const ids = [
      ...new Set(values(node, 'input[name="items[0.base][asin]"], input[name="ASIN"]', 'value')),
    ];
    const heading = textAt(node, '#aod-offer-heading');
    const amount = uniquePrice(labels(node, '.a-price:not(.a-text-price)'), true);
    const condition = /^\s*new\b/i.test(heading) ? 'new' : conditionInText(heading);
    if (ids.length !== 1 || ids[0] !== expected || amount == null || !condition) {
      issues.push(`Amazon other offer ${index + 1} skipped: identity, condition or price unclear`);
      return;
    }
    const seller =
      textAt(node, '#aod-offer-soldBy a') || textAt(node, '#aod-offer-soldBy .a-col-right');
    offers.push({
      amountMinor: amount,
      currency: 'CAD',
      currencyEvidence: 'storefront:amazon.ca',
      url: `https://www.amazon.ca/dp/${expected}`,
      ...(seller ? { seller } : {}),
      condition,
      evidence,
    });
  });
  return offers;
}
/** The buy box's stock line; a line it does not recognise stays unknown. */
function amazonStock(stock: string): string | undefined {
  if (/temporarily out of stock/i.test(stock) && /order now|deliver/i.test(stock))
    return 'BackOrder';
  if (/out of stock|unavailable/i.test(stock)) return 'OutOfStock';
  if (/only \d+ left in stock/i.test(stock)) return 'LimitedAvailability';
  if (/in stock/i.test(stock)) return 'InStock';
  if (/pre.?order/i.test(stock)) return 'PreOrder';
  return undefined;
}
export const parseAmazonProduct = (document: PageDocument) =>
  parseRetailer('amazon-ca', document, read);
