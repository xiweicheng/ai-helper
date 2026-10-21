import{_ as r,o as t,c as s,a3 as o}from"./chunks/framework.BrO6lPIi.js";const u=JSON.parse('{"title":"数据存储层","description":"本文件聚焦扩展端的数据存储层，围绕 IndexedDB 封装、会话持久化、ReAct 检查点双写策略、Token 统计聚合以及配置管理中的用户设置合并与迁移展开。","frontmatter":{"title":"数据存储层","description":"本文件聚焦扩展端的数据存储层，围绕 IndexedDB 封装、会话持久化、ReAct 检查点双写策略、Token 统计聚合以及配置管理中的用户设置合并与迁移展开。"},"headers":[],"relativePath":"数据存储层/index.md","filePath":"数据存储层/index.md","lastUpdated":null}'),i={name:"数据存储层/index.md"};function a(l,e,n,c,g,h){return t(),s("div",null,[...e[0]||(e[0]=[o(`<h1 id="数据存储层" tabindex="-1">数据存储层 <a class="header-anchor" href="#数据存储层" aria-label="Permalink to &quot;数据存储层&quot;">​</a></h1><details class="details custom-block"><summary>本文引用的源码文件</summary><p><strong>本文引用的文件</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js" target="_blank" rel="noreferrer">src/storage/db.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js" target="_blank" rel="noreferrer">src/storage/session-store.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js" target="_blank" rel="noreferrer">src/storage/token-store.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js" target="_blank" rel="noreferrer">src/background/react-loop.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/options/config-io.js" target="_blank" rel="noreferrer">src/options/config-io.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/model-profiles.js" target="_blank" rel="noreferrer">src/shared/model-profiles.js</a></li></ul></details><h2 id="目录" tabindex="-1">目录 <a class="header-anchor" href="#目录" aria-label="Permalink to &quot;目录&quot;">​</a></h2><ol><li><a href="#引言">引言</a></li><li><a href="#项目结构">项目结构</a></li><li><a href="#核心组件">核心组件</a></li><li><a href="#架构总览">架构总览</a></li><li><a href="#详细组件分析">详细组件分析</a></li><li><a href="#依赖关系分析">依赖关系分析</a></li><li><a href="#性能与一致性">性能与一致性</a></li><li><a href="#故障排查指南">故障排查指南</a></li><li><a href="#结论">结论</a></li><li><a href="#附录数据模型与操作示例">附录：数据模型与操作示例</a></li></ol><h2 id="引言" tabindex="-1">引言 <a class="header-anchor" href="#引言" aria-label="Permalink to &quot;引言&quot;">​</a></h2><p>本文件聚焦扩展端的数据存储层，围绕 IndexedDB 封装、会话持久化、ReAct 检查点双写策略、Token 统计聚合以及配置管理中的用户设置合并与迁移展开。文档目标包括：</p><ul><li>解释数据库连接管理、事务处理、版本升级与 store 缺失恢复机制。</li><li>说明会话状态持久化、切换流程、归档/恢复、分叉复制与定时任务宿主会话。</li><li>描述 ReAct checkpoint 的 IndexedDB + chrome.storage.local 双写与降级读取策略。</li><li>梳理 Token 使用统计的索引优化、时间范围查询与多维聚合。</li><li>总结配置管理系统中默认值合并、导入策略、扁平键投影与版本迁移。</li><li>给出数据模型设计、索引策略、约束规则与常见 CRUD、批量、备份恢复示例路径。</li></ul><h2 id="项目结构" tabindex="-1">项目结构 <a class="header-anchor" href="#项目结构" aria-label="Permalink to &quot;项目结构&quot;">​</a></h2><p>数据存储相关代码集中在 <code>src/storage</code>，并由 background、side panel、options 等模块调用：</p><ul><li><code>db.js</code>：IndexedDB 封装层，定义数据库名、版本号、objectStore、索引、通用事务包装器、CRUD、迁移与 ReAct checkpoint 双写。</li><li><code>session-store.js</code>：会话存储适配器，提供与旧 API 兼容的会话加载、保存、创建、切换、归档、恢复、复制、删除、重命名、排序等能力。</li><li><code>token-store.js</code>：Token 使用统计的 IndexedDB CRUD 与聚合查询接口。</li><li>上层调用方：background 的 ReAct 循环写入 checkpoint；options 的配置导入与厂商配置合并；side panel 的收藏、会话 UI 等。</li></ul><pre class="mermaid">graph TB
subgraph &quot;扩展端&quot;
SW[&quot;Service Worker / Background&quot;]
Panel[&quot;Side Panel&quot;]
Options[&quot;Options 页面&quot;]
end
subgraph &quot;存储层&quot;
DB[&quot;IndexedDB 封装&lt;br/&gt;db.js&quot;]
SS[&quot;会话存储适配器&lt;br/&gt;session-store.js&quot;]
TS[&quot;Token 统计存储&lt;br/&gt;token-store.js&quot;]
end
subgraph &quot;浏览器存储&quot;
IDB[&quot;IndexedDB&quot;]
CS[&quot;chrome.storage.local&quot;]
end
SW --&gt; DB
Panel --&gt; SS
Options --&gt; DB
SS --&gt; DB
TS --&gt; DB
DB --&gt; IDB
DB -.-&gt; CS
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L21-L92" target="_blank" rel="noreferrer">src/storage/db.js#L21-L92</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L1-L10" target="_blank" rel="noreferrer">src/storage/session-store.js#L1-L10</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L1-L12" target="_blank" rel="noreferrer">src/storage/token-store.js#L1-L12</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L1-L122" target="_blank" rel="noreferrer">src/storage/db.js#L1-L122</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L1-L54" target="_blank" rel="noreferrer">src/storage/session-store.js#L1-L54</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L1-L45" target="_blank" rel="noreferrer">src/storage/token-store.js#L1-L45</a></li></ul><h2 id="核心组件" tabindex="-1">核心组件 <a class="header-anchor" href="#核心组件" aria-label="Permalink to &quot;核心组件&quot;">​</a></h2><ul><li>IndexedDB 封装层（db.js） <ul><li>单例连接、onversionchange/onblocked 处理、store 存在性检测与自动重试。</li><li>withStore 统一事务包装，支持 readwrite/readonly、失败重试、连接重置。</li><li>sessions、activeSession、archivedSessions、uiPrototypes、tokenStats、reactCheckpoints、bookmarks、scheduledTasks 等对象存储及索引。</li><li>从 chrome.storage.local 到 IndexedDB 的迁移工具。</li><li>ReAct checkpoint 的双写（先 chrome.storage.local，再 IndexedDB）与降级读取。</li></ul></li><li>会话存储适配器（session-store.js） <ul><li>初始化时触发 ensureMigration，清理孤儿 scrollPosition key。</li><li>loadSessions/saveSessions 并发读写活跃会话与活跃会话标记。</li><li>saveCurrentSession 将当前 state 映射为会话对象并持久化。</li><li>createSession/importSessions/appendMessageToSession/duplicateSession/archiveCurrentSession/restoreArchivedSession/renameSession/reorderSessions/createScheduledSession 等完整生命周期方法。</li><li>deleteStoreSession 同步清理 bookmark、scrollPosition、checkpoint 并就近激活相邻会话。</li></ul></li><li>Token 统计存储（token-store.js） <ul><li>recordTokenCall 记录单次 API 调用的 token 用量、上下文窗口占用率、调用类型等。</li><li>getSessionTokenSummary 利用 sessionId 索引 + KeyRange 缩小扫描范围。</li><li>getOverallTokenSummary/getDailyTokenSummary/getOverallTokenSummaryByRange/getTokenSummaryByModel/getTokenSummaryByCallType 等多维聚合。</li><li>clearSessionTokenStats/clearAllTokenStats 清理接口。</li></ul></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L124-L252" target="_blank" rel="noreferrer">src/storage/db.js#L124-L252</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L254-L545" target="_blank" rel="noreferrer">src/storage/db.js#L254-L545</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L547-L800" target="_blank" rel="noreferrer">src/storage/db.js#L547-L800</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L801-L907" target="_blank" rel="noreferrer">src/storage/db.js#L801-L907</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L42-L113" target="_blank" rel="noreferrer">src/storage/session-store.js#L42-L113</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L115-L208" target="_blank" rel="noreferrer">src/storage/session-store.js#L115-L208</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L210-L389" target="_blank" rel="noreferrer">src/storage/session-store.js#L210-L389</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L391-L662" target="_blank" rel="noreferrer">src/storage/session-store.js#L391-L662</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L13-L98" target="_blank" rel="noreferrer">src/storage/token-store.js#L13-L98</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L100-L185" target="_blank" rel="noreferrer">src/storage/token-store.js#L100-L185</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L187-L346" target="_blank" rel="noreferrer">src/storage/token-store.js#L187-L346</a></li></ul><h2 id="架构总览" tabindex="-1">架构总览 <a class="header-anchor" href="#架构总览" aria-label="Permalink to &quot;架构总览&quot;">​</a></h2><p>数据流从业务层进入存储层，最终落盘到 IndexedDB，必要时回退到 chrome.storage.local。关键路径包括：</p><ul><li>会话读写：通过 session-store.js 调用 db.js 的 withStore，保证事务提交后再返回结果。</li><li>ReAct checkpoint：background/react-loop.js 调用 db.js 的 saveReactCheckpoint，采用“可靠优先”的双写策略。</li><li>Token 统计：业务侧记录调用后由 token-store.js 写入 tokenStats，并提供多种聚合查询。</li><li>配置管理：options/config-io.js 与 shared/model-profiles.js 负责厂商配置合并、扁平键投影与迁移。</li></ul><pre class="mermaid">sequenceDiagram
participant BG as &quot;Background(ReAct)&quot;
participant DB as &quot;db.js&quot;
participant IDB as &quot;IndexedDB&quot;
participant CS as &quot;chrome.storage.local&quot;
BG-&gt;&gt;DB : saveReactCheckpoint(checkpoint)
DB-&gt;&gt;CS : set(key, data)
DB-&gt;&gt;IDB : put reactCheckpoints
IDB--&gt;&gt;DB : success/failure
CS--&gt;&gt;DB : ok
DB--&gt;&gt;BG : boolean (是否至少一个存储成功)
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L543-L570" target="_blank" rel="noreferrer">src/background/react-loop.js#L543-L570</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L626-L703" target="_blank" rel="noreferrer">src/storage/db.js#L626-L703</a></li></ul><h2 id="详细组件分析" tabindex="-1">详细组件分析 <a class="header-anchor" href="#详细组件分析" aria-label="Permalink to &quot;详细组件分析&quot;">​</a></h2><h3 id="indexeddb-封装层-db-js" tabindex="-1">IndexedDB 封装层（db.js） <a class="header-anchor" href="#indexeddb-封装层-db-js" aria-label="Permalink to &quot;IndexedDB 封装层（db.js）&quot;">​</a></h3><ul><li>数据库连接管理 <ul><li>单例缓存 <code>dbPromise</code>，避免重复打开。</li><li>onversionchange 主动关闭当前连接并清空缓存，允许其他连接进行版本升级。</li><li>onblocked 不直接 reject，等待后续重试获取新连接。</li></ul></li><li>事务处理 <ul><li>withStore 封装事务创建、回调执行、complete/error/abort 事件处理。</li><li>当 store 不存在或事务异常时，自动 resetDBConnection 并重试一次，防止 Service Worker 重启导致连接失效。</li></ul></li><li>数据迁移 <ul><li>migrateFromChromeStorage 将旧 sessions/conversationSessions 迁移至 IndexedDB，并清理大数据 key。</li><li>ensureMigration 在首次访问时判断是否需要迁移。</li></ul></li><li>ReAct Checkpoint 双写 <ul><li>saveReactCheckpoint 先写 chrome.storage.local，再尝试 IndexedDB；任一成功即认为成功。</li><li>getReactCheckpoint 优先读 IndexedDB，失败降级到 chrome.storage.local。</li><li>getAllReactCheckpoints 合并两个来源去重，sessionId 作为主键。</li><li>cleanupExpiredReactCheckpoints 基于 TTL（7 天）清理过期 checkpoint。</li></ul></li></ul><pre class="mermaid">flowchart TD
Start([&quot;withStore(storeName, mode, callback)&quot;]) --&gt; GetDB[&quot;getDB() 获取连接&quot;]
GetDB --&gt; CheckStore{&quot;store 是否存在?&quot;}
CheckStore --&gt; |否| CloseAndRetry[&quot;关闭连接并重置缓存&lt;br/&gt;延迟重试一次&quot;]
CheckStore --&gt; |是| CreateTx[&quot;创建事务&quot;]
CreateTx --&gt; ExecCb[&quot;执行回调并保存结果&quot;]
ExecCb --&gt; TxComplete{&quot;事务完成?&quot;}
TxComplete --&gt; |是| Resolve[&quot;resolve(结果)&quot;]
TxComplete --&gt; |否| HandleError[&quot;error/abort 分支&quot;]
HandleError --&gt; RetryOrReject{&quot;是否已重试?&quot;}
RetryOrReject --&gt; |否| ResetAndRetry[&quot;resetDBConnection()&lt;br/&gt;延迟重试一次&quot;]
RetryOrReject --&gt; |是| Reject[&quot;reject(错误)&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L154-L252" target="_blank" rel="noreferrer">src/storage/db.js#L154-L252</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L31-L144" target="_blank" rel="noreferrer">src/storage/db.js#L31-L144</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L146-L252" target="_blank" rel="noreferrer">src/storage/db.js#L146-L252</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L547-L602" target="_blank" rel="noreferrer">src/storage/db.js#L547-L602</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L626-L800" target="_blank" rel="noreferrer">src/storage/db.js#L626-L800</a></li></ul><h3 id="会话存储适配器-session-store-js" tabindex="-1">会话存储适配器（session-store.js） <a class="header-anchor" href="#会话存储适配器-session-store-js" aria-label="Permalink to &quot;会话存储适配器（session-store.js）&quot;">​</a></h3><ul><li>初始化与迁移 <ul><li>init 调用 idb.ensureMigration，确保 IndexedDB 有数据或完成迁移。</li><li>cleanupOrphanScrollPositions 清理无对应会话的 scrollPosition_* key。</li></ul></li><li>会话加载与保存 <ul><li>loadSessions 并发获取 sessions 列表与 activeSessionId，按 order/createdAt 排序。</li><li>saveSessions 并发写入 sessions 列表与 activeSessionId。</li></ul></li><li>当前会话持久化 <ul><li>saveCurrentSession 将 state 中的 model、tools、agentId、temperature、topP、contextCompaction、messageHistory 等映射为会话对象，更新 title、updatedAt，并持久化。</li></ul></li><li>会话生命周期 <ul><li>createSession：生成唯一 ID，写入默认字段，设为活跃会话。</li><li>importSessions：导入多条会话，重新生成 ID/order，必要时自动切换到首个导入会话。</li><li>appendMessageToSession：向指定会话追加消息，适用于后台任务仍在执行时的异步保存。</li><li>switchToSession：并发保存当前会话与读取目标会话，更新 activeSessionId、state 字段，并根据 agentId 决定应用 Agent 配置或全局配置；恢复 isGenerating 状态需校验 pendingCallApiSessionIds。</li><li>deleteStoreSession：删除会话、清理 scrollPosition、checkpoint、bookmark，若删除的是活跃会话则就近激活相邻会话。</li><li>renameSession/reorderSessions：重命名与批量更新 order。</li><li>archiveCurrentSession：构造归档会话（最多保留 20 条），替换归档列表，删除原活跃会话并创建空会话。</li><li>restoreArchivedSession：从归档恢复为新活跃会话，并从归档移除。</li><li>duplicateSession：支持完整复制与消息级分叉（upToMessageId），深拷贝 executionLog/contextBubbles，重新生成 messageId，记录 forkMetadata。</li><li>createScheduledSession：为定时任务创建宿主会话，标记 scheduledTaskId，避免覆盖全局默认值。</li></ul></li></ul><pre class="mermaid">sequenceDiagram
participant UI as &quot;UI/业务层&quot;
participant SS as &quot;session-store.js&quot;
participant DB as &quot;db.js&quot;
participant CS as &quot;chrome.storage.local&quot;
UI-&gt;&gt;SS : switchToSession(targetId)
SS-&gt;&gt;SS : saveCurrentSession()
SS-&gt;&gt;DB : getSession(targetId)
DB--&gt;&gt;SS : targetSession
SS-&gt;&gt;DB : setActiveSessionId(targetId)
SS-&gt;&gt;CS : get([&#39;modelName&#39;,&#39;temperature&#39;,&#39;topP&#39;])
alt 绑定自定义 Agent
SS-&gt;&gt;SS : 从 Agent 配置加载 model/temperature/topP
else 默认 Agent
SS-&gt;&gt;SS : 应用全局 modelName/temperature/topP
end
SS--&gt;&gt;UI : targetSession
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L298-L389" target="_blank" rel="noreferrer">src/storage/session-store.js#L298-L389</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L126-L178" target="_blank" rel="noreferrer">src/storage/session-store.js#L126-L178</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L42-L113" target="_blank" rel="noreferrer">src/storage/session-store.js#L42-L113</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L115-L208" target="_blank" rel="noreferrer">src/storage/session-store.js#L115-L208</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L210-L389" target="_blank" rel="noreferrer">src/storage/session-store.js#L210-L389</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L391-L662" target="_blank" rel="noreferrer">src/storage/session-store.js#L391-L662</a></li></ul><h3 id="token-统计存储-token-store-js" tabindex="-1">Token 统计存储（token-store.js） <a class="header-anchor" href="#token-统计存储-token-store-js" aria-label="Permalink to &quot;Token 统计存储（token-store.js）&quot;">​</a></h3><ul><li>记录与聚合 <ul><li>recordTokenCall 写入 tokenStats，包含 sessionId、model、prompt/completion/totalTokens、contextWindow、contextUsageRate、callType、timestamp。</li><li>getSessionTokenSummary 使用 sessionId 索引 + KeyRange 缩小候选集，计算总量、调用次数、平均/最大/最小上下文占用率，并返回最近 20 条记录。</li><li>getOverallTokenSummary 计算全局总量、API 调用次数、会话数（排除系统会话）、最后更新时间。</li><li>getDailyTokenSummary 按天聚合，使用 timestamp 索引下界过滤。</li><li>getOverallTokenSummaryByRange 按时间范围过滤并聚合。</li><li>getTokenSummaryByModel/getTokenSummaryByCallType 按模型/调用类型聚合百分比。</li></ul></li><li>清理 <ul><li>clearSessionTokenStats/clearAllTokenStats 提供会话级与全局清理。</li></ul></li></ul><pre class="mermaid">flowchart TD
Record[&quot;recordTokenCall(record)&quot;] --&gt; Put[&quot;withStore(&#39;tokenStats&#39;, &#39;readwrite&#39;)&quot;]
Put --&gt; Done[&quot;返回 true/false&quot;]
Query[&quot;getSessionTokenSummary(sessionId)&quot;] --&gt; Index[&quot;index(&#39;sessionId&#39;).getAll(KeyRange)&quot;]
Index --&gt; Filter[&quot;精确过滤 sessionId 与子任务前缀&quot;]
Filter --&gt; Aggregate[&quot;计算总量/次数/占用率/Top20&quot;]
Aggregate --&gt; Result[&quot;返回汇总对象&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L24-L45" target="_blank" rel="noreferrer">src/storage/token-store.js#L24-L45</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L52-L98" target="_blank" rel="noreferrer">src/storage/token-store.js#L52-L98</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L13-L98" target="_blank" rel="noreferrer">src/storage/token-store.js#L13-L98</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L100-L185" target="_blank" rel="noreferrer">src/storage/token-store.js#L100-L185</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L187-L346" target="_blank" rel="noreferrer">src/storage/token-store.js#L187-L346</a></li></ul><h3 id="配置管理系统-用户设置、默认值合并、验证与版本迁移" tabindex="-1">配置管理系统（用户设置、默认值合并、验证与版本迁移） <a class="header-anchor" href="#配置管理系统-用户设置、默认值合并、验证与版本迁移" aria-label="Permalink to &quot;配置管理系统（用户设置、默认值合并、验证与版本迁移）&quot;">​</a></h3><ul><li>导入策略与合并 <ul><li>options/config-io.js 支持 merge/replace 两种导入策略。</li><li>merge 模式下对 modelProfiles 按 ID 对齐合并：新 ID 追加，同 ID 以 updatedAt 较新的覆盖，旧的忽略；之后统一重投影扁平键（apiBase/apiKey/modelName/customModels）以保证“扁平键 = 激活配置”。</li><li>replace 模式完全替换，并对密钥进行混淆后写入。</li></ul></li><li>厂商配置迁移与一致性 <ul><li>shared/model-profiles.js 提供 ensureProfilesMigrated，将旧扁平键迁移为 profiles 数组，并保证 activeProfileId 有效。</li><li>applyProfile/deleteProfile 等操作会同步扁平键，保持新旧格式一致。</li><li>mergeProfiles 实现按 ID 对齐合并逻辑，空白默认配置可被导入条目覆盖。</li></ul></li></ul><pre class="mermaid">flowchart TD
Import[&quot;导入配置&quot;] --&gt; Strategy{&quot;策略: merge | replace&quot;}
Strategy --&gt; |merge| MergeProfiles[&quot;mergeProfiles(local, incoming)&quot;]
MergeProfiles --&gt; ProjectFlat[&quot;重投影扁平键(apiBase/apiKey/modelName/customModels)&quot;]
Strategy --&gt; |replace| EncodeSecrets[&quot;_encodeConfigSecrets(config)&quot;]
ProjectFlat --&gt; Persist[&quot;chrome.storage.local.set(config)&quot;]
EncodeSecrets --&gt; Persist
Persist --&gt; EnsureProfiles[&quot;ensureProfilesMigrated()&quot;]
EnsureProfiles --&gt; ValidateActive[&quot;确保 activeProfileId 有效&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/options/config-io.js#L293-L360" target="_blank" rel="noreferrer">src/options/config-io.js#L293-L360</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/model-profiles.js#L366-L399" target="_blank" rel="noreferrer">src/shared/model-profiles.js#L366-L399</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/options/config-io.js#L293-L360" target="_blank" rel="noreferrer">src/options/config-io.js#L293-L360</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/model-profiles.js#L366-L399" target="_blank" rel="noreferrer">src/shared/model-profiles.js#L366-L399</a></li></ul><h2 id="依赖关系分析" tabindex="-1">依赖关系分析 <a class="header-anchor" href="#依赖关系分析" aria-label="Permalink to &quot;依赖关系分析&quot;">​</a></h2><ul><li>db.js 是底层依赖，被 session-store.js、token-store.js 直接引用。</li><li>session-store.js 依赖 side_panel/state.js 与 i18n，同时与 chrome.storage.local 交互（scrollPosition、全局模型配置）。</li><li>token-store.js 仅依赖 db.js 的 getDB/withStore。</li><li>background/react-loop.js 依赖 db.js 的 ReAct checkpoint 接口，并在写入后进行读回验证。</li></ul><pre class="mermaid">graph LR
RL[&quot;background/react-loop.js&quot;] --&gt; DB[&quot;storage/db.js&quot;]
SS[&quot;storage/session-store.js&quot;] --&gt; DB
TS[&quot;storage/token-store.js&quot;] --&gt; DB
SS --&gt; STATE[&quot;side_panel/state.js&quot;]
SS --&gt; CS[&quot;chrome.storage.local&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L543-L570" target="_blank" rel="noreferrer">src/background/react-loop.js#L543-L570</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L5-L8" target="_blank" rel="noreferrer">src/storage/session-store.js#L5-L8</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L3-L4" target="_blank" rel="noreferrer">src/storage/token-store.js#L3-L4</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L543-L570" target="_blank" rel="noreferrer">src/background/react-loop.js#L543-L570</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L5-L8" target="_blank" rel="noreferrer">src/storage/session-store.js#L5-L8</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L3-L4" target="_blank" rel="noreferrer">src/storage/token-store.js#L3-L4</a></li></ul><h2 id="性能与一致性" tabindex="-1">性能与一致性 <a class="header-anchor" href="#性能与一致性" aria-label="Permalink to &quot;性能与一致性&quot;">​</a></h2><ul><li>连接与事务 <ul><li>单例连接减少重复打开开销；onversionchange 主动关闭连接避免阻塞升级。</li><li>withStore 在 error/abort 时自动重试一次，提升 Service Worker 重启后的鲁棒性。</li></ul></li><li>查询优化 <ul><li>token-stats 使用 sessionId 索引与 KeyRange 缩小扫描范围；daily/range 聚合使用 timestamp 索引。</li><li>searchActiveSessionsMessages 在指定 sessionId 时使用 O(1) 主键查询，避免全量加载。</li></ul></li><li>双写与降级 <ul><li>ReAct checkpoint 先写 chrome.storage.local 再写 IndexedDB，确保即使 IndexedDB 不可用也不丢数据；读取时优先 IndexedDB，失败降级到 chrome.storage.local。</li></ul></li><li>一致性保证 <ul><li>withStore 仅在 tx.oncomplete 后 resolve，确保事务提交后再返回结果。</li><li>React loop 在 persistCheckpoint 后读回验证，发现空结果记录告警。</li></ul></li><li>存储空间管理 <ul><li>归档会话最多保留 20 条，超出截断。</li><li>ReAct checkpoint 提供 TTL 清理（7 天），应在 Service Worker 启动时调用。</li><li>迁移完成后清理 chrome.storage.local 的大数据 key，释放空间。</li></ul></li></ul><p>[本节为通用指导，无需具体文件分析]</p><h2 id="故障排查指南" tabindex="-1">故障排查指南 <a class="header-anchor" href="#故障排查指南" aria-label="Permalink to &quot;故障排查指南&quot;">​</a></h2><ul><li>IndexedDB 升级被阻塞 <ul><li>现象：reactCheckpoints store 无法创建，checkpoint 写入静默失败。</li><li>原因：其他连接持有旧版本未关闭。</li><li>处理：db.js 已在 onversionchange 中主动关闭当前连接并重置缓存；确保调用方在升级后重试 getDB。</li></ul></li><li>Store 不存在 <ul><li>现象：withStore 报错 store 不存在。</li><li>处理：withStore 检测到 store 不存在时会关闭连接并延迟重试一次；若仍失败则抛出明确错误。</li></ul></li><li>Service Worker 重启后连接失效 <ul><li>现象：transaction() 抛出同步异常。</li><li>处理：withStore 捕获异常后 resetDBConnection 并重试一次。</li></ul></li><li>Checkpoint 写入成功但读回为空 <ul><li>现象：persistCheckpoint 返回 true，但 getReactCheckpoint 返回 null。</li><li>处理：background/react-loop.js 在读回验证失败时记录错误日志，提示可能是 store 不存在或事务未提交。</li></ul></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L97-L121" target="_blank" rel="noreferrer">src/storage/db.js#L97-L121</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L160-L182" target="_blank" rel="noreferrer">src/storage/db.js#L160-L182</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L184-L252" target="_blank" rel="noreferrer">src/storage/db.js#L184-L252</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/react-loop.js#L543-L570" target="_blank" rel="noreferrer">src/background/react-loop.js#L543-L570</a></li></ul><h2 id="结论" tabindex="-1">结论 <a class="header-anchor" href="#结论" aria-label="Permalink to &quot;结论&quot;">​</a></h2><p>数据存储层通过 IndexedDB 封装层提供了可靠的连接管理、事务处理、版本升级与 store 缺失恢复能力；会话存储适配器实现了完整的会话生命周期管理与状态同步；ReAct checkpoint 的双写策略确保了高可用性与数据不丢失；Token 统计存储提供了高效的索引优化与多维聚合；配置管理系统支持灵活的导入策略、默认值合并与版本迁移。整体设计兼顾性能、一致性与可维护性，适合在 Chrome 扩展 MV3 环境下稳定运行。</p><p>[本节为总结，无需具体文件分析]</p><h2 id="附录-数据模型与操作示例" tabindex="-1">附录：数据模型与操作示例 <a class="header-anchor" href="#附录-数据模型与操作示例" aria-label="Permalink to &quot;附录：数据模型与操作示例&quot;">​</a></h2><h3 id="数据模型概览" tabindex="-1">数据模型概览 <a class="header-anchor" href="#数据模型概览" aria-label="Permalink to &quot;数据模型概览&quot;">​</a></h3><ul><li>sessions：活跃会话，keyPath=id，索引 updatedAt。</li><li>activeSession：单条记录 key=active，存储当前活跃会话 ID。</li><li>archivedSessions：归档会话，keyPath=id，索引 createdAt。</li><li>uiPrototypes：UI 原型，keyPath=id，索引 createdAt/sessionId。</li><li>tokenStats：Token 统计，keyPath=id，索引 sessionId/timestamp。</li><li>reactCheckpoints：ReAct checkpoint，keyPath=sessionId，索引 updatedAt。</li><li>bookmarks：消息收藏，keyPath=id，索引 sessionId/createdAt。</li><li>scheduledTasks：定时任务，keyPath=id，索引 nextRunAt/enabled。</li></ul><pre class="mermaid">erDiagram
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
number scrollPosition
string createdAt
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
string name
string cron
number nextRunAt
boolean enabled
}
SESSIONS ||--o{ BOOKMARKS : &quot;messages referenced by&quot;
TOKEN_STATS ||--|| SESSIONS : &quot;by sessionId&quot;
REACT_CHECKPOINTS ||--|| SESSIONS : &quot;by sessionId&quot;
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L39-L92" target="_blank" rel="noreferrer">src/storage/db.js#L39-L92</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L604-L624" target="_blank" rel="noreferrer">src/storage/db.js#L604-L624</a></li></ul><h3 id="常见操作示例-路径引用" tabindex="-1">常见操作示例（路径引用） <a class="header-anchor" href="#常见操作示例-路径引用" aria-label="Permalink to &quot;常见操作示例（路径引用）&quot;">​</a></h3><ul><li>CRUD 操作 <ul><li>获取所有活跃会话：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L259-L265" target="_blank" rel="noreferrer">src/storage/db.js#L259-L265</a></li><li>获取单个会话：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L270-L276" target="_blank" rel="noreferrer">src/storage/db.js#L270-L276</a></li><li>保存/更新会话：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L306-L312" target="_blank" rel="noreferrer">src/storage/db.js#L306-L312</a></li><li>删除会话：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L317-L323" target="_blank" rel="noreferrer">src/storage/db.js#L317-L323</a></li><li>批量保存会话：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L328-L338" target="_blank" rel="noreferrer">src/storage/db.js#L328-L338</a></li></ul></li><li>批量处理 <ul><li>归档会话截断与批量写入：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L402-L418" target="_blank" rel="noreferrer">src/storage/db.js#L402-L418</a></li><li>会话重排序批量更新：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L460-L475" target="_blank" rel="noreferrer">src/storage/session-store.js#L460-L475</a></li></ul></li><li>查询优化 <ul><li>指定 sessionId 的 O(1) 搜索：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L486-L520" target="_blank" rel="noreferrer">src/storage/db.js#L486-L520</a></li><li>Token 统计按 sessionId 索引 + KeyRange：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L52-L98" target="_blank" rel="noreferrer">src/storage/token-store.js#L52-L98</a></li><li>按时间范围聚合：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/token-store.js#L233-L277" target="_blank" rel="noreferrer">src/storage/token-store.js#L233-L277</a></li></ul></li><li>数据备份恢复 <ul><li>从 chrome.storage.local 迁移到 IndexedDB：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/db.js#L554-L587" target="_blank" rel="noreferrer">src/storage/db.js#L554-L587</a></li><li>导入会话并自动切换：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L215-L259" target="_blank" rel="noreferrer">src/storage/session-store.js#L215-L259</a></li><li>归档/恢复会话：<a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L480-L524" target="_blank" rel="noreferrer">src/storage/session-store.js#L480-L524</a>, <a href="https://github.com/xiweicheng/ai-helper/blob/main/src/storage/session-store.js#L529-L564" target="_blank" rel="noreferrer">src/storage/session-store.js#L529-L564</a></li></ul></li></ul><p>[本节为示例路径引用，不包含具体代码内容]</p>`,80)])])}const d=r(i,[["render",a]]);export{u as __pageData,d as default};
