/**
 * memory-validation-messages.unit.test.js
 * 记忆入参校验的「文案层」测试。
 *
 * 为什么单独一个文件：memory-service.unit.test.js 里 t 是 stub（返回 key），
 * 所以校验分支只被验了「拒不拒」，文案层完全裸奔——上一轮就往 locale 里写进了
 * 6 行残缺占位符而 66 条用例全绿。本文件改用真实 i18n，并把 service 的调用参数
 * 和 locale 里的占位符名钉在一起：任一边写错（少了 }、参数名漂移、只加一种语言）都红。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { t as translate } from '../../src/i18n.js';
import { createMemoryService } from '../../src/memory/service.js';

const here = dirname(fileURLToPath(import.meta.url));
const LOCALE_DIR = join(here, '..', '..', 'src', 'locales');
const readLocale = (name) => JSON.parse(readFileSync(join(LOCALE_DIR, name), 'utf-8'));

// t() 渲染后仍留下的 {xxx} 就是没被替换的占位符（不管是文案写错还是调用方参数名不对）
const RESIDUAL = /\{\w+\}/;

/** service 的 store/recall 都接收 t 作为入参，这里注入真实 i18n 而不是 stub */
function withRealI18n(lang, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'mem-i18n-'));
  const svc = createMemoryService({
    filePath: join(dir, 'global-memory.json'),
    vectorsFilePath: join(dir, 'memory-vectors.json'),
    embeddingConfigProvider: () => ({ enabled: false }),
    tierResolver: () => 'none',
    embedderFactory: () => { throw new Error('夹具不得创建 embedding provider'); }
  });
  const t = (key, params) => translate(lang, key, params);
  return Promise.resolve(fn(svc, t)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

/** 递归取叶子键路径，用于两份语言包的结构比对 */
function leafPaths(obj, prefix = [], out = []) {
  for (const [key, value] of Object.entries(obj)) {
    const path = [...prefix, key];
    if (value && typeof value === 'object') leafPaths(value, path, out);
    else out.push(path);
  }
  return out;
}
const pathKey = (path) => path.join('.');
const at = (obj, path) => path.reduce((node, seg) => (node && typeof node === 'object' ? node[seg] : undefined), obj);
const placeholders = (text) => (String(text).match(/\{\w+\}/g) || []).sort().join(',');

describe('记忆校验文案（真实 i18n 渲染）', () => {
  const keys = ['invalidType', 'invalidMemoryType', 'invalidImportance'];

  for (const lang of ['zh', 'en']) {
    it(`${lang}：三个校验键都能渲染成完整句子`, () => {
      const dict = readLocale(`${lang}.json`);
      for (const key of keys) {
        assert.ok(typeof dict.memory?.[key] === 'string', `缺少 memory.${key}`);
      }
      // 残缺占位符（形如 {QJ}）是脚本变量名漏进文案的产物，必须当场失败
      const rendered = translate(lang, 'memory.invalidType', { type: 'note' });
      assert.ok(!RESIDUAL.test(rendered), `${lang} 渲染后仍残留占位符: ${rendered}`);
      assert.ok(!rendered.includes('{QJ}'), `${lang} 文案含脚本变量残留: ${rendered}`);
      assert.ok(rendered.includes('note'), `${lang} 未插值 offending 值: ${rendered}`);
    });
  }

  it('service 走真实 i18n 时，拒绝信息里能看到模型传来的原始值（zh）', () => withRealI18n('zh', async (svc, t) => {
    const badType = await svc.store({ action: 'add', type: 'note', content: 'x' }, t);
    assert.equal(badType.success, false);
    assert.ok(badType.error.includes('note'), badType.error);
    assert.ok(!RESIDUAL.test(badType.error), badType.error);

    const badImportance = await svc.store({ action: 'add', type: 'fact', content: 'x', importance: 'high' }, t);
    assert.equal(badImportance.success, false);
    assert.ok(badImportance.error.includes('high'), badImportance.error);
    assert.ok(!RESIDUAL.test(badImportance.error), badImportance.error);

    const badMemoryType = await svc.recall({ memoryType: 'facts' }, null, t);
    assert.equal(badMemoryType.success, false);
    assert.ok(badMemoryType.error.includes('facts'), badMemoryType.error);
    assert.ok(!RESIDUAL.test(badMemoryType.error), badMemoryType.error);
  }));

  it('service 走真实 i18n 时，英文包同样完整（en）', () => withRealI18n('en', async (svc, t) => {
    const r = await svc.store({ action: 'add', type: 'note', content: 'x' }, t);
    assert.equal(r.success, false);
    assert.ok(r.error.includes('note'), r.error);
    assert.ok(!RESIDUAL.test(r.error), r.error);
  }));
});

describe('语言包结构一致性', () => {
  it('zh 与 en 的叶子键集合完全一致', () => {
    const zh = leafPaths(readLocale('zh.json')).map(pathKey).sort();
    const en = leafPaths(readLocale('en.json')).map(pathKey).sort();
    assert.ok(zh.length > 0);
    const onlyZh = zh.filter((k) => !en.includes(k));
    const onlyEn = en.filter((k) => !zh.includes(k));
    assert.deepEqual(onlyZh, [], '这些键只在 zh 存在');
    assert.deepEqual(onlyEn, [], '这些键只在 en 存在');
  });

  it('同名键的占位符集合一致（防止一边漏参数）', () => {
    const zh = readLocale('zh.json');
    const en = readLocale('en.json');
    const mismatches = leafPaths(zh)
      .filter((path) => {
        const zv = at(zh, path);
        const ev = at(en, path);
        if (typeof zv !== 'string' || typeof ev !== 'string') return false;
        return placeholders(zv) !== placeholders(ev);
      })
      .map(pathKey);
    assert.deepEqual(mismatches, [], '这些键的占位符两份语言包不一致');
  });
});
