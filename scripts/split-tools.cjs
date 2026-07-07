/**
 * 将 constants.js 中的 RAW_TOOLS 按类别拆分为独立文件
 * 使用括号深度跟踪来正确拆分每个工具定义
 */
const fs = require('fs');
const path = require('path');

const toolsDir = path.join(__dirname, '..', 'src', 'background', 'tools');
if (!fs.existsSync(toolsDir)) {
  fs.mkdirSync(toolsDir, { recursive: true });
}

const constantsPath = path.join(__dirname, '..', 'src', 'background', 'constants.js');
const lines = fs.readFileSync(constantsPath, 'utf-8').split('\n');

// 找到 RAW_TOOLS 数组的起止行
let startLine = -1;
let endLine = -1;
let inArray = false;
let braceDepth = 0;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  if (line.trim() === 'export const RAW_TOOLS = [') {
    startLine = i + 1; // 数组内容从下一行开始
    braceDepth = 0;
    inArray = true;
    continue;
  }
  if (inArray) {
    // 跟踪括号深度
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
    }
    // 当回到顶层且遇到 ]; 时，数组结束
    if (braceDepth === 0 && line.trim() === '];') {
      endLine = i;
      break;
    }
  }
}

if (startLine < 0 || endLine < 0) {
  console.error('Cannot find RAW_TOOLS array bounds');
  process.exit(1);
}

console.log(`RAW_TOOLS: lines ${startLine}-${endLine}`);

// 提取数组内容行
const arrayLines = lines.slice(startLine, endLine);

// 按工具对象拆分：每个工具对象从 '{' 开始，到匹配的 '},' 或 '}' 结束
const toolDefs = [];
let currentToolLines = [];
let toolDepth = 0;
let inTool = false;

for (const line of arrayLines) {
  const trimmed = line.trim();
  
  if (!inTool && trimmed.startsWith('{')) {
    inTool = true;
    toolDepth = 0;
    currentToolLines = [];
  }
  
  if (inTool) {
    currentToolLines.push(line);
    for (const ch of line) {
      if (ch === '{') toolDepth++;
      if (ch === '}') toolDepth--;
    }
    
    if (toolDepth === 0 && currentToolLines.length > 0) {
      // 工具定义结束 - 找到闭合的 '}' 或 '},'
      const toolText = currentToolLines.join('\n');
      toolDefs.push(toolText);
      currentToolLines = [];
      inTool = false;
    }
  }
}

console.log(`Parsed ${toolDefs.length} tool definitions`);

// 按 category 分组
const groups = {};
toolDefs.forEach(def => {
  const catMatch = def.match(/category:\s*'([^']+)'/);
  if (!catMatch) {
    console.warn('No category found in:', def.substring(0, 80));
    return;
  }
  const category = catMatch[1];
  if (!groups[category]) groups[category] = [];
  groups[category].push(def);
});

// 合并类别到文件
const FILE_MAP = {
  'browser-tools.js': ['page_interaction', 'form_operation', 'content_extraction'],
  'tab-tools.js': ['tab_management', 'bookmark_history'],
  'storage-tools.js': ['storage_management', 'network_request'],
  'media-tools.js': ['media_output', 'debug_dev'],
  'ai-tools.js': ['ai_collaboration'],
  'agent-tools.js': ['local_agent'],
};

let totalWritten = 0;

const importStatements = [];
const rawToolsItems = [];

Object.entries(FILE_MAP).forEach(([filename, categories]) => {
  const tools = [];
  categories.forEach(cat => {
    if (groups[cat]) {
      groups[cat].forEach(def => tools.push(def));
    }
  });

  if (tools.length > 0) {
    const varMap = {
      'browser-tools.js': 'BROWSER_TOOLS',
      'tab-tools.js': 'TAB_TOOLS',
      'storage-tools.js': 'STORAGE_TOOLS',
      'media-tools.js': 'MEDIA_TOOLS',
      'ai-tools.js': 'AI_TOOLS',
      'agent-tools.js': 'AGENT_TOOLS',
      'mcp-tools.js': 'MCP_TOOLS',
    };
    const varName = varMap[filename];
    
    const fileContent = `// ${filename.replace('.js', '')} - ${categories.map(c => c.replace(/_/g, ' ')).join(' + ')} 工具定义\n\n`
      + `export const ${varName} = [\n`
      + tools.map(t => t.replace(/,\s*$/, '')).join(',\n')
      + '\n];\n';
    
    fs.writeFileSync(path.join(toolsDir, filename), fileContent, 'utf-8');
    console.log(`  tools/${filename}: ${tools.length} tools`);
    totalWritten += tools.length;
    
    importStatements.push(`import { ${varName} } from './tools/${filename}';`);
    rawToolsItems.push(`  ...${varName},`);
  }
});

// 处理 mcp 类别（如果存在）
if (groups['mcp'] && groups['mcp'].length > 0) {
  const filename = 'mcp-tools.js';
  const varName = 'MCP_TOOLS';
  const fileContent = `// mcp-tools - MCP 工具定义\n\n`
    + `export const ${varName} = [\n`
    + groups['mcp'].join(',\n')
    + '\n];\n';
  fs.writeFileSync(path.join(toolsDir, filename), fileContent, 'utf-8');
  console.log(`  tools/${filename}: ${groups['mcp'].length} tools`);
  totalWritten += groups['mcp'].length;
  importStatements.push(`import { ${varName} } from './tools/${filename}';`);
  rawToolsItems.push(`  ...${varName},`);
}

// 生成新的 RAW_TOOLS 部分
const newRawToolsSection = [
  '// ==================== 工具定义（按类别拆分到 tools/ 目录） ====================',
  '',
  ...importStatements,
  '',
  'export const RAW_TOOLS = [',
  ...rawToolsItems,
  '];',
].join('\n');

// 替换 constants.js
let content = fs.readFileSync(constantsPath, 'utf-8');
const startIdx = content.indexOf('export const RAW_TOOLS = [');
const endIdx = content.indexOf('];', startIdx) + 2;

content = content.substring(0, startIdx) + newRawToolsSection + content.substring(endIdx);

fs.writeFileSync(constantsPath, content, 'utf-8');
console.log(`\nTotal tools written: ${totalWritten}`);
console.log('Updated: constants.js');
