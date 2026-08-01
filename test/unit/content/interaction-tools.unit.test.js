// @vitest-environment jsdom
// interaction-tools 单元测试：表单填充/滚动/键盘/点击/下拉/存储（jsdom 环境）
import { describe, test, expect, beforeEach } from 'vitest';
import {
  fillForm,
  scrollToPosition,
  keyboardInput,
  clickByText,
  selectDropdown,
  manageStorage,
  clickElement,
} from '../../../src/content/interaction-tools.js';

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});

describe('fillForm - 表单批量填充', () => {
  test('text/select/checkbox/radio/contenteditable 五分支', () => {
    document.body.innerHTML = `
      <input id="i1" type="text">
      <select id="s1"><option value="a">A</option><option value="b">B</option></select>
      <input id="c1" type="checkbox">
      <input type="radio" name="r" value="x" id="r1">
      <div id="ce" contenteditable="true"></div>
    `;
    const r = fillForm([
      { selector: '#i1', value: 'hello', fieldType: 'text' },
      { selector: '#s1', value: 'b', fieldType: 'select' },
      { selector: '#c1', value: 'true', fieldType: 'checkbox' },
      { selector: '#r1', value: 'x', fieldType: 'radio' },
      { selector: '#ce', value: 'rich', fieldType: 'contenteditable' },
    ]);
    expect(r.success).toBe(true);
    expect(document.getElementById('i1').value).toBe('hello');
    expect(document.getElementById('s1').value).toBe('b');
    expect(document.getElementById('c1').checked).toBe(true);
    expect(document.getElementById('r1').checked).toBe(true);
    expect(document.getElementById('ce').textContent).toBe('rich');
  });

  test('未找到元素时该字段失败', () => {
    const r = fillForm([{ selector: '#missing', value: 'x', fieldType: 'text' }]);
    expect(r.success).toBe(true);
    expect(r.details[0].success).toBe(false);
    expect(r.details[0].error).toContain('未找到');
  });

  test('select 未匹配选项失败', () => {
    document.body.innerHTML = '<select id="s"><option value="a">A</option></select>';
    const r = fillForm([{ selector: '#s', value: 'z', fieldType: 'select' }]);
    expect(r.details[0].success).toBe(false);
  });
});

describe('scrollToPosition - 滚动定位', () => {
  test('top/bottom/coordinates 成功', () => {
    expect(scrollToPosition({ target: 'top' }).success).toBe(true);
    expect(scrollToPosition({ target: 'bottom' }).success).toBe(true);
    expect(scrollToPosition({ target: 'coordinates', x: 0, y: 100 }).success).toBe(true);
  });

  test('selector 命中成功', () => {
    document.body.innerHTML = '<div id="t"></div>';
    expect(scrollToPosition({ target: 'selector', selector: '#t' }).success).toBe(true);
  });

  test('selector 未找到失败', () => {
    expect(scrollToPosition({ target: 'selector', selector: '#missing' }).success).toBe(false);
  });

  test('无效 target 失败', () => {
    expect(scrollToPosition({ target: 'invalid' }).success).toBe(false);
  });
});

describe('keyboardInput - 键盘输入', () => {
  test('text 追加到聚焦的 input', async () => {
    const input = document.createElement('input');
    input.value = 'pre';
    document.body.appendChild(input);
    input.focus();
    await keyboardInput({ text: 'abc' });
    expect(input.value).toBe('preabc');
  });

  test('key 派发 keydown 事件', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    let received = null;
    input.addEventListener('keydown', (e) => { received = e.key; });
    await keyboardInput({ key: 'Enter' });
    expect(received).toBe('Enter');
  });

  test('Enter 的 keyCode 为 13', async () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    let keyCode = null;
    input.addEventListener('keydown', (e) => { keyCode = e.keyCode; });
    await keyboardInput({ key: 'Enter' });
    expect(keyCode).toBe(13);
  });
});

describe('clickByText - 文本点击', () => {
  test('命中并点击', async () => {
    document.body.innerHTML = '<button id="b1">Submit</button>';
    let clicked = false;
    document.getElementById('b1').addEventListener('click', () => { clicked = true; });
    const r = await clickByText('Submit', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(clicked).toBe(true);
    expect(r.selector).toBe('#b1');
  });

  test('未找到文本返回诊断错误', async () => {
    document.body.innerHTML = '<div>nothing here</div>';
    const r = await clickByText('NotExist', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('NotExist');
  });

  test('限定 tag 匹配', async () => {
    document.body.innerHTML = '<span>Go</span><button>Go</button>';
    let clickedTag = null;
    document.querySelector('button').addEventListener('click', function () { clickedTag = this.tagName; });
    const r = await clickByText('Go', { tag: 'button', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(clickedTag).toBe('BUTTON');
  });
});

describe('selectDropdown - 下拉选择', () => {
  test('原生 select 匹配选项', async () => {
    document.body.innerHTML = '<select id="s"><option value="a">Apple</option><option value="b">Banana</option></select>';
    const r = await selectDropdown('#s', 'Banana');
    expect(r.success).toBe(true);
    expect(document.getElementById('s').value).toBe('b');
    expect(r.triggerTag).toBe('SELECT');
  });

  test('原生 select 未匹配返回可用选项', async () => {
    document.body.innerHTML = '<select id="s"><option value="a">Apple</option></select>';
    const r = await selectDropdown('#s', 'NotFound');
    expect(r.success).toBe(false);
    expect(r.availableOptions).toContain('Apple');
  });

  test('触发器未找到失败', async () => {
    const r = await selectDropdown('#missing', 'x');
    expect(r.success).toBe(false);
    expect(r.error).toContain('触发器');
  });

  test('自定义下拉匹配选项', async () => {
    document.body.innerHTML = `
      <div id="trigger">Choose</div>
      <ul id="opts"><li>Red</li><li>Blue</li></ul>
    `;
    const r = await selectDropdown('#trigger', 'Blue', '#opts', 1000);
    expect(r.success).toBe(true);
    expect(r.message).toContain('Blue');
  });
});

describe('manageStorage - 存储管理', () => {
  test('set/get/remove 流程', () => {
    expect(manageStorage({ action: 'set', key: 'k', value: 'v' }).success).toBe(true);
    expect(manageStorage({ action: 'get', key: 'k' }).value).toBe('v');
    expect(manageStorage({ action: 'remove', key: 'k' }).success).toBe(true);
    expect(manageStorage({ action: 'get', key: 'k' }).value).toBeNull();
  });

  test('get 无 key 返回所有', () => {
    manageStorage({ action: 'set', key: 'a', value: '1' });
    manageStorage({ action: 'set', key: 'b', value: '2' });
    const r = manageStorage({ action: 'get' });
    expect(r.data.a).toBe('1');
    expect(r.data.b).toBe('2');
  });

  test('set 缺少 key/value 失败', () => {
    expect(manageStorage({ action: 'set', key: 'k' }).success).toBe(false);
  });

  test('clear 清空', () => {
    manageStorage({ action: 'set', key: 'k', value: 'v' });
    expect(manageStorage({ action: 'clear' }).success).toBe(true);
    expect(manageStorage({ action: 'get', key: 'k' }).value).toBeNull();
  });

  test('session 存储', () => {
    expect(manageStorage({ action: 'set', storage: 'session', key: 's', value: '1' }).success).toBe(true);
    expect(manageStorage({ action: 'get', storage: 'session', key: 's' }).value).toBe('1');
  });

  test('未知操作失败', () => {
    expect(manageStorage({ action: 'weird' }).success).toBe(false);
  });
});

describe('clickElement - 选择器点击', () => {
  test('点击命中元素', async () => {
    document.body.innerHTML = '<button id="b">X</button>';
    let clicked = false;
    document.getElementById('b').addEventListener('click', () => { clicked = true; });
    const r = await clickElement('#b', 0, 0);
    expect(r.success).toBe(true);
    expect(clicked).toBe(true);
  });

  test('剥离包装引号', async () => {
    document.body.innerHTML = '<button id="b">Y</button>';
    const r = await clickElement('"#b"', 0, 0);
    expect(r.success).toBe(true);
  });

  test('未找到元素失败', async () => {
    const r = await clickElement('#missing', 0, 0);
    expect(r.success).toBe(false);
    expect(r.error).toContain('未找到');
  });

  test('空选择器失败', async () => {
    const r = await clickElement('', 0, 0);
    expect(r.success).toBe(false);
  });
});
