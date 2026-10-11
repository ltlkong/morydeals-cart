import { BrowserPool, PlaywrightPlugin } from '@crawlee/browser-pool';
import PQueue from 'p-queue';
import { Logger } from '@nestjs/common';
import type { Page } from 'playwright';
import { EgressProxy } from '../network/egress-proxy.ts';
import type { UrlPolicy } from '../network/url-policy.ts';
import type { DriverRequest } from '../acquisition.types.ts';
import type { BrowserProvider, BrowserLease } from './browser-provider.types.ts';
import type { BrowserDeployment } from './browser.factory.ts';

interface Resource {
  pool: BrowserPool<{ browserPlugins: PlaywrightPlugin[] }>;
  lease: BrowserLease;
  egress: EgressProxy;
}
interface Slot {
  key: string;
  busy: boolean;
  resource: Promise<Resource>;
  idleTimer?: ReturnType<typeof setTimeout>;
  expiresAt?: number;
}

// One task per slot keeps its gateway route stable. Crawlee owns browser/page reuse;
// p-queue bounds concurrent leases. Every page gets a fresh incognito context.
export class BrowserResources {
  private readonly logger = new Logger(BrowserResources.name);
  private readonly queue: PQueue;
  private readonly slots = new Set<Slot>();
  private readonly closing = new Set<Promise<void>>();
  private stopped = false;

  constructor(
    private readonly policy: UrlPolicy,
    private readonly maxBytes: number,
    private readonly deployment: BrowserDeployment,
  ) {
    this.queue = new PQueue({ concurrency: deployment.poolSize ?? 2 });
  }

  async run<T>(
    request: DriverRequest,
    provider: BrowserProvider,
    proxyUrl: string | undefined,
    execute: (page: Page) => Promise<T>,
  ): Promise<T> {
    if (this.stopped) throw new Error('Browser resources are closed');
    request.signal.throwIfAborted();
    const waiting = new AbortController();
    let running: Promise<T> | undefined;
    const cancelWait = () => {
      if (!running) waiting.abort(request.signal.reason);
    };
    request.signal.addEventListener('abort', cancelWait, { once: true });
    try {
      return (await this.queue.add(
        () => {
          running = this.use(request, provider, proxyUrl, execute);
          return running;
        },
        { signal: waiting.signal },
      )) as T;
    } finally {
      request.signal.removeEventListener('abort', cancelWait);
      // Only waiting jobs are cancelled by p-queue; active jobs await their cleanup.
      await running?.catch(() => undefined);
    }
  }

  private async use<T>(
    request: DriverRequest,
    provider: BrowserProvider,
    proxyUrl: string | undefined,
    execute: (page: Page) => Promise<T>,
  ): Promise<T> {
    const { signal } = request;
    signal.throwIfAborted();
    const key = JSON.stringify([provider.id, request.context.locale]);
    let slot = [...this.slots].find(
      (candidate) =>
        !candidate.busy &&
        candidate.key === key &&
        (!candidate.expiresAt || candidate.expiresAt > Date.now() + request.step.timeoutMs + 1000),
    );
    if (!slot) {
      const idle = [...this.slots].find((candidate) => !candidate.busy);
      // Reserve the new slot synchronously before any await, including eviction.
      const eviction =
        this.slots.size >= this.queue.concurrency && idle ? this.remove(idle) : Promise.resolve();
      slot = { key, busy: true, resource: eviction.then(() => this.create(request, provider)) };
      this.slots.add(slot);
    }
    slot.busy = true;
    clearTimeout(slot.idleTimer);
    let page: Page | undefined;
    let resource: Resource | undefined;
    let healthy = false;
    const abort = () => {
      resource?.egress.disconnect();
      void page?.close().catch(() => undefined);
    };
    signal.addEventListener('abort', abort, { once: true });
    try {
      resource = await slot.resource;
      signal.throwIfAborted();
      resource.egress.setUpstream(proxyUrl, request.step.timeoutMs);
      page = await resource.pool.newPage({
        pageOptions: {
          ...(provider.capabilities.launchLocale
            ? {}
            : {
                locale: request.context.locale,
                // Playwright browsers open a desktop page (Camoufox sizes its own desktop window).
                viewport: { width: 1440, height: 900 },
                isMobile: false,
                hasTouch: false,
              }),
          serviceWorkers: 'block',
        },
      });
      signal.throwIfAborted();
      const controller = resource.pool.getBrowserControllerByPage(page);
      await request.archive.artifact(
        `${request.artifactPrefix ?? ''}step-${request.stepIndex}-browser.json`,
        JSON.stringify(
          {
            provider: provider.id,
            ...provider.capabilities,
            browserId: controller?.id,
            reused: (controller?.totalPages ?? 1) > 1,
          },
          null,
          2,
        ),
      );
      const result = await execute(page);
      signal.throwIfAborted();
      healthy = true;
      return result;
    } finally {
      signal.removeEventListener('abort', abort);
      await page?.close().catch(() => {
        healthy = false;
      });
      resource?.egress.disconnect();
      slot.busy = false;
      if (!healthy || signal.aborted) await this.remove(slot);
      else {
        slot.expiresAt = resource?.lease.expiresAt;
        slot.idleTimer = setTimeout(() => {
          void this.remove(slot!).catch(() =>
            this.logger.error('Idle browser resource release failed'),
          );
        }, this.deployment.idleMs ?? 30000);
        slot.idleTimer.unref();
      }
    }
  }

  private async create(request: DriverRequest, provider: BrowserProvider): Promise<Resource> {
    const remote = provider.capabilities.transport !== 'local';
    const egress = new EgressProxy(
      this.policy,
      120000,
      this.maxBytes,
      remote ? this.deployment.proxyBindHost : undefined,
      remote ? this.deployment.proxyAdvertisedHost : undefined,
    );
    let lease: BrowserLease | undefined;
    try {
      const proxy = await egress.start();
      lease = await provider.open({
        proxy,
        locale: request.context.locale,
        timeoutMs: request.step.timeoutMs,
        signal: request.signal,
      });
      const pool = new BrowserPool({
        browserPlugins: [
          new PlaywrightPlugin(lease.launcher, {
            launchOptions: { ...lease.launchOptions, proxy },
            useIncognitoPages: true,
          }),
        ],
        useFingerprints: false,
        maxOpenPagesPerBrowser: 1,
        retireBrowserAfterPageCount: 50,
        retireInactiveBrowserAfterSecs: 300,
        operationTimeoutSecs: Math.ceil(request.step.timeoutMs / 1000),
      });
      return { pool, lease, egress };
    } catch (error) {
      await lease?.close().catch(() => undefined);
      await egress.close();
      throw error;
    }
  }

  private remove(slot: Slot): Promise<void> {
    this.slots.delete(slot);
    clearTimeout(slot.idleTimer);
    const closing = (async () => {
      const resource = await slot.resource.catch(() => undefined);
      if (!resource) return;
      try {
        await resource.pool.destroy();
      } finally {
        try {
          await resource.lease.close();
        } finally {
          await resource.egress.close();
        }
      }
    })();
    this.closing.add(closing);
    void closing.finally(() => this.closing.delete(closing)).catch(() => undefined);
    return closing;
  }

  async close() {
    this.stopped = true;
    await this.queue.onIdle();
    const results = await Promise.allSettled([
      ...[...this.slots].map((slot) => this.remove(slot)),
      ...this.closing,
    ]);
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  }
}
