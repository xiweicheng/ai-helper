# 页面引用系统（ref 树快照）阶段一 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `query_elements` 从扁平 JSON 升级为树形快照文本（`[ref N]` 单调编号 + 失效建议），扩展 `interact_element` 支持原子输入（action=type），`fill_form` 支持 ref 定位。

**Architecture:** 重写 `src/content/page-interaction.js` 的查询/注册表核心：全树遍历 + 可交互判定（原生标签/ARIA 角色/tabindex/contenteditable/summary）→ 名称解析链 → 紧凑缩进树序列化 → content 字段直通模型（react-loop 已有 `content ?? JSON.stringify` 链路，无需改 background 序列化）。输入辅助函数（setNativeValue 等）提升到 `page-utils.js` 共享。

**Tech Stack:** MV3 Chrome 扩展、Vite 构建、Vitest（jsdom）单测、Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-10-10-page-element-ref-system-design.md`（已批准；实现与 spec 冲突时以 spec 为准，参数命名 `value` 见 spec 3.5 修订说明）

## Global Constraints

- 每个 Task 结束前必须：相关单测跑绿 → `git commit`（中文 conventional 提交信息）
- 代码注释/提交信息用中文；工具定义 description 用英文（模型侧）；i18n zh/en 必须同步
- 测试文件放 `test/unit/content/`，jsdom 环境用文件头 `// @vitest-environment jsdom` 标注
- **测试断言不得硬编码 ref 数字**（refCounter 跨测试单调递增），从 `content.match(/\[ref (\d+)\]/)` 提取
- 不修改 `manifest.json`；不改 `react-loop.js`/`tool-executor.js`（content 直通链路已存在）
- 全部改动完成后执行 `npm run build:silent` 验证构建
- 双语文案注册方式沿用现有 `registerTranslations('zh'|'en', {...})` 模式

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/content/page-utils.js` | 共享 DOM 工具（输入辅助函数移入） | 修改 |
| `src/content/page-interaction.js` | 树构建器/注册表/resolveByRef/interactByRef(type) | 重写核心 |
| `src/content/interaction-tools.js` | fillForm 支持 ref；改 import 辅助函数 | 修改 |
| `src/content/index.js` | INTERACT_ELEMENT handler 透传 value/clear/submit | 修改 |
| `src/background/tools/browser-tools.js` | 3 个工具定义更新 | 修改 |
| `src/shared/locales/zh.js` + `en.js` | UI 工具描述同步 | 修改 |
| `test/unit/content/page-interaction.unit.test.js` | 树快照测试重写 | 重写 |
| `test/unit/content/interaction-tools.unit.test.js` | fillForm ref 用例 | 修改 |
| `test/e2e/content-tools.e2e.spec.js` | 树文本断言 + type 链路 | 修改 |

---

### Task 1: 输入辅助函数移位到 page-utils.js

**Files:**
- Modify: `src/content/page-utils.js`（文件末尾追加，L176 后）
- Modify: `src/content/interaction-tools.js:155-210`（删除私有函数，改 import）

**Interfaces:**
- Produces: `isContentEditableElement(el): boolean`、`setNativeValue(element, value): void`、`fillContentEditable(element, value): boolean`（从 `page-utils.js` 导出，Task 4 的 page-interaction.js 消费）

- [ ] **Step 1: 在 page-utils.js 末尾追加三个函数（从 interaction-tools.js L158-210 原样移入）**

```js
// ==================== 表单输入辅助（page-interaction 与 interaction-tools 共享） ====================

/**
 * 检测元素是否为 contenteditable（自身或祖先节点）
 */
export function isContentEditableElement(el) {
  return el.isContentEditable || el.getAttribute('contenteditable') === 'true';
}

/**
 * 使用原型链 native setter 设置 input/textarea 的 value
 * 绕过 React 的 inputValueTracking 托管，确保受控组件能感知到值变化
 * 对非 React 的原生表单同样有效，无回归风险
 */
export function setNativeValue(element, value) {
  const proto = element.tagName === 'TEXTAREA'
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const nativeSetter = Object.getOwnPropertyDescriptor(proto, 'value');
  if (nativeSetter && nativeSetter.set) {
    nativeSetter.set.call(element, value);
  } else {
    element.value = value;
  }
}

/**
 * 填充 contenteditable / 富文本编辑器
 */
export function fillContentEditable(element, value) {
  try {
    element.focus();
    const supported = document.execCommand('insertText', false, value);
    if (!supported) {
      element.textContent = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  } catch (e) {
    try {
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    } catch {
      return false;
    }
  }
}
```

- [ ] **Step 2: interaction-tools.js 删除原 L155-210 三个函数定义，并在文件头 import 区追加**

```js
import { isContentEditableElement, setNativeValue, fillContentEditable } from './page-utils.js';
```

（若 import 区已有 `./page-utils.js` 的导入行，合并进该行，避免重复 import 语句）

- [ ] **Step 3: 跑全量单测确认无回归（行为纯移位，测试应全绿）**

Run: `npx vitest run`
Expected: 全部通过（尤其 `test/unit/content/interaction-tools.unit.test.js` 的 fillForm 5 分支用例）

- [ ] **Step 4: Commit**

```bash
git add src/content/page-utils.js src/content/interaction-tools.js
git commit -m "refactor(content): 输入辅助函数移位 page-utils 共享（setNativeValue 等）"
```

---

### Task 2: queryInteractiveElements 重写为树快照

**Files:**
- Modify: `src/content/page-interaction.js`（L1-278 区域重写：注册表 + 查询 + 删除 readAccessibilityTree；保留 getElementCount / scrollToText / interactByRef 原逻辑待 Task 3/4 改造）
- Rewrite: `test/unit/content/page-interaction.unit.test.js` 的 `queryInteractiveElements` 与 `readAccessibilityTree` 两个 describe 块（删后者）

**Interfaces:**
- Consumes: `generateUniqueSelector`（page-utils）、`deepQuerySelectorAll`（shadow-dom-utils）、`t`（i18n）
- Produces: `queryInteractiveElements(options) → { success, content: string, count, total, truncated, hint }`；内部 `registerElement(el, role, name) → ref:number`（Task 3 消费）

**背景决策（实现时严格遵守）：**
- 输出行格式：`{indent}{role} "{name}" [ref N] {attrs}`；无名称省略引号段；容器行 `{indent}{role}`（dialog/heading 带名称）
- 缩进 = 有效深度（交互元素/语义容器 +1；一般 div/span 透传不占深度）
- 语义容器集合（进树、不分配 ref）：`dialog, form, navigation, main, banner, contentinfo, table, row, heading`
- 剪枝（整棵跳过）：`hidden` 属性、`aria-hidden="true"`、`inert`、computed `display:none`
- 元素输出检查（跳过自身、不剪子树）：`visibility:hidden`（computed）
- 截断：先完整收集匹配交互元素得 `total`；取前 `maxResults`（默认 100）个为输出集；序列化时字符预算 `maxChars`（默认 6000）逐行扣减，超限停止并置 `truncated=true`
- **输出即注册**：只有真正输出行的元素才注册 ref（预算超限时先估算行长度，超限则不注册）
- `count` = 输出元素数；`content` 为最终树文本（首行统计 + 尾行提示）
- 删除 `readAccessibilityTree`（死代码）及其测试
- refCounter 模块级单调递增，跨查询不重置

- [ ] **Step 1: 重写测试文件的 query 区块（写失败测试）**

将 `test/unit/content/page-interaction.unit.test.js` 中 `describe('queryInteractiveElements - 可交互元素查询', ...)` 整体替换为以下内容，同时删除 `describe('readAccessibilityTree - 无障碍树', ...)` 块及头部 import 中的 `readAccessibilityTree`：

```js
describe('queryInteractiveElements - 树快照', () => {
  test('发现原生交互元素并输出树文本', () => {
    document.body.innerHTML = `
      <div><button id="b1">Save</button></div>
      <a href="/x">Link</a>
      <input type="text" placeholder="q">
    `;
    const r = queryInteractiveElements({});
    expect(r.success).toBe(true);
    expect(r.count).toBe(3);
    expect(r.total).toBe(3);
    expect(r.content.split('\n')[0]).toContain('3');       // 统计行
    expect(r.content).toContain('button "Save" [ref ');
    expect(r.content).toContain('link "Link" [ref ');
    expect(r.content).toContain('textbox');
    expect(r.content).toContain('placeholder="q"');
    expect(r.content).toContain('query_elements');          // 尾行提示
  });

  test('ARIA 角色/tabindex/contenteditable/summary 均被发现', () => {
    document.body.innerHTML = `
      <div role="tab"></div>
      <div role="treeitem"></div>
      <div tabindex="0"></div>
      <div contenteditable="true"></div>
      <details><summary>More</summary></details>
    `;
    const r = queryInteractiveElements({});
    expect(r.count).toBe(5);
    expect(r.content).toContain('tab');
    expect(r.content).toContain('treeitem');
    expect(r.content).toContain('button "More"');           // summary 推导为 button
  });

  test('display:none 与 aria-hidden 子树被剪枝', () => {
    document.body.innerHTML = `
      <div><button id="b1">A</button></div>
      <div style="display:none"><button id="b2">B</button></div>
      <div aria-hidden="true"><button id="b3">C</button></div>
    `;
    const r = queryInteractiveElements({});
    expect(r.count).toBe(1);
    expect(r.content).toContain('"A"');
  });

  test('div 透传不占缩进，语义容器占缩进', () => {
    document.body.innerHTML = `
      <div><div><button id="b1">Deep</button></div></div>
      <dialog id="d1"><button id="b2">InDlg</button></dialog>
    `;
    const r = queryInteractiveElements({});
    const lines = r.content.split('\n');
    expect(lines.some(l => l.startsWith(' button "Deep"'))).toBe(true);
    expect(lines.some(l => l.startsWith('dialog'))).toBe(true);
    expect(lines.some(l => l.startsWith(' button "InDlg"'))).toBe(true);
  });

  test('ref 编号跨快照单调递增不复用', () => {
    document.body.innerHTML = '<button id="b1">Go</button>';
    queryInteractiveElements({});
    const r1 = queryInteractiveElements({});
    const ref1 = Number(r1.content.match(/\[ref (\d+)\]/)[1]);
    const r2 = queryInteractiveElements({});
    const ref2 = Number(r2.content.match(/\[ref (\d+)\]/)[1]);
    expect(ref2).toBeGreaterThan(ref1);
  });

  test('filterByText 与 elementTypes 过滤', () => {
    document.body.innerHTML = `<button>Save</button><button>Cancel</button><a href="/">x</a>`;
    const r = queryInteractiveElements({ filterByText: 'save' });
    expect(r.count).toBe(1);
    const r2 = queryInteractiveElements({ elementTypes: ['a'] });
    expect(r2.count).toBe(1);
    expect(r2.content).toContain('link');
  });

  test('maxChars 字符预算截断并提示', () => {
    document.body.innerHTML = Array.from({ length: 50 },
      (_, i) => `<button>Button ${i} with some longer text content</button>`).join('');
    const r = queryInteractiveElements({ maxChars: 200 });
    expect(r.truncated).toBe(true);
    expect(r.content.length).toBeLessThan(400);
    expect(r.content).toContain('截断');
    expect(r.total).toBe(50);
    expect(r.count).toBeLessThan(50);
  });

  test('countOnly 只返回计数', () => {
    document.body.innerHTML = '<button>A</button><button>B</button>';
    const r = queryInteractiveElements({ countOnly: true });
    expect(r.count).toBe(2);
    expect(r.content).toBe('');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: FAIL（`r.content` undefined、count 语义不符等）

- [ ] **Step 3: 在 page-interaction.js 中新增 i18n 文案（扩充现有 pageInteraction 命名空间）**

zh 新增键：`snapshotHeader: '可交互元素快照：{count} 个元素'`、`snapshotTruncated: '（共 {total} 个，已截断，请用 filterByText 缩小范围）'`、`snapshotFooter: '（ref 编号仅当前快照有效；页面变化后请重新调用 query_elements）'`
en 新增键：`snapshotHeader: 'Interactive elements snapshot: {count} element(s)'`、`snapshotTruncated: ' (of {total} total; truncated — narrow down with filterByText)'`、`snapshotFooter: '(ref numbers are valid only for this snapshot; re-run query_elements after the page changes)'`

- [ ] **Step 4: 重写 page-interaction.js 核心段（注册表 + 判定 + 序列化 + 查询）**

在 import 区追加 `import { isContentEditableElement, setNativeValue, fillContentEditable } from './page-utils.js';`（合并进现有 page-utils import 行）。将 L40 注册表段至 `queryInteractiveElements` 结束（原 L278 前）替换为以下实现（`getElementCount`、`scrollToText`、`interactByRef`、`getSelectorByRef` 保留原逻辑在其后）：

```js
// ==================== 元素注册表（ref → element 映射） ====================

// ref 编号单调递增：跨快照不复用，避免旧 ref 在新快照中静默指向不同元素
let refCounter = 0;
const elementRegistry = new Map(); // ref → { element, selector, tag, role, name }

/**
 * 注册元素并返回 ref（内部兜底 selector 不对外暴露）
 */
function registerElement(el, role, name) {
  refCounter += 1;
  const ref = refCounter;
  let selector = '';
  try { selector = generateUniqueSelector(el); } catch { selector = ''; }
  elementRegistry.set(ref, { element: el, selector, tag: el.tagName, role, name });
  return ref;
}

// ==================== 遍历判定 ====================

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'checkbox', 'radio', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio', 'option', 'combobox', 'listbox',
  'searchbox', 'slider', 'spinbutton', 'textbox', 'treeitem',
]);

const CONTAINER_ROLES = new Set([
  'dialog', 'form', 'navigation', 'main', 'banner', 'contentinfo', 'table', 'row', 'heading',
]);

/**
 * 获取元素角色：显式 role 属性优先，否则按标签/类型推导隐式角色
 */
function getRole(el) {
  const explicit = el.getAttribute('role');
  const role = explicit ? explicit.trim().split(/\s+/)[0] : '';
  if (role) return role;
  const tag = el.tagName;
  if (tag === 'BUTTON') return 'button';
  if (tag === 'A') return el.hasAttribute('href') ? 'link' : '';
  if (tag === 'SELECT') return (el.multiple || el.size > 1) ? 'listbox' : 'combobox';
  if (tag === 'TEXTAREA') return 'textbox';
  if (tag === 'SUMMARY') return 'button';
  if (tag === 'IFRAME') return '';
  if (/^H[1-6]$/.test(tag)) return 'heading';
  if (tag === 'NAV') return 'navigation';
  if (tag === 'MAIN') return 'main';
  if (tag === 'DIALOG') return 'dialog';
  if (tag === 'FORM') return 'form';
  if (tag === 'TABLE') return 'table';
  if (tag === 'TR') return 'row';
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'hidden') return '';
    if (type === 'checkbox') return 'checkbox';
    if (type === 'radio') return 'radio';
    if (type === 'submit' || type === 'button' || type === 'reset') return 'button';
    if (type === 'search') return 'searchbox';
    if (type === 'range') return 'slider';
    if (type === 'number') return 'spinbutton';
    return 'textbox';
  }
  return '';
}

/**
 * 剪枝判定：返回 true 时整棵子树跳过
 * （display:none / hidden / aria-hidden / inert 均不可被子元素覆盖）
 */
function isSubtreePruned(el) {
  if (el.hasAttribute('hidden') || el.hasAttribute('inert')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.style && el.style.display === 'none') return true;
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  return !!style && style.display === 'none';
}

/**
 * 输出级可见性检查：不可见元素跳过自身（不剪子树——visibility 可被子元素覆盖）
 */
function isElementHidden(el) {
  if (typeof el.checkVisibility === 'function') {
    return !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
  }
  const style = typeof getComputedStyle === 'function' ? getComputedStyle(el) : null;
  if (!style) return false;
  return style.display === 'none' || style.visibility === 'hidden';
}

function isInteractiveElement(el, role) {
  if (INTERACTIVE_ROLES.has(role)) return true;
  if (el.tagName === 'A' && el.hasAttribute('href')) return true;
  if (el.hasAttribute('contenteditable')) {
    const v = el.getAttribute('contenteditable');
    if (v === '' || v === 'true' || v === 'plaintext-only') return true;
  }
  if (isContentEditableElement(el)) return true;
  const ti = el.getAttribute('tabindex');
  if (ti !== null && parseInt(ti, 10) >= 0) return true;
  if (el.hasAttribute('onclick')) return true;
  return false;
}

function getElementChildren(el) {
  const children = [];
  if (el.shadowRoot) children.push(...el.shadowRoot.children);
  children.push(...el.children);
  return children;
}

// ==================== 名称解析 ====================

/**
 * 无障碍名称解析链（取第一个非空），对未标记表单容错
 */
function resolveAccessibleName(el, role) {
  const trim = (s, max = 80) => {
    if (!s) return '';
    const text = String(s).replace(/\s+/g, ' ').trim();
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  };
  const textOf = (node) => trim(node ? node.textContent : '');

  // 1. select 选中项文本
  if (el.tagName === 'SELECT') {
    const opt = el.options && el.options[el.selectedIndex];
    if (opt) return trim(opt.text);
  }
  // 2. aria-labelledby（拼接引用元素文本）
  const labelledby = el.getAttribute('aria-labelledby');
  if (labelledby) {
    const joined = labelledby.split(/\s+/)
      .map(id => document.getElementById(id))
      .filter(Boolean).map(n => textOf(n)).filter(Boolean).join(' ');
    if (joined) return joined;
  }
  // 3. aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return trim(ariaLabel);
  // 4. 关联 label（label[for] 或包裹 label）
  if (el.id) {
    const forLabel = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
    if (forLabel) return textOf(forLabel);
  }
  const wrapLabel = el.closest && el.closest('label');
  if (wrapLabel) {
    const text = textOf(wrapLabel);
    if (text) return text;
  }
  // 5. placeholder
  if (el.getAttribute && el.getAttribute('placeholder')) return trim(el.getAttribute('placeholder'));
  // 6. title
  if (el.getAttribute && el.getAttribute('title')) return trim(el.getAttribute('title'));
  // 7. alt
  if (el.getAttribute && el.getAttribute('alt')) return trim(el.getAttribute('alt'));
  // 8. input 按钮类 value
  if (el.tagName === 'INPUT') {
    const type = (el.type || '').toLowerCase();
    if ((type === 'submit' || type === 'button' || type === 'reset') && el.value) return trim(el.value);
  }
  // 9. 元素直接文本（取直接子文本节点，避免吞掉深层交互元素文本）
  let ownText = '';
  for (const node of el.childNodes) {
    if (node.nodeType === 3) ownText += node.textContent;
  }
  if (!ownText.trim()) ownText = el.textContent || '';
  const t9 = trim(ownText);
  if (t9) return t9;
  // 10. 前兄弟文本（未标记表单场景；前兄弟自身不含交互元素才采用）
  let prev = el.previousElementSibling;
  while (prev && !prev.textContent.trim()) prev = prev.previousElementSibling;
  if (prev && !prev.querySelector('button, a[href], input, select, textarea')) {
    const t10 = textOf(prev);
    if (t10) return t10;
  }
  return '';
}

// ==================== 属性序列化 ====================

function buildAttributeText(el, role) {
  const parts = [];
  const clip = (s, max) => (s && s.length > max ? s.slice(0, max - 1) + '…' : s);
  if (role === 'link' && el.getAttribute('href')) {
    parts.push(`href="${clip(el.getAttribute('href'), 150)}"`);
  }
  if (el.tagName === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (type !== 'text' && type !== 'checkbox' && type !== 'radio') parts.push(`type="${type}"`);
  }
  const placeholder = el.getAttribute && el.getAttribute('placeholder');
  if (placeholder) parts.push(`placeholder="${clip(placeholder, 60)}"`);
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    if (el.value) parts.push(`value="${clip(el.value, 60)}"`);
  }
  if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio') && el.checked) {
    parts.push('checked="true"');
  }
  if (el.tagName === 'OPTION' && el.selected) parts.push('selected="true"');
  return parts.join(' ');
}

// ==================== 树序列化与查询 ====================

function matchesTypeFilter(el, role, types) {
  if (!types || !types.length) return true;
  const tag = el.tagName.toLowerCase();
  const inputType = el.tagName === 'INPUT' ? (el.type || '').toLowerCase() : '';
  return types.some(x => x === tag || x === inputType || x === role);
}

function matchesTextFilter(el, name, filterText) {
  if (!filterText) return true;
  const hay = `${name} ${el.textContent || ''} ${el.value || ''}`.toLowerCase();
  return hay.includes(String(filterText).toLowerCase());
}

/**
 * 查询可交互元素并输出树形快照
 */
export function queryInteractiveElements(options = {}) {
  const {
    filterByText = '',
    elementTypes = null,
    maxResults = 100,
    maxChars = 6000,
    countOnly = false,
  } = options;

  try {
    elementRegistry.clear();

    // 阶段 A：完整遍历，收集匹配的交互元素（有序）
    const matched = [];
    if (!countOnly) {
      collectMatches(document.body, { matched, filterByText, elementTypes });
      // 阶段 B：取输出集（maxResults 上限）
      const selected = new Set(matched.slice(0, maxResults).map(m => m.el));
      const tooMany = matched.length > maxResults;
      // 阶段 C：序列化（预算 maxChars，输出即注册）
      const ctx = { selected, budget: maxChars, truncated: false, count: 0 };
      const lines = [];
      renderTree(document.body, 0, lines, ctx);
      const truncated = ctx.truncated || tooMany;

      const header = t('pageInteraction.snapshotHeader', { count: ctx.count })
        + (truncated ? t('pageInteraction.snapshotTruncated', { total: matched.length }) : '');
      lines.unshift(header);
      lines.push(t('pageInteraction.snapshotFooter'));

      return {
        success: true,
        content: lines.join('\n'),
        count: ctx.count,
        total: matched.length,
        truncated,
        hint: t('pageInteraction.refHint'),
      };
    }

    // countOnly：只统计
    collectMatches(document.body, { matched, filterByText, elementTypes });
    return { success: true, content: '', count: matched.length, total: matched.length, truncated: false, hint: '' };
  } catch (error) {
    console.error('[PageInteraction] queryInteractiveElements failed:', error);
    return { success: false, error: error.message };
  }
}

function collectMatches(root, { matched, filterByText, elementTypes }) {
  if (isSubtreePruned(root)) return;
  const role = getRole(root);
  if (isInteractiveElement(root, role) && !isElementHidden(root) && matchesTypeFilter(root, role, elementTypes)) {
    const name = resolveAccessibleName(root, role);
    if (matchesTextFilter(root, name, filterByText)) {
      matched.push({ el: root, role, name });
    }
  }
  for (const child of getElementChildren(root)) {
    collectMatches(child, { matched, filterByText, elementTypes });
  }
}

/**
 * 递归渲染树行；返回本子树是否产生输出行
 * 缩进 = 有效深度：交互元素/语义容器 +1，一般容器透传
 */
function renderTree(el, depth, lines, ctx) {
  if (isSubtreePruned(el)) return false;
  const role = getRole(el);
  const interactive = isInteractiveElement(el, role);
  const container = !interactive && CONTAINER_ROLES.has(role) ? role : null;
  const childDepth = depth + ((interactive || container) ? 1 : 0);

  const childLines = [];
  let childProduced = false;
  for (const child of getElementChildren(el)) {
    if (renderTree(child, childDepth, childLines, ctx)) childProduced = true;
  }

  if (interactive && ctx.selected.has(el) && !isElementHidden(el)) {
    if (ctx.budget <= 0) { ctx.truncated = true; return false; }
    const name = resolveAccessibleName(el, role);
    const attrs = buildAttributeText(el, role);
    // 估算行长度（含 [ref NNNNN] 上限 12 字符）后再注册，保证输出=注册
    const estimate = depth + role.length + (name ? name.length + 2 : 0) + (attrs ? attrs.length + 1 : 0) + 12;
    if (ctx.budget - estimate < 0) { ctx.truncated = true; return false; }
    const ref = registerElement(el, role, name);
    const line = `${' '.repeat(depth)}${role}${name ? ` "${name}"` : ''} [ref ${ref}]${attrs ? ' ' + attrs : ''}`;
    ctx.budget -= line.length + 1;
    ctx.count += 1;
    lines.push(line, ...childLines); // DOM 顺序：父行在子行前
    return true;
  }

  if (container && childProduced) {
    const cname = (container === 'dialog' || container === 'heading')
      ? resolveAccessibleName(el, role) : '';
    const line = `${' '.repeat(depth)}${container}${cname ? ` "${cname}"` : ''}`;
    ctx.budget -= line.length + 1;
    lines.push(line, ...childLines);
    return true;
  }

  if (childProduced) {
    lines.push(...childLines);
    return true;
  }
  return false;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: 树快照 8 个用例 + getSelectorByRef/getElementCount/interactByRef/scrollToText 现存用例通过（interactByRef 的 `r.selector` 断言与"无效 ref"断言此时可能已失败——见 Step 6 处理）

- [ ] **Step 6: 修复本任务波及的现存用例（ref 硬编码失效）**

旧用例假设"每次查询 ref 从 1 开始"，单调递增打破该假设，须同步改为从 content 提取 ref：

`getSelectorByRef` describe 两个用例替换为：

```js
  test('query 后 ref 命中', () => {
    document.body.innerHTML = '<button id="b1">Go</button>';
    const r = queryInteractiveElements({});
    const ref = Number(r.content.match(/\[ref (\d+)\]/)[1]);
    expect(getSelectorByRef(ref)).toBe('#b1');
  });

  test('未注册的 ref 返回 null', () => {
    expect(getSelectorByRef(999999)).toBeNull();
    expect(getSelectorByRef(0)).toBeNull();
    expect(getSelectorByRef('abc')).toBeNull();
  });
```

`interactByRef` describe 三个用例中的 ref 获取方式替换为：

```js
    const r0 = queryInteractiveElements({});
    const ref = Number(r0.content.match(/\[ref (\d+)\]/)[1]);
```

（原 `queryInteractiveElements({});` + `interactByRef(1, ...)` 两行改为上述两行 + `interactByRef(ref, ...)`；"无效 ref" 用例改用 `interactByRef(999999, ...)`，其 `expect(r.selector)` 断言本任务保持不变，Task 3 再删）

- [ ] **Step 7: 全量单测 + Commit**

Run: `npx vitest run`
Expected: 全部通过

```bash
git add src/content/page-interaction.js test/unit/content/page-interaction.unit.test.js
git commit -m "feat(content): query_elements 升级为树形快照（全树发现/名称链/剪枝/单调 ref/截断）"
```

---

### Task 3: resolveByRef + 失效建议 + interactByRef 收敛

**Files:**
- Modify: `src/content/page-interaction.js`（getSelectorByRef / interactByRef 改造 + 新增 resolveByRef/getElementByRef）
- Modify: `test/unit/content/page-interaction.unit.test.js`（新增用例 + 更新 interactByRef 断言）

**Interfaces:**
- Produces: `resolveByRef(ref) → { entry, element } | { error: string }`；`getElementByRef(ref) → Element | null`（Task 5 消费）；`getSelectorByRef(ref) → string | null`（行为不变，select_dropdown 消费方）
- Consumes: `elementRegistry`（Task 2）、`deepQuerySelector`（shadow-dom-utils）

- [ ] **Step 1: 写失败测试（在 interactByRef describe 中追加/修改）**

```js
describe('resolveByRef / 失效建议', () => {
  test('失效 ref 报错含附近有效引用建议', async () => {
    document.body.innerHTML = '<button>A</button><button>B</button>';
    queryInteractiveElements({});
    // 用超前的 ref 模拟过期（单调递增保证未注册）
    const r = await interactByRef(999999, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('无效');
    expect(r.error).toContain('有效引用');
    expect(r.error).toContain('query_elements');
  });

  test('getElementByRef 返回有效元素', () => {
    document.body.innerHTML = '<input id="i1">';
    const r = queryInteractiveElements({});
    const ref = Number(r.content.match(/\[ref (\d+)\]/)[1]);
    const el = getElementByRef(ref);
    expect(el).toBeTruthy();
    expect(el.tagName).toBe('INPUT');
    expect(getElementByRef(999999)).toBeNull();
  });
});
```

更新 interactByRef 现有用例：删除 `expect(r.selector).toBe('#b1')`（返回值不再含 selector）；"无效 ref"用例改为 `expect(r.error).toContain('无效')` + `expect(r.error).toContain('query_elements')`（保持）。

import 区追加 `getElementByRef`。

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: FAIL（getElementByRef 未导出、错误文案不含建议）

- [ ] **Step 3: 实现 resolveByRef / getElementByRef，改造 getSelectorByRef 与 interactByRef**

在 page-interaction.js 现有 `getSelectorByRef` 位置替换为：

```js
/**
 * 统一 ref 解析：注册表命中 + isConnected 检查 + selector 兜底重查
 * 失败时返回带"附近有效引用"建议的错误信息，引导模型自我纠错
 */
export function resolveByRef(ref) {
  const refNum = parseInt(ref, 10);
  if (!refNum || !elementRegistry.has(refNum)) {
    return { error: buildInvalidRefMessage(refNum) };
  }
  const entry = elementRegistry.get(refNum);
  if (entry.element && entry.element.isConnected) {
    return { entry, element: entry.element };
  }
  const found = entry.selector ? deepQuerySelector(entry.selector) : null;
  if (found) {
    entry.element = found;
    return { entry, element: found };
  }
  return { error: buildInvalidRefMessage(refNum) };
}

/**
 * 构造失效 ref 的错误文案：附当前注册表中编号最接近的 ≤3 个有效引用
 */
function buildInvalidRefMessage(refNum) {
  let msg = t('pageInteraction.invalidRefSuggest', { ref: refNum });
  const alive = [...elementRegistry.entries()]
    .sort((a, b) => Math.abs(a[0] - refNum) - Math.abs(b[0] - refNum))
    .slice(0, 3);
  if (alive.length) {
    const list = alive
      .map(([r, e]) => `ref ${r} (${e.role || (e.tag && e.tag.toLowerCase()) || '?'}${e.name ? ` "${e.name}"` : ''})`)
      .join(', ');
    msg += t('pageInteraction.invalidRefSuggestions', { list });
  }
  msg += t('pageInteraction.invalidRefTail');
  return msg;
}

export function getSelectorByRef(ref) {
  const resolved = resolveByRef(ref);
  return resolved.element ? resolved.entry.selector : null;
}

export function getElementByRef(ref) {
  const resolved = resolveByRef(ref);
  return resolved.element || null;
}
```

i18n 新增（zh）：`invalidRefSuggest: '无效或已过期的元素引用 ref={ref}。'`、`invalidRefSuggestions: '最近快照中的有效引用：{list}。'`、`invalidRefTail: '如页面已变化，请重新调用 query_elements 获取最新快照'`
（en）：`invalidRefSuggest: 'Invalid or stale element ref={ref}. '`、`invalidRefSuggestions: 'Nearest valid refs from the latest snapshot: {list}. '`、`invalidRefTail: 'If the page has changed, re-run query_elements'`

`interactByRef` 改造要点（保留现有 click/hover 主体）：
1. 函数开头（现有 L400-422）替换为统一解析：

```js
  const refNum = parseInt(ref, 10);
  const resolved = resolveByRef(refNum);
  if (resolved.error) {
    return { success: false, error: resolved.error };
  }
  const { entry, element } = resolved;
```

2. 可见性检查、hover/click 分支保持原逻辑不变
3. hover 与 click 两处成功返回中**删除 `selector: entry.selector,` 一行**（其余字段保持）
4. 删除不再使用的 i18n 键 `invalidRefError` / `elementStaleError`（zh/en 两处；确认 `t('pageInteraction.invalidRefError')` 无其他消费方——`content/index.js` 的 select_dropdown 等不引用）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: 全部 PASS

- [ ] **Step 5: 全量单测 + Commit**

Run: `npx vitest run`

```bash
git add src/content/page-interaction.js test/unit/content/page-interaction.unit.test.js
git commit -m "feat(content): resolveByRef 失效建议 + interactByRef 返回收敛"
```

---

### Task 4: interact_element action=type 原子输入

**Files:**
- Modify: `src/content/page-interaction.js`（interactByRef 增加 type 分支 + typeIntoElement 辅助）
- Modify: `test/unit/content/page-interaction.unit.test.js`（新增 type 用例）

**Interfaces:**
- Consumes: `resolveByRef`、`setNativeValue`、`fillContentEditable`、`isContentEditableElement`（page-utils）
- Produces: `interactByRef(ref, 'type', { value, clear, submit, waitTime, timeout })` 可被 handler 调用（Task 6 透传 `value/clear/submit`）

- [ ] **Step 1: 写失败测试（新增 describe）**

```js
describe('interactByRef - type 原子输入', () => {
  const refOf = () => {
    const r = queryInteractiveElements({});
    return Number(r.content.match(/\[ref (\d+)\]/)[1]);
  };

  test('输入文本并派发 input/change 事件', async () => {
    document.body.innerHTML = '<input id="i1" type="text">';
    const ref = refOf();
    const events = [];
    const el = document.getElementById('i1');
    el.addEventListener('input', () => events.push('input'));
    el.addEventListener('change', () => events.push('change'));
    const r = await interactByRef(ref, 'type', { value: 'hello', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(el.value).toBe('hello');
    expect(events).toContain('input');
    expect(events).toContain('change');
  });

  test('clear=true 先清空再输入', async () => {
    document.body.innerHTML = '<input id="i1" value="old">';
    const ref = refOf();
    const r = await interactByRef(ref, 'type', { value: 'new', clear: true, waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(document.getElementById('i1').value).toBe('new');
  });

  test('submit=true 派发 Enter 序列', async () => {
    document.body.innerHTML = '<input id="i1">';
    const ref = refOf();
    const keys = [];
    document.getElementById('i1').addEventListener('keydown', e => keys.push(e.key));
    const r = await interactByRef(ref, 'type', { value: 'x', submit: true, waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(keys).toContain('Enter');
  });

  test('checkbox 拒绝文本输入', async () => {
    document.body.innerHTML = '<input id="c1" type="checkbox">';
    const ref = refOf();
    const r = await interactByRef(ref, 'type', { value: 'x', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('不支持');
  });

  test('value 为空报错', async () => {
    document.body.innerHTML = '<input id="i1">';
    const ref = refOf();
    const r = await interactByRef(ref, 'type', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('value');
  });

  test('contenteditable 走富文本路径', async () => {
    document.body.innerHTML = '<div id="ce" contenteditable="true"></div>';
    const ref = refOf();
    const r = await interactByRef(ref, 'type', { value: 'rich', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(document.getElementById('ce').textContent).toBe('rich');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: FAIL（type 分支不存在，走默认 click 分支）

- [ ] **Step 3: 实现 type 分支**

在 interactByRef 的 action 分发处（hover 分支前）新增：

```js
  if (action === 'type') {
    const sigBefore = getDomSignature();
    const typeResult = typeIntoElement(element, options.value, options);
    if (!typeResult.success) {
      return { success: false, error: typeResult.error };
    }
    const wait = await autoWaitAfterAction(sigBefore, waitTime, timeout);
    const changeHint = wait.changed
      ? t(wait.urlChanged ? 'pageInteraction.navChangeHint' : 'pageInteraction.domChangeHint', { ms: wait.waitedMs })
      : '';
    return {
      success: true,
      message: t('pageInteraction.typedByRef', { ref: refNum, tag: entry.tag, hint: changeHint }),
      ...wait,
    };
  }
```

辅助函数（文件内）：

```js
/**
 * 原子输入：聚焦 + 可选清空 + 设值/富文本写入 + 事件 + 可选 Enter 提交
 */
function typeIntoElement(el, value, { clear = false, submit = false } = {}) {
  if (value == null || value === '') {
    return { success: false, error: t('pageInteraction.valueRequired') };
  }
  const tag = el.tagName;
  const editable = isContentEditableElement(el);
  if (tag === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (['checkbox', 'radio', 'file', 'submit', 'button', 'reset', 'image'].includes(type)) {
      return { success: false, error: t('pageInteraction.typeNotSupported', { tag: `<input type="${type}">` }) };
    }
  } else if (tag !== 'TEXTAREA' && !editable) {
    return { success: false, error: t('pageInteraction.typeNotSupported', { tag: `<${tag.toLowerCase()}>` }) };
  }
  try { el.focus(); } catch { /* 忽略聚焦失败 */ }

  const isRich = editable && tag !== 'INPUT' && tag !== 'TEXTAREA';
  if (isRich) {
    if (clear) fillContentEditable(el, '');
    const ok = fillContentEditable(el, value);
    if (!ok) return { success: false, error: t('pageInteraction.typeFailed') };
  } else {
    if (clear) {
      setNativeValue(el, '');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
    setNativeValue(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  if (submit) {
    const keyOpts = { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true, cancelable: true };
    el.dispatchEvent(new KeyboardEvent('keydown', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keypress', keyOpts));
    el.dispatchEvent(new KeyboardEvent('keyup', keyOpts));
  }
  return { success: true };
}
```

i18n 新增（zh）：`typedByRef: '已向元素 ref={ref}（{tag}）输入文本{hint}'`、`typeNotSupported: '元素 {tag} 不支持文本输入（checkbox/radio 请用 fill_form 或 click）'`、`valueRequired: 'action=type 时 value 不能为空'`、`typeFailed: '文本输入失败'`
（en）：`typedByRef: 'Typed text into element ref={ref} ({tag}){hint}'`、`typeNotSupported: 'Element {tag} does not support text input (use fill_form or click for checkbox/radio)'`、`valueRequired: 'value is required when action=type'`、`typeFailed: 'Text input failed'`

（`typeNotSupported` 文案不含 `{ref}` 参数，仅含 `{tag}`——元素句柄（如 `<input type="checkbox">`）本身已描述清楚。）

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: 全部 PASS（jsdom 的 KeyboardEvent 需在 keyOpts 中包含 bubbles；若 jsdom 对 keyCode 只读属性报错，改用 `new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })`）

- [ ] **Step 5: 全量单测 + Commit**

```bash
git add src/content/page-interaction.js test/unit/content/page-interaction.unit.test.js
git commit -m "feat(content): interact_element 增加 action=type 原子输入"
```

---

### Task 5: fill_form 支持 ref 定位

**Files:**
- Modify: `src/content/interaction-tools.js`（fillForm 循环内定位逻辑，L215-225 区域）
- Modify: `test/unit/content/interaction-tools.unit.test.js`（新增 ref 用例）

**Interfaces:**
- Consumes: `getElementByRef`（page-interaction，Task 3）

- [ ] **Step 1: 写失败测试（fillForm describe 内追加）**

```js
test('field.ref 定位优先于 selector', async () => {
  document.body.innerHTML = '<input id="i1"><input id="i2">';
  const { queryInteractiveElements } = await import('../../../src/content/page-interaction.js');
  queryInteractiveElements({});
  const snapshot = queryInteractiveElements({});
  const refs = [...snapshot.content.matchAll(/\[ref (\d+)\]/g)].map(m => Number(m[1]));
  const r = fillForm([{ ref: refs[0], value: 'via-ref' }]);
  expect(r.success).toBe(true);
  expect(document.getElementById('i1').value).toBe('via-ref');
});
```

（测试文件顶部已有 import 的话直接使用，不必动态 import；此文件当前是否 import page-interaction 以实际为准——若循环依赖风险存在（interaction-tools → page-interaction），改为在 `fillForm` 内部按需 import 亦可，但 ES module 静态 import 无循环问题：page-interaction 不 import interaction-tools）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/content/interaction-tools.unit.test.js`
Expected: FAIL（field.ref 被忽略，deepQuerySelector(undefined) 失败 → 未找到元素）

- [ ] **Step 3: 实现 fillForm ref 支持**

interaction-tools.js import 区追加：`import { getElementByRef } from './page-interaction.js';`

`fillForm` 循环内 `const { selector, value, fieldType = 'text' } = field;` 改为：

```js
const { selector, ref, value, fieldType = 'text' } = field;
let element = null;
if (ref != null) {
  element = getElementByRef(ref);
} else if (selector) {
  element = deepQuerySelector(selector);
}
```

后续 `if (!element)` 分支的错误信息：`elementNotFound` 保持不变；results.push 的标识字段 `selector` 改为 `selector: selector || `ref=${ref}``（保证 details 可读）。

- [ ] **Step 4: 运行测试确认通过 + 全量单测**

Run: `npx vitest run test/unit/content/interaction-tools.unit.test.js && npx vitest run`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/content/interaction-tools.js test/unit/content/interaction-tools.unit.test.js
git commit -m "feat(content): fill_form 字段支持 ref 定位（优先于 selector）"
```

---

### Task 6: handler 透传 + 工具定义 + i18n

**Files:**
- Modify: `src/content/index.js:101-110`（INTERACT_ELEMENT handler）
- Modify: `src/background/tools/browser-tools.js`（L5-29 interact_element、L143-176 fill_form、L296-319 query_elements）
- Modify: `src/shared/locales/zh.js:633,639,645`、`src/shared/locales/en.js:633,639,645`

**Interfaces:**
- Consumes: `interactByRef(ref, 'type', { value, clear, submit })`（Task 4）；CONTENT_PAYLOADS 自动从 properties 派生（无需改 tool-executor.js）

- [ ] **Step 1: index.js handler 透传新参数**

```js
INTERACT_ELEMENT:           (msg) => {
  if (msg.ref != null) {
    return interactByRef(msg.ref, msg.action, {
      waitTime: msg.waitTime, timeout: msg.timeout,
      value: msg.value, clear: msg.clear, submit: msg.submit,
    });
  }
  ...
```

- [ ] **Step 2: browser-tools.js 三处定义更新**

interact_element（L13-24 区域）：

```js
description: 'Interact with a page element. Locate via ref (recommended, from query_elements), text, or CSS selector. action=click/hover/type; type enters text into an input field (requires value, optional clear/submit)',
parameters: {
  type: 'object',
  properties: {
    action: { type: 'string', enum: ['click', 'hover', 'type'] },
    tabId: { type: 'integer', description: 'Omit to use active tab' },
    ref: { type: 'integer', description: 'Index returned by query_elements (recommended); valid only for the latest snapshot, re-query after page changes' },
    value: { type: 'string', description: 'Text to enter into the field (required for action=type)' },
    clear: { type: 'boolean', description: 'Clear existing value before typing (action=type)' },
    submit: { type: 'boolean', description: 'Press Enter after typing (action=type)' },
    text: { type: 'string', description: 'Match element by text (e.g. "Login"), click on first match' },
    tag: { type: 'string', description: 'Restrict tag with text, e.g. button/a' },
    selector: { type: 'string', description: 'CSS selector (used when neither ref nor text provided); avoid long nth-child chains' },
    waitTime: { type: 'integer' },
    timeout: { type: 'integer' }
  },
  required: ['action']
}
```

fill_form fields.items（L154-161 区域）：

```js
properties: {
  ref: { type: 'integer', description: 'ref from query_elements; takes priority over selector' },
  selector: { type: 'string', description: 'CSS selector (alternative to ref)' },
  value: { type: 'string' },
  fieldType: { type: 'string', enum: ['text', 'select', 'checkbox', 'radio', 'contenteditable'] }
},
required: ['value']
```

query_elements（L304-315 区域）：

```js
description: 'Query interactive elements and return a tree-formatted snapshot with [ref N] numbers for interact_element/fill_form. Recommended as the primary element locating method. The snapshot is valid only for the current page state — re-query after the page changes. Use filterByText to narrow results when truncated',
parameters: {
  type: 'object',
  properties: {
    tabId: { type: 'integer', description: 'Omit to use active tab' },
    filterByText: { type: 'string', description: 'Only include elements whose text matches (case-insensitive)' },
    elementTypes: {
      type: 'array',
      items: { type: 'string', enum: ['button', 'a', 'input', 'select', 'textarea', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'link'] }
    },
    maxResults: { type: 'integer', description: 'Max elements to output (default 100)' },
    maxChars: { type: 'integer', description: 'Character budget of the snapshot (default 6000)' },
    countOnly: { type: 'boolean' }
  },
  required: []
}
```

- [ ] **Step 3: locales zh/en 同步**

zh.js L633/639/645 替换为：

```js
interact_element: '交互页面元素（ref/文本/选择器定位；支持 click/hover/type 输入）',
fill_form: '批量填写多个表单字段（支持 ref 定位）',
query_elements: '查询可交互元素，返回树形快照与 ref 编号（页面变化后需重新查询）',
```

en.js 对应行：

```js
interact_element: 'Interact with page element (locate via ref/text/selector; click/hover/type)',
fill_form: 'Fill multiple form fields at once (supports ref)',
query_elements: 'Query interactive elements, returns tree snapshot with ref numbers (re-query after page changes)',
```

- [ ] **Step 4: 单测 + 构建验证**

Run: `npx vitest run && npm run build:silent`
Expected: 单测全绿（tool-definitions schema 合规测试覆盖新参数）；构建成功

- [ ] **Step 5: Commit**

```bash
git add src/content/index.js src/background/tools/browser-tools.js src/shared/locales/zh.js src/shared/locales/en.js
git commit -m "feat(tools): query_elements/interact_element/fill_form 定义与描述更新（树快照 + type 输入 + ref）"
```

---

### Task 7: e2e 更新与全量验证

**Files:**
- Modify: `test/e2e/content-tools.e2e.spec.js`（query_elements → interact_element 区块 L20-42）
- Verify: `test/e2e/demo-product-form.e2e.spec.js`（跑通即可，若断言依赖旧 JSON 结构则同步更新）

- [ ] **Step 1: 更新 content-tools e2e 断言**

"查询按钮并用 ref 点击"用例中：

```js
const result = await callTool(page, 'queryInteractiveElements', { filterByText: 'submit' });
expect(result.success).toBe(true);
expect(result.content).toContain('[ref ');
const ref = Number(result.content.match(/\[ref (\d+)\]/)[1]);
```

新增 type 链路用例：

```js
test('type 输入链路', async ({ page }) => {
  await page.goto(fixtureUrl('form-page.html'));
  const snapshot = await callTool(page, 'queryInteractiveElements', { filterByText: 'username' });
  expect(snapshot.content).toContain('[ref ');
  const ref = Number(snapshot.content.match(/\[ref (\d+)\]/)[1]);
  const r = await callTool(page, 'interactByRef', ref, 'type', { value: 'bob', waitTime: 0, timeout: 0 });
  expect(r.success).toBe(true);
  expect(await page.inputValue('#username')).toBe('bob');
});
```

（`callTool` 的实参形态以该文件现有 helper 为准，保持一致）

- [ ] **Step 2: 运行 e2e（相关 spec）**

Run: `npx playwright test test/e2e/content-tools.e2e.spec.js test/e2e/demo-product-form.e2e.spec.js`
Expected: 全部通过；demo-product-form 若失败，检查其是否直接断言 `result.elements`——如是，改为 `result.content` 树文本断言

- [ ] **Step 3: 全量回归 + 构建**

Run: `npx vitest run && npm run build:silent`
Expected: 全绿 + 构建成功

- [ ] **Step 4: 真实页冒烟（手动）**

用已构建的扩展在 `docs/demo/form-autofill/product-form.html` 走一遍：
1. `query_elements` 观察树文本（dialog "添加产品" 容器行、textbox "名称" [ref N]、截断提示）
2. `interact_element(ref, type, value)` 输入名称 → 观察 React 受控组件是否同步
3. 页面变化后使用旧 ref → 观察错误信息是否含"最近快照中的有效引用"

- [ ] **Step 5: Commit**

```bash
git add test/e2e/content-tools.e2e.spec.js test/e2e/demo-product-form.e2e.spec.js
git commit -m "test(e2e): 树快照链路断言更新 + type 输入链路覆盖"
```

---

## 自审记录

- **Spec 覆盖**：3.1 树格式（Task 2）、3.2 发现（Task 2）、3.3 名称链（Task 2 Step 4）、3.4 注册表/建议（Task 2+3）、3.5 原子输入（Task 4+5+6）、3.6 描述/i18n（Task 6）、测试计划（Task 2-7）✅
- **参数命名**：type 输入内容参数全局使用 `value`（避免与 text 定位参数冲突），spec 已同步修订 ✅
- **类型一致性**：`registerElement`、`resolveByRef`、`getElementByRef`、`interactByRef` 签名在各任务间一致 ✅
- **已知边界**：jsdom 无 `checkVisibility` 走 style fallback（Task 2 实现已含探测）；jsdom KeyboardEvent 的 keyCode 只读属性若报错，按 Task 4 Step 4 备注降级处理
