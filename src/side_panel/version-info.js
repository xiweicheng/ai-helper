// version-info.js - 侧边栏「版本信息」弹窗
//
// 数据来源: src/config/version.json —— 由 agent/publish.sh 在「git 提交 + 打 tag」前写入，
// 扩展构建（含 GitHub Actions）时打包进产物。展示的即「该构建对应的发布版本」:
//   version     发布时的 NPM 包版本（= git tag 去掉 v 前缀）
//   tag         发布 tag（如 v1.17.3）
//   commitId    发布瞬间 HEAD 的完整 commit id（即发布提交的父提交）
//   publishedAt 发布时间（ISO 8601）
//
// 弹窗底部附带仓库链接（GitHub/Gitee，原「更多菜单」项合并至此）
import versionMeta from '../config/version.json';
import { t } from '../shared/i18n.js';
import { showToast } from './utils.js';

const PLACEHOLDER = '—';

// 仓库链接（原「更多菜单」中的 GitHub/Gitee 项合并至此展示）
const REPO_LINKS = [
  {
    labelKey: 'versionInfo.githubRepo',
    url: 'https://github.com/xiweicheng/ai-helper',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.76 2.7 1.25 3.36.96.1-.75.4-1.25.72-1.54-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.1 11.1 0 012.9-.39c.98 0 1.97.13 2.9.39 2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.68.8.56A11.51 11.51 0 0023.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>',
  },
  {
    labelKey: 'versionInfo.giteeRepo',
    url: 'https://gitee.com/xiweicheng/ai-helper',
    icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.984 0A12 12 0 000 12a12 12 0 0012 12 12 12 0 0012-12A12 12 0 0012 0zm6.09 5.333c.328 0 .593.266.592.593v1.482a.594.594 0 01-.593.592H9.777c-.982 0-1.778.796-1.778 1.778v5.63c0 .327.266.592.593.592h5.63c.982 0 1.778-.796 1.778-1.778v-.296a.593.593 0 00-.592-.593h-4.15a.592.592 0 01-.592-.592v-1.482a.593.593 0 01.593-.592h6.815c.327 0 .593.265.593.592v3.408a4 4 0 01-4 4H8.444a3.556 3.556 0 01-3.555-3.556V8.89a3.556 3.556 0 013.555-3.556h9.63z"/></svg>',
  },
];

/**
 * 规范化版本元数据：仅取约定的四个字符串字段并去除空白，缺失/非法一律为空串
 * @param {unknown} raw
 * @returns {{version: string, tag: string, commitId: string, publishedAt: string}}
 */
export function normalizeVersionMeta(raw) {
  const pick = v => (typeof v === 'string' ? v.trim() : '');
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    version: pick(src.version),
    tag: pick(src.tag),
    commitId: pick(src.commitId),
    publishedAt: pick(src.publishedAt),
  };
}

/**
 * 将 ISO 发布时间格式化为本地时间字符串；空值/非法日期返回占位符
 * @param {string} publishedAt
 * @returns {string}
 */
export function formatPublishedAt(publishedAt) {
  if (!publishedAt) return PLACEHOLDER;
  const ts = Date.parse(publishedAt);
  if (Number.isNaN(ts)) return PLACEHOLDER;
  return new Date(ts).toLocaleString();
}

/**
 * 按当前语言渲染弹窗内容行（打开弹窗前调用，保证语言切换后文案最新）
 * @param {HTMLElement} listEl
 */
function renderVersionInfoRows(listEl) {
  const meta = normalizeVersionMeta(versionMeta);
  const rows = [
    { label: t('versionInfo.version'), value: meta.version ? `v${meta.version}` : PLACEHOLDER },
    { label: t('versionInfo.tag'), value: meta.tag || PLACEHOLDER },
    { label: t('versionInfo.commit'), value: meta.commitId ? meta.commitId.slice(0, 8) : PLACEHOLDER, title: meta.commitId, mono: true },
    { label: t('versionInfo.publishedAt'), value: formatPublishedAt(meta.publishedAt) },
  ];

  listEl.textContent = '';
  for (const row of rows) {
    const rowEl = document.createElement('div');
    rowEl.className = 'version-info-row';

    const labelEl = document.createElement('div');
    labelEl.className = 'version-info-label';
    labelEl.textContent = row.label;

    const valueEl = document.createElement('div');
    valueEl.className = row.mono ? 'version-info-value mono' : 'version-info-value';
    valueEl.textContent = row.value;
    if (row.title) valueEl.title = row.title;

    rowEl.appendChild(labelEl);
    rowEl.appendChild(valueEl);
    listEl.appendChild(rowEl);
  }
}

/**
 * 渲染仓库链接行（整行可点击，点击后新标签页打开）
 * @param {HTMLElement} linksEl
 */
function renderRepoLinks(linksEl) {
  linksEl.textContent = '';
  for (const link of REPO_LINKS) {
    const rowEl = document.createElement('div');
    rowEl.className = 'version-info-link';
    rowEl.title = link.url;

    const iconEl = document.createElement('span');
    iconEl.className = 'version-info-link-icon';
    iconEl.innerHTML = link.icon;

    const labelEl = document.createElement('span');
    labelEl.className = 'version-info-link-label';
    labelEl.textContent = t(link.labelKey);

    const arrowEl = document.createElement('span');
    arrowEl.className = 'version-info-link-arrow';
    arrowEl.textContent = '↗';

    rowEl.appendChild(iconEl);
    rowEl.appendChild(labelEl);
    rowEl.appendChild(arrowEl);
    rowEl.addEventListener('click', () => {
      chrome.tabs.create({ url: link.url });
    });

    linksEl.appendChild(rowEl);
  }
}

/**
 * 复制按钮使用的全文信息（字段缺失时用占位符）
 * @returns {string}
 */
function buildCopyText() {
  const meta = normalizeVersionMeta(versionMeta);
  return [
    `AI Helper v${meta.version || PLACEHOLDER}`,
    `${t('versionInfo.tag')}: ${meta.tag || PLACEHOLDER}`,
    `${t('versionInfo.commit')}: ${meta.commitId || PLACEHOLDER}`,
    `${t('versionInfo.publishedAt')}: ${formatPublishedAt(meta.publishedAt)}`,
  ].join('\n');
}

/** 初始化「版本信息」菜单项与弹窗（由 index.js 在 DOMContentLoaded 时调用） */
export function initVersionInfo() {
  const btn = document.getElementById('versionInfoBtn');
  const modal = document.getElementById('versionInfoModal');
  const closeBtn = document.getElementById('versionInfoCloseBtn');
  const copyBtn = document.getElementById('versionInfoCopyBtn');
  const listEl = document.getElementById('versionInfoList');
  const linksEl = document.getElementById('versionInfoLinks');
  if (!btn || !modal || !listEl) return;

  const hide = () => {
    modal.style.display = 'none';
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // 关闭更多操作下拉
    const dropdown = document.getElementById('headerMoreDropdown');
    if (dropdown) dropdown.classList.remove('show');
    renderVersionInfoRows(listEl);
    if (linksEl) renderRepoLinks(linksEl);
    modal.style.display = 'flex';
  });

  if (closeBtn) closeBtn.addEventListener('click', hide);

  // 点击遮罩空白处关闭
  modal.addEventListener('click', (e) => {
    if (e.target === modal) hide();
  });

  // Esc 关闭（仅弹窗打开时生效）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.style.display === 'flex') hide();
  });

  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(buildCopyText());
        showToast(t('common.copySuccess'), 'success');
      } catch (err) {
        showToast(t('common.copyFailed'), 'error');
      }
    });
  }
}
