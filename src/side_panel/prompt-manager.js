import state from './state.js';
import { showToast, adjustInputHeight, getSystemPrompt, getApiParams, ensureChatConfigLoaded } from './utils.js';
import { addToInputHistory } from './input-history.js';
import { callApi, addContextBubble, addMessage, buildUserContent, stripImagesFromContent, addLoadingMessage, removeLoadingMessage, saveChatHistory, renderMessageMermaid } from './chat-manager.js';
import { estimateMessagesTokens, assessContextPressure, getContextWindow, trimMessagesByBudget, compressQuotedContext, generateMessagesSummary, getMessageBudget } from '../shared/token-counter.js';

// ==================== 清除选中内容上下文（sendPromptByCode 依赖） ====================

/**
 * 清除选中内容上下文
 */
function clearSelectedContext() {
  console.log('[SidePanel] 清除选中内容上下文');
  state.selectedContextText = '';
  state.quotedContextText = '';
  const indicator = document.getElementById('selectionIndicator');
  const userInput = document.getElementById('userInput');

  if (indicator) {
    indicator.classList.remove('show');
    console.log('[SidePanel] 已隐藏选中内容提示条');
  }

  // 隐藏浮动菜单
  if (typeof window.hideFloatingMenu === 'function') {
    window.hideFloatingMenu();
  }

  // 移除输入框中的选中内容前缀
  if (userInput && userInput.value.startsWith('[选中内容]')) {
    const lines = userInput.value.split('\n');
    let startIndex = 0;
    // 找到 [用户问题] 行的位置
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('[用户问题]')) {
        startIndex = i;
        break;
      }
    }
    if (startIndex > 0) {
      userInput.value = lines.slice(startIndex).join('\n');
      userInput.dispatchEvent(new Event('input'));
      console.log('[SidePanel] 已移除输入框中的选中内容前缀');
    }
  }

  // 重置选中相关状态
  state.lastSelectedText = '';
  state.currentSelectionRange = null;
}

// ==================== 提示词拖拽排序 ====================

/**
 * 初始化提示词拖拽排序
 */
export function initPromptDragAndDrop() {
  const list = document.getElementById('promptManageList');
  const items = list.querySelectorAll('.prompt-manage-item');

  items.forEach(item => {
    // 拖拽开始
    item.addEventListener('dragstart', (e) => {
      state.draggedItemIndex = parseInt(item.dataset.index);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', state.draggedItemIndex);
    });

    // 拖拽结束
    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      // 清除所有 drag-over 样式
      items.forEach(i => i.classList.remove('drag-over'));
      state.draggedItemIndex = null;
    });

    // 拖拽经过
    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      item.classList.add('drag-over');
    });

    // 拖拽离开
    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over');
    });

    // 放置
    item.addEventListener('drop', (e) => {
      e.stopPropagation();
      e.preventDefault();

      const targetIndex = parseInt(item.dataset.index);

      if (state.draggedItemIndex !== null && state.draggedItemIndex !== targetIndex) {
        // 交换位置
        const temp = state.customPrompts[state.draggedItemIndex];
        state.customPrompts.splice(state.draggedItemIndex, 1);
        state.customPrompts.splice(targetIndex, 0, temp);

        // 保存并重新渲染
        chrome.storage.local.set({ customPrompts: state.customPrompts });
        renderPromptManageList();
      }

      item.classList.remove('drag-over');
    });
  });
}

// ==================== 提示词管理按钮 ====================

/**
 * 添加提示词管理按钮到工具栏
 */
export function addPromptManageButton() {
  const inputToolbarRight = document.querySelector('.input-toolbar-right');
  if (!inputToolbarRight) return;

  const manageBtn = document.createElement('button');
  manageBtn.className = 'prompt-manage-btn';
  manageBtn.title = '提示词管理';
  manageBtn.innerHTML = `<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`;
  manageBtn.addEventListener('click', () => {
    showPromptManageModal();
  });

  inputToolbarRight.appendChild(manageBtn);
}

// ==================== 提示词选择器 ====================

/**
 * 显示提示词选择器
 */
export function showPromptSelector(filterText = '') {
  const promptSelector = document.getElementById('promptSelector');
  const promptDropdown = document.getElementById('promptDropdown');

  promptSelector.style.display = 'block';
  promptDropdown.classList.add('show');

  // 渲染提示词列表
  renderPromptList(filterText);
}

/**
 * 隐藏提示词选择器
 */
export function hidePromptSelector() {
  const promptSelector = document.getElementById('promptSelector');
  const promptDropdown = document.getElementById('promptDropdown');

  promptSelector.style.display = 'none';
  promptDropdown.classList.remove('show');
  state.selectedPromptIndex = -1;
}

/**
 * 切换提示词选择器显示/隐藏
 */
export function togglePromptSelector() {
  const promptSelector = document.getElementById('promptSelector');
  const promptDropdown = document.getElementById('promptDropdown');
  const userInput = document.getElementById('userInput');

  if (promptSelector.style.display !== 'none' && promptDropdown.classList.contains('show')) {
    hidePromptSelector();
  } else {
    showPromptSelector();
    // 让输入框获得焦点，以便键盘事件可以触发
    userInput.focus();
  }
}

/**
 * 更新提示词列表（用于输入时实时过滤）
 */
export function updatePromptList(filterText = '') {
  renderPromptList(filterText);
}

/**
 * 渲染提示词列表
 */
export function renderPromptList(filterText = '') {
  const promptList = document.getElementById('promptList');
  const filterLower = filterText.toLowerCase();
  const filteredPrompts = state.customPrompts.filter(prompt => {
    if (!filterText) return true;
    return prompt.code.toLowerCase().includes(filterLower) ||
           prompt.content.toLowerCase().includes(filterLower);
  });

  if (filteredPrompts.length === 0) {
    promptList.innerHTML = '<div class="prompt-empty">暂无匹配的提示词</div>';
    state.selectedPromptIndex = -1;
    return;
  }

  // 默认选中第一条
  state.selectedPromptIndex = 0;

  promptList.innerHTML = filteredPrompts.map((prompt, index) => `
    <div class="prompt-item ${index === state.selectedPromptIndex ? 'selected' : ''}" data-index="${index}" data-code="${prompt.code}">
      <span class="prompt-item-content">${prompt.content}</span>
      <span class="prompt-item-code">/${prompt.code}</span>
    </div>
  `).join('');

  // 绑定点击事件
  promptList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', (e) => {
      const code = item.dataset.code;
      // 如果按下Ctrl键（或Mac的Cmd键），则将提示词带入文本框，否则直接发送
      if (e.ctrlKey || e.metaKey) {
        insertPromptToInputByCode(code);
      } else {
        sendPromptByCode(code);
      }
    });
  });
}

/**
 * 更新提示词选中状态
 */
export function updatePromptSelection(promptItems) {
  promptItems.forEach((item, index) => {
    if (index === state.selectedPromptIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * 选择提示词（通过编码）
 */
export function selectPromptByCode(code) {
  const prompt = state.customPrompts.find(p => p.code === code);
  if (!prompt) return;

  const userInput = document.getElementById('userInput');
  // 找到最后一个 / 的位置
  const value = userInput.value;
  const lastSlashIndex = value.lastIndexOf('/');

  // 找到 / 所在行的开始位置
  let lineStart = lastSlashIndex;
  for (let i = lastSlashIndex - 1; i >= 0; i--) {
    if (value[i] === '\n') {
      lineStart = i + 1;
      break;
    }
  }

  // 替换 /code 为提示词内容
  const newValue = value.substring(0, lineStart) + prompt.content + value.substring(lastSlashIndex + code.length + 1);
  userInput.value = newValue;

  // 移动光标到末尾
  userInput.focus();
  userInput.selectionStart = userInput.selectionEnd = newValue.length;

  // 隐藏提示词选择器
  hidePromptSelector();

  // 自动调整输入框高度
  adjustInputHeight();
}

/**
 * 通过编码插入提示词到输入框（Ctrl+Enter）
 */
export function insertPromptToInputByCode(code) {
  const prompt = state.customPrompts.find(p => p.code === code);
  if (!prompt) return;

  const userInput = document.getElementById('userInput');

  // 找到最后一个 / 的位置，截取该位置之前的内容
  const value = userInput.value;
  const lastSlashIndex = value.lastIndexOf('/');

  let baseContent = value;
  if (lastSlashIndex !== -1) {
    // 找到 / 前面的最后一个换行符的位置
    let lineStart = -1;
    for (let i = lastSlashIndex - 1; i >= 0; i--) {
      if (value[i] === '\n') {
        lineStart = i;
        break;
      }
    }

    if (lineStart !== -1) {
      // 保留换行之前的内容，去掉换行后到 / 之间的内容（包括尾部空格）
      baseContent = value.substring(0, lineStart + 1).trimEnd();
    } else {
      // / 在第一行，从头截取到 / 之前（包括尾部空格）
      baseContent = value.substring(0, lastSlashIndex).trimEnd();
    }
  }

  // 追加提示词到输入框
  userInput.value = baseContent + (baseContent && !baseContent.endsWith('\n') ? '\n\n' : '') + prompt.content;

  // 移动光标到末尾
  userInput.focus();
  userInput.selectionStart = userInput.selectionEnd = userInput.value.length;

  // 隐藏提示词选择器
  hidePromptSelector();

  // 自动调整输入框高度
  adjustInputHeight();

  console.log('[SidePanel] 已追加提示词到输入框:', prompt.code, prompt.content);
}

/**
 * 通过编码发送提示词（直接发送消息）
 */
export async function sendPromptByCode(code) {
  const prompt = state.customPrompts.find(p => p.code === code);
  if (!prompt) return;

  // 防止重复点击
  if (state.isGenerating) {
    console.log('[SidePanel] 正在生成中，请稍候...');
    return;
  }

  // 隐藏提示词选择器
  hidePromptSelector();

  // 清除欢迎消息
  const chatContainer = document.getElementById('chatContainer');
  const welcomeMessage = chatContainer.querySelector('.welcome-message');
  if (welcomeMessage) {
    welcomeMessage.remove();
  }

  // 如果有选中内容且划词问答开启，拼接到用户消息前面，并标记为已使用
  let userMessage = prompt.content;
  const hasSelectedContext = state.enableSelectionQuery && state.selectedContextText && state.selectedContextText.trim();
  const hasQuotedContext = state.quotedContextText && state.quotedContextText.trim();

  // 优先处理引用内容
  if (hasQuotedContext) {
    const ctx = state.quotedContextText.trim();
    const { compressed: compressedCtx, wasCompressed } = compressQuotedContext(ctx);
    userMessage = `[引用内容${wasCompressed ? '摘要' : ''}]\n${compressedCtx}\n\n[用户问题]\n${prompt.content}`;
    // 先添加独立引用气泡
    addContextBubble('quoted', ctx, false);
    // 清除引用内容，只使用一次
    state.quotedContextText = '';
  } else if (hasSelectedContext) {
    const ctx = state.selectedContextText.trim();
    const { compressed: compressedCtx, wasCompressed } = compressQuotedContext(ctx);
    userMessage = `[选中内容${wasCompressed ? '摘要' : ''}]\n${compressedCtx}\n\n[用户问题]\n${prompt.content}`;
    // 先添加独立选中内容气泡
    addContextBubble('selected', ctx, false);
    // 清除选中内容，只使用一次
    state.selectedContextText = '';
  }

  // 如果选中内容或引用内容已使用，清除提示条
  if (hasSelectedContext || hasQuotedContext) {
    clearSelectedContext();
  }

  // 构建用户消息 content（支持图片附件）
  const userContent = buildUserContent(userMessage);

  // 添加用户问题气泡（含图片），传入完整上下文格式供编辑时恢复
  const { messageId } = addMessage('user', buildUserContent(prompt.content), true, [], null, false, userMessage);

  // 更新消息历史
  state.messageHistory.push({ role: 'user', content: userContent, messageId });

  // 保存历史
  saveChatHistory();

  // 添加到输入历史
  addToInputHistory(prompt.content);

  // 清空输入框并保持焦点
  const userInput = document.getElementById('userInput');
  userInput.value = '';
  userInput.style.height = 'auto';

  // 设置生成状态（按钮切换由 generating-state-changed 事件处理）
  state.isGenerating = true;

  // 添加加载消息
  const loadingId = addLoadingMessage();
  const mySessionId = state.activeSessionId;

  const model = state.enableImageInput && state.attachedImages.length > 0
    ? (state.imageModelName || state.currentModel)
    : state.currentModel;

  // 图片数据已包含在 userContent 中，立即清除预览栏 DOM
  if (state.attachedImages.length > 0) {
    const previewBar = document.getElementById('imagePreviewBar');
    if (previewBar) previewBar.innerHTML = '';
  }

  try {
    // 确保配置已加载
    await ensureChatConfigLoaded();

    console.log('[SidePanel] 发送消息调试信息:');
    console.log('  - isolateChat:', state.isolateChat);
    console.log('  - chatConfig:', state.chatConfig);
    console.log('  - messageHistory.length:', state.messageHistory.length);

    // 构建 messages
    let messages = [
      {
        role: 'system',
        content: await getSystemPrompt()
      }
    ];

    // 如果记忆对话，则发送历史对话；否则只发送当前最新消息
    if (state.isolateChat) {
      let historyToSend = state.messageHistory;
      // Token 预算驱动：根据模型上下文窗口动态裁剪
      const configuredWindow = state.chatConfig.contextWindow || 0;
      const toolCount = state.enabledTools.length || 50;
      const messageBudget = getMessageBudget(model, toolCount, configuredWindow, state.customModelMap);
      const historyBudget = Math.floor(messageBudget * 0.7);
      
      const historyWithoutCurrent = state.messageHistory.slice(0, -1);
      const currentMsg = state.messageHistory[state.messageHistory.length - 1];
      
      const keptHistory = [];
      let keptTokens = estimateMessagesTokens([currentMsg]);
      for (let i = historyWithoutCurrent.length - 1; i >= 0; i--) {
        const msg = historyWithoutCurrent[i];
        const msgTokens = estimateMessagesTokens([msg]);
        if (keptTokens + msgTokens <= historyBudget) {
          keptHistory.unshift(msg);
          keptTokens += msgTokens;
        } else {
          break;
        }
      }
      
      if (keptHistory.length < historyWithoutCurrent.length) {
        const trimmedCount = historyWithoutCurrent.length - keptHistory.length;
        const trimmedMsgs = historyWithoutCurrent.slice(0, trimmedCount);
        const summary = generateMessagesSummary(trimmedMsgs);
        if (summary) {
          messages[0] = { ...messages[0], content: messages[0].content + '\n\n' + summary };
        }
      }
      
      historyToSend = [...keptHistory, currentMsg];
      messages = [...messages, ...historyToSend];
      // 剥离历史消息中的旧图片数据，只保留当前最新消息的图片
      for (let i = 0; i < messages.length - 1; i++) {
        messages[i] = { ...messages[i], content: stripImagesFromContent(messages[i].content) };
      }
    } else {
      // 无记忆模式：只发送当前用户消息
      messages.push({ role: 'user', content: userContent });
    }

    // 调用 background.js 的 API
    const apiParams = await getApiParams();
    let content, executionLog;

    try {
      const result = await callApi(messages, model, state.useTools, apiParams);
      content = result.content;
      executionLog = result.executionLog || [];
    } catch (errorResult) {
      // 移除加载消息
      removeLoadingMessage(loadingId);

      // 错误情况下也获取 executionLog
      content = '❌ 请求失败：' + (errorResult.message || '未知错误');
      executionLog = errorResult.executionLog || [];

      // 添加错误消息（传递执行日志以便用户可查看）
      const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog);

      // 将错误回复添加到消息历史（包含执行日志）
      state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, messageId });

      // 保存历史
      saveChatHistory();

      throw errorResult; // 重新抛出以触发 finally 块
    }

    // 移除加载消息
    removeLoadingMessage(loadingId);

    // 添加助手回复（传递执行日志）
    const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog);

    // 渲染消息中的 mermaid 图表
    await renderMessageMermaid(messageDiv);

    // 将助手回复添加到消息历史（包含执行日志）
    state.messageHistory.push({ role: 'assistant', content: content, executionLog: executionLog, messageId });

    // 保存历史
    saveChatHistory();

  } catch (error) {
    // 已在内部 catch 块中处理并保存，这里只做清理工作
  } finally {
    state.generatingSessionIds.delete(mySessionId);
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
    userInput.focus();
    state.attachedImages = [];
  }
}

/**
 * 选择提示词（通过索引，保留兼容）
 */
export function selectPrompt(index) {
  const prompt = state.customPrompts[index];
  if (!prompt) return;
  selectPromptByCode(prompt.code);
}

// ==================== 提示词管理模态框 ====================

/**
 * 显示提示词管理模态框
 */
export function showPromptManageModal() {
  const modal = document.getElementById('promptManageModal');
  modal.classList.add('show');
  renderPromptManageList();
}

/**
 * 隐藏提示词管理模态框
 */
export function hidePromptManageModal() {
  const modal = document.getElementById('promptManageModal');
  modal.classList.remove('show');
  // 清空输入框
  const editIndex = document.getElementById('editPromptIndex');
  const codeInput = document.getElementById('newPromptCode');
  const contentInput = document.getElementById('newPromptContent');
  const addBtn = document.getElementById('promptManageAddBtn');

  if (editIndex) editIndex.value = '';
  if (codeInput) codeInput.value = '';
  if (contentInput) contentInput.value = '';
  if (addBtn) {
    addBtn.textContent = '添加提示词';
    addBtn.style.background = '#667eea';
  }
}

/**
 * 渲染提示词管理列表
 */
export function renderPromptManageList() {
  const list = document.getElementById('promptManageList');

  if (state.customPrompts.length === 0) {
    list.innerHTML = '<div class="prompt-empty">暂无提示词，请添加</div>';
    return;
  }

  list.innerHTML = state.customPrompts.map((prompt, index) => `
    <div class="prompt-manage-item" draggable="true" data-index="${index}">
      <div class="prompt-manage-item-left">
        <span class="prompt-drag-handle" title="拖拽排序">⋮⋮</span>
        <span class="prompt-manage-item-content">${prompt.content}</span>
      </div>
      <span class="prompt-manage-item-code">/${prompt.code}</span>
      <div class="prompt-manage-item-actions">
        <button class="prompt-sort-btn move-up-btn" data-index="${index}" title="上移" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="prompt-sort-btn move-down-btn" data-index="${index}" title="下移" ${index === state.customPrompts.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="prompt-sort-btn menu-toggle-btn ${prompt.enabledInMenu === true ? 'active' : ''}" data-index="${index}" title="菜单显示">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
          </svg>
        </button>
        <button class="edit-btn" data-index="${index}" title="编辑">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>
          </svg>
        </button>
        <button class="delete-btn" data-index="${index}" title="删除">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');

  // 绑定上移按钮事件
  list.querySelectorAll('.move-up-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      if (index > 0) {
        const temp = state.customPrompts[index];
        state.customPrompts[index] = state.customPrompts[index - 1];
        state.customPrompts[index - 1] = temp;
        chrome.storage.local.set({ customPrompts: state.customPrompts });
        renderPromptManageList();
      }
    });
  });

  // 绑定下移按钮事件
  list.querySelectorAll('.move-down-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      if (index < state.customPrompts.length - 1) {
        const temp = state.customPrompts[index];
        state.customPrompts[index] = state.customPrompts[index + 1];
        state.customPrompts[index + 1] = temp;
        chrome.storage.local.set({ customPrompts: state.customPrompts });
        renderPromptManageList();
      }
    });
  });

  // 绑定菜单显示切换按钮事件
  list.querySelectorAll('.menu-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      state.customPrompts[index].enabledInMenu = !state.customPrompts[index].enabledInMenu;
      chrome.storage.local.set({ customPrompts: state.customPrompts });
      renderPromptManageList();
    });
  });

  // 绑定编辑事件
  list.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      editPrompt(index);
    });
  });

  // 绑定删除事件
  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.dataset.index);
      showDeleteConfirmModal(index);
    });
  });

  // 绑定拖拽事件
  initPromptDragAndDrop();
}

// ==================== 提示词错误模态框 ====================

/**
 * 显示提示词校验错误模态框
 */
export function showPromptErrorModal(message) {
  const modal = document.getElementById('promptErrorModal');
  const messageEl = document.getElementById('promptErrorMessage');
  messageEl.textContent = message;
  modal.classList.add('show');
}

/**
 * 隐藏提示词校验错误模态框
 */
export function hidePromptErrorModal() {
  const modal = document.getElementById('promptErrorModal');
  modal.classList.remove('show');
}

// ==================== 提示词增删改 ====================

/**
 * 添加提示词
 */
export function addPrompt() {
  const editIndex = document.getElementById('editPromptIndex');
  const codeInput = document.getElementById('newPromptCode');
  const contentInput = document.getElementById('newPromptContent');

  const code = codeInput.value.trim();
  const content = contentInput.value.trim();

  if (!code || !content) {
    showPromptErrorModal('请填写编码和内容');
    return;
  }

  const editIdx = editIndex ? parseInt(editIndex.value) : -1;

  // 检查编码是否已存在
  const existingIndex = state.customPrompts.findIndex(p => p.code === code);
  if (existingIndex !== -1 && existingIndex !== editIdx) {
    showPromptErrorModal('编码已存在');
    return;
  }

  if (editIdx >= 0 && editIdx < state.customPrompts.length) {
    // 编辑已有提示词，保留 enabledInMenu 状态
    state.customPrompts[editIdx] = { ...state.customPrompts[editIdx], code, content };
  } else {
    // 添加新提示词，默认不在菜单中显示
    state.customPrompts.push({ code, content, enabledInMenu: false });
  }

  chrome.storage.local.set({ customPrompts: state.customPrompts });

  // 清空输入框
  codeInput.value = '';
  contentInput.value = '';
  if (editIndex) {
    editIndex.value = '';
  }

  // 更新按钮文字
  const addBtn = document.getElementById('promptManageAddBtn');
  addBtn.textContent = '添加提示词';
  addBtn.style.background = '#667eea';

  // 重新渲染列表
  renderPromptManageList();
}

/**
 * 编辑提示词
 */
export function editPrompt(index) {
  const prompt = state.customPrompts[index];
  if (!prompt) return;

  const editIndex = document.getElementById('editPromptIndex');
  const codeInput = document.getElementById('newPromptCode');
  const contentInput = document.getElementById('newPromptContent');
  const addBtn = document.getElementById('promptManageAddBtn');

  // 填充编辑索引
  if (editIndex) {
    editIndex.value = index;
  }

  // 填充表单
  codeInput.value = prompt.code;
  contentInput.value = prompt.content;

  // 更新按钮文字
  addBtn.textContent = '保存修改';
  addBtn.style.background = '#ffa502';

  // 滚动到表单区域
  codeInput.scrollIntoView({ behavior: 'smooth' });
}

/**
 * 显示删除确认模态框
 */
export function showDeleteConfirmModal(index) {
  const prompt = state.customPrompts[index];
  if (!prompt) return;

  state.pendingDeleteIndex = index;
  const modal = document.getElementById('deleteConfirmModal');
  const message = document.getElementById('deleteConfirmMessage');
  message.textContent = `确定要删除提示词 "/${prompt.code}" 吗？`;
  modal.classList.add('show');
}

/**
 * 隐藏删除确认模态框
 */
export function hideDeleteConfirmModal() {
  const modal = document.getElementById('deleteConfirmModal');
  modal.classList.remove('show');
  state.pendingDeleteIndex = -1;
}

/**
 * 删除提示词
 */
export function deletePrompt(index) {
  state.customPrompts.splice(index, 1);
  chrome.storage.local.set({ customPrompts: state.customPrompts });
  renderPromptManageList();
}

// ==================== 初始化提示词事件 ====================

/**
 * 初始化提示词相关事件（原 IIFE）
 */
export function initPromptEvents() {
  // 提示词管理模态框按钮
  const promptManageCancelBtn = document.getElementById('promptManageCancelBtn');
  const promptManageAddBtn = document.getElementById('promptManageAddBtn');
  const promptModalCloseBtn = document.getElementById('promptModalCloseBtn');

  if (promptManageCancelBtn) {
    promptManageCancelBtn.addEventListener('click', hidePromptManageModal);
  }

  if (promptManageAddBtn) {
    promptManageAddBtn.addEventListener('click', addPrompt);
  }

  // 关闭按钮
  if (promptModalCloseBtn) {
    promptModalCloseBtn.addEventListener('click', hidePromptManageModal);
  }

  // 删除确认模态框按钮
  const deleteCancelBtn = document.getElementById('deleteCancelBtn');
  const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

  if (deleteCancelBtn) {
    deleteCancelBtn.addEventListener('click', hideDeleteConfirmModal);
  }

  if (deleteConfirmBtn) {
    deleteConfirmBtn.addEventListener('click', () => {
      if (state.pendingDeleteIndex >= 0) {
        deletePrompt(state.pendingDeleteIndex);
      }
      hideDeleteConfirmModal();
    });
  }

  // 点击删除确认模态框外部关闭
  const deleteConfirmModal = document.getElementById('deleteConfirmModal');
  if (deleteConfirmModal) {
    deleteConfirmModal.addEventListener('click', (e) => {
      if (e.target === deleteConfirmModal) {
        hideDeleteConfirmModal();
      }
    });
  }

  // 提示词错误模态框按钮
  const promptErrorConfirmBtn = document.getElementById('promptErrorConfirmBtn');
  if (promptErrorConfirmBtn) {
    promptErrorConfirmBtn.addEventListener('click', hidePromptErrorModal);
  }

  // 点击提示词错误模态框外部关闭
  const promptErrorModal = document.getElementById('promptErrorModal');
  if (promptErrorModal) {
    promptErrorModal.addEventListener('click', (e) => {
      if (e.target === promptErrorModal) {
        hidePromptErrorModal();
      }
    });
  }
}
