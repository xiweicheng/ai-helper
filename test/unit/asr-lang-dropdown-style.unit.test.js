// test/unit/asr-lang-dropdown-style.unit.test.js
// 「识别语言」下拉被区块裁剪的 CSS 守卫。
//
// 背景（真实 bug）：.toolbox-section-content 为了折叠动画带 overflow: hidden，
// 而语言下拉是绝对定位的 .model-dropdown —— 展开态下会被切在区块底边，用户只能看到第一项
// （截图里像「下拉框高度被压扁」）。修法是给展开态的语音输入内容区单独放开裁剪。
// 这类问题纯 CSS、跑单测看不见，所以用「规则存在性」把契约钉住：
//   1) 基础折叠样式必须仍然是 hidden（否则 max-height 折叠会漏内容）；
//   2) 展开态必须有 overflow: visible / max-height: none 的覆盖；
//   3) 6 个语种要能一屏看完（max-height 大于默认 .model-dropdown 的 240px）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const STYLES = readFileSync(
  new URL('../../src/options/styles.css', import.meta.url), 'utf8',
);
const OPTIONS_HTML = readFileSync(
  new URL('../../options.html', import.meta.url), 'utf8',
);
const TOOLBOX_ASR_JS = readFileSync(
  new URL('../../src/options/toolbox-asr.js', import.meta.url), 'utf8',
);

/** 取某个选择器的声明块（到第一个 '}' 为止） */
function block(selector) {
  const start = STYLES.indexOf(selector);
  expect(start, `缺少规则 ${selector}`).toBeGreaterThan(-1);
  return STYLES.slice(start, STYLES.indexOf('}', start));
}

describe('语音输入区块的裁剪规则', () => {
  test('基础折叠样式仍然用 overflow: hidden（折叠动画依赖它）', () => {
    const base = block('.toolbox-section-content {');
    expect(base).toContain('overflow: hidden');
    expect(base).toContain('max-height: 0');
  });

  test('展开态放开裁剪，否则绝对定位的语言下拉会被切在区块底边', () => {
    const expanded = block('#asrSection:not(.disabled-section) #asrSectionContent {');
    expect(expanded).toContain('overflow: visible');
    expect(expanded).toContain('max-height: none');
  });

  test('折叠态不放开（覆盖规则带 :not(.disabled-section) 守卫）', () => {
    expect(STYLES).toContain('#asrSection:not(.disabled-section) #asrSectionContent');
    expect(STYLES).not.toMatch(/#asrSection\s+#asrSectionContent\s*\{[^}]*overflow:\s*visible/);
  });

  test('语种下拉高度放宽到能一屏看完 6 项', () => {
    const menu = block('.asr-lang-menu.model-dropdown {');
    const maxHeight = Number((menu.match(/max-height:\s*(\d+)px/) || [])[1]);
    expect(maxHeight).toBeGreaterThan(240);
    expect(maxHeight).toBeGreaterThanOrEqual(6 * 41); // 6 个语种 × 单项约 41px
  });

  test('下拉必须在语言触发器所在容器内（.model-selector 提供定位上下文）', () => {
    expect(OPTIONS_HTML).toContain('asrSectionContent');
    expect(STYLES).toMatch(/\.model-selector\s*\{[^}]*position:\s*relative/);
  });
});

describe('识别语言下拉与「界面语言」下拉同构', () => {
  // 背景：识别语言一开始自己写了一套 <button> 触发器 + .asr-lang-trigger 样式，
  // 和「界面语言」那颗（.model-selector + readonly input）并排时就显出差异
  // （高度/字体/focus ring 都不一样）。改成完全复用基类后，用规则存在性钉住，防止又长出一套。

  test('触发器用 .model-selector + readonly input（与界面语言一致）', () => {
    expect(TOOLBOX_ASR_JS).toContain('class="model-selector asr-lang-field"');
    expect(TOOLBOX_ASR_JS).toMatch(/<input type="text" id="asrLangInput" readonly/);
  });

  test('不再存在自定义触发器（样式分叉的入口）', () => {
    expect(TOOLBOX_ASR_JS).not.toContain('asr-lang-trigger');
    expect(STYLES).not.toContain('.asr-lang-trigger');
  });

  test('选项结构不带额外包裹层（与界面语言同为纯文本 .model-option）', () => {
    expect(TOOLBOX_ASR_JS).not.toContain('model-option-left');
    expect(STYLES).not.toContain('.asr-lang-menu .model-option');
  });

  test('触发器宽度撑满一行（不再被 max-width 卡成半截）', () => {
    // 下拉正下方就是占满整行的提示文字，下拉只到 320px 会显得「半截」；
    // 宽度由父容器决定，这里只钉「显式 100% 且没有残留的窄宽度上限」
    const field = block('.asr-lang-field {');
    expect(field).toContain('width: 100%');
    expect(field).not.toContain('max-width');
  });
});

describe('输入设备下拉与识别语言同构', () => {
  // 背景：「输入设备」一开始是原生 <select>，和旁边的「识别语言」（.model-selector +
  // readonly input）并排时，圆角 / 箭头 / 高度 / focus ring 全不一样。
  // 改成复用同一套基类后，用规则存在性钉住，防止又退回去或另起一套。

  test('触发器用 .model-selector + readonly input（与识别语言一致）', () => {
    expect(OPTIONS_HTML).toContain('class="model-selector asr-lang-field" id="asrDeviceField"');
    expect(OPTIONS_HTML).toMatch(/<input type="text" id="asrDeviceInput" readonly/);
  });

  test('浮层列表复用 .model-dropdown，且不再有原生 select', () => {
    expect(OPTIONS_HTML).toContain('class="model-dropdown asr-lang-menu" id="asrDeviceDropdown"');
    expect(OPTIONS_HTML).not.toContain('id="asrDeviceSelect"');
    // 原生 select 的专属样式也必须一并消失（留着就说明还有第二套外观）
    expect(STYLES).not.toContain('.asr-device-row');
  });

  test('两颗下拉共用同一套交互绑定（展开 / 收起 / 点外面收起不会分叉）', () => {
    expect(TOOLBOX_ASR_JS).toMatch(/bindDropdownSelect\(trigger, menu/);
    expect(TOOLBOX_ASR_JS).toMatch(/bindDropdownSelect\(input, menu/);
    expect(TOOLBOX_ASR_JS).toContain("inputId: 'asrDeviceInput', menuId: 'asrDeviceDropdown'");
  });

  test('选项是纯文本 .model-option（不带额外包裹层）', () => {
    expect(TOOLBOX_ASR_JS).toContain('class="model-option${current ? \' selected\' : \'\'}"');
    expect(STYLES).not.toContain('.asr-device-menu .model-option');
  });
});
