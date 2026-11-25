// input-trigger.unit.test.js - 输入框 @ / $ 触发符检测
//
// 锁定回归：旧实现用 value.substring(index + 1) 一直取到文末，
// 下方已有多行内容（含换行 / 空格）时会把触发符误判为无效，
// 导致“下面已有内容时，在上面输入 @ / $ / 触发不了弹框”。
import { describe, test, expect } from 'vitest';
import { resolveActiveTrigger, stripActiveTrigger, replaceActiveTrigger } from '../../src/side_panel/input-trigger.js';

describe('多行内容下方已有内容时，在上方输入触发符', () => {
  test('@ 后紧跟换行与下方内容，光标在 @ 之后 → 触发 at，filterText 不含下方内容', () => {
    const value = '@\nesdfs';
    // 光标紧跟在 @ 之后（刚输入完 @）
    expect(resolveActiveTrigger({ value, caret: 1 }))
      .toEqual({ key: 'at', index: 0, filterText: '' });
  });

  test('下方已有多行内容，在第一行行首输入 / → 触发 slash', () => {
    const value = '/已有的第一行\n第二行\n第三行';
    expect(resolveActiveTrigger({ value, caret: 1 }))
      .toEqual({ key: 'slash', index: 0, filterText: '' });
  });

  test('下方已有内容，在中间行首输入 $ → 触发 dollar', () => {
    const value = '第一行\n$\n第三行';
    const caret = value.indexOf('$') + 1;
    expect(resolveActiveTrigger({ value, caret }))
      .toEqual({ key: 'dollar', index: value.indexOf('$'), filterText: '' });
  });

  test('触发符后输入过滤词，下方仍有内容 → filterText 只取到光标，不含下方', () => {
    const value = '@ag\n下面的内容';
    const caret = value.indexOf('\n'); // 光标在 @ag 末尾、换行之前
    expect(resolveActiveTrigger({ value, caret }))
      .toEqual({ key: 'at', index: 0, filterText: 'ag' });
  });
});

describe('匹配结束：触发符到光标之间出现空格 / 换行 → 不触发', () => {
  test('触发符后输入空格 → 本次匹配结束，不触发', () => {
    const value = '@ ';
    expect(resolveActiveTrigger({ value, caret: value.length })).toBeNull();
  });

  test('触发符到光标之间隔着换行 → 不触发（光标已走到下一行）', () => {
    const value = '@\nesdfs';
    expect(resolveActiveTrigger({ value, caret: value.length })).toBeNull();
  });
});

describe('词首边界：触发符前必须是起始 / 空格 / 换行', () => {
  test('触发符紧跟在字母后 → 不算触发（邮箱 / 路径片段）', () => {
    expect(resolveActiveTrigger({ value: 'a@b', caret: 3 })).toBeNull();
    expect(resolveActiveTrigger({ value: 'http://x', caret: 9 })).toBeNull();
  });

  test('空格后的触发符 → 触发', () => {
    expect(resolveActiveTrigger({ value: 'hi @ag', caret: 8 }))
      .toEqual({ key: 'at', index: 3, filterText: 'ag' });
  });

  test('换行后的触发符 → 触发', () => {
    const value = '上一行\n/foo';
    const caret = value.length;
    expect(resolveActiveTrigger({ value, caret }))
      .toEqual({ key: 'slash', index: value.indexOf('/'), filterText: 'foo' });
  });
});

describe('优先级：多个触发符同时有效时取最靠后的一个', () => {
  test('@ 与 $ 都在词首且都未结束 → 取位置靠后的 $', () => {
    const value = '@a $b';
    const caret = value.length;
    expect(resolveActiveTrigger({ value, caret }))
      .toEqual({ key: 'dollar', index: value.indexOf('$'), filterText: 'b' });
  });

  test('只看光标之前：光标之后的触发符不参与', () => {
    const value = '@ag 后面$x';
    const caret = 3; // 光标在 @ag 末尾，$ 在光标之后
    expect(resolveActiveTrigger({ value, caret }))
      .toEqual({ key: 'at', index: 0, filterText: 'ag' });
  });
});

describe('边界与兜底', () => {
  test('无触发符 → null', () => {
    expect(resolveActiveTrigger({ value: '随便写点', caret: 4 })).toBeNull();
  });

  test('caret 非法时回退到文末', () => {
    expect(resolveActiveTrigger({ value: '/foo', caret: -1 }))
      .toEqual({ key: 'slash', index: 0, filterText: 'foo' });
    expect(resolveActiveTrigger({ value: '/foo', caret: undefined }))
      .toEqual({ key: 'slash', index: 0, filterText: 'foo' });
    expect(resolveActiveTrigger({ value: '/foo', caret: 999 }))
      .toEqual({ key: 'slash', index: 0, filterText: 'foo' });
  });
});

describe('stripActiveTrigger：只移除光标前的触发 token，其余内容保留', () => {
  test('@ 触发符下方另有多行内容 → 仅移除 @xxx，下方保留', () => {
    const value = '@ag\n第二行\n第三行';
    expect(stripActiveTrigger(value, value.indexOf('\n'), 'at'))
      .toEqual({ value: '\n第二行\n第三行', caret: 0 });
  });

  test('$ 触发符在中间行 → 上方下方内容都保留', () => {
    const value = '前缀\n$f\n后缀';
    const caret = value.indexOf('\n后缀');
    expect(stripActiveTrigger(value, caret, 'dollar'))
      .toEqual({ value: '前缀\n\n后缀', caret: value.indexOf('$') });
  });

  test('触发符类型不匹配 → null（不动文本）', () => {
    expect(stripActiveTrigger('@ag', 3, 'dollar')).toBeNull();
  });

  test('无合法触发符 → null', () => {
    expect(stripActiveTrigger('普通文本', 4, 'at')).toBeNull();
  });

  test('光标之后的触发符不参与（不会误删下方的 @）', () => {
    const value = '上文\n@要保留的';
    expect(stripActiveTrigger(value, value.indexOf('\n'), 'at')).toBeNull();
  });
});

describe('replaceActiveTrigger：原地替换触发 token，其余内容保留', () => {
  test('把 /code 替换为提示词正文，上方下方内容都保留', () => {
    const value = '请参考：\n/p1\n下面还有';
    const caret = value.indexOf('\n下面');
    expect(replaceActiveTrigger(value, caret, 'slash', '正文'))
      .toEqual({ value: '请参考：\n正文\n下面还有', caret: '请参考：\n'.length + '正文'.length });
  });

  test('替换后光标落在插入正文末尾', () => {
    const res = replaceActiveTrigger('/p1', 3, 'slash', 'XYZ');
    expect(res.value).toBe('XYZ');
    expect(res.caret).toBe(3);
  });

  test('没有合法触发符 → null', () => {
    expect(replaceActiveTrigger('前缀/过滤词', 5, 'slash', 'X')).toBeNull();
  });
});
