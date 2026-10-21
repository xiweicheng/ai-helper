// scripts/docsite/transform.mjs — RepoWiki 文档站纯转换函数（不含 fs/构建副作用）
export const BLOB_BASE = 'https://github.com/xiweicheng/ai-helper/blob/main/';

export function convertFileLinks(md) {
  return md.replace(/\[([^\]]*)\]\(file:\/\/\/?([^)\s]+)\)/g,
    (_m, _text, p) => `[${p}](${BLOB_BASE}${p})`);
}

export function wrapCiteBlock(md) {
  return md.replace(/<cite>\s*([\s\S]*?)\s*<\/cite>/g,
    (_m, inner) => `::: details 本文引用的源码文件\n${convertFileLinks(inner.trim())}\n:::`);
}

// 语料内除已消费的 <cite> 外无任何成对 HTML，所有 <xxx> 均为正文占位/引用；
// 但它们会被 VitePress 的 Vue 模板编译器当作未闭合开始标签而报错。把标签形态 token 按字面转义，
// 同时保护围栏代码块与行内代码，且不触及 <https://…> 自动链接（要求闭合 >）。
// 同理正文中的 {{...}} 会被 Vue 当作插值，一并按字面转义。
// 行内 code span 可跨软换行（如 ` ```mermaid\n` 这类展示围栏记号的写法），CommonMark 以「等长
// 反引号 run」配对定界，故按「连续非围栏 prose 行」整块 join 后用 run 长度感知扫描器切分，
// 只有 code span 之外的 prose 才交给 fn；围栏开关仍逐行判定。
function mapOutsideInlineCode(block, fn) {
  let out = '';
  let i = 0;
  const n = block.length;
  while (i < n) {
    if (block[i] === '`') {
      let j = i;
      while (j < n && block[j] === '`') j++;
      const openLen = j - i;
      let k = j;
      let close = -1;
      while (k < n) {
        if (block[k] === '`') {
          let m = k;
          while (m < n && block[m] === '`') m++;
          if (m - k === openLen) { close = k; break; }
          k = m;
        } else k++;
      }
      if (close >= 0) {
        out += block.slice(i, close + openLen);
        i = close + openLen;
        continue;
      }
      out += block.slice(i, j);
      i = j;
      continue;
    }
    let p = i;
    while (p < n && block[p] !== '`') p++;
    out += fn(block.slice(i, p));
    i = p;
  }
  return out;
}
function mapProseLines(md, fn) {
  const lines = md.split('\n');
  const out = [];
  const prose = [];
  let inFence = false;
  const flush = () => {
    if (!prose.length) return;
    out.push(mapOutsideInlineCode(prose.join('\n'), fn));
    prose.length = 0;
  };
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) { flush(); inFence = !inFence; out.push(line); continue; }
    if (inFence) { out.push(line); continue; }
    if (line.trim() === '') { flush(); out.push(line); continue; }
    prose.push(line);
  }
  flush();
  return out.join('\n');
}

export function escapeStrayTags(md) {
  return mapProseLines(md, s => s.replace(/<(\/?[A-Za-z][A-Za-z0-9_-]*(?:[ \t][^<>\n]*?)?)>/g, '&lt;$1&gt;'));
}

export function escapeMustaches(md) {
  return mapProseLines(md, s => s.replaceAll('{{', '&#123;&#123;').replaceAll('}}', '&#125;&#125;'));
}

export function sanitizeName(name) {
  return name.replaceAll(' ', '-');
}

export function extractFrontmatter(md) {
  const title = md.match(/^# (.+)$/m)?.[1]?.trim() ?? '';
  let description = '';
  const intro = md.match(/## 引言\n+([^\n#]+)/);
  const first = intro?.[1] ?? md.match(/\n\n(?![>|\-#])([^\n#>]+。)/)?.[1] ?? '';
  if (first) description = first.split('。')[0] + '。';
  return { title, description };
}

export function injectFrontmatter(md, { title, description }) {
  const esc = s => String(s).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
  return `---\ntitle: "${esc(title)}"\ndescription: "${esc(description)}"\n---\n${md}`;
}

export function planPage(relPath) {
  const segs = relPath.split('/');
  const stem = segs.at(-1).replace(/\.md$/, '');
  const cleanSegs = segs.slice(0, -1);
  const isOverview = cleanSegs.at(-1) === stem;
  // 所有页面产出为 <段...>/index.md，使尾斜杠 URL 在 GitHub Pages 静态托管下可靠解析
  const dirSegs = isOverview ? cleanSegs : [...cleanSegs, stem];
  const srcRel = [...dirSegs.map(sanitizeName), 'index.md'].join('/');
  const pagePath = '/' + dirSegs.map(sanitizeName).join('/') + '/';
  return { srcRel, pagePath };
}

export function buildPathMap(relPaths) {
  const map = new Map();
  for (const p of relPaths) map.set(p, planPage(p).pagePath);
  return map;
}

export function rewriteMdLinks(md, relDir, pathMap) {
  // relDir: 源文件所在目录的原始路径（未 sanitize），如 'RAG 知识检索'
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
  const sorted = [...relPaths].sort((a, b) => a.localeCompare(b, 'zh'));
  for (const p of sorted) {
    const segs = p.split('/');
    const file = segs.at(-1);
    const node = {
      name: file.replace(/\.md$/, ''),
      path: p,
      link: planPage(p).pagePath,
      children: [],
    };
    let parent = root;
    if (segs.length > 1) {
      // 逐级建目录节点
      const chain = [];
      for (let i = 0; i < segs.length - 1; i++) chain.push(segs.slice(0, i + 1).join('/'));
      for (const key of chain) {
        if (!dirIndex.has(key)) {
          const k = key.split('/');
          const dirNode = { name: k.at(-1), children: [] };
          dirIndex.set(key, dirNode);
          (dirIndex.get(k.slice(0, -1).join('/')) ?? root).children.push(dirNode);
        }
      }
      parent = dirIndex.get(chain.at(-1));
    }
    parent.children.push(node);
  }
  return root;
}

export function buildSidebar(tree, topOrder = []) {
  const tops = topOrder.length
    ? topOrder.map(t => {
        const c = tree.children.find(x => x.name === t);
        if (!c) throw new Error(`buildSidebar: topOrder 项未命中目录树: ${t}`);
        return c;
      })
    : tree.children;
  return tops.map(top => {
    // 根级散页：拍平为单条链接
    if (top.link) return { text: top.name, link: top.link };
    return { text: top.name, collapsed: true, items: collectGroupItems(top) };
  });
}

function collectGroupItems(dir) {
  const entries = dir.children.map(c => {
    if (c.link) {
      const isOverview = c.name === dir.name;
      return { overview: isOverview, item: { text: isOverview ? '概览' : c.name, link: c.link } };
    }
    return { overview: false, item: { text: c.name, collapsed: true, items: collectGroupItems(c) } };
  });
  entries.sort((a, b) => {
    if (a.overview !== b.overview) return a.overview ? -1 : 1;
    return a.item.text.localeCompare(b.item.text, 'zh');
  });
  return entries.map(e => e.item);
}

export function transformDocument(md, relPath, pathMap) {
  let out = wrapCiteBlock(md);
  out = convertFileLinks(out);
  const relDir = relPath.split('/').slice(0, -1).join('/');
  out = rewriteMdLinks(out, relDir, pathMap);
  out = escapeStrayTags(out);
  out = escapeMustaches(out);
  out = injectFrontmatter(out, extractFrontmatter(out));
  return { srcRel: planPage(relPath).srcRel, content: out };
}
