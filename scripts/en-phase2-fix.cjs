/**
 * Phase 2 修复：使用完整的复合短语映射表修复残留中文
 * 读取 en-mapping-phase2.json + 基础单字映射
 */
const fs = require('fs');
const path = require('path');

const hasCJK = /[\u4e00-\u9fff]/;
const LOG_CALL = /(console|logger)\.(log|debug|info|warn|error)\s*\(/;
const EXCLUDE_FILES = ['locales/zh.js', 'locales/en.js'];
const EXCLUDE_DIRS = ['_locales'];

// 加载 phase2 映射
const phase2 = JSON.parse(fs.readFileSync(path.join(__dirname, 'en-mapping-phase2.json'), 'utf-8')).mappings;
// 按长度降序排列
phase2.sort((a, b) => b[0].length - a[0].length);

// 基础单/双字映射（处理残余中文）
const baseMap = [
  ['请求', 'requested '], ['用户', 'user'], ['确认', 'confirm'], ['操作', 'operation'],
  ['通信', 'communication'], ['不可达', 'unreachable'], ['检查', 'check '],
  ['可达', 'reachable'], ['端点', 'endpoint'], ['关闭', 'close'], ['打开', 'open'],
  ['任务', 'task'], ['子', 'sub'], ['主', 'main'],
  ['保存', 'save'], ['删除', 'delete'], ['更新', 'update'], ['切换', 'switch'],
  ['加载', 'load'], ['创建', 'create'], ['设定', 'set'], ['移除', 'remove'],
  ['显示', 'show'], ['隐藏', 'hide'], ['启动', 'start'], ['停止', 'stop'],
  ['继承', 'inherit'], ['反思', 'reflection'], ['循环', 'loop'],
  ['并行', 'parallel'], ['顺序', 'sequential'], ['并发', 'concurrency'],
  ['预算', 'budget'], ['摘要', 'summary'], ['裁剪', 'trimming'],
  ['预筛选', 'pre-filter'], ['筛选', 'filter'], ['传入', 'incoming'],
  ['复杂度', 'complexity'], ['策略', 'strategy'], ['决策', 'decision'],
  ['修订', 'revise'], ['评分', 'score'], ['上限', 'limit'],
  ['默认', 'default'], ['拒绝', 'deny'], ['放行', 'allow'],
  ['超时', 'timeout'], ['等待', 'waiting'], ['进入', 'entering'],
  ['返回', 'return'], ['解析', 'parse'], ['修复', 'repair'],
  ['跳过', 'skip'], ['忽略', 'ignore'], ['降级', 'downgrade'],
  ['回退', 'fallback'], ['兜底', 'fallback'], ['使用', 'using'],
  ['通过', 'passed'], ['强制', 'force'], ['有效', 'valid'],
  ['无效', 'invalid'], ['为空', 'empty'], ['非空', 'non-empty'],
  ['为空对象', 'empty object'], ['空', 'empty'],
  ['类型', 'type'], ['目录', 'directory'], ['路径', 'path'],
  ['文件', 'file'], ['名称', 'name'], ['大小', 'size'], ['版本', 'version'],
  ['标签', 'label'], ['标签页', 'tab'], ['选项卡', 'tab'],
  ['侧边栏', 'sidebar'], ['选项', 'option'], ['面板', 'panel'],
  ['对话框', 'dialog'], ['弹窗', 'popup'], ['工具栏', 'toolbar'],
  ['原型', 'prototype'], ['收藏', 'bookmark'], ['书签', 'bookmark'],
  ['通知', 'notification'], ['消息', 'message'], ['短信', 'msg'],
  ['会话', 'session'], ['代理', 'agent'], ['工具', 'tool'],
  ['模型', 'model'], ['模式', 'mode'], ['配置', 'configuration'],
  ['历史', 'history'], ['记录', 'record'], ['搜索', 'search'],
  ['元素', 'element'], ['容器', 'container'], ['代码', 'code'],
  ['页面', 'page'], ['站点', 'site'], ['网站', 'website'],
  ['浏览器', 'browser'], ['窗口', 'window'], ['标签页', 'tab'],
  ['内容', 'content'], ['数据', 'data'], ['截图', 'screenshot'],
  ['图片', 'image'], ['表格', 'table'], ['图表', 'chart'],
  ['电子表格', 'spreadsheet'], ['文档', 'document'],
  ['导出', 'export'], ['导入', 'import'], ['下载', 'download'],
  ['上传', 'upload'], ['读取', 'read'], ['写入', 'write'],
  ['发送', 'send'], ['接收', 'receive'], ['响应', 'response'],
  ['请求', 'request'], ['回调', 'callback'], ['事件', 'event'],
  ['连接', 'connection'], ['断开', 'disconnect'], ['重连', 'reconnect'],
  ['端口', 'port'], ['网络', 'network'], ['服务器', 'server'],
  ['本地', 'local'], ['远程', 'remote'], ['远端', 'remote'],
  ['插件', 'plugin'], ['扩展', 'extension'], ['脚本', 'script'],
  ['库', 'library'], ['服务', 'service'], ['进程', 'process'],
  ['命令', 'command'], ['终端', 'terminal'], ['控制台', 'console'],
  ['权限', 'permission'], ['敏感', 'sensitive'],
  ['数据库', 'database'], ['事务', 'transaction'], ['存储', 'storage'],
  ['缓存', 'cache'], ['索引', 'index'], ['键', 'key'], ['值', 'value'],
  ['密钥', 'API key'], ['密钥', 'key'], ['密码', 'password'],
  ['用户名', 'username'], ['验证', 'verify'], ['身份', 'identity'],
  ['初始化', 'initialize'], ['开始', 'start'], ['完成', 'complete'],
  ['成功', 'successful'], ['失败', 'failed'], ['异常', 'exception'],
  ['错误', 'error'], ['警告', 'warning'], ['信息', 'info'], ['调试', 'debug'],
  ['统计', 'stats'], ['计数', 'count'], ['总数', 'total'],
  ['长度', 'length'], ['大小', 'size'], ['数量', 'count'],
  ['剩余', 'remaining'], ['已用', 'used'], ['预估', 'estimated'],
  ['实际', 'actual'], ['原始', 'original'], ['新的', 'new'],
  ['旧的', 'old'], ['当前', 'current'], ['活跃', 'active'],
  ['忙', 'busy'], ['空闲', 'idle'], ['在线', 'online'], ['离线', 'offline'],
  ['前台', 'foreground'], ['后台', 'background'],
  ['正在进行', 'in progress'], ['进行中', 'in progress'],
  ['检测到', 'detected'], ['未找到', 'not found'], ['不存在', 'not found'],
  ['不可删除', 'cannot delete'], ['不可修改', 'cannot modify'],
  ['已删除', 'deleted'], ['已创建', 'created'], ['已更新', 'updated'],
  ['已保存', 'saved'], ['已完成', 'complete'], ['已启动', 'started'],
  ['已停止', 'stopped'], ['已关闭', 'closed'], ['已打开', 'opened'],
  ['已加载', 'loaded'], ['已移除', 'removed'], ['已清除', 'cleared'],
  ['已清理', 'cleaned'], ['已跳过', 'skipped'], ['已忽略', 'ignored'],
  ['已启用', 'enabled'], ['已禁用', 'disabled'], ['已连接', 'connected'],
  ['已断开', 'disconnected'], ['已切换', 'switched'],
  ['已重载', 'reloaded'], ['已重启', 'restarted'], ['已同步', 'synced'],
  ['已导出', 'exported'], ['已导入', 'imported'], ['已发送', 'sent'],
  ['已接收', 'received'], ['已暂停', 'paused'], ['已恢复', 'restored'],
  ['已重置', 'reset'], ['已解绑', 'unbound'], ['已绑定', 'bound'],
  ['已选中', 'selected'], ['已取消', 'cancelled'], ['已拒绝', 'denied'],
  ['已允许', 'allowed'], ['已确认', 'confirmed'],
  ['转换为', 'convert to'], ['降级为', 'downgrade to'],
  ['回退到', 'fallback to'], ['迁移到', 'migrate to'],
  ['发送到', 'send to'], ['追加到', 'append to'],
  ['恢复到', 'restore to'], ['回滚到', 'rollback to'],
  ['不可用的', 'unavailable'], ['过期的', 'expired'],
  ['孤立的', 'orphaned'], ['遗弃的', 'abandoned'],
  ['脏', 'dirty'], ['干净', 'clean'], ['安全的', 'safe'],
  ['未知的', 'unknown'], ['已知的', 'known'],
  ['正确的', 'correct'], ['错误的', 'incorrect'],
  ['和', ' and '], ['或', ' or '], ['的', ' '],
  ['已', ''], ['了', ''], ['到', ' to '],
  ['前', ' before '], ['后', ' after '],
  ['中', ''], ['上', ''], ['下', ''],
  ['从', ' from '], ['按', ' by '], ['用', ' with '],
  ['由', ' by '], ['向', ' towards '], ['以', ' as '],
  ['也', ' also '], ['再', ' again '], ['先', ' first '],
  ['都', ' all '], ['仅', ' only '],
  ['无', ' no '], ['有', ' has '], ['非', ' non-'],
  ['未', ' not '], ['不', ' not '], ['可能', ' possibly '],
  ['因为', ' because '], ['所以', ' so '], ['因此', ' therefore '],
  ['如果', ' if '], ['虽然', ' although '], ['但是', ' but '],
  ['第', ''], ['次', ' times'], ['个', ' '],
  ['条', ' '], ['项', ' '], ['张', ' '],
  ['行', ' '], ['列', ' column'], ['表', ' table'],
  ['行号', 'line'], ['字符', 'chars'],
  ['秒', 's '], ['分钟', 'min '], ['小时', 'h '],
  ['字节', 'bytes '], ['KB', 'KB'], ['MB', 'MB'], ['GB', 'GB'],
  ['上午', 'AM'], ['下午', 'PM'],
];

// 合并所有映射，按长度降序
const allMap = [...phase2, ...baseMap];
allMap.sort((a, b) => b[0].length - a[0].length);

function isComment(line, idx) {
  const sc = line.indexOf('//');
  if (sc >= 0 && idx > sc) return true;
  const bs = line.indexOf('/*');
  if (bs >= 0) {
    const be = line.indexOf('*/', bs + 2);
    if ((be >= 0 && idx > bs && idx < be) || (be < 0 && idx > bs)) return true;
  }
  return false;
}

function shouldExclude(fp) {
  return EXCLUDE_FILES.some(e => fp.includes(e)) || EXCLUDE_DIRS.some(e => fp.includes(e + '/'));
}

function processLine(line) {
  if (!hasCJK.test(line) || !LOG_CALL.test(line)) return line;
  let result = line;
  for (const [zh, en] of allMap) {
    let pos = 0;
    while ((pos = result.indexOf(zh, pos)) >= 0) {
      if (!isComment(result, pos)) {
        result = result.slice(0, pos) + en + result.slice(pos + zh.length);
        pos += en.length;
      } else {
        pos += zh.length;
      }
    }
  }
  return result;
}

function processDir(dirPath) {
  const fullPath = path.resolve(__dirname, '..', dirPath);
  if (!fs.existsSync(fullPath)) return 0;
  let totalChanges = 0;
  for (const entry of fs.readdirSync(fullPath, { recursive: true })) {
    const fp = path.join(fullPath, entry);
    if (!entry.endsWith('.js')) continue;
    const rel = path.relative(path.resolve(__dirname, '..'), fp);
    if (shouldExclude(rel)) continue;
    const content = fs.readFileSync(fp, 'utf-8');
    const lines = content.split('\n');
    let changed = 0;
    for (let i = 0; i < lines.length; i++) {
      const orig = lines[i];
      const proc = processLine(orig);
      if (proc !== orig) {
        lines[i] = proc;
        changed++;
      }
    }
    if (changed > 0) {
      fs.writeFileSync(fp, lines.join('\n'), 'utf-8');
      console.log(`[${changed} lines] ${rel}`);
      totalChanges += changed;
    }
  }
  return totalChanges;
}

console.log('=== Phase 2: Fix remaining Chinese in logger/console calls ===\n');
let total = 0;
for (const dir of ['src', 'agent/src', 'agent/test']) {
  const n = processDir(dir);
  if (n > 0) total += n;
}
console.log(`\n=== Done: ${total} lines fixed ===`);
