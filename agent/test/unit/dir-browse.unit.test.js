// agent/test/unit/dir-browse.unit.test.js
// 工作目录浏览端点（/api/fs/browse）的纯逻辑：路径规范化 / 根节点 / 单层目录列举 / 错误映射 / 频控
// 运行：node --test agent/test/unit/dir-browse.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeBrowsePath,
  listRoots,
  listChildDirs,
  parentOf,
  buildBrowsePayload,
  createBrowseRateLimiter,
  resetRootsCache,
  BrowseError,
  MAX_BROWSE_PATH_LENGTH,
} from '../../src/dir-browse.js';

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aih-browse-'));
}

describe('normalizeBrowsePath', () => {
  const win = { platform: 'win32', homeDir: 'C:\\Users\\me' };
  const posix = { platform: 'darwin', homeDir: '/Users/me' };

  test('空值 → null（请求根节点）', () => {
    assert.equal(normalizeBrowsePath(undefined, win), null);
    assert.equal(normalizeBrowsePath(null, win), null);
    assert.equal(normalizeBrowsePath('', win), null);
    assert.equal(normalizeBrowsePath('   ', win), null);
  });

  test('Windows：~ 展开、尾分隔符归一、根路径保留', () => {
    assert.equal(normalizeBrowsePath('~', win), 'C:\\Users\\me');
    assert.equal(normalizeBrowsePath('~/Documents', win), 'C:\\Users\\me\\Documents');
    assert.equal(normalizeBrowsePath('C:\\Users\\me\\', win), 'C:\\Users\\me');
    assert.equal(normalizeBrowsePath('C:\\', win), 'C:\\');
    assert.equal(normalizeBrowsePath('"C:\\Users\\me"', win), 'C:\\Users\\me');
  });

  test('POSIX：~ 展开、根路径保留', () => {
    assert.equal(normalizeBrowsePath('~', posix), '/Users/me');
    assert.equal(normalizeBrowsePath('~/Documents', posix), '/Users/me/Documents');
    assert.equal(normalizeBrowsePath('/', posix), '/');
    assert.equal(normalizeBrowsePath('/tmp/', posix), '/tmp');
  });

  test('非绝对路径 → bad_path', () => {
    assert.throws(() => normalizeBrowsePath('relative/dir', posix), (err) => {
      assert.ok(err instanceof BrowseError);
      assert.equal(err.code, 'bad_path');
      assert.equal(err.httpStatus, 400);
      return true;
    });
    assert.throws(() => normalizeBrowsePath('Users\\me', win), (err) => err.code === 'bad_path');
  });

  test('含空字节 → bad_path', () => {
    assert.throws(() => normalizeBrowsePath('/tmp/a\0b', posix), (err) => err.code === 'bad_path');
  });

  test('超长路径 → path_too_long', () => {
    const tooLong = '/' + 'a'.repeat(MAX_BROWSE_PATH_LENGTH + 1);
    assert.throws(() => normalizeBrowsePath(tooLong, posix), (err) => err.code === 'path_too_long');
  });

  test('Windows 下 MSYS 风格 /c/Users 被拒绝（避免静默解析到当前盘）', () => {
    assert.throws(() => normalizeBrowsePath('/c/Users/me', win), (err) => err.code === 'bad_path');
  });

  test('Windows UNC 路径可用（共享根保留尾分隔符）', () => {
    assert.equal(normalizeBrowsePath('\\\\server\\share', win), '\\\\server\\share\\');
    assert.equal(normalizeBrowsePath('\\\\server\\share\\docs', win), '\\\\server\\share\\docs');
  });
});

describe('listRoots', () => {
  test('Windows：仅返回存在的盘符 + 主目录', () => {
    const existsImpl = (p) => p === 'C:\\' || p === 'D:\\';
    const roots = listRoots({ platform: 'win32', homeDir: 'C:\\Users\\me', existsImpl });
    const drives = roots.filter((r) => r.kind === 'drive').map((r) => r.name);
    assert.deepEqual(drives, ['C:', 'D:']);
    assert.equal(roots[roots.length - 1].kind, 'home');
    assert.equal(roots[roots.length - 1].path, 'C:\\Users\\me');
  });

  test('POSIX：返回 / 与主目录', () => {
    const roots = listRoots({ platform: 'darwin', homeDir: '/Users/me' });
    assert.deepEqual(roots.map((r) => r.path), ['/', '/Users/me']);
  });

  test('主目录与根重复时不重复添加', () => {
    const roots = listRoots({ platform: 'linux', homeDir: '/' });
    assert.deepEqual(roots.map((r) => r.path), ['/']);
  });
});

describe('listChildDirs', () => {
  test('只返回目录；隐藏目录保留；文件与断链被剔除', async () => {
    const dir = makeTempDir();
    try {
      fs.mkdirSync(path.join(dir, 'Projects'));
      fs.mkdirSync(path.join(dir, 'apple'));
      fs.mkdirSync(path.join(dir, 'Banana'));
      fs.mkdirSync(path.join(dir, '.config'));
      fs.writeFileSync(path.join(dir, 'note.txt'), 'x');
      fs.symlinkSync(path.join(dir, 'Projects'), path.join(dir, 'linkToProjects'));
      fs.symlinkSync(path.join(dir, 'note.txt'), path.join(dir, 'linkToFile'));
      fs.symlinkSync(path.join(dir, 'no-such-target'), path.join(dir, 'broken'));

      const result = await listChildDirs(dir, { platform: 'darwin' });
      const names = result.entries.map((e) => e.name);

      assert.deepEqual(names, ['.config', 'apple', 'Banana', 'linkToProjects', 'Projects']);
      assert.equal(result.truncated, false);
      assert.ok(!names.includes('note.txt'));
      assert.ok(!names.includes('linkToFile'));
      assert.ok(!names.includes('broken'));

      const link = result.entries.find((e) => e.name === 'linkToProjects');
      assert.equal(link.link, true);
      assert.equal(link.path, path.join(dir, 'linkToProjects'));
      const plain = result.entries.find((e) => e.name === 'Projects');
      assert.equal(plain.link, false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('超过上限时截断并标记 truncated', async () => {
    const dir = makeTempDir();
    try {
      for (const name of ['a', 'b', 'c', 'd']) fs.mkdirSync(path.join(dir, name));
      const result = await listChildDirs(dir, { platform: 'darwin', maxEntries: 2 });
      assert.equal(result.entries.length, 2);
      assert.equal(result.truncated, true);
      assert.deepEqual(result.entries.map((e) => e.name), ['a', 'b']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('大量符号链接并发解析后全部返回（有界并发路径）', async () => {
    const dir = makeTempDir();
    try {
      const count = 40;
      for (let i = 0; i < count; i += 1) {
        const name = `d${String(i).padStart(2, '0')}`;
        fs.mkdirSync(path.join(dir, name));
        fs.symlinkSync(path.join(dir, name), path.join(dir, `l${String(i).padStart(2, '0')}`));
      }
      const result = await listChildDirs(dir, { platform: 'darwin', maxEntries: 200 });
      assert.equal(result.entries.length, count * 2);
      assert.equal(result.truncated, false);
      assert.ok(result.entries.every((e) => e.kind === 'dir'));
      assert.equal(result.entries.filter((e) => e.link).length, count);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('不存在 → path_not_found(404)', async () => {
    await assert.rejects(
      listChildDirs(path.join(os.tmpdir(), 'aih-no-such-dir-xyz'), { platform: 'darwin' }),
      (err) => err instanceof BrowseError && err.code === 'path_not_found' && err.httpStatus === 404
    );
  });

  test('目标是文件 → not_a_directory(400)', async () => {
    const dir = makeTempDir();
    try {
      const filePath = path.join(dir, 'f.txt');
      fs.writeFileSync(filePath, 'x');
      await assert.rejects(
        listChildDirs(filePath, { platform: 'darwin' }),
        (err) => err instanceof BrowseError && err.code === 'not_a_directory' && err.httpStatus === 400
      );
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('parentOf', () => {
  test('根节点无父级；普通目录返回父目录', () => {
    assert.equal(parentOf('/', 'darwin'), null);
    assert.equal(parentOf('C:\\', 'win32'), null);
    assert.equal(parentOf('/tmp/a', 'darwin'), '/tmp');
    assert.equal(parentOf('C:\\Users\\me', 'win32'), 'C:\\Users');
  });
});

describe('buildBrowsePayload', () => {
  test('空 path → 根节点集合，entries 为空', async () => {
    const payload = await buildBrowsePayload({ rawPath: '', platform: 'linux', homeDir: '/home/me' });
    assert.equal(payload.success, true);
    assert.equal(payload.path, null);
    assert.equal(payload.parent, null);
    assert.deepEqual(payload.entries, []);
    assert.deepEqual(payload.roots.map((r) => r.path), ['/', '/home/me']);
  });

  test('指定目录 → 返回 path / parent / entries', async () => {
    const dir = makeTempDir();
    try {
      fs.mkdirSync(path.join(dir, 'child'));
      const payload = await buildBrowsePayload({ rawPath: dir, platform: 'darwin', homeDir: '/Users/me' });
      assert.equal(payload.success, true);
      assert.equal(payload.path, dir);
      assert.equal(payload.parent, path.dirname(dir));
      assert.deepEqual(payload.entries.map((e) => e.name), ['child']);
      assert.equal(payload.entries[0].kind, 'dir');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('根节点探测带 TTL 缓存：短时间内重复浏览不重复探测盘符', async () => {
    resetRootsCache();
    const originalExists = fs.existsSync;
    let probes = 0;
    fs.existsSync = (target) => {
      probes += 1;
      return target === 'C:\\';
    };
    try {
      const options = { rawPath: '', platform: 'win32', homeDir: 'C:\\Users\\me' };
      const first = await buildBrowsePayload(options);
      assert.equal(probes, 26);
      assert.deepEqual(first.roots.map((r) => r.path), ['C:\\', 'C:\\Users\\me']);

      await buildBrowsePayload(options);
      assert.equal(probes, 26, 'TTL 内应复用缓存');

      // 显式注入 existsImpl 时不走缓存（测试/特殊场景）
      await buildBrowsePayload({ ...options, existsImpl: () => true });
      assert.equal(probes, 26);
    } finally {
      fs.existsSync = originalExists;
      resetRootsCache();
    }
  });
});

describe('createBrowseRateLimiter', () => {
  test('窗口内超过上限 → 拒绝并给出剩余等待时间', () => {
    let clock = 1000;
    const limiter = createBrowseRateLimiter({ limit: 3, windowMs: 10000, now: () => clock });
    assert.equal(limiter.consume('ext-1').allowed, true);
    assert.equal(limiter.consume('ext-1').allowed, true);
    assert.equal(limiter.consume('ext-1').allowed, true);
    const denied = limiter.consume('ext-1');
    assert.equal(denied.allowed, false);
    assert.ok(denied.retryAfterMs > 0 && denied.retryAfterMs <= 10000);

    // 其它 key 不受影响
    assert.equal(limiter.consume('ext-2').allowed, true);

    // 窗口滑过后恢复
    clock += 10001;
    assert.equal(limiter.consume('ext-1').allowed, true);
  });
});
