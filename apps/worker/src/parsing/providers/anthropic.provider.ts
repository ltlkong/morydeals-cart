import Anthropic from '@anthropic-ai/sdk';
import type { LlmProvider, LlmRequest, LlmResponse } from '../parsers/index.ts';

// Keywords Anthropic's structured output rejects. The shared normalizer still enforces them on the answer.
const UNSUPPORTED_KEYWORDS = new Set(['maxItems', 'minimum', 'maximum']);
export function structuredOutputSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(structuredOutputSchema);
  if (!schema || typeof schema !== 'object') return schema;
  return Object.fromEntries(
    Object.entries(schema)
      .filter(([key]) => !UNSUPPORTED_KEYWORDS.has(key))
      .map(([key, value]) => [key, structuredOutputSchema(value)]),
  );
}

export class AnthropicProvider implements LlmProvider {
  readonly id = 'anthropic';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly defaultModel = 'claude-haiku-5-5',
  ) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    request.signal.throwIfAborted();
    if (!this.apiKey) throw new Error('Anthropic requires ANTHROPIC_API_KEY');
    const client = new Anthropic({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      // Retry belongs to the caller; SDK retries would hide requests and inflate task duration.
      maxRetries: 0,
      logLevel: 'off',
    });
    let raw: Anthropic.Message;
    try {
      raw = await client.messages.create(
        {
          model: request.model ?? this.defaultModel,
          max_tokens: 4096,
          system: request.messages
            .filter((message) => message.role === 'system')
            .map((message) => message.content)
            .join('\n\n'),
          messages: request.messages
            .filter((message) => message.role === 'user')
            .map((message) => ({ role: 'user' as const, content: message.content })),
          // The output must match the shared schema; the shared normalizer still validates it.
          output_config: {
            format: {
              type: 'json_schema',
              schema: structuredOutputSchema(request.schema) as Record<string, unknown>,
            },
          },
        },
        { signal: request.signal },
      );
    } catch (error) {
      request.signal.throwIfAborted();
      // Provider error bodies and request headers can contain credentials or page content.
      const status = error instanceof Anthropic.APIError ? error.status : undefined;
      // eslint-disable-next-line preserve-caught-error -- SDK causes contain request credentials and provider bodies.
      throw new Error(
        `Anthropic request failed${status ? ` (HTTP ${status})` : ''}; check endpoint, credentials and model`,
      );
    }
    request.signal.throwIfAborted();
    if (JSON.stringify(raw).length > 1024 * 1024)
      throw new Error('Anthropic response exceeds limit');
    // Keep incomplete/refused responses in the audit, but never normalize them as a valid quote.
    const text =
      raw.stop_reason === 'end_turn'
        ? raw.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('')
        : '';
    return {
      provider: this.id,
      model: raw.model,
      text,
      raw,
      metrics: { promptTokens: raw.usage.input_tokens, outputTokens: raw.usage.output_tokens },
    };
  }
}
