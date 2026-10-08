// @vitest-environment jsdom
// ctx-popover.unit.test.js - 模型上下文窗口滑杆浮层的 DOM 行为测试
//
// 契约：
// - 档位吸附：CTX_LADDER 12 档（1K–1M，1000 进制），tokensToIndex 取最近档位、越界夹取；
// - 浮层挂 document.body（fixed 定位，避开下拉容器 overflow 裁切）；
// - input → onPreview（预览不持久化）；change → onCommit（持久化）；「自动」→ onReset；
// - 拖拽会话：pointerdown 建会话；pointerup 收口——Chrome 在「终点档位==起点档位」时不派发
//   change，由 pointerup 补提交固化；终点不同则交给 change（不重复提交）；
// - 未松手中断（关闭 / pointercancel）→ 回滚预览副作用且不提交；
// - 关闭时机：Esc / 浮层与锚点外点击 / 再次点击同一锚点（toggle）；
// - config-manager 的 apply 只改 DOM/dataset；commit 额外落 storage 并刷新选中徽标；
// - 行内徽标：显式值 = 蓝色实底；自动态 = 灰色虚线（is-auto）显示内置推断值 + tooltip，
//   apply 0 不再移除徽标而是切回自动样式（三个下拉列表口径一致）。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
  CTX_LADDER,
  tokensToIndex,
  indexToTokens,
  openCtxPopover,
  closeCtxPopover,
  containsCtxPopoverEl,
} from '../../src/options/ctx-popover.js';
import {
  buildModelOption,
  applyModelContextWindow,
  commitModelContextWindow,
  addCustomImageModelToDropdown,
  loadImageModels,
  commitImageModelContextWindow,
} from '../../src/options/config-manager.js';

// 挂载一个最小 options 页模型区：输入框 + 选中徽标 + 下拉容器
function mountOption(modelName, ctxWindow = 0) {
  document.body.innerHTML = `
    <input id="modelInput" value="${modelName}">
    <span id="modelSelectedCtxBadge" style="display:none;"></span>
    <div id="modelDropdown"></div>`;
  const option = buildModelOption(modelName, ctxWindow);
  document.getElementById('modelDropdown').appendChild(option);
  return option;
}

const getPopover = () => document.querySelector('.ctx-popover');

describe('档位映射（档位吸附）', () => {
  it('CTX_LADDER 覆盖 1K–1M 共 12 档', () => {
    expect(CTX_LADDER).toHaveLength(12);
    expect(CTX_LADDER[0]).toBe(1000);
    expect(CTX_LADDER[CTX_LADDER.length - 1]).toBe(1000000);
  });

  it('精确档位命中自身索引', () => {
    expect(tokensToIndex(128000)).toBe(CTX_LADDER.indexOf(128000));
    expect(tokensToIndex(1000000)).toBe(11);
  });

  it('非档位值取最近档位（如 90000 → 64K、170000 → 200K）', () => {
    expect(CTX_LADDER[tokensToIndex(90000)]).toBe(64000);
    expect(CTX_LADDER[tokensToIndex(170000)]).toBe(200000);
  });

  it('越界值夹取到首尾档位', () => {
    expect(tokensToIndex(0)).toBe(0);
    expect(tokensToIndex(1)).toBe(0);
    expect(tokensToIndex(2000000)).toBe(11);
  });

  it('indexToTokens 索引转 tokens 并夹取越界', () => {
    expect(indexToTokens(0)).toBe(1000);
    expect(indexToTokens(11)).toBe(1000000);
    expect(indexToTokens(99)).toBe(1000000);
    expect(indexToTokens(-3)).toBe(1000);
  });
});

describe('浮层生命周期', () => {
  afterEach(() => closeCtxPopover());

  it('打开后浮层挂到 body，标题为模型名', () => {
    const option = mountOption('gpt-4o', 128000);
    const btn = option.querySelector('.ctx-set-btn');
    openCtxPopover(btn, option, {});

    const popover = getPopover();
    expect(popover).toBeTruthy();
    expect(popover.parentElement).toBe(document.body);
    expect(popover.querySelector('.ctx-popover-title').textContent).toBe('gpt-4o');
    expect(containsCtxPopoverEl(popover)).toBe(true);
  });

  it('Esc 关闭浮层', () => {
    const option = mountOption('gpt-4o', 128000);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(getPopover()).toBeNull();
    expect(containsCtxPopoverEl(document.body)).toBe(false);
  });

  it('点击浮层与锚点以外区域关闭', () => {
    const option = mountOption('gpt-4o', 128000);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});
    document.body.click();
    expect(getPopover()).toBeNull();
  });

  it('点击浮层内部不关闭', () => {
    const option = mountOption('gpt-4o', 128000);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});
    getPopover().querySelector('.ctx-popover-slider').click();
    expect(getPopover()).toBeTruthy();
  });

  it('点击锚点本身不关闭（toggle 由再次 open 触发）', () => {
    const option = mountOption('gpt-4o', 128000);
    const btn = option.querySelector('.ctx-set-btn');
    openCtxPopover(btn, option, {});
    btn.click();
    expect(getPopover()).toBeTruthy();
  });

  it('再次点击同一锚点（再次 open）切换为关闭', () => {
    const option = mountOption('gpt-4o', 128000);
    const btn = option.querySelector('.ctx-set-btn');
    openCtxPopover(btn, option, {});
    openCtxPopover(btn, option, {});
    expect(getPopover()).toBeNull();
  });

  it('切换到另一行锚点时浮层改挂到新模型', () => {
    const optionA = mountOption('gpt-4o', 128000);
    const optionB = buildModelOption('deepseek-v4-pro', 64000);
    document.getElementById('modelDropdown').appendChild(optionB);

    openCtxPopover(optionA.querySelector('.ctx-set-btn'), optionA, {});
    openCtxPopover(optionB.querySelector('.ctx-set-btn'), optionB, {});

    expect(document.querySelectorAll('.ctx-popover')).toHaveLength(1);
    expect(getPopover().querySelector('.ctx-popover-title').textContent).toBe('deepseek-v4-pro');
  });

  it('closeCtxPopover 幂等且无浮层时安全', () => {
    closeCtxPopover();
    const option = mountOption('gpt-4o', 128000);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});
    closeCtxPopover();
    expect(() => closeCtxPopover()).not.toThrow();
  });
});

describe('滑杆交互', () => {
  afterEach(() => closeCtxPopover());

  it('显式值打开：滑杆定位到最近档位，值显示格式化，自动入口可见', () => {
    const option = mountOption('gpt-4o', 128000);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});

    const slider = getPopover().querySelector('.ctx-popover-slider');
    const value = getPopover().querySelector('.ctx-popover-value');
    expect(slider.value).toBe(String(CTX_LADDER.indexOf(128000)));
    expect(value.textContent).toBe('128K');
    expect(value.classList.contains('is-auto')).toBe(false);
    expect(getPopover().querySelector('.ctx-popover-auto-btn').style.display).toBe('');
    expect(getPopover().querySelector('.ctx-popover-auto-tag').style.display).toBe('none');
    // 「恢复自动」按钮与「自动」状态标签文案必须不同，避免重名造成“同一控件跳位”的误读
    expect(getPopover().querySelector('.ctx-popover-auto-btn').textContent)
      .not.toBe(getPopover().querySelector('.ctx-popover-auto-tag').textContent);
  });

  it('拖拽 input 事件触发 onPreview（档位值）并实时更新显示', () => {
    const option = mountOption('gpt-4o', 128000);
    const onPreview = vi.fn();
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, { onPreview });

    const slider = getPopover().querySelector('.ctx-popover-slider');
    slider.value = '11';
    slider.dispatchEvent(new Event('input'));

    expect(onPreview).toHaveBeenCalledWith(1000000);
    expect(getPopover().querySelector('.ctx-popover-value').textContent).toBe('1M');
  });

  it('change 事件（松手）触发 onCommit 持久化', () => {
    const option = mountOption('gpt-4o', 128000);
    const onCommit = vi.fn();
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, { onCommit });

    const slider = getPopover().querySelector('.ctx-popover-slider');
    slider.value = '0';
    slider.dispatchEvent(new Event('change'));

    expect(onCommit).toHaveBeenCalledWith(1000);
  });

  it('点击「自动」触发 onReset 并切回自动态展示（灰色推断值 + 标签）', () => {
    const option = mountOption('gpt-4o', 64000);
    const onReset = vi.fn();
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, { onReset });

    getPopover().querySelector('.ctx-popover-auto-btn').click();

    expect(onReset).toHaveBeenCalled();
    const value = getPopover().querySelector('.ctx-popover-value');
    expect(value.textContent).toBe('128K'); // gpt-4o 内置推断 128000
    expect(value.classList.contains('is-auto')).toBe(true);
    expect(getPopover().querySelector('.ctx-popover-auto-btn').style.display).toBe('none');
    expect(getPopover().querySelector('.ctx-popover-auto-tag').style.display).toBe('');
  });

  it('自动态打开（contextWindow=0）：显示内置推断值，滑杆定位到其最近档位', () => {
    const option = mountOption('gpt-4o', 0);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});

    const value = getPopover().querySelector('.ctx-popover-value');
    expect(value.textContent).toBe('128K');
    expect(value.classList.contains('is-auto')).toBe(true);
    expect(getPopover().querySelector('.ctx-popover-slider').value).toBe(String(CTX_LADDER.indexOf(128000)));
  });

  it('未收录模型自动态回退默认 256K', () => {
    const option = mountOption('unknown-model-xyz', 0);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});
    expect(getPopover().querySelector('.ctx-popover-value').textContent).toBe('256K');
  });
});

describe('config-manager 应用与提交', () => {
  afterEach(() => {
    closeCtxPopover();
    vi.restoreAllMocks();
  });

  it('buildModelOption 构建的选项含滑杆按钮，位于徽标与删除按钮之间', () => {
    const option = buildModelOption('gpt-4o', 128000);
    const right = option.querySelector('.model-option-right');
    const classes = [...right.children].map(el => el.className);
    expect(classes).toEqual(['model-ctx-badge', 'ctx-set-btn', 'delete-model-btn']);
  });

  it('buildModelOption 自动态：灰色虚线徽标显示内置推断值（未收录回退 256K）', () => {
    const known = buildModelOption('gpt-4o', 0);
    const knownBadge = known.querySelector('.model-ctx-badge');
    expect(knownBadge).not.toBeNull();
    expect(knownBadge.classList.contains('is-auto')).toBe(true);
    expect(knownBadge.textContent).toBe('128K'); // 内置映射 128000
    expect(knownBadge.title).toBeTruthy();

    const unknown = buildModelOption('mystery-model-42', 0);
    const unknownBadge = unknown.querySelector('.model-ctx-badge');
    expect(unknownBadge.classList.contains('is-auto')).toBe(true);
    expect(unknownBadge.textContent).toBe('256K'); // 未收录回退默认
  });

  it('apply 新增 badge 并写入 dataset；再次 apply 只更新不重复', () => {
    const option = buildModelOption('my-model', 0);
    applyModelContextWindow(option, 128000);
    expect(option.dataset.contextWindow).toBe('128000');
    expect(option.querySelectorAll('.model-ctx-badge')).toHaveLength(1);
    const badge = option.querySelector('.model-ctx-badge');
    expect(badge.textContent).toBe('128K');
    // 显式态：蓝色实底、无 is-auto、无 tooltip
    expect(badge.classList.contains('is-auto')).toBe(false);
    expect(badge.getAttribute('title')).toBeNull();

    applyModelContextWindow(option, 1000000);
    expect(option.dataset.contextWindow).toBe('1000000');
    expect(option.querySelectorAll('.model-ctx-badge')).toHaveLength(1);
    expect(option.querySelector('.model-ctx-badge').textContent).toBe('1M');
  });

  it('apply 0 恢复自动：徽标切回灰色虚线推断值（不移除），清除 dataset 与 isCustom', () => {
    const option = buildModelOption('deepseek-v4-pro', 0);
    expect(option.dataset.isCustom).toBeUndefined();
    expect(option.querySelector('.model-ctx-badge').classList.contains('is-auto')).toBe(true);

    applyModelContextWindow(option, 200000);
    expect(option.dataset.isCustom).toBe('true');
    const explicitBadge = option.querySelector('.model-ctx-badge');
    expect(explicitBadge.textContent).toBe('200K');
    expect(explicitBadge.classList.contains('is-auto')).toBe(false);

    applyModelContextWindow(option, 0);
    expect(option.dataset.contextWindow).toBeUndefined();
    expect(option.dataset.isCustom).toBeUndefined();
    const autoBadge = option.querySelector('.model-ctx-badge');
    expect(autoBadge.classList.contains('is-auto')).toBe(true);
    expect(autoBadge.textContent).toBe('128K'); // deepseek-v4-pro 内置 128000
    expect(autoBadge.title).toBeTruthy();
  });

  it('commit 落 storage（customModels 快照）并刷新选中徽标', () => {
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementation(() => {});
    const option = mountOption('gpt-4o', 0);

    commitModelContextWindow(option, 200000);

    expect(setSpy).toHaveBeenCalledTimes(1);
    const snapshot = setSpy.mock.calls[0][0].customModels;
    expect(snapshot).toContainEqual({ name: 'gpt-4o', contextWindow: 200000 });

    const selectedBadge = document.getElementById('modelSelectedCtxBadge');
    expect(selectedBadge.textContent).toBe('200K');
    expect(selectedBadge.style.display).toBe('');
  });
});

describe('滑杆刻度', () => {
  afterEach(() => closeCtxPopover());

  it('打开浮层渲染 12 个刻度点与起止文字', () => {
    const option = mountOption('gpt-4o', 128000);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});

    const popover = getPopover();
    expect(popover.querySelectorAll('.ctx-popover-scale-dot')).toHaveLength(CTX_LADDER.length);
    expect(popover.querySelector('.ctx-popover-scale-start').textContent).toBe('1K');
    expect(popover.querySelector('.ctx-popover-scale-end').textContent).toBe('1M');
  });

  it('当前档位刻度点高亮，拖动/输入后随档位迁移', () => {
    const option = mountOption('gpt-4o', 128000);
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, {});
    const activeIndexes = () =>
      [...getPopover().querySelectorAll('.ctx-popover-scale-dot')]
        .map((d, i) => (d.classList.contains('is-active') ? i : -1))
        .filter((i) => i >= 0);

    // 128000 → 第 8 档（index 7）
    expect(activeIndexes()).toEqual([CTX_LADDER.indexOf(128000)]);

    const slider = getPopover().querySelector('.ctx-popover-slider');
    slider.value = '11';
    slider.dispatchEvent(new Event('input'));
    expect(activeIndexes()).toEqual([11]);

    slider.value = '0';
    slider.dispatchEvent(new Event('input'));
    expect(activeIndexes()).toEqual([0]);
  });
});

describe('拖拽会话（收口与中断回滚）', () => {
  afterEach(() => closeCtxPopover());

  const IDX_128K = CTX_LADDER.indexOf(128000); // gpt-4o 自动推断值所在档位
  const IDX_64K = CTX_LADDER.indexOf(64000);

  // 模拟真实拖拽：pointerdown 建立会话 → 逐档 input → 终点落位（不松手）
  function dragSlider(slider, fromIndex, viaIndexes) {
    slider.value = String(fromIndex);
    slider.dispatchEvent(new Event('pointerdown'));
    for (const idx of viaIndexes) {
      slider.value = String(idx);
      slider.dispatchEvent(new Event('input'));
    }
  }

  const endDrag = (slider) => slider.dispatchEvent(new Event('pointerup', { bubbles: true }));

  it('拖出后拖回原位松手：补提交固化（Chrome 不发 change 的收口）', () => {
    // 自动态（gpt-4o 推断 128K）：拖到 64K 再拖回 128K，松手
    const option = mountOption('gpt-4o', 0);
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, { onPreview, onCommit });
    const slider = getPopover().querySelector('.ctx-popover-slider');

    dragSlider(slider, IDX_128K, [IDX_64K, IDX_128K]);
    endDrag(slider);

    expect(onPreview).toHaveBeenCalled();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(128000);
  });

  it('拖到新档位松手：不补提交，由随后的 change 提交（不重复）', () => {
    const option = mountOption('gpt-4o', 0);
    const onCommit = vi.fn();
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, { onCommit });
    const slider = getPopover().querySelector('.ctx-popover-slider');

    dragSlider(slider, IDX_128K, [IDX_64K]);
    endDrag(slider);
    expect(onCommit).not.toHaveBeenCalled();

    slider.dispatchEvent(new Event('change')); // Chrome 在松手后派发
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(64000);
  });

  it('单击（未拖动）松手：不提交', () => {
    const option = mountOption('gpt-4o', 0);
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, { onPreview, onCommit });
    const slider = getPopover().querySelector('.ctx-popover-slider');

    dragSlider(slider, IDX_128K, []);
    endDrag(slider);

    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('拖拽中关闭浮层：回滚预览副作用（onPreview 回原点）且不提交', () => {
    const option = mountOption('gpt-4o', 0);
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, { onPreview, onCommit });
    const slider = getPopover().querySelector('.ctx-popover-slider');

    dragSlider(slider, IDX_128K, [IDX_64K]); // 未松手
    closeCtxPopover();

    expect(onPreview).toHaveBeenLastCalledWith(0); // originTokens=0（自动态）回滚
    expect(onCommit).not.toHaveBeenCalled();
    // 关闭后（remove 同步派发的）change 被 state 拦截
    slider.dispatchEvent(new Event('change'));
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('pointercancel 中断：回滚预览、不提交、浮层保持打开', () => {
    const option = mountOption('gpt-4o', 0);
    const onCommit = vi.fn();
    const onPreview = vi.fn();
    openCtxPopover(option.querySelector('.ctx-set-btn'), option, { onPreview, onCommit });
    const slider = getPopover().querySelector('.ctx-popover-slider');

    dragSlider(slider, IDX_128K, [IDX_64K]);
    slider.dispatchEvent(new Event('pointercancel', { bubbles: true }));

    expect(getPopover()).toBeTruthy();
    expect(onPreview).toHaveBeenLastCalledWith(0);
    expect(onCommit).not.toHaveBeenCalled();

    // 中断后原手势的 pointerup 不再触发补提交
    endDrag(slider);
    expect(onCommit).not.toHaveBeenCalled();
  });
});

describe('图片模型上下文窗口', () => {
  const mountImageOption = (modelName, ctxWindow = 0) => {
    document.body.innerHTML = `
      <input id="imageModelInput" value="${modelName}">
      <span id="imageModelSelectedCtxBadge" style="display:none;"></span>
      <div id="imageModelDropdown"></div>`;
    const option = buildModelOption(modelName, ctxWindow);
    document.getElementById('imageModelDropdown').appendChild(option);
    return option;
  };

  afterEach(() => {
    closeCtxPopover();
    vi.restoreAllMocks();
  });

  it('loadImageModels 渲染的选项含滑杆按钮，位于徽标与删除按钮之间', async () => {
    document.body.innerHTML = `
      <input id="imageModelInput" value="">
      <span id="imageModelSelectedCtxBadge" style="display:none;"></span>
      <div id="imageModelDropdown"></div>`;
    vi.spyOn(chrome.storage.local, 'get').mockImplementation((keys, cb) => {
      cb({ imageModels: [{ name: 'qwen-vl-max', contextWindow: 256000 }] });
    });

    await new Promise((resolve) => loadImageModels(resolve));

    const right = document.querySelector('#imageModelDropdown .model-option .model-option-right');
    expect([...right.children].map((el) => el.className))
      .toEqual(['model-ctx-badge', 'ctx-set-btn', 'delete-model-btn']);
  });

  it('addCustomImageModelToDropdown 新建选项带滑杆按钮；旧结构被补齐并持久化', () => {
    document.body.innerHTML = `
      <input id="imageModelInput" value="">
      <span id="imageModelSelectedCtxBadge" style="display:none;"></span>
      <div id="imageModelDropdown"></div>`;
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementation(() => {});

    addCustomImageModelToDropdown('qwen-vl-max');
    const created = document.querySelector('.model-option[data-value="qwen-vl-max"]');
    const createdRight = created.querySelector('.model-option-right');
    expect([...createdRight.children].map((el) => el.classList[0]))
      .toEqual(['model-ctx-badge', 'ctx-set-btn', 'delete-model-btn']);
    // 自动态新建：灰色虚线徽标显示推断值（qwen-vl-max 未收录，回退默认 256K）
    const createdBadge = created.querySelector('.model-ctx-badge');
    expect(createdBadge.classList.contains('is-auto')).toBe(true);
    expect(createdBadge.textContent).toBe('256K');

    // 模拟旧结构选项（无右侧容器，含散落 badge 与删除按钮）：带 contextWindow 更新时补齐
    const legacy = document.createElement('div');
    legacy.className = 'model-option';
    legacy.dataset.value = 'legacy-vl';
    legacy.innerHTML = '<span class="model-option-left">legacy-vl</span>'
      + '<span class="model-ctx-badge">64K</span>'
      + '<button type="button" class="delete-model-btn">×</button>';
    document.getElementById('imageModelDropdown').appendChild(legacy);
    setSpy.mockClear();

    addCustomImageModelToDropdown('legacy-vl', 64000);
    const fixed = document.querySelector('.model-option[data-value="legacy-vl"]');
    expect([...fixed.querySelector('.model-option-right').children].map((el) => el.className))
      .toEqual(['model-ctx-badge', 'ctx-set-btn', 'delete-model-btn']);
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0].imageModels).toContainEqual({ name: 'legacy-vl', contextWindow: 64000 });
  });

  it('commitImageModelContextWindow 落 storage（imageModels 快照）并刷新图片选中徽标', () => {
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementation(() => {});
    const option = mountImageOption('qwen-vl-max', 0);

    commitImageModelContextWindow(option, 256000);

    expect(setSpy).toHaveBeenCalledTimes(1);
    const snapshot = setSpy.mock.calls[0][0].imageModels;
    expect(snapshot).toContainEqual({ name: 'qwen-vl-max', contextWindow: 256000 });

    const badge = document.getElementById('imageModelSelectedCtxBadge');
    expect(badge.textContent).toBe('256K');
    expect(badge.style.display).toBe('');
  });

  it('commit 0 恢复自动：快照归零、行内徽标切回自动样式、顶部选中徽标隐藏', () => {
    const setSpy = vi.spyOn(chrome.storage.local, 'set').mockImplementation(() => {});
    const option = mountImageOption('qwen-vl-max', 256000);

    commitImageModelContextWindow(option, 0);

    expect(setSpy.mock.calls[0][0].imageModels).toContainEqual({ name: 'qwen-vl-max', contextWindow: 0 });
    expect(option.dataset.contextWindow).toBeUndefined();
    const autoBadge = option.querySelector('.model-ctx-badge');
    expect(autoBadge.classList.contains('is-auto')).toBe(true);
    expect(autoBadge.textContent).toBe('256K'); // qwen-vl-max 未收录，回退默认
    expect(document.getElementById('imageModelSelectedCtxBadge').style.display).toBe('none');
  });
});
