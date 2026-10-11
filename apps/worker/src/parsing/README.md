# 商品解析与 LLM provider

```text
CaptureWorkflowService
  DocumentPreparationService       原始 HTML / API JSON → PageDocument
CapturePipelineService
  ProductParsingService
    structured → 共享 parseProductDocument（JSON-LD / metadata）
    retailer   → Amazon / Best Buy / Newegg HTML 解析
    generic    → structured，未解析时按计划调用 LLM
    shopify    → 共享 parseShopifyProduct（精确选中变体）
    llm        → 共享 productPrompt
                 LlmProviders.get(context.parsing.provider)
                 provider.generate → 保存原始响应
                 共享 normalizeLlmProduct → parsed / needs_review
  ZIP 审计发布 → PostgreSQL 业务写入
```

`parsers/llm` 定义不依赖 SDK 的 provider 合约、提示词、Zod schema 和标准化；解析规则见 [parsers/README.md](parsers/README.md)。`apps/worker/src/parsing/providers` 只做供应商适配；`parsing.module.ts` 负责装配。增加一个来源时实现 `LlmProvider` 并注册即可，不需要改 pipeline 或数据库。当前实现 Ollama 和 SiliconFlow，调用方通过 context 显式选择，不自动切换供应商。

## 使用 Ollama

默认部署：`OLLAMA_HOST=http://127.0.0.1:11434`、`OLLAMA_MODEL=qwen3.5:4b`。模型需预先安装，worker 不自动下载、不自动切换模型。官方模型名称见 [qwen3.5:4b](https://ollama.com/library/qwen3.5:4b)。

```json
{
  "version": 1,
  "acquisition": { "mode": "http" },
  "parsing": {
    "strategy": "llm",
    "provider": "ollama",
    "model": "qwen3.5:4b",
    "timeoutMs": 120000
  }
}
```

```sh
ollama pull qwen3.5:4b
npm run crawler -- capture 'https://shop.example/product' --context docs/crawler/contexts/ollama.json
```

没有 parsing 配置时仍只执行 structured 解析，不会隐式调用模型。获取模式可独立改为 Camoufox 或其他浏览器；LLM 解析与 Stagehand 页面操作是独立职责。

Ollama 通过官方 TypeScript SDK 调用 `/api/chat`，使用 JSON schema `format`、temperature 0、think false、非流式输出。每次请求独立取消，超时不会取消其他任务。输入目前上限 24,000 字符，超限显式失败；不静默截断商品信息。输出 token 上限 2048，模型 context 16,384，JSON 超过 1 MiB 拒绝。

页面内容作为不可信数据传入，没有工具调用。schema 不包含 coupon。现价与划线原价分开，金额使用整数最小货币单位。币种优先使用报价原文的 ISO 代码，否则使用共享解析器的 URL 市场规则（`.ca` / `ca.` / 开头的 `en-ca`、`fr-ca` → CAD）；未知站点不能仅凭 `$` 推测。标准化再次校验标题、两种价格的原文与整数转换，并保留币种来源；格式合法不代表证据充分。当前版本只提取主商品，不推断隐藏变体、分期报价或外部价格。

Ollama 当前关闭思考，标准化只读取 `message.content`；供应商原始响应仍保留在审计 ZIP 中。

每次尝试的 ZIP 保存 `llm-request.json`（提示词版本、schema、消息）、`llm-response.json`（模型名称及原始响应）、`parsed.json`。模型输出无效时保留响应并返回 needs_review，不生成价格观察；调用失败时保留已抓取页面和失败说明。数据库只保留审计 ID 和正常业务数据。

验证依据：[Ollama structured outputs](https://docs.ollama.com/capabilities/structured-outputs)。真实本地测试可用 `TEST_OLLAMA=1 npm run test:crawler:integration`，使用临时数据库 schema，结束后清理；普通测试使用模拟 provider。

耗时记录：provider 将 Ollama 的纳秒统计转换为毫秒，随 `LlmResponse.metrics` 返回。pipeline 的 `timings.llm` 额外提供客户端 `requestMs`，可区分模型计算和请求总等待；统计是 `parsing` 的内部明细。关闭 think 后仍保留 schema、非流式响应和原文证据验证。

## 选择 LLM provider

没有商家解析器的页面，以及商家解析器无法确认商品时，由根目录 `.env` 的 `LLM_PROVIDER` 指定的模型解析：`anthropic`、`siliconflow` 或 `ollama`（默认）。provider 只由这个设置决定，配置了哪个 Key 不会自动切换；选中的托管 provider 缺少 Key 时 worker 启动即报配置错误。

## 使用 Anthropic

`LLM_PROVIDER=anthropic`，设置 `ANTHROPIC_API_KEY`，默认 `ANTHROPIC_MODEL=claude-haiku-5-5`。适配器使用 Anthropic 官方 TypeScript SDK 的 Messages API，`output_config.format` 以共享 JSON schema 约束输出（去掉其不支持的 `maxItems`、`minimum`、`maximum`，这些仍由 Zod 校验）、输出上限 4096 tokens、不重试。只有 `stop_reason: end_turn` 的回答进入标准化。

## 使用 SiliconFlow

`LLM_PROVIDER=siliconflow`，在根目录 `.env` 设置 `SILICONFLOW_API_KEY`，默认 `SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1`、`SILICONFLOW_MODEL=zai-org/GLM-5.3-Flash`。国际站账户可显式改为 `https://api.siliconflow.com/v1`；worker 不自动切换服务地址。

```sh
npm run crawler -- capture 'https://shop.example/product' --context docs/crawler/contexts/siliconflow.json
```

`context.parsing.provider` 为 `siliconflow`，`model` 可覆盖部署默认值。适配器使用 OpenAI 官方 TypeScript SDK 调用 SiliconFlow 的兼容接口，`response_format: {type: "json_object"}`、`stream: false`、`enable_thinking: true`、`reasoning_effort: low`、temperature 0、输出上限 4096 tokens。共享提示词携带 JSON schema，返回后继续走同一个 Zod 校验与价格/币种/原文证据标准化；JSON mode 不等于供应商强制 schema。

每次调用独立 AbortSignal，SDK 重试关闭，由入口决定是否重试。HTTP 错误只记录状态码和通用提示，不输出供应商错误正文或凭据。截断/拒绝的响应保留在 `llm-response.json`，通过空提取结果进入 needs_review，不能写入价格记录。API Key 不进入 context、提示词或 ZIP。

`timings.llm.requestMs` 记录客户端实际等待，`promptTokens` / `outputTokens` 来自供应商 usage；未提供的内部推理耗时不估算。原始响应中的 usage 及返回模型名完整保留。

接口依据：[SiliconFlow Chat Completions](https://docs.siliconflow.cn/docs/api/chat-completions-post)、[JSON mode](https://docs.siliconflow.cn/docs/userguide/guides/json-mode)、[GLM-5.3-Flash](https://www.siliconflow.com/models/glm-5-3-flash)。

GLM-5.3-Flash 的 [Z.ai 模型参数说明](https://docs.z.ai/api-reference/llm/chat-completion) 明确该系列无法关闭思考。实测仅传 `enable_thinking: false` 仍返回长推理并在 2048 tokens 截断；因此适配器显式使用最低 `low` 档，并给 JSON 留出输出额度。Ollama 仍保持 `think: false`。请求思考配置不代表每次必有推理 token，以原始响应为准；SiliconFlow 不同模型对 effort 的支持不同，更换模型应核对适配器参数。

## 显式 Shopify 策略

使用 `docs/crawler/contexts/shopify.json`，由调用方指定 `parsing.strategy: shopify`。显式 context 不经过自动决策；此路径直接标准化已封存页面内的 Shopify 商品/选中变体 JSON，不调用 LLM。可以用相同 URL 的 `siliconflow.json` 对照 LLM 路径，二者都绑定页面内验证过的选中变体。

```sh
npm run crawler -- capture 'https://ca.shokz.com/products/opendots-2?variant=44553280454755' --context docs/crawler/contexts/shopify.json
```

Walmart Canada 使用 `walmart-ca` 策略读取原始 HTML 中 `__NEXT_DATA__.props.pageProps.initialData.data.product`。校验请求、最终页面和当前商品 ID，读取同一商品的 `priceInfo.currentPrice` / `wasPrice`（CAD，标准化为分），不遍历推荐商品或其他卖家报价。自动路由优先 HTTP，采集失败按显式 browser fallback 处理；缺少或冲突数据返回 needs_review。

Generic structured parser 3.4.1 treats zero JSON-LD/metadata prices as unconfirmed rather than a free-product quote. This is intentionally conservative; explicit free-product support requires an additional confirmed pricing rule. Content readiness runs before conversion/LLM in automatic unknown-store acquisition.
