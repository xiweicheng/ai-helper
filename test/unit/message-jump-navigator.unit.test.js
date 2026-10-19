/**
 * message-jump-navigator.unit.test.js
 * 侧边栏「消息跳转」（▲▼ 按钮 + 用户问题列表）优化后的行为契约：
 * - 分组口径：箭头与问题列表都以「用户提问 + 其后所有回答」为一组，编号一一对应
 * - 当前定位：按视口顶边判定当前组，供高亮与 n/total 使用
 * - 钉住：问题列表可钉住，不因鼠标移出而收起
 * 分组/定位是纯函数，用真实遍历断言；面板接线在 node 环境无 DOM，改用源码守卫断言。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import {
  buildMessageJumpGroups,
  findActiveGroupIndex,
  resolveJumpTarget,
  formatQuestionPreview,
  renderQuestionListHtml,
} from '../../src/side_panel/utils.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf-8');

/** 构造一条消息节点替身：cls 为 class 列表，rect 为 getBoundingClientRect 结果 */
function msgEl(cls, rect = { top: 0, bottom: 0 }) {
  const classes = cls.split(' ');
  return {
    _cls: classes,
    classList: { contains: (c) => classes.includes(c) },
    getBoundingClientRect: () => rect,
  };
}

function containerOf(...els) {
  return { querySelectorAll: () => els };
}

describe('buildMessageJumpGroups：按用户提问分组', () => {
  it('用户提问起组，其后的回答归入同一组', () => {
    const u1 = msgEl('message user');
    const a1 = msgEl('message assistant');
    const a2 = msgEl('message assistant');
    const u2 = msgEl('message user');
    const a3 = msgEl('message assistant');

    const groups = buildMessageJumpGroups(containerOf(u1, a1, a2, u2, a3));

    expect(groups).toHaveLength(2);
    expect(groups[0].userElement).toBe(u1);
    expect(groups[0].elements).toEqual([u1, a1, a2]);
    expect(groups[1].userElement).toBe(u2);
    expect(groups[1].elements).toEqual([u2, a3]);
  });

  it('首组起点是容器内最早的消息，第一条提问之前的内容也能跳到', () => {
    const intro = msgEl('message assistant');
    const bubble = msgEl('user-context-bubble');
    const u1 = msgEl('message user');
    const a1 = msgEl('message assistant');

    const groups = buildMessageJumpGroups(containerOf(intro, bubble, u1, a1));

    expect(groups).toHaveLength(1);
    expect(groups[0].start).toBe(intro);
    expect(groups[0].userElement).toBe(u1);
    expect(groups[0].elements).toEqual([intro, bubble, u1, a1]);
  });

  it('网页上下文气泡挂在所属提问所在组内', () => {
    const u1 = msgEl('message user');
    const a1 = msgEl('message assistant');
    const bubble = msgEl('user-context-bubble');
    const u2 = msgEl('message user');

    const groups = buildMessageJumpGroups(containerOf(u1, a1, bubble, u2));

    expect(groups[0].elements).toEqual([u1, a1, bubble]);
    expect(groups[1].elements).toEqual([u2]);
  });

  it('没有用户提问时整体作为一组，保证上下箭头仍可用', () => {
    const a1 = msgEl('message assistant');
    const a2 = msgEl('message assistant');

    const groups = buildMessageJumpGroups(containerOf(a1, a2));

    expect(groups).toHaveLength(1);
    expect(groups[0].userElement).toBeNull();
    expect(groups[0].start).toBe(a1);
    expect(groups[0].elements).toEqual([a1, a2]);
  });

  it('空容器与缺失容器返回空数组', () => {
    expect(buildMessageJumpGroups(containerOf())).toEqual([]);
    expect(buildMessageJumpGroups(null)).toEqual([]);
  });
});

describe('findActiveGroupIndex：以视口顶边判定当前组', () => {
  const group = (bottom) => ({ start: msgEl('message user', { top: bottom - 100, bottom }) });

  it('返回第一个跨过顶边阈值（含被切一半）的组', () => {
    const groups = [group(-50), group(5), group(120), group(300)];
    // 阈值 10：第二组只露出 5px，尚不算「已进入视口」
    expect(findActiveGroupIndex(groups, 0, 10)).toBe(2);
  });

  it('阈值可覆盖，默认 10px', () => {
    const groups = [group(-50), group(50)];
    expect(findActiveGroupIndex(groups, 0)).toBe(1);
  });

  it('全部消息已滚到视口上方时返回 -1（无当前组）', () => {
    const groups = [group(-200), group(-50)];
    expect(findActiveGroupIndex(groups, 0, 10)).toBe(-1);
  });

  it('空分组返回 -1', () => {
    expect(findActiveGroupIndex([], 0, 10)).toBe(-1);
  });
});

describe('resolveJumpTarget：组内上一条/下一条', () => {
  it('向下跳到下一组', () => {
    expect(resolveJumpTarget(3, 0, 'next')).toBe(1);
  });

  it('向上跳到上一组', () => {
    expect(resolveJumpTarget(3, 2, 'prev')).toBe(1);
  });

  it('已在最后一条时向下没有目标', () => {
    expect(resolveJumpTarget(3, 2, 'next')).toBeNull();
  });

  it('已在最前一条时向上没有目标', () => {
    expect(resolveJumpTarget(3, 0, 'prev')).toBeNull();
  });

  it('无当前组时：向上回到最后一组，向下不动', () => {
    expect(resolveJumpTarget(3, -1, 'prev')).toBe(2);
    expect(resolveJumpTarget(3, -1, 'next')).toBeNull();
  });

  it('空列表返回 null', () => {
    expect(resolveJumpTarget(0, -1, 'prev')).toBeNull();
  });
});

describe('formatQuestionPreview：列表文案', () => {
  it('折叠空白并原样返回短问题', () => {
    expect(formatQuestionPreview('  请分析 \n 这个页面  ', 40)).toBe('请分析 这个页面');
  });

  it('超过上限时截断并补省略号', () => {
    const long = 'a'.repeat(50);
    const out = formatQuestionPreview(long, 40);
    expect(out).toHaveLength(41);
    expect(out.endsWith('…')).toBe(true);
    expect(out.startsWith('a'.repeat(40))).toBe(true);
  });

  it('纯空白返回空串，由调用方决定占位文案', () => {
    expect(formatQuestionPreview('   \n ', 40)).toBe('');
  });

  // 默认上限只是 DOM 体积兜底，必须远大于两行可见容量，否则可见的省略号来自 JS，
  // 与 CSS 的两行截断叠在一起就会出现「第二行已有省略号、下面还有半行」
  it('默认上限是体积兜底而非视觉截断', () => {
    const out = formatQuestionPreview('x'.repeat(500));
    expect(out.length).toBeGreaterThan(100);
    expect(out.length).toBeLessThan(500);
  });
});

describe('renderQuestionListHtml：列表结构（Header 固定 + 条目独立滚动区）', () => {
  const anchor = (id, text) => {
    const el = msgEl('message user', { top: 0, bottom: 0 });
    el.dataset = { messageId: id };
    el.childNodes = [{ nodeType: 3, textContent: text }];
    return el;
  };

  it('Header 在滚动区之外，条目包在 .chat-nav-question-list 里', () => {
    const groups = [
      { start: anchor('u1', '第一个问题'), userElement: null, elements: [] },
      { start: anchor('u2', '第二个问题'), userElement: null, elements: [] },
    ];
    groups[0].userElement = groups[0].start;
    groups[1].userElement = groups[1].start;

    const html = renderQuestionListHtml(groups, 1, false);

    const headerAt = html.indexOf('chat-nav-question-header');
    const listStart = html.indexOf('<div class="chat-nav-question-list">');
    const listEnd = html.indexOf('</div>', listStart);
    expect(headerAt).toBeGreaterThanOrEqual(0);
    expect(listStart).toBeGreaterThan(headerAt);
    // 两个条目都必须在滚动区内部
    expect(html.indexOf('data-message-id="u1"')).toBeGreaterThan(listStart);
    expect(html.indexOf('data-message-id="u2"')).toBeGreaterThan(listStart);
    // 条目在滚动区闭合之前，Header 不在其中
    expect(html.indexOf('data-message-id="u2"')).toBeLessThan(listEnd);
    expect(html.lastIndexOf('</div>')).toBeGreaterThan(listStart);
    expect(listEnd).toBeGreaterThan(listStart);
  });

  it('当前组条目带 current 类，头部显示位置', () => {
    const groups = [
      { start: anchor('u1', 'q1'), userElement: null, elements: [] },
      { start: anchor('u2', 'q2'), userElement: null, elements: [] },
    ];
    groups[0].userElement = groups[0].start;
    groups[1].userElement = groups[1].start;

    const html = renderQuestionListHtml(groups, 1, false);
    expect(html).toMatch(/chat-nav-question-item current" data-message-id="u2"/);
    expect(html).toContain('2 / 2');
    expect(html).not.toMatch(/chat-nav-question-item current" data-message-id="u1"/);
  });

  it('钉住态渲染出「取消钉住」按钮', () => {
    const groups = [{ start: anchor('u1', 'q1'), userElement: null, elements: [] }];
    groups[0].userElement = groups[0].start;
    const html = renderQuestionListHtml(groups, 0, true);
    expect(html).toContain('chat-nav-pin on');
    expect(html).toContain('取消钉住');
  });

  it('无当前组时头部只显示总数', () => {
    const groups = [{ start: anchor('u1', 'q1'), userElement: null, elements: [] }];
    groups[0].userElement = groups[0].start;
    const html = renderQuestionListHtml(groups, -1, false);
    expect(html).toContain('1 / 1');
    expect(html).not.toContain('chat-nav-question-item current');
  });

  it('条目文案含引号/尖括号时不破坏属性标记', () => {
    const groups = [{ start: anchor('a"1', '他说"你好"<script>'), userElement: null, elements: [] }];
    groups[0].userElement = groups[0].start;
    const html = renderQuestionListHtml(groups, 0, false);
    expect(html).toContain('data-message-id="a&quot;1"');
    expect(html).not.toContain('<script>');
  });

  // 条目是 <button>，且新版 Chromium 会把 -webkit-box 连同样式计算一起转成 flow-root：
  // 省略号改由 text-overflow 驱动，序号必须并入被 clamp 的文本节点内部，
  // 否则行首编号会被当成独立行盒参与截断计算。
  it('文案包在 .chat-nav-question-text 里，序号作为其内部首个行内节点', () => {
    const groups = [{ start: anchor('u1', '一个很长的问题'.repeat(10)), userElement: null, elements: [] }];
    groups[0].userElement = groups[0].start;
    const html = renderQuestionListHtml(groups, 0, false);
    expect(html).toMatch(/<span class="chat-nav-question-text"><span class="idx">1<\/span>/);
  });
});

describe('index.js 接线：箭头与问题列表共用同一分组口径', () => {
  const src = read('src/side_panel/index.js');
  const jumpFn = src.slice(
    src.indexOf('function jumpToMessage'),
    src.indexOf('function jumpToMessage') + 1200
  );
  const listFn = src.slice(
    src.indexOf('function buildQuestionList'),
    src.indexOf('function buildQuestionList') + 1400
  );
  // 高亮/滚动同步/条目点击都集中在跳转区块内
  const navSection = src.slice(
    src.indexOf('function paintActiveQuestion'),
    src.indexOf('// 全局键盘快捷键')
  );

  it('从 utils.js 引入分组与定位函数', () => {
    expect(src).toMatch(/import\s*\{[^}]*buildMessageJumpGroups[^}]*\}\s*from\s*'\.\/utils\.js'/s);
    expect(src).toMatch(/findActiveGroupIndex/);
    expect(src).toMatch(/resolveJumpTarget/);
  });

  it('jumpToMessage 改为按组跳转，不再直接使用混合选择器', () => {
    expect(jumpFn).toContain('buildMessageJumpGroups');
    expect(jumpFn).not.toContain("'message.user, .message.assistant, .user-context-bubble'");
    expect(src).not.toContain("querySelectorAll('.message.user, .message.assistant, .user-context-bubble')");
  });

  it('问题列表同样来自分组结果，编号与箭头一致', () => {
    expect(listFn).toContain('buildMessageJumpGroups');
    expect(listFn).not.toContain("querySelectorAll('#chatContainer .message.user')");
  });

  it('列表项按 messageId 定位，避免消息增删后索引错位', () => {
    expect(listFn).toContain('renderQuestionListHtml');
    expect(read('src/side_panel/utils.js')).toContain('data-message-id');
    expect(navSection).toContain('dataset.messageId');
    // 空 id 不参与匹配，否则会误命中第一组
    expect(navSection).toMatch(/if \(!item \|\| !item\.dataset\.messageId\) return/);
  });

  it('当前组条目高亮并滚动到可见', () => {
    expect(navSection).toMatch(/classList\.add\('current'\)/);
    expect(navSection).toContain("block: 'nearest'");
  });

  it('头部展示「当前位置 / 总数」', () => {
    expect(navSection).toContain("t('chat.navPosition'");
  });

  it('面板展开时跟随滚动更新当前组', () => {
    expect(navSection).toMatch(/chatContainer\.addEventListener\('scroll'/);
    expect(navSection).toMatch(/requestAnimationFrame/);
  });

  it('流式新增提问导致组数变化时重建列表，避免高亮错位', () => {
    expect(navSection).toMatch(/rendered !== navJumpGroups\.length/);
  });

  it('面板已展开时再次进入只同步定位，不重建列表打断钉住阅读', () => {
    const showFn = navSection.slice(navSection.indexOf('function showChatNav'));
    expect(showFn).toMatch(/contains\('expanded'\)\)\s*\{\s*updateActiveQuestion\(\);\s*return;/);
  });

  it('点击列表项后非钉住状态下自动收起', () => {
    expect(navSection).toMatch(/if \(!isNavPinned\) hideChatNav\(true\)/);
  });
});

describe('index.js 接线：钉住与 Esc', () => {
  const src = read('src/side_panel/index.js');

  it('热区点击切换钉住状态', () => {
    expect(src).toMatch(/let isNavPinned = false/);
    expect(src).toMatch(/function toggleNavPin/);
    expect(src).toMatch(/classList\.toggle\('pinned'/);
  });

  it('钉住后鼠标移出不收起', () => {
    expect(src).toMatch(/if \(isNavPinned\) return/);
  });

  it('Esc 取消钉住并收起面板', () => {
    expect(src).toMatch(/setNavPinned\(false\)/);
  });
});

describe('styles.css：面板实色不透明 + 当前项/钉住样式', () => {
  const css = read('src/side_panel/styles.css');
  const panelRule = css.slice(
    css.indexOf('.chat-nav-question-panel {'),
    css.indexOf('.chat-nav-question-panel.expanded')
  );

  it('面板底改为实色表面，去掉半透明穿透', () => {
    expect(panelRule).toMatch(/background:\s*var\(--bg-surface\)/);
    expect(panelRule).not.toMatch(/background:\s*rgba\(var\(--surface-rgb\),\s*0\.7/);
    expect(panelRule).not.toContain('backdrop-filter');
  });

  it('存在当前项高亮样式且使用品牌 token', () => {
    expect(css).toMatch(/\.chat-nav-question-item\.current\s*\{[^}]*var\(--brand-/s);
  });

  it('存在钉住态样式', () => {
    expect(css).toMatch(/\.chat-nav-question-panel\.pinned|\.chat-nav-hotzone\.pinned/);
  });

  it('条目改为两行截断，避免双重截断只剩十几个字', () => {
    const itemRule = css.slice(
      css.indexOf('.chat-nav-question-item {'),
      css.indexOf('.chat-nav-question-item:hover')
    );
    expect(itemRule).not.toContain('white-space: nowrap');
    expect(css).toMatch(/-webkit-line-clamp:\s*2/);
  });

  it('删除从未渲染的空态死样式', () => {
    expect(css).not.toContain('.chat-nav-question-empty');
  });

  it('面板自身不再是滚动容器，Header 才能固定', () => {
    expect(panelRule).not.toMatch(/overflow-y:\s*auto/);
    expect(panelRule).toMatch(/overflow:\s*hidden/);
    expect(panelRule).toMatch(/display:\s*flex/);
    expect(panelRule).toMatch(/flex-direction:\s*column/);
  });

  it('条目区是独立滚动容器且允许收缩', () => {
    const start = css.indexOf('.chat-nav-question-list {');
    expect(start).toBeGreaterThanOrEqual(0);
    const listRule = css.slice(start, css.indexOf('}', start));
    expect(listRule).toMatch(/overflow-y:\s*auto/);
    expect(listRule).toMatch(/min-height:\s*0/);
    // basis 必须是 auto：面板只有 max-height 没有显式 height，
    // basis 0 会让列表对 auto 高度容器的贡献为 0，整个列表塌成 0 高。
    expect(listRule).toMatch(/flex:\s*1\s+1\s+auto/);
  });

  it('Header 不参与收缩', () => {
    const start = css.indexOf('.chat-nav-question-header {');
    expect(start).toBeGreaterThanOrEqual(0);
    const headerRule = css.slice(start, css.indexOf('}', start));
    expect(headerRule).toMatch(/flex:\s*none/);
  });

  it('两行截断落在文本节点上，条目自身不再声明 clamp', () => {
    const start = css.indexOf('.chat-nav-question-text {');
    expect(start).toBeGreaterThanOrEqual(0);
    const textRule = css.slice(start, css.indexOf('}', start));
    expect(textRule).toMatch(/display:\s*-webkit-box/);
    expect(textRule).toMatch(/-webkit-box-orient:\s*vertical/);
    expect(textRule).toMatch(/-webkit-line-clamp:\s*2/);
    expect(textRule).toMatch(/overflow:\s*hidden/);
    // 新版 Chromium（130+）的省略号由 text-overflow 决定，缺它则第三行被硬切不画省略号
    expect(textRule).toMatch(/text-overflow:\s*ellipsis/);

    const itemStart = css.indexOf('.chat-nav-question-item {');
    const itemRule = css.slice(itemStart, css.indexOf('}', itemStart));
    expect(itemRule).not.toMatch(/-webkit-line-clamp/);
    // 条目自身保持块级普通流，不参与 flex 布局，行盒截断只发生在内部文本节点
    expect(itemRule).toMatch(/display:\s*block/);
    expect(itemRule).not.toMatch(/display:\s*flex/);
  });
});

describe('i18n：热区标题与钉住按钮文案双语齐备', () => {
  const keys = ['navHotzoneTitle', 'navPinLabel', 'navUnpinLabel', 'navPosition'];

  for (const locale of ['zh', 'en']) {
    const file = `src/shared/locales/${locale}.js`;
    if (!existsSync(join(ROOT, file))) continue;
    const src = read(file);
    const chatBlock = src.slice(src.indexOf('  chat: {'), src.indexOf('  toolPanel: {'));

    it(`${locale}：新增 key 已注册`, () => {
      for (const key of keys) {
        expect(chatBlock).toContain(`${key}:`);
      }
    });
  }

  it('zh 与 en 的 chat.nav* key 保持一致', () => {
    const navKeys = (block) => [...block.matchAll(/^[ ]*(nav[A-Z][A-Za-z]*):/gm)].map((m) => m[1]).sort();
    const zh = read('src/shared/locales/zh.js');
    const en = read('src/shared/locales/en.js');
    expect(navKeys(zh.slice(zh.indexOf('  chat: {'), zh.indexOf('  toolPanel: {')))).toEqual(
      navKeys(en.slice(en.indexOf('  chat: {'), en.indexOf('  toolPanel: {')))
    );
  });

  it('side_panel.html 热区标题走 i18n，不硬编码中文', () => {
    const html = read('side_panel.html');
    expect(html).toContain('data-i18n-title="chat.navHotzoneTitle"');
    expect(html).not.toContain('title="消息跳转"');
  });
});

describe('快捷键与提示文案对齐「问答组」口径', () => {
  const zh = read('src/shared/locales/zh.js');
  const en = read('src/shared/locales/en.js');

  it('快捷键表里的上下跳转文案改说「问题」，不再说「消息」', () => {
    expect(zh).toContain("gotoPrev: '跳转到上一个问题'");
    expect(zh).toContain("gotoNext: '跳转到下一个问题'");
    expect(en).toContain("gotoPrev: 'Jump to previous question'");
    expect(en).toContain("gotoNext: 'Jump to next question'");
  });

  it('▲▼ 按钮 tooltip 用同一口径', () => {
    expect(zh).toContain("navPrevTitle: '上一个问题 (Alt+↑)");
    expect(zh).toContain("navNextTitle: '下一个问题 (Alt+↓)");
    expect(en).toContain("navPrevTitle: 'Previous question (Alt+↑)");
    expect(en).toContain("navNextTitle: 'Next question (Alt+↓)");
  });

  it('side_panel.html 的行内兜底文案与 tooltip 同步，不留旧说法', () => {
    const html = read('side_panel.html');
    expect(html).not.toContain('上一条消息');
    expect(html).not.toContain('下一条消息');
    expect(html).toContain('跳转到上一个问题');
    expect(html).toContain('上一个问题 (Alt+↑)');
  });

  it('删除与 gotoPrev/gotoNext 重复且说法过时的死键', () => {
    for (const src of [zh, en]) {
      expect(src).not.toMatch(/^\s+prevMessage:/m);
      expect(src).not.toMatch(/^\s+nextMessage:/m);
    }
  });

  it('使用手册（zh/en）同步改口径', () => {
    expect(read('docs/zh/DOCUMENTATION.md')).toContain('| `Alt+↑/↓` | 在问题之间跳转（上一个 / 下一个） |');
    expect(read('docs/en/DOCUMENTATION.md')).toContain('| `Alt+↑/↓` | Jump between questions (previous / next) |');
  });

  // .wiki 是生成物，但已入库且对外可见，行文的旧口径同样会误导
  it('仓库 wiki 快捷键表（zh/en）同步改口径', () => {
    expect(read('.wiki/Configuration.md')).toContain('| `Alt+↑` / `Alt+↓` | 跳转到上一个 / 下一个问题 | Win / Mac |');
    expect(read('.wiki/Configuration-EN.md')).toContain('| `Alt+↑` / `Alt+↓` | Jump to previous / next question | Win / Mac |');
  });
});
