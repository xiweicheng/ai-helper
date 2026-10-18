# 主题切换（白天/黑夜）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为扩展侧边栏、配置页、划词浮层实现 light/dark/system 三态主题切换，基于 62 个语义 CSS token 与脚本化批量映射。

**Architecture:** `document.documentElement[data-theme]` + `:root`/`[data-theme="dark"]` 两套 CSS 变量；`src/shared/theme.js` 统一读写 `appTheme`（chrome.storage.local）并经 `storage.onChanged` 跨环境同步；色值迁移由 `scripts/theme-migrate.py` 按映射表机械替换，暗色泄漏由 Playwright 探针的对比度扫描断言把关。

**Tech Stack:** 原生 ES modules、CSS 自定义属性、Vitest（单测）、Playwright（视觉探针）、Python3（迁移/对比度脚本）。

**Spec:** `docs/superpowers/specs/2026-10-18-theme-switching-design.md`（本计划逐节对应其 §3–§11；token 值表、映射表、验收清单以 spec 为唯一数据源）

## Global Constraints

- 工作目录：worktree `.worktrees/theme-switching`，分支 `feat/theme-switching`。
- 每任务退出门禁：`npm run build:silent` 通过 → `npx eslint src --ext .js` 0 error → `npm run test:unit` 全量通过 → 任务内专项断言通过 → 独立 commit。
- storage key 恒为 `appTheme`，值域 `'light'|'dark'|'system'`，默认 `'light'`。
- i18n 文案渲染时动态查询，禁止缓存翻译结果；zh/en 两个 locale 文件同步补 key。
- 开关类 UI 变更即持久化（change 监听直接 `chrome.storage.local.set`）。
- 硬编码零残留检查的白名单（允许保留字面量）：on-color 家族（`#764ba2` `#f093fb` `#f5576c` `#ff4757` `#ff3344`、彩色底上 `rgba(255,255,255,α≤0.45)`）、`chat-export.js`/PDF 纸张色（`#ffffff` 底 + 深灰字）、qrcode 前景 `#000000`、划词注入页的 `--mark-bg #fff3a0`、`#552222`。
- 探针脚本一律放 `test-results-probes/`（`playwright test` 会清空 `test-results/`）。
- 禁止网络下载第三方资源（暗色 markdown 采用自写覆盖样式，不引入新库文件）。

---

### Task 1: theme.css — token 双主题定义

**Files:**
- Create: `src/shared/theme.css`
- Modify: `side_panel.html`（`<head>` 内、`styles.css` 的 link 之前插入）
- Modify: `options.html`（同样置于 `src/options/styles.css` link 之前）

**Interfaces:**
- Produces: 62 个 CSS 自定义属性（命名见 spec §4.2 表格），`:root` 亮色块 + `[data-theme="dark"]` 暗色块；后续所有 CSS/JS 任务只引用这些变量名。

- [ ] **Step 1: 创建 theme.css**

按 spec §4.2 的六张表逐行转录为 CSS。两个块的结构（值全部取自 spec，不得即兴改值）：

```css
/* 主题 token —— 值表来源：docs/superpowers/specs/2026-10-18-theme-switching-design.md §4.2 */
:root {
  --bg-page: #ffffff; --bg-surface: #ffffff; --bg-elevated: #ffffff;
  --bg-subtle: #f5f7fa; --bg-sunken: #f0f2f5; --bg-disabled: #f0f0f0;
  --bg-hover: rgba(0,0,0,0.05); --bg-active: rgba(102,126,234,0.12);
  --surface-rgb: 255,255,255;
  --text-primary: #333333; --text-secondary: #666666; --text-tertiary: #999999;
  --text-disabled: #bbbbbb; --text-inverse: #ffffff; --text-link: #4a90d9;
  --text-on-brand: #ffffff;
  --brand-500: #667eea; --brand-600: #5a6fd6; --brand-700: #4c5bd4;
  --brand-fill: #667eea; --brand-accent: #764ba2;
  --brand-violet-500: #8b5cf6; --brand-violet-600: #6d28d9;
  --brand-soft-bg: #f0f4ff; --brand-soft-border: #c9d4f5;
  --brand-violet-soft-bg: #f3f1ff;
  --brand-rgb: 102,126,234; --brand-violet-rgb: 139,92,246;
  --brand-accent-rgb: 118,75,162; --bg-page-rgb: 245,247,250;
  --brand-gradient: linear-gradient(135deg, #667eea, #764ba2);
  --border-subtle: #eeeeee; --border-default: #e0e0e0; --border-strong: #cccccc;
  --divider: #f0f0f0;
  --danger-500: #e53e3e; --danger-strong: #c53030; --danger-soft-text: #fc8181;
  --danger-soft-bg: #fef2f2; --danger-soft-border: #fecaca; --danger-rgb: 229,62,62;
  --success-500: #22c55e; --success-strong: #2f855a;
  --success-soft-bg: #e0f5e8; --success-soft-border: #c6f0d4; --success-rgb: 34,197,94;
  --warning-500: #f59e0b; --warning-strong: #b45309; --warning-text-soft: #856404;
  --warning-soft-bg: #fef3c7; --warning-soft-border: #fde68a; --warning-rgb: 245,158,11;
  --info-500: #4a90d9; --info-strong: #1a73e8;
  --info-soft-bg: #e8f0fe; --info-soft-border: #d6e4ff; --info-rgb: 74,144,217;
  --scrim: rgba(0,0,0,0.5); --overlay-rgb: 0,0,0;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.15);
  --shadow-lg: 0 8px 28px rgba(0,0,0,0.25);
  --tooltip-bg: rgba(30,30,30,0.92);
  --scrollbar-thumb: #c1c1c1; --selection-bg: rgba(102,126,234,0.25);
  --mark-bg: #fff3a0; --paper: #ffffff;
}
[data-theme="dark"] {
  /* 同序暗色值：--bg-page:#16181d; --bg-surface:#1e2128; --bg-elevated:#262a33;
     --bg-subtle:#22262e; --bg-sunken:#12151a; --bg-disabled:#2a2f38;
     --bg-hover:rgba(255,255,255,0.07); --bg-active:rgba(141,162,242,0.16);
     --surface-rgb:30,33,40; --text-primary:#e8eaef; --text-secondary:#b8bec9;
     --text-tertiary:#8b93a1; --text-disabled:#6b7280; --text-inverse:#16181d;
     --text-link:#7fb3e8; --brand-500:#8da2f2; --brand-600:#7d92ec;
     --brand-700:#6d84ee; --brand-fill:#566ad3; --brand-accent:#6f4b99;
     --brand-violet-500:#a78bfa; --brand-violet-600:#b7a4f5;
     --brand-soft-bg:#232a3d; --brand-soft-border:#3d4c6e;
     --brand-violet-soft-bg:#2b2440; --brand-rgb:141,162,242;
     --brand-violet-rgb:167,139,250; --brand-accent-rgb:111,75,153;
     --brand-gradient:linear-gradient(135deg,#566ad3,#6f4b99);
     --border-subtle:#2e343d; --border-default:#3a404c; --border-strong:#4a5160;
     --divider:#262b33; --danger-500:#fc8181; --danger-strong:#f87171;
     --danger-soft-text:#fca5a5; --danger-soft-bg:#3a2628; --danger-soft-border:#57353a;
     --danger-rgb:252,129,129; --success-500:#6fdba0; --success-strong:#9ae6b4;
     --success-soft-bg:#1f3a2a; --success-soft-border:#375c42; --success-rgb:111,219,160;
     --warning-500:#fbbf24; --warning-strong:#d9a441; --warning-text-soft:#fcd34d;
     --warning-soft-bg:#3d3220; --warning-soft-border:#5f4d24; --warning-rgb:251,191,36;
     --info-500:#7fb3e8; --info-strong:#a8c8f0; --info-soft-bg:#1f2b3d;
     --info-soft-border:#35486b; --info-rgb:127,179,232;
     --scrim:rgba(0,0,0,0.7); --overlay-rgb:255,255,255;
     --shadow-sm:0 1px 3px rgba(0,0,0,0.4); --shadow-md:0 4px 12px rgba(0,0,0,0.5);
     --shadow-lg:0 8px 28px rgba(0,0,0,0.6); --tooltip-bg:#3c424e;
     --scrollbar-thumb:#3a404c; --selection-bg:rgba(141,162,242,0.35); */
}
```

注意 `[data-theme="dark"]` 块必须写成真实 CSS（上面注释仅为本计划压缩展示），每个 token 一行。

- [ ] **Step 2: 补充通用基底规则**（同文件末尾）

```css
::selection { background: var(--selection-bg); }
html[data-theme="dark"] .markdown-body { background-color: transparent; }
```

- [ ] **Step 3: 两个 HTML 接入 link**。`side_panel.html` 与 `options.html` 在各自第一个 `<link rel="stylesheet">`（styles.css）**之前**插入：

```html
<link rel="stylesheet" href="src/shared/theme.css">
```

（options.html 中相对路径按其现有 link 写法对齐，如构建管线重组则随构建规则，先读该文件头部确认。）

- [ ] **Step 4: 视觉回归确认亮色不变**：`npm run build:silent` 后用既有探针方式打开 `dist/side_panel.html`，页面无样式错乱、与改造前目视一致（token 未被引用前此任务纯增量）。

- [ ] **Step 5: Commit** `git add src/shared/theme.css side_panel.html options.html && git commit -m "feat(theme): 新增语义 token 双主题定义 theme.css"`

---

### Task 2: theme.js — 主题读写与跨环境同步

**Files:**
- Create: `src/shared/theme.js`
- Test: `test/unit/theme.unit.test.js`
- Modify: `side_panel.html`、`options.html`（head 引入 boot 脚本，见 Step 4）

**Interfaces:**
- Consumes: storage key `appTheme`；`document.documentElement` 的 `data-theme` 属性。
- Produces: `initTheme(): Promise<void>`、`getTheme(): 'light'|'dark'|'system'`（偏好）、`getResolvedTheme(): 'light'|'dark'`（生效值）、`setTheme(pref)`、`subscribeTheme(cb: (resolved:string)=>void)`。Task 4/6/8/9/12/13 依赖这些导出名。

- [ ] **Step 1: 写失败测试** `test/unit/theme.unit.test.js`

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

function mockStorage(initial = {}) {
  const data = { ...initial };
  const listeners = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn((keys, cb) => {
          const out = {}; (Array.isArray(keys)?keys:[keys]).forEach(k => { if (k in data) out[k] = data[k]; });
          if (cb) return cb(out); return Promise.resolve(out);
        }),
        set: vi.fn((obj, cb) => { Object.assign(data, obj); if (cb) cb(); return Promise.resolve(); })
      },
      onChanged: { addListener: cb => listeners.push(cb) }
    }
  };
  return { data, listeners };
}

describe('theme.js', () => {
  beforeEach(() => { vi.resetModules(); document.documentElement.removeAttribute('data-theme'); });

  it('默认 light 且写入 data-theme=light', async () => {
    mockStorage({});
    const { initTheme, getResolvedTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    expect(getResolvedTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setTheme(dark) 落盘 appTheme 并翻转属性', async () => {
    mockStorage({});
    const { initTheme, setTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    await setTheme('dark');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ appTheme: 'dark' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('system 偏好按 prefers-color-scheme 解析并订阅变化', async () => {
    mockStorage({ appTheme: 'system' });
    let mqHandler = null;
    const mq = { matches: true, addEventListener: (t, cb) => { mqHandler = cb; }, removeEventListener: () => {} };
    vi.stubGlobal('matchMedia', (q) => { expect(q).toContain('prefers-color-scheme'); return mq; });
    const { initTheme, getResolvedTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    expect(getResolvedTheme()).toBe('dark');
    mq.matches = false; mqHandler && mqHandler();
    expect(getResolvedTheme()).toBe('light');
  });

  it('storage.onChanged 跨页同步翻转', async () => {
    const s = mockStorage({});
    const { initTheme, getResolvedTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    const listener = s.listeners[0];
    listener({ appTheme: { newValue: 'dark' } }, 'local');
    expect(getResolvedTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
```

- [ ] **Step 2: 运行确认失败**：`npx vitest run test/unit/theme.unit.test.js` → FAIL（模块不存在）。注意 chrome mock 同时支持回调与 Promise 形态（已在 mock 内实现）。

- [ ] **Step 3: 实现 theme.js**（ES module，供 side_panel/options import；content 端如需非 module 场景走 Task 12 的注入方案）

```js
const KEY = 'appTheme';
const VALID = ['light', 'dark', 'system'];
let preference = 'light';
let resolved = 'light';
let mq = null;
let mqHandler = null;
const subscribers = [];
let listenerBound = false;

function apply(next) {
  resolved = next;
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', next);
  }
  try { localStorage.setItem('appThemeResolved', next); } catch (e) { /* 隐私模式兜底 */ }
  subscribers.slice().forEach(cb => { try { cb(next); } catch (e) { console.warn('[theme] subscriber error', e); } });
}

function resolve(pref) {
  if (pref === 'system') {
    return (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  }
  return pref === 'dark' ? 'dark' : 'light';
}

export function getTheme() { return preference; }
export function getResolvedTheme() { return resolved; }
export function subscribeTheme(cb) { subscribers.push(cb); }

export async function initTheme() {
  if (typeof matchMedia !== 'undefined') {
    mq = matchMedia('(prefers-color-scheme: dark)');
    if (mqHandler) mq.removeEventListener('change', mqHandler);
    mqHandler = () => { if (preference === 'system') apply(resolve('system')); };
    mq.addEventListener('change', mqHandler);
  }
  if (!listenerBound && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && changes.appTheme && VALID.includes(changes.appTheme.newValue)) {
        preference = changes.appTheme.newValue;
        apply(resolve(preference));
      }
    });
    listenerBound = true;
  }
  const stored = await new Promise((r) => chrome.storage.local.get([KEY], (o) => r(o || {})));
  preference = VALID.includes(stored[KEY]) ? stored[KEY] : 'light';
  apply(resolve(preference));
}

export async function setTheme(pref) {
  if (!VALID.includes(pref)) return;
  preference = pref;
  apply(resolve(pref));
  await new Promise((r) => chrome.storage.local.set({ appTheme: pref }, r));
}
```

- [ ] **Step 4: 防闪烁 boot**。Create `src/shared/theme-boot.js`（非 module 同步脚本，head 最先引入，早于一切渲染样式）：

```js
// 用 localStorage 镜像做首帧校正，正式值由 theme.js initTheme() 从 storage 覆盖
(function () {
  try {
    var v = localStorage.getItem('appThemeResolved');
    if (v === 'dark' || v === 'light') document.documentElement.setAttribute('data-theme', v);
  } catch (e) {}
})();
```

在 `side_panel.html`/`options.html` 的 `<head>` 最前（theme.css link 之前）加 `<script src="src/shared/theme-boot.js"></script>`（路径写法对齐该文件现有 script 引入）。

- [ ] **Step 5: 页面接线**：`src/side_panel/index.js` 与 `src/options/index.js` 启动流程中 `import { initTheme } from '../shared/theme.js'` 并 `await initTheme()`（options 尽早、side panel 在 DOM ready 后立刻，其余初始化不依赖它）。
- [ ] **Step 6: `npx vitest run test/unit/theme.unit.test.js` 4 用例 PASS → 全量 `npm run test:unit` PASS → build:silent → Commit** `feat(theme): theme.js 三态读写与跨环境同步 + 防闪烁 boot`

---

### Task 3: theme-migrate.py — 批量映射执行器 + 零残留检查

**Files:**
- Create: `scripts/theme-migrate.py`
- Create: `scripts/theme-map.json`（数据源：spec §6.1–6.4 三张表逐值转录，格式 `{"token": "brand-500", "values": ["#667eea"], "context": "..."}`；rgba 族按 spec §5/§6 的三元组表转录）
- Test: `test/unit/theme-migrate-map.unit.test.js`

**Interfaces:**
- Produces: CLI `python3 scripts/theme-migrate.py <file...>`（就地替换，输出未命中报告）与 `--check <file...>`（发现表外色值即 exit 1）；支持 `--ranges "120-340,500-780"` 限定替换行段、`--mode js` 切换字符串内色值处理、`--missing`/`--missing-rgba` 输出表外色值 JSON 清单；Task 5–11 全部用它执行替换。

- [ ] **Step 1: 转录映射表到 scripts/theme-map.json**——打开 spec §6.1/6.2/6.3 三表，`token|源值×次数` 每行拆为 values 数组（次数丢弃，仅用于人工核对总量）；§6.4 表整体放入 `"contextDispatch"` 节（`{"value":"#ffffff","rules":{"color":"text-inverse","background":"bg-surface","gradient-context":"keep"}}`）；§5 R1 三元组表放入 `"rgbaFamilies"`（`{"triplet":"102,126,234","token":"brand-rgb"}`）；R2/R3 的 α 分带阈值（0.13/0.36、0.45）与 f(α) 表放入 `"bands"`。
- [ ] **Step 2: 写表完备性测试** `test/unit/theme-migrate-map.unit.test.js`：

```js
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';

it('theme-map.json 覆盖 styles.css 全部去重色值（除白名单）', () => {
  const css = readFileSync('src/side_panel/styles.css', 'utf-8');
  const hex = new Set((css.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) || []).map(h =>
    h.length === 4 ? '#' + [...h.slice(1)].map(c => c + c).join('') : h.toLowerCase()));
  const out = execFileSync('python3', ['scripts/theme-migrate.py', '--missing'], { encoding: 'utf-8' });
  const missing = out.trim() ? JSON.parse(out).filter(v => !hex.has(v)) : [];
  expect(missing).toEqual([]); // 映射表不得漏收 styles.css 里存在的值
});

it('rgba 三元组全部有族归属', () => {
  const out = execFileSync('python3', ['scripts/theme-migrate.py', '--missing-rgba'], { encoding: 'utf-8' });
  expect(JSON.parse(out || '[]')).toEqual([]);
});
```

- [ ] **Step 3: 实现脚本**（Python3，无第三方依赖）：加载 map → 归一化扫描目标文件色值（含 3 位缩写）→ hex 按 `--missing` 报告未命中；替换逻辑：普通值直接 `var(--token)`；`contextDispatch` 值按所在声明行的属性名分派（正则 `(color|background|border[a-z-]*|box-shadow)\s*:[^;}]*` 上下文窗口）；rgba 三元组命中族则 `rgba(var(--x-rgb), α)`；黑色族按 bands：α≤0.13→`rgba(var(--overlay-rgb), f(α))`、0.14–0.35 且 box-shadow 非 inset→`var(--shadow-sm/md/lg)`、≥0.36→`var(--scrim)`；白色族 α>0.45 且属性 background→`rgba(var(--surface-rgb), α)`，否则保持并记入"人工复核报告"。`--check` 模式只报告不改写，白名单（Global Constraints 列出的值）外任何裸色即非零退出。
- [ ] **Step 4: 自验证**：对 `styles.css` 跑 `--missing`/`--missing-rgba` 得空；构造含 `#667eea`、`rgba(0,0,0,0.1)`、`#FFF` 的临时 fixture 字符串断言替换结果正确（vitest 第三用例）；幂等：对已替换文本重跑无 diff。
- [ ] **Step 5: 全量门禁 + Commit** `feat(theme): 批量色值映射迁移脚本与完备性测试`

---

### Task 4: 对比度校验脚本

**Files:**
- Create: `scripts/theme-contrast-check.py`
- Test: `test/unit/theme-contrast.unit.test.js`

**Interfaces:**
- Produces: `python3 scripts/theme-contrast-check.py src/shared/theme.css` → 解析两块的 token 值对，输出 `[AA FAIL]`（文本类 <4.5:1，边框/图形类 <3:1，按 token 名分类：text-* 为文本类；对照面 = 同块 `--bg-surface`/`--bg-elevated` 取劣者）；exit 非零当且有 FAIL。

- [ ] **Step 1: 失败测试**：

```js
import { execFileSync } from 'node:child_process';
import { it, expect } from 'vitest';

it('theme.css 暗色文本 token 全部通过 AA', () => {
  const out = execFileSync('python3', ['scripts/theme-contrast-check.py', 'src/shared/theme.css'], { encoding: 'utf-8' });
  expect(out).not.toContain('AA FAIL');
});
```

- [ ] **Step 2: 实现**（WCAG 相对亮度公式同 spec §4.2 实算口径）；`--text-*`、`--*-soft-text`、`--*-text-*`、`--brand-500/600/700`、`--text-link` 按 4.5:1；`--border-*`、`--scrollbar-thumb` 按 3:1；`--on-*`、`--mark-bg`、`--paper`、通道变量跳过。
- [ ] **Step 3: PASS → 全量门禁 → Commit** `feat(theme): WCAG 对比度门禁脚本`

---

### Task 5: 侧边栏 CSS 骨架区迁移

**Files:**
- Modify: `src/side_panel/styles.css`（选择器分组：base/header/消息流/输入区/工具栏相关段）

**Interfaces:**
- Consumes: Task 1 token、Task 3 脚本。
- Produces: 骨架区样式 100% token 化（白名单外零裸色），Task 13 探针骨架断言的前提。

- [ ] **Step 1: 圈定骨架区行段**：`grep -n "^/\*" src/side_panel/styles.css` 按注释分区标记圈出 base/header/chat/message/input/toolbar 相关段（无注释分界则按选择器首行归类：`.header* .chat* .message* .input* .toolbar* .msg-*`），记录行段清单。
- [ ] **Step 2: 脚本执行**：`python3 scripts/theme-migrate.py --ranges <行段> src/side_panel/styles.css`（行段清单来自 Step 1；若无法机器圈定，退化为全文件替换但本任务只提交骨架段 hunk——`git add -p`）。
- [ ] **Step 3: 处理人工复核报告**：脚本输出的 Tier C 未决处（渐变内 `#fff`、`rgba(255,255,255,α≤0.45)` 等）逐处按 spec §6.4 规则定夺并手改。
- [ ] **Step 4: 双主题目视检查**：Playwright 打开 dist 产物，`page.addInitScript` 分别注入 light/dark，滚动骨架区截图 `test-results-probes/_theme-dark-skeleton.png`；暗色下不允许出现白斑块（背景 #fff 系容器），有则回 Step 3 查漏。
- [ ] **Step 5: 门禁（build+lint+unit）+ Commit** `refactor(theme): 侧边栏骨架区样式 token 化`

---

### Task 6: 侧边栏 CSS 浮层区迁移

**Files:**
- Modify: `src/side_panel/styles.css`（Task 5 之外的全部段：dropdown/modal/panel/overlay/popup 系）

- [ ] **Step 1: 脚本执行剩余段替换**（同 Task 5 Step 2 机制，范围为其余行段）。
- [ ] **Step 2: 处理人工复核报告**（含六套确认弹窗体系统一走 `--bg-elevated/--shadow-lg/--scrim`；z-index 10001–10004 层背景必须 elevated 而非 surface，保证浮层比面板更亮一档的层次在暗色同样成立）。
- [ ] **Step 3: 零残留断言**：`python3 scripts/theme-migrate.py --check src/side_panel/styles.css` exit 0。
- [ ] **Step 4: 门禁 + Commit** `refactor(theme): 侧边栏浮层区样式 token 化`

---

### Task 7: 侧边栏 JS 内联色迁移（232 处）

**Files:**
- Modify: `src/side_panel/token-stats-panel.js`(66) `schedule-panel.js`(54) `workspace-panel.js`(45) `index.js`(20) `chat-resume.js`(10) `chat-copy.js`(9) `agent-manager.js`(5) `prompt-manager.js`(3)（`markdown-render.js`/`chat-export.js` 留 Task 11 与导出链一起处理）

- [ ] **Step 1: 逐文件替换**：模板字符串 `style="...#xxx..."` 与 `.style.xxx = '#xxx'` → class 化（新增语义 class 写入 styles.css）或 `var(--token)`；映射仍用 `theme-migrate.py --mode js`（js 模式只处理字符串字面量内的色值）。
- [ ] **Step 2: 状态色核对**：徽标"关闭灰 `#bbb`/激活紫 `#667eea`"改 `var(--text-disabled)`/`var(--brand-500)`（对应既有徽标字体规范记忆）。
- [ ] **Step 3: 白名单外零残留**：`grep -rE "(color|background)[^;\n]{0,30}#[0-9a-fA-F]{3,8}" src/side_panel/*.js | grep -v "chat-export\|markdown-render"` 结果为空或逐条属于白名单。
- [ ] **Step 4: 门禁 + Commit** `refactor(theme): 侧边栏 JS 内联颜色 token 化`

---

### Task 8: options 页 CSS 迁移（577 处）

**Files:**
- Modify: `src/options/styles.css`

- [ ] **Step 1: options 独有色的归属核对**：`python3 scripts/theme-migrate.py --missing src/options/styles.css` 列出的表外值（options 与侧边栏色域高度重合，预期少量），逐个补进 `theme-map.json`（开关体系：轨道 `--brand-fill`、暗色空槽 `#e8eaf0`→border-subtle 族暗值；敏感操作确认开关保持紫色——遵守既有决策记忆，不引入琥珀/绿语义）。
- [ ] **Step 2: 脚本替换 + Tier C 人工复核**（radio 与方形勾选列表结构不动，仅收编颜色）。
- [ ] **Step 3: `--check src/options/styles.css` exit 0 + 双主题截图**（`test-results-probes/_theme-dark-options.png`）。
- [ ] **Step 4: 门禁 + Commit** `refactor(theme): 配置页样式 token 化`

---

### Task 9: HTML 内联 style + options JS 内联（140+60 处）

**Files:**
- Modify: `side_panel.html`（115 处 style 属性）、`options.html`（25 处）、`src/options/toolbox-rag.js`(17) `knowledge-panel.js`(16) `toolbox-skills.js`(10) `toolbox-shared.js`(8) `memory-panel.js`(4) `memory-entries.js`(2) `index.js`(2)

- [ ] **Step 1: HTML style 颜色迁入 CSS class**：grep 出含色 style 属性的元素，命名 class（kebab-case）写入对应 styles.css 段，属性内仅保留非颜色声明；顺带删除 `.toggle-label` 内 4 处历史残留空 `<span class="toggle-switch">`。
- [ ] **Step 2: options JS 动态模板替换**（同 Task 7 Step 1 手法）。
- [ ] **Step 3: 残留断言**：`grep -oE 'style="[^"]*#[0-9a-fA-F]{3,8}' side_panel.html options.html` 为空；`--check src/options/*.js` 白名单外为空。
- [ ] **Step 4: 门禁 + Commit** `refactor(theme): HTML/options JS 颜色收编入 token`

---

### Task 10: 划词浮层主题化

**Files:**
- Modify: `src/content/selection-toolbar-styles.js`（82 处）、`selection-toolbar.js`（14 处）、`src/content/index.js`

**Interfaces:**
- Consumes: `subscribeTheme`/`getResolvedTheme`（content 环境无 theme.js module 上下文时，经 `chrome.storage` 直接镜像同样逻辑——content script 非 module 场景按现有 index.js 的加载方式处理）。
- Produces: 注入容器 CSS 变量块 `THEME_VARS(resolved)`（styles.css 中侧边栏 token 的 20 个子集）；新 storage key `selectionToolbarFollowTheme: boolean`（默认 true）。

- [ ] **Step 1: 写失败单测** `test/unit/content-theme-vars.unit.test.js`：断言 `buildToolbarCss(resolved='dark')` 输出含 `--bg-elevated:#262a33`（子集表值）且不含 `#ffffff` 作容器背景；`followTheme=false` 时恒输出 light 块。
- [ ] **Step 2: 实现**：`selection-toolbar-styles.js` 模板顶部注入 `:host`/容器选择器的变量块函数 `buildToolbarVars(resolved)`；其余 82 处色改 `var(--token)` 引用；`selection-toolbar.js` 初始化与 `chrome.storage.onChanged` 监听 `appTheme`+`selectionToolbarFollowTheme` 重设变量块（沿用现有 onChanged 监听点，见 `selection-toolbar.js:2074`）。
- [ ] **Step 3: `#fff3a0` 高亮底色保持不翻转**（spec §6.4 mark-bg 规则）。
- [ ] **Step 4: 门禁 + Commit** `feat(theme): 划词浮层跟随扩展主题（含独立开关）`

---

### Task 11: markdown 暗色覆盖 + mermaid 主题联动 + 导出锁亮

**Files:**
- Modify: `src/shared/theme.css`（新增 `[data-theme="dark"] .markdown-body …` 覆盖段）、`src/side_panel/libs-loader.js:43` 附近、`src/side_panel/markdown-render.js`（6 处）
- 禁止：下载 `github-markdown-dark.min.css`（网络限制），用覆盖式。

- [ ] **Step 1: markdown 覆盖段**：在 theme.css 末尾补（亮色块不动，保证 light 与库完全一致）：

```css
[data-theme="dark"] .markdown-body { color: var(--text-primary); background-color: transparent; }
[data-theme="dark"] .markdown-body h1, [data-theme="dark"] .markdown-body h2 { border-bottom-color: var(--border-default); }
[data-theme="dark"] .markdown-body h1, [data-theme="dark"] .markdown-body h2,
[data-theme="dark"] .markdown-body h3, [data-theme="dark"] .markdown-body h4,
[data-theme="dark"] .markdown-body h5, [data-theme="dark"] .markdown-body h6,
[data-theme="dark"] .markdown-body strong { color: var(--text-primary); }
[data-theme="dark"] .markdown-body a { color: var(--text-link); }
[data-theme="dark"] .markdown-body code { background-color: rgba(var(--overlay-rgb), 0.16); color: var(--text-primary); }
[data-theme="dark"] .markdown-body pre { background-color: var(--bg-sunken); }
[data-theme="dark"] .markdown-body pre code { background-color: transparent; }
[data-theme="dark"] .markdown-body table th { background-color: var(--bg-subtle); }
[data-theme="dark"] .markdown-body table tr { background-color: transparent; border-color: var(--border-default); }
[data-theme="dark"] .markdown-body table tr:nth-child(2n) { background-color: var(--bg-subtle); }
[data-theme="dark"] .markdown-body blockquote { color: var(--text-secondary); border-left-color: var(--border-default); }
[data-theme="dark"] .markdown-body hr { background-color: var(--border-default); border-bottom-color: var(--border-default); }
```

（对照 `libs/github-markdown-light.min.css` 实有选择器逐一核对补全，以上为基线清单。）
- [ ] **Step 2: mermaid**：`libs-loader.js` 的 `window.mermaid.initialize({ theme: 'default' ... })` 改为读取 `getResolvedTheme()`（libs-loader 需 import theme.js）；`subscribeTheme` 中 `mermaid.initialize({theme: 新值对应 'dark'/'default'})` 并对已渲染 `.mermaid[data-processed]` 节点记录原始 code（渲染时缓存 `el.dataset.mmdSrc`）后重渲染；渲染失败保留旧图（try/catch）。
- [ ] **Step 3: 导出锁亮**：`chat-export.js`/`markdown-render.js` 导出 HTML 模板与 PDF 绘制保持现字面色值，并加头注释"导出物恒为亮色纸张语义，不接主题"；在 migrate 脚本 js 模式白名单登记这两个文件。
- [ ] **Step 4: 验证**：暗色下发一条含 标题/表格/代码块/引用/mermaid 图 的测试消息，截图 `test-results-probes/_theme-dark-markdown-mermaid.png` 无白底残留；切换主题后 mermaid 重渲染生效；导出一帧 PDF 底色仍白。
- [ ] **Step 5: 门禁 + Commit** `feat(theme): markdown/mermaid 主题联动与导出纸张锁亮`

---

### Task 12: 切换入口（配置页外观卡片 + 侧边栏菜单项 + i18n）

**Files:**
- Modify: `options.html`/`src/options/index.js`（外观卡片）、`side_panel.html:62`（headerMoreDropdown 菜单项）、`src/side_panel/index.js:3525` 附近（点击处理）、`src/shared/locales/zh.js`/`en.js`、配置导入导出清单（`src/options/config-io.js`）

- [ ] **Step 1: i18n key**：zh `settings.appearance:'外观'`、`settings.themeSystem:'跟随系统'`、`settings.themeLight:'亮色'`、`settings.themeDark:'暗色'`、`menu.toggleTheme:'切换主题'`、`settings.themeHint:'主题即时生效并在所有页面同步'`；en 对应 `'Appearance'/'Follow system'/'Light'/'Dark'/'Toggle theme'/...`。
- [ ] **Step 2: options 外观卡片**：置于全局设置区顶部，三分段按钮（复用 `.global-toggle` 容器语言），`change → setTheme(value)` 即时持久化；打开卡片时回显 `getTheme()`；`appTheme` 加入 `config-io.js` 导出键清单与导入白名单。
- [ ] **Step 3: 侧边栏菜单项**：`headerMoreDropdown` 内新增 `<div class="header-more-item" id="themeToggleItem" data-i18n="menu.toggleTheme">`，点击弹二选一（跟随系统/亮/暗）小浮层或直接 light→dark→system 循环（实现取循环，最少交互；项上文案动态显示当前态 `getTheme()`，i18n 渲染时查询）。处理函数绑定在 index.js headerMoreBtn 逻辑旁，调 `setTheme`。
- [ ] **Step 4: 同步用例（Playwright 探针）** `test-results-probes/_theme-sync.mjs`：options 页点"暗色" → 断言 storage 写入 → 同 context 的 side panel 页 `data-theme` 翻为 dark（onChanged 路径，不刷新页面）。
- [ ] **Step 5: 门禁 + Commit** `feat(theme): 外观卡片与侧边栏快捷切换入口`

---

### Task 13: 暗色视觉验收探针（对比度扫描 + 白斑检测）

**Files:**
- Create: `test-results-probes/_theme-dark-audit.mjs`
- Create: `test-results-probes/_theme-panels.json`（面板数据表）

- [ ] **Step 1: 建面板数据表**：spec §8.3 全部 40 浮层 + 6 常驻区，每条 `{ "id": "sessionDropdown", "trigger": "#sessionsBtn", "screenshot": "_theme-dark-session.png" }`；trigger 从 `src/side_panel/index.js` 的点击绑定逐一 grep 确定（grep 目标 id 的 `addEventListener/getElementById` 上下文找按钮 id），无法程序化打开的（依赖实时会话/Agent 连接）标注 `"fixture": true` 用 chrome mock 造数据打开。
- [ ] **Step 2: 探针主体**：加载 dist + chrome stub（沿用既有探针基建），`appTheme:'dark'` 注入 storage；对每面板：打开 → 执行页内扫描函数 → 截图。扫描函数（核心断言）：

```js
function auditPage() {
  const lum = (rgb) => { const f = (c) => c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    const [r, g, b] = rgb.map(f); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const parse = (s) => s.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const effBg = (el) => { let n = el; while (n) { const c = getComputedStyle(n).backgroundColor;
    if (c !== 'rgba(0, 0, 0, 0)') return parse(c); n = n.parentElement; } return [22, 24, 29]; };
  const fails = [];
  document.querySelectorAll('*').forEach((el) => {
    const cs = getComputedStyle(el);
    const txt = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!txt || cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) < 0.1) return;
    const fg = parse(cs.color), bg = effBg(el.parentElement || el);
    const l1 = Math.max(lum(fg), lum(bg)) + 0.05, l2 = Math.min(lum(fg), lum(bg)) + 0.05;
    const ratio = l1 / l2;
    const size = parseFloat(cs.fontSize), bold = +cs.fontWeight >= 700;
    const need = (size >= 18.66 || (size >= 14 && bold)) ? 3 : 4.5;
    if (ratio < need) fails.push({ sel: el.tagName + '.' + el.className, ratio: +ratio.toFixed(2), need });
    if (lum(bg) > 0.85) fails.push({ whiteBlob: el.tagName + '.' + el.className });
  });
  return fails;
}
```

- [ ] **Step 3: 执行并修复**：违规清单逐条回 styles.css 定位修复（典型漏网：`background:#fff` 容器、`color:#333` 文本、box-shadow 未走 token），重跑至 fails 为空；全宽档 290/420/520 × zh/en。
- [ ] **Step 4: 硬编码零残留**：`python3 scripts/theme-migrate.py --check dist/assets/*.css src/**/*.js`（白名单外）exit 0。
- [ ] **Step 5: 门禁 + Commit** `test(theme): 暗色对比度扫描与白斑检测探针`

---

### Task 14: 单测回归、文档与收尾

- [ ] **Step 1: agent 端测试确认不受影响**：`cd agent && node --test test/unit`（本改造不动 agent 进程，跑通即可）。
- [ ] **Step 2: 全量扩展端**：`npm run test:unit`、`npm run build:silent`、ESLint 全绿。
- [ ] **Step 3: 文档**：`.wiki/Configuration.md`（+EN）加"外观/主题"小节；`docs/` 用户文档增补；CHANGELOG 条目；按项目文档同步清单惯例核对。
- [ ] **Step 4: 最终 Commit** `docs(theme): 主题切换文档与变更记录`

---

## 验收总则（对照 spec §8）

1. `--check` 全产物零残留（白名单外）。
2. 对比度扫描 0 fail（§8.2 断言 1）、无白斑块（断言 2）。
3. 同步用例通过（Task 12 Step 4）；system 态 emulateColorScheme 翻转生效。
4. 亮色模式逐屏目视与改造前一致（灰阶收拢容差内）。
5. 导出 PDF 恒白底黑字；划词浮层两态截图正常、独立开关可关。

## 风险执行注意

- Task 5/6/8 的大 diff 提交前 `git diff --stat` 核对行数规模（~2000 处替换量级），异常膨胀说明脚本重复替换，先查脚本再提交。
- 任一任务门禁不过，不进入下一任务；worktree 内每个任务独立可 revert。
