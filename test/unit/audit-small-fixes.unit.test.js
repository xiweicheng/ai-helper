// @vitest-environment jsdom
// 审计小修的回归守卫（对应 docs/AUDIT_STATUS.md 的 SEC-13 / PERF-04 / PERF-05(NEW-03) / PERF-06(NEW-04)）
//
// 这四项都是"改法很轻、但很容易被改回去"的那类：
//   SEC-13  产物带 sourcemap = 公开源码；
//   PERF-04 滚动每帧直写 chrome.storage.local；
//   PERF-05 chat-export 顶层静态引 docx，抵消掉别处的 await import('docx')；
//   PERF-06 预览期 window 监听只注册从不移除，每预览一个文件泄漏一组。
// 因此本文件锁的是"接线形状"（源码 + 构建脚本 + 产物），并附两条契约测试
// 证明修法依赖的浏览器语义真的成立（signal 能摘监听、debounce 只落最后一次）。
import { describe, test, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const VITE_CONFIG = read('../../vite.config.js');
const RELEASE_YML = read('../../.github/workflows/release.yml');
const PACKAGE_JS = read('../../scripts/package.js');
const FIX_BUILD = read('../../scripts/fix-build.js');
const SIDE_INDEX = read('../../src/side_panel/index.js');
const WORKSPACE_PANEL = read('../../src/side_panel/workspace-panel.js');
const CHAT_MANAGER = read('../../src/side_panel/chat-manager.js');
const CHAT_STREAMING = read('../../src/side_panel/chat-streaming.js');
const CHAT_EXPORT = read('../../src/side_panel/chat-export.js');

const DIST_ROOT = resolve(__dirname, '../../dist');
const DIST_ASSETS = join(DIST_ROOT, 'assets');
const distReady = existsSync(DIST_ASSETS);

/**
 * dist 未构建时这五条以 skip 呈现（而不是 return 后报绿）。
 * 静默绿会让人以为产物级守卫在跑，而 NEW-06 恰恰只有产物级能抓到。
 */
function distFile(name) {
  return readFileSync(join(DIST_ASSETS, name), 'utf8');
}

function listDistJs() {
  return readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.js'));
}

describe('SEC-13：产物不得携带 sourcemap', () => {
  test('vite 构建关闭 sourcemap', () => {
    expect(VITE_CONFIG).toMatch(/sourcemap:\s*false/);
    expect(VITE_CONFIG).not.toMatch(/sourcemap:\s*true/);
  });

  test('Release 打包排除 .map 且带泄漏校验', () => {
    const zipLine = RELEASE_YML.match(/zip -r[^\n]*/g).join('\n');
    expect(zipLine).toMatch(/-x\s+"\*\.map"/);
    // 只排除不校验的话，改回 sourcemap:true 后仍会静默发布
    expect(RELEASE_YML).toMatch(/grep '\\\.map'/);
    expect(RELEASE_YML).toMatch(/exit 1/);
  });

  test('商店包脚本同样排除并复核归档内容', () => {
    expect(PACKAGE_JS).toMatch(/'-x',\s*'\*\.map'/);
    expect(PACKAGE_JS, '应用 unzip -l 复核归档内容').toMatch(/unzip/);
    expect(PACKAGE_JS).toMatch(/contains sourcemap files/);
  });

  test.skipIf(!distReady)('产物里不存在 .map（需先构建，未构建则 skip）', () => {
    const maps = readdirSync(DIST_ROOT, { recursive: true })
      .filter((p) => String(p).endsWith('.map'));
    expect(maps).toEqual([]);
  });
});

describe('PERF-04：滚动位置保存要防抖且不漏最后一段', () => {
  // 取出防抖保存那一段（从 debounce 定义到 pagehide 兜底），避免全文匹配造成假绿
  const scrollBlock = SIDE_INDEX.slice(
    SIDE_INDEX.indexOf('const saveScrollPosition = debounce('),
    SIDE_INDEX.indexOf('// 更多操作下拉菜单')
  );

  test('scroll 回调不再裸写 storage，改走 debounce', () => {
    expect(scrollBlock).toContain("saveScrollPosition('scrollPosition_'");
    expect(scrollBlock).not.toMatch(/addEventListener\('scroll',\s*\(\)\s*=>\s*\{\s*\n\s*const key/);
    expect(scrollBlock).toMatch(/const saveScrollPosition = debounce\(/);
    expect(SIDE_INDEX).toMatch(/import \{ debounce \} from '\.\.\/shared\/utils\.js'/);
  });

  test('key 与 scrollTop 在事件发生时捕获（防切会话后写错地方）', () => {
    // 落盘函数只接受参数，不在延迟回调里读 state.activeSessionId
    expect(scrollBlock).toMatch(/debounce\(\(key, top\) => \{\s*\n\s*chrome\.storage\.local\.set\(\{ \[key\]: top \}\);/);
    expect(scrollBlock).toMatch(/saveScrollPosition\('scrollPosition_' \+ \(state\.activeSessionId \|\| 'default'\), chatContainerEl\.scrollTop\)/);
  });

  test('面板收起时用 pagehide 兜底立即落一次', () => {
    expect(scrollBlock).toMatch(/addEventListener\('pagehide'/);
    expect(scrollBlock).toMatch(/chatContainerEl\.scrollTop/);
  });

  test('契约：debounce 多次触发只落最后一次，且带最后一次的参数', async () => {
    const { debounce } = await import('../../src/shared/utils.js');
    const calls = [];
    const fn = debounce((key, top) => calls.push([key, top]), 20);
    fn('scrollPosition_a', 10);
    fn('scrollPosition_a', 20);
    fn('scrollPosition_b', 30);
    expect(calls).toEqual([]);
    await new Promise((r) => setTimeout(r, 40));
    expect(calls).toEqual([['scrollPosition_b', 30]]);
  });
});

describe('PERF-05：docx 不得进入 side_panel 首屏 chunk', () => {
  const REFerrERS = [
    ['chat-manager.js', CHAT_MANAGER, 12],
    ['chat-streaming.js', CHAT_STREAMING, 4],
    // 4 处：createTextRuns、createDocxDocument（Document 工厂，含有序列表编号定义）、mermaid/图片等
    ['workspace-panel.js', WORKSPACE_PANEL, 4],
  ];

  test('三个引用方都不再静态 import chat-export', () => {
    for (const [name, src] of REFerrERS) {
      expect(src, `${name} 不应静态引 chat-export`).not.toMatch(/from '\.\/chat-export\.js'/);
    }
  });

  test('引用点全部改为 await import（数量锁住，防漏改）', () => {
    for (const [name, src, expected] of REFerrERS) {
      const hits = (src.match(/await import\('\.\/chat-export\.js'\)/g) || []).length;
      expect(hits, `${name} 的按需加载点数量变了`).toBe(expected);
    }
  });

  test('docx 仍只在 chat-export 顶层被引（懒加载点因此必须在引用方）', () => {
    expect(CHAT_EXPORT).toMatch(/from 'docx'/);
    // 其他 side_panel 模块不得再静态引 docx
    expect(WORKSPACE_PANEL).not.toMatch(/from 'docx'/);
    expect(CHAT_MANAGER).not.toMatch(/from 'docx'/);
  });

  test.skipIf(!distReady)('产物：主 chunk 静态依赖里没有 chat-export/docx，且 OOXML 特征串已移出', () => {
    const main = distFile('side_panel.js');
    expect(main).not.toMatch(/from"\.\/chat-export-/);
    expect(main).toMatch(/await import\(`\.\/chat-export-/);
    // docx 的标志：OOXML wordprocessingml 命名空间常量
    expect(main).not.toContain('schemas.openxmlformats.org/wordprocessingml');
  });

  test.skipIf(!distReady)('产物：主 chunk 体积守住收益（改前 1.38 MB，回退即红）', () => {
    const size = statSync(join(DIST_ASSETS, 'side_panel.js')).size;
    // 阈值调整史：1.10 MB → 1.12 MB。目标模式评审后主 chunk 实测 1.1003 MB，
    // 原阈值只剩 1KB 余量，一个小功能就会误报。docx 回退是一次性多 ~280KB，
    // 本闸依然能红——它要阻止的是「懒加载被废」，不是不准长一个字节。
    expect(size).toBeLessThan(1_120_000);
  });

  test.skipIf(!distReady)('产物：docx 落在按需 chunk 里（确实打出来了，只是不首屏加载）', () => {
    const carriers = listDistJs().filter((f) => distFile(f).includes('schemas.openxmlformats.org/wordprocessingml'));
    expect(carriers.length).toBeGreaterThan(0);
    expect(carriers).not.toContain('side_panel.js');
  });
});

describe('PERF-06：预览期 window 监听必须配对清理', () => {
  // 三组预览（pdf / pptx / image）各自的 window 监听都要走封装入口
  const PREVIEW_TYPES = ['mousemove', 'mouseup', 'resize'];

  test('文件里不存在"匿名函数直接注册到 window"的预览监听', () => {
    const naked = WORKSPACE_PANEL.match(/window\.addEventListener\('[a-z]+',\s*\(/g) || [];
    // 允许 0 处：预览监听一律经 addPreviewWindowListener；导出菜单那处用命名函数（幂等）
    expect(naked).toEqual([]);
  });

  test('三组预览共 9 个 window 监听全部走 addPreviewWindowListener 并透传本轮 signal', () => {
    const total = (WORKSPACE_PANEL.match(/addPreviewWindowListener\(signal, '/g) || []).length;
    expect(total).toBe(9);
    for (const type of PREVIEW_TYPES) {
      expect((WORKSPACE_PANEL.match(new RegExp(`addPreviewWindowListener\\(signal, '${type}'`, 'g')) || []).length)
        .toBe(3);
    }
  });

  test('每轮预览开始前先作废上一轮（单一收口点）', () => {
    const head = WORKSPACE_PANEL.slice(
      WORKSPACE_PANEL.indexOf('async function previewFile('),
      WORKSPACE_PANEL.indexOf('async function previewFile(') + 600
    );
    expect(head).toMatch(/if \(previewAbortController\) previewAbortController\.abort\(\);/);
    expect(head).toMatch(/previewAbortController = new AbortController\(\);/);
  });

  test('封装按传入 signal 注册，signal 缺失时退化（signal 来自形参而非读模块变量）', () => {
    const helper = WORKSPACE_PANEL.slice(
      WORKSPACE_PANEL.indexOf('function addPreviewWindowListener('),
      WORKSPACE_PANEL.indexOf('function addPreviewWindowListener(') + 400
    );
    // 并发关键：signal 必须是形参，不能读模块变量 previewAbortController
    expect(helper).toMatch(/function addPreviewWindowListener\(signal, type, handler\)/);
    expect(helper).toMatch(/signal \? \{ signal \} : undefined/);
    expect(helper).not.toMatch(/previewAbortController \? \{ signal: previewAbortController\.signal \}/);
  });

  test('契约：signal 作废后，同一 window 上的匿名监听不再触发', () => {
    let hits = 0;
    const controller = new AbortController();
    const handler = () => { hits++; };
    window.addEventListener('resize', handler, { signal: controller.signal });
    window.dispatchEvent(new Event('resize'));
    expect(hits).toBe(1);
    controller.abort();
    window.dispatchEvent(new Event('resize'));
    expect(hits).toBe(1);
  });
});

describe('构建产物引用图完整性（入口改名不得留下悬空引用）', () => {
  // PERF-05 把 chat-export 拆成独立 chunk 后，它要反向 import 入口 chunk；
  // 而 fix-build.js 会把带 hash 的入口改名成 side_panel.js，不改写 chunk 源码的话
  // 运行时就是 "Failed to fetch dynamically imported module"（所有导出按钮都坏）
  test('fix-build 改名后把映射写进 chunk 源码', () => {
    expect(FIX_BUILD).toMatch(/renameToStableNames/);
    const tail = FIX_BUILD.slice(FIX_BUILD.indexOf('function renameToStableNames'));
    expect(tail, '应遍历 assets 下的 .js 修正 chunk 间引用').toMatch(/endsWith\('\.js'\)[\s\S]{0,120}replaceInFile\(path\.join\(assetsDir, file\), renameMap\)/);
  });

  test.skipIf(!distReady)('产物里全部静态 import 都有实体文件（需先构建，未构建则 skip）', () => {
    const names = readdirSync(DIST_ASSETS).filter((f) => f.endsWith('.js'));
    const dangling = [];
    for (const f of names) {
      const src = distFile(f);
      for (const dep of new Set(src.match(/from"\.\/[A-Za-z0-9._-]+\.js"/g) || [])) {
        const target = dep.slice(7, -1);
        if (!names.includes(target)) dangling.push(`${f} → ${target}`);
      }
    }
    expect(dangling, `悬空引用：${dangling.join(', ')}`).toEqual([]);
  });
});
