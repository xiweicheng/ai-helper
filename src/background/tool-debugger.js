// tool-debugger.js - debug_page 工具执行器
// 统一入口 executeDebugPage，按 action 分发：
// attach / detach / evaluate / input / network / screenshot / emulate

import { makeResult } from './tool-helpers.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { triggerScreenshotDownload } from './tool-screenshot.js';
import {
  attach as dbgAttach, detach as dbgDetach, cdp, isAttached,
  startNetworkCapture, collectNetwork, stopNetworkCapture,
  DebuggerNotAttachedError, RestrictedPageError,
} from './debugger/debugger-session.js';

registerTranslations('zh', {
  toolDebugger: {
    missingAction: '缺少 action 参数',
    unknownAction: '不支持的 action: {action}',
    noTab: '未找到可调试的标签页',
    attachSuccess: '已附着到标签页 {tabId}，调试会话已开启。\n注意：该标签页顶部会显示"扩展程序正在调试此浏览器"提示条，调试结束后请调用 action=detach 关闭；空闲 2 分钟也会自动脱离。受限页面（chrome://、扩展商店等）无法调试。',
    attachReused: '标签页 {tabId} 的调试会话已存在，直接复用。',
    detachSuccess: '已脱离标签页 {tabId}，调试会话关闭，提示条已消除。',
    notAttached: '调试会话不存在或已结束（可能用户取消了调试、打开了 DevTools 或页面已关闭）。请先调用 action=attach 重新附着。',
    restrictedPage: '无法调试受限页面（{url}）。chrome://、扩展商店、PDF 阅读器等浏览器内部页面不允许调试，请切换到普通网页。',
    attachFailed: '附着调试器失败: {error}',
    commandFailed: 'CDP 命令 {method} 执行失败: {error}',
    evaluateMissing: 'action=evaluate 需要 expression 参数',
    evaluateException: '页面脚本执行抛出异常:\n{error}',
    evaluateEmpty: '执行完成（无返回值）',
    evaluateTruncated: '\n...[返回值过长，已截断，共 {length} 字符]',
    inputMissingType: 'action=input 需要 inputType 参数（click/type/press/scroll）',
    clickNeedTarget: 'click 需要 selector 或 x/y 参数来定位点击位置',
    selectorNotFound: '未找到匹配 selector 的元素: {selector}',
    typeNeedText: 'type 需要 text 参数（并用 selector 指定目标输入元素）',
    pressNeedKey: 'press 需要 key 参数，如 "Enter"、"Tab"、"Control+a"',
    unknownKey: '无法识别的按键: {key}',
    inputDone: '已派发原生 {kind} 事件到标签页 {tabId}。',
    networkMissingMode: 'action=network 需要 networkMode 参数（start/collect/stop）',
    networkStarted: '已开始录制网络请求{filter}。操作页面后调用 networkMode=collect 取回结果（含响应体，单条最多 20KB，最多 100 条）。',
    networkEmpty: '缓冲区中没有新的网络请求。可先执行页面操作，再调用 collect。',
    networkCollected: '录制到 {count} 条网络请求（JSON）：\n{json}',
    networkStopped: '网络录制已停止，剩余 {count} 条请求（JSON）：\n{json}',
    networkStoppedEmpty: '网络录制已停止，缓冲区为空。',
    screenshotDone: '截图完成（{mode}，{size}，{format}，约 {sizeKB} KB），已下载到浏览器默认下载目录。',
    modeViewport: '可视区域',
    modeFullPage: '整页',
    modeElement: '指定元素',
    screenshotFailed: '截图失败: {error}',
    emulateMissingTarget: 'action=emulate 需要 emulateTarget 参数（ua/viewport/geolocation/timezone/colorScheme/reset）',
    emulateUaNeedValue: 'target=ua 需要 userAgent 参数',
    emulateViewportNeedSize: 'target=viewport 需要 viewportWidth 和 viewportHeight 参数',
    emulateGeoNeedValue: 'target=geolocation 需要 latitude 和 longitude 参数',
    emulateTzNeedValue: 'target=timezone 需要 timezoneId 参数',
    emulateColorNeedValue: 'target=colorScheme 需要 colorScheme 参数（dark/light）',
    emulateApplied: '已应用模拟设置: {target}。调用 target=reset 或 detach 后还原。',
    emulateReset: '已清除全部模拟设置（UA / 视口 / 地理位置 / 时区 / 配色）。',
  },
});

registerTranslations('en', {
  toolDebugger: {
    missingAction: 'Missing action parameter',
    unknownAction: 'Unsupported action: {action}',
    noTab: 'No debuggable tab found',
    attachSuccess: 'Attached to tab {tabId}, debugger session started.\nNote: a yellow "extension is debugging this browser" infobar appears on the tab until action=detach is called; it also auto-detaches after 2 minutes idle. Restricted pages (chrome://, extension stores, etc.) cannot be debugged.',
    attachReused: 'A debugger session for tab {tabId} already exists, reusing it.',
    detachSuccess: 'Detached from tab {tabId}; session closed and infobar removed.',
    notAttached: 'Debugger session does not exist or has ended (the user may have canceled it, DevTools took over, or the tab closed). Call action=attach again first.',
    restrictedPage: 'Cannot debug a restricted page ({url}). Browser internal pages such as chrome://, extension stores and the PDF viewer are not debuggable. Switch to a normal web page.',
    attachFailed: 'Failed to attach debugger: {error}',
    commandFailed: 'CDP command {method} failed: {error}',
    evaluateMissing: 'action=evaluate requires the expression parameter',
    evaluateException: 'Page script threw an exception:\n{error}',
    evaluateEmpty: 'Execution finished (no return value)',
    evaluateTruncated: '\n...[return value too long, truncated; total {length} chars]',
    inputMissingType: 'action=input requires inputType (click/type/press/scroll)',
    clickNeedTarget: 'click requires a selector or x/y coordinates',
    selectorNotFound: 'No element matched selector: {selector}',
    typeNeedText: 'type requires text (and a selector for the target input element)',
    pressNeedKey: 'press requires a key, e.g. "Enter", "Tab", "Control+a"',
    unknownKey: 'Unrecognized key: {key}',
    inputDone: 'Dispatched native {kind} event to tab {tabId}.',
    networkMissingMode: 'action=network requires networkMode (start/collect/stop)',
    networkStarted: 'Network recording started{filter}. Interact with the page, then call networkMode=collect to fetch results (includes response bodies, up to 20KB each and 100 entries).',
    networkEmpty: 'No new network requests buffered. Perform some page actions and call collect again.',
    networkCollected: 'Recorded {count} network requests (JSON):\n{json}',
    networkStopped: 'Network recording stopped; {count} remaining requests (JSON):\n{json}',
    networkStoppedEmpty: 'Network recording stopped; buffer was empty.',
    screenshotDone: 'Screenshot captured ({mode}, {size}, {format}, ~{sizeKB} KB) and downloaded to the browser default download directory.',
    modeViewport: 'viewport',
    modeFullPage: 'full page',
    modeElement: 'element',
    screenshotFailed: 'Screenshot failed: {error}',
    emulateMissingTarget: 'action=emulate requires emulateTarget (ua/viewport/geolocation/timezone/colorScheme/reset)',
    emulateUaNeedValue: 'target=ua requires userAgent',
    emulateViewportNeedSize: 'target=viewport requires viewportWidth and viewportHeight',
    emulateGeoNeedValue: 'target=geolocation requires latitude and longitude',
    emulateTzNeedValue: 'target=timezone requires timezoneId',
    emulateColorNeedValue: 'target=colorScheme requires colorScheme (dark/light)',
    emulateApplied: 'Emulation applied: {target}. Use target=reset or detach to revert.',
    emulateReset: 'All emulation overrides cleared (UA / viewport / geolocation / timezone / color scheme).',
  },
});

const EVAL_RESULT_LIMIT = 30000;

// CDP 键盘修饰符位掩码
const KEY_MODIFIERS = { Alt: 1, Control: 2, Ctrl: 2, Meta: 4, Command: 4, Cmd: 4, Shift: 8 };
const SPECIAL_KEYS = {
  Enter: { keyCode: 13, code: 'Enter' },
  Tab: { keyCode: 9, code: 'Tab' },
  Escape: { keyCode: 27, code: 'Escape' },
  Esc: { keyCode: 27, code: 'Escape' },
  Backspace: { keyCode: 8, code: 'Backspace' },
  Delete: { keyCode: 46, code: 'Delete' },
  Space: { keyCode: 32, code: 'Space' },
  Home: { keyCode: 36, code: 'Home' },
  End: { keyCode: 35, code: 'End' },
  PageUp: { keyCode: 33, code: 'PageUp' },
  PageDown: { keyCode: 34, code: 'PageDown' },
  ArrowLeft: { keyCode: 37, code: 'ArrowLeft' },
  ArrowUp: { keyCode: 38, code: 'ArrowUp' },
  ArrowRight: { keyCode: 39, code: 'ArrowRight' },
  ArrowDown: { keyCode: 40, code: 'ArrowDown' },
  Insert: { keyCode: 45, code: 'Insert' },
};
for (let i = 1; i <= 12; i++) SPECIAL_KEYS[`F${i}`] = { keyCode: 111 + i, code: `F${i}` };

async function getActiveTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs.length > 0 ? tabs[0].id : null;
}

/**
 * 在页面主世界求值并返回 JS 值（returnByValue）
 */
async function evaluateJson(tabId, expression) {
  const res = await cdp(tabId, 'Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
    userGesture: true,
  });
  if (res.exceptionDetails) {
    const exc = res.exceptionDetails.exception?.description
      || res.exceptionDetails.text
      || 'Unknown error';
    throw new Error(exc);
  }
  return res.result?.value;
}

// ───────────────────────── action 实现 ─────────────────────────

async function handleAttach(args, tabId) {
  try {
    const { reused } = await dbgAttach(tabId);
    return makeResult(true, t(reused ? 'toolDebugger.attachReused' : 'toolDebugger.attachSuccess', { tabId }), { tool_call_id: args.__toolCallId });
  } catch (e) {
    if (e instanceof RestrictedPageError) {
      return makeResult(false, t('toolDebugger.restrictedPage', { url: e.url }), { tool_call_id: args.__toolCallId });
    }
    return makeResult(false, t('toolDebugger.attachFailed', { error: e.message }), { tool_call_id: args.__toolCallId });
  }
}

async function handleDetach(args, tabId) {
  await dbgDetach(tabId).catch(() => {});
  return makeResult(true, t('toolDebugger.detachSuccess', { tabId }), { tool_call_id: args.__toolCallId });
}

async function handleEvaluate(args, tabId) {
  const expression = args.expression;
  if (!expression || typeof expression !== 'string') {
    return makeResult(false, t('toolDebugger.evaluateMissing'), { tool_call_id: args.__toolCallId });
  }
  try {
    const value = await evaluateJson(tabId, expression);
    let content;
    if (value === undefined) {
      content = t('toolDebugger.evaluateEmpty');
    } else {
      content = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      if (content.length > EVAL_RESULT_LIMIT) {
        content = content.slice(0, EVAL_RESULT_LIMIT) + t('toolDebugger.evaluateTruncated', { length: content.length });
      }
    }
    return makeResult(true, content, { tool_call_id: args.__toolCallId });
  } catch (e) {
    if (e instanceof DebuggerNotAttachedError) {
      return makeResult(false, t('toolDebugger.notAttached'), { tool_call_id: args.__toolCallId });
    }
    return makeResult(false, t('toolDebugger.evaluateException', { error: e.message }), { tool_call_id: args.__toolCallId });
  }
}

async function resolveClickPoint(tabId, args) {
  if (args.selector) {
    const expr = `(function(s){
      var el = document.querySelector(s);
      if (!el) return null;
      var r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };
    })(${JSON.stringify(args.selector)})`;
    const rect = await evaluateJson(tabId, expr);
    if (!rect || rect.w === 0) {
      return { error: t('toolDebugger.selectorNotFound', { selector: args.selector }) };
    }
    return { x: rect.x, y: rect.y };
  }
  if (typeof args.x === 'number' && typeof args.y === 'number') {
    return { x: args.x, y: args.y };
  }
  return { error: t('toolDebugger.clickNeedTarget') };
}

function parseKeySpec(keySpec) {
  const parts = String(keySpec).split('+').map(s => s.trim());
  const main = parts.pop() || '';
  let modifiers = 0;
  for (const m of parts) {
    const bit = KEY_MODIFIERS[m];
    if (!bit) return null;
    modifiers |= bit;
  }
  // 特殊键
  const special = SPECIAL_KEYS[main];
  if (special) return { key: main === 'Esc' ? 'Escape' : main, code: special.code, keyCode: special.keyCode, modifiers };
  // 单字符
  if (main.length === 1) {
    const upper = main.toUpperCase();
    const keyCode = upper.charCodeAt(0);
    let code;
    if (/[A-Z]/.test(upper)) code = `Key${upper}`;
    else if (/[0-9]/.test(upper)) code = `Digit${upper}`;
    else code = '';
    return { key: main, code, keyCode, modifiers };
  }
  return null;
}

async function handleInput(args, tabId) {
  const toolCallId = args.__toolCallId;
  const inputType = args.inputType;
  if (!inputType) {
    return makeResult(false, t('toolDebugger.inputMissingType'), { tool_call_id: toolCallId });
  }
  try {
    switch (inputType) {
      case 'click': {
        const point = await resolveClickPoint(tabId, args);
        if (point.error) return makeResult(false, point.error, { tool_call_id: toolCallId });
        const { x, y } = point;
        await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
        await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
        await cdp(tabId, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
        return makeResult(true, t('toolDebugger.inputDone', { kind: 'click', tabId }), { tool_call_id: toolCallId });
      }
      case 'type': {
        if (!args.text) return makeResult(false, t('toolDebugger.typeNeedText'), { tool_call_id: toolCallId });
        if (args.selector) {
          await evaluateJson(tabId, `(function(s){ var el = document.querySelector(s); if (el) el.focus(); return !!el; })(${JSON.stringify(args.selector)})`);
        }
        await cdp(tabId, 'Input.insertText', { text: String(args.text) });
        return makeResult(true, t('toolDebugger.inputDone', { kind: 'type', tabId }), { tool_call_id: toolCallId });
      }
      case 'press': {
        if (!args.key) return makeResult(false, t('toolDebugger.pressNeedKey'), { tool_call_id: toolCallId });
        const spec = parseKeySpec(args.key);
        if (!spec) return makeResult(false, t('toolDebugger.unknownKey', { key: args.key }), { tool_call_id: toolCallId });
        const base = {
          key: spec.key,
          code: spec.code || undefined,
          windowsVirtualKeyCode: spec.keyCode,
          nativeVirtualKeyCode: spec.keyCode,
          modifiers: spec.modifiers,
        };
        await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyDown', ...base });
        await cdp(tabId, 'Input.dispatchKeyEvent', { type: 'keyUp', ...base });
        return makeResult(true, t('toolDebugger.inputDone', { kind: `key:${args.key}`, tabId }), { tool_call_id: toolCallId });
      }
      case 'scroll': {
        let x = typeof args.x === 'number' ? args.x : null;
        let y = typeof args.y === 'number' ? args.y : null;
        if (x === null || y === null) {
          const center = await evaluateJson(tabId, '({ x: window.innerWidth / 2, y: window.innerHeight / 2 })');
          x = center.x; y = center.y;
        }
        const deltaX = typeof args.deltaX === 'number' ? args.deltaX : 0;
        const deltaY = typeof args.deltaY === 'number' ? args.deltaY : 300;
        await cdp(tabId, 'Input.dispatchMouseEvent', {
          type: 'mouseWheel', x, y, deltaX, deltaY, button: 'none', buttons: 0,
        });
        return makeResult(true, t('toolDebugger.inputDone', { kind: 'scroll', tabId }), { tool_call_id: toolCallId });
      }
      default:
        return makeResult(false, t('toolDebugger.unknownAction', { action: inputType }), { tool_call_id: toolCallId });
    }
  } catch (e) {
    if (e instanceof DebuggerNotAttachedError) {
      return makeResult(false, t('toolDebugger.notAttached'), { tool_call_id: toolCallId });
    }
    return makeResult(false, t('toolDebugger.commandFailed', { method: 'Input/Runtime', error: e.message }), { tool_call_id: toolCallId });
  }
}

async function handleNetwork(args, tabId) {
  const toolCallId = args.__toolCallId;
  const mode = args.networkMode;
  if (!mode) return makeResult(false, t('toolDebugger.networkMissingMode'), { tool_call_id: toolCallId });
  try {
    if (mode === 'start') {
      startNetworkCapture(tabId, args.filterUrl || '');
      const filter = args.filterUrl ? `（过滤: ${args.filterUrl}）` : '';
      return makeResult(true, t('toolDebugger.networkStarted', { filter }), { tool_call_id: toolCallId });
    }
    if (mode === 'collect') {
      const entries = collectNetwork(tabId);
      if (entries.length === 0) return makeResult(true, t('toolDebugger.networkEmpty'), { tool_call_id: toolCallId });
      return makeResult(true, t('toolDebugger.networkCollected', { count: entries.length, json: JSON.stringify(entries, null, 2) }), { tool_call_id: toolCallId });
    }
    if (mode === 'stop') {
      const entries = stopNetworkCapture(tabId);
      if (entries.length === 0) return makeResult(true, t('toolDebugger.networkStoppedEmpty'), { tool_call_id: toolCallId });
      return makeResult(true, t('toolDebugger.networkStopped', { count: entries.length, json: JSON.stringify(entries, null, 2) }), { tool_call_id: toolCallId });
    }
    return makeResult(false, t('toolDebugger.unknownAction', { action: mode }), { tool_call_id: toolCallId });
  } catch (e) {
    if (e instanceof DebuggerNotAttachedError) {
      return makeResult(false, t('toolDebugger.notAttached'), { tool_call_id: toolCallId });
    }
    return makeResult(false, t('toolDebugger.commandFailed', { method: 'Network', error: e.message }), { tool_call_id: toolCallId });
  }
}

async function handleScreenshot(args, tabId) {
  const toolCallId = args.__toolCallId;
  const format = args.imageFormat === 'jpeg' ? 'jpeg' : 'png';
  try {
    let clip = null;
    let mode = 'viewport';

    if (args.selector) {
      // 元素截图：取绝对布局坐标，支持视口外元素
      const expr = `(function(s){
        var el = document.querySelector(s);
        if (!el) return null;
        var r = el.getBoundingClientRect();
        return {
          x: r.left + window.scrollX, y: r.top + window.scrollY,
          width: r.width, height: r.height
        };
      })(${JSON.stringify(args.selector)})`;
      const box = await evaluateJson(tabId, expr);
      if (!box || !box.width || !box.height) {
        return makeResult(false, t('toolDebugger.selectorNotFound', { selector: args.selector }), { tool_call_id: toolCallId });
      }
      clip = { ...box, scale: 1 };
      mode = 'element';
    } else if (args.fullPage) {
      const metrics = await cdp(tabId, 'Page.getLayoutMetrics');
      const cs = metrics.contentSize || {};
      clip = { x: cs.x || 0, y: cs.y || 0, width: cs.width, height: cs.height, scale: 1 };
      mode = 'fullPage';
    }

    const params = { format };
    if (format === 'jpeg') params.quality = Math.min(100, Math.max(1, args.quality || 80));
    if (clip) {
      params.clip = clip;
      params.captureBeyondViewport = true;
    }
    const shot = await cdp(tabId, 'Page.captureScreenshot', params);
    const dataUrl = `data:image/${format};base64,${shot.data}`;
    triggerScreenshotDownload(dataUrl, format);

    const modeLabel = t(`toolDebugger.mode${mode === 'fullPage' ? 'FullPage' : mode === 'element' ? 'Element' : 'Viewport'}`);
    const sizeText = clip
      ? `${Math.round(clip.width)}×${Math.round(clip.height)}`
      : await evaluateJson(tabId, 'window.innerWidth + "\\u00d7" + window.innerHeight');

    return makeResult(true, t('toolDebugger.screenshotDone', {
      mode: modeLabel,
      size: sizeText,
      format,
      sizeKB: (shot.data.length / 1024).toFixed(1),
    }), { tool_call_id: toolCallId });
  } catch (e) {
    if (e instanceof DebuggerNotAttachedError) {
      return makeResult(false, t('toolDebugger.notAttached'), { tool_call_id: toolCallId });
    }
    return makeResult(false, t('toolDebugger.screenshotFailed', { error: e.message }), { tool_call_id: toolCallId });
  }
}

async function handleEmulate(args, tabId) {
  const toolCallId = args.__toolCallId;
  const target = args.emulateTarget;
  if (!target) return makeResult(false, t('toolDebugger.emulateMissingTarget'), { tool_call_id: toolCallId });
  try {
    switch (target) {
      case 'ua': {
        if (!args.userAgent) return makeResult(false, t('toolDebugger.emulateUaNeedValue'), { tool_call_id: toolCallId });
        await cdp(tabId, 'Network.setUserAgentOverride', { userAgent: String(args.userAgent) });
        break;
      }
      case 'viewport': {
        if (!args.viewportWidth || !args.viewportHeight) {
          return makeResult(false, t('toolDebugger.emulateViewportNeedSize'), { tool_call_id: toolCallId });
        }
        await cdp(tabId, 'Emulation.setDeviceMetricsOverride', {
          width: args.viewportWidth,
          height: args.viewportHeight,
          deviceScaleFactor: typeof args.deviceScaleFactor === 'number' ? args.deviceScaleFactor : 1,
          mobile: !!args.mobile,
        });
        break;
      }
      case 'geolocation': {
        if (typeof args.latitude !== 'number' || typeof args.longitude !== 'number') {
          return makeResult(false, t('toolDebugger.emulateGeoNeedValue'), { tool_call_id: toolCallId });
        }
        await cdp(tabId, 'Emulation.setGeolocationOverride', {
          latitude: args.latitude, longitude: args.longitude, accuracy: 1,
        });
        break;
      }
      case 'timezone': {
        if (!args.timezoneId) return makeResult(false, t('toolDebugger.emulateTzNeedValue'), { tool_call_id: toolCallId });
        await cdp(tabId, 'Emulation.setTimezoneOverride', { timezoneId: String(args.timezoneId) });
        break;
      }
      case 'colorScheme': {
        if (!args.colorScheme) return makeResult(false, t('toolDebugger.emulateColorNeedValue'), { tool_call_id: toolCallId });
        await cdp(tabId, 'Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: args.colorScheme }],
        });
        break;
      }
      case 'reset': {
        await Promise.allSettled([
          cdp(tabId, 'Emulation.clearDeviceMetricsOverride'),
          cdp(tabId, 'Emulation.clearGeolocationOverride'),
          cdp(tabId, 'Network.setUserAgentOverride', { userAgent: '' }),
          cdp(tabId, 'Emulation.setTimezoneOverride', { timezoneId: '' }),
          cdp(tabId, 'Emulation.setEmulatedMedia', { features: [] }),
        ]);
        return makeResult(true, t('toolDebugger.emulateReset'), { tool_call_id: toolCallId });
      }
      default:
        return makeResult(false, t('toolDebugger.unknownAction', { action: target }), { tool_call_id: toolCallId });
    }
    return makeResult(true, t('toolDebugger.emulateApplied', { target }), { tool_call_id: toolCallId });
  } catch (e) {
    if (e instanceof DebuggerNotAttachedError) {
      return makeResult(false, t('toolDebugger.notAttached'), { tool_call_id: toolCallId });
    }
    return makeResult(false, t('toolDebugger.commandFailed', { method: 'Emulation/Network', error: e.message }), { tool_call_id: toolCallId });
  }
}

/**
 * debug_page 工具统一入口
 */
export async function executeDebugPage(args, toolCallId) {
  const action = args?.action;
  const callArgs = { ...args, __toolCallId: toolCallId };

  if (!action) {
    return makeResult(false, t('toolDebugger.missingAction'), { tool_call_id: toolCallId });
  }

  // detach 允许在会话已失效时静默兜底，其余动作需要有效 tab
  let tabId = args.tabId ? Number(args.tabId) : await getActiveTabId();
  if (!tabId) {
    return makeResult(false, t('toolDebugger.noTab'), { tool_call_id: toolCallId });
  }

  // 除 attach/detach 外，必须已附着
  if (action !== 'attach' && action !== 'detach' && !isAttached(tabId)) {
    return makeResult(false, t('toolDebugger.notAttached'), { tool_call_id: toolCallId });
  }

  switch (action) {
    case 'attach': return handleAttach(callArgs, tabId);
    case 'detach': return handleDetach(callArgs, tabId);
    case 'evaluate': return handleEvaluate(callArgs, tabId);
    case 'input': return handleInput(callArgs, tabId);
    case 'network': return handleNetwork(callArgs, tabId);
    case 'screenshot': return handleScreenshot(callArgs, tabId);
    case 'emulate': return handleEmulate(callArgs, tabId);
    default:
      return makeResult(false, t('toolDebugger.unknownAction', { action }), { tool_call_id: toolCallId });
  }
}
