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
 * 从 agent_exec 命令字符串中解析写入的文件路径
 * 支持：echo > file、echo >> file、touch、mkdir、cp、cat > file、tee 等模式
 * @param {string} command - 完整的命令字符串
 * @returns {string[]} - 提取出的文件路径列表（绝对路径或相对路径）
 */
function extractFilesFromAgentExec(command) {
  if (!command || typeof command !== 'string') return [];

  const results = [];
  let cwd = ''; // 跟踪 cd 切换的目录

  // 按 && 和 ; 分割命令链
  const parts = command.split(/\s*&&\s*|\s*;\s*/);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // cd 命令：更新当前工作目录
    const cdMatch = trimmed.match(/^cd\s+(.+?)\s*$/);
    if (cdMatch) {
      const target = cdMatch[1].trim().replace(/^['"]|['"]$/g, '');
      if (target.startsWith('/')) {
        cwd = target;
      } else if (target === '..' && cwd) {
        cwd = normalizePath(cwd).replace(/\/[^/]+$/, '') || '/';
      } else if (cwd) {
        cwd = normalizePath(cwd.replace(/\/$/, '') + '/' + target);
      }
      continue;
    }

    /** 将相对路径转为绝对路径 */
    const resolvePath = (p) => {
      p = p.replace(/^['"]|['"]$/g, '');
      if (!p.startsWith('/') && cwd) {
        p = normalizePath(cwd.replace(/\/$/, '') + '/' + p);
      }
      return normalizePath(p);
    };

    // mkdir -p dir
    const mkdirMatch = trimmed.match(/^mkdir\s+(?:-[pm]+\s+)*(.+?)$/);
    if (mkdirMatch) {
      const dirs = mkdirMatch[1].split(/\s+/).filter(d => d && !d.startsWith('-'));
      for (const d of dirs) results.push(resolvePath(d));
      continue;
    }

    // touch file1 file2 ...
    const touchMatch = trimmed.match(/^touch\s+(.+)$/);
    if (touchMatch) {
      const fileList = touchMatch[1].split(/\s+/).filter(f => f && !f.startsWith('-'));
      for (const f of fileList) results.push(resolvePath(f));
      continue;
    }

    let filePath = null;

    // echo "..." > file 或 >> file（重定向在末尾）
    const redirectMatch = trimmed.match(/\s[>]{1,2}\s*['"]?([^\s|&;'"]+)['"]?\s*$/);
    if (redirectMatch) {
      filePath = redirectMatch[1];
    }

    // cat > file
    if (!filePath) {
      const catMatch = trimmed.match(/^cat\s+>\s*['"]?([^\s|&;'"]+)['"]?/);
      if (catMatch) filePath = catMatch[1];
    }

    // cp src ... dest（dest 是最后一个参数）
    if (!filePath) {
      const cpMatch = trimmed.match(/^cp\s+(?:-[a-zA-Z]+\s+)*(?:.+?\s+)+?['"]?([^\s|&;'"]+)['"]?\s*$/);
      if (cpMatch) filePath = cpMatch[1];
    }

    // tee file
    if (!filePath) {
      const teeMatch = trimmed.match(/tee\s+(?:-[a-zA-Z]+\s+)*['"]?([^\s|&;'"]+)['"]?/);
      if (teeMatch) filePath = teeMatch[1];
    }

    if (filePath) {
      results.push(resolvePath(filePath));
    }
  }

  return results;
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

    // agent_exec: 从 shell 命令中解析写入的文件路径
    if (toolName === 'agent_exec') {
      const command = params.command || '';
      if (!command) continue;

      const candidatePaths = extractFilesFromAgentExec(command);
      for (const filePath of candidatePaths) {
        if (!filePath) continue;

        // 去重
        if (seenPaths.has(filePath)) {
          const idx = artifacts.findIndex(a => a.path === filePath);
          if (idx >= 0) artifacts.splice(idx, 1);
        }
        seenPaths.add(filePath);

        if (entry.status === 'failed') continue;

        artifacts.push({
          path: filePath,
          fileName: getFileName(filePath),
          toolName,
          action: 'typeCreate',
          size: 0,
          timestamp: entry.timestamp || null,
          status: entry.status || 'unknown',
        });
      }
      continue;
    }

    let filePath = null;
    let actionLabel = 'typeOther';

    // agent_file: action=write
    if (toolName === 'agent_file') {
      const action = params.action;
      if (action === 'write') {
        filePath = params.path || params.filePath;
        actionLabel = 'typeWrite';
      } else {
        continue;
      }
    }
    // file_upload: 上传文件到工作目录
    else if (toolName === 'file_upload') {
      filePath = params.path || params.filePath || params.filename;
      actionLabel = 'typeCreate';
    }
    // download_file: 下载文件到工作目录，跳过
    else if (toolName === 'download_file') {
      continue;
    }
    // 其他可能的写文件工具（自定义扩展）
    else if (params.file_path && (params.content !== undefined || params.action === 'write' || params.action === 'create')) {
      filePath = params.file_path;
      actionLabel = params.action === 'create' ? 'typeCreate' : 'typeWrite';
    }

    if (!filePath) continue;

    // 尝试从 observation 中获取真实路径（Agent 可能返回规范化的路径）
    const obsPath = extractPathFromObservation(entry.observation);
    const finalPath = normalizePath(obsPath || filePath);
    if (!finalPath) continue;

    // 去重（同一路径只保留最后一次操作）
    if (seenPaths.has(finalPath)) {
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
