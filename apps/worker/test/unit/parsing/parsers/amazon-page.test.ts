import { test } from 'node:test';
import assert from 'node:assert/strict';
import { amazonPageChallenge, parseAmazonProduct } from '../../../../src/parsing/parsers/index.ts';
const url = 'https://www.amazon.ca/dp/B0CZ6XY78Y';
const challenge =
  '<form action="/errors_page/validateCaptcha"><button>Continue shopping</button></form>';
test('Amazon verification responses are identified independently of product identity', () => {
  assert.ok(amazonPageChallenge(url, 202));
  assert.ok(amazonPageChallenge(url, 200, challenge));
  assert.ok(
    amazonPageChallenge(
      url,
      200,
      '<script>location.href="/_sec/verify?provider=interstitial"</script>',
    ),
  );
  assert.ok(amazonPageChallenge(url, 200, '<input id="captchacharacters">'));
  assert.equal(
    amazonPageChallenge(url, 200, '<div id="productTitle">Camera</div><p>Continue shopping</p>'),
    undefined,
  );
  assert.equal(amazonPageChallenge('https://example.com/p', 202, challenge), undefined);
  const result = parseAmazonProduct({
    version: '1',
    url,
    html: challenge,
    markdown: '',
    metadata: {},
    jsonLd: [],
    fetchedAt: new Date().toISOString(),
  });
  assert.equal(result.status, 'needs_review');
  assert.deepEqual(result.issues, ['Amazon verification page']);
});
