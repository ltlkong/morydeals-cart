# 页面获取验证记录

验证时间：2026-10-09。范围：context 入口、Crawlee 页面获取、Camoufox 本地与 Docker 服务、原始封存和 Markdown 转换。下面前两部分记录当时的采集验证；本轮 worker 与数据库标准化结果见最后一节。

| 检查 | 结果 | 范围 |
|---|---|---|
| `npm run check` | 通过 | workspace 类型检查、28 个单元测试 |
| `npm run test:crawler:integration` | 9 / 9 | 真实 HTTP fixture、PostgreSQL、Redis/BullMQ、重放、幂等和失败归档 |
| `TEST_CAMOUFOX_DOCKER_WS=ws://127.0.0.1:59222/camoufox npm run test:crawler:browser` | 6 / 6，无跳过 | 本地 Camoufox、显式 fallback、远程连接、并发 context 隔离、Stagehand Chromium、Docker 代理 |
| 最后修改后 `npm run typecheck -w @morydeals/worker` 与 crawler 单元测试 | 通过，9 / 9 | 浏览器归档并发与响应失败处理修改后再次检查 |

## 公网 CLI 实测

目标页面：`https://books.toscrape.com/catalogue/a-light-in-the-attic_1000/index.html`。

- HTTP：`context-http-smoke-v1`，结果 `ready`，选择 `response-0.body`。
- Docker Camoufox：`context-docker-smoke-v1`，结果 `ready`，选择 `response-2.body`（渲染 DOM）；独立容器通过宿主机认证代理访问公网 HTTPS。

归档目录（项目根目录相对路径）：

```text
.local/crawl-archive/context-http-smoke-v1/55fa41f8-2d43-44b3-9066-df522ea9b196
.local/crawl-archive/context-docker-smoke-v1/7d39a439-90c1-4230-a77c-21aa1c8c7ec8
```

两次实测都保存了 context、响应、raw manifest、获取结果、清理后的 HTML、Markdown 和 document。浏览器实测还保存了页面快照与截图。

## 验证边界

- Stagehand 测试启动真实 Chromium 并执行确定性步骤，没有调用模型。AI `act` 已接入，仍需真实模型凭据验证。
- fixture 的结构化解析与入库通过，不代表任意商家商品或变体都已支持。公网实测证明获取与转换成功，不代表商品解析成功。
- 没有进行生产部署，也没有实现每日调度、商家策略或跨浏览器会话迁移。

使用方式与 context 协议见 [worker README](../../apps/worker/README.md)。

## Browser provider 扩展验证

2026-10-09 将浏览器创建、部署连接与交互执行器拆分，增加 registry 和本地/远程/在线服务适配器。

- workspace 类型检查与 36 个单元测试通过；其中 crawler 17 个，覆盖注册、能力校验、部署环境引用、会话释放、Browserbase API 合约、AI 操作路由与错误脱敏。
- PostgreSQL / Redis 集成测试 9 / 9 通过。
- 浏览器测试 14 个：13 通过，普通本地 Firefox 1 个因 macOS profile 启动问题跳过。复现了 `Could not find profile folder`，与 [Playwright #42768](https://github.com/microsoft/playwright/issues/42768) 描述相符；测试只在 macOS 出现该具体错误时跳过。
- 实际浏览器覆盖 Camoufox 本地/Docker、Chromium、WebKit、通用 Playwright WS、Chromium CDP、并发 cookie 隔离、远程 Stagehand 附着、连接失败及超时后的 release/fallback。
- Browserbase 创建/释放通过模拟 API 合约测试；Browserless 复用已验证的 CDP transport。没有使用第三方账号进行真实云服务调用，也没有调用真实模型。

CLI 使用 `docs/crawler/browsers.docker.json` 注册新 ID `docker_camoufox`，无需增加 worker 分支，公网 HTTPS 实测返回 `ready`：

```text
.local/crawl-archive/registry-docker-smoke-v1/ec1d986d-e1d9-46c6-bd97-8ad5ab2ad917
```

该归档中的 `step-0-browser.json` 只含 provider ID、引擎、transport 和 Stagehand 能力；context、响应、DOM、截图、Markdown 与 document 均已写入。

结构与配置见 [browser README](../../apps/worker/src/acquisition/browser/README.md)。

## NestJS worker 与 Prisma 标准化

2026-10-09：采集留在 `apps/worker/src/acquisition`；独立共享 package 仅保留商品解析器（UI package 仍保持原有职责）。worker 使用 Nest module/DI、@nestjs/config + Zod、@nestjs/bullmq、Commander 和 Prisma 7；应用运行代码没有手写 SQL 连接、启动建表或自建 BullMQ consumer 生命周期。

- `npm run check`：ESLint、Prettier、所有 workspace 类型检查通过，38 个单元测试全部通过。
- `npm run build:worker`：生成 Prisma client、编译 Nest worker 成功；编译后的 CLI 可以读取历史及执行显式 migration。
- PostgreSQL/Redis 集成测试 10/10：HTTP→封存→Markdown→共享解析器→ORM 入库；每日观察追加、相同任务复用、重放时间保留、篡改拒绝、失败归档、Nest 队列消费和永久失败不重试、跨 worker 域名限速、任务租约过期恢复、旧 owner 拒绝提交、事务整体回滚。
- 浏览器回归 14 个：13 通过，普通本地 Firefox 因上述 macOS profile 问题跳过 1 个。Camoufox 本地/Docker、Chromium、WebKit、WS/CDP 与 Stagehand 确定性操作均通过。
- 原有数据库先通过 Prisma diff 确认与初始版本一致，再 baseline 和 apply 增量 migration。迁移前后均为 2 条任务、3 次尝试；商品/观察/价格均为 0。没有重建或清空表。迁移后实际库与 Prisma schema 对比无差异。
- 公网 HTTP CLI `nest-http-smoke-v1`：故意设置不可用的 DB/Redis 地址，采集仍返回 `ready`，证明 `fetch` 不连接这两项服务。归档 `.local/crawl-archive/nest-http-smoke-v1/351d1e43-daca-4443-9111-29869adc0c95`。
- Nest CLI 使用部署 registry 的 `docker_camoufox` provider，公网采集返回 `ready`，封存渲染 DOM 和转换结果：`.local/crawl-archive/nest-docker-smoke-v1/79f6ac61-7163-4e37-b06c-28169fcdfef7`。
- 编译后的独立 Nest worker 启动，编译后的 CLI 将公网 URL 入队，实际 PostgreSQL 留下 `needs_review` 结果和归档，随后 SIGTERM 退出。日志 `.local/worker-process-smoke.log`；任务 `nest-process-smoke-1791535991009`。该页面没有可用结构化商品数据，因此没有伪造商品或价格。

共享 parser 的商家规则与业务模型仍待逐步设计；coupon 属于后端后续人工维护的独立库，不属于 worker 或 parser；这些检查不证明第三方云浏览器账号、真实 LLM 操作或生产部署可用。

## 目录与依赖边界整理

2026-10-09：worker 手写代码集中到 `entrypoints`、`pipeline`、`acquisition`、`database`、`config` 五类；数据库代码归并，任务协议移入 pipeline，HTTP、网络约束、文档转换各自集中。浏览器 registry、factory、provider 与执行器采用明确文件名。共享商品解析器仍在 `packages/product-parser`。

采集模块只依赖任务协议和限速接口；队列入口及 Redis 适配由 `worker.module.ts` 装配。ESLint 限制采集、流程和数据库代码反向导入入口实现。删除原独立 crawler package 遗留的内部 barrel、未使用 helper 与冗余类型别名。构建使用 rimraf 清理旧 dist；测试分为 unit、integration、browser、fixtures。

整理后 workspace check（含 38 个单元测试）、worker 编译和编译后的 CLI help 均通过；真实 PostgreSQL/Redis 集成测试 10/10；浏览器测试 13 通过、1 个普通本地 Firefox 按上述已知 macOS 问题跳过。CLI 命令和队列任务 JSON 协议保持一致。

## BrowserPool 与代理会话

2026-10-09：普通 browser 模式改用长期 Crawlee BrowserPool + PlaywrightPlugin，页面操作与审计拆到 page-capture。p-queue 限制槽位，独立 context 隔离任务存储；空闲回收、provider 到期检查、失败释放、排队取消和 Nest 应用关闭均有明确路径。interactive 保持独立生命周期，因为当前本地 StagehandPlugin 使用默认 context。

HTTP 与浏览器共用 Crawlee SessionPool / ProxyConfiguration。部署文件引用代理 URL 环境变量，任务只引用 profile 和轮换方式。验证目的 IP 后再建立代理 CONNECT，保留站点 Host/SNI。代理审计仅含 profile、列表索引、sessionId 与轮换方式；429 和页面就绪失败不会消耗会话健康度。

- 根 workspace check 通过：42 个单元测试（worker 28、parser 7、UI 7）、ESLint、Prettier、全部类型检查。
- PostgreSQL/Redis 集成测试 10/10 通过。
- 浏览器测试 16 个：15 通过，1 个普通 Firefox 按既有 macOS profile 问题跳过；Camoufox 本地/Docker、Chromium、WebKit、远程 WS/CDP、Stagehand 确定性操作通过。
- 新实测覆盖同 browserId 跨任务复用、cookie 隔离、两个真实本地代理分别接收流量、代理认证、CONNECT 固定 IP、空闲释放、等待任务取消不影响活动任务、关闭后拒绝新请求。
- 编译通过；编译后 CLI 在 DB/Redis 地址故意不可用时完成公网 HTTPS Camoufox 获取，返回 ready 并正常退出。归档 `.local/crawl-archive/pool-cli-smoke-v1/cd40a750-18f0-4074-9674-cca9e60d2de4`。

本地代理测试证明真实路由选择，不证明商业代理的公网 IP/地区、第三方云账号或真实 LLM 可用。商家专用 HTML/API/LLM 解析策略仍待下一阶段。

## ZIP 审计与 Ollama LLM provider

2026-10-09：审计最终发布为单个 ZIP。逻辑 ID 格式 `product-page/UTC日期/站点/链接指纹/任务--采集次数`，数据库只保存 auditId；context/result/raw hash 从数据库移出，业务商品和价格照常入库。临时文件在发布完成后删除，包内 manifest 校验全部文件的大小、SHA-256 和对应 ID；读取不解压到文件系统。

LLM provider 合约、提示词、Zod 输出 schema 和原文证据标准化放在共享 product-parser；worker 的 parsing 目录负责 provider 注册、Ollama 官方 SDK 调用和审计。模型默认 qwen3.5:4b，显式 context 启用；提示词/响应/结果进入同一 ZIP。结构化解析保持默认。解析器版本 2.1.0。

- workspace check 通过：46 个单元测试（worker 30、parser 9、UI 7），包括包完整性、拒绝覆盖、条目路径、audit ID 对应、无凭证配置、LLM 格式/证据校验和并发取消隔离。
- `TEST_OLLAMA=1 npm run test:crawler:integration`：12/12。实际本机 Ollama qwen3.5:4b 对无 JSON-LD 的测试商品页提取 CAD 129.95，校验后写入临时 PostgreSQL schema；ZIP 含提示词、模型原始响应和结果。 malformed/provider failure 路径不产生价格观察；测试结束清理临时数据。
- 浏览器 15 通过，1 个普通 Firefox 因既有 macOS profile 问题跳过；本地/Docker Camoufox 和 Stagehand 确定性操作通过。
- 本地数据库迁移前备份 `.local/audit-migration-backup.json`，确认 3 个 run / 4 个 attempt 的原目录可读。Prisma migration 已应用，4 份历史归档已打包并替换引用，旧目录保留备份。
- 编译后的 CLI：DB/Redis 故意不可用仍完成公网 Camoufox fetch，输出 auditId；28 个包内文件（包含 manifest），ZIP 为 337723 字节，本次 pending 目录已删除。ID：`product-page/2026-10-09/books.toscrape.com/8496bf8dba16cd78/zip-browser-smoke-v1--cf8c1f85-1144-494d-94cb-0691fab9a3de`。
- 编译后 CLI 按上述 ID 重放成功，创建 `zip-replay-smoke-v1`；该网页默认结构化解析为 needs_review，没有伪造价格。

真实模型测试证明此测试商品页链路可用，不代表所有商家、隐藏变体或价格类型都能可靠解析。第三方 LLM provider 尚未实现；审计 ZIP 是校验封存，并非防篡改签名或 WORM 存储。

## 整数金额、划线价与 storefront 币种

2026-10-09：parser 3.0.0 / LLM prompt 2.0.0。报价现价为 `amountMinor`，可选划线价为 `compareAtAmountMinor`，保存独立原文与 `currencyEvidence`。币种精度来自 currency-codes 的 ISO 4217 数据；使用 BigInt 字符串转换后验证安全整数，不使用显示舍入精度。页面明确报价币种优先，其次使用登记的 storefront 规则（walmart.ca / www.walmart.ca → CAD）。原价不再是第二个 offer，分期/节省/starting-from 不作为现价。

- workspace check、worker 编译通过；共享解析器最终 15 项测试通过，worker 单元测试 30 项通过。
- `TEST_OLLAMA=1 npm run test:crawler:integration`：13/13，包括真实 Qwen 的现价与原价提取入库，以及迁移已有 CAD/USD/JPY/KWD/HUF/CLF 金额与业务 JSON、非法精度整笔回滚、价格范围约束。
- 本地 PostgreSQL 迁移已应用，迁移前完整备份 `.local/walmart-test/before-minor-units.dump`。原 CAD 89.99 记录读回为 8999。数据库使用 bigint，CLI/共享包输出安全整数 number；原审计 ZIP 保持不变。
- Walmart Prettycare W200 原始 HTTP 抓取于 `2026-10-09T10:14:06.154Z`。两次使用真实 Ollama `qwen3.5:4b` 回放该份 HTML 均得到 `parsed`：现价 8999、划线价 42999、CAD；原文分别为 `Current price is Now $89.99` / `was $429.99`。币种证据为 `storefront:www.walmart.ca`。
- 最后一次 replay 任务 `walmart-w200-minor-20261009-b` 的两个价格均从数据库读回确认，24 个 ZIP 条目读取校验通过。报告 `.local/walmart-test/minor-report.json`；审计 ID `product-page/2026-10-09/www.walmart.ca/d97f9ba947e6da6c/walmart-w200-minor-20261009-b--26c52e8d-2f29-429b-a829-742c7518a59f`。

本次是原始页面回放，不是重新请求最新售价。历史 parser 2.x 的已完成任务需用新 taskId replay，避免旧 decimal 金额协议与新整数协议混用。

## SSENSE Rier Blue Fleece Jacket 实测

2026-10-09：链接 `https://www.ssense.com/en-ca/men/product/rier/blue-fleece-jacket/19443621`。HTTP 返回商品 HTML，JSON-LD 明确含 CAD 1525 / InStock；初始正文无价格，因此纯 HTTP Markdown 的 LLM 输出 needs_review。显式 structured 回放成功，价格 152500 分入库。

Camoufox 渲染后正文出现 `$1525 CAD`。首次 Qwen 将提示词示例的价格前缀加到 evidence，校验正确拒绝。prompt 2.0.1 去掉该示例并强调逐字复制、允许纯价格行作为证据；用同一渲染归档重新调用真实 qwen3.5:4b 得到 parsed，提取 Rier / Blue Fleece Jacket / SKU 262661M202012 / 4 张实际图片 / CAD 152500 分，未出现划线价，也未误用月供 $70 或免运费门槛 $200。

- 本地数据库读回确认 structured 与最终 LLM 各一条价格观察；失败解析没有产生价格观察。4 份 ZIP 均校验通过。
- 共享解析器 16 项测试、typecheck、worker build 通过；同一新 prompt 对原 Walmart 页面真实回放仍正确得到 8999 / 42999 / CAD。
- JSON-LD 的图片 URL 含 `__IMAGE_PARAMS__` 占位符，当前 generic structured parser 尚未处理；最终 LLM 结果使用正文中的实际图片 URL。商品级 InStock 不等于所有尺码有货；未实现尺码变体标准化。
- 本地报告 `.local/ssense-test/report.json`；最终审计 ID `product-page/2026-10-09/www.ssense.com/c97b19f13abdad6b/ssense-rier-replay-20261009-a--f9411162-2a51-4270-b2f7-cd8b1616f1b0`。

## 分阶段耗时与恢复非思考模式

2026-10-09：根据用户选择恢复 `think:false`、`num_predict:2048` 和 prompt 2.0.1；保留 JSON Schema、`stream:false` 与证据校验。

新增 monotonic `CaptureTimings`，记录总耗时、数据库任务登记、采集、转换、解析、审计打包、数据库提交，失败保留已执行阶段及耗时。采集每个 fallback attempt 返回 durationMs；LLM 单独记录客户端 requestMs，以及 Ollama 的加载、输入处理、生成时长和 token 数。回放与缓存读取分别标识，不伪装成网络采集。

完整耗时在 CLI/BullMQ 返回及 worker 完成/失败日志中。不可变 ZIP 保存 `before_archive` 快照，明确不含自身打包和之后数据库提交。测试覆盖此边界、失败阶段、缓存与回放、纳秒转毫秒、LLM 明细不重复累加。

- workspace check 通过（worker 32、parser 16、UI 7 项单元测试）；真实 Ollama 与 PostgreSQL/Redis 集成测试 13/13；worker build 通过。
- 重新 HTTP 抓取 Walmart W200 并调用 Qwen，`walmart-timing-20261009-a` 返回 parsed：8999 / 42999 / CAD。确认响应没有 thinking，正常 stop。
- 总计 13009.683 ms；任务登记 43.106 ms；采集 1156.237 ms；转换 51.001 ms；解析 11694.607 ms；ZIP 33.740 ms；业务入库 28.247 ms。总耗时不含 CLI/Nest 启动、进程退出和队列排队。
- LLM 客户端等待 11690.520 ms；模型加载 5.773 ms，输入处理 1990.522 ms，生成 9666.493 ms；3164 输入 token / 709 输出 token。
- 完整实测报告 `.local/timing-test/report.json`；审计 ZIP 完整性及 before_archive 快照已核验。历史任务缺失的阶段数据不会倒推伪造。

## NestJS API 独立化验证（2026-10-09）

API 使用 `core/{config,queue,server}` 与 `feature/products`。任务协议和 BullMQ 去重参数迁到 `packages/capture-contracts`，替代以上历史记录中的 worker `pipeline/task.schema.ts`；API 不再导入 worker。采集实现仍归 worker。

- 全仓 check 通过；API 和 worker 编译通过。
- API HTTP 测试覆盖非法输入、内部证据过滤、任务状态映射、队列故障与健康检查。
- 编译后的 API 在本地 3001 独立运行，Redis readiness 与 OpenAPI 路由检查通过。
- 新请求 `c4426d5d-c6d2-401a-9859-d54cfc10f133` 经 POST 返回 202，worker 完成后 GET 返回 Walmart HOMCOM 商品：CAD 58497，划线价 86999，availability OutOfStock。金额单位为分。这是本地接口与现有 worker 的集成验证，不代表生产部署或所有商家均可采集。
