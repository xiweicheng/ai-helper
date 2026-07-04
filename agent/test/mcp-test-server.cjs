#!/usr/bin/env node

/**
 * MCP 测试服务器 — 用于验证 MCP 协议实现的端到端功能
 *
 * 使用方法:
 *   node agent/test/mcp-test-server.js
 *
 * 支持的 MCP 协议:
 *   - initialize    — 返回服务器信息
 *   - notifications/initialized — 客户端初始化完成通知
 *   - tools/list    — 返回可用工具列表
 *   - tools/call    — 调用指定工具
 *
 * 提供的测试工具:
 *   - add           — 两数相加
 *   - multiply      — 两数相乘
 *   - echo          — 回显消息
 *   - get_time      — 返回当前时间
 *   - random_number — 生成随机数
 */

const readline = require('readline');

// ==================== 工具定义 ====================

const TOOLS = [
  {
    name: 'add',
    description: '将两个数字相加并返回结果',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: '第一个加数' },
        b: { type: 'number', description: '第二个加数' }
      },
      required: ['a', 'b']
    }
  },
  {
    name: 'multiply',
    description: '将两个数字相乘并返回结果',
    inputSchema: {
      type: 'object',
      properties: {
        a: { type: 'number', description: '第一个乘数' },
        b: { type: 'number', description: '第二个乘数' }
      },
      required: ['a', 'b']
    }
  },
  {
    name: 'echo',
    description: '回显输入的消息',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '要回显的消息' }
      },
      required: ['message']
    }
  },
  {
    name: 'get_time',
    description: '获取当前日期和时间',
    inputSchema: {
      type: 'object',
      properties: {
        format: { type: 'string', description: '时间格式: iso|locale|unix', enum: ['iso', 'locale', 'unix'] }
      }
    }
  },
  {
    name: 'random_number',
    description: '生成指定范围内的随机整数',
    inputSchema: {
      type: 'object',
      properties: {
        min: { type: 'number', description: '最小值（含）' },
        max: { type: 'number', description: '最大值（含）' }
      },
      required: ['min', 'max']
    }
  }
];

// ==================== 工具实现 ====================

function handleToolCall(name, args) {
  switch (name) {
    case 'add':
      return { result: args.a + args.b, operation: `${args.a} + ${args.b} = ${args.a + args.b}` };

    case 'multiply':
      return { result: args.a * args.b, operation: `${args.a} * ${args.b} = ${args.a * args.b}` };

    case 'echo':
      return { echoed: args.message, length: args.message.length };

    case 'get_time': {
      const now = new Date();
      const format = args.format || 'iso';
      let value;
      if (format === 'unix') {
        value = Math.floor(now.getTime() / 1000);
      } else if (format === 'locale') {
        value = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
      } else {
        value = now.toISOString();
      }
      return { time: value, timezone: 'Asia/Shanghai', format };
    }

    case 'random_number': {
      const min = Math.ceil(args.min);
      const max = Math.floor(args.max);
      const value = Math.floor(Math.random() * (max - min + 1)) + min;
      return { value, range: `${min} ~ ${max}` };
    }

    default:
      throw new Error(`未知工具: ${name}`);
  }
}

// ==================== JSON-RPC 处理器 ====================

function handleRequest(request) {
  const { id, method, params } = request;

  // 通知类型（无需响应）
  if (id === undefined || id === null) {
    if (method === 'notifications/initialized') {
      return null; // no response for notifications
    }
    return null;
  }

  switch (method) {
    case 'initialize':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'MCP Test Server',
            version: '1.0.0'
          }
        }
      };

    case 'tools/list':
      return {
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS
        }
      };

    case 'tools/call':
      try {
        const result = handleToolCall(params.name, params.arguments || {});
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              { type: 'text', text: JSON.stringify(result, null, 2) }
            ]
          }
        };
      } catch (err) {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -1,
            message: err.message
          }
        };
      }

    default:
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `未知方法: ${method}`
        }
      };
  }
}

// ==================== stdio 传输 ====================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

let buffer = '';

rl.on('line', (line) => {
  buffer += line;

  // 尝试解析完整的 JSON-RPC 消息
  try {
    const request = JSON.parse(buffer);
    buffer = '';

    const response = handleRequest(request);
    if (response) {
      process.stdout.write(JSON.stringify(response) + '\n');
    }
  } catch {
    // 不完整消息，继续累积
  }
});

rl.on('close', () => {
  process.exit(0);
});

// 启动日志（输出到 stderr，不干扰 stdio 通信）
process.stderr.write('[MCP Test Server] 测试服务器已启动，等待 MCP 客户端连接...\n');
process.stderr.write('[MCP Test Server] 可用工具: add, multiply, echo, get_time, random_number\n');
