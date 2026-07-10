import { McpClient } from '../src/mcp/client.js';

async function testMcpClient() {
  console.log('=== MCP Client 测试 ===\n');

  const serverConfig = {
    id: 'test-server',
    name: '测试服务',
    command: 'node',
    args: ['/Users/xiweicheng/Documents/trae_projects/ai-helper/agent/test/mcp-test-server.cjs'],
    enabled: true,
    env: {}
  };

  const client = new McpClient(serverConfig);

  console.log('1. 连接 MCP Server...');
  const connectResult = await client.connect();
  console.log('连接结果:', JSON.stringify(connectResult, null, 2));

  if (!connectResult.success) {
    console.error('连接失败:', connectResult.error);
    return;
  }

  console.log('\n2. 获取客户端状态...');
  const status = client.getStatus();
  console.log('状态:', JSON.stringify(status, null, 2));

  console.log('\n3. 调用 add 工具...');
  const addResult = await client.callTool('add', { a: 10, b: 20 });
  console.log('add 结果:', JSON.stringify(addResult, null, 2));

  console.log('\n4. 调用 echo 工具...');
  const echoResult = await client.callTool('echo', { message: 'Hello MCP!' });
  console.log('echo 结果:', JSON.stringify(echoResult, null, 2));

  console.log('\n5. 调用 get_time 工具...');
  const timeResult = await client.callTool('get_time', { format: 'locale' });
  console.log('get_time 结果:', JSON.stringify(timeResult, null, 2));

  console.log('\n6. 断开连接...');
  client.disconnect();
  console.log('断开完成');

  console.log('\n=== 测试完成 ===');
}

testMcpClient().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});