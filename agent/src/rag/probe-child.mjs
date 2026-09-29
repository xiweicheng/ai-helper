// agent/src/rag/probe-child.mjs - RAG 依赖探测子进程（由 detect.js spawn，独立新进程内检测）
//
// 为什么必须独立进程（R8，2026-09-29 实测）：
//   Node 对模块「求值失败」（模块代码执行阶段抛错，区别于「模块找不到」）在同一进程内
//   永久缓存——后续 import 永远重抛首个错误。长驻 daemon 内直接 import 探测依赖，一旦
//   在依赖不完整/安装进行中时失败，依赖装好后同进程重试永远误报失败（实测 8 次一键
//   安装验证全部失败，而磁盘与新进程均正常）。子进程每次从磁盘新鲜求值，检测结果
//   始终等于磁盘真实状态，也不会污染代理进程。
//
// 协议（stdout 单行 JSON，退出码恒为 0；结果以 JSON 为准）：
//   {"vectra":{"ok":true},"@huggingface/transformers":{"ok":false,"error":"..."}}
// 每个包独立 try/catch：一个失败不影响另一个的检测。
const TARGETS = ['vectra', '@huggingface/transformers'];
const ERROR_MAX = 300;

const result = {};
for (const name of TARGETS) {
  try {
    await import(name);
    result[name] = { ok: true };
  } catch (err) {
    const message = err && err.message ? String(err.message) : String(err);
    result[name] = { ok: false, error: message.slice(0, ERROR_MAX) };
  }
}

// stdout 写成功后再退出，避免数据未 flush 被截断；process.exit 防止个别库
// （onnxruntime/sharp）残留的 handle 让进程挂住不退出
const payload = `${JSON.stringify(result)}\n`;
await new Promise((resolvePromise) => process.stdout.write(payload, resolvePromise));
process.exit(0);
