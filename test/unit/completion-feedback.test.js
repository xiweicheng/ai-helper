// @vitest-environment jsdom
// completion-feedback 单元测试：验证开关、节流、reduced-motion 与错误兜底
// 不等待动画完成，只验证同步触发的副作用（AudioContext / Canvas 构造）

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// ============ Mock 全局环境（必须在 import 之前完成）============

let storageData = {};
let audioContextCount = 0;
let canvasGetContextCount = 0;
let prefersReducedMotion = false;

// Mock chrome.storage.local
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        for (const k of keys) {
          if (k in storageData) result[k] = storageData[k];
        }
        if (typeof cb === 'function') cb(result);
        return Promise.resolve(result);
      },
      set: (obj, cb) => {
        Object.assign(storageData, obj);
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      },
    },
    onChanged: { addListener: () => {} },
  },
  runtime: { lastError: null, getURL: (p) => p, sendMessage: () => Promise.resolve({}) },
};

// Mock AudioContext：只记录构造次数，返回可用的 stub
class MockAudioContext {
  constructor() {
    audioContextCount++;
    this.currentTime = 0;
    this.state = 'running';
    this.destination = {};
  }
  createOscillator() {
    return {
      type: '', frequency: { value: 0 },
      connect: () => {}, start: () => {}, stop: () => {},
    };
  }
  createGain() {
    return {
      gain: {
        setValueAtTime: () => {},
        exponentialRampToValueAtTime: () => {},
      },
      connect: () => {},
    };
  }
  resume() { return Promise.resolve(); }
  close() { return Promise.resolve(); }
}
globalThis.window = globalThis.window || {};
window.AudioContext = MockAudioContext;

// Mock Canvas getContext：返回可用的 2D context stub
HTMLCanvasElement.prototype.getContext = function () {
  canvasGetContextCount++;
  return {
    scale: () => {},
    clearRect: () => {},
    save: () => {}, restore: () => {},
    translate: () => {}, rotate: () => {},
    fillRect: () => {}, beginPath: () => {}, arc: () => {}, fill: () => {},
    fillStyle: '', globalAlpha: 1,
  };
};

// Mock matchMedia
window.matchMedia = (query) => ({
  matches: query.includes('prefers-reduced-motion') ? prefersReducedMotion : false,
  media: query,
  addListener: () => {}, removeListener: () => {},
  addEventListener: () => {}, removeEventListener: () => {},
});

// Mock requestAnimationFrame：不真的调度，避免测试挂起
window.requestAnimationFrame = () => 0;
window.cancelAnimationFrame = () => {};

// jsdom 没有 innerWidth/innerHeight，赋默认值
Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
Object.defineProperty(window, 'innerHeight', { value: 600, writable: true });
Object.defineProperty(window, 'devicePixelRatio', { value: 1, writable: true });

// ============ 动态导入被测模块 ============

let mod;
beforeEach(async () => {
  storageData = {};
  audioContextCount = 0;
  canvasGetContextCount = 0;
  prefersReducedMotion = false;
  document.body.innerHTML = '';
  // 每次重新导入以获得干净的模块级 _lastPlayedAt
  vi.resetModules();
  mod = await import('../../src/side_panel/completion-feedback.js');
});

afterEach(() => {
  vi.useRealTimers();
});

// ============ 测试用例 ============

describe('playCompletionFeedback 开关组合', () => {
  test('两个开关都为 true 时：音效与彩带均触发', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    await mod.playCompletionFeedback();
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(1);
    expect(document.querySelectorAll('canvas').length).toBe(1);
  });

  test('仅声音开关为 true：只触发音效', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: false };
    await mod.playCompletionFeedback();
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(0);
    expect(document.querySelectorAll('canvas').length).toBe(0);
  });

  test('仅彩带开关为 true：只触发彩带', async () => {
    storageData = { completionSoundEnabled: false, completionConfettiEnabled: true };
    await mod.playCompletionFeedback();
    expect(audioContextCount).toBe(0);
    expect(canvasGetContextCount).toBe(1);
  });

  test('两个都为 false：均不触发', async () => {
    storageData = { completionSoundEnabled: false, completionConfettiEnabled: false };
    await mod.playCompletionFeedback();
    expect(audioContextCount).toBe(0);
    expect(canvasGetContextCount).toBe(0);
  });

  test('未设置存储（undefined）：默认按 true 处理', async () => {
    storageData = {}; // 空对象，两个键都不存在
    await mod.playCompletionFeedback();
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(1);
  });
});

describe('playCompletionFeedback 节流机制', () => {
  test('500ms 内连续两次调用：第二次被节流跳过', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    await mod.playCompletionFeedback();
    await mod.playCompletionFeedback();
    // 节流生效，只触发一次
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(1);
  });

  test('_resetThrottleForTest 可清除节流状态', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    await mod.playCompletionFeedback();
    mod._resetThrottleForTest();
    await mod.playCompletionFeedback();
    expect(audioContextCount).toBe(2);
    expect(canvasGetContextCount).toBe(2);
  });
});

describe('playCompletionFeedback 可访问性', () => {
  test('prefers-reduced-motion: reduce 时：跳过彩带但仍播放音效', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    prefersReducedMotion = true;
    await mod.playCompletionFeedback();
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(0);
  });
});

describe('playCompletionFeedback 异常兜底', () => {
  test('音效抛异常不影响主流程', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    // 临时替换 AudioContext 使其抛错
    const OriginalAudio = window.AudioContext;
    window.AudioContext = function () { throw new Error('audio boom'); };
    await expect(mod.playCompletionFeedback()).resolves.toBeUndefined();
    window.AudioContext = OriginalAudio;
    // 彩带仍应触发（音效失败不影响彩带）
    expect(canvasGetContextCount).toBe(1);
  });

  test('彩带抛异常不影响主流程', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    // 临时替换 getContext 使其抛错
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function () { throw new Error('canvas boom'); };
    await expect(mod.playCompletionFeedback()).resolves.toBeUndefined();
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    // 音效应已触发（彩带失败不影响音效）
    expect(audioContextCount).toBe(1);
  });

  test('chrome.storage 抛异常时使用默认值（都开启）', async () => {
    // 临时替换 chrome.storage.local.get 使其抛错
    const originalGet = chrome.storage.local.get;
    chrome.storage.local.get = () => { throw new Error('storage boom'); };
    await expect(mod.playCompletionFeedback()).resolves.toBeUndefined();
    chrome.storage.local.get = originalGet;
    // 兜底默认开启两者
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(1);
  });
});

describe('playFailureFeedback 行为验证', () => {
  test('声音开关 true + 彩带开关 true：仅播放音效，不播放彩带', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    await mod.playFailureFeedback();
    expect(audioContextCount).toBe(1);
    // 关键：失败反馈不应触发彩带（无论 confettiEnabled 开关如何）
    expect(canvasGetContextCount).toBe(0);
    expect(document.querySelectorAll('canvas').length).toBe(0);
  });

  test('声音开关 false：不播放音效（也不播放彩带）', async () => {
    storageData = { completionSoundEnabled: false, completionConfettiEnabled: true };
    await mod.playFailureFeedback();
    expect(audioContextCount).toBe(0);
    expect(canvasGetContextCount).toBe(0);
  });

  test('未设置存储（undefined）：默认按 true 处理，播放音效', async () => {
    storageData = {};
    await mod.playFailureFeedback();
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(0);
  });

  test('prefers-reduced-motion 不影响失败音效（本就不播放彩带）', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    prefersReducedMotion = true;
    await mod.playFailureFeedback();
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(0);
  });

  test('音效抛异常不影响主流程', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    const OriginalAudio = window.AudioContext;
    window.AudioContext = function () { throw new Error('audio boom'); };
    await expect(mod.playFailureFeedback()).resolves.toBeUndefined();
    window.AudioContext = OriginalAudio;
  });
});

describe('成功与失败反馈共享节流', () => {
  test('成功反馈后立即调用失败反馈：后者被节流跳过', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    await mod.playCompletionFeedback();
    await mod.playFailureFeedback();
    // 只成功反馈触发了音效与彩带
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(1);
  });

  test('失败反馈后立即调用成功反馈：后者被节流跳过', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    await mod.playFailureFeedback();
    await mod.playCompletionFeedback();
    // 只失败反馈触发了音效，彩带未触发
    expect(audioContextCount).toBe(1);
    expect(canvasGetContextCount).toBe(0);
  });

  test('_resetThrottleForTest 可清除共享节流状态', async () => {
    storageData = { completionSoundEnabled: true, completionConfettiEnabled: true };
    await mod.playCompletionFeedback();
    mod._resetThrottleForTest();
    await mod.playFailureFeedback();
    // 两次都触发音效（成功 + 失败），但彩带只成功时触发一次
    expect(audioContextCount).toBe(2);
    expect(canvasGetContextCount).toBe(1);
  });
});
