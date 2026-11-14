// usage-tips.js - 输入框上方「使用技巧」轮播条
//
// 文案为预置内容（非 AI 生成），分两类场景：
//   - plugin：浏览器插件自身具备的能力，任何情况下都展示；
//   - agent：依赖代理端的能力，仅在代理端已连接时加入轮播（断开自动过滤）。
//
// 交互：
//   - 默认每 8s 轮换一条，单行截断；
//   - 提示条挂在对话滚动区末尾，随内容滚动：只有滚到底部时才出现，不改变对话区高度；
//   - 鼠标悬停暂停轮播并展开完整文案，右侧出现「不再展示」按钮；
//   - 点「不再展示」写入 usageTipsEnabled=false 并隐藏，配置页「基础」可重新打开。
import { t, registerTranslations, getLanguage, subscribe } from '../shared/i18n.js';
import { showToast } from './utils.js';
import state from './state.js';

const STORAGE_KEY = 'usageTipsEnabled';
const ROTATE_MS = 8000;

registerTranslations('zh', {
  usageTips: {
    dismiss: '不再显示',
    dismissedHint: '已关闭使用技巧提示。想重新看到：设置 → 基础 → 打开「使用技巧提示」',
  },
});

registerTranslations('en', {
  usageTips: {
    dismiss: "Don't show again",
    dismissedHint: 'Tips hidden. To bring them back: Settings → Basic → enable "Usage tips".',
  },
});

/**
 * 预置技巧文案。
 * @typedef {{ id: string, scene: 'plugin'|'agent', zh: string, en: string }} Tip
 * @type {Tip[]}
 */
const TIPS = [
  // ============ 插件端（始终可用） ============
  {
    id: 'slash',
    scene: 'plugin',
    zh: '输入「/」唤起快捷提示，用方向键选择提示词、技能或 MCP，回车直接套用。',
    en: 'Type "/" to open quick prompts, pick a prompt, skill, or MCP with arrow keys and press Enter.',
  },
  {
    id: 'at-page',
    scene: 'plugin',
    zh: '输入「@」可引用当前网页，让 AI 直接基于页面内容回答。',
    en: 'Type "@" to reference the current page so the AI answers from that content.',
  },
  {
    id: 'at-agent',
    scene: 'plugin',
    zh: '「@助手」可以切换不同角色，为不同任务准备不同的身份、提示词与工具。',
    en: '"@Assistant" switches roles, giving each task its own persona, prompt, and tool set.',
  },
  {
    id: 'history',
    scene: 'plugin',
    zh: '在输入框按「↑ / ↓」翻看历史输入，按 Esc 一键清空当前内容。',
    en: 'Press ↑ / ↓ in the input box to browse input history, and Esc to clear the current content.',
  },
  {
    id: 'goal',
    scene: 'plugin',
    zh: '把目标写成「帮我完成…」，目标模式会自动拆解步骤并持续推进直到达成。',
    en: 'Write the goal as "Help me finish…" and Goal mode will break it into steps and keep pushing until done.',
  },
  {
    id: 'queue',
    scene: 'plugin',
    zh: '任务执行中仍可继续输入，消息会进入队列，不会打断当前任务。',
    en: 'You can keep typing while a task runs; new messages queue up without interrupting the current task.',
  },
  {
    id: 'queue-carry',
    scene: 'plugin',
    zh: '排队时点消息旁的「⚡」，可把队首消息顺带进当前任务，减少来回切换。',
    en: 'Click "⚡" beside a queued message to fold it into the running task and avoid context switching.',
  },
  {
    id: 'prompt-clarify',
    scene: 'plugin',
    zh: '提问时补上背景、目标与限制条件，比只给一句话得到的结果稳定得多。',
    en: 'Include background, goal, and constraints in your request; results are far more reliable than one-liners.',
  },
  {
    id: 'prompt-plan',
    scene: 'plugin',
    zh: '复杂任务先让 AI 列计划：「先给方案，我确认后再动手」，能少走很多弯路。',
    en: 'For complex work, ask for a plan first: "Propose a plan, then act after I confirm."',
  },
  {
    id: 'prompt-split',
    scene: 'plugin',
    zh: '一次只让 AI 做一件事，把大任务拆成小步，成功率更高也更好检查。',
    en: 'Give the AI one job at a time; splitting big tasks into steps improves success and reviewability.',
  },
  {
    id: 'selection',
    scene: 'plugin',
    zh: '在网页上划词后点浮动按钮，可以针对选中的内容单独提问。',
    en: 'Select text on a page and click the floating button to ask about just that selection.',
  },
  {
    id: 'voice',
    scene: 'plugin',
    zh: '点麦克风用语音输入，说完自动转成文字，长问题不必手打。',
    en: 'Use the mic for voice input: speech is transcribed automatically, so long questions need no typing.',
  },
  {
    id: 'image',
    scene: 'plugin',
    zh: '图片可以直接粘贴或拖进输入框，AI 会看图后再回答。',
    en: 'Paste or drag images into the input box; the AI will look at them before answering.',
  },
  {
    id: 'file',
    scene: 'plugin',
    zh: '支持上传 PDF、Word、Excel 等文件，AI 会先提取内容再作答。',
    en: 'Upload PDF, Word, or Excel files; the AI extracts their content first, then answers.',
  },
  {
    id: 'knowledge',
    scene: 'plugin',
    zh: '用「@知识库」引用私有资料，回答会更贴合你的业务与术语。',
    en: 'Reference private material with "@Knowledge base" to make answers fit your business and terminology.',
  },
  {
    id: 'compaction',
    scene: 'plugin',
    zh: '长对话可在基础配置开启自动压缩，上下文接近上限时自动摘要，省 token。',
    en: 'Enable auto-compaction in Basic settings: near the context limit, long chats are summarized to save tokens.',
  },
  {
    id: 'session',
    scene: 'plugin',
    zh: '重要对话可收藏、搜索和导出；也可直接说「搜一下我们以前聊过的 xxx」。',
    en: 'Bookmark, search, and export important chats; you can also say "Search our past chats for xxx".',
  },
  {
    id: 'todo',
    scene: 'plugin',
    zh: '说「帮我加个待办：周五前交方案」，AI 会直接写入待办面板，也能查询、改优先级或标记完成。',
    en: 'Say "Add a todo: send the proposal by Friday" and the AI writes it into the To-do panel; it can also list, reprioritize, or complete items.',
  },
  {
    id: 'todo-remind',
    scene: 'plugin',
    zh: '「待办」本身不会提醒；说「到时间提醒我看这条待办」，AI 会顺手补建一个定时任务。',
    en: 'Todos do not remind you by themselves; say "Remind me about this todo at that time" and the AI adds a scheduled task.',
  },
  {
    id: 'schedule',
    scene: 'plugin',
    zh: '定时任务可直接用对话管理：说「每周一 9 点整理上周数据」，AI 会创建并按点执行，结果写回会话。',
    en: 'Manage scheduled tasks by chat: say "Every Monday 9am summarize last week" and the AI creates it, runs on time, and posts the result here.',
  },
  {
    id: 'schedule-manage',
    scene: 'plugin',
    zh: '说「列出 / 暂停 / 立即执行我的定时任务」，AI 会直接查询并处理，删除前仍会先确认。',
    en: 'Say "List / pause / run my scheduled tasks now" and the AI queries and handles them, asking before any deletion.',
  },
  {
    id: 'tabs',
    scene: 'plugin',
    zh: '说「打开这三个链接，把重复的标签页关掉」，AI 能打开、切换、关闭和刷新标签页。',
    en: 'Say "Open these three links and close duplicate tabs" and the AI can open, switch, close, and refresh tabs.',
  },
  {
    id: 'bookmarks',
    scene: 'plugin',
    zh: '说「找一下我收藏过的 xx」，AI 会检索浏览器书签与历史记录，直接给出链接。',
    en: 'Say "Find the xx I bookmarked" and the AI searches bookmarks and history, returning the links.',
  },
  {
    id: 'extract-data',
    scene: 'plugin',
    zh: '说「把这页的表格整理成 CSV」，AI 会抽取页面上的结构化数据，方便继续加工。',
    en: 'Say "Turn this page\'s table into CSV" and the AI extracts structured page data for further use.',
  },
  {
    id: 'download',
    scene: 'plugin',
    zh: '说「把这些图片批量下载下来」，AI 会把文件直接保存到本机。',
    en: 'Say "Download these images" and the AI saves the files to your computer.',
  },
  {
    id: 'memory',
    scene: 'plugin',
    zh: '说「帮我记一下…」即存入记忆，需要时问「你还记得…吗」，跨会话都有效。',
    en: 'Say "Remember this…" to save it; ask "Do you remember…?" later — memory persists across sessions.',
  },
  {
    id: 'custom-prompt',
    scene: 'plugin',
    zh: '把常用指令存成自定义提示词，下次用「/」一键调用。',
    en: 'Save frequent instructions as custom prompts and recall them with "/" next time.',
  },
  {
    id: 'kb-ingest',
    scene: 'plugin',
    zh: '说「把这份资料存到知识库」，AI 会自动切分并入库，之后可直接检索。',
    en: 'Say "Save this into the knowledge base" and the AI chunks and ingests it for later retrieval.',
  },
  {
    id: 'clipboard',
    scene: 'plugin',
    zh: '说「把结果复制到剪贴板」，AI 会直接写入，省去手动选中复制。',
    en: 'Say "Copy the result to my clipboard" and the AI writes it for you.',
  },
  {
    id: 'page-highlight',
    scene: 'plugin',
    zh: '说「在页面上高亮 xxx」，AI 会把关键内容标出来，方便讲解或核对。',
    en: 'Say "Highlight xxx on the page" to mark key content for explanation or review.',
  },
  {
    id: 'capture',
    scene: 'plugin',
    zh: '说「截图并分析这个页面」，AI 会截图后交给视觉模型解读图表或界面。',
    en: 'Say "Screenshot and analyze this page" to have the vision model read charts or UI.',
  },
  {
    id: 'preview-ui',
    scene: 'plugin',
    zh: '说「做个界面原型给我看看」，AI 会在侧边栏直接渲染可预览的 HTML。',
    en: 'Say "Show me a UI prototype" and the AI renders previewable HTML in the side panel.',
  },
  {
    id: 'form-fill',
    scene: 'plugin',
    zh: '说「帮我填一下这个表单」，AI 能一次批量填入多个字段。',
    en: 'Say "Fill out this form" and the AI can fill multiple fields in one go.',
  },
  {
    id: 'browser-act',
    scene: 'plugin',
    zh: '说「打开这个链接并帮我点…」，AI 能自动开标签页、点击、输入和翻页。',
    en: 'Say "Open this link and click …" and the AI can open tabs, click, type, and scroll.',
  },
  {
    id: 'clarify',
    scene: 'plugin',
    zh: '加上「拿不准就先问我」，AI 会先给出选项确认，避免理解跑偏。',
    en: 'Add "Ask me first if unsure" and the AI confirms with options before proceeding.',
  },
  {
    id: 'dispatch',
    scene: 'plugin',
    zh: '说「这几件事并行处理」，AI 会拆给子代理并发执行，大任务更快。',
    en: 'Say "Handle these in parallel" and the AI dispatches sub-agents concurrently.',
  },
  {
    id: 'qrcode',
    scene: 'plugin',
    zh: '说「把这个链接生成二维码」，AI 会自动生成并展示出来。',
    en: 'Say "Turn this link into a QR code" and the AI generates and shows it.',
  },
  {
    id: 'notify',
    scene: 'plugin',
    zh: '说「做完后提醒我」，AI 会用桌面通知告知结果，不必一直盯着。',
    en: 'Say "Notify me when done" and the AI sends a desktop notification.',
  },
  {
    id: 'fetch',
    scene: 'plugin',
    zh: '说「帮我抓取这个接口的数据」，AI 可发起 HTTP 请求并整理返回结果。',
    en: 'Say "Fetch the data from this API" and the AI can send an HTTP request and organize the result.',
  },
  {
    id: 'agent-hint',
    scene: 'plugin',
    zh: '连接代理端后，可解锁本机文件读写、命令执行等能力（设置 → 代理页配对）。',
    en: 'Connecting the agent unlocks local file access and command execution (Settings → Agent to pair).',
  },

  // ============ 代理端（仅在代理已连接时展示） ============
  {
    id: 'agent-file',
    scene: 'agent',
    zh: '已连接代理端：AI 可以读写你电脑上的文件，直接说「帮我改这个文件」即可。',
    en: 'Agent connected: the AI can read and write files on your computer — just say "update this file".',
  },
  {
    id: 'agent-exec',
    scene: 'agent',
    zh: '已连接代理端：AI 可以执行本机命令、运行脚本，适合构建、测试与批处理。',
    en: 'Agent connected: the AI can run local commands and scripts for builds, tests, and batch jobs.',
  },
  {
    id: 'agent-search',
    scene: 'agent',
    zh: '让 AI「在项目里搜索 xxx」，它会用本机搜索定位代码，比网页检索更准。',
    en: 'Ask the AI to "search the project for xxx"; local search finds code more accurately than the web.',
  },
  {
    id: 'agent-workdir',
    scene: 'agent',
    zh: '在工作目录面板切换目录，AI 的文件操作都会被限制在这个范围内。',
    en: 'Switch directories in the workspace panel; the AI confinement keeps file operations inside that scope.',
  },
  {
    id: 'agent-confirm',
    scene: 'agent',
    zh: '敏感操作会先弹确认，可在基础配置里调整确认策略，兼顾安全与效率。',
    en: 'Sensitive actions ask for confirmation first; adjust the policy in Basic settings to balance safety and speed.',
  },
  {
    id: 'agent-log',
    scene: 'agent',
    zh: '命令执行日志可在日志面板查看；也可说「调出执行日志复盘」，让 AI 提取成功路径与失败教训。',
    en: 'Review commands in the log panel, or say "Review the execution log" to extract successful paths and lessons.',
  },
  {
    id: 'agent-stream',
    scene: 'agent',
    zh: '长命令支持流式输出，执行过程实时可见，不用盯着空白等待。',
    en: 'Long commands stream their output, so progress is visible in real time instead of a blank wait.',
  },
  {
    id: 'agent-multi',
    scene: 'agent',
    zh: '配对了多台电脑时，用「@代理」指定目标，也可以说「切换到另一台电脑的代理」。',
    en: 'With multiple computers, use "@Agent" to pick one, or just say "Switch to the agent on another computer".',
  },
  {
    id: 'agent-offline',
    scene: 'agent',
    zh: '代理端离线时，文件与命令类能力会自动隐藏，避免误发无法执行的任务。',
    en: 'When the agent is offline, file and command abilities are hidden so tasks are not sent in vain.',
  },
  {
    id: 'agent-update',
    scene: 'agent',
    zh: '代理端可在设置 → 代理页一键更新或重启，版本不一致时优先升级。',
    en: 'Update or restart the agent from Settings → Agent; upgrade first when versions differ.',
  },
  {
    id: 'agent-skill',
    scene: 'agent',
    zh: '说「跑一下这个工作流技能」，代理端会执行对应的 Skill。',
    en: 'Say "Run this workflow skill" and the agent executes the matching Skill.',
  },
  {
    id: 'agent-skill-create',
    scene: 'agent',
    zh: '说「把刚才的流程沉淀成技能」，AI 会写成 SKILL.md，下次一句话即可复用。',
    en: 'Say "Turn that process into a skill" and the AI writes a SKILL.md for one-line reuse next time.',
  },
  {
    id: 'agent-trash',
    scene: 'agent',
    zh: '说「从回收站恢复刚删的文件」，代理端可以直接恢复。',
    en: 'Say "Restore the file I just deleted" and the agent can recover it from its trash.',
  },
  {
    id: 'agent-download',
    scene: 'agent',
    zh: '说「把这个文件下载到浏览器」，代理端文件会直接下载到本机。',
    en: 'Say "Download this file to the browser" and the agent transfers it locally.',
  },
];

let barEl = null;
let textEl = null;
let tooltipEl = null;
let dismissEl = null;
let timer = null;
let hovering = false;
let currentId = null;
let enabled = true;

// 提示条作为对话滚动区的最后一个内容块：无需显隐切换，天然只滚到底时可见
let chatEl = null;

function isAgentConnected() {
  return state.agentPlatform?.connected === true;
}

/** 按当前语言与代理连接状态过滤出可展示的文案 */
function activeTips() {
  const lang = getLanguage();
  return TIPS.filter((tip) => tip.scene !== 'agent' || isAgentConnected()).map((tip) => ({
    id: tip.id,
    text: lang === 'en' ? tip.en : tip.zh,
  }));
}

function currentIndex(list) {
  const idx = list.findIndex((tip) => tip.id === currentId);
  return idx >= 0 ? idx : 0;
}

/** 判断当前文案是否被省略号截断，只有截断时悬停才需要弹出完整内容 */
function updateTruncation() {
  if (!barEl || !textEl) return;
  // +1 容忍亚像素误差，避免刚好放得下时误判为截断
  const truncated = textEl.scrollWidth > textEl.clientWidth + 1;
  barEl.classList.toggle('is-truncated', truncated);
}

function render(list, index) {
  if (!textEl || !list.length) return;
  const tip = list[index % list.length];
  currentId = tip.id;
  textEl.textContent = tip.text;
  // 悬停浮层展示完整文案（不截断、不撑高输入区）
  if (tooltipEl) tooltipEl.textContent = tip.text;
  // 文案能否完整显示决定是否出现 Tooltip
  updateTruncation();
  // 重放淡入动画：先移除 class，强制重排后再加回
  textEl.classList.remove('fade-in');
  void textEl.offsetWidth;
  textEl.classList.add('fade-in');
}

/** 展示下一条（保持当前 id 之后的位置，避免每次重建都回到第一条） */
function next() {
  if (!enabled || !barEl || barEl.style.display === 'none') return;
  const list = activeTips();
  if (!list.length) return;
  const idx = currentIndex(list);
  render(list, idx + 1);
}

function stopTimer() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function startTimer() {
  stopTimer();
  if (!enabled || hovering) return;
  timer = setInterval(next, ROTATE_MS);
}

/**
 * 重建文案集合。代理连接状态切换或语言切换时调用：
 * 当前文案若已不属于新集合（例如代理断开导致 agent 文案被过滤），立即切到下一条。
 */
function refreshActiveTips() {
  if (!enabled || !barEl) return;
  const list = activeTips();
  if (!list.length) {
    hide();
    return;
  }
  if (!list.some((tip) => tip.id === currentId)) {
    currentId = null;
    render(list, 0);
  } else {
    // 语言切换：用同一 id 重新取当前语言文案
    render(list, currentIndex(list));
  }
}

function show() {
  if (!barEl) return;
  enabled = true;
  barEl.style.display = '';
  const list = activeTips();
  if (!list.length) {
    hide();
    return;
  }
  render(list, currentIndex(list));
  startTimer();
}

function hide() {
  if (!barEl) return;
  barEl.style.display = 'none';
  stopTimer();
}

function bindEvents() {
  barEl.addEventListener('mouseenter', () => {
    hovering = true;
    stopTimer();
  });
  barEl.addEventListener('mouseleave', () => {
    hovering = false;
    startTimer();
  });

  dismissEl.addEventListener('click', (e) => {
    e.stopPropagation();
    disableTips();
    showToast(t('usageTips.dismissedHint'), 'info', 5000);
  });

  // 配置页开关 / 其他面板实例修改时即时同步
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    if (changes[STORAGE_KEY].newValue === false) {
      enabled = false;
      hide();
    } else {
      show();
    }
  });

  // 代理连接状态变化：重新过滤 agent 类文案
  document.addEventListener('agent-connection-changed', refreshActiveTips);
  // 语言切换：替换为对应语言文案
  subscribe(refreshActiveTips);

  // 侧边栏宽度变化时重新判断当前文案是否被截断
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateTruncation).observe(barEl);
  }
}

function disableTips() {
  enabled = false;
  hide();
  try {
    chrome.storage.local.set({ [STORAGE_KEY]: false });
  } catch {
    /* storage 不可用（异常兜底）：仅本次隐藏 */
  }
}

/**
 * 初始化使用技巧轮播条（side_panel/index.js 在 DOMContentLoaded 时调用）。
 * 开关默认开启；存储值明确为 false 时保持隐藏，等待配置页重新打开。
 */
export function initUsageTips() {
  barEl = document.getElementById('usageTipsBar');
  textEl = document.getElementById('usageTipsText');
  tooltipEl = document.getElementById('usageTipsTooltip');
  dismissEl = document.getElementById('usageTipsDismiss');
  if (!barEl || !textEl || !tooltipEl || !dismissEl) return;

  bindEvents();

  chatEl = document.getElementById('chatContainer');
  if (chatEl) {
    // 放进滚动区末尾：跟随内容一起滚走，滚到底时自然出现在底部；内容不足一屏时由 margin-top:auto 顶到底部
    chatEl.appendChild(barEl);
    if (typeof MutationObserver !== 'undefined') {
      // 新消息会追加在提示条之后；会话切换/清空会重建 innerHTML，两种情况都要把它放回末尾
      new MutationObserver(() => {
        // 会话 DOM 缓存还原会顺带带进一份静态副本（缓存快照时提示条就在容器里，
        // innerHTML 一恢复就多出一条，且每轮切换越积越多），只保留受控的这条
        chatEl.querySelectorAll('.usage-tips-bar').forEach((el) => {
          if (el !== barEl) el.remove();
        });
        if (barEl.parentNode !== chatEl || barEl.nextElementSibling) chatEl.appendChild(barEl);
      }).observe(chatEl, { childList: true });
    }
  }

  try {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      enabled = result?.[STORAGE_KEY] !== false;
      if (enabled) show();
      else hide();
    });
  } catch {
    show();
  }
}
