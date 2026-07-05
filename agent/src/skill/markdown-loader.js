// skill/markdown-loader.js - Markdown Skill 加载器
// 扫描子目录中的 SKILL.md，解析 YAML frontmatter 和正文内容
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join, basename, extname } from 'path';
import { execSync } from 'child_process';
import { tmpdir } from 'os';
import https from 'https';
import http from 'http';

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
        console.log(`[Markdown Loader] 加载 Agent Skill: "${skill.name}" v${skill.version} (${skill.resources.length} 个资源)`);
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

/**
 * 从 Zip 文件导入 Skill
 * 要求 zip 包内有一个顶层目录，目录中包含 SKILL.md
 * @param {string} skillsDir - skills 根目录
 * @param {Buffer} zipBuffer - zip 文件内容
 * @param {string} [skillName] - 可选，指定 skill 名称（覆盖压缩包目录名）
 * @returns {Promise<{ success: boolean, error?: string, skill?: Object }>}
 */
export async function importMarkdownSkillFromZip(skillsDir, zipBuffer, skillName) {
  const tmpDir = join(tmpdir(), `ai-helper-skill-import-${Date.now()}`);
  const tmpZip = join(tmpdir(), `ai-helper-skill-${Date.now()}.zip`);

  try {
    mkdirSync(tmpDir, { recursive: true });
    writeFileSync(tmpZip, zipBuffer);

    // 解压到临时目录
    execSync(`unzip -o "${tmpZip}" -d "${tmpDir}"`, { encoding: 'utf-8', timeout: 30000 });

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
    const name = skillName || frontmatter.name || basename(skillDir === tmpDir ? tmpDir : skillDir);

    // 复制到 skills 目录
    const destDir = join(skillsDir, name);
    if (existsSync(destDir)) {
      rmSync(destDir, { recursive: true, force: true });
    }

    execSync(`cp -r "${skillDir}/" "${destDir}"`, { encoding: 'utf-8' });

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
  // URL 安全检查
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, error: '仅支持 http/https 协议的 URL' };
    }
    // 禁止访问内网地址
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]') {
      return { success: false, error: '禁止访问本地地址' };
    }
    // 禁止访问私有网络
    const octets = parsed.hostname.split('.');
    if (octets.length === 4) {
      const first = parseInt(octets[0], 10);
      const second = parseInt(octets[1], 10);
      if (first === 10) return { success: false, error: '禁止访问内网地址' };
      if (first === 172 && second >= 16 && second <= 31) return { success: false, error: '禁止访问内网地址' };
      if (first === 192 && second === 168) return { success: false, error: '禁止访问内网地址' };
    }
  } catch {
    return { success: false, error: '无效的 URL' };
  }

  try {
    const buffer = await downloadFile(url);
    return await importMarkdownSkillFromZip(skillsDir, buffer);
  } catch (err) {
    return { success: false, error: `下载失败: ${err.message}` };
  }
}

/**
 * 下载文件到 Buffer（支持 http/https，最多重定向 5 次）
 */
function downloadFile(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const chunks = [];

    protocol.get(url, { timeout: 60000 }, (res) => {
      // 处理重定向（带次数限制）
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

      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}
