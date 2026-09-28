// agent/src/rag/url-guard.js - RAG URL 导入的 SSRF 防护
// 三层防线：
//   1. 目标地址干预：DNS 解析后按真实 IP 判断私网/保留段，决定是否放行
//      放行优先级：白名单非空 → 仅白名单命中放行（总开关不生效，白名单优先）；
//                 白名单为空 → 由总开关 allowPrivateNetwork 决定（缺省关闭）
//   2. 重定向逐跳校验：redirect: manual 手动跟随，每一跳都重新过第 1 层（防合法地址 302 跳内网）
//   3. 响应体大小上限：流式累计，超限立即中断（防超大响应 OOM）
// 注：DNS 校验与实际连接存在二次解析的理论窗口（DNS rebinding），
//     当前威胁模型（本机 AI 工具链被提示词注入）下按常规防护强度处理。

import { lookup } from 'dns/promises';
import { isIP } from 'net';
import { RagError } from './errors.js';

// 重定向最大跳数
export const URL_INGEST_MAX_REDIRECTS = 5;
// 响应体大小上限（流式累计中断）
export const URL_INGEST_MAX_BYTES = 10 * 1024 * 1024;

// 浏览器化请求头：部分站点（如百度）对非常规 UA 返回反爬跳转壳页/挑战页（仅含 script/noscript，
// 正文提取为空），表现为导入报「文档解析后无可索引内容」；伪装为常见浏览器可显著提升抓取成功率
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

/**
 * 私网/保留地址判断（IPv4 + IPv6）
 */
export function isPrivateAddress(ip) {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // 链路本地（含云元数据 169.254.169.254）
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
    return false;
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::1' || s === '::') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    if (s.startsWith('fc') || s.startsWith('fd')) return true; // fc00::/7 ULA
    if (/^fe[89ab]/.test(s)) return true; // fe80::/10 链路本地
    return false;
  }
  return false;
}

/**
 * 目标 host 是否命中白名单
 * 规则：大小写不敏感；精确匹配；`*.` 前缀为子域通配（不匹配裸域本身）
 */
export function matchesHostAllowlist(hostname, allowlist) {
  const h = String(hostname || '').toLowerCase();
  return (Array.isArray(allowlist) ? allowlist : []).some((entry) => {
    const e = String(entry || '').trim().toLowerCase();
    if (!e) return false;
    if (e.startsWith('*.')) return h.endsWith(e.slice(1)) && h.length > e.length - 1;
    return h === e;
  });
}

/**
 * 私网目标放行决策
 * 优先级：白名单非空 → 仅白名单命中放行（总开关不生效）；
 *         白名单为空（或仅空白条目）→ 由总开关 allowPrivateNetwork 决定
 */
export function isPrivateTargetAllowed(hostname, policy) {
  const p = policy && typeof policy === 'object' ? policy : {};
  const allowlist = Array.isArray(p.allowedPrivateHosts) ? p.allowedPrivateHosts : [];
  const hasAllowlist = allowlist.some((entry) => String(entry || '').trim() !== '');
  if (hasAllowlist) return matchesHostAllowlist(hostname, allowlist);
  return p.allowPrivateNetwork === true;
}

/**
 * 解析并校验 http/https URL（不通过抛 invalidUrl）
 */
function parseHttpUrl(raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new RagError('invalidUrl');
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new RagError('invalidUrl');
  return u;
}

/**
 * 校验单个 URL 的访问目标（协议 + DNS 解析后的真实 IP），不通过抛 RagError
 * - hostname 为 IP 字面量：直接判断
 * - 为域名：解析出全部地址，任一命中私网即按策略决策（防域名混挂公网/内网地址绕过）
 */
export async function assertUrlAllowed(urlStr, policy) {
  const u = parseHttpUrl(urlStr);
  const hostname = u.hostname.replace(/^\[|\]$/g, '');
  const ips = isIP(hostname)
    ? [hostname]
    : (await lookup(hostname, { all: true })).map((r) => r.address);
  if (!ips.some(isPrivateAddress)) return; // 公网目标直接放行
  if (!isPrivateTargetAllowed(hostname, policy)) {
    throw new RagError('urlPrivateBlocked', { host: hostname });
  }
}

/**
 * 逐跳抓取（重定向手动跟随，每跳过目标校验）+ 响应体大小上限
 * @param {string} urlStr
 * @param {{allowPrivateNetwork?: boolean, allowedPrivateHosts?: string[]}} policy
 * @param {{maxRedirects?: number, maxBytes?: number, timeoutMs?: number}} [opts]
 * @returns {Promise<{bytes: Buffer, contentType: string, finalUrl: string}>}
 */
export async function fetchUrlGuarded(urlStr, policy, opts = {}) {
  const maxRedirects = opts.maxRedirects ?? URL_INGEST_MAX_REDIRECTS;
  const maxBytes = opts.maxBytes ?? URL_INGEST_MAX_BYTES;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 30000);

  let current = parseHttpUrl(urlStr);
  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertUrlAllowed(current.toString(), policy);
    const res = await fetch(current, {
      redirect: 'manual',
      signal,
      headers: { ...BROWSER_HEADERS },
    });

    if (res.status >= 300 && res.status < 400) {
      await res.body?.cancel().catch(() => {});
      const location = res.headers.get('location');
      if (!location) throw new RagError('urlFetchFailed', { status: res.status });
      let next;
      try {
        next = new URL(location, current); // 支持相对 Location
      } catch {
        throw new RagError('urlFetchFailed', { status: res.status });
      }
      current = next;
      continue;
    }
    if (!res.ok) throw new RagError('urlFetchFailed', { status: res.status });

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    const bytes = await readBodyLimited(res, maxBytes);
    return { bytes, contentType, finalUrl: current.toString() };
  }
  throw new RagError('urlTooManyRedirects', { max: maxRedirects });
}

/**
 * 按 charset 解码响应体（GBK 系中文站点常见；此前统一按 utf-8 硬解会乱码）
 * charset 来源：Content-Type 参数 → HTML meta 嗅探（前 2KB）→ 回退 utf-8。
 * TextDecoder 经 Node 内置 ICU 支持 gbk/gb2312/gb18030/big5 等标签；未知标签安全回退。
 * @param {Buffer} bytes
 * @param {string} [contentType]
 * @returns {string}
 */
export function decodeBytes(bytes, contentType = '') {
  let label = '';
  const m = /charset\s*=\s*["']?([\w-]+)/i.exec(contentType || '');
  if (m) label = m[1].toLowerCase();
  if (!label && /html|xml/i.test(contentType || '')) {
    const head = bytes.subarray(0, 2048).toString('latin1');
    const mm = /charset\s*=\s*["']?\s*([\w-]+)/i.exec(head);
    if (mm) label = mm[1].toLowerCase();
  }
  if (label && label !== 'utf-8' && label !== 'utf8') {
    try {
      return new TextDecoder(label).decode(bytes);
    } catch {
      // 未知/不支持编码标签：回退 utf-8
    }
  }
  return bytes.toString('utf-8');
}

/**
 * 流式读取响应体，累计超过 maxBytes 立即中断（含 Content-Length 预检）
 */
async function readBodyLimited(res, maxBytes) {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > maxBytes) {
    await res.body?.cancel().catch(() => {});
    throw new RagError('urlTooLarge', { limit: formatLimit(maxBytes) });
  }
  if (!res.body) return Buffer.alloc(0);

  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new RagError('urlTooLarge', { limit: formatLimit(maxBytes) });
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.cancel().catch(() => {});
  }
  return Buffer.concat(chunks);
}

function formatLimit(bytes) {
  return bytes >= 1024 * 1024
    ? `${Math.round(bytes / (1024 * 1024))}MB`
    : `${Math.round(bytes / 1024)}KB`;
}
