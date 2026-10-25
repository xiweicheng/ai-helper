// eslint.config.js
//
// no-undef 是"调用了不存在的标识符"这类**运行时崩溃**的唯一静态防线。
// 教训：side_panel/index.js 里 restoreInputContextIndicators 调了 renderSkillIndicator()，
// 但 import 名单只加了 renderMcpIndicator → 点「✎ 回填」立刻 ReferenceError；
// 同类问题还有 new abortController()、直接调 showCustomConfirm()（只挂在 window 上）。
// 只有 4 条规则时这些全部逃过检查，因此这里补上 no-undef + 显式 globals 白名单。
//
// 白名单只列**真实存在**的全局（浏览器 DOM / 扩展 API / CDN 注入库 / Node）。
// 新增 DOM API 报 no-undef 时，把它加到这个白名单里，而不是关掉规则。
const GLOBALS = {
  // 浏览器 / DOM
  window: 'readonly', document: 'readonly', console: 'readonly', navigator: 'readonly',
  location: 'readonly', history: 'readonly', localStorage: 'readonly', sessionStorage: 'readonly',
  fetch: 'readonly', Headers: 'readonly', Request: 'readonly', Response: 'readonly',
  AbortController: 'readonly', AbortSignal: 'readonly', Blob: 'readonly', File: 'readonly',
  FileReader: 'readonly', FormData: 'readonly', URL: 'readonly', URLSearchParams: 'readonly',
  TextDecoder: 'readonly', TextEncoder: 'readonly', atob: 'readonly', btoa: 'readonly',
  crypto: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
  setInterval: 'readonly', clearInterval: 'readonly', requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly', queueMicrotask: 'readonly', structuredClone: 'readonly',
  performance: 'readonly', CustomEvent: 'readonly', Event: 'readonly',
  KeyboardEvent: 'readonly', MouseEvent: 'readonly', InputEvent: 'readonly', DataTransfer: 'readonly',
  MutationObserver: 'readonly', IntersectionObserver: 'readonly', ResizeObserver: 'readonly',
  DOMParser: 'readonly', XMLSerializer: 'readonly', XMLHttpRequest: 'readonly',
  Image: 'readonly', Audio: 'readonly', ImageData: 'readonly', OffscreenCanvas: 'readonly',
  createImageBitmap: 'readonly', DOMRect: 'readonly', DOMException: 'readonly',
  Node: 'readonly', NodeFilter: 'readonly', Element: 'readonly', Range: 'readonly',
  Selection: 'readonly', ShadowRoot: 'readonly', DocumentFragment: 'readonly', TreeWalker: 'readonly',
  HTMLElement: 'readonly', HTMLInputElement: 'readonly', HTMLTextAreaElement: 'readonly',
  HTMLCanvasElement: 'readonly', HTMLDivElement: 'readonly', HTMLImageElement: 'readonly',
  CSS: 'readonly', CSSStyleSheet: 'readonly', MediaQueryList: 'readonly', ClipboardItem: 'readonly',
  getComputedStyle: 'readonly', getSelection: 'readonly', matchMedia: 'readonly', scrollTo: 'readonly',
  alert: 'readonly', confirm: 'readonly', prompt: 'readonly',
  indexedDB: 'readonly', IDBKeyRange: 'readonly',
  self: 'readonly', globalThis: 'readonly',
  // Chrome 的 legacy 全局：仅事件派发期间有效，非标准，勿新增依赖
  event: 'readonly',
  // 扩展 API
  chrome: 'readonly', browser: 'readonly',
  // CDN 全局（libs/*.min.js 注入到页面）
  marked: 'readonly', mermaid: 'readonly', QRCode: 'readonly',
  html2canvas: 'readonly', jspdf: 'readonly', pdfjsLib: 'readonly',
  // Node（agent 子包）
  process: 'readonly', Buffer: 'readonly', __dirname: 'readonly', __filename: 'readonly',
  module: 'readonly', require: 'readonly', exports: 'readonly', global: 'readonly',
  setImmediate: 'readonly', clearImmediate: 'readonly',
  WebSocket: 'readonly', EventSource: 'readonly', URLPattern: 'readonly',
};

export default [
  {
    // agent 子包纳入 lint（历史上整块被 ignores 掉，等于 agent 代码没有任何静态检查）；
    // 只排除依赖与产物，避免扫 node_modules 里的第三方代码
    ignores: ['dist/**', 'libs/**', 'scripts/**', 'agent/node_modules/**', 'agent/dist/**']
  },
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: GLOBALS
    },
    rules: {
      // 用了但没声明/没 import → 运行时 ReferenceError，必须静态拦住
      'no-undef': 'error',
      'no-debugger': 'error',
      'no-dupe-args': 'error',
      'no-func-assign': 'error',
      'no-obj-calls': 'error'
    }
  }
];
