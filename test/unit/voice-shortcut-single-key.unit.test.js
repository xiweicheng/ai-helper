// test/unit/voice-shortcut-single-key.unit.test.js
// 单键语音快捷键（右侧 Alt / 右侧 Ctrl）的契约：
//   1) 配置归一化：默认全关，只认布尔 true（旧版本残留 / 手改 JSON 一律收敛）；
//   2) matchSingleKeyDown：只认右 Alt / 右 Ctrl 且「只有它自己」，AltGr（带 ctrlKey）与输入法候选期都不认；
//   3) createSingleKeyTrigger：「按下 → 松开」才算一次触发；按住期间按了别的键整次作废；
//      松开那一刻配置已被关掉 → 不触发；失焦 reset 后松开也不触发；
//   4) 存储：load / save 合并写入、监听变更回调拿到归一化后的值。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_VOICE_SHORTCUT_CONFIG,
  sanitizeVoiceShortcutConfig,
  anyVoiceShortcutEnabled,
  matchSingleKeyDown,
  createSingleKeyTrigger,
  loadVoiceShortcutConfig,
  saveVoiceShortcutConfig,
  watchVoiceShortcutConfig,
  VOICE_SHORTCUT_CONFIG_KEY,
} from '../../src/shared/voice-shortcut.js';

/** 构造按键事件：默认「裸按右侧 Alt」 */
const down = (over = {}) => ({ code: 'AltRight', altKey: true, ...over });
const up = (over = {}) => ({ code: 'AltRight', altKey: true, ...over });

const bothOn = { rightAlt: true, rightCtrl: true };

describe('sanitizeVoiceShortcutConfig：配置归一化', () => {
  it('空值 / 异常输入 → 默认全关', () => {
    expect(sanitizeVoiceShortcutConfig(undefined)).toEqual({ rightAlt: false, rightCtrl: false });
    expect(sanitizeVoiceShortcutConfig(null)).toEqual({ rightAlt: false, rightCtrl: false });
    expect(sanitizeVoiceShortcutConfig('yes')).toEqual({ rightAlt: false, rightCtrl: false });
    expect(DEFAULT_VOICE_SHORTCUT_CONFIG).toEqual({ rightAlt: false, rightCtrl: false });
  });

  it('只认布尔 true：字符串 "true"、1 都不算（存储被手改过也不能自己开）', () => {
    expect(sanitizeVoiceShortcutConfig({ rightAlt: 'true', rightCtrl: 1 })).toEqual({ rightAlt: false, rightCtrl: false });
  });

  it('多余字段被丢弃，只保留两个键位', () => {
    expect(sanitizeVoiceShortcutConfig({ rightAlt: true, foo: 1 })).toEqual({ rightAlt: true, rightCtrl: false });
  });

  it('anyVoiceShortcutEnabled：任一开启即真', () => {
    expect(anyVoiceShortcutEnabled({ rightAlt: false, rightCtrl: false })).toBe(false);
    expect(anyVoiceShortcutEnabled({ rightAlt: true, rightCtrl: false })).toBe(true);
    expect(anyVoiceShortcutEnabled({ rightAlt: false, rightCtrl: true })).toBe(true);
  });
});

describe('matchSingleKeyDown：按下判定', () => {
  it('开启后裸按右侧 Alt 命中', () => {
    expect(matchSingleKeyDown(down(), { rightAlt: true })).toBe('rightAlt');
  });

  it('未开启的键不命中（默认全关时不抢键）', () => {
    expect(matchSingleKeyDown(down(), { rightCtrl: true })).toBe(null);
    expect(matchSingleKeyDown(down(), DEFAULT_VOICE_SHORTCUT_CONFIG)).toBe(null);
  });

  it('右侧 Ctrl 同理', () => {
    const e = { code: 'ControlRight', ctrlKey: true };
    expect(matchSingleKeyDown(e, bothOn)).toBe('rightCtrl');
    expect(matchSingleKeyDown(e, { rightAlt: true })).toBe(null);
  });

  it('左侧键不算（只做右侧，避免抢左侧常用修饰键）', () => {
    expect(matchSingleKeyDown({ code: 'AltLeft', altKey: true }, bothOn)).toBe(null);
    expect(matchSingleKeyDown({ code: 'ControlLeft', ctrlKey: true }, bothOn)).toBe(null);
  });

  it('AltGr：带 ctrlKey 的右侧 Alt 不算（部分布局把它当组合输入键）', () => {
    expect(matchSingleKeyDown(down({ ctrlKey: true }), bothOn)).toBe(null);
  });

  it('带 Shift / Meta 不算', () => {
    expect(matchSingleKeyDown(down({ shiftKey: true }), bothOn)).toBe(null);
    expect(matchSingleKeyDown(down({ metaKey: true }), bothOn)).toBe(null);
  });

  it('输入法候选期不算', () => {
    expect(matchSingleKeyDown(down({ isComposing: true }), bothOn)).toBe(null);
  });

  it('其它键位不算', () => {
    expect(matchSingleKeyDown({ code: 'KeyV', altKey: true }, bothOn)).toBe(null);
  });
});

describe('createSingleKeyTrigger：按下 → 松开算一次', () => {
  it('完整按下并松开 → trigger，keydown 阶段返回 cancel', () => {
    const t1 = createSingleKeyTrigger(() => ({ rightAlt: true }));
    expect(t1.onKeyDown(down())).toBe('cancel');
    expect(t1.onKeyUp(up())).toBe('trigger');
  });

  it('按住期间按了别的键 → 整次作废（不会把组合键当语音触发）', () => {
    const t1 = createSingleKeyTrigger(() => bothOn);
    expect(t1.onKeyDown(down())).toBe('cancel');
    expect(t1.onKeyDown({ code: 'KeyC', ctrlKey: true })).toBe(null);
    expect(t1.onKeyUp(up())).toBe(null);
  });

  it('按住时 keydown 重复（repeat）不会作废，也不会重复武装', () => {
    const t1 = createSingleKeyTrigger(() => bothOn);
    t1.onKeyDown(down());
    expect(t1.onKeyDown(down({ repeat: true }))).toBe(null);
    expect(t1.onKeyUp(up())).toBe('trigger');
  });

  it('松开时配置已被关掉 → 不触发（按住期间去配置页取消也能拦住）', () => {
    let cfg = { rightAlt: true };
    const t1 = createSingleKeyTrigger(() => cfg);
    t1.onKeyDown(down());
    cfg = { rightAlt: false };
    expect(t1.onKeyUp(up())).toBe(null);
  });

  it('reset（窗口失焦）后松开不触发', () => {
    const t1 = createSingleKeyTrigger(() => bothOn);
    t1.onKeyDown(down());
    t1.reset();
    expect(t1.onKeyUp(up())).toBe(null);
  });

  it('没有先按下就松开 → 不触发', () => {
    const t1 = createSingleKeyTrigger(() => bothOn);
    expect(t1.onKeyUp(up())).toBe(null);
  });

  it('两个键都开时，任一个单独按下都能触发', () => {
    const t1 = createSingleKeyTrigger(() => bothOn);
    t1.onKeyDown(down());
    expect(t1.onKeyUp(up())).toBe('trigger');
    t1.onKeyDown({ code: 'ControlRight', ctrlKey: true });
    expect(t1.onKeyUp({ code: 'ControlRight', ctrlKey: true })).toBe('trigger');
  });
});

describe('存储读写', () => {
  let data;
  let listeners;

  beforeEach(() => {
    data = {};
    listeners = [];
    globalThis.chrome = {
      storage: {
        local: {
          get: async (key) => (key in data ? { [key]: data[key] } : {}),
          set: async (obj) => { Object.assign(data, obj); },
        },
        onChanged: {
          addListener: (fn) => listeners.push(fn),
          removeListener: (fn) => {
            const i = listeners.indexOf(fn);
            if (i >= 0) listeners.splice(i, 1);
          },
        },
      },
    };
  });

  it('首次读取（无存储）→ 默认全关', async () => {
    expect(await loadVoiceShortcutConfig()).toEqual({ rightAlt: false, rightCtrl: false });
  });

  it('save 是按 key 合并：勾右侧 Ctrl 不会把已开的右侧 Alt 抹掉', async () => {
    await saveVoiceShortcutConfig({ rightAlt: true });
    const next = await saveVoiceShortcutConfig({ rightCtrl: true });
    expect(next).toEqual({ rightAlt: true, rightCtrl: true });
    expect(data[VOICE_SHORTCUT_CONFIG_KEY]).toEqual({ rightAlt: true, rightCtrl: true });
  });

  it('存储里是脏数据 → 读出来是归一化结果', async () => {
    data[VOICE_SHORTCUT_CONFIG_KEY] = { rightAlt: 'true', rightCtrl: true, junk: 1 };
    expect(await loadVoiceShortcutConfig()).toEqual({ rightAlt: false, rightCtrl: true });
  });

  it('watch 只对自己那个键、local 区域回调，并给出归一化值', async () => {
    const seen = [];
    const off = watchVoiceShortcutConfig((cfg) => seen.push(cfg));
    expect(listeners).toHaveLength(1);
    listeners[0]({ [VOICE_SHORTCUT_CONFIG_KEY]: { newValue: { rightAlt: true } } }, 'local');
    listeners[0]({ otherKey: { newValue: 1 } }, 'local');
    listeners[0]({ [VOICE_SHORTCUT_CONFIG_KEY]: { newValue: { rightCtrl: true } } }, 'sync');
    expect(seen).toEqual([{ rightAlt: true, rightCtrl: false }]);
    off();
    expect(listeners).toHaveLength(0);
  });

  it('chrome.storage 不可用时不抛（回落到默认值 / 内存结果）', async () => {
    globalThis.chrome = {};
    expect(await loadVoiceShortcutConfig()).toEqual({ rightAlt: false, rightCtrl: false });
    expect(await saveVoiceShortcutConfig({ rightAlt: true })).toEqual({ rightAlt: true, rightCtrl: false });
  });
});
