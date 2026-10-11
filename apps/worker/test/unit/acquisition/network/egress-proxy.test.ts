import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EgressProxy } from '../../../../src/acquisition/network/egress-proxy.ts';
import { UrlPolicy } from '../../../../src/acquisition/network/url-policy.ts';

test('browser egress requires authentication and rejects private HTTP and CONNECT targets', async () => {
  const proxy = new EgressProxy(new UrlPolicy(), 2000, 10000);
  const config = await proxy.start();
  async function request(method: string, path: string, authenticate = true) {
    return new Promise<number>((resolve, reject) => {
      const req = http.request(config.server, {
        method,
        path,
        headers: authenticate
          ? {
              'proxy-authorization':
                'Basic ' + Buffer.from(config.username + ':' + config.password).toString('base64'),
            }
          : {},
      });
      req.on('response', (res) => {
        res.resume();
        resolve(res.statusCode!);
      });
      req.on('connect', (res, socket) => {
        socket.destroy();
        resolve(res.statusCode!);
      });
      req.on('error', reject);
      req.end();
    });
  }
  try {
    assert.equal(await request('GET', 'http://example.com', false), 407);
    assert.equal(await request('GET', 'http://127.0.0.1/private'), 403);
    assert.equal(await request('CONNECT', '169.254.169.254:443'), 403);
  } finally {
    await proxy.close();
  }
});

test('CONNECT chains through an authenticated upstream using the pinned address', async () => {
  const { startProxy } = await import('../../../fixtures/proxy.ts');
  const { createServer } = await import('node:net');
  const upstream = await startProxy();
  const echo = createServer((socket) => socket.pipe(socket));
  await new Promise<void>((resolve) => echo.listen(0, '127.0.0.1', resolve));
  const port = (echo.address() as { port: number }).port;
  class FixturePolicy extends UrlPolicy {
    async address(url: URL) {
      assert.equal(url.hostname, 'fixture.example');
      return { address: '127.0.0.1', family: 4 };
    }
  }
  const gateway = new EgressProxy(new FixturePolicy(), 2000, 10000);
  gateway.setUpstream(upstream.url);
  const config = await gateway.start();
  try {
    const echoed = await new Promise<string>((resolve, reject) => {
      const request = http.request(config.server, {
        method: 'CONNECT',
        path: `fixture.example:${port}`,
        headers: {
          'proxy-authorization': `Basic ${Buffer.from(`${config.username}:${config.password}`).toString('base64')}`,
        },
      });
      request.on('error', reject);
      request.on('connect', (response, socket) => {
        assert.equal(response.statusCode, 200);
        socket.on('error', reject);
        socket.once('data', (data) => {
          resolve(data.toString());
          socket.destroy();
        });
        socket.write('test-tunnel');
      });
      request.end();
    });
    assert.equal(echoed, 'test-tunnel');
    assert.equal(upstream.requests[0].destination, `127.0.0.1:${port}`);
    assert.equal(
      upstream.requests[0].auth,
      `Basic ${Buffer.from('user:secret').toString('base64')}`,
    );
  } finally {
    await gateway.close();
    await upstream.close();
    await new Promise<void>((resolve) => echo.close(() => resolve()));
  }
});
