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
    expect(PANEL).toMatch(/if \(!intent\.detected\) return null;/);
  });

  test('objective 用剥离意图短语后的文本（否则元指令污染目标描述）', () => {
    expect(PANEL).toMatch(/objective = String\(stripGoalIntentPhrases\(text\) \|\| ''\)\.trim\(\) \|\| text;/);
  });

  test('发送链路不再用 state.goalMode 门控 prepareGoalForSend', () => {
    // 这条断言锁的是「调用点」而不是函数内部：调用点带 && state.goalMode 时，
    // 函数里的意图识别分支永远进不去，测试全绿但功能没接上
    expect(CHAT).toMatch(/if \(isActive\) \{\s*try \{\s*const goal = await prepareGoalForSend\(/);
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
  // DEFAULT_GOAL_CONFIG 里凡是面板/引擎会消费的字段，都必须能在设置页落到控件
  const UI_FIELDS = [
    'enabled', 'turnBudget', 'timeBudgetMs', 'stagnationLimit',
    'evaluatorFailureLimit', 'objectiveEvidence', 'intentDetection',
  ];

  test('DEFAULT_GOAL_CONFIG 仍覆盖全部可配置字段', () => {
    const block = CONSTANTS.slice(
      CONSTANTS.indexOf('export const DEFAULT_GOAL_CONFIG = {'),
      CONSTANTS.indexOf('// 流式输出配置默认值'),
    );
    for (const f of UI_FIELDS) {
      expect(block, `DEFAULT_GOAL_CONFIG 缺少 ${f}`).toContain(`${f}:`);
    }
  });

  test('每个字段都有对应控件，且控件 id 与 config-manager 读写一致', () => {
    const ids = ['goalEnabled', 'goalTurnBudget', 'goalTimeBudgetMin', 'goalStagnationLimit',
      'goalEvaluatorFailureLimit', 'goalObjectiveEvidence', 'goalIntentDetection'];
    for (const id of ids) {
      expect(OPTIONS_HTML, `options.html 缺少 #${id}`).toContain(`id="${id}"`);
      expect(CONFIG_MANAGER, `config-manager 未读写 #${id}`).toContain(`getElementById('${id}')`);
    }
  });

  test('storage.get 读取 goalConfig，saveConfig 写回整份', () => {
    expect(CONFIG_MANAGER).toMatch(/'goalConfig',/);
    expect(CONFIG_MANAGER).toMatch(/const goalCfg = Object\.assign\(\{\}, DEFAULT_GOAL_CONFIG, result\.goalConfig \|\| \{\}\);/);
    expect(CONFIG_MANAGER).toMatch(/const goalConfig = \{\s*\.\.\.DEFAULT_GOAL_CONFIG,/);
    expect(CONFIG_MANAGER).toMatch(/goalConfig: goalConfig,/);
  });

  test('时间预算做分钟↔毫秒换算，且 0 保留为 0（= 跟随 loopTimeout）', () => {
    expect(CONFIG_MANAGER).toMatch(/timeBudgetMs: \(parseInt\(document\.getElementById\('goalTimeBudgetMin'\)\?\.value, 10\) \|\| 0\) \* 60000,/);
    expect(CONFIG_MANAGER).toMatch(/goalCfg\.timeBudgetMs > 0/);
  });

  test('预算数字必须校验为有限值：NaN 落库会让闸门失效', () => {
    // parseInt('') = NaN；NaN 既不 < lo 也不 > hi，单独比大小会漏过
    const guard = CONFIG_MANAGER.slice(
      CONFIG_MANAGER.indexOf('const goalRange = ['),
      CONFIG_MANAGER.indexOf('// 验证 ReAct 配置范围'),
    );
    expect(guard).toMatch(/Number\.isFinite\(value\)/);
    expect(guard).toMatch(/value < lo \|\| value > hi/);
  });

  test('总开关只收起子项、不重置子项的值', () => {
    expect(CONFIG_MANAGER).toMatch(/document\.querySelectorAll\('\.goal-sub'\)\.forEach\(\(el\) => \{ el\.style\.display = show \? 'block' : 'none'; \}\)/);
    expect(OPTIONS_HTML).toMatch(/class="react-config-item goal-sub"/);
  });

  test('goalConfig 登记进导入导出白名单', () => {
    expect(CONFIG_IO).toMatch(/'goalConfig',/);
  });

  test('设置页新增文案中英成对', () => {
    const keys = ['goalMode', 'goalTurnBudget', 'goalTimeBudget', 'goalStagnation',
      'goalEvaluatorFail', 'goalObjectiveEvidence', 'goalIntent'];
    for (const k of keys) {
      expect(ZH, `zh 缺少 react.${k}`).toMatch(new RegExp(`\\n    ${k}: '`));
      expect(EN, `en 缺少 react.${k}`).toMatch(new RegExp(`\\n    ${k}: '`));
    }
    for (const k of ['goalTurnRangeError', 'goalStagnationRangeError', 'goalFailRangeError', 'goalTimeRangeError']) {
      expect(ZH, `zh 缺少 settings.${k}`).toMatch(new RegExp(`\\n    ${k}: '`));
      expect(EN, `en 缺少 settings.${k}`).toMatch(new RegExp(`\\n    ${k}: '`));
    }
  });

  test('设置页文案不残留 Markdown 标记与中英混排', () => {
    // i18n 值最终是 HTML 文本节点内容，** 会被原样显示；
    // 英文串里混进中文则是复制粘贴漏改的信号
    const goalLines = EN.split('\n').filter((l) => /^\s+goal[A-Z]\w*: '/.test(l));
    expect(goalLines.length).toBeGreaterThan(10);
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
    expect(BG_INDEX).toMatch(/import \{ getGoal, listGoals, applyGoalCommand, removeGoal \} from '\.\/goal-store\.js';/);
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
