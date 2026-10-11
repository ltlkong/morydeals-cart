import { DocumentPreparationService } from './document/document-preparation.service.ts';
import { Module } from '@nestjs/common';
import { WorkerConfigModule } from '../config/config.module.ts';
import { defaultLlmParsing, workerConfig, type Configuration } from '../config/worker.config.ts';
import { OllamaProvider } from './providers/ollama.provider.ts';
import { SiliconFlowProvider } from './providers/siliconflow.provider.ts';
import { AnthropicProvider } from './providers/anthropic.provider.ts';
import { LlmProviders } from './llm-providers.ts';
import { FALLBACK_LLM, ProductParsingService } from './product-parsing.service.ts';

@Module({
  imports: [WorkerConfigModule],
  providers: [
    ProductParsingService,
    {
      provide: FALLBACK_LLM,
      inject: [workerConfig.KEY],
      useFactory: (config: Configuration) => defaultLlmParsing(config),
    },
    DocumentPreparationService,
    {
      provide: LlmProviders,
      inject: [workerConfig.KEY],
      useFactory: (config: Configuration) =>
        new LlmProviders([
          new OllamaProvider(config.ollama.host, config.ollama.model),
          new AnthropicProvider(
            config.anthropic.baseUrl,
            config.anthropic.apiKey,
            config.anthropic.model,
          ),
          new SiliconFlowProvider(
            config.siliconflow.baseUrl,
            config.siliconflow.apiKey,
            config.siliconflow.model,
          ),
        ]),
    },
  ],
  exports: [ProductParsingService, DocumentPreparationService],
})
export class ParsingModule {}
