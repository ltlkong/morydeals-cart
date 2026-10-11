import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type IncomingHttpHeaders } from 'node:http';
import { gzipSync } from 'node:zlib';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Archive, readArchive } from '../../../../src/audit/raw-archive.ts';
import { HttpTransport, decodeHtml } from '../../../../src/acquisition/http/http.transport.ts';
import { LocalDomainLimiter } from '../../../../src/acquisition/network/domain-limiter.ts';
import { RejectedUrlError, UrlPolicy } from '../../../../src/acquisition/network/url-policy.ts';

test('captures redirect bytes and bounded oversized failures before parsing', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-fetch-'));
  const server = createServer((req, res) => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/ok' });
      res.end('redirect audit');
    } else if (req.url === '/large') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('x'.repeat(2000));
    } else {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<h1>OK</h1>');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  const fetcher = new HttpTransport(new UrlPolicy(true), new LocalDomainLimiter(0), 2000, 1000);
  try {
    const archive = new Archive(root, 'run', 'attempt', `http://127.0.0.1:${port}/redirect`);
    await archive.initialize();
    await fetcher.fetch(archive.raw.requestedUrl, archive);
    await archive.seal();
    assert.equal(archive.raw.captures.length, 2);
    await assert.rejects(archive.write('response-0.body', 'changed'), /EEXIST/);
    await archive.finalize();
    assert.equal((await readArchive(archive.bundlePath)).body.toString(), '<h1>OK</h1>');
    const large = new Archive(root, 'run2', 'attempt', `http://127.0.0.1:${port}/large`);
    await large.initialize();
    await assert.rejects(fetcher.fetch(large.raw.requestedUrl, large), /byte limit/);
    assert.equal(large.raw.captures[0].bytes, 1000);
    assert.equal(large.raw.captures[0].truncated, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
test('revalidates redirects instead of following them to private services', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-redirect-'));
  const server = createServer((_req, res) => {
    res.writeHead(302, { location: 'http://10.0.0.1/secret' });
    res.end('redirect');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const archive = new Archive(
    root,
    'run',
    'attempt',
    `http://127.0.0.1:${(server.address() as { port: number }).port}/`,
  );
  await archive.initialize();
  try {
    await assert.rejects(
      new HttpTransport(new UrlPolicy(true), new LocalDomainLimiter(0), 2000, 1000).fetch(
        archive.raw.requestedUrl,
        archive,
      ),
      /Private/,
    );
    assert.equal(archive.raw.captures.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
test('pinned hostname requests work with Node automatic family selection', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-hostname-'));
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>Pinned host</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  class FixturePolicy extends UrlPolicy {
    async address(url: URL) {
      assert.equal(url.hostname, 'fixture.example');
      return { address: '127.0.0.1', family: 4 };
    }
  }
  const archive = new Archive(
    root,
    'hostname',
    'attempt',
    `http://fixture.example:${(server.address() as { port: number }).port}/`,
  );
  await archive.initialize();
  try {
    const fetched = await new HttpTransport(
      new FixturePolicy(),
      new LocalDomainLimiter(0),
      2000,
      1000,
    ).fetch(archive.raw.requestedUrl, archive);
    assert.equal(fetched.body.toString(), '<h1>Pinned host</h1>');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('HTTP proxy traffic uses the validated IP and preserves the original Host header', async () => {
  const { startProxy } = await import('../../../fixtures/proxy.ts');
  const proxy = await startProxy();
  const root = await mkdtemp(join(tmpdir(), 'mory-http-proxy-'));
  const server = createServer((req, res) => {
    assert.ok(req.headers.host?.startsWith('fixture.example:'));
    assert.equal(req.headers['proxy-authorization'], undefined);
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>Proxied</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as { port: number }).port;
  class FixturePolicy extends UrlPolicy {
    async address() {
      return { address: '127.0.0.1', family: 4 };
    }
  }
  const archive = new Archive(root, 'proxied', 'attempt', `http://fixture.example:${port}/product`);
  await archive.initialize();
  try {
    const result = await new HttpTransport(
      new FixturePolicy(),
      new LocalDomainLimiter(0),
      2000,
      1000,
    ).fetch(archive.raw.requestedUrl, archive, { proxyUrl: proxy.url });
    assert.equal(result.body.toString(), '<h1>Proxied</h1>');
    assert.equal(proxy.requests[0].destination, `127.0.0.1:${port}`);
    assert.equal(proxy.requests[0].auth, `Basic ${Buffer.from('user:secret').toString('base64')}`);
  } finally {
    await proxy.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('read-only GraphQL POST preserves JSON bytes and never follows redirects', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-graphql-'));
  let requests = 0;
  let received = '';
  const server = createServer(async (req, res) => {
    requests++;
    assert.equal(req.method, 'POST');
    assert.equal(req.headers['content-type'], 'application/json');
    for await (const part of req) received += String(part);
    if (req.url === '/redirect') {
      res.writeHead(307, { location: '/other-shop' });
      res.end('redirect refused');
    } else {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"data":{"selected":{"id":"202"}}}');
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const transport = new HttpTransport(new UrlPolicy(true), new LocalDomainLimiter(0), 2000, 1000);
  const query = {
    query: 'query Selected($id: ID!) { node(id: $id) { id } }',
    variables: { id: '202' },
  };
  try {
    const archive = new Archive(root, 'graphql', 'one', base);
    await archive.initialize();
    const response = await transport.fetch(base, archive, {
      json: query,
      capture: { kind: 'api-response' },
    });
    assert.deepEqual(JSON.parse(received), query);
    assert.equal(response.capture.kind, 'api-response');
    assert.equal(response.body.toString(), '{"data":{"selected":{"id":"202"}}}');
    const redirect = new Archive(root, 'graphql', 'two', base + '/redirect');
    await redirect.initialize();
    await assert.rejects(
      transport.fetch(base + '/redirect', redirect, { json: query }),
      /redirects are not permitted/,
    );
    assert.equal(requests, 2);
    assert.equal(redirect.raw.captures.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('requests present a browser, never a bot user agent', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-headers-'));
  let seen: IncomingHttpHeaders = {};
  const server = createServer((req, res) => {
    seen = req.headers;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>OK</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  const archive = new Archive(root, 'headers', 'attempt', url);
  await archive.initialize();
  try {
    await new HttpTransport(new UrlPolicy(true), new LocalDomainLimiter(0), 2000, 1000).fetch(
      url,
      archive,
      { locale: 'en-CA' },
    );
    assert.match(String(seen['user-agent']), /Mozilla\/5\.0 .*Chrome\/\d+/);
    assert.doesNotMatch(String(seen['user-agent']), /bot/i);
    assert.match(String(seen.accept), /^text\/html/);
    assert.match(String(seen['accept-language']), /^en-CA/);
    assert.ok(seen['sec-ch-ua']);
    assert.equal(seen['sec-fetch-mode'], 'navigate');
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('requests keep the byte limit, redirect checks and single decoding', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-impit-'));
  let seen: IncomingHttpHeaders = {};
  const server = createServer((req, res) => {
    seen = req.headers;
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/gzip' });
      res.end();
    } else if (req.url === '/private') {
      res.writeHead(302, { location: 'http://10.0.0.1/secret' });
      res.end();
    } else if (req.url === '/large') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('x'.repeat(5000));
    } else {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-encoding': 'gzip',
      });
      res.end(gzipSync('<h1>Decoded once</h1>'));
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const transport = new HttpTransport(new UrlPolicy(true), new LocalDomainLimiter(0), 5000, 1000);
  try {
    const archive = new Archive(root, 'impit', 'one', base + '/redirect');
    await archive.initialize();
    const fetched = await transport.fetch(base + '/redirect', archive, { locale: 'en-CA' });
    assert.equal(archive.raw.captures.length, 2);
    assert.equal(decodeHtml(fetched.body, fetched.capture, 1000), '<h1>Decoded once</h1>');
    assert.match(String(seen['user-agent']), /Chrome\/\d+/);
    assert.match(String(seen['accept-language']), /^en-CA/);
    const large = new Archive(root, 'impit', 'two', base + '/large');
    await large.initialize();
    await assert.rejects(transport.fetch(base + '/large', large), /byte limit/);
    assert.equal(large.raw.captures[0].bytes, 1000);
    const redirect = new Archive(root, 'impit', 'three', base + '/private');
    await redirect.initialize();
    await assert.rejects(transport.fetch(base + '/private', redirect), /Private/);
    assert.equal(redirect.raw.captures.length, 1);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('a destination the policy rejects is never reached, even when system DNS finds it', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-rejected-'));
  let reached = 0;
  const server = createServer((_req, res) => {
    reached++;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>internal</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  class RejectingPolicy extends UrlPolicy {
    async address(): Promise<never> {
      throw new RejectedUrlError(
        'Private, local and reserved network destinations are not allowed',
      );
    }
  }
  const url = `http://localhost:${(server.address() as { port: number }).port}/`;
  const archive = new Archive(root, 'rejected', 'attempt', url);
  await archive.initialize();
  try {
    await assert.rejects(
      new HttpTransport(new RejectingPolicy(), new LocalDomainLimiter(0), 2000, 1000).fetch(
        url,
        archive,
      ),
      /Private/,
    );
    assert.equal(reached, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});

test('cookies set during a fetch follow its redirects but never reach another fetch', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-cookies-'));
  const cookies: (string | undefined)[] = [];
  const server = createServer((req, res) => {
    cookies.push(req.headers.cookie);
    if (req.url === '/start') {
      res.writeHead(302, { location: '/product', 'set-cookie': 'session-id=1; Path=/' });
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<h1>OK</h1>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const transport = new HttpTransport(new UrlPolicy(true), new LocalDomainLimiter(0), 2000, 1000);
  try {
    const first = new Archive(root, 'cookies', 'one', base + '/start');
    await first.initialize();
    await transport.fetch(base + '/start', first);
    const second = new Archive(root, 'cookies', 'two', base + '/product');
    await second.initialize();
    await transport.fetch(base + '/product', second);
    assert.deepEqual(cookies, [undefined, 'session-id=1', undefined]);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
