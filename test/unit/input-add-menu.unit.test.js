// @vitest-environment jsdom
// input-add-menu.unit.test.js - "+" 添加菜单：开合、外部点击关闭、菜单项点击关闭（含 capture 机制）、蓝点状态
import { describe, it, expect, beforeEach } from 'vitest';
import { initInputAddMenu } from '../../src/side_panel/input-add-menu.js';

function setupDom() {
  document.body.innerHTML = `
    <div class="input-bottom-row">
      <div class="input-bottom-left">
        <div class="input-add-wrapper">
          <button id="inputAddBtn">+</button>
          <div class="input-add-menu" id="inputAddMenu" style="display:none;">
            <button class="input-add-item" id="promptTriggerBtn">提示词</button>
            <div class="input-add-menu-switches" id="inputAddMenuSwitches">
              <div class="input-add-menu-switches-title">开关</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div id="outside">外部</div>`;
  initInputAddMenu();
  return {
    btn: document.getElementById('inputAddBtn'),
    item: document.getElementById('promptTriggerBtn'),
    menu: document.getElementById('inputAddMenu'),
    switches: document.getElementById('inputAddMenuSwitches'),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('input-add-menu', () => {
  let dom;

  beforeEach(() => {
    dom = setupDom();
  });

  it('点击 "+" 切换开合', () => {
    expect(dom.menu.style.display).toBe('none');
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    dom.btn.click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('点击菜单外部关闭', () => {
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    document.getElementById('outside').click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('菜单项自身 stopPropagation 时仍能关闭（capture 监听）', () => {
    // 模拟真实场景：提示词按钮 handler 会 stopPropagation（index.js 2529-2530）
    dom.item.addEventListener('click', (e) => e.stopPropagation());
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    dom.item.click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('蓝点：开关区内无开关时隐藏；移入已激活开关时显示；取消勾选后消失', async () => {
    expect(dom.btn.classList.contains('has-active-switch')).toBe(false);

    // ④级降级把划词组（含已勾选的划词开关）移入菜单开关区
    const group = document.createElement('div');
    group.className = 'toolbar-chip-group';
    group.innerHTML = '<input type="checkbox" checked>';
    dom.switches.appendChild(group);
    await tick();
    expect(dom.btn.classList.contains('has-active-switch')).toBe(true);

    // 在菜单里取消勾选（change 冒泡到开关区）
    const checkbox = group.querySelector('input');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dom.btn.classList.contains('has-active-switch')).toBe(false);
  });
});
