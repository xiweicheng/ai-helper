// debugger-rules 单元测试：debug_page 工具的纯规则函数（零依赖，node 环境）
// 覆盖：受限页面判定、按键规格解析、截断、网络条目序列化、base64 解码
import { describe, test, expect } from 'vitest';
import {
  RESTRICTED_PREFIXES,
  RESTRICTED_HOSTS,
  isRestrictedUrl,
  KEY_MODIFIERS,
  SPECIAL_KEYS,
  parseKeySpec,
  truncate,
  serializeNetworkEntry,
  decodeBase64Utf8,
  shouldFetchBody,
  SKIP_BODY_RESOURCE_TYPES,
  TEXT_BODY_MIME_PREFIXES,
} from '../../src/background/debugger/debugger-rules.js';

describe('isRestrictedUrl 受限页面判定', () => {
  test('空值视为受限（无有效页面可附着）', () => {
    expect(isRestrictedUrl('')).toBe(true);
    expect(isRestrictedUrl(null)).toBe(true);
    expect(isRestrictedUrl(undefined)).toBe(true);
  });

  test.each([
    ['chrome://settings', 'chrome://'],
    ['chrome://extensions/', 'chrome://'],
    ['chrome-extension://abc/options.html', 'chrome-extension://'],
    ['chrome-search://local-ntp/local-ntp.html', 'chrome-search://'],
    ['chrome-error://chromewebdata/', 'chrome-error://'],
    ['edge://settings', 'edge://'],
    ['about:blank', 'about:'],
    ['view-source:https://example.com', 'view-source:'],
    ['devtools://devtools/bundled/inspector.html', 'devtools://'],
    ['https://chrome.google.com/webstore', '旧版商店'],
    ['https://chromewebstore.google.com/category/extensions', '新版商店'],
  ])('受限前缀 %s（%s）返回 true', (url) => {
    expect(isRestrictedUrl(url)).toBe(true);
  });

  test.each([
    'https://example.com',
    'http://localhost:3000/page',
    'https://developer.chrome.com/docs',
    'file:///Users/me/a.html',
    'https://example.com/path?url=chrome://settings',
  ])('普通页面 %s 返回 false（含仅 query 中出现受限前缀的情况）', (url) => {
    expect(isRestrictedUrl(url)).toBe(false);
  });

  test('前缀匹配必须从 URL 起始位置开始', () => {
    expect(isRestrictedUrl('https://evil.com/?next=edge://settings')).toBe(false);
    expect(isRestrictedUrl(' https://example.com')).toBe(false);
  });

  test('RESTRICTED_PREFIXES 为非空字符串数组且无重复', () => {
    expect(RESTRICTED_PREFIXES.length).toBeGreaterThan(0);
    expect(new Set(RESTRICTED_PREFIXES).size).toBe(RESTRICTED_PREFIXES.length);
  });

  test('RESTRICTED_HOSTS 包含新旧两个商店域名', () => {
    expect(RESTRICTED_HOSTS).toEqual(expect.arrayContaining([
      'chrome.google.com', 'chromewebstore.google.com',
    ]));
  });

  test.each([
    'https://chrome.google.com/webstore',
    'https://chrome.google.com/',
    'https://chrome.google.com',
    'https://chrome.google.com?foo=1',
    'https://chrome.google.com#bar',
    'https://chrome.google.com:443/webstore',
    'https://chromewebstore.google.com/category/extensions',
  ])('主机边界匹配：%s 仍被识别为受限', (url) => {
    expect(isRestrictedUrl(url)).toBe(true);
  });

  test.each([
    // 前缀相似但主机不同的阴黟域名不应被误拦
    'https://chrome.google.com.evil.com/phish',
    'https://chromewebstore.google.com.attacker.io/x',
    'https://chrome.google.commercial.example/',
  ])('主机边界匹配：形似但实际不同的域名 %s 不被误拦', (url) => {
    expect(isRestrictedUrl(url)).toBe(false);
  });
});

describe('parseKeySpec 按键规格解析', () => {
  test('特殊键 Enter/Tab/Escape 返回正确键码与物理码', () => {
    expect(parseKeySpec('Enter')).toEqual({ key: 'Enter', code: 'Enter', keyCode: 13, modifiers: 0 });
    expect(parseKeySpec('Tab')).toEqual({ key: 'Tab', code: 'Tab', keyCode: 9, modifiers: 0 });
    expect(parseKeySpec('Escape')).toEqual({ key: 'Escape', code: 'Escape', keyCode: 27, modifiers: 0 });
    expect(parseKeySpec('Delete').keyCode).toBe(46);
    expect(parseKeySpec('Backspace').keyCode).toBe(8);
    expect(parseKeySpec('Space').keyCode).toBe(32);
  });

  test('Esc 归一化为 Escape', () => {
    const spec = parseKeySpec('Esc');
    expect(spec.key).toBe('Escape');
    expect(spec.code).toBe('Escape');
  });

  test('方向键', () => {
    expect(parseKeySpec('ArrowLeft').keyCode).toBe(37);
    expect(parseKeySpec('ArrowUp').keyCode).toBe(38);
    expect(parseKeySpec('ArrowRight').keyCode).toBe(39);
    expect(parseKeySpec('ArrowDown').keyCode).toBe(40);
  });

  test('F1-F12 功能键键码连续（112-123）', () => {
    expect(parseKeySpec('F1')).toEqual({ key: 'F1', code: 'F1', keyCode: 112, modifiers: 0 });
    expect(parseKeySpec('F12')).toEqual({ key: 'F12', code: 'F12', keyCode: 123, modifiers: 0 });
    expect(parseKeySpec('F5').keyCode).toBe(116);
  });

  test('单字母：key 保留原样，code 为 KeyX，keyCode 为大写 ASCII', () => {
    expect(parseKeySpec('a')).toEqual({ key: 'a', code: 'KeyA', keyCode: 65, modifiers: 0 });
    expect(parseKeySpec('Z')).toEqual({ key: 'Z', code: 'KeyZ', keyCode: 90, modifiers: 0 });
  });

  test('数字键：code 为 DigitN', () => {
    expect(parseKeySpec('0')).toEqual({ key: '0', code: 'Digit0', keyCode: 48, modifiers: 0 });
    expect(parseKeySpec('9').keyCode).toBe(57);
  });

  test('非字母数字的单字符（如符号）code 为空，keyCode 取 ASCII', () => {
    const spec = parseKeySpec('/');
    expect(spec).not.toBeNull();
    expect(spec.code).toBe('');
    expect(spec.keyCode).toBe(47); // 现有实现按 ASCII 映射（Chrome 按 key 文本派发，符号仍可工作）
  });

  test('Control+a / Ctrl+a 组合键带 Alt 位掩码之外的修饰符', () => {
    const spec = parseKeySpec('Control+a');
    expect(spec.modifiers).toBe(KEY_MODIFIERS.Control);
    expect(spec.key).toBe('a');
    expect(spec.keyCode).toBe(65);

    const alias = parseKeySpec('Ctrl+a');
    expect(alias.modifiers).toBe(2);
  });

  test('Cmd / Command / Meta 三种写法归一为位掩码 4', () => {
    expect(parseKeySpec('Cmd+c').modifiers).toBe(4);
    expect(parseKeySpec('Command+c').modifiers).toBe(4);
    expect(parseKeySpec('Meta+c').modifiers).toBe(4);
  });

  test('Shift 修饰符位掩码为 8，Alt 为 1', () => {
    expect(parseKeySpec('Shift+Tab').modifiers).toBe(8);
    expect(parseKeySpec('Alt+Tab').modifiers).toBe(1);
  });

  test('多修饰符位掩码按位或（Ctrl+Shift+Enter = 2|8 = 10）', () => {
    const spec = parseKeySpec('Ctrl+Shift+Enter');
    expect(spec.modifiers).toBe(10);
    expect(spec.key).toBe('Enter');
    expect(spec.keyCode).toBe(13);
  });

  test('支持带空格的写法（" Control + a "）', () => {
    const spec = parseKeySpec(' Control + a ');
    expect(spec.modifiers).toBe(2);
    expect(spec.key).toBe('a');
  });

  test.each([
    [''],
    ['Foo+Enter'],         // 非法修饰符
    ['Bogus+a'],
    ['Control+'],          // 缺主键
    ['SpecialKey'],        // 多字符且非特殊键
    ['ab'],                // 多字符
    [null],
    [undefined],
  ])('非法输入 %s 返回 null', (input) => {
    expect(parseKeySpec(input)).toBeNull();
  });

  test('SPECIAL_KEYS 包含全部导航与功能键', () => {
    ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete', 'Space',
     'Home', 'End', 'PageUp', 'PageDown', 'Insert',
     'ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].forEach(k => {
      expect(SPECIAL_KEYS[k], `缺少特殊键 ${k}`).toBeDefined();
    });
  });
});

describe('truncate 字符串截断', () => {
  test('未超长时原样返回', () => {
    expect(truncate('hello', 10)).toBe('hello');
    expect(truncate('', 5)).toBe('');
    expect(truncate('abc', 3)).toBe('abc'); // 恰好等长不截断
  });

  test('超长时截断并附加被截字符数', () => {
    const result = truncate('1234567890', 5);
    expect(result.startsWith('12345')).toBe(true);
    expect(result).toContain('[truncated 5 chars]');
    expect(result.length).toBe(5 + '...[truncated 5 chars]'.length);
  });

  test.each([[null], [undefined], [123], [{}]])
  ('非字符串输入原样返回（%s）', (input) => {
    expect(truncate(input, 10)).toBe(input);
  });
});

describe('serializeNetworkEntry 网络条目序列化', () => {
  test('保留 headers 与 startedAt（对调试场景有直接价值），仅剥离内部 requestId', () => {
    const out = serializeNetworkEntry({
      requestId: '1234',
      url: 'https://api.example.com/v1/data',
      method: 'POST',
      resourceType: 'fetch',
      status: 200,
      mimeType: 'application/json',
      requestHeaders: { Authorization: 'Bearer x' },
      responseHeaders: { 'content-type': 'application/json' },
      postData: '{"a":1}',
      body: '{"ok":true}',
      bodyTruncated: false,
      startedAt: 12345.6,
    });
    expect(out).toEqual({
      url: 'https://api.example.com/v1/data',
      method: 'POST',
      resourceType: 'fetch',
      status: 200,
      mimeType: 'application/json',
      requestHeaders: { Authorization: 'Bearer x' },
      responseHeaders: { 'content-type': 'application/json' },
      postData: '{"a":1}',
      body: '{"ok":true}',
      bodyTruncated: false,
      startedAt: 12345.6,
    });
    expect(out).not.toHaveProperty('requestId');
  });

  test('缺失字段为 undefined 时正常输出', () => {
    const out = serializeNetworkEntry({});
    expect(out).toEqual({
      url: undefined, method: undefined, resourceType: undefined,
      status: undefined, mimeType: undefined,
      requestHeaders: undefined, responseHeaders: undefined,
      postData: undefined, body: undefined, bodyTruncated: undefined,
      startedAt: undefined,
    });
  });
});

describe('shouldFetchBody 响应体拉取过滤', () => {
  test('二进制资源类型（Image/Font/Media）直接跳过', () => {
    expect(shouldFetchBody({ resourceType: 'Image', mimeType: 'image/png' })).toBe(false);
    expect(shouldFetchBody({ resourceType: 'Font', mimeType: 'font/woff2' })).toBe(false);
    expect(shouldFetchBody({ resourceType: 'Media', mimeType: 'video/mp4' })).toBe(false);
  });

  test('文本类 mimeType（json/xml/javascript/text）允许拉取', () => {
    expect(shouldFetchBody({ resourceType: 'XHR', mimeType: 'application/json' })).toBe(true);
    expect(shouldFetchBody({ resourceType: 'Document', mimeType: 'text/html' })).toBe(true);
    expect(shouldFetchBody({ resourceType: 'Script', mimeType: 'application/javascript' })).toBe(true);
    expect(shouldFetchBody({ resourceType: 'XHR', mimeType: 'application/xml' })).toBe(true);
  });

  test('mimeType 未知时保守拉取（部分请求在 loadingFinished 时未回填）', () => {
    expect(shouldFetchBody({ resourceType: 'XHR', mimeType: '' })).toBe(true);
    expect(shouldFetchBody({ resourceType: 'Fetch' })).toBe(true);
  });

  test('非文本类 mimeType（如 application/octet-stream）不拉取', () => {
    expect(shouldFetchBody({ resourceType: 'XHR', mimeType: 'application/octet-stream' })).toBe(false);
    expect(shouldFetchBody({ resourceType: 'Document', mimeType: 'application/pdf' })).toBe(false);
  });

  test('null / undefined entry 不拉取', () => {
    expect(shouldFetchBody(null)).toBe(false);
    expect(shouldFetchBody(undefined)).toBe(false);
  });

  test('SKIP_BODY_RESOURCE_TYPES / TEXT_BODY_MIME_PREFIXES 导出为非空集合', () => {
    expect(SKIP_BODY_RESOURCE_TYPES.size).toBeGreaterThan(0);
    expect(TEXT_BODY_MIME_PREFIXES.length).toBeGreaterThan(0);
  });
});

describe('decodeBase64Utf8', () => {
  test('ASCII 文本正确解码', () => {
    expect(decodeBase64Utf8(btoa('hello world'))).toBe('hello world');
  });

  test('UTF-8 多字节字符（中文）正确解码', () => {
    const encoded = btoa(unescape(encodeURIComponent('你好，debugger')));
    expect(decodeBase64Utf8(encoded)).toBe('你好，debugger');
  });

  test('JSON 响应体可解码后解析', () => {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify({ 名称: '测试', ok: true }))));
    const decoded = decodeBase64Utf8(encoded);
    expect(JSON.parse(decoded)).toEqual({ 名称: '测试', ok: true });
  });
});
