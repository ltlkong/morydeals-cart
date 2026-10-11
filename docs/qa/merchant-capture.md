# Merchant browsing and capture — 2026-10-09

Implemented PostgreSQL-backed merchant catalogue (`api.merchants`), backend capture admission, native WebView browsing, Others URL input and the existing task-to-card flow. Prisma migration applied locally; worker tables remain in their original schema.

## Verified

- Root check: 118 tests pass (UI 7, parser 45, worker 61, API 5), lint, formatting and all workspace typechecks.
- API compiled and started on localhost:3000; GET /api/merchants returns six seeded enabled stores and allowOthers.
- Mobile web export passes; native and web TypeScript checks pass. Web preview explicitly uses external browser + paste, not an iframe pretending to know the current URL.
- iPhone 17 Pro / iOS 26.5, Expo Go: load store list, select Roborock, open product URL in WebView, press Capture, return to pending state, render real Roborock Qrevo 2 Pro White card at CAD 699.99 with former CAD 1,299.99.
- Others: bad-link rejected visibly; Shokz URL including variant=44553280454755 opens in WebView. Closing returns to the existing product card.
- HTTP tests: disabled merchants and their subdomains rejected, trailing-dot host checked, unknown and deceptive suffix hosts rejected when Others disabled, allowed subdomain accepted with variant URL preserved.

## Boundaries

No Android device run, production deployment or authenticated merchant session transfer tested. Only the navigation URL is sent to the worker; cookies and options that are not reflected in the URL are not captured. Merchant administration uses Prisma Studio in this MVP. Product cards remain session-local; worker observations persist in PostgreSQL. Readiness currently probes Redis only.
