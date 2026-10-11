import {
  CAPTURE_READINESS,
  PAGE_TYPES,
  type CaptureReadiness,
  type PageType,
} from '@morydeals/capture-contracts';
import type { PageClassifierInput, PageClassifierProvider } from '../page-classifier.ts';

const QUESTION = 'page_type';
const READINESS = 'capture_readiness';
/** Choice questions; Jev returns a probability for every option. */
const CRITERIA: Record<PageType, string> = {
  product:
    'A single product detail page showing one product with its price and an add-to-cart or buy control',
  listing: 'A category, search, brand or collection page listing many products',
  home: "The store's home or landing page",
  cart_or_checkout: 'A shopping cart, bag, checkout or payment page',
  account: 'A sign-in, account, order history or settings page',
  article: 'A blog post, guide, help or policy article',
  other: 'Anything else',
};
const READINESS_CRITERIA: Record<CaptureReadiness, string> = {
  ready:
    'One specific product with one definite current purchase price shown for it; any required size, colour or configuration is already chosen',
  needs_selection:
    'A product that still needs a size, colour, capacity or configuration choice before it has a definite price: only a "From" or starting price, a price range, or no option selected',
  not_loaded:
    'A product page whose product name, price or buy control has not appeared yet (still loading, blank or skeleton)',
};

function choice<T extends string>(
  body: unknown,
  question: string,
  options: readonly T[],
): Partial<Record<T, number>> {
  const probabilities = (body as { answers?: Record<string, { probabilities?: unknown }> } | null)
    ?.answers?.[question]?.probabilities;
  if (!probabilities || typeof probabilities !== 'object')
    throw new Error(`Jev returned no ${question} probabilities`);
  const result: Partial<Record<T, number>> = {};
  for (const [key, value] of Object.entries(probabilities)) {
    if (!(options as readonly string[]).includes(key) || typeof value !== 'number')
      throw new Error(`Jev returned an unexpected ${question} option`);
    result[key as T] = value;
  }
  return result;
}
/** Reads Jev's answers: page-type probabilities and the most likely readiness. Anything unexpected is an error. */
export function jevAnswers(body: unknown) {
  const pageTypes = choice(body, QUESTION, PAGE_TYPES);
  const readiness = Object.entries(choice(body, READINESS, CAPTURE_READINESS)).sort(
    ([, a], [, b]) => (b ?? 0) - (a ?? 0),
  )[0]?.[0] as CaptureReadiness | undefined;
  if (!readiness) throw new Error(`Jev returned no ${READINESS} probabilities`);
  return { pageTypes, readiness };
}

/** TypeSafe Jev (System One) over its REST API; there is no official JS SDK. The key never appears in errors. */
export class JevProvider implements PageClassifierProvider {
  readonly id = 'jev';
  constructor(
    private readonly apiKey: string | undefined,
    private readonly model = 'jev-latest',
    private readonly timeoutMs = 15_000,
  ) {}
  async classify({ url, markdown }: PageClassifierInput) {
    if (!this.apiKey) throw new Error('Jev is not configured');
    let response: Response;
    try {
      response = await fetch('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          state: `URL: ${url}\n\n${markdown}`,
          questions: {
            [QUESTION]: {
              type: 'choice',
              instructions: 'What kind of store page is this?',
              criteria: CRITERIA,
            },
            [READINESS]: {
              type: 'choice',
              instructions:
                'If this is a product page, can its product and price be read now, as the shopper sees it?',
              criteria: READINESS_CRITERIA,
            },
          },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new Error('Jev request failed');
    }
    if (!response.ok) throw new Error(`Jev returned HTTP ${response.status}`);
    return jevAnswers(await response.json());
  }
}
