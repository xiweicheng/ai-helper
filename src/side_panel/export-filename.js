// export-filename.js - 导出文件名：把回答开头的小标题拼成可读前缀
// 纯函数模块（不碰 DOM / chrome），供 chat-export.js 的 Word/PDF/Markdown/图片四处导出共用。
//
// 命名规则：`<标题>-<kind>-<时间戳>.<ext>`，取不到标题时退回原样 `<kind>-<时间戳>.<ext>`。
// 提取不准是可接受代价（用户明确接受），因此这里只做保守识别，宁可退回原名也不猜口语首句。

/** 扫描窗口：只看回答开头，长回答不做全量扫描 */
const TITLE_SCAN_MAX_LINES = 40;
const TITLE_SCAN_MAX_CHARS = 3000;

/** 文件名中标题的长度上限（按 code point 计，避免切开代理对/emoji） */
export const EXPORT_TITLE_MAX_CHARS = 40;

/** 代码围栏起始行（``` 或 ~~~，允许缩进） */
const FENCE_LINE_RE = /^\s{0,3}(`{3,}|~{3,})/;
/** ATX 标题：0~3 空格缩进 + 1~6 个 # + 空格 + 内容 */
const ATX_HEADING_RE = /^\s{0,3}(#{1,6})[ \t]+(.*)$/;
/** Setext 一级标题的下划线：=== */
const SETEXT_H1_RE = /^\s{0,3}=+\s*$/;
/** 水平分隔线 / 表格行：不可能作为 Setext 标题的正文行 */
const THEMATIC_BREAK_RE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

/** 标题里的序号前缀：1. / 1.2 / 1.2.3 / 1、 / 一、 / （一） / (1) */
const ORDER_PREFIX_RE =
  /^\s*(?:\d+(?:\.\d+)+[.、)）]?\s*|\d+[.、)）]\s*|[一二三四五六七八九十]+[、.]\s*|[（(][一二三四五六七八九十\d]+[）)]\s*)/;

/** 文件名非法字符（Windows 保留集 + 路径分隔符），替换为下划线 */
const ILLEGAL_FILENAME_CHARS_RE = /[/\\:*?"<>|]/g;
/** 控制字符与零宽字符，直接删除 */
const INVISIBLE_CHARS_RE = /[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029\ufeff]/g;

/** 换行符（用于归一化，避免在本文件里堆叠转义序列） */
const LF = '\n';

/**
 * 归一化导出正文的换行：CRLF/CR → LF，连续 3 个以上换行折叠成一个空行
 * @param {string} markdown
 * @returns {string}
 */
export function normalizeExportMarkdown(markdown) {
  if (typeof markdown !== 'string') return '';
  return markdown.replace(/\r\n?/g, LF).replace(/\n{3,}/g, LF + LF);
}

/**
 * 截取扫描窗口：前 N 行 + 前 M 字符，优先在换行处截断，避免切出半行
 * @param {string} markdown
 * @returns {string}
 */
function buildScanWindow(markdown) {
  const byChars = markdown.length > TITLE_SCAN_MAX_CHARS
    ? markdown.slice(0, TITLE_SCAN_MAX_CHARS)
    : markdown;
  return byChars.split(LF).slice(0, TITLE_SCAN_MAX_LINES).join(LF);
}

/**
 * 去掉行内 Markdown 标记，只留可读文本
 * @param {string} text
 * @returns {string}
 */
function stripInlineMarkdown(text) {
  return String(text)
    // 图片保留 alt 文本：![alt](src) -> alt
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 链接保留文字：[text](url) -> text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    // 行内代码与强调标记
    .replace(/`+/g, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    // 裸 URL 无信息量，去掉
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/<[^>]+>/g, '');
}

/**
 * 清洗成合法的文件名片段
 * @param {string} text
 * @returns {string}
 */
export function sanitizeExportTitle(text) {
  if (typeof text !== 'string' || !text.trim()) return '';

  let out = stripInlineMarkdown(text);
  out = out.replace(INVISIBLE_CHARS_RE, '');
  // 序号前缀只剥一层（"1.2 结论" -> "结论"）
  out = out.replace(ORDER_PREFIX_RE, '');
  out = out.replace(ILLEGAL_FILENAME_CHARS_RE, '_');
  // 空白折叠为短横线，连续分隔符合并
  out = out.replace(/\s+/g, '-').replace(/-{2,}/g, '-');
  out = out.replace(/^[-_.\s]+/, '').replace(/[-_.\s]+$/, '');
  return out;
}

/**
 * 按 code point 截断，并清掉截断后残留的尾部标点
 * @param {string} text
 * @param {number} maxChars
 * @returns {string}
 */
export function truncateExportTitle(text, maxChars = EXPORT_TITLE_MAX_CHARS) {
  const chars = Array.from(text);
  const sliced = chars.length > maxChars ? chars.slice(0, maxChars).join('') : text;
  return sliced.replace(/[-_.,;:、，。；：\s]+$/u, '');
}

/**
 * 从回答 Markdown 中提取最靠前的标题文本
 *
 * 规则：只看开头窗口内的 ATX/Setext 标题；有 H1 取第一个 H1，否则取最早出现的
 * 任意级别标题。代码围栏、表格里的 `#` 一律不算标题。
 *
 * @param {string} markdown - 回答原始 Markdown（dataset.rawContent 同源）
 * @returns {string} 清洗后的标题；提取不到返回空串
 */
export function extractExportTitle(markdown) {
  if (typeof markdown !== 'string' || !markdown.trim()) return '';

  const lines = buildScanWindow(markdown).split(LF);
  /** @type {Array<{ level: number, text: string }>} */
  const candidates = [];
  let fenceToken = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = line.match(FENCE_LINE_RE);

    if (fenceToken) {
      // 围栏内：只关心同字符的闭合
      if (fenceMatch && fenceMatch[1][0] === fenceToken) fenceToken = '';
      continue;
    }
    if (fenceMatch) {
      fenceToken = fenceMatch[1][0];
      continue;
    }

    const atx = line.match(ATX_HEADING_RE);
    if (atx) {
      // 去掉结尾的闭合 ###（"## 标题 ##" -> "标题"）
      const text = atx[2].replace(/[ \t]+#+[ \t]*$/, '').trim();
      if (text) candidates.push({ level: atx[1].length, text });
      continue;
    }

    const nextLine = lines[i + 1];
    if (nextLine && SETEXT_H1_RE.test(nextLine) && line.trim()
      && !THEMATIC_BREAK_RE.test(line) && !TABLE_ROW_RE.test(line)) {
      candidates.push({ level: 1, text: line.trim() });
      i++; // 跳过下划线行
    }
  }

  if (candidates.length === 0) return '';

  const firstH1 = candidates.find((c) => c.level === 1);
  const picked = firstH1 || candidates[0];
  return truncateExportTitle(sanitizeExportTitle(picked.text));
}

/**
 * 拼装最终导出文件名
 *
 * @param {object} options
 * @param {string} [options.title] - 已清洗的标题（通常来自 extractExportTitle）
 * @param {string} options.kind - 原文件名前缀：word / pdf / md / image
 * @param {number} options.timestamp - 毫秒时间戳
 * @param {string} options.ext - 扩展名，不含点
 * @returns {string}
 */
export function buildExportFileName({ title = '', kind, timestamp, ext }) {
  const baseName = `${kind}-${timestamp}.${ext}`;
  const safeTitle = truncateExportTitle(sanitizeExportTitle(title));
  return safeTitle ? `${safeTitle}-${baseName}` : baseName;
}

/**
 * 便捷封装：直接从回答 Markdown 得到文件名（四处导出的统一入口）
 *
 * @param {string} markdown - 回答原始 Markdown
 * @param {object} options
 * @param {string} options.kind - word / pdf / md / image
 * @param {string} options.ext - 扩展名，不含点
 * @param {number} [options.timestamp] - 毫秒时间戳，默认当前时间
 * @returns {string}
 */
export function resolveExportFileName(markdown, { kind, ext, timestamp = Date.now() }) {
  return buildExportFileName({
    title: extractExportTitle(markdown),
    kind,
    timestamp,
    ext,
  });
}
