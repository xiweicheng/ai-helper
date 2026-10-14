// 压缩注入单点收敛守卫：三条发送链路必须共用 context-usage 的注入出口
// 背景：侧边栏存在多条发送链路（chat-manager / index / prompt-manager），
// 各自内联同一段「压缩摘要注入 system prompt」逻辑时，任一侧改动都会静默漂移
// （参见既有教训：多发送链路上下文注入必须对齐）。
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, test, expect } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(join(root, p), 'utf-8');

const SEND_CHAINS = [
  'src/side_panel/chat-manager.js',
  'src/side_panel/index.js',
  'src/side_panel/prompt-manager.js',
];

describe('压缩注入单点收敛', () => {
  test('shared 导出 applyCompactionInjection', () => {
    expect(read('src/shared/context-usage.js')).toContain('export function applyCompactionInjection');
  });

  test('三条发送链路都调用共享注入出口', () => {
    for (const file of SEND_CHAINS) {
      expect(read(file), `${file} 未接入 applyCompactionInjection`).toContain('applyCompactionInjection(');
    }
  });

  test('发送链路不再内联 appendCompactionToSystemPrompt（只有共享模块与预览可用）', () => {
    for (const file of SEND_CHAINS) {
      const src = read(file);
      expect(src, `${file} 仍内联拼接压缩摘要`).not.toContain('appendCompactionToSystemPrompt');
    }
  });

  test('三条发送链路都挂自动压缩前置钩子（复用同一压缩内核）', () => {
    for (const file of SEND_CHAINS) {
      const src = read(file);
      expect(src, `${file} 缺 runAutoCompactionBeforeSend`).toContain('runAutoCompactionBeforeSend({');
      expect(src, `${file} 缺占用比取值器`).toContain('computeCurrentUsage().usage?.ratio');
      expect(src, `${file} 未复用 runCompaction`).toContain('compact: runCompaction');
    }
  });

  test('手动与自动压缩共用单一内核（triggerCompaction 仅薄壳）', () => {
    const src = read('src/side_panel/context-indicator.js');
    expect(src).toContain('export async function runCompaction(');
    expect(src).toContain('export async function triggerCompaction()');
    expect(src).toContain('await runCompaction({ silent: false })');
  });
});

// 摘要沉淀链路守卫：侧边栏带去重锚点 → background 按开关沉淀 → memoryId 回传，
// 三段任缺其一都会退化成「每次压缩堆一条摘要」或「沉淀永不生效」。
describe('压缩摘要沉淀链路接线', () => {
  test('background 独立模块导出 persistCompactionSummary', () => {
    expect(read('src/background/compaction-memory.js')).toContain('export async function persistCompactionSummary');
  });

  test('压缩处理器按开关沉淀并把 memoryId 回传侧边栏', () => {
    const src = read('src/background/index.js');
    expect(src).toContain("import { persistCompactionSummary } from './compaction-memory.js'");
    expect(src).toContain('persistSummaryToMemory !== false');
    expect(src).toContain('result.memoryId = persisted.memoryId;');
  });

  test('侧边栏压缩请求带去重锚点（memoryId / revision / compressedCount）', () => {
    const src = read('src/side_panel/context-indicator.js');
    expect(src).toContain('memoryId: old?.memoryId || null');
    expect(src).toContain('resp.memoryId || old?.memoryId');
    expect(src).toContain('revision: (old?.revision || 0) + 1');
  });
});

// 开关状态回填守卫：两个开关在 DOMContentLoaded 时只能拿到 state 的默认值
// （autoCompaction 默认 false / persistSummaryToMemory 默认 true），storage 里的真实值
// 要等 GET_CHAT_CONFIG 往返后才可用。若配置加载完成后不回填，刷新必然回弹成默认值。
describe('压缩开关状态回填接线', () => {
  const loadedBlock = () => {
    const src = read('src/side_panel/index.js');
    const matched = src.match(/loadChatConfig\(\)\.then\(\(\) => \{([\s\S]*?)\n\}\);/);
    if (!matched) throw new Error('未找到 loadChatConfig().then 初始化块');
    return matched[1];
  };

  test('配置加载完成后回填两个开关勾选态', () => {
    const block = loadedBlock();
    expect(block).toContain('syncAutoCompactToggle();');
    expect(block).toContain('syncPersistSummaryToggle();');
  });

  test('回填函数以 storage 配置为唯一真源（不读 DOM 现状）', () => {
    const src = read('src/side_panel/index.js');
    expect(src).toContain('btn.checked = state.chatConfig.autoCompaction === true;');
    expect(src).toContain('btn.checked = state.chatConfig.persistSummaryToMemory !== false;');
  });
});
