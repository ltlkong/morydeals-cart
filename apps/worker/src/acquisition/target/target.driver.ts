import { CookieJar } from 'tough-cookie';
import {
  targetLocation,
  targetPdpUrl,
  targetTcin,
} from '../../parsing/parsers/retailers/target.ts';
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

/**
 * target.com renders the product page without its price and loads it from redsky (pdp_client_v1) with the web API
 * key and the store the page assigned to the visitor. This reads it the same way: the page over HTTP, then that
 * one public API call with the page as referrer and its cookies. Both responses are archived; the capture parsed is
 * the item number, store and API answer together. No proxy or challenge handling.
 */
export class TargetDriver implements AcquisitionDriver {
  constructor(
    private readonly policy: UrlPolicy,
    private readonly limiter: DomainLimiter,
    private readonly maxBytes: number,
    private readonly network = new NetworkSessions(),
  ) {}
  async fetch(request: DriverRequest) {
    const { step, signal, url, archive, context } = request;
    if (step.mode !== 'api' || step.provider !== 'target-com')
      throw new AcquisitionError('unsupported_capability', 'Target requires its API step');
    const tcin = targetTcin(url);
    if (!tcin) throw new AcquisitionError('unsupported_content', 'Unsupported Target product URL');
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
      if (targetTcin(page.capture.url) !== tcin)
        throw new AcquisitionError('incomplete', 'Target redirected to a different item');
      const location = targetLocation(html);
      if (!location)
        throw new AcquisitionError('incomplete', 'Target page has no API key or store');
      const endpoint = targetPdpUrl(tcin, location, page.capture.url);
      const response = await transport.fetch(endpoint, archive, {
        signal,
        proxyUrl,
        cookieJar,
        api: { referer: page.capture.url },
      });
      let answer: unknown;
      try {
        answer = JSON.parse(decodeResponse(response.body, response.capture, this.maxBytes, 'json'));
      } catch {
        throw new AcquisitionError('unsupported_content', 'Target API did not return JSON');
      }
      const body = Buffer.from(JSON.stringify({ response: answer }));
      const capture = await archive.capture(body, {
        kind: 'api-response',
        target: { tcin, store: location.store, ...(location.zip ? { zip: location.zip } : {}) },
        url: endpoint.replace(/([?&]key=)[^&]+/, '$1…'),
        status: response.capture.status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        capturedAt: response.capture.capturedAt,
        truncated: false,
      });
      return { body, capture };
    });
  }
}
