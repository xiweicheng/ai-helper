// @vitest-environment jsdom
// SEC-11 回归守卫：审计日志渲染的用户可控字段必须转义后再插入 innerHTML
//
// 背景（docs/AUDIT_STATUS.md SEC-11）：side_panel/index.js 的 renderAuditLogs 把
// 审计条目拼成 HTML 直接赋给 innerHTML，其中 cat/level/action/details 来自工具调用
// 记录（文件路径 / 命令 / URL 等）。因为渲染发生在扩展页面里，未转义即成 XSS 注入点
// ——注入成功便拿到扩展上下文、能 chrome.runtime.sendMessage 唤起其它 handler。
//
// 两层守卫：
//   1) 源码接线形状：证明 renderAuditLogs 真的把这些字段过 escapeHtml，且旧的裸插值不残留；
//   2) 行为不变量：用真 escapeHtml + 真 innerHTML，证明「转义 → 赋 innerHTML」后注不进元素、
//      显示文本原样保留。renderAuditLogs 是闭包内函数不可导出，故行为层验的是它依赖的语义。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { escapeHtml } from '../../src/side_panel/utils.js';

// jsdom 环境下 import.meta.url 非 file scheme，用 __dirname + resolve（与本仓既有产物级守卫一致）
const SIDE_INDEX = readFileSync(resolve(__dirname, '../../src/side_panel/index.js'), 'utf8');

// 取 renderAuditLogs 的函数体（到下一个函数 showAuditLog 为止）
function auditRenderBody() {
  const start = SIDE_INDEX.indexOf('function renderAuditLogs(');
  const end = SIDE_INDEX.indexOf('function showAuditLog(', start);
  expect(start, '未找到 renderAuditLogs，源码结构变了要同步本守卫').toBeGreaterThan(-1);
  expect(end, '未找到 showAuditLog 边界').toBeGreaterThan(start);
  return SIDE_INDEX.slice(start, end);
}

describe('SEC-11：审计日志字段渲染前转义（源码接线形状）', () => {
  test('index.js 已从 utils 引入 escapeHtml', () => {
    expect(SIDE_INDEX).toMatch(/import \{[^}]*\bescapeHtml\b[^}]*\} from '\.\/utils\.js'/);
  });

  test('cat / level / details 三处赋值都包了 escapeHtml', () => {
    const body = auditRenderBody();
    expect(body).toMatch(/const cat = escapeHtml\(/);
    expect(body).toMatch(/const level = escapeHtml\(/);
    expect(body).toMatch(/const details = escapeHtml\(formatAuditDetails\(entry\)\)/);
  });

  test('action 在模板插值处过 escapeHtml', () => {
    const body = auditRenderBody();
    expect(body).toContain("${escapeHtml(entry.action || '-')}");
  });

  test('旧的裸插值/裸赋值不得复现', () => {
    const body = auditRenderBody();
    // 裸赋值：escapeHtml 直接接在 `= ` 后，不应有 `const cat = CATEGORY_LABELS_MAP...`
    expect(body).not.toContain("const cat = CATEGORY_LABELS_MAP[entry.category] || entry.category || '-';");
    expect(body).not.toContain("const details = formatAuditDetails(entry);");
    // 裸插值：`${entry.action || '-'}` 与 `${cat}`（未转义版本）不应存在
    expect(body).not.toContain("${entry.action || '-'}");
  });
});

describe('SEC-11：转义 → innerHTML 的安全不变量（真 escapeHtml 驱动）', () => {
  const PAYLOADS = [
    '<img src=x onerror="alert(1)">',
    '<script>alert(2)</script>',
    '<svg><script href="data:,alert(3)"/></svg>',
    '</span><span class="pwned">x</span>',
    'a & b "c" \'d\'',
  ];

  for (const payload of PAYLOADS) {
    test(`注不进元素且显示文本原样：${JSON.stringify(payload).slice(0, 40)}`, () => {
      const container = document.createElement('div');
      // 复刻 renderAuditLogs 的插值位（元素文本位，非属性位）
      container.innerHTML =
        `<div class="audit-entry"><span class="audit-action">${escapeHtml(payload || '-')}</span></div>`;

      // 关键：payload 里的标签不得被解析成真元素
      expect(container.querySelectorAll('img, script, svg').length, `注入了真元素：${container.innerHTML}`).toBe(0);
      // 显示文本必须与原文一致（转义不吞字、也不改变用户可见内容）
      expect(container.querySelector('.audit-action').textContent).toBe(payload);
    });
  }

  test('对照：不转义时 payload 确实会注入（证明守卫有效）', () => {
    const container = document.createElement('div');
    container.innerHTML = `<span class="audit-action">${'<img src=x onerror="alert(1)">'}</span>`;
    expect(container.querySelectorAll('img').length).toBe(1);
  });

  test('空字段仍按占位符 - 显示（不因子空转义丢语义）', () => {
    expect(escapeHtml('' || '-')).toBe('-');
  });
});
