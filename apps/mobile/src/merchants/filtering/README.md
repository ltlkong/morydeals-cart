# WebView cosmetic filtering

Uses `@ghostery/adblocker` to compile and match Fanboy's Annoyance List, including cookie notices and mobile app promotions. The bundled snapshot is from https://secure.fanboy.co.nz/fanboy-annoyance.txt (2026-10-09). Original list header and attribution are preserved in `annoyance-rules.json`; rules are licensed CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Ghostery is MPL-2.0.

Cleaning is always on. Domain-scoped CSS is applied when the page loads. Generic hide rules (most cookie banners, e.g. OneTrust or `.cookie-consent`) are matched the way ad-blocker extensions do it: an injected script reports the page's element ids, classes and link targets, again after new elements appear, and the app injects the matching CSS from the list. Page-reported names are only lookup keys and are capped; the CSS always comes from the list. Extended selectors, scriptlets and network blocking stay disabled. Hiding a notice does not accept or reject consent. Some overlays may require site-specific interactions that this pilot does not perform.

WebViews stay mounted while hidden, preserving navigation, scroll, and page state until app restart. Each opened store has its own in-memory instance. OS process eviction can still discard pages. Capture keeps the store open; opening the same store again resumes its existing instance.
