# 商品录入表单 Demo（自动填表视频录制用）

一个**零依赖、中英双语**的多步表单演示页面，配合 `商品录入数据.xlsx`，用于录制「AI Helper 插件读取 Excel → 自动填写多页表单 → 模态框确认 → 批量循环」的演示视频。

- 4 步向导（基本信息 → 价格库存 → 商品详情 → 提交确认）
- 提交时弹出**模态框**（含汇总预览 + 备注 + 条款勾选）
- 右上角一键**中英文切换**（`localStorage` 记忆，刷新不丢）
- 页面下方「已录入商品」列表，每次提交追加一行，批量填写时数据可见累积

## 目录结构

```
demo/form-autofill/
├── product-form.html      # Demo 页面（单文件，CSS/JS 内联，离线可用）
├── 商品录入数据.xlsx       # 3 行示例数据，12 列对应表单字段
├── scripts/
│   └── generate-xlsx.mjs  # Excel 生成脚本（可重复运行覆盖）
└── README.md              # 本文件
```

## 启动

```bash
cd demo/form-autofill
python3 -m http.server 8899
```

浏览器打开 <http://localhost:8899/product-form.html>。

> content script 匹配 `<all_urls>`，HTTP 服务下无需额外权限；也可直接双击 HTML 用 `file://` 打开（需在 `chrome://extensions` 给插件开启「允许访问文件网址」）。

## 控件选择器速查表

所有控件均带语义化 `id`，`select` / `radio` / `checkbox` 的 **value 语言无关**（切换中英文只改显示文案，不改 value），因此插件用同一套 selector + value 在两种语言下都能稳定填充。

| 字段 | 选择器（selector） | 控件类型 | `fill_form` 的 fieldType | value 约定 |
|---|---|---|---|---|
| 商品名称 | `#product-name` | text | `text` | 自由文本 |
| SKU 编码 | `#product-sku` | text | `text` | 自由文本 |
| 商品分类 | `#product-category` | select | `select` | `electronics`/`clothing`/`food`/`home`/`books`（也可直接传中文文案） |
| 售价 | `#product-price` | number | `text` | 数字字符串，须 >0 |
| 原价 | `#product-original-price` | number | `text` | 数字字符串，选填 |
| 库存数量 | `#product-stock` | number | `text` | ≥0 整数字符串 |
| 上架状态 | `input[name="listing-status"]` | radio | `radio` | `instant`/`pending`/`presale` |
| 标签-热卖 | `#tag-hot` | checkbox | `checkbox` | `true` 勾选 |
| 标签-新品 | `#tag-new` | checkbox | `checkbox` | `true` 勾选 |
| 标签-包邮 | `#tag-free-shipping` | checkbox | `checkbox` | `true` 勾选 |
| 标签-限时折扣 | `#tag-discount` | checkbox | `checkbox` | `true` 勾选 |
| 保修期 | `#product-warranty` | select | `select` | `none`/`6m`/`1y`/`2y`（也可直接传中文文案） |
| 商品描述 | `#product-description` | textarea | `text` | 自由文本 |
| 备注（模态框内） | `#order-remark` | text | `text` | 自由文本 |
| 同意条款（模态框内） | `#agree-terms` | checkbox | `checkbox` | `true` 勾选（必勾，否则确认钮禁用） |

导航与操作按钮（用 `click_element` 或按文本点击）：

| 动作 | 选择器 | 说明 |
|---|---|---|
| 上一步 | `#btn-prev` | Step1 隐藏 |
| 下一步 | `#btn-next` | Step4 隐藏；点击前校验当前步 |
| 打开确认模态框 | `#open-confirm-modal` | 仅 Step4 显示 |
| 模态框-确认提交 | `#modal-confirm` | 勾选条款后可用 |
| 模态框-返回修改 | `#modal-cancel` | |
| 语言切换 | `#lang-toggle` | 中↔英 |
| 清空已录入列表 | `#clear-records` | 重录视频前清场 |

> **radio 填充说明**：`fill_form` 对 radio 会拼接成 `input[name="listing-status"][value="instant"]` 再定位，因此 selector 传 `input[name="listing-status"]`、value 传 `instant` 即可。
> **checkbox 填充说明**：每个标签是独立 checkbox，需对要勾选的项分别传 `{selector:'#tag-hot', value:'true', fieldType:'checkbox'}`；不勾选的标签不传即可（提交后表单会自动重置）。

## Excel 数据 → 表单映射

`商品录入数据.xlsx`（Sheet：`商品数据`）共 12 列、3 行。列名即字段中文名，插件读取后按下表映射填充：

| Excel 列 | 目标 selector | 转换规则 |
|---|---|---|
| 商品名称 | `#product-name` | 直接填 |
| SKU编码 | `#product-sku` | 直接填 |
| 商品分类 | `#product-category` | 中文文案 → value（见下表）；`select` 也支持直接传中文文案 |
| 售价 | `#product-price` | 数字转字符串 |
| 原价 | `#product-original-price` | 空则跳过 |
| 库存数量 | `#product-stock` | 整数转字符串 |
| 上架状态 | `input[name="listing-status"]` | 中文文案 → value（radio） |
| 商品标签 | `#tag-*` | 按「、」拆分为多个 checkbox，逐个映射 value |
| 保修期 | `#product-warranty` | 中文文案 → value；空则跳过 |
| 商品描述 | `#product-description` | 直接填 |
| 备注 | `#order-remark` | 模态框内，直接填 |
| 同意条款 | `#agree-terms` | 「是」→ checkbox `true` |

### 中文文案 ↔ value ↔ 英文文案 对照

| 字段 | 中文 | value | English |
|---|---|---|---|
| 分类 | 电子产品 | `electronics` | Electronics |
| 分类 | 服装鞋帽 | `clothing` | Clothing |
| 分类 | 食品饮料 | `food` | Food & Beverage |
| 分类 | 家居用品 | `home` | Home & Living |
| 分类 | 图书文具 | `books` | Books & Stationery |
| 状态 | 立即上架 | `instant` | Instant Listing |
| 状态 | 暂不上架 | `pending` | Unlisted |
| 状态 | 预售 | `presale` | Pre-sale |
| 标签 | 热卖 | `hot` | Hot |
| 标签 | 新品 | `new` | New |
| 标签 | 包邮 | `free-shipping` | Free Shipping |
| 标签 | 限时折扣 | `discount` | Limited Discount |
| 保修期 | 无保修 | `none` | None |
| 保修期 | 6 个月 | `6m` | 6 Months |
| 保修期 | 1 年 | `1y` | 1 Year |
| 保修期 | 2 年 | `2y` | 2 Years |

## 录制流程建议

**中文版视频：**

1. `python3 -m http.server 8899` 启动，打开页面，确认右上角显示 `EN`（当前为中文界面）。
2. 让插件（本地 Agent）读取 `商品录入数据.xlsx`。
3. 对第 1 行数据：`fill_form` 填 Step1（名称/SKU/分类）→ 点 `#btn-next` → 填 Step2（售价/原价/库存/状态 radio）→ `#btn-next` → 填 Step3（标签 checkbox / 保修期 / 描述）→ `#btn-next`。
4. Step4 点 `#open-confirm-modal` 弹模态框 → `fill_form` 填 `#order-remark` + 勾 `#agree-terms` → 点 `#modal-confirm`。
5. toast 提示 + 列表追加一行 + 表单自动重置回 Step1。重复 3–4 填第 2、3 行，画面可见数据逐条累积。

**英文版视频：**

1. 打开页面后先点 `#lang-toggle` 切到英文（按钮变为显示 `中文`）。
2. Excel 数据仍是中文，但**所有 value 语言无关**：插件按上表把中文文案换算成 value（如「电子产品」→ `electronics`）后填充即可；`select` 也可直接传 value。
3. 其余流程与中文版一致。

## 重新生成 Excel

```bash
node demo/form-autofill/scripts/generate-xlsx.mjs
```

脚本复用根目录 `xlsx` 依赖，可重复运行覆盖 `商品录入数据.xlsx`。修改示例数据直接编辑脚本内的 `rows` 数组。

## 自动化冒烟测试

页面行为由 Playwright 覆盖（`test/e2e/demo-product-form.e2e.spec.js`）：完整提交链路、必填校验、双语切换保持选中值、清空列表。

```bash
npx playwright test test/e2e/demo-product-form.e2e.spec.js
```
