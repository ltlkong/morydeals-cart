# 商品解析器（worker 内部）

第三步：把采集得到的 `PageDocument` 转为商品与报价。纯函数，只在 worker 中运行，是唯一解析页面的地方（移动端只上传页面）；不读环境变量、不发网络请求、不读写文件或数据库。HTML 使用纯 JavaScript 的 htmlparser2 / css-select 读取；JS 赋值边界使用 Acorn 定位，再严格 JSON.parse，不执行页面脚本。

- `index.ts`：worker 内部的统一入口。
- `types.ts`：文档、商品、报价、解析结果和策略合约。
- `money.ts`：整数最小货币单位转换，拒绝精度损失与不安全整数。
- `currency.ts`：明确的 storefront 币种规则及币种来源。
- `parser.ts`：JSON-LD / metadata 解析和策略执行。
- `retailers/`：Amazon.ca、BestBuy.ca、Newegg.ca 的单商品 HTML 解析器。
- `shopify/`：Liquid 页面快照与 Storefront JSON，统一输出当前变体。
- `shared/`：HTML/JSON 安全读取和商家通用校验，不包含网络请求。
- `llm/types.ts`：可替换的 LlmProvider 合约，不绑定供应商 SDK。
- `llm/product-prompt.ts`：可版本化的商品提取提示词和输入上限。
- `llm/product-output.ts`：Zod 输出协议、原文证据校验与标准化。
- 测试位于 `apps/worker/test/unit/parsing/parsers/`，商家页面样本位于 `apps/worker/test/fixtures/retailers/`。
- Shopify 店铺 schema（`ShopifyStoreSchema`）和语言代码属于任务协议，位于 `packages/capture-contracts/src/shopify.ts`。

同步 JSON-LD / metadata 解析仍使用 `parseProductDocument`。LLM 路径使用 `productPrompt` 生成请求，注入的 provider 获取响应后调用 `normalizeLlmProduct`；未知字段、错误 JSON、猜测价格/币种或不匹配的证据返回 needs_review。商品标题和报价必须在原文中有匹配依据。币种优先采用页面明确声明，否则由通用 URL 市场规则提供默认值：`.ca` 域名、`ca.` 子域名或开头的 `/en-ca/`、`/fr-ca/` 路径对应 CAD。提示词和标准化共用这些规则，并保留 `storefront:<hostname>` 币种来源。不把 URL 任意位置的 `ca` 或单独的 `$` 当作币种证据。

Ollama / SiliconFlow SDK、部署地址和模型调用生命周期在 `../providers` 与 `../product-parsing.service.ts`；本目录只提供提示词、schema 和标准化。采集代码（`src/acquisition`）可以引用本目录的纯函数（如验证页检测、Shopify 链接），ESLint 禁止它引用解析服务和 provider。

网页获取和原始归档属于 `src/acquisition`，HTML → Markdown 转换属于 `../document`；入库属于 `src/database`。Coupon 由后端后续人工维护独立库，不属于 worker。

## 报价协议（parser 3.2.0）

```ts
{
  amountMinor: 8999,              // 现价 CAD 89.99
  compareAtAmountMinor: 42999,    // 划线原价 CAD 429.99；缺失时省略
  currency: 'CAD',
  currencyEvidence: 'storefront:www.walmart.ca',
  evidence: 'Current price is Now $89.99',
  compareAtEvidence: 'was $429.99'
}
```

货币代码和精度使用 [currency-codes](https://github.com/freeall/currency-codes) 的 ISO 4217 数据，避免使用平台显示舍入规则作为金额单位。所有输出金额均为安全整数最小货币单位，CAD/USD 是分，JPY 是元，KWD 是千分之一。十进制原文用字符串精确转换，不使用浮点乘法或四舍五入；超出币种精度或安全整数范围时留待审核。数据库使用 bigint，并约束在 JavaScript 安全整数范围内，CLI/JSON 使用 number。

划线价属于同一报价，不是第二个 offer；必须有独立证据且高于现价。Schema.org 使用 `priceSpecification.priceType=StrikethroughPrice`；LLM prompt 2.1.0 使用带金额和原文的 `compareAt` 对象，标准化后输出以上扁平字段。分期、节省金额、区间及其他卖家的 starting-from 不作为现价。

## Shopify 变体策略

`parseShopifyProduct(document)` 独立于网络、数据库和 LLM。`PageDocument.embeddedProducts` 接收 HTML 转换器保留的 `data-selected-variant` 或完整商品 JSON，随后按 URL 的 `variant` 精确选择。无匹配、快照冲突、币种不明确或 JSON-LD 价格不一致时返回 needs_review，不采用第一个颜色作为替代。输出包含 `variantId`、对应 SKU、该颜色图片、现价/划线价和库存；没有该颜色图片时保持空数组。

金额按照 [Shopify Liquid variant](https://shopify.dev/docs/api/liquid/objects/variant) 的 subunit 协议转换：CAD 等使用供应商整数，JPY/KRW 等零小数币种移除 Shopify 附加的两位零，拒绝有损转换。币种取匹配变体报价的明确声明，其次页面币种 metadata，最后 URL 市场默认值。

LLM 模式仍执行模型调用，但提示词附带已验证的 selectedVariant。标准化时由该快照提供 SKU、图片和变体 URL，模型价格必须与快照一致；不能把其他颜色写入当前商品。没有明确变体 URL 的多个 JSON-LD 商品不会混为一个商品报价。

`Regular price` 可表示当前常规售价；附近存在 sale/current 标签时须与其金额一致。标准化检查原始价格行，即使模型把 `was` 或划线标记从引用里省略，也不能让旧价变成现价。

## 确定性商家解析

`parseAmazonProduct`、`parseBestBuyProduct`、`parseNeweggProduct` 接受带原始 `html` 的 `PageDocument`。`requestedUrl` 是用户 URL，`url` 是最终采集 URL；两者和页面选中标识一起校验。worker 为这些策略保留 HTML，不做 Markdown 转换。每次返回至多一个 product 和一个普通新品报价；身份、价格、条件冲突时返回 `needs_review` 和空 products，不写价格历史。

- Amazon：链接 ASIN、页面 ASIN、购买区域 ASIN 必须对应；只读取普通 NEW 或无非新品标记的 featured offer，拒绝 used、订阅、会员价、分期和页外推荐价。
- Best Buy：只读 `window.__INITIAL_STATE__.product.product` 当前 SKU；拒绝运营商月付、状态 SKU 错配、非新品及卖家冲突。
- Newegg 手机版（WebView 抓取）：没有 `__neweggState__`，`ItemDetail.NeweggItemNumber`、路由 `params.Item` 和选项映射 `Property.AvailableMap` 必须都对应 URL 的 Item；现价 `Price.FinalPrice` 须等于 `OriginalPriceText - InstantRebateAmount`，并与页面唯一的 JSON-LD Product（同一 sku、CAD）一致；手机版没有卖家 ID，只接受 Newegg 自营。
- Best Buy 页面内跳转后 `__INITIAL_STATE__` 仍是上一页（无商品且路由不含该 SKU）时，读取 `script#product-json-ld`，其 SKU 须与 canonical 链接和页面 Web Code 一致；配件卡片的 offer microdata 不读取。
- Newegg：URL `Item` 优先于路径，必须与 `ItemDetail.Item` 对应；校验 `FinalPrice = UnitCost - InstantRebateAmount`，排除隐藏价格、订阅专享及选中的保修/付费附加项。Marketplace URL 保留 `Item`。

原始网页中可以存在其他变体，但解析器不产生兄弟商品、不请求兄弟页面、不建立全量 variants 列表。没有可确认价格（包括无报价的缺货页）返回复核，不编造零元。

## Shopify Storefront JSON

同一个 `parseShopifyProduct` 入口按显式输入来源分发：`embeddedProducts` 给 Liquid reader，`storefront` 给 API reader。API source 包含原始 response 和请求 target（URL、选中 variant、shopDomain、country、language、currency）。API reader 检查 GraphQL errors、返回市场、商店域名、handle、product ID、variant 所属关系、币种以及是否强制订阅。

`resolveShopifyTarget` 验证公开页 `Shopify.shop` 与配置 API 域名一致。URL 没有 variant 时仅接受页面明确选中的 `data-selected-variant` 或购物车表单值；有歧义则拒绝。不会查询第一款、最低价或 `selectedOrFirstAvailableVariant`。

Storefront query 构建与请求均位于 `src/acquisition/shopify/`；本目录只消费响应与请求目标进行校验、解析。API MoneyV2 是十进制字符串，按 ISO 币种转换为最小单位，**不使用 Liquid 整数的缩放规则**。variant 没有图片就返回空数组，不拿其他颜色的图片补齐。

`shopify/detection.ts` 导出的 `detectShopify(html)` 返回 `Shopify.shop`、country、locale、currency 的声明证据。它不执行 JS，也不根据 CDN 或 `/products/` 路径猜测平台。worker 的独立决策步骤消费这些证据；解析器不负责域名准入或网络编排。

解析器 3.3.0：Shopify Storefront / Liquid 以及使用共享划线价规则的商家解析器，在划线价低于有效现价时保留商品和现价，省略 compareAtAmountMinor、compareAtEvidence，并在 issues 记录异常。原始响应保持不变。商品身份、现价、币种或金额格式校验失败仍返回 needs_review。

## Rendered HTML capture

An uploaded WebView page goes through the same document preparation and parsers as a
fetched page; `htmlCaptureStrategy(url, html)` only picks the strategy (store parser, then
Shopify, then generic). HTML is read inertly; scripts never run and nothing is fetched.
Incomplete or ambiguous evidence returns `needs_review`. Mobile and desktop Amazon layouts share identity,
price and offer validation, excluding subscription and unrelated offers.
