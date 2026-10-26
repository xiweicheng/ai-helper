// send-pipeline-context-invariants.unit.test.js - 发送链路"批次"语义的源码守卫
//
// 上下文清理的语义只有一条：只清"本条消息发送那一刻快照里的那批"。
// 这条语义靠三处结构性约束保证，单测很难覆盖，沿用仓库既有的源码守卫写法：
//   · M2 提示词直发：快照必须在函数入口取，不能跨 await 再读 state
//     （压缩/知识库检索都要等，等完再读就把用户这段时间新挂的上下文当成"本条的"吃掉了）
//   · M1 引用/选中同时挂载：剩下一份就必须按 state 重绘指示器，不能整块跳过
//   · x1 跨会话派发：CALL_API 必须用解析后的会话身份，不能用面板当前会话
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

const promptByCodeBody = () => {
  const src = read('src/side_panel/prompt-manager.js');
  const start = src.indexOf('export async function sendPromptByCode');
  expect(start, '找不到 sendPromptByCode').toBeGreaterThan(-1);
  const end = src.indexOf('} finally {', start);
  expect(end, '找不到 sendPromptByCode 的 finally').toBeGreaterThan(start);
  return src.slice(start, end);
};

describe('M2 · 提示词直发：上下文快照在入口取，全链路读快照', () => {
  test('8 类快照的捕获早于压缩/检索等 await', () => {
    const src = read('src/side_panel/prompt-manager.js');
    const start = src.indexOf('export async function sendPromptByCode');
    const body = src.slice(start);

    const snapIdx = body.indexOf('const ctxSnapshot = {');
    const compactionIdx = body.indexOf('await runAutoCompactionBeforeSend(');
    expect(snapIdx, '缺少入口快照 const ctxSnapshot').toBeGreaterThan(-1);
    expect(compactionIdx, '压缩调用不见了？').toBeGreaterThan(-1);
    // 快照必须先于第一个 await：否则压缩期间用户新挂的图会被当成本条消息的一部分
    expect(snapIdx, '快照晚于压缩 await，用户新挂的上下文会被吃掉').toBeLessThan(compactionIdx);
  });

  test('全链路读快照，不再跨 await 直接读 state 列表', () => {
    const body = promptByCodeBody();
    // 入口快照自身允许读一次 state；进入 await 之后的装配必须全部读快照
    expect(body.split('state.attachedImages.slice()').length - 1).toBe(1);
    expect(body.split('state.selectedSkills.slice()').length - 1).toBe(1);
    expect(body.split('state.selectedMcpServices.slice()').length - 1).toBe(1);
    expect(body.split('state.knowledgeRefs.slice()').length - 1).toBe(1);
    expect(body.split('state.attachedFiles.slice()').length - 1).toBe(1);
    // 这两处不可能出现在入口快照里：出现就是跨 await 读了现场
    expect(body).not.toContain('state.knowledgeRefs.length > 0');
    expect(body).not.toContain('if (state.selectedPage)');
    // 文件正文也必须按快照拼：state 里可能有发送期间新加的文件
    expect(body).toContain('buildFileContentText(attachedFilesSnapshot)');
  });
});

describe('M1 · 引用/选中同时挂载：消费与指示器保持一致', () => {
  test('收尾必须按"还剩什么"重绘指示器，而不是整块跳过', () => {
    const src = read('src/side_panel/chat-manager.js');
    // 断言导出的是函数本身（文件名里本来就有这个名字，只 toContain 会恒真）
    expect(src).toContain('export function refreshSelectionIndicatorFromState()');
    // prompt-manager 自己那段收尾也要用它重绘（import 时不带括号，带括号的只有调用）
    expect(read('src/side_panel/prompt-manager.js')).toContain('refreshSelectionIndicatorFromState()');
    // 剩下的那份属于下一条消息：既不丢 state，也不能让指示器停在本条已消费的那份上
    const start = src.indexOf('// 指示器/输入框前缀收尾');
    const end = src.indexOf('// 标记该会话正在生成', start);
    expect(start).toBeGreaterThan(-1);
    expect(end, '找不到发接收尾的边界').toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toContain('if (!state.quotedContextText && !state.selectedContextText) {');
    expect(block).toContain('refreshSelectionIndicatorFromState();');
    expect(block).toContain('clearSelectedContext();');
  });
});

describe('x1 · 跨会话派发：CALL_API 用解析后的会话身份', () => {
  test('callApi 内部不再把面板当前会话当作请求会话', () => {
    const src = read('src/side_panel/chat-manager.js');
    const start = src.indexOf('export async function callApi');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start);
    expect(body).not.toContain('sessionId: state.activeSessionId');
    expect(body).toContain('sessionId: mySessionId');
  });
});

describe('W1 · 队列载荷不得反写面板 state', () => {
  test('引用/选中只在快照取自输入区时才允许消费 state', () => {
    // 队列派发现在无条件携带 context，包括派发到激活会话：
    // 载荷里的引用/选从来不属于输入区，值相等也不能当成本条消费了 state 里那份
    const src = read('src/side_panel/chat-manager.js');
    const start = src.indexOf('export async function sendMessage');
    const end = src.indexOf('export async function callApi', start);
    expect(start).toBeGreaterThan(-1);
    expect(end, '找不到 sendMessage 的结尾').toBeGreaterThan(start);
    const body = src.slice(start, end);
    expect(body).toContain('const ctxFromInput = !opts.context;');
    expect(body).toContain('if (isActive && ctxFromInput && state.quotedContextText === inputCtx.quotedContextText)');
    expect(body).toContain('if (isActive && ctxFromInput && state.selectedContextText === inputCtx.selectedContextText)');
  });
});

describe('W2 · 回填/回滚后提示条按 state 重绘', () => {
  test('只挂了划词选中（没有引用）时提示条也要回来', () => {
    const src = read('src/side_panel/index.js');
    const start = src.indexOf('function restoreInputContextIndicators');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf('document.addEventListener(', start);
    const body = src.slice(start, end);
    // 读的是“已还原的 state”（snapshot 可能没带 selectedContextText，但 state 有），据此重绘提示条
    expect(body).toContain("if (!snap.quotedContextText && state.selectedContextText) refreshSelectionIndicatorFromState();");
    // 该函数由 chat-manager 导出，index.js 必须真的导入它
    expect(src).toContain('refreshSelectionIndicatorFromState');
  });
});

describe('S5 · 提示词直发不抹掉等待期间的新草稿', () => {
  test('入口记草稿快照，收尾只清"发送前就存在的那份"', () => {
    const body = promptByCodeBody();
    const draftIdx = body.indexOf('const draftAtEntry');
    const compactionIdx = body.indexOf('await runAutoCompactionBeforeSend(');
    expect(draftIdx, '缺少入口草稿快照 const draftAtEntry').toBeGreaterThan(-1);
    expect(draftIdx, '草稿快照必须早于压缩 await').toBeLessThan(compactionIdx);
    expect(body).toContain('if (userInput.value === draftAtEntry)');
  });
});
