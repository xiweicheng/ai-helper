// test/e2e/demo-product-form.e2e.spec.js
// 商品录入 Demo 页面冒烟测试：file:// 直开，验证向导流转/模态框/双语/列表
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getContentBundle, callTool } from './helpers/load-module.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file://' + join(__dirname, '../../docs/demo/form-autofill/product-form.html');

let bundle;
test.beforeAll(async () => {
  bundle = await getContentBundle();
});

async function fillStep1(page) {
  await page.fill('#product-name', '无线蓝牙降噪耳机');
  await page.fill('#product-sku', 'SKU-EAR-001');
  await page.selectOption('#product-category', 'electronics');
}
async function fillStep2(page) {
  await page.fill('#product-price', '399');
  await page.fill('#product-original-price', '599');
  await page.fill('#product-stock', '120');
  await page.check('input[name="listing-status"][value="instant"]');
}
async function fillStep3(page) {
  await page.check('#tag-hot');
  await page.check('#tag-new');
  await page.selectOption('#product-warranty', '1y');
  await page.fill('#product-description', '主动降噪，40小时续航。');
}
async function submitOnce(page) {
  await fillStep1(page);
  await page.click('#btn-next');
  await fillStep2(page);
  await page.click('#btn-next');
  await fillStep3(page);
  await page.click('#btn-next');
  await page.click('#open-confirm-modal');
  await page.check('#agree-terms');
  await page.click('#modal-confirm');
}

test.describe('商品录入 Demo 页面', () => {
  test('完整流程：4 步向导 → 模态框 → 提交 → 列表追加 → 重置', async ({ page }) => {
    await page.goto(pageUrl);
    await fillStep1(page);
    await page.click('#btn-next');
    await fillStep2(page);
    await page.click('#btn-next');
    await fillStep3(page);
    await page.click('#btn-next');
    // Step4 打开模态框
    await page.click('#open-confirm-modal');
    await expect(page.locator('#confirm-modal')).toBeVisible();
    // 未勾条款时确认钮禁用
    await expect(page.locator('#modal-confirm')).toBeDisabled();
    await page.fill('#order-remark', '首发批次');
    await page.check('#agree-terms');
    await page.click('#modal-confirm');
    // 提交后：模态框关闭、toast 出现、列表追加一行、回到 Step1
    await expect(page.locator('#confirm-modal')).toBeHidden();
    await expect(page.locator('#toast')).toBeVisible();
    const rows = page.locator('#recorded-tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('SKU-EAR-001');
    await expect(page.locator('.step-panel[data-step="1"]')).toBeVisible();
    await expect(page.locator('#product-name')).toHaveValue('');
  });

  test('必填校验：Step1 空值点下一步被阻止并显示错误', async ({ page }) => {
    await page.goto(pageUrl);
    await page.click('#btn-next');
    await expect(page.locator('.step-panel[data-step="1"]')).toBeVisible();
    await expect(page.locator('#product-name')).toHaveClass(/invalid/);
    const err = page.locator('.step-panel[data-step="1"] .field-error').first();
    await expect(err).not.toHaveText('');
  });

  test('双语切换：文案切换但选中值不变，且刷新后保持', async ({ page }) => {
    await page.goto(pageUrl);
    await fillStep1(page);
    await page.click('#lang-toggle');
    // 界面切英文
    await expect(page.locator('#lang-toggle')).toHaveText('中文');
    await expect(page.locator('#product-category option[value="electronics"]')).toHaveText('Electronics');
    // 选中值保持不变
    await expect(page.locator('#product-category')).toHaveValue('electronics');
    await expect(page.locator('#product-name')).toHaveValue('无线蓝牙降噪耳机');
    // localStorage 持久化
    await page.reload();
    await expect(page.locator('#lang-toggle')).toHaveText('中文');
  });

  test('清空列表恢复空态', async ({ page }) => {
    await page.goto(pageUrl);
    await submitOnce(page);
    await expect(page.locator('#recorded-tbody tr')).toHaveCount(1);
    await page.click('#clear-records');
    await expect(page.locator('#recorded-tbody tr')).toHaveCount(1); // 空态行
    await expect(page.locator('#recorded-tbody')).toContainText('暂无数据');
  });

  test('叠加层：模态框提升到 [打开层] 且 ref 可操作', async ({ page }) => {
    await page.addInitScript({ content: bundle });
    await page.goto(pageUrl);
    await fillStep1(page);
    await page.click('#btn-next');
    await fillStep2(page);
    await page.click('#btn-next');
    await fillStep3(page);
    await page.click('#btn-next');
    await page.click('#open-confirm-modal');
    // 等模态框淡入动画结束（过渡期间 opacity 检查会视作不可见）
    await page.waitForFunction(() => {
      const card = document.querySelector('.modal-card');
      return card && getComputedStyle(card).opacity === '1';
    });
    const snap = await callTool(page, 'queryInteractiveElements', {});
    const lines = snap.content.split('\n');
    const overlayIdx = lines.indexOf('[打开层]');
    const bodyIdx = lines.indexOf('[页面主体]');
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(overlayIdx);

    // 模态框确认钮位于打开层区块内且只出现一次（主体去重）
    const confirmIdx = lines.findIndex(l => l.includes('确认提交') && l.includes('[ref '));
    expect(confirmIdx).toBeGreaterThan(overlayIdx);
    expect(confirmIdx).toBeLessThan(bodyIdx);
    expect(lines.filter(l => l.includes('确认提交') && l.includes('[ref ')).length).toBe(1);

    // ref 操作：勾选条款 → 返回修改关闭模态框
    const agreeLine = lines.find(l => l.includes('我已阅读并同意') && l.includes('[ref '));
    const agreeRef = Number(agreeLine.match(/\[ref (\d+)\]/)[1]);
    await callTool(page, 'interactByRef', agreeRef, 'click', { waitTime: 0, timeout: 0 });
    expect(await page.isChecked('#agree-terms')).toBe(true);

    const cancelLine = lines.find(l => l.includes('返回修改') && l.includes('[ref '));
    const cancelRef = Number(cancelLine.match(/\[ref (\d+)\]/)[1]);
    await callTool(page, 'interactByRef', cancelRef, 'click', { waitTime: 100, timeout: 500 });
    await expect(page.locator('#confirm-modal')).toBeHidden();
  });
});
