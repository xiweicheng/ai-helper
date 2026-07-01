// background/stream-controller.js - 流式输出控制器
// 负责 SSE 解析、chunk 节流发送、usage 提取、tool_calls 检测

/**
 * SSE 数据块解析器
 * 支持 OpenAI 兼容格式的 SSE 流
 *
 * @param {string} sessionId - 会话 ID
 * @param {Object} streamConfig - 流式配置 { streamEnabled, streamChunkDelay, agentStreamEnabled }
 */
export class StreamController {
  constructor(sessionId, streamConfig) {
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
  }

  /**
   * 处理单行 SSE 数据
   * 返回 { type: 'content' | 'tool_call' | 'done' | 'ignore' }
   */
  feedLine(line) {
    // 空行 / 注释行
    if (!line || line.startsWith(':')) {
      return { type: 'ignore' };
    }

    // [DONE] 标记
    if (line === 'data: [DONE]') {
      return { type: 'done' };
    }

    // data: {...} 行
    if (!line.startsWith('data: ')) {
      return { type: 'ignore' };
    }

    const jsonStr = line.slice(6);
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
    
    // 原始 SSE chunk 日志（含 delta 完整内容，用于诊断 tool_calls 格式问题）
    if (delta.tool_calls || choice.finish_reason === 'tool_calls') {
      console.log('[StreamController] 收到 tool_calls SSE chunk, delta:', JSON.stringify(delta).substring(0, 500));
    }
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
          console.log(`[StreamController] tool_call[${idx}] 参数增量 (${argVal.length} 字符, 类型=${typeof tc.function.arguments}):`, argVal.substring(0, 100));
        }
      }
      console.log(`[StreamController] tool_call[${this.toolCalls.length - 1}] 累计参数:`, this.toolCalls[this.toolCalls.length - 1]?.function?.arguments?.substring(0, 200));
    }

    // 最终状态（必须在 delta 处理之后，确保最后一个 chunk 的数据不丢失）
    if (finishReason === 'stop') {
      return { type: 'done' };
    }

    if (finishReason === 'tool_calls') {
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
    chrome.runtime.sendMessage({
      type: 'STREAM_START',
      sessionId: this.sessionId
    }).catch(() => {});
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

    chrome.runtime.sendMessage({
      type: 'STREAM_CHUNK',
      sessionId: this.sessionId,
      delta: this._pendingChunk
    }).catch(() => {});

    this._pendingChunk = '';
    this.lastSendTime = Date.now();
  }

  /**
   * 流结束：发送 STREAM_DONE + 收集完整数据
   */
  finish() {
    this._flushChunk(); // 发送剩余缓冲区
    this.isStreaming = false;

    chrome.runtime.sendMessage({
      type: 'STREAM_DONE',
      sessionId: this.sessionId,
      finalContent: this.fullContent,
      usage: this.usage,
      toolCalls: this.toolCalls.length > 0 ? this.toolCalls : null
    }).catch(() => {});
  }

  /**
   * 发送工具调用通知（ReAct 循环中截获 tool_calls）
   */
  sendToolCallNotification() {
    this._flushChunk();

    chrome.runtime.sendMessage({
      type: 'STREAM_TOOL_CALL',
      sessionId: this.sessionId,
      toolCalls: this.toolCalls,
      thinkingContent: this.fullContent
    }).catch(() => {});
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
      const { done, value } = await reader.read();
      if (done) break;

      if (abortSignal?.aborted) {
        reader.cancel();
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      // 最后一个可能是不完整的行
      buffer = lines.pop() || '';

      for (const line of lines) {
        const result = controller.feedLine(line.trim());

        if (result.type === 'content') {
          controller.sendChunk(result.content);
        } else if (result.type === 'tool_calls') {
          // 检测到 tool_calls，暂停读取，返回给调用方处理
          controller.sendToolCallNotification();
          // 把 buffer 放回去，调用方会重新发起请求
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
        controller.sendToolCallNotification();
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