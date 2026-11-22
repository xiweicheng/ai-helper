// agent-builder-core.js - AI 创建助手的纯逻辑（无 DOM / 无 chrome 依赖，便于单测）
//
// 协议：模型每轮只输出一个 JSON 对象
//   提问 { action:'ask',  message, question:{ text, options[], recommended, allowCustom } }
//   完成 { action:'done', message, agent:{ name, icon, description, systemPrompt, toolIds, skillIds } }
// 工具/技能必须来自注入的目录；normalizeAgentDraft 负责白名单过滤与兜底。

const MAX_NAME = 24;
const MAX_DESC = 60;
const MAX_PROMPT = 4000;
const MAX_TOOL_DESC = 60;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function truncate(text, max) {
  const chars = Array.from(text);
  return chars.length > max ? chars.slice(0, max).join('') : text;
}

function formatTools(tools, language) {
  if (!tools.length) {
    return language === 'en' ? '(no tools available)' : '（当前没有可用工具）';
  }
  // 稳定排序：提示词作为 system 消息可被 prompt cache 命中
  const sorted = [...tools].sort((a, b) => {
    const ca = a.category || '';
    const cb = b.category || '';
    if (ca !== cb) return ca.localeCompare(cb);
    return String(a.id).localeCompare(String(b.id));
  });
  const descLimit = sorted.length > 80 ? 40 : MAX_TOOL_DESC;
  return sorted
    .map(t => `- ${t.id}｜${t.name}｜${truncate(t.description || '', descLimit)}`)
    .join('\n');
}

function formatSkills(skills, language) {
  if (!skills.length) {
    return language === 'en' ? '(no skills available)' : '（当前没有可用技能）';
  }
  const sorted = [...skills].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return sorted
    .map(s => `- ${s.name}｜${truncate(s.description || '', MAX_TOOL_DESC)}`)
    .join('\n');
}

/**
 * 构建向导的 system prompt（每轮复用同一条，命中 prompt cache）
 * @param {{ language?: 'zh'|'en', tools?: Array, skills?: Array }} opts
 * @returns {string}
 */
export function buildBuilderSystemPrompt({ language = 'zh', tools = [], skills = [] } = {}) {
  const toolText = formatTools(tools, language);
  const skillText = formatSkills(skills, language);

  if (language === 'en') {
    return `You are the "Assistant Creation Advisor". Through a short conversation, turn the user's vague need into a ready-to-use assistant configuration (role prompt + tools + skills).

## Capability catalog (choose ONLY from here)
Tools (id | name | description):
${toolText}
Skills (name | description):
${skillText}

## Conversation rules
1. First restate the goal in one sentence. If it is clearly ambiguous, correct it before asking.
2. Ask at most 2 questions per turn. Each question must offer 2-4 options with a recommended one. Users may answer freely.
3. Only ask what changes the configuration, in this priority:
   A. What task it handles (what goes in, what comes out)
   B. Whether it must act (browse pages, read/write files, query data) or only analyze/write
   C. Hard output requirements (format, length, tone, must include / must avoid)
   D. What it must NOT do (boundaries)
4. Do not ask what you can reasonably infer. At most 3 rounds. Generate as soon as you have enough; do not chase perfection.
5. If the user says "whatever / you decide / just create it", pick sensible defaults and state the assumption in one sentence.
6. Never ask the user about tool or skill names — they do not know these. Choose them yourself.

## Generation requirements
- name: <= 12 Chinese chars or <= 24 chars, specific and recognizable.
- icon: a single emoji.
- description: <= 30 Chinese chars, state who it helps and what it does.
- systemPrompt: second person ("You are..."), must contain four parts:
  1) Role in one sentence
  2) Responsibilities, 3-5 verb-first bullets
  3) Workflow (what first, what next)
  4) Boundaries and output contract (what not to do, format/length/tone)
  150-400 words. No filler, no repetition.
- toolIds: only the minimum needed; use null when unsure (inherit global).
- skillIds: only on an explicit match in the catalog; otherwise null (inherit all).
- Never invent ids or skill names outside the catalog.

## Output protocol
Output exactly ONE JSON object. No markdown fences, no explanation, no extra text.
Use English double quotes for all keys and strings. Escape line breaks inside strings as \\n — never emit a raw newline inside a string.
Ask:
{"action":"ask","message":"one sentence shown to the user","question":{"text":"question","options":["option 1","option 2"],"recommended":0,"allowCustom":true}}
Done:
{"action":"done","message":"one-sentence summary","agent":{"name":"","icon":"","description":"","systemPrompt":"","toolIds":null,"skillIds":null,"allowSubDispatch":false}}

Example systemPrompt:
"You are the Weekly Report Assistant. You turn scattered work notes into a clear weekly report.
Responsibilities:
1. Group completed items by project.
2. Flag risks and follow-ups, and suggest next week's priorities.
3. Always output Markdown.
Workflow: confirm the time range and audience, organize the key points, then write the report.
Boundaries: never invent data; ask when information is missing; keep the default under 800 words."`;
  }

  return `你是「助手创建顾问」。通过简短对话，把用户模糊的需求变成一份可直接使用的助手配置（角色提示词 + 工具 + 技能）。

## 能力目录（只能从这里选择）
可用工具（id｜名称｜说明）：
${toolText}
可用技能（名称｜说明）：
${skillText}

## 对话规则
1. 先用一句话复述你理解的目标；如果明显有歧义，先纠正再提问。
2. 每轮最多问 2 个问题，每个问题给 2-4 个选项并标出推荐项；用户可自定义回答。
3. 只问影响配置的关键信息，按优先级：
   A. 主要处理什么任务（输入是什么、要产出什么）
   B. 是否需要"动手"：浏览网页、读写文件、检索数据、操作页面
   C. 输出的硬性要求：格式、长度、语气、必须包含/必须避免的内容
   D. 明确不要做什么（边界）
4. 能合理推断的不要问；最多 3 轮；信息足够就立即生成，不追求完美。
5. 用户说"随便/你定/直接创建"时，按最合理默认值生成，并在 message 里用一句话说明假设。
6. 不要向用户询问工具名或技能名，普通用户不懂这些，由你根据任务选择。

## 生成要求
- name：不超过 12 个汉字（英文不超过 24 字符），具体、好辨认（例："周报助手"）。
- icon：单个 emoji。
- description：不超过 30 字，说清"帮谁做什么"。
- systemPrompt：用第二人称"你"，必须包含四段：
  1) 角色定位（一句话）
  2) 职责清单（3-5 条，动词开头）
  3) 工作流程（先做什么、再做什么）
  4) 边界与输出规范（不做什么、格式/长度/语气）
  150-400 字，禁止空话和重复。
- toolIds：只选完成任务必需的；不确定就不选（返回 null 表示继承全局）。
- skillIds：仅在技能目录有明确匹配时选；否则 null（继承全部）。
- 严禁编造目录之外的 id 或技能名。

## 输出协议
只输出一个 JSON 对象，不要 Markdown 代码块，不要解释，不要多余文字。
所有键和字符串必须使用英文双引号；字符串内部的换行必须写成 \\n，禁止裸换行。
提问：
{"action":"ask","message":"给用户看的一句话","question":{"text":"问题","options":["选项1","选项2"],"recommended":0,"allowCustom":true}}
完成：
{"action":"done","message":"一句话总结","agent":{"name":"","icon":"","description":"","systemPrompt":"","toolIds":null,"skillIds":null,"allowSubDispatch":false}}

示例 systemPrompt：
"你是周报助手，负责把用户提供的零散工作记录整理成结构清晰的周报。
职责：
1. 归纳本周完成事项，按项目分组。
2. 标注风险与待办，给出下周建议。
3. 统一输出为 Markdown。
流程：先确认时间范围与受众，再整理要点，最后成稿。
边界：不编造未提供的数据；信息不足时先追问；默认控制在 800 字以内。"`;
}

function normalizeReplyText(text) {
  return String(text || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .trim();
}

/**
 * 从 startIndex 的 `{` 开始找配对的右括号（正确跳过字符串内的括号与转义）
 * @returns {string|null} 未闭合时返回从 startIndex 到末尾的文本
 */
function extractBalancedObject(text, startIndex) {
  if (text[startIndex] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = startIndex; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(startIndex, i + 1);
    }
  }
  return text.slice(startIndex);
}

/**
 * 去掉 JSON 之外的注释（模型偶尔会输出 // 或 /* *\/ 注释）
 */
function stripJsonComments(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i += 1;
      if (i < text.length) out += '\n';
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * 转义字符串内部的裸换行/制表符等控制字符。
 * 模型生成多行 systemPrompt 时经常直接写裸换行，导致 JSON.parse 失败。
 */
function escapeRawControlChars(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      const code = ch.codePointAt(0);
      if (code !== undefined && code < 0x20) {
        out += `\\u${code.toString(16).padStart(4, '0')}`;
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

/**
 * 删除对象/数组末尾多余的逗号（字符串内不处理）
 */
function removeTrailingCommas(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ',') {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j])) j += 1;
      if (text[j] === '}' || text[j] === ']') continue;
    }
    out += ch;
  }
  return out;
}

function extractFenceContent(text) {
  const match = text.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return match ? match[1].trim() : '';
}

/**
 * 宽松解析模型输出：容忍代码围栏、前后说明文字、裸换行、注释、尾随逗号
 * @param {string} text
 * @returns {Object}
 */
function parseJsonLoose(text) {
  const sources = [];
  const fenced = extractFenceContent(text);
  if (fenced) sources.push(fenced);
  sources.push(text);

  for (const source of sources) {
    // 先抽取候选，再对候选做控制字符/尾逗号修复：
    // 说明文字里未配对的引号不会污染 JSON 结构
    const base = stripJsonComments(source);
    const candidates = [base.trim()];

    // 逐个尝试文本中的顶层对象，避免说明文字里的花括号干扰
    let searchFrom = 0;
    for (let i = 0; i < 3; i += 1) {
      const start = base.indexOf('{', searchFrom);
      if (start === -1) break;
      const objText = extractBalancedObject(base, start);
      if (!objText) break;
      candidates.push(objText);
      searchFrom = start + objText.length;
    }

    for (const candidate of candidates) {
      if (!candidate) continue;
      const variants = [
        candidate,
        removeTrailingCommas(escapeRawControlChars(candidate)),
      ];
      for (const variant of variants) {
        try {
          let value = JSON.parse(variant);
          // 兼容模型把 JSON 二次编码成字符串的情况
          if (typeof value === 'string') value = JSON.parse(value);
          if (value && typeof value === 'object' && !Array.isArray(value)) return value;
        } catch { /* 尝试下一个候选 */ }
      }
    }
  }

  throw new Error('invalid_json');
}

/**
 * 解析模型回复；失败抛出带 code 的错误，供上层决定是否发起一次修复
 * @param {string} text
 * @returns {{action: 'ask', message: string, question: Object}|{action: 'done', message: string, agent: Object}}
 */
export function parseBuilderReply(text) {
  const raw = normalizeReplyText(text);
  if (!raw) throw new Error('empty_reply');
  if (!raw.includes('{')) throw new Error('no_json_object');

  const obj = parseJsonLoose(raw);

  const action = obj.action;
  const message = truncate(cleanText(obj.message), 500);

  if (action === 'ask') {
    const question = obj.question || {};
    const questionText = cleanText(question.text);
    const options = Array.isArray(question.options)
      ? question.options.map(cleanText).filter(Boolean).slice(0, 4)
      : [];
    if (!questionText || options.length === 0) throw new Error('invalid_question');
    const recommendedRaw = Number.isInteger(question.recommended) ? question.recommended : 0;
    const recommended = Math.min(Math.max(recommendedRaw, 0), options.length - 1);
    return {
      action,
      message,
      question: {
        text: questionText,
        options,
        recommended,
        allowCustom: question.allowCustom !== false,
      },
    };
  }

  if (action === 'done') {
    if (!obj.agent || typeof obj.agent !== 'object') throw new Error('invalid_agent');
    return { action, message, agent: obj.agent };
  }

  throw new Error('invalid_action');
}

/**
 * 按目录白名单校验并补全模型生成的配置
 * @param {Object} rawAgent
 * @param {{ tools?: Array, skills?: Array, language?: 'zh'|'en' }} opts
 * @returns {{ draft: Object, warnings: Array<{code: string, count?: number, names?: string[]}> }}
 */
export function normalizeAgentDraft(rawAgent = {}, { tools = [], skills = [], language = 'zh' } = {}) {
  const warnings = [];

  let name = truncate(cleanText(rawAgent.name), MAX_NAME);
  if (!name) name = language === 'en' ? 'New Assistant' : '未命名助手';

  let icon = cleanText(rawAgent.icon);
  if (!icon || Array.from(icon).length > 6) {
    icon = '🤖';
    warnings.push({ code: 'iconFallback' });
  }

  const description = truncate(cleanText(rawAgent.description), MAX_DESC);
  const systemPrompt = truncate(cleanText(rawAgent.systemPrompt), MAX_PROMPT);
  if (Array.from(systemPrompt).length < 60) {
    warnings.push({ code: 'promptShort' });
  }

  const toolIdSet = new Set(tools.map(t => t.id));
  let toolIds = null;
  if (Array.isArray(rawAgent.toolIds) && rawAgent.toolIds.length > 0) {
    const requested = [...new Set(rawAgent.toolIds.filter(id => typeof id === 'string' && id))];
    const kept = requested.filter(id => toolIdSet.has(id));
    const dropped = requested.filter(id => !toolIdSet.has(id));
    if (dropped.length) {
      warnings.push({
        code: kept.length > 0 ? 'toolsDropped' : 'toolsAllDropped',
        count: dropped.length,
        names: dropped.slice(0, 5),
      });
    }
    toolIds = kept.length > 0 ? kept : null;
  }

  const skillNameSet = new Set(skills.map(s => s.name));
  let skillIds = null;
  if (Array.isArray(rawAgent.skillIds) && rawAgent.skillIds.length > 0) {
    const requested = [...new Set(rawAgent.skillIds.filter(n => typeof n === 'string' && n))];
    const kept = requested.filter(n => skillNameSet.has(n));
    const dropped = requested.filter(n => !skillNameSet.has(n));
    if (dropped.length) {
      warnings.push({
        code: kept.length > 0 ? 'skillsDropped' : 'skillsAllDropped',
        count: dropped.length,
        names: dropped.slice(0, 5),
      });
    }
    skillIds = kept.length > 0 ? kept : null;
  }

  return {
    draft: {
      name,
      icon,
      description,
      systemPrompt,
      toolIds,
      skillIds,
      allowSubDispatch: rawAgent.allowSubDispatch === true,
      // 模型不参与模型参数决策，统一继承全局
      model: null,
      temperature: null,
      topP: null,
    },
    warnings,
  };
}
