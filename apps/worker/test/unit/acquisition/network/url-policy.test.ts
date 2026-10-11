import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UrlPolicy,
  inputUrl,
  publicAddress,
} from '../../../../src/acquisition/network/url-policy.ts';

test('URL policy excludes local, reserved, credentials and mapped IPv6 targets', async () => {
  for (const address of [
    '127.0.0.1',
    '10.0.0.1',
    '169.254.169.254',
    '192.168.1.1',
    '0.0.0.0',
    '::1',
    '::ffff:127.0.0.1',
    'fc00::1',
    'fe80::1',
    '224.0.0.1',
    '192.0.2.1',
  ])
    assert.equal(publicAddress(address), false, address);
  assert.equal(publicAddress('8.8.8.8'), true);
  assert.throws(() => inputUrl('file:///etc/passwd'));
  assert.throws(() => inputUrl('https://user:pass@example.com'));
  await assert.rejects(new UrlPolicy().address(new URL('http://127.0.0.1')), /Private/);
});
