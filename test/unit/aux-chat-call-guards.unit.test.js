// aux-chat-call-guards.unit.test.js - 辅助调用收口与编辑器/drop 修复的守卫回归
//
// 1) 辅助 LLM 调用必须经 chat-client 收口（防止后续新增调用重新硬编码非流式 fetch）；
// 2) 助手编辑器技能继承态判定：历史助手 skillIds 为 undefined 时仍属「继承全部」，
//    不得用 === null  strict 判定导致显示「已选 0/N」误导重勾；
//    MCP 分类切换与其他勾选路径口径一致，必须退出 inheritMode；
// 3) 侧边栏 drop 处理器：未识别拖拽形态必须兜底 preventDefault，
//    否则浏览器默认投放可能把侧栏页面导航/替换。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('辅助 LLM 调用一律经 callChatCompletion 收口', () => {
  const AUX_MODULES = [
    '../../src/background/context-compactor.js',
    '../../src/background/context-summarizer.js',
    '../../src/background/react-reflection.js',
    '../../src/background/tool-preselector.js',
  ];
  test.each(AUX_MODULES)('%s 引入 chat-client 且不直接 fetch chat/completions', (mod) => {
    const src = read(mod);
    expect(src).toMatch(/from '[^']*shared\/chat-client\.js'/);
    expect(src).toContain('callChatCompletion(');
    // 不得残留对 chat/completions 的裸 fetch（主循环 react-loop 不在本守卫范围）
    expect(src).not.toMatch(/fetch\s*\(\s*[`'"][^`']*chat\/completions/);
  });
});

describe('助手编辑器继承态与 MCP 分类口径', () => {
  const src = read('../../src/side_panel/agent-manager.js');

  test('技能 inheritMode 用宽松判等（undefined 也属继承全部）', () => {
    expect(src).toMatch(/cache\.inheritMode = selectedSkillNames == null;/);
    expect(src, '不得退回 strict 判等（历史助手 skillIds 为 undefined 会被误判已选 0）').not.toMatch(
      /cache\.inheritMode = selectedSkillNames === null;/
    );
  });

  test('MCP 分类切换分支置 inheritMode=false（与其余勾选路径一致）', () => {
    const mcpBranch = src.match(/if \(category === 'mcp'\) \{[\s\S]*?\}\s*else \{/);
    expect(mcpBranch, '未找到 mcp 分类切换分支').toBeTruthy();
    expect(mcpBranch[0]).toMatch(/cache\.inheritMode = false;/);
  });
});

describe('侧边栏 drop 兜底 preventDefault', () => {
  test('drop 处理器入口无条件 preventDefault，未识别形态不放行默认投放', () => {
    const src = read('../../src/side_panel/index.js');
    const drop = src.match(/inputWrapper\.addEventListener\('drop', async \(e\) => \{[\s\S]{0,200}/);
    expect(drop, '未找到 drop 处理器').toBeTruthy();
    expect(drop[0], '入口必须先 preventDefault（允许中间有注释，不允许有 await/分支逻辑）').toMatch(
      /async \(e\) => \{[\s\S]*?e\.preventDefault\(\);/
    );
    expect(drop[0], 'preventDefault 前不得有异步/分支逻辑先行执行').not.toMatch(
      /async \(e\) => \{(?![\s\S]{0,240}?e\.preventDefault\(\))[^}]*\bawait\b/
    );
  });
});

describe('侧边栏压缩失败原因解析', () => {
  test('compactErrorDetail 必须从 http_x 后缀中提取后端正文，并识别空闲超时错误码', () => {
    const src = read('../../src/side_panel/context-indicator.js');
    const fn = src.match(/function compactErrorDetail\([\s\S]*?\n\}/);
    expect(fn, '未找到 compactErrorDetail').toBeTruthy();
    // 旧实现把 http_400 后的正文丢掉，只渲染裸状态码
    expect(fn[0]).toMatch(/body/i);
    expect(fn[0], '空闲超时错误码必须映射到超时文案').toMatch(/CHAT_STREAM_IDLE_TIMEOUT/);
  });
});

describe('视觉调用定时器清理进 finally', () => {
  test('analyzeImageWithVision 的 60s AbortController 超时在异常路径也清理', () => {
    const src = read('../../src/background/tool-executor.js');
    const fn = src.match(/async function analyzeImageWithVision[\s\S]*?\n\}\n/);
    expect(fn, '未找到 analyzeImageWithVision').toBeTruthy();
    expect(fn[0], 'callChatCompletion 抛错时 clearTimeout 被跳过，定时器残留').toMatch(
      /finally \{[^}]*clearTimeout\(timer\)/
    );
  });
});
