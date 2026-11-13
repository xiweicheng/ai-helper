// @vitest-environment jsdom
// default-prompt.unit.test.js - 空正文 + 上下文时的默认提示词
//
// 锁死两件事：
//   1. 按挂载类型选中正确的默认提示词（图片 / 文件 / 知识库 / 网页 / 引用 / 技能）
//   2. 完全没有上下文时返回空串（发送路径据此仍然拦下真正的空消息）
import { describe, test, expect } from 'vitest';
import { registerTranslations } from '../../src/shared/i18n.js';
import { resolveDefaultPrompt } from '../../src/side_panel/queue-runner.js';

// 中英文都注册同一组标记值：本文件不依赖当前语言即可断言
const MARKS = {
  defaultPromptImage: '__image__',
  defaultPromptFile: '__file__',
  defaultPromptAttachments: '__attachments__',
  defaultPromptKnowledge: '__knowledge__',
  defaultPromptPage: '__page__',
  defaultPromptSelection: '__selection__',
  defaultPromptContext: '__context__',
};
registerTranslations('zh', { sidePanel: MARKS });
registerTranslations('en', { sidePanel: MARKS });

describe('resolveDefaultPrompt：按上下文类型补默认提示词', () => {
  test('图片 / 文件 / 两者同时挂载', () => {
    expect(resolveDefaultPrompt({ attachedImages: [{}] })).toBe(MARKS.defaultPromptImage);
    expect(resolveDefaultPrompt({ attachedFiles: [{ status: 'done' }] })).toBe(MARKS.defaultPromptFile);
    expect(resolveDefaultPrompt({ attachedImages: [{}], attachedFiles: [{ status: 'done' }] }))
      .toBe(MARKS.defaultPromptAttachments);
  });

  test('知识库 / 网页', () => {
    expect(resolveDefaultPrompt({ knowledgeRefs: [{ id: 'kb1' }] })).toBe(MARKS.defaultPromptKnowledge);
    expect(resolveDefaultPrompt({ selectedPage: { id: 1, title: 't', url: 'u' } })).toBe(MARKS.defaultPromptPage);
  });

  test('引用 / 划词选中', () => {
    expect(resolveDefaultPrompt({ quotedContextText: '一段引用' })).toBe(MARKS.defaultPromptSelection);
    expect(resolveDefaultPrompt({ selectedContextText: '一段划词' })).toBe(MARKS.defaultPromptSelection);
  });

  test('只有技能/MCP：不冒充具体内容类型', () => {
    expect(resolveDefaultPrompt({ selectedSkills: [{ name: 'skill' }] })).toBe(MARKS.defaultPromptContext);
    expect(resolveDefaultPrompt({ selectedMcpServices: [{ serverId: 's1' }] })).toBe(MARKS.defaultPromptContext);
  });

  test('优先级：图片/文件高于知识库等间接上下文', () => {
    expect(resolveDefaultPrompt({ attachedImages: [{}], knowledgeRefs: [{ id: 'kb1' }] }))
      .toBe(MARKS.defaultPromptImage);
    expect(resolveDefaultPrompt({ attachedFiles: [{ status: 'done' }], knowledgeRefs: [{ id: 'kb1' }] }))
      .toBe(MARKS.defaultPromptFile);
  });

  test('没有任何上下文时返回空串，空消息仍会被拦下', () => {
    expect(resolveDefaultPrompt({})).toBe('');
    expect(resolveDefaultPrompt(null)).toBe('');
    expect(resolveDefaultPrompt(undefined)).toBe('');
    // 全空白的引用不算上下文
    expect(resolveDefaultPrompt({ quotedContextText: '   ', selectedContextText: '\n\t' })).toBe('');
  });
});
