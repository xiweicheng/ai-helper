// agent/src/security.js - 安全管控：文件沙箱 + 命令分级
import { resolve, normalize, sep, isAbsolute, join, dirname } from 'path';
import { realpath } from 'fs/promises';
import { homedir, platform } from 'os';
import { loadConfig, MEMORY_DIR } from './config.js';
import { t as translate } from './i18n.js';

// 默认使用 zh 语言（独立调用场景，如单元测试）；server.js 调用时会传入 req 的 lang
let currentLang = 'zh';

/**
 * 设置 security 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setSecurityLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 翻译辅助：使用当前模块语言或传入的 t 函数
 * @param {string} key - 翻译 key
 * @param {object} [params] - 插值参数
 * @param {Function} [tFn] - 可选的 t 函数（优先使用）
 * @returns {string}
 */
function tr(key, params, tFn) {
  if (typeof tFn === 'function') return tFn(key, params);
  return translate(currentLang, key, params);
}

const isWin32 = platform() === 'win32';

/**
 * 路径格式规整（跨平台）
 * @param {string} pathStr - 待规整的路径
 * @param {string} [platformOverride] - 平台覆盖（'win32' | 'darwin' | 'linux'），用于单元测试 mock；
 *   不传则使用当前运行平台 os.platform()
 * @returns {string} 规整后的路径
 */
function normalizePathFormat(pathStr, platformOverride) {
  if (!pathStr || typeof pathStr !== 'string') return pathStr;
  const isWin = platformOverride !== undefined ? platformOverride === 'win32' : isWin32;
  // 1. 把异常的 "/C:/" 形式（带前导斜杠的盘符）规整为 "C:/"
  //    仅匹配 /<字母>:/ ，不会误伤 /home/ 等普通路径段
  pathStr = pathStr.replace(/\/([a-zA-Z]):(\/|$)/g, '$1:$2');
  // 2. MSYS/Git Bash 风格路径：/d/Users/... → D:/Users/...
  //    前导 / + 单字母盘符 + / ，无冒号，是 MSYS 特有的挂载点表示法
  if (isWin) {
    pathStr = pathStr.replace(/^\/([a-zA-Z])\//, '$1:/');
  }
  // 3. 统一为正斜杠（path.resolve/normalize 在所有平台都能正确处理正斜杠并归一化到平台分隔符）
  pathStr = pathStr.replace(/\\/g, '/');
  // 4. Windows 盘符统一为大写：d:/ → D:/
  //    path.resolve 保留盘符原始大小写，而白名单前缀比较是大小写敏感的字符串比较，
  //    小写盘符路径与大写盘符白名单前缀比较会失败（d:\Users\.startsWith(D:\Users\) → false）
  if (isWin) {
    pathStr = pathStr.replace(/^([a-zA-Z]):/, m => m.toUpperCase());
  }
  return pathStr;
}

// ==================== 硬阻止目录（任何情况下都不可访问） ====================

const AGENT_DIR = join(homedir(), '.ai-helper-agent');

/** 核心敏感文件/目录（硬阻止，不可绕过）。其他子目录（如 workspace）由白名单控制。 */
const HARD_BLOCKED_PATHS = [
  join(AGENT_DIR, 'config.json'),     // 代理配置文件
  join(AGENT_DIR, 'pairings.json'),   // 配对记录
  join(AGENT_DIR, 'mcp_servers.json'),// MCP 服务器配置
  join(AGENT_DIR, 'logs') + sep,      // 日志目录
  join(AGENT_DIR, '.trash') + sep,    // 回收站目录（通过 /api/trash 端点管理）
  join(AGENT_DIR, 'builtin_skills_state.json'), // 内置技能状态
  join(AGENT_DIR, 'disabled_skills.json'),      // 停用技能状态
];

/**
 * 检查路径是否命中核心敏感文件
 * 注意：Windows 文件系统不区分大小写，必须做大小写不敏感比较，
 *       否则 .AI-HELPER-AGENT/config.JSON 等大小写变换可绕过硬阻止
 */
function isHardBlocked(normalizedPath, platformOverride) {
  const isWin = platformOverride !== undefined ? platformOverride === 'win32' : isWin32;
  const cmpPath = isWin ? normalizedPath.toLowerCase() : normalizedPath;
  for (const blocked of HARD_BLOCKED_PATHS) {
    const cmpBlocked = isWin ? blocked.toLowerCase() : blocked;
    if (blocked.endsWith(sep)) {
      // 目录：检查是否在该目录下
      if (cmpPath.startsWith(cmpBlocked) || cmpPath === cmpBlocked.slice(0, -1)) {
        return true;
      }
    } else {
      // 文件：精确匹配
      if (cmpPath === cmpBlocked) {
        return true;
      }
    }
  }
  return false;
}

/**
 * 检查路径是否在白名单内
 * 使用 realpath 防止符号链接绕过
 * @param {string} pathStr - 待检查的路径
 * @param {Function} [tFn] - 可选的翻译函数（由 server.js 传入）
 * @returns {{ allowed: boolean, reason?: string, resolved?: string }}
 */
async function checkPath(pathStr, tFn) {
  if (!pathStr || typeof pathStr !== 'string') {
    return { allowed: false, reason: tr('security.pathInvalid', undefined, tFn) };
  }

  // 展开 ~ 到用户主目录（扩展端无法知道 Agent 所在机器的 home 路径）
  if (pathStr === '~') {
    pathStr = homedir();
  } else if (pathStr.startsWith('~/') || pathStr.startsWith('~\\')) {
    // Windows 用户可能输入 ~\dir 形式；反斜杠在后续 normalizePathFormat 统一处理
    pathStr = join(homedir(), pathStr.slice(2));
  }

  try {
    const config = loadConfig();

    const normalizedPathStr = normalizePathFormat(pathStr);
    const normalizedWorkdir = normalizePathFormat(config.workdir);

    const resolved = isAbsolute(normalizedPathStr) ? resolve(normalizedPathStr) : resolve(normalizedWorkdir, normalizedPathStr);
    const normalized = normalize(resolved);

    // 0. 硬阻止检查（优先级最高，不可绕过）
    if (isHardBlocked(normalized)) {
      return { allowed: false, reason: tr('security.forbiddenAgentFile', undefined, tFn) };
    }

    // 0.5. 系统目录白名单：记忆存储目录（Agent 内部管理，可读写）
    const memoryPrefix = normalize(join(MEMORY_DIR, sep));
    if (normalized.startsWith(memoryPrefix) || normalized === normalize(MEMORY_DIR)) {
      return { allowed: true, resolved: normalized };
    }

    // 0.6. 工作目录永远放行（不受 allowedPaths 配置控制）
    //      workdir 是用户当前选定的操作目录，必须始终可访问，即使未在 allowedPaths 中也不应被拦截
    if (normalizedWorkdir) {
      const workdirResolved = resolve(normalizedWorkdir);
      const workdirPrefix = workdirResolved.endsWith(sep) ? workdirResolved : workdirResolved + sep;
      if (normalized.startsWith(workdirPrefix) || normalized === workdirResolved) {
        // realpath 硬阻止检查：防止通过 workdir 内的符号链接绕过到代理系统文件
        try {
          const realPath = await realpath(resolved);
          if (isHardBlocked(realPath)) {
            return { allowed: false, reason: tr('security.forbiddenAgentFile', undefined, tFn) };
          }
        } catch (err) {
          if (err.code !== 'ENOENT') {
            return { allowed: false, reason: tr('security.cannotResolvePath', { message: err.message }, tFn) };
          }
          // ENOENT：路径尚不存在（如待创建的文件），无法通过符号链接绕过，放行
        }
        return { allowed: true, resolved: normalized };
      }
    }

    const allowedPaths = config.allowedPaths.length > 0 ? config.allowedPaths.map(p => normalizePathFormat(p)) : [normalizedWorkdir];

    // 先做前缀检查（快速路径，兼容 Windows/Unix）
    let prefixMatch = false;
    for (const allowed of allowedPaths) {
      const allowedResolved = resolve(allowed);
      const prefix = allowedResolved.endsWith(sep) ? allowedResolved : allowedResolved + sep;
      if (normalized.startsWith(prefix) || normalized === allowedResolved) {
        prefixMatch = true;
        break;
      }
    }
    if (!prefixMatch) {
      return { allowed: false, reason: tr('security.pathNotInAllowedDir', undefined, tFn) };
    }

    // realpath 校验：防止符号链接绕过
    let realPath;
    try {
      realPath = await realpath(resolved);
    } catch (err) {
      if (err.code === 'ENOENT') {
        let existing = resolved;
        while (true) {
          const parent = dirname(existing);
          if (parent === existing) {
            break;
          }
          try {
            realPath = await realpath(parent) + sep + normalized.slice(resolve(parent).length).replace(/^[/\\]/, '');
            break;
          } catch (parentErr) {
            if (parentErr.code === 'ENOENT') {
              existing = parent;
              continue;
            }
            return { allowed: false, reason: tr('security.cannotResolvePath', { message: parentErr.message }, tFn) };
          }
        }
        if (!realPath) {
          return { allowed: false, reason: tr('security.pathCheckError', { message: err.message }, tFn) };
        }
      } else {
        return { allowed: false, reason: tr('security.cannotResolvePath', { message: err.message }, tFn) };
      }
    }

    // 对 realPath 做硬阻止检查（防止通过符号链接绕过）
    if (isHardBlocked(realPath)) {
      return { allowed: false, reason: tr('security.forbiddenAgentFile', undefined, tFn) };
    }

    // 对 realPath 再次做前缀检查
    for (const allowed of allowedPaths) {
      const allowedResolved = resolve(allowed);
      const prefix = allowedResolved.endsWith(sep) ? allowedResolved : allowedResolved + sep;
      if (realPath.startsWith(prefix) || realPath === allowedResolved) {
        return { allowed: true, resolved: normalized };
      }
    }

    return { allowed: false, reason: tr('security.pathOutOfRange', undefined, tFn) };
  } catch (err) {
    return { allowed: false, reason: tr('security.pathCheckError', { message: err.message }, tFn) };
  }
}

// ==================== 命令分级管控 ====================

const BLACKLIST_PATTERNS = [
  // 高危写入系统目录
  /^\s*rm\s+-rf\s+\/(\*|\s|$)/,
  /^\s*rm\s+-rf\s+~(\*|\s|$)/,
  /^\s*rm\s+-rf\s+\/dev\//,
  /^\s*rm\s+-rf\s+\/etc\//,
  /^\s*rm\s+-rf\s+\/proc\//,
  /^\s*rm\s+-rf\s+\/sys\//,
  // 格式化/磁盘破坏
  /^\s*mkfs\./,
  /^\s*dd\s+if=.*of=\/dev\//,
  /^\s*>\s*\/dev\/sd/,
  // 覆盖系统文件
  /^\s*>\s*\/etc\/passwd/,
  /^\s*>\s*\/etc\/shadow/,
  /^\s*>\s*\/etc\/sudoers/,
  // fork bomb
  /:\(\)\s*{\s*:\s*\|\s*:\s*&\s*};\s*:/,
  // shebang 直接执行（出现在命令开头）
  /^\s*#!/,
  // 恶意管道执行
  /(curl|wget|lynx|links)\s+.*\|\s*(ba)?sh/,
  /git\s+clone\s+.*\|\s*(ba)?sh/,
  // 修改根目录权限
  /^\s*chmod\s+(-R\s+)?(0?777|a\+rwx)\s+\//,
  /^\s*chown\s+-R\s+\S+\s+\//,
  // Shell 命令替换注入 — 允许 echo/printf 等纯输出命令中使用
  /^\s*(?!(echo|printf|cat|head|tail|wc|ls|pwd|date|whoami|hostname|uname|id|env|printenv|which|type)\s).*`[^`]*`/,
  /^\s*(?!(echo|printf|cat|head|tail|wc|ls|pwd|date|whoami|hostname|uname|id|env|printenv|which|type)\s).*\$\s*\([^)]*\)/,
  // Windows 高危破坏性命令（大小写不敏感）
  /^\s*format\s+[a-zA-Z]:/i,                                                          // 格式化磁盘
  /^\s*diskpart\b/i,                                                                  // 磁盘分区操作
  /^\s*>\s*[a-zA-Z]:[\\\/][^\n]*[\\\/]Windows[\\\/]System32[\\\/]config[\\\/](SAM|SYSTEM|SECURITY|DEFAULT|NTUSER)/i, // 覆盖注册表蜂巢
  /^\s*>\s*[a-zA-Z]:[\\\/][^\n]*[\\\/]drivers[\\\/]etc[\\\/]hosts/i,                  // 覆盖 hosts
];
const SCRIPT_EXTENSIONS = '(sh|bash|zsh|py|js|mjs|rb|pl|php|lua)';
const SCRIPT_INTERPRETERS = '(bash|sh|zsh|python3?|node|ruby|perl|php|lua)';

const GRAYLIST_PATTERNS = [
  { pattern: /^\s*sudo\s/, reasonKey: 'security.cmdSudo' },
  // sudo 的同类替代品：不单独列进名单就成一个免费的提权绕道
  { pattern: /^\s*doas\s/, reasonKey: 'security.cmdDoas' },
  { pattern: /^\s*runas\s+\/user:/i, reasonKey: 'security.cmdDoas' },
  { pattern: /npm\s+(i|install)\s+-g\s/, reasonKey: 'security.cmdNpmGlobal' },
  { pattern: /pip\s+(install|uninstall)\s/, reasonKey: 'security.cmdPip' },
  { pattern: /^\s*chmod\s+-R\s+777\s/, reasonKey: 'security.cmdChmod777' },
  { pattern: /^\s*rm\s+-rf\s+(?!\/|~)/, reasonKey: 'security.cmdRmrf' },
  { pattern: /git\s+push\s+(-f|--force)/, reasonKey: 'security.cmdGitForcePush' },
  { pattern: /^\s*(shutdown|reboot|halt|poweroff)/, reasonKey: 'security.cmdShutdown' },
  { pattern: /^\s*>\s*\/etc\/hosts/, reasonKey: 'security.cmdHosts' },
  { pattern: /\beval\s+/, reasonKey: 'security.cmdEval' },

  // 脚本解释器执行外部文件
  { pattern: new RegExp(`^\\s*${SCRIPT_INTERPRETERS}(\\s+[^-]\\S*)*\\s+\\S*\\.${SCRIPT_EXTENSIONS}\\b`), reasonKey: 'security.cmdExecExternalScript' },
  // 直接执行脚本
  { pattern: new RegExp(`^\\s*\\.?\\/\\S*\\.${SCRIPT_EXTENSIONS}\\b`), reasonKey: 'security.cmdExecScriptDirectly' },
  // chmod +x 授予执行权限
  { pattern: /^\s*chmod\s+(\+x|a\+x|u\+x|g\+x|o\+x|[0-7]*[1-7][0-9][0-9])\s/, reasonKey: 'security.cmdChmodExec' },

  // Windows 命令（大小写不敏感）
  { pattern: /^\s*rmdir?\s+\/s\b/i, reasonKey: 'security.cmdRmdirS' },
  { pattern: /^\s*(del|erase)\s+\/[a-zA-Z]*f/i, reasonKey: 'security.cmdDelF' },
  { pattern: /^\s*icacls\b/i, reasonKey: 'security.cmdIcacls' },
  { pattern: /^\s*takeown\b/i, reasonKey: 'security.cmdTakeown' },
  { pattern: /^\s*reg\s+(add|delete|import|load|restore)\b/i, reasonKey: 'security.cmdReg' },
  { pattern: /^\s*net\s+(user|localgroup)\b/i, reasonKey: 'security.cmdNet' },
  { pattern: /^\s*sc\s+(stop|delete|config)\b/i, reasonKey: 'security.cmdSc' },
  { pattern: /^\s*taskkill\s+\/[a-zA-Z]*f/i, reasonKey: 'security.cmdTaskkillF' },
  // PowerShell 侧的破坏性 cmdlet 与 base64 内联载荷：
  // -EncodedCommand 的内容静态看不出是什么，安全网关上“看不出来”只能当成需要确认
  { pattern: /\bremove-item\b[\s\S]*-(?:recurse|force)/i, reasonKey: 'security.cmdPsRemoveItem' },
  { pattern: /^\s*(?:powershell|pwsh)\b.*\s-(?:e|enc|encodedcommand)\s/i, reasonKey: 'security.cmdPsEncoded' },
];

/**
 * 链式命令拆分：黑白名单绝大多数模式锚定命令串开头，而模型很习惯写
 * `cd /x && sudo rm -rf y`、`echo pw | sudo -S apt install`、`bash -c "sudo ..."`，
 * 只检查整串开头会让后面几段完全绕过灰名单（用户表现为“点过一次后此后再也不弹框”）。
 * 这里把一条命令拆成逐个“子命令范围”，逐段比对，只增不减判定强度。
 * 已知能力边界：变量间接执行（`S=rm; $S -rf x`）无法静态判定，不在本层解决。
 */
// 会把内联脚本作为参数传入的解释器（只对它们解开内联载荷，避免 grep -c 之类误报）
const INLINE_EXEC_INTERPRETERS = /^(?:\.\/|\/usr\/(?:local\/)?bin\/)?(?:sh|bash|zsh|dash|ksh|fish|powershell|pwsh|cmd|python[0-9.]*|node|perl|ruby|php|lua)\b/i;
const INLINE_EXEC_FLAG = /\s-(?:c|e)\s+(.+)$/is;
// Windows 侧的内联载荷：cmd 用 /c /k，PowerShell 用 -Command 与 -EncodedCommand（base64/UTF-16LE）
const CMD_SLASH_FLAG = /\s\/([ck])\s+(.+)$/is;
const PS_INLINE_FLAG = /\s-(?:command|encodedcommand|enc)\s+(.+)$/i;
const PS_ENCODED_FLAG = /-(?:encodedcommand|enc)\b/i;
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;
// 前缀包装器：仅当整段以它们开头时才剥离（否则会把普通命令的参数误当成命令）
const COMMAND_WRAPPERS = /^(?:nohup|time|timeout|nice|stdbuf|env|exec|command|xargs)\b/i;
const OPTION_OR_SIZE_TOKEN = /^(?:[-+]|\d+(?:\.\d+)?[a-z%]*$)/i;

/** 去掉包裹引号 */
function unquote(text) {
  const s = text.trim();
  if (s.length >= 2 && ((s[0] === '"' && s.endsWith('"')) || (s[0] === "'" && s.endsWith("'")))) {
    return s.slice(1, -1);
  }
  return s;
}

/** 去掉开头的 `KEY=VAL` 环变量前缀（`FOO=1 sudo xxx` 依旧要看 sudo） */
function stripEnvAssignments(segment) {
  const tokens = segment.trim().split(/\s+/);
  let i = 0;
  while (i < tokens.length && ENV_ASSIGNMENT.test(tokens[i])) i++;
  return tokens.slice(i).join(' ');
}

/**
 * 剥离前缀包装器及其环变量/选项/数值参数：
 * `nohup sudo …`、`time sudo …`、`env FOO=1 sudo …`、`timeout 10 -k 5 sudo …`、
 * `nice -n 5 sudo …`、`command sudo …` 都得让后面的 sudo 暴露在段首。
 * @param {string} segment
 * @returns {string|null} 剥不出新形式时返回 null
 */
function stripCommandWrappers(segment) {
  const tokens = segment.trim().split(/\s+/);
  // 段首不是包装器就不动：否则 `ls -la` 之类会被剥成光杆参数
  if (tokens.length < 2 || !COMMAND_WRAPPERS.test(tokens[0])) return null;
  let i = 1;
  while (
    i < tokens.length &&
    (COMMAND_WRAPPERS.test(tokens[i]) || ENV_ASSIGNMENT.test(tokens[i]) || OPTION_OR_SIZE_TOKEN.test(tokens[i]))
  ) {
    i++;
  }
  const rest = tokens.slice(i).join(' ');
  return rest && rest !== segment ? rest : null;
}

/**
 * 取出解释器内联载荷（POSIX `-c/-e`、cmd `/c /k`、PowerShell `-Command/-EncodedCommand`）
 * @param {string} segment
 * @returns {string[]}
 */
function extractInlinePayloads(segment) {
  if (!INLINE_EXEC_INTERPRETERS.test(segment)) return [];
  const payloads = [];

  const posix = segment.match(INLINE_EXEC_FLAG);
  if (posix) payloads.push(unquote(posix[1]));

  const cmd = segment.match(CMD_SLASH_FLAG);
  if (cmd) payloads.push(unquote(cmd[2]));

  const ps = segment.match(PS_INLINE_FLAG);
  if (ps) {
    const raw = unquote(ps[1]);
    if (PS_ENCODED_FLAG.test(segment)) {
      // -EncodedCommand 走 base64(UTF-16LE)：解不出来就当作不命中，不当成放行依据
      try {
        payloads.push(Buffer.from(raw, 'base64').toString('utf16le'));
      } catch {
        /* 非法 base64：保留原文已由上面的 push 覆盖，不影响判定 */
      }
    } else {
      payloads.push(raw);
    }
  }

  return payloads.map((p) => String(p || '').trim()).filter(Boolean);
}

/**
 * 取出 `$( … )` 与反引号内部的子命令
 * 拆分器为了保留黑名单语义不拆这些位置，但里面的敏感段同样得过灰名单
 * （如 `echo $(sudo id)`：黑名单对 echo 开头的替换网开一面，灰名单必须看到 sudo）
 * @param {string} segment
 * @returns {string[]}
 */
function extractSubstitutions(segment) {
  const found = [];
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i];
    if (ch === '`') {
      const end = segment.indexOf('`', i + 1);
      if (end > i) {
        found.push(segment.slice(i + 1, end));
        i = end;
      }
      continue;
    }
    if (ch === '$' && segment[i + 1] === '(') {
      let depth = 0;
      let j = i + 1;
      for (; j < segment.length; j++) {
        if (segment[j] === '(') depth++;
        else if (segment[j] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      if (j < segment.length) {
        found.push(segment.slice(i + 2, j));
        i = j;
      }
    }
  }
  return found.map((s) => s.trim()).filter(Boolean);
}

/**
 * 按 shell 控制符拆分命令串（引号 / 反引号 / $( ) 内部不拆）
 * @param {string} command
 * @returns {string[]} 非空子命令段
 */
function splitShellSegments(command) {
  const parts = [];
  let buf = '';
  let quote = null;
  const push = () => {
    const seg = buf.trim();
    if (seg) parts.push(seg);
    buf = '';
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];

    if (quote) {
      buf += ch;
      if (ch === '\\' && quote === '"' && i + 1 < command.length) {
        buf += command[++i];
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }

    if (ch === "'" || ch === '"') {
      quote = ch;
      buf += ch;
      continue;
    }

    if (ch === '\\' && i + 1 < command.length) {
      buf += ch + command[++i];
      continue;
    }

    // 反引号命令替换：整段保留，不在此处拆分
    if (ch === '`') {
      buf += ch;
      i++;
      for (; i < command.length; i++) {
        buf += command[i];
        if (command[i] === '`') break;
      }
      continue;
    }

    // $( ... ) 命令替换：朴素配对一层括号
    if (ch === '$' && command[i + 1] === '(') {
      let depth = 0;
      for (; i < command.length; i++) {
        buf += command[i];
        if (command[i] === '(') depth++;
        else if (command[i] === ')') {
          depth--;
          if (depth === 0) break;
        }
      }
      continue;
    }

    const two = command.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      push();
      i++;
      continue;
    }

    if (ch === ';' || ch === '|' || ch === '&' || ch === '\n') {
      push();
      continue;
    }

    buf += ch;
  }
  push();
  return parts;
}

/**
 * 收集一条命令需要接受检查的全部“子命令范围”
 * 始终包含原始整串（保留现有黑名单语义，例如 fork bomb 这种本身带控制符的模式），
 * 再追加逐段拆分结果与解释器 -c/-e 内联载荷（递归一层层解开，深度封顶防死循环）。
 * @param {string} command
 * @param {number} [depth]
 * @param {string[]} [out]
 * @returns {string[]}
 */
function collectCommandScopes(command, depth = 3, out = []) {
  const trimmed = String(command || '').trim();
  if (!trimmed) return out;
  if (!out.includes(trimmed)) out.push(trimmed);
  if (depth <= 0) return out;

  for (const seg of splitShellSegments(trimmed)) {
    const normalized = stripEnvAssignments(seg);
    if (normalized && !out.includes(normalized)) out.push(normalized);

    // `nohup sudo …`、`env FOO=1 sudo …`、`timeout 10 sudo …`：
    // 包装器只是前缀，不能把敏感命令藏到段首正则看不见的后面
    const unwrapped = stripCommandWrappers(normalized);
    if (unwrapped) {
      const inner = stripEnvAssignments(unwrapped);
      if (inner && !out.includes(inner)) out.push(inner);
    }

    // 解释器内联载荷：POSIX `-c/-e`、cmd `/c /k`、PowerShell `-Command/-EncodedCommand`
    for (const payload of extractInlinePayloads(seg)) {
      collectCommandScopes(payload, depth - 1, out);
    }
    // `$( … )` 与反引号内部：拆分器为了保留黑名单语义整段不动，这里单独取出送检
    for (const sub of extractSubstitutions(seg)) {
      collectCommandScopes(sub, depth - 1, out);
    }
  }
  return out;
}

/**
 * 检查命令安全性
 * @param {boolean} [force=false] - 用户已确认（跳过灰名单但保留黑名单）
 * @param {Function} [tFn] - 可选的翻译函数（由 server.js 传入）
 * @returns {{ safe: boolean, level: 'allow'|'confirm'|'deny', reason?: string }}
 */
function checkCommand(command, force = false, tFn) {
  if (!command || typeof command !== 'string') {
    return { safe: false, level: 'deny', reason: tr('security.commandInvalid', undefined, tFn) };
  }

  const trimmed = command.trim();
  // 只有空白字符的命令同样无法分类：安全网关上“无法分类”不得当成 allow
  if (!trimmed) {
    return { safe: false, level: 'deny', reason: tr('security.commandInvalid', undefined, tFn) };
  }

  // 0. 子命令范围：原始整串 + 链式拆分段 + 解释器内联载荷
  //    黑名单与灰名单逐段判定，不得只看命令串开头
  const scopes = collectCommandScopes(trimmed);

  // 1. 黑名单始终生效（即使是 force 模式也不可绕过）
  for (const scope of scopes) {
    for (const pattern of BLACKLIST_PATTERNS) {
      if (pattern.test(scope)) {
        return {
          safe: false,
          level: 'deny',
          reason: tr('security.commandBlocked', { command: trimmed.substring(0, 100) }, tFn)
        };
      }
    }
  }

  // 1.5 禁止访问核心敏感文件（通过命令也一样拦截）
  // Windows 文件系统不区分大小写，归一化比较防止 .AI-HELPER-AGENT 等大小写变换绕过
  const cmpTrimmed = isWin32 ? trimmed.toLowerCase() : trimmed;
  for (const blocked of HARD_BLOCKED_PATHS) {
    const cmpBlocked = isWin32 ? blocked.toLowerCase() : blocked;
    if (cmpTrimmed.includes(cmpBlocked)) {
      return {
        safe: false,
        level: 'deny',
        reason: tr('security.forbiddenAgentFile', undefined, tFn)
      };
    }
  }

  // 2. 强制模式：跳过灰名单检查
  if (force) {
    return { safe: true, level: 'allow' };
  }

  // 3. 检查灰名单（逐段：`cd x && sudo y` 里的 sudo 同样要用户确认）
  for (const scope of scopes) {
    for (const entry of GRAYLIST_PATTERNS) {
      if (entry.pattern.test(scope)) {
        return {
          safe: false,
          level: 'confirm',
          reason: tr(entry.reasonKey, undefined, tFn)
        };
      }
    }
  }

  // 4. 通过安全检查
  return { safe: true, level: 'allow' };
}

export { checkPath, checkCommand, normalizePathFormat, isHardBlocked, collectCommandScopes };
