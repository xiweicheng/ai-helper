import { Client } from '@modelcontextprotocol/sdk/client';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

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

  async connect() {
    if (this.connected) return { success: true };

    try {
      this.transport = new StdioClientTransport({
        command: this.serverConfig.command,
        args: this.serverConfig.args || [],
        env: { ...(this.serverConfig.env || {}) },
        cwd: this.serverConfig.cwd,
        stderr: 'pipe'
      });

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

  disconnect() {
    this.connected = false;
    this.tools = [];

    if (this.client) {
      try { this.client.close(); } catch {}
      this.client = null;
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