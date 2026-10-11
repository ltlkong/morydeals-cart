import type { PageDocument, Product, Promotion } from '../types.ts';
import { all, content, htmlDocument, one, textAt, type HtmlNode } from '../shared/html.ts';
import {
  check,
  checkLoaded,
  imageUrls,
  oneOrMany,
  parseRetailer,
  record,
  requireValue,
  text,
} from '../shared/retailer.ts';
import { displayedMinorUnits } from '../money.ts';
import { promotion, schemaAvailability, schemaCondition } from '../shared/facts.ts';

/**
 * Canadian Tire Corporation storefronts share one platform (Canadian Tire, SportChek). Their JSON-LD offer price
 * includes the environmental fee and is missing on some pages, so the price is the rendered buy box's.
 */
const CTC_HOSTS = ['canadiantire.ca', 'sportchek.ca'];
const PDP = /^\/(?:en|fr)\/pdp\/(?:[^/]+-)?(\d{6,10}[a-z]?)\.html$/i;

/** The product code a Canadian Tire / SportChek product URL names ("…-1842143p.html"), else undefined. */
export function ctcProductCode(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (url.port || url.username || url.password || !['https:', 'http:'].includes(url.protocol))
      return;
    if (!CTC_HOSTS.includes(url.hostname.replace(/^www\./, ''))) return;
    return PDP.exec(url.pathname)?.[1]?.toLowerCase();
  } catch {
    return;
  }
}

function jsonLd(root: HtmlNode): Record<string, unknown>[] {
  return all(root, 'script[type="application/ld+json"]').flatMap((script) => {
    try {
      return oneOrMany(JSON.parse(content(script))).map(record);
    } catch {
      return [];
    }
  });
}
const isType = (node: Record<string, unknown>, type: string) =>
  oneOrMany(node['@type']).includes(type);
const money = (value: string) =>
  /\$\s?\d/.test(value)
    ? displayedMinorUnits(value.replace(/^.*?(\$\s?[\d,]+(?:\.\d+)?).*$/, '$1'), 'CAD')
    : undefined;

/**
 * Online availability from the buy box: in stock when any way to buy online (pick up, delivery, ship to home)
 * is available, out of stock when the page says so or none is; otherwise what the JSON-LD offer states.
 */
function availability(box: HtmlNode, root: HtmlNode, offer: Record<string, unknown>) {
  const ways = all(box, '.nl-buy-online__list-item').map((item) => content(item));
  if (ways.some((way) => /\bavailable\b|\bin stock\b/i.test(way) && !/\bunavailable\b/i.test(way)))
    return { availability: 'InStock', evidence: '.nl-buy-online__list-item' };
  const notice = textAt(root, '.nl-buy-online__fulfillment-title');
  if (
    (ways.length && ways.every((way) => /\bunavailable\b/i.test(way))) ||
    /out of stock/i.test(notice)
  )
    return { availability: 'OutOfStock', evidence: '.nl-buy-online__fulfillment-title' };
  const stated = schemaAvailability(offer.availability);
  return stated ? { availability: stated, evidence: 'jsonLd.offers.availability' } : {};
}

function read(document: PageDocument, issues: string[]): Product {
  const code = requireValue(
    ctcProductCode(document.requestedUrl ?? document.url),
    'Unsupported Canadian Tire product URL',
  );
  check(ctcProductCode(document.url) === code, 'Canadian Tire redirected to a different product');
  const root = htmlDocument(requireValue(document.html, 'Missing Canadian Tire page HTML'));
  const heading = textAt(root, 'h1.nl-product__title');
  const box = one(root, 'div.nl-buy-box');
  // The buy box renders in the browser; a page read before it is incomplete, not a product without a price.
  checkLoaded(heading && box, 'Canadian Tire buy box has not rendered');
  const priceBlock = all(box!, '.nl-price').find((node) => node.parent === box);
  const shown = priceBlock ? textAt(priceBlock, '.nl-price--charge') : '';
  const current = requireValue(money(shown), 'Canadian Tire buy box shows no price');
  const sku = code.replace(/[a-z]$/i, '');
  const nodes = jsonLd(root);
  const products = nodes.filter((node) => isType(node, 'Product'));
  const product =
    products.find((node) => text(node.sku) === sku) ?? (products.length === 1 ? products[0] : {});
  const offer = record(oneOrMany(product.offers)[0]);
  const was = priceBlock
    ? money(textAt(priceBlock, '.nl-price--was-eco s') || textAt(priceBlock, '.nl-price--was s'))
    : undefined;
  const save = priceBlock ? textAt(priceBlock, '.nl-price__save-story-label') : '';
  const percent = /save\s+(\d{1,2})\s*%/i.exec(save)?.[1];
  const fee = priceBlock
    ? /\$\s?[\d,.]+\s+(?:Env\.?|Environmental|Eco)[^$]*?Fee/i.exec(
        textAt(priceBlock, '.nl-price__eco-fee'),
      )?.[0]
    : undefined;
  // "Sale ends October 15, 2026" with the JSON-LD priceValidUntil instant of that day.
  const ends = textAt(box!, '.nl-buy-box__sale-end-day-soon-message, [class*="sale-end"]');
  const until = text(offer.priceValidUntil);
  const endDay = /sale ends\s+([A-Z][a-z]+ \d{1,2}, \d{4})/i.exec(ends)?.[1];
  const sameDay =
    endDay && until && !Number.isNaN(Date.parse(`${endDay} 12:00 UTC`))
      ? new Date(`${endDay} 12:00 UTC`).toISOString().slice(0, 10) === until.slice(0, 10)
      : false;
  const promotions = [
    endDay && was && was > current
      ? promotion('sale', 'Sale', '.nl-buy-box__sale-end-day-soon-message', {
          validUntil: sameDay ? until : undefined,
        })
      : undefined,
  ].filter((p): p is Promotion => !!p);
  if (endDay && !sameDay)
    issues.push('Canadian Tire sale end has no matching instant; no countdown');
  const badges = [
    ...new Set(
      all(box!, '.nl-buy-box__badges .nl-tag')
        .map((tag) => content(tag))
        .filter(
          (label) => label && !/^(?:sale|clearance)$/i.test(label) && !/sale ends/i.test(label),
        ),
    ),
  ];
  const crumbs = nodes.find((node) => isType(node, 'BreadcrumbList'));
  const categories = oneOrMany(crumbs?.itemListElement)
    .map(record)
    .sort((a, b) => Number(a.position) - Number(b.position))
    .flatMap((item) => {
      const name = text(item.name);
      return name && !/^home$/i.test(name) && name !== heading ? [name] : [];
    });
  const specifications = all(root, '.nl-specifications-table tr')
    .flatMap((row) => {
      const name = textAt(row, 'th');
      const value = textAt(row, 'td');
      return name && value ? [{ name, value }] : [];
    })
    .slice(0, 30);
  const images = imageUrls(
    [
      ...all(root, '[data-thumbnail-index] img').map((img) => img.attribs.src),
      ...oneOrMany(product.image),
    ].map((src) => (typeof src === 'string' ? src.split('?')[0] : src)),
    document.url,
  );
  const stock = availability(box!, root, offer);
  const host = new URL(document.url).hostname.replace(/^www\./, '');
  return {
    url: document.url,
    title: heading,
    sku,
    brand: textAt(root, '.nl-product__brand-label') || text(record(product.brand).name),
    ...(badges.length ? { badges } : {}),
    ...(categories.length ? { categories } : {}),
    ...(specifications.length ? { specifications } : {}),
    images,
    offers: [
      {
        amountMinor: current,
        currency: 'CAD',
        currencyEvidence: `storefront:${host}`,
        ...(was && was > current
          ? {
              compareAtAmountMinor: was,
              compareAtEvidence: '.nl-price--was',
              compareAtLabel: 'Was',
              ...(percent ? { savingsPercent: Number(percent) } : {}),
            }
          : {}),
        ...(schemaCondition(offer.itemCondition)
          ? { condition: schemaCondition(offer.itemCondition) }
          : {}),
        ...(stock.availability ? { availability: stock.availability } : {}),
        ...(fee ? { fee: fee.replace(/\s+/g, ' ') } : {}),
        ...(promotions.length ? { promotions } : {}),
        url: document.url,
        evidence: 'div.nl-buy-box > .nl-price .nl-price--charge',
      },
    ],
    evidence: 'h1.nl-product__title + div.nl-buy-box',
  };
}

export const parseCtcProduct = (document: PageDocument) => parseRetailer('ctc-ca', document, read);
