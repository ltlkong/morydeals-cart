# DataImpulse IP 池

部署通过 `CRAWL_PROXY_CONFIG=docs/crawler/proxies.dataimpulse.json` 加载两个加拿大出口 profile。账号密码只保存在本地 `.env`，不放在 context 或代理配置文件中。

| Profile | 出口方式 | 使用场景 |
| --- | --- | --- |
| `dataimpulse-ca-rotating` | 823，每个新请求轮换 | 独立 HTTP 请求 |
| `dataimpulse-ca-sticky` | 10000–10003，4 个粘性端口 | 自动 workflow、浏览器及其子资源 |

环境变量 `DATAIMPULSE_CA_ROTATING_URLS`、`DATAIMPULSE_CA_STICKY_URLS` 均为代理 URL 的 JSON 数组。用户名使用 `__cr.ca` 限定加拿大；部署时从秘密管理服务注入，勿提交真实 URL。

自动采集：

```sh
npm run crawler -- capture 'https://ca.roborock.com/products/roborock-qrevo-2-pro' --id my-task-id --context docs/crawler/contexts/dataimpulse-auto.json
```

纯 HTTP 采集使用 `docs/crawler/contexts/dataimpulse-http.json`。BullMQ 的 task.context 使用同样的 JSON 内容。已有常驻 worker 需重启以加载环境配置。不带 network 的任务仍直连，由调用方决定是否使用代理。

Crawlee session 保存代理路由；供应商负责出口 IP。供应商粘性端口默认保持约 30 分钟，Crawlee 的 600 秒 session 生命周期不会强制供应商换 IP。4 个端口也不承诺一定是 4 个不同 IP；端口复用或供应商重新分配时仍可能复用出口。遇到 blocked 只按显式 fallback 执行，不循环轮换尝试。

依据：[连接与端口](https://docs.dataimpulse.com/proxies/types-of-connections)、[国家定位参数](https://docs.dataimpulse.com/proxies/parameters)。

## 本地验证（2026-10-09）

- 加拿大轮换出口连续两次返回不同 IP；粘性池的第一个端口连续两次返回同一加拿大 IP。其余三个端口已配置，未逐个探测。
- 真实 worker 对 example.com 的 HTTP fetch 成功（约 1.13 秒），Camoufox fetch 成功（约 2.75 秒），均生成审计 ZIP。
- DataImpulse 对本次 Roborock IPv6 CONNECT 返回 502；相同目标 IPv4 返回商家 403。地址选择现优先 IPv4，仍校验全部 DNS 结果并固定连接地址。Roborock 商家访问尚未通过。
- Worker 类型检查和 61 个单元测试通过。本次验证范围为代理与采集，不包括商品解析入库。
