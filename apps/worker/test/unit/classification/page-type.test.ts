import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PageTypeService } from '../../../src/classification/page-type.service.ts';
import { JevProvider, jevAnswers } from '../../../src/classification/providers/jev.provider.ts';
import type { PageClassifierProvider } from '../../../src/classification/page-classifier.ts';

const recording = (
  pageTypes: Record<string, number>,
  readiness: 'ready' | 'needs_selection' | 'not_loaded' = 'ready',
) => {
  const inputs: { url: string; markdown: string }[] = [];
  const provider: PageClassifierProvider = {
    id: 'fake',
    classify: async (input) => {
      inputs.push(input);
      return { pageTypes, readiness };
    },
  };
  return { provider, inputs };
};
const productLd = `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Mug', offers: { '@type': 'Offer', price: '18.99', priceCurrency: 'CAD' } })}</script>`;

test('known store product URLs and a single priced Product are decided by rules, without the model', async () => {
  const { provider, inputs } = recording({ product: 0 });
  const service = new PageTypeService(provider, 4000);
  for (const [url, html] of [
    ['https://www.amazon.ca/dp/B00MW8G3YU', '<html></html>'],
    ['https://shop.example/blue-mug', `<html>${productLd}</html>`],
  ]) {
    const result = await service.classify(url, html);
    assert.equal(result.source, 'rules');
    assert.equal(result.productProbability, 1);
    assert.equal(result.probabilities.listing, 0);
    // A store parser or the page's own priced Product decides readiness on the server.
    assert.equal(result.readiness, 'ready');
  }
  assert.equal(inputs.length, 0);
});

test('other pages are classified by the provider on bounded markdown, keeping the whole distribution', async () => {
  const { provider, inputs } = recording({ product: 0.62, listing: 0.38 });
  const service = new PageTypeService(provider, 50);
  const html = `<html><body><h1>Mugs</h1><p>${'Ceramic mugs. '.repeat(20)}</p>${productLd}${productLd}</body></html>`;
  const result = await service.classify('https://shop.example/mugs', html);
  assert.equal(result.source, 'model');
  assert.equal(result.provider, 'fake');
  assert.equal(result.productProbability, 0.62);
  assert.deepEqual(result.probabilities, {
    product: 0.62,
    listing: 0.38,
    home: 0,
    cart_or_checkout: 0,
    account: 0,
    article: 0,
    other: 0,
  });
  assert.equal(result.readiness, 'ready');
  assert.ok(inputs[0].markdown.length <= 50);
  assert.equal(inputs[0].url, 'https://shop.example/mugs');
});

test('out-of-range probabilities from a provider are rejected', async () => {
  const { provider } = recording({ product: 1.4 });
  await assert.rejects(
    new PageTypeService(provider, 4000).classify('https://shop.example/x', '<p>x</p>'),
    /probabilit/i,
  );
});

test('the provider says whether a product page can be captured yet', async () => {
  const { provider } = recording({ product: 0.9, listing: 0.1 }, 'needs_selection');
  const result = await new PageTypeService(provider, 4000).classify(
    'https://shop.example/ipad-pro',
    '<h1>iPad Pro</h1><p>From $1699</p>',
  );
  assert.equal(result.productProbability, 0.9);
  assert.equal(result.readiness, 'needs_selection');
});

const jevBody = (readiness: Record<string, number>) => ({
  answers: {
    page_type: {
      type: 'choice',
      choice: 'product',
      confidence: 0.9,
      probabilities: { product: 0.9, listing: 0.1 },
    },
    capture_readiness: { type: 'choice', probabilities: readiness },
  },
});

test('Jev answers map onto page types and the most likely readiness; malformed answers fail', () => {
  assert.deepEqual(jevAnswers(jevBody({ ready: 0.2, needs_selection: 0.7, not_loaded: 0.1 })), {
    pageTypes: { product: 0.9, listing: 0.1 },
    readiness: 'needs_selection',
  });
  assert.equal(
    jevAnswers(jevBody({ ready: 0.6, needs_selection: 0.3, not_loaded: 0.1 })).readiness,
    'ready',
  );
  assert.throws(() => jevAnswers({ answers: {} }), /Jev/);
  assert.throws(
    () => jevAnswers({ answers: { page_type: { probabilities: { coupon: 1 } } } }),
    /Jev/,
  );
  // Readiness is required and must use the known options.
  assert.throws(
    () => jevAnswers({ answers: { page_type: jevBody({}).answers.page_type } }),
    /readiness/,
  );
  assert.throws(() => jevAnswers(jevBody({ ready: 0.5, sold_out: 0.5 })), /readiness/);
});

test('one Jev request asks both the page type and whether it can be captured', async () => {
  const original = globalThis.fetch;
  let sent:
    { questions: Record<string, { type: string; criteria: Record<string, string> }> } | undefined;
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    sent = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify(jevBody({ ready: 0.1, needs_selection: 0.1, not_loaded: 0.8 })),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;
  try {
    const answer = await new JevProvider('fixture-key').classify({
      url: 'https://shop.example/p',
      markdown: '# P',
    });
    assert.equal(answer.readiness, 'not_loaded');
    assert.deepEqual(Object.keys(sent!.questions).sort(), ['capture_readiness', 'page_type']);
    assert.deepEqual(Object.keys(sent!.questions.capture_readiness.criteria).sort(), [
      'needs_selection',
      'not_loaded',
      'ready',
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
