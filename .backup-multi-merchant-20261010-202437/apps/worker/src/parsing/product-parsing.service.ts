import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  parseProductDocument,
  parseShopifyProduct,
  parseAmazonProduct,
  parseBestBuyProduct,
  parseNeweggProduct,
  parseWalmartProduct,
  productPrompt,
  normalizeLlmProduct,
  LLM_PROMPT_VERSION,
  type PageDocument,
  type ParseResult,
} from './parsers/index.ts';
import type { CrawlContext, LlmStrategy } from '@morydeals/capture-contracts';
import type { Archive } from '../audit/raw-archive.ts';
import { CaptureTimings } from '../pipeline/capture-timings.ts';
import { LlmProviders } from './llm-providers.ts';

/** The LLM that backs up store parsers whose context names none. */
export const FALLBACK_LLM = Symbol('FALLBACK_LLM');

type Strategy = NonNullable<CrawlContext['parsing']>['strategy'];
/** Store parsers, tried first. A store without one goes straight to the LLM. */
const PARSERS: Partial<Record<Strategy, (document: PageDocument) => ParseResult>> = {
  structured: parseProductDocument,
  shopify: parseShopifyProduct,
  'amazon-ca': parseAmazonProduct,
  'bestbuy-ca': parseBestBuyProduct,
  'newegg-ca': parseNeweggProduct,
  'walmart-ca': parseWalmartProduct,
};

@Injectable()
export class ProductParsingService {
  constructor(
    @Inject(LlmProviders) private readonly providers: LlmProviders,
    @Optional() @Inject(FALLBACK_LLM) private readonly fallback?: LlmStrategy,
  ) {}

  /** Parsing chain: the store's parser, then the LLM when the parser cannot confirm the product. */
  async parse(
    document: PageDocument,
    context: CrawlContext,
    archive: Archive,
    timings = new CaptureTimings(),
  ): Promise<ParseResult> {
    const parsing = context.parsing ?? { strategy: 'structured' as const };
    if (parsing.strategy === 'llm') return this.llm(document, parsing, archive, timings);
    const llm = parsing.strategy === 'generic' ? (parsing.llm ?? this.fallback) : this.fallback;
    const parser = PARSERS[parsing.strategy];
    if (!parser) {
      if (!llm) throw new Error('No parser or LLM is configured for this page');
      return this.llm(document, llm, archive, timings);
    }
    const parsed = parser(document);
    // An unloaded page is read again by the app; the LLM cannot find a product that is not there yet.
    if (parsed.status === 'parsed' || parsed.incomplete || !llm) return parsed;
    await archive.artifact('parser-result.json', JSON.stringify(parsed, null, 2));
    try {
      const fallback = await this.llm(document, llm, archive, timings);
      if (fallback.status === 'parsed') return fallback;
      return { ...fallback, issues: [...parsed.issues, ...fallback.issues] };
    } catch (error) {
      // The store parser's partial result is still the best evidence available.
      const reason = error instanceof Error ? error.message : 'unknown error';
      return { ...parsed, issues: [...parsed.issues, `LLM fallback failed: ${reason}`] };
    }
  }

  private async llm(
    document: PageDocument,
    strategy: LlmStrategy,
    archive: Archive,
    timings: CaptureTimings,
  ) {
    const provider = this.providers.get(strategy.provider);
    const prompt = productPrompt(document);
    await archive.artifact(
      'llm-request.json',
      JSON.stringify(
        {
          promptVersion: LLM_PROMPT_VERSION,
          provider: provider.id,
          model: strategy.model,
          ...prompt,
        },
        null,
        2,
      ),
    );
    const response = await timings.measureLlm(() =>
      provider.generate({
        ...prompt,
        model: strategy.model,
        signal: AbortSignal.timeout(strategy.timeoutMs),
      }),
    );
    await archive.artifact('llm-response.json', JSON.stringify(response, null, 2));
    return normalizeLlmProduct(response.text, document, provider.id);
  }
}
