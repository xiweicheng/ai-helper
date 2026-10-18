# AI Helper 主题切换（白天/黑夜）实施设计

- 日期：2026-10-18
- 状态：已评审（四项决策点已于 2026-10-18 确认，见 §11）
- 关联分支：`theme`（2026-08-08 旧尝试，仅作机制参考，不合并）
- 数据基线：当前分支 `youhua01` @ 9d4b894

## 1. 背景与前次失败根因

可行性分析结论：项目具备加暗色主题的全部条件，但上一次 `theme` 分支尝试效果不佳，根因已定位为四条，本设计逐条对策：

| # | 前次失败根因 | 本设计对策 | 对应章节 |
|---|---|---|---|
| 1 | CSS 转换不彻底：侧边栏残留 327 处、options 残留 125 处硬编码 hex，暗色下新旧混杂 | 脚本化全量映射 + "硬编码零残留"作为批次退出门禁（grep dist 产物断言） | §6、§8.2 |
| 2 | 只做反色映射，未做语义设计：`rgba(0,0,0,α)` 阴影/边框在深底上不可见 | 语义 token + 通道变量 + α 分带翻转规则，暗色值按 WCAG AA 精算 | §4、§5 |
| 3 | 只改了两个 CSS 文件，漏掉 JS 内联色(399 处)、HTML 内联 style(140 处)、划词 content(107 处)、github-markdown-light 库、mermaid 主题 | 六大色源全部纳入批次计划（B2/B4/B5） | §7 |
| 4 | 分支落后主线 484 个提交，无法合并维护 | 在当前分支从零重做，只复用旧分支 161 行 theme.js 的机制设计 | §3 |

实测基线数据（本设计写作时从代码重新提取，非引用旧报告）：

- 侧边栏 `src/side_panel/styles.css`：14751 行，**224 个去重 hex（1504 处）+ 187 个去重 rgba（481 处）**，0 个 CSS 变量。
- 配置页 `src/options/styles.css`：3882 行，577 处 hex（113 个去重）+ 23 个去重 rgba。
- 侧边栏 JS 内联颜色 232 处，大头：`token-stats-panel.js`(66)、`schedule-panel.js`(54)、`workspace-panel.js`(45)、`index.js`(20)、`chat-copy.js`(9)、`markdown-render.js`(6)。
- options JS 内联 60 处：`toolbox-rag.js`(17)、`knowledge-panel.js`(16)、`toolbox-skills.js`(10)、`toolbox-shared.js`(8)。
- 划词 content：`selection-toolbar-styles.js`(82)+`selection-toolbar.js`(14)，含 27 个去重 hex。
- HTML 内联 style 含颜色：`side_panel.html` 115 处、`options.html` 25 处。
- 第三方：`libs/github-markdown-light.min.css`（v5.9.0 light-only，**纯色值硬编码、无 CSS 变量、无 data-color-mode**）；`libs-loader.js` 中 mermaid 写死 `theme: 'default'`。

## 2. 目标与非目标

**目标**
1. 亮色 / 暗色两套主题，支持"跟随系统"；全局生效：侧边栏、配置页、划词浮层。
2. 主题切换即时生效、跨页面同步、持久化，刷新/重启后保持。
3. 暗色文本对比度达到 WCAG AA（正文 ≥4.5:1，大字/图形 ≥3:1）。
4. 建立语义 token 体系，后续新组件只引用 token，不再新增裸色值。

**非目标（YAGNI）**
- 不做第三方自定义主题/换色板；不做单组件级主题微调。
- 不改 PDF/图片导出的"纸张"底色逻辑（导出物保持白底黑字，见 §7.3）。
- 不动 agent 进程与 docs 静态站（docs 站已有自己的主题提交，与扩展无关）。

## 3. 总体架构

### 3.1 机制

`document.documentElement[data-theme]` + CSS 变量 token 切换（沿用旧分支 theme.js 已验证的机制，扩展 'system' 态）：

```
┌─ src/shared/theme.css      token 定义：:root{亮色} / [data-theme="dark"]{暗色}
├─ src/shared/theme.js       ~180 行：
│    initTheme()             读 storage → applyTheme()；system 态挂 matchMedia 监听
│    getTheme()/getResolved() 偏好值 / 实际生效值
│    setTheme('light'|'dark'|'system')  应用 + 持久化 storage key: appTheme
│    subscribe(cb)           本页面内订阅（驱动 mermaid 重渲染等命令式逻辑）
│    绑定 chrome.storage.onChanged → 跨环境同步（side_panel/options/content 三端）
└─ 页面接入：side_panel.html、options.html <head> 早期引入
     <link theme.css>（先于 styles.css）+ <script src="theme-boot.js">（外链，扩展页 CSP 禁内联）
```

要点：
- **防闪烁（FOUC）**：`theme-boot.js` 为非 module 的同步外链脚本，在 `<head>` 中先于任何渲染型样式执行，从 `chrome.storage.local` 异步读取前先按上次缓存值（`localStorage` 镜像）设置 `data-theme`，storage 读取完成后校正。侧边栏/配置页均为扩展页面，可用 localStorage 做同步缓存层。
- **content script（划词）**：注入 UI 挂在影子/独立容器上，`src/content/index.js` 启动时 `initTheme()` 并在 `subscribe` 中重写注入样式表的 `:host` 变量块。
- **storage key**：`appTheme`，值 `'light' | 'dark' | 'system'`，默认 `'light'`（保持现有用户零感知）。命名与现有配置键（camelCase、单一来源）一致，纳入导入导出。
- 旧分支用的 key 是 `theme`，与 `libs-loader.js` 里 mermaid 的 `theme` 配置字段无关，为避免混淆改用 `appTheme`。

### 3.2 切换入口
1. **配置页**：新增"外观"卡片（置于全局设置区顶部），三选一分段控件：跟随系统 / 亮色 / 暗色（复用统一滑轨/分段控件语言，品牌紫）。
2. **侧边栏**：header「更多」菜单（`headerMoreDropdown`）内加"切换主题"项，循环 light→dark→system 或弹出二选一；点击即持久化（符合"开关切换即持久化"惯例）。
3. i18n：`settings.appearance`、`settings.themeSystem/Light/Dark`、`menu.toggleTheme` 等 key，zh/en 同步补齐（渲染时动态查询 i18n，不缓存）。

## 4. 语义 Token 体系

### 4.1 设计原则
1. **两层结构**：语义 token（约 60 个，含 rgb 通道变量）为唯一使用面；不再暴露 primitive 原始色板，避免二次膨胀。
2. **亮色值 = 现状主值**：每个 token 的亮色值取其覆盖色源中出现频次最高的原值；同族次要值向主值收拢（灰阶收拢到 ±2 步内）。接受亮色模式下极小的归一化色差，以换取两套主题的可维护性（验收标准是"逐屏目视无退化"，不要求像素级 diff）。
3. **暗色值按 AA 精算**（下表"对比度"列均为脚本实算值，非估算）：暗色表面体系取蓝灰黑三阶 `#16181d / #1e2128 / #262a33`；文本、品牌、状态色在深底上整体提亮 2-3 个色阶。
4. **on-color 家族永不翻转**：彩色渐变/深色徽标上的白字、渐变端点色（如 `#764ba2`、`#f093fb`）两主题保持字面量。

### 4.2 Token 总表

亮=L（`:root`），暗=D（`[data-theme="dark"]`）。对比度为暗色值对 `--bg-surface #1e2128` 的实算比值。

**表面 Surfaces（9）**

| token | 亮 L | 暗 D | 用途 |
|---|---|---|---|
| --bg-page | #ffffff | #16181d | 最底层画布（聊天区） |
| --bg-surface | #ffffff | #1e2128 | 卡片/输入框/消息基底 |
| --bg-elevated | #ffffff | #262a33 | 浮层/弹窗/下拉（z≥10000 层） |
| --bg-subtle | #f5f7fa | #22262e | 次级底：分组条、斑马行 |
| --bg-sunken | #f0f2f5 | #12151a | 凹陷：代码块、工具槽 |
| --bg-disabled | #f0f0f0 | #2a2f38 | 禁用底 |
| --bg-hover | rgba(0,0,0,0.05) | rgba(255,255,255,0.07) | 行悬停 |
| --bg-active | rgba(102,126,234,0.12) | rgba(141,162,242,0.16) | 选中态背景 |
| --surface-rgb | 255,255,255 | 30,33,40 | 半透明表面通道 |

**文本 Text（7）**

| token | 亮 L | 暗 D | 暗色对比度 | AA |
|---|---|---|---|---|
| --text-primary | #333333 | #e8eaef | 13.39:1 | ✓ |
| --text-secondary | #666666 | #b8bec9 | 8.63:1 | ✓ |
| --text-tertiary | #999999 | #8b93a1 | 5.21:1（浮层上 4.64:1） | ✓ |
| --text-disabled | #bbbbbb | #6b7280 | 3.33:1（装饰/占位，AA 免检） | – |
| --text-inverse | #ffffff | #16181d | – | – |
| --text-link | #4a90d9 | #7fb3e8 | 7.30:1 | ✓ |
| --text-on-brand | #ffffff | #ffffff | 暗色 fill 上 4.48:1→fill 微调至 ≥4.5（候选 #566ad3，B0 用对比脚本定值） | ✓(目标) |

**品牌 Brand（13）**

| token | 亮 L | 暗 D | 用途 |
|---|---|---|---|
| --brand-500 | #667eea | #8da2f2 | 强调图标/文字/边框主品牌色 |
| --brand-600 | #5a6fd6 | #7d92ec | hover |
| --brand-700 | #4c5bd4 | #6d84ee | active |
| --brand-fill | #667eea | #566ad3 | 实底按钮/开关轨道（保白字 AA） |
| --brand-accent | #764ba2 | #6f4b99 | 渐变端紫 |
| --brand-violet-500 | #8b5cf6 | #a78bfa |  violet 强调（技能/反思类徽标） |
| --brand-violet-600 | #6d28d9 | #b7a4f5 | violet 深 |
| --brand-soft-bg | #f0f4ff | #232a3d | 品牌浅底（选中菜单、用户气泡） |
| --brand-soft-border | #c9d4f5 | #3d4c6e | 品牌浅底描边 |
| --brand-violet-soft-bg | #f3f1ff | #2b2440 | violet 浅底 |
| --brand-rgb | 102,126,234 | 141,162,242 | rgba 通道（100 处 rgba(102,126,234,α) 用） |
| --brand-violet-rgb | 139,92,246 | 167,139,250 | rgba 通道（27 处） |
| --brand-gradient | 135deg,#667eea→#764ba2 | 135deg,#566ad3→#6f4b99 | header/主按钮渐变 |

**边框与分隔（4）**

| token | 亮 L | 暗 D |
|---|---|---|
| --border-subtle | #eeeeee | #2e343d |
| --border-default | #e0e0e0 | #3a404c |
| --border-strong | #cccccc | #4a5160 |
| --divider | #f0f0f0 | #262b33 |

**状态四族（17）**：每族 fill / strong / soft-bg / soft-border（+warning 的 on-soft 文本）

| token | 亮 L | 暗 D | 暗色对比度 |
|---|---|---|---|
| --danger-500 | #e53e3e | #fc8181 | 6.60:1 ✓ |
| --danger-strong | #c53030 | #f87171 | – |
| --danger-soft-text | #fc8181 | #fca5a5 | – |
| --danger-soft-bg | #fef2f2 | #3a2628 | 内文本 #f0a3a3 达 7.04:1 ✓ |
| --danger-soft-border | #fecaca | #57353a | – |
| --success-500 | #22c55e | #6fdba0 | 9.45:1 ✓ |
| --success-strong | #2f855a | #9ae6b4 | – |
| --success-soft-bg | #e0f5e8 | #1f3a2a | – |
| --success-soft-border | #c6f0d4 | #375c42 | – |
| --warning-500 | #f59e0b | #fbbf24 | 9.65:1 ✓ |
| --warning-strong | #b45309 | #d9a441 | – |
| --warning-text-soft | #856404 | #fcd34d | – |
| --warning-soft-bg | #fef3c7 | #3d3220 | – |
| --warning-soft-border | #fde68a | #5f4d24 | – |
| --info-500 | #4a90d9 | #7fb3e8 | 7.30:1 ✓ |
| --info-soft-bg | #e8f0fe | #1f2b3d | – |
| --info-soft-border | #d6e4ff | #35486b | – |

**状态通道变量（4）**：--danger-rgb(229,62,62→252,129,129)、--success-rgb(34,197,94→111,219,160)、--warning-rgb(245,158,11→251,191,36)、--info-rgb(74,144,217→127,179,232)

**Overlay/阴影/杂项（8）**

| token | 亮 L | 暗 D | 说明 |
|---|---|---|---|
| --scrim | rgba(0,0,0,0.5) | rgba(0,0,0,0.7) | 弹窗遮罩 |
| --overlay-rgb | 0,0,0 | 255,255,255 | 中性蒙层通道（hover 蒙层、内描边） |
| --shadow-sm | 0 1px 3px rgba(0,0,0,0.08) | 0 1px 3px rgba(0,0,0,0.4) | 暗色阴影加深并配 hairline 边框补偿 |
| --shadow-md | …rgba(0,0,0,0.15) | …rgba(0,0,0,0.5) | 卡片/下拉 |
| --shadow-lg | …rgba(0,0,0,0.25) | …rgba(0,0,0,0.6) | 全屏面板/模态 |
| --tooltip-bg | rgba(30,30,30,0.92) | #3c424e | 暗色下改深灰实心+边框 #4a5160，文字恒白 |
| --scrollbar-thumb | #c1c1c1 | #3a404c | |
| --selection-bg | rgba(102,126,234,0.25) | rgba(141,162,242,0.35) | ::selection |

**固定不翻转（2）**：--mark-bg #fff3a0（划词高亮，注入页面用，独立于扩展主题）、--paper #ffffff（PDF/导出纸张）。

合计命名 token 62 个（含 8 个 `-rgb` 通道变量；accent/bg-page 通道以伴生形式在 B0 落地时按需补入，不单独计数）。超出 60 上限的候选削减项：--brand-violet-soft-bg 并入 --brand-soft-bg、--danger-soft-text 并入 --text-secondary 场景、--warning-text-soft 并入 --warning-strong —— 在 B0 落地时二选一执行，默认保留全量。

## 5. rgba 处理规则（α 分带）

rgba 值不逐一 token 化，按"通道变量 + α 保留/分带"三条规则机械转换（覆盖全部 187 个去重 rgba / 481 处）：

**R1 彩色通道族（275 处）**：`rgba(X,α)` → `rgba(var(--家族-rgb), α)`，α 原样保留。族归属：brand 100、info 55、warning 42、danger 33、violet 27、success 17、accent（rgba(118,75,162,·)×1，用 --brand-accent 通道形式）、on-color 粉色渐变 rgba(240,147,251,0.1)×1（保持字面量）。

**R2 黑色族 rgba(0,0,0,α)（123 处）**：
| α 区间 | 属性上下文 | 映射 |
|---|---|---|
| ≤0.13 | border/inset 描边/浅蒙层 | `rgba(var(--overlay-rgb), f(α))`，f：0.05→0.08 / 0.06→0.10 / 0.08→0.12 / 0.10→0.14 / 0.12→0.16（暗面白色蒙层需更高 α 才等效） |
| 0.14–0.35 | box-shadow（非 inset） | `var(--shadow-sm/md/lg)`（<0.18→sm，<0.3→md，其余 lg） |
| ≥0.36 | 遮罩/深蒙层 | `var(--scrim)`；0.65+ 用 `--scrim-deep`（若存在场景，否则并入 scrim） |

**R3 白色族 rgba(255,255,255,α)（72 处）**：
| α 区间 | 上下文 | 映射 |
|---|---|---|
| ≤0.45 | 彩色底上的高光/内描边/半透明白字 | **保持字面量**（on-color，两主题等效） |
| >0.45 | background（毛玻璃面板、白卡浮于浅底） | `rgba(var(--surface-rgb), α)`（暗面自动变深灰半透） |
| >0.45 | color（深底彩字上的文本） | `var(--text-on-brand)` |

灰色中性族 rgba(120/128/150/200/113,128,150 系)（8 处）并入 R2 的 overlay 通道；rgba(245,247,250,0.95)→`rgba(var(--bg-page-rgb),0.95)`（--bg-page-rgb 作为 --bg-page 的通道伴生变量定义）；rgba(30,30,30,0.92)→直接使用 `--tooltip-bg` token。以上分带/归族合计覆盖 481 处 rgba 全量。

## 6. 批量映射表（侧边栏 styles.css：224 hex + 187 rgba → token）

映射以脚本执行（`scripts/theme-migrate.py`，B0 交付，§7.1），规则：属性上下文优先（`color:`/`background`/`border`/`box-shadow`），同族色向主值收拢。下表为**完整**的 hex→token 归属（值后×次数；已含收尾 7 个补充归属：#c0c8d4/#cbd5e0/#e2e8f0→border-default、#e8ecf4/#e8eaf0/#e8ecf1→border-subtle、#f87171→danger-soft-text、rgba(113,128,150,·)→overlay 通道）。

### 6.1 中性系（灰阶 → 文本/边框/表面）

| token | 源值（×出现次数） |
|---|---|
| text-primary | #333333×101 #1a1a1a×3 #2d3748×1 #1f2937×6 #1e293b×2 #374151×5 #444444×2 #4b5563×2 #525659×2 #4a5165×1 |
| text-secondary | #666666×64 #555555×31 #6b7280×7 #6a737d×1 #5f6674×2 #718096×3 #8a8f99×1 |
| text-tertiary | #999999×119 #888888×40 #777777×3 #8f8f8f×1 #a0aec0×5 #9ca3af×11 #a8aeb8×3 #b0b4bb×1 #8899cc×4 #a8a8a8×1 #b0b0b0×3 |
| text-disabled | #bbbbbb×29 #aaaaaa×14 #c0c0c0×1 #c0c4cc×1 |
| border-default | #e0e0e0×46 #dddddd×27 #d0d0d0×11 #e8eaed×5 #e5e7eb×5 #d9d9d9×4 #d1d5db×4 #dcdfe6×3 #d0d5dd×2 #dfe2e5×2 #eaecef×1 #d4d9e2×1 #dde0e5×1 #e2e4ea×1 #c0c8d4×6 #cbd5e0×2 #e2e8f0×2 |
| border-strong | #cccccc×18 #c1c1c1×1 |
| border-subtle | #f0f0f0×67 #eeeeee×14 #e8e8e8×10 #eef1f6×6 #eef0f4×4 #f0f1f3×3 #ececec×2 #eaeef4×1 #f2f3f5×1 #edf2f7×1 #f3f4f6×3 #e8ecf4×1 #e8eaf0×1 #e8ecf1×1 |
| bg-subtle | #f5f7fa×35 #fafafa×12 #f5f5f5×10 #f8f9fa×7 #fafbfc×3 #f9fbfd×2 #f8f8f8×2 #f7f8fa×1 #f3f4f7×1 #f5f6f8×1 #f0f0f5×1 #f8f8ff×1 |
| bg-sunken | #f0f2f5×8 #f6f8fa×7 #f9f9f9×2 |

属性分派例外：`border-*` 上下文中的 #f0f0f0/#e0e0e0 → border-subtle/border-default；`background` 上下文中的 #bbbbbb/#cccccc → bg-disabled。

### 6.2 品牌与 violet

| token | 源值 |
|---|---|
| brand-500 | #667eea×180 |
| brand-600 | #5a6fd6×2 #5568d3×1 #4f5dbd×2 #4c5bd4×1 #5b4dbf×1 |
| brand-accent(渐变端/on-color) | #764ba2×14 rgba(118,75,162,α)×1 |
| brand-soft-bg | #f0f4ff×16 #f0f5ff×12 #eef2ff×2 #eef0ff×1 #e2e8fb×1 #e0e8ff×1 |
| brand-soft-border | #c9d4f5×1 #a0c4ff×3 #d0e0ff×1 |
| brand-violet-500 | #8b5cf6×12 #6366f1×10 #a78bfa×6 #4f46e5×2 #9333ea×1 |
| brand-violet-600 | #7c3aed×8 #805ad5×3 #6d28d9×1 #6b46c1×1 #6b4f9a×1 #6a4190×1 #8e44ad×1 #9b59b6×2 |
| brand-violet-soft-bg | #f3f1ff×1 #f5f3ff×1 #f0e6ff×1 #e8e0f0×1 |
| brand-violet-soft-border | #d4cfff×1 #e0d7fe×1 #c9b8e8×1 |
| (rgba 通道) | rgba(102,126,234,α)×100 → brand-rgb；rgba(99,102,241/139,92,246/124,58,237/79,70,229,α)×27 → brand-violet-rgb |

### 6.3 状态四族

| token | 源值 |
|---|---|
| info-500 | #4a90d9×51 #3a7bc8×4 #3182ce×4 #0366d6×1 #1890ff×1 #3498db×1 #1e90ff×1 #3d7fc4×1 #4299e1×2 #4f8ef7×2 #5bc0de×1 #93c5fd×1 |
| info-strong | #1a73e8×9 #1557b0×3 #2b6cb0×2 #2563eb×2 #d2e3fc×2 #3b82f6×1 #1e40af×1 #2b579a×1 #60a5fa×1 |
| info-soft-bg | #e8f0fe×4 #dbeafe×2 #eff6ff×1 #e3f2fd×1 #e6f7ff×1 #f0f7ff×1 |
| info-soft-border | #d6e4ff×3 |
| info-rgb | rgba(74,144,217,α)×55（含 49,130,206/52,122,189/56,107,166/26,115,232/31,130,206/79,142,247/52,172,224 归并） |
| success-500 | #22c55e×13 #48bb78×8 #51cf66×5 #4caf50×3 #52c41a×3 #34d399×2 #10b981×2 #2ed573×1 #66bb6a×1 #55aa99×1 |
| success-strong | #38a169×6 #27ae60×4 #2f855a×3 #16a34a×3 #059669×3 #2d8a4e×1 |
| success-soft-bg | #e0f5e8×2 #e8f5ee×1 #e8f8ee×1 #f0fef0×1 |
| success-soft-border | #c6f0d4×1 |
| success-rgb | rgba(34,197,94/72,187,120/56,161,105/39,174,96/46,213,115/81,207,102/102,187,106/16,185,129,α)×17 |
| warning-500 | #f59e0b×22 #f0a500×3 #ff9800×3 #ffa502×2 #ecc94b×2 #dd6b20×2 #f0ad4e×1 #f0a040×1 #f0a020×1 #e67e22×1 #fa8c16×1 #ffc107×1 #e09600×1 #f57f17×1 |
| warning-strong | #d97706×7 #b45309×7 #92400e×3 #b26a00×2 #ca8a04×1 |
| warning-text-soft | #856404×1 #664d03×1 |
| warning-soft-bg | #fef3c7×4 #fde68a×3 #fdf1e3×2 #fff8e1×1 #ffe082×1 #fffbeb×1 #fff7e6×1 |
| warning-rgb | rgba(245,158,11/240,165,0/221,107,32/230,126,34/255,193,7/240,160,64/234,179,8,α)×42 |
| danger-500 | #e53e3e×28 #ef4444×12 #ff4d4f×6 #e74c3c×4 #dc2626×3 #f44336×3 #d9534f×2 #f56565×1 #f5222d×1 |
| danger-strong | #c53030×3 |
| danger-soft-text | #fc8181×3 #ff7875×1 #fca5a5×1 #fecaca×1 #f87171×2 |
| danger-soft-bg | #fff5f5×4 #fef2f2×4 #fee2e2×2 #fff0f0×1 #fff1f0×1 #fef9f9×1 #fed7d7×1 |
| danger-rgb | rgba(229,62,62/239,68,68/255,77,79/245,87,108/231,76,60/245,101,101,α)×33 |

### 6.4 Tier C：属性/上下文分派清单（hex 48 处纯上下文分派 + §5 的 rgba 黑/白族 195 处）

| 源 | 处数 | 分派规则 |
|---|---|---|
| #ffffff | 44 | `color:`→text-inverse；`background`→bg-surface/elevated（浮层容器用 elevated）；渐变上白描边→字面量保留 |
| #000000 | 2 | 逐处复核（深底卡片样例/阴影基底） |
| rgba(0,0,0,α) | 123 | 按 §5-R2 分带，`inset` 与遮罩类需人工确认属性 |
| rgba(255,255,255,α) | 72 | 按 §5-R3；判定"彩色底 vs 表面"依赖所在选择器，脚本按父选择器是否含 gradient/on-brand 类分派，剩余进人工清单 |
| #ff4757 #ff3344 #f5576c #f093fb | 7 | on-color 渐变装饰字面量（徽标/卡片渐变），不翻转 |
| #552222 | 2 | 错误块深红底：两主题均保持（本就是深色），复核确认 |
| #fff3a0 #fff3cd | 2 | mark-bg（划词高亮底），注入页场景固定不翻转 |

options `styles.css`（113 hex + 23 rgba）与划词 `selection-toolbar-styles.js`（27 hex）**复用同一张映射表**：这些文件色域与侧边栏高度重合（同一套品牌紫/灰阶），差异项在 B4 批人工补齐归属即可，不另建 token。

## 7. 分批改造顺序（B0–B6）

> 每批共同退出门禁：`npm run build:silent` 通过 → ESLint 0 error → 既有单测全量通过 → 该批专项断言通过。**独立可回滚提交**。

**B0 基础设施（1 个 PR，纯增量、零视觉改动）**
- `src/shared/theme.css`：62 个 token 的 L/D 两套定义。
- `src/shared/theme.js` + `theme-boot.js`：§3.1 全套；含 system 态 matchMedia。
- `scripts/theme-migrate.py`：§6 映射表内置；输入 CSS/JS，输出替换后文件 + 未命中报告；`--check` 模式做零残留断言（供 CI/门禁）。
- `scripts/theme-contrast-check.py`：对比度实算（本文所有 AA 数值由此产出，暗色 fill #566ad3 类微调以它为准）。
- 单测：theme.js 的 applyTheme/持久化/onChanged/ system 跟随（chrome.storage mock 需同时支持回调与 Promise 形态）。
- 验证：三端 HTML 引入 link/script 后亮色显示与现状一致。

**B1 侧边栏 CSS 主体（styles.css 分两段提交）**
- 脚本执行 §6 全量替换：先"骨架区"（base/header/消息流/输入区/工具栏，约 6000 行），后"浮层区"（dropdown/modal/panel 全家）。
- Tier C 人工复核清单逐项处理；每段完成后开暗色截图抽查（§8 探针先跑 smoke 子集）。
- 退出断言：`theme-migrate.py --check src/side_panel/styles.css` 零残留（on-color 白名单除外）。

**B2 侧边栏 JS 内联色（232 处）**
- 原则：`style="...#xxx..."` 字符串与 `.style.color=` 赋值 → 改为 CSS class 或 `var(--token)`。
- 优先大文件：token-stats-panel.js(66)、schedule-panel.js(54)、workspace-panel.js(45)、index.js(20)；chat-copy/chat-export/markdown-render 的复制/导出内联样式在 B5 与导出链一起处理（导出固定亮色）。
- 退出断言：`grep -rE "(color|background)[^;\n]{0,30}#[0-9a-f]{3,8}" src/side_panel/*.js` 仅剩导出/固定色白名单。

**B3 options 页 CSS（577 处）**
- 同 B1 流程复用映射表；options 保持品牌紫语义（既有决策：全部开关维持紫色语言，不引入侧边栏琥珀/绿语义）——暗色值同样适用既有开关 token（轨道 --brand-fill、空槽走 --border-subtle 族）。
- radio/方形勾选等非开关语言不改动结构，仅收编颜色。

**B4 HTML 内联 style（115+25 处）+ options JS（60 处）+ 划词 content（107 处）**
- HTML style 属性颜色迁入对应 CSS 类（顺手清掉 `.toggle-label` 内历史残留空 span）。
- 划词：`selection-toolbar-styles.js` 的样式模板改从 `var(--token)` 取值 + `index.js` 订阅主题变化重写 `:host` 变量；浮层是叠在任意网页上，**默认跟随扩展主题**，并保留独立开关 `selectionToolbarFollowTheme`（默认开，符合开关立即生效+持久化惯例）。

**B5 第三方渲染与导出链**
- **github-markdown**：新增 `libs/github-markdown-dark.min.css`（v5.9.0 同版 dark）；`side_panel.html` 两个 link 分别标 `data-theme-link="light|dark"`，theme.js 统一翻转 `disabled` 属性；同时在我们的 styles.css 里以 `!important` 以外方式按 token 覆盖 `.markdown-body` 的 `background-color`（库写死 #fff，需覆盖为 transparent）。
- **mermaid**：`libs-loader.js` 初始化 `theme: resolved==='dark'?'dark':'default'`；`subscribe` 中 `mermaid.initialize` 重设 + 对现存 `.mermaid` 节点清空并重渲染（沿用现有渲染函数），渲染缓存在主题变化时失效。
- **PDF/图片导出**：chat-export.js 的导出 HTML 模板**锁定亮色 token 值**（--paper 白底），与 UI 主题解耦；html2canvas 对"页面工作区截图"类功能跟随当前 UI（用户所得即所见）。
- **QR 码**：`qrcode.min.js` 前景固定 #000/白底（纸面语义），不翻转。

**B6 入口、同步与收尾**
- 配置页"外观"卡片 + 侧边栏 headerMoreDropdown 切换项 + i18n zh/en。
- `appTheme` 纳入配置导入导出与"导入导出覆盖清单"。
- §8 全量验收清单跑通；README/Wiki 增补主题说明（按文档同步清单惯例）。

## 8. Playwright 暗色视觉验收

### 8.1 探针基建
- 位置：`test-results-probes/_theme-*.mjs`（独立目录，避免 `playwright test` 清空 test-results 殃及探针）。
- 方式：沿用既有"加载 dist 构建产物 + chrome API stub"渲染验证方案；启动时向 storage mock 注入 `appTheme:'dark'`，或直接 `page.addInitScript` 设置 `data-theme`。
- 每面板截图命名 `_theme-dark-<panel>.png`，中英文 × 宽度 290/420/520 三档。

### 8.2 三类自动断言（不依赖人眼）
1. **暗色泄漏扫描**（核心，直击"组件颜色不协调"）：对每屏所有可见文本节点计算 `getComputedStyle` 的前景色/祖先链实际背景色对比度，**<4.5:1（<18px）或 <3:1（≥18px/粗体大字）即 fail**，输出违规选择器清单。
2. **亮色残留检测**：断言暗色态下不存在"`background:白 且 color:深灰`"组合的容器（#fff/#fafafa 系 bg + #333/#666 系 color）——这类正是上次翻车的"白斑块"。
3. **硬编码零残留**：`theme-migrate.py --check dist/`（构建产物级），on-color 白名单外 0 命中。

### 8.3 侧边栏验收清单（暗色逐屏截图 + 8.2 断言）

按 z-index/打开路径分组，共 40 个浮层 + 6 个常驻区：

| 组 | 条目 |
|---|---|
| 常驻 | header（含渐变）、消息流（用户/助手气泡、工具调用卡片、反思块、mermaid 图、代码块、表格）、输入区（一体化容器、底行 9 元素、窄屏"+"收纳）、三开关组（记忆/工具/划词选中态高亮）、徽标数字（激活紫/关闭灰）、免责声明行 |
| 会话 | sessionDropdown 全屏面板（时间分组/搜索历史/分组关闭）、sessionRenameModal、sessionDeleteModal（10004 层不遮罩验证） |
| 助手/模型 | agentSelectorDropdown、headerAgentDropdown、agentEditModal、agentConfirmModal、headerMoreDropdown（含新主题切换项）、tempDropdown |
| 提示词 | promptDropdown（tabs+列表）、promptManageModal、promptErrorModal |
| 工具 | toolsPopupOverlay（弹性换行 × 中英双态）、toolStatsOverlay、auditLogOverlay |
| 输入"+" | inputAddPanel（11 个二级列表面板逐一：技能/工具/代理/页面/MCP/知识库/提示词/代理路由/截图/附件/工作区）、fileAtDropdown、agentAtDropdown |
| 记忆 | memoryLimitDropdown、记忆全屏面板（开关+条数徽标） |
| 统计/任务 | tokenStatsOverlay（含弹窗图表）、schedule-panel、workspace-panel（嵌入/浮窗双模式）、prototypeLibraryModal、prototypeOverlay |
| 其他 | imagePreviewOverlay、clarifyOverlay、confirmModal/confirmOverlay/customConfirmOverlay/genericConfirmModal/deleteConfirmModal（六套确认体系统一走 token）、exportSessionsModal、shortcutsModal、versionInfoModal、chatNavQuestionPanel |
| 滚动/浮层 | ::selection 划选、滚动条、tooltip（--tooltip-bg 翻转）、@选择器"当前页已选中"高亮 |

### 8.4 配置页验收清单
- 逐分区截图：全局设置（含新增"外观"卡片）、模型/厂商配置投影区、推理循环（敏感操作确认开关）、反思（3 开关）、工具箱（MCP 总开关+卡片、技能、RAG/知识库面板）、记忆（开关+条目面板）、提示词/代理/代理路由管理列表及编辑弹窗、导入导出、暗色下 4 套滑轨开关（浅灰空槽+紫轨 ✓ 语言在暗面的等效定义）。
- 断言 8.2 三项 + 开关聚焦态（inset 描边与聚焦光晕合并的 box-shadow 在暗色下仍可见）。

### 8.5 划词与跨页同步
- 亮/暗两态下划词浮层与高亮底色截图。
- 同步用例：options 切暗 → 侧边栏 storage.onChanged 即时翻暗（不刷新）；system 态下 `emulateColorScheme('dark')` 验证跟随。

## 9. 测试与回归

- 单测新增：theme.js（4 组用例）、theme-migrate 映射表完备性（224+187 全覆盖断言，防映射漂移）。
- 既有：扩展端两套收口命令全量跑（含 agent 端 `node --test` 不涉及，本改造不动 agent 进程）。
- i18n：zh/en key 对齐测试。
- 回归面控制：B1/B3 属大 diff，按"骨架/浮层"分段提交，各段跑 §8.3/8.4 对应子集。

## 10. 风险与回滚

| 风险 | 等级 | 缓解 |
|---|---|---|
| styles.css 1.5 万行批量替换出语法事故 | 高 | 脚本替换后 `build:silent` 即校验 CSS 解析；分段提交；git revert 单批即可 |
| 灰阶收拢导致亮色观感漂移 | 中 | §4.1 原则 2 声明验收口径为逐屏目视；漂移敏感区（消息气泡、代码块）保留独立 token 不合并 |
| rgba(255,255,255,α) 上下文误判（on-color vs 表面） | 中 | Tier C 人工复核 + 泄漏扫描断言 2 兜底 |
| mermaid 重渲染丢交互状态/闪烁 | 低 | 渲染缓存失效 + 仅对已渲染节点重跑；失败保持旧图 |
| 划词浮层叠在深色网站上"白上加白" | 中 | 独立开关 selectionToolbarFollowTheme；默认跟随扩展主题 |
| 与在途分支的 styles.css 冲突 | 中 | 本改造作为串行任务在主线单分支进行，期间冻结其他 styles.css 大改分支合并 |

## 11. 决策记录（2026-10-18 用户确认）

1. 默认主题：`light`（老用户升级零感知）。
2. 保留"跟随系统"三态（light / dark / system）。
3. 侧边栏快捷切换入口：header「更多」菜单（headerMoreDropdown），不占用输入区底行。
4. 划词浮层默认跟随扩展主题，另留独立开关 `selectionToolbarFollowTheme`（默认开）。
