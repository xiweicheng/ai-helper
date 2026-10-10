# 循环检测升级实施计划（六模式循环检测器）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 ReAct 循环新增独立的多模式循环检测器（重复 / ref 枚举 / ABAB 振荡 / 失败作用域 / 导航处理 / 无进展滚动），软提醒 → 硬停两级处理，硬停经既有 checkpoint 链路可带指导恢复。

**Architecture:** 新建 browser-free 纯逻辑模块 `loop-detector.js`（每 run 一实例、per-tab 分桶、`record()` 返回 none/nudge/stop），`react-loop.js` 仅做薄集成（5 个工具记录锚点 + 轮末 3 处 flush + 删除旧指纹块 + i18n 6 key），`scroll_to` 增加零延迟静态边界判定（仅"已在边界"输出 `moved:false`）。

**Tech Stack:** Chrome Extension MV3 / 原生 ES Module / Vitest（node 环境，检测器零浏览器依赖）

**Spec:** `docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md`（本计划从该 spec 推导，执行者两者对照阅读）

## Global Constraints

以下约束对每个任务都隐含适用（逐条来自 spec §4 / §8 / §11 与用户红线）：

- **R1 零影响**：无循环行为的任务，消息流零注入、工具输出零变化；唯一例外 = `scroll_to` 在"已在边界"场景新增 `moved:false` 字段（已在 spec §7 向用户明示）。
- **R2 不误杀**：硬停之前必经软提醒（绝不第一次检测就终止）；全部触发基于"明确模式 + 保守阈值 + 豁免规则"，每模式测试必须验证 `nudge` 先于 `stop` 出现。
- **R3 隔离性**：新逻辑全部在独立模块；i18n 只增不改；不新增设置项 / UI / 工具 schema 改动；react-loop.js 修改范围仅限 spec §6 列出的 10 处（本计划 Task 4 的 E1-E10）。
- **R4 测试背书**：每模式必须有"正例（该触发）+ 反例（合法模式不触发）+ 豁免"三类单测；接线由源码断言测试守护。
- **R5 基线不漂移**：全量单测（基线 1004 项通过，只增不减、其余不漂移）、`npm run build:silent` 通过、e2e 31 项与改造前一致。
- **TDD**：每个任务遵循 写失败测试 → 运行确认失败 → 实现 → 运行确认通过 → commit；禁止先实现后补测试。
- **Commit 规范**：中文 conventional commits；每任务一个 commit；**只本地 commit，不 push**。
- **阈值集中**：全部数值只在 `LOOP_DETECTOR_CONFIG`（loop-detector.js 顶部），代码中不得散落魔法数。
- **合规**：仅借鉴 WebBrain 设计思想（GPL-3.0），**不复制任何代码**（本项目 MIT）。
- **实现语言**：模块无 `window` / `chrome` 引用（纯 Node 可单测）；注释与 commit 用中文，模型面向的提醒文案用英文（沿用既有先例）。
- **删除与接线同一 commit**：Task 4 中旧指纹块删除与新检测器接线必须同一 commit（否则双检测器并行双注入）；回退方式 = revert 该 commit。

---

## File Structure

| 文件 | 动作 | 责任 |
|---|---|---|
| `src/background/loop-detector.js` | 新建 | 六模式纯逻辑检测器（零浏览器 API、零外部依赖） |
| `test/unit/loop-detector.unit.test.js` | 新建 | 检测器全量单测（33 用例，node 环境） |
| `src/background/react-loop.js` | 修改 | import + 实例/记录数组 + 5 记录锚点 + 3 处 flush + 删除旧指纹块（L1879-1928）+ 删除旧常量（L463-469）+ i18n 6 key ×2 |
| `test/unit/react-loop-loop-detector-wiring.unit.test.js` | 新建 | 接线守卫（readFileSync + 源码正则断言） |
| `src/content/interaction-tools.js` | 修改 | `scrollToPosition` 增加静态边界判定（仅影响输出形态） |
| `test/unit/content/interaction-tools.unit.test.js` | 修改 | 追加 scroll 双形态断言 describe（jsdom 桩） |
| `test-results-probes/_loop-detector-probe.mjs` | 新建（不提交，目录已 gitignored） | 真实模块行为探针 |
| `CHANGELOG.md` | 修改 | 变更记录 |

任务顺序（相对 spec §11 的调整及理由）：Task 2（scroll）与 Task 3（i18n）先行，Task 4（接线）最后——使接线所依赖的 `moved:false` 与 i18n key 先落地，接线后立即全绿。Task 1 / 2 / 3 均为独立无害改动（不触碰现有行为）。

---

### Task 1: 检测器模块 + 全量单测

**Files:**
- Create: `src/background/loop-detector.js`
- Test: `test/unit/loop-detector.unit.test.js`

**Interfaces:**
- Produces: `createLoopDetector(config?)` → `{ record(tabId, toolName, args, result) }`；返回值：
  - `{ kind: 'none' }`
  - `{ kind: 'nudge', warning: string }`（模型面向英文，多条目以 `\n` 连接）
  - `{ kind: 'stop', reason, params }`，`reason ∈ 'repeat' | 'refEnum' | 'oscillation' | 'failureScope' | 'noProgressScroll' | 'budget'`
- Produces: `LOOP_DETECTOR_CONFIG`（全部阈值集中导出的常量对象）
- Consumes: 无（零依赖，browser-free）

- [ ] **Step 1: 编写完整测试文件（先红）**

创建 `test/unit/loop-detector.unit.test.js`：

```js
// loop-detector 单元测试（纯 Node 环境；模块零浏览器依赖）
// 设计文档：docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md
//
// 测试数据契约：
// - 每个用例使用互不相同的工具/参数/结果组合，隔离跨模式噪音；
// - 重读/失败等场景若与 repeat 同轮命中（fullKey 必然相同），断言采用 warning 文案子串；
//   stop 一律断言 reason 精确值（stop 优先级最高，不会被其他模式干扰）。
import { describe, test, expect } from 'vitest';
import { createLoopDetector, LOOP_DETECTOR_CONFIG } from '../../src/background/loop-detector.js';

const d = () => createLoopDetector();

// 通用结果构造：tag 不同 → 结果哈希不同（隔离 repeat 的 fullKey）
const ok = (tag) => ({ success: true, content: `result-${tag}` });

// query_elements 参数/结果构造（字段与真实工具 schema 对齐）
const qArgs = (page, extra = {}) => ({ page, maxResults: 100, maxChars: 6000, filterByText: '', frames: 'auto', ...extra });
const qRes = (page, tag, hasMore = true, totalPages = 10) => ({ success: true, page, totalPages, hasMore, content: `page-${page}-${tag}` });

describe('① 重复检测（窗口制）', () => {
  test('同 fullKey 窗口内 3 次 → nudge；片段内节流仅 1 条', () => {
    const det = d();
    const r = [];
    for (let i = 0; i < 5; i++) r.push(det.record(1, 'read_page', { q: 'x' }, ok('stable')));
    expect(r[0].kind).toBe('none');
    expect(r[1].kind).toBe('none');
    expect(r[2].kind).toBe('nudge');
    expect(r[2].warning).toContain('identical tool call');
    expect(r[3].kind).toBe('none'); // 同片段节流
    expect(r[4].kind).toBe('none');
  });

  test('反例·轮询（同参变果）任意次恒 none', () => {
    const det = d();
    for (let i = 0; i < 20; i++) {
      expect(det.record(1, 'read_page', { q: 'x' }, ok(`v${i}`)).kind).toBe('none');
    }
  });

  test('累计 8 次 → stop(repeat)（穿插其他调用不清零）', () => {
    const det = d();
    const outcomes = [];
    for (let i = 0; i < 3; i++) outcomes.push(det.record(1, 'read_page', { q: 'x' }, ok('stable')));
    for (let i = 0; i < 3; i++) det.record(1, 'browser_info', { i }, ok(`o${i}`));
    for (let i = 0; i < 5; i++) outcomes.push(det.record(1, 'read_page', { q: 'x' }, ok('stable')));
    const stops = outcomes.filter(o => o.kind === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0].reason).toBe('repeat');
    expect(stops[0].params.count).toBe(8);
  });

  test('nudge 节流 + 健康调用 2 次重武装后可再次提醒', () => {
    const det = d();
    const r1 = [0, 1, 2].map(() => det.record(1, 'read_page', { q: 'x' }, ok('stable')));
    expect(r1[2].kind).toBe('nudge');
    det.record(1, 'browser_info', { i: 1 }, ok('h1'));
    det.record(1, 'browser_info', { i: 2 }, ok('h2'));
    const r2 = det.record(1, 'read_page', { q: 'x' }, ok('stable'));
    expect(r2.kind).toBe('nudge'); // 重武装后同 key 可再次提醒
  });
});

describe('② ref 枚举（query_elements）', () => {
  test('正例·合法顺序翻页 1→10（hasMore 链）恒 none', () => {
    const det = d();
    for (let p = 1; p <= 10; p++) {
      expect(det.record(1, 'query_elements', qArgs(p), qRes(p, `p${p}`, p < 10, 10)).kind).toBe('none');
    }
  });

  test('正例·乱序跳页 12 次 → stop(refEnum)', () => {
    const det = d();
    const pages = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 2, 4, 6];
    let last;
    for (let i = 0; i < pages.length; i++) {
      last = det.record(1, 'query_elements', qArgs(pages[i]), qRes(pages[i], `j${i}`, true, 20));
    }
    expect(last.kind).toBe('stop');
    expect(last.reason).toBe('refEnum');
  });

  test('正例·重读同页且结果未变化：3 次 nudge、6 次 stop', () => {
    const det = d();
    const seq = [1, 2, 1, 2, 1, 2, 1, 2];
    const rs = [];
    for (let i = 0; i < seq.length; i++) {
      rs.push(det.record(1, 'query_elements', qArgs(seq[i]), qRes(seq[i], seq[i] === 1 ? 'a' : 'b')));
    }
    expect(rs[2].kind).toBe('none'); // 第 3 次调用：suspicious=1
    expect(rs[3].kind).toBe('none'); // suspicious=2
    expect(rs[4].kind).toBe('nudge'); // suspicious=3（可能与 repeat 同轮命中，用子串断言）
    expect(rs[4].warning).toContain('enumeration');
    expect(rs[7].kind).toBe('stop');
    expect(rs[7].reason).toBe('refEnum');
  });

  test('反例·同页重读但结果有变化（轮询型）恒 none', () => {
    const det = d();
    det.record(1, 'query_elements', qArgs(1), qRes(1, 'v0'));
    for (let i = 1; i <= 10; i++) {
      expect(det.record(1, 'query_elements', qArgs(1), qRes(1, `v${i}`)).kind).toBe('none');
    }
  });

  test('反例·多搜索（不同 filterByText 各自首页）恒 none', () => {
    const det = d();
    for (let i = 0; i < 4; i++) {
      expect(det.record(1, 'query_elements', qArgs(1, { filterByText: `term${i}` }), qRes(1, `t${i}`, false, 1)).kind).toBe('none');
    }
  });

  test('正例·非法页计可疑 ×3 → nudge', () => {
    const det = d();
    det.record(1, 'query_elements', qArgs(1), qRes(1, 'a', true, 5));
    const r1 = det.record(1, 'query_elements', qArgs(7), qRes(7, 'x', false, 5));
    const r2 = det.record(1, 'query_elements', qArgs(8), qRes(8, 'y', false, 5));
    const r3 = det.record(1, 'query_elements', qArgs(9), qRes(9, 'z', false, 5));
    expect(r1.kind).toBe('none');
    expect(r2.kind).toBe('none');
    expect(r3.kind).toBe('nudge');
    expect(r3.warning).toContain('enumeration');
  });

  test('豁免·作用域切换不清累计（两个 scope 来回切不逃逸）', () => {
    const det = d();
    const A = { filterByText: 'a' };
    const B = { filterByText: 'b' };
    det.record(1, 'query_elements', qArgs(1, A), qRes(1, 'a1'));
    det.record(1, 'query_elements', qArgs(1, B), qRes(1, 'b1'));
    const r3 = det.record(1, 'query_elements', qArgs(1, A), qRes(1, 'a1')); // A 重读 → s1
    const r4 = det.record(1, 'query_elements', qArgs(1, B), qRes(1, 'b1')); // B 重读 → s2
    const r5 = det.record(1, 'query_elements', qArgs(1, A), qRes(1, 'a1')); // A 重读 → s3
    expect(r3.kind).toBe('none');
    expect(r4.kind).toBe('none');
    expect(r5.kind).toBe('nudge');
    expect(r5.warning).toContain('enumeration');
  });

  test('非 query 已执行调用 → 枚举状态整体清零', () => {
    const det = d();
    det.record(1, 'query_elements', qArgs(1), qRes(1, 'a'));
    det.record(1, 'query_elements', qArgs(2), qRes(2, 'b'));
    det.record(1, 'query_elements', qArgs(1), qRes(1, 'a')); // s1
    det.record(1, 'query_elements', qArgs(2), qRes(2, 'b')); // s2
    det.record(1, 'browser_info', { probe: 1 }, ok('h1')); // 非 query → 清零
    det.record(1, 'browser_info', { probe: 2 }, ok('h2')); // 稀释窗口（防 repeat 噪音）
    const r = det.record(1, 'query_elements', qArgs(1), qRes(1, 'a'));
    expect(r.kind).toBe('none'); // 已清零：p1 作为新作用域首页中性（未清零则 s3 → nudge）
  });

  test('失败读不更新枚举状态', () => {
    const det = d();
    det.record(1, 'query_elements', qArgs(1), qRes(1, 'a'));
    det.record(1, 'query_elements', qArgs(2), qRes(2, 'b'));
    det.record(1, 'query_elements', qArgs(1), qRes(1, 'a')); // s1
    const r = det.record(1, 'query_elements', qArgs(1), { success: false, error: 'frame gone' });
    expect(r.kind).toBe('none'); // 失败读既不计可疑也不清零
  });
});

describe('③ ABAB 振荡', () => {
  test('正例·A,B,A,B → nudge；8 条全交替 → stop（导航乒乓同链路）', () => {
    const det = d();
    const A = (i) => det.record(1, 'interact_element', { ref: 1, action: 'click' }, ok(`a${i}`));
    const B = () => det.record(1, 'manage_tab', { action: 'back' }, { success: true });
    const r = [A(0), B(), A(1), B(), A(2), B(), A(3), B()];
    expect(r[0].kind).toBe('none');
    expect(r[1].kind).toBe('none');
    expect(r[2].kind).toBe('none');
    expect(r[3].kind).toBe('nudge'); // 第 4 条构成 A,B,A,B
    expect(r[3].warning).toContain('Oscillation');
    expect(r[4].kind).toBe('none'); // 片段内节流（导航重置不清 flowWarned）
    expect(r[5].kind).toBe('none');
    expect(r[6].kind).toBe('none');
    expect(r[7].kind).toBe('stop'); // 8 条全交替
    expect(r[7].reason).toBe('oscillation');
    expect(r[7].params.keyA).toBe('interact_element');
    expect(r[7].params.keyB).toBe('manage_tab');
  });

  test('反例·AAAA（单调用重复形态）不触发振荡', () => {
    const det = d();
    for (let i = 0; i < 6; i++) {
      const r = det.record(1, 'interact_element', { ref: 1, action: 'click' }, ok(`c${i}`));
      expect(r.kind).toBe('none');
    }
  });

  test('反例·交替被第三调用打断后重新计数', () => {
    const det = d();
    const A = (i) => det.record(1, 'interact_element', { ref: 1, action: 'click' }, ok(`a${i}`));
    const B = () => det.record(1, 'manage_tab', { action: 'back' }, { success: true });
    const X = () => det.record(1, 'interact_element', { ref: 99, action: 'click' }, ok('x'));
    const rs = [A(0), B(), A(1), X(), B(), A(2), B()];
    for (const r of rs) expect(r.kind).toBe('none');
  });
});

describe('④ 失败作用域', () => {
  test('正例·同 ref 失败 ×2 nudge / ×3 stop（stop 优先于同轮 repeat nudge）', () => {
    const det = d();
    const click = () => det.record(1, 'interact_element', { ref: 5, action: 'click' }, { success: false, error: 'element not found' });
    const r = [click(), click(), click()];
    expect(r[0].kind).toBe('none');
    expect(r[1].kind).toBe('nudge');
    expect(r[1].warning).toContain('failure');
    expect(r[2].kind).toBe('stop');
    expect(r[2].reason).toBe('failureScope');
    expect(r[2].params.scope).toBe('ref:5');
  });

  test('反例·成功退休 + 不同目标独立', () => {
    const det = d();
    const F = (ref) => det.record(1, 'interact_element', { ref, action: 'click' }, { success: false, error: 'not found' });
    F(5);
    det.record(1, 'interact_element', { ref: 5, action: 'click' }, ok('typed'));
    const r = F(5);
    expect(r.kind).toBe('none'); // 成功已退休：重新从 1 计数（未退休则 count=2 → nudge）
    F(6); F(6);
    const r6 = F(6);
    expect(r6.kind).toBe('stop');
    expect(r6.params.scope).toBe('ref:6');
  });

  test('归一·同 ref 不同 action 不逃逸（按目标归一）', () => {
    const det = d();
    det.record(1, 'interact_element', { ref: 7, action: 'click' }, { success: false, error: 'e1' });
    const r = det.record(1, 'interact_element', { ref: 7, action: 'type', value: 'x' }, { success: false, error: 'e2' });
    expect(r.kind).toBe('nudge');
    expect(r.warning).toContain('failure');
    expect(r.warning).toContain('ref:7');
  });

  test('declined（确认被拒）计失败', () => {
    const det = d();
    const dec = () => det.record(1, 'interact_element', { ref: 9, action: 'click' }, { success: false, declined: true });
    const r = [dec(), dec(), dec()];
    expect(r[1].kind).toBe('nudge');
    expect(r[2].kind).toBe('stop');
    expect(r[2].reason).toBe('failureScope');
  });

  test('反例·白名单外工具不参与', () => {
    const det = d();
    for (let i = 0; i < 5; i++) {
      expect(det.record(1, 'browser_info', { i }, { success: false, error: `e${i}` }).kind).toBe('none');
    }
  });
});

describe('⑤ 导航处理', () => {
  test('manage_tab back 成功 → 清失败计数（窗口保留）', () => {
    const det = d();
    const F = () => det.record(1, 'interact_element', { ref: 5, action: 'click' }, { success: false, error: 'nf' });
    F(); F(); // count=2（已 nudge）
    det.record(1, 'browser_info', { d: 1 }, ok('h1'));
    det.record(1, 'browser_info', { d: 2 }, ok('h2'));
    det.record(1, 'browser_info', { d: 3 }, ok('h3'));
    det.record(1, 'browser_info', { d: 4 }, ok('h4'));
    det.record(1, 'manage_tab', { action: 'back' }, { success: true }); // 导航重置
    const r = F();
    expect(r.kind).toBe('none'); // 未重置则 count=3 → stop(failureScope)
  });

  test('wait_navigation 成功同样重置', () => {
    const det = d();
    const F = () => det.record(1, 'interact_element', { ref: 6, action: 'click' }, { success: false, error: 'nf6' });
    F(); F();
    det.record(1, 'browser_info', { w: 1 }, ok('w1'));
    det.record(1, 'browser_info', { w: 2 }, ok('w2'));
    det.record(1, 'browser_info', { w: 3 }, ok('w3'));
    det.record(1, 'browser_info', { w: 4 }, ok('w4'));
    det.record(1, 'wait_navigation', {}, { success: true });
    const r = F();
    expect(r.kind).toBe('none');
  });

  test('反例·失败导航不重置（第 3 次失败照常 stop）', () => {
    const det = d();
    const F = () => det.record(1, 'interact_element', { ref: 8, action: 'click' }, { success: false, error: 'nf8' });
    F(); F();
    det.record(1, 'manage_tab', { action: 'back' }, { success: false, error: 'nav failed' });
    const r = F();
    expect(r.kind).toBe('stop');
    expect(r.reason).toBe('failureScope');
  });
});

describe('⑥ 无进展滚动', () => {
  test('正例·top moved:false ×2 nudge / ×3 stop', () => {
    const det = d();
    const stuck = () => det.record(1, 'scroll_to', { target: 'top' }, { success: true, message: 'scrolled', moved: false });
    const r = [stuck(), stuck(), stuck()];
    expect(r[0].kind).toBe('none');
    expect(r[1].kind).toBe('nudge');
    expect(r[1].warning).toContain('scroll_to(top)');
    expect(r[2].kind).toBe('stop');
    expect(r[2].reason).toBe('noProgressScroll');
    expect(r[2].params.key).toBe('top');
  });

  test('正例·坐标 5px 网格归一（102/201、101/199 归入 100/200）', () => {
    const det = d();
    const c = (x, y) => det.record(1, 'scroll_to', { target: 'coordinates', x, y }, { success: true, message: 'm', moved: false });
    c(100, 200);
    c(102, 201);
    const r = c(101, 199);
    expect(r.kind).toBe('stop');
    expect(r.reason).toBe('noProgressScroll');
    expect(r.params.key).toBe('coords:100,200');
  });

  test('反例·任意一次真实滚动清零', () => {
    const det = d();
    const stuck = () => det.record(1, 'scroll_to', { target: 'top' }, { success: true, message: 'm', moved: false });
    stuck(); stuck(); // count=2（nudge）
    det.record(1, 'scroll_to', { target: 'bottom' }, { success: true, message: 'm' }); // 真实滚动 → 清零
    det.record(1, 'browser_info', { s: 1 }, ok('s1'));
    det.record(1, 'browser_info', { s: 2 }, ok('s2'));
    det.record(1, 'browser_info', { s: 3 }, ok('s3'));
    const r = det.record(1, 'scroll_to', { target: 'top' }, { success: true, message: 'm', moved: false });
    expect(r.kind).toBe('none'); // 未清零则 count=3 → stop
  });

  test('反例·selector 目标不参与判定（即使带 moved:false）', () => {
    const det = d();
    const sel = () => det.record(1, 'scroll_to', { target: 'selector', selector: '#x' }, { success: true, message: 'm', moved: false });
    expect(sel().kind).toBe('none');
    expect(sel().kind).toBe('none'); // 若 selector 参与判定，第 2 次应为 nudge
  });
});

describe('全局机制', () => {
  test('全局预算：第 8 条提醒转为 stop(budget)', () => {
    const det = d();
    const outcomes = [];
    for (let frag = 0; frag < 8; frag++) {
      for (let i = 0; i < 3; i++) {
        outcomes.push(det.record(1, 'read_page', { q: `frag${frag}` }, ok(`frag${frag}`)));
      }
    }
    const nudges = outcomes.filter(o => o.kind === 'nudge');
    const stops = outcomes.filter(o => o.kind === 'stop');
    expect(nudges).toHaveLength(7);
    expect(stops).toHaveLength(1);
    expect(stops[0].reason).toBe('budget');
    expect(stops[0].params.nudges).toBe(8);
  });

  test('多 tab 分桶隔离', () => {
    const det = d();
    const r1 = [0, 1, 2].map(() => det.record(1, 'read_page', { q: 'x' }, ok('same')));
    expect(r1[2].kind).toBe('nudge');
    const r2 = [0, 1, 2].map(() => det.record(2, 'read_page', { q: 'x' }, ok('same')));
    expect(r2[0].kind).toBe('none');
    expect(r2[1].kind).toBe('none');
    expect(r2[2].kind).toBe('nudge'); // tab2 独立计数（若共享则第 1 次就 nudge）
  });

  test('实例隔离（run / 子任务递归各自独立）', () => {
    const det1 = d();
    const det2 = d();
    for (let i = 0; i < 3; i++) det1.record(1, 'read_page', { q: 'x' }, ok('s'));
    const r = det2.record(1, 'read_page', { q: 'x' }, ok('s'));
    expect(r.kind).toBe('none');
  });

  test('R1 铁证·正常多步任务全 none（零注入）', () => {
    const det = d();
    const calls = [
      ['query_elements', qArgs(1), qRes(1, 'a', true, 3)],
      ['query_elements', qArgs(2), qRes(2, 'b', true, 3)],
      ['query_elements', qArgs(3), qRes(3, 'c', false, 3)],
      ['interact_element', { ref: 11, action: 'click' }, ok('clicked')],
      ['browser_info', { type: 'title' }, ok('title')],
      ['interact_element', { ref: 12, action: 'type', value: 'hi' }, { success: false, error: 'not editable' }],
      ['interact_element', { ref: 12, action: 'type', value: 'hi' }, ok('typed')],
      ['scroll_to', { target: 'top' }, { success: true, message: 'm', moved: false }],
      ['scroll_to', { target: 'bottom' }, { success: true, message: 'm' }],
      ['manage_tab', { action: 'back' }, { success: true }],
      ['query_elements', qArgs(1, { filterByText: 'login' }), qRes(1, 'L', false, 1)],
      ['wait_navigation', {}, { success: true }],
    ];
    const outcomes = calls.map(([n, a, r]) => det.record(1, n, a, r));
    expect(outcomes.every(o => o.kind === 'none')).toBe(true);
  });

  test('配置可注入（阈值单点可调）', () => {
    const det = createLoopDetector({ repeat: { nudgeAt: 2, stopAt: 4 } });
    const r = [0, 1, 2].map(() => det.record(1, 'read_page', { q: 'x' }, ok('m')));
    expect(r[1].kind).toBe('nudge');
    expect(r[2].kind).toBe('none');
    const r4 = det.record(1, 'read_page', { q: 'x' }, ok('m'));
    expect(r4.kind).toBe('stop');
    expect(r4.params.count).toBe(4);
    expect(LOOP_DETECTOR_CONFIG.repeat.stopAt).toBe(8); // 默认常量不被污染
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/unit/loop-detector.unit.test.js`
Expected: FAIL —— 报错 `Failed to resolve import "../../src/background/loop-detector.js"`（模块尚不存在）

- [ ] **Step 3: 编写模块实现**

创建 `src/background/loop-detector.js`：

```js
// loop-detector.js - 多模式循环检测器（纯逻辑，browser-free）
// 设计文档：docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md
//
// 六模式：①重复（窗口制）②ref 枚举 ③ABAB 振荡 ④失败作用域 ⑤导航重置 ⑥无进展滚动
// 接口：createLoopDetector().record(tabId, toolName, args, result)
//   → { kind: 'none' }                        无检测（含"持续片段内静默"）
//   → { kind: 'nudge', warning }              模型可见英文提醒（用户不可见）；多条目以 \n 连接
//   → { kind: 'stop', reason, params }        硬停；react-loop 侧映射 t('reactLoop.loopStopped*')
// 本模块不依赖任何浏览器 API，可在 Node 环境直接单测。

export const LOOP_DETECTOR_CONFIG = {
  windowSize: 6,            // 重复检测环形窗口
  ababTailSize: 8,          // ABAB 交替尾迹
  repeat: { nudgeAt: 3, stopAt: 8, maxKeys: 32 },
  oscillation: { nudgeTail: 4, stopTail: 8 },
  refEnum: { nudgeAt: 3, stopSuspicious: 6, stopNonSeq: 12, maxScopes: 8 },
  failureScope: { nudgeAt: 2, stopAt: 3, maxScopes: 32 },
  noProgressScroll: { nudgeAt: 2, stopAt: 3, coordGrid: 5 },
  hysteresis: { healthyToRearm: 2 },
  budget: { stopAtNudges: 8 },
};

// 失败作用域适用的变更类工具白名单
const FAILURE_SCOPE_TOOLS = new Set([
  'interact_element', 'fill_form', 'select_dropdown',
  'keyboard_input', 'file_upload', 'drag_drop',
]);

// —— 稳定序列化 + FNV-1a 哈希（约 24K 字符串 <1ms）——

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function hashValue(value) {
  try { return fnv1a(stableStringify(value)); } catch { return fnv1a(String(value)); }
}

// —— 各模式的身份计算 ——

// 动作身份：工具名 + 参数（不含结果）→ ABAB 振荡用
function argsKeyOf(toolName, args) {
  return hashValue({ n: toolName, a: args });
}

// 完整身份：工具名 + 参数 + 结果（结果进 key 是刻意保留：轮询合法不误报）→ 重复检测用
function fullKeyOf(toolName, args, result) {
  return hashValue({ n: toolName, a: args, r: result });
}

// ref 枚举作用域：仅取影响分页语义的四个参数（默认值归一）；不含 page
function refScopeOf(args) {
  return hashValue({
    maxResults: args.maxResults ?? 100,
    maxChars: args.maxChars ?? 6000,
    filterByText: args.filterByText ?? '',
    frames: args.frames ?? 'auto',
  });
}

// 失败作用域归一：按目标而非调用形态（同一 ref 的 click/type 视为同目标）
function failureScopeOf(toolName, args) {
  switch (toolName) {
    case 'interact_element':
      if (args.ref != null) return `ref:${args.ref}`;
      if (args.text != null) return `text:${String(args.text).trim().replace(/\s+/g, ' ')}`;
      if (args.selector) return `sel:${args.selector}`;
      return null;
    case 'fill_form': {
      const fields = Array.isArray(args.fields) ? args.fields : [];
      const ids = fields.map(f =>
        f && f.ref != null ? `ref:${f.ref}` : `sel:${f?.selector ?? ''}:${f?.fieldType ?? ''}`
      ).sort();
      return ids.length ? `ff:${ids.join(',')}` : null;
    }
    case 'select_dropdown':
      if (args.ref != null) return `sd:ref:${args.ref}`;
      if (args.triggerSelector || args.selector) return `sd:sel:${args.triggerSelector || args.selector}`;
      return null;
    case 'keyboard_input':
      return args.selector ? `kb:${args.selector}` : null;
    case 'file_upload':
      if (args.ref != null) return `fu:ref:${args.ref}`;
      if (args.selector) return `fu:sel:${args.selector}`;
      return null;
    case 'drag_drop':
      if (args.sourceSelector && args.targetSelector) return `dd:sel:${args.sourceSelector}->${args.targetSelector}`;
      if (args.sourceRef != null && args.targetRef != null) return `dd:ref:${args.sourceRef}->${args.targetRef}`;
      return null;
    default:
      return null;
  }
}

// 失败判定：declined 明确计失败；success===false 或 error 非空计失败
function isFailedResult(result) {
  if (!result || typeof result !== 'object') return false;
  if (result.declined === true) return true;
  if (result.success === false) return true;
  if (result.error) return true;
  return false;
}

// 导航重置信号：back/forward/reload 成功、wait_navigation 成功（= 进展证据）
// 真实工具契约：manage_tab action∈['open','switch','close','reload','navigate']，
// history back/forward 为 action:'navigate' + direction:'back'|'forward'（见 tools/tab-tools.js）
// 【执行时修正】原计划文本的 `['back','forward','reload'].includes(args?.action)` 与真实契约不符（Task 1 审查轮 Critical#1，commit 71e948f）
function isNavResetSignal(toolName, args, result) {
  if (!result || result.success === false) return false;
  if (toolName === 'wait_navigation') return true;
  if (toolName === 'manage_tab') {
    if (args?.action === 'reload') return true;
    if (args?.action === 'navigate' && ['back', 'forward'].includes(args?.direction)) return true;
  }
  return false;
}

// 无进展滚动的作用域 key（selector/text 目标返回 null = 不参与）
function scrollKeyOf(args, coordGrid) {
  if (!args) return null;
  if (args.target === 'top') return 'top';
  if (args.target === 'bottom') return 'bottom';
  if (args.target === 'coordinates') {
    const gx = Math.round((Number(args.x) || 0) / coordGrid) * coordGrid;
    const gy = Math.round((Number(args.y) || 0) / coordGrid) * coordGrid;
    return `coords:${gx},${gy}`;
  }
  return null;
}

// —— 桶与子状态 ——

function freshRefEnumState() {
  return { lastScope: null, lastPage: null, lastHasMore: false, seenByScope: new Map(), suspicious: 0, nonSeq: 0 };
}

function createBucket() {
  return {
    window: [],            // [{ argsKey, fullKey, name }] 最近 windowSize 条（重复检测）
    ababTail: [],          // [{ key, name }] 最近 ababTailSize 条（振荡检测）
    repeatCounts: new Map(),
    refEnum: freshRefEnumState(),
    failureScopes: new Map(),
    scroll: { key: null, count: 0 },
    warned: new Set(),     // 页面作用域提醒标记（导航重置清）
    flowWarned: new Set(), // ABAB 专用提醒标记（导航不清）
    healthyStreak: 0,      // 连续健康调用数（迟滞重武装）
  };
}

function trimMap(map, max) {
  while (map.size > max) map.delete(map.keys().next().value);
}

function mergeConfig(base, override) {
  const out = { ...base };
  for (const k of Object.keys(override || {})) {
    out[k] = (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k]))
      ? { ...base[k], ...override[k] }
      : override[k];
  }
  return out;
}

// —— 模式算法 ——

// ABAB 振荡：最近 4 条 A,B,A,B → hit；尾迹全交替 → fullAlternate（硬停）
function evalAbab(bucket, cfg) {
  const tail = bucket.ababTail;
  const out = { hit: false, fullAlternate: false, pairKey: null, nameA: null, nameB: null };
  // 【执行时修正】原计划文本此处硬编码 4；实现改为读 cfg.oscillation.nudgeTail（默认 4 时行为严格等值，消除死配置，Task 1 审查轮 Minor#4）
  const n = cfg.oscillation.nudgeTail;
  const last = tail.slice(-n);
  if (last.length === n) {
    const odd = last[0];
    const even = last[1];
    let alt = !!even && odd.key !== even.key;
    if (alt) {
      for (let i = 0; i < last.length; i++) {
        const expected = i % 2 === 0 ? odd : even;
        if (last[i].key !== expected.key) { alt = false; break; }
      }
    }
    if (alt) {
      out.hit = true;
      out.pairKey = [odd.key, even.key].sort().join('|');
      out.nameA = odd.name;
      out.nameB = even.name;
    }
  }
  const st = cfg.oscillation.stopTail;
  if (tail.length >= st) {
    const w = tail.slice(-st);
    const odd = w[0];
    const even = w[1];
    let full = odd.key !== even.key;
    if (full) {
      for (let i = 0; i < w.length; i++) {
        const expected = i % 2 === 0 ? odd : even;
        if (w[i].key !== expected.key) { full = false; break; }
      }
    }
    if (full) {
      out.fullAlternate = true;
      out.pairKey = [odd.key, even.key].sort().join('|');
      out.nameA = odd.name;
      out.nameB = even.name;
    }
  }
  return out;
}

// ref 枚举更新：返回本次是否计可疑（suspicious / nonSeq 归类见 spec §5.2）
function updateRefEnum(bucket, args, result, cfg) {
  const st = bucket.refEnum;
  const scope = refScopeOf(args);
  const page = Number.isInteger(args.page) && args.page > 0 ? args.page : 1;
  const totalPages = typeof result.totalPages === 'number' ? result.totalPages : null;
  const hasMore = result.hasMore === true;
  const resultHash = hashValue(result);
  let hit = false;

  let seen = st.seenByScope.get(scope);
  if (!seen) {
    seen = new Map();
    st.seenByScope.set(scope, seen);
    trimMap(st.seenByScope, cfg.refEnum.maxScopes);
  }

  const prevHash = seen.get(page);
  const isSequential = st.lastScope === scope && page === (st.lastPage ?? 0) + 1 && st.lastHasMore === true;
  const isIllegalPage = totalPages !== null && page > totalPages;

  if (isIllegalPage) {
    st.suspicious += 1; // 非法页（超出 totalPages）
    hit = true;
  } else if (isSequential) {
    // 合法顺序步进：不增可疑
  } else if (prevHash !== undefined && prevHash === resultHash) {
    st.suspicious += 1; // 重读且结果未变化
    hit = true;
  } else if (prevHash !== undefined) {
    // 重读但结果有变化（轮询合法）→ 视为推进
  } else if (seen.size === 0) {
    // 新作用域首页 → 中性（连续多搜索不误报）
  } else {
    st.nonSeq += 1; // 非顺序新页（乱序跳页）
    hit = true;
  }

  seen.set(page, resultHash);
  st.lastScope = scope;
  st.lastPage = page;
  st.lastHasMore = hasMore;
  return hit;
}

// —— 检测器实例 ——

export function createLoopDetector(config = {}) {
  const cfg = mergeConfig(LOOP_DETECTOR_CONFIG, config);
  const buckets = new Map();
  let nudges = 0; // 全局提醒预算（实例级，不按 tab；永不清零）

  function getBucket(tabId) {
    let b = buckets.get(tabId);
    if (!b) { b = createBucket(); buckets.set(tabId, b); }
    return b;
  }

  function rearmIfHealthy(bucket) {
    bucket.healthyStreak += 1;
    if (bucket.healthyStreak >= cfg.hysteresis.healthyToRearm) {
      bucket.warned.clear();
      bucket.flowWarned.clear();
      bucket.healthyStreak = 0;
    }
  }

  // 同片段仅 1 条；flow=true 用 ABAB 专用集合（导航不清）
  function maybeNudge(bucket, warnKey, text, out, flow = false) {
    const set = flow ? bucket.flowWarned : bucket.warned;
    if (set.has(warnKey)) return false;
    set.add(warnKey);
    out.push(text);
    return true;
  }

  function resetPageScopedState(bucket) {
    bucket.repeatCounts.clear();
    bucket.refEnum = freshRefEnumState();
    bucket.failureScopes.clear();
    bucket.scroll = { key: null, count: 0 };
    bucket.warned.clear();
    // window / ababTail / flowWarned / healthyStreak / nudges 保留
  }

  function record(tabId, toolName, args, result) {
    const bucket = getBucket(tabId);
    const safeArgs = args || {};
    const isNav = isNavResetSignal(toolName, safeArgs, result);
    if (isNav) resetPageScopedState(bucket);

    const aKey = argsKeyOf(toolName, safeArgs);
    const fKey = fullKeyOf(toolName, safeArgs, result);
    const skipped = !!(result && result.skipped);

    let stop = null;
    const warnings = [];
    let patternHit = false;

    // ① 入窗 + ② 入尾迹（成功导航不入窗：其本身即进展证据；尾迹保留供导航乒乓检测）
    if (!isNav) bucket.window.push({ argsKey: aKey, fullKey: fKey, name: toolName });
    if (bucket.window.length > cfg.windowSize) bucket.window.shift();
    bucket.ababTail.push({ key: aKey, name: toolName });
    if (bucket.ababTail.length > cfg.ababTailSize) bucket.ababTail.shift();

    if (!isNav) {
      // ③ 重复：窗口制软提醒 + 累计硬停（轮询因结果进 key 天然不触发）
      const count = (bucket.repeatCounts.get(fKey) || 0) + 1;
      bucket.repeatCounts.set(fKey, count);
      trimMap(bucket.repeatCounts, cfg.repeat.maxKeys);
      const inWindow = bucket.window.filter(e => e.fullKey === fKey).length;
      if (count >= cfg.repeat.stopAt) {
        stop = stop || { reason: 'repeat', params: { count, toolName } };
        patternHit = true;
      } else if (inWindow >= cfg.repeat.nudgeAt) {
        patternHit = true;
        maybeNudge(bucket, `repeat:${fKey}`,
          `Repeated identical tool call detected: "${toolName}" ×${count} with identical parameters and identical results in the recent window; this operation is making no progress.`,
          warnings);
      }

      // ⑤ ref 枚举（query_elements 专用；失败读不更新；skipped 不计入）
      if (toolName === 'query_elements') {
        if (!skipped && !(result && result.success === false)) {
          if (updateRefEnum(bucket, safeArgs, result, cfg)) patternHit = true;
          const st = bucket.refEnum;
          if (st.suspicious >= cfg.refEnum.stopSuspicious || st.nonSeq >= cfg.refEnum.stopNonSeq) {
            stop = stop || { reason: 'refEnum', params: { count: Math.max(st.suspicious, st.nonSeq) } };
            patternHit = true;
          } else if (st.suspicious >= cfg.refEnum.nudgeAt) {
            patternHit = true;
            maybeNudge(bucket, 'refEnum',
              `Element enumeration loop detected: pages are being re-read with unchanged results (${st.suspicious} suspicious reads so far).`,
              warnings);
          }
        }
      } else if (!skipped) {
        // 非 query 的已执行调用 = 进展证据 → 枚举状态整体清零
        bucket.refEnum = freshRefEnumState();
      }

      // ⑥ 失败作用域（白名单工具；同目标一次成功即退休）
      if (!skipped && FAILURE_SCOPE_TOOLS.has(toolName)) {
        const scope = failureScopeOf(toolName, safeArgs);
        if (scope) {
          if (isFailedResult(result)) {
            const c = (bucket.failureScopes.get(scope) || 0) + 1;
            bucket.failureScopes.set(scope, c);
            trimMap(bucket.failureScopes, cfg.failureScope.maxScopes);
            if (c >= cfg.failureScope.stopAt) {
              stop = stop || { reason: 'failureScope', params: { scope } };
              patternHit = true;
            } else if (c >= cfg.failureScope.nudgeAt) {
              patternHit = true;
              maybeNudge(bucket, `failure:${scope}`,
                `Repeated failure detected: the operation target "${scope}" has failed ${c} times; this target is making no progress.`,
                warnings);
            }
          } else {
            bucket.failureScopes.delete(scope);
          }
        }
      }

      // ⑦ 无进展滚动（静态判定 moved:false；成功滚动即清零）
      if (!skipped && toolName === 'scroll_to') {
        const sKey = scrollKeyOf(safeArgs, cfg.noProgressScroll.coordGrid);
        const notMoved = result && result.moved === false;
        if (sKey && notMoved) {
          if (bucket.scroll.key !== sKey) { bucket.scroll.key = sKey; bucket.scroll.count = 0; }
          bucket.scroll.count += 1;
          if (bucket.scroll.count >= cfg.noProgressScroll.stopAt) {
            stop = stop || { reason: 'noProgressScroll', params: { key: sKey } };
            patternHit = true;
          } else if (bucket.scroll.count >= cfg.noProgressScroll.nudgeAt) {
            patternHit = true;
            maybeNudge(bucket, `scroll:${sKey}`,
              `No-progress scrolling detected: scroll_to(${sKey}) reports no movement (already at boundary) ${bucket.scroll.count} times.`,
              warnings);
          }
        } else if (!notMoved && !(result && result.success === false)) {
          bucket.scroll = { key: null, count: 0 };
        }
      }
    }

    // ④ ABAB 振荡（导航与非导航调用均参与：back/forward 交替即导航乒乓）
    const abab = evalAbab(bucket, cfg);
    if (abab.fullAlternate) {
      stop = stop || { reason: 'oscillation', params: { keyA: abab.nameA, keyB: abab.nameB } };
      patternHit = true;
    } else if (abab.hit) {
      patternHit = true;
      maybeNudge(bucket, `abab:${abab.pairKey}`,
        `Oscillation detected: "${abab.nameA}" and "${abab.nameB}" are alternating repeatedly with no progress.`,
        warnings, true);
    }

    // ⑧ 健康迟滞 / 重武装
    if (patternHit) {
      bucket.healthyStreak = 0;
    } else {
      rearmIfHealthy(bucket);
    }

    if (stop) return { kind: 'stop', ...stop };

    if (warnings.length > 0) {
      nudges += 1;
      if (nudges >= cfg.budget.stopAtNudges) {
        return { kind: 'stop', reason: 'budget', params: { nudges } };
      }
      return { kind: 'nudge', warning: warnings.join('\n') };
    }
    return { kind: 'none' };
  }

  return { record };
}
```

- [ ] **Step 4: 运行测试确认全绿**

Run: `npx vitest run test/unit/loop-detector.unit.test.js`
Expected: PASS —— `33 passed`（0 failed）

- [ ] **Step 5: Commit**

```bash
git add src/background/loop-detector.js test/unit/loop-detector.unit.test.js
git commit -m "feat: 新增多模式循环检测器模块（六模式纯逻辑 + 全量单测）"
```

---

### Task 2: scroll_to 静态边界判定（content 侧）

**Files:**
- Modify: `src/content/interaction-tools.js`（`scrollToPosition`，L252-276）
- Test: `test/unit/content/interaction-tools.unit.test.js`（文件末尾追加 describe）

**Interfaces:**
- Consumes: 无（独立改动）
- Produces: `scrollToPosition` 在"已在边界"时输出 `{ success: true, message, moved: false }`；其余场景输出与改造前**逐字节一致**（无 `moved` 字段）。Task 4 的检测器消费 `moved === false`。

- [ ] **Step 1: 编写失败测试（文件末尾追加）**

在 `test/unit/content/interaction-tools.unit.test.js` 末尾（最后一个 `});` 之后）追加：

```js

describe('scrollToPosition - 无进展静态判定（moved:false）', () => {
  // jsdom 默认 scrollY/innerHeight/scrollHeight 不可靠，显式桩后再断言
  const stub = ({ scrollY = 0, scrollX = 0, innerHeight = 768, scrollHeight = 2000, scrollTop = 0 } = {}) => {
    Object.defineProperty(window, 'scrollY', { configurable: true, value: scrollY });
    Object.defineProperty(window, 'scrollX', { configurable: true, value: scrollX });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight });
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: scrollHeight });
    Object.defineProperty(document.documentElement, 'scrollTop', { configurable: true, value: scrollTop });
  };

  test('top：已在顶部 → moved:false；不在顶部 → 无 moved 字段（逐字节形态）', () => {
    stub({ scrollY: 0, scrollTop: 0 });
    const atTop = scrollToPosition({ target: 'top' });
    expect(atTop.success).toBe(true);
    expect(atTop.moved).toBe(false);

    stub({ scrollY: 500, scrollTop: 500 });
    const notTop = scrollToPosition({ target: 'top' });
    expect(notTop.success).toBe(true);
    expect('moved' in notTop).toBe(false);
    expect(Object.keys(notTop)).toEqual(['success', 'message']); // 与改造前形态一致
  });

  test('bottom：已在底部 → moved:false；未到底 → 无 moved', () => {
    stub({ scrollY: 500, innerHeight: 768, scrollHeight: 800 }); // 500+768 >= 800-1
    expect(scrollToPosition({ target: 'bottom' }).moved).toBe(false);

    stub({ scrollY: 0, innerHeight: 768, scrollHeight: 2000 });
    const notBottom = scrollToPosition({ target: 'bottom' });
    expect('moved' in notBottom).toBe(false);
  });

  test('coordinates：已在目标位置（<1px 容差）→ moved:false；否则无 moved', () => {
    stub({ scrollY: 100, scrollX: 0 });
    expect(scrollToPosition({ target: 'coordinates', x: 0, y: 100 }).moved).toBe(false);

    stub({ scrollY: 100, scrollX: 0 });
    const elsewhere = scrollToPosition({ target: 'coordinates', x: 0, y: 500 });
    expect('moved' in elsewhere).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/unit/content/interaction-tools.unit.test.js`
Expected: FAIL —— 新 3 个用例失败（`expected undefined to be false`，`moved` 字段尚不存在）；**既有用例全绿**（证明形态未变）

- [ ] **Step 3: 实现静态判定（两处精确替换）**

替换 A —— 在 `src/content/interaction-tools.js` 中，将：

```js
    if (target === 'top') {
      window.scrollTo({ top: 0, left: 0, behavior });
    } else if (target === 'bottom') {
      window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior });
    } else if (target === 'coordinates') {
      window.scrollTo({ top: y, left: x, behavior });
    } else if (target === 'selector' && selector) {
```

替换为：

```js
    // 静态边界判定（仅影响输出形态，不影响滚动行为；用于无进展滚动检测）
    let alreadyAtBoundary = false;
    if (target === 'top') {
      alreadyAtBoundary = (window.scrollY || 0) <= 0 && (document.documentElement.scrollTop || 0) <= 0;
      window.scrollTo({ top: 0, left: 0, behavior });
    } else if (target === 'bottom') {
      // 【执行时修正】原计划文本读 documentElement.scrollHeight；quirks 模式真实滚动容器为 body
      // （其 documentElement.scrollHeight 塌缩为视口高→系统性误报 moved:false），改用 scrollingElement（Task 2 审查轮 Critical，commit e632cbb）
      const scrollingEl = document.scrollingElement || document.documentElement;
      alreadyAtBoundary = (window.scrollY || 0) + (window.innerHeight || 0) >= scrollingEl.scrollHeight - 1;
      window.scrollTo({ top: document.body.scrollHeight, left: 0, behavior });
    } else if (target === 'coordinates') {
      alreadyAtBoundary = Math.abs((window.scrollY || 0) - y) < 1 && Math.abs((window.scrollX || 0) - x) < 1;
      window.scrollTo({ top: y, left: x, behavior });
    } else if (target === 'selector' && selector) {
```

替换 B —— 将函数末尾的：

```js
    return { success: true, message: t('interactionTools.scrollComplete') };
```

替换为：

```js
    const result = { success: true, message: t('interactionTools.scrollComplete') };
    if (alreadyAtBoundary) {
      result.moved = false; // 已在边界：供循环检测器判定无进展（正常滚动不输出该字段）
    }
    return result;
```

（滚动行为本身零改动：仍 fire-and-forget + smooth；`selector` / `text` 目标不判定、不产生 `moved`。）

- [ ] **Step 4: 运行测试确认全绿**

Run: `npx vitest run test/unit/content/interaction-tools.unit.test.js`
Expected: PASS —— 该文件全部用例通过（既有 scroll 用例 + 新增 3 个）

- [ ] **Step 5: Commit**

```bash
git add src/content/interaction-tools.js test/unit/content/interaction-tools.unit.test.js
git commit -m "feat: scroll_to 增加静态边界判定（已在边界时输出 moved:false）"
```

---

### Task 3: i18n 硬停文案（zh/en 各 6 条，只增不改）

**Files:**
- Modify: `src/background/react-loop.js`（内联字典 zh L39 后 / en L69 后）
- Test: `test/unit/react-loop-loop-detector-wiring.unit.test.js`（**本任务创建，含 i18n describe；Task 4 追加接线 describe**）

**Interfaces:**
- Produces: i18n key `reactLoop.loopStopped{Repeat|RefEnum|Oscillation|FailureScope|NoProgressScroll|Budget}`（zh/en 同名 6 条）；Task 4 的 `flushLoopRecords` 通过 `t('reactLoop.' + key, params)` 消费
- Consumes: 无

- [ ] **Step 1: 编写失败测试（创建源码断言文件）**

创建 `test/unit/react-loop-loop-detector-wiring.unit.test.js`（模式对齐既有 `react-loop-untrusted-wiring.unit.test.js`）：

```js
// react-loop 循环检测器接线守卫：防止重构时静默拆掉检测接线
// 设计文档：docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);

describe('循环检测 i18n 接线守卫（只增不改）', () => {
  const KEYS = [
    'loopStoppedRepeat', 'loopStoppedRefEnum', 'loopStoppedOscillation',
    'loopStoppedFailureScope', 'loopStoppedNoProgressScroll', 'loopStoppedBudget',
  ];

  test('6 个硬停文案 key 在 zh/en 双字典中均存在', () => {
    for (const k of KEYS) {
      const count = (SRC.match(new RegExp(k, 'g')) || []).length;
      expect(count, `${k} 应出现 ≥2 次（zh+en）`).toBeGreaterThanOrEqual(2);
    }
  });

  test('旧 key 保留（只增不改）', () => {
    expect(SRC).toMatch(/infiniteLoopDetected/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/unit/react-loop-loop-detector-wiring.unit.test.js`
Expected: FAIL —— `loopStoppedRepeat 应出现 ≥2 次` 等 6 项断言失败（key 尚不存在）

- [ ] **Step 3: 添加 i18n key（两处精确替换，只增不改）**

zh 字典（在 `infiniteLoopDetected` 行之后插入 6 行），将：

```js
    infiniteLoopDetected: '连续{count}次执行完全相同的工具调用（入参和返参均相同），疑似陷入死循环，已自动终止。请更换策略或缩小任务范围后重试。',
    maxIterationsExceeded: 'ReAct 循环超过最大迭代次数 ({maxIterations})',
```

替换为：

```js
    infiniteLoopDetected: '连续{count}次执行完全相同的工具调用（入参和返参均相同），疑似陷入死循环，已自动终止。请更换策略或缩小任务范围后重试。',
    loopStoppedRepeat: '检测到重复无效操作：工具「{toolName}」结果无变化地反复调用（累计 {count} 次），任务已暂停。可补充指导后恢复任务。',
    loopStoppedRefEnum: '检测到页面元素枚举循环（重复读取 {count} 次），任务已暂停。可补充指导后恢复任务。',
    loopStoppedOscillation: '检测到操作振荡循环（在「{keyA}」与「{keyB}」间反复交替），任务已暂停。可补充指导后恢复任务。',
    loopStoppedFailureScope: '检测到同一操作连续失败（{scope}），任务已暂停。可补充指导后恢复任务。',
    loopStoppedNoProgressScroll: '检测到无进展滚动（{key} 方向已到边界仍反复滚动），任务已暂停。可补充指导后恢复任务。',
    loopStoppedBudget: '检测到多轮无进展操作（累计提醒 {nudges} 次），任务已暂停。可补充指导后恢复任务。',
    maxIterationsExceeded: 'ReAct 循环超过最大迭代次数 ({maxIterations})',
```

en 字典（在 `infiniteLoopDetected` 行之后插入 6 行），将：

```js
    infiniteLoopDetected: 'Executed the exact same tool call {count} times in a row (both inputs and outputs identical), likely stuck in an infinite loop. Automatically terminated. Please change strategy or narrow the task scope and retry.',
    maxIterationsExceeded: 'ReAct loop exceeded maximum iterations ({maxIterations})',
```

替换为：

```js
    infiniteLoopDetected: 'Executed the exact same tool call {count} times in a row (both inputs and outputs identical), likely stuck in an infinite loop. Automatically terminated. Please change strategy or narrow the task scope and retry.',
    loopStoppedRepeat: 'Repeated no-progress operation detected: "{toolName}" was called {count} times with no change in results. Task paused; you can add guidance before resuming.',
    loopStoppedRefEnum: 'Page element enumeration loop detected ({count} repetitive reads). Task paused; you can add guidance before resuming.',
    loopStoppedOscillation: 'Oscillation loop detected (alternating between "{keyA}" and "{keyB}"). Task paused; you can add guidance before resuming.',
    loopStoppedFailureScope: 'The same operation failed repeatedly ({scope}). Task paused; you can add guidance before resuming.',
    loopStoppedNoProgressScroll: 'No-progress scrolling detected ({key}: already at boundary). Task paused; you can add guidance before resuming.',
    loopStoppedBudget: 'Multiple no-progress patterns detected ({nudges} warnings). Task paused; you can add guidance before resuming.',
    maxIterationsExceeded: 'ReAct loop exceeded maximum iterations ({maxIterations})',
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/react-loop-loop-detector-wiring.unit.test.js`
Expected: PASS —— 2 个 describe 用例通过

- [ ] **Step 5: Commit**

```bash
git add src/background/react-loop.js test/unit/react-loop-loop-detector-wiring.unit.test.js
git commit -m "feat: 循环检测硬停文案 i18n（zh/en 各 6 条，只增不改）"
```

---

### Task 4: react-loop 接线（13 处编辑 + 接线守卫测试，单一 commit）

**Files:**
- Modify: `src/background/react-loop.js`（E1-E13，见下）
- Test: `test/unit/react-loop-loop-detector-wiring.unit.test.js`（追加接线 describe）

**Interfaces:**
- Consumes: Task 1 `createLoopDetector` / Task 3 i18n key `reactLoop.loopStopped*`
- Produces: 运行时行为——每轮工具调用记录进 `loopRecords`；轮末 `flushLoopRecords()` 喂入检测器；nudge 合并为一条 `[System Notice]` 消息注入 `currentMessages`；stop 经 `createErrorWithLog` 抛出（走既有 checkpoint 恢复链路）

**背景与注意（执行前必读）：**
- **删除与接线必须同一 commit**（否则新旧双检测器并行双注入）；回退 = revert 该 commit。
- `flushLoopRecords` 定义处引用 `executionLog`（定义在更下方 L673）——闭包引用安全：flush 的**调用点全部在 L1849 之后**，调用时 `executionLog` 已初始化，不存在 TDZ 问题。
- E4 的 old 文本中 `'The user declined this operation.'` 与返回对象里的同名字符串无关——必须用下方 6 行完整块匹配（唯一）。
- E13 的 old 块（50 行）含原文拼写 `infiniteloop:input and outputidentical`、`inject infinite loopwarningmessage`（**无空格**），必须逐字复制。
- 5 个工具记录锚点与题 6 的 flush 调用点之所以这样选：并行/顺序两条执行路径在 E13 处汇合（常规出口）；两个 `planTaskHandled` 分支（E11）在汇合前 `continue` 提前跳过，必须各自 flush——两处文本完全相同，用 replace_all 处理。
- 缓存命中路径（提前 return）**同样必须记录**【执行时修正】：原计划文本“不新增记录”的论证前提不成立——被删旧指纹取自 `assistantMessage.tool_calls`（result 缺省 ''），不依赖 tool 消息即可识别重复调用；缓存命中不记录即构成重复检测能力回退（Task 4 审查轮 Important#2，commit 23fa207）。早退前补 `loopRecords.push({ order: callOrder, name: toolName, args: toolArgs, result: cached.toolResult ?? { fromCache: true } });`，守卫同步增加缓存锚点断言。

- [ ] **Step 1: 追加接线守卫测试**

在 `test/unit/react-loop-loop-detector-wiring.unit.test.js` 文件末尾追加：

```js

describe('循环检测器接线守卫', () => {
  test('导入检测器模块', () => {
    expect(SRC).toMatch(/from '\.\/loop-detector\.js'/);
  });

  test('创建检测器实例与记录数组', () => {
    expect(SRC).toMatch(/const loopDetector = createLoopDetector\(\)/);
    expect(SRC).toMatch(/const loopRecords = \[\]/);
  });

  test('工具记录锚点 ≥5 处（被拒/plan_task/跳过/常规/错误）', () => {
    const count = (SRC.match(/loopRecords\.push\(/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('轮末 flush 共 3 处（2 个 plan_task 分支 + 汇合点）', () => {
    const count = (SRC.match(/flushLoopRecords\(\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('旧指纹逻辑已完全移除（无双检测器并行）', () => {
    expect(SRC).not.toMatch(/lastCombinedFingerprint/);
    expect(SRC).not.toMatch(/REPEATED_CALL_WARN_THRESHOLD/);
    expect(SRC).not.toMatch(/repeatedCallCount/);
  });

  test('stop 经 createErrorWithLog 抛出（复用既有安全终止链路）', () => {
    expect(SRC).toMatch(/createErrorWithLog\(t\(`reactLoop\.\$\{msgKey\}/);
  });

  test('提醒注入为唯一 System Notice 注入点（role: user）', () => {
    const count = (SRC.match(/\[System Notice\]/g) || []).length;
    expect(count).toBe(1);
    expect(SRC).toMatch(/role: 'user',\s*\n\s*content: `\[System Notice\] \$\{warnings\.join/);
  });

  // —— 【执行时修正】以下为审查修复轮新增的位置/序号型断言（原计划仅 7 条计数型，
  // 对锚点位置无鉴别力——Task 4 审查轮 Minor#5，commit 23fa207）——

  test('记录锚点均带声明序号 order（并行路径 push 顺序 = 完成顺序，必须可重排）', () => {
    const pushes = (SRC.match(/loopRecords\.push\(\{[^;]*?\}\);/g) || []);
    // 5 个生命周期锚点（被拒/plan_task/跳过/常规/错误）+ 1 个缓存命中锚点
    expect(pushes.length).toBeGreaterThanOrEqual(6);
    for (const p of pushes) {
      expect(p, `push 应带 order：${p.slice(0, 70)}`).toMatch(/\border:/);
    }
  });

  test('flush 前按声明序号稳定排序（消除并行完成顺序抖动）', () => {
    expect(SRC).toMatch(/pending\.sort\(\(a, b\) => \(a\.order \?\? 0\) - \(b\.order \?\? 0\)\)/);
  });

  test('缓存命中路径同样记录（旧指纹逻辑不依赖 tool 消息，不得回退）', () => {
    expect(SRC).toMatch(
      /loopRecords\.push\(\{ order: callOrder, name: toolName, args: toolArgs, result: cached\.toolResult \?\? \{ fromCache: true \} \}\);\n\s*return \{ \.\.\.cached, fromCache: true \};/
    );
  });

  test('flush 位置守卫：2 个 planTaskHandled 分支首行即 flush（防移出分支）', () => {
    const count = (SRC.match(/if \(planTaskHandled\) \{\n\s*flushLoopRecords\(\);/g) || []).length;
    expect(count).toBe(2);
  });

  test('锚点邻接守卫：push 紧随 currentMessages.push 块、在 trimMessages 之前（防挪位成死代码）', () => {
    // result: toolResult 形态共 2 处（plan_task 先行响应 + 常规执行）
    const plain = (SRC.match(/\}\);\n\s*loopRecords\.push\(\{ order: callOrder, name: toolName, args: toolArgs, result: toolResult \}\);\n\s*await trimMessages\(\);/g) || []).length;
    expect(plain).toBe(2);
    // 被拒锚点
    expect(SRC).toMatch(/\}\);\n\s*loopRecords\.push\(\{ order: callOrder, name: toolName, args: toolArgs, result: \{ success: false, declined: true \} \}\);\n\s*await trimMessages\(\);/);
    // 错误锚点
    expect(SRC).toMatch(/\}\);\n\s*loopRecords\.push\(\{ order: callOrder, name: toolName, args: toolArgs, result: \{ success: false, error: toolError\.message \|\| 'Tool execution error' \} \}\);\n\s*await trimMessages\(\);/);
    // 跳过锚点（无 trimMessages，用循环变量 j 作序号）
    expect(SRC).toMatch(/loopRecords\.push\(\{ order: j, name: skippedName, args: parseToolCallArgs\(skippedCall\), result: \{ skipped: true \} \}\);/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/unit/react-loop-loop-detector-wiring.unit.test.js`
Expected: FAIL —— 接线断言失败（`from './loop-detector.js'` 不存在等）；i18n describe 仍绿

- [ ] **Step 3: 应用 13 处编辑（E1-E13，同一文件从上到下，全部应用后才可运行测试）**

**E1 — 导入检测器（在 notifier import 之后）**

old:

```js
import { notifyInteractionRequired, clearInteractionNotification } from './notifier.js';
```

new:

```js
import { notifyInteractionRequired, clearInteractionNotification } from './notifier.js';
import { createLoopDetector } from './loop-detector.js';
```

**E2 — 模块级参数解析 helper（在 TOOL_DISPLAY_NAME_KEYS 定义之后）**

old:

```js
const TOOL_DISPLAY_NAME_KEYS = {
  manage_cookies: 'sensitiveTool.manage_cookies',
  clear_data: 'sensitiveTool.clear_data',
  download_file: 'sensitiveTool.download_file',
  manage_tab: 'sensitiveTool.manage_tab',
  agent_file: 'sensitiveTool.agent_file',
  debug_page: 'sensitiveTool.debug_page',
};
```

new:

```js
const TOOL_DISPLAY_NAME_KEYS = {
  manage_cookies: 'sensitiveTool.manage_cookies',
  clear_data: 'sensitiveTool.clear_data',
  download_file: 'sensitiveTool.download_file',
  manage_tab: 'sensitiveTool.manage_tab',
  agent_file: 'sensitiveTool.agent_file',
  debug_page: 'sensitiveTool.debug_page',
};

/**
 * 防御性解析 tool_call 参数（流式模式下 arguments 可能是 string 或已解析 object）
 */
function parseToolCallArgs(toolCall) {
  const rawArgs = toolCall.function?.arguments;
  if (!rawArgs) return {};
  if (typeof rawArgs === 'object') return rawArgs;
  try { return JSON.parse(rawArgs || '{}'); } catch { return {}; }
}
```

**E3 — 替换旧常量块（L463-469）为检测器实例 + 映射 + flush 定义**

old:

```js
  // 死循环检测：入参和返参完全相同才算死循环
  // 仅比较入参会误判（如轮询场景：相同入参但返回值不同属于正常行为），
  // 同时比较入参+返参可精准识别真正的死循环
  const REPEATED_CALL_WARN_THRESHOLD = 5; // 连续相同调用（入参+返参）达到此次数时注入警告
  const REPEATED_CALL_HARD_LIMIT = 8;     // 连续相同调用（入参+返参）达到此次数时强制终止
  let lastCombinedFingerprint = null;     // 上一轮工具调用的组合指纹（入参+返参）
  let repeatedCallCount = 0;              // 连续相同调用的计数
```

new:

```js
  // 多模式循环检测器（独立纯逻辑模块；本文件只在轮末喂入记录并接入提醒/终止）
  // 设计文档：docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md
  const loopDetector = createLoopDetector();
  const loopRecords = []; // 本轮工具调用记录（轮末统一喂入检测器后清空）

  // stop reason → i18n key 映射（检测器保持纯逻辑，用户可见文案在壳侧生成）
  const LOOP_STOP_I18N = {
    repeat: 'loopStoppedRepeat',
    refEnum: 'loopStoppedRefEnum',
    oscillation: 'loopStoppedOscillation',
    failureScope: 'loopStoppedFailureScope',
    noProgressScroll: 'loopStoppedNoProgressScroll',
    budget: 'loopStoppedBudget',
  };

  // 轮末喂入本轮工具调用记录：软提醒合并为一条注入；遇硬停立即抛出
  // （硬停走既有 catch → saveCheckpointNow('error', force) 恢复链路）
  // 注：executionLog 定义在更下方，但调用点全部在工具轮末，闭包引用安全
  const flushLoopRecords = () => {
    if (loopRecords.length === 0) return;
    const pending = loopRecords.splice(0, loopRecords.length);
    const warnings = [];
    for (const rec of pending) {
      const outcome = loopDetector.record(tabId, rec.name, rec.args, rec.result);
      if (outcome.kind === 'stop') {
        const msgKey = LOOP_STOP_I18N[outcome.reason] || 'infiniteLoopDetected';
        logger.warn(`[Background] loop detector stopped run (${outcome.reason}): ${JSON.stringify(outcome.params)}`);
        throw createErrorWithLog(t(`reactLoop.${msgKey}`, outcome.params), executionLog);
      }
      if (outcome.kind === 'nudge' && outcome.warning) {
        warnings.push(outcome.warning);
        logger.debug(`[Background] loop detector nudge: ${outcome.warning}`);
      }
    }
    if (warnings.length > 0) {
      // 合并为一条提醒注入（沿用 role:'user' 约定，避免破坏 filterApiMessages 配对检测）
      currentMessages.push({
        role: 'user',
        content: `[System Notice] ${warnings.join('\n')}\nPlease switch to a different strategy immediately and do not repeat this operation. If the current approach cannot make progress, try alternative methods, or provide a conclusion based on the information already available.`
      });
    }
  };
```

**E4 — 被拒记录锚点**

old:

```js
                currentMessages.push({
                  role: 'tool',
                  content: 'The user declined this operation.',
                  tool_call_id: toolCallId
                });
                await trimMessages();
```

new:

```js
                currentMessages.push({
                  role: 'tool',
                  content: 'The user declined this operation.',
                  tool_call_id: toolCallId
                });
                loopRecords.push({ name: toolName, args: toolArgs, result: { success: false, declined: true } });
                await trimMessages();
```

**E5 — plan_task 先行响应记录锚点**

old:

```js
              currentMessages.push({
                role: 'tool',
                content: planTaskContent,
                tool_call_id: toolCallId
              });
              await trimMessages();
```

new:

```js
              currentMessages.push({
                role: 'tool',
                content: planTaskContent,
                tool_call_id: toolCallId
              });
              loopRecords.push({ name: toolName, args: toolArgs, result: toolResult });
              await trimMessages();
```

**E6 — plan_task 后跳过记录锚点**

old:

```js
                  currentMessages.push({
                    role: 'tool',
                    content: JSON.stringify({ success: false, message: 'Skipped: plan_task has decomposed subtasks; other tool calls in this round will not be executed.' }),
                    tool_call_id: skippedId
                  });
```

new:

```js
                  currentMessages.push({
                    role: 'tool',
                    content: JSON.stringify({ success: false, message: 'Skipped: plan_task has decomposed subtasks; other tool calls in this round will not be executed.' }),
                    tool_call_id: skippedId
                  });
                  loopRecords.push({ name: skippedName, args: parseToolCallArgs(skippedCall), result: { skipped: true } });
```

**E7 — 常规执行记录锚点**

old:

```js
            currentMessages.push({
              role: 'tool',
              content: wrapUntrusted(toolName, toolResultStr, sessionId),
              tool_call_id: toolCallId,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            await trimMessages();
```

new:

```js
            currentMessages.push({
              role: 'tool',
              content: wrapUntrusted(toolName, toolResultStr, sessionId),
              tool_call_id: toolCallId,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            loopRecords.push({ name: toolName, args: toolArgs, result: toolResult });
            await trimMessages();
```

**E8 — 错误路径记录锚点**

old:

```js
            currentMessages.push({
              role: 'tool',
              content: toolErrorContent,
              tool_call_id: toolCallId,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            await trimMessages();
```

new:

```js
            currentMessages.push({
              role: 'tool',
              content: toolErrorContent,
              tool_call_id: toolCallId,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            loopRecords.push({ name: toolName, args: toolArgs, result: { success: false, error: toolError.message || 'Tool execution error' } });
            await trimMessages();
```

**E9 — 两个 planTaskHandled 提前 continue 分支（两处文本完全相同，用 replace_all）**

old:

```js
          if (planTaskHandled) {
            await saveCheckpointNow('plan_task_completed');
            continue;
          }
```

new:

```js
          if (planTaskHandled) {
            flushLoopRecords();
            await saveCheckpointNow('plan_task_completed');
            continue;
          }
```

**E10 — 替换旧指纹块（L1879-1928）为轮末 flush 调用**

old:

```js
        // 死循环检测：入参+返参完全相同才算死循环
        // 从 currentMessages 中提取本轮工具调用的返参（最近的 assistant(tool_calls) 之后的 tool 消息），
        // 与入参组合后构建指纹，与上一轮组合指纹比较。
        // 仅比较入参会误判（如轮询场景：相同入参但返回值变化属于正常行为），
        // 入参和返参完全相同才说明工具调用毫无进展，判定为死循环。
        const _toolResults = [];
        for (let j = currentMessages.length - 1; j >= 0; j--) {
          const msg = currentMessages[j];
          if (msg.role === 'tool') {
            _toolResults.unshift(msg.content); // 按原始顺序插入到头部
          } else if (msg.role === 'assistant' && msg.tool_calls) {
            break; // 到达本轮的 assistant 消息，停止扫描
          }
        }
        const currentCombinedFingerprint = JSON.stringify(
          assistantMessage.tool_calls.map((tc, idx) => ({
            name: tc.function?.name || tc.name,
            args: typeof tc.function?.arguments === 'string'
              ? (() => { try { return JSON.parse(tc.function.arguments); } catch { return tc.function.arguments; } })()
              : tc.function?.arguments || {},
            result: _toolResults[idx] || ''
          }))
        );

        if (currentCombinedFingerprint === lastCombinedFingerprint) {
          repeatedCallCount++;
          const _toolNames = assistantMessage.tool_calls.map(tc => tc.function?.name || tc.name).join(', ');
          logger.warn(`[Background] detected infiniteloop:input and outputidentical (${repeatedCallCount} consecutive repeats): ${_toolNames}`);

          if (repeatedCallCount >= REPEATED_CALL_HARD_LIMIT) {
            throw createErrorWithLog(
              t('reactLoop.infiniteLoopDetected', { count: repeatedCallCount }),
              executionLog
            );
          }

          if (repeatedCallCount >= REPEATED_CALL_WARN_THRESHOLD) {
            // 注入警告消息，提示模型更换策略
            // 使用 role: 'user' 而非 'system'，避免插入中间的 system 消息破坏 filterApiMessages 的 assistant/tool 配对检测
            const warnMsg = {
              role: 'user',
              content: `[System Notice] You have called the exact same tool with the same parameters ${repeatedCallCount} times in a row and received identical results, which indicates the current strategy is making no progress. Please switch to a different strategy or tool immediately and do not repeat this operation. If the current tool cannot obtain the required data, try alternative approaches, or directly provide a conclusion based on the information already available.`
            };
            currentMessages.push(warnMsg);
            logger.debug('[Background] inject infinite loopwarningmessage');
          }
        } else {
          lastCombinedFingerprint = currentCombinedFingerprint;
          repeatedCallCount = 1;
        }
```

（以上为 L1879-1928 完整原文，逐字替换；替换后整个块只剩下方 new 的 3 行）

new:

```js
        // 多模式循环检测：轮末按序喂入本轮全部工具调用记录
        // （软提醒合并为一条注入 / 硬停直接 throw，详见 loop-detector.js）
        flushLoopRecords();
```

**E11-E13 — 同替换块范围内一并完成（与 E10 同一提交，无独立文本）**

E10 替换后，L1931 的 `await saveCheckpointNow('tools_completed');` 之前即完整新逻辑，无需额外编辑。核对清单（替换完成后验证）：
1. 全文件搜索 `lastCombinedFingerprint` / `REPEATED_CALL_WARN_THRESHOLD` / `repeatedCallCount` → 均 0 处
2. 全文件搜索 `flushLoopRecords()` → 3 处（两个 planTaskHandled 分支 + 汇合点）
3. 全文件搜索 `loopRecords.push(` → 5 处
4. 全文件搜索 `[System Notice]` → 1 处

- [ ] **Step 4: 运行接线守卫确认通过**

Run: `npx vitest run test/unit/react-loop-loop-detector-wiring.unit.test.js`
Expected: PASS —— i18n describe + 接线 describe 全绿

- [ ] **Step 5: 运行全量单测（基线不漂移）**

Run: `npm run test:unit`
Expected: PASS —— 基线 1004 项 + Task 1/2/3 新增全部通过，其余不漂移

- [ ] **Step 6: Commit（删除与接线同一 commit）**

```bash
git add src/background/react-loop.js test/unit/react-loop-loop-detector-wiring.unit.test.js
git commit -m "feat: react-loop 接入多模式循环检测器（替换旧指纹块，5 记录锚点 + 轮末统一喂入 + 接线守卫）"
```

**回退说明**：本 commit 是唯一行为性改动；revert 即完整恢复旧指纹逻辑（Task 1/2/3 独立无害）。

---

### Task 5: 全量回归与真实驱动探针

**Files:**
- Create: `test-results-probes/_loop-detector-probe.mjs`（探针；`test-results-probes/` 已在 `.gitignore` L34，**不提交**）
- 本任务不修改 `src/`（纯验证任务）

**Interfaces:**
- Consumes: Task 1 的 `createLoopDetector() → { record(tabId, toolName, args, result) }`——探针**直接 import 真实生产模块**（非桩），所见即扩展内行为
- Produces: 回归证据链（探针 22 项断言 + 全量单测 + e2e + 构建）

- [ ] **Step 1: 新建探针文件**

创建 `test-results-probes/_loop-detector-probe.mjs`（目录已存在）：

```js
// 多模式循环检测器真实驱动探针
// 说明：直接 import 生产模块 src/background/loop-detector.js（非桩），8 场景验证
//   六模式触发精度 + 正常任务形状零误报（R1 铁证）+ 提醒预算。目录已 gitignore，不提交。
// 运行：node test-results-probes/_loop-detector-probe.mjs
import { createLoopDetector } from '../src/background/loop-detector.js';

let pass = 0;
let fail = 0;

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.error(`  ✗ ${name}${detail ? ` —— ${detail}` : ''}`);
  }
}

const ok = tag => ({ success: true, content: `result-${tag}` });
const qArgs = page => ({ filterByText: 'x', page });
const qRes = (page, tag, hasMore, totalPages = 10) => ({
  success: true, content: `tree-${tag}`, page, totalPages, hasMore,
});

// 场景 1：正常多步任务形状零误报（R1 铁证）
{
  console.log('\n[场景 1] 正常多步任务（12 步混合操作）：期望全部 none');
  const d = createLoopDetector();
  const seq = [
    ['query_elements', { filterByText: 'login' }, qRes(1, 'a', true)],
    ['interact_element', { ref: 3, action: 'click' }, ok('clicked')],
    ['query_elements', { filterByText: 'login' }, qRes(1, 'b', true)],
    ['fill_form', { fields: [{ ref: 5, value: 'u' }] }, ok('filled')],
    ['interact_element', { ref: 9, action: 'type', value: 'p' }, ok('typed')],
    ['query_elements', { page: 2 }, qRes(2, 'c', false)],
    ['scroll_to', { target: 'bottom' }, { success: true, moved: true }],
    ['query_elements', { page: 2 }, qRes(2, 'd', false)],
    ['select_dropdown', { ref: 12, option: 'x' }, ok('selected')],
    ['interact_element', { ref: 15, action: 'click' }, ok('submit')],
    ['read_page', {}, { success: true, content: 'page text' }],
    // 【执行时修正】真实契约：back/forward 为 action:'navigate'+direction（见 isNavResetSignal）
    ['manage_tab', { action: 'navigate', direction: 'back' }, ok('navigated')],
  ];
  const kinds = seq.map(([name, args, res]) => d.record(1, name, args, res).kind);
  check('12 步全 none（零提醒零硬停）', kinds.every(k => k === 'none'), JSON.stringify(kinds));
}

// 场景 2：重复模式（①）
{
  console.log('\n[场景 2] 重复模式：第 3 次 nudge → 累计 8 次 stop(repeat)');
  const d = createLoopDetector();
  const out = [];
  for (let i = 0; i < 8; i++) out.push(d.record(1, 'read_page', { url: 'x' }, ok('stable')));
  check('第 1-2 次 none', out[0].kind === 'none' && out[1].kind === 'none');
  check('第 3 次 nudge（Repeated 文案）', out[2].kind === 'nudge' && /Repeated/.test(out[2].warning));
  check('第 4-7 次片段内节流 none', out.slice(3, 7).every(x => x.kind === 'none'));
  check('第 8 次 stop(repeat)', out[7].kind === 'stop' && out[7].reason === 'repeat');
}

// 场景 3：ref 枚举（②）
{
  console.log('\n[场景 3] ref 枚举：合法翻页 1→5 零触发；重读结果不变累计 → stop(refEnum)');
  const d = createLoopDetector();
  const pages = [];
  for (let p = 1; p <= 5; p++) pages.push(d.record(1, 'query_elements', qArgs(p), qRes(p, `p${p}`, p < 5)));
  check('合法顺序翻页 1→5 全部 none', pages.every(x => x.kind === 'none'));

  const rereads = [];
  for (let i = 0; i < 6; i++) rereads.push(d.record(1, 'query_elements', qArgs(1), qRes(1, 'p1', true)));
  check('重读序列出现 nudge（节流提醒生效）', rereads.some(x => x.kind === 'nudge'));
  check('第 6 次重读 stop(refEnum)', rereads[5].kind === 'stop' && rereads[5].reason === 'refEnum');
}

// 场景 4：ABAB 振荡（③）
{
  console.log('\n[场景 4] ABAB 振荡：第 4 条 nudge → 第 8 条 stop(oscillation)');
  const d = createLoopDetector();
  const out = [];
  for (let i = 0; i < 4; i++) {
    out.push(d.record(1, 'read_page', { q: 'same' }, ok(`ra${i}`)));
    out.push(d.record(1, 'browser_info', { q: 'same' }, ok(`rb${i}`)));
  }
  check('前 3 条 none', out.slice(0, 3).every(x => x.kind === 'none'));
  check('第 4 条 nudge（Oscillation 文案）', out[3].kind === 'nudge' && /Oscillation/.test(out[3].warning));
  check('第 8 条 stop(oscillation)', out[7].kind === 'stop' && out[7].reason === 'oscillation');
}

// 场景 5：失败作用域（④）
{
  console.log('\n[场景 5] 失败作用域：同目标失败第 2 次 nudge → 第 3 次 stop(failureScope)');
  const d = createLoopDetector();
  const failRes = () => ({ success: false, error: 'element not found' });
  const out = [0, 1, 2].map(() => d.record(1, 'interact_element', { ref: 9, action: 'click' }, failRes()));
  check('第 1 次失败 none', out[0].kind === 'none');
  check('第 2 次失败 nudge（failure 文案）', out[1].kind === 'nudge' && /failure/i.test(out[1].warning));
  check('第 3 次失败 stop(failureScope)', out[2].kind === 'stop' && out[2].reason === 'failureScope');
}

// 场景 6：导航处理（⑤）
{
  console.log('\n[场景 6] 导航处理：成功 back 重置页面作用域；连续相同导航不自触发');
  // 【执行时修正】导航形态按真实契约 {action:'navigate',direction:'back'}转录；
  // 第二断言改用干净实例：共享实例下 click失败⇄back 第 4 条已命中 ABAB 尾迹（spec §5.3 导航乒乓设计内行为）
  const d = createLoopDetector();
  const navBack = { action: 'navigate', direction: 'back' };
  const failRes = () => ({ success: false, error: 'not found' });
  d.record(1, 'interact_element', { ref: 9, action: 'click' }, failRes());
  d.record(1, 'manage_tab', navBack, ok('nav'));
  const after = d.record(1, 'interact_element', { ref: 9, action: 'click' }, failRes());
  check('导航后失败计数清零（第 2 次失败仍 none）', after.kind === 'none');

  const pingpong = d.record(1, 'manage_tab', navBack, ok('nav-same'));
  check('click⇄back 交替第 4 条触发 oscillation nudge（导航入尾迹乒乓检测）',
    pingpong.kind === 'nudge' && /Oscillation/.test(pingpong.warning));

  const d2 = createLoopDetector();
  const navs = [];
  for (let i = 0; i < 5; i++) navs.push(d2.record(1, 'manage_tab', navBack, ok('nav-same')));
  check('连续 5 次相同 back 成功全 none（导航不入重复窗口）', navs.every(x => x.kind === 'none'));
}

// 场景 7：无进展滚动（⑥）
{
  console.log('\n[场景 7] 无进展滚动：moved:false 第 2 次 nudge → 第 3 次 stop(noProgressScroll)');
  const d = createLoopDetector();
  const stuck = { success: true, moved: false };
  const out = [0, 1, 2].map(() => d.record(1, 'scroll_to', { target: 'top' }, stuck));
  check('第 1 次 none', out[0].kind === 'none');
  check('第 2 次 nudge（scrolling 文案）', out[1].kind === 'nudge' && /scroll/i.test(out[1].warning));
  check('第 3 次 stop(noProgressScroll)', out[2].kind === 'stop' && out[2].reason === 'noProgressScroll');

  const d2 = createLoopDetector();
  d2.record(1, 'scroll_to', { target: 'top' }, stuck);
  d2.record(1, 'scroll_to', { target: 'bottom' }, { success: true, moved: true });
  const reset = d2.record(1, 'scroll_to', { target: 'top' }, stuck);
  check('真实滚动后计数清零（再次 moved:false 仍 none）', reset.kind === 'none');
}

// 场景 8：提醒预算兜底
{
  console.log('\n[场景 8] 提醒预算：实例级累计 8 次 nudge → stop(budget)');
  const d = createLoopDetector();
  const out = [];
  for (let tab = 1; tab <= 8; tab++) {
    for (let i = 0; i < 3; i++) out.push(d.record(tab, 'read_page', { q: 'x' }, ok('stable')));
  }
  const nudges = out.filter(x => x.kind === 'nudge').length;
  const stops = out.filter(x => x.kind === 'stop');
  check('前 7 个 tab 各 1 次 nudge', nudges === 7, `nudges=${nudges}`);
  check('第 8 个 tab 触发 stop(budget)', stops.length === 1 && stops[0].reason === 'budget');
}

console.log(`\n================ 探针结果：${pass} 通过 / ${fail} 失败 ================`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: 运行探针**

Run: `node test-results-probes/_loop-detector-probe.mjs`
Expected: `23 通过 / 0 失败`，进程退出码 0（【执行时修正】原计划 22 项；场景 6 共享实例下 click失败⇄back 第 4 条命中 ABAB 尾迹是 spec §5.3 设计内正确行为，探针第二断言改用干净实例并新增该乒乓钉住断言，22→23）

- [ ] **Step 3: 全量单测（基线不漂移 + 新增全绿）**

Run: `npm run test:unit`
Expected: PASS —— **1057 通过**（【执行上修】原计划预估 1049；三个审查修复轮增加用例后实际为基线 1004 + 53：Task 1 34 / Task 2 5 / Task 3 2 / Task 4 12），0 failed（另：exit=1 为既有 apply-rag 测试文件的模块级 DOM 副作用，与本次改动无因果，Task 5 已钉住）

- [ ] **Step 4: 构建验证**

Run: `npm run build:silent`
Expected: 构建成功（exit 0）；`loop-detector.js` 经 react-loop 正常打包（无未解析导入报错）

- [ ] **Step 5: e2e 回归**

Run: `npm run test:e2e`
Expected: 31 passed 与基线一致（不漂移）

- [ ] **Step 6: 人工验收（用户在真实扩展中执行）**

重载扩展（`chrome://extensions` → 重新加载）后检查：
1. **正常任务无感**：跑一次多步任务（≥10 步页面操作 / 表单填写），无循环提醒、无异常暂停，行为与升级前一致
2. **重复提示（可选构造）**：要求模型对不变化的页面重复执行同一操作 → 约第 3 次后模型自行换策略（软提醒）；持续到累计 8 次 → 任务暂停，恢复框可输入指导后继续（checkpoint 恢复链路）
3. **无进展滚动（可选构造）**：页面已在底部时要求继续「向下滚动」→ 第 2 次软提醒、第 3 次暂停
4. 上述 2/3 中，用户界面仅看到任务暂停文案（zh/en 新 6 条），软提醒对用户不可见

- [ ] **Step 7: 无需提交**

探针不提交（`.gitignore` 已覆盖）；若 Task 6 之前发现需修复的问题：修复后回归 Step 2-5 全绿再继续。

---

### Task 6: CHANGELOG 记录

**Files:**
- Modify: `CHANGELOG.md`（`## 2026-10-10` 块内两处追加）

**Interfaces:**
- Consumes: Task 1-5 的产出（模块 / i18n / 探针 / 回归数字）
- Produces: 发布记录

**日期块约定**：若执行日期仍为 2026-10-10，追加到现有 `## 2026-10-10` 块；若已跨日，在文件顶部新起 `## <执行日期>` 块（含 `### 新增` / `### 工程质量与测试` 两个分节），条目内容相同。

- [ ] **Step 1: `### 新增` 分节末尾追加一条**

old（该片段唯一：与 `### 优化` 紧邻的组合只出现一次）：

```
；无可见 iframe 页面（含 `frames:"none"`）输出与阶段二逐字节一致。

### 优化
```

new：

```
；无可见 iframe 页面（含 `frames:"none"`）输出与阶段二逐字节一致。
- **多模式循环检测升级（六模式 + 软提醒 → 硬停两级处理）**：ReAct 循环新增独立循环检测器（`src/background/loop-detector.js`，纯逻辑无浏览器依赖，每 run 一实例、按 tab 分桶），逐轮巡检工具调用轨迹覆盖六类无进展形态——① 重复调用（工具 + 参数 + 结果稳定哈希；轮询因结果入 key 天然不误报；窗口内 3 次软提醒、累计 8 次硬停；成功导航不入重复窗口）；② 页面元素枚举（`query_elements` 按 scope 记录已读页与结果哈希：合法顺序翻页豁免、重读结果未变或乱序跳页累计，疑似 3 次提醒、6 次 / 乱序 12 次硬停，非 query 调用即整体清零）；③ ABAB 振荡（动作身份不含结果的交替检测，最近 4 条提醒、8 条全交替硬停，含 back / forward 导航乒乓）；④ 失败作用域（6 类变更工具按目标归一——同 ref 的 click / type 视为同目标；失败 2 次提醒、3 次硬停，同目标一次成功即退休，用户拒绝计失败）；⑤ 导航处理（成功 back / forward / reload / wait_navigation 重置页面作用域计数——成功导航即进展证据，仅参与导航乒乓检测）；⑥ 无进展滚动（`scroll_to` 已在边界输出 `moved:false`，同方向 / 坐标 5px 网格 2 次提醒、3 次硬停，真实滚动即清零）；健康调用 2 次迟滞重武装，提醒实例级累计 8 次预算兜底硬停。软提醒合并为单条模型可见英文注入（用户不可见），硬停经既有 checkpoint 链路可带指导恢复（zh/en 硬停文案各 6 条，只增不改）；`scroll_to` 输出仅在「已在边界」时增加 `moved:false` 字段，其余场景逐字节不变；旧「入参+返参组合指纹」检测块被整体替换（无双检测器并行）。

### 优化
```

- [ ] **Step 2: `### 工程质量与测试` 分节末尾追加一条**

old（该片段唯一：`phase3.md` 与下个日期块标题的紧邻组合只出现一次）：

```
docs/superpowers/plans/2026-10-10-page-element-ref-system-phase3.md`。

## 2026-10-09
```

new：

```
docs/superpowers/plans/2026-10-10-page-element-ref-system-phase3.md`。
- 循环检测升级配套：新增 `loop-detector` 单测 33 条（六模式正反例 + 正常多步任务形状零误报 + 配置合并）、`interaction-tools` 滚动静态判定 3 条、`react-loop` 接线守卫 9 条（i18n 6 key 存在性 + 注入集合为单 `[System Notice]` 点 + 旧指纹 0 残留 + flush 3 处 / 记录锚点 ≥5）；全量单测 1049 通过（基线 1004 + 45）；e2e 31 项不漂移；真实模块直驱探针 `test-results-probes/_loop-detector-probe.mjs` 22 项断言通过（正常形状零误报 + 六模式 + 导航重置 + 预算）。设计 spec `docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md` 与实施计划 `docs/superpowers/plans/2026-10-10-loop-detection-upgrade.md`。

## 2026-10-09
```

- [ ] **Step 3: 提交**

```bash
git add CHANGELOG.md
git commit -m "docs: 记录多模式循环检测升级（CHANGELOG）"
```

---

## Spec ↔ Task 覆盖对照

| Spec 章节 | 内容 | 落地任务 |
|---|---|---|
| §4 验证契约 R1-R5 | 零影响 / 不误杀 / 隔离 / 测试背书 / 基线不漂移 | Global Constraints（全任务约束） |
| §5.1 重复检测 | 窗口制 + 累计硬停 + 轮询保护 | Task 1（重复 4 用例）+ 探针场景 2 |
| §5.2 ref 枚举 | scope / 顺序豁免 / 重读累计 / 非法页 | Task 1（refEnum 9 用例）+ 探针场景 3 |
| §5.3 ABAB 振荡 | argsKey / 4-8 尾迹 / 导航乒乓 | Task 1（ABAB 3 用例）+ 探针场景 4 |
| §5.4 失败作用域 | 白名单 / 目标归一 / 退休 / declined | Task 1（失败 5 用例）+ 探针场景 5 |
| §5.5 导航处理 | 重置页面作用域 / 不入重复窗 / 入尾迹 | Task 1（导航 3 用例）+ 探针场景 6 |
| §5.6 无进展滚动 | 静态判定 / 坐标网格 / 清零 | Task 2（实现）+ Task 1（滚动 4 用例）+ 探针场景 7 |
| §5 迟滞与预算 | 2 次重武装 / 8 次预算 | Task 1（全局 5 用例）+ 探针场景 8 |
| §6 集成点 | import / 实例 / 5 锚点 / 3 flush / 删除旧块 | Task 4（E1-E13 + 接线守卫） |
| §7 scroll 输出形态 | moved:false 仅边界态 | Task 2（双形态用例） |
| §9 i18n | 6 key zh/en 只增不改 | Task 3（+ Task 4 消费） |
| §10 测试矩阵 | 单测 / 接线 / 探针 / e2e | Task 1-5 |
| §11 执行顺序 | 落地依赖排序 | Global Constraints（顺序说明） |

**任务依赖链**：Task 1 →（Task 2 / Task 3 可并行）→ Task 4 → Task 5 → Task 6

---

## 执行方式（Execution Handoff）

本计划已就绪，二选一执行：

1. **Subagent-Driven（推荐）**——每个任务派发独立子代理执行，任务间由主代理审查（spec 合规 + 代码质量），迭代快、上下文干净
2. **Inline Execution**——在当前会话直接批量执行（executing-plans），在检查点暂停复审

---

**计划版本**：v1.0（2026-10-10）
**任务数**：6（其中 Task 5 为纯验证）| **预期提交数**：5（Task 1/2/3/4/6 各一；Task 5 无提交）


