/**
 * Final pass: 修复 agent API 错误消息 + 剩余 Logger 中文
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const fileReplacements = {
  // ========== agent/src/skill/registry.js ==========
  'agent/src/skill/registry.js': [
    ['Skill "${name}" 不存在`', 'Skill "${name}" not found`'],
    ['Skill "${name}" 不存在或未启用`', 'Skill "${name}" not found or not enabled`'],
    ['"${name}" 是 Agent Skill，无法直接执行。Agent Skill 由 AI 在对话中根据 SKILL.md 描述自主调用。`',
     '"${name}" is an Agent Skill and cannot be executed directly. Agent Skills are invoked autonomously by the AI during conversation based on the SKILL.md description.`'],
    ['Skill "${name}" 不存在或不是 Agent Skill`', 'Skill "${name}" not found or is not an Agent Skill`'],
    ['"${name}" 是内置技能，不可删除`', '"${name}" is a built-in skill and cannot be deleted`'],
  ],

  // ========== agent/src/mcp/registry.js ==========
  'agent/src/mcp/registry.js': [
    ['MCP Server "${serverId}" 不存在`', 'MCP Server "${serverId}" not found`'],
    ['MCP Server "${serverId}" 未连接`', 'MCP Server "${serverId}" not connected`'],
  ],

  // ========== agent/src/mcp/mcp-config.js ==========
  'agent/src/mcp/mcp-config.js': [
    ['MCP Server "${serverId}" 不存在`', 'MCP Server "${serverId}" not found`'],
  ],

  // ========== src/background/tool-helpers.js (logger calls) ==========
  'src/background/tool-helpers.js': [
    ["logger.warn('[Background] 工具参数直接解析失败，尝试修复...');",
     "logger.warn('[Background] Tool argument parse failed, attempting fix...');"],
    ["logger.warn('[Background] 工具参数过长（' + trimmed.length + ' 字符），跳过正则修复');",
     "logger.warn('[Background] Tool arguments too long (' + trimmed.length + ' chars), skipping regex fix');"],
    ["logger.warn('[Background] 工具参数修复迭代达到上限（' + MAX_FIX_ITERATIONS + '次），停止修复');",
     "logger.warn('[Background] Tool argument fix iteration limit reached (' + MAX_FIX_ITERATIONS + '), stopping');"],
    ["logger.debug('[Background] 工具参数修复解析成功:', result);",
     "logger.debug('[Background] Tool argument fix parse succeeded:', result);"],
    ["logger.error('[Background] 工具参数修复解析也失败:', e, '修复后字符串:', fixed.substring(0, 200));",
     "logger.error('[Background] Tool argument fix parse also failed:', e, 'fixed string:', fixed.substring(0, 200));"],
    ["logger.debug('[Background] 工具返回格式不标准（缺少 content 字段），已自动补充');",
     "logger.debug('[Background] Non-standard tool return format (missing content), auto-supplemented');"],
    ["logger.warn('[Background] 工具返回了纯字符串而非标准对象，请改用 makeResult()');",
     "logger.warn('[Background] Tool returned plain string instead of standard object, use makeResult() instead');"],
    ["logger.warn('[Background] 记录工具统计失败:', e);",
     "logger.warn('[Background] Tool stats recording failed:', e);"],
    ["logger.warn('[Background] 发送消息到 content script 失败:', errorMsg);",
     "logger.warn('[Background] Failed to send message to content script:', errorMsg);"],
    ["logger.debug('[Background] 尝试自动注入 content script 到 Tab:', tabId);",
     "logger.debug('[Background] Attempting auto-inject content script to tab:', tabId);"],
    ["logger.debug('[Background] Content script 注入成功, 重试发送消息');",
     "logger.debug('[Background] Content script injected successfully, retrying message send');"],
    ["logger.warn('[Background] 重试发送消息也失败:', chrome.runtime.lastError.message);",
     "logger.warn('[Background] Retry message send also failed:', chrome.runtime.lastError.message);"],
    ["logger.error('[Background] 注入 content script 失败:', err);",
     "logger.error('[Background] Failed to inject content script:', err);"],
    ['operationFailed: \'操作失败: {error}\',', "operationFailed: 'Operation failed: {error}',"],
    ["unknownResultFormat: '未知结果格式',", "unknownResultFormat: 'Unknown result format',"],
    ["cannotAccessTab: '无法访问该标签页: {message}',", "cannotAccessTab: 'Cannot access tab: {message}',"],
    ["contentScriptNotFound: '无法找到 content script 文件',", "contentScriptNotFound: 'Cannot find content script file',"],
    ["injectContentScriptFailed: '注入 Content Script 失败: {message}',", "injectContentScriptFailed: 'Failed to inject Content Script: {message}',"],
    ["contentScriptLoaded: '内容脚本已加载',", "contentScriptLoaded: 'Content script loaded',"],
  ],

  // ========== src/background/tool-screenshot.js ==========
  'src/background/tool-screenshot.js': [
    ["logger.error('[Background] 下载失败:', chrome.runtime.lastError.message);",
     "logger.error('[Background] Download failed:', chrome.runtime.lastError.message);"],
    ["logger.debug('[Background] 截图已触发下载，ID:', downloadId, '文件名:', fileName);",
     "logger.debug('[Background] Screenshot download triggered, ID:', downloadId, 'filename:', fileName);"],
  ],

  // ========== src/background/stream-controller.js ==========
  'src/background/stream-controller.js': [
    ["logger.debug(`[StreamController] tool_calls 完成: ${this.toolCalls.length} 个调用`,",
     "logger.debug(`[StreamController] tool_calls complete: ${this.toolCalls.length} calls`,"],
    ["logger.debug('[StreamController] 流式读取已被取消');",
     "logger.debug('[StreamController] Stream read was cancelled');"],
    ["logger.error('[StreamController] 流式读取错误:', error.message);",
     "logger.error('[StreamController] Stream read error:', error.message);"],
    ["logger.debug('[StreamController] 流式读取完成，已收集内容长度:', this.collector.length);",
     "logger.debug('[StreamController] Stream read complete, collected content length:', this.collector.length);"],
    ["logger.debug('[StreamController] 收到完整消息（非流式分块），消息长度:', content?.length);",
     "logger.debug('[StreamController] Received complete message (non-stream chunk), message length:', content?.length);"],
    ["logger.debug('[StreamController] 流式读取结束后，剩余未 flush 文本处理完成');",
     "logger.debug('[StreamController] After stream read ended, remaining unflushed text processed');"],
  ],

  // ========== src/background/local-agent-client.js (i18n zh translations) ==========
  'src/background/local-agent-client.js': [
    ["cannotConnectAgent: '无法连接到 Agent: {error}',", "cannotConnectAgent: 'Cannot connect to Agent: {error}',"],
    ["agentRequestFailed: 'Agent 请求失败: {error}',", "agentRequestFailed: 'Agent request failed: {error}',"],
    ["uploadFailed: '文件上传失败: {error}',", "uploadFailed: 'File upload failed: {error}',"],
    ["logger.debug('[AgentClient] 代理可达性变更:', agentId, reachable ? '可达' : '不可达 (status=' + response.status + ')');",
     "logger.debug('[AgentClient] Agent reachability changed:', agentId, reachable ? 'reachable' : 'unreachable (status=' + response.status + ')');"],
    ["logger.debug('[AgentClient] 连接失败:', error.message);",
     "logger.debug('[AgentClient] Connection failed:', error.message);"],
    ["logger.warn('[AgentClient] 收到非 JSON 数据:', dataPrefix);",
     "logger.warn('[AgentClient] Received non-JSON data:', dataPrefix);"],
    ["logger.debug('[AgentClient] 未知消息类型:', data.type);",
     "logger.debug('[AgentClient] Unknown message type:', data.type);"],
    ["logger.error('[AgentClient] 查询出错:', err);",
     "logger.error('[AgentClient] Query error:', err);"],
    ["logger.debug('[AgentClient] 终端连接异常：', event.code, event.reason, event.wasClean);",
     "logger.debug('[AgentClient] Terminal connection abnormal:', event.code, event.reason, event.wasClean);"],
  ],

  // ========== src/background/react-loop.js ==========
  'src/background/react-loop.js': [
    ["logger.debug(`[ReActLoop] 使用分区进行对话（上下文压缩后首次）`);",
     "logger.debug(`[ReActLoop] Using partition for conversation (first after context compression)`);"],
    ["logger.debug('[ReActLoop] 正在生成标题:', userMessage.substring(0, 50) + '...');",
     "logger.debug('[ReActLoop] Generating title:', userMessage.substring(0, 50) + '...');"],
    ["logger.debug('[ReActLoop] 分区已启动:', partitionId);",
     "logger.debug('[ReActLoop] Partition started:', partitionId);"],
    ["logger.debug('[ReActLoop] 分区已切换为生成对话（移除 titleGen 标记）:', partitionId);",
     "logger.debug('[ReActLoop] Partition switched to generation mode (removed titleGen flag):', partitionId);"],
    ["logger.debug('[ReActLoop] 对话生成完成，持久化当前分区:', partitionId, '消息数:', chatSession.messages.length);",
     "logger.debug('[ReActLoop] Conversation generation complete, persisting partition:', partitionId, 'message count:', chatSession.messages.length);"],
    ["logger.debug('[ReActLoop] 分区持久化完成:', partitionId);",
     "logger.debug('[ReActLoop] Partition persisted:', partitionId);"],
    ["logger.debug(`[ReActLoop] 找不到 ReAct 轮次信息`);",
     "logger.debug(`[ReActLoop] Cannot find ReAct round info`);"],
    ["logger.debug('[ReActLoop] 上下文窗口不足，触发上下文压缩');",
     "logger.debug('[ReActLoop] Context window insufficient, triggering context compression');"],
    ["logger.debug('[ReActLoop] 搜索对话历史，查找 taskId:', taskId);",
     "logger.debug('[ReActLoop] Searching conversation history for taskId:', taskId);"],
    ["logger.debug('[ReActLoop] 查找可用分区:', taskId);",
     "logger.debug('[ReActLoop] Searching available partitions:', taskId);"],
    ["logger.debug('[ReActLoop] 分区部分 ReAct 轮次仍在进行中，跳过该分区:', p.id);",
     "logger.debug('[ReActLoop] Partition has active ReAct rounds, skipping:', p.id);"],
    ["logger.debug('[ReActLoop] 使用现有进行中分区:', partitionId);",
     "logger.debug('[ReActLoop] Using existing active partition:', partitionId);"],
    ["logger.debug('[ReActLoop] 上下文长度:', contextLength, '字符, 消息数:', chatSession.messages.length);",
     "logger.debug('[ReActLoop] Context length:', contextLength, 'chars, message count:', chatSession.messages.length);"],
    ["logger.debug('[ReActLoop] 旧任务统计已重置，statsCleared 标记已设置');",
     "logger.debug('[ReActLoop] Old task stats reset, statsCleared flag set');"],
    ["logger.debug('[ReActLoop] 发送前的上下文长度:', contextLength, '字符');",
     "logger.debug('[ReActLoop] Context length before sending:', contextLength, 'chars');"],
    ["logger.debug('[ReActLoop] 准备发起 API 请求');",
     "logger.debug('[ReActLoop] Preparing to send API request');"],
    ["logger.debug('[ReActLoop] 系统提示词长度:', systemPrompt.length, '字符');",
     "logger.debug('[ReActLoop] System prompt length:', systemPrompt.length, 'chars');"],
    ["logger.debug('[ReActLoop] 异常 API 请求中，只发送最后一条用户消息');",
     "logger.debug('[ReActLoop] Exceptional API request, sending only the last user message');"],
    ["logger.debug('[ReActLoop] 工具结果数量:', results.length);",
     "logger.debug('[ReActLoop] Tool result count:', results.length);"],
    ["logger.debug('[ReActLoop] 工具调用数量:', toolCalls.length);",
     "logger.debug('[ReActLoop] Tool call count:', toolCalls.length);"],
    ["logger.debug('[ReActLoop] 处理计划步骤（并行执行模式），准备调用工具:',",
     "logger.debug('[ReActLoop] Processing plan steps (parallel execution mode), preparing tool calls:',"],
    ["logger.debug('[ReActLoop] 计划步骤处理完成');",
     "logger.debug('[ReActLoop] Plan step processing complete');"],
    ["logger.debug('[ReActLoop] 工具执行完成，所有步骤均已处理');",
     "logger.debug('[ReActLoop] Tool execution complete, all steps processed');"],
    ["logger.debug('[ReActLoop] 检测到 plan_task 等待标记，转为顺序执行！');",
     "logger.debug('[ReActLoop] Detected plan_task wait marker, switching to sequential execution!');"],
    ["logger.debug('[ReActLoop] 工具调用数量:', toolCalls.length, '工具:', toolNames.join(', '));",
     "logger.debug('[ReActLoop] Tool call count:', toolCalls.length, 'Tools:', toolNames.join(', '));"],
    ["logger.debug(`[ReActLoop] 检测到计划步骤 #${planStep.stepIndex}: \"${planStep.description}\", 将在执行完成后继续`);",
     "logger.debug(`[ReActLoop] Detected plan step #${planStep.stepIndex}: \"${planStep.description}\", will continue after execution`);"],
    ["logger.debug('[ReActLoop] 是否强制流式:', config.stream !== false, '流式模式已启动');",
     "logger.debug('[ReActLoop] Force stream:', config.stream !== false, 'stream mode started');"],
    ["logger.debug('[ReActLoop] 开始消费流式数据');",
     "logger.debug('[ReActLoop] Starting to consume stream data');"],
    ["logger.debug('[ReActLoop] 流式数据收集完成，总长度:', this.collectedContent.length);",
     "logger.debug('[ReActLoop] Stream data collection complete, total length:', this.collectedContent.length);"],
    ["logger.debug('[ReActLoop] 非流式数据收集完成，总长度:', this.collectedContent.length);",
     "logger.debug('[ReActLoop] Non-stream data collection complete, total length:', this.collectedContent.length);"],
    ["logger.warn('[ReActLoop] 并发 API 调用，跳过分区持久化');",
     "logger.warn('[ReActLoop] Concurrent API call, skipping partition persistence');"],
    ["logger.debug('[ReActLoop] 正在保存会话...');",
     "logger.debug('[ReActLoop] Saving session...');"],
    ["logger.debug('[ReActLoop] 会话已保存, 消息数:', chatSession.messages.length);",
     "logger.debug('[ReActLoop] Session saved, message count:', chatSession.messages.length);"],
    ["logger.debug('[ReActLoop] 旧任务统计已保存:', taskId);",
     "logger.debug('[ReActLoop] Old task stats saved:', taskId);"],
    ["logger.error('[ReActLoop] 发送时异常:', err);",
     "logger.error('[ReActLoop] Send exception:', err);"],
    ["logger.debug('[ReActLoop] API 请求完成', { status: fetchResponse.status, contentType: fetchResponse.headers?.get?.('content-type') });",
     "logger.debug('[ReActLoop] API request completed', { status: fetchResponse.status, contentType: fetchResponse.headers?.get?.('content-type') });"],
    ["logger.warn('[ReActLoop] ReAct 循环异常，继续执行:', err2.message);",
     "logger.warn('[ReActLoop] ReAct loop exception, continuing execution:', err2.message);"],
    ["logger.debug('[ReActLoop] 工具结果发送前，上下文长度:', JSON.stringify(messages).length, '字符');",
     "logger.debug('[ReActLoop] Before sending tool results, context length:', JSON.stringify(messages).length, 'chars');"],
    ["logger.debug('[ReActLoop] 最后一条用户消息:', typeof lastUserMsg === 'string' ? lastUserMsg.substring(0, 100) : JSON.stringify(lastUserMsg).substring(0, 100));",
     "logger.debug('[ReActLoop] Last user message:', typeof lastUserMsg === 'string' ? lastUserMsg.substring(0, 100) : JSON.stringify(lastUserMsg).substring(0, 100));"],
    ["logger.debug('[ReActLoop] 异常 ReAct 完成，立即开始新循环');",
     "logger.debug('[ReActLoop] Exception ReAct complete, immediately starting new loop');"],
    ["logger.debug(`[ReActLoop] 缺少当前分区（分区在对话期间被清理），重建分区`);",
     "logger.debug(`[ReActLoop] Missing current partition (partition cleaned during conversation), rebuilding partition`);"],
    ["logger.debug('[ReActLoop] 旧任务统计设置完成:', taskId, '模式:', partitionMode);",
     "logger.debug('[ReActLoop] Old task stats setup complete:', taskId, 'mode:', partitionMode);"],
    ["logger.debug('[ReActLoop] 删除旧任务统计完成:', taskId);",
     "logger.debug('[ReActLoop] Old task stats deleted:', taskId);"],
    ["logger.debug('[ReActLoop] 工具结果已保存到分区历史:', partitionId, '新消息数:', results.length);",
     "logger.debug('[ReActLoop] Tool results saved to partition history:', partitionId, 'new messages:', results.length);"],
  ],

  // ========== src/content/selection-toolbar.js ==========
  'src/content/selection-toolbar.js': [
    ["disablePermanentlyTitle: '永久禁用',", "disablePermanentlyTitle: 'Permanently disable',"],
    ["questionTitle: '向助手提问',", "questionTitle: 'Ask assistant',"],
    ["translateTitle: '翻译',", "translateTitle: 'Translate',"],
    ["summarizeTitle: '总结',", "summarizeTitle: 'Summarize',"],
    ["explainTitle: '解释',", "explainTitle: 'Explain',"],
    ["copyTitle: '复制',", "copyTitle: 'Copy',"],
    ['actionCopied: \'已复制到剪贴板 (', "actionCopied: 'Copied to clipboard ("],
    ['actionSent: \'已发送到助手 (', "actionSent: 'Sent to assistant ("],
    ["successText: '成功',", "successText: 'Success',"],
  ],

  // ========== src/content/interaction-tools.js ==========
  'src/content/interaction-tools.js': [
    ["success: '{count} 个元素已填充',", "success: 'Filled {count} element(s)',"],
    ["elementNotFound: '未找到匹配的元素',", "elementNotFound: 'No matching element found',"],
    ["alreadyFilled: '该字段已经有值，跳过',", "alreadyFilled: 'Field already has a value, skipped',"],
    ["clickSuccess: '已点击 {count} 个元素',", "clickSuccess: 'Clicked {count} element(s)',"],
    ["clickFailed: '点击失败: {error}',", "clickFailed: 'Click failed: {error}',"],
    ["scrollSuccess: '已滚动到 {count} 个元素',", "scrollSuccess: 'Scrolled to {count} element(s)',"],
    ["scrollFailure: '未滚动任何元素',", "scrollFailure: 'No elements scrolled',"],
    ["waitSuccess: '已等待 {displayCount} 个元素',", "waitSuccess: 'Waited for {displayCount} element(s)',"],
    ["waitFailure: '等待超时 ({timeout}ms)',", "waitFailure: 'Wait timeout ({timeout}ms)',"],
  ],

  // ========== src/content/page-interaction.js ==========
  'src/content/page-interaction.js': [
    ["dragMovedFailed: '移动失败: {error}',", "dragMovedFailed: 'Move failed: {error}',"],
    ["dragMovedSuccess: '已拖拽移动 {elapsed} 个元素',", "dragMovedSuccess: 'Dragged {elapsed} element(s)',"],
    ["noElementsFound: '未找到任何元素',", "noElementsFound: 'No elements found',"],
    ["highlightSuccess: '已高亮 {count} 个元素',", "highlightSuccess: 'Highlighted {count} element(s)',"],
    ["getTextSuccess: '已获取 {count} 个元素的文本',", "getTextSuccess: 'Got text from {count} element(s)',"],
    ['getHtmlSuccess: \'已获取 {count} 个元素的 HTML 片段\',', "getHtmlSuccess: 'Got HTML from {count} element(s)',"],
    ["getCoordsSuccess: '坐标获取成功',", "getCoordsSuccess: 'Coordinates retrieved successfully',"],
  ],

  // ========== src/content/page-tools.js ==========
  'src/content/page-tools.js': [
    ["queryElementsSuccess: '查询元素：找到 {count} 个匹配元素',", "queryElementsSuccess: 'Query elements: found {count} matching element(s)',"],
    ["queryElementsFailure: '查询元素失败：未找到匹配的元素',", "queryElementsFailure: 'Query elements failed: no matching elements found',"],
  ],

  // ========== src/content/page-extract.js ==========
  'src/content/page-extract.js': [
    ["extractedTitle: '页面标题:',", "extractedTitle: 'Page title:',"],
    ["pageLoaded: '页面加载完成',", "pageLoaded: 'Page loaded',"],
  ],

  // ========== src/side_panel/ui-prototype.js ==========
  'src/side_panel/ui-prototype.js': [
    ["logger.debug('[SidePanel] UI 原型模块事件已初始化');", "logger.debug('[SidePanel] UI prototype module events initialized');"],
    ["logger.debug('[SidePanel] 原型已写入代理，将在浏览器标签页自动打开原型');",
     "logger.debug('[SidePanel] Prototype written to agent, will auto-open in browser tab');"],
    ["logger.debug('[SidePanel] 打开失败将失败回退到 Side Panel');",
     "logger.debug('[SidePanel] Open failed, falling back to Side Panel');"],
  ],

  // ========== src/side_panel/token-stats-panel.js ==========
  'src/side_panel/token-stats-panel.js': [
    ['clearConfirmMessage: \'确定要清空所有 Token 使用统计吗？此操作不可撤销。\',',
     "clearConfirmMessage: 'Are you sure you want to clear all Token usage statistics? This action cannot be undone.',"],
    ["logger.error('[TokenStats] 加载统计失败:', err);", "logger.error('[TokenStats] Failed to load stats:', err);"],
  ],

  // ========== src/side_panel/agent-manager.js ==========
  'src/side_panel/agent-manager.js': [
    ["saveFailed: '保存失败：{message}',", "saveFailed: 'Save failed: {message}',"],
    ["confirmDeleteAgentMessage: '确定要删除助手 \"{name}\" 吗？\\n正在使用该助手的会话将恢复为默认助手。',",
     "confirmDeleteAgentMessage: 'Are you sure you want to delete assistant \"{name}\"?\\nSessions using this assistant will revert to the default assistant.',"],
    ["deleteFailed: '删除失败：{message}',", "deleteFailed: 'Delete failed: {message}',"],
    ["logger.debug('[AgentMgr] Agent 管理器初始化完成, activeAgentId:', state.activeAgentId);",
     "logger.debug('[AgentMgr] Agent manager initialized, activeAgentId:', state.activeAgentId);"],
    ["logger.debug('[AgentMgr] Agent 状态已加载, activeAgentId:', state.activeAgentId, 'total:', allAgents.length, 'toolIds:', state.activeAgentToolIds);",
     "logger.debug('[AgentMgr] Agent state loaded, activeAgentId:', state.activeAgentId, 'total:', allAgents.length, 'toolIds:', state.activeAgentToolIds);"],
    ["logger.debug('[AgentMgr] 已切换 Agent:', agentId, agentName);",
     "logger.debug('[AgentMgr] Switched Agent:', agentId, agentName);"],
    ["logger.error('[AgentMgr] 保存 Agent 失败:', err);", "logger.error('[AgentMgr] Failed to save Agent:', err);"],
    ["logger.error('[AgentMgr] 删除 Agent 失败:', err);", "logger.error('[AgentMgr] Failed to delete Agent:', err);"],
  ],
};

let total = 0;
for (const [file, replacements] of Object.entries(fileReplacements)) {
  const filePath = path.join(root, file);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (not found): ${file}`);
    continue;
  }
  let content = fs.readFileSync(filePath, 'utf-8');
  let changed = 0;

  // Sort by length descending
  replacements.sort((a, b) => b[0].length - a[0].length);

  for (const [from, to] of replacements) {
    const before = content;
    content = content.replaceAll(from, to);
    const occ = before.split(from).length - 1;
    changed += occ;
  }

  if (changed > 0) {
    fs.writeFileSync(filePath, content, 'utf-8');
    total += changed;
    console.log(`OK: ${file} (${changed} replacements)`);
  } else {
    console.log(`ZERO: ${file} (no matches)`);
  }
}

console.log(`\n=== TOTAL: ${total} replacements ===`);
