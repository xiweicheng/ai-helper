// skill/markdown-loader.js - Markdown Skill 加载器
// 扫描子目录中的 SKILL.md，解析 YAML frontmatter 和正文内容
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'fs';
import { join, basename, extname, normalize, sep, dirname } from 'path';
import { inflateRawSync } from 'zlib';
import { randomBytes } from 'crypto';
import { tmpdir } from 'os';
import { lookup as dnsLookup } from 'dns/promises';
import https from 'https';
import http from 'http';
import { t as translate } from '../i18n.js';

// 当前模块使用的语言（由 server.js 在请求入口处设置）
let currentLang = 'zh';

/**
 * 设置 markdown-loader 模块当前使用的语言（由 server.js 在请求入口处调用）
 * @param {string} lang - 语言代码（'zh' | 'en'）
 */
export function setMarkdownLoaderLang(lang) {
  if (lang) currentLang = lang;
}

/**
 * 翻译辅助
 * @param {string} key - 翻译 key
 * @param {object} [params] - 插值参数
 * @returns {string}
 */
function tr(key, params) {
  return translate(currentLang, key, params);
}

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
    console.warn(`[Markdown Loader] Load "${skillMdPath}" failed:`, err.message);
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
    console.warn('[Markdown Loader] Read directory failed:', err.message);
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
      return { success: false, error: tr('skill.missingNameField') };
    }
    if (!skillDef.prompt && !skillDef.fullPrompt) {
      return { success: false, error: tr('skill.missingPromptContent') };
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
    return { success: false, error: tr('skill.saveFailed', { message: err.message }) };
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
    return { success: false, error: tr('skill.skillNotFound', { name }) };
  }
  try {
    rmSync(skillDir, { recursive: true, force: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: tr('skill.deleteFailed', { message: err.message }) };
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
  if (!hostname) return { ok: false, error: tr('skill.missingHostname') };
  const blockedHostnames = ['localhost', 'ip6-localhost', 'ip6-loopback'];
  if (blockedHostnames.includes(hostname.toLowerCase())) {
    return { ok: false, error: tr('skill.forbiddenLocalAddress') };
  }
  // 直接 IP 形式（含 IPv6）：直接判断
  const stripped = hostname.replace(/^\[|]$/g, '');
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(stripped) || /^[0-9a-f:]+$/i.test(stripped)) {
    if (isPrivateIp(stripped)) return { ok: false, error: tr('skill.forbiddenPrivateAddress') };
    return { ok: true };
  }
  // 域名：DNS 解析后判断所有结果（防 DNS 重绑定：解析阶段即拒绝内网 IP）
  try {
    const results = await dnsLookup(hostname, { all: true });
    if (results.length === 0) return { ok: false, error: tr('skill.dnsEmptyResult', { hostname }) };
    for (const r of results) {
      if (isPrivateIp(r.address)) {
        return { ok: false, error: tr('skill.dnsResolvesPrivate', { hostname, address: r.address }) };
      }
    }
    return { ok: true };
  } catch {
    return { ok: false, error: tr('skill.dnsFailed', { hostname }) };
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
 * 纯 JavaScript ZIP 解压，替换外部命令（powershell/unzip），消除 spawn EPERM 问题
 * 支持 stored（无压缩）和 deflate（压缩方法 8）两种方式
 * 内置路径穿越安全校验
 * @param {Buffer} zipBuffer - ZIP 文件内容
 * @param {string} destDir - 解压目标目录
 * @throws {Error} 解压或安全校验失败时抛出
 */
function extractZipPureJs(zipBuffer, destDir) {
  const EOCD_SIG = 0x06054b50;
  const CD_SIG = 0x02014b50;
  const LFH_SIG = 0x04034b50;

  // 1. 从末尾反向扫描 EOCD（End of Central Directory）
  let eocdOffset = -1;
  const maxComment = Math.min(65535, zipBuffer.length - 22);
  for (let i = zipBuffer.length - 22; i >= Math.max(0, zipBuffer.length - 22 - maxComment); i--) {
    if (zipBuffer.readUInt32LE(i) === EOCD_SIG) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('Invalid ZIP: EOCD not found');

  // 2. 读取 Central Directory 元信息
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const cdSize  = zipBuffer.readUInt32LE(eocdOffset + 12);
  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 8);

  // 3. 解析 Central Directory 条目，收集文件信息
  let cdPos = cdOffset;
  const entries = [];

  for (let i = 0; i < totalEntries; i++) {
    if (zipBuffer.readUInt32LE(cdPos) !== CD_SIG) throw new Error('Invalid central directory entry');

    const compressionMethod   = zipBuffer.readUInt16LE(cdPos + 10);
    const compressedSize      = zipBuffer.readUInt32LE(cdPos + 20);
    const uncompressedSize    = zipBuffer.readUInt32LE(cdPos + 24);
    const fileNameLen         = zipBuffer.readUInt16LE(cdPos + 28);
    const extraLen            = zipBuffer.readUInt16LE(cdPos + 30);
    const commentLen          = zipBuffer.readUInt16LE(cdPos + 32);
    const localHeaderOffset   = zipBuffer.readUInt32LE(cdPos + 42);

    const fileName = zipBuffer.slice(cdPos + 46, cdPos + 46 + fileNameLen).toString('utf8');

    entries.push({ fileName, compressionMethod, localHeaderOffset, compressedSize, uncompressedSize });

    cdPos += 46 + fileNameLen + extraLen + commentLen;
  }

  // 4. 逐文件解压并写入磁盘
  for (const entry of entries) {
    // 跳过目录条目（以 / 结尾）
    if (entry.fileName.endsWith('/') || entry.fileName.endsWith('\\')) continue;

    // 路径穿越安全校验：拒绝 .. 或绝对路径
    const normalizedName = normalize(entry.fileName).replace(/^[/\\]+/, '');
    if (normalizedName.startsWith('..') || entry.fileName.startsWith('/')) {
      throw new Error(`Path traversal detected: ${entry.fileName}`);
    }

    // 读取本地文件头（Local File Header）
    const lfh = entry.localHeaderOffset;
    if (zipBuffer.readUInt32LE(lfh) !== LFH_SIG) throw new Error(`Invalid local file header for: ${entry.fileName}`);

    const lfhFileNameLen = zipBuffer.readUInt16LE(lfh + 26);
    const lfhExtraLen    = zipBuffer.readUInt16LE(lfh + 28);
    const dataOffset     = lfh + 30 + lfhFileNameLen + lfhExtraLen;

    // 根据压缩方法提取数据
    let fileData;
    if (entry.compressionMethod === 0) {
      // Stored（无压缩）
      fileData = zipBuffer.slice(dataOffset, dataOffset + entry.uncompressedSize);
    } else if (entry.compressionMethod === 8) {
      // Deflate 压缩（zlib inflateRawSync 可直接解压）
      const compressed = zipBuffer.slice(dataOffset, dataOffset + entry.compressedSize);
      fileData = inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported compression method ${entry.compressionMethod} for: ${entry.fileName}`);
    }

    // 写入目标文件
    const destPath = join(destDir, normalizedName);
    mkdirSync(dirname(destPath), { recursive: true });
    writeFileSync(destPath, fileData);
  }
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

  try {
    mkdirSync(tmpDir, { recursive: true });

    // 纯 JavaScript ZIP 解压（无需外部命令，消除 spawn EPERM）
    extractZipPureJs(zipBuffer, tmpDir);

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
      return { success: false, error: tr('skill.zipNoSkillMd') };
    }

    const content = readFileSync(foundSkillMd, 'utf-8');
    const { frontmatter } = parseFrontmatter(content);
    const rawName = skillName || frontmatter.name || basename(skillDir === tmpDir ? tmpDir : skillDir);

    // 名称安全校验：防止命令注入与路径穿越（name 来源于 zip 内可控内容）
    const safeName = sanitizeSkillName(rawName);
    if (!safeName) {
      return { success: false, error: tr('skill.invalidSkillName', { name: rawName }) };
    }

    // 目标目录越界校验：确保 destDir 仍在 skillsDir 之下
    const destDir = join(skillsDir, safeName);
    const normalizedDest = normalize(destDir);
    const normalizedSkills = normalize(skillsDir);
    if (normalizedDest !== normalizedSkills &&
        !(normalizedDest.startsWith(normalizedSkills + sep))) {
      return { success: false, error: tr('skill.targetPathEscape') };
    }

    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true });
    }

    // 复制（跨平台：fs.cpSync 替代 cp -r，Windows 无 cp 命令）
    cpSync(skillDir, destDir, { recursive: true });

    // 重新加载
    const skill = loadMarkdownSkill(destDir);
    return { success: true, skill };
  } catch (err) {
    return { success: false, error: tr('skill.importFailed', { message: err.message }) };
  } finally {
    // 清理临时文件
    try {
      rmSync(tmpDir, { recursive: true, force: true });
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
    return { success: false, error: tr('skill.invalidUrl') };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { success: false, error: tr('skill.urlProtocolNotSupported') };
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
    return { success: false, error: tr('skill.downloadFailed', { message: err.message }) };
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
      reject(new Error(tr('skill.invalidRedirectUrl')));
      return;
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      reject(new Error(tr('skill.protocolNotSupported')));
      return;
    }
    // 重定向目标必须重新校验主机（防止 302 跳转到内网/元数据端点）
    assertPublicHost(parsed.hostname).then((hostCheck) => {
      if (!hostCheck.ok) {
        reject(new Error(tr('skill.redirectBlocked', { error: hostCheck.error })));
        return;
      }
      const protocol = parsed.protocol === 'https:' ? https : http;
      const chunks = [];
      let totalSize = 0;

      const req = protocol.get(url, { timeout: 60000 }, (res) => {
        // 处理重定向（带次数限制 + 主机重校验）
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          if (maxRedirects <= 0) {
            reject(new Error(tr('skill.tooManyRedirects')));
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
            reject(new Error(tr('skill.downloadTooLarge', { size: MAX_SKILL_DOWNLOAD_SIZE })));
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
        req.destroy(new Error(tr('skill.downloadTimeout')));
      });
    }).catch(reject);
  });
}
