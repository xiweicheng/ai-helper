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

  // 真实 bug（真浏览器探针 _asr-pacing-ui.mjs 才发现）：「识别节奏」展开后第三档「精确」
  // 被下方「麦克风权限」的说明文字压住 —— 说明文字用 opacity < 1 弱化，浏览器把它提成
  // 合成层，绘制在 z-index:1000 的绝对定位浮层之上。放开 overflow 解决不了这件事，
  // 必须让承载浮层的内容区本身自成一栈（position + z-index），浮层在其内部按 z-index 叠放。
  test('承载浮层的内容区 / 小节自成一栈，否则弱化说明文字会盖住浮层', () => {
    const host = block('#asrSection:not(.disabled-section) #asrSectionContent,\n#asrDeviceSection,\n#asrShortcutSection {');
    expect(host).toContain('position: relative');
    expect(host).toMatch(/z-index:\s*[1-9]/);
  });

  // 上一条规则自己引入的回归（真浏览器探针 _asr-device-overlay.mjs 才发现）：它给三个承载浮层的
  // 节点发了同一个 z-index:1，而 #asrDeviceSection 与 #asrShortcutSection 是同级兄弟 —— z-index 相同
  // 时平局按 DOM 顺序判，后面的「快捷触发」压在前面的「输入设备」之上，设备浮层的 z-index:1000 又被
  // 关在 #asrDeviceSection 自建的层叠上下文里出不去。实测展开设备下拉后 7 项里 6 项点不到，
  // 等于只能「跟随系统默认」、选不了麦克风。
  // 契约：抬层必须**条件化**（谁开着浮层谁抬），且抬的层要高于兄弟小节的 1。
  test('展开中的浮层所在小节临时抬层，修同级兄弟平局反压', () => {
    const lift = block('#asrSectionContent:has(.model-dropdown.show),\n#asrDeviceSection:has(.model-dropdown.show),\n#asrShortcutSection:has(.model-dropdown.show) {');
    const z = Number((lift.match(/z-index:\s*(\d+)/) || [])[1]);
    expect(z, '抬层值必须高于兄弟小节的 z-index:1').toBeGreaterThan(1);
    // 必须挂在 .show 上：写成常驻高 z-index 会在收起后反向遮挡后续小节
    expect(lift).toMatch(/:has\(\.model-dropdown\.show\)/);
    // 三个承载浮层的节点都要覆盖到，漏一个就还是会复现
    ['#asrSectionContent', '#asrDeviceSection', '#asrShortcutSection'].forEach((sel) => {
      expect(lift, `抬层规则缺少 ${sel}`).toContain(sel);
    });
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

describe('识别节奏下拉与识别语言同构', () => {
  // 背景：识别节奏（即时/均衡/精确）是 Task 7 新增的第三个下拉。
  // 三颗下拉必须共用同一套触发器+浮层+交互绑定，否则又会长出第二套外观。

  test('触发器用 .model-selector + readonly input，且挂在同一个 .asr-lang-field 上', () => {
    expect(TOOLBOX_ASR_JS).toMatch(/class="model-selector asr-lang-field" id="asrPacingField"/);
    expect(TOOLBOX_ASR_JS).toMatch(/<input type="text" id="asrPacingInput" readonly/);
  });

  test('浮层列表复用 .model-dropdown，选项带 data-pacing 三档', () => {
    expect(TOOLBOX_ASR_JS).toContain('class="model-dropdown asr-lang-menu" id="asrPacingDropdown"');
    expect(TOOLBOX_ASR_JS).toContain('data-pacing="${code}"');
    expect(TOOLBOX_ASR_JS).toContain("const PACING_CODES = ['instant', 'balanced', 'precise']");
  });

  test('点外面收起靠 DISMISSABLE_DROPDOWNS 登记（漏登记就会出现“点别处不收起”）', () => {
    expect(TOOLBOX_ASR_JS).toContain("inputId: 'asrPacingInput', menuId: 'asrPacingDropdown'");
  });

  test('选择后写入 /api/asr/config 的 asrPacing 字段（与会话读取的键一致）', () => {
    expect(TOOLBOX_ASR_JS).toMatch(/agentApi\('POST', '\/api\/asr\/config', \{ asrPacing: pacing \}\)/);
  });
});
