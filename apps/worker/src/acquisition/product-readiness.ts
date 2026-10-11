import { load } from 'cheerio';
import { amazonPageChallenge } from '../parsing/parsers/index.ts';

export type ProductReadiness = { ready: boolean; reason: string };

/** Content readiness is a routing signal, never an authoritative product/price parser. */
export function productReadiness(html: string): ProductReadiness {
  const $ = load(html);
  const pendingPrice = $('[aria-busy="true"]')
    .toArray()
    .some((element) => /price|offer|buy/i.test(Object.values(element.attribs).join(' ')));
  if (pendingPrice) return { ready: false, reason: 'Price content is still loading' };
  // A price module still showing only its loading skeleton (Target renders the price after the page arrives).
  const placeholderPrice = $('[data-test],[data-testid],[data-module-type],[class],[id]')
    .toArray()
    .some((element) => {
      const { class: _class, style: _style, ...named } = element.attribs;
      if (!/price/i.test(Object.values(named).join(' '))) return false;
      const node = $(element);
      return (
        /\d/.test(node.text()) === false &&
        node.find('[class*="laceholder"],[class*="keleton"],[data-test*="placeholder"]').length > 0
      );
    });
  if (placeholderPrice) return { ready: false, reason: 'Price content is still loading' };
  let zeroOffer = false;
  function productOffer(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(productOffer);
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
    // A ProductGroup's offers live on its variants (lululemon).
    if (types.includes('ProductGroup') && productOffer(item.hasVariant)) return true;
    if (types.includes('Product') && typeof item.name === 'string' && item.name.trim()) {
      const offers = Array.isArray(item.offers) ? item.offers : [item.offers];
      if (
        offers.some((offer) => {
          if (!offer || typeof offer !== 'object') return false;
          const price = (offer as Record<string, unknown>).price;
          if (
            (typeof price === 'number' || typeof price === 'string') &&
            String(price).trim() !== '' &&
            Number(price) === 0
          )
            zeroOffer = true;
          return (
            (typeof price === 'number' || typeof price === 'string') &&
            String(price).trim() !== '' &&
            Number.isFinite(Number(price)) &&
            Number(price) > 0
          );
        })
      )
        return true;
    }
    // Do not treat a recommendation ItemList as the current product.
    return productOffer(item['@graph']);
  }
  for (const script of $('script[type="application/ld+json"]').toArray()) {
    try {
      if (productOffer(JSON.parse($(script).text())))
        return { ready: true, reason: 'Product JSON-LD contains a named offer' };
    } catch {
      /* Malformed structured data may still have a usable rendered page. */
    }
  }
  if (zeroOffer) return { ready: false, reason: 'Structured price is zero and needs confirmation' };
  const title =
    $('head title').first().text() || $('meta[property="og:title"]').attr('content') || '';
  $('script,style,noscript,template,header,footer,nav,[hidden],[aria-hidden="true"]').remove();
  // A side panel is noise unless it is the buy box holding the product heading (lululemon).
  $('aside')
    .filter((_, element) => $(element).find('h1').text().trim().length === 0)
    .remove();
  const main = $('main,[role="main"]').first();
  // Some stores render the product heading outside <main> (SportChek); the page body is then the region.
  const region = main.length && main.find('h1').text().trim() ? main : $('body');
  let headings = region.find('h1').filter((_, element) => $(element).text().trim().length > 0);
  // Pages that also use <h1> for section titles (Home Depot specification groups, amazon.com "About this
  // item"): the primary heading is the one the document title names.
  if (headings.length > 1) {
    const titled = headings.filter((_, element) => namedByTitle($(element).text(), title));
    if (titled.length === 1) headings = titled;
  }
  if (headings.length !== 1)
    return { ready: false, reason: 'A single primary product heading is missing' };
  region.find('h1,h2,h3,p,div,span,br,li').append(' ');
  const text = region.text().replace(/\s+/g, ' ');
  const hasPrice =
    /(?:[$€£¥]|\b(?:CAD|USD|EUR|GBP|AUD|CNY)\s*)\s*\d[\d,.]*|\d[\d,.]*\s*(?:CAD|USD|EUR|GBP|AUD|CNY)\b/.test(
      text,
    );
  const unavailable = /\b(?:out of stock|sold out|currently unavailable)\b/i.test(text);
  if (hasPrice || unavailable)
    return { ready: true, reason: 'Primary heading and price or availability text present' };
  return { ready: false, reason: 'Primary content has no price or availability evidence' };
}

const words = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
/** The document title starts with the heading, or with its start when the title is cut short ("Kit - w..."),
 * optionally after a store prefix ("Amazon.com: …"). */
function namedByTitle(heading: string, title: string): boolean {
  const text = words(heading);
  const name = words(title);
  if (text.length < 12 || !name) return false;
  const prefix = name.indexOf(': ');
  for (const start of prefix < 0 ? [0] : [0, prefix + 2]) {
    const rest = name.slice(start).replace(/(?:\.{3}|…).*$/, '');
    let common = 0;
    while (common < text.length && common < rest.length && text[common] === rest[common]) common++;
    if (common >= 12 && common >= Math.min(text.length, rest.length, 40)) return true;
  }
  return false;
}

export function pageChallenge(url: string, status: number, html: string): string | undefined {
  const amazon = amazonPageChallenge(url, status, html);
  if (amazon) return amazon;
  const $ = load(html);
  const heading = $('title,h1').text().replace(/\s+/g, ' ').trim();
  if (
    /^(?:access denied|just a moment|security check|verify you are human|robot or human|pardon our interruption)(?:\b|[.!])/i.test(
      heading,
    )
  )
    return 'Store returned an access verification page';
  return undefined;
}
