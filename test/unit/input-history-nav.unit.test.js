// input-history-nav.unit.test.js - 输入框上下键翻历史
//
// 这一层的错误都很安静：多翻一条没人发现，少翻一条会被当成“没反应”，
// 而 ↓ 接管错位会**直接清空用户草稿**。所以按决策表逐格锁死。
import { readFileSync } from 'node:fs';
import { describe, test, expect } from 'vitest';
import { resolveHistoryNav } from '../../src/side_panel/input-history-nav.js';

const HISTORY = ['第一条', '第二条', '第三条'];
const IDLE = { value: '', caret: 0, history: HISTORY, index: -1 };

describe('↑ 向上翻', () => {
  test('空闲时从最新一条开始', () => {
    expect(resolveHistoryNav({ key: 'ArrowUp', ...IDLE }))
      .toEqual({ handled: true, index: 2, value: '第三条' });
  });

  test('连续上翻，到最旧一条就夹住（不绕回最新）', () => {
    expect(resolveHistoryNav({ key: 'ArrowUp', ...IDLE, index: 2 }).index).toBe(1);
    expect(resolveHistoryNav({ key: 'ArrowUp', ...IDLE, index: 1 }).index).toBe(0);
    expect(resolveHistoryNav({ key: 'ArrowUp', ...IDLE, index: 0 }).index).toBe(0);
  });

  test('光标在首行才接管：单行草稿最末位置也属于首行', () => {
    const res = resolveHistoryNav({ key: 'ArrowUp', value: '写了一半', caret: 4, history: HISTORY, index: -1 });
    expect(res.handled).toBe(true);
  });

  test('多行草稿里光标不在首行 → 不接管（让光标正常上移）', () => {
    const value = '第一行\n第二行\n第三行';
    const caret = value.indexOf('第三行');
    expect(resolveHistoryNav({ key: 'ArrowUp', value, caret, history: HISTORY, index: -1 }).handled).toBe(false);
  });

  test('已在浏览历史时无视光标位置继续翻（历史条目本身可能是多行）', () => {
    const value = '多行\n历史条目';
    // 光标在第二行，若不是“浏览中”会被判定为不该接管
    expect(resolveHistoryNav({ key: 'ArrowUp', value, caret: value.length, history: HISTORY, index: 1 }))
      .toEqual({ handled: true, index: 0, value: '第一条' });
  });
});

describe('↓ 向下翻', () => {
  test('没在浏览历史时绝不接管（旧实现会在这里清空草稿）', () => {
    expect(resolveHistoryNav({ key: 'ArrowDown', value: '我的草稿', caret: 4, history: HISTORY, index: -1 }))
      .toEqual({ handled: false });
  });

  test('浏览中逐条往回走，最后回到空白草稿', () => {
    expect(resolveHistoryNav({ key: 'ArrowDown', ...IDLE, value: '第一条', caret: 3, index: 0 }))
      .toEqual({ handled: true, index: 1, value: '第二条' });
    expect(resolveHistoryNav({ key: 'ArrowDown', ...IDLE, value: '第三条', caret: 3, index: 2 }))
      .toEqual({ handled: true, index: -1, value: '' });
  });

  test('浏览中光标不在末行 → 不接管（先把光标走到末行）', () => {
    const value = '第一条\n第二行';
    expect(resolveHistoryNav({ key: 'ArrowDown', value, caret: 0, history: HISTORY, index: 0 }).handled).toBe(false);
  });
});

describe('边界', () => {
  test('非上下键不接管', () => {
    expect(resolveHistoryNav({ key: 'Enter', ...IDLE }).handled).toBe(false);
    expect(resolveHistoryNav({ key: 'a', ...IDLE }).handled).toBe(false);
  });

  test('历史为空不接管（空的 ↑ 也不该 preventDefault）', () => {
    expect(resolveHistoryNav({ key: 'ArrowUp', value: '', caret: 0, history: [], index: -1 }))
      .toEqual({ handled: false });
  });

  test('caret 缺失按行尾算；index 越界被夹回最后一条', () => {
    const value = '单行';
    expect(resolveHistoryNav({ key: 'ArrowUp', value, history: HISTORY, index: -1 }).handled).toBe(true);
    // index 比历史长（历史被清过）时不能返回 undefined
    expect(resolveHistoryNav({ key: 'ArrowDown', value: '', caret: 0, history: HISTORY, index: 9 }))
      .toEqual({ handled: true, index: -1, value: '' });
  });
});

describe('接线', () => {
  const src = readFileSync(new URL('../../src/side_panel/index.js', import.meta.url), 'utf8');

  test('入口层真的调用了它（不是抽出来摆着看）', () => {
    expect(src).toContain("from './input-history-nav.js'");
    expect(src).toContain('const nav = resolveHistoryNav({');
    // 接管后必须同步 index 与输入框，否则下一次按键的起点是错的
    expect(src).toContain('state.inputHistoryIndex = nav.index;');
    expect(src).toContain('userInput.value = nav.value;');
  });

  test('翻历史不再被生成状态挡住（这正是用户报的那个症状）', () => {
    const at = src.indexOf('const nav = resolveHistoryNav({');
    expect(at).toBeGreaterThan(-1);
    const guard = src.slice(src.lastIndexOf('const isPromptSelectorVisible', at), at);
    expect(guard).not.toContain('state.isGenerating');
  });
});
