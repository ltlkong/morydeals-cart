# MoryDeals

包含 **Web / React Native 共用 UI package、UI 展示项目和 context 驱动的 NestJS worker**。

- [apps/worker](apps/worker/README.md)：`entrypoints` 接收输入 → `pipeline` 串联 `acquisition`、共享解析器和 `database`；目录导览见 worker README。
- [apps/worker/src/parsing/parsers](apps/worker/src/parsing/parsers/README.md)：商品解析器，只在 worker 中运行；移动端只上传页面。
- [apps/browser-service](apps/browser-service/src/main.ts)：独立 Camoufox Playwright WebSocket 服务，可在 Docker 运行。
- [packages/ui](packages/ui/README.md)：主题、Mory、按钮、商品卡、价格图、优惠券、AI chat dock 和弹窗。
- [apps/ui-showcase](apps/ui-showcase/README.md)：同一套 TypeScript 组件，在浏览器和 Expo Go 展示状态与交互。
- [packages/design/tokens.json](packages/design/tokens.json)：设计 token 的单一来源。

```sh
npm install
npm run web          # http://localhost:8090
npm run ios          # iOS 模拟器中的 Expo Go
npm run android      # Android 模拟器中的 Expo Go
npm run check        # tokens、worker lint/格式、TypeScript 和单元测试
npm run build:web    # 展示项目的静态导出
```

已有 Metro 在 8090 运行时，在终端按 i / a 打开对应模拟器。手机 Expo Go 可以运行 npm start 后扫描二维码。

Mory 展示页支持独立调整头顶水果、手持物、表情和手部动作；可暂停动画、重播落地入场，并让键盘姿态跟随实际输入。商品卡提供横向、纵向和小纵向三种形态，支持 masonry、旧版阶梯 mini chart 和 coupon → Buy now。AI dock 有折叠、半屏、全屏三个停靠点，输入框固定，动作行渐隐，Mory 随输入抬起并敲键盘。

主题与 Mory 基础来自旧项目 main 的 edfa45c1930a03315c9e5dab75346f4e20b5d5b1；复制的组件和修改说明见[设计说明](docs/design/direction.md)。旧项目工作区未修改。

展示使用本地样例数据。页面获取模块独立于 UI，业务后端尚未实现；worker 采用 Nest module、Prisma/PostgreSQL、Nest BullMQ、配置校验和统一 CLI。商品解析策略与业务模型后续逐步细化。Coupon 由后端后续人工维护独立的优惠券库，不属于 worker 或商品解析器职责。

```sh
npm run crawler -- capture "https://example.com/product"
docker compose --profile browser up -d --build --wait camoufox
```

context、Docker 连接、fallback、审计与测试命令见 [worker 文档](apps/worker/README.md)。

## Mobile MVP

The runnable mobile app is in `apps/mobile`, with a minimal NestJS API in `apps/api`. See [mobile setup](apps/mobile/README.md) for the URL → queue → product-card flow and local launch commands. The UI showcase remains separate.
# morydeals-cart
