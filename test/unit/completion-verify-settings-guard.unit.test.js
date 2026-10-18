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

  test('④ index.js change 处理写回并保留其余字段', () => {
    expect(IDX).toMatch(
      /document\.getElementById\('completionVerificationEnabled'\)[\s\S]{0,600}?chrome\.storage\.local\.set\(\{ completionVerificationConfig: cfg \}\)/,
    );
    // 仅翻 enabled：用 Object.assign 保留其余字段
    expect(IDX).toMatch(/Object\.assign\(\{\}, result\.completionVerificationConfig \|\| \{\}, \{ enabled \}\)/);
  });

  test('⑤ zh/en locales 均定义 react.completionVerification 文案键', () => {
    for (const src of [ZH, EN]) {
      expect(src).toMatch(/completionVerification:/);
      expect(src).toMatch(/completionVerificationHint:/);
      expect(src).toMatch(/completionVerificationDesc1:/);
      expect(src).toMatch(/completionVerificationDesc2:/);
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
