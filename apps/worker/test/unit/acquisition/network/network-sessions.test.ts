import { ResponseError } from '../../../../src/acquisition/http/http.transport.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NetworkSessions } from '../../../../src/acquisition/network/network-sessions.ts';
import { Archive } from '../../../../src/audit/raw-archive.ts';
import { CrawlContextSchema } from '@morydeals/capture-contracts';
import { resolveProxyProfiles } from '../../../../src/config/proxy.config.ts';

test('proxy configuration accepts environment references and keeps secrets out of errors/jobs', () => {
  const input = [{ id: 'ca', urlsEnv: 'CA_PROXY_URLS', maxSessions: 1 }];
  assert.equal(
    resolveProxyProfiles(input, { CA_PROXY_URLS: '["http://user:secret@proxy.example:8000"]' })[0]
      .urls.length,
    1,
  );
  assert.throws(
    () => resolveProxyProfiles(input, { CA_PROXY_URLS: '["socks5://secret@proxy.example"]' }),
    (error) => {
      assert.ok(!(error as Error).message.includes('secret'));
      return true;
    },
  );
  assert.throws(() => resolveProxyProfiles([...input, ...input], {}), /unique/);
  assert.equal(
    CrawlContextSchema.safeParse({
      version: 1,
      acquisition: { mode: 'http', network: { proxyUrl: 'http://secret@proxy' } },
    }).success,
    false,
  );
});

test('sessions keep their route, retire blocked routes, preserve 429 routes, and audit no credentials', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-sessions-'));
  const profiles = resolveProxyProfiles([{ id: 'ca', urlsEnv: 'PROXIES', maxSessions: 1 }], {
    PROXIES: '["http://user:secret@one.example:8000","http://user:secret@two.example:8000"]',
  });
  const sessions = new NetworkSessions(profiles);
  async function run(error?: string, rotation = 'session') {
    const context = CrawlContextSchema.parse({
      version: 1,
      acquisition: { mode: 'http', network: { proxyProfile: 'ca', rotation } },
    });
    const archive = new Archive(root, randomUUID(), randomUUID(), 'https://shop.example/product');
    await archive.initialize();
    let route: string | undefined;
    const promise = sessions.run(
      {
        url: archive.raw.requestedUrl,
        archive,
        context,
        step: context.acquisition,
        stepIndex: 0,
        signal: new AbortController().signal,
      },
      async (url) => {
        route = url;
        if (error === 'HTTP 403') throw new ResponseError('blocked', 'Blocked route', false, 403);
        if (error === 'HTTP 429') throw new ResponseError('http_error', 'Rate limited', true, 429);
        if (error) throw new Error(error);
      },
    );
    if (error) await assert.rejects(promise);
    else await promise;
    const audit = await readFile(join(archive.directory, 'step-0-network.json'), 'utf8');
    assert.ok(!audit.includes('secret') && !audit.includes('example'));
    return { route, session: JSON.parse(audit).sessionId as string };
  }
  try {
    const first = await run();
    assert.deepEqual(await run(), first);
    assert.deepEqual(await run('HTTP 429'), first);
    assert.deepEqual(await run(), first);
    for (let attempt = 0; attempt < 3; attempt++)
      assert.deepEqual(await run('Readiness selector missing'), first);
    assert.deepEqual(await run(), first);
    assert.deepEqual(await run('HTTP 403'), first);
    const replacement = await run();
    assert.notEqual(replacement.session, first.session);
    assert.notEqual(replacement.route, first.route);
    const fresh1 = await run(undefined, 'per-request');
    const fresh2 = await run(undefined, 'per-request');
    assert.notEqual(fresh1.route, fresh2.route);
    assert.notEqual(fresh1.session, fresh2.session);
  } finally {
    await sessions.close();
    await rm(root, { recursive: true, force: true });
  }
});
