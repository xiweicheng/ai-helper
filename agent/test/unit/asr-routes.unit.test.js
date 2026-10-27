// agent/test/unit/asr-routes.unit.test.js
// /api/asr/* 端点契约测试：状态汇总、配置白名单、模型管理、整段转写错误分流。
// 不加载 sherpa-onnx-node（引擎失败路径本身就是用例之一），不起 HTTP 服务：
// 直接调 asrRouter(req, res, pathname, url, t, body) 并断言写出的状态码与 body。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let home;
let routes;
let cfg;

const LOCAL = '127.0.0.1';

before(async () => {
  // 临时 HOME + ASR_ROOT：配置、模型目录、日志全部隔离在临时目录
  home = mkdtempSync(join(tmpdir(), 'asr-routes-test-'));
  process.env.HOME = home;
  process.env.AI_HELPER_ASR_ROOT = join(home, 'asr');
  // 依赖探测结果取决于本机是否装了 sherpa-onnx-node（开发机装了就为 true），
  // 强制"不可用"，避免断言随机器状态飘移
  process.env.AI_HELPER_ASR_DEPS = '0';
  cfg = await import('../../src/asr/config.js');
  routes = await import('../../src/asr/routes.js');
  // 预置一个合法 offline 模型包（仅 manifest 校验，不加载 ONNX）
  const dir = join(cfg.MODELS_DIR, 'sense-test');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'tokens.txt'), 'a 1\n');
  writeFileSync(join(dir, 'model.onnx'), 'fake-onnx');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify({
    schema: 1,
    id: 'sense-test',
    engine: 'sherpa-onnx',
    kind: 'offline',
    name: '测试定稿模型',
    files: ['model.onnx', 'tokens.txt'],
    modelFile: 'model.onnx',
    tokensFile: 'tokens.txt',
  }));
});

after(() => {
  try { rmSync(home, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

// ==================== 测试替身 ====================

function makeReq(method, { origin = 'chrome-extension://abcdefghijklmnop', remoteAddress = LOCAL } = {}) {
  return {
    method,
    headers: origin ? { origin } : {},
    socket: { remoteAddress },
  };
}

function makeRes(req) {
  const res = {
    req,
    statusCode: null,
    headers: null,
    body: null,
    ended: false,
    writableEnded: false,
    destroyed: false,
    writeHead(status, headers) { res.statusCode = status; res.headers = headers; },
    end(payload) {
      res.body = payload ? JSON.parse(payload) : null;
      res.ended = true;
      res.writableEnded = true;
    },
  };
  return res;
}

/** 请求级翻译替身：把 key（和参数）原样带出，便于断言用了哪个文案 key */
const t = (key, params) => (params ? `${key}:${JSON.stringify(params)}` : key);

async function call(method, pathname, { body = {}, query = '', reqOpts } = {}) {
  const req = makeReq(method, reqOpts);
  const res = makeRes(req);
  const url = new URL(`http://${LOCAL}${pathname}${query}`);
  await routes.asrRouter(req, res, pathname, url, t, body);
  return res;
}

/** 生成一个合法 WAV（PCM16 / mono / 16k），幅度可调 */
function makeWav({ seconds = 0.25, sampleRate = 16000, amplitude = 0.5 } = {}) {
  const frames = Math.round(sampleRate * seconds);
  const dataSize = frames * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);          // PCM
  buf.writeUInt16LE(1, 22);          // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byteRate
  buf.writeUInt16LE(2, 32);          // blockAlign
  buf.writeUInt16LE(16, 34);         // bitsPerSample
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < frames; i += 1) {
    const v = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * amplitude * 32767);
    buf.writeInt16LE(v, 44 + i * 2);
  }
  return buf;
}

// ==================== 用例 ====================

describe('isDepsIndependentPath：依赖缺失时仍可访问的端点', () => {
  test('status / config / models 及其子路径放行，其余（transcribe/warmup）拦截', () => {
    for (const p of ['/api/asr/status', '/api/asr/config', '/api/asr/models', '/api/asr/models/scan', '/api/asr/models/x']) {
      assert.equal(routes.isDepsIndependentPath(p), true, `${p} 应放行`);
    }
    for (const p of ['/api/asr/transcribe', '/api/asr/warmup', '/api/asr/model', '/api/asr/statusX']) {
      assert.equal(routes.isDepsIndependentPath(p), false, `${p} 应拦截`);
    }
  });
});

describe('GET /api/asr/status', () => {
  test('未装依赖：available=false、reason=deps_missing，但仍返回配置与模型清单', async () => {
    const res = await call('GET', '/api/asr/status');
    assert.equal(res.statusCode, 200);
    const b = res.body;
    assert.equal(b.success, true);
    assert.equal(b.available, false);
    assert.equal(b.enabled, false);
    assert.equal(b.reason, 'deps_missing');
    assert.equal(b.deps.ready, false);
    assert.equal(b.deps.packageOnDisk, false);
    assert.deepEqual(b.languages, cfg.SUPPORTED_LANGUAGES);
    assert.equal(b.maxRecordingMs, cfg.MAX_RECORDING_MS);
    assert.equal(b.modelsReady, true, '有 offline 模型 → 模型这一环是齐的');
    assert.deepEqual(b.capability, { online: false, offline: true, vad: false });
    assert.equal(b.models.length, 1);
    assert.equal(b.models[0].id, 'sense-test');
    assert.equal(b.models[0].dir, undefined, '不得对外暴露本机绝对路径');
    assert.equal(b.selected.offline, 'sense-test');
    assert.equal(b.install.running, false);
    assert.ok(Array.isArray(b.invalidModels));
  });

  test('CORS：chrome-extension 来源被回显，并带 Vary', async () => {
    const res = await call('GET', '/api/asr/status');
    assert.equal(res.headers['Access-Control-Allow-Origin'], 'chrome-extension://abcdefghijklmnop');
    assert.equal(res.headers['Vary'], 'Origin');
  });

  test('非扩展来源不回显 CORS 头（内网页面无法直接读响应）', async () => {
    const res = await call('GET', '/api/asr/status', { reqOpts: { origin: 'http://evil.example' } });
    assert.equal(res.headers['Access-Control-Allow-Origin'], undefined);
  });
});

describe('POST /api/asr/config', () => {
  test('只接受白名单字段，非法语言回落 auto', async () => {
    const res = await call('POST', '/api/asr/config', {
      body: { enabled: true, language: 'zh', unknownField: 'x', streamingModelId: null },
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.config.enabled, true);
    assert.equal(res.body.config.language, 'zh');
    assert.equal(res.body.config.unknownField, undefined, '白名单外字段不得写入');

    const bad = await call('POST', '/api/asr/config', { body: { language: 'fr' } });
    assert.equal(bad.body.config.language, 'auto', '非法语言回落默认 auto');
    assert.equal(bad.body.config.enabled, true, '未传的字段保持原值');

    // 恢复成 zh，供后续用例断言持久化
    await call('POST', '/api/asr/config', { body: { language: 'zh' } });
  });

  test('模型选择：非法 id 收敛为 null，合法 id 保留', async () => {
    const bad = await call('POST', '/api/asr/config', { body: { offlineModelId: '../etc/passwd' } });
    assert.equal(bad.body.config.offlineModelId, null);

    const good = await call('POST', '/api/asr/config', { body: { offlineModelId: 'sense-test' } });
    assert.equal(good.body.config.offlineModelId, 'sense-test');
  });

  test('idleUnloadMs 数值化；配置持久化后 status 同步反映', async () => {
    await call('POST', '/api/asr/config', { body: { idleUnloadMs: 1234 } });
    const st = await call('GET', '/api/asr/status');
    assert.equal(st.body.enabled, true);
    assert.equal(st.body.language, 'zh');
    // 依赖未就绪时 available 恒为 false（三分离：deps × models × enabled）
    assert.equal(st.body.available, false);
    assert.equal(st.body.reason, 'deps_missing');
  });
});

describe('POST /api/asr/transcribe：错误分流', () => {
  test('非 POST → 404', async () => {
    const res = await call('GET', '/api/asr/transcribe');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
  });

  test('缺 audio → 400 asr.emptyAudio', async () => {
    const res = await call('POST', '/api/asr/transcribe', { body: {} });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'asr.emptyAudio');
  });

  test('音频为空字节 → 400 asr.emptyAudio', async () => {
    const res = await call('POST', '/api/asr/transcribe', { body: { audio: '' } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.error, 'asr.emptyAudio');
  });

  test('非 WAV 音频 → 400 unsupported_audio（解析在引擎之前）', async () => {
    const audio = Buffer.from('not a wav at all, definitely').toString('base64');
    const res = await call('POST', '/api/asr/transcribe', { body: { audio } });
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, 'unsupported_audio');
    assert.equal(res.body.error, 'asr.unsupportedAudio');
  });

  test('静音音频 → 200 + 空文本（不跑模型，前端据此提示未识别到语音）', async () => {
    const audio = makeWav({ amplitude: 0 }).toString('base64');
    const res = await call('POST', '/api/asr/transcribe', { body: { audio } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.text, '');
    assert.equal(res.body.durationMs, 250);
  });

  test('有语音但引擎不可加载 → 500 code=internal（不泄露内部堆栈）', async () => {
    const audio = makeWav().toString('base64');
    const res = await call('POST', '/api/asr/transcribe', { body: { audio } });
    assert.equal(res.statusCode, 500);
    assert.equal(res.body.success, false);
    assert.equal(res.body.code, 'internal');
    assert.equal(res.body.error, 'asr.transcribeFailed');
    assert.equal(res.body.stack, undefined);
  });
});

describe('模型管理', () => {
  test('GET /api/asr/models：capability + 对外字段（隐藏路径）', async () => {
    const res = await call('GET', '/api/asr/models');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.deepEqual(res.body.capability, { online: false, offline: true, vad: false });
    assert.equal(res.body.models[0].id, 'sense-test');
    for (const hidden of ['dir', 'modelFile', 'tokensFile', 'hashes']) {
      assert.equal(res.body.models[0][hidden], undefined, `不应暴露 ${hidden}`);
    }
  });

  test('POST /api/asr/models/scan：重新扫描并返回 capability', async () => {
    const res = await call('POST', '/api/asr/models/scan');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.capability.offline, true);
  });

  test('POST /api/asr/models/pick：非本机来源直接拒绝（目录选择器零上传）', async () => {
    const res = await call('POST', '/api/asr/models/pick', { reqOpts: { remoteAddress: '10.1.2.3' } });
    assert.equal(res.body.success, false);
    assert.equal(res.body.available, false);
    assert.equal(res.body.error, 'remote-source');
  });

  test('DELETE /api/asr/models/{id}：删除存在 / 不存在 / 非法 id 的错误分流', async () => {
    const ok = await call('DELETE', '/api/asr/models/sense-test');
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(ok.body, { success: true });

    const again = await call('DELETE', '/api/asr/models/sense-test');
    assert.equal(again.statusCode, 400);
    assert.equal(again.body.error, 'model_not_found');

    const bad = await call('DELETE', '/api/asr/models/..%2F..%2Fetc');
    assert.equal(bad.statusCode, 400);
    assert.equal(bad.body.success, false);
    assert.equal(bad.body.error, 'invalid_id');
  });
});

describe('模型被删除后的降级（无定稿模型）', () => {
  test('status：模型与能力同步变为缺失', async () => {
    const res = await call('GET', '/api/asr/status');
    assert.equal(res.body.modelsReady, false);
    assert.equal(res.body.capability.offline, false);
    assert.equal(res.body.models.length, 0);
    // 依赖仍缺失 → 原因优先指向 deps（逐项展示，不模糊成「不可用」）
    assert.equal(res.body.reason, 'deps_missing');
  });

  test('transcribe → 409 model_missing（不进入引擎）', async () => {
    const audio = makeWav().toString('base64');
    const res = await call('POST', '/api/asr/transcribe', { body: { audio } });
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'model_missing');
    assert.equal(res.body.error, 'asr.modelMissing');
  });

  test('warmup → 409 model_missing', async () => {
    const res = await call('POST', '/api/asr/warmup');
    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'model_missing');
  });
});

describe('推荐模型下载端点', () => {
  test('下载相关端点不依赖 sherpa 依赖（装不上依赖也要能下模型/看状态）', () => {
    for (const p of [
      '/api/asr/models/catalog',
      '/api/asr/models/download',
      '/api/asr/models/download/status',
      '/api/asr/models/download/cancel',
    ]) {
      assert.equal(routes.isDepsIndependentPath(p), true, `${p} 应放行`);
    }
  });

  test('GET /api/asr/models/catalog：清单含体积与安装态，不泄露仓库细节', async () => {
    const res = await call('GET', '/api/asr/models/catalog');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.models.length, 2);
    for (const item of res.body.models) {
      assert.equal(item.installed, false, '临时模型目录里没有推荐包');
      assert.ok(item.totalBytes > 0);
      assert.equal(item.repo, undefined);
      assert.equal(item.manifest, undefined);
    }
  });

  test('GET /api/asr/models/download/status：从未下载 → 全零快照', async () => {
    const res = await call('GET', '/api/asr/models/download/status');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.running, false);
    assert.equal(res.body.done, false);
    assert.deepEqual(res.body.targets, []);
  });

  test('POST /api/asr/models/download：非法 id 不触发下载（200 + skipped）', async () => {
    const res = await call('POST', '/api/asr/models/download', { body: { ids: ['../../etc/passwd'] } });
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.started, false);
    assert.equal(res.body.skipped, 'no_targets');
  });

  test('POST /api/asr/models/download/cancel：没在下载时 stopped=false，不产生假状态', async () => {
    const res = await call('POST', '/api/asr/models/download/cancel');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.stopped, false);
  });

  test('status 带出固定模型目录、推荐清单与下载快照（配置页一次拿全）', async () => {
    const res = await call('GET', '/api/asr/status');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.modelsDir, cfg.MODELS_DIR, '模型目录固定，不受用户选择影响');
    assert.equal(res.body.modelsDirDisplay, '~/asr/models', '展示时折叠 home 前缀');
    assert.equal(res.body.catalog.length, 2);
    assert.equal(res.body.download.running, false);
  });
});

describe('未知路径', () => {
  test('返回 404 + error.unknownApiPath', async () => {
    const res = await call('GET', '/api/asr/nope');
    assert.equal(res.statusCode, 404);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error, 'error.unknownApiPath');
  });
});
