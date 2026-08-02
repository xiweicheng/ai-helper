// scripts/extract-chinese.js
// 扫描 src/side_panel/ 和 src/options/ 下的 JS 文件，提取用户可见的中文字符串
// 输出结构化 JSON，用于批量添加 i18n key
const fs = require('fs');
const path = require('path');

const SIDE_PANEL_DIR = path.join(__dirname, '..', 'src', 'side_panel');
const OPTIONS_DIR = path.join(__dirname, '..', 'src', 'options');

// 匹配中文字符（含连续）
const CN_RE = /[\u4e00-\u9fff]/;

/**
 * 从一行代码中提取中文字符串
 * 只提取用户可见的：showToast/innerHTML/textContent/placeholder/title/文本节点/模板字符串中的中文
 * 排除：注释、logger、console
 */
function extractChineseFromLine(line, filePath, lineNum) {
  const results = [];

  // 跳过注释行
  const trimmed = line.trim();
  if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) return results;

  // 跳过 logger / console
  if (/logger\.(debug|info|warn|error)|console\.(log|debug|info|warn|error)/.test(line)) return results;

  // 提取单引号字符串中的中文
  const singleQuoteRe = /'([^']*[\u4e00-\u9fff][^']*)'/g;
  let m;
  while ((m = singleQuoteRe.exec(line)) !== null) {
    results.push({ raw: m[1], type: 'single', line, filePath, lineNum });
  }

  // 提取双引号字符串中的中文
  const doubleQuoteRe = /"([^"]*[\u4e00-\u9fff][^"]*)"/g;
  while ((m = doubleQuoteRe.exec(line)) !== null) {
    results.push({ raw: m[1], type: 'double', line, filePath, lineNum });
  }

  // 提取模板字符串中的中文（反引号内）
  // 简化处理：提取反引号内的纯中文片段（不含 ${}）
  const templateRe = /`([^`]*[\u4e00-\u9fff][^`]*)`/g;
  while ((m = templateRe.exec(line)) !== null) {
    // 分割模板字符串，提取中文片段
    const segments = m[1].split(/\$\{[^}]*\}/);
    for (const seg of segments) {
      if (CN_RE.test(seg) && seg.trim()) {
        results.push({ raw: seg.trim(), type: 'template', line, filePath, lineNum });
      }
    }
  }

  return results;
}

function scanDir(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const filePath = path.join(dir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const found = extractChineseFromLine(lines[i], filePath, i + 1);
      results.push(...found);
    }
  }
  return results;
}

const all = [...scanDir(SIDE_PANEL_DIR), ...scanDir(OPTIONS_DIR)];

// 按文件分组统计
const byFile = {};
for (const item of all) {
  const fname = path.basename(item.filePath);
  if (!byFile[fname]) byFile[fname] = [];
  byFile[fname].push(item);
}

// 输出统计
console.log('=== 按文件统计 ===');
for (const [file, items] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${items.length}\t${file}`);
}
console.log(`\n总计: ${all.length} 处中文`);

// 输出详细清单（按文件）
console.log('\n=== 详细清单 ===');
for (const [file, items] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`\n--- ${file} (${items.length}) ---`);
  for (const item of items) {
    console.log(`  L${item.lineNum}: ${item.raw.substring(0, 80)}`);
  }
}
