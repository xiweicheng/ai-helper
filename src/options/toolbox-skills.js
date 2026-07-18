// options/toolbox-skills.js - Skill 管理
// 从 toolbox-config.js 拆分，包含 Skill 的增删改查、导入与运行

import { state, agentApi, escapeHtml, getAgentConnection, showCustomConfirm, showAgentSkillViewer, showToast, triggerRefresh } from './toolbox-shared.js';
import logger from '../shared/logger.js';

// ==================== Skill 管理 ====================

/**
 * 获取 Skill 列表
 */
export async function loadSkills() {
  await getAgentConnection();
  if (!state.agentConnected) return { skills: [] };
  try {
    return await agentApi('GET', '/api/skill/list');
  } catch {
    return { skills: [] };
  }
}

/**
 * 渲染 Skill 列表（区分 Workflow 和 Agent 类型）
 */
export function renderSkills(skills) {
  const container = document.getElementById('skillList');
  if (!container) return;

  if (!state.agentConnected) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🔌</div>
        <div class="toolbox-empty-title">代理未连接</div>
        <div class="toolbox-empty-desc">请先在「代理」Tab 中连接 Agent 服务后，再管理 Skill</div>
      </div>`;
    return;
  }

  if (!skills || skills.length === 0) {
    container.innerHTML = `
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🧩</div>
        <div class="toolbox-empty-title">暂无 Skill</div>
        <div class="toolbox-empty-desc">
          支持两种 Skill 类型：<br>
          <strong>Workflow Skill</strong>：导入 JSON 文件（确定性自动化流程）<br>
          <strong>Agent Skill</strong>：导入 SKILL.md 目录/Zip/URL（AI 能力扩展）
        </div>
      </div>`;
    return;
  }

  const workflowSkills = skills.filter(s => s.type !== 'agent');
  const agentSkills = skills.filter(s => s.type === 'agent');

  let html = '';

  function truncateText(text, maxLength = 100) {
  if (!text || text.length <= maxLength) return { content: text, truncated: false };
  return {
    content: text.substring(0, maxLength) + '...',
    truncated: true,
    full: text
  };
}

// Workflow Skills
  if (workflowSkills.length > 0) {
    html += '<div class="skill-section-title">Workflow Skills（自动化流程）</div>';
    html += workflowSkills.map(s => {
      const desc = truncateText(s.description || '', 120);
      const hasParams = s.parameters && s.parameters.properties && Object.keys(s.parameters.properties).length > 0;
      return `
      <div class="skill-card skill-card-workflow${s.enabled === false ? ' skill-disabled' : ''}">
        <div class="skill-card-header">
          <div class="skill-card-info">
            <span class="skill-card-icon">⚙️</span>
            <span class="skill-card-name">${escapeHtml(s.name)}</span>
            <span class="skill-card-version">v${escapeHtml(s.version || '1.0')}</span>
            <span class="skill-card-badge badge-workflow">Workflow</span>
            ${s.enabled === false ? '<span class="skill-card-badge badge-disabled">已停用</span>' : ''}
            <span class="skill-card-step-count">${s.stepCount || 0} 步骤</span>
          </div>
        </div>
        <div class="skill-card-body${s.enabled === false ? ' disabled' : ''}">
          <div class="skill-card-desc">${escapeHtml(desc.content)}</div>
          ${desc.truncated && s.enabled !== false ? `<button class="skill-expand-btn" data-skill-name="${escapeHtml(s.name)}" data-target="desc" data-full="${encodeURIComponent(s.description || '')}">展开</button>` : ''}
          ${hasParams ? `
          <div class="skill-card-params">
            ${renderSkillParams(s.parameters)}
          </div>` : ''}
          <div class="skill-card-actions">
            ${s.enabled !== false ? `<button class="toolbox-btn toolbox-btn-primary" data-skill-name="${escapeHtml(s.name)}" data-action="run-skill">运行</button>` : ''}
            <button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="toggle-skill">${s.enabled === false ? '启用' : '停用'}</button>
            <button class="toolbox-btn toolbox-btn-danger" data-skill-name="${escapeHtml(s.name)}" data-action="delete-skill">删除</button>
          </div>
        </div>
      </div>
    `}).join('');
  }

  // Agent Skills
  if (agentSkills.length > 0) {
    html += '<div class="skill-section-title">Agent Skills（AI 能力扩展）</div>';
    html += agentSkills.map(s => {
      const isBuiltin = s.builtin === true;
      const canEdit = s.editable !== false;
      const canDelete = s.deletable !== false;
      const desc = truncateText(s.description || '', 120);
      const hasResources = s.resources && s.resources.length > 0;
      const showResourcesInFull = !hasResources || s.resources.length <= 5;
      return `
      <div class="skill-card skill-card-agent${s.enabled === false ? ' skill-disabled' : ''}">
        <div class="skill-card-header">
          <div class="skill-card-info">
            <span class="skill-card-icon">🤖</span>
            <span class="skill-card-name">${escapeHtml(s.name)}</span>
            <span class="skill-card-version">v${escapeHtml(s.version || '1.0')}</span>
            <span class="skill-card-badge badge-agent">Agent</span>
            ${isBuiltin ? '<span class="skill-card-badge badge-builtin">内置</span>' : ''}
            ${s.enabled === false ? '<span class="skill-card-badge badge-disabled">已停用</span>' : ''}
            <span class="skill-card-step-count">${s.resourceCount || 0} 资源</span>
          </div>
        </div>
        <div class="skill-card-body${s.enabled === false ? ' disabled' : ''}">
          <div class="skill-card-desc">${escapeHtml(desc.content)}</div>
          ${desc.truncated && s.enabled !== false ? `<button class="skill-expand-btn" data-skill-name="${escapeHtml(s.name)}" data-target="desc" data-full="${encodeURIComponent(s.description || '')}">展开</button>` : ''}
          ${hasResources ? `
          <div class="skill-card-params">
            ${showResourcesInFull 
              ? s.resources.map(r => `<span class="skill-param-tag" title="大小: ${r.size} 字节">📄 ${escapeHtml(r.name)}</span>`).join('')
              : s.resources.slice(0, 5).map(r => `<span class="skill-param-tag" title="大小: ${r.size} 字节">📄 ${escapeHtml(r.name)}</span>`).join('') + `<button class="skill-expand-btn skill-expand-resources" data-skill-name="${escapeHtml(s.name)}" data-target="resources" data-full="${encodeURIComponent(JSON.stringify(s.resources))}">+${s.resources.length - 5} 更多</button>`
            }
          </div>` : ''}
          <div class="skill-card-actions">
            ${canEdit ? `<button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="edit-agent-skill">编辑 SKILL.md</button>` : `<button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="view-agent-skill">查看详情</button>`}
            <button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${escapeHtml(s.name)}" data-action="toggle-skill">${s.enabled === false ? '启用' : '停用'}</button>
            ${canDelete ? `<button class="toolbox-btn toolbox-btn-danger" data-skill-name="${escapeHtml(s.name)}" data-action="delete-skill">删除</button>` : ''}
          </div>
        </div>
      </div>
    `}).join('');
  }

  container.innerHTML = html;
}

/**
 * 渲染 Skill 参数
 */
export function renderSkillParams(parameters) {
  if (!parameters || !parameters.properties) return '';
  const props = parameters.properties;
  const required = parameters.required || [];

  return Object.entries(props).map(([key, prop]) => {
    const isRequired = required.includes(key);
    return `<span class="skill-param-tag ${isRequired ? 'required' : ''}" title="${escapeHtml(prop.description || '')}">${escapeHtml(key)}${isRequired ? '*' : ''}</span>`;
  }).join('');
}

/**
 * 导入 Workflow Skill
 */
export async function importSkill(skillDef) {
  const result = await agentApi('POST', '/api/skill/import', skillDef);
  if (result.success) return true;
  throw new Error(result.error || '导入失败');
}

/**
 * 删除 Skill
 */
export async function deleteSkill(name) {
  const result = await agentApi('DELETE', '/api/skill/delete', { name });
  if (result.success) return true;
  throw new Error(result.error || '删除失败');
}

/**
 * 切换 Skill 启用/停用状态
 */
export async function toggleSkill(name) {
  const result = await agentApi('POST', '/api/skill/toggle', { name });
  if (result.success) return result.enabled !== false;
  throw new Error(result.error || '操作失败');
}

/**
 * 运行 Workflow Skill
 */
export async function runSkill(name, params = {}) {
  const result = await agentApi('POST', '/api/skill/run', { name, params });
  return result;
}

/**
 * 解析 Skill 的参数定义（兼容 JSON Schema 格式）
 */
export function parseSkillParams(skill) {
  const params = skill.parameters || {};
  // 兼容 JSON Schema 格式: { type: "object", properties: {...}, required: [...] }
  const props = params.properties || {};
  const requiredList = Array.isArray(params.required) ? params.required : [];
  const entries = Object.entries(props);
  return {
    hasRequired: entries.length > 0,
    required: entries.filter(([key]) => requiredList.includes(key)),
    optional: entries.filter(([key]) => !requiredList.includes(key)),
    all: entries
  };
}

/**
 * 显示 Skill 参数输入弹窗
 * @returns {Promise<Object|null>} - 用户填写的参数，取消则返回 null
 */
export function showSkillParamsDialog(skillName, paramsDef) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    // 生成参数输入字段
    const requiredFields = paramsDef.required.map(([key, def]) => `
      <div class="form-group">
        <label for="skill-param-${key}">${escapeHtml(def.description || key)} <span class="param-required">*必填</span></label>
        <input type="text" id="skill-param-${key}" class="form-input"
               placeholder="${escapeHtml(def.type || 'string')}${def.default !== undefined ? ' (默认: ' + def.default + ')' : ''}" />
      </div>
    `).join('');

    const optionalFields = paramsDef.optional.map(([key, def]) => `
      <div class="form-group">
        <label for="skill-param-${key}">${escapeHtml(def.description || key)} <span class="param-optional">选填</span></label>
        <input type="text" id="skill-param-${key}" class="form-input"
               placeholder="${escapeHtml(def.type || 'string')}${def.default !== undefined ? ' (默认: ' + def.default + ')' : ''}" />
      </div>
    `).join('');

    overlay.innerHTML = `
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header">
          <h2>运行 Skill "${escapeHtml(skillName)}"</h2>
          <button class="modal-close-btn" id="skillParamsCancel">×</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 16px;color:#666;font-size:13px;">请填写以下参数后运行：</p>
          ${requiredFields}
          ${paramsDef.required.length > 0 && paramsDef.optional.length > 0 ? '<div style="border-top:1px dashed #e0e0e0;margin:12px 0;"></div>' : ''}
          ${optionalFields}
        </div>
        <div class="modal-actions">
          <button class="btn btn-cancel" id="skillParamsCancel">取消</button>
          <button class="btn btn-primary" id="skillParamsSubmit">运行</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const close = () => { overlay.remove(); resolve(null); };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
    overlay.querySelectorAll('#skillParamsCancel').forEach(btn => {
      btn.addEventListener('click', close);
    });

    overlay.querySelector('#skillParamsSubmit').addEventListener('click', () => {
      const values = {};
      let allRequiredFilled = true;
      for (const [key, def] of paramsDef.required) {
        const input = overlay.querySelector(`#skill-param-${key}`);
        const val = input?.value?.trim();
        if (!val) {
          allRequiredFilled = false;
          if (input) input.style.borderColor = '#e53e3e';
        } else {
          values[key] = val;
          if (input) input.style.borderColor = '';
        }
      }
      for (const [key] of paramsDef.optional) {
        const input = overlay.querySelector(`#skill-param-${key}`);
        if (input) {
          values[key] = input.value;
        }
      }
      if (!allRequiredFilled) return;
      overlay.remove();
      resolve(values);
    });

    // 回车提交
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        overlay.querySelector('#skillParamsSubmit').click();
      }
    });

    // 自动聚焦第一个输入框
    const firstInput = overlay.querySelector('input');
    if (firstInput) setTimeout(() => firstInput.focus(), 100);
  });
}
export function showSkillRunResult(name, skillInfo, result) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'skillResultModal';

  const steps = skillInfo?.success ? (skillInfo.skill?.steps || []) : [];
  const stepMap = {};
  steps.forEach(s => { stepMap[s.id] = s; });

  const results = result.results || {};
  const stepIds = Object.keys(results);

  let stepsHtml = '';
  let successCount = 0;
  let failCount = 0;
  let skipCount = 0;

  if (stepIds.length === 0) {
    stepsHtml = `<div style="padding:16px;text-align:center;color:#999;">${result.error || '无执行结果'}</div>`;
  } else {
    stepsHtml = stepIds.map((stepId, idx) => {
      const stepRes = results[stepId];
      const stepDef = stepMap[stepId] || {};
      const stepName = stepDef.name || stepDef.description || stepId;
      const tool = stepDef.tool || '';
      const isSuccess = stepRes?.success;
      const isSkipped = stepRes?.skipped;

      if (isSkipped) skipCount++;
      else if (isSuccess) successCount++;
      else failCount++;

      const statusIcon = isSkipped ? '⊘' : (isSuccess ? '✓' : '✗');
      const statusClass = isSkipped ? 'step-skipped' : (isSuccess ? 'step-success' : 'step-error');
      const outputText = isSkipped
        ? (stepRes.message || '条件不满足，已跳过')
        : (isSuccess
          ? (stepRes.content || stepRes.stdout || stepRes.message || '执行成功')
          : (stepRes.error || '执行失败'));

      // 截断过长输出
      const truncated = outputText.length > 500
        ? outputText.substring(0, 500) + `\n... (共 ${outputText.length} 字符，已截断)`
        : outputText;

      return `
        <div class="skill-run-step ${statusClass}">
          <div class="step-header">
            <span class="step-status-icon">${statusIcon}</span>
            <span class="step-title">${escapeHtml(stepName)}</span>
            ${tool ? `<span class="step-tool-tag">${escapeHtml(tool)}</span>` : ''}
          </div>
          <pre class="step-output">${escapeHtml(truncated)}</pre>
        </div>
      `;
    }).join('');
  }

  const icon = result.success ? '✓' : '✗';
  const statusText = result.success ? '执行完成' : '执行失败';
  const summaryText = result.success
    ? `${successCount} 成功, ${failCount} 失败, ${skipCount} 跳过`
    : (result.error || '未知错误');

  overlay.innerHTML = `
    <div class="modal-content" style="max-width:700px;max-height:85vh;">
      <div class="modal-header">
        <h2>${icon} Skill "${escapeHtml(name)}" ${statusText}</h2>
        <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="max-height:calc(85vh - 120px);overflow-y:auto;">
        <div class="skill-run-summary">${escapeHtml(summaryText)}</div>
        ${stepsHtml}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary modal-close-btn">关闭</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || e.target.classList.contains('modal-close-btn')) {
      overlay.remove();
    }
  });
}

/**
 * 重新加载 Skill
 */
export async function reloadSkills() {
  const result = await agentApi('POST', '/api/skill/reload');
  return result;
}

/**
 * 导入 Agent Skill（从 JSON/Markdown/Zip/URL）
 */
export async function importAgentSkill(skillData) {
  // 判断导入方式
  if (skillData.markdown || skillData.prompt) {
    // Markdown 内容直接保存
    return await agentApi('POST', '/api/skill/save-markdown', skillData);
  } else if (skillData.zipData) {
    // Base64 Zip 导入
    return await agentApi('POST', '/api/skill/import-zip', skillData);
  } else if (skillData.url) {
    // URL 导入
    return await agentApi('POST', '/api/skill/import-url', skillData);
  }
  throw new Error('无效的 Skill 数据格式');
}

/**
 * 获取 Agent Skill 的 SKILL.md 内容
 */
export async function getAgentSkillMarkdown(name) {
  return await agentApi('GET', `/api/skill/markdown?name=${encodeURIComponent(name)}`);
}

/**
 * 显示 Agent Skill 编辑器弹窗
 */
export function showAgentSkillEditor(skillName, existingData = null) {
  const existingModal = document.getElementById('agentSkillEditorModal');
  if (existingModal) existingModal.remove();

  const isEdit = !!existingData;

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.id = 'agentSkillEditorModal';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-content agent-skill-editor-container';
  modalContainer.style.width = '700px';
  modalContainer.style.maxHeight = '85vh';

  modalContainer.innerHTML = `
    <div class="modal-header">
      <h3>${isEdit ? '编辑 Agent Skill' : '新建 Agent Skill'}</h3>
      <button class="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Skill 名称</label>
        <input type="text" id="agentSkillName" placeholder="e.g. code-review" value="${escapeHtml(isEdit ? existingData.name : '')}" ${isEdit ? 'readonly' : ''}>
      </div>
      <div class="form-group">
        <label>描述</label>
        <input type="text" id="agentSkillDesc" placeholder="简要描述此 Skill 的功能" value="${escapeHtml(isEdit ? (existingData.frontmatter?.description || '') : '')}">
      </div>
      <div class="form-group">
        <label>版本</label>
        <input type="text" id="agentSkillVersion" placeholder="1.0" value="${escapeHtml(isEdit ? (existingData.frontmatter?.version || '1.0') : '1.0')}">
      </div>
      <div class="form-group">
        <label>SKILL.md 内容（Markdown）</label>
        <textarea id="agentSkillMarkdown" style="min-height: 300px; font-family: monospace;" placeholder="# Skill 名称&#10;&#10;## 何时使用&#10;- 条件1&#10;- 条件2&#10;&#10;## 执行步骤&#10;1. 步骤1&#10;2. 步骤2">${escapeHtml(isEdit ? (existingData.markdown || '') : '')}</textarea>
      </div>
      ${isEdit && existingData.resources && existingData.resources.length > 0 ? `
      <div class="form-group">
        <label>已有资源文件</label>
        <div class="skill-resource-list">
          ${existingData.resources.map(r => `<span class="skill-resource-tag">📄 ${escapeHtml(r.name)} (${r.size} 字节)</span>`).join('')}
        </div>
      </div>` : ''}
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="cancelAgentSkillBtn">取消</button>
      <button class="btn btn-primary" id="saveAgentSkillBtn" style="width: auto;">保存</button>
    </div>
  `;

  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  // 关闭
  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#cancelAgentSkillBtn').addEventListener('click', closeModal);

  // 保存
  modalOverlay.querySelector('#saveAgentSkillBtn').addEventListener('click', async () => {
    const name = modalOverlay.querySelector('#agentSkillName').value.trim();
    const description = modalOverlay.querySelector('#agentSkillDesc').value.trim();
    const version = modalOverlay.querySelector('#agentSkillVersion').value.trim() || '1.0';
    const markdown = modalOverlay.querySelector('#agentSkillMarkdown').value.trim();
    const enabled = isEdit ? (existingData.frontmatter?.enabled !== false) : true;

    if (!name) return showToast('请输入 Skill 名称', 'error');
    if (!markdown) return showToast('请输入 SKILL.md 内容', 'error');

    try {
      const result = await agentApi('POST', '/api/skill/save-markdown', {
        name, description, version, markdown, enabled
      });
      if (result.success) {
        showToast(`Agent Skill "${name}" 保存成功`, 'success');
        closeModal();
        triggerRefresh();
      } else {
        showToast(result.error || '保存失败', 'error');
      }
    } catch (err) {
      showToast('保存失败: ' + err.message, 'error');
    }
  });
}

/**
 * 显示 Zip/URL 导入弹窗
 */
export function showImportDialog() {
  const existingModal = document.getElementById('skillImportModal');
  if (existingModal) existingModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.className = 'modal-overlay';
  modalOverlay.id = 'skillImportModal';

  const modalContainer = document.createElement('div');
  modalContainer.className = 'modal-content';
  modalContainer.style.width = '640px';

  modalContainer.innerHTML = `
    <div class="modal-header">
      <h3>导入 Skill</h3>
      <button class="modal-close-btn">&times;</button>
    </div>
    <div style="padding: 0 24px 8px 24px;">
      <div class="import-tabs">
        <button class="import-tab active" data-tab="json">JSON 导入</button>
        <button class="import-tab" data-tab="markdown">新建编写</button>
        <button class="import-tab" data-tab="zip">Zip 包</button>
        <button class="import-tab" data-tab="url">URL 导入</button>
      </div>

      <!-- JSON Import -->
      <div class="import-panel active" data-panel="json">
        <div class="import-panel-desc">导入 JSON 格式的 Workflow Skill（确定性自动化流程）</div>
        <div class="upload-drop-zone" id="jsonDropZone">
          <span class="upload-icon">📄</span>
          <span class="upload-text">点击选择 JSON 文件或拖拽到此处</span>
          <span class="upload-hint">支持 .json 格式的 Workflow Skill 定义文件</span>
          <input type="file" id="skillJsonFile" accept=".json">
        </div>
      </div>

      <!-- Agent Skill Markdown -->
      <div class="import-panel" data-panel="markdown">
        <div class="import-panel-desc">直接编写 SKILL.md 内容，创建 Agent Skill（AI 能力扩展）</div>
        <div class="form-group">
          <label>Skill 名称</label>
          <input type="text" id="quickAgentName" placeholder="e.g. code-review 或 deploy-to-server">
        </div>
        <div class="form-group">
          <label>描述</label>
          <input type="text" id="quickAgentDesc" placeholder="简要描述此 Skill 的功能和适用场景">
        </div>
        <div class="form-group">
          <label>SKILL.md 内容（Markdown）</label>
          <textarea id="quickAgentMarkdown" style="min-height: 180px; font-family: 'SF Mono', 'Monaco', 'Menlo', monospace; font-size: 13px; line-height: 1.6;" placeholder="## 何时使用&#10;- 条件1&#10;- 条件2&#10;&#10;## 执行步骤&#10;1. 步骤1&#10;2. 步骤2"></textarea>
        </div>
      </div>

      <!-- Zip Import -->
      <div class="import-panel" data-panel="zip">
        <div class="import-panel-desc">导入包含 SKILL.md 的 Zip 压缩包，可附带 scripts/templates/assets 等辅助资源</div>
        <div class="upload-drop-zone" id="zipDropZone">
          <span class="upload-icon">📦</span>
          <span class="upload-text">点击选择 Zip 文件或拖拽到此处</span>
          <span class="upload-hint">Zip 包内需包含 SKILL.md 文件，可选的 scripts/ templates/ assets/ 子目录</span>
          <input type="file" id="skillZipFile" accept=".zip">
        </div>
      </div>

      <!-- URL Import -->
      <div class="import-panel" data-panel="url">
        <div class="import-panel-desc">从远程 URL 下载 Skill 的 Zip 包并自动导入</div>
        <div class="form-group">
          <label>下载地址</label>
          <div class="url-input-wrapper">
            <span class="url-input-icon">🔗</span>
            <input type="url" id="skillUrl" placeholder="https://example.com/skills/my-skill.zip">
          </div>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="cancelImportBtn">取消</button>
      <button class="btn btn-primary" id="confirmImportBtn" style="width: auto;">导入</button>
    </div>
  `;

  modalOverlay.appendChild(modalContainer);
  document.body.appendChild(modalOverlay);

  const closeModal = () => modalOverlay.remove();
  modalOverlay.querySelector('.modal-close-btn').addEventListener('click', closeModal);
  modalOverlay.querySelector('#cancelImportBtn').addEventListener('click', closeModal);

  // Tab 切换
  modalOverlay.querySelectorAll('.import-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modalOverlay.querySelectorAll('.import-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      modalOverlay.querySelectorAll('.import-panel').forEach(p => p.classList.remove('active'));
      modalOverlay.querySelector(`[data-panel="${tab.dataset.tab}"]`).classList.add('active');
    });
  });

  // Drop Zone 点击触发 file input
  const setupDropZone = (zoneId, fileInputId) => {
    const zone = modalOverlay.querySelector(zoneId);
    const input = modalOverlay.querySelector(fileInputId);
    if (!zone || !input) return;

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.style.borderColor = '#667eea'; zone.style.background = '#f5f7ff'; });
    zone.addEventListener('dragleave', () => { zone.style.borderColor = '#d0d5dd'; zone.style.background = '#fafbfc'; });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.style.borderColor = '#d0d5dd';
      zone.style.background = '#fafbfc';
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        input.files = files;
        showDropFileName(zone, files[0].name);
      }
    });

    input.addEventListener('change', () => {
      if (input.files && input.files[0]) {
        showDropFileName(zone, input.files[0].name);
      }
    });
  };

  const showDropFileName = (zone, name) => {
    zone.classList.add('has-file');
    const existing = zone.querySelector('.file-name');
    if (existing) existing.remove();
    const nameEl = document.createElement('span');
    nameEl.className = 'file-name';
    nameEl.textContent = `✓ ${name}`;
    zone.appendChild(nameEl);
  };

  setupDropZone('#jsonDropZone', '#skillJsonFile');
  setupDropZone('#zipDropZone', '#skillZipFile');

  // 确认导入
  modalOverlay.querySelector('#confirmImportBtn').addEventListener('click', async () => {
    const activeTab = modalOverlay.querySelector('.import-tab.active')?.dataset.tab;

    try {
      if (activeTab === 'json') {
        const fileInput = modalOverlay.querySelector('#skillJsonFile');
        const file = fileInput.files[0];
        if (!file) return showToast('请选择 JSON 文件', 'warning');

        const text = await file.text();
        const skillDef = JSON.parse(text);
        await importSkill(skillDef);
        showToast(`Workflow Skill "${skillDef.name}" 导入成功`, 'success');
      } else if (activeTab === 'markdown') {
        const name = modalOverlay.querySelector('#quickAgentName').value.trim();
        const description = modalOverlay.querySelector('#quickAgentDesc').value.trim();
        const markdown = modalOverlay.querySelector('#quickAgentMarkdown').value.trim();
        if (!name) return showToast('请输入 Skill 名称', 'warning');
        if (!markdown) return showToast('请输入 SKILL.md 内容', 'warning');

        const result = await agentApi('POST', '/api/skill/save-markdown', {
          name, description, version: '1.0', markdown
        });
        if (result.success) {
          showToast(`Agent Skill "${name}" 创建成功`, 'success');
        } else {
          return showToast(result.error || '创建失败', 'error');
        }
      } else if (activeTab === 'zip') {
        const fileInput = modalOverlay.querySelector('#skillZipFile');
        const file = fileInput.files[0];
        if (!file) return showToast('请选择 Zip 文件', 'warning');

        // 文件大小限制：50MB
        const MAX_ZIP_SIZE = 50 * 1024 * 1024;
        if (file.size > MAX_ZIP_SIZE) {
          return showToast('文件过大，最大支持 50MB', 'warning');
        }

        // 使用 FileReader 安全地将文件转为 base64
        const base64 = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result.split(',')[1]);
          reader.onerror = () => reject(new Error('文件读取失败'));
          reader.readAsDataURL(file);
        });
        const result = await agentApi('POST', '/api/skill/import-zip', { zipData: base64 });
        if (result.success) {
          showToast(`Agent Skill "${result.skill?.name || 'unknown'}" 导入成功`, 'success');
        } else {
          return showToast(result.error || '导入失败', 'error');
        }
      } else if (activeTab === 'url') {
        const url = modalOverlay.querySelector('#skillUrl').value.trim();
        if (!url) return showToast('请输入 URL', 'warning');

        const result = await agentApi('POST', '/api/skill/import-url', { url });
        if (result.success) {
          showToast(`Agent Skill "${result.skill?.name || 'unknown'}" 导入成功`, 'success');
        } else {
          return showToast(result.error || '导入失败', 'error');
        }
      }

      closeModal();
      triggerRefresh();
    } catch (err) {
      showToast('导入失败: ' + err.message, 'error');
    }
  });
}


// Skill 管理函数已通过 export 暴露给 toolbox-config.js
