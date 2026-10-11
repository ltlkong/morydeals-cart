import { Ollama } from 'ollama';
import type { LlmProvider, LlmRequest, LlmResponse } from '../parsers/index.ts';

export class OllamaProvider implements LlmProvider {
  readonly id = 'ollama';
  constructor(
    private readonly host: string,
    private readonly defaultModel = 'qwen3.5:4b',
  ) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    // Per-call client/signal: cancelling one task must not abort another model request.
    const client = new Ollama({
      host: this.host,
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: request.signal,
        }),
    });
    try {
      const raw = await client.chat({
        model: request.model ?? this.defaultModel,
        messages: request.messages,
        format: request.schema,
        stream: false,
        think: false,
        options: { temperature: 0, num_ctx: 16384, num_predict: 2048 },
      });
      request.signal.throwIfAborted();
      if (JSON.stringify(raw).length > 1024 * 1024) throw new Error('Model response exceeds limit');
      const ms = (value: number | undefined) =>
        typeof value === 'number' ? Math.round(value / 1000) / 1000 : undefined;
      return {
        provider: this.id,
        model: raw.model,
        text: raw.message.content,
        raw,
        metrics: {
          totalMs: ms(raw.total_duration),
          loadMs: ms(raw.load_duration),
          promptEvalMs: ms(raw.prompt_eval_duration),
          generationMs: ms(raw.eval_duration),
          promptTokens: raw.prompt_eval_count,
          outputTokens: raw.eval_count,
        },
      };
    } catch {
      request.signal.throwIfAborted();
      throw new Error('Ollama request failed; check endpoint and installed model');
    }
  }
}
