import { Inject, Injectable } from '@nestjs/common';
import type { PageDocument } from '../parsers/index.ts';
import type { Archive } from '../../audit/raw-archive.ts';
import { CrawlContextSchema, type CrawlContextInput } from '@morydeals/capture-contracts';
import { AcquisitionError, type CapturedPage } from '../../acquisition/acquisition.types.ts';
import { decodeHtml, decodeResponse } from '../../acquisition/http/http.transport.ts';
import { workerConfig, type Configuration } from '../../config/worker.config.ts';
import { convertHtml } from './html-to-markdown.ts';

@Injectable()
export class DocumentPreparationService {
  private readonly maxBytes: number;
  constructor(@Inject(workerConfig.KEY) config: Pick<Configuration, 'maxBytes'>) {
    this.maxBytes = config.maxBytes;
  }
  async prepare(page: CapturedPage, archive: Archive, contextInput: CrawlContextInput) {
    const context = CrawlContextSchema.parse(contextInput);
    if (page.capture.kind === 'api-response' && page.capture.homeDepot) {
      const combined = JSON.parse(decodeResponse(page.body, page.capture, this.maxBytes, 'json'));
      const document: PageDocument = {
        version: '1',
        url: archive.raw.requestedUrl,
        requestedUrl: archive.raw.requestedUrl,
        fetchedAt: page.capture.capturedAt,
        markdown: '',
        metadata: {},
        jsonLd: [],
        homeDepot: { ...page.capture.homeDepot, ...combined },
      };
      await archive.artifact('document.json', JSON.stringify(document, null, 2));
      await archive.artifact(
        'conversion.json',
        JSON.stringify({ source: 'homedepot-localized', format: 'json' }),
      );
      return document;
    }
    if (page.capture.kind === 'api-response') {
      if (!page.capture.shopify)
        throw new AcquisitionError('unsupported_content', 'Missing API response provenance');
      const document: PageDocument = {
        version: '1',
        url: archive.raw.requestedUrl,
        requestedUrl: archive.raw.requestedUrl,
        fetchedAt: page.capture.capturedAt,
        markdown: '',
        metadata: {},
        jsonLd: [],
        storefront: {
          target: page.capture.shopify,
          response: JSON.parse(decodeResponse(page.body, page.capture, this.maxBytes, 'json')),
        },
      };
      await archive.artifact('document.json', JSON.stringify(document, null, 2));
      await archive.artifact(
        'conversion.json',
        JSON.stringify({ source: 'shopify-storefront', format: 'json' }),
      );
      return document;
    }
    const html = page.html ?? decodeHtml(page.body, page.capture, this.maxBytes);
    if (
      [
        'amazon-ca',
        'amazon',
        'bestbuy-ca',
        'newegg-ca',
        'walmart-ca',
        'ctc-ca',
        'homedepot-ca',
      ].includes(context.parsing?.strategy ?? '')
    ) {
      const document: PageDocument = {
        version: '1',
        url: page.capture.url,
        requestedUrl: archive.raw.requestedUrl,
        fetchedAt: page.capture.capturedAt,
        html,
        markdown: '',
        metadata: {},
        jsonLd: [],
      };
      await archive.artifact('document.json', JSON.stringify(document, null, 2));
      await archive.artifact(
        'conversion.json',
        JSON.stringify({
          source: 'retailer-html',
          format: 'html',
          strategy: context.parsing?.strategy,
        }),
      );
      return document;
    }
    const converted = convertHtml(
      html,
      page.capture.url,
      page.capture.capturedAt,
      context.cleaning.removeSelectors,
      context.cleaning.scope,
    );
    converted.document.requestedUrl = archive.raw.requestedUrl;
    await archive.artifact('cleaned.html', converted.cleanedHtml);
    await archive.artifact('page.md', converted.document.markdown);
    await archive.artifact('document.json', JSON.stringify(converted.document, null, 2));
    await archive.artifact('conversion.json', JSON.stringify(converted.report, null, 2));
    return converted.document;
  }
}
