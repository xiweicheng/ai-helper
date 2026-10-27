// test/unit/helpers/voice-harness.js - 语音输入单测的 DOM / chrome / 媒体替身
// 只被 *.unit.test.js 引入（文件名不含 .test，不会被执行）
// 注意：voice-input.js 的模块级状态是单例，测试之间必须通过 finish/cancel 收敛到 idle。

/**
 * 铺出侧边栏里与语音相关的 DOM 骨架（与 side_panel.html 的 id/class 保持一致）
 */
export function setupDom() {
  document.body.className = '';
  document.body.innerHTML = `
    <div class="input-wrapper">
      <div class="input-container">
        <textarea id="userInput"></textarea>
      </div>
    </div>
    <div id="voiceRecorderBar" role="status" aria-live="polite" aria-hidden="true">
      <div id="voiceWave"></div>
      <span id="voiceTimer">00:00</span>
      <span id="voiceStatusText"></span>
      <button id="voicePermBtn" style="display:none">去授权</button>
      <button id="voiceCancelBtn"></button>
      <button id="voiceDoneBtn"></button>
    </div>
    <div class="input-bottom-right">
      <button id="voiceInputBtn" aria-pressed="false" style="display:none"></button>
    </div>
  `;
  return {
    input: document.getElementById('userInput'),
    btn: document.getElementById('voiceInputBtn'),
    bar: document.getElementById('voiceRecorderBar'),
    wave: document.getElementById('voiceWave'),
    timer: document.getElementById('voiceTimer'),
    status: document.getElementById('voiceStatusText'),
    permBtn: document.getElementById('voicePermBtn'),
    cancelBtn: document.getElementById('voiceCancelBtn'),
    doneBtn: document.getElementById('voiceDoneBtn'),
  };
}

/** 最小 port 替身（面板 ↔ background 的 'asr' 通道） */
export function makePort() {
  const listeners = [];
  const disconnectListeners = [];
  const port = {
    name: 'asr',
    posted: [],
    postMessage(message) { port.posted.push(message); },
    onMessage: { addListener: (fn) => listeners.push(fn) },
    onDisconnect: { addListener: (fn) => disconnectListeners.push(fn) },
    /** 模拟代理端推送的 JSON 事件 */
    emit(evt) { for (const fn of listeners) fn(evt); },
    /** 模拟通道断开 */
    disconnect() { for (const fn of disconnectListeners) fn(); },
    /** 该通道发起的控制帧（排除音频） */
    controlFrames() { return port.posted.filter((m) => m.type !== 'audio'); },
  };
  return port;
}

/**
 * 打桩 chrome.*（返回的上下文可供断言）
 * @param {{status?: object|null, store?: object, onSendMessage?: Function}} [opts]
 */
export function stubChrome(opts = {}) {
  const sentMessages = [];
  const runtimeListeners = [];
  const store = opts.store || {};
  const removedKeys = [];
  const port = makePort();

  chrome.runtime.sendMessage = async (message) => {
    sentMessages.push(message);
    if (typeof opts.onSendMessage === 'function') return opts.onSendMessage(message);
    return { success: true, status: opts.status ?? null };
  };
  chrome.runtime.connect = () => port;
  chrome.runtime.onMessage.addListener = (fn) => runtimeListeners.push(fn);
  chrome.runtime.getURL = (p) => `chrome-extension://test/${p}`;
  chrome.storage.session = {
    get: async (key) => ({ [key]: store[key] }),
    set: async (obj) => Object.assign(store, obj),
    remove: async (key) => { removedKeys.push(key); delete store[key]; },
  };

  return { sentMessages, runtimeListeners, store, removedKeys, port };
}

/**
 * 打桩麦克风与 WebAudio（jsdom 都没有）
 * @param {{failWith?: Error}} [opts]
 */
export function stubMedia(opts = {}) {
  const created = [];
  const tracks = [{ stopped: false, stop() { this.stopped = true; } }];
  const gum = async () => {
    if (opts.failWith) throw opts.failWith;
    return { getTracks: () => tracks };
  };
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: gum },
  });

  // voice-input 会先 fetch 探一下 worklet 到底在扩展根还是 dist/ 下（两种安装形态不同），
  // jsdom 里既没有 chrome-extension:// 协议也发不出真实请求，这里直接判「存在」。
  globalThis.fetch = async (url) => {
    const hit = String(url).includes('voice-capture-worklet.js');
    return { ok: hit, status: hit ? 200 : 404 };
  };

  class FakeWorkletNode {
    constructor() {
      this.port = { onmessage: null, close() { this.closed = true; } };
      this.connected = false;
      created.push(this);
    }
    connect() { this.connected = true; }
    disconnect() { this.connected = false; }
  }
  globalThis.AudioWorkletNode = FakeWorkletNode;

  const ctx = {
    sampleRate: 16000,
    state: 'running',
    audioWorklet: { addModule: async () => {} },
    resume: async () => {},
    close: async () => {},
    createMediaStreamSource: () => ({ connect() {}, disconnect() {} }),
    createScriptProcessor: () => ({ connect() {}, disconnect() {}, onaudioprocess: null }),
    destination: {},
  };
  window.AudioContext = function FakeAudioContext() { return ctx; };
  window.webkitAudioContext = window.AudioContext;

  return {
    ctx,
    tracks,
    created,
    /** 最近一个 worklet 节点（用来模拟采集到的一帧） */
    lastNode: () => created[created.length - 1],
    /** 模拟采到一帧：rms 决定音量，samples 决定样本数 */
    emitChunk({ rms = 0.2, samples = 1600 } = {}) {
      const node = created[created.length - 1];
      const pcm = new Int16Array(samples);
      for (let i = 0; i < samples; i += 1) pcm[i] = Math.round(rms * 32767);
      node.port.onmessage?.({ data: { type: 'chunk', pcm: pcm.buffer, rms } });
    },
  };
}

/** 轮询等待条件成立（避免依赖固定的 sleep 时长） */
export async function waitFor(predicate, { timeout = 1500, interval = 10 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (predicate()) return true;
    await new Promise((r) => setTimeout(r, interval));
  }
  return predicate();
}
