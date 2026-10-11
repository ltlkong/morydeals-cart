# Acquisition：从 context 到封存页面

先读 `acquisition.runner.ts`：它接收已生成的 context，按步骤执行 driver 和 fallback，返回原始页面或 API 响应。计划由调用方提供，或由 `decision/` 自动生成；流程调度位于 `pipeline/`。

```text
AcquisitionRunner                 context → 原始页面 / API 响应
  HttpDriver                      HttpTransport
  ShopifyDriver                   单变体 Storefront query → API JSON
  BrowserDriver                   registry → 页面获取
    BrowserResources              BrowserPool + PlaywrightPlugin
    interactive.executor          Stagehand / PlaywrightCrawler
    page-capture                  响应 / DOM / 截图
  NetworkSessions                 SessionPool + ProxyConfiguration
```

审计写入使用独立 `audit/`；采集层不管理 ZIP 发布或重放。清洗与 Markdown 转换位于 `parsing/document/`，不再属于采集 runner。

## 一个文件负责什么

| 需要修改的行为                             | 文件                           |
| ------------------------------------------ | ------------------------------ |
| 起始模式、fallback、总预算                 | `acquisition.runner.ts`        |
| 浏览器 ID 与能力校验                       | `browser/browser.registry.ts`  |
| 浏览器进程复用、并发槽位、空闲回收         | `browser/browser-resources.ts` |
| 接入新浏览器服务                           | `browser/providers/`           |
| 页面快照、导航响应、就绪条件、操作证据     | `browser/page-capture.ts`      |
| AI 操作与 Stagehand 连接                   | `browser/executors/`           |
| 代理配置名称、SessionPool 健康度、路由轮换 | `network/network-sessions.ts`  |
| 浏览器出站验证与上游代理连接               | `network/egress-proxy.ts`      |
| HTTP 重定向、响应字节与代理传输            | `http/http.transport.ts`       |
| Nest 装配及依赖注入                        | `acquisition.module.ts`        |

不增加 crawler workspace package，不修改共享解析器的业务职责。

## 浏览器资源生命周期

普通 browser 模式使用真正的 Crawlee BrowserPool。资源槽包含一个 provider lease、一个 BrowserPool 和一个认证采集代理。`p-queue` 限制同时使用的槽位，默认 2 个；每个槽一次只服务一个任务。兼容键是 provider ID + locale；不同任务的上游代理路由可以更换，因为切换前会关闭页面和所有旧代理连接。

每次获取使用独立 incognito context，cookie、localStorage 和页面不会交给下个任务。进程可复用；上下文不复用。Crawlee 每 50 页退休浏览器。空闲默认 30 秒释放整个槽位，缓存容量受槽数限制。Browserbase 等有固定生命周期的 lease 声明 `expiresAt`，剩余时间不足以完成新任务时不会复用。

失败/超时的槽位直接释放。排队中的任务可取消；执行中的任务必须等待页面和资源清理完成，再允许 fallback 和封存。应用关闭通过 Nest 生命周期释放资源；BullMQ 入口先等待正在执行的任务完成。

interactive 模式暂不跨任务复用浏览器：Crawlee 当前的本地 StagehandPlugin 使用默认 context，无法保证跨任务存储隔离。继续使用独立执行器，保留已有本地 Chromium、远程 CDP 和 Stagehand 页面附着支持。`CRAWL_BROWSER_POOL_SIZE` 限制普通浏览器槽位；队列的总任务并发仍由 `CRAWL_CONCURRENCY` 控制。

## 代理与会话

任务只传名称和轮换方式，每一步可以不同：

```json
{
  "version": 1,
  "acquisition": {
    "mode": "browser",
    "browser": "camoufox",
    "network": { "proxyProfile": "ca", "rotation": "session" }
  }
}
```

部署端设置 `CRAWL_PROXY_CONFIG=docs/crawler/proxies.example.json`，该文件引用 `CA_PROXY_URLS`。变量值是代理 URL 的 JSON 数组，例如 `["http://user:password@proxy-a.example:8000", "http://user:password@proxy-b.example:8000"]`。只支持 HTTP(S) CONNECT 代理，不能把 SOCKS URL 填进来。真实凭证保存在部署 secret，不写入配置文件、任务或审计。

- 未指定 `network`：直连，浏览器仍通过验证目的地址的采集代理。
- `rotation: session`：Crawlee SessionPool 管理有寿命/使用次数上限的会话；一个会话固定使用一个代理 URL。池未满时创建新会话，满后按 Crawlee 规则选择可用会话。
- `rotation: per-request`：每次 acquisition attempt 选择下一个代理 URL；页面及子资源使用同一路由。
- 401/403 淘汰当前会话，网络失败累计错误分数；429 不触发自动会话淘汰。这里没有重试循环，下一步仍按执行计划中的 fallback，整任务重试由队列参数决定。
- 会话目前仅管理代理路由与健康度，不跨任务保存 cookie。池在 worker 进程内，重启即清空；不会落盘保存代理凭证。

换代理 URL 不等于保证换公网 IP。需要运营方提供不同出口或支持轮换的代理服务；单一 URL 的 IP 黏性也由该服务决定。worker 不购买代理，不推断市场，不自行选择地区。

HTTP 与浏览器都先验证 DNS，再让代理 CONNECT 到验证后的 IP。HTTP Host 与 HTTPS SNI 保留原站点名称。浏览器路径是：浏览器 → worker 认证采集代理 → 可选上游代理 → 目标站点。在线浏览器仍必须能访问 worker 广播的采集代理地址。

## 审计与当前范围

`step-N-browser.json` 记录 provider、browserId 和是否复用；`step-N-network.json` 记录 profile、代理列表索引、sessionId 和轮换方式。它们不记录代理 URL 或凭证；原响应和 DOM 仍按原流程封存。失败保留已获取证据。

审计由多个临时文件汇总成一个 ZIP，逻辑 ID 为 `product-page/UTC日期/站点/链接指纹/任务--采集次数`；数据库只保存 auditId，包内包含原始页面、Markdown、模型输入/响应和解析结果。重放按 ID 读取并校验 ZIP。

Markdown + LLM 已通过显式 parsing context 接入，首个 provider 是 Ollama qwen3.5:4b，见 [解析架构](../parsing/README.md)。Amazon、Best Buy、Newegg 专用 HTML 和 Shopify 单变体 API JSON 已接入。

实现依据：[BrowserPool](https://crawlee.dev/js/api/browser-pool/class/BrowserPool)、[SessionPool](https://crawlee.dev/js/api/core/class/SessionPool)、[ProxyConfiguration](https://crawlee.dev/js/api/core/class/ProxyConfiguration)。

## Content readiness

`waitFor.product: true` checks content readiness independently of HTTP status. The acquisition-local `product-readiness.ts` uses Cheerio to inspect named structured offers, the primary heading, price/availability text, price loading indicators and access-verification headings. These are workflow signals, not normalized product facts; the shared parser still owns normalization.

Automatic unknown-store workflows reuse the HTTP probe. Incomplete content triggers at most one Camoufox/browser step. A browser already used during probing is reused instead of opened again. Browser product readiness waits up to 15 seconds within the step's remaining timeout, observes cancellation, and stops on a recognized challenge. HTTP-level rejection retains the existing single browser fallback; there is no repeated browser/IP retry loop.

Both readiness assessments and response/DOM captures are audited. Empty pages do not reach the LLM. Zero structured quotes and busy price placeholders do not establish readiness. Explicit caller workflows remain authoritative and can opt into this check through `waitFor.product`.
