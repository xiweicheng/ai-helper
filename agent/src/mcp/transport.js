// mcp/transport.js - MCP stdio 传输层
// MCP 协议使用 JSON-RPC 2.0 over stdin/stdout，每行一个 JSON 消息
import { spawn } from 'child_process';

const INIT_TIMEOUT = 30000; // 初始化超时 30s

/**
 * 创建 MCP 子进程传输
 * @param {Object} serverConfig - { command, args, env }
 * @returns {Promise<{send: Function, close: Function, onData: Function}>}
 */
export function createStdioTransport(serverConfig) {
  const { command, args = [], env = {} } = serverConfig;

  return new Promise((resolve, reject) => {
    let resolved = false;
    let responseBuffer = '';

    const child = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
      detached: false
    });

    let dataHandler = null;

    const cleanup = () => {
      clearTimeout(timeoutId);
      if (child.stdout) child.stdout.removeAllListeners();
      if (child.stderr) child.stderr.removeAllListeners();
      child.removeAllListeners();
    };

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`MCP Server 启动超时 (${INIT_TIMEOUT / 1000}s): ${command} ${args.join(' ')}`));
      }
    }, INIT_TIMEOUT);

    // stderr 仅记录日志
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
      // 传送结束后关闭 child 进程时会触发 exit，这是正常的
      console.log(`[MCP] Server 进程退出: ${command} (code=${code}, signal=${signal})`);
      if (!resolved) {
        resolved = true;
        cleanup();
        reject(new Error(`MCP Server 异常退出 (code=${code}, signal=${signal}): ${command}`));
      }
    });

    // stdout 数据处理：启动阶段等待第一条消息，后续转发给 dataHandler
    let started = false;
    child.stdout.on('data', (data) => {
      responseBuffer += data.toString();

      let newlineIdx;
      while ((newlineIdx = responseBuffer.indexOf('\n')) !== -1) {
        const line = responseBuffer.slice(0, newlineIdx).trim();
        responseBuffer = responseBuffer.slice(newlineIdx + 1);

        if (!line) continue;

        // 第一条有效 JSON 行 = 子进程启动完成
        if (!started) {
          started = true;
          clearTimeout(timeoutId);
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
              }
            });
          }
        }

        // 所有后续行转发给 dataHandler
        if (dataHandler) {
          try { dataHandler(line); } catch {}
        }
      }
    });
  });
}
