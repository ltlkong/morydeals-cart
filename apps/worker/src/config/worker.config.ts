import { registerAs } from '@nestjs/config';
import { z } from 'zod';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { resolveRemoteBrowsers } from './remote-browser.config.ts';
import { resolveProxyProfiles } from './proxy.config.ts';

export const projectRoot = fileURLToPath(new URL('../../../..', import.meta.url));
const integer = (fallback: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(fallback);
const environment = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z
    .string()
    .url()
    .default('postgres://morydeals:local-morydeals@127.0.0.1:55432/morydeals'),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:56379'),
  CAPTURE_SNAPSHOT_DIRECTORY: z.string().default('.local/capture-snapshots'),
  CRAWL_ARCHIVE_DIR: z.string().default('.local/crawl-archive'),
  CRAWL_CONCURRENCY: integer(2, 1, 16),
  CRAWL_BROWSER_POOL_SIZE: integer(2, 1, 16),
  CRAWL_BROWSER_IDLE_MS: integer(30000, 1000, 300000),
  CRAWL_MAX_BYTES: integer(5242880, 1024, 20971520),
  CRAWL_DOMAIN_INTERVAL_MS: integer(2000, 0, 60000),
  CRAWL_MAX_BUDGET_MS: integer(120000, 100, 300000),
  OLLAMA_HOST: z.string().url().default('http://127.0.0.1:11434'),
  OLLAMA_MODEL: z.string().min(1).default('qwen3.5:4b'),
  // The model that parses pages without a store parser.
  LLM_PROVIDER: z.enum(['anthropic', 'siliconflow', 'ollama']).default('ollama'),
  ANTHROPIC_BASE_URL: z.string().url().default('https://api.anthropic.com'),
  ANTHROPIC_API_KEY: z.string().trim().optional(),
  ANTHROPIC_MODEL: z.string().trim().min(1).default('claude-haiku-5-5'),
  SILICONFLOW_BASE_URL: z.string().url().default('https://api.siliconflow.cn/v1'),
  SILICONFLOW_API_KEY: z.string().trim().optional(),
  SILICONFLOW_MODEL: z.string().trim().min(1).default('zai-org/GLM-5.3-Flash'),
  KEEPA_API_KEY: z.string().trim().optional(),
  TYPESAFE_API_KEY: z.string().trim().optional(),
  PAGE_CLASSIFIER: z.enum(['jev']).default('jev'),
  // Automatic visits are captured when P(product) reaches this.
  PAGE_PRODUCT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
  PAGE_CLASSIFIER_MARKDOWN_LIMIT: integer(8000, 500, 100000),
  // Keepa refills this many tokens a minute on the configured plan; the backfill spends at most that.
  KEEPA_TOKENS_PER_MINUTE: integer(20, 1, 10000),
  BULLMQ_PREFIX: z
    .string()
    .regex(/^[a-zA-Z0-9_-]+$/)
    .default('bull'),
});
export function configuration(env: NodeJS.ProcessEnv = process.env) {
  const parsed = environment.safeParse(env);
  if (!parsed.success)
    throw new Error(
      `Invalid worker configuration: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  const settings = parsed.data;
  if (settings.NODE_ENV === 'production' && (!env.DATABASE_URL || !env.REDIS_URL))
    throw new Error('Production requires DATABASE_URL and REDIS_URL');
  if (!['postgres:', 'postgresql:'].includes(new URL(settings.DATABASE_URL).protocol))
    throw new Error('DATABASE_URL must use PostgreSQL');
  if (!['redis:', 'rediss:'].includes(new URL(settings.REDIS_URL).protocol))
    throw new Error('REDIS_URL must use Redis');
  if (Boolean(env.BROWSERBASE_API_KEY) !== Boolean(env.BROWSERBASE_PROJECT_ID))
    throw new Error('Configure Browserbase key and project together');
  if (settings.LLM_PROVIDER === 'anthropic' && !settings.ANTHROPIC_API_KEY)
    throw new Error('LLM_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
  if (settings.LLM_PROVIDER === 'siliconflow' && !settings.SILICONFLOW_API_KEY)
    throw new Error('LLM_PROVIDER=siliconflow requires SILICONFLOW_API_KEY');
  return {
    ollama: { host: settings.OLLAMA_HOST, model: settings.OLLAMA_MODEL },
    llmProvider: settings.LLM_PROVIDER,
    anthropic: {
      baseUrl: settings.ANTHROPIC_BASE_URL,
      apiKey: settings.ANTHROPIC_API_KEY || undefined,
      model: settings.ANTHROPIC_MODEL,
    },
    siliconflow: {
      baseUrl: settings.SILICONFLOW_BASE_URL,
      apiKey: settings.SILICONFLOW_API_KEY || undefined,
      model: settings.SILICONFLOW_MODEL,
    },
    pageClassifier: {
      provider: settings.PAGE_CLASSIFIER,
      typesafeApiKey: settings.TYPESAFE_API_KEY || undefined,
      productThreshold: settings.PAGE_PRODUCT_THRESHOLD,
      markdownLimit: settings.PAGE_CLASSIFIER_MARKDOWN_LIMIT,
    },
    keepa: {
      apiKey: settings.KEEPA_API_KEY || undefined,
      tokensPerMinute: settings.KEEPA_TOKENS_PER_MINUTE,
    },
    databaseUrl: settings.DATABASE_URL,
    redisUrl: settings.REDIS_URL,
    queuePrefix: settings.BULLMQ_PREFIX,
    snapshotDirectory: resolve(projectRoot, settings.CAPTURE_SNAPSHOT_DIRECTORY),
    archiveDir: resolve(projectRoot, settings.CRAWL_ARCHIVE_DIR),
    concurrency: settings.CRAWL_CONCURRENCY,
    maxBytes: settings.CRAWL_MAX_BYTES,
    maxBudgetMs: settings.CRAWL_MAX_BUDGET_MS,
    leaseMs: Math.max(30000, settings.CRAWL_MAX_BUDGET_MS + 30000),
    domainIntervalMs: settings.CRAWL_DOMAIN_INTERVAL_MS,
    proxyProfiles: env.CRAWL_PROXY_CONFIG
      ? resolveProxyProfiles(
          JSON.parse(readFileSync(resolve(projectRoot, env.CRAWL_PROXY_CONFIG), 'utf8')),
          env,
        )
      : [],
    browserDeployment: {
      poolSize: settings.CRAWL_BROWSER_POOL_SIZE,
      idleMs: settings.CRAWL_BROWSER_IDLE_MS,
      camoufoxWsEndpoint: env.CAMOUFOX_WS_ENDPOINT || undefined,
      browserlessWsEndpoint: env.BROWSERLESS_WS_ENDPOINT || undefined,
      stagehandApiKey: env.STAGEHAND_API_KEY || undefined,
      proxyBindHost: env.CRAWL_PROXY_BIND_HOST || undefined,
      proxyAdvertisedHost: env.CRAWL_PROXY_ADVERTISED_HOST || undefined,
      browserbase:
        env.BROWSERBASE_API_KEY && env.BROWSERBASE_PROJECT_ID
          ? { apiKey: env.BROWSERBASE_API_KEY, projectId: env.BROWSERBASE_PROJECT_ID }
          : undefined,
      remoteBrowsers: env.CRAWL_BROWSER_CONFIG
        ? resolveRemoteBrowsers(
            JSON.parse(readFileSync(resolve(projectRoot, env.CRAWL_BROWSER_CONFIG), 'utf8')),
            env,
          )
        : [],
    },
  };
}
export type Configuration = ReturnType<typeof configuration>;
/** The LLM for pages without a store parser, and behind a store parser that cannot confirm a product. */
export const defaultLlmParsing = (config: Pick<Configuration, 'llmProvider'>) => ({
  strategy: 'llm' as const,
  provider: config.llmProvider,
  timeoutMs: 120000,
});
export const workerConfig = registerAs('worker', configuration);
