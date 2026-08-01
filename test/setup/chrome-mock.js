// test/setup/chrome-mock.js - 最小 chrome API stub
// 仅在模块 import 链意外访问 chrome.* 时避免 ReferenceError，被测纯函数本身不依赖 chrome
if (typeof globalThis.chrome === 'undefined') {
  const noop = () => {};
  globalThis.chrome = {
    storage: { local: { get: noop, set: noop } },
    runtime: {
      lastError: null,
      getManifest: () => ({ content_scripts: [{ js: [] }] }),
      getURL: (p) => p,
      sendMessage: noop,
      onMessage: { addListener: noop },
      getContexts: noop,
    },
    tabs: {
      query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
      remove: noop, reload: noop, goBack: noop, goForward: noop,
      captureVisibleTab: noop, onUpdated: { addListener: noop },
    },
    scripting: { executeScript: noop },
    bookmarks: { getTree: noop, search: noop },
    history: { search: noop },
    cookies: { get: noop, getAll: noop, set: noop, remove: noop },
    downloads: { download: noop },
    notifications: { create: noop },
    offscreen: { createDocument: noop, hasDocument: noop },
  };
}
