// skill/markdown-loader.js - Markdown Skill 加载器
// 扫描子目录中的 SKILL.md，解析 YAML frontmatter 和正文内容
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, basename, extname, normalize, sep } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { lookup as dnsLookup } from 'dns/promises';
import https from 'https';
import http from 'http';

const execFileAsync = promisify(execFile);

/**
 * 解析 YAML frontmatter（--- 包裹的元数据）
 * 支持基本类型：string, number, boolean, array, object
 * @param {string} content - SKILL.md 完整内容
 * @returns {{ frontmatter: Object, body: string }}
 */
export function parseFrontmatter(content) {
  const frontmatter = {};
  let body = content;

  // 匹配 --- 开头的 frontmatter 块
  const match = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
  if (match) {
    body = content.slice(match[0].length);
    const fmText = match[1];

    // 简易 YAML 解析
    let currentKey = null;
    let currentArray = null;

    for (const rawLine of fmText.split('\n')) {
      const line = rawLine.trimEnd();
      const trimmed = line.trim();

      // 跳过空行和注释
      if (!trimmed || trimmed.startsWith('#')) continue;

      // 检测数组项:   - value
      const arrayItemMatch = line.match(/^\s{2}-\s+(.+)$/);
      if (arrayItemMatch && currentKey) {
        if (!Array.isArray(frontmatter[currentKey])) {
          frontmatter[currentKey] = [];
        }
        let value = arrayItemMatch[1].trim();
        // 去掉引号
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        frontmatter[currentKey].push(parseValue(value));
        continue;
      }

      // 键值对: key: value
      const kvMatch = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*(.*)$/);
      if (kvMatch) {
        currentKey = kvMatch[1];
        const rawValue = kvMatch[2].trim();

        if (rawValue === '') {
          // 空值可能是数组/对象开始
          frontmatter[currentKey] = null;
        } else {
          frontmatter[currentKey] = parseValue(rawValue);
        }
      }
    }
  }

  return { frontmatter, body };
}

/**
 * 解析 YAML 值
 */
function parseValue(raw) {
  if (raw === 'true' || raw === 'false') {
    return raw === 'true';
  }
  if (/^-?\d+$/.test(raw)) {
    return parseInt(raw, 10);
  }
  if (/^-?\d+\.\d+$/.test(raw)) {
    return parseFloat(raw);
  }
  // 去掉引号
  if ((raw.startsWith('"') && raw.endsWith('"')) ||
      (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1);
  }
  return raw;
}

/**
 * 扫描技能目录下的资源文件
 * @param {string} skillDir - 技能根目录
 * @returns {Object[]} - 资源文件列表 [{name, path, type, size}]
 */
export function scanResources(skillDir) {
  const resourceDirs = ['scripts', 'templates', 'assets', 'references'];
  const resources = [];

  for (const dirName of resourceDirs) {
    const dirPath = join(skillDir, dirName);
    if (!existsSync(dirPath)) continue;

    try {
      const stat = statSync(dirPath);
      if (!stat.isDirectory()) continue;

      const files = readdirSync(dirPath, { recursive: true });
      for (const file of files) {
        const fullPath = join(dirPath, file);
        try {
          const fstat = statSync(fullPath);
          if (fstat.isFile()) {
            resources.push({
              name: `${dirName}/${file}`,
              path: fullPath,
              type: extname(file).toLowerCase() || 'unknown',
              size: fstat.size
            });
          }
        } catch { /* skip inaccessible files */ }
      }
    } catch { /* skip inaccessible dirs */ }
  }

  return resources;
}

/**
 * 加载单个 Markdown Skill
 * @param {string} skillDir - 技能子目录路径
 * @returns {Object|null} - Skill 定义或 null
 */
export function loadMarkdownSkill(skillDir) {
  const skillMdPath = join(skillDir, 'SKILL.md');
  if (!existsSync(skillMdPath)) return null;

  try {
    const content = readFileSync(skillMdPath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    // 从目录名推断 name（如果 frontmatter 没提供）
    const name = frontmatter.name || basename(skillDir);
    const description = frontmatter.description || '';
    const version = frontmatter.version || '1.0';

    // 去掉正文开头的 # 标题行（已在 frontmatter 中）
    const promptBody = body.replace(/^#\s+.*\n/, '').trim();

    // 收集资源
    const resources = scanResources(skillDir);

    return {
      type: 'agent',
      name,
      description,
      version,
      enabled: frontmatter.enabled !== false,
      prompt: promptBody,
      fullPrompt: body.trim(), // 含标题的完整 prompt
      resources,
      dirPath: skillDir,
      skillMdPath,
      _filePath: skillMdPath
    };
  } catch (err) {
    console.warn(`[Markdown Loader] 加载 "${skillMdPath}" 失败:`, err.message);
    return null;
  }
}

/**
 * 扫描 skills 目录中所有子目录的 SKILL.md
 * @param {string} skillsDir - skills 根目录
 * @returns {Object[]} - Agent Skill 定义数组
 */
export function loadAllMarkdownSkills(skillsDir) {
  if (!existsSync(skillsDir)) return [];

  const skills = [];
  let entries;
  try {
    entries = readdirSync(skillsDir);
  } catch (err) {
    console.warn('[Markdown Loader] 读取目录失败:', err.message);
    return [];
  }

  for (const entry of entries) {
    const entryPath = join(skillsDir, entry);
    try {
      const stat = statSync(entryPath);
      if (!stat.isDirectory()) continue;

      const skill = loadMarkdownSkill(entryPath);
      if (skill) {
        skills.push(skill);
      }
    } catch { /* skip */ }
  }

  console.log(`[Markdown Loader] 共加载 ${skills.length} 个 Agent Skill`);
  return skills;
}

/**
 * 保存 Markdown Skill 到目录
 * @param {string} skillsDir - skills 根目录
 * @param {Object} skillDef - Skill 定义 { name, description, version, prompt, resources? }
 * @returns {{ success: boolean, error?: string, dirPath?: string }}
 */
export function saveMarkdownSkill(skillsDir, skillDef) {
  try {
    if (!skillDef.name) {
      return { success: false, error: '缺少 name 字段' };
    }
    if (!skillDef.prompt && !skillDef.fullPrompt) {
      return { success: false, error: '缺少 prompt 内容' };
    }

    const skillDir = join(skillsDir, skillDef.name);

    if (!existsSync(skillDir)) {
      mkdirSync(skillDir, { recursive: true });
    }

    // 构建 SKILL.md 内容
    const frontmatterLines = [];
    frontmatterLines.push('---');
    frontmatterLines.push(`name: ${skillDef.name}`);
    frontmatterLines.push(`description: ${skillDef.description || ''}`);
    frontmatterLines.push(`version: ${skillDef.version || '1.0'}`);
    if (skillDef.enabled !== undefined) {
      frontmatterLines.push(`enabled: ${skillDef.enabled}`);
    }
    frontmatterLines.push('---');
    frontmatterLines.push('');

    const prompt = skillDef.fullPrompt || `# ${skillDef.name}\n\n${skillDef.prompt}`;
    const fullContent = frontmatterLines.join('\n') + prompt;

    writeFileSync(join(skillDir, 'SKILL.md'), fullContent, 'utf-8');

    return { success: true, dirPath: skillDir };
  } catch (err) {
    return { success: false, error: `保存失败: ${err.message}` };
  }
}

/**
 * 删除 Markdown Skill 目录
 * @param {string} skillsDir - skills 根目录
 * @param {string} name - Skill 名称
 */
export function deleteMarkdownSkillDir(skillsDir, name) {
  const skillDir = join(skillsDir, name);
  if (!existsSync(skillDir)) {
    return { success: false, error: `Skill "${name}" 不存在` };
  }
  try {
    rmSync(skillDir, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: `删除失败: ${err.message}` };
  }
}

// Skill 下载大小上限（20MB）
const MAX_SKILL_DOWNLOAD_SIZE = 20 * 1024 * 1024;

/**
 * 判断 IP 字符串是否为私有/环回/链路本地等内网地址
 */
function isPrivateIp(ip) {
  // IPv4
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = parseInt(v4[1], 10);
    const b = parseInt(v4[2], 10);
    if (a === 10) return true;                            // 10.0.0.0/8
    if (a === 127) return true;                           // 127.0.0.0/8 环回（全段）
    if (a === 0) return true;                             // 0.0.0.0/8
    if (a === 169 && b === 254) return true;              // 169.254.0.0/16 链路本地（含云元数据）
    if (a === 172 && b >= 16 && b <= 31) return true;     // 172.16.0.0/12
    if (a === 192 && b === 168) return true;              // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true;    // 100.64.0.0/10 CGNAT
    return false;
  }
  // IPv6（含 ::ffff:IPv4 映射）
  const v6 = ip.toLowerCase().replace(/^\[|]$/g, '');
  const mapped = v6.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mapped) return isPrivateIp(mapped[1]);
  if (v6 === '::1' || v6 === '::') return true;           // 环回/未指定
  if (v6.startsWith('fc') || v6.startsWith('fd')) return true;  // fc00::/7 唯一本地
  if (/^fe[89ab]/.test(v6)) return true;                  // fe80::/10 链路本地
  return false;
}

/**
 * 校验 URL 主机是否为公网地址（含 DNS 解析，防 DNS 重绑定与 IP 编码绕过）
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
async function assertPublicHost(hostname) {
  if (!hostname) return { ok: false, error: '缺少 hostname' };
  const blockedHostnames = ['localhost', 'ip6-localhost', 'ip6-loopback'];
  if (blockedHostnames.includes(hostname.toLowerCase())) {
    return { ok: false, error: '禁止访问本地地址' };
  }
  // 直接 IP 形式（含 IPv6）：直接判断
  const stripped = hostname.replace(/^\[|]$/g, '');
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(stripped) || /^[0-9a-f:]+$/i.test(stripped)) {
    if (isPrivateIp(stripped)) return { ok: false, error: '禁止访问内网地址' };
    return { ok: true };
  }
  // 域名：DNS 解析后判断所有结果（防 DNS 重绑定：解析阶段即拒绝内网 IP）
  try {
    const results = await dnsLookup(hostname, { all: true });
    if (results.length === 0) return { ok: false, error: `域名解析为空: ${hostname}` };
    for (const r of results) {
      if (isPrivateIp(r.address)) {
        return { ok: false, error: `域名 ${hostname} 解析到内网地址 ${r.address}` };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: `域名解析失败: ${hostname}` };
  }
}

/**
 * 校验 Skill 名称：仅允许字母、数字、下划线、短横线，防止命令注入与路径穿越
 */
function sanitizeSkillName(name) {
  if (typeof name !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(name)) {
    return null;
  }
  return name;
}

/**
 * 从 Zip 文件导入 Skill
 * 要求 zip 包内有一个顶层目录，目录中包含 SKILL.md
 * @param {string} skillsDir - skills 根目录
 * @param {Buffer} zipBuffer - zip 文件内容
 * @param {string} [skillName] - 可选，指定 skill 名称（覆盖压缩包目录名）
 * @returns {Promise<{ success: boolean, error?: string, skill?: Object }>}
 */
export async function importMarkdownSkillFromZip(skillsDir, zipBuffer, skillName) {
  const tmpDir = join(tmpdir(), `ai-helper-skill-import-${Date.now()}-${randomBytes(4).toString('hex')}`);
  const tmpZip = join(tmpdir(), `ai-helper-skill-${Date.now()}-${randomBytes(4).toString('hex')}.zip`);

  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tmpZip, zipBuffer);

    // 解压到临时目录（execFile 数组参数，不经 shell，杜绝命令注入）
    await execFileAsync('unzip', ['-o', tmpZip, '-d', tmpDir], { timeout: 30000 });

    // 查找 SKILL.md
    const entries = readdirSync(tmpDir);
    let skillDir = null;
    let foundSkillMd = null;

    for (const entry of entries) {
      const fullPath = join(tmpDir, entry);
      const st = statSync(fullPath);

      if (st.isDirectory()) {
        const mdPath = join(fullPath, 'SKILL.md');
        if (existsSync(mdPath)) {
          skillDir = fullPath;
          foundSkillMd = mdPath;
          break;
        }
      } else if (entry === 'SKILL.md') {
        // SKILL.md 直接在根目录
        skillDir = tmpDir;
        foundSkillMd = fullPath;
        break;
      }
    }

    if (!foundSkillMd) {
      return { success: false, error: 'Zip 包中未找到 SKILL.md 文件' };
    }

    const content = readFileSync(foundSkillMd, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);
    const rawName = skillName || frontmatter.name || basename(skillDir === tmpDir ? tmpDir : skillDir);

    // 名称安全校验：防止命令注入与路径穿越（name 来源于 zip 内可控内容）
    const safeName = sanitizeSkillName(rawName);
    if (!safeName) {
      return { success: false, error: `无效的 Skill 名称: "${rawName}"（仅允许字母、数字、下划线、短横线）` };
    }

    // 目标目录越界校验：确保 destDir 仍在 skillsDir 之下
    const destDir = join(skillsDir, safeName);
    const normalizedDest = normalize(destDir);
    const normalizedSkills = normalize(skillsDir);
    if (normalizedDest !== normalizedSkills &&
        !(normalizedDest.startsWith(normalizedSkills + sep))) {
      return { success: false, error: '目标路径越界，拒绝写入' };
    }

    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true });
    }

    // 复制（execFile 数组参数，不经 shell）
    await execFileAsync('cp', ['-r', skillDir + '/.', destDir], { timeout: 30000 });

    // 重新加载
    const skill = loadMarkdownSkill(destDir);
    return { success: true, skill };
  } catch (err) {
    return { success: false, error: `导入失败: ${err.message}` };
  } finally {
    // 清理临时文件
    try {
      rmSync(tmpDir, { recursive: true, force: true });
      if (existsSync(tmpZip)) rmSync(tmpZip);
    } catch { /* ignore cleanup errors */ }
  }
}

/**
 * 从 URL 下载并导入 Skill zip 包
 * @param {string} skillsDir
 * @param {string} url
 * @returns {Promise<{ success: boolean, error?: string, skill?: Object }>}
 */
export async function importMarkdownSkillFromUrl(skillsDir, url) {
  // URL 基础校验
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false, error: '无效的 URL' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { success: false, error: '仅支持 http/https 协议的 URL' };
  }
  // 主机安全校验（含 DNS 解析，防 DNS 重绑定与 IP 编码绕过）
  const hostCheck = await assertPublicHost(parsed.hostname);
  if (!hostCheck.ok) {
    return { success: false, error: hostCheck.error };
  }

  try {
    const buffer = await downloadFile(url, 5);
    return await importMarkdownSkillFromZip(skillsDir, buffer);
  } catch (err) {
    return { success: false, error: `下载失败: ${err.message}` };
  }
}

/**
 * 下载文件到 Buffer（支持 http/https，最多重定向 5 次）
 * 安全：每次重定向目标都重新校验主机（防 302 跳转到内网/云元数据端点）；限制响应体大小
 */
function downloadFile(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      reject(new Error('无效的重定向 URL'));
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      reject(new Error('仅支持 http/https 协议'));
      return;
    }
    // 重定向目标必须重新校验主机（防止 302 跳转到内网/元数据端点）
    assertPublicHost(parsed.hostname).then((hostCheck) => {
      if (!hostCheck.ok) {
        reject(new Error(`重定向被拦截: ${hostCheck.error}`));
        return;
      }
      const protocol = parsed.protocol === 'https:' ? https : http;
      const chunks = [];
      let totalSize = 0;

      const req = protocol.get(url, { timeout: 60000 }, (res) => {
        // 处理重定向（带次数限制 + 主机重校验）
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (maxRedirects <= 0) {
            reject(new Error('重定向次数过多'));
            return;
          }
          downloadFile(res.headers.location, maxRedirects - 1).then(resolve).catch(reject);
          return;
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        res.on('data', (chunk) => {
          totalSize += chunk.length;
          if (totalSize > MAX_SKILL_DOWNLOAD_SIZE) {
            reject(new Error(`下载内容超过上限 ${MAX_SKILL_DOWNLOAD_SIZE} 字节`));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('下载超时'));
      });
    }).catch(reject);
  });
}
