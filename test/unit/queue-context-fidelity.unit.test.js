// @vitest-environment jsdom
// queue-context-fidelity.unit.test.js - "排队时带的上下文，执行时还在不在"
//
// 这是用户最担心的一件事：看到队列里只有一行文字，怀疑图片、文件、引用、
// 技能、MCP、知识库、网页这些隐形上下文被丢了。本文件逐项锁死这些行为：
//   1. 入队时 8 类上下文被完整接管，并从输入区清空（不会重复带到下一条）
//   2. 面板重载（内存全丢，只剩磁盘）后派发，8 类上下文随载荷逐项还原
//   3. 派发只带载荷不碰输入区：条目上下文绝无串味，用户现场原封不动
//   4. 入队失败（队列满）时上下文原样回滚到输入区，一个字都不丢
//   5. 附件记录真的取不到时，条目照常执行并明确提示，绝不悄悄降级
import { describe, test, expect, beforeEach, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ showToast: vi.fn() }));

vi.mock('../../src/side_panel/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, showToast: mocks.showToast };
});

import state from '../../src/side_panel/state.js';
import * as store from '../../src/side_panel/queue-store.js';
import * as attachments from '../../src/side_panel/queue-attachment-store.js';
import * as runner from '../../src/side_panel/queue-runner.js';
import { __resetLifecycleForTest, notifyGenerationEnded } from '../../src/side_panel/generation-lifecycle.js';

const IMAGE = { originalUrl: 'data:image/png;base64,AAAA', compressedUrl: 'data:image/png;base64,AA' };
const FILE = { name: '需求.md', size: 10, type: 'text/markdown', dataUrl: 'data:text/plain;base64,BB', text: '# 需求正文', status: 'done' };

function makeDiskAdapter() {
  const disk = {};
  return {
    disk,
    async get(key) {
      return disk[key] ? JSON.parse(JSON.stringify(disk[key])) : undefined;
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) disk[k] = JSON.parse(JSON.stringify(v));
    },
  };
}

function makeAttachmentAdapter() {
  const records = new Map();
  return {
    records,
    async put(record) { records.set(record.id, JSON.parse(JSON.stringify(record))); },
    async get(id) { return records.has(id) ? JSON.parse(JSON.stringify(records.get(id))) : null; },
    async remove(id) { records.delete(id); },
    async removeBySession(sessionId) {
      for (const [key, value] of [...records.entries()]) {
        if (value.sessionId === sessionId) records.delete(key);
      }
    },
    async allKeys() { return [...records.keys()]; },
  };
}

let disk;
let attachDisk;

const ui = () => document.getElementById('userInput');

/** 把 8 类上下文全部挂到输入区 */
function mountAllContext() {
  state.quotedContextText = '这是引用的原文';
  state.selectedContextText = '';
  state.selectedSkills = [{ name: 'skill-a', description: '技能A' }];
  state.selectedMcpServices = [{ serverId: 'mcp-1', serverName: 'MCP One' }];
  state.knowledgeRefs = [{ id: 'kb-1', name: '知识库' }];
  state.selectedPage = { id: 42, title: '页面标题', url: 'https://example.com' };
  state.attachedImages = [{ ...IMAGE }];
  state.attachedFiles = [{ ...FILE }];
}

/** 清空输入区上下文（模拟真实的"发送后已被消费"） */
function clearInputContext() {
  state.quotedContextText = '';
  state.selectedContextText = '';
  state.selectedSkills = [];
  state.selectedMcpServices = [];
  state.knowledgeRefs = [];
  state.selectedPage = null;
  state.attachedImages = [];
  state.attachedFiles = [];
}

/** 模拟面板重载：模块内存全丢，只剩 storage.local 与 IndexedDB */
async function simulateReload() {
  store.__resetStoreForTest();
  store.__setStorageAdapter(disk);
  runner.__resetRunnerForTest();
  attachments.__resetForTest();
  attachments.__setAdapterForTest(attachDisk);
  state.activeSessionId = 's1';
  state.generatingSessionIds.clear();
  clearInputContext();
  await store.init();
}

beforeEach(async () => {
  store.__resetStoreForTest();
  runner.__resetRunnerForTest();
  __resetLifecycleForTest();
  attachments.__resetForTest();
  mocks.showToast.mockClear();

  disk = makeDiskAdapter();
  attachDisk = makeAttachmentAdapter();
  store.__setStorageAdapter(disk);
  attachments.__setAdapterForTest(attachDisk);

  state.activeSessionId = 's1';
  state.generatingSessionIds.clear();
  clearInputContext();

  document.body.innerHTML = '<textarea id="userInput"></textarea><div id="imagePreviewBar"></div>';
  await store.init();
});

describe('入队：上下文被完整接管', () => {
  test('8 类上下文全部随条目保存，且从输入区清空', async () => {
    mountAllContext();
    ui().value = '顺便把登录页的报错文案改一下';

    const res = await runner.enqueueFromInput({ autoDrain: false });
    expect(res.ok).toBe(true);

    const item = store.getItems('s1')[0];
    // 轻量上下文落在条目快照里
    expect(item.contextSnapshot.quotedContextText).toBe('这是引用的原文');
    expect(item.contextSnapshot.selectedSkills).toHaveLength(1);
    expect(item.contextSnapshot.selectedMcpServices[0].serverId).toBe('mcp-1');
    expect(item.contextSnapshot.knowledgeRefs[0].id).toBe('kb-1');
    expect(item.contextSnapshot.selectedPage.url).toBe('https://example.com');
    // 图片/文件不进 storage.local（体积），只留摘要
    expect(item.contextSnapshot.attachedImages).toBeUndefined();
    expect(item.contextSnapshot.attachedFiles).toBeUndefined();
    expect(item.attachmentSummary).toEqual({ imageCount: 1, fileCount: 1, fileNames: ['需求.md'] });
    expect(item.hasContext).toBe(true);

    // 输入区被清空：不会重复带到下一条消息
    expect(state.quotedContextText).toBe('');
    expect(state.selectedSkills).toHaveLength(0);
    expect(state.selectedMcpServices).toHaveLength(0);
    expect(state.knowledgeRefs).toHaveLength(0);
    expect(state.selectedPage).toBeNull();
    expect(state.attachedImages).toHaveLength(0);
    expect(state.attachedFiles).toHaveLength(0);
    expect(ui().value).toBe('');
  });

  test('只带图片/文件（没有引用文字）也算带上下文', async () => {
    state.attachedImages = [{ ...IMAGE }];
    ui().value = '就一张图';
    await runner.enqueueFromInput({ autoDrain: false });

    const item = store.getItems('s1')[0];
    expect(item.hasContext).toBe(true);
    expect(item.attachmentSummary.imageCount).toBe(1);
  });

  test('队列已满时上下文原样回滚到输入区，一个字都不丢', async () => {
    for (let i = 0; i < store.MAX_ITEMS_PER_SESSION; i += 1) {
      await store.enqueue({ sessionId: 's1', text: `占位 ${i}` });
    }
    mountAllContext();
    ui().value = '溢出的一条';

    const res = await runner.enqueueFromInput({ autoDrain: false });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('queue_full');
    expect(ui().value).toBe('溢出的一条');
    expect(state.quotedContextText).toBe('这是引用的原文');
    expect(state.selectedSkills).toHaveLength(1);
    expect(state.selectedPage.url).toBe('https://example.com');
    expect(state.attachedImages).toHaveLength(1);
    expect(state.attachedFiles).toHaveLength(1);
  });

  test('回滚时广播 queue-context-restored：指示器必须跟着回来', async () => {
    // 入队先把上下文从输入区摘走（指示器一并隐藏），失败再把 state 还回来。
    // 如果只还 state 不广播，界面上引用/技能/网页/图片全都“消失”了——
    // 用户以为丢了内容，实际上它还在 state 里，这种状态最容易被误判成丢数据。
    for (let i = 0; i < store.MAX_ITEMS_PER_SESSION; i += 1) {
      await store.enqueue({ sessionId: 's1', text: `占位 ${i}` });
    }
    mountAllContext();
    ui().value = '溢出的一条';

    const restored = [];
    const onRestored = (e) => restored.push(e && e.detail ? e.detail.snapshot : null);
    document.addEventListener('queue-context-restored', onRestored);
    try {
      await runner.enqueueFromInput({ autoDrain: false });
    } finally {
      document.removeEventListener('queue-context-restored', onRestored);
    }

    expect(restored).toHaveLength(1);
    expect(restored[0].quotedContextText).toBe('这是引用的原文');
    expect(restored[0].selectedPage.url).toBe('https://example.com');
    expect(restored[0].attachedImages).toHaveLength(1);
  });
});

describe('派发：上下文逐项还原', () => {
  test('面板重载后派发：8 类上下文随载荷完整传入，且不借用输入区', async () => {
    mountAllContext();
    ui().value = '带上下文排队';
    await runner.enqueueFromInput({ autoDrain: false });

    // 内存副本全部丢失（附件只能靠 IndexedDB 取回）
    await simulateReload();
    expect(state.attachedImages).toHaveLength(0);

    const captured = [];
    runner.bindDispatcher(async (payload) => {
      captured.push({
        quoted: payload.context.quotedContextText,
        skills: payload.context.selectedSkills.map((s) => s.name),
        mcp: payload.context.selectedMcpServices.map((s) => s.serverId),
        kb: payload.context.knowledgeRefs.map((r) => r.id),
        page: payload.context.selectedPage && payload.context.selectedPage.url,
        images: payload.context.attachedImages.length,
        imageOk: payload.context.attachedImages[0] && payload.context.attachedImages[0].originalUrl === IMAGE.originalUrl,
        files: payload.context.attachedFiles.map((f) => f.name),
        fileText: payload.context.attachedFiles[0] && payload.context.attachedFiles[0].text,
        // 派发路径不得借用输入区：派发当下 state 必须仍是用户现场（这里是空的）
        stateQuoted: state.quotedContextText,
        stateImages: state.attachedImages.length,
      });
      return { ok: true };
    });

    await runner.drainQueue('s1');

    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({
      quoted: '这是引用的原文',
      skills: ['skill-a'],
      mcp: ['mcp-1'],
      kb: ['kb-1'],
      page: 'https://example.com',
      images: 1,
      imageOk: true,
      files: ['需求.md'],
      fileText: '# 需求正文',
      stateQuoted: '',
      stateImages: 0,
    });
  });

  test('连续派发：每条只拿自己入队时的上下文，条目之间绝不串味', async () => {
    // 需要生命周期接线（接力才会在一轮结束后继续下一条）
    await runner.initQueueRunner({ autoResume: false });
    mountAllContext();
    ui().value = 't1';
    await runner.enqueueFromInput({ autoDrain: false });

    // 第一条入队时上下文已被接管，这里再写 t2 → 它天然没有上下文
    ui().value = 't2';
    await runner.enqueueFromInput({ autoDrain: false });

    const captured = [];
    runner.bindDispatcher(async (payload) => {
      captured.push({
        quoted: payload.context.quotedContextText,
        images: payload.context.attachedImages.length,
        files: payload.context.attachedFiles.length,
        page: payload.context.selectedPage,
      });
      // 模拟真实链路：一轮结束会广播 generation-ended，接力才会继续。
      // 这里故意不消费 state —— 载荷化后每条上下文各自独立，不存在串味可能。
      notifyGenerationEnded('s1');
      return { ok: true };
    });

    await runner.drainQueue('s1');

    expect(captured).toHaveLength(2);
    expect(captured[0].quoted).toBe('这是引用的原文');
    expect(captured[0].images).toBe(1);
    expect(captured[1]).toEqual({ quoted: '', images: 0, files: 0, page: null });
  });

  test('派发成功后释放重附件，归档里只留文本与摘要（不泄漏磁盘）', async () => {
    mountAllContext();
    ui().value = '带图执行一次';
    await runner.enqueueFromInput({ autoDrain: false });
    expect(attachDisk.records.size).toBe(1);

    runner.bindDispatcher(async () => ({ ok: true }));
    await runner.drainQueue('s1');

    expect(attachDisk.records.size).toBe(0);
    const archived = store.getRecent('s1')[0];
    expect(archived.text).toBe('带图执行一次');
    // 归档仍保留摘要：重新入队时能如实告诉用户"附件已释放"
    expect(archived.attachmentSummary).toEqual({ imageCount: 1, fileCount: 1, fileNames: ['需求.md'] });
  });

  test('派发失败回队时附件必须保留（下一条还要用）', async () => {
    mountAllContext();
    ui().value = '会失败的一条';
    await runner.enqueueFromInput({ autoDrain: false });

    runner.bindDispatcher(async () => ({ ok: false, reason: 'generating' }));
    await runner.drainQueue('s1');

    expect(store.getItems('s1')).toHaveLength(1);
    expect(attachDisk.records.size).toBe(1);
    // 附件还留在 IndexedDB 等重试；输入区在入队接管后就一直是空的（派发不借用、失败也不回填）
    expect(state.attachedImages).toHaveLength(0);
  });

  test('附件记录真的丢失时：条目照常执行、只发文字、并明确提示', async () => {
    mountAllContext();
    ui().value = '附件被清理掉的一条';
    await runner.enqueueFromInput({ autoDrain: false });

    // 模拟附件记录被外部清掉（例如用户清了浏览器存储）
    attachDisk.records.clear();

    const captured = [];
    runner.bindDispatcher(async (payload) => {
      captured.push({ images: payload.context.attachedImages.length, files: payload.context.attachedFiles.length });
      return { ok: true };
    });

    await runner.drainQueue('s1');

    // 条目照常执行，没有丢
    expect(captured).toHaveLength(1);
    expect(captured[0]).toEqual({ images: 0, files: 0 });
    expect(store.getItems('s1')).toHaveLength(0);
    expect(store.getRecent('s1')).toHaveLength(1);
    // 并且确实提示过用户（不静默降级）
    expect(mocks.showToast).toHaveBeenCalled();
  });
});

describe('✎ 回填：整条上下文一起还原', () => {
  test('回填不只附件：引用/技能/MCP/知识库/网页/图片/文件全部回去', async () => {
    mountAllContext();
    ui().value = '待回填的一条';
    await runner.enqueueFromInput({ autoDrain: false });

    await simulateReload();
    const item = store.getItems('s1')[0];
    expect(item.attachmentSummary).toBeTruthy();

    const res = await runner.restoreContextForItem(item);

    expect(res).toEqual({ ok: true, attachments: true, wantsAttachments: true });
    // 8 类逐项校验：拿回草稿时上下文不能只剩文字
    expect(state.quotedContextText).toBe('这是引用的原文');
    expect(state.selectedSkills).toEqual([{ name: 'skill-a', description: '技能A' }]);
    expect(state.selectedMcpServices).toEqual([{ serverId: 'mcp-1', serverName: 'MCP One' }]);
    expect(state.knowledgeRefs).toEqual([{ id: 'kb-1', name: '知识库' }]);
    expect(state.selectedPage).toEqual({ id: 42, title: '页面标题', url: 'https://example.com' });
    expect(state.attachedImages).toHaveLength(1);
    expect(state.attachedImages[0].originalUrl).toBe(IMAGE.originalUrl);
    expect(state.attachedFiles).toHaveLength(1);
    expect(state.attachedFiles[0].text).toBe('# 需求正文');
  });

  test('回填会广播 queue-context-restored，供各指示器重绘', async () => {
    mountAllContext();
    ui().value = '待回填的一条';
    await runner.enqueueFromInput({ autoDrain: false });

    const item = store.getItems('s1')[0];
    const seen = [];
    const handler = (e) => seen.push(e.detail && e.detail.snapshot);
    document.addEventListener('queue-context-restored', handler);
    try {
      await runner.restoreContextForItem(item);
    } finally {
      document.removeEventListener('queue-context-restored', handler);
    }

    expect(seen).toHaveLength(1);
    expect(seen[0].quotedContextText).toBe('这是引用的原文');
  });

  test('条目没有附件时不谎报，也不污染输入区', async () => {
    await store.enqueue({ sessionId: 's1', text: '纯文字' });
    const item = store.getItems('s1')[0];

    const res = await runner.restoreContextForItem(item);

    expect(res.attachments).toBe(false);
    expect(res.wantsAttachments).toBe(false);
    expect(state.attachedImages).toHaveLength(0);
  });

  // 回填的语义是「把这条草稿还给我编辑」，不是「清空输入区」：
  // 用户完全可能一边排队一边为下一条消息挂好了上下文，点 ✎ 不能把它们静默清掉。
  test('回填不得清掉用户为下一条消息挂的上下文（条目没带的那几类一律保留）', async () => {
    await store.enqueue({ sessionId: 's1', text: '纯文字条目' });
    const item = store.getItems('s1')[0];

    state.quotedContextText = '用户引用';
    state.selectedContextText = '用户选中';
    state.selectedSkills = [{ name: 'user-skill', description: '' }];
    state.selectedMcpServices = [{ serverId: 'mcp-user', serverName: '用户MCP' }];
    state.knowledgeRefs = [{ id: 'kb-user', name: '用户知识库' }];
    state.selectedPage = { id: 7, title: '用户页面', url: 'https://user.example' };
    state.attachedImages = [{ originalUrl: 'data:user-img', compressedUrl: 'data:user-img' }];
    state.attachedFiles = [{ name: 'user.md', size: 3, type: 'text/markdown', text: 'x', status: 'done' }];

    await runner.restoreContextForItem(item);

    expect(state.quotedContextText).toBe('用户引用');
    expect(state.selectedContextText).toBe('用户选中');
    expect(state.selectedSkills).toEqual([{ name: 'user-skill', description: '' }]);
    expect(state.selectedMcpServices).toEqual([{ serverId: 'mcp-user', serverName: '用户MCP' }]);
    expect(state.knowledgeRefs).toEqual([{ id: 'kb-user', name: '用户知识库' }]);
    expect(state.selectedPage).toEqual({ id: 7, title: '用户页面', url: 'https://user.example' });
    expect(state.attachedImages).toHaveLength(1);
    expect(state.attachedImages[0].originalUrl).toBe('data:user-img');
    expect(state.attachedFiles).toHaveLength(1);
    expect(state.attachedFiles[0].name).toBe('user.md');
  });

  test('条目带了同一类上下文时按条目整条替换（回填仍要能还原草稿）', async () => {
    mountAllContext();
    ui().value = '带图的条目';
    await runner.enqueueFromInput({ autoDrain: false });
    const item = store.getItems('s1')[0];

    // 用户随后又给下一条挂了一张不同的图
    state.attachedImages = [{ originalUrl: 'data:user-img', compressedUrl: 'data:user-img' }];

    await runner.restoreContextForItem(item);

    // 条目这张覆盖掉用户那张，避免回填出来的草稿与实际条目不一致
    expect(state.attachedImages).toHaveLength(1);
    expect(state.attachedImages[0].originalUrl).toBe(IMAGE.originalUrl);
  });
});

describe('入队闸门：解析中的文件不会被静默丢内容', () => {
  test('文件仍在解析时不入队，且输入区上下文原样保留', async () => {
    mountAllContext();
    state.attachedFiles = [
      { name: '大文件.docx', size: 99, type: '', dataUrl: 'blob:abc', text: '', status: 'extracting' },
    ];
    ui().value = '等文件解析完再发';

    const res = await runner.enqueueFromInput({ autoDrain: false });

    expect(res.ok).toBe(false);
    expect(res.error).toBe('files_extracting');
    // 队列里不能留下半成品条目
    expect(store.getItems('s1')).toHaveLength(0);
    // 上下文一个字都没被拿走（否则正文抽完也写不回条目）
    expect(state.quotedContextText).toBe('这是引用的原文');
    expect(state.attachedFiles).toHaveLength(1);
    expect(state.attachedFiles[0].status).toBe('extracting');
    // 明确告知，不静默拒绝
    expect(mocks.showToast).toHaveBeenCalled();
  });

  test('blob: 临时句柄不会被持久化，但文件正文照样跟着走', async () => {
    mountAllContext();
    state.attachedFiles = [
      { name: '图.png', size: 10, type: 'image/png', dataUrl: 'blob:https://x/1', text: '正文', status: 'done' },
    ];
    ui().value = '带 blob 的文件';

    await runner.enqueueFromInput({ autoDrain: false });

    const item = store.getItems('s1')[0];
    // 条目只留摘要
    expect(item.attachmentSummary.fileCount).toBe(1);
    expect(JSON.stringify(item)).not.toContain('blob:');
    // 附件库里也不能存 blob 句柄（跨重载必然失效），但正文必须完整
    const record = [...attachDisk.records.values()][0];
    expect(record).toBeTruthy();
    expect(JSON.stringify(record)).not.toContain('blob:');
    expect(record.files[0].text).toBe('正文');
  });
});

describe('自动接力不得清掉用户刚挂的上下文', () => {
  test('派发全程用户现场原封不动：不被借用、不被清空、也不被归还动作碰到', async () => {
    await runner.initQueueRunner({ autoResume: false });

    // 先排一条带完整上下文的
    mountAllContext();
    ui().value = '排队的一条';
    await runner.enqueueFromInput({ autoDrain: false });
    expect(state.quotedContextText).toBe('');

    // 用户在生成期间又挂了一张图 + 一段引用，准备下一条自己发
    const USER_IMAGE = { originalUrl: 'data:image/png;base64,USER', compressedUrl: 'data:image/png;base64,U' };
    state.attachedImages = [{ ...USER_IMAGE }];
    state.quotedContextText = '用户新挂的引用';

    const captured = [];
    runner.bindDispatcher(async (payload) => {
      // 本条只拿自己的上下文（载荷携带）；派发当下用户现场必须原封不动
      captured.push({
        quote: payload.context.quotedContextText,
        images: payload.context.attachedImages.map((i) => i.originalUrl),
        files: payload.context.attachedFiles.map((f) => f.name),
        userQuote: state.quotedContextText,
        userImages: state.attachedImages.map((i) => i.originalUrl),
      });
      return { ok: true };
    });

    await runner.drainQueue('s1');

    // 本条拿到的是它自己的上下文，没串上用户新挂的
    expect(captured).toHaveLength(1);
    expect(captured[0].quote).toBe('这是引用的原文');
    expect(captured[0].images).toEqual([IMAGE.originalUrl]);
    expect(captured[0].files).toEqual(['需求.md']);

    // 派发当下：用户自己挂的现场原封不动（旧实现会把 state 借用/清空）
    expect(captured[0].userQuote).toBe('用户新挂的引用');
    expect(captured[0].userImages).toEqual([USER_IMAGE.originalUrl]);

    // 派发结束后仍然原样（无借用即无需归还）
    expect(state.quotedContextText).toBe('用户新挂的引用');
    expect(state.attachedImages).toHaveLength(1);
    expect(state.attachedImages[0].originalUrl).toBe(USER_IMAGE.originalUrl);
  });
});
