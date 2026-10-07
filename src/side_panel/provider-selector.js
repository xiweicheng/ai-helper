// side_panel/provider-selector.js - API 厂商快速切换（模型设置弹窗顶部）
//
// 数据与同步逻辑统一在 shared/model-profiles.js：切换配置即把地址/Key/模型名
// 写回扁平键（触发 index.js 中 customModels/modelName 的 storage 监听完成模型列表刷新）。
// 本模块负责渲染厂商选择行（当前项）+ 浮层列表、激活标记；"+"按钮为管理配置入口。
//
// 注意：行使用 .provider-option 独立类名，避免与全局 .model-option 选择器
// （updateModelSelection / 点击绑定）冲突；区块使用 .provider-section 类名，
// 避免 tempDropdown.querySelector('.model-section') 误选中。

import { getState, applyProfile, getHostFromApiBase, compareByName } from '../shared/model-profiles.js';
import { closeAllSectionSelects, sectionSelectSearchHtml } from './section-select.js';
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
 * 渲染厂商选择行（当前配置名 + host）与浮层列表（名称 + 激活勾选 + host）
 */
async function renderProviderList() {
  const list = document.getElementById('providerList');
  const valueEl = document.getElementById('providerSelectValue');
  const hostEl = document.getElementById('providerSelectHost');
  if (!list) return;

  const state = await getState();
  const active = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];

  // 选择行显示当前配置
  if (valueEl) valueEl.textContent = active ? active.name : '';
  if (hostEl) hostEl.textContent = active ? getHostFromApiBase(active.apiBase) : '';

  // 过滤搜索框（吸顶）+ 选项按名称排序渲染（仅影响展示顺序，不改变存储顺序）
  list.innerHTML = sectionSelectSearchHtml();

  const sortedProfiles = [...state.profiles].sort((a, b) => compareByName(a.name, b.name));
  for (const profile of sortedProfiles) {
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
      closeAllSectionSelects();
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
 * "+"按钮（管理厂商配置）：打开/聚焦配置页基础 tab（沿用 headerAgentIndicator 的既有模式）
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
