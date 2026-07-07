// export-import.js - 会话导出/导入
// 从 chat-manager.js 提取

import state from './state.js';
import { showToast, escapeHtml } from './utils.js';
import { loadSessions, importSessions } from './session-manager.js';
import { renderSessionTabs } from './session-manager-ui.js';

/**
 * 显示导出会话选择弹窗
 */
export async function showExportDialog() {
  const modal = document.getElementById('exportSessionsModal');
  const listEl = document.getElementById('exportSessionsList');
  if (!modal || !listEl) return;

  listEl.innerHTML = '<div class="export-sessions-empty">加载中...</div>';

  try {
    const { list: sessions, activeSessionId } = await loadSessions();
    
    if (sessions.length === 0) {
      listEl.innerHTML = '<div class="export-sessions-empty">暂无会话可导出</div>';
    } else {
      const activeId = activeSessionId || state.activeSessionId;
      listEl.innerHTML = sessions.map((s, idx) => {
        const isCurrent = s.id === activeId;
        const msgCount = (s.messageHistory || []).length;
        const createdAt = s.createdAt ? new Date(s.createdAt).toLocaleDateString('zh-CN') : '';
        return `
        <div class="export-session-item" data-id="${s.id}">
          <input type="checkbox" class="export-session-checkbox" data-session-id="${s.id}" ${isCurrent ? 'checked' : ''}>
          <div class="export-session-info">
            <div class="export-session-title">${escapeHtml(s.title || '未命名会话')}${isCurrent ? '<span class="current-badge">当前</span>' : ''}</div>
            <div class="export-session-meta">${msgCount} 条消息${createdAt ? ' · ' + createdAt : ''}</div>
          </div>
        </div>`;
      }).join('');

      // 绑定整行点击切换 checkbox
      listEl.querySelectorAll('.export-session-item').forEach(item => {
        const checkbox = item.querySelector('.export-session-checkbox');
        item.addEventListener('click', (e) => {
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
          }
          updateSelectedCount();
        });
      });

      // 快捷操作按钮
      const selectAllBtn = document.getElementById('exportSelectAllBtn');
      const deselectAllBtn = document.getElementById('exportDeselectAllBtn');
      const selectCurrentBtn = document.getElementById('exportSelectCurrentBtn');

      if (selectAllBtn) {
        selectAllBtn.onclick = () => {
          listEl.querySelectorAll('.export-session-checkbox').forEach(cb => { cb.checked = true; });
          updateSelectedCount();
        };
      }
      if (deselectAllBtn) {
        deselectAllBtn.onclick = () => {
          listEl.querySelectorAll('.export-session-checkbox').forEach(cb => { cb.checked = false; });
          updateSelectedCount();
        };
      }
      if (selectCurrentBtn) {
        selectCurrentBtn.onclick = () => {
          listEl.querySelectorAll('.export-session-checkbox').forEach(cb => {
            cb.checked = cb.dataset.sessionId === activeId;
          });
          updateSelectedCount();
        };
      }

      updateSelectedCount();
    }
  } catch (err) {
    console.error('[SidePanel] 加载会话列表失败:', err);
    listEl.innerHTML = '<div class="export-sessions-empty">加载失败</div>';
  }

  modal.classList.add('show');
}

function updateSelectedCount() {
  const allCbs = document.querySelectorAll('#exportSessionsList .export-session-checkbox');
  const checked = document.querySelectorAll('#exportSessionsList .export-session-checkbox:checked');
  const countEl = document.getElementById('exportSelectedCount');
  if (countEl) {
    countEl.textContent = `已选 ${checked.length} 个`;
  }
  const okBtn = document.getElementById('exportSessionsOkBtn');
  if (okBtn) {
    okBtn.textContent = `导出选中 (${checked.length})`;
    okBtn.disabled = checked.length === 0;
    okBtn.style.opacity = checked.length === 0 ? '0.5' : '1';
  }
}

/**
 * 隐藏导出弹窗
 */
export function hideExportDialog() {
  const modal = document.getElementById('exportSessionsModal');
  if (modal) modal.classList.remove('show');
}

/**
 * 执行导出选中的会话
 */
export async function performExport() {
  const checkedCbs = document.querySelectorAll('#exportSessionsList .export-session-checkbox:checked');
  const selectedIds = Array.from(checkedCbs).map(cb => cb.dataset.sessionId);

  if (selectedIds.length === 0) {
    showToast('请至少选择一个会话', 'warning');
    return;
  }

  try {
    const { list: allSessions } = await loadSessions();
    const selectedSessions = allSessions.filter(s => selectedIds.includes(s.id));

    const exportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      sessions: selectedSessions.map(s => ({
        title: s.title || '未命名会话',
        model: s.model,
        useTools: s.useTools,
        enabledTools: s.enabledTools,
        temperature: s.temperature,
        topP: s.topP,
        createdAt: s.createdAt,
        messageHistory: (s.messageHistory || []).map(msg => ({
          role: msg.role,
          content: msg.content || '',
          executionLog: msg.executionLog || [],
          htmlContent: msg.htmlContent || '',
          reflectionScore: msg.reflectionScore,
          wasRevised: msg.wasRevised || false,
        })),
      })),
    };

    const now = new Date();
    const ts = now.getFullYear() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') + '-' +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    const count = selectedSessions.length;
    const fileName = count === 1
      ? `ai-helper-${selectedSessions[0].title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')}-${ts}.aihelper.json`
      : `ai-helper-${count}sessions-${ts}.aihelper.json`;

    const jsonData = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonData], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    hideExportDialog();
    console.log('[SidePanel] 会话已导出:', fileName, '共', count, '个会话');
    showToast(`已导出 ${count} 个会话`, 'success');
  } catch (err) {
    console.error('[SidePanel] 导出失败:', err);
    showToast('导出失败: ' + err.message, 'error');
  }
}

/**
 * 初始化导出弹窗事件
 */
export function initExportDialogEvents() {
  const closeBtn = document.getElementById('exportSessionsCloseBtn');
  const cancelBtn = document.getElementById('exportSessionsCancelBtn');
  const okBtn = document.getElementById('exportSessionsOkBtn');
  const overlay = document.getElementById('exportSessionsModal');

  if (closeBtn) closeBtn.addEventListener('click', hideExportDialog);
  if (cancelBtn) cancelBtn.addEventListener('click', hideExportDialog);
  if (okBtn) okBtn.addEventListener('click', performExport);
  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) hideExportDialog();
    });
  }
}

/**
 * 触发导入会话 - 打开文件选择器
 */
export function triggerImportDialog() {
  const fileInput = document.getElementById('importSessionsFile');
  if (fileInput) {
    fileInput.value = '';
    fileInput.click();
  }
}

/**
 * 处理导入文件
 * @param {File} file
 */
export async function handleImportFile(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);

    // 校验数据格式
    let sessionsToImport = [];

    if (data.version && data.sessions && Array.isArray(data.sessions)) {
      // 新格式（.aihelper.json）
      sessionsToImport = data.sessions;
    } else if (Array.isArray(data)) {
      // 兼容旧格式（消息数组 or 会话数组）
      if (data.length > 0 && data[0].role) {
        // 旧格式：直接是消息数组，包装为一个会话
        sessionsToImport = [{
          title: '导入的对话',
          messageHistory: data.map(msg => ({
            role: msg.role || 'user',
            content: msg.content || '',
          })),
        }];
      } else if (data.length > 0 && data[0].title !== undefined) {
        // 旧格式：会话数组
        sessionsToImport = data;
      } else {
        sessionsToImport = data;
      }
    } else {
      throw new Error('无法识别的文件格式');
    }

    if (sessionsToImport.length === 0) {
      showToast('文件中没有可导入的会话数据', 'warning');
      return;
    }

    const createdSessions = await importSessions(sessionsToImport);
    
    // 刷新会话标签栏
    await renderSessionTabs();
    
    console.log('[SidePanel] 导入完成:', createdSessions.length, '个会话');
    showToast(`成功导入 ${createdSessions.length} 个会话`, 'success');
  } catch (err) {
    console.error('[SidePanel] 导入失败:', err);
    showToast('导入失败: ' + err.message, 'error');
  }
}
