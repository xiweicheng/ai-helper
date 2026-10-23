// subtask-stream-decoupling.unit.test.js - 子任务流式解耦守卫
//
// 回归背景：react-loop 曾对子任务强制 { streamEnabled: false }，本意只是关闭
// UI 推送，却连 API 协议一起降级成非流式。部分企业网关会在非流式请求上追加
// stream_options，导致子任务调用报 stream/stream_options 不匹配而全部失败。
// 修复约定：协议层（request.stream / SSE 读取）由总开关控制父/子任务统一生效；
// UI 推送层（STREAM_START / StreamController sendFn）才对子任务静默。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const REACT_LOOP = readFileSync(new URL('../../src/background/react-loop.js', import.meta.url), 'utf8');

describe('子任务流式协议与 UI 推送解耦', () => {
  test('协议开关 apiStreamEnabled 直接读总开关（不受 isSubtask 影响）', () => {
    expect(REACT_LOOP).toMatch(
      /const apiStreamEnabled = config\.streamConfig\?\.streamEnabled !== false;/
    );
  });

  test('UI 开关 = 协议开启且非子任务', () => {
    expect(REACT_LOOP).toMatch(
      /const uiStreamEnabled = apiStreamEnabled && !isSubtask;/
    );
  });

  test('请求体 stream 字段按协议开关（子任务也可流式）', () => {
    expect(REACT_LOOP).toMatch(/stream: apiStreamEnabled/);
    expect(REACT_LOOP, '不得再用被子任务降级的 streamConfig 决定协议').not.toMatch(
      /stream: streamConfig\.streamEnabled !== false/
    );
  });

  test('STREAM_START 预发送仅在主任务 UI 推送开启时', () => {
    expect(REACT_LOOP).toMatch(
      /if \(uiStreamEnabled\) \{\s*\n\s*chrome\.runtime\.sendMessage\(\{\s*\n\s*type: 'STREAM_START'/
    );
  });

  test('SSE 读取按协议开关，子任务用静默 sendFn 阻断 UI 消息', () => {
    expect(REACT_LOOP).toMatch(/if \(apiStreamEnabled && fetchResponse\.body\) \{/);
    expect(REACT_LOOP).toMatch(
      /new StreamController\(sessionId, streamConfig, \{[\s\S]{0,160}?sendFn: uiStreamEnabled \? undefined : \(\) => Promise\.resolve\(\)/
    );
  });

  test('streamConfig 降级仅由 uiStreamEnabled 决定（不再按 isSubtask 强制）', () => {
    expect(REACT_LOOP).toMatch(
      /const streamConfig = uiStreamEnabled\s*\n?\s*\? config\.streamConfig\s*\n?\s*: \{ \.\.\.config\.streamConfig, streamEnabled: false \}/
    );
    expect(REACT_LOOP, '不得残留按 isSubtask 强制非流式的旧写法').not.toMatch(
      /const streamConfig = isSubtask\s*\n?\s*\? \{ \.\.\.config\.streamConfig, streamEnabled: false \}/
    );
  });
});
