import OpenAI from 'openai';
import type { LlmProvider, LlmRequest, LlmResponse } from '../parsers/index.ts';

export class SiliconFlowProvider implements LlmProvider {
  readonly id = 'siliconflow';

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string | undefined,
    private readonly defaultModel = 'zai-org/GLM-5.3-Flash',
  ) {}

  async generate(request: LlmRequest): Promise<LlmResponse> {
    request.signal.throwIfAborted();
    if (!this.apiKey) throw new Error('SiliconFlow requires SILICONFLOW_API_KEY');
    const client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      // Retry belongs to the caller; SDK retries would hide requests and inflate task duration.
      maxRetries: 0,
      logLevel: 'off',
    });
    const body: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
      enable_thinking: boolean;
    } = {
      model: request.model ?? this.defaultModel,
      messages: request.messages,
      // The shared prompt supplies the schema; the shared normalizer validates the output.
      response_format: { type: 'json_object' },
      stream: false,
      // GLM-5.3-Flash cannot disable thinking. Explicit low avoids its default max effort.
      enable_thinking: true,
      reasoning_effort: 'low',
      temperature: 0,
      max_tokens: 4096,
      n: 1,
    };
    let raw: OpenAI.Chat.Completions.ChatCompletion;
    try {
      raw = await client.chat.completions.create(body, { signal: request.signal });
    } catch (error) {
      request.signal.throwIfAborted();
      // Provider error bodies and request headers can contain credentials or page content.
      const status = error instanceof OpenAI.APIError ? error.status : undefined;
      // eslint-disable-next-line preserve-caught-error -- SDK causes contain request credentials and provider bodies.
      throw new Error(
        `SiliconFlow request failed${status ? ` (HTTP ${status})` : ''}; check endpoint, credentials and model`,
      );
    }
    request.signal.throwIfAborted();
    if (JSON.stringify(raw).length > 1024 * 1024)
      throw new Error('SiliconFlow response exceeds limit');
    const choice = raw.choices?.[0];
    // Keep incomplete/refused responses in the audit, but never normalize them as a valid quote.
    const text =
      choice?.finish_reason === 'stop' && !choice.message.refusal
        ? (choice.message.content ?? '')
        : '';
    return {
      provider: this.id,
      model: raw.model,
      text,
      raw,
      metrics: {
        promptTokens: raw.usage?.prompt_tokens,
        outputTokens: raw.usage?.completion_tokens,
      },
    };
  }
}
