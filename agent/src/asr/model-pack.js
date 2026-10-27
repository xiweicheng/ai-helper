// agent/src/asr/model-pack.js - 本地模型包扫描与校验
//
// 分发方式（内网无模型下载通道）：模型包由有外网的机器制作成目录后拷入
// ~/.ai-helper-agent/asr/models/<id>/，目录内必须含 manifest.json：
//
//   {
//     "schema": 1,
//     "id": "sense-voice-zh-en-ja-ko-yue-2024-07-17",
//     "name": "SenseVoice 多语种（定稿）",
//     "kind": "offline",                 // online | offline | vad
//     "engine": "sherpa-onnx",
//     "files": ["model.int8.onnx", "tokens.txt"],
//     "sha256": { "model.int8.onnx": "…" },   // 可选；缺失则跳过哈希校验
//     "modelFile": "model.int8.onnx",
//     "tokensFile": "tokens.txt"
//   }
//
// 校验策略：字段结构 + 声明文件存在 + 大小 > 0 是每次扫描都做的轻量校验；
// sha256 因单包可达数百 MB，按 (path,size,mtime) 缓存在 hash-cache.json，
// 只有文件变动或显式 verify 时才重新计算。

import { join, resolve, relative, isAbsolute, basename } from 'path';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync, rmSync, copyFileSync } from 'fs';
import { MANIFEST_SCHEMA, MODEL_KINDS, MODELS_DIR, HASH_CACHE_FILE } from './config.js';

// 单个模型文件大小上限（8GB）：防止把整盘文件误当模型读入哈希
const MAX_MODEL_FILE_BYTES = 8 * 1024 * 1024 * 1024;

// 流式哈希的读块大小（避免一次性把 300MB 读进内存）
const HASH_CHUNK_BYTES = 4 * 1024 * 1024;

/**
 * 校验并归一化 id（只允许字母/数字/下划线/中划线/点；长度 1-96）
 * @param {unknown} value
 * @returns {string|null}
 */
export function normalizeModelId(value) {
  const id = typeof value === 'string' ? value.trim() : '';
  if (!id || id.length > 96) return null;
  if (!/^[A-Za-z0-9._-]+$/.test(id)) return null;
  return id;
}

/**
 * 判断 candidate 是否落在 MODELS_DIR 之内（防目录穿越：manifest 里的相对路径不可信）
 * @param {string} root
 * @param {string} candidate
 * @returns {boolean}
 */
function isInside(root, candidate) {
  const rel = relative(resolve(root), resolve(candidate));
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

// ==================== sha256 缓存 ====================

let hashCache = null;

function loadHashCache() {
  if (hashCache) return hashCache;
  try {
    const raw = JSON.parse(readFileSync(HASH_CACHE_FILE, 'utf-8'));
    hashCache = raw && typeof raw === 'object' ? raw : {};
  } catch {
    hashCache = {};
  }
  return hashCache;
}

function persistHashCache() {
  try {
    mkdirSync(join(HASH_CACHE_FILE, '..'), { recursive: true });
    writeFileSync(HASH_CACHE_FILE, JSON.stringify(hashCache || {}), 'utf-8');
  } catch {
    // 缓存写失败不影响校验（只是下次重算）
  }
}

/**
 * 计算文件 sha256（带缓存；缓存键含 size+mtime，文件一变即失效）
 * @param {string} filePath
 * @returns {string|null} 十六进制摘要；读取失败返回 null
 */
export function sha256OfFile(filePath) {
  let st;
  try {
    st = statSync(filePath);
  } catch {
    return null;
  }
  if (!st.isFile() || st.size <= 0 || st.size > MAX_MODEL_FILE_BYTES) return null;

  const key = `${filePath}:${st.size}:${Math.floor(st.mtimeMs)}`;
  const cache = loadHashCache();
  if (typeof cache[key] === 'string') return cache[key];

  try {
    const hash = createHash('sha256');
    const buf = readFileSync(filePath);
    for (let offset = 0; offset < buf.length; offset += HASH_CHUNK_BYTES) {
      hash.update(buf.subarray(offset, Math.min(offset + HASH_CHUNK_BYTES, buf.length)));
    }
    const digest = hash.digest('hex');
    cache[key] = digest;
    persistHashCache();
    return digest;
  } catch {
    return null;
  }
}

/**
 * 重置哈希缓存（测试 / 模型替换后强制重算）
 */
export function resetHashCache() {
  hashCache = {};
}

// ==================== manifest 校验 ====================

/**
 * 解析并校验单个模型包目录
 * @param {string} dir 模型包目录（MODELS_DIR 下的子目录，或用户手动导入的目录）
 * @param {{ verifyHash?: boolean }} [opts]
 * @returns {{ ok: boolean, model?: object, error?: string }}
 */
export function readModelManifest(dir, opts = {}) {
  const manifestPath = join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    return { ok: false, error: 'manifest_missing' };
  }
  let raw;
  try {
    raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (err) {
    return { ok: false, error: `manifest_invalid_json: ${err.message}` };
  }
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'manifest_not_object' };
  if (raw.schema !== MANIFEST_SCHEMA) return { ok: false, error: `manifest_schema_unsupported: ${raw.schema}` };
  if (raw.engine !== 'sherpa-onnx') return { ok: false, error: `engine_unsupported: ${raw.engine}` };

  const id = normalizeModelId(raw.id);
  if (!id) return { ok: false, error: 'manifest_invalid_id' };

  const kind = MODEL_KINDS.includes(raw.kind) ? raw.kind : null;
  if (!kind) return { ok: false, error: `manifest_invalid_kind: ${raw.kind}` };

  const files = Array.isArray(raw.files)
    ? raw.files.filter(f => typeof f === 'string' && f.trim()).map(f => f.trim())
    : [];
  if (files.length === 0) return { ok: false, error: 'manifest_no_files' };

  // 声明文件必须真实存在且非空（防止拷贝中断留下半包）
  let totalBytes = 0;
  for (const file of files) {
    const full = join(dir, file);
    if (!isInside(dir, full)) return { ok: false, error: `file_outside_pack: ${file}` };
    if (!existsSync(full)) return { ok: false, error: `file_missing: ${file}` };
    const st = statSync(full);
    if (!st.isFile() || st.size <= 0) return { ok: false, error: `file_empty: ${file}` };
    totalBytes += st.size;
  }

  // 哈希校验（默认关闭：单包数百 MB，全量哈希只在显式 verify 或文件变动时做）
  const expected = raw.sha256 && typeof raw.sha256 === 'object' ? raw.sha256 : null;
  if (opts.verifyHash && expected) {
    for (const [file, want] of Object.entries(expected)) {
      if (typeof want !== 'string' || !want) continue;
      const full = join(dir, file);
      if (!isInside(dir, full)) return { ok: false, error: `file_outside_pack: ${file}` };
      const got = sha256OfFile(full);
      if (!got) return { ok: false, error: `file_unreadable: ${file}` };
      if (got.toLowerCase() !== want.toLowerCase()) {
        return { ok: false, error: `sha256_mismatch: ${file}` };
      }
    }
  }

  // 引擎所需的文件定位键（按 kind 必有：缺一个都无法构造 recognizer 配置）
  const pick = (key) => (typeof raw[key] === 'string' && raw[key].trim() ? raw[key].trim() : null);
  const resolveFile = (name) => (name && files.includes(name) ? join(dir, name) : null);

  // 模型结构（决定 engine 构造哪一类 modelConfig）；缺省按 kind 推断最常见结构
  const arch = typeof raw.arch === 'string' && raw.arch.trim()
    ? raw.arch.trim()
    : (kind === 'online' ? 'transducer' : 'senseVoice');

  const model = {
    id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
    kind,
    arch,
    engine: raw.engine,
    language: typeof raw.language === 'string' ? raw.language : '',
    dir,
    files,
    totalBytes,
    hashes: expected,
    modelFile: resolveFile(pick('modelFile')),
    tokensFile: resolveFile(pick('tokensFile')),
    encoder: resolveFile(pick('encoder')),
    decoder: resolveFile(pick('decoder')),
    joiner: resolveFile(pick('joiner')),
    // 模型内置的语种提示（SenseVoice 用 auto/zh/en/ja/ko/yue）
    senseVoiceLanguage: typeof raw.senseVoiceLanguage === 'string' ? raw.senseVoiceLanguage : 'auto',
    decodingMethod: typeof raw.decodingMethod === 'string' ? raw.decodingMethod : 'greedy_search',
    sampleRate: Number(raw.sampleRate) > 0 ? Number(raw.sampleRate) : 16000,
  };

  if (kind === 'offline') {
    if (!model.modelFile || !model.tokensFile) return { ok: false, error: 'manifest_missing_model_or_tokens' };
  } else if (kind === 'online') {
    if (!model.encoder || !model.decoder || !model.joiner || !model.tokensFile) {
      return { ok: false, error: 'manifest_missing_transducer_files' };
    }
  } else if (kind === 'vad') {
    if (!model.modelFile) return { ok: false, error: 'manifest_missing_model' };
  }

  return { ok: true, model };
}

// ==================== 扫描 / 注册 / 删除 ====================

/**
 * 扫描模型目录（每次调用都读盘，结果不做进程内缓存：用户可能随时拷入新包）
 * @param {{ verifyHash?: boolean }} [opts]
 * @returns {{ models: object[], invalid: Array<{dir: string, error: string}>, modelsDir: string }}
 */
export function scanModels(opts = {}) {
  const models = [];
  const invalid = [];
  let entries = [];
  try {
    entries = readdirSync(MODELS_DIR, { withFileTypes: true });
  } catch {
    return { models, invalid, modelsDir: MODELS_DIR };
  }

  for (const entry of entries) {
    // 点开头的目录是下载器的未完成包（.<id>.part）：不该在「非法模型」列表里冒出来
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const dir = join(MODELS_DIR, entry.name);
    const result = readModelManifest(dir, opts);
    if (result.ok) {
      // 目录名与 manifest.id 不一致时以 manifest 为准，但记录提示（避免用户找错目录）
      models.push(result.model);
    } else {
      invalid.push({ dir, name: entry.name, error: result.error });
    }
  }

  // 排序：online → offline → vad，同类按名称，保证「第一个可用包」的选取稳定
  const kindOrder = { online: 0, offline: 1, vad: 2 };
  models.sort((a, b) => {
    const ka = kindOrder[a.kind] ?? 9;
    const kb = kindOrder[b.kind] ?? 9;
    if (ka !== kb) return ka - kb;
    return a.name.localeCompare(b.name);
  });

  return { models, invalid, modelsDir: MODELS_DIR };
}

/**
 * 按类型挑选模型（用户显式指定且存在则优先，否则取该类的第一个）
 * @param {object[]} models
 * @param {'online'|'offline'|'vad'} kind
 * @param {string|null} preferredId
 * @returns {object|null}
 */
export function pickModel(models, kind, preferredId) {
  const sameKind = models.filter(m => m.kind === kind);
  if (sameKind.length === 0) return null;
  if (preferredId) {
    const hit = sameKind.find(m => m.id === preferredId);
    if (hit) return hit;
  }
  return sameKind[0];
}

/**
 * 当前能力（是否存在流式/定稿/断句模型）
 * @returns {{ online: boolean, offline: boolean, vad: boolean, models: object[], invalid: object[] }}
 */
export function getCapability(opts = {}) {
  const { models, invalid } = scanModels(opts);
  return {
    online: models.some(m => m.kind === 'online'),
    offline: models.some(m => m.kind === 'offline'),
    vad: models.some(m => m.kind === 'vad'),
    models,
    invalid,
  };
}

/**
 * 把外部目录注册为模型包：校验通过后拷贝/移动到 MODELS_DIR/<id> 并返回模型信息
 *
 * 用途：配置页「选择模型目录」（本机原生目录选择器，零上传）。
 * 目标已存在时直接复用（不覆盖用户已有的同 id 包，避免半途中断损坏）。
 * @param {string} sourceDir
 * @param {{ verifyHash?: boolean }} [opts]
 * @returns {{ success: boolean, model?: object, error?: string }}
 */
export function registerModel(sourceDir, opts = {}) {
  if (typeof sourceDir !== 'string' || !sourceDir.trim()) {
    return { success: false, error: 'invalid_path' };
  }
  const abs = resolve(sourceDir);
  if (!existsSync(abs)) return { success: false, error: 'path_not_found' };

  const result = readModelManifest(abs, opts);
  if (!result.ok) return { success: false, error: result.error };
  const model = result.model;

  const dirName = basename(abs);
  const inPlace = resolve(abs) === resolve(MODELS_DIR, dirName);
  if (inPlace) {
    // 已经是 models 目录下的包：直接可用
    return { success: true, model };
  }

  // 已存在同 id 包：视为已注册（不覆盖）
  const existingDir = join(MODELS_DIR, model.id);
  if (existsSync(existingDir) && resolve(existingDir) !== resolve(abs)) {
    const existing = readModelManifest(existingDir, opts);
    if (existing.ok) return { success: true, model: existing.model, reused: true };
  }

  // 拷贝到 models 目录（跨盘/权限问题就地报错，不静默成功）
  try {
    mkdirSync(MODELS_DIR, { recursive: true });
    copyDirSync(abs, existingDir);
  } catch (err) {
    return { success: false, error: `copy_failed: ${err.message}` };
  }

  const copied = readModelManifest(existingDir, opts);
  if (!copied.ok) {
    // 拷贝结果不可用：清理半成品，避免留下坏包
    try { rmSync(existingDir, { recursive: true, force: true }); } catch { /* 忽略 */ }
    return { success: false, error: copied.error };
  }
  return { success: true, model: copied.model };
}

/**
 * 递归拷贝目录（不引入 fs.cp 的跨版本差异；模型包文件数很少）
 *
 * 必须用 copyFileSync 而非 readFileSync+writeFileSync：单个 ONNX 可达 239MB，
 * 读进内存再写会瞬时吃掉同量堆内存（与引擎加载叠加容易触发 OOM）。
 * @param {string} src
 * @param {string} dest
 */
function copyDirSync(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(from, to);
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

/**
 * 删除模型包（只允许删除 MODELS_DIR 下的目录）
 * @param {string} id
 * @returns {{ success: boolean, error?: string }}
 */
export function deleteModel(id) {
  const safeId = normalizeModelId(id);
  if (!safeId) return { success: false, error: 'invalid_id' };
  const dir = join(MODELS_DIR, safeId);
  if (!isInside(MODELS_DIR, dir)) return { success: false, error: 'invalid_id' };
  if (!existsSync(dir)) return { success: false, error: 'model_not_found' };
  try {
    rmSync(dir, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: `delete_failed: ${err.message}` };
  }
}
