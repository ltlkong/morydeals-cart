# Storage

Adapted from `morydeals-affiliate` main `273bcdb8e5c4a601b7c4f59b3867b1da19a14a5e`, `apps/backend/src/core/storage`.

```text
storage.module.ts
providers/
  storage-provider.ts              Byte-storage contract
  create-storage-provider.ts       Local/R2 selection
  local/                           Filesystem + signed byte HTTP endpoints
  r2/                              AWS S3 SDK for Cloudflare R2
persistence/storage.repository.ts  Prisma object registry
services/
  storage.service.ts               Policy, ownership, lifecycle, batched URLs
  storage-health.ts                Cached dependency probe
```

Features import `StorageModule` and inject `StorageService`. They define an `UploadPolicy` (purpose, MIME types, size limit, visibility) and supply the authenticated owner/actor. Only an explicitly protected feature endpoint may mint an upload grant or perform object administration.

- `createUpload` → signed PUT → `complete` verifies type/length and optional content inspection → `claim` validates ready/owner/purpose.
- `put` stores generated/imported bytes with policy validation.
- `readOwned`, `urlsFor`, `urlFor`, `delete` retain the original interfaces. Private URL authorization is the caller's responsibility; never expose arbitrary `urlsFor(ids)` as a public endpoint.
- PostgreSQL `api.storage_objects` stores metadata, provider key and pending/ready/deleted status. Bytes stay in the provider.
- Official `@nestjs/schedule` runs expired-upload cleanup hourly. It replaces the old project's queue-backed scheduler for this single-instance MVP.
- Local byte routes are `/api/storage/local/:token`. They use signed grants and preserve original request bytes, including JSON. Boot with Nest `bodyParser:false` and use `configureHttp`.
- Health checks are exported for monitoring, not added to global readiness.

## Configuration

Default provider: `local`. Default directory: repository `.local/storage`.

`STORAGE_SIGNING_SECRET` must have at least 32 characters. Keep it stable so issued local URLs survive restarts. The current local environment has a generated secret; it is not committed. Without one, development uses an ephemeral key; production requires an explicit key.

`PUBLIC_API_URL` is the externally reachable API origin, with no `/api` suffix (default `http://127.0.0.1:3000`, adjusted for API_PORT). Set this for physical devices or reverse proxies.

For `STORAGE_PROVIDER=r2`, configure `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`. No old project secrets or bucket settings were copied. Configure bucket CORS for direct client uploads when that feature is introduced.

## Adaptation boundaries

The old Kysely repository is replaced with Prisma; the existing `@nestjs/config` provides configuration. The old auth decorators, raw-response decorator and Zod field-marker interceptor are omitted: this app has a different serialization stack and no upload feature/auth yet. Features can use the retained `urlsFor` batch method explicitly. Worker audit ZIP storage is unchanged.

Validation: local provider and lifecycle tests, R2 offline signing tests, and live PostgreSQL/API signed upload → complete → byte-for-byte download → delete → 404. R2 account access was not tested.
