// asr-model-pack.unit.test.js - 模型包 manifest 校验 / 扫描 / 注册 / 删除
// 覆盖：manifest 缺失、字段非法（schema/engine/kind/id/files）、sha256 不符、
//      目录穿越防护、正常注册与删除。
// 注意：config.js 在模块求值时读 AI_HELPER_ASR_ROOT，因此必须先设 env 再动态 import。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let root;
let mod;
let MODELS_DIR;

const TOKENS = 'a 1\nb 2\n';

/** 写一个合法的 offline（SenseVoice 结构）模型包 */
function writeOfflineModel(dir, overrides = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'tokens.txt'), TOKENS);
  writeFileSync(join(dir, 'model.onnx'), 'fake-onnx-bytes');
  const manifest = {
    schema: 1,
    id: 'sense-test',
    engine: 'sherpa-onnx',
    kind: 'offline',
    name: 'test model',
    files: ['model.onnx', 'tokens.txt'],
    modelFile: 'model.onnx',
    tokensFile: 'tokens.txt',
    ...overrides,
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

/** 写一个合法的 online（transducer 结构）模型包 */
function writeOnlineModel(dir, overrides = {}) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'encoder.onnx'), 'e');
  writeFileSync(join(dir, 'decoder.onnx'), 'd');
  writeFileSync(join(dir, 'joiner.onnx'), 'j');
  writeFileSync(join(dir, 'tokens.txt'), TOKENS);
  const manifest = {
    schema: 1,
    id: 'online-test',
    engine: 'sherpa-onnx',
    kind: 'online',
    files: ['encoder.onnx', 'decoder.onnx', 'joiner.onnx', 'tokens.txt'],
    encoder: 'encoder.onnx',
    decoder: 'decoder.onnx',
    joiner: 'joiner.onnx',
    tokensFile: 'tokens.txt',
    ...overrides,
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return manifest;
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'asr-pack-test-'));
  process.env.AI_HELPER_ASR_ROOT = root;
  mod = await import(`../../src/asr/model-pack.js?t=${Date.now()}`);
  MODELS_DIR = join(root, 'models');
  mkdirSync(MODELS_DIR, { recursive: true });
});

after(() => {
  try { rmSync(root, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

describe('normalizeModelId', () => {
  it('接受字母数字点划线与下划线', () => {
    assert.equal(mod.normalizeModelId('sense_voice-1.0'), 'sense_voice-1.0');
    assert.equal(mod.normalizeModelId('  sense-voice  '), 'sense-voice');
  });

  it('拒绝目录穿越、路径分隔符与空值', () => {
    assert.equal(mod.normalizeModelId('../evil'), null);
    assert.equal(mod.normalizeModelId('a/b'), null);
    assert.equal(mod.normalizeModelId('a\\b'), null);
    assert.equal(mod.normalizeModelId(''), null);
    assert.equal(mod.normalizeModelId(null), null);
    assert.equal(mod.normalizeModelId('x'.repeat(200)), null);
  });
});

describe('readModelManifest 校验矩阵', () => {
  it('manifest.json 缺失 → manifest_missing（不抛异常）', () => {
    const dir = join(MODELS_DIR, 'no-manifest');
    mkdirSync(dir, { recursive: true });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_missing/);
    assert.equal(r.model, undefined);
  });

  it('JSON 损坏 → manifest_invalid_json', () => {
    const dir = join(MODELS_DIR, 'bad-json');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), '{ not json');
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_invalid_json/);
  });

  it('schema 非 1 → manifest_schema_unsupported', () => {
    const dir = join(MODELS_DIR, 'bad-schema');
    writeOfflineModel(dir, { schema: 99 });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_schema_unsupported/);
  });

  it('engine 非 sherpa-onnx → engine_unsupported', () => {
    const dir = join(MODELS_DIR, 'bad-engine');
    writeOfflineModel(dir, { engine: 'whisper.cpp' });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /engine_unsupported/);
  });

  it('kind 非法 → manifest_invalid_kind', () => {
    const dir = join(MODELS_DIR, 'bad-kind');
    writeOfflineModel(dir, { kind: 'tts' });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_invalid_kind/);
  });

  it('id 非法 → manifest_invalid_id', () => {
    const dir = join(MODELS_DIR, 'bad-id');
    writeOfflineModel(dir, { id: '../escape' });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_invalid_id/);
  });

  it('files 为空 → manifest_no_files', () => {
    const dir = join(MODELS_DIR, 'no-files');
    writeOfflineModel(dir, { files: [] });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_no_files/);
  });

  it('声明文件不存在 → file_missing', () => {
    const dir = join(MODELS_DIR, 'missing-file');
    writeOfflineModel(dir, { files: ['model.onnx', 'ghost.bin'] });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /file_missing: ghost\.bin/);
  });

  it('声明文件为 0 字节 → file_empty（拷贝中断的半包）', () => {
    const dir = join(MODELS_DIR, 'empty-file');
    writeOfflineModel(dir, { files: ['model.onnx', 'tokens.txt'] });
    writeFileSync(join(dir, 'tokens.txt'), '');
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /file_empty: tokens\.txt/);
  });

  it('files 中越界路径 → file_outside_pack', () => {
    const dir = join(MODELS_DIR, 'escape-file');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
      schema: 1, id: 'escape-file', engine: 'sherpa-onnx', kind: 'offline',
      files: ['../outside.bin'],
    }));
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /file_outside_pack/);
  });

  it('offline 缺 modelFile/tokensFile → manifest_missing_model_or_tokens', () => {
    const dir = join(MODELS_DIR, 'no-modelfile');
    writeOfflineModel(dir, { modelFile: undefined });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_missing_model_or_tokens/);
  });

  it('online 缺 transducer 文件 → manifest_missing_transducer_files', () => {
    const dir = join(MODELS_DIR, 'no-joiner');
    writeOnlineModel(dir, { joiner: undefined });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_missing_transducer_files/);
  });

  it('vad 缺 modelFile → manifest_missing_model', () => {
    const dir = join(MODELS_DIR, 'vad-nofile');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'silero.onnx'), 'x');
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
      schema: 1, id: 'vad-nofile', engine: 'sherpa-onnx', kind: 'vad', files: ['silero.onnx'],
    }));
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, false);
    assert.match(r.error, /manifest_missing_model/);
  });

  it('verifyHash 开启时 sha256 不符 → sha256_mismatch；关闭时不校验', () => {
    const dir = join(MODELS_DIR, 'bad-hash');
    writeOfflineModel(dir, { sha256: { 'model.onnx': sha256('another-bytes') } });
    // 默认不校验哈希：仅结构校验通过
    assert.equal(mod.readModelManifest(dir).ok, true);
    const r = mod.readModelManifest(dir, { verifyHash: true });
    assert.equal(r.ok, false);
    assert.match(r.error, /sha256_mismatch: model\.onnx/);
  });

  it('verifyHash 开启且 sha256 正确 → ok', () => {
    const dir = join(MODELS_DIR, 'good-hash');
    writeOfflineModel(dir, { id: 'good-hash', sha256: { 'model.onnx': sha256('fake-onnx-bytes') } });
    const r = mod.readModelManifest(dir, { verifyHash: true });
    assert.equal(r.ok, true);
    assert.equal(r.model.id, 'good-hash');
  });

  it('合法 offline manifest → ok，且补全 arch 缺省值为 senseVoice', () => {
    const dir = join(MODELS_DIR, 'ok-offline');
    writeOfflineModel(dir, { id: 'ok-offline' });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, true);
    assert.equal(r.model.id, 'ok-offline');
    assert.equal(r.model.kind, 'offline');
    assert.equal(r.model.arch, 'senseVoice');
    assert.equal(r.model.engine, 'sherpa-onnx');
    assert.equal(r.model.sampleRate, 16000);
    assert.ok(r.model.modelFile.endsWith('model.onnx'));
    assert.ok(r.model.totalBytes > 0);
  });

  it('合法 online manifest → arch 缺省为 transducer', () => {
    const dir = join(MODELS_DIR, 'ok-online');
    writeOnlineModel(dir, { id: 'ok-online' });
    const r = mod.readModelManifest(dir);
    assert.equal(r.ok, true);
    assert.equal(r.model.arch, 'transducer');
    assert.ok(r.model.encoder && r.model.decoder && r.model.joiner);
  });
});

describe('scanModels / getCapability', () => {
  it('只收合法模型，非法项进入 invalid 列表', () => {
    const scanned = mod.scanModels();
    const ids = scanned.models.map((m) => m.id);
    assert.ok(ids.includes('ok-offline'));
    assert.ok(ids.includes('ok-online'));
    // 非法的 engine/schema/kind/files 全部进入 invalid，不进 models
    for (const bad of ['bad-schema', 'bad-engine', 'bad-kind', 'missing-file', 'empty-file', 'escape-file', 'no-modelfile', 'bad-json', 'no-manifest']) {
      assert.ok(!ids.includes(bad), `${bad} 不应作为合法模型`);
      assert.ok(scanned.invalid.some((x) => x.dir.endsWith(bad)), `${bad} 应出现在 invalid 中`);
    }
    assert.ok(scanned.invalid.length > 0);
    assert.ok(scanned.invalid.every((x) => typeof x.error === 'string' && x.error.length > 0));
    assert.equal(scanned.modelsDir, MODELS_DIR);
  });

  it('排序稳定：online 在 offline 之前', () => {
    const ids = mod.scanModels().models.map((m) => m.id);
    assert.ok(ids.indexOf('ok-online') < ids.indexOf('ok-offline'));
  });

  it('能力判定据此给出 online/offline/vad', () => {
    const cap = mod.getCapability();
    assert.equal(cap.offline, true);
    assert.equal(cap.online, true);
    assert.equal(cap.vad, false);
  });

  it('pickModel 优先返回显式指定，否则返回第一个同类模型', () => {
    const models = [{ id: 'a', kind: 'offline' }, { id: 'b', kind: 'offline' }];
    assert.equal(mod.pickModel(models, 'offline', 'b').id, 'b');
    assert.equal(mod.pickModel(models, 'offline', 'nope').id, 'a');
    assert.equal(mod.pickModel(models, 'vad', null), null);
  });
});

describe('registerModel / deleteModel', () => {
  it('注册后可在扫描结果中出现，删除后消失', () => {
    const src = mkdtempSync(join(tmpdir(), 'asr-src-'));
    writeOfflineModel(src, { id: 'registered-model' });

    const registered = mod.registerModel(src);
    assert.equal(registered.success, true);
    assert.equal(registered.model.id, 'registered-model');
    assert.ok(existsSync(join(MODELS_DIR, 'registered-model', 'manifest.json')));

    const ids = mod.scanModels().models.map((m) => m.id);
    assert.ok(ids.includes('registered-model'));

    assert.deepEqual(mod.deleteModel('registered-model'), { success: true });
    assert.ok(!existsSync(join(MODELS_DIR, 'registered-model')));
    assert.ok(!mod.scanModels().models.some((m) => m.id === 'registered-model'));
  });

  it('已在 models 目录下的包视为就地注册，不重复拷贝', () => {
    const dir = join(MODELS_DIR, 'inplace');
    writeOfflineModel(dir, { id: 'inplace' });
    const r = mod.registerModel(dir);
    assert.equal(r.success, true);
    assert.equal(r.model.id, 'inplace');
    assert.deepEqual(readdirSync(dir).sort(), ['manifest.json', 'model.onnx', 'tokens.txt']);
  });

  it('非法源目录 → 明确失败（不静默成功）', () => {
    assert.equal(mod.registerModel('').success, false);
    assert.match(mod.registerModel(join(root, 'no-such-dir')).error, /path_not_found/);

    const badDir = mkdtempSync(join(tmpdir(), 'asr-bad-'));
    writeFileSync(join(badDir, 'manifest.json'), '{"schema":1}');
    const r = mod.registerModel(badDir);
    assert.equal(r.success, false);
    assert.match(r.error, /engine_unsupported/);
  });

  it('删除非法 id 拒绝执行，不会越界删除', () => {
    assert.deepEqual(mod.deleteModel('../etc'), { success: false, error: 'invalid_id' });
    assert.deepEqual(mod.deleteModel('nope'), { success: false, error: 'model_not_found' });
  });
});
