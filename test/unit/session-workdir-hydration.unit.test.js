// test/unit/session-workdir-hydration.unit.test.js
// 会话级工作目录「水合 + 保存闸门 + 漂移自愈」的源码守卫
//
// 背景（真实故障）：侧边栏启动只恢复了 messageHistory / model / agentId，漏了
// state.sessionWorkdir；而 saveCurrentSession() 是整段覆盖，任何一次保存
// （新建会话、切助手、上下文压缩、可见性变化…）都会把库里的真实绑定写成 null。
// 结果：chip 回落默认目录，代理端 session-workdirs.json 还留着旧绑定，
// chip 悬停显示「目录不存在或不可访问，请重新选择」。
//
// 这类「谁该在什么时候写哪个字段」的约束用行为测试覆盖成本很高（要 mock IDB + chrome），
// 因此沿用现有 workdir 守卫测试的做法，直接对源码结构做断言。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

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

const store = readCode('src/storage/session-store.js');
const stateCode = readCode('src/side_panel/state.js');
const chatCode = readCode('src/side_panel/chat-manager.js');
const uiCode = readCode('src/side_panel/session-manager-ui.js');
const reconcile = readCode('src/side_panel/workdir-reconcile.js');
const indexCode = readCode('src/side_panel/index.js');

describe('水合标记与统一入口', () => {
  test('state 暴露 sessionWorkdirOwner', () => {
    expect(stateCode).toMatch(/^export let sessionWorkdirOwner = null;$/m);
    expect(stateCode).toMatch(/set sessionWorkdirOwner\(v\)/);
  });

  test('session-store 提供 hydrateSessionWorkdir（三个字段一起写）', () => {
    const body = bodyOf(store, 'export function hydrateSessionWorkdir(session)');
    expect(body).toContain('state.sessionWorkdir =');
    expect(body).toContain('state.workdirAgentId =');
    expect(body).toContain('state.sessionWorkdirOwner =');
  });

  test('switchToSession 走统一入口而不是手写字段', () => {
    const body = bodyOf(store, 'export async function switchToSession(');
    expect(body).toContain('hydrateSessionWorkdir(targetSession)');
    expect(body).not.toContain('state.sessionWorkdir =');
  });

  test('显式切换目录时同步水合标记', () => {
    const body = bodyOf(store, 'export async function setSessionWorkdirBinding(');
    expect(body).toContain('state.sessionWorkdirOwner = sessionId');
  });
});

describe('保存闸门：没水合过就不许写目录字段', () => {
  const saveBody = bodyOf(store, 'export async function saveCurrentSession()');

  test('workdir 回写被 owner 闸门包住', () => {
    expect(saveBody).toContain('if (state.sessionWorkdirOwner === state.activeSessionId) {');
    const gateAt = saveBody.indexOf('state.sessionWorkdirOwner === state.activeSessionId');
    const writeAt = saveBody.indexOf('currentSession.workdir =');
    expect(gateAt).toBeGreaterThan(-1);
    expect(writeAt).toBeGreaterThan(gateAt);
  });

  test('闸门内同时写 workdir 与 workdirAgentId', () => {
    const gateAt = saveBody.indexOf('state.sessionWorkdirOwner === state.activeSessionId');
    const tail = saveBody.slice(gateAt);
    expect(tail).toContain('currentSession.workdir = state.sessionWorkdir');
    expect(tail).toContain('currentSession.workdirAgentId =');
  });
});

describe('所有激活会话的路径都必须水合目录', () => {
  test('启动加载历史时水合', () => {
    const body = bodyOf(chatCode, 'async function _loadChatHistoryImpl()');
    expect(body).toContain('hydrateSessionWorkdir(activeSession)');
  });

  test('首次打开自动建会话后水合', () => {
    const body = bodyOf(chatCode, 'async function _loadChatHistoryImpl()');
    expect(body).toContain('hydrateSessionWorkdir(refreshedData.list.find');
  });

  test('新建会话时清空（不继承上个会话绑定）', () => {
    const body = bodyOf(uiCode, 'export async function newSession()');
    expect(body).toContain('hydrateSessionWorkdir(newSession)');
  });

  test('删除会话后重载时水合', () => {
    const body = bodyOf(uiCode, 'async function reloadAfterDelete()');
    expect(body).toContain('hydrateSessionWorkdir(active)');
  });
});

describe('漂移自愈：只在「扩展端说默认、代理端还有绑定」时动手', () => {
  const body = bodyOf(reconcile, 'export async function reconcileSessionWorkdir(sessionId)');

  test('幂等：动作成功后才记账（失败要能重试）', () => {
    expect(body).toContain('attempted.has(base)');
    const addAt = body.indexOf('attempted.add(base)');
    expect(addAt).toBeGreaterThan(-1);
    // 记账必须在真正修复动作之后：写在动作之前会让一次失败变成永久放弃
    expect(addAt).toBeGreaterThan(body.indexOf('setSessionWorkdirBinding(base'));
  });

  test('扩展端已是本会话作用域则不动', () => {
    // 允许提前返回时顺带记一条「探测结论」缓存（换行/大括号都算同一语义）
    expect(body).toMatch(/if \(resolved\.scope === 'session'\)[\s\S]{0,120}?return null;/);
  });

  test('记录被抹过 → 以代理端为准恢复绑定', () => {
    expect(body).toContain('if (!resolved.boundWorkdir) {');
    expect(body).toContain('setSessionWorkdirBinding(base, registered');
  });

  test('换代理回落 → 清掉代理端残留', () => {
    expect(body).toContain('unbindSessionWorkdirRemote(base)');
  });

  test('代理端本来就按默认目录 → 无需修复', () => {
    expect(body).toMatch(/if \(!registered \|\| registered === agentDefault\)[\s\S]{0,120}?return null;/);
  });
});

describe('chip 不再把「漂移」误报成目录不可用', () => {
  const body = bodyOf(indexCode, 'async function updateWorkdirTag()');

  test('默认作用域 + 不一致 → 静默修复而不是标红', () => {
    expect(body).toContain('reconcileSessionWorkdir(sid)');
    const branchAt = body.indexOf("mismatch && resolved.scope === 'default'");
    expect(branchAt).toBeGreaterThan(-1);
    const branch = body.slice(branchAt, branchAt + 400);
    expect(branch).toContain("el.dataset.invalid = 'false';");
  });

  test('本会话作用域 + 不一致 → 仍如实标异常', () => {
    expect(body).toContain("el.dataset.invalid = mismatch ? 'true' : 'false';");
  });
});

describe('会话水合信号：启动阶段让面板补一次对齐', () => {
  const chatBody = bodyOf(chatCode, 'async function _loadChatHistoryImpl()');
  const notifyBody = bodyOf(chatCode, 'function notifySessionHydrated()');
  const panel = readCode('src/side_panel/workspace-panel.js');

  test('水合后广播 session-hydrated（带会话 id 与绑定目录）', () => {
    expect(notifyBody).toContain("new CustomEvent('session-hydrated'");
    expect(notifyBody).toContain('sessionId: state.activeSessionId');
    expect(notifyBody).toContain('workdir: state.sessionWorkdir || null');
  });

  test('会话未就绪时不广播（避免把默认目录当成结论）', () => {
    expect(notifyBody).toContain('if (!state.activeSessionId) return;');
  });

  test('两条激活路径都在水合之后紧邻广播', () => {
    expect(chatBody).toMatch(/hydrateSessionWorkdir\(activeSession\);\s*\n\s*notifySessionHydrated\(\);/);
    expect(chatBody).toMatch(/hydrateSessionWorkdir\(refreshedData\.list\.find[^;]*\);\s*\n\s*notifySessionHydrated\(\);/);
  });

  test('不复用 session-switched（那条会重建聊天区）', () => {
    expect(notifyBody).not.toContain('session-switched');
  });

  test('面板监听 session-hydrated 并走 syncWorkspaceToSession 单一入口', () => {
    expect(panel).toMatch(/addEventListener\('session-hydrated'/);
    const body = bodyOf(panel, "addEventListener('session-hydrated'");
    expect(body).toContain('syncWorkspaceToSession');
    expect(body).not.toContain('loadDirectory');
  });
});
