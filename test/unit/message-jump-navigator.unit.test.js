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
  formatNavTime,
  getQuestionPreview,
  filterJumpGroups,
  NAV_SEARCH_MIN_GROUPS,
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

  // 条目是 <button>，新版 Chromium 会把 -webkit-box 连同样式计算一起转成 flow-root，
  // 省略号改由 text-overflow 驱动。序号必须是 clamp 文本节点的兄弟列（而非内联于其内部），
  // 否则正文折行的第二行会回退到 x=0、顶到序号下方而非与第一行文字左对齐。
  it('序号是 .chat-nav-question-text 的兄弟列，正文不再内嵌序号', () => {
    const groups = [{ start: anchor('u1', '一个很长的问题'.repeat(10)), userElement: null, elements: [] }];
    groups[0].userElement = groups[0].start;
    const html = renderQuestionListHtml(groups, 0, false);
    expect(html).toMatch(/<span class="idx">1<\/span><span class="chat-nav-question-text">/);
    // 序号不得再出现在 clamp 文本节点内部
    expect(html).not.toMatch(/chat-nav-question-text"><span class="idx"/);
  });
});

describe('message-jump-nav.js 接线：箭头与问题列表共用同一分组口径', () => {
  const navModule = read('src/side_panel/message-jump-nav.js');
  const jumpFn = navModule.slice(
    navModule.indexOf('function jumpToMessage'),
    navModule.indexOf('function flashNavBlocked')
  );
  const listFn = navModule.slice(
    navModule.indexOf('function buildQuestionList'),
    navModule.indexOf('// ========== 展开 / 收起 / 钉住 ==========')
  );
  // 高亮/滚动同步/条目点击都集中在模块接线区
  const navSection = navModule.slice(navModule.indexOf('function paintActiveQuestion'));

  it('从 utils.js 引入分组与定位函数', () => {
    expect(navModule).toMatch(/import\s*\{[^}]*buildMessageJumpGroups[^}]*\}\s*from\s*'\.\/utils\.js'/s);
    expect(navModule).toMatch(/findActiveGroupIndex/);
    expect(navModule).toMatch(/resolveJumpTarget/);
  });

  it('jumpToMessage 按组跳转，不再直接使用混合选择器', () => {
    expect(jumpFn).toContain('buildMessageJumpGroups');
    expect(jumpFn).not.toContain("'message.user, .message.assistant, .user-context-bubble'");
    expect(navModule).not.toContain("querySelectorAll('.message.user, .message.assistant, .user-context-bubble')");
  });

  it('问题列表同样来自分组结果，编号与箭头一致', () => {
    expect(listFn).toContain('buildMessageJumpGroups');
    expect(listFn).toContain('renderQuestionListHtml');
  });

  it('搜索框在 IME 组合期间不重建列表，中文上屏后才过滤', () => {
    // input 事件要先短路 isComposing，否则拼音未上屏就 innerHTML 重建、销毁组合中的 input
    expect(listFn).toMatch(/addEventListener\('input', \(e\) => \{\s*[^}]*if \(e\.isComposing\) return;/s);
    // 组合提交后由 compositionend 触发过滤
    expect(listFn).toMatch(/addEventListener\('compositionend',\s*applyQuery\)/);
  });

  it('列表项按 messageId 定位，避免消息增删后索引错位', () => {
    expect(read('src/side_panel/utils.js')).toContain('data-message-id');
    expect(navSection).toContain('dataset.messageId');
    // 空 id 不参与匹配，否则会误命中第一组
    expect(navSection).toMatch(/if \(!item \|\| !item\.dataset\.messageId\) return/);
  });

  it('当前组条目高亮，但只在指针不在面板内时才滚列表到可见', () => {
    expect(navSection).toMatch(/classList\.add\('current'\)/);
    // 自动滚列表必须只看 pointerInPanel，否则手动滚列表找目标会被拽回旧当前项
    expect(navSection).toMatch(/if \(!pointerInPanel && activeIndex >= 0 && activeItem\) activeItem\.scrollIntoView\(\{ block: 'nearest' \}\)/);
    // 不能掺入“焦点在面板内”判定：点过条目后焦点滞留会长期屏蔽跟随，滚对话时当前项不露出
    expect(navSection).not.toMatch(/activeElement && chatNavQuestionPanel\.contains/);
    expect(navSection).not.toMatch(/userInPanel/);
  });

  it('面板 mouseenter/leave 维护 pointerInPanel 标志', () => {
    expect(navSection).toMatch(/addEventListener\('mouseenter', \(\) => \{ pointerInPanel = true; showChatNav\(\); \}\)/);
    expect(navSection).toMatch(/addEventListener\('mouseleave', \(\) => \{ pointerInPanel = false; hideChatNav\(false\); \}\)/);
  });

  it('过滤态按原始组下标比对高亮，不能按渲染位置', () => {
    expect(navSection).toMatch(/Number\(item\.dataset\.groupIndex\)/);
  });

  it('头部展示「当前位置 / 总数」', () => {
    expect(navSection).toContain("t('chat.navPosition'");
  });

  it('面板展开时跟随滚动更新当前组', () => {
    expect(navSection).toMatch(/chatContainer\.addEventListener\('scroll'/);
    expect(navSection).toMatch(/requestAnimationFrame/);
  });

  it('流式新增提问导致组数变化时重建列表，避免高亮错位', () => {
    expect(navSection).toMatch(/renderedAll !== navJumpGroups\.length/);
  });

  it('面板已展开时再次进入只同步定位，不重建列表打断钉住阅读', () => {
    const showFn = navSection.slice(navSection.indexOf('function showChatNav'));
    expect(showFn).toMatch(/contains\('expanded'\)\)\s*\{\s*updateActiveQuestion\(\);\s*return;/);
  });

  it('点击列表项后非钉住状态下自动收起（并把焦点交回把手）', () => {
    expect(navSection).toMatch(/if \(!isNavPinned\) \{[\s\S]*?collapseChatNavReturningFocus\(\)/);
  });

  it('收起并交回焦点时屏蔽把手 focus 重展开，避免收起即弹回', () => {
    expect(navModule).toMatch(/function collapseChatNavReturningFocus/);
    expect(navModule).toMatch(/suppressFocusExpand = true;[\s\S]*?chatNavHotzone\.focus\([\s\S]*?suppressFocusExpand = false;/);
    // 把手 focus 监听要先判断抑制位
    expect(navModule).toMatch(/addEventListener\('focus', \(\) => \{\s*if \(suppressFocusExpand\) return;/);
  });
});

describe('message-jump-nav.js 接线：钉住、键盘可达与边界反馈', () => {
  const navModule = read('src/side_panel/message-jump-nav.js');

  it('热区点击切换钉住状态', () => {
    expect(navModule).toMatch(/let isNavPinned = false/);
    expect(navModule).toMatch(/function toggleNavPin/);
    expect(navModule).toMatch(/classList\.toggle\('pinned'/);
  });

  it('钉住后鼠标移出不收起', () => {
    expect(navModule).toMatch(/if \(isNavPinned\) return/);
  });

  it('钉住态同步 aria-pressed', () => {
    expect(navModule).toMatch(/setAttribute\('aria-pressed', String\(pinned\)\)/);
  });

  it('键盘可达：把手聚焦即展开，Enter/Space 切钉住', () => {
    expect(navModule).toMatch(/chatNavHotzone\.addEventListener\('focus', [\s\S]*?showChatNav\(\)/);
    expect(navModule).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  });

  it('键盘可达：列表内 ↑/↓ 移动焦点', () => {
    expect(navModule).toMatch(/e\.key === 'ArrowDown'/);
    expect(navModule).toMatch(/e\.key === 'ArrowUp'/);
    expect(navModule).toMatch(/items\[next\]\.focus\(\)/);
  });

  it('键盘可达：焦点在把手/按钮/列表内时鼠标移出不收起', () => {
    expect(navModule).toMatch(/function navContainsFocus/);
    expect(navModule).toMatch(/if \(navContainsFocus\(\)\) return/);
  });

  it('边界反馈：跳不动时给按钮加 blocked 类', () => {
    expect(navModule).toMatch(/function flashNavBlocked/);
    expect(navModule).toMatch(/classList\.add\('blocked'\)/);
    expect(navModule).toMatch(/return 'blocked'/);
  });

  it('Esc 优先交给导航处理（清搜索词 / 退钉住 / 收起）', () => {
    expect(navModule).toMatch(/function handleEscape/);
    expect(navModule).toMatch(/setNavPinned\(false\)/);
  });
});

describe('index.js 接线：改用 initMessageJumpNav 模块', () => {
  const src = read('src/side_panel/index.js');

  it('从模块引入并初始化，不再内联接线', () => {
    expect(src).toMatch(/import\s*\{\s*initMessageJumpNav\s*\}\s*from\s*'\.\/message-jump-nav\.js'/);
    expect(src).toMatch(/const navApi = initMessageJumpNav\(\)/);
    expect(src).not.toMatch(/function paintActiveQuestion/);
    expect(src).not.toMatch(/function buildQuestionList/);
  });

  it('全局快捷键委托到 navApi', () => {
    expect(src).toMatch(/navApi\.handleEscape\(\)/);
    expect(src).toMatch(/navApi\.jumpToMessage\(/);
    expect(src).toMatch(/navApi\.updateActiveQuestion\(\)/);
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

  it('过滤无命中时渲染空态，空态样式存在且被 utils 引用', () => {
    expect(css).toMatch(/\.chat-nav-question-empty\s*\{/);
    expect(read('src/side_panel/utils.js')).toContain('chat-nav-question-empty');
  });

  it('搜索框、时间、键盘焦点环样式齐备', () => {
    expect(css).toMatch(/\.chat-nav-question-filter\s*\{/);
    expect(css).toMatch(/\.chat-nav-question-search\s*\{/);
    expect(css).toMatch(/\.chat-nav-question-time\s*\{/);
    expect(css).toMatch(/\.chat-nav-hotzone:focus-visible\s*\{/);
    expect(css).toMatch(/\.chat-nav-question-item:focus-visible\s*\{/);
  });

  it('边界反馈抖动动画存在，减少动态效果下退化为无位移', () => {
    expect(css).toMatch(/@keyframes chatNavShake/);
    expect(css).toMatch(/\.chat-nav-btn\.blocked\s*\{[^}]*animation:\s*chatNavShake/s);
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]{0,400}\.chat-nav-btn\.blocked\s*\{[^}]*animation:\s*none/s);
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
    // 文本在 flex 行内占剩余宽度，min-width:0 是两行截断/省略号在 flex 下生效的前提
    expect(textRule).toMatch(/flex:\s*1\s+1\s+auto/);
    expect(textRule).toMatch(/min-width:\s*0/);

    const itemStart = css.indexOf('.chat-nav-question-item {');
    const itemRule = css.slice(itemStart, css.indexOf('}', itemStart));
    expect(itemRule).not.toMatch(/-webkit-line-clamp/);
    // 条目是横向 flex 三列（序号|正文|时间），baseline 让序号/时间与正文首行同基线
    expect(itemRule).toMatch(/display:\s*flex/);
    expect(itemRule).toMatch(/align-items:\s*baseline/);

    // 序号是独立列：flex:none 不随正文伸缩，min-width 统一个位/十位行的正文左边界
    const idxStart = css.indexOf('.chat-nav-question-item .idx {');
    const idxRule = css.slice(idxStart, css.indexOf('}', idxStart));
    expect(idxRule).toMatch(/flex:\s*none/);
    expect(idxRule).toMatch(/min-width:/);
    expect(idxRule).not.toMatch(/display:\s*inline-block/);
  });

  it('提问时间为右侧独立列：不压缩、单行不换行', () => {
    const start = css.indexOf('.chat-nav-question-time {');
    expect(start).toBeGreaterThanOrEqual(0);
    const timeRule = css.slice(start, css.indexOf('}', start));
    expect(timeRule).toMatch(/flex:\s*none/);
    expect(timeRule).toMatch(/white-space:\s*nowrap/);
    // 不再用旧的「下方一行 + padding-left 越过序号」定位
    expect(timeRule).not.toMatch(/padding-left:/);
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

describe('formatNavTime：条目提问时间', () => {
  const p = (n) => String(n).padStart(2, '0');
  it('缺失或非法时间返回空串', () => {
    expect(formatNavTime('')).toBe('');
    expect(formatNavTime(null)).toBe('');
    expect(formatNavTime('not-a-date')).toBe('');
  });
  it('当天只显示 HH:MM', () => {
    const d = new Date();
    const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T13:05:00`;
    expect(formatNavTime(iso)).toBe('13:05');
  });
  it('跨天补 M-D', () => {
    expect(formatNavTime('2000-03-04T08:09:00')).toBe('3-4 08:09');
  });
});

describe('getQuestionPreview：文本 → 附件名 → 图片数 → 占位', () => {
  const anchor = ({ text = '', files = null, images = 0 } = {}) => {
    const el = { dataset: {}, childNodes: [] };
    if (text) el.childNodes.push({ nodeType: 3, textContent: text });
    if (files !== null) el.dataset.attachedFiles = files;
    el.querySelectorAll = (sel) => (sel === '.user-message-image' ? new Array(images).fill({}) : []);
    return el;
  };
  it('有直接文本时优先用文本', () => {
    expect(getQuestionPreview(anchor({ text: '  请总结  this 页面 ' }))).toBe('请总结 this 页面');
  });
  it('无文本取首个附件文件名，多附件补 +N', () => {
    expect(getQuestionPreview(anchor({ files: JSON.stringify([{ name: 'a.pdf' }, { name: 'b.png' }]) }))).toBe('a.pdf +1');
    expect(getQuestionPreview(anchor({ files: JSON.stringify([{ name: 'only.md' }]) }))).toBe('only.md');
  });
  it('无文本无附件时按图片张数', () => {
    expect(getQuestionPreview(anchor({ images: 2 }))).toContain('2');
  });
  it('全空回落到占位文案', () => {
    expect(getQuestionPreview(anchor({}))).toContain('图片/附件');
  });
  it('非法 attachedFiles JSON 当无附件，不抛错', () => {
    expect(() => getQuestionPreview(anchor({ files: '{bad json' }))).not.toThrow();
  });
});

describe('filterJumpGroups：搜索过滤保留原始组序', () => {
  const g = (text) => {
    const el = { dataset: { messageId: text }, childNodes: [{ nodeType: 3, textContent: text }] };
    return { start: el, userElement: el, elements: [] };
  };
  const groups = [g('苹果派'), g('香蕉'), g('Apple 派')];
  it('空关键词返回全部并保留原始下标', () => {
    expect(filterJumpGroups(groups, '')).toEqual([
      { group: groups[0], index: 0 },
      { group: groups[1], index: 1 },
      { group: groups[2], index: 2 },
    ]);
  });
  it('大小写不敏感子串命中，编号仍是全局第几组', () => {
    const out = filterJumpGroups(groups, 'apple');
    expect(out).toHaveLength(1);
    expect(out[0].index).toBe(2);
  });
  it('无命中返回空数组', () => {
    expect(filterJumpGroups(groups, 'zzz')).toEqual([]);
  });
});

describe('renderQuestionListHtml：搜索框 / 时间 / aria-current / 过滤态', () => {
  const group = (id, text, timestamp) => {
    const el = msgEl('message user', { top: 0, bottom: 0 });
    el.dataset = { messageId: id };
    if (timestamp) el.dataset.timestamp = timestamp;
    el.childNodes = [{ nodeType: 3, textContent: text }];
    return { start: el, userElement: el, elements: [] };
  };
  const many = (n) => Array.from({ length: n }, (_, i) => group(`u${i}`, `第${i}个问题`));

  it('组数达到阈值才渲染搜索框', () => {
    expect(renderQuestionListHtml(many(NAV_SEARCH_MIN_GROUPS - 1), -1, false)).not.toContain('chat-nav-question-search');
    expect(renderQuestionListHtml(many(NAV_SEARCH_MIN_GROUPS), -1, false)).toContain('chat-nav-question-search');
  });
  it('当前项 aria-current=true，其余 false', () => {
    const html = renderQuestionListHtml(many(3), 1, false);
    expect(html).toMatch(/data-message-id="u1"[^>]*aria-current="true"/);
    expect(html).toMatch(/data-message-id="u0"[^>]*aria-current="false"/);
  });
  it('有 timestamp 时渲染可见时间', () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    const iso = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T09:30:00`;
    const html = renderQuestionListHtml([group('u1', '带时间', iso)], 0, false);
    expect(html).toContain('chat-nav-question-time');
    expect(html).toContain('09:30');
  });
  it('过滤态只渲染命中条目，idx 仍是原始组序', () => {
    const html = renderQuestionListHtml(many(6), -1, false, '第5个');
    expect(html).toContain('data-message-id="u5"');
    expect(html).not.toContain('data-message-id="u0"');
    expect(html).toMatch(/<span class="idx">6<\/span>/);
  });
  it('过滤无命中时渲染空态', () => {
    const html = renderQuestionListHtml(many(6), -1, false, '不存在的关键词zzz');
    expect(html).toContain('chat-nav-question-empty');
  });
});
