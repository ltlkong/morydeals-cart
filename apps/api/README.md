# MoryDeals API

标准 NestJS HTTP 服务。`core` 管基础设施，`feature` 管业务；API 通过 BullMQ 提交任务，独立 worker 采集、解析和入库。

```text
src/
  main.ts                          启动与 OpenAPI
  app.module.ts                    模块组合
  core/
    config/                        环境配置、启动校验
    queue/                         Redis/BullMQ 连接、健康指标
    database/                      Prisma PostgreSQL 连接
    server/                        日志、HTTP 安全头、校验、序列化、错误响应、健康接口
  feature/
    merchants/                     商家目录与提交准入
    products/
      products.module.ts
      api/                         HTTP controller
      services/                    商品采集请求与结果映射
      providers/                   商品队列读写
      schema/                      请求与响应协议
```

模块根目录只放 module；具体实现按职责放入子目录。core 不依赖 feature，API 不导入 worker。`packages/capture-contracts` 只共享任务协议、队列名称和去重参数，不包含采集实现。商家数据由 API 管理，采集数据由 worker 管理；不增加通用 CRUD base。

## 标准依赖

| 职责                 | 实现                                      |
| -------------------- | ----------------------------------------- |
| 配置                 | `@nestjs/config` + Zod                    |
| 队列                 | `@nestjs/bullmq` + BullMQ                 |
| 请求校验、响应序列化 | NestJS 12 原生 Standard Schema 支持 + Zod |
| 日志、请求 ID        | `nestjs-pino` / `pino-http`               |
| 健康检查             | `@nestjs/terminus`                        |
| HTTP 安全头          | `helmet`                                  |
| OpenAPI              | `@nestjs/swagger`，直接使用相同的 schema  |

错误过滤器只定义应用的安全错误响应，不向客户端暴露 provider 错误或凭证。日志不记录请求正文、商品 URL 或请求头。

## 本地运行

从仓库根目录执行：

```sh
npm run infra:up
npm run db:generate -w @morydeals/api
npm run db:migrate -w @morydeals/api
npm run worker
# 另一个终端
npm run api
```

开发监听：`npm run start:dev -w @morydeals/api`。编译和运行：`npm run build:api`，然后 `npm run start:prod -w @morydeals/api`。需要 Node.js 24+，共享 TypeScript workspace 由 Node 原生加载。

根 `.env`：

| 参数                    | 默认值                                        |
| ----------------------- | --------------------------------------------- |
| `API_HOST` / `API_PORT` | `127.0.0.1` / `3000`                          |
| `REDIS_URL`             | `redis://127.0.0.1:56379`；production 必填    |
| `BULLMQ_PREFIX`         | `bull`；需与 worker 一致                      |
| `API_BROWSER`           | `camoufox`                                    |
| `PAGE_UPLOADS`          | `false`：暂停 app 上传页面，只发链接          |
| `API_PROXY_PROFILE`     | 可选，引用 worker 已配置的代理 profile        |
| `API_CORS_ORIGINS`      | localhost 和 127.0.0.1 的 8091 端口，逗号分隔 |
| `LOG_LEVEL`             | `info`                                        |
| `NODE_ENV`              | `development`                                 |

## 接口

- `POST /api/anonymous-users`：为设备签发匿名用户 token（256 位随机数，数据库只存 SHA-256）。之后接入登录时把该匿名用户关联到账号。除商家目录、健康检查和本接口外，下列接口都要求 `Authorization: Bearer <token>`，否则返回 401。
- 定时任务全部在 `core/scheduling`（worker 只执行队列任务）：`JobSchedules` 启动时登记 Keepa 回填（`morydeals-history` 队列，每分钟一次，Redis 中只有一份调度），并每小时让 `core/storage` 清理过期未完成的上传。
- `GET /api/cart`：该设备的购物车，按加入时间倒序；商品信息只读取 worker 的 `public.tracked_products`（尚未入库的为 `null`）。每项 `history` 为最近 90 天价格（客户端图表显示最近 30 天）（由旧到新）：worker 回填的 Keepa Buy Box 点、窗口开始时生效的那个 Keepa 价格，以及我们自己抓取的价格；`amountMinor: null` 表示无 Buy Box。`PUT /api/cart/items` `{ url }` 加入（幂等），`DELETE /api/cart/items?url=` 移除。查询抓取结果为 ready 时，商品自动加入发起查询的用户的购物车。
- `POST /api/pages`：手机 WebView 自动上传浏览的页面（与 snapshots 相同的 `{ url, html, capturedAt }`），任务 `intent: "browse"`。`GET /api/pages/:id` 返回 `pending`、`not_product`、`product`（含商品）、`unconfirmed` 或 `failed`，并附 worker 分类得到的 `productProbability`。商品页记入该设备的浏览记录（`viewed_items`），不进购物车。
- `GET /api/history`：该设备最近浏览的商品（最多 100 个，含商品信息与价格历史）。
- `POST /api/products`：仅接收 `{ "url": "https://…" }`，返回 HTTP 202 `{ id, status: "pending" }`。API 设置运行 context，客户端不能覆盖 worker 选项。
- `GET /api/products/:id`：pending / failed / ready。ready 仅返回一个已确认商品及其报价；金额是整数最小货币单位，包含明确币种及可选划线价，不返回内部审计与证据。
- `GET /api/health/live`：进程存活。
- `GET /api/health/ready`：Redis 可访问；不代表 worker 在线或第三方商家可用。
- 非 production 提供 [Swagger UI](http://localhost:3000/api/docs) 和 `/api/docs-json`。

这是无账号的本地 MVP；任务结果来自 BullMQ 保留记录，不是永久商品查询接口。移动端协议保持不变。

`npm run check -w @morydeals/api` 执行 lint、格式、类型检查与 HTTP 测试。测试覆盖无效请求、队列异常、结果过滤和 readiness/liveness；真实 Redis 及商家请求需要另行集成验证。

## Merchants

`feature/merchants` owns the merchant catalogue and capture admission. `GET /api/merchants` returns enabled stores and `allowOthers`. Product submission checks current database policy before enqueueing. Disabled known merchants remain blocked even when Others is enabled; matching uses exact domains/subdomains, with the most specific domain taking priority. Worker routing remains independent.

`core/database` uses Prisma with `@prisma/adapter-pg`, following the worker's established database library. API tables/migration history are isolated in PostgreSQL schema `api`; the worker's existing `public` tables are unchanged. `DATABASE_URL` selects the database (required in production); API always selects schema `api`.

Run `npm run db:generate -w @morydeals/api` after install and `npm run db:migrate -w @morydeals/api` before starting the API. The migrations add Amazon CA, Walmart CA, Best Buy CA, Newegg CA, Roborock CA, Shokz CA and Apple CA. Run `npm run db:seed -w @morydeals/api` once to import the official storefront logo seeds into core/storage; the merchant row stores only `logoObjectId`, and `GET /api/merchants` resolves the public URL. Re-run with `--force` to replace existing seeded logos. Edit merchant rows with `npm run db:studio -w @morydeals/api`; no unauthenticated management endpoint is exposed. Set `API_ALLOW_OTHER_MERCHANTS=false` to block unlisted stores (default true).

页面上传默认暂停（`PAGE_UPLOADS=false`）：`POST /api/products/snapshots` 和 `POST /api/pages` 返回 409，app 只发送链接（`POST /api/products`、`POST /api/pages/links`），由 worker 自己抓取桌面版页面。`GET /api/merchants` 返回 `pageUploads`，app 按它切换。设 `PAGE_UPLOADS=true` 并重启 API 即恢复上传。

Merchant logo uploads use the same two-step storage lifecycle as other media. Set `MERCHANT_ADMIN_TOKEN` in the API environment, call `POST /api/merchants/:id/logo/upload` with `x-merchant-admin-token` and `{ contentType, sizeBytes }`, PUT the exact bytes to the returned upload target, then call `POST /api/merchants/:id/logo/complete` with `{ objectId }`. The API stores only the ready object's id and resolves `logoUrl` for readers.

## Storage

`core/storage` adapts the old MoryDeals storage implementation: local files or Cloudflare R2, signed upload/download, PostgreSQL object metadata, ownership/purpose checks and hourly expired-upload cleanup. Features import `StorageModule` and inject `StorageService`; details and configuration are in [storage README](src/core/storage/README.md). Worker audit ZIPs retain their existing storage.

### WebView capture

`POST /api/products/snapshots` accepts exactly `{ url, html, capturedAt }`; the
page is parsed only by the worker. Merchant admission still belongs to the API. The response and job polling are identical to URL capture.

The API stages a gzip file in `CAPTURE_SNAPSHOT_DIRECTORY`; API and worker must
mount the same directory. BullMQ contains only its ID and SHA-256. The worker
parses the submitted HTML, archives the source and parser result, and persists
through the existing product repository without another merchant request. HTML is limited to 2 MiB and capture time
must be within five minutes when submitted. Staging files are removed after
successful persistence or once the job fails with no retries left. Configure storage retention before deployment.
