// scripts/theme-dark-audit.mjs —— 暗色主题逐元素对比度审计 + 白斑（近白底泄漏）检测
//
// 用途（对应主题评审 M-6：验收结论必须可复现，且旧探针漏了配置页）：
//   真扩展加载 dist，把侧边栏与配置页切到 dark，逐个面板/Tab 展开，遍历所有【已渲染】
//   元素用 getComputedStyle 实测前景/背景（含 alpha 合成到 --bg-page 底），按 WCAG 1.4.3
//   计算对比度；低于阈值记违规。另检测暗色下不该出现的近纯白大块背景（“白斑”，即输入框
//   白底那类 bug）。违规非空即 exit 1。
//
// 与静态门禁的分工（避免误读为重复）：
//   - theme-migrate.py --check：静态保证“该 token 化的裸色没漏”，B-2 那类半迁移配对靠它 +
//     whitelist 文件作用域守卫（见 theme-migrate-map.unit.test.js）拦截，不依赖元素是否渲染。
//   - theme-contrast-check.py：静态保证 theme.css 里 token ↔ --bg-surface 自身达标。
//   - 本探针：动态保证“真实渲染出来的界面”在暗色下不出现不可读文字 / 白斑。内容态元素
//     （需特定数据才出现的 .tool-call-status / .search-highlight 等）不在此覆盖范围，由上面两条静态门禁负责。
//
// 用法: node scripts/theme-dark-audit.mjs        （需先 npm run build:silent）
// 可选: --keep  保留浏览器不关闭，便于人工核对
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(path.join(DIST, 'manifest.json'))) {
  console.error('dist 未构建，先跑 npm run build:silent');
  process.exit(1);
}

const extId = createHash('sha256').update(DIST).digest('hex').slice(0, 32)
  .split('').map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
const BASE = `chrome-extension://${extId}`;
const KEEP = process.argv.includes('--keep');

// 页内审计器：不能引用 Node 作用域，字符串注入执行
const AUDIT_FN = `(() => {
  function parse(c) {
    if (!c) return null;
    c = c.trim();
    let m = c.match(/^rgba?\\(([^)]+)\\)$/i);
    if (m) {
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    m = c.match(/^#([0-9a-f]{6})$/i);
    if (m) { const n = parseInt(m[1], 16); return { r: (n>>16)&255, g: (n>>8)&255, b: n&255, a: 1 }; }
    m = c.match(/^#([0-9a-f]{3})$/i);
    if (m) { const h = m[1]; return { r: parseInt(h[0]+h[0],16), g: parseInt(h[1]+h[1],16), b: parseInt(h[2]+h[2],16), a: 1 }; }
    return null;
  }
  function lum(c) {
    const s = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * s[0] + 0.7152 * s[1] + 0.0722 * s[2];
  }
  function ratio(a, b) { const l1 = lum(a), l2 = lum(b); const hi = Math.max(l1, l2), lo = Math.min(l1, l2); return (hi + 0.05) / (lo + 0.05); }
  function over(src, dst) { const a = src.a; return { r: src.r * a + dst.r * (1 - a), g: src.g * a + dst.g * (1 - a), b: src.b * a + dst.b * (1 - a), a: 1 }; }
  const rootStyle = getComputedStyle(document.documentElement);
  const pageBg = parse(rootStyle.getPropertyValue('--bg-page')) || { r: 22, g: 24, b: 29, a: 1 };
  function effectiveBg(el) {
    const layers = [];
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const bg = parse(getComputedStyle(cur).backgroundColor);
      if (bg && bg.a > 0) { layers.push(bg); if (bg.a >= 1) break; }
      cur = cur.parentElement;
    }
    let res = pageBg;
    for (const l of layers.slice().reverse()) res = over(l, res);
    return res;
  }
  function selOf(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    else if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.');
    return s;
  }
  function hasOwnText(el) {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) return true;
    return false;
  }
  const violations = [];
  const blotches = [];
  const all = document.querySelectorAll('*');
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.opacity) < 0.5) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;

    // 白斑：暗色下不该出现的近纯白大块背景
    const bg = effectiveBg(el);
    const area = r.width * r.height;
    if (bg.r >= 245 && bg.g >= 245 && bg.b >= 245 && area >= 100) {
      blotches.push({ sel: selOf(el), w: Math.round(r.width), h: Math.round(r.height), bg: 'rgb(' + Math.round(bg.r) + ',' + Math.round(bg.g) + ',' + Math.round(bg.b) + ')' });
    }

    // 文本对比度：仅测有直接文字、且文字色不透明的元素
    if (!hasOwnText(el)) continue;
    const fg = parse(cs.color);
    if (!fg || fg.a < 0.5) continue;
    const fs = parseFloat(cs.fontSize) || 16;
    const fw = parseInt(cs.fontWeight, 10) || 400;
    const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
    const thr = large ? 3 : 4.5;
    const eff = effectiveBg(el);
    const cr = ratio(fg, eff);
    if (cr < thr - 0.001) {
      violations.push({ sel: selOf(el), text: el.textContent.trim().slice(0, 24), fs: Math.round(fs), fw, thr, ratio: Math.round(cr * 100) / 100 });
    }
  }
  // 去重（同选择器同类保留最严重一条）
  const vmap = {};
  for (const v of violations) { const k = v.sel + '|' + v.thr; if (!vmap[k] || vmap[k].ratio > v.ratio) vmap[k] = v; }
  const bmap = {};
  for (const b of blotches) { if (!bmap[b.sel]) bmap[b.sel] = b; }
  return { violations: Object.values(vmap).sort((a, b) => a.ratio - b.ratio), blotches: Object.values(bmap) };
})()`;

const ctx = await chromium.launchPersistentContext(path.join(__dirname, '_theme-dark-audit-profile'), {
  channel: 'chromium',
  headless: false,
  viewport: null,
  args: [
    `--disable-extensions-except=${DIST}`,
    `--load-extension=${DIST}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,920',
  ],
});

let fail = 0;
let scanPoints = 0;
const allViolations = [];
const allBlotches = [];

async function setDark(page) {
  await page.evaluate(() => new Promise((r) => chrome.storage.local.set({ appTheme: 'dark' }, r)));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.getAttribute('data-theme') === 'dark', null, { timeout: 20000 });
  await page.waitForTimeout(300);
}

async function audit(page, where) {
  scanPoints++;
  const res = await page.evaluate(AUDIT_FN);
  for (const v of res.violations) allViolations.push({ where, ...v });
  for (const b of res.blotches) allBlotches.push({ where, ...b });
}

async function safeClick(page, selector, timeout = 2500) {
  try { await page.click(selector, { timeout }); await page.waitForTimeout(250); return true; } catch { return false; }
}

// ---------- 侧边栏 ----------
{
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 420, height: 900 });
  page.on('pageerror', (e) => { console.log('  [pageerror] ' + e.message); fail++; });
  await page.goto(`${BASE}/side_panel.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('.header'), null, { timeout: 20000 });
  await setDark(page);
  await audit(page, 'side:默认');

  // 合成巡检：Toast 各类型 + 弹窗表单控件（这些是瞬态/需交互才出现，真实链路扫不到，
  // 但样式规则固定，注入即可稳定回归防护：暗色下白字压亮底 / 输入框落白底都会被抓出）
  await page.evaluate(() => {
    const tc = document.getElementById('toastContainer') || document.body;
    window.__syn = { toasts: [], holder: null };
    for (const t of ['success', 'error', 'info', 'warning', '']) {
      const el = document.createElement('div');
      el.className = ('toast ' + t).trim() + ' toast-show';
      el.style.opacity = '1';
      el.style.transition = 'none';
      el.textContent = '已复制';
      tc.appendChild(el);
      window.__syn.toasts.push(el);
    }
    const holder = document.createElement('div');
    holder.className = 'sched-modal';
    holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;padding:8px;display:block';
    holder.innerHTML = '<input placeholder="名"><textarea rows="2"></textarea><select><option>x</option></select><input class="modal-input" value="m">';
    document.body.appendChild(holder);
    window.__syn.holder = holder;
  });
  await audit(page, 'side:Toast/弹窗控件');
  await page.evaluate(() => {
    (window.__syn?.toasts || []).forEach((e) => e.remove());
    window.__syn?.holder?.remove();
    delete window.__syn;
  });

  // 更多下拉 + 主题二级菜单
  if (await safeClick(page, '#headerMoreBtn')) {
    await audit(page, 'side:更多');
    await safeClick(page, '#themeToggleBtn');
    await audit(page, 'side:主题子菜单');
  }
  await safeClick(page, '#headerMoreBtn'); // 收起

  // 逐个可展开面板
  for (const [sel, name] of [
    ['#promptTriggerBtn', '提示词面板'],
    ['#toolsConfigBtn', '工具配置'],
    ['#agentSelectorBtn', '助手选择'],
  ]) {
    if (await safeClick(page, sel)) {
      await audit(page, `side:${name}`);
      await page.keyboard.press('Escape').catch(() => {});
      await page.waitForTimeout(150);
    }
  }
  await page.close();
}

// ---------- 配置页（旧探针漏掉的部分）----------
{
  const page = await ctx.newPage();
  await page.setViewportSize({ width: 1200, height: 900 });
  page.on('pageerror', (e) => { console.log('  [pageerror] ' + e.message); fail++; });
  await page.goto(`${BASE}/options.html`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.tab-nav-btn', { timeout: 20000 });
  await setDark(page);
  const tabs = await page.$$eval('.tab-nav-btn', (bs) => bs.map((b) => b.dataset.tab));
  for (const tab of tabs) {
    await safeClick(page, `.tab-nav-btn[data-tab="${tab}"]`);
    await audit(page, `options:Tab=${tab}`);
  }
  await page.close();
}

// ---------- 汇总 ----------
console.log('\n===== 暗色对比度审计汇总 =====');
if (allBlotches.length) {
  console.log(`\n白斑（暗色下近纯白大块背景） ${allBlotches.length} 处：`);
  for (const b of allBlotches) console.log(`  ✗ [${b.where}] ${b.sel} ${b.w}x${b.h} bg=${b.bg}`);
}
if (allViolations.length) {
  console.log(`\n对比度不达标 ${allViolations.length} 处：`);
  for (const v of allViolations) console.log(`  ✗ [${v.where}] ${v.sel} 文字"${v.text}" ${v.fs}px/${v.fw} 比值=${v.ratio} < ${v.thr}`);
}
if (!allViolations.length && !allBlotches.length) {
  console.log(`✓ 已渲染界面 0 违规、0 白斑（覆盖 ${scanPoints} 个巡检点）`);
}

if (!KEEP) await ctx.close();
if (allViolations.length || allBlotches.length || fail) {
  console.log(`\n审计未通过：违规=${allViolations.length} 白斑=${allBlotches.length} pageerror=${fail}`);
  process.exit(1);
}
console.log('\n审计通过。');
process.exit(0);
