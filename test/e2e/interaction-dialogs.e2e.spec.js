// interaction-dialogs.e2e.spec.js - 真实浏览器里模拟用户点击，验证确认 / 澄清弹窗的并发交互
//
// 与单测的分工：单测在 jsdom + 假 timers 下验证调度逻辑；本文件把两个弹窗模块和闸门
// 打进**同一个 esbuild bundle**（关键：分两个 bundle 会各自持有一份闸门，跨类互斥根本测不出来），
// 加载真实 side_panel.html 的遮罩 DOM 与真实 styles.css，在 Chromium 里用真实鼠标点击驱动：
// 1) 同一时刻只呈现一个弹窗，被排队的一条只在文案里告知条数；
// 2) 澄清不再遮住确认的按钮 —— 这一点靠 Playwright 的真实点击来证明：若被遮挡，点击会因
//    "intercepts pointer events" 失败。另设一条绕过闸门的负向对照，证明这条断言不是空跑；
// 3) 面板侧自动拒绝只对"显示中的那条"生效，排队的那条不从被挡起开始消耗应答窗口；
// 4) 只有真正呈现的那条才上行 INTERACTION_DISPLAYED（后台据此才起倒计时）。
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SHOTS = path.resolve(ROOT, 'test-results-probes');

// 面板侧自动拒绝用短超时，让"排队不计时"在秒级内可观测
const SHORT_MS = 2000;

let bundle;

test.beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: [
        "export { showConfirmDialog, dismissConfirmDialog, initConfirmEvents } from './src/side_panel/confirm-dialog.js';",
        "export { showClarifyDialog, handleClarifyTimeout, initClarifyEvents } from './src/side_panel/clarify-dialog.js';",
      ].join('\n'),
      resolveDir: ROOT,
      sourcefile: 'dialog-entry.js',
      loader: 'js',
    },
    bundle: true,
    format: 'iife',
    globalName: 'Dialogs',
    write: false,
    target: 'es2020',
    platform: 'browser',
  });
  bundle = result.outputFiles[0].text;
});

/** 取真实弹窗区块（确认 + 澄清两段遮罩），不自己另写一份 DOM，避免与产品页面漂移 */
function extractOverlayMarkup() {
  const html = fs.readFileSync(path.resolve(ROOT, 'side_panel.html'), 'utf-8');
  const start = html.indexOf('<!-- 敏感操作确认对话框 -->');
  const end = html.indexOf('<!-- 会话重命名弹窗 -->');
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('未能从 side_panel.html 提取确认/澄清弹窗区块');
  }
  return html.slice(start, end);
}

// 页面内 chrome stub：记录上行消息、可按需派发后台下行消息
// 写成内联 script 而非 addInitScript，是为了直接引用 setContent 里的 DOM，也避开闭包序列化坑
const STUB = `
window.__sent = [];
window.__listeners = [];
window.chrome = {
  runtime: {
    lastError: null,
    id: 'e2e-interaction',
    getManifest: () => ({ version: '0.0.0' }),
    getURL: (p) => p,
    sendMessage: (msg) => { window.__sent.push(JSON.parse(JSON.stringify(msg))); return Promise.resolve({ received: true }); },
    onMessage: {
      addListener: (l) => window.__listeners.push(l),
      removeListener: (l) => { const i = window.__listeners.indexOf(l); if (i >= 0) window.__listeners.splice(i, 1); },
    },
    connect: () => ({ postMessage: () => {}, onMessage: { addListener: () => {} }, disconnect: () => {} }),
    getContexts: () => Promise.resolve([{ contextType: 'SIDE_PANEL' }]),
  },
  storage: {
    local: {
      get: (keys, cb) => { const r = {}; if (typeof cb === 'function') { cb(r); return undefined; } return Promise.resolve(r); },
      set: (obj, cb) => { if (typeof cb === 'function') { cb(); return undefined; } return Promise.resolve(); },
      onChanged: { addListener: () => {} },
    },
    session: {
      get: (keys, cb) => { const r = {}; if (typeof cb === 'function') { cb(r); return undefined; } return Promise.resolve(r); },
      set: (obj, cb) => { if (typeof cb === 'function') { cb(); return undefined; } return Promise.resolve(); },
      remove: (k, cb) => { if (typeof cb === 'function') { cb(); return undefined; } return Promise.resolve(); },
    },
    onChanged: { addListener: () => {} },
  },
  i18n: { getUILanguage: () => 'zh-CN' },
  tabs: { query: (q, cb) => { if (typeof cb === 'function') cb([]); return Promise.resolve([]); } },
  notifications: { create: () => {} },
};
window.__dispatch = (msg) => { window.__listeners.slice().forEach((l) => l(msg, {}, () => {})); };
window.__sentOf = (type, kind) => window.__sent.filter((m) => m.type === type
  && (!kind || m.data?.kind === kind || m.kind === kind));
`;

const pageErrors = [];

async function setupPage(page) {
  pageErrors.length = 0;
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('console', (m) => { if (m.type() === 'error') pageErrors.push(`console: ${m.text()}`); });

  await page.setViewportSize({ width: 380, height: 720 });
  await page.setContent(`<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"></head>
    <body><div id="toastContainer"></div>${extractOverlayMarkup()}<script>${STUB}</script></body></html>`);
  await page.addStyleTag({ path: path.resolve(ROOT, 'src/side_panel/styles.css') });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => {
    window.Dialogs.initConfirmEvents();
    window.Dialogs.initClarifyEvents();
  });
  expect(pageErrors, 'stub 缺口或模块加载报错').toEqual([]);
}

const confirmMsg = (toolCallId, sessionId, timeout = 300000) => ({
  type: 'SHOW_CONFIRM_DIALOG',
  data: {
    toolName: 'agent_exec',
    toolLabel: '本地命令执行',
    args: { command: `cmd-${toolCallId}` },
    toolCallId,
    sessionId,
    timeout,
  },
});

const clarifyMsg = (toolCallId, sessionId, question) => ({
  type: 'SHOW_CLARIFY_DIALOG',
  data: {
    question,
    options: ['方案甲', '方案乙'],
    recommendedOption: 0,
    allowCustomInput: true,
    allowAdditionalInfo: true,
    toolCallId,
    sessionId,
    timeout: 300000,
  },
});

const overlayShown = (page, id, viaClass) =>
  page.evaluate(({ id, viaClass }) => {
    const el = document.getElementById(id);
    if (!el) return false;
    return viaClass ? el.classList.contains('show') : getComputedStyle(el).display !== 'none';
  }, { id, viaClass });

const messageText = (page, id) => page.locator(`#${id}`).textContent();
const sent = (page, type, kind) =>
  page.evaluate(({ type, kind }) => window.__sentOf(type, kind), { type, kind });

/** 遮罩带 fadeIn 动画，不等收敛会拍到半透明中间态 */
async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, name) });
}

test.describe('确认与澄清弹窗的并发交互（真实浏览器 + 真实点击）', () => {
  test('两条并发确认：只弹第一条并告知排队，点放行只结算那一条', async ({ page }) => {
    await setupPage(page);

    await page.evaluate((m) => window.__dispatch(m), confirmMsg('call-C1', 'TASK_subtask_0'));
    await page.evaluate((m) => window.__dispatch(m), confirmMsg('call-C2', 'TASK_subtask_1'));

    await expect(page.locator('#confirmOverlay')).toBeVisible();
    const text = await messageText(page, 'confirmMessage');
    expect(text).toContain('本地命令执行');
    expect(text).toContain('另有 1 条待确认');
    await shot(page, '_interaction-confirm-queued.png');

    // 只渲染了队头：第二条的命令没有出现在界面上
    expect(await messageText(page, 'confirmArgsSummary')).toContain('cmd-call-C1');
    expect(await messageText(page, 'confirmArgsSummary')).not.toContain('cmd-call-C2');

    // 呈现回执只有正在显示的那条：排队的一条不得消耗后台倒计时
    const displayed = await sent(page, 'INTERACTION_DISPLAYED');
    expect(displayed.map((m) => m.data.toolCallId)).toEqual(['call-C1']);

    await page.click('#confirmApproveOnceBtn');
    const responses = await sent(page, 'TOOL_CONFIRMATION_RESPONSE');
    expect(responses).toHaveLength(1);
    expect(responses[0]).toMatchObject({ toolCallId: 'call-C1', confirmed: true, scope: 'single' });

    // 队列推进到第二条：排队提示消失，回执此刻才补上报
    await expect(page.locator('#confirmArgsSummary')).toContainText('cmd-call-C2');
    expect(await messageText(page, 'confirmMessage')).not.toContain('另有');
    expect((await sent(page, 'INTERACTION_DISPLAYED')).map((m) => m.data.toolCallId))
      .toEqual(['call-C1', 'call-C2']);

    await page.click('#confirmDenyBtn');
    expect(await sent(page, 'TOOL_CONFIRMATION_RESPONSE')).toHaveLength(2);
    await expect(page.locator('#confirmOverlay')).not.toBeVisible();
  });

  test('关联 ID 重复但命令不同（模型对并行调用复用 id）：两条都得弹，不得被去重吞掉', async ({ page }) => {
    await setupPage(page);

    // 只看 ID 的去重会把第二条当成副本直接丢弃：它在后台挂着等确认，用户却永远看不到，
    // 而一旦它和第一条共用一键，用户点一次又会把后台的所有挂起确认一并放行
    const dup = (command) => ({
      type: 'SHOW_CONFIRM_DIALOG',
      data: {
        toolName: 'agent_exec',
        toolLabel: '本地命令执行',
        args: { command },
        toolCallId: 'tcDup',
        sessionId: 'TASK',
        timeout: 300000,
      },
    });
    await page.evaluate((m) => window.__dispatch(m), dup('sudo apt install a'));
    await page.evaluate((m) => window.__dispatch(m), dup('sudo git push -f'));

    await expect(page.locator('#confirmOverlay')).toBeVisible();
    expect(await messageText(page, 'confirmArgsSummary')).toContain('sudo apt install a');
    expect(await messageText(page, 'confirmMessage')).toContain('另有 1 条待确认');

    await page.click('#confirmApproveOnceBtn');

    // 第二条顶上，它的应答由用户单独作出
    await expect(page.locator('#confirmArgsSummary')).toContainText('sudo git push -f');
    expect((await sent(page, 'INTERACTION_DISPLAYED')).map((m) => m.data.toolCallId))
      .toEqual(['tcDup', 'tcDup']);

    await page.click('#confirmDenyBtn');
    const responses = await sent(page, 'TOOL_CONFIRMATION_RESPONSE');
    expect(responses).toHaveLength(2);
    expect(responses[1]).toMatchObject({ toolCallId: 'tcDup', confirmed: false });
    await expect(page.locator('#confirmOverlay')).not.toBeVisible();
  });

  test('澄清不再压住确认：确认按钮可真实点击，答完才交接给澄清', async ({ page }) => {
    await setupPage(page);

    await page.evaluate((m) => window.__dispatch(m), confirmMsg('call-C1', 'TASK_subtask_0'));
    await page.evaluate((m) => window.__dispatch(m), clarifyMsg('call-X1', 'TASK_subtask_1', '要发布哪个版本？'));

    // 澄清那条只在确认文案里"代告"存在，自己不显示
    await expect(page.locator('#clarifyOverlay')).not.toBeVisible();
    expect(await messageText(page, 'confirmMessage')).toContain('另有 1 条其他请求在排队');
    expect((await sent(page, 'INTERACTION_DISPLAYED', 'clarify'))).toHaveLength(0);

    // 真实点击：旧实现里这里会因澄清遮罩压住按钮而失败
    await page.click('#confirmApproveLoopBtn');
    expect(await sent(page, 'TOOL_CONFIRMATION_RESPONSE'))
      .toMatchObject([{ toolCallId: 'call-C1', confirmed: true, scope: 'loop' }]);

    // 确认后澄清才拿到闸门，此时才上报它的呈现回执
    await expect(page.locator('#clarifyOverlay')).toHaveClass(/\bshow\b/);
    expect((await sent(page, 'INTERACTION_DISPLAYED', 'clarify')).map((m) => m.data.toolCallId))
      .toEqual(['call-X1']);
    await shot(page, '_interaction-gate-handoff.png');

    await page.click('.clarify-option-item[data-index="1"]');
    await page.click('#clarifyConfirmBtn');
    const clarified = await sent(page, 'CLARIFY_RESPONSE');
    expect(clarified[0]).toMatchObject({ toolCallId: 'call-X1', sessionId: 'TASK_subtask_1', selectedOption: 1 });
    await expect(page.locator('#clarifyOverlay')).not.toHaveClass(/\bshow\b/);
  });

  test('负向对照：绕过闸门强行叠两个遮罩时，确认按钮会被遮挡（证明上一条不是空跑）', async ({ page }) => {
    await setupPage(page);
    await page.evaluate((m) => window.__dispatch(m), confirmMsg('call-C1', 'TASK_subtask_0'));

    // 复现旧行为：不走闸门，直接把澄清遮罩 add('show')
    await page.evaluate(() => document.getElementById('clarifyOverlay').classList.add('show'));
    await expect(page.locator('#clarifyOverlay')).toHaveClass(/\bshow\b/);

    // 两条同为 z-index 5000，DOM 后出现的澄清压住确认 → 真实点击点不到
    const err = await page.click('#confirmApproveOnceBtn', { timeout: 1500 }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(String(err)).toMatch(/intercepts pointer events/);

    // 用户此时既看不见确认按钮，也看不见"另有确认"的提示 → 正是「没机会拒绝就被判拒」的成因
    expect(await messageText(page, 'clarifyQuestion')).not.toContain('待确认');
  });

  test('面板自动拒绝只对显示中的那条生效：排队的一条不提前被拒', async ({ page }) => {
    await setupPage(page);

    // 两条都用 2s 短超时
    await page.evaluate((m) => window.__dispatch(m), confirmMsg('call-C1', 'TASK_subtask_0', SHORT_MS));
    await page.evaluate((m) => window.__dispatch(m), confirmMsg('call-C2', 'TASK_subtask_1', SHORT_MS));

    // 第一条的倒计时在走，第二条压根没渲染
    const firstCountdown = await messageText(page, 'confirmCountdownText');
    expect(firstCountdown).toContain('剩余时间');
    await expect(page.locator('#confirmArgsSummary')).toContainText('cmd-call-C1');

    await page.waitForTimeout(SHORT_MS + 400);
    const auto = await sent(page, 'TOOL_CONFIRMATION_RESPONSE');
    // 只有显示中的那条被自动拒绝
    expect(auto).toHaveLength(1);
    expect(auto[0]).toMatchObject({ toolCallId: 'call-C1', confirmed: false });

    // 排队那条此刻才开始呈现并从头开始自己的应答窗口
    await expect(page.locator('#confirmArgsSummary')).toContainText('cmd-call-C2');
    expect((await sent(page, 'INTERACTION_DISPLAYED')).map((m) => m.data.toolCallId))
      .toEqual(['call-C1', 'call-C2']);
    await expect(page.locator('#confirmCountdownText')).toContainText('剩余时间');

    await page.waitForTimeout(SHORT_MS + 400);
    const auto2 = await sent(page, 'TOOL_CONFIRMATION_RESPONSE');
    expect(auto2).toHaveLength(2);
    expect(auto2[1]).toMatchObject({ toolCallId: 'call-C2', confirmed: false });
    await expect(page.locator('#confirmOverlay')).not.toBeVisible();
  });

  test('后台撤销排队条目后，答完当前条不会再弹这条死确认', async ({ page }) => {
    await setupPage(page);
    await page.evaluate((m) => window.__dispatch(m), confirmMsg('call-C1', 'TASK_subtask_0'));
    await page.evaluate((m) => window.__dispatch(m), confirmMsg('call-C2', 'TASK_subtask_1'));
    expect(await messageText(page, 'confirmMessage')).toContain('另有 1 条待确认');

    // 后台已自行结算 C2（如任务级放行扩散），下行撤销
    await page.evaluate(() => window.__dispatch({
      type: 'DISMISS_CONFIRM_DIALOG', data: { toolCallId: 'call-C2', sessionId: 'TASK_subtask_1' },
    }));
    // 撤销不得回发响应，且排队提示当场刷新
    expect(await sent(page, 'TOOL_CONFIRMATION_RESPONSE')).toHaveLength(0);
    expect(await messageText(page, 'confirmMessage')).not.toContain('另有');

    await page.click('#confirmApproveOnceBtn');
    await expect(page.locator('#confirmOverlay')).not.toBeVisible();
    expect((await sent(page, 'INTERACTION_DISPLAYED')).map((m) => m.data.toolCallId)).toEqual(['call-C1']);
  });

  test('兄弟澄清的超时通知按 toolCallId 匹配，不误刷正在显示的澄清', async ({ page }) => {
    await setupPage(page);
    await page.evaluate((m) => window.__dispatch(m), clarifyMsg('call-X1', 'TASK_subtask_0', '要发布哪个版本？'));
    await expect(page.locator('#clarifyOverlay')).toHaveClass(/\bshow\b/);

    // 并行子任务里另一条澄清的超时：与当前显示的不是同一条
    await page.evaluate(() => window.__dispatch({ type: 'CLARIFY_TIMEOUT', toolCallId: 'call-OTHER', sessionId: 'TASK_subtask_1' }));
    expect(await messageText(page, 'clarifyQuestion')).toContain('要发布哪个版本？');
    await expect(page.locator('#clarifyOverlay')).toHaveClass(/\bshow\b/);
    expect(await sent(page, 'CLARIFY_RESPONSE')).toHaveLength(0);

    // 属于当前条的通知才收敛，且不回发响应（后台已自行结算）
    await page.evaluate(() => window.__dispatch({ type: 'CLARIFY_TIMEOUT', toolCallId: 'call-X1', sessionId: 'TASK_subtask_0' }));
    await expect(page.locator('#clarifyOverlay')).not.toHaveClass(/\bshow\b/);
    expect(await sent(page, 'CLARIFY_RESPONSE')).toHaveLength(0);
    expect(await page.locator('#toastContainer').textContent()).toContain('已超时');

    await shot(page, '_interaction-clarify-timeout-toast.png');
  });
});
