// @vitest-environment jsdom
// test/unit/audio-input-device.unit.test.js
// 输入设备模块的纯逻辑契约（配置页列设备 / 侧边栏取流共用同一份语义）：
//   1) '' = 跟随系统默认：不传 deviceId，插拔设备后自动跟随（用户要的「自动」）；
//   2) 选了设备 → exact，浏览器不许悄悄换成别的；
//   3) Chrome 的 default / communications 伪设备不重复列出；
//   4) 选中的设备不可用（拔了 / 被独占）→ 回落系统默认，并把「回退过」告诉调用方。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  VOICE_INPUT_DEVICE_KEY,
  FOLLOW_SYSTEM_DEVICE,
  DEVICE_ENUM_TIMEOUT_MS,
  sanitizeDeviceId,
  buildAudioConstraints,
  listAudioInputDevices,
  probeAudioInputDevices,
  warmupAudioInputDevices,
  hasAudioInputDevice,
  loadSelectedDeviceId,
  saveSelectedDeviceId,
  watchSelectedDeviceId,
  watchAudioInputDevices,
  acquireAudioStream,
} from '../../src/shared/audio-input-device.js';

/** 只注入 navigator，避免依赖 jsdom 的 mediaDevices */
const nav = (mediaDevices) => ({ navigator: { mediaDevices } });
const makeStream = () => ({ getTracks: () => [{ stop() {} }] });
const nameOf = (err, name) => Object.assign(err, { name });

function stubStorage(initial = {}) {
  const store = { ...initial };
  const listeners = [];
  chrome.storage.local = {
    get: async (key) => ({ [key]: store[key] }),
    set: async (obj) => { Object.assign(store, obj); },
  };
  chrome.storage.onChanged = {
    addListener: (fn) => listeners.push(fn),
    removeListener: (fn) => {
      const i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    },
  };
  return { store, listeners };
}

beforeEach(() => {
  stubStorage();
});

describe('sanitizeDeviceId：空值一律等于「跟随系统默认」', () => {
  it('字符串去空白；非字符串归零', () => {
    expect(sanitizeDeviceId('  mic-1 ')).toBe('mic-1');
    expect(sanitizeDeviceId('')).toBe('');
    expect(sanitizeDeviceId('   ')).toBe('');
    expect(sanitizeDeviceId(null)).toBe('');
    expect(sanitizeDeviceId(undefined)).toBe('');
    expect(sanitizeDeviceId(42)).toBe('');
    expect(FOLLOW_SYSTEM_DEVICE).toBe('');
  });
});

describe('buildAudioConstraints：选了才传 deviceId', () => {
  const base = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };

  it('没选设备：只带三个浏览器音频处理，不出现 deviceId', () => {
    const c = buildAudioConstraints('');
    expect(c).toEqual(base);
    expect('deviceId' in c).toBe(false);
  });

  it('选了设备：exact（不允许浏览器悄悄换默认）', () => {
    expect(buildAudioConstraints('mic-usb')).toEqual({
      ...base,
      deviceId: { exact: 'mic-usb' },
    });
  });
});

describe('listAudioInputDevices：只列真实输入设备', () => {
  it('过滤伪设备 / 非输入 / 重复，label 去空白', async () => {
    const list = await listAudioInputDevices(nav({
      enumerateDevices: async () => ([
        { kind: 'audioinput', deviceId: 'default', label: 'Default' },
        { kind: 'audioinput', deviceId: 'communications', label: 'Communications' },
        { kind: 'audioinput', deviceId: 'mic-builtin', label: ' MacBook Pro 麦克风 ' },
        { kind: 'audioinput', deviceId: 'mic-usb', label: 'USB Mic' },
        { kind: 'audioinput', deviceId: 'mic-usb', label: '重复项' },
        { kind: 'videoinput', deviceId: 'cam', label: 'Camera' },
        { kind: 'audiooutput', deviceId: 'spk', label: 'Speaker' },
        { kind: 'audioinput', deviceId: '', label: '' },
      ]),
    }));
    expect(list).toEqual([
      { deviceId: 'mic-builtin', label: 'MacBook Pro 麦克风' },
      { deviceId: 'mic-usb', label: 'USB Mic' },
    ]);
  });

  it('环境不支持 / 枚举抛错 → 空数组（不炸设置页）', async () => {
    expect(await listAudioInputDevices(nav(undefined))).toEqual([]);
    expect(await listAudioInputDevices(nav({}))).toEqual([]);
    expect(await listAudioInputDevices(nav({
      enumerateDevices: async () => { throw nameOf(new Error('boom'), 'NotAllowedError'); },
    }))).toEqual([]);
  });
});

describe('probeAudioInputDevices：列不出来时要说清原因', () => {
  it('正常：返回设备 + 不是超时/不支持', async () => {
    const res = await probeAudioInputDevices(nav({
      enumerateDevices: async () => ([
        { kind: 'audioinput', deviceId: 'mic-usb', label: 'USB Mic' },
      ]),
    }));
    expect(res).toEqual({ devices: [{ deviceId: 'mic-usb', label: 'USB Mic' }], timedOut: false, unsupported: false });
  });

  it('环境没有 mediaDevices → unsupported（不是超时，不是空列表）', async () => {
    expect(await probeAudioInputDevices(nav(undefined))).toEqual({ devices: [], timedOut: false, unsupported: true });
  });

  it('enumerateDevices 永不 resolve（Windows 音频服务半挂）→ 超时兑底，不卡死', async () => {
    // 关键：以前直接 await enumerateDevices，配置页就永远停在「正在读取设备列表」
    const res = await probeAudioInputDevices(nav({ enumerateDevices: () => new Promise(() => {}) }), 20);
    expect(res).toEqual({ devices: [], timedOut: true, unsupported: false });
  });

  it('enumerateDevices 抛错 → 空列表，但不算超时（不能谎报成「服务没就绪」）', async () => {
    const res = await probeAudioInputDevices(nav({
      enumerateDevices: async () => { throw nameOf(new Error('boom'), 'NotAllowedError'); },
    }));
    expect(res).toEqual({ devices: [], timedOut: false, unsupported: false });
  });

  it('默认超时是个有限值（不允许等于 Infinity / 0）', () => {
    expect(Number.isFinite(DEVICE_ENUM_TIMEOUT_MS)).toBe(true);
    expect(DEVICE_ENUM_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('warmupAudioInputDevices：先开一次流再枚举', () => {
  const streamOf = (stopped) => ({ getTracks: () => [{ stop: () => stopped.push(1) }] });

  it('成功开流 → true，并且立刻把轨道停掉（不占着麦克风）', async () => {
    const stopped = [];
    const res = await warmupAudioInputDevices(nav({
      getUserMedia: async () => streamOf(stopped),
    }));
    expect(res).toBe(true);
    expect(stopped).toHaveLength(1);
  });

  it('没 getUserMedia / 被拒绝 → false（不抛错）', async () => {
    expect(await warmupAudioInputDevices(nav(undefined))).toBe(false);
    expect(await warmupAudioInputDevices(nav({}))).toBe(false);
    expect(await warmupAudioInputDevices(nav({
      getUserMedia: async () => { throw nameOf(new Error('denied'), 'NotAllowedError'); },
    }))).toBe(false);
  });

  it('getUserMedia 挂住 → 超时返回 false；迟到的流也要自己收掉', async () => {
    const stopped = [];
    let release;
    const res = await warmupAudioInputDevices(nav({
      getUserMedia: () => new Promise((resolve) => { release = () => resolve(streamOf(stopped)); }),
    }), 20);
    expect(res).toBe(false);
    expect(stopped).toHaveLength(0);
    // 超时之后才 resolve：麦克风不能被一直占着（指示灯会亮）
    release();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(stopped).toHaveLength(1);
  });
});

describe('hasAudioInputDevice：判断设备还在不在', () => {
  const list = [{ deviceId: 'mic-usb', label: 'USB' }];

  it('「跟随系统默认」永远算可用', () => {
    expect(hasAudioInputDevice(list, '')).toBe(true);
    expect(hasAudioInputDevice([], '')).toBe(true);
  });

  it('在列表里才算可用（拔掉的设备不会出现在 enumerateDevices 里）', () => {
    expect(hasAudioInputDevice(list, 'mic-usb')).toBe(true);
    expect(hasAudioInputDevice(list, 'mic-gone')).toBe(false);
    expect(hasAudioInputDevice([], 'mic-usb')).toBe(false);
  });
});

describe('选择持久化：chrome.storage.local[voiceInputDevice]', () => {
  it('存取往返；空串也照样落盘（= 显式回到跟随系统默认）', async () => {
    expect(await loadSelectedDeviceId()).toBe('');
    expect(await saveSelectedDeviceId(' mic-usb ')).toBe('mic-usb');
    expect(await loadSelectedDeviceId()).toBe('mic-usb');
    expect(await saveSelectedDeviceId('')).toBe('');
    expect(await loadSelectedDeviceId()).toBe('');
  });

  it('读失败回落默认、写失败仍返回调用方意图', async () => {
    chrome.storage.local = {
      get: async () => { throw new Error('io'); },
      set: async () => { throw new Error('io'); },
    };
    expect(await loadSelectedDeviceId()).toBe('');
    expect(await saveSelectedDeviceId('mic-usb')).toBe('mic-usb');
  });

  it('watch 只认 local 区域的这个键，可取消', () => {
    const { listeners } = stubStorage();
    const seen = [];
    const off = watchSelectedDeviceId((id) => seen.push(id));
    expect(listeners).toHaveLength(1);

    listeners[0]({ [VOICE_INPUT_DEVICE_KEY]: { newValue: ' mic-usb ' } }, 'local');
    listeners[0]({ [VOICE_INPUT_DEVICE_KEY]: { newValue: 'mic-x' } }, 'sync');
    listeners[0]({ otherKey: { newValue: 'x' } }, 'local');
    expect(seen).toEqual(['mic-usb']);

    off();
    expect(listeners).toHaveLength(0);
  });
});

describe('acquireAudioStream：取流与回落', () => {
  it('选了设备 → 带 exact 取流，不标记回退', async () => {
    const calls = [];
    const stream = makeStream();
    const res = await acquireAudioStream('mic-usb', nav({
      getUserMedia: async (c) => { calls.push(c); return stream; },
    }));
    expect(calls).toHaveLength(1);
    expect(calls[0].audio.deviceId).toEqual({ exact: 'mic-usb' });
    expect(res).toEqual({ stream, fellBack: false, deviceId: 'mic-usb' });
  });

  it('没选设备 → 不带 deviceId（跟随系统默认）', async () => {
    const calls = [];
    await acquireAudioStream('', nav({ getUserMedia: async (c) => { calls.push(c); return makeStream(); } }));
    expect(calls).toHaveLength(1);
    expect('deviceId' in calls[0].audio).toBe(false);
  });

  it.each([
    'OverconstrainedError',
    'NotFoundError',
    'NotReadableError',
  ])('%s（设备拔了 / 被独占）→ 回落系统默认，并标记回退', async (name) => {
    const calls = [];
    const stream = makeStream();
    const res = await acquireAudioStream('mic-gone', nav({
      getUserMedia: async (c) => {
        calls.push(c);
        if (calls.length === 1) throw nameOf(new Error(name), name);
        return stream;
      },
    }));
    expect(calls).toHaveLength(2);
    expect('deviceId' in calls[1].audio).toBe(false);
    expect(res.fellBack).toBe(true);
    expect(res.error).toBe(name);
    expect(res.stream).toBe(stream);
  });

  it('权限未授予（NotAllowedError）不回退，直接把错误抛给调用方', async () => {
    const calls = [];
    await expect(acquireAudioStream('mic-usb', nav({
      getUserMedia: async (c) => {
        calls.push(c);
        throw nameOf(new Error('denied'), 'NotAllowedError');
      },
    }))).rejects.toThrow('denied');
    expect(calls).toHaveLength(1);
  });

  it('跟随系统默认时失败 → 不重试（没有可回退的目标）', async () => {
    const calls = [];
    await expect(acquireAudioStream('', nav({
      getUserMedia: async (c) => {
        calls.push(c);
        throw nameOf(new Error('gone'), 'NotFoundError');
      },
    }))).rejects.toThrow('gone');
    expect(calls).toHaveLength(1);
  });

  it('环境不支持 getUserMedia → NotSupportedError', async () => {
    await expect(acquireAudioStream('mic-usb', nav(undefined))).rejects.toMatchObject({
      name: 'NotSupportedError',
    });
  });
});

describe('watchAudioInputDevices：插拔设备时刷新列表', () => {
  it('devicechange 触发回调；取消后不再触发', () => {
    const handlers = [];
    const media = {
      enumerateDevices: async () => [],
      addEventListener: (type, fn) => { if (type === 'devicechange') handlers.push(fn); },
      removeEventListener: (type, fn) => {
        const i = handlers.indexOf(fn);
        if (i >= 0) handlers.splice(i, 1);
      },
    };
    let hits = 0;
    const off = watchAudioInputDevices(() => { hits += 1; }, nav(media));
    expect(handlers).toHaveLength(1);

    handlers[0]();
    expect(hits).toBe(1);

    off();
    expect(handlers).toHaveLength(0);
  });

  it('环境没有 mediaDevices → 拿到空取消函数', () => {
    const off = watchAudioInputDevices(() => {}, nav(undefined));
    expect(typeof off).toBe('function');
    expect(() => off()).not.toThrow();
  });
});
