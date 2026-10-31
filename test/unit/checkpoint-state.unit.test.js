// checkpoint → resumeState 的字段级守卫（根治「写得进、读不回」）。
//
// 背景：写侧（saveCheckpointNow 的 payload）与读侧（resumeReactLoopFromCheckpoint 组装的
// resumeState）分别在 react-loop 的两个函数里，字段漂移没有任何类型检查兜底。真实事故：
// goalState 写进了 checkpoint 却没被读回来 —— 用户已暂停的目标在恢复时回退到发送那一刻的
// 快照，重新被授予无人值守放行。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { RESUME_STATE_KEYS, buildResumeState } from '../../src/background/checkpoint-state.js';

const LOOP_SRC = readFileSync(join(process.cwd(), 'src/background/react-loop.js'), 'utf8');

describe('buildResumeState', () => {
  it('五个字段全部搬过去（少一个就是一次静默丢现场）', () => {
    const checkpoint = {
      taskState: { plan: ['a'] },
      subtaskPlan: { id: 'p1' },
      subtaskProgress: { done: ['s1'] },
      notesState: [{ id: 'n1', text: '记一笔' }],
      goalState: { id: 'g1', status: 'paused' },
    };
    const resume = buildResumeState(checkpoint);
    expect(Object.keys(resume).sort()).toEqual([...RESUME_STATE_KEYS].sort());
    for (const key of RESUME_STATE_KEYS) expect(resume[key]).toEqual(checkpoint[key]);
  });

  it('键集合与实现一致：漏写/多写都挂在 RESUME_STATE_KEYS 上', () => {
    expect(Object.keys(buildResumeState({})).sort()).toEqual([...RESUME_STATE_KEYS].sort());
    // 写侧 payload 必须带齐同样的键，否则读侧的默认值会把现场覆盖成空
    const from = LOOP_SRC.indexOf('executionLog: [...executionLog],');
    const to = LOOP_SRC.indexOf('interruptedReason:', from);
    expect(from).toBeGreaterThan(-1);
    const payload = LOOP_SRC.slice(from, to);
    for (const key of RESUME_STATE_KEYS) {
      expect(payload, `checkpoint payload 缺少 ${key}`).toContain(key);
    }
  });

  it('脏数据不抛：notesState 非数组归空，其余回落 null', () => {
    const resume = buildResumeState({ notesState: 'oops', taskState: 0, goalState: '' });
    expect(resume.notesState).toEqual([]);
    expect(resume.taskState).toBeNull();
    expect(resume.goalState).toBeNull();
    expect(buildResumeState(null).subtaskPlan).toBeNull();
  });

  it('恢复入口真的用它组装 resumeState（不是又写了一份内联对象）', () => {
    expect(LOOP_SRC).toMatch(/buildResumeState\(checkpoint\)/);
    expect(LOOP_SRC).not.toMatch(/taskState: checkpoint\.taskState/);
  });

  it('run 开始重置的计时起点必须同步进 store（裁决回查以 store 为权威）', () => {
    // 收尾裁决会读 store 并整份覆盖闭包副本：只改副本的话旧起点被盖回来，
    // 时间预算照样把停机空窗算成执行时长，修了等于没修。
    expect(LOOP_SRC).toMatch(/g\.status === GOAL_STATUS\.ACTIVE \? startGoalRunClock\(g\) : g/);
    expect(LOOP_SRC).toMatch(/const resynced = await updateGoalInStore\(sessionId, \(g\) => \{/);
    expect(LOOP_SRC).toMatch(/if \(resynced\) goalState = resynced;/);
  });
});
