/**
 * 扩展商店一键发布脚本
 *
 * 将 npm run package 产出的 zip 自动上传并发布到 Chrome Web Store / Microsoft Edge Add-ons，
 * 免去手动登录开发者后台上传的操作。
 *
 * 用法（在项目根目录）:
 *   npm run publish:store -- --chrome              # 只发布 Chrome Web Store
 *   npm run publish:store -- --edge                # 只发布 Edge Add-ons
 *   npm run publish:store -- --both                # 两个商店都发布
 *   npm run publish:store -- --chrome --dry-run    # 仅校验凭据与产物，不真正发布
 *   node scripts/publish-store.mjs --setup         # 打印凭据配置引导
 *
 * 凭据从项目根目录 .env.store 读取（已加入 .gitignore，不会被提交）:
 *   CHROME_EXTENSION_ID / CHROME_CLIENT_ID / CHROME_CLIENT_SECRET / CHROME_REFRESH_TOKEN
 *   EDGE_PRODUCT_ID / EDGE_TENANT_ID / EDGE_CLIENT_ID / EDGE_CLIENT_SECRET
 *
 * API 参考:
 *   Chrome Web Store API: https://developer.chrome.com/docs/webstore/api
 *   Edge Add-ons API:     https://learn.microsoft.com/en-us/microsoft-edge/extensions/api/submit-extensions-new
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const envFile = path.join(projectRoot, '.env.store');

const C = {
  red: '\x1b[0;31m', green: '\x1b[0;32m', yellow: '\x1b[1;33m',
  cyan: '\x1b[0;36m', dim: '\x1b[2m', nc: '\x1b[0m',
};
const info = (m) => console.log(`${C.cyan}[INFO]${C.nc}  ${m}`);
const ok = (m) => console.log(`${C.green}[OK]${C.nc}    ${m}`);
const warn = (m) => console.log(`${C.yellow}[WARN]${C.nc}  ${m}`);
const err = (m) => console.error(`${C.red}[ERROR]${C.nc} ${m}`);

function fail(msg) {
  err(msg);
  process.exit(1);
}

// ─── 凭据配置引导 ───

const SETUP_GUIDE = `
${C.cyan}══════════════════════════════════════════════════════════════${C.nc}
  扩展商店 API 凭据配置引导
${C.cyan}══════════════════════════════════════════════════════════════${C.nc}

凭据文件: ${envFile}（已在 .gitignore 中，切勿提交）
若文件不存在，复制下方模板创建：

  ${C.dim}CHROME_EXTENSION_ID=
  CHROME_CLIENT_ID=
  CHROME_CLIENT_SECRET=
  CHROME_REFRESH_TOKEN=

  EDGE_PRODUCT_ID=
  EDGE_TENANT_ID=
  EDGE_CLIENT_ID=
  EDGE_CLIENT_SECRET=${C.nc}

${C.green}── 一、Chrome Web Store（Google Cloud Console）────────────────${C.nc}

 1. 打开 https://console.cloud.google.com/ ，新建（或选择一个）项目。
 2. 「APIs & Services → Library」中搜索并启用
    ${C.yellow}Chrome Web Store API${C.nc}。
 3. 「APIs & Services → Credentials」→ Create Credentials →
    ${C.yellow}OAuth Client ID${C.nc}，类型选 Desktop app，
    得到 CLIENT ID 与 CLIENT SECRET → 填入 CHROME_CLIENT_ID / CHROME_CLIENT_SECRET。
 4. 「OAuth consent screen」配置为 External 模式（自用无需发布验证）。
 5. 用下方命令做一次交互式授权，拿到 ${C.yellow}REFRESH_TOKEN${C.nc} 填入 CHROME_REFRESH_TOKEN：

      npx chrome-web-store-upload refreshToken \\
        --extensionId=<扩展ID> --clientId=<CLIENT_ID> --clientSecret=<CLIENT_SECRET>

    （或访问 https://developers.google.com/oauthplayground 选择
      https://www.googleapis.com/auth/chromewebstore 授权后获取）
 6. CHROME_EXTENSION_ID 为商店后台该扩展条目 URL 中的 32 位 ID。
    首次发布需先在 https://chrome.google.com/webstore/devconsole
    手动创建扩展条目并上传一次包，之后即可全自动。

${C.green}── 二、Microsoft Edge Add-ons（Azure 门户 + Partner Center）───${C.nc}

 1. 打开 https://portal.azure.com/ 「App registrations」→ New registration，
    账户类型选「Personal Microsoft accounts only」，得到
    ${C.yellow}APPLICATION (CLIENT) ID${C.nc} → 填入 EDGE_CLIENT_ID。
 2. 该应用「Certificates & secrets」→ New client secret，
    复制 ${C.yellow}VALUE${C.nc} → 填入 EDGE_CLIENT_SECRET。
 3. 「API permissions」→ Add a permission → Microsoft Edge Add-ons Developer ID API，
    勾选 ${C.yellow}read_and_write${C.nc}（委托权限无需管理员同意）。
 4. EDGE_TENANT_ID 填 ${C.yellow}common${C.nc}（个人/工作账户均可），
    或在「Overview」查看自己的目录（tenant）ID。
 5. 在 https://partner.microsoft.com/dashboard/microsoftedge/
    注册发布者账户，创建扩展条目并完成一次手动提交（含首次的测试信息），
    条目 URL 中的 GUID 即 ${C.yellow}EDGE_PRODUCT_ID${C.nc}。
    之后本脚本即可自动上传新版本并发布，无需再手工填写。

${C.dim}注：Edge 首次提交时的「测试信息」（演示账号/测试说明）只能在
    Partner Center 网页后台填写，API 会沿用条目上已有的信息。${C.nc}
`;

// ─── 凭据读取 ───

function loadEnv() {
  const vals = {};
  if (!fs.existsSync(envFile)) return vals;
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m) vals[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return vals;
}

const env = { ...loadEnv(), ...process.env };

function requireKeys(label, keys) {
  const missing = keys.filter((k) => !env[k]);
  if (missing.length) {
    err(`${label} 缺少凭据: ${missing.join(', ')}（位于 .env.store）`);
    console.log(SETUP_GUIDE);
    process.exit(1);
  }
}

// ─── 产物定位 ───

function findZip() {
  const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf-8'));
  const zipName = `ai-helper@${pkg.version}.zip`;
  const zipPath = path.join(projectRoot, zipName);
  if (!fs.existsSync(zipPath)) {
    info(`未找到 ${zipName}，先执行 npm run package 构建打包…`);
    try {
      execFileSync('npm', ['run', 'package'], { cwd: projectRoot, stdio: 'inherit' });
    } catch {
      fail('npm run package 失败，无法继续发布');
    }
  }
  if (!fs.existsSync(zipPath)) fail(`打包后仍未找到 ${zipName}`);
  const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
  ok(`发布产物: ${zipName} (${sizeMB} MB, v${pkg.version})`);
  return zipPath;
}

// ─── 通用 HTTP 辅助 (走 curl 以兼容 macOS 系统代理) ───

// Node 内置 fetch 不识别 HTTPS_PROXY，国内开发机默认直连会卡 Google/Microsoft
// 统一改走 curl，并自动探测 macOS 系统代理
function detectSystemProxy() {
  if (process.platform !== 'darwin') return null;
  try {
    const out = execFileSync('scutil', ['--proxy'], { encoding: 'utf-8' });
    const httpsOn = /HTTPSEnable\s*:\s*1/.test(out);
    const host = out.match(/HTTPSProxy\s*:\s*(\S+)/)?.[1];
    const port = out.match(/HTTPSPort\s*:\s*(\d+)/)?.[1];
    if (httpsOn && host && port) return `http://${host}:${port}`;
  } catch { /* 无代理 */ }
  return null;
}
const PROXY = detectSystemProxy();

async function fetchJson(url, options = {}, label) {
  const method = options.method ?? 'GET';
  const headers = options.headers ?? {};
  const body = options.body;
  const args = ['-sS', '--max-time', '120', '-o', '-', '-w', '\n__HTTP_STATUS__%{http_code}', '-X', method];
  if (PROXY) args.push('-x', PROXY);
  for (const [k, v] of Object.entries(headers)) args.push('-H', `${k}: ${v}`);

  // body 形式适配
  if (body instanceof Uint8Array || Buffer.isBuffer?.(body)) {
    // 二进制上传 (Chrome zip)——写临时文件走 --data-binary @file
    const tmp = path.join(os.tmpdir(), `ai-helper-upload-${Date.now()}.bin`);
    fs.writeFileSync(tmp, body);
    args.push('--data-binary', `@${tmp}`);
  } else if (body instanceof URLSearchParams) {
    args.push('--data', body.toString());
  } else if (typeof FormData !== 'undefined' && body instanceof FormData) {
    // multipart: curl -F name=value / -F name=@file
    for (const [k, v] of body.entries()) {
      if (typeof v === 'string') args.push('-F', `${k}=${v}`);
      else {
        const tmp = path.join(os.tmpdir(), `ai-helper-multipart-${Date.now()}-${k}.bin`);
        fs.writeFileSync(tmp, Buffer.from(v instanceof Blob ? await v.arrayBuffer() : v));
        args.push('-F', `${k}=@${tmp};filename=${v.name ?? 'file'}`);
      }
    }
  } else if (body === undefined && (method === 'POST' || method === 'PATCH' || method === 'PUT')) {
    args.push('--data', '');
  }
  args.push(url);

  let stdout;
  try {
    stdout = execFileSync('curl', args, { encoding: 'utf-8', maxBuffer: 32 * 1024 * 1024 });
  } catch (e) {
    throw new Error(`${label}: curl 失败 — ${e.message}`);
  }
  const idx = stdout.lastIndexOf('\n__HTTP_STATUS__');
  const text = idx >= 0 ? stdout.slice(0, idx) : stdout;
  const status = idx >= 0 ? Number(stdout.slice(idx + '\n__HTTP_STATUS__'.length)) : 0;
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (status < 200 || status >= 300) {
    throw new Error(`${label}: HTTP ${status} ${JSON.stringify(parsed).slice(0, 500)}`);
  }
  return parsed;
}

async function pollUntil(isDone, describe, { intervalMs = 10000, timeoutMs = 5 * 60 * 1000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const done = await isDone();
    if (done) return;
    describe();
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error('等待超时，请前往商店后台确认状态');
}

// ─── Chrome Web Store ───

const CHROME_BASE = 'https://www.googleapis.com/chromewebstore/v1.1';

async function getChromeToken() {
  const body = new URLSearchParams({
    client_id: env.CHROME_CLIENT_ID,
    client_secret: env.CHROME_CLIENT_SECRET,
    refresh_token: env.CHROME_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const json = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, 'Chrome OAuth');
  return json.access_token;
}

async function publishChrome(zipPath, dryRun) {
  console.log(`\n${C.cyan}▶ Chrome Web Store${C.nc}`);
  requireKeys('Chrome Web Store', [
    'CHROME_EXTENSION_ID', 'CHROME_CLIENT_ID', 'CHROME_CLIENT_SECRET', 'CHROME_REFRESH_TOKEN',
  ]);
  const id = env.CHROME_EXTENSION_ID;
  ok(`扩展 ID: ${id}`);
  if (dryRun) { ok('[dry-run] 凭据齐全，跳过上传与发布'); return; }

  const token = await getChromeToken();
  ok('access_token 获取成功');

  // 1. 上传 zip（upload 域名带 upload/ 前缀）
  info('上传压缩包…');
  const zip = fs.readFileSync(zipPath);
  const upload = await fetchJson(`${CHROME_BASE.replace('/chromewebstore', '/upload/chromewebstore')}/items/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'X-Goog-Upload-Protocol': 'raw' },
    body: zip,
  }, 'Chrome 上传');
  if (upload.kind && upload.kind !== 'chromewebstore#item') {
    warn(`上传响应格式异常: ${JSON.stringify(upload).slice(0, 200)}`);
  }
  // 上传失败时立即中止, 把 Google 返回的 itemError 展开打印
  if (upload.uploadState === 'FAILURE' || (upload.itemError && upload.itemError.length)) {
    const errs = (upload.itemError ?? []).map((e) => `    - ${e.error_code}: ${e.error_detail}`).join('\n');
    throw new Error(`Chrome 拒收包 (uploadState=${upload.uploadState}):\n${errs || JSON.stringify(upload).slice(0, 400)}`);
  }
  ok(`上传完成（状态: ${upload.uploadState ?? '未知'}）`);

  // 等待商店侧完成包校验
  await pollUntil(
    async () => {
      const item = await fetchJson(`${CHROME_BASE}/items/${id}?projection=private`, {
        headers: { Authorization: `Bearer ${token}` },
      }, 'Chrome 状态查询');
      const state = item.provisioned?.status?.[0]?.statusDetail?.[0] ?? item.status?.[0];
      const uploadState = item.uploadState;
      if (uploadState === 'ACTION_REQUIRED' || uploadState === 'FAILED') {
        throw new Error(`Chrome 后台要求人工处理（${uploadState}），请前往 devconsole 查看`);
      }
      return uploadState === 'PACKAGE_UPLOADED' || state === 'OK' || uploadState === 'NOT_CHECKED_YET';
    },
    () => info('等待 Chrome 包校验…'),
    { intervalMs: 15000, timeoutMs: 3 * 60 * 1000 },
  );
  ok('包校验通过');

  // 2. 发布（visible 目标：全量用户）
  info('发布到线上…');
  const pub = await fetchJson(`${CHROME_BASE}/items/${id}/publish?publishTarget=default`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  }, 'Chrome 发布');
  if (pub.success === false) {
    throw new Error(`Chrome 发布被拒: ${JSON.stringify(pub.statusDetail ?? pub).slice(0, 400)}`);
  }
  ok(`Chrome Web Store 发布请求已接受 ✓（商店生效通常需几分钟到数小时）`);
  console.log(`   https://chromewebstore.google.com/detail/${id}`);
}

// ─── Microsoft Edge Add-ons ───

const EDGE_BASE = 'https://api.addons.microsoftedge.microsoft.com/v1';
const EDGE_SCOPE = 'https://api.addons.microsoftedge.microsoft.com/.default';

async function getEdgeToken() {
  const body = new URLSearchParams({
    client_id: env.EDGE_CLIENT_ID,
    client_secret: env.EDGE_CLIENT_SECRET,
    scope: EDGE_SCOPE,
    grant_type: 'client_credentials',
  });
  const json = await fetchJson(`https://login.microsoftonline.com/${env.EDGE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  }, 'Edge OAuth');
  return json.access_token;
}

async function publishEdge(zipPath, dryRun) {
  console.log(`\n${C.cyan}▶ Microsoft Edge Add-ons${C.nc}`);
  requireKeys('Edge Add-ons', [
    'EDGE_PRODUCT_ID', 'EDGE_TENANT_ID', 'EDGE_CLIENT_ID', 'EDGE_CLIENT_SECRET',
  ]);
  const productId = env.EDGE_PRODUCT_ID;
  ok(`Product ID: ${productId}`);
  if (dryRun) { ok('[dry-run] 凭据齐全，跳过上传与发布'); return; }

  const token = await getEdgeToken();
  ok('access_token 获取成功');
  const headers = { Authorization: `Bearer ${token}` };

  // 1. 创建提交并上传包（multipart: file + data）
  info('上传新版本压缩包…');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(zipPath)], {
    type: 'application/x-zip-compressed',
  }), path.basename(zipPath));
  form.append('data', new Blob([JSON.stringify({ productId, listType: 'Live' })], {
    type: 'application/json',
  }));
  const submission = await fetchJson(`${EDGE_BASE}/products/${productId}/submissions`, {
    method: 'POST',
    headers,
    body: form,
  }, 'Edge 上传提交');
  const submissionId = submission.id ?? submission.submissionId;
  if (!submissionId) throw new Error(`Edge 未返回 submission ID: ${JSON.stringify(submission).slice(0, 300)}`);
  ok(`提交已创建（submission: ${submissionId}）`);

  // 2. 发布该提交
  info('发布提交…');
  await fetchJson(`${EDGE_BASE}/products/${productId}/submissions/${submissionId}/publish`, {
    method: 'PATCH',
    headers,
  }, 'Edge 发布');

  // 3. 轮询提交状态直到终审完成或明确失败
  await pollUntil(
    async () => {
      const sub = await fetchJson(
        `${EDGE_BASE}/products/${productId}/submissions/${submissionId}`,
        { headers }, 'Edge 状态查询');
      const review = sub.currentStatus?.review?.reviewStatus;
      const pub = sub.currentStatus?.publish?.publishStatus;
      if (review === 'Fail' || pub === 'Fail') {
        throw new Error(`Edge 审核未通过，请查看: ${sub.submissionLinks?.partnerCenterLink ?? 'Partner Center 后台'}`);
      }
      if (review === 'Complete' && pub === 'Succeeded') return true;
      info(`Edge 状态: review=${review ?? '?'} publish=${pub ?? '?'}`);
      return false;
    },
    () => {},
    { intervalMs: 60000, timeoutMs: 15 * 60 * 1000 },
  );
  ok('Edge Add-ons 审核通过并已上线 ✓');
  console.log(`   https://microsoftedge.microsoft.com/addons/detail/${productId}`);
}

// ─── 入口 ───

function parseArgs(argv) {
  const targets = [];
  if (argv.includes('--chrome')) targets.push('chrome');
  if (argv.includes('--edge')) targets.push('edge');
  if (argv.includes('--both')) targets.push('chrome', 'edge');
  return {
    targets: [...new Set(targets)],
    dryRun: argv.includes('--dry-run'),
    setup: argv.includes('--setup'),
  };
}

async function main() {
  const { targets, dryRun, setup } = parseArgs(process.argv.slice(2));

  if (setup) {
    console.log(SETUP_GUIDE);
    return;
  }
  if (!targets.length) {
    console.log(`用法: npm run publish:store -- --chrome | --edge | --both [--dry-run]
      --setup   打印 Google Cloud / Microsoft Partner Center 凭据配置引导`);
    process.exit(1);
  }

  console.log(`${C.cyan}════════ AI Helper 扩展商店发布 ════════${C.nc}`);
  const zipPath = findZip();
  const results = [];
  for (const t of targets) {
    try {
      if (t === 'chrome') await publishChrome(zipPath, dryRun);
      else await publishEdge(zipPath, dryRun);
      results.push([t, true]);
    } catch (e) {
      err(`${t} 发布失败: ${e.message}`);
      results.push([t, false]);
    }
  }

  console.log(`\n${C.cyan}════════ 发布结果汇总 ════════${C.nc}`);
  for (const [t, success] of results) {
    console.log(`  ${t.padEnd(7)} ${success ? `${C.green}✓ 成功${C.nc}` : `${C.red}✗ 失败${C.nc}`}`);
  }
  if (results.some(([, s]) => !s)) process.exit(1);
}

main().catch((e) => fail(e.stack ?? String(e)));
