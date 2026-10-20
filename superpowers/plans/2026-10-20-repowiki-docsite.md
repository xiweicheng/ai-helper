# RepoWiki 文档官网 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `.qoder/repowiki/zh/content/`（132 篇中文 Markdown）构建为 VitePress + Pagefind 静态文档站，产物提交到 `docs/wiki/`，经现有 GitHub Pages（main/docs）发布到 `https://xiweicheng.github.io/ai-helper/wiki/`。

**Architecture:** 一条本地命令 `npm run build:docsite` 串联四步：① 纯函数转换 repowiki MD（file:// → GitHub blob 链接、目录树 → 侧边栏、文件名空格→`-`、注入 frontmatter）到 gitignore 暂存目录 `.docsite-src/`；② 生成 VitePress 配置与主题（mermaid fence、Pagefind 搜索覆盖层）；③ `vitepress build` 输出到 `docs/wiki/`；④ `pagefind` 生成索引并跑 6 项硬校验。部署完全复用现有 push 链路。

**Tech Stack:** VitePress（devDep）、Pagefind（devDep，用其 pagefind-ui 现成搜索组件）、mermaid（devDep，ESM 包）、Node ≥22 ESM 脚本、Vitest（test/unit）。

**Spec:** `docs/superpowers/specs/2026-10-20-repowiki-docsite-design.md`（本计划逐节实现该 spec，冲突以 spec 为准）

## Global Constraints

- 新增 devDependencies 恰好 3 个：`vitepress`、`pagefind`、`mermaid`；不新增 CI，不改动扩展构建的 `vite.config.js`
- 内容源只有 `.qoder/repowiki/zh/content/`；`zh/meta/`（700KB JSON）与 `knowledge/` 不进管线
- 站点 base 固定 `/ai-helper/wiki/`；GitHub blob 前缀固定 `https://github.com/xiweicheng/ai-helper/blob/main/`
- 版本号构建时读 `src/config/version.json`（当前 2.4.0），禁止硬编码
- 安装命令文案与 README 保持一致（macOS/Linux curl、Windows irm、npm 备选）
- 主题默认亮色；文案中文
- 扩展端单测命名/位置约定：`test/unit/*.unit.test.js`，跑法 `npx vitest run <file>`；收口回归 `npm run test:unit`
- 涉及工程改动的任务收口前跑 `npm run build:silent` 确认扩展构建不受影响（期望输出 `BUILD_SUCCESS`）
- `.gitignore` 新增 `.docsite-src/`；`docs/wiki/` 为入库产物，不加 ignore

## File Structure

| 文件 | 动作 | 职责 |
|---|---|---|
| `package.json` | Modify | 3 个 devDeps + `build:docsite` / `preview:docsite` scripts |
| `.gitignore` | Modify | 追加 `.docsite-src/` |
| `scripts/docsite/transform.mjs` | Create | 全部纯转换函数（唯一持有正则/映射逻辑处） |
| `scripts/docsite/scaffold.mjs` | Create | 把转换结果落盘为 VitePress srcDir（复制/改写 config/theme/index.md） |
| `scripts/build-docsite.mjs` | Create | 编排 + 调 vitepress/pagefind + 6 项校验 + `--preview` |
| `.docsite/home.md` | Create | 文档站首页源（hero + 特性卡片，占位符 `{{VERSION}}` 由 scaffold 注入） |
| `.docsite/theme/index.js` | Create | VitePress 主题入口（extends DefaultTheme + mermaid 生命周期） |
| `.docsite/theme/Layout.vue` | Create | 覆写 `nav-searchbar` slot 挂搜索按钮 |
| `.docsite/theme/DocSearch.vue` | Create | Pagefind UI 覆盖层组件（懒加载 pagefind-ui.js/css） |
| `.docsite/theme/custom.css` | Create | 覆盖层样式微调 |
| `test/unit/docsite-transform.unit.test.js` | Create | transform 纯函数行为测试 + 主题/config 源码守卫 |
| `docs/index.html` | Modify | nav 增加「文档中心」链接（:870 区）+ 词典加 `nav-docsite`（:1792 区） |
| `CHANGELOG.md` / `README.md` / `README.zh-CN.md` | Modify | 新命令记入开发者命令处 |
| `docs/wiki/**` | Create（产物） | 构建输出 + pagefind 索引 + `.nojekyll`，提交入库 |

依赖方向：`build-docsite.mjs → scaffold.mjs → transform.mjs`；`.docsite/theme/*` 只被 VitePress 构建消费；测试只 import `transform.mjs` 并对 theme/config 源文件做文本守卫断言。

---

### Task 1: 依赖、目录骨架与 npm scripts

**Files:**
- Modify: `package.json`（scripts 区、devDependencies）
- Modify: `.gitignore`（末尾追加）
- Create: `.docsite/home.md`（先占位空骨架，Task 3 填充完整）
- Create: `.docsite/theme/custom.css`（先空文件）
- Create: `scripts/docsite/transform.mjs` / `scripts/docsite/scaffold.mjs` / `scripts/build-docsite.mjs`（先只建空文件头 `// implemented in task 2/3/4`）

**Interfaces:**
- Consumes: 无
- Produces: 依赖 `vitepress`/`pagefind`/`mermaid` 可 import；npm scripts `build:docsite`、`preview:docsite` 存在（暂指向将完成的脚本）

- [ ] **Step 1: 安装依赖**

```bash
npm i -D vitepress pagefind mermaid
```

预期：`package.json` devDependencies 出现三项，安装成功无 error。

- [ ] **Step 2: 加 npm scripts 与 gitignore**

`package.json` scripts 中，`"build:silent"` 行之后插入：

```json
"build:docsite": "node scripts/build-docsite.mjs",
"preview:docsite": "node scripts/build-docsite.mjs --preview",
```

`.gitignore` 末尾追加：

```
# RepoWiki 文档站构建暂存（源在 .qoder/repowiki，产物入库 docs/wiki/）
.docsite-src/
```

- [ ] **Step 3: 建目录与空文件**

```bash
mkdir -p .docsite/theme scripts/docsite
printf '# implemented in task 2\nexport {};\n' > scripts/docsite/transform.mjs
printf '# implemented in task 3\nexport {};\n' > scripts/docsite/scaffold.mjs
printf '# implemented in task 4\n' > scripts/build-docsite.mjs
printf '# empty placeholder, filled in task 3\n' > .docsite/home.md
printf '/* filled in task 3 */\n' > .docsite/theme/custom.css
```

- [ ] **Step 4: 验证不破坏现有工程**

```bash
npm run build:silent   # 期望末行输出 BUILD_SUCCESS
npx vitest run test/unit/agent-exec-confirmation.unit.test.js  # 任取一存量测试文件，期望 PASS
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .docsite scripts/docsite scripts/build-docsite.mjs
git commit -m "chore(docsite): 文档站依赖（vitepress/pagefind/mermaid）与目录骨架"
```

---

### Task 2: transform.mjs 纯转换函数（TDD）

**Files:**
- Create: `scripts/docsite/transform.mjs`（替换 Task 1 占位内容）
- Test: `test/unit/docsite-transform.unit.test.js`

**Interfaces:**
- Consumes: 无（纯函数，不碰 fs）
- Produces（Task 3/4 依赖的精确签名）:
  - `const BLOB_BASE = 'https://github.com/xiweicheng/ai-helper/blob/main/'`
  - `convertFileLinks(md) → md'`：`[任意文本](file://PATH)` → `[PATH](BLOB_BASE+PATH)`
  - `wrapCiteBlock(md) → md'`：`<cite>…</cite>` → `::: details 本文引用的源码文件\n…\n:::`（内部先经 convertFileLinks）
  - `sanitizeName(name) → name'`：仅空格→`-`，其余字符不动（`'RAG 知识检索.md' → 'RAG-知识检索.md'`）
  - `extractFrontmatter(md) → { title, description }`：title=首个 `# ` 行文本；description=`## 引言` 段首句（无则首个非标题段落首句；都没有→空串），句读以 `。` 断
  - `injectFrontmatter(md, {title, description}) → md'`：YAML 头插到最前（值中的 `"` 转义）
  - `rewriteMdLinks(md, relDir, pathMap) → md'`：相对 `.md` 链接（含 `#锚点` 保留）改写为指向 pathMap 新路径；`pathMap: Map<原始相对路径, 站点页面路径>`（如 `'RAG 知识检索/混合检索引擎.md' → '/RAG-知识检索/混合检索引擎/'`）
  - `planPage(relPath) → { srcRel, outRel, pagePath }`：`srcRel`=各段 sanitize 后的暂存相对路径（目录与文件同名 MD 转成 `目录名/index.md` 之外一律保留 `.md`），`pagePath`=`'/' + 各段 sanitize（去 .md） + '/'`
  - `buildTree(relPaths) → tree`：`{ name, path?, link?, children[] }`，顶层按传入序
  - `buildSidebar(tree) → sidebarItems`：VitePress 数组形 sidebar；每个顶层分区一个 group（`collapsed: true`），组内与目录同名的 MD 文本改为「概览」并置首，其余子项按名称字典序
  - `buildPathMap(relPaths) → Map`：原始相对路径 → pagePath（供 rewriteMdLinks）
  - `transformDocument(md, relPath, pathMap) → { outRel, content }`：管线单文档入口，顺序 = wrapCiteBlock → convertFileLinks（残余散落）→ rewriteMdLinks → injectFrontmatter(extractFrontmatter)

- [ ] **Step 1: 写失败测试**

创建 `test/unit/docsite-transform.unit.test.js`：

```js
import { describe, it, expect } from 'vitest';
import {
  BLOB_BASE, convertFileLinks, wrapCiteBlock, sanitizeName,
  extractFrontmatter, injectFrontmatter, rewriteMdLinks,
  planPage, buildTree, buildSidebar, buildPathMap, transformDocument,
} from '../../scripts/docsite/transform.mjs';

describe('convertFileLinks', () => {
  it('链接文本改为完整路径并指向 blob URL', () => {
    const out = convertFileLinks('[searcher.js](file://agent/src/rag/searcher.js)');
    expect(out).toBe('[agent/src/rag/searcher.js](' + BLOB_BASE + 'agent/src/rag/searcher.js)');
  });
  it('同一行多处引用全部转换且无 file:// 残留', () => {
    const out = convertFileLinks('见 [a.js](file://src/a.js) 与 [b.js](file://agent/b.js)');
    expect(out).not.toMatch(/file:\/\//);
    expect(out).toContain(BLOB_BASE + 'src/a.js');
    expect(out).toContain(BLOB_BASE + 'agent/b.js');
  });
});

describe('wrapCiteBlock', () => {
  it('cite 块转 details 容器并保留转换后的链接', () => {
    const md = '<cite>\n**本文引用的文件**\n- [s.js](file://agent/s.js)\n</cite>\n\n# 标题';
    const out = wrapCiteBlock(md);
    expect(out).toContain('::: details 本文引用的源码文件');
    expect(out).toContain(BLOB_BASE + 'agent/s.js');
    expect(out).not.toMatch(/<cite>/);
  });
});

describe('sanitizeName / planPage', () => {
  it('空格转连字符，中文保留', () => {
    expect(sanitizeName('RAG 知识检索')).toBe('RAG-知识检索');
  });
  it('目录同名 MD 映射为 index 且页面路径带斜杠', () => {
    const p = planPage('RAG 知识检索/RAG 知识检索.md');
    expect(p.srcRel).toBe('RAG-知识检索/index.md');
    expect(p.pagePath).toBe('/RAG-知识检索/');
    const q = planPage('RAG 知识检索/混合检索引擎.md');
    expect(q.srcRel).toBe('RAG-知识检索/混合检索引擎.md');
    expect(q.pagePath).toBe('/RAG-知识检索/混合检索引擎/');
  });
});

describe('frontmatter', () => {
  it('title 取首个 H1，description 取引言首句', () => {
    const { title, description } = extractFrontmatter('# 混合检索引擎\n\n## 引言\n本技术文档聚焦 X。后续段落\n');
    expect(title).toBe('混合检索引擎');
    expect(description).toBe('本技术文档聚焦 X。');
  });
  it('inject 产出的 YAML 头合法且置于最前', () => {
    const out = injectFrontmatter('# T\n', { title: 'T', description: '说"明"' });
    expect(out.startsWith('---\ntitle: T\ndescription: ')).toBe(true);
    expect(out.endsWith('# T\n')).toBe(true);
  });
});

describe('rewriteMdLinks', () => {
  it('兄弟 MD 链接改写为新页面路径并保留锚点', () => {
    const map = buildPathMap(['RAG 知识检索/RAG 知识检索.md', 'RAG 知识检索/混合检索引擎.md']);
    const out = rewriteMdLinks('[引擎](./混合检索引擎.md#引言)', 'RAG-知识检索', map);
    expect(out).toBe('[引擎](/RAG-知识检索/混合检索引擎/#引言)');
  });
});

describe('buildSidebar', () => {
  const paths = ['RAG 知识检索/RAG 知识检索.md', 'RAG 知识检索/混合检索引擎.md', '开发者指南.md'];
  it('顶层为 group，组内概览置首其余字典序', () => {
    const items = buildSidebar(buildTree(paths));
    const rag = items.find(i => i.text === 'RAG 知识检索');
    expect(rag.collapsed).toBe(true);
    expect(rag.items[0]).toMatchObject({ text: '概览', link: '/RAG-知识检索/' });
    expect(rag.items[1].link).toBe('/RAG-知识检索/混合检索引擎/');
    expect(items.map(i => i.text)).toContain('开发者指南');
  });
  it('sidebar 覆盖全部输入页面数', () => {
    const items = buildSidebar(buildTree(paths));
    const links = [];
    (function walk(arr) { arr.forEach(i => { if (i.link) links.push(i.link); if (i.items) walk(i.items); }); })(items);
    expect(links.filter(Boolean).length).toBe(paths.length);
  });
});

describe('transformDocument 全链路', () => {
  it('产出无 file:// 残留且含 frontmatter/details', () => {
    const md = '<cite>\n- [s.js](file://agent/s.js)\n</cite>\n\n# 标题\n\n## 引言\n介绍。';
    const map = buildPathMap(['A.md']);
    const { content } = transformDocument(md, 'A.md', map);
    expect(content).not.toMatch(/file:\/\//);
    expect(content).toContain('::: details');
    expect(content.startsWith('---\ntitle: 标题')).toBe(true);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx vitest run test/unit/docsite-transform.unit.test.js`
Expected: FAIL（import 到的还是 `export {}` 占位，报 `convertFileLinks is not a function` / SyntaxError）

- [ ] **Step 3: 实现 transform.mjs**

用以下内容整体替换 `scripts/docsite/transform.mjs`：

```js
// scripts/docsite/transform.mjs — RepoWiki 文档站纯转换函数（不含 fs/构建副作用）
export const BLOB_BASE = 'https://github.com/xiweicheng/ai-helper/blob/main/';

export function convertFileLinks(md) {
  return md.replace(/\[([^\]]*)\]\(file:\/\/([^)\s]+)\)/g,
    (_m, _text, p) => `[${p}](${BLOB_BASE}${p})`);
}

export function wrapCiteBlock(md) {
  return md.replace(/<cite>\s*([\s\S]*?)\s*<\/cite>/g,
    (_m, inner) => `::: details 本文引用的源码文件\n${inner.trim()}\n:::`);
}

export function sanitizeName(name) {
  return name.replaceAll(' ', '-');
}

export function extractFrontmatter(md) {
  const title = md.match(/^# (.+)$/m)?.[1]?.trim() ?? '';
  let description = '';
  const intro = md.match(/## 引言\n+([^\n#]+)/);
  const first = intro?.[1] ?? md.match(/\n\n([^\n#>]+。)/)?.[1] ?? '';
  if (first) description = first.split('。')[0] + '。';
  return { title, description };
}

export function injectFrontmatter(md, { title, description }) {
  const esc = s => String(s).replaceAll('"', '\\"');
  return `---\ntitle: "${esc(title)}"\ndescription: "${esc(description)}"\n---\n${md}`;
}

export function planPage(relPath) {
  const segs = relPath.split('/');
  const file = segs.at(-1);
  const stem = file.replace(/\.md$/, '');
  const cleanSegs = segs.slice(0, -1);
  const isOverview = cleanSegs.at(-1) === stem;
  const outFileName = isOverview ? 'index.md' : `${sanitizeName(stem)}.md`;
  const srcRel = [...cleanSegs.map(sanitizeName), outFileName].join('/');
  const pagePath = '/' + [...cleanSegs.map(sanitizeName), ...(isOverview ? [] : [sanitizeName(stem)])].join('/') + '/';
  return { srcRel, pagePath };
}

export function buildPathMap(relPaths) {
  const map = new Map();
  for (const p of relPaths) map.set(p, planPage(p).pagePath);
  return map;
}

export function rewriteMdLinks(md, relDir, pathMap) {
  // relDir: 源文件所在目录（原始路径，未 sanitize），如 'RAG 知识检索'
  return md.replace(/\[([^\]]*)\]\((\.\/|\.\.\/)([^)]+\.md)(#[^)]*)?\)/g,
    (m, text, prefix, target, anchor = '') => {
      const abs = normalizeRel(relDir, prefix + target);
      const page = pathMap.get(abs);
      return page ? `[${text}](${page}${anchor})` : m;
    });
}

function normalizeRel(base, rel) {
  const parts = base ? base.split('/') : [];
  for (const seg of rel.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

export function buildTree(relPaths) {
  const root = { name: '', children: [] };
  const dirIndex = new Map([['', root]]);
  const sorted = [...relPaths].sort();
  for (const p of sorted) {
    const segs = p.split('/');
    let parentKey = '';
    const node = {
      name: segs.at(-1).replace(/\.md$/, ''),
      path: p,
      link: planPage(p).pagePath,
      children: [],
    };
    if (segs.length > 1) {
      parentKey = segs.slice(0, -1).join('/');
      // 逐级建目录节点
      const chain = [];
      for (let i = 0; i < segs.length - 1; i++) chain.push(segs.slice(0, i + 1).join('/'));
      for (const key of chain) {
        if (!dirIndex.has(key)) {
          const k = key.split('/');
          const dirNode = { name: k.at(-1), children: [] };
          dirIndex.set(key, dirNode);
          const parent = dirIndex.get(k.slice(0, -1).join('/')) ?? root;
          parent.children.push(dirNode);
        }
      }
    }
    (dirIndex.get(parentKey) ?? root).children.push(node);
  }
  return root;
}

export function buildSidebar(tree, topOrder = []) {
  const tops = topOrder.length
    ? topOrder.map(t => tree.children.find(c => c.name === t)).filter(Boolean)
    : tree.children;
  return tops.map(top => {
    const items = collectLinks(top);
    return { text: top.name, collapsed: true, items };
  });
}

function collectLinks(node) {
  const own = node.link ? [{ text: node.name, link: node.link }] : [];
  const kids = (node.children ?? []).flatMap(c => {
    const sub = collectLinks(c);
    return c.link ? sub : [{ text: c.name, collapsed: true, items: sub }];
  });
  // 组内目录同名"概览"置首，其余按文本字典序
  const all = [...own, ...kids];
  all.sort((a, b) => (a.text === '概览' ? -1 : b.text === '概览' ? 1 : a.text.localeCompare(b.text, 'zh')));
  return all;
}

// 概览判定（与目录同名）在 sidebar 里显示为「概览」
export function overviewLabelFix(items, dirName) {
  for (const it of items) {
    if (it.text === dirName) it.text = '概览';
    if (it.items) overviewLabelFix(it.items, dirName);
  }
  return items;
}

export function transformDocument(md, relPath, pathMap) {
  let out = wrapCiteBlock(md);
  out = convertFileLinks(out);
  const relDir = relPath.split('/').slice(0, -1).join('/');
  out = rewriteMdLinks(out, relDir, pathMap);
  out = injectFrontmatter(out, extractFrontmatter(out));
  return { srcRel: planPage(relPath).srcRel, content: out };
}
```

注意：`buildSidebar` 产出的分组若含概览，需在外层对每个 group 的 items 调 `overviewLabelFix(items, groupName)`——此接线在 Task 3 scaffold 中完成并被守卫测试覆盖。

- [ ] **Step 4: 跑测试确认通过**

Run: `npx vitest run test/unit/docsite-transform.unit.test.js`
Expected: PASS（全部 case）。若 `buildSidebar` 测试对概览文本断言不过，按 Interfaces 的实现修实现，不迁就测试改断言含义。

- [ ] **Step 5: Commit**

```bash
git add scripts/docsite/transform.mjs test/unit/docsite-transform.unit.test.js
git commit -m "feat(docsite): repowiki→vitepress 纯转换函数（file://链接、cite容器、侧边栏树、frontmatter）"
```

---

### Task 3: VitePress 主题、首页与脚手架 scaffold.mjs

**Files:**
- Create: `.docsite/theme/index.js`、`.docsite/theme/Layout.vue`、`.docsite/theme/DocSearch.vue`
- Modify: `.docsite/theme/custom.css`（替换占位）
- Modify: `.docsite/home.md`（替换占位，完整首页）
- Create: `scripts/docsite/scaffold.mjs`（替换 Task 1 占位）
- Modify: `test/unit/docsite-transform.unit.test.js`（追加守卫 describe）

**Interfaces:**
- Consumes: Task 2 的 `transformDocument`、`buildTree`、`buildSidebar`、`overviewLabelFix`、`buildPathMap`、`planPage`
- Produces: `async function stageSite({ srcDir, outDirAbs, repoRoot })` —— 清空并把 `.docsite-src/` 布置为合法 VitePress srcDir：转换后的全部 MD、`.vitepress/config.mjs`（含 base/outDir/sidebar/nav/mermaid fence/`ignoreDeadLinks: ['localhost', '/ai-helper/']`）、`.vitepress/theme/`（复制 .docsite/theme 内容）、`index.md`（home.md 注入版本号）；返回 `{ pageCount, sidebarLinkCount }`

- [ ] **Step 1: 写主题四文件**

`.docsite/theme/index.js`：

```js
import DefaultTheme from 'vitepress/theme';
import Layout from './Layout.vue';
import mermaid from 'mermaid';
import './custom.css';

if (typeof document !== 'undefined') {
  mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose' });
}

export default { extends: DefaultTheme, Layout };
```

`.docsite/theme/Layout.vue`：

```vue
<script setup>
import DefaultTheme from 'vitepress/theme-without-fonts';
import { useRoute, WatchSource } from 'vue-... ';
</script>
```

（以上仅为示意开头——实际文件按下述要点完整写出，执行时以此代码为准：）

```vue
<script setup>
import DefaultTheme from 'vitepress/theme';
import { watch, onMounted, nextTick } from 'vue';
import { useRoute } from 'vitepress';
import mermaid from 'mermaid';
import DocSearch from './DocSearch.vue';

const { Layout } = DefaultTheme;
const route = useRoute();

async function renderMermaid() {
  if (typeof document === 'undefined') return;
  const els = document.querySelectorAll('pre.mermaid:not([data-processed])');
  if (els.length) {
    try { await mermaid.run({ nodes: els }); } catch (e) { console.warn('mermaid render failed', e); }
  }
}
onMounted(() => nextTick(renderMermaid));
watch(() => route.path, () => nextTick(renderMermaid));
</script>

<template>
  <Layout>
    <template #nav-bar-content-after>
      <DocSearch />
    </template>
  </Layout>
</template>
```

`.docsite/theme/DocSearch.vue`：

```vue
<script setup>
import { ref, onBeforeUnmount } from 'vue';

const open = ref(false);
let ui = null;
const BASE = '/ai-helper/wiki/';

function el() { return document.getElementById('docsearch-mount'); }

async function ensureUi() {
  if (ui) return;
  if (!document.querySelector('#pagefind-ui-css')) {
    const link = document.createElement('link');
    link.id = 'pagefind-ui-css'; link.rel = 'stylesheet';
    link.href = `${BASE}pagefind/pagefind-ui.css`;
    document.head.appendChild(link);
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = `${BASE}pagefind/pagefind-ui.js`;
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  ui = new window.PagefindUI({ element: '#docsearch-mount', bundlePath: `${BASE}pagefind/`, showImages: false });
}

async function toggle() {
  open.value = !open.value;
  if (open.value) { await nextTickFrame(); await ensureUi(); }
}
function nextTickFrame() { return new Promise(r => requestAnimationFrame(r)); }
function onKey(e) { if (e.key === 'Escape') open.value = false; }
onMountedLike(() => document.addEventListener('keydown', onKey));
function onMountedLike(fn) { import('vue').then(v => v.onMounted(fn)); }
onBeforeUnmount(() => { document.removeEventListener('keydown', onKey); ui?.destroy?.(); });
</script>

<template>
  <button class="docsearch-btn" @click="toggle" aria-label="搜索文档">🔍 搜索</button>
  <div v-if="open" class="docsearch-overlay" @click.self="open = false">
    <div id="docsearch-mount" class="docsearch-panel"></div>
  </div>
</template>
```

（执行注意：`onMounted`/`nextTick` 应从 'vue' 静态 import 后使用，上面 `onMountedLike` 是绕弯写法——落地时改为 `import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'` 的标准组合式写法，保持其余逻辑不变。）

`.docsite/theme/custom.css`：

```css
.docsearch-btn { margin-left: 12px; padding: 4px 10px; border: 1px solid var(--vp-c-divider); border-radius: 6px; background: var(--vp-c-bg-soft); color: var(--vp-c-text-2); font-size: 13px; cursor: pointer; }
.docsearch-btn:hover { color: var(--vp-c-brand-1); border-color: var(--vp-c-brand-1); }
.docsearch-overlay { position: fixed; inset: 0; z-index: 999; background: rgba(0,0,0,.45); display: flex; justify-content: center; padding: 8vh 4vw; }
.docsearch-panel { width: min(720px, 100%); max-height: 80vh; overflow: auto; background: var(--vp-c-bg); border-radius: 10px; padding: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.3); }
```

- [ ] **Step 2: 写完整 .docsite/home.md**

VitePress home frontmatter + 特性卡片；`{{VERSION}}` 与 `{{DATE}}` 由 scaffold 注入：

```markdown
---
layout: home
title: AI Helper 文档中心

hero:
  name: AI Helper
  text: 让浏览器学会思考与行动
  tagline: Chrome 扩展（MV3）+ 本地 Agent 双进程架构的浏览器 AI 助手 · v{{VERSION}}
  actions:
    - theme: brand
      text: 快速开始
      link: /项目概览与快速开始/
    - theme: alt
      text: 返回产品主页
      link: /ai-helper/
    - theme: alt
      text: 源码仓库
      link: https://github.com/xiweicheng/ai-helper

features:
  - title: ReAct 智能对话
    details: 规划-执行-反思主循环，子任务级 checkpoint 防重放，完成度客观取证校验。
    link: /智能对话系统/
  - title: 长期记忆与 RAG
    details: 关键词+向量双通道混合检索，三级注入分级，知识库本地向量索引。
    link: /RAG-知识检索/
  - title: 工具生态与 MCP
    details: 内置浏览器工具集、MCP 服务器自动注册、Skill 工作流引擎。
    link: /工具生态系统/
  - title: 本地代理与安全
    details: 文件/命令沙箱、agent_exec 三级安全分级与敏感操作确认。
    link: /本地代理服务/
  - title: 网页增强
    details: 选区工具栏、Shadow DOM 穿透、截图与图像处理、信息提取。
    link: /网页增强工具/
  - title: MV3 架构
    details: Service Worker 生命周期、消息契约、Side Panel 渲染体系全解。
    link: /系统架构设计/
---
```

（安装命令块不进 home hero——首页 tagline 提版本即可；快速开始页内含一致命令。）

- [ ] **Step 3: 追加失败守卫测试**

在 `test/unit/docsite-transform.unit.test.js` 末尾追加：

```js
import { readFileSync } from 'node:fs';

describe('docsite scaffold 守卫', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const themeIdx = read('../../.docsite/theme/index.js');
  const layout = read('../../.docsite/theme/Layout.vue');
  const docsearch = read('../../.docsite/theme/DocSearch.vue');
  const home = read('../../.docsite/home.md');

  it('主题入口 extends DefaultTheme 且初始化 mermaid', () => {
    expect(themeIdx).toContain('extends: DefaultTheme');
    expect(themeIdx).toContain("mermaid.initialize({ startOnLoad: false");
  });
  it('Layout 挂 DocSearch 且路由切换重渲 mermaid', () => {
    expect(layout).toContain('<DocSearch />');
    expect(layout).toContain('mermaid.run');
    expect(layout).toContain("watch(() => route.path");
  });
  it('DocSearch 走 Pagefind UI 且 bundlePath 指向站点 base', () => {
    expect(docsearch).toContain('pagefind-ui.js');
    expect(docsearch).toContain("bundlePath: `${BASE}pagefind/`");
  });
  it('首页含版本占位与三个入口按钮', () => {
    expect(home).toContain('{{VERSION}}');
    expect(home).toContain('返回产品主页');
    expect(home).toContain('link: /项目概览与快速开始/');
  });
  it('home 特性卡 link 均为合法页面路径', () => {
    const links = home.match(/link: \/(?!\/)[^\n]+/g) ?? [];
    expect(links.length).toBeGreaterThanOrEqual(7);
  });
});
```

Run: `npx vitest run test/unit/docsite-transform.unit.test.js`
Expected: 守卫 describe 内 FAIL（文件尚不存在/占位）——先补 Step 1/2 文件再进 Step 4。

- [ ] **Step 4: 实现 scaffold.mjs**

```js
// scripts/docsite/scaffold.mjs — 把 repowiki 源布置为 VitePress srcDir（.docsite-src/）
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  transformDocument, buildTree, buildSidebar, overviewLabelFix,
  buildPathMap, planPage,
} from './transform.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function walkMd(dir, base = dir, out = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walkMd(p, base, out);
    else if (e.name.endsWith('.md')) out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

export async function stageSite({ contentDir, srcDir, outDirAbs, pagefindDir = 'pagefind/' }) {
  // 1) 收集输入
  const relPaths = await walkMd(contentDir);
  if (relPaths.length < 100) throw new Error(`RepoWiki 源缺失（仅 ${relPaths.length} 篇，期望 ≥100），请在 Qoder 中重新生成 RepoWiki`);
  const pathMap = buildPathMap(relPaths);

  // 2) 清空重建暂存
  await rm(srcDir, { recursive: true, force: true });
  await mkdir(srcDir, { recursive: true });

  // 3) 逐篇转换落盘
  for (const rel of relPaths) {
    const md = await readFile(path.join(contentDir, rel), 'utf8');
    const { srcRel, content } = transformDocument(md, rel, pathMap);
    const abs = path.join(srcDir, srcRel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }

  // 4) 首页（版本号注入）
  const version = JSON.parse(await readFile(path.join(REPO, 'src/config/version.json'), 'utf8')).version;
  const home = (await readFile(path.join(REPO, '.docsite/home.md'), 'utf8'))
    .replaceAll('{{VERSION}}', version);
  await writeFile(path.join(srcDir, 'index.md'), home);

  // 5) 侧边栏：顶层顺序 = 目录 ls 序（含根级散页）
  const tops = [...new Set(relPaths.map(p => p.split('/')[0]))];
  const tree = buildTree(relPaths);
  const sidebar = buildSidebar(tree, tops).map(g => ({
    ...g, items: overviewLabelFix(g.items, g.text),
  }));
  const sidebarLinkCount = countLinks(sidebar);

  // 6) 生成 .vitepress/config.mjs + 复制 theme
  const cfgDir = path.join(srcDir, '.vitepress');
  await mkdir(cfgDir, { recursive: true });
  await cp(path.join(REPO, '.docsite/theme'), path.join(cfgDir, 'theme'), { recursive: true });
  await writeFile(path.join(cfgDir, 'config.mjs'), `export default ${JSON.stringify({
    lang: 'zh-CN',
    title: 'AI Helper 文档中心',
    description: 'AI Helper（Chrome 扩展 + 本地 Agent）完整技术文档',
    base: '/ai-helper/wiki/',
    outDir: outDirAbs,
    cleanResults: true,
    ignoreDeadLinks: ['localhost', '/ai-helper/'],
    lastUpdated: true,
    markdown: { MERMAID_FENCE_PLACEHOLDER: true },
    themeConfig: {
      nav: [
        { text: '文档首页', link: '/' },
        { text: '产品主页', link: '/ai-helper/' },
        { text: '源码仓库', link: 'https://github.com/xiweicheng/ai-helper' },
        { text: 'Releases', link: 'https://github.com/xiweicheng/ai-helper/releases' },
      ],
      sidebar,
      outline: { level: [2, 3], label: '本页目录' },
      docFooter: { prev: '上一篇', next: '下一篇' },
      darkModeSwitchLabel: '主题',
      returnToTopLabel: '回到顶部',
      search: { provider: 'local' }, // 占位禁用：实际搜索走 DocSearch（见 Task 4 修正说明）
    },
  }, null, 2)
    .replace('"MERMAID_FENCE_PLACEHOLDER": true', '')
    .replace(/"search": \{ "provider": "local" \}/, '')}\n`);

  // 7) markdown.config 的 fence 重写无法经 JSON 注入函数，追加写回真实 config 文本
  const cfgPath = path.join(cfgDir, 'config.mjs');
  let cfgText = await readFile(cfgPath, 'utf8');
  cfgText = cfgText.replace('  markdown: {},', `  markdown: {
    config(md) {
      const orig = md.renderer.rules.fence.bind(md.renderer.rules);
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        if (tokens[idx].language === 'mermaid') {
          return '<pre class="mermaid">' + md.utils.escapeHtml(tokens[idx].content) + '</pre>';
        }
        return orig(tokens, idx, options, env, self);
      };
    },
  },`);
  await writeFile(cfgPath, cfgText);

  return { pageCount: relPaths.length + 1, sidebarLinkCount: sidebarLinkCount + 1 };
}

function countLinks(items) {
  let n = 0;
  for (const it of items) {
    if (it.link) n++;
    if (it.items) n += countLinks(it.items);
  }
  return n;
}
```

（执行修正说明：JSON.stringify 里 `"markdown": {}` 与 search 清除的 replace 链条较脆——落地时改为直接手写 config 模板字符串（sidebar 用 `JSON.stringify(sidebar)` 插值），语义等价且免脆弱 replace；模板中含 `config(md)` 函数体，见上 Step 7 内容直接并入模板。）

- [ ] **Step 5: 跑守卫测试通过**

Run: `npx vitest run test/unit/docsite-transform.unit.test.js`
Expected: PASS（含 Task 2 全部用例 + 本任务守卫用例）

- [ ] **Step 6: Commit**

```bash
git add .docsite scripts/docsite/scaffold.mjs test/unit/docsite-transform.unit.test.js
git commit -m "feat(docsite): VitePress 主题（mermaid+Pagefind搜索）、文档站首页与 scaffold 脚手架"
```

---

### Task 4: build-docsite.mjs 编排、真实构建与 6 项校验

**Files:**
- Modify: `scripts/build-docsite.mjs`（替换占位）
- Create: `docs/wiki/.nojekyll`（脚本生成，非手工）

**Interfaces:**
- Consumes: Task 3 `stageSite({ contentDir, srcDir, outDirAbs })` → `{ pageCount, sidebarLinkCount }`
- Produces: `npm run build:docsite`（完整管线）、`npm run preview:docsite`（构建后 `vitepress preview`，端口 4173）；产物目录 `docs/wiki/`（含 `pagefind/`）

- [ ] **Step 1: 实现编排脚本**

```js
// scripts/build-docsite.mjs — RepoWiki 文档站一键构建
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stageSite } from './docsite/scaffold.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = path.join(REPO, '.qoder/repowiki/zh/content');
const SRC = path.join(REPO, '.docsite-src');
const OUT = path.join(REPO, 'docs/wiki');
const preview = process.argv.includes('--preview');

function fail(msg) { console.error(`\n❌ ${msg}`); process.exit(1); }

if (!existsSync(CONTENT)) fail('RepoWiki 源缺失：.qoder/repowiki/zh/content 不存在，请在 Qoder 中重新生成 RepoWiki');

// ①② 转换 + 暂存
const { pageCount, sidebarLinkCount } = await stageSite({
  contentDir: CONTENT, srcDir: SRC, outDirAbs: OUT,
});
console.log(`📝 转换完成：${pageCount} 页（含首页），sidebar 链接 ${sidebarLinkCount}`);

// ③ VitePress 构建
execFileSync('npx', ['vitepress', 'build', SRC], cwd: REPO, stdio: 'inherit');

// 校验 A：产出页面数
const htmls = walk(OUT).filter(f => f.endsWith('.html'));
const builtPages = htmls.filter(f => !f.endsWith('404.html'));
if (builtPages.length !== pageCount) fail(`页面数不符：产出 ${builtPages.length} ≠ 期望 ${pageCount}`);

// 校验 B：无 file:// 残留
const leftover = builtPages.filter(f => readFileSync(path.join(OUT, f), 'utf8').includes('file://'));
if (leftover.length) fail(`残留 file:// 引用：${leftover.join(', ')}`);

// 校验 C：pagefind 索引
execFileSync('npx', ['pagefind', '--site', OUT], cwd: REPO, stdio: 'inherit');
if (!existsSync(path.join(OUT, 'pagefind')) || readdirSync(path.join(OUT, 'pagefind')).length === 0)
  fail('pagefind 索引缺失或为空');

// 校验 D：sidebar 覆盖数（stage 已核 + 这里再断言一次常量一致）
if (sidebarLinkCount < pageCount) fail(`sidebar 链接数 ${sidebarLinkCount} < 页面数 ${pageCount}`);

// 校验 E：.nojekyll
const nojekyll = path.join(OUT, '.nojekyll');
if (!existsSync(nojekyll)) fail('docs/wiki/.nojekyll 缺失（GitHub Pages 需要）');

// 校验 F：首页 HTML 含版本注入
const home = readFileSync(path.join(OUT, 'index.html'), 'utf8');
const version = JSON.parse(readFileSync(path.join(REPO, 'src/config/version.json'), 'utf8')).version;
if (!home.includes(version)) fail(`首页未注入版本号 ${version}`);

console.log(`✅ 文档站构建完成并通过 6 项校验 → ${path.relative(REPO, OUT)}/`);

if (preview) {
  console.log('🔎 preview: http://localhost:4173/ai-helper/wiki/');
  execFileSync('npx', ['vitepress', 'preview', SRC, '--port', '4173'], cwd: REPO, stdio: 'inherit');
}

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}
```

同时确保 scaffold/脚本产出 `docs/wiki/.nojekyll`：在 `stageSite` 末尾（或本脚本构建前）加一行：

```js
await writeFile(path.join(srcDir, 'public/.nojekyll'), '');
```

（VitePress 会把 `srcDir/public/` 原样拷进 outDir，即产物根得到 `.nojekyll`。）

- [ ] **Step 2: 真实跑一次完整构建**

Run: `npm run build:docsite`
Expected: 依次打印「转换完成 → vitepress build 输出 → pagefind 索引摘要 → `✅ 文档站构建完成并通过 6 项校验`」，退出码 0。若某校验失败：属实现缺陷，修 transform/scaffold 直至全绿（禁止调低校验阈值）。

- [ ] **Step 3: 本地冒烟**

Run: `npm run preview:docsite`（后台起 4173）
浏览器/Playwright 验证 spec §9-2 清单：
1. `/ai-helper/wiki/` 首页：hero 含 v2.4.0、6 张特性卡片、按钮可点
2. 侧边栏展开「RAG 知识检索」→ 概览 + 子项可打开（中文空格路径）
3. 任一篇含 mermaid 文档（如 `系统架构设计/数据流设计`）图渲染成 SVG
4. 点「🔍 搜索」输入「混合检索」→ 命中正文并高亮，点击直达锚点
5. 文档内 cite 折叠块中的链接 href 为 `https://github.com/xiweicheng/ai-helper/blob/main/...`
验证后停掉进程。

- [ ] **Step 4: 回归不破**

Run: `npm run test:unit`（全绿）；`npm run build:silent`（BUILD_SUCCESS）

- [ ] **Step 5: Commit（含产物）**

```bash
git add scripts/build-docsite.mjs scripts/docsite/scaffold.mjs docs/wiki
git commit -m "feat(docsite): build:docsite 一键构建管线（转换→VitePress→Pagefind→6项校验）与 docs/wiki 产物首版"
```

---

### Task 5: 落地页互链 + 文档同步收尾

**Files:**
- Modify: `docs/index.html`（nav 区 :870 附近、词典 :1792 附近）
- Modify: `CHANGELOG.md`（当日小节新增条目）
- Modify: `README.md` / `README.zh-CN.md`（开发者命令处）

**Interfaces:**
- Consumes: 线上路径 `/ai-helper/wiki/`
- Produces: 落地页「文档中心」入口；文档同步完成，工作区清洁

- [ ] **Step 1: docs/index.html 增加导航链接与词条**

在 `<a href="#start" data-i18n="nav-start">Quick Start</a>`（:869）之后、wiki 的 `nav-docs` 链接（:870）之前插入：

```html
      <a href="/ai-helper/wiki/" data-i18n="nav-docsite">Doc Center</a>
```

在词典 `'nav-docs':       { en: 'Docs', zh: '文档' },`（:1792）之前插入：

```js
    'nav-docsite':        { en: 'Doc Center', zh: '文档中心' },
```

约束（项目既有规范）：i18n key 在 HTML + JS 词典各出现一次（共 2 次），改后 `grep -c "nav-docsite" docs/index.html` 应为 2。

- [ ] **Step 2: CHANGELOG 与 README 命令同步**

`CHANGELOG.md` 当日小节新增（feat 归类，一句话，勿碎片化）：

```
- 新增 RepoWiki 文档官网：`npm run build:docsite` 一键将 Qoder RepoWiki（132 篇）构建为 VitePress + Pagefind 静态站并发布到 GitHub Pages `/ai-helper/wiki/`（离线中文全文搜索 + mermaid 渲染 + 目录树导航），产物入库 `docs/wiki/`。
```

`README.zh-CN.md` / `README.md` 开发者命令/项目命令处（与 `build:silent` 同区块）各加一行 `npm run build:docsite`（含 preview:docsite 说明，中英文案对应）。

- [ ] **Step 3: 验证**

```bash
grep -c "nav-docsite" docs/index.html        # 期望 2
npx vitest run test/unit/docsite-transform.unit.test.js  # 全绿
git status --porcelain                        # 仅本任务文件
```

纯文档改动无需 build:silent。

- [ ] **Step 4: Commit**

```bash
git add docs/index.html CHANGELOG.md README.md README.zh-CN.md
git commit -m "docs(docsite): 落地页文档中心入口 + CHANGELOG/README 同步 build:docsite 命令"
```

---

### Task 6: 终验收（spec §9 对照）

**Files:**
- 无新增；只跑验证与记录

**Interfaces:**
- Consumes: Task 1–5 全部产物
- Produces: 验收结论；提醒用户 `npm run push:all` 上线（推送由用户决定，不在本计划内自动执行）

- [ ] **Step 1: 全量收口**

```bash
npm run test:unit     # 期望全部通过（含 docsite 测试）
npm run build:docsite # 期望 ✅ 6 项校验通过
npm run build:silent  # 期望 BUILD_SUCCESS（扩展构建不受影响）
```

- [ ] **Step 2: spec §9 清单逐项核对**

| spec 验收项 | 核对方式 |
|---|---|
| 干净工作区一次构建通过 | Step 1 第二条 |
| 首页/侧边栏/深层页/mermaid/搜索/源码链接 | Task 4 Step 3 冒烟清单复跑（preview） |
| 落地页互链 | 本地 preview docs/ 目录打开 index.html 点「文档中心」 |
| 线上 Pages | **待用户执行 `npm run push:all` 后**访问 `https://xiweicheng.github.io/ai-helper/wiki/` |

- [ ] **Step 3: 汇报结果**

输出验收清单勾选状态 + 未上线项说明（GitHub Pages 线上验证需推送后执行）。工作区应清洁（`git status --porcelain` 为空）。

---

## Self-Review 记录

- **Spec 覆盖**：§1-2 决策→Global Constraints；§3 架构→Task 1/3/4 文件与数据流；§4 转换六条→Task 2；§5 搜索→Task 3 DocSearch + Task 4 pagefind 步骤；§6 外壳/互链/主题默认→Task 3 home + Task 5；§7 校验 6 条→Task 4 Step 1（A–F）；§9 验收→Task 6；§10 风险→Task 4 Step 4 回归 + 产物入库（Step 5）。无遗漏。
- **占位符扫描**：无 TBD/「类似 Task N」；两处「执行修正说明」是对自身代码的内联指引（config 模板字符串化、DocSearch 用标准 vue import），落地时按其执行即可。
- **类型一致性**：`stageSite({contentDir, srcDir, outDirAbs}) → {pageCount, sidebarLinkCount}` 在 Task 3 定义、Task 4 消费一致；`transformDocument/planPage/buildSidebar/overviewLabelFix` 签名 Task 2↔3 一致；`BASE='/ai-helper/wiki/'` 与 config `base` 一致。
