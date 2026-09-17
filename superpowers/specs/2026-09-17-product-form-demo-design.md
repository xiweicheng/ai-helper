# 商品录入表单 Demo（自动填表视频录制用）设计文档

日期：2026-09-17
状态：已确认（方案 A + 中英文双语）

## 背景与目标

为录制"AI Helper 插件自动填写表单"演示视频提供一个可控的 Demo 页面与配套 Excel 数据文件。演示流程：插件（本地 Agent）读取 Excel 中的商品数据 → 自动填写页面多步表单 → 自动翻页 → 模态框确认提交 → 已录入列表累积展示，支持多行数据批量循环。

需录制中文版、英文版两个视频，页面支持中英文一键切换。

## 方案选型

- **方案 A（采纳）**：零依赖单 HTML 文件（CSS/JS 内联）+ 一次性 Node 脚本生成 .xlsx（复用 `agent/node_modules` 的 `xlsx` 包）。
- 方案 B（否决）：CDN 引入前端框架。录制现场依赖网络，稳定性差，对演示目标过度设计。

## 交付物与目录结构

```
demo/form-autofill/
├── product-form.html      # Demo 页面（单文件，零外部依赖，离线可用）
├── 商品录入数据.xlsx       # 3 行示例数据，12 列对应表单字段
├── scripts/
│   └── generate-xlsx.mjs  # 一次性生成脚本（node 运行，import agent/node_modules/xlsx）
└── README.md              # 录制流程说明（启动服务、字段映射、操作步骤）
```

托管方式：`python3 -m http.server 8899`（在 demo/form-autofill 目录下运行），访问 `http://localhost:8899/product-form.html`。content script 匹配 `<all_urls>`，HTTP 服务下无需额外权限。

## 页面设计：4 步向导 + 模态框

### 步骤条

顶部可视化步骤条（1 基本信息 → 2 价格库存 → 3 商品详情 → 4 提交确认），高亮当前步，已完成步打勾。"上一步 / 下一步"按钮切换；每步离开时做必填校验，未通过则字段红框 + 错误提示（录制时可展示插件填错的效果）。

### Step 1 基本信息

| 字段 | 控件 | id | 校验 |
|---|---|---|---|
| 商品名称 | text | `#product-name` | 必填 |
| SKU 编码 | text | `#product-sku` | 必填 |
| 商品分类 | select | `#product-category` | 必填（非空值） |

分类选项 value（语言无关）：`electronics` / `clothing` / `food` / `home` / `books`
显示文案：电子产品/服装鞋帽/食品饮料/家居用品/图书文具 ↔ Electronics/Clothing/Food & Beverage/Home & Living/Books & Stationery

### Step 2 价格库存

| 字段 | 控件 | id | 校验 |
|---|---|---|---|
| 售价（元） | number | `#product-price` | 必填，>0 |
| 原价（元） | number | `#product-original-price` | 选填 |
| 库存数量 | number | `#product-stock` | 必填，≥0 整数 |
| 上架状态 | radio | `name="listing-status"` | 必选 |

上架状态 value：`instant`（立即上架/Instant Listing）、`pending`（暂不上架/Unlisted）、`presale`（预售/Pre-sale）

### Step 3 商品详情

| 字段 | 控件 | id | 校验 |
|---|---|---|---|
| 商品标签 | checkbox 多选 | `#tag-hot` `#tag-new` `#tag-free-shipping` `#tag-discount` | 选填 |
| 保修期 | select | `#product-warranty` | 选填 |
| 商品描述 | textarea | `#product-description` | 选填 |

标签 value：`hot`（热卖/Hot）、`new`（新品/New）、`free-shipping`（包邮/Free Shipping）、`discount`（限时折扣/Limited Discount）
保修期 value：`none` / `6m` / `1y` / `2y`（无保修/6 个月/1 年/2 年 ↔ None/6 Months/1 Year/2 Years）

### Step 4 提交 + 模态框

点击"提交"按钮（`#open-confirm-modal`）弹出模态框（`#confirm-modal`）：

- 汇总预览区（`#modal-summary`）：只读展示前三步已填内容（随语言切换显示对应文案）
- 补充字段：备注 text `#order-remark`、同意条款 checkbox `#agree-terms`（必勾，未勾时确认按钮禁用/提示）
- 按钮：确认提交 `#modal-confirm`、返回修改 `#modal-cancel`

确认提交后：模态框关闭 → 成功 toast → 已录入列表追加一行 → 表单重置并回到 Step 1（便于填下一行 Excel 数据）。

### 已录入商品列表

页面下方表格 `#recorded-table`，列：商品名称 / SKU / 分类 / 售价 / 库存 / 上架状态 / 录入时间。分类与状态列按当前语言显示文案。表头行 id `#recorded-thead`，数据容器 `#recorded-tbody`，空态提示一行。同时提供"清空列表"按钮 `#clear-records`（重录视频方便）。

## 中英文双语设计

- 右上角语言切换按钮 `#lang-toggle`（显示 "EN" / "中文"），点击即切。
- 文案来源：JS 内置 `zh` / `en` 两套字典；静态元素用 `data-i18n` 属性绑定，动态文案（校验提示、toast、模态框汇总、列表表头、空态）渲染时实时取当前语言。
- 语言选择持久化到 `localStorage`（key: `demo-lang`），刷新不丢。
- **关键约束：所有 select option、radio、checkbox 的 `value` 语言无关，仅显示文案切换**——保证插件用 selector + value 填充在两种语言下行为一致。
- `<html lang>` 属性随语言切换更新。

## Excel 数据设计（商品录入数据.xlsx）

单 Sheet（Sheet 名：`商品数据`），表头为中文列名，3 行示例数据：

| 列名 | 对应控件 | 填写值格式 |
|---|---|---|
| 商品名称 | `#product-name` | 文本 |
| SKU编码 | `#product-sku` | 文本 |
| 商品分类 | `#product-category` | 中文文案（如"电子产品"），英文界面下按 value 映射 |
| 售价 | `#product-price` | 数字 |
| 原价 | `#product-original-price` | 数字 |
| 库存数量 | `#product-stock` | 整数 |
| 上架状态 | radio | 中文文案（立即上架/暂不上架/预售） |
| 商品标签 | checkbox | 顿号分隔多值（如"热卖、包邮"） |
| 保修期 | `#product-warranty` | 中文文案 |
| 商品描述 | `#product-description` | 文本 |
| 备注 | `#order-remark` | 文本 |
| 同意条款 | `#agree-terms` | "是" → true |

示例数据 3 行（覆盖不同分类/状态/标签组合）：

1. 无线蓝牙降噪耳机 / SKU-EAR-001 / 电子产品 / 399 / 599 / 120 / 立即上架 / 热卖、新品 / 1年 / 描述… / 备注… / 是
2. 纯棉圆领印花T恤 / SKU-CLT-088 / 服装鞋帽 / 79 / 99 / 350 / 预售 / 包邮、限时折扣 / 无保修 / 描述… / 备注… / 是
3. 有机混合坚果礼盒 / SKU-FOD-203 / 食品饮料 / 128 / （空） / 60 / 暂不上架 / （空） / 6 个月 / 描述… / 备注… / 是

生成脚本 `scripts/generate-xlsx.mjs`：ESM，`import XLSX from '../../agent/node_modules/xlsx/xlsx.mjs'`（或 require 兜底），`XLSX.utils.json_to_sheet` + 设置列宽 + `writeFile` 输出到 demo 目录。脚本可重复运行覆盖生成。

README 中附"中文列名/文案 → 英文界面 value"映射表，供录制英文版视频时插件（LLM）自行换算。

## 视觉风格

- 现代简洁浅色风：白卡片 + 浅灰背景、圆角、柔和阴影、主色调蓝紫渐变（与插件品牌观感一致）。
- 页面宽度约 720px 居中，适合 1280×800 录屏构图；已录入列表同宽。
- 控件尺寸偏大（input 高 40px+），标签清晰，方便视频中看清填写过程。
- 模态框：遮罩 + 居中卡片 + 淡入缩放动画。

## 错误处理

- 每步必填校验不过：字段红框 + 下方红色提示文案（双语），阻止进入下一步。
- 模态框未勾选条款：确认按钮置灰或点击提示。
- number 字段非法输入（负数价格等）：同样红框提示。
- localStorage 不可用（隐私模式）：语言切换仍生效，仅不持久化（try/catch 包裹）。

## 验证方式

- 手动：`python3 -m http.server 8899` 打开页面，走通中/英文两套完整流程（填写→翻页→模态框→提交→列表追加→重置）。
- 插件联调：通过 Agent 读取 xlsx → fill_form / click / select_dropdown 完成一行数据端到端录入。
- 生成脚本：运行后校验 xlsx 可打开、3 行 12 列数据正确。

## 范围外（YAGNI）

- 不做后端存储、不上传文件字段、不做真实登录态。
- 不引入构建流程，页面不参与 vite build。
- 已录入列表仅存内存（刷新即清空），满足录制需求。
