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
