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

// 校验 B：无未转换的 file:// 死链（只拦截真正会导致浏览器死链的 href/src="file://"，
// 不拦截“讲述本管线本身”的元文档里作为主题文本/行内代码出现的 `file://` 字面提及）
const leftover = builtPages.filter(f => /(?:href|src)="file:\/\//.test(readFileSync(path.join(OUT, f), 'utf8')));
if (leftover.length) fail(`残留 file:// 死链：${leftover.join(', ')}`);

// 校验 C：pagefind 索引
execFileSync('npx', ['pagefind', '--site', OUT], { cwd: REPO, stdio: 'inherit' });
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
  execFileSync('npx', ['vitepress', 'preview', SRC, '--port', '4173'], { cwd: REPO, stdio: 'inherit' });
}
