// agent/src/version-compat.js
// 版本兼容纯函数：解析插件下发的 ~x.y.z 区间、比较版本、从 npm view 输出提取最高版本
// 约定：插件端与代理端使用同一版本流，插件只允许把代理升级到自身 major.minor 内的最高 patch

/**
 * 解析兼容区间，仅接受 "~x.y.z"
 * @param {unknown} target
 * @returns {{raw: string, version: string, major: number, minor: number, patch: number}|null}
 */
export function parseTargetRange(target) {
  if (typeof target !== 'string') return null;
  const raw = target.trim();
  const m = raw.match(/^~(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return {
    raw,
    version: `${m[1]}.${m[2]}.${m[3]}`,
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3])
  };
}

/**
 * 老插件未传区间时的回落目标：锚定代理自身 major.minor
 * @param {string} agentVersion
 * @returns {string} 形如 "~2.7.10"，无法解析时返回空串
 */
export function buildFallbackTarget(agentVersion) {
  if (typeof agentVersion !== 'string') return '';
  const m = agentVersion.trim().match(/^\d+\.\d+\.\d+/);
  return m ? `~${m[0]}` : '';
}

/**
 * 只比较 core 部分（忽略预发布/构建元数据），返回负数/0/正数
 */
export function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

/**
 * 已安装版本是否高于兼容区间锚点（仅比较 major.minor，用于降级保护）
 */
export function isMajorMinorAhead(current, targetVersion) {
  const c = String(current).split('.').map(Number);
  const t = String(targetVersion).split('.').map(Number);
  if (!Number.isFinite(c[0]) || !Number.isFinite(t[0])) return false;
  if (c[0] !== t[0]) return c[0] > t[0];
  return (c[1] || 0) > (t[1] || 0);
}

/**
 * current → latest 是否有更新
 */
export function isUpdateAvailable(current, latest) {
  if (!latest) return false;
  return compareVersions(latest, current) > 0;
}

// 严格整串匹配：该结果会被拼进 npm 参数（Windows 下经 shell 执行），必须排除注入字符
const VERSION_RE = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

/**
 * 从任意 JSON 值（字符串 / 数组）中挑出最高版本
 * @param {unknown} value
 * @returns {string}
 */
export function pickLatestVersion(value) {
  const list = (Array.isArray(value) ? value : [value]).filter(v => typeof v === 'string' && VERSION_RE.test(v));
  return list.sort(compareVersions).pop() || '';
}

/**
 * 解析 `npm view pkg@range version --json` 的输出（跳过可能的前导提示）
 * 依次尝试：整串 JSON → 数组起点 → 版本字符串起点，避免提示行含引号时误判失败
 * @param {string} stdout
 * @returns {string} 最高版本，解析失败返回空串
 */
export function parseNpmViewVersions(stdout) {
  if (typeof stdout !== 'string') return '';
  const raw = stdout.trim();
  if (!raw) return '';

  const tryParse = (text) => {
    try { return JSON.parse(text); } catch { return undefined; }
  };

  const whole = tryParse(raw);
  if (whole !== undefined) return pickLatestVersion(whole);

  const bracketStart = raw.indexOf('[');
  if (bracketStart >= 0) {
    const fromBracket = tryParse(raw.slice(bracketStart));
    if (fromBracket !== undefined) return pickLatestVersion(fromBracket);
  }

  // 单个版本字符串：从形如 "1.2.3 的引号处起步，跳过含引号的 notice 行
  const quoteMatch = raw.match(/"\d+\.\d+\.\d+/);
  if (quoteMatch && quoteMatch.index >= 0) {
    const fromQuote = tryParse(raw.slice(quoteMatch.index));
    if (fromQuote !== undefined) return pickLatestVersion(fromQuote);
  }

  return '';
}
