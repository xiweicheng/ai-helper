// scripts/self-test-nested.mjs - 真机自测：加载 dist 扩展，在多层嵌套 iframe + Shadow 页面里逐层划词，
// 验证 Layer 0/1/2 协同：1) 顶层帧工具条能渲染可见；2) 子帧不本地创建浮层（Layer 0），
// 但子帧划词仍能经跨帧中转唤起顶层工具条（嵌套划词未回归）；3) 任何帧都不把浮层留在 body；
// 4) 真实编辑区不混入工具条文本（泄漏已修复）。
// 用法：node scripts/self-test-nested.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FIX = path.join(ROOT, 'test/e2e/fixtures');
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const p = path.join(FIX, req.url === '/' ? 'nested-shadow-iframe.html' : req.url.split('?')[0]);
  fs.readFile(p, (err, data) => {
    if (err) { res.writeHead(404); res.end('nf'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'text/plain' });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const base = `http://localhost:${port}`;

const ctx = await chromium.launchPersistentContext('', {
  headless: false,
  args: ['--disable-extensions-except=' + DIST, '--load-extension=' + DIST, '--use-mock-keychain'],
});
// 等待 MV3 service worker 就绪（扩展真正可用）
let sw = ctx.serviceWorkers()[0];
if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: 15000 }).catch(() => null);

const page = await ctx.newPage();
await page.goto(base + '/nested-shadow-iframe.html', { waitUntil: 'load' });
await page.waitForTimeout(1500);

const results = [];
// 逐帧（含深层嵌套）划词：选中该帧 body 内一段 .sel 文本，派发 selectionchange+mouseup，看工具条是否出现
async function probeFrame(frame, label) {
  try {
    const info = await frame.evaluate(() => {
      function findSel(root) {
        const els = root.querySelectorAll ? root.querySelectorAll('.sel,[contenteditable="true"]') : [];
        for (const el of els) { if ((el.innerText || '').trim().length > 4) return el; }
        return null;
      }
      // 穿透本帧 shadow
      let target = findSel(document);
      if (!target) {
        for (const h of document.querySelectorAll('*')) {
          if (h.shadowRoot) { target = findSel(h.shadowRoot); if (target) break; }
        }
      }
      if (!target) return { ok: false, reason: 'no selectable text in frame' };
      const range = document.createRange();
      range.selectNodeContents(target);
      range.setEnd(target.firstChild || target, 8);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.dispatchEvent(new Event('selectionchange'));
      document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 }));

      // 收集本帧浮层挂载事实
      const tb = document.getElementById('aih-selection-toolbar');
      const host = document.getElementById('aih-overlay-host');
      // 真实编辑区泄漏探测：contenteditable=true 且不在我方浮层内
      const FORB = ['AI搜索', '解释', '翻译', '总结', '复制', '更多工具', '推荐追问'];
      const editors = Array.from(document.querySelectorAll('[contenteditable="true"]'))
        .filter((el) => !(el.closest && el.closest('[data-aih]')));
      const editorLeak = editors
        .map((el) => (el.innerText || el.textContent || ''))
        .filter((t) => FORB.some((w) => t.indexOf(w) !== -1));
      return {
        ok: true,
        hasToolbar: !!tb,
        parentIsHost: !!tb && !!host && tb.parentElement === host,
        inBody: !!tb && document.body.contains(tb),
        hostUnderDocEl: !!host && host.parentElement === document.documentElement,
        tbContentEditableFalse: !!tb && tb.getAttribute('contenteditable') === 'false',
        visible: !!tb && getComputedStyle(tb).display !== 'none',
        editorCount: editors.length,
        editorLeak,
      };
    });
    results.push({ label, ...info });
  } catch (e) {
    results.push({ label, error: String(e.message || e) });
  }
}

await probeFrame(page.mainFrame(), 'L0(top)');
for (const f of page.frames()) {
  if (f === page.mainFrame()) continue;
  const u = f.url() || 'iframe';
  await probeFrame(f, u.split('/').pop() + '#' + page.frames().indexOf(f));
}

// 顶层点一次“本帧污染检查”
let checkOut = null;
try {
  await page.click('#check-btn', { timeout: 3000 });
  await page.waitForTimeout(200);
  checkOut = await page.textContent('#check-out');
} catch (e) { checkOut = 'no top check: ' + e.message; }

console.log('\n===== SELF-TEST RESULT =====');
console.log(JSON.stringify({ serviceWorker: !!sw, frames: results, topCheck: (checkOut || '').slice(0, 300) }, null, 2));

// 判定：顶层帧工具条须渲染可见；Layer 0 下子帧不应本地创建工具条；任何帧不得把浮层留在 body；真实编辑区不得混入工具条文本
const topFrame = results.find((r) => r.label === 'L0(top)') || {};
const badRender = !topFrame.hasToolbar || !topFrame.visible;
const childFrames = results.filter((r) => r.label !== 'L0(top)' && r.ok && !r.error);
// Layer 0 生效标志：子帧本地不创建工具条
const childWithToolbar = childFrames.filter((r) => r.hasToolbar);
const leakRisk = results.filter((r) => r.ok && r.inBody);
const editorPollution = results.filter((r) => r.ok && r.editorLeak && r.editorLeak.length);
console.log('\n判定 -> 顶层渲染正常:', !badRender,
  '| Layer0生效(子帧本地无工具条):', childWithToolbar.length === 0, '(子帧意外有工具条的帧数=' + childWithToolbar.length + ')',
  '| 浮层落在body内的帧:', leakRisk.length,
  '| 被污染的真实编辑区帧:', editorPollution.length);

// 针对性回归确认：在某个子帧真实划词后，顶层工具条是否被跨帧中转触发为可见
const anyChild = page.frames().find((f) => f !== page.mainFrame());
let relayVisible = null;
if (anyChild) {
  await anyChild.evaluate(() => {
    const el = document.querySelector('.sel,[contenteditable="true"]') || document.body;
    const range = document.createRange();
    range.selectNodeContents(el);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 }));
  }).catch(() => {});
  await page.waitForTimeout(400);
  relayVisible = await page.evaluate(() => {
    const tb = document.getElementById('aih-selection-toolbar');
    return !!tb && getComputedStyle(tb).display !== 'none' && tb.classList.contains('aih-show');
  }).catch(() => null);
}
console.log('子帧划词 -> 顶层工具条被中转唤起可见:', relayVisible);

await ctx.close();
server.close();
