// agent/test/unit/rag-url-ingest-guard.unit.test.js
// RAG URL 导入 SSRF 防护单测（S2）：
//   1. 私网/保留地址判断（IPv4/IPv6 决策矩阵）
//   2. 白名单匹配与优先级（白名单非空 → 覆盖总开关；为空 → 由总开关决定）
//   3. fetchUrlGuarded 逐跳重定向校验 + 响应体大小上限（本地 http server 实测）
//   4. manager.ingestUrl 策略注入集成
// 背景：URL 分支曾无目标地址校验（可被提示词注入诱导读取内网），本测试防回归
// 运行：node --test agent/test/unit/rag-url-ingest-guard.unit.test.js
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RagManager } from '../../src/rag/manager.js';
import { RagError } from '../../src/rag/errors.js';
import {
  isPrivateAddress, isPrivateTargetAllowed, matchesHostAllowlist, fetchUrlGuarded,
} from '../../src/rag/url-guard.js';

// 断言：以指定错误码被拒绝
const rejectedWith = (code) => (err) => {
  assert.ok(err instanceof RagError, `期望 RagError 拒绝，实际: ${err.constructor.name}: ${err.message}`);
  assert.equal(err.code, code);
  return true;
};

// 断言：未被安全策略拦截（后续因其它原因失败）
const notBlocked = (err) => !(err instanceof RagError && err.code === 'urlPrivateBlocked');

// 启动临时本地 HTTP 服务器（127.0.0.1 随机端口），返回 { origin, close }
function startLocalServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        origin: `http://127.0.0.1:${server.address().port}`,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

describe('isPrivateAddress - 私网/保留地址判断', () => {
  test('IPv4 私网与保留段', () => {
    const privateIps = [
      '10.0.0.1', '10.255.255.255', '172.16.0.1', '172.31.255.255',
      '192.168.1.1', '127.0.0.1', '169.254.169.254', '100.64.0.1', '0.0.0.0',
    ];
    for (const ip of privateIps) assert.equal(isPrivateAddress(ip), true, ip);
  });

  test('IPv4 公网地址（含私网段边界外）', () => {
    const publicIps = [
      '8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1',
      '11.0.0.1', '192.169.0.1', '100.128.0.1',
    ];
    for (const ip of publicIps) assert.equal(isPrivateAddress(ip), false, ip);
  });

  test('IPv6 回环/ULA/链路本地与 IPv4 映射', () => {
    const privateIps = ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:192.168.1.1'];
    for (const ip of privateIps) assert.equal(isPrivateAddress(ip), true, ip);
    const publicIps = ['2001:4860:4860::8888', '::ffff:8.8.8.8'];
    for (const ip of publicIps) assert.equal(isPrivateAddress(ip), false, ip);
  });
});

describe('白名单匹配与优先级决策', () => {
  test('host 白名单：精确匹配、大小写不敏感、*. 子域通配', () => {
    assert.equal(matchesHostAllowlist('192.168.1.50', ['192.168.1.50']), true);
    assert.equal(matchesHostAllowlist('Intranet.Corp.Com', ['intranet.corp.com']), true);
    assert.equal(matchesHostAllowlist('wiki.corp.com', ['*.corp.com']), true);
    assert.equal(matchesHostAllowlist('corp.com', ['*.corp.com']), false);
    assert.equal(matchesHostAllowlist('wiki.corp.com.evil.net', ['*.corp.com']), false);
    assert.equal(matchesHostAllowlist('10.0.0.8', ['10.0.0.1']), false);
  });

  test('白名单非空时以白名单为准，总开关不生效', () => {
    const policy = { allowPrivateNetwork: true, allowedPrivateHosts: ['intranet.corp.com'] };
    assert.equal(isPrivateTargetAllowed('intranet.corp.com', policy), true);
    // 总开关开着，但白名单未命中 → 拒绝（白名单优先）
    assert.equal(isPrivateTargetAllowed('192.168.1.50', policy), false);
  });

  test('白名单为空时由总开关决定；均未配置则默认拒绝', () => {
    assert.equal(isPrivateTargetAllowed('192.168.1.50', { allowPrivateNetwork: true, allowedPrivateHosts: [] }), true);
    assert.equal(isPrivateTargetAllowed('192.168.1.50', { allowPrivateNetwork: false }), false);
    assert.equal(isPrivateTargetAllowed('192.168.1.50', {}), false);
    assert.equal(isPrivateTargetAllowed('192.168.1.50', undefined), false);
    // 空白条目不算配置了白名单（等于没配，回落总开关）
    assert.equal(isPrivateTargetAllowed('192.168.1.50', { allowPrivateNetwork: true, allowedPrivateHosts: ['  ', ''] }), true);
  });
});

describe('fetchUrlGuarded - 私网拦截/逐跳校验/大小上限', () => {
  let server;
  before(async () => {
    server = await startLocalServer((req, res) => {
      const pathname = new URL(req.url, 'http://127.0.0.1').pathname;
      if (pathname === '/ok') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('hello-guard');
      } else if (pathname === '/jump-private') {
        res.writeHead(302, { Location: 'http://127.0.0.2:9/secret' });
        res.end();
      } else if (pathname === '/jump-ok') {
        res.writeHead(302, { Location: '/ok' });
        res.end();
      } else if (pathname === '/loop') {
        res.writeHead(302, { Location: '/loop' });
        res.end();
      } else if (pathname === '/big') {
        // 带 Content-Length 的大响应（命中头部预检）
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('x'.repeat(4096));
      } else if (pathname === '/big-chunked') {
        // 无 Content-Length 的 chunked 大响应（命中流式累计中断）
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.write('y'.repeat(2048));
        res.write('y'.repeat(2048));
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });
  after(async () => { await server.close(); });

  test('默认策略（空白名单 + 总开关关）拒绝私网目标', async () => {
    await assert.rejects(
      () => fetchUrlGuarded(`${server.origin}/ok`, {}),
      rejectedWith('urlPrivateBlocked')
    );
  });

  test('总开关开启时放行并返回内容', async () => {
    const { bytes, contentType } = await fetchUrlGuarded(`${server.origin}/ok`, { allowPrivateNetwork: true });
    assert.equal(bytes.toString('utf-8'), 'hello-guard');
    assert.ok(contentType.includes('text/plain'));
  });

  test('白名单命中时放行；DNS 解析出的回环地址同样受策略约束', async () => {
    const ok = await fetchUrlGuarded(`${server.origin}/ok`, { allowedPrivateHosts: ['127.0.0.1'] });
    assert.equal(ok.bytes.toString('utf-8'), 'hello-guard');
    // localhost 经 DNS 解析为回环地址 → 默认策略下被拒（按真实 IP 校验，而非字符串匹配）
    await assert.rejects(
      () => fetchUrlGuarded('http://localhost:1/ok', {}),
      rejectedWith('urlPrivateBlocked')
    );
  });

  test('重定向到未授权私网目标被逐跳拦截', async () => {
    const policy = { allowedPrivateHosts: ['127.0.0.1'] };
    await assert.rejects(
      () => fetchUrlGuarded(`${server.origin}/jump-private`, policy),
      rejectedWith('urlPrivateBlocked')
    );
  });

  test('合法重定向被跟随（相对 Location 解析）', async () => {
    const { bytes } = await fetchUrlGuarded(`${server.origin}/jump-ok`, { allowPrivateNetwork: true });
    assert.equal(bytes.toString('utf-8'), 'hello-guard');
  });

  test('重定向次数超过上限时拒绝', async () => {
    await assert.rejects(
      () => fetchUrlGuarded(`${server.origin}/loop`, { allowPrivateNetwork: true }, { maxRedirects: 3 }),
      rejectedWith('urlTooManyRedirects')
    );
  });

  test('响应体超过大小上限时拒绝（Content-Length 预检 + 流式累计双路径）', async () => {
    await assert.rejects(
      () => fetchUrlGuarded(`${server.origin}/big`, { allowPrivateNetwork: true }, { maxBytes: 1024 }),
      rejectedWith('urlTooLarge')
    );
    await assert.rejects(
      () => fetchUrlGuarded(`${server.origin}/big-chunked`, { allowPrivateNetwork: true }, { maxBytes: 1024 }),
      rejectedWith('urlTooLarge')
    );
  });
});

describe('manager.ingestUrl - 策略接入', () => {
  let server;
  before(async () => {
    server = await startLocalServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('manager-guard');
    });
  });
  after(async () => { await server.close(); });

  test('空策略（等价缺省配置）拒绝内网 URL', async () => {
    const manager = new RagManager({ urlIngestPolicy: {} });
    await assert.rejects(
      () => manager.ingestUrl('kb_guard0test', { url: `${server.origin}/` }),
      rejectedWith('urlPrivateBlocked')
    );
  });

  test('总开关放行后进入后续流程（因知识库不存在失败，而非安全拦截）', async () => {
    const manager = new RagManager({ urlIngestPolicy: { allowPrivateNetwork: true } });
    await assert.rejects(
      () => manager.ingestUrl('kb_guard0test', { url: `${server.origin}/` }),
      notBlocked
    );
  });

  test('白名单优先：白名单非空且未命中时，总开关不生效', async () => {
    const manager = new RagManager({
      urlIngestPolicy: { allowPrivateNetwork: true, allowedPrivateHosts: ['10.9.9.9'] },
    });
    await assert.rejects(
      () => manager.ingestUrl('kb_guard0test', { url: `${server.origin}/` }),
      rejectedWith('urlPrivateBlocked')
    );
  });
});
