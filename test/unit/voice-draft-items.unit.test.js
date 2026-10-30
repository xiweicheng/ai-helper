import { describe, it, expect } from 'vitest';
import {
  buildDraftText,
  applySentence,
  locateEdit,
  mergeRefined,
  stripPunct,
} from '../../src/side_panel/voice-draft-items.js';

const item = (id, text, state = 'refined') => ({ id, text, state });

describe('buildDraftText', () => {
  it('按序拼接', () => {
    expect(buildDraftText([item(1, '甲。'), item(2, '乙。'), item(null, '丙', 'draft')])).toBe('甲。乙。丙');
  });

  it('空数组返回空串', () => {
    expect(buildDraftText([])).toBe('');
  });

  it('非数组不抛异常', () => {
    expect(buildDraftText(null)).toBe('');
  });
});

describe('stripPunct', () => {
  it('去掉中英文标点与空白', () => {
    expect(stripPunct('它，很好。 a b')).toBe('它很好ab');
  });
});

describe('applySentence', () => {
  it('替换对应 id 的文本并保留位置', () => {
    const items = [item(1, '错的。'), item(2, '第二句。')];
    const next = applySentence(items, { id: 1, text: '对的。' });
    expect(next[0].text).toBe('对的。');
    expect(next[1].text).toBe('第二句。');
  });

  it('locked 的句子不被改写', () => {
    const items = [item(1, '用户改过。', 'locked')];
    expect(applySentence(items, { id: 1, text: '模型想改。' })[0].text).toBe('用户改过。');
  });

  it('不存在的 id 原样返回', () => {
    const items = [item(1, '甲。')];
    expect(applySentence(items, { id: 99, text: 'x' })).toEqual(items);
  });

  it('不修改入参（纯函数）', () => {
    const items = [item(1, '甲。')];
    applySentence(items, { id: 1, text: '乙。' });
    expect(items[0].text).toBe('甲。');
  });

  it('开放句（id 为 null）不参与按 id 替换', () => {
    const items = [item(1, '甲。'), item(null, '开', 'draft')];
    const next = applySentence(items, { id: null, text: '被改' });
    expect(next[1].text).toBe('开');
  });
});

describe('locateEdit：用户手改归位', () => {
  const items = [item(1, '第一句。'), item(2, '第二句。'), item(3, '第三句。')];
  const before = '第一句。第二句。第三句。';

  it('改在第一句内部：只锁第一句', () => {
    const r = locateEdit(items, before, '第一句呀。第二句。第三句。');
    expect(r.lockedIds).toEqual([1]);
    expect(r.shift).toBe(0);
  });

  it('改在第二句内部：只锁第二句', () => {
    const r = locateEdit(items, before, '第一句。第二句啊。第三句。');
    expect(r.lockedIds).toEqual([2]);
  });

  it('改在第三句内部：只锁第三句', () => {
    const r = locateEdit(items, before, '第一句。第二句。第三句呢。');
    expect(r.lockedIds).toEqual([3]);
  });

  it('在草稿块之后追加：不锁任何句', () => {
    const r = locateEdit(items, before, '第一句。第二句。第三句。补一句');
    expect(r.lockedIds).toEqual([]);
    expect(r.shift).toBe(0);
  });

  it('整段删除（跨多句）：涉及的每一句都锁', () => {
    const r = locateEdit(items, before, '第一句。三句。');
    expect(r.lockedIds.sort()).toEqual([2, 3]);
  });

  it('返回草稿块之前插入的长度偏移', () => {
    const r = locateEdit(items, before, '前缀第一句。第二句。第三句。');
    expect(r.shift).toBe(2);
    expect(r.lockedIds).toEqual([]);
  });

  it('文本没变：不锁句、不偏移', () => {
    expect(locateEdit(items, before, before)).toEqual({ lockedIds: [], shift: 0 });
  });
});

describe('mergeRefined：字词取整段、断句取逐句', () => {
  it('差异 1 字时只替换该字，句号位置完全不变', () => {
    const items = [item(1, '它很好。'), item(2, '第二句。')];
    const r = mergeRefined(items, '他很好，第二句。');
    expect(buildDraftText(r.items)).toBe('他很好。第二句。');
    expect(r.changed).toBe(1);
    expect(r.takeAll).toBe(false);
  });

  it('完全相同：changed 为 0，不改动', () => {
    const items = [item(1, '甲。'), item(2, '乙。')];
    const r = mergeRefined(items, '甲，乙。');
    expect(r.changed).toBe(0);
    expect(buildDraftText(r.items)).toBe('甲。乙。');
  });

  it('差异超阈值（逐句漏句）：整段接管', () => {
    const items = [item(1, '甲。')];
    const r = mergeRefined(items, '甲。乙。丙。丁。');
    expect(r.takeAll).toBe(true);
    expect(r.items[0].text).toBe('甲。乙。丙。丁。');
  });

  it('locked 句的字不被整段补正', () => {
    const items = [item(1, '用户写。', 'locked'), item(2, '第二句。')];
    const r = mergeRefined(items, '模型写，第二句。');
    expect(r.items[0].text).toBe('用户写。');
  });

  it('只改字不动标点：断句仍按逐句结果', () => {
    const items = [item(1, '两百三十九兆。'), item(2, '收到。')];
    const r = mergeRefined(items, '2309兆，收到。');
    // 字数变了（字符数不同）=> 判为实质差异，整段接管
    expect(r.takeAll).toBe(true);
    expect(buildDraftText(r.items)).toBe('2309兆，收到。');
  });

  it('空输入保持稳定', () => {
    expect(mergeRefined([], '随便')).toEqual({ items: [], changed: 0, takeAll: false });
    expect(mergeRefined([item(1, '甲。')], '').changed).toBe(0);
  });
});
