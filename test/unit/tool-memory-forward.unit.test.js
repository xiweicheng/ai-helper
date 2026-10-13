/**
 * tool-memory-forward.unit.test.js
 * 扩展端长期记忆工具转发层测试：
 * - 只测"参数映射 + HTTP 转发 + 结果整形"，业务逻辑由 agent 端 memory-service/memory-routes 测试覆盖
 * - agentRequest 全量 mock，不发真实网络请求
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

vi.mock('../../src/background/local-agent-client.js', () => ({ agentRequest: vi.fn() }));

import { agentRequest } from '../../src/background/local-agent-client.js';
import { executeAgentMemory } from '../../src/background/tool-memory.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeAgentMemory 转发', () => {
  it('recall 转发到 /api/memory/recall，sessionId 放进请求体', async () => {
    agentRequest.mockResolvedValue({ success: true, message: '召回结果', results: [{ id: 'fact_1' }], total: 1, httpStatus: 200 });
    const r = await executeAgentMemory({ action: 'recall', query: 'x' }, 'tc1', 'sess1');

    expect(agentRequest).toHaveBeenCalledTimes(1);
    const [path, body, method] = agentRequest.mock.calls[0];
    expect(path).toBe('/api/memory/recall');
    expect(body).toMatchObject({ action: 'recall', query: 'x', sessionId: 'sess1' });
    expect(method).toBe('POST');
    expect(r.success).toBe(true);
    expect(r.content).toBe('召回结果');
    expect(r.total).toBe(1);
    expect(r.results).toEqual([{ id: 'fact_1' }]);
    expect(r.tool_call_id).toBe('tc1');
  });

  it('store 将 subAction 映射为 agent 端期望的 action 字段', async () => {
    agentRequest.mockResolvedValue({ success: true, message: '已添加', memory: { id: 'fact_1' }, action: 'added', stats: {}, httpStatus: 200 });
    const r = await executeAgentMemory({ action: 'store', subAction: 'add', type: 'fact', content: 'a' }, 'tc2');

    const [path, body] = agentRequest.mock.calls[0];
    expect(path).toBe('/api/memory/store');
    expect(body).toMatchObject({ action: 'add', subAction: 'add', type: 'fact', content: 'a' });
    expect(r.memory.id).toBe('fact_1');
  });

  it('manage 将 subAction 映射为 agent 端期望的 action 字段', async () => {
    agentRequest.mockResolvedValue({ success: true, message: '审查报告', scored: [], candidates: [], stats: {}, httpStatus: 200 });
    await executeAgentMemory({ action: 'manage', subAction: 'review' }, 'tc3');

    const [path, body] = agentRequest.mock.calls[0];
    expect(path).toBe('/api/memory/manage');
    expect(body).toMatchObject({ action: 'review', subAction: 'review' });
  });

  it('store/manage 缺 subAction 时本地报错，不发请求', async () => {
    const r1 = await executeAgentMemory({ action: 'store', type: 'fact', content: 'a' }, 'tc4');
    const r2 = await executeAgentMemory({ action: 'manage' }, 'tc5');
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
    expect(agentRequest).not.toHaveBeenCalled();
  });

  it('action 缺失或未知时本地报错，不发请求', async () => {
    const r1 = await executeAgentMemory({}, 'tc6');
    const r2 = await executeAgentMemory({ action: 'bogus' }, 'tc7');
    expect(r1.success).toBe(false);
    expect(r2.success).toBe(false);
    expect(agentRequest).not.toHaveBeenCalled();
  });

  it('旧版 agent（404）返回升级指引，不回退文件 API', async () => {
    agentRequest.mockResolvedValue({ success: false, error: 'error.unknownApiPath', httpStatus: 404 });
    const r = await executeAgentMemory({ action: 'recall', query: 'x' }, 'tc8');
    expect(r.success).toBe(false);
    expect(r.content).toContain('升级');
  });

  it('业务失败（400）透传 agent 端错误文案', async () => {
    agentRequest.mockResolvedValue({ success: false, error: '缺少 type 参数', httpStatus: 400 });
    const r = await executeAgentMemory({ action: 'store', subAction: 'add', content: 'a' }, 'tc9');
    expect(r.success).toBe(false);
    expect(r.content).toBe('缺少 type 参数');
    expect(r.error).toBe('缺少 type 参数');
  });

  it('转发结果不泄漏 httpStatus，也不产生字符展开垃圾键', async () => {
    agentRequest.mockResolvedValue({ success: true, message: 'ok', httpStatus: 200 });
    const r = await executeAgentMemory({ action: 'recall', query: 'q' }, 'tcid0123');
    expect(r).not.toHaveProperty('httpStatus');
    // 旧实现将 toolCallId 直传 makeResult 第三参（应形为 extra 对象），字符串展开会产生 "0":"t" 垃圾键
    expect(Object.keys(r).filter((k) => /^\d+$/.test(k))).toEqual([]);
  });
});

describe('接线守卫（源码断言）', () => {
  it('tool-memory.js 不再携带记忆业务逻辑（无文件读写/价值计算）', () => {
    const src = readFileSync(join(ROOT, 'src/background/tool-memory.js'), 'utf8');
    expect(src).not.toMatch(/function readMemoryFile|function writeMemoryFile|function calcMemoryValue/);
    expect(src).not.toMatch(/memory-injection/);
    expect(src).toMatch(/\/api\/memory\/store/);
    expect(src).toMatch(/\/api\/memory\/recall/);
    expect(src).toMatch(/\/api\/memory\/manage/);
  });

  it('index.js handler：改为请求 /api/memory/inject 并返回 remainingCount/remainingTags', () => {
    const src = readFileSync(join(ROOT, 'src/background/index.js'), 'utf8');
    expect(src).toMatch(/\/api\/memory\/inject/);
    expect(src).not.toMatch(/from '\.\/memory-injection\.js'/);
    expect(src).not.toMatch(/from '\.\/tool-memory\.js'/);
    expect(src).toMatch(/remainingCount/);
    expect(src).toMatch(/remainingTags/);
  });

  it('agent 端无记忆端点时给出升级指引，不回退文件 API', () => {
    const src = readFileSync(join(ROOT, 'src/background/tool-memory.js'), 'utf8');
    expect(src).toMatch(/memoryEndpointMissing/);
    expect(src).not.toMatch(/AgentClient\.readFile|readFile\(/);
  });

  it('utils.js：仍渲染按需召回提示行，且受 canRecallMemory 门控', () => {
    const src = readFileSync(join(ROOT, 'src/side_panel/utils.js'), 'utf8');
    expect(src).toMatch(/canRecallMemory/);
    expect(src).toMatch(/permanentNotesMore/);
    expect(src).toMatch(/remainingCount/);
    expect(src).toMatch(/remainingTags/);
  });
});
