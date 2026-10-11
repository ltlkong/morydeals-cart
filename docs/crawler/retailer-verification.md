# Selected-product retailer verification

Verified locally on 2026-10-09, with parser 3.2.0 and isolated test schemas for automated PostgreSQL/Redis tests.

## Live capture and database verification

All four successful live runs returned `parsed`. PostgreSQL was queried afterwards:
each run has exactly **one product observation and one price observation**. No sibling
variants were fetched or inserted. Prices below are the observations at test time.
A zero in the former-price column means the source did not supply a retained former price.

| Source | Selected identity | Current | Former | Total ms | Acquisition ms | Conversion ms | Parsing ms |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: |
| Amazon.ca | `B0FF3549YB` | CAD 19.99 | 0.00 | 3739.626 | 3611.128 | 3.811 | 21.950 |
| Best Buy Canada | `19190432` | CAD 869.99 | 0.00 | 4162.998 | 4046.500 | 1.867 | 14.046 |
| Newegg Canada Marketplace | `9SIC7XMM4F0269` | CAD 293.11 | 0.00 | 3395.706 | 3275.460 | 1.639 | 16.081 |
| Shopify / Shokz Canada | `44553280454755` | CAD 199.95 | 249.95 | 1574.277 | 1469.671 | 0.801 | 0.423 |

Total also includes database start/write and audit ZIP finalization. Acquisition includes
network and browser work, not just server response time.

- Amazon used HTTP. It captured the selected ASIN and the corresponding ordinary purchase quote.
- Best Buy and Newegg first returned HTTP 403. Explicit Camoufox contexts succeeded.
  The checked-in contexts now start with Camoufox; no hidden fallback was added.
- Shopify used an anonymous Storefront API 2026-10 query after verifying the public
  page's `Shopify.shop`. The response contains one selected ProductVariant; no variants
  connection, pagination or price range is requested. The Shokz variant is Pink, SKU
  `E320-ST-PK-CA-326`; its image is also Pink.
- The Shopify ZIP was replayed using `shopify-api-replay-20261009-a`. The parser returned
  the same item/price using archived JSON. The unit replay test additionally asserts
  that the network request count does not increase.

### Audits

- Amazon.ca: `product-page/2026-10-09/www.amazon.ca/5dc9295953a9945f/amazon-single-20261009-b--da7a2d03-6837-478f-8bf4-c993de5365b9`
- Best Buy Canada: `product-page/2026-10-09/www.bestbuy.ca/44adf02f404d061b/bestbuy-browser-single-20261009-a--fc3f037d-49c3-43a5-a223-a70eda524345`
- Newegg Canada Marketplace: `product-page/2026-10-09/www.newegg.ca/03194b7e6704ba6e/newegg-browser-single-20261009-a--8751fbd3-35b8-4528-b177-c2a4cce5e4d4`
- Shopify / Shokz Canada: `product-page/2026-10-09/ca.shokz.com/6dd2e88ee17805f8/shopify-single-api-20261009-a--d2de9ad3-14cd-4f7d-85dd-e0b4be698d43`

## Regression coverage

Final checks: `npm run check` passed (88 unit tests), worker build passed,
and PostgreSQL/Redis integration passed 16 tests with 1 optional Ollama test skipped.

- Shared parser: retailer reference fixtures plus adversarial identity, quote-region,
  currency, precision, condition, carrier financing, add-on and variant-ownership cases.
- Worker: API context validation, read-only JSON POST, redirect refusal, raw response
  archival and offline ZIP replay, plus browser/HTTP/proxy/cancellation regressions.
- PostgreSQL integration: one selected listing per merchant fixture, no observation for
  rejected identities, and concurrent independent captures. Existing migrations, leases,
  idempotency, Redis queue and LLM failure-isolation tests also run.
- Browser-platform bundle of the shared package succeeds without Node built-ins.
  This is not a React Native device test.
- `npm run check`, worker build and integration results are recorded in `.local/retailer-*.log`.
  The optional live Ollama integration test remains gated and skipped.

## Deliberate limits

Canadian Amazon/Best Buy/Newegg storefronts only. The deterministic quote readers target
ordinary new-item prices; used/refurbished, mandatory subscriptions and ambiguous/missing
quotes return review rather than contaminating the price history. An out-of-stock page
without a stated price also returns review.

Shopify store binding currently supports the public `Shopify.shop` declaration in Liquid
storefronts. Hydrogen-specific domain discovery from the reference PR is not included;
unconfirmed stores return incomplete. Without a variant URL, only an explicit unambiguous
page selection is accepted. Public storefront access can still fail for other stores.

No coupon collection, catalogue crawling, family grouping, variant traversal, production
deployment or paid-proxy verification is included.

## Reference provenance

Retailer source and fixtures: `morydeals-affiliate` main
`94b0888479ab064820d5f370774803c2b56932cd`.
Shopify reference: [PR #232](https://github.com/ltlkong/morydeals-affiliate/pull/232),
`620ba0cd3731355a5ddb571b087e54399b00580c`.
Storefront [node query documentation](https://shopify.dev/docs/api/storefront/2026-10/queries/node).
