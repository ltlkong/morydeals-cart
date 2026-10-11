# Retailer reference fixtures

Copied unchanged from `ltlkong/morydeals-affiliate` main commit
`94b0888479ab064820d5f370774803c2b56932cd`, under
`apps/worker/tests/fixtures/`. Original fixture comments describe captures or
trimmed/synthetic content. These are regression fixtures, not evidence of a new
live crawl. Tests deliberately mutate copies to exercise identity and price rejection.

Parser reference: the same main commit's `amazon_ca`, `bestbuy_ca` and `newegg_ca`
web/product readers. We use selected-item validation, not their variant traversal,
promotion/coupon parsing, family grouping or persistence.

Shopify reference: PR #232 at `620ba0cd3731355a5ddb571b087e54399b00580c`:
https://github.com/ltlkong/morydeals-affiliate/pull/232

The Storefront query in this project reads one `node(ProductVariant)` and its
parent identity. It does not copy that PR's variants connection or pagination.
Shopify unit responses are synthetic. The live Shokz verification is documented
separately in `docs/crawler/retailer-verification.md`.
