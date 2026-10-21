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
const { pageCount, sidebarLinkCount, sidebarLinks, expectedPagePaths } = await stageSite({
  contentDir: CONTENT, srcDir: SRC, outDirAbs: OUT,
});
console.log(`📝 转换完成：${pageCount} 页（含首页），sidebar 链接 ${sidebarLinkCount}`);

// ③ VitePress 构建
execFileSync('npx', ['vitepress', 'build', SRC], { cwd: REPO, stdio: 'inherit' });

function walk(dir, base = dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return out;
}

// 校验 A：产出页面数
const htmls = walk(OUT).filter(f => f.endsWith('.html'));
const builtPages = htmls.filter(f => !f.endsWith('404.html'));
if (builtPages.length !== pageCount) fail(`页面数不符：产出 ${builtPages.length} ≠ 期望 ${pageCount}`);

// 校验 G：产物无双重转义（Vue/HTML 二次编码污染 &amp;lt;/&amp;#123; 等，防止转换层跨行 code span 失配回归）
const dblEsc = builtPages.filter(f => /&amp;(lt|gt|#123|#125);/.test(readFileSync(path.join(OUT, f), 'utf8')));
if (dblEsc.length) fail(`产物存在双重转义：${dblEsc.join(', ')}`);

// 校验 B：转换后暂存 Markdown 不得残留 file:// 链接语法。markdown-it 会过滤 file: 协议，
// 未转换的 ](file:// 不会渲染成 <a href>、而是以字面文本呈现在页面，故断言点必须在暂存 MD（非产物 HTML）。
const mdFiles = walk(SRC).filter(f => f.endsWith('.md'));
const leftover = mdFiles.filter(f =>
  /\]\(file:\/\//.test(readFileSync(path.join(SRC, f), 'utf8').replace(/```[\s\S]*?```/g, '')));
if (leftover.length) fail(`未转换的 file:// 链接（暂存 MD）：${leftover.join(', ')}`);

// 校验 C：pagefind 索引（排除站点外壳，仅索引正文，避免导航/侧边栏文案污染搜索结果摘录与排序）
execFileSync('npx', ['pagefind', '--site', OUT,
  '--exclude-selectors', '.VPNav, .VPSidebar, .VPLocalNav, .VPFooter, .docsearch-btn, .docsearch-overlay'],
  { cwd: REPO, stdio: 'inherit' });
if (!existsSync(path.join(OUT, 'pagefind')) || readdirSync(path.join(OUT, 'pagefind')).length === 0)
  fail('pagefind 索引缺失或为空');

// 校验 D：sidebar 与页面双向差集（spec §7「列出差集」，比数量比较更能发现等量错挂/一条重复+一条缺失）
const missing = [...expectedPagePaths].filter(p => !sidebarLinks.has(p));
const extra = [...sidebarLinks].filter(l => !expectedPagePaths.has(l));
if (missing.length || extra.length) fail(`sidebar 差集 missing=[${missing.join(',')}] extra=[${extra.join(',')}]`);

// 校验 E：.nojekyll
const nojekyll = path.join(OUT, '.nojekyll');
if (!existsSync(nojekyll)) fail('docs/wiki/.nojekyll 缺失（GitHub Pages 需要）');

// 校验 F：首页 HTML 含版本注入
const home = readFileSync(path.join(OUT, 'index.html'), 'utf8');
const version = JSON.parse(readFileSync(path.join(REPO, 'src/config/version.json'), 'utf8')).version;
if (!home.includes(version)) fail(`首页未注入版本号 ${version}`);

console.log(`✅ 文档站构建完成并通过 7 项校验 → ${path.relative(REPO, OUT)}/`);

if (preview) {
  console.log('🔎 preview: http://localhost:4173/ai-helper/wiki/');
  execFileSync('npx', ['vitepress', 'preview', SRC, '--port', '4173'], { cwd: REPO, stdio: 'inherit' });
}
