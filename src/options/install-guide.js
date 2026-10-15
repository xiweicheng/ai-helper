// options/install-guide.js - 代理端安装指引（版本匹配 + 一键复制）
//
// 版本来源：src/config/version.json（publish.sh 单一版本流写入，= agent npm 包版本 = git tag）。
// 命令用环境变量传版本——curl|bash / irm|iex 管道无法传命令行参数，故走 AGENT_VERSION 环境变量。
// 目的：引导用户安装与当前插件版本一致的代理端，避免版本不匹配导致连接失败。

import versionMeta from '../config/version.json';
import logger from '../shared/logger.js';
import { subscribe, t } from '../shared/i18n.js';
import { showToast } from './config-manager.js';

const RAW_BASE = 'https://raw.githubusercontent.com/xiweicheng/ai-helper/main';

// 当前插件对应的代理版本；version.json 缺失时回退 latest
export function getAgentVersion() {
  return versionMeta && versionMeta.version ? versionMeta.version : 'latest';
}

// macOS / Linux：curl 管道执行，版本经环境变量传给 bash
export function buildUnixInstallCmd(version) {
  return `curl -fsSL ${RAW_BASE}/install.sh | AGENT_VERSION=${version} bash`;
}

// Windows：管道 iex 执行。版本走 $env:AGENT_VERSION（脚本内 Get-TargetVersion 会读）——
// 不依赖 param 在 iex 下的绑定；前置 TLS12 兼容旧版 PowerShell 5.1 默认安全协议。
export function buildWinInstallCmd(version) {
  return `[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $env:AGENT_VERSION='${version}'; irm ${RAW_BASE}/install.ps1 | iex`;
}

// 粗略判定当前是否 Windows（用于「一键复制」自动选命令）
// 只认 platform 的 Win* 前缀与 UA 的 Windows 标记；避免 macOS 的 "darwin" 被子串 "win" 误命中
export function isWindowsPlatform() {
  const platform = navigator.platform || '';
  const ua = navigator.userAgent || '';
  return /^win/i.test(platform) || /\bwindows\b/i.test(ua);
}

async function copyInstallCmd(text, notifier) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    notifier(t('agentConfig.copyCmdSuccess'), 'success');
  } catch (err) {
    logger.warn('[Options] clipboard write failed:', err.message);
    notifier(t('agentConfig.copyCmdFailed'), 'error');
  }
}

// 渲染带版本号的标题与两条命令（标题含动态版本，不走 data-i18n 静态覆盖）
export function renderInstallGuide() {
  const version = getAgentVersion();
  const titleEl = document.getElementById('agentInstallTitle');
  if (titleEl) titleEl.textContent = t('agentConfig.installGuideTitle', { version });
  const unixEl = document.getElementById('installCmdUnix');
  const winEl = document.getElementById('installCmdWin');
  if (unixEl) unixEl.textContent = buildUnixInstallCmd(version);
  if (winEl) winEl.textContent = buildWinInstallCmd(version);
}

// 初始化安装指引区块。notify 可注入以便测试（默认用 config-manager 的 showToast）。
export function initInstallGuide(notify = showToast) {
  const guideEl = document.getElementById('agentInstallGuide');
  if (!guideEl) return;
  renderInstallGuide();
  // 语言切换后重渲染（标题含版本且无 data-i18n，applyI18n 不会覆盖它）
  subscribe(renderInstallGuide);

  const unixEl = document.getElementById('installCmdUnix');
  const winEl = document.getElementById('installCmdWin');
  document.getElementById('copyInstallUnix')?.addEventListener('click', () => copyInstallCmd(unixEl?.textContent, notify));
  document.getElementById('copyInstallWin')?.addEventListener('click', () => copyInstallCmd(winEl?.textContent, notify));
  // 一键复制：按当前操作系统选对应命令
  document.getElementById('copyInstallAuto')?.addEventListener('click', () => {
    copyInstallCmd(isWindowsPlatform() ? winEl?.textContent : unixEl?.textContent, notify);
  });
}
