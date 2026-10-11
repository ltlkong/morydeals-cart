import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { OllamaProvider } from '../../../src/parsing/providers/ollama.provider.ts';
import { LlmProviders } from '../../../src/parsing/llm-providers.ts';

test('Ollama uses structured output, qwen3.5:4b and per-call cancellation', async () => {
  let called = 0;
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    called++;
    assert.equal(req.url, '/api/chat');
    assert.equal(body.model, 'qwen3.5:4b');
    assert.equal(body.stream, false);
    assert.equal(body.think, false);
    assert.equal(body.options.num_predict, 2048);
    assert.deepEqual(body.format, { type: 'object' });
    if (body.messages[0].content === 'slow') return;
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        model: body.model,
        message: { thinking: 'Brief fixture check', content: '{"product":null}' },
        done: true,
        total_duration: 12000000,
        load_duration: 1000000,
        prompt_eval_duration: 2000000,
        eval_duration: 8000000,
        prompt_eval_count: 20,
        eval_count: 5,
      }),
    );
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const provider = new OllamaProvider(
    `http://127.0.0.1:${(server.address() as { port: number }).port}`,
  );
  try {
    const slow = provider.generate({
      messages: [{ role: 'user', content: 'slow' }],
      schema: { type: 'object' },
      signal: AbortSignal.timeout(100),
    });
    const rejected = assert.rejects(slow);
    const fast = await provider.generate({
      messages: [{ role: 'user', content: 'fast' }],
      schema: { type: 'object' },
      signal: AbortSignal.timeout(2000),
    });
    assert.equal(fast.model, 'qwen3.5:4b');
    assert.equal(fast.text, '{"product":null}');
    assert.deepEqual(fast.metrics, {
      totalMs: 12,
      loadMs: 1,
      promptEvalMs: 2,
      generationMs: 8,
      promptTokens: 20,
      outputTokens: 5,
    });
    assert.equal(
      (fast.raw as { message: { thinking: string } }).message.thinking,
      'Brief fixture check',
    );
    await rejected;
    assert.equal(called, 2);
    const registry = new LlmProviders([provider]);
    assert.equal(registry.get('ollama'), provider);
    assert.throws(() => registry.get('unknown'), /Unknown/);
    assert.throws(() => new LlmProviders([provider, provider]), /Duplicate/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
