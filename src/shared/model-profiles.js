// shared/model-profiles.js - 模型厂商配置（多配置记忆与切换）
//
// 设计：modelProfiles 保存多套厂商配置（地址/Key/模型列表/选中模型），
// activeProfileId 标记当前激活项。扁平键（apiBase/apiKey/modelName/customModels）
// 保留为"激活配置的运行时投影"——所有既有调用链（background/会话/Agent）零改动。
// 切换配置时由本模块统一把配置字段写回扁平键，避免数据分叉。

const PROFILES_KEY = 'modelProfiles';
const ACTIVE_PROFILE_KEY = 'activeProfileId';

// 迁移初始配置的固定 id（两端并发迁移时幂等，不会产生重复条目）
const LEGACY_PROFILE_ID = 'profile-legacy-default';

// 历史硬编码预设模型（迁移时快照进配置的完整模型列表）
const LEGACY_PRESET_MODELS = ['deepseek-v4-pro', 'deepseek-v4-flash'];

export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL_NAME = 'deepseek-v4-pro';

// 预设厂商域名 → 配置默认名映射
const VENDOR_NAME_RULES = [
  [/api\.deepseek\.com/i, 'DeepSeek'],
  [/hunyuan\.cloud\.tencent\.com/i, '腾讯混元'],
  [/dashscope\.aliyuncs\.com/i, '阿里云百炼'],
  [/qianfan\.baidubce\.com/i, '百度千帆'],
  [/ark\.cn-beijing\.volces\.com/i, '火山方舟'],
  [/open\.bigmodel\.cn/i, '智谱 GLM'],
  [/api\.moonshot\.cn/i, 'Moonshot'],
  [/api\.stepfun\.com/i, '阶跃星辰'],
  [/api\.minimaxi\.com/i, 'MiniMax'],
  [/spark-api-open\.xf-yun\.com/i, '讯飞星火'],
  [/api\.baichuan-ai\.com/i, '百川智能'],
  [/api\.siliconflow\.cn/i, '硅基流动'],
  [/api\.openai\.com/i, 'OpenAI'],
  [/api\.anthropic\.com/i, 'Anthropic'],
  [/generativelanguage\.googleapis\.com/i, 'Google Gemini'],
  [/openrouter\.ai/i, 'OpenRouter'],
  [/api\.groq\.com/i, 'Groq'],
  [/api\.mistral\.ai/i, 'Mistral'],
];

/**
 * 生成配置 id（优先 crypto.randomUUID，兜底时间戳+随机串）
 */
function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 从 apiBase 提取主机名（用于列表右侧提示）
 * @param {string} apiBase
 * @returns {string}
 */
export function getHostFromApiBase(apiBase) {
  const raw = String(apiBase || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).hostname;
  } catch {
    return raw.replace(/^https?:\/\//i, '').split('/')[0];
  }
}

/**
 * 从 apiBase 推导配置默认名（预设厂商映射，未知域名回退主机名）
 * @param {string} apiBase
 * @returns {string}
 */
export function deriveProfileName(apiBase) {
  const raw = String(apiBase || '').trim();
  if (!raw) return '';
  for (const [re, name] of VENDOR_NAME_RULES) {
    if (re.test(raw)) return name;
  }
  return getHostFromApiBase(raw);
}

/**
 * 模型列表归一化：兼容旧格式（字符串）与新格式（{name, contextWindow}）
 * @param {Array} list
 * @returns {Array<{name: string, contextWindow: number}>}
 */
export function normalizeModels(list) {
  const out = [];
  if (!Array.isArray(list)) return out;
  for (const item of list) {
    if (typeof item === 'string' && item) {
      out.push({ name: item, contextWindow: 0 });
    } else if (item && typeof item === 'object' && item.name) {
      out.push({ name: item.name, contextWindow: item.contextWindow || 0 });
    }
  }
  return out;
}

/**
 * 名称排序比较器：不区分大小写（固定 zh 排序规则，Node 与 Chrome 的 ICU 行为一致）；
 * 汉字组整体排在拉丁字母前、组内按拼音，拉丁字母按字母序。
 * 用于厂商 / 模型下拉列表的展示排序，仅影响渲染顺序，不改变配置存储顺序
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function compareByName(a, b) {
  return String(a || '').toLowerCase().localeCompare(String(b || '').toLowerCase(), 'zh');
}

/**
 * 读取完整配置状态
 * @returns {Promise<{profiles: Array, activeProfileId: string}>}
 */
export async function getState() {
  const result = await chrome.storage.local.get([PROFILES_KEY, ACTIVE_PROFILE_KEY]);
  const profiles = Array.isArray(result[PROFILES_KEY]) ? result[PROFILES_KEY] : [];
  return { profiles, activeProfileId: result[ACTIVE_PROFILE_KEY] || '' };
}

/**
 * 获取当前激活配置对象（无则返回 null）
 * @param {{profiles: Array, activeProfileId: string}} [state]
 * @returns {Promise<object|null>}
 */
export async function getActiveProfile(state) {
  const s = state || await getState();
  return s.profiles.find(p => p.id === s.activeProfileId) || null;
}

/**
 * 校验模型名是否属于指定配置的可用模型（选中的模型名或模型列表内）
 * 用于「历史模型名 + 当前厂商连接」错配场景的运行时一致性校验（如定时任务
 * 执行时宿主会话/Agent 携带的可能仍是旧厂商的模型名）。
 * @param {string} modelName
 * @param {object|null} profile
 * @returns {boolean}
 */
export function isModelInProfile(modelName, profile) {
  if (!modelName || !profile) return false;
  if (modelName === profile.modelName) return true;
  return normalizeModels(profile.models).some((m) => m.name === modelName);
}

/**
 * 迁移旧数据并确保配置状态就绪（幂等，可在多个页面并发调用）
 * @param {{fallbackName?: string}} [opts]
 * @returns {Promise<{profiles: Array, activeProfileId: string, migrated: boolean}>}
 */
export async function ensureProfilesMigrated(opts = {}) {
  let state = await getState();

  if (state.profiles.length === 0) {
    // 用当前扁平键 + 预设模型快照构造初始配置
    const flat = await chrome.storage.local.get([
      'apiBase', 'apiKey', 'modelName', 'customModels', 'deletedPresetModels',
    ]);
    const deletedPresets = Array.isArray(flat.deletedPresetModels) ? flat.deletedPresetModels : [];
    const models = [];
    const indexOf = new Map();
    for (const name of LEGACY_PRESET_MODELS) {
      if (!deletedPresets.includes(name)) {
        indexOf.set(name, models.length);
        models.push({ name, contextWindow: 0 });
      }
    }
    for (const item of normalizeModels(flat.customModels)) {
      if (indexOf.has(item.name)) {
        if (item.contextWindow > 0) models[indexOf.get(item.name)].contextWindow = item.contextWindow;
      } else {
        indexOf.set(item.name, models.length);
        models.push(item);
      }
    }

    const apiBase = flat.apiBase || DEFAULT_API_BASE;
    const now = Date.now();
    const profile = {
      id: LEGACY_PROFILE_ID,
      name: deriveProfileName(apiBase) || opts.fallbackName || 'AI',
      apiBase,
      apiKey: flat.apiKey || '',
      modelName: flat.modelName || DEFAULT_MODEL_NAME,
      models,
      createdAt: now,
      updatedAt: now,
    };

    // 二次读取防并发双写：另一端已写入则直接采用
    const recheck = await getState();
    if (recheck.profiles.length > 0) {
      return repairActiveId(recheck);
    }

    await chrome.storage.local.set({
      [PROFILES_KEY]: [profile],
      [ACTIVE_PROFILE_KEY]: profile.id,
      // 同步扁平键：迁移后 customModels 即配置的完整模型列表（投影保持一致）
      customModels: models,
    });
    return { profiles: [profile], activeProfileId: profile.id, migrated: true };
  }

  return repairActiveId(state);
}

/**
 * 修复 activeProfileId 缺失/失效的情况
 */
async function repairActiveId(state) {
  const valid = state.profiles.some(p => p.id === state.activeProfileId);
  if (valid) return { ...state, migrated: false };
  const activeProfileId = state.profiles[0].id;
  await chrome.storage.local.set({ [ACTIVE_PROFILE_KEY]: activeProfileId });
  return { profiles: state.profiles, activeProfileId, migrated: false };
}

/**
 * 切换激活配置：把配置字段同步回扁平键（立即生效）
 * @param {string} id
 * @returns {Promise<object|null>} 切换后的配置对象
 */
export async function applyProfile(id) {
  const state = await getState();
  const profile = state.profiles.find(p => p.id === id);
  if (!profile) return null;

  await chrome.storage.local.set({
    apiBase: profile.apiBase || DEFAULT_API_BASE,
    apiKey: profile.apiKey || '',
    modelName: profile.modelName || DEFAULT_MODEL_NAME,
    customModels: normalizeModels(profile.models),
    [ACTIVE_PROFILE_KEY]: profile.id,
  });
  return profile;
}

/**
 * 更新激活配置的字段（如保存配置时同步地址/Key/模型名/模型列表）
 * @param {object} patch - 允许的字段：name/apiBase/apiKey/modelName/models
 * @returns {Promise<object|null>} 更新后的配置对象
 */
export async function updateActiveProfile(patch) {
  const state = await getState();
  const profile = state.profiles.find(p => p.id === state.activeProfileId);
  if (!profile) return null;

  const next = {
    ...profile,
    updatedAt: Date.now(),
  };
  if (patch.name !== undefined) next.name = String(patch.name).trim() || profile.name;
  if (patch.apiBase !== undefined) next.apiBase = patch.apiBase;
  if (patch.apiKey !== undefined) next.apiKey = patch.apiKey;
  if (patch.modelName !== undefined) next.modelName = patch.modelName;
  if (patch.models !== undefined) next.models = normalizeModels(patch.models);

  const profiles = state.profiles.map(p => (p.id === profile.id ? next : p));
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
  return next;
}

/**
 * 同步激活配置的模型列表（模型增删改后调用）
 * @param {Array} models
 */
export function syncActiveProfileModels(models) {
  return updateActiveProfile({ models });
}

/**
 * 同步激活配置的选中模型（切换模型时调用）
 * @param {string} modelName
 */
export function updateActiveProfileModelName(modelName) {
  return updateActiveProfile({ modelName });
}

/**
 * 新建配置
 * @param {object} data - {name, apiBase, apiKey, modelName, models}
 * @param {{activate?: boolean}} [opts]
 * @returns {Promise<object>} 新配置对象
 */
export async function createProfile(data = {}, opts = {}) {
  const state = await getState();
  const now = Date.now();
  const profile = {
    id: generateId(),
    name: String(data.name || '').trim() || deriveProfileName(data.apiBase) || 'AI',
    apiBase: data.apiBase !== undefined ? data.apiBase : DEFAULT_API_BASE,
    apiKey: data.apiKey || '',
    modelName: data.modelName || DEFAULT_MODEL_NAME,
    models: normalizeModels(data.models),
    createdAt: now,
    updatedAt: now,
  };

  const profiles = [...state.profiles, profile];
  const payload = { [PROFILES_KEY]: profiles };
  if (opts.activate !== false) {
    payload[ACTIVE_PROFILE_KEY] = profile.id;
    payload.apiBase = profile.apiBase || DEFAULT_API_BASE;
    payload.apiKey = profile.apiKey;
    payload.modelName = profile.modelName;
    payload.customModels = profile.models;
  }
  await chrome.storage.local.set(payload);
  return profile;
}

/**
 * 重命名配置
 * @param {string} id
 * @param {string} name
 * @returns {Promise<boolean>} 是否重命名成功
 */
export async function renameProfile(id, name) {
  const newName = String(name || '').trim();
  if (!newName) return false;
  const state = await getState();
  const target = state.profiles.find(p => p.id === id);
  if (!target) return false;

  const profiles = state.profiles.map(p => (
    p.id === id ? { ...p, name: newName, updatedAt: Date.now() } : p
  ));
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
  return true;
}

/**
 * 删除配置（至少保留一个；删除激活项时自动激活剩余第一个并同步扁平键）
 * @param {string} id
 * @returns {Promise<{deleted: boolean, reason?: string, activeProfileId: string, nextActive?: object|null}>}
 */
export async function deleteProfile(id) {
  const state = await getState();
  if (state.profiles.length <= 1) {
    return { deleted: false, reason: 'last', activeProfileId: state.activeProfileId };
  }
  const target = state.profiles.find(p => p.id === id);
  if (!target) {
    return { deleted: false, reason: 'not-found', activeProfileId: state.activeProfileId };
  }

  const profiles = state.profiles.filter(p => p.id !== id);
  let activeProfileId = state.activeProfileId;
  let nextActive = null;
  if (activeProfileId === id) {
    activeProfileId = profiles[0].id;
    nextActive = profiles[0];
  }

  const payload = { [PROFILES_KEY]: profiles, [ACTIVE_PROFILE_KEY]: activeProfileId };
  if (nextActive) {
    payload.apiBase = nextActive.apiBase || DEFAULT_API_BASE;
    payload.apiKey = nextActive.apiKey || '';
    payload.modelName = nextActive.modelName || DEFAULT_MODEL_NAME;
    payload.customModels = normalizeModels(nextActive.models);
  }
  await chrome.storage.local.set(payload);
  return { deleted: true, activeProfileId, nextActive };
}

/**
 * 判断是否为“空白默认配置”（自动迁移生成、从未被用户配置过）
 */
function isPristineDefault(p) {
  return !!p
    && !p.apiKey
    && (!p.apiBase || p.apiBase === DEFAULT_API_BASE)
    && (!p.modelName || p.modelName === DEFAULT_MODEL_NAME);
}

/**
 * 导入合并用：按 id 对齐合并厂商配置
 * - 新 id：追加
 * - 同 id：文件条目 updatedAt 较新则覆盖，否则忽略（保留本机）；
 *   例外：本机条目为空白默认配置时不阻挡同 id 导入（新环境迁移场景）
 * - 无 id 的条目：无法对齐，跳过
 * @param {Array} localProfiles - 本机现有配置
 * @param {Array} incomingProfiles - 导入文件中的配置
 * @returns {Array} 合并后的配置列表（不修改原数组）
 */
export function mergeProfiles(localProfiles, incomingProfiles) {
  const merged = Array.isArray(localProfiles) ? localProfiles.map(p => ({ ...p })) : [];
  if (!Array.isArray(incomingProfiles)) return merged;

  for (const inc of incomingProfiles) {
    if (!inc || !inc.id) continue;
    const idx = merged.findIndex(p => p.id === inc.id);
    if (idx === -1) {
      merged.push({ ...inc });
      continue;
    }
    const fileTs = Number(inc.updatedAt) || 0;
    const localTs = Number(merged[idx].updatedAt) || 0;
    if (fileTs > localTs || isPristineDefault(merged[idx])) {
      const next = { ...inc };
      // 不含密钥导出时文件 apiKey 为空：继承本机密钥，避免误清
      if (!next.apiKey && merged[idx].apiKey) next.apiKey = merged[idx].apiKey;
      merged[idx] = next;
    }
    // 文件条目不更新（老文件）：忽略，保留本机
  }
  return merged;
}

/**
 * 导出用：剥离配置中的密钥
 * @param {Array} profiles
 * @returns {Array}
 */
export function stripProfileSecrets(profiles) {
  if (!Array.isArray(profiles)) return [];
  return profiles.map(p => ({ ...p, apiKey: '' }));
}
