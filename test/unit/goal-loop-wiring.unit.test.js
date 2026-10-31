// Goal 模式在 react-loop 的接线守卫（源码文本断言，防重构静默拆线）。
//
// 这套断言锁的是「顺序」和「副作用边界」，因为 goal 模式的正确性几乎全在时序上：
//   ① 目标锚点必须在上下文压力裁剪之后注入（否则 critical 分支重建会吞掉它）；
//   ② 未达成续跑时绝不能清 checkpoint（清了就等于中断即丢现场）；
//   ③ 评估必须发生在 saveCheckpointNow('final_answer') / clearCheckpoint 之前；
//   ④ 子任务不参与目标评估（目标属于整个任务，父循环统一裁定）；
//   ⑤ 预算收尾只把 active 目标标成 budget_limited，不重复结算时长；
//   ⑥ 停滞/失败阈值只传有限值，传 undefined 会盖掉默认值让闸门失效。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOOP = readFileSync(join(process.cwd(), 'src/background/react-loop.js'), 'utf8');

function idx(needle) {
  const i = LOOP.indexOf(needle);
  expect(i, `未找到锚点：${needle}`).toBeGreaterThan(-1);
  return i;
}

describe('① 依赖与状态来源', () => {
  test('引入目标内核、评估器与会话级注册表', () => {
    expect(LOOP).toMatch(/from '\.\.\/shared\/goal\.js'/);
    expect(LOOP).toMatch(/import \{ evaluateGoal \} from '\.\/goal-evaluator\.js'/);
    expect(LOOP).toMatch(/import \{ setGoal as persistGoalToStore, getGoal as readGoalMirror, updateGoal as updateGoalInStore \} from '\.\/goal-store\.js'/);
    // 续跑入参统一由 checkpoint-state 构造（读写两侧共用，杜绝字段漂移）
    expect(LOOP).toMatch(/import \{ buildResumeState \} from '\.\/checkpoint-state\.js'/);
  });

  test('复用 completion-verifier 的取证原语（verifySubtaskCompletion）', () => {
    expect(LOOP).toMatch(
      /import\s*\{[^}]*verifySubtaskCompletion[^}]*\}\s*from\s*'\.\/completion-verifier\.js'/,
    );
  });

  test('目标状态优先取 checkpoint 现场，已终态则回落面板意图', () => {
    expect(LOOP).toMatch(/const fromCheckpoint = normalizeGoal\(resumeState\?\.goalState\);/);
    expect(LOOP).toMatch(/\(fromCheckpoint && !goalIsFinished\(fromCheckpoint\)\)/);
    expect(LOOP).toMatch(/normalizeGoal\(apiParams\?\.goal\)/);
  });

  test('目标模式被 enabled 开关与 !isSubtask 双重守卫', () => {
    expect(LOOP).toMatch(/const goalCfg = reactConfig\.goal \|\| \{\};/);
    expect(LOOP).toMatch(/const goalEnabled = goalCfg\.enabled !== false && !isSubtask;/);
  });
});

describe('② 锚点注入时序', () => {
  test('目标锚点注入在上下文压力裁剪之后（否则 critical 分支会吞掉）', () => {
    const pressure = idx('const pressure = assessContextPressure');
    const goalAnchor = idx('const goalAnchor = buildGoalAnchorMessage();');
    expect(goalAnchor).toBeGreaterThan(pressure);
  });

  test('目标锚点与计划/便签锚点同位置（便签之后，相邻块）', () => {
    const notes = idx('const noteAnchor = buildNotesAnchorMessage();');
    const goalAnchor = idx('const goalAnchor = buildGoalAnchorMessage();');
    expect(goalAnchor).toBeGreaterThan(notes);
  });

  test('锚点只在 active 时产出（终态不再每轮占上下文）', () => {
    expect(LOOP).toMatch(
      /const buildGoalAnchorMessage = \(\) => \{[\s\S]*?const text = buildGoalAnchorText\(goalState, \{\s*unattended: !!\(sessionId && hasGoalUnattended\(sessionId\)\),\s*\}\);\s*return text \? \{ role: 'user', content: text \} : null;/,
    );
  });

  test('无人值守文案与工具表摘除同判据（都由 hasGoalUnattended 决定）', () => {
    // 锚点里写「别提问」的前提是 clarify_question 真的已从工具表摘掉；
    // 两者一旦分叉，就是「prompt 叫模型别问、工具表里还挂着提问工具」或反过来
    const anchorStart = idx('const buildGoalAnchorMessage = () => {');
    expect(LOOP.slice(anchorStart, anchorStart + 500)).toContain('unattended: !!(sessionId && hasGoalUnattended(sessionId))');
    expect(LOOP).toMatch(/if \(hasGoalUnattended\(sessionId\)\) \{\s*goalTools = tools\.filter\(t => t\.function\?\.name !== 'clarify_question'\);/);
  });
});

describe('③ 收尾裁决时序', () => {
  test('评估发生在最终 checkpoint 落盘与清理之前', () => {
    const call = idx('const goalStep = await handleGoalClosingAttempt');
    const saveFinal = idx("await saveCheckpointNow('final_answer');");
    // 清理调用在文件里出现多次，必须从「最终 checkpoint 落盘」之后的位置再找
    const clear = LOOP.indexOf('await clearCheckpoint(sessionId);', saveFinal);
    expect(call).toBeLessThan(saveFinal);
    expect(clear).toBeGreaterThan(saveFinal);
  });

  test('收尾内容可被评估结果修正（let 而非 const）', () => {
    expect(LOOP).toMatch(/let content = assistantMessage\?\.content \|\| '';/);
    expect(LOOP).toMatch(/content = goalStep\.content;/);
  });

  test('三种裁决出口齐备：continue / halt / finalize', () => {
    expect(LOOP).toMatch(/if \(goalStep\.kind === 'continue'\) continue;/);
    expect(LOOP).toMatch(/if \(goalStep\.kind === 'halt'\) return goalStep\.result;/);
  });

  test('停滞闸只看本轮新增的工具节点（历史成功不算本轮有进展）', () => {
    // executionLog 是整次运行累计的，不切片的话成功过一次就永远算「有进展」，闸门变死闸
    const evalStart = idx('const verdict = await evaluateGoal(goalState, {');
    expect(LOOP.slice(evalStart, evalStart + 900)).toContain('executionLog: sliceLogSinceLastGoalNode(),');
    // 边界取「上一个目标裁决节点」而不是下标：trimExecutionLogMemory 会从头部 splice，下标会漂
    const sliceStart = idx('function sliceLogSinceLastGoalNode()');
    expect(LOOP.slice(sliceStart, sliceStart + 500)).toContain('if (executionLog[i]?.goalNode) return executionLog.slice(i + 1);');
  });
});

describe('④ 未达成续跑：绝不清 checkpoint', () => {
  test('CONTINUE 分支落 goal_continue checkpoint 且不含 clearCheckpoint', () => {
    const start = idx("if (applied.action === GOAL_ACTIONS.CONTINUE) {");
    const end = idx("if (applied.action === GOAL_ACTIONS.STOP_ACHIEVED) {");
    const block = LOOP.slice(start, end);
    expect(block).toContain("await saveCheckpointNow('goal_continue');");
    expect(block).not.toContain('clearCheckpoint');
    expect(block).not.toContain('checkpointThrottle.cancel');
  });

  test('续跑前把模型这次的收尾陈述入历史（避免下一轮重做已完成步骤）', () => {
    expect(LOOP).toMatch(
      /if \(content\) currentMessages\.push\(\{ role: 'assistant', content \}\);\s*currentMessages\.push\(\{ role: 'user', content: buildGoalContinuationText\(goalState, verdict\) \}\);/,
    );
  });

  test('裁决暂停/预算时强制落盘保存现场，且原因走统一表', () => {
    expect(LOOP).toMatch(/await saveCheckpointNow\(goalHaltCheckpointReason\(goalState\.status\), true\);/);
  });

  test('只对 active 目标下裁决（paused/budget_limited 不进评估）', () => {
    // 接线一旦漏判 status，非 active 目标会白烧一次评估调用；而 kernel 对非 active
    // 回的是 STOP_PAUSED（不计轮次），漏判就是一条无上限的续跑路
    expect(LOOP).toMatch(/if \(goalEnabled && goalIsRunning\(goalState\)\) \{\s*const goalStep = await handleGoalClosingAttempt/);
  });

  test('收尾先回查 goal-store 镜像，闭包副本不作数', () => {
    const start = idx('async function handleGoalClosingAttempt');
    const body = LOOP.slice(start, idx('function pauseLoopTimer()'));
    const mirror = idx('mirror = await readGoalMirror(sessionId);');
    const budgetGate = idx('const budget = checkGoalBudget(goalState, { fallbackTimeBudgetMs: loopTimeout });');
    // 回查必须早于预算闸：用户在面板点的暂停/清除不能先被旧副本过一道
    expect(mirror).toBeGreaterThan(start);
    expect(mirror).toBeLessThan(budgetGate);
    // 镜像里没有目标 / 已是 cleared = 运行中被清除：按普通任务收尾，不能再带目标语义
    // （clearGoal 落的是一个 status=cleared 的对象，不是 null）
    expect(body).toContain('if (!mirror || mirror.status === GOAL_STATUS.CLEARED) {');
    expect(body).toContain('goalState = null;');
    expect(body).toContain("return { kind: 'finalize', content, reasoningContent };");
    // 镜像非 active = 用户已暂停/预算撞线：立即收口，不得接着评估
    expect(body).toContain('if (!goalIsRunning(goalState)) {');
  });
});

describe('⑤ 预算软着陆与目标状态', () => {
  test('只把 active 目标标成 budget_limited（不重复结算时长）', () => {
    // 判定必须读 store 当前值，不能用本次 run 启动时的闭包副本
    expect(LOOP).toMatch(
      /updateGoalInStore\(sessionId, \(g\) => \(\s*g && g\.status === GOAL_STATUS\.ACTIVE \? markGoalBudgetExhausted\(g, budgetExhaustedBy\) : g/,
    );
  });

  test('预算冲突时先判目标预算，别白烧一次评估调用', () => {
    const budgetGate = idx('const budget = checkGoalBudget(goalState, { fallbackTimeBudgetMs: loopTimeout });');
    const evaluate = idx('const verdict = await evaluateGoal(goalState, {');
    expect(budgetGate).toBeLessThan(evaluate);
  });
});

describe('⑥ 状态机参数与持久化', () => {
  test('停滞/失败阈值只传有限值（传 undefined 会盖掉默认值）', () => {
    expect(LOOP).toMatch(/if \(Number\.isFinite\(goalCfg\.stagnationLimit\)\) goalLimits\.stagnationLimit = goalCfg\.stagnationLimit;/);
    expect(LOOP).toMatch(/if \(Number\.isFinite\(goalCfg\.evaluatorFailureLimit\)\) goalLimits\.evaluatorFailureLimit = goalCfg\.evaluatorFailureLimit;/);
  });

  test('goalState 进入 checkpoint（续跑不丢目标与轮次）', () => {
    expect(LOOP).toMatch(/notesState,\s*goalState,\s*subtaskProgress: Object\.fromEntries\(subtaskProgress\),/);
  });

  test('状态变更同时落镜像并回推面板', () => {
    expect(LOOP).toMatch(/chrome\.runtime\.sendMessage\(\{ type: 'GOAL_UPDATE', sessionId, callId, goal: goalState \}\)/);
    expect(LOOP).toMatch(/await persistGoalToStore\(sessionId, goalState\);/);
    // 两者必须成对出现：只推不落 = SW 重启后面板回到旧轮数；只落不推 = 目标条实时不刷
    expect(LOOP).toMatch(/await syncGoalState\(\);\s*emitGoalUpdate\(\);/);
  });

  test('判不可能时把评估理由补进最终回答（不谎报成功）', () => {
    expect(LOOP).toMatch(/const note = t\('reactLoop\.goalUnmetNote', \{ reason: verdict\.reason \|\| '-' \}\);/);
  });

  test('评估节点复用 reflection 类型（零渲染改动）', () => {
    expect(LOOP).toMatch(/nodeType: 'reflection',\s*nodeName,\s*status,/);
    expect(LOOP).toMatch(/goalNode: true,/);
  });

  test('客观取证只在配置打开且确有 doneCriteria 时执行', () => {
    expect(LOOP).toMatch(
      /const evidence = \(goalCfg\.objectiveEvidence !== false && goalState\.doneCriteria\.length > 0\)\s*\?\s*await gatherGoalEvidence\(\)\s*:\s*\[\];/,
    );
  });

  test('取证失败归「取不到证」，绝不折成未达成', () => {
    const start = idx('async function gatherGoalEvidence() {');
    const end = idx('async function finalizeGoalHalt(');
    const block = LOOP.slice(start, end);
    expect(block).toContain('commandReadOnlyGate: true');
    expect(block).toContain('return [];');
  });
});

// ⑦ 目标模式 = 无人值守：确认与澄清必须真的不打断（2026-10-31 拍板）
describe('⑦ 无人值守：放行与澄清', () => {
  test('目标激活且持有显式授权时才 grant 任务级放行', () => {
    const start = idx('let goalTools = tools;');
    const end = idx('function emitGoalUpdate()');
    const block = LOOP.slice(start, end);
    expect(block).toContain('grantTaskLoopApproval(sessionId);');
    // 三个条件缺一不可：active + 面板授予 + 有 sessionId（按任务树记账的前提）
    expect(block).toMatch(
      /goalState\.status === GOAL_STATUS\.ACTIVE && goalState\.autoApprove === true && sessionId/,
    );
  });

  test('授权开关在 grant 之前判定（不能先放行再检查）', () => {
    // grantTaskLoopApproval 在确认通道里还有一处调用（用户点「当前任务放行」），
    // 所以只能在 goal 块内定位，不能全局取第一个
    const start = idx('let goalTools = tools;');
    const end = idx('function emitGoalUpdate()');
    const block = LOOP.slice(start, end);
    const guard = block.indexOf('goalState.autoApprove === true && sessionId');
    const grant = block.indexOf('grantTaskLoopApproval(sessionId);');
    expect(guard).toBeGreaterThan(-1);
    expect(grant).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(grant);
  });

  test('目标模式下摘掉 clarify_question，并把过滤后的表真正下发', () => {
    expect(LOOP).toMatch(
      /goalTools = tools\.filter\(t => t\.function\?\.name !== 'clarify_question'\);/,
    );
    // 请求体与 token 估算都必须用过滤后的表，否则只是「算了个寂寞」
    expect(LOOP).toContain('const apiTools = inGrace ? [] : goalTools;');
    expect(LOOP).toContain('JSON.stringify(goalTools.map(t => { const { id, ...clean } = t; return clean; }))');
    expect(LOOP).not.toContain('const apiTools = inGrace ? [] : tools;');
  });

  test('没有目标/未授权时不下发过滤（基线网络行为不变）', () => {
    const start = idx('let goalTools = tools;');
    const end = idx('function emitGoalUpdate()');
    const block = LOOP.slice(start, end);
    // 过滤只发生在 hasGoalUnattended 闸门内，闸门本身以会话谓词为条件
    expect(block).toMatch(/if \(hasGoalUnattended\(sessionId\)\) \{\s*goalTools = tools\.filter\(/);
  });

  test('无人值守与任务级放行同时授予（同一份授权）', () => {
    const start = idx('let goalTools = tools;');
    const end = idx('function emitGoalUpdate()');
    const block = LOOP.slice(start, end);
    expect(block).toContain('grantTaskLoopApproval(sessionId);');
    expect(block).toContain('goalUnattendedSessions.add(unattendedRoot);');
  });

  test('无人值守随放行同生同灭（revoke 同一前缀清两个集合）', () => {
    const start = idx('export function revokeTaskLoopApproval(sessionId) {');
    const end = idx('export function hasGoalUnattended(sessionId) {');
    const block = LOOP.slice(start, end);
    expect(block).toContain('loopApprovedSessions.delete(id);');
    expect(block).toContain('goalUnattendedSessions.delete(id);');
  });

  test('无人值守按 ancestor 链判定（子任务/子代理不需要逐层透传）', () => {
    const start = idx('export function hasGoalUnattended(sessionId) {');
    const block = LOOP.slice(start, start + 260);
    expect(block).toContain('getSessionAncestry(sessionId)');
    expect(block).toContain('goalUnattendedSessions.has(id)');
  });

  test('无人值守与「当前任务放行」分开记账（点放行不等于允许闭嘴问人）', () => {
    // 两个 Set 必须彼此独立：合并成同一个会让用户在确认框上点「当前任务放行」
    // 之后，非目标的普通任务也不再弹 clarify
    expect(LOOP).toMatch(/const goalUnattendedSessions = new Set\(\);/);
    expect(LOOP).toMatch(/const loopApprovedSessions = new Set\(\);/);
  });

  test('clarify_question 有第二道闸（非 ReAct 通道的工具集）', () => {
    const TE = readFileSync(join(process.cwd(), 'src/background/tool-executor.js'), 'utf8');
    const start = TE.indexOf('export async function executeClarifyQuestion(');
    expect(start).toBeGreaterThan(-1);
    // 截到下一个 export 为止，不用定长窗口：函数体会长（推荐项归一、超时延长等），
    // 定长窗口一短就会把后面的内容切掉，报出与真实接线无关的假失败
    const body = TE.slice(start, TE.indexOf('\nexport ', start + 1));
    expect(body).toContain('if (hasGoalUnattended(sessionId)) {');
    expect(body).toContain("t('toolExec.clarifyUnattended'");
    // 兜底必须早于配置读取与弹窗：晚一步就白等一个 clarifyTimeout
    const gate = body.indexOf('hasGoalUnattended(sessionId)');
    expect(body.indexOf('const clarifyTimeout')).toBeGreaterThan(gate);
    expect(body.indexOf('return new Promise(')).toBeGreaterThan(gate);
  });
});

describe('⑦ 附件清单接线（目标只收原话，附件靠清单存活）', () => {
  const CHAT = readFileSync(join(process.cwd(), 'src/side_panel/chat-manager.js'), 'utf8');
  const PANEL = readFileSync(join(process.cwd(), 'src/side_panel/goal-panel.js'), 'utf8');
  const EVAL = readFileSync(join(process.cwd(), 'src/background/goal-evaluator.js'), 'utf8');

  test('发送链路把附件清单随目标下发，objective 仍用原始 text', () => {
    expect(CHAT).toMatch(/attachments:\s*summarizeGoalAttachments\(inputCtx\)/);
    // 目标描述必须继续用原始 text：finalText 已拼上知识库/网页/文件正文，塞进去就污染了目标
    expect(CHAT).toContain('sessionId: mySessionId,\n          text,');
  });

  test('面板只把附件压成清单（kind/name/detail），不搬运任何正文', () => {
    expect(PANEL).toMatch(/export function summarizeGoalAttachments/);
    for (const kind of ['image', 'file', 'page', 'knowledge']) {
      expect(PANEL).toContain(`kind: '${kind}'`);
    }
    // detail 只允许短指针；把文件正文/知识库片段搬进目标会撑爆锚点
    expect(PANEL).not.toMatch(/detail:[^\n]*\.text/);
    expect(PANEL).not.toMatch(/detail:[^\n]*content/);
  });

  test('评估器知道目标依赖附件，且禁止靠收尾自述判达成', () => {
    expect(EVAL).toMatch(/normalizeGoalAttachments\(goal\.attachments\)/);
    expect(EVAL).toContain('you cannot inspect it');
    expect(EVAL).toMatch(/missing evidence, never as proof of failure/);
  });
});
