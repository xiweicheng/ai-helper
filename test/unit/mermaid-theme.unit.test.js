// @vitest-environment jsdom
// Task 11：markdown/mermaid 主题联动逻辑测试
// 覆盖：① mermaidThemeConfig 随生效主题映射 dark/default
//      ② rerenderMermaidForTheme 从 data-raw-code 恢复原始代码并按新主题重渲染
//      ③ mermaid 未加载时安全返回  ④ 重渲染失败保留错误提示不抛异常
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

let mermaidThemeConfig;
let rerenderMermaidForTheme;

beforeEach(async () => {
  const loader = await import('../../src/side_panel/libs-loader.js');
  mermaidThemeConfig = loader.mermaidThemeConfig;
  const md = await import('../../src/side_panel/markdown-render.js');
  rerenderMermaidForTheme = md.rerenderMermaidForTheme;
  document.body.innerHTML = '';
});

afterEach(() => {
  delete window.mermaid;
  vi.restoreAllMocks();
});

describe('mermaidThemeConfig', () => {
  test("resolved='dark' → theme 'dark'", () => {
    expect(mermaidThemeConfig('dark').theme).toBe('dark');
  });
  test("resolved='light' → theme 'default'", () => {
    expect(mermaidThemeConfig('light').theme).toBe('default');
  });
  test('省略参数回退 getResolvedTheme()（jsdom 默认 light → default）', () => {
    expect(mermaidThemeConfig().theme).toBe('default');
  });
  test('保留 startOnLoad/securityLevel 基础配置', () => {
    const cfg = mermaidThemeConfig('dark');
    expect(cfg.startOnLoad).toBe(false);
    expect(cfg.securityLevel).toBe('loose');
  });
});

describe('rerenderMermaidForTheme', () => {
  test('mermaid 未加载时安全返回，不抛异常', async () => {
    document.body.innerHTML = '<div class="mermaid" data-raw-code="Z3JhcGgg</br>"></div>';
    await expect(rerenderMermaidForTheme()).resolves.toBeUndefined();
  });

  test('已渲染容器：移除旧 svg、恢复原始代码、按新配置重渲染并加控件', async () => {
    const raw = 'graph TD;A-->B;';
    const container = document.createElement('div');
    container.className = 'mermaid';
    container.setAttribute('data-raw-code', encodeURIComponent(raw));
    container.setAttribute('data-processed', 'true');
    container.innerHTML = '<svg id="old"><text>stale</text></svg>';
    document.body.appendChild(container);

    const initialize = vi.fn();
    const run = vi.fn(async ({ nodes }) => {
      // 模拟 mermaid 依当前 textContent（原始代码）渲染出新 svg
      nodes.forEach((el) => {
        expect(el.textContent).toBe(raw);
        el.innerHTML = '<svg class="new"></svg>';
      });
    });
    window.mermaid = { initialize, run };

    await rerenderMermaidForTheme();

    expect(initialize).toHaveBeenCalled();
    expect(run).toHaveBeenCalled();
    // 旧 svg 被替换为新渲染
    expect(container.querySelector('svg#old')).toBeNull();
    expect(container.querySelector('svg.new')).not.toBeNull();
    // 重渲染成功补上控制工具栏
    expect(container.querySelector('.mermaid-controls')).not.toBeNull();
    // data-raw-code 保留，供下一次切换继续复用
    expect(container.getAttribute('data-raw-code')).toBe(encodeURIComponent(raw));
  });

  test('未渲染容器（无 svg）跳过，不影响其他容器', async () => {
    const skip = document.createElement('div');
    skip.className = 'mermaid';
    skip.setAttribute('data-raw-code', encodeURIComponent('graph TD;'));
    // 无 svg 子节点 → 视为未渲染，应跳过
    document.body.appendChild(skip);

    const run = vi.fn();
    window.mermaid = { initialize: vi.fn(), run };

    await rerenderMermaidForTheme();
    expect(run).not.toHaveBeenCalled();
  });

  test('重渲染失败：保留错误提示容器，不抛出', async () => {
    const raw = 'this is not valid mermaid';
    const container = document.createElement('div');
    container.className = 'mermaid';
    container.setAttribute('data-raw-code', encodeURIComponent(raw));
    container.innerHTML = '<svg><text>old</text></svg>';
    document.body.appendChild(container);

    window.mermaid = {
      initialize: vi.fn(),
      run: vi.fn(async ({ nodes }) => { nodes.forEach(() => { throw new Error('Parse error: boom'); }); }),
    };

    await expect(rerenderMermaidForTheme()).resolves.toBeUndefined();
    // 失败后既无 svg 也无控件 → 落入友好错误 banner（div）
    expect(container.querySelector('svg')).toBeNull();
    expect(container.querySelector('.mermaid-controls')).toBeNull();
    expect(container.querySelector('div')).not.toBeNull();
  });
});
