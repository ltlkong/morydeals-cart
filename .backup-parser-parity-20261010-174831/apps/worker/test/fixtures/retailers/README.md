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

`amazon-conditions-synthetic-B0CHX1W1XY.html` is synthetic (written for this project, not a capture): a reduced
desktop accordion buy box (new, used and Subscribe & Save rows) and an open "All offers" panel, to test that every
condition is collected and kept apart.

`amazon-deal-B0BGJT87N2.html` is morydeals-affiliate's `razer-hyperspeed.html` (reduced from a live response),
copied unchanged: a desktop page with a running "Limited-time deal" badge whose countdown labels are still the
page's unfilled templates (`NO_OF_HOURS`…). Tests fill them in to exercise countdown reading.

`amazon-mobile-used-B0DT494JX5.html` and `amazon-mobile-deal-B0FB5HZYG8.html` are the HTML of two real mobile
captures (worker archives, 2026-10-10), unchanged: each has a new and a used accordion row, the used row naming
its seller only in its abbreviated "Ships from / Sold by" header; the Shark page has a running deal badge whose
timer is stamped with `data-target-time`. `amazon-sns-B0BGJT87N2.html` is morydeals-affiliate's
`test_subscribe_and_save_reads_the_shown_tier_and_a_short_message.html` (a production-shaped Subscribe & Save buy
box), copied unchanged.
