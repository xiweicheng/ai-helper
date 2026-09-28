// side_panel/provider-selector.js - API 厂商快速切换（模型设置弹窗顶部）
//
// 数据与同步逻辑统一在 shared/model-profiles.js：切换配置即把地址/Key/模型名
// 写回扁平键（触发 index.js 中 customModels/modelName 的 storage 监听完成模型列表刷新）。
// 本模块只负责渲染厂商列表、激活标记与管理入口。
//
// 注意：行使用 .provider-option 独立类名，避免与全局 .model-option 选择器
// （updateModelSelection / 点击绑定）冲突；区块使用 .provider-section 类名，
// 避免 tempDropdown.querySelector('.model-section') 误选中。

import { getState, applyProfile, getHostFromApiBase } from '../shared/model-profiles.js';
import logger from '../shared/logger.js';

let bound = false;

/**
 * 初始化厂商切换器（在 ensureProfilesMigrated 之后调用）
 */
export async function initProviderSelector() {
  const list = document.getElementById('providerList');
  if (!list) return;

  if (!bound) {
    bound = true;
    bindManageButton();
    watchStorage();
  }

  await renderProviderList();
}

/**
 * 渲染厂商列表（名称 + 激活勾选，右侧显示地址 host）
 */
async function renderProviderList() {
  const list = document.getElementById('providerList');
  if (!list) return;

  const state = await getState();
  const active = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];
  list.innerHTML = '';

  for (const profile of state.profiles) {
    const isActive = !!active && profile.id === active.id;

    const option = document.createElement('div');
    option.className = 'provider-option' + (isActive ? ' selected' : '');
    option.dataset.value = profile.id;

    const check = document.createElement('span');
    check.className = 'provider-option-check';
    check.textContent = isActive ? '✓' : '';
    option.appendChild(check);

    const left = document.createElement('span');
    left.className = 'provider-option-left';
    left.textContent = profile.name;
    option.appendChild(left);

    const host = getHostFromApiBase(profile.apiBase);
    if (host) {
      const right = document.createElement('span');
      right.className = 'provider-option-right';
      right.textContent = host;
      option.appendChild(right);
    }

    option.addEventListener('click', (e) => {
      e.stopPropagation();
      handleSwitch(profile.id);
    });

    list.appendChild(option);
  }
}

/**
 * 切换激活配置（立即生效；模型列表由 index.js 的 storage 监听自动刷新）
 */
async function handleSwitch(id) {
  const state = await getState();
  if (id === state.activeProfileId) return;

  const profile = await applyProfile(id);
  if (!profile) return;

  await renderProviderList();
  logger.debug('[SidePanel] provider switched:', profile.name);
}

/**
 * "管理配置…"：打开/聚焦配置页基础 tab（沿用 headerAgentIndicator 的既有模式）
 */
function bindManageButton() {
  const btn = document.getElementById('providerManageBtn');
  if (!btn) return;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const url = chrome.runtime.getURL('options.html#basic');
    const tabs = await chrome.tabs.query({ url: chrome.runtime.getURL('options.html') });
    if (tabs.length > 0) {
      await chrome.tabs.update(tabs[0].id, { active: true, url });
    } else {
      await chrome.tabs.create({ url });
    }
  });
}

/**
 * 监听配置列表变化（覆盖配置页编辑、导入配置等场景）
 */
function watchStorage() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.modelProfiles || changes.activeProfileId) {
      renderProviderList();
    }
  });
}
