import{_ as t,o as r,c as a,a3 as l}from"./chunks/framework.BrO6lPIi.js";const d=JSON.parse('{"title":"安全架构设计","description":"本安全架构文档面向 AI Helper 的双进程体系：Chrome 扩展端（Manifest V3，版本 2.3.1）与独立本地 Agent 服务（Node.js，版本 2.3.1）。","frontmatter":{"title":"安全架构设计","description":"本安全架构文档面向 AI Helper 的双进程体系：Chrome 扩展端（Manifest V3，版本 2.3.1）与独立本地 Agent 服务（Node.js，版本 2.3.1）。"},"headers":[],"relativePath":"系统架构设计/安全架构设计/index.md","filePath":"系统架构设计/安全架构设计/index.md","lastUpdated":null}'),i={name:"系统架构设计/安全架构设计/index.md"};function o(n,e,s,g,c,h){return r(),a("div",null,[...e[0]||(e[0]=[l(`<h1 id="安全架构设计" tabindex="-1">安全架构设计 <a class="header-anchor" href="#安全架构设计" aria-label="Permalink to &quot;安全架构设计&quot;">​</a></h1><details class="details custom-block"><summary>本文引用的源码文件</summary><p><strong>本文引用的文件</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/README.md" target="_blank" rel="noreferrer">README.md</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json" target="_blank" rel="noreferrer">manifest.json</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js" target="_blank" rel="noreferrer">src/background/local-agent-client.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/secret.js" target="_blank" rel="noreferrer">src/shared/secret.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js" target="_blank" rel="noreferrer">agent/src/server.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/auth.js" target="_blank" rel="noreferrer">agent/src/auth.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js" target="_blank" rel="noreferrer">agent/src/security.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js" target="_blank" rel="noreferrer">agent/src/executor.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js" target="_blank" rel="noreferrer">agent/src/logger.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/memory/service.js" target="_blank" rel="noreferrer">agent/src/memory/service.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js" target="_blank" rel="noreferrer">src/content/advanced-tools.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_REPORT.md" target="_blank" rel="noreferrer">docs/AUDIT_REPORT.md</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_STATUS.md" target="_blank" rel="noreferrer">docs/AUDIT_STATUS.md</a></li></ul></details><h2 id="目录" tabindex="-1">目录 <a class="header-anchor" href="#目录" aria-label="Permalink to &quot;目录&quot;">​</a></h2><ol><li><a href="#引言">引言</a></li><li><a href="#项目结构与安全边界总览">项目结构与安全边界总览</a></li><li><a href="#核心安全组件">核心安全组件</a></li><li><a href="#系统架构与数据流">系统架构与数据流</a></li><li><a href="#详细组件分析">详细组件分析</a></li><li><a href="#依赖关系与耦合分析">依赖关系与耦合分析</a></li><li><a href="#性能与资源约束下的安全权衡">性能与资源约束下的安全权衡</a></li><li><a href="#威胁模型与攻击面评估">威胁模型与攻击面评估</a></li><li><a href="#认证授权token-管理与用户权限模型">认证授权、Token 管理与用户权限模型</a></li><li><a href="#prompt-注入防护输入验证清洗与输出过滤">Prompt 注入防护、输入验证清洗与输出过滤</a></li><li><a href="#敏感信息保护密钥管理与加密存储机制">敏感信息保护、密钥管理与加密存储机制</a></li><li><a href="#安全审计日志记录与合规性要求">安全审计、日志记录与合规性要求</a></li><li><a href="#安全更新机制漏洞修复流程与应急响应预案">安全更新机制、漏洞修复流程与应急响应预案</a></li><li><a href="#结论与建议">结论与建议</a></li></ol><h2 id="引言" tabindex="-1">引言 <a class="header-anchor" href="#引言" aria-label="Permalink to &quot;引言&quot;">​</a></h2><p>本安全架构文档面向 AI Helper 的双进程体系：Chrome 扩展端（Manifest V3，版本 2.3.1）与独立本地 Agent 服务（Node.js，版本 2.3.1）。两端通过本地 HTTP/WebSocket 通信，扩展端负责浏览器上下文、页面交互与用户界面；Agent 端负责本地文件读写、命令执行、长期记忆、RAG 知识库、MCP 工具注册与技能系统。</p><p>从安全视角看，系统不是“一个程序”，而是由多个信任域组成的边界集合：</p><ul><li>浏览器扩展 Service Worker 与 Side Panel 运行在扩展上下文中。</li><li>内容脚本运行在每个页面的隔离世界中。</li><li>Agent 进程以本机 Node 进程身份访问文件系统与操作系统命令。</li><li>外部 LLM 提供商是受控但不可信的外部服务。</li><li>第三方 MCP Server 和 Skill 代码可能引入额外执行面。</li></ul><p>因此，安全设计必须同时处理跨进程、跨上下文、跨平台路径语义、命令语法变体、提示注入、凭据泄露与可观测性五个维度。</p><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/README.md#L1-L132" target="_blank" rel="noreferrer">README.md#L1-L132</a></li></ul><h2 id="项目结构与安全边界总览" tabindex="-1">项目结构与安全边界总览 <a class="header-anchor" href="#项目结构与安全边界总览" aria-label="Permalink to &quot;项目结构与安全边界总览&quot;">​</a></h2><p>下图给出当前仓库中与安全性直接相关的主要模块及其职责划分。</p><pre class="mermaid">graph TB
subgraph &quot;浏览器扩展端&quot;
SW[&quot;Service Worker&lt;br/&gt;background/index.js&quot;]
SP[&quot;Side Panel&lt;br/&gt;聊天与设置界面&quot;]
CS[&quot;Content Script&lt;br/&gt;页面隔离世界&quot;]
AC[&quot;Agent 客户端&lt;br/&gt;local-agent-client.js&quot;]
SEC_LIB[&quot;共享安全库&lt;br/&gt;secret.js / i18n / logger&quot;]
end
subgraph &quot;本地 Agent 进程&quot;
HTTP[&quot;HTTP + WebSocket 服务器&lt;br/&gt;server.js&quot;]
AUTH[&quot;配对与 Token 认证&lt;br/&gt;auth.js&quot;]
SEC[&quot;路径沙箱与命令分级&lt;br/&gt;security.js&quot;]
EXEC[&quot;命令执行器&lt;br/&gt;executor.js&quot;]
LOG[&quot;审计日志&lt;br/&gt;logger.js&quot;]
MEM[&quot;长期记忆与 RAG&lt;br/&gt;memory / rag&quot;]
MCP[&quot;MCP 工具注册&lt;br/&gt;mcp/registry.js&quot;]
SKILL[&quot;技能系统&lt;br/&gt;skill/*&quot;]
end
subgraph &quot;外部系统&quot;
MODEL[&quot;LLM 提供商 API&quot;]
OS[&quot;操作系统与 Shell&quot;]
FS[&quot;本地文件系统&quot;]
NET[&quot;网络与内网服务&quot;]
end
CS --&gt; SW
SP --&gt; SW
SW --&gt; AC
AC --&gt; HTTP
HTTP --&gt; AUTH
HTTP --&gt; SEC
HTTP --&gt; EXEC
HTTP --&gt; LOG
HTTP --&gt; MEM
HTTP --&gt; MCP
HTTP --&gt; SKILL
EXEC --&gt; OS
SEC --&gt; FS
HTTP --&gt; NET
SW --&gt; MODEL
SP --&gt; MODEL
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L40-L93" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L40-L93</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L1-L56" target="_blank" rel="noreferrer">agent/src/server.js#L1-L56</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/auth.js#L1-L48" target="_blank" rel="noreferrer">agent/src/auth.js#L1-L48</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L1-L10" target="_blank" rel="noreferrer">agent/src/security.js#L1-L10</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L1-L18" target="_blank" rel="noreferrer">agent/src/executor.js#L1-L18</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js#L1-L10" target="_blank" rel="noreferrer">agent/src/logger.js#L1-L10</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json" target="_blank" rel="noreferrer">manifest.json</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L40-L93" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L40-L93</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L1-L56" target="_blank" rel="noreferrer">agent/src/server.js#L1-L56</a></li></ul><h2 id="核心安全组件" tabindex="-1">核心安全组件 <a class="header-anchor" href="#核心安全组件" aria-label="Permalink to &quot;核心安全组件&quot;">​</a></h2><p>本项目的安全能力集中在以下六个核心组件：</p><table tabindex="0"><thead><tr><th>组件</th><th>主要职责</th><th>关键安全控制</th></tr></thead><tbody><tr><td>Agent HTTP 服务器</td><td>路由、CORS、请求解析、健康检查、重启/更新/关闭</td><td>仅允许 <code>chrome-extension://</code> 来源跨域读取；对 <code>/api/shutdown</code> 做回环来源判断；限制请求体大小</td></tr><tr><td>认证模块</td><td>配对码生成、轮换、一次性使用、Token 校验</td><td>6 位密码学随机字符、失败锁定、活跃窗口、配对成功后立即轮换</td></tr><tr><td>安全管控模块</td><td>文件路径白名单、硬阻止目录、符号链接检测、命令黑白灰名单</td><td><code>realpath</code> 复检、工作目录放行、Agent 系统文件硬阻止、链式命令拆分与解释器载荷提取</td></tr><tr><td>命令执行器</td><td>子进程创建、流式输出、超时与终止、环境变量白名单</td><td>安全环境变量裁剪、输出缓冲上限、进程树递归终止、受管模式预算</td></tr><tr><td>审计日志模块</td><td>JSON Lines 日志、按日归档、自动清理、查询接口</td><td>分类标签、单文件大小限制、保留数量限制、写入失败不阻塞主流程</td></tr><tr><td>不可信内容包装</td><td>工具结果包装、动态合约注入、注入短语拦截</td><td>fail-closed 白名单、伪造标签剥离、记忆写入来源分级</td></tr></tbody></table><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L235-L266" target="_blank" rel="noreferrer">agent/src/server.js#L235-L266</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/auth.js#L30-L48" target="_blank" rel="noreferrer">agent/src/auth.js#L30-L48</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L62-L229" target="_blank" rel="noreferrer">agent/src/security.js#L62-L229</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L118-L156" target="_blank" rel="noreferrer">agent/src/executor.js#L118-L156</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js#L1-L10" target="_blank" rel="noreferrer">agent/src/logger.js#L1-L10</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/memory/service.js#L71-L93" target="_blank" rel="noreferrer">agent/src/memory/service.js#L71-L93</a></li></ul><h2 id="系统架构与数据流" tabindex="-1">系统架构与数据流 <a class="header-anchor" href="#系统架构与数据流" aria-label="Permalink to &quot;系统架构与数据流&quot;">​</a></h2><p>下图展示一次典型“用户发起 → 扩展调度 → Agent 执行 → 结果返回”的安全数据流。</p><pre class="mermaid">sequenceDiagram
participant User as &quot;用户&quot;
participant SP as &quot;侧边栏&quot;
participant SW as &quot;扩展后台&quot;
participant AC as &quot;Agent 客户端&quot;
participant S as &quot;Agent 服务器&quot;
participant A as &quot;认证模块&quot;
participant SC as &quot;安全管控&quot;
participant EX as &quot;命令执行器&quot;
participant OS as &quot;操作系统&quot;
User-&gt;&gt;SP : 输入任务或选择工具
SP-&gt;&gt;SW : 触发工具调用
SW-&gt;&gt;AC : 构造带 Bearer Token 的请求
AC-&gt;&gt;S : HTTP/WebSocket 请求
S-&gt;&gt;A : 校验 Authorization
A--&gt;&gt;S : 返回扩展 ID 或拒绝
S-&gt;&gt;SC : 路径/命令安全检查
SC--&gt;&gt;S : allow / confirm / deny
S-&gt;&gt;EX : 执行命令或文件操作
EX-&gt;&gt;OS : spawn shell / 文件系统
OS--&gt;&gt;EX : 输出/退出码
EX--&gt;&gt;S : 流式输出或最终结果
S--&gt;&gt;AC : 结构化响应
AC--&gt;&gt;SW : 附加 httpStatus 的结果
SW--&gt;&gt;SP : 渲染结果或确认弹窗
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L393-L443" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L393-L443</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L417-L548" target="_blank" rel="noreferrer">agent/src/server.js#L417-L548</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L685-L758" target="_blank" rel="noreferrer">agent/src/security.js#L685-L758</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L198-L275" target="_blank" rel="noreferrer">agent/src/executor.js#L198-L275</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L393-L443" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L393-L443</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L417-L548" target="_blank" rel="noreferrer">agent/src/server.js#L417-L548</a></li></ul><h2 id="详细组件分析" tabindex="-1">详细组件分析 <a class="header-anchor" href="#详细组件分析" aria-label="Permalink to &quot;详细组件分析&quot;">​</a></h2><h3 id="agent-http-服务器安全入口" tabindex="-1">Agent HTTP 服务器安全入口 <a class="header-anchor" href="#agent-http-服务器安全入口" aria-label="Permalink to &quot;Agent HTTP 服务器安全入口&quot;">​</a></h3><p>Agent 服务器是所有本地能力的统一入口。它承担以下安全职责：</p><ul><li>只允许来自 <code>chrome-extension://</code> 的来源跨域读取响应，防止恶意网页直接读取无认证接口。</li><li>对 <code>/api/pair</code>、<code>/api/status</code> 等无需认证的接口进行最小化信息暴露。</li><li>对 <code>/api/shutdown</code> 区分本机来源与远程来源：远程来源必须携带有效 Bearer Token。</li><li>对所有需认证接口统一校验 <code>Authorization: Bearer &lt;token&gt;</code>。</li><li>限制 JSON body 与 multipart 上传大小，避免内存耗尽。</li><li>将请求语言同步到各子模块，保证错误消息、安全提示、日志分类具备国际化一致性。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;收到 HTTP 请求&quot;]) --&gt; ParseURL[&quot;解析 URL 与路径&quot;]
ParseURL --&gt; CORS{&quot;是否 OPTIONS 预检&quot;}
CORS --&gt; |是| AllowOrigin[&quot;仅反射 chrome-extension:// 来源&quot;]
AllowOrigin --&gt; End([&quot;结束&quot;])
CORS --&gt; |否| PairCheck{&quot;是否 /api/pair&quot;}
PairCheck --&gt; |是| PairFlow[&quot;处理配对请求并记录日志&quot;]
PairFlow --&gt; End
PairCheck --&gt; |否| StatusCheck{&quot;是否 /api/status&quot;}
StatusCheck --&gt; |是| StatusReturn[&quot;返回平台信息，不泄露主机名/Shell/家目录&quot;]
StatusReturn --&gt; End
StatusCheck --&gt; |否| ShutdownCheck{&quot;是否 /api/shutdown&quot;}
ShutdownCheck --&gt; |是| LocalCheck{&quot;是否本机来源&quot;}
LocalCheck --&gt; |否| AuthRequired[&quot;需要 Bearer Token&quot;]
LocalCheck --&gt; |是| ShutdownProceed[&quot;进入冷却期与防重入检查&quot;]
AuthRequired --&gt; VerifyToken[&quot;verifyToken(token)&quot;]
VerifyToken --&gt; Valid{&quot;是否有效&quot;}
Valid --&gt; |否| Deny[&quot;返回 401/403&quot;]
Valid --&gt; |是| ShutdownProceed
ShutdownProceed --&gt; End
ShutdownCheck --&gt; |否| AuthGate[&quot;通用认证门&quot;]
AuthGate --&gt; Heartbeat{&quot;是否心跳&quot;}
Heartbeat --&gt; |是| HeartbeatReturn[&quot;刷新 lastAuthTime&quot;]
Heartbeat --&gt; |否| UpdateRestart{&quot;是否更新/重启&quot;}
UpdateRestart --&gt; End
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L235-L266" target="_blank" rel="noreferrer">agent/src/server.js#L235-L266</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L417-L548" target="_blank" rel="noreferrer">agent/src/server.js#L417-L548</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L555-L720" target="_blank" rel="noreferrer">agent/src/server.js#L555-L720</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L235-L266" target="_blank" rel="noreferrer">agent/src/server.js#L235-L266</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L417-L548" target="_blank" rel="noreferrer">agent/src/server.js#L417-L548</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L555-L720" target="_blank" rel="noreferrer">agent/src/server.js#L555-L720</a></li></ul><h3 id="路径沙箱与命令分级" tabindex="-1">路径沙箱与命令分级 <a class="header-anchor" href="#路径沙箱与命令分级" aria-label="Permalink to &quot;路径沙箱与命令分级&quot;">​</a></h3><p>路径沙箱与命令分级是 Agent 端最重要的两道本地执行防线。</p><h4 id="路径沙箱" tabindex="-1">路径沙箱 <a class="header-anchor" href="#路径沙箱" aria-label="Permalink to &quot;路径沙箱&quot;">​</a></h4><p>路径检查遵循以下顺序：</p><ol><li>空值或非字符串直接拒绝。</li><li>展开 <code>~</code> 到用户主目录。</li><li>规范化路径格式，兼容 Windows 盘符、MSYS/Git Bash 风格路径。</li><li>绝对路径基于自身解析，相对路径基于 workdir 解析。</li><li>硬阻止检查：Agent 配置、配对记录、日志、回收站、内置技能状态等不可绕过。</li><li>记忆存储目录与工作目录特殊放行。</li><li>白名单前缀匹配。</li><li><code>realpath</code> 解析真实物理路径，再次检查硬阻止和白名单，防止符号链接绕过。</li></ol><pre class="mermaid">flowchart TD
Input[&quot;输入路径&quot;] --&gt; Normalize[&quot;规范化路径格式&quot;]
Normalize --&gt; Resolve[&quot;解析为绝对路径&quot;]
Resolve --&gt; HardBlock{&quot;是否命中硬阻止目录&quot;}
HardBlock --&gt; |是| DenyPath[&quot;拒绝：禁止访问代理系统文件&quot;]
HardBlock --&gt; |否| MemoryWorkDir{&quot;是否记忆目录或工作目录&quot;}
MemoryWorkDir --&gt; |是| RealpathCheck[&quot;realpath 复检&quot;]
RealpathCheck --&gt; AllowedPath[&quot;允许&quot;]
MemoryWorkDir --&gt; |否| WhitelistPrefix{&quot;是否在 allowedPaths 前缀下&quot;}
WhitelistPrefix --&gt; |否| DenyOut[&quot;拒绝：路径不在允许目录&quot;]
WhitelistPrefix --&gt; |是| RealpathCheck
RealpathCheck --&gt; FinalAllowed[&quot;允许&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L109-L229" target="_blank" rel="noreferrer">agent/src/security.js#L109-L229</a></li></ul><h4 id="命令分级" tabindex="-1">命令分级 <a class="header-anchor" href="#命令分级" aria-label="Permalink to &quot;命令分级&quot;">​</a></h4><p>命令检查分为三类：</p><ul><li><strong>黑名单</strong>：绝对禁止，即使 <code>force=true</code> 也不放行。包括破坏性删除、格式化磁盘、覆盖系统文件、Fork Bomb、管道执行 shell、修改根目录权限等。</li><li><strong>灰名单</strong>：需要用户确认。包括 <code>sudo</code>、全局安装、递归删除、权限变更、网络外联、进程终止、系统服务、脚本执行等。</li><li><strong>白名单</strong>：普通命令直接放行。</li></ul><p>命令扫描不仅检查整串，还会：</p><ul><li>拆分链式命令。</li><li>剥开 <code>sudo/doas/nohup/env</code> 等包装器。</li><li>归一化 <code>/./usr</code>、<code>//dev</code> 等路径变形。</li><li>提取 <code>-c/-e</code>、<code>/c /k</code>、<code>-Command/-EncodedCommand</code> 等解释器内联载荷。</li><li>提取 <code>$()</code> 与反引号中的子命令。</li><li>对命令替换场景做只读头命令豁免，避免误杀 <code>echo $(date)</code>。</li></ul><pre class="mermaid">flowchart TD
Cmd[&quot;原始命令&quot;] --&gt; Scopes[&quot;收集所有子命令范围&quot;]
Scopes --&gt; Blacklist{&quot;是否命中黑名单&quot;}
Blacklist --&gt; |是| DenyCmd[&quot;deny：绝对禁止&quot;]
Blacklist --&gt; |否| ForceCheck{&quot;是否 force 模式&quot;}
ForceCheck --&gt; |是| AllowCmd[&quot;allow：跳过灰名单&quot;]
ForceCheck --&gt; |否| Graylist{&quot;是否命中灰名单&quot;}
Graylist --&gt; |是| ConfirmCmd[&quot;confirm：需要用户确认&quot;]
Graylist --&gt; |否| SafeCmd[&quot;allow：普通命令&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L285-L384" target="_blank" rel="noreferrer">agent/src/security.js#L285-L384</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L653-L758" target="_blank" rel="noreferrer">agent/src/security.js#L653-L758</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L62-L229" target="_blank" rel="noreferrer">agent/src/security.js#L62-L229</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L285-L384" target="_blank" rel="noreferrer">agent/src/security.js#L285-L384</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L653-L758" target="_blank" rel="noreferrer">agent/src/security.js#L653-L758</a></li></ul><h3 id="命令执行器与进程生命周期" tabindex="-1">命令执行器与进程生命周期 <a class="header-anchor" href="#命令执行器与进程生命周期" aria-label="Permalink to &quot;命令执行器与进程生命周期&quot;">​</a></h3><p>命令执行器负责把安全网关通过的命令交给操作系统执行，同时控制资源消耗与进程生命周期。</p><p>关键点：</p><ul><li>根据平台与环境选择可用 shell，避免 Git Bash MSYS 路径在 Windows 上直接 spawn 失败。</li><li>环境变量采用白名单裁剪，避免泄露宿主敏感变量。</li><li>stdout/stderr 有 5MB 缓冲上限，超限后截断并广播通知。</li><li>支持两种超时策略：旧模式到期即杀；受管模式根据是否有输出决定延长或终止。</li><li>支持流式 WebSocket 输出、延迟连接回放、断开后自由运行（显式 detach）。</li><li>跨平台终止进程树：Unix 用负 PID 杀进程组，Windows 用 <code>taskkill /T /PID</code>。</li></ul><pre class="mermaid">stateDiagram-v2
[*] --&gt; 已创建
已创建 --&gt; 运行中 : &quot;spawn shell&quot;
运行中 --&gt; 有输出 : &quot;stdout/stderr&quot;
有输出 --&gt; 运行中 : &quot;继续执行&quot;
运行中 --&gt; 已终止 : &quot;完成/错误&quot;
运行中 --&gt; 被杀死 : &quot;超时/手动停止&quot;
已终止 --&gt; 已完成缓存 : &quot;缓存输出&quot;
被杀死 --&gt; 已完成缓存 : &quot;缓存输出&quot;
已完成缓存 --&gt; [*] : &quot;TTL 清理&quot;
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L198-L275" target="_blank" rel="noreferrer">agent/src/executor.js#L198-L275</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L297-L383" target="_blank" rel="noreferrer">agent/src/executor.js#L297-L383</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L495-L549" target="_blank" rel="noreferrer">agent/src/executor.js#L495-L549</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L32-L91" target="_blank" rel="noreferrer">agent/src/executor.js#L32-L91</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L118-L156" target="_blank" rel="noreferrer">agent/src/executor.js#L118-L156</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L198-L275" target="_blank" rel="noreferrer">agent/src/executor.js#L198-L275</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L495-L549" target="_blank" rel="noreferrer">agent/src/executor.js#L495-L549</a></li></ul><h3 id="扩展端-agent-客户端" tabindex="-1">扩展端 Agent 客户端 <a class="header-anchor" href="#扩展端-agent-客户端" aria-label="Permalink to &quot;扩展端 Agent 客户端&quot;">​</a></h3><p>扩展端的 <code>local-agent-client.js</code> 封装了与 Agent 的所有 HTTP 与 WebSocket 通信，并负责：</p><ul><li>多代理管理：保存多个 Agent 实例，切换活跃代理。</li><li>Token 解密：从存储中读取时解密 token。</li><li>可达性缓存：避免频繁探测离线 Agent。</li><li>统一认证请求：所有需认证请求附带 <code>Authorization: Bearer</code>。</li><li>超时控制：AbortController 控制 fetch 与 WebSocket 空闲超时。</li><li>文件上传：multipart/form-data 与流式上传。</li><li>命令执行：异步启动、等待结果、停止、detach。</li></ul><pre class="mermaid">classDiagram
class AgentClient {
+getAgentConfig()
+pairWithAgent(agentUrl, pairCode)
+unpairAgent(agentId)
+agentRequest(path, body, method, timeoutMs)
+agentGet(path, timeoutMs)
+uploadFile(file)
+execCommand(command, cwd, force, timeoutMs)
+createExecWebSocket(wsUrl, onMessage, onClose, onError)
}
class Storage {
+pairedAgents
+activeAgentId
+decodeSecret(token)
}
class Logger {
+debug(message)
+warn(message)
+error(message)
}
AgentClient --&gt; Storage : &quot;读取/写入代理配置&quot;
AgentClient --&gt; Logger : &quot;记录连接状态&quot;
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L146-L232" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L146-L232</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L275-L330" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L275-L330</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L393-L443" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L393-L443</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L662-L728" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L662-L728</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L146-L232" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L146-L232</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L275-L330" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L275-L330</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L393-L443" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L393-L443</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L662-L728" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L662-L728</a></li></ul><h2 id="依赖关系与耦合分析" tabindex="-1">依赖关系与耦合分析 <a class="header-anchor" href="#依赖关系与耦合分析" aria-label="Permalink to &quot;依赖关系与耦合分析&quot;">​</a></h2><p>Agent 服务器的依赖关系体现了“入口集中、能力解耦”的设计：</p><pre class="mermaid">graph LR
Server[&quot;server.js&quot;] --&gt; Auth[&quot;auth.js&quot;]
Server --&gt; Security[&quot;security.js&quot;]
Server --&gt; Executor[&quot;executor.js&quot;]
Server --&gt; Logger[&quot;logger.js&quot;]
Server --&gt; Config[&quot;config.js&quot;]
Server --&gt; Search[&quot;search.js&quot;]
Server --&gt; RAGDetect[&quot;rag/detect.js&quot;]
Server --&gt; MemoryRoutes[&quot;memory/routes.js&quot;]
Server --&gt; MCPRegistry[&quot;mcp/registry.js&quot;]
Server --&gt; SkillRegistry[&quot;skill/registry.js&quot;]
Server --&gt; ProcessTree[&quot;process-tree.js&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L1-L56" target="_blank" rel="noreferrer">agent/src/server.js#L1-L56</a></li></ul><p>耦合特点：</p><ul><li>server.js 是协调者，不直接实现业务逻辑，而是委托给 auth、security、executor、logger 等模块。</li><li>security.js 与 executor.js 是强安全依赖：任何命令执行前都应经过 checkCommand。</li><li>logger.js 是横切关注点，几乎所有安全事件都会写日志。</li><li>memory、rag、mcp、skill 是可选能力，不影响基础文件与命令通道。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L1-L56" target="_blank" rel="noreferrer">agent/src/server.js#L1-L56</a></li></ul><h2 id="性能与资源约束下的安全权衡" tabindex="-1">性能与资源约束下的安全权衡 <a class="header-anchor" href="#性能与资源约束下的安全权衡" aria-label="Permalink to &quot;性能与资源约束下的安全权衡&quot;">​</a></h2><p>安全控制不能无限严格，否则会影响可用性。当前实现中存在若干明确权衡：</p><table tabindex="0"><thead><tr><th>控制点</th><th>安全目标</th><th>性能/可用性代价</th><th>当前处理方式</th></tr></thead><tbody><tr><td>命令黑名单</td><td>防止系统破坏</td><td>可能误伤复杂脚本</td><td>逐段扫描 + 包装器剥壳 + 解释器载荷提取</td></tr><tr><td>命令灰名单</td><td>用户确认高危操作</td><td>增加交互摩擦</td><td>提供“本次任务放行”降低频次</td></tr><tr><td>路径 realpath 复检</td><td>防止符号链接绕过</td><td>额外 I/O</td><td>仅在必要时解析真实路径</td></tr><tr><td>输出缓冲上限</td><td>防止长命令撑爆内存</td><td>大输出被截断</td><td>广播 truncation 通知</td></tr><tr><td>超时策略</td><td>防止挂起命令常驻</td><td>长任务可能被杀</td><td>受管模式按输出延长，detach 豁免</td></tr><tr><td>日志清理</td><td>防止磁盘占满</td><td>历史日志丢失</td><td>最多 30 天，单文件超 10MB 清理</td></tr><tr><td>内容脚本注入瘦身</td><td>减少每页加载体积</td><td>功能按需加载更复杂</td><td>构建阶段以 manifest 声明为准</td></tr></tbody></table><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/security.js#L653-L758" target="_blank" rel="noreferrer">agent/src/security.js#L653-L758</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L96-L114" target="_blank" rel="noreferrer">agent/src/executor.js#L96-L114</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/executor.js#L165-L186" target="_blank" rel="noreferrer">agent/src/executor.js#L165-L186</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js#L8-L10" target="_blank" rel="noreferrer">agent/src/logger.js#L8-L10</a></li></ul><h2 id="威胁模型与攻击面评估" tabindex="-1">威胁模型与攻击面评估 <a class="header-anchor" href="#威胁模型与攻击面评估" aria-label="Permalink to &quot;威胁模型与攻击面评估&quot;">​</a></h2><h3 id="安全边界图" tabindex="-1">安全边界图 <a class="header-anchor" href="#安全边界图" aria-label="Permalink to &quot;安全边界图&quot;">​</a></h3><pre class="mermaid">graph TB
Web[&quot;恶意网页&quot;] --&gt; Browser[&quot;浏览器&quot;]
Browser --&gt; ContentScript[&quot;内容脚本&quot;]
Browser --&gt; Extension[&quot;扩展上下文&quot;]
Extension --&gt; Background[&quot;Service Worker&quot;]
Background --&gt; AgentClient[&quot;Agent 客户端&quot;]
AgentClient --&gt; AgentServer[&quot;Agent 服务器&quot;]
AgentServer --&gt; FileSystem[&quot;本地文件系统&quot;]
AgentServer --&gt; Shell[&quot;Shell 命令&quot;]
AgentServer --&gt; Network[&quot;网络请求&quot;]
Background --&gt; ModelAPI[&quot;LLM 提供商&quot;]
AgentServer --&gt; MCP[&quot;第三方 MCP Server&quot;]
</pre><h3 id="主要攻击面" tabindex="-1">主要攻击面 <a class="header-anchor" href="#主要攻击面" aria-label="Permalink to &quot;主要攻击面&quot;">​</a></h3><table tabindex="0"><thead><tr><th>攻击面</th><th>威胁描述</th><th>现有防护</th><th>剩余风险</th></tr></thead><tbody><tr><td>本地命令执行</td><td>模型通过 agent_exec 执行任意 shell 命令</td><td>黑名单/灰名单/用户确认/环境变量白名单</td><td>静态正则无法覆盖所有间接执行；审计日志曾指出确认链路存在历史缺口</td></tr><tr><td>路径穿越</td><td>通过 <code>..</code>、符号链接、<code>~</code>、不同平台路径写法绕过白名单</td><td>规范化、workdir 优先、realpath 复检、硬阻止列表</td><td>若新增未走 checkPath 的文件接口，仍可能越界</td></tr><tr><td>SSRF</td><td>通过 fetch_url 访问内网、元数据服务、回环地址</td><td>扩展侧 network-scope 闸门、scheme 限制、内网白名单</td><td>历史审计指出 manage_tab open 曾存在残余可达面</td></tr><tr><td>XSS</td><td>内容脚本渲染宿主页面 DOM</td><td>侧边栏使用 DOMPurify；SEC-10 CSS 注入做了简单白名单过滤</td><td>内容脚本 Markdown 渲染曾被审计标记为高风险</td></tr><tr><td>提示注入</td><td>外部数据伪装成系统指令</td><td>不可信内容包装、动态合约、记忆写入注入短语拦截</td><td>模型行为仍依赖 prompt 工程与系统提示质量</td></tr><tr><td>凭据泄露</td><td>API Key、Token、Cookie、请求头落入模型上下文</td><td>配对码轮换、Token 混淆存储、部分日志脱敏</td><td>历史审计指出 debug_page 抓包有意暴露 header</td></tr><tr><td>本地 DoS</td><td>恶意网页关停 Agent</td><td>回环来源判断、冷却期、防重入</td><td>审计指出 <code>/api/shutdown</code> 回环免认证模式需谨慎</td></tr></tbody></table><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_REPORT.md#L12-L37" target="_blank" rel="noreferrer">docs/AUDIT_REPORT.md#L12-L37</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_REPORT.md#L174-L189" target="_blank" rel="noreferrer">docs/AUDIT_REPORT.md#L174-L189</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_REPORT.md#L190-L220" target="_blank" rel="noreferrer">docs/AUDIT_REPORT.md#L190-L220</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_REPORT.md#L279-L317" target="_blank" rel="noreferrer">docs/AUDIT_REPORT.md#L279-L317</a></li></ul><h2 id="认证授权、token-管理与用户权限模型" tabindex="-1">认证授权、Token 管理与用户权限模型 <a class="header-anchor" href="#认证授权、token-管理与用户权限模型" aria-label="Permalink to &quot;认证授权、Token 管理与用户权限模型&quot;">​</a></h2><h3 id="配对与认证流程" tabindex="-1">配对与认证流程 <a class="header-anchor" href="#配对与认证流程" aria-label="Permalink to &quot;配对与认证流程&quot;">​</a></h3><p>Agent 的认证不是传统用户名密码，而是“配对码 + Token”的两阶段机制：</p><pre class="mermaid">sequenceDiagram
participant Ext as &quot;扩展&quot;
participant Agent as &quot;Agent 服务器&quot;
participant Auth as &quot;认证模块&quot;
participant Store as &quot;配对记录存储&quot;
Ext-&gt;&gt;Agent : POST /api/pair {code, extensionId}
Agent-&gt;&gt;Auth : handlePairRequest(code, extensionId)
Auth-&gt;&gt;Auth : 检查失败锁定
Auth-&gt;&gt;Auth : 比对 currentPairCode
Auth-&gt;&gt;Store : 检查是否已配对
alt 已配对
Auth--&gt;&gt;Agent : 返回已有 token
else 首次配对
Auth-&gt;&gt;Store : 保存 extensionId + randomBytes(32) token
Auth--&gt;&gt;Agent : 返回新 token
end
Agent--&gt;&gt;Ext : 返回 token
Ext-&gt;&gt;Agent : 后续请求携带 Authorization : Bearer token
Agent-&gt;&gt;Auth : verifyToken(token)
Auth--&gt;&gt;Agent : 返回 extensionId 或 null
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/auth.js#L138-L179" target="_blank" rel="noreferrer">agent/src/auth.js#L138-L179</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/auth.js#L117-L127" target="_blank" rel="noreferrer">agent/src/auth.js#L117-L127</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L474-L484" target="_blank" rel="noreferrer">agent/src/server.js#L474-L484</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L537-L548" target="_blank" rel="noreferrer">agent/src/server.js#L537-L548</a></li></ul><h3 id="token-管理机制" tabindex="-1">Token 管理机制 <a class="header-anchor" href="#token-管理机制" aria-label="Permalink to &quot;Token 管理机制&quot;">​</a></h3><ul><li>配对码：6 位字母数字，排除易混淆字符，使用密码学安全随机数。</li><li>配对码轮换：插件在线且最近 5 分钟有认证则停止轮换；否则定时刷新。</li><li>一次性使用：配对成功后立即轮换配对码。</li><li>失败锁定：连续失败 5 次后锁定 60 秒，并立即轮换配对码。</li><li>Token：32 字节随机 hex，用于后续所有需认证接口。</li><li>活跃窗口：成功认证后更新 lastAuthTime，用于判断插件是否在线。</li></ul><h3 id="用户权限模型" tabindex="-1">用户权限模型 <a class="header-anchor" href="#用户权限模型" aria-label="Permalink to &quot;用户权限模型&quot;">​</a></h3><p>当前权限模型不是细粒度 RBAC，而是“扩展实例级 Token + 服务端能力开关”的组合：</p><ul><li>每个扩展实例拥有唯一 token。</li><li>同一 Agent 可配对多个扩展实例。</li><li>能力开关由 config.json 控制，例如 allowedPaths、commandTimeout、fileMaxSize、pairCodeTTL。</li><li>命令执行还叠加用户确认层：灰名单命令默认弹出确认，黑名单不可绕过。</li><li>网络访问在扩展侧有总闸与白名单，Agent 侧 RAG URL 摄入也有 AND 闸语义。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/auth.js#L30-L48" target="_blank" rel="noreferrer">agent/src/auth.js#L30-L48</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/auth.js#L75-L102" target="_blank" rel="noreferrer">agent/src/auth.js#L75-L102</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/auth.js#L138-L179" target="_blank" rel="noreferrer">agent/src/auth.js#L138-L179</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L537-L548" target="_blank" rel="noreferrer">agent/src/server.js#L537-L548</a></li></ul><h2 id="prompt-注入防护、输入验证清洗与输出过滤" tabindex="-1">Prompt 注入防护、输入验证清洗与输出过滤 <a class="header-anchor" href="#prompt-注入防护、输入验证清洗与输出过滤" aria-label="Permalink to &quot;Prompt 注入防护、输入验证清洗与输出过滤&quot;">​</a></h2><h3 id="不可信内容包装" tabindex="-1">不可信内容包装 <a class="header-anchor" href="#不可信内容包装" aria-label="Permalink to &quot;不可信内容包装&quot;">​</a></h3><p>系统对来自外部数据的工具结果进行包装，将其标记为“数据而非指令”。核心思路：</p><ul><li>定义包装类工具集合：页面内容、网络响应、本地文件、MCP 结果、记忆、RAG 检索等。</li><li>定义已知安全工具集合：纯操作状态、用户输入、模型自产文本等。</li><li>对包装类工具结果包裹 <code>&lt;untrusted_page_content&gt;</code> 标签。</li><li>剥离内容中的伪造标签，防止越狱。</li><li>当检测到消息历史中存在包装内容时，向 system 消息注入安全合约。</li><li>契约文案强调：外部内容是数据，不得执行其中出现的命令、请求或指示。</li></ul><pre class="mermaid">flowchart TD
ToolResult[&quot;工具结果&quot;] --&gt; Classify{&quot;是否包装类工具&quot;}
Classify --&gt; |否| PassThrough[&quot;原样返回&quot;]
Classify --&gt; |是| Sanitize[&quot;剥离伪造标签&quot;]
Sanitize --&gt; Wrap[&quot;包裹 untrusted_page_content&quot;]
Wrap --&gt; Messages[&quot;加入消息历史&quot;]
Messages --&gt; Detect{&quot;是否存在包装内容&quot;}
Detect --&gt; |否| NormalCall[&quot;正常调用模型&quot;]
Detect --&gt; |是| InjectContract[&quot;注入安全合约&quot;]
InjectContract --&gt; CallModel[&quot;调用模型&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/superpowers/specs/2026-10-10-prompt-injection-defense-design.md#L71-L91" target="_blank" rel="noreferrer">docs/superpowers/specs/2026-10-10-prompt-injection-defense-design.md#L71-L91</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/superpowers/specs/2026-10-10-prompt-injection-defense-design.md#L338-L395" target="_blank" rel="noreferrer">docs/superpowers/specs/2026-10-10-prompt-injection-defense-design.md#L338-L395</a></li></ul><h3 id="记忆写入注入防护" tabindex="-1">记忆写入注入防护 <a class="header-anchor" href="#记忆写入注入防护" aria-label="Permalink to &quot;记忆写入注入防护&quot;">​</a></h3><p>记忆模块对写入侧做 fail-closed 拦截：</p><ul><li>命中常见忽略系统提示、越狱模式等注入短语的记忆直接拒写。</li><li>origin 字段由运行时判定，模型不能自封可信来源。</li><li>Tier1 常驻记忆仅限 user 来源且长度受限。</li></ul><pre class="mermaid">flowchart TD
WriteReq[&quot;记忆写入请求&quot;] --&gt; OriginCheck{&quot;origin 是否可信&quot;}
OriginCheck --&gt; |否| Downgrade[&quot;降出 Tier1 常驻&quot;]
OriginCheck --&gt; |是| InjectionScan[&quot;扫描注入短语&quot;]
InjectionScan --&gt; Blocked{&quot;是否命中注入模式&quot;}
Blocked --&gt; |是| Reject[&quot;拒绝写入&quot;]
Blocked --&gt; |否| Save[&quot;保存记忆&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/memory/service.js#L71-L93" target="_blank" rel="noreferrer">agent/src/memory/service.js#L71-L93</a></li></ul><h3 id="输出过滤与-css-注入防护" tabindex="-1">输出过滤与 CSS 注入防护 <a class="header-anchor" href="#输出过滤与-css-注入防护" aria-label="Permalink to &quot;输出过滤与 CSS 注入防护&quot;">​</a></h3><ul><li>侧边栏 Markdown 渲染使用 DOMPurify。</li><li>内容脚本 Markdown 渲染曾被审计标记为高风险，当前决策暂缓引入 DOMPurify，属于架构权衡。</li><li>CSS 注入做了简单白名单过滤，剔除 <code>@import</code>、<code>url()</code>、<code>expression()</code>、<code>element()</code>、<code>-moz-binding</code>、<code>behavior</code> 等危险构造。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/superpowers/specs/2026-10-10-prompt-injection-defense-design.md#L338-L395" target="_blank" rel="noreferrer">docs/superpowers/specs/2026-10-10-prompt-injection-defense-design.md#L338-L395</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/memory/service.js#L71-L93" target="_blank" rel="noreferrer">agent/src/memory/service.js#L71-L93</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L357-L371" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L357-L371</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_REPORT.md#L76-L139" target="_blank" rel="noreferrer">docs/AUDIT_REPORT.md#L76-L139</a></li></ul><h2 id="敏感信息保护、密钥管理与加密存储机制" tabindex="-1">敏感信息保护、密钥管理与加密存储机制 <a class="header-anchor" href="#敏感信息保护、密钥管理与加密存储机制" aria-label="Permalink to &quot;敏感信息保护、密钥管理与加密存储机制&quot;">​</a></h2><h3 id="当前机制" tabindex="-1">当前机制 <a class="header-anchor" href="#当前机制" aria-label="Permalink to &quot;当前机制&quot;">​</a></h3><ul><li>扩展端存储的 Agent Token 使用 Base64 + <code>enc:</code> 前缀混淆。</li><li>Agent 端配对记录中的 token 明文落盘，注释说明该文件未设置 0600 权限。</li><li>WebSocket 认证 token 通过 URL query 传递，因为浏览器 <code>new WebSocket()</code> 无法设置握手 header。</li><li>扩展端 API Key、视觉 API Key 存储在 <code>chrome.storage.local</code>，属于扩展模型固有约束。</li></ul><pre class="mermaid">flowchart TD
Secret[&quot;敏感信息&quot;] --&gt; Encode[&quot;encodeSecret(enc: + base64)&quot;]
Encode --&gt; Storage[&quot;chrome.storage.local&quot;]
Storage --&gt; Decode[&quot;decodeSecret&quot;]
Decode --&gt; Runtime[&quot;运行时使用明文&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/secret.js#L1-L31" target="_blank" rel="noreferrer">src/shared/secret.js#L1-L31</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L662-L693" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L662-L693</a></li></ul><h3 id="风险评估" tabindex="-1">风险评估 <a class="header-anchor" href="#风险评估" aria-label="Permalink to &quot;风险评估&quot;">​</a></h3><ul><li>Base64 混淆不是加密：能读取磁盘或 storage 的攻击者可轻易还原。</li><li>WS token 在 URL 中可能进入代理日志、Referer、浏览器历史记录。</li><li>配对文件权限未设置为仅当前用户可读。</li><li>配置导出包含密钥字段，存在二次泄露风险。</li></ul><h3 id="建议" tabindex="-1">建议 <a class="header-anchor" href="#建议" aria-label="Permalink to &quot;建议&quot;">​</a></h3><ul><li>若威胁模型包含本地磁盘读取，应引入操作系统级密钥保护（如 macOS Keychain、Windows Credential Manager），但这会显著增加部署复杂度。</li><li>WS 握手改用首帧鉴权可减少 URL 暴露面，但需要协议变更。</li><li>导出配置时对密钥做更强提示与二次确认。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/secret.js#L1-L31" target="_blank" rel="noreferrer">src/shared/secret.js#L1-L31</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/local-agent-client.js#L662-L693" target="_blank" rel="noreferrer">src/background/local-agent-client.js#L662-L693</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_REPORT.md#L304-L317" target="_blank" rel="noreferrer">docs/AUDIT_REPORT.md#L304-L317</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_STATUS.md#L40-L41" target="_blank" rel="noreferrer">docs/AUDIT_STATUS.md#L40-L41</a></li></ul><h2 id="安全审计、日志记录与合规性要求" tabindex="-1">安全审计、日志记录与合规性要求 <a class="header-anchor" href="#安全审计、日志记录与合规性要求" aria-label="Permalink to &quot;安全审计、日志记录与合规性要求&quot;">​</a></h2><h3 id="审计日志结构" tabindex="-1">审计日志结构 <a class="header-anchor" href="#审计日志结构" aria-label="Permalink to &quot;审计日志结构&quot;">​</a></h3><p>Agent 端日志采用 JSON Lines 格式，按日归档，分类包括：</p><ul><li>auth：认证相关</li><li>fs：文件操作</li><li>exec：命令执行</li><li>security：安全拦截</li><li>system：系统事件</li></ul><p>每条日志包含时间戳、级别、分类、动作与详情。日志写入失败不会阻塞主流程。</p><pre class="mermaid">flowchart TD
Event[&quot;安全事件&quot;] --&gt; Category{&quot;分类&quot;}
Category --&gt; AuthLog[&quot;logAuth&quot;]
Category --&gt; FsLog[&quot;logFs&quot;]
Category --&gt; ExecLog[&quot;logExec&quot;]
Category --&gt; SecLog[&quot;logSecurity&quot;]
Category --&gt; SysLog[&quot;logSystem&quot;]
AuthLog --&gt; File[&quot;写入 agent-YYYY-MM-DD.log&quot;]
FsLog --&gt; File
ExecLog --&gt; File
SecLog --&gt; File
SysLog --&gt; File
File --&gt; Cleanup[&quot;定期清理旧日志&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js#L125-L172" target="_blank" rel="noreferrer">agent/src/logger.js#L125-L172</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js#L91-L123" target="_blank" rel="noreferrer">agent/src/logger.js#L91-L123</a></li></ul><h3 id="合规性与可观测性" tabindex="-1">合规性与可观测性 <a class="header-anchor" href="#合规性与可观测性" aria-label="Permalink to &quot;合规性与可观测性&quot;">​</a></h3><ul><li>日志保留 30 天，单文件超过 10MB 自动清理。</li><li>可通过 API 查询日志，支持按日期、分类、偏移、限制分页。</li><li>前端可显示审计日志，但需注意 HTML 转义，历史审计已修复该问题。</li><li>扩展端活动统计与审计写操作已改为内存聚合 + 防抖落盘，避免并发写丢更新。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js#L1-L10" target="_blank" rel="noreferrer">agent/src/logger.js#L1-L10</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js#L91-L123" target="_blank" rel="noreferrer">agent/src/logger.js#L91-L123</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/logger.js#L174-L230" target="_blank" rel="noreferrer">agent/src/logger.js#L174-L230</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_STATUS.md#L45" target="_blank" rel="noreferrer">docs/AUDIT_STATUS.md#L45</a></li></ul><h2 id="安全更新机制、漏洞修复流程与应急响应预案" tabindex="-1">安全更新机制、漏洞修复流程与应急响应预案 <a class="header-anchor" href="#安全更新机制、漏洞修复流程与应急响应预案" aria-label="Permalink to &quot;安全更新机制、漏洞修复流程与应急响应预案&quot;">​</a></h2><h3 id="安全更新机制" tabindex="-1">安全更新机制 <a class="header-anchor" href="#安全更新机制" aria-label="Permalink to &quot;安全更新机制&quot;">​</a></h3><p>Agent 提供 <code>/api/agent/update</code> 接口，允许扩展端触发 npm 全局更新：</p><ul><li>校验操作进行中与冷却期。</li><li>与 RAG 依赖安装互斥，避免 node_modules 互相破坏。</li><li>执行 <code>npm install -g ai-helper-agent@latest</code>，超时 90 秒。</li><li>更新失败不重启，保持老进程运行。</li><li>更新成功通过两阶段重启包装器拉起新版本。</li></ul><pre class="mermaid">flowchart TD
Start[&quot;收到更新请求&quot;] --&gt; Guard[&quot;防重入 + 冷却期 + RAG 安装互斥&quot;]
Guard --&gt; NPM[&quot;执行 npm install -g ai-helper-agent@latest&quot;]
NPM --&gt; Success{&quot;是否成功&quot;}
Success --&gt; |否| Fail[&quot;返回失败，不重启&quot;]
Success --&gt; |是| SpawnHelper[&quot;spawn 两阶段重启包装器&quot;]
SpawnHelper --&gt; Shutdown[&quot;关闭当前进程&quot;]
Shutdown --&gt; NewProcess[&quot;新进程接管端口&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L605-L720" target="_blank" rel="noreferrer">agent/src/server.js#L605-L720</a></li></ul><h3 id="漏洞修复流程" tabindex="-1">漏洞修复流程 <a class="header-anchor" href="#漏洞修复流程" aria-label="Permalink to &quot;漏洞修复流程&quot;">​</a></h3><p>根据审计报告与复核状态，本项目已形成较完整的修复闭环：</p><ol><li>审计发现安全问题。</li><li>分类为严重/高/中/低。</li><li>区分“已修复”“成立值得排期”“等级下调”“产品策略决策”。</li><li>补充守卫测试与负向对照。</li><li>全量回归 + 构建验证。</li><li>真机冒烟或探针验证。</li></ol><h3 id="应急响应预案" tabindex="-1">应急响应预案 <a class="header-anchor" href="#应急响应预案" aria-label="Permalink to &quot;应急响应预案&quot;">​</a></h3><p>针对高危场景，建议建立如下预案：</p><ul><li>命令执行异常：立即停止运行进程，查看 exec 日志，检查黑名单是否遗漏。</li><li>路径越界：检查 workdir 与 allowedPaths，确认是否新增未走 checkPath 的接口。</li><li>提示注入：检查不可信内容包装是否生效，system 合约是否注入。</li><li>凭据泄露：轮换 API Key、Agent Token，检查日志是否打印敏感头。</li><li>Agent 被关停：检查 <code>/api/shutdown</code> 来源，评估是否需要收回回环免认证。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/agent/src/server.js#L605-L720" target="_blank" rel="noreferrer">agent/src/server.js#L605-L720</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_REPORT.md#L601-L614" target="_blank" rel="noreferrer">docs/AUDIT_REPORT.md#L601-L614</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/docs/AUDIT_STATUS.md#L132-L160" target="_blank" rel="noreferrer">docs/AUDIT_STATUS.md#L132-L160</a></li></ul><h2 id="结论与建议" tabindex="-1">结论与建议 <a class="header-anchor" href="#结论与建议" aria-label="Permalink to &quot;结论与建议&quot;">​</a></h2><p>AI Helper 的安全架构在双进程模型下实现了较为完整的多层防护：扩展端负责浏览器上下文与用户交互，Agent 端负责本地执行与数据能力，并通过认证、路径沙箱、命令分级、不可信内容包装、审计日志等手段形成纵深防御。</p><p>但仍存在若干需要持续关注的方向：</p><ol><li><strong>命令确认链路必须始终由用户交互驱动</strong>，不应接受模型传入的 <code>force</code> 作为绕过依据。</li><li><strong>内容脚本渲染与 XSS 防护仍需补齐</strong>，当前审计结论表明内容脚本 Markdown 渲染缺少消毒。</li><li><strong>SSRF 与内网访问应坚持 AND 闸语义</strong>，总闸关闭时即使白名单非空也应拒绝。</li><li><strong>敏感信息存储应评估是否升级为操作系统级密钥保护</strong>，至少对配对文件设置严格权限。</li><li><strong>调试能力与隐私保护需要明确产品边界</strong>，debug_page 抓包暴露 header 是有意取舍，但应提供显式开关。</li><li><strong>安全更新与漏洞修复应配套自动化守卫测试</strong>，确保黑名单、路径沙箱、注入防护不因新增功能退化。</li></ol><p>整体而言，该系统的安全基线优于许多同类项目，但“让 AI 操作本地文件和终端”的能力本身具有高风险。未来演进应以“最小权限、最大可见、强制确认、可审计”为核心原则，而不是单纯堆叠规则。</p>`,169)])])}const b=t(i,[["render",o]]);export{d as __pageData,b as default};
