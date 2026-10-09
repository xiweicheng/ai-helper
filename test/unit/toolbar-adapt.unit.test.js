// @vitest-environment jsdom
// toolbar-adapt.unit.test.js - 输入底行自适应：4 级降级链 + 浮层豁免测量 + 重播动画快进
//
// 背景：adaptInputToolbar 测量时会临时把打开的浮层 display:none 再恢复。
// display 切换会使浮层 CSS 入场动画从头重播，恢复后必须快进到终态（防闪帧）。
// MutationObserver 需忽略浮层内部变更，并忽略④级移动划词组自身的 mutation（防死循环）。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { adaptInputToolbar, initToolbarAdaptive, isInsideOverlay, finishReplayedAnimations } from '../../src/side_panel/toolbar-adapt.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="input-container">
      <div class="input-wrapper"><textarea id="userInput"></textarea></div>
      <div class="input-bottom-row">
        <div class="input-bottom-left">
          <div class="input-add-wrapper">
            <button id="inputAddBtn">+</button>
            <div class="input-add-menu" id="inputAddMenu" style="display:none;">
              <div class="input-add-menu-switches" id="inputAddMenuSwitches"></div>
            </div>
          </div>
          <div class="toolbar-chip-group" id="memoryGroup"><span id="plainText">记忆</span></div>
          <div class="tool-toggle-wrapper"></div>
          <div class="toolbar-chip-group" id="selectionToggleGroup"><span>划词</span></div>
        </div>
        <div class="input-bottom-right">
          <div class="temp-selector">
            <div class="temp-dropdown" id="tempDropdown" style="position: absolute;">
              <div class="model-section" id="modelSection">
                <span id="modelText">deepseek-v4-pro</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  return {
    container: document.querySelector('.input-container'),
    bar: document.querySelector('.input-bottom-row'),
    left: document.querySelector('.input-bottom-left'),
    menuSwitches: document.getElementById('inputAddMenuSwitches'),
    selectionGroup: document.getElementById('selectionToggleGroup'),
    dropdown: document.getElementById('tempDropdown'),
  };
}

/** 让 adaptInputToolbar 认为底行溢出（scrollWidth > clientWidth），并记录每次测量时浮层的 display */
function makeBarOverflow(bar, dropdown, measuredDisplays) {
  Object.defineProperty(bar, 'scrollWidth', {
    configurable: true,
    get: () => {
      measuredDisplays.push(dropdown.style.display);
      return 200;
    },
  });
  Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 100 });
  dropdown.getClientRects = () => [{ width: 120, height: 80 }];
}

describe('isInsideOverlay', () => {
  it('浮层内部节点判定为浮层内，普通底行部件与底行自身为浮层外', () => {
    const { bar } = setupDom();
    expect(isInsideOverlay(document.getElementById('modelText'), bar)).toBe(true);
    expect(isInsideOverlay(document.getElementById('plainText'), bar)).toBe(false);
    expect(isInsideOverlay(bar, bar)).toBe(false);
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

  it('④级兜底：测量期间浮层保持隐藏，四档降级类全部添加，划词组移入菜单，恢复后快进重播动画', () => {
    const { container, bar, menuSwitches, selectionGroup, dropdown } = dom;
    const measuredDisplays = [];
    makeBarOverflow(bar, dropdown, measuredDisplays);
    const finish = vi.fn();
    dropdown.getAnimations = () => [{ playState: 'running', finish }];

    adaptInputToolbar();

    // 每次测量时浮层都必须处于隐藏状态（overflow 判定不含浮层溢出）
    expect(measuredDisplays.length).toBeGreaterThan(0);
    expect(measuredDisplays.every((d) => d === 'none')).toBe(true);
    // 恢复显示且重播动画被快进到终态（防“闪一帧透明”）
    expect(dropdown.style.display).toBe('');
    expect(finish).toHaveBeenCalledTimes(1);
    // 四级降级按需触发（scrollWidth 恒溢出）
    expect(container.classList.contains('temp-collapsed')).toBe(true);
    expect(container.classList.contains('agent-collapsed')).toBe(true);
    expect(container.classList.contains('switches-icon')).toBe(true);
    expect(container.classList.contains('selection-in-menu')).toBe(true);
    // 划词组 DOM 移入菜单开关区（事件监听在元素自身，不丢失）
    expect(selectionGroup.parentElement).toBe(menuSwitches);
  });

  it('中途空间足够时停止降级（②级即止，不再加③④）', () => {
    const { container, bar } = dom;
    Object.defineProperty(bar, 'scrollWidth', {
      configurable: true,
      get: () => (container.classList.contains('agent-collapsed') ? 100 : 200),
    });
    Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 100 });

    adaptInputToolbar();

    expect(container.classList.contains('temp-collapsed')).toBe(true);
    expect(container.classList.contains('agent-collapsed')).toBe(true);
    expect(container.classList.contains('switches-icon')).toBe(false);
    expect(container.classList.contains('selection-in-menu')).toBe(false);
  });

  it('空间充足时提前返回：无降级类、划词组留在左组、浮层恢复且动画快进', () => {
    const { container, bar, left, selectionGroup, dropdown } = dom;
    Object.defineProperty(bar, 'scrollWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 200 });
    dropdown.getClientRects = () => [{ width: 120, height: 80 }];
    const finish = vi.fn();
    dropdown.getAnimations = () => [{ playState: 'running', finish }];

    adaptInputToolbar();

    expect(dropdown.style.display).toBe('');
    expect(finish).toHaveBeenCalledTimes(1);
    expect(container.classList.contains('temp-collapsed')).toBe(false);
    expect(container.classList.contains('agent-collapsed')).toBe(false);
    expect(container.classList.contains('switches-icon')).toBe(false);
    expect(container.classList.contains('selection-in-menu')).toBe(false);
    expect(selectionGroup.parentElement).toBe(left);
  });

  it('空间恢复时全量还原：类清除、划词组从菜单移回左组', () => {
    const { container, bar, left, selectionGroup } = dom;
    makeBarOverflow(bar, dom.dropdown, []);
    adaptInputToolbar();
    expect(selectionGroup.parentElement).toBe(dom.menuSwitches);

    // 空间恢复：重新定义宽度并重测
    Object.defineProperty(bar, 'scrollWidth', { configurable: true, get: () => 100 });
    adaptInputToolbar();

    expect(container.classList.contains('temp-collapsed')).toBe(false);
    expect(container.classList.contains('agent-collapsed')).toBe(false);
    expect(container.classList.contains('switches-icon')).toBe(false);
    expect(container.classList.contains('selection-in-menu')).toBe(false);
    expect(selectionGroup.parentElement).toBe(left);
  });

  it('测量期间容器带 measuring 类（禁用过渡保证同步测量读到终值），结束后移除', () => {
    const { container, bar } = dom;
    const measuredFlags = [];
    Object.defineProperty(bar, 'scrollWidth', {
      configurable: true,
      get: () => {
        measuredFlags.push(container.classList.contains('measuring'));
        return 200;
      },
    });
    Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 100 });

    adaptInputToolbar();

    // 每次读取布局值时都处于 measuring 状态（.memory-limit-label 等带
    // transition:all 会过渡 border-width 等布局属性，不禁用则读到过渡起点值）
    expect(measuredFlags.length).toBeGreaterThan(0);
    expect(measuredFlags.every(Boolean)).toBe(true);
    // 结束后恢复（不影响浮层入场动画等正常过渡）
    expect(container.classList.contains('measuring')).toBe(false);
  });

  it('空间充足提前返回同样移除 measuring', () => {
    const { container, bar } = dom;
    Object.defineProperty(bar, 'scrollWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(bar, 'clientWidth', { configurable: true, get: () => 200 });

    adaptInputToolbar();

    expect(container.classList.contains('measuring')).toBe(false);
  });

  it('降级态起点的重测：仅完整态应参与布局的绝对定位元素不被误收为浮层（收集在类清理之后）', () => {
    const { container, bar, dropdown } = dom;
    container.classList.add('switches-icon'); // 起点：上一轮降级态（真实场景：③ 态下角标为 absolute）
    // 模拟：该元素在 ③ 降级态下脱离文档流（如 .memory-limit-label 变 absolute 角标），
    // 完整态回到流内。jsdom 无法表达 CSS 级联 position 翻转，用可见性翻转等价模拟
    // “收集资格翻转”：若在类清理前收集，它会被误当浮层隐藏——清理后它应回到流内
    // 参与测量，却因内联 display:none 缺席导致测量低估宽度、误判“无需降级”。
    const measuredDisplays = [];
    makeBarOverflow(bar, dropdown, measuredDisplays);
    // makeBarOverflow 会先设一个恒定实现，这里覆盖为动态版本以模拟“收集资格翻转”
    dropdown.getClientRects = () =>
      container.classList.contains('switches-icon') ? [{ width: 120, height: 80 }] : [];

    adaptInputToolbar();

    // 测量期间该元素必须不被隐藏（保持原 display），其宽度始终参与底行测量
    expect(measuredDisplays.length).toBeGreaterThan(0);
    expect(measuredDisplays.every((d) => d === 'none')).toBe(false);
  });
});

describe('initToolbarAdaptive', () => {
  it('移动划词组的 mutation 不触发重测，浮层内部变更跳过，底行可见文字变化触发重测', async () => {
    const dom = setupDom();
    const { container, bar, menuSwitches, selectionGroup, dropdown } = dom;
    makeBarOverflow(bar, dropdown, []);
    initToolbarAdaptive();

    // 初始化立即重测一次：溢出 → 一路降到底，划词组入菜单
    expect(container.classList.contains('temp-collapsed')).toBe(true);
    expect(selectionGroup.parentElement).toBe(menuSwitches);

    // 清理降级标记；模拟适配器移动划词组（菜单 ↔ 左组）
    container.classList.remove('temp-collapsed', 'agent-collapsed', 'switches-icon', 'selection-in-menu');
    document.querySelector('.input-bottom-left').appendChild(selectionGroup);
    await new Promise((r) => setTimeout(r, 60));
    expect(container.classList.contains('temp-collapsed')).toBe(false);

    // 浮层内部文本变化（切换厂商/模型场景）：不影响底行宽度 → 不触发重测
    document.getElementById('modelText').textContent = 'gpt-4o';
    await new Promise((r) => setTimeout(r, 60));
    expect(container.classList.contains('temp-collapsed')).toBe(false);

    // 底行可见文字变化（语言切换/助手改名场景）：触发重测 → 重新降级
    document.getElementById('plainText').textContent = '一个很长的记忆名称';
    await new Promise((r) => setTimeout(r, 60));
    expect(container.classList.contains('temp-collapsed')).toBe(true);
  });
});
