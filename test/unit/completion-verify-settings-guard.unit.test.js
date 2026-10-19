// 完成度校验器 Phase 4：设置页接线守卫（源码文本断言，防重构静默拆线）。
// 锁五处，缺一即红：
//   ① options.html 暴露 completionVerificationEnabled 开关（i18n 标记齐全）；
//   ② config-io EXPORT_KEYS 白名单含 completionVerificationConfig（导入/导出同源复用）；
//   ③ config-manager 从持久化 completionVerificationConfig.enabled 水合复选框；
//   ④ index.js change 处理写回 completionVerificationConfig 且保留其余字段（仅翻 enabled）；
//   ⑤ zh/en locales 均定义 react.completionVerification 文案键。
// 语义：与 reflectionConfig 同类（AI 行为配置，非 networkAccess 那种安全闸门），故参与导入导出。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const HTML = readFileSync(join(root, 'options.html'), 'utf8');
const IO = readFileSync(join(root, 'src/options/config-io.js'), 'utf8');
const CM = readFileSync(join(root, 'src/options/config-manager.js'), 'utf8');
const IDX = readFileSync(join(root, 'src/options/index.js'), 'utf8');
const CFG = readFileSync(join(root, 'src/background/config.js'), 'utf8');
const ZH = readFileSync(join(root, 'src/shared/locales/zh.js'), 'utf8');
const EN = readFileSync(join(root, 'src/shared/locales/en.js'), 'utf8');

describe('Phase 4 设置页完成度校验接线守卫', () => {
  test('① options.html 暴露开关复选框与 i18n 标签', () => {
    expect(HTML).toMatch(/<input type="checkbox" id="completionVerificationEnabled">/);
    expect(HTML).toContain('id="completionVerificationEnabledLabel"');
    expect(HTML).toContain('data-i18n="react.completionVerification"');
  });

  // Phase B：设置页暴露 rerunEnabled 子开关（与 enabled 同构，默认关）。
  test('①b options.html 暴露完成度自动重跑子开关与 i18n 标签', () => {
    expect(HTML).toMatch(/<input type="checkbox" id="completionVerificationRerunEnabled">/);
    expect(HTML).toContain('id="completionVerificationRerunEnabledLabel"');
    expect(HTML).toContain('data-i18n="react.completionVerificationRerun"');
  });

  // Phase B：rerun 为完成度校验的二级子开关——HTML 带 completion-verification-sub 类 + 默认收起（display:none）。
  test('①c options.html rerun 块为二级子项：completion-verification-sub + 默认隐藏', () => {
    expect(HTML).toMatch(/<div class="react-config-item completion-verification-sub" style="margin-left: 24px; display: none;">[\s\S]*?id="completionVerificationRerunEnabled">/);
  });

  test('② config-io EXPORT_KEYS 白名单含 completionVerificationConfig', () => {
    const keys = IO.match(/const EXPORT_KEYS = \[([\s\S]*?)\];/);
    expect(keys).not.toBeNull();
    expect(keys[1]).toContain("'completionVerificationConfig'");
  });

  test('③ config-manager 水合复选框读取 completionVerificationConfig.enabled', () => {
    expect(CM).toMatch(
      /getElementById\('completionVerificationEnabled'\)[\s\S]{0,200}?result\.completionVerificationConfig[\s\S]{0,80}?\.enabled === true/,
    );
  });

  // Phase B：config-manager 从持久化 config 水合 rerunEnabled 子勾选。
  test('③b config-manager 水合 rerun 子勾选读取 completionVerificationConfig.rerunEnabled', () => {
    expect(CM).toMatch(
      /getElementById\('completionVerificationRerunEnabled'\)[\s\S]{0,200}?result\.completionVerificationConfig[\s\S]{0,80}?\.rerunEnabled === true/,
    );
  });

  test('④ index.js change 处理写回并保留其余字段', () => {
    expect(IDX).toMatch(
      /document\.getElementById\('completionVerificationEnabled'\)[\s\S]{0,1400}?chrome\.storage\.local\.set\(\{ completionVerificationConfig: cfg \}\)/,
    );
    // 仅翻 enabled：用 Object.assign 保留其余字段
    expect(IDX).toMatch(/Object\.assign\(\{\}, result\.completionVerificationConfig \|\| \{\}, \{ enabled \}\)/);
  });

  // Phase B：rerun 子开关 change 同样保留其余字段、仅翻 rerunEnabled。
  test('④b index.js rerun change 处理写回并仅翻 rerunEnabled', () => {
    expect(IDX).toMatch(
      /document\.getElementById\('completionVerificationRerunEnabled'\)[\s\S]{0,900}?chrome\.storage\.local\.set\(\{ completionVerificationConfig: cfg \}\)/,
    );
    expect(IDX).toMatch(/Object\.assign\(\{\}, result\.completionVerificationConfig \|\| \{\}, \{ rerunEnabled \}\)/);
  });

  // Phase B：二级可见性——一级 enabled 关闭时收起 completion-verification-sub（与 .reflection-sub 同机制）。
  test('④c index.js 一级开关联动二级子项显隐（querySelectorAll .completion-verification-sub 按 checked 切换 display）', () => {
    expect(IDX).toMatch(/querySelectorAll\('\.completion-verification-sub'\)/);
    expect(IDX).toMatch(/function updateCompletionSubVisibility\(\) \{[\s\S]*?completionVerificationEnabledEl\.checked[\s\S]*?style\.display = show \? 'block' : 'none'/);
    // 一级 change 与初始化都需调用可见性更新
    expect(IDX).toMatch(/completionVerificationEnabledEl\.addEventListener\('change'[\s\S]{0,200}?updateCompletionSubVisibility\(\);/);
    expect(IDX).toMatch(/completionVerificationEnabledEl\.checked[\s\S]{0,120}?updateCompletionSubVisibility\(\);\s*\n\s*\}/);
  });

  test('⑤ zh/en locales 均定义 react.completionVerification 文案键', () => {
    for (const src of [ZH, EN]) {
      expect(src).toMatch(/completionVerification:/);
      expect(src).toMatch(/completionVerificationHint:/);
      expect(src).toMatch(/completionVerificationDesc1:/);
      expect(src).toMatch(/completionVerificationDesc2:/);
    }
  });

  // Phase B：zh/en 均定义 rerun 子开关文案键。
  test('⑤b zh/en locales 均定义 react.completionVerificationRerun* 文案键', () => {
    for (const src of [ZH, EN]) {
      expect(src).toMatch(/completionVerificationRerun:/);
      expect(src).toMatch(/completionVerificationRerunHint:/);
      expect(src).toMatch(/completionVerificationRerunDesc1:/);
      expect(src).toMatch(/completionVerificationRerunDesc2:/);
    }
  });

  // M6 守卫：config 装配必须深合并（默认值打底），而非 `|| 整体替换`
  // ——否则 options 只写 {enabled} 时其余默认字段会被残缺对象顶替清空
  test('⑥ config completionVerification 用 Object.assign 默认值打底深合并', () => {
    expect(CFG).toMatch(
      /completionVerification:\s*Object\.assign\(\{\},\s*DEFAULT_COMPLETION_VERIFICATION_CONFIG,/,
    );
    expect(CFG).not.toMatch(/completionVerification:\s*result\.completionVerificationConfig\s*\|\|\s*DEFAULT_COMPLETION_VERIFICATION_CONFIG/);
  });
});
