// test/e2e/workdir-meta-band.e2e.spec.js - 输入区信息带的窄屏降级视觉验证
//
// 计划 §8 / §12 要求：侧边栏 520 / 460 / 400 / 320 四档下确认
//   1) 信息带四个成员（上下文环 / 目录名 / 免责声明 / 模型名）不重叠、不溢出容器；
//   2) 目录名过长时单行省略（chip 宽度受断点约束）；
//   3) 免责声明在 ≤460px 隐藏，百分比文字在 ≤420px 隐藏（只留环）。
//
// 用真实 side_panel.html 的输入区片段 + 真实 styles.css，避免手搓 DOM 与线上不一致。
// 截图落在 test-results-probes/workdir-meta-band/（探针产物，不进仓库）。
import { test, expect } from '@playwright/test';
import { readFileSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SHOT_DIR = path.resolve(ROOT, 'test-results-probes/workdir-meta-band');

/** 取真实 HTML 里 .input-container 开头到 textarea 结束的片段（含信息带） */
function inputAreaFragment() {
  const html = readFileSync(path.resolve(ROOT, 'side_panel.html'), 'utf-8');
  const start = html.indexOf('<div class="input-container"');
  const end = html.indexOf('</textarea>', start);
  if (start < 0 || end < 0) throw new Error('side_panel.html 结构变化：找不到输入区片段');
  // 补齐 input-wrapper 与 input-container 的闭合
  return `${html.slice(start, end + '</textarea>'.length)}\n</div>\n</div>`;
}

const LONG_DIR = 'ai-helper-session-workdir-with-a-very-long-name';

async function setup(page, width) {
  await page.setViewportSize({ width, height: 720 });
  await page.setContent(`<!doctype html><html><body>${inputAreaFragment()}</body></html>`);
  await page.addStyleTag({ path: path.resolve(ROOT, 'src/side_panel/styles.css') });
  // 填真实内容：上下文百分比、本会话目录名（故意超长）、模型名
  await page.evaluate((dirName) => {
    const percent = document.querySelector('.context-usage-percent');
    if (percent) percent.textContent = '62%';
    const tag = document.getElementById('workdirTag');
    const name = document.getElementById('workdirTagName');
    if (tag && name) {
      tag.style.display = '';
      name.textContent = dirName;
      tag.title = `/Users/dev/projects/${dirName}（本会话）`;
    }
    const model = document.getElementById('currentModelTag');
    if (model) model.textContent = 'claude-sonnet-4-5';
  }, LONG_DIR);
}

/** 信息带各成员的几何信息 */
function bandMetrics(page) {
  return page.evaluate(() => {
    const rect = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return {
        left: r.left, right: r.right, top: r.top, bottom: r.bottom,
        width: r.width, height: r.height,
        display: cs.display, visible: cs.display !== 'none' && r.width > 0 && r.height > 0,
        clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
      };
    };
    const container = document.querySelector('.input-container');
    const band = document.querySelector('.input-meta-band');
    return {
      band: rect(band),
      container: rect(container),
      textarea: rect(document.getElementById('userInput')),
      ring: rect(document.getElementById('contextUsageIndicator')),
      percent: rect(document.querySelector('.context-usage-percent')),
      workdir: rect(document.getElementById('workdirTag')),
      workdirName: rect(document.getElementById('workdirTagName')),
      disclaimer: rect(document.querySelector('.input-disclaimer')),
      model: rect(document.getElementById('currentModelTag')),
    };
  });
}

const WIDTHS = [520, 460, 400, 320];

test.beforeAll(() => {
  mkdirSync(SHOT_DIR, { recursive: true });
});

for (const width of WIDTHS) {
  test(`侧边栏 ${width}px：信息带不重叠、不溢出容器`, async ({ page }) => {
    await setup(page, width);
    const m = await bandMetrics(page);

    // 信息带必须落在容器内（左右各留 16px 内边距，误差 1px）
    expect(m.band.left).toBeGreaterThanOrEqual(m.container.left - 1);
    expect(m.band.right).toBeLessThanOrEqual(m.container.right + 1);
    // 不能压到输入框文字
    expect(m.band.top).toBeGreaterThanOrEqual(m.textarea.bottom - 1);
    expect(m.band.bottom).toBeLessThanOrEqual(m.container.bottom + 1);

    // 四个成员按顺序横排、互不重叠
    const order = [m.ring, m.workdir, m.disclaimer, m.model].filter((r) => r && r.visible);
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i].left, `第 ${i} 项左边界应在上一项右侧`).toBeGreaterThanOrEqual(order[i - 1].right - 0.6);
    }

    await page.screenshot({ path: path.join(SHOT_DIR, `band-${width}.png`) });
  });

  test(`侧边栏 ${width}px：目录名省略与断点降级`, async ({ page }) => {
    await setup(page, width);
    const m = await bandMetrics(page);

    // 目录 chip 可见且单行省略：内容被截断（scrollWidth > clientWidth）
    expect(m.workdir.visible).toBe(true);
    expect(m.workdir.width).toBeLessThanOrEqual(141);
    expect(m.workdirName.scrollWidth).toBeGreaterThan(m.workdirName.clientWidth);
    // 完整路径放在 title 里
    expect(await page.getAttribute('#workdirTag', 'title')).toContain(LONG_DIR);

    if (width <= 520) {
      expect(m.workdir.width).toBeLessThanOrEqual(111);
    }
    if (width <= 460) {
      // 免责声明让位（保住目录名与模型名）
      expect(m.disclaimer.display).toBe('none');
      expect(m.workdir.visible).toBe(true);
      expect(m.model.visible).toBe(true);
    } else {
      expect(m.disclaimer.visible).toBe(true);
    }
    if (width <= 420) {
      // 只留环，百分比文字隐藏
      expect(m.percent.display).toBe('none');
      expect(m.ring.visible).toBe(true);
    } else {
      expect(m.percent.visible).toBe(true);
    }
  });
}

test('四档宽度下目录名可读长度单调不增（先压目录名再隐藏文案）', async ({ page }) => {
  const widths = [];
  for (const width of [520, 460, 400, 320]) {
    await setup(page, width);
    const m = await bandMetrics(page);
    widths.push({ width, workdir: m.workdir.width, model: m.model.width });
  }
  for (let i = 1; i < widths.length; i += 1) {
    expect(widths[i].workdir, `${widths[i].width}px 的目录名不应比更宽时更长`)
      .toBeLessThanOrEqual(widths[i - 1].workdir + 0.6);
  }
  // 模型名优先级最高：全程不被压缩到不可读
  for (const w of widths) expect(w.model).toBeGreaterThan(60);
});
