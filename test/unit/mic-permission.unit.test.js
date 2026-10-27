// test/unit/mic-permission.unit.test.js
// 麦克风权限的三件事（全是纯逻辑，依赖靠注入，不碰真实 navigator / 真实设备）：
//   1) normalizeMicState：任意输入都收敛到 granted / prompt / denied / unknown，
//      老浏览器不认 microphone 这个 name 时必须落到 unknown（不能误报「被拒绝」）；
//   2) queryMicState：查询失败一律 unknown；
//   3) requestMicAccess：拿到流后立刻 stop 轨道；NotAllowedError 要按「真实权限状态」
//      区分「被拒绝（denied）」和「只是关掉了弹窗（prompt）」——两种引导完全不同。
import { describe, it, expect, vi } from 'vitest';
import {
  MIC_STATES,
  normalizeMicState,
  queryMicState,
  requestMicAccess,
  watchMicState,
} from '../../src/shared/mic-permission.js';

/** 造一个只实现 permissions.query 的 navigator 替身 */
function navWithPermission(state) {
  return {
    permissions: {
      query: vi.fn(async () => ({ state })),
    },
  };
}

/** 造一个 getUserMedia 替身；tracks 记录 stop 调用 */
function navWithMedia(getUserMedia) {
  return { mediaDevices: { getUserMedia } };
}

describe('normalizeMicState：状态归一化', () => {
  it('四种合法状态原样返回', () => {
    for (const state of MIC_STATES) {
      expect(normalizeMicState(state)).toBe(state);
    }
  });

  it('接受 {state} 对象，大小写与空白都容错', () => {
    expect(normalizeMicState({ state: 'GRANTED' })).toBe('granted');
    expect(normalizeMicState('  Denied ')).toBe('denied');
  });

  it('无法识别的输入一律 unknown（不误判成 denied）', () => {
    for (const raw of [undefined, null, '', 'weird', 42, {}, { state: null }]) {
      expect(normalizeMicState(raw)).toBe('unknown');
    }
  });
});

describe('queryMicState：查询失败的兜底', () => {
  it('正常返回 granted / prompt / denied', async () => {
    for (const state of ['granted', 'prompt', 'denied']) {
      await expect(queryMicState({ navigator: navWithPermission(state) })).resolves.toBe(state);
    }
  });

  it('query 抛错（老浏览器不认 microphone）→ unknown', async () => {
    const nav = { permissions: { query: () => { throw new TypeError('unsupported name'); } } };
    await expect(queryMicState({ navigator: nav })).resolves.toBe('unknown');
  });

  it('没有 navigator.permissions → unknown', async () => {
    await expect(queryMicState({ navigator: {} })).resolves.toBe('unknown');
    await expect(queryMicState({ navigator: { permissions: {} } })).resolves.toBe('unknown');
  });
});

describe('requestMicAccess：申请授权', () => {
  it('拿到流后立刻停掉所有轨道（只要授权结果，不占麦克风）', async () => {
    const first = { stopCount: 0, stop() { this.stopCount += 1; } };
    const second = { stopCount: 0, stop() { this.stopCount += 1; } };
    const getUserMedia = vi.fn(async () => ({ getTracks: () => [first, second] }));

    const res = await requestMicAccess({ navigator: navWithMedia(getUserMedia) });

    expect(res).toEqual({ ok: true, state: 'granted', error: '' });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(first.stopCount).toBe(1);
    expect(second.stopCount).toBe(1);
  });

  it('用户点了「拒绝」→ denied（并给出错误名，便于上层区分文案）', async () => {
    const getUserMedia = async () => { throw Object.assign(new Error('denied'), { name: 'NotAllowedError' }); };
    const res = await requestMicAccess({
      navigator: { ...navWithMedia(getUserMedia), ...navWithPermission('denied') },
    });
    expect(res.ok).toBe(false);
    expect(res.state).toBe('denied');
    expect(res.error).toBe('NotAllowedError');
  });

  it('只是关掉了授权弹窗（权限仍是 prompt）→ 不能报成 denied', async () => {
    const getUserMedia = async () => { throw Object.assign(new Error('dismissed'), { name: 'NotAllowedError' }); };
    const res = await requestMicAccess({
      navigator: { ...navWithMedia(getUserMedia), ...navWithPermission('prompt') },
    });
    expect(res.state).toBe('prompt');
  });

  it('权限查不到（query 抛错）+ SecurityError → unknown（保留重试入口，不锁死成 denied）', async () => {
    const getUserMedia = async () => { throw Object.assign(new Error('blocked'), { name: 'SecurityError' }); };
    const nav = {
      ...navWithMedia(getUserMedia),
      permissions: { query: () => { throw new TypeError('unsupported'); } },
    };
    const res = await requestMicAccess({ navigator: nav });
    expect(res.ok).toBe(false);
    expect(res.state).toBe('unknown');
  });

  it('没有麦克风设备（NotFoundError）→ unknown + 原始错误名，不误报成权限问题', async () => {
    const getUserMedia = async () => { throw Object.assign(new Error('no device'), { name: 'NotFoundError' }); };
    const res = await requestMicAccess({ navigator: navWithMedia(getUserMedia) });
    expect(res).toEqual({ ok: false, state: 'unknown', error: 'NotFoundError' });
  });

  it('环境不支持 getUserMedia → unsupported', async () => {
    const res = await requestMicAccess({ navigator: {} });
    expect(res).toEqual({ ok: false, state: 'unknown', error: 'unsupported' });
  });
});

describe('watchMicState：权限变化回调', () => {
  it('权限变动时回调，取消订阅后置空 onchange', async () => {
    const status = { state: 'prompt', onchange: null };
    const nav = { permissions: { query: async () => status } };
    const onChange = vi.fn();

    const off = await watchMicState(onChange, { navigator: nav });
    expect(typeof off).toBe('function');
    expect(typeof status.onchange).toBe('function');

    status.state = 'granted';
    status.onchange();
    expect(onChange).toHaveBeenCalledWith('granted');

    off();
    expect(status.onchange).toBe(null);
  });

  it('不支持 permissions 时返回空取消函数且不抛错', async () => {
    const off = await watchMicState(() => {}, { navigator: {} });
    expect(() => off()).not.toThrow();
  });
});
