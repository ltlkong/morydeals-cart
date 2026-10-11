import type { LlmProvider } from './parsers/index.ts';

export class LlmProviders {
  private readonly providers = new Map<string, LlmProvider>();
  constructor(providers: readonly LlmProvider[]) {
    for (const provider of providers) {
      if (this.providers.has(provider.id))
        throw new Error(`Duplicate LLM provider: ${provider.id}`);
      this.providers.set(provider.id, provider);
    }
  }
  get(id: string): LlmProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Unknown LLM provider: ${id}`);
    return provider;
  }
}
