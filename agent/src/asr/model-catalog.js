// agent/src/asr/model-catalog.js - 内置推荐模型清单（自动下载的唯一事实来源）
//
// 分发走两条腿（两条都要保留，不能二选一）：
//   1. 能访问外网 / 能访问 HF 镜像：配置页一键下载，逐文件拉取后本地生成 manifest.json
//   2. 完全内网：在能上网的机器上备好同构目录，用「从文件夹导入」或直接拷进 MODELS_DIR
//
// 为什么不下官方 .tar.bz2：Node 标准库没有 bzip2 解压能力，为解压引入依赖不值得；
// HF 仓库里每个文件都能单独 HTTP 取，且实测 Content-Length 与本地已验证文件字节数
// 完全一致，可直接用内置 sha256 校验。
//
// 端点策略：默认 hf-mirror（实测 huggingface.co 国内直连不可达：curl 返回 000）；
// mirrors.json 里 huggingface === 'mirror' 时同样走镜像，AI_HELPER_ASR_HF_ENDPOINT
// 可显式覆盖（其它地区的部署用它指向官方站点或自建代理）。
//
// 安全约束：下载目标 id 只能取自本清单白名单，绝不接受调用方传入的任意字符串，
// 因此不存在拼路径穿越的入口。

import { getHfEndpoint } from '../install-mode.js';

// 默认模型下载端点（实测可达；huggingface.co 直连超时）
const DEFAULT_HF_ENDPOINT = 'https://hf-mirror.com';

// manifest 的 schema 版本必须与 model-pack.js 的 MANIFEST_SCHEMA 一致
const MANIFEST_SCHEMA = 1;

/**
 * 推荐模型清单
 *
 * 每个条目的 manifest / sha256 均以本地已跑通的模型包为准（实测转写通过），
 * 不按上游文件目录动态推导——上游新增文件不应该改变我们的加载参数。
 */
export const MODEL_CATALOG = [
  {
    id: 'sense-voice-zh-en-ja-ko-yue',
    name: 'SenseVoice 中英日韩粤（int8，定稿）',
    kind: 'offline',
    repo: 'csukuangfj/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17',
    description: '松手后整段高精度转写，自动带标点并把数字规整为阿拉伯数字',
    files: [
      {
        name: 'model.int8.onnx',
        size: 239233841,
        sha256: 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51',
      },
      {
        name: 'tokens.txt',
        size: 315894,
        sha256: 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc',
      },
    ],
    manifest: {
      schema: MANIFEST_SCHEMA,
      engine: 'sherpa-onnx',
      id: 'sense-voice-zh-en-ja-ko-yue',
      name: 'SenseVoice 中英日韩粤（int8，定稿）',
      kind: 'offline',
      arch: 'senseVoice',
      language: 'zh-en',
      senseVoiceLanguage: 'auto',
      decodingMethod: 'greedy_search',
      sampleRate: 16000,
      modelFile: 'model.int8.onnx',
      tokensFile: 'tokens.txt',
      files: ['model.int8.onnx', 'tokens.txt'],
      sha256: {
        'model.int8.onnx': 'c71f0ce00bec95b07744e116345e33d8cbbe08cef896382cf907bf4b51a2cd51',
        'tokens.txt': 'f449eb28dc567533d7fa59be34e2abca8784f771850c78a47fb731a31429a1dc',
      },
    },
  },
  {
    id: 'streaming-zipformer-bilingual-zh-en',
    name: 'Streaming Zipformer 中英双语（int8，流式草稿）',
    kind: 'online',
    repo: 'csukuangfj/sherpa-onnx-streaming-zipformer-bilingual-zh-en-2023-02-20',
    description: '边说边出草稿；松手后仍由定稿模型覆盖。small 版质量不足，不推荐',
    files: [
      {
        name: 'encoder-epoch-99-avg-1.int8.onnx',
        size: 181895032,
        sha256: '8fa764187a261844f859d7143ebaa563af5d10adfece4c18a8f414c88cba2a9b',
      },
      {
        name: 'decoder-epoch-99-avg-1.int8.onnx',
        size: 13091040,
        sha256: '1a70c593d71e53f023f5f55b0b4cfff5055abb786ee3992e5f63dc2e273cc4fa',
      },
      {
        name: 'joiner-epoch-99-avg-1.int8.onnx',
        size: 3228404,
        sha256: '1ed689c5ed19dbaa725d9d191bb4822b5f4855a39e1ffd28cbc1f340d25b2ee0',
      },
      {
        name: 'tokens.txt',
        size: 56317,
        sha256: 'a8e0e4ec53810e433789b54a5c0134a7eaa2ffca595a6334d54c00da858841d3',
      },
    ],
    manifest: {
      schema: MANIFEST_SCHEMA,
      engine: 'sherpa-onnx',
      id: 'streaming-zipformer-bilingual-zh-en',
      name: 'Streaming Zipformer 中英双语（int8，流式草稿）',
      kind: 'online',
      arch: 'transducer',
      language: 'zh-en',
      sampleRate: 16000,
      encoder: 'encoder-epoch-99-avg-1.int8.onnx',
      decoder: 'decoder-epoch-99-avg-1.int8.onnx',
      joiner: 'joiner-epoch-99-avg-1.int8.onnx',
      tokensFile: 'tokens.txt',
      files: [
        'encoder-epoch-99-avg-1.int8.onnx',
        'decoder-epoch-99-avg-1.int8.onnx',
        'joiner-epoch-99-avg-1.int8.onnx',
        'tokens.txt',
      ],
      sha256: {
        'encoder-epoch-99-avg-1.int8.onnx': '8fa764187a261844f859d7143ebaa563af5d10adfece4c18a8f414c88cba2a9b',
        'decoder-epoch-99-avg-1.int8.onnx': '1a70c593d71e53f023f5f55b0b4cfff5055abb786ee3992e5f63dc2e273cc4fa',
        'joiner-epoch-99-avg-1.int8.onnx': '1ed689c5ed19dbaa725d9d191bb4822b5f4855a39e1ffd28cbc1f340d25b2ee0',
        'tokens.txt': 'a8e0e4ec53810e433789b54a5c0134a7eaa2ffca595a6334d54c00da858841d3',
      },
    },
  },
];

/** 一键下载的默认目标（定稿 + 草稿） */
export const DEFAULT_DOWNLOAD_IDS = MODEL_CATALOG.map((entry) => entry.id);

/**
 * 按 id 取清单条目（白名单查询：非法 id 一律返回 null）
 * @param {string} id
 * @returns {object|null}
 */
export function getCatalogEntry(id) {
  if (typeof id !== 'string') return null;
  return MODEL_CATALOG.find((entry) => entry.id === id) || null;
}

/**
 * 条目总字节数
 * @param {object} entry
 * @returns {number}
 */
export function getEntryBytes(entry) {
  return entry.files.reduce((sum, file) => sum + file.size, 0);
}

/**
 * 归一化调用方传入的 id 列表
 *
 * 只保留清单内存在的 id（去重、保持清单顺序）；传空/非法一律回落为默认组合，
 * 这样接口既支持「只下其中一个」，也不会被任意字符串利用。
 * @param {unknown} ids
 * @returns {object[]}
 */
export function resolveCatalogEntries(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return MODEL_CATALOG.filter((entry) => DEFAULT_DOWNLOAD_IDS.includes(entry.id));
  }
  const wanted = new Set(ids.filter((id) => typeof id === 'string'));
  return MODEL_CATALOG.filter((entry) => wanted.has(entry.id));
}

/**
 * 当前模型下载端点（不带结尾斜杠）
 * @returns {string}
 */
export function resolveHfEndpoint() {
  const override = process.env.AI_HELPER_ASR_HF_ENDPOINT;
  if (typeof override === 'string' && /^https?:\/\//i.test(override.trim())) {
    return override.trim().replace(/\/+$/, '');
  }
  const fromMirrors = getHfEndpoint();
  const base = fromMirrors || DEFAULT_HF_ENDPOINT;
  return base.replace(/\/+$/, '');
}

/**
 * 单个文件的下载地址
 * @param {string} repo HF 仓库（org/name）
 * @param {string} fileName
 * @returns {string}
 */
export function buildFileUrl(repo, fileName) {
  return `${resolveHfEndpoint()}/${repo}/resolve/main/${encodeURIComponent(fileName)}`;
}

/**
 * 对外展示用的清单视图（隐藏 repo 内部细节，保留体积/说明/是否已安装）
 * @param {{ installedIds?: Set<string>|string[] }} [opts]
 * @returns {object[]}
 */
export function toPublicCatalog(opts = {}) {
  const installed = opts.installedIds instanceof Set
    ? opts.installedIds
    : new Set(Array.isArray(opts.installedIds) ? opts.installedIds : []);
  return MODEL_CATALOG.map((entry) => ({
    id: entry.id,
    name: entry.name,
    kind: entry.kind,
    description: entry.description,
    totalBytes: getEntryBytes(entry),
    installed: installed.has(entry.id),
  }));
}
