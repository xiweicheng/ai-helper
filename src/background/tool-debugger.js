// tool-debugger.js - debug_page 工具执行器
// 统一入口 executeDebugPage，按 action 分发：
// attach / detach / evaluate / input / network / screenshot / emulate

import { makeResult, getActiveTabId } from './tool-helpers.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { triggerScreenshotDownload } from './tool-screenshot.js';
import {
  attach as dbgAttach, detach as dbgDetach, cdp, isAttached, getAttachedTabIds,
  startNetworkCapture, collectNetwork, stopNetworkCapture,
  DebuggerNotAttachedError, RestrictedPageError,
} from './debugger/debugger-session.js';
import { parseKeySpec } from './debugger/debugger-rules.js';

registerTranslations('zh', {
  toolDebugger: {
    missingAction: '缺少 action 参数',
    unknownAction: '不支持的 action: {action}',
    unknownInputType: '不支持的 inputType: {inputType}（合法值：click/type/press/scroll）',
    unknownNetworkMode: '不支持的 networkMode: {mode}（合法值：start/collect/stop）',
    unknownEmulateTarget: '不支持的 emulateTarget: {target}（合法值：ua/viewport/geolocation/timezone/colorScheme/reset）',
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
    networkFilterSuffix: '（过滤: {filter}）',
    selectorInvisible: '元素存在但不可见（尺寸为零）: {selector}',
    networkEmpty: '缓冲区中没有新的网络请求。可先执行页面操作，再调用 collect。',
    networkCollected: '录制到 {count} 条网络请求（JSON）：\n{json}',
    networkStopped: '网络录制已停止，剩余 {count} 条请求（JSON）：\n{json}',
    networkStoppedEmpty: '网络录制已停止，缓冲区为空。',
    screenshotDone: '截图完成（{mode}，{size}，{format}，约 {sizeKB} KB），已下载到浏览器默认下载目录。',
    screenshotClamped: '（页面过长，高度已截断至 {max}px 以适配 Chrome 纹理上限）',
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
    unknownInputType: 'Unsupported inputType: {inputType} (expected click/type/press/scroll)',
    unknownNetworkMode: 'Unsupported networkMode: {mode} (expected start/collect/stop)',
    unknownEmulateTarget: 'Unsupported emulateTarget: {target} (expected ua/viewport/geolocation/timezone/colorScheme/reset)',
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
    networkFilterSuffix: ' (filter: {filter})',
    selectorInvisible: 'Element exists but is invisible (zero size): {selector}',
    networkEmpty: 'No new network requests buffered. Perform some page actions and call collect again.',
    networkCollected: 'Recorded {count} network requests (JSON):\n{json}',
    networkStopped: 'Network recording stopped; {count} remaining requests (JSON):\n{json}',
    networkStoppedEmpty: 'Network recording stopped; buffer was empty.',
    screenshotDone: 'Screenshot captured ({mode}, {size}, {format}, ~{sizeKB} KB) and downloaded to the browser default download directory.',
    screenshotClamped: ' (page too tall; height clamped to {max}px to fit Chrome texture limit)',
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

// Chrome 截图纹理单边上限（经验值，超过后 Page.captureScreenshot 会直接失败）
// 参考：Skia / ANGLE 普遍将最大纹理尺寸限定在 16384，预留一些余地取 16000。
const SCREENSHOT_MAX_EDGE = 16000;

// action 合法性集合（提到模块作用域，避免每次调用重新构造 Set）
const VALID_ACTIONS = new Set(['attach', 'detach', 'evaluate', 'input', 'network', 'screenshot', 'emulate']);

// CDP 键盘修饰符位掩码（与 debugger-rules.js#KEY_MODIFIERS 保持一致）
const MOD_SHIFT = 8;
const MOD_CTRL_ALT_META = 1 | 2 | 4; // Alt | Control | Meta

// CDP 键盘按键规格解析（修饰符位掩码 / 特殊键码表）见 debugger-rules.js#parseKeySpec

/**
 * 解析目标 tabId：
 * - 显式传入 args.tabId 时优先使用
 * - 否则先取活动标签页；对需要会话的动作（非 attach），若活动标签未附着
 *   而全局仅有一个已附着会话，则兜底到那个会话，避免用户切换标签后
 *   detach / evaluate / input 等动作打到错误的 tab（#1 tabId 漂移问题）
 */
async function resolveTargetTabId(args, action) {
  if (args.tabId) return Number(args.tabId);
  const activeId = await getActiveTabId();
  if (action === 'attach') return activeId;
  if (activeId && isAttached(activeId)) return activeId;
  const attached = getAttachedTabIds();
  if (attached.length === 1) return attached[0];
  return activeId;
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

/**
 * 页内深查询 helper 源码：递归穿透 shadow root 查找 selector。
 * 现代 Web Components 站点的目标元素常在 shadowRoot 内，直接用 document.querySelector 会找不到。
 * 作为字符串拼接到具体表达式中，避免重复代码。
 */
const DEEP_QUERY_HELPER = `
  function __aihDeepQuery(root, sel) {
    if (!root) return null;
    var direct = null;
    try { direct = root.querySelector(sel); } catch (e) { return null; }
    if (direct) return direct;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var sr = all[i].shadowRoot;
      if (sr) {
        var found = __aihDeepQuery(sr, sel);
        if (found) return found;
      }
    }
    return null;
  }
`;

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
    // 先判断元素是否在视口内，不在则 scrollIntoView 居中后重取 rect。
    // CDP Input.dispatchMouseEvent 使用视口 CSS 坐标，折叠线以下的元素直接派发会静默失败。
    // 使用 __aihDeepQuery 递归穿透 shadow root，兼容 Web Components 站点。
    const expr = `(function(s){
      ${DEEP_QUERY_HELPER}
      var el = __aihDeepQuery(document, s);
      if (!el) return { found: false };
      var r0 = el.getBoundingClientRect();
      var vw = window.innerWidth, vh = window.innerHeight;
      var offscreen = r0.width === 0 && r0.height === 0
        ? false
        : (r0.top < 0 || r0.bottom > vh || r0.left < 0 || r0.right > vw);
      if (offscreen) {
        try { el.scrollIntoView({ block: 'center', inline: 'center' }); } catch (_) {}
      }
      var r = el.getBoundingClientRect();
      return {
        found: true,
        scrolled: offscreen,
        x: r.x + r.width / 2,
        y: r.y + r.height / 2,
        w: r.width,
        h: r.height,
      };
    })(${JSON.stringify(args.selector)})`;
    const info = await evaluateJson(tabId, expr);
    if (!info || !info.found) {
      return { error: t('toolDebugger.selectorNotFound', { selector: args.selector }) };
    }
    if (info.w === 0 && info.h === 0) {
      return { error: t('toolDebugger.selectorInvisible', { selector: args.selector }) };
    }
    return { x: info.x, y: info.y };
  }
  if (typeof args.x === 'number' && typeof args.y === 'number') {
    return { x: args.x, y: args.y };
  }
  return { error: t('toolDebugger.clickNeedTarget') };
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
          await evaluateJson(tabId, `(function(s){
            ${DEEP_QUERY_HELPER}
            var el = __aihDeepQuery(document, s);
            if (el) el.focus();
            return !!el;
          })(${JSON.stringify(args.selector)})`);
        }
        await cdp(tabId, 'Input.insertText', { text: String(args.text) });
        return makeResult(true, t('toolDebugger.inputDone', { kind: 'type', tabId }), { tool_call_id: toolCallId });
      }
      case 'press': {
        if (!args.key) return makeResult(false, t('toolDebugger.pressNeedKey'), { tool_call_id: toolCallId });
        const spec = parseKeySpec(args.key);
        if (!spec) return makeResult(false, t('toolDebugger.unknownKey', { key: args.key }), { tool_call_id: toolCallId });
        // Shift + 字母：按浏览器惯例将 key/text 提升为大写
        let effectiveKey = spec.key;
        if (effectiveKey.length === 1 && (spec.modifiers & MOD_SHIFT) && /[a-z]/.test(effectiveKey)) {
          effectiveKey = effectiveKey.toUpperCase();
        }
        const base = {
          key: effectiveKey,
          code: spec.code || undefined,
          windowsVirtualKeyCode: spec.keyCode,
          nativeVirtualKeyCode: spec.keyCode,
          modifiers: spec.modifiers,
        };
        // 单字符可打印键（未同时按 Ctrl/Alt/Meta）：keyDown 携带 text 才能触发字符输入，
        // 否则只会产生按键事件而不写入字符（与工具参数描述不符）。
        const isPrintableChar = effectiveKey.length === 1 && (spec.modifiers & MOD_CTRL_ALT_META) === 0;
        const keyDownParams = isPrintableChar
          ? { type: 'keyDown', ...base, text: effectiveKey, unmodifiedText: effectiveKey }
          : { type: 'keyDown', ...base };
        await cdp(tabId, 'Input.dispatchKeyEvent', keyDownParams);
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
        return makeResult(false, t('toolDebugger.unknownInputType', { inputType }), { tool_call_id: toolCallId });
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
      const filter = args.filterUrl
        ? t('toolDebugger.networkFilterSuffix', { filter: args.filterUrl })
        : '';
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
    return makeResult(false, t('toolDebugger.unknownNetworkMode', { mode }), { tool_call_id: toolCallId });
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
  let clampNote = '';
  try {
    let clip = null;
    let mode = 'viewport';

    if (args.selector) {
      // 元素截图：取绝对布局坐标，支持视口外元素；使用 __aihDeepQuery 穿透 shadow root
      const expr = `(function(s){
        ${DEEP_QUERY_HELPER}
        var el = __aihDeepQuery(document, s);
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
      const rawH = Number(cs.height) || 0;
      const rawW = Number(cs.width) || 0;
      // 超长页面保护：Chrome 纹理单边上限 ~16384px，超过会直接报错。
      // 对 height / width 做上限截断，并在返回提示中声明已截断。
      const clampedH = Math.min(rawH, SCREENSHOT_MAX_EDGE);
      const clampedW = Math.min(rawW, SCREENSHOT_MAX_EDGE);
      clip = { x: cs.x || 0, y: cs.y || 0, width: clampedW, height: clampedH, scale: 1 };
      mode = 'fullPage';
      if (rawH > clampedH || rawW > clampedW) {
        clampNote = t('toolDebugger.screenshotClamped', { max: SCREENSHOT_MAX_EDGE });
      }
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
    }) + clampNote, { tool_call_id: toolCallId });
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
        const mobile = !!args.mobile;
        await cdp(tabId, 'Emulation.setDeviceMetricsOverride', {
          width: args.viewportWidth,
          height: args.viewportHeight,
          deviceScaleFactor: typeof args.deviceScaleFactor === 'number' ? args.deviceScaleFactor : 1,
          mobile,
        });
        // mobile: true 时必须同步开启触摸模拟，否则页面用 'ontouchstart' in window 判断时
        // 仍会走桌面分支，导致移动端适配测试得到错误结论。
        await cdp(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: mobile });
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
          cdp(tabId, 'Emulation.setTouchEmulationEnabled', { enabled: false }),
        ]);
        return makeResult(true, t('toolDebugger.emulateReset'), { tool_call_id: toolCallId });
      }
      default:
        return makeResult(false, t('toolDebugger.unknownEmulateTarget', { target }), { tool_call_id: toolCallId });
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

  // action 合法性优先校验（否则未附着时未知 action 会被误导为"会话不存在"）
  if (!VALID_ACTIONS.has(action)) {
    return makeResult(false, t('toolDebugger.unknownAction', { action }), { tool_call_id: toolCallId });
  }

  // tabId 解析：显式 > 活动标签 > 唯一已附着会话（兜底漂移）
  const tabId = await resolveTargetTabId(args, action);
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
