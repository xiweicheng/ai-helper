// @vitest-environment jsdom
// test/unit/doc-image-snapshot-wiring.unit.test.js - 发送链路快照写入 + session 删除清理接线
// 发送组装函数过重（完整模型流），按仓库源码守卫测试惯例断言双链路接线；session-store 走真实行为测试
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const noop = () => {};
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        if (typeof cb === 'function') { cb({}); return; }
        return Promise.resolve({});
      },
      set: noop,
      remove: () => Promise.resolve(),
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: { lastError: null, getManifest: () => ({ content_scripts: [{ js: [] }] }), getURL: (p) => p, sendMessage: (m, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); } },
};

// doc-images spy：替换真实模块避免 storage 依赖
vi.mock('../../src/side_panel/doc-images.js', async (orig) => {
  const real = await orig();
  return { ...real, saveDocImageSnapshot: vi.fn(async () => {}), removeDocImageSnapshot: vi.fn(async () => {}) };
});

// jsdom 环境下 import.meta.url 非 file scheme，按 vitest 工作目录（仓根）解析
const CHAT_SRC = readFileSync(join(process.cwd(), 'src/side_panel/chat-manager.js'), 'utf8');
const PROMPT_SRC = readFileSync(join(process.cwd(), 'src/side_panel/prompt-manager.js'), 'utf8');

describe('发送链路快照写入（双链路对齐守卫）', () => {
  // 会话标识形如 state.activeSessionId（prompt-manager 链路）或 mySessionId（chat-manager 支持跨会话派发）
  const callRe = /await saveDocImageSnapshot\(([\w.]+), attachedFilesSnapshot, attachedImagesSnapshot\)/;

  it('chat-manager 附件注入段调用 saveDocImageSnapshot', () => {
    expect(CHAT_SRC).toContain('import { buildFileContentText');
    expect(CHAT_SRC).toContain("saveDocImageSnapshot");
    expect(CHAT_SRC).toContain("from './doc-images.js'");
    expect(CHAT_SRC.match(callRe)).not.toBeNull();
  });

  it('prompt-manager 同构位置调用（与主链路对齐）', () => {
    expect(PROMPT_SRC.match(callRe)).not.toBeNull();
  });

  it('两链路均在 attachedFilesSnapshot 注入块内、try 守护不阻断发送', () => {
    for (const src of [CHAT_SRC, PROMPT_SRC]) {
      const idxSnap = src.indexOf('const attachedFilesSnapshot');
      const idxCall = src.search(callRe);
      expect(idxCall).toBeGreaterThan(idxSnap);
      // 调用被 try/catch 包裹（失败不影响发送）
      const around = src.slice(idxCall - 200, idxCall + 300);
      expect(around).toContain('try');
      expect(around).toContain('catch');
    }
  });

  it('两条链路都接上贴图重取（快照存图 + 可寻址线索）', () => {
    for (const src of [CHAT_SRC, PROMPT_SRC]) {
      // 张数取自与写快照同源的归一函数，避免「线索说有 3 张、快照只存 2 张」
      expect(src).toMatch(/buildChatImageHint\(normalizeChatImageSnapshot\(attachedImagesSnapshot\)\.length\)/);
      expect(src).toMatch(/(?:finalText|userMessage) \+= chatImageHint/);
      // 只有贴图、没有文件时同样要写快照
      expect(src).toMatch(/if \(attachedFilesSnapshot\.length > 0 \|\| attachedImagesSnapshot\.length > 0\)/);
    }
  });

  it('贴图线索不外泄：历史回放与编辑回填都剥掉', () => {
    expect(CHAT_SRC).toContain("const displayContent = role === 'user' ? stripChatImageHint(rawDisplayContent) : rawDisplayContent;");
    expect(CHAT_SRC).toMatch(/stripArtifactMarkers\(role === 'user'/);
  });
});

describe('session-store 删除清理（行为）', () => {
  let deleteStoreSession;
  let removeDocImageSnapshot;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('../../src/storage/db.js', () => ({
      getAllSessions: async () => [],
      getActiveSessionId: async () => null,
      deleteSession: async () => {},
    }));
    const mod = await import('../../src/storage/session-store.js');
    deleteStoreSession = mod.deleteStoreSession;
    ({ removeDocImageSnapshot } = await import('../../src/side_panel/doc-images.js'));
    removeDocImageSnapshot.mockClear();
  });

  it('deleteStoreSession 同步清理图片快照', async () => {
    await deleteStoreSession('sx');
    expect(removeDocImageSnapshot).toHaveBeenCalledWith('sx');
  });
});
