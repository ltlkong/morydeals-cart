import { pageChallenge, productReadiness } from './product-readiness.ts';
import { load } from 'cheerio';
import { Archive } from '../audit/raw-archive.ts';
import {
  CrawlContextSchema,
  type CrawlContextInput,
  type AcquisitionReason,
} from '@morydeals/capture-contracts';
import { decodeHtml } from './http/http.transport.ts';
import { RejectedUrlError } from './network/url-policy.ts';
import {
  AcquisitionError,
  type AcquisitionDriver,
  type AcquisitionResult,
  type CapturedPage,
} from './acquisition.types.ts';

function classify(error: unknown, signal: AbortSignal): AcquisitionError {
  // SDKs such as BrowserPool wrap driver errors while retaining their typed cause.
  const seen = new Set<unknown>();
  let cause = error;
  while (cause instanceof Error && !seen.has(cause)) {
    seen.add(cause);
    if (cause instanceof AcquisitionError) return cause;
    if (cause instanceof RejectedUrlError) return new AcquisitionError('blocked', cause.message);
    if (cause.name === 'TimeoutError')
      return new AcquisitionError('timeout', 'Acquisition step timed out', true);
    if (
      'code' in cause &&
      ['ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'EPIPE'].includes(
        String(cause.code),
      )
    )
      return new AcquisitionError('network_error', 'Network request failed', true);
    cause = cause.cause;
  }
  if (signal.aborted) return new AcquisitionError('timeout', 'Acquisition step timed out', true);
  // Programming, storage and unclassified failures must not trigger network retries.
  throw error;
}

export class AcquisitionRunner {
  constructor(
    private readonly drivers: Partial<
      Record<'http' | 'browser' | 'interactive' | 'api', AcquisitionDriver>
    >,
    private readonly maxBytes: number,
    private readonly maxBudgetMs = 120000,
  ) {}

  async fetch(
    url: string,
    archive: Archive,
    inputContext: CrawlContextInput,
    options: { artifactPrefix?: string; page?: CapturedPage } = {},
  ): Promise<CapturedPage & { acquisition: AcquisitionResult }> {
    const context = CrawlContextSchema.parse(inputContext);
    const prefix = options.artifactPrefix ?? '';
    await archive.artifact(`${prefix}context.json`, JSON.stringify(context, null, 2));
    const deadline = Date.now() + Math.min(context.budgetMs, this.maxBudgetMs);
    const attempts: AcquisitionResult['attempts'] = [];
    let step = context.acquisition;
    let selected: CapturedPage | undefined;
    let lastError: AcquisitionError | undefined;
    for (let index = 0; index <= context.fallback.length; index++) {
      const startedAt = new Date().toISOString();
      const started = performance.now();
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        lastError = new AcquisitionError('timeout', 'Acquisition budget exhausted', true);
        break;
      }
      step = { ...step, timeoutMs: Math.min(step.timeoutMs, remaining) };
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(new Error('Acquisition step timeout')),
        step.timeoutMs,
      );
      let captureFile: string | undefined;
      try {
        // Cancellation is awaited before fallback, so attempts cannot overlap or write after sealing.
        const driver = this.drivers[step.mode];
        if (!driver)
          throw new AcquisitionError(
            'unsupported_capability',
            `No driver registered for ${step.mode}`,
          );
        const reused = index === 0 ? options.page : undefined;
        const page =
          reused && step.mode !== 'api'
            ? reused
            : await driver.fetch({
                url,
                archive,
                step,
                context,
                stepIndex: index,
                signal: controller.signal,
                prefetchedPage: reused,
                artifactPrefix: prefix,
              });
        controller.signal.throwIfAborted();
        const html =
          step.mode === 'api'
            ? undefined
            : (page.html ?? decodeHtml(page.body, page.capture, this.maxBytes));
        captureFile = page.capture.file;
        if (step.mode !== 'api') {
          const challenge = pageChallenge(page.capture.url, page.capture.status, html!);
          if (challenge) throw new AcquisitionError('blocked', challenge);
          if (step.waitFor?.product) {
            const assessment = productReadiness(html!);
            await archive.artifact(
              `${prefix}step-${index}-readiness.json`,
              JSON.stringify(assessment, null, 2),
            );
            if (!assessment.ready) throw new AcquisitionError('incomplete', assessment.reason);
          }
          const $ = load(html!);
          if (step.waitFor?.selector && !$(step.waitFor.selector).length)
            throw new AcquisitionError('incomplete', 'Readiness selector missing');
          if (step.waitFor?.text && !$('body').text().includes(step.waitFor.text))
            throw new AcquisitionError('incomplete', 'Readiness text missing');
          const visible = $('body').clone();
          visible
            .find('script, style, noscript, template, [hidden], [aria-hidden="true"]')
            .remove();
          if (
            step.waitFor?.minTextLength &&
            visible.text().trim().length < step.waitFor.minTextLength
          )
            throw new AcquisitionError(
              'incomplete',
              'Page text is shorter than configured minimum',
            );
        }
        selected = { ...page, html };
        attempts.push({
          index,
          mode: step.mode,
          browser: 'browser' in step ? step.browser : undefined,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Math.round((performance.now() - started) * 1000) / 1000,
          status: 'ready',
          reused: !!reused,
          captureFile,
        });
        break;
      } catch (error) {
        lastError = classify(error, controller.signal);
        attempts.push({
          index,
          mode: step.mode,
          browser: 'browser' in step ? step.browser : undefined,
          startedAt,
          completedAt: new Date().toISOString(),
          durationMs: Math.round((performance.now() - started) * 1000) / 1000,
          status: 'failed',
          reason: lastError.reason,
          message: lastError.message,
          captureFile,
        });
      } finally {
        clearTimeout(timer);
      }
      const fallback = context.fallback[index];
      if (!fallback || !fallback.on.includes(lastError!.reason as AcquisitionReason)) break;
      step = fallback.acquisition;
    }
    const acquisition: AcquisitionResult = {
      version: 1,
      status: selected ? 'ready' : lastError?.reason === 'incomplete' ? 'incomplete' : 'failed',
      reason: selected ? undefined : lastError?.reason,
      attempts,
    };
    if (!selected) {
      await archive.artifact(`${prefix}acquisition.json`, JSON.stringify(acquisition, null, 2));
      throw new AcquisitionError(
        lastError?.reason ?? 'network_error',
        lastError?.message ?? 'No page captured',
        lastError?.retryable,
        acquisition,
      );
    }
    archive.raw.selectedCapture = archive.raw.captures.indexOf(selected.capture);
    acquisition.selectedCapture = archive.raw.selectedCapture;
    await archive.artifact(`${prefix}acquisition.json`, JSON.stringify(acquisition, null, 2));
    return { ...selected, acquisition };
  }
}
