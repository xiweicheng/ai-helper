// AI 创建助手：协议解析与配置白名单校验
import { describe, test, expect } from 'vitest';
import {
  buildBuilderSystemPrompt,
  parseBuilderReply,
  normalizeAgentDraft,
} from '../../src/side_panel/agent-builder-core.js';

const TOOLS = [
  { id: 'page_content', name: 'page_content', description: '读取当前页面正文', category: 'content_extraction' },
  { id: 'extract_data', name: 'extract_data', description: '提取表格数据', category: 'content_extraction' },
];

const SKILLS = [
  { name: 'weekly-report', description: '整理周报' },
];

describe('parseBuilderReply', () => {
  test('解析被 markdown 围栏包裹的提问', () => {
    const reply = parseBuilderReply('```json\n{"action":"ask","message":"先确认一下","question":{"text":"主要做什么？","options":["汇总","评审"],"recommended":1,"allowCustom":false}}\n```');
    expect(reply.action).toBe('ask');
    expect(reply.message).toBe('先确认一下');
    expect(reply.question.text).toBe('主要做什么？');
    expect(reply.question.options).toEqual(['汇总', '评审']);
    expect(reply.question.recommended).toBe(1);
    expect(reply.question.allowCustom).toBe(false);
  });

  test('recommended 越界时收敛到合法下标', () => {
    const reply = parseBuilderReply('{"action":"ask","message":"","question":{"text":"q","options":["a","b"],"recommended":9}}');
    expect(reply.question.recommended).toBe(1);
    expect(reply.question.allowCustom).toBe(true);
  });

  test('解析完成动作', () => {
    const reply = parseBuilderReply(JSON.stringify({
      action: 'done',
      message: '已生成',
      agent: { name: '周报助手', systemPrompt: '你是周报助手' },
    }));
    expect(reply.action).toBe('done');
    expect(reply.agent.name).toBe('周报助手');
  });

  test('非 JSON / 非法 action 抛错', () => {
    expect(() => parseBuilderReply('我明白了，请继续')).toThrow('no_json_object');
    expect(() => parseBuilderReply('{"action":"other"}')).toThrow('invalid_action');
    expect(() => parseBuilderReply('{"action":"done"}')).toThrow('invalid_agent');
    expect(() => parseBuilderReply('')).toThrow('empty_reply');
  });

  test('容忍字符串内的裸换行（多行 systemPrompt）', () => {
    const raw = '{"action":"done","message":"已生成","agent":{"name":"周报助手","systemPrompt":"你是周报助手。\n职责：\n1. 汇总本周事项\n边界：不编造数据"}}';
    const reply = parseBuilderReply(raw);
    expect(reply.action).toBe('done');
    expect(reply.agent.systemPrompt).toContain('职责');
    expect(reply.agent.systemPrompt).toContain('\n1. 汇总本周事项');
  });

  test('容忍尾随逗号与注释', () => {
    const raw = '{"action":"ask",/* 说明 */"message":"先确认","question":{"text":"做什么？","options":["汇总","评审",],},}';
    const reply = parseBuilderReply(raw);
    expect(reply.action).toBe('ask');
    expect(reply.question.options).toEqual(['汇总', '评审']);
  });

  test('容忍 JSON 前后的说明文字', () => {
    const raw = '好的，我理解你的需求。\n{"action":"ask","message":"确认一下","question":{"text":"主要场景？","options":["汇总","评审"]}}\n请选择。';
    const reply = parseBuilderReply(raw);
    expect(reply.action).toBe('ask');
    expect(reply.question.text).toBe('主要场景？');
  });

  test('容忍 JSON 被二次编码为字符串', () => {
    const raw = JSON.stringify(JSON.stringify({
      action: 'ask',
      message: '确认',
      question: { text: 'q', options: ['a', 'b'] },
    }));
    const reply = parseBuilderReply(raw);
    expect(reply.action).toBe('ask');
    expect(reply.question.options).toEqual(['a', 'b']);
  });
});

describe('normalizeAgentDraft', () => {
  test('过滤目录外的工具与技能，并保留有效项', () => {
    const { draft, warnings } = normalizeAgentDraft({
      name: '网页取数助手',
      icon: '📊',
      description: '帮我把网页表格整理成 CSV',
      systemPrompt: '你是网页取数助手，负责读取页面表格并整理为 CSV。先确认目标页面，再提取字段，最后输出。边界：不编造数据，缺失时追问。',
      toolIds: ['page_content', 'not_exist_tool', 'extract_data'],
      skillIds: ['weekly-report', 'ghost-skill'],
      allowSubDispatch: true,
      model: 'should-be-ignored',
    }, { tools: TOOLS, skills: SKILLS, language: 'zh' });

    expect(draft.toolIds).toEqual(['page_content', 'extract_data']);
    expect(draft.skillIds).toEqual(['weekly-report']);
    expect(draft.allowSubDispatch).toBe(true);
    expect(draft.model).toBeNull();
    expect(warnings.map(w => w.code)).toEqual(['toolsDropped', 'skillsDropped']);
  });

  test('全部无效时回落为 null（继承全局）', () => {
    const { draft, warnings } = normalizeAgentDraft({
      toolIds: ['ghost'],
      skillIds: ['ghost'],
    }, { tools: TOOLS, skills: SKILLS, language: 'zh' });

    expect(draft.toolIds).toBeNull();
    expect(draft.skillIds).toBeNull();
    expect(draft.name).toBe('未命名助手');
    expect(draft.icon).toBe('🤖');
    expect(warnings.some(w => w.code === 'promptShort')).toBe(true);
    expect(warnings.some(w => w.code === 'toolsAllDropped')).toBe(true);
    expect(warnings.some(w => w.code === 'skillsAllDropped')).toBe(true);
  });

  test('null / 空数组表示继承，不产生丢弃告警', () => {
    const { draft, warnings } = normalizeAgentDraft({ toolIds: null, skillIds: [] }, { tools: TOOLS, skills: SKILLS });
    expect(draft.toolIds).toBeNull();
    expect(draft.skillIds).toBeNull();
    expect(warnings.some(w => w.code === 'toolsDropped' || w.code === 'skillsDropped')).toBe(false);
  });

  test('英文环境使用英文默认名', () => {
    const { draft } = normalizeAgentDraft({}, { language: 'en' });
    expect(draft.name).toBe('New Assistant');
  });
});

describe('buildBuilderSystemPrompt', () => {
  test('注入工具与技能目录，并包含输出协议', () => {
    const prompt = buildBuilderSystemPrompt({ language: 'zh', tools: TOOLS, skills: SKILLS });
    expect(prompt).toContain('page_content');
    expect(prompt).toContain('extract_data');
    expect(prompt).toContain('weekly-report');
    expect(prompt).toContain('"action":"ask"');
    expect(prompt).toContain('"action":"done"');
  });

  test('空目录给出明确提示而不是空白', () => {
    const zh = buildBuilderSystemPrompt({ language: 'zh', tools: [], skills: [] });
    expect(zh).toContain('当前没有可用工具');
    const en = buildBuilderSystemPrompt({ language: 'en', tools: [], skills: [] });
    expect(en).toContain('no tools available');
  });
});
