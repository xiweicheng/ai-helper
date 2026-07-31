// agent/test/unit/path-security.unit.test.js
// 路径处理纯函数单元测试：覆盖 Windows / Linux / Mac / MSYS 风格路径规整与硬阻止绕过
// 运行：node --test agent/test/unit/path-security.unit.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePathFormat, isHardBlocked } from '../../src/security.js';
import { homedir } from 'os';
import { join } from 'path';

// ==================== normalizePathFormat ====================

describe('normalizePathFormat - Windows 平台 (win32)', () => {
  const P = 'win32';

  test('MSYS 风格路径 /d/Users/foo → D:/Users/foo', () => {
    assert.equal(normalizePathFormat('/d/Users/foo', P), 'D:/Users/foo');
  });

  test('MSYS 风格路径 /c/Windows → C:/Windows', () => {
    assert.equal(normalizePathFormat('/c/Windows', P), 'C:/Windows');
  });

  test('小写盘符 d:/Users/foo → D:/Users/foo（盘符大写统一）', () => {
    assert.equal(normalizePathFormat('d:/Users/foo', P), 'D:/Users/foo');
  });

  test('异常 /C:/Users/foo → C:/Users/foo（前导斜杠盘符规整）', () => {
    assert.equal(normalizePathFormat('/C:/Users/foo', P), 'C:/Users/foo');
  });

  test('反斜杠 D:\\Users\\foo → D:/Users/foo（分隔符统一）', () => {
    assert.equal(normalizePathFormat('D:\\Users\\foo', P), 'D:/Users/foo');
  });

  test('混合分隔符 d:\\Users/foo → D:/Users/foo', () => {
    assert.equal(normalizePathFormat('d:\\Users/foo', P), 'D:/Users/foo');
  });

  test('MSYS + 小写盘符 /d/users/foo → D:/users/foo', () => {
    assert.equal(normalizePathFormat('/d/users/foo', P), 'D:/users/foo');
  });

  test('多段 MSYS 路径 /e/work/proj → E:/work/proj', () => {
    assert.equal(normalizePathFormat('/e/work/proj', P), 'E:/work/proj');
  });

  test('不误伤普通 Unix 路径 /home/user（多字母不当作盘符）', () => {
    assert.equal(normalizePathFormat('/home/user', P), '/home/user');
  });

  test('盘符后直接结尾 /d: → D:', () => {
    assert.equal(normalizePathFormat('/d:', P), 'D:');
  });
});

describe('normalizePathFormat - macOS/Linux 平台', () => {
  test('darwin: MSYS 路径不转换（/d/Users/foo 保持）', () => {
    assert.equal(normalizePathFormat('/d/Users/foo', 'darwin'), '/d/Users/foo');
  });

  test('linux: MSYS 路径不转换', () => {
    assert.equal(normalizePathFormat('/d/Users/foo', 'linux'), '/d/Users/foo');
  });

  test('darwin: 小写盘符不做大写统一（d:/Users 保持）', () => {
    assert.equal(normalizePathFormat('d:/Users/foo', 'darwin'), 'd:/Users/foo');
  });

  test('darwin: 反斜杠仍统一为正斜杠', () => {
    assert.equal(normalizePathFormat('C:\\Users\\foo', 'darwin'), 'C:/Users/foo');
  });

  test('darwin: /C:/Users 仍规整为 C:/Users（平台无关步骤）', () => {
    assert.equal(normalizePathFormat('/C:/Users', 'darwin'), 'C:/Users');
  });

  test('不传平台参数时使用当前平台（macOS 上等同 darwin）', () => {
    assert.equal(normalizePathFormat('/d/Users/foo'), '/d/Users/foo');
  });
});

describe('normalizePathFormat - 边界输入', () => {
  test('空字符串原样返回', () => {
    assert.equal(normalizePathFormat('', 'win32'), '');
  });

  test('null 原样返回', () => {
    assert.equal(normalizePathFormat(null, 'win32'), null);
  });

  test('undefined 原样返回', () => {
    assert.equal(normalizePathFormat(undefined, 'win32'), undefined);
  });

  test('非字符串（数字）原样返回', () => {
    assert.equal(normalizePathFormat(123, 'win32'), 123);
  });

  test('单字符路径不崩溃', () => {
    assert.equal(normalizePathFormat('/', 'win32'), '/');
  });

  test('仅有盘符 C:', () => {
    assert.equal(normalizePathFormat('C:', 'win32'), 'C:');
  });
});

// ==================== isHardBlocked ====================
// HARD_BLOCKED_PATHS 基于 homedir() 生成，测试中用 homedir() 构造对应路径

const AGENT_DIR = join(homedir(), '.ai-helper-agent');
const CONFIG_FILE = join(AGENT_DIR, 'config.json');
const PAIRINGS_FILE = join(AGENT_DIR, 'pairings.json');
const LOGS_DIR = join(AGENT_DIR, 'logs');
const TRASH_DIR = join(AGENT_DIR, '.trash');

describe('isHardBlocked - 敏感文件精确匹配', () => {
  test('config.json 被阻止', () => {
    assert.equal(isHardBlocked(CONFIG_FILE), true);
  });

  test('pairings.json 被阻止', () => {
    assert.equal(isHardBlocked(PAIRINGS_FILE), true);
  });
});

describe('isHardBlocked - 敏感目录前缀匹配', () => {
  test('logs 目录下文件被阻止', () => {
    assert.equal(isHardBlocked(join(LOGS_DIR, '2026-07-31.log')), true);
  });

  test('trash 目录下文件被阻止', () => {
    assert.equal(isHardBlocked(join(TRASH_DIR, '123_abc')), true);
  });
});

describe('isHardBlocked - Windows 大小写绕过修复', () => {
  test('Windows: config.json 的大写变体 .AI-HELPER-AGENT/CONFIG.JSON 被阻止（大小写不敏感）', () => {
    const upperVariant = CONFIG_FILE.toUpperCase();
    assert.equal(isHardBlocked(upperVariant, 'win32'), true);
  });

  test('Windows: 小写变体 .ai-helper-agent/config.json 被阻止', () => {
    const lowerVariant = CONFIG_FILE.toLowerCase();
    assert.equal(isHardBlocked(lowerVariant, 'win32'), true);
  });

  test('Windows: 混合大小写 .Ai-Helper-Agent/Config.Json 被阻止', () => {
    const mixedVariant = CONFIG_FILE.replace(/\.ai-helper-agent/i, '.Ai-Helper-Agent')
      .replace(/config\.json/i, 'Config.Json');
    assert.equal(isHardBlocked(mixedVariant, 'win32'), true);
  });

  test('Windows: logs 目录大写变体 .LOGS/ 下文件被阻止', () => {
    const upperLogsFile = join(LOGS_DIR.toUpperCase(), 'APP.LOG');
    assert.equal(isHardBlocked(upperLogsFile, 'win32'), true);
  });

  test('macOS/Linux: 大小写敏感，大写变体不被阻止（证明修复前 Windows 上存在的问题）', () => {
    const upperVariant = CONFIG_FILE.toUpperCase();
    // 在 macOS/Linux 上是大小写敏感比较，大写不匹配小写 → 返回 false
    // 这正是修复前 Windows 上存在的问题（Windows 文件系统不区分大小写但比较是敏感的）
    assert.equal(isHardBlocked(upperVariant, 'darwin'), false);
    assert.equal(isHardBlocked(upperVariant, 'linux'), false);
  });
});

describe('isHardBlocked - 非敏感路径放行', () => {
  test('工作目录内的普通文件不被阻止', () => {
    assert.equal(isHardBlocked('/tmp/test-file.txt'), false);
  });

  test('用户主目录下的普通文件不被阻止', () => {
    assert.equal(isHardBlocked(join(homedir(), 'documents', 'note.md')), false);
  });

  test('Agent 目录外的同名文件不被误伤', () => {
    // /tmp/.ai-helper-agent/config.json 不应被阻止（不在 AGENT_DIR 下）
    assert.equal(isHardBlocked('/tmp/.ai-helper-agent/config.json'), false);
  });
});
