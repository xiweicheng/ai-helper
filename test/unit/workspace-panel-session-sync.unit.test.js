// test/unit/workspace-panel-session-sync.unit.test.js
// 工作目录面板「跟着会话走」的源码守卫
//
// 背景（真实 bug）：面板的浏览位置（currentPath / workspaceRoot）是模块级单例，
// 切会话时没有人复位它。因为旧目录通常仍在 allowedPaths 内，/api/fs/list 不报错，
// 表现为「静默显示上一个会话的目录」，连刷新按钮都只会把错目录再刷一遍。
//
// 这类断链用行为测试覆盖成本很高（面板依赖大量 DOM 与 chrome.* 状态），
// 因此沿用 workdir-injection-guard 的做法，直接对源码结构做断言。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PANEL = 'src/side_panel/workspace-panel.js';

/** 读源码并去掉注释行，避免「注释里提到」被误判成「代码里在用」 */
function readCode(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/*'))
    .join('\n');
}

/** 取函数体（花括号配对），用于断言「某个函数里有没有做某件事」 */
function bodyOf(code, signature) {
  const start = code.indexOf(signature);
  if (start === -1) return '';
  let depth = 0;
  let began = false;
  for (let i = start; i < code.length; i++) {
    if (code[i] === '{') { depth += 1; began = true; }
    else if (code[i] === '}') {
      depth -= 1;
      if (began && depth === 0) return code.slice(start, i + 1);
    }
  }
  return code.slice(start);
}

const code = readCode(PANEL);

describe('面板必须监听会话切换与目录变更', () => {
  test('注册了 session-switched 监听', () => {
    expect(code).toMatch(/addEventListener\('session-switched',\s*\(\)\s*=>\s*\{/);
  });

  test('注册了 session-workdir-changed 监听', () => {
    expect(code).toMatch(/addEventListener\('session-workdir-changed',\s*\(e\)\s*=>\s*\{/);
  });

  test('两个监听都走 syncWorkspaceToSession 单一入口', () => {
    const switched = bodyOf(code, "addEventListener('session-switched'");
    const workdirChanged = bodyOf(code, "addEventListener('session-workdir-changed'");
    expect(switched).toContain('syncWorkspaceToSession');
    expect(workdirChanged).toContain('syncWorkspaceToSession');
    // 禁止在监听里直接按旧 currentPath 重载（那正是本 bug 的原始形态）
    expect(switched).not.toContain('loadDirectory');
    expect(workdirChanged).not.toContain('loadDirectory');
  });

  test('别的会话改目录不影响本面板', () => {
    const workdirChanged = bodyOf(code, "addEventListener('session-workdir-changed'");
    expect(workdirChanged).toMatch(/sid\s*!==\s*state\.activeSessionId/);
  });
});

describe('syncWorkspaceToSession：先复位再导航', () => {
  const body = bodyOf(code, 'async function syncWorkspaceToSession(');

  test('函数存在且被定义', () => {
    expect(body.length).toBeGreaterThan(0);
  });

  test('复位 workspace-manager 的会话级缓存与面板导航状态', () => {
    expect(body).toContain('resetWorkspaceRoot()');
    expect(body).toContain('resetPanelNavigationState()');
  });

  test('复位发生在导航之前', () => {
    const reset = body.indexOf('resetPanelNavigationState()');
    const nav = body.indexOf('navigateToRoot()');
    expect(reset).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(reset);
  });

  test('目录未变时短路，保留用户浏览位置', () => {
    expect(body).toMatch(/prevRoot\s*===\s*nextRoot/);
    const shortCircuit = body.indexOf('prevRoot === nextRoot');
    const nav = body.indexOf('navigateToRoot()');
    expect(shortCircuit).toBeGreaterThan(-1);
    expect(nav).toBeGreaterThan(shortCircuit);
  });

  test('收起态不导航：交给 openPanel 的 !currentPath 分支处理', () => {
    expect(body).toContain("panel.classList.contains('expanded')");
  });

  test('预览属于上一个会话时强关（force=true，不弹未保存确认）', () => {
    expect(body).toContain('closePreview(true)');
    // force 关闭前必须清掉「关闭预览顺带收起面板」的标记
    expect(body).toContain('previewAutoClosePanel = false');
  });
});

describe('afterWorkdirChanged 收敛为只广播', () => {
  const body = bodyOf(code, 'async function afterWorkdirChanged(');

  test('仍然派发 session-workdir-changed（目录 chip / 上下文缓存依赖它）', () => {
    expect(body).toContain('session-workdir-changed');
    expect(body).toContain('dispatchEvent');
  });

  test('不再自己做复位与重导航（否则与监听重复，连续列两次目录）', () => {
    expect(body).not.toContain('resetPanelNavigationState');
    expect(body).not.toContain('navigateToRoot');
    expect(body).not.toContain('resetWorkspaceRoot');
  });
});

describe('打开面板与状态复位的前提条件', () => {
  test('openPanel 仅在未定位过时导航（收起态切换后靠它重新解析根目录）', () => {
    const body = bodyOf(code, 'async function openPanel(');
    expect(body).toMatch(/if\s*\(!currentPath\)/);
    expect(body).toContain('navigateToRoot()');
  });

  test('resetPanelNavigationState 清掉 currentPath 与目录缓存', () => {
    const body = bodyOf(code, 'function resetPanelNavigationState(');
    expect(body).toContain('currentPath = null');
    expect(body).toContain('workspaceRoot = null');
    expect(body).toContain('dirCache.clear()');
    expect(body).toContain('pathHistory = []');
  });
});
