// 上下文裁剪 O(n²)→O(n) 增量扣减改造的等价性守卫 + 工具定义序列化缓存接线守卫
// 对应 docs/AUDIT_STATUS.md 底账二 P2 两条：
//   1. trimMessagesByBudget：while 内每丢一条即全量重估 + 整份复制数组 → 改为
//      逐条预估算一次 + 累计值增量扣减。等价前提（已核实）：estimateMessagesTokens
//      纯按消息可加（每条 = 自身估算 + 固定 MESSAGE_OVERHEAD，无跨消息耦合项）。
//   2. react-loop.js：清理版工具 JSON 的 token 估算每轮 API 调用前重复执行 →
//      提到循环外算一次（tools 为 reactLoopImpl 形参，循环内无任何重赋值/变更）；
//      校准 getCalibratedTokens 必须保持逐轮应用（校准态随实际用量演进）。
// 行为基准：REFERENCE_TRIM 为改造前算法的原样移植，逐例断言新实现与其逐项一致。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  estimateMessagesTokens, trimMessagesByBudget,
} from '../../src/shared/token-counter.js';

const TOKEN_COUNTER_SRC = readFileSync(
  new URL('../../src/shared/token-counter.js', import.meta.url),
  'utf8'
);
const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);

// ============ 改造前算法的黄金参考实现（逐行对应旧版 trimMessagesByBudget） ============
function REFERENCE_TRIM(messages, budget, options = {}) {
  const { preserveSystem = true, generateSummary = true } = options;
  const originalLen = messages.length;

  if (estimateMessagesTokens(messages) <= budget) {
    return { messages: [...messages], trimmedCount: 0, summary: null };
  }

  const systemMsg = preserveSystem && messages[0]?.role === 'system' ? [messages[0]] : [];
  const rest = systemMsg.length ? [...messages.slice(1)] : [...messages];

  const trimmedMessages = [];

  while (rest.length > 0) {
    const currentTokens = estimateMessagesTokens([...systemMsg, ...rest]);
    if (currentTokens <= budget) break;

    const removed = rest.shift();
    trimmedMessages.push(removed);

    // 如果移除的是 assistant(tool_calls)，则后续的 tool 消息也要一并移除
    if (removed?.role === 'assistant' && removed.tool_calls) {
      while (rest.length > 0 && rest[0]?.role === 'tool') {
        trimmedMessages.push(rest.shift());
      }
    }
  }

  const result = [...systemMsg, ...rest];
  return {
    messages: result,
    trimmedCount: originalLen - result.length,
    summary: generateSummary ? expect.any(String) : null,
  };
}

const msg = (role, content, extra = {}) => ({ role, content, ...extra });
const totalOf = (list) => estimateMessagesTokens(list);

// 构造含 system / 多模态 / tool_calls 配对 / reasoning 的对抗性消息组
function buildFixture() {
  const sys = msg('system', '你是助手，负责调用工具完成任务。'.repeat(5));
  const m1 = msg('user', '帮我查一下今天的天气情况');
  const m2 = msg('assistant', '', {
    tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'fetch_url', arguments: '{"url":"https://example.com"}' } }],
  });
  const m3 = msg('tool', '天气数据：晴，26 度。'.repeat(20), { tool_call_id: 'call_1' });
  const m4 = msg('assistant', '', {
    tool_calls: [
      { id: 'call_2', type: 'function', function: { name: 'search', arguments: '{"q":"空气"}' } },
      { id: 'call_3', type: 'function', function: { name: 'search', arguments: '{"q":"湿度"}' } },
    ],
  });
  const m5 = msg('tool', '空气质量优', { tool_call_id: 'call_2' });
  const m6 = msg('tool', '湿度 45%', { tool_call_id: 'call_3' });
  const m7 = msg('user', [{ type: 'text', text: '看这张截图' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }]);
  const m8 = msg('assistant', '根据截图内容，我认为……'.repeat(10), { reasoning_content: '让我仔细思考一下这个问题'.repeat(8) });
  const m9 = msg('user', '最后一个问题');
  const m10 = msg('assistant', '这是最终回答。'.repeat(15));
  return { sys, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10 };
}

describe('trimMessagesByBudget - 与改造前算法逐项等价（黄金基准）', () => {
  test('未超预算：不裁剪，返回新数组且元素引用一致，summary 为 null', () => {
    const f = buildFixture();
    const messages = [f.sys, f.m1, f.m2, f.m3];
    const budget = totalOf(messages); // 恰好等于预算（<= 判定）
    const ref = REFERENCE_TRIM(messages, budget);
    const out = trimMessagesByBudget(messages, budget);
    expect(out.messages).not.toBe(messages);
    expect(out.messages.map((m, i) => m === ref.messages[i])).toEqual(ref.messages.map(() => true));
    expect(out.trimmedCount).toBe(ref.trimmedCount);
    expect(out.summary).toBe(ref.summary);
  });

  test('裁剪后消息数组与参考实现逐元素引用一致（保留的是尾部）', () => {
    const f = buildFixture();
    const all = [f.sys, f.m1, f.m2, f.m3, f.m4, f.m5, f.m6, f.m7, f.m8, f.m9, f.m10];
    const budget = Math.floor(totalOf(all) * 0.5);
    const ref = REFERENCE_TRIM(all, budget);
    const out = trimMessagesByBudget(all, budget);
    expect(out.messages).toHaveLength(ref.messages.length);
    out.messages.forEach((m, i) => expect(m).toBe(ref.messages[i]));
    expect(out.trimmedCount).toBe(ref.trimmedCount);
  });

  test('assistant(tool_calls) 后的 tool 组无条件连丢：跨过预算线也不中途停', () => {
    const f = buildFixture();
    const all = [f.sys, f.m1, f.m2, f.m3, f.m4, f.m5, f.m6, f.m7];
    const ref = REFERENCE_TRIM(all, 10);
    const out = trimMessagesByBudget(all, 10);
    // m2 被丢时其 tool_calls 后继 m3 连坐；m4 的 m5/m6 同理
    expect(out.messages.map((m) => m.role)).toEqual(ref.messages.map((m) => m.role));
    out.messages.forEach((m, i) => expect(m).toBe(ref.messages[i]));
    expect(out.messages).not.toContain(f.m3);
    expect(out.messages).not.toContain(f.m5);
    expect(out.messages).not.toContain(f.m6);
  });

  test('极低预算：裁到只剩 system（rest 耗尽即停，不死循环）', () => {
    const f = buildFixture();
    const all = [f.sys, f.m1, f.m2, f.m3];
    const ref = REFERENCE_TRIM(all, 1);
    const out = trimMessagesByBudget(all, 1);
    expect(out.messages).toHaveLength(ref.messages.length);
    out.messages.forEach((m, i) => expect(m).toBe(ref.messages[i]));
    expect(out.trimmedCount).toBe(ref.trimmedCount);
  });

  test('preserveSystem=false：system 也可被从头部丢弃，与参考一致', () => {
    const f = buildFixture();
    const all = [f.sys, f.m1, f.m7, f.m8, f.m10];
    const budget = Math.floor(totalOf(all) * 0.6);
    const opts = { preserveSystem: false };
    const ref = REFERENCE_TRIM(all, budget, opts);
    const out = trimMessagesByBudget(all, budget, opts);
    expect(out.messages.map((m) => m.role)).toEqual(ref.messages.map((m) => m.role));
    expect(out.trimmedCount).toBe(ref.trimmedCount);
  });

  test('无 system 前导（首条非 system）：从头部正常裁剪', () => {
    const f = buildFixture();
    const all = [f.m1, f.m2, f.m3, f.m9, f.m10];
    const budget = Math.floor(totalOf(all) * 0.4);
    const ref = REFERENCE_TRIM(all, budget);
    const out = trimMessagesByBudget(all, budget);
    expect(out.messages).toHaveLength(ref.messages.length);
    out.messages.forEach((m, i) => expect(m).toBe(ref.messages[i]));
  });

  test('generateSummary=false 时 summary 恒为 null；true 时为字符串', () => {
    const f = buildFixture();
    const all = [f.sys, f.m1, f.m7, f.m8, f.m9, f.m10];
    const budget = 10;
    expect(trimMessagesByBudget(all, budget, { generateSummary: false }).summary).toBeNull();
    expect(typeof trimMessagesByBudget(all, budget, { generateSummary: true }).summary).toBe('string');
  });

  test('输入数组与消息对象均不被变更（原实现只动副本）', () => {
    const f = buildFixture();
    const all = [f.sys, f.m1, f.m2, f.m3, f.m4, f.m5];
    const snapshot = [...all];
    trimMessagesByBudget(all, 5);
    expect(all).toHaveLength(snapshot.length);
    all.forEach((m, i) => expect(m).toBe(snapshot[i]));
  });

  test('空数组与单条边界输入不抛、行为与参考一致', () => {
    expect(trimMessagesByBudget([], 100)).toEqual(REFERENCE_TRIM([], 100));
    const one = [msg('user', '你好')];
    const out = trimMessagesByBudget(one, 0);
    const ref = REFERENCE_TRIM(one, 0);
    expect(out.trimmedCount).toBe(ref.trimmedCount);
    expect(out.messages).toHaveLength(ref.messages.length);
  });

  test('全量扫描一致性：对 60 条混合消息在 12 档预算下逐项对齐参考实现', () => {
    const roles = ['user', 'assistant', 'tool'];
    const list = [msg('system', '系统提示词内容'.repeat(6))];
    for (let i = 0; i < 59; i++) {
      const role = roles[i % 3];
      if (role === 'assistant' && i % 6 === 1) {
        list.push(msg('assistant', '', { tool_calls: [{ id: `c${i}`, function: { name: 'x', arguments: '{}' } }] }));
      } else if (role === 'tool') {
        list.push(msg('tool', `工具输出内容第 ${i} 段`.repeat(3), { tool_call_id: `c${i - 1}` }));
      } else {
        list.push(msg(role, `普通消息第 ${i} 段内容`.repeat(2)));
      }
    }
    const full = totalOf(list);
    for (const ratio of [0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.8, 0.9, 0.95, 1.0]) {
      const budget = Math.floor(full * ratio);
      const ref = REFERENCE_TRIM(list, budget);
      const out = trimMessagesByBudget(list, budget);
      expect(out.messages.map((m) => m.role)).toEqual(ref.messages.map((m) => m.role));
      expect(out.trimmedCount).toBe(ref.trimmedCount);
    }
  });
});

describe('接线守卫：裁剪不再全量重估（O(n²) 不得复现）', () => {
  const fnSrc = TOKEN_COUNTER_SRC.slice(
    TOKEN_COUNTER_SRC.indexOf('export function trimMessagesByBudget'),
    TOKEN_COUNTER_SRC.indexOf('/**', TOKEN_COUNTER_SRC.indexOf('export function trimMessagesByBudget'))
  );

  test('trim 函数体内不得再出现循环内全量估算调用（尾部结果构造的合法拼接除外）', () => {
    expect(fnSrc).not.toMatch(/estimateMessagesTokens\(\s*\[\.\.\.systemMsg/);
    expect(fnSrc).not.toMatch(/estimateMessagesTokens\(\s*messages\s*\)/);
    expect(fnSrc).not.toMatch(/while[\s\S]*?estimateMessagesTokens\(\[/);
  });

  test('trim 函数体必须采用逐条预估 + 增量扣减结构', () => {
    expect(fnSrc).toMatch(/estimateMessagesTokens\(\[m\]\)|perMessage|contribution/i);
    expect(fnSrc).toMatch(/-=|subtract|running/i);
  });
});

describe('接线守卫：工具定义序列化只在循环外算一次', () => {
  // 主循环锚点：预算软着陆后循环条件收敛为 while (true)，终止由轮首 evaluateBudgetStep 收口
  const loopIdx = REACT_LOOP_SRC.indexOf('while (true) {');
  if (loopIdx === -1) throw new Error('main loop anchor not found: while (true) {');

  test('rawToolTokens 全文件仅定义一次，且位置在 ReAct 主循环之前', () => {
    const hits = [...REACT_LOOP_SRC.matchAll(/const rawToolTokens = estimateTokens\(/g)];
    expect(hits).toHaveLength(1);
    expect(hits[0].index).toBeLessThan(loopIdx);
  });

  test('循环内使用缓存值做逐轮校准，不得残留每轮 stringify(apiTools)', () => {
    const loopBody = REACT_LOOP_SRC.slice(loopIdx);
    expect(loopBody).toMatch(/getCalibratedTokens\(rawToolTokens\)/);
    expect(loopBody).not.toMatch(/estimateTokens\(\s*JSON\.stringify\(apiTools/);
  });

  test('请求体工具清单剥离 id 的行为保持不变', () => {
    expect(REACT_LOOP_SRC).toMatch(/tools:\s*apiTools\.map\(t => \{/);
    expect(REACT_LOOP_SRC).toMatch(/const \{ id, \.\.\.clean \} = t;\s*return clean;/);
  });
});
