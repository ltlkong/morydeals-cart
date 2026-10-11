import { createWriteStream } from 'node:fs';
import { mkdir, readdir, readFile, stat, link, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { hash, randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { ZipFile } from 'yazl';
import { open, type Entry } from 'yauzl';

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 512 * 1024 * 1024;
const MAX_FILES = 1000;
const MANIFEST = 'bundle-manifest.json';
const safeName = (name: string) => /^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(name);

// Publish a complete ZIP atomically without replacing an existing audit.
export async function packAuditBundle(directory: string, destination: string, auditId: string) {
  const names = (await readdir(directory)).sort();
  if (names.length >= MAX_FILES || names.includes(MANIFEST)) throw new Error('Invalid audit files');
  const files: Record<string, { bytes: number; sha256: string }> = Object.create(null);
  let total = 0;
  for (const name of names) {
    if (!safeName(name)) throw new Error('Invalid audit filename');
    const info = await stat(join(directory, name));
    total += info.size;
    if (!info.isFile() || info.size > MAX_FILE_BYTES || total > MAX_BUNDLE_BYTES)
      throw new Error('Audit bundle exceeds size limit');
    const body = await readFile(join(directory, name));
    files[name] = { bytes: body.length, sha256: hash('sha256', body) };
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const temporary = `${destination}.${randomUUID()}.tmp`;
  const zip = new ZipFile();
  const output = createWriteStream(temporary, { flags: 'wx', mode: 0o600 });
  zip.on('error', (error) => output.destroy(error));
  const written = pipeline(zip.outputStream, output);
  try {
    for (const name of names) zip.addFile(join(directory, name), name);
    zip.addBuffer(Buffer.from(JSON.stringify({ version: 1, auditId, files })), MANIFEST);
    zip.end();
    await written;
    await readAuditBundle(temporary); // Validate the complete package before publishing.
    await link(temporary, destination);
  } catch (error) {
    output.destroy(error instanceof Error ? error : new Error(String(error)));
    throw error;
  } finally {
    output.destroy();
    await written.catch(() => undefined);
    await unlink(temporary).catch(() => undefined);
  }
}

// Read in memory with bounded sizes; ZIP paths/symlinks are never extracted to disk.
export async function readAuditBundle(
  path: string,
  expectedId?: string,
): Promise<Map<string, Buffer>> {
  if ((await stat(path)).size > MAX_BUNDLE_BYTES + 1024 * 1024)
    throw new Error('Audit ZIP too large');
  return new Promise((resolve, reject) => {
    open(path, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) {
        reject(error ?? new Error('Invalid audit ZIP'));
        return;
      }
      const files = new Map<string, Buffer>();
      let total = 0;
      const fail = (error: unknown) => {
        zip.close();
        reject(error);
      };
      zip.on('error', fail);
      zip.on('entry', (entry: Entry) => {
        total += entry.uncompressedSize;
        if (
          !safeName(entry.fileName) ||
          files.has(entry.fileName) ||
          files.size >= MAX_FILES ||
          entry.uncompressedSize > MAX_FILE_BYTES ||
          total > MAX_BUNDLE_BYTES
        ) {
          fail(new Error('Invalid or oversized audit ZIP entry'));
          return;
        }
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) {
            fail(error ?? new Error('Unreadable audit entry'));
            return;
          }
          const chunks: Buffer[] = [];
          let bytes = 0;
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > entry.uncompressedSize) {
              stream.destroy();
              fail(new Error('Audit entry size mismatch'));
            } else chunks.push(chunk);
          });
          stream.on('end', () => {
            files.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        try {
          const manifest = JSON.parse(files.get(MANIFEST)?.toString() ?? 'null');
          if (
            manifest?.version !== 1 ||
            !manifest.files ||
            Object.keys(manifest.files).length !== files.size - 1
          )
            throw new Error('Invalid audit manifest');
          if (expectedId && manifest.auditId !== expectedId) throw new Error('Audit ID mismatch');
          for (const [name, body] of files) {
            if (name === MANIFEST) continue;
            const expected = manifest.files[name];
            if (expected?.bytes !== body.length || expected.sha256 !== hash('sha256', body))
              throw new Error(`Archive integrity mismatch: ${name}`);
          }
          resolve(files);
        } catch (error) {
          fail(error);
        }
      });
      zip.readEntry();
    });
  });
}
