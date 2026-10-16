// options/network-access-config.js - 内网地址访问允许列表管理
//
// 与「域名屏蔽」（toolbar-config.js）用同一套列表控件样式，但语义不同：
// 这里是 allow-list，只在总开关开启时生效；且条目允许 IP / 主机名 / *.example.com，
// 所以不能沿用域名屏蔽那条「必须含点」的校验。
// 条目清洗与匹配规则全部复用 src/shared/network-scope.js，保证设置页与
// 后台拦截用的是同一份语义（两侧不同义是 SEC-03 的复发路径）。

import { t } from '../shared/i18n.js';
import { toCleanHostList } from '../shared/network-scope.js';
import { DEFAULT_REACT_CONFIG } from './constants.js';

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function getAllowlist() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['allowedNetworkHosts'], (result) => {
      resolve(Array.isArray(result.allowedNetworkHosts) ? result.allowedNetworkHosts : DEFAULT_REACT_CONFIG.allowedNetworkHosts);
    });
  });
}

// 加载并渲染允许列表
export function loadNetworkAllowlistUI() {
  getAllowlist().then((list) => renderNetworkAllowlistList(list));
}

function renderNetworkAllowlistList(list) {
  const listEl = document.getElementById('networkAllowlistList');
  if (!listEl) return;

  if (list.length === 0) {
    listEl.innerHTML = `<div class="domain-blocklist-empty">${t('react.networkAllowlistEmpty')}</div>`;
  } else {
    listEl.innerHTML = list.map((host) => `
      <div class="domain-blocklist-item">
        <span class="domain-blocklist-item-name" title="${escapeHtml(host)}">${escapeHtml(host)}</span>
        <button class="domain-blocklist-item-remove" data-host="${escapeHtml(host)}" title="${t('react.networkHostRemove')}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    `).join('');
  }
}

// 添加主机到允许列表；callback({}) 成功，callback({ error }) 失败
export function addNetworkHost(rawHost, callback) {
  // 与拦截侧同一份清洗：用户常直接粘贴 http://192.168.1.10:8080/path
  const entry = toCleanHostList([rawHost])[0];
  if (!entry) {
    if (callback) callback({ error: t('react.networkHostEmpty') });
    return;
  }
  if (/\s/.test(entry)) {
    if (callback) callback({ error: t('react.networkHostInvalid') });
    return;
  }

  getAllowlist().then((list) => {
    if (list.includes(entry)) {
      if (callback) callback({ error: t('react.networkHostExists') });
      return;
    }
    const next = [...list, entry];
    chrome.storage.local.set({ allowedNetworkHosts: next }, () => {
      renderNetworkAllowlistList(next);
      if (callback) callback({});
    });
  });
}

// 移除主机
export function removeNetworkHost(host) {
  getAllowlist().then((list) => {
    const next = list.filter((d) => d !== host);
    // 只写列表：任何情况下都不动 networkAccessEnabled（否则清一条条目会连带把总闸关掉，
    // 下次开闸时用户会以为白名单还在）
    chrome.storage.local.set({ allowedNetworkHosts: next }, () => {
      renderNetworkAllowlistList(next);
    });
  });
}

// 总开关关闭时整块隐藏白名单（条目保留不清空，开闸后立即可见可编辑）
// 沿用「流式输出 → 流式工具卡片默认展开」那套 wrap 显隐做法，不在这里另立机制
export function setNetworkAllowlistVisible(visible) {
  const wrap = document.getElementById('networkAllowlistWrap');
  if (wrap) wrap.style.display = visible ? 'block' : 'none';
}
