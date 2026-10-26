// agent/src/asr/config.js - 语音输入（本地 STT）配置与路径约定
//
// 存储布局：
//   ~/.ai-helper-agent/asr/
//   ├── asr-config.json        # 用户配置（启用开关 / 语言 / 模型选择 / 空闲卸载）
//   ├── hash-cache.json        # 模型文件 sha256 缓存（按 path+size+mtime 失效，避免每次扫描全量哈希）
//   └── models/<id>/           # 每个模型包一个目录（manifest.json + ONNX 文件）
//
// 设计要点：ASR 是可选组件（见计划「安装与启用策略」）。配置文件缺失 = 从未配置，
// 一律按「未启用」处理，绝不因为读不到配置就安装/下载任何东西。

import { join } from 'path';
import { homedir } from 'os';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'fs';

// ASR 数据根目录（环境变量 AI_HELPER_ASR_ROOT 可覆盖：测试隔离 / 自定义数据目录）
export const ASR_ROOT = process.env.AI_HELPER_ASR_ROOT || join(homedir(), '.ai-helper-agent', 'asr');

// 模型包目录（每个子目录一个模型包，内含 manifest.json）
// 固定路径，不开放配置：用户需要的是「模型放哪」的可读提示，不是可选项。
export const MODELS_DIR = join(ASR_ROOT, 'models');

/**
 * 模型目录的展示路径（把 home 前缀折叠为 ~，避免配置页出现含用户名的长绝对路径）
 * @returns {string}
 */
export function getModelsDirDisplay() {
  const home = homedir();
  return home && MODELS_DIR.startsWith(home) ? `~${MODELS_DIR.slice(home.length)}` : MODELS_DIR;
}

// 用户配置文件
export const CONFIG_FILE = join(ASR_ROOT, 'asr-config.json');

// sha256 缓存文件
export const HASH_CACHE_FILE = join(ASR_ROOT, 'hash-cache.json');

// 模型包 manifest 的 schema 版本（不匹配即视为非法包，拒绝加载）
export const MANIFEST_SCHEMA = 1;

// 模型类型：online=流式草稿，offline=整段高精度定稿，vad=断句
export const MODEL_KINDS = ['online', 'offline', 'vad'];

// 单次录音时长上限（5 分钟）：超时结束并定稿，避免内存无上限增长
export const MAX_RECORDING_MS = Number(process.env.AI_HELPER_ASR_MAX_RECORDING_MS) > 0
  ? Number(process.env.AI_HELPER_ASR_MAX_RECORDING_MS)
  : 5 * 60 * 1000;

// 会话空闲回收（松手后客户端不再发帧；30s 未收到任何帧即释放）
export const SESSION_IDLE_MS = Number(process.env.AI_HELPER_ASR_SESSION_IDLE_MS) > 0
  ? Number(process.env.AI_HELPER_ASR_SESSION_IDLE_MS)
  : 30 * 1000;

// 并发会话上限：本机单用户形态，默认 1（第二个请求直接回 busy）
export const MAX_SESSIONS = Number(process.env.AI_HELPER_ASR_MAX_SESSIONS) > 0
  ? Number(process.env.AI_HELPER_ASR_MAX_SESSIONS)
  : 1;

// RSS 保护阈值：超过后跳过 offline 定稿，直接用流式文本（避免 OOM 拖垮整个代理）
export const RSS_LIMIT_BYTES = Number(process.env.AI_HELPER_ASR_RSS_LIMIT) > 0
  ? Number(process.env.AI_HELPER_ASR_RSS_LIMIT)
  : 3.5 * 1024 * 1024 * 1024;

// 支持的识别语言（SenseVoice 覆盖语种 + auto）
export const SUPPORTED_LANGUAGES = ['auto', 'zh', 'en', 'ja', 'ko', 'yue'];

// 默认配置：enabled=false —— 装了依赖也不自动启用，避免「装了就该能用」的误解
export const DEFAULT_ASR_CONFIG = {
  enabled: false,
  language: 'auto',
  // 指定模型包 id（null = 按 capability 自动选第一个可用包）
  streamingModelId: null,
  offlineModelId: null,
  // 引擎空闲卸载时间（毫秒；0 = 不卸载）
  idleUnloadMs: 10 * 60 * 1000,
};

/**
 * 收敛用户配置（防篡改/损坏：类型不符一律回落默认值）
 * @param {object|null} raw
 * @returns {object}
 */
export function sanitizeAsrConfig(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const idle = Number(src.idleUnloadMs);
  return {
    enabled: src.enabled === true,
    language: SUPPORTED_LANGUAGES.includes(src.language) ? src.language : DEFAULT_ASR_CONFIG.language,
    streamingModelId: typeof src.streamingModelId === 'string' && src.streamingModelId.trim()
      ? src.streamingModelId.trim()
      : null,
    offlineModelId: typeof src.offlineModelId === 'string' && src.offlineModelId.trim()
      ? src.offlineModelId.trim()
      : null,
    idleUnloadMs: Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_ASR_CONFIG.idleUnloadMs,
  };
}

// 进程内配置缓存（避免每次请求都读盘）
let cachedConfig = null;

/**
 * 读取用户配置（文件缺失/损坏 → 默认配置，绝不抛错）
 * @returns {object}
 */
export function getAsrConfig() {
  if (cachedConfig) return { ...cachedConfig };
  let raw = null;
  try {
    raw = JSON.parse(readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    raw = null;
  }
  cachedConfig = sanitizeAsrConfig(raw);
  return { ...cachedConfig };
}

/**
 * 原子写配置（先写临时文件再 rename，避免写一半被读到）
 * @param {object} next
 */
function persistConfig(next) {
  mkdirSync(ASR_ROOT, { recursive: true });
  const tmp = `${CONFIG_FILE}.tmp`;
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf-8');
  renameSync(tmp, CONFIG_FILE);
}

/**
 * 合并更新配置（只接受白名单字段；返回更新后的完整配置）
 * @param {object} patch
 * @returns {object}
 */
export function saveAsrConfig(patch = {}) {
  const current = getAsrConfig();
  const merged = sanitizeAsrConfig({ ...current, ...patch });
  persistConfig(merged);
  cachedConfig = merged;
  return { ...merged };
}

/**
 * 重置进程内配置缓存（测试 / 外部改写配置文件后使用）
 */
export function resetAsrConfigCache() {
  cachedConfig = null;
}

/**
 * 配置是否已存在（启动期零成本探测的判据之一）
 * @returns {boolean}
 */
export function hasAsrConfigFile() {
  return existsSync(CONFIG_FILE);
}
