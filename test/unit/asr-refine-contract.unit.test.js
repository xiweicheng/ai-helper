// test/unit/asr-refine-contract.unit.test.js
// 源码规则守卫：句级即时精修的几条契约只有真机（真实模型 + 真实音频）才跑得出来，
// 单测里没法端到端复现，所以用源码结构把契约钉住，并做过变异验证（见提交说明）。
//
// 每条断言背后都是踩过的坑，不要因为「看起来像实现细节」就放宽：
//   1) 硬切 → 实测 8s 硬切产生 `牛。头不对马嘴`、`230。9兆`，CER 3.7% → 5.5%
//   2) silero VAD → sherpa-onnx-node 2.0.1 的 vad.front() 必 SIGSEGV
//   3) 精修排队 → 会把 stop 的定稿一起拖慢（用户松手后等待变长）
//   4) 整段覆盖 → 逐句断句全丢，前端看到的句号又变回逗号
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = process.cwd();
const read = (p) => readFileSync(join(root, p), 'utf8');
// 注释里写「为什么不用 silero VAD」是好事，断言只能盯代码：先去注释再比对。
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\s)\/\/.*$/gm, '$1');

describe('切句契约', () => {
  it('会话层必须用 chooseCutIndex，不得出现固定样本数硬切', () => {
    const src = read('agent/src/asr/session.js');
    expect(src).toContain('chooseCutIndex(');
    expect(src).not.toMatch(/slice\(0,\s*MAX_SEGMENT/);
  });

  it('切句器不得引用 silero VAD（必 SIGSEGV）', () => {
    const src = stripComments(read('agent/src/asr/sentence-splitter.js'));
    expect(src).not.toContain('getVad');
    expect(src).not.toContain('sherpa');
  });

  it('切句器必须是纯 JS 帧级 RMS：帧长/静音阈值/上限都来自常量', () => {
    const src = read('agent/src/asr/sentence-splitter.js');
    expect(src).toMatch(/FRAME_MS\s*=\s*\d+/);
    expect(src).toMatch(/SILENCE_RMS\s*=\s*[\d.]+/);
    expect(src).toMatch(/MAX_SENTENCE_MS\s*=\s*\d+/);
    expect(src).toMatch(/LOOKBACK_MS\s*=\s*\d+/);
  });

  // 配置页曾把「智能断句」列为一项识别能力，但那是永远不会亮起的死标签：
  // 磁盘无 vad 类型模型包时 capability.vad 恒为 false；即便有，engine.js 的 getVad 也会因
  // sherpa-onnx-node 的 vad.front() 必 SIGSEGV 而默认短路返回 null。断句已改由上面的帧级 RMS 完成。
  // 所以 UI 不得再宣传它 —— 重新加回来要么是空承诺，要么说明有人又把 VAD 接回去了（那会崩进程）。
  it('配置页不得再宣传「智能断句」这个能力', () => {
    const ui = read('src/options/toolbox-asr.js');
    expect(ui).not.toContain('asrCapVad');
    expect(read('src/shared/locales/zh.js')).not.toContain('asrCapVad:');
    expect(read('src/shared/locales/en.js')).not.toContain('asrCapVad:');
  });
});

describe('精修不阻塞定稿契约', () => {
  it('finalize 必须最先置 refineAborted', () => {
    const src = read('agent/src/asr/session.js');
    const fn = src.match(/function finalize\(session\) \{[\s\S]*?\n  \}/);
    expect(fn, 'finalize 必须存在').toBeTruthy();
    const firstLines = fn[0].split('\n').slice(0, 4).join('\n');
    expect(firstLines).toContain('refineAborted = true');
  });

  it('精修任务必须带 shouldSkip（出队瞬间再判一次是否已被中止）', () => {
    const src = read('agent/src/asr/session.js');
    expect(src).toMatch(/shouldSkip:\s*\(\)\s*=>[^\n]*session\.refineAborted/);
  });

  it('shouldSkip 不得跟 opts 一起进 worker（函数不可结构化克隆，每句精修都会失败）', () => {
    const src = read('agent/src/asr/session.js');
    expect(src).toContain('splitWorkerOpts(');
    // 直接 `opts,` 透传 是 bug 的原始写法；必须显式拆开再分别传
    const wrapper = src.match(/const transcribe = deps\.transcribe \|\|[\s\S]*?\n  \}\);/);
    expect(wrapper, '默认 transcribe 包装器必须存在').toBeTruthy();
    expect(wrapper[0]).toContain('opts: workerOpts');
    expect(wrapper[0]).not.toMatch(/\n\s*opts,\n/);
  });

  it('背压必须有上限，且超出时丢「最旧未开始」的那条', () => {
    const src = read('agent/src/asr/session.js');
    expect(src).toMatch(/MAX_PENDING_REFINE\s*=\s*\d+/);
    expect(src).toMatch(/skip\s*=\s*true/);
  });
});

describe('识别节奏三档必须是活配置', () => {
  it('会话层把 pacing 快照进 session（否则三档只是白存一遍）', () => {
    const src = read('agent/src/asr/session.js');
    expect(src).toMatch(/pacing:\s*typeof deps\.getPacing === 'function'/);
  });

  it('instant 关精修（= 引入句级精修之前的行为）', () => {
    const src = read('agent/src/asr/session.js');
    const fn = src.match(/function isRefineEnabled\(session\) \{[\s\S]*?\n  \}/);
    expect(fn, 'isRefineEnabled 必须存在').toBeTruthy();
    expect(fn[0]).toContain("session.pacing === 'instant'");
  });

  it('precise 不出逐字草稿（partial 在发送前就返回）', () => {
    const src = read('agent/src/asr/session.js');
    expect(src).toMatch(/session\.pacing === 'precise'\)\s*return/);
  });

  it('配置侧：白名单常量 + 默认值 + 落盘收敛三者齐全', () => {
    const cfg = read('agent/src/asr/config.js');
    expect(cfg).toContain("SUPPORTED_PACING = ['instant', 'balanced', 'precise']");
    expect(cfg).toMatch(/asrPacing:\s*'balanced'/);
    expect(cfg).toMatch(/asrPacing:\s*SUPPORTED_PACING\.includes/);
    const routes = read('agent/src/asr/routes.js');
    expect(routes).toMatch(/patch\.asrPacing = body\.asrPacing/);
    expect(routes).toMatch(/asrPacing:\s*config\.asrPacing/);
    const server = read('agent/src/server.js');
    expect(server).toMatch(/getPacing:\s*\(\)\s*=>\s*getAsrConfig\(\)\.asrPacing/);
  });
});

describe('断句保逐句契约', () => {
  it('mergeRefined 不得无条件用整段覆盖', () => {
    const src = read('src/side_panel/voice-draft-items.js');
    expect(src).toContain('takeAll');
    expect(src).toContain('stripPunct');
  });

  it('精修只改对应 id，locked 句原样返回（手改只锁那一句）', () => {
    const src = read('src/side_panel/voice-draft-items.js');
    expect(src).toMatch(/item\.state === 'locked'/);
    expect(src).toMatch(/typeof id !== 'number'/);
  });

  it('前端只写开放句：partial 分支读 evt.open', () => {
    const src = read('src/side_panel/voice-input.js');
    expect(src).toMatch(/evt\.open/);
    expect(src).toMatch(/id: null/);
  });

  it('i18n 四个精修文案中英各一份（注册在 voice-input.js 内，不在 locales/）', () => {
    const src = read('src/side_panel/voice-input.js');
    for (const k of ['refineListening', 'refineCorrecting', 'refineCorrected', 'refineDegraded']) {
      const hits = (src.match(new RegExp(`\\b${k}:`, 'g')) || []).length;
      expect(hits, `${k} 必须有中英两份注册`).toBeGreaterThanOrEqual(2);
    }
  });

  it('识别节奏的六条文案中英成对（配置页要能直接渲染）', () => {
    const zh = read('src/shared/locales/zh.js');
    const en = read('src/shared/locales/en.js');
    for (const k of [
      'asrPacing', 'asrPacingHint', 'asrPacingInstant',
      'asrPacingBalanced', 'asrPacingPrecise', 'asrPacingSaved',
    ]) {
      expect(zh, `zh 缺 ${k}`).toContain(`${k}:`);
      expect(en, `en 缺 ${k}`).toContain(`${k}:`);
    }
  });
});
