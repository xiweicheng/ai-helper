// Goal 模式在「面板 + 设置页」两侧的接线守卫（源码文本断言）。
//
// 这一层几乎全是跨文件契约，改一处忘改另一处不会报错，只会静默失效：
//   ⓪ 面板模块必须真的被入口 init——否则整个 goal-panel.js 是能被 import 的死代码；
//   ① 意图识别（shared/goal-intent.js）必须真的被发送链路消费，否则「按目标模式执行」
//      这句话识别不出来，模块沦为孤儿代码；
//   ② goalConfig 的每个字段都要有对应控件、并被 saveConfig 写回，否则设置项形同虚设；
//   ③ goalConfig 必须登记进导入导出白名单（项目已知漏改点：新增 storage key 不登记 = 备份丢配置）；
//   ④ autoApprove 只能由开关入口授予，意图识别入口必须恒 false；
//   ⑤ 会话被删必须通知后台清掉 goal 镜像，否则 storage 里留下再也查不到的孤儿条目。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PANEL = readFileSync(join(process.cwd(), 'src/side_panel/goal-panel.js'), 'utf8');
const INDEX = readFileSync(join(process.cwd(), 'src/side_panel/index.js'), 'utf8');
const CHAT = readFileSync(join(process.cwd(), 'src/side_panel/chat-manager.js'), 'utf8');
const OPTIONS_HTML = readFileSync(join(process.cwd(), 'options.html'), 'utf8');
const CONFIG_MANAGER = readFileSync(join(process.cwd(), 'src/options/config-manager.js'), 'utf8');
const CONFIG_IO = readFileSync(join(process.cwd(), 'src/options/config-io.js'), 'utf8');
const CONSTANTS = readFileSync(join(process.cwd(), 'src/background/constants.js'), 'utf8');
const ZH = readFileSync(join(process.cwd(), 'src/shared/locales/zh.js'), 'utf8');
const EN = readFileSync(join(process.cwd(), 'src/shared/locales/en.js'), 'utf8');
const BG_INDEX = readFileSync(join(process.cwd(), 'src/background/index.js'), 'utf8');
const SESSION_MGR = readFileSync(join(process.cwd(), 'src/side_panel/session-manager.js'), 'utf8');

describe('⓪ 面板模块必须真的被入口调用', () => {
  // goal-panel.js 的所有 UI 行为（chip 绑定、目标条、GOAL_UPDATE 监听、storage.onChanged）
  // 都藏在 initGoalPanel() 里。忘了接线时模块依旧能被 import、单测依旧全绿，
  // 但 🎯 点下去什么也不会发生——所以这条断言比函数内部的逻辑更优先。
  test('index.js 导入并在 DOMContentLoaded 注册 initGoalPanel', () => {
    expect(INDEX).toMatch(/import \{ initGoalPanel \} from '\.\/goal-panel\.js';/);
    expect(INDEX).toMatch(/document\.addEventListener\('DOMContentLoaded', initGoalPanel\);/);
  });

  test('goal-panel 自听会话生命周期事件（否则切会话后目标条陈旧）', () => {
    expect(PANEL).toMatch(/document\.addEventListener\('session-switched', \(\) => \{ refreshGoalPanel\(\); \}\)/);
    expect(PANEL).toMatch(/document\.addEventListener\('session-hydrated', \(\) => \{ refreshGoalPanel\(\); \}\)/);
  });

  test('chip 勾选态随会话重绘（goalMode 是会话级而不是全局）', () => {
    const body = PANEL.slice(PANEL.indexOf('export function renderGoalBar'), PANEL.indexOf('function currentSessionId'));
    expect(body).toMatch(/els\.toggle\.checked = enabled;/);
  });
});

describe('① 意图识别接线（否则 goal-intent.js 是孤儿模块）', () => {
  test('goal-panel 导入确定性意图识别原语', () => {
    expect(PANEL).toMatch(/import \{ detectGoalIntent, stripGoalIntentPhrases \} from '\.\.\/shared\/goal-intent\.js'/);
  });

  test('开关未亮时走意图识别，未命中则本轮不带目标', () => {
    expect(PANEL).toMatch(/if \(cfg\.intentDetection === false\) return null;/);
    expect(PANEL).toMatch(/const intent = detectGoalIntent\(text\);/);
    // 弱命中只弹提示、绝不替你开目标：detected 为 false 就必须 return null
    const branch = PANEL.slice(PANEL.indexOf('const intent = detectGoalIntent(text);'), PANEL.indexOf('objective = String(stripGoalIntentPhrases'));
    expect(branch).toMatch(/if \(!intent\.detected\) \{[\s\S]*intent\.strength === 'weak'[\s\S]*return null;\s*\}/);
  });

  test('objective 用剥离意图短语后的文本（否则元指令污染目标描述）', () => {
    expect(PANEL).toMatch(/objective = String\(stripGoalIntentPhrases\(text\) \|\| ''\)\.trim\(\) \|\| text;/);
  });

  test('发送链路不再用 state.goalMode 门控 prepareGoalForSend', () => {
    // 这条断言锁的是「调用点」而不是函数内部：调用点带 && state.goalMode 时，
    // 函数里的意图识别分支永远进不去，测试全绿但功能没接上
    // try 与调用之间允许注释（附件清单那段说明），但门控条件必须仍然是裸的 isActive
    expect(CHAT).toMatch(/if \(isActive\) \{\s*try \{[\s\S]{0,600}?const goal = await prepareGoalForSend\(/);
    expect(CHAT).not.toMatch(/isActive && state\.goalMode[\s\S]{0,80}prepareGoalForSend/);
  });

  test('意图识别命中后给出可撤销提示，且中英成对', () => {
    expect(PANEL).toMatch(/if \(!byToggle\) showToast\(t\('goal\.intentDetected'\)/);
    expect(ZH).toMatch(/intentDetected: '/);
    expect(EN).toMatch(/intentDetected: '/);
  });
});

describe('② 放行授权只认开关入口', () => {
  test('createdBy 按入口区分，autoApprove 只跟随开关', () => {
    expect(PANEL).toMatch(/createdBy: byToggle \? 'toggle' : 'intent',/);
    expect(PANEL).toMatch(/autoApprove: byToggle,/);
    // 意图识别入口绝不能顺手把授权带进去
    const call = PANEL.slice(PANEL.indexOf('const resp = await sendGoalCommand({'), PANEL.indexOf('if (!resp || resp.success === false)'));
    expect(call).not.toMatch(/autoApprove: true/);
  });

  test('设置页关闭目标模式时给出原因而不是静默不发', () => {
    expect(PANEL).toMatch(/if \(cfg\.enabled === false\) \{/);
    expect(PANEL).toMatch(/showToast\(t\('goal\.disabledHint'\), 'warning'\);/);
  });

  test('goalConfig 缓存必须随 storage.onChanged 失效', () => {
    // 面板是长活页面：不监听的话用户在设置页关掉目标模式，🎯 还亮着、还照旧发 SET_GOAL
    expect(PANEL).toMatch(/chrome\.storage\.onChanged\.addListener/);
    expect(PANEL).toMatch(/if \(area !== 'local' \|\| !\('goalConfig' in changes\)\) return;/);
    const block = PANEL.slice(PANEL.indexOf("chrome.storage.onChanged.addListener"));
    expect(block).toMatch(/goalCfgCache = null;/);
    expect(block).toMatch(/syncChipVisibility\(\);/);
  });
});

describe('③ 设置页 goalConfig 契约', () => {
  // 只开放两个行为开关。预算与阈值固定取 DEFAULT_GOAL_CONFIG ——
  // 用户无法预判「20 轮 vs 50 轮」的后果，调大只是多烧评估调用、调小是误停，
  // 而撞线后的「继续」已经提供了运行时调节窗口（每次再给 20 轮）。
  const UI_FIELDS = ['enabled', 'intentDetection'];
  // 已收回的旋钮：字段必须还在（引擎/面板会消费），但设置页不得再出现控件
  const HIDDEN_FIELDS = ['turnBudget', 'timeBudgetMs', 'stagnationLimit', 'evaluatorFailureLimit', 'objectiveEvidence'];
  const ALL_FIELDS = [...UI_FIELDS, ...HIDDEN_FIELDS];
  const HIDDEN_IDS = ['goalTurnBudget', 'goalTimeBudgetMin', 'goalStagnationLimit',
    'goalEvaluatorFailureLimit', 'goalObjectiveEvidence'];

  test('DEFAULT_GOAL_CONFIG 仍覆盖全部字段（隐藏不等于删除）', () => {
    const block = CONSTANTS.slice(
      CONSTANTS.indexOf('export const DEFAULT_GOAL_CONFIG = {'),
      CONSTANTS.indexOf('// 流式输出配置默认值'),
    );
    for (const f of ALL_FIELDS) {
      expect(block, `DEFAULT_GOAL_CONFIG 缺少 ${f}`).toContain(`${f}:`);
    }
  });

  test('只有两个行为开关有控件，且 id 与 config-manager 读写一致', () => {
    const ids = { enabled: 'goalEnabled', intentDetection: 'goalIntentDetection' };
    for (const f of UI_FIELDS) {
      const id = ids[f];
      expect(OPTIONS_HTML, `options.html 缺少 #${id}`).toContain(`id="${id}"`);
      expect(CONFIG_MANAGER, `config-manager 未读写 #${id}`).toContain(`getElementById('${id}')`);
    }
  });

  test('已收回的预算/阈值控件必须从设置页与读写代码里彻底消失', () => {
    for (const id of HIDDEN_IDS) {
      expect(OPTIONS_HTML, `options.html 不应再有 #${id}`).not.toContain(`id="${id}"`);
      expect(CONFIG_MANAGER, `config-manager 不应再读写 #${id}`).not.toContain(`getElementById('${id}')`);
    }
  });

  test('storage.get 读取 goalConfig，saveConfig 写回整份（只覆写两个开关）', () => {
    expect(CONFIG_MANAGER).toMatch(/'goalConfig',/);
    expect(CONFIG_MANAGER).toMatch(/const goalCfg = Object\.assign\(\{\}, DEFAULT_GOAL_CONFIG, result\.goalConfig \|\| \{\}\);/);
    expect(CONFIG_MANAGER).toMatch(/const goalConfig = \{\s*\.\.\.DEFAULT_GOAL_CONFIG,\s*enabled:/);
    expect(CONFIG_MANAGER).toMatch(/goalConfig: goalConfig,/);
    // 落库不再从 DOM 取任何数字：预算一旦从界面消失就不能被空值/NaN 覆写
    const block = CONFIG_MANAGER.slice(
      CONFIG_MANAGER.indexOf('const goalConfig = {'),
      CONFIG_MANAGER.indexOf('goalConfig: goalConfig,'),
    );
    expect(block).not.toMatch(/parseInt\(document\.getElementById/);
    expect(block).not.toMatch(/turnBudget|timeBudgetMs|stagnationLimit|evaluatorFailureLimit|objectiveEvidence/);
  });

  test('收回的预算/阈值固定为可消费的确定性默认值', () => {
    // 不再有输入框，也就没有 parseInt 得到 NaN 的风险；但默认值本身必须锁死且有限
    // —— turnBudget 传 undefined 会在状态机里把预算弄成 NaN，闸门永不撞线。
    const block = CONSTANTS.slice(
      CONSTANTS.indexOf('export const DEFAULT_GOAL_CONFIG = {'),
      CONSTANTS.indexOf('// 流式输出配置默认值'),
    );
    expect(block).toMatch(/^\s*turnBudget:\s*20,/m);
    expect(block).toMatch(/^\s*timeBudgetMs:\s*0,/m);
    expect(block).toMatch(/^\s*stagnationLimit:\s*3,/m);
    expect(block).toMatch(/^\s*evaluatorFailureLimit:\s*2,/m);
    expect(block).toMatch(/^\s*objectiveEvidence:\s*true,/m);
    // 设置页不再有范围校验块：没有输入就没有非法输入
    expect(CONFIG_MANAGER).not.toMatch(/const goalRange = \[/);
  });

  test('总开关只收起子项、不重置子项的值', () => {
    expect(CONFIG_MANAGER).toMatch(/document\.querySelectorAll\('\.goal-sub'\)\.forEach\(\(el\) => \{ el\.style\.display = show \? 'block' : 'none'; \}\)/);
    expect(OPTIONS_HTML).toMatch(/class="react-config-item goal-sub"/);
  });

  test('goalConfig 登记进导入导出白名单', () => {
    expect(CONFIG_IO).toMatch(/'goalConfig',/);
  });

  test('设置页文案中英成对（只留两个开关的说明）', () => {
    const keys = ['goalMode', 'goalModeDesc1', 'goalModeDesc2', 'goalModeDesc3', 'goalIntent'];
    for (const k of keys) {
      expect(ZH, `zh 缺少 react.${k}`).toMatch(new RegExp(`\\n    ${k}: '`));
      expect(EN, `en 缺少 react.${k}`).toMatch(new RegExp(`\\n    ${k}: '`));
    }
    // 已收回旋钮的文案应一并清掉：留着就是“删了 UI 忘了删文案”的信号
    for (const k of ['goalTurnBudget', 'goalTimeBudget', 'goalStagnation', 'goalEvaluatorFail', 'goalObjectiveEvidence']) {
      expect(ZH, `zh 不应再残留 react.${k}`).not.toMatch(new RegExp(`\\n    ${k}: '`));
      expect(EN, `en 不应再残留 react.${k}`).not.toMatch(new RegExp(`\\n    ${k}: '`));
    }
  });

  test('设置页文案不残留 Markdown 标记与中英混排', () => {
    // i18n 值最终是 HTML 文本节点内容，** 会被原样显示；
    // 英文串里混进中文则是复制粘贴漏改的信号
    const goalLines = EN.split('\n').filter((l) => /^\s+goal[A-Z]\w*: '/.test(l));
    expect(goalLines.length).toBeGreaterThan(6);
    for (const line of goalLines) {
      expect(line).not.toContain('**');
      expect(line).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });
});

describe('⑤ 会话被删时目标镜像必须跟着清', () => {
  // goal 的权威在后台（chrome.storage.local.sessionGoals），面板只能删 IndexedDB 里的会话。
  // 不通知后台，已删会话的目标会按查不到的 sessionId 永久留着——用户看不见也删不掉，
  // 只能等上限淘汰。这类跨文件漏接不会报错，只会留下沉默的脏数据。
  test('deleteSession 向后台发 DROP_GOAL（失败不阻塞删除）', () => {
    const body = SESSION_MGR.slice(SESSION_MGR.indexOf('export async function deleteSession'), SESSION_MGR.indexOf('export async function renameSession'));
    expect(body).toMatch(/chrome\.runtime\.sendMessage\(\{ type: 'DROP_GOAL', sessionId \}/);
    // 必须排在会话真删之后，且整个发送被 try 包住（发消息失败不能把删除拖死）
    expect(body.indexOf('deleteStoreSession')).toBeLessThan(body.indexOf('DROP_GOAL'));
    expect(body).toMatch(/\} catch \(e\) \{/);
  });

  test('后台接住 DROP_GOAL 并真的调 removeGoal', () => {
    expect(BG_INDEX).toMatch(/import \{ getGoal, applyGoalCommand, removeGoal \} from '\.\/goal-store\.js';/);
    const start = BG_INDEX.indexOf("message.type === 'DROP_GOAL'");
    const handler = BG_INDEX.slice(start, BG_INDEX.indexOf("message.type === 'ASR_GET_STATUS'", start));
    expect(handler.length).toBeGreaterThan(0);
    expect(handler).toContain('removeGoal(sessionId)');
    // 无 sessionId 时不能把整个 SW 消息处理拖成永久等待
    expect(handler).toMatch(/if \(!sessionId\) \{\n\s*sendResponse\(\{ success: false \}\);\n\s*return false;/);
  });

  test('面板侧听 session-deleted / session-archived 重画目标条', () => {
    expect(PANEL).toMatch(/document\.addEventListener\('session-deleted', \(\) => \{ resetGoalPanel\(\); \}\)/);
    expect(PANEL).toMatch(/document\.addEventListener\('session-archived', \(\) => \{ resetGoalPanel\(\); \}\)/);
  });
});

describe('⑥ 设置页预算真的进引擎（否则预算只是摆设）', () => {
  test('SET_GOAL 把设置页的 turnBudget/timeBudgetMs 当默认值注入命令', () => {
    const start = BG_INDEX.indexOf("message.type === 'SET_GOAL'");
    const handler = BG_INDEX.slice(start, BG_INDEX.indexOf("message.type === 'DROP_GOAL'", start));
    expect(handler).toContain('const goalCfg = cfg?.reactConfig?.goal || {};');
    expect(handler).toMatch(/cmd\.turnBudget === undefined && Number\.isFinite\(goalCfg\.turnBudget\)/);
    expect(handler).toMatch(/cmd\.timeBudgetMs === undefined && Number\.isFinite\(goalCfg\.timeBudgetMs\)/);
    // 只作默认值：面板显式下发的预算不能被设置页盖掉
    expect(handler).toMatch(/cmd\.turnBudget = goalCfg\.turnBudget;/);
  });

  test('禁用分支只回包一次（早期写法会发两遍 + action 丢失）', () => {
    const start = BG_INDEX.indexOf("message.type === 'SET_GOAL'");
    const handler = BG_INDEX.slice(start, BG_INDEX.indexOf("message.type === 'DROP_GOAL'", start));
    // 唯一一次「成功」回包在最后一个 then 里；disabled 分支只返回标记对象
    expect(handler.match(/sendResponse\(/g)).toHaveLength(4);
    expect(handler).toMatch(/if \(cfg\?\.reactConfig\?\.goal\?\.enabled === false\) return \{ disabled: true \};/);
  });
});

describe('⑦ 撤销放行必须同时熄灭 🎯（否则下一条消息把授权原样补回去）', () => {
  test('撤销徽标点击：暂停 + goalMode=false + 专用文案', () => {
    const start = PANEL.indexOf('els.approve.addEventListener');
    const block = PANEL.slice(start, PANEL.indexOf('// 后台回推', start));
    expect(block).toContain("action: 'pause'");
    expect(block).toMatch(/state\.goalMode = false;/);
    // goalMode 必须在发命令之后、重绘之前就熄：重绘读的就是它
    expect(block.indexOf('goalMode = false')).toBeLessThan(block.indexOf('renderGoalBar()'));
    expect(block).toContain("t('goal.approvalRevoked')");
  });

  test('暂停/清除在后台当场收回放行授权（不等引擎 finally）', () => {
    const start = BG_INDEX.indexOf("message.type === 'SET_GOAL'");
    const handler = BG_INDEX.slice(start, BG_INDEX.indexOf("message.type === 'DROP_GOAL'", start));
    // 一次 run 可能还要跑几十分钟：撤销只写在引擎 finally 里，用户点了暂停后灰名单命令仍会静默放行
    expect(handler).toMatch(/if \(goal && !goalIsRunning\(goal\)\) revokeTaskLoopApproval\(sessionId\);/);
  });

  test('重新点亮 🎯 时 budget_limited 也能恢复（不只认 paused）', () => {
    const start = PANEL.indexOf('重新点亮');
    const block = PANEL.slice(start, PANEL.indexOf('els.edit.addEventListener', start));
    expect(block).toContain("goal.status === 'paused' || goal.status === 'budget_limited'");
    // 硬顶拒绝恢复时必须提示，不能假装成功
    expect(block).toContain('warnIfResumeBlocked(resp.goal)');
  });
});

describe('⑧ 设置页开关即时落盘（关闸不该等保存按钮）', () => {
  test('两个布尔开关各自即时写回 goalConfig', () => {
    const start = CONFIG_MANAGER.indexOf('export function persistGoalSwitch');
    expect(start).toBeGreaterThan(-1);
    const body = CONFIG_MANAGER.slice(start, CONFIG_MANAGER.indexOf('// 加载配置'));
    // 必须读回整份再翻一个键：直接写 { enabled } 会把其余字段顶成 undefined
    expect(body).toMatch(/Object\.assign\(\{\}, DEFAULT_GOAL_CONFIG, result\.goalConfig \|\| \{\}, \{ \[field\]: value !== false \}\)/);
    expect(body).toContain("chrome.storage.local.get(['goalConfig']");
    expect(body).toContain('chrome.storage.local.set({ goalConfig: cfg });');
  });

  test('options 入口只把两个开关接到 persistGoalSwitch', () => {
    const OPTIONS_INDEX = readFileSync(join(process.cwd(), 'src/options/index.js'), 'utf8');
    expect(OPTIONS_INDEX).toMatch(/import \{[^}]*persistGoalSwitch[^}]*\} from '\.\/config-manager\.js';/);
    expect(OPTIONS_INDEX).toMatch(/goalEnabled: 'enabled',/);
    expect(OPTIONS_INDEX).toMatch(/goalIntentDetection: 'intentDetection',/);
    expect(OPTIONS_INDEX).toMatch(/persistGoalSwitch\(goalSwitchFields\[id\], goalEl\.checked\)/);
    // 已收回的开关与预算绝不能进即时写
    expect(OPTIONS_INDEX).not.toMatch(/goalObjectiveEvidence|goalTurnBudget|goalTimeBudgetMin|goalStagnationLimit/);
  });
});

describe('⑨ 暂停 ≠ 彻底停下：开关还亮着必须说清楚', () => {
  test('目标条「暂停」后按开关状态给两种提示，且只在真落成 paused 时提示', () => {
    const start = PANEL.indexOf('els.pause.addEventListener');
    expect(start).toBeGreaterThan(-1);
    const block = PANEL.slice(start, PANEL.indexOf('els.resume.addEventListener', start));
    expect(block).toContain("action: 'pause'");
    // 开关亮着→下条消息会复活；开关熄了→不会。两种话不能合成一句
    expect(block).toContain("t(state.goalMode ? 'goal.pausedToast' : 'goal.pausedToastChipOff')");
    // 后台没落成 paused（已终态 / 通道失败）时不能假报「已暂停」
    expect(block).toMatch(/if \(resp\.goal\.status === 'paused'\) \{/);
  });

  test('chip 只在「亮着 + 目标停住」时标待续，熄灭时不标', () => {
    expect(PANEL).toMatch(/const goalIdle = enabled && !!goal && \(goal\.status === 'paused' \|\| goal\.status === 'budget_limited'\);/);
    expect(PANEL).toMatch(/els\.group\.dataset\.goalIdle = goalIdle \? '1' : '';/);
    // 标记必须真的被样式消费，否则只是个没人读的 DOM 属性
    const CSS = readFileSync(join(process.cwd(), 'src/side_panel/styles.css'), 'utf8');
    expect(CSS).toContain('#goalGroup[data-goal-idle="1"]');
    expect(CSS).toMatch(/#goalGroup\[data-goal-idle="1"\]:hover/);
  });

  test('暂停态副行写明「还会接着跑」，且只在开关亮着时补这句', () => {
    // goalIdle 的定义里已经含「开关亮着」，所以这句天然只在「暂停 + 亮着」时出现；
    // 开关熄灭时「继续」按钮就在旁边，再加一句是噪音。
    expect(PANEL).toMatch(/if \(goalIdle && goal\.status === 'paused'\) metaParts\.push\(t\('goal\.pausedHintInline'\)\);/);
  });

  test('两条提示中英文都得有（缺一个就是英文界面弹中文）', () => {
    for (const key of ['pausedToast:', 'pausedToastChipOff:', 'pausedHintInline:']) {
      expect(ZH, `zh 缺 ${key}`).toContain(key);
      expect(EN, `en 缺 ${key}`).toContain(key);
    }
  });
});
