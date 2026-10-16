/**
 * 内容脚本注入清单的唯一真相源：源码 manifest.json 的声明。
 *
 * 背景：构建脚本曾用「扫描 dist/libs 目录、除 mermaid 外全部注入」的方式生成
 * content_scripts.js。dist/libs 里同时存放着**只被 side panel 使用**的重型库
 * （html2canvas / jspdf / pdf.worker，合计约 1.61 MB —— 它们靠
 * src/side_panel/libs-loader.js 动态插入 <script src="libs/…"> 到扩展自身文档，
 * 依赖的是「文件存在」而非「内容脚本声明」）。目录扫描会把它们一并塞进
 * 每个页面的每个 iframe（manifest 为 all_frames + match_about_blank），
 * 而内容脚本产物对它们的引用数为 0，属纯死重与无谓攻击面。
 *
 * 因此这里改为：只采用源码 manifest 显式声明过的 libs 项。
 * 今后若确需给内容脚本增加全局库，请在 manifest.json 的
 * content_scripts[0].js 中声明，构建会自动跟随。
 */

const LIBS_PREFIX = 'libs/';

/**
 * 派生内容脚本需要注入的 libs 列表。
 *
 * @param {Object} params
 * @param {string[]} params.sourceManifestJs - 源码 manifest 的 content_scripts[0].js 原值
 * @param {string[]} params.libsDirFiles - dist/libs 下的文件名（不含目录前缀）
 * @param {boolean} [params.libsDirExists=true] - dist/libs 目录是否存在
 * @returns {string[]} 形如 ['libs/marked.min.js'] 的注入项，保持声明顺序
 * @throws {Error} 声明了某个 libs 文件但 dist/libs 中确实没有该文件时抛出
 *   （静默丢库会导致运行时 `typeof marked === 'undefined'` 之类的降级，很难归因）
 */
export function resolveContentScriptLibs({ sourceManifestJs, libsDirFiles, libsDirExists = true }) {
  const declared = [...new Set(
    (Array.isArray(sourceManifestJs) ? sourceManifestJs : [])
      .filter(f => typeof f === 'string' && f.startsWith(LIBS_PREFIX))
  )];

  if (declared.length === 0) return [];

  // dist/libs 整体缺失时保持原有的非致命路径（由调用方按缺库运行）
  if (!libsDirExists) return declared;

  const present = new Set(
    (Array.isArray(libsDirFiles) ? libsDirFiles : []).map(f => `${LIBS_PREFIX}${f}`)
  );
  const missing = declared.filter(f => !present.has(f));
  if (missing.length > 0) {
    throw new Error(
      `manifest 声明了内容脚本库但构建产物中不存在: ${missing.join(', ')}（请检查 libs 复制步骤）`
    );
  }

  return declared;
}
