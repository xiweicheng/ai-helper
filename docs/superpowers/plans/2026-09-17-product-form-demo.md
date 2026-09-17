# 商品录入表单 Demo 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 交付一个中英双语的 4 步向导 + 模态框商品录入 Demo 页面、配套 3 行数据的 .xlsx 文件和录制说明 README，供插件自动填表视频录制使用。

**Architecture:** 零依赖单 HTML 文件（内联 CSS/JS，i18n 字典驱动双语），Node 脚本复用根目录 `xlsx` 依赖生成 Excel，Playwright 对 `file://` 页面做端到端冒烟验证。所有控件带语义化 id，select/radio/checkbox 的 value 语言无关。

**Tech Stack:** 原生 HTML/CSS/JS、Node（ESM）+ xlsx@0.18.5、@playwright/test（已有配置 `testDir: ./test/e2e`）。

**Spec:** `docs/superpowers/specs/2026-09-17-product-form-demo-design.md`

---

## 文件结构

```
demo/form-autofill/
├── product-form.html      # Demo 页面（单文件，Task 1）
├── 商品录入数据.xlsx       # Task 2 脚本生成
├── scripts/
│   └── generate-xlsx.mjs  # Excel 生成脚本（Task 2）
└── README.md              # 录制流程 + 选择器/中英文映射表（Task 3）
test/e2e/
└── demo-product-form.e2e.spec.js  # Playwright 冒烟测试（Task 4）
```

## 全局契约（所有 Task 必须一致）

**控件 id / name / value（语言无关）：**

| 字段 | 定位 | value 约定 |
|---|---|---|
| 商品名称 | `#product-name` (text) | 自由文本 |
| SKU | `#product-sku` (text) | 自由文本 |
| 分类 | `#product-category` (select) | `""`(占位请选择) / `electronics` / `clothing` / `food` / `home` / `books` |
| 售价 | `#product-price` (number) | 数字 >0 |
| 原价 | `#product-original-price` (number) | 数字，选填 |
| 库存 | `#product-stock` (number) | 整数 ≥0 |
| 上架状态 | `input[name="listing-status"]` (radio) | `instant` / `pending` / `presale` |
| 标签 | `#tag-hot` `#tag-new` `#tag-free-shipping` `#tag-discount` (checkbox) | 勾选=checked |
| 保修期 | `#product-warranty` (select) | `""`(占位) / `none` / `6m` / `1y` / `2y` |
| 描述 | `#product-description` (textarea) | 自由文本 |
| 备注 | `#order-remark` (text，模态框内) | 自由文本 |
| 同意条款 | `#agree-terms` (checkbox，模态框内) | 必勾 |

**其他关键 id：** 步骤面板 `.step-panel`（带 `data-step="1..4"`）、上一步 `#btn-prev`、下一步 `#btn-next`、提交 `#open-confirm-modal`、模态框 `#confirm-modal`、汇总 `#modal-summary`、确认 `#modal-confirm`、返回修改 `#modal-cancel`、语言切换 `#lang-toggle`、已录入表 `#recorded-table` / `#recorded-tbody`、清空 `#clear-records`、toast `#toast`、错误提示元素统一 class `.field-error`。

**中英文文案对照（i18n 字典 & Excel 映射共用）：**

- 分类：电子产品/服装鞋帽/食品饮料/家居用品/图书文具 ↔ Electronics/Clothing/Food & Beverage/Home & Living/Books & Stationery
- 上架状态：立即上架/暂不上架/预售 ↔ Instant Listing/Unlisted/Pre-sale
- 标签：热卖/新品/包邮/限时折扣 ↔ Hot/New/Free Shipping/Limited Discount
- 保修期：无保修/6 个月/1 年/2 年 ↔ None/6 Months/1 Year/2 Years

---

### Task 1: Demo 页面 product-form.html

**Files:**
- Create: `demo/form-autofill/product-form.html`

- [ ] **Step 1: 编写完整单文件页面**

按 spec 实现，结构要求：

1. `<head>` 内联 `<style>`：浅灰背景 `#f3f4f6`、白色卡片 720px 居中、圆角 12px、柔和阴影、主色蓝紫渐变（`linear-gradient(135deg,#6366f1,#8b5cf6)` 用于步骤条高亮/主按钮）；input/select/textarea 高 40px+、字号 15px；`.field-error` 红色 13px 提示；模态框遮罩 `rgba(0,0,0,.45)` + 卡片淡入缩放动画（`@keyframes` opacity+scale）；toast 固定顶部居中、成功绿色、2.5s 自动消失。
2. 页头：左侧标题（`data-i18n="pageTitle"`），右侧 `#lang-toggle` 按钮（当前中文时显示 "EN"，英文时显示 "中文"）。
3. 步骤条：4 个 `.step-item`（圆圈数字 + 文案），当前步高亮渐变底、已完成步显示 ✓；步骤文案 `data-i18n="step1..step4"`（基本信息/价格库存/商品详情/提交确认 ↔ Basic Info/Pricing & Stock/Details/Confirm）。
4. 4 个 `.step-panel`（`data-step="1".."4"`），仅当前步 `display:block`。字段布局按"全局契约"表，每个字段 `<label for>` + 控件 + `.field-error` 空提示元素。select 首项为 `<option value="">` 占位（请选择/Please select）。Step 4 面板：只读汇总卡（`#step4-summary`，随语言刷新）+ `#open-confirm-modal` 按钮。
5. 底部导航：`#btn-prev`（Step1 隐藏）、`#btn-next`（Step4 隐藏）、Step4 显示 `#open-confirm-modal`。
6. 模态框 `#confirm-modal`（默认 `display:none`）：`#modal-summary` 汇总、备注 `#order-remark`、条款 `#agree-terms`（label 文案含链接样式"服务条款"）、`#modal-cancel` / `#modal-confirm`（未勾条款时 disabled 置灰）。
7. 已录入列表卡片：`#recorded-table`（thead 7 列：商品名称/SKU/分类/售价/库存/上架状态/录入时间 ↔ Product/SKU/Category/Price/Stock/Status/Time），`#recorded-tbody` 初始一行空态（colspan=7，"暂无数据"/"No records"），卡片头右侧 `#clear-records`。
8. `<script>` 内联 JS，逻辑：
   - `I18N = { zh: {...}, en: {...} }` 字典含全部静态文案 key（pageTitle、step1-4、各字段 label、占位、按钮、校验错误、toast、表头、空态、模态框文案）与选项文案（`categoryOptions`、`statusOptions`、`tagOptions`、`warrantyOptions` 四组 value→文案映射）。
   - `currentLang`：初始读 `localStorage.getItem('demo-lang')`，无则 `'zh'`；try/catch 包裹读写。
   - `applyLang()`：遍历 `[data-i18n]` 替换 textContent、`[data-i18n-placeholder]` 替换 placeholder；用四组 options 映射重写 select option 与 radio/checkbox 的 label 文案（**不改 value、不改选中状态**）；重写已录入表格表头与已有行的分类/状态单元格（行数据存 value，渲染时转文案）；更新 `#step4-summary`、`#modal-summary`、`document.documentElement.lang`、`#lang-toggle` 显示。
   - 步骤切换 `goStep(n)`：切换 panel 显隐、更新步骤条、`#btn-prev`/`#btn-next` 显隐。
   - 校验 `validateStep(n)`：Step1 名称/SKU 非空、分类非空 value；Step2 售价 >0、库存为 ≥0 整数（`Number.isInteger`）、状态必选；失败字段加 `.invalid` 红框 class 并在其 `.field-error` 写入当前语言错误文案，返回 false 阻止翻页；输入事件即时清除该字段的错误态。
   - Step4 `#open-confirm-modal`：校验前三步全通过后渲染 `#modal-summary`（字段名+当前语言文案值）并打开模态框。
   - `#agree-terms` change 事件联动 `#modal-confirm` disabled。
   - `#modal-confirm`：收集全表单数据 → `records.push({...})`（存 value 与录入时间）→ 关模态框 → 显示成功 toast（"提交成功：{商品名}" / "Submitted: {name}"）→ `renderRecords()` 重绘 tbody（分类/状态按当前语言渲染，价格显示 `¥` 前缀）→ `resetForm()`（form.reset()、清错误态、勾选项清空）→ `goStep(1)`。
   - `#clear-records`：清空 records 并重绘空态。
   - toast 函数：复用同一 `#toast` 元素，`setTimeout` 2500ms 加 `.hide`。
9. 页面初始化：`applyLang()` → `goStep(1)`。

- [ ] **Step 2: 手动冒烟验证**

Run: `cd demo/form-autofill && python3 -m http.server 8899`（后台），浏览器打开 `http://localhost:8899/product-form.html`。
Expected: 中文界面正常；点 `#lang-toggle` 全部文案（含 select 选项、表头）切英文且选中值不变；填完 4 步 → 模态框 → 未勾条款时确认钮置灰 → 勾选提交 → toast + 列表追加一行 + 表单重置回 Step1；必填留空点下一步出现红框错误；`#clear-records` 清空列表。验证后停掉服务。

- [ ] **Step 3: Commit**

```bash
git add demo/form-autofill/product-form.html
git commit -m "feat(demo): 商品录入 4 步向导 + 模态框双语 Demo 页面"
```

---

### Task 2: Excel 生成脚本与数据文件

**Files:**
- Create: `demo/form-autofill/scripts/generate-xlsx.mjs`
- Create（由脚本生成）: `demo/form-autofill/商品录入数据.xlsx`

- [ ] **Step 1: 编写生成脚本**

```js
// demo/form-autofill/scripts/generate-xlsx.mjs
// 生成商品录入演示数据 Excel（可重复运行，覆盖输出）
// 用法：node demo/form-autofill/scripts/generate-xlsx.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as XLSX from 'xlsx'; // 复用根目录 node_modules 依赖（package.json dependencies）

const __dirname = dirname(fileURLToPath(import.meta.url));
const outFile = join(__dirname, '..', '商品录入数据.xlsx');

const rows = [
  {
    '商品名称': '无线蓝牙降噪耳机', 'SKU编码': 'SKU-EAR-001', '商品分类': '电子产品',
    '售价': 399, '原价': 599, '库存数量': 120, '上架状态': '立即上架',
    '商品标签': '热卖、新品', '保修期': '1年',
    '商品描述': '主动降噪，40小时续航，蓝牙5.3，支持双设备连接。',
    '备注': '首发批次，优先发货', '同意条款': '是',
  },
  {
    '商品名称': '纯棉圆领印花T恤', 'SKU编码': 'SKU-CLT-088', '商品分类': '服装鞋帽',
    '售价': 79, '原价': 99, '库存数量': 350, '上架状态': '预售',
    '商品标签': '包邮、限时折扣', '保修期': '无保修',
    '商品描述': '220g 重磅纯棉，宽松版型，多色可选，预售 7 天内发货。',
    '备注': '预售商品，页面标注发货时间', '同意条款': '是',
  },
  {
    '商品名称': '有机混合坚果礼盒', 'SKU编码': 'SKU-FOD-203', '商品分类': '食品饮料',
    '售价': 128, '原价': '', '库存数量': 60, '上架状态': '暂不上架',
    '商品标签': '', '保修期': '6 个月',
    '商品描述': '六种有机坚果独立小包装，750g 礼盒装，当季新货。',
    '备注': '等待质检报告后上架', '同意条款': '是',
  },
];

const sheet = XLSX.utils.json_to_sheet(rows);
sheet['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 12 }, { wch: 8 }, { wch: 8 },
  { wch: 10 }, { wch: 12 }, { wch: 16 }, { wch: 10 }, { wch: 46 }, { wch: 30 }, { wch: 10 }];
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, sheet, '商品数据');
XLSX.writeFile(wb, outFile);
console.log('已生成:', outFile);
```

- [ ] **Step 2: 运行脚本并校验产物**

Run（仓库根目录）: `node demo/form-autofill/scripts/generate-xlsx.mjs`
Expected: 输出 `已生成: .../demo/form-autofill/商品录入数据.xlsx`。

校验内容：

```bash
node -e "import('xlsx').then(X=>{const wb=X.readFile('demo/form-autofill/商品录入数据.xlsx');const s=wb.Sheets['商品数据'];const rows=X.utils.sheet_to_json(s);console.log(rows.length, Object.keys(rows[0]).length, rows[0]['商品名称'], rows[2]['原价'])})"
```

Expected: `3 12 无线蓝牙降噪耳机 undefined`（第 3 行原价为空串时 sheet_to_json 默认跳过该 key，属正常）。

- [ ] **Step 3: Commit**

```bash
git add demo/form-autofill/scripts/generate-xlsx.mjs "demo/form-autofill/商品录入数据.xlsx"
git commit -m "feat(demo): 商品录入演示 Excel 数据及生成脚本"
```

---

### Task 3: README 录制说明

**Files:**
- Create: `demo/form-autofill/README.md`

- [ ] **Step 1: 编写 README**

内容必须包含（用"全局契约"表数据，不得另造）：

1. **简介**：Demo 用途（插件自动填表视频录制），4 步向导 + 模态框 + 双语。
2. **启动**：`cd demo/form-autofill && python3 -m http.server 8899`，访问 `http://localhost:8899/product-form.html`。
3. **控件选择器速查表**：即"全局契约"表（字段 / selector / 类型 / value 约定），并注明 fieldType 对应关系（text/select/radio/checkbox 与插件 `fill_form` 的 `fieldType` 参数一致，textarea 用 text）。
4. **Excel → 表单映射表**：12 个中文列名 → selector；中文文案 → value 映射（分类/状态/标签/保修期四组，见"全局契约"文案对照）；标签列"、"分隔转多个 checkbox；同意条款"是"→ true。
5. **录制流程建议**：中文版流程（Agent 读 xlsx → 按行 fill_form 分步填写 → click 下一步 → 模态框填备注勾条款 → 确认提交 → 循环 3 行）；英文版流程（先点 `#lang-toggle` 切 EN，映射表 value 语言无关可直接复用，仅显示文案不同）。
6. **重新生成 Excel**：`node demo/form-autofill/scripts/generate-xlsx.mjs`。

- [ ] **Step 2: Commit**

```bash
git add demo/form-autofill/README.md
git commit -m "docs(demo): 商品录入 Demo 录制流程与字段映射说明"
```

---

### Task 4: Playwright 端到端冒烟测试（TDD 兜底验证）

**Files:**
- Create: `test/e2e/demo-product-form.e2e.spec.js`

- [ ] **Step 1: 编写测试**

```js
// test/e2e/demo-product-form.e2e.spec.js
// 商品录入 Demo 页面冒烟测试：file:// 直开，验证向导流转/模态框/双语/列表
import { describe, test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pageUrl = 'file://' + join(__dirname, '../../demo/form-autofill/product-form.html');

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
    await fillStep1(page);
    await page.click('#btn-next');
    await fillStep2(page);
    await page.click('#btn-next');
    await fillStep3(page);
    await page.click('#btn-next');
    await page.click('#open-confirm-modal');
    await page.check('#agree-terms');
    await page.click('#modal-confirm');
    await expect(page.locator('#recorded-tbody tr')).toHaveCount(1);
    await page.click('#clear-records');
    await expect(page.locator('#recorded-tbody tr')).toHaveCount(1); // 空态行
    await expect(page.locator('#recorded-tbody')).toContainText('暂无数据');
  });
});
```

注意：若实现中空态行/错误 class 命名与此测试不一致，以测试为准修正页面（测试即验收标准）。`localStorage` 在 file:// 下 Chromium 可用；若个别环境异常，页面已有 try/catch，持久化断言失败时改用 `page.goto` 前 `addInitScript` 注入。

- [ ] **Step 2: 运行测试**

Run: `npx playwright test test/e2e/demo-product-form.e2e.spec.js`
Expected: 4 passed。若失败，修复 `product-form.html` 后重跑直至全绿。

- [ ] **Step 3: 回归全量 e2e（确认未破坏既有测试）**

Run: `npm run test:e2e`
Expected: 全部通过（含既有 content-tools.e2e.spec.js）。

- [ ] **Step 4: Commit**

```bash
git add test/e2e/demo-product-form.e2e.spec.js demo/form-autofill/
git commit -m "test(demo): 商品录入 Demo 页面 Playwright 冒烟测试"
```

---

### Task 5: 收尾核验

- [ ] **Step 1: 核验 .gitignore 不会忽略 demo 产物**

Run: `git check-ignore -v demo/form-autofill/product-form.html "demo/form-autofill/商品录入数据.xlsx" || echo "not ignored"`
Expected: `not ignored`（若被忽略，调整 .gitignore 增加 `!demo/` 例外）。

- [ ] **Step 2: 确认工作区干净、提交历史完整**

Run: `git status --short && git log --oneline -5`
Expected: demo 相关文件均已提交（xlsx 为二进制产物，一并入库方便取用）。

说明：本次改动不涉及扩展源码（src/），无需执行 build:silent。
