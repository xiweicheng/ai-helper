// react-loop 循环检测器接线守卫：防止重构时静默拆掉检测接线
// 设计文档：docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);

describe('循环检测 i18n 接线守卫（只增不改）', () => {
  const KEYS = [
    'loopStoppedRepeat', 'loopStoppedRefEnum', 'loopStoppedOscillation',
    'loopStoppedFailureScope', 'loopStoppedNoProgressScroll', 'loopStoppedBudget',
  ];

  test('6 个硬停文案 key 在 zh/en 双字典中均存在', () => {
    for (const k of KEYS) {
      const count = (SRC.match(new RegExp(k, 'g')) || []).length;
      expect(count, `${k} 应出现 ≥2 次（zh+en）`).toBeGreaterThanOrEqual(2);
    }
  });

  test('旧 key 保留（只增不改）', () => {
    expect(SRC).toMatch(/infiniteLoopDetected/);
  });
});

describe('循环检测器接线守卫', () => {
  test('导入检测器模块', () => {
    expect(SRC).toMatch(/from '\.\/loop-detector\.js'/);
  });

  test('创建检测器实例与记录数组', () => {
    expect(SRC).toMatch(/const loopDetector = createLoopDetector\(\)/);
    expect(SRC).toMatch(/const loopRecords = \[\]/);
  });

  test('工具记录锚点 ≥5 处（被拒/plan_task/跳过/常规/错误）', () => {
    const count = (SRC.match(/loopRecords\.push\(/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(5);
  });

  test('轮末 flush 共 3 处（2 个 plan_task 分支 + 汇合点）', () => {
    const count = (SRC.match(/flushLoopRecords\(\)/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('旧指纹逻辑已完全移除（无双检测器并行）', () => {
    expect(SRC).not.toMatch(/lastCombinedFingerprint/);
    expect(SRC).not.toMatch(/REPEATED_CALL_WARN_THRESHOLD/);
    expect(SRC).not.toMatch(/repeatedCallCount/);
  });

  test('stop 经 createErrorWithLog 抛出（复用既有安全终止链路）', () => {
    expect(SRC).toMatch(/createErrorWithLog\(t\(`reactLoop\.\$\{msgKey\}/);
  });

  test('提醒注入为唯一 System Notice 注入点（role: user）', () => {
    const count = (SRC.match(/\[System Notice\]/g) || []).length;
    expect(count).toBe(1);
    expect(SRC).toMatch(/role: 'user',\s*\n\s*content: `\[System Notice\] \$\{warnings\.join/);
  });

  // —— 位置/序号型断言：计数型断言无法发现“push 被挪到早退 return 之后”类回归 ——

  test('记录锚点均带声明序号 order（反向断言：不存在无 order 形态，无 [^;] 截断盲区）', () => {
    // 并行路径 push 顺序 = 完成顺序，必须可重排；首个键即 name/args/result 的 push 即回归
    expect(SRC).not.toMatch(/loopRecords\.push\(\{\s*(name|args|result):/);
    const count = (SRC.match(/loopRecords\.push\(/g) || []).length;
    // 5 个生命周期锚点（被拒/plan_task/跳过/常规/错误）+ 1 个缓存命中锚点
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test('flush 前按声明序号稳定排序（消除并行完成顺序抖动）', () => {
    expect(SRC).toMatch(/pending\.sort\(\(a, b\) => \(a\.order \?\? 0\) - \(b\.order \?\? 0\)\)/);
  });

  test('缓存命中路径同样记录（旧指纹逻辑不依赖 tool 消息，不得回退）', () => {
    expect(SRC).toMatch(
      /loopRecords\.push\(\{ order: callOrder, name: toolName, args: toolArgs, result: cached\.toolResult \?\? \{ fromCache: true \} \}\);\n\s*return \{ \.\.\.cached, fromCache: true \};/
    );
  });

  test('flush 位置守卫：2 个 planTaskHandled 分支首行即 flush（防移出分支）', () => {
    const count = (SRC.match(/if \(planTaskHandled\) \{\n\s*flushLoopRecords\(\);/g) || []).length;
    expect(count).toBe(2);
  });

  test('锚点邻接守卫：push 紧随 currentMessages.push 块、在 trimMessages 之前（防挪位成死代码）', () => {
    // result: toolResult 形态共 2 处（plan_task 先行响应 + 常规执行）
    const plain = (SRC.match(/\}\);\n\s*loopRecords\.push\(\{ order: callOrder, name: toolName, args: toolArgs, result: toolResult \}\);\n\s*await trimMessages\(\);/g) || []).length;
    expect(plain).toBe(2);
    // 被拒锚点
    expect(SRC).toMatch(/\}\);\n\s*loopRecords\.push\(\{ order: callOrder, name: toolName, args: toolArgs, result: \{ success: false, declined: true \} \}\);\n\s*await trimMessages\(\);/);
    // 错误锚点
    expect(SRC).toMatch(/\}\);\n\s*loopRecords\.push\(\{ order: callOrder, name: toolName, args: toolArgs, result: \{ success: false, error: toolError\.message \|\| 'Tool execution error' \} \}\);\n\s*await trimMessages\(\);/);
    // 跳过锚点（无 trimMessages，用循环变量 j 作序号）
    expect(SRC).toMatch(/loopRecords\.push\(\{ order: j, name: skippedName, args: parseToolCallArgs\(skippedCall\), result: \{ skipped: true \} \}\);/);
  });
});
