// shared/mic-permission.js - 麦克风权限探针 / 申请 / 变更监听
//
// 为什么要单独抽一层：
//   Chrome 的 side panel / popup 里调 getUserMedia 不会弹原生授权框（Chromium 已知限制），
//   只会直接抛 NotAllowedError。只有「标签页形态的扩展页面」（chrome-extension://<id>/options.html）
//   才能弹授权框。授权结果按扩展 origin 记忆，所以在配置页授权一次，侧边栏随后直接可用。
//   本文件只放与 DOM 无关的纯逻辑，依赖可注入，便于单测。

/** 归一化后的权限状态 */
export const MIC_STATES = ['granted', 'prompt', 'denied', 'unknown'];

/**
 * 归一化权限状态
 * @param {*} raw PermissionsStatus 实例或 state 字符串
 * @returns {'granted'|'prompt'|'denied'|'unknown'}
 */
export function normalizeMicState(raw) {
  const value = typeof raw === 'string' ? raw : raw?.state;
  const state = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return MIC_STATES.includes(state) ? state : 'unknown';
}

/**
 * 查询当前 origin 的麦克风权限
 * @param {{navigator?: object}} [deps] 便于单测注入
 * @returns {Promise<'granted'|'prompt'|'denied'|'unknown'>}
 */
export async function queryMicState(deps = {}) {
  try {
    const perms = (deps.navigator ?? globalThis.navigator)?.permissions;
    if (!perms || typeof perms.query !== 'function') return 'unknown';
    return normalizeMicState(await perms.query({ name: 'microphone' }));
  } catch {
    // 老浏览器不认 microphone 这个 name，query 会抛 TypeError：
    // 不能当成「被拒绝」，否则会把用户引到错误的修复路径
    return 'unknown';
  }
}

/**
 * 申请麦克风授权：拿到流后立刻停掉所有轨道（只要授权结果，不占着麦克风）。
 * 必须在标签页形态的扩展页面里调用；侧边栏 / 弹窗里调用会直接失败。
 * @param {{navigator?: object}} [deps]
 * @returns {Promise<{ok: boolean, state: string, error: string}>}
 */
export async function requestMicAccess(deps = {}) {
  const nav = deps.navigator ?? globalThis.navigator;
  const media = nav?.mediaDevices;
  if (!media || typeof media.getUserMedia !== 'function') {
    return { ok: false, state: 'unknown', error: 'unsupported' };
  }
  let stream;
  try {
    stream = await media.getUserMedia({ audio: { channelCount: 1 } });
  } catch (err) {
    const name = err?.name || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      // 用户点「拒绝」→ 状态变 denied；只是关掉弹窗（dismissed）→ 仍是 prompt。
      // 这两种要给不同引导，所以以真实权限状态为准
      const state = await queryMicState(deps);
      return { ok: false, state: state === 'granted' ? 'denied' : state, error: name };
    }
    return { ok: false, state: 'unknown', error: name || 'failed' };
  }
  try {
    stream?.getTracks?.().forEach((track) => track.stop());
  } catch {
    /* 忽略：清理失败不影响「权限已授予」这个结论 */
  }
  return { ok: true, state: 'granted', error: '' };
}

/**
 * 监听权限变化（用户可能在 chrome://extensions 里改了设置）
 * @param {(state: string) => void} onChange
 * @param {{navigator?: object}} [deps]
 * @returns {Promise<() => void>} 取消监听
 */
export async function watchMicState(onChange, deps = {}) {
  try {
    const perms = (deps.navigator ?? globalThis.navigator)?.permissions;
    if (!perms || typeof perms.query !== 'function') return () => {};
    const status = await perms.query({ name: 'microphone' });
    if (!status || typeof status !== 'object') return () => {};
    status.onchange = () => onChange(normalizeMicState(status.state));
    return () => { status.onchange = null; };
  } catch {
    return () => {};
  }
}
