import { load } from 'cheerio';
import { CookieJar } from 'tough-cookie';
import { homeDepotProductId } from '../../parsing/parsers/index.ts';
import { homeDepotStateProduct } from '../../parsing/parsers/retailers/homedepot.ts';
import {
  AcquisitionError,
  type AcquisitionDriver,
  type DriverRequest,
} from '../acquisition.types.ts';
import { HttpTransport, decodeHtml, decodeResponse } from '../http/http.transport.ts';
import type { DomainLimiter } from '../network/domain-limiter.ts';
import { NetworkSessions } from '../network/network-sessions.ts';
import { UrlPolicy } from '../network/url-policy.ts';
import { pageChallenge } from '../product-readiness.ts';

/** The localized price and stock homedepot.ca's product page loads for the shopper's store. */
export const homeDepotLocalizedUrl = (productId: string, store: string, lang: 'en' | 'fr') =>
  `https://www.homedepot.ca/api/productsvc/v1/products-localized-basic?products=${productId}&store=${store}&lang=${lang}`;

/**
 * Home Depot Canada renders the product server-side (the `hdca-state` catalogue entry) but loads the price the
 * shopper sees, and its stock, per store after the page arrives. This reads both the way the page does: the page
 * over HTTP, then that store's localized row with the page as referrer and the page's cookies. Both raw responses
 * are archived; the capture parsed is the product entry and the localized answer together, so a replay needs
 * nothing else. No proxy, challenge handling or retries beyond the configured fallback.
 */
export class HomeDepotDriver implements AcquisitionDriver {
  constructor(
    private readonly policy: UrlPolicy,
    private readonly limiter: DomainLimiter,
    private readonly maxBytes: number,
    private readonly network = new NetworkSessions(),
  ) {}
  async fetch(request: DriverRequest) {
    const { step, signal, url, archive, context } = request;
    if (step.mode !== 'api' || step.provider !== 'homedepot-ca')
      throw new AcquisitionError('unsupported_capability', 'Home Depot requires its API step');
    const productId = homeDepotProductId(url);
    if (!productId)
      throw new AcquisitionError('unsupported_content', 'Unsupported Home Depot product URL');
    return this.network.run(request, async (proxyUrl) => {
      const transport = new HttpTransport(this.policy, this.limiter, step.timeoutMs, this.maxBytes);
      const cookieJar = new CookieJar();
      const page =
        request.prefetchedPage ??
        (await transport.fetch(url, archive, {
          locale: context.locale,
          signal,
          proxyUrl,
          cookieJar,
        }));
      const html = decodeHtml(page.body, page.capture, this.maxBytes);
      const challenge = pageChallenge(page.capture.url, page.capture.status, html);
      if (challenge) throw new AcquisitionError('blocked', challenge);
      if (homeDepotProductId(page.capture.url) !== productId)
        throw new AcquisitionError('incomplete', 'Home Depot redirected to a different product');
      let state: unknown;
      try {
        state = JSON.parse(load(html)('script#hdca-state').first().text());
      } catch {
        throw new AcquisitionError('incomplete', 'Home Depot page has no product state');
      }
      const product = homeDepotStateProduct(state, productId);
      if (!product)
        throw new AcquisitionError('incomplete', 'Home Depot page has no product entry');
      const lang = /^\/produit\//i.test(new URL(page.capture.url).pathname) ? 'fr' : 'en';
      const endpoint = homeDepotLocalizedUrl(productId, step.store, lang);
      const response = await transport.fetch(endpoint, archive, {
        signal,
        proxyUrl,
        cookieJar,
        api: { referer: page.capture.url },
      });
      let localized: unknown;
      try {
        localized = JSON.parse(
          decodeResponse(response.body, response.capture, this.maxBytes, 'json'),
        );
      } catch {
        throw new AcquisitionError(
          'unsupported_content',
          'Home Depot price API did not return JSON',
        );
      }
      if (!Array.isArray(localized) || !localized.length)
        throw new AcquisitionError('incomplete', 'Home Depot price API returned no product');
      const body = Buffer.from(JSON.stringify({ product, localized }));
      const capture = await archive.capture(body, {
        kind: 'api-response',
        homeDepot: { productId, store: step.store, lang },
        url: endpoint,
        status: response.capture.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        capturedAt: response.capture.capturedAt,
        truncated: false,
      });
      return { body, capture };
    });
  }
}

/** API steps by provider: each store's own product API. */
export class ApiDrivers implements AcquisitionDriver {
  constructor(
    private readonly drivers: Record<'shopify' | 'homedepot-ca' | 'target-com', AcquisitionDriver>,
  ) {}
  fetch(request: DriverRequest) {
    if (request.step.mode !== 'api')
      throw new AcquisitionError('unsupported_capability', 'Not an API step');
    return this.drivers[request.step.provider].fetch(request);
  }
}
