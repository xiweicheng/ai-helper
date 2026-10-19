// shared/verify-command-safety.js - 完成度校验取证命令的只读安全门（纯函数、零依赖、可单测）
//
// 定位：非 DOM 完成度校验（Phase A）会把 doneCriteria 里的命令/文件判据落到本地 Agent
// 执行取证。校验命令本质是执行 shell，绝不能成为绕过 agent_exec 确认灰/黑名单的后门。
// 本模块提供一个**独立于 agent 内部实现**的保守判定：一条命令只有被"证明只读"才允许
// 在无人值守的取证路径里自动执行；证明不了的一律拒绝（fail-closed），由调用方归
// indeterminate（取不到证），既不谎报未达标也不执行。
//
// 设计纪律：
//   1) 白名单只读二进制（test/grep/ls/cat/... ），白名单外一律拒；
//   2) 任何重定向（> >> < <( ）、命令替换（$() 与反引号）、语句分隔（; 换行）、裸后台 & 一律拒；
//   3) 剥壳/包装类前缀（sudo/doas/env/sh/bash/xargs/eval/解释器...）一律拒，防止藏匿任意代码；
//   4) 个别只读二进制的写/执行参数（find -exec/-delete、sort -o）单独封杀。

// 允许自动执行的只读探测二进制。白名单外的首 token 一律拒绝。
const READ_ONLY_BINARIES = new Set([
  'test', '[', '[[', 'grep', 'egrep', 'fgrep', 'rg', 'ls', 'dir', 'cat',
  'head', 'tail', 'wc', 'find', 'locate', 'stat', 'file', 'which', 'whereis',
  'type', 'du', 'df', 'sort', 'uniq', 'cut', 'tr', 'comm', 'diff',
]);

// 可藏匿任意代码的包装/解释器前缀：即使出现在白名单二进制之外，也必须显式拒绝。
const FORBIDDEN_WRAPPERS = new Set([
  'sudo', 'doas', 'env', 'sh', 'bash', 'zsh', 'dash', 'ksh', 'fish',
  'xargs', 'eval', 'exec', 'nohup', 'time', 'watch', 'su',
  'perl', 'python', 'python2', 'python3', 'ruby', 'node', 'deno',
]);

// 某些二进制整体只读，但个别参数具备写文件/执行子命令能力，命中即拒。
const FORBIDDEN_FLAGS_BY_BIN = {
  find: ['-exec', '-execdir', '-ok', '-okdir', '-delete', '-fprintf', '-fls'],
  sort: ['-o'],
  ls: ['--output'],
};

function basename(path) {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

/**
 * 判定一条命令是否"可证明只读"，从而允许在完成度校验取证路径中自动执行。
 * 保守取向：任何无法证明安全的构造都返回 false（拒绝），而非放行。
 * @param {unknown} command 待判定的 shell 命令字符串
 * @returns {boolean} true=只读可自动执行；false=拒绝自动执行（调用方应归 indeterminate）
 */
export function isReadOnlyVerifyCommand(command) {
  if (typeof command !== 'string') return false;
  const cmd = command.trim();
  if (!cmd) return false;

  // 重定向（读或写）与进程替换一律拒：> >> < <( >(
  if (/[><]/.test(cmd)) return false;
  // 命令替换：$( ) 与反引号
  if (cmd.includes('$(') || cmd.includes('`')) return false;
  // 语句分隔与换行：; 以及 CR/LF
  if (cmd.includes(';') || /[\r\n]/.test(cmd)) return false;

  // 把顺序/短路运算符（&&、||）归一为管道分隔符后，检查是否残留裸 &（后台执行）
  const seq = cmd.replace(/&&/g, '\u0000').replace(/\|\|/g, '\u0000');
  if (seq.includes('&')) return false;

  // 逐段（管道 / 顺序）校验首 token 与危险参数
  const segments = seq.split(/[\u0000|]+/).map((s) => s.trim()).filter(Boolean);
  if (segments.length === 0) return false;

  for (const seg of segments) {
    const tokens = seg.split(/\s+/);
    const bin = basename(tokens[0] || '');
    if (!bin) return false;
    if (FORBIDDEN_WRAPPERS.has(bin)) return false;
    if (!READ_ONLY_BINARIES.has(bin)) return false;
    const forbidden = FORBIDDEN_FLAGS_BY_BIN[bin] || [];
    for (const flag of forbidden) {
      if (tokens.includes(flag)) return false;
    }
  }
  return true;
}

/**
 * 把外部值（文件路径 / 待查子串）安全地包成单引号 shell 参数。
 * 单引号上下文内 ; $() 反引号 等都视为字面量，天然防注入；但控制字符无法安全嵌入，
 * 遇到 CR/LF/NUL 返回 null，由调用方归 bad_path（取不到证），绝不拼接执行。
 * @param {unknown} value 待转义的字面量
 * @returns {string|null} 已加单引号的安全参数；含非法控制字符时返回 null
 */
export function shQuoteArg(value) {
  if (typeof value !== 'string') return null;
  if (/[\r\n\u0000]/.test(value)) return null;
  // 内部单引号转义为 '\'' （关引号→转义单引号→开引号）
  return "'" + value.replace(/'/g, "'\\''") + "'";
}
