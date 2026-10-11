import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  parseProductDocument,
  parseShopifyProduct,
  parseAmazonProduct,
  parseBestBuyProduct,
  parseNeweggProduct,
  parseWalmartProduct,
  parseCtcProduct,
  parseHomeDepotProduct,
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
/** Store parsers, tried first. A store without one starts with the page's structured data. */
const PARSERS: Partial<Record<Strategy, (document: PageDocument) => ParseResult>> = {
  structured: parseProductDocument,
  shopify: parseShopifyProduct,
  'amazon-ca': parseAmazonProduct,
  'bestbuy-ca': parseBestBuyProduct,
  'newegg-ca': parseNeweggProduct,
  'walmart-ca': parseWalmartProduct,
  'ctc-ca': parseCtcProduct,
  'homedepot-ca': parseHomeDepotProduct,
  amazon: parseAmazonProduct,
};

/** Structured data that alone states the product: every product titled, with a priced offer in a currency. */
function complete(result: ParseResult): boolean {
  return (
    result.status === 'parsed' &&
    result.products.length > 0 &&
    result.products.every(
      (product) =>
        !!product.title &&
        product.offers.some((offer) => offer.amountMinor > 0 && !!offer.currency),
    )
  );
}

@Injectable()
export class ProductParsingService {
  constructor(
    @Inject(LlmProviders) private readonly providers: LlmProviders,
    @Optional() @Inject(FALLBACK_LLM) private readonly fallback?: LlmStrategy,
  ) {}

  /**
   * Parsing chain: the store's parser; then the page's own structured data (JSON-LD / metadata) when it states a
   * complete product; the LLM only when neither confirms the product.
   */
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
    let best: ParseResult | undefined;
    if (parser) {
      const parsed = parser(document);
      // An unloaded page is read again by the app; nothing else can find a product that is not there yet.
      if (parsed.status === 'parsed' || parsed.incomplete) return parsed;
      await archive.artifact('parser-result.json', JSON.stringify(parsed, null, 2));
      best = parsed;
    }
    if (parser !== parseProductDocument) {
      const structured = parseProductDocument(document);
      if (complete(structured)) {
        await archive.artifact('structured-result.json', JSON.stringify(structured, null, 2));
        return { ...structured, issues: [...(best?.issues ?? []), ...structured.issues] };
      }
      if (structured.products.length) {
        await archive.artifact('structured-result.json', JSON.stringify(structured, null, 2));
        if (!best?.products.length)
          best = { ...structured, issues: [...(best?.issues ?? []), ...structured.issues] };
      } else if (best) best = { ...best, issues: [...best.issues, ...structured.issues] };
      else best = structured;
    }
    if (!llm) {
      if (!parser && !best?.products.length && parsing.strategy !== 'generic')
        throw new Error('No parser or LLM is configured for this page');
      return best!;
    }
    try {
      const fallback = await this.llm(document, llm, archive, timings);
      if (fallback.status === 'parsed') return fallback;
      return best?.products.length
        ? { ...best, issues: [...best.issues, ...fallback.issues.map((issue) => `LLM: ${issue}`)] }
        : { ...fallback, issues: [...(best?.issues ?? []), ...fallback.issues] };
    } catch (error) {
      // The parsers' partial result is still the best evidence available.
      const reason = error instanceof Error ? error.message : 'unknown error';
      return { ...best!, issues: [...best!.issues, `LLM fallback failed: ${reason}`] };
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
