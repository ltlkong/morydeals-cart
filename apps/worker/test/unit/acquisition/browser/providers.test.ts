import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BrowserRegistry } from '../../../../src/acquisition/browser/browser.registry.ts';
import { LocalBrowserProvider } from '../../../../src/acquisition/browser/providers/local.provider.ts';
import { RemoteBrowserProvider } from '../../../../src/acquisition/browser/providers/remote.provider.ts';
import { browserbaseProvider } from '../../../../src/acquisition/browser/providers/browserbase.provider.ts';
import { resolveRemoteBrowsers } from '../../../../src/config/remote-browser.config.ts';
import { CrawlContextSchema } from '@morydeals/capture-contracts';
import type { BrowserOpenOptions } from '../../../../src/acquisition/browser/browser-provider.types.ts';

const options: BrowserOpenOptions = {
  proxy: { server: 'http://proxy.example:8080', username: 'mory', password: 'proxy-secret' },
  timeoutMs: 1000,
  signal: new AbortController().signal,
};
test('registry validates identifiers, duplicate providers and Stagehand capabilities', () => {
  const firefox = new LocalBrowserProvider('my_firefox', 'firefox');
  const registry = new BrowserRegistry([firefox]);
  assert.equal(registry.resolve('my_firefox'), firefox);
  assert.throws(() => registry.register(firefox), /Duplicate/);
  assert.throws(() => registry.resolve('missing'), /not registered/);
  assert.throws(() => registry.resolve('my_firefox', true), /does not support Stagehand/);
  assert.throws(
    () =>
      new RemoteBrowserProvider('bad', { engine: 'firefox', transport: 'cdp' }, async () => ({
        endpoint: 'ws://example',
      })),
    /CDP requires/,
  );
  const launchUrl = new RemoteBrowserProvider(
    'launch_url',
    { engine: 'chromium', transport: 'cdp' },
    async () => ({ endpoint: 'wss://example' }),
  );
  assert.throws(
    () => new BrowserRegistry([launchUrl]).resolve('launch_url', true),
    /does not support Stagehand/,
  );
  const context = CrawlContextSchema.parse({
    version: 1,
    acquisition: {
      mode: 'interactive',
      browser: 'cloud_chrome',
      model: 'openai/test',
      actions: [{ type: 'act', instruction: 'Expand' }],
    },
  });
  assert.equal(context.acquisition.mode, 'interactive');
});
test('remote lease releases on invalid connection and redacts endpoint secrets', async () => {
  let releases = 0;
  const provider = new RemoteBrowserProvider(
    'remote',
    { engine: 'chromium', transport: 'cdp' },
    async () => ({
      endpoint: 'file:///secret-key',
      release: async () => {
        releases++;
      },
    }),
  );
  await assert.rejects(
    provider.open(options),
    (error) => error instanceof Error && !error.message.includes('secret-key'),
  );
  assert.equal(releases, 1);
});
test('aborted remote session is released before returning and lease close is idempotent', async () => {
  const controller = new AbortController();
  let releases = 0;
  const provider = new RemoteBrowserProvider(
    'remote',
    { engine: 'chromium', transport: 'cdp' },
    async () => {
      controller.abort();
      return {
        endpoint: 'ws://example',
        release: async () => {
          releases++;
        },
      };
    },
  );
  await assert.rejects(provider.open({ ...options, signal: controller.signal }));
  assert.equal(releases, 1);
  const valid = new RemoteBrowserProvider(
    'remote',
    { engine: 'chromium', transport: 'cdp' },
    async () => ({
      endpoint: 'ws://example',
      release: async () => {
        releases++;
      },
    }),
  );
  const lease = await valid.open(options);
  await Promise.all([lease.close(), lease.close()]);
  assert.equal(releases, 2);
});
test('Browserbase API contract creates a session with explicit egress and releases it', async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const request = (async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json(
      calls.length === 1
        ? { id: 'session-1', connectUrl: 'wss://browser.example?secret=token' }
        : {},
    );
  }) as typeof fetch;
  const lease = await browserbaseProvider(
    { apiKey: 'cloud-secret', projectId: 'project-1' },
    request,
  ).open(options);
  const payload = JSON.parse(String(calls[0].init?.body));
  assert.deepEqual(payload.proxies, [{ type: 'external', ...options.proxy }]);
  assert.equal(payload.timeout, 60);
  assert.equal(payload.keepAlive, false);
  await lease.close();
  await lease.close();
  assert.equal(calls.length, 2);
  assert.ok(calls[1].url.endsWith('/session-1'));
  assert.equal(JSON.parse(String(calls[1].init?.body)).status, 'REQUEST_RELEASE');
});
test('Browserbase malformed response releases known session and hides API response content', async () => {
  let calls = 0;
  const request = (async () => {
    calls++;
    return Response.json(calls === 1 ? { id: 'session-1' } : {});
  }) as typeof fetch;
  await assert.rejects(
    browserbaseProvider({ apiKey: 'cloud-secret', projectId: 'project' }, request).open(options),
    /session creation failed/,
  );
  assert.equal(calls, 2);
});
test('deployment configuration resolves only environment references with safe errors', () => {
  const config = [
    {
      id: 'cloud_firefox',
      engine: 'firefox',
      transport: 'playwright',
      endpointEnv: 'REMOTE_WS',
      headersEnv: 'REMOTE_HEADERS',
    },
  ];
  const resolved = resolveRemoteBrowsers(config, {
    REMOTE_WS: 'wss://example?token=secret',
    REMOTE_HEADERS: '{"Authorization":"secret"}',
  });
  assert.equal(resolved[0].headers?.Authorization, 'secret');
  assert.throws(() => resolveRemoteBrowsers([{ ...config[0], endpoint: 'wss://example' }], {}));
  assert.throws(
    () =>
      resolveRemoteBrowsers(config, {
        REMOTE_WS: 'wss://example',
        REMOTE_HEADERS: 'secret-invalid',
      }),
    /Invalid browser headers environment variable: REMOTE_HEADERS/,
  );
});

test('Camoufox sets its locale, Toronto timezone and humanized cursor at launch', async () => {
  const camoufox = new LocalBrowserProvider('camoufox', 'firefox', true);
  // A page-level locale would replace the browser's own Accept-Language with a bare tag.
  assert.equal(camoufox.capabilities.launchLocale, true);
  assert.equal(new LocalBrowserProvider('chromium', 'chromium').capabilities.launchLocale, false);
  const lease = await camoufox.open({ ...options, locale: 'en-CA' });
  const env = (lease.launchOptions.env ?? {}) as Record<string, string>;
  const config = JSON.parse(
    Object.keys(env)
      .filter((key) => key.startsWith('CAMOU_CONFIG_'))
      .sort((a, b) => Number(a.slice(13)) - Number(b.slice(13)))
      .map((key) => env[key])
      .join(''),
  );
  assert.equal(env.TZ, 'America/Toronto');
  assert.equal(config.humanize, true);
  assert.equal(config['locale:region'], 'CA');
  // Always a desktop browser at desktop size, so stores serve the page the desktop parsers read.
  assert.match(String(config['navigator.userAgent']), /Windows NT|Macintosh/);
  assert.doesNotMatch(String(config['navigator.userAgent']), /Mobile|Android|iPhone/);
  assert.equal(config['window.outerWidth'], 1440);
  await lease.close();
});
