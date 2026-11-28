// @vitest-environment jsdom
// onboarding-wizard-dom.unit.test.js - 首启向导挂载与跳过路径冒烟
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {};
const setSpy = vi.fn(async (patch) => { Object.assign(store, patch); });

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const k of list) out[k] = store[k];
        return out;
      }),
      set: setSpy,
      remove: vi.fn(async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) delete store[k];
      }),
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: { sendMessage: vi.fn() },
};

const { initOnboardingWizard, maybeShowOnboardingWizard, openOnboardingWizard } =
  await import('../../src/side_panel/onboarding-wizard.js');

function setupDom() {
  document.body.innerHTML = `
    <div id="welcomeExamples"></div>
    <button id="onboardingStatusBar" style="display:none"></button>
    <textarea id="userInput"></textarea>
    <div id="onboardingRoot"></div>`;
}

describe('onboarding 向导', () => {
  beforeEach(() => {
    setupDom();
    Object.keys(store).forEach(k => delete store[k]);
    setSpy.mockClear();
    initOnboardingWizard();
  });

  it('未配置时自动弹出第一步', async () => {
    await maybeShowOnboardingWizard();
    expect(document.querySelector('.onboarding-dialog')).toBeTruthy();
    expect(document.body.textContent).toContain('先接上你的大模型');
  });

  it('已配置时不自动弹出', async () => {
    store.apiKey = 'sk-x';
    store.modelName = 'deepseek-chat';
    await maybeShowOnboardingWizard();
    expect(document.querySelector('.onboarding-dialog')).toBeFalsy();
  });

  it('点跳过关闭向导并写入已提示标记', async () => {
    openOnboardingWizard();
    const skip = [...document.querySelectorAll('[data-action="skip"]')][0];
    skip.click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.querySelector('.onboarding-dialog')).toBeFalsy();
    expect(setSpy).toHaveBeenCalled();
    expect(store.onboardingWizardDismissedAt).toBeTruthy();
  });

  it('点击遮罩不关闭，右上角有关闭按钮', () => {
    openOnboardingWizard();
    document.querySelector('.onboarding-mask').click();
    expect(document.querySelector('.onboarding-dialog')).toBeTruthy();
    expect(document.querySelector('.onboarding-close-btn')).toBeTruthy();
  });

  it('点右上角关闭按钮关闭向导', () => {
    openOnboardingWizard();
    document.querySelector('.onboarding-close-btn').click();
    expect(document.querySelector('.onboarding-dialog')).toBeFalsy();
  });

  it('未配置时状态条可见', async () => {
    initOnboardingWizard();
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('onboardingStatusBar').style.display).not.toBe('none');
  });

  it('首页空态渲染价值主张文案', () => {
    expect(document.getElementById('welcomeExamples').textContent).toContain('一句话，让 AI 替你在网页上干活');
  });

  it('首屏厂商走马灯渲染两组共 14 个标签', () => {
    openOnboardingWizard();
    expect(document.querySelectorAll('.onboarding-marquee .onboarding-chip')).toHaveLength(14);
    expect(document.querySelector('.onboarding-marquee').textContent).toContain('DeepSeek');
    expect(document.querySelector('.onboarding-marquee').textContent).toContain('Google Gemini');
  });

  it('正在生成时不自动弹出向导', async () => {
    const { generatingSessionIds } = await import('../../src/side_panel/state.js');
    generatingSessionIds.add('s-generating');
    try {
      await maybeShowOnboardingWizard();
      expect(document.querySelector('.onboarding-dialog')).toBeFalsy();
    } finally {
      generatingSessionIds.delete('s-generating');
    }
  });

  it('第二步展示所选厂商的 API Base，且可修改', () => {
    openOnboardingWizard();
    document.querySelector('.onboarding-dialog [data-action="start"]').click();
    document.querySelector('.onboarding-dialog [data-provider="deepseek"]').click();
    document.querySelector('.onboarding-dialog [data-action="next"]').click();
    const base = document.getElementById('onboardingBase');
    expect(base.value).toBe('https://api.deepseek.com');
    base.value = 'https://relay.example.com/v1';
    base.dispatchEvent(new Event('input', { bubbles: true }));
    expect(base.value).toBe('https://relay.example.com/v1');
  });

  it('自定义服务商 API Base 为空时校验给出提示', () => {
    openOnboardingWizard();
    document.querySelector('.onboarding-dialog [data-action="start"]').click();
    document.querySelector('.onboarding-dialog [data-provider="custom"]').click();
    document.querySelector('.onboarding-dialog [data-action="next"]').click();
    expect(document.getElementById('onboardingBase').value).toBe('');
    document.getElementById('onboardingKey').value = 'sk-test';
    document.getElementById('onboardingKey').dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.onboarding-dialog [data-action="verify"]').click();
    expect(document.querySelector('.onboarding-base-error')).toBeTruthy();
  });

  it('Key 可切换明文，且不丢失已输入内容', () => {
    openOnboardingWizard();
    document.querySelector('.onboarding-dialog [data-action="start"]').click();
    document.querySelector('.onboarding-dialog [data-provider="deepseek"]').click();
    document.querySelector('.onboarding-dialog [data-action="next"]').click();
    const input = document.getElementById('onboardingKey');
    input.value = 'sk-abc';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-action="toggle-key"]').click();
    const afterToggle = document.getElementById('onboardingKey');
    expect(afterToggle.type).toBe('text');
    expect(afterToggle.value).toBe('sk-abc');
    document.querySelector('[data-action="toggle-key"]').click();
    expect(document.getElementById('onboardingKey').type).toBe('password');
  });
});
