// @vitest-environment jsdom
// test/unit/workdir-switch-lock.unit.test.js
// 「执行中禁止切换会话工作目录」的实时性守卫
//
// 真实 bug：chip 的禁用态是 updateWorkdirTag() 渲染时写进 dataset.locked 的快照，
// 而 initWorkdirTag() 只挂了会话/代理类事件，没挂生成与队列事件。
// 于是任务跑完后快照仍停在 'true'，点击只弹「执行中无法切换」的提示，
// 用户必须把会话切走再切回（触发一次新的渲染）才看起来解锁。
// 修法收敛为两点：判定只有一份（workdir-switch-lock.js），且锁定态跟着生成/队列事件重算。
import { describe, test, expect, vi, beforeEach } from 'vitest';
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
  for (let i = start; i < code.length; i += 1) {
    if (code[i] === '{') { depth += 1; began = true; } else if (code[i] === '}') {
      depth -= 1;
      if (began && depth === 0) return code.slice(start, i + 1);
    }
  }
  return code.slice(start);
}

const { getQueuedCount } = vi.hoisted(() => ({ getQueuedCount: vi.fn() }));

vi.mock('../../src/side_panel/queue-store.js', () => ({
  getQueuedCount: (...args) => getQueuedCount(...args),
  peekNext: () => null,
  subscribe: () => () => {},
}));

let state;
let isWorkdirSwitchBlocked;

beforeEach(async () => {
  state = (await import('../../src/side_panel/state.js')).default;
  ({ isWorkdirSwitchBlocked } = await import('../../src/side_panel/workdir-switch-lock.js'));
  state.activeSessionId = 's1';
  state.generatingSessionIds.clear();
  getQueuedCount.mockReset();
  getQueuedCount.mockReturnValue(0);
});

describe('判定本体：只认目标会话的当场状态', () => {
  test('没有会话：不拦（切目录退化成全局语义）', () => {
    state.activeSessionId = null;
    expect(isWorkdirSwitchBlocked()).toBe(false);
  });

  test('本会话在生成：拦', () => {
    state.generatingSessionIds.add('s1');
    expect(isWorkdirSwitchBlocked('s1')).toBe(true);
  });

  test('本会话队列非空：拦', () => {
    getQueuedCount.mockReturnValue(2);
    expect(isWorkdirSwitchBlocked('s1')).toBe(true);
    expect(getQueuedCount).toHaveBeenCalledWith('s1');
  });

  test('别的会话在跑、队列也是别人的：放行本会话', () => {
    state.generatingSessionIds.add('s2');
    expect(isWorkdirSwitchBlocked('s1')).toBe(false);
  });

  test('生成结束 + 队列删空后：当场放行（不再需要切走再切回）', () => {
    state.generatingSessionIds.add('s1');
    getQueuedCount.mockReturnValue(1);
    expect(isWorkdirSwitchBlocked('s1')).toBe(true);

    state.generatingSessionIds.delete('s1');
    getQueuedCount.mockReturnValue(0);
    expect(isWorkdirSwitchBlocked('s1')).toBe(false);
  });

  test('缺省会话取 activeSessionId', () => {
    state.generatingSessionIds.add('s1');
    expect(isWorkdirSwitchBlocked()).toBe(true);
  });
});

describe('chip 接线：锁定态必须跟着生成与队列事件重算', () => {
  const indexCode = readCode('src/side_panel/index.js');
  const initBody = bodyOf(indexCode, 'function initWorkdirTag()');
  const updateBody = bodyOf(indexCode, 'async function updateWorkdirTag()');
  const lockBody = bodyOf(indexCode, 'function syncWorkdirTagLock()');

  test('写了本地重算入口，且它是唯一写 dataset.locked 的地方', () => {
    expect(lockBody).toContain('el.dataset.locked =');
    expect(lockBody).toContain('isWorkdirSwitchBlocked(state.activeSessionId)');
    expect(indexCode.match(/dataset\.locked\s*=/g)).toHaveLength(1);
  });

  test('重算入口只碰锁定态，不重新解析目录（不能挂在高频事件上发请求）', () => {
    expect(lockBody).not.toContain('resolveWorkdirForSession');
    expect(lockBody).not.toContain('fetch');
    expect(updateBody).toContain('syncWorkdirTagLock();');
    expect(updateBody).not.toMatch(/dataset\.locked\s*=/);
  });

  test('挂了 generating-state-changed（生成起止都派发这条）', () => {
    expect(initBody).toMatch(/addEventListener\('generating-state-changed',\s*\(\)\s*=>\s*\{\s*syncWorkdirTagLock\(\);\s*\}\)/);
  });

  test('挂了 generation-ended（带会话 id 的那条，防止只有它派发的路径漏掉）', () => {
    expect(initBody).toMatch(/addEventListener\('generation-ended',\s*\(\)\s*=>\s*\{\s*syncWorkdirTagLock\(\);\s*\}\)/);
  });

  test('订阅了队列 store：删除/清空/跨窗口同步都没有 DOM 事件', () => {
    expect(initBody).toContain('subscribeQueueStore(() => { syncWorkdirTagLock(); })');
    expect(indexCode).toContain("import { subscribe as subscribeQueueStore } from './queue-store.js'");
  });

  test('点击入口当场判定，不再读 dataset.locked 快照', () => {
    const clickBody = bodyOf(indexCode, "el.addEventListener('click', async (e) => {");
    expect(clickBody).toContain('if (isWorkdirSwitchBlocked(state.activeSessionId)) {');
    expect(clickBody).not.toContain('dataset.locked');
  });

  test('会话/代理类事件保持不变（目录文案仍要靠它们刷新）', () => {
    for (const type of ['session-switched', 'session-workdir-changed', 'agent-model-changed', 'agent-tools-changed']) {
      expect(initBody).toContain(`addEventListener('${type}'`);
    }
  });
});

describe('判定只有一份实现', () => {
  const panelCode = readCode('src/side_panel/workspace-panel.js');
  const indexImports = readCode('src/side_panel/index.js');

  test('弹窗与 chip 共用 workdir-switch-lock', () => {
    expect(indexImports).toContain("import { isWorkdirSwitchBlocked } from './workdir-switch-lock.js'");
    expect(panelCode).toContain("import { isWorkdirSwitchBlocked } from './workdir-switch-lock.js'");
    // 这里的默认值是嵌套花括号，bodyOf 会在第一个 `}` 就收口 → 只切片到拦截点
    const guardSegment = panelCode.slice(
      panelCode.indexOf('export async function showSwitchWorkdirDialog'),
      panelCode.indexOf('let detail = null;'),
    );
    expect(guardSegment).toContain('if (isWorkdirSwitchBlocked(sessionId)) {');
    expect(guardSegment).toContain("showToast(t('workdirTag.lockedHint'), 'warning')");
  });

  test('弹窗侧的重复实现已删除', () => {
    expect(panelCode).not.toContain('hasPendingQueue');
    expect(panelCode).not.toMatch(/generatingSessionIds\?\.has/);
  });

  test('全仓不再有第二处「生成中 + 队列非空」的切换判定', () => {
    const hits = ['src/side_panel/index.js', 'src/side_panel/workspace-panel.js']
      .filter((f) => readCode(f).match(/generatingSessionIds\?\.has/));
    expect(hits).toEqual([]);
  });
});
