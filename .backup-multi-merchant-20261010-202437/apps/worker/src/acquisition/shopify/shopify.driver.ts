import { z } from 'zod';
import {
  resolveShopifyTarget,
  shopifyLink,
  type ShopifyTarget,
} from '../../parsing/parsers/index.ts';
import { SHOPIFY_API_VERSION, shopifyQuery } from './shopify-query.ts';
import {
  AcquisitionError,
  type AcquisitionDriver,
  type DriverRequest,
} from '../acquisition.types.ts';
import { HttpTransport, decodeHtml, decodeResponse } from '../http/http.transport.ts';
import type { DomainLimiter } from '../network/domain-limiter.ts';
import { NetworkSessions } from '../network/network-sessions.ts';
import { UrlPolicy } from '../network/url-policy.ts';

export class ShopifyDriver implements AcquisitionDriver {
  constructor(
    private readonly policy: UrlPolicy,
    private readonly limiter: DomainLimiter,
    private readonly maxBytes: number,
    private readonly network = new NetworkSessions(),
  ) {}
  async fetch(request: DriverRequest) {
    const { step, signal, url, archive, stepIndex, context } = request;
    if (step.mode !== 'api')
      throw new AcquisitionError('unsupported_capability', 'Shopify requires API acquisition');
    return this.network.run(request, async (proxyUrl) => {
      const transport = new HttpTransport(this.policy, this.limiter, step.timeoutMs, this.maxBytes);
      let target: ShopifyTarget;
      if (step.variantId) {
        const link = shopifyLink(url);
        if (link.variantId && link.variantId !== step.variantId)
          throw new AcquisitionError(
            'incomplete',
            'Configured Shopify variant conflicts with the requested URL',
          );
        target = { ...step.store, url: link.url.href, variantId: step.variantId };
      } else {
        const page =
          request.prefetchedPage ??
          (await transport.fetch(url, archive, {
            locale: context.locale,
            signal,
            proxyUrl,
          }));
        try {
          target = resolveShopifyTarget(
            decodeHtml(page.body, page.capture, this.maxBytes),
            url,
            page.capture.url,
            step.store,
          );
        } catch (error) {
          throw new AcquisitionError(
            'incomplete',
            error instanceof Error ? error.message : 'Shopify identity unconfirmed',
          );
        }
      }
      const query = shopifyQuery(target);
      await archive.artifact(`shopify-query-${stepIndex}.json`, JSON.stringify(query, null, 2));
      const endpoint = `https://${target.shopDomain}/api/${SHOPIFY_API_VERSION}/graphql.json`;
      const response = await transport.fetch(endpoint, archive, {
        signal,
        proxyUrl,
        json: query,
        capture: { kind: 'api-response', shopify: target },
      });
      // Validate encoding and JSON syntax before selecting a replayable response.
      let payload: unknown;
      try {
        payload = JSON.parse(
          decodeResponse(response.body, response.capture, this.maxBytes, 'json'),
        );
      } catch {
        throw new AcquisitionError('unsupported_content', 'Shopify API did not return valid JSON');
      }
      const envelope = z
        .object({ errors: z.array(z.unknown()).optional(), data: z.unknown().optional() })
        .safeParse(payload);
      if (!envelope.success)
        throw new AcquisitionError(
          'unsupported_content',
          'Invalid Shopify GraphQL response envelope',
        );
      if (envelope.data.errors?.length)
        throw new AcquisitionError('incomplete', 'Shopify Storefront returned GraphQL errors');
      const data = z
        .object({ shop: z.object({}), product: z.object({}), selected: z.object({}) })
        .safeParse(envelope.data.data);
      if (!data.success)
        throw new AcquisitionError(
          'incomplete',
          'Shopify Storefront response is missing the selected product',
        );
      return response;
    });
  }
}
