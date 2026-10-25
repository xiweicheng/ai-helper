import{_ as t,o,c as n,a3 as r}from"./chunks/framework.BrO6lPIi.js";const p=JSON.parse('{"title":"Content Scripts 注入机制","description":"本文围绕扩展的 Content Script 注入机制展开，重点解释以下方面：。","frontmatter":{"title":"Content Scripts 注入机制","description":"本文围绕扩展的 Content Script 注入机制展开，重点解释以下方面：。"},"headers":[],"relativePath":"Chrome-扩展核心/Content-Scripts-注入机制/index.md","filePath":"Chrome-扩展核心/Content-Scripts-注入机制/index.md","lastUpdated":null}'),a={name:"Chrome-扩展核心/Content-Scripts-注入机制/index.md"};function i(l,e,s,c,h,g){return o(),n("div",null,[...e[0]||(e[0]=[r(`<h1 id="content-scripts-注入机制" tabindex="-1">Content Scripts 注入机制 <a class="header-anchor" href="#content-scripts-注入机制" aria-label="Permalink to &quot;Content Scripts 注入机制&quot;">​</a></h1><details class="details custom-block"><summary>本文引用的源码文件</summary><p><strong>本文引用的文件</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json" target="_blank" rel="noreferrer">manifest.json</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js" target="_blank" rel="noreferrer">src/content/index.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-tools.js" target="_blank" rel="noreferrer">src/content/page-tools.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-extract.js" target="_blank" rel="noreferrer">src/content/page-extract.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js" target="_blank" rel="noreferrer">src/content/page-interaction.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/interaction-tools.js" target="_blank" rel="noreferrer">src/content/interaction-tools.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/shadow-dom-utils.js" target="_blank" rel="noreferrer">src/content/shadow-dom-utils.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-utils.js" target="_blank" rel="noreferrer">src/content/page-utils.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js" target="_blank" rel="noreferrer">src/content/advanced-tools.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js" target="_blank" rel="noreferrer">src/content/selection-toolbar.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar-styles.js" target="_blank" rel="noreferrer">src/content/selection-toolbar-styles.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/page-snapshot-renderer.js" target="_blank" rel="noreferrer">src/shared/page-snapshot-renderer.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/tool-executor.js" target="_blank" rel="noreferrer">src/background/tool-executor.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/tool-helpers.js" target="_blank" rel="noreferrer">src/background/tool-helpers.js</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/background/scheduler.js" target="_blank" rel="noreferrer">src/background/scheduler.js</a></li></ul></details><h2 id="更新摘要" tabindex="-1">更新摘要 <a class="header-anchor" href="#更新摘要" aria-label="Permalink to &quot;更新摘要&quot;">​</a></h2><p><strong>已进行的变更</strong></p><ul><li>新增选择工具栏顶层层管理章节，详细说明 Popover API 的使用和 top layer 迁移</li><li>添加遮挡检测与交互防护机制说明</li><li>更新 z-index 冲突解决方案，特别是针对飞书等宿主应用的兼容性处理</li><li>增强浮层生命周期管理和状态同步机制</li><li>补充样式注入的安全考虑和 UA 默认样式处理</li></ul><h2 id="目录" tabindex="-1">目录 <a class="header-anchor" href="#目录" aria-label="Permalink to &quot;目录&quot;">​</a></h2><ol><li><a href="#引言">引言</a></li><li><a href="#项目结构与注入入口">项目结构与注入入口</a></li><li><a href="#核心组件总览">核心组件总览</a></li><li><a href="#架构概览content-script-与扩展端通信">架构概览：Content Script 与扩展端通信</a></li><li><a href="#详细组件分析">详细组件分析</a></li><li><a href="#依赖关系分析">依赖关系分析</a></li><li><a href="#性能优化与内存管理">性能优化与内存管理</a></li><li><a href="#安全考虑">安全考虑</a></li><li><a href="#故障排查指南">故障排查指南</a></li><li><a href="#结论">结论</a></li><li><a href="#附录开发新页面工具实践">附录：开发新页面工具实践</a></li></ol><h2 id="引言" tabindex="-1">引言 <a class="header-anchor" href="#引言" aria-label="Permalink to &quot;引言&quot;">​</a></h2><p>本文围绕扩展的 Content Script 注入机制展开，重点解释以下方面：</p><ul><li>Content Script 的加载时机、作用域隔离与跨 frame 行为。</li><li>与页面 DOM 的访问权限控制，包括 Shadow DOM 穿透和同源 iframe 限制。</li><li>消息路由表实现：Map O(1) 查找、异步 Promise 处理、错误传播与顶层 frame 保护。</li><li>页面工具集合的统一接口设计：信息提取、交互操作、数据抓取。</li><li><strong>新增</strong>：选择工具栏的顶层层管理，使用 Popover API 解决 z-index 冲突问题。</li><li>Shadow DOM 穿透技术与样式注入方案。</li><li>安全策略：XSS 防护、权限最小化、恶意内容检测。</li><li>性能优化：防抖节流、批量操作、DOM 签名自动等待、快照渲染预算控制。</li><li>如何基于现有结构开发新的页面工具，并处理复杂网页结构和异步操作。</li></ul><h2 id="项目结构与注入入口" tabindex="-1">项目结构与注入入口 <a class="header-anchor" href="#项目结构与注入入口" aria-label="Permalink to &quot;项目结构与注入入口&quot;">​</a></h2><p>Content Script 由 Manifest V3 的 <code>content_scripts</code> 字段声明，匹配所有 URL，在 <code>document_idle</code> 阶段注入，启用 <code>all_frames</code>，并包含 qrcode 与 marked 等库脚本。</p><pre class="mermaid">graph TB
Manifest[&quot;manifest.json&lt;br/&gt;content_scripts 配置&quot;] --&gt; Loader[&quot;浏览器 Content Script 加载器&quot;]
Loader --&gt; QRCode[&quot;libs/qrcode.min.js&quot;]
Loader --&gt; Marked[&quot;libs/marked.min.js&quot;]
Loader --&gt; IndexJS[&quot;src/content/index.js&quot;]
IndexJS --&gt; PageTools[&quot;page-tools.js&quot;]
IndexJS --&gt; PageExtract[&quot;page-extract.js&quot;]
IndexJS --&gt; PageInteraction[&quot;page-interaction.js&quot;]
IndexJS --&gt; InteractionTools[&quot;interaction-tools.js&quot;]
IndexJS --&gt; AdvancedTools[&quot;advanced-tools.js&quot;]
IndexJS --&gt; SelectionToolbar[&quot;selection-toolbar.js&quot;]
IndexJS --&gt; ShadowUtils[&quot;shadow-dom-utils.js&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json#L36-L45" target="_blank" rel="noreferrer">manifest.json#L36-L45</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L1-L33" target="_blank" rel="noreferrer">src/content/index.js#L1-L33</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json#L1-L76" target="_blank" rel="noreferrer">manifest.json#L1-L76</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L1-L33" target="_blank" rel="noreferrer">src/content/index.js#L1-L33</a></li></ul><h3 id="注入时机与作用域" tabindex="-1">注入时机与作用域 <a class="header-anchor" href="#注入时机与作用域" aria-label="Permalink to &quot;注入时机与作用域&quot;">​</a></h3><ul><li>加载时机：<code>run_at: document_idle</code>，表示 DOM 已构建完成，但图片等资源可能仍在加载。</li><li>作用域：每个 frame 独立执行，<code>all_frames: true</code> 使子帧也拥有独立上下文。</li><li>全局变量隔离：Content Script 不能直接访问页面 JS 变量；如需访问，必须通过消息通道或注入函数。</li><li>跨 frame 限制：同源 iframe 可被读取，跨源 iframe 会触发权限异常并被捕获跳过。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json#L36-L45" target="_blank" rel="noreferrer">manifest.json#L36-L45</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/shadow-dom-utils.js#L23-L33" target="_blank" rel="noreferrer">src/content/shadow-dom-utils.js#L23-L33</a></li></ul><h2 id="核心组件总览" tabindex="-1">核心组件总览 <a class="header-anchor" href="#核心组件总览" aria-label="Permalink to &quot;核心组件总览&quot;">​</a></h2><p>Content Script 的核心职责是：</p><ul><li>提供统一的消息路由表，将后台或侧边栏请求分发到具体工具函数。</li><li>封装页面读取、交互、提取、高级工具四类能力。</li><li><strong>新增</strong>：管理选择工具栏的顶层层显示和遮挡检测。</li><li>维护元素引用注册表（ref），避免模型编写脆弱 CSS selector。</li><li>支持 Shadow DOM 与 iframe 的深度查询与文本/HTML 聚合。</li><li>提供样式注入、二维码生成、完成度校验等高级功能。</li></ul><pre class="mermaid">classDiagram
class ContentIndex {
+HANDLERS Map
+ASYNC_HANDLERS Set
+TOP_FRAME_ONLY_TYPES Set
+onMessage(message, sender, sendResponse)
+startRegionSelection() Promise
}
class SelectionToolbar {
+toolbarEl Element
+resultPanelEl Element
+overflowDropdownEl Element
+openFloat(el, displayValue)
+closeFloat(el)
+probeFloatOcclusion(el)
+releaseOcclusionIfIdle()
+showPopover()
+hidePopover()
}
class PageTools {
+getPageText(options)
+getFullHtml(options)
+getSelectedContent(format)
+extractTable(selector, includeHeaders, format)
+copyToClipboard(text)
+pasteFromClipboard()
+hoverElement(selector)
+highlightText(text, color)
}
class PageExtract {
+extractMetadata()
+extractLinks(filterType, includeImages)
+extractForms(formSelector)
+extractImages(options)
+searchInPage(options)
+getIframeContent(selector, includeNested, maxLength)
}
class PageInteraction {
+queryInteractiveElements(options)
+collectSnapshotOps(options)
+isFrameVisible()
+scrollAndCollect(args)
+interactByRef(ref, action, options)
+resolveByRef(ref)
}
class InteractionTools {
+clickElement(selector, waitTime, timeout)
+fillForm(fields, waitTime)
+scrollToPosition(options)
+waitForElement(selector, state, timeout)
+keyboardInput(params)
+fileUpload(selector, fileName, fileContent, fileType)
+selectDropdown(triggerSelector, optionText, optionSelector, timeout)
+manageStorage(params)
+clickByText(text, options)
}
class AdvancedTools {
+generateQRCode(content, size, errorCorrection, showImage)
+injectCss(css, targetSelector, injectMode)
+evaluateDoneCriteria(criteria, doc, loc)
+sanitizeInjectedCss(css)
}
class ShadowDomUtils {
+deepQuerySelector(selector, root, maxDepth, depth)
+deepQuerySelectorAll(selector, root, maxDepth, depth, found)
+deepGetText(root, maxDepth, depth, visited)
+deepGetHtml(root, maxDepth, depth, visited)
+deepGetSelection(root, maxDepth, depth)
}
ContentIndex --&gt; PageTools : &quot;调用&quot;
ContentIndex --&gt; PageExtract : &quot;调用&quot;
ContentIndex --&gt; PageInteraction : &quot;调用&quot;
ContentIndex --&gt; InteractionTools : &quot;调用&quot;
ContentIndex --&gt; AdvancedTools : &quot;调用&quot;
ContentIndex --&gt; SelectionToolbar : &quot;管理&quot;
PageTools --&gt; ShadowDomUtils : &quot;使用&quot;
PageExtract --&gt; ShadowDomUtils : &quot;使用&quot;
PageInteraction --&gt; ShadowDomUtils : &quot;使用&quot;
InteractionTools --&gt; ShadowDomUtils : &quot;使用&quot;
SelectionToolbar --&gt; ShadowDomUtils : &quot;使用&quot;
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L91-L181" target="_blank" rel="noreferrer">src/content/index.js#L91-L181</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L230-L294" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L230-L294</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-tools.js#L56-L329" target="_blank" rel="noreferrer">src/content/page-tools.js#L56-L329</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-extract.js#L31-L817" target="_blank" rel="noreferrer">src/content/page-extract.js#L31-L817</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L51-L983" target="_blank" rel="noreferrer">src/content/page-interaction.js#L51-L983</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/interaction-tools.js#L100-L789" target="_blank" rel="noreferrer">src/content/interaction-tools.js#L100-L789</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L112-L543" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L112-L543</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/shadow-dom-utils.js#L12-L443" target="_blank" rel="noreferrer">src/content/shadow-dom-utils.js#L12-L443</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L1-L391" target="_blank" rel="noreferrer">src/content/index.js#L1-L391</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L1-L2404" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L1-L2404</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-tools.js#L1-L329" target="_blank" rel="noreferrer">src/content/page-tools.js#L1-L329</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-extract.js#L1-L817" target="_blank" rel="noreferrer">src/content/page-extract.js#L1-L817</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L1-L983" target="_blank" rel="noreferrer">src/content/page-interaction.js#L1-L983</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/interaction-tools.js#L1-L789" target="_blank" rel="noreferrer">src/content/interaction-tools.js#L1-L789</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L1-L543" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L1-L543</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/shadow-dom-utils.js#L1-L443" target="_blank" rel="noreferrer">src/content/shadow-dom-utils.js#L1-L443</a></li></ul><h2 id="架构概览-content-script-与扩展端通信" tabindex="-1">架构概览：Content Script 与扩展端通信 <a class="header-anchor" href="#架构概览-content-script-与扩展端通信" aria-label="Permalink to &quot;架构概览：Content Script 与扩展端通信&quot;">​</a></h2><p>Content Script 通过 <code>chrome.runtime.onMessage</code> 监听消息，由 <code>HANDLERS</code> Map 分发到对应处理器。异步处理器返回 Promise，由路由层统一 <code>Promise.resolve(result).then(sendResponse)</code> 处理。</p><pre class="mermaid">sequenceDiagram
participant Background as &quot;Background / Side Panel&quot;
participant Content as &quot;Content Script (index.js)&quot;
participant Handler as &quot;HANDLERS Map&quot;
participant Tool as &quot;具体工具函数&quot;
Background-&gt;&gt;Content : chrome.runtime.sendMessage({type, payload})
Content-&gt;&gt;Content : 检查 TOP_FRAME_ONLY_TYPES
Content-&gt;&gt;Handler : HANDLERS[type]
Handler--&gt;&gt;Content : handler 函数
Content-&gt;&gt;Tool : 调用工具函数
Tool--&gt;&gt;Content : 同步结果 或 Promise
Content-&gt;&gt;Content : ASYNC_HANDLERS 判断
alt 异步
Content-&gt;&gt;Content : Promise.resolve(result).then(sendResponse)
Content--&gt;&gt;Background : sendResponse(data)
else 同步
Content--&gt;&gt;Background : sendResponse(result)
end
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L209-L246" target="_blank" rel="noreferrer">src/content/index.js#L209-L246</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L91-L181" target="_blank" rel="noreferrer">src/content/index.js#L91-L181</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L209-L246" target="_blank" rel="noreferrer">src/content/index.js#L209-L246</a></li></ul><h2 id="详细组件分析" tabindex="-1">详细组件分析 <a class="header-anchor" href="#详细组件分析" aria-label="Permalink to &quot;详细组件分析&quot;">​</a></h2><h3 id="消息路由表与异步处理" tabindex="-1">消息路由表与异步处理 <a class="header-anchor" href="#消息路由表与异步处理" aria-label="Permalink to &quot;消息路由表与异步处理&quot;">​</a></h3><ul><li><code>HANDLERS</code> 是一个普通对象，键为消息类型，值为处理器函数。JavaScript 对象属性查找近似 O(1)，适合高频消息分发。</li><li><code>ASYNC_HANDLERS</code> 是一个 Set，标记需要保持消息通道开放的异步工具。</li><li><code>TOP_FRAME_ONLY_TYPES</code> 限制某些工具只在顶层 frame 响应，避免 iframe 抢先应答导致取证或 ref 解析混乱。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;收到消息&quot;]) --&gt; CheckTop[&quot;是否 TOP_FRAME_ONLY_TYPES 且非顶层 frame?&quot;]
CheckTop --&gt; |是| Ignore[&quot;忽略消息&quot;]
CheckTop --&gt; |否| FindHandler[&quot;从 HANDLERS 查找处理器&quot;]
FindHandler --&gt; HasHandler{&quot;找到处理器?&quot;}
HasHandler --&gt; |否| End[&quot;结束&quot;]
HasHandler --&gt; |是| CallHandler[&quot;调用处理器&quot;]
CallHandler --&gt; IsAsync{&quot;是否异步?&quot;}
IsAsync --&gt; |是| ResolvePromise[&quot;Promise.resolve().then(sendResponse)&quot;]
IsAsync --&gt; |否| SendSync[&quot;sendResponse(同步结果)&quot;]
ResolvePromise --&gt; End
SendSync --&gt; End
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L209-L246" target="_blank" rel="noreferrer">src/content/index.js#L209-L246</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L91-L193" target="_blank" rel="noreferrer">src/content/index.js#L91-L193</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L74-L246" target="_blank" rel="noreferrer">src/content/index.js#L74-L246</a></li></ul><h3 id="选择工具栏顶层层管理与遮挡检测" tabindex="-1">选择工具栏顶层层管理与遮挡检测 <a class="header-anchor" href="#选择工具栏顶层层管理与遮挡检测" aria-label="Permalink to &quot;选择工具栏顶层层管理与遮挡检测&quot;">​</a></h3><p><strong>新增</strong> 选择工具栏现已采用 Popover API 进入浏览器的 top layer，解决了传统 z-index 层级冲突问题，特别是在飞书等同文档应用中。</p><h4 id="顶层层管理机制" tabindex="-1">顶层层管理机制 <a class="header-anchor" href="#顶层层管理机制" aria-label="Permalink to &quot;顶层层管理机制&quot;">​</a></h4><ul><li><strong>Popover API 集成</strong>：工具栏、溢出下拉菜单、结果面板和 Token 弹窗都使用 <code>popover=&quot;manual&quot;</code> 属性，通过 <code>showPopover()</code> 和 <code>hidePopover()</code> 方法控制显示状态。</li><li><strong>回退机制</strong>：在不支持 Popover API 的环境中，自动回退到传统的 body 挂载 + 内联 display 方式。</li><li><strong>状态同步</strong>：使用 <code>isFloatOpen()</code> 函数确保 popover 状态与内联 display 状态保持一致。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;显示浮层&quot;]) --&gt; CheckAPI{&quot;是否支持 Popover API?&quot;}
CheckAPI --&gt; |是| ShowPopover[&quot;调用 showPopover()&quot;]
CheckAPI --&gt; |否| FallbackDisplay[&quot;设置 display 属性&quot;]
ShowPopover --&gt; SetDisplay[&quot;同时设置 display 属性&quot;]
SetDisplay --&gt; ProbeOcclusion[&quot;探测遮挡元素&quot;]
FallbackDisplay --&gt; ProbeOcclusion
ProbeOcclusion --&gt; HitTest[&quot;elementFromPoint 命中测试&quot;]
HitTest --&gt; FoundOccluder{&quot;发现外来遮挡元素?&quot;}
FoundOccluder --&gt; |是| TempHide[&quot;临时隐藏遮挡元素&quot;]
FoundOccluder --&gt; |否| NoAction[&quot;无需操作&quot;]
TempHide --&gt; TrackHidden[&quot;记录被隐藏的遮挡元素&quot;]
NoAction --&gt; ReturnSuccess[&quot;返回成功&quot;]
TrackHidden --&gt; ReturnSuccess
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L241-L294" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L241-L294</a></li></ul><h4 id="遮挡检测与交互防护" tabindex="-1">遮挡检测与交互防护 <a class="header-anchor" href="#遮挡检测与交互防护" aria-label="Permalink to &quot;遮挡检测与交互防护&quot;">​</a></h4><ul><li><strong>智能遮挡检测</strong>：使用 <code>elementFromPoint</code> 在浮层关键位置进行命中测试，检测是否有宿主页面的高层级元素遮挡。</li><li><strong>临时遮挡处理</strong>：发现外来遮挡元素时，将其临时隐藏并记录原始 display 状态，在所有浮层关闭后自动恢复。</li><li><strong>自身元素豁免</strong>：通过 <code>data-aih</code> 标记识别扩展自身的浮层元素，避免误伤。</li><li><strong>交互窗口期保护</strong>：在用户与工具栏交互期间（mousedown→mouseup），防止宿主页面清选区导致的工具栏意外隐藏。</li></ul><pre class="mermaid">flowchart TD
MouseClick[&quot;用户点击事件&quot;] --&gt; CheckInteracting{&quot;是否在交互窗口期内?&quot;}
CheckInteracting --&gt; |是| SuppressHide[&quot;抑制工具栏隐藏&quot;]
CheckInteracting --&gt; |否| NormalFlow[&quot;正常流程&quot;]
SuppressHide --&gt; ProcessAction[&quot;处理点击动作&quot;]
NormalFlow --&gt; CheckSelection{&quot;选区是否存在?&quot;}
CheckSelection --&gt; |否| HideToolbar[&quot;隐藏工具栏&quot;]
CheckSelection --&gt; |是| ShowToolbar[&quot;显示工具栏&quot;]
ProcessAction --&gt; Complete[&quot;完成&quot;]
HideToolbar --&gt; Complete
ShowToolbar --&gt; Complete
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L179-L195" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L179-L195</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L647-L648" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L647-L648</a></li></ul><h4 id="z-index-冲突解决方案" tabindex="-1">z-index 冲突解决方案 <a class="header-anchor" href="#z-index-冲突解决方案" aria-label="Permalink to &quot;z-index 冲突解决方案&quot;">​</a></h4><ul><li><strong>CSS 最大值策略</strong>：工具栏使用 <code>z-index: 2147483647</code>（CSS 最大值）确保最高优先级。</li><li><strong>top layer 优势</strong>：通过 Popover API 进入 top layer，绕过传统 z-index 层级系统。</li><li><strong>宿主应用兼容</strong>：专门针对飞书等高 z-index 宿主应用进行优化，确保扩展浮层始终可见。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L230-L294" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L230-L294</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar-styles.js#L71-L74" target="_blank" rel="noreferrer">src/content/selection-toolbar-styles.js#L71-L74</a></li></ul><h3 id="页面工具集合-信息提取、交互操作、数据抓取" tabindex="-1">页面工具集合：信息提取、交互操作、数据抓取 <a class="header-anchor" href="#页面工具集合-信息提取、交互操作、数据抓取" aria-label="Permalink to &quot;页面工具集合：信息提取、交互操作、数据抓取&quot;">​</a></h3><ul><li><strong>信息提取</strong>：<code>page-extract.js</code> 提供元数据、链接、表单、图片、Markdown、JSON、iframe 内容提取。</li><li><strong>交互操作</strong>：<code>interaction-tools.js</code> 提供点击、填充表单、滚动、等待元素、键盘输入、文件上传、下拉选择、存储管理。</li><li><strong>数据抓取</strong>：<code>page-tools.js</code> 提供页面文本、完整 HTML、选中内容、表格提取、剪贴板操作、悬停、高亮。</li></ul><pre class="mermaid">graph LR
Extract[&quot;page-extract.js&lt;br/&gt;信息提取&quot;] --&gt; Tools[&quot;统一工具接口&quot;]
Interaction[&quot;interaction-tools.js&lt;br/&gt;交互操作&quot;] --&gt; Tools
PageTools[&quot;page-tools.js&lt;br/&gt;数据抓取&quot;] --&gt; Tools
Tools --&gt; Model[&quot;模型/Agent 调用&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-extract.js#L31-L817" target="_blank" rel="noreferrer">src/content/page-extract.js#L31-L817</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/interaction-tools.js#L100-L789" target="_blank" rel="noreferrer">src/content/interaction-tools.js#L100-L789</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-tools.js#L56-L329" target="_blank" rel="noreferrer">src/content/page-tools.js#L56-L329</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-extract.js#L1-L817" target="_blank" rel="noreferrer">src/content/page-extract.js#L1-L817</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/interaction-tools.js#L1-L789" target="_blank" rel="noreferrer">src/content/interaction-tools.js#L1-L789</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-tools.js#L1-L329" target="_blank" rel="noreferrer">src/content/page-tools.js#L1-L329</a></li></ul><h3 id="元素引用注册表与-ref-解析" tabindex="-1">元素引用注册表与 ref 解析 <a class="header-anchor" href="#元素引用注册表与-ref-解析" aria-label="Permalink to &quot;元素引用注册表与 ref 解析&quot;">​</a></h3><ul><li><code>elementRegistry</code> 是 <code>Map&lt;ref, {element, selector, tag, role, name}&gt;</code>，用于稳定引用元素。</li><li><code>elementRefMap</code> 是 <code>WeakMap&lt;Element, ref&gt;</code>，跨快照复用编号，元素 GC 后编号退役。</li><li><code>resolveByRef</code> 提供统一解析逻辑：注册表命中 → <code>isConnected</code> 检查 → selector 兜底重查 → 失败时返回结构化建议。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;resolveByRef(ref)&quot;]) --&gt; Parse[&quot;解析 ref 数字&quot;]
Parse --&gt; HasEntry{&quot;elementRegistry.has(ref)?&quot;}
HasEntry --&gt; |否| ReturnError[&quot;返回错误 + 建议&quot;]
HasEntry --&gt; |是| GetEntry[&quot;获取 entry&quot;]
GetEntry --&gt; Connected{&quot;entry.element.isConnected?&quot;}
Connected --&gt; |是| EnsureSel[&quot;ensureSelector(entry)&quot;]
Connected --&gt; |否| Fallback[&quot;selector 兜底重查&quot;]
EnsureSel --&gt; ReturnEntry[&quot;返回 {entry, element}&quot;]
Fallback --&gt; Found{&quot;找到元素?&quot;}
Found --&gt; |是| UpdateEntry[&quot;更新 entry.element&quot;]
Found --&gt; |否| ReturnError
UpdateEntry --&gt; ReturnEntry
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L51-L152" target="_blank" rel="noreferrer">src/content/page-interaction.js#L51-L152</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L51-L152" target="_blank" rel="noreferrer">src/content/page-interaction.js#L51-L152</a></li></ul><h3 id="shadow-dom-穿透技术" tabindex="-1">Shadow DOM 穿透技术 <a class="header-anchor" href="#shadow-dom-穿透技术" aria-label="Permalink to &quot;Shadow DOM 穿透技术&quot;">​</a></h3><ul><li><code>deepQuerySelector</code> 递归遍历 Shadow DOM 和同源 iframe，优先深层匹配。</li><li><code>deepGetText</code> 和 <code>deepGetHtml</code> 聚合 Shadow DOM 与 iframe 内容，防止循环引用。</li><li><code>attachSelectionListeners</code> 在所有 Shadow DOM 上附加选择变化监听器。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;deepQuerySelector(selector, root)&quot;]) --&gt; DepthCheck{&quot;depth &gt; maxDepth?&quot;}
DepthCheck --&gt; |是| ReturnNull[&quot;返回 null&quot;]
DepthCheck --&gt; |否| QueryShadow[&quot;遍历 shadowRoot&quot;]
QueryShadow --&gt; QueryIframe[&quot;遍历 iframe&quot;]
QueryIframe --&gt; QueryCurrent[&quot;root.querySelector(selector)&quot;]
QueryCurrent --&gt; Found{&quot;找到元素?&quot;}
Found --&gt; |是| ReturnEl[&quot;返回元素&quot;]
Found --&gt; |否| ReturnNull
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/shadow-dom-utils.js#L12-L45" target="_blank" rel="noreferrer">src/content/shadow-dom-utils.js#L12-L45</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/shadow-dom-utils.js#L12-L443" target="_blank" rel="noreferrer">src/content/shadow-dom-utils.js#L12-L443</a></li></ul><h3 id="样式注入与安全净化" tabindex="-1">样式注入与安全净化 <a class="header-anchor" href="#样式注入与安全净化" aria-label="Permalink to &quot;样式注入与安全净化&quot;">​</a></h3><ul><li><code>injectCss</code> 支持 <code>style</code> 和 <code>inline</code> 两种模式，<code>style</code> 模式支持 scoped 注入。</li><li><code>sanitizeInjectedCss</code> 过滤危险 CSS 构造：<code>@import</code>、<code>url()</code>、<code>expression()</code>、<code>-moz-element()</code>、<code>behavior</code> 等。</li><li>注入前统一净化，确保不执行脚本、不外泄数据。</li><li><strong>新增</strong>：Popover API 相关的 UA 默认样式处理，避免覆盖组件自身样式。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;injectCss(css, targetSelector, injectMode)&quot;]) --&gt; Sanitize[&quot;sanitizeInjectedCss(css)&quot;]
Sanitize --&gt; ModeCheck{&quot;injectMode 合法?&quot;}
ModeCheck --&gt; |否| ReturnError[&quot;返回错误&quot;]
ModeCheck --&gt; |是| StyleMode{&quot;injectMode === &#39;style&#39;?&quot;}
StyleMode --&gt; |是| ScopedOrGlobal[&quot;scoped 或 global 注入&quot;]
StyleMode --&gt; |否| InlineMode[&quot;inline 属性注入&quot;]
ScopedOrGlobal --&gt; ReturnSuccess[&quot;返回成功&quot;]
InlineMode --&gt; ReturnSuccess
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L357-L456" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L357-L456</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L357-L456" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L357-L456</a></li></ul><h3 id="页面快照渲染与分页" tabindex="-1">页面快照渲染与分页 <a class="header-anchor" href="#页面快照渲染与分页" aria-label="Permalink to &quot;页面快照渲染与分页&quot;">​</a></h3><ul><li><code>renderSnapshot</code> 是统一渲染出口，支持分页、字符预算、iframe 区块、打开层与主体分区。</li><li><code>collectSnapshotOps</code> 采集结构化树，<code>renderSnapshot</code> 输出文本快照。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;collectSnapshotOps(options)&quot;]) --&gt; CollectMatches[&quot;collectMatches(document.body)&quot;]
CollectMatches --&gt; RegisterElements[&quot;registerElement(el)&quot;]
RegisterElements --&gt; BuildTree[&quot;buildTree(document.body)&quot;]
BuildTree --&gt; ReturnOps[&quot;返回 {overlayTrees, bodyTree, frameInfo}&quot;]
ReturnOps --&gt; RenderSnapshot[&quot;renderSnapshot(frames, page, maxChars)&quot;]
RenderSnapshot --&gt; Output[&quot;输出文本快照&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L522-L575" target="_blank" rel="noreferrer">src/content/page-interaction.js#L522-L575</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/page-snapshot-renderer.js#L144-L227" target="_blank" rel="noreferrer">src/shared/page-snapshot-renderer.js#L144-L227</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L522-L575" target="_blank" rel="noreferrer">src/content/page-interaction.js#L522-L575</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/shared/page-snapshot-renderer.js#L1-L228" target="_blank" rel="noreferrer">src/shared/page-snapshot-renderer.js#L1-L228</a></li></ul><h2 id="依赖关系分析" tabindex="-1">依赖关系分析 <a class="header-anchor" href="#依赖关系分析" aria-label="Permalink to &quot;依赖关系分析&quot;">​</a></h2><p>Content Script 内部模块依赖清晰：</p><ul><li><code>index.js</code> 作为入口，依赖所有工具模块。</li><li><code>page-tools.js</code> 依赖 <code>shadow-dom-utils.js</code> 和 <code>page-utils.js</code>。</li><li><code>page-extract.js</code> 依赖 <code>shadow-dom-utils.js</code> 和 <code>page-utils.js</code>。</li><li><code>page-interaction.js</code> 依赖 <code>shadow-dom-utils.js</code>、<code>page-utils.js</code> 和 <code>page-snapshot-renderer.js</code>。</li><li><code>interaction-tools.js</code> 依赖 <code>shadow-dom-utils.js</code>、<code>page-utils.js</code> 和 <code>page-interaction.js</code>。</li><li><code>advanced-tools.js</code> 依赖 <code>shadow-dom-utils.js</code>。</li><li><strong>新增</strong>：<code>selection-toolbar.js</code> 依赖 <code>shadow-dom-utils.js</code> 和 <code>selection-toolbar-styles.js</code>。</li></ul><pre class="mermaid">graph TB
Index[&quot;index.js&quot;] --&gt; PageTools[&quot;page-tools.js&quot;]
Index --&gt; PageExtract[&quot;page-extract.js&quot;]
Index --&gt; PageInteraction[&quot;page-interaction.js&quot;]
Index --&gt; InteractionTools[&quot;interaction-tools.js&quot;]
Index --&gt; AdvancedTools[&quot;advanced-tools.js&quot;]
Index --&gt; SelectionToolbar[&quot;selection-toolbar.js&quot;]
PageTools --&gt; ShadowUtils[&quot;shadow-dom-utils.js&quot;]
PageTools --&gt; PageUtils[&quot;page-utils.js&quot;]
PageExtract --&gt; ShadowUtils
PageExtract --&gt; PageUtils
PageInteraction --&gt; ShadowUtils
PageInteraction --&gt; PageUtils
PageInteraction --&gt; SnapshotRenderer[&quot;page-snapshot-renderer.js&quot;]
InteractionTools --&gt; ShadowUtils
InteractionTools --&gt; PageUtils
InteractionTools --&gt; PageInteraction
AdvancedTools --&gt; ShadowUtils
SelectionToolbar --&gt; ShadowUtils
SelectionToolbar --&gt; ToolbarStyles[&quot;selection-toolbar-styles.js&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L3-L33" target="_blank" rel="noreferrer">src/content/index.js#L3-L33</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-tools.js#L5-L7" target="_blank" rel="noreferrer">src/content/page-tools.js#L5-L7</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-extract.js#L4-L6" target="_blank" rel="noreferrer">src/content/page-extract.js#L4-L6</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L4-L7" target="_blank" rel="noreferrer">src/content/page-interaction.js#L4-L7</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/interaction-tools.js#L3-L6" target="_blank" rel="noreferrer">src/content/interaction-tools.js#L3-L6</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L3-L4" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L3-L4</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L3-L4" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L3-L4</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L3-L33" target="_blank" rel="noreferrer">src/content/index.js#L3-L33</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-tools.js#L5-L7" target="_blank" rel="noreferrer">src/content/page-tools.js#L5-L7</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-extract.js#L4-L6" target="_blank" rel="noreferrer">src/content/page-extract.js#L4-L6</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L4-L7" target="_blank" rel="noreferrer">src/content/page-interaction.js#L4-L7</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/interaction-tools.js#L3-L6" target="_blank" rel="noreferrer">src/content/interaction-tools.js#L3-L6</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L3-L4" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L3-L4</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L3-L4" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L3-L4</a></li></ul><h2 id="性能优化与内存管理" tabindex="-1">性能优化与内存管理 <a class="header-anchor" href="#性能优化与内存管理" aria-label="Permalink to &quot;性能优化与内存管理&quot;">​</a></h2><ul><li><strong>防抖节流</strong>：<code>autoWaitAfterAction</code> 使用最小等待和稳定计数，避免频繁轮询。</li><li><strong>批量操作</strong>：<code>fillForm</code> 批量填充表单字段，返回每个字段的处理结果。</li><li><strong>内存管理</strong>：<code>elementRegistry.clear()</code> 每次快照重建，<code>WeakMap</code> 允许元素 GC 后编号退役。</li><li><strong>DOM 签名</strong>：<code>getDomSignature</code> 轻量签名，检测导航和 DOM 变化。</li><li><strong>快照渲染预算</strong>：<code>renderSnapshot</code> 使用 <code>maxChars</code> 控制输出长度，避免大页面阻塞。</li><li><strong>新增</strong>：浮层遮挡检测使用采样点策略，避免全量扫描提升性能。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;autoWaitAfterAction(sigBefore, minWait, maxWait)&quot;]) --&gt; MinWait[&quot;等待 minWait&quot;]
MinWait --&gt; CheckSig[&quot;计算 getDomSignature()&quot;]
CheckSig --&gt; Changed{&quot;签名变化?&quot;}
Changed --&gt; |是| ResetStable[&quot;stableCount = 0&quot;]
Changed --&gt; |否| IncStable[&quot;stableCount++&quot;]
ResetStable --&gt; Loop{&quot;stableCount &gt;= 2?&quot;}
IncStable --&gt; Loop
Loop --&gt; |否| WaitNext[&quot;等待 100ms&quot;]
Loop --&gt; |是| ReturnResult[&quot;返回 {changed, urlChanged, domChanged, waitedMs}&quot;]
WaitNext --&gt; CheckSig
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-utils.js#L190-L245" target="_blank" rel="noreferrer">src/content/page-utils.js#L190-L245</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-utils.js#L190-L245" target="_blank" rel="noreferrer">src/content/page-utils.js#L190-L245</a></li></ul><h2 id="安全考虑" tabindex="-1">安全考虑 <a class="header-anchor" href="#安全考虑" aria-label="Permalink to &quot;安全考虑&quot;">​</a></h2><ul><li><strong>XSS 防护</strong>：<code>sanitizeInjectedCss</code> 过滤危险 CSS 构造，防止脚本执行和数据外泄。</li><li><strong>权限最小化</strong>：Manifest 仅声明必要权限，如 <code>activeTab</code>、<code>storage</code>、<code>scripting</code> 等。</li><li><strong>恶意内容检测</strong>：<code>searchInPage</code> 使用正则转义，避免注入恶意模式；<code>highlightTextMatches</code> 仅包裹文本节点，不修改元素结构。</li><li><strong>上下文失效保护</strong>：全局 <code>error</code> 和 <code>unhandledrejection</code> 监听屏蔽 <code>Extension context invalidated</code> 错误。</li><li><strong>新增</strong>：Popover API 相关的安全考虑，确保 UA 默认样式不会覆盖组件自身样式。</li></ul><pre class="mermaid">flowchart TD
Start([&quot;sanitizeInjectedCss(css)&quot;]) --&gt; FilterImport[&quot;过滤 @import&quot;]
FilterImport --&gt; FilterUrl[&quot;过滤 url()&quot;]
FilterUrl --&gt; FilterExpression[&quot;过滤 expression()&quot;]
FilterExpression --&gt; FilterMozElement[&quot;过滤 -moz-element()&quot;]
FilterMozElement --&gt; FilterBehavior[&quot;过滤 behavior&quot;]
FilterBehavior --&gt; ReturnSafe[&quot;返回安全 CSS&quot;]
</pre><p><strong>图表来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L357-L371" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L357-L371</a></li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L357-L371" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L357-L371</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L249-L262" target="_blank" rel="noreferrer">src/content/index.js#L249-L262</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json#L7-L32" target="_blank" rel="noreferrer">manifest.json#L7-L32</a></li></ul><h2 id="故障排查指南" tabindex="-1">故障排查指南 <a class="header-anchor" href="#故障排查指南" aria-label="Permalink to &quot;故障排查指南&quot;">​</a></h2><ul><li><strong>Content Script 未注入</strong>：检查 <code>manifest.json</code> 的 <code>content_scripts</code> 配置，确认 <code>matches</code> 和 <code>run_at</code>。</li><li><strong>消息无响应</strong>：检查 <code>HANDLERS</code> 中是否有对应处理器，确认 <code>ASYNC_HANDLERS</code> 是否正确标记。</li><li><strong>ref 解析失败</strong>：调用 <code>query_elements</code> 重新获取快照，检查 <code>elementRegistry</code> 是否过期。</li><li><strong>Shadow DOM 无法访问</strong>：确认目标元素是否在 Shadow DOM 内，使用 <code>deepQuerySelector</code> 而非原生 <code>querySelector</code>。</li><li><strong>样式注入无效</strong>：检查 <code>sanitizeInjectedCss</code> 是否过滤了关键 CSS，确认 <code>injectMode</code> 是否合法。</li><li><strong>新增</strong>：工具栏显示问题，检查 Popover API 支持情况和遮挡检测逻辑。</li><li><strong>新增</strong>：z-index 冲突问题，确认工具栏是否正确使用 top layer 机制。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/manifest.json#L36-L45" target="_blank" rel="noreferrer">manifest.json#L36-L45</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L91-L193" target="_blank" rel="noreferrer">src/content/index.js#L91-L193</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-interaction.js#L89-L152" target="_blank" rel="noreferrer">src/content/page-interaction.js#L89-L152</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/shadow-dom-utils.js#L12-L45" target="_blank" rel="noreferrer">src/content/shadow-dom-utils.js#L12-L45</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/advanced-tools.js#L373-L456" target="_blank" rel="noreferrer">src/content/advanced-tools.js#L373-L456</a></li><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/selection-toolbar.js#L230-L294" target="_blank" rel="noreferrer">src/content/selection-toolbar.js#L230-L294</a></li></ul><h2 id="结论" tabindex="-1">结论 <a class="header-anchor" href="#结论" aria-label="Permalink to &quot;结论&quot;">​</a></h2><p>Content Script 注入机制通过 Manifest 配置、消息路由表、工具模块化和 Shadow DOM 穿透技术，实现了安全、高效、可扩展的页面交互能力。<strong>新增的选择工具栏顶层层管理机制</strong>进一步增强了在现代网页环境中的兼容性和用户体验。其设计强调：</p><ul><li>清晰的模块职责分离。</li><li>稳定的元素引用机制。</li><li>安全的样式注入和内容过滤。</li><li><strong>新增</strong>：先进的浮层层级管理和遮挡检测。</li><li>高性能的异步处理和内存管理。</li><li>完善的错误处理和故障恢复。</li></ul><p>这些特性使得 Content Script 能够应对复杂的现代网页结构，同时保证安全性和性能，特别是在飞书等高复杂度宿主应用中表现出色。</p><h2 id="附录-开发新页面工具实践" tabindex="-1">附录：开发新页面工具实践 <a class="header-anchor" href="#附录-开发新页面工具实践" aria-label="Permalink to &quot;附录：开发新页面工具实践&quot;">​</a></h2><h3 id="步骤一-定义工具函数" tabindex="-1">步骤一：定义工具函数 <a class="header-anchor" href="#步骤一-定义工具函数" aria-label="Permalink to &quot;步骤一：定义工具函数&quot;">​</a></h3><p>在对应模块中定义工具函数，例如在 <code>page-tools.js</code> 中添加 <code>myNewTool</code>。</p><div class="language-javascript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">javascript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">export</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> function</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> myNewTool</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">options</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) {</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // 实现逻辑</span></span>
<span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">  return</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> { success: </span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;">true</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">, data: result };</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">}</span></span></code></pre></div><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/page-tools.js#L56-L85" target="_blank" rel="noreferrer">src/content/page-tools.js#L56-L85</a></li></ul><h3 id="步骤二-注册消息处理器" tabindex="-1">步骤二：注册消息处理器 <a class="header-anchor" href="#步骤二-注册消息处理器" aria-label="Permalink to &quot;步骤二：注册消息处理器&quot;">​</a></h3><p>在 <code>index.js</code> 的 <code>HANDLERS</code> 中注册新工具。</p><div class="language-javascript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">javascript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> HANDLERS</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;"> {</span></span>
<span class="line"><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;">  MY_NEW_TOOL</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">: (</span><span style="--shiki-light:#E36209;--shiki-dark:#FFAB70;">msg</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">) </span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">=&gt;</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> myNewTool</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">(msg),</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // ... 其他处理器</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">};</span></span></code></pre></div><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L91-L181" target="_blank" rel="noreferrer">src/content/index.js#L91-L181</a></li></ul><h3 id="步骤三-处理异步操作" tabindex="-1">步骤三：处理异步操作 <a class="header-anchor" href="#步骤三-处理异步操作" aria-label="Permalink to &quot;步骤三：处理异步操作&quot;">​</a></h3><p>如果工具是异步的，添加到 <code>ASYNC_HANDLERS</code>。</p><div class="language-javascript vp-adaptive-theme"><button title="Copy Code" class="copy"></button><span class="lang">javascript</span><pre class="shiki shiki-themes github-light github-dark vp-code" tabindex="0"><code><span class="line"><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;">const</span><span style="--shiki-light:#005CC5;--shiki-dark:#79B8FF;"> ASYNC_HANDLERS</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> =</span><span style="--shiki-light:#D73A49;--shiki-dark:#F97583;"> new</span><span style="--shiki-light:#6F42C1;--shiki-dark:#B392F0;"> Set</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">([</span></span>
<span class="line"><span style="--shiki-light:#032F62;--shiki-dark:#9ECBFF;">  &#39;MY_NEW_TOOL&#39;</span><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">,</span></span>
<span class="line"><span style="--shiki-light:#6A737D;--shiki-dark:#6A737D;">  // ... 其他异步工具</span></span>
<span class="line"><span style="--shiki-light:#24292E;--shiki-dark:#E1E4E8;">]);</span></span></code></pre></div><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L183-L193" target="_blank" rel="noreferrer">src/content/index.js#L183-L193</a></li></ul><h3 id="步骤四-测试与调试" tabindex="-1">步骤四：测试与调试 <a class="header-anchor" href="#步骤四-测试与调试" aria-label="Permalink to &quot;步骤四：测试与调试&quot;">​</a></h3><ul><li>使用 Chrome DevTools 的 Console 面板调试 Content Script。</li><li>通过 <code>chrome.runtime.sendMessage</code> 发送测试消息。</li><li>检查控制台日志和返回值。</li></ul><p><strong>章节来源</strong></p><ul><li><a href="https://github.com/xiweicheng/ai-helper/blob/main/src/content/index.js#L209-L246" target="_blank" rel="noreferrer">src/content/index.js#L209-L246</a></li></ul>`,145)])])}const u=t(a,[["render",i]]);export{p as __pageData,u as default};
