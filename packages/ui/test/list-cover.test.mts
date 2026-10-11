import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coverTiles } from '../src/commerce/list-cover.ts';

test('a list cover: nothing shows an icon, one image fills it, more make a 2x2 mosaic of the newest four', () => {
  assert.deepEqual(coverTiles([]), { kind: 'empty' });
  assert.deepEqual(coverTiles(['a']), { kind: 'single', image: 'a' });
  // Missing cells stay blank rather than repeating an image.
  assert.deepEqual(coverTiles(['a', 'b']), { kind: 'mosaic', cells: ['a', 'b', null, null] });
  assert.deepEqual(coverTiles(['a', 'b', 'c', 'd', 'e']), { kind: 'mosaic', cells: ['a', 'b', 'c', 'd'] });
});
