// background/stream-controller.js - 流式输出控制器
// 负责 SSE 解析、chunk 节流发送、usage 提取、tool_calls 检测

/**
 * SSE 数据块解析器
 * 支持 OpenAI 兼容格式的 SSE 流
 *
 * @param {string} sessionId - 会话 ID
 * @param {Object} streamConfig - 流式配置 { streamEnabled, streamChunkDelay }
 */
export class StreamController {
  constructor(sessionId, streamConfig, options = {}) {
    this.sessionId = sessionId;
    this.config = streamConfig;
    this.fullContent = '';
    this.reasoningContent = '';  // DeepSeek thinking mode 的推理内容
    this.usage = null;
    this.toolCalls = [];
    this.isStreaming = false;
    this.lastSendTime = 0;
    this._pendingChunk = '';
    this._streamStarted = false;
    // 支持自定义消息发送函数和消息类型前缀（用于向 content script 发送流式消息）
    this._sendFn = options.sendFn || ((msg) => chrome.runtime.sendMessage(msg).catch(() => {}));
    this._typePrefix = options.typePrefix || '';
  }

  /**
   * 处理单行 SSE 数据
   * 返回 { type: 'content' | 'tool_call' | 'done' | 'ignore' }
   */
  feedLine(line) {
    if (!line || line.startsWith(':')) {
      return { type: 'ignore' };
    }

    let jsonStr = null;
    if (line.startsWith('data:')) {
      jsonStr = line.substring(5).replace(/^\s+/, '');
    }
    if (jsonStr === null) {
      return { type: 'ignore' };
    }

    if (jsonStr === '[DONE]') {
      return { type: 'done' };
    }

    let chunk;
    try {
      chunk = JSON.parse(jsonStr);
    } catch {
      return { type: 'ignore' };
    }

    const choice = chunk.choices?.[0];
    if (!choice) {
      return { type: 'ignore' };
    }

    const delta = choice.delta || {};
    
    const finishReason = choice.finish_reason;

    // 提取 usage（在最后一个 chunk 中）
    if (chunk.usage) {
      this.usage = chunk.usage;
    }

    // 推理内容（DeepSeek thinking mode 的 reasoning_content，需原样回传给 API）
    if (delta.reasoning_content) {
      this.reasoningContent += delta.reasoning_content;
    }

    // 内容增量
    if (delta.content) {
      this.fullContent += delta.content;
    }

    // 工具调用增量（必须在 finish_reason 之前处理，因为最后一个 chunk 可能同时包含 tool_calls 和 finish_reason）
    if (delta.tool_calls) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index || 0;
        if (!this.toolCalls[idx]) {
          this.toolCalls[idx] = {
            id: tc.id || '',
            type: 'function',
            function: { name: '', arguments: '' }
          };
        }
        if (tc.id) this.toolCalls[idx].id = tc.id;
        if (tc.function?.name) this.toolCalls[idx].function.name += tc.function.name;
        if (tc.function?.arguments) {
          // 防御：某些代理 API 可能返回已解析的 arguments 对象
          const argVal = typeof tc.function.arguments === 'string'
            ? tc.function.arguments
            : JSON.stringify(tc.function.arguments);
          this.toolCalls[idx].function.arguments += argVal;
        }
      }
    }

    // 最终状态（必须在 delta 处理之后，确保最后一个 chunk 的数据不丢失）
    if (finishReason === 'stop') {
      // 如果最后一个 chunk 同时包含 content 和 finish_reason，
      // 先发送 content chunk，下一次循环遇到 [DONE] 或 reader 结束时再触发 finish
      if (delta.content) {
        return { type: 'content', content: delta.content };
      }
      return { type: 'done' };
    }

    if (finishReason === 'length') {
      // token 限制导致截断，按 done 处理但标记截断
      if (delta.content) {
        return { type: 'content', content: delta.content };
      }
      return { type: 'done', truncated: true };
    }

    if (finishReason === 'tool_calls') {
      // 打印完整的 tool_calls 摘要（而非每个 chunk 都打印）
      console.log(`[StreamController] tool_calls 完成: ${this.toolCalls.length} 个调用`, 
        this.toolCalls.map(tc => ({ name: tc.function?.name, argsLen: tc.function?.arguments?.length })));
      return { type: 'tool_calls' };
    }

    // 有内容增量但没有 finish_reason，发送给 side panel
    if (delta.content) {
      return { type: 'content', content: delta.content };
    }

    // delta.tool_calls 中间 chunk：仅累积参数，不退出循环，等待 finish_reason
    if (delta.tool_calls) {
      return { type: 'accumulating' };
    }

    return { type: 'ignore' };
  }

  /**
   * 发送 STREAM_START 消息
   */
  sendStart() {
    if (this._streamStarted) return;
    this._streamStarted = true;
    this.isStreaming = true;
    this._sendFn({
      type: this._typePrefix + 'STREAM_START',
      sessionId: this.sessionId
    });
  }

  /**
   * 发送内容增量 chunk（节流合并）
   */
  sendChunk(content) {
    this._pendingChunk += content;

    const now = Date.now();
    const delay = this.config.streamChunkDelay || 0;

    if (now - this.lastSendTime < delay) {
      return; // 节流中，累积到下次
    }

    this._flushChunk();
  }

  /**
   * 强制刷新缓冲区
   */
  _flushChunk() {
    if (!this._pendingChunk) return;

    this.sendStart(); // 确保先发 start

    this._sendFn({
      type: this._typePrefix + 'STREAM_CHUNK',
      sessionId: this.sessionId,
      delta: this._pendingChunk
    });

    this._pendingChunk = '';
    this.lastSendTime = Date.now();
  }

  /**
   * 流结束：发送 STREAM_DONE + 收集完整数据
   */
  finish() {
    this._flushChunk(); // 发送剩余缓冲区
    this.isStreaming = false;

    this._sendFn({
      type: this._typePrefix + 'STREAM_DONE',
      sessionId: this.sessionId,
      finalContent: this.fullContent,
      reasoningContent: this.reasoningContent || null,
      usage: this.usage,
      toolCalls: this.toolCalls.length > 0 ? this.toolCalls : null
    });
  }

  /**
   * 发送工具调用通知（ReAct 循环中截获 tool_calls）
   */
  sendToolCallNotification() {
    this._flushChunk();

    this._sendFn({
      type: this._typePrefix + 'STREAM_TOOL_CALL',
      sessionId: this.sessionId,
      toolCalls: this.toolCalls,
      thinkingContent: this.fullContent
    });
  }

  /**
   * 重置控制器（为下一轮 ReAct 迭代）
   */
  reset() {
    this._flushChunk();
    this.fullContent = '';
    this.reasoningContent = '';
    this.toolCalls = [];
    this._pendingChunk = '';
    this._streamStarted = false;
    this.isStreaming = false;
  }

  /**
   * 获取最终结果（兼容现有返回格式）
   */
  getResult() {
    return {
      content: this.fullContent,
      reasoningContent: this.reasoningContent || null,
      usage: this.usage,
      toolCalls: this.toolCalls.length > 0 ? this.toolCalls : null
    };
  }
}

/**
 * 从 ReadableStream 读取 SSE 并逐行交给 StreamController
 * 返回 { content, usage, toolCalls }
 */
export async function readSSEStream(reader, controller, abortSignal) {
  const decoder = new TextDecoder();
  let buffer = '';

  // 立即通知 Side Panel 流式输出开始，不等首帧内容
  controller.sendStart();

  try {
    while (true) {
      // 使用 Promise.race 确保 abort 能立即中断 reader.read()
      let readResult;
      if (abortSignal) {
        let cleanupAbortListener = () => {};
        try {
          readResult = await Promise.race([
            reader.read(),
            new Promise((_, reject) => {
              if (abortSignal.aborted) {
                reject(new DOMException('Aborted', 'AbortError'));
                return;
              }
              const onAbort = () => {
                reject(new DOMException('Aborted', 'AbortError'));
              };
              abortSignal.addEventListener('abort', onAbort, { once: true });
              cleanupAbortListener = () => abortSignal.removeEventListener('abort', onAbort);
            })
          ]);
        } finally {
          // 确保 reader.read() 先完成时移除 abort 监听器，防止泄漏
          cleanupAbortListener();
        }
      } else {
        readResult = await reader.read();
      }

      const { done, value } = readResult;
      if (done) break;

      buffer += decoder.decode(value, { stream: false });
      const lines = buffer.split('\n');
      // 最后一个可能是不完整的行
      buffer = lines.pop() || '';

      for (const line of lines) {
        const result = controller.feedLine(line.trim());

        if (result.type === 'content') {
          controller.sendChunk(result.content);
        } else if (result.type === 'tool_calls') {
          // 检测到 tool_calls，立即发送 STREAM_TOOL_CALL 通知前端
          // 这样前端能更早地显示工具执行状态，避免极快工具（如 7ms）的执行中状态不可见
          const normalizedToolCalls = controller.toolCalls.map(tc => ({
            ...tc,
            id: tc.id || `tc_fb_${crypto.randomUUID().slice(0, 8)}`
          }));
          
          // 将规范化后的 IDs 写回，确保 react-loop.js 后续获取的结果使用相同的 ID
          controller.toolCalls = normalizedToolCalls;
          
          // 先发送累积的 content chunk，确保思考内容在工具卡片之前显示
          controller._flushChunk();
          
          controller._sendFn({
            type: controller._typePrefix + 'STREAM_TOOL_CALL',
            sessionId: controller.sessionId,
            toolCalls: normalizedToolCalls,
            thinkingContent: controller.fullContent
          }).catch(() => {});
          
          return { status: 'tool_calls', ...controller.getResult() };
        } else if (result.type === 'done') {
          // 正常结束
          controller.finish();
          return { status: 'done', ...controller.getResult() };
        }
      }
    }

    // 处理剩余的 buffer 行
    if (buffer.trim()) {
      const result = controller.feedLine(buffer.trim());
      if (result.type === 'content') {
        controller.sendChunk(result.content);
      } else if (result.type === 'tool_calls') {
        return { status: 'tool_calls', ...controller.getResult() };
      }
    }

    controller.finish();
    return { status: 'done', ...controller.getResult() };
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('[StreamController] 流式读取已被取消');
    } else {
      console.error('[StreamController] 流式读取错误:', error.message);
    }
    controller.finish();
    throw error;
  }
}

/**
 * 发送 Agent 命令实时输出
 */
export function sendAgentStream(sessionId, execId, type, data) {
  chrome.runtime.sendMessage({
    type: 'AGENT_STREAM',
    sessionId,
    execId,
    streamType: type, // 'stdout' | 'stderr'
    data
  }).catch(() => {});
}

/**
 * 发送 Agent 命令执行结束
 */
export function sendAgentStreamDone(sessionId, execId, exitCode) {
  chrome.runtime.sendMessage({
    type: 'AGENT_STREAM_DONE',
    sessionId,
    execId,
    exitCode
  }).catch(() => {});
}