// options-save-bar.e2e.spec.js - 真实浏览器验证保存按钮栏的吸附行为
//
// 加载真实 styles.css + 打包真实 save-bar.js，验证：
// 1. 内容超出一屏：按钮栏吸附在视口底部保持可见（.floating），滚到页面底部后释放回文档流
// 2. 内容一屏放得下：按钮栏保持在文档流正常位置（无 .floating、底边在视口内）
import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

const VIEWPORT = { width: 800, height: 600 };

let saveBarBundle;

test.beforeAll(async () => {
  const result = await build({
    entryPoints: [path.resolve(ROOT, 'src/options/save-bar.js')],
    bundle: true,
    format: 'iife',
    globalName: 'SaveBar',
    write: false,
    target: 'es2020',
    platform: 'browser',
  });
  saveBarBundle = result.outputFiles[0].text;
});

// 组装与真实 options 页面一致的层级：.container > 内容 + .save-bar#saveBar
async function setupPage(page, contentHeight) {
  await page.setViewportSize(VIEWPORT);
  await page.setContent(`
    <div class="container">
      <div style="height: ${contentHeight}px;"></div>
      <div class="save-bar" id="saveBar"><button class="btn btn-save" id="saveBtn">保存配置</button></div>
    </div>`);
  await page.addStyleTag({ path: path.resolve(ROOT, 'src/options/styles.css') });
  await page.addScriptTag({ content: saveBarBundle });
  await page.evaluate(() => window.SaveBar.initSaveBarSticky());
}

const barMetrics = (page) =>
  page.evaluate(() => {
    const rect = document.getElementById('saveBar').getBoundingClientRect();
    return { bottom: rect.bottom, top: rect.top, innerHeight: window.innerHeight };
  });

test.describe('保存按钮栏吸附（真实浏览器）', () => {
  test('内容超出一屏：按钮吸附视口底部保持可见，滚到页面底部后回到文档流', async ({ page }) => {
    await setupPage(page, 3000);

    const bar = page.locator('#saveBar');
    // 未滚动时按钮已被吸附在视口底部：底边贴住视口底边且在视口内可见
    await expect(bar).toHaveClass(/\bfloating\b/);
    const initial = await barMetrics(page);
    expect(Math.abs(initial.bottom - initial.innerHeight)).toBeLessThanOrEqual(1);
    await expect(bar).toBeInViewport();

    // 滚动到页面中部：按钮仍吸附视口底部可见
    await page.evaluate(() => window.scrollTo(0, 1500));
    await expect
      .poll(async () => {
        const m = await barMetrics(page);
        return Math.abs(m.bottom - m.innerHeight) <= 1;
      })
      .toBe(true);
    await expect(bar).toHaveClass(/\bfloating\b/);

    // 滚到页面底部：按钮回到文档流（吸附释放），floating 移除
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(bar).not.toHaveClass(/\bfloating\b/);
    const settled = await barMetrics(page);
    expect(settled.bottom).toBeLessThan(settled.innerHeight - 10);
  });

  test('内容一屏放得下：按钮保持在文档流正常位置', async ({ page }) => {
    await setupPage(page, 300);

    const bar = page.locator('#saveBar');
    await expect(bar).not.toHaveClass(/\bfloating\b/);
    const m = await barMetrics(page);
    expect(m.bottom).toBeLessThan(m.innerHeight - 10);
    await expect(bar).toBeInViewport();
  });
});
