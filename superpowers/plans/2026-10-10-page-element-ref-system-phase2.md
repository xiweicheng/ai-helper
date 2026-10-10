# 页面引用系统（ref 树快照）阶段二 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `query_elements` 支持叠加层提升（打开的弹窗/菜单置顶到 `[打开层]` 区块）与 `page` 分页（hasMore/totalPages），并将 ref 编号改为 WeakMap 稳定复用（同一元素跨快照编号不变）。

**Architecture:** 全部核心改动集中在 `src/content/page-interaction.js`：collectMatches 遍历期收集叠加层根（5 条检测路径 + inOverlay 标记）→ 发现即注册（全部匹配元素注册，编号经 WeakMap 复用）→ 按"叠加层子树 + 主体"输出序分页切片 → renderTree 分区渲染（skipRoots 去重，打开层优先消耗预算）。`content/index.js` 消息整包直通、CONTENT_PAYLOADS 自动派生 page，**无需改动**。

**Tech Stack:** MV3 Chrome 扩展、Vite 构建、Vitest（jsdom）单测、Playwright e2e。

**Spec:** `docs/superpowers/specs/2026-10-10-page-element-ref-system-phase2-design.md`（已批准；实现与 spec 冲突时以 spec 为准）

## Global Constraints

- 每个 Task 结束前必须：相关单测跑绿 → `git commit`（中文 conventional 提交信息）
- 代码注释/提交信息用中文；工具定义 description 用英文（模型侧）；i18n zh/en 必须同步
- **兼容性红线：无叠加层、单页（totalPages ≤ 1）时输出与阶段一完全一致**（除 maxResults 触顶提示改为 hasMore+page 分页）
- **测试断言不得硬编码 ref 数字**（refCounter 跨测试持续递增），从 `content.matchAll(/\[ref (\d+)\]/g)` 提取
- 不修改 `manifest.json`、`src/content/index.js`（直通链路已存在）
- 测试文件双环境：`page-interaction.unit.test.js` 为 jsdom（文件头已标注）；`tool-definitions.unit.test.js` 为 node（纯数据）
- jsdom 不支持 `:popover-open` 伪类（检测 try/catch 静默跳过）→ popover 路径仅由 e2e 覆盖
- 全部改动完成后执行 `npm run build:silent` 验证构建

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/content/page-interaction.js` | 注册表（WeakMap 稳定编号）/叠加层检测/分区渲染/分页切片/i18n 新键 | 修改核心 |
| `test/unit/content/page-interaction.unit.test.js` | 编号语义更新 + 稳定编号/分页/叠加层用例 | 修改 |
| `src/background/tools/browser-tools.js` | query_elements 增 page 参数 + 描述更新 | 修改 |
| `src/shared/locales/zh.js` + `en.js` | `tool.query_elements` 描述同步 | 修改 |
| `test/unit/tool-definitions.unit.test.js` | query_elements schema 与描述断言 | 修改 |
| `test/e2e/fixtures/overlay-paging-page.html` | 叠加层+分页专用 fixture（dialog[open]+popover+6 按钮） | 新建 |
| `test/e2e/content-tools.e2e.spec.js` | 分页 + 叠加层 e2e | 修改 |
| `test/e2e/demo-product-form.e2e.spec.js` | 模态框提升 e2e | 修改 |
| `docs/demo/form-autofill/product-form.html` | 模态框补标准 ARIA（role/aria-modal/aria-labelledby） | 修改 |
| `test-results-probes/_ref-system-smoke.mjs` | 探针扩展（稳定编号/分页/叠加层/移除失效；gitignored 不入库） | 重写 |

---

### Task 1: WeakMap 稳定编号 + selector 懒生成 + 发现即注册

**Files:**
- Modify: `src/content/page-interaction.js:56-114`（注册表区块 + resolveByRef）、`:337-396`（queryInteractiveElements 阶段 B/C）、`:441`（renderTree ref 取用）
- Modify: `test/unit/content/page-interaction.unit.test.js:29,93-100`（注释与编号测试语义更新 + 2 条新用例）

**Interfaces:**
- Produces: `registerElement(el, role, name): number`（新语义：WeakMap 复用编号，注册时不生成 selector）；`ensureSelector(entry): string`（懒生成回填）；`resolveByRef` 签名与返回结构不变
- Consumes: Task 2/3 依赖 `matched` 元素形状 `{ el, role, name }`（Task 3 追加 `inOverlay` 字段）、`elementRegistry` 每次快照 clear 重建

- [ ] **Step 1: 更新既有编号测试 + 新增 2 条用例（红）**

替换 `test/unit/content/page-interaction.unit.test.js` 的 L29 注释：

```js
// 从树快照文本中提取首个 ref（ref 编号跨测试持续递增，测试不硬编码具体数字）
```

替换 L93-100 的 `'ref 编号跨快照单调递增不复用'` 测试为：

```js
  test('ref 编号跨快照稳定：同一元素复用、新元素递增、编号不转给别元素', () => {
    document.body.innerHTML = '<button id="b1">Go</button>';
    const r1 = queryInteractiveElements({});
    const ref1 = firstRef(r1.content);

    // 同一元素再次快照 → 编号复用（阶段二 WeakMap 稳定编号）
    const r2 = queryInteractiveElements({});
    expect(firstRef(r2.content)).toBe(ref1);

    // 移除旧元素、新增元素 → 新元素获得递增新号，不复用旧号
    document.body.innerHTML = '<button id="b2">New</button>';
    const r3 = queryInteractiveElements({});
    expect(firstRef(r3.content)).toBeGreaterThan(ref1);
  });

  test('发现即注册：maxResults 截断外的元素重查仍可解析', () => {
    document.body.innerHTML = '<button id="a">A</button><button id="b">B</button><button id="c">C</button>';
    const full = queryInteractiveElements({});
    const refs = [...full.content.matchAll(/\[ref (\d+)\]/g)].map(m => Number(m[1]));
    expect(refs.length).toBe(3);
    // 第二次快照只输出 1 个元素，但全部匹配元素都会重新注册
    const r = queryInteractiveElements({ maxResults: 1 });
    expect(r.content).not.toContain('"C"');
    expect(getElementByRef(refs[2])).toBe(document.getElementById('c'));
  });

  test('元素断开后按 selector 兜底重查同 id 新节点', () => {
    document.body.innerHTML = '<div id="wrap"><button id="b1">Go</button></div>';
    const r = queryInteractiveElements({});
    const ref = firstRef(r.content);
    // 同结构重建（原节点断开）；selector 懒生成后应兜底找到新节点
    document.body.innerHTML = '<div id="wrap"><button id="b1">Go2</button></div>';
    expect(getElementByRef(ref)).toBe(document.getElementById('b1'));
  });
```

（注：第 3 条用例在旧实现即通过——注册时已生成 selector——用于锁定懒生成改造后的等价行为，其余两条为红。）

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: FAIL 2 条（稳定编号第二条断言：旧实现每次快照递增；发现即注册：refs[2] 未注册返回 null）

- [ ] **Step 3: 改造 page-interaction.js 注册表区块（L56-75）**

替换 L56-75 的注释与代码为：

```js
// ==================== 元素注册表（ref → element 映射） ====================
//
// query_elements 返回树快照时给每个发现的元素分配一个 ref 编号，模型可用 ref 直接操作元素，
// 免去编写脆弱的 CSS selector。编号经 WeakMap 跨快照复用：同一元素编号稳定、新元素递增、
// 编号永不转给不同元素（元素被 GC 后编号退役，计数器单调不回收）。注册表只保留最近一次
// 快照结果（每次查询重建）。selector 懒生成：仅兜底重查/消费方需要时生成，注册阶段零成本。
let refCounter = 0;
const elementRefMap = new WeakMap(); // Element → ref（跨快照复用编号）
const elementRegistry = new Map();   // ref → { element, selector, tag, role, name }

/**
 * 注册元素并返回 ref（发现即注册：全部匹配元素占用编号，分页/重查后 ref 仍可解析）
 */
function registerElement(el, role, name) {
  let ref = elementRefMap.get(el);
  if (ref == null) {
    refCounter += 1;
    ref = refCounter;
    elementRefMap.set(el, ref);
  }
  elementRegistry.set(ref, { element: el, selector: null, tag: el.tagName, role, name });
  return ref;
}

/**
 * selector 懒生成并回填 entry（元素断开后的兜底重查、getSelectorByRef 消费方均走此路径）
 */
function ensureSelector(entry) {
  if (entry.selector == null) {
    try { entry.selector = generateUniqueSelector(entry.element); } catch { entry.selector = ''; }
  }
  return entry.selector;
}
```

- [ ] **Step 4: resolveByRef 接入 ensureSelector（L81-96）**

替换 `resolveByRef` 函数体（`const entry = elementRegistry.get(refNum);` 之后的两段）：

```js
  const entry = elementRegistry.get(refNum);
  if (entry.element && entry.element.isConnected) {
    ensureSelector(entry); // 成功返回前回填，供 getSelectorByRef 消费方使用
    return { entry, element: entry.element };
  }
  const selector = ensureSelector(entry);
  const found = selector ? deepQuerySelector(selector) : null;
  if (found) {
    entry.element = found;
    return { entry, element: found };
  }
  return { error: buildInvalidRefMessage(refNum) };
```

- [ ] **Step 5: queryInteractiveElements 改为发现即注册（L357-378 区域）**

替换 L358 注释与 L361-378 的"阶段 A/B/C"为：

```js
    // 只保留本次快照结果（编号经 WeakMap 跨快照稳定复用）
    elementRegistry.clear();

    // 阶段 A：完整遍历收集匹配的交互元素（有序）
    const matched = [];
    collectMatches(document.body, { matched, filterByText, elementTypes });

    if (countOnly) {
      return { success: true, content: '', count: matched.length, total: matched.length, truncated: false, hint: '' };
    }

    // 阶段 B：发现即注册（全部匹配元素分配稳定编号，翻页/重查后 ref 仍可解析）
    for (const m of matched) {
      m.ref = registerElement(m.el, m.role, m.name);
    }

    // 阶段 C：输出集（maxResults 上限；分页在 Task 2 改为按页切片）
    const selected = new Set(matched.slice(0, maxResults).map(m => m.el));
    const tooMany = matched.length > maxResults;

    // 阶段 D：序列化（预算 maxChars）
    const ctx = { selected, budget: maxChars, truncated: false, count: 0 };
    const lines = [];
    renderTree(document.body, 0, lines, ctx);
```

- [ ] **Step 6: renderTree 元素行改为取用已注册编号（L441 附近）**

原行 `const ref = registerElement(el, effectiveRole, name);` 替换为：

```js
    // 编号已在阶段 B 分配（发现即注册）；渲染仅取用
    const ref = elementRefMap.get(el) ?? registerElement(el, effectiveRole, name);
```

- [ ] **Step 7: 运行全量单测确认绿**

Run: `npx vitest run`
Expected: 全部 PASS（既有用例除已更新语义外零回归）

- [ ] **Step 8: Commit**

```bash
git add src/content/page-interaction.js test/unit/content/page-interaction.unit.test.js
git commit -m "feat: query_elements ref 编号改 WeakMap 稳定复用（发现即注册，阶段二）"
```

---

### Task 2: page 分页切片 + 返回字段 + i18n 三键

**Files:**
- Modify: `src/content/page-interaction.js:8-54`（i18n 键）、`:337-396`（queryInteractiveElements 分页化）
- Modify: `test/unit/content/page-interaction.unit.test.js`（新增 describe）

**Interfaces:**
- Consumes: Task 1 的注册 pass 与 `elementRefMap`
- Produces: `queryInteractiveElements` 新签名 `{ filterByText, elementTypes, page=1, maxResults=100, maxChars=6000, countOnly }`；返回 `{ success, content, count, total, page, totalPages, hasMore, truncated, hint }`；i18n 键 `snapshotPageInfo` / `snapshotHasMore` / `snapshotPageOutOfRange`；输出序变量 `outputOrder`（Task 3 改为分区序）

- [ ] **Step 1: 写失败测试（describe 追加到文件末尾）**

```js
describe('queryInteractiveElements - 分页', () => {
  const mkButtons = (n) => Array.from({ length: n }, (_, i) => `<button id="b${i}">B${i}</button>`).join('');
  const refsOf = (content) => [...content.matchAll(/\[ref (\d+)\]/g)].map(m => Number(m[1]));

  test('分页切片：页间无重叠、并集完整、字段正确', () => {
    document.body.innerHTML = mkButtons(5);
    const all = queryInteractiveElements({});
    const allRefs = refsOf(all.content);
    expect(allRefs.length).toBe(5);

    const p1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    expect(p1.total).toBe(5);
    expect(p1.totalPages).toBe(3);
    expect(p1.hasMore).toBe(true);
    expect(p1.page).toBe(1);
    expect(p1.content).toContain('第 1/3 页');
    expect(p1.content).toContain('page=2');
    expect(p1.hint).toContain('page=2');

    const p2 = queryInteractiveElements({ maxResults: 2, page: 2 });
    const refs1 = refsOf(p1.content);
    const refs2 = refsOf(p2.content);
    expect(refs1.length).toBe(2);
    expect(refs2.length).toBe(2);
    // 稳定编号：页并集 == 全量编号前 4 个
    expect([...refs1, ...refs2].sort()).toEqual(allRefs.slice(0, 4).sort());

    const p3 = queryInteractiveElements({ maxResults: 2, page: 3 });
    expect(p3.hasMore).toBe(false);
    expect(refsOf(p3.content).length).toBe(1);
    expect(p3.content).not.toContain('还有更多元素');
  });

  test('翻页后上一页 ref 仍可交互（稳定编号核心收益）', async () => {
    document.body.innerHTML = mkButtons(3);
    const p1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    const ref0 = refsOf(p1.content)[0];
    let clicked = false;
    document.getElementById('b0').addEventListener('click', () => { clicked = true; });
    // 翻页重建注册表
    queryInteractiveElements({ maxResults: 2, page: 2 });
    const r = await interactByRef(ref0, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(clicked).toBe(true);
  });

  test('非法 page 按 1 处理', () => {
    document.body.innerHTML = mkButtons(3);
    const r1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    for (const bad of [0, -3, 2.5, 'abc']) {
      const r = queryInteractiveElements({ maxResults: 2, page: bad });
      expect(r.page).toBe(1);
      expect(refsOf(r.content)).toEqual(refsOf(r1.content));
    }
  });

  test('越界 page 返回范围提示且不报错', () => {
    document.body.innerHTML = mkButtons(3);
    const r = queryInteractiveElements({ maxResults: 2, page: 99 });
    expect(r.success).toBe(true);
    expect(r.page).toBe(99);
    expect(r.totalPages).toBe(2);
    expect(r.hasMore).toBe(false);
    expect(r.content).toContain('超出范围');
    expect(r.content).toContain('query_elements'); // 尾行照常
  });

  test('容器行跨页重复出现（结构上下文）', () => {
    document.body.innerHTML = `<form>${mkButtons(4)}</form>`;
    const p1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    const p2 = queryInteractiveElements({ maxResults: 2, page: 2 });
    const hasForm = (c) => c.split('\n').some(l => l.startsWith('form'));
    expect(hasForm(p1.content)).toBe(true);
    expect(hasForm(p2.content)).toBe(true);
  });

  test('分页 + 页内字符截断同时生效', () => {
    document.body.innerHTML = Array.from({ length: 5 },
      (_, i) => `<button>Very long button label number ${i} padding padding</button>`).join('');
    const r = queryInteractiveElements({ maxResults: 2, maxChars: 80 });
    expect(r.hasMore).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.content).toContain('截断');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: FAIL（`page` 参数未生效、`totalPages/hasMore/page` 为 undefined）

- [ ] **Step 3: i18n 新键（zh 与 en 的 registerTranslations 块内，`snapshotTruncated` 行后各加 3 行）**

zh（L12 后）：

```js
    snapshotPageInfo: '（第 {page}/{totalPages} 页，本次输出 {count} 个）',
    snapshotHasMore: '还有更多元素：调用 query_elements 时带 page={next} 查看',
    snapshotPageOutOfRange: 'page={page} 超出范围（共 {totalPages} 页）',
```

en（L36 后）：

```js
    snapshotPageInfo: ' (page {page}/{totalPages}, {count} shown)',
    snapshotHasMore: 'More elements available: call query_elements with page={next}',
    snapshotPageOutOfRange: 'page={page} is out of range (only {totalPages} page(s))',
```

- [ ] **Step 4: queryInteractiveElements 分页化（替换 Task 1 后的整个函数体）**

JSDoc 的 `@param` 增补/更新：

```js
 * @param {number} options.page - 页码（1 起，默认 1；非法值按 1 处理）
 * @param {number} options.maxResults - 每页元素数（默认 100）
```

函数体（从 `const { filterByText = '', ...` 到 `try` 内 return 段整体替换）：

```js
  const {
    filterByText = '',
    elementTypes = null,
    page = 1,
    maxResults = 100,
    maxChars = 6000,
    countOnly = false,
  } = options;
  const pageNum = Number.isInteger(page) && page >= 1 ? page : 1;

  try {
    // 只保留本次快照结果（编号经 WeakMap 跨快照稳定复用）
    elementRegistry.clear();

    // 阶段 A：完整遍历收集匹配的交互元素（有序）
    const matched = [];
    collectMatches(document.body, { matched, filterByText, elementTypes });

    if (countOnly) {
      return { success: true, content: '', count: matched.length, total: matched.length, truncated: false, hint: '' };
    }

    // 阶段 B：发现即注册（全部匹配元素分配稳定编号，翻页/重查后 ref 仍可解析）
    for (const m of matched) {
      m.ref = registerElement(m.el, m.role, m.name);
    }

    // 阶段 C：分页切片（页大小 = maxResults；输出序暂为 DOM 序，Task 3 改为分区序）
    const pageSize = Math.max(1, maxResults);
    const totalPages = Math.ceil(matched.length / pageSize);
    const outputOrder = matched;

    // 越界页：不渲染，返回范围提示（模型可自我纠正）
    if (matched.length > 0 && pageNum > totalPages) {
      const content = [
        t('pageInteraction.snapshotHeader', { count: matched.length }),
        t('pageInteraction.snapshotPageOutOfRange', { page: pageNum, totalPages }),
        t('pageInteraction.snapshotFooter'),
      ].join('\n');
      return { success: true, content, count: 0, total: matched.length, page: pageNum, totalPages, hasMore: false, truncated: false, hint: '' };
    }

    const pageStart = (pageNum - 1) * pageSize;
    const pageSlice = outputOrder.slice(pageStart, pageStart + pageSize);
    const hasMore = pageNum < totalPages;

    // 阶段 D：序列化（本页元素集合 + 预算 maxChars）
    const ctx = { selected: new Set(pageSlice.map(m => m.el)), budget: maxChars, truncated: false, count: 0 };
    const lines = [];
    renderTree(document.body, 0, lines, ctx);

    const paged = totalPages > 1;
    const header = t('pageInteraction.snapshotHeader', { count: paged ? matched.length : ctx.count })
      + (paged ? t('pageInteraction.snapshotPageInfo', { page: pageNum, totalPages, count: ctx.count }) : '')
      + (ctx.truncated ? t('pageInteraction.snapshotTruncated', { total: matched.length }) : '');
    lines.unshift(header);
    if (hasMore) lines.push(t('pageInteraction.snapshotHasMore', { next: pageNum + 1 }));
    lines.push(t('pageInteraction.snapshotFooter'));

    return {
      success: true,
      content: lines.join('\n'),
      count: ctx.count,
      total: matched.length,
      page: pageNum,
      totalPages,
      hasMore,
      truncated: ctx.truncated,
      hint: hasMore ? t('pageInteraction.snapshotHasMore', { next: pageNum + 1 }) : t('pageInteraction.refHint'),
    };
  } catch (error) {
    console.error('[PageInteraction] queryInteractiveElements failed:', error);
    return { success: false, error: error.message };
  }
```

设计要点：`truncated` 仅表示页内字符预算截断（原 `tooMany` 并入 `hasMore`）；单页时首行仍用 `{count}`（既有行为零变化）；分页时首行用 `{total}` + 页信息（避免"28 个元素…本次输出 28 个"重复）。

- [ ] **Step 5: 跑测试确认绿（本文件 + 全量）**

Run: `npx vitest run`
Expected: 全部 PASS；特别确认既有 `'maxChars 字符预算截断并提示'`（50 按钮 < 默认页大小 100 → 单页，不受分页影响）仍绿

- [ ] **Step 6: Commit**

```bash
git add src/content/page-interaction.js test/unit/content/page-interaction.unit.test.js
git commit -m "feat: query_elements 支持 page 分页与 hasMore/totalPages 字段（阶段二）"
```

---

### Task 3: 叠加层提升（检测 + 分区渲染 + outputOrder 统一）

**Files:**
- Modify: `src/content/page-interaction.js:8-54`（i18n 2 键）、`:194-201` 后（新增检测函数）、`:401-414`（collectMatches 扩展）、`:337-430` 区域（阶段 A/C/D + renderTree skip）
- Modify: `test/unit/content/page-interaction.unit.test.js`（新增 describe）

**Interfaces:**
- Consumes: Task 1 注册 pass、Task 2 `outputOrder`/分页切片
- Produces: `collectExpandedTargets(): Set<string>`；`isOpenOverlayRoot(el, role, expandedTargets): boolean`；`collectMatches` 上下文扩展 `{ overlayRoots, expandedTargets, inOverlay }`，matched 条目追加 `inOverlay: boolean`；`renderTree` 支持 `ctx.skipRoots`；i18n 键 `snapshotOverlayBlock` / `snapshotBodyBlock`

- [ ] **Step 1: 写失败测试（describe 追加）**

```js
describe('queryInteractiveElements - 叠加层提升', () => {
  test('dialog[open] 提升到 [打开层] 且主体不重复输出', () => {
    document.body.innerHTML = `
      <button id="main1">Main</button>
      <dialog id="dlg" open><button id="in1">Confirm</button></dialog>
    `;
    const r = queryInteractiveElements({});
    const lines = r.content.split('\n');
    const overlayIdx = lines.indexOf('[打开层]');
    const bodyIdx = lines.indexOf('[页面主体]');
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(overlayIdx);
    const confirmIdx = lines.findIndex(l => l.includes('"Confirm"'));
    const mainIdx = lines.findIndex(l => l.includes('"Main"'));
    expect(confirmIdx).toBeGreaterThan(overlayIdx);
    expect(confirmIdx).toBeLessThan(bodyIdx);
    expect(mainIdx).toBeGreaterThan(bodyIdx);
    // 去重：弹窗内容只出现一次
    expect(lines.filter(l => l.includes('"Confirm"')).length).toBe(1);
  });

  test('role=dialog + aria-modal=true 提升', () => {
    document.body.innerHTML = `
      <button>Main</button>
      <div role="dialog" aria-modal="true"><button>ModalBtn</button></div>
    `;
    const r = queryInteractiveElements({});
    expect(r.content).toContain('[打开层]');
    expect(r.content).toContain('[页面主体]');
  });

  test('role=menu 包含焦点元素时提升', () => {
    document.body.innerHTML = '<button>Main</button><div role="menu"><button id="mi1">Item</button></div>';
    document.getElementById('mi1').focus();
    expect(document.activeElement.id).toBe('mi1');
    const r = queryInteractiveElements({});
    expect(r.content).toContain('[打开层]');
  });

  test('aria-expanded+aria-controls 触发源反查提升', () => {
    document.body.innerHTML = `
      <button aria-expanded="true" aria-controls="pop1">Trigger</button>
      <div id="pop1"><button>PopItem</button></div>
    `;
    const r = queryInteractiveElements({});
    const lines = r.content.split('\n');
    const bodyIdx = lines.indexOf('[页面主体]');
    expect(lines.indexOf('[打开层]')).toBeGreaterThan(-1);
    // 弹层目标在打开层内、触发按钮自身仍留在页面主体
    expect(lines.findIndex(l => l.includes('"PopItem"'))).toBeLessThan(bodyIdx);
    expect(lines.findIndex(l => l.includes('"Trigger"'))).toBeGreaterThan(bodyIdx);
  });

  test('aria-expanded=false 不提升', () => {
    document.body.innerHTML = `
      <button aria-expanded="false" aria-controls="pop1">Trigger</button>
      <div id="pop1"><button>PopItem</button></div>
    `;
    const r = queryInteractiveElements({});
    expect(r.content).not.toContain('[打开层]');
  });

  test('嵌套叠加层只标记最外层', () => {
    document.body.innerHTML = `
      <dialog open><div role="dialog" aria-modal="true"><button>Inner</button></div></dialog>
    `;
    const r = queryInteractiveElements({});
    expect(r.content.split('[打开层]').length - 1).toBe(1);
    expect(r.content.split('[页面主体]').length - 1).toBe(1);
    expect(r.content.split('"Inner"').length - 1).toBe(1);
  });

  test('select multiple 聚焦不视为叠加层（原生控件隐式角色护栏）', () => {
    document.body.innerHTML = '<select multiple><option>a</option><option>b</option></select>';
    document.querySelector('select').focus();
    const r = queryInteractiveElements({});
    expect(r.content).not.toContain('[打开层]');
  });

  test('无叠加层时输出无任何标记（回归）', () => {
    document.body.innerHTML = '<button>Only</button><input placeholder="x">';
    const r = queryInteractiveElements({});
    expect(r.content).not.toContain('[打开层]');
    expect(r.content).not.toContain('[页面主体]');
  });

  test('弹窗内容优先于 maxChars 截断（核心收益）', () => {
    document.body.innerHTML = Array.from({ length: 30 },
      (_, i) => `<button>Filler button number ${i} with long padding text</button>`).join('')
      + '<dialog open><button>CriticalOverlayBtn</button></dialog>';
    const r = queryInteractiveElements({ maxChars: 300 });
    expect(r.truncated).toBe(true);
    expect(r.content).toContain('CriticalOverlayBtn');
  });

  test('分页第 1 页总是先含弹窗内容', () => {
    document.body.innerHTML = Array.from({ length: 5 },
      (_, i) => `<button id="p${i}">PageBtn ${i}</button>`).join('')
      + '<dialog open><button>FirstOverlayBtn</button></dialog>';
    const p1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    expect(p1.content).toContain('FirstOverlayBtn');
    expect(p1.content).toContain('[打开层]');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: FAIL（无 `[打开层]` 标记、`outputOrder` 未分区）

- [ ] **Step 3: i18n 2 键（zh 与 en 的 `snapshotPageOutOfRange` 行后各加 2 行）**

zh：

```js
    snapshotOverlayBlock: '[打开层]',
    snapshotBodyBlock: '[页面主体]',
```

en：

```js
    snapshotOverlayBlock: '[Open overlays]',
    snapshotBodyBlock: '[Page body]',
```

- [ ] **Step 4: 新增检测函数（插在 `isElementHidden` 函数之后，L201 附近）**

```js
/**
 * 预收集 aria-expanded 触发的弹层目标 id 集合（触发源反查，供叠加层检测）
 */
function collectExpandedTargets() {
  const ids = new Set();
  try {
    for (const trg of document.querySelectorAll('[aria-expanded="true"][aria-controls]')) {
      ids.add(trg.getAttribute('aria-controls'));
    }
  } catch { /* 忽略查询异常 */ }
  return ids;
}

/**
 * 叠加层根判定：打开的 dialog/popover/menu/listbox 等悬浮层
 * 调用方保证 el 可见；嵌套层由 collectMatches 按"最外层优先"处理
 */
function isOpenOverlayRoot(el, role, expandedTargets) {
  if (el.tagName === 'DIALOG' && el.hasAttribute('open')) return true;
  if (el.hasAttribute('popover')) {
    try { if (el.matches(':popover-open')) return true; } catch { /* 浏览器不支持该伪类时跳过 */ }
  }
  // 原生表单控件的隐式角色（如 select multiple → listbox）不算叠加层
  if (el.tagName === 'SELECT' || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return false;
  const active = document.activeElement;
  if (role === 'dialog' || role === 'alertdialog') {
    if (el.getAttribute('aria-modal') === 'true') return true;
    if (active && el.contains(active)) return true;
  }
  if ((role === 'menu' || role === 'listbox') && active && el.contains(active)) return true;
  if (el.id && expandedTargets.has(el.id)) return true;
  return false;
}
```

- [ ] **Step 5: collectMatches 扩展（整函数替换）**

```js
/**
 * 遍历收集匹配的交互元素（DOM 有序）与叠加层根（最外层优先）
 */
function collectMatches(root, { matched, filterByText, elementTypes, overlayRoots, expandedTargets, inOverlay = false }) {
  if (isSubtreePruned(root)) return;
  const role = getRole(root);
  // 叠加层根收集：可见性门控；inOverlay 已标记时不再重复判定（嵌套取最外层）
  let insideOverlay = inOverlay;
  if (!insideOverlay && !isElementHidden(root) && isOpenOverlayRoot(root, role, expandedTargets)) {
    overlayRoots.push(root);
    insideOverlay = true;
  }
  if (isInteractiveElement(root, role) && !isElementHidden(root) && matchesTypeFilter(root, role, elementTypes)) {
    const effectiveRole = role || root.tagName.toLowerCase();
    const name = resolveAccessibleName(root, effectiveRole);
    if (matchesTextFilter(root, name, filterByText)) {
      matched.push({ el: root, role: effectiveRole, name, inOverlay: insideOverlay });
    }
  }
  for (const child of getElementChildren(root)) {
    collectMatches(child, { matched, filterByText, elementTypes, overlayRoots, expandedTargets, inOverlay: insideOverlay });
  }
}
```

- [ ] **Step 6: queryInteractiveElements 三处替换**

（1）阶段 A（Task 2 版本）替换为：

```js
    // 阶段 A：完整遍历收集叠加层根与匹配的交互元素（有序）
    const expandedTargets = collectExpandedTargets();
    const overlayRoots = [];
    const matched = [];
    collectMatches(document.body, { matched, filterByText, elementTypes, overlayRoots, expandedTargets });
```

（2）阶段 C 的 `const outputOrder = matched;` 替换为：

```js
    // 输出序 = 叠加层子树元素（DOM 序） + 主体元素（DOM 序）；第 1 页因此总是先含打开层内容
    const outputOrder = matched.filter(m => m.inOverlay).concat(matched.filter(m => !m.inOverlay));
```

（3）阶段 D 的 ctx 与渲染替换为：

```js
    // 阶段 D：分区序列化（打开层优先 → [页面主体] 标记 → 主体；skipRoots 去重）
    const ctx = {
      selected: new Set(pageSlice.map(m => m.el)),
      budget: maxChars,
      truncated: false,
      count: 0,
      skipRoots: new Set(overlayRoots),
    };
    const lines = [];
    if (overlayRoots.length) {
      const overlayLines = [];
      const savedSkip = ctx.skipRoots;
      ctx.skipRoots = null; // 渲染叠加层根自身时不做跳过判定
      for (const root of overlayRoots) {
        renderTree(root, 0, overlayLines, ctx);
      }
      ctx.skipRoots = savedSkip;
      if (overlayLines.length) {
        lines.push(t('pageInteraction.snapshotOverlayBlock'), ...overlayLines, t('pageInteraction.snapshotBodyBlock'));
      }
    }
    renderTree(document.body, 0, lines, ctx);
```

- [ ] **Step 7: renderTree 顶部加 skipRoots 跳过（`if (isSubtreePruned(el)) return false;` 之后）**

```js
  if (ctx.skipRoots && ctx.skipRoots.has(el)) return false;
```

- [ ] **Step 8: 跑测试确认绿（本文件 + 全量）**

Run: `npx vitest run`
Expected: 全部 PASS。注意点：
- `弹窗内容优先于 maxChars 截断`：叠加层在 `renderTree(document.body)` 之前独立渲染，先消耗预算
- `分页第 1 页总是先含弹窗内容`：依赖 outputOrder 分区序
- 既有分页/快照用例在无叠加层页面上必须保持原输出（零标记）

- [ ] **Step 9: Commit**

```bash
git add src/content/page-interaction.js test/unit/content/page-interaction.unit.test.js
git commit -m "feat: query_elements 叠加层提升置顶与 [打开层]/[页面主体] 分区（阶段二）"
```

---

### Task 4: 工具定义 + UI 描述 + schema 断言

**Files:**
- Modify: `src/background/tools/browser-tools.js:308-320`（query_elements 定义）
- Modify: `src/shared/locales/zh.js:645`、`src/shared/locales/en.js:645`
- Modify: `test/unit/tool-definitions.unit.test.js`（文件末尾追加 describe）

**Interfaces:**
- Consumes: Task 2/3 的返回字段与标记语义
- Produces: `page` 参数进入模型工具 schema；`BROWSER_TOOLS` 中 `query_elements` 定义更新（tool-definitions 测试断言其存在）

- [ ] **Step 1: 写失败测试（tool-definitions.unit.test.js 末尾追加）**

```js
describe('query_elements 分页与叠加层 schema', () => {
  const qe = BROWSER_TOOLS.find(t => t.id === 'query_elements');

  test('定义存在且含 page 参数', () => {
    expect(qe).toBeTruthy();
    expect(qe.function.parameters.properties.page).toBeDefined();
    expect(qe.function.parameters.properties.page.type).toBe('integer');
  });

  test('描述覆盖 hasMore / 叠加层 / 稳定编号', () => {
    expect(qe.function.description).toContain('hasMore');
    expect(qe.function.description).toContain('page=N');
    expect(qe.function.description).toContain('Open overlays');
    expect(qe.function.description).toContain('stable');
  });

  test('maxResults 描述为每页元素数', () => {
    expect(qe.function.parameters.properties.maxResults.description).toContain('per page');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/tool-definitions.unit.test.js`
Expected: FAIL（page 参数与描述缺失）

- [ ] **Step 3: browser-tools.js 更新 query_elements 定义**

`description` 替换为：

```js
      description: 'Query interactive elements and return a tree-formatted snapshot with [ref N] numbers for interact_element/fill_form. Recommended as the primary element locating method. Open overlays (dialogs/menus/popups) are lifted to the top under [Open overlays]. ref numbers are stable for the same element while the page state is unchanged - re-query after the page changes. Results include hasMore: fetch the next page with page=N; use filterByText when a page is truncated',
```

`properties` 中 `maxResults` 前插入 `page`、并更新两条描述：

```js
          page: { type: 'integer', description: '1-based page number (default 1); use with hasMore to fetch the next page' },
          maxResults: { type: 'integer', description: 'Page size: max elements per page (default 100)' },
          maxChars: { type: 'integer', description: 'Character budget per page (default 6000)' },
```

- [ ] **Step 4: locales 同步**

`src/shared/locales/zh.js` L645 替换为：

```js
    query_elements: '查询可交互元素，返回树形快照与 ref 编号（打开的弹窗/菜单提升到 [打开层]；同一元素编号稳定，页面变化后需重新查询；hasMore 为真时用 page 翻页）',
```

`src/shared/locales/en.js` L645 替换为：

```js
    query_elements: 'Query interactive elements, returns tree snapshot with ref numbers (open overlays lifted under [Open overlays]; refs stable for the same element; re-query after page changes; use page to paginate when hasMore)',
```

- [ ] **Step 5: 跑测试确认绿**

Run: `npx vitest run test/unit/tool-definitions.unit.test.js`
Expected: PASS（含既有 schema 合规性用例）

- [ ] **Step 6: Commit**

```bash
git add src/background/tools/browser-tools.js src/shared/locales/zh.js src/shared/locales/en.js test/unit/tool-definitions.unit.test.js
git commit -m "feat: query_elements 工具定义与描述补充分页/叠加层语义（阶段二）"
```

---

### Task 5: e2e + demo ARIA 补强 + 真实页冒烟探针

**Files:**
- Modify: `docs/demo/form-autofill/product-form.html:283-285`（模态框补标准 ARIA）
- Create: `test/e2e/fixtures/overlay-paging-page.html`
- Modify: `test/e2e/content-tools.e2e.spec.js`（文件末尾追加 2 个 describe）
- Modify: `test/e2e/demo-product-form.e2e.spec.js`（imports + beforeAll + 新测试）
- Modify: `test-results-probes/_ref-system-smoke.mjs`（重写扩展；gitignored，不入 git）

**Interfaces:**
- Consumes: 全部服务端能力（分页/叠加层/稳定编号）；`test/e2e/helpers/load-module.js` 的 `getContentBundle()` / `callTool(page, fn, ...args)`
- Produces: 真实浏览器验证；demo 模态框（`.modal-card`）具备 `role=dialog` + `aria-modal=true` + `aria-labelledby`（命中检测路径 3）

- [ ] **Step 1: demo 页模态框补标准 ARIA（`docs/demo/form-autofill/product-form.html` L283-285）**

现 `.modal-card` 是纯 CSS 模态框（class 切换 display），五条检测路径均不命中。替换 L283-285 为：

```html
<div class="modal-overlay" id="confirm-modal">
  <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
    <h3 class="modal-title" id="modal-title" data-i18n="modalTitle">确认提交</h3>
```

（既是叠加层检测所需，也是无障碍改进；`aria-labelledby` 使容器行输出 `dialog "确认提交"`。）

- [ ] **Step 2: 新建 fixture `test/e2e/fixtures/overlay-paging-page.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Overlay Paging Fixture</title></head>
<body>
  <h1>Overlay &amp; Paging Fixture</h1>
  <button id="b1" onclick="this.dataset.clicked='1'">Alpha</button>
  <button id="b2">Bravo</button>
  <button id="b3">Charlie</button>
  <button id="b4">Delta</button>
  <button id="b5">Echo</button>
  <button id="b6">Foxtrot</button>

  <dialog id="dlg" open aria-labelledby="dlg-title">
    <h2 id="dlg-title">Confirm Dialog</h2>
    <input id="dlg-input" type="text" placeholder="dlg input">
    <button id="dlg-ok" onclick="this.dataset.clicked='1'">Dialog OK</button>
  </dialog>

  <button id="pop-trigger" popovertarget="pop1">Show Popover</button>
  <div id="pop1" popover>
    <button id="pop-action">Popover Action</button>
  </div>
</body>
</html>
```

- [ ] **Step 3: content-tools.e2e.spec.js 末尾追加 2 个 describe**

```js
// ==================== query_elements 分页 ====================

test.describe('query_elements 分页', () => {
  test('分页翻页、hasMore 字段与跨页 ref 稳定性', async ({ page }) => {
    await page.goto(fixtureUrl('overlay-paging-page.html'));
    const p1 = await callTool(page, 'queryInteractiveElements', { maxResults: 4, page: 1 });
    expect(p1.page).toBe(1);
    expect(p1.hasMore).toBe(true);
    expect(p1.totalPages).toBeGreaterThan(1);

    const p2 = await callTool(page, 'queryInteractiveElements', { maxResults: 4, page: 2 });
    expect(p2.page).toBe(2);

    // 稳定编号：b1 的 ref 在两次翻页后仍可点击
    const full = await callTool(page, 'queryInteractiveElements', {});
    const b1Line = full.content.split('\n').find(l => l.includes('"Alpha"'));
    const b1Ref = Number(b1Line.match(/\[ref (\d+)\]/)[1]);
    const clk = await callTool(page, 'interactByRef', b1Ref, 'click', { waitTime: 0, timeout: 0 });
    expect(clk.success).toBe(true);
    expect(await page.getAttribute('#b1', 'data-clicked')).toBe('1');
  });

  test('越界 page 返回提示不报错', async ({ page }) => {
    await page.goto(fixtureUrl('overlay-paging-page.html'));
    const r = await callTool(page, 'queryInteractiveElements', { maxResults: 4, page: 99 });
    expect(r.success).toBe(true);
    expect(r.hasMore).toBe(false);
    expect(r.content).toContain('超出范围');
  });
});

// ==================== query_elements 叠加层提升 ====================

test.describe('query_elements 叠加层提升', () => {
  test('dialog[open] 提升 + 主体去重 + ref 操作弹窗按钮', async ({ page }) => {
    await page.goto(fixtureUrl('overlay-paging-page.html'));
    const r = await callTool(page, 'queryInteractiveElements', {});
    const lines = r.content.split('\n');
    const overlayIdx = lines.indexOf('[打开层]');
    const bodyIdx = lines.indexOf('[页面主体]');
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(overlayIdx);

    const okIdx = lines.findIndex(l => l.includes('"Dialog OK"'));
    expect(okIdx).toBeGreaterThan(overlayIdx);
    expect(okIdx).toBeLessThan(bodyIdx);
    // 去重：弹窗按钮只出现一次
    expect(lines.filter(l => l.includes('"Dialog OK"')).length).toBe(1);

    const okRef = Number(lines[okIdx].match(/\[ref (\d+)\]/)[1]);
    const clk = await callTool(page, 'interactByRef', okRef, 'click', { waitTime: 0, timeout: 0 });
    expect(clk.success).toBe(true);
    expect(await page.getAttribute('#dlg-ok', 'data-clicked')).toBe('1');
  });

  test('popover 打开时提升到 [打开层]', async ({ page }) => {
    await page.goto(fixtureUrl('overlay-paging-page.html'));
    await page.click('#pop-trigger');
    await page.waitForFunction(() => {
      const p = document.getElementById('pop1');
      return p && p.matches(':popover-open');
    });
    const r = await callTool(page, 'queryInteractiveElements', {});
    const lines = r.content.split('\n');
    const overlayIdx = lines.indexOf('[打开层]');
    const actionIdx = lines.findIndex(l => l.includes('"Popover Action"'));
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(actionIdx).toBeGreaterThan(overlayIdx);
    expect(actionIdx).toBeLessThan(lines.indexOf('[页面主体]'));
  });
});
```

- [ ] **Step 4: demo-product-form.e2e.spec.js 新增模态框提升测试**

（1）文件头 import 区追加：

```js
import { getContentBundle, callTool } from './helpers/load-module.js';
```

（2）`const pageUrl = ...` 之后加：

```js
let bundle;
test.beforeAll(async () => {
  bundle = await getContentBundle();
});
```

（3）describe 内追加测试（复用已有 fillStep 辅助函数）：

```js
  test('叠加层：模态框提升到 [打开层] 且 ref 可操作', async ({ page }) => {
    await page.addInitScript({ content: bundle });
    await page.goto(pageUrl);
    await fillStep1(page);
    await page.click('#btn-next');
    await fillStep2(page);
    await page.click('#btn-next');
    await fillStep3(page);
    await page.click('#btn-next');
    await page.click('#open-confirm-modal');
    // 等模态框淡入动画结束（过渡期间 opacity 检查会视作不可见）
    await page.waitForFunction(() => {
      const card = document.querySelector('.modal-card');
      return card && getComputedStyle(card).opacity === '1';
    });
    const snap = await callTool(page, 'queryInteractiveElements', {});
    const lines = snap.content.split('\n');
    const overlayIdx = lines.indexOf('[打开层]');
    const bodyIdx = lines.indexOf('[页面主体]');
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(overlayIdx);

    // 模态框确认钮位于打开层区块内且只出现一次（主体去重）
    const confirmIdx = lines.findIndex(l => l.includes('确认提交') && l.includes('[ref '));
    expect(confirmIdx).toBeGreaterThan(overlayIdx);
    expect(confirmIdx).toBeLessThan(bodyIdx);
    expect(lines.filter(l => l.includes('确认提交') && l.includes('[ref ')).length).toBe(1);

    // ref 操作：勾选条款 → 返回修改关闭模态框
    const agreeLine = lines.find(l => l.includes('我已阅读并同意') && l.includes('[ref '));
    const agreeRef = Number(agreeLine.match(/\[ref (\d+)\]/)[1]);
    await callTool(page, 'interactByRef', agreeRef, 'click', { waitTime: 0, timeout: 0 });
    expect(await page.isChecked('#agree-terms')).toBe(true);

    const cancelLine = lines.find(l => l.includes('返回修改') && l.includes('[ref '));
    const cancelRef = Number(cancelLine.match(/\[ref (\d+)\]/)[1]);
    await callTool(page, 'interactByRef', cancelRef, 'click', { waitTime: 100, timeout: 500 });
    await expect(page.locator('#confirm-modal')).toBeHidden();
  });
```

- [ ] **Step 5: 跑 e2e（两个 spec）确认绿**

Run: `npx playwright test test/e2e/content-tools.e2e.spec.js test/e2e/demo-product-form.e2e.spec.js`
Expected: 全部 PASS（这两个文件即全部既有 18 条 + 新增 5 条）

- [ ] **Step 6: 重写冒烟探针 `test-results-probes/_ref-system-smoke.mjs`（完整替换文件内容）**

```js
// 探针：真实浏览器（Chromium）冒烟"页面引用系统"阶段二主链路：
// 1) 树快照 + 稳定编号（同元素重查后编号不变）
// 2) interact_element(ref, type) 原子输入 + fill_form(field.ref) 定位
// 3) 分页：page=1/2 字段与 hasMore（若页面 total≤3 需调整页大小）
// 4) 叠加层提升：打开模态框后快照含 [打开层]，弹窗 ref 可操作
// 5) 元素移除后旧 ref 失效：错误信息含"最近快照中的有效引用"建议
// 用法：node test-results-probes/_ref-system-smoke.mjs
import { chromium } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getContentBundle, callTool } from '../test/e2e/helpers/load-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoUrl = 'file://' + path.resolve(__dirname, '../docs/demo/form-autofill/product-form.html');

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};
const refOfLine = (content, predicate) => {
  const line = content.split('\n').find(l => l.includes('[ref ') && predicate(l));
  return line ? { line, ref: Number(line.match(/\[ref (\d+)\]/)[1]) } : null;
};

const browser = await chromium.launch();
const page = await browser.newPage();
const bundle = await getContentBundle();
await page.addInitScript({ content: bundle });
await page.goto(demoUrl);
await page.waitForFunction(() => {
  const p = document.querySelector('.step-panel[data-step="1"]');
  return !p || getComputedStyle(p).opacity === '1';
}, null, { timeout: 5000 }).catch(() => {});

// ---------- 1. 树快照 + 稳定编号 ----------
const snap = await callTool(page, 'queryInteractiveElements', {});
console.log('--- snapshot (first 25 lines) ---');
console.log(snap.content.split('\n').slice(0, 25).join('\n'));
console.log(`count=${snap.count} total=${snap.total} page=${snap.page} totalPages=${snap.totalPages} hasMore=${snap.hasMore}`);
check('快照含 ref 编号', snap.content.includes('[ref '));
check('快照含尾行提示', snap.content.includes('query_elements'));

const nameField = refOfLine(snap.content, l => l.includes('商品名称'));
const skuField = refOfLine(snap.content, l => l.includes('SKU'));
check('名称输入框在树中（label 名称解析）', !!nameField, nameField && nameField.line);

// ---------- 2. type 原子输入 + fill_form(ref) ----------
if (nameField) {
  const tr = await callTool(page, 'interactByRef', nameField.ref, 'type', {
    value: '蓝牙耳机 A1', waitTime: 100, timeout: 300,
  });
  check('interactByRef type 成功', tr.success === true, JSON.stringify(tr).slice(0, 160));
  const val = await page.inputValue('#product-name');
  check('输入值已写入 #product-name', val === '蓝牙耳机 A1', `value="${val}"`);
}
if (skuField) {
  const fr = await callTool(page, 'fillForm', [{ ref: skuField.ref, value: 'SKU-SMOKE-001' }]);
  check('fill_form(ref) 成功', fr.success === true && fr.details[0].success === true, JSON.stringify(fr.details));
} else {
  check('SKU 输入框在树中', false);
}

// ---------- 3. 稳定编号：重查后同一元素编号不变 ----------
const snap2 = await callTool(page, 'queryInteractiveElements', {});
if (skuField) {
  check('同元素重查后编号稳定', snap2.content.includes(`[ref ${skuField.ref}]`), `ref=${skuField.ref}`);
}

// ---------- 4. 分页 ----------
const pg1 = await callTool(page, 'queryInteractiveElements', { maxResults: 3, page: 1 });
check('分页字段完整', pg1.page === 1 && pg1.totalPages === Math.ceil(pg1.total / 3),
  JSON.stringify({ page: pg1.page, totalPages: pg1.totalPages, hasMore: pg1.hasMore, total: pg1.total }));
if (pg1.totalPages > 1) {
  check('第 1 页 hasMore + page=2 提示', pg1.hasMore === true && pg1.content.includes('page=2'));
  const pg2 = await callTool(page, 'queryInteractiveElements', { maxResults: 3, page: 2 });
  check('第 2 页有内容', pg2.content.includes('[ref ') && pg2.page === 2);
} else {
  check('分页场景可用（total>3）', false, `total=${pg1.total}`);
}

// ---------- 5. 叠加层提升 ----------
await page.evaluate(() => document.querySelector('#confirm-modal').classList.add('open'));
await page.waitForFunction(() => {
  const card = document.querySelector('.modal-card');
  return card && getComputedStyle(card).opacity === '1';
}, null, { timeout: 5000 }).catch(() => {});
const snap3 = await callTool(page, 'queryInteractiveElements', {});
check('快照含 [打开层] 标记', snap3.content.includes('[打开层]'));
check('快照含 [页面主体] 标记', snap3.content.includes('[页面主体]'));
const modalBtn = refOfLine(snap3.content, l => l.includes('确认提交'));
check('模态框按钮位于打开层内', !!modalBtn
  && snap3.content.indexOf('[打开层]') < snap3.content.indexOf(modalBtn.line)
  && snap3.content.indexOf(modalBtn.line) < snap3.content.indexOf('[页面主体]'));
const agreeField = refOfLine(snap3.content, l => l.includes('我已阅读并同意'));
if (agreeField) {
  await callTool(page, 'interactByRef', agreeField.ref, 'click', { waitTime: 0, timeout: 0 });
  check('弹窗内 checkbox ref 勾选成功', await page.isChecked('#agree-terms'));
} else {
  check('弹窗内 checkbox 在树中', false);
}
const cancelBtn = refOfLine(snap3.content, l => l.includes('返回修改'));
if (cancelBtn) {
  const clk = await callTool(page, 'interactByRef', cancelBtn.ref, 'click', { waitTime: 100, timeout: 300 });
  check('弹窗 ref 点击成功', clk.success === true);
  const hidden = await page.evaluate(() => getComputedStyle(document.querySelector('#confirm-modal')).display === 'none');
  check('点击返回修改后模态框关闭', hidden);
} else {
  check('返回修改按钮在树中', false);
}

// ---------- 6. 元素移除后旧 ref 失效建议 ----------
await page.evaluate(() => { const el = document.querySelector('#product-sku'); if (el) el.remove(); });
await callTool(page, 'queryInteractiveElements', {});
if (skuField) {
  const stale = await callTool(page, 'interactByRef', skuField.ref, 'click', { waitTime: 0, timeout: 0 });
  check('已移除元素旧 ref 报错失败', stale.success === false);
  check('错误含失效提示', stale.error.includes('无效或已过期'), stale.error.slice(0, 120));
  check('错误含附近有效引用建议', stale.error.includes('最近快照中的有效引用'), stale.error.slice(0, 200));
}

await browser.close();
console.log(failures.length ? `\nSMOKE_FAIL: ${failures.join(' | ')}` : '\nSMOKE_PASS');
process.exit(failures.length ? 1 : 0);
```

关键变化：阶段一第 4 步"重查后旧 ref 失效"在稳定编号下不再成立（同元素编号不变、仍可点击），改为"**元素被移除**后旧 ref 失效"（本文件第 6 步）。

- [ ] **Step 7: 跑探针确认 SMOKE_PASS**

Run: `node test-results-probes/_ref-system-smoke.mjs`
Expected: 输出以 `SMOKE_PASS` 结尾、退出码 0。若第 4 步报 `total≤3`，说明当前 wizard 步骤元素数不足，把 `maxResults: 3` 调小为 2 重跑

- [ ] **Step 8: Commit（探针不入库）**

```bash
git add test/e2e/fixtures/overlay-paging-page.html test/e2e/content-tools.e2e.spec.js test/e2e/demo-product-form.e2e.spec.js docs/demo/form-autofill/product-form.html
git commit -m "test: e2e 覆盖叠加层提升与分页 + demo 模态框补标准 ARIA（阶段二）"
```

---

### Task 6: 全量回归（纯验证，无代码变更不提交）

- [ ] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 全部 PASS（阶段一基线 945 通过 + 本阶段新增 ≈ 20 条；无失败）

- [ ] **Step 2: 构建验证**

Run: `npm run build:silent`
Expected: `BUILD_SUCCESS`

- [ ] **Step 3: 全量 e2e**

Run: `npx playwright test`
Expected: 全部 PASS（阶段一基线 18 + 新增 5 条）

- [ ] **Step 4: 真实页冒烟（复跑确认）**

Run: `node test-results-probes/_ref-system-smoke.mjs`
Expected: `SMOKE_PASS`

- [ ] **Step 5: 汇报**

汇总：提交列表 / 单测与 e2e 数量 / 构建结果 / 冒烟结果 / 语义变更清单落地确认。文档同步（CHANGELOG、wiki 中英、作品介绍）不在本计划范围，由用户决定是否单独跟进。

---

## 自审记录（writing-plans Self-Review）

**1. Spec 覆盖检查**：
- spec 3.1 发现即注册 → Task 1 Step 5/6 ✓
- spec 3.2 WeakMap 稳定编号 + selector 懒生成（含兜底重查路径回填） → Task 1 Step 3/4 ✓
- spec 3.3 五层检测（含表单控件隐式角色护栏）+ 嵌套最外层 + 分区渲染 + 无叠加层零变化 → Task 3 ✓
- spec 3.4 分页（非法按 1/越界提示/页大小=maxResults/truncated 语义/outputOrder 分区序） → Task 2 + Task 3 Step 6 ✓
- spec 3.5 i18n 五新键 → Task 2 Step 3（3 键）+ Task 3 Step 3（2 键）✓
- spec 3.6 定义与描述 + "content/index.js 无需改动" → Task 4 ✓ / Global Constraints 红线 ✓
- spec 4 语义变更 5 项 → 编号测试更新（Task 1）、注册范围（Task 1）、超限提示（Task 2）、无叠加层零变化（Task 3 测试）、非法/越界 page（Task 2 测试）✓
- spec 5 测试计划 → 单测（Task 1-3）/ tool-definitions（Task 4）/ e2e（Task 5）/ 探针（Task 5）/ 回归（Task 6）✓

**2. 占位符扫描**：无 TBD/TODO；所有代码步骤均含完整可执行代码。

**3. 类型一致性核对**：
- `registerElement(el, role, name): number` 在 Task 1 定义、Task 1 Step 6 与 Task 2 引用一致
- `matched` 条目 `{ el, role, name }`（Task 1/2）→ Task 3 追加 `inOverlay`，注册 pass 读取 `m.el/m.role/m.name` 兼容
- `outputOrder`（Task 2 定义 `= matched`）→ Task 3 替换为分区序，变量名一致
- `ctx.selected`（Task 1-2）→ Task 3 保持该名并追加 `skipRoots`；renderTree skip 判定与分区渲染的临时置空配对
- 返回字段 `{ page, totalPages, hasMore }` 在 Task 2 定义、Task 4 描述、Task 5 e2e 断言一致
- i18n 键名：`snapshotPageInfo/snapshotHasMore/snapshotPageOutOfRange/snapshotOverlayBlock/snapshotBodyBlock` 与 spec 3.5 一致

