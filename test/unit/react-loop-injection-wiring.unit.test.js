// react-loop-injection-wiring.unit.test.js - 插话注入点的位置与配对安全
//
// 插话最容易出事的不是“文案写错”，而是**插错位置**：
//   - 插在上下文裁剪之前 → critical 分支用 filterApiMessages 重建，注入被整段吞掉；
//   - 插在 assistant(tool_calls) 与它的 tool 结果之间 → 配对被打断，API 直接 400；
//   - 插在取消/超时检查之前 → 面板收到“已插入”回执，但这一轮请求根本没发出去。
// 三条都是静默失败，所以这里既锁源码顺序，也用真实 filterApiMessages 做功能反证。
import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { filterApiMessages } from '../../src/shared/token-counter.js';
import { buildInjectionContent } from '../../src/background/injection.js';

const SRC = readFileSync(new URL('../../src/background/react-loop.js', import.meta.url), 'utf8');
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

function idx(needle, label) {
  const at = SRC.indexOf(needle);
  expect(at, `react-loop.js 里找不到：${label || needle}`).toBeGreaterThan(-1);
  return at;
}

describe('注入点的位置约束', () => {
  const cancelCheck = idx('timeoutReport = computeLoopTimeoutReport', '取消/超时检查');
  const trimBlock = idx('trimMessagesByBudget(currentMessages', '上下文压力裁剪');
  const anchorUse = idx('const anchorMsg = buildPlanAnchorMessage();', '锚点注入');
  const injectAt = idx('drainPendingInjections(sessionId)', '插话 drain');

  test('在取消/超时检查之后（回执即意味着本轮请求真的要发）', () => {
    expect(injectAt).toBeGreaterThan(cancelCheck);
  });

  test('在上下文压力裁剪之后（否则被 filterApiMessages 重建吞掉）', () => {
    expect(injectAt).toBeGreaterThan(trimBlock);
  });

  test('在瞬态锚点注入之前（顺序无关但防止有人把它挪进锚点分支里）', () => {
    expect(injectAt).toBeLessThan(anchorUse);
  });

  test('只对顶层循环生效：子任务里注入会把用户的话塞进别人的活里', () => {
    const guard = SRC.slice(injectAt - 200, injectAt);
    expect(guard).toContain('if (!isSubtask && sessionId)');
  });
});

describe('注入的落点', () => {
  test('写进 currentMessages（持久，随 checkpoint 落盘）', () => {
    expect(SRC).toContain("currentMessages.push({ role: 'user', content: injContent });");
  });

  test('同时补进本轮 filteredMessages（本轮请求立刻可见）', () => {
    expect(SRC).toContain("filteredMessages = [...filteredMessages, { role: 'user', content: injContent }];");
  });

  test('执行日志里留一个 user_injection 节点（用户在任务进度里能看到插话）', () => {
    expect(SRC).toContain("nodeType: 'user_injection'");
    expect(SRC).toContain("nodeName: t('reactLoop.userInjection')");
  });

  test('吸收后回 INJECT_ABSORBED（这是面板出队的唯一凭据）', () => {
    expect(SRC).toContain("type: 'INJECT_ABSORBED'");
    expect(SRC).toContain('function notifyInjectionsAbsorbed(');
    expect(SRC).toContain('notifyInjectionsAbsorbed(sessionId, injections, iteration, callId);');
  });

  test('循环结束时丢弃未注入的条目并回 INJECT_REJECTED（不让面板干等 15s）', () => {
    const dropAt = SRC.indexOf('dropPendingInjections(sessionId)');
    expect(dropAt).toBeGreaterThan(-1);
    // 必须落在 finally 里：正常结束 / 抛错 / 用户取消三条退出路径都要把条目退回队列，
    // 只写在正常分支上，取消时条目就会挂在 injecting 白等超时。
    const finallyAt = SRC.lastIndexOf('} finally {', dropAt);
    expect(finallyAt).toBeGreaterThan(-1);
    expect(SRC.slice(finallyAt, dropAt)).toContain('checkpointThrottle.cancel()');
    expect(SRC.slice(dropAt, dropAt + 600)).toContain("type: 'INJECT_REJECTED'");
  });
});

describe('配对安全（用真实 filterApiMessages 反证）', () => {
  const toolTurn = () => ([
    { role: 'system', content: 'sys' },
    { role: 'user', content: '把首页改一下' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'a', arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: 'call_1', content: 'ok' },
  ]);

  test('在 tool 结果之后追加插话：配对完整，插话留在末尾', () => {
    const messages = [
      ...toolTurn(),
      { role: 'user', content: buildInjectionContent({ text: '顺便把标题改掉' }, new Date(2026, 9, 25, 10, 0, 0)) },
    ];

    const filtered = filterApiMessages(messages);
    expect(filtered).toHaveLength(5);

    const assistant = filtered.find((m) => m.role === 'assistant');
    const toolIds = filtered.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);
    expect(assistant.tool_calls).toHaveLength(1);
    expect(toolIds).toEqual(assistant.tool_calls.map((tc) => tc.id));
    expect(filtered[filtered.length - 1].role).toBe('user');
  });

  test('反证：插在 assistant(tool_calls) 与 tool 之间，配对会被打断', () => {
    // 这条用例是“绝不能在工具调用中途 splice”的可执行证据：
    // 顺序错了 filterApiMessages 会清掉 tool_calls（真实 API 上就是 400）。
    const [system, user, assistant, tool] = toolTurn();
    const broken = filterApiMessages([
      system,
      user,
      assistant,
      { role: 'user', content: '[interjection]' },
      tool,
    ]);

    // 实测行为：tool_calls 被清空、content 又为空 → 整条 assistant 直接剔除，
    // 但 tool 结果留在原地没人认领。这不是“少一条消息”，是请求体本身非法。
    expect(broken.filter((m) => m.role === 'assistant')).toHaveLength(0);
    const toolIds = broken.filter((m) => m.role === 'tool').map((m) => m.tool_call_id);
    expect(toolIds).toEqual(['call_1']);
  });
});

describe('整条链路的接线（少一环就是静默失败）', () => {
  test('后台收到 INJECT_MESSAGE：没在跑当场拒，在跑才入缓冲', () => {
    const bg = read('src/background/index.js');
    expect(bg).toContain("if (message.type === 'INJECT_MESSAGE')");
    expect(bg).toContain('if (!activeReactLoops.has(sessionId))');
    expect(bg).toContain("reason: 'no_running_task'");
    expect(bg).toContain('enqueueInjection(');
  });

  test('面板监听两种回执（少了监听，条目会挂在 injecting 直到超时）', () => {
    const runner = read('src/side_panel/queue-runner.js');
    expect(runner).toContain('chrome.runtime.onMessage.addListener(handleInjectionMessage)');
    expect(runner).toContain("message.type === 'INJECT_ABSORBED'");
    expect(runner).toContain("message.type === 'INJECT_REJECTED'");
  });

  test('chip 上有 ⚡ 入口且接到 runner（不能只有样式）', () => {
    const panel = read('src/side_panel/queue-panel.js');
    expect(panel).toContain('data-act="inject"');
    expect(panel).toContain("case 'inject':");
    expect(panel).toContain('injectQueueItem(itemId, sessionId)');
  });

  test('时间线能认出 user_injection 并展示插话原文', () => {
    const view = read('src/side_panel/execution-log-render.js');
    expect(view).toContain("entry.nodeType === 'user_injection'");
    // 中英各一份，不允许只补中文
    expect(view.match(/sectionUserInjection:/g)).toHaveLength(2);
    expect(view).toContain("t('execLog.sectionUserInjection')");
  });

  test('插话节点文案中英成对注册', () => {
    expect(SRC.match(/userInjection: '/g)).toHaveLength(2);
  });
});
