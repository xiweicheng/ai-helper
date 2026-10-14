/**
 * memory-test-isolation.unit.test.js
 *
 * 钉住记忆测试的隔离口径：createMemoryService 的四个注入点缺一不可。
 *
 * 为什么要有这个文件（2026-10-13 实测事故）：老夹具只给了 filePath，service 便回落到
 * 读用户真实 config.json。本机一开记忆向量，store 的懒补向量和 recall 的语义路就会
 * 拿真 key 联网，并把向量写进用户真实的 ~/.ai-helper-agent/memory/memory-vectors.json
 * ——实测把他的 41 条缓存覆盖成了 2 条测试条目。断言同时从「纯词面通道」漂成
 * 「词面 + 语义」双通道，碎块噪声用例因此无声变红。
 *
 * 单靠改两个夹具挡不住下一次：新增测试文件照样可能只写 filePath。这里扫描全部
 * test/unit 源码，把「建了 service 却没隔离向量侧」直接判失败。
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEST_DIR = dirname(fileURLToPath(import.meta.url));

// 与 src/memory/service.js 的 createMemoryService 签名对齐（缺一个都会留下真实依赖）
const REQUIRED_INJECTIONS = ['filePath', 'vectorsFilePath', 'embeddingConfigProvider', 'tierResolver', 'embedderFactory'];

/**
 * 取出调用实参的源码片段：按括号配对扫描，避开注释与字符串里的括号。
 * @param {string} src 文件源码
 * @param {number} start 「createMemoryService(」中左括号的下标
 * @returns {string} 不含外层括号的实参文本
 */
function argsOf(src, start) {
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return src.slice(start + 1, i);
    }
  }
  return src.slice(start + 1);
}

function findServiceConstructors(src) {
  const hits = [];
  const re = /createMemoryService\(/g;
  let m;
  while ((m = re.exec(src))) {
    hits.push(argsOf(src, m.index + m[0].length - 1));
  }
  return hits;
}

describe('记忆测试夹具的向量侧隔离', () => {
  // 本文件自己包含 createMemoryService 的字面量（扇描用的正则），不排除会把它 当夹具误判
  const SELF = 'memory-test-isolation.unit.test.js';
  const files = readdirSync(TEST_DIR).filter((f) => f.endsWith('.test.js') && f !== SELF);

  it('确实扫到了含 createMemoryService 的文件（防空跑）', () => {
    const withCtor = files.filter((f) => readFileSync(join(TEST_DIR, f), 'utf8').includes('createMemoryService('));
    assert.ok(withCtor.length >= 3, `只扫到 ${withCtor.length} 个文件，扫描口径可能已失效`);
  });

  for (const file of files) {
    it(`${file} 里每个 createMemoryService 都注入全部隔离点`, () => {
      const src = readFileSync(join(TEST_DIR, file), 'utf8');
      for (const args of findServiceConstructors(src)) {
        for (const key of REQUIRED_INJECTIONS) {
          // 兼容 `key: value` 与对象简写 `key,`；前面的否定断言防止 filePath 被 vectorsFilePath 包涵而误判成已注入
          const present = new RegExp(`(^|[^A-Za-z0-9_])${key}\\b`).test(args);
          assert.ok(
            present,
            `${file}：有一处 createMemoryService 缺 ${key}，会回落读用户真实 config.json / 写他真实向量缓存`
          );
        }
      }
    });
  }

  it('夹具不得把向量缓存指回默认路径', () => {
    for (const file of files) {
      const src = readFileSync(join(TEST_DIR, file), 'utf8');
      assert.ok(!/vectorsFilePath:\s*VECTORS_FILE/.test(src), `${file}：vectorsFilePath 用了默认常量，等于写真实缓存`);
      // 无参建门面 = 直接用 VECTORS_FILE（用户真实缓存）；path-security 类用例故意引用
      // homedir() 下的路径是为了断言「应该被拦住」，所以这里只钉向量门面这一条通道
      assert.ok(!/createVectorStoreFacade\(\s*\)/.test(src), `${file}：createVectorStoreFacade() 无参，落在用户真实向量缓存上`);
    }
  });
});
