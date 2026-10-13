// agent/test/eval/memory-recall-fixtures.js - 记忆召回评测集（合成数据）
// 条目形态对齐真实记忆库的三类分布：超短偏好（7~32 字）、中等事实（200~600 字）、
// 超长多段技术记录（1000~1900 字）。**绝不放真实记忆内容**——真实库里含个人信息与凭证。
//
// 关键设计：不相关条目里故意植入与查询共享的 2 字块（"网页""界面"等）。真实碎 bigram
// 噪声正是这么产生的——长条目几乎必然命中查询的某个随机 2 字块，于是任何 query 都能捞回一堆。
// 若把这些块删掉，本评测集就测不出待修的问题。

/** 生成长度接近真实记录的段落（重复填充 + 变更用词，保持确定性） */
const pad = (seed, times) => Array.from({ length: times }, (_, i) => `${seed}（第 ${i + 1} 步）`).join('；');

export const FIXTURES = [
  {
    id: 'vue-pref', type: 'fact', tags: ['Vue', '前端开发', '技术偏好'],
    content: '用户非常喜欢使用Vue进行前端开发，Vue是TA的首选前端框架。'
  },
  {
    id: 'country', type: 'fact', tags: ['中国', '观点'],
    content: '中国比美国强大'
  },
  {
    id: 'proxy', type: 'fact', tags: ['中国', '网络限制', 'Google', '网络访问'],
    content: '用户位于中国，无法访问被屏蔽的外国网站（如Google搜索等境外网站），'
      + '需要提供可替代的国内可访问方案或工具建议。'
  },
  {
    id: 'webpage', type: 'fact', tags: ['表单自动化', 'product-form', '浏览器自动化'],
    content: '多步骤表单自动填写演示页：http://localhost:8901/product-form.html（"商品录入"，4 步向导）。'
      + '该网页的每个界面字段都需按映射表填写，页面结构如下。'
      + pad('点击下一步前先校验必填项', 14)
  },
  {
    id: 'mem-bug', type: 'fact', tags: ['记忆系统', 'Bug', 'store持久化'],
    // 故意含 storage：碎块子串匹配下它会因内部含 “rag” 而被 “rag 框架” 误伤命中
    content: '记忆系统 store 操作曾存在持久化（storage persistence）问题：调用后返回成功但实际未写入存储，'
      + '导致检索时找不到（记录于 2026-07-29）。再次测试：新写入后立即 recall 检索成功，'
      + '说明该问题可能已被修复。'
  },
  {
    id: 'long-zhihu', type: 'fact', tags: ['知乎', 'Draft.js', '浏览器自动化', '发布文章'],
    content: '知乎「写文章」编辑器（zhuanlan.zhihu.com/p/<id>/edit）自动化发布经验：'
      + '【结构】标题为独立 textarea；正文是 Draft.js 富文本界面，需通过剪贴板粘贴。'
      + pad('发布后核对封面与标签设置', 30)
  },
  {
    id: 'summary-1', type: 'summary', tags: ['compaction', 'session:sess_demo'],
    content: '[会话压缩摘要 r1 · 已压缩 10 条] 1. 任务目标：自动测试记忆工具能力。'
      + '2. 已完成：覆盖基础链路、过滤、排序、边界。3. 未决：语义档待评估。'
  }
];

/**
 * 评测用例。字段语义：
 * - top1：期望第一条的 id
 * - expectTop：这些 id 必须进前 2
 * - expectAbsent：这些 id 绝不该出现在结果里（它们只是碰巧共享了随机 2 字块）
 * - maxResults：返回条数上限（零重叠查询的正确行为是「少返甚至不返」，不是捞一堆）
 */
export const CASES = [
  // ---- 语义类：与目标条目词面零重叠。正确行为 = 不把共享碎块的无关条目当成命中 ----
  {
    name: '零重叠不应捞噪声（Vue 偏好换说法）',
    query: '他习惯用哪种界面库写网页',
    expectAbsent: ['long-zhihu'], maxResults: 1
  },
  {
    name: '零重叠不应捞噪声（国家观点换说法）',
    query: '这两个国家的综合实力谁更强',
    expectAbsent: ['mem-bug', 'long-zhihu'], maxResults: 2
  },
  {
    name: '零重叠不应捞噪声（境外访问换说法）',
    query: '为什么我查不到海外的资料',
    expectAbsent: ['mem-bug', 'long-zhihu'], maxResults: 2
  },

  // ---- 词面类：应命中且排到前面 ----
  { name: '整词命中排第一', query: 'Vue 前端偏好', top1: 'vue-pref' },
  { name: '长句中的目标词不失配', query: 'store 持久化写入失败的记录', top1: 'mem-bug' },
  { name: '子串不得误伤（rag ∉ 存储）', query: 'rag 框架', expectAbsent: ['mem-bug'] },
  { name: '英文专名按词边界命中', query: 'Google 境外', top1: 'proxy' },
  { name: '标签命中进前 2', query: '浏览器自动化', expectTop: ['webpage', 'long-zhihu'] },
  { name: '摘要类可检索', query: '会话压缩摘要', top1: 'summary-1' },
  { name: '超短条目按整段命中', query: '中国和美国', top1: 'country' }
];
