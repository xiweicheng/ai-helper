// test/unit/voice-tab-structure.unit.test.js
// 语音输入从「扩展」Tab 拆成独立「语音」Tab 的结构契约。
//
// 背景（用户提问）：「语音输入放在『扩展』Tab 下是不是合适？为什么不单独搞一个 Tab？」
// 结论是拆：语音是「换一种输入方式」，与 MCP / 技能（给 AI 加能力）不是一类；
// 且其自身体量（依赖 + 模型 + 识别语言 + 麦克风权限）已够一个 Tab。
//
// 拆 Tab 这类改动最容易漏的是「线」：DOM 搬了但刷新入口没搬、深链还指向旧 Tab、
// 或者只搬了一半（#asrSection 同时留在两个面板里）。这里把这些线全部钉住：
//   1) 顶部导航 8 个按钮，且「语音」紧跟「扩展」；
//   2) 语音面板里才有 #asrSection / #asrSectionContent / #asrMicBlock；
//   3) 「扩展」面板里不再有任何 ASR 节点；
//   4) index.js：#asr 深链落到 voice；tabRefreshers.voice 已注册；
//   5) refreshToolbox 不再顺手拉 ASR 状态（拆开后各拉各的）；
//   6) 中英文都有 tabVoice 文案。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const OPTIONS_HTML = readFileSync(new URL('../../options.html', import.meta.url), 'utf8');
const INDEX_JS = readFileSync(new URL('../../src/options/index.js', import.meta.url), 'utf8');
const TOOLBOX_CONFIG_JS = readFileSync(
  new URL('../../src/options/toolbox-config.js', import.meta.url), 'utf8',
);
const ZH = readFileSync(new URL('../../src/shared/locales/zh.js', import.meta.url), 'utf8');
const EN = readFileSync(new URL('../../src/shared/locales/en.js', import.meta.url), 'utf8');

/** 截取某个 tab-panel 的内部 HTML（切到下一个 tab-panel 为止） */
function panelSlice(tab) {
  const marker = `<div class="tab-panel" data-tab="${tab}">`;
  const start = OPTIONS_HTML.indexOf(marker);
  expect(start, `缺少 tab-panel[data-tab="${tab}"]`).toBeGreaterThan(-1);
  const next = OPTIONS_HTML.indexOf('<div class="tab-panel" data-tab="', start + marker.length);
  return OPTIONS_HTML.slice(start, next === -1 ? undefined : next);
}

/** 截取某个导出函数的函数体（到下一个 export 为止，够用且不引解析器） */
function functionBody(src, name) {
  const start = src.indexOf(`export async function ${name}(`);
  expect(start, `缺少导出函数 ${name}`).toBeGreaterThan(-1);
  const next = src.indexOf('export ', start + 10);
  return src.slice(start, next === -1 ? undefined : next);
}

describe('语音输入独立成 Tab', () => {
  test('顶部导航 8 个 Tab，「语音」紧跟「扩展」', () => {
    const labels = [...OPTIONS_HTML.matchAll(/class="tab-nav-btn[^"]*"\s+data-tab="([a-z]+)"/g)]
      .map((m) => m[1]);
    expect(labels).toEqual([
      'basic', 'react', 'toolbar', 'agent', 'toolbox', 'voice', 'knowledge', 'memory',
    ]);
  });

  test('语音面板承载 ASR 的全部节点', () => {
    const panel = panelSlice('voice');
    for (const id of [
      'asrSection', 'asrSectionContent', 'asrEnableToggle', 'asrMicBlock',
      // 输入设备：纯扩展侧偏好，独立成块且不随总开关收起（代理离线也要能选）
      // 下拉与「识别语言」同构：.model-selector + readonly input + .model-dropdown
      'asrDeviceSection', 'asrDeviceInput', 'asrDeviceDropdown', 'asrDeviceNote',
    ]) {
      expect(panel, `语音面板缺少 #${id}`).toContain(`id="${id}"`);
    }
  });

  test('输入设备与快捷触发都不在 #asrSection 里面（不跟随总开关收起）', () => {
    const panel = panelSlice('voice');
    const sectionStart = panel.indexOf('id="asrSection"');
    const deviceStart = panel.indexOf('id="asrDeviceSection"');
    // #asrSection 的结束靠后面这些独立块的位置反推：#asrDeviceSection / #asrShortcutSection
    // 必须在同一层级（都在 #asrSection 外面），即出现在它的结束标签之后
    expect(sectionStart).toBeGreaterThan(-1);
    expect(deviceStart).toBeGreaterThan(-1);
    const asrSectionChunk = panel.slice(sectionStart, deviceStart);
    expect(asrSectionChunk, '设备块又被包回了 #asrSection（会被总开关收起）')
      .toContain('id="asrMicBlock"');
    expect(panel.indexOf('id="asrShortcutSection"')).toBeGreaterThan(deviceStart);
  });

  test('「扩展」面板里不再残留任何 ASR 节点', () => {
    const panel = panelSlice('toolbox');
    for (const id of ['asrSection', 'asrEnableToggle', 'asrMicBlock', 'asrDeviceSection']) {
      expect(panel, `「扩展」面板里仍有 #${id}`).not.toContain(`id="${id}"`);
    }
  });

  test('中英文都有「语音」Tab 文案', () => {
    expect(ZH).toMatch(/tabVoice:\s*'语音'/);
    expect(EN).toMatch(/tabVoice:\s*'Voice'/);
    expect(OPTIONS_HTML).toContain('data-i18n="settings.tabVoice"');
  });
});

describe('语音 Tab 的接线', () => {
  test('#asr 深链仍可用，落点改成语音 Tab（侧边栏「去授权」无需改）', () => {
    // validTabs 里要有 voice，否则 switchTab('voice') 之外的直达会失效
    expect(INDEX_JS).toMatch(/validTabs = \[[^\]]*'voice'/);
    const alias = INDEX_JS.slice(INDEX_JS.indexOf("hash === 'asr'"), INDEX_JS.indexOf("hash === 'asr'") + 300);
    expect(alias).toContain("switchTab('voice')");
    expect(alias).not.toContain("switchTab('toolbox')");
  });

  test('tabRefreshers.voice 已注册（否则进 Tab 停在空列表）', () => {
    expect(INDEX_JS).toContain('tabRefreshers.voice = () => { refreshVoicePanel()');
    expect(INDEX_JS).toContain('refreshVoicePanel');
  });

  test('refreshVoicePanel 负责 initAsrEvents + refreshAsrSection', () => {
    const body = functionBody(TOOLBOX_CONFIG_JS, 'refreshVoicePanel');
    expect(body).toContain('initAsrEvents()');
    expect(body).toContain('refreshAsrSection()');
  });

  test('refreshToolbox 不再顺手拉 ASR 状态（拆开后各拉各的）', () => {
    const body = functionBody(TOOLBOX_CONFIG_JS, 'refreshToolbox');
    expect(body).not.toContain('refreshAsrSection');
    expect(body).not.toContain('initAsrEvents');
    expect(body).toContain('loadMcpServers()');
  });
});
