// agent/test/unit/rag-detect-probe.unit.test.js
// R8 回归（2026-09-29 实测）：RAG 依赖检测必须在全新子进程执行。
//   背景：Node 对模块「求值失败」在同一进程内永久缓存——后续 import 永远重抛首个
//   错误（与「模块找不到」不同，后者不缓存）。长驻 daemon（server.js）内直接 import
//   探测依赖，一旦在依赖不完整/安装进行中时失败，依赖装好后同进程重试永远误报失败
//   （实测 8 次一键安装验证全部失败，而磁盘与新进程均正常）。
//   修复：detect.js 改为 spawn probe-child.mjs 子进程探测，结果始终等于磁盘真实
//   状态，并保留失败包的真实错误摘要（可诊断）。
// 测试策略：注入临时探测脚本模拟 失败/成功/挂死/崩溃，验证探测结果、错误摘要与
// 「失败 → 修复 → 成功」翻转能力，不依赖本机是否已安装 RAG 依赖。
// 注意：临时 HOME 隔离必须在动态 import 之前设置（logger 日志目录在模块加载时求值）
import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 临时 HOME 隔离：detect.js 引用 logger.js（插件端日志目录在模块加载时求值）
const home = mkdtempSync(join(tmpdir(), 'rag-probe-home-'));
process.env.HOME = home;

const {
  detectRagAvailable, resetRagDetection, runRagProbe, getLastRagProbeError,
  isNodeVersionSupported,
} = await import('../../src/rag/detect.js');

const scriptsDir = mkdtempSync(join(tmpdir(), 'rag-probe-scripts-'));
const nodeOk = isNodeVersionSupported();

/** 构造 probe 协议的 JSON 输出（与 probe-child.mjs 的输出格式一致） */
function probeJson(vectra, transformers) {
  const entry = ({ ok, error }) => (ok ? { ok: true } : { ok: false, error });
  return JSON.stringify({
    vectra: entry(vectra),
    '@huggingface/transformers': entry(transformers),
  });
}

/** 写入一个临时探测脚本（模拟 probe-child.mjs），返回路径 */
function writeScript(name, content) {
  const p = join(scriptsDir, name);
  writeFileSync(p, content, 'utf-8');
  return p;
}

after(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(scriptsDir, { recursive: true, force: true });
});

describe('RAG 检测子进程隔离（R8）', () => {
  test('失败 → 修复 → 成功：同一进程内可翻转，不缓存失败结果', { skip: !nodeOk }, async () => {
    const failScript = writeScript(
      'fail.mjs',
      `console.log(${JSON.stringify(probeJson({ ok: false, error: 'boom-vectra' }, { ok: true }))});`,
    );
    const okScript = writeScript(
      'ok.mjs',
      `console.log(${JSON.stringify(probeJson({ ok: true }, { ok: true }))});`,
    );

    // 探测失败：返回 false 且暴露真实错误摘要
    resetRagDetection();
    assert.equal(await detectRagAvailable({ probeScript: failScript }), false);
    assert.match(getLastRagProbeError(), /vectra/, '错误摘要应包含失败包名');
    assert.match(getLastRagProbeError(), /boom-vectra/, '错误摘要应包含真实错误信息');

    // 缓存语义：未重置时不再重复探测（即使换了可用脚本也返回缓存结果）
    assert.equal(await detectRagAvailable({ probeScript: okScript }), false);

    // 关键回归：重置后重新探测「成功」必须翻转（旧实现因进程内永久缓存永远失败）
    resetRagDetection();
    assert.equal(await detectRagAvailable({ probeScript: okScript }), true);
    assert.equal(getLastRagProbeError(), null, '成功时错误摘要应清空');
  });

  test('探测挂死：超时终止并报告 timeout（不永久挂起）', { skip: !nodeOk }, async () => {
    const hangScript = writeScript('hang.mjs', 'setTimeout(() => {}, 60000);');
    resetRagDetection();
    const t0 = Date.now();
    assert.equal(await detectRagAvailable({ probeScript: hangScript, timeoutMs: 400 }), false);
    assert.match(getLastRagProbeError(), /timeout/i);
    assert.ok(Date.now() - t0 < 10000, '超时终止应在限时内返回');
  });

  test('探测崩溃（无输出非零退出）：报告退出码', { skip: !nodeOk }, async () => {
    const crashScript = writeScript('crash.mjs', 'process.exit(3);');
    resetRagDetection();
    assert.equal(await detectRagAvailable({ probeScript: crashScript }), false);
    assert.match(getLastRagProbeError(), /exit code 3/);
  });

  test('真实探测脚本：协议结构正确（检测结果与磁盘状态一致）', { skip: !nodeOk }, async () => {
    const probe = await runRagProbe();
    assert.ok(probe.detail, `应返回可解析的探测详情: ${probe.errorSummary || 'no detail'}`);
    const v = probe.detail.vectra;
    const h = probe.detail['@huggingface/transformers'];
    assert.equal(typeof v.ok, 'boolean');
    assert.equal(typeof h.ok, 'boolean');
    if (!v.ok) assert.ok(v.error, 'vectra 失败必须带错误信息');
    if (!h.ok) assert.ok(h.error, '@huggingface/transformers 失败必须带错误信息');
    assert.equal(probe.ok, v.ok && h.ok, '整体可用性 = 两个探测项均通过');
    assert.equal(probe.errorSummary, probe.ok ? null : probe.errorSummary, '失败必须给出错误摘要');
    if (!probe.ok) assert.ok(probe.errorSummary, '失败必须给出错误摘要');
  });
});
