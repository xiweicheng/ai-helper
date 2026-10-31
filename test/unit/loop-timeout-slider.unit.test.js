// @vitest-environment jsdom
// loop-timeout-slider.unit.test.js - 「整体循环超时」档位滑杆
//
// 契约：
// - 档位 12 档（10 分钟 – 24 小时）；nearestLadderIndex 取最近档位、越界夹取；
// - 下限 10 分钟的依据是「工具执行超时固定 10 分钟」——低于它一轮都跑不完；
// - 读数三分支：<60min → 「N 分钟」、整小时 → 「N 小时」、其余 → 「N 小时 M 分钟」；
// - input（拖动中）只改读数预览，change（松手 / 键盘步进）才 onCommit 落盘；
// - attach 幂等：loadConfig 重复调用不得重复绑定（否则一次拖动写多次 storage）；
// - 设置页标记与 config-manager 接线：滑杆索引在 min/max 上、真值在 dataset.minutes、
//   保存走 dataset 而非 .value（旧 number 输入的读法会让滑杆索引被当成分钟数）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  LOOP_TIMEOUT_LADDER,
  LOOP_TIMEOUT_MIN_MINUTES,
  LOOP_TIMEOUT_MAX_MINUTES,
  LOOP_TIMEOUT_MAX_INDEX,
  nearestLadderIndex,
  indexToMinutes,
  splitLoopTimeout,
  formatLoopTimeout,
} from '../../src/options/loop-timeout-slider.js';

// jsdom 环境下 import.meta.url 是 http 形式，读源文件要走 cwd
const OPTIONS_HTML = readFileSync(resolve(process.cwd(), 'options.html'), 'utf8');
const CONFIG_MANAGER_SRC = readFileSync(resolve(process.cwd(), 'src/options/config-manager.js'), 'utf8');
const ZH_SRC = readFileSync(resolve(process.cwd(), 'src/shared/locales/zh.js'), 'utf8');
const EN_SRC = readFileSync(resolve(process.cwd(), 'src/shared/locales/en.js'), 'utf8');

describe('L1 档位表：跨度收窄到 10 分钟 – 24 小时', () => {
  it('首个档位即下限 10 分钟，末档 24 小时，且严格递增', () => {
    expect(LOOP_TIMEOUT_LADDER[0]).toBe(10);
    expect(LOOP_TIMEOUT_MAX_MINUTES).toBe(1440);
    expect(LOOP_TIMEOUT_MAX_MINUTES).toBe(24 * 60);
    expect(LOOP_TIMEOUT_MIN_MINUTES).toBe(LOOP_TIMEOUT_LADDER[0]);
    expect(LOOP_TIMEOUT_MAX_INDEX).toBe(LOOP_TIMEOUT_LADDER.length - 1);
    for (let i = 1; i < LOOP_TIMEOUT_LADDER.length; i++) {
      expect(LOOP_TIMEOUT_LADDER[i]).toBeGreaterThan(LOOP_TIMEOUT_LADDER[i - 1]);
    }
  });

  it('下限不低于工具执行超时（10 分钟），否则一轮工具调用都跑不完', () => {
    expect(LOOP_TIMEOUT_MIN_MINUTES).toBeGreaterThanOrEqual(10);
  });

  it('保留 4 小时默认档与用户常用档位（4h / 1h / 8h / 12h）', () => {
    expect(LOOP_TIMEOUT_LADDER).toContain(240);
    expect(LOOP_TIMEOUT_LADDER).toContain(60);
    expect(LOOP_TIMEOUT_LADDER).toContain(480);
    expect(LOOP_TIMEOUT_LADDER).toContain(720);
  });

  it('1 小时起每档间隔恰为 1 小时（末端不再一格跨数小时）', () => {
    const hourly = LOOP_TIMEOUT_LADDER.filter((m) => m >= 60);
    expect(hourly[0]).toBe(60);
    expect(hourly[hourly.length - 1]).toBe(1440);
    for (let i = 1; i < hourly.length; i++) {
      expect(hourly[i] - hourly[i - 1]).toBe(60); // 5h/7h/9h/13h…23h 都能精确落到
    }
  });
});

describe('L2 吸附与夹取', () => {
  it('整档位精确命中', () => {
    expect(nearestLadderIndex(10)).toBe(0);
    expect(nearestLadderIndex(240)).toBe(7);
    expect(nearestLadderIndex(1440)).toBe(LOOP_TIMEOUT_MAX_INDEX);
  });

  it('非档位历史值取最近档位（旧的任意分钟值仍能安全显示）', () => {
    expect(nearestLadderIndex(200)).toBe(6); // 180（idx6）比 240 更近
    expect(nearestLadderIndex(355)).toBe(9); // 360（差 5）
    expect(nearestLadderIndex(1000)).toBe(20); // 1020（差 20）vs 960（差 40）
  });

  it('越界与非法值夹取到首末档位', () => {
    expect(nearestLadderIndex(1)).toBe(0);
    expect(nearestLadderIndex(0)).toBe(0);
    expect(nearestLadderIndex(-100)).toBe(0);
    expect(nearestLadderIndex(99999)).toBe(LOOP_TIMEOUT_MAX_INDEX);
    expect(nearestLadderIndex(NaN)).toBe(0);
    expect(nearestLadderIndex('240')).toBe(7);
  });

  it('indexToMinutes：索引越界夹取，输出必是档位值', () => {
    expect(indexToMinutes(0)).toBe(10);
    expect(indexToMinutes('7')).toBe(240);
    expect(indexToMinutes(99)).toBe(1440);
    expect(indexToMinutes(-3)).toBe(10);
    for (let i = 0; i < LOOP_TIMEOUT_LADDER.length; i++) {
      expect(indexToMinutes(i)).toBe(LOOP_TIMEOUT_LADDER[i]);
    }
  });
});

describe('L3 读数文案', () => {
  it('拆分为小时/分钟', () => {
    expect(splitLoopTimeout(10)).toEqual({ hours: 0, minutes: 10 });
    expect(splitLoopTimeout(60)).toEqual({ hours: 1, minutes: 0 });
    expect(splitLoopTimeout(90)).toEqual({ hours: 1, minutes: 30 });
    expect(splitLoopTimeout(1440)).toEqual({ hours: 24, minutes: 0 });
  });

  it('非正值按 1 分钟兜底，读数不得出现 0 分钟', () => {
    expect(splitLoopTimeout(0)).toEqual({ hours: 0, minutes: 1 });
    expect(splitLoopTimeout(-5)).toEqual({ hours: 0, minutes: 1 });
  });

  it('三分支：不足 1 小时 / 整小时 / 小时+分钟', () => {
    expect(formatLoopTimeout(10)).toBe('10 分钟');
    expect(formatLoopTimeout(30)).toBe('30 分钟');
    expect(formatLoopTimeout(60)).toBe('1 小时');
    expect(formatLoopTimeout(240)).toBe('4 小时');
    expect(formatLoopTimeout(1440)).toBe('24 小时');
    expect(formatLoopTimeout(90)).toBe('1 小时 30 分钟');
  });

  it('每个档位都有可读读数（不出现原始 i18n key）', () => {
    for (const minutes of LOOP_TIMEOUT_LADDER) {
      const text = formatLoopTimeout(minutes);
      expect(text).not.toMatch(/^react\./);
      expect(text.length).toBeGreaterThan(0);
    }
  });
});

describe('L4 设置页标记：range 滑杆取代 number 输入', () => {
  const tag = OPTIONS_HTML.match(/<input[^>]*id="reactLoopTimeout"[^>]*>/);

  it('reactLoopTimeout 是 range，索引上界等于档位表最大索引', () => {
    expect(tag).not.toBeNull();
    expect(tag[0]).toMatch(/type="range"/);
    const maxMatch = tag[0].match(/max="(\d+)"/);
    expect(maxMatch).not.toBeNull();
    expect(Number(maxMatch[1])).toBe(LOOP_TIMEOUT_MAX_INDEX);
  });

  it('value / data-minutes 与默认 4 小时一致（240 分钟 = 索引 7）', () => {
    expect(tag[0]).toMatch(/value="7"/);
    expect(tag[0]).toMatch(/data-minutes="240"/);
    expect(indexToMinutes(7)).toBe(240);
  });

  it('旧的 number 输入形态与「1 分钟」下限文案已移除', () => {
    expect(OPTIONS_HTML).not.toMatch(/id="reactLoopTimeout"[^>]*type="number"/);
    expect(OPTIONS_HTML).not.toMatch(/min="1"\s+max="1440"/);
    expect(OPTIONS_HTML).not.toMatch(/data-i18n="react\.min1Minute"/);
    expect(OPTIONS_HTML).not.toMatch(/data-i18n="react\.unitMinute"/);
  });

  it('读数与刻度容器都在，范围标签改用新键', () => {
    expect(OPTIONS_HTML).toMatch(/id="reactLoopTimeoutValue"/);
    expect(OPTIONS_HTML).toMatch(/id="reactLoopTimeoutScale"/);
    expect(OPTIONS_HTML).toMatch(/data-i18n="react\.loopTimeoutMinLabel"/);
    expect(OPTIONS_HTML).toMatch(/data-i18n="react\.loopTimeoutMaxLabel"/);
  });
});

describe('L5 config-manager 接线：渲染 / 松手落盘 / 保存读 dataset', () => {
  it('引入滑杆模块并渲染存储值', () => {
    expect(CONFIG_MANAGER_SRC).toMatch(
      /import \{[^}]*renderLoopTimeoutSlider[^}]*attachLoopTimeoutSlider[^}]*\} from '\.\/loop-timeout-slider\.js';/
    );
    expect(CONFIG_MANAGER_SRC).toMatch(/renderLoopTimeoutSlider\(Math\.round\(\(result\.reactLoopTimeout/);
  });

  it('松手即落盘：onCommit 写 reactLoopTimeout 并给出成功反馈', () => {
    expect(CONFIG_MANAGER_SRC).toMatch(/attachLoopTimeoutSlider\(\{/);
    expect(CONFIG_MANAGER_SRC).toMatch(/chrome\.storage\.local\.set\(\{ reactLoopTimeout: minutes \* 60000 \}\)/);
    expect(CONFIG_MANAGER_SRC).toMatch(/t\('react\.loopTimeoutSaved'\)/);
  });

  it('保存读 dataset.minutes，不再把滑杆索引当分钟数', () => {
    expect(CONFIG_MANAGER_SRC).toMatch(/dataset\.minutes/);
    expect(CONFIG_MANAGER_SRC).not.toMatch(/document\.getElementById\('reactLoopTimeout'\)\.value\s*=/);
    expect(CONFIG_MANAGER_SRC).not.toMatch(/parseInt\(document\.getElementById\('reactLoopTimeout'\)\.value\)/);
  });

  it('范围校验下限取自滑杆首档常量，而不是字面量', () => {
    expect(CONFIG_MANAGER_SRC).toMatch(/reactLoopTimeout < LOOP_TIMEOUT_MIN_MINUTES \* 60000/);
    expect(CONFIG_MANAGER_SRC).not.toMatch(/reactLoopTimeout < 60000/);
  });
});

describe('L6 文案：中英成对，旧单位键清理', () => {
  it('读数与反馈键中英都有', () => {
    for (const key of [
      'loopTimeoutMinLabel',
      'loopTimeoutMaxLabel',
      'loopTimeoutSaved',
      'durationMinutes',
      'durationHours',
      'durationHoursMinutes',
    ]) {
      expect(ZH_SRC).toMatch(new RegExp(`${key}:\\s*'`));
      expect(EN_SRC).toMatch(new RegExp(`${key}:\\s*'`));
    }
  });

  it('随 number 输入一起废弃的旧键已移除', () => {
    for (const key of ['unitMinute', 'min1Minute', 'max1440Minutes']) {
      expect(ZH_SRC).not.toMatch(new RegExp(`${key}:\\s*'`));
      expect(EN_SRC).not.toMatch(new RegExp(`${key}:\\s*'`));
    }
  });

  it('范围错误文案已同步为 10 分钟 – 24 小时', () => {
    expect(ZH_SRC).toMatch(/10 分钟 - 24 小时/);
    expect(EN_SRC).toMatch(/between 10 minutes and 24 hours/);
  });
});

// 模块内有单例元素与 attached 标记，每个 DOM 用例都取一份全新实例，
// 否则第一个用例绑定过的事件会跨用例残留（后续用例 onCommit 计数会被污染）。
async function freshSliderModule() {
  vi.resetModules();
  return import('../../src/options/loop-timeout-slider.js');
}

function mountSlider() {
  document.body.innerHTML = `
    <input type="range" id="reactLoopTimeout" min="0" max="27" step="1" value="7" data-minutes="240">
    <div class="loop-timeout-scale" id="reactLoopTimeoutScale"></div>
    <output id="reactLoopTimeoutValue"></output>`;
  return {
    slider: document.getElementById('reactLoopTimeout'),
    scale: document.getElementById('reactLoopTimeoutScale'),
    value: document.getElementById('reactLoopTimeoutValue'),
  };
}

describe('L7 DOM：渲染与「拖动预览 / 松手提交」', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('渲染：吸附到最近档位、写读数与 aria-valuetext、档位点高亮、填充进度', async () => {
    const { slider, scale, value } = mountSlider();
    const mod = await freshSliderModule();

    mod.renderLoopTimeoutSlider(240);

    expect(slider.value).toBe('7');
    expect(slider.dataset.minutes).toBe('240');
    expect(slider.getAttribute('aria-valuetext')).toBe('4 小时');
    expect(value.textContent).toBe('4 小时');
    expect(scale.children.length).toBe(LOOP_TIMEOUT_LADDER.length);
    expect(scale.children[7].classList.contains('is-active')).toBe(true);
    expect(scale.children[6].classList.contains('is-active')).toBe(false);
    expect(slider.getAttribute('style')).toContain('25.9%'); // 7 / 27
  });

  it('渲染：旧的任意分钟值（200）吸附显示为 3 小时，但不回写存储', async () => {
    const { slider, value } = mountSlider();
    const mod = await freshSliderModule();
    const setSpy = vi.spyOn(chrome.storage.local, 'set');

    mod.renderLoopTimeoutSlider(200);

    expect(slider.value).toBe('6');
    expect(slider.dataset.minutes).toBe('180');
    expect(value.textContent).toBe('3 小时');
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();
  });

  it('拖动中只预览：input 改读数与 dataset，不调 onCommit', async () => {
    const { slider, value } = mountSlider();
    const mod = await freshSliderModule();
    const onCommit = vi.fn();
    mod.attachLoopTimeoutSlider({ onCommit });

    slider.value = '27';
    slider.dispatchEvent(new Event('input', { bubbles: true }));

    expect(onCommit).not.toHaveBeenCalled();
    expect(slider.dataset.minutes).toBe('1440');
    expect(value.textContent).toBe('24 小时');
  });

  it('松手 / 键盘步进提交：change 回传分钟数（不是索引）', async () => {
    const { slider } = mountSlider();
    const mod = await freshSliderModule();
    const onCommit = vi.fn();
    mod.attachLoopTimeoutSlider({ onCommit });

    slider.value = '4';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(60);
  });

  it('attach 幂等：重复调用后一次 change 仍只提交一次', async () => {
    const { slider } = mountSlider();
    const mod = await freshSliderModule();
    const onCommit = vi.fn();

    mod.attachLoopTimeoutSlider({ onCommit });
    mod.attachLoopTimeoutSlider({ onCommit });
    mod.attachLoopTimeoutSlider({ onCommit });

    slider.value = '2';
    slider.dispatchEvent(new Event('change', { bubbles: true }));

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(30);
  });

  it('设置页缺元素时不抛错（渲染/绑定都静默跳过）', async () => {
    document.body.innerHTML = '<div id="other"></div>';
    const mod = await freshSliderModule();
    expect(() => mod.renderLoopTimeoutSlider(240)).not.toThrow();
    expect(() => mod.attachLoopTimeoutSlider({ onCommit: () => {} })).not.toThrow();
  });
});

describe('L8 读取侧钳制：绕过设置页的旧备份/残留值也必须落在 10min–24h', () => {
  const CONFIG_BG = readFileSync(resolve(process.cwd(), 'src/background/config.js'), 'utf8');
  const PANEL_UTILS = readFileSync(resolve(process.cwd(), 'src/side_panel/utils.js'), 'utf8');

  it('后台 getStoredConfig 对 reactLoopTimeout 做上下限夹取（不再裸取值）', () => {
    expect(CONFIG_BG).toMatch(/const LOOP_TIMEOUT_MIN_MS = 600000;/);
    expect(CONFIG_BG).toMatch(/const LOOP_TIMEOUT_MAX_MS = 86400000;/);
    expect(CONFIG_BG).toMatch(
      /loopTimeout: Math\.min\(Math\.max\(result\.reactLoopTimeout \|\| DEFAULT_REACT_CONFIG\.loopTimeout, LOOP_TIMEOUT_MIN_MS\), LOOP_TIMEOUT_MAX_MS\)/
    );
    // 不能退回旧的裸取值（那样旧备份的 1 分钟会直接生效）
    expect(CONFIG_BG).not.toMatch(/loopTimeout: result\.reactLoopTimeout \|\|/);
  });

  it('面板 getReactConfig 同口径夹取（看门狗换算依赖它）', () => {
    expect(PANEL_UTILS).toMatch(
      /loopTimeout: Math\.min\(Math\.max\(result\.reactLoopTimeout \|\| DEFAULT_REACT_CONFIG\.loopTimeout, 600000\), 86400000\)/
    );
    expect(PANEL_UTILS).not.toMatch(/loopTimeout: result\.reactLoopTimeout \|\|/);
  });
});

describe('L9 语言热切换重绘 + index.js 接线', () => {
  const OPTIONS_INDEX = readFileSync(resolve(process.cwd(), 'src/options/index.js'), 'utf8');

  it('index.js 引入 repaintLoopTimeout 并在语言订阅回调里调用', () => {
    expect(OPTIONS_INDEX).toMatch(/import \{ repaintLoopTimeout \} from '\.\/loop-timeout-slider\.js';/);
    expect(OPTIONS_INDEX).toMatch(/subscribe\(\(\) => \{[\s\S]*?applyI18n\(\);[\s\S]*?repaintLoopTimeout\(\);/);
  });

  it('repaintLoopTimeout 按滑杆当前档位重算读数（不读存储），缺元素时安全跳过', async () => {
    const { slider, value } = mountSlider();
    const mod = await freshSliderModule();
    mod.renderLoopTimeoutSlider(240); // 索引 7
    slider.value = '11'; // 模拟切换前滑杆已停在另一档位（480 = 8h）
    const setSpy = vi.spyOn(chrome.storage.local, 'set');
    mod.repaintLoopTimeout();
    expect(slider.dataset.minutes).toBe('480');
    expect(value.textContent).toBe('8 小时');
    expect(setSpy).not.toHaveBeenCalled();
    setSpy.mockRestore();

    document.body.innerHTML = '<div></div>';
    const mod2 = await freshSliderModule();
    expect(() => mod2.repaintLoopTimeout()).not.toThrow();
  });
});
