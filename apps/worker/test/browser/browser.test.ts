import { DocumentPreparationService } from '../../src/parsing/document/document-preparation.service.ts';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { firefox, chromium } from 'playwright';
import { createServer as createNetServer } from 'node:net';
import { BrowserRegistry } from '../../src/acquisition/browser/browser.registry.ts';
import { createBrowserRegistry } from '../../src/acquisition/browser/browser.factory.ts';
import { RemoteBrowserProvider } from '../../src/acquisition/browser/providers/remote.provider.ts';
import { launchOptions } from 'camoufox-js';
import { Archive, readArchive } from '../../src/audit/raw-archive.ts';
import { BrowserDriver } from '../../src/acquisition/browser/browser.driver.ts';
import { HttpDriver } from '../../src/acquisition/http/http.driver.ts';
import { AcquisitionRunner } from '../../src/acquisition/acquisition.runner.ts';
import { LocalDomainLimiter } from '../../src/acquisition/network/domain-limiter.ts';
import { UrlPolicy } from '../../src/acquisition/network/url-policy.ts';
import type { CrawlContextInput } from '@morydeals/capture-contracts';

let root: string, base: string;
let hits = 0;
const server = createServer((req, res) => {
  hits++;
  res.writeHead(200, { 'content-type': 'text/html' });
  if (req.url?.startsWith('/identity/')) {
    const identity = req.url.endsWith('/one') ? 'one' : 'two';
    res.end(
      `<html><body><p id="initial">${req.headers.cookie ?? ''}</p><script>document.cookie='identity=${identity}';setTimeout(()=>{const p=document.createElement('p');p.setAttribute('data-product','');p.textContent=document.cookie;document.body.append(p)},200)</script></body></html>`,
    );
    return;
  }
  res.end(
    `<html><body><div id="loading">Loading</div><button id="expand" onclick="document.querySelector('#details').hidden=false">Expand</button><p id="details" hidden>40 hours battery</p><script>setTimeout(()=>{document.querySelector('#loading').outerHTML='<h1 data-product>JS Product CAD 99</h1>';},200)</script></body></html>`,
  );
});
before(async () => {
  root = await mkdtemp(join(tmpdir(), 'mory-browser-'));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
});
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(root, { recursive: true, force: true });
});
async function acquire(
  context: CrawlContextInput,
  remote?: string,
  container = false,
  registry?: BrowserRegistry,
  url = base,
) {
  const archive = new Archive(root, randomUUID(), randomUUID(), url);
  await archive.initialize();
  const policy = new UrlPolicy(true);
  const limiter = new LocalDomainLimiter(0);
  const browser = new BrowserDriver(policy, limiter, 100000, {
    deployment: {
      camoufoxWsEndpoint: remote,
      ...(container
        ? { proxyBindHost: '0.0.0.0', proxyAdvertisedHost: 'host.docker.internal' }
        : {}),
    },
    registry,
  });
  const acquisition = new AcquisitionRunner(
    { http: new HttpDriver(policy, limiter, 100000), browser, interactive: browser },
    100000,
  );
  try {
    const result = await acquisition.fetch(url, archive, context);
    await archive.seal();
    await new DocumentPreparationService({ maxBytes: 5000000 }).prepare(result, archive, context);
    return { result, archive };
  } catch (error) {
    await archive.seal(String(error));
    throw error;
  } finally {
    await browser.close();
  }
}
test('real local Camoufox renders JS, executes configured actions, seals DOM and network response', async () => {
  const { result, archive } = await acquire({
    version: 1,
    acquisition: {
      mode: 'browser',
      browser: 'camoufox',
      timeoutMs: 20000,
      actions: [{ type: 'click', selector: '#expand' }],
      waitFor: { selector: '[data-product]' },
    },
    audit: { screenshots: false },
  });
  assert.ok(result.html?.includes('JS Product CAD 99'));
  assert.equal(result.acquisition.attempts[0].mode, 'browser');
  assert.ok(archive.raw.captures.some((c) => c.kind === 'http-response'));
  assert.ok(archive.raw.captures.some((c) => c.kind === 'rendered-dom'));
  assert.ok(
    (await readFile(join(archive.directory, 'page.md'), 'utf8')).includes('40 hours battery'),
  );
  await archive.finalize();
  const replay = await readArchive(archive.bundlePath);
  assert.equal(replay.capture.kind, 'rendered-dom');
});
test('configured HTTP → Camoufox fallback renders only after readiness failure', async () => {
  const { result } = await acquire({
    version: 1,
    acquisition: { mode: 'http', waitFor: { selector: '[data-product]' } },
    fallback: [
      {
        on: ['incomplete'],
        acquisition: {
          mode: 'browser',
          browser: 'camoufox',
          waitFor: { selector: '[data-product]' },
        },
      },
    ],
    audit: { screenshots: false },
  });
  assert.deepEqual(
    result.acquisition.attempts.map((a) => a.mode),
    ['http', 'browser'],
  );
});
test('connects to a remote Camoufox Playwright server without launching another browser', async () => {
  const remote = await firefox.launchServer({
    ...(await launchOptions({
      headless: true,
      block_webrtc: true,
      firefox_user_prefs: { 'network.proxy.allow_hijacking_localhost': true },
    })),
  });
  try {
    const count = hits;
    const { result } = await acquire(
      {
        version: 1,
        acquisition: {
          mode: 'browser',
          browser: 'camoufox',
          waitFor: { selector: '[data-product]' },
        },
        audit: { screenshots: false },
      },
      remote.wsEndpoint(),
    );
    assert.equal(result.acquisition.status, 'ready');
    assert.ok(hits > count);
  } finally {
    await remote.close();
  }
});
test('concurrent remote jobs own isolated browser contexts', async () => {
  const remote = await firefox.launchServer({
    ...(await launchOptions({
      headless: true,
      block_webrtc: true,
      firefox_user_prefs: { 'network.proxy.allow_hijacking_localhost': true },
    })),
  });
  try {
    const context: CrawlContextInput = {
      version: 1,
      acquisition: {
        mode: 'browser',
        browser: 'camoufox',
        waitFor: { selector: '[data-product]' },
      },
      audit: { screenshots: false },
    };
    const pages = await Promise.all([
      acquire(context, remote.wsEndpoint()),
      acquire(context, remote.wsEndpoint()),
    ]);
    assert.ok(pages.every((p) => p.result.acquisition.status === 'ready'));
    assert.notEqual(pages[0].archive.directory, pages[1].archive.directory);
  } finally {
    await remote.close();
  }
});
test('Crawlee StagehandCrawler launches Chromium and executes deterministic steps without a model call', async () => {
  const { result } = await acquire({
    version: 1,
    acquisition: {
      mode: 'interactive',
      browser: 'chromium',
      model: 'openai/gpt-4.1-mini',
      actions: [{ type: 'click', selector: '#expand' }],
      waitFor: { selector: '[data-product]' },
    },
    audit: { screenshots: false },
  });
  assert.equal(result.acquisition.attempts[0].mode, 'interactive');
  assert.ok(result.html?.includes('JS Product'));
});
test(
  'Docker Camoufox uses a remote context and the worker egress proxy',
  { skip: !process.env.TEST_CAMOUFOX_DOCKER_WS },
  async () => {
    const { result } = await acquire(
      {
        version: 1,
        acquisition: {
          mode: 'browser',
          browser: 'camoufox',
          waitFor: { selector: '[data-product]' },
        },
        audit: { screenshots: false },
      },
      process.env.TEST_CAMOUFOX_DOCKER_WS,
      true,
    );
    assert.equal(result.acquisition.status, 'ready');
    assert.ok(result.html?.includes('JS Product CAD 99'));
  },
);
for (const browser of ['chromium', 'firefox', 'webkit'])
  test(`local ${browser} provider renders and archives through shared driver`, async (t) => {
    if (browser === 'firefox' && process.platform === 'darwin') {
      try {
        const probe = await firefox.launch({ headless: true, timeout: 5000 });
        await probe.close();
      } catch (error) {
        if (error instanceof Error && error.message.includes('Could not find profile folder')) {
          t.skip('macOS Firefox profile startup failure: microsoft/playwright#42768');
          return;
        }
        throw error;
      }
    }
    const { result } = await acquire({
      version: 1,
      acquisition: { mode: 'browser', browser, waitFor: { selector: '[data-product]' } },
      audit: { screenshots: false },
    });
    assert.equal(result.acquisition.status, 'ready');
  });
test('generic remote Playwright provider uses registered id and remains usable after job completion', async () => {
  const remote = await chromium.launchServer({ headless: true });
  try {
    const registry = createBrowserRegistry({
      remoteBrowsers: [
        {
          id: 'online_chrome',
          engine: 'chromium',
          transport: 'playwright',
          endpoint: remote.wsEndpoint(),
        },
      ],
    });
    const { result } = await acquire(
      {
        version: 1,
        acquisition: {
          mode: 'browser',
          browser: 'online_chrome',
          waitFor: { selector: '[data-product]' },
        },
        audit: { screenshots: false },
      },
      undefined,
      false,
      registry,
    );
    assert.equal(result.acquisition.status, 'ready');
    const connection = await chromium.connect(remote.wsEndpoint());
    await connection.close();
  } finally {
    await remote.close();
  }
});
async function cdpServer() {
  const reservation = createNetServer();
  await new Promise<void>((r) => reservation.listen(0, '127.0.0.1', r));
  const port = (reservation.address() as { port: number }).port;
  await new Promise<void>((r) => reservation.close(() => r()));
  const remote = await chromium.launchServer({
    headless: true,
    args: [`--remote-debugging-port=${port}`],
  });
  const version = (await fetch(`http://127.0.0.1:${port}/json/version`).then((r) => r.json())) as {
    webSocketDebuggerUrl: string;
  };
  return {
    remote,
    endpoint: version.webSocketDebuggerUrl,
    httpEndpoint: `http://127.0.0.1:${port}`,
  };
}
test('remote CDP provider isolates concurrent jobs and releases each lease', async () => {
  const { remote, endpoint } = await cdpServer();
  let released = 0;
  try {
    const registry = new BrowserRegistry([
      new RemoteBrowserProvider(
        'cloud_cdp',
        { engine: 'chromium', transport: 'cdp' },
        async () => ({
          endpoint,
          release: async () => {
            released++;
          },
        }),
      ),
    ]);
    const context: CrawlContextInput = {
      version: 1,
      acquisition: {
        mode: 'browser',
        browser: 'cloud_cdp',
        waitFor: { selector: '[data-product]' },
      },
      audit: { screenshots: false },
    };
    const results = await Promise.all([
      acquire(context, undefined, false, registry, `${base}/identity/one`),
      acquire(context, undefined, false, registry, `${base}/identity/two`),
    ]);
    assert.ok(results.every(({ result }) => result.acquisition.status === 'ready'));
    assert.equal(released, 2);
    assert.ok(results[0].result.html?.includes('identity=one'));
    assert.ok(!results[0].result.html?.includes('identity=two'));
    assert.ok(results[1].result.html?.includes('identity=two'));
    assert.ok(!results[1].result.html?.includes('identity=one'));
  } finally {
    await remote.close();
  }
});
test('Stagehand attaches to registered remote CDP browser and executes deterministic steps', async () => {
  const { remote, httpEndpoint: endpoint } = await cdpServer();
  try {
    const registry = createBrowserRegistry({
      remoteBrowsers: [
        { id: 'cloud_cdp', engine: 'chromium', transport: 'cdp', endpoint, stagehand: true },
      ],
    });
    const { result } = await acquire(
      {
        version: 1,
        acquisition: {
          mode: 'interactive',
          browser: 'cloud_cdp',
          model: 'openai/gpt-4.1-mini',
          actions: [{ type: 'click', selector: '#expand' }],
          waitFor: { selector: '[data-product]' },
        },
        audit: { screenshots: false },
      },
      undefined,
      false,
      registry,
    );
    assert.equal(result.acquisition.status, 'ready');
  } finally {
    await remote.close();
  }
});
test('remote connection failure releases session before an explicit local fallback', async () => {
  let releases = 0;
  const registry = new BrowserRegistry([
    new RemoteBrowserProvider('offline', { engine: 'chromium', transport: 'cdp' }, async () => ({
      endpoint: 'ws://127.0.0.1:1/?secret=never-archive',
      release: async () => {
        releases++;
      },
    })),
    createBrowserRegistry().resolve('chromium'),
  ]);
  const { result, archive } = await acquire(
    {
      version: 1,
      acquisition: { mode: 'browser', browser: 'offline', timeoutMs: 1000 },
      fallback: [
        {
          on: ['network_error'],
          acquisition: {
            mode: 'browser',
            browser: 'chromium',
            waitFor: { selector: '[data-product]' },
          },
        },
      ],
      audit: { screenshots: false },
    },
    undefined,
    false,
    registry,
  );
  assert.equal(releases, 1);
  assert.equal(result.acquisition.attempts.length, 2);
  assert.ok(
    !(await readFile(join(archive.directory, 'acquisition.json'), 'utf8')).includes(
      'never-archive',
    ),
  );
});
test('remote readiness timeout closes and releases the session before fallback', async () => {
  const { remote, endpoint } = await cdpServer();
  let releases = 0;
  const local = createBrowserRegistry().resolve('chromium');
  const registry = new BrowserRegistry([
    new RemoteBrowserProvider('cloud_cdp', { engine: 'chromium', transport: 'cdp' }, async () => ({
      endpoint,
      release: async () => {
        releases++;
      },
    })),
    {
      id: local.id,
      capabilities: local.capabilities,
      open: async (options) => {
        assert.equal(releases, 1);
        return local.open(options);
      },
    },
  ]);
  try {
    const { result } = await acquire(
      {
        version: 1,
        acquisition: {
          mode: 'browser',
          browser: 'cloud_cdp',
          timeoutMs: 1000,
          waitFor: { selector: '#never' },
        },
        fallback: [
          {
            on: ['timeout'],
            acquisition: {
              mode: 'browser',
              browser: 'chromium',
              waitFor: { selector: '[data-product]' },
            },
          },
        ],
        audit: { screenshots: false },
      },
      undefined,
      false,
      registry,
    );
    assert.equal(result.acquisition.status, 'ready');
    assert.equal(result.acquisition.attempts[0].reason, 'timeout');
    assert.equal(releases, 1);
  } finally {
    await remote.close();
  }
});

test('browser pool reuses processes, isolates task cookies, rotates real proxy routes and closes on shutdown', async () => {
  const { startProxy } = await import('../fixtures/proxy.ts');
  const { NetworkSessions } = await import('../../src/acquisition/network/network-sessions.ts');
  const proxies = await Promise.all([startProxy(), startProxy()]);
  const network = new NetworkSessions([
    {
      id: 'test',
      urls: proxies.map((proxy) => proxy.url),
      maxSessions: 1,
      maxSessionUses: 50,
      maxSessionAgeSecs: 60,
    },
  ]);
  const policy = new UrlPolicy(true);
  const limiter = new LocalDomainLimiter(0);
  const browser = new BrowserDriver(policy, limiter, 100000, {
    deployment: { poolSize: 1 },
    network,
  });
  const runner = new AcquisitionRunner(
    { http: new HttpDriver(policy, limiter, 100000, network), browser, interactive: browser },
    100000,
  );
  const context: CrawlContextInput = {
    version: 1,
    acquisition: {
      mode: 'browser',
      browser: 'chromium',
      network: { proxyProfile: 'test', rotation: 'per-request' },
      waitFor: { selector: '[data-product]' },
    },
    audit: { screenshots: false },
  };
  const captures: { browserId: string; reused: boolean }[] = [];
  try {
    for (const name of ['one', 'two']) {
      const url = `${base}/identity/${name}`;
      const archive = new Archive(root, randomUUID(), randomUUID(), url);
      await archive.initialize();
      const result = await runner.fetch(url, archive, context);
      assert.ok(result.html?.includes('<p id="initial"></p>'));
      await archive.seal();
      captures.push(
        JSON.parse(await readFile(join(archive.directory, 'step-0-browser.json'), 'utf8')),
      );
    }
    assert.equal(captures[0].browserId, captures[1].browserId);
    assert.equal(captures[0].reused, false);
    assert.equal(captures[1].reused, true);
    for (const proxy of proxies) {
      assert.ok(proxy.requests.length > 0);
      assert.ok(proxy.requests.every((request) => request.destination.startsWith('127.0.0.1:')));
      assert.ok(
        proxy.requests.every(
          (request) => request.auth === `Basic ${Buffer.from('user:secret').toString('base64')}`,
        ),
      );
    }
  } finally {
    await browser.close();
    await network.close();
    await Promise.all(proxies.map((proxy) => proxy.close()));
  }
});

test('pooled leases expire while idle; waiting cancellation does not interrupt the active task', async () => {
  const { BrowserResources } = await import('../../src/acquisition/browser/browser-resources.ts');
  const { CrawlContextSchema } = await import('@morydeals/capture-contracts');
  const remote = await chromium.launchServer({ headless: true });
  let opened = 0,
    released = 0;
  const provider = new RemoteBrowserProvider(
    'pooled',
    { engine: 'chromium', transport: 'playwright' },
    async () => {
      opened++;
      return {
        endpoint: remote.wsEndpoint(),
        release: async () => {
          released++;
        },
      };
    },
  );
  const resources = new BrowserResources(new UrlPolicy(true), 100000, {
    poolSize: 1,
    idleMs: 50,
  });
  const context = CrawlContextSchema.parse({
    version: 1,
    acquisition: { mode: 'browser', browser: 'pooled' },
  });
  async function request(signal = new AbortController().signal) {
    const archive = new Archive(root, randomUUID(), randomUUID(), base);
    await archive.initialize();
    return { url: base, archive, context, step: context.acquisition, stepIndex: 0, signal };
  }
  let unblock!: () => void;
  let started!: () => void;
  const gate = new Promise<void>((resolve) => {
    unblock = resolve;
  });
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  try {
    const first = resources.run(await request(), provider, undefined, async (page) => {
      started();
      await gate;
      assert.equal(page.isClosed(), false);
    });
    await ready;
    const abort = new AbortController();
    const waiting = resources.run(await request(abort.signal), provider, undefined, async () =>
      assert.fail('Cancelled task must not start'),
    );
    const cancelled = assert.rejects(waiting);
    abort.abort(new Error('Cancelled while waiting'));
    await cancelled;
    assert.equal(opened, 1);
    unblock();
    await first;
    const deadline = Date.now() + 5000;
    while (!released && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
    assert.equal(released, 1);
    await resources.run(await request(), provider, undefined, async () => undefined);
    assert.equal(opened, 2);
    await resources.close();
    assert.equal(released, 2);
    await assert.rejects(
      resources.run(await request(), provider, undefined, async () => undefined),
      /closed/,
    );
  } finally {
    unblock();
    await resources.close();
    await remote.close();
  }
});

test('resource policy blocks image downloads while retaining script rendering; callers can opt out', async () => {
  let images = 0;
  const fixture = createServer((req, res) => {
    if (req.url === '/image.svg') {
      images++;
      res.setHeader('content-type', 'image/svg+xml');
      res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>');
    } else {
      res.setHeader('content-type', 'text/html');
      res.end(
        '<img src="/image.svg"><script>window.onload=()=>{document.body.insertAdjacentHTML("beforeend","<h1 data-product>Ready</h1>")}</script>',
      );
    }
  });
  await new Promise<void>((resolve) => fixture.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(fixture.address() as { port: number }).port}/`;
  try {
    const filtered = await acquire(
      {
        version: 1,
        acquisition: {
          mode: 'browser',
          browser: 'camoufox',
          waitFor: { selector: '[data-product]' },
        },
      },
      undefined,
      false,
      undefined,
      url,
    );
    assert.equal(images, 0);
    const report = JSON.parse(
      await readFile(join(filtered.archive.directory, 'step-0-resources.json'), 'utf8'),
    );
    assert.equal(report.blocked.image, 1);
    await acquire(
      {
        version: 1,
        acquisition: {
          mode: 'browser',
          browser: 'camoufox',
          blockResources: [],
          waitFor: { selector: '[data-product]' },
        },
      },
      undefined,
      false,
      undefined,
      url,
    );
    assert.equal(images, 1);
  } finally {
    await new Promise<void>((resolve) => fixture.close(() => resolve()));
  }
});

test('product readiness waits for asynchronous page data before capturing DOM', async () => {
  const { result } = await acquire({
    version: 1,
    acquisition: { mode: 'http', waitFor: { product: true } },
    fallback: [
      {
        on: ['incomplete'],
        acquisition: { mode: 'browser', browser: 'camoufox', waitFor: { product: true } },
      },
    ],
    audit: { screenshots: false },
  });
  assert.equal(result.acquisition.attempts[0].reason, 'incomplete');
  assert.equal(result.acquisition.attempts[1].status, 'ready');
  assert.ok(result.html?.includes('<h1 data-product="">JS Product CAD 99</h1>'));
});
