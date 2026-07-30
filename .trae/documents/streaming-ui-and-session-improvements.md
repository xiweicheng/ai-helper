# 流式输出与对话交互优化方案

## Context

针对用户提出的 8 项需求做统一规划：流式输出折叠头节点筛选、拖拽图片转截图模式、截图工具误调用、AI 回答完成后回顶、工具执行默认折叠、会话/编辑快捷键、消息级分叉、skill 工具描述增强。

目标：让流式输出更精简可控、图片/工具调用更准确、对话操作更高效，同时遵守项目硬性约束（修改后 `npm run build:silent`、禁用原生弹窗用 `showCustomConfirm`、消息唯一 messageId）。

## 已确认的设计决策
- 快捷键：`Alt+N` 新建会话 / `Alt+W` 关闭当前会话 / `Alt+E` 编辑最近一条用户消息
- 未启用图片识别时拖拽图片：回退为文件附件 + toast 提示（不丢弃）
- AI 回答回顶：尊重用户手动滚动，不强制（用户在流式中主动上滚则完成后不强制回顶）
- 分叉：直接分叉，无需二次确认

---

## 任务1：折叠头节点数点击筛选

### 改动文件
- `src/side_panel/chat-streaming.js`（statsHtml 渲染 L869-886 / L1024-1041；processHeader 点击 L984-987 / 非 ReAct 对应处；appendToolResult 标记状态 L611-726）
- `src/side_panel/chat-manager.js`（rebindAllMessages 重绑思考头点击）
- 流式样式文件（筛选态高亮）

### 实现
1. **statsHtml 加可点击属性**：三个 `.thinking-process-stat` 分别加 `data-filter="all|success|failed"` 和 `role="button"`。
2. **工具卡片标记状态**：`appendToolResult` 中 L622 拿到 `result.success` 后，同步 `card.dataset.status = result.success ? 'success' : 'failed'`（preselect-card 已有 status 逻辑，L737）。
3. **点击区域区分**：抽公共函数 `bindProcessHeaderClick(header, processHistory, processContent)`：
   - 命中 `.thinking-process-stat` → `e.stopPropagation()`，读 `data-filter` 调 `applyFilter`，不折叠
   - 否则 → `processHistory.classList.toggle('collapsed')`（原逻辑）
   - 跳过 `e.ctrlKey||e.metaKey`（与 rebind 复制逻辑兼容）
4. **applyFilter**：
   - `filter==='all'` → 所有 `.tool-call-item` display 还原
   - 否则 → `item.style.display = (item.dataset.status===filter) ? '' : 'none'`
   - `preselect-card`、`thinking-badge`、`thinking-content` 始终保留（非工具节点）
5. **选中态**：`processHistory.dataset.activeFilter = filter`，CSS `[data-active-filter="success"] .thinking-process-stat[data-filter="success"]` 加高亮底色/边框。折叠再展开保持筛选（存 dataset）。
6. **rebindAllMessages**：复用 `bindProcessHeaderClick`，从 `processHistory.dataset.activeFilter` 恢复高亮与 display。

### 边界
- nodeCount===0 时无统计，无筛选入口。
- api_call 节点无 DOM，筛选只对存在的 tool-call-item 生效（可接受）。
- 切换会话后 rebind 重建，需从 dataset 恢复筛选态。

---

## 任务2：拖拽图片转截图问答模式

### 改动文件
- `src/side_panel/index.js`（drop 事件 L2844-2869）

### 实现
将 drop 处理函数改为 async，L2865-2869 系统文件分支按 MIME 拆分：
```
const files = Array.from(e.dataTransfer.files);
if (files.length > 0) {
  const images = files.filter(f => f.type.startsWith('image/'));
  const others = files.filter(f => !f.type.startsWith('image/'));
  if (images.length > 0) {
    if (state.enableImageInput) {
      for (const img of images) await compressAndAttachImage(img);
    } else {
      showToast('未启用图片识别，图片已作为文件附件处理');
      attachFiles(images);   // 回退文件问答
    }
  }
  if (others.length > 0) attachFiles(others);
}
```
- `compressAndAttachImage` 已 import（paste 路径在用，来自 `./image-preview.js`）。
- `preventDefault`/`stopPropagation` 已在 L2845-2848 开头执行，改 async 不影响。

### 边界
- 混合拖拽（图片+其他文件）分别走两条路径。
- 非 image/* MIME 但实为图片（.heic 等）走 attachFiles，可接受。

---

## 任务3：截图工具误调用 + 工具描述增强

### 改动文件
- `src/background/tools/media-tools.js`（capture_page description L100）

### 实现
capture_page description（L100）由 `'页面截图'` 增强为：
```
'截取当前活动标签页页面截图（用于下载或视觉分析）。仅当需要查看当前页面内容时使用。若用户消息已附带图片(image_url)，应直接分析用户提供的图片，不要调用本工具。'
```
- 图片消息格式已正确：`{type:'image_url', image_url:{url}}`（chat-manager.js L1305）。
- 若公司模型本身不支持 vision，描述增强只能减少误调用，无法让它真正识图——属模型能力限制，需在汇报中说明。

### 边界
- 不批量膨胀其他工具描述（控制 token）。
- tool-executor.js 中 capture_page action 枚举随 vision 开关动态调整的逻辑不受影响。

---

## 任务4：AI 回答完成后回到答案顶部（尊重用户滚动）

### 改动文件
- `src/side_panel/chat-streaming.js`（finalizeStreamingMessage 末尾 L1408-1417；流式滚动处 L342-349 / L579-586 / L710-717）

### 实现
1. **程序滚动标志**：在 L342/L579/L710 三处设 `scrollTop=scrollHeight` 前，置 `chatContainer._isProgramScroll = true`，`requestAnimationFrame` 后置 false。
2. **用户滚动检测**：chatContainer scroll 事件中，若 `!_isProgramScroll` 且距底部 > 80px，置 `chatContainer.dataset.userScrolled = '1'`。
3. **finalize 末尾**（L1416 后）：
   ```
   requestAnimationFrame(() => {
     if (chatContainer.dataset.userScrolled !== '1') {
       element.scrollIntoView({ behavior: 'smooth', block: 'start' });
     }
     delete chatContainer.dataset.userScrolled;
   });
   ```
4. 短回答保护：仅当 `element.offsetHeight > chatContainer.clientHeight * 0.6` 才滚动（避免短消息突兀跳动）。

### 边界
- mermaid 异步渲染（L1411）可能改变高度，rAF 内滚动一次即可，不重复。
- 切换会话恢复历史走 rebind/restore，不触发 finalize，不受影响。

---

## 任务5：工具默认折叠 + 输入输出统一折叠 + 配置开关

### 改动文件
- `options.html`（L292 streamEnabled 区块后插入联动开关）
- `src/options/config-manager.js`（读取 L1132 附近、保存 L1208 附近、开关联动）
- `src/side_panel/chat-streaming.js`（appendToolCallItems L503；appendToolResult L704）
- `src/side_panel/utils.js`（loadChatConfig 读取 streamExpandTools → state.chatConfig）
- 样式文件（联动隐藏）

### 实现
**(A) 配置开关**
- options.html L292 后插入：
  ```
  <div class="react-config-item" id="streamExpandToolsWrap" style="margin-left:24px">
    <label>流式工具卡片默认展开 <span class="hint-text">（关闭则工具卡片默认折叠，仅显示标题）</span></label>
    <label class="toggle-label">
      <input type="checkbox" id="streamExpandTools">
      <span class="toggle-switch"></span>
      <span id="streamExpandToolsLabel">已禁用</span>
    </label>
  </div>
  ```
- 默认不勾选 = 默认折叠。config-manager.js：streamEnabled change 事件联动显隐 `streamExpandToolsWrap`；初始加载同步。读取 `streamExpandTools`，保存到 chrome.storage.local。
- utils.js loadChatConfig 读到 `state.chatConfig.streamExpandTools`。

**(B) 工具卡片默认折叠**
- appendToolCallItems L503：`item.className = 'tool-call-item' + (state.chatConfig?.streamExpandTools ? ' expanded' : '')`。
- 执行中（无 has-result）保持创建时的状态；不在 appendToolResult 完成时强制收起（避免打断查看）。

**(C) 输出移入 body 统一折叠**
- appendToolResult L704 `card.appendChild(resultDiv)` 改为：
  ```
  const body = card.querySelector('.tool-call-body');
  (body || card).appendChild(resultDiv);
  ```
- 确认 CSS `.tool-call-item:not(.expanded) .tool-call-body { display:none }` 生效，使折叠时输入输出都隐藏。检查 `.tool-call-result` 选择器层级是否需调整（从 card 直系子变 body 子）。

**(D) chevron 统一**
- 工具卡片 chevron（L531）与思考过程 chevron（L896/L1051）已同为 `<polyline points="6 9 12 15 18 9"/>`，保持一致即可。

### 边界
- rebindAllMessages 恢复历史时不重建 tool-call-item 的 expanded 类（保留 htmlContent 状态），可接受。
- 输出移入 body 后，「超 500 字点击展开」（L691-702）的 click 监听不受影响。

---

## 任务6：快捷键（Alt+N / Alt+W / Alt+E）

### 改动文件
- `src/side_panel/index.js`（keydown L2300-2353）
- `side_panel.html`（快捷键面板表格，新增三行）

### 实现
在 keydown 中新增（避开现有占用）：
```
// Alt+N：新建会话
if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyN') {
  e.preventDefault(); createSession(); return;
}
// Alt+W：关闭当前会话（直接关闭，按用户决策不二次确认；若需防误触可后续加确认）
if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyW') {
  e.preventDefault();
  const sid = state.activeSessionId; if (!sid) return;
  await deleteSession(sid); return;
}
// Alt+E：编辑最近一条用户消息
if (e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyE') {
  e.preventDefault();
  const userMsgs = document.querySelectorAll('#chatContainer .message.user');
  const last = userMsgs[userMsgs.length - 1];
  if (last) { editAndResendMessage(last); document.getElementById('userInput')?.focus(); }
  return;
}
```
- 确认 `createSession`、`deleteSession`、`editAndResendMessage` 已 import 到 index.js（若无需补 import）。
- Alt 组合在输入框内不产生字符，焦点冲突安全。
- 关闭会话：用户选择直接分叉/关闭风格，此处 Alt+W 直接关闭；如后续需防误触可加 `showCustomConfirm`（遵守禁用原生 confirm 规则）。

**(B) 快捷键面板**：side_panel.html 快捷键表格追加：
```
<tr><td><kbd>Alt</kbd>+<kbd>N</kbd></td><td>新建会话</td><td>Win / Mac</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>W</kbd></td><td>关闭当前会话</td><td>Win / Mac</td></tr>
<tr><td><kbd>Alt</kbd>+<kbd>E</kbd></td><td>编辑最近一条用户消息</td><td>Win / Mac</td></tr>
```

### 边界
- 无活跃会话/无用户消息时静默 return。
- editAndResendMessage 内部已截断历史重发。

---

## 任务7：消息级分叉（基于某条 AI 回复，直接分叉）

### 改动文件
- `src/storage/session-store.js`（duplicateSession L530-570，增加 upToMessageId 参数）
- `src/side_panel/chat-streaming.js`（finalizeStreamingMessage footer 加分叉按钮，L1385 deleteBtn 前）
- `src/side_panel/chat-manager.js`（rebindAllMessages 重绑分叉按钮）
- `src/side_panel/session-manager-ui.js`（复用 handleSessionSwitch）

### 实现
**(A) duplicateSession 增加截断参数**（向后兼容）：
```
export async function duplicateSession(sourceSessionId, upToMessageId = null) {
  ...
  let srcMessages = source.messageHistory || [];
  if (upToMessageId) {
    const idx = srcMessages.findIndex(m => m.messageId === upToMessageId);
    if (idx >= 0) srcMessages = srcMessages.slice(0, idx + 1); // 含该消息
    // idx<0 时回退完整复制
  }
  const clonedMessages = srcMessages.map(msg => ({ ...msg, messageId: 'msg_'+Date.now().toString(36)+'_'+Math.random().toString(36).substring(2,8), ... }));
  const newSession = { ...source, title: upToMessageId ? `${source.title||'新会话'} - 分叉` : `${source.title||'新会话'} - 副本`, ... };
}
```

**(B) 分叉按钮**（finalizeStreamingMessage footer，rightActionsContainer 内 deleteBtn 前）：
```
const forkBtn = document.createElement('button');
forkBtn.className = 'fork-btn';
forkBtn.title = '从此处分叉会话（仅复制到此条消息）';
forkBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 6h-7a4 4 0 0 0-4 4v2"/></svg>`;
forkBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const mid = element.dataset.messageId;
  const newSession = await duplicateSession(state.activeSessionId, mid);
  await handleSessionSwitch(newSession.id);
  showToast('已创建分叉会话');
});
rightActionsContainer.appendChild(forkBtn);
```
- 用户选择直接分叉，不加 showCustomConfirm。
- 需 import `duplicateSession`、`handleSessionSwitch` 到 chat-streaming.js（若无需补）。

**(C) rebindAllMessages 重绑**：仿 deleteBtn 重绑逻辑，给 `.fork-btn` 重新绑定上述 click。

### 边界
- 该消息是最后一条：截断无影响，仍可分叉。
- messageId 找不到：回退完整复制（不中断）。
- forkMetadata 可扩展记录 upToMessageId（session-store L561-564）。

---

## 任务8：skill 工具描述增强

### 改动文件
- `src/background/tools/agent-tools.js`（agent_skill description L105 附近）

### 实现
项目中无独立 `skill_run` 工具，实际是 `agent_skill`（action: run 执行 Workflow Skill / action: load 加载 Agent Skill）。description 由 `'Skill加载/执行'` 增强为：
```
'Skill 加载与执行。action=run：仅执行 Workflow 类型 Skill（需提供 params）；action=load：加载 Agent 类型 Skill 说明（加载后由你自主调用工具完成，不能直接执行）。Agent Skill 无法用 run 执行，必须先 load。'
```
- registry.js L181-192 runSkill 遇 Agent Skill 已返回错误兜底，描述增强让模型提前区分，减少试错。

### 边界
- token 成本小（单工具 +~75 字）。action 枚举不变，不破坏调用方。

---

## 跨任务共用点
1. **构建验证**：所有任务改 src/ 或 options.html，完成后在项目根运行 `npm run build:silent`，失败先修复。
2. **事件重绑**：任务1（思考头筛选）、任务7（分叉按钮）必须在 `rebindAllMessages`（chat-manager.js）补绑定，否则切换会话后失效。建议抽公共绑定函数供 finalize 与 rebind 共用。
3. **showCustomConfirm**：本方案中按用户决策，分叉/关闭会话均不二次确认；如后续需加确认，统一用 `window.showCustomConfirm`，禁用原生 confirm。
4. **messageId 唯一性**：任务7 截断复制时仍为每条克隆消息重新生成 messageId。

## 验证方法
1. `npm run build:silent` 构建通过。
2. 加载扩展，侧边栏测试：
   - 任务1：触发含工具调用的对话，完成后点击「成功/失败/总节点」数字，验证 tool-call-item 按状态显隐、高亮态正确、折叠/展开不冲突；切换会话再回来筛选态保留。
   - 任务2：拖拽 png/jpg 到输入框 → 缩略图模式（enableImageInput 开启时）；关闭图片识别再拖 → 文件附件 + toast。
   - 任务3：配公司模型，发图片+「解读图片」，观察是否仍误调 capture_page。
   - 任务4：长回答流式时主动上滚 → 完成后不强制回顶；不上滚 → 完成后回顶。
   - 任务5：配置页「流式输出」关闭时「默认展开」开关隐藏；开启后默认折叠工具卡片，输入输出都在折叠区内，点击可展开。
   - 任务6：Alt+N 新建、Alt+W 关闭、Alt+E 编辑最近用户消息；快捷键面板显示新项。
   - 任务7：点 AI 消息底部「分叉」→ 新会话仅含到该消息的历史，切换到新会话。
   - 任务8：让模型处理 Agent Skill，观察是否仍误用 run 执行（应改用 load）。

## 建议实施顺序
任务8（最低风险，单字符串）→ 任务3（单字符串）→ 任务2（小改动）→ 任务4 → 任务6 → 任务1 → 任务5（配置+CSS）→ 任务7（存储+UI+重绑）。每步构建通过后再下一步。
