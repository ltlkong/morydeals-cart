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
  let zeroOffer = false;
  function productOffer(value: unknown): boolean {
    if (Array.isArray(value)) return value.some(productOffer);
    if (!value || typeof value !== 'object') return false;
    const item = value as Record<string, unknown>;
    const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
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
  $(
    'script,style,noscript,template,header,footer,nav,aside,[hidden],[aria-hidden="true"]',
  ).remove();
  const main = $('main,[role="main"]').first();
  const region = main.length ? main : $('body');
  const headings = region.find('h1').filter((_, element) => $(element).text().trim().length > 0);
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
