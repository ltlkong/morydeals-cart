# Capture contracts

Shared server-side protocol between API producers and the worker consumer: validated task/context schemas, queue names and job identity/retention options. No Nest modules, database, browser clients or environment loading.

Schema defaults are applied before deduplication so API and CLI submissions agree. URL query parameters, market, variant, proxy and parsing settings are part of job identity. The Shopify store schema and language codes (`src/shopify.ts`) are part of the task protocol. Product parsing and execution live in `apps/worker`.
