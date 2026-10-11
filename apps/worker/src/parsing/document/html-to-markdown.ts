import { load } from 'cheerio';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import type { PageDocument } from '../parsers/index.ts';
import { productContent } from './product-content.ts';

export const CONVERTER_VERSION = '2.4.0';
const FORMER_PRICE_CLASS =
  /(?:^|[\s_-])(?:strikethrough|strike-?through|price-was|was-price|old-price|original-price)(?:$|[\s_-])/i;
const removedSelectors = [
  'script',
  'style',
  'noscript',
  'template',
  'svg',
  'iframe',
  'nav',
  'footer',
  '[hidden]',
  '[aria-hidden="true"]',
  '[role="navigation"]',
  '[role="contentinfo"]',
  '#cookie-banner',
  '.cookie-banner',
  '#onetrust-banner-sdk',
  '[data-cookie-banner]',
  '[data-ad]',
  '.advertisement',
  '.ad-banner',
  '[data-recommendations]',
];

export function convertHtml(
  html: string,
  url: string,
  fetchedAt: string,
  extraRemoveSelectors: string[] = [],
  scope: 'auto' | 'full' = 'auto',
) {
  const $ = load(html);
  const metadata: Record<string, string[]> = {};
  const add = (key: string, value: string | undefined) => {
    if (value?.trim()) (metadata[key.toLowerCase()] ??= []).push(value.trim());
  };
  add('title', $('title').first().text());
  $('meta[property], meta[name], meta[itemprop]').each((_i, node) => {
    const tag = $(node);
    const key = tag.attr('property') ?? tag.attr('name') ?? tag.attr('itemprop');
    if (key) add(key, tag.attr('content'));
  });
  const jsonLd: unknown[] = [];
  const warnings: string[] = [];
  $('script[type="application/ld+json"]').each((i, node) => {
    try {
      jsonLd.push(JSON.parse($(node).html() ?? ''));
    } catch {
      warnings.push(`Invalid JSON-LD script ${i}`);
    }
  });
  const embeddedProducts: NonNullable<PageDocument['embeddedProducts']> = [];
  $('script[type="application/json"]').each((i, node) => {
    const tag = $(node);
    try {
      const value = JSON.parse(tag.html() ?? '');
      const kind = tag.is('[data-selected-variant]')
        ? 'selected-variant'
        : value &&
            typeof value === 'object' &&
            Array.isArray(value.variants) &&
            value.id &&
            value.title
          ? 'product'
          : undefined;
      if (kind)
        embeddedProducts.push({ kind, source: `script[type="application/json"][${i}]`, value });
    } catch {
      if (tag.is('[data-selected-variant], [data-product-json]'))
        warnings.push(`Invalid product JSON script ${i}`);
    }
  });
  const selectors = [...removedSelectors, ...extraRemoveSelectors];
  const removed: { selector: string; count: number }[] = [];
  for (const selector of selectors) {
    const matches = $(selector);
    if (matches.length) removed.push({ selector, count: matches.length });
    matches.remove();
  }
  $('[style]').each((_i, node) => {
    if (/display\s*:\s*none|visibility\s*:\s*hidden/i.test($(node).attr('style') ?? ''))
      $(node).remove();
  });
  // Keep product sections/tables even when they live outside <main>.
  $('a[href], img[src]').each((_i, node) => {
    const tag = $(node);
    const attr = node.tagName === 'a' ? 'href' : 'src';
    try {
      const link = new URL(tag.attr(attr) ?? '', url);
      if (['https:', 'http:'].includes(link.protocol)) tag.attr(attr, link.href);
      else tag.removeAttr(attr);
    } catch {
      tag.removeAttr(attr);
    }
  });
  // A table without rows (amazon.com layout tables) crashes the GFM table rule; keep its content instead.
  $('table')
    .filter((_i, node) => $(node).find('tr').length === 0)
    .each((_i, node) => {
      $(node).replaceWith($(node).contents());
    });
  const cleanedHtml = $('body').html() ?? $.html();
  const turndown = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  turndown.use(gfm);
  // GFM permits single tildes; use the unambiguous double marker consistently.
  // Stores often draw the former price with CSS (SHEIN's bsc-strikethrough-price, Newegg's price-was).
  // Utility-class sites (SSENSE) strike with Tailwind's `line-through`, a whole class name.
  const struck = (node: HTMLElement) => {
    const classes = node.getAttribute('class') ?? '';
    return (
      ['DEL', 'S', 'STRIKE'].includes(node.nodeName) ||
      ((FORMER_PRICE_CLASS.test(classes) || classes.split(/\s+/).includes('line-through')) &&
        /\d/.test(node.textContent ?? '') &&
        (node.textContent ?? '').trim().length <= 40)
    );
  };
  turndown.addRule('strikethrough', {
    // A price nested in several struck elements (SHEIN wraps its value twice) is struck once; `~~~~` is not
    // strikethrough.
    filter: (node) => {
      if (!struck(node)) return false;
      for (let parent = node.parentElement; parent; parent = parent.parentElement)
        if (struck(parent)) return false;
      return true;
    },
    replacement: (content) => `~~${content}~~`,
  });
  turndown.remove(['script', 'style', 'iframe']);
  const selection =
    scope === 'auto'
      ? productContent($, turndown, cleanedHtml)
      : { markdown: turndown.turndown(cleanedHtml), scope: 'full' };
  const { markdown, ...contentSelection } = selection;
  const document: PageDocument = {
    version: '1',
    url,
    fetchedAt,
    markdown,
    metadata,
    jsonLd,
    embeddedProducts,
  };
  return {
    document,
    cleanedHtml,
    report: { converterVersion: CONVERTER_VERSION, removed, warnings, contentSelection },
  };
}
