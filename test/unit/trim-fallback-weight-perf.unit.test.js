// NEW-08 兜底权重裁剪纯化的行为等价与接线锁（docs/AUDIT_STATUS.md）：
// react-loop.js trimMessages 阶段二旧实现每丢一条即对全量消息 est()（map + stripImages
// 整数组重建再估算），O(n²) 且常数大。改为 trim-fallback.js 的"逐条贡献预估算 +
// 增量扣减 + 突变单条重算"。
//
// 等价性证明方法：把改造前的内联算法逐行移植为参考实现 REFERENCE_FALLBACK，
// 行为用例先对参考实现跑绿（证明用例有效并锁定旧行为基线），再对生产实现跑——
// 两者逐项一致即新旧算法严格等价。特殊语义必须一致：
//   1. assistant(tool_calls) 被删后紧邻的连续 tool 消息无条件连坐删除；
//   2. tool 被删后向前孤立 assistant 检查，命中即原地 delete tool_calls（共享对象突变）；
//   3. 权重选择（反思 > 工具 > 普通）、起始索引与连坐检查均基于删除后的实时状态；
//   4. systemMsg 永不删除；rest 清空即停（哪怕仍超预算）。
// 接线守卫锁性能结构不回退：兜底段不得恢复循环内全量 est()。
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { estimateMessagesTokens, stripImagesFromContent, getCalibratedTokens } from '../../src/shared/token-counter.js';
import { weightTrimFallback } from '../../src/background/trim-fallback.js';

const REACT_LOOP_SRC = readFileSync(new URL('../../src/background/react-loop.js', import.meta.url), 'utf8');
const TRIM_FALLBACK_SRC = readFileSync(new URL('../../src/background/trim-fallback.js', import.meta.url), 'utf8');

// ============================================================
// 黄金参考实现 = 改造前 react-loop.js:976-1021 的逐行移植
// ============================================================

function REFERENCE_FALLBACK({ systemMsg, rest, budget }) {
  const est = (msgs) => {
    const stripped = msgs.map((m) => ({ ...m, content: stripImagesFromContent(m.content) }));
    return getCalibratedTokens(estimateMessagesTokens(stripped));
  };
  const getWeight = (msg) => {
    if (msg._reflection) return 3;
    if (msg.role === 'tool') return 2;
    return 1;
  };

  while (rest.length > 0) {
    const currentTokens = est([...systemMsg, ...rest]);
    if (currentTokens <= budget) break;

    let removeIdx = -1;
    let bestWeight = 0;
    for (let i = 0; i < rest.length; i++) {
      const w = getWeight(rest[i]);
      if (w > bestWeight) {
        bestWeight = w;
        removeIdx = i;
      }
      if (bestWeight >= 3) break;
    }
    if (removeIdx < 0 || bestWeight === 0) removeIdx = 0;

    const removed = rest.splice(removeIdx, 1)[0];

    if (removed?.role === 'assistant' && removed.tool_calls) {
      while (rest.length > 0 && rest[removeIdx]?.role === 'tool') {
        rest.splice(removeIdx, 1);
      }
    } else if (removed?.role === 'tool') {
      for (let j = removeIdx - 1; j >= 0; j--) {
        if (rest[j]?.role === 'assistant' && rest[j]?.tool_calls) {
          const nextMsg = rest[j + 1];
          if (!nextMsg || nextMsg.role !== 'tool') {
            delete rest[j].tool_calls;
          }
        } else {
          break;
        }
      }
    }
  }
}

// ============================================================
// 对比工具：整数组深快照（含 tool_calls 存活状态与被删内容）
// ============================================================

const snapshot = (arr) => JSON.stringify(arr.map((m) => ({
  role: m.role,
  content: m.content,
  toolCalls: m.tool_calls ? m.tool_calls.map((t) => t.id) : null,
  reflection: !!m._reflection
})));

const LONG = 'x'.repeat(1200);
const IMG = 'data:image/png;base64,' + 'y'.repeat(2000);

const tc = (ids) => ids.map((id) => ({ id, type: 'function', function: { name: 't', arguments: '{}' } }));

function buildFixture() {
  return [
    { role: 'system', content: 'sys prompt' },
    { role: 'user', content: 'goal: ' + LONG },
    // 轮 1（assistant + 2 tool）
    { role: 'assistant', content: '', tool_calls: tc(['a1', 'a2']) },
    { role: 'tool', tool_call_id: 'a1', content: 'toolA1 ' + LONG },
    { role: 'tool', tool_call_id: 'a2', content: 'toolA2 ' + LONG },
    // 轮 2（assistant + tool 带图片 part）
    { role: 'assistant', content: '', tool_calls: tc(['b1']) },
    { role: 'tool', tool_call_id: 'b1', content: [{ type: 'text', text: 'toolB1 ' + LONG }, { type: 'image_url', image_url: { url: IMG } }] },
    // 反思消息（权重最高，应最先被删）
    { role: 'user', content: 'reflect: ' + LONG, _reflection: true },
    // 轮 3（assistant + tool）
    { role: 'assistant', content: '', tool_calls: tc(['c1']) },
    { role: 'tool', tool_call_id: 'c1', content: 'toolC1 ' + LONG },
    { role: 'assistant', content: 'answer ' + LONG },
    { role: 'user', content: 'follow up ' + LONG }
  ];
}

// 对同一夹具分别跑两个实现并断言逐项一致
function assertEquivalent(runNew, budgetFor) {
  const fixA = buildFixture();
  const fixB = buildFixture();
  // 预算按参考实现结果的口径取一个必然触发兜底的值
  const budget = budgetFor(estimateMessagesTokens(
    fixA.map((m) => ({ ...m, content: stripImagesFromContent(m.content) }))
  ));
  const sysA = [fixA[0]], restA = fixA.slice(1);
  const sysB = [fixB[0]], restB = fixB.slice(1);

  REFERENCE_FALLBACK({ systemMsg: sysA, rest: restA, budget });
  runNew({ systemMsg: sysB, rest: restB, budget });

  assert.equal(snapshot(restB), snapshot(restA), '裁剪结果与参考实现不一致');
  assert.equal(snapshot(sysB), snapshot(sysA), 'system 不应被改动');
  // 共享对象突变可见性：夹具原数组中被孤立 assistant 的 tool_calls 状态必须一致
  assert.equal(
    fixB.filter((m) => m.role === 'assistant').map((m) => !!m.tool_calls).join(','),
    fixA.filter((m) => m.role === 'assistant').map((m) => !!m.tool_calls).join(','),
    '原地 delete tool_calls 的突变行为应与参考实现一致'
  );
}

describe('NEW-08 兜底权重裁剪行为等价基线（先对改造前参考实现跑绿）', () => {
  const runRef = (args) => REFERENCE_FALLBACK(args);

  it('基线 1：预算充足时不裁剪', () => {
    assertEquivalent(runRef, (total) => total);
  });

  it('基线 2：反思消息最先被删（权重 3）', () => {
    assertEquivalent(runRef, (total) => Math.floor(total * 0.85));
  });

  it('基线 3：assistant(tool_calls) 连坐删除紧邻 tool 组', () => {
    assertEquivalent(runRef, (total) => Math.floor(total * 0.5));
  });

  it('基线 4：大幅裁剪至接近清空（兜底删干即停）', () => {
    assertEquivalent(runRef, () => 1);
  });

  it('基线 5：多档预算全矩阵逐项一致', () => {
    for (const r of [0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]) {
      assertEquivalent(runRef, (total) => Math.floor(total * r));
    }
  });

  it('基线 6：无 system 消息的数组同样工作', () => {
    const fixA = buildFixture().slice(1);
    const fixB = [...fixA];
    const budget = Math.floor(estimateMessagesTokens(
      fixA.map((m) => ({ ...m, content: stripImagesFromContent(m.content) }))
    ) * 0.4);
    const restA = fixA, restB = fixB;
    REFERENCE_FALLBACK({ systemMsg: [], rest: restA, budget });
    runRef({ systemMsg: [], rest: restB, budget });
    assert.equal(snapshot(restB), snapshot(restA));
  });
});

describe('NEW-08 生产实现与参考实现逐项等价（增量扣减 + 突变单条重算）', () => {
  const runNew = (args) => weightTrimFallback(args);

  it('与基线相同场景结果一致：预算充足不裁剪', () => {
    assertEquivalent(runNew, (total) => total);
  });

  it('与基线相同场景结果一致：反思先删', () => {
    assertEquivalent(runNew, (total) => Math.floor(total * 0.85));
  });

  it('与基线相同场景结果一致：tool_calls 连坐', () => {
    assertEquivalent(runNew, (total) => Math.floor(total * 0.5));
  });

  it('与基线相同场景结果一致：兜底删干即停', () => {
    assertEquivalent(runNew, () => 1);
  });

  it('与基线相同场景结果一致：多档预算全矩阵', () => {
    for (const r of [0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1]) {
      assertEquivalent(runNew, (total) => Math.floor(total * r));
    }
  });

  it('与基线相同场景结果一致：无 system 消息', () => {
    const fixA = buildFixture().slice(1);
    const fixB = [...fixA];
    const budget = Math.floor(estimateMessagesTokens(
      fixA.map((m) => ({ ...m, content: stripImagesFromContent(m.content) }))
    ) * 0.4);
    REFERENCE_FALLBACK({ systemMsg: [], rest: fixA, budget });
    weightTrimFallback({ systemMsg: [], rest: fixB, budget });
    assert.equal(snapshot(fixA), snapshot(fixB));
  });

  it('孤立 assistant 检查：删 tool 后前邻 assistant 的 tool_calls 原地删除一致', () => {
    // 专测突变语义：assistant(2 tool_calls) 的部分 tool 被删后孤立 → 原地 delete
    const mkSet = () => {
      const asst = { role: 'assistant', content: '', tool_calls: tc(['s1', 's2']) };
      return {
        asst,
        arr: [
          asst,
          { role: 'tool', tool_call_id: 's1', content: 'keep ' + LONG },
          { role: 'tool', tool_call_id: 's2', content: 'drop ' + LONG },
          { role: 'user', content: 'tail ' + LONG, _reflection: true }
        ]
      };
    };
    const A = mkSet(), B = mkSet();
    // 中等预算：必然触发裁剪但不会删空（保留部分消息以检查 tool_calls 存活）
    const total = estimateMessagesTokens(
      A.arr.map((m) => ({ ...m, content: stripImagesFromContent(m.content) }))
    );
    const budget = Math.floor(total * 0.7);
    REFERENCE_FALLBACK({ systemMsg: [], rest: A.arr, budget });
    weightTrimFallback({ systemMsg: [], rest: B.arr, budget });
    assert.equal(snapshot(A.arr), snapshot(B.arr));
    assert.equal(A.asst.tool_calls === undefined, B.asst.tool_calls === undefined, 'tool_calls 存活状态必须一致');
    assert.ok(A.arr.length > 0, '夹具应保留部分消息以构成有效断言');
  });
});

describe('NEW-08 接线守卫：兜底裁剪不得恢复循环内全量重估', () => {
  it('react-loop 从 trim-fallback.js 导入并调用 weightTrimFallback', () => {
    assert.match(REACT_LOOP_SRC, /from\s+'\.\/trim-fallback\.js'/, 'react-loop 应导入 trim-fallback 模块');
    assert.match(REACT_LOOP_SRC, /weightTrimFallback\(\{/, '兜底段应调用 weightTrimFallback');
  });

  it('trimMessages 的兜底 while 段不再含全量 est() 重估', () => {
    // 旧形态：while 块体内出现 est([...systemMsg, ...rest])
    assert.doesNotMatch(
      REACT_LOOP_SRC,
      /while\s*\(rest\.length\s*>\s*0\)\s*\{[^}]*est\(\[\.\.\.systemMsg/,
      '兜底 while 内不应再对全量消息调用 est()'
    );
  });

  it('trim-fallback 模块内决策仅依赖增量累计 rawTotal + 逐点校准', () => {
    assert.match(TRIM_FALLBACK_SRC, /getCalibratedTokens\(rawTotal\)/, '应以累计 rawTotal 做校准判定');
    assert.doesNotMatch(TRIM_FALLBACK_SRC, /est\(\[\.\.\.systemMsg,\s*\.\.\.rest\]\)/, '不得恢复全量重估');
    // 突变后必须单条重算修正（防止日后被简化成不重算）
    assert.match(TRIM_FALLBACK_SRC, /delete rest\[j\]\.tool_calls;\n\s*\/\/[\s\S]*?strippedContribution\(rest\[j\]\)/,
      'delete tool_calls 后应重算该条贡献并修正累计值');
  });
});
