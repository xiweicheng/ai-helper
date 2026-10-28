// @vitest-environment jsdom
// test/unit/voice-shortcut-panel.unit.test.js
// 侧边栏侧的单键快捷键接线（不是纯函数，走真实 DOM 事件）：
//   1) 配置开启右侧 Alt 后，keydown + keyup 一拍 → 真的开始录音；
//   2) 按住右 Alt 期间敲了别的键（AltGr 类组合）→ 不触发；
//   3) 配置全关（默认）→ 按键一动不动（不能抢用户的键）。
// 注：配置在 initVoiceInput 时读一次，所以桩必须在 init 之前铺好；本文件单独一份模块实例。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initVoiceInput, isVoiceRecording, abortVoiceInput } from '../../src/side_panel/voice-input.js';
import { setupDom, stubChrome, stubMedia, waitFor } from './helpers/voice-harness.js';

const ARMED = { success: true, available: true, language: 'zh', maxRecordingMs: 300000 };

let chromeCtx;

const fire = (type, code, over = {}) => document.dispatchEvent(new KeyboardEvent(type, {
  code, bubbles: true, cancelable: true, ...over,
}));
const press = (code, over = {}) => fire('keydown', code, over);
const release = (code, over = {}) => fire('keyup', code, over);

/** 把 storage.local 换成返回指定配置的桩（voice-shortcut.js 每次判定都现读，读的是这个） */
function stubShortcutStorage(config) {
  chrome.storage.local = {
    get: async () => ({ voiceShortcutConfig: config }),
    set: async () => {},
  };
  chrome.storage.onChanged = { addListener: () => {}, removeListener: () => {} };
}

beforeEach(() => {
  setupDom();
  stubMedia();
  chromeCtx = stubChrome({ status: ARMED });
});

afterEach(() => {
  abortVoiceInput();
  chromeCtx.port.disconnect();
});

describe('侧边栏：右侧 Alt 单键触发', () => {
  it('开启后按下并松开 → 开始录音', async () => {
    stubShortcutStorage({ rightAlt: true, rightCtrl: false });
    await initVoiceInput({ adjustInputHeight: () => {} });

    press('AltRight', { altKey: true });
    release('AltRight', { altKey: true });

    expect(await waitFor(() => isVoiceRecording())).toBe(true);
  });

  it('未开启（默认全关）→ 按键不触发', async () => {
    stubShortcutStorage({ rightAlt: false, rightCtrl: false });
    await initVoiceInput({ adjustInputHeight: () => {} });

    press('AltRight', { altKey: true });
    release('AltRight', { altKey: true });
    await new Promise((r) => setTimeout(r, 60));

    expect(isVoiceRecording()).toBe(false);
  });

  it('按住期间敲了别的键 → 整次作废（AltGr 组合不误开录音）', async () => {
    stubShortcutStorage({ rightAlt: true, rightCtrl: false });
    await initVoiceInput({ adjustInputHeight: () => {} });

    press('AltRight', { altKey: true });
    press('KeyE', { altKey: true }); // AltGr + E
    release('AltRight', { altKey: true });
    await new Promise((r) => setTimeout(r, 60));

    expect(isVoiceRecording()).toBe(false);
  });
});

// storage 事件不是唯一通道：面板被隐藏 / SW 刚重启等情况下 onChanged 可能没送到，
// 回到面板（focus / 可见）时要再与存储对一次 —— 用户报的就是「勾了要重开面板才生效」。
describe('侧边栏：回到面板时重读配置（storage 事件没送达的兜底）', () => {
  it('onChanged 丢失：focus 后新开的单键也能立即生效', async () => {
    const cfg = { rightAlt: false, rightCtrl: false };
    stubShortcutStorage(cfg);
    await initVoiceInput({ adjustInputHeight: () => {} });

    cfg.rightAlt = true; // 模拟配置页确实写进去了，但事件没送到面板
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 60));

    press('AltRight', { altKey: true });
    release('AltRight', { altKey: true });

    expect(await waitFor(() => isVoiceRecording())).toBe(true);
  });

  it('onChanged 丢失：focus 后取消勾选也立即失效', async () => {
    const cfg = { rightAlt: true, rightCtrl: false };
    stubShortcutStorage(cfg);
    await initVoiceInput({ adjustInputHeight: () => {} });

    cfg.rightAlt = false;
    window.dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 60));

    press('AltRight', { altKey: true });
    release('AltRight', { altKey: true });
    await new Promise((r) => setTimeout(r, 60));

    expect(isVoiceRecording()).toBe(false);
  });
});
