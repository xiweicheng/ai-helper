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
  // 2026-10-14 口径变更（计划五）：原查询「中国和美国」在词面通道对 country 的唯一证据是
  // 两个 2 字碎块（「中国」「美国」），matchCjk 按最长片段分层把它压成 units=1，旧实现靠
  // 「同一查询单元在正文与标签各命中一次」跨字段累加才凑到 units=2 顶过门槛——那正是本轮
  // 要消除的重复计数缺陷（QQ 邮箱噪声同源）。门槛去重后它不再算词面命中，改由向量档承接
  // （见 SEMANTIC_CASES「换说法命中国家观点」，实测 country 召回）。本条保留其名「按整段命中」
  // 的本意：换成两个完整单元「中国 美国」，靠 full=true 干净过门槛，不再依赖被移除的缺陷。
  { name: '超短条目按整段命中', query: '中国 美国', top1: 'country' }
];

/**
 * 向量档（B 档）评测用例。与 A 档 `CASES` 的分工必须分开，两套期望不许合并：
 * - A 档钉「词面门槛不把共享碎块的无关条目当成命中」；
 * - B 档钉「换个说法能找到目标」**且**「本库无答案时至多采信 maxTake 条头部、不填满 limit」。
 *   （2026-10-14 计划五：记忆语义转纯 top-K、无绝对地板，故不再要求「必须空返」。）
 *
 * 期望写成与 cos 刻度无关的形式（名次 / 有界上界），换模型或换档位后仍然成立；
 * 若写成具体 cos 数值，就退成了本计划要消灭的「绝对阈值」思路。
 *
 * 目标 id 依据：本文件 7 条 fixture 送进真实 BAAI/bge-m3 后实测，4 条换说法查询的目标 cos
 * 均排第 1（0.5163 / 0.5831 / 0.5851 / 0.6283），2 条控制查询的 top1 只有 0.3122 / 0.4318。
 * 具体名次要求见计划 Task 2 的网格实测结果。
 */
export const SEMANTIC_CASES = [
  // ---- 词面零重叠但语义唯一：向量档的全部价值所在，必须命中 ----
  { name: '换说法命中 Vue 偏好', query: '他习惯用哪种界面库写网页', target: 'vue-pref', maxRank: 3 },
  { name: '换说法命中国家观点', query: '这两个国家的综合实力谁更强', target: 'country', maxRank: 2 },
  { name: '换说法命中境外访问', query: '为什么我查不到海外的资料', target: 'proxy', maxRank: 2 },
  { name: '换说法命中 store 缺陷', query: '写入假装成功其实没保存的老毛病', target: 'mem-bug', maxRank: 2 },

  // ---- 控制组：与全库主题无关。纯 top-K 取消地板后正确行为是「至多 maxTake 条头部、不填满 limit」
  //（原「一条都不返回」依赖绝对地板，已随计划五放弃）。expectNone 字段保留：semantic-window 取下界样本用。----
  { name: '无关查询返回有界（≤maxTake）（菜谱）', query: '法式洋葱汤要放哪些材料', expectNone: true },
  { name: '无关查询返回有界（≤maxTake）（电费）', query: '帮我算一下这台机器的电费', expectNone: true },

  // ---- 词面命中在向量档不能被降级：A 档结果必须仍在前 2 ----
  { name: '词面命中不因融合掉出前 2', query: 'Vue 前端偏好', target: 'vue-pref', maxRank: 2 },
  { name: '子串误伤在向量档同样不允许', query: 'rag 框架', expectAbsent: ['mem-bug'] }
];
