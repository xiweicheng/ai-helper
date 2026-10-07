// @vitest-environment jsdom
// 内嵌下拉（section-select）搜索过滤 + 打开聚焦交互的单测
import { describe, test, expect, beforeEach } from 'vitest';
import {
  closeAllSectionSelects,
  sectionSelectSearchHtml,
  filterSectionSelectList,
} from '../../src/side_panel/section-select.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="section-select" id="select">
      <div class="section-select-row" id="row"><span id="rowValue">当前值</span></div>
      <div class="section-select-list" id="list"></div>
    </div>`;
  const list = document.getElementById('list');
  list.innerHTML = `${sectionSelectSearchHtml()
  }<div class="model-option" data-value="deepseek-v4-pro"><span class="model-option-left">deepseek-v4-pro</span><span class="model-ctx-badge">128k</span></div>`
    + '<div class="model-option" data-value="kimi-k2"><span class="model-option-left">kimi-k2</span></div>'
    + '<div class="model-option" data-value="GLM-5"><span class="model-option-left">GLM-5</span></div>';
  return { list, row: document.getElementById('row') };
}

function optionOf(list, value) {
  return list.querySelector(`.model-option[data-value="${value}"]`);
}

function openList(row) {
  row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

beforeEach(() => {
  closeAllSectionSelects();
});

describe('sectionSelectSearchHtml', () => {
  test('生成带 i18n 占位符的搜索输入框', () => {
    const html = sectionSelectSearchHtml();
    expect(html).toContain('class="section-select-search"');
    expect(html).toContain('type="search"');
    expect(html).toContain('data-i18n-placeholder="sectionSelect.searchPlaceholder"');
    // 中文词典已注册该文案（key 缺失时 t() 原样返回 key，此处用真实文案兜底验证）
    expect(html).toContain('输入关键字过滤');
  });
});

describe('filterSectionSelectList（关键字过滤）', () => {
  test('不区分大小写、包含匹配切换选项显示', () => {
    const { list } = setupDom();

    filterSectionSelectList(list, 'DEEP');

    expect(optionOf(list, 'deepseek-v4-pro').style.display).toBe('');
    expect(optionOf(list, 'kimi-k2').style.display).toBe('none');
    expect(optionOf(list, 'GLM-5').style.display).toBe('none');
  });

  test('匹配整项文本（窗口大小徽标也能命中）', () => {
    const { list } = setupDom();

    filterSectionSelectList(list, '128k');

    expect(optionOf(list, 'deepseek-v4-pro').style.display).toBe('');
    expect(optionOf(list, 'kimi-k2').style.display).toBe('none');
  });

  test('无匹配显示空态提示，恢复命中后移除', () => {
    const { list } = setupDom();

    filterSectionSelectList(list, 'zzz');
    const empty = list.querySelector('.section-select-empty');
    expect(empty).toBeTruthy();
    expect(empty.textContent).toBe('无匹配项');

    filterSectionSelectList(list, 'kimi');
    expect(list.querySelector('.section-select-empty')).toBeNull();
    expect(optionOf(list, 'kimi-k2').style.display).toBe('');
  });

  test('清空关键字恢复全部选项', () => {
    const { list } = setupDom();

    filterSectionSelectList(list, 'zzz');
    filterSectionSelectList(list, '');

    for (const value of ['deepseek-v4-pro', 'kimi-k2', 'GLM-5']) {
      expect(optionOf(list, value).style.display).toBe('');
    }
    expect(list.querySelector('.section-select-empty')).toBeNull();
  });

  test('过滤不把搜索框当选项处理', () => {
    const { list } = setupDom();

    filterSectionSelectList(list, 'x');

    expect(list.querySelector('.section-select-search').style.display).toBe('');
  });
});

describe('打开下拉交互', () => {
  test('点击选择行打开浮层并聚焦搜索框', () => {
    const { list, row } = setupDom();

    openList(row);

    expect(list.classList.contains('open')).toBe(true);
    expect(document.activeElement).toBe(list.querySelector('.section-select-search'));
  });

  test('输入关键字过滤（文档级事件委托）', () => {
    const { list, row } = setupDom();
    openList(row);

    const search = list.querySelector('.section-select-search');
    search.value = 'glm';
    search.dispatchEvent(new Event('input', { bubbles: true }));

    expect(optionOf(list, 'GLM-5').style.display).toBe('');
    expect(optionOf(list, 'kimi-k2').style.display).toBe('none');
  });

  test('重新打开时清空上次关键字并恢复全部选项', () => {
    const { list, row } = setupDom();
    openList(row);
    const search = list.querySelector('.section-select-search');
    search.value = 'kimi';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    expect(optionOf(list, 'GLM-5').style.display).toBe('none');

    // 点击外部收起
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(list.classList.contains('open')).toBe(false);

    // 重新打开 → 关键字清空、全部选项可见
    openList(row);
    expect(search.value).toBe('');
    expect(optionOf(list, 'GLM-5').style.display).toBe('');
  });

  test('点击搜索框不会关闭浮层', () => {
    const { list, row } = setupDom();
    openList(row);

    list.querySelector('.section-select-search').dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(list.classList.contains('open')).toBe(true);
  });
});
