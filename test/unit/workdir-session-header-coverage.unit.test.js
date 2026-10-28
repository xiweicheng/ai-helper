// test/unit/workdir-session-header-coverage.unit.test.js
// 会话头覆盖守卫：代理端所有目录类端点都按「会话有效目录」做 checkPath，
// 凡漏带 X-AIH-Session-Id 的请求，在会话绑定到非默认目录后会退化成 403
// （上传 / 删除 / 预览 / 下载全中），附件上传更会落到错误的目录。
//
// 漏水点全部集中在「不能走 agentRequest」的通道（stream / blob / XHR / multipart）：
// 那里要手工拼 headers，一不留神就只写了 Authorization。行为测试需要真实 MV3 +
// 绑定会话才能覆盖，成本高，因此这里用源码守卫把结构约束卡住。
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

/** 统计 needle 出现次数 */
function countOf(code, needle) {
  return code.split(needle).length - 1;
}

/** 断言 needle 的每一处出现，其后 window 字符内都带有 marker */
function expectEveryCallHas(code, needle, marker, windowSize = 400) {
  let idx = 0;
  let seen = 0;
  while (true) {
    idx = code.indexOf(needle, idx);
    if (idx === -1) break;
    seen += 1;
    expect(
      code.slice(idx, idx + windowSize),
      `${needle} 第 ${seen} 处调用没有走 ${marker}`,
    ).toContain(marker);
    idx += needle.length;
  }
  expect(seen, `源码里找不到 ${needle}`).toBeGreaterThan(0);
  return seen;
}

describe('文件管理器：目录类请求统一走 buildAgentHeaders', () => {
  test('workspace-manager 暴露唯一拼头入口，且默认按面板当前会话解析', () => {
    const code = readCode('src/side_panel/workspace-manager.js');
    expect(code).toMatch(/export function buildAgentHeaders\(config,\s*sessionId\s*=\s*currentSessionId\(\)\)/);
    expect(code).toMatch(/X-AIH-Session-Id/);
  });

  test('四个流式下载（blob 通道）都带会话头', () => {
    const code = readCode('src/side_panel/workspace-manager.js');
    const hits = expectEveryCallHas(code, '/api/fs/download-stream', 'buildAgentHeaders');
    expect(hits, '单文件/带进度/批量/批量带进度 四处都要带').toBe(4);
  });

  test('workspace-manager 只剩 3 处裸 Authorization（拼头入口 + 家目录 + 目录选择框）', () => {
    // 新加目录类请求必须走 buildAgentHeaders，手拼头会让本断言失败
    const code = readCode('src/side_panel/workspace-manager.js');
    expect(countOf(code, "'Authorization'")).toBe(3);
  });

  test('workspace-panel 不再手拼 Authorization，所有 /api/ 调用都走 buildAgentHeaders', () => {
    const code = readCode('src/side_panel/workspace-panel.js');
    expect(countOf(code, "'Authorization'")).toBe(0);
    // 拖拽上传 / 删除 / 预览字节 / xlsx 预览 / 导出图片 共 6 处
    expect(expectEveryCallHas(code, '/api/', 'buildAgentHeaders')).toBe(6);
  });

  test('XHR 拖拽上传按拼头入口逐个设置请求头（含会话头）', () => {
    const code = readCode('src/side_panel/workspace-panel.js');
    expect(code).toMatch(/Object\.entries\(buildAgentHeaders\(config\)\)/);
    expect(code).not.toMatch(/setRequestHeader\('Authorization'/);
  });
});

describe('附件链路：上传与抽图必须落在同一会话目录', () => {
  test('file-extract 的 sessionHeaders 按当前会话拼头', () => {
    const code = readCode('src/side_panel/file-extract.js');
    expect(code).toMatch(/function sessionHeaders\(token\)/);
    expect(code).toMatch(/state\.activeSessionId/);
    // 只有 helper 自己可以说 Authorization
    expect(countOf(code, "'Authorization'")).toBe(1);
  });

  test('上传 / 抽图 / 取图三处都带会话头', () => {
    const code = readCode('src/side_panel/file-extract.js');
    expect(code).toMatch(/headers:\s*sessionHeaders\(agent\.token\)/);
    // agentPostToActive + 图片下载：同一个 JSON 头写法，必须成对出现
    expect(
      countOf(code, "headers: { 'Content-Type': 'application/json', ...sessionHeaders(agent.token) }"),
    ).toBe(2);
  });
});

describe('background 侧不留「无会话」的上传死代码', () => {
  test('local-agent-client 不再自带 /api/files/upload', () => {
    // 上传属于面板侧能力；background 版本曾把文件写进全局默认目录且无人调用
    const code = readCode('src/background/local-agent-client.js');
    expect(code).not.toContain('/api/files/upload');
    expect(code).not.toMatch(/async function uploadFile\(/);
  });

  test('只有 file-extract 调 /api/files/upload，且带会话头', () => {
    const code = readCode('src/side_panel/file-extract.js');
    const idx = code.indexOf('/api/files/upload');
    expect(idx).toBeGreaterThan(-1);
    expect(code.slice(idx, idx + 200)).toContain('sessionHeaders');
  });
});
