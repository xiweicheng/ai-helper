// agent/src/asr/probe-child.mjs - ASR 依赖探测子进程（protocol: stdout 末行输出单行 JSON）
//
// 为什么必须是子进程（R8 教训，见 rag/detect.js）：Node 对模块「求值失败」在同一进程内
// 永久缓存。长驻 daemon 内直接 require 一旦在依赖不完整/安装进行中时失败，安装完成后
// 同进程重试永远误报失败。子进程探测 = 磁盘真实状态，且不会污染 daemon 进程。
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const out = { ok: false, version: null, exportKeys: [], error: null };

try {
  const mod = require('sherpa-onnx-node');
  const resolved = require.resolve('sherpa-onnx-node');
  out.ok = true;
  out.resolved = resolved;
  out.exportKeys = mod && typeof mod === 'object' ? Object.keys(mod).slice(0, 40) : [];
  // 版本从包自身 package.json 读取（不猜 API）
  try {
    const pkg = require('sherpa-onnx-node/package.json');
    out.version = pkg && pkg.version ? String(pkg.version) : null;
  } catch {
    out.version = null;
  }
} catch (err) {
  out.error = err && err.message ? err.message : String(err);
}

// 只输出一行 JSON，避免第三方库的日志噪音干扰解析（父进程从末行向前找首个 JSON）
process.stdout.write(`${JSON.stringify(out)}\n`);
process.exit(out.ok ? 0 : 1);
