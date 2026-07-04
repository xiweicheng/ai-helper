// mcp/client.js - MCP Client 核心
// 管理与单个 MCP Server 的 JSON-RPC 2.0 通信
import { createStdioTransport } from './transport.js';

let requestIdCounter = 0;

/**
 * MCP Client 类
 * 管理与一个 MCP Server 的完整生命周期
 */
export class McpClient {
  constructor(serverConfig) {
    this.serverId = serverConfig.id;
    this.serverName = serverConfig.name || serverConfig.id;
    this.serverConfig = serverConfig;
    this.transport = null;
    this.connected = false;
    this.tools = [];
    this.serverInfo = null;

    // JSON-RPC 请求管理
    this.pendingRequests = new Map(); // id → { resolve, reject, timeoutId }
  }

  /**
   * 连接到 MCP Server
   * 流程: 启动子进程 → initialize → tools/list
   */
  async connect() {
    if (this.connected) return { success: true };

    try {
      // 1. 创建 stdio 传输
      this.transport = await createStdioTransport(this.serverConfig);

      // 2. 设置响应数据处理器
      this.transport.onData((line) => this._handleLine(line));

      console.log(`[MCP:${this.serverId}] 子进程已启动`);

      // 3. 发送 initialize 请求
      const initResult = await this._sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          tools: {}
        },
        clientInfo: {
          name: 'ai-helper-agent',
          version: '1.3.4'
        }
      });

      if (!initResult || initResult.error) {
        throw new Error(`Initialize 失败: ${initResult?.error?.message || '未知错误'}`);
      }

      this.serverInfo = initResult;
      console.log(`[MCP:${this.serverId}] Initialize 成功, server:`, initResult.serverInfo?.name);

      // 4. 发送 initialized 通知（MCP 协议要求）
      this._sendNotification('notifications/initialized', {});

      // 5. 发现工具
      const toolsResult = await this._sendRequest('tools/list', {});
      if (toolsResult && toolsResult.tools) {
        this.tools = toolsResult.tools;
        console.log(`[MCP:${this.serverId}] 发现 ${this.tools.length} 个工具:`,
          this.tools.map(t => t.name).join(', '));
      } else {
        this.tools = [];
      }

      this.connected = true;
      return { success: true, toolCount: this.tools.length };
    } catch (err) {
      console.error(`[MCP:${this.serverId}] 连接失败:`, err.message);
      this.disconnect();
      return { success: false, error: err.message };
    }
  }

  /**
   * 调用 MCP 工具
   * @param {string} toolName
   * @param {Object} args
   */
  async callTool(toolName, args) {
    if (!this.connected) {
      return { success: false, error: `MCP Server "${this.serverName}" 未连接` };
    }

    try {
      const result = await this._sendRequest('tools/call', {
        name: toolName,
        arguments: args || {}
      });

      if (result && result.error) {
        return { success: false, error: result.error.message || '工具调用失败' };
      }

      // MCP tools/call 返回 { content: [{ type: 'text', text: '...' }], isError: false }
      const content = result?.content || [];
      const textContent = content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('\n');

      return {
        success: !result?.isError,
        content: textContent,
        raw: result
      };
    } catch (err) {
      return { success: false, error: `工具调用异常: ${err.message}` };
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.connected = false;
    this.tools = [];

    // 清理所有未完成的请求
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('连接已断开'));
    }
    this.pendingRequests.clear();

    if (this.transport) {
      try { this.transport.close(); } catch {}
      this.transport = null;
    }

    console.log(`[MCP:${this.serverId}] 已断开连接`);
  }

  /**
   * 获取状态信息
   */
  getStatus() {
    return {
      id: this.serverId,
      name: this.serverName,
      connected: this.connected,
      toolCount: this.tools.length,
      serverInfo: this.serverInfo?.serverInfo || null
    };
  }

  // ========== 私有方法 ==========

  /**
   * 处理从 transport 收到的每一行 JSON-RPC 消息
   */
  _handleLine(line) {
    try {
      const message = JSON.parse(line);
      const id = message.id;

      if (id !== undefined && id !== null) {
        // 有 id = 响应
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(id);

          if (message.error) {
            pending.reject(new Error(message.error.message || 'JSON-RPC Error'));
          } else {
            pending.resolve(message.result);
          }
        }
      } else {
        // 无 id = 通知，仅记录
        if (message.method) {
          console.log(`[MCP:${this.serverId}] 通知:`, message.method);
        }
      }
    } catch (err) {
      // 非 JSON 行，忽略
    }
  }

  /**
   * 发送 JSON-RPC 请求并等待响应
   */
  _sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++requestIdCounter;

      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`MCP 请求超时 (60s): ${method}`));
      }, 60000);

      this.pendingRequests.set(id, { resolve, reject, timeoutId });

      try {
        this.transport.send({
          jsonrpc: '2.0',
          id,
          method,
          params
        });
      } catch (err) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(id);
        reject(err);
      }
    });
  }

  /**
   * 发送 JSON-RPC 通知（无需响应）
   */
  _sendNotification(method, params) {
    try {
      this.transport.send({
        jsonrpc: '2.0',
        method,
        params
      });
    } catch {
      // 通知发送失败不抛出
    }
  }
}
