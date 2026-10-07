// @vitest-environment jsdom
// options 页模型下拉过滤（输入框即搜索框）的单测
import { describe, test, expect, beforeEach } from 'vitest';
import { filterModelDropdown } from '../../src/options/config-manager.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="model-selector">
      <input type="text" id="modelInput" value="deepseek-v4-pro">
      <div class="model-dropdown show" id="modelDropdown">
        <div class="model-option" data-value="deepseek-v4-pro"><span class="model-option-left">deepseek-v4-pro</span><span class="model-option-right"><span class="model-ctx-badge">128k</span></span></div>
        <div class="model-option" data-value="kimi-k2"><span class="model-option-left">kimi-k2</span><span class="model-option-right"><button type="button" class="delete-model-btn">×</button></span></div>
        <div class="model-option" data-value="GLM-5"><span class="model-option-left">GLM-5</span><span class="model-option-right"><button type="button" class="delete-model-btn">×</button></span></div>
      </div>
    </div>`;
  return document.getElementById('modelDropdown');
}

function optionOf(dropdown, value) {
  return dropdown.querySelector(`.model-option[data-value="${value}"]`);
}

describe('filterModelDropdown（模型下拉关键字过滤）', () => {
  let dropdown;
  beforeEach(() => {
    dropdown = setupDom();
  });

  test('不区分大小写、包含匹配切换选项显示', () => {
    filterModelDropdown(dropdown, 'KIMI');

    expect(optionOf(dropdown, 'kimi-k2').style.display).toBe('');
    expect(optionOf(dropdown, 'deepseek-v4-pro').style.display).toBe('none');
    expect(optionOf(dropdown, 'GLM-5').style.display).toBe('none');
  });

  test('匹配整项文本（上下文窗口徽标也能命中）', () => {
    filterModelDropdown(dropdown, '128k');

    expect(optionOf(dropdown, 'deepseek-v4-pro').style.display).toBe('');
    expect(optionOf(dropdown, 'kimi-k2').style.display).toBe('none');
  });

  test('无匹配显示空态提示，恢复命中后移除', () => {
    filterModelDropdown(dropdown, 'zzz');
    const empty = dropdown.querySelector('.model-dropdown-empty');
    expect(empty).toBeTruthy();
    // 中文词典已注册该文案（key 缺失时 t() 原样返回 key，此处用真实文案兜底验证）
    expect(empty.textContent).toBe('无匹配项');

    filterModelDropdown(dropdown, 'glm');
    expect(dropdown.querySelector('.model-dropdown-empty')).toBeNull();
    expect(optionOf(dropdown, 'GLM-5').style.display).toBe('');
  });

  test('重复无匹配只保留一个空态元素', () => {
    filterModelDropdown(dropdown, 'zzz');
    filterModelDropdown(dropdown, 'xxx');

    expect(dropdown.querySelectorAll('.model-dropdown-empty').length).toBe(1);
  });

  test('清空关键字恢复全部选项并移除空态', () => {
    filterModelDropdown(dropdown, 'zzz');
    filterModelDropdown(dropdown, '');

    for (const value of ['deepseek-v4-pro', 'kimi-k2', 'GLM-5']) {
      expect(optionOf(dropdown, value).style.display).toBe('');
    }
    expect(dropdown.querySelector('.model-dropdown-empty')).toBeNull();
  });

  test('非字符串查询与空下拉容错', () => {
    filterModelDropdown(dropdown, 'zzz');
    filterModelDropdown(dropdown, undefined);
    expect(optionOf(dropdown, 'kimi-k2').style.display).toBe('');
    expect(dropdown.querySelector('.model-dropdown-empty')).toBeNull();

    expect(() => filterModelDropdown(null, 'x')).not.toThrow();
  });
});
