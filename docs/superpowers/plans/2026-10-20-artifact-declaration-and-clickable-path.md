# 脚本产物声明识别 + 聊天内文件路径可点击 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 AI 通过脚本动态生成的文件能被「本次任务的文件产物」面板识别，并把聊天回答里的有效文件路径渲染为可点击、点击后在侧边栏自带工作目录面板中定位的链接。

**Architecture:** 三层组合——静态分析（已有，确定性场景）+ AI 文本声明（`[[artifact:路径|说明]]` 标记，覆盖动态路径）+ 复用现有 stat 校验链路防幻觉。声明标记在 Markdown 渲染时从显示中剥离、在产物生成处从原始文本解析并与静态产物去重合并；linkify 作为渲染后的异步 DOM 后处理，点击复用现成的 `locateFileInWorkspace`。

**Tech Stack:** 浏览器原生 DOM API + Chrome Extension（MV3 Side Panel）、ES Modules、Vitest（jsdom）、`chrome.runtime.sendMessage`（`CHECK_FILES_EXIST`）。

**Spec:** `docs/superpowers/specs/2026-10-20-artifact-declaration-and-clickable-path-design.md`

## Global Constraints

- 不改 Agent 端（`agent/src/**`）、不新增工具、不遍历工作目录。
- 声明标记格式恒为 `[[artifact:路径|可选说明]]`（路径必填、说明可省），全角/半角竖线只认半角 `|`。
- 含变量引用（`$VAR`/`${VAR}`/`%VAR%`）的路径一律丢弃（沿用既有约定）。
- 任何向 Agent 发起的 fs 校验前，必须先 `isPathInsideWorkspace` 边界判断，再 `resolveWorkspaceAbsolutePath`；目录外路径不发起校验（Agent `security.js` 会 403，不可放宽）。
- i18n 键必须 zh/en 成对 `registerTranslations`；面向用户的工具/按钮名在渲染时动态查 i18n，不缓存。
- 产物按钮创建点共 **3 处**（非流式 `addMessage`、流式 `finalizeStreamingMessage`、切会话回灌 `rebindArtifactsButton`），任何产物逻辑改动必须三处一致接入。
- 每个改动完成后运行 `npm run build:silent` 验证构建；扩展端单测用 `npx vitest run <file>`。

---

## 文件结构

- `src/side_panel/markdown-render.js`：新增 `stripArtifactMarkers`（渲染期剥离标记，防显示）+ `applyFilePathLinks`（linkify）+ `bindFileLinkDelegate`（点击委托）；`formatMarkdown` 开头调用剥离；新增 `chat.fileLinkTitle` i18n。
- `src/side_panel/artifacts-manager.js`：新增纯函数 `parseDeclaredArtifactsFromText`、`mergeDeclaredArtifacts`、`buildArtifactsForMessage`；产物对象新增 `source` 字段。
- `src/side_panel/utils.js`：`getSystemPrompt` 追加产物声明指引段（两个返回分支都注入）；新增 `util.artifactDeclTitle`/`util.artifactDeclDesc` i18n。
- `src/side_panel/chat-manager.js`：`addMessage` 产物块改用 `buildArtifactsForMessage(content)`、写 `dataset.declaredArtifacts`、渲染后 `applyFilePathLinks`；`rebindArtifactsButton` 合并 declared、回灌后 `applyFilePathLinks`；启动处 `bindFileLinkDelegate()` 绑一次。
- `src/side_panel/chat-streaming.js`：`finalizeStreamingMessage` 产物块同上。
- `src/side_panel/styles.css`：`.chat-file-link` 样式。
- 测试：`test/unit/artifact-declare-linkify.unit.test.js`（新建）、`test/unit/artifacts-extract.unit.test.js`（扩展）、`test/unit/markdown-strip-marker.unit.test.js`（新建）。

---

## Task 1: 渲染期剥离 `[[artifact:...]]` 标记（显示安全，最先做）

**Files:**
- Modify: `src/side_panel/markdown-render.js`（`formatMarkdown` 开头，约 355 行；i18n 块约 12-30 行）
- Test: `test/unit/markdown-strip-marker.unit.test.js`（新建）

**Interfaces:**
- Produces: `stripArtifactMarkers(text: string): string` — 移除所有 `[[artifact:...]]` 标记并整理多余空行；`formatMarkdown` 在解析前调用它。

- [ ] **Step 1: 写失败测试**

```js
// @vitest-environment jsdom
import { describe, test, expect, beforeAll } from 'vitest';
let formatMarkdown, stripArtifactMarkers;
beforeAll(async () => {
  const mod = await import('../../src/side_panel/markdown-render.js');
  formatMarkdown = mod.formatMarkdown;
  stripArtifactMarkers = mod.stripArtifactMarkers;
});
describe('stripArtifactMarkers', () => {
  test('移除单条带说明标记', () => {
    expect(stripArtifactMarkers('结果如下\n[[artifact:a.xlsx|报表]]\n完毕'))
      .toBe('结果如下\n完毕');
  });
  test('移除多条无说明标记', () => {
    expect(stripArtifactMarkers('[[artifact:a.py]][[artifact:b.md]]')).toBe('');
  });
  test('不含标记时原样返回', () => {
    expect(stripArtifactMarkers('普通文本 `code`')).toBe('普通文本 `code`');
  });
  test('formatMarkdown 输出不含标记原文', () => {
    const html = formatMarkdown('标题\n[[artifact:report.xlsx|季度报表]]');
    expect(html).not.toContain('[[artifact:');
    expect(html).not.toContain('report.xlsx');
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/unit/markdown-strip-marker.unit.test.js`
Expected: FAIL（`stripArtifactMarkers is not a function`）

- [ ] **Step 3: 实现剥离函数并接入 formatMarkdown**

在 `markdown-render.js` 新增导出（放在 `formatMarkdown` 之前）：

```js
/**
 * 从显示文本中剥离 [[artifact:路径|说明]] 声明标记（这些标记只用于产物解析，不展示）
 * @param {string} text
 * @returns {string}
 */
export function stripArtifactMarkers(text) {
  if (!text) return '';
  return text
    .replace(/[ \t]*\[\[artifact:[^\]]*\]\][ \t]*/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '')
    .replace(/\n+$/, '');
}
```

在 `formatMarkdown` 的 `if (!text) return '';` 之后、mermaid 提取之前插入一行：

```js
export function formatMarkdown(text) {
  if (!text) return '';
  text = stripArtifactMarkers(text);
  // 提取 mermaid 图表...
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/unit/markdown-strip-marker.unit.test.js`
Expected: PASS

- [ ] **Step 5: 构建 + 提交**

```bash
npm run build:silent
git add src/side_panel/markdown-render.js test/unit/markdown-strip-marker.unit.test.js
git commit -m "feat(artifacts): strip [[artifact]] declaration markers from markdown render"
```

---

## Task 2: 声明解析与合并纯函数

**Files:**
- Modify: `src/side_panel/artifacts-manager.js`（在 `extractArtifactsFromExecutionLog` 附近新增导出；`normalizePath`/`getFileName`/`getFileExt` 已存在于文件顶部）
- Test: `test/unit/artifact-declare-linkify.unit.test.js`（新建，本 Task 只写解析/合并部分用例）

**Interfaces:**
- Consumes: 无（纯字符串/数组处理）。
- Produces:
  - `parseDeclaredArtifactsFromText(text: string): Array<{ path: string, note: string }>`
  - `mergeDeclaredArtifacts(artifacts: Array, declared: Array): Array`（原地给静态项补 `source:'static'`，返回合并后新数组；按 `normalizePath` 去重）
  - `buildArtifactsForMessage(executionLog: Array, rawContent: string|null): Array`（= extract + parse + merge）

- [ ] **Step 1: 写失败测试**

```js
// @vitest-environment jsdom
import { describe, test, expect, beforeAll } from 'vitest';
let parseDeclaredArtifactsFromText, mergeDeclaredArtifacts, buildArtifactsForMessage;
beforeAll(async () => {
  const mod = await import('../../src/side_panel/artifacts-manager.js');
  parseDeclaredArtifactsFromText = mod.parseDeclaredArtifactsFromText;
  mergeDeclaredArtifacts = mod.mergeDeclaredArtifacts;
  buildArtifactsForMessage = mod.buildArtifactsForMessage;
});
describe('parseDeclaredArtifactsFromText', () => {
  test('解析带/不带说明', () => {
    const r = parseDeclaredArtifactsFromText('[[artifact:a.xlsx|报表]]\n[[artifact:b.py]]');
    expect(r).toEqual([{ path: 'a.xlsx', note: '报表' }, { path: 'b.py', note: '' }]);
  });
  test('过滤变量引用路径', () => {
    expect(parseDeclaredArtifactsFromText('[[artifact:$OUT/x.csv]]')).toEqual([]);
    expect(parseDeclaredArtifactsFromText('[[artifact:%TEMP%/y.log]]')).toEqual([]);
  });
  test('无标记返回空数组', () => {
    expect(parseDeclaredArtifactsFromText('普通回答')).toEqual([]);
    expect(parseDeclaredArtifactsFromText(null)).toEqual([]);
  });
});
describe('mergeDeclaredArtifacts', () => {
  test('声明与静态同路径去重（保留静态并补 note）', () => {
    const staticA = [{ path: '/ws/a.xlsx', fileName: 'a.xlsx', action: 'typeCreate' }];
    const merged = mergeDeclaredArtifacts(staticA, [{ path: 'a.xlsx', note: '报表' }]);
    // normalizePath 后同为 a.xlsx 结尾时按规范化路径判等；此处不同（/ws/a.xlsx vs a.xlsx）→ 视为不同
    expect(merged.length).toBe(2);
    expect(merged.find(m => m.path === '/ws/a.xlsx').source).toBe('static');
  });
  test('完全相同规范化路径只留一条', () => {
    const staticA = [{ path: 'a.xlsx', fileName: 'a.xlsx', action: 'typeCreate' }];
    const merged = mergeDeclaredArtifacts(staticA, [{ path: './a.xlsx', note: 'x' }]);
    expect(merged.filter(m => m.fileName === 'a.xlsx').length).toBe(1);
  });
  test('声明项带 source=declared 与 fileName', () => {
    const merged = mergeDeclaredArtifacts([], [{ path: 'out/r.md', note: '报告' }]);
    expect(merged[0].source).toBe('declared');
    expect(merged[0].fileName).toBe('r.md');
    expect(merged[0].action).toBe('typeCreate');
  });
});
describe('buildArtifactsForMessage', () => {
  test('合并静态与声明', () => {
    const log = [{ id: 'x', nodeType: 'tool_exec', status: 'success', action: { name: 'agent_file', params: { action: 'write', path: '/ws/gen.py' } }, observation: JSON.stringify({ path: '/ws/gen.py' }) }];
    const merged = buildArtifactsForMessage(log, '结果\n[[artifact:/ws/report.xlsx|报表]]');
    expect(merged.some(a => a.path === '/ws/report.xlsx' && a.source === 'declared')).toBe(true);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/unit/artifact-declare-linkify.unit.test.js`
Expected: FAIL（函数未定义）

- [ ] **Step 3: 实现三个函数**

在 `artifacts-manager.js` 的 `extractArtifactsFromExecutionLog` 定义之后新增：

```js
/**
 * 从 assistant 最终回答文本中解析 AI 声明的产物
 * 标记格式：[[artifact:路径|可选说明]]
 * @param {string} text
 * @returns {Array<{path:string, note:string}>}
 */
export function parseDeclaredArtifactsFromText(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  const seen = new Set();
  const re = /\[\[artifact:([^\]|]+)(?:\|([^\]]*))?\]\]/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const path = (m[1] || '').trim();
    const note = (m[2] || '').trim();
    if (!path) continue;
    // 变量引用路径无法静态确定真实文件名，丢弃（沿用既有约定）
    if (/\$\{?[A-Za-z_][A-Za-z0-9_]*\}?| %[A-Za-z0-9_]+% /.test(path)) continue;
    const norm = normalizePath(path);
    if (!norm || seen.has(norm)) continue;
    seen.add(norm);
    out.push({ path, note });
  }
  return out;
}

/**
 * 将声明产物并入静态分析产物，按规范化路径去重
 * @param {Array} artifacts - extractArtifactsFromExecutionLog 的结果（会被补 source 字段）
 * @param {Array<{path,note}>} declared
 * @returns {Array} 合并后的新数组
 */
export function mergeDeclaredArtifacts(artifacts, declared) {
  const merged = (artifacts || []).map(a => ({ ...a, source: a.source || 'static' }));
  const normSeen = new Set(merged.map(a => normalizePath(a.path)));
  for (const d of (declared || [])) {
    const norm = normalizePath(d.path);
    if (!norm || normSeen.has(norm)) {
      // 同路径：把说明补到已有静态项（不新增重复行）
      const hit = merged.find(a => normalizePath(a.path) === norm);
      if (hit && d.note && !hit.note) hit.note = d.note;
      continue;
    }
    normSeen.add(norm);
    merged.push({
      path: d.path,
      fileName: getFileName(d.path),
      toolName: 'declared',
      action: 'typeCreate',
      size: 0,
      timestamp: null,
      status: 'unknown',
      type: 'file',
      source: 'declared',
      note: d.note || '',
    });
  }
  return merged;
}

/**
 * 一站式：静态分析 + 声明解析 + 合并去重
 * @param {Array} executionLog
 * @param {string|null} rawContent - assistant 原始回答文本（含标记）
 * @returns {Array}
 */
export function buildArtifactsForMessage(executionLog, rawContent) {
  const staticArtifacts = extractArtifactsFromExecutionLog(executionLog);
  const declared = parseDeclaredArtifactsFromText(rawContent);
  return mergeDeclaredArtifacts(staticArtifacts, declared);
}
```

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/unit/artifact-declare-linkify.unit.test.js`
Expected: PASS

- [ ] **Step 5: 构建 + 提交**

```bash
npm run build:silent
git add src/side_panel/artifacts-manager.js test/unit/artifact-declare-linkify.unit.test.js
git commit -m "feat(artifacts): parse & merge AI-declared artifacts"
```

---

## Task 3: 系统提示词注入产物声明指引

**Files:**
- Modify: `src/side_panel/utils.js`（i18n 块约 17-33 行 zh / 59-75 行 en；`getSystemPrompt` 约 747-814 行）
- Test: `test/unit/artifact-declare-linkify.unit.test.js`（追加源码守卫用例）

**Interfaces:**
- Consumes: `t('util.artifactDeclTitle')` / `t('util.artifactDeclDesc')`、`getLanguage()`（已在 utils.js 导入）。
- Produces: `getSystemPrompt` 返回的提示词包含声明指引段（工具型 Agent 才注入，门控 `state.useTools`）。

- [ ] **Step 1: 写失败测试（源码守卫）**

```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
describe('system prompt artifact-declaration injection', () => {
  const src = readFileSync(fileURLToPath(new URL('../../src/side_panel/utils.js', import.meta.url)), 'utf8');
  test('zh + en 声明指引键齐备', () => {
    expect(src).toContain("artifactDeclTitle: '##");
    expect(src).toContain('artifactDeclDesc:');
    // 至少两处 artifactDeclTitle（zh + en）
    expect((src.match(/artifactDeclTitle:/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  test('getSystemPrompt 两个返回分支都拼接 artifactDeclSection', () => {
    expect(src).toContain('${artifactDeclSection}');
    expect((src.match(/\$\{artifactDeclSection\}/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/unit/artifact-declare-linkify.unit.test.js -t "system prompt"`
Expected: FAIL（键与拼接不存在）

- [ ] **Step 3: 新增 i18n 键（zh）**

在 `utils.js` zh 的 `util` 块内（`taskPlanningDesc` 之后）加：

```js
    artifactDeclTitle: '## 文件产物声明',
    artifactDeclDesc: '当本次任务通过脚本或命令在工作目录内创建/修改了文件（尤其是运行时才确定路径的文件，如带日期的报表），请在最终回答末尾各用一行声明每个产物，格式严格为：[[artifact:相对工作目录或绝对路径|可选中文说明]]。示例：[[artifact:报表_2026-10-20.xlsx|书签统计报表]]。只列本次真实产生的文件，不要虚构、不要列未生成的文件；说明可省略。这些标记不会展示给用户。',
```

- [ ] **Step 4: 新增 i18n 键（en）**

在 en 的 `util` 块对应位置加：

```js
    artifactDeclTitle: '## File Artifact Declaration',
    artifactDeclDesc: 'When this task creates/modifies files in the working directory via scripts or commands (especially paths only determined at runtime, e.g. dated reports), append one line per artifact at the very end of your final answer, strictly formatted as: [[artifact:workspace-relative or absolute path|optional note]]. Example: [[artifact:report_2026-10-20.xlsx|bookmark stats report]]. List only files truly produced this task; never fabricate or declare files that were not generated; the note is optional. These markers are not shown to the user.',
```

- [ ] **Step 5: getSystemPrompt 拼接声明段**

在 `getSystemPrompt` 内、`taskPlanningRules` 定义（约 748-751 行）之后，新增：

```js
  // 文件产物声明指引——仅在启用工具时注入（无工具则无法产生脚本文件）
  const artifactDeclSection = state.useTools ? `

${t('util.artifactDeclTitle')}
${t('util.artifactDeclDesc')}` : '';
```

在**两个返回分支**的模板字符串里各追加 `${artifactDeclSection}`：
- 自定义 prompt 分支（约 809-814 行）：把 `${commandEnvSection}${taskPlanningRules}${dispatchToolRule}${memoryRules}` 改为末尾再加 `${artifactDeclSection}`。
- 默认 prompt 分支（约 828 行起，找到其 `finalPrompt`/`defaultPrompt` 拼接处）同样在能力/环境段之后追加 `${artifactDeclSection}`。

> 实施时先 `grep -n 'return finalPrompt\|defaultPrompt =\|memoryRules}' src/side_panel/utils.js` 定位默认分支的确切拼接点，保证两个分支都注入且只注入一次。

- [ ] **Step 6: 运行验证通过**

Run: `npx vitest run test/unit/artifact-declare-linkify.unit.test.js -t "system prompt"`
Expected: PASS

- [ ] **Step 7: 构建 + 提交**

```bash
npm run build:silent
git add src/side_panel/utils.js test/unit/artifact-declare-linkify.unit.test.js
git commit -m "feat(artifacts): inject artifact-declaration guidance into system prompt"
```

---

## Task 4: 三处产物生成点接入声明合并 + 持久化 + 回灌

**Files:**
- Modify: `src/side_panel/chat-manager.js`（`addMessage` 产物块 1639-1665；`rebindArtifactsButton` 2267-2300；import 第 30 行）
- Modify: `src/side_panel/chat-streaming.js`（`finalizeStreamingMessage` 产物块 1875-1900；import 第 17 行）
- Test: `test/unit/artifact-declare-linkify.unit.test.js`（追加接线守卫）

**Interfaces:**
- Consumes: `buildArtifactsForMessage(executionLog, content)`（Task 2）。
- Produces: 三处产物列表包含声明项；`messageEl.dataset.declaredArtifacts` 存声明原始项（供回灌）。

- [ ] **Step 1: 写失败测试（接线守卫）**

```js
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
const p = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
describe('declared-artifact wiring at 3 sites', () => {
  test('chat-manager addMessage 用 buildArtifactsForMessage 并持久化 declared', () => {
    const s = p('../../src/side_panel/chat-manager.js');
    expect(s).toContain('buildArtifactsForMessage');
    expect(s).toContain('dataset.declaredArtifacts');
    expect(s).toMatch(/import \{[^}]*buildArtifactsForMessage[^}]*\} from '\.\/artifacts-manager\.js'/);
  });
  test('chat-streaming finalize 用 buildArtifactsForMessage', () => {
    const s = p('../../src/side_panel/chat-streaming.js');
    expect(s).toContain('buildArtifactsForMessage');
  });
  test('rebindArtifactsButton 合并 dataset.declaredArtifacts', () => {
    const s = p('../../src/side_panel/chat-manager.js');
    expect(s).toContain("dataset.declaredArtifacts");
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/unit/artifact-declare-linkify.unit.test.js -t "wiring"`
Expected: FAIL

- [ ] **Step 3: chat-manager.js import 增加 buildArtifactsForMessage**

第 30 行改为：

```js
import { extractArtifactsFromExecutionLog, buildArtifactsForMessage, parseDeclaredArtifactsFromText, showArtifactsModal, preFilterDeletedArtifacts, validateArtifactsAsync } from './artifacts-manager.js';
```

- [ ] **Step 4: addMessage 产物块改用合并版并持久化声明**

将 1640 行 `const artifacts = extractArtifactsFromExecutionLog(executionLog);` 替换为（`content` 为该 assistant 消息原始文本，在本函数作用域内可用）：

```js
    const declaredList = parseDeclaredArtifactsFromText(content);
    const artifacts = buildArtifactsForMessage(executionLog, content);
```

在 `preFilterDeletedArtifacts(artifacts);` 之后、`if (artifacts.length > 0)` 块内、`rightActionsContainer.appendChild(artifactsBtn);` 附近，把声明项持久化到消息元素（供切会话回灌）：

```js
      messageDiv.dataset.declaredArtifacts = JSON.stringify(declaredList);
```

> 若 `artifacts.length === 0` 但 `declaredList` 非空（理论上不会，声明项必进 merged），仍应写 dataset；保险起见把 dataset 写入移到 `if (artifacts.length > 0)` 之前，用 `if (declaredList.length) messageDiv.dataset.declaredArtifacts = JSON.stringify(declaredList);`。

- [ ] **Step 5: finalizeStreamingMessage 产物块同样改**

`chat-streaming.js` import 第 17 行补 `buildArtifactsForMessage, parseDeclaredArtifactsFromText`；1876 行 `const artifacts = extractArtifactsFromExecutionLog(executionLog);` 改为：

```js
  const declaredList = parseDeclaredArtifactsFromText(content);
  const artifacts = buildArtifactsForMessage(executionLog, content);
  if (declaredList.length) element.dataset.declaredArtifacts = JSON.stringify(declaredList);
```

（`content` 是 `finalizeStreamingMessage(element, content, ...)` 的第二参数。）

- [ ] **Step 6: rebindArtifactsButton 合并声明**

`chat-manager.js` 2269 行处，把仅从 executionLog 提取改为再并入 dataset 声明：

```js
  let artifacts = extractArtifactsFromExecutionLog(/* 原有 executionLog 解析 */);
  let declared = [];
  try { declared = JSON.parse(messageEl.dataset.declaredArtifacts || '[]'); } catch { declared = []; }
  if (declared.length) artifacts = mergeDeclaredArtifacts(artifacts, declared);
```

并在 chat-manager.js import 第 30 行补 `mergeDeclaredArtifacts`。

- [ ] **Step 7: 运行验证通过 + 回归**

Run: `npx vitest run test/unit/artifact-declare-linkify.unit.test.js test/unit/artifacts-extract.unit.test.js`
Expected: PASS（新用例 + 既有产物提取全绿）

- [ ] **Step 8: 构建 + 提交**

```bash
npm run build:silent
git add src/side_panel/chat-manager.js src/side_panel/chat-streaming.js test/unit/artifact-declare-linkify.unit.test.js
git commit -m "feat(artifacts): merge declared artifacts at all 3 artifact-button sites"
```

---

## Task 5: 聊天内文件路径可点击（linkify + 定位）

**Files:**
- Modify: `src/side_panel/markdown-render.js`（新增 `applyFilePathLinks` / `bindFileLinkDelegate`；i18n 新增 `chat.fileLinkTitle`）
- Modify: `src/side_panel/chat-manager.js`（三处渲染后调用 `applyFilePathLinks`；启动处 `bindFileLinkDelegate()`）
- Modify: `src/side_panel/chat-streaming.js`（finalize 后调用）
- Modify: `src/side_panel/styles.css`（`.chat-file-link`）
- Test: `test/unit/artifact-declare-linkify.unit.test.js`（追加 linkify 用例）

**Interfaces:**
- Consumes: `locateFileInWorkspace(path)`（`workspace-panel.js`，已存在）、`resolveWorkspaceAbsolutePath(path)`、`showToast`、`escapeAttr`、`getWorkspaceRoot`、`chrome.runtime.sendMessage({type:'CHECK_FILES_EXIST', paths})`。
- Produces: `applyFilePathLinks(messageEl: HTMLElement, validPaths: Array<string>): Promise<void>`；`bindFileLinkDelegate(): void`。

- [ ] **Step 1: 写失败测试（纯逻辑：候选路径提取 + 降噪）**

在 markdown-render.js 内先导出可测的纯函数 `extractPathCandidates(text)`（从一段可见文本提取疑似文件路径 token），测试它：

```js
let extractPathCandidates, applyFilePathLinks, bindFileLinkDelegate;
// 追加到 beforeAll：
//   extractPathCandidates = mod.extractPathCandidates;
//   applyFilePathLinks = mod.applyFilePathLinks;
//   bindFileLinkDelegate = mod.bindFileLinkDelegate;
describe('extractPathCandidates', () => {
  test('提取绝对/相对/带扩展名路径', () => {
    const c = extractPathCandidates('见 /ws/out/report_2026-10-20.xlsx 与 out.csv，还有 ~/x.md');
    expect(c).toContain('/ws/out/report_2026-10-20.xlsx');
    expect(c).toContain('out.csv');
    expect(c).toContain('~/x.md');
  });
  test('不提取 URL 与纯目录', () => {
    const c = extractPathCandidates('访问 https://a.com/b.png 和目录 src/ 结束');
    expect(c.some(x => x.includes('https://'))).toBe(false);
    expect(c.some(x => x === 'src/')).toBe(false);
  });
});
describe('applyFilePathLinks', () => {
  test('把有效产物路径包成 .chat-file-link 且 data-path 转义', async () => {
    globalThis.chrome = globalThis.chrome || {};
    globalThis.chrome.runtime = { sendMessage: () => Promise.resolve({ success: true, results: {} }) };
    const el = document.createElement('div');
    el.innerHTML = '<div class="markdown-body"><p>输出文件 out/report.xlsx 已生成</p></div>';
    await applyFilePathLinks(el, ['out/report.xlsx']);
    const link = el.querySelector('.chat-file-link');
    expect(link).toBeTruthy();
    expect(link.getAttribute('data-path')).toBe('out/report.xlsx');
  });
  test('URL 不被转换', async () => {
    globalThis.chrome.runtime = { sendMessage: () => Promise.resolve({ success: true, results: {} }) };
    const el = document.createElement('div');
    el.innerHTML = '<div class="markdown-body"><p>见 https://x.com/a.png</p></div>';
    await applyFilePathLinks(el, []);
    expect(el.querySelector('.chat-file-link')).toBeNull();
  });
});
```

- [ ] **Step 2: 运行验证失败**

Run: `npx vitest run test/unit/artifact-declare-linkify.unit.test.js -t "extractPathCandidates\|applyFilePathLinks"`
Expected: FAIL（未定义）

- [ ] **Step 3: 实现候选提取 + linkify + 委托 + i18n**

`markdown-render.js` 顶部 import 补：

```js
import { locateFileInWorkspace, resolveWorkspaceAbsolutePath } from './workspace-panel.js';
import { getWorkspaceRoot } from './workspace-manager.js';
```

> 若 `workspace-panel.js` 反向 import `markdown-render.js` 造成循环依赖，改为在 `applyFilePathLinks` 内 `const { locateFileInWorkspace } = await import('./workspace-panel.js');` 动态导入，规避顶层循环。

新增导出：

```js
const FILE_EXT_RE = '\.[A-Za-z0-9]{1,6}';
// 疑似路径：~/…、/…、C:\…、含 / 或 \ 的相对路径、或 词.扩展名 形式的裸文件名
const PATH_CANDIDATE_RE = new RegExp(
  '(?:~?/[\\w\\-.\\u4e00-\\u9fa5/]+|\\b[A-Za-z]:\\\\[\\w\\-.\\\\\\u4e00-\\u9fa5]+|\\b[\\w\\-.\\u4e00-\\u9fa5]+/[\\w\\-./\\u4e00-\\u9fa5]*' + FILE_EXT_RE + '|\\b[\\w\\-.\\u4e00-\\u9fa5]+' + FILE_EXT_RE + ')',
  'g'
);

/** 从可见文本提取疑似文件路径 token（去 URL、去纯目录） */
export function extractPathCandidates(text) {
  if (!text) return [];
  const noUrl = text.replace(/\bhttps?:\/\/\S+/gi, ' ');
  const out = [];
  let m;
  PATH_CANDIDATE_RE.lastIndex = 0;
  while ((m = PATH_CANDIDATE_RE.exec(noUrl)) !== null) {
    let tok = m[0].replace(/[，。、)（）\s]+$/, '');
    if (!tok) continue;
    if (/\/$/.test(tok) && !new RegExp(FILE_EXT_RE + '$').test(tok)) continue; // 纯目录（结尾/且无扩展名）跳过
    if (!/[.\\/~]/.test(tok)) continue; // 至少要含路径分隔符或扩展名
    if (!out.includes(tok)) out.push(tok);
  }
  return out;
}

function normalizeForMatch(p) { return (p || '').replace(/\\/g, '/').replace(/\/+/g, '/'); }

/** 把消息内有效文件路径包成可点击链接 */
export async function applyFilePathLinks(messageEl, validPaths = []) {
  if (!messageEl) return;
  const body = messageEl.querySelector('.markdown-body') || messageEl;
  const validNorm = new Set((validPaths || []).map(normalizeForMatch));
  // 收集文本节点（排除 <a>/<pre>/已是链接的 span）
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      const tag = n.parentNode && n.parentNode.nodeName;
      if (tag === 'A' || tag === 'PRE' || tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
      if (n.parentNode && n.parentNode.closest && n.parentNode.closest('.chat-file-link')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  // 汇总候选，区分「已在产物集合」（可信）与「其他 token」（需 stat）
  const allCandidates = new Set();
  for (const n of textNodes) for (const c of extractPathCandidates(n.nodeValue)) allCandidates.add(c);
  if (allCandidates.size === 0) return;
  // 对不在 validNorm 的候选做一次批量存在性校验
  const needCheck = [...allCandidates].filter(c => !validNorm.has(normalizeForMatch(c)));
  const existSet = new Set();
  if (needCheck.length > 0) {
    try {
      let root = null;
      try { root = await getWorkspaceRoot(); } catch { /* 未知根则不拦截 */ }
      const resolved = await Promise.all(needCheck.map(c => resolveWorkspaceAbsolutePath(c).catch(() => c)));
      const checkable = [];
      for (let i = 0; i < needCheck.length; i++) {
        const rp = resolved[i] || needCheck[i];
        // 目录外（root 已知且不包含）跳过
        if (root && normalizeForMatch(rp) && !normalizeForMatch(rp).startsWith(normalizeForMatch(root))) continue;
        checkable.push({ token: needCheck[i], path: rp });
      }
      if (checkable.length) {
        const resp = await chrome.runtime.sendMessage({ type: 'CHECK_FILES_EXIST', paths: checkable.map(x => x.path) });
        if (resp && resp.success && resp.results) {
          for (const x of checkable) if (resp.results[x.path] === true) existSet.add(normalizeForMatch(x.token));
        }
      }
    } catch { /* 校验失败：仅可信产物路径转链接 */ }
  }
  const clickable = (token) => validNorm.has(normalizeForMatch(token)) || existSet.has(normalizeForMatch(token));
  // 逐节点替换
  const linkTitle = t('chat.fileLinkTitle');
  for (const node of textNodes) {
    const val = node.nodeValue;
    const cands = extractPathCandidates(val).filter(clickable);
    if (cands.length === 0) continue;
    // 按出现顺序切分，命中段包 span
    const sorted = cands.slice().sort((a, b) => b.length - a.length); // 长优先避免子串误配
    const frag = document.createDocumentFragment();
    let rest = val;
    outer: while (rest.length) {
      let earliest = -1, hit = null;
      for (const c of sorted) {
        const idx = rest.indexOf(c);
        if (idx !== -1 && (earliest === -1 || idx < earliest)) { earliest = idx; hit = c; }
      }
      if (earliest === -1) { frag.appendChild(document.createTextNode(rest)); break; }
      if (earliest > 0) frag.appendChild(document.createTextNode(rest.slice(0, earliest)));
      const span = document.createElement('span');
      span.className = 'chat-file-link';
      span.setAttribute('data-path', hit);
      span.setAttribute('title', linkTitle);
      span.textContent = hit;
      frag.appendChild(span);
      rest = rest.slice(earliest + hit.length);
      if (rest === '') break outer;
    }
    node.parentNode.replaceChild(frag, node);
  }
}

let fileLinkDelegateBound = false;
/** 绑定一次性的文件链接点击委托 */
export function bindFileLinkDelegate() {
  if (fileLinkDelegateBound) return;
  fileLinkDelegateBound = true;
  document.addEventListener('click', async (e) => {
    const link = e.target.closest && e.target.closest('.chat-file-link');
    if (!link) return;
    e.stopPropagation();
    const path = link.getAttribute('data-path');
    if (!path) return;
    try {
      await locateFileInWorkspace(path);
    } catch {
      showToast(t('chat.fileLinkFailed'), 'error');
    }
  }, true);
}
```

i18n（markdown-render.js 现有 `registerTranslations` 块内，`markdown` 命名空间之外新增 `chat` 或复用；此处用独立键）zh：

```js
  chat: {
    fileLinkTitle: '点击在工作目录中定位该文件',
    fileLinkFailed: '定位文件失败',
  },
```
en：
```js
  chat: {
    fileLinkTitle: 'Click to locate this file in the working directory',
    fileLinkFailed: 'Failed to locate file',
  },
```

> 若 `markdown-render.js` 已存在 `chat` 命名空间，则把两键并入而非重复声明。

- [ ] **Step 4: 运行验证通过**

Run: `npx vitest run test/unit/artifact-declare-linkify.unit.test.js -t "extractPathCandidates\|applyFilePathLinks"`
Expected: PASS

- [ ] **Step 5: 三处渲染后调用 + 启动绑定 + CSS**

`chat-manager.js` import 第 10 行补 `applyFilePathLinks, bindFileLinkDelegate`。
- 在 `addMessage` 产物块之后（`artifacts` 已算出），对非流式消息调用：`applyFilePathLinks(messageDiv, artifacts.map(a => a.path));`（不 await，失败静默）。
- 在 `rebindArtifactsButton` 末尾同样调用 `applyFilePathLinks(messageEl, artifacts.map(a => a.path));`。
- 在侧边栏初始化处（`chat-manager.js` 顶层或 `initChat`，与 `bindExecutionLogDelegate()` 同批）调用 `bindFileLinkDelegate();`。

`chat-streaming.js` import 补 `applyFilePathLinks`；在 `finalizeStreamingMessage` 产物块之后调用 `applyFilePathLinks(element, artifacts.map(a => a.path));`。

`styles.css` 新增：

```css
.chat-file-link {
  color: var(--brand-primary);
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
  border-radius: 3px;
  padding: 0 1px;
}
.chat-file-link:hover { background: rgba(var(--brand-rgb, 59,130,246), 0.12); }
```

- [ ] **Step 6: 构建 + 回归 + 提交**

```bash
npm run build:silent
npx vitest run test/unit/artifact-declare-linkify.unit.test.js test/unit/artifacts-extract.unit.test.js
git add src/side_panel/markdown-render.js src/side_panel/chat-manager.js src/side_panel/chat-streaming.js src/side_panel/styles.css test/unit/artifact-declare-linkify.unit.test.js
git commit -m "feat(chat): make valid file paths clickable to locate in workspace panel"
```

---

## Task 6: 文档同步

**Files:**
- Modify: `CHANGELOG.md`、`README.md`、`README.zh-CN.md`、`docs/index.html`、`docs/zh/DOCUMENTATION.md`、`docs/en/DOCUMENTATION.md`

**Interfaces:** 无代码接口。

- [ ] **Step 1: CHANGELOG 新增条目**

按现有日期/主题格式，记录「脚本产物声明识别 + 聊天内文件路径可点击」两项能力，含标记格式 `[[artifact:路径|说明]]` 与点击定位行为。

- [ ] **Step 2: README（zh/en）「它能帮你做什么」新增 bullet**

新增：脚本动态生成的文件产物自动识别、回答中文件路径可点击定位。同步功能计数（与 DOCUMENTATION 章节数一致）。

- [ ] **Step 3: docs/index.html 特性卡片 + i18n**

新增一张特性卡（中英翻译对），确保 translations 对象转义正确、可解析。

- [ ] **Step 4: DOCUMENTATION（zh/en）新增小节**

编号递增，说明产物声明格式与可点击路径行为；顶部特性计数与 README 对齐。

- [ ] **Step 5: 自检计数一致 + 提交**

```bash
git add CHANGELOG.md README.md README.zh-CN.md docs/index.html docs/zh/DOCUMENTATION.md docs/en/DOCUMENTATION.md
git commit -m "docs: document artifact declaration & clickable file path"
```

---

## Self-Review（写完后核对，实施者无需重跑）

- **Spec 覆盖**：§2.1 声明载体=文本约定 → Task 3 提示词 + Task 2 解析；§2.2 合并/校验/去重/`source` → Task 2 + Task 4（校验复用现有 `validateArtifactsAsync`）；§2.3 linkify/点击/复用 `locateFileInWorkspace` → Task 5；§2.4 i18n → Task 1/3/5；标记剥离显示安全 → Task 1；三处产物点一致 → Task 4 + Task 5 接线；§4「不做」项均未引入（无 Agent 改动、无工具、无遍历、无软门）。
- **Placeholder 扫描**：无 TBD/TODO；所有代码步含真实代码。Task 3 Step 5、Task 5 Step 3 标注「实施时先 grep 定位确切拼接点/循环依赖」属精确定位指引，非占位符。
- **类型/命名一致**：`parseDeclaredArtifactsFromText`/`mergeDeclaredArtifacts`/`buildArtifactsForMessage`/`stripArtifactMarkers`/`extractPathCandidates`/`applyFilePathLinks`/`bindFileLinkDelegate` 跨任务签名一致；产物 `source: 'static'|'declared'`、`note` 字段统一；i18n 键 `chat.fileLinkTitle`/`chat.fileLinkFailed`/`util.artifactDeclTitle`/`util.artifactDeclDesc` 一致。
- **已知风险**：`markdown-render.js ↔ workspace-panel.js` 潜在循环依赖 → Task 5 提供动态 import 兜底；默认 prompt 分支拼接点需 grep 确认 → Task 3 Step 5 已注明。
