// agent/src/autostart.js - 跨平台开机自启注册
//
// 三种平台均使用「用户登录时触发」，无需管理员权限：
//   macOS   ~/Library/LaunchAgents/com.ai-helper.agent.plist (launchd)
//   Linux   ~/.config/systemd/user/ai-helper-agent.service (systemd --user)
//   Windows HKCU\Software\Microsoft\Windows\CurrentVersion\Run (注册表 Run 键)
//
// Windows 不再使用 schtasks /SC ONLOGON：该触发器的创建在多数非提权环境会被拒绝，
// 且计划任务结束时可能连带结束被 detach 的子进程。注册表 Run 键无这些限制。

import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { homedir } from 'os';
import { join, resolve } from 'path';

const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const LOGS_DIR = join(AGENT_DIR, 'logs');
const STOPPED_FLAG = join(AGENT_DIR, '.stopped');

const LAUNCH_AGENT_LABEL = 'com.ai-helper.agent';
const LAUNCH_AGENT_PLIST = join(homedir(), 'Library', 'LaunchAgents', `${LAUNCH_AGENT_LABEL}.plist`);
const SYSTEMD_SERVICE = join(homedir(), '.config', 'systemd', 'user', 'ai-helper-agent.service');

const WIN_RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const WIN_RUN_VALUE = 'AIHelperAgent';
const WIN_TASK_NAME = 'AIHelperAgent';

/**
 * 自启入口命令：优先复用安装脚本生成的 aha 包装器（Node 运行时升级后路径依然有效），
 * npm 全局安装模式下列回退到「当前 node + 包内脚本」。
 * @returns {{ exe: string, args: string[] }}
 */
function guardCommand() {
  return agentCommand('_autostart-guard');
}

/**
 * 前台启动命令（Linux systemd 使用，不能走 guard）
 * @returns {{ exe: string, args: string[] }}
 */
function startCommand() {
  return agentCommand('start');
}

function agentCommand(subcommand) {
  const wrapper = join(AGENT_DIR, 'bin', process.platform === 'win32' ? 'aha.cmd' : 'aha');
  if (existsSync(wrapper)) {
    return { exe: wrapper, args: [subcommand] };
  }
  return { exe: process.execPath, args: [resolve(process.argv[1]), subcommand] };
}

function escapeXml(value) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// systemd 单元文件中 % 需转义为 %%
function escapeSystemd(value) {
  return value.replace(/%/g, '%%');
}

/**
 * 启用开机自启
 * @returns {{ ok: boolean, detail?: string }}
 */
export function enableAutostart() {
  if (process.platform === 'win32') return enableWindows();
  if (process.platform === 'darwin') return enableMacos();
  return enableLinux();
}

/**
 * 关闭开机自启
 * @returns {{ ok: boolean, detail?: string }}
 */
export function disableAutostart() {
  if (process.platform === 'win32') return disableWindows();
  if (process.platform === 'darwin') return disableMacos();
  return disableLinux();
}

// ==================== Windows ====================
function enableWindows() {
  const { exe, args } = guardCommand();
  const value = [exe, ...args].map((part) => `"${part}"`).join(' ');

  // 清理历史遗留的计划任务，避免与注册表键重复拉起
  spawnSync('schtasks', ['/Delete', '/TN', WIN_TASK_NAME, '/F'], { windowsHide: true, stdio: 'ignore' });

  const res = spawnSync(
    'reg',
    ['add', WIN_RUN_KEY, '/v', WIN_RUN_VALUE, '/t', 'REG_SZ', '/d', value, '/f'],
    { windowsHide: true, encoding: 'utf-8' }
  );
  if (res.error) return { ok: false, detail: res.error.message };
  if (res.status !== 0) return { ok: false, detail: (res.stderr || res.stdout || '').trim() };
  return { ok: true };
}

function disableWindows() {
  // 值不存在时 reg 返回非 0，目标状态已达成，无需报错
  spawnSync('reg', ['delete', WIN_RUN_KEY, '/v', WIN_RUN_VALUE, '/f'], { windowsHide: true, stdio: 'ignore' });
  spawnSync('schtasks', ['/Delete', '/TN', WIN_TASK_NAME, '/F'], { windowsHide: true, stdio: 'ignore' });
  return { ok: true };
}

// ==================== macOS ====================
function enableMacos() {
  const { exe, args } = guardCommand();
  const programArgs = [exe, ...args].map((part) => `    <string>${escapeXml(part)}</string>`).join('\n');

  try {
    mkdirSync(join(homedir(), 'Library', 'LaunchAgents'), { recursive: true });
    mkdirSync(LOGS_DIR, { recursive: true });
  } catch (err) {
    return { ok: false, detail: err.message };
  }

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
${programArgs}
  </array>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${escapeXml(join(LOGS_DIR, 'launchd-out.log'))}</string>
  <key>StandardErrorPath</key><string>${escapeXml(join(LOGS_DIR, 'launchd-err.log'))}</string>
</dict>
</plist>
`;

  try {
    writeFileSync(LAUNCH_AGENT_PLIST, plist);
  } catch (err) {
    return { ok: false, detail: err.message };
  }

  // 先卸载旧配置再加载，保证修改后的 plist 生效
  spawnSync('launchctl', ['unload', LAUNCH_AGENT_PLIST], { stdio: 'ignore' });
  let res = spawnSync('launchctl', ['load', LAUNCH_AGENT_PLIST], { encoding: 'utf-8' });
  if (res.status !== 0) {
    // 新版 macOS 推荐 bootstrap，作为 load 失败时的兜底
    res = spawnSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, LAUNCH_AGENT_PLIST], { encoding: 'utf-8' });
  }
  if (res.error) return { ok: false, detail: res.error.message };
  if (res.status !== 0) return { ok: false, detail: (res.stderr || res.stdout || '').trim() };
  return { ok: true };
}

function disableMacos() {
  spawnSync('launchctl', ['unload', LAUNCH_AGENT_PLIST], { stdio: 'ignore' });
  try {
    if (existsSync(LAUNCH_AGENT_PLIST)) unlinkSync(LAUNCH_AGENT_PLIST);
  } catch (err) {
    return { ok: false, detail: err.message };
  }
  return { ok: true };
}

// ==================== Linux ====================
function enableLinux() {
  const { exe, args } = startCommand();
  // systemd 以 cgroup 管理进程：_autostart-guard 启动后立即退出会让服务被判为结束，
  // 其 detach 出来的子进程也会被连带清理。因此这里直接前台运行 start，
  // 并用 ExecStartPre 检查 .stopped 标记（用户主动 stop 后不再拉起）。
  const startCmd = [exe, ...args].map((part) => `"${escapeSystemd(part)}"`).join(' ');
  const unit = `[Unit]
Description=AI Helper Agent
After=network.target

[Service]
Type=exec
ExecStartPre=/bin/sh -c 'test -f "${escapeSystemd(STOPPED_FLAG)}" && exit 1 || true'
ExecStart=${startCmd}

[Install]
WantedBy=default.target
`;

  try {
    mkdirSync(join(homedir(), '.config', 'systemd', 'user'), { recursive: true });
    writeFileSync(SYSTEMD_SERVICE, unit);
  } catch (err) {
    return { ok: false, detail: err.message };
  }

  spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
  const res = spawnSync('systemctl', ['--user', 'enable', 'ai-helper-agent'], { encoding: 'utf-8' });
  if (res.error) return { ok: false, detail: res.error.message };
  if (res.status !== 0) return { ok: false, detail: (res.stderr || res.stdout || '').trim() };
  return { ok: true };
}

function disableLinux() {
  spawnSync('systemctl', ['--user', 'disable', 'ai-helper-agent'], { stdio: 'ignore' });
  try {
    if (existsSync(SYSTEMD_SERVICE)) unlinkSync(SYSTEMD_SERVICE);
  } catch (err) {
    return { ok: false, detail: err.message };
  }
  spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
  return { ok: true };
}
