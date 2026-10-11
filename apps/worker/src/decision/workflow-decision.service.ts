import { shopifyLanguage } from '@morydeals/capture-contracts';
import { detectShopify, resolveShopifyTarget } from '../parsing/parsers/index.ts';
import { AcquisitionRunner } from '../acquisition/acquisition.runner.ts';
import { AcquisitionError } from '../acquisition/acquisition.types.ts';
import type { Archive } from '../audit/raw-archive.ts';
import {
  CrawlContextSchema,
  type TaskContext,
  type AutoContext,
  type LlmStrategy,
} from '@morydeals/capture-contracts';
import { retailerForUrl } from '../parsing/parsers/index.ts';
import type { DecidedWorkflow, WorkflowDecision } from './workflow-decision.ts';

export class WorkflowDecisionService {
  constructor(
    private readonly acquisition: AcquisitionRunner,
    private readonly defaults: { llm: LlmStrategy; maxBudgetMs: number } = {
      llm: { strategy: 'llm', provider: 'ollama', timeoutMs: 120000 },
      maxBudgetMs: 120000,
    },
  ) {}

  async decide(url: string, input: TaskContext, archive: Archive): Promise<DecidedWorkflow> {
    if (!('decision' in input)) return { context: input };
    const started = performance.now();
    const budget = Math.min(input.budgetMs, this.defaults.maxBudgetMs);
    const base = {
      version: 1 as const,
      locale: input.locale,
      market: input.market,
      budgetMs: budget,
      cleaning: input.cleaning,
      audit: input.audit,
    };
    const browser = {
      mode: 'browser' as const,
      browser: input.decision.browser,
      timeoutMs: Math.min(30000, budget),
      network: input.network,
      waitFor: { minTextLength: 80 },
    };
    const http = {
      mode: 'http' as const,
      timeoutMs: Math.min(20000, budget),
      network: input.network,
    };
    const retailer = retailerForUrl(url);
    if (retailer) {
      const amazon = retailer === 'amazon-ca' || retailer === 'amazon';
      const httpFirst = amazon || retailer === 'walmart-ca';
      const retailerBrowser = amazon
        ? { ...browser, waitFor: { selector: '#productTitle' } }
        : retailer === 'ctc-ca'
          ? { ...browser, waitFor: { selector: 'div.nl-buy-box > .nl-price .nl-price--charge' } }
          : browser;
      // Home Depot Canada prices by store; HOMEDEPOT_CA_STORE picks it (default 7001, Scarborough ON).
      const homeDepot = {
        mode: 'api' as const,
        provider: 'homedepot-ca' as const,
        store: /^\d{4}$/.test(process.env.HOMEDEPOT_CA_STORE ?? '')
          ? process.env.HOMEDEPOT_CA_STORE!
          : '7001',
        timeoutMs: http.timeoutMs,
        network: input.network,
      };
      const context = CrawlContextSchema.parse({
        ...base,
        acquisition:
          retailer === 'homedepot-ca'
            ? homeDepot
            : retailer === 'target-com'
              ? {
                  mode: 'api' as const,
                  provider: 'target-com' as const,
                  timeoutMs: http.timeoutMs,
                  network: input.network,
                }
              : httpFirst
                ? {
                    ...http,
                    waitFor: {
                      selector: amazon ? '#productTitle' : 'script#__NEXT_DATA__',
                    },
                  }
                : retailerBrowser,
        fallback: httpFirst
          ? [
              {
                on: ['blocked', 'incomplete', 'http_error', 'unsupported_content'],
                acquisition: retailerBrowser,
              },
            ]
          : [],
        parsing: { strategy: retailer },
      });
      return this.result(retailer, [`url:${new URL(url).hostname}`], [], context);
    }

    // Unknown storefronts require source evidence. This capture is reused, not discarded.
    const probe = await this.acquisition.fetch(
      url,
      archive,
      {
        ...base,
        acquisition: {
          ...http,
          timeoutMs: Math.min(input.decision.probeTimeoutMs, budget),
          waitFor: { minTextLength: 80 },
        },
        fallback: [
          {
            on: [
              'blocked',
              'http_error',
              'incomplete',
              'timeout',
              'network_error',
              'unsupported_content',
            ],
            acquisition: { ...browser, waitFor: { product: true } },
          },
        ],
      },
      { artifactPrefix: 'probe-' },
    );
    const remaining = Math.floor(budget - (performance.now() - started));
    if (remaining < 100)
      throw new AcquisitionError('timeout', 'Workflow decision exhausted the acquisition budget');
    const detected = detectShopify(probe.html!);
    const issues = [...detected.issues];
    let platform: WorkflowDecision['platform'] = 'unknown';
    let context = CrawlContextSchema.parse({
      ...base,
      budgetMs: remaining,
      acquisition: probe.capture.kind === 'rendered-dom' ? browser : http,
      parsing: { strategy: 'generic', llm: input.decision.llm ?? this.defaults.llm },
    });
    if (
      detected.evidence.includes('Shopify.shop') ||
      issues.some((issue) => issue.includes('Shopify.shop'))
    ) {
      platform = 'shopify';
      // API market is explicit or source-backed. No universal CAD/USD default.
      const country = input.market ?? detected.country;
      const currency = input.currency ?? detected.currency;
      const language = this.language(input, detected.language);
      context = CrawlContextSchema.parse({ ...context, parsing: { strategy: 'shopify' } });
      if (
        detected.shopDomain &&
        !issues.some((issue) => issue.includes('Shopify.shop')) &&
        country &&
        currency &&
        language
      ) {
        const store = { shopDomain: detected.shopDomain, country, currency, language };
        try {
          resolveShopifyTarget(probe.html!, url, probe.capture.url, store);
          context = CrawlContextSchema.parse({
            ...context,
            acquisition: {
              mode: 'api',
              provider: 'shopify',
              store,
              timeoutMs: Math.min(20000, remaining),
              network: input.network,
            },
            fallback: [{ on: ['blocked', 'http_error', 'incomplete'], acquisition: browser }],
          });
        } catch (error) {
          issues.push(error instanceof Error ? error.message : 'Shopify selection unconfirmed');
        }
      } else
        issues.push('Shopify API market, currency or language is unconfirmed; use page evidence');
    }
    if (platform === 'unknown') {
      const productBrowser = { ...browser, waitFor: { product: true } };
      const rendered = probe.capture.kind === 'rendered-dom';
      context = CrawlContextSchema.parse({
        ...context,
        acquisition: rendered ? productBrowser : { ...http, waitFor: { product: true } },
        fallback: rendered ? [] : [{ on: ['incomplete'], acquisition: productBrowser }],
      });
    }
    return {
      ...this.result(
        platform,
        detected.evidence.length ? detected.evidence : ['No confirmed platform declaration'],
        issues,
        context,
      ),
      page: probe,
    };
  }
  private language(input: AutoContext, detected?: string) {
    return shopifyLanguage(input.locale ?? detected ?? 'EN');
  }
  private result(
    platform: WorkflowDecision['platform'],
    evidence: string[],
    issues: string[],
    context: ReturnType<typeof CrawlContextSchema.parse>,
  ): DecidedWorkflow {
    return {
      context,
      decision: {
        version: 1,
        policyVersion: '1.0.0',
        mode: 'auto',
        platform,
        evidence,
        issues,
        workflow: context,
      },
    };
  }
}
