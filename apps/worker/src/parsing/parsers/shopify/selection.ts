import { detectShopify } from './detection.ts';
import { ShopifyStoreSchema, type ShopifyStore } from '@morydeals/capture-contracts';
import type { ShopifyTarget } from './store.ts';
import { all, htmlDocument, values } from '../shared/html.ts';
import { textContent } from 'domutils';
import { check, requireValue, record } from '../shared/retailer.ts';

export function shopifyLink(value: string) {
  const url = new URL(value);
  check(
    url.protocol === 'https:' && !url.username && !url.password && !url.port,
    'Shopify requires an HTTPS storefront URL',
  );
  const handle = requireValue(
    /\/(?:products)\/([a-zA-Z0-9][a-zA-Z0-9_-]*)\/?$/.exec(url.pathname)?.[1],
    'Unsupported Shopify product URL',
  );
  const selected = url.searchParams.getAll('variant');
  check(
    selected.length <= 1 && (!selected.length || /^[1-9]\d*$/.test(selected[0])),
    'Invalid or ambiguous Shopify variant',
  );
  return { url, handle, variantId: selected[0] };
}

/** Bind a configured API domain to the public page, and read an explicit page selection only. */
export function resolveShopifyTarget(
  html: string,
  requestedUrl: string,
  fetchedUrl: string,
  store: ShopifyStore,
): ShopifyTarget {
  ShopifyStoreSchema.parse(store);
  const requested = shopifyLink(requestedUrl);
  const fetched = shopifyLink(fetchedUrl);
  check(
    requested.url.origin === fetched.url.origin && requested.handle === fetched.handle,
    'Shopify storefront redirected to another product',
  );
  check(
    !requested.variantId || !fetched.variantId || requested.variantId === fetched.variantId,
    'Shopify redirected to another variant',
  );
  const root = htmlDocument(html);
  const detection = detectShopify(html);
  check(
    detection.shopDomain === store.shopDomain &&
      !detection.issues.some((issue) => issue.includes('Shopify.shop')),
    'Shopify API domain is not confirmed by the storefront',
  );
  let variantId = requested.variantId;
  if (!variantId) {
    const ids = new Set<string>();
    for (const script of all(root, 'script[type="application/json"][data-selected-variant]')) {
      const value = record(JSON.parse(textContent(script)));
      if (typeof value.id === 'number')
        check(Number.isSafeInteger(value.id), 'Unsafe Shopify variant identifier');
      ids.add(String(value.id));
    }
    for (const form of all(root, 'form[action]')) {
      const action = new URL(form.attribs.action, fetched.url);
      if (action.origin !== fetched.url.origin || !/\/cart\/add\/?$/.test(action.pathname))
        continue;
      for (const id of values(form, 'input[name="id"]:not([disabled])', 'value')) ids.add(id);
      for (const id of values(
        form,
        'select[name="id"]:not([disabled]) option[selected]:not([disabled])',
        'value',
      ))
        ids.add(id);
    }
    check(ids.size === 1, 'Shopify page does not identify one selected variant');
    variantId = [...ids][0];
  }
  check(/^[1-9]\d*$/.test(variantId), 'Invalid selected Shopify variant');
  return { ...store, url: requestedUrl, variantId };
}
