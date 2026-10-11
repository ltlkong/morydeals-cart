# MoryDeals Worker

NestJS worker 应用。后端或 CLI 提交 URL，worker 自动决策 workflow，获取页面、调用共享解析器并入库。调用方也可以传入完整 context，直接执行显式 workflow。域名准入由后端负责，worker 不维护域名白名单，也不按未知域名拒绝任务。

五个阶段：入口 → 决策 → 页面获取 → 解析标准化 → 入库。采集实现位于 worker 内部 `src/acquisition`，商品解析器作为独立共享 package；API 与 worker 的任务协议位于 `packages/capture-contracts`。商品解析规则与业务数据模型后续仍按步骤细化。Coupon 由后端后续人工维护独立的优惠券库，worker 与共享商品解析器不负责提取、验证或维护 coupon。

## 先从哪里看

完整任务从 [capture-pipeline.service.ts](src/pipeline/capture-pipeline.service.ts) 的 `run()` 开始。它管理任务租约、幂等、解析和入库；同目录的 [capture-workflow.service.ts](src/pipeline/capture-workflow.service.ts) 顺序协调决策、采集、输入准备。`fetch` 复用这个前半流程，不加载数据库或队列。

```text
apps/worker/src/
├── entrypoints/             CLI / BullMQ：接收任务、返回结果
├── pipeline/                流程协调与任务生命周期
│   ├── capture-pipeline.service.ts  完整任务：租约 → workflow → 解析 → 审计发布 → 入库
│   ├── capture-workflow.service.ts  前半流程：决策 → 采集 → 准备解析输入
│   ├── capture-result.ts    输出协议
│   └── capture-timings.ts   各阶段计时
├── decision/                平台识别、探测、生成执行计划
├── acquisition/             执行计划，返回原始页面/API 响应
│   ├── acquisition.runner.ts  顺序执行采集步骤和 fallback
│   ├── http/               Crawlee HTTP driver、传输
│   ├── browser/            浏览器资源、provider、Stagehand 交互
│   ├── shopify/            Storefront query 与单变体 API 请求
│   └── network/            代理、会话、限速、传输校验
├── parsing/                 准备输入、执行解析策略、调用模型
│   ├── document/           HTML 清洗、Markdown、PageDocument
│   ├── parsers/            纯解析逻辑：输入数据 → 标准商品（唯一解析页面的地方）
│   │   ├── retailers/      Amazon / Best Buy / Newegg / Walmart
│   │   ├── shopify/        页面声明识别、选中变体、Liquid / API 响应解析
│   │   ├── llm/            Prompt、输出校验、标准化
│   │   └── shared/         公共解析工具
│   ├── product-parsing.service.ts  选择商家解析器或 LLM
│   └── providers/          Ollama / SiliconFlow
├── audit/                   全流程审计文件、ZIP、校验与离线重放
├── database/                Prisma、事务与入库
├── config/                  部署配置
├── main.ts                  队列进程入口
└── cli.ts                   CLI 进程入口
```

| 修改内容                       | 位置                                           |
| ------------------------------ | ---------------------------------------------- |
| 入口参数或 BullMQ 接入         | `entrypoints/`                                 |
| 任务 context 协议              | `../../packages/capture-contracts/src/task.ts` |
| 工作流顺序与失败处理           | `pipeline/`                                    |
| 商家识别和自动执行计划         | `decision/`                                    |
| HTTP、浏览器、Shopify API 请求 | `acquisition/`                                 |
| HTML 清洗与 Markdown 转换      | `parsing/document/`                            |
| 模型 SDK 调用                  | `parsing/providers/`                           |
| 商品解析与标准化               | `parsing/parsers/`                             |
| 审计包和离线重放               | `audit/`                                       |
| 表结构与写入事务               | `prisma/schema.prisma`、`database/`            |

依赖方向：入口调用 pipeline；pipeline 协调各步骤；决策需要探测时复用 acquisition。acquisition 不依赖 decision 或解析服务，只执行传入计划；它可以使用 `parsing/parsers/` 的纯函数（验证页检测、Shopify 链接），ESLint 强制这一边界。audit 为所有步骤提供证据存储。`parsing/parsers/` 不发网络请求、不入库，也不构建 Shopify API query。域名准入由后端负责，平台识别只决定 workflow。

Nest 装配在各模块中完成：`CaptureWorkflowModule` 给决策和主采集注入同一个 acquisition 模块实例，复用浏览器资源和网络会话；`CapturePipelineModule` 再加入数据库。ESLint 防止采集层反向依赖决策、解析、流程服务或入口。

文件后缀表示职责：`.module.ts` 用于 Nest 装配，`.service.ts` 是服务，`.repository.ts` 负责入库，`.schema.ts` 是运行时校验，`.types.ts` 是类型合约。`src/generated/prisma` 和 `dist` 是生成产物，不手动维护；构建先清理 `dist`，避免旧目录残留。

CLI 与队列复用同一个 CapturePipelineService；`fetch` 只加载 CaptureWorkflowModule。队列连接由 BullModule 管理，关闭时先等待正在执行的任务，再释放 Prisma 连接。进程日志使用 Nest JSON logger，CLI 的结果与错误使用 JSON。

数据库采用 [Prisma 7 的 PostgreSQL adapter](https://www.prisma.io/docs/guides/v7/frameworks/nestjs)，没有应用自行维护的 SQL 连接池或启动建表。schema 生成类型化 client，migration 在部署时显式执行。队列采用 [Nest BullMQ 集成](https://docs.nestjs.com/techniques/queues)。代码规范使用 ESLint、typescript-eslint 和 Prettier，纳入根目录 `npm run check`。

一次完成操作在同一个 serializable transaction 中写入任务结果、商品、商品观察和价格；冲突有限重试。价格使用 bigint 存储整数最小货币单位（CAD 89.99 → 8999），JSON 输出安全整数 number。`amountMinor` 是现价，`compareAtAmountMinor` 是可选划线价，二者独立记录原文证据，并保存 `currencyEvidence`。任务开始原子取得带期限的租约，采集期间续约；租约失效后允许新 attempt 接管，旧 attempt 无法提交结果。相同 taskId 和 context 的已完成任务返回原结果，重放保留原始观察时间，旧观察不会覆盖较新的商品信息。只有 `parsed` 结果写入商品、商品观察和价格；`needs_review` 只记录任务状态，证据保留在审计 ZIP 中。商品 URL 必须属于请求或最终页面的站点（忽略 `www.`），页面声明的其他站点商品会被移除并降级为 `needs_review`，防止任意页面改写其他商品的价格历史。

队列重新投递的停滞任务如果遇到仍有效的旧租约，会延迟到租约过期后再执行，不消耗重试次数。

## 任务与 context

任务协议定义在共享的 `packages/capture-contracts/src/task.ts`。后端或 CLI 提供 JSON payload，由 worker 校验执行；采集实现没有单独的 workspace package。

```ts
import { validateTask } from '@morydeals/capture-contracts';
const task = validateTask({
  taskId: 'capture-001',
  url: 'https://shop.example/product',
  context: {
    version: 1,
    locale: 'en-CA',
    acquisition: {
      mode: 'browser',
      browser: 'camoufox',
      timeoutMs: 30000,
      waitFor: { selector: '[data-product]' },
    },
    fallback: [],
  },
});
```

context 协议见 [task.ts](../../packages/capture-contracts/src/task.ts)，样例见 [docs/crawler/contexts](../../docs/crawler/contexts)。

- `version`: 必须为 1。
- `acquisition`: 必填的起始获取步骤，`http` / `browser` / `interactive`。`browser` 为部署 registry 中的 provider ID，可扩展。
- `fallback`: 最多三个有序步骤，包含 `on` 条件与下一个 `acquisition`。只检查紧接着的步骤，条件不匹配就结束，不跳过配置寻找其他策略。
- `waitFor`: 可选 CSS selector、文本和最少正文长度。浏览器等待元素可见，HTTP 检查 HTML。未配置就绪条件时，`ready` 表示成功获取 HTML，不保证商品数据可解析。
- `actions`: 浏览器支持 `click` / `fill` / `select` / `waitFor`；interactive 另支持 Stagehand `act`。最多十个步骤，每一步留审计记录。
- `network`: 每个 acquisition 步骤可引用 `proxyProfile`，并选择 `rotation: session | per-request`。未配置则直连；不会因为失败偷偷开启代理。配置和生命周期见 [采集架构](src/acquisition/README.md)。
- `parsing`: 不配置时执行 JSON-LD / metadata；`{ "strategy": "llm", "provider": "ollama", "model": "qwen3.5:4b" }` 显式启用 LLM。详见 [解析与 provider](src/parsing/README.md)。
- `locale`: HTTP Accept-Language 与浏览器语言配置。`market` 只记录调用方的市场标签；不会自动改变 IP、站点市场或商品规格。
- `cleaning.removeSelectors`: 调用方额外指定的噪声元素；通用过滤仍保留 JSON-LD、metadata、规格表与商品正文。
- `budgetMs`: 所有获取步骤共享的时间预算，默认 60 秒，受部署上限约束。
- `audit.screenshots`: 默认开启；使用固定 viewport，防止无限长截图。

无 `trigger`、商家配置、任意脚本、浏览器地址或 API key。浏览器地址与凭据属于部署配置。

## 执行器

| mode                                  | 实现                                               | 特点                                                       |
| ------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------- |
| http                                  | 有界 HttpTransport                                 | DNS 校验并固定到连接、逐次处理重定向、保留响应原始实体字节 |
| browser / camoufox                    | Crawlee BrowserPool + Firefox/Camoufox             | 本地启动或连接独立 Docker 服务，每个任务独立 context       |
| browser / chromium、firefox、webkit   | Crawlee BrowserPool + 对应本地引擎                 | 确定性页面操作                                             |
| browser / 远程 provider               | Crawlee BrowserPool + Playwright WS / Chromium CDP | Docker、在线服务或自建服务，任务 context 隔离              |
| interactive / chromium                | Crawlee StagehandCrawler + Stagehand 3             | 显式模型与指令，执行 `act`，同时支持确定性操作             |
| interactive / 支持附着的 CDP provider | PlaywrightCrawler + Stagehand 3 SDK                | 同一远程会话与页面上的确定性操作和 AI `act`                |

Stagehand 使用 Chromium/CDP，不能与 Firefox/Camoufox 组合。registry 在打开网络或服务会话前检查能力。当前 Stagehand 3 与 Crawlee 3.18 的 peer dependency 配套，浏览器客户端和远程服务的 Playwright 版本保持一致。

普通 browser 模式跨任务复用进程，每次创建独立 context；本地 Stagehand 插件使用默认 context，因此 interactive 模式保持独立生命周期。HTTP 与浏览器共用 Crawlee SessionPool / ProxyConfiguration 管理代理路由。详细调用链、部署代理与边界见 [采集架构](src/acquisition/README.md)。

provider、部署连接与交互执行器位于 worker 内部，扩展方式和在线服务配置见 [browser 架构](src/acquisition/browser/README.md)。内置 Browserless CDP 连接及 Browserbase 会话创建/释放适配器；第三方账号实测需另行配置凭据。

来源：[Crawlee Camoufox 示例](https://github.com/apify/crawlee/blob/master/docs/guides/avoid_blocking_camoufox.ts)、[StagehandCrawler](https://crawlee.dev/js/docs/guides/stagehand-crawler-guide)、[Camoufox JS](https://github.com/apify/camoufox-js)。

## 原始封存与重放

每次处理产生一个有业务含义的 `auditId`：

```text
product-page/2026-10-09/shop.example/<链接SHA256前16位>/daily-price--<attemptId>
```

它直接映射到 `CRAWL_ARCHIVE_DIR/<auditId>.zip`。日期为 UTC；站点、链接指纹、任务和采集次数分别标识这次审计。ID 在解析前生成，因此失败页面也能定位。数据库的 `CaptureAttempt.auditId` 只保存逻辑 ID，不保存 ZIP、HTML、Markdown、模型原始响应、绝对路径或整份解析审计 JSON。任务 context 只留哈希用于幂等校验；商品和价格仍是业务数据，正常入库。

采集期间在 `.pending/<taskId>/<attemptId>` 写临时文件；取得原始页面后封存 raw manifest，完成转换/解析后用 yazl 打包，经 yauzl 校验后原子发布 ZIP，删除本次临时目录。失败任务也打包已有证据。文件系统与 PostgreSQL 不能做同一事务，所以先发布 ZIP，再提交业务数据；ZIP 中的解析结果不能单独证明数据库提交成功。

ZIP 内部结构：

```text
context.json                      # 校验后的完整执行配置
response-N.body + .json            # 响应或渲染 DOM，明确标记 kind
step-N-*.html / .png + .json        # 加载、交互前后、最终页面快照
step-N-action-M.json + .json        # 指令与操作结果
step-N-browser.json + .json         # provider、browserId、是否复用（无凭据）
step-N-network.json + .json         # 代理 profile、索引、sessionId、轮换方式（无凭据）
acquisition.json + .json           # 每次尝试、fallback 原因、选中的 capture
raw.json                          # 所有 captures、SHA-256、最终选择
llm-request.json / llm-response.json # 使用 LLM 时的提示词、schema 和原始响应
parsed.json / result.json          # 标准化结果与可重用的任务结果
bundle-manifest.json               # ZIP 全部文件的哈希清单
cleaned.html / page.md             # 原始封存完成后生成
conversion.json / document.json    # 转换规则版本、清理报告、解析器输入
```

重放通过 auditId 读取 ZIP，校验包内所有文件，不向磁盘解压。条目名称、数量及解压后字节数均有上限。`.json` 元信息记录文件字节数与 SHA-256；JSON 文件本身的元信息后缀为 `.json.json`。文件以 `wx`、0600 写入，不覆盖旧文件；这是应用层防覆盖与校验，不是 WORM 存储或数字签名。

HTTP 响应保存收到的实体字节；Playwright response.body 是解码后的响应体，会在 headers 中记录来源与原 content-encoding；`rendered-dom` 独立标注，不冒充原始 HTTP 字节。升级后前面的尝试仍留存，重放验证全部 capture 的哈希，再使用 manifest 指定的 capture。

浏览器出站经过带认证的采集代理，对 HTTP/HTTPS 目的地校验 DNS 并固定到 socket，包含子资源。页面获取有时间、跳转及内容大小上限。生产配置不能通过 task context 开放内网访问。仅测试构造器允许 loopback fixture。

HTML→Markdown 使用 [Turndown](https://github.com/mixmark-io/turndown) + GFM，Cheerio 做可控过滤，先保存 JSON-LD / metadata 再删除脚本。

## 命令

在项目根目录执行：

```sh
npm install
npm run crawler:browser:install     # 本地 Camoufox / Chromium / Firefox / WebKit；纯 HTTP 不需要
npm run crawler -- fetch 'https://example.com/product' --context docs/crawler/contexts/camoufox.json
npm run infra:up
npm run db:migrate                # 新数据库执行版本化 migration
npm run crawler -- capture 'https://example.com/product' --context docs/crawler/contexts/http.json
npm run worker
npm run crawler -- enqueue 'https://example.com/product' --context docs/crawler/contexts/camoufox.json
npm run crawler -- replay 'product-page/2026-10-09/shop.example/<url-hash>/<task>--<attempt>'
```

`fetch` 只获取和封存，不依赖 PostgreSQL/Redis。`capture` 加载 CapturePipelineModule 并写入 PostgreSQL；`enqueue` 只加载队列入口。CLI 不传 context 时使用自动决策；传入显式 acquisition 的 context 时跳过自动决策。完整队列 payload 与 CLI 校验一致。顶层队列重试由调用方指定 `--attempts`，默认一次；每个获取步骤的 Crawlee 重试与 session rotation 关闭，避免叠加重试。

同一 taskId 必须保持相同 URL 和完整 context；更改配置需使用新 taskId。成功任务重试复用数据库结果。

## 数据库迁移与构建

```sh
npm run db:generate                          # 安装时也会生成 Prisma client
npm run db:migrate                           # prisma migrate deploy
npm run db:dev -w @morydeals/worker -- --name descriptive_change
npm run build:worker
npm start -w @morydeals/worker                # 运行 dist/main.js
node apps/worker/dist/cli.js --help
```

审计 manifest 使用 v2 与统一 taskId，只读取经过校验的 ZIP；不读取旧目录或回退到旧字段。

## 自动浏览与页面分类

`intent: "browse"` 的快照任务（手机 WebView 自动上传）先由 `src/classification/` 判断页面类型，结果是各类型的概率分布（product / listing / home / cart_or_checkout / account / article / other），按 `P(product)` 决定，而不是只取一个答案。规则先判定确定的情况：已知商家的商品页 URL，或恰好一个带 offers 的 schema.org Product，记为 P(product)=1、`source: rules`。其余页面清洗为 Markdown（复用 `convertHtml`，截断到 `PAGE_CLASSIFIER_MARKDOWN_LIMIT`）交给 `PAGE_CLASSIFIER` 指定的 provider：当前为 TypeSafe Jev（REST `POST https://api.typesafe.ai/v1/systemone` 的 choice 问题，官方无 JS SDK），接口 `PageClassifierProvider` 可替换为 embedding 等实现。`P(product) >= PAGE_PRODUCT_THRESHOLD`（默认 0.7）时走完整抓取并在结果中附上 `classification`；否则只返回 `{ status: "not_product", classification }`，删除暂存快照，不写审计 ZIP 或数据库，不保留用户浏览过的普通页面。

## Keepa 历史价格回填

`src/history/` 为已抓取的 amazon.ca 商品回填 Keepa Buy Box 历史。worker 不负责调度：API 启动时在 `morydeals-history` 队列登记 BullMQ job scheduler（`keepa-backfill`，每分钟一次，多个 API 实例也只有一份），worker 只执行队列里的任务。回填顺序：从未同步的优先，其次超过 24 小时未更新的。每轮先免费查询剩余 token，花费不超过 `KEEPA_TOKENS_PER_MINUTE`（默认 20）且不超过剩余量；每个商品 3 个 token（history + buybox），即每分钟最多 6 个。Buy Box 点写入 `external_price_points`（`source=keepa`，`series=buy_box`，最小货币单位，`-1` 无 Buy Box 存为空值），与有原文证据的 `price_observations` 分开；`external_history_syncs` 记录同步时间与错误（Keepa 未收录的商品也会记录，避免每分钟重试）。未配置 `KEEPA_API_KEY` 时每次任务直接跳过，功能关闭。Key 只出现在请求 URL 中，错误与日志不包含它。

## WebView 页面快照

移动端从应用内浏览器上传渲染后的 HTML，API 以 gzip JSON 暂存到 `CAPTURE_SNAPSHOT_DIRECTORY`（API 与 worker 必须共享），队列只携带快照 UUID 与 SHA-256。请求体只有 `{ url, html, capturedAt }`，移动端不解析页面。worker 校验摘要、URL 和大小，`snapshot.json` 记录来源与摘要；解析阶段是唯一解析快照的地方，结果入库（`source: user-webview`）。成功入库或任务最终失败（不再重试）后删除暂存文件。快照任务不写 `decision.json`，离线重放需显式传入 `--context`。

生成 client 位于 `src/generated/prisma`，构建产物位于 `dist`，均不提交。运行需要 Node 24+；共享解析器保持原有 TypeScript workspace 入口，Node 原生类型剥离可加载它。新增 schema 字段先修改 schema，再生成 migration 和 client；不在运行代码中补 DDL。

## Docker Camoufox

```sh
docker compose --profile browser up -d --build --wait camoufox
```

独立服务使用 Apify 的 [Camoufox Docker 基础镜像](https://crawlee.dev/js/docs/guides/docker-images)，只暴露绑定到本机的 Playwright WebSocket 端口。后续可以替换成任何兼容的 Camoufox Playwright 服务。

Mac 上 worker 运行在宿主机、浏览器运行在 Docker 时，在根目录 `.env` 配置：

```dotenv
CAMOUFOX_WS_ENDPOINT=ws://127.0.0.1:59222/camoufox
CRAWL_PROXY_BIND_HOST=0.0.0.0
CRAWL_PROXY_ADVERTISED_HOST=host.docker.internal
```

worker 同样运行在 Docker 时，WS 地址使用 `ws://camoufox:9222/camoufox`，代理广播地址改成可从 Camoufox 容器访问的 worker 服务名。连接协议是 Playwright WebSocket，不是 Chromium CDP。远程每个任务新建隔离 context；浏览器端必须允许代理处理 localhost，附带服务已设置该 Firefox preference。

interactive 模式的模型凭据来自 `STAGEHAND_API_KEY` 或模型 SDK 的标准环境变量。不会封存凭据。Camoufox 切换到 Stagehand 是重新获取同一 URL，并沿用 locale/market；当前不自动传递跨浏览器 cookie/localStorage。

## 验证

```sh
npm run check
npm run test:crawler:integration       # 需要 PostgreSQL / Redis
npm run test:crawler:browser           # 需要本地浏览器，Docker case 默认跳过
TEST_CAMOUFOX_DOCKER_WS=ws://127.0.0.1:59222/camoufox npm run test:crawler:browser
```

Stagehand 浏览器测试验证真实 Chromium 启动与确定性步骤；真实模型 `act` 调用需配置模型凭据，不能把这个测试当成模型行为验证。

### 价格协议迁移

`20261009030000_price_minor_units` 在单个事务中将原 Decimal 价格和业务 JSON 转为最小货币单位，拒绝不能精确转换或超过安全整数范围的历史数据；划线价缺失时保持 null，不从历史推测。审计 ZIP 保持不可变。缓存结果通过当前金额结构校验，不按 parser 版本做特殊分支。历史价格提取结果保留原状；不符合当前结构的结果需要用 auditId 和新 taskId 重放。

### 执行耗时

`capture` / `replay` / `fetch` 返回 `timings`，单位均为毫秒。用 `performance.now()` 测量实际等待时间，失败阶段同样计时；未执行的阶段省略。

- `totalMs`：worker 开始处理到完成的总耗时，包含阶段之间的文件操作等开销；不包含队列排队、Nest 启动或 CLI 进程退出。
- `stages`：`databaseStart`（任务登记）、`acquisition`（采集及原始文件写入）、`conversion`（HTML 清洗、Markdown 转换及文档保存）、`parsing`（解析及解析审计）、`archive`（ZIP 打包、校验、发布）、`databaseWrite`（业务事务提交）。每项包含 `durationMs` 和 `status`。
- 回放使用 `replayRead`，不会把本地归档读取标记为网络采集。失败写回任务状态使用 `databaseFailure`。
- `acquisition.attempts[].durationMs`：每次 HTTP / browser / interactive 尝试的耗时，包含对应等待与失败处理，可用于比较 fallback。
- `llm.requestMs`：整个 provider 请求的客户端等待时间。Ollama 还返回 `loadMs`、`promptEvalMs`、`generationMs`、`totalMs` 及输入/输出 token 数。纳秒已转换成毫秒。这些属于 `parsing` 的内部明细，不要重复累加。

完整耗时出现在 CLI / BullMQ 成功返回和 worker 的 `capture_completed` 日志。执行中失败则出现在错误输出与 `capture_failed` 日志中。ZIP 的 `timings.json` 和 `result.json.timings` 是 `scope: before_archive` 快照：不可变文件不能记录自身封存和之后数据库写入的耗时。最终返回使用 `scope: completed` / `failed`。幂等重试从旧 ZIP 读取结果时使用 `scope: cached`，只报告此次查询与审计读取的耗时；不会伪装成重新执行采集。

### 商品身份与价格区域修复

`20261009040000_stable_product_identity` 把商品身份改为完整商品 URL 的 SHA-256（唯一的 `identity_key`），不使用可变 SKU。完整 URL 保留 `variant` 等业务参数，不猜测哪些参数可删除。新商品 ID 使用该摘要；已有 ID 保持不变。迁移按相同 URL 合并重复商品，选择最新商品快照，重新关联全部历史观察；观察 JSON、价格行和审计 ZIP 不删除。同一 run 的历史观察也全部保留，因此幂等完成依赖已有事务租约，不依赖观察表的旧复合唯一索引。长 URL 不直接放进 PostgreSQL 唯一 B-tree 键。

`cleaning.scope` 默认 `auto`：正文不超过 24,000 字符时完整保留，超限时寻找唯一主标题所在的语义商品区域（购物表单、价格标记等），优先保留完整商品容器。无明确区域则保留全文，由 LLM 输入限制显式报告；不按字符切掉报价。`scope: full` 可关闭自动区域选择。`conversion.json` 记录选择的区域和原长度，`cleaned.html` 仍保存完整清洗正文，原始 HTML 仍在 ZIP 中。

HTML 转换在删除 script 前保留相关的惰性商品 JSON，绝不执行脚本；划线统一输出 `~~...~~`。无需商家专用 CSS 配置即可处理本次 Shokz 页面。新默认清洗配置会改变 context 哈希，已有任务重放应使用新 taskId。

## 单商品商家策略

自动模式由决策步骤选择 `amazon-ca`、`bestbuy-ca`、`newegg-ca`、`shopify` 或 `generic`；显式 context 原样执行。示例见 `docs/crawler/contexts/`。前三者直接把原始 HTML 交给共享解析器；`structured` / `llm` 仍使用清洗与 Markdown 流程。原始页面保留在审计 ZIP 中。

Shopify 的 `acquisition.mode: "api"`、`provider: "shopify"` 要求 `parsing.strategy: "shopify"`。`store` 必须提供 `shopDomain`、`country`、`language`、`currency`；显式模式由后端或 CLI 提供；自动模式从页面声明和调用方市场偏好生成。先读取用户公开商品页验证店铺归属和选中变体，再向已校验的 Shopify 域名 POST 一条只读 Storefront 查询。禁止 API 重定向，不枚举 variants，不发起商品目录查询。当前域名绑定支持页面声明 `Shopify.shop` 的 Liquid 店铺；无法证实归属的 Hydrogen 页面返回 incomplete。

HTTP 和 Shopify API 共用 Crawlee 单任务执行、DNS/IP 校验、限速、代理会话、体积限制和取消机制。HTML 页面和 API 原始响应分别记录，GraphQL 查询单独存档；API capture 带目标与市场信息，封存后可离线重放，不必重取价格。

`shopify-storefront.json` 是 Shokz Canada 的可运行示例，其他店铺需替换 store 配置。普通 HTTP 被拒绝时，调用方可以选择 Camoufox 或配置明确的 fallback；worker 不会隐式升级采集方式。

验证结果见 [retailer-verification.md](../../docs/crawler/retailer-verification.md)。

## 自动决策入口

```sh
npm run crawler -- capture 'https://ca.shokz.com/products/opendots-2?variant=44553280454755'
npm run crawler -- enqueue 'https://example.com/product'
```

不传 context 等价于 `docs/crawler/contexts/auto.json`。需要覆盖自动模式的浏览器、市场或 LLM 时：

```json
{
  "version": 1,
  "decision": {
    "mode": "auto",
    "browser": "camoufox",
    "llm": { "strategy": "llm", "provider": "siliconflow" }
  },
  "market": "CA",
  "currency": "CAD",
  "locale": "en-CA"
}
```

- `parsing/parsers/retailers/routing.ts`：精确商家 URL → 专用解析器与采集方式，是路由规则，不是域名白名单。
- `decision/workflow-decision.service.ts`：已知 Amazon.ca 起步 HTTP、条件 fallback 到浏览器；Best Buy / Newegg Canada 起步浏览器。未知域名先探测，HTTP 不可用或正文不足时探测浏览器。
- `parsing/parsers/shopify/detection.ts`：只返回页面声明的店铺、市场、语言、币种与证据，不发请求、不决定 workflow。
- Shopify 证据充分、市场和变体明确时生成单变体 API workflow；证据不足时使用 Shopify 页面解析，不猜第一个变体或通用默认币种。
- 未识别平台走 `generic`：结构化解析成功即结束，否则才调用已选 LLM。默认优先使用已配置密钥的 SiliconFlow，否则 Ollama；不在模型之间偷偷重试。

探测页面复用给主采集器或 Shopify API driver；它和 API 响应都保存在同一个审计 ZIP。探测浏览器的文件使用 `probe-` 前缀，避免与后续步骤冲突。决策和主采集共享 `budgetMs`，并分别计时。

审计文件：`request-context.json` 保存调用方意图，`decision.json` 保存规则版本、平台、证据、问题和 workflow，`context.json` 保存执行 context；`probe-context.json` / `probe-acquisition.json` 保存探测过程。`structured-result.json` 记录 generic 路径的第一轮结果。自动回放读取原有决策和 capture，不重新探测站点；旧审计没有 decision 时需显式指定 context。

自动模式允许任何未注册域名进入通用流程，但不承诺任意页面都能提取有效商品。无法获取页面或不能证明商品/价格时，仍明确返回失败或 needs_review。商家解析器中的身份核对用于防止串商品，不是 worker 的域名准入规则。

失败由执行入口统一收尾：完整任务在 CapturePipelineService，fetch-only 在 CLI。步骤服务只抛出错误；finalizeFailure 保留原始异常并单独报告审计写入失败。HTTP 直接使用 HttpTransport；Crawlee 继续负责 BrowserPool、SessionPool 和交互执行。任务身份统一 taskId，Prisma 用 @map 保留现有物理 run_id 列，避免无意义的数据搬迁。

## 流量控制

浏览器与 interactive 步骤默认 `blockResources: ["image", "media", "font"]`，保留文档、脚本、样式和数据请求。需要完整视觉内容时显式设置 `blockResources: []`。截图可能不含被拦截图片；资源报告 `step-N-resources.json` 记录阻止的请求数，不把请求数当作字节节省量。

队列使用 BullMQ Simple deduplication：URL、完整 context、attempts 相同的排队/执行中任务共用一个 job。所有 URL 参数保留；不同 variant、市场、代理或策略不合并。完成/失败后释放去重键，新 taskId 可以重新采集。enqueue 返回实际共享 job；CLI 返回 `requestedTaskId` 与实际 `taskId`，调用方跟踪实际 jobId。直接 CLI capture 不做跨进程去重，不引入额外调度服务。

Shopify 首次自动采集成功后，结果中的 `shopifyTarget` 返回已确认的店铺、市场、语言、币种、URL 与 variantId。后端保存目标，下次传入显式 API context（见下例），跳过商品 HTML，仅请求单变体 JSON。URL variant 与 context 冲突会在发请求前拒绝；API 返回的商品、店铺、币种仍由解析器验证。worker 不自行维护商家目标缓存。

```json
{
  "version": 1,
  "acquisition": {
    "mode": "api",
    "provider": "shopify",
    "store": {
      "shopDomain": "roborock-official-website-canada.myshopify.com",
      "country": "CA",
      "language": "EN",
      "currency": "CAD"
    },
    "variantId": "51276142248103"
  },
  "parsing": { "strategy": "shopify" }
}
```

Amazon 的 202 响应、验证码表单及验证 iframe 在解析前标记为 blocked；浏览器还要求商品标题就绪。拦截后停止当前步骤、释放资源，队列不会对不可重试 blocked 进行整任务重试。仅执行 context 明确配置的 fallback。检测规则参考旧 affiliate worker main 的 amazon_ca/web/detection.py 和 policy.py；没有引入旧项目的全套冷却调度或自动代理采购。

浏览器依赖固定为 Playwright 1.62.0，与 camoufox-js 0.12.1 声明的 playwright-core <1.63.0 对齐。升级时同时验证 HTTP 资源拦截、本地和远程 Camoufox，不修改私有协议实现。
