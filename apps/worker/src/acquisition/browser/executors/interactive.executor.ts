import { PlaywrightCrawler, type PlaywrightCrawlerOptions } from '@crawlee/playwright';
import { StagehandCrawler } from '@crawlee/stagehand';
import { Configuration, ProxyConfiguration } from '@crawlee/basic';
import { Stagehand } from '@browserbasehq/stagehand';
import type { Page, Response } from 'playwright';
import { AcquisitionError } from '../../acquisition.types.ts';
import type { AcquisitionStep } from '@morydeals/capture-contracts';
import type { BrowserLease, BrowserOpenOptions } from '../browser-provider.types.ts';

export interface BrowserExecutor {
  crawler: PlaywrightCrawler | StagehandCrawler;
  close(): Promise<void>;
}
type SharedOptions = Pick<
  PlaywrightCrawlerOptions,
  | 'log'
  | 'maxConcurrency'
  | 'maxRequestRetries'
  | 'maxSessionRotations'
  | 'maxRequestsPerCrawl'
  | 'useSessionPool'
  | 'navigationTimeoutSecs'
  | 'requestHandlerTimeoutSecs'
  | 'browserPoolOptions'
> & {
  preNavigationHooks: ((
    context: { page: Page },
    options: { waitUntil?: string; timeout?: number },
  ) => Promise<void>)[];
  requestHandler(context: { page: Page; response?: Response }): Promise<void>;
  failedRequestHandler(
    context: { request: { errorMessages: string[] } },
    error: Error,
  ): Promise<void>;
};
// Provider controls the connection; executor controls deterministic / AI operations.
export function createInteractiveExecutor(
  step: Exclude<AcquisitionStep, { mode: 'http' }>,
  lease: BrowserLease,
  options: BrowserOpenOptions,
  crawlerOptions: SharedOptions,
  config: Configuration,
  modelKey?: string,
): BrowserExecutor {
  if (step.mode === 'interactive' && lease.stagehand?.kind === 'local') {
    const proxyUrl = new URL(options.proxy.server);
    proxyUrl.username = options.proxy.username ?? '';
    proxyUrl.password = options.proxy.password ?? '';
    const crawler = new StagehandCrawler(
      {
        ...crawlerOptions,
        proxyConfiguration: new ProxyConfiguration({ proxyUrls: [proxyUrl.href] }),
        stagehandOptions: {
          env: 'LOCAL',
          model: step.model,
          apiKey: modelKey,
          verbose: 0,
          selfHeal: false,
        },
        launchContext: { launchOptions: lease.stagehand.launchOptions },
        browserPoolOptions: { useFingerprints: false },
        failedRequestHandler: async (context) =>
          crawlerOptions.failedRequestHandler(
            context,
            new Error(context.request.errorMessages.at(-1) ?? 'Stagehand navigation failed'),
          ),
      },
      config,
    );
    return { crawler, close: async () => {} };
  }
  let stagehand: Stagehand | undefined;
  if (step.mode === 'interactive') {
    if (lease.stagehand?.kind !== 'attach')
      throw new AcquisitionError('unsupported_capability', 'Provider cannot attach Stagehand');
    stagehand = new Stagehand({
      env: 'LOCAL',
      keepAlive: true,
      verbose: 0,
      disablePino: true,
      logger: () => {},
      selfHeal: false,
      model: modelKey ? { modelName: step.model, apiKey: modelKey } : step.model,
      localBrowserLaunchOptions: {
        cdpUrl: lease.stagehand.endpoint,
        cdpHeaders: lease.stagehand.headers,
        connectTimeoutMs: options.timeoutMs,
      },
    });
  }
  const attach = async (page: Page) => {
    if (!stagehand) return;
    try {
      await stagehand.init();
      options.signal.throwIfAborted();
      // Page creation uses Playwright, actions resolve the exact page by its CDP frame id.
      const cdp = await page.context().newCDPSession(page);
      let frameId: string;
      try {
        frameId = (await cdp.send('Page.getFrameTree')).frameTree.frame.id;
      } finally {
        await cdp.detach();
      }
      const deadline = Date.now() + options.timeoutMs;
      while (!stagehand.context.resolvePageByMainFrameId(frameId)) {
        options.signal.throwIfAborted();
        if (Date.now() >= deadline) throw new Error('Stagehand page registration timeout');
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      Object.assign(page, {
        act: (instruction: string, actOptions: { timeout?: number }) =>
          stagehand!.act(instruction, { ...actOptions, page }),
      });
    } catch {
      throw new AcquisitionError('interaction_failed', 'Stagehand remote attachment failed');
    }
  };
  const hooks = crawlerOptions.preNavigationHooks ?? [];
  const crawler = new PlaywrightCrawler(
    {
      ...crawlerOptions,
      launchContext: {
        launcher: lease.launcher,
        launchOptions: lease.launchOptions,
        useIncognitoPages: true,
      },
      preNavigationHooks: [...hooks, async ({ page }) => attach(page)],
    },
    config,
  );
  let closing: Promise<void> | undefined;
  return { crawler, close: () => (closing ??= stagehand?.close() ?? Promise.resolve()) };
}
