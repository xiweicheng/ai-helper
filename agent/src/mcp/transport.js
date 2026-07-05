// mcp/transport.js - MCP stdio 传输层
// MCP 协议使用 JSON-RPC 2.0 over stdin/stdout，每行一个 JSON 消息
import { spawn } from 'child_process';

/**
 * 创建 MCP 子进程传输
 * MCP 协议中，客户端先发 initialize 请求，服务端才会响应。因此 spawn 后立即 resolve，
 * 由上层 McpClient 负责发送 initialize 和等待响应。
 *
 * @param {Object} serverConfig - { command, args, env }
 * @returns {Promise<{send: Function, close: Function, onData: Function}>}
 */
export function createStdioTransport(serverConfig) {
  const { command, args = [], env = {} } = serverConfig;

  return new Promise((resolve, reject) => {
    let resolved = false;
    let responseBuffer = '';
    let dataHandler = null;
    let exitHandler = null;

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      detached: false
    });

    const cleanup = () => {
      if (child.stdout) child.stdout.removeAllListeners();
      if (child.stderr) child.stderr.removeAllListeners();
      child.removeAllListeners();
    };

    child.stderr.on('data', (data) => {
      const text = data.toString();
      if (text.trim()) {
        console.log(`[MCP:stderr] [${serverConfig.id || command}] ${text.trim()}`);
      }
    });

    child.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`无法启动 MCP Server "${command}": ${err.message}`));
      }
    });

    child.on('exit', (code, signal) => {
      console.log(`[MCP] Server 进程退出: ${command} (code=${code}, signal=${signal})`);
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`MCP Server 异常退出 (code=${code}, signal=${signal}): ${command}`));
      } else if (exitHandler) {
        exitHandler(code, signal);
      }
    });

    child.stdout.on('data', (data) => {
      responseBuffer += data.toString();

      let newlineIdx;
      while ((newlineIdx = responseBuffer.indexOf('\n')) !== -1) {
        const line = responseBuffer.slice(0, newlineIdx).trim();
        responseBuffer = responseBuffer.slice(newlineIdx + 1);

        if (!line) continue;

        if (dataHandler) {
          try { dataHandler(line); } catch {}
        }
      }
    });

    if (!resolved) {
      resolved = true;
      resolve({
        send: (jsonRpcMessage) => {
          const msg = JSON.stringify(jsonRpcMessage) + '\n';
          child.stdin.write(msg);
        },
        close: () => {
          cleanup();
          dataHandler = null;
          try { child.stdin.end(); } catch {}
          setTimeout(() => {
            try { child.kill('SIGTERM'); } catch {}
          }, 1000);
        },
        onData: (handler) => {
          dataHandler = handler;
        },
        onExit: (handler) => {
          exitHandler = handler;
        }
      });
    }
  });
}