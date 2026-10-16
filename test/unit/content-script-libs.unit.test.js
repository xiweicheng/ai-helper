// 内容脚本 libs 注入清单的回归守卫（对应 docs/AUDIT_STATUS.md 的 NEW-01 / PERF-01）
//
// 背景：构建脚本曾用「扫描 dist/libs、除 mermaid 外全部注入」生成 content_scripts.js，
// 导致只被 side panel 使用的 html2canvas / jspdf / pdf.worker（约 1.61 MB）被塞进
// 每个页面的每个 iframe（all_frames + match_about_blank），而内容脚本产物对它们的引用数为 0。
//
// 本文件锁两件事：① 纯函数 resolveContentScriptLibs 的语义（跟随声明、缺失即抛、去重保序）；
// ② 仓库真实状态与构建脚本接线（注入清单恰为 manifest 声明的两项，且 fix-build 不再展开目录扫描结果）。
import { describe, test, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { resolveContentScriptLibs } from '../../scripts/content-libs.js';

const ROOT_MANIFEST = new URL('../../manifest.json', import.meta.url);
const DIST_ROOT = new URL('../../dist/', import.meta.url);
const DIST_LIBS_DIR = new URL('libs/', DIST_ROOT);
const FIX_BUILD_SRC = readFileSync(
  new URL('../../scripts/fix-build.js', import.meta.url), 'utf8'
);

/** file: URL → 本地文件系统路径（Windows 下需去掉开头的斜杠） */
function toPath(url) {
  return decodeURIComponent(url.pathname.replace(/^\/([A-Za-z]:)/, '$1'));
}

/** side_panel 专用、绝不该进内容脚本的重型库（dist/libs 下实际文件名） */
const PANEL_ONLY_LIBS = ['html2canvas.min.js', 'jspdf.min.js', 'pdf.worker.min.js', 'mermaid.min.js'];

describe('resolveContentScriptLibs 注入清单派生语义', () => {
  test('只采用声明项：目录里的 side_panel 专用重型库一律不注入', () => {
    const result = resolveContentScriptLibs({
      sourceManifestJs: ['libs/qrcode.min.js', 'libs/marked.min.js', 'src/content/index.js'],
      libsDirFiles: ['qrcode.min.js', 'marked.min.js', ...PANEL_ONLY_LIBS],
    });
    expect(result).toEqual(['libs/qrcode.min.js', 'libs/marked.min.js']);
  });

  test('跟随声明而非硬黑名单：manifest 若显式声明某库则照注入', () => {
    const result = resolveContentScriptLibs({
      sourceManifestJs: ['libs/html2canvas.min.js', 'libs/marked.min.js'],
      libsDirFiles: ['html2canvas.min.js', 'marked.min.js'],
    });
    expect(result).toEqual(['libs/html2canvas.min.js', 'libs/marked.min.js']);
  });

  test('保持声明顺序并去重', () => {
    const result = resolveContentScriptLibs({
      sourceManifestJs: ['libs/marked.min.js', 'libs/qrcode.min.js', 'libs/marked.min.js'],
      libsDirFiles: ['marked.min.js', 'qrcode.min.js'],
    });
    expect(result).toEqual(['libs/marked.min.js', 'libs/qrcode.min.js']);
  });

  test('未声明任何 libs 时返回空数组（非 libs 项与 css 不参与）', () => {
    const result = resolveContentScriptLibs({
      sourceManifestJs: ['src/content/index.js', 'styles/styles.css'],
      libsDirFiles: ['marked.min.js'],
    });
    expect(result).toEqual([]);
  });

  test('声明了但产物缺失：抛错而非静默丢库', () => {
    // 静默丢库会退化成运行时的 `typeof marked === 'undefined'` 分支，极难归因
    expect(() => resolveContentScriptLibs({
      sourceManifestJs: ['libs/marked.min.js'],
      libsDirFiles: ['qrcode.min.js'],
    })).toThrow(/构建产物中不存在/);
  });

  test('dist/libs 目录整体缺失时不抛错，保持非致命路径', () => {
    const result = resolveContentScriptLibs({
      sourceManifestJs: ['libs/marked.min.js'],
      libsDirFiles: [],
      libsDirExists: false,
    });
    expect(result).toEqual(['libs/marked.min.js']);
  });
});

describe('仓库真实状态：注入清单必须恰为声明项', () => {
  const srcManifest = JSON.parse(readFileSync(ROOT_MANIFEST, 'utf8'));
  const declaredJs = srcManifest.content_scripts[0].js;

  test('源码 manifest 只声明 marked 与 qrcode', () => {
    const declaredLibs = declaredJs.filter(f => f.startsWith('libs/'));
    expect(declaredLibs).toEqual(['libs/qrcode.min.js', 'libs/marked.min.js']);
  });

  test('内容脚本引用的库与声明一致，且重型面板库不在声明中', () => {
    const declaredLibs = declaredJs.filter(f => f.startsWith('libs/'));
    for (const panelLib of PANEL_ONLY_LIBS) {
      expect(declaredLibs).not.toContain(`libs/${panelLib}`);
    }
  });

  test('已构建时：派生结果不含重型库，且注入体积受上限约束', () => {
    // 未构建 dist 时跳过（守卫不应要求先构建才能跑单测）
    const libsDir = toPath(DIST_LIBS_DIR);
    if (!existsSync(libsDir)) return;

    const files = readdirSync(libsDir).filter(f => f.endsWith('.js'));
    const injected = resolveContentScriptLibs({
      sourceManifestJs: declaredJs,
      libsDirFiles: files,
    });

    expect(injected).toEqual(['libs/qrcode.min.js', 'libs/marked.min.js']);
    expect(injected.some(f => PANEL_ONLY_LIBS.some(p => f.endsWith(p)))).toBe(false);

    // 体积上限锁：一旦有人把重型库写进 manifest 声明，这条会立刻红
    const totalBytes = injected
      .map(f => statSync(toPath(new URL(f, DIST_ROOT))).size)
      .reduce((a, b) => a + b, 0);
    expect(totalBytes).toBeLessThan(100 * 1024);
  });
});

describe('构建脚本接线守卫', () => {
  test('fix-build 通过 resolveContentScriptLibs 派生注入清单', () => {
    expect(FIX_BUILD_SRC).toMatch(/import \{ resolveContentScriptLibs \} from '.\/content-libs.js'/);
    expect(FIX_BUILD_SRC).toMatch(/contentLibs = resolveContentScriptLibs\(/);
    expect(FIX_BUILD_SRC).toMatch(/\.\.\.contentLibs,/);
  });

  test('fix-build 不再把目录扫描结果直接展开为注入清单', () => {
    // 旧写法：const libFiles = ...readdirSync(libsDir)...map(f => `libs/${f}`) 后 ...libFiles
    expect(FIX_BUILD_SRC).not.toMatch(/\.map\(f => `libs\/\$\{f\}`\)/);
    expect(FIX_BUILD_SRC).not.toMatch(/\.\.\.libFiles,/);
    // mermaid 的特判也应随之消失：真相源是声明，不需要逐个排除
    expect(FIX_BUILD_SRC).not.toMatch(/!== 'mermaid\.min\.js'/);
  });
});
