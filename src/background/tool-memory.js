// background/tool-memory.js - 长期记忆工具（转发层）
// 业务逻辑与数据文件同在 agent 端（agent/src/memory/*），本模块只做参数映射与 HTTP 转发。
// 统一入口 executeAgentMemory，按 action 分发到 /api/memory/{store,recall,manage}。

import { agentRequest } from './local-agent-client.js';
import { makeResult } from './tool-helpers.js';
import { t, registerTranslations } from '../shared/i18n.js';

// 注册 toolMemory 命名空间翻译（仅转发层本地校验所需，业务文案由 agent 端按请求语言渲染）
registerTranslations('zh', {
  toolMemory: {
    missingAction: '缺少 action 参数',
    unsupportedMemoryAction: '不支持的记忆操作: {action}',
    storeMissingSubAction: 'store 操作需要 subAction 参数（add/update/delete）',
    manageMissingSubAction: 'manage 操作需要 subAction 参数（review/compact）',
    memoryEndpointMissing: '长期记忆服务不可用：请升级 Agent 到与插件匹配的版本',
    requestFailed: '记忆服务请求失败：{error}',
  },
});
registerTranslations('en', {
  toolMemory: {
    missingAction: 'Missing action parameter',
    unsupportedMemoryAction: 'Unsupported memory action: {action}',
    storeMissingSubAction: 'store action requires subAction (add/update/delete)',
    manageMissingSubAction: 'manage action requires subAction (review/compact)',
    memoryEndpointMissing: 'Long-term memory service unavailable: please upgrade the Agent to the version matching this extension',
    requestFailed: 'Memory service request failed: {error}',
  },
});

// action → agent 端点；inject（系统提示词分级注入）由 index.js 的 GET_PERMANENT_NOTES 直接调用
const ENDPOINTS = {
  store: '/api/memory/store',
  recall: '/api/memory/recall',
  manage: '/api/memory/manage',
};

// 记忆操作涉及文件读写与检索，30s 足够（远低于 agentRequest 默认 60s）
const MEMORY_TIMEOUT_MS = 30000;

/**
 * agent_memory - 统一记忆管理入口，转发到 agent 端业务端点
 * @param {object} args 工具参数 { action: 'store'|'recall'|'manage', subAction, ... }
 * @param {string} toolCallId 工具调用 ID
 * @param {string} [sessionId] 会话 ID（recall 用于会话级去重）
 * @returns {Promise<object>} makeResult 形状的工具结果（content + 业务字段）
 */
export async function executeAgentMemory(args, toolCallId, sessionId) {
  const { action, subAction } = args || {};

  if (!action) {
    return makeResult(false, t('toolMemory.missingAction'), { tool_call_id: toolCallId });
  }

  const endpoint = ENDPOINTS[action];
  if (!endpoint) {
    return makeResult(false, t('toolMemory.unsupportedMemoryAction', { action }), { tool_call_id: toolCallId });
  }

  // agent 端 service 以 action 字段承载子动作（store: add/update/delete，manage: review/compact）
  let body = { ...args };
  if (action === 'recall') {
    body.sessionId = sessionId || null;
  } else {
    const missingKey = action === 'store' ? 'toolMemory.storeMissingSubAction' : 'toolMemory.manageMissingSubAction';
    if (!subAction) {
      return makeResult(false, t(missingKey), { tool_call_id: toolCallId });
    }
    body = { ...args, action: subAction };
  }

  const resp = await agentRequest(endpoint, body, 'POST', MEMORY_TIMEOUT_MS);

  // 404 = 旧版本 agent 无记忆端点：给出明确升级指引（不做文件 API 回退，版本对应发布）
  if (resp.httpStatus === 404) {
    return makeResult(false, t('toolMemory.memoryEndpointMissing'), { tool_call_id: toolCallId });
  }

  if (!resp.success) {
    const error = resp.error || t('toolMemory.requestFailed', { error: 'unknown' });
    return makeResult(false, error, { tool_call_id: toolCallId, error });
  }

  // 业务字段原样透传（results/total/memory/stats/scored/candidates 等），message 映射为工具 content
  const { success, error, httpStatus, message, ...rest } = resp;
  return {
    ...makeResult(true, message, { tool_call_id: toolCallId }),
    ...rest,
  };
}
