// 自动续跑（alarms）的终态收尾
//
// 缺口现场：手动「继续执行」走 RESUME_REACT 分支，跑完会兜底落库 + 广播 API_COMPLETE；
// 而闹钟自动续跑只是 `await resumeReactLoopFromCheckpoint(...)` 就把结果丢了 ——
// 续跑跑完了，面板镜像收不到终态（气泡永远「生成中」），刷新后会话里也什么都没有，
// 只剩 checkpoint 被清掉。用户看到的就是「后台跑完了，什么都没有」。
//
// 因此收尾必须与 RESUME_REACT 同构：先按「面板是否在场」兜底落库，再广播终态
// （面板重开的镜像靠广播收尾渲染，与 SW 的写入按 callId 去重）。
import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const INDEX_SRC = readFileSync(
  new URL('../../src/background/index.js', import.meta.url), 'utf8'
);

const load = async () => {
  const { finalizeAutoResume } = await import('../../src/background/auto-resume-finalize.js');
  const persist = vi.fn(async () => ({ written: true }));
  const broadcast = vi.fn();
  return { finalizeAutoResume, persist, broadcast, io: { persist, broadcast } };
};

describe('finalizeAutoResume 自动续跑终态收尾', () => {
  test('成功终态：先兜底落库，再广播 API_COMPLETE（镜像靠它收尾渲染）', async () => {
    const { finalizeAutoResume, persist, broadcast, io } = await load();
    await finalizeAutoResume({
      sessionId: 's1',
      callId: 'auto_1',
      content: '续跑完成',
      executionLog: [{ id: 'n1' }],
      reflectionScore: 88,
      wasRevised: true,
      budgetEnded: true,
      exhaustedBy: 'budget',
    }, io);

    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0]).toMatchObject({
      sessionId: 's1', callId: 'auto_1', content: '续跑完成', budgetEnded: true,
    });
    expect(broadcast).toHaveBeenCalledTimes(1);
    expect(broadcast.mock.calls[0][0]).toMatchObject({
      type: 'API_COMPLETE',
      sessionId: 's1',
      callId: 'auto_1',
      content: '续跑完成',
      executionLog: [{ id: 'n1' }],
      reflectionScore: 88,
      wasRevised: true,
      budgetEnded: true,
      exhaustedBy: 'budget',
      resumed: true,
    });
  });

  test('失败终态：错误文案同样入会话 + 广播 API_ERROR（不能静默失败）', async () => {
    const { finalizeAutoResume, persist, broadcast, io } = await load();
    await finalizeAutoResume({
      sessionId: 's1', callId: 'auto_2', error: '网关 502', executionLog: [],
    }, io);

    expect(persist.mock.calls[0][0]).toMatchObject({ sessionId: 's1', callId: 'auto_2', error: '网关 502' });
    expect(broadcast.mock.calls[0][0]).toMatchObject({
      type: 'API_ERROR', sessionId: 's1', callId: 'auto_2', error: '网关 502', resumed: true,
    });
  });

  test('落库或广播抛错都不外溢（收尾失败不能炸掉闹钟的下一拍）', async () => {
    const { finalizeAutoResume, io } = await load();
    io.persist = vi.fn(async () => { throw new Error('IDB 挂了'); });
    io.broadcast = vi.fn(() => { throw new Error('no receiver'); });

    await expect(finalizeAutoResume({ sessionId: 's1', callId: 'auto_3', content: 'x' }, io))
      .resolves.toBeTruthy();
    // 落库挂了也必须尝试广播：两个方向都不通才算真的没救
    expect(io.broadcast).toHaveBeenCalledTimes(1);
  });

  test('缺 sessionId → 不落库不广播（脏数据不能写进会话）', async () => {
    const { finalizeAutoResume, persist, broadcast, io } = await load();
    await finalizeAutoResume({ callId: 'auto_4', content: 'x' }, io);
    expect(persist).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
  });
});

describe('接线守卫：闹钟续跑不能只 await 不广播', () => {
  const segment = () => {
    // 注意不能直接找 registerAutoResumeAlarmHandler：它先出现在 import 行
    const start = INDEX_SRC.indexOf('registerAutoResumeAlarmHandler(async');
    expect(start).toBeGreaterThan(-1);
    // 按注册调用的结束边界切片，不要用固定长度：接入新逻辑加几行就会把 catch 分支截断
    const end = INDEX_SRC.indexOf('\n});', start);
    expect(end).toBeGreaterThan(start);
    return INDEX_SRC.slice(start, end + 4);
  };

  test('续跑结果被接住并交给 finalizeAutoResume（成功路径）', () => {
    expect(INDEX_SRC).toMatch(/import\s*\{[^}]*finalizeAutoResume[^}]*\}\s*from\s*'\.\/auto-resume-finalize\.js'/);
    const seg = segment();
    expect(seg).toMatch(/const result\s*=\s*await resumeReactLoopFromCheckpoint\(/);
    expect(seg).toMatch(/finalizeAutoResume\(/);
    // 老写法（丢掉结果）必须消失，否则就是「跑完没人收尾」
    expect(seg).not.toMatch(/await resumeReactLoopFromCheckpoint\([^)]*\);\s*\n\s*\} catch/);
  });

  test('续跑抛错时也走收尾（终态是 API_ERROR，不能只打日志）', () => {
    const seg = segment();
    const catchIdx = seg.indexOf('.catch') > -1 ? seg.indexOf('.catch') : seg.indexOf('catch (');
    expect(catchIdx).toBeGreaterThan(-1);
    expect(seg.slice(catchIdx)).toMatch(/finalizeAutoResume\([\s\S]{0,400}?error/);
  });
});
