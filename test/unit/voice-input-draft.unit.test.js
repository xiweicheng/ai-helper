// test/unit/voice-input-draft.unit.test.js
// 语音输入草稿替换 / 回滚的纯函数测试（不起 DOM、不碰 chrome）。
// 关键行为：
//   1) 未 dirty：草稿原地替换 [start, start+len)，不会把上一版草稿累积进去；
//   2) 用户中途手改（dirty）或浏览器不支持 setRangeText：退化为「在光标处追加」，绝不覆盖用户输入；
//   3) 取消录音：只回滚本次草稿区间，已定稿/用户输入原样保留。
import { describe, it, expect } from 'vitest';
import { computeDraftEdit, computeDraftRollback } from '../../src/side_panel/voice-input.js';

const draft = (over = {}) => ({ start: 0, len: 0, dirty: false, ...over });

describe('computeDraftEdit：草稿写入区间', () => {
  it('无草稿：原样返回，光标落到末尾', () => {
    expect(computeDraftEdit({ value: 'abc', draft: null, text: 'x' })).toEqual({
      value: 'abc',
      caret: 3,
      len: 0,
    });
  });

  it('首次插入（start=光标位置）：文本落在光标处，返回新的草稿长度', () => {
    const r = computeDraftEdit({ value: '前后', draft: draft({ start: 1 }), text: '草稿' });
    expect(r.value).toBe('前草稿后');
    expect(r.len).toBe(2);
    expect(r.caret).toBe(3);
  });

  it('未 dirty：原地替换上一次草稿，不累积重复文本', () => {
    // 输入框里已经是上一版草稿「你好」，len=2
    const r = computeDraftEdit({
      value: '前缀你好后缀',
      draft: draft({ start: 2, len: 2 }),
      text: '你好世界',
    });
    expect(r.value).toBe('前缀你好世界后缀');
    expect(r.len).toBe(4);
    expect(r.caret).toBe(6);
  });

  it('草稿变短时也能正确收缩（不会残留尾巴）', () => {
    const r = computeDraftEdit({
      value: 'A你好世界B',
      draft: draft({ start: 1, len: 4 }),
      text: '你好',
    });
    expect(r.value).toBe('A你好B');
    expect(r.len).toBe(2);
  });

  it('dirty（用户手改过）：退化为在光标处追加，不覆盖用户输入', () => {
    const r = computeDraftEdit({
      value: '用户自己写的',
      draft: draft({ start: 0, len: 3, dirty: true }),
      text: '新的定稿',
      caret: 5,
    });
    expect(r.value).toBe('用户自己写新的定稿的');
    expect(r.len).toBe(0);
    expect(r.caret).toBe(9);
  });

  it('不支持 setRangeText（canReplace=false）：同样退化为追加', () => {
    const r = computeDraftEdit({
      value: 'ab',
      draft: draft({ start: 0, len: 1 }),
      text: 'XY',
      caret: 2,
      canReplace: false,
    });
    expect(r.value).toBe('abXY');
    expect(r.len).toBe(0);
  });

  it('start/len 越界（文件被外部改动）时按当前长度收敛，不抛异常', () => {
    const r = computeDraftEdit({ value: 'ab', draft: draft({ start: 99, len: 99 }), text: 'Z' });
    expect(r.value).toBe('abZ');
    const neg = computeDraftEdit({ value: 'ab', draft: draft({ start: -5, len: -5 }), text: 'Z' });
    expect(neg.value).toBe('Zab');
  });

  it('空文本：等价于删掉草稿区间', () => {
    const r = computeDraftEdit({ value: '前草稿后', draft: draft({ start: 1, len: 2 }), text: '' });
    expect(r.value).toBe('前后');
    expect(r.len).toBe(0);
  });

  it('caret 缺省时追加到末尾', () => {
    const r = computeDraftEdit({ value: 'ab', draft: draft({ dirty: true }), text: 'c' });
    expect(r.value).toBe('abc');
  });
});

describe('computeDraftRollback：取消时回滚', () => {
  it('未 dirty：删除草稿区间，光标回到区间起点', () => {
    const r = computeDraftRollback({ value: '前缀草稿后缀', draft: draft({ start: 2, len: 2 }) });
    expect(r.value).toBe('前缀后缀');
    expect(r.caret).toBe(2);
  });

  it('dirty：原样保留（用户手改过的内容不能被撤销）', () => {
    const r = computeDraftRollback({
      value: '用户内容',
      draft: draft({ start: 0, len: 4, dirty: true }),
    });
    expect(r.value).toBe('用户内容');
    expect(r.caret).toBe(4);
  });

  it('len<=0（从未写入草稿）：不删任何字', () => {
    const r = computeDraftRollback({ value: '原有内容', draft: draft({ start: 2, len: 0 }) });
    expect(r.value).toBe('原有内容');
  });

  it('无草稿 / 不支持替换：原样返回', () => {
    expect(computeDraftRollback({ value: 'ab', draft: null }).value).toBe('ab');
    expect(computeDraftRollback({ value: 'ab', draft: draft({ len: 2 }), canReplace: false }).value).toBe('ab');
  });

  it('与 computeDraftEdit 配对：写入后再回滚可完全还原', () => {
    const original = '这是一段原有文本';
    const start = 4; // 「段」之后
    const written = computeDraftEdit({
      value: original,
      draft: draft({ start }),
      text: '语音草稿内容',
    });
    expect(written.value).toBe('这是一段语音草稿内容原有文本');

    const rolled = computeDraftRollback({
      value: written.value,
      draft: draft({ start, len: written.len }),
    });
    expect(rolled.value).toBe(original);
  });
});
