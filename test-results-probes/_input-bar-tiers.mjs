// 探针：真实浏览器加载构建后的侧边栏，验证输入区一体化容器改造：
// 1) 宽度扫描（700→280）：底行四档降级按顺序触发、无水平溢出、信息带位置不受影响
// 2) "+" 菜单：开合、外部点击关闭、菜单项点击关闭（capture 机制，模拟 stopPropagation）
// 3) 组合键（尽力项）：Ctrl+单击提示词 → 网页选择器
// 用法：node test-results-probes/_input-bar-tiers.mjs
//
// （文件头部 http server + openPanel 的 addInitScript mock 从 _tools-popup-footer.mjs 复制）
import { chromium } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/side_panel.html';
  const file = path.join(DIST, p);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();

// 打开侧边栏页面并注入 chrome API mock（storage 以 seed 为初始值，回调 + Promise 双形态）
async function openPanel(seed) {
  const page = await browser.newPage({ viewport: { width: 380, height: 900 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message.slice(0, 200)));
  await page.addInitScript((seedData) => {
    const noop = () => {};
    const store = { ...seedData };
    const makeArea = () => ({
      onChanged: { addListener: noop, removeListener: noop },
      get(keys, cb) {
        let result = {};
        const ks = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
        for (const k of ks) {
          if (Object.prototype.hasOwnProperty.call(store, k)) result[k] = store[k];
        }
        if (keys && typeof keys === 'object' && !Array.isArray(keys)) result = { ...keys, ...result };
        if (cb) { setTimeout(() => cb(result), 0); return; }
        return Promise.resolve(result);
      },
      set(items, cb) {
        Object.assign(store, items);
        if (cb) { setTimeout(() => cb(), 0); return; }
        return Promise.resolve();
      },
      remove(keys, cb) {
        const ks = Array.isArray(keys) ? keys : [keys];
        for (const k of ks) delete store[k];
        if (cb) { setTimeout(() => cb(), 0); return; }
        return Promise.resolve();
      },
    });
    globalThis.chrome = {
      storage: {
        local: makeArea(),
        sync: makeArea(),
        session: makeArea(),
        onChanged: { addListener: noop, removeListener: noop },
      },
      runtime: {
        lastError: null,
        id: 'probe',
        getManifest: () => ({ version: '0.0.0' }),
        getURL: (p) => p,
        sendMessage: (...args) => {
          const cb = args[args.length - 1];
          if (typeof cb === 'function') { setTimeout(() => cb({ success: false }), 0); return; }
          return Promise.resolve({ success: false });
        },
        onMessage: { addListener: noop, removeListener: noop },
        onConnect: { addListener: noop, removeListener: noop },
      },
      i18n: { getUILanguage: () => 'zh-CN' },
      tabs: {
        query: (q, cb) => {
          if (typeof cb === 'function') { setTimeout(() => cb([]), 0); return; }
          return Promise.resolve([]);
        },
        sendMessage: (id, msg, cb) => {
          if (typeof cb === 'function') { setTimeout(() => cb(undefined), 0); return; }
          return Promise.resolve();
        },
        update: () => Promise.resolve(),
        create: () => Promise.resolve({}),
        onActivated: { addListener: noop, removeListener: noop },
        onUpdated: { addListener: noop, removeListener: noop },
      },
      windows: {
        getCurrent: () => Promise.resolve({ id: 1 }),
      },
    };
  }, seed);
  await page.goto(`http://127.0.0.1:${port}/side_panel.html`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  return { page, errors };
}

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

// seed 预置划词开关为开启，供 ④ 级蓝点断言使用
const { page, errors } = await openPanel({ enableSelectionQuery: true });

// —— 1) 宽度扫描：四档降级 + 无溢出 + 信息带位置 ——
const WIDTHS = [700, 520, 450, 430, 400, 380, 330, 300, 280];
const snapshot = () => page.evaluate(() => {
  const container = document.querySelector('.input-container');
  const bar = document.querySelector('.input-bottom-row');
  const ring = document.querySelector('#contextUsageIndicator');
  const modelTag = document.querySelector('#currentModelTag');
  const disclaimer = document.querySelector('.input-disclaimer');
  return {
    cls: ['temp-collapsed', 'agent-collapsed', 'switches-icon', 'selection-in-menu']
      .filter((c) => container.classList.contains(c)),
    overflow: bar.scrollWidth - bar.clientWidth,
    ringVisible: !!ring && ring.getClientRects().length > 0,
    modelVisible: !!modelTag && modelTag.getClientRects().length > 0,
    disclaimerVisible: !!disclaimer && disclaimer.getClientRects().length > 0,
    selectionInMenu: document.getElementById('inputAddMenuSwitches')?.querySelector('#selectionToggleGroup') !== null,
  };
});

const snaps = [];
for (const w of WIDTHS) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(120);
  const s = await snapshot();
  snaps.push({ w, ...s });
  check(`w=${w} 底行无水平溢出`, s.overflow <= 1, `溢出 ${s.overflow}px`);
  check(`w=${w} 信息带元素可见`, s.ringVisible && s.modelVisible && s.disclaimerVisible,
    `ring=${s.ringVisible} model=${s.modelVisible} disclaimer=${s.disclaimerVisible}`);
  await page.screenshot({ path: path.join(__dirname, `_input-bar-${w}.png`) });
  console.log(`   w=${w} 降级类: [${s.cls.join(', ')}] selectionInMenu=${s.selectionInMenu}`);
}

// 降级语义断言（不依赖精确档位边界——mockup 预估偏差 ±40px）：
// a) 类集合必须是合法前缀链（①→②→③→④ 顺序固定）；
// b) 扫描范围内四档均被触发过；c) 宽屏不降级；d) 窄屏降到底（④）。
// 注：@media(max-width:420px) 隐藏助手名/温度数字形成“免费降级”，
// 430→400 区间档位回退为无类属正确行为，故不断言表面单调。
const at = async (w) => {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(120);
  return snapshot();
};
const CHAIN = ['temp-collapsed', 'agent-collapsed', 'switches-icon', 'selection-in-menu'];
const isChainPrefix = (cls) => cls.every((c, i) => c === CHAIN[i]);
const badChain = snaps.filter((s) => !isChainPrefix(s.cls));
check('降级链为合法前缀（①→②→③→④ 顺序固定）', badChain.length === 0,
  badChain.map((s) => `w=${s.w}:[${s.cls.join(',')}]`).join(' | '));
const missing = CHAIN.filter((c) => !snaps.some((s) => s.cls.includes(c)));
check('扫描覆盖全部四档（每档至少触发一次）', missing.length === 0, missing.join(',') || '四档均覆盖');
// 下限为 280px（设计下限）：Chrome Side Panel 实际最小宽度约 360px，更窄档位
// 仅为压力测试。实测 250px 时 4 级降级后仍溢出 23px（低于设计下限，超出本计划
// 范围；如需支持需追加第 5 级降级，列后续观察项）。
const s520 = await at(520);
const s280 = await at(280);
check('520px 完整形态（无降级类）', s520.cls.length === 0, s520.cls.join(','));
check('280px 触发 ④（划词收进菜单）', s280.cls.includes('selection-in-menu') && s280.selectionInMenu, s280.cls.join(','));

// ④ 级 + 划词开启（seed）→ "+" 蓝点显示
const dotOn = await page.evaluate(() =>
  document.getElementById('inputAddBtn').classList.contains('has-active-switch'));
check('280px "+" 蓝点显示（菜单内开关已激活）', dotOn);

// —— 2) "+" 菜单交互 ——
await page.setViewportSize({ width: 430, height: 900 });
await page.waitForTimeout(120);
await page.click('#inputAddBtn');
check('点击 "+" 菜单打开', await page.evaluate(() => document.getElementById('inputAddMenu').style.display !== 'none'));
await page.screenshot({ path: path.join(__dirname, '_input-bar-menu-open.png') });
await page.click('body', { position: { x: 10, y: 10 } });
check('点击外部菜单关闭', await page.evaluate(() => document.getElementById('inputAddMenu').style.display === 'none'));

// 菜单项点击关闭（真实菜单项业务 handler 会 stopPropagation，验证 capture 关闭仍生效）
await page.click('#inputAddBtn');
await page.evaluate(() => {
  // 给菜单项注入一个 stopPropagation 监听，模拟真实按钮行为
  document.getElementById('promptTriggerBtn').addEventListener('click', (e) => e.stopPropagation());
});
await page.click('#promptTriggerBtn');
check('点击菜单项后菜单关闭（capture）', await page.evaluate(() => document.getElementById('inputAddMenu').style.display === 'none'));
await page.keyboard.press('Escape');

// —— 3) 组合键（尽力项）：Ctrl+单击提示词 → 网页选择器 ——
try {
  await page.click('#inputAddBtn');
  await page.evaluate(() => {
    const btn = document.getElementById('promptTriggerBtn');
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
  });
  await page.waitForTimeout(300);
  const agentAtVisible = await page.evaluate(() => {
    const sel = document.getElementById('agentAtSelector');
    return !!sel && sel.style.display !== 'none';
  });
  check('Ctrl+单击提示词 → 网页选择器（尽力项）', agentAtVisible,
    agentAtVisible ? '' : '未打开（可能依赖运行时数据，需人工复核）');
} catch (e) {
  check('Ctrl+单击提示词 → 网页选择器（尽力项）', false, `异常：${e.message}`);
}

// —— 页面错误 ——
check('页面无 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exitCode = 1;
