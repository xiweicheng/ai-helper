// src/shared/chat-client.js - 统一聊天补全客户端（辅助调用收口）
//
// 背景：所有非主循环的辅助 LLM 调用（反思/工具预筛选/上下文压缩/视觉转述等）
// 原先硬编码 stream:false。部分企业网关会在非流式请求上追加 stream_options，
// 导致模型端报 "stream 与 stream_options 必须匹配" 的错误（模型仅支持流式）。
// 本模块让这些调用统一跟随配置页"流式输出"总开关（streamEnabled）：
// 开启时以 stream:true + stream_options.include_usage 发起并静默聚合 SSE，
// 返回与非流式完全相同形状的 { choices, usage } 数据，下游解析逻辑零改动。
//
// 主对话流（react-loop）不走本模块：它需要把 chunk 实时推送到 side panel；
// 本模块只服务"拿完整结果即用"的后台辅助调用。

/**
 * 从配置对象解析流式开关（getStoredConfig 的 streamConfig.streamEnabled 优先，
 * 兼容直接携带 streamEnabled 的裸配置；未设置视为开启，与全局默认一致）
 * @param {Object} [config]
 * @returns {boolean}
 */
export function resolveUseStream(config) {
  const v = config?.streamConfig?.streamEnabled !== undefined
    ? config.streamConfig.streamEnabled
    : config?.streamEnabled;
  return v !== false;
}

/**
 * 无配置对象场景（side panel / 独立 storage 读取方）直接从 storage 读总开关
 * @returns {Promise<boolean>}
 */
export async function readStreamEnabledFromStorage() {
  const res = await new Promise((resolve) => {
    try {
      chrome.storage.local.get(['streamEnabled'], resolve);
    } catch {
      resolve({});
    }
  });
  return res?.streamEnabled !== false;
}

/**
 * 按流式开关改写请求体：开启时补 stream/stream_options（含 include_usage，
 * 保证流式下 token 统计不丢），关闭时显式 stream:false 并移除 stream_options
 * @param {Object} body
 * @param {boolean} useStream
 * @returns {Object} 改写后的新对象（不修改入参）
 */
export function applyStreamToBody(body, useStream) {
  const out = { ...body };
  if (useStream) {
    out.stream = true;
    out.stream_options = { ...(out.stream_options || {}), include_usage: true };
  } else {
    out.stream = false;
    delete out.stream_options;
  }
  return out;
}

/**
 * 判断响应是否为 SSE 事件流（部分测试替身/网关无 headers 时返回 false，回落 JSON 解析）
 */
function isEventStreamResponse(response) {
  try {
    const ct = typeof response.headers?.get === 'function'
      ? response.headers.get('Content-Type') || ''
      : '';
    return String(ct).toLowerCase().includes('event-stream');
  } catch {
    return false;
  }
}

/**
 * 静默聚合 SSE 流为 OpenAI 非流式形状的响应对象。
 * 兼容 delta.content / message.content / text 三种增量格式；
 * usage 取自 stream_options.include_usage 的最终独立 chunk；
 * done 时给残留行补换行，防止无尾换行的网关丢末块。
 * 网关在流内发 error 数据时直接抛出（上层不得误归因 empty_summary）；
 * 带空闲超时：fetchWithTimeout 预算只覆盖到响应头，headers 后卡流靠本超时兜底。
 * 本常量为全工程 SSE 空闲超时的单一来源（主循环 readSSEStream 的 STREAM_IDLE_TIMEOUT_MS 亦由此导入）。
 * @param {Response} response
 * @param {{ idleTimeoutMs?: number }} [opts]
 * @returns {Promise<{ choices: Array<{ message: { role: string, content: string } }>, usage: Object|null }>}
 */
export const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 120000;

export async function readChatSSE(response, { idleTimeoutMs = DEFAULT_STREAM_IDLE_TIMEOUT_MS } = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullContent = '';
  let usage = null;

  try {
    while (true) {
      // 空闲超时：每轮 read 与定时器 race，到点 cancel 释放挂起的读并抛可识别错误
      let timer;
      let readResult;
      try {
        readResult = await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`响应流空闲超时 CHAT_STREAM_IDLE_TIMEOUT ${idleTimeoutMs}ms`)),
              idleTimeoutMs
            );
          }),
        ]);
      } catch (err) {
        try { await reader.cancel(); } catch { /* 替身/已关闭流可能无法 cancel */ }
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
      }

      const { done, value } = readResult;
      if (done) {
        // flush：decoder 尾部残留的半个 UTF-8 序列补出；跨块多字节字符靠 stream:true 保持状态
        buffer += decoder.decode();
        buffer += String.fromCharCode(10);
      } else {
        buffer += decoder.decode(value, { stream: true });
      }
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        let data = '';
        if (line.startsWith('data:')) {
          data = line.substring(5).trim();
        }
        if (!data || data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          // 网关在 SSE 流内报错：抛出带后端原因的异常，不能当非法行吞掉
          if (parsed.error) {
            const msg = typeof parsed.error === 'string' ? parsed.error : (parsed.error.message || JSON.stringify(parsed.error));
            throw new Error(`SSE_ERROR: ${msg}`);
          }
          // usage 在独立最终 chunk（choices 为空）中返回，须在取 delta 前提取
          if (parsed.usage) usage = parsed.usage;
          const delta = parsed.choices?.[0]?.delta?.content
            || parsed.choices?.[0]?.message?.content
            || parsed.choices?.[0]?.text
            || '';
          if (delta) fullContent += delta;
        } catch (err) {
          if (err instanceof SyntaxError) {
            // 非法行忽略（不同网关 SSE 格式差异），不中断聚合
            continue;
          }
          throw err;
        }
      }

      if (done) break;
    }
  } finally {
    try { reader.releaseLock(); } catch { /* 替身可能无 releaseLock */ }
  }

  return {
    choices: [{ message: { role: 'assistant', content: fullContent } }],
    usage,
  };
}

/**
 * 统一的聊天补全调用：按 useStream 决定协议形态，无论流式与否返回相同形状。
 * 非 2xx 时读取并回传响应正文（errorText）：网关的 stream/stream_options 类报错
 * 正文只出现在 4xx body 里，吞掉则 UI 只能显示裸状态码，拿不到真实根因（口径同主循环）。
 * @param {string} apiUrl - chat/completions 完整地址
 * @param {Object} options
 * @param {Object} options.headers
 * @param {Object} options.body - 请求体（stream 字段由本函数按开关改写）
 * @param {boolean} options.useStream - 是否走流式（调用方经 resolveUseStream/ storage 读取传入）
 * @param {AbortSignal} [options.signal]
 * @param {Function} [options.fetchImpl] - fetch 替身，默认全局 fetch；后台传 fetchWithRetry 包装以保留重试语义
 * @param {number} [options.streamIdleTimeoutMs] - SSE 两块间最大空闲预算（默认 120s）
 * @returns {Promise<{ ok: boolean, status: number, data: Object|null, errorText?: string }>}
 */
export async function callChatCompletion(apiUrl, { headers, body, useStream, signal, fetchImpl, streamIdleTimeoutMs } = {}) {
  const doFetch = fetchImpl || ((url, init) => fetch(url, init));
  const stream = useStream !== false;

  const response = await doFetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(applyStreamToBody(body, stream)),
    signal,
  });

  if (!response.ok) {
    let errorText = '';
    try { errorText = String(await response.text() || ''); } catch { /* 无 text/可读性差时容错为空 */ }
    return { ok: false, status: response.status, data: null, errorText: errorText.slice(0, 500) };
  }

  // 流式且确为 SSE 才聚合；网关忽略 stream 返回 JSON 时回落普通解析
  if (stream && response.body && isEventStreamResponse(response)) {
    const data = await readChatSSE(response, { idleTimeoutMs: streamIdleTimeoutMs });
    return { ok: true, status: response.status, data };
  }

  const data = await response.json();
  return { ok: true, status: response.status, data };
}
