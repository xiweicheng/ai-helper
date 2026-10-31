// @vitest-environment jsdom
// 目标条「暂停」态行为钉：暂停只停「下一轮尝试」，不是彻底停下。
// 只要输入区 🎯 开关还亮着，下一条消息就会把目标复活（goal-store 的 set 分支），
// 所以「已暂停」必须同时说清楚「还会自己接着跑」，否则用户以为要手动点继续。
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const DOM = `
  <div class="toolbar-chip-group" id="goalGroup">
    <label class="check-toggle" for="goalModeBtn">
      <input type="checkbox" id="goalModeBtn">
      <span class="tool-toggle-label">目标</span>
    </label>
  </div>
  <div id="goalBar">
    <span id="goalBarStatus"></span>
    <span id="goalBarObjective"></span>
    <span id="goalBarMeta"></span>
    <button id="goalBarApprove"></button>
    <button id="goalBarEditBtn"></button>
    <button id="goalBarPauseBtn"></button>
    <button id="goalBarResumeBtn"></button>
    <button id="goalBarClearBtn"></button>
  </div>
  <div id="toastContainer"></div>
`;

let nextGoalResp = null;

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeGoal(over = {}) {
  return {
    id: 'g1',
    sessionId: 's1',
    objective: '把目标模式评审完',
    status: 'paused',
    turnsUsed: 3,
    turnBudget: 20,
    autoApprove: false,
    constraints: [],
    ...over,
  };
}

const metaText = () => document.getElementById('goalBarMeta').textContent;

describe('目标条：暂停 ≠ 彻底停下', () => {
  let panel;
  let state;

  // DOM 只建一次：initGoalPanel 把 els 和事件监听钉在首轮节点上，
  // 每个用例重建 body 会让 renderGoalBar 往已脱离文档的旧节点上写。
  beforeAll(async () => {
    document.body.innerHTML = DOM;
    chrome.runtime.sendMessage = (message, cb) => cb(nextGoalResp);
    chrome.storage.local.get = (keys, cb) => cb({ goalConfig: { enabled: true } });
    panel = await import('../../src/side_panel/goal-panel.js');
    state = (await import('../../src/side_panel/state.js')).default;
    panel.initGoalPanel();
  });

  beforeEach(() => {
    nextGoalResp = null;
    document.getElementById('toastContainer').innerHTML = '';
    state.activeSessionId = 's1';
    state.goalMode = false;
    state.goalSnapshot = null;
  });

  test('暂停 + 开关亮着：副行写明「发消息即可继续」，chip 标成待续', () => {
    state.goalMode = true;
    state.goalSnapshot = makeGoal();
    panel.renderGoalBar();

    expect(document.getElementById('goalBarStatus').textContent).toBe('已暂停');
    expect(metaText()).toContain('发消息即可继续');
    expect(document.getElementById('goalGroup').dataset.goalIdle).toBe('1');
    // 「继续」给出口、 「暂停」此时无意义
    expect(document.getElementById('goalBarResumeBtn').style.display).toBe('');
    expect(document.getElementById('goalBarPauseBtn').style.display).toBe('none');
  });

  test('暂停 + 开关熄灭：不标待续、不补这句（继续按钮就在旁边）', () => {
    state.goalMode = false;
    state.goalSnapshot = makeGoal();
    panel.renderGoalBar();

    // 未终结的目标即使开关灭了也要留在条上，否则用户既看不到也回不去
    expect(document.getElementById('goalBar').style.display).toBe('');
    expect(document.getElementById('goalGroup').dataset.goalIdle).toBe('');
    expect(metaText()).not.toContain('发消息即可继续');
  });

  test('预算耗尽 + 开关亮着：点亮 chip 警示，但不复用「发消息即可继续」', () => {
    state.goalMode = true;
    state.goalSnapshot = makeGoal({ status: 'budget_limited' });
    panel.renderGoalBar();

    expect(document.getElementById('goalGroup').dataset.goalIdle).toBe('1');
    // 预算耗尽要「继续」补预算，下一句消息不一定能推进，语义与暂停不同
    expect(metaText()).not.toContain('发消息即可继续');
  });

  test('点「暂停」后的提示按开关状态分岔：亮着说会继续，熄灭说要手动恢复', async () => {
    const toastText = () => document.getElementById('toastContainer').textContent;

    state.goalMode = true;
    state.goalSnapshot = makeGoal({ status: 'active' });
    nextGoalResp = { goal: makeGoal({ status: 'paused' }) };
    document.getElementById('goalBarPauseBtn').click();
    await flush();
    expect(toastText()).toContain('发送消息会自动继续');

    document.getElementById('toastContainer').innerHTML = '';
    state.goalMode = false;
    state.goalSnapshot = makeGoal({ status: 'active' });
    document.getElementById('goalBarPauseBtn').click();
    await flush();
    expect(toastText()).toContain('发送消息不会自动继续');
  });

  test('后台没真落成 paused 时不假报「已暂停」', async () => {
    state.goalMode = true;
    state.goalSnapshot = makeGoal({ status: 'active' });
    // 已终态 / 通道失败：目标仍是 active，弹「已暂停」就是骗人
    nextGoalResp = { goal: makeGoal({ status: 'achieved' }) };
    document.getElementById('goalBarPauseBtn').click();
    await flush();
    expect(document.getElementById('toastContainer').textContent).toBe('');
  });
});
