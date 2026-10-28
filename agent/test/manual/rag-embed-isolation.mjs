#!/usr/bin/env node
// agent/test/manual/rag-embed-isolation.mjs - 本地 embedding 进程隔离的手工验证脚本（不入 CI）
//
// 验证两件事（Windows 上语音输入 + 知识库同时启用时才有意义，但任何平台都能跑）：
//   1. 真实模型推理可用：embed(['测试']) → 512 维；countTokens 返回窗口与计数
//   2. 主进程不加载任何 onnxruntime/sherpa 原生库：推理全在 embed-worker 子进程里完成
//      （这正是 "cannot run %1 / onnxruntime_binding.node" 的根治点 —— 主进程里
//       sherpa 的 onnxruntime.dll 与 onnxruntime-node 的 dll 不再共存）
//
// 运行方式（agent 包目录内，需先一键安装 RAG 依赖）：
//   node test/manual/rag-embed-isolation.mjs
// 退出码：0 = 通过；2 = 主进程被污染；1 = 推理失败。
//
// Windows 上还可以额外核对（PowerShell）：只应剩一份 onnxruntime.dll（排除 sherpa 自带那份）
//   Get-ChildItem -Recurse -Filter onnxruntime.dll node_modules | Select-Object FullName

import { LocalEmbedding } from '../../src/rag/embedding/local.js';
import { closeEmbedWorker } from '../../src/rag/embedding/worker-client.js';
import { listNativeCopies } from '../../src/native-lib-guard.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const AGENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const EXPECTED_DIMS = 512;

/** 读包名目录下的 package.json（读不到返回 null） */
function readPackage(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 主进程已加载的原生库。
 * sharedObjects 是 Node 的**未文档化**字段，部分平台/版本不提供：探不到就必须报「无证据」
 * 而不是当成「没加载」——否则这个脚本在出问题的平台上会永远 PASS。
 * @returns {{ available: boolean, libs: string[] }}
 */
function nativeLibs() {
  let shared = null;
  try {
    const report = process.report.getReport();
    shared = Array.isArray(report.sharedObjects) ? report.sharedObjects : null;
  } catch { shared = null; }
  return {
    available: shared !== null,
    libs: shared ? shared.filter((p) => /onnxruntime|sherpa/i.test(p)) : [],
  };
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const before = nativeLibs();
console.log(`main-process native libs before: ${before.libs.length}`, before.libs);
if (!before.available) {
  console.warn('⚠ 本平台/Node 版本不提供 sharedObjects：无法枚举已加载的共享库，隔离性结论不成立（不是通过）');
}

// 1. 副本去重现状（Windows 上装过语音输入后重点看这里）
const copies = listNativeCopies(AGENT_ROOT);
console.log('onnxruntime copies in node_modules:');
for (const copy of copies) {
  console.log(`  ${copy.name}@${copy.version || '?'} -> ${copy.path}`);
}
const duplicated = copies.length !== new Set(copies.map((c) => c.name)).size;
if (duplicated) {
  console.warn('⚠ 存在重复的 onnxruntime-node：一键重装任一可选依赖会自动去重（native-lib-guard）');
}

// binding 与 JS 胶水层的版本必须同源：顶层 common 被抬成别的版本时，
// 表现为 "API version [N] is not available"（同一个 dll 冲突家族的另一半）。
const ortNodePkg = readPackage(join(AGENT_ROOT, 'node_modules', 'onnxruntime-node'));
const commonPkg = readPackage(join(AGENT_ROOT, 'node_modules', 'onnxruntime-common'));
if (ortNodePkg || commonPkg) {
  const required = ortNodePkg?.dependencies?.['onnxruntime-common'] || '?';
  console.log(`top-level onnxruntime-node@${ortNodePkg?.version || '?'} requires common ${required}, installed ${commonPkg?.version || '?'}`);
  if (!commonPkg?.version || (required !== '?' && commonPkg.version !== required)) {
    console.warn('⚠ onnxruntime-common 与 onnxruntime-node 要求的版本不一致，可能报 "API version [N] is not available"');
  }
}

// 2. 真实推理
const local = new LocalEmbedding({});
const vectors = await local.embed(['测试', '知识库检索']);
for (const vector of vectors) {
  if (!Array.isArray(vector) || vector.length !== EXPECTED_DIMS) {
    fail(`embedding dims ${Array.isArray(vector) ? vector.length : 'n/a'} != ${EXPECTED_DIMS}`);
  }
  if (!vector.every((n) => Number.isFinite(n))) fail('embedding 含非有限值');
}
console.log(`embed ok: ${vectors.length} x ${vectors[0].length}`, vectors[0].slice(0, 3).map((n) => Number(n.toFixed(4))));

const counted = await local.countTokens(['测试文本']);
console.log('countTokens ok:', counted);
if (!(counted.window > 0) || counted.counts.length !== 1) fail(`countTokens 异常: ${JSON.stringify(counted)}`);

// 3. 主进程隔离
const after = nativeLibs();
console.log(`main-process native libs after: ${after.libs.length}`, after.libs);
await closeEmbedWorker();

if (after.libs.length > 0) {
  fail('主进程加载了 onnxruntime/sherpa 原生库：embedding 必须在子进程里跑');
}
if (!after.available) {
  console.error('✖ 无法取证：本平台不支持 sharedObjects 枚举，请改用文件头的 PowerShell dll 计数核对');
  process.exit(2);
}
console.log('✔ 通过：推理在子进程完成，主进程零 onnxruntime 加载');
process.exit(0);
