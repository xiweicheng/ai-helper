import{_ as r,o as t,c as o,a3 as a}from"./chunks/framework.BrO6lPIi.js";const b=JSON.parse('{"title":"状态管理与持久化","description":"本文件聚焦 Chrome 扩展端的状态管理与持久化机制，覆盖以下目标：。","frontmatter":{"title":"状态管理与持久化","description":"本文件聚焦 Chrome 扩展端的状态管理与持久化机制，覆盖以下目标：。"},"headers":[],"relativePath":"系统架构设计/数据流设计/状态管理与持久化/index.md","filePath":"系统架构设计/数据流设计/状态管理与持久化/index.md","lastUpdated":null}'),s={name:"系统架构设计/数据流设计/状态管理与持久化/index.md"};function i(n,e,l,c,d,g){return t(),o("div",null,[...e[0]||(e[0]=[a(`<h1 id="状态管理与持久化" tabindex="-1">状态管理与持久化 <a class="header-anchor" href="#状态管理与持久化" aria-label="Permalink to &quot;状态管理与持久化&quot;">​</a></h1><details class="details custom-block"><summary>本文引用的源码文件</summary><p><strong>本文引用的文件</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js" target="_blank" rel="noreferrer">src/storage/db.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js" target="_blank" rel="noreferrer">src/storage/session-store.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js" target="_blank" rel="noreferrer">src/storage/token-store.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/state.js" target="_blank" rel="noreferrer">src/side_panel/state.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/state.js" target="_blank" rel="noreferrer">src/background/state.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js" target="_blank" rel="noreferrer">src/background/index.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js" target="_blank" rel="noreferrer">src/background/react-loop.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/i18n.js" target="_blank" rel="noreferrer">src/shared/i18n.js</a></li></ul></details><h2 id="目录" tabindex="-1">目录 <a class="header-anchor" href="#目录" aria-label="Permalink to &quot;目录&quot;">​</a></h2><ol><li><a href="#引言">引言</a></li><li><a href="#项目结构与职责边界">项目结构与职责边界</a></li><li><a href="#核心组件总览">核心组件总览</a></li><li><a href="#架构总览状态层次存储分层与数据流">架构总览：状态层次、存储分层与数据流</a></li><li><a href="#详细组件分析">详细组件分析</a></li><li><a href="#依赖关系与并发控制">依赖关系与并发控制</a></li><li><a href="#性能优化与大数据量策略">性能优化与大数据量策略</a></li><li><a href="#故障排查指南">故障排查指南</a></li><li><a href="#结论">结论</a></li></ol><h2 id="引言" tabindex="-1">引言 <a class="header-anchor" href="#引言" aria-label="Permalink to &quot;引言&quot;">​</a></h2><p>本文件聚焦 Chrome 扩展端的状态管理与持久化机制，覆盖以下目标：</p><ul><li>解释应用状态的层次结构：内存状态、会话状态、配置数据、用户偏好。</li><li>说明变更追踪与同步机制：侧边栏状态、后台 Service Worker 状态、IndexedDB、chrome.storage.local 的读写路径。</li><li>详细说明 IndexedDB 数据模型设计、事务处理与并发访问控制。</li><li>解释 ReAct Checkpoint 的双写策略、TTL 清理与恢复流程。</li><li>说明状态迁移方案、数据备份恢复思路与版本兼容性管理。</li><li>提供状态转换图、数据库 schema 图和数据流图。</li><li>讨论大数据量场景下的查询优化、缓存策略和性能监控。</li></ul><p>本项目为双进程架构：Chrome 扩展端（Manifest V3，Service Worker + Side Panel）与独立本地代理端 Agent（Node.js）。本文仅关注扩展端的状态与持久化；Agent 端的记忆与 RAG 数据不在本文件范围内。</p><h2 id="项目结构与职责边界" tabindex="-1">项目结构与职责边界 <a class="header-anchor" href="#项目结构与职责边界" aria-label="Permalink to &quot;项目结构与职责边界&quot;">​</a></h2><p>与状态管理和持久化直接相关的代码集中在 <code>src/storage</code>、<code>src/side_panel/state.js</code>、<code>src/background/state.js</code>、<code>src/background/index.js</code>、<code>src/background/react-loop.js</code> 以及共享国际化模块。</p><pre class="mermaid">graph TB
subgraph &quot;扩展端&quot;
SP[&quot;Side Panel&lt;br/&gt;UI 与交互&quot;]
SW[&quot;Background Service Worker&lt;br/&gt;任务执行与调度&quot;]
IDB[&quot;IndexedDB&lt;br/&gt;ai-helper-db&quot;]
CS[&quot;chrome.storage.local&lt;br/&gt;配置与后备存储&quot;]
end
subgraph &quot;Agent 端&quot;
AGENT[&quot;本地 Agent 服务&lt;br/&gt;文件/命令/RAG/记忆&quot;]
end
SP --&gt; SW
SP --&gt; IDB
SP --&gt; CS
SW --&gt; IDB
SW --&gt; CS
SW --&gt; AGENT
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L21-L92" target="_blank" rel="noreferrer">src/storage/db.js#L21-L92</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L1-L10" target="_blank" rel="noreferrer">src/storage/session-store.js#L1-L10</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L74-L95" target="_blank" rel="noreferrer">src/background/index.js#L74-L95</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L1-L30" target="_blank" rel="noreferrer">src/storage/db.js#L1-L30</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L1-L10" target="_blank" rel="noreferrer">src/storage/session-store.js#L1-L10</a></li></ul><h2 id="核心组件总览" tabindex="-1">核心组件总览 <a class="header-anchor" href="#核心组件总览" aria-label="Permalink to &quot;核心组件总览&quot;">​</a></h2><table tabindex="0"><thead><tr><th>组件</th><th>职责</th><th>主要数据</th><th>关键行为</th></tr></thead><tbody><tr><td><code>src/storage/db.js</code></td><td>IndexedDB 封装层、数据库连接单例、事务包装器、ReAct Checkpoint 双写与 TTL 清理</td><td>sessions、activeSession、archivedSessions、uiPrototypes、tokenStats、reactCheckpoints、bookmarks、scheduledTasks</td><td>openDB、withStore、CRUD、迁移、Checkpoint 读写</td></tr><tr><td><code>src/storage/session-store.js</code></td><td>会话存储适配器，对接 IndexedDB，兼容旧 chrome.storage API</td><td>活跃会话、归档会话、当前会话、滚动位置、收藏</td><td>初始化迁移、创建/保存/切换/删除/归档/复制会话</td></tr><tr><td><code>src/storage/token-store.js</code></td><td>Token 使用统计的 IndexedDB CRUD 与聚合查询</td><td>tokenStats</td><td>记录调用、会话汇总、全局汇总、按天聚合、按模型/类型分布</td></tr><tr><td><code>src/side_panel/state.js</code></td><td>侧边栏全局内存状态，通过 Proxy 暴露字段</td><td>消息历史、当前模型、温度、工具开关、会话上下文压缩等</td><td>双向导出、事件派发、运行时状态隔离</td></tr><tr><td><code>src/background/state.js</code></td><td>后台状态与取消控制、AbortController、keepalive 端口注册</td><td>取消标记、API 计数、派生会话祖先链、实例身份</td><td>取消 ReAct 循环、获取/创建 AbortController、端口路由</td></tr><tr><td><code>src/background/index.js</code></td><td>后台入口、消息路由、SW 启动自检与自动恢复</td><td>ReAct Checkpoint、Agent 迁移结果</td><td>清理过期 checkpoint、检测可恢复任务、响应前端 GET/DELETE_CHECKPOINT</td></tr><tr><td><code>src/background/react-loop.js</code></td><td>ReAct 推理循环、Checkpoint 节流保存、恢复流程</td><td>currentMessages、executionLog、iteration、taskContext</td><td>saveCheckpointNow、resumeReactLoopFromCheckpoint、异常强制保存</td></tr><tr><td><code>src/shared/i18n.js</code></td><td>国际化初始化与跨环境语言同步</td><td>language 偏好</td><td>从 chrome.storage.local 读取语言并监听变更</td></tr></tbody></table><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L21-L92" target="_blank" rel="noreferrer">src/storage/db.js#L21-L92</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L42-L113" target="_blank" rel="noreferrer">src/storage/session-store.js#L42-L113</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L1-L45" target="_blank" rel="noreferrer">src/storage/token-store.js#L1-L45</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/state.js#L1-L74" target="_blank" rel="noreferrer">src/side_panel/state.js#L1-L74</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/state.js#L1-L46" target="_blank" rel="noreferrer">src/background/state.js#L1-L46</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L74-L95" target="_blank" rel="noreferrer">src/background/index.js#L74-L95</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L1037-L1075" target="_blank" rel="noreferrer">src/background/react-loop.js#L1037-L1075</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/i18n.js#L162-L193" target="_blank" rel="noreferrer">src/shared/i18n.js#L162-L193</a></li></ul><h2 id="架构总览-状态层次、存储分层与数据流" tabindex="-1">架构总览：状态层次、存储分层与数据流 <a class="header-anchor" href="#架构总览-状态层次、存储分层与数据流" aria-label="Permalink to &quot;架构总览：状态层次、存储分层与数据流&quot;">​</a></h2><h3 id="状态层次" tabindex="-1">状态层次 <a class="header-anchor" href="#状态层次" aria-label="Permalink to &quot;状态层次&quot;">​</a></h3><ul><li><strong>内存状态</strong>：侧边栏 <code>state.js</code> 维护 UI 渲染与交互所需状态；后台 <code>state.js</code> 维护任务生命周期、取消控制、端口路由。</li><li><strong>会话状态</strong>：活跃会话与归档会话持久化到 IndexedDB；当前活跃会话 ID 单独存储。</li><li><strong>配置数据</strong>：扩展配置、主题、工具列表、输入历史等保存在 <code>chrome.storage.local</code>。</li><li><strong>用户偏好</strong>：语言偏好、模型选择、温度、TopP 等可通过配置或会话级参数体现。</li><li><strong>运行态快照</strong>：ReAct Checkpoint 作为长任务中断后的断点续接数据，采用 IndexedDB + chrome.storage.local 双写。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;应用启动&quot;]) --&gt; LoadState[&quot;加载内存状态&lt;br/&gt;side_panel/state.js&quot;]
LoadState --&gt; InitStorage[&quot;初始化存储&lt;br/&gt;session-store.init()&quot;]
InitStorage --&gt; EnsureMigration[&quot;确保数据迁移&lt;br/&gt;ensureMigration()&quot;]
EnsureMigration --&gt; LoadSessions[&quot;加载会话列表&lt;br/&gt;getAllSessions() + getActiveSessionId()&quot;]
LoadSessions --&gt; RenderUI[&quot;渲染侧边栏 UI&quot;]
RenderUI --&gt; UserAction{&quot;用户操作&quot;}
UserAction --&gt; |新建/切换/归档/复制| SessionOps[&quot;会话操作&lt;br/&gt;session-store.js&quot;]
UserAction --&gt; |发送消息| ReactLoop[&quot;ReAct 循环&lt;br/&gt;react-loop.js&quot;]
ReactLoop --&gt; SaveCheckpoint[&quot;保存 Checkpoint&lt;br/&gt;saveReactCheckpoint()&quot;]
SessionOps --&gt; PersistIDB[&quot;写入 IndexedDB&lt;br/&gt;db.js withStore()&quot;]
SaveCheckpoint --&gt; PersistIDB
PersistIDB --&gt; UpdateMemory[&quot;更新内存状态&lt;br/&gt;state.js&quot;]
UpdateMemory --&gt; RenderUI
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L42-L113" target="_blank" rel="noreferrer">src/storage/session-store.js#L42-L113</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L154-L252" target="_blank" rel="noreferrer">src/storage/db.js#L154-L252</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L1037-L1075" target="_blank" rel="noreferrer">src/background/react-loop.js#L1037-L1075</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/state.js#L1-L74" target="_blank" rel="noreferrer">src/side_panel/state.js#L1-L74</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L42-L113" target="_blank" rel="noreferrer">src/storage/session-store.js#L42-L113</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L154-L252" target="_blank" rel="noreferrer">src/storage/db.js#L154-L252</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L1037-L1075" target="_blank" rel="noreferrer">src/background/react-loop.js#L1037-L1075</a></li></ul><h2 id="详细组件分析" tabindex="-1">详细组件分析 <a class="header-anchor" href="#详细组件分析" aria-label="Permalink to &quot;详细组件分析&quot;">​</a></h2><h3 id="indexeddb-数据模型与版本管理" tabindex="-1">IndexedDB 数据模型与版本管理 <a class="header-anchor" href="#indexeddb-数据模型与版本管理" aria-label="Permalink to &quot;IndexedDB 数据模型与版本管理&quot;">​</a></h3><p>数据库名称为 <code>ai-helper-db</code>，当前版本为 6。对象存储包括：</p><ul><li><code>sessions</code>：活跃会话，主键 <code>id</code>，索引 <code>updatedAt</code>。</li><li><code>activeSession</code>：单条记录，keyPath <code>key</code>，用于保存当前活跃会话 ID。</li><li><code>archivedSessions</code>：归档会话，主键 <code>id</code>，索引 <code>createdAt</code>。</li><li><code>uiPrototypes</code>：UI 原型，主键 <code>id</code>，索引 <code>createdAt</code>、<code>sessionId</code>。</li><li><code>tokenStats</code>：Token 使用统计，主键 <code>id</code>，索引 <code>sessionId</code>、<code>timestamp</code>。</li><li><code>reactCheckpoints</code>：ReAct Checkpoint，主键 <code>sessionId</code>，索引 <code>updatedAt</code>。</li><li><code>bookmarks</code>：消息收藏，主键 <code>id</code>，索引 <code>sessionId</code>、<code>createdAt</code>。</li><li><code>scheduledTasks</code>：定时任务，主键 <code>id</code>，索引 <code>nextRunAt</code>、<code>enabled</code>。</li></ul><pre class="mermaid">erDiagram
SESSIONS {
string id PK
string title
string model
boolean useTools
array enabledTools
string agentId
number temperature
number topP
array messageHistory
string updatedAt
number order
boolean isGenerating
array lastExecutionLog
}
ACTIVE_SESSION {
string key PK
string sessionId
}
ARCHIVED_SESSIONS {
string id PK
string title
string createdAt
array messages
}
UI_PROTOTYPES {
string id PK
string sessionId
string createdAt
}
TOKEN_STATS {
string id PK
string sessionId
string timestamp
string model
number promptTokens
number completionTokens
number totalTokens
number contextWindow
number contextUsageRate
string callType
}
REACT_CHECKPOINTS {
string sessionId PK
array currentMessages
array executionLog
number iteration
object globalIteration
object subtaskPlan
number currentSubtaskIndex
number totalReflectionRounds
string model
object apiParams
object taskContext
number tabId
string callId
string interruptedReason
number createdAt
number updatedAt
}
BOOKMARKS {
string id PK
string sessionId
string messageId
string content
string sessionTitle
string createdAt
boolean pinned
}
SCHEDULED_TASKS {
string id PK
string nextRunAt
boolean enabled
}
SESSIONS ||--o{ TOKEN_STATS : &quot;按 sessionId 关联&quot;
SESSIONS ||--o{ BOOKMARKS : &quot;按 sessionId 关联&quot;
UI_PROTOTYPES ||--o{ SESSIONS : &quot;按 sessionId 关联&quot;
REACT_CHECKPOINTS ||--|| SESSIONS : &quot;按 sessionId 对应&quot;
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L39-L92" target="_blank" rel="noreferrer">src/storage/db.js#L39-L92</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L604-L624" target="_blank" rel="noreferrer">src/storage/db.js#L604-L624</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L1-L45" target="_blank" rel="noreferrer">src/storage/token-store.js#L1-L45</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L21-L92" target="_blank" rel="noreferrer">src/storage/db.js#L21-L92</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L604-L624" target="_blank" rel="noreferrer">src/storage/db.js#L604-L624</a></li></ul><h3 id="事务处理与并发访问控制" tabindex="-1">事务处理与并发访问控制 <a class="header-anchor" href="#事务处理与并发访问控制" aria-label="Permalink to &quot;事务处理与并发访问控制&quot;">​</a></h3><p><code>withStore</code> 是统一的事务包装器，负责：</p><ul><li>检查 store 是否存在，若缺失则关闭连接并重置单例，延迟重试以触发 <code>onupgradeneeded</code>。</li><li>捕获 <code>transaction()</code> 同步异常，在失败时重置连接并重试一次。</li><li>在 <code>tx.oncomplete</code> 中 resolve，确保事务提交后再返回结果。</li><li>在 <code>tx.onerror</code> 与 <code>tx.onabort</code> 中执行连接重置与重试逻辑。</li><li>支持 <code>isRetry</code> 标志，避免无限重试。</li></ul><p>此外，<code>openDB</code> 中处理了 <code>onversionchange</code> 与 <code>onblocked</code>：</p><ul><li><code>onversionchange</code>：当其他连接触发版本变更时主动关闭当前连接，避免阻塞 DB 升级。</li><li><code>onblocked</code>：当升级被阻塞时记录警告，等待后续重试。</li></ul><pre class="mermaid">flowchart TD
Enter([&quot;withStore 调用&quot;]) --&gt; CheckStore[&quot;检查 store 是否存在&quot;]
CheckStore --&gt; |不存在| CloseConn[&quot;关闭连接并重置单例&quot;]
CloseConn --&gt; DelayRetry[&quot;延迟 50ms 重试&quot;]
DelayRetry --&gt; RetryCall[&quot;再次调用 withStore&quot;]
CheckStore --&gt; |存在| CreateTx[&quot;创建事务&quot;]
CreateTx --&gt; ExecCallback[&quot;执行回调&quot;]
ExecCallback --&gt; TxComplete{&quot;事务完成?&quot;}
TxComplete --&gt; |是| Resolve[&quot;resolve 结果&quot;]
TxComplete --&gt; |否| TxError{&quot;事务错误/中止?&quot;}
TxError --&gt; |是| ResetAndRetry[&quot;重置连接并重试&quot;]
TxError --&gt; |否| Wait[&quot;等待 oncomplete/onerror/onabort&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L154-L252" target="_blank" rel="noreferrer">src/storage/db.js#L154-L252</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L35-L121" target="_blank" rel="noreferrer">src/storage/db.js#L35-L121</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L154-L252" target="_blank" rel="noreferrer">src/storage/db.js#L154-L252</a></li></ul><h3 id="会话状态与变更追踪" tabindex="-1">会话状态与变更追踪 <a class="header-anchor" href="#会话状态与变更追踪" aria-label="Permalink to &quot;会话状态与变更追踪&quot;">​</a></h3><p><code>session-store.js</code> 提供与旧 API 兼容的会话操作：</p><ul><li><code>init()</code>：首次调用时执行 <code>ensureMigration()</code>，并清理孤儿 <code>scrollPosition_*</code> key。</li><li><code>loadSessions()</code>：并行加载会话列表与活跃会话 ID，按 <code>order</code> 排序。</li><li><code>saveCurrentSession()</code>：将当前内存状态映射到会话对象并持久化。</li><li><code>createSession()</code> / <code>importSessions()</code> / <code>appendMessageToSession()</code>：创建、导入、追加消息。</li><li><code>switchToSession()</code>：并发保存当前会话、读取目标会话、设置活跃会话 ID、恢复模型/温度/工具等状态。</li><li><code>deleteStoreSession()</code>：删除会话、清理 scrollPosition、checkpoint、收藏，并就近激活相邻会话。</li><li><code>archiveCurrentSession()</code> / <code>restoreArchivedSession()</code> / <code>duplicateSession()</code> / <code>createScheduledSession()</code>：归档、恢复、复制、定时任务宿主会话。</li></ul><pre class="mermaid">sequenceDiagram
participant UI as &quot;侧边栏 UI&quot;
participant Store as &quot;session-store.js&quot;
participant IDB as &quot;db.js&quot;
participant State as &quot;side_panel/state.js&quot;
UI-&gt;&gt;Store : switchToSession(sessionId)
Store-&gt;&gt;Store : saveCurrentSession()
Store-&gt;&gt;IDB : getSession(sessionId)
IDB--&gt;&gt;Store : targetSession
Store-&gt;&gt;IDB : setActiveSessionId(sessionId)
Store-&gt;&gt;State : 恢复 activeSessionId/messageHistory/model/temperature/topP/tools
Store--&gt;&gt;UI : 返回 targetSession
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L302-L389" target="_blank" rel="noreferrer">src/storage/session-store.js#L302-L389</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L129-L178" target="_blank" rel="noreferrer">src/storage/session-store.js#L129-L178</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L42-L113" target="_blank" rel="noreferrer">src/storage/session-store.js#L42-L113</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L302-L389" target="_blank" rel="noreferrer">src/storage/session-store.js#L302-L389</a></li></ul><h3 id="react-checkpoint-双写与恢复" tabindex="-1">ReAct Checkpoint 双写与恢复 <a class="header-anchor" href="#react-checkpoint-双写与恢复" aria-label="Permalink to &quot;ReAct Checkpoint 双写与恢复&quot;">​</a></h3><p>ReAct Checkpoint 是长任务中断后的断点续接数据，采用双写策略：</p><ul><li>先写 <code>chrome.storage.local</code>（可靠），再尝试写入 IndexedDB（性能优化）。</li><li>读取时优先 IndexedDB，失败降级到 <code>chrome.storage.local</code>。</li><li>删除时同时清理两处存储。</li><li>SW 启动时清理超过 7 天的过期 checkpoint。</li></ul><pre class="mermaid">sequenceDiagram
participant Loop as &quot;react-loop.js&quot;
participant DB as &quot;db.js&quot;
participant Storage as &quot;chrome.storage.local&quot;
participant SW as &quot;background/index.js&quot;
Loop-&gt;&gt;DB : saveReactCheckpoint(checkpoint)
DB-&gt;&gt;Storage : set(key, data)
DB-&gt;&gt;DB : withStore(&#39;reactCheckpoints&#39;, &#39;readwrite&#39;)
Note over DB,Storage : 双写：storage.local 为主，IDB 为辅
SW-&gt;&gt;DB : cleanupExpiredReactCheckpoints()
DB-&gt;&gt;DB : getAllReactCheckpoints()
DB-&gt;&gt;DB : deleteReactCheckpoint(sessionId)
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L633-L703" target="_blank" rel="noreferrer">src/storage/db.js#L633-L703</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L786-L799" target="_blank" rel="noreferrer">src/storage/db.js#L786-L799</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L74-L95" target="_blank" rel="noreferrer">src/background/index.js#L74-L95</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L633-L703" target="_blank" rel="noreferrer">src/storage/db.js#L633-L703</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L786-L799" target="_blank" rel="noreferrer">src/storage/db.js#L786-L799</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L74-L95" target="_blank" rel="noreferrer">src/background/index.js#L74-L95</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L1037-L1075" target="_blank" rel="noreferrer">src/background/react-loop.js#L1037-L1075</a></li></ul><h3 id="状态迁移与版本兼容性" tabindex="-1">状态迁移与版本兼容性 <a class="header-anchor" href="#状态迁移与版本兼容性" aria-label="Permalink to &quot;状态迁移与版本兼容性&quot;">​</a></h3><ul><li><code>migrateFromChromeStorage()</code>：将旧 <code>chrome.storage.local</code> 中的 <code>sessions</code> 与 <code>conversationSessions</code> 迁移到 IndexedDB，并清理旧的大数据 key。</li><li><code>ensureMigration()</code>：若 IndexedDB 无数据且无活跃会话标记，则尝试迁移。</li><li><code>session-store.js</code> 的 <code>init()</code> 在首次加载时调用 <code>ensureMigration()</code>。</li><li><code>db.js</code> 的 <code>DB_VERSION = 6</code>，并在 <code>onupgradeneeded</code> 中按需创建 store 与索引。</li></ul><pre class="mermaid">flowchart TD
AppStart[&quot;应用启动&quot;] --&gt; SessionInit[&quot;session-store.init()&quot;]
SessionInit --&gt; Ensure[&quot;ensureMigration()&quot;]
Ensure --&gt; HasData{&quot;IndexedDB 有数据?&quot;}
HasData --&gt; |是| Ready[&quot;就绪&quot;]
HasData --&gt; |否| Migrate[&quot;migrateFromChromeStorage()&quot;]
Migrate --&gt; CleanOld[&quot;清理旧 storage.local 大数据 key&quot;]
CleanOld --&gt; Ready
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L554-L602" target="_blank" rel="noreferrer">src/storage/db.js#L554-L602</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L42-L54" target="_blank" rel="noreferrer">src/storage/session-store.js#L42-L54</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L554-L602" target="_blank" rel="noreferrer">src/storage/db.js#L554-L602</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L42-L54" target="_blank" rel="noreferrer">src/storage/session-store.js#L42-L54</a></li></ul><h3 id="用户偏好与配置同步" tabindex="-1">用户偏好与配置同步 <a class="header-anchor" href="#用户偏好与配置同步" aria-label="Permalink to &quot;用户偏好与配置同步&quot;">​</a></h3><p>语言偏好通过 <code>shared/i18n.js</code> 初始化：</p><ul><li>从 <code>chrome.storage.local</code> 读取 <code>language</code>。</li><li>未设置时根据浏览器语言自动检测并持久化。</li><li>监听 <code>chrome.storage.onChanged</code>，实现跨环境同步。</li></ul><pre class="mermaid">sequenceDiagram
participant Env as &quot;任意环境&quot;
participant I18n as &quot;shared/i18n.js&quot;
participant Storage as &quot;chrome.storage.local&quot;
Env-&gt;&gt;I18n : initI18n()
I18n-&gt;&gt;Storage : get(&#39;language&#39;)
Storage--&gt;&gt;I18n : language
I18n-&gt;&gt;Storage : set({ language })
Storage--&gt;&gt;I18n : onChanged(language)
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/i18n.js#L162-L193" target="_blank" rel="noreferrer">src/shared/i18n.js#L162-L193</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/i18n.js#L162-L193" target="_blank" rel="noreferrer">src/shared/i18n.js#L162-L193</a></li></ul><h2 id="依赖关系与并发控制" tabindex="-1">依赖关系与并发控制 <a class="header-anchor" href="#依赖关系与并发控制" aria-label="Permalink to &quot;依赖关系与并发控制&quot;">​</a></h2><h3 id="组件依赖图" tabindex="-1">组件依赖图 <a class="header-anchor" href="#组件依赖图" aria-label="Permalink to &quot;组件依赖图&quot;">​</a></h3><pre class="mermaid">graph TB
SP_State[&quot;side_panel/state.js&quot;]
BG_State[&quot;background/state.js&quot;]
SessionStore[&quot;session-store.js&quot;]
TokenStore[&quot;token-store.js&quot;]
DB[&quot;db.js&quot;]
IndexJS[&quot;background/index.js&quot;]
ReactLoop[&quot;background/react-loop.js&quot;]
SP_State --&gt; SessionStore
SessionStore --&gt; DB
TokenStore --&gt; DB
IndexJS --&gt; DB
ReactLoop --&gt; DB
IndexJS --&gt; ReactLoop
BG_State --&gt; ReactLoop
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L1-L10" target="_blank" rel="noreferrer">src/storage/session-store.js#L1-L10</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L1-L4" target="_blank" rel="noreferrer">src/storage/token-store.js#L1-L4</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L1-L5" target="_blank" rel="noreferrer">src/storage/db.js#L1-L5</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L15-L95" target="_blank" rel="noreferrer">src/background/index.js#L15-L95</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L636-L726" target="_blank" rel="noreferrer">src/background/react-loop.js#L636-L726</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L1-L10" target="_blank" rel="noreferrer">src/storage/session-store.js#L1-L10</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L1-L4" target="_blank" rel="noreferrer">src/storage/token-store.js#L1-L4</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L1-L5" target="_blank" rel="noreferrer">src/storage/db.js#L1-L5</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L15-L95" target="_blank" rel="noreferrer">src/background/index.js#L15-L95</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L636-L726" target="_blank" rel="noreferrer">src/background/react-loop.js#L636-L726</a></li></ul><h3 id="并发与取消控制" tabindex="-1">并发与取消控制 <a class="header-anchor" href="#并发与取消控制" aria-label="Permalink to &quot;并发与取消控制&quot;">​</a></h3><ul><li>后台 <code>state.js</code> 维护每个会话的 <code>AbortController</code>，支持取消 ReAct 循环与工具等待。</li><li>派生会话（子任务/子代理）通过祖先链回退到根会话进行取消与可见性判定。</li><li>keepalive 端口注册表用于定向消息路由，避免多 Tab 实例广播导致的误判。</li></ul><pre class="mermaid">flowchart TD
CancelReq[&quot;取消请求&quot;] --&gt; CheckType{&quot;sessionId 还是 tabId?&quot;}
CheckType --&gt; |tabId| OldCompat[&quot;旧版兼容：cancelledTabs&quot;]
CheckType --&gt; |sessionId| NewCancel[&quot;cancelledSessions.set(sessionId, true)&quot;]
NewCancel --&gt; AbortFetch[&quot;sessionAbortControllers.get(sessionId).abort()&quot;]
OldCompat --&gt; ClearAll[&quot;clearAll()&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/state.js#L50-L83" target="_blank" rel="noreferrer">src/background/state.js#L50-L83</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/state.js#L125-L147" target="_blank" rel="noreferrer">src/background/state.js#L125-L147</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/state.js#L50-L83" target="_blank" rel="noreferrer">src/background/state.js#L50-L83</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/state.js#L125-L147" target="_blank" rel="noreferrer">src/background/state.js#L125-L147</a></li></ul><h2 id="性能优化与大数据量策略" tabindex="-1">性能优化与大数据量策略 <a class="header-anchor" href="#性能优化与大数据量策略" aria-label="Permalink to &quot;性能优化与大数据量策略&quot;">​</a></h2><h3 id="查询优化" tabindex="-1">查询优化 <a class="header-anchor" href="#查询优化" aria-label="Permalink to &quot;查询优化&quot;">​</a></h3><ul><li><code>getSessionTokenSummary</code> 使用 <code>sessionId</code> 索引与 <code>IDBKeyRange.bound</code> 缩小候选集，避免全表扫描。</li><li><code>getDailyTokenSummary</code> 与 <code>getOverallTokenSummaryByRange</code> 使用 <code>timestamp</code> 索引进行范围查询。</li><li><code>searchActiveSessionsMessages</code> 在指定 <code>sessionId</code> 时使用 O(1) 主键查询，避免加载所有会话。</li></ul><h3 id="缓存策略" tabindex="-1">缓存策略 <a class="header-anchor" href="#缓存策略" aria-label="Permalink to &quot;缓存策略&quot;">​</a></h3><ul><li><code>db.js</code> 的 <code>getDB()</code> 返回单例连接，减少重复打开开销。</li><li><code>session-store.js</code> 的 <code>loadSessions()</code> 并行加载会话列表与活跃会话 ID。</li><li><code>switchToSession()</code> 并行发起保存当前会话与读取目标会话，提升切换性能。</li></ul><h3 id="性能监控建议" tabindex="-1">性能监控建议 <a class="header-anchor" href="#性能监控建议" aria-label="Permalink to &quot;性能监控建议&quot;">​</a></h3><ul><li>监控 IndexedDB 事务错误与 abort 次数，识别连接不稳定场景。</li><li>监控 ReAct Checkpoint 双写成功率，评估 IndexedDB 可用性。</li><li>监控 Token 统计聚合查询耗时，评估索引有效性。</li><li>监控 SW 启动时 checkpoint 清理数量，评估数据增长趋势。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L52-L98" target="_blank" rel="noreferrer">src/storage/token-store.js#L52-L98</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L194-L277" target="_blank" rel="noreferrer">src/storage/token-store.js#L194-L277</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L486-L520" target="_blank" rel="noreferrer">src/storage/db.js#L486-L520</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L85-L99" target="_blank" rel="noreferrer">src/storage/session-store.js#L85-L99</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L302-L312" target="_blank" rel="noreferrer">src/storage/session-store.js#L302-L312</a></li></ul><h2 id="故障排查指南" tabindex="-1">故障排查指南 <a class="header-anchor" href="#故障排查指南" aria-label="Permalink to &quot;故障排查指南&quot;">​</a></h2><h3 id="indexeddb-连接问题" tabindex="-1">IndexedDB 连接问题 <a class="header-anchor" href="#indexeddb-连接问题" aria-label="Permalink to &quot;IndexedDB 连接问题&quot;">​</a></h3><ul><li>现象：store 不存在导致写入静默失败。</li><li>原因：其他连接持有旧版本，阻塞升级。</li><li>解决：<code>withStore</code> 自动关闭连接并重置单例，延迟重试；<code>onversionchange</code> 主动关闭当前连接。</li></ul><h3 id="checkpoint-恢复失败" tabindex="-1">Checkpoint 恢复失败 <a class="header-anchor" href="#checkpoint-恢复失败" aria-label="Permalink to &quot;Checkpoint 恢复失败&quot;">​</a></h3><ul><li>现象：前端显示“继续执行”但后端无法恢复。</li><li>原因：checkpoint 未成功双写或 sessionId 不匹配。</li><li>排查：检查 <code>chrome.storage.local</code> 中 <code>react_checkpoint_*</code> 是否存在；查看 <code>getAllReactCheckpoints</code> 输出。</li></ul><h3 id="会话切换卡顿" tabindex="-1">会话切换卡顿 <a class="header-anchor" href="#会话切换卡顿" aria-label="Permalink to &quot;会话切换卡顿&quot;">​</a></h3><ul><li>现象：切换会话时 UI 卡顿。</li><li>原因：全量加载所有会话或消息历史过大。</li><li>优化：使用 <code>order</code> 排序、分页加载、懒加载消息历史。</li></ul><h3 id="token-统计查询缓慢" tabindex="-1">Token 统计查询缓慢 <a class="header-anchor" href="#token-统计查询缓慢" aria-label="Permalink to &quot;Token 统计查询缓慢&quot;">​</a></h3><ul><li>现象：Token 统计页面加载慢。</li><li>原因：全表扫描 <code>tokenStats</code>。</li><li>优化：使用 <code>sessionId</code> 与 <code>timestamp</code> 索引，限制返回记录数。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L154-L252" target="_blank" rel="noreferrer">src/storage/db.js#L154-L252</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L633-L703" target="_blank" rel="noreferrer">src/storage/db.js#L633-L703</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L52-L98" target="_blank" rel="noreferrer">src/storage/token-store.js#L52-L98</a></li></ul><h2 id="结论" tabindex="-1">结论 <a class="header-anchor" href="#结论" aria-label="Permalink to &quot;结论&quot;">​</a></h2><p>本项目的状态管理与持久化体系围绕三层展开：</p><ul><li>内存状态：侧边栏与后台分别维护运行时状态，支持多会话并行与取消控制。</li><li>会话状态：IndexedDB 作为主存储，支持活跃会话、归档会话、收藏、原型、定时任务等。</li><li>配置与偏好：<code>chrome.storage.local</code> 作为轻量配置与后备存储，语言偏好跨环境同步。</li></ul><p>关键设计亮点：</p><ul><li><code>withStore</code> 统一事务包装，增强连接稳定性与错误恢复能力。</li><li>ReAct Checkpoint 双写策略保障长任务可靠性。</li><li>数据迁移与版本管理确保平滑升级。</li><li>查询优化与索引设计应对大数据量场景。</li></ul><p>未来改进方向：</p><ul><li>引入增量聚合记录（如 <code>overall</code> 汇总）减少全表扫描。</li><li>增加更细粒度的性能埋点与监控。</li><li>探索分片存储与异步批量写入，进一步提升高并发场景下的稳定性。</li></ul>`,118)])])}const u=r(s,[["render",i]]);export{b as __pageData,u as default};
