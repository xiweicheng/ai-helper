import { McpClient } from '../src/mcp/client.js';

async function testMcpClient() {
  console.log('=== MCP Client test ===\n');

  const serverConfig = {
    id: 'test-server',
    name: '测试服务',
    command: 'node',
    args: ['/Users/xiweicheng/Documents/trae_projects/ai-helper/agent/test/mcp-test-server.cjs'],
    enabled: true,
    env: {}
  };

  const client = new McpClient(serverConfig);

  console.log('1. connection MCP Server...');
  const connectResult = await client.connect();
  console.log('connection result:', JSON.stringify(connectResult, null, 2));

  if (!connectResult.success) {
    console.error('connection failed:', connectResult.error);
    return;
  }

  console.log('\n2. getclient status...');
  const status = client.getStatus();
  console.log('state:', JSON.stringify(status, null, 2));

  console.log('\n3. call with  add tool...');
  const addResult = await client.callTool('add', { a: 10, b: 20 });
  console.log('add result:', JSON.stringify(addResult, null, 2));

  console.log('\n4. call with  echo tool...');
  const echoResult = await client.callTool('echo', { message: 'Hello MCP!' });
  console.log('echo result:', JSON.stringify(echoResult, null, 2));

  console.log('\n5. call with  get_time tool...');
  const timeResult = await client.callTool('get_time', { format: 'locale' });
  console.log('get_time result:', JSON.stringify(timeResult, null, 2));

  console.log('\n6. disconnectconnection...');
  client.disconnect();
  console.log('disconnect complete');

  console.log('\n=== test complete ===');
}

testMcpClient().catch(err => {
  console.error('test exception:', err);
  process.exit(1);
});