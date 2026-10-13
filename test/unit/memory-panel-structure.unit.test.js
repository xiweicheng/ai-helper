// 记忆面板的结构契约钉：options.html 的 id 与中英 i18n 键必须齐备。
// 为什么单独钉：行为测试（memory-panel.unit.test.js）用的是自己拷贝的 DOM 夹具，
// 真实页面漏一个 id 它看不见；而中英漏键仓库没有 parity 测试，历史上靠自查。
import { readFileSync } from 'node:fs';
import { test, expect } from 'vitest';

const html = readFileSync(new URL('../../options.html', import.meta.url), 'utf8');
const zh = readFileSync(new URL('../../src/shared/locales/zh.js', import.meta.url), 'utf8');
const en = readFileSync(new URL('../../src/shared/locales/en.js', import.meta.url), 'utf8');

const IDS = ['memoryGate', 'memoryEnabled', 'memoryBaseUrlInput', 'memoryApiKeyInput',
  'memoryDimsInput', 'memoryPrefixInput', 'memoryModelInput', 'memoryLocalNotice',
  'memoryTestRow', 'memoryTestBtn', 'memoryTestResult', 'memorySaveBtn',
  'memoryReindexBtn', 'memoryStatus', 'memoryResult'];

test('记忆 Tab 已挂进导航与面板容器', () => {
  expect(html).toContain('class="tab-nav-btn" data-tab="memory" data-i18n="memoryPanel.tabTitle"');
  expect(html).toContain('<div class="tab-panel" data-tab="memory">');
  expect(html).toContain('</div><!-- /tab-memory -->');
});

test('面板需要的 id 逐个存在', () => {
  for (const id of IDS) expect(html, `options.html 缺 id=${id}`).toContain(`id="${id}"`);
});

test('模式单选组两个值齐备（与 agent 白名单逐字一致）', () => {
  expect(html).toContain('name="memoryEmbeddingMode" value="openai-compat"');
  expect(html).toContain('name="memoryEmbeddingMode" value="local"');
});

test('memoryPanel 命名空间中英键完全对齐', () => {
  const keys = (src, label) => {
    const block = src.match(/\n  memoryPanel: \{([\s\S]*?)\n  \},/);
    expect(block, `缺 memoryPanel 命名空间（${label}）`).toBeTruthy();
    return [...block[1].matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]).sort();
  };
  const zhKeys = keys(zh, 'zh');
  const enKeys = keys(en, 'en');
  expect(zhKeys.length).toBeGreaterThan(10);
  expect(enKeys).toEqual(zhKeys);
});
