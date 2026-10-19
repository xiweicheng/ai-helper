// 完成度校验器 Phase B（B1）：react-loop 接线守卫（源码文本断言，防重构静默拆线）。
// 锁事：① 从 completion-verifier 引入路由取证器与单子任务注解原语；
// ② 取证调用点在 executeSingleSubtask 内、子任务成功且 onDone（含 checkpoint 落盘）之后（落盘优先于取证往返）；
// ③ 整段被 completionVerification.enabled 守卫——关则短路，现有行为逐字节不变；
// ④ DOM 取证按子任务派生 sessionId 动态解析工作 tab（resolveTabId，#5）；
// ⑤ 命令取证只读硬拦随 rerunEnabled 切换（关=Phase A 只读门；开=agent 三档，B2 接）；
// ⑤′ B3 重跑回路：annotateOne 注入 rerun+budgetLeft；rerun 追写 directive 重跑内层 reactLoop、且不重调 onDone；
// ⑥ 未达标经 completionNote 追加进父模型汇总；#7 note 受 token 护栏；#11/M-new-4 取消+整体超时早停。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOOP = readFileSync(join(process.cwd(), 'src/background/react-loop.js'), 'utf8');

describe('react-loop 完成度校验接线守卫（Phase B 落点）', () => {
  test('① 从 ./completion-verifier.js 引入路由取证器与单子任务注解原语', () => {
    expect(LOOP).toMatch(
      /import\s*\{[^}]*createRoutingEvidenceCollector[^}]*annotateOneSubtaskCompletion[^}]*\}\s*from\s*'\.\/completion-verifier\.js'/,
    );
  });

  test('①c 本地 Agent 客户端导入 execCommandWait 与 getAgentConfig', () => {
    expect(LOOP).toMatch(
      /import\s*\{[^}]*execCommandWait[^}]*getAgentConfig[^}]*\}\s*from\s*'\.\/local-agent-client\.js'/,
    );
  });

  test('①d 从 ./state.js 导入 getLastOperatedTab（#5 动态 tab 解析）', () => {
    expect(LOOP).toMatch(
      /import\s*\{[^}]*getLastOperatedTab[^}]*\}\s*from\s*'\.\/state\.js'/,
    );
  });

  // 不变式：整段取证被 completionVerification.enabled 守卫——关则短路（逐字节基线）。
  test('②a cvCfg 源自 config.reactConfig.completionVerification 且被 enabled 守卫', () => {
    expect(LOOP).toMatch(
      /const cvCfg = config && config\.reactConfig && config\.reactConfig\.completionVerification;/,
    );
    expect(LOOP).toMatch(/if \(cvCfg && cvCfg\.enabled\) \{/);
  });

  // 路由取证器构造须：注入 execWait/isOnline；resolveTabId 走派生 sessionId 的 lastOperatedTab（#5）；
  // 只读门随 rerunEnabled 取反（关=Phase A 只读，B1 默认）。
  test('②b 路由取证器注入 execWait + isOnline + resolveTabId(派生 sessionId)，只读门随 !rerunEnabled', () => {
    expect(LOOP).toMatch(
      /createRoutingEvidenceCollector\(\{[\s\S]*?resolveTabId: \(\) => \(subtaskSessionId \? getLastOperatedTab\(subtaskSessionId\) : null\) \?\? tabId,[\s\S]*?execWait: execCommandWait,[\s\S]*?isOnline:[\s\S]*?getAgentConfig\(\)[\s\S]*?commandReadOnlyGate: !cvCfg\.rerunEnabled,[\s\S]*?\}\);/,
    );
  });

  test('②c annotateOneSubtaskCompletion 在 enabled 块内、传 doneResult 与 [subtask]', () => {
    expect(LOOP).toMatch(
      /if \(cvCfg && cvCfg\.enabled\) \{[\s\S]*?await annotateOneSubtaskCompletion\(doneResult, \[subtask\], \{[\s\S]*?gatherEvidence: cvGatherEvidence,[\s\S]*?config: cvCfg,/,
    );
  });

  // 取证调用点已不在父层 onDone 内（防时机错位回归）：父 onDone 内不得再调 annotateOne。
  test('②d 父层 onDone 内不再取证（annotateOne 仅在 executeSingleSubtask）', () => {
    expect(LOOP).not.toMatch(/annotateOneSubtaskCompletion\(r, subtaskPlan\.subtasks/);
  });

  test('②e 不再于整轮末尾统一取证（annotateSubtaskCompletion 调用已移除）', () => {
    expect(LOOP).not.toMatch(/annotateSubtaskCompletion\s*\(/);
  });

  // 落盘优先于取证往返：annotate 在 await onDone(doneResult)（内含 saveCheckpointNow）之后。
  test('③ 先 await onDone(doneResult)（含 checkpoint）再取证', () => {
    expect(LOOP).toMatch(
      /await progressHooks\.onDone\(doneResult\);[\s\S]{0,900}?if \(cvCfg && cvCfg\.enabled\)[\s\S]{0,700}?annotateOneSubtaskCompletion/,
    );
  });

  test('④ 未达标经 completionNote 追加进父模型汇总消息（关时 undefined → 逐字节不变）', () => {
    expect(LOOP).toMatch(/const noteRaw = result\.completionNote \|\| '';/);
    expect(LOOP).toMatch(/Result: \$\{truncated\}\$\{completionNote\}/);
  });

  // #7：上报文案也纳入 token 护栏（note 拼接前先截断，防无限长注入）
  test('#7 completionNote 拼接前受 COMPLETION_NOTE_MAX_TOKENS 截断', () => {
    expect(LOOP).toMatch(/const COMPLETION_NOTE_MAX_TOKENS = 500;/);
    expect(LOOP).toMatch(
      /estimateTokens\(noteRaw\) > COMPLETION_NOTE_MAX_TOKENS[\s\S]{0,80}?truncateByTokens\(noteRaw, COMPLETION_NOTE_MAX_TOKENS\)/,
    );
  });

  // #11 / M-new-4：取证接上取消 + 整体超时早停（executeSubtasks 作用域用 parentBudget.getRemainingTimeMs）。
  test('#11/M-new-4 annotateOne 注入 shouldStop（取消或整体超时早停）', () => {
    expect(LOOP).toMatch(
      /shouldStop:\s*\(\)\s*=>\s*isCancelled\(tabId\)[\s\S]*?parentBudget\?\.getRemainingTimeMs[\s\S]*?getRemainingTimeMs\(\)\s*<=\s*0/,
    );
  });

  // B3：重跑回路易注入——annotateOne 同时传 rerun + budgetLeft；rerunEnabled=false 时二者不被调用（单趟 Phase A）。
  test('B3 annotateOne 注入 rerun + budgetLeft 回调（闸门 2/3/4 由调用方驱动）', () => {
    expect(LOOP).toMatch(
      /annotateOneSubtaskCompletion\(doneResult, \[subtask\], \{[\s\S]*?budgetLeft: \(\) => \{[\s\S]*?perSubtaskTokenBudget[\s\S]*?estimateMessagesTokens\(subtaskMessages\)[\s\S]*?\},[\s\S]*?rerun: async \(directive\) => \{[\s\S]*?\},\s*\n\s*\}\);/,
    );
  });

  // B3：重跑向子任务上下文追写 directive 为新 user 消息，再跑一轮内层 reactLoop（复用同一 subtaskMessages 引用）。
  test('B3 rerun 把 directive 追加入 subtaskMessages 并重跑内层 reactLoop', () => {
    expect(LOOP).toMatch(
      /rerun: async \(directive\) => \{[\s\S]*?subtaskMessages\.push\(\{ role: 'user', content: directive \}\);[\s\S]*?await reactLoop\(\s*subtaskMessages,\s*model,\s*subtaskTools,[\s\S]*?doneResult\.result = rerunResult[\s\S]*?\},/,
    );
  });

  // B3 红线 6：重跑只追写结果，绝不重调 onDone（checkpoint/计数器语义不变）——rerun 体内不得现 onDone。
  test('B3 rerun 体内不重调 progressHooks.onDone（不重复回写 checkpoint）', () => {
    const rerunBody = LOOP.match(/rerun: async \(directive\) => \{([\s\S]*?)\},\s*\n\s*\}\);/);
    expect(rerunBody).toBeTruthy();
    expect(rerunBody[1]).not.toMatch(/\.onDone\s*\(/);
  });
});
