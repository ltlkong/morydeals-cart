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
import { rating } from '../shared/facts.ts';
import { plainHtml } from '../shared/html.ts';

/** A target.com product URL's TCIN ("/p/<slug>/-/A-85966253"). */
export function targetTcin(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.port || url.username || url.password || !['https:', 'http:'].includes(url.protocol))
      return;
    if (url.hostname.replace(/^www\./, '') !== 'target.com') return;
    return /^\/p\/(?:[^/]+\/)?-\/A-(\d{6,10})\/?$/i.exec(url.pathname)?.[1];
  } catch {
    return;
  }
}

/** The JSON a page freezes onto `window` as `'<name>': { …, value: deepFreeze(JSON.parse("…")) }`. */
function frozenJson(html: string, name: string): Record<string, unknown> | undefined {
  const start = html.indexOf(`'${name}'`);
  if (start < 0) return;
  const open = html.indexOf('JSON.parse("', start);
  if (open < 0 || open - start > 300) return;
  const body = /^((?:[^"\\]|\\.)*)"/s.exec(html.slice(open + 'JSON.parse("'.length))?.[1];
  if (body === undefined) return;
  try {
    return record(JSON.parse(JSON.parse(`"${body}"`)));
  } catch {
    return;
  }
}

export type TargetLocation = {
  key: string;
  store: string;
  zip?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
};
/**
 * What the product page uses to ask redsky for its price: the web API key (`__CONFIG__.services.redsky.apiKey`)
 * and the store and location Target assigned to the visitor (`__TGT_DATA__.serverLocationVariables`).
 */
export function targetLocation(html: string): TargetLocation | undefined {
  const config = frozenJson(html, '__CONFIG__');
  const data = frozenJson(html, '__TGT_DATA__');
  const key = text(record(record(record(config).services).redsky).apiKey);
  const where = record(record(data).serverLocationVariables);
  const store = text(where.store_id);
  if (!key || !/^[0-9a-f]{20,64}$/i.test(key) || !store || !/^\d{1,5}$/.test(store)) return;
  const location = record(where.location);
  return {
    key,
    store,
    zip: text(where.zipCode) ?? text(location.zipCode),
    state: text(location.state),
    latitude: text(location.latitude),
    longitude: text(location.longitude),
  };
}

/** The redsky aggregation the product page calls for its price (pdp_client_v1). */
export function targetPdpUrl(tcin: string, at: TargetLocation, page: string): string {
  const query = new URLSearchParams({
    key: at.key,
    tcin,
    is_bot: 'false',
    store_id: at.store,
    pricing_store_id: at.store,
    has_pricing_store_id: 'true',
    has_financing_options: 'true',
    include_obsolete: 'true',
    visitor_id: '',
    skip_personalized: 'true',
    skip_variation_hierarchy: 'true',
    channel: 'WEB',
    page: new URL(page).pathname,
  });
  if (at.zip) query.set('zip', at.zip);
  if (at.state) query.set('state', at.state);
  if (at.latitude) query.set('latitude', at.latitude);
  if (at.longitude) query.set('longitude', at.longitude);
  return `https://redsky.target.com/redsky_aggregations/v1/web/pdp_client_v1?${query}`;
}

const minor = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0
    ? toMinorUnits(value, 'USD')
    : undefined;

function read(document: PageDocument, issues: string[]): Product {
  const tcin = requireValue(
    targetTcin(document.requestedUrl ?? document.url),
    'Unsupported Target product URL',
  );
  const source = requireValue(document.target, 'Missing Target product data');
  check(source.tcin === tcin, 'Target data is for a different item');
  const parent = record(record(record(source.response).data).product);
  // A variation parent lists its sellable children; the URL's TCIN is either the item or one of them.
  const candidates = [parent, ...list(parent.children).map(record)].filter(
    (item) => text(item.tcin) === tcin,
  );
  check(candidates.length >= 1, 'Target API did not return this item');
  const item = candidates[0];
  const price = record(item.price ?? parent.price);
  const current = minor(price.current_retail);
  // A price range ("$19.99 - $24.99") is the parent's, not one item's price.
  const amountMinor = requireValue(
    current,
    price.current_retail_min != null
      ? 'Target shows a price range, not one item price'
      : 'Target API has no price for this item',
  );
  const regular = minor(price.reg_retail);
  const kind = text(price.formatted_current_price_type)?.toLowerCase();
  const percent =
    typeof price.save_percent === 'number' ? Math.round(price.save_percent) : undefined;
  const details = record(item.item ?? parent.item);
  const description = record(details.product_description);
  const title = requireValue(
    plainHtml(description.title) ?? plainHtml(record(parent.item).product_description),
    'Target title is missing',
  );
  const images = record(record(details.enrichment).images);
  const statistics = record(
    record(record(item.ratings_and_reviews ?? parent.ratings_and_reviews).statistics).rating,
  );
  const stars = rating(
    { value: statistics.average, scale: 5, count: statistics.count },
    'pdp_client_v1.ratings_and_reviews.statistics.rating',
  );
  const evidence = `redsky pdp_client_v1 (store ${source.store})`;
  if (kind && !['reg', 'sale', 'clearance'].includes(kind))
    issues.push(`Target price type ${kind}`);
  return {
    url: document.url,
    title,
    sku: tcin,
    brand: text(record(details.primary_brand).name),
    description: plainHtml(list(description.bullet_descriptions).join('\n')),
    ...(stars ? { rating: stars } : {}),
    images: imageUrls(
      [images.primary_image_url, ...list(images.alternate_image_urls)],
      document.url,
    ),
    evidence,
    offers: [
      {
        amountMinor,
        currency: 'USD',
        currencyEvidence: 'target.com prices in USD',
        ...(regular !== undefined && regular > amountMinor
          ? {
              compareAtAmountMinor: regular,
              compareAtEvidence: 'pdp_client_v1.price.reg_retail',
              compareAtLabel: 'Reg',
              ...(percent ? { savingsPercent: percent } : {}),
            }
          : {}),
        ...(kind === 'clearance'
          ? {
              promotions: [
                {
                  type: 'sale' as const,
                  text: 'Clearance',
                  evidence: 'pdp_client_v1.price.formatted_current_price_type',
                },
              ],
            }
          : {}),
        url: document.url,
        // Target prices by store: the price is the one for the store the page assigned.
        evidence,
      },
    ],
  };
}

export const parseTargetProduct = (document: PageDocument) =>
  parseRetailer('target-com', document, read);
