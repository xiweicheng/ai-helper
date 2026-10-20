# RepoWiki 文档官网（GitHub Pages 子目录）设计规格

- 日期：2026-10-20
- 状态：已与用户逐节确认
- 交付形态：基于 VitePress + Pagefind 的纯静态中文技术文档站，发布到现有 GitHub Pages 的 `/ai-helper/wiki/` 子目录

## 1. 目标与非目标

### 目标
- 将 Qoder RepoWiki 生成的 `.qoder/repowiki/zh/content/`（132 篇中文 Markdown，约 1.1 MB，每篇含 mermaid 图）发布为一个"软件官网级"文档站：侧边栏目录树、页内 TOC、离线中文全文搜索、亮/暗主题、移动端适配。
- 首页具备产品介绍感（hero + 特性卡片 + 快速开始入口），与现有落地页 `docs/index.html` 互相链接。
- repowiki 重新生成后，用一条本地命令刷新整个站点并走现有部署链上线。

### 非目标
- 不做英文内容翻译（repowiki 目前只有中文；框架不阻碍未来加 `en/`）。
- 不引入 GitHub Actions 自动重建（用户确认选本地一键脚本）。
- 不改变 GitHub Pages 现有配置（仍为 `main` 分支 `/docs` 子目录）。
- 不发布 `.qoder/repowiki/zh/meta/repowiki-metadata.json`（700 KB 代码片段索引，内部产物）与 `knowledge/zh/` 知识卡目录。
- 不与 `.wiki/`（GitHub Wiki 独立仓库镜像）产生同步关系，两者内容源不同、互不影响。

## 2. 已确认的决策

| 决策点 | 结论 |
|---|---|
| 定位 | 完整技术文档站（132 篇全量发布） |
| 语言 | 仅中文 |
| 托管 | 现有 Pages 子目录：`https://xiweicheng.github.io/ai-helper/wiki/` |
| 搜索 | 离线全文搜索（Pagefind），禁用 VitePress 内置 local search |
| 刷新机制 | 本地一键命令 `npm run build:docsite`，之后走 `push:all` 现有链路 |
| 生成引擎 | 方案 A：VitePress + Pagefind（否决自研脚本与 MkDocs，理由见 §8） |
| 多页 vs 单页 | 多页：每篇 MD 一个 HTML，共享侧边栏目录树（132 篇 1.1 MB 单体页不可行） |

## 3. 总体架构与数据流

```
.qoder/repowiki/zh/content/          （gitignore，Qoder 定期重新生成，唯一内容源）
        │ npm run build:docsite
        ▼
scripts/build-docsite.mjs            ① 复制 + 转换 → .docsite-src/（gitignore 暂存）
        ▼                            ② 生成 VitePress sidebar/config
VitePress build（base=/ai-helper/wiki/）
        ▼                            ③ pagefind 索引写入产物
docs/wiki/                           ④ 构建产物提交进仓库（Pages 读 main/docs）
        ▼
现有链路不变：git push origin main → Pages 自动发布；
push:all → deploy-pages.sh → gh-pages（Gitee 侧仅内容镜像，无托管用途）
```

新增 devDependencies 共 3 个：`vitepress`、`pagefind`、`mermaid`（§4-4 决定 mermaid 走 npm ESM 包而非 `libs/mermaid.min.js`）。不新增 CI；不改动扩展构建的 `vite.config.js`（文档站是独立构建入口，不共享 vite 配置）。

### 目录职责
- `.docsite/`（进仓库，文档站自身的源码）：
  - `.docsite/config.mjs` 或经转换脚本生成的 vitepress 配置片段：侧边栏、导航、主题
  - `.docsite/theme/`：自定义 Search 组件（接 Pagefind）、enhanceApp 钩子（mermaid 加载）
  - `.docsite/home.md`：文档站首页源（hero + 特性卡片，构建时注入版本号）
- `.docsite-src/`（gitignore）：转换后的 MD 暂存，VitePress 的 srcDir
- 需在 `.gitignore` 新增：`.docsite-src/`（docs/superpowers 产物不受影响；docs/wiki/ 为入库产物，不加 ignore）
- `docs/wiki/`（进仓库）：VitePress 构建产物 + pagefind 索引，即线上站点
- `scripts/build-docsite.mjs`（进仓库）：一键构建脚本（步骤 ①–④ + 校验）

### npm scripts（沿用现有 `x:y` 命名风格）
- `build:docsite` → `node scripts/build-docsite.mjs`
- `preview:docsite` → `node scripts/build-docsite.mjs --preview`（构建后起本地静态服务器，默认端口 4173）

## 4. 内容转换管线（build-docsite.mjs 第 ① 步）

对 `zh/content/` 下每篇 MD：

1. **`file://` 引用转换**（全库约 10,853 处）：
   `[searcher.js](file://agent/src/rag/searcher.js)` →
   `[agent/src/rag/searcher.js](https://github.com/xiweicheng/ai-helper/blob/main/agent/src/rag/searcher.js)`
   链接文本改为完整路径；每篇开头的 `<cite>…</cite>` 块转换为 VitePress 折叠容器（`::: details 本文引用的源码文件`），保留全部链接。
2. **目录树 → 侧边栏**：递归扫描目录层级生成 sidebar 配置。15 个顶层分区 → 分组；分组内与目录同名的 MD（如 `RAG 知识检索/RAG 知识检索.md`）作为该组第一项「概览」。排序：顶层按现有 `ls` 序（概览类靠前），组内先概览后子项、子项按名称序。
3. **文件名处理**：保留中文名；空格替换为 `-`（复制重命名），URL 百分号编码在 Pages 上可用，标题保持原样。相对链接（若有指向兄弟 MD 的）重写为 `.md` → `/` 页面路径。
4. **mermaid**：markdown-it fence 规则将 ```mermaid 输出为 `<pre class="mermaid">`；`enhanceApp` 钩子在每页动态 import mermaid（`vitepress` 生态方案，用 `markdown.config` 自定义 fence 实现；mermaid 库以 vitepress 依赖的 npm 包 `mermaid` 打包，不复用 `libs/mermaid.min.js`——该文件是给扩展运行时用的全局脚本形态，与 ESM 打包不兼容）。
5. **frontmatter**：为每篇注入 `title`（取首个 H1）与 `description`（摘要段首句），供 TOC、侧边栏与 pagefind 元数据使用。
6. **跳过项**：`zh/meta/`、`knowledge/` 不进入管线；转换只以 `zh/content/` 为输入。

## 5. 搜索（Pagefind）

- 构建顺序：VitePress build 完成 → `pagefind --site docs/wiki` 生成 `docs/wiki/pagefind/` 分包索引（中文按字/二元切分，Pagefind 原生支持）。
- 顶栏搜索：VitePress 主题 slot `nav-searchbar` 替换为自定义组件，调用 Pagefind JS API；结果含正文上下文摘录与高亮，点击直达页面锚点。
- 索引按需加载：Pagefind 分包机制保证首屏不下载全量索引。
- 验收样例：搜「混合检索」「RRF」「完成度校验」「Service Worker 保活」均须命中对应文档正文。

## 6. 站点外壳与官网感

- **文档站首页**（由 `.docsite/home.md` 生成，VitePress home layout）：
  - hero：产品名「AI Helper」+ 一句话介绍 + 版本号（构建时读 `src/config/version.json`，当前 2.4.0，不硬编码）+ 按钮「快速开始」（链至 `项目概览与快速开始`）与「返回产品主页」（链至 `/ai-helper/`）
  - 特性卡片区：从 repowiki「核心功能特性」章节摘要生成 6–8 张卡片，点击进入对应文档分区
  - 顶部安装命令块遵循现有规范（macOS/Linux curl、Windows irm、npm 备选），与 README 一致
- **全局导航**：文档站 nav 含「文档首页 / 产品主页 / 源码仓库 / Releases」外链组
- **落地页回链**：`docs/index.html` 增加「文档中心」入口按钮（双语字典同步加 key），指向 `/ai-helper/wiki/`
- **主题**：亮/暗/跟随系统（VitePress 自带切换器），默认亮色，与产品默认 `light` 一致

## 7. 错误处理与构建校验

脚本任一失败即退出非零并打印清晰原因：

- `.qoder/repowiki/zh/content/` 不存在或 MD 数 < 100：报错「RepoWiki 源缺失，请在 Qoder 中重新生成 RepoWiki」
- 转换后残留 `file://` 引用：grep 断言为 0，否则列出违规文件并失败
- 产出页面数 ≠ 输入 MD 数：失败
- sidebar 条目数与页面数不一致（漏挂载）：失败并列出差集
- `pagefind` 索引目录不存在或为空：失败
- 构建幂等：每次先清空 `.docsite-src/` 与 `docs/wiki/` 再重建（`docs/wiki/` 下保留 `.nojekyll`）

## 8. 被否决的方案

- **自研零依赖生成脚本**：侧边栏/TOC/响应式/中文搜索 UI 全手写，达到官网级外观工作量约 3–5 倍，自研 bigram 搜索召回质量无保障。
- **MkDocs Material**：搜索与主题成熟，但引入 Python 工具链；本仓库工程链（构建/测试/发布/CI）全在 npm，双工具链维护成本不合理。
- **独立仓库/独立 Pages 站点**：需新建部署链；现有 main/docs 源 + push-all 链路可直接复用，子目录方案成本最低。
- **GitHub Actions 自动重建**：repowiki 源在 gitignore 中不入库，CI 无法构建；本地一键脚本与 Qoder 生成节奏天然匹配。

## 9. 测试与验收

1. `npm run build:docsite` 在干净工作区一次通过，校验全部通过。
2. `npm run preview:docsite` 本地抽查：
   - 首页 hero/卡片/安装命令渲染正确，版本号来自 version.json
   - 侧边栏 15 分区可展开，任选 3 篇深层文档（含中文空格路径）可打开
   - mermaid 图在 2 篇不同文档中渲染成功
   - 中文搜索「混合检索」「完成度校验」命中正文并高亮
   - `file://` 转换后的链接在页面中指向 GitHub blob URL
3. 提交 `docs/wiki/` 产物后执行 `npm run push:all`，线上 Pages 访问 `/ai-helper/wiki/` 正常（含 `.nojekyll` 生效、资源路径 base 正确）。
4. `docs/index.html`「文档中心」按钮上线可用；文档站「返回产品主页」可达。
5. 按文档同步惯例：`build:docsite`/`preview:docsite` 记入 CHANGELOG 与相关 README 的开发者命令处。

## 10. 风险与边界

- **产物入库体积**：预计 3–6 MB（HTML + pagefind 索引 + 共享 JS/CSS）；对仓库体积影响可接受，若后续膨胀再考虑转 gh-pages 产物分支（本期不做）。
- **repowiki 结构漂移**：未来 Qoder 重新生成可能增减章节——侧边栏由扫描自动生成，无硬编码列表，天然兼容；若 `zh/content/` 改名需同步脚本常量（仅此一处）。
- **VitePress 与仓库现有 vite 版本共存**：vitepress 自带依赖树，作为独立构建入口不与扩展 `vite.config.js` 冲突；安装后跑一次 `npm run build:silent` 确认扩展构建不受影响。
- **中文文件名 URL**：Pages 百分号编码路径可用；验收项 2 显式覆盖含空格路径。
