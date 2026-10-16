// shared/network-scope.js - 网络访问范围判定（内网/私网拦截的唯一判定源）
//
// 背景（docs/AUDIT_STATUS.md 的 SEC-03）：内置工具 fetch_url 此前只做 `new URL()` 格式校验，
// 无 scheme 限制、无主机限制，模型可被提示词诱导直接打到本机/内网服务。实测（真扩展
// Service Worker 发起 fetch）确认：扩展自身发起的请求**不受 Chrome PNA 预检约束**，
// 127.0.0.1 / localhost / ::1 的 GET 与 POST 均可直达且响应体可读。
//
// 语义采用「总闸 + 白名单」的 B2 组合，与代理端 rag/url-guard.js 的判定规则刻意区分：
//   1. 公网目标一律放行，本模块只约束内网/本机/保留段，不影响任何正常联网；
//   2. 总闸关闭 → 所有内网目标拒绝（白名单存在也无效，白名单永不自动清空）；
//   3. 总闸开启 + 白名单为空 → 仍然拒绝（开启只是"启用该能力"，不是"放行全部内网"，
//      避免出现一个能把整个内网敞开的合法状态）；
//   4. 总闸开启 + 白名单非空 → 仅放行命中条目。
//
// 与代理端实现的强度差异（必须知道，别当成等价防护）：
//   - Service Worker 无 DNS 解析 API，只能按**字面主机名/IP** 判定，
//     「公网域名解析到内网 IP」与 DNS rebinding 这一类无法识别；
//   - fetch 默认内部跟随重定向，拿不到中间跳，「公网 URL 302 跳内网」这一跳无法复查。
//     代理端 url-guard.js 有 lookup + redirect:manual 逐跳校验，故本模块是扩展侧的粗筛版。

// RFC 6761 保留/私有用途的顶级后缀，以及内网常见约定后缀：
// 这些后缀在公网 DNS 上不可能解析成功，命中即可判定为内网目标
const PRIVATE_TLDS = ['.local', '.localhost', '.internal', '.home', '.lan', '.corp', '.intranet'];

/**
 * 私网/保留地址判断（IPv4 + IPv6 字面量）
 * 覆盖：本机/this-network、0.0.0.0、10/8、172.16/12、192.168/16、链路本地（含云元数据
 * 169.254.169.254）、CGNAT 100.64/10、IPv6 ::1/::、IPv4 映射 IPv6、ULA fc00::/7、linklocal fe80::/10
 */
export function isPrivateAddress(ip) {
  const v = detectIpVersion(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (s.startsWith('fc') || s.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(s)) return true;
    return false;
  }
  return false;
}

/** IP 版本探测：4 / 6 / 0（非 IP 字面量） */
function detectIpVersion(ip) {
  const s = String(ip || '').trim();
  if (!s) return 0;
  // 纯点分四段且各段 0-255
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(s)) {
    return s.split('.').every((p) => Number(p) <= 255) ? 4 : 0;
  }
  if (s.includes(':')) return 6;
  return 0;
}

/**
 * 主机名（非 IP 字面量）是否属于内网/本机约定范围
 * 规则（保守但有效的三条）：
 *   1. `localhost` 与任意 `*.localhost`；
 *   2. 命中 PRIVATE_TLDS 后缀（公网 DNS 不可能解析）；
 *   3. **无点主机名**（如 `nas`、`router`）：没有 TLD 分隔点，只能来自 /etc/hosts
 *      或本地 DNS 搜索域，实际环境中即内网设备。
 */
export function isPrivateHostname(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  if (!h) return false;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (PRIVATE_TLDS.some((tld) => h === tld.slice(1) || h.endsWith(tld))) return true;
  if (!h.includes('.')) return true;
  return false;
}

/**
 * 目标主机是否命中白名单
 * 规则：大小写不敏感；精确匹配；`*.` 前缀为子域通配（不匹配裸域本身）；条目不含端口/路径
 */
export function matchesHostAllowlist(hostname, allowlist) {
  const h = normalizeHost(hostname);
  return toCleanHostList(allowlist).some((entry) => {
    if (entry.startsWith('*.')) return h.endsWith(entry.slice(1)) && h.length > entry.length - 1;
    return h === entry;
  });
}

/** URL 主机名 → 判定用主机名：去 IPv6 方括号、去尾部点、小写 */
function normalizeHost(hostname) {
  return String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
}

/** 用户录入的白名单 → 干净条目数组（逐条 trim/lowercase、剥掉误粘贴的协议与端口/路径、丢空条目） */
export function toCleanHostList(allowlist) {
  const arr = Array.isArray(allowlist) ? allowlist : [];
  const out = [];
  for (const raw of arr) {
    let e = String(raw || '').trim().toLowerCase();
    if (!e) continue;
    e = e.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');  // 去掉误粘贴的 http:// https://
    e = e.split('/')[0];                            // 去掉路径
    const colonCount = (e.match(/:/g) || []).length;
    if (colonCount === 1) {
      e = e.split(':')[0];                          // 单个冒号必为端口分隔符（通配条目也适用）
    } else if (e.includes(']')) {
      e = e.replace(/\]:\d+$/, ']');                // [::1]:8080 → [::1]
    }
    // colonCount > 1 且不带头括号的条目当作裸 IPv6 地址保留原样
    e = e.replace(/^\[|\]$/g, '');                  // 去 IPv6 方括号，与 URL 侧归一化对齐
    if (e) out.push(e);
  }
  return out;
}

/**
 * 解析并归类目标地址
 * @returns {{ ok: boolean, reason?: string, hostname?: string, isPrivate?: boolean, scheme?: string }}
 */
export function classifyUrlTarget(rawUrl) {
  let u;
  try {
    u = new URL(String(rawUrl || ''));
  } catch {
    return { ok: false, reason: 'invalidUrl' };
  }
  const scheme = u.protocol.replace(/:$/, '').toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') {
    return { ok: false, reason: 'schemeBlocked', scheme };
  }
  const hostname = normalizeHost(u.hostname);
  if (!hostname) return { ok: false, reason: 'invalidUrl' };
  const isPrivate = detectIpVersion(hostname)
    ? isPrivateAddress(hostname)
    : isPrivateHostname(hostname);
  return { ok: true, hostname, isPrivate, scheme };
}

/**
 * 网络访问决策（B2 语义，判定顺序即文档中的四条）
 * @param {string} rawUrl
 * @param {{ enabled?: boolean, allowedHosts?: string[] }} policy
 * @returns {{ allowed: boolean, reason?: string, hostname?: string, scheme?: string }}
 */
export function decideNetworkAccess(rawUrl, policy) {
  const p = policy && typeof policy === 'object' ? policy : {};
  const target = classifyUrlTarget(rawUrl);
  if (!target.ok) {
    return { allowed: false, reason: target.reason, hostname: target.hostname, scheme: target.scheme };
  }
  // 规则 1：公网目标不受本模块约束
  if (!target.isPrivate) return { allowed: true, hostname: target.hostname };
  // 规则 2：总闸关闭 → 一律拒绝，白名单不生效（也不被清空）
  if (p.enabled !== true) return { allowed: false, reason: 'gateClosed', hostname: target.hostname };
  const allowlist = toCleanHostList(p.allowedHosts);
  // 规则 3：开关开启但没配任何条目 → 仍拒绝，避免存在"整个内网全开"的状态
  if (allowlist.length === 0) return { allowed: false, reason: 'noAllowlistedHost', hostname: target.hostname };
  // 规则 4：仅放行命中条目
  if (matchesHostAllowlist(target.hostname, allowlist)) {
    return { allowed: true, hostname: target.hostname };
  }
  return { allowed: false, reason: 'hostNotAllowlisted', hostname: target.hostname };
}
