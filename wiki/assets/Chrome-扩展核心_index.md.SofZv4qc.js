import{_ as r,o as t,c as i,a3 as n}from"./chunks/framework.DBpCFmh2.js";const b=JSON.parse('{"title":"Chrome 扩展核心","description":"本文件面向 Chrome 扩展（Manifest V3）与本地 Agent 双进程架构，聚焦以下目标：。","frontmatter":{"title":"Chrome 扩展核心","description":"本文件面向 Chrome 扩展（Manifest V3）与本地 Agent 双进程架构，聚焦以下目标：。"},"headers":[],"relativePath":"Chrome-扩展核心/index.md","filePath":"Chrome-扩展核心/index.md","lastUpdated":null}'),l={name:"Chrome-扩展核心/index.md"};function a(o,e,s,c,g,h){return t(),i("div",null,[...e[0]||(e[0]=[n(`<h1 id="chrome-扩展核心" tabindex="-1">Chrome 扩展核心 <a class="header-anchor" href="#chrome-扩展核心" aria-label="Permalink to &quot;Chrome 扩展核心&quot;">​</a></h1><details class="details custom-block"><summary>本文引用的源码文件</summary><p><strong>本文引用的文件</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json" target="_blank" rel="noreferrer">manifest.json</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js" target="_blank" rel="noreferrer">src/background/index.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/index.js" target="_blank" rel="noreferrer">src/side_panel/index.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/chat-manager.js" target="_blank" rel="noreferrer">src/side_panel/chat-manager.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js" target="_blank" rel="noreferrer">src/content/index.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.html" target="_blank" rel="noreferrer">src/offscreen/offscreen.html</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.js" target="_blank" rel="noreferrer">src/offscreen/offscreen.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/tool-executor.js" target="_blank" rel="noreferrer">src/background/tool-executor.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js" target="_blank" rel="noreferrer">src/background/local-agent-client.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/logger.js" target="_blank" rel="noreferrer">src/shared/logger.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/i18n.js" target="_blank" rel="noreferrer">src/shared/i18n.js</a></li></ul></details><h2 id="目录" tabindex="-1">目录 <a class="header-anchor" href="#目录" aria-label="Permalink to &quot;目录&quot;">​</a></h2><ol><li><a href="#引言">引言</a></li><li><a href="#项目结构">项目结构</a></li><li><a href="#核心组件">核心组件</a></li><li><a href="#架构总览">架构总览</a></li><li><a href="#详细组件分析">详细组件分析</a></li><li><a href="#依赖关系分析">依赖关系分析</a></li><li><a href="#性能与内存优化">性能与内存优化</a></li><li><a href="#故障排查指南">故障排查指南</a></li><li><a href="#结论">结论</a></li></ol><h2 id="引言" tabindex="-1">引言 <a class="header-anchor" href="#引言" aria-label="Permalink to &quot;引言&quot;">​</a></h2><p>本文件面向 Chrome 扩展（Manifest V3）与本地 Agent 双进程架构，聚焦以下目标：</p><ul><li>Service Worker 生命周期、保活机制、事件监听与消息路由。</li><li>Side Panel 界面架构、聊天管理、工具面板集成与用户交互流程。</li><li>Content Scripts 注入机制、页面访问权限、消息路由表与异步工具处理。</li><li>Offscreen Document 的作用与剪贴板兼容层实现。</li><li>MV3 最佳实践、跨上下文通信示例、常见陷阱与解决方案。</li></ul><p>本项目为双进程架构：Chrome 扩展端（Manifest V3，src/ 目录，版本 2.3.1）+ 独立本地代理端 Agent（Node.js，agent/src/server.js 入口，npm 包名 ai-helper-agent，版本 2.3.1）。两端版本号始终保持同步；扩展端通过本地 HTTP/WebSocket 调用 Agent 的文件读写、命令执行、长期记忆与 RAG 能力。Agent 源码修改后必须重启进程新接口才生效。</p><h2 id="项目结构" tabindex="-1">项目结构 <a class="header-anchor" href="#项目结构" aria-label="Permalink to &quot;项目结构&quot;">​</a></h2><p>扩展采用 MV3 Service Worker 作为 background，Side Panel 作为主 UI，Content Scripts 注入到网页，Offscreen Document 提供剪贴板兼容能力。关键入口如下：</p><ul><li>manifest.json：声明 MV3、Service Worker、Side Panel、Content Scripts、权限与快捷键。</li><li>src/background/index.js：Service Worker 入口，负责保活、侧边栏控制、消息路由、ReAct 循环调度、通知与自动恢复。</li><li>src/side_panel/index.js：Side Panel 入口，聚合聊天、工具面板、工作区、书签、技能选择等模块。</li><li>src/side_panel/chat-manager.js：聊天会话、流式输出、执行日志、任务恢复、上下文压缩等核心逻辑。</li><li>src/content/index.js：Content Script 入口，统一消息路由表与异步工具处理。</li><li>src/offscreen/offscreen.html + offscreen.js：Offscreen 文档与剪贴板兼容层。</li><li>src/background/tool-executor.js：工具定义、执行、MCP/RAG/Skill 加载与执行编排。</li><li>src/background/local-agent-client.js：与本地 Agent 的 HTTP/WebSocket 客户端封装。</li><li>src/shared/logger.js 与 src/shared/i18n.js：通用日志与国际化基础设施。</li></ul><pre class="mermaid">graph TB
A[&quot;manifest.json&lt;br/&gt;MV3 清单&quot;] --&gt; B[&quot;background/index.js&lt;br/&gt;Service Worker 入口&quot;]
A --&gt; C[&quot;side_panel/index.js&lt;br/&gt;侧边栏入口&quot;]
A --&gt; D[&quot;content/index.js&lt;br/&gt;内容脚本入口&quot;]
A --&gt; E[&quot;offscreen/offscreen.html&lt;br/&gt;Offscreen 文档&quot;]
B --&gt; F[&quot;tool-executor.js&lt;br/&gt;工具执行与 MCP/RAG&quot;]
B --&gt; G[&quot;local-agent-client.js&lt;br/&gt;本地 Agent 客户端&quot;]
C --&gt; H[&quot;chat-manager.js&lt;br/&gt;聊天与会话管理&quot;]
I[&quot;shared/logger.js&lt;br/&gt;日志&quot;] -.-&gt; B
I -.-&gt; C
I -.-&gt; D
J[&quot;shared/i18n.js&lt;br/&gt;国际化&quot;] -.-&gt; B
J -.-&gt; C
J -.-&gt; D
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json#L1-L76" target="_blank" rel="noreferrer">manifest.json#L1-L76</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L1-L120" target="_blank" rel="noreferrer">src/background/index.js#L1-L120</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/index.js#L1-L60" target="_blank" rel="noreferrer">src/side_panel/index.js#L1-L60</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L1-L40" target="_blank" rel="noreferrer">src/content/index.js#L1-L40</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.html#L1-L12" target="_blank" rel="noreferrer">src/offscreen/offscreen.html#L1-L12</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/tool-executor.js#L1-L25" target="_blank" rel="noreferrer">src/background/tool-executor.js#L1-L25</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L1-L40" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L1-L40</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/chat-manager.js#L1-L50" target="_blank" rel="noreferrer">src/side_panel/chat-manager.js#L1-L50</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/logger.js#L1-L51" target="_blank" rel="noreferrer">src/shared/logger.js#L1-L51</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/i18n.js#L1-L40" target="_blank" rel="noreferrer">src/shared/i18n.js#L1-L40</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json#L1-L76" target="_blank" rel="noreferrer">manifest.json#L1-L76</a></li></ul><h2 id="核心组件" tabindex="-1">核心组件 <a class="header-anchor" href="#核心组件" aria-label="Permalink to &quot;核心组件&quot;">​</a></h2><ul><li>Service Worker（background/index.js） <ul><li>保活：通过 keepalive port 与 Side Panel 长连接，防止 SW 空闲被终止。</li><li>侧边栏控制：open/close/toggle，支持全局模式与 tab-specific 模式，窗口分组整理。</li><li>消息路由：集中分发 CALL_API、RESUME_REACT、GET_MCP_TOOLS、RAG_*、截图等消息。</li><li>ReAct 循环：reactLoop/callApiNonStream，工具预筛选、子任务计划、流式输出。</li><li>自动恢复：基于 checkpoint 的闹钟唤醒与续跑，耗尽时通知人工介入。</li><li>通知与可见性：按发起实例身份判定面板是否可见，避免误弹或漏弹。</li></ul></li><li>Side Panel（side_panel/index.js + chat-manager.js） <ul><li>配置与主题：i18n、主题 Token、模型选择、温度/TopP 设置。</li><li>聊天管理：会话持久化、流式渲染、执行日志、反思评估、导出导入。</li><li>工具面板：内置工具、MCP、Skill、RAG 工具展示与开关。</li><li>工作区与书签：工作区文件、书签管理、搜索、跳转。</li><li>交互流程：发送消息、划词问答、截图、引用知识库、技能注入。</li></ul></li><li>Content Scripts（content/index.js） <ul><li>消息路由表：HANDLERS Map，O(1) 查找，分类页面读取、交互、提取、媒体、异步工具。</li><li>异步处理：ASYNC_HANDLERS Set 标记需保持通道开放的异步工具。</li><li>顶层帧限制：TOP_FRAME_ONLY_TYPES 避免 iframe 响应覆盖。</li><li>区域截图：在页面上创建遮罩层与选择框，返回矩形坐标。</li></ul></li><li>Offscreen Document（offscreen.html + offscreen.js） <ul><li>剪贴板兼容：优先 navigator.clipboard，失败回退 execCommand copy/paste。</li><li>i18n 文案：复制成功/失败、粘贴失败的提示。</li></ul></li><li>工具执行与 Agent 客户端（tool-executor.js + local-agent-client.js） <ul><li>工具定义与执行：内置工具、MCP、RAG、Skill、快照编排、截图下载。</li><li>Agent 客户端：配对、健康检查、HTTP/WebSocket 请求、可达性缓存、多代理切换。</li></ul></li><li>共享基础设施（logger.js + i18n.js） <ul><li>日志：DEBUG/INFO/WARN/ERROR 分级输出。</li><li>国际化：t(key, params)、语言检测、订阅刷新、注册翻译字典。</li></ul></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L1-L120" target="_blank" rel="noreferrer">src/background/index.js#L1-L120</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/index.js#L1-L60" target="_blank" rel="noreferrer">src/side_panel/index.js#L1-L60</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/chat-manager.js#L1-L50" target="_blank" rel="noreferrer">src/side_panel/chat-manager.js#L1-L50</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L1-L40" target="_blank" rel="noreferrer">src/content/index.js#L1-L40</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.html#L1-L12" target="_blank" rel="noreferrer">src/offscreen/offscreen.html#L1-L12</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.js#L1-L68" target="_blank" rel="noreferrer">src/offscreen/offscreen.js#L1-L68</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/tool-executor.js#L1-L25" target="_blank" rel="noreferrer">src/background/tool-executor.js#L1-L25</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L1-L40" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L1-L40</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/logger.js#L1-L51" target="_blank" rel="noreferrer">src/shared/logger.js#L1-L51</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/i18n.js#L1-L40" target="_blank" rel="noreferrer">src/shared/i18n.js#L1-L40</a></li></ul><h2 id="架构总览" tabindex="-1">架构总览 <a class="header-anchor" href="#架构总览" aria-label="Permalink to &quot;架构总览&quot;">​</a></h2><p>扩展端与 Agent 端的通信契约是架构核心：扩展端经本地 HTTP/WebSocket 端点调用 Agent 的文件读写、命令执行、长期记忆与 RAG 能力。Service Worker 作为中央调度器，协调 Side Panel、Content Scripts、Offscreen Document 与 Agent 客户端。</p><pre class="mermaid">sequenceDiagram
participant SP as &quot;Side Panel&quot;
participant BG as &quot;Background (Service Worker)&quot;
participant CS as &quot;Content Script&quot;
participant OD as &quot;Offscreen Document&quot;
participant AG as &quot;Local Agent Client&quot;
participant AGT as &quot;Agent 服务&quot;
SP-&gt;&gt;BG : &quot;CALL_API / RESUME_REACT / GET_MCP_TOOLS / RAG_*&quot;
BG-&gt;&gt;AG : &quot;HTTP/WebSocket 请求配对、文件、命令、MCP、RAG&quot;
AG-&gt;&gt;AGT : &quot;调用 Agent API&quot;
AGT--&gt;&gt;AG : &quot;返回结果&quot;
AG--&gt;&gt;BG : &quot;结果/错误&quot;
BG--&gt;&gt;SP : &quot;API_COMPLETE / STREAM_* / API_ERROR&quot;
CS-&gt;&gt;BG : &quot;CAPTURE_TAB_FROM_PAGE / CAPTURE_REGION_FROM_PAGE&quot;
BG-&gt;&gt;CS : &quot;START_REGION_SELECTION&quot;
CS--&gt;&gt;BG : &quot;矩形坐标&quot;
BG-&gt;&gt;OD : &quot;COPY_TO_CLIPBOARD / PASTE_FROM_CLIPBOARD&quot;
OD--&gt;&gt;BG : &quot;剪贴板操作结果&quot;
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L882-L1527" target="_blank" rel="noreferrer">src/background/index.js#L882-L1527</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L40-L94" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L40-L94</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L195-L247" target="_blank" rel="noreferrer">src/content/index.js#L195-L247</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.js#L18-L67" target="_blank" rel="noreferrer">src/offscreen/offscreen.js#L18-L67</a></li></ul><h2 id="详细组件分析" tabindex="-1">详细组件分析 <a class="header-anchor" href="#详细组件分析" aria-label="Permalink to &quot;详细组件分析&quot;">​</a></h2><h3 id="service-worker-生命周期与保活机制" tabindex="-1">Service Worker 生命周期与保活机制 <a class="header-anchor" href="#service-worker-生命周期与保活机制" aria-label="Permalink to &quot;Service Worker 生命周期与保活机制&quot;">​</a></h3><ul><li>保活端口：Side Panel 通过 chrome.runtime.connect 建立 keepalive port，SW 维护端口映射，重连时检测 SW 重启并通知前端。</li><li>自动恢复：chrome.alarms 定时触发 auto-resume，扫描 checkpoint 并恢复 ReAct 循环，耗尽时通知人工介入。</li><li>侧边栏状态镜像：_openPanelsByWindow、_activeTabByWindow、_lastFocusedWindowId 同步维护面板打开状态与活跃 tab，确保快捷键 toggle 在用户手势栈内完成。</li><li>作用域模式：global 与 tab-specific 两种模式，tab-specific 模式下对显式打开的 tab 做 per-tab 启用，并可选将 tab 归入 AI Helper 分组。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;SW 启动&quot;]) --&gt; InitI18n[&quot;初始化国际化&quot;]
InitI18n --&gt; RehydrateAlarms[&quot;重建定时任务闹钟&quot;]
RehydrateAlarms --&gt; AutoResume[&quot;注册自动恢复处理器&quot;]
AutoResume --&gt; CleanupCheckpoints[&quot;清理过期 checkpoint&quot;]
CleanupCheckpoints --&gt; KeepalivePorts[&quot;注册 keepalive 端口监听&quot;]
KeepalivePorts --&gt; SidePanelControl[&quot;侧边栏控制与状态镜像&quot;]
SidePanelControl --&gt; MessageRouter[&quot;消息路由表&quot;]
MessageRouter --&gt; End([&quot;就绪&quot;])
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L1-L120" target="_blank" rel="noreferrer">src/background/index.js#L1-L120</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L56-L95" target="_blank" rel="noreferrer">src/background/index.js#L56-L95</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L140-L218" target="_blank" rel="noreferrer">src/background/index.js#L140-L218</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L220-L337" target="_blank" rel="noreferrer">src/background/index.js#L220-L337</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L1-L120" target="_blank" rel="noreferrer">src/background/index.js#L1-L120</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L56-L95" target="_blank" rel="noreferrer">src/background/index.js#L56-L95</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L140-L218" target="_blank" rel="noreferrer">src/background/index.js#L140-L218</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L220-L337" target="_blank" rel="noreferrer">src/background/index.js#L220-L337</a></li></ul><h3 id="side-panel-界面架构与聊天管理" tabindex="-1">Side Panel 界面架构与聊天管理 <a class="header-anchor" href="#side-panel-界面架构与聊天管理" aria-label="Permalink to &quot;Side Panel 界面架构与聊天管理&quot;">​</a></h3><ul><li>入口聚合：side_panel/index.js 引入主题、状态、常量、工具函数、聊天管理、工具面板、工作区、书签、技能选择等模块。</li><li>聊天管理：chat-manager.js 负责会话持久化、流式输出、执行日志、反思评估、任务恢复、上下文压缩、图片预览、文件提取等。</li><li>用户交互：发送消息、划词问答、截图、引用知识库、技能注入、模型选择、温度/TopP 设置。</li><li>配置监听：storage.onChanged 监听自动压缩、摘要存入记忆、记忆限制等配置变更，实时更新 UI。</li></ul><pre class="mermaid">classDiagram
class ChatManager {
+sendMessage()
+clearChatHistory()
+showExportDialog()
+hideExportDialog()
+performExport()
+initExportDialogEvents()
+triggerImportDialog()
+handleImportFile()
+showModal()
+hideModal()
+loadChatHistory()
+saveChatHistory()
+addMessage()
+addContextBubble()
+addLoadingMessage()
+removeLoadingMessage()
+callApi()
+clearSelectedContext()
+triggerSelectionSearch()
+fillSidePanelInput()
+directSend()
+restorePendingSessionsFromStorage()
+restoreMessageFromHtml()
+bindExecutionLogDelegate()
+bindReflectionBadgeDelegate()
+rebindAllMessages()
+editAndResendMessage()
+compressAndAttachImage()
+openImagePreview()
+initImagePreviewOverlay()
+cancelStreamingTask()
+reconnectStreamingElement()
+_checkForAbandonedCheckpoint()
+setMessageTimestampVisible()
}
class State {
+chatConfig
+currentModel
+selectedContextText
+quotedContextText
+pendingCallApiSessionIds
}
class ToolPanel {
+openToolsPopup()
+closeToolsPopup()
+renderToolsPopupList()
+getVisibleTools()
+updateAllCategoryCounts()
+updateCategoryBadges()
+updateToolsPopupTitle()
+saveToolsFromPopup()
+updateToolsToggleState()
+updateToolsConfigIndicators()
+setVisibleMcpServicesOpen()
+refreshToolPopupIfOpen()
+applyRagToolIntroduction()
+getValidToolIdUniverse()
}
ChatManager --&gt; State : &quot;使用&quot;
ChatManager --&gt; ToolPanel : &quot;集成&quot;
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/chat-manager.js#L1-L80" target="_blank" rel="noreferrer">src/side_panel/chat-manager.js#L1-L80</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/index.js#L1-L60" target="_blank" rel="noreferrer">src/side_panel/index.js#L1-L60</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/index.js#L1-L60" target="_blank" rel="noreferrer">src/side_panel/index.js#L1-L60</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/chat-manager.js#L1-L80" target="_blank" rel="noreferrer">src/side_panel/chat-manager.js#L1-L80</a></li></ul><h3 id="content-scripts-注入机制与消息路由" tabindex="-1">Content Scripts 注入机制与消息路由 <a class="header-anchor" href="#content-scripts-注入机制与消息路由" aria-label="Permalink to &quot;Content Scripts 注入机制与消息路由&quot;">​</a></h3><ul><li>注入方式：manifest.json 声明 content_scripts，匹配所有 URL，注入 qrcode/marked 库与 index.js，CSS 样式全局注入。</li><li>消息路由表：HANDLERS Map 按 message.type 分发，分类页面读取、交互、提取、媒体、异步工具。</li><li>异步处理：ASYNC_HANDLERS Set 标记需 return true 保持通道开放的工具，Promise.resolve(result).then(sendResponse)。</li><li>顶层帧限制：TOP_FRAME_ONLY_TYPES 避免 iframe 响应覆盖主页面内容。</li><li>区域截图：startRegionSelection 创建遮罩层与选择框，返回矩形坐标。</li></ul><pre class="mermaid">flowchart TD
Load[&quot;Content Script 加载&quot;] --&gt; RegisterHandlers[&quot;注册 HANDLERS Map&quot;]
RegisterHandlers --&gt; OnMessage[&quot;chrome.runtime.onMessage.addListener&quot;]
OnMessage --&gt; CheckTopFrame{&quot;顶层帧？&quot;}
CheckTopFrame --&gt; |否| Skip[&quot;跳过 TOP_FRAME_ONLY_TYPES&quot;]
CheckTopFrame --&gt; |是| FindHandler[&quot;查找 handler&quot;]
FindHandler --&gt; IsAsync{&quot;异步工具？&quot;}
IsAsync --&gt; |是| AsyncFlow[&quot;Promise.then(sendResponse)&quot;]
IsAsync --&gt; |否| SyncFlow[&quot;sendResponse(result)&quot;]
AsyncFlow --&gt; End([&quot;结束&quot;])
SyncFlow --&gt; End
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L74-L193" target="_blank" rel="noreferrer">src/content/index.js#L74-L193</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L209-L247" target="_blank" rel="noreferrer">src/content/index.js#L209-L247</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json#L36-L46" target="_blank" rel="noreferrer">manifest.json#L36-L46</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L74-L193" target="_blank" rel="noreferrer">src/content/index.js#L74-L193</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L209-L247" target="_blank" rel="noreferrer">src/content/index.js#L209-L247</a></li></ul><h3 id="offscreen-document-与剪贴板兼容层" tabindex="-1">Offscreen Document 与剪贴板兼容层 <a class="header-anchor" href="#offscreen-document-与剪贴板兼容层" aria-label="Permalink to &quot;Offscreen Document 与剪贴板兼容层&quot;">​</a></h3><ul><li>作用：提供浏览器剪贴板 API 的兼容层，优先使用 navigator.clipboard，失败回退到 execCommand copy/paste。</li><li>实现：offscreen.js 监听 COPY_TO_CLIPBOARD 与 PASTE_FROM_CLIPBOARD 消息，返回成功/失败结果与 i18n 文案。</li><li>HTML 结构：offscreen.html 包含隐藏 textarea 用于兼容剪贴板操作。</li></ul><pre class="mermaid">sequenceDiagram
participant BG as &quot;Background&quot;
participant OD as &quot;Offscreen Document&quot;
BG-&gt;&gt;OD : &quot;COPY_TO_CLIPBOARD / PASTE_FROM_CLIPBOARD&quot;
OD-&gt;&gt;OD : &quot;navigator.clipboard.writeText/readText&quot;
OD-&gt;&gt;OD : &quot;execCommand(&#39;copy&#39;/&#39;paste&#39;) 回退&quot;
OD--&gt;&gt;BG : &quot;{success, message/text/error}&quot;
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.js#L18-L67" target="_blank" rel="noreferrer">src/offscreen/offscreen.js#L18-L67</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.html#L7-L9" target="_blank" rel="noreferrer">src/offscreen/offscreen.html#L7-L9</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.js#L1-L68" target="_blank" rel="noreferrer">src/offscreen/offscreen.js#L1-L68</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.html#L1-L12" target="_blank" rel="noreferrer">src/offscreen/offscreen.html#L1-L12</a></li></ul><h3 id="工具执行与-agent-客户端" tabindex="-1">工具执行与 Agent 客户端 <a class="header-anchor" href="#工具执行与-agent-客户端" aria-label="Permalink to &quot;工具执行与 Agent 客户端&quot;">​</a></h3><ul><li>工具执行：tool-executor.js 定义内置工具、MCP、RAG、Skill、快照编排、截图下载等，支持并行、确认、超时、审计日志。</li><li>Agent 客户端：local-agent-client.js 封装 HTTP/WebSocket 请求，支持配对、健康检查、可达性缓存、多代理切换、文件上传、Skill Prompt 获取。</li><li>消息路由：background/index.js 中 GET_MCP_TOOLS、RELOAD_MCP_TOOLS、RAG_LIST_COLLECTIONS、RAG_SEARCH 等消息转发至 Agent 客户端。</li></ul><pre class="mermaid">graph TB
BG[&quot;Background 消息路由&quot;] --&gt; TE[&quot;tool-executor.js&quot;]
TE --&gt; LC[&quot;local-agent-client.js&quot;]
LC --&gt; AG[&quot;Agent 服务&quot;]
BG --&gt; AG
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L1149-L1287" target="_blank" rel="noreferrer">src/background/index.js#L1149-L1287</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/tool-executor.js#L1-L25" target="_blank" rel="noreferrer">src/background/tool-executor.js#L1-L25</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L40-L94" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L40-L94</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/tool-executor.js#L1-L25" target="_blank" rel="noreferrer">src/background/tool-executor.js#L1-L25</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L40-L94" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L40-L94</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L1149-L1287" target="_blank" rel="noreferrer">src/background/index.js#L1149-L1287</a></li></ul><h2 id="依赖关系分析" tabindex="-1">依赖关系分析 <a class="header-anchor" href="#依赖关系分析" aria-label="Permalink to &quot;依赖关系分析&quot;">​</a></h2><ul><li>Service Worker 依赖： <ul><li>state.js：keepalive 端口管理、取消标志、最后操作 tab。</li><li>config.js：存储配置、聊天配置。</li><li>tool-executor.js：工具加载、MCP/RAG 工具、命令取消。</li><li>react-loop.js：ReAct 循环、非流式 API 调用。</li><li>scheduler.js：定时任务闹钟恢复。</li><li>detach-window.js：脱离窗口状态恢复。</li><li>notifier.js：通知与面板断开提醒。</li><li>panel-visibility.js：面板可见性判定。</li><li>local-agent-client.js：Agent 客户端。</li><li>db.js：checkpoint 存取。</li><li>auto-resume.js：自动恢复策略。</li><li>context-compactor.js / compaction-memory.js：上下文压缩与记忆沉淀。</li><li>logger.js / i18n.js：日志与国际化。</li></ul></li><li>Side Panel 依赖： <ul><li>theme.js：主题 Token。</li><li>state.js：侧边栏状态。</li><li>constants.js：内置工具、预设模式。</li><li>utils.js：工具函数、系统提示、API 参数。</li><li>token-counter.js：Token 计数与上下文窗口。</li><li>session-manager.js：会话持久化。</li><li>agent-manager.js：Agent 管理。</li><li>skill-selector.js：技能选择。</li><li>tool-panel.js：工具面板。</li><li>workspace-panel.js：工作区面板。</li><li>bookmark-manager.js：书签管理。</li><li>markdown-render.js：Markdown 渲染。</li><li>image-helpers.js：图片辅助。</li><li>chat-manager.js：聊天管理。</li><li>chat-streaming.js：流式输出。</li><li>chat-resume.js：任务恢复。</li><li>execution-log-render.js：执行日志渲染。</li><li>artifacts-manager.js：产物管理。</li><li>page-selector.js：页面选择。</li><li>agent-at-selector.js：知识库选择。</li><li>panel-context.js：面板上下文。</li><li>logger.js / i18n.js：日志与国际化。</li></ul></li><li>Content Scripts 依赖： <ul><li>page-tools.js：页面文本、HTML、选区、剪贴板、高亮。</li><li>page-interaction.js：元素查询、快照采集、滚动、交互。</li><li>page-extract.js：元数据、链接、表单、图片、搜索、iframe 内容。</li><li>interaction-tools.js：点击、填充、滚动、等待、键盘输入、文件上传、存储管理、下拉选择、文本点击。</li><li>advanced-tools.js：二维码生成、CSS 注入、完成度校验。</li><li>shadow-dom-utils.js：Shadow DOM 选区。</li><li>selection-toolbar.js：选中文本浮动工具栏。</li><li>i18n.js：国际化。</li></ul></li><li>Offscreen Document 依赖： <ul><li>i18n.js：国际化文案。</li></ul></li></ul><pre class="mermaid">graph TB
BG[&quot;background/index.js&quot;] --&gt; STATE[&quot;state.js&quot;]
BG --&gt; CONFIG[&quot;config.js&quot;]
BG --&gt; TOOL_EXEC[&quot;tool-executor.js&quot;]
BG --&gt; REACT_LOOP[&quot;react-loop.js&quot;]
BG --&gt; SCHEDULER[&quot;scheduler.js&quot;]
BG --&gt; DETACH[&quot;detach-window.js&quot;]
BG --&gt; NOTIFIER[&quot;notifier.js&quot;]
BG --&gt; PANEL_VIS[&quot;panel-visibility.js&quot;]
BG --&gt; AG_CLIENT[&quot;local-agent-client.js&quot;]
BG --&gt; DB[&quot;db.js&quot;]
BG --&gt; AUTO_RESUME[&quot;auto-resume.js&quot;]
BG --&gt; COMPACT_CTX[&quot;context-compactor.js&quot;]
BG --&gt; COMPACT_MEM[&quot;compaction-memory.js&quot;]
BG --&gt; LOGGER[&quot;logger.js&quot;]
BG --&gt; I18N[&quot;i18n.js&quot;]
SP[&quot;side_panel/index.js&quot;] --&gt; THEME[&quot;theme.js&quot;]
SP --&gt; SP_STATE[&quot;state.js&quot;]
SP --&gt; CONSTANTS[&quot;constants.js&quot;]
SP --&gt; UTILS[&quot;utils.js&quot;]
SP --&gt; TOKEN_COUNTER[&quot;token-counter.js&quot;]
SP --&gt; SESSION_MGR[&quot;session-manager.js&quot;]
SP --&gt; AGENT_MGR[&quot;agent-manager.js&quot;]
SP --&gt; SKILL_SEL[&quot;skill-selector.js&quot;]
SP --&gt; TOOL_PANEL[&quot;tool-panel.js&quot;]
SP --&gt; WORKSPACE[&quot;workspace-panel.js&quot;]
SP --&gt; BOOKMARK_MGR[&quot;bookmark-manager.js&quot;]
SP --&gt; MARKDOWN[&quot;markdown-render.js&quot;]
SP --&gt; IMAGE_HELP[&quot;image-helpers.js&quot;]
SP --&gt; CHAT_MGR[&quot;chat-manager.js&quot;]
SP --&gt; CHAT_STREAM[&quot;chat-streaming.js&quot;]
SP --&gt; CHAT_RESUME[&quot;chat-resume.js&quot;]
SP --&gt; EXEC_LOG[&quot;execution-log-render.js&quot;]
SP --&gt; ARTIFACTS[&quot;artifacts-manager.js&quot;]
SP --&gt; PAGE_SEL[&quot;page-selector.js&quot;]
SP --&gt; AGENT_AT[&quot;agent-at-selector.js&quot;]
SP --&gt; PANEL_CTX[&quot;panel-context.js&quot;]
SP --&gt; LOGGER
SP --&gt; I18N
CS[&quot;content/index.js&quot;] --&gt; PAGE_TOOLS[&quot;page-tools.js&quot;]
CS --&gt; PAGE_INTER[&quot;page-interaction.js&quot;]
CS --&gt; PAGE_EXTRACT[&quot;page-extract.js&quot;]
CS --&gt; INTER_TOOLS[&quot;interaction-tools.js&quot;]
CS --&gt; ADV_TOOLS[&quot;advanced-tools.js&quot;]
CS --&gt; SHADOW_DOM[&quot;shadow-dom-utils.js&quot;]
CS --&gt; SEL_TOOLBAR[&quot;selection-toolbar.js&quot;]
CS --&gt; I18N
OD[&quot;offscreen/offscreen.js&quot;] --&gt; I18N
</pre><p>图表来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L1-L20" target="_blank" rel="noreferrer">src/background/index.js#L1-L20</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/index.js#L1-L34" target="_blank" rel="noreferrer">src/side_panel/index.js#L1-L34</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L1-L34" target="_blank" rel="noreferrer">src/content/index.js#L1-L34</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.js#L1-L1" target="_blank" rel="noreferrer">src/offscreen/offscreen.js#L1-L1</a></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L1-L20" target="_blank" rel="noreferrer">src/background/index.js#L1-L20</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/side_panel/index.js#L1-L34" target="_blank" rel="noreferrer">src/side_panel/index.js#L1-L34</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L1-L34" target="_blank" rel="noreferrer">src/content/index.js#L1-L34</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.js#L1-L1" target="_blank" rel="noreferrer">src/offscreen/offscreen.js#L1-L1</a></li></ul><h2 id="性能与内存优化" tabindex="-1">性能与内存优化 <a class="header-anchor" href="#性能与内存优化" aria-label="Permalink to &quot;性能与内存优化&quot;">​</a></h2><ul><li>Service Worker 保活：keepalive port 防止 SW 空闲被终止，减少频繁重建成本。</li><li>消息截断：MAX_LOG_ENTRIES_FOR_MSG 限制 executionLog 大小，避免 64MiB 限制。</li><li>工具缓存：mcpToolsCache 与 skillPromptsCache 减少网络请求。</li><li>自动恢复：checkpoint 机制避免重复执行，子任务级 subtaskProgress 防重放。</li><li>侧边栏状态镜像：同步镜像避免异步查询破坏手势上下文，减少竞态。</li><li>内容脚本异步处理：ASYNC_HANDLERS Set 精确标记异步工具，避免不必要的通道保持。</li><li>Offscreen 剪贴板兼容：navigator.clipboard 优先，execCommand 回退，提升兼容性。</li><li>日志级别：logger.js 支持 DEBUG/INFO/WARN/ERROR 分级，便于调试与性能监控。</li><li>国际化：i18n.js 支持运行时语言切换与订阅刷新，避免硬编码文案。</li></ul><p>[本节为一般性指导，不直接分析具体文件]</p><h2 id="故障排查指南" tabindex="-1">故障排查指南 <a class="header-anchor" href="#故障排查指南" aria-label="Permalink to &quot;故障排查指南&quot;">​</a></h2><ul><li>Service Worker 终止恢复： <ul><li>现象：SW 被系统回收，API 调用中断。</li><li>排查：检查 keepalive port 是否重连，SW_RESTARTED 消息是否发送，checkpoint 是否存在。</li><li>解决：确保 Side Panel 保持连接，手动触发 RESUME_REACT 或等待自动恢复。</li></ul></li><li>侧边栏无法打开/关闭： <ul><li>现象：快捷键 toggle 无效，open/close 失败。</li><li>排查：检查 _openPanelsByWindow 镜像是否正确，手势上下文是否保留，Chrome 版本是否支持 sidePanel.close。</li><li>解决：确保在用户手势栈内调用 open/close，必要时回退到 window.close。</li></ul></li><li>消息路由失败： <ul><li>现象：Side Panel 发送 CALL_API 无响应。</li><li>排查：检查 background/index.js 消息路由表是否包含对应 type，sender.tab 是否存在。</li><li>解决：确保消息类型正确，异步消息返回 true 保持通道开放。</li></ul></li><li>Content Scripts 注入失败： <ul><li>现象：Content Script 未加载，消息路由表为空。</li><li>排查：检查 manifest.json content_scripts 配置，isExtensionValid() 是否返回 true。</li><li>解决：确保扩展已启用，URL 匹配规则正确。</li></ul></li><li>Offscreen 剪贴板操作失败： <ul><li>现象：COPY_TO_CLIPBOARD/PASTE_FROM_CLIPBOARD 返回失败。</li><li>排查：检查 navigator.clipboard 是否可用，execCommand 是否成功。</li><li>解决：确保 Offscreen Document 已创建，权限 clipboardRead/clipboardWrite 已授予。</li></ul></li><li>Agent 客户端连接失败： <ul><li>现象：GET_MCP_TOOLS/RAG_SEARCH 失败。</li><li>排查：检查 Agent 服务是否运行，配对是否成功，可达性缓存状态。</li><li>解决：重启 Agent 服务，重新配对，检查网络权限。</li></ul></li></ul><p>章节来源</p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L140-L218" target="_blank" rel="noreferrer">src/background/index.js#L140-L218</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/index.js#L882-L1527" target="_blank" rel="noreferrer">src/background/index.js#L882-L1527</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L209-L247" target="_blank" rel="noreferrer">src/content/index.js#L209-L247</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/offscreen/offscreen.js#L18-L67" target="_blank" rel="noreferrer">src/offscreen/offscreen.js#L18-L67</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L40-L94" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L40-L94</a></li></ul><h2 id="结论" tabindex="-1">结论 <a class="header-anchor" href="#结论" aria-label="Permalink to &quot;结论&quot;">​</a></h2><p>本 Chrome 扩展核心以 MV3 Service Worker 为中心，结合 Side Panel、Content Scripts 与 Offscreen Document，构建了完整的 AI 助手生态。Service Worker 负责保活、消息路由与 ReAct 循环调度；Side Panel 提供丰富的用户交互与聊天管理；Content Scripts 实现页面操作与信息提取；Offscreen Document 提供剪贴板兼容能力。通过工具执行与 Agent 客户端，扩展端与本地 Agent 紧密协作，实现文件读写、命令执行、长期记忆与 RAG 能力。遵循 MV3 最佳实践，注意 Service Worker 生命周期、跨上下文通信与内存管理，可有效避免常见陷阱，提升扩展稳定性与性能。</p><p>[本节为总结性内容，不直接分析具体文件]</p>`,78)])])}const p=r(l,[["render",a]]);export{b as __pageData,p as default};
