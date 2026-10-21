// scripts/docsite/scaffold.mjs — 把 repowiki 源布置为 VitePress srcDir（.docsite-src/）
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  transformDocument, buildTree, buildSidebar, buildPathMap, planPage,
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

function countLinks(items) {
  let n = 0;
  for (const it of items) {
    if (it.link) n++;
    if (it.items) n += countLinks(it.items);
  }
  return n;
}

export async function stageSite({ contentDir, srcDir, outDirAbs }) {
  // 1) 收集输入
  const relPaths = await walkMd(contentDir);
  if (relPaths.length < 100) throw new Error(`RepoWiki 源缺失（仅 ${relPaths.length} 篇，期望 ≥100），请在 Qoder 中重新生成 RepoWiki`);
  const pathMap = buildPathMap(relPaths);

  // 2) 清空重建暂存
  await rm(srcDir, { recursive: true, force: true });
  await mkdir(srcDir, { recursive: true });

  // 3) 逐篇转换落盘（含 srcRel 唯一性守卫，防同名文件与同名目录并存互相覆盖）
  const seen = new Map();
  for (const rel of relPaths) {
    const md = await readFile(path.join(contentDir, rel), 'utf8');
    const { srcRel, content } = transformDocument(md, rel, pathMap);
    if (seen.has(srcRel)) throw new Error(`srcRel 冲突：${rel} 与 ${seen.get(srcRel)} 均产出 ${srcRel}`);
    seen.set(srcRel, rel);
    const abs = path.join(srcDir, srcRel);
    await mkdir(path.dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }

  // 4) 首页（版本号注入）
  const version = JSON.parse(await readFile(path.join(REPO, 'src/config/version.json'), 'utf8')).version;
  const home = (await readFile(path.join(REPO, '.docsite/home.md'), 'utf8'))
    .replaceAll('{{VERSION}}', version);
  await writeFile(path.join(srcDir, 'index.md'), home);

  // 5) 侧边栏：使用 buildTree 内部 localeCompare('zh') 序（不传 topOrder，见 ledger 裁定）
  const tree = buildTree(relPaths);
  const sidebar = buildSidebar(tree);
  const sidebarLinkCount = countLinks(sidebar);
  // 校验 D 用：sidebar 中实际链接集合 与 页面应有路径集合（供双向差集，spec §7「列出差集」）
  const sidebarLinks = new Set();
  (function collect(items) {
    for (const it of items) { if (it.link) sidebarLinks.add(it.link); if (it.items) collect(it.items); }
  })(sidebar);
  const expectedPagePaths = new Set(relPaths.map(r => planPage(r).pagePath));

  // 6) 生成 .vitepress/config.mjs + 复制 theme
  const cfgDir = path.join(srcDir, '.vitepress');
  await mkdir(cfgDir, { recursive: true });
  await rm(path.join(cfgDir, 'theme'), { recursive: true, force: true });
  await cp(path.join(REPO, '.docsite/theme'), path.join(cfgDir, 'theme'), { recursive: true });

  const configText = `export default {
  lang: 'zh-CN',
  title: 'AI Helper 文档中心',
  description: 'AI Helper（Chrome 扩展 + 本地 Agent）完整技术文档',
  base: '/ai-helper/wiki/',
  outDir: ${JSON.stringify(outDirAbs)},
  ignoreDeadLinks: ['localhost', '/ai-helper/'],
  lastUpdated: true,
  markdown: {
    config(md) {
      const orig = md.renderer.rules.fence.bind(md.renderer.rules);
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const lang = (tokens[idx].info || '').trim().split(/\s+/)[0];
        if (lang === 'mermaid') {
          return '<pre class="mermaid">' + md.utils.escapeHtml(tokens[idx].content) + '</pre>';
        }
        return orig(tokens, idx, options, env, self);
      };
    },
  },
  themeConfig: {
    appearance: 'light',
    nav: [
      { text: '文档首页', link: '/' },
      { text: '产品主页', link: 'https://xiweicheng.github.io/ai-helper/' },
      { text: '源码仓库', link: 'https://github.com/xiweicheng/ai-helper' },
      { text: 'Releases', link: 'https://github.com/xiweicheng/ai-helper/releases' },
    ],
    sidebar: ${JSON.stringify(sidebar, null, 2)},
    outline: { level: [2, 3], label: '本页目录' },
    docFooter: { prev: '上一篇', next: '下一篇' },
    darkModeSwitchLabel: '主题',
    returnToTopLabel: '回到顶部',
  },
};
`;
  await writeFile(path.join(cfgDir, 'config.mjs'), configText);

  // 7) public/.nojekyll → VitePress 会原样拷进 outDir 根（GitHub Pages 禁用 Jekyll 需要）
  await mkdir(path.join(srcDir, 'public'), { recursive: true });
  await writeFile(path.join(srcDir, 'public/.nojekyll'), '');

  return { pageCount: relPaths.length + 1, sidebarLinkCount: sidebarLinkCount + 1, sidebarLinks, expectedPagePaths };
}
