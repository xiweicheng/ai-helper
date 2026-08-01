// @vitest-environment jsdom
// page-utils 单元测试：选择器生成 / 文本值读取（jsdom 环境）
import { describe, test, expect, beforeEach } from 'vitest';
import {
  generateUniqueSelector,
  getElementText,
  getElementValue,
  getElementSelector,
} from '../../../src/content/page-utils.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('generateUniqueSelector - 唯一选择器生成', () => {
  test('有 id 直接返回 #id', () => {
    const el = document.createElement('div');
    el.id = 'myid';
    document.body.appendChild(el);
    expect(generateUniqueSelector(el)).toBe('#myid');
  });

  test('祖先有 id 时向上追溯到 id 停止', () => {
    document.body.innerHTML = '<div id="wrap"><span>text</span></div>';
    const span = document.querySelector('#wrap span');
    expect(generateUniqueSelector(span)).toBe('#wrap > span');
  });

  test('无 id 单元素返回 tag（无 nth-child）', () => {
    const div = document.createElement('div');
    document.body.appendChild(div);
    expect(generateUniqueSelector(div)).toBe('div');
  });

  test('同级多个同 tag 元素加 nth-child', () => {
    document.body.innerHTML = '<div></div><div></div>';
    const second = document.querySelectorAll('div')[1];
    const sel = generateUniqueSelector(second);
    expect(sel).toContain('div');
    expect(sel).toMatch(/nth-child\(2\)/);
  });

  test('className 取第一个 class', () => {
    const div = document.createElement('div');
    div.className = 'foo bar';
    document.body.appendChild(div);
    expect(generateUniqueSelector(div)).toBe('div.foo');
  });
});

describe('getElementText - 元素文本读取', () => {
  test('input 取 value', () => {
    const input = document.createElement('input');
    input.value = 'hello';
    document.body.appendChild(input);
    expect(getElementText(input)).toBe('hello');
  });

  test('input 无 value 时取 placeholder', () => {
    const input = document.createElement('input');
    input.placeholder = 'ph';
    document.body.appendChild(input);
    expect(getElementText(input)).toBe('ph');
  });

  test('textarea 取 value', () => {
    const ta = document.createElement('textarea');
    ta.value = 'multiline\ntext';
    document.body.appendChild(ta);
    expect(getElementText(ta)).toBe('multiline\ntext');
  });

  test('select 取选中项的 text', () => {
    document.body.innerHTML = '<select><option value="a">Apple</option><option value="b" selected>Banana</option></select>';
    const select = document.querySelector('select');
    expect(getElementText(select)).toBe('Banana');
  });

  test('普通元素取 textContent', () => {
    const div = document.createElement('div');
    div.textContent = '  plain  ';
    document.body.appendChild(div);
    expect(getElementText(div)).toBe('plain');
  });
});

describe('getElementValue - 元素值读取', () => {
  test('checkbox checked', () => {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    expect(getElementValue(cb)).toBe('checked');
  });

  test('checkbox unchecked', () => {
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    expect(getElementValue(cb)).toBe('unchecked');
  });

  test('radio checked', () => {
    const r = document.createElement('input');
    r.type = 'radio';
    r.checked = true;
    expect(getElementValue(r)).toBe('checked');
  });

  test('text input 取 value', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = 'abc';
    expect(getElementValue(input)).toBe('abc');
  });

  test('select 取 value', () => {
    document.body.innerHTML = '<select><option value="x" selected>X</option></select>';
    expect(getElementValue(document.querySelector('select'))).toBe('x');
  });

  test('非表单元素返回空字符串', () => {
    const div = document.createElement('div');
    div.textContent = 'hello';
    expect(getElementValue(div)).toBe('');
  });
});

describe('getElementSelector - 简易选择器', () => {
  test('有 id 返回 #id', () => {
    const el = document.createElement('div');
    el.id = 'x';
    expect(getElementSelector(el)).toBe('#x');
  });

  test('无 id 有 class 取前两个 class', () => {
    const el = document.createElement('div');
    el.className = 'a b c';
    expect(getElementSelector(el)).toBe('div.a.b');
  });
});
