// test/unit/workdir-switch-confirm.unit.test.js
// 两件事的回归护栏（都来自用户实际反馈）：
//  ① 在会话里切换工作目录时被提示「当前目录不在允许的路径之内」——
//     但会话级绑定只写会话注册表（session-workdirs.json），从不写 allowedPaths，
//     会话目录在 checkPath 的 0.6 分支本来就被无条件放行。这条提示纯属误导，
//     只有「会改全局默认目录」的切换才需要它。
//  ② 想设代理默认目录只能在输入框里填路径 + 勾选，从上面的目录列表点一项无效
//     （勾选其实已经对列表点击生效，缺的是「当前项也能提为默认」与成功反馈）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf-8');

const serverSrc = read('agent', 'src', 'server.js');
const panelSrc = read('src', 'side_panel', 'workspace-panel.js');
const zhLocale = read('src', 'shared', 'locales', 'zh.js');
const enLocale = read('src', 'shared', 'locales', 'en.js');

/** 按起止锚点切片，任一锚点缺失直接测试失败（避免 slice(-1) 静默切成空串） */
const slice = (src, start, end) => {
  const a = src.indexOf(start);
  const b = src.indexOf(end);
  if (a < 0) throw new Error(`起点锚点未找到: ${start}`);
  if (b <= a) throw new Error(`终点锚点未找到或位置在起点之前: ${end}`);
  return src.slice(a, b);
};

describe('代理端：会话级切换只写会话注册表，不碰 allowedPaths', () => {
  const endpoint = slice(serverSrc, "pathname === '/api/config/workdir'", "pathname === '/api/config/workdir/unbind'");
  const scopeMark = endpoint.indexOf("scope: 'session'");
  /** 会话分支 = 从入口到「scope: 'session'」的返回 */
  const sessionBranch = endpoint.slice(0, scopeMark);
  /** 全局分支 = 会话返回之后的默认目录持久化 */
  const globalBranch = endpoint.slice(scopeMark);

  test('会话分支只 bindSessionWorkdir，没有往 allowedPaths 追加入授权', () => {
    expect(sessionBranch).toMatch(/bindSessionWorkdir\(targetSessionId, resolvedWorkdir\)/);
    // 注释里允许提到「不动 allowedPaths」，但不能有任何读写（不带 = 的提及不算）
    expect(sessionBranch).not.toMatch(/allowedPaths\s*[:=]/);
    expect(sessionBranch).not.toMatch(/saveConfig/);
  });

  test('只有全局分支才 workdir + allowedPaths 一起落盘（确认文案说的是它）', () => {
    expect(globalBranch).toMatch(/updatedConfig\.workdir = resolvedWorkdir;/);
    expect(globalBranch).toMatch(/updatedConfig\.allowedPaths = /);
    expect(globalBranch).toMatch(/await saveConfig\(updatedConfig\);/);
  });
});

describe('扩展端：只有「会改全局默认目录」的切换才提示不在允许列表', () => {
  const doSwitchSeg = slice(panelSrc, 'async function doSwitch(targetPath)', 'if (restoreBtn) {');

  test('门控条件带上 willChangeGlobalDefault（会话级切换不再被拦）', () => {
    expect(doSwitchSeg).toMatch(/if \(!isAllowed && willChangeGlobalDefault\) \{/);
    // 旧写法（只要不在允许列表就弹）必须彻底消失
    expect(doSwitchSeg).not.toMatch(/if \(!isAllowed\) \{/);
  });

  test('willChangeGlobalDefault = 旧代理端回落全局 或 勾了设为默认', () => {
    expect(doSwitchSeg).toMatch(/const setAsDefault = !!\(setDefaultCheckbox && setDefaultCheckbox\.checked\);/);
    expect(doSwitchSeg).toMatch(/const effectiveSessionId = sessionSupported \? sessionId : null;/);
    expect(doSwitchSeg).toMatch(/const willChangeGlobalDefault = !effectiveSessionId \|\| setAsDefault;/);
  });

  test('确认文案改成「本次会设为代理默认目录」，旧误导文案已删除', () => {
    expect(panelSrc).not.toContain('confirmSwitchToNew:');
    expect(panelSrc).toMatch(/confirmSwitchToNewDefault: '该路径不在允许列表内。本次会把它设为代理默认目录/);
    expect(panelSrc).toMatch(/confirmSwitchToNewDefault: 'This path is not in the allowed list\. It will become the agent default/);
    // 中/英各一条文案 + 唯一一处调用（旧 key 不得残留第二处调用点）
    expect(panelSrc.match(/confirmSwitchToNewDefault/g)?.length).toBe(3);
  });
});

describe('扩展端：「设为默认目录」勾选对列表项生效', () => {
  const clickSeg = slice(panelSrc, 'const canPromoteCurrent = (p) => {', 'async function doSwitch(targetPath)');

  test('点列表项与点「切换」按钮共用 doSwitch（勾选对两者同等生效）', () => {
    expect(clickSeg).toMatch(/doSwitch\(item\.dataset\.path\);/);
    expect(panelSrc).toMatch(/confirmBtn\.addEventListener\('click', \(\) => doSwitch\(manualInput\.value\)\);/);
  });

  test('「当前」项不再被一刀切禁点，勾选后可提为默认', () => {
    expect(clickSeg).not.toMatch(/\.switch-workdir-item:not\(\.current\)/);
    expect(clickSeg).toMatch(/if \(item\.classList\.contains\('current'\) && !canPromoteCurrent\(item\.dataset\.path\)\) return;/);
    expect(clickSeg).toMatch(/const canPromoteCurrent = \(p\) => \{/);
  });

  test('当前项提为默认走全局切换 + 成功提示（不再点了没反应）', () => {
    const promoteSeg = slice(panelSrc, 'async function performSetAgentDefault(path)', 'async function performSwitchWorkdir(newWorkdir');
    expect(promoteSeg).toMatch(/switchWorkspace\(path, \{ sessionId: null \}\)/);
    expect(promoteSeg).toMatch(/await syncAgentDefaultWorkdirCache\(result\.workdir\);/);
    expect(promoteSeg).toMatch(/t\('workspace\.setAsDefaultDone'/);
    // 已在本目录且勾了设为默认 → 直接走提为默认，而不是「该目录已是当前工作目录」后收场
    expect(doSwitchOrDialog(panelSrc)).toMatch(/if \(setAsDefault && !isSamePath\(targetPath, agentDefaultWorkdir\)\) \{[\s\S]{0,200}performSetAgentDefault\(targetPath\)/);
  });
});

/** doSwitch 里「已在本目录」的分支（含勾选后提为默认的出口） */
function doSwitchOrDialog(src) {
  return slice(src, 'async function doSwitch(targetPath)', 'if (restoreBtn) {');
}

describe('弹窗列表把「本会话目录 / 代理默认目录」也展示出来', () => {
  const composeSeg = slice(panelSrc, 'const computeDisplayPaths = () => {', '// 浏览按钮仅在回环');
  const listSeg = slice(panelSrc, 'function renderList()', '// 移除允许目录');

  test('展示列表 = 白名单 ∪ 默认目录 ∪ 本会话有效目录（切到列表外目录后仍看得见「当前」）', () => {
    expect(composeSeg).toMatch(/const merged = \[\.\.\.allowedPaths\];/);
    expect(composeSeg).toMatch(/push\(agentDefaultWorkdir\);/);
    expect(composeSeg).toMatch(/push\(currentWorkdir\);/);
    expect(listSeg).toMatch(/listEl\.innerHTML = displayPaths\.map/);
    expect(listSeg).toMatch(/if \(!displayPaths\.length\)/);
  });

  test('合并与判重都走跨平台路径比较（大小写 / 分隔符不敏感）', () => {
    expect(panelSrc).toMatch(/const samePathAs = \(a, b\) =>/);
    expect(composeSeg).toMatch(/merged\.some\(\(x\) => samePathAs\(x, p\)\)/);
    expect(listSeg).toMatch(/const isCurrent = samePathAs\(p, currentWorkdir\);/);
  });

  test('勾选「设为默认目录」后，「当前」项光标跟随变成可点（否则用户看不出能点）', () => {
    expect(panelSrc).toMatch(/setDefaultCheckbox\.addEventListener\('change', \(\) => \{/);
    expect(panelSrc).toMatch(/el\.style\.cursor = canPromoteCurrent\(el\.dataset\.path\) \? 'pointer' : 'default';/);
  });
});

describe('扩展端：勾选后的成功反馈与默认目录缓存同步', () => {
  const performSeg = slice(panelSrc, 'async function performSwitchWorkdir(newWorkdir', 'async function performRestoreDefaultWorkdir');

  test('勾选并在全局侧生效时，toast 明确说「并设为代理默认目录」', () => {
    expect(performSeg).toMatch(/let defaultApplied = false;/);
    expect(performSeg).toMatch(/if \(defResult\.success\) defaultApplied = true;/);
    expect(performSeg).toMatch(/defaultApplied\s*\n?\s*\?\s*t\('workspace\.switchedToAndSetDefault'/);
    expect(panelSrc).toMatch(/switchedToAndSetDefault: '已切换到: \{path\}，并设为代理默认目录'/);
    expect(panelSrc).toMatch(/switchedToAndSetDefault: 'Switched to: \{path\} \(set as agent default\)'/);
  });

  test('默认目录缓存只有一处写入口（会话级切换不会串到别的会话）', () => {
    expect(panelSrc.match(/state\.defaultWorkdir = /g)?.length).toBe(1);
    expect(panelSrc).toMatch(/async function syncAgentDefaultWorkdirCache\(workdir\)/);
    expect(performSeg).toMatch(/await syncAgentDefaultWorkdirCache\(result\.workdir\);/);
  });

  test('复选框带 tooltip，两语言都有该提示文案', () => {
    expect(panelSrc).toMatch(/title="\$\{t\('workdirTag\.setAsAgentDefaultHint'\)\}"/);
    expect(zhLocale).toContain('setAsAgentDefaultHint:');
    expect(enLocale).toContain('setAsAgentDefaultHint:');
  });
});
