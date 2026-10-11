# Content-driven acquisition validation — 2026-10-09

## Change

Automatic unknown-store workflows reuse the HTTP probe, evaluate product content readiness and perform one browser upgrade on incomplete HTML. Camoufox waits for asynchronous price content rather than treating DOMContentLoaded or HTTP 200 as a completed product page. Caller-defined workflows remain authoritative. Readiness evidence and each capture are archived. Failure codes cross BullMQ as safe progress metadata; API maps incomplete, blocked and timeout to distinct user-facing messages.

Zero JSON-LD/metadata prices are unconfirmed in parser 3.4.1. Price loading placeholders block acquisition readiness. API also rejects zero-price results, including previously retained queue results.

## Live verification

Canadian Tire Cat Craft Cat Playground URL was submitted through the mobile UI after restarting the local worker/API.

- Final task: `436e134b-7a2a-4eaa-8e56-f360920d1516`.
- HTTP template detected as incomplete → Camoufox rendered acquisition → schema.org parsing, without LLM.
- iPhone simulator visibly rendered CAD 79.99. Total 11,325.519 ms: decision 2,550.123 ms, acquisition 8,580.459 ms, conversion 50.293 ms, parsing 0.804 ms, archive 68.718 ms, database write 24.512 ms (database start 47.853 ms).
- Intermediate test task `0e937615-e66a-4586-8ecb-c531425d13b8` exposed a zero placeholder while the price skeleton was busy. Its zero price-history row was removed after a local backup, observation offers cleared, and run/attempt marked needs_review. Original audit remains immutable; the correction reason is recorded on the attempt. The final mobile card replaced the erroneous zero-price card.

## Checks and limits

Root check passed (UI 7, parser 45, worker 66, API 5); after adding the zero-price regression, parser 46 passed separately. API failure-message checks passed. Worker/API builds passed. Dedicated real Camoufox asynchronous product-readiness test passed after the final readiness change.

Broader browser suite: 16 passed, 1 skipped (Docker), 1 failed (standard Playwright Firefox launch failed with local sandbox/framebuffer error). Camoufox, Chromium/WebKit and remote-browser tests passed in that run. This does not establish universal retailer compatibility, production behavior, or support for truly free products.
