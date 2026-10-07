// @vitest-environment jsdom
// options 页模型下拉渲染排序与添加时按序插入的单测
import { describe, test, expect, beforeEach } from 'vitest';
import {
  renderModelDropdownFromList,
  addCustomModelToDropdown,
  addCustomImageModelToDropdown,
  loadImageModels,
} from '../../src/options/config-manager.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="model-selector">
      <input type="text" id="modelInput" value="">
      <div class="model-dropdown" id="modelDropdown"></div>
      <input type="text" id="imageModelInput" value="">
      <div class="model-dropdown" id="imageModelDropdown"></div>
    </div>`;
}

function optionValues(dropdown) {
  return [...dropdown.querySelectorAll('.model-option')].map(o => o.dataset.value);
}

describe('模型下拉排序（options 页）', () => {
  beforeEach(() => {
    setupDom();
    // chrome-mock 的 get/set 为 noop：按用例覆写 get，set 保持不回调即可
    globalThis.chrome.storage.local.get = () => {};
  });

  test('全量渲染按名称排序（汉字组优先，拉丁按字母序）', () => {
    const dropdown = document.getElementById('modelDropdown');

    renderModelDropdownFromList([
      { name: 'zebra' },
      { name: '阿里云' },
      { name: 'Apple' },
      { name: 'deepseek' },
    ]);

    expect(optionValues(dropdown)).toEqual(['阿里云', 'Apple', 'deepseek', 'zebra']);
  });

  test('排序渲染后仍正确标记选中项', () => {
    const dropdown = document.getElementById('modelDropdown');

    renderModelDropdownFromList([{ name: 'zebra' }, { name: 'apple' }], 'zebra');

    expect(dropdown.querySelector('.model-option[data-value="zebra"]').classList.contains('selected')).toBe(true);
    expect(dropdown.querySelector('.model-option[data-value="apple"]').classList.contains('selected')).toBe(false);
  });

  test('模型列表为 null 时容错不抛错', () => {
    expect(() => renderModelDropdownFromList(null)).not.toThrow();
  });

  test('添加模型时按名称顺序插入到中间位置', () => {
    const dropdown = document.getElementById('modelDropdown');
    dropdown.innerHTML = `
      <div class="model-option" data-value="apple"><span class="model-option-left">apple</span></div>
      <div class="model-option" data-value="zebra"><span class="model-option-left">zebra</span></div>`;

    addCustomModelToDropdown('mango');

    expect(optionValues(dropdown)).toEqual(['apple', 'mango', 'zebra']);
  });

  test('添加名称排最后的模型时追加到末尾', () => {
    const dropdown = document.getElementById('modelDropdown');
    dropdown.innerHTML = `
      <div class="model-option" data-value="apple"><span class="model-option-left">apple</span></div>
      <div class="model-option" data-value="mango"><span class="model-option-left">mango</span></div>`;

    addCustomModelToDropdown('zzz');

    expect(optionValues(dropdown)).toEqual(['apple', 'mango', 'zzz']);
  });

  test('图片模型加载渲染按名称排序（兼容字符串旧格式）', async () => {
    const dropdown = document.getElementById('imageModelDropdown');
    globalThis.chrome.storage.local.get = (keys, cb) =>
      cb({ imageModels: ['zebra', { name: 'apple', contextWindow: 1000 }] });

    await new Promise(resolve => loadImageModels(resolve));

    expect(optionValues(dropdown)).toEqual(['apple', 'zebra']);
  });

  test('添加图片模型时按名称顺序插入', () => {
    const dropdown = document.getElementById('imageModelDropdown');
    dropdown.innerHTML = `
      <div class="model-option" data-value="zebra"><span class="model-option-left">zebra</span></div>`;

    addCustomImageModelToDropdown('apple', 4096);

    expect(optionValues(dropdown)).toEqual(['apple', 'zebra']);
  });
});
