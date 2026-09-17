// libs-loader.js - 第三方库按需懒加载器
// 将 mermaid (3.2MB)、jspdf (357KB)、html2canvas (194KB) 从同步加载改为按需加载
// 首次调用时动态插入 <script>，后续调用直接返回缓存的 Promise

let mermaidPromise = null;
let jspdfPromise = null;
let html2canvasPromise = null;

/**
 * 动态加载脚本（返回 Promise）
 * @param {string} src - 脚本路径
 * @returns {Promise<void>}
 */
function loadScript(src) {
  return new Promise((resolve, reject) => {
    // 如果已经加载过（如其他途径注入），直接 resolve
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });
}

/**
 * 按需加载 Mermaid 库并初始化
 * @returns {Promise<object>} mermaid 全局对象
 */
export function loadMermaid() {
  if (typeof window.mermaid !== 'undefined') {
    return Promise.resolve(window.mermaid);
  }
  if (!mermaidPromise) {
    mermaidPromise = loadScript('libs/mermaid.min.js').then(() => {
      if (typeof window.mermaid !== 'undefined') {
        window.mermaid.initialize({
          startOnLoad: false,
          theme: 'default',
          securityLevel: 'loose',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        });
      }
      return window.mermaid;
    }).catch(err => {
      // 加载失败时清除缓存，允许重试
      mermaidPromise = null;
      throw err;
    });
  }
  return mermaidPromise;
}

/**
 * 按需加载 jsPDF 库
 * @returns {Promise<Function>} jsPDF 构造函数
 */
export function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) {
    return Promise.resolve(window.jspdf.jsPDF);
  }
  if (!jspdfPromise) {
    jspdfPromise = loadScript('libs/jspdf.min.js').then(() => {
      const jsPDF = window.jspdf && window.jspdf.jsPDF;
      if (!jsPDF) throw new Error('jsPDF not available after loading');
      return jsPDF;
    }).catch(err => {
      jspdfPromise = null;
      throw err;
    });
  }
  return jspdfPromise;
}

/**
 * 按需加载 html2canvas 库
 * @returns {Promise<Function>} html2canvas 函数
 */
export function loadHtml2Canvas() {
  if (window.html2canvas) {
    return Promise.resolve(window.html2canvas);
  }
  if (!html2canvasPromise) {
    html2canvasPromise = loadScript('libs/html2canvas.min.js').then(() => {
      if (!window.html2canvas) throw new Error('html2canvas not available after loading');
      return window.html2canvas;
    }).catch(err => {
      html2canvasPromise = null;
      throw err;
    });
  }
  return html2canvasPromise;
}

/**
 * 同时加载 jsPDF 和 html2canvas（导出 PDF 场景常一起使用）
 * @returns {Promise<{jsPDF: Function, html2canvas: Function}>}
 */
export async function loadPdfExportLibs() {
  const [jsPDF, html2canvas] = await Promise.all([loadJsPDF(), loadHtml2Canvas()]);
  return { jsPDF, html2canvas };
}
