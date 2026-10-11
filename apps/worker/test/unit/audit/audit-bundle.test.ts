import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ZipFile } from 'yazl';
import { Archive, readArchive } from '../../../src/audit/raw-archive.ts';
import { readAuditBundle } from '../../../src/audit/audit-bundle.ts';
import { auditBundlePath } from '../../../src/audit/audit-id.ts';

async function writeZip(path: string, entries: Map<string, Buffer>) {
  const zip = new ZipFile();
  const finished = pipeline(zip.outputStream, createWriteStream(path));
  for (const [name, body] of entries) zip.addBuffer(body, name);
  zip.end();
  await finished;
}

test('audit ID resolves to one ZIP; publishes without overwriting, removes loose files and verifies all entries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'mory-audit-'));
  const archive = new Archive(
    root,
    'daily-price',
    'attempt-1',
    'https://shop.example/products/headphones',
  );
  try {
    await archive.initialize();
    await archive.capture(Buffer.from('<h1>Product</h1>'), {
      url: archive.raw.requestedUrl,
      status: 200,
      headers: { 'content-type': 'text/html' },
      capturedAt: new Date().toISOString(),
      truncated: false,
    });
    await archive.seal();
    await archive.artifact('page.md', '# Product');
    assert.equal(await archive.finalize(), archive.id);
    assert.match(
      archive.id,
      /^product-page\/\d{4}-\d{2}-\d{2}\/shop\.example\/[a-f0-9]{16}\/daily-price--attempt-1$/,
    );
    assert.equal(archive.bundlePath, auditBundlePath(root, archive.id));
    assert.equal((await readArchive(archive.bundlePath)).body.toString(), '<h1>Product</h1>');
    assert.equal(await stat(archive.directory).catch(() => null), null);
    assert.equal(await archive.finalize(), archive.id);
    await assert.rejects(archive.artifact('late.txt', 'bad'), /finalized/);
    const prior = await readFile(archive.bundlePath);
    const duplicate = new Archive(root, 'daily-price', 'attempt-1', archive.raw.requestedUrl);
    await duplicate.initialize();
    await duplicate.seal();
    await assert.rejects(duplicate.finalize(), /EEXIST/);
    assert.deepEqual(await readFile(archive.bundlePath), prior);
    const entries = await readAuditBundle(archive.bundlePath);
    await assert.rejects(readAuditBundle(archive.bundlePath, 'wrong-id'), /ID mismatch/);
    entries.set('page.md', Buffer.from('tampered'));
    await writeZip(join(root, 'tampered.zip'), entries);
    await assert.rejects(readAuditBundle(join(root, 'tampered.zip')), /integrity mismatch/);
    await writeZip(join(root, 'paths.zip'), new Map([['unsafe/file.txt', Buffer.from('no')]]));
    await assert.rejects(readAuditBundle(join(root, 'paths.zip')), /Invalid/);
    assert.throws(() => auditBundlePath(root, '../private'), /Invalid/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
