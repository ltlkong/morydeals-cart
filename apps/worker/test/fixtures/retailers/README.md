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

`amazon-mobile-parity-B0GHY558KL.html`, `-B0FDX5HY4G`, `-B0G64MM1HM` and `-B0GXF7ZQPY` are the HTML of four real mobile
captures (worker archives, parser 3.16.0, 2026-10-11 UTC), unchanged. Each sells through a single featured offer (no
used / renewed / Subscribe & Save row); B0GXF7ZQPY counts three more new offers it does not list ("Compare New (3)
from $699.99"). They carry a clip coupon in the price block (B0GHY558KL), "Limited-time deal" badges and "Was:"
reference prices, ships-from and delivery lines, Amazon's Choice badges, "bought in past month", breadcrumbs, the
mobile rating link and the product overview table.

`amazon-mobile-prime-B0BWDNXK3Q.html` is the HTML of a real mobile capture (worker archive, parser 3.17.0,
2026-10-11 UTC), unchanged: a typed Prime member row (`PRIME_SAVINGS_UPSELL`, "Prime Member Price", -10% $197.10,
"List Price: $219.00", "Exclusive Prime price", no purchase form) above the regular "Non-Deal Price" row ($219.00).

`bestbuy-webview-{19968306,17158465,20099717,19269668}.html` are the HTML of real in-app (WebView) captures from the
Mac (2026-10-10/11 UTC), unchanged. 19968306 carries its page state (specs, category, sale end, special offer); the
other three were reached by in-app navigation, so their state is the previous page's and the rendered page is read
(JSON-LD, breadcrumb, the product's own price block and summary badges). 17158465 has no 1500x1500 photo rendition.

`amazon-desktop-prime-B0BWDNXK3Q.html`, `amazon-desktop-B0BGJT87N2.html` and `bestbuy-desktop-17158465.html` are real
backend (desktop) fetches from the Mac (2026-10-11 UTC; Amazon over HTTP, Best Buy through Camoufox). Styles, icon
drawings and page code that parsing never reads were removed for size (a comment records it); the parse results are
identical to the full pages.
