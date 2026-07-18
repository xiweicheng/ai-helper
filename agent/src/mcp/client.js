import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';

// 支持的传输协议类型
const TRANSPORT_STDIO = 'stdio';
const TRANSPORT_SSE = 'sse';
const TRANSPORT_STREAMABLE_HTTP = 'streamableHttp';
const TRANSPORT_WEBSOCKET = 'websocket';

export class McpClient {
  constructor(serverConfig) {
    this.serverId = serverConfig.id;
    this.serverName = serverConfig.name || serverConfig.id;
    this.serverConfig = serverConfig;
    this.client = null;
    this.transport = null;
    this.connected = false;
    this.tools = [];
    this.serverInfo = null;
  }

  /**
   * 根据配置创建对应的传输层实例
   */
  _createTransport() {
    const transportType = this.serverConfig.transport || TRANSPORT_STDIO;
    const headers = this.serverConfig.headers || {};

    switch (transportType) {
      case TRANSPORT_SSE: {
        const url = this.serverConfig.url;
        if (!url) throw new Error('SSE 传输需要提供 url');
        console.log(`[MCP:${this.serverId}] 使用 SSE 传输，URL: ${url}`);
        const opts = {};
        if (Object.keys(headers).length > 0) {
          opts.requestInit = { headers };
        }
        return new SSEClientTransport(new URL(url), opts);
      }

      case TRANSPORT_STREAMABLE_HTTP: {
        const url = this.serverConfig.url;
        if (!url) throw new Error('StreamableHTTP 传输需要提供 url');
        console.log(`[MCP:${this.serverId}] 使用 StreamableHTTP 传输，URL: ${url}`);
        const opts = {};
        if (Object.keys(headers).length > 0) {
          opts.requestInit = { headers };
        }
        return new StreamableHTTPClientTransport(new URL(url), opts);
      }

      case TRANSPORT_WEBSOCKET: {
        const url = this.serverConfig.url;
        if (!url) throw new Error('WebSocket 传输需要提供 url');
        console.log(`[MCP:${this.serverId}] 使用 WebSocket 传输，URL: ${url}`);
        return new WebSocketClientTransport(new URL(url));
      }

      case TRANSPORT_STDIO:
      default: {
        const command = this.serverConfig.command;
        if (!command) throw new Error('stdio 传输需要提供 command');
        console.log(`[MCP:${this.serverId}] 使用 stdio 传输，命令: ${command}`);
        return new StdioClientTransport({
          command: this.serverConfig.command,
          args: this.serverConfig.args || [],
          env: { ...(this.serverConfig.env || {}) },
          cwd: this.serverConfig.cwd,
          stderr: 'pipe'
        });
      }
    }
  }

  async connect() {
    if (this.connected) return { success: true };

    try {
      this.transport = this._createTransport();

      this.client = new Client({
        name: 'ai-helper-agent',
        version: '1.3.4'
      });

      await this.client.connect(this.transport);

      this.serverInfo = {
        serverInfo: this.client.getServerVersion(),
        capabilities: this.client.getServerCapabilities()
      };
      console.log(`[MCP:${this.serverId}] Initialize 成功, server:`, this.serverInfo.serverInfo?.name);

      const toolsResult = await this.client.listTools({});
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

  async callTool(toolName, args) {
    if (!this.connected) {
      return { success: false, error: `MCP Server "${this.serverName}" 未连接` };
    }

    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args || {}
      });

      if (result && result.error) {
        return { success: false, error: result.error.message || '工具调用失败' };
      }

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

  async disconnect() {
    this.connected = false;
    this.tools = [];

    if (this.client) {
      try { await this.client.close(); } catch {}
      this.client = null;
    }

    if (this.transport) {
      try { await this.transport.close(); } catch {}
      this.transport = null;
    }

    console.log(`[MCP:${this.serverId}] 已断开连接`);
  }

  getStatus() {
    return {
      id: this.serverId,
      name: this.serverName,
      connected: this.connected,
      toolCount: this.tools.length,
      serverInfo: this.serverInfo?.serverInfo || null
    };
  }
}