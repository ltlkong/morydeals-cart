import { mkdir, writeFile, rm, rmdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { hash } from 'node:crypto';
import { createAuditId, auditBundlePath } from './audit-id.ts';
import { packAuditBundle, readAuditBundle } from './audit-bundle.ts';

export interface Capture {
  kind?: 'http-response' | 'rendered-dom' | 'api-response';
  shopify?: import('../parsing/parsers/index.ts').ShopifyTarget;
  url: string;
  status: number;
  headers: Record<string, string | string[] | undefined>;
  capturedAt: string;
  truncated: boolean;
  file: string;
  sha256: string;
  bytes: number;
}
export interface RawArchive {
  version: '2';
  taskId: string;
  attemptId: string;
  requestedUrl: string;
  captures: Capture[];
  selectedCapture?: number;
  error?: string;
}
export class Archive {
  readonly id: string;
  readonly bundlePath: string;
  private finalizing?: Promise<string>;
  private finalized = false;
  private sealed = false;
  private captureTail: Promise<void> = Promise.resolve();
  readonly directory: string;
  readonly raw: RawArchive;
  constructor(root: string, taskId: string, attemptId: string, requestedUrl: string) {
    if (![taskId, attemptId].every((v) => /^[a-zA-Z0-9_-]{1,100}$/.test(v)))
      throw new Error('Invalid archive identity');
    this.id = createAuditId(requestedUrl, taskId, attemptId);
    this.bundlePath = auditBundlePath(root, this.id);
    this.directory = join(root, '.pending', taskId, attemptId);
    this.raw = { version: '2', taskId, attemptId, requestedUrl, captures: [] };
  }
  async initialize() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
  }
  async write(name: string, data: string | Uint8Array) {
    if (this.finalized) throw new Error('Audit bundle is finalized');
    if (!/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+)*$/.test(name))
      throw new Error('Invalid artifact filename');
    await writeFile(join(this.directory, name), data, { flag: 'wx', mode: 0o600 });
  }
  async artifact(name: string, data: string | Uint8Array) {
    await this.write(name, data);
    await this.write(
      `${name}.json`,
      JSON.stringify(
        {
          file: name,
          sha256: hash('sha256', data),
          bytes: Buffer.byteLength(data),
          capturedAt: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
  }
  capture(body: Buffer, info: Omit<Capture, 'file' | 'sha256' | 'bytes'>): Promise<Capture> {
    if (this.finalizing) return Promise.reject(new Error('Audit bundle is finalizing'));
    const pending = this.captureTail.then(() => this.recordCapture(body, info));
    this.captureTail = pending.then(
      () => undefined,
      () => undefined,
    );
    return pending;
  }
  private async recordCapture(body: Buffer, info: Omit<Capture, 'file' | 'sha256' | 'bytes'>) {
    const file = `response-${this.raw.captures.length}.body`;
    const capture: Capture = {
      kind: 'http-response',
      ...info,
      file,
      sha256: hash('sha256', body),
      bytes: body.length,
    };
    await this.write(file, body);
    // Persist each response immediately, including redirects and rejected HTTP responses.
    await this.write(`${file}.json`, JSON.stringify(capture, null, 2));
    this.raw.captures.push(capture);
    return capture;
  }
  async seal(error?: string) {
    if (this.sealed) return;
    if (error) this.raw.error = error;
    await this.write('raw.json', JSON.stringify(this.raw, null, 2));
    this.sealed = true;
  }
  finalize(): Promise<string> {
    return (this.finalizing ??= (async () => {
      await this.captureTail;
      this.finalized = true;
      try {
        await packAuditBundle(this.directory, this.bundlePath, this.id);
      } catch (error) {
        // Packing publishes atomically, so nothing was written; reopen for the failure path.
        this.finalized = false;
        this.finalizing = undefined;
        throw error;
      }
      await rm(this.directory, { recursive: true });
      // Drop the per-task directory once its last attempt is packed.
      await rmdir(dirname(this.directory)).catch(() => undefined);
      return this.id;
    })());
  }
}

export async function readArchive(
  directory: string,
  expectedId?: string,
): Promise<{ raw: RawArchive; capture: Capture; body: Buffer }> {
  const files = await readAuditBundle(directory, expectedId);
  const raw: RawArchive = JSON.parse(files.get('raw.json')?.toString() ?? 'null');
  if (!raw) throw new Error('Missing raw archive manifest');
  if (
    raw.version !== '2' ||
    typeof raw.taskId !== 'string' ||
    !Array.isArray(raw.captures) ||
    !raw.captures.length
  )
    throw new Error('No replayable response in archive');
  // Verify every response, not only the final HTML.
  const bodies: Buffer[] = [];
  for (const capture of raw.captures) {
    if (!/^response-\d+\.body$/.test(capture.file)) throw new Error('Invalid archive file');
    const body = files.get(capture.file);
    if (!body || body.length !== capture.bytes || hash('sha256', body) !== capture.sha256)
      throw new Error(`Archive integrity mismatch: ${capture.file}`);
    bodies.push(body);
  }
  const selected = raw.selectedCapture ?? raw.captures.length - 1;
  const capture = raw.captures[selected];
  const body = bodies[selected];
  if (!capture || !body) throw new Error('Invalid selected capture');
  if (raw.error || capture.truncated || capture.status < 200 || capture.status >= 300)
    throw new Error('Archive did not contain a successful complete response');
  return { raw, capture, body };
}
