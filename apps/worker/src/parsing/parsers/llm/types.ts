export interface LlmRequest {
  model?: string;
  messages: { role: 'system' | 'user'; content: string }[];
  schema: Record<string, unknown>;
  signal: AbortSignal;
}

export interface LlmMetrics {
  totalMs?: number;
  loadMs?: number;
  promptEvalMs?: number;
  generationMs?: number;
  promptTokens?: number;
  outputTokens?: number;
}

export interface LlmResponse {
  metrics?: LlmMetrics;
  provider: string;
  model: string;
  text: string;
  raw: unknown;
}

// Shared contract has no Node, Nest or Ollama dependency. New providers implement this boundary.
export interface LlmProvider {
  readonly id: string;
  generate(request: LlmRequest): Promise<LlmResponse>;
}
