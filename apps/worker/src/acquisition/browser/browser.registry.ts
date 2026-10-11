import { BrowserProviderIdSchema } from '@morydeals/capture-contracts';
import { AcquisitionError } from '../acquisition.types.ts';
import type { BrowserProvider } from './browser-provider.types.ts';

export class BrowserRegistry {
  private readonly providers = new Map<string, BrowserProvider>();
  constructor(providers: readonly BrowserProvider[] = []) {
    for (const provider of providers) this.register(provider);
  }
  register(provider: BrowserProvider): this {
    BrowserProviderIdSchema.parse(provider.id);
    if (this.providers.has(provider.id))
      throw new Error(`Duplicate browser provider: ${provider.id}`);
    this.providers.set(provider.id, provider);
    return this;
  }
  resolve(id: string, interactive = false): BrowserProvider {
    const provider = this.providers.get(id);
    if (!provider)
      throw new AcquisitionError(
        'unsupported_browser',
        `Browser provider is not registered: ${id}`,
      );
    if (interactive && !provider.capabilities.stagehand) {
      throw new AcquisitionError(
        'unsupported_capability',
        `Browser provider does not support Stagehand: ${id}`,
      );
    }
    return provider;
  }
}
