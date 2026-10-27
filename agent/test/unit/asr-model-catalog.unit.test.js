// agent/test/unit/asr-model-catalog.unit.test.js
// 推荐模型「一键下载」的契约测试：
//   1. 清单自洽：id 字符集 / files 与 manifest.files 一致 / sha256 一一对应 / schema 对齐扫描器
//   2. 调用方传入的 id 一律走白名单：非法输入回落默认组合或空列表，不存在路径穿越入口
//   3. 下载地址构建：端点覆盖、尾斜杠归一化、文件名转义
//   4. 下载任务状态机：未开始 / 进行中幂等重入 / 取消收敛 / 失败降级为「未安装」
//   5. 半成品 .<id>.part 目录对模型扫描不可见（否则会出现「非法模型」的噪音告警）
//
// 注意：HOME 与 AI_HELPER_ASR_ROOT 必须在动态 import 之前设置——
// config.js / model-download.js 在模块求值时就会算路径并读状态文件。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let home;
let cfg;
let catalog;
let packMod;
let dl;
let install;
let MODELS_DIR;

/** 测试用的 t()：把 key 和参数摊平成可断言的一行字符串 */
const fmt = (key, params) => (params && params.message ? `${key}:${params.message}` : key);

/** 起一个本地假镜像；返回时 AI_HELPER_ASR_HF_ENDPOINT 已指向它 */
async function withMirror(handler, fn) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const prev = process.env.AI_HELPER_ASR_HF_ENDPOINT;
  process.env.AI_HELPER_ASR_HF_ENDPOINT = url;
  try {
    return await fn(url);
  } finally {
    if (prev === undefined) delete process.env.AI_HELPER_ASR_HF_ENDPOINT;
    else process.env.AI_HELPER_ASR_HF_ENDPOINT = prev;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

/** 等下载任务收敛（done=true 或超时抛错） */
async function waitDownloadDone(timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const status = dl.getModelDownloadStatus();
    if (status.done === true) return status;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`download did not settle in ${timeoutMs}ms`);
}

/** 在固定模型目录里伪造一个「已安装」的包（校验只看结构与文件非空，不看字节大小） */
function writeInstalledEntry(entry) {
  const dir = join(MODELS_DIR, entry.id);
  mkdirSync(dir, { recursive: true });
  for (const file of entry.files) writeFileSync(join(dir, file.name), 'x');
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(entry.manifest, null, 2));
  return dir;
}

before(async () => {
  home = mkdtempSync(join(tmpdir(), 'asr-catalog-test-'));
  process.env.HOME = home;
  process.env.AI_HELPER_ASR_ROOT = join(home, 'asr');
  // 依赖探测与本文件无关，固定成「不可用」避免断言随开发机状态飘移
  process.env.AI_HELPER_ASR_DEPS = '0';

  cfg = await import('../../src/asr/config.js');
  catalog = await import('../../src/asr/model-catalog.js');
  packMod = await import('../../src/asr/model-pack.js');
  dl = await import('../../src/asr/model-download.js');
  install = await import('../../src/asr/install.js');

  MODELS_DIR = cfg.MODELS_DIR;
  mkdirSync(MODELS_DIR, { recursive: true });
});

after(() => {
  delete process.env.AI_HELPER_ASR_HF_ENDPOINT;
  try { rmSync(home, { recursive: true, force: true }); } catch { /* 忽略 */ }
});

describe('模型清单自洽性', () => {
  it('id 只含允许字符（与 normalizeModelId 的字符集一致）', () => {
    for (const entry of catalog.MODEL_CATALOG) {
      assert.match(entry.id, /^[A-Za-z0-9._-]{1,96}$/, `非法 id: ${entry.id}`);
      assert.equal(packMod.normalizeModelId(entry.id), entry.id, `扫描器必须认可 id: ${entry.id}`);
    }
    const ids = catalog.MODEL_CATALOG.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length, 'id 不得重复');
  });

  it('files 与 manifest.files 一致，且每个文件都有 sha256', () => {
    for (const entry of catalog.MODEL_CATALOG) {
      const names = entry.files.map((f) => f.name);
      assert.deepEqual([...names].sort(), [...entry.manifest.files].sort(), `${entry.id}: files 不一致`);
      for (const file of entry.files) {
        assert.ok(file.size > 0, `${entry.id}/${file.name}: size 必须为正`);
        assert.equal(
          entry.manifest.sha256[file.name],
          file.sha256,
          `${entry.id}/${file.name}: manifest.sha256 必须与清单一致（否则下载校验必失败）`,
        );
        assert.match(file.sha256, /^[0-9a-f]{64}$/);
      }
      assert.equal(entry.manifest.id, entry.id);
      assert.equal(entry.manifest.kind, entry.kind);
    }
  });

  it('manifest 能通过扫描器校验（下载完即可用，不需要人工补字段）', () => {
    for (const entry of catalog.MODEL_CATALOG) {
      const dir = writeInstalledEntry(entry);
      const checked = packMod.readModelManifest(dir);
      assert.equal(checked.ok, true, `${entry.id}: ${checked.error}`);
      assert.equal(checked.model.arch, entry.manifest.arch);
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('getEntryBytes 是文件体积之和；CATALOG_SIZE 恒等于条目数', () => {
    for (const entry of catalog.MODEL_CATALOG) {
      const sum = entry.files.reduce((acc, f) => acc + f.size, 0);
      assert.equal(catalog.getEntryBytes(entry), sum);
      assert.ok(sum > 0);
    }
    assert.equal(dl.CATALOG_SIZE, catalog.MODEL_CATALOG.length);
  });
});

describe('id 白名单解析', () => {
  it('getCatalogEntry：未知 id / 非字符串一律 null', () => {
    assert.equal(catalog.getCatalogEntry('nope'), null);
    assert.equal(catalog.getCatalogEntry('../../etc/passwd'), null);
    assert.equal(catalog.getCatalogEntry(null), null);
    assert.equal(catalog.getCatalogEntry(undefined), null);
    assert.equal(catalog.getCatalogEntry(42), null);
    assert.ok(catalog.getCatalogEntry('sense-voice-zh-en-ja-ko-yue'));
  });

  it('空 / 非数组一律回落默认组合', () => {
    for (const input of [undefined, null, [], 'sense-voice-zh-en-ja-ko-yue', 0]) {
      const entries = catalog.resolveCatalogEntries(input);
      assert.deepEqual(entries.map((e) => e.id), catalog.DEFAULT_DOWNLOAD_IDS);
    }
  });

  it('只保留清单内的 id（去重）', () => {
    const one = catalog.resolveCatalogEntries(['sense-voice-zh-en-ja-ko-yue']);
    assert.deepEqual(one.map((e) => e.id), ['sense-voice-zh-en-ja-ko-yue']);

    const dup = catalog.resolveCatalogEntries([
      'streaming-zipformer-bilingual-zh-en',
      'streaming-zipformer-bilingual-zh-en',
    ]);
    assert.deepEqual(dup.map((e) => e.id), ['streaming-zipformer-bilingual-zh-en']);
  });

  it('全是非法 id → 空列表（不会回落，避免偷偷下几百 MB）', () => {
    assert.deepEqual(catalog.resolveCatalogEntries(['../escape', '../../etc/passwd', '']), []);
  });
});

describe('下载地址构建', () => {
  it('AI_HELPER_ASR_HF_ENDPOINT 覆盖生效，且吃掉尾部斜杠', () => {
    const prev = process.env.AI_HELPER_ASR_HF_ENDPOINT;
    try {
      process.env.AI_HELPER_ASR_HF_ENDPOINT = 'https://mirror.example.com///';
      assert.equal(catalog.resolveHfEndpoint(), 'https://mirror.example.com');
      assert.equal(
        catalog.buildFileUrl('org/repo', 'model.int8.onnx'),
        'https://mirror.example.com/org/repo/resolve/main/model.int8.onnx',
      );
      assert.equal(
        catalog.buildFileUrl('org/repo', 'a b.txt'),
        'https://mirror.example.com/org/repo/resolve/main/a%20b.txt',
      );
    } finally {
      if (prev === undefined) delete process.env.AI_HELPER_ASR_HF_ENDPOINT;
      else process.env.AI_HELPER_ASR_HF_ENDPOINT = prev;
    }
  });

  it('非法覆盖值（非 http/https）被忽略，回落默认端点', () => {
    const prev = process.env.AI_HELPER_ASR_HF_ENDPOINT;
    try {
      process.env.AI_HELPER_ASR_HF_ENDPOINT = 'file:///etc/passwd';
      assert.match(catalog.resolveHfEndpoint(), /^https?:\/\//);
      assert.ok(catalog.buildFileUrl('org/repo', 'tokens.txt').startsWith(`${catalog.resolveHfEndpoint()}/`));
    } finally {
      if (prev === undefined) delete process.env.AI_HELPER_ASR_HF_ENDPOINT;
      else process.env.AI_HELPER_ASR_HF_ENDPOINT = prev;
    }
  });
});

describe('toPublicCatalog', () => {
  it('标记 installed 且不泄露 repo / manifest 等内部细节', () => {
    const view = catalog.toPublicCatalog({ installedIds: new Set(['sense-voice-zh-en-ja-ko-yue']) });
    assert.equal(view.length, catalog.MODEL_CATALOG.length);
    const hit = view.find((x) => x.id === 'sense-voice-zh-en-ja-ko-yue');
    assert.equal(hit.installed, true);
    assert.equal(view.find((x) => x.id === 'streaming-zipformer-bilingual-zh-en').installed, false);
    for (const item of view) {
      assert.equal(item.repo, undefined);
      assert.equal(item.manifest, undefined);
      assert.equal(item.files, undefined);
      assert.ok(item.totalBytes > 0);
    }
  });

  it('installedIds 传数组同样生效；不传则全部未安装', () => {
    const byArray = catalog.toPublicCatalog({ installedIds: ['streaming-zipformer-bilingual-zh-en'] });
    assert.deepEqual(byArray.map((x) => x.installed), [false, true]);
    assert.ok(catalog.toPublicCatalog().every((x) => x.installed === false));
  });
});

describe('下载任务状态机', () => {
  it('从未下载 → 全零快照（前端可无脑渲染）', () => {
    const s = dl.getModelDownloadStatus();
    assert.equal(s.running, false);
    assert.equal(s.done, false);
    assert.equal(s.success, false);
    assert.equal(s.aborted, false);
    assert.equal(s.bytesDone, 0);
    assert.equal(s.bytesTotal, 0);
    assert.deepEqual(s.targets, []);
    assert.equal(dl.isModelDownloadRunning(), false);
  });

  it('全是非法 id → skipped: no_targets，不产生任务', () => {
    const r = dl.startModelDownload(['../../etc/passwd'], fmt);
    assert.equal(r.started, false);
    assert.equal(r.skipped, 'no_targets');
    assert.equal(dl.getModelDownloadStatus().done, false);
  });

  it('镜像返回 404 → 失败降级（success=false + 具体原因），半成品目录不进模型列表', async () => {
    await withMirror((req, res) => { res.writeHead(404); res.end('nope'); }, async () => {
      const started = dl.startModelDownload(['sense-voice-zh-en-ja-ko-yue'], fmt);
      assert.equal(started.started, true);
      assert.deepEqual(started.ids, ['sense-voice-zh-en-ja-ko-yue']);

      const s = await waitDownloadDone();
      assert.equal(s.running, false);
      assert.equal(s.success, false);
      assert.equal(s.aborted, false);
      assert.match(s.error, /http_404/);
      assert.equal(s.targets[0].phase, 'failed');
      assert.match(s.targets[0].error, /model\.int8\.onnx/);
      assert.ok(s.finishedAt > 0);
    });

    const scanned = packMod.scanModels();
    assert.ok(!scanned.models.some((m) => m.id === 'sense-voice-zh-en-ja-ko-yue'));
    assert.ok(
      !scanned.invalid.some((x) => x.name.startsWith('.')),
      '点开头的 .<id>.part 目录是下载中间态，不该出现在非法模型列表',
    );
  });

  it('Content-Length 与清单不符 → 提前失败，不白下几百 MB', async () => {
    await withMirror((req, res) => {
      res.writeHead(200, { 'content-length': '5' });
      res.end('12345');
    }, async () => {
      dl.startModelDownload(['sense-voice-zh-en-ja-ko-yue'], fmt);
      const s = await waitDownloadDone();
      assert.equal(s.success, false);
      assert.match(s.error, /size_mismatch/);
    });
  });

  it('下载中重复调用 → alreadyRunning（不重复起任务），取消后收敛为 aborted', async () => {
    // 故意不响应：让任务停在 downloading，模拟慢速大文件
    await withMirror(() => { /* keep pending */ }, async () => {
      const first = dl.startModelDownload(['streaming-zipformer-bilingual-zh-en'], fmt);
      assert.equal(first.started, true);
      await new Promise((resolve) => setTimeout(resolve, 60));
      assert.equal(dl.isModelDownloadRunning(), true);

      const again = dl.startModelDownload(['streaming-zipformer-bilingual-zh-en'], fmt);
      assert.equal(again.started, false);
      assert.equal(again.alreadyRunning, true, '重复点击必须是幂等语义，不能当失败');
      assert.deepEqual(again.ids, ['streaming-zipformer-bilingual-zh-en']);

      assert.equal(dl.stopModelDownload(), true);
      const s = dl.getModelDownloadStatus();
      assert.equal(s.running, false);
      assert.equal(s.done, true);
      assert.equal(s.aborted, true);
      assert.equal(s.success, false);

      // 等 abort 的拒绝在任务内部落定，确认不会再被改回 running
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.equal(dl.isModelDownloadRunning(), false);
      assert.equal(dl.getModelDownloadStatus().aborted, true);
    });

    // 没在跑的时候取消：返回 false，不产生假状态
    assert.equal(dl.stopModelDownload(), false);
  });

  it('目标已全部安装 → skipped: already_installed（不重复下载）', () => {
    const dirs = catalog.MODEL_CATALOG.map((entry) => writeInstalledEntry(entry));
    try {
      const r = dl.startModelDownload(undefined, fmt);
      assert.equal(r.started, false);
      assert.equal(r.skipped, 'already_installed');
    } finally {
      for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('依赖安装状态字段契约（前端判定依据）', () => {
  it('只暴露 running/done/success 等布尔字段，没有 status —— 前端不得再判 status', () => {
    const s = install.getAsrInstallStatus();
    for (const key of ['running', 'done', 'success', 'everSucceeded']) {
      assert.equal(typeof s[key], 'boolean', `${key} 必须是布尔字段`);
    }
    assert.equal(s.status, undefined, '服务端不返回 status：前端若判 install.status 会恒为 undefined');
    assert.ok(Array.isArray(s.logTail));
    assert.ok(Array.isArray(s.packages) && s.packages.length > 0);
  });

  it('固定模型目录：路径由 ASR_ROOT 推导，展示时折叠 home 前缀', () => {
    assert.equal(cfg.MODELS_DIR, join(process.env.AI_HELPER_ASR_ROOT, 'models'));
    // 配置页展示用 ~ 开头，避免暴露用户名长路径；测试里 HOME 被重定向到临时目录
    assert.equal(cfg.getModelsDirDisplay(), '~/asr/models');
  });
});
