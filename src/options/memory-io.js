// src/options/memory-io.js - 记忆条目导入导出的纯逻辑与浏览器落地
//
// 导出走现有的 manage(review) 列表数据，不新增 agent 端点：列表本来就来自 review，
// 导出只是把同一份数据换个出口；加端点会让「备份」依赖一个更晚的代理版本。
// 代价是 review 不回传的字段（origin/updatedAt/sourceSessionId 等）在旧代理上导不出，
// 而导入端也刻意不还原这些字段——备份的可恢复信息（类型/内容/标签/重要度）是完整的。
//
// 导入是「追加还原」而不是「整库覆盖」：
//   1. 记忆是 AI 在会话里持续产生的，覆盖会抹掉导出之后新产生的条目；
//   2. 覆盖要先逐条删除现有记忆，中途失败会留下半残库，风险远大于收益；
//   3. 追加 + 按 type+content 去重已覆盖「压缩淘汰后找回」与「换机迁移」两个真实场景。
// 导入条目由用户显式选择文件触发，agent 按 X-Memory-Caller: user 记为 user 来源，
// 与「用户认可这些记忆」的语义一致，也让记忆库的来源标记保持诚实。

export const MEMORY_EXPORT_VERSION = 1;

// 白名单顺序即导出文件的字段顺序；后三个是可选字段（新代理若开始回传则原样带上）
const EXPORT_FIELDS = [
  'id', 'type', 'category', 'title', 'content', 'tags', 'importance',
  'accessCount', 'lastAccessAt', 'createdAt',
  'origin', 'updatedAt', 'sourceSessionId',
];

const MEMORY_TYPES = ['fact', 'summary'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

/** 导出只保留白名单字段，去掉 review 的派生字段（value 等），文件干净且可回导 */
function exportableEntry(m) {
  const out = {};
  for (const key of EXPORT_FIELDS) {
    const value = m[key];
    if (value === undefined || value === null) continue;
    out[key] = key === 'tags' && Array.isArray(value) ? [...value] : value;
  }
  return out;
}

/**
 * JSON 导出载荷：带 kind/version/exportedAt，导入端据此识别与校验
 * @param {Array<Object>} entries - manage(review) 返回的 scored 全量
 * @param {{now?: number}} [options]
 */
export function buildMemoryExportPayload(entries, options = {}) {
  const items = (Array.isArray(entries) ? entries : [])
    .filter((e) => e && typeof e === 'object' && !Array.isArray(e))
    .map(exportableEntry);
  return {
    kind: 'memory',
    version: MEMORY_EXPORT_VERSION,
    exportedAt: new Date(options.now || Date.now()).toISOString(),
    counts: {
      total: items.length,
      facts: items.filter((e) => e.type === 'fact').length,
      summaries: items.filter((e) => e.type === 'summary').length,
    },
    entries: items,
  };
}

/**
 * 导入单条归一化：只放行 agent store 认的字段，非法条目返回 null（由调用方计跳过）。
 * 不还原 id/createdAt/accessCount：新的 id 由 agent 生成，createdAt 取导入时刻，
 * 价值分从 0 访问重新累计——照抄旧时间戳会让导入条目立刻掉到淘汰线以下。
 */
function normalizeImportEntry(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const type = typeof raw.type === 'string' ? raw.type.trim() : '';
  if (!MEMORY_TYPES.includes(type)) return null;
  const content = typeof raw.content === 'string' ? raw.content.trim() : '';
  if (!content) return null;

  const out = { type, content };
  out.tags = Array.isArray(raw.tags)
    ? raw.tags.map((x) => String(x ?? '').trim()).filter(Boolean)
    : [];
  if (typeof raw.category === 'string' && raw.category.trim()) out.category = raw.category.trim();
  if (type === 'summary' && typeof raw.title === 'string' && raw.title.trim()) out.title = raw.title.trim();
  const importance = Number(raw.importance);
  if (Number.isFinite(importance)) {
    out.importance = Math.min(10, Math.max(1, Math.round(importance)));
  }
  return out;
}

/** 去重键：agent store 的重复判定也是「同 type + 完全同内容」，两边口径保持一致 */
function memoryKey(entry) {
  if (!entry || typeof entry.content !== 'string') return '';
  return `${entry.type}\u0000${entry.content.trim()}`;
}

/**
 * 解析导入文本：先按整份 JSON 解析（导出文件），失败再按 JSONL 逐行解析（淘汰归档文件）。
 * 归档是 append-only JSONL，崩溃可能留下半行——坏行跳过、其余照常导入，
 * 这样一次写入中断不会让整个月的归档失去价值。
 * @param {string} text - 文件原始文本
 * @returns {{ok: true, entries: Array<Object>, invalidLines?: number} | {ok: false, reason: 'format'}}
 */
export function parseMemoryImportText(text) {
  const source = typeof text === 'string' ? text : '';
  if (!source.trim()) return { ok: false, reason: 'format' };

  let raw;
  try {
    raw = JSON.parse(source);
  } catch (err) {
    // 不是完整 JSON：继续按 JSONL 尝试（归档文件一行一条，整体不是合法 JSON）
    if (!(err instanceof SyntaxError)) throw err;
    raw = undefined;
  }

  if (raw !== undefined) {
    const parsed = parseMemoryImport(raw);
    if (parsed.ok) return parsed;
    // 只有单条归档记录时，整份文件本身就是一个合法 JSON 对象；
    // 这时要放行到 JSONL 分支，而不是把「没有 entries」当成格式错。
    // 但如果它确实是导出信封（数组或带 entries 字段），失败就是失败，不再逐行猜测。
    const isEnvelope = Array.isArray(raw) || (raw && typeof raw === 'object' && 'entries' in raw);
    if (isEnvelope) return parsed;
  }

  const entries = [];
  let invalidLines = 0;
  for (const line of source.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch (err) {
      invalidLines += 1;
    }
  }
  if (!entries.length) return { ok: false, reason: 'format' };
  return { ok: true, entries, invalidLines };
}

/**
 * 解析导入内容：接受导出文件（{entries:[]}）与裸数组，其余一律判格式错
 * @param {*} raw - 已 JSON.parse 的内容
 * @returns {{ok: true, entries: Array<Object>} | {ok: false, reason: 'format'}}
 */
export function parseMemoryImport(raw) {
  let list = null;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object' && Array.isArray(raw.entries)) {
    // 有 kind 就必须是 memory：避免把别的功能的导出文件（同样带 entries 字段）误当记忆
    if (raw.kind !== undefined && raw.kind !== 'memory') return { ok: false, reason: 'format' };
    list = raw.entries;
  }
  if (!list) return { ok: false, reason: 'format' };
  return { ok: true, entries: list };
}

/**
 * 与当前库比对：按 type+内容去重（库内已有 + 文件内自重复都跳过），非法条目单独计数
 * @param {Array<Object>} existing - 当前记忆列表（review 全量）
 * @param {Array<Object>} incoming - 文件里的原始条目
 * @returns {{accepted: Array<Object>, skippedInvalid: number, skippedDuplicate: number, skipped: number}}
 */
export function diffMemoryImport(existing, incoming) {
  const seen = new Set();
  for (const e of Array.isArray(existing) ? existing : []) {
    const key = memoryKey(e);
    if (key) seen.add(key);
  }

  const accepted = [];
  let skippedInvalid = 0;
  let skippedDuplicate = 0;
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    const entry = normalizeImportEntry(raw);
    if (!entry) {
      skippedInvalid += 1;
      continue;
    }
    const key = memoryKey(entry);
    if (seen.has(key)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(key);
    accepted.push(entry);
  }
  return { accepted, skippedInvalid, skippedDuplicate, skipped: skippedInvalid + skippedDuplicate };
}

/** 文件名只到天：同一天多次导出靠浏览器自动加序号（与待办导出同惯例） */
export function memoryExportFileName(now = Date.now()) {
  const d = new Date(now);
  return `ai-helper-memory-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.json`;
}

/** 组装导出文件（文件名 + Blob），不触发下载，便于单测 */
export function buildMemoryExportFile(entries, options = {}) {
  const now = options.now || Date.now();
  const payload = buildMemoryExportPayload(entries, { now });
  return {
    filename: memoryExportFileName(now),
    blob: new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
  };
}

/** 触发浏览器下载，返回文件名（调用方拿去提示） */
export function downloadMemoryExport(entries, options = {}) {
  const { filename, blob } = buildMemoryExportFile(entries, options);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // 下载已经开始，对象 URL 没必要继续占内存
  URL.revokeObjectURL(url);
  return filename;
}

/**
 * 弹文件选择框，resolve 出用户选的文件（取消则为 null）
 * 接受 .json（导出备份）与 .jsonl（淘汰归档），两者都走 parseMemoryImportText 解析
 */
export function pickMemoryImportFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,.jsonl,application/json,application/x-ndjson';
    input.style.display = 'none';

    let settled = false;
    const done = (file) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };

    input.addEventListener('change', () => done(input.files && input.files[0] ? input.files[0] : null));
    // Chrome 在用户取消时会派发 cancel：不接这个事件，Promise 会一直悬着
    input.addEventListener('cancel', () => done(null));

    document.body.appendChild(input);
    input.click();
  });
}
