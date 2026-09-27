# AI Helper 安全与性能审计报告

> 审计日期：2026-09-24
> 审计范围：`src/`、`agent/`、`manifest.json`、`scripts/`、`dist/` 构建产物
> 审计方式：静态代码审查 + 构建产物交叉验证（未做运行时压测与真机性能剖析，见"九、审计局限"）
> 关联文档：[docs/RESEARCH_REPORT.md](RESEARCH_REPORT.md)（2026-09-15）。本报告标注了相对该报告的**新增发现**与**结论修正**。

---

## 一、结论速览

**整体判断**：架构能力完整，工程底座（Agent 侧路径校验、SSRF 过滤、token 生成与锁定）优于多数同类项目。风险集中在两处：

1. **内容脚本的 Markdown 渲染链路缺少消毒** —— 侧边栏有 DOMPurify，内容脚本完全没有，而渲染目标正是宿主页面 DOM。这是本项目唯一的真实 XSS 通道。
2. **危险工具的人工确认环节失守** —— `agent_exec`（本地任意命令执行）的"确认"实际上由模型自己回答，用户不会被询问。

性能方面，性价比最高的一处修复是构建脚本：**当前每个页面、每个 iframe 都要解析约 1.93 MB 的第三方库**，其中包含 1.09 MB 的 `pdf.worker`。

### 问题清单

| 编号 | 等级 | 类别 | 问题 | 位置 |
|---|---|---|---|---|
| SEC-01 | 严重 | 安全 | 内容脚本 Markdown 渲染无消毒，可在宿主页面执行任意 JS | `src/content/selection-toolbar.js:784, 1022, 1033, 1991, 2027, 1582` |
| SEC-02 | 严重 | 安全 | 本地命令执行的确认由模型自答，用户不被询问 | `src/background/tools/agent-tools.js:53`、`src/background/tool-executor.js:3764`、`agent/src/security.js:344` |
| SEC-03 | 严重 | 安全 | `fetch_url` 无确认的跨域请求原语（SSRF + 外泄），且日志打印请求头 | `src/background/tools/storage-tools.js:71-92`、`src/background/tool-executor.js:2456-2502` |
| SEC-04 | 高 | 安全 | `debug_page` 抓包把 Authorization / Cookie 明文送入模型上下文 | `src/background/debugger/debugger-rules.js:126-144`、`src/background/tools/debugger-tools.js:14` |
| SEC-05 | 高 | 安全 | 内容脚本 message 监听无 origin/source 校验，任意 iframe 可伪造选区 | `src/content/selection-toolbar.js:2129-2167` |
| SEC-06 | 高 | 安全 | Agent `/api/shutdown` 回环免认证，任意网页可 CSRF 关停 | `agent/src/server.js:488-504` |
| SEC-07 | 高 | 安全 | 敏感数据明文落盘：API Key、配对 token、WS token 走 URL query | `src/options/config-manager.js:1257`、`agent/src/config.js:203-217`、`src/background/local-agent-client.js:674-678` |
| SEC-08 | 高 | 安全 | 整页 `innerHTML` 重写做高亮，摧毁页面状态且可改变脚本语义 | `src/content/page-extract.js:747, 801` |
| SEC-09 | 中 | 安全 | 背景消息无来源校验（纵深防御缺口） | `src/background/index.js:741` |
| SEC-10 | 中 | 安全 | 模型可向宿主页面注入任意 CSS | `src/content/advanced-tools.js:384-399` |
| SEC-11 | 中 | 安全 | 审计日志 detail 未转义插入 innerHTML | `src/side_panel/index.js:3650` |
| SEC-12 | 中 | 安全 | 依赖已知漏洞：`xlsx@0.18.5`、`pdfjs-dist@3.11.174` | `package.json:35` |
| SEC-13 | 低 | 安全 | 生产构建随包发布 sourcemap（含 3.68 MB 主 map） | `vite.config.js` |
| SEC-14 | 低 | 安全 | 扩展页内联 `onerror` 被 CSP 拦截（无效代码） | `src/side_panel/agent-at-selector.js:553` |
| PERF-01 | 严重 | 性能 | 构建脚本向每个 iframe 注入约 1.93 MB 脚本（含 pdf.worker） | `scripts/fix-build.js:195-207`、`dist/manifest.json` |
| PERF-02 | 严重 | 性能 | 流式渲染每约 30 ms 全量重解析 + 整段 DOM 替换 | `src/background/constants.js:56`、`src/side_panel/chat-streaming.js:764-837` |
| PERF-03 | 高 | 性能 | 内容脚本每帧常驻开销 + `MutationObserver(subtree)` 高频重绑监听 | `src/content/selection-toolbar.js:2116-2195` |
| PERF-04 | 高 | 性能 | 滚动事件直接写 `storage.local`，无节流 | `src/side_panel/index.js:3432-3435` |
| PERF-05 | 高 | 性能 | `docx` 静态进主包，主 chunk 达 1.11 MB | `src/side_panel/chat-export.js:32` |
| PERF-06 | 高 | 性能 | 预览面板重复注册 `mousemove/mouseup/resize` 且不移除 | `src/side_panel/workspace-panel.js:2365, 2373, 2411, 3017, 3025, 3061` |
| PERF-07 | 中 | 性能 | Service Worker 常开保活定时器，阻止空闲回收 | `src/background/index.js:1970, 2017, 2028` |
| PERF-08 | 中 | 性能 | 工具统计 / 审计日志"读全量-改-整写回"，随数据量放大 | `src/background/tool-executor.js:637-645, 1332-1347` |
| PERF-09 | 中 | 性能 | Token 统计无 TTL 且全表扫描，长期无界增长 | `src/storage/token-store.js` |
| PERF-10 | 中 | 性能 | 每个工具卡/结果都做全 Panel `querySelectorAll` 并重绑按钮 | `src/side_panel/markdown-render.js:1227, 1314` |
| PERF-11 | 低 | 性能 | 整段 `outerHTML` 与 executionLog 存入 DOM dataset | `src/side_panel/chat-streaming.js:2045` |
| PERF-12 | 低 | 性能 | 首页轮询类开销：恢复轮询 3 s、选区检测 500 ms | `src/side_panel/index.js:1303-1349, 2122-2144` |

---

## 二、审计方法与环境

| 项 | 说明 |
|---|---|
| 代码版本 | 工作区 `main` 分支，最新提交 `7c8e764` |
| 构建产物 | `dist/`（2026-09-24 10:53 构建），与源码交叉核对 |
| 覆盖层 | 内容脚本（`<all_urls>` + `all_frames`）、Background Service Worker、Side Panel、Options、本地 Node Agent |
| 手段 | 全量 grep 定位危险 sink → 精读关键路径 → 在 `dist/` 中验证实际注入/打包结果 |
| 未覆盖 | 运行时压测、真机内存剖析、Agent 服务的模糊测试、第三方 MCP server 行为 |

**Key 事实**（来自 `manifest.json` / `dist/manifest.json`）：

- 权限：`debugger`、`cookies`、`history`、`clipboardRead`、`unlimitedStorage`、`<all_urls>` 等 19 项
- 内容脚本：`all_frames: true`、`run_at: document_idle`、匹配 `<all_urls>`
- CSP（扩展页）：`script-src 'self'; object-src 'self';`（**无** `unsafe-eval`，此项配置正确）
- 未声明 `externally_connectable`（此项配置正确，网页与他扩展无法直连本扩展）
- 依赖版本：`xlsx@0.18.5`、`pdfjs-dist@3.11.174`、`mammoth@1.12.1`、`docx@9.7.1`、`dompurify@3.4.13`

---

## 三、安全问题

### SEC-01【严重】内容脚本 Markdown 渲染无消毒 → 宿主页面 XSS

**现象**：侧边栏的 Markdown 渲染有 DOMPurify 保护，但内容脚本（运行在每个页面）的渲染路径完全没有消毒，且渲染目标是宿主页面 DOM。

**证据**：

```js
// src/content/selection-toolbar.js:1033  流式渲染
function renderStreamMarkdown(text) {
  if (typeof marked === 'undefined') {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
  const fenceCount = (text.match(/```/g) || []).length;
  const normalized = fenceCount % 2 === 1 ? text + '\n```' : text;
  return marked.parse(normalized);          // 未消毒，直接返回 HTML
}

// src/content/selection-toolbar.js:1022  返回值直出 innerHTML
body.innerHTML = '<div class="aih-result-content-stream">' + renderStreamMarkdown(text) + '</div>';

// src/content/selection-toolbar.js:784   最终结果同样直出
function showResultPanel(x, y, content, suggestions = []) {
  ...
  body.innerHTML = content;                 // content = marked.parse(...) 的输出
}

// src/content/selection-toolbar.js:208   面板挂在宿主页面 DOM 上
function appendToDoc(el) {
  (document.body || document.documentElement).appendChild(el);
}
```

未消毒的 `marked.parse` 输出点共 4 处：

| 行 | 场景 |
|---|---|
| `:1022` ← `:1033` | 流式回答实时渲染 |
| `:784` ← `:1991` | `SELECTION_TOOLBAR_STREAM_DONE`（流结束，见 `:1963`）最终渲染 |
| `:784` ← `:2027` | `SELECTION_TOOLBAR_RESULT` 非流式渲染 |
| `:1582-1586` | 「复制为富文本」写入剪贴板 HTML |

对照组（侧边栏，已正确消毒）：

```js
// src/side_panel/markdown-render.js:386-396
html = marked.parse(text);
html = DOMPurify.sanitize(html, {
  FORBID_TAGS: ['style', 'iframe', 'script', 'object', 'embed', 'svg'],
  FORBID_ATTR: [...],
  ...
});
```

**验证**：`libs/marked.min.js` 为 marked v15.0.12（无内置消毒器）；`dist/assets/content.js` 中 `DOMPurify` 出现次数为 **0**——它只被打进 `side_panel.js`。

**影响**：模型输出中的 `<img src=x onerror="...">` 之类载荷，通过 `innerHTML` 插入后会**在宿主页面的主世界执行**（内联事件处理器由页面世界编译），可读取该站点 Cookie、以用户身份发起请求、读取页面 DOM。触发路径现实存在：用户对含有提示注入的网页执行「总结 / 翻译 / 解释」，模型回显恶意 HTML 即可命中。

**修复建议**（二选一，成本都很低）：

1. 内容脚本引入 DOMPurify：在 `content` 打包入口 `import DOMPurify from 'dompurify'`，包内统一封装 `safeMarkdown(text)`，把上述 4 处 `marked.parse(...)` 全部替换；
2. 或退化为纯文本渲染（`escapeHtml(text).replace(/\n/g, '<br>')`）——注意代码块高亮会丢失，不推荐。

> 相关：`escapeHtml` 已存在于 `src/content/selection-toolbar.js:987`，且 `:792` 的追问建议已正确转义，说明只需补齐正文路径。

---

### SEC-02【严重】本地命令执行的"确认"由模型自答，用户不被询问

**现象**：`agent_exec` 可在用户机器上执行任意 shell 命令，但该工具未标记为需确认，且唯一的"灰名单确认"回合可以被模型自己用 `force: true` 跳过。

**证据链**：

```js
// 1) 工具定义：不要求确认
// src/background/tools/agent-tools.js:53
{ id: 'agent_exec', ... requiresConfirmation: false,
  function: { name: 'agent_exec', description: 'Execute a shell command on the agent machine...',
    parameters: { properties: { command: {...}, cwd: {...},
      force: { type: 'boolean', description: 'Force execute confirmed command' }, ... } } } }

// 2) 扩展侧：force 直接透传给 Agent
// src/background/tool-executor.js:3764
const effectiveForce = !!force || !config.reactConfig.toolConfirmationEnabled;
// :3774
const initResult = await AgentClient.execCommand(command, cwd, effectiveForce);

// 3) Agent 侧：force 跳过灰名单
// agent/src/security.js:344
if (force) { return { safe: true, level: 'allow' }; }

// 4) 灰名单命中时，只把一句话交还给模型
// src/background/tool-executor.js:3786-3795
if (initResult.level === 'confirm') {
  return { success: true, level: 'confirm',
    message: t('toolExec.commandNeedConfirm', { reason: initResult.reason, command }), ... };
}
```

**关键问题**：

- 全仓库 `src/side_panel/` 中检索 `commandNeedConfirm` **无任何命中**——没有 UI 承接这个确认回合，用户全程不被询问。
- `reactConfig.toolConfirmationEnabled` 开关（默认 `true`，见 `src/background/constants.js:18`）在 `src/background/react-loop.js:1220` 只对 `requiresConfirmation: true` 的工具生效，而 `agent_exec` 恰为 `false` ——**该开关对最危险的操作无效**。
- 黑名单是命令字符串正则（`agent/src/security.js:232-268`），仅能拦截形如 `rm -rf /` 的明显写法；`echo ... | base64 -d | sh`、`bash -c "..."` 等常规绕过不在其中。

**影响**：一次提示注入即可在用户机器上执行任意命令，且用户看不到任何确认提示。这是本项目风险最高的设计缺口。

**修复建议**：

1. `level === 'confirm'` 必须上抛到侧边栏 UI，走与 `CONFIRMATION_REQUIRED_TOOLS` 相同的人工确认通道；
2. `force` 只允许由**用户交互**置位（例如用户在确认弹窗点击后，由后台在短时间内自行补上），不接受模型传入；
3. 将 `agent_exec` 纳入 `requiresConfirmation: true`，使 `toolConfirmationEnabled` 开关能真正覆盖它。

---

### SEC-03【严重】`fetch_url`：无确认的 SSRF 与外泄原语

**证据**：

```js
// src/background/tools/storage-tools.js:71-92  定义
{ id: 'fetch_url', requiresConfirmation: false, ...
  parameters: { properties: { url: {...}, method: {...}, headers: {...}, body: {...}, timeout: {...} } } }

// src/background/tool-executor.js:2456-2502  实现
export async function executeFetchUrl(args, toolCallId) {
  const { url, method = 'GET', headers = {}, body, timeout = 15000 } = args;
  ...
  try { new URL(url); } catch (e) { /* 仅做格式校验 */ }
  ...
  console.log('[Background] fetch options:', JSON.stringify(fetchOptions));   // :2501 日志
  const response = await fetchWithRetry(url, fetchOptions, timeout, 1);
```

**影响**：

- 后台 SW 持有 `<all_urls>` 主机权限，其 `fetch` **不受页面 CORS 约束**——这是一个完整跨域请求原语，可探测本机与内网服务（`127.0.0.1:*`、路由器后台、内网 API），请求结果回流给模型。
- 与网页提示注入组合，构成标准的"读页面 → POST 到任意外部地址"外泄链，全程无需用户确认。
- `:2501` 的日志会把模型传入的 `Authorization` 等敏感请求头**明文写入控制台日志**。

**修复建议**：

1. `fetch_url` 纳入确认流程（至少对非 GET、或目标非常见域名时）；
2. 增加目标校验：拒绝私有网段 / 回环 / 非 `http(s)` 协议（可参考 `agent/src/skill/markdown-loader.js:316-360` 已实现的私网拦截逻辑，直接复用其判定）；
3. 删除或降级 `:2501` 的请求体日志（至少屏蔽 `authorization`、`cookie`、`x-api-key` 等键）。

---

### SEC-04【高】`debug_page` 抓包将认证凭据送入模型上下文

**证据**：

```js
// src/background/tools/debugger-tools.js:14
{ id: 'debug_page', requiresConfirmation: false, confirmationActions: ['attach'], ... }
// 仅 attach 动作需确认，network 动作不需要

// src/background/debugger/debugger-rules.js:126-144（注释明确说明是有意为之）
// "headers 对调试场景（Authorization / Cookie / CORS）恰恰最有价值 … 故完整暴露"
requestHeaders: e.requestHeaders,
responseHeaders: e.responseHeaders,
postData: e.postData,
body: e.body,
```

**影响**：任意被调试页面的会话凭据（`Authorization`、`Cookie`）、表单明文会随工具结果进入第三方模型上下文。调试场景下这是有意的取舍，但应当由用户显式开启，而不是默认随 `debug_page` 的普通抓包动作发生。

**修复建议**：将凭据类 header 默认脱敏（保留键名、值为 `***`），提供"包含敏感头"的显式开关；或将 `network` 动作纳入确认。

---

### SEC-05【高】内容脚本 message 监听无 origin/source 校验

**证据**：

```js
// src/content/selection-toolbar.js:2129-2167
window.addEventListener('message', (event) => {
  // 处理来自子 iframe 的选区消息
  if (event.data?.type === 'IFRAME_SELECTION' && isTopFrame) {
    if (isResultVisible) { ... return; }
    currentSelectedText = event.data.text;        // 无 origin / source 校验，直接采信
    let adjX = event.data.x;
    let adjY = event.data.y;
    ...
    if (currentSelectedText && currentSelectedText.length >= 2) {
      showToolbar(adjX, adjY);                    // 可被外部驱动弹出工具栏
    }
    return;
  }
  if (event.data?.type === 'IFRAME_CLICK_DISMISS' && isTopFrame) { ... }
});
```

发送侧使用 `targetOrigin: '*'`（`:1359, 1388, 1478`）。

**影响**：任何内嵌 iframe（广告、第三方组件、被注入的脚本）都能 `window.parent.postMessage({type:'IFRAME_SELECTION', text, x, y})` 到顶层，从而：伪造选区文本、按指定坐标弹出工具栏（UI 重定向）。用户随后点击「翻译 / 解释」，被处理的即是攻击者指定的内容。

**修复建议**：校验 `event.source === window.parent`（子 frame → 父 frame 的合法来源）与 `event.origin` 白名单；发送侧把 `targetOrigin: '*'` 收敛为父窗口实际 origin。

> 说明：这是 [docs/RESEARCH_REPORT.md](RESEARCH_REPORT.md) 中 C3（"恶意页面可能通过 postMessage 间接触发 content script"）的**具体落点**，且其影响范围限定在工具栏 UI 与选区内容。运行时消息通道本身未受影响——manifest 未声明 `externally_connectable`，网页无法直连 Background。

---

### SEC-06【高】Agent `/api/shutdown` 回环免认证

**证据**：

```js
// agent/src/server.js:488-504
if (req.method === 'POST' && pathname === '/api/shutdown') {
  const remoteIp = req.socket.remoteAddress || '';
  const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1'
               || remoteIp === '::ffff:127.0.0.1' || remoteIp === 'localhost';
  if (!isLocal) {
    // 远程来源才走 Bearer 校验
  }
  ...
  setTimeout(() => shutdown(), 200);
```

**影响**：网页发出的请求源 IP 也是回环，且 `POST` 属简单请求（无需 CORS 预检），因此**任意网页都能关停用户的本地 Agent**。CORS 只阻止了响应读取，并不阻止副作用（`agent/src/server.js:238-244` 的 `getAllowedOrigin` 只对 `chrome-extension://` 反射）。

当前危害为 DoS（打断正在执行的命令/任务）。但"按来源 IP 免认证"这一模式本身是隐患：若后续在该分支追加更多接口，会直接放大为远程可控。

**修复建议**：改为 CLI 专用 token（写入 `~/.ai-helper-agent/` 下权限 0600 的文件，CLI 与扩展各持一份），或至少要求一个仅本机文件可读的一次性密钥。

---

### SEC-07【高】敏感数据明文落盘与凭据入 URL

| 数据 | 位置 | 说明 |
|---|---|---|
| API Key（主 + 视觉） | `src/options/config-manager.js:1257-1274`、`src/options/index.js:796` | 明文存 `chrome.storage.local`；读取见 `src/background/config.js:11-22` |
| 配置导出 | `src/options/config-io.js:40` | `SECRET_KEYS = ['apiKey', 'imageApiKey', 'agentToken']`，勾选后密钥写入 JSON 文件 |
| Agent 配对 token | `agent/src/config.js:203-217` | 明文写 `~/.ai-helper-agent/pairings.json`，**未设置 0600 权限** |
| WS 认证 token | `src/background/local-agent-client.js:674-678` | 拼在 URL query 中（`ws://` 明文传输） |

Agent 自身已注意到 query token 的风险（`agent/src/server.js:2009-2011` 注释）；`chrome.storage.local` 明文存储在扩展模型中属固有约束，但应至少：

1. 为 `pairings.json` 设置 0600 权限；
2. WS 握手改用首帧鉴权或 `Sec-WebSocket-Protocol` 子协议传 token，避免落入代理日志 / Referer；
3. 导出配置时对密钥做二次强提示（当前仅有复选框）。

---

### SEC-08【高】整页 `innerHTML` 重写做高亮

**证据**：

```js
// src/content/page-extract.js:747, 801
const escaped2 = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
document.body.innerHTML = document.body.innerHTML.replace(
  new RegExp(escaped2, flags2),
  '<span class="ai-helper-search-highlight">$&</span>'
);
```

**影响**：

- **功能性**：重写 `body` 会摧毁页面上所有事件监听、表单输入状态、播放中的媒体、iframe 与 Canvas 内容——SPA 页面基本直接失活。这是用户可直接感知的破坏性行为。
- **安全性**：若 pattern 命中 `<script>` 内容或属性值内部，注入 `<span>` 会改变原有语义（例如把脚本里的字符串切断、在属性中插入标签）。

**修复建议**：改用 `Range` + `CSS Custom Highlight API`（`::highlight()`），或仅遍历文本节点做包裹，不触碰页面结构外层。

---

### SEC-09【中】背景消息无来源校验（纵深防御）

```js
// src/background/index.js:741
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 全仓库检索：无 sender.id / sender.origin 断言，仅使用 sender.tab / sender.frameId
```

**相关度修正**：`manifest.json` 未声明 `externally_connectable`，因此网页与其他扩展**无法**直接向本扩展 Background 发消息。该问题当前是纵深防御缺口，而非活跃漏洞——与 [docs/RESEARCH_REPORT.md](RESEARCH_REPORT.md) 中 C3 的表述强度不同。仍建议在监听入口加一行 `if (sender.id !== chrome.runtime.id) return;`。

---

### SEC-10【中】模型可向宿主页面注入任意 CSS

```js
// src/content/advanced-tools.js:384-399
// injectCss: 将 LLM 提供的 CSS 写入 <style> 并 append 到宿主页面 head
```

**影响**：可用于遮蔽页面真实内容、叠加伪造的登录框等（钓鱼配合社工），属低烈度但真实的滥用面。

**修复建议**：限制注入范围（作用域收敛到扩展自身面板的 Shadow DOM），或至少对 `position: fixed` + 全屏尺寸这类规则做提示。

---

### SEC-11【中】审计日志 detail 未转义

```js
// src/side_panel/index.js:3650
auditLogList.innerHTML = entries.map(...)   // entry.action / category / level 未转义
// detail 由 :3571-3581 原样拼接：parts.push(`${key}: ${display}`)
```

虽为扩展自产数据、当前不可被外部控制，但审计日志天然会记录"来自页面的输入"，建议统一转义，避免未来某天成为注入点。

---

### SEC-12【中】依赖已知漏洞

| 依赖 | 版本 | 问题 | 处置 |
|---|---|---|---|
| `xlsx` | 0.18.5 | CVE-2023-30533（原型污染）、CVE-2024-22363（ReDoS） | npm registry 上 0.18.5 即为最后一版，需改用 SheetJS 官方源 ≥ 0.20.2，或替换为其他库 |
| `pdfjs-dist` | 3.11.174 | CVE-2024-4367（恶意 PDF 经字体矩阵执行 JS） | **已被 MV3 CSP 的 `script-src 'self'` 阻断 eval 而缓解**；仍建议补 `isEvalSupported: false`（`src/side_panel/file-extract.js:114`、`src/side_panel/workspace-panel.js:2193`）作为纵深防御 |

其余依赖（`dompurify@3.4.13`、`docx@9.7.1`、`mammoth@1.12.1`）未发现已知高危问题。

---

### SEC-13【低】生产构建随包发布 sourcemap

`vite.config.js` 中 `sourcemap: true` 未按环境区分，实测发布产物包含 `side_panel.js.map`（3,678,566 B）、`background.js.map`（895,133 B）等。对开源项目不构成机密泄露，但显著增大安装包体积、影响上架审核观感。建议生产构建关闭（或改 `hidden` 并仅在内部调试构建启用）。

### SEC-14【低】无效的内联事件处理器

`src/side_panel/agent-at-selector.js:553` 拼出 `<img ... onerror="this.style.display='none'">`。扩展页 CSP（`script-src 'self'`，无 `unsafe-inline`）会拦截内联处理器，该写法不生效。建议改为 `addEventListener('error', ...)` 或直接移除。

### 安全方面做得对的部分（勿改动）

- 扩展页 CSP 无 `unsafe-eval` / `unsafe-inline`；`options.html`、`side_panel.html` 中无内联脚本
- 未声明 `externally_connectable`，网页无法直连 Background
- 全仓库无 `eval` / `new Function` / 字符串形式 `setTimeout`（仅第三方 minified 库内部使用）
- 无硬编码密钥（含 Git 历史检索），无遥测 / 分析 SDK
- `agent/src/security.js:109-228` `checkPath` 具备 `realpath` 复检，可防符号链接穿越；硬阻断列表覆盖 `config.json`、`pairings.json`、`logs/` 等
- `agent/src/skill/markdown-loader.js:316-360` 的 SSRF 防护（私网段 + DNS 复检）实现完整
- 配对流程：6 位码 30 s 轮换、一次性使用、5 次失败锁定 60 s；token 为 `crypto.randomBytes(32)`
- UI 原型预览 iframe 使用 `sandbox="allow-scripts"`（未给 `allow-same-origin`，`src/side_panel/ui-prototype.js:94`）
- 后台的 `chrome.scripting.executeScript` 仅用 `files:` / `func:`，无 `code:` 字符串注入

---

## 四、性能问题

### PERF-01【严重】构建脚本向每个 iframe 注入约 1.93 MB 脚本

**证据**：

```js
// scripts/fix-build.js:195-207
const libFiles = fs.existsSync(libsDir)
  ? fs.readdirSync(libsDir)
      .filter(f => f.endsWith('.js') && f !== 'mermaid.min.js')   // 只排除 mermaid
      .map(f => `libs/${f}`)
  : [];
manifest.content_scripts[0].js = [ ...libFiles, `assets/content-iife.js` ];
```

`dist/manifest.json` 实测结果（`all_frames: true` + `<all_urls>` 生效）：

| 文件 | 大小 |
|---|---|
| `libs/pdf.worker.min.js` | 1,087,212 B |
| `libs/jspdf.min.js` | 365,730 B |
| `libs/html2canvas.min.js` | 198,689 B |
| `libs/marked.min.js` | 39,903 B |
| `libs/qrcode.min.js` | 23,738 B |
| `assets/content.js` | 216,083 B |
| **合计** | **≈ 1.93 MB** |

**问题**：`pdf.worker.min.js` 被当作普通页面脚本加载（它本应是 Worker 脚本）；`jspdf`、`html2canvas` 只在用户主动导出时才需要。这些内容会在**每个页面、每个 iframe** 中解析执行。

**修复建议**：改显式白名单，`content_scripts` 只保留 `marked.min.js` + `qrcode.min.js`；`pdf.worker` / `jspdf` / `html2canvas` 改由 `chrome.scripting.executeScript({ files })` 在功能触发时按需注入（相关调用点已有现成模式：`src/background/tool-helpers.js:385-402`）。预计每个页面减少约 1.7 MB 的解析量。

---

### PERF-02【严重】流式渲染每约 30 ms 全量重解析 + 整段替换

**证据链**：

```js
// src/background/constants.js:56
streamChunkDelay: 30,                    // ≈ 33 次/秒

// src/side_panel/chat-manager.js:3268-3279
_streamedContent += message.delta;
setStreamedContent(...);
if (_se().isConnected) updateStreamingMessage(_se(), _streamedContent);

// src/side_panel/chat-streaming.js:764
function updateStreamingMessage(element, fullContent) {
  ...
  wrapper.innerHTML = formatMessageContent(fullContent);   // 全量重建
}

// src/side_panel/markdown-render.js:682 → 350 → 386 → 396
// formatMessageContent → formatMarkdown → marked.parse(整段) → DOMPurify.sanitize(整段)
```

**影响**：复杂度为 **O(已生成长度) × 33 / 秒**，长回答下是明显的 CPU 与 GC 压力源（每帧都要重建整段 DOM 子树）。

**修复建议**：

1. 流式期间只渲染"最后一个未闭合块"，或降低节流频率至 100–150 ms；
2. 流结束（`finalizeStreamingMessage`）时再做一次完整渲染——该时机已存在，改动面可控。

---

### PERF-03【高】内容脚本每帧常驻开销

`src/content/selection-toolbar.js:2116-2195` 在 `document_idle` 无条件执行：

- `injectStyles()` 注入 17,785 B CSS（`src/content/selection-toolbar-styles.js:8`）
- `createToolbar()` / `createResultPanel()` 构建隐藏 DOM
- `loadToggleState()` → `chrome.storage.local.get(...)`（`:2063`）
- 注册 `selectionchange` / `click` / `mouseup` / `scroll` / `resize` / `message` 共 6+ 监听
- 顶层 frame 额外挂 `MutationObserver(document.body, { childList: true, subtree: true })`，**每次 DOM 变更都重绑一次选区监听**：

```js
// :2191-2195
const mutationObserver = new MutationObserver(() => {
  removeSelectionListeners(shadowSelectionListeners);
  shadowSelectionListeners = attachSelectionListeners(onSelectionChange);  // 内部遍历至多 5 层 shadow root
});
mutationObserver.observe(document.body, { childList: true, subtree: true });
```

**修复建议**：内容脚本改为"首次选中/首次交互后才初始化"（事件委托 + 懒加载工具栏资源）；MutationObserver 增加节流（如 300 ms 防抖）并仅在 shadow root 数量变化时重绑。

---

### PERF-04【高】滚动即写存储

```js
// src/side_panel/index.js:3432-3435
chatContainerEl.addEventListener('scroll', () => {
  const key = 'scrollPosition_' + (state.activeSessionId || 'default');
  chrome.storage.local.set({ [key]: chatContainerEl.scrollTop });
});
```

无节流/防抖。流式输出时自动吸底会持续触发，形成高频 IPC + 磁盘写。

**修复建议**：`requestIdleCallback` 或 300–500 ms 防抖，并在会话切换 / `visibilitychange` 时落盘一次。

---

### PERF-05【高】`docx` 静态进主包

```js
// src/side_panel/chat-export.js:32-36
import { Document, Packer, Paragraph, ... } from 'docx';
```

实测 `dist/assets/side_panel.js` 为 **1,109,115 B（1.11 MB）**单 chunk，sourcemap 的 `sources` 中可见 `node_modules/docx`。而其余重依赖（`pdfjs-dist`、`xlsx`、`mammoth`、`@jvmr/pptx-to-html`）都已正确懒加载，产物中可见 `pdf-*.js`(305 KB)、`xlsx-*.js`(424 KB)、`lib-*.js`(401 KB)、`jszip.min-*.js`(96 KB) 独立 chunk。

**修复建议**：将 `docx` 改为动态 `import()`，与其它导出格式保持一致。预计主包减少 300–400 KB。

---

### PERF-06【高】预览面板监听泄漏

`src/side_panel/workspace-panel.js` 中 `previewPdf`（`:2365, 2373, 2411`）与 `previewImage`（`:3017, 3025, 3061`）每次打开预览都向 `window` 添加 `mousemove` / `mouseup` / `resize`，**无对应 `removeEventListener`**。反复预览同一文件会持续累积处理器。

**修复建议**：改为 `{ once: true }`（临时性处理器）或在预览关闭时统一清理；建议在模块内维护一个 `cleanupPreviewHandlers()`。

---

### PERF-07【中】Service Worker 常开保活

```js
// src/background/index.js
setInterval(performAgentHealthCheck, 30000);        // :1970
setInterval(performAgentHeartbeat, 60 * 1000);      // :2017
startAgentHealthCheck();                            // :2028 模块顶层调用
_startAutoReconnect()                                // :1871-1901，最长 20 次 × 15 s 重连
```

两个周期定时器使 MV3 Worker 无法进入空闲回收，长期占用常驻内存（此前已出现过保活的连锁问题）。

**修复建议**：改用 `chrome.alarms`（MV3 推荐，可由浏览器调度并在 SW 冷启动后恢复），心跳仅在用户主动使用 Agent 时启用，空闲 N 分钟后关闭。

---

### PERF-08【中】统计与审计的写放大

```js
// src/background/tool-executor.js:1332-1347（recordToolStats）
// 每次工具执行：get('toolUsageStats') → 改 → set(整个对象)

// :637-645（appendAuditLog, MAX_AUDIT_ENTRIES = 100）
// 每次敏感操作：读出数组 → push → slice → 整写回
```

调用点：`recordToolStats` 在 `:1832`；`appendAuditLog` 在 `:2943, 3164, 3583, 3619, 3669, 4051, 4067, 4094, 4177`。

**修复建议**：内存中聚合 + 定时（如 5 s 防抖/页面空闲）落盘；审计日志改追加式写入或迁移到 IndexedDB。

---

### PERF-09【中】Token 统计无界增长

`src/storage/token-store.js`：`recordTokenCall` 无 TTL / 轮转；`getOverallTokenSummary`、`getRecentTokenRecords`、`getTokenSummaryByModel`、`getTokenSummaryByCallType` 均通过 `store.getAll()` 全表扫描（仅 `getSessionTokenSummary` 走了 sessionId 索引）。随使用时长线性劣化。

**修复建议**：按天预聚合 + 明细保留期（如 30 天）；聚合查询走索引或缓存。

---

### PERF-10 / 11 / 12【中低】

| 项 | 位置 | 说明与建议 |
|---|---|---|
| 全 Panel DOM 扫描 | `src/side_panel/markdown-render.js:1227, 1314` | `addCodeCopyButtons` / `addTableToolbarEvents` 用 `document.querySelectorAll` 全量扫描并重绑；调用点见 `chat-streaming.js:1047, 1220, 2038`。建议改为事件委托 |
| DOM 属性膨胀 | `src/side_panel/chat-streaming.js:2045` | `element.dataset.htmlContent = element.outerHTML` + `dataset.executionLog = JSON.stringify(...)`，把整段 HTML/日志复制进属性。建议改存 JS Map |
| 轮询开销 | `src/side_panel/index.js:1303-1349`（3 s 恢复轮询）、`:2122-2144`（500 ms 选区检测） | 均有上限/清理，属可接受范围；建议选区检测改为事件驱动 |
| 重复的 onMessage 注册 | `src/options/index.js:178, 1920`、`src/side_panel/schedule-panel.js:641, 650` | 同一模块注册两次监听，建议合并 |

---

## 五、其他优化空间（可维护性）

1. **统一消毒出口**：目前内容脚本与侧边栏是两套渲染路径（且只有后者安全）。建议抽出 `src/shared/safe-html.js`，暴露 `safeMarkdown(text)` / `escapeHtml(text)`，两端共用——既修 SEC-01，也防止未来再次分裂。
2. **建立工具风险分级**：把"是否需确认"从布尔字段升级为 `read-only / write / dangerous` 三档，凡 `dangerous` 强制走 UI 人工确认（SEC-02 的根治方案，也能避免再次遗漏新工具）。
3. **巨型文件拆分**（已知 H1）：`workspace-panel.js` 6418 行、`tool-executor.js` 4604 行、`side_panel/index.js` 4332 行、`chat-manager.js` 3662 行。建议 `tool-executor` 按工具类别拆、`workspace-panel` 按"文件树 / 上传下载 / 预览 / Q&A"拆。
4. **测试覆盖**（已知 H2）：13 个测试文件对 90+ 源文件，核心链路（ReAct 循环、消息路由、工具调度）无单测。建议优先补 SEC-01/02 修复对应的回归测试。
5. **权限收敛**（已知 H3）：`debugger` + `cookies` + `<all_urls>` + `unlimitedStorage` 同时申请，上架审核与用户信任成本高。可考虑将 `cookies`、`history` 等改为 `optional_permissions` 按需申请。
6. **HTML 入口文件体积**：`side_panel.html` 91 KB、`options.html` 48 KB，建议抽取内联样式到独立 CSS。

---

## 六、建议修复顺序

| 顺序 | 动作 | 解决 | 预估成本 |
|---|---|---|---|
| 1 | 内容脚本引入 DOMPurify，统一 `safeMarkdown()` 出口 | SEC-01 | 小（1–2 h） |
| 2 | `fix-build.js` 注入改白名单，重库改按需注入 | PERF-01 | 小（1–2 h，收益最大） |
| 3 | `agent_exec` 的 confirm 改由 UI 承接；`force` 不接受模型传参；纳入 `requiresConfirmation` | SEC-02 | 中（0.5–1 d） |
| 4 | `fetch_url` / `debug_page(network)` 纳入确认；清理 `:2501` 日志；`fetch_url` 加私网拦截 | SEC-03、SEC-04 | 中（0.5 d） |
| 5 | `postMessage` 加 origin/source 校验；`/api/shutdown` 收回环豁免 | SEC-05、SEC-06 | 小（2–3 h） |
| 6 | 流式渲染增量化或降频 | PERF-02 | 中（0.5 d） |
| 7 | `docx` 改动态 import；预览监听清理；滚动写存储加防抖 | PERF-05/06/04 | 小（2–3 h） |
| 8 | `xlsx` 升级/替换；`pdfjs` 加 `isEvalSupported: false` | SEC-12 | 中（依赖替换需回归） |

第 1、2 项互相独立、风险低，建议先行落地并各自补一条回归测试。

---

## 七、与既有调研报告的关系

| 本报告条目 | 与 [RESEARCH_REPORT.md](RESEARCH_REPORT.md) 的关系 |
|---|---|
| SEC-01 | **新增**。该报告 M1 认为 Markdown 渲染"已经 DOMPurify 清洗"——该结论**不成立**：仅侧边栏成立，内容脚本 4 处渲染点未消毒 |
| SEC-02 | **新增**。报告中未涉及命令执行的确认机制 |
| SEC-03 / SEC-04 | **新增**。报告中未涉及 `fetch_url`、`debug_page` 的数据外发面 |
| SEC-05 | **新增**，是报告 C3 的具体落点；影响范围限定在工具栏 UI |
| SEC-06 | **新增** |
| SEC-07 | 补充 C2（明文存储），新增配对文件权限与 WS token in URL |
| SEC-09 | 对报告 C3 的**严重度修正**：未声明 `externally_connectable`，当前为纵深防御缺口而非活跃漏洞 |
| SEC-12 | 与报告 C1 一致（`xlsx`）；新增 `pdfjs-dist` 条目及其 CSP 缓解说明 |
| SEC-13 | 修正报告 L2"无 sourcemap 配置确认"——实际是 `sourcemap: true` 且已发布 |
| PERF-01 | **新增且重要**。报告 H5 只提到 marked + qrcode，实际构建注入 6 个文件约 1.93 MB |
| PERF-02 / 04 / 06 / 07 / 08 / 09 | **新增** |
| PERF-05 | 补充：报告未指出 docx 是唯一静态进主包的重依赖 |
| 已知项 | 巨型文件（H1）、测试覆盖（H2）、权限过宽（H3）、渲染无虚拟化（H4）、IndexedDB 无加密（M2）仍成立，本报告未重复展开 |

---

## 八、附录：验证方法

可在本仓库直接复现关键结论：

```bash
# SEC-01：内容脚本产物中确认无 DOMPurify
grep -c "DOMPurify" dist/assets/content.js            # 期望输出 0
grep -c "DOMPurify" dist/assets/side_panel.js         # 期望输出 > 0

# SEC-01：定位未消毒的渲染点
grep -n "marked.parse" src/content/selection-toolbar.js

# SEC-02：确认确认环节无 UI 承接
grep -rn "commandNeedConfirm" src/side_panel/          # 期望无输出
grep -n "effectiveForce" src/background/tool-executor.js

# PERF-01：查看实际注入内容脚本列表
python3 -c "import json;print(json.load(open('dist/manifest.json'))['content_scripts'])"
ls -la dist/libs/

# PERF-05：主包体积与 docx 归属
ls -la dist/assets/side_panel.js
grep -c "docx" dist/assets/side_panel.js.map

# SEC-13：sourcemap 是否随包
ls -la dist/assets/*.map
```

---

## 九、审计局限

1. **未做运行时验证**：所有结论基于静态代码与构建产物，未在真实浏览器中构造 PoC 验证 SEC-01/SEC-05 的可利用性（结论的定性判断基于 Chrome 扩展的隔离世界模型与 CSP 语义）。
2. **未做性能剖析**：PERF-* 结论来自代码路径分析（复杂度与调用频率），非实测火焰图/内存快照。建议对 PERF-01/02 用 DevTools Performance 面板做一次基线对比。
3. **未覆盖**：第三方 MCP server 的行为、Agent 服务的模糊测试、`test/` 中既有用例的失效情况、多语言资源完整性。
4. **版本时效**：依赖漏洞结论基于 2026-09-24 的版本号，处置前建议重新核对官方公告。
