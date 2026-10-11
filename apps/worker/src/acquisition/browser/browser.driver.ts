import { Configuration, log } from '@crawlee/basic';
import { EgressProxy } from '../network/egress-proxy.ts';
import { createBrowserRegistry, type BrowserDeployment } from './browser.factory.ts';
import { BrowserRegistry } from './browser.registry.ts';
import type { BrowserLease } from './browser-provider.types.ts';
import {
  createInteractiveExecutor,
  type BrowserExecutor,
} from './executors/interactive.executor.ts';
import { createPageCapture } from './page-capture.ts';
import { inputUrl, UrlPolicy } from '../network/url-policy.ts';
import {
  AcquisitionError,
  type AcquisitionDriver,
  type CapturedPage,
  type DriverRequest,
} from '../acquisition.types.ts';
import type { DomainLimiter } from '../network/domain-limiter.ts';
import { BrowserResources } from './browser-resources.ts';
import { NetworkSessions } from '../network/network-sessions.ts';

export type { BrowserDeployment } from './browser.factory.ts';

interface BrowserDriverOptions {
  deployment?: BrowserDeployment;
  registry?: BrowserRegistry;
  network?: NetworkSessions;
}

export class BrowserDriver implements AcquisitionDriver {
  private readonly resources: BrowserResources;
  private readonly deployment: BrowserDeployment;
  private readonly registry: BrowserRegistry;
  private readonly network: NetworkSessions;
  constructor(
    private readonly policy: UrlPolicy,
    private readonly limiter: DomainLimiter,
    private readonly maxBytes: number,
    options: BrowserDriverOptions = {},
  ) {
    this.deployment = options.deployment ?? {};
    this.registry = options.registry ?? createBrowserRegistry(this.deployment);
    this.network = options.network ?? new NetworkSessions();
    this.resources = new BrowserResources(policy, maxBytes, this.deployment);
  }

  async onApplicationShutdown() {
    await this.close();
  }
  async close() {
    await this.resources.close();
  }

  async fetch(request: DriverRequest): Promise<CapturedPage> {
    return this.network.run(request, (proxyUrl) => this.capture(request, proxyUrl));
  }

  private async capture(request: DriverRequest, proxyUrl?: string): Promise<CapturedPage> {
    const { step, archive, stepIndex, signal } = request;
    if (step.mode !== 'browser' && step.mode !== 'interactive')
      throw new AcquisitionError(
        'unsupported_content',
        'Browser driver requires browser or interactive mode',
      );
    // Validate registration and capabilities before opening a socket or session.
    const provider = this.registry.resolve(step.browser, step.mode === 'interactive');
    await this.policy.address(inputUrl(request.url));
    await this.limiter.wait(new URL(request.url).hostname);
    signal.throwIfAborted();
    const capture = createPageCapture(request, this.maxBytes);
    const prefix = `${request.artifactPrefix ?? ''}step-${stepIndex}`;
    let failure: Error | undefined;
    if (step.mode === 'browser') {
      try {
        return await this.resources.run(request, provider, proxyUrl, async (browserPage) => {
          const gotoOptions: { waitUntil: 'domcontentloaded'; timeout: number } = {
            waitUntil: 'domcontentloaded',
            timeout: step.timeoutMs,
          };
          await capture.prepare(browserPage, gotoOptions);
          try {
            const response = await browserPage.goto(request.url, gotoOptions);
            await capture.handle(browserPage, response ?? undefined);
            await capture.flush();
            return capture.result!;
          } catch (error) {
            await capture.snapshot('navigation-failure', true).catch(() => undefined);
            throw error;
          }
        });
      } catch (error) {
        signal.throwIfAborted();
        throw error;
      } finally {
        await capture.settle();
      }
    }
    // Stagehand's local Crawlee plugin shares its default context. Keep interactive
    // attempts dedicated until it supports isolated contexts with reusable browsers.
    const remote = provider.capabilities.transport !== 'local';
    const egress = new EgressProxy(
      this.policy,
      step.timeoutMs,
      this.maxBytes,
      remote ? this.deployment.proxyBindHost : undefined,
      remote ? this.deployment.proxyAdvertisedHost : undefined,
    );
    egress.setUpstream(proxyUrl);
    const proxy = await egress.start();
    const crawlerLog = log.child({ prefix: 'MoryDealsBrowser' });
    crawlerLog.setLevel(log.LEVELS.OFF);
    const config = new Configuration({ persistStorage: false, purgeOnStart: false });
    const baseOptions = {
      log: crawlerLog,
      maxConcurrency: 1,
      maxRequestRetries: 0,
      maxSessionRotations: 0,
      maxRequestsPerCrawl: 1,
      useSessionPool: false,
      navigationTimeoutSecs: Math.ceil(step.timeoutMs / 1000),
      requestHandlerTimeoutSecs: Math.ceil(step.timeoutMs / 1000) + 2,
    };
    let lease: BrowserLease | undefined;
    let executor: BrowserExecutor;
    try {
      const openOptions = {
        proxy,
        locale: request.context.locale,
        timeoutMs: step.timeoutMs,
        signal,
      };
      lease = await provider.open(openOptions);
      await archive.artifact(
        `${prefix}-browser.json`,
        JSON.stringify({ provider: provider.id, ...provider.capabilities }, null, 2),
      );
      executor = createInteractiveExecutor(
        step,
        lease,
        openOptions,
        {
          ...baseOptions,
          browserPoolOptions: {
            useFingerprints: false,
            prePageCreateHooks: [
              async (_id, _controller, pageOptions) => {
                if (!pageOptions) return;
                pageOptions.proxy = proxy;
                pageOptions.serviceWorkers = 'block';
                if (request.context.locale && !provider.capabilities.launchLocale)
                  pageOptions.locale = request.context.locale;
              },
            ],
          },
          preNavigationHooks: [
            async ({ page: browserPage }, gotoOptions) => capture.prepare(browserPage, gotoOptions),
          ],
          requestHandler: async ({ page: browserPage, response }) =>
            capture.handle(browserPage, response),
          failedRequestHandler: async (_context, error) => {
            failure ??= error;
          },
        },
        config,
        this.deployment.stagehandApiKey,
      );
    } catch (error) {
      await lease?.close().catch(() => undefined);
      await egress.close();
      signal.throwIfAborted();
      throw error;
    }
    const { crawler } = executor;
    const abort = () => {
      void capture.page?.close().catch(() => undefined);
      void egress.close();
      void executor.close().catch(() => undefined);
      void crawler.browserPool.destroy().catch(() => undefined);
    };
    signal.addEventListener('abort', abort, { once: true });
    let releaseError: unknown;
    try {
      signal.throwIfAborted();
      await crawler.run([{ url: request.url, uniqueKey: `${archive.raw.attemptId}-${prefix}` }]);
      signal.throwIfAborted();
      if (capture.failure) throw capture.failure;
      if (failure) throw failure;
      if (!capture.result)
        throw new AcquisitionError('network_error', 'Browser completed without a page', true);
    } catch (error) {
      if (capture.page) await capture.snapshot('navigation-failure', true).catch(() => undefined);
      signal.throwIfAborted();
      throw error;
    } finally {
      signal.removeEventListener('abort', abort);
      await capture.settle();
      await executor.close().catch(() => undefined);
      await crawler.browserPool.destroy().catch(() => undefined);
      try {
        await lease.close();
      } catch (error) {
        releaseError = error;
        await archive
          .artifact(
            `${prefix}-cleanup.json`,
            JSON.stringify({ provider: provider.id, sessionReleased: false }, null, 2),
          )
          .catch(() => undefined);
      } finally {
        await egress.close();
      }
    }
    signal.throwIfAborted();
    await capture.flush();
    if (releaseError) throw releaseError;
    return capture.result!;
  }
}
