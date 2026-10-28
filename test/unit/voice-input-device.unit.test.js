// @vitest-environment jsdom
// test/unit/voice-input-device.unit.test.js
// 采集链路与「输入设备」的接线（不是纯函数，走真实 initVoiceInput → 采集）：
//   1) 配置页选过设备 → getUserMedia 带 deviceId.exact；
//   2) 没选 → 完全不传 deviceId（跟随系统默认，插拔自动跟随）；
//   3) 选中的设备不可用 → 自动回落系统默认，并在录音条上提示一次
//      （静默换设备是最难排查的一类问题，必须让用户看见）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  initVoiceInput,
  toggleVoiceInput,
  isVoiceRecording,
  abortVoiceInput,
} from '../../src/side_panel/voice-input.js';
import { setupDom, stubChrome, stubMedia, waitFor } from './helpers/voice-harness.js';

const ARMED = { success: true, available: true, language: 'zh', maxRecordingMs: 300000 };

let chromeCtx;

const makeStream = () => ({ getTracks: () => [{ stop() {} }] });

/** storage.local 里放一个设备选择（undefined = 从没配过） */
function stubDeviceStorage(deviceId) {
  chrome.storage.local = {
    get: async (key) => ({ [key]: key === 'voiceInputDevice' ? deviceId : undefined }),
    set: async () => {},
  };
  chrome.storage.onChanged = { addListener: () => {}, removeListener: () => {} };
}

/**
 * 覆盖 harness 的 getUserMedia：记录每次约束，按调用次数决定成功/抛错。
 * 注意 stubMedia 用 defineProperty 定义的 mediaDevices 不可直接赋值。
 */
function stubGetUserMedia(handler) {
  const calls = [];
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: async (constraints) => {
        calls.push(constraints);
        return handler(constraints, calls.length);
      },
      enumerateDevices: async () => [],
    },
  });
  return calls;
}

beforeEach(() => {
  setupDom();
  stubMedia();
  chromeCtx = stubChrome({ status: ARMED });
  stubDeviceStorage(undefined);
});

afterEach(() => {
  abortVoiceInput();
  chromeCtx.port.disconnect();
});

describe('侧边栏采集：按用户选择取流', () => {
  it('选过设备 → 带 deviceId.exact，其余约束不变', async () => {
    stubDeviceStorage('mic-usb');
    const calls = stubGetUserMedia(() => makeStream());
    await initVoiceInput({ adjustInputHeight: () => {} });

    await toggleVoiceInput();

    expect(await waitFor(() => isVoiceRecording())).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].audio).toEqual({
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      deviceId: { exact: 'mic-usb' },
    });
  });

  it('没选过设备 → 不传 deviceId（跟随系统默认）', async () => {
    const calls = stubGetUserMedia(() => makeStream());
    await initVoiceInput({ adjustInputHeight: () => {} });

    await toggleVoiceInput();

    expect(await waitFor(() => isVoiceRecording())).toBe(true);
    expect(calls).toHaveLength(1);
    expect('deviceId' in calls[0].audio).toBe(false);
  });

  it('选中的设备已不可用 → 回落系统默认，并在录音条提示', async () => {
    stubDeviceStorage('mic-gone');
    const calls = stubGetUserMedia((constraints, nth) => {
      if (nth === 1) {
        const err = new Error('device not found');
        err.name = 'OverconstrainedError';
        throw err;
      }
      return makeStream();
    });
    await initVoiceInput({ adjustInputHeight: () => {} });

    await toggleVoiceInput();

    expect(await waitFor(() => isVoiceRecording())).toBe(true);
    expect(calls).toHaveLength(2);
    expect(calls[0].audio.deviceId).toEqual({ exact: 'mic-gone' });
    expect('deviceId' in calls[1].audio).toBe(false);
    expect(document.getElementById('voiceStatusText').textContent).toContain('原麦克风不可用');
  });

  it('设备存在但权限被拒 → 不回退，走既有的「去授权」引导', async () => {
    stubDeviceStorage('mic-usb');
    const calls = stubGetUserMedia(() => {
      const err = new Error('denied');
      err.name = 'NotAllowedError';
      throw err;
    });
    await initVoiceInput({ adjustInputHeight: () => {} });

    await toggleVoiceInput();

    expect(isVoiceRecording()).toBe(false);
    expect(calls).toHaveLength(1);
    expect(document.getElementById('voiceStatusText').textContent).toContain('麦克风未授权');
    expect(document.getElementById('voicePermBtn').style.display).not.toBe('none');
  });
});
