import { AcquisitionError } from '../acquisition.types.ts';
import type { AcquisitionReason } from '@morydeals/capture-contracts';
import type { DomainLimiter } from '../network/domain-limiter.ts';
import http from 'node:http';
import { Impit } from 'impit';
import { CookieJar } from 'tough-cookie';
import { gunzipSync, brotliDecompressSync, inflateSync } from 'node:zlib';
import type { Archive, Capture } from '../../audit/raw-archive.ts';
import { inputUrl, UrlPolicy } from '../network/url-policy.ts';
import { EgressProxy } from '../network/egress-proxy.ts';

export class ResponseError extends AcquisitionError {
  constructor(
    reason: AcquisitionReason,
    message: string,
    retryable = false,
    readonly status?: number,
  ) {
    super(reason, message, retryable);
  }
}
export function decodeResponse(
  body: Buffer,
  capture: Capture,
  maxBytes: number,
  expected: 'html' | 'json',
): string {
  const encoding = String(capture.headers['content-encoding'] ?? 'identity').toLowerCase();
  const options = { maxOutputLength: maxBytes };
  let decoded: Buffer | undefined;
  try {
    decoded =
      encoding === 'gzip'
        ? gunzipSync(body, options)
        : encoding === 'br'
          ? brotliDecompressSync(body, options)
          : encoding === 'deflate'
            ? inflateSync(body, options)
            : encoding === 'identity'
              ? body
              : undefined;
  } catch (error) {
    const code = error instanceof Error && 'code' in error ? error.code : undefined;
    throw new ResponseError(
      code === 'ERR_BUFFER_TOO_LARGE' ? 'limit_exceeded' : 'unsupported_content',
      'Cannot decode response body',
    );
  }
  if (!decoded)
    throw new ResponseError(
      'unsupported_content',
      `Unsupported content encoding: ${encoding}`,
      false,
    );
  const type = String(capture.headers['content-type'] ?? '');
  const accepted =
    expected === 'html'
      ? /^(text\/html|application\/xhtml\+xml)(;|$)/i
      : /^application\/(?:[\w.-]+\+)?json(;|$)/i;
  if (!accepted.test(type))
    throw new ResponseError(
      'unsupported_content',
      `Response is not ${expected.toUpperCase()}`,
      false,
    );
  const charset = type.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1] ?? 'utf-8';
  try {
    return new TextDecoder(charset).decode(decoded);
  } catch {
    throw new ResponseError('unsupported_content', 'Unsupported response charset');
  }
}

export const decodeHtml = (body: Buffer, capture: Capture, maxBytes: number) =>
  decodeResponse(body, capture, maxBytes, 'html');
export interface HttpRequestOptions {
  locale?: string;
  signal?: AbortSignal;
  proxyUrl?: string;
  /** Read-only GraphQL query, archived by the caller. Redirects are forbidden. */
  json?: { query: string; variables: Record<string, unknown> };
  capture?: Pick<Capture, 'kind' | 'shopify' | 'homeDepot'>;
  /** A JSON GET a page makes for itself (its own API): JSON accepted, the page as referrer. */
  api?: { referer: string };
  /**
   * Cookies to share with the fetch that loaded the page this one belongs to, as the page's own requests would.
   * Without it each fetch is a new visitor.
   */
  cookieJar?: CookieJar;
}

const acceptLanguage = (locale: string) => {
  const language = locale.split('-')[0];
  return language === locale ? locale : `${locale},${language};q=0.9`;
};
// The client sends Chrome's own navigation headers to match its fingerprint; only the request's own are added.
const ownHeaders = (options: HttpRequestOptions) => ({
  ...(options.json ? { accept: 'application/json', 'content-type': 'application/json' } : {}),
  ...(options.api ? { accept: 'application/json', referer: options.api.referer } : {}),
  ...(options.locale ? { 'accept-language': acceptLanguage(options.locale) } : {}),
});

type Response = {
  body: Buffer;
  status: number;
  headers: http.IncomingHttpHeaders;
  truncated: boolean;
};

/**
 * Fetches as desktop Chrome: its TLS and HTTP/2 fingerprint and headers, since large stores turn away anything
 * that looks like a script. The client resolves names itself, so it only ever talks to a local egress proxy,
 * which checks each destination against the policy and pins the socket to the checked address.
 */
export class HttpTransport {
  constructor(
    private readonly policy: UrlPolicy,
    private readonly limiter: DomainLimiter,
    private readonly timeoutMs: number,
    private readonly maxBytes: number,
  ) {}
  async fetch(
    requestedUrl: string,
    archive: Archive,
    options: HttpRequestOptions = {},
  ): Promise<{ body: Buffer; capture: Capture }> {
    let url = inputUrl(requestedUrl);
    const deadline = Date.now() + this.timeoutMs;
    // The byte limit applies to the decoded body read here, which stops reading and closes the proxy; a cap in
    // the proxy would cut the response before the part within the limit is captured for audit.
    const egress = new EgressProxy(this.policy, this.timeoutMs, Number.POSITIVE_INFINITY);
    egress.setUpstream(options.proxyUrl);
    try {
      const gateway = await egress.start();
      const proxy = new URL(gateway.server);
      proxy.username = gateway.username;
      proxy.password = gateway.password;
      const browser = new Impit({
        // Best Buy's bot screen turns away older Chrome fingerprints.
        browser: 'chrome151',
        followRedirects: false,
        proxyUrl: proxy.href,
        // A browser carries cookies a redirect sets to the next hop. Each fetch is a new visitor.
        cookieJar: options.cookieJar ?? new CookieJar(),
      });
      for (let redirects = 0; redirects <= 5; redirects++) {
        await this.limiter.wait(url.hostname);
        options.signal?.throwIfAborted();
        if (deadline - Date.now() <= 0)
          throw new ResponseError('timeout', 'Overall fetch timeout exceeded', true);
        const response = await this.request(browser, egress, url, deadline, options);
        const capture = await archive.capture(response.body, {
          ...options.capture,
          url: url.href,
          status: response.status,
          headers: response.headers,
          capturedAt: new Date().toISOString(),
          truncated: response.truncated,
        });
        if (capture.truncated)
          throw new ResponseError('limit_exceeded', 'Response body exceeded byte limit', false);
        if ([301, 302, 303, 307, 308].includes(capture.status) && capture.headers.location) {
          if (options.json || options.api)
            throw new ResponseError(
              'http_error',
              options.json
                ? 'GraphQL endpoint redirects are not permitted'
                : 'Store API redirects are not permitted',
              false,
            );
          if (redirects === 5)
            throw new ResponseError('limit_exceeded', 'Redirect limit exceeded', false);
          // Each hop is checked afresh by the egress proxy.
          url = inputUrl(new URL(String(capture.headers.location), url).href);
          continue;
        }
        if (capture.status < 200 || capture.status >= 300)
          throw new ResponseError(
            [401, 403].includes(capture.status) ? 'blocked' : 'http_error',
            `HTTP ${capture.status}`,
            capture.status === 429 || capture.status >= 500,
            capture.status,
          );
        return { body: response.body, capture };
      }
      throw new ResponseError('limit_exceeded', 'Redirect limit exceeded', false);
    } finally {
      await egress.close();
    }
  }
  /** One hop. The client decompresses, so the captured body and headers are identity-encoded. */
  private async request(
    browser: Impit,
    egress: EgressProxy,
    url: URL,
    deadline: number,
    options: HttpRequestOptions,
  ): Promise<Response> {
    const remaining = Math.max(1, deadline - Date.now());
    let response;
    try {
      response = await browser.fetch(url.href, {
        method: options.json ? 'POST' : 'GET',
        headers: ownHeaders(options),
        body: options.json ? JSON.stringify(options.json) : undefined,
        timeout: remaining,
        signal: AbortSignal.any([
          AbortSignal.timeout(remaining),
          ...(options.signal ? [options.signal] : []),
        ]),
      });
    } catch {
      options.signal?.throwIfAborted();
      if (egress.rejection) throw egress.rejection;
      if (Date.now() >= deadline)
        throw new ResponseError('timeout', 'Overall fetch timeout exceeded', true);
      throw new ResponseError(
        'network_error',
        options.proxyUrl ? 'Proxy request failed' : 'Request failed',
        true,
      );
    }
    // A plain-HTTP destination the egress refused answers 403 itself; report why.
    if (egress.rejection) throw egress.rejection;
    const headers: http.IncomingHttpHeaders = {};
    response.headers.forEach((value, name) => {
      if (name !== 'content-encoding' && name !== 'content-length') headers[name] = value;
    });
    const chunks: Buffer[] = [];
    let bytes = 0;
    let truncated = false;
    const reader = response.body.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const available = this.maxBytes - bytes;
        chunks.push(Buffer.from(value.subarray(0, available)));
        bytes += Math.min(value.length, available);
        if (value.length > available) {
          truncated = true;
          await reader.cancel().catch(() => undefined);
          break;
        }
      }
    } catch {
      // Preserve partial responses for audit on interrupted transfers.
      truncated = true;
    }
    return { body: Buffer.concat(chunks), status: response.status, headers, truncated };
  }
}
