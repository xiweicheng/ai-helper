// test/unit/workdir-bind-scope.unit.test.js
// 「会话级绑定」与「全局切换」的意图必须显式声明，不能靠「有没有传 sessionId」推断。
//
// 回归背景：代理端原先只按 body.sessionId 是否存在分支——
// 上层少传一个字段（重构、序列化丢字段、activeSessionId 为空）就会静默走全局切换，
// 把所有并行会话（含正在执行和排队中的任务）的工作目录一起改掉。
// 现在代理端接受 scope: 'session' | 'global'，声明 session 却没 id 直接 400；
// 扩展端必须始终按当前会话状态填这个字段。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const managerSrc = readFileSync(join(ROOT, 'src', 'side_panel', 'workspace-manager.js'), 'utf-8');
const panelSrc = readFileSync(join(ROOT, 'src', 'side_panel', 'workspace-panel.js'), 'utf-8');
const clientSrc = readFileSync(join(ROOT, 'src', 'background', 'local-agent-client.js'), 'utf-8');
const toolExecSrc = readFileSync(join(ROOT, 'src', 'background', 'tool-executor.js'), 'utf-8');

describe('工作目录切换的意图声明（多会话下防止误改他人目录）', () => {
  test('switchWorkspace 显式声明 scope，而不是靠 sessionId 有无来推断', () => {
    expect(managerSrc).toMatch(/scope:\s*sid \? 'session' : 'global'/);
  });

  test('scope=session 时必须同时带 sessionId（否则代理端会 400）', () => {
    const body = managerSrc.slice(managerSrc.indexOf('export async function switchWorkspace'));
    const segment = body.slice(0, body.indexOf('agentRequest'));
    expect(segment).toMatch(/if \(sid\) body\.sessionId = sid;/);
  });

  test('「同时设为默认」是唯一会改全局默认的路径，且显式传 sessionId: null', () => {
    expect(panelSrc).toMatch(/switchWorkspace\(result\.workdir, \{ sessionId: null \}\)/);
    // 正常情况下必须传当前会话，避免默认走全局
    expect(panelSrc).toMatch(/switchWorkspace\(newWorkdir, \{ sessionId \}\)/);
  });

  test('恢复默认走 unbind 接口，不写全局 config 也不改 allowedPaths', () => {
    expect(panelSrc).toMatch(/unbindSessionWorkdirRemote\(sessionId\)/);
  });
});

describe('调用代理端的请求必须带上会话作用域（否则会话目录会被判越界）', () => {
  // 回归背景：代理端按 X-AIH-Session-Id 解析「本会话有效目录」。
  // 扩展端漏传 scope 时，代理端只能回落全局目录 →
  // 技能步骤的相对路径读错文件、RAG 从会话目录导入被 403。
  test('runSkill / ragIngest 把 scope 作为第 5 参传给 agentRequest', () => {
    expect(clientSrc).toMatch(/async function runSkill\(name, params, scope = null\)/);
    expect(clientSrc).toMatch(/'\/api\/skill\/run', \{ name, params \}, 'POST', 60000, scope/);
    expect(clientSrc).toMatch(/async function ragIngest\(collectionId, params, scope = null\)/);
    expect(clientSrc).toMatch(/ingest`, params, 'POST', 600000, scope/);
  });

  test('工具 handler 把分发时传入的 sessionId 继续往下传', () => {
    expect(toolExecSrc).toMatch(/async function executeAgentSkill\(args, toolCallId, sessionId = null\)/);
    expect(toolExecSrc).toMatch(/AgentClient\.runSkill\(name, params, sessionId\)/);
    expect(toolExecSrc).toMatch(/async function executeKnowledgeIngest\(args, toolCallId, sessionId = null\)/);
    expect(toolExecSrc).toMatch(/AgentClient\.ragIngest\(collectionId, payload, sessionId\)/);
  });
});
