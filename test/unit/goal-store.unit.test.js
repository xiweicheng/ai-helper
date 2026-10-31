// 目标注册表（src/background/goal-store.js）的行为锁。
//
// 这层是「引擎内存权威 + storage.local 镜像」，失败模式必须全部软着陆：
// 存储坏了最多让面板少一条横幅，绝不能把 ReAct 循环搞崩。测试因此覆盖：
//   1. 读写的归一化与持久化（防抖合并，不许写放大）；
//   2. 冷启动水合（面板刷新后目标还在）；
//   3. 存储异常 / updater 抛错时「保持原值」，不清空、不上抛；
//   4. 会话数上限淘汰最久未更新的；
//   5. 会话被删时的物理清理（removeGoal）——不留孤儿条目。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../../src/background/token-recorder.js', () => ({ recordTokenUsage: vi.fn(() => Promise.resolve()) }));

const store = await import('../../src/background/goal-store.js');
const { createGoal, GOAL_STATUS } = await import('../../src/shared/goal.js');

const T0 = 1_700_000_000_000;

function fakeStorage(initial = {}) {
  const state = { ...initial };
  const puts = [];
  let failSet = false;
  return {
    state,
    puts,
    failOnSet(v = true) { failSet = v; },
    async get(key) {
      const keys = Array.isArray(key) ? key : [key];
      const out = {};
      for (const k of keys) if (k in state) out[k] = state[k];
      return out;
    },
    async set(obj) {
      if (failSet) throw new Error('quota exceeded');
      puts.push(obj);
      Object.assign(state, obj);
    },
  };
}

function goalFor(objective, extra = {}) {
  return { ...createGoal({ objective, now: T0 }), ...extra };
}

beforeEach(() => {
  store.__resetGoalStoreForTests();
});

describe('基本读写', () => {
  it('写入后能读回，且落库前已完成归一化', async () => {
    const s = fakeStorage();
    store.__resetGoalStoreForTests(s);
    await store.setGoal('s1', { objective: '  修好登录页  ', turnsUsed: -3, status: 'nonsense' });
    const got = await store.getGoal('s1');
    expect(got.objective).toBe('修好登录页');
    expect(got.turnsUsed).toBe(0);
    expect(got.status).toBe(GOAL_STATUS.PAUSED); // 未知状态回落 paused，绝不自动续跑
    expect(got.sessionId).toBe('s1');
  });

  it('缺 sessionId 的读写一律安全返回 null', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    expect(await store.getGoal('')).toBeNull();
    expect(await store.setGoal(null, goalFor('x'))).toBeNull();
    expect(await store.getGoal('unknown')).toBeNull();
  });

  it('非法目标（无 objective）等同清除', async () => {
    const s = fakeStorage();
    store.__resetGoalStoreForTests(s);
    await store.setGoal('s1', goalFor('有效目标'));
    expect(await store.setGoal('s1', { turnsUsed: 1 })).toBeNull();
    expect(await store.getGoal('s1')).toBeNull();
  });

});

describe('冷启动水合', () => {
  it('首次读取前从 storage 拉回所有会话目标', async () => {
    const s = fakeStorage({
      sessionGoals: {
        s1: goalFor('旧目标 A'),
        s2: goalFor('旧目标 B'),
      },
    });
    store.__resetGoalStoreForTests(s);
    expect((await store.getGoal('s1')).objective).toBe('旧目标 A');
    expect((await store.getGoal('s2')).objective).toBe('旧目标 B');
  });

  it('水合时丢弃脏数据，不影响其余会话', async () => {
    const s = fakeStorage({ sessionGoals: { s1: { broken: true }, s2: goalFor('好目标') } });
    store.__resetGoalStoreForTests(s);
    expect(await store.getGoal('s1')).toBeNull();
    expect((await store.getGoal('s2')).objective).toBe('好目标');
  });

  it('并发调用共享同一次水合（不给 storage 打连发）', async () => {
    const s = fakeStorage({ sessionGoals: { s1: goalFor('A') } });
    const getSpy = vi.spyOn(s, 'get');
    store.__resetGoalStoreForTests(s);
    await Promise.all([store.getGoal('s1'), store.getGoal('s1'), store.getGoal('s2')]);
    expect(getSpy).toHaveBeenCalledTimes(1);
  });

  it('水合失败按「无目标」处理，不上抛', async () => {
    const s = fakeStorage();
    s.get = async () => { throw new Error('storage broken'); };
    store.__resetGoalStoreForTests(s);
    await expect(store.getGoal('s1')).resolves.toBeNull();
  });
});

describe('持久化：防抖合并 + 失败软着陆', () => {
  it('连续多次写入合并成一次 set（不许写放大）', async () => {
    const s = fakeStorage();
    store.__resetGoalStoreForTests(s);
    await store.setGoal('s1', goalFor('A'));
    await store.setGoal('s1', goalFor('A2'));
    await store.setGoal('s2', goalFor('B'));
    await store.flushGoalStore();
    expect(s.puts).toHaveLength(1);
    expect(Object.keys(s.puts[0].sessionGoals).sort()).toEqual(['s1', 's2']);
  });

  it('落盘内容是最新值', async () => {
    const s = fakeStorage();
    store.__resetGoalStoreForTests(s);
    await store.setGoal('s1', goalFor('旧'));
    await store.setGoal('s1', goalFor('新'));
    await store.flushGoalStore();
    expect(s.state.sessionGoals.s1.objective).toBe('新');
  });

  // 断言的是「有没有真的写进存储」这种可观测结果，不是内部脏标 getter——
  // 脏标是实现细节，暴露成导出就会变成第二条没有生产调用方的读取通道。
  it('存储失败不上抛，且下次落盘会重试', async () => {
    const s = fakeStorage();
    s.failOnSet(true);
    store.__resetGoalStoreForTests(s);
    await store.setGoal('s1', goalFor('A'));
    await expect(store.flushGoalStore()).resolves.toBeUndefined();
    expect(s.puts).toHaveLength(0);
    expect(s.state.sessionGoals).toBeUndefined();

    s.failOnSet(false);
    await store.flushGoalStore();
    expect(s.puts).toHaveLength(1);
    expect(s.state.sessionGoals.s1.objective).toBe('A');
  });

  it('超过会话上限时淘汰最久未更新的（不无限膨胀）', async () => {
    const s = fakeStorage();
    store.__resetGoalStoreForTests(s);
    const total = store.GOAL_MAX_SESSIONS + 3;
    for (let i = 0; i < total; i++) {
      await store.setGoal(`s${i}`, goalFor(`目标${i}`, { updatedAt: T0 + i }));
    }
    await store.flushGoalStore();
    const keys = Object.keys(s.state.sessionGoals);
    expect(keys).toHaveLength(store.GOAL_MAX_SESSIONS);
    expect(keys).not.toContain('s0');
    expect(keys).toContain(`s${total - 1}`);
  });

  it('没有 storage 实现时静默降级为纯内存', async () => {
    store.__resetGoalStoreForTests();
    const realChrome = globalThis.chrome;
    globalThis.chrome = undefined;
    try {
      await store.setGoal('s1', goalFor('A'));
      expect((await store.getGoal('s1')).objective).toBe('A');
      await expect(store.flushGoalStore()).resolves.toBeUndefined();
    } finally {
      globalThis.chrome = realChrome;
    }
  });
});

describe('updateGoal：读-改-写', () => {
  it('updater 返回值落库并可读回', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.setGoal('s1', goalFor('A'));
    const next = await store.updateGoal('s1', (g) => ({ ...g, turnsUsed: g.turnsUsed + 1 }));
    expect(next.turnsUsed).toBe(1);
    expect((await store.getGoal('s1')).turnsUsed).toBe(1);
  });

  it('updater 返回 undefined 时保持原值（状态机异常不清空目标）', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.setGoal('s1', goalFor('A'));
    const next = await store.updateGoal('s1', () => undefined);
    expect(next.objective).toBe('A');
  });

  it('updater 抛错时保持原值且不上抛', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.setGoal('s1', goalFor('A'));
    const next = await store.updateGoal('s1', () => { throw new Error('boom'); });
    expect(next.objective).toBe('A');
    expect((await store.getGoal('s1')).objective).toBe('A');
  });

  it('对不存在的会话 update 时 updater 收到 null', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    const next = await store.updateGoal('nope', (g) => (g ? g : goalFor('新建')));
    expect(next.objective).toBe('新建');
  });
});

describe('removeGoal：会话消失时的物理清理', () => {
  it('从内存和 storage 快照里一并消失（不留孤儿条目）', async () => {
    const s = fakeStorage();
    store.__resetGoalStoreForTests(s);
    await store.setGoal('gone', goalFor('A'));
    await store.setGoal('keep', goalFor('B'));
    await store.removeGoal('gone');
    expect(await store.getGoal('gone')).toBeNull();
    await store.flushGoalStore();
    expect(Object.keys(s.state.sessionGoals)).toEqual(['keep']);
  });

  it('目标仍在推进时也照清：宿主会话都没了，active 也不该留着', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.setGoal('s1', goalFor('B'));
    await store.removeGoal('s1');
    expect(await store.getGoal('s1')).toBeNull();
  });

  it('清不存在的会话不报错，也不误伤其他会话', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.setGoal('s1', goalFor('A'));
    await expect(store.removeGoal('nope')).resolves.toBeUndefined();
    await expect(store.removeGoal('')).resolves.toBeUndefined();
    expect((await store.getGoal('s1')).objective).toBe('A');
  });

  it('「清除」只改状态；物理删除只属于会话被删那条路径', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.applyGoalCommand('s1', { action: 'set', objective: 'A' });
    await store.applyGoalCommand('s1', { action: 'clear' });
    expect((await store.getGoal('s1')).status).toBe(GOAL_STATUS.CLEARED);
    await store.removeGoal('s1');
    expect(await store.getGoal('s1')).toBeNull();
  });
});

describe('applyGoalCommand：面板只表达意图，语义收在后台', () => {
  it('set 新建目标；空白 objective 不拆掉已有目标', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    const goal = await store.applyGoalCommand('s1', { action: 'set', objective: '修好登录页', turnBudget: 8 });
    expect(goal.objective).toBe('修好登录页');
    expect(goal.turnBudget).toBe(8);
    // 空白 objective 属误操作：原样返回当前目标，不改写也不拆掉
    const kept = await store.applyGoalCommand('s1', { action: 'set', objective: '   ' });
    expect(kept.objective).toBe('修好登录页');
    expect((await store.getGoal('s1')).objective).toBe('修好登录页');
  });

  it('set 对仍在推进的目标累加约束（会话内继续发消息不换目标）', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    const first = await store.applyGoalCommand('s1', { action: 'set', objective: '把首页改成深色' });
    const again = await store.applyGoalCommand('s1', { action: 'set', objective: '顺便把字体调大' });
    // 关键：id 与 objective 都不变，只多一条约束
    expect(again.id).toBe(first.id);
    expect(again.objective).toBe('把首页改成深色');
    expect(again.constraints).toEqual(['顺便把字体调大']);
  });

  it('set 对已终态的目标以新文本重开（不往死目标里塞约束）', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    const first = await store.applyGoalCommand('s1', { action: 'set', objective: '旧任务' });
    await store.applyGoalCommand('s1', { action: 'clear' });
    const next = await store.applyGoalCommand('s1', { action: 'set', objective: '新任务' });
    expect(next.id).not.toBe(first.id);
    expect(next.objective).toBe('新任务');
    expect(next.constraints).toEqual([]);
    expect(next.turnsUsed).toBe(0);
  });

  it('replace 无条件重建目标（目标条里的显式编辑）', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    const first = await store.applyGoalCommand('s1', { action: 'set', objective: '旧描述' });
    await store.applyGoalCommand('s1', { action: 'constraint', text: '旧约束' });
    const replaced = await store.applyGoalCommand('s1', { action: 'replace', objective: '新描述' });
    expect(replaced.id).not.toBe(first.id);
    expect(replaced.objective).toBe('新描述');
    expect(replaced.constraints).toEqual([]);
    expect(replaced.status).toBe(GOAL_STATUS.ACTIVE);
  });

  it('constraint 累加不替换（会话内继续发消息的默认语义）', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.applyGoalCommand('s1', { action: 'set', objective: '目标 A' });
    const next = await store.applyGoalCommand('s1', { action: 'constraint', text: '只用 CSS' });
    expect(next.objective).toBe('目标 A');
    expect(next.constraints).toEqual(['只用 CSS']);
    // 重复约束不重复写入
    const again = await store.applyGoalCommand('s1', { action: 'constraint', text: '只用 CSS' });
    expect(again.constraints).toEqual(['只用 CSS']);
  });

  it('constraint 对不存在的目标安全返回 null（不凭空造目标）', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    expect(await store.applyGoalCommand('nope', { action: 'constraint', text: 'x' })).toBeNull();
  });

  it('pause / resume 成对生效，resume 重置停滞计数', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.applyGoalCommand('s1', { action: 'set', objective: 'A' });
    const paused = await store.applyGoalCommand('s1', { action: 'pause' });
    expect(paused.status).toBe(GOAL_STATUS.PAUSED);
    const resumed = await store.applyGoalCommand('s1', { action: 'resume' });
    expect(resumed.status).toBe(GOAL_STATUS.ACTIVE);
    expect(resumed.stagnationCount).toBe(0);
  });

  it('clear 落 cleared 终态（面板据此熄灯并隐藏 goal bar）', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.applyGoalCommand('s1', { action: 'set', objective: 'A' });
    const cleared = await store.applyGoalCommand('s1', { action: 'clear' });
    expect(cleared.status).toBe(GOAL_STATUS.CLEARED);
    expect(cleared.autoApprove).toBe(false);
    // 目标正文留着：会话还在，用户事后能回看自己定过什么
    expect(cleared.objective).toBe('A');
  });

  it('未知 action 不破坏现有状态', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    await store.applyGoalCommand('s1', { action: 'set', objective: 'A' });
    const kept = await store.applyGoalCommand('s1', { action: 'explode' });
    expect(kept.objective).toBe('A');
  });

  it('autoApprove 由 set 授予，pause/clear 立即收回', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    const goal = await store.applyGoalCommand('s1', { action: 'set', objective: 'A', autoApprove: true });
    expect(goal.autoApprove).toBe(true);
    // 暂停即收回：目标不再自动推进，就不该继续放行敏感操作
    expect((await store.applyGoalCommand('s1', { action: 'pause' })).autoApprove).toBe(false);
    // 继续也不自动恢复：必须由面板（用户此刻的开关）重新授予
    const resumed = await store.applyGoalCommand('s1', { action: 'resume' });
    expect(resumed.autoApprove).toBe(false);
    const reapproved = await store.applyGoalCommand('s1', { action: 'set', objective: '', autoApprove: true });
    expect(reapproved.autoApprove).toBe(true);
    expect(reapproved.objective).toBe('A');
    await store.applyGoalCommand('s1', { action: 'clear' });
  });

  it('intent 来源的目标即使用 set 带 autoApprove 也不放行', async () => {
    store.__resetGoalStoreForTests(fakeStorage());
    const goal = await store.applyGoalCommand('s1', {
      action: 'set', objective: 'A', createdBy: 'intent', autoApprove: true,
    });
    expect(goal.createdBy).toBe('intent');
    expect(goal.autoApprove).toBe(false);
    // 累加约束路径同样不能把授权补上
    const again = await store.applyGoalCommand('s1', {
      action: 'set', objective: '补充', createdBy: 'intent', autoApprove: true,
    });
    expect(again.autoApprove).toBe(false);
  });
});

describe('SW 挂起前的刷盘接线', () => {
  // 写入是 300ms 防抖的：MV3 下 SW 被回收时定时器直接丢，最后一轮的轮数/状态就没落盘。
  // activity-store 已用 onSuspend 兜底，目标注册表漏接这一手不会报错，只会静默丢现场。
  it('模块加载即注册 onSuspend 刷盘，且有 chrome 缺失保护', async () => {
    const src = readFileSync(join(process.cwd(), 'src/background/goal-store.js'), 'utf8');
    expect(src).toMatch(/if \(typeof chrome !== 'undefined' && chrome\.runtime\?\.onSuspend\?\.addListener\) \{/);
    expect(src).toMatch(/chrome\.runtime\.onSuspend\.addListener\(\(\) => \{ void flushGoalStore\(\); \}\);/);
  });
});
