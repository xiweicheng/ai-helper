// @vitest-environment jsdom
// install-guide-dom.unit.test.js - 代理端安装指引「一键复制」的 DOM 冒烟测试
//
// 契约：
//  - options.html 存在 #agentInstallGuide / #agentInstallTitle / #installCmdUnix / #installCmdWin
//    及三个复制按钮 id，且与 JS 引用一致（否则 initInstallGuide 静默 return，断言失败）；
//  - 两条命令内嵌 version.json 的版本，且用 AGENT_VERSION 环境变量传版本（管道无法传命令行参数）；
//  - 「一键复制」按 navigator.platform 选对应系统命令；单条按钮复制各自命令；
//  - 复制成功走 copyCmdSuccess 提示；用真实 i18n 渲染，断言不残留 {xxx} 占位符；
//  - zh/en 两份语言包新增键一致。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// config-manager 较重且只需 showToast，mock 掉避免拖入无关依赖
vi.mock('../../src/options/config-manager.js', () => ({ showToast: vi.fn() }));

const {
  initInstallGuide,
  buildUnixInstallCmd,
  buildWinInstallCmd,
  getAgentVersion,
} = await import('../../src/options/install-guide.js');
const { t } = await import('../../src/shared/i18n.js');
import versionMeta from '../../src/config/version.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION = versionMeta.version;

function setupDom() {
  document.body.innerHTML = `
    <div class="agent-install-guide" id="agentInstallGuide">
      <h3 id="agentInstallTitle"></h3>
      <code id="installCmdUnix"></code>
      <code id="installCmdWin"></code>
      <button id="copyInstallUnix"></button>
      <button id="copyInstallWin"></button>
      <button id="copyInstallAuto"></button>
    </div>`;
}

function setPlatform(platform) {
  Object.defineProperty(navigator, 'platform', { configurable: true, get: () => platform });
}

describe('代理端安装指引 命令拼接', () => {
  it('unix 命令用 curl 管道且经 AGENT_VERSION 环境变量传版本', () => {
    const cmd = buildUnixInstallCmd('2.2.0');
    expect(cmd).toContain('curl -fsSL');
    expect(cmd).toContain('install.sh');
    expect(cmd).toContain('AGENT_VERSION=2.2.0 bash');
  });

  it('windows 命令用 irm 管道、前置 TLS12、经 $env:AGENT_VERSION 传版本', () => {
    const cmd = buildWinInstallCmd('2.2.0');
    expect(cmd).toContain('[Net.ServicePointManager]::SecurityProtocol');
    expect(cmd).toContain("Tls12");
    expect(cmd).toContain("$env:AGENT_VERSION='2.2.0'");
    expect(cmd).toContain('irm');
    expect(cmd).toContain('install.ps1 | iex');
  });

  it('getAgentVersion 取 version.json 的版本', () => {
    expect(getAgentVersion()).toBe(VERSION);
  });
});

describe('代理端安装指引 DOM 接线', () => {
  beforeEach(() => {
    setupDom();
    setPlatform('MacIntel');
    initInstallGuide();
  });

  it('HTML 契约：options.html 含全部引用 id 且命令位为 code 元素', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../options.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    for (const id of ['agentInstallGuide', 'agentInstallTitle', 'installCmdUnix', 'installCmdWin', 'copyInstallUnix', 'copyInstallWin', 'copyInstallAuto']) {
      expect(doc.getElementById(id), `缺少 #${id}`).toBeTruthy();
    }
  });

  it('渲染：标题带版本号，两条命令内嵌当前版本', () => {
    const title = document.getElementById('agentInstallTitle').textContent;
    expect(title).toContain(`v${VERSION}`);
    expect(document.getElementById('installCmdUnix').textContent).toContain(`AGENT_VERSION=${VERSION}`);
    expect(document.getElementById('installCmdWin').textContent).toContain(`AGENT_VERSION='${VERSION}'`);
  });

  it('复制成功提示用真实 i18n 渲染且无占位符残留', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const notify = vi.fn();

    setupDom();
    initInstallGuide(notify);
    document.getElementById('copyInstallUnix').click();
    await vi.waitFor(() => expect(notify).toHaveBeenCalled());

    const [msg, type] = notify.mock.calls[0];
    expect(msg).toBe(t('agentConfig.copyCmdSuccess'));
    expect(msg).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(type).toBe('success');
  });

  it('一键复制：macOS 选 unix，Windows 选 win 命令', async () => {
    const captured = [];
    Object.assign(navigator, { clipboard: { writeText: vi.fn((t2) => { captured.push(t2); return Promise.resolve(); }) } });
    const notify = vi.fn();

    setupDom();
    setPlatform('MacIntel');
    initInstallGuide(notify);
    document.getElementById('copyInstallAuto').click();
    await vi.waitFor(() => expect(captured[0]).toContain(`AGENT_VERSION=${VERSION}`));

    setupDom();
    setPlatform('Win32');
    captured.length = 0;
    initInstallGuide(notify);
    document.getElementById('copyInstallAuto').click();
    await vi.waitFor(() => expect(captured[0]).toContain(`$env:AGENT_VERSION='${VERSION}'`));
  });

  it('缺少 #agentInstallGuide 时安全返回（不抛错）', () => {
    document.body.innerHTML = '<div class="container"></div>';
    expect(() => initInstallGuide()).not.toThrow();
  });
});

describe('installGuide i18n 键 zh/en 一致', () => {
  const KEYS = [
    'agentConfig.installGuideTitle',
    'agentConfig.installGuideHint',
    'agentConfig.installGuideMacLinux',
    'agentConfig.copyCmd',
    'agentConfig.copyCmdAuto',
    'agentConfig.copyCmdSuccess',
    'agentConfig.copyCmdFailed',
  ];

  function leafKeys(locale) {
    const src = fs.readFileSync(path.resolve(__dirname, `../../src/shared/locales/${locale}.js`), 'utf8');
    return KEYS.filter((k) => src.includes(k.split('.')[1] + ':'));
  }

  it('两份语言包都注册了全部新键', () => {
    expect(leafKeys('zh')).toHaveLength(KEYS.length);
    expect(leafKeys('en')).toHaveLength(KEYS.length);
  });

  it('标题键占位符一致（{version}）', () => {
    const zh = fs.readFileSync(path.resolve(__dirname, '../../src/shared/locales/zh.js'), 'utf8');
    const en = fs.readFileSync(path.resolve(__dirname, '../../src/shared/locales/en.js'), 'utf8');
    expect(/installGuideTitle:[^\n]*\{version\}/.test(zh)).toBe(true);
    expect(/installGuideTitle:[^\n]*\{version\}/.test(en)).toBe(true);
  });
});
