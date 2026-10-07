// @vitest-environment jsdom
// toolbar-adapt.unit.test.js - 输入工具栏自适应：浮层豁免测量 + 重播动画快进（防弹框闪帧）
//
// 背景：adaptInputToolbar 测量时会临时把打开的浮层 display:none 再恢复。
// display 切换会使浮层 CSS 入场动画（dropdownFadeIn）从头重播，下一帧渲染出
// 近全透明状态（弹框"闪一下"）；恢复显示后必须把重播动画快进到终态。
// 同时 MutationObserver 需忽略浮层内部的 DOM 变更（不影响工具栏宽度，避免无谓重测）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { adaptInputToolbar, initToolbarAdaptive, isInsideOverlay, finishReplayedAnimations } from '../../src/side_panel/toolbar-adapt.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="input-container">
      <div class="input-toolbar">
        <button id="plainBtn"><span id="plainText">工具</span></button>
        <div class="temp-selector">
          <div class="temp-dropdown" id="tempDropdown" style="position: absolute;">
            <div class="model-section" id="modelSection">
              <span id="modelText">deepseek-v4-pro</span>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  return {
    container: document.querySelector('.input-container'),
    toolbar: document.querySelector('.input-toolbar'),
    dropdown: document.getElementById('tempDropdown'),
  };
}

/** 让 adaptInputToolbar 认为 toolbar 溢出（scrollWidth > clientWidth），并记录每次测量时浮层的 display */
function makeToolbarOverflow(toolbar, dropdown, measuredDisplays) {
  Object.defineProperty(toolbar, 'scrollWidth', {
    configurable: true,
    get: () => {
      measuredDisplays.push(dropdown.style.display);
      return 200;
    },
  });
  Object.defineProperty(toolbar, 'clientWidth', { configurable: true, get: () => 100 });
  dropdown.getClientRects = () => [{ width: 120, height: 80 }];
}

describe('isInsideOverlay', () => {
  it('浮层内部节点判定为浮层内，普通工具栏部件与 toolbar 自身为浮层外', () => {
    const { toolbar } = setupDom();
    expect(isInsideOverlay(document.getElementById('modelText'), toolbar)).toBe(true);
    expect(isInsideOverlay(document.getElementById('plainText'), toolbar)).toBe(false);
    expect(isInsideOverlay(toolbar, toolbar)).toBe(false);
  });
});

describe('finishReplayedAnimations', () => {
  it('快进运行中动画、跳过 idle 动画、容忍无 getAnimations 的元素', () => {
    const finish = vi.fn();
    const finishIdle = vi.fn();
    finishReplayedAnimations([
      { getAnimations: () => [{ playState: 'running', finish }, { playState: 'idle', finish: finishIdle }] },
      {},
    ]);
    expect(finish).toHaveBeenCalledTimes(1);
    expect(finishIdle).not.toHaveBeenCalled();
  });
});

describe('adaptInputToolbar', () => {
  let dom;

  beforeEach(() => {
    dom = setupDom();
  });

  it('测量期间浮层保持隐藏（不污染 scrollWidth），恢复显示后快进重播动画', () => {
    const { container, toolbar, dropdown } = dom;
    const measuredDisplays = [];
    makeToolbarOverflow(toolbar, dropdown, measuredDisplays);
    const finish = vi.fn();
    dropdown.getAnimations = () => [{ playState: 'running', finish }];

    adaptInputToolbar();

    // 每次测量时浮层都必须处于隐藏状态（overflow 判定不含浮层溢出）
    expect(measuredDisplays.length).toBeGreaterThan(0);
    expect(measuredDisplays.every((d) => d === 'none')).toBe(true);
    // 恢复显示且重播动画被快进到终态（防"闪一帧透明"）
    expect(dropdown.style.display).toBe('');
    expect(finish).toHaveBeenCalledTimes(1);
    // 两级降级按需触发（scrollWidth 恒溢出）
    expect(container.classList.contains('temp-collapsed')).toBe(true);
    expect(container.classList.contains('agent-collapsed')).toBe(true);
  });

  it('空间充足提前返回时仍恢复浮层并快进动画（无溢出不加降级类）', () => {
    const { container, toolbar, dropdown } = dom;
    Object.defineProperty(toolbar, 'scrollWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(toolbar, 'clientWidth', { configurable: true, get: () => 200 });
    dropdown.getClientRects = () => [{ width: 120, height: 80 }];
    const finish = vi.fn();
    dropdown.getAnimations = () => [{ playState: 'running', finish }];

    adaptInputToolbar();

    expect(dropdown.style.display).toBe('');
    expect(finish).toHaveBeenCalledTimes(1);
    expect(container.classList.contains('temp-collapsed')).toBe(false);
    expect(container.classList.contains('agent-collapsed')).toBe(false);
  });
});

describe('initToolbarAdaptive', () => {
  it('浮层内部 DOM 变更不触发重测，工具栏可见文字变化触发重测', async () => {
    const { container, toolbar, dropdown } = setupDom();
    makeToolbarOverflow(toolbar, dropdown, []);
    initToolbarAdaptive();

    // 初始化立即重测一次：溢出 → 降级标记添加
    expect(container.classList.contains('temp-collapsed')).toBe(true);

    // 清理降级标记，观察后续是否被重新添加
    container.classList.remove('temp-collapsed', 'agent-collapsed');

    // 浮层内部文本变化（切换厂商/模型场景）：不影响工具栏宽度 → 不触发重测
    document.getElementById('modelText').textContent = 'gpt-4o';
    await new Promise((r) => setTimeout(r, 60));
    expect(container.classList.contains('temp-collapsed')).toBe(false);

    // 工具栏可见文字变化（语言切换/助手改名场景）：触发重测 → 重新降级
    document.getElementById('plainText').textContent = '一个很长的工具名称';
    await new Promise((r) => setTimeout(r, 60));
    expect(container.classList.contains('temp-collapsed')).toBe(true);
  });
});
