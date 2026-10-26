// @vitest-environment jsdom
// test/unit/voice-input-gating.unit.test.js
// 门控矩阵：depsReady × modelsReady × enabled → 🎤 按钮可见性。
// 设计意图：安装代理端 ≠ 获得语音能力，三者全真才露面（避免「装了就该能用」的误解）。
// 两层验证：
//   1) computeArmed 纯函数跑满 2^3 组合 + 旧代理兼容（无 available 字段）+ 服务端权威（有 available 字段）
//   2) initVoiceInput 之后按钮真实 style.display 与状态一致（接线没接错）
import { describe, it, expect, beforeEach } from 'vitest';
import { computeArmed, initVoiceInput } from '../../src/side_panel/voice-input.js';
import { setupDom, stubChrome, stubMedia } from './helpers/voice-harness.js';

const combo = (depsReady, modelsReady, enabled) => ({
  success: true,
  deps: { ready: depsReady },
  modelsReady,
  enabled,
});

describe('computeArmed：三者全真才可用', () => {
  it('2^3 全组合：仅 deps.ready && modelsReady && enabled 为真时 armed', () => {
    for (const depsReady of [true, false]) {
      for (const modelsReady of [true, false]) {
        for (const enabled of [true, false]) {
          const expected = depsReady && modelsReady && enabled;
          expect(computeArmed(combo(depsReady, modelsReady, enabled))).toBe(expected);
        }
      }
    }
  });

  it('缺任何一环的具体组合都为 false（防止回归成「装了就能用」）', () => {
    expect(computeArmed(combo(false, true, true))).toBe(false);   // 缺依赖
    expect(computeArmed(combo(true, false, true))).toBe(false);   // 缺模型
    expect(computeArmed(combo(true, true, false))).toBe(false);   // 用户关掉开关
  });

  it('服务端 available 字段优先（三者为真的汇总结果）', () => {
    expect(computeArmed({ success: true, available: true, deps: { ready: false } })).toBe(true);
    expect(computeArmed({ success: true, available: false, deps: { ready: true }, modelsReady: true, enabled: true })).toBe(false);
  });

  it('旧代理（无 available / 无细分字段）：一律不可用', () => {
    expect(computeArmed({ success: true })).toBe(false);
    expect(computeArmed({ success: true, deps: {} })).toBe(false);
    expect(computeArmed({})).toBe(false);
  });

  it('空值与请求失败：不可用（不因异常把按钮露出来）', () => {
    expect(computeArmed(null)).toBe(false);
    expect(computeArmed(undefined)).toBe(false);
    expect(computeArmed({ success: false, available: true })).toBe(false);
  });
});

describe('按钮可见性接线（initVoiceInput → refreshGating）', () => {
  beforeEach(() => {
    setupDom();
    stubMedia();
  });

  async function initWith(status) {
    stubChrome({ status });
    const dom = setupDom();
    await initVoiceInput({});
    return dom;
  }

  it('三者全真：按钮显示', async () => {
    const dom = await initWith(combo(true, true, true));
    expect(dom.btn.style.display).toBe('');
  });

  it('缺依赖：按钮保持隐藏', async () => {
    const dom = await initWith(combo(false, true, true));
    expect(dom.btn.style.display).toBe('none');
  });

  it('缺模型：按钮保持隐藏', async () => {
    const dom = await initWith(combo(true, false, true));
    expect(dom.btn.style.display).toBe('none');
  });

  it('用户未启用：按钮保持隐藏', async () => {
    const dom = await initWith(combo(true, true, false));
    expect(dom.btn.style.display).toBe('none');
  });

  it('代理不可达（status 为 null）：按钮保持隐藏', async () => {
    const dom = await initWith(null);
    expect(dom.btn.style.display).toBe('none');
  });

  it('状态消息抛错：按钮保持隐藏，不抛到调用方', async () => {
    const dom = setupDom();
    stubChrome({ onSendMessage: () => { throw new Error('no agent'); } });
    await expect(initVoiceInput({})).resolves.toBeUndefined();
    expect(dom.btn.style.display).toBe('none');
  });
});
