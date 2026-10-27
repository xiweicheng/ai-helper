// asr-model-download-resume.unit.test.js - 模型下载「续传」路径的完整性校验
//
// 背景：续传原本只看字节数。中断 / 掉电可能留下「大小恰好一致、内容是残片」的文件，
// 它会被当成「已下载」永久跳过 —— 每次重试都不再下载，直到引擎加载模型才炸，
// 而报错信息和下载毫无关系（模型加载失败 / 输出乱码），排查成本极高。
//
// 为什么这里不做「真跑一次断点续传」：那需要起 HTTP 服务 + 几百 MB 磁盘，
// 单测里不划算。所以拆成两半：
//   1) 真测可测的部分 —— sha256OfFile 能复用、verifyHash 能识别「同大小错内容」；
//   2) 源码契约 —— 续传判断条件里必须同时有字节数与哈希，收尾必须按 verifyHash 复核。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ASR_SRC = fileURLToPath(new URL('../../src/asr/', import.meta.url));
const DOWNLOAD_SRC = readFileSync(join(ASR_SRC, 'model-download.js'), 'utf8');

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

let root;
let mod;

// config.js 在模块求值时读 AI_HELPER_ASR_ROOT，所以必须先设 env 再动态 import
before(async () => {
  root = mkdtempSync(join(tmpdir(), 'asr-resume-test-'));
  process.env.AI_HELPER_ASR_ROOT = root;
  mod = await import(`../../src/asr/model-pack.js?t=${Date.now()}`);
});

after(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

describe('sha256OfFile：续传校验要复用的那个函数', () => {
  it('已对外导出，且结果与 crypto 一致', () => {
    assert.equal(typeof mod.sha256OfFile, 'function');
    const file = join(root, 'sample.bin');
    writeFileSync(file, 'fake-onnx-bytes');
    assert.equal(mod.sha256OfFile(file), sha256('fake-onnx-bytes'));
  });

  it('文件不存在 / 空文件 → null（调用方据此判为不匹配，删掉重下）', () => {
    assert.equal(mod.sha256OfFile(join(root, 'nope.bin')), null);
    const empty = join(root, 'empty.bin');
    writeFileSync(empty, '');
    assert.equal(mod.sha256OfFile(empty), null);
  });
});

describe('同字节数、不同内容：只看 size 的续传一定漏', () => {
  it('不校验时它是「能用的」，verifyHash 一开就暴露 sha256_mismatch', () => {
    const dir = join(root, 'half-written');
    mkdirSync(dir, { recursive: true });
    const good = 'fake-onnx-bytes';
    const bad = 'fake-onnx-byteZ'; // 同样 15 字节：模拟写盘中断留下的残片
    assert.equal(good.length, bad.length);

    writeFileSync(join(dir, 'model.onnx'), bad);
    writeFileSync(join(dir, 'tokens.txt'), 'a 1\n');
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
      schema: 1,
      id: 'resume-test',
      engine: 'sherpa-onnx',
      kind: 'offline',
      files: ['model.onnx', 'tokens.txt'],
      modelFile: 'model.onnx',
      tokensFile: 'tokens.txt',
      sha256: { 'model.onnx': sha256(good) },
    }));

    // 旧续传逻辑的视角：大小对 → 当成已下载
    assert.equal(mod.readModelManifest(dir).ok, true);

    const checked = mod.readModelManifest(dir, { verifyHash: true });
    assert.equal(checked.ok, false);
    assert.match(checked.error, /sha256_mismatch: model\.onnx/);
  });
});

describe('下载路径的守卫（源码契约）', () => {
  it('续传跳过条件是「字节数 && 哈希」双条件', () => {
    assert.match(DOWNLOAD_SRC, /already === file\.size && sha256Matches\(dest, file\)/);
    // 反向：不能只凭大小就 continue
    assert.doesNotMatch(DOWNLOAD_SRC, /if \(already === file\.size\) \{\s*target\.bytesDone/);
  });

  it('sha256Matches：清单没给哈希退回只信大小，给了就必须算出来一致', () => {
    const start = DOWNLOAD_SRC.indexOf('function sha256Matches(');
    assert.ok(start > -1, '缺少 sha256Matches');
    const body = DOWNLOAD_SRC.slice(start, DOWNLOAD_SRC.indexOf('\n}\n', start));
    assert.match(body, /if \(!want\) return true/); // 老清单兼容
    assert.match(body, /typeof got === 'string' && got\.toLowerCase\(\) === want/); // 读不出 → false
  });

  it('整包下完再按 verifyHash 复核一次', () => {
    assert.match(DOWNLOAD_SRC, /readModelManifest\(partDir, \{ verifyHash: true \}\)/);
  });
});