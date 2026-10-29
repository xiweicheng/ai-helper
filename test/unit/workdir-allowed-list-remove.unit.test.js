// test/unit/workdir-allowed-list-remove.unit.test.js
// 允许目录列表的「移除」语义：列表项不再被当成权限开关。
//
// 回归背景：用户在会话里切到 /B 后，去删列表里的 /A（代理全局默认目录）时被 400 拒绝，
// 提示「不能移除当前工作目录」——但当前会话目录根本不是 /A。三方对「当前」的定义错位：
//   - 弹窗「当前」标记 = /api/status/detail 的 workdir（本会话有效目录）
//   - 代理端移除守卫 = config.workdir（全局默认目录）
// 而 allowedPaths 只是「有效工作目录之外的附加授权」，checkPath 的 0.6 分支对有效工作目录
// 无条件放行、从不查白名单 —— 拦这一下只会让用户删不掉一个"删了也不影响可用性"的项。
// 现在的语义：任何列表项都能移除；默认目录/当前目录用徽标说明「移出后仍可用」。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf-8');

const serverSrc = read('agent', 'src', 'server.js');
const zhLocale = read('agent', 'src', 'locales', 'zh.json');
const enLocale = read('agent', 'src', 'locales', 'en.json');
const panelSrc = read('src', 'side_panel', 'workspace-panel.js');

/** 切换工作目录弹窗里「列表渲染 + 移除动作」那一段 */
const listSegment = panelSrc.slice(
  panelSrc.indexOf('listEl.innerHTML = allowedPaths.map'),
  panelSrc.indexOf('// 列表事件委托')
);
const removeSegment = panelSrc.slice(
  panelSrc.indexOf('async function doRemove(targetPath)'),
  panelSrc.indexOf('// 列表事件委托')
);

describe('代理端：移除允许目录不再拦「默认目录 / 当前目录」', () => {
  test('移除接口不再有 cannotRemoveWorkdir 守卫', () => {
    expect(serverSrc).not.toContain('cannotRemoveWorkdir');
  });

  test('守卫删除处留下了「为什么可以删」的依据（有效工作目录绕过白名单）', () => {
    const idx = serverSrc.indexOf("pathname === '/api/config/allowed-paths/remove'");
    expect(idx).toBeGreaterThan(-1);
    const segment = serverSrc.slice(idx, idx + 2000);
    expect(segment).toMatch(/有效工作目录之外的附加授权/);
    expect(segment).toMatch(/0\.6/);
  });

  test('两种语言的 i18n 都不再残留那条误导文案（键集保持一致）', () => {
    expect(zhLocale).not.toContain('cannotRemoveWorkdir');
    expect(enLocale).not.toContain('cannotRemoveWorkdir');
  });
});

describe('扩展端列表：任何列表项都能移除，默认/当前用徽标解释', () => {
  test('默认目录取值来自 detail.defaultWorkdir（老代理端回落当前目录）', () => {
    expect(panelSrc).toMatch(/const agentDefaultWorkdir = detail\.defaultWorkdir \|\| currentWorkdir;/);
  });

  test('默认目录有自己的徽标，且中英文案都存在', () => {
    expect(listSegment).toMatch(/const isDefault = p === agentDefaultWorkdir;/);
    expect(listSegment).toMatch(/t\('workspace\.defaultTag'\)/);
    // 中文与英文两份文案字典各有一条 defaultTag
    expect(panelSrc.match(/defaultTag: /g)?.length).toBe(2);
  });

  test('移除按钮对所有项都渲染，不再按 isCurrent 二选一（旧写法会让人无路可走）', () => {
    // 旧实现：isCurrent ? 徽标 : 移除按钮 → 当前项没有按钮、默认项有按钮但被 400 拒绝
    expect(listSegment).not.toMatch(/:\s*'<button class="switch-workdir-remove"/);
    // 现在徽标与按钮并存
    expect(listSegment).toMatch(/\$\{isCurrent \? currentBadge : ''\}\$\{isDefault \? defaultBadge : ''\}/);
    expect(listSegment).toMatch(/class="switch-workdir-remove"/);
  });

  test('移除默认/当前目录时确认文案与成功提示都改成「移出后仍可用」', () => {
    expect(removeSegment).toMatch(/const stillUsable = targetPath === agentDefaultWorkdir \|\| targetPath === currentWorkdir;/);
    expect(removeSegment).toMatch(/t\('workspace\.confirmRemoveStillUsable'/);
    expect(removeSegment).toMatch(/t\('workspace\.removedStillUsable'\)/);
    // 普通附加目录仍走原来那套「移除后无法访问」的文案
    expect(removeSegment).toMatch(/t\('workspace\.confirmRemovePath'/);
    expect(removeSegment).toMatch(/t\('workspace\.removedFromAllowed'\)/);
  });
});
