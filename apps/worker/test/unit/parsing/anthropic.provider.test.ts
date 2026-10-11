import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import {
  AnthropicProvider,
  structuredOutputSchema,
} from '../../../src/parsing/providers/anthropic.provider.ts';
import { productPrompt } from '../../../src/parsing/parsers/index.ts';

const prompt = productPrompt({
  version: '1',
  url: 'https://shop.example/product',
  fetchedAt: '2026-10-10T00:00:00Z',
  markdown: '# Example product\nCAD $19.99',
  metadata: {},
  jsonLd: [],
});

async function fixture(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>) {
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
const body = async (req: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString());
};

test('Anthropic sends one schema-constrained Messages request and keeps the raw response', async () => {
  const requests: { headers: IncomingMessage['headers']; url?: string; body: unknown }[] = [];
  const raw = {
    id: 'msg_fixture',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: '{"product":null}' }],
    stop_reason: 'end_turn',
    usage: { input_tokens: 120, output_tokens: 5 },
  };
  const server = await fixture(async (req, res) => {
    requests.push({ headers: req.headers, url: req.url, body: await body(req) });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(raw));
  });
  try {
    const result = await new AnthropicProvider(server.baseUrl, 'fixture-key').generate({
      ...prompt,
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, '/v1/messages');
    assert.equal(requests[0].headers['x-api-key'], 'fixture-key');
    const system = prompt.messages.filter((m) => m.role === 'system').map((m) => m.content);
    assert.deepEqual(requests[0].body, {
      model: 'claude-haiku-5-5',
      max_tokens: 4096,
      system: system.join('\n\n'),
      messages: prompt.messages.filter((m) => m.role === 'user'),
      output_config: {
        format: { type: 'json_schema', schema: structuredOutputSchema(prompt.schema) },
      },
    });
    assert.equal(result.provider, 'anthropic');
    assert.equal(result.model, 'claude-haiku-5-5');
    assert.equal(result.text, '{"product":null}');
    assert.deepEqual(result.metrics, { promptTokens: 120, outputTokens: 5 });
    assert.deepEqual(result.raw, raw);
  } finally {
    await server.close();
  }
});

test('Anthropic failures report the status, never the provider body or the key', async () => {
  const server = await fixture(async (req, res) => {
    await body(req);
    res.writeHead(529, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        type: 'error',
        error: { type: 'overloaded_error', message: 'secret page text' },
      }),
    );
  });
  try {
    await assert.rejects(
      new AnthropicProvider(server.baseUrl, 'fixture-key').generate({
        ...prompt,
        signal: AbortSignal.timeout(3000),
      }),
      (error: Error) =>
        /HTTP 529/.test(error.message) &&
        !error.message.includes('secret page text') &&
        !error.message.includes('fixture-key'),
    );
  } finally {
    await server.close();
  }
});

test('an unfinished Anthropic answer is kept for audit but yields no product text', async () => {
  const server = await fixture(async (req, res) => {
    await body(req);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        id: 'msg_cut',
        type: 'message',
        role: 'assistant',
        model: 'claude-haiku-5-5',
        content: [{ type: 'text', text: '{"product":{"title":"Exa' }],
        stop_reason: 'max_tokens',
        usage: { input_tokens: 1, output_tokens: 4096 },
      }),
    );
  });
  try {
    const result = await new AnthropicProvider(server.baseUrl, 'fixture-key').generate({
      ...prompt,
      signal: AbortSignal.timeout(3000),
    });
    assert.equal(result.text, '');
  } finally {
    await server.close();
  }
});

test('the schema sent to Anthropic drops only the bounds its structured output rejects', () => {
  const sent = JSON.stringify(structuredOutputSchema(prompt.schema));
  assert.doesNotMatch(sent, /"maxItems"|"minimum"|"maximum"/);
  // String limits and patterns are supported and kept.
  assert.match(sent, /"maxLength"/);
  assert.match(sent, /"pattern":"\^\[A-Z\]\{3\}\$"/);
  assert.match(JSON.stringify(prompt.schema), /"maxItems"/);
});
