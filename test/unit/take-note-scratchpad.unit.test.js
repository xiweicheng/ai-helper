// take_note scratchpad 工具单元测试：注册接线 / 安全分类 / handler 行为 / 锚点与回灌源不变量 / 子任务隔离
// 设计文档：cache/plans/take_note_Scratchpad_Tool_ddaa0860.md
// 注意：读源码做守卫用 process.cwd()（vitest 从仓库根运行），勿用 import.meta.url
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test, expect } from 'vitest';
import { RAW_TOOLS, BUILTIN_TOOLS } from '../../src/background/constants.js';
import { AGENT_TOOLS } from '../../src/background/tools/agent-tools.js';
import zhLocale from '../../src/shared/locales/zh.js';
import enLocale from '../../src/shared/locales/en.js';
import {
  KNOWN_SAFE_TOOLS,
  UNTRUSTED_CONTENT_TOOLS,
  wrapUntrusted,
} from '../../src/shared/untrusted-content.js';
import { executeTakeNote } from '../../src/background/tool-executor.js';

const REACT_LOOP = readFileSync(join(process.cwd(), 'src/background/react-loop.js'), 'utf8');
const CHECKPOINT_STATE_SRC = readFileSync(join(process.cwd(), 'src/background/checkpoint-state.js'), 'utf8');

// 与 untrusted-content.unit.test.js 同款分类过滤：每个工具必须显式二选一
function unclassifiedIds(tools) {
  return tools
    .filter((t) => !UNTRUSTED_CONTENT_TOOLS.has(t.id) && !KNOWN_SAFE_TOOLS.has(t.id))
    .map((t) => t.id);
}

describe('take_note 注册接线（单一数据源）', () => {
  test('AGENT_TOOLS 含 take_note 条目，形状正确', () => {
    const tool = AGENT_TOOLS.find((t) => t.id === 'take_note');
    expect(tool, 'AGENT_TOOLS 必须注册 take_note').toBeTruthy();
    expect(tool.execution).toBe('background');
    expect(tool.category).toBe('ai_collaboration');
    expect(tool.requiresConfirmation).toBe(false);
    // take_note 经拦截改写 notesState（loop 作用域状态），必须 non-parallelizable 对齐 plan_task：
    // 否则同 args 在 TTL 内命中结果缓存被早返回（先于拦截），重复便签被静默丢弃 + 回过期计数
    expect(tool.parallelizable, '改写 loop 状态的工具不得进结果缓存').toBe(false);
    expect(tool.function.name).toBe('take_note');
    expect(tool.function.parameters.required).toEqual(['content']);
    expect(tool.function.parameters.properties.content).toBeTruthy();
  });

  test('take_note 经 constants 自动流入 RAW_TOOLS / BUILTIN_TOOLS', () => {
    expect(RAW_TOOLS.some((t) => t.id === 'take_note')).toBe(true);
    expect(BUILTIN_TOOLS.some((t) => t.id === 'take_note')).toBe(true);
  });

  test('UI 有本地化描述键（防回落英文 schema 描述）且简短', () => {
    // tool-panel 用 t('tool.<id>')，缺 key 会回落 function.description（英文长句）
    const zh = zhLocale.tool.take_note;
    const en = enLocale.tool.take_note;
    expect(zh, 'zh 必须有 tool.take_note').toBeTruthy();
    expect(en, 'en 必须有 tool.take_note').toBeTruthy();
    expect(/[\u4e00-\u9fff]/.test(zh), 'zh 描述须为中文').toBe(true);
    expect(zh.length, 'zh 描述不得过长').toBeLessThanOrEqual(30);
    expect(en.length, 'en 描述不得过长').toBeLessThanOrEqual(60);
  });
});

describe('take_note 安全分类（穷举守卫必过）', () => {
  test('归入 KNOWN_SAFE_TOOLS 且不在 UNTRUSTED_CONTENT_TOOLS（模型自产文本）', () => {
    expect(KNOWN_SAFE_TOOLS.has('take_note')).toBe(true);
    expect(UNTRUSTED_CONTENT_TOOLS.has('take_note')).toBe(false);
  });

  test('白名单原样返回（不包装）', () => {
    const content = 'note saved';
    expect(wrapUntrusted('take_note', content, 's1')).toBe(content);
  });

  test('正向：RAW_TOOLS 全部被显式分类（含 take_note）', () => {
    expect(unclassifiedIds(RAW_TOOLS), '存在未分类工具').toEqual([]);
  });

  test('负向对照：漏分类的工具必须被同一守卫判红', () => {
    // 造一个未登记分类的假工具，证明过滤逻辑确实能捕获缺失分类（守卫非空转）
    const fake = [{ id: 'take_note' }, { id: 'totally_unclassified_probe_tool' }];
    const flagged = unclassifiedIds(fake);
    expect(flagged).toContain('totally_unclassified_probe_tool');
    expect(flagged).not.toContain('take_note');
  });
});

describe('executeTakeNote handler 行为（校验 + 规整，不持有 notesState）', () => {
  test('合法内容 → success，data 回传 content/label', async () => {
    const r = await executeTakeNote({ content: 'decided to use Range API', label: 'decision' }, 'call1');
    expect(r.success).toBe(true);
    expect(r.data).toEqual({ content: 'decided to use Range API', label: 'decision' });
  });

  test('trim 前后空白', async () => {
    const r = await executeTakeNote({ content: '  hi  ' }, 'c');
    expect(r.data.content).toBe('hi');
  });

  test('空内容 → success:false，不入便签', async () => {
    const r = await executeTakeNote({ content: '   ' }, 'c');
    expect(r.success).toBe(false);
    expect(String(r.error)).toContain('empty');
  });

  test('超 500 字符 → 截断并标记 truncated', async () => {
    const long = 'x'.repeat(600);
    const r = await executeTakeNote({ content: long }, 'c');
    expect(r.success).toBe(true);
    expect(r.data.content.length).toBe(500);
    expect(String(r.message)).toContain('truncated');
  });

  test('handler 返回不触碰任何 loop 级状态字段（仅 data/message）', async () => {
    const r = await executeTakeNote({ content: 'a' }, 'c');
    expect(Object.keys(r).sort()).toEqual(['data', 'message', 'success', 'tool_call_id'].sort());
  });
});

describe('react-loop 源不变量：notesState / 锚点 / 回灌 / checkpoint', () => {
  test('notesState 为函数作用域 let，恢复回灌 resumeState.notesState', () => {
    expect(REACT_LOOP).toMatch(/let notesState = Array\.isArray\(resumeState\?\.notesState\)/);
  });

  test('buildNotesAnchorMessage：空 → null；从最新往旧逐条累加到 token 预算为止（保尾弃头），条数上限兜底', () => {
    expect(REACT_LOOP).toMatch(
      /const buildNotesAnchorMessage = \(\) => \{\s*if \(!Array\.isArray\(notesState\) \|\| notesState\.length === 0\) return null;/
    );
    // 反向遍历 + 逐条累加 + 条数上限；超预算 break（首条不受预算限制，恒保留最新 1 条）；unshift 保持旧→新展示序
    expect(REACT_LOOP).toMatch(/for \(let i = notesState\.length - 1; i >= 0 && picked\.length < NOTES_MAX_ANCHOR; i--\)/);
    expect(REACT_LOOP).toMatch(/picked\.length > 0 && estimateTokens\([\s\S]{0,80}?\) > NOTES_ANCHOR_TOKENS\) break;/);
    expect(REACT_LOOP).toMatch(/picked\.unshift\(line\)/);
    // 负向：不得再走"整体截断丢中段"的旧路径
    expect(REACT_LOOP).not.toMatch(/notesState\.slice\(-NOTES_MAX_ANCHOR\)/);
    expect(REACT_LOOP).not.toMatch(/truncateByTokens\(body, NOTES_ANCHOR_TOKENS\)/);
  });

  test('take_note 结果被拦截并入 notesState，含 FIFO 上限', () => {
    expect(REACT_LOOP).toMatch(/toolName === 'take_note'[\s\S]{0,400}?notesState\.push\(\{[^}]*content: toolResult\.data\.content/);
    expect(REACT_LOOP).toMatch(/notesState\.length > NOTES_MAX_STORED\)[\s\S]{0,60}?notesState\.splice\(0,/);
  });

  test('便签并入唯一（notesState.push 只出现在 take_note 拦截处 = 1 次）→ 无跨作用域上并', () => {
    const pushes = REACT_LOOP.match(/notesState\.push\(/g) || [];
    expect(pushes.length).toBe(1);
  });

  test('checkpoint 落盘字段含 notesState，与 taskState 并列', () => {
    expect(REACT_LOOP).toMatch(/taskState,\s*notesState,/);
  });

  test('恢复入口 resumeState 白名单含 notesState', () => {
    // 字段集收在 checkpoint-state.js（读写两侧共用），react-loop 只负责转交 checkpoint
    expect(REACT_LOOP).toMatch(/buildResumeState\(checkpoint\)/);
    expect(CHECKPOINT_STATE_SRC).toMatch(/notesState: Array\.isArray\(c\.notesState\)/);
  });

  test('锚点注入在裁剪块之后且不受 !isSubtask 门控（每作用域回注自己那份）', () => {
    // 笔记注入块：if (notesState.length > 0) { ... buildNotesAnchorMessage() ... }
    const notesInject = REACT_LOOP.match(/if \(notesState\.length > 0\) \{[\s\S]{0,220}?\n {6}\}/);
    expect(notesInject, '应存在 notesState 锚点注入块').toBeTruthy();
    expect(notesInject[0]).toContain('buildNotesAnchorMessage()');
    expect(notesInject[0], '笔记锚点不得被 !isSubtask 门控').not.toMatch(/!isSubtask/);
    // 对照：计划锚点仍被 !isSubtask 门控（证明"不加门控"是刻意的差异而非疏漏）
    expect(REACT_LOOP).toMatch(/if \(taskState && !isSubtask\) \{[\s\S]{0,120}?buildPlanAnchorMessage\(\)/);
  });
});

describe('子任务语义：只读继承父笔记，隔离不上并', () => {
  test('executeSubtasks 调用向 parentBudget 携带 notes: notesState', () => {
    expect(REACT_LOOP).toMatch(/getRemainingTimeMs: \(\) => getRemainingTime\(\), historySummary:[\s\S]{0,60}notes: notesState \}/);
  });

  test('inheritedParts 拼接"Parent working notes"只读段', () => {
    expect(REACT_LOOP).toMatch(/Array\.isArray\(parentBudget\?\.notes\)[\s\S]{0,120}?parentBudget\.notes\.slice\(-NOTES_INHERIT_MAX\)/);
    expect(REACT_LOOP).toContain('### Parent working notes (read-only context)');
  });
});
