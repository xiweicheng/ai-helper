// agent/src/asr/offline-worker.js - offline 定稿推理的 worker 入口
//
// 这个文件只跑在 worker_threads 里。职责单一：收一包数据 → 调 transcribe → 按 id 回包。
//
// 为什么必须独立线程：sherpa-onnx 的 decode 是**同步原生调用**（几百毫秒到数十秒）。
// 摆在主线程的 WS 回调 / HTTP handler 里，整个 agent 事件循环会停摆 —— 期间 /health 探活、
// cancel 帧、聊天流、工具执行全部排队。用户看到的是「点停止后代理像死了一样」。
//
// 线程内自带一份 engine.js 的模块实例（ESM 在 worker 里重新求值），所以 recognizer
// 只在这一侧加载一次，不会和主线程各存一份几百 MB 的 ONNX 会话。
//
// transcribeModule 可由 workerData 注入：单测传假实现，生产走 ./transcribe.js。

import { parentPort, workerData } from 'worker_threads';

let implPromise = null;

/** 懒加载转写实现（失败不缓存，下次重试） */
function loadImpl() {
  if (!implPromise) {
    const spec = workerData && workerData.transcribeModule
      ? workerData.transcribeModule
      : './transcribe.js';
    implPromise = import(new URL(spec, import.meta.url).href).catch((err) => {
      implPromise = null;
      throw err;
    });
  }
  return implPromise;
}

/** 释放本线程加载的原生引擎（terminate 前调用，让 onnxruntime 有机会收尾） */
async function disposeEngines() {
  try {
    const engine = await import('./engine.js');
    engine.disposeAllEngines();
  } catch {
    // 引擎未加载或释放失败：terminate 时由进程回收
  }
}

async function handleTask(msg) {
  const { id, kind } = msg;

  if (kind === 'warmup') {
    const engine = await import('./engine.js');
    const warmed = [];
    const failed = [];
    const offline = msg.models && msg.models.offline;
    if (offline) {
      try {
        engine.getOfflineRecognizer(offline, msg.opts || {});
        warmed.push('offline');
      } catch (err) {
        failed.push({ kind: 'offline', error: err && err.message ? err.message : String(err) });
      }
    }
    return { warmed, failed };
  }

  const impl = await loadImpl();
  if (kind === 'wav') {
    // ArrayBuffer → Buffer 是零拷贝视图
    return impl.transcribeWav(Buffer.from(msg.buffer), msg.opts || {});
  }
  if (kind === 'samples') {
    return impl.transcribeSamples(msg.samples, msg.opts || {});
  }
  throw new Error(`unknown task kind: ${kind}`);
}

if (parentPort) {
  parentPort.on('message', async (msg) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'dispose') {
      await disposeEngines();
      parentPort.postMessage({ type: 'disposed' });
      return;
    }

    if (msg.id === undefined) return;
    try {
      const result = await handleTask(msg);
      parentPort.postMessage({ id: msg.id, ok: true, result });
    } catch (err) {
      parentPort.postMessage({
        id: msg.id,
        ok: false,
        error: {
          message: err && err.message ? err.message : String(err),
          code: err && err.code ? err.code : undefined,
        },
      });
    }
  });
}