// shared/audio-input-device.js - 语音输入的输入设备（麦克风）选择
//
// 为什么要单独抽一层：
//   配置页负责「列出设备 + 存选择」，侧边栏采集时按存储去取流。两边必须共用同一套语义
//   （'' = 跟随系统默认；选中的设备不可用 → 自动回落默认并告知调用方），
//   否则会出现「配置页显示选了外接麦、实际还在用内置麦」这种静默不一致。
//   本文件只放与 DOM 无关的纯逻辑，依赖可注入，便于单测。
//
// 两个容易踩的点：
//   1) enumerateDevices 在「未授权」时 label 是空串（只能靠 deviceId 区分），
//      所以配置页要先授权再列名字；
//   2) Chrome 自己会造 'default' / 'communications' 两个伪设备，它们和我们的
//      「跟随系统默认」是同一件事，重复列出来只会让用户以为选错了。

export const VOICE_INPUT_DEVICE_KEY = 'voiceInputDevice';

/** 空串 = 跟随系统默认（不传 deviceId，由浏览器交给系统挑默认设备） */
export const FOLLOW_SYSTEM_DEVICE = '';

/** Chrome 的伪设备：语义上等于「系统默认」，不重复列进下拉 */
const PSEUDO_DEVICE_IDS = new Set(['default', 'communications']);

/**
 * 归一化 deviceId（非字符串 / 空白一律视为「跟随系统默认」）
 * @param {*} raw
 * @returns {string}
 */
export function sanitizeDeviceId(raw) {
  return typeof raw === 'string' ? raw.trim() : '';
}

/**
 * 组装 getUserMedia 的 audio 约束
 * - 没选设备：不传 deviceId → 浏览器/系统的默认设备，插拔后自动跟随（用户要的「自动」）
 * - 选了设备：exact → 不允许浏览器悄悄换成别的设备（换默认了要明确回退并提示）
 * @param {string} deviceId
 * @returns {MediaTrackConstraints}
 */
export function buildAudioConstraints(deviceId) {
  const id = sanitizeDeviceId(deviceId);
  const base = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  return id ? { ...base, deviceId: { exact: id } } : base;
}

function mediaDevices(deps) {
  try {
    return (deps.navigator ?? globalThis.navigator)?.mediaDevices || null;
  } catch {
    return null;
  }
}

/**
 * 列出可用的录音输入设备
 * @param {{navigator?: object}} [deps]
 * @returns {Promise<Array<{deviceId: string, label: string}>>} 未授权时 label 为空串
 */
export async function listAudioInputDevices(deps = {}) {
  const media = mediaDevices(deps);
  if (!media || typeof media.enumerateDevices !== 'function') return [];
  let all;
  try {
    all = await media.enumerateDevices();
  } catch {
    return [];
  }
  const seen = new Set();
  const out = [];
  for (const device of Array.isArray(all) ? all : []) {
    if (device?.kind !== 'audioinput') continue;
    const deviceId = sanitizeDeviceId(device.deviceId);
    if (!deviceId || PSEUDO_DEVICE_IDS.has(deviceId) || seen.has(deviceId)) continue;
    seen.add(deviceId);
    out.push({ deviceId, label: typeof device.label === 'string' ? device.label.trim() : '' });
  }
  return out;
}

/**
 * 选中的设备当前是否还在（拔掉 / 被禁用的设备不会再出现在列表里）
 * @param {Array<{deviceId: string}>} list
 * @param {string} deviceId
 */
export function hasAudioInputDevice(list, deviceId) {
  const id = sanitizeDeviceId(deviceId);
  if (!id) return true; // 「跟随系统默认」永远可用
  return (Array.isArray(list) ? list : []).some((d) => d?.deviceId === id);
}

/** enumerateDevices 的超时（Windows 上音频服务半挂时它可能永不 resolve） */
export const DEVICE_ENUM_TIMEOUT_MS = 2500;

const TIMED_OUT = Symbol('device-enum-timeout');

/**
 * 带超时的设备枚举：除了设备列表，还要告诉调用方「为什么列不出来」。
 *
 * 纯返回空数组是不够的：配置页分不清「没插麦克风」「没授权」「枚举卡死」，
 * 只能干看一个「正在读取设备列表…」。Windows 上两种形态都真实存在：
 *   1) 未授权时 enumerateDevices() 可能只给很少甚至空的列表 → 先授权一次再列；
 *   2) 音频服务状态异常（远程桌面 / 驱动半挂）时它可能永不 resolve → 必须超时兑底。
 * @param {{navigator?: object}} [deps]
 * @param {number} [timeoutMs]
 * @returns {Promise<{devices: Array<{deviceId: string, label: string}>, timedOut: boolean, unsupported: boolean}>}
 */
export async function probeAudioInputDevices(deps = {}, timeoutMs = DEVICE_ENUM_TIMEOUT_MS) {
  const media = mediaDevices(deps);
  if (!media || typeof media.enumerateDevices !== 'function') {
    return { devices: [], timedOut: false, unsupported: true };
  }
  const wait = Math.max(0, Number(timeoutMs) || DEVICE_ENUM_TIMEOUT_MS);
  let timer = null;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), wait);
  });
  try {
    const result = await Promise.race([listAudioInputDevices(deps), timeout]);
    if (result === TIMED_OUT) return { devices: [], timedOut: true, unsupported: false };
    return { devices: result, timedOut: false, unsupported: false };
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** getUserMedia 预热开的超时（它和 enumerateDevices 一样可能在 Windows 上挂住） */
export const DEVICE_WARMUP_TIMEOUT_MS = 1500;

/**
 * 用 getUserMedia 唤醒一次音频子系统，拿到流后立刻把轨道停掉（不占着麦克风）。
 *
 * 为什么需要：Windows 上「已授权但音频服务刚启动 / 系统隐私设置半开」时，
 * enumerateDevices() 会一直不 resolve —— 配置页就只能看到「正在读取设备列表」。
 * 先成功开一次流，随后的枚举通常立刻返回（Chrome 自己的设置页也是这个套路）。
 * 只在已授权时作为超时兜底调用；未授权时它会弹授权框，不该在后台偷偷触发。
 *
 * @param {{navigator?: object}} [deps]
 * @param {number} [timeoutMs]
 * @returns {Promise<boolean>} 是否成功开过一次流
 */
export async function warmupAudioInputDevices(deps = {}, timeoutMs = DEVICE_WARMUP_TIMEOUT_MS) {
  const media = mediaDevices(deps);
  if (!media || typeof media.getUserMedia !== 'function') return false;
  const wait = Math.max(0, Number(timeoutMs) || DEVICE_WARMUP_TIMEOUT_MS);
  const stop = (stream) => {
    try {
      stream?.getTracks?.().forEach((track) => track.stop());
    } catch {
      /* 清理失败不影响「唤起过」这个结论 */
    }
  };
  // 超时之后才迟到的流必须自己收掉，否则麦克风指示灯会一直亮着
  let done = false;
  let stream = null;
  let timer = null;
  const opening = Promise.resolve()
    .then(() => media.getUserMedia({ audio: true }))
    .then((got) => {
      if (done) stop(got);
      else stream = got;
      return Boolean(got);
    })
    .catch(() => false);
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), wait);
  });
  let ok;
  try {
    ok = await Promise.race([opening, timeout]);
  } finally {
    if (timer !== null) clearTimeout(timer);
    done = true;
    stop(stream);
    stream = null;
  }
  return ok === true;
}

function storageArea() {
  try {
    return globalThis.chrome?.storage?.local || null;
  } catch {
    return null;
  }
}

/**
 * 读用户选择（读不到一律回落「跟随系统默认」：宁可自动挑，也不要卡死在某个设备上）
 * @returns {Promise<string>}
 */
export async function loadSelectedDeviceId() {
  const area = storageArea();
  if (!area?.get) return FOLLOW_SYSTEM_DEVICE;
  try {
    const got = await area.get(VOICE_INPUT_DEVICE_KEY);
    return sanitizeDeviceId(got?.[VOICE_INPUT_DEVICE_KEY]);
  } catch {
    return FOLLOW_SYSTEM_DEVICE;
  }
}

/**
 * 写用户选择
 * @param {string} deviceId 空串 = 跟随系统默认
 * @returns {Promise<string>} 落盘后的值
 */
export async function saveSelectedDeviceId(deviceId) {
  const next = sanitizeDeviceId(deviceId);
  const area = storageArea();
  if (!area?.set) return next;
  try {
    await area.set({ [VOICE_INPUT_DEVICE_KEY]: next });
  } catch {
    /* 存储失败：返回调用方意图，下一次写入会重试 */
  }
  return next;
}

/**
 * 监听选择变化（配置页改完 → 已打开的面板下次开录直接生效）
 * @param {(deviceId: string) => void} onChange
 * @returns {() => void} 取消监听
 */
export function watchSelectedDeviceId(onChange) {
  const listener = (changes, areaName) => {
    if (areaName && areaName !== 'local') return;
    if (!changes?.[VOICE_INPUT_DEVICE_KEY]) return;
    try {
      onChange(sanitizeDeviceId(changes[VOICE_INPUT_DEVICE_KEY].newValue));
    } catch {
      /* 回调里出错不应该影响其它监听者 */
    }
  };
  try {
    globalThis.chrome?.storage?.onChanged?.addListener?.(listener);
  } catch {
    return () => {};
  }
  return () => {
    try {
      globalThis.chrome?.storage?.onChanged?.removeListener?.(listener);
    } catch {
      /* 忽略 */
    }
  };
}

/**
 * 监听设备插拔（USB 麦克风插入 / 蓝牙耳机连接后要让下拉列表跟着变）
 * @param {() => void} onChange
 * @param {{navigator?: object}} [deps]
 * @returns {() => void} 取消监听
 */
export function watchAudioInputDevices(onChange, deps = {}) {
  const media = mediaDevices(deps);
  if (!media || typeof media.addEventListener !== 'function') return () => {};
  const handler = () => {
    try {
      onChange();
    } catch {
      /* 忽略 */
    }
  };
  try {
    media.addEventListener('devicechange', handler);
  } catch {
    return () => {};
  }
  return () => {
    try {
      media.removeEventListener('devicechange', handler);
    } catch {
      /* 忽略 */
    }
  };
}

/**
 * 按用户选择取一条音频流，选中的设备不可用时自动回落系统默认。
 *
 * 为什么不在失败时直接抛：设备是外设，拔一下、被别的程序独占、蓝牙断一下都很常见，
 * 让「语音输入整个不可用」代价太大。回退是显式的（fellBack），调用方要提示用户，
 * 否则就成了静默换设备。
 *
 * @param {string} deviceId 空串 = 跟随系统默认
 * @param {{navigator?: object}} [deps]
 * @returns {Promise<{stream: MediaStream, fellBack: boolean, deviceId: string, error?: string}>}
 */
export async function acquireAudioStream(deviceId, deps = {}) {
  const media = mediaDevices(deps);
  if (!media || typeof media.getUserMedia !== 'function') {
    const err = new Error('unsupported');
    err.name = 'NotSupportedError';
    throw err;
  }
  const want = sanitizeDeviceId(deviceId);
  try {
    const stream = await media.getUserMedia({ audio: buildAudioConstraints(want) });
    return { stream, fellBack: false, deviceId: want };
  } catch (err) {
    const name = err?.name || '';
    // OverconstrainedError：exact 的 deviceId 不存在；NotFoundError：设备刚被拔；
    // NotReadableError：设备被独占/驱动异常。这三种都值得退回默认再试一次。
    const recoverable = name === 'OverconstrainedError' || name === 'NotFoundError' || name === 'NotReadableError';
    if (!want || !recoverable) throw err;
    const stream = await media.getUserMedia({ audio: buildAudioConstraints(FOLLOW_SYSTEM_DEVICE) });
    return { stream, fellBack: true, deviceId: FOLLOW_SYSTEM_DEVICE, error: name };
  }
}
