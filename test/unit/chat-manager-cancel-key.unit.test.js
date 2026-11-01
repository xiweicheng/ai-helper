// callApi 的「本实例持有该会话监听」记账键必须与会话 id 对齐
//
// 背景：面板侧的 reattach 用 `state.pendingCancelApiMap.has(sessionId)` 判断
// 「本实例是否已经有这个会话的 callApi 监听」。这个 Map 的写入点原来走
// `state.pendingCancelApi = cancelApi` 这个 setter，而 setter 用**当前激活会话**
// 做 key；排队接力的 callApi 可能跑在非激活会话上，于是：
// - Map 里没有真正持有 listener 的 sessionId → reattach 误判「没人听」→ 重复接管；
// - 非流式模式（没有 STREAM_START）连元素守卫都挡不住 → 镜像真的建起来，
//   API_COMPLETE 被主监听与镜像各消费一次 → 同一条消息落两遍（主路径那条没有
//   callId，合并键兜不住）。
// 清理侧本来就是按 mySessionId delete，所以写入侧也必须按 mySessionId。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CHAT_MANAGER_SRC = readFileSync(
  new URL('../../src/side_panel/chat-manager.js', import.meta.url), 'utf8'
);

describe('callApi 监听记账键', () => {
  test('写入按 mySessionId（与清理侧 delete(mySessionId) 对齐）', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/pendingCancelApiMap\.set\(\s*mySessionId\s*,\s*cancelApi\s*\)/);
  });

  test('不再用会落到 activeSessionId 的 setter（接力时 key 会错）', () => {
    expect(CHAT_MANAGER_SRC).not.toMatch(/state\.pendingCancelApi\s*=\s*cancelApi/);
  });

  test('清理侧同样按 mySessionId（两侧口径一致，否则 Map 会残留）', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/pendingCancelApiMap\.delete\(\s*mySessionId\s*\)/);
  });
});
