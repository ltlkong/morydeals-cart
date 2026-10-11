import { pageChallenge, productReadiness } from '../product-readiness.ts';
import { setTimeout as delay } from 'node:timers/promises';
import type { Page, Response } from 'playwright';
import { AcquisitionError, type DriverRequest, type CapturedPage } from '../acquisition.types.ts';
import { executeAction } from './executors/page-actions.ts';

// Task-scoped evidence and page operations. It never launches or owns a browser.
export function createPageCapture(request: DriverRequest, maxBytes: number) {
  const { step, archive, signal } = request;
  if (step.mode !== 'browser' && step.mode !== 'interactive')
    throw new Error('Page capture requires a browser step');
  const pending: Promise<void>[] = [];
  let resourceCounts: { image: number; media: number; font: number } | undefined;
  let page: Page | undefined;
  let result: CapturedPage | undefined;
  let failure: Error | undefined;
  let captureFailure: Error | undefined;
  let latestNavigation: Response | undefined;
  const unreadableNavigations = new Set<Response>();
  const prefix = `${request.artifactPrefix ?? ''}step-${request.stepIndex}`;
  const snapshot = async (name: string, includeScreenshot = false) => {
    if (!page || page.isClosed()) return;
    const html = await page.content();
    if (Buffer.byteLength(html) > maxBytes)
      throw new AcquisitionError('limit_exceeded', 'Rendered HTML exceeds byte limit');
    await archive.artifact(`${prefix}-${name}.html`, html);
    if (includeScreenshot && request.context.audit.screenshots) {
      // Fixed viewport prevents unbounded full-page screenshots.
      await archive.artifact(
        `${prefix}-${name}.png`,
        await page.screenshot({ timeout: Math.min(step.timeoutMs, 10000) }),
      );
    }
  };
  const captureResponse = async (response: Response) => {
    const responseRequest = response.request();
    if (!responseRequest.isNavigationRequest() || responseRequest.frame() !== page?.mainFrame())
      return;
    // Navigation order is determined when the event arrives, not when body reads finish.
    latestNavigation = response;
    const headers = await response.allHeaders();
    const originalEncoding = headers['content-encoding'];
    delete headers['content-encoding'];
    if (originalEncoding) headers['x-mory-original-content-encoding'] = originalEncoding;
    headers['x-mory-body-source'] = 'playwright-decoded-response';
    let unreadable = false;
    const body = await response.body().catch(() => {
      unreadable = true;
      return Buffer.alloc(0);
    });
    if (unreadable) {
      headers['x-mory-body-error'] = 'Response body unavailable';
      unreadableNavigations.add(response);
    }
    await archive.capture(body.subarray(0, maxBytes), {
      url: response.url(),
      status: response.status(),
      headers,
      capturedAt: new Date().toISOString(),
      truncated: unreadable || body.length > maxBytes,
    });
    if (response.status() >= 200 && response.status() < 300 && body.length > maxBytes) {
      throw new AcquisitionError('limit_exceeded', 'Navigation response exceeds byte limit');
    }
  };
  const beforeNavigation = async (
    browserPage: Page,
    gotoOptions: { waitUntil?: string; timeout?: number },
  ) => {
    page = browserPage;
    page.setDefaultTimeout(step.timeoutMs);
    const blocked = { image: 0, media: 0, font: 0 };
    await page.route('**/*', async (route) => {
      const type = route.request().resourceType();
      if (step.blockResources.includes(type as 'image' | 'media' | 'font')) {
        blocked[type as keyof typeof blocked]++;
        await route.abort('blockedbyclient');
      } else await route.continue();
    });
    resourceCounts = blocked;
    gotoOptions.waitUntil = 'domcontentloaded';
    gotoOptions.timeout = step.timeoutMs;
    page.on('response', (response) => {
      pending.push(
        captureResponse(response).catch((error) => {
          captureFailure ??= error instanceof Error ? error : new Error(String(error));
        }),
      );
    });
    // Resource filtering saves downloads; the egress proxy still validates destination sockets.
  };
  const handlePage = async (browserPage: Page, response?: Response) => {
    page = browserPage;
    await snapshot('loaded', true);
    const challenge = pageChallenge(page.url(), response?.status() ?? 200, await page.content());
    if (challenge) throw new AcquisitionError('blocked', challenge);
    if (response && (response.status() < 200 || response.status() >= 300)) {
      throw new AcquisitionError(
        [401, 403].includes(response.status()) ? 'blocked' : 'http_error',
        `HTTP ${response.status()}`,
        response.status() === 429 || response.status() >= 500,
      );
    }
    for (const [index, action] of step.actions.entries()) {
      signal.throwIfAborted();
      await snapshot(`action-${index}-before`);
      try {
        const actionResult = await executeAction(page, action, step.timeoutMs);
        await archive.artifact(
          `${prefix}-action-${index}.json`,
          JSON.stringify(actionResult, null, 2),
        );
        if (actionResult.result && !actionResult.result.success)
          throw new AcquisitionError('interaction_failed', 'Stagehand action did not succeed');
      } catch (error) {
        await archive
          .artifact(
            `${prefix}-action-${index}-failure.json`,
            JSON.stringify(
              {
                action,
                success: false,
                reason: error instanceof AcquisitionError ? error.reason : 'interaction_failed',
              },
              null,
              2,
            ),
          )
          .catch(() => undefined);
        await snapshot(`action-${index}-failed`, true).catch(() => undefined);
        if (error instanceof AcquisitionError) throw error;
        throw new AcquisitionError(
          'interaction_failed',
          error instanceof Error ? error.message : String(error),
        );
      }
      await snapshot(`action-${index}-after`, true);
    }
    if (step.waitFor?.product) {
      const deadline = Date.now() + Math.min(15000, step.timeoutMs);
      let assessment;
      do {
        signal.throwIfAborted();
        const html = await page.content();
        const challenge = pageChallenge(page.url(), 200, html);
        if (challenge) throw new AcquisitionError('blocked', challenge);
        assessment = productReadiness(html);
        if (assessment.ready) break;
        await delay(250, undefined, { signal });
      } while (Date.now() < deadline);
      await archive.artifact(
        `${prefix}-browser-readiness.json`,
        JSON.stringify(assessment, null, 2),
      );
      if (!assessment.ready) throw new AcquisitionError('incomplete', assessment.reason);
    }
    if (step.waitFor?.selector) {
      try {
        await page.locator(step.waitFor.selector).waitFor({ state: 'visible' });
      } catch {
        const challenge = pageChallenge(page.url(), 200, await page.content());
        if (challenge) throw new AcquisitionError('blocked', challenge);
        throw new AcquisitionError(
          'incomplete',
          `Readiness selector did not become visible: ${step.waitFor.selector}`,
        );
      }
    }
    if (step.waitFor?.text) {
      try {
        await page
          .getByText(step.waitFor.text, { exact: false })
          .first()
          .waitFor({ state: 'visible' });
      } catch {
        throw new AcquisitionError('incomplete', 'Expected page text did not appear');
      }
    }
    await archive.artifact(`${prefix}-resources.json`, JSON.stringify({ blocked: resourceCounts }));
    await snapshot('final', true);
    const html = await page.content();
    const finalChallenge = pageChallenge(page.url(), 200, html);
    if (finalChallenge) throw new AcquisitionError('blocked', finalChallenge);
    const body = Buffer.from(html);
    const capture = await archive.capture(body, {
      kind: 'rendered-dom',
      url: page.url(),
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      capturedAt: new Date().toISOString(),
      truncated: false,
    });
    result = { body, capture, html };
  };
  const handlePageSafely = async (browserPage: Page, response?: Response) => {
    try {
      await handlePage(browserPage, response);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      await snapshot('failure', true).catch(() => undefined);
      throw error;
    }
  };
  return {
    prepare: beforeNavigation,
    handle: handlePageSafely,
    snapshot,
    get page() {
      return page;
    },
    get result() {
      return result;
    },
    get failure() {
      return failure;
    },
    async settle() {
      await Promise.allSettled(pending);
    },
    async flush() {
      await Promise.allSettled(pending);
      if (captureFailure) throw captureFailure;
      if (latestNavigation && unreadableNavigations.has(latestNavigation)) {
        throw new AcquisitionError('incomplete', 'Final navigation response body unavailable');
      }
    },
  };
}
