// @vitest-environment jsdom
// test/unit/voice-sentence-items.unit.test.js
// 句表驱动草稿的回归守卫：sentence / partial.open / refine / final.texts 这几个新协议
// 只有在前端按句消费时才有意义 —— 这里锁的是「一句一处改动」的边界。
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  toggleVoiceInput,
  isVoiceRecording,
  abortVoiceInput,
  initVoiceInput,
} from '../../src/side_panel/voice-input.js';
import { t } from '../../src/shared/i18n.js';
import { setupDom, stubChrome, stubMedia } from './helpers/voice-harness.js';

const ARMED = { success: true, available: true, language: 'zh', maxRecordingMs: 300000 };

let dom;
let chromeCtx;
let media;

async function startRecording() {
  await toggleVoiceInput();
  expect(isVoiceRecording()).toBe(true);
  media.emitChunk();
}

/** 模拟用户手改输入框（真实用户是在输入框里打字，会触发 input 事件） */
function typeByUser(value, caret) {
  dom.input.value = value;
  dom.input.setSelectionRange(caret, caret);
  dom.input.dispatchEvent(new Event('input'));
}

beforeEach(async () => {
  dom = setupDom();
  media = stubMedia();
  chromeCtx = stubChrome({ status: ARMED });
  await initVoiceInput({});
});

afterEach(() => {
  abortVoiceInput();
  chromeCtx.port.disconnect();
});

describe('句表驱动：partial.open 只写「正在说」的那一句', () => {
  it('切句后 partial 只更新新的一句，不动已定稿的句子', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '第一句', open: '第一句' });
    expect(dom.input.value).toBe('第一句');

    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '第一句。', refined: null });
    expect(dom.input.value).toBe('第一句。');

    // 服务端的 text 是全文，open 才是当前未切句的一段
    chromeCtx.port.emit({ type: 'partial', text: '第一句。第二句', open: '第二句' });
    expect(dom.input.value).toBe('第一句。第二句');
  });

  it('精修回填只替换对应 id 的句子', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '它很好', open: '它很好' });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: null });
    chromeCtx.port.emit({ type: 'partial', text: '它很好。第二句', open: '第二句' });
    expect(dom.input.value).toBe('它很好。第二句');

    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: '他很好。' });
    expect(dom.input.value).toBe('他很好。第二句');
  });
});

describe('手改归位：只锁被改的那一句', () => {
  it('用户改了第一句，后续精修第二句不得覆盖第一句', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '第一句', open: '第一句' });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '第一句。', refined: null });
    chromeCtx.port.emit({ type: 'partial', text: '第一句。第二句', open: '第二句' });

    typeByUser('第一句改。第二句', 8);

    chromeCtx.port.emit({ type: 'sentence', id: 2, draft: '第二句。', refined: null });
    chromeCtx.port.emit({ type: 'sentence', id: 2, draft: '第二句。', refined: '第二句话。' });
    expect(dom.input.value).toBe('第一句改。第二句话。');
  });

  it('用户改的是第一句，第一句的精修回来也不得覆盖', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '它很好', open: '它很好' });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: null });
    chromeCtx.port.emit({ type: 'partial', text: '它很好。', open: '' });

    typeByUser('它非常好。', 5);

    // 迟到的精修想改同一句：locked 之后一律以用户为准
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: '他很好。' });
    expect(dom.input.value).toBe('它非常好。');
  });

  it('取消录音：没动过的草稿整块回滚，用户改过的句子留下', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '它很好', open: '它很好' });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: null });
    chromeCtx.port.emit({ type: 'partial', text: '它很好。第二', open: '第二' });
    expect(dom.input.value).toBe('它很好。第二');

    typeByUser('它非常好。第二', 7);
    dom.cancelBtn.click();

    // 用户手写过的字不能因为“取消”而被抹掉
    expect(dom.input.value).toBe('它非常好。第二');
  });

  it('取消录音：完全没动过就整块回滚', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '它很好', open: '它很好' });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: null });
    dom.cancelBtn.click();
    expect(dom.input.value).toBe('');
  });
});

// 代码评审发现的四条交叉边界：手改（locked）与切句 / 定稿 / 光标 / 块外编辑撞在一起时，
// 之前的用例都是「先切句、再手改」，反过来的顺序没有覆盖，而用户的实际操作两种都有。
describe('手改与切句的交叉边界', () => {
  it('用户改的正是「正在说」的那句：切句帧只认领 id，不得把字改回草稿', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '它很好', open: '它很好' });
    typeByUser('它非常好', 5);
    expect(dom.input.value).toBe('它非常好');

    // 这句说完了：draft 是模型在用户改字之前的旧结果，手改优先
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: null });
    expect(dom.input.value).toBe('它非常好');

    // 精修回来同样不能盖（locked 已随切句保留）
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: '他很好。' });
    expect(dom.input.value).toBe('它非常好');

    // 下一句照常另起一条
    chromeCtx.port.emit({ type: 'partial', text: '它很好。第二句', open: '第二句' });
    expect(dom.input.value).toBe('它非常好第二句');
  });

  it('整段接管不得抹掉用户手改的句子', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '它很好', open: '它很好' });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: null });
    chromeCtx.port.emit({ type: 'partial', text: '它很好。第二', open: '第二' });
    typeByUser('它非常好。第二', 6);
    expect(dom.input.value).toBe('它非常好。第二');

    // 整段把两句串成一句（去标点后长度不等 -> 走 takeAll）：手改句的字必须留住
    chromeCtx.port.emit({
      type: 'final',
      text: '它很好第二。',
      fallback: false,
      texts: ['它很好。', '第二。'],
    });
    expect(dom.input.value).toBe('它非常好。第二');
  });

  it('草稿块之前删字：不得把块首的字截掉并误锁句', async () => {
    // 输入框里已有内容，草稿块从光标处（第 2 个字之后）开始
    dom.input.value = '开头';
    dom.input.setSelectionRange(2, 2);
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '甲。', open: '甲。' });
    expect(dom.input.value).toBe('开头甲。');

    // 用户删掉块前一个字：块内容一个字都没动
    typeByUser('开甲。', 1);
    expect(dom.input.value).toBe('开甲。');

    // 块内容没被误改：这句仍是「未手改」的草稿，切句与精修都必须照常生效
    // （老实现会把块首截成「。」并误锁，后续整句都改不动了）
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '甲。', refined: null });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '甲。', refined: '甲呀。' });
    expect(dom.input.value).toBe('开甲呀。');
  });

  it('光标停在草稿块中间：partial 刷新不得把光标拽到块尾', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '第一句', open: '第一句' });
    expect(dom.input.value).toBe('第一句');

    // 用户点进第 2 个字后面准备改字（还没敲键，所以还没锁定）
    dom.input.setSelectionRange(1, 1);
    chromeCtx.port.emit({ type: 'partial', text: '第一句第二', open: '第一句第二' });
    expect(dom.input.value).toBe('第一句第二');
    expect(dom.input.selectionStart).toBe(1);
  });
});

describe('final：字词取整段、断句取逐句', () => {
  it('差异只有一个字：只缝那个字，句号位置不动', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '它很好', open: '它很好' });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: null });
    chromeCtx.port.emit({ type: 'partial', text: '它很好。第二句。', open: '第二句。' });

    chromeCtx.port.emit({
      type: 'final',
      text: '他很好，第二句。',
      fallback: false,
      segments: 2,
      texts: ['他很好。', '第二句。'],
    });

    expect(dom.input.value).toBe('他很好。第二句。');
    expect(dom.status.textContent).toBe(t('voice.refineCorrected', { n: 1 }));
  });

  it('整段把两句并成一句：断句仍按逐句结果', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'partial', text: '它很好', open: '它很好' });
    chromeCtx.port.emit({ type: 'sentence', id: 1, draft: '它很好。', refined: null });
    chromeCtx.port.emit({ type: 'partial', text: '它很好。第二句。', open: '第二句。' });

    chromeCtx.port.emit({ type: 'final', text: '它很好，第二句。', fallback: false });

    // 标点差异不算纠错，不能被整段结果的逗号吃掉句号
    expect(dom.input.value).toBe('它很好。第二句。');
  });

  it('没有逐句帧（流式缺席）：用 final.texts 恢复断句', async () => {
    await startRecording();

    chromeCtx.port.emit({ type: 'final', text: '甲。乙。', fallback: false, texts: ['甲。', '乙。'] });
    expect(dom.input.value).toBe('甲。乙。');
  });
});
