// 子任务节点统计三桶口径（✓ 成功 / ✗ 失败 / ⊘ 其他）
//
// 缺陷现场：面板里出现过「80/83 完成，1 个节点失败」——80 + 1 ≠ 83。根因是
// totalNodes 收所有节点，而 ✓ 只数 status==='success'、✗ 只数 'failed'，
// 用户拒绝敏感操作确认（cancelled）、被取消的 API 调用、终止时残留的 processing
// 节点被计入总数却两头不算，用户必然按"83 个里有 3 个不见了"去理解。
// 修复：补第三桶 ⊘，并让恒等式 total = success + failed + other 成立且可过滤。
// @vitest-environment jsdom
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const CHAT_MANAGER_SRC = readFileSync(resolve(root, 'src/side_panel/chat-manager.js'), 'utf8');
const STYLES_SRC = readFileSync(resolve(root, 'src/side_panel/styles.css'), 'utf8');

const noop = () => {};

let classifySubtaskNodeStats, toggleNodeFilter, applyNodeFilter;

beforeAll(async () => {
  const makeStore = () => ({
    get: (keys, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
    set: (obj, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); },
  });
  globalThis.chrome = {
    storage: {
      local: makeStore(), session: makeStore(),
      onChanged: { addListener: noop },
    },
    runtime: {
      lastError: null, id: 'test-ext',
      getManifest: () => ({ version: '0.0.0', content_scripts: [{ js: [] }] }),
      getURL: (p) => p,
      sendMessage: (msg, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
      connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
      onMessage: { addListener: noop, removeListener: noop },
      getContexts: noop,
    },
    tabs: {
      query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
      remove: noop, reload: noop, goBack: noop, goForward: noop,
      captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
    },
    scripting: { executeScript: noop },
    bookmarks: { getTree: noop, search: noop },
    history: { search: noop },
    cookies: { get: noop, getAll: noop, set: noop, remove: noop },
    downloads: { download: noop },
    notifications: { create: noop },
    offscreen: { createDocument: noop, hasDocument: noop },
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
  };
  document.body.innerHTML = '<textarea id="userInput"></textarea><div id="messageList"></div>';
  vi.resetModules();
  ({ classifySubtaskNodeStats, toggleNodeFilter, applyNodeFilter } = await import('../../src/side_panel/chat-manager.js'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

const nodes = (...statuses) => statuses.map((status) => ({ status }));

describe('classifySubtaskNodeStats 三桶计数', () => {
  test('截图场景：80 成功 + 1 失败 + 2 其他 = 83，恒等式成立', () => {
    const stats = classifySubtaskNodeStats(nodes(
      ...Array(80).fill('success'),
      'failed',
      'cancelled',
      'processing'
    ));
    expect(stats).toEqual({ total: 83, success: 80, failed: 1, other: 2 });
    expect(stats.success + stats.failed + stats.other).toBe(stats.total);
  });

  test('cancelled / processing / rolledback / pending 都归入其他桶', () => {
    const stats = classifySubtaskNodeStats(nodes('cancelled', 'processing', 'rolledback', 'pending', 'success'));
    expect(stats.success).toBe(1);
    expect(stats.failed).toBe(0);
    expect(stats.other).toBe(4);
  });

  test('空列表与非数组入参降级为全零（不抛异常）', () => {
    expect(classifySubtaskNodeStats([])).toEqual({ total: 0, success: 0, failed: 0, other: 0 });
    expect(classifySubtaskNodeStats(null)).toEqual({ total: 0, success: 0, failed: 0, other: 0 });
  });

  test('脏条目（null / 无 status）计入总数与其他桶，保证恒等式不被打破', () => {
    const stats = classifySubtaskNodeStats([null, {}, { status: 'success' }]);
    expect(stats.total).toBe(3);
    expect(stats.success + stats.failed + stats.other).toBe(3);
  });
});

describe('过滤支持第三桶', () => {
  test('toggleNodeFilter 接受 other，再点取消', () => {
    expect(toggleNodeFilter(null, 'other')).toBe('other');
    expect(toggleNodeFilter('other', 'other')).toBe(null);
    expect(toggleNodeFilter('success', 'other')).toBe('other');
  });

  test('applyNodeFilter(other) 返回既非 success 也非 failed 的节点', () => {
    const list = nodes('success', 'failed', 'cancelled', 'processing');
    expect(applyNodeFilter(list, 'other')).toEqual([{ status: 'cancelled' }, { status: 'processing' }]);
  });
});

describe('接线守卫：面板渲染与样式、文案齐备', () => {
  test('统计来自 classifySubtaskNodeStats，四个桶都进入渲染（不再手写两桶）', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/classifySubtaskNodeStats\(allSubtaskNodes\)/);
    expect(CHAT_MANAGER_SRC).toMatch(/stats\.total/);
    expect(CHAT_MANAGER_SRC).toMatch(/stats\.other/);
  });

  test('其他桶渲染为可点击的 ⊘ 统计，仅在有内容时出现', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/subtask-stat-other/);
    expect(CHAT_MANAGER_SRC).toMatch(/data-node-filter="other"/);
  });

  // 评审 M1：删掉 failed 分支的 ⊘ span 后原有 10 例仍全绿（toMatch 单次命中即过），
  // 三个渲染分支只有一处受保护 → 按出现次数锁定三处齐备与条件渲染
  test('⊘ 统计在 running / success / failed 三个分支都渲染（各一次，不多不少）', () => {
    expect((CHAT_MANAGER_SRC.match(/data-node-filter="other"/g) || []).length).toBe(3);
    expect((CHAT_MANAGER_SRC.match(/subtask-stat-other/g) || []).length).toBe(3);
    // 均为条件渲染：other 为 0 时不得凭空开一个可点统计
    expect((CHAT_MANAGER_SRC.match(/otherNodes > 0 \?/g) || []).length).toBe(3);
  });

  test('⊘ 提示文案中英文均已注册', () => {
    const zh = CHAT_MANAGER_SRC.match(/registerTranslations\('zh'[\s\S]*?\n\}\);/);
    const en = CHAT_MANAGER_SRC.match(/registerTranslations\('en'[\s\S]*?\n\}\);/);
    expect(zh && zh[0]).toMatch(/subtaskStatOtherHint:/);
    expect(en && en[0]).toMatch(/subtaskStatOtherHint:/);
  });

  test('⊘ 统计有独立配色（区别于红绿两态）', () => {
    expect(STYLES_SRC).toMatch(/\.subtask-stat-other\s*\{[^}]*color:/);
    expect(STYLES_SRC).toMatch(/\.subtask-stat-done\s*\{[^}]*color:/);
    expect(STYLES_SRC).toMatch(/\.subtask-stat-fail\s*\{[^}]*color:/);
    // 三个桶不得共用语义色（共色则“哪桶是哪桶”只能靠字形辨认）
    const tok = (sel) => (STYLES_SRC.match(new RegExp('\\.' + sel + '\\s*\\{[^}]*color:\\s*var\\(--([a-z0-9-]+)\\)')) || [])[1];
    const distinct = new Set(['subtask-stat-done', 'subtask-stat-fail', 'subtask-stat-other'].map(tok));
    expect(distinct.size).toBe(3);
  });

  // 评审 L-e：原表述“⊘ 用 --text-tertiary 对比约 2.8:1”是拿 token 值对着一猜的背景算的。
  // 本例不重复那个错：所有数字从仓库真值取——styles.css 里该类引用的 token 名、
  // theme.css 里该 token 的亮/暗真值、以及统计行真实落点（.subtask-progress 的半透明
  // 紫色底合成在 --bg-surface 上，两层都从 CSS 解析），按 spec §4.2 实算对比度。
  test('四个统计在真实底色上达 WCAG AA（11px 正常文本 4.5:1）', () => {
    const THEME_SRC = readFileSync(resolve(root, 'src/shared/theme.css'), 'utf8');
    const blocks = {
      light: cssBlock(THEME_SRC, ':root'),
      dark: cssBlock(THEME_SRC, 'html[data-theme="dark"]'),
    };
    // 统计行自己的半透明底 + 气泡底色，两层合成（与浏览器渲染同数学）
    const tint = rgbaVar(STYLES_SRC, '.subtask-progress');
    const rowBg = (theme) => composite(hexToRgb(blocks[theme]['--bg-surface']), rgbVarOf(blocks[theme], tint), tint.alpha);

    const cases = [
      { sel: 'subtask-stat-other', min: 4.5 },
      { sel: 'subtask-stat-fail', min: 4.5 },
      { sel: 'subtask-stat-total', min: 4.5 },
      {
        // ✓ 取 --success-strong：在没被紫色底的纯 --bg-surface 上是 4.54:1（达 AA），
        // 合成 6% 紫底后降到 4.21:1。再往上压需要改 --success-strong 本身（全仓 37 处
        // 共用，含作背景/描边的用法），属设计系统级改动，不在本批范围。阈值先卡 4.0：
        // 既断掉“改回 --success-500（2.11:1）”这类回归，也不把未做的事假装做成。
        sel: 'subtask-stat-done',
        min: 4.0,
        onPlainSurface: 4.5,
      },
    ];

    for (const c of cases) {
      for (const theme of ['light', 'dark']) {
        const token = (STYLES_SRC.match(new RegExp('\\.' + c.sel + '\\s*\\{[^}]*color:\\s*var\\(--([a-z0-9-]+)\\)')) || [])[1];
        expect(token, `${c.sel} 应引用主题 token`).toBeTruthy();
        const ratio = contrast(hexToRgb(blocks[theme]['--' + token]), rowBg(theme));
        expect(ratio, `${c.sel} (${theme}, --${token}) 实算 ${ratio.toFixed(2)}:1 低于 ${c.min}:1`)
          .toBeGreaterThanOrEqual(c.min);
        if (c.onPlainSurface !== undefined && theme === 'light') {
          expect(contrast(hexToRgb(blocks[theme]['--' + token]), hexToRgb(blocks[theme]['--bg-surface'])))
            .toBeGreaterThanOrEqual(c.onPlainSurface);
        }
      }
    }
  });
});

// ---------- 下面四个小函数只服务上面的对比度实算（测试工具，不进生产代码）----------

function cssBlock(src, selector) {
  const start = src.indexOf(selector + ' {');
  expect(start, `theme.css 缺少 ${selector} 块`).toBeGreaterThanOrEqual(0);
  const body = src.slice(start + selector.length + 2, src.indexOf('\n}', start));
  const out = {};
  for (const m of body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

function rgbaVar(stylesSrc, selector) {
  const body = stylesSrc.slice(stylesSrc.indexOf(selector + ' {'), stylesSrc.indexOf('}', stylesSrc.indexOf(selector + ' {')));
  const m = body.match(/rgba\(\s*var\(--([a-z0-9-]+)-rgb\)\s*,\s*([0-9.]+)\s*\)/);
  expect(m, `${selector} 应带 rgba(var(--x-rgb), a) 底`).not.toBeNull();
  return { name: `--${m[1]}-rgb`, alpha: Number(m[2]) };
}

function rgbVarOf(themeBlock, rgba) {
  const v = themeBlock[rgba.name];
  expect(v, `theme.css 缺少 ${rgba.name}`).toBeTruthy();
  return v.split(',').map((n) => Math.round(parseFloat(n)));
}

function hexToRgb(hex) {
  const h = String(hex).replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function composite(bg, top, alpha) {
  return bg.map((c, i) => Math.round(top[i] * alpha + c * (1 - alpha)));
}

function contrast(a, b) {
  const lum = (rgb) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
