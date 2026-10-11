import { readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { hash } from 'node:crypto';
import { gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import {
  PageSnapshotSchema,
  CrawlContextSchema,
  type CrawlTask,
} from '@morydeals/capture-contracts';
import { htmlCaptureStrategy } from '../parsing/parsers/index.ts';
import type { Archive } from '../audit/raw-archive.ts';
import { defaultLlmParsing, type Configuration } from '../config/worker.config.ts';
const decompress = promisify(gunzip);
/** The verified uploaded page (digest, schema, URL and size); writes nothing. */
export async function loadPageSnapshot(task: CrawlTask, config: Configuration) {
  if (!task.snapshot) throw new Error('Missing page snapshot');
  const bytes = await decompress(
    await readFile(join(config.snapshotDirectory, `${task.snapshot.id}.json.gz`)),
    { maxOutputLength: 8 * 1024 * 1024 },
  );
  if (hash('sha256', bytes) !== task.snapshot.sha256)
    throw new Error('Page snapshot integrity mismatch');
  const parsed = PageSnapshotSchema.parse(JSON.parse(bytes.toString()));
  // task.url is already WHATWG-normalized by the pipeline.
  const snapshot = { ...parsed, url: new URL(parsed.url).href };
  if (snapshot.url !== new URL(task.url).href || Buffer.byteLength(snapshot.html) > config.maxBytes)
    throw new Error('Invalid page snapshot');
  return snapshot;
}
export async function readPageSnapshot(task: CrawlTask, archive: Archive, config: Configuration) {
  const snapshot = await loadPageSnapshot(task, config);
  if (!task.snapshot) throw new Error('Missing page snapshot');
  await archive.artifact(
    'snapshot.json',
    JSON.stringify({
      source: 'user-webview',
      clientCapturedAt: snapshot.capturedAt,
      sha256: task.snapshot.sha256,
    }),
  );
  const body = Buffer.from(snapshot.html);
  const capture = await archive.capture(body, {
    kind: 'rendered-dom',
    url: snapshot.url,
    status: 200,
    capturedAt: snapshot.capturedAt,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-mory-source': 'user-webview' },
    truncated: false,
  });
  archive.raw.selectedCapture = archive.raw.captures.indexOf(capture);
  const strategy = htmlCaptureStrategy(snapshot.url, snapshot.html);
  const context = CrawlContextSchema.parse({
    version: 1,
    acquisition: { mode: 'http' },
    parsing: strategy === 'generic' ? { strategy, llm: defaultLlmParsing(config) } : { strategy },
  });
  await archive.artifact('context.json', JSON.stringify(context));
  return { page: { body, html: snapshot.html, capture }, context };
}
export async function removePageSnapshot(task: CrawlTask, config: Configuration) {
  if (task.snapshot)
    await rm(join(config.snapshotDirectory, `${task.snapshot.id}.json.gz`), { force: true });
}
