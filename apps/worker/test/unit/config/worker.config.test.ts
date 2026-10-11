import { test } from 'node:test';
import assert from 'node:assert/strict';
import { configuration, defaultLlmParsing } from '../../../src/config/worker.config.ts';

test('SiliconFlow is optional and its endpoint and model are deployment configuration', () => {
  assert.deepEqual(configuration({}).siliconflow, {
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKey: undefined,
    model: 'zai-org/GLM-5.3-Flash',
  });
  assert.deepEqual(
    configuration({
      SILICONFLOW_BASE_URL: 'https://api.siliconflow.com/v1',
      SILICONFLOW_API_KEY: 'fixture-key',
      SILICONFLOW_MODEL: 'explicit-model',
    }).siliconflow,
    {
      baseUrl: 'https://api.siliconflow.com/v1',
      apiKey: 'fixture-key',
      model: 'explicit-model',
    },
  );
  assert.throws(() => configuration({ SILICONFLOW_BASE_URL: 'not-a-url' }), /SILICONFLOW_BASE_URL/);
});

test('production rejects missing service URLs; invalid values never echo credentials', () => {
  assert.throws(
    () => configuration({ NODE_ENV: 'production' }),
    /requires DATABASE_URL and REDIS_URL/,
  );
  assert.throws(
    () => configuration({ DATABASE_URL: 'mysql://user:secret@example.com/database' }),
    /must use PostgreSQL/,
  );
  assert.throws(
    () => configuration({ CRAWL_CONCURRENCY: '99', DATABASE_URL: 'secret-invalid' }),
    (error) => {
      assert.match((error as Error).message, /DATABASE_URL/);
      assert.ok(!(error as Error).message.includes('secret-invalid'));
      return true;
    },
  );
});
test('deployment configuration bounds resources and requires paired Browserbase credentials', () => {
  assert.throws(() => configuration({ BROWSERBASE_API_KEY: 'secret' }), /key and project together/);
  assert.throws(() => configuration({ CRAWL_MAX_BUDGET_MS: '999999' }), /CRAWL_MAX_BUDGET_MS/);
  const config = configuration({
    CRAWL_CONCURRENCY: '3',
  });
  assert.equal(config.concurrency, 3);
  assert.ok(config.leaseMs > config.maxBudgetMs);
});

test('the LLM provider is chosen by LLM_PROVIDER, never by which keys happen to be set', () => {
  assert.deepEqual(configuration({}).anthropic, {
    baseUrl: 'https://api.anthropic.com',
    apiKey: undefined,
    model: 'claude-haiku-5-5',
  });
  const provider = (env: NodeJS.ProcessEnv) => defaultLlmParsing(configuration(env)).provider;
  assert.equal(provider({}), 'ollama');
  // A key alone does not switch providers.
  assert.equal(provider({ ANTHROPIC_API_KEY: 'b', SILICONFLOW_API_KEY: 'a' }), 'ollama');
  assert.equal(provider({ LLM_PROVIDER: 'siliconflow', SILICONFLOW_API_KEY: 'a' }), 'siliconflow');
  assert.equal(
    provider({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'b', SILICONFLOW_API_KEY: 'a' }),
    'anthropic',
  );
  // A hosted provider without its key is a startup error, not a silent switch.
  assert.throws(() => configuration({ LLM_PROVIDER: 'anthropic' }), /ANTHROPIC_API_KEY/);
  assert.throws(() => configuration({ LLM_PROVIDER: 'siliconflow' }), /SILICONFLOW_API_KEY/);
  assert.throws(() => configuration({ LLM_PROVIDER: 'openai' }), /LLM_PROVIDER/);
});
