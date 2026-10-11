# Browser provider architecture

```text
BrowserDriver                         选择普通浏览器或交互执行路径
  ├─ browser.registry.ts             根据 ID 校验 provider 能力
  ├─ browser-resources.ts            长期 BrowserPool、独立 context、空闲回收
  ├─ page-capture.ts                 页面就绪、操作、响应与 DOM 审计
  ├─ providers/*.provider.ts         引擎连接、服务会话生命周期
  └─ executors/
       ├─ interactive.executor.ts    独立 Crawlee / Stagehand 交互执行器
       └─ page-actions.ts            确定性操作与 AI act
```

`browser` 是部署注册的 provider ID，而不是固定的浏览器 enum。入口只校验 ID 格式；registry 在打开网络连接或云端会话前校验注册与能力。未知 ID 返回 `unsupported_browser`，不支持交互返回 `unsupported_capability`。没有隐式浏览器替换，需要调用方声明 fallback。

## Provider 合约

`BrowserProvider` 声明 ID 和 `engine / transport / stagehand` 能力，通过 `open()` 提供资源槽的 `BrowserLease`。lease 提供 Crawlee launcher、启动配置和可选 Stagehand 连接描述。Crawlee 创建并管理页面/context 与浏览器连接；lease 的 `close()` 释放额外服务资源，例如 Browserbase 计费会话。

普通 browser 模式在兼容资源槽中复用连接，每次任务创建独立 context；成功后关闭页面、清空活动代理连接并归还槽位。失败或超时会销毁该资源槽，等待清理完成后才返回或进入 fallback。空闲超时、容量淘汰或应用退出会关闭连接，但不会关闭共享的远程浏览器服务。云 provider 在 `open()` 时创建专属服务会话，槽位关闭时调用 release API；`expiresAt` 防止复用剩余寿命不足的会话。Browserbase 创建会话请求中设置服务端 TTL；若网络中断导致创建结果未知，TTL 是回收兜底。

增加 provider：实现 `BrowserProvider` 并调用 `registry.register()`，然后将 registry 注入 `BrowserDriver`。已有远程浏览器服务只需要部署配置，不必修改代码。context、worker、页面获取编排、归档和文档转换无需增加对应分支。

普通 browser 模式使用 Crawlee BrowserPool + PlaywrightPlugin。interactive 模式继续使用独立执行器：当前本地 StagehandPlugin 在默认 context 中创建页面，不能安全地跨任务复用。完整资源与网络设计见 [采集架构](../README.md)。

## 内置能力

| provider    | 引擎     | 连接                          | Stagehand               |
| ----------- | -------- | ----------------------------- | ----------------------- |
| camoufox    | Firefox  | 本地或 `CAMOUFOX_WS_ENDPOINT` | 否                      |
| chromium    | Chromium | 本地                          | 是，StagehandCrawler    |
| firefox     | Firefox  | 本地                          | 否                      |
| webkit      | WebKit   | 本地                          | 否                      |
| browserless | Chromium | `BROWSERLESS_WS_ENDPOINT` CDP | 默认否                  |
| browserbase | Chromium | 会话 API → CDP                | 是，SDK 附着同一个会话  |
| 自定义 ID   | 显式引擎 | Playwright WS / CDP           | 固定 CDP 会话可显式开启 |

Stagehand 远程执行使用 SDK 附着 provider 已准备的 CDP 会话，由 PlaywrightCrawler 管理页面。根据页面 main-frame ID 等待 Stagehand 注册，确保 `act` 对应同一个页面。当前 Crawlee StagehandPlugin 会覆盖 `localBrowserLaunchOptions`，不能直接传通用远程 CDP 地址，因此连接适配放在 executor 内，不修改依赖源码。

CDP 本身不能证明可以附着 Stagehand：有些在线连接 URL 每次连接会创建新浏览器。Playwright 与 Stagehand 必须连接同一个服务会话。静态 CDP 服务器或 Browserbase 的 session connect URL 满足这一合约；自定义配置只有确认这一点后才设置 `stagehand: true`。Browserless 通用启动 URL 默认只开放 browser 模式。

## 部署配置

在线服务的地址、key 与 project ID 均来自部署环境，任务 context 不接受这些字段。

```dotenv
# Browserless：完整 CDP WS 地址，由环境保管 token
BROWSERLESS_WS_ENDPOINT=wss://your-browser-service.example?token=YOUR_TOKEN
# Browserbase：同时配置后注册 browserbase
BROWSERBASE_API_KEY=YOUR_KEY
BROWSERBASE_PROJECT_ID=YOUR_PROJECT

# 自定义远程浏览器
CRAWL_BROWSER_CONFIG=docs/crawler/browsers.example.json
REMOTE_FIREFOX_WS=ws://your-firefox-service.example/playwright
REMOTE_CHROME_CDP=ws://your-chrome-service.example/devtools/browser/SESSION
```

部署文件引用环境变量名，支持 `headersEnv`（值为 JSON 字符串）提供认证 headers。`stagehand` 默认 false，只支持 Chromium CDP。配置的 provider ID 可以显式替换默认本地 provider；重复自定义 ID 或不兼容协议在初始化时拒绝。

```sh
npm run crawler -- fetch 'https://example.com/product' --context docs/crawler/contexts/browserless.json
npm run crawler -- fetch 'https://example.com/product' --context docs/crawler/contexts/remote-chrome.json
```

本地 Camoufox 与 Docker Camoufox 也可以同时注册为不同 ID，无需替换：

```sh
CRAWL_BROWSER_CONFIG=docs/crawler/browsers.docker.json \
DOCKER_CAMOUFOX_WS=ws://127.0.0.1:59222/camoufox \
CRAWL_PROXY_BIND_HOST=0.0.0.0 \
CRAWL_PROXY_ADVERTISED_HOST=host.docker.internal \
npm run crawler -- fetch 'https://example.com/product' --context docs/crawler/contexts/docker-camoufox.json
```

所有渲染页面仍走资源槽的认证采集代理，包括远程 context。Docker 浏览器可使用 `host.docker.internal`；在线服务必须能访问 worker 部署广播的代理主机及动态端口。服务不支持自定义代理或网络不可达时采集失败，不会自动绕过代理。在线浏览器位置不会自动改变采集代理的出口位置。

审计记录 provider ID、能力，以及普通 browser 模式的 browserId 与 reused 标记，连接地址、认证 headers、云 API key 不写入任务 context 或 provider 审计文件。连接异常使用不包含 endpoint 的错误消息。

参考：[Playwright 连接协议](https://playwright.dev/docs/api/class-browsertype)、[Browserless 连接](https://docs.browserless.io/overview/getting-started/connect-playwright)、[Browserbase 创建会话](https://docs.browserbase.com/reference/api/create-a-session)、[Browserbase 外部代理](https://docs.browserbase.com/platform/identity/proxies)、[Stagehand CDP 附着](https://docs.stagehand.dev/v3/references/stagehand)。
