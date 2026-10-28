// test/unit/workdir-tag-session-sync.unit.test.js
// 信息带「工作目录 chip」跟着会话走的源码守卫
//
// 背景（真实 bug）：chip 只监听 session-workdir-changed，而 newSession()（点 + 新建）、
// reloadAfterDelete() 这些路径只派发 session-switched，不派发 workdir 事件，
// 结果切到新会话后面板换了目录、chip 还挂着上一个会话的目录。
// 另外两个事件会连着来，刷新又是异步的，必须丢弃陈旧结果，否则旧会话的解析结果会覆盖新会话。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX = 'src/side_panel/index.js';
const SESSION_UI = 'src/side_panel/session-manager-ui.js';

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

const code = readCode(INDEX);
const initBody = bodyOf(code, 'function initWorkdirTag()');
const updateBody = bodyOf(code, 'async function updateWorkdirTag()');

describe('chip 必须监听会话切换', () => {
  test('注册了 session-switched 监听', () => {
    expect(initBody).toMatch(/addEventListener\('session-switched',\s*\(\)\s*=>\s*\{\s*updateWorkdirTag\(\);\s*\}\)/);
  });

  test('保留 session-workdir-changed 监听', () => {
    expect(initBody).toMatch(/addEventListener\('session-workdir-changed',\s*\(\)\s*=>\s*\{\s*updateWorkdirTag\(\);\s*\}\)/);
  });

  test('保留 agent-model-changed 监听（换代理后绑定是否生效会变）', () => {
    expect(initBody).toMatch(/addEventListener\('agent-model-changed',\s*\(\)\s*=>\s*\{\s*updateWorkdirTag\(\);\s*\}\)/);
  });
});

describe('chip 刷新必须丢弃陈旧结果', () => {
  test('每次刷新都递增 token', () => {
    expect(updateBody).toMatch(/const token = \+\+workdirTagToken;/);
  });

  test('token 声明在模块级（跨调用共享）', () => {
    expect(code).toMatch(/^let workdirTagToken = 0;$/m);
    expect(updateBody).not.toMatch(/let workdirTagToken/);
  });

  test('解析目录与比对权威值之后各判一次陈旧', () => {
    const guards = updateBody.match(/if \(token !== workdirTagToken\) return;/g) || [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });

  test('陈旧判定必须在写 chip 文案/标题之前', () => {
    const guardAt = updateBody.indexOf('if (token !== workdirTagToken) return;');
    const titleAt = updateBody.indexOf('el.title =');
    const textAt = updateBody.indexOf('nameEl.textContent =');
    expect(guardAt).toBeGreaterThan(-1);
    expect(titleAt).toBeGreaterThan(guardAt);
    expect(textAt).toBeGreaterThan(guardAt);
  });

  test('目录取值仍只走 resolveWorkdirForSession，不读平台单例', () => {
    expect(updateBody).toContain('resolveWorkdirForSession(sid)');
    expect(updateBody).not.toContain('agentPlatform.workdir');
  });
});

describe('新建/删除后重建会话只派发 session-switched（chip 靠它兜底）', () => {
  const uiCode = readCode(SESSION_UI);

  test('newSession 派发 session-switched', () => {
    const body = bodyOf(uiCode, 'export async function newSession()');
    expect(body).toContain("dispatchEvent(new CustomEvent('session-switched'");
  });

  test('reloadAfterDelete 派发 session-switched', () => {
    const body = bodyOf(uiCode, 'async function reloadAfterDelete()');
    expect(body).toContain("dispatchEvent(new CustomEvent('session-switched'");
  });
});
