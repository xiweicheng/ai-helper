// 完成度校验器 CodeReview 守卫：doneCriteria 透传链 + M-new-1 开关门控（关闭时逐字节不变）。
//
// B1 根因：planSummary.subtasks 用显式字段白名单重建，早期漏了 doneCriteria → react-loop 拿到的
//   计划子任务永远没有 doneCriteria → annotateSubtaskCompletion 每子任务 continue → 整条校验链空转。
// M-new-1：doneCriteria 的 schema 与回显若静态下发/无条件产出，则关闭开关时请求体与工具结果报文
//   仍变，破"关则逐字节不变"，并对模型虚假承诺"完成后将独立取证核验"。故：静态 schema 移除 doneCriteria
//   （关=基线），getTools 按开关动态注入；executePlanTask 透传与回显均按 cvEnabled 裁剪。
// tool-executor.js 顶层 import 图过重（db/agent/stream），按项目既有源码守卫风格锁定接线。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const EXEC = readFileSync(join(process.cwd(), 'src/background/tool-executor.js'), 'utf8');
const AI_TOOLS = readFileSync(join(process.cwd(), 'src/background/tools/ai-tools.js'), 'utf8');
const CONTENT = readFileSync(join(process.cwd(), 'src/content/advanced-tools.js'), 'utf8');

describe('B1 executePlanTask doneCriteria 透传（按开关裁剪）', () => {
  test('透传用 cvEnabled 条件展开：关则不加 doneCriteria 键（逐字节=基线）', () => {
    expect(EXEC).toMatch(/cvEnabled \? \{ doneCriteria: Array\.isArray\(st\.doneCriteria\) \? st\.doneCriteria : \[\] \} : \{\}/);
  });

  test('formatResult 达标标准回显仅在 cvEnabled 时产出（关则无虚假承诺）', () => {
    expect(EXEC).toMatch(/if \(cvEnabled && Array\.isArray\(st\.doneCriteria\)[\s\S]{0,120}?达标/);
  });
});

describe('M-new-1 schema 门控：关闭时请求体逐字节不变', () => {
  test('AI_TOOLS 静态数组不再内嵌 doneCriteria（移入按开关注入的常量）', () => {
    const idx = AI_TOOLS.indexOf('export const PLAN_TASK_DONE_CRITERIA_ITEM');
    expect(idx).toBeGreaterThan(0);
    // AI_TOOLS 数组区（常量之前）不含 doneCriteria 属性定义（关开关时下发给模型的工具定义=基线）
    expect(AI_TOOLS.slice(0, idx)).not.toMatch(/doneCriteria:\s*\{/);
  });

  test('getTools 读取 completionVerificationConfig 并按开关动态注入 doneCriteria', () => {
    expect(EXEC).toMatch(/chrome\.storage\.local\.get\(\[[^\]]*'completionVerificationConfig'/);
    expect(EXEC).toMatch(/completionVerificationEnabled\s*=\s*[^;]*completionVerificationConfig[^;]*enabled/);
    expect(EXEC).toMatch(/if\s*\(tool\.id === 'plan_task' && completionVerificationEnabled\)[\s\S]{0,240}?doneCriteria\s*=\s*PLAN_TASK_DONE_CRITERIA_ITEM/);
  });
});

// M5 守卫：doneCriteria 的 schema 字段语义须与 content 实现对齐，否则模型填错→恒 false 误报未达标
describe('M5 doneCriteria schema ↔ content 实现字段语义一致', () => {
  test('schema 明确 attribute_equals 的 expected 为 attr=value 形式', () => {
    expect(AI_TOOLS).toMatch(/attribute_equals[\s\S]{0,160}?attr=value/);
  });

  test('schema 明确 text_contains 的 expected 为待查文本', () => {
    expect(AI_TOOLS).toMatch(/text_contains -> substring to find/);
  });

  test('content text_contains 回落到 target；url_matches 回落到 expected', () => {
    expect(CONTENT).toMatch(/criterion\.expected != null \? String\(criterion\.expected\)[\s\S]{0,80}?criterion\.target/);
    expect(CONTENT).toMatch(/const pat = target \|\| \(criterion\.expected/);
  });
});
