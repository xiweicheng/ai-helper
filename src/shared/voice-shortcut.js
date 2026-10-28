// shared/voice-shortcut.js - 语音输入的单键快捷键（右侧 Alt / 右侧 Ctrl）
//
// 为什么单开一层：
//   同一份配置要被三处消费 —— 配置页（勾选）、侧边栏（面板有焦点时）、content script（网页有焦点时）。
//   content script 不能 import 侧边栏模块，配置又必须跨进程实时同步，所以落 chrome.storage.local，
//   判定抽成无 DOM 的纯函数，三处共用一份语义（也便于单测）。
//
// 语义（为什么不是 keydown 直接触发）：
//   单键 = 「按下 → 松开」才算一次触发，在 keyup 结算；按下期间按了别的键就整次作废。
//   部分键盘布局把右 Alt 当 AltGr（Windows 上是 Ctrl+Alt 组合），若 keydown 就触发，
//   用户打一个 AltGr 字符就会误开录音；按住期间有别的 keydown 即作废，正好躲开这类组合输入。
//
// Alt+V 不受此配置影响：它始终可用，这里只决定「额外的单键」开不开。

/** 存储键（chrome.storage.local；content script 与侧边栏都读得到） */
export const VOICE_SHORTCUT_CONFIG_KEY = 'voiceShortcutConfig';

/** 默认全关：单键是加法，不能改变既有习惯 */
export const DEFAULT_VOICE_SHORTCUT_CONFIG = Object.freeze({ rightAlt: false, rightCtrl: false });

/** 可配置的单键（顺序即配置页展示顺序） */
export const VOICE_SHORTCUT_KEYS = Object.freeze(['rightAlt', 'rightCtrl']);

/**
 * 归一化配置：只认两个布尔位，其余字段丢弃。
 * 存储里可能是旧版本残留、手改过的 JSON、undefined（首次运行），一律收敛成完整对象。
 * @param {*} raw
 * @returns {{rightAlt: boolean, rightCtrl: boolean}}
 */
export function sanitizeVoiceShortcutConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    rightAlt: src.rightAlt === true,
    rightCtrl: src.rightCtrl === true,
  };
}

/**
 * 是否至少启用了一个单键（全关时监听器可以直接早退，省掉每次按键的判定）
 * @param {*} cfg
 * @returns {boolean}
 */
export function anyVoiceShortcutEnabled(cfg) {
  const c = sanitizeVoiceShortcutConfig(cfg);
  return c.rightAlt || c.rightCtrl;
}

/**
 * 纯函数：本次 keydown 是否「按下了一个已启用的单键」。
 * 守卫：
 *   - 只认 e.code（布局无关；macOS 上右 Option 的 e.key 是 'Alt'，但某些布局会变）
 *   - 必须「只有它自己」：带别的修饰键不算（右 Alt 在 AltGr 布局上会带 ctrlKey，天然被排除）
 *   - 输入法候选期不认
 * @param {KeyboardEvent|object} e
 * @param {{rightAlt?: boolean, rightCtrl?: boolean}} cfg
 * @returns {'rightAlt'|'rightCtrl'|null}
 */
export function matchSingleKeyDown(e, cfg) {
  if (!e || e.isComposing) return null;
  const c = sanitizeVoiceShortcutConfig(cfg);
  if (c.rightAlt && e.code === 'AltRight' && e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
    return 'rightAlt';
  }
  if (c.rightCtrl && e.code === 'ControlRight' && e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
    return 'rightCtrl';
  }
  return null;
}

/** 键 id → KeyboardEvent.code（松开时要靠它确认是同一个物理键） */
const CODE_BY_KEY = Object.freeze({ rightAlt: 'AltRight', rightCtrl: 'ControlRight' });

/**
 * 单键触发器：把「按下 / 松开」两拍收敛成一次「触发」。
 *
 * 用法（三处调用方式一致）：
 *   const trigger = createSingleKeyTrigger(() => cfg);
 *   keydown: if (trigger.onKeyDown(e) === 'cancel') e.preventDefault();
 *   keyup:   if (trigger.onKeyUp(e) === 'trigger') { e.preventDefault(); toggleVoiceInput(); }
 *
 * 返回值约定：
 *   onKeyDown → 'cancel' 表示「已武装，本次按键应 preventDefault」
 *               （Windows 上裸按 Alt 会聚焦浏览器菜单，不拦会顺带把焦点抢走）
 *   onKeyUp   → 'trigger' 表示「完整的一次单键按下并松开」，调用方去 toggle
 *
 * @param {() => ({rightAlt?: boolean, rightCtrl?: boolean})} getConfig 每次判定现读，配置页改了立刻生效
 */
export function createSingleKeyTrigger(getConfig) {
  const readConfig = typeof getConfig === 'function' ? getConfig : () => DEFAULT_VOICE_SHORTCUT_CONFIG;
  /** @type {{key: string, code: string}|null} */
  let pending = null;

  return {
    onKeyDown(e) {
      if (!e) return null;
      // 按住期间按了别的键：整次作废（AltGr / Ctrl+X 这类组合，绝不能当成语音触发）
      if (pending) {
        if (e.code !== pending.code) pending = null;
        return null;
      }
      const key = matchSingleKeyDown(e, readConfig());
      if (!key) return null;
      pending = { key, code: CODE_BY_KEY[key] };
      return 'cancel';
    },

    onKeyUp(e) {
      if (!pending || !e || e.code !== pending.code) return null;
      const { key } = pending;
      pending = null;
      if (e.isComposing) return null;
      // 松开那一刻再确认一次：按住期间用户可能在配置页把这一项关掉了
      const cfg = sanitizeVoiceShortcutConfig(readConfig());
      if (!cfg[key]) return null;
      return 'trigger';
    },

    /** 窗口失焦等情况下的兜底：丢掉未结算的按下状态，避免下次松开误触发 */
    reset() {
      pending = null;
    },
  };
}

// ==================== 存储读写 ====================

function storageArea() {
  try {
    return globalThis.chrome?.storage?.local || null;
  } catch {
    return null;
  }
}

/**
 * 读取配置（读不到一律回落默认全关：宁可少一个快捷键，也不要突然开始录音）
 * @returns {Promise<{rightAlt: boolean, rightCtrl: boolean}>}
 */
export async function loadVoiceShortcutConfig() {
  const area = storageArea();
  if (!area?.get) return { ...DEFAULT_VOICE_SHORTCUT_CONFIG };
  try {
    const got = await area.get(VOICE_SHORTCUT_CONFIG_KEY);
    return sanitizeVoiceShortcutConfig(got?.[VOICE_SHORTCUT_CONFIG_KEY]);
  } catch {
    return { ...DEFAULT_VOICE_SHORTCUT_CONFIG };
  }
}

/**
 * 写配置（按 key 合并，不覆盖另一个键）
 * @param {{rightAlt?: boolean, rightCtrl?: boolean}} patch
 * @returns {Promise<{rightAlt: boolean, rightCtrl: boolean}>} 落盘后的完整配置
 */
export async function saveVoiceShortcutConfig(patch) {
  const next = sanitizeVoiceShortcutConfig({ ...(await loadVoiceShortcutConfig()), ...(patch || {}) });
  const area = storageArea();
  if (!area?.set) return next;
  try {
    await area.set({ [VOICE_SHORTCUT_CONFIG_KEY]: next });
  } catch {
    /* 存储失败：返回值仍反映调用方意图，下一次写入会重试 */
  }
  return next;
}

/**
 * 监听配置变化（配置页勾选 → 侧边栏与已打开的网页立即生效，无需刷新）
 * @param {(cfg: {rightAlt: boolean, rightCtrl: boolean}) => void} onChange
 * @returns {() => void} 取消监听
 */
export function watchVoiceShortcutConfig(onChange) {
  const listener = (changes, areaName) => {
    if (areaName && areaName !== 'local') return;
    const change = changes?.[VOICE_SHORTCUT_CONFIG_KEY];
    if (!change) return;
    try {
      onChange(sanitizeVoiceShortcutConfig(change.newValue));
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
