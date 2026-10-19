// 完成度校验器 Phase 2b：react-loop 接线守卫（源码文本断言，防重构静默拆线）。
// 锁事：① 从 completion-verifier 引入取证器与"单子任务"注解原语 annotateOneSubtaskCompletion；
// ② 取证时机在 per-subtask onDone 内即时（M-new-2，非整轮末尾），且被 cvEnabled（源于
// completionVerification.enabled）门控——关则 onDone 内分支整体短路 → 现有行为逐字节不变；
// ③ 置于 saveCheckpointNow 之后（取证往返不拖延进度落盘）；④ 未达标经 completionNote 追加进
// 父模型汇总消息；⑤ #11/M-new-4 取消 + 整体超时(getRemainingTime) 早停注入到 onDone 内取证调用。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LOOP = readFileSync(join(process.cwd(), 'src/background/react-loop.js'), 'utf8');

describe('react-loop 完成度校验接线守卫', () => {
  test('① 从 ./completion-verifier.js 引入路由取证器与单子任务注解原语', () => {
    expect(LOOP).toMatch(
      /import\s*\{[^}]*createRoutingEvidenceCollector[^}]*annotateOneSubtaskCompletion[^}]*\}\s*from\s*'\.\/completion-verifier\.js'/,
    );
  });

  // Phase A 非 DOM 取证：路由取证器须注入 execCommandWait 与 getAgentConfig 在线判定；
  // 开关关闭（cvEnabled=false）时 cvGatherEvidence 恒为 null——不变式 1：逐字节回退基线。
  test('①b 路由取证器注入 execWait=getAgentConfig 在线门，且 cvEnabled=false 时为 null', () => {
    expect(LOOP).toMatch(
      /const cvGatherEvidence = cvEnabled \? createRoutingEvidenceCollector\(\{[\s\S]*?execWait: execCommandWait,[\s\S]*?isOnline:[\s\S]*?getAgentConfig\(\)[\s\S]*?\}\) : null;/,
    );
  });

  test('①c 本地 Agent 客户端导入 execCommandWait 与 getAgentConfig', () => {
    expect(LOOP).toMatch(
      /import\s*\{[^}]*execCommandWait[^}]*getAgentConfig[^}]*\}\s*from\s*'\.\/local-agent-client\.js'/,
    );
  });

  // M-new-2：取证挪进 per-subtask onDone——cvEnabled 源于开关，关闭时 onDone 内分支短路（逐字节不变）
  test('②a cvEnabled 由 completionVerification.enabled 派生（关则 false）', () => {
    expect(LOOP).toMatch(
      /const cvEnabled = !!\(reactConfig\.completionVerification && reactConfig\.completionVerification\.enabled\)/,
    );
  });

  test('②b 取证在 onDone 内即时调用，被 if (cvEnabled) 门控（关则短路）', () => {
    expect(LOOP).toMatch(
      /if \(cvEnabled\) \{[\s\S]{0,40}?await annotateOneSubtaskCompletion\(r, subtaskPlan\.subtasks,/,
    );
  });

  // M-new-2：整轮末尾的统一取证块必须已移除（否则时机错位回归）
  test('②c 不再于整轮末尾统一取证（annotateSubtaskCompletion 调用已移除）', () => {
    expect(LOOP).not.toMatch(/annotateSubtaskCompletion\s*\(/);
  });

  // M-new-2：取证置于 checkpoint 落盘之后，进度持久化不被取证往返拖延
  test('③ onDone 内先 saveCheckpointNow 再取证（落盘优先于取证往返）', () => {
    expect(LOOP).toMatch(
      /await saveCheckpointNow\('subtask_completed', true\);[\s\S]{0,500}?if \(cvEnabled\)[\s\S]{0,120}?annotateOneSubtaskCompletion/,
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

  // #11 / M-new-4：onDone 内即时取证同样接上取消 + 整体超时早停。loopTimeout 只在轮首抛错、
  // 从不置 cancelled，故须显式判 getRemainingTime()<=0，否则预算耗尽后仍逐条发消息取证。
  test('#11/M-new-4 onDone 内 annotateOne 注入 shouldStop（取消或整体超时早停）', () => {
    expect(LOOP).toMatch(
      /annotateOneSubtaskCompletion\(r, subtaskPlan\.subtasks,\s*\{[\s\S]*?shouldStop:\s*\(\)\s*=>\s*isCancelled\(tabId\)[\s\S]*?getRemainingTime\(\)\s*<=\s*0/,
    );
  });
});
