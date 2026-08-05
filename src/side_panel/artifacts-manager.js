// artifacts-manager.js - 任务文件产物管理
// 从任务执行日志（executionLog）中提取写文件操作，集中展示和管理产物文件。
// 提供定位到工作目录文件、预览文件等功能。

import { t, registerTranslations } from '../shared/i18n.js';
import { supportsPreview } from './workspace-manager.js';
import { locateFileInWorkspace, previewArtifactFile } from './workspace-panel.js';
import { getFileIcon } from './workspace-manager.js';
import logger from '../shared/logger.js';

// ============================================================
// 国际化
// ============================================================
registerTranslations('zh', {
  artifacts: {
    btnTitle: '文件产物（{count}）',
    modalTitle: '本次任务的文件产物',
    emptyHint: '本次任务没有产生文件产物',
    fileCol: '文件',
    sizeCol: '大小',
    typeCol: '类型',
    timeCol: '时间',
    actionCol: '操作',
    locate: '定位到文件',
    preview: '预览',
    closeBtn: '关闭',
    typeWrite: '写入',
    typeDelete: '删除',
    typeCreate: '创建',
    typeEdit: '编辑',
    typeOther: '操作',
    noWorkspace: '无法获取工作目录，请确认 Agent 已连接',
    locateFailed: '定位文件失败',
    fileNotFound: '目录已定位，但未找到该文件（可能已被删除）',
    previewFailed: '预览文件失败',
    previewNotSupported: '此文件类型不支持预览',
    totalCount: '共 {count} 个文件',
    badgeLabel: '产物',
  },
});

registerTranslations('en', {
  artifacts: {
    btnTitle: 'Artifacts ({count})',
    modalTitle: 'File Artifacts of This Task',
    emptyHint: 'No file artifacts produced in this task',
    fileCol: 'File',
    sizeCol: 'Size',
    typeCol: 'Type',
    timeCol: 'Time',
    actionCol: 'Actions',
    locate: 'Locate File',
    preview: 'Preview',
    closeBtn: 'Close',
    typeWrite: 'Write',
    typeDelete: 'Delete',
    typeCreate: 'Create',
    typeEdit: 'Edit',
    typeOther: 'Op',
    noWorkspace: 'Unable to access working directory. Please confirm the Agent is connected.',
    locateFailed: 'Failed to locate file',
    fileNotFound: 'Directory located, but file not found (may have been deleted)',
    previewFailed: 'Failed to preview file',
    previewNotSupported: 'Preview not supported for this file type',
    totalCount: '{count} files in total',
    badgeLabel: 'Artifacts',
  },
});

// ============================================================
// 产物提取：从 executionLog 中解析写文件操作
// ============================================================

/**
 * 规范化路径
 */
function normalizePath(p) {
  return (p || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

/**
 * 从文件路径提取文件名
 */
function getFileName(filePath) {
  if (!filePath) return '';
  const normalized = normalizePath(filePath);
  const parts = normalized.split('/');
  return parts[parts.length - 1] || '';
}

/**
 * 从文件路径提取扩展名（小写）
 */
function getFileExt(filePath) {
  if (!filePath) return '';
  const name = getFileName(filePath);
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.substring(idx + 1).toLowerCase() : '';
}

/**
 * HTML 转义（防注入）
 */
function escapeHtml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 从 observation 中尝试解析出路径
 * @param {string|object} observation
 * @returns {string|null}
 */
function extractPathFromObservation(observation) {
  if (!observation) return null;
  let obs = observation;
  if (typeof obs === 'string') {
    try {
      obs = JSON.parse(obs);
    } catch {
      // 非 JSON 字符串，尝试正则提取路径
      const match = obs.match(/["']?path["']?\s*[:=]\s*["']([^"']+)["']/i);
      if (match) return match[1];
      return null;
    }
  }
  if (obs && typeof obs === 'object') {
    return obs.path || obs.filePath || obs.file_path || obs.result?.path || null;
  }
  return null;
}

/**
 * 从 executionLog 中提取所有文件产物（写/创建/编辑文件操作）
 * @param {Array} executionLog - 执行日志
 * @returns {Array} 产物列表 [{ path, fileName, toolName, action, size, timestamp, status }]
 */
export function extractArtifactsFromExecutionLog(executionLog) {
  if (!Array.isArray(executionLog) || executionLog.length === 0) return [];

  const artifacts = [];
  const seenPaths = new Set(); // 去重

  // 按时间排序
  const sortedLog = [...executionLog].sort(
    (a, b) => new Date(a.timestamp || 0) - new Date(b.timestamp || 0)
  );

  for (const entry of sortedLog) {
    if (entry.nodeType !== 'tool_exec') continue;
    if (!entry.action) continue;

    const toolName = entry.action.name || '';
    let params = entry.action.params;
    if (params == null) continue;
    if (typeof params === 'string') {
      try { params = JSON.parse(params); } catch { continue; }
    }
    if (typeof params !== 'object') continue;

    let filePath = null;
    let actionLabel = 'typeOther';
    let isWriteOp = false;

    // agent_file: action=write
    if (toolName === 'agent_file') {
      const action = params.action;
      if (action === 'write') {
        filePath = params.path || params.filePath;
        actionLabel = 'typeWrite';
        isWriteOp = true;
      } else if (action === 'delete') {
        // 删除操作不算产物
        continue;
      } else {
        continue;
      }
    }
    // agent_exec: 可能通过命令写文件，较难准确判断，跳过
    // file_upload: 上传文件到工作目录
    else if (toolName === 'file_upload') {
      filePath = params.path || params.filePath || params.filename;
      actionLabel = 'typeCreate';
      isWriteOp = true;
    }
    // download_file: 下载文件到工作目录
    else if (toolName === 'download_file') {
      // download_file 通常是下载到用户下载目录，不一定在工作目录，跳过
      continue;
    }
    // 其他可能的写文件工具（自定义扩展）
    else if (params.file_path && (params.content !== undefined || params.action === 'write' || params.action === 'create')) {
      filePath = params.file_path;
      actionLabel = params.action === 'create' ? 'typeCreate' : 'typeWrite';
      isWriteOp = true;
    }

    if (!filePath) continue;

    // 尝试从 observation 中获取真实路径（Agent 可能返回规范化的路径）
    const obsPath = extractPathFromObservation(entry.observation);
    const finalPath = normalizePath(obsPath || filePath);
    if (!finalPath) continue;

    // 去重（同一路径只保留最后一次操作）
    if (seenPaths.has(finalPath)) {
      // 移除旧的，保留新的（后面的操作覆盖前面的）
      const idx = artifacts.findIndex(a => a.path === finalPath);
      if (idx >= 0) artifacts.splice(idx, 1);
    }
    seenPaths.add(finalPath);

    // 只记录成功的写操作
    if (entry.status === 'failed') continue;

    // 尝试从 observation 中获取文件大小
    let size = 0;
    if (entry.observation) {
      let obs = entry.observation;
      if (typeof obs === 'string') {
        try { obs = JSON.parse(obs); } catch {}
      }
      if (obs && typeof obs === 'object') {
        size = obs.size || obs.fileSize || obs.file_size || 0;
      }
    }

    artifacts.push({
      path: finalPath,
      fileName: getFileName(finalPath),
      toolName,
      action: actionLabel,
      size,
      timestamp: entry.timestamp || null,
      status: entry.status || 'unknown',
    });
  }

  return artifacts;
}

/**
 * 判断是否可预览的文件（代理到 workspace-manager.supportsPreview）
 */
function canPreview(filePath) {
  try {
    return supportsPreview(filePath);
  } catch (e) {
    return false;
  }
}

// ============================================================
// 产物弹框 UI
// ============================================================

let modalOverlay = null;

/**
 * 显示产物弹框
 * @param {Array} artifacts - 产物列表
 */
export function showArtifactsModal(artifacts) {
  // 如果已有弹框，先移除
  hideArtifactsModal();

  if (!artifacts || artifacts.length === 0) return;

  modalOverlay = document.createElement('div');
  modalOverlay.className = 'artifacts-modal-overlay';
  modalOverlay.id = 'artifactsModalOverlay';

  const modal = document.createElement('div');
  modal.className = 'artifacts-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'artifacts-modal-header';
  header.innerHTML = `
    <div class="artifacts-modal-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px;color:#4a90d9;">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="12" y1="18" x2="12" y2="12"/>
        <line x1="9" y1="15" x2="15" y2="15"/>
      </svg>
      <span>${t('artifacts.modalTitle')}</span>
      <span class="artifacts-modal-count">${t('artifacts.totalCount', { count: artifacts.length })}</span>
    </div>
    <button class="artifacts-modal-close" id="artifactsModalClose" title="${t('artifacts.closeBtn')}">×</button>
  `;

  // Body - 表格
  const body = document.createElement('div');
  body.className = 'artifacts-modal-body';

  const table = document.createElement('table');
  table.className = 'artifacts-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th class="col-file">${t('artifacts.fileCol')}</th>
        <th class="col-type">${t('artifacts.typeCol')}</th>
        <th class="col-time">${t('artifacts.timeCol')}</th>
        <th class="col-action">${t('artifacts.actionCol')}</th>
      </tr>
    </thead>
    <tbody>
      ${artifacts.map((a, idx) => {
        const icon = getFileIcon(a.fileName);
        const typeText = t(`artifacts.${a.action}`);
        const timeText = a.timestamp
          ? new Date(a.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : '—';
        const previewable = canPreview(a.fileName);
        return `
          <tr class="artifacts-row" data-idx="${idx}" data-path="${escapeHtml(a.path)}" data-name="${escapeHtml(a.fileName)}">
            <td class="col-file">
              <span class="artifact-icon">${icon}</span>
              <span class="artifact-name" title="${escapeHtml(a.path)}">${escapeHtml(a.fileName)}</span>
            </td>
            <td class="col-type">${typeText}</td>
            <td class="col-time">${timeText}</td>
            <td class="col-action">
              <button class="artifact-action-btn locate-btn" data-idx="${idx}" title="${t('artifacts.locate')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
              </button>
              ${previewable ? `
              <button class="artifact-action-btn preview-btn" data-idx="${idx}" title="${t('artifacts.preview')}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>` : ''}
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;

  body.appendChild(table);

  // Footer
  const footer = document.createElement('div');
  footer.className = 'artifacts-modal-footer';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'artifacts-modal-close-btn';
  closeBtn.textContent = t('artifacts.closeBtn');
  closeBtn.addEventListener('click', hideArtifactsModal);
  footer.appendChild(closeBtn);

  modal.appendChild(header);
  modal.appendChild(body);
  modal.appendChild(footer);
  modalOverlay.appendChild(modal);
  document.body.appendChild(modalOverlay);

  // 绑定事件
  // 关闭按钮
  document.getElementById('artifactsModalClose').addEventListener('click', hideArtifactsModal);

  // 注意：点击遮罩区域不自动关闭，仅允许用户通过关闭按钮/ESC 手动关闭

  // ESC 关闭
  const escHandler = (e) => {
    if (e.key === 'Escape') {
      hideArtifactsModal();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  // 定位/预览按钮
  modal.querySelectorAll('.artifact-action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx, 10);
      const artifact = artifacts[idx];
      if (!artifact) return;

      if (btn.classList.contains('locate-btn')) {
        try {
          // 定位完成后保持弹框打开，用户可继续操作
          await locateFileInWorkspace(artifact.path);
        } catch (err) {
          logger.error('[Artifacts] locate failed:', err);
        }
      } else if (btn.classList.contains('preview-btn')) {
        try {
          // 预览完成后保持弹框打开，用户可继续操作
          await previewArtifactFile(artifact.path, artifact.fileName);
        } catch (err) {
          logger.error('[Artifacts] preview failed:', err);
        }
      }
    });
  });

  // 行点击（默认触发定位）
  modal.querySelectorAll('.artifacts-row').forEach(row => {
    row.addEventListener('click', (e) => {
      // 如果点击的是按钮，不重复触发
      if (e.target.closest('.artifact-action-btn')) return;
      const path = row.dataset.path;
      if (path) {
        // 定位完成后保持弹框打开
        locateFileInWorkspace(path).catch(err => {
          logger.error('[Artifacts] locate failed:', err);
        });
      }
    });
  });
}

/**
 * 隐藏产物弹框
 */
export function hideArtifactsModal() {
  if (modalOverlay) {
    modalOverlay.remove();
    modalOverlay = null;
  }
}
