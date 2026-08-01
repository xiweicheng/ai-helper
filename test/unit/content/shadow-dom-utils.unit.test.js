// @vitest-environment jsdom
// shadow-dom-utils 单元测试：深度查询穿透 Shadow DOM / iframe（jsdom 环境）
import { describe, test, expect, beforeEach } from 'vitest';
import {
  deepQuerySelector,
  deepQuerySelectorAll,
  hasShadowDom,
  hasIframe,
} from '../../../src/content/shadow-dom-utils.js';

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('deepQuerySelector - 单元素深度查询', () => {
  test('普通 DOM 直接命中', () => {
    document.body.innerHTML = '<div id="target"></div>';
    expect(deepQuerySelector('#target')).not.toBeNull();
    expect(deepQuerySelector('#missing')).toBeNull();
  });

  test('穿透 Shadow DOM 找到内部元素', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button id="inner">x</button>';
    expect(deepQuerySelector('#inner')).not.toBeNull();
  });

  test('Shadow DOM 内元素优先于文档同名元素', () => {
    // 文档有一个 #dup，shadow 内也有 #dup，应优先返回 shadow 内的
    document.body.innerHTML = '<span id="dup">doc</span>';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<span id="dup">shadow</span>';
    const el = deepQuerySelector('#dup');
    expect(el.textContent).toBe('shadow');
  });

  test('maxDepth 截断时返回 null', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<p id="deep">nested</p>';
    // 深度 0 直接超过 maxDepth=0
    expect(deepQuerySelector('#deep', document, 0)).toBeNull();
  });

  test('不可访问的 iframe 不抛错', () => {
    // jsdom 默认不加载 iframe 内容，contentDocument 为 null
    document.body.innerHTML = '<iframe id="f" src="about:blank"></iframe>';
    expect(() => deepQuerySelector('#not-exist')).not.toThrow();
    expect(deepQuerySelector('#not-exist')).toBeNull();
  });
});

describe('deepQuerySelectorAll - 多元素深度查询', () => {
  test('收集文档内所有匹配元素', () => {
    document.body.innerHTML = '<button>a</button><button>b</button><span>x</span>';
    const buttons = deepQuerySelectorAll('button');
    expect(buttons.length).toBe(2);
  });

  test('穿透 Shadow DOM 收集', () => {
    document.body.innerHTML = '<button>doc</button>';
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button>shadow</button>';
    const buttons = deepQuerySelectorAll('button');
    expect(buttons.length).toBe(2);
  });

  test('去重：同一元素不重复', () => {
    document.body.innerHTML = '<div class="x"></div>';
    const result = deepQuerySelectorAll('.x');
    expect(result.length).toBe(1);
  });

  test('maxDepth 截断返回空数组', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button>shadow</button>';
    expect(deepQuerySelectorAll('button', document, 0)).toEqual([]);
  });
});

describe('hasShadowDom / hasIframe 检测', () => {
  test('无 shadow root 返回 false', () => {
    document.body.innerHTML = '<div><span>plain</span></div>';
    expect(hasShadowDom()).toBe(false);
  });

  test('有 shadow root 返回 true', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.attachShadow({ mode: 'open' });
    expect(hasShadowDom()).toBe(true);
  });

  test('无 iframe 返回 false', () => {
    document.body.innerHTML = '<div>no iframe</div>';
    expect(hasIframe()).toBe(false);
  });

  test('有 iframe 返回 true', () => {
    document.body.innerHTML = '<iframe src="about:blank"></iframe>';
    expect(hasIframe()).toBe(true);
  });
});
