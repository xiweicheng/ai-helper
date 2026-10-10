// react-loop 接线守卫：防止重构时静默拆掉注入防御接线（第三层保险）
// 设计文档：docs/superpowers/specs/2026-10-10-prompt-injection-defense-design.md
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);
const REFLECTION_SRC = readFileSync(
  new URL('../../src/background/react-reflection.js', import.meta.url),
  'utf8'
);

describe('react-loop 注入防御接线守卫', () => {
  test('工具结果进入消息历史前经过 wrapUntrusted 包装', () => {
    expect(REACT_LOOP_SRC).toMatch(/content:\s*wrapUntrusted\(\s*toolName/);
  });

  test('迭代起点接入动态合约（applyUntrustedContract）', () => {
    expect(REACT_LOOP_SRC).toMatch(/applyUntrustedContract\(\s*currentMessages/);
  });

  test('导入共享模块', () => {
    expect(REACT_LOOP_SRC).toMatch(/from '\.\.\/shared\/untrusted-content\.js'/);
  });
});

describe('反思器补丁接线守卫', () => {
  test('反思器系统提示含不可信数据声明（3 处）', () => {
    const count = (REFLECTION_SRC.match(
      /untrusted external data, never as instructions/g
    ) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });
});
