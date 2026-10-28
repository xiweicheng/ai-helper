// agent/src/native-lib-guard.js - node_modules 原生库副本清理（同一进程只允许一份 onnxruntime）
//
// 背景（Windows 实测，2026-10）：
//   Windows 的 LoadLibrary 按「模块基名」复用模块 —— 同一进程里出现第二份 onnxruntime.dll 时，
//   后来者直接拿到先加载那份的句柄。若两份版本不同，onnxruntime_binding.node 要求的 API 版本
//   在旧 dll 里不存在，加载即失败：
//     The operating system cannot run %1. ...\onnxruntime_binding.node
//   现实中会出现两份的原因：transformers 精确依赖某个 onnxruntime-node 版本，而我们在
//   package.json 用 overrides 钉了另一个版本（Intel Mac 必须钉 1.23.x，≥1.24 无 darwin/x64
//   二进制）。npm 在部分版本/安装顺序下不把两者合并，而是把冲突版本嵌套装到
//   node_modules/@huggingface/transformers/node_modules/onnxruntime-node。
//
// 因此每次一键安装（RAG / ASR 都会重算整个包目录依赖树）之后统一做一次「去重收口」：
// 保留顶层副本（overrides 指定的那个），删掉嵌套副本。这是确定性的磁盘操作，不依赖
// npm 对 overrides 的处理细节。
//
// 另一层隔离在代码侧：本地 embedding 跑在子进程（rag/embedding/embed-worker.mjs），
// 与语音输入的 sherpa-onnx 不共享地址空间。两条一起才完整 —— 子进程里若也有两份副本，
// 一样会撞。

import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { join } from 'path';

// 需要做「全树唯一」的原生依赖：只收 onnxruntime-node —— 它会加载 onnxruntime.dll，
// 同进程两份就抢句柄。onnxruntime-common 是纯 JS 胶水层（不带 dll），且 onnxruntime-web
// 会正常地嵌套一份自己钉的 dev 版，删它只会制造风险，不做。
export const NATIVE_DEDUPE_PACKAGES = ['onnxruntime-node'];

// 依赖树扫描深度上限（node_modules 嵌套超过 4 层的场景极罕见，避免异常目录把扫描拖死）
const MAX_DEPTH = 6;

// 隐藏目录（.pnpm / .bin / .cache / .yarn 等）一律不进入：
// pnpm 的 .pnpm 是内容寻址存储，删里面的副本会破坏链接；其余是缓存/工具目录。
// 实现上直接按「名字以 . 开头」跳过（见 scanNodeModules）。

/**
 * 目录判断（读取失败按非目录处理）
 * @param {string} path
 * @returns {boolean}
 */
function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * 读取包版本（读不到返回 null）
 * @param {string} dir
 * @returns {string|null}
 */
function readPackageVersion(dir) {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')).version || null;
  } catch {
    return null;
  }
}

/**
 * 扫描一个 node_modules 目录，收集目标包的副本路径
 * @param {string} nodeModulesDir
 * @param {Set<string>} targets
 * @param {Array<{ path: string, name: string }>} found
 * @param {number} depth
 */
function scanNodeModules(nodeModulesDir, targets, found, depth) {
  let entries;
  try {
    entries = readdirSync(nodeModulesDir);
  } catch {
    return; // 目录不存在/不可读：没有副本
  }

  for (const entry of entries) {
    if (!entry || entry.startsWith('.')) continue;
    const fullPath = join(nodeModulesDir, entry);
    if (!isDirectory(fullPath)) continue;

    if (entry.startsWith('@')) {
      // scope 目录：下一层才是包
      let scoped;
      try {
        scoped = readdirSync(fullPath);
      } catch {
        continue;
      }
      for (const name of scoped) {
        const pkgDir = join(fullPath, name);
        if (!isDirectory(pkgDir)) continue;
        if (targets.has(name)) found.push({ path: pkgDir, name });
        else scanNested(pkgDir, targets, found, depth);
      }
      continue;
    }

    if (targets.has(entry)) {
      found.push({ path: fullPath, name: entry });
      continue; // 命中即不再深入：包自己的 node_modules 由上层去重逻辑处理
    }

    scanNested(fullPath, targets, found, depth);
  }
}

/**
 * 递归进入包的 node_modules
 * @param {string} packageDir
 * @param {Set<string>} targets
 * @param {Array<{ path: string, name: string }>} found
 * @param {number} depth
 */
function scanNested(packageDir, targets, found, depth) {
  if (depth >= MAX_DEPTH) return;
  const nested = join(packageDir, 'node_modules');
  if (!existsSync(nested)) return;
  scanNodeModules(nested, targets, found, depth + 1);
}

/**
 * 列出全部副本（含顶层），按路径深度升序（浅者优先保留）
 * @param {string} agentRoot - agent 包根目录（含 node_modules）
 * @param {{ packages?: string[] }} [opts] 仅测试注入
 * @returns {Array<{ path: string, name: string, version: string|null }>}
 */
export function listNativeCopies(agentRoot, opts = {}) {
  const names = Array.isArray(opts.packages) && opts.packages.length ? opts.packages : NATIVE_DEDUPE_PACKAGES;
  const targets = new Set(names);
  const rootNodeModules = join(agentRoot, 'node_modules');
  if (!isDirectory(rootNodeModules)) return [];

  const found = [];
  scanNodeModules(rootNodeModules, targets, found, 0);
  return found
    .map((entry) => ({ ...entry, version: readPackageVersion(entry.path) }))
    .sort((a, b) => a.path.split(/[\\/]/).length - b.path.split(/[\\/]/).length);
}

/**
 * 清理嵌套重复副本：每个包只保留最浅的一份（通常是顶层 = overrides 指定的版本）
 *
 * 只删 node_modules 内、包名精确匹配的目录；删除失败（Windows 文件被占用等）不抛错，
 * 落到 failed 里由调用方写进安装日志 —— 安装本身不该因为清理失败而判定失败。
 * @param {string} agentRoot - agent 包根目录
 * @param {{ packages?: string[], dryRun?: boolean }} [opts]
 * @returns {{ removed: Array<{ path: string, name: string, version: string|null }>,
 *   failed: Array<{ path: string, name: string, error: string }>,
 *   kept: Array<{ path: string, name: string, version: string|null }> }}
 */
export function pruneNativeDuplicates(agentRoot, opts = {}) {
  const copies = listNativeCopies(agentRoot, opts);
  const kept = [];
  const removed = [];
  const failed = [];
  const seen = new Set();

  for (const entry of copies) {
    if (!seen.has(entry.name)) {
      seen.add(entry.name);
      kept.push(entry); // 最浅的一份保留
      continue;
    }
    if (opts.dryRun) {
      removed.push(entry);
      continue;
    }
    try {
      rmSync(entry.path, { recursive: true, force: true });
      removed.push(entry);
    } catch (err) {
      failed.push({ ...entry, error: err?.message || String(err) });
    }
  }

  return { removed, failed, kept };
}

/**
 * 生成一行可读的清理摘要（供安装日志）
 * @param {{ removed: Array<{name: string, version: string|null}>, failed: Array<{name: string, error: string}> }} report
 * @returns {string|null}
 */
export function summarizePruneReport(report) {
  const parts = [];
  for (const entry of report?.removed || []) {
    parts.push(`removed duplicate ${entry.name}@${entry.version || '?'}`);
  }
  for (const entry of report?.failed || []) {
    parts.push(`failed to remove ${entry.name} (${entry.error})`);
  }
  return parts.length ? parts.join('; ') : null;
}
