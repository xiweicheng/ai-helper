// 记忆面板的结构契约钉：options.html 的 id 与中英 i18n 键必须齐备。
// 为什么单独钉：行为测试（memory-panel.unit.test.js）用的是自己拷贝的 DOM 夹具，
// 真实页面漏一个 id 它看不见；而中英漏键仓库没有 parity 测试，历史上靠自查。
import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

const html = readFileSync(new URL('../../options.html', import.meta.url), 'utf8');
const zh = readFileSync(new URL('../../src/shared/locales/zh.js', import.meta.url), 'utf8');
const en = readFileSync(new URL('../../src/shared/locales/en.js', import.meta.url), 'utf8');
const optionsJs = readFileSync(new URL('../../src/options/index.js', import.meta.url), 'utf8');

const IDS = ['memoryGate', 'memoryEnabled', 'memoryBaseUrlInput', 'memoryApiKeyInput',
  'memoryApiKeyClearBtn',
  'memoryDimsInput', 'memoryPrefixInput', 'memoryModelInput', 'memoryModelGroup', 'memoryLocalNotice',
  'memoryTestRow', 'memoryTestBtn', 'memoryTestResult',
  'memoryReindexBtn', 'memoryStatus', 'memoryResult'];

test('记忆 Tab 已挂进导航与面板容器', () => {
  expect(html).toContain('class="tab-nav-btn" data-tab="memory" data-i18n="memoryPanel.tabTitle"');
  expect(html).toContain('<div class="tab-panel" data-tab="memory">');
  expect(html).toContain('</div><!-- /tab-memory -->');
});

test('面板需要的 id 逐个存在', () => {
  for (const id of IDS) expect(html, `options.html 缺 id=${id}`).toContain(`id="${id}"`);
});

// 开关标签是状态派生文案，不能挂静态 data-i18n：applyI18n 在语言切换时会把它硬写成「已停用」，
// 而开关本身仍是勾选态（语言切换并不重跑 refreshMemoryPanel）—— 文案与真值各说各话。
test('开关标签不挂 data-i18n，也不留硬编码文案（由面板按开关态唯一渲染）', () => {
  const tag = html.match(/<span[^>]*id="memoryEnabledLabel"[^>]*>([^<]*)<\/span>/);
  expect(tag, '找不到 memoryEnabledLabel 的 span（或它不是空初值）').toBeTruthy();
  expect(tag[0]).not.toContain('data-i18n');
  expect(tag[1].trim(), '标签内不能留硬编码初值').toBe('');
  // 而代理返回的开关态必须有渲染出口
  const panel = readFileSync(new URL('../../src/options/memory-panel.js', import.meta.url), 'utf8');
  expect(panel).toContain('syncEnabledLabel');
});

test('模式单选组两个值齐备（与 agent 白名单逐字一致）', () => {
  expect(html).toContain('name="memoryEmbeddingMode" value="openai-compat"');
  expect(html).toContain('name="memoryEmbeddingMode" value="local"');
});

test('memoryPanel 命名空间中英键完全对齐', () => {
  const keys = (src, label) => {
    const block = src.match(/\n  memoryPanel: \{([\s\S]*?)\n  \},/);
    expect(block, `缺 memoryPanel 命名空间（${label}）`).toBeTruthy();
    return [...block[1].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]).sort();
  };
  const zhKeys = keys(zh, 'zh');
  const enKeys = keys(en, 'en');
  expect(zhKeys.length).toBeGreaterThan(10);
  expect(enKeys).toEqual(zhKeys);
});

// 文案钉：「保存到代理」独立按钮已取消，改为底部全局「保存配置」顺带推代理。
// 所以不再有 saveBtn 键，但必须有：职责说明行（scopeHint）+ 离线跳过的轻提示键，中英齐备。
test('无独立“保存到代理”按钮；有职责说明行与离线跳过提示', () => {
  const block = (src) => src.match(/\n  memoryPanel: \{([\s\S]*?)\n  \},/)[1];
  // 面板里不再出现那颗按钮的 id
  expect(html).not.toContain('id="memorySaveBtn"');
  expect(block(zh)).not.toMatch(/^    saveBtn:/m);
  expect(block(en)).not.toMatch(/^    saveBtn:/m);
  // 说明行：页面上要有承载元素 + 中英都有文案
  expect(html).toContain('data-i18n="memoryPanel.scopeHint"');
  for (const [label, src] of [['zh', zh], ['en', en]]) {
    expect(block(src), `${label} 缺 memoryPanel.scopeHint`).toMatch(/^    scopeHint: '([^']+)'/m);
    expect(block(src), `${label} 缺 memoryPanel.saveSkippedOffline`).toMatch(/^    saveSkippedOffline: '([^']+)'/m);
  }
  // 代理保存入口已在选项页入口注册并挂到全局保存按钮
  expect(optionsJs).toMatch(/tabAgentSavers\.memory = saveMemoryFromGlobalSave/);
  expect(optionsJs).toMatch(/getElementById\('saveBtn'\)\.addEventListener\('click', onGlobalSave\)/);
});

// 状态三态的钉：失败态文案缺键时会退成「memoryPanel.statusFail」这种键名直出
test('状态卡的成功/失败/旧代理三种文案中英齐备', () => {
  const block = (src) => src.match(/\n  memoryPanel: \{([\s\S]*?)\n  \},/)[1];
  for (const [label, src] of [['zh', zh], ['en', en]]) {
    for (const key of ['statusLoading', 'statusFail', 'statusOldAgent']) {
      expect(block(src), `${label} 缺 memoryPanel.${key}`).toMatch(new RegExp(`^    ${key}: '([^']+)'`, 'm'));
    }
  }
});

// 激活路径的钉：hash 直达 / F5 / 侧边栏跳转 / 点击共四条路径都必须走同一个 switchTab
test('真实 tab 全部在 hash 白名单里（否则刷新后掉回「基础」）', () => {
  const block = optionsJs.match(/const validTabs = \[([^\]]*)\]/);
  expect(block, '找不到 validTabs 白名单').toBeTruthy();
  const listed = [...block[1].matchAll(/'(\w+)'/g)].map((m) => m[1]);
  const realTabs = [...html.matchAll(/class="tab-nav-btn[^"]*" data-tab="(\w+)"/g)].map((m) => m[1]);
  expect(realTabs.length).toBeGreaterThanOrEqual(8);
  // 单向子集：白名单里可以有历史死项，但页面上存在的 tab 不能被漏
  expect(realTabs.filter((t) => !listed.includes(t)), `validTabs 漏了：${realTabs.filter((t) => !listed.includes(t))}`).toEqual([]);
});

test('tab 激活时的数据刷新收敛到 switchTab（不只挂在点击上）', () => {
  expect(optionsJs).toMatch(/tabRefreshers\[[^\]]*\]/, 'switchTab 没有派发面板刷新');
  expect(optionsJs).toMatch(/tabRefreshers\.memory = refreshMemoryPanel/, '记忆面板未注册刷新入口');
  // 记忆不得再留自己的点击监听：与 switchTab 双触发会并发发两轮请求
  expect(optionsJs).not.toMatch(/\[data-tab="memory"\]'\)\?\.addEventListener/);
});

// 同类缺口的收编钉：toolbox / knowledge 的数据源也在 agent / storage，
// 曾经只挂在按钮 click 上 —— hash 直达与 F5 两条路径进来会停在空数据。
test('toolbox / knowledge 的刷新也走注册表，且注册早于首次 activateByHash', () => {
  for (const name of ['toolbox', 'knowledge']) {
    expect(optionsJs, `${name} 未注册刷新入口`).toMatch(new RegExp(`tabRefreshers\\.${name} = `));
    expect(optionsJs, `${name} 还留着点击监听，会与 switchTab 双触发`).not.toMatch(
      new RegExp(`\\[data-tab="${name}"\\]'\\)\\?\\.addEventListener`)
    );
  }

  const firstActivate = optionsJs.indexOf('activateByHash();');
  expect(firstActivate, '找不到首次 activateByHash 调用').toBeGreaterThan(-1);
  for (const name of ['memory', 'toolbox', 'knowledge']) {
    const at = optionsJs.indexOf(`tabRefreshers.${name} =`);
    expect(at, `${name} 未注册`).toBeGreaterThan(-1);
    expect(at, `${name} 注册晚于首次 activateByHash：F5 直达该 tab 会漏刷新`).toBeLessThan(firstActivate);
  }
});
