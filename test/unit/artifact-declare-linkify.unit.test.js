// @vitest-environment jsdom
// 产物声明解析 / 合并 / linkify 单元测试
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// mock 工作目录根路径
vi.mock('../../src/side_panel/workspace-manager.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getWorkspaceRoot: async () => '/Users/test/.ai-helper-agent/workspace',
    getAgentStatusDetail: async () => (globalThis.__mockAgentDown ? null : { workdir: '/Users/test/.ai-helper-agent/workspace' }),
    getHomeDir: async () => globalThis.__mockHomeDir || null,
  };
});

const noop = () => {};
globalThis.chrome = {
  storage: { local: { get: noop, set: noop }, onChanged: { addListener: noop } },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: noop,
    onMessage: { addListener: noop },
    getContexts: noop,
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
  },
  scripting: { executeScript: noop },
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop },
};

let parseDeclaredArtifactsFromText, mergeDeclaredArtifacts, buildArtifactsForMessage;
let extractPathCandidates, applyFilePathLinks, bindFileLinkDelegate;
beforeAll(async () => {
  const mod = await import('../../src/side_panel/artifacts-manager.js');
  parseDeclaredArtifactsFromText = mod.parseDeclaredArtifactsFromText;
  mergeDeclaredArtifacts = mod.mergeDeclaredArtifacts;
  buildArtifactsForMessage = mod.buildArtifactsForMessage;
  const md = await import('../../src/side_panel/markdown-render.js');
  extractPathCandidates = md.extractPathCandidates;
  applyFilePathLinks = md.applyFilePathLinks;
  bindFileLinkDelegate = md.bindFileLinkDelegate;
});

describe('parseDeclaredArtifactsFromText', () => {
  test('解析带/不带说明', () => {
    const r = parseDeclaredArtifactsFromText('[[artifact:a.xlsx|报表]]\n[[artifact:b.py]]');
    expect(r).toEqual([{ path: 'a.xlsx', note: '报表' }, { path: 'b.py', note: '' }]);
  });
  test('过滤变量引用路径', () => {
    expect(parseDeclaredArtifactsFromText('[[artifact:$OUT/x.csv]]')).toEqual([]);
    expect(parseDeclaredArtifactsFromText('[[artifact:%TEMP%/y.log]]')).toEqual([]);
  });
  test('无标记返回空数组', () => {
    expect(parseDeclaredArtifactsFromText('普通回答')).toEqual([]);
    expect(parseDeclaredArtifactsFromText(null)).toEqual([]);
  });
});

describe('mergeDeclaredArtifacts', () => {
  test('声明相对路径与静态绝对路径尾段一致 → 判为同一文件只留一条并补 note', () => {
    const staticA = [{ path: '/ws/a.xlsx', fileName: 'a.xlsx', action: 'typeCreate' }];
    const merged = mergeDeclaredArtifacts(staticA, [{ path: 'a.xlsx', note: '报表' }]);
    expect(merged.length).toBe(1);
    expect(merged[0].source).toBe('static');
    expect(merged[0].note).toBe('报表');
  });
  test('完全相同规范化路径只留一条', () => {
    const staticA = [{ path: 'a.xlsx', fileName: 'a.xlsx', action: 'typeCreate' }];
    const merged = mergeDeclaredArtifacts(staticA, [{ path: './a.xlsx', note: 'x' }]);
    expect(merged.filter(m => m.fileName === 'a.xlsx').length).toBe(1);
  });
  test('声明项带 source=declared 与 fileName', () => {
    const merged = mergeDeclaredArtifacts([], [{ path: 'out/r.md', note: '报告' }]);
    expect(merged[0].source).toBe('declared');
    expect(merged[0].fileName).toBe('r.md');
    expect(merged[0].action).toBe('typeCreate');
  });
});

describe('buildArtifactsForMessage', () => {
  test('合并静态与声明', () => {
    const log = [{ id: 'x', nodeType: 'tool_exec', status: 'success', action: { name: 'agent_file', params: { action: 'write', path: '/ws/gen.py' } }, observation: JSON.stringify({ path: '/ws/gen.py' }) }];
    const merged = buildArtifactsForMessage(log, '结果\n[[artifact:/ws/report.xlsx|报表]]');
    expect(merged.some(a => a.path === '/ws/report.xlsx' && a.source === 'declared')).toBe(true);
  });
});

describe('system prompt artifact-declaration injection', () => {
  const src = readFileSync(resolve(process.cwd(), 'src/side_panel/utils.js'), 'utf8');
  test('zh + en 声明指引键齐备', () => {
    expect(src).toContain("artifactDeclTitle: '##");
    expect(src).toContain('artifactDeclDesc:');
    expect((src.match(/artifactDeclTitle:/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  test('getSystemPrompt 两个返回分支都拼接 artifactDeclSection', () => {
    expect(src).toContain('${artifactDeclSection}');
    expect((src.match(/\$\{artifactDeclSection\}/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});

describe('declared-artifact wiring at 3 sites', () => {
  const cm = readFileSync(resolve(process.cwd(), 'src/side_panel/chat-manager.js'), 'utf8');
  const cs = readFileSync(resolve(process.cwd(), 'src/side_panel/chat-streaming.js'), 'utf8');
  test('chat-manager import buildArtifactsForMessage/parse/merge', () => {
    expect(cm).toMatch(/import \{[^}]*buildArtifactsForMessage[^}]*\} from '\.\/artifacts-manager\.js'/);
    expect(cm).toMatch(/import \{[^}]*mergeDeclaredArtifacts[^}]*\} from '\.\/artifacts-manager\.js'/);
  });
  test('addMessage 用 buildArtifactsForMessage 并持久化 declared', () => {
    expect(cm).toContain('buildArtifactsForMessage(executionLog, content)');
    expect(cm).toContain('dataset.declaredArtifacts');
  });
  test('rebindArtifactsButton 合并 dataset.declaredArtifacts', () => {
    expect(cm).toContain('mergeDeclaredArtifacts(artifacts0, declared)');
  });
  test('chat-streaming finalize 用 buildArtifactsForMessage 并持久化', () => {
    expect(cs).toContain('buildArtifactsForMessage(executionLog, content)');
    expect(cs).toContain('dataset.declaredArtifacts');
  });
});

describe('extractPathCandidates', () => {
  test('提取绝对/相对/带扩展名路径', () => {
    const c = extractPathCandidates('见 /ws/out/report_2026-10-20.xlsx 与 out.csv，还有 ~/x.md');
    expect(c).toContain('/ws/out/report_2026-10-20.xlsx');
    expect(c).toContain('out.csv');
    expect(c).toContain('~/x.md');
  });
  test('不提取 URL 与纯目录', () => {
    const c = extractPathCandidates('访问 https://a.com/b.png 和目录 src/ 结束');
    expect(c.some(x => x.includes('https://'))).toBe(false);
    expect(c.some(x => x === 'src/')).toBe(false);
  });
});

describe('applyFilePathLinks', () => {
  test('把有效产物路径包成 .chat-file-link 且 data-path 转义', async () => {
    globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ success: true, results: {} });
    const el = document.createElement('div');
    el.innerHTML = '<div class="markdown-body"><p>输出文件 out/report.xlsx 已生成</p></div>';
    await applyFilePathLinks(el, ['out/report.xlsx']);
    const link = el.querySelector('.chat-file-link');
    expect(link).toBeTruthy();
    expect(link.getAttribute('data-path')).toBe('out/report.xlsx');
  });
  test('URL 不被转换', async () => {
    globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ success: true, results: {} });
    const el = document.createElement('div');
    el.innerHTML = '<div class="markdown-body"><p>见 https://x.com/a.png</p></div>';
    await applyFilePathLinks(el, []);
    expect(el.querySelector('.chat-file-link')).toBeNull();
  });
  test('非可信路径 fail-closed：目录外/解析失败不转链接', async () => {
    // CHECK_FILES_EXIST 即便返回 fail-open 的 true，路径不在可信集且无法解析到工作目录内时不应转链接
    globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ success: true, results: { '/etc/passwd': true } });
    const el = document.createElement('div');
    el.innerHTML = '<div class="markdown-body"><p>参考 /etc/passwd 配置</p></div>';
    await applyFilePathLinks(el, []);
    expect(el.querySelector('.chat-file-link')).toBeNull();
  });
  test('代码块内的路径不转链接', async () => {
    globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ success: true, results: {} });
    const el = document.createElement('div');
    el.innerHTML = '<div class="markdown-body"><pre><code>python out/report.xlsx</code></pre></div>';
    await applyFilePathLinks(el, ['out/report.xlsx']);
    expect(el.querySelector('.chat-file-link')).toBeNull();
  });
  test('Agent 不可达时非可信路径 fail-closed 不转链接', async () => {
    // 曾连过→缓存 root 存在，但实时探测返回 null（Agent 掉线），即使 CHECK_FILES_EXIST fail-open 返回 true 也不应转链
    globalThis.__mockAgentDown = true;
    globalThis.chrome.runtime.sendMessage = () => Promise.resolve({ success: true, results: { '/Users/test/.ai-helper-agent/workspace/x.xlsx': true } });
    const el = document.createElement('div');
    el.innerHTML = '<div class="markdown-body"><p>产出 x.xlsx 文件</p></div>';
    await applyFilePathLinks(el, []);
    globalThis.__mockAgentDown = false;
    expect(el.querySelector('.chat-file-link')).toBeNull();
  });
  test('extractPathCandidates 不因通配点跨空格切词', () => {
    for (const t of extractPathCandidates('see aXb.pdf file here')) expect(t).not.toContain(' ');
    for (const t of extractPathCandidates('value is 3.5 and 4.6')) expect(t).not.toMatch(/\s/);
  });
});
