// network-scope.unit.test.js - 内网访问范围判定的回归测试（对应 docs/AUDIT_STATUS.md 的 SEC-03）
//
// 覆盖三件事：
//   1. 私网/保留段识别的边界值（含云元数据 169.254.169.254、CGNAT、ULA、IPv4 映射 IPv6）；
//   2. 扩展侧特有的「按主机名判定」规则（无 DNS 能力下的粗筛：localhost/特殊后缀/无点主机名）；
//   3. B2 语义真值表 —— 特别是「总闸关闭 + 白名单非空」这一档必须拒绝。
//      这一档在代理端既有实现里曾因为没有用例而长期是"关不掉"的状态，本文件明确把它钉住。
import { describe, test, expect } from 'vitest';
import {
  isPrivateAddress, isPrivateHostname, matchesHostAllowlist,
  toCleanHostList, classifyUrlTarget, decideNetworkAccess,
} from '../../src/shared/network-scope.js';

describe('isPrivateAddress：IP 字面量的私网判定', () => {
  test.each([
    ['127.0.0.1', true], ['127.5.5.5', true],          // 环回整段
    ['0.0.0.0', true],                                  // this-network
    ['10.1.2.3', true],                                 // 10/8
    ['172.16.0.1', true], ['172.31.255.255', true],     // 172.16/12 边界
    ['172.15.0.1', false], ['172.32.0.1', false],       // 紧邻的非 RFC1918
    ['192.168.1.1', true], ['192.167.9.9', false],
    ['169.254.169.254', true],                          // 链路本地 / 云元数据
    ['100.64.0.1', true], ['100.127.255.255', true],    // CGNAT 100.64/10
    ['100.63.0.1', false], ['100.128.0.1', false],
    ['8.8.8.8', false], ['1.1.1.1', false],
    ['::1', true], ['::', true],
    ['fc00::1', true], ['fd12:3456::7', true],          // ULA
    ['fe80::1', true], ['fe90::1', true],               // link-local
    ['2001:4860:8003::93', false],                      // 公网 IPv6
    ['::ffff:127.0.0.1', true],                         // IPv4 映射 IPv6
    ['::ffff:8.8.8.8', false],
  ])('%s → %s', (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });

  test('非 IP 字面量不误判为私网（交给主机名规则）', () => {
    expect(isPrivateAddress('example.com')).toBe(false);
    expect(isPrivateAddress('')).toBe(false);
    expect(isPrivateAddress(999.9)).toBe(false);
    // 超界的伪四段不算 IPv4
    expect(isPrivateAddress('999.1.1.1')).toBe(false);
  });
});

describe('isPrivateHostname：无 DNS 能力下按主机名的粗筛', () => {
  test.each([
    ['localhost', true],
    ['api.localhost', true],
    ['intranet.corp', true], ['nas.lan', true], ['home.local', true],
    ['svc.internal', true], ['box.intranet', true], ['dev.home', true],
    ['nas', true],      // 无点主机名：只能来自 /etc/hosts 或本地搜索域
    ['router', true],
    ['example.com', false],
    ['www.example.com', false],
    ['a.b', false],     // 有 TLD 分隔点即视为可公网解析
    ['sub.example.internal', true],
  ])('%s → private=%s', (host, expected) => {
    expect(isPrivateHostname(host)).toBe(expected);
  });

  test('大小写与尾点不影响判定', () => {
    expect(isPrivateHostname('LocalHost')).toBe(true);
    expect(isPrivateHostname('LocalHost.')).toBe(true);
    expect(isPrivateHostname('EXAMPLE.COM')).toBe(false);
  });

  test('空主机名不当作内网（避免把解析失败误判成拦截）', () => {
    expect(isPrivateHostname('')).toBe(false);
  });
});

describe('classifyUrlTarget：scheme 白名单与目标归类', () => {
  test.each([
    ['file:///etc/passwd', 'schemeBlocked'],
    ['chrome-extension://abcdefg/api/x', 'schemeBlocked'],
    ['data:text/html,<script>alert(1)</script>', 'schemeBlocked'],
    ['javascript:alert(1)', 'schemeBlocked'],
    ['ftp://10.0.0.1/x', 'schemeBlocked'],
    ['not-a-url', 'invalidUrl'],
    ['', 'invalidUrl'],
  ])('%s 被拒为 %s', (url, reason) => {
    expect(classifyUrlTarget(url).reason).toBe(reason);
  });

  test('http/https 正常归类，协议大小写不敏感', () => {
    expect(classifyUrlTarget('http://127.0.0.1:18910/api')).toMatchObject({ ok: true, isPrivate: true, hostname: '127.0.0.1' });
    expect(classifyUrlTarget('HTTPS://example.com').isPrivate).toBe(false);
  });

  test('IPv6 字面量去方括号后判定（agent 的 isLocal 名单含 ::1）', () => {
    expect(classifyUrlTarget('http://[::1]:18910/x')).toMatchObject({ hostname: '::1', isPrivate: true });
  });
});

describe('白名单条目匹配规则', () => {
  test('精确匹配且大小写不敏感', () => {
    expect(matchesHostAllowlist('intranet.corp.com', ['INTRANET.corp.com'])).toBe(true);
    expect(matchesHostAllowlist('a.intranet.corp.com', ['intranet.corp.com'])).toBe(false);
  });

  test('*. 前缀做子域通配，且不匹配裸域本身', () => {
    expect(matchesHostAllowlist('x.intranet.com', ['*.intranet.com'])).toBe(true);
    expect(matchesHostAllowlist('a.b.intranet.com', ['*.intranet.com'])).toBe(true);
    expect(matchesHostAllowlist('intranet.com', ['*.intranet.com'])).toBe(false);
    expect(matchesHostAllowlist('notintranet.com', ['*.intranet.com'])).toBe(false);
  });

  test('toCleanHostList 容忍用户误粘贴协议/端口/路径，并丢弃空条目', () => {
    expect(toCleanHostList(['http://Nas.Local:8080/path', '  ', '', '192.168.1.50']))
      .toEqual(['nas.local', '192.168.1.50']);
    expect(toCleanHostList(['  ', ''])).toEqual([]);
    expect(toCleanHostList(undefined)).toEqual([]);
  });
});

describe('decideNetworkAccess：B2 语义真值表', () => {
  const PRIV = 'http://192.168.1.50/admin';
  const PUB = 'https://example.com/api';

  test('规则1：公网目标在任何配置下都放行（含总闸关闭）', () => {
    expect(decideNetworkAccess(PUB, { enabled: false, allowedHosts: [] })).toMatchObject({ allowed: true });
    expect(decideNetworkAccess(PUB, { enabled: false, allowedHosts: ['intranet.corp'] })).toMatchObject({ allowed: true });
    expect(decideNetworkAccess(PUB, {})).toMatchObject({ allowed: true });
    expect(decideNetworkAccess(PUB, undefined)).toMatchObject({ allowed: true });
  });

  test('规则2：总闸关闭 → 内网一律拒绝，且白名单命中也不生效（关掉就是真关掉）', () => {
    expect(decideNetworkAccess(PRIV, { enabled: false, allowedHosts: ['192.168.1.50'] }))
      .toMatchObject({ allowed: false, reason: 'gateClosed' });
    expect(decideNetworkAccess(PRIV, { allowedHosts: ['192.168.1.50'] }))
      .toMatchObject({ allowed: false, reason: 'gateClosed' });
    // 本次要防的正是这条真实可达通道：agent 的 /api/shutdown 对环回免认证
    expect(decideNetworkAccess('http://127.0.0.1:18910/api/shutdown', { enabled: false, allowedHosts: [] }))
      .toMatchObject({ allowed: false, reason: 'gateClosed' });
  });

  test('规则3：总闸开启但白名单为空 → 仍拒绝（不存在"整个内网全开"的状态）', () => {
    expect(decideNetworkAccess(PRIV, { enabled: true, allowedHosts: [] }))
      .toMatchObject({ allowed: false, reason: 'noAllowlistedHost' });
    expect(decideNetworkAccess(PRIV, { enabled: true, allowedHosts: ['  ', ''] }))
      .toMatchObject({ allowed: false, reason: 'noAllowlistedHost' });
  });

  test('规则4：总闸开启 + 白名单非空 → 只放行命中条目', () => {
    const policy = { enabled: true, allowedHosts: ['192.168.1.50', '*.svc.internal'] };
    expect(decideNetworkAccess(PRIV, policy)).toMatchObject({ allowed: true });
    expect(decideNetworkAccess('http://a.svc.internal/x', policy)).toMatchObject({ allowed: true });
    expect(decideNetworkAccess('http://10.0.0.9/x', policy)).toMatchObject({ allowed: false, reason: 'hostNotAllowlisted' });
    expect(decideNetworkAccess('http://nas/x', policy)).toMatchObject({ allowed: false, reason: 'hostNotAllowlisted' });
  });

  test('缺省（无配置对象）等价于最严状态：内网拒绝、公网放行', () => {
    expect(decideNetworkAccess(PRIV, undefined).allowed).toBe(false);
    expect(decideNetworkAccess(PRIV, {}).allowed).toBe(false);
    expect(decideNetworkAccess(PUB, undefined).allowed).toBe(true);
  });

  test('非法 URL 与非法 scheme 在决策层同样被拒', () => {
    expect(decideNetworkAccess('file:///etc/passwd', { enabled: true, allowedHosts: ['*'] }))
      .toMatchObject({ allowed: false, reason: 'schemeBlocked' });
    expect(decideNetworkAccess('bogus', { enabled: true })).toMatchObject({ allowed: false, reason: 'invalidUrl' });
  });
});
