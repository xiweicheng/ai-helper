/**
 * 交互式换取 Chrome Web Store refresh_token
 *
 * 走标准 OAuth 2.0 loopback 流程（Google 已弃用 oob）：
 *   1. 本机起一个临时 HTTP server 承接 callback
 *   2. 打开浏览器到 Google 授权页
 *   3. 用户同意后 Google redirect 回本机, 携带 code
 *   4. 用 code 换 access_token + refresh_token
 *   5. 自动把 refresh_token 写回 .env.store
 *
 * 用法:
 *   node scripts/get-chrome-refresh-token.mjs
 *
 * 前提: .env.store 里已填 CHROME_CLIENT_ID / CHROME_CLIENT_SECRET / CHROME_EXTENSION_ID
 */

import fs from 'fs';
import http from 'http';
import path from 'path';
import { exec, execFileSync } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const envFile = path.join(projectRoot, '.env.store');

const C = { green: '\x1b[0;32m', cyan: '\x1b[0;36m', red: '\x1b[0;31m', nc: '\x1b[0m' };
const info = (m) => console.log(`${C.cyan}[INFO]${C.nc} ${m}`);
const ok = (m) => console.log(`${C.green}[OK]${C.nc}   ${m}`);
const fail = (m) => { console.error(`${C.red}[FAIL]${C.nc} ${m}`); process.exit(1); };

function readEnv() {
  if (!fs.existsSync(envFile)) fail(`未找到 ${envFile}`);
  const vals = {};
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) vals[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return vals;
}

function writeRefreshToken(token) {
  const text = fs.readFileSync(envFile, 'utf-8');
  const next = text.replace(/^CHROME_REFRESH_TOKEN=.*$/m, `CHROME_REFRESH_TOKEN=${token}`);
  if (next === text) fail('未在 .env.store 找到 CHROME_REFRESH_TOKEN= 行');
  fs.writeFileSync(envFile, next);
}

async function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start ""' : 'xdg-open';
  try { await execAsync(`${cmd} "${url}"`); } catch { /* 忽略, 下面会打印 URL 让用户手动复制 */ }
}

// 自动探测 macOS 系统代理 (浏览器可用但终端默认不走)
// 命中后返回形如 "http://127.0.0.1:7890", 未命中返回 null
async function detectSystemProxy() {
  if (process.platform !== 'darwin') return null;
  try {
    const { stdout } = await execAsync('scutil --proxy');
    const httpsOn = /HTTPSEnable\s*:\s*1/.test(stdout);
    const host = stdout.match(/HTTPSProxy\s*:\s*(\S+)/)?.[1];
    const port = stdout.match(/HTTPSPort\s*:\s*(\d+)/)?.[1];
    if (httpsOn && host && port && host !== '127.0.0.1') return `http://${host}:${port}`;
    // 本地常见代理工具 (Clash / V2rayU 等) 监听 127.0.0.1
    if (httpsOn && host === '127.0.0.1' && port) return `http://127.0.0.1:${port}`;
  } catch { /* 无代理 */ }
  return null;
}

// 用 curl 换 token: Node 内置 fetch 不识别 HTTPS_PROXY, curl 天然支持
// 直接 execFileSync 传数组避免 shell 引号拼接错误
async function exchangeWithCurl({ code, clientId, clientSecret, redirectUri, proxy }) {
  const args = [
    '-sS', '--max-time', '30',
    '-o', '-', '-w', '\n__HTTP_STATUS__%{http_code}',
    '-X', 'POST',
    '--data-urlencode', `code=${code}`,
    '--data-urlencode', `client_id=${clientId}`,
    '--data-urlencode', `client_secret=${clientSecret}`,
    '--data-urlencode', `redirect_uri=${redirectUri}`,
    '--data-urlencode', 'grant_type=authorization_code',
  ];
  if (proxy) args.unshift('-x', proxy);
  args.push('https://oauth2.googleapis.com/token');
  const stdout = execFileSync('curl', args, { encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 });
  const idx = stdout.lastIndexOf('\n__HTTP_STATUS__');
  const body = stdout.slice(0, idx);
  const status = Number(stdout.slice(idx + '\n__HTTP_STATUS__'.length));
  return { status, json: JSON.parse(body) };
}

async function main() {
  const env = readEnv();
  const { CHROME_CLIENT_ID: clientId, CHROME_CLIENT_SECRET: clientSecret, CHROME_EXTENSION_ID: extId } = env;
  if (!clientId || !clientSecret) {
    fail('请先在 .env.store 里填写 CHROME_CLIENT_ID 与 CHROME_CLIENT_SECRET');
  }

  // 用一次性 server 承接 Google 的 loopback redirect
  const server = http.createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const redirectUri = `http://127.0.0.1:${port}/callback`;
  info(`本地 callback 服务已监听 127.0.0.1:${port}`);

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/chromewebstore');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // 强制首次授权即返 refresh_token
  if (extId) authUrl.searchParams.set('login_hint', '');

  console.log('');
  console.log('即将在浏览器打开 Google 授权页, 若未自动打开请手动访问:');
  console.log(`  ${authUrl.toString()}`);
  console.log('');

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const u = new URL(req.url, `http://127.0.0.1:${port}`);
      if (u.pathname !== '/callback') { res.statusCode = 404; res.end(); return; }
      const err = u.searchParams.get('error');
      const c = u.searchParams.get('code');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (err) {
        res.end(`<h2 style="color:#c00">授权失败: ${err}</h2><p>${u.searchParams.get('error_description') ?? ''}</p>`);
        reject(new Error(`OAuth error: ${err}`));
        return;
      }
      if (!c) { res.end('missing code'); reject(new Error('未收到 code')); return; }
      res.end('<h2 style="color:#0a0">✓ 授权成功</h2><p>可以关闭此标签页, 终端里继续。</p>');
      resolve(c);
    });
    server.on('error', reject);
  });
  ok(`已拿到 authorization code (长度 ${code.length})`);
  server.close();

  // 用 code 换 token
  info('用 code 换取 refresh_token…');
  const proxy = await detectSystemProxy();
  if (proxy) info(`已探测到系统代理: ${proxy}`);
  const { status, json: tokenJson } = await exchangeWithCurl({
    code, clientId, clientSecret, redirectUri, proxy,
  });
  if (status !== 200) fail(`token 换取失败: HTTP ${status} ${JSON.stringify(tokenJson)}`);
  const refresh = tokenJson.refresh_token;
  if (!refresh) fail('Google 未返回 refresh_token, 请确认账户已完成授权且 prompt=consent 生效');

  writeRefreshToken(refresh);
  ok('refresh_token 已写入 .env.store 的 CHROME_REFRESH_TOKEN=');
  console.log('');
  console.log('下一步验证:');
  console.log('  npm run publish:store -- --chrome --dry-run');
}

main().catch((e) => fail(e.stack ?? String(e)));
