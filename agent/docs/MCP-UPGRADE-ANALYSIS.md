# MCP 协议升级分析报告

> 分析时间：2026-09-20
> 当前状态：**暂不升级，持续观察 SDK v2 稳定性**
> 当前 SDK 版本：`@modelcontextprotocol/sdk@^1.29.0`（Legacy 模式）

---

## 一、协议版本演进时间线

| 版本 | 发布时间 | 核心特征 |
|------|---------|---------|
| 2024-11-05 | 2024.11 | 初始版本，HTTP+SSE 传输 |
| 2025-03-26 | 2025.03 | 引入 Streamable HTTP 传输，替代 HTTP+SSE |
| 2025-06-18 | 2025.06 | Elicitation、结构化工具输出 |
| 2025-11-25 | 2025.11 | Tasks(实验)、Progress、Resource 订阅、OAuth 2.0 |
| **2026-07-28** | **2026.07** | **无状态化（MCP 2.0）**，移除 session/handshake |

**当前生态定位**（截至 2026-09）：
- 官方 versioning 页面仍将 `2025-11-25` 标为 current
- `2026-07-28` 已发布，作为**迁移目标**
- TypeScript SDK v2 已发 beta，但社区反馈初版不稳定

---

## 二、2026-07-28 版本核心变化

### 2.1 架构层变化（Breaking）

1. **移除协议级 Session**
   - 删除 `Mcp-Session-Id` header
   - 删除 `initialize` / `notifications/initialized` 握手
   - 每个请求通过 `_meta` 携带 `protocolVersion` 和 `clientCapabilities`

2. **新增 `server/discover` RPC**
   - 服务端必须实现，广播支持的协议版本、capabilities、identity
   - 客户端可选调用，用于版本选择或向后兼容探测

3. **MRTR 模式（Multi Round-Trip Requests）**
   - 替代服务端主动发起的 `sampling/createMessage`、`elicitation/create`、`roots/list`
   - 服务端返回 `InputRequiredResult`（`resultType: "input_required"`）
   - 客户端重试原请求时附带 `inputResponses`

4. **订阅机制重构**
   - HTTP GET 端点和 `resources/subscribe` 被移除
   - 统一为 `subscriptions/listen`：单一长连接 POST 响应流

5. **SSE 流恢复性移除**
   - 移除 `Last-Event-ID` 和 SSE event IDs
   - 断流后客户端需用新 request ID 重发请求

### 2.2 新增要求

- 所有结果必须携带 `resultType` 字段（`"complete"` 或 `"input_required"`）
- `tools/list`、`prompts/list`、`resources/list` 等结果新增 `ttlMs`（缓存新鲜度）和 `cacheScope`（`"public"` / `"private"`）
- Streamable HTTP POST 必须携带 `Mcp-Method`、`Mcp-Name` header
- 工具列表应按确定性顺序返回（利于缓存）

### 2.3 弃用项（12 个月窗口期）

| 弃用特性 | 建议迁移方案 |
|---------|------------|
| Roots | 改用工具参数传路径、resource URI、或服务端配置 |
| Sampling | 直接集成 LLM Provider API |
| Logging | 改用 stderr（stdio）或 OpenTelemetry |
| HTTP+SSE 传输 | 迁移到 Streamable HTTP |
| OAuth 2.0 动态客户端注册 (RFC7591) | 迁移到 Client ID Metadata Documents |

### 2.4 移除项

- `ping` 方法
- `logging/setLevel` 方法
- `notifications/roots/list_changed`
- `tasks/list`、`tasks/result`（Tasks 移出为扩展 `io.modelcontextprotocol/tasks`）

---

## 三、当前代码分析

### 3.1 文件结构

```
agent/src/mcp/
├── client.js      # MCP Client 封装（连接、调用、断开）
├── mcp-config.js  # 配置文件管理（~/.ai-helper-agent/mcp_servers.json）
└── registry.js    # 多 Server 注册表（初始化、状态查询、工具调用路由）
```

### 3.2 当前实现特征

| 维度 | 当前状态 |
|------|---------|
| SDK 版本 | `@modelcontextprotocol/sdk@^1.29.0` |
| 协议模式 | Legacy（有状态，initialize 握手） |
| 传输支持 | stdio / SSE / Streamable HTTP / WebSocket |
| 版本协商 | SDK 内部 `connect()` 自动处理 |
| 工具调用 | `client.callTool({ name, arguments })` |
| 会话管理 | 依赖 SDK 的 session 机制 |

### 3.3 关键代码路径

```javascript
// client.js - 连接流程（Legacy 模式）
await this.client.connect(this.transport);  // 内部执行 initialize 握手
this.client.getServerVersion();              // 获取服务端版本
this.client.getServerCapabilities();         // 获取服务端能力
await this.client.listTools({});             // 列出工具
await this.client.callTool({ name, arguments }); // 调用工具
```

---

## 四、向后兼容策略

### 4.1 官方兼容矩阵

| 客户端 \ 服务端 | Modern (2026-07-28) | Dual-era | Legacy (≤2025-11-25) |
|---------------|-------|----------|--------|
| **Modern** | ✅ 工作 | ✅ 工作 | ❌ 失败 |
| **Dual-era** | ✅ 工作 | ✅ 工作 | ✅ 工作 |
| **Legacy** | ❌ 失败 | ✅ 工作 | ✅ 工作 |

**结论：必须实现 Dual-era 客户端才能同时兼容新老 Server。**

### 4.2 Dual-era 探测机制

#### stdio 传输：
```
Client → server/discover
  ├─ 返回 DiscoverResult / UnsupportedProtocolVersionError → Modern 模式
  └─ 返回非现代错误 / 超时 → 降级到 initialize 握手（Legacy）
```

#### Streamable HTTP 传输：
```
Client → POST (带 _meta 的现代请求)
  ├─ 成功 → Modern 模式
  ├─ 400 + 现代 JSON-RPC 错误 → Modern（版本不匹配，调整后重试）
  └─ 400/404/405 + 非现代错误 → 降级到 initialize，甚至降级到 HTTP+SSE
```

#### 探测结果缓存：
- 规范建议：缓存 era 判定结果，per server process（stdio）或 per origin（HTTP）
- 可跨重启持久化，后续失败时重新探测

---

## 五、升级实施计划（待排期）

### Phase 1：SDK 升级 + Dual-era 基础

- [ ] 升级 `@modelcontextprotocol/sdk` 到 v2.x 稳定版
- [ ] `McpClient.connect()` 增加版本探测逻辑
- [ ] 实现 era 判定缓存（serverId → 'modern' | 'legacy'）
- [ ] Legacy 降级路径：保留现有 `initialize` 握手逻辑
- [ ] Modern 路径：适配无状态请求（每请求带 `_meta`）

### Phase 2：新功能适配

- [ ] 支持 `server/discover` RPC
- [ ] 适配 `resultType` 字段（兼容旧 server 不返回的情况）
- [ ] 适配 `ttlMs` / `cacheScope` 缓存提示
- [ ] Streamable HTTP 新增 `Mcp-Method`、`Mcp-Name` header

### Phase 3：弃用特性迁移

- [ ] 评估是否使用了 Roots/Sampling/Logging（当前未使用）
- [ ] SSE 传输标记为 deprecated，保留但不再推荐
- [ ] WebSocket 传输：非官方标准，评估是否保留

### Phase 4：高级特性（可选）

- [ ] MRTR 模式支持（如果有需要服务端交互的场景）
- [ ] `subscriptions/listen` 订阅流
- [ ] Tasks 扩展（`io.modelcontextprotocol/tasks`）长时任务支持
- [ ] OpenTelemetry trace context 传播

---

## 六、风险与注意事项

1. **SDK 稳定性风险**：2.0.0 初版被社区报告 "highly broken"，需等修复版本
2. **生态迁移进度**：绝大多数现存 MCP Server 仍为 Legacy，短期不会断连
3. **无状态代价**：需要跨调用共享状态的场景（分页游标、登录态等）需改用 server-minted handle
4. **12 个月弃用窗口**：官方承诺弃用特性至少保留 12 个月，有充足迁移时间
5. **SSE 传输**：虽然 deprecated 但不会被立即移除，现有 SSE 连接暂时安全

---

## 七、触发升级的条件

满足以下任一条件时启动升级：

1. `@modelcontextprotocol/sdk` v2.x 发布 stable（非 beta/rc）且社区反馈稳定
2. 需要对接的 MCP Server 仅支持 2026-07-28 协议（Modern-only）
3. 需要使用新特性（Tasks 扩展、MRTR、subscriptions/listen）
4. 官方将 `2025-11-25` 从 current 降级为 deprecated

---

## 八、参考资源

- [MCP 2026-07-28 Changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)
- [Versioning and Compatibility](https://modelcontextprotocol.io/specification/2026-07-28/basic/lifecycle)
- [Streamable HTTP Transport (2026-07-28)](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/streamable-http)
- [Feature Lifecycle and Deprecation Policy](https://modelcontextprotocol.io/community/feature-lifecycle)
- [Deprecated Features Registry](https://modelcontextprotocol.io/specification/2026-07-28/deprecated)
- [Simon Willison: Stateless MCP has recaptured my interest](https://simonwillison.net/2026/Jul/31/stateless-mcp/)
- npm: `@modelcontextprotocol/sdk` — 周下载量 5000 万+（截至 2026.08）
