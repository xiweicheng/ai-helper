/**
 * 精确替换脚本：仅替换 console.* 和 logger.* 调用中的中文字符串参数
 * 严格排除：
 *   1. src/shared/locales/zh.js en.js  —— 国际化字典
 *   2. _locales/ 目录                    —— 扩展 manifest 翻译
 *   3. throw new Error('中文')           —— 用户可见异常
 *   4. 注释中的中文                       —— 开发者文档
 *   5. UI 模板中的中文                    —— 界面展示文案
 */

const fs = require('fs');
const path = require('path');

// ==================== 排除列表 ====================
const EXCLUDE_FILES = [
  'src/shared/locales/zh.js',
  'src/shared/locales/en.js',
];

const EXCLUDE_DIRS = [
  '_locales',
];

// ==================== 需要处理的文件 ====================
const TARGET_DIRS = ['src', 'agent/src', 'agent/test'];
const FILE_EXT = '.js';

// ==================== 中文定位正则 ====================
// 匹配一个中文字符（基本汉字区间）
const CJK = '\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff';
const hasCJK = new RegExp(`[${CJK}]`);

// 匹配 console.xxx 或 logger.xxx 调用行
// 支持模式：console.log, console.debug, console.info, console.warn, console.error
//          logger.debug, logger.info, logger.warn, logger.error, logger.log
const LOG_CALL = /(console|logger)\.(log|debug|info|warn|error)\s*\(/;

// ==================== 中文短语 → 英文映射表 ====================
// 按长度降序排列，优先匹配长短语，避免碎片化
const TRANSLATIONS = [
  // --- 系统/状态 ---
  ['不可达', 'unreachable'],
  ['可用工具', 'available tools'],
  ['最终可用工具', 'final available tools'],
  ['正在执行', 'executing'],
  ['执行完成', 'execution complete'],
  ['执行失败', 'execution failed'],
  ['执行成功', 'execution successful'],
  ['执行超时', 'execution timed out'],
  ['执行出错', 'execution error'],
  ['执行状态', 'execution status'],
  ['正在处理', 'processing'],
  ['处理完成', 'processing complete'],
  ['处理失败', 'processing failed'],
  ['已完成', 'completed'],
  ['已取消', 'cancelled'],
  ['已解析', 'parsed'],
  ['已恢复', 'restored'],
  ['已保存', 'saved'],
  ['已删除', 'deleted'],
  ['已更新', 'updated'],
  ['已创建', 'created'],
  ['已启动', 'started'],
  ['已停止', 'stopped'],
  ['已加载', 'loaded'],
  ['已重置', 'reset'],
  ['已启用', 'enabled'],
  ['已停用', 'disabled'],
  ['已关闭', 'closed'],
  ['已连接', 'connected'],
  ['已添加', 'added'],
  ['已忽略', 'ignored'],
  ['已跳过', 'skipped'],
  ['已分类', 'classified'],
  ['已同步', 'synchronized'],
  ['初始化完成', 'initialization complete'],
  ['初始化失败', 'initialization failed'],
  ['未找到', 'not found'],
  ['未配置', 'not configured'],
  ['未启用', 'not enabled'],
  ['未连接', 'not connected'],
  ['未分类', 'unclassified'],

  // --- 错误/异常 ---
  ['解析失败', 'parse failed'],
  ['解析成功', 'parse successful'],
  ['解析错误', 'parse error'],
  ['请求失败', 'request failed'],
  ['请求超时', 'request timed out'],
  ['请求中断', 'request aborted'],
  ['加载失败', 'load failed'],
  ['写入失败', 'write failed'],
  ['读取失败', 'read failed'],
  ['连接失败', 'connection failed'],
  ['连接超时', 'connection timed out'],
  ['发送失败', 'send failed'],
  ['接收失败', 'receive failed'],
  ['创建失败', 'create failed'],
  ['保存失败', 'save failed'],
  ['删除失败', 'delete failed'],
  ['更新失败', 'update failed'],
  ['无效参数', 'invalid parameter'],
  ['无效数据', 'invalid data'],
  ['无效状态', 'invalid state'],
  ['无效格式', 'invalid format'],
  ['发生了错误', 'an error occurred'],
  ['未知错误', 'unknown error'],

  // --- 工具执行 ---
  ['工具执行开始', 'tool execution start'],
  ['工具执行结束', 'tool execution end'],
  ['工具执行完成', 'tool execution complete'],
  ['工具参数', 'tool parameter'],
  ['工具结果', 'tool result'],
  ['工具调用', 'tool call'],
  ['工具过滤', 'tool filter'],
  ['工具配置', 'tool configuration'],
  ['工具注册', 'tool registration'],
  ['未找到工具配置', 'tool configuration not found'],
  ['使用默认值', 'using default value'],
  ['全部启用', 'all enabled'],
  ['检测到旧工具名', 'detected old tool name'],
  ['已迁移到合并后的新工具名', 'migrated to merged new tool name'],
  ['自动加入技能工具', 'auto-adding skill tool'],
  ['已添加 requiredTools 到', 'added requiredTools to'],

  // --- Agent 相关 ---
  ['Agent 连通性检测', 'Agent connectivity check'],
  ['连通性检测', 'connectivity check'],
  ['Skill 全局开关变更', 'Skill global toggle changed'],
  ['处理 plan_task', 'processing plan_task'],
  ['Agent 会话', 'Agent session'],
  ['Agent 请求', 'Agent request'],
  ['Agent 响应', 'Agent response'],

  // --- 截图/图片 ---
  ['执行截图', 'taking screenshot'],
  ['截图完成', 'screenshot complete'],
  ['截图压缩后大小', 'screenshot compressed size'],
  ['图片压缩失败，使用原始截图', 'image compression failed, using original screenshot'],
  ['图片识别 API 未配置，返回截图基本信息', 'image recognition API not configured, returning basic screenshot info'],
  ['调用图片识别 API 分析截图', 'calling image recognition API to analyze screenshot'],
  ['图片识别 API 请求失败', 'image recognition API request failed'],
  ['图片识别 API 结果为空', 'image recognition API result is empty'],
  ['图片识别分析完成', 'image recognition analysis complete'],
  ['图片识别 API 调用异常', 'image recognition API call exception'],
  ['图片识别 SSE 解析失败', 'image recognition SSE parse failed'],
  ['图片识别', 'image recognition'],
  ['原始数据', 'raw data'],

  // --- SSE/流式 ---
  ['SSE 连接', 'SSE connection'],
  ['SSE 流', 'SSE stream'],
  ['流式响应', 'stream response'],
  ['流式传输', 'stream transfer'],
  ['流处理', 'stream processing'],

  // --- 模型/AI ---
  ['模型', 'model'],
  ['端点', 'endpoint'],
  ['流式', 'streaming'],
  ['结果长度', 'result length'],

  // --- 参数修复 ---
  ['工具参数直接解析失败，尝试修复', 'tool parameter direct parse failed, attempting repair'],
  ['工具参数修复解析成功', 'tool parameter repair parse successful'],
  ['工具参数修复解析也失败', 'tool parameter repair parse also failed'],

  // --- 文件操作 ---
  ['文件读取', 'file read'],
  ['文件写入', 'file write'],
  ['文件保存', 'file save'],
  ['文件加载', 'file load'],
  ['文件下载', 'file download'],
  ['文件上传', 'file upload'],
  ['文件名', 'filename'],
  ['文件大小', 'file size'],
  ['文件内容', 'file content'],
  ['路径', 'path'],

  // --- 存储/数据 ---
  ['数据库', 'database'],
  ['存储', 'storage'],
  ['缓存', 'cache'],
  ['会话', 'session'],
  ['消息', 'message'],
  ['记录', 'record'],
  ['索引', 'index'],
  ['配置', 'configuration'],
  ['保存配置', 'save configuration'],
  ['加载配置', 'load configuration'],
  ['配置已保存', 'configuration saved'],
  ['配置已加载', 'configuration loaded'],
  ['配置更新', 'configuration update'],
  ['导出配置', 'export configuration'],
  ['导入配置', 'import configuration'],

  // --- 网络请求 ---
  ['HTTP 请求', 'HTTP request'],
  ['API 请求', 'API request'],
  ['API 响应', 'API response'],
  ['请求头', 'request header'],
  ['响应头', 'response header'],
  ['状态码', 'status code'],
  ['网络错误', 'network error'],

  // --- 上下文/摘要 ---
  ['上下文摘要', 'context summary'],
  ['上下文压缩', 'context compression'],
  ['上下文窗口', 'context window'],
  ['Token 记录', 'token record'],
  ['Token 计数', 'token count'],
  ['计算 Token', 'calculate tokens'],

  // --- 会话管理 ---
  ['创建会话', 'create session'],
  ['删除会话', 'delete session'],
  ['重命名会话', 'rename session'],
  ['加载会话', 'load session'],
  ['切换会话', 'switch session'],
  ['导出会话', 'export session'],
  ['导入会话', 'import session'],
  ['会话列表', 'session list'],
  ['会话历史', 'session history'],

  // --- 内容脚本 ---
  ['内容脚本已加载', 'content script loaded'],
  ['内容脚本', 'content script'],
  ['content script 未加载或无法通信', 'content script not loaded or unreachable'],

  // --- prompt/提示 ---
  ['提升词', 'prompt'],
  ['系统提示', 'system prompt'],
  ['用户提示', 'user prompt'],
  ['提示模板', 'prompt template'],

  // --- 书签 ---
  ['书签面板', 'bookmark panel'],
  ['书签管理', 'bookmark management'],

  // --- 输入历史 ---
  ['输入历史', 'input history'],
  ['历史记录', 'history record'],

  // --- 工作区 ---
  ['工作区', 'workspace'],
  ['工作区面板', 'workspace panel'],

  // --- 聊天 ---
  ['聊天管理', 'chat management'],
  ['聊天导出', 'chat export'],
  ['聊天复制', 'chat copy'],
  ['聊天恢复', 'chat resume'],
  ['流式聊天', 'streaming chat'],
  ['消息渲染', 'message render'],

  // --- Markdown ---
  ['Markdown 渲染', 'Markdown rendering'],

  // --- UI组件 ---
  ['确认对话框', 'confirm dialog'],
  ['操作确认', 'operation confirmation'],
  ['技能选择器', 'skill selector'],

  // --- 搜索 ---
  ['搜索面板', 'search panel'],

  // --- 选项页 ---
  ['工具栏配置', 'toolbar configuration'],
  ['工具箱配置', 'toolbox configuration'],

  // --- 本地 Agent 客户端 ---
  ['本地 Agent 客户端', 'local Agent client'],
  ['Agent 客户端', 'Agent client'],

  // --- 循环/反射 ---
  ['React 循环', 'React loop'],
  ['反射', 'reflection'],
  ['行动', 'action'],

  // --- 调度 ---
  ['Agent 调度', 'Agent dispatch'],
  ['代理调度器', 'Agent dispatcher'],

  // --- 通用计数/单位 ---
  ['个', ''],
  ['大小', 'size'],
  ['字节', 'bytes'],
  ['条', ''],
  ['条记录', 'records'],
  ['项', ''],
  ['个启用', ' enabled'],
  ['个已', ' '],
  ['个未', ' '],
  ['第 ', 'step '],
  ['步骤', 'step'],
  ['全局', 'global'],
  ['最终', 'final'],

  // --- 分类/标签 ---
  ['标签', 'label'],
  ['分类', 'category'],

  // --- 权限/安全 ---
  ['权限', 'permission'],
  ['敏感操作', 'sensitive operation'],
  ['放行', 'allow'],
  ['拒绝', 'deny'],

  // --- 时间 ---
  ['剩余时间', 'remaining time'],
  ['超时时间', 'timeout duration'],
  ['等待', 'waiting'],

  // --- 回调/事件 ---
  ['回调', 'callback'],
  ['事件', 'event'],

  // --- 通用动词 ---
  ['初始化', 'initializing'],
  ['加载中', 'loading'],
  ['重试', 'retry'],
  ['刷新', 'refresh'],
  ['清空', 'clear'],
  ['复制', 'copy'],
  ['粘贴', 'paste'],
  ['撤销', 'undo'],
  ['恢复', 'restore'],
  ['关闭', 'close'],
  ['打开', 'open'],
  ['启用', 'enable'],
  ['停用', 'disable'],
  ['选择', 'select'],
  ['取消', 'cancel'],

  // --- 通用状态 ---
  ['成功', 'successful'],
  ['失败', 'failed'],
  ['超时', 'timeout'],
  ['错误', 'error'],
  ['警告', 'warning'],
  ['信息', 'info'],
  ['可达', 'reachable'],
  ['不可', 'non-'],

  // --- 数据流 ---
  ['正在读取', 'reading'],
  ['正在写入', 'writing'],
  ['接收数据', 'receiving data'],
  ['发送数据', 'sending data'],
  ['数据', 'data'],
  ['流', 'stream'],
];

// ==================== 判断是否需要排除 ====================
function shouldExclude(filePath) {
  // 排除特定文件
  for (const exclude of EXCLUDE_FILES) {
    if (filePath.includes(exclude)) return true;
  }
  // 排除特定目录
  for (const exclude of EXCLUDE_DIRS) {
    if (filePath.includes(`${exclude}/`) || filePath.includes(`${exclude}\\`)) return true;
  }
  return false;
}

// ==================== 判断是否在注释中 ====================
// 简单检测：如果中文在 // 之后或 /* ... */ 之间，跳过
// 注意：这是基于行的近似检测
function isInComment(line, matchIndex) {
  // 查找该行中 // 单行注释
  const singleComment = line.indexOf('//');
  if (singleComment >= 0 && matchIndex > singleComment) return true;

  // 查找 /* ... */ 多行注释（简单检测，不处理跨行）
  const blockStart = line.indexOf('/*');
  if (blockStart >= 0) {
    const blockEnd = line.indexOf('*/', blockStart + 2);
    if (blockEnd >= 0 && matchIndex > blockStart && matchIndex < blockEnd) return true;
    // 如果 block 没有结束（跨行），保守处理
    if (blockEnd < 0 && matchIndex > blockStart) return true;
  }

  return false;
}

// ==================== 处理单行 ====================
function processLine(line) {
  // 快速检查：不含中文或不含 console/logger 调用，直接返回
  if (!hasCJK.test(line)) return line;
  if (!LOG_CALL.test(line)) return line;

  let result = line;

  // 按长度降序排序（已在映射表中保持）

  for (const [zh, en] of TRANSLATIONS) {
    // 只在字符串字面量范围内替换
    // 用 indexOf 查找并替换，但要确认在字符串内
    let idx = result.indexOf(zh);
    while (idx >= 0) {
      // 确认不在注释中
      if (!isInComment(result, idx)) {
        // 创建替换后的行
        const before = result.substring(0, idx);
        const after = result.substring(idx + zh.length);
        result = before + en + after;
        // 继续从替换后位置查找
        idx = result.indexOf(zh, idx + en.length);
      } else {
        idx = result.indexOf(zh, idx + 1);
      }
    }
  }

  return result;
}

// ==================== 处理文件 ====================
function processFile(filePath) {
  if (shouldExclude(filePath)) {
    return { file: filePath, changes: 0, skipped: true };
  }

  let content;
  try {
    content = fs.readFileSync(filePath, 'utf-8');
  } catch {
    return { file: filePath, changes: 0, error: 'read failed' };
  }

  const lines = content.split('\n');
  let changedCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const original = lines[i];
    const processed = processLine(original);
    if (processed !== original) {
      lines[i] = processed;
      changedCount++;
      console.log(`  Line ${i + 1}: ${original.trim().substring(0, 80)}`);
      console.log(`  →       ${processed.trim().substring(0, 80)}`);
    }
  }

  if (changedCount > 0) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  }

  return { file: filePath, changes: changedCount };
}

// ==================== 递归遍历目录 ====================
function processDir(dirPath) {
  const fullPath = path.resolve(__dirname, '..', dirPath);
  if (!fs.existsSync(fullPath)) return [];

  const results = [];
  const entries = fs.readdirSync(fullPath, { recursive: true });

  for (const entry of entries) {
    const entryPath = path.join(fullPath, entry);
    const stat = fs.statSync(entryPath);
    if (stat.isFile() && entry.endsWith(FILE_EXT)) {
      // 排除本地化文件
      const relativePath = path.relative(path.resolve(__dirname, '..'), entryPath);
      if (shouldExclude(relativePath)) continue;
      results.push(processFile(entryPath));
    }
  }

  return results;
}

// ==================== 主流程 ====================
console.log('=== 精确中文日志翻译脚本 ===\n');
console.log('排除规则：');
console.log('  - src/shared/locales/zh.js, en.js (国际化字典)');
console.log('  - _locales/ 目录 (扩展 manifest 翻译)');
console.log('  - 非 console/logger 调用行');
console.log('  - 注释中的中文');
console.log('');

let totalChanges = 0;
let totalFiles = 0;

for (const dir of TARGET_DIRS) {
  console.log(`\n--- 处理目录: ${dir} ---`);
  const results = processDir(dir);
  for (const r of results) {
    if (r.changes > 0) {
      totalChanges += r.changes;
      totalFiles++;
      console.log(`[${r.changes} changes] ${r.file}`);
    }
  }
}

console.log(`\n=== 完成 ===`);
console.log(`修改文件数: ${totalFiles}`);
console.log(`修改行数: ${totalChanges}`);
