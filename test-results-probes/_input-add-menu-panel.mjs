// 探针：真实浏览器加载构建后的侧边栏，验证加号菜单二级面板（双栏联动）：
// 1) hover 一级项 200ms 防误触后展开右列面板（搜索框 + 列表），has-panel 类同步
// 2) 面板四类渲染：技能（mock GET_SKILL_LIST）/ MCP（seed mcpTools）/ 网页（mock tabs.query）
// 3) 搜索过滤：本地即时过滤与清空恢复
// 4) 选择接线：普通点击技能 = 多选切换且面板保持；Cmd/Ctrl+点击 = 选中并收起
// 5) 面板内鼠标移动不收起；移出菜单 150ms 后收起（仅收面板，菜单保持）
// 6) 窄屏几何：280/430px 双栏展开无横向溢出、面板宽 ≥ 120px
// 7) 回归：菜单外点击全关；重开菜单从单栏开始
// 用法：node test-results-probes/_input-add-menu-panel.mjs
//
// （文件头部 http server + openPanel 的 addInitScript mock 从 _input-bar-tiers.mjs 复制）
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
  // Agent mock 端点：已连接状态 + 工作目录（skills/mcp 可见性依赖 connected）
  if (p === '/api/status/detail') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true, platformName: 'Probe', workdir: '/probe/ws' }));
    return;
  }
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

const MOCK_SKILLS = [
  { name: '技能甲', description: '描述甲', type: 'agent', stepCount: 1, parameters: {}, enabled: true },
  { name: '技能乙', description: '描述乙', type: 'agent', stepCount: 1, parameters: {}, enabled: true },
];

// 打开侧边栏页面并注入 chrome API mock（storage 以 seed 为初始值，回调 + Promise 双形态）
async function openPanel(seed) {
  const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
  const errors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + String(err.stack || err.message).slice(0, 600)));
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
          const msg = args[0] || {};
          const cb = args[args.length - 1];
          const respond = (payload) => {
            if (typeof cb === 'function') { setTimeout(() => cb(payload), 0); return undefined; }
            return Promise.resolve(payload);
          };
          // 技能列表（面板 + 弹窗共用数据源）
          if (msg.type === 'GET_SKILL_LIST') {
            return respond({
              success: true,
              skills: [
                { name: '技能甲', description: '描述甲', type: 'agent', stepCount: 1, parameters: {}, enabled: true },
                { name: '技能乙', description: '描述乙', type: 'agent', stepCount: 1, parameters: {}, enabled: true },
              ],
            });
          }
          return respond({ success: false });
        },
        onMessage: { addListener: noop, removeListener: noop },
        onConnect: { addListener: noop, removeListener: noop },
      },
      i18n: { getUILanguage: () => 'zh-CN' },
      tabs: {
        query: (q, cb) => {
          const tabs = [
            { id: 101, title: '探针页面一', url: 'https://one.example', active: true, favIconUrl: '' },
            { id: 102, title: '探针页面二', url: 'https://two.example', active: false, favIconUrl: '' },
          ];
          if (typeof cb === 'function') { setTimeout(() => cb(tabs), 0); return; }
          return Promise.resolve(tabs);
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

// seed：已连接 Agent（配 token → /api/status/detail mock 判定 connected）+ 技能/MCP 开关与数据
const { page, errors } = await openPanel({
  pairedAgents: [{ id: 'pa_probe1', name: 'Probe Agent', url: `http://127.0.0.1:${port}`, token: 't' }],
  activeAgentId: 'pa_probe1',
  skillsEnabled: true,
  mcpEnabled: true,
  mcpTools: [
    { serverId: 'srv-x', serverName: '服务X' },
    { serverId: 'srv-x', serverName: '服务X' },
    { serverId: 'srv-y', serverName: '服务Y' },
  ],
});

// 工具：确保菜单打开（鼠标移出只收面板，菜单保持；此处兜底）
const ensureMenuOpen = async () => {
  const open = await page.evaluate(() => document.getElementById('inputAddMenu').style.display !== 'none');
  if (!open) { await page.click('#inputAddBtn'); await page.waitForTimeout(250); }
};
const panelVisible = () =>
  page.evaluate(() => document.getElementById('inputAddPanel').getClientRects().length > 0);

// —— 1) hover 提示词项：200ms 防误触 + 双栏展开 ——
await page.click('#inputAddBtn');
await page.waitForTimeout(400); // 等可见性刷新（技能/MCP 依赖 connected + storage）
const menuVis = await page.evaluate(() => ({
  skill: document.getElementById('addMenuSkillBtn').style.display !== 'none',
  mcp: document.getElementById('addMenuMcpBtn').style.display !== 'none',
}));
check('已连接环境：技能/MCP 菜单项可见', menuVis.skill && menuVis.mcp, JSON.stringify(menuVis));

await page.hover('#promptTriggerBtn');
const immediateOpen = await panelVisible();
check('hover 提示词项：立即断言面板不可见（200ms 防误触窗口内）', !immediateOpen);
await page.waitForTimeout(250);
const promptsPanel = await page.evaluate(() => {
  const panel = document.getElementById('inputAddPanel');
  const search = document.getElementById('inputAddPanelSearch');
  const list = document.getElementById('inputAddPanelList');
  return {
    visible: panel.getClientRects().length > 0,
    hasSearch: !!search && search.getClientRects().length > 0,
    listExists: !!list,
    hasPanelClass: document.getElementById('inputAddMenu').classList.contains('has-panel'),
    activeItem: document.querySelector('.input-add-item.panel-active')?.id,
  };
});
check('hover 提示词项 250ms 后：面板展开 + 搜索框可见 + has-panel + 项高亮',
  promptsPanel.visible && promptsPanel.hasSearch && promptsPanel.listExists
  && promptsPanel.hasPanelClass && promptsPanel.activeItem === 'promptTriggerBtn',
  JSON.stringify(promptsPanel));
await page.screenshot({ path: path.join(__dirname, '_input-add-panel-prompts.png') });

// —— 2) hover 技能项：面板切换为技能列表 ——
await page.hover('#addMenuSkillBtn');
await page.waitForTimeout(320);
const skillsPanel = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#inputAddPanelList .skill-list-item')];
  return {
    count: items.length,
    names: items.map((el) => el.dataset.skillName),
    activeItem: document.querySelector('.input-add-item.panel-active')?.id,
  };
});
check('hover 技能项：面板切换为技能列表（2 项含技能甲）',
  skillsPanel.count === 2 && skillsPanel.names.includes('技能甲') && skillsPanel.names.includes('技能乙')
  && skillsPanel.activeItem === 'addMenuSkillBtn',
  JSON.stringify(skillsPanel));
await page.screenshot({ path: path.join(__dirname, '_input-add-panel-skills.png') });

// —— 3) 搜索过滤 ——
await page.fill('#inputAddPanelSearch', '甲');
await page.waitForTimeout(120);
const filteredCount = await page.evaluate(() =>
  document.querySelectorAll('#inputAddPanelList .skill-list-item').length);
check('搜索「甲」→ 列表降为 1 项', filteredCount === 1, String(filteredCount));
await page.screenshot({ path: path.join(__dirname, '_input-add-panel-search.png') });
await page.fill('#inputAddPanelSearch', '');
await page.waitForTimeout(120);
const restoredCount = await page.evaluate(() =>
  document.querySelectorAll('#inputAddPanelList .skill-list-item').length);
check('清空搜索 → 恢复 2 项', restoredCount === 2, String(restoredCount));

// —— 4) 选择接线：普通点击技能 = 多选切换且保持展开 ——
await page.click('#inputAddPanelList .skill-list-item[data-skill-name="技能甲"]');
await page.waitForTimeout(200);
const afterPick = await page.evaluate(() => {
  const indicator = document.getElementById('skillIndicator');
  const chip = indicator.querySelector('.skill-ref-chip');
  const item = document.querySelector('#inputAddPanelList .skill-list-item[data-skill-name="技能甲"]');
  return {
    chipShown: indicator.style.display !== 'none' && !!chip && chip.textContent.includes('技能甲'),
    picked: item ? item.classList.contains('picked') : false,
    menuOpen: document.getElementById('inputAddMenu').style.display !== 'none',
    panelOpen: document.getElementById('inputAddPanel').getClientRects().length > 0,
  };
});
check('点击技能（普通）：chip 出现 + picked 标记 + 菜单与面板保持展开',
  afterPick.chipShown && afterPick.picked && afterPick.menuOpen && afterPick.panelOpen,
  JSON.stringify(afterPick));

// —— 5) 修饰键+点击技能项 → 选中并收起 ——
// 注：macOS 上 Ctrl+左键是系统级右键手势（Chrome 触发 contextmenu 而非 click），
// 用户实际以 Cmd（Meta）达成同一意图；实现为 e.ctrlKey || e.metaKey，两者皆可
const selectModifier = process.platform === 'darwin' ? 'Meta' : 'Control';
await page.click('#inputAddPanelList .skill-list-item[data-skill-name="技能乙"]', { modifiers: [selectModifier] });
await page.waitForTimeout(250);
const afterCtrl = await page.evaluate(() => {
  const indicator = document.getElementById('skillIndicator');
  return {
    secondPicked: [...indicator.querySelectorAll('.skill-ref-chip')].some((c) => c.textContent.includes('技能乙')),
    menuOpen: document.getElementById('inputAddMenu').style.display !== 'none',
    panelOpen: document.getElementById('inputAddPanel').getClientRects().length > 0,
  };
});
check('修饰键+点击技能项：选中技能乙 + 菜单与面板收起',
  afterCtrl.secondPicked && !afterCtrl.menuOpen && !afterCtrl.panelOpen,
  JSON.stringify(afterCtrl));

// —— 6) 网页面板：渲染 + 点击选中并收起 ——
await ensureMenuOpen();
await page.hover('#addMenuPageBtn');
await page.waitForTimeout(320);
const pagesPanel = await page.evaluate(() => {
  const items = [...document.querySelectorAll('#inputAddPanelList .prompt-item')];
  return { count: items.length, texts: items.map((el) => el.textContent) };
});
check('hover 网页项：面板 2 项（探针页面一/二）',
  pagesPanel.count === 2 && pagesPanel.texts.some((t) => t.includes('探针页面一')),
  JSON.stringify(pagesPanel));

await page.click('#inputAddPanelList .prompt-item');
await page.waitForTimeout(250);
const afterPagePick = await page.evaluate(() => ({
  indicator: document.getElementById('pageIndicator').style.display !== 'none',
  indicatorText: document.getElementById('pageIndicatorName').textContent,
  menuOpen: document.getElementById('inputAddMenu').style.display !== 'none',
}));
check('点击网页项：网页指示器出现（探针页面一）+ 菜单收起',
  afterPagePick.indicator && afterPagePick.indicatorText.includes('探针页面一') && !afterPagePick.menuOpen,
  JSON.stringify(afterPagePick));

// —— 7) 面板内移动不收起；移出菜单后收起（仅收面板，菜单保持） ——
await ensureMenuOpen();
await page.hover('#addMenuSkillBtn');
await page.waitForTimeout(320);
const panelBox = await page.evaluate(() => {
  const r = document.getElementById('inputAddPanel').getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.move(panelBox.x, panelBox.y);
await page.waitForTimeout(350);
check('鼠标在面板内移动：面板保持展开（不触发收起）', await panelVisible());

await page.mouse.move(8, 8);
await page.waitForTimeout(400);
const afterLeave = await page.evaluate(() => ({
  panelOpen: document.getElementById('inputAddPanel').getClientRects().length > 0,
  menuOpen: document.getElementById('inputAddMenu').style.display !== 'none',
  hasPanelClass: document.getElementById('inputAddMenu').classList.contains('has-panel'),
}));
check('鼠标移出菜单 400ms 后：面板收起且菜单保持打开（单栏）',
  !afterLeave.panelOpen && afterLeave.menuOpen && !afterLeave.hasPanelClass,
  JSON.stringify(afterLeave));

// —— 8) 窄屏几何：双栏展开无横向溢出 + 面板宽 ≥ 120px ——
for (const w of [430, 280]) {
  await page.setViewportSize({ width: w, height: 900 });
  await page.waitForTimeout(150);
  await ensureMenuOpen();
  await page.hover('#addMenuSkillBtn');
  await page.waitForTimeout(320);
  const geo = await page.evaluate(() => {
    const menu = document.getElementById('inputAddMenu');
    const panel = document.getElementById('inputAddPanel');
    const mr = menu.getBoundingClientRect();
    const pr = panel.getBoundingClientRect();
    return {
      menuRight: +mr.right.toFixed(1),
      menuLeft: +mr.left.toFixed(1),
      viewport: window.innerWidth,
      panelW: +pr.width.toFixed(1),
      panelVisible: panel.getClientRects().length > 0,
    };
  });
  check(`w=${w} 双栏展开：菜单在视口内 且 面板宽 ≥ 120px`,
    geo.panelVisible && geo.menuRight <= geo.viewport + 1 && geo.menuLeft >= -1 && geo.panelW >= 120,
    JSON.stringify(geo));
  if (w === 280) await page.screenshot({ path: path.join(__dirname, '_input-add-panel-280.png') });
  await page.mouse.move(8, 8);
  await page.waitForTimeout(300);
}

// —— 9) 回归：外部点击全关；重开菜单从单栏开始 ——
await page.click('body', { position: { x: 8, y: 8 } });
await page.waitForTimeout(200);
const allClosed = await page.evaluate(() => ({
  menu: document.getElementById('inputAddMenu').style.display,
  panel: document.getElementById('inputAddPanel').style.display,
}));
check('回归：菜单外点击 → 菜单与面板均关闭', allClosed.menu === 'none' && allClosed.panel === 'none', JSON.stringify(allClosed));

await page.click('#inputAddBtn');
await page.waitForTimeout(250);
const singleCol = await page.evaluate(() => ({
  panel: document.getElementById('inputAddPanel').style.display,
  hasPanel: document.getElementById('inputAddMenu').classList.contains('has-panel'),
}));
check('回归：重新打开菜单 → 单栏（面板不可见）', singleCol.panel === 'none' && !singleCol.hasPanel, JSON.stringify(singleCol));

// —— 页面错误 ——
check('页面无 JS 错误', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} 通过`);
if (failed.length) process.exitCode = 1;
