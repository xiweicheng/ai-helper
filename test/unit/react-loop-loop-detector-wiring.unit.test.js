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
});
