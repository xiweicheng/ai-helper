// 内置目录浏览器视图：在「切换工作目录」弹窗内浏览 Agent 主机目录。
// 纯 HTTP（/api/fs/browse）+ DOM 渲染，不依赖系统原生弹窗，
// 因此 Git Bash / CMD / PowerShell / 远端 / 无头环境行为一致。

import { escapeHtml } from './utils.js';

/**
 * 把绝对路径拆成可点击的面包屑段。
 * - Windows：C:\Users\me → [C:, C:\Users, C:\Users\me]
 * - POSIX：/Users/me → [/, /Users, /Users/me]
 * - UNC：不做拆分，整段作为一个不可下钻的节点展示
 */
export function buildBreadcrumbSegments(fullPath, platform = 'win32') {
  const raw = String(fullPath || '').trim();
  if (!raw) return [];

  if (platform === 'win32') {
    if (raw.startsWith('\\\\')) return [{ name: raw, path: raw }];
    const normalized = raw.replace(/\//g, '\\');
    const parts = normalized.split('\\').filter(Boolean);
    if (!parts.length) return [];
    const segments = [];
    let acc = '';
    parts.forEach((part, index) => {
      acc = index === 0 ? `${part}\\` : (acc.endsWith('\\') ? `${acc}${part}` : `${acc}\\${part}`);
      segments.push({ name: part, path: acc });
    });
    return segments;
  }

  const parts = raw.split('/').filter(Boolean);
  const segments = [{ name: '/', path: '/' }];
  let acc = '';
  for (const part of parts) {
    acc = `${acc}/${part}`;
    segments.push({ name: part, path: acc });
  }
  return segments;
}

/** 把接口错误码映射到 i18n 键（统一由调用方做 t()） */
export function browseErrorTextKey(code) {
  switch (code) {
    case 'path_not_found':
      return 'workspace.browseNotFound';
    case 'not_a_directory':
      return 'workspace.browseNotDir';
    case 'permission_denied':
      return 'workspace.browsePermissionDenied';
    case 'bad_path':
    case 'path_too_long':
      return 'workspace.browseBadPath';
    case 'timeout':
    case 'client-timeout':
      return 'workspace.browseTimeout';
    case 'rate_limited':
    case 'too-frequent':
      return 'workspace.browseRateLimited';
    case 'endpoint-missing':
      return 'workspace.browseUnsupported';
    default:
      return 'workspace.browseLoadFailed';
  }
}

function iconForRoot(kind) {
  if (kind === 'drive') return '💽';
  if (kind === 'home') return '🏠';
  if (kind === 'root') return '🗂';
  return '📁';
}

/**
 * @param {Object} options
 * @param {HTMLElement} options.container 承载视图的容器（弹窗内）
 * @param {Function} options.t i18n
 * @param {string} [options.platform] Agent 平台（win32/darwin/linux）
 * @param {string} [options.platformName] 平台展示名（Windows/macOS/Linux）
 * @param {string} [options.hostname] Agent 主机名
 * @param {Function} options.listDirs (path) => Promise<payload>
 * @param {Function} options.onSelect (path) => void
 * @param {Function} [options.onClose] 视图关闭后回调（恢复列表视图）
 * @param {boolean} [options.canUseNative] 是否展示「改用系统对话框」
 * @param {Function} [options.onUseNative] 点击原生弹窗入口
 */
export function createWorkdirBrowserView(options) {
  const {
    container,
    t,
    platform = 'win32',
    platformName = '',
    hostname = '',
    listDirs,
    onSelect,
    onClose,
    canUseNative = false,
    onUseNative,
  } = options;

  const el = document.createElement('div');
  el.className = 'wdb-view';
  el.hidden = true;
  el.innerHTML = `
    <div class="wdb-header">
      <div class="wdb-agent">${escapeHtml(t('workspace.browseAgentHost', {
        platform: platformName || platform,
        host: hostname || '-',
      }))}</div>
      <div class="wdb-purge" hidden></div>
      <div class="wdb-roots"></div>
    </div>
    <div class="wdb-error" hidden></div>
    <div class="wdb-crumbs"></div>
    <div class="wdb-list" role="listbox" tabindex="0" aria-label="${escapeHtml(t('workspace.browseRoots'))}"></div>
    <div class="wdb-footer">
      <button type="button" class="wdb-btn wdb-back">${escapeHtml(t('workspace.browseBackToList'))}</button>
      <span class="wdb-spacer"></span>
      <button type="button" class="wdb-btn wdb-native" ${canUseNative ? '' : 'hidden'}>${escapeHtml(t('workspace.browseUseNative'))}</button>
      <button type="button" class="wdb-btn wdb-choose" disabled>${escapeHtml(t('workspace.browseChooseCurrent'))}</button>
    </div>`;
  container.appendChild(el);

  const refs = {
    roots: el.querySelector('.wdb-roots'),
    error: el.querySelector('.wdb-error'),
    crumbs: el.querySelector('.wdb-crumbs'),
    list: el.querySelector('.wdb-list'),
    back: el.querySelector('.wdb-back'),
    native: el.querySelector('.wdb-native'),
    choose: el.querySelector('.wdb-choose'),
  };

  const state = {
    currentPath: null,
    parent: null,
    roots: [],
    entries: [],
    selectedPath: null,
    selectedIndex: -1,
    truncated: false,
    loading: false,
    outdated: false,
    errorText: '',
    reqSeq: 0,
  };

  // 双击进入要求「两次点击落在同一目录项」：单击根节点会先触发导航并异步重渲染，
  // 第二次点击可能落到新列表的其它项上（例如双击盘符后命中第一个子目录）。
  // 用这个待进入记录把双击锁定在同一路径。
  let pendingEnter = null;
  const DOUBLE_CLICK_MS = 600;

  function items() {
    return Array.from(refs.list.querySelectorAll('.wdb-item'));
  }

  function renderRoots() {
    if (!state.roots.length) {
      refs.roots.innerHTML = '';
      return;
    }
    refs.roots.innerHTML = `<span class="wdb-roots-label">${escapeHtml(t('workspace.browseRoots'))}</span>`
      + state.roots.map((root) => `<button type="button" class="wdb-root" data-path="${escapeHtml(root.path)}" title="${escapeHtml(root.path)}">`
        + `${iconForRoot(root.kind)} ${escapeHtml(root.name)}</button>`).join('');
  }

  function renderCrumbs() {
    if (!state.currentPath) {
      refs.crumbs.innerHTML = '';
      return;
    }
    const segments = buildBreadcrumbSegments(state.currentPath, platform);
    refs.crumbs.innerHTML = segments.map((seg, index) => {
      const isLast = index === segments.length - 1;
      return `<button type="button" class="wdb-crumb${isLast ? ' current' : ''}" data-path="${escapeHtml(seg.path)}" title="${escapeHtml(seg.path)}"${isLast ? ' disabled' : ''}>${escapeHtml(seg.name)}</button>`;
    }).join('<span class="wdb-crumb-sep">›</span>');
  }

  function renderList() {
    if (state.outdated) {
      refs.list.innerHTML = `<div class="wdb-state">${escapeHtml(t('workspace.browseUnsupported'))}</div>`;
      return;
    }
    if (state.loading) {
      refs.list.innerHTML = `<div class="wdb-state">${escapeHtml(t('workspace.browseLoading'))}</div>`;
      return;
    }

    const rootMode = !state.currentPath;
    const list = rootMode
      ? state.roots.map((root) => ({ name: root.name, path: root.path, kind: root.kind, link: false }))
      : state.entries;

    if (!list.length) {
      refs.list.innerHTML = `<div class="wdb-state">${escapeHtml(t('workspace.browseEmpty'))}</div>`;
      return;
    }

    refs.list.innerHTML = list.map((item) => {
      const selected = state.selectedPath && item.path === state.selectedPath;
      const icon = rootMode ? iconForRoot(item.kind) : '📁';
      const linkTag = item.link ? `<span class="wdb-link">${escapeHtml(t('workspace.browseLinkTag'))}</span>` : '';
      // 行内快捷入口：悬停或选中该行时出现在最右侧，作用等同底部「选择此目录」
      // （根节点层是导航入口，不提供选择动作）
      const pickBtn = rootMode
        ? ''
        : `<span class="wdb-pick" role="button" data-pick="1" title="${escapeHtml(t('workspace.browseChooseDir'))}" aria-label="${escapeHtml(t('workspace.browseChooseDir'))}">✓</span>`;
      return `<button type="button" class="wdb-item${selected ? ' selected' : ''}" role="option" aria-selected="${selected ? 'true' : 'false'}" data-path="${escapeHtml(item.path)}" data-root="${rootMode ? '1' : '0'}" title="${escapeHtml(item.path)}">`
        + `<span class="wdb-item-icon">${icon}</span>`
        + `<span class="wdb-item-name">${escapeHtml(item.name)}</span>${linkTag}${pickBtn}</button>`;
    }).join('');

    if (state.truncated) {
      refs.list.insertAdjacentHTML('beforeend', `<div class="wdb-state wdb-truncated">${escapeHtml(t('workspace.browseTruncated'))}</div>`);
    }
  }

  function renderFooter() {
    if (state.selectedPath) {
      refs.choose.disabled = false;
      refs.choose.textContent = t('workspace.browseChooseDir');
      return;
    }
    refs.choose.disabled = !state.currentPath;
    refs.choose.textContent = t('workspace.browseChooseCurrent');
  }

  function renderError() {
    if (!state.errorText) {
      refs.error.hidden = true;
      refs.error.textContent = '';
      return;
    }
    refs.error.hidden = false;
    refs.error.textContent = state.errorText;
  }

  function render() {
    renderRoots();
    renderCrumbs();
    renderList();
    renderFooter();
    renderError();
  }

  function selectItem(path, index) {
    state.selectedPath = path;
    state.selectedIndex = index;
    items().forEach((itemEl) => {
      const on = itemEl.dataset.path === path;
      itemEl.classList.toggle('selected', on);
      itemEl.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    renderFooter();
  }

  async function load(targetPath) {
    const seq = ++state.reqSeq;
    pendingEnter = null; // 任何导航都会重渲染列表，之前的待进入记录随之失效
    state.loading = true;
    state.errorText = '';
    render();

    const payload = await listDirs(targetPath || '');
    if (seq !== state.reqSeq || el.hidden) return;

    state.loading = false;
    if (!payload || payload.success !== true) {
      if (payload && payload.outdated) {
        state.outdated = true;
        state.errorText = t('workspace.browseUnsupported');
      } else {
        const code = payload && payload.error ? payload.error : 'unknown';
        state.errorText = (payload && typeof payload.message === 'string' && payload.message)
          ? payload.message
          : t(browseErrorTextKey(code), { error: payload && payload.message ? payload.message : code });
      }
      render();
      return;
    }

    state.outdated = false;
    state.currentPath = payload.path || null;
    state.parent = payload.parent || null;
    state.roots = Array.isArray(payload.roots) ? payload.roots : [];
    state.entries = Array.isArray(payload.entries) ? payload.entries : [];
    state.truncated = !!payload.truncated;
    state.selectedPath = null;
    state.selectedIndex = -1;
    render();
    refs.list.scrollTop = 0;
  }

  // 根节点 / 面包屑：点击直接跳转
  refs.roots.addEventListener('click', (e) => {
    const btn = e.target.closest('.wdb-root');
    if (!btn) return;
    load(btn.dataset.path);
  });
  refs.crumbs.addEventListener('click', (e) => {
    const btn = e.target.closest('.wdb-crumb');
    if (!btn || btn.disabled) return;
    load(btn.dataset.path);
  });

  // 目录项：单击选中、双击进入下一层（与系统目录列表习惯一致）、行内 ✓ 快捷回填；
  // 根节点层单击即进入。底部「选择此目录」保留为第二个回填入口。
  refs.list.addEventListener('click', (e) => {
    const isRepeat = e.detail >= 2;
    const pickBtn = e.target.closest('.wdb-pick');
    if (pickBtn) {
      const host = pickBtn.closest('.wdb-item');
      if (host) choosePath(host.dataset.path);
      return;
    }
    const itemEl = e.target.closest('.wdb-item');
    if (!itemEl) return;
    if (itemEl.dataset.root === '1') {
      // 双击的第二下不再重复进入（第一下已经导航并重渲染，第二下可能落到别的项上）
      if (isRepeat) return;
      pendingEnter = null;
      load(itemEl.dataset.path);
      return;
    }
    selectItem(itemEl.dataset.path, items().indexOf(itemEl));
    // 只有「第一下点击」才登记：dblclick 据此确认两次点击指向同一路径
    if (!isRepeat) {
      pendingEnter = { path: itemEl.dataset.path, at: Date.now() };
    }
  });
  refs.list.addEventListener('dblclick', (e) => {
    // 行内 ✓ 自带选择动作，不参与双击进入
    if (e.target.closest('.wdb-pick')) return;
    const itemEl = e.target.closest('.wdb-item');
    if (!itemEl) return;
    // 单击根节点会先导航并重渲染；若第二次点击已落到别的项上，不能把它当成新的双击目标
    if (!pendingEnter || pendingEnter.path !== itemEl.dataset.path) return;
    if (Date.now() - pendingEnter.at > DOUBLE_CLICK_MS) return;
    load(itemEl.dataset.path);
  });

  refs.list.addEventListener('keydown', (e) => {
    if (state.loading || state.outdated) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const all = items();
      if (!all.length) return;
      e.preventDefault();
      const delta = e.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = Math.min(all.length - 1, Math.max(0, state.selectedIndex + delta));
      selectItem(all[nextIndex].dataset.path, nextIndex);
      all[nextIndex].scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const all = items();
      const current = state.selectedIndex >= 0 ? all[state.selectedIndex] : null;
      if (current) load(current.dataset.path);
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (state.parent) load(state.parent);
    }
  });

  refs.list.addEventListener('mousedown', () => {
    setTimeout(() => refs.list.focus(), 0);
  });

  refs.back.addEventListener('click', () => close());
  refs.native.addEventListener('click', () => {
    if (typeof onUseNative === 'function') onUseNative();
    close();
  });
  /** 选中并回填（按钮与双击共用同一出口） */
  function choosePath(path) {
    if (!path) return;
    if (typeof onSelect === 'function') onSelect(path);
    close();
  }
  refs.choose.addEventListener('click', () => {
    choosePath(state.selectedPath || state.currentPath);
  });

  function open(initialPath) {
    state.outdated = false;
    state.errorText = '';
    state.selectedPath = null;
    state.selectedIndex = -1;
    el.hidden = false;
    load(initialPath || '');
    setTimeout(() => refs.list.focus(), 0);
  }

  function close() {
    if (el.hidden) return;
    pendingEnter = null;
    state.reqSeq += 1;
    el.hidden = true;
    if (typeof onClose === 'function') onClose();
  }

  function destroy() {
    state.reqSeq += 1;
    el.remove();
  }

  return {
    element: el,
    open,
    close,
    destroy,
    isOpen: () => !el.hidden,
  };
}
