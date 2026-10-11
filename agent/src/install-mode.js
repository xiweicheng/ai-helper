// agent/src/install-mode.js - 安装模式检测与内嵌运行时工具函数
//
// 支持两种运行模式，所有功能模块通过本模块获取路径/配置，无需感知具体模式：
//   1. 内嵌模式：由 install.sh / install.ps1 安装，runtime + app 均在 ~/.ai-helper-agent/ 下
//   2. npm 全局模式：由 npm install -g ai-helper-agent 安装（传统路径）
//
// 判断依据：agent 包入口 (bin/agent.js) 所在路径是否在 ~/.ai-helper-agent/app/ 下。
// 设计原则：所有改动向后兼容——npm -g 用户 isEmbedded()=false，走原逻辑。

import { homedir } from 'os';
import { join, dirname, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';

const EMBEDDED_ROOT = join(homedir(), '.ai-helper-agent');
const __dirname = dirname(fileURLToPath(import.meta.url));
// 本模块位于 <agent-package>/src/，向上两级到包根
const PACKAGE_ROOT = resolve(__dirname, '..');

/**
 * 是否运行在内嵌模式（由 install.sh 安装的自管理环境）
 */
export function isEmbedded() {
  return PACKAGE_ROOT.startsWith(EMBEDDED_ROOT);
}

/**
 * 内嵌模式的根目录（~/.ai-helper-agent/），非内嵌模式返回 null
 */
export function getEmbeddedRoot() {
  return isEmbedded() ? EMBEDDED_ROOT : null;
}

/**
 * 获取 Node 可执行文件路径
 * - 内嵌模式：~/.ai-helper-agent/runtime/bin/node
 * - 全局模式：process.execPath（当前正在运行的 node）
 */
export function getNodePath() {
  if (!isEmbedded()) return process.execPath;
  const candidate = join(EMBEDDED_ROOT, 'runtime', 'bin', 'node');
  return existsSync(candidate) ? candidate : process.execPath;
}

/**
 * 获取 npm 可执行文件路径
 * - 内嵌模式：~/.ai-helper-agent/runtime/bin/npm
 * - 全局模式：'npm'（系统 PATH 中的）
 */
export function getNpmPath() {
  if (!isEmbedded()) return 'npm';
  const isWin = process.platform === 'win32';
  const candidate = isWin
    ? join(EMBEDDED_ROOT, 'runtime', 'npm.cmd')
    : join(EMBEDDED_ROOT, 'runtime', 'bin', 'npm');
  return existsSync(candidate) ? candidate : 'npm';
}

/**
 * 读取镜像探测结果（~/.ai-helper-agent/mirrors.json）
 * 文件不存在时返回 null（npm -g 用户通常没有此文件）
 * @returns {{ registry?: string, node?: string, huggingface?: string, detectedAt?: string } | null}
 */
export function readMirrors() {
  try {
    const mirrorsFile = join(EMBEDDED_ROOT, 'mirrors.json');
    if (!existsSync(mirrorsFile)) return null;
    return JSON.parse(readFileSync(mirrorsFile, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * 获取当前应使用的 npm registry URL
 * - 有 mirrors.json 且 registry 字段为 mirror → https://registry.npmmirror.com
 * - 否则 → undefined（使用 npm 默认）
 * @returns {string|undefined}
 */
export function getRegistryUrl() {
  const mirrors = readMirrors();
  if (!mirrors) return undefined;
  if (mirrors.registry === 'mirror') return 'https://registry.npmmirror.com';
  return undefined;
}

/**
 * 获取 HuggingFace 模型下载端点
 * - 有 mirrors.json 且 huggingface 为 mirror → https://hf-mirror.com/
 * - 否则 → undefined（使用 transformers 默认）
 * @returns {string|undefined}
 */
export function getHfEndpoint() {
  const mirrors = readMirrors();
  if (!mirrors) return undefined;
  if (mirrors.huggingface === 'mirror') return 'https://hf-mirror.com/';
  return undefined;
}

/**
 * 获取主动停止标记文件路径（用于 autostart 检查）
 */
export function getStoppedFlagPath() {
  return join(EMBEDDED_ROOT, '.stopped');
}

/**
 * 获取 INSTALL_MANIFEST.json 路径与内容
 */
export function readInstallManifest() {
  try {
    const file = join(EMBEDDED_ROOT, 'INSTALL_MANIFEST.json');
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * agent 包根目录（无论哪种模式，都是本文件所在包的根）
 */
export function getAgentPackageRoot() {
  return PACKAGE_ROOT;
}
