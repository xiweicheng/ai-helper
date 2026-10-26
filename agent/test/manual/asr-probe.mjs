#!/usr/bin/env node
/**
 * ASR 前置探针（manual 手工脚本，不入 CI）
 *
 * 目的（计划阶段 M0）：
 *   1. 验证目标机器上 `sherpa-onnx-node` 可加载，并打印版本 / 导出键；
 *   2. 用官方 test_wavs 跑一次 online（streaming zipformer）与 offline（SenseVoice）解码，
 *      打印真实配置形状、单次解码耗时（RTF）、内存峰值；
 *   3. 产出的配置形状用于校准 src/asr/engine.js 的 featConfig / modelConfig 键名。
 *
 * 运行方式（在 agent 包目录内，需先安装依赖）：
 *   npm install --no-save sherpa-onnx-node@^2.0.0
 *   node test/manual/asr-probe.mjs
 *   node test/manual/asr-probe.mjs --models ~/.ai-helper-agent/asr/models
 *   node test/manual/asr-probe.mjs --wav /path/to/16k.wav
 *
 * 说明：
 *   - 该脚本刻意使用 createRequire（CJS）加载依赖，与 engine.js 的加载方式一致；
 *   - 绝不修改正式配置与模型目录，只读；
 *   - 失败时退出码非 0，并打印可操作的诊断建议。
 */

import { createRequire } from 'module';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, basename } from 'path';
import { homedir } from 'os';

const require = createRequire(import.meta.url);

const ASR_ROOT = process.env.AI_HELPER_ASR_ROOT || join(homedir(), '.ai-helper-agent', 'asr');
const DEFAULT_MODELS_DIR = join(ASR_ROOT, 'models');

function parseArgs(argv) {
  const opts = { modelsDir: DEFAULT_MODELS_DIR, wav: null, language: 'zh' };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--models' && argv[i + 1]) opts.modelsDir = argv[++i];
    else if (arg === '--wav' && argv[i + 1]) opts.wav = argv[++i];
    else if (arg === '--language' && argv[i + 1]) opts.language = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('用法: node test/manual/asr-probe.mjs [--models <dir>] [--wav <file.wav>] [--language zh]');
      process.exit(0);
    }
  }
  return opts;
}

function section(title) {
  console.log(`\n=============== ${title} ===============`);
}

function fmtMB(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/** 扫描模型目录，读 manifest 的 kind/modelFile 等字段（只读，不做 sha256 校验以节省时间） */
function scanLocalModels(modelsDir) {
  const result = { online: null, offline: null, vad: null, all: [], errors: [] };
  if (!existsSync(modelsDir)) {
    result.errors.push(`模型目录不存在: ${modelsDir}`);
    return result;
  }
  for (const entry of readdirSync(modelsDir)) {
    const dir = join(modelsDir, entry);
    const manifestPath = join(dir, 'manifest.json');
    if (!existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      const model = { dir, id: manifest.id || entry, kind: manifest.kind, arch: manifest.arch, manifest };
      result.all.push(model);
      if (model.kind && !result[model.kind]) result[model.kind] = model;
    } catch (err) {
      result.errors.push(`${manifestPath}: ${err.message}`);
    }
  }
  return result;
}

function resolveModelFile(model, key) {
  const rel = model.manifest[key];
  if (!rel) return null;
  const abs = join(model.dir, rel);
  return existsSync(abs) ? abs : null;
}

function reportMemory(label) {
  const mu = process.memoryUsage();
  console.log(
    `  [内存] ${label}: rss=${fmtMB(mu.rss)} heapUsed=${fmtMB(mu.heapUsed)} external=${fmtMB(mu.external)}`
  );
  return mu.rss;
}

async function probeModule() {
  section('1) 依赖加载');
  console.log(`  node: ${process.version} (${process.platform}-${process.arch})`);
  const info = { ok: false, version: null, exportKeys: [], resolved: null, error: null };
  try {
    const mod = require('sherpa-onnx-node');
    info.ok = true;
    info.resolved = require.resolve('sherpa-onnx-node');
    info.exportKeys = mod && typeof mod === 'object' ? Object.keys(mod) : [];
    try {
      const pkg = require('sherpa-onnx-node/package.json');
      info.version = pkg?.version || null;
    } catch {
      /* 某些打包方式不暴露 package.json */
    }
  } catch (err) {
    info.error = err?.message || String(err);
  }

  if (!info.ok) {
    console.log(`  ❌ 加载失败: ${info.error}`);
    console.log('  建议：确认已在 agent 包目录执行 npm install --no-save sherpa-onnx-node@^2.0.0');
    console.log('        并确认内网 npm 镜像已代理本平台预编译包 sherpa-onnx-<os>-<arch>');
    return info;
  }
  console.log(`  ✅ 加载成功 version=${info.version || '?'}`);
  console.log(`  resolved: ${info.resolved}`);
  console.log(`  exportKeys: ${info.exportKeys.join(', ')}`);
  return info;
}

/** 读取 16k/mono/PCM16 WAV 为 Float32（探针只需支持该规格） */
function readWavFloat32(filePath) {
  const buf = readFileSync(filePath);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('不是合法的 WAV 文件');
  }
  let offset = 12;
  let fmt = null;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buf.length) {
    const id = buf.toString('ascii', offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === 'fmt ') {
      fmt = {
        audioFormat: buf.readUInt16LE(body),
        channels: buf.readUInt16LE(body + 2),
        sampleRate: buf.readUInt32LE(body + 4),
        bitsPerSample: buf.readUInt16LE(body + 14)
      };
    } else if (id === 'data') {
      dataStart = body;
      dataLen = Math.min(size, buf.length - body);
    }
    offset = body + size + (size % 2);
  }
  if (!fmt || dataStart < 0) throw new Error('WAV 缺少 fmt/data chunk');
  if (fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16) {
    throw new Error(`探针仅支持 PCM16 WAV（当前 format=${fmt.audioFormat} bits=${fmt.bitsPerSample}）`);
  }
  if (fmt.sampleRate !== 16000) {
    throw new Error(`探针要求 16k 采样（当前 ${fmt.sampleRate}），请先用 ffmpeg 重采样`);
  }
  const frameBytes = 2 * fmt.channels;
  const frames = Math.floor(dataLen / frameBytes);
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    const base = dataStart + i * frameBytes;
    samples[i] = buf.readInt16LE(base) / 32768;
  }
  return samples;
}

/** 找官方 test_wavs（随包分发） */
function findBundledWav() {
  try {
    const root = require.resolve('sherpa-onnx-node');
    const candidates = [
      join(root, '..', '..', 'test_wavs'),
      join(root, '..', 'test_wavs')
    ];
    for (const dir of candidates) {
      if (!existsSync(dir)) continue;
      const wav = readdirSync(dir).find((f) => f.endsWith('.wav'));
      if (wav) return join(dir, wav);
    }
  } catch {
    /* ignore */
  }
  return null;
}

function probeOffline(sherpa, model, samples) {
  section('2) offline 识别（SenseVoice 定稿路径）');
  if (!model) {
    console.log('  ⏭  未找到 offline 模型包，跳过');
    return null;
  }
  const modelFile = resolveModelFile(model, 'modelFile');
  const tokensFile = resolveModelFile(model, 'tokensFile');
  if (!modelFile || !tokensFile) {
    console.log(`  ❌ 模型 ${model.id} 缺少 modelFile/tokensFile`);
    return null;
  }
  console.log(`  model: ${model.id} (arch=${model.arch || 'senseVoice'})`);
  console.log(`  file:  ${basename(modelFile)} (${fmtMB(statSync(modelFile).size)})`);

  const numThreads = Math.max(1, Math.min(4, (require('os').cpus().length || 2) - 1));
  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      tokens: tokensFile,
      numThreads,
      provider: 'cpu',
      debug: false,
      senseVoice: {
        model: modelFile,
        useInverseTextNormalization: 1,
        language: 'zh'
      }
    }
  };
  console.log(`  config: ${JSON.stringify(config, null, 2).split('\n').join('\n  ')}`);

  const t0 = Date.now();
  let recognizer;
  try {
    const Ctor = sherpa.OfflineRecognizer || sherpa.createOfflineRecognizer;
    recognizer = new Ctor(config);
  } catch (err) {
    console.log(`  ❌ 创建 recognizer 失败: ${err?.message || err}`);
    console.log('  建议：校对 modelConfig 键名（本脚本假设 senseVoice.model / useInverseTextNormalization / language）');
    return null;
  }
  const loadMs = Date.now() - t0;
  const rssAfterLoad = reportMemory('load');

  const stream = recognizer.createStream();
  const t1 = Date.now();
  stream.acceptWaveform({ sampleRate: 16000, samples });
  recognizer.decode(stream);
  const result = recognizer.getResult(stream);
  const decodeMs = Date.now() - t1;
  const durationMs = (samples.length / 16000) * 1000;

  console.log(`  加载耗时: ${loadMs}ms`);
  console.log(`  解码耗时: ${decodeMs}ms / 音频 ${(durationMs / 1000).toFixed(2)}s → RTF=${(decodeMs / durationMs).toFixed(3)}`);
  console.log(`  识别文本: ${JSON.stringify(result?.text ?? '')}`);
  reportMemory('after-offline');
  return { loadMs, decodeMs, rss: rssAfterLoad, text: result?.text ?? '' };
}

function probeOnline(sherpa, model, samples) {
  section('3) online 识别（Streaming Zipformer 草稿路径）');
  if (!model) {
    console.log('  ⏭  未找到 online 模型包，跳过');
    return null;
  }
  const encoder = resolveModelFile(model, 'encoder');
  const decoder = resolveModelFile(model, 'decoder');
  const joiner = resolveModelFile(model, 'joiner');
  const tokensFile = resolveModelFile(model, 'tokensFile');
  if (!encoder || !decoder || !joiner || !tokensFile) {
    console.log(`  ❌ 模型 ${model.id} 缺少 encoder/decoder/joiner/tokensFile`);
    return null;
  }
  console.log(`  model: ${model.id} (arch=${model.arch || 'transducer'})`);

  const numThreads = Math.max(1, Math.min(4, (require('os').cpus().length || 2) - 1));
  const config = {
    featConfig: { sampleRate: 16000, featureDim: 80 },
    modelConfig: {
      transducer: { encoder, decoder, joiner },
      tokens: tokensFile,
      numThreads,
      provider: 'cpu',
      debug: false
    },
    decodingMethod: 'greedy_search',
    enableEndpoint: true,
    rule1MinTrailingSilence: 2.4,
    rule2MinTrailingSilence: 1.2,
    rule3MinUtteranceLength: 20
  };
  console.log(`  config: ${JSON.stringify(config, null, 2).split('\n').join('\n  ')}`);

  const t0 = Date.now();
  let recognizer;
  try {
    const Ctor = sherpa.OnlineRecognizer || sherpa.createOnlineRecognizer;
    recognizer = new Ctor(config);
  } catch (err) {
    console.log(`  ❌ 创建 recognizer 失败: ${err?.message || err}`);
    console.log('  建议：校对 modelConfig.transducer 键名与 modelType');
    return null;
  }
  const loadMs = Date.now() - t0;
  const rssAfterLoad = reportMemory('load');

  const stream = recognizer.createStream();
  const chunk = 1600; // 100ms
  const t1 = Date.now();
  let partials = 0;
  for (let i = 0; i < samples.length; i += chunk) {
    stream.acceptWaveform({ sampleRate: 16000, samples: samples.subarray(i, Math.min(i + chunk, samples.length)) });
    while (recognizer.isReady(stream)) recognizer.decode(stream);
    partials++;
  }
  // 补尾部静音以触发 endpoint / 冲刷尾部 token
  const tail = new Float32Array(16000);
  stream.acceptWaveform({ sampleRate: 16000, samples: tail });
  while (recognizer.isReady(stream)) recognizer.decode(stream);
  const text = typeof recognizer.getResult === 'function' ? recognizer.getResult(stream)?.text ?? '' : '';
  const decodeMs = Date.now() - t1;
  const durationMs = (samples.length / 16000) * 1000;

  console.log(`  加载耗时: ${loadMs}ms`);
  console.log(`  流式解码: ${decodeMs}ms / 音频 ${(durationMs / 1000).toFixed(2)}s → RTF=${(decodeMs / durationMs).toFixed(3)}`);
  console.log(`  送帧次数: ${partials}（100ms/帧）`);
  console.log(`  识别文本: ${JSON.stringify(text)}`);
  reportMemory('after-online');
  return { loadMs, decodeMs, rss: rssAfterLoad, text };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  console.log('AI Helper - ASR 前置探针（manual）');
  console.log(`模型目录: ${opts.modelsDir}`);

  const modInfo = await probeModule();

  section('本地模型包');
  const models = scanLocalModels(opts.modelsDir);
  if (models.all.length === 0) {
    console.log('  ⏭  未发现任何模型包（跳过解码探针）');
  } else {
    for (const m of models.all) console.log(`  - ${m.id} (kind=${m.kind}, arch=${m.arch || '-'})`);
  }
  for (const e of models.errors) console.log(`  ⚠ ${e}`);

  if (!modInfo.ok) {
    section('结果');
    console.log('  依赖不可用，解码探针无法执行');
    process.exit(1);
  }

  // 音频来源：--wav 显式指定 > 官方 test_wavs
  let wavPath = opts.wav;
  if (!wavPath) wavPath = findBundledWav();
  let samples = null;
  if (wavPath && existsSync(wavPath)) {
    try {
      samples = readWavFloat32(wavPath);
      console.log(`\n测试音频: ${wavPath}（${(samples.length / 16000).toFixed(2)}s）`);
    } catch (err) {
      console.log(`\n⚠ 读取测试音频失败: ${err.message}`);
    }
  } else {
    console.log('\n⚠ 未找到测试音频，将用 3s 静音代替（仅验证 recognizer 能否创建）');
    samples = new Float32Array(16000 * 3);
  }

  const offlineResult = probeOffline(modInfo.exportKeys.length ? require('sherpa-onnx-node') : null, models.offline, samples);
  const onlineResult = probeOnline(require('sherpa-onnx-node'), models.online, samples);

  section('结果汇总（回填计划 M0 产出）');
  console.table([
    {
      path: 'offline(senseVoice)',
      ok: !!offlineResult,
      loadMs: offlineResult?.loadMs ?? '-',
      decodeMs: offlineResult?.decodeMs ?? '-',
      rssMB: offlineResult ? Math.round(offlineResult.rss / 1024 / 1024) : '-',
      text: offlineResult?.text ?? '-'
    },
    {
      path: 'online(zipformer)',
      ok: !!onlineResult,
      loadMs: onlineResult?.loadMs ?? '-',
      decodeMs: onlineResult?.decodeMs ?? '-',
      rssMB: onlineResult ? Math.round(onlineResult.rss / 1024 / 1024) : '-',
      text: onlineResult?.text ?? '-'
    }
  ]);

  const anySuccess = !!offlineResult || !!onlineResult;
  if (!anySuccess) {
    console.log('\n⚠ 两条路径均未跑通。若模型目录为空属正常（仅验证依赖加载）。');
    console.log('  依赖加载成功但无模型时可继续部署，模型导入后再复跑本脚本。');
  }
  process.exit(anySuccess ? 0 : 1);
}

main().catch((err) => {
  console.error(`探针异常退出: ${err?.stack || err}`);
  process.exit(1);
});
