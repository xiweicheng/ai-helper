// test/unit/docsite-transform.unit.test.js — RepoWiki 文档站转换纯函数
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  BLOB_BASE, convertFileLinks, wrapCiteBlock, sanitizeName,
  extractFrontmatter, injectFrontmatter, rewriteMdLinks,
  planPage, buildTree, buildSidebar, buildPathMap, transformDocument, escapeStrayTags, escapeMustaches,
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
  it('消化可选第三斜杠 file:/// 不产生 main// 或前导斜杠', () => {
    const out = convertFileLinks('[a.js](file:///agent/src/a.js)');
    expect(out).toBe('[agent/src/a.js](' + BLOB_BASE + 'agent/src/a.js)');
    expect(out).not.toContain('main//');
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
    expect(q.srcRel).toBe('RAG-知识检索/混合检索引擎/index.md');
    expect(q.pagePath).toBe('/RAG-知识检索/混合检索引擎/');
  });
  it('根级散页产出为 <stem>/index.md 以根除 cleanUrls 依赖', () => {
    const r = planPage('开发者指南.md');
    expect(r.srcRel).toBe('开发者指南/index.md');
    expect(r.pagePath).toBe('/开发者指南/');
  });
});

describe('frontmatter', () => {
  it('title 取首个 H1，description 取引言首句', () => {
    const { title, description } = extractFrontmatter('# 混合检索引擎\n\n## 引言\n本技术文档聚焦 X。后续段落\n');
    expect(title).toBe('混合检索引擎');
    expect(description).toBe('本技术文档聚焦 X。');
  });
  it('description 兜底跳过列表/表格/引用起始行，取后续真实介句', () => {
    const { description } = extractFrontmatter('# T\n\n- 列表项。\n\n> 引用句。\n\n| a | b |\n\n真实介绍句。\n');
    expect(description).toBe('真实介绍句。');
  });
  it('inject 产出的 YAML 头合法且置于最前', () => {
    const out = injectFrontmatter('# T\n', { title: 'T', description: '说"明"' });
    expect(out.startsWith('---\ntitle: "T"\ndescription: ')).toBe(true);
    expect(out.endsWith('# T\n')).toBe(true);
  });
  it('inject 先转义反斜杠再转义引号，避免破坍 YAML', () => {
    const out = injectFrontmatter('# T\n', { title: 'C:\\path', description: 'a"b' });
    expect(out).toContain('title: "C:\\\\path"');
    expect(out).toContain('description: "a\\"b"');
  });
});

describe('rewriteMdLinks', () => {
  it('兄弟 MD 链接改写为新页面路径并保留锚点', () => {
    const map = buildPathMap(['RAG 知识检索/RAG 知识检索.md', 'RAG 知识检索/混合检索引擎.md']);
    const out = rewriteMdLinks('[引擎](./混合检索引擎.md#引言)', 'RAG 知识检索', map);
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
  it('真实形态：根级散页与同名子目录并存时不丢页（默认序与显式 topOrder-stem 两路均覆盖）', () => {
    const realistic = [
      '开发者指南.md',
      '构建与部署/构建与部署.md',
      '构建与部署/子项一.md',
      'RAG 知识检索/RAG 知识检索.md',
    ];
    const collect = arr => { const l = []; (function w(a) { a.forEach(i => { if (i.link) l.push(i.link); if (i.items) w(i.items); }); })(arr); return l; };
    const tree = buildTree(realistic);
    expect(collect(buildSidebar(tree))).toHaveLength(realistic.length);
    const topOrder = [...new Set(realistic.map(p => p.split('/')[0].replace(/\.md$/, '')))];
    expect(collect(buildSidebar(tree, topOrder))).toHaveLength(realistic.length);
  });
  it('topOrder 未命中目录树时抛错而非静默丢页', () => {
    const tree = buildTree(['开发者指南.md', '构建与部署/构建与部署.md']);
    expect(() => buildSidebar(tree, ['不存在的顶层'])).toThrow(/topOrder/);
  });
});

describe('transformDocument 全链路', () => {
  it('产出无 file:// 残留且含 frontmatter/details', () => {
    const md = '<cite>\n- [s.js](file://agent/s.js)\n</cite>\n\n# 标题\n\n## 引言\n介绍。';
    const map = buildPathMap(['A.md']);
    const { content } = transformDocument(md, 'A.md', map);
    expect(content).not.toMatch(/file:\/\//);
    expect(content).toContain('::: details');
    expect(content.startsWith('---\ntitle: "标题"')).toBe(true);
  });
});

describe('escapeStrayTags', () => {
  it('转义正文占位标签为字面实体', () => {
    expect(escapeStrayTags('session:<id> 与 <all_urls> 权限')).toBe('session:&lt;id&gt; 与 &lt;all_urls&gt; 权限');
  });
  it('转义带属性 token', () => {
    expect(escapeStrayTags('使用 <textarea id="clipboard-textarea"> 元素')).toContain('&lt;textarea id="clipboard-textarea"&gt;');
  });
  it('保护行内代码与围栏代码块', () => {
    expect(escapeStrayTags('见 `<id>` 占位符')).toBe('见 `<id>` 占位符');
    const fenced = '```\n<img>\n```';
    expect(escapeStrayTags(fenced)).toBe(fenced);
  });
  it('不破坏自动链接与比较符号', () => {
    expect(escapeStrayTags('参考 <https://example.com> 且 a < b')).toBe('参考 <https://example.com> 且 a < b');
  });
  it('跨软换行的行内 code span 内的标签不被误转义（奇偶按整块 prose 判定）', () => {
    // 复刻语料真实写法：` ```mermaid\n` 是跨行 code span，其后 `<div class="mermaid">` 亦在行内代码中
    const md = [
      '- 提取与占位：将 ` ```mermaid',
      '` 内容转为 `<div class="mermaid">` 容器。',
    ].join('\n');
    const out = escapeStrayTags(md);
    expect(out).toContain('`<div class="mermaid">`');
    expect(out).not.toContain('&lt;div');
  });
});

describe('escapeMustaches', () => {
  it('转义正文中的模板插值 token 以免被 Vue 编译', () => {
    const out = escapeMustaches('支持 {{var}} 替换与 {{#if}} 条件渲染、{{/if}}。');
    expect(out).not.toContain('{{');
    expect(out).not.toContain('}}');
    expect(out).toContain('&#123;&#123;var&#125;&#125;');
  });
  it('保护行内代码与围栏中的花括号', () => {
    expect(escapeMustaches('写 `{{var}}` 即可')).toBe('写 `{{var}}` 即可');
    const fenced = '```\n{ "a": 1 }\n{{x}}\n```';
    expect(escapeMustaches(fenced)).toBe(fenced);
  });
  it('不影响普通单个花括号', () => {
    expect(escapeMustaches('返回 { a: 1 } 对象')).toBe('返回 { a: 1 } 对象');
  });
});

describe('docsite scaffold 守卫', () => {
  const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
  const themeIdx = read('../../.docsite/theme/index.js');
  const layout = read('../../.docsite/theme/Layout.vue');
  const docsearch = read('../../.docsite/theme/DocSearch.vue');
  const home = read('../../.docsite/home.md');
  const scaffold = read('../../scripts/docsite/scaffold.mjs');

  it('主题入口 extends DefaultTheme 且初始化 mermaid', () => {
    expect(themeIdx).toContain('extends: DefaultTheme');
    expect(themeIdx).toContain('mermaid.initialize({ startOnLoad: false');
  });
  it('Layout 挂 DocSearch 且路由切换重渲 mermaid', () => {
    expect(layout).toContain('<DocSearch />');
    expect(layout).toContain('mermaid.run');
    expect(layout).toContain('watch(() => route.path');
  });
  it('DocSearch 走 Pagefind UI 且 bundlePath 指向站点 base', () => {
    expect(docsearch).toContain('pagefind-ui.js');
    expect(docsearch).toContain("bundlePath: `${BASE}pagefind/`");
    // 面板持久挂载（v-show）：避免关闭后重开因 ui 缓存挂到已卸载 DOM 而空白
    expect(docsearch).toContain('v-show="open"');
    expect(docsearch).not.toContain('v-if="open"');
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
  it('站点 base 在 scaffold config 与 DocSearch 两处字面一致（防漂移）', () => {
    expect(scaffold).toContain("base: '/ai-helper/wiki/',");
    expect(docsearch).toContain("const BASE = '/ai-helper/wiki/'");
  });
});
