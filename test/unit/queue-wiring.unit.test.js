// queue-wiring.unit.test.js - 队列接线的源码守卫
//
// 这类改动最容易出的问题不是逻辑写错，而是"少接了一根线"：
//   - 某处生成收尾漏调 notifyGenerationEnded → 队列在这一条路径上永不接力
//   - 生成中按 Enter 又走回 sendMessage → 内容被静默吞掉（本功能要解决的原始痛点）
//   - 第三态吃掉停止入口 → 用户想停却停不下来
// 这些都无法用纯函数单测覆盖，沿用仓库既有的源码守卫写法。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import zh from '../../src/shared/locales/zh.js';
import en from '../../src/shared/locales/en.js';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('生成收尾只允许一个入口', () => {
  test('generatingSessionIds.delete 只出现在 state.js 与 generation-lifecycle.js', () => {
    const files = [
      'src/side_panel/chat-manager.js',
      'src/side_panel/index.js',
      'src/side_panel/prompt-manager.js',
      'src/side_panel/chat-resume.js',
      'src/side_panel/chat-streaming.js',
    ];
    for (const file of files) {
      const src = read(file);
      expect(src, `${file} 不应再自己删生成态，必须走 notifyGenerationEnded`).not.toContain('generatingSessionIds.delete(');
    }
  });

  test('四条发送/恢复路径都接入了 notifyGenerationEnded', () => {
    for (const file of [
      'src/side_panel/chat-manager.js',
      'src/side_panel/index.js',
      'src/side_panel/prompt-manager.js',
      'src/side_panel/chat-resume.js',
    ]) {
      const src = read(file);
      expect(src, `${file} 缺少 notifyGenerationEnded 接线`).toContain('notifyGenerationEnded(');
    }
  });

  test('队列接力挂在 generation-ended 上，而不是散落各处', () => {
    const runner = read('src/side_panel/queue-runner.js');
    expect(runner).toContain('onGenerationEnded(handleGenerationEnded)');
  });
});

describe('发送按钮三态', () => {
  const indexSrc = () => read('src/side_panel/index.js');

  test('生成中 + 有草稿 → 入队形态；无草稿 → 停止形态', () => {
    const src = indexSrc();
    expect(src).toContain('const queueMode = generating && hasDraft;');
    expect(src).toContain("sendBtn.classList.toggle('queue-mode', queueMode)");
    expect(src).toContain("sendBtn.classList.toggle('stop-mode', generating && !queueMode)");
  });

  test('第三态保留伴随停止按钮（停止入口不能消失）', () => {
    const src = indexSrc();
    expect(src).toContain('stopCompanionBtn');
    expect(src).toContain("stopCompanionBtn.style.display = queueMode ? '' : 'none';");
    expect(read('side_panel.html')).toContain('id="stopCompanionBtn"');
  });

  test('生成中按 Enter 走入队，不再调 sendMessage', () => {
    const src = indexSrc();
    // 生成中：Alt+Enter → 插话（不入队）；普通 Enter → 入队。两条分支都不调 sendMessage。
    expect(src).toContain('if (e.altKey) {\n          void injectAdHocText(userInput.value);\n          return;\n        }');
    expect(src).toContain('void enqueueFromInput();\n        return;\n      }\n      sendMessage();');
  });

  test('草稿变化会刷新按钮形态', () => {
    expect(indexSrc()).toContain("userInput.addEventListener('input', updateSendBtnState);");
  });

  test('面板初始化把 sendMessage 注入为队列的唯一发送器', () => {
    const src = indexSrc();
    expect(src).toContain('bindDispatcher((opts) => sendMessage(opts))');
    expect(src).toContain('await initQueueRunner()');
    expect(src).toContain('await initQueuePanel()');
  });
});

describe('队列复用发送管线', () => {
  const chatSrc = () => read('src/side_panel/chat-manager.js');

  test('sendMessage 接受 opts 并能给出失败原因', () => {
    const src = chatSrc();
    expect(src).toContain('export async function sendMessage(opts = {})');
    expect(src).toContain("if (!text) return { ok: false, reason: 'empty' };");
    expect(src).toContain("if (state.generatingSessionIds.has(mySessionId)) return { ok: false, reason: 'generating' };");
  });

  test('sendMessage 支持跨会话派发（Phase 2）', () => {
    const src = chatSrc();
    // 目标会话可显式指定，非激活会话不写 state / 不碰 DOM
    expect(src).toContain('const mySessionId = opts.sessionId || state.activeSessionId;');
    expect(src).toContain('const isActive = mySessionId === state.activeSessionId;');
    // 上下文与会话态随载荷传入，不从面板 state 读
    expect(src).toContain('const inputCtx = opts.context ||');
    expect(src).toContain('const sess = isActive ? null : (opts.sessionState || {});');
    // 写回转目标会话，不走 saveCurrentSession
    expect(src).toContain('await persistSessionState(mySessionId, {');
    // 模型 / 工具 / 采样参数都按会话隔离
    expect(src).toContain('const currentModelForSend = isActive ? state.currentModel');
    expect(src).toContain('const enabledToolsForSend = isActive ? state.enabledTools');
    expect(src).toContain('getApiParams(isActive ? null :');
  });

  test('队列派发不清空用户正在写的草稿', () => {
    expect(chatSrc()).toContain('if (isActive && !opts.fromQueue) {');
  });

  test('directSend 在生成中改为入队而不是丢弃', () => {
    const src = chatSrc();
    expect(src).toContain("if (state.isGenerating) {\n    userInput.value = text;\n    userInput.dispatchEvent(new Event('input'));\n    await enqueueFromInput();");
  });

  test('用户点停止会广播 task-stop-requested（供队列暂停接力）', () => {
    expect(read('src/side_panel/chat-streaming.js')).toContain("new CustomEvent('task-stop-requested'");
  });
});

describe('排队条 DOM 与文案', () => {
  test('输入区包含排队条容器', () => {
    const html = read('side_panel.html');
    for (const id of ['queueStrip', 'queueList', 'queueSummary', 'queueToggleBtn', 'queueRecentBtn', 'queueResumeBtn', 'queueRecent']) {
      expect(html, `缺少 #${id}`).toContain(`id="${id}"`);
    }
  });

  test('中英语言包键完全对称', () => {
    const collect = (obj, prefix = '') => {
      const keys = [];
      for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') keys.push(...collect(v, path));
        else keys.push(path);
      }
      return keys.sort();
    };
    expect(collect(zh)).toEqual(collect(en));
  });

  test('queue.* 关键文案存在且无残留占位', () => {
    const required = ['enqueueBtn', 'enqueued', 'queueFull', 'summary', 'resumeQueue', 'recentTitle', 'requeue', 'editBack', 'stopNow'];
    for (const key of required) {
      expect(zh.queue[key], `zh.queue.${key} 缺失`).toBeTruthy();
      expect(en.queue[key], `en.queue.${key} 缺失`).toBeTruthy();
    }
    // 面板/runner 用到的状态文案。
    // 没有 statusQueued：「排队中」是这块区域的默认态，不再单独标注（文案也不该留着给后人误用）。
    for (const key of ['statusDispatching', 'statusInjecting', 'statusInjected', 'statusDone', 'statusFailed', 'statusRecovered', 'statusRunningHint']) {
      expect(zh.queue[key]).toBeTruthy();
      expect(en.queue[key]).toBeTruthy();
    }
    // 见缝插针（⚡ / Alt+Enter）的四条回执文案：缺一条就等于用户点完看不到任何结论
    for (const key of ['inject', 'injectIdleHint', 'injectAccepted', 'injected', 'injectNoTask', 'injectTimeout', 'injectTimeoutAdhoc', 'injectFailed', 'injectNoAttachments']) {
      expect(zh.queue[key], `zh.queue.${key} 缺失`).toBeTruthy();
      expect(en.queue[key], `en.queue.${key} 缺失`).toBeTruthy();
    }
    expect(zh.queue.statusQueued).toBeUndefined();
    expect(en.queue.statusQueued).toBeUndefined();
    // 附件相关文案（带 N 图 / M 文件、已释放、无法恢复）
    for (const key of ['withImages', 'withFiles', 'attachmentsVolatile', 'attachmentsMissing', 'editBackWithAttachments', 'requeuedNoAttachments']) {
      expect(zh.queue[key], `zh.queue.${key} 缺失`).toBeTruthy();
      expect(en.queue[key], `en.queue.${key} 缺失`).toBeTruthy();
    }
  });
});

describe('上下文（图片/文件/引用）不能丢', () => {
  const runnerSrc = () => read('src/side_panel/queue-runner.js');

  test('图片与文件不随队列状态落 storage.local，只留摘要', () => {
    const src = runnerSrc();
    // base64 混进 chrome.storage.local 会让每次状态变更都重写数 MB
    expect(src).toContain('delete light.attachedImages');
    expect(src).toContain('delete light.attachedFiles');
    expect(src).toContain('summarizeAttachments');
    expect(src).toContain('saveAttachments');
  });

  test('派发前先彻底复位再还原，避免上下文串味', () => {
    const src = runnerSrc();
    expect(src).toContain('resetInputContext();\n  restoreContextToInput(');
  });

  test('条目终结时释放重附件，不泄漏磁盘', () => {
    expect(runnerSrc()).toContain('await attachmentStore.deleteAttachments(item.id)');
    expect(read('src/side_panel/queue-panel.js')).toContain('await releaseAttachments(itemId)');
  });

  test('启动时兜底清理孤儿附件', () => {
    expect(runnerSrc()).toContain('pruneAttachmentOrphans');
    expect(runnerSrc()).toContain('attachmentStore.pruneOrphans');
  });

  test('附件存储不得读写 chrome.storage.local', () => {
    const src = read('src/side_panel/queue-attachment-store.js');
    expect(src).not.toContain('chrome.storage.local.set');
    expect(src).not.toContain('chrome.storage.local.get');
    expect(src).toContain('indexedDB.open');
  });

  test('文件未解析完不得入队（否则正文写回孤儿对象，内容真丢）', () => {
    const src = runnerSrc();
    expect(src).toContain('hasUnreadyFiles');
    expect(src).toContain("'pending', 'extracting'");
    // 闸门必须在 detach 之前：先接管再拒绝 = 上下文已经被清空
    expect(src.indexOf('hasUnreadyFiles()')).toBeLessThan(src.indexOf('const snapshot = detachContextFromInput()'));
  });

  test('blob: 临时句柄不得被持久化', () => {
    const src = runnerSrc();
    expect(src).toContain("f.dataUrl.startsWith('blob:')");
    expect(src).toContain('delete rest.dataUrl');
  });

  test('✎ 回填必须还原整条上下文，不能只还原附件', () => {
    expect(runnerSrc()).toContain('export async function restoreContextForItem');
    const panelSrc = read('src/side_panel/queue-panel.js');
    expect(panelSrc).toContain('restoreContextForItem(item)');
    expect(panelSrc).not.toContain('restoreAttachmentsForItem');
  });

  test('自动接力不得清掉用户刚挂的上下文', () => {
    const src = runnerSrc();
    expect(src).toContain('userBackup = captureContext()');
    expect(src).toContain('if (onActiveSession && userHadContext) {');
    // 用户现场要在派发（dispatcher 调用与结算）之前存档，否则存到的已经是空的了
    expect(src.indexOf('userBackup = captureContext()')).toBeLessThan(src.indexOf('const still = store.findItem(sid, item.id)'));
    // 非激活会话不能碰面板输入区（那是别人的现场）
    expect(src).toContain('const onActiveSession = sid === state.activeSessionId;');
  });

  test('没写字但挂了上下文时，回填必须拦住', () => {
    expect(runnerSrc()).toContain('export function currentInputHasContext');
    expect(read('src/side_panel/queue-panel.js')).toContain('else if (currentInputHasContext())');
  });
});

describe('指示器 UI 必须跟着队列同步', () => {
  const indexSrc = () => read('src/side_panel/index.js');

  test('入口层注册了上下文清空 / 还原两个事件', () => {
    const src = indexSrc();
    expect(src).toContain("addEventListener('queue-context-cleared'");
    expect(src).toContain("addEventListener('queue-context-restored'");
  });

  test('清空时逐个调各模块的 clear，还原时重绘', () => {
    const src = indexSrc();
    for (const fn of ['clearSelectedContext', 'clearSkillSelection', 'clearMcpService', 'clearKnowledgeRefs', 'clearPageSelection', 'clearFiles']) {
      expect(src).toContain(fn + '()');
    }
    for (const fn of ['renderSkillIndicator', 'renderMcpIndicator', 'renderKnowledgeIndicator', 'renderImagePreviews', 'renderFilePreviews']) {
      expect(src).toContain(fn + '()');
    }
    // 引用上下文由 chat-manager 的 setQuoteContext 恢复（必须已导出）
    expect(src).toContain('setQuoteContext(snap.quotedContextText)');
    expect(read('src/side_panel/chat-manager.js')).toContain('export function setQuoteContext(');
  });

  // 真实故障：restoreInputContextIndicators 里调了 renderSkillIndicator()，
  // 但 import 名单只加了 renderMcpIndicator → 点「✎ 回填」立刻 ReferenceError。
  // 只断言"字符串在文件里"抓不到这种漏 import，必须逐个核对调用点的标识符来源。
  test('清空/还原回调调用的函数，入口层必须全部已导入', () => {
    const src = indexSrc();

    // 汇总所有 import { ... } from 里引入的名字（含 as 重命名）
    const imported = new Set();
    for (const m of src.matchAll(/import\s*\{([\s\S]*?)\}\s*from\s*'[^']+'/g)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (name) imported.add(name);
      }
    }
    // 入口层自己声明的函数/常量也算有来源
    const local = new Set();
    for (const m of src.matchAll(/(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)\s*[=(]/g)) local.add(m[1]);

    const start = src.indexOf('function clearInputContextIndicators()');
    const end = src.indexOf("addEventListener('queue-context-cleared'");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'function', 'typeof', 'new', 'await']);
    const called = new Set();
    // 负向后顾排除 xxx.方法() 这类属性调用
    for (const m of src.slice(start, end).matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) {
      if (!KEYWORDS.has(m[1])) called.add(m[1]);
    }

    const missing = [...called].filter((n) => !imported.has(n) && !local.has(n));
    expect(missing, `入口层漏 import：${missing.join(', ')}`).toEqual([]);
    // 防正则失效导致空跑通过
    expect(called.has('renderSkillIndicator')).toBe(true);
    expect(called.has('clearFiles')).toBe(true);
  });
});

describe('自动顺带（Phase 4）接线：少一环就是静默不工作', () => {
  const runnerSrc = () => read('src/side_panel/queue-runner.js');

  test('runner 听执行日志更新并走纯函数判定', () => {
    const src = runnerSrc();
    expect(src).toContain("import { evaluateAutoCarry, peakIteration } from './queue-auto-carry.js'");
    expect(src).toContain("else if (message.type === 'EXECUTION_STATUS_UPDATE') handleAutoCarryOnExecutionUpdate(message);");
    expect(src).toContain('hasCandidate: !!candidate');
    expect(src).toContain('void injectQueueItem(candidate.id, sid, { auto: true, iteration });');
  });

  test('子任务期间不自动顺带（插话只有顶层循环会取走）', () => {
    expect(runnerSrc()).toContain('if (message.isSubtask === true) return;');
    // 后台必须真的发出这个标记，否则面板只能干等到 15s 超时回退
    expect(read('src/background/react-loop.js')).toContain('if (isSubtask) msg.isSubtask = true;');
  });

  test('只带队首，且带附件的条目整轮跳过', () => {
    const src = runnerSrc();
    expect(src).toContain('const head = store.peekNext(sid);');
    expect(src).toContain('const candidate = head && !hasBlockingAttachments(head) ? head : null;');
  });

  test('自动触发也走两段式提交（不确认就不出队）', () => {
    // injectQueueItem 是唯一入口：它先 markInjecting 落盘，只有 INJECT_ABSORBED 才结算
    const src = runnerSrc();
    expect(src).toContain('await store.markInjecting(sid, itemId);');
    expect(src).toContain('status: QUEUE_STATUS.INJECTED,');
    expect(src).toContain('export async function injectQueueItem(itemId, sessionId, options = {})');
  });

  test('两个配置项的默认值 & 真源单一', () => {
    const constants = read('src/background/constants.js');
    expect(constants).toContain('queueAutoCarry: true');
    expect(constants).toContain('queueAutoCarryEveryNIterations: 3');
    // 后台只提供默认值，面板侧的 normalizeEveryN 负责夹取区间
    const cfg = read('src/background/config.js');
    expect(cfg).toContain("'queueAutoCarry', 'queueAutoCarryEveryNIterations'");
    expect(cfg).toContain('queueAutoCarry: result.queueAutoCarry !== false');
    // 面板 state 的默认值必须跟常量一致（异步加载失败时靠它撑到下一帧）
    const stateSrc = read('src/side_panel/state.js');
    expect(stateSrc).toContain('queueAutoCarry: true');
    expect(stateSrc).toContain('queueAutoCarryEveryNIterations: 3');
  });

  test('设置页有入口，且切换即落盘（不依赖“保存”按钮）', () => {
    const html = read('options.html');
    expect(html).toContain('id="queueAutoCarry"');
    expect(html).toContain('id="queueAutoCarryEveryNIterations"');
    const optIdx = read('src/options/index.js');
    expect(optIdx).toContain("chrome.storage.local.set({ queueAutoCarry: this.checked });");
    expect(optIdx).toContain('chrome.storage.local.set({ queueAutoCarryEveryNIterations: n });');
    const mgr = read('src/options/config-manager.js');
    expect(mgr).toContain("'queueAutoCarry', 'queueAutoCarryEveryNIterations'");
    expect(mgr).toContain('queueAutoCarryEl.checked = result.queueAutoCarry !== false;');
  });

  test('随配置导出/导入一起走', () => {
    expect(read('src/options/config-io.js')).toContain("'queueAutoCarry', 'queueAutoCarryEveryNIterations'");
  });

  test('设置改完立即生效（不用面板重载）', () => {
    // 否则用户在设置里关掉了，手上这个面板还在偷偷往任务里塞话
    const src = read('src/side_panel/index.js');
    expect(src).toContain('changes.queueAutoCarry)');
    expect(src).toContain('state.chatConfig.queueAutoCarry = changes.queueAutoCarry.newValue !== false;');
    expect(src).toContain('state.chatConfig.queueAutoCarryEveryNIterations = changes.queueAutoCarryEveryNIterations.newValue;');
  });

  test('开关与间隔是主从：关掉开关就把「至少间隔」整行藏起来', () => {
    const html = read('options.html');
    const rowIdx = html.indexOf('id="queueAutoCarryIntervalRow"');
    const inputIdx = html.indexOf('id="queueAutoCarryEveryNIterations"');
    expect(rowIdx).toBeGreaterThan(-1);
    // 输入框必须真的在这个容器里，否则藏的是个空壳
    expect(inputIdx).toBeGreaterThan(rowIdx);

    const mgr = read('src/options/config-manager.js');
    expect(mgr).toContain('export function syncQueueAutoCarryFields()');
    expect(mgr).toContain("row.style.display = toggle.checked ? '' : 'none';");
    // 读回配置后也要同步一次，否则刷新页面会“开关关着却还显示间隔”
    expect(mgr).toContain('syncQueueAutoCarryFields();');
    expect(read('src/options/index.js')).toContain('syncQueueAutoCarryFields();');
  });

  test('隐藏只动 display，不重置已填值（关掉再开回来还在）', () => {
    const mgr = read('src/options/config-manager.js');
    const start = mgr.indexOf('export function syncQueueAutoCarryFields()');
    const body = mgr.slice(start, mgr.indexOf('\n}\n', start));
    expect(body).toContain('.style.display');
    expect(body).not.toContain('.value =');
  });

  test('中英文案都存在', () => {
    for (const key of ['queueAutoCarry', 'queueAutoCarryHint', 'queueAutoCarryEveryN', 'queueAutoCarryEveryNUnit', 'queueAutoCarryEveryNHint']) {
      expect(zh.settings[key], `zh.settings.${key} 缺失`).toBeTruthy();
      expect(en.settings[key], `en.settings.${key} 缺失`).toBeTruthy();
    }
    expect(zh.queue.autoCarried).toBeTruthy();
    expect(en.queue.autoCarried).toBeTruthy();
    // 提示里带轮次占位符，否则用户看不出“带到第几轮”
    expect(zh.queue.autoCarried).toContain('{iteration}');
    expect(en.queue.autoCarried).toContain('{iteration}');
  });
});

describe('Phase 5 增强：停止并发送 / ↑ 编辑队尾 / 拖拽反馈', () => {
  test('「停止并发送」两个入口都在：主按钮右键长按 + 队列条按钮', () => {
    const src = read('src/side_panel/index.js');
    expect(src).toContain('bindStopAndSendTrigger(sendBtn)');
    expect(src).toContain('bindStopAndSendTrigger(stopCompanionBtn)');
    expect(src).toContain("document.addEventListener('queue-stop-and-send'");
    expect(read('side_panel.html')).toContain('id="queueStopSendBtn"');
    expect(read('src/side_panel/queue-panel.js')).toContain("document.dispatchEvent(new CustomEvent('queue-stop-and-send'))");
  });

  test('停止并发送不能被“停止即暂停”吃掉', () => {
    // 顺序错一步就变成：用户点了停止并发送 → 队列被暂停 → 当前任务白停
    const src = read('src/side_panel/queue-runner.js');
    const markIdx = src.indexOf('drainAfterStop.delete(sid)');
    const pauseIdx = src.indexOf("store.pauseSession(sid, 'user_stopped')");
    expect(markIdx).toBeGreaterThan(-1);
    expect(pauseIdx).toBeGreaterThan(markIdx);
    expect(src).toContain('export function markStopAndSend(sessionId)');
    expect(src).toContain('export function hasQueuedItems(sessionId)');
  });

  test('先声明意图再停，且队列空时就别白停一轮', () => {
    const src = read('src/side_panel/index.js');
    const markIdx = src.indexOf('markStopAndSend(sid)');
    const cancelIdx = src.indexOf('cancelStreamingTask(visibleCompanion ? stopCompanionBtn');
    expect(markIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeGreaterThan(markIdx);
    expect(src).toContain("t('queue.stopAndSendEmpty')");
    expect(src).toContain("t('queue.stopAndSendStarted')");
  });

  test('上限提示有出口：store 拒绝 → runner 把上限数字告诉用户', () => {
    expect(read('src/side_panel/queue-store.js')).toContain('MAX_ITEMS_PER_SESSION = 20');
    expect(read('src/side_panel/queue-runner.js')).toContain("t('queue.queueFull', { limit: result.limit })");
  });

  test('↑ 编辑队尾优先于历史，但只在输入框真的空着时', () => {
    const src = read('src/side_panel/index.js');
    const tailIdx = src.indexOf('if (editQueueTail())');
    const histIdx = src.indexOf('const nav = resolveHistoryNav({');
    expect(tailIdx).toBeGreaterThan(-1);
    expect(histIdx).toBeGreaterThan(tailIdx);
    // 有草稿 / 已挂上下文 / 正在翻历史时都不能抢键
    expect(src).toContain("e.key === 'ArrowUp' && state.inputHistoryIndex === -1 && !userInput.value.trim()");
    expect(src).toContain('&& !currentInputHasContext()');
    // ✎ 与 ↑ 共用同一条回填路径（两处各写一遇就会各自漂移）
    expect(read('src/side_panel/queue-panel.js')).toContain('await editQueueItem(itemId);');
  });

  test('队列上限 / 停止并发送 / 编辑队尾的中英文案对称', () => {
    for (const key of ['stopAndSend', 'stopAndSendTitle', 'stopAndSendEmpty', 'stopAndSendStarted', 'editTailHint']) {
      expect(zh.queue[key], `zh.queue.${key} 缺失`).toBeTruthy();
      expect(en.queue[key], `en.queue.${key} 缺失`).toBeTruthy();
    }
  });

  test('拖拽有过渡动画（否则看不出自己插到了哪里）', () => {
    const css = read('src/side_panel/styles.css');
    expect(css).toContain('.queue-chip.dragging');
    expect(css).toContain('transform: scale(0.985);');
    expect(css).toContain('transition: box-shadow 0.12s ease');
  });

  test('快捷键面板里能查到这三个新手势（否则没人知道它们存在）', () => {
    const html = read('side_panel.html');
    for (const key of ['shortcuts.editQueueTail', 'shortcuts.injectAdHoc', 'shortcuts.stopAndSend']) {
      expect(html, `${key} 未进入快捷键面板`).toContain(`data-i18n="${key}"`);
    }
    for (const key of ['editQueueTail', 'injectAdHoc', 'stopAndSend']) {
      expect(zh.shortcuts[key], `zh.shortcuts.${key} 缺失`).toBeTruthy();
      expect(en.shortcuts[key], `en.shortcuts.${key} 缺失`).toBeTruthy();
    }
  });
});
