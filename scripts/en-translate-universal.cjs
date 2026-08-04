/**
 * Final comprehensive Chinese→English logger replacement
 * Uses per-line detection to avoid false positives in i18n blocks
 */
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

// Comprehensive Chinese→English map for logger patterns
const map = [
  // Common single words/log tokens
  ['可达', 'reachable'],
  ['不可达', 'unreachable'],
  ['代理', '代理'], // keep as-is for now, handled below
  ['已重启', 'has restarted'],
  ['已取消', 'cancelled'],
  ['已完成', 'completed'],
  ['已连接', 'connected'],
  ['已断开', 'disconnected'],
  ['已修复', 'fixed'],
  ['已恢复', 'recovered'],
  ['已过期', 'expired'],
  ['已删除', 'deleted'],
  ['已存在', 'already exists'],
  ['已重命名', 'renamed'],
  ['未找到', 'not found'],
  ['未连接', 'not connected'],
  ['未打开', 'not open'],
  ['未加载', 'not loaded'],
  ['未初始化', 'not initialized'],
  ['不存在', 'does not exist'],
  ['已满', 'is full'],
  ['有效', 'valid'],
  ['无效', 'invalid'],
  ['为空', 'is empty'],
  ['用户取消', 'user cancelled'],
  ['加载失败', 'load failed'],
  ['保存失败', 'save failed'],
  ['删除失败', 'delete failed'],
  ['查询失败', 'query failed'],
  ['恢复失败', 'recovery failed'],
  ['截图失败', 'screenshot failed'],
  ['连接失败', 'connection failed'],
  ['发送失败', 'send failed'],
  ['创建失败', 'create failed'],
  ['更新失败', 'update failed'],
  ['初始化完成', 'initialization complete'],
  ['初始化', 'initialization'],
  ['清除', 'clear'],
  ['清理', 'cleanup'],
  ['重置', 'reset'],
  ['加载', 'load'],
  ['保存', 'save'],
  ['删除', 'delete'],
  ['创建', 'create'],
  ['更新', 'update'],
  ['发送', 'send'],
  ['接收', 'receive'],
  ['恢复', 'recover'],
  ['截图', 'screenshot'],
  ['连接', 'connect'],
  ['断开', 'disconnect'],
  ['切换', 'switch'],
  ['重连', 'reconnect'],
  ['重试', 'retry'],
  ['超时', 'timeout'],
  ['取消', 'cancel'],
  ['暂停', 'pause'],
  ['继续', 'continue'],
  ['启动', 'start'],
  ['停止', 'stop'],
  ['失败', 'failed'],
  ['成功', 'succeeded'],
  ['异常', 'exception'],
  ['错误', 'error'],
  ['警告', 'warning'],
  ['工具', 'tool'],
  ['工具数', 'tool count'],
  ['工具集', 'tool set'],
  ['个工具', 'tools'],
  ['个', ''],  // standalone counter
  ['前', 'ago'],
  ['条', 'entries'],
  ['行', 'lines'],
  ['字符', 'chars'],
  ['字节', 'bytes'],
  ['次', 'times'],
  ['秒', 's'],
  ['毫秒', 'ms'],
  ['分钟', 'min'],
  ['小时', 'h'],
  ['内存', 'memory'],
  ['缓存', 'cache'],
  ['线程', 'thread'],
  ['模式', 'mode'],
  ['状态', 'state'],
  ['版本', 'version'],
  ['结果', 'result'],
  ['消息', 'message'],
  ['事件', 'event'],
  ['请求', 'request'],
  ['响应', 'response'],
  ['标题', 'title'],
  ['内容', 'content'],
  ['配置', 'config'],
  ['日志', 'log'],
  ['路径', 'path'],
  ['文件', 'file'],
  ['目录', 'directory'],
  ['会话', 'session'],
  ['轮次', 'round'],
  ['轮次消息', 'round messages'],
  ['轮次信息', 'round info'],
  ['摘要', 'summary'],
  ['聊天', 'chat'],
  ['对话', 'conversation'],
  ['历史记录', 'history'],
  ['会话记录', 'session record'],
  ['任务', 'task'],
  ['检查点', 'checkpoint'],
  ['检查点数据', 'checkpoint data'],
  ['API 调用', 'API call'],
  ['HTTP 请求', 'HTTP request'],
  ['Token 使用', 'Token usage'],
  ['上下文', 'context'],
  ['上下文长度', 'context length'],
  ['提示词', 'prompt'],
  ['系统提示词', 'system prompt'],
  ['消息数', 'message count'],
  ['输入', 'input'],
  ['输出', 'output'],
  ['搜索', 'search'],
  ['搜索内容', 'search content'],
  ['选中文本', 'selected text'],
  ['页面内容', 'page content'],
  ['标签页', 'tab'],
  ['分组', 'group'],
  ['窗口', 'window'],
  ['书签', 'bookmark'],
  ['浏览器', 'browser'],
  ['扩展', 'extension'],
  ['插件', 'plugin'],
  ['资源', 'resource'],
  ['权限', 'permission'],
  ['监听器', 'listener'],
  ['助手', 'assistant'],
  ['用户', 'user'],
  ['询问', 'ask'],
  ['回答', 'answer'],
  ['删除成功', 'deleted successfully'],
  ['加载成功', 'loaded successfully'],
  ['保存成功', 'saved successfully'],
  ['导出失败', 'export failed'],
  ['导入成功', 'import completed'],
  ['清空成功', 'cleared successfully'],
  ['提交', 'submit'],
  ['启动中', 'starting'],
  ['关闭', 'close'],
  ['打开', 'open'],
  ['存在', 'exists'],
  ['服务', 'service'],
  ['代码', 'code'],
  ['数据', 'data'],
  ['网络', 'network'],
  ['安全', 'security'],
  ['备份', 'backup'],
  ['恢复中', 'recovering'],
  ['备注', 'note'],
  ['预览', 'preview'],
  ['报告', 'report'],
  ['说明', 'description'],
  ['描述', 'description'],
  ['选项', 'option'],
  ['统计', 'stats'],

  // Side panel specific
  ['侧边栏', 'Side Panel'],
  ['侧边面板', 'Side Panel'],
  ['设置面板', 'Settings Panel'],
  ['工具面板', 'Tool Panel'],
  ['工作区', 'workspace'],
  ['工作区面板', 'workspace panel'],
  ['文件列表', 'file list'],
  ['文件操作', 'file operation'],
  ['文件预览', 'file preview'],
  ['图片预览', 'image preview'],
  ['进度', 'progress'],

  // Process/cancel/session
  ['取消所有会话', 'cancel all sessions'],
  ['暂停所有任务', 'pause all tasks'],
  ['恢复所有任务', 'resume all tasks'],
  ['重新开始', 'restart'],
  ['中途取消', 'midway cancel'],
  ['清理过期', 'cleanup expired'],
  ['自动保存', 'auto-save'],
  ['手动保存', 'manual save'],

  // MCP specific
  ['MCP 服务器数量', 'MCP server count'],
  ['MCP 工具列表', 'MCP tool list'],
  ['MCP 连接数', 'MCP connections'],
  ['MCP 配置', 'MCP config'],
  ['MCP 注册', 'MCP registration'],

  // Pre-selection / Tool selection
  ['预筛选', 'pre-selection'],
  ['直接回答', 'direct answer'],
  ['主力模型', 'main model'],
  ['可用工具', 'available tools'],

  // Checkpoint / Recovery
  ['检查点', 'checkpoint'],

  // Chinese particles and connectors (remove or map)
  ['的 ', ' '],
  [' 的 ', ' '],
  ['或 ', 'or '],
  [' 或 ', ' or '],
  ['再 ', 're-'],
  ['收到 ', 'received '],
  ['返回 ', 'received '],
  ['重载 ', 'reload '],
  ['回传', 'sendback'],
  ['快捷键', 'shortcut'],
  ['快捷操作', 'quick action'],
  ['先 ', 'first '],
  ['执行日志', 'execution log'],
  ['条目数', 'entries'],
  ['条目', 'entries'],
  ['普通', 'normal'],

  // More common words
  ['完成', 'complete'],
  ['进行中', 'in progress'],
  ['区域', 'area'],
  ['页面', 'page'],
  ['选中', 'selected'],
  ['操作', 'action'],
  ['总数', 'total'],
  ['耗时', 'elapsed'],
  ['耗时统计', 'timing'],
  ['过期', 'expired'],
  ['迁移', 'migration'],
  ['迁移完成', 'migration complete'],
  ['迁移失败', 'migration failed'],
  ['回退', 'fallback'],
  ['判断', 'determine'],
  ['通知', 'notification'],

  // Counters
  ['目数', 'count'],
  ['数量', 'count'],
  ['计数', 'count'],
  ['数', 'count'],
  ['总', 'total'],
  ['共', 'total'],

  // Full-width punctuation → half-width (in logger context)
  ['，', ', '],
  ['：', ': '],
  ['（', ' ('],
  ['）', ') '],
  ['、', ', '],

  // Chinese particle / suffix words
  ['了 ', ' '],
  ['后 ', ' after '],
  ['已被', 'was '],
  ['仍在运行', 'still running'],
  ['仍在', 'still '],

  // Health / monitoring
  ['健康检查', 'health check'],
  ['间隔', 'interval'],

  // Get/receive
  ['获取到', 'got'],
  ['没有', 'no'],

  // Auto
  ['自动', 'auto'],
  ['已放弃', 'abandoned'],
  ['放弃', 'abandon'],

  // Execution / running
  ['执行', 'executing'],
  ['执行中', 'executing'],
  ['处理中', 'processing'],
  ['空闲', 'idle'],

  // Old / stale
  ['旧', 'old'],

  // Retry
  ['重试', 'retry'],
  ['次数', 'times'],
  ['最大', 'max'],

  // Stream / text
  ['流式', 'stream'],
  ['文本', 'text'],
  ['文本流', 'text stream'],

  // State
  ['刷新', 'refresh'],
  ['活跃', 'active'],
  ['等待 ', 'waiting for '],
  ['已注册', 'registered'],

  // Verb prefix
  ['正在', ''],

  // Other
  ['回到', 'back to'],
  ['切换', 'switch'],
  ['工具栏', 'toolbar'],
  ['代理', 'agent'],
  ['模型', 'model'],

  // Missing critical words
  ['返回', 'returned'],
  ['调用', 'call'],
  ['使用', 'using'],
  ['获取', 'get'],
  ['直接', 'directly'],
  ['跳过', 'skip'],
  ['可用', 'available'],
  ['从', 'from'],
  ['上', 'on'],
  ['续', 'continue'],
  ['栏', 'bar'],
  ['库', 'library'],
  ['下载', 'download'],
  ['下载中', 'downloading'],
  ['弹窗', 'popup'],
  ['远端', 'remote'],
  ['远程', 'remote'],
  ['本地', 'local'],
  ['同步', 'sync'],
  ['变更', 'change'],
  ['详情', 'details'],
  ['复制', 'copy'],
  ['渲染', 'render'],
  ['导出', 'export'],
  ['导入', 'import'],
  ['合并', 'merge'],
  ['标记', 'mark'],
  ['移除', 'remove'],
  ['添加', 'add'],
  ['丢失', 'lost'],
  ['忽略', 'ignore'],
  ['超过', 'exceeded'],
  ['不足', 'insufficient'],
  ['当前', 'current'],
  ['上次', 'last'],
  ['下次', 'next'],
  ['继续', 'continue'],
  ['优化', 'optimize'],
  ['显示', 'display'],
  ['隐藏', 'hide'],
  ['停止', 'stop'],
  ['恢复', 'resume'],
  ['禁用', 'disabled'],
  ['启用', 'enabled'],
  ['最近', 'recent'],
  ['访问', 'access'],
  ['计数器', 'counter'],
  ['收集', 'collect'],
  ['推送', 'push'],
  ['提取', 'extract'],
  ['填入', 'fill'],
  ['选中后', 'after selection'],
  ['的', ''],
  ['该', 'the'],
  ['让', 'let'],
  ['其', 'its'],
  ['全', 'all'],
  ['均', 'all'],
  ['几', 'a few'],
  ['已经', 'already'],
  ['始终', 'always'],
  ['通常', 'usually'],
  ['包括', 'including'],
  ['其它', 'other'],
  ['唯一', 'unique'],
  ['新的', 'new'],
  ['新增', 'new'],
  ['准备', 'preparing'],
  ['即将', 'about to'],
  ['选择', 'select'],
  ['通过', 'via'],
  ['基于', 'based on'],
  ['目的', 'purpose'],
  ['原因', 'reason'],
  ['来源', 'source'],
  ['最终', 'final'],
  ['原始', 'original'],
  ['备用', 'backup'],
  ['应该', 'should'],
  ['需要', 'need'],
  ['支持', 'support'],
  ['包含', 'contains'],
  ['列表', 'list'],
  ['提供', 'provide'],
  ['发现', 'found'],
  ['查找', 'search'],
  ['允许', 'allow'],
  ['禁止', 'forbid'],
  ['请求中', 'requesting'],
  ['连接中', 'connecting'],
  ['下载完成', 'download complete'],
  ['上传', 'upload'],
  ['上传中', 'uploading'],
  ['上传完成', 'upload complete'],
  ['粘贴', 'paste'],
  ['扩展', 'extension'],
  ['代理端', 'agent side'],
  ['浏览器', 'browser'],
  ['确认', 'confirm'],
  ['对话记忆', 'conversation memory'],
  ['最后', 'last'],
  ['编号', 'number'],
  ['分类', 'category'],
  ['正在执行', 'executing'],
  ['执行完成', 'execution complete'],
];

// Sort by length descending
map.sort((a, b) => b[0].length - a[0].length);

const chinesePattern = /[\u4e00-\u9fff]/;
const logPattern = /(?:console|logger|logAudit)\.(?:log|warn|error|info|debug|trace)\b/;

function processFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf-8').split('\n');
  let changed = 0;

  for (let i = 0; i < lines.length; i++) {
    if (!chinesePattern.test(lines[i])) continue;
    if (!logPattern.test(lines[i])) continue;
    if (lines[i].includes('registerTranslations')) continue;

    let line = lines[i];

    for (const [from, to] of map) {
      const before = line;
      line = line.replaceAll(from, to);
      if (line !== before) changed++;
    }

    // Clean up double spaces caused by `个` → `` replacement
    line = line.replace(/  +/g, ' ');
    if (lines[i] !== line) {
      lines[i] = line;
    }
  }

  fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
  return changed;
}

const dirs = ['src/background', 'src/side_panel', 'src/content'];
let total = 0;

for (const dir of dirs) {
  const dirPath = path.join(root, dir);
  if (!fs.existsSync(dirPath)) continue;
  for (const f of fs.readdirSync(dirPath)) {
    if (!f.endsWith('.js')) continue;
    const filePath = path.join(dirPath, f);
    const changed = processFile(filePath);
    if (changed > 0) {
      total += changed;
      console.log(`OK: ${dir}/${f} (${changed})`);
    }
  }
}

console.log(`\n=== TOTAL: ${total} replacements ===`);
