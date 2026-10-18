// @vitest-environment jsdom
// SEC-10 简单白名单守卫：inject_css 的 style/inline 注入前过滤危险 CSS 构造，不加确认。
//
// 背景（docs/AUDIT_STATUS.md SEC-10）：advanced-tools.js `injectCss` 的 style 分支把 CSS
// 原样塞进宿主 <head>——global 子分支整段不过滤、scoped 子分支声明体里的 url() 逐字保留。
// 因该工具 requiresConfirmation:false 且确认闸门又被 toolConfirmationEnabled 总开关 AND 门控
// （react-loop.js:1719，用户关开关即失效），故不依赖确认，改在执行内部做恒定生效的属性净化。
//
// 只拦"可造成外链信标 / 属性选择器外泄 / 脚本执行"的构造（@import、url()、expression()、
// -moz-element()、behavior、-moz-binding），保留正当视觉改样式（颜色/字号/背景色/隐藏/定位）。
// highlight 模式在 dispatch 层走 highlightText、不经 injectCss，本改动不触碰。
import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { injectCss, sanitizeInjectedCss } from '../../src/content/advanced-tools.js';

const SRC = readFileSync(join(process.cwd(), 'src/content/advanced-tools.js'), 'utf8');

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<div id="box"></div>';
});

describe('SEC-10 sanitizeInjectedCss 纯净化：危险构造剔除、正当样式保留', () => {
  test.each([
    ['@import url("http://evil/x.css");', '@import'],
    ['@import "http://evil/x.css";', '@import'],
    ['body{background:url(http://evil/px.png)}', 'url('],
    ['p{background:url("a.png")}', 'url('],
    ['div{width:expression(alert(1))}', 'expression('],
    ['div{behavior:url(x.htc)}', 'behavior'],
    ['div{-moz-binding:url(x.xml)}', '-moz-binding'],
    ['p{background:-moz-element(#secret)}', 'element('],
  ])('剔除危险构造：%s', (input, token) => {
    const out = sanitizeInjectedCss(input);
    expect(out.toLowerCase()).not.toContain(token.toLowerCase());
  });

  test('保留正当视觉样式（颜色/字号/背景色/隐藏/定位）', () => {
    const input = 'body{color:red;font-size:20px;background-color:#eee} .hdr{display:none} .x{position:relative}';
    const out = sanitizeInjectedCss(input);
    expect(out).toContain('color:red');
    expect(out).toContain('font-size:20px');
    expect(out).toContain('background-color:#eee');
    expect(out).toContain('display:none');
    expect(out).toContain('position:relative');
  });
});

describe('SEC-10 injectCss 三条分支都吃到净化后的 CSS', () => {
  test('global style：<style> 落地文本无 url/@import，正当属性保留', () => {
    const r = injectCss('body{background:url("http://evil/a.png");color:blue}', null, 'style');
    expect(r.success).toBe(true);
    expect(r.scoped).toBe(false);
    const style = document.head.querySelector('style[data-ai-helper="global"]');
    expect(style).not.toBeNull();
    expect(style.textContent.toLowerCase()).not.toContain('url(');
    expect(style.textContent.toLowerCase()).not.toContain('@import');
    expect(style.textContent).toContain('color:blue');
  });

  test('scoped style：声明体内 url 被剔除，wrapper 选择器前缀仍在', () => {
    const r = injectCss('@import url("evil"); p{background:url(x);font-weight:bold}', '#box', 'style');
    expect(r.success).toBe(true);
    expect(r.scoped).toBe(true);
    const style = document.head.querySelector('style[data-ai-helper="scoped"]');
    expect(style.textContent.toLowerCase()).not.toContain('url(');
    expect(style.textContent.toLowerCase()).not.toContain('@import');
    expect(style.textContent).toContain('font-weight:bold');
    expect(style.textContent).toMatch(/#ai-helper-scoped-style-\d+ p/);
  });

  test('inline：background 的 url 不被应用，正当属性照常应用', () => {
    const el = document.getElementById('box');
    const r = injectCss('background:url(http://evil/a.png);color:green', '#box', 'inline');
    expect(r.success).toBe(true);
    expect(el.style.color).toBe('green');
    expect(el.style.background).not.toContain('url');
    expect(el.style.backgroundImage).toBe('');
  });
});

describe('SEC-10 源码接线：入口统一净化、函数已导出', () => {
  test('injectCss 在入口对 css 调用 sanitizeInjectedCss（覆盖 style+inline）', () => {
    expect(SRC).toMatch(/css\s*=\s*sanitizeInjectedCss\(\s*css\s*\)/);
  });

  test('sanitizeInjectedCss 为导出的函数', () => {
    expect(typeof sanitizeInjectedCss).toBe('function');
  });
});
