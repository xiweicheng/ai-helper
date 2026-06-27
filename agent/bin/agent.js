#!/usr/bin/env node
// agent/bin/agent.js - CLI 入口
import { startServer } from '../src/server.js';
import { loadConfig } from '../src/config.js';

const command = process.argv[2] || 'start';

if (command === 'start') {
  console.log('[Agent] AI Helper Local Agent 启动中...');

  // 解析命令行参数
  const args = process.argv.slice(3);
  const config = loadConfig();

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      config.port = parseInt(args[i + 1], 10);
      i++;
    } else if (arg === '--host' && args[i + 1]) {
      config.host = args[i + 1];
      i++;
    } else if (arg === '--workdir' && args[i + 1]) {
      config.workdir = args[i + 1];
      i++;
    }
  }

  console.log(`[Agent] 工作目录: ${config.workdir}`);
  console.log(`[Agent] 监听地址: ${config.host}:${config.port}`);
  console.log(`[Agent] 配对码: 启动后显示`);

  startServer();
} else if (command === 'stop') {
  console.log('[Agent] 发送停止信号...');
  // 向运行中的 Agent 发送停止请求
  try {
    const config = loadConfig();
    const response = await fetch(`http://${config.host}:${config.port}/api/status`);
    const data = await response.json();
    console.log('[Agent] Agent 状态:', data);
    console.log('[Agent] 请直接 Ctrl+C 终止 Agent 进程');
  } catch {
    console.log('[Agent] Agent 似乎未在运行');
  }
} else if (command === 'status') {
  try {
    const config = loadConfig();
    const response = await fetch(`http://${config.host}:${config.port}/api/status`);
    const data = await response.json();
    console.log('[Agent] ======== Agent 状态 ========');
    console.log(`[Agent] 当前配对码: ${data.pairCode}`);
    console.log(`[Agent] 工作目录:   ${data.workdir}`);
    console.log(`[Agent] 运行中进程: ${data.runningProcesses?.length || 0} 个`);
    if (data.runningProcesses?.length > 0) {
      for (const p of data.runningProcesses) {
        console.log(`[Agent]   - ${p.execId} (${p.clientCount} 个连接)`);
      }
    }
  } catch {
    console.log('[Agent] Agent 未在运行');
  }
} else {
  console.log('用法: ai-helper-agent <start|stop|status> [options]');
  console.log('');
  console.log('选项:');
  console.log('  --port <端口>       设置监听端口 (默认: 18910)');
  console.log('  --host <地址>       设置监听地址 (默认: 127.0.0.1)');
  console.log('  --workdir <目录>    设置工作目录 (默认: 当前目录)');
}
