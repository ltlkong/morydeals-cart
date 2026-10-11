import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { SiliconFlowProvider } from '../../../src/parsing/providers/siliconflow.provider.ts';
import { normalizeLlmProduct, productPrompt } from '../../../src/parsing/parsers/index.ts';

const document = {
  version: '1' as const,
  url: 'https://shop.example/product',
  fetchedAt: '2026-10-09T00:00:00Z',
  markdown: '# Example product\nCAD $19.99',
  metadata: {},
  jsonLd: [],
};
const prompt = productPrompt(document);

async function fixture(
  handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>,
) {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

test('SiliconFlow sends one authenticated JSON request and preserves raw response and usage', async () => {
  const requests: { authorization?: string; url?: string; body: Record<string, unknown> }[] = [];
  const raw = {
    id: 'fixture-response',
    model: 'zai-org/GLM-5.3-Flash',
    choices: [{ finish_reason: 'stop', message: { content: '{"product":null}' } }],
    usage: { prompt_tokens: 120, completion_tokens: 5 },
  };
  const server = await fixture(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({
      authorization: req.headers.authorization,
      url: req.url,
      body: JSON.parse(Buffer.concat(chunks).toString()),
    });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(raw));
  });
  try {
    const provider = new SiliconFlowProvider(server.baseUrl, 'fixture-key');
    const result = await provider.generate({ ...prompt, signal: AbortSignal.timeout(3000) });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].authorization, 'Bearer fixture-key');
    assert.equal(requests[0].url, '/v1/chat/completions');
    assert.deepEqual(requests[0].body, {
      model: 'zai-org/GLM-5.3-Flash',
      messages: prompt.messages,
      stream: false,
      enable_thinking: true,
      reasoning_effort: 'low',
      temperature: 0,
      max_tokens: 4096,
      n: 1,
      response_format: { type: 'json_object' },
    });
    assert.equal(result.provider, 'siliconflow');
    assert.equal(result.model, raw.model);
    assert.equal(result.text, '{"product":null}');
    assert.deepEqual(result.raw, raw);
    assert.deepEqual(result.metrics, { promptTokens: 120, outputTokens: 5 });

    await provider.generate({
      ...prompt,
      model: 'explicit-model',
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(requests[1].body.model, 'explicit-model');
  } finally {
    await server.close();
  }
});

test('SiliconFlow does not retry HTTP errors or expose provider error bodies', async () => {
  let calls = 0;
  const server = await fixture((_req, res) => {
    calls++;
    res.writeHead(429, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'fixture-key private page text' } }));
  });
  try {
    await assert.rejects(
      new SiliconFlowProvider(server.baseUrl, 'fixture-key').generate({
        ...prompt,
        signal: AbortSignal.timeout(3000),
      }),
      (error: Error) => {
        assert.match(error.message, /HTTP 429/);
        assert.doesNotMatch(error.message, /fixture-key|private page text/);
        return true;
      },
    );
    assert.equal(calls, 1);
    await assert.rejects(
      new SiliconFlowProvider(server.baseUrl, undefined).generate({
        ...prompt,
        signal: AbortSignal.timeout(3000),
      }),
      /requires SILICONFLOW_API_KEY/,
    );
    assert.equal(calls, 1);
  } finally {
    await server.close();
  }
});

test('aborting one SiliconFlow call leaves another call running; incomplete output stays auditable', async () => {
  const controller = new AbortController();
  let markStarted!: () => void;
  const started = new Promise<void>((resolve) => {
    markStarted = resolve;
  });
  const server = await fixture(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.model === 'slow') {
      markStarted();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        model: body.model,
        choices: [{ finish_reason: 'length', message: { content: '{"product":null}' } }],
      }),
    );
  });
  try {
    const provider = new SiliconFlowProvider(server.baseUrl, 'fixture-key');
    const slow = provider.generate({ ...prompt, model: 'slow', signal: controller.signal });
    const reason = new Error('cancel this task');
    const rejected = assert.rejects(slow, (error) => error === reason);
    await started;
    const fast = provider.generate({ ...prompt, signal: AbortSignal.timeout(3000) });
    controller.abort(reason);
    const result = await fast;
    await rejected;
    assert.equal(result.text, '');
    assert.match(JSON.stringify(result.raw), /length/);
    assert.equal(normalizeLlmProduct(result.text, document, provider.id).status, 'needs_review');
  } finally {
    controller.abort();
    await server.close();
  }
});
