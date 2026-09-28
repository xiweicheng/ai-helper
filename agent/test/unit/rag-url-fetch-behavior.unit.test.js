// agent/test/unit/rag-url-fetch-behavior.unit.test.js
// URL 导入「无法提取正文」问题修复的回归测试：
//   1. 请求头浏览器化：部分站点（如百度）对非常规 UA 返回反爬壳页（仅 script/noscript 的 227B 空壳），
//      提取正文为空 → 报「文档解析后无可索引内容」；浏览器化请求头可显著提升抓取成功率
//   2. charset 感知解码：中文站常见 GBK/GB2312 编码，此前按 utf-8 硬解会乱码
//   3. 空正文诊断：URL 链路解析为空时抛 urlNoContent（区分于通用的 emptyDocument，提示可能原因）
// 运行：node --test agent/test/unit/rag-url-fetch-behavior.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { RagManager } from '../../src/rag/manager.js';
import { RagError } from '../../src/rag/errors.js';
import { fetchUrlGuarded, decodeBytes } from '../../src/rag/url-guard.js';

// 启动临时本地 HTTP 服务器（127.0.0.1 随机端口）
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

// ingestUrl 桩：跳过互斥与分块，捕获进入 _ingestText 的入参；策略放行本地网络
function makeIngestStub() {
  const seen = [];
  const mgr = Object.create(RagManager.prototype);
  mgr._runIngest = async (_collectionId, fn) => fn();
  mgr._reportProgress = () => {};
  mgr._urlIngestPolicy = () => ({ allowPrivateNetwork: true });
  mgr._ingestText = async (_collectionId, input) => {
    seen.push(input);
    return { documentId: 'doc_test', name: input.name, chunkCount: 1 };
  };
  return { mgr, seen };
}

describe('fetchUrlGuarded - 请求头浏览器化', () => {
  test('携带浏览器 UA / Accept / Accept-Language（反爬空壳页修复）', async () => {
    let headers = null;
    const srv = await startLocalServer((req, res) => {
      headers = req.headers;
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
    });
    try {
      await fetchUrlGuarded(`${srv.origin}/probe`, { allowPrivateNetwork: true });
      assert.ok(headers, '应收到请求');
      assert.match(headers['user-agent'], /Mozilla\/5\.0 .*AppleWebKit.*Chrome\//, `期望浏览器 UA，实际: ${headers['user-agent']}`);
      assert.ok(!/AI-Helper/i.test(headers['user-agent']), 'UA 不应再暴露工具标识');
      assert.match(headers['accept'] || '', /text\/html/, `期望 Accept 含 text/html，实际: ${headers['accept']}`);
      assert.match(headers['accept-language'] || '', /zh/, `期望 Accept-Language 含 zh，实际: ${headers['accept-language']}`);
    } finally {
      await srv.close();
    }
  });
});

describe('decodeBytes - charset 感知解码', () => {
  const gbkHello = Buffer.from([0xc4, 0xe3, 0xba, 0xc3]); // “你好”（GBK）

  test('utf-8 路径（显式 charset 与缺省）', () => {
    assert.equal(decodeBytes(Buffer.from('你好', 'utf-8'), 'text/plain; charset=utf-8'), '你好');
    assert.equal(decodeBytes(Buffer.from('hello', 'utf-8'), ''), 'hello');
  });

  test('GBK / GB2312 按 charset 解码（不再乱码）', () => {
    assert.equal(decodeBytes(gbkHello, 'text/html; charset=gbk'), '你好');
    assert.equal(decodeBytes(gbkHello, 'text/html; charset=GB2312'), '你好');
  });

  test('content-type 无 charset 时嗅探 HTML meta 声明', () => {
    const bytes = Buffer.concat([
      Buffer.from('<html><head><meta charset="gbk"></head><body>', 'ascii'),
      gbkHello,
      Buffer.from('</body></html>', 'ascii'),
    ]);
    assert.ok(decodeBytes(bytes, 'text/html').includes('你好'));
  });

  test('未知编码标签回退 utf-8 不抛', () => {
    assert.equal(decodeBytes(Buffer.from('你好', 'utf-8'), 'text/html; charset=x-unknown-999'), '你好');
  });
});

describe('manager.ingestUrl - 空正文诊断与 GBK 链路', () => {
  test('反爬空壳页（仅 script/noscript）→ urlNoContent，且不进入分块/向量化', async () => {
    const srv = await startLocalServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><head><script>location.replace(location.href.replace("https://","http://"))</script></head><body><noscript><meta http-equiv="refresh" content="0;url=http://www.example.com/"></noscript></body></html>');
    });
    try {
      const { mgr, seen } = makeIngestStub();
      await assert.rejects(
        () => mgr.ingestUrl('kb_urltest1', { url: `${srv.origin}/shell` }),
        (err) => {
          assert.ok(err instanceof RagError, `期望 RagError，实际: ${err}`);
          assert.equal(err.code, 'urlNoContent');
          return true;
        },
      );
      assert.equal(seen.length, 0, '空正文不应进入 _ingestText');
    } finally {
      await srv.close();
    }
  });

  test('GBK 页面全链路：解码后进入导入链路', async () => {
    const gbkBody = Buffer.concat([
      Buffer.from('<html><head></head><body>', 'ascii'),
      Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0xa3, 0xac, 0xca, 0xc0, 0xbd, 0xe7]), // “你好，世界”（GBK）
      Buffer.from('</body></html>', 'ascii'),
    ]);
    const srv = await startLocalServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=gbk' });
      res.end(gbkBody);
    });
    try {
      const { mgr, seen } = makeIngestStub();
      await mgr.ingestUrl('kb_urltest1', { url: `${srv.origin}/gbk` });
      assert.equal(seen.length, 1);
      assert.ok(seen[0].text.includes('你好，世界'), `期望解码出中文，实际: ${JSON.stringify(seen[0].text)}`);
    } finally {
      await srv.close();
    }
  });

  test('正常 HTML 页面照常进入导入链路（对照）', async () => {
    const srv = await startLocalServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>标题</h1><p>' + '正常正文。'.repeat(50) + '</p></body></html>');
    });
    try {
      const { mgr, seen } = makeIngestStub();
      await mgr.ingestUrl('kb_urltest1', { url: `${srv.origin}/ok` });
      assert.equal(seen.length, 1);
      assert.ok(seen[0].text.includes('正常正文'));
      assert.equal(seen[0].source, 'url');
    } finally {
      await srv.close();
    }
  });
});
