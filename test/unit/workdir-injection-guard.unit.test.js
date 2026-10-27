// test/unit/workdir-injection-guard.unit.test.js
// 注入即对齐的源码守卫：卡住「提示词路径又回去读全局单例目录」和「子任务/子代理/定时任务漏注入目录」这两类回归
//
// 这些是结构性约束，用行为测试很难覆盖（提示词拼装依赖大量运行时状态），
// 因此直接对源码做断言：改动一旦破坏约定，测试立刻失败并指出该改哪里。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** 读源码并去掉行注释，避免「注释里提到」被误判成「代码里在用」 */
function readCode(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
}

describe('提示词路径禁止读全局单例目录', () => {
  test('utils.js 不再从 state.agentPlatform 取 workdir', () => {
    const code = readCode('src/side_panel/utils.js');
    expect(code).not.toMatch(/agentPlatform\s*\.\s*workdir/);
    expect(code).not.toMatch(/agentPlatform\s*\?\.\s*workdir/);
    // 目录必须由调用方按会话解析后传入
    expect(code).toMatch(/getCommandExecutionEnv\([\w\s,=]*workdir/);
  });

  test('getSystemPrompt 接受 sessionId 并在未显式给目录时按会话解析', () => {
    const code = readCode('src/side_panel/utils.js');
    expect(code).toMatch(/export async function getSystemPrompt\(([^)]*)\)/);
    expect(code).toMatch(/options\.sessionId/);
    expect(code).toMatch(/getEffectiveWorkdir/);
  });
});

describe('三处 getSystemPrompt 调用点必须传目标会话', () => {
  const callSites = [
    'src/side_panel/chat-manager.js',
    'src/side_panel/prompt-manager.js',
    'src/side_panel/index.js',
  ];

  for (const file of callSites) {
    test(`${file} 传 sessionId`, () => {
      const code = readCode(file);
      const calls = code.match(/getSystemPrompt\([^)]*\)/g) || [];
      expect(calls.length).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call, `${file} 里的调用缺少 sessionId: ${call}`).toMatch(/sessionId/);
      }
    });
  }

  test('上下文估算缓存刷新时按会话重建提示词', () => {
    const code = readCode('src/side_panel/context-indicator.js');
    expect(code).toMatch(/refreshContextCaches\(sessionId\s*=\s*null\)/);
    expect(code).toMatch(/getSystemPrompt\(agent,\s*\{\s*sessionId:\s*targetSessionId\s*\}\)/);
    // 会话切换 / 目录切换都要触发重建
    expect(code).toMatch(/addEventListener\('session-switched'/);
    expect(code).toMatch(/addEventListener\('session-workdir-changed'/);
  });
});

describe('后台三条提示词构建路径都注入工作目录', () => {
  test('定时任务提示词', () => {
    const code = readCode('src/background/scheduler.js');
    expect(code).toMatch(/buildSystemPrompt\([^)]*workdir/);
    expect(code).toMatch(/当前工作目录/);
    expect(code).toMatch(/getEffectiveWorkdir/);
  });

  test('子代理派发提示词', () => {
    const code = readCode('src/background/agent-dispatcher.js');
    expect(code).toMatch(/buildSubAgentPrompt\([^)]*workdir/);
    expect(code).toMatch(/Working directory/);
    expect(code).toMatch(/getEffectiveWorkdir/);
  });

  test('ReAct 子任务提示词', () => {
    const code = readCode('src/background/react-loop.js');
    expect(code).toMatch(/subtaskWorkdir/);
    expect(code).toMatch(/Working directory/);
    expect(code).toMatch(/getEffectiveWorkdir/);
  });

  test('ReAct 循环进入/退出时冻结与释放执行目录', () => {
    const code = readCode('src/background/react-loop.js');
    expect(code).toMatch(/beginSessionRun\(sessionId\)/);
    expect(code).toMatch(/endSessionRun\(sessionId\)/);
  });
});

describe('请求链路按会话透传', () => {
  test('local-agent-client 带会话头', () => {
    const code = readCode('src/background/local-agent-client.js');
    expect(code).toMatch(/X-AIH-Session-Id/);
    expect(code).toMatch(/X-AIH-Workdir/);
    expect(code).toMatch(/buildAgentScope/);
  });

  test('tool-executor 的 cwd 按会话收敛并留审计', () => {
    const code = readCode('src/background/tool-executor.js');
    expect(code).toMatch(/convergeSessionCwd/);
    expect(code).toMatch(/resolveScopeCwd/);
    expect(code).toMatch(/cwd_converged/);
    // prototypes 产物固定落代理默认目录，不随会话漂移
    expect(code).toMatch(/getAgentDefaultWorkdir/);
  });

  test('工作目录面板与 $ 选择器按会话解析（缓存键含会话 + 代理）', () => {
    const code = readCode('src/side_panel/workspace-manager.js');
    expect(code).toMatch(/export async function getWorkspaceRoot\(sessionId\)/);
    expect(code).toMatch(/_workspaceRootKey/);
    expect(code).toMatch(/X-AIH-Session-Id/);
  });

  test('队列跨会话接力快照带上目录绑定', () => {
    const code = readCode('src/side_panel/queue-runner.js');
    expect(code).toMatch(/workdir:\s*found\.workdir/);
    expect(code).toMatch(/workdirAgentId:\s*found\.workdirAgentId/);
  });
});

describe('界面：信息带与目录 chip', () => {
  test('信息带容器包住四个成员并含目录 chip', () => {
    const html = readFileSync(join(ROOT, 'side_panel.html'), 'utf-8');
    expect(html).toMatch(/class="input-meta-band"/);
    expect(html).toMatch(/id="workdirTag"/);
    expect(html).toMatch(/id="workdirTagName"/);
    // 四个成员都在信息带内部（顺序：上下文环 → 目录名 → 免责声明 → 模型名）
    const band = html.slice(html.indexOf('input-meta-band'), html.indexOf('id="queueStrip"'));
    expect(band).toMatch(/id="contextUsageIndicator"/);
    expect(band).toMatch(/id="workdirTag"/);
    expect(band).toMatch(/class="input-disclaimer"/);
    expect(band).toMatch(/id="currentModelTag"/);
  });

  test('窄屏降级断点：先压目录名，再隐藏免责声明，最后只留环', () => {
    const css = readFileSync(join(ROOT, 'src/side_panel/styles.css'), 'utf-8');
    expect(css).toMatch(/\.input-meta-band\s*\{[^}]*display:\s*flex/);
    expect(css).toMatch(/@media \(max-width: 520px\)\s*\{\s*\.workdir-tag\s*\{/);
    expect(css).toMatch(/@media \(max-width: 460px\)\s*\{\s*\/\*[^*]*\*\/\s*\.input-disclaimer\s*\{\s*display:\s*none/);
    expect(css).toMatch(/@media \(max-width: 420px\)\s*\{[^}]*\.context-usage-percent\s*\{\s*display:\s*none/);
  });
});
