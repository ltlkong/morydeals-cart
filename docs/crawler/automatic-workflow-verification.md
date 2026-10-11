# Automatic workflow verification

Verified locally on 2026-10-09. Decision policy version: `1.0.0`.
Every live command below used only a product URL and task ID, with no context file,
merchant configuration, shop domain, currency override or parser selection.

## Workflow and ownership

```text
CLI / BullMQ input
  → decision (known URL rule, or bounded page probe)
  → executable context
  → acquisition (reuse probe, API, or browser)
  → shared parser (retailer / Shopify / generic structured → LLM)
  → audit ZIP + PostgreSQL
```

Backend owns domain admission. Worker has no hostname allowlist or
`CRAWL_ALLOWED_HOSTS` setting. Merchant host patterns select a parser; unmatched
hosts remain eligible for the generic workflow. Existing transport URL validation,
DNS/IP checks, response limits and cancellation remain separate from domain admission.

`request-context.json` records input intent. `decision.json` records the platform,
evidence, issues, policy version and selected workflow. `context.json` is the
executable context. Probe bodies and query responses remain raw audit captures.
Decisions do not create additional products or enumerate variants.

## Real URL-only captures

| Case | Identified platform | Acquisition | Observed price | Total ms | Decision ms | Acquisition ms |
| --- | --- | --- | --- | ---: | ---: | ---: |
| amazon | amazon-ca | http | CAD 19.99 | 5812.674 | 0.950 | 5539.066 |
| bestbuy | bestbuy-ca | browser | CAD 869.99 | 4302.129 | 0.749 | 4130.744 |
| newegg | newegg-ca | browser | CAD 293.11 | 4640.816 | 0.715 | 4390.698 |
| shopify | shopify | api | CAD 199.95 | 1170.417 | 757.444 | 265.697 |
| walmart | unknown | http | CAD 89.99 | 1384.201 | 1227.362 | 12.981 |

PostgreSQL was checked after the runs: every task has exactly one product observation
and one price observation. Timing totals also include conversion, parsing, ZIP creation
and database work. Decision time includes any probe; it is not duplicated in acquisition.

- Shokz: page declarations supplied `aftershokz-canada.myshopify.com`, CA, EN and CAD.
  Exactly two raw captures: one page probe and one single-variant API response.
  Current 19995, former 24995 CAD minor units, variant `44553280454755`, Pink.
- Walmart: no dedicated merchant rule, so platform stays `unknown` and generic parsing
  reads valid JSON-LD. Exactly one raw capture; the probe was reused and no LLM was called.
- Amazon: the first ordinary HTTP attempt returned non-HTML content. The automatic policy
  now includes `unsupported_content` as an HTTP-to-browser fallback condition. The final
  run parsed the requested ASIN through its dedicated reader.
- Best Buy and Newegg: known merchant rules start with Camoufox. The latter retained its
  explicit marketplace `Item` selection.
- Shokz's automatic audit was replayed without a context file. It restored the recorded
  decision and returned the same selected variant and price. Unit and integration tests
  additionally assert no new network requests during automatic replay.

### Audits

- auto-amazon: `product-page/2026-10-09/www.amazon.ca/5dc9295953a9945f/auto-amazon-20261009-b--0abb1859-5866-436a-98f4-7f3e54de2f65`
- auto-bestbuy: `product-page/2026-10-09/www.bestbuy.ca/44adf02f404d061b/auto-bestbuy-20261009-a--60ddec49-d690-4d53-a8d3-16859c5df40a`
- auto-newegg: `product-page/2026-10-09/www.newegg.ca/03194b7e6704ba6e/auto-newegg-20261009-a--cd88200d-3cd5-4eb7-9c4b-a69d25cc3c4b`
- auto-shopify: `product-page/2026-10-09/ca.shokz.com/6dd2e88ee17805f8/auto-shopify-20261009-a--c4039c6b-0499-45bb-902a-782bf06aaa45`
- auto-walmart: `product-page/2026-10-09/www.walmart.ca/d97f9ba947e6da6c/auto-walmart-20261009-a--40db65fe-db4f-4e05-88a9-af46707d34e3`

## Validation scope

`npm run check`, `npm run test:crawler:integration` and `npm run build:worker` were run.
Logs are under `.local/auto-*.log`. Coverage includes known-domain routing, unknown-domain
acceptance, Shopify declaration conflicts and missing market/variant evidence, probe
reuse, browser probe fallback, shared time budgets, explicit-context bypass, JSON-first
LLM invocation, decision archival, offline replay and real PostgreSQL persistence.
The optional live Ollama integration test is gated; no production deployment was performed.

## Limits

Routing any HTTP(S) product URL is not a promise that every storefront can be captured
or every product can be identified. Missing evidence returns review; acquisition failures
remain explicit. Shopify detection currently relies on Liquid `Shopify.*` declarations;
headless/Hydrogen sites may use the generic path. The worker does not infer a universal
currency or silently choose the first variant. Explicit caller workflows bypass automatic
policy and remain usable for additional source-specific strategies.
