// 划词浮动菜单「一键复制选中内容」按钮的源码守卫测试。
//
// 需求：侧边栏基于选中内容提问的弹出菜单（showFloatingMenu 的 menu-header）右上角
// 增加复制图标按钮：点击复制选中文本，图标短暂变打勾后恢复（复用表格/代码块
// 同一套 copyToClipboard 工具），并隐藏菜单、不进对话流。
// 沿用仓库对 side_panel/index.js 的守卫写法（源文本断言接线与样式），
// 并对 i18n 中英键做成对校验（参照记忆中的 i18n 键成对校验惯例）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (p) => readFileSync(resolve(process.cwd(), p), 'utf8');

const indexSrc = read('src/side_panel/index.js');
const cssSrc = read('src/side_panel/styles.css');

describe('划词菜单复制按钮 - JS 接线', () => {
  const ensureFn = indexSrc.slice(
    indexSrc.indexOf('function ensureSelectionMenuEl'),
    indexSrc.indexOf('function showFloatingMenu')
  );
  const showFn = indexSrc.slice(
    indexSrc.indexOf('function showFloatingMenu'),
    indexSrc.indexOf('async function handleSelectionPromptClick')
  );

  test('menu-header 渲染复制按钮（带 i18n 动态查询 title，不缓存文案）', () => {
    expect(ensureFn).toContain('menu-copy-btn');
    expect(showFn).toContain("t('sidePanel.copySelectionTooltip')");
  });

  test('点击复制：复用全局 copyToClipboard（打勾反馈）+ 成功 toast + 复制后关闭菜单', () => {
    // 图标交换/打勾/恢复一律走既有工具，不目在菜单内重写一套
    expect(ensureFn).toContain('copyToClipboard(pendingText, copyBtn)');
    expect(ensureFn).not.toContain('navigator.clipboard.writeText(selectionMenuText)');
    // 菜单随复制即隐，打勾看不见 → 成功 toast 是唯一可见反馈，必须有
    expect(ensureFn).toContain("t('sidePanel.copySelectionDone')");
    const handler = ensureFn.slice(ensureFn.indexOf('addEventListener', ensureFn.indexOf('menu-copy-btn')));
    expect(handler).toContain('e.stopPropagation()');
    // 复制完同步收口：清选区 + 隐藏菜单（防 mouseup 定时器重新弹出）
    expect(handler).toContain('removeAllRanges');
    expect(handler.indexOf('copyToClipboard(')).toBeLessThan(handler.indexOf('window.hideFloatingMenu()'));
    // 收口会清 selectionMenuText，复制与 toast 必须用点击时刻的局部快照
    expect(handler).toContain('const pendingText = selectionMenuText');
    // toast 文案不得误读已被收口清空的模块变量
    expect(handler).not.toMatch(/showToast\(t\('sidePanel\.copySelectionDone'\)[^)]*selectionMenuText/);
    // 复制不是提问：不得进入对话流发送链路
    expect(handler).not.toContain('handleSelectionPromptClick');
  });

  test('按钮图标与表格/代码块复制按钮同一枚 GitHub 剪贴板 SVG', () => {
    // 菜单骨架内的剪贴板 path/viewBox 必须与代码块按钮同源（同一枚图标）
    expect(ensureFn).toContain('M0 6.75C0 5.784.784 5');
    expect(ensureFn).toContain('viewBox="0 0 16 16"');
  });

  test('菜单为 body 单例：复制按钮在骨架创建时绑定一次，重复 init 不累积监听', () => {
    // ensureSelectionMenuEl 内建按钮并 addEventListener；showFloatingMenu 只刷 title/文案
    expect(ensureFn).toMatch(/copyBtn\?\.addEventListener|copyBtn && copyBtn\.addEventListener/);
    // 按钮悬停提示在渲染时动态取词（i18n 热切换不缓存）
    expect(showFn).toContain(".title = t('sidePanel.copySelectionTooltip')");
  });

  test('右上角加号跳转提示词管理：新增/编辑划词菜单项', () => {
    expect(ensureFn).toContain('menu-add-btn');
    const handler = ensureFn.slice(
      ensureFn.indexOf("querySelector('.menu-add-btn')"),
      ensureFn.indexOf('document.body.appendChild(selectionMenuEl)')
    );
    // 打开管理弹窗（可勾选「在划词菜单显示」），并先收口菜单与选区
    expect(handler).toContain('showPromptManageModal');
    expect(handler).toContain('removeAllRanges');
    expect(handler.indexOf('hideFloatingMenu()')).toBeLessThan(handler.indexOf('showPromptManageModal'));
    // 加号只管理菜单，不触发提问
    expect(handler).not.toContain('handleSelectionPromptClick');
    expect(showFn).toContain("t('sidePanel.manageSelectionMenuTooltip')");
  });
});

describe('划词菜单复制按钮 - CSS 结构', () => {
  test('menu-header 改为 flex 两端对齐，标题在左按钮在右', () => {
    const rule = cssSrc.slice(
      cssSrc.indexOf('.selection-floating-menu .menu-header'),
      cssSrc.indexOf('.selection-floating-menu .menu-item {')
    );
    expect(rule).toContain('display: flex');
    expect(rule).toContain('justify-content: space-between');
  });

  test('复制按钮有独立样式（ghost 图标按钮 + hover 高亮 + copied 打勾绿色）', () => {
    expect(cssSrc).toMatch(/\.selection-floating-menu \.menu-copy-btn\s*\{[^}]*cursor:\s*pointer/);
    expect(cssSrc).toMatch(/\.selection-floating-menu \.menu-copy-btn:hover/);
    // 打勾态绿色反馈：与代码块 .code-copy-btn.copied 同 Token
    expect(cssSrc).toMatch(/\.selection-floating-menu \.menu-copy-btn\.copied\s*\{[^}]*--success-500/);
  });
});

describe('划词菜单行为对调 + 自定义问答入口', () => {
  const showFn = indexSrc.slice(
    indexSrc.indexOf('function showFloatingMenu'),
    indexSrc.indexOf('async function handleSelectionPromptClick')
  );
  const customHelper = indexSrc.slice(
    indexSrc.indexOf('function openCustomAskFromMenu'),
    indexSrc.indexOf('function showFloatingMenu')
  );

  test('整行点击默认走浮层解答，右侧图标才送入当前会话', () => {
    // 整行 → 浮层（不打断阅读）；图标 → 对话流
    expect(showFn).toContain('openSelectionPopupFromMenu(prompt, text, item)');
    expect(showFn).toContain('handleSelectionPromptClick(prompt, text)');
    expect(showFn).toContain("t('sidePanel.sendToChatTooltip')");
    // 旧的「浮层解答」图标提示语义已失效，不应残留
    expect(showFn).not.toContain('popupTooltip');
  });

  test('自定义项常驻菜单底部：提示词一条都没开也不早退', () => {
    expect(showFn).toContain("t('sidePanel.customAskMenuItem')");
    expect(showFn).not.toContain('no prompts enabled in menu');
    expect(indexSrc).toContain('function openSelectionPopupFromMenu');
  });

  test('点自定义问答 → 打开带输入框的浮层（不直接发请求）', () => {
    expect(customHelper).toContain('openSelectionCustomAskPopup');
    expect(customHelper).not.toContain('handleSelectionPromptClick');
  });

  test('新增 i18n 键在 zh/en 两个注册块成对存在', () => {
    const zhBlock = indexSrc.slice(
      indexSrc.indexOf("registerTranslations('zh'"),
      indexSrc.indexOf("registerTranslations('en'")
    );
    const enBlock = indexSrc.slice(indexSrc.indexOf("registerTranslations('en'"));
    for (const [name, block] of [['zh', zhBlock], ['en', enBlock]]) {
      expect(block, name).toContain('sendToChatTooltip');
      expect(block, name).toContain('customAskMenuItem');
    }
  });
});

describe('划词菜单复制按钮 - i18n 键成对', () => {
  // 新键跟随 index.js 模块内的 registerTranslations zh/en 双块惯例，不动共享 locales
  test('index.js 的 zh/en 注册块都含 tooltip 与 done 两个键', () => {
    const zhBlock = indexSrc.slice(
      indexSrc.indexOf("registerTranslations('zh'"),
      indexSrc.indexOf("registerTranslations('en'")
    );
    const enBlock = indexSrc.slice(indexSrc.indexOf("registerTranslations('en'"));
    for (const [name, block] of [['zh', zhBlock], ['en', enBlock]]) {
      expect(block, name).toContain('copySelectionTooltip');
      expect(block, name).toContain('copySelectionDone');
      expect(block, name).toContain('manageSelectionMenuTooltip');
    }
  });
});
