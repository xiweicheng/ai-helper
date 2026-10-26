// agent/src/asr/engine.js - sherpa-onnx-node 引擎封装（懒加载 + 空闲卸载）
//
// 设计要点：
//   - 依赖通过 createRequire 加载（sherpa-onnx-node 是 CJS 包，预编译原生模块）
//   - 三类实例分别懒加载并缓存：offline（整段定稿）/ online（流式草稿）/ vad（断句）
//   - 按 modelId 缓存：用户换模型即换 key，旧实例随空闲卸载释放
//   - 加载失败抛出带原因的错误（绝不静默降级成"没识别到"）
//   - 空闲 idleUnloadMs 后释放引用并把缓存置空，避免 onnxruntime 常驻数百 MB
//
// 关于配置键名：不同 sherpa-onnx-node 版本对 config 的键名有差异（camelCase / snake_case）。
// 这里以官方 README 的 camelCase 为准构造，并在构造失败时按首错信息给出可读诊断；
// engine 层只依赖 manifest 声明的文件，不猜模型内部结构（M0 探针脚本负责在目标机核对键名）。

import { cpus } from 'os';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// 特征维度（sherpa-onnx 全系列模型固定 80 维 fbank）
const FEATURE_DIM = 80;

// 原生线程数：clamp(1..4, cpus-1)，单用户本机形态下留一个核给主进程 IO
function pickNumThreads() {
  const n = cpus().length;
  return Math.max(1, Math.min(4, (Number.isFinite(n) ? n : 2) - 1));
}

// ---- 缓存：key = `${kind}:${modelId}` ----
const cache = new Map();

// 空闲卸载定时器
let idleTimer = null;

// 已加载的模块引用（首次成功加载后复用）
let sherpaModule = null;

// 可注入的模块获取器（测试用；生产不传）
let moduleLoader = null;

/**
 * 注入 sherpa 模块加载器（仅测试用：传 () => fakeModule）
 * @param {(() => object)|null} loader
 */
export function setSherpaModuleLoader(loader) {
  moduleLoader = typeof loader === 'function' ? loader : null;
  cache.clear();
}

/**
 * 加载 sherpa-onnx-node 模块（失败抛出带原因的错误）
 * @returns {object}
 */
function loadSherpa() {
  if (sherpaModule) return sherpaModule;
  if (moduleLoader) {
    sherpaModule = moduleLoader();
    if (!sherpaModule) throw new Error('sherpa module loader returned nothing');
    return sherpaModule;
  }
  try {
    sherpaModule = require('sherpa-onnx-node');
  } catch (err) {
    throw new Error(`sherpa-onnx-node load failed: ${err.message}`);
  }
  if (!sherpaModule || typeof sherpaModule !== 'object') {
    throw new Error('sherpa-onnx-node exports nothing');
  }
  return sherpaModule;
}

/**
 * 解析构造器：优先同名导出，其次 create<Name> 工厂（跨版本兼容）
 * @param {object} mod
 * @param {string} name 如 'OfflineRecognizer'
 * @returns {Function}
 */
function resolveCtor(mod, name) {
  if (typeof mod[name] === 'function') return mod[name];
  const factory = `create${name}`;
  if (typeof mod[factory] === 'function') return mod[factory];
  throw new Error(`sherpa-onnx-node missing ${name} (exports: ${Object.keys(mod).join(', ')})`);
}

/**
 * 回收单条缓存实例（调用可选的 free()/close() 后置空）
 * @param {string} key
 */
function dropEntry(key) {
  const entry = cache.get(key);
  if (!entry) return;
  cache.delete(key);
  const inst = entry.instance;
  for (const method of ['free', 'close', 'dispose']) {
    if (inst && typeof inst[method] === 'function') {
      try { inst[method](); } catch { /* 原生释放失败不影响后续 */ }
      break;
    }
  }
}

/**
 * 重置空闲卸载定时器（每次取用实例后调用）
 * @param {number} idleUnloadMs
 */
function scheduleIdleUnload(idleUnloadMs) {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  if (!(idleUnloadMs > 0)) return;
  idleTimer = setTimeout(() => {
    idleTimer = null;
    for (const key of Array.from(cache.keys())) dropEntry(key);
  }, idleUnloadMs);
  // daemon 不应因为一个空闲定时器而无法退出
  if (typeof idleTimer.unref === 'function') idleTimer.unref();
}

/**
 * 主动释放所有引擎实例（停服 / 重新检测 / 内存保护时调用）
 */
export function disposeAllEngines() {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
  for (const key of Array.from(cache.keys())) dropEntry(key);
}

/**
 * 当前已加载的引擎信息（供 /api/asr/status 展示）
 * @returns {{ offline: string|null, online: string|null, vad: string|null }}
 */
export function getLoadedEngineInfo() {
  const info = { offline: null, online: null, vad: null };
  for (const [key, entry] of cache.entries()) {
    const [kind, modelId] = key.split(':');
    if (kind in info) info[kind] = modelId;
  }
  return info;
}

/**
 * 构造 featConfig（所有模型共用）
 */
function buildFeatConfig(model) {
  return {
    sampleRate: model.sampleRate || 16000,
    featureDim: FEATURE_DIM,
  };
}

/**
 * 构造 offline 模型的 modelConfig（按 manifest.arch 分派，默认 SenseVoice）
 * @param {object} model
 */
function buildOfflineModelConfig(model) {
  const base = {
    tokens: model.tokensFile,
    numThreads: pickNumThreads(),
    provider: 'cpu',
    debug: false,
  };
  switch (model.arch) {
    case 'paraformer':
      return { ...base, paraformer: { model: model.modelFile } };
    case 'whisper':
      return {
        ...base,
        whisper: {
          encoder: model.encoder,
          decoder: model.decoder,
          language: model.senseVoiceLanguage === 'auto' ? 'auto' : model.senseVoiceLanguage,
          task: 'transcribe',
        },
      };
    case 'senseVoice':
    default:
      return {
        ...base,
        senseVoice: {
          model: model.modelFile,
          // 逆文本规整：把「一二三」规整成「123」、补标点（SenseVoice 内置能力）
          useInverseTextNormalization: 1,
          language: model.senseVoiceLanguage || 'auto',
        },
      };
  }
}

/**
 * 构造 online 模型的 modelConfig（按 manifest.arch 分派，默认 transducer）
 * @param {object} model
 */
function buildOnlineModelConfig(model) {
  const base = {
    tokens: model.tokensFile,
    numThreads: pickNumThreads(),
    provider: 'cpu',
    debug: false,
  };
  switch (model.arch) {
    case 'paraformerStreaming':
      return { ...base, paraformer: { model: model.modelFile } };
    case 'zipformer2':
      return {
        ...base,
        zipformer2Ctc: { model: model.modelFile },
      };
    case 'transducer':
    default:
      return {
        ...base,
        transducer: {
          encoder: model.encoder,
          decoder: model.decoder,
          joiner: model.joiner,
        },
      };
  }
}

/**
 * 获取 offline 识别器（整段定稿；懒加载 + 缓存）
 * @param {object} model model-pack 解析出的模型描述
 * @returns {object} sherpa OfflineRecognizer 实例
 */
export function getOfflineRecognizer(model, opts = {}) {
  const key = `offline:${model.id}`;
  const hit = cache.get(key);
  if (hit) {
    scheduleIdleUnload(opts.idleUnloadMs);
    return hit.instance;
  }
  const sherpa = loadSherpa();
  const Ctor = resolveCtor(sherpa, 'OfflineRecognizer');
  let instance;
  try {
    instance = new Ctor({
      featConfig: buildFeatConfig(model),
      modelConfig: buildOfflineModelConfig(model),
    });
  } catch (err) {
    throw new Error(`offline recognizer init failed (${model.id}): ${err.message}`);
  }
  cache.set(key, { instance, kind: 'offline', modelId: model.id });
  scheduleIdleUnload(opts.idleUnloadMs);
  return instance;
}

/**
 * 获取 online 识别器（流式草稿；懒加载 + 缓存）
 * @param {object} model
 * @returns {object}
 */
export function getOnlineRecognizer(model, opts = {}) {
  const key = `online:${model.id}`;
  const hit = cache.get(key);
  if (hit) {
    scheduleIdleUnload(opts.idleUnloadMs);
    return hit.instance;
  }
  const sherpa = loadSherpa();
  const Ctor = resolveCtor(sherpa, 'OnlineRecognizer');
  let instance;
  try {
    instance = new Ctor({
      featConfig: buildFeatConfig(model),
      modelConfig: buildOnlineModelConfig(model),
      decodingMethod: model.decodingMethod || 'greedy_search',
      // 端点检测：整句说完自动切段，草稿不必跨句累积（规则阈值取官方常用值）
      enableEndpoint: true,
      rule1MinTrailingSilence: 2.4,
      rule2MinTrailingSilence: 1.2,
      rule3MinUtteranceLength: 20,
    });
  } catch (err) {
    throw new Error(`online recognizer init failed (${model.id}): ${err.message}`);
  }
  cache.set(key, { instance, kind: 'online', modelId: model.id });
  scheduleIdleUnload(opts.idleUnloadMs);
  return instance;
}

/**
 * 获取 VAD（断句；懒加载 + 缓存）
 *
 * ⚠️ 默认禁用（AI_HELPER_ASR_VAD=1 可显式开启）：sherpa-onnx-node 2.0.1 在
 * `vad.front()` 首次取段时直接 SIGSEGV（VoiceActivityDetectorFrontWrapper，
 * EXC_BAD_ACCESS at 0x8）。isDetected() 转为 true 后一调 front() 必崩，属于原生层
 * 崩溃：JS 的 try/catch 拦不住，整个代理进程会当场退出，且没有任何日志栈可追。
 * 已实测排除：单参/两参构造、front()/front(true)/front(false)、silero_vad.onnx
 * 与 silero_vad_v5.onnx —— 全部复现，故判定为库缺陷而非配置问题。
 * 因此默认返回 null，转写走固定切分兜底（见 transcribe.js splitByVad），
 * 需要在其它平台或更高版本 sherpa-onnx-node 上重新验证时再显式开启。
 * @param {object} model
 * @returns {object|null} 禁用/无 vad 模型时返回 null（调用方按不分段处理）
 */
export function getVad(model, opts = {}) {
  if (!model) return null;
  if (process.env.AI_HELPER_ASR_VAD !== '1') return null;
  const key = `vad:${model.id}`;
  const hit = cache.get(key);
  if (hit) {
    scheduleIdleUnload(opts.idleUnloadMs);
    return hit.instance;
  }
  const sherpa = loadSherpa();
  const Ctor = resolveCtor(sherpa, 'Vad');
  let instance;
  try {
    // 注意：sherpa-onnx-node 的 Vad 构造签名是 (config, bufferSizeInSeconds)，
    // bufferSizeInSeconds 不是 config 字段（写进 config 会被忽略）
    instance = new Ctor({
      sileroVad: {
        model: model.modelFile,
        threshold: 0.5,
        minSpeechDuration: 0.25,
        minSilenceDuration: 0.5,
        maxSpeechDuration: 8,
        windowSize: 512,
      },
      sampleRate: model.sampleRate || 16000,
      numThreads: 1,
      provider: 'cpu',
      debug: false,
    }, 60);
  } catch (err) {
    throw new Error(`vad init failed (${model.id}): ${err.message}`);
  }
  cache.set(key, { instance, kind: 'vad', modelId: model.id });
  scheduleIdleUnload(opts.idleUnloadMs);
  return instance;
}

/**
 * 预热（启动期异步调用；失败只记日志，绝不阻塞启动）
 * @param {{ offline: object|null, online: object|null }} models
 * @returns {{ warmed: string[], failed: Array<{kind: string, error: string}> }}
 */
export function warmupEngines(models, opts = {}) {
  const warmed = [];
  const failed = [];
  if (models?.online) {
    try { getOnlineRecognizer(models.online, opts); warmed.push('online'); }
    catch (err) { failed.push({ kind: 'online', error: err.message }); }
  }
  if (models?.offline) {
    try { getOfflineRecognizer(models.offline, opts); warmed.push('offline'); }
    catch (err) { failed.push({ kind: 'offline', error: err.message }); }
  }
  return { warmed, failed };
}
