// 接线层守卫：软着陆的纯决策逻辑在 loop-budget-phase.unit.test.js 已逐条覆盖，
// 但那些用例全绿也拦不住「模块接错线」——它们不会告诉你主循环还留着轮数上界、
// 续跑成功后又把 checkpoint 删了、面板在后台软着陆之前就发 CANCEL。
// 本文件只锁这类「接错就静默退化、且退化方向正好是旧行为」的接线点。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

const REACT_LOOP_SRC = read('src/background/react-loop.js');
const BACKGROUND_INDEX_SRC = read('src/background/index.js');
const CHAT_MANAGER_SRC = read('src/side_panel/chat-manager.js');
const CHAT_RESUME_SRC = read('src/side_panel/chat-resume.js');
const PANEL_INDEX_SRC = read('src/side_panel/index.js');
const CONFIG_IO_SRC = read('src/options/config-io.js');
const CONFIG_MANAGER_SRC = read('src/options/config-manager.js');
const CONSTANTS_SRC = read('src/background/constants.js');
const PANEL_UTILS_SRC = read('src/side_panel/utils.js');
const SHARED_TOOLS_SRC = read('src/shared/tools.js');

// 取 from 之后、to 之前的第一段（找不到就返回空串，让断言失败而不是抛错）
function between(src, from, to) {
  const i = src.indexOf(from);
  if (i === -1) return '';
  const j = src.indexOf(to, i + from.length);
  return j === -1 ? src.slice(i) : src.slice(i, j);
}

describe('主循环：轮数上限必须由轮首 evaluateBudgetStep 收口', () => {
  test('循环不再带 iteration < maxIterations 上界，改为 while (true)', () => {
    // 旧条件先变假时「轮数撞线」那一拍进不到循环体，轮数维度的软着陆就是死代码
    expect(REACT_LOOP_SRC).not.toMatch(/while\s*\(\s*graceEntered\s*\|\|\s*iteration\s*<\s*maxIterations\s*\)/);
    expect(REACT_LOOP_SRC).not.toMatch(/while\s*\([^)]*iteration\s*<\s*maxIterations[^)]*\)/);
    expect(REACT_LOOP_SRC).toMatch(/while \(true\) \{/);
  });

  test('循环体外保留显式兜底 throw（否则函数隐式返回 undefined，上层读 executionLog 直接 TypeError）', () => {
    const at = REACT_LOOP_SRC.indexOf('// 不可达：循环只经 return / throw 退出');
    expect(at).toBeGreaterThan(-1);
    // 兜底必须在循环之后、函数 catch 之前
    const tail = REACT_LOOP_SRC.slice(at);
    const throwIdx = tail.indexOf("throw createErrorWithLog(t('reactLoop.maxIterationsExceeded'");
    const catchIdx = tail.indexOf('} catch (error) {');
    expect(throwIdx).toBeGreaterThan(-1);
    expect(catchIdx).toBeGreaterThan(throwIdx);
  });

  test('hard_stop 文案按归因分流：轮数撞线不得再报「时间预算用尽」', () => {
    expect(REACT_LOOP_SRC).toMatch(/budgetStep\.exhaustedBy === 'rounds'[\s\S]{0,200}t\('reactLoop\.maxIterationsExceeded'/);
  });

  test('finalize_local 与 enter_grace 都在轮首分支里被消费（不是只算不判）', () => {
    expect(REACT_LOOP_SRC).toMatch(/budgetStep\.step === 'finalize_local'[\s\S]{0,200}finalizeBudgetEnded/);
    expect(REACT_LOOP_SRC).toMatch(/budgetStep\.step === 'enter_grace'[\s\S]{0,300}graceEntered = true/);
    expect(REACT_LOOP_SRC).toMatch(/const inGrace = budgetStep\.step === 'enter_grace' \|\| budgetStep\.step === 'grace_iterate'/);
  });
});

describe('宽限轮：禁用工具 + 配对安全', () => {
  test('宽限轮请求体不带 tools 字段', () => {
    // 空数组会被部分网关当成非法请求拒绝，因此整段展开而不是 tools: []
    expect(REACT_LOOP_SRC).toMatch(/const apiTools = inGrace \? \[\] : tools;/);
    expect(REACT_LOOP_SRC).toMatch(/\.\.\.\(inGrace \? \{\} : \{\s*\n\s*tools: apiTools\.map/);
  });

  test('宽限轮违规 tool_calls 只回灌指令、不落库 assistant(tool_calls)（否则下一轮缺 tool 消息会 400）', () => {
    const at = REACT_LOOP_SRC.indexOf('logger.warn(`[Background] grace round emitted tool_calls');
    expect(at).toBeGreaterThan(-1);
    const branch = REACT_LOOP_SRC.slice(at, REACT_LOOP_SRC.indexOf('continue;', at));
    expect(branch.length).toBeGreaterThan(200);
    // 违规分支内不得落库 assistant(tool_calls)，也不得对局部 filteredMessages 做无效写入
    expect(branch).not.toMatch(/currentMessages\.push\(assistantMessage\)/);
    expect(branch).not.toMatch(/filteredMessages = \[/);
    // 分支以 continue 收尾（丢弃本轮 tool_calls，下一轮重注入指令）
    expect(REACT_LOOP_SRC.slice(at + branch.length).startsWith('continue;')).toBe(true);
  });

  test('宽限轮不把模型可见的工具定义重复计入 token 预算', () => {
    expect(REACT_LOOP_SRC).toMatch(/const actualToolTokens = inGrace \? 0 : getCalibratedTokens\(rawToolTokens\);/);
    expect(REACT_LOOP_SRC).toMatch(/const preCallPromptEstimate = rawFilteredTokens \+ \(inGrace \? 0 : rawToolTokens\);/);
  });
});

describe('续跑：撞线现场不能被自己的 resume 删掉', () => {
  test('resumeReactLoopFromCheckpoint 仅在非 budgetEnded 时 clearCheckpoint', () => {
    expect(REACT_LOOP_SRC).toMatch(/if \(result\?\.budgetEnded\) \{/);
    const branch = between(REACT_LOOP_SRC, 'if (result?.budgetEnded) {', 'return result;');
    expect(branch).toMatch(/clearCheckpoint\(sessionId\)/);
    // clearCheckpoint 必须落在 else 分支里
    expect(branch).toMatch(/\} else \{\s*\n\s*await clearCheckpoint\(sessionId\);/);
  });

  test('budget_exhausted 已列入 auto-resume 终态（不自动续跑）', () => {
    const autoResume = read('src/background/auto-resume.js');
    expect(autoResume).toMatch(/TERMINAL_REASONS = new Set\(\['user_cancelled', 'error', 'budget_exhausted'\]\)/);
  });
});

describe('工具超时：登记表是权威值，不得再被全局 toolTimeout 压缩', () => {
  test('executeToolWithTimeout 不再取 min(toolSpecificTimeout, timeoutMs)', () => {
    const fn = between(REACT_LOOP_SRC, 'export async function executeToolWithTimeout', 'const toolAbortController');
    expect(fn.length).toBeGreaterThan(200);
    expect(fn).not.toMatch(/Math\.min\(toolSpecificTimeout/);
    expect(fn).toMatch(/const effectiveTimeout = toolSpecificTimeout \|\| timeoutMs;/);
  });

  test('agent_exec wrapper 严格大于内层最坏 guard（12min > 10.5min）', () => {
    expect(CONSTANTS_SRC).toMatch(/agent_exec: 720000/);
    // 内层 guard = min(有效预算 * (1+5), 600000) + 30000 = 630000 < 720000
    const toolExecutor = read('src/background/tool-executor.js');
    expect(toolExecutor).toMatch(/EXEC_TOTAL_BUDGET_CAP_MS = 600000/);
    expect(toolExecutor).toMatch(/EXEC_GUARD_MARGIN_MS = 30000/);
    expect(toolExecutor).toMatch(/return computeExecMaxTotalMs\(effectiveTimeout\) \+ EXEC_GUARD_MARGIN_MS;/);
  });
});

describe('P1 参数：默认值单一来源，设置页/存储/后台三侧一致', () => {
  test('后台默认值：轮数保险丝 2000、整体超时 4h', () => {
    expect(CONSTANTS_SRC).toMatch(/maxIterations: 2000/);
    expect(CONSTANTS_SRC).toMatch(/loopTimeout: 14400000/);
  });

  test('后台不再从 storage 读 reactMaxIterations（旧残留值不得反过来误杀长任务）', () => {
    const bgConfig = read('src/background/config.js');
    expect(bgConfig).toMatch(/maxIterations: DEFAULT_REACT_CONFIG\.maxIterations,/);
    expect(bgConfig).not.toMatch(/result\.reactMaxIterations/);
  });

  test('面板默认值取自 constants，不再各自硬编码（旧 7200000/30 已落后于新默认）', () => {
    expect(PANEL_UTILS_SRC).not.toMatch(/result\.reactLoopTimeout \|\| 7200000/);
    expect(PANEL_UTILS_SRC).toMatch(/loopTimeout: result\.reactLoopTimeout \|\| DEFAULT_REACT_CONFIG\.loopTimeout/);
    expect(PANEL_UTILS_SRC).not.toMatch(/maxIterations: result\.reactMaxIterations/);
  });

  test('设置页校验上下限与 constants 注释一致（1-1440min / 1-60min）', () => {
    expect(CONFIG_MANAGER_SRC).toMatch(/reactLoopTimeout < 60000 \|\| reactLoopTimeout > 86400000/);
    expect(CONFIG_MANAGER_SRC).toMatch(/reactToolTimeout < 60000 \|\| reactToolTimeout > 3600000/);
  });

  test('shared/tools.js 的 DEFAULT_REACT_CONFIG 改为 re-export，消除过期副本', () => {
    expect(SHARED_TOOLS_SRC).toMatch(/export \{ DEFAULT_REACT_CONFIG \} from '\.\.\/background\/constants\.js';/);
    expect(SHARED_TOOLS_SRC).not.toMatch(/maxIterations: 100/);
  });
});

describe('导入导出：删白名单键必须配套「静默丢弃」，否则旧备份全部导不进来', () => {
  test('RETIRED_KEYS 存在，validate 时跳过、confirmImport 时删除', () => {
    expect(CONFIG_IO_SRC).toMatch(/const RETIRED_KEYS = \['reactMaxIterations'\]/);
    expect(CONFIG_IO_SRC).toMatch(/if \(RETIRED_KEYS\.includes\(key\)\) continue;/);
    expect(CONFIG_IO_SRC).toMatch(/for \(const key of RETIRED_KEYS\) delete config\[key\];/);
  });

  test('EXPORT_KEYS 已移除 reactMaxIterations', () => {
    const whitelist = between(CONFIG_IO_SRC, 'const EXPORT_KEYS = [', '];');
    expect(whitelist).not.toMatch(/'reactMaxIterations'/);
    // 但仍保留 gracefulConverge（无 UI 控件，只能靠导入导出覆盖）
    expect(whitelist).toMatch(/'gracefulConverge'/);
  });

  test('config-manager 的旧值清理确实读到该 key（get 列表缺了就是死清理）', () => {
    const getList = between(CONFIG_MANAGER_SRC, "'reactApiTimeout', 'reactLoopTimeout', 'reactToolTimeout',", "], (result)");
    expect(getList).toMatch(/'reactMaxIterations'/);
    expect(CONFIG_MANAGER_SRC).toMatch(/chrome\.storage\.local\.remove\('reactMaxIterations'\)/);
    // 已撤出 UI：不得再有 getElementById('reactMaxIterations')
    expect(CONFIG_MANAGER_SRC).not.toMatch(/getElementById\('reactMaxIterations'\)/);
  });
});

describe('面板看门狗：必须晚于后台软着陆', () => {
  test('timeout 在 loopTimeout 之上叠加工具/宽限轮/收尾余量', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/const graceWatchdogSlackMs = \(reactConfig\.toolTimeout \|\| 0\)/);
    expect(CHAT_MANAGER_SRC).toMatch(/const timeoutMs = reactConfig\.loopTimeout \+ graceWatchdogSlackMs;/);
    // 展示给用户的「超时」仍是裸 loopTimeout，不能被余量污染
    expect(CHAT_MANAGER_SRC).toMatch(/const timeoutSeconds = Math\.round\(reactConfig\.loopTimeout \/ 1000\);/);
  });
});

describe('后台 → 面板：budgetEnded 两条成功路径都要透传', () => {
  test('API_COMPLETE 与 RESUME_REACT 都带 budgetEnded/exhaustedBy', () => {
    const lastApiComplete = BACKGROUND_INDEX_SRC.lastIndexOf("type: 'API_COMPLETE'");
    const apiComplete = BACKGROUND_INDEX_SRC.slice(lastApiComplete, BACKGROUND_INDEX_SRC.indexOf('}).catch', lastApiComplete));
    expect(apiComplete).toMatch(/budgetEnded: budgetEnded/);
    expect(apiComplete).toMatch(/exhaustedBy: result\.exhaustedBy \|\| null/);
    const firstApiComplete = BACKGROUND_INDEX_SRC.indexOf("type: 'API_COMPLETE'");
    const resume = BACKGROUND_INDEX_SRC.slice(firstApiComplete, BACKGROUND_INDEX_SRC.indexOf('}).catch', firstApiComplete));
    expect(resume.length).toBeGreaterThan(0);
    expect(resume).toMatch(/budgetEnded: result\.budgetEnded === true/);
  });

  test('ReAct 成功返回值携带 budgetEnded（index.js 才能透传）', () => {
    expect(BACKGROUND_INDEX_SRC).toMatch(/budgetEnded: reactResult\.budgetEnded \|\| false/);
  });

  test('面板把 budgetEnded 解析为 resumable=budget（前台流式/非流式、后台会话、续跑四条路）', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/budgetEnded = result\.budgetEnded === true;/);
    expect(CHAT_MANAGER_SRC).toMatch(/resumable: budgetEnded \? 'budget' : false/);
    expect(CHAT_RESUME_SRC).toMatch(/budgetEnded = result\.budgetEnded === true;/);
    expect(CHAT_RESUME_SRC).toMatch(/const resumable = budgetEnded \? 'budget' : false;/);
  });
});

describe('「继续执行」入口：单一实现 + 选择器兼容 budget 语义', () => {
  test('_mountResumeButton 由 chat-resume 导出，chat-manager 复用它（不再内联第二份）', () => {
    expect(CHAT_RESUME_SRC).toMatch(/export function _mountResumeButton\(messageDiv, resumable\)/);
    expect(CHAT_MANAGER_SRC).toMatch(/_mountResumeButton,/);
    // 内联副本已合并：按钮创建只出现在 _mountResumeButton 内
    const inline = (CHAT_MANAGER_SRC.match(/className = 'resume-task-btn'/g) || []).length;
    expect(inline).toBe(0);
  });

  test('流式成功路径补挂按钮（该路径不走 addMessage）', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/if \(budgetEnded\) \{\s*\n\s*const streamedEl = assistantMsgId \? document\.querySelector\(`\[data-message-id="\$\{assistantMsgId\}"\]`\) : null;\s*\n\s*_mountResumeButton\(streamedEl, 'budget'\);/);
  });

  test('清除入口的选择器匹配任意真值（不能只匹配 "true"，否则 budget 按钮清不掉）', () => {
    expect(CHAT_RESUME_SRC).not.toMatch(/\.message\[data-resumable="true"\]/);
    expect(CHAT_RESUME_SRC).toMatch(/\.message\[data-resumable\]:not\(\[data-resumable="false"\]\)/);
  });

  test('会话重建路径透传 resumable（写死 false 会把入口整条丢掉）', () => {
    expect(PANEL_INDEX_SRC).toMatch(/restoreMessageFromHtml\(msg\.htmlContent, msg\.messageId, msg\.resumable\)/);
    expect(PANEL_INDEX_SRC).toMatch(/addMessage\([^;]*msg\.resumable \|\| false, msg\.timestamp \?\? null\);/);
  });

  test('续跑取消分支按 t() 比较（中文以外的界面不得把用户取消误判为恢复失败）', () => {
    expect(CHAT_RESUME_SRC).not.toMatch(/errorResult\.message === '任务已被用户停止'/);
    expect(CHAT_RESUME_SRC).toMatch(/errorResult\.message === t\('chatMsg\.errTaskStopped'\)/);
  });

  test('restoreMessageFromHtml 复用 _mountResumeButton（budget 专属文案/校验不漂移）', () => {
    const fn = between(CHAT_MANAGER_SRC, 'export function restoreMessageFromHtml', '// 移除 streaming 类');
    expect(fn).toMatch(/if \(resumable\) _mountResumeButton\(messageEl, resumable\);/);
    expect(fn).not.toMatch(/className = 'resume-task-btn'/);
  });
});

describe('子任务：软着陆不得按成功落定', () => {
  test('budgetEnded 分支按失败落定并跳过重试', () => {
    const branch = between(REACT_LOOP_SRC, 'if (subtaskResult.budgetEnded) {', '// 更新子任务日志为成功');
    expect(branch.length).toBeGreaterThan(300);
    expect(branch).toMatch(/status: 'failed'/);
    expect(branch).toMatch(/return \{\s*\n\s*success: false,/);
    expect(branch).toMatch(/budgetEnded: true,/);
  });

  test('stop 策略回滚不得抹掉已盘上成果（顺序/并行两条路径都有守卫）', () => {
    expect(REACT_LOOP_SRC).toMatch(/if \(!result\.budgetEnded\) \{\s*\n\s*logger\.debug\('\[Background\] execute rollback'\);/);
    expect(REACT_LOOP_SRC).toMatch(/hasFailed && failureStrategy === 'stop' && !results\.some\(r => r && r\.budgetEnded\)/);
  });

  test('子任务软着陆文案中英文都已注册', () => {
    const zh = between(REACT_LOOP_SRC, "registerTranslations('zh'", "registerTranslations('en'");
    const en = REACT_LOOP_SRC.slice(REACT_LOOP_SRC.indexOf("registerTranslations('en'"));
    expect(zh).toMatch(/subtaskBudgetExhausted:/);
    expect(en).toMatch(/subtaskBudgetExhausted:/);
  });
});
