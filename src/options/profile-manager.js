// options/profile-manager.js - 厂商配置切换与记忆管理
//
// 基础 tab 顶部的"厂商配置"下拉切换器：新建 / 另存为 / 重命名 / 删除，
// 切换即生效（applyProfile 会把配置字段同步回扁平键）。
// 数据与同步逻辑统一在 shared/model-profiles.js。

import {
  getState,
  applyProfile,
  createProfile,
  renameProfile,
  deleteProfile,
  getHostFromApiBase,
  deriveProfileName,
  DEFAULT_API_BASE,
  DEFAULT_MODEL_NAME,
} from '../shared/model-profiles.js';
import {
  currentModel,
  setCurrentModel,
  renderModelDropdownFromList,
  collectModelsFromDropdown,
  updateApiBaseSelection,
  updateSelectedCtxBadge,
  showToast,
} from './config-manager.js';
import { t } from '../shared/i18n.js';

let modalMode = null; // 'name' | 'confirm'
let modalResolve = null;

// ============================================================
// 下拉切换器渲染与事件
// ============================================================

/**
 * 初始化厂商配置切换器（在 ensureProfilesMigrated 之后调用）
 */
export async function initProfileManager() {
  bindProfileEvents();
  watchProfileStorage();
  await refreshProfileDropdown();
}

/**
 * 重新渲染厂商配置下拉（激活项高亮 + 输入框显示当前名称）
 */
async function refreshProfileDropdown() {
  const state = await getState();
  const dropdown = document.getElementById('profileDropdown');
  const input = document.getElementById('profileInput');
  if (!dropdown || !input) return;

  const active = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];
  dropdown.innerHTML = '';

  for (const profile of state.profiles) {
    const option = document.createElement('div');
    option.className = 'profile-option';
    option.dataset.value = profile.id;
    if (active && profile.id === active.id) option.classList.add('selected');

    const leftSpan = document.createElement('span');
    leftSpan.className = 'profile-option-left';
    leftSpan.textContent = profile.name;
    option.appendChild(leftSpan);

    const host = getHostFromApiBase(profile.apiBase);
    if (host) {
      const rightSpan = document.createElement('span');
      rightSpan.className = 'profile-option-right';
      rightSpan.textContent = host;
      option.appendChild(rightSpan);
    }
    dropdown.appendChild(option);
  }

  input.value = active ? active.name : '';
}

function bindProfileEvents() {
  const input = document.getElementById('profileInput');
  const dropdown = document.getElementById('profileDropdown');
  if (!input || !dropdown) return;

  input.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });

  dropdown.addEventListener('click', (e) => {
    const option = e.target.closest('.profile-option');
    if (!option) return;
    e.stopPropagation();
    dropdown.classList.remove('show');
    handleProfileSwitch(option.dataset.value);
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target) && e.target !== input) {
      dropdown.classList.remove('show');
    }
  });

  document.getElementById('profileNewBtn')?.addEventListener('click', handleProfileNew);
  document.getElementById('profileDupBtn')?.addEventListener('click', handleProfileDuplicate);
  document.getElementById('profileRenameBtn')?.addEventListener('click', handleProfileRename);
  document.getElementById('profileDeleteBtn')?.addEventListener('click', handleProfileDelete);

  bindProfileModal();
}

/**
 * 监听配置列表变化（覆盖侧边栏切换、导入配置等场景）
 */
function watchProfileStorage() {
  chrome.storage.onChanged.addListener(async (changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.modelProfiles) {
      refreshProfileDropdown();
    }
    if (changes.activeProfileId) {
      const state = await getState();
      const active = state.profiles.find(p => p.id === state.activeProfileId);
      if (active) refreshBasicFieldsFromProfile(active);
      refreshProfileDropdown();
    }
  });
}

// ============================================================
// 切换 / 新建 / 另存为 / 重命名 / 删除
// ============================================================

/**
 * 切换激活配置（立即生效）
 */
async function handleProfileSwitch(id) {
  const state = await getState();
  if (id === state.activeProfileId) return;

  const profile = await applyProfile(id);
  if (!profile) return;

  refreshBasicFieldsFromProfile(profile);
  await refreshProfileDropdown();
  showToast(`✅ ${t('settings.profileSwitched', { name: profile.name })}`, 'success');
}

/**
 * 新建空配置并激活（名称弹窗默认可由当前表单地址推导）
 */
async function handleProfileNew() {
  const suggested = deriveProfileName(profileFormApiBase()) || '';
  const name = await openProfileModal({
    mode: 'name',
    title: t('settings.profileNameTitle'),
    defaultValue: suggested,
  });
  if (!name) return;

  const profile = await createProfile({
    name,
    apiBase: DEFAULT_API_BASE,
    apiKey: '',
    modelName: DEFAULT_MODEL_NAME,
    models: [],
  }, { activate: true });

  refreshBasicFieldsFromProfile(profile);
  await refreshProfileDropdown();
  showToast(`✅ ${t('settings.profileCreated', { name: profile.name })}`, 'success');
}

/**
 * 以当前表单内容另存为新配置并激活
 */
async function handleProfileDuplicate() {
  const state = await getState();
  const active = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];
  if (!active) return;

  const name = await openProfileModal({
    mode: 'name',
    title: t('settings.saveAsProfile'),
    defaultValue: `${active.name} ${t('settings.profileCopySuffix')}`,
  });
  if (!name) return;

  const modelInput = document.getElementById('modelInput');
  const profile = await createProfile({
    name,
    apiBase: profileFormApiBase(),
    apiKey: document.getElementById('apiKey')?.value.trim() || '',
    modelName: modelInput?.value || currentModel || DEFAULT_MODEL_NAME,
    models: collectModelsFromDropdown(),
  }, { activate: true });

  refreshBasicFieldsFromProfile(profile);
  await refreshProfileDropdown();
  showToast(`✅ ${t('settings.profileCreated', { name: profile.name })}`, 'success');
}

/**
 * 重命名当前配置
 */
async function handleProfileRename() {
  const state = await getState();
  const active = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];
  if (!active) return;

  const name = await openProfileModal({
    mode: 'name',
    title: t('settings.renameProfile'),
    defaultValue: active.name,
  });
  if (!name || name === active.name) return;

  await renameProfile(active.id, name);
  await refreshProfileDropdown();
  showToast(`✅ ${t('settings.profileRenamed', { name })}`, 'success');
}

/**
 * 删除当前配置（至少保留一个；删除激活项后自动激活剩余第一个）
 */
async function handleProfileDelete() {
  const state = await getState();
  const active = state.profiles.find(p => p.id === state.activeProfileId) || state.profiles[0];
  if (!active) return;

  if (state.profiles.length <= 1) {
    showToast(`⚠️ ${t('settings.atLeastOneProfile')}`, 'error');
    return;
  }

  const confirmed = await openProfileModal({
    mode: 'confirm',
    title: t('settings.deleteProfile'),
    message: t('settings.deleteProfileConfirm', { name: active.name }),
  });
  if (!confirmed) return;

  const result = await deleteProfile(active.id);
  if (!result.deleted) {
    showToast(`⚠️ ${t('settings.atLeastOneProfile')}`, 'error');
    return;
  }

  if (result.nextActive) {
    refreshBasicFieldsFromProfile(result.nextActive);
  }
  await refreshProfileDropdown();
  showToast(`🗑️ ${t('settings.profileDeleted', { name: active.name })}`, 'success');
}

// ============================================================
// 表单字段刷新
// ============================================================

/**
 * 读取当前表单中的 API Base（用于默认命名）
 */
function profileFormApiBase() {
  return document.getElementById('apiBase')?.value.trim() || DEFAULT_API_BASE;
}

/**
 * 用配置数据刷新基础 tab 的表单字段（地址/Key/模型下拉）
 */
function refreshBasicFieldsFromProfile(profile) {
  const apiBase = profile.apiBase || DEFAULT_API_BASE;
  const modelName = profile.modelName || DEFAULT_MODEL_NAME;

  const apiBaseInput = document.getElementById('apiBase');
  if (apiBaseInput) apiBaseInput.value = apiBase;
  updateApiBaseSelection(apiBase);

  const apiKeyInput = document.getElementById('apiKey');
  if (apiKeyInput) apiKeyInput.value = profile.apiKey || '';

  setCurrentModel(modelName);
  const modelInput = document.getElementById('modelInput');
  if (modelInput) modelInput.value = modelName;

  renderModelDropdownFromList(profile.models || [], modelName);
  updateSelectedCtxBadge('modelInput', 'modelSelectedCtxBadge', 'modelDropdown');
}

// ============================================================
// 弹窗（名称输入 / 删除确认复用）
// ============================================================

function bindProfileModal() {
  const modal = document.getElementById('profileModal');
  if (!modal || modal.dataset.bound) return;
  modal.dataset.bound = '1';

  document.getElementById('profileModalOkBtn')?.addEventListener('click', submitProfileModal);
  document.getElementById('profileModalCancelBtn')?.addEventListener('click', () => closeProfileModal(null));
  document.getElementById('profileModalCloseBtn')?.addEventListener('click', () => closeProfileModal(null));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeProfileModal(null);
  });
  document.getElementById('profileNameInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitProfileModal();
    if (e.key === 'Escape') closeProfileModal(null);
  });
}

/**
 * 打开弹窗并等待用户操作
 * @param {{mode:'name'|'confirm', title:string, message?:string, defaultValue?:string}} opts
 * @returns {Promise<string|boolean|null>} 名称模式下返回名称；确认模式下返回 true/false；取消返回 null
 */
function openProfileModal({ mode, title, message = '', defaultValue = '' }) {
  const modal = document.getElementById('profileModal');
  if (!modal) return Promise.resolve(null);

  modalMode = mode;
  document.getElementById('profileModalTitle').textContent = title;

  const messageEl = document.getElementById('profileModalMessage');
  messageEl.textContent = message;
  messageEl.style.display = message ? '' : 'none';

  const input = document.getElementById('profileNameInput');
  input.value = defaultValue;
  input.style.display = mode === 'name' ? '' : 'none';

  modal.style.display = 'flex';
  if (mode === 'name') {
    setTimeout(() => input.focus(), 50);
  }

  return new Promise((resolve) => {
    modalResolve = resolve;
  });
}

function submitProfileModal() {
  if (!modalResolve) return;
  if (modalMode === 'name') {
    const name = document.getElementById('profileNameInput').value.trim();
    if (!name) {
      showToast(`❌ ${t('settings.profileNameRequired')}`, 'error');
      return;
    }
    closeProfileModal(name);
  } else {
    closeProfileModal(true);
  }
}

function closeProfileModal(result) {
  const modal = document.getElementById('profileModal');
  if (modal) modal.style.display = 'none';
  modalMode = null;
  const resolve = modalResolve;
  modalResolve = null;
  if (resolve) resolve(result);
}
