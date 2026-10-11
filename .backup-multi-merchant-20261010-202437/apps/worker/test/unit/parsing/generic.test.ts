import 'reflect-metadata';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ProductParsingService } from '../../../src/parsing/product-parsing.service.ts';
import { LlmProviders } from '../../../src/parsing/llm-providers.ts';
import { Archive } from '../../../src/audit/raw-archive.ts';
import { readAuditBundle } from '../../../src/audit/audit-bundle.ts';
import { CrawlContextSchema } from '@morydeals/capture-contracts';
import type { PageDocument, LlmProvider } from '../../../src/parsing/parsers/index.ts';

const output = {
  product: {
    title: 'Mory Headphones',
    brand: null,
    sku: null,
    images: [],
    offers: [
      {
        amountMinor: 12995,
        compareAt: null,
        currency: 'CAD',
        priceText: '$129.95',
        evidence: 'Price: CAD $129.95',
      },
    ],
  },
};
const doc: PageDocument = {
  version: '1',
  url: 'https://unknown.example/product',
  fetchedAt: new Date().toISOString(),
  markdown: '# Mory Headphones\n\nPrice: CAD $129.95',
  metadata: {},
  jsonLd: [
    {
      '@type': 'Product',
      name: 'Mory Headphones',
      offers: { '@type': 'Offer', price: '129.95', priceCurrency: 'CAD' },
    },
  ],
};
const llm = { strategy: 'llm', provider: 'fixture', timeoutMs: 120000 } as const;
const context = (parsing: unknown) =>
  CrawlContextSchema.parse({ version: 1, acquisition: { mode: 'http' }, parsing });

async function harness(generate: LlmProvider['generate'] = async () => reply) {
  const root = await mkdtemp(join(tmpdir(), 'mory-chain-'));
  const state = { calls: 0 };
  const provider: LlmProvider = {
    id: 'fixture',
    generate: async (request) => {
      state.calls++;
      return generate(request);
    },
  };
  let archives = 0;
  const archive = async () => {
    const value = new Archive(root, `case-${++archives}`, 'one', doc.url);
    await value.initialize();
    return value;
  };
  const files = (value: Archive) =>
    value
      .seal()
      .then(() => value.finalize())
      .then(() => readAuditBundle(value.bundlePath));
  return {
    state,
    archive,
    files,
    service: (fallback?: typeof llm) =>
      new ProductParsingService(new LlmProviders([provider]), fallback),
    done: () => rm(root, { recursive: true, force: true }),
  };
}
const reply = { provider: 'fixture', model: 'fixture', text: JSON.stringify(output), raw: output };

test('a store without its own parser goes straight to the LLM', async () => {
  const h = await harness();
  try {
    const archive = await h.archive();
    // Structured data on the page does not replace the LLM when no parser is registered.
    const result = await h.service().parse(doc, context({ strategy: 'generic', llm }), archive);
    assert.equal(result.status, 'parsed');
    assert.equal(result.products[0].offers[0].amountMinor, 12995);
    assert.equal(h.state.calls, 1);
    const files = await h.files(archive);
    assert.ok(files.has('llm-request.json') && files.has('llm-response.json'));
    assert.ok(!files.has('parser-result.json'));
  } finally {
    await h.done();
  }
});

test('a store parser that succeeds is used without calling the LLM', async () => {
  const h = await harness();
  try {
    const result = await h
      .service(llm)
      .parse(doc, context({ strategy: 'structured' }), await h.archive());
    assert.equal(result.status, 'parsed');
    assert.equal(h.state.calls, 0);
  } finally {
    await h.done();
  }
});

test('a store parser that cannot confirm the product falls back to the LLM', async () => {
  const h = await harness();
  try {
    const archive = await h.archive();
    const result = await h
      .service(llm)
      .parse({ ...doc, jsonLd: [] }, context({ strategy: 'structured' }), archive);
    assert.deepEqual(result.issues, []);
    assert.equal(result.status, 'parsed');
    assert.equal(h.state.calls, 1);
    const files = await h.files(archive);
    assert.ok(files.has('parser-result.json') && files.has('llm-response.json'));
  } finally {
    await h.done();
  }
});

test('when the LLM fallback also fails, the store parser result is kept with the reason', async () => {
  const h = await harness(async () => {
    throw new Error('The operation was aborted due to timeout');
  });
  try {
    const result = await h
      .service(llm)
      .parse({ ...doc, jsonLd: [] }, context({ strategy: 'structured' }), await h.archive());
    assert.equal(result.status, 'needs_review');
    assert.doesNotMatch(result.strategy, /llm/);
    assert.ok(result.issues.some((issue) => /LLM fallback failed/.test(issue)));
  } finally {
    await h.done();
  }
});

test('without a configured LLM the store parser result stands', async () => {
  const h = await harness();
  try {
    const result = await h
      .service()
      .parse({ ...doc, jsonLd: [] }, context({ strategy: 'structured' }), await h.archive());
    assert.equal(result.status, 'needs_review');
    assert.equal(h.state.calls, 0);
  } finally {
    await h.done();
  }
});

test('a page that had not finished loading is not sent to the LLM', async () => {
  const h = await harness();
  try {
    const result = await h.service(llm).parse(
      {
        ...doc,
        url: 'https://www.amazon.ca/dp/B0DV7T1G6Z',
        html: '<html><body><div id="a-page"></div></body></html>',
      },
      context({ strategy: 'amazon-ca' }),
      await h.archive(),
    );
    assert.equal(result.incomplete, true);
    assert.equal(h.state.calls, 0);
  } finally {
    await h.done();
  }
});
