import{n as e,r as t}from"./constants-rV7rKHem.js";import{D as n,E as r,O as i,S as a,T as o,_ as s,a as c,b as l,d as u,f as d,j as f,m as p,n as m,o as h,p as g,r as _,s as v,t as y,v as b,w as x,x as S,y as C}from"./token-store-C2dRZv7v.js";var w=new Set,T=[],E=`deepseek-v4-pro`,D=null,ee=[],te=!0,O=!0,ne=!1,re=null,ie=``,ae=``,oe=[],se=-1,ce=null,k=``,le=[],ue=-1,de=null,fe=[],pe={platformName:`Unknown`,platform:`unknown`,arch:`unknown`,shell:`/bin/sh`,homeDir:`/home/user`,workdir:``,connected:!1},me={maxInputHistory:20,maxHistoryMessages:50,maxMessageLength:1e5,maxMemoryMessages:20,enableExecutionLog:!1,contextWindow:0},he=.2,ge=1,_e=0,ve=`all`,ye=``,be=[],xe={},Se=new Map,Ce=null,we=new Map,A=new Set,Te=new Map,Ee=null,De=null,Oe=null,ke=null,Ae=null,j=18e4,je=null,Me=!1,Ne=null,Pe=``,Fe=null,Ie=0,Le=0,Re=-1,ze=!1,Be=``,Ve=``,He=``,Ue=[],We=!1,M={get isGenerating(){return w.has(D)},set isGenerating(e){e?w.add(D):w.delete(D),document.dispatchEvent(new CustomEvent(`generating-state-changed`))},get generatingSessionIds(){return w},get messageHistory(){return T},set messageHistory(e){T=e},get currentModel(){return E},set currentModel(e){E=e},get activeSessionId(){return D},set activeSessionId(e){D=e},get sessions(){return ee},set sessions(e){ee=e},get useTools(){return te},set useTools(e){te=e},get isolateChat(){return O},set isolateChat(e){O=e},get enableSelectionQuery(){return ne},set enableSelectionQuery(e){ne=e},get currentTabId(){return re},set currentTabId(e){re=e},get selectedContextText(){return ie},set selectedContextText(e){ie=e},get quotedContextText(){return ae},set quotedContextText(e){ae=e},get customPrompts(){return oe},set customPrompts(e){oe=e},get selectedPromptIndex(){return se},set selectedPromptIndex(e){se=e},get draggedItemIndex(){return ce},set draggedItemIndex(e){ce=e},get systemPrompt(){return k},set systemPrompt(e){k=e},get activeAgentId(){return de},set activeAgentId(e){de=e},get customAgents(){return fe},set customAgents(e){fe=e},get agentPlatform(){return pe},set agentPlatform(e){Object.assign(pe,e)},get inputHistory(){return le},set inputHistory(e){le=e},get inputHistoryIndex(){return ue},set inputHistoryIndex(e){ue=e},get chatConfig(){return me},set chatConfig(e){me=e},get temperature(){return he},set temperature(e){he=e},get topP(){return ge},set topP(e){ge=e},get selectedTempIndex(){return _e},set selectedTempIndex(e){_e=e},get currentCategory(){return ve},set currentCategory(e){ve=e},get currentSearch(){return ye},set currentSearch(e){ye=e},get enabledTools(){return be},set enabledTools(e){be=e},get collapsedCategories(){return xe},get sessionExecutionStatus(){return Se},set sessionExecutionStatus(e){Se=e},get currentExecutionStatus(){return Se.get(D)||null},set currentExecutionStatus(e){e===null?Se.delete(D):Se.set(D,e)},get executionLogListener(){return Ce},set executionLogListener(e){Ce=e},get pendingCancelApi(){return we.get(D)||null},set pendingCancelApi(e){e===null?we.delete(D):we.set(D,e)},get pendingCancelApiMap(){return we},get pendingCallApiSessionIds(){return A},set pendingCallApiSessionIds(e){A=e},get substituteLoadingIds(){return Te},set substituteLoadingIds(e){Te=e},get currentClarifyToolCallId(){return Ee},set currentClarifyToolCallId(e){Ee=e},get currentClarifySessionId(){return De},set currentClarifySessionId(e){De=e},get currentConfirmToolCallId(){return Oe},set currentConfirmToolCallId(e){Oe=e},get currentConfirmSessionId(){return ke},set currentConfirmSessionId(e){ke=e},get clarifyTimerInterval(){return Ae},set clarifyTimerInterval(e){Ae=e},get clarifyTimeoutValue(){return j},set clarifyTimeoutValue(e){j=e},get messageTocContainer(){return je},set messageTocContainer(e){je=e},get isMouseOverToc(){return Me},set isMouseOverToc(e){Me=e},get tocHideTimer(){return Ne},set tocHideTimer(e){Ne=e},get lastSelectedText(){return Pe},set lastSelectedText(e){Pe=e},get currentSelectionRange(){return Fe},set currentSelectionRange(e){Fe=e},get lastMouseX(){return Ie},set lastMouseX(e){Ie=e},get lastMouseY(){return Le},set lastMouseY(e){Le=e},get pendingDeleteIndex(){return Re},set pendingDeleteIndex(e){Re=e},get enableImageInput(){return ze},set enableImageInput(e){ze=e},get imageModelName(){return Be},set imageModelName(e){Be=e},get imageApiBase(){return Ve},set imageApiBase(e){Ve=e},get imageApiKey(){return He},set imageApiKey(e){He=e},get attachedImages(){return Ue},set attachedImages(e){Ue=e},get isScrolling(){return We},set isScrolling(e){We=e}},Ge=t,N=[{label:`精准编码`,temp:.2,topP:1,tip:`较低随机性，适合业务开发、调试、纠错`},{label:`均衡开发`,temp:.45,topP:.9,tip:`兼顾稳定性，用于封装工具类、常规脚本`},{label:`架构探索`,temp:.65,topP:.9,tip:`提供多种实现思路，用于组件重构、方案对比`},{label:`创意发散`,temp:.9,topP:.9,tip:`随机性较高，仅用于原型探索，不建议生产代码`}],Ke={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,content_extraction:`📄 内容提取`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_output:`📷 媒体与输出`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,local_agent:`🖥️ 本地Agent`},qe=[{id:`default`,name:`默认助手`,description:`全能 AI 助手，拥有所有工具能力`,icon:`🤖`,systemPrompt:null,toolIds:null,isBuiltin:!0,allowSubDispatch:!1,model:null,temperature:null,topP:null}],Je=[{name:`代码审查专家`,icon:`🔍`,description:`专注于代码审查与质量保证`,systemPrompt:`你是一个资深的代码审查专家(Code Review Expert)。你的职责是：
1. 审查代码的逻辑正确性、性能和安全性
2. 检查代码风格、命名规范和最佳实践
3. 识别潜在的 Bug、内存泄漏、并发问题
4. 提出可落地的改进建议，并给出示例代码

回答原则：
- 始终指出问题的严重程度（严重/中等/建议）
- 给出具体的代码修改建议，不要空泛评价
- 关注可维护性，而不仅仅是功能正确性`,toolIds:[`get_page_text`,`search_bookmarks`,`search_history`,`agent_read_file`,`agent_search_content`,`agent_search_files`,`agent_list_dir`,`search_conversation_memory`],allowSubDispatch:!1},{name:`网页自动化助手`,icon:`🌐`,description:`专注于网页交互和自动化操作`,systemPrompt:`你是一个网页自动化操作专家。你擅长：
1. 根据用户需求自动操作网页（点击、填表、滚动等）
2. 提取和分析网页内容
3. 处理多步骤的网页交互流程

操作原则：
- 先理解页面结构再操作，优先使用 query_interactive_elements
- 操作后验证结果，确保操作生效
- 遇到错误要分析原因并尝试替代方案
- 不要假设元素存在，不确定时先获取页面信息`,toolIds:[`get_page_text`,`get_full_html`,`query_interactive_elements`,`click_element`,`fill_form`,`scroll_to`,`wait_for_element`,`keyboard_input`,`select_dropdown`,`capture_tab_screenshot`,`extract_table`,`extract_links`,`extract_forms`,`search_in_page`,`get_element_count`,`hover_element`,`wait_for_navigation`,`scroll_and_collect`,`drag_and_drop`],allowSubDispatch:!1},{name:`数据分析师`,icon:`📊`,description:`专注于数据提取、分析和可视化`,systemPrompt:`你是一个数据分析师。你擅长：
1. 从网页中提取结构化数据（表格、列表、JSON）
2. 分析和总结数据模式
3. 以清晰的格式呈现分析结果

分析原则：
- 先了解数据结构再开始分析
- 优先使用最合适的提取工具（表格用 extract_table，结构化数据用 page_to_json）
- 分析结果要有数据支撑，不要主观臆断
- 用表格或图表方式呈现分析结论`,toolIds:[`get_page_text`,`extract_table`,`extract_links`,`extract_images`,`extract_forms`,`extract_metadata`,`page_to_json`,`page_to_markdown`,`find_similar_elements`,`get_element_count`,`search_in_page`,`scroll_and_collect`,`fetch_url`],allowSubDispatch:!1},{name:`文档撰写助手`,icon:`📝`,description:`专注于技术文档编写和内容组织`,systemPrompt:`你是一个技术文档撰写专家。你擅长：
1. 撰写清晰的技术文档（API 文档、README、使用指南）
2. 提炼和总结技术信息
3. 将复杂概念转化为易懂的文档

撰写原则：
- 结构清晰：使用标题、列表、表格等组织内容
- 示例优先：关键概念必须配代码或配置示例
- 面向读者：根据目标读者调整技术深度
- 保持简洁：避免冗余，每段话都要有信息量`,toolIds:[`get_page_text`,`page_to_markdown`,`copy_to_clipboard`,`search_bookmarks`,`search_history`,`search_conversation_memory`],allowSubDispatch:!1}];function Ye(){return`agent_`+Date.now().toString(36)+`_`+Math.random().toString(36).substring(2,6)}var P=`customAgents`,F=`activeAgentId`;async function Xe(){let e=(await chrome.storage.local.get([P]))[P]||[];return[...qe,...e]}async function Ze(){return(await chrome.storage.local.get([P]))[P]||[]}async function Qe(e){return e&&(await Xe()).find(t=>t.id===e)||null}async function $e(e){let t=await Ze(),n={id:Ye(),name:e.name||`未命名Agent`,description:e.description||``,icon:e.icon||`🤖`,systemPrompt:e.systemPrompt||``,toolIds:e.toolIds||null,isBuiltin:!1,allowSubDispatch:e.allowSubDispatch===void 0?!1:e.allowSubDispatch,model:e.model||null,temperature:e.temperature===void 0?null:e.temperature,topP:e.topP===void 0?null:e.topP,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return t.push(n),await chrome.storage.local.set({[P]:t}),n}async function et(e,t){let n=await Ze(),r=n.findIndex(t=>t.id===e);return r===-1?null:(n[r]={...n[r],...t,id:e,isBuiltin:!1,updatedAt:new Date().toISOString()},await chrome.storage.local.set({[P]:n}),n[r])}async function tt(e){let t=await Ze(),n=t.findIndex(t=>t.id===e);return n===-1?!1:(t.splice(n,1),await chrome.storage.local.set({[P]:t}),(await chrome.storage.local.get([F]))[F]===e&&await chrome.storage.local.remove(F),!0)}async function nt(){return(await chrome.storage.local.get([F]))[F]||null}async function rt(e){e?await chrome.storage.local.set({[F]:e}):await chrome.storage.local.remove(F)}function I(e,t=`info`,n=3e3){let r=document.getElementById(`toastContainer`);if(!r)return;let i=document.createElement(`div`);i.className=`toast ${t}`,i.textContent=e,r.appendChild(i),requestAnimationFrame(()=>{i.classList.add(`toast-show`)}),setTimeout(()=>{i.classList.remove(`toast-show`),setTimeout(()=>{i.parentNode&&i.parentNode.removeChild(i)},300)},n)}function it(){let e=document.getElementById(`userInput`);e&&(e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,100)+`px`)}function L(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function at(e){return!e||e<0?`0ms`:e<1e3?`${Math.round(e)}ms`:e<6e4?`${(e/1e3).toFixed(1)}s`:`${Math.floor(e/6e4)}分${(e%6e4/1e3).toFixed(1)}秒`}function ot(e,t){navigator.clipboard.writeText(e).then(()=>{let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(n=>{console.error(`[SidePanel] 复制失败:`,n);let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{I(`复制失败`,`error`)}document.body.removeChild(r)})}async function st(e=null){let t=new Date().toLocaleString(`zh-CN`),n=``;if(M.agentPlatform&&M.agentPlatform.connected){let e=M.agentPlatform;n=`\n- 本地 Agent：${e.platformName} (${e.arch})，默认 shell: ${e.shell}，工作目录: ${e.workdir||`未设置`}`}let r=``;e&&e.allowSubDispatch&&(r=`
  
## Sub-Agent 调度
你可以使用 dispatch_sub_agent 工具将子任务分派给其他专业 Agent 执行。每个子 Agent 拥有独立的角色定义和工具集。
使用场景：复杂任务需要不同领域的专业能力时（如代码审查 + 文档撰写）。
调用方式：在一次响应中可并行调用多个 dispatch_sub_agent。

当前可用的子 Agent：
${(await Xe()).filter(t=>t.allowSubDispatch&&t.id!==(e.id||``)).map(e=>`- **${e.id}** (${e.icon} ${e.name}): ${e.description||`无描述`}`).join(`
`)||`（暂无可用子 Agent，请先在 Agent 管理中创建并启用 Sub-Agent 调度）`}`);let i=M.useTools?`

## 任务拆解规则
1. **任务大小判断**：
   - 简单任务（单一操作，如"点击按钮"、"获取页面文本"）：直接执行，不拆解
   - 中等任务（需要2-3个步骤，如"登录网站"）：根据复杂度决定是否拆解
   - 复杂任务（多个步骤、有依赖关系、需要多种工具，如"爬取多个页面并汇总数据"）：必须拆解

2. **拆解原则**：
   - 将大任务分解为2-5个独立子任务
   - 每个子任务应有明确的目标和输出
   - 识别子任务之间的依赖关系
   - 为每个子任务筛选所需的工具集

3. **工具集筛选**：
   - 仔细分析每个子任务的需求
   - 只选择完成该子任务真正需要的工具
   - 避免携带无关工具，减少Token消耗

4. **调用 plan_task 工具**：
   - 当判断需要拆解任务时，调用 plan_task 工具
   - 提供完整的子任务列表，包含ID、名称、描述、依赖和所需工具
   - 指定执行策略：sequential（顺序执行）、parallel（并行执行）或 conditional（条件执行）`:``,a;return a=e&&e.systemPrompt&&e.systemPrompt.trim()?e.systemPrompt:M.systemPrompt&&M.systemPrompt.trim()?M.systemPrompt:null,a?`${a}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${t}${n}${i}${r}
`:`你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题${M.useTools?`
- **任务规划**：能够将复杂任务拆解为多个子任务，规划执行顺序和所需工具`:``}${i}${r}

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理${M.useTools?`
6. **任务驱动**：复杂任务先规划后执行，使用 plan_task 工具进行拆解`:``}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${t}${n}
`}function ct(){return new Promise(e=>{chrome.storage.local.get([`temperature`,`topP`],t=>{e({temperature:t.temperature===void 0?parseFloat(M.temperature.toFixed(2)):parseFloat(t.temperature.toFixed(2)),top_p:t.topP===void 0?parseFloat(M.topP.toFixed(2)):parseFloat(t.topP.toFixed(2))})})})}function lt(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(M.chatConfig=t,console.log(`[SidePanel] 对话配置已加载:`,M.chatConfig)),e(t)})})}async function ut(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(M.chatConfig=t,console.log(`[SidePanel] 同步加载对话配置:`,M.chatConfig)),e()})})}async function dt(){return new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>{t&&t.length>0&&t[0].id?(M.currentTabId=t[0].id,console.log(`[SidePanel] 获取当前 Tab ID:`,M.currentTabId,`URL:`,t[0].url),e(M.currentTabId)):(console.warn(`[SidePanel] 未获取到有效的 Tab ID`),e(null))})})}function ft(){return new Promise(e=>{chrome.storage.local.get([`reactMaxIterations`,`reactApiTimeout`,`reactLoopTimeout`,`reactToolTimeout`,`reactClarifyTimeout`],t=>{e({maxIterations:t.reactMaxIterations||30,apiTimeout:t.reactApiTimeout||6e4,loopTimeout:t.reactLoopTimeout||3e5,toolTimeout:t.reactToolTimeout||3e4,clarifyTimeout:t.reactClarifyTimeout||18e4})})})}function pt(e){if(!e||!e.trim()||e.trim()==`/`)return;let t=e.trim(),n=M.inputHistory.indexOf(t);n!==-1&&M.inputHistory.splice(n,1),M.inputHistory.push(t),M.inputHistory.length>M.chatConfig.maxInputHistory&&M.inputHistory.shift(),mt()}function mt(){try{chrome.storage.local.set({inputHistory:M.inputHistory}),console.log(`[SidePanel] 输入历史已保存，数量:`,M.inputHistory.length)}catch(e){console.error(`[SidePanel] 保存输入历史失败:`,e)}}function ht(){document.addEventListener(`mouseover`,gt,!0),document.addEventListener(`mouseout`,_t,!0),console.log(`[SidePanel] 消息目录功能已初始化`)}function gt(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){M.isMouseOverToc=!0;return}let t=e.target.closest(`.message.assistant`);if(!t)return;let n=t.querySelectorAll(`.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6`);if(n.length===0){yt();return}vt(t,n)}function _t(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){M.isMouseOverToc=!1,M.tocHideTimer&&=(clearTimeout(M.tocHideTimer),null);return}if(!e.target.closest(`.message.assistant`))return;let t=e.relatedTarget;t&&(t.closest(`.message-toc-container`)||t.closest(`.message.assistant`))||M.isMouseOverToc||(M.tocHideTimer&&clearTimeout(M.tocHideTimer),M.tocHideTimer=setTimeout(()=>{M.isMouseOverToc||yt(),M.tocHideTimer=null},800))}function vt(e,t){let n=Array.from(t);M.messageTocContainer&&yt(),n.forEach((e,t)=>{e.id||=`toc-heading-${Date.now()}-${t}`});let r=document.createElement(`div`);r.className=`message-toc-container`,r.dataset.headingsCount=n.length;let i=0,a=n.map(e=>{let t=parseInt(e.tagName.charAt(1)),n=e.textContent.trim(),r=n.length>30?n.substring(0,30)+`...`:n,a=`H${t}`;return i++,`
      <li class="message-toc-item level-${t}" 
          data-target="${e.id}"
          data-anchor="${a}"
          title="${n}">
        <span class="toc-anchor">${a}</span>
        <span class="toc-text">${r}</span>
      </li>
    `}).join(``);r.innerHTML=`
    <button class="message-toc-toggle" title="显示目录（H${t.length}个标题）">
      ☰
    </button>
    <div class="message-toc-panel">
      <div class="message-toc-header">
        <span>☰</span>
        <span>目录</span>
        <span style="margin-left: auto; font-weight: normal; color: #999; font-size: 11px;">${t.length} 个</span>
      </div>
      <div class="message-toc-content">
        <ul class="message-toc-list">
          ${a}
        </ul>
      </div>
    </div>
  `,document.body.appendChild(r),M.messageTocContainer=r;let o=e.getBoundingClientRect(),s=window.innerWidth-280;o.right<s&&(r.style.left=o.right+`px`,r.style.right=`0`,r.style.width=`auto`);let c=r.querySelector(`.message-toc-toggle`),l=r.querySelector(`.message-toc-panel`);c.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),c.addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),l.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),r.querySelectorAll(`.message-toc-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.target,n=document.getElementById(t);n&&(n.scrollIntoView({behavior:`smooth`,block:`start`}),n.classList.add(`toc-highlight`),setTimeout(()=>{n.classList.remove(`toc-highlight`)},1500))})})}function yt(){M.tocHideTimer&&=(clearTimeout(M.tocHideTimer),null),M.messageTocContainer&&=(M.messageTocContainer.remove(),null)}function bt(e){return`${Math.floor(e/60)}:${(e%60).toString().padStart(2,`0`)}`}function xt(e=`default`){try{let t=new(window.AudioContext||window.webkitAudioContext),n=t.createOscillator(),r=t.createGain();n.connect(r),r.connect(t.destination);let i={default:{frequency:800,duration:.3},success:{frequency:523,duration:.2},warning:{frequency:440,duration:.4},error:{frequency:220,duration:.5}},a=i[e]||i.default;n.frequency.value=a.frequency,n.type=`sine`,r.gain.setValueAtTime(.3,t.currentTime),r.gain.exponentialRampToValueAtTime(.01,t.currentTime+a.duration),n.start(t.currentTime),n.stop(t.currentTime+a.duration),console.log(`[SidePanel] 提示音已播放:`,e)}catch(e){console.error(`[SidePanel] 播放提示音失败:`,e.message)}}function St(e,t){let n=document.getElementById(`clarifyTimer`),r=document.getElementById(`clarifyTimerText`);if(!n||!r)return;r.textContent=`剩余时间: ${bt(e)}`;let i=e/t*100;n.classList.remove(`warning`,`critical`),e<=10?(n.classList.add(`critical`),r.textContent=`即将超时: ${bt(e)}`):(e<=30||i<=15)&&n.classList.add(`warning`),e===30&&xt(`warning`)}function Ct(e){wt(),M.clarifyTimeoutValue=e;let t=Math.ceil(e/1e3),n=t;St(n,t),M.clarifyTimerInterval=setInterval(()=>{n--,n<=0?wt():St(n,t)},1e3)}function wt(){M.clarifyTimerInterval&&=(clearInterval(M.clarifyTimerInterval),null)}function Tt(e){console.log(`[SidePanel] 显示澄清对话框:`,e);let{question:t,recommendedOption:n,allowCustomInput:r=!0,allowAdditionalInfo:i=!0,toolCallId:a,timeout:o=18e4,sessionId:s}=e,c=Array.isArray(e.options)?e.options:e.options?[String(e.options)]:[];M.currentClarifyToolCallId=a,M.currentClarifySessionId=s||null;let l=document.getElementById(`clarifySessionName`);if(l)if(s&&M.sessions){let e=M.sessions.find(e=>e.id===s);e?(l.textContent=`会话: ${e.title}`,l.style.display=`block`):(l.textContent=`会话: ${s.substring(0,8)}...`,l.style.display=`block`)}else l.textContent=``,l.style.display=`none`;let u=n!==void 0&&n>=0?n:0,d=[u],f=u,p=document.getElementById(`clarifyQuestion`);p&&(p.textContent=t);let m=document.getElementById(`clarifyOptionsList`);if(m&&(document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.remove()}),c.forEach((e,t)=>{let n=d.includes(t),r=document.createElement(`div`);r.className=`clarify-option-item ${f===t?`selected`:``} ${n?`recommended`:``}`,r.dataset.index=t,r.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${e}${n?`<span class="clarify-option-badge">推荐</span>`:``}</div>
      `,r.addEventListener(`click`,()=>Dt(t)),m.appendChild(r)}),r)){let e=document.createElement(`div`);e.className=`clarify-option-item`,e.dataset.index=-1,e.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `,e.addEventListener(`click`,()=>Dt(-1)),m.appendChild(e);let t=document.getElementById(`clarifyCustomInput`);t&&m.appendChild(t)}let h=document.getElementById(`clarifyCustomInput`);h&&h.classList.remove(`show`);let g=document.getElementById(`clarifyAdditionalInfo`);g&&g.classList.toggle(`show`,i);let _=document.getElementById(`clarifyCustomTextarea`);_&&(_.value=``);let v=document.getElementById(`clarifyAdditionalTextarea`);v&&(v.value=``);let y=document.getElementById(`clarifyOverlay`);y&&y.classList.add(`show`),Ct(o),console.log(`[SidePanel] 澄清对话框已显示`)}function Et(){let e=document.getElementById(`clarifyOverlay`);e&&e.classList.remove(`show`),M.currentClarifyToolCallId=null,M.currentClarifySessionId=null,wt(),console.log(`[SidePanel] 澄清对话框已隐藏`)}function Dt(e){document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.classList.remove(`selected`)});let t=document.querySelector(`.clarify-option-item[data-index="${e}"]`);t&&t.classList.add(`selected`);let n=document.getElementById(`clarifyCustomInput`);if(n)if(e===-1){n.classList.add(`show`);let e=document.getElementById(`clarifyCustomTextarea`);e&&e.focus()}else n.classList.remove(`show`);console.log(`[SidePanel] 选择澄清选项:`,e)}function Ot(){if(!M.currentClarifyToolCallId){console.error(`[SidePanel] 没有当前工具调用ID`);return}let e=-1;document.querySelectorAll(`.clarify-option-item`).forEach((t,n)=>{t.classList.contains(`selected`)&&(e=parseInt(t.dataset.index))});let t=document.getElementById(`clarifyCustomTextarea`),n=t?t.value.trim():``,r=document.getElementById(`clarifyAdditionalTextarea`),i=r?r.value.trim():``,a={type:`CLARIFY_RESPONSE`,toolCallId:M.currentClarifyToolCallId,selectedOption:e,customInput:n,additionalInfo:i};console.log(`[SidePanel] 发送澄清响应:`,a),chrome.runtime.sendMessage(a),Et()}function kt(){if(M.currentClarifyToolCallId){let e={type:`CLARIFY_RESPONSE`,toolCallId:M.currentClarifyToolCallId,selectedOption:-1,customInput:``,additionalInfo:``};chrome.runtime.sendMessage(e)}Et()}function At(){let e=document.getElementById(`clarifyConfirmBtn`);e&&e.addEventListener(`click`,Ot);let t=document.getElementById(`clarifyCancelBtn`);t&&t.addEventListener(`click`,kt),chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.type===`SHOW_CLARIFY_DIALOG`)console.log(`[SidePanel] 收到澄清请求:`,e,`当前激活会话:`,M.activeSessionId),Tt(e.data),n({success:!0});else if(e.type===`PLAY_NOTIFICATION_SOUND`)console.log(`[SidePanel] 收到播放提示音请求:`,e),xt(e.soundType),n({success:!0});else if(e.type===`CLARIFY_TIMEOUT`){if(console.log(`[SidePanel] 收到澄清超时通知:`,e),e.sessionId&&M.currentClarifySessionId&&e.sessionId!==M.currentClarifySessionId){console.log(`[SidePanel] 澄清超时来自其他会话，忽略`);return}let t=document.getElementById(`clarifyTimer`),n=document.getElementById(`clarifyTimerText`);t&&n&&(t.classList.remove(`warning`),t.classList.add(`critical`),n.textContent=`已超时`),xt(`error`)}}),console.log(`[SidePanel] 澄清对话框事件已初始化`)}var jt=null;function Mt(e){let{toolName:t,toolLabel:n,args:r,message:i,toolCallId:a,sessionId:o,timeout:s=3e4}=e;console.log(`[SidePanel] 显示确认对话框:`,t,e),M.currentConfirmToolCallId=a,M.currentConfirmSessionId=o||null;let c=document.getElementById(`confirmOverlay`);if(!c)return;document.getElementById(`confirmToolName`).textContent=n||t;let l=document.getElementById(`confirmArgsSummary`);if(l&&r){let e=Object.entries(r).filter(([e,t])=>t!=null&&t!==``).slice(0,5);e.length>0?(l.innerHTML=e.map(([e,t])=>`<span class="confirm-arg"><strong>${e}:</strong> ${typeof t==`string`?t.substring(0,50):JSON.stringify(t).substring(0,50)}</span>`).join(``),l.style.display=`block`):l.style.display=`none`}let u=document.getElementById(`confirmMessage`);return u&&(u.textContent=i||`模型请求执行操作: ${n||t}`),c.style.display=`flex`,new Promise(e=>{jt=e,setTimeout(()=>{jt&&(console.log(`[SidePanel] 确认对话框超时，自动拒绝`),Nt(!1))},s)})}function Nt(e){let t=document.getElementById(`confirmOverlay`);t&&(t.style.display=`none`),chrome.runtime.sendMessage({type:`TOOL_CONFIRMATION_RESPONSE`,toolCallId:M.currentConfirmToolCallId,confirmed:e,sessionId:M.currentConfirmSessionId}).catch(e=>{console.log(`[SidePanel] 发送确认响应失败:`,e.message)}),M.currentConfirmToolCallId=null,M.currentConfirmSessionId=null,jt&&=(jt(e),null)}function Pt(){let e=document.getElementById(`confirmApproveBtn`),t=document.getElementById(`confirmDenyBtn`);e&&e.addEventListener(`click`,()=>Nt(!0)),t&&t.addEventListener(`click`,()=>Nt(!1)),chrome.runtime.onMessage.addListener((e,t,n)=>e.type===`SHOW_CONFIRM_DIALOG`?(Mt(e.data),n({received:!0}),!1):!1)}var R=null,z=1,Ft=.25,It=2,Lt=.1;function Rt(e){let t=e.trim();return/^\s*<!DOCTYPE\s/i.test(t)||/^\s*<html[\s>]/i.test(t)?/<\/head>/i.test(t)?t.replace(/<\/head>/i,`<style>html,body{overflow:auto!important;height:auto!important;}</style></head>`):/<body[\s>]/i.test(t)?t.replace(/<body([\s>])/i,`<body$1<style>html,body{overflow:auto!important;height:auto!important;}</style>`):t:`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;overflow:auto;">${t}</body>
</html>`}function zt(e){console.log(`[SidePanel] 显示 UI 原型预览:`,e),R=e,rn();let t=document.getElementById(`prototypeTitle`),n=document.getElementById(`prototypeDescription`),r=document.getElementById(`prototypeIframe`);t&&(t.textContent=e.title||`UI 原型预览`),n&&(n.textContent=e.description||``,n.style.display=e.description?`block`:`none`),r&&e.html&&(r.srcdoc=Rt(e.html));let i=document.getElementById(`prototypeOverlay`);i&&i.classList.add(`show`),console.log(`[SidePanel] UI 原型预览弹窗已显示`)}function Bt(){let e=document.getElementById(`prototypeOverlay`);e&&e.classList.remove(`show`);let t=document.getElementById(`prototypeIframe`);t&&(t.srcdoc=``),R=null,console.log(`[SidePanel] UI 原型预览弹窗已隐藏`)}function Vt(){if(!R)return;let e=R.id,t=R.title||`原型`;Bt();let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 继续优化原型:`,e)}function Ht(){if(!R||!R.html){console.error(`[SidePanel] 没有可下载的原型`);return}let e=Rt(R.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t),r=document.createElement(`a`);r.href=n,r.download=(R.title||`prototype`).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)+`.html`,document.body.appendChild(r),r.click(),document.body.removeChild(r),URL.revokeObjectURL(n),console.log(`[SidePanel] 原型已下载:`,r.download)}function Ut(){if(!R||!R.html){console.error(`[SidePanel] 没有可打开的原型`);return}let e=Rt(R.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t);chrome.tabs.create({url:n,active:!0}),console.log(`[SidePanel] 原型已在新标签页打开`)}async function Wt(e){try{let t=await o(e);if(!t){console.error(`[SidePanel] 未找到原型:`,e);return}zt(t)}catch(e){console.error(`[SidePanel] 加载原型失败:`,e)}}async function Gt(){let e=document.getElementById(`prototypeLibraryList`),t=document.getElementById(`prototypeLibraryModal`);if(!(!e||!t)){e.innerHTML=`<div class="prototype-library-empty">加载中...</div>`;try{let e=await r();Kt(e),qt(e)}catch(t){console.error(`[SidePanel] 加载原型库失败:`,t),e.innerHTML=`<div class="prototype-library-empty">加载失败</div>`}t.classList.add(`show`),console.log(`[SidePanel] 原型库已显示`)}}function Kt(e){let t=document.getElementById(`prototypeLibraryList`);t&&(e.length===0?t.innerHTML=`<div class="prototype-library-empty">暂无原型</div>`:(t.innerHTML=e.map(e=>{let t=e.id.replace(`proto_`,``).slice(-6);return`
        <div class="prototype-library-item" data-id="${e.id}">
          <div class="prototype-library-item-info">
            <div class="prototype-library-item-title" title="${Qt(e.title)}">${Qt(e.title)}</div>
            ${e.description?`<div class="prototype-library-item-desc" title="${Qt(e.description)}">${Qt(e.description)}</div>`:`<div class="prototype-library-item-desc prototype-library-item-desc-empty">暂无描述</div>`}
            <div class="prototype-library-item-meta">
              <span class="prototype-library-item-id">ID: ${t}</span>
              <span class="prototype-library-item-time">${$t(e.createdAt)}</span>
            </div>
          </div>
          <div class="prototype-library-item-actions">
            <button class="prototype-library-item-open" title="打开">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <button class="prototype-library-item-optimize" data-id="${e.id}" title="继续优化">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>
            <button class="prototype-library-item-delete" data-id="${e.id}" title="删除">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `}).join(``),t.querySelectorAll(`.prototype-library-item`).forEach(e=>{let t=e.querySelector(`.prototype-library-item-info`),n=e.querySelector(`.prototype-library-item-open`),r=e.querySelector(`.prototype-library-item-optimize`),i=e.querySelector(`.prototype-library-item-delete`);t&&t.addEventListener(`click`,()=>{let t=e.dataset.id;Wt(t),Jt()}),n&&n.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.id;Wt(n),Jt()}),r&&r.addEventListener(`click`,t=>{t.stopPropagation();let n=r.dataset.id;Yt(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`),Jt()}),i&&i.addEventListener(`click`,t=>{t.stopPropagation();let n=i.dataset.id;Xt(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`)})})))}function qt(e){let t=()=>{let t=document.getElementById(`prototypeLibrarySearch`),n=document.getElementById(`prototypeLibrarySort`),r=(t?.value||``).trim().toLowerCase(),i=n?.value||`createdAt_desc`,a=e;r&&(a=e.filter(e=>(e.title||``).toLowerCase().includes(r)||(e.description||``).toLowerCase().includes(r)));let[o,s]=i.split(`_`);a=[...a].sort((e,t)=>{let n;return n=o===`title`?(e.title||``).localeCompare(t.title||``,`zh-CN`):(e.createdAt||0)-(t.createdAt||0),s===`desc`?-n:n}),Kt(a)},n=document.getElementById(`prototypeLibrarySearch`),r=document.getElementById(`prototypeLibrarySort`);if(n){let e=n.cloneNode(!0);n.parentNode.replaceChild(e,n),e.addEventListener(`input`,t)}if(r){let e=r.cloneNode(!0);r.parentNode.replaceChild(e,r),e.addEventListener(`change`,t)}}function Jt(){let e=document.getElementById(`prototypeLibraryModal`);e&&e.classList.remove(`show`),console.log(`[SidePanel] 原型库已隐藏`)}function Yt(e,t){let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 从原型库继续优化原型:`,e)}async function Xt(e,t){if(await Zt(`确认删除`,`确定删除原型 "${t}" 吗？此操作不可撤销。`,`删除`))try{await b(e),console.log(`[SidePanel] 原型已删除:`,e),Gt()}catch(e){console.error(`[SidePanel] 删除原型失败:`,e),alert(`删除失败: `+e.message)}}function Zt(e,t,n=`确认`){return new Promise(r=>{let i=document.getElementById(`genericConfirmModal`),a=document.getElementById(`genericConfirmTitle`),o=document.getElementById(`genericConfirmMessage`),s=document.getElementById(`genericConfirmOkBtn`),c=document.getElementById(`genericConfirmCancelBtn`);if(!i){r(confirm(t));return}a.textContent=e,o.textContent=t,s.textContent=n;let l=()=>{i.classList.remove(`show`),s.removeEventListener(`click`,u),c.removeEventListener(`click`,d)},u=()=>{l(),r(!0)},d=()=>{l(),r(!1)};s.addEventListener(`click`,u),c.addEventListener(`click`,d),i.classList.add(`show`)})}function Qt(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function $t(e){if(!e)return``;let t=new Date(e),n=new Date-t;return n<6e4?`刚刚`:n<36e5?Math.floor(n/6e4)+` 分钟前`:n<864e5?Math.floor(n/36e5)+` 小时前`:t.toLocaleDateString(`zh-CN`)}function en(e){z=Math.max(Ft,Math.min(It,e)),z=Math.round(z*100)/100;let t=document.getElementById(`prototypeIframe`),n=document.getElementById(`prototypeZoomLevel`);t&&(t.style.zoom=z),n&&(n.textContent=Math.round(z*100)+`%`,z===1?n.classList.remove(`zoomed`):n.classList.add(`zoomed`))}function tn(){en(z+Lt),an()}function nn(){en(z-Lt),an()}function rn(){en(1)}function an(){let e=document.getElementById(`prototypeZoomLevel`);e&&(e.classList.add(`flash`),setTimeout(()=>e.classList.remove(`flash`),150))}function on(e){!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.deltaY<0?tn():nn())}function sn(e){(e.ctrlKey||e.metaKey)&&e.key===`0`&&(e.preventDefault(),rn())}function cn(){let e=document.getElementById(`prototypeCloseBtn`);e&&e.addEventListener(`click`,Bt);let t=document.getElementById(`prototypeDownloadBtn`);t&&t.addEventListener(`click`,Ht);let n=document.getElementById(`prototypeOpenTabBtn`);n&&n.addEventListener(`click`,Ut);let r=document.getElementById(`prototypeContinueBtn`);r&&r.addEventListener(`click`,Vt);let i=document.getElementById(`prototypeZoomInBtn`);i&&i.addEventListener(`click`,tn);let a=document.getElementById(`prototypeZoomOutBtn`);a&&a.addEventListener(`click`,nn);let o=document.getElementById(`prototypeZoomLevel`);o&&o.addEventListener(`click`,rn);let s=document.getElementById(`prototypeContent`);s&&s.addEventListener(`wheel`,on,{passive:!1}),document.addEventListener(`keydown`,sn);let c=document.getElementById(`prototypeLibraryCloseBtn`);c&&c.addEventListener(`click`,Jt),chrome.runtime.onMessage.addListener((e,t,n)=>{e.type===`SHOW_UI_PROTOTYPE`&&(console.log(`[SidePanel] 收到显示原型请求:`,e),Wt(e.data.prototypeId),n({success:!0}))}),console.log(`[SidePanel] UI 原型模块事件已初始化`)}function ln(e){if(!e)return``;let t=[];e=e.replace(/```mermaid\n?([\s\S]*?)```/g,(e,n)=>{let r=t.length;return t.push(n.trim()),`%%MERMAID_BLOCK_${r}%%`});let n=[];e=e.replace(/```(\w*)\n?([\s\S]*?)```/g,(e,t,r)=>{let i=n.length;return n.push({language:t||`text`,content:r.trim()}),`%%CODE_BLOCK_${i}%%`});let r=[];e=e.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(e,t,n,i)=>{let a=r.length;return r.push({header:t,separator:n,body:i,full:e.trim()}),`\n%%TABLE_BLOCK_${a}%%\n`});let i=``;return typeof marked<`u`?(marked.setOptions({breaks:!0,gfm:!0}),i=marked.parse(e)):i=e.replace(/`([^`]+)`/g,`<code>$1</code>`).replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`).replace(/\*([^*]+)\*/g,`<em>$1</em>`).replace(/\n/g,`<br>`),t.forEach((e,t)=>{i=i.replace(`%%MERMAID_BLOCK_${t}%%`,`<div class="mermaid" data-raw-code="${encodeURIComponent(e)}">${e}</div>`)}),n.forEach((e,t)=>{let n=e.content.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`);i=i.replace(`%%CODE_BLOCK_${t}%%`,`<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${t}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${e.language}">${n}</code></pre>
      </div>`)}),r.forEach((e,t)=>{i=i.replace(`%%TABLE_BLOCK_${t}%%`,dn(e))}),i}function un(e){if(!e)return``;let t=e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`);return t=t.replace(/`([^`]+)`/g,`<code>$1</code>`),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/\*([^*]+)\*/g,`<em>$1</em>`),t=t.replace(/~~([^~]+)~~/g,`<del>$1</del>`),t}function dn(e){let{header:t,body:n,full:r}=e,i=window.__tableBlocks?window.__tableBlocks.length:0;window.__tableBlocks&&(window.__tableBlocks[i]={full:r,header:t,body:n});let a=t.split(`|`).filter(e=>e.trim()).map(e=>un(e.trim())),o=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>un(e.trim()))),s=`<div class="table-container-wrapper"><table>`;return s+=`<thead><tr>`,a.forEach((e,t)=>{t===a.length-1?s+=`<th class="table-header-cell-wrapper">
        ${e}
        <div class="table-toolbar">
          <button class="table-toolbar-btn copy-md-btn" title="复制 Markdown 表格" data-table-index="${i}">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
            </svg>
          </button>
          <button class="table-toolbar-btn download-excel-btn" title="下载 Excel" data-table-index="${i}">
            <svg viewBox="0 0 16 16" fill="currentColor">
              <path d="M.5 9.9a.5.5 0 0 1 .5.5v2.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2.5a.5.5 0 0 1 1 0v2.5a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2v-2.5a.5.5 0 0 1 .5-.5z"/>
              <path d="M7.646 11.854a.5.5 0 0 0 .708 0l3-3a.5.5 0 0 0-.708-.708L8.5 10.293V1.5a.5.5 0 0 0-1 0v8.793L5.354 8.146a.5.5 0 1 0-.708.708l3 3z"/>
            </svg>
          </button>
        </div>
      </th>`:s+=`<th>${e}</th>`}),s+=`</tr></thead>`,s+=`<tbody>`,o.forEach(e=>{s+=`<tr>`,e.forEach(e=>{s+=`<td>${e}</td>`}),s+=`</tr>`}),s+=`</tbody>`,s+=`</table></div>`,s}function fn(e){try{let{header:t,body:n}=e,r=t.split(`|`).filter(e=>e.trim()).map(e=>e.trim()),i=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>e.trim())),a=`﻿`;a+=r.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`,i.forEach(e=>{a+=e.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`});let o=new Blob([a],{type:`text/csv;charset=utf-8;`}),s=document.createElement(`a`),c=URL.createObjectURL(o);s.setAttribute(`href`,c),s.setAttribute(`download`,`table-${Date.now()}.csv`),s.style.visibility=`hidden`,document.body.appendChild(s),s.click(),document.body.removeChild(s),console.log(`[SidePanel] Excel 下载成功`)}catch(e){console.error(`[SidePanel] 下载 Excel 失败:`,e),I(`下载失败: `+e.message,`error`)}}async function pn(){if(typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}console.log(`[SidePanel] ===== renderMermaidCharts 开始 =====`);let e=document.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,e.length),e.length!==0){for(let t=0;t<e.length;t++){let n=e[t];try{await mermaid.run({nodes:[n]}),console.log(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染成功`),hn(n)}catch(e){console.error(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染失败:`,e),!n.querySelector(`svg`)&&!n.querySelector(`.mermaid-controls`)&&(n.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${e.message}</div>`)}}console.log(`[SidePanel] ===== renderMermaidCharts 完成 =====`)}}function mn(e){return e?`<div class="markdown-body">${ln(e)}</div>`:``}function hn(e){if(e.querySelector(`.mermaid-controls`)){console.log(`[SidePanel] 工具栏已存在，跳过`);return}let t=e.querySelector(`svg`);if(!t){console.warn(`[SidePanel] SVG 元素未找到，当前内容:`,e.innerHTML.substring(0,100));return}console.log(`[SidePanel] 找到 SVG 元素，开始添加工具栏`),console.log(`[SidePanel] container 类名:`,e.className),console.log(`[SidePanel] container HTML:`,e.innerHTML.substring(0,200)),e.style.position=`relative`,e.style.cursor=`grab`,e.style.userSelect=`none`,e.style.webkitUserSelect=`none`;let n=e.querySelector(`.mermaid-svg-wrapper`);if(!n){n=document.createElement(`div`),n.className=`mermaid-svg-wrapper`,n.style.transformOrigin=`center center`,n.style.transition=`transform 0.2s ease`,n.style.display=`inline-block`,n.style.width=`100%`,t.style.maxWidth=`100%`,t.style.height=`auto`,t.style.userSelect=`none`,t.style.webkitUserSelect=`none`,n.appendChild(t),e.insertBefore(n,e.firstChild);let r=[];Array.from(e.childNodes).forEach(e=>{e.nodeType===Node.TEXT_NODE&&e.textContent.trim()&&r.push(e)}),r.forEach(e=>e.remove())}let r=document.createElement(`div`);r.className=`mermaid-controls`,r.innerHTML=`
    <button class="zoom-in" title="放大">+</button>
    <button class="zoom-out" title="缩小">−</button>
    <button class="reset-zoom" title="重置">↺</button>
    <button class="copy-to-clipboard" title="复制到剪贴板">
      <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    </button>
    <button class="download-png" title="下载图片">↓</button>
    <button class="view-source" title="查看源代码">&lt;/&gt;</button>
  `,e.appendChild(r),console.log(`[SidePanel] 工具栏 HTML 已添加`),console.log(`[SidePanel] container 子元素:`,Array.from(e.children).map(e=>e.className).join(`, `));let i=1,a=.3,o=.15,s=e.dataset.rawCode||``;if(!s){let e=t.querySelector(`title`);e&&e.textContent&&(s=e.textContent.trim())}if(!s){let e=t.querySelector(`script[type="text/plain"]`);e&&(s=e.textContent.trim())}s&&!e.dataset.rawMermaidCode&&(e.dataset.rawMermaidCode=s),r.querySelector(`.view-source`).addEventListener(`click`,r=>{r.stopPropagation();let s=e.getAttribute(`data-raw-code`);vn(e,s?decodeURIComponent(s):e.dataset.rawMermaidCode||``,n,t,i,{MIN_SCALE:a,MAX_SCALE:10,SCALE_STEP:o})}),r.querySelector(`.copy-to-clipboard`).addEventListener(`click`,e=>{e.stopPropagation(),gn(t,n,i)}),r.querySelector(`.download-png`).addEventListener(`click`,e=>{e.stopPropagation(),_n(t,i)}),e.addEventListener(`wheel`,e=>{!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.stopPropagation(),i=e.deltaY<0?Math.min(10,i+o):Math.max(a,i-o),p())},{passive:!1});let c=!1,l,u,d=0,f=0;function p(){n.style.transform=`translate(${d}px, ${f}px) scale(${i})`}r.querySelector(`.zoom-in`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.min(10,i+o),p()}),r.querySelector(`.zoom-out`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.max(a,i-o),p()}),r.querySelector(`.reset-zoom`).addEventListener(`click`,e=>{e.stopPropagation(),i=1,d=0,f=0,p()}),e.addEventListener(`mousedown`,t=>{t.target.tagName!==`BUTTON`&&(c=!0,l=t.clientX-d,u=t.clientY-f,e.style.cursor=`grabbing`)}),document.addEventListener(`mousemove`,e=>{c&&(d=e.clientX-l,f=e.clientY-u,p())}),document.addEventListener(`mouseup`,()=>{c&&(c=!1,e.style.cursor=`grab`)})}async function gn(e,t,n){try{console.log(`[SidePanel] 开始复制到剪贴板`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){if(e)if(navigator.clipboard&&typeof ClipboardItem<`u`)navigator.clipboard.write([new ClipboardItem({"image/png":e})]).then(()=>{console.log(`[SidePanel] 图片复制到剪贴板成功`),I(`Mermaid 图表已复制到剪贴板！`,`success`)}).catch(e=>{console.error(`[SidePanel] 复制到剪贴板失败:`,e),I(`复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。`,`error`)});else{console.warn(`[SidePanel] Clipboard API 不可用，降级为下载`),I(`当前浏览器不支持图片复制功能，已自动转为下载。`,`warning`);let t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(t),t.click(),document.body.removeChild(t)}},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] 图片转换失败:`,e),I(`图片转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 复制到剪贴板失败:`,e),I(`复制失败: `+e.message,`error`)}}function _n(e,t){try{console.log(`[SidePanel] 开始下载 PNG`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){console.log(`[SidePanel] SVG 图片加载成功`);let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){let t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t),console.log(`[SidePanel] PNG 下载成功`)},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] PNG 转换失败:`,e),I(`PNG 转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 下载 PNG 失败:`,e),I(`下载失败: `+e.message,`error`)}}function vn(e,t,n,r,i,a){let o=e.querySelector(`.mermaid-source-view`),s=e.querySelector(`.mermaid-controls`);if(o)o.parentElement&&o.parentElement.remove(),n&&(n.style.display=`inline-block`),hn(e);else{n&&(n.style.display=`none`),s&&s.remove();let o=document.createElement(`div`);o.className=`mermaid-container-wrapper`,o.style.position=`relative`;let c=document.createElement(`pre`);c.className=`mermaid-source-view`,c.style.position=`relative`,c.textContent=t;let l=document.createElement(`button`);l.className=`source-copy-btn`,l.title=`复制源代码`,l.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `,l.addEventListener(`click`,e=>{e.stopPropagation(),ot(t,l)});let u=document.createElement(`button`);u.className=`source-copy-btn`,u.style.right=`44px`,u.title=`返回图表`,u.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `,u.addEventListener(`click`,o=>{o.stopPropagation(),vn(e,t,n,r,i,a)}),c.appendChild(l),c.appendChild(u),o.appendChild(c),e.appendChild(o)}}async function yn(e){if(console.log(`[SidePanel] ===== renderMessageMermaid 开始 =====`),typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}await new Promise(e=>setTimeout(e,300));let t=e.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,t.length),t.length===0){console.log(`[SidePanel] 未找到 mermaid 元素`);return}try{for(let n=0;n<t.length;n++){let r=t[n];try{await mermaid.run({nodes:[r]}),console.log(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染成功`);let t=e.querySelectorAll(`.mermaid`)[n];t&&hn(t)}catch(t){console.error(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染失败:`,t);let r=e.querySelectorAll(`.mermaid`)[n];r&&!r.querySelector(`svg`)&&!r.querySelector(`.mermaid-controls`)&&(r.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${t.message}</div>`)}}console.log(`[SidePanel] Mermaid 渲染完成`);let n=e.querySelectorAll(`.mermaid-controls`);console.log(`[SidePanel] 工具栏添加结果:`,n.length,`个成功`)}catch(e){console.error(`[SidePanel] Mermaid 渲染整体失败:`,e)}Sn()}var bn=!1;function xn(){if(bn)return;bn=!0;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{if(!e.ctrlKey&&!e.metaKey)return;let t=e.target.closest(`code`);if(!t||e.target.closest(`.code-copy-btn`))return;e.preventDefault();let n=t.textContent;n&&navigator.clipboard.writeText(n).then(()=>{I(`${t.closest(`.code-block-container`)?`代码块`:`代码`}已复制到剪贴板`,`success`)}).catch(e=>{console.error(`[SidePanel] Ctrl+单击复制失败:`,e);let t=document.createElement(`textarea`);t.value=n,t.style.position=`fixed`,t.style.left=`-999999px`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),document.body.removeChild(t),I(`代码已复制到剪贴板`,`success`)})}),console.log(`[SidePanel] Ctrl+单击复制代码事件已绑定`))}function Sn(){let e=document.querySelectorAll(`.code-copy-btn`);console.log(`[SidePanel] 找到代码复制按钮数量:`,e.length),e.forEach((e,t)=>{if(e.dataset.bound){console.log(`[SidePanel] 按钮`,t,`已绑定，跳过`);return}e.dataset.bound=`true`,e.addEventListener(`click`,t=>{console.log(`[SidePanel] 代码复制按钮被点击`),t.stopPropagation();let n=e.closest(`.code-block-container`);if(console.log(`[SidePanel] 找到容器:`,!!n),n){let t=n.querySelector(`pre code`);if(console.log(`[SidePanel] 找到代码元素:`,!!t),t){let n=t.textContent;console.log(`[SidePanel] 代码长度:`,n.length),ot(n,e)}}}),console.log(`[SidePanel] 已绑定按钮`,t)}),xn(),Cn()}function Cn(){document.querySelectorAll(`.copy-md-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&ot(r.full,e)}))}),document.querySelectorAll(`.download-excel-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&fn(r)}))})}async function wn(){await Tn(),await En(),kn(),jn(),console.log(`[AgentMgr] Agent 管理器初始化完成, activeAgentId:`,M.activeAgentId)}async function Tn(){let[e,t]=await Promise.all([nt(),Xe()]);M.activeAgentId=e,M.customAgents=t.filter(e=>!e.isBuiltin),console.log(`[AgentMgr] Agent 状态已加载, activeAgentId:`,e,`total:`,t.length)}async function En(){let e=document.getElementById(`agentListItems`),t=document.getElementById(`agentDropdownFooter`);if(!e)return;let n=await Xe(),r=M.activeAgentId,i=``;for(let e of n){let t=e.id===r||!r&&e.id==="default",n=e.toolIds?e.toolIds.length:`全部`;i+=`
      <div class="agent-item ${t?`active`:``}" data-agent-id="${B(e.id)}">
        <span class="agent-item-icon">${qn(e.icon)}</span>
        <div class="agent-item-info">
          <span class="agent-item-name">${qn(e.name)}</span>
          <span class="agent-item-desc">${qn(e.description||`${n} 个工具`)}</span>
        </div>
        ${e.isBuiltin?``:`<button class="agent-item-edit" data-action="edit" data-agent-id="${B(e.id)}" title="编辑">✎</button>`}
      </div>`}e.innerHTML=i,t&&(t.innerHTML=`
      <div class="agent-item" id="agentAddBtn" style="color:#667eea;">
        <span class="agent-item-icon" style="color:#667eea;">＋</span>
        <span class="agent-item-name">创建新 Agent</span>
      </div>`),Dn(n,r)}function Dn(e,t){let n=document.getElementById(`agentSelectorBtn`),r=document.getElementById(`agentSelectorText`),i=document.getElementById(`agentSelectorEmoji`);if(!n||!r)return;let a=e.find(e=>e.id===t)||e.find(e=>e.id==="default");a?(r.textContent=`${a.icon} ${a.name}`,i&&(i.textContent=a.icon)):(r.textContent=`🤖 默认助手`,i&&(i.textContent=`🤖`))}function On(){let e=document.getElementById(`agentSelectorBtn`),t=document.getElementById(`agentSelectorDropdown`);if(!e||!t)return;let n=e.getBoundingClientRect(),r=t.getBoundingClientRect(),i=document.getElementById(`agentSelectorWrapper`).getBoundingClientRect(),a=document.body.clientWidth,o=n.left+n.width/2,s=o-r.width/2,c=a-r.width-8;if(c<8){t.style.maxWidth=a-16+`px`;let e=t.getBoundingClientRect();s=o-e.width/2;let n=a-e.width-8;s=Math.max(8,Math.min(n,s))}else t.style.maxWidth=``,s=Math.max(8,Math.min(c,s));t.style.left=s-i.left+`px`}function kn(){let e=document.getElementById(`agentSelectorBtn`),t=document.getElementById(`agentSelectorDropdown`);!e||!t||(e.addEventListener(`click`,e=>{e.stopPropagation(),t.style.display===`flex`?t.style.display=`none`:(En(),t.style.display=`flex`,On())}),document.addEventListener(`click`,()=>{t.style.display=`none`}),t.addEventListener(`click`,async e=>{let n=e.target.closest(`.agent-item`);if(!n)return;let r=e.target.closest(`[data-action]`);if(r&&r.dataset.action===`edit`){e.stopPropagation();let t=r.dataset.agentId;Ln(t);return}if(n.id===`agentAddBtn`){Ln(null);return}let i=n.dataset.agentId;i&&(await An(i),t.style.display=`none`)}))}async function An(e){let t=e?await Qe(e):null;M.activeAgentId=e,await rt(e),await En();let n=t?t.name:`默认助手`;I(`已切换到：${n}`,`info`,2e3),console.log(`[AgentMgr] 已切换 Agent:`,e,n)}function jn(){let e=document.getElementById(`agentEditModal`);if(!e)return;e.querySelector(`#agentModalCloseBtn`)?.addEventListener(`click`,Rn),e.addEventListener(`click`,t=>{t.target===e&&Rn()}),e.querySelector(`#agentSaveBtn`)?.addEventListener(`click`,Un),e.querySelector(`#agentDeleteBtn`)?.addEventListener(`click`,Wn),e.querySelector(`#agentTemplateSelect`)?.addEventListener(`change`,Bn),Nn();let t=document.getElementById(`agentToolActions`);t&&t.addEventListener(`click`,e=>{let t=e.target.closest(`button`);if(!t)return;let n=t.dataset.action;n===`selectAll`?Pn():n===`deselectAll`&&Fn()});let n=document.getElementById(`agentToolList`);n&&n.addEventListener(`click`,e=>{let t=e.target.closest(`.agent-tool-category-clickable`);t&&In(t.dataset.category)}),document.addEventListener(`click`,e=>{let t=document.getElementById(`emojiPicker`),n=document.getElementById(`agentEditIconBtn`);t&&n&&t.style.display===`block`&&!n.contains(e.target)&&!t.contains(e.target)&&(t.style.display=`none`)})}var Mn=[{label:`人物表情`,emojis:[`😀`,`😃`,`😎`,`🤩`,`🥳`,`😇`,`🤔`,`🧐`,`😤`,`😭`,`🥺`,`🤗`,`😏`,`🫡`,`🤫`,`🤯`,`🥱`,`😴`,`🤤`,`💀`]},{label:`手势动作`,emojis:[`👋`,`🤝`,`👍`,`👎`,`👏`,`🙌`,`💪`,`✍️`,`🙏`,`🤞`,`✌️`,`🤘`,`👆`,`👇`,`👉`,`👈`,`🖐️`,`🤙`,`🤌`,`🫶`]},{label:`职业角色`,emojis:[`🤖`,`🧑‍💻`,`👨‍🔬`,`👩‍🎨`,`🧑‍🏫`,`👨‍💼`,`🧑‍🔧`,`👩‍⚕️`,`🧑‍🚀`,`👨‍🍳`,`🧑‍🎓`,`👩‍🚒`,`👮`,`🕵️`,`👷`,`🧙`,`🦸`,`🧛`,`🧜`,`👼`]},{label:`AI & 科技`,emojis:[`🧠`,`💡`,`🔍`,`🔬`,`🧪`,`🧬`,`🛰️`,`📡`,`🔗`,`🌐`,`💻`,`🖥️`,`⌨️`,`🖱️`,`🖨️`,`📱`,`🔌`,`💾`,`🎛️`,`⚙️`]},{label:`工具物品`,emojis:[`🔧`,`🔨`,`🪛`,`🔐`,`🔑`,`🛡️`,`🔒`,`🔓`,`✂️`,`📐`,`📏`,`🧲`,`💣`,`🧨`,`🔔`,`🔕`,`💎`,`💿`,`📀`,`🎥`]},{label:`文档数据`,emojis:[`📝`,`📋`,`📄`,`📊`,`📈`,`📉`,`🗂️`,`📁`,`📂`,`📚`,`📖`,`📌`,`📎`,`🖇️`,`✏️`,`🖊️`,`📏`,`📐`,`🗑️`,`📇`]},{label:`状态标记`,emojis:[`✅`,`❌`,`⚠️`,`⛔`,`🚫`,`➕`,`➖`,`⭐`,`🔥`,`💯`,`🎯`,`🏆`,`🥇`,`📌`,`📍`,`💬`,`🗨️`,`💭`,`🗯️`,`💢`]},{label:`交通出行`,emojis:[`🚀`,`✈️`,`🚗`,`🚲`,`🛵`,`🏎️`,`🚢`,`🚁`,`🛸`,`🏃`,`🚶`,`🧗`,`🏄`,`🚴`,`🏊`,`⛵`,`🚂`,`🚌`,`🚕`,`🛴`]},{label:`自然天气`,emojis:[`☀️`,`🌙`,`⭐`,`🌈`,`☁️`,`⛈️`,`❄️`,`🔥`,`💧`,`🌊`,`🌸`,`🌺`,`🌻`,`🌲`,`🍀`,`🌍`,`🏔️`,`🌋`,`🏝️`,`🌌`]},{label:`符号标志`,emojis:[`©️`,`®️`,`™️`,`♻️`,`⚡`,`💲`,`🔴`,`🟠`,`🟡`,`🟢`,`🔵`,`🟣`,`⬛`,`⬜`,`🟤`,`❤️`,`💙`,`💚`,`💛`,`💜`]}];function Nn(){let e=document.getElementById(`emojiPicker`),t=document.getElementById(`agentEditIconBtn`),n=document.getElementById(`agentEditIcon`);if(!e||!t)return;let r=``;for(let e of Mn){r+=`<div class="emoji-category-label">${e.label}</div>`,r+=`<div class="emoji-picker-grid">`;for(let t of e.emojis)r+=`<button type="button" class="emoji-picker-item" data-emoji="${t}">${t}</button>`;r+=`</div>`}e.innerHTML=r,t.addEventListener(`click`,n=>{if(n.stopPropagation(),e.style.display===`block`){e.style.display=`none`;return}let r=t.getBoundingClientRect();document.body.clientWidth-r.left>=330?(e.style.left=`0`,e.style.right=`auto`):(e.style.left=`auto`,e.style.right=`0`),e.style.display=`block`}),e.addEventListener(`click`,r=>{let i=r.target.closest(`.emoji-picker-item`);if(!i)return;let a=i.dataset.emoji;t.textContent=a,n&&(n.value=a),e.style.display=`none`})}function Pn(){document.querySelectorAll(`#agentToolList input[type="checkbox"]`).forEach(e=>{e.checked=!0})}function Fn(){document.querySelectorAll(`#agentToolList input[type="checkbox"]`).forEach(e=>{e.checked=!1})}function In(e){let t=document.querySelectorAll(`#agentToolList .agent-tool-item[data-category="${e}"]`),n=[];if(t.forEach(e=>{let t=e.querySelector(`input[type="checkbox"]`);t&&n.push(t)}),n.length===0)return;let r=n.every(e=>e.checked);n.forEach(e=>{e.checked=!r})}async function Ln(e){let t=document.getElementById(`agentEditModal`);if(!t)return;t.querySelector(`#agentEditId`).value=``,t.querySelector(`#agentEditName`).value=``,t.querySelector(`#agentEditIcon`).value=`🤖`;let n=t.querySelector(`#agentEditIconBtn`);n&&(n.textContent=`🤖`),t.querySelector(`#agentEditDesc`).value=``,t.querySelector(`#agentEditPrompt`).value=``,t.querySelector(`#agentEditAllowSub`).checked=!1,t.querySelector(`#agentTemplateSelect`).value=``;let r=t.querySelector(`#agentDeleteBtn`),i=t.querySelector(`#agentEditTitle`);if(e){let n=await Qe(e);if(!n||n.isBuiltin)return;i.textContent=`编辑 Agent`,t.querySelector(`#agentEditId`).value=n.id,t.querySelector(`#agentEditName`).value=n.name,t.querySelector(`#agentEditIcon`).value=n.icon||`🤖`;let a=t.querySelector(`#agentEditIconBtn`);a&&(a.textContent=n.icon||`🤖`),t.querySelector(`#agentEditDesc`).value=n.description||``,t.querySelector(`#agentEditPrompt`).value=n.systemPrompt||``,t.querySelector(`#agentEditAllowSub`).checked=n.allowSubDispatch||!1,r.style.display=`block`,Vn(n.toolIds)}else i.textContent=`创建新 Agent`,r.style.display=`none`,Vn(null),zn();t.style.display=`flex`}function Rn(){let e=document.getElementById(`agentEditModal`);e&&(e.style.display=`none`)}function zn(){let e=document.getElementById(`agentTemplateSelect`);if(!e)return;let t=`<option value="">-- 选择模板（可选） --</option>`;for(let e=0;e<Je.length;e++){let n=Je[e];t+=`<option value="${e}">${n.icon} ${n.name}</option>`}e.innerHTML=t}function Bn(e){let t=parseInt(e.target.value);if(isNaN(t)||t<0||t>=Je.length)return;let n=Je[t],r=document.getElementById(`agentEditModal`);if(!r)return;r.querySelector(`#agentEditName`).value=n.name,r.querySelector(`#agentEditIcon`).value=n.icon;let i=r.querySelector(`#agentEditIconBtn`);i&&(i.textContent=n.icon),r.querySelector(`#agentEditDesc`).value=n.description,r.querySelector(`#agentEditPrompt`).value=n.systemPrompt,r.querySelector(`#agentEditAllowSub`).checked=n.allowSubDispatch||!1,Vn(n.toolIds),I(`已加载模板：${n.name}`,`info`,2e3)}function Vn(t){let n=document.getElementById(`agentToolList`);if(!n)return;let r=new Set(t||[]),i={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,content_extraction:`📄 内容提取`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_output:`📷 媒体与输出`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,local_agent:`🖥️ 本地Agent`},a={};for(let t of e){let e=t.category||`other`;a[e]||(a[e]=[]),a[e].push(t)}let o=e.length,s=``;for(let[e,t]of Object.entries(a)){let n=i[e]||e;s+=`<div class="agent-tool-category agent-tool-category-clickable" data-category="${B(e)}" title="点击切换该分类全选/取消全选">${n} <span style="font-weight:400;color:#bbb;">(${t.length})</span></div>`;for(let n of t){let t=r.has(n.id)?`checked`:``;s+=`
        <label class="agent-tool-item" data-category="${B(e)}" title="${B(n.description)}">
          <input type="checkbox" value="${B(n.id)}" ${t} data-tool-id="${B(n.id)}">
          <span class="agent-tool-name">${qn(n.name)}</span>
          <span class="agent-tool-desc">${qn(n.description.substring(0,40))}${n.description.length>40?`...`:``}</span>
        </label>`}}n.innerHTML=s;let c=document.getElementById(`agentToolCount`);c&&(c.textContent=`(${o})`)}function Hn(){let e=document.getElementById(`agentToolList`);if(!e)return null;let t=e.querySelectorAll(`input[type="checkbox"]:checked`),n=[];return t.forEach(e=>n.push(e.value)),n.length>0?n:null}async function Un(){let e=document.getElementById(`agentEditModal`);if(!e)return;let t=e.querySelector(`#agentEditId`).value,n=e.querySelector(`#agentEditName`).value.trim(),r=e.querySelector(`#agentEditIcon`).value.trim()||`🤖`,i=e.querySelector(`#agentEditDesc`).value.trim(),a=e.querySelector(`#agentEditPrompt`).value.trim(),o=e.querySelector(`#agentEditAllowSub`).checked,s=Hn();if(!n){I(`请输入 Agent 名称`,`warning`);return}let c={name:n,icon:r,description:i,systemPrompt:a,allowSubDispatch:o,toolIds:s};try{t?(await et(t,c),I(`Agent 已更新`,`success`)):I(`Agent "${(await $e(c)).name}" 已创建`,`success`),await Tn(),await En(),Rn()}catch(e){console.error(`[AgentMgr] 保存 Agent 失败:`,e),I(`保存失败：`+e.message,`error`)}}async function Wn(){let e=document.getElementById(`agentEditModal`);if(!e)return;let t=e.querySelector(`#agentEditId`)?.value;if(t&&await Jn(`确定要删除这个 Agent 吗？正在使用该 Agent 的会话将恢复为默认助手。`,`删除 Agent`))try{await tt(t),I(`Agent 已删除`,`success`),await Tn(),await En(),Rn()}catch(e){console.error(`[AgentMgr] 删除 Agent 失败:`,e),I(`删除失败：`+e.message,`error`)}}async function Gn(){return M.activeAgentId?await Qe(M.activeAgentId):null}function Kn(e){return e?e.toolIds:null}function qn(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function B(e){return e?e.replace(/["&<>]/g,e=>({'"':`&quot;`,"&":`&amp;`,"<":`&lt;`,">":`&gt;`})[e]):``}async function Jn(e,t){return typeof window.showCustomConfirm==`function`?window.showCustomConfirm(e,t):new Promise(n=>{let r=document.getElementById(`agentConfirmModal`);if(!r){n(confirm(e));return}r.querySelector(`#agentConfirmMessage`).textContent=e,r.querySelector(`#agentConfirmTitle`).textContent=t||`确认`,r.style.display=`flex`;let i=()=>{r.style.display=`none`,r.querySelector(`#agentConfirmOk`).removeEventListener(`click`,a),r.querySelector(`#agentConfirmCancel`).removeEventListener(`click`,o),r.removeEventListener(`click`,s)},a=()=>{i(),n(!0)},o=()=>{i(),n(!1)},s=e=>{e.target===r&&(i(),n(!1))};r.querySelector(`#agentConfirmOk`).addEventListener(`click`,a),r.querySelector(`#agentConfirmCancel`).addEventListener(`click`,o),r.addEventListener(`click`,s)})}var Yn=!1,Xn=null;async function Zn(){Yn||=(await C(),!0)}async function Qn(){await Zn();let[e,t]=await Promise.all([a(),l()]);return e.sort((e,t)=>e.order!==void 0&&t.order!==void 0?e.order-t.order:e.order===void 0?t.order===void 0?new Date(e.createdAt)-new Date(t.createdAt):1:-1),{activeSessionId:t,list:e}}function $n(e){return typeof e==`string`?e:Array.isArray(e)?e.filter(e=>e.type===`text`).map(e=>e.text).join(``):``}async function er(){if(!M.activeSessionId)return!1;let e=await x(M.activeSessionId);if(!e)return!1;e.model=M.currentModel,e.useTools=M.useTools,e.enabledTools=[...M.enabledTools],e.agentId=M.activeAgentId||null,e.temperature=M.temperature,e.topP=M.topP;let t=M.chatConfig.maxHistoryMessages||50;e.messageHistory=M.messageHistory.slice(-t).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1,htmlContent:e.htmlContent||void 0})),e.updatedAt=new Date().toISOString();let r=M.messageHistory.find(e=>e.role===`user`);return r&&(e.title=$n(r.content).substring(0,50).replace(/\n/g,` `)),await n(e),!0}async function tr(){await Zn();let e=ir(),t={id:e,title:`新会话`,model:M.currentModel,useTools:M.useTools,enabledTools:[...M.enabledTools],agentId:M.activeAgentId||null,temperature:M.temperature,topP:M.topP,messageHistory:[],scrollPosition:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),order:Date.now(),isGenerating:!1,lastExecutionLog:[]};return await n(t),await f(e),t}async function nr(e){await Zn();let t=[];for(let r of e){let e={id:ir(),title:r.title||`导入的会话`,model:r.model||M.currentModel,useTools:r.useTools===void 0?!0:r.useTools,enabledTools:r.enabledTools||[...M.enabledTools],temperature:r.temperature===void 0?M.temperature:r.temperature,topP:r.topP===void 0?M.topP:r.topP,agentId:r.agentId||null,messageHistory:(r.messageHistory||[]).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1,htmlContent:e.htmlContent||void 0})),scrollPosition:0,createdAt:r.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),order:Date.now()+t.length,isGenerating:!1,lastExecutionLog:[]};await n(e),t.push(e)}return!await l()&&t.length>0&&await f(t[0].id),t}async function rr(e,t){let r=await x(e);return r?(r.messageHistory=r.messageHistory||[],r.messageHistory.push({role:t.role,content:t.content||``,executionLog:t.executionLog||[],reflectionScore:t.reflectionScore,wasRevised:t.wasRevised||!1,htmlContent:t.htmlContent||void 0}),r.updatedAt=new Date().toISOString(),r.isGenerating=!1,await n(r),!0):!1}function ir(){return`sess_`+Date.now().toString(36)+`_`+Math.random().toString(36).substring(2,8)}async function ar(t){if(t===M.activeSessionId)return;await er(),Xn=M.activeSessionId;let n=await x(t);if(!n)return console.error(`[SessionStore] 找不到会话:`,t),!1;if(await f(t),M.activeSessionId=t,M.messageHistory=n.messageHistory||[],M.currentModel=n.model||M.currentModel,M.useTools=n.useTools===void 0?M.useTools:n.useTools,n.enabledTools&&n.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),r=n.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);M.enabledTools=[...r,...i]}else M.enabledTools=n.enabledTools||M.enabledTools;return M.temperature=n.temperature===void 0?M.temperature:n.temperature,M.topP=n.topP===void 0?M.topP:n.topP,M.activeAgentId=n.agentId||null,n.isGenerating?M.generatingSessionIds.add(t):M.generatingSessionIds.delete(t),n}async function or(e){let t=await a(),n=await l();if(await s(e),n===e){let n=t.filter(t=>t.id!==e);if(n.length>0){let e=n.find(e=>e.id===Xn);await f(e?e.id:n[0].id),Xn=null}else await f(null)}return!0}async function sr(e,t){let r=await x(e);return r?(r.title=t,r.updatedAt=new Date().toISOString(),await n(r),!0):!1}async function cr(e){let t=await a(),r=new Map(t.map(e=>[e.id,e])),i=[];return e.forEach((e,t)=>{let a=r.get(e);a&&(a.order=t,i.push(n(a)))}),await Promise.all(i),!0}async function lr(){if(!M.messageHistory||M.messageHistory.length===0)return;let e=await x(M.activeSessionId);if(!e)return;let t=M.messageHistory.find(e=>e.role===`user`),n=t?$n(t.content).substring(0,50).replace(/\n/g,` `):e.title||`未命名会话`,r=Date.now().toString(36)+Math.random().toString(36).substring(2,8),a=M.messageHistory.map(e=>({role:e.role,content:e.content||``})),o=await S();o.push({id:r,title:n,createdAt:new Date().toISOString(),messages:a}),o.length>20&&o.splice(0,o.length-20),await i(o);let s=await tr();return await or(e.id),await ar(s.id),!0}async function V(){return Qn()}async function ur(){return er()}async function dr(){return tr()}async function fr(e){return ar(e)}async function pr(e){return or(e)}async function mr(e,t){return sr(e,t)}async function hr(e){return cr(e)}async function gr(){return lr()}async function _r(e){return nr(e)}async function vr(e,t){return rr(e,t)}var H={visible:!1,highlightIndex:-1,filteredSessions:[]},U={draggedId:null,sourceType:null};async function W(){let e=await V();M.sessions=e.list,M.activeSessionId=e.activeSessionId;let t=document.getElementById(`sessionTabs`),n=document.getElementById(`sessionTabsScroll`),r=document.getElementById(`sessionTabsActions`);!t||!n||!r||(n.innerHTML=``,e.list.forEach(e=>{let t=document.createElement(`div`);t.className=`session-tab`,t.dataset.sessionId=e.id,e.id===M.activeSessionId&&t.classList.add(`active`),t.title=e.title;let r=document.createElement(`span`);r.className=`session-tab-title`,r.textContent=e.title||`新会话`,t.appendChild(r);let i=document.createElement(`span`);if(i.className=`session-tab-close`,i.innerHTML=`&#10005;`,i.title=`关闭会话`,i.addEventListener(`click`,async t=>{t.stopPropagation(),ei(e,async()=>{await ri()})}),t.appendChild(i),e.isGenerating||M.generatingSessionIds.has(e.id)){let e=document.createElement(`span`);e.className=`session-tab-indicator`,t.appendChild(e)}t.addEventListener(`click`,async t=>{t.preventDefault(),e.id!==M.activeSessionId&&await Yr(e.id)}),t.addEventListener(`contextmenu`,t=>{t.preventDefault(),ti(t,e)}),t.addEventListener(`mousedown`,async t=>{t.button===1&&(t.preventDefault(),t.stopPropagation(),await pr(e.id),await ri())}),t.draggable=!0,t.addEventListener(`dragstart`,t=>Tr(t,e.id)),t.addEventListener(`dragover`,e=>Er(e)),t.addEventListener(`dragleave`,e=>Dr(e)),t.addEventListener(`drop`,t=>Or(t,e.id)),t.addEventListener(`dragend`,e=>kr(e)),n.appendChild(t)}),yr(),br(),Gr(),Qr(n),xr(n),wr(n))}function yr(){let e=document.getElementById(`sessionTabsMore`);if(!e)return;let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`click`,e=>{e.stopPropagation(),Fr()})}function br(){let e=document.getElementById(`sessionTabsAdd`);if(!e)return;let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`click`,async()=>{await ur();let e=await dr();M.activeSessionId=e.id,M.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:e.id}})),W()})}function xr(e){let t=document.getElementById(`sessionTabsMore`);t&&(e.scrollWidth>e.clientWidth?t.style.display=`flex`:t.style.display=`none`)}var Sr=null;function Cr(){if(Sr)return;let e=document.getElementById(`sessionTabsScroll`);e&&(Sr=new ResizeObserver(()=>{requestAnimationFrame(()=>{xr(e)})}),Sr.observe(e))}function wr(e){setTimeout(()=>{let t=e.querySelector(`.session-tab.active`);t&&t.scrollIntoView({behavior:`smooth`,block:`nearest`,inline:`center`})},50)}function Tr(e,t){U.draggedId=t,U.sourceType=`tab`,e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,t),e.currentTarget.classList.add(`dragging`)}function Er(e){e.preventDefault(),e.dataTransfer.dropEffect=`move`,e.currentTarget.classList.add(`drag-over`)}function Dr(e){e.currentTarget.classList.remove(`drag-over`)}async function Or(e,t){e.preventDefault(),e.currentTarget.classList.remove(`drag-over`);let n=U.draggedId;if(!n||n===t)return;let r=M.sessions||[],i=r.findIndex(e=>e.id===n),a=r.findIndex(e=>e.id===t);if(i===-1||a===-1)return;let o=[...r],[s]=o.splice(i,1);o.splice(a,0,s),M.sessions=o,await hr(o.map(e=>e.id)),W()}function kr(e){e.currentTarget.classList.remove(`dragging`),document.querySelectorAll(`.session-tab.drag-over`).forEach(e=>e.classList.remove(`drag-over`)),U.draggedId=null,U.sourceType=null}function Ar(e,t){U.draggedId=t,U.sourceType=`dropdown`,e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,t),e.currentTarget.classList.add(`dragging`)}function jr(e){e.preventDefault(),e.dataTransfer.dropEffect=`move`,e.currentTarget.classList.add(`drag-over`)}function Mr(e){e.currentTarget.classList.remove(`drag-over`)}async function Nr(e,t){e.preventDefault(),e.currentTarget.classList.remove(`drag-over`);let n=U.draggedId;if(!n||n===t)return;let r=H.filteredSessions,i=r.findIndex(e=>e.id===n),a=r.findIndex(e=>e.id===t);if(i===-1||a===-1)return;let o=[...r],[s]=o.splice(i,1);o.splice(a,0,s),H.filteredSessions=o;let c=M.sessions||[],l=c.map(e=>e.id),u=new Set(o.map(e=>e.id)),d=l.filter(e=>!u.has(e)),f=[...o.map(e=>e.id),...d];M.sessions=f.map(e=>c.find(t=>t.id===e)).filter(Boolean),await hr(f),Br(),W()}function Pr(e){e.currentTarget.classList.remove(`dragging`),document.querySelectorAll(`.session-dropdown-item.drag-over`).forEach(e=>e.classList.remove(`drag-over`)),U.draggedId=null,U.sourceType=null}function Fr(){H.visible?Lr():Ir()}async function Ir(){let e=document.getElementById(`sessionTabsMore`),t=document.getElementById(`sessionDropdown`);if(!e||!t)return;let n=await V();M.sessions=n.list,M.activeSessionId=n.activeSessionId,H.filteredSessions=[...n.list],H.highlightIndex=-1,H.visible=!0,Br(),zr(e,t);let r=document.getElementById(`sessionDropdownSearch`);r&&(r.value=``,setTimeout(()=>r.focus(),50)),e.classList.add(`active`),setTimeout(()=>{document.addEventListener(`click`,Rr)},0)}function Lr(){let e=document.getElementById(`sessionTabsMore`),t=document.getElementById(`sessionDropdown`);t&&t.classList.remove(`show`),e&&e.classList.remove(`active`),H.visible=!1,H.highlightIndex=-1,H.filteredSessions=[],document.removeEventListener(`click`,Rr)}function Rr(e){let t=document.getElementById(`sessionDropdown`),n=document.getElementById(`sessionTabsMore`);!t||!n||!t.contains(e.target)&&e.target!==n&&!n.contains(e.target)&&Lr()}function zr(e,t){t.classList.add(`show`);let n=e.getBoundingClientRect(),r=n.bottom+4,i=n.right-240;r+360>window.innerHeight-8&&(r=n.top-360-4,r<8&&(r=8)),i<8&&(i=8),t.style.top=r+`px`,t.style.left=i+`px`}function Br(){let e=document.getElementById(`sessionDropdownList`);if(e){if(e.innerHTML=``,H.filteredSessions.length===0){let t=document.createElement(`div`);t.className=`session-dropdown-empty`,t.textContent=`无匹配会话`,e.appendChild(t);return}H.filteredSessions.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`session-dropdown-item`,r.dataset.sessionId=t.id,r.dataset.index=n,t.id===M.activeSessionId&&r.classList.add(`active`),n===H.highlightIndex&&r.classList.add(`highlighted`);let i=document.createElement(`span`);i.className=`session-dropdown-item-title`,i.textContent=t.title||`新会话`,r.appendChild(i);let a=document.createElement(`span`);a.className=`session-dropdown-item-close`,a.innerHTML=`&#10005;`,a.title=`关闭会话`,a.addEventListener(`click`,async e=>{e.stopPropagation(),e.preventDefault(),await Ur(t.id)}),r.appendChild(a),r.addEventListener(`click`,async e=>{e.preventDefault(),await Hr(t.id)}),r.draggable=!0,r.addEventListener(`dragstart`,e=>Ar(e,t.id)),r.addEventListener(`dragover`,e=>jr(e)),r.addEventListener(`dragleave`,e=>Mr(e)),r.addEventListener(`drop`,e=>Nr(e,t.id)),r.addEventListener(`dragend`,e=>Pr(e)),e.appendChild(r)})}}function Vr(e){let t=M.sessions||[];if(!e.trim())H.filteredSessions=[...t];else{let n=e.trim().toLowerCase();H.filteredSessions=t.filter(e=>(e.title||`新会话`).toLowerCase().includes(n))}H.highlightIndex=-1,Br()}async function Hr(e){Lr(),e!==M.activeSessionId&&await Yr(e)}async function Ur(e){await pr(e),await ri();let t=document.getElementById(`sessionDropdownSearch`),n=t?t.value:``,r=M.sessions||[];if(!n.trim())H.filteredSessions=[...r];else{let e=n.trim().toLowerCase();H.filteredSessions=r.filter(t=>(t.title||`新会话`).toLowerCase().includes(e))}H.highlightIndex=Math.min(H.highlightIndex,H.filteredSessions.length-1),Br()}async function Wr(){let e=M.sessions||[];if(e.length!==0){if(Lr(),!await Jr(`确定要关闭全部 ${e.length} 个会话吗？此操作不可撤销。`,`关闭全部会话`)){Ir();return}for(let t of e)await pr(t.id);await ri()}}function Gr(){let e=document.getElementById(`sessionDropdownSearch`),t=document.getElementById(`sessionDropdownCloseAll`),n=document.getElementById(`sessionDropdown`);if(n){if(e){let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`input`,e=>{Vr(e.target.value)}),t.addEventListener(`keydown`,e=>{Kr(e)})}if(t){let e=t.cloneNode(!0);t.parentNode.replaceChild(e,t),e.addEventListener(`click`,async e=>{e.stopPropagation(),await Wr()})}n.addEventListener(`click`,e=>{e.stopPropagation()})}}function Kr(e){if(!H.visible)return;let t=H.filteredSessions.length;if(t===0){e.key===`Escape`&&Lr();return}switch(e.key){case`ArrowDown`:e.preventDefault(),H.highlightIndex=Math.min(H.highlightIndex+1,t-1),Br(),qr();break;case`ArrowUp`:e.preventDefault(),H.highlightIndex=Math.max(H.highlightIndex-1,0),Br(),qr();break;case`Enter`:if(e.preventDefault(),H.highlightIndex>=0&&H.highlightIndex<t){let e=H.filteredSessions[H.highlightIndex];Hr(e.id)}break;case`Escape`:e.preventDefault(),Lr();break}}function qr(){let e=document.querySelector(`.session-dropdown-item.highlighted`);e&&e.scrollIntoView({block:`nearest`})}function Jr(e,t){return new Promise(t=>{let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r){t(!1);return}r.textContent=e;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=()=>{s(),t(!0)},l=()=>{s(),t(!1)};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)})}async function Yr(t){if(await ur(),!await fr(t))return;let n=await V();M.sessions=n.list,M.activeSessionId=t;let r=n.list.find(e=>e.id===t);if(r){if(M.messageHistory=r.messageHistory||[],M.currentModel=r.model||M.currentModel,M.useTools=r.useTools===void 0?M.useTools:r.useTools,r.enabledTools&&r.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),n=r.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!n.includes(e.id)).map(e=>e.id);M.enabledTools=[...n,...i]}else M.enabledTools=r.enabledTools||M.enabledTools;M.temperature=r.temperature===void 0?M.temperature:r.temperature,M.topP=r.topP===void 0?M.topP:r.topP}document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:t}})),W(),Xr()}function Xr(){let e=document.querySelector(`.model-display`);e&&M.currentModel&&(e.textContent=M.currentModel);let t=document.getElementById(`enableToolsBtn`);t&&(t.checked=M.useTools);let n=document.getElementById(`tempIconValue`);n&&M.temperature!==void 0&&(n.textContent=M.temperature.toFixed(2))}var Zr=new WeakSet;function Qr(e){Zr.has(e)||(Zr.add(e),e.addEventListener(`wheel`,t=>{e.scrollWidth<=e.clientWidth||(t.preventDefault(),e.scrollLeft+=t.deltaY)},{passive:!1}))}function $r(e){let t=document.getElementById(`sessionRenameModal`),n=document.getElementById(`sessionRenameInput`),r=document.getElementById(`sessionRenameConfirmBtn`),i=document.getElementById(`sessionRenameCancelBtn`),a=document.getElementById(`sessionRenameCloseBtn`);if(!t||!n)return;n.value=e.title,n.focus(),n.select();let o=()=>{t.classList.remove(`show`),r.removeEventListener(`click`,s),i.removeEventListener(`click`,c),a.removeEventListener(`click`,c)},s=()=>{let t=n.value.trim();t&&t!==e.title&&mr(e.id,t).then(()=>{W()}),o()},c=()=>{o()};r.addEventListener(`click`,s),i.addEventListener(`click`,c),a.addEventListener(`click`,c),n.onkeydown=e=>{e.key===`Enter`?s():e.key===`Escape`&&c()},t.classList.add(`show`)}function ei(e,t){let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r)return;r.textContent=`确定要删除会话"${e.title}"吗？此操作不可撤销。`;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=async()=>{await pr(e.id),t&&await t(),s()},l=()=>{s()};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)}function ti(e,t){let n=document.querySelector(`.session-context-menu`);n&&n.remove();let r=document.createElement(`div`);r.className=`session-context-menu`,r.style.left=e.clientX+`px`,r.style.top=e.clientY+`px`;let i=ni(`重命名`,()=>{r.remove(),$r(t)});r.appendChild(i);let a=ni(`删除`,()=>{r.remove(),ei(t,async()=>{let e=await V();M.activeSessionId=e.activeSessionId,M.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t?M.messageHistory=t.messageHistory||[]:M.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`)),W()})},`danger`);r.appendChild(a),document.body.appendChild(r);let o=e=>{r.contains(e.target)||(r.remove(),document.removeEventListener(`click`,o))};setTimeout(()=>document.addEventListener(`click`,o),0)}function ni(e,t,n=``){let r=document.createElement(`div`);return r.className=`session-context-menu-item `+n,r.textContent=e,r.addEventListener(`click`,t),r}async function ri(){let e=await V();e.activeSessionId||(await dr(),e=await V()),M.activeSessionId=e.activeSessionId,M.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);M.messageHistory=t&&t.messageHistory||[],document.dispatchEvent(new CustomEvent(`session-switched`)),W()}document.addEventListener(`generating-state-changed`,()=>{W()}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,Cr):Cr();var ii=`pendingCallApiSessions`;function ai(){chrome.storage.session.set({[ii]:[...M.pendingCallApiSessionIds]}).catch(()=>{})}async function oi(){try{let e=await chrome.storage.session.get([ii]);e[ii]&&Array.isArray(e[ii])&&(M.pendingCallApiSessionIds=new Set(e[ii]))}catch{}}function si(e){if(Array.isArray(e))return e.filter(e=>e.type===`text`).map(e=>e.text).join(``);if(typeof e==`string`&&e.startsWith(`[`))try{let t=JSON.parse(e);if(Array.isArray(t))return t.filter(e=>e.type===`text`).map(e=>e.text).join(``)}catch{}return e}function ci(e){let t=si(e);M.quotedContextText=t;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let e;e=t.length>100?t.substring(0,100)+`...`:t.length>50?t.substring(0,50)+`...`:t,r.textContent=`💬 已引用: ${e}`,n.classList.add(`show`)}}function li(){console.log(`[SidePanel] 清除选中内容上下文`),M.selectedContextText=``,M.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=e.findIndex(e=>e.startsWith(`[用户问题]`));n===-1?t.value=``:t.value=e.slice(n+1).join(`
`).trim()}}async function ui(){let t=await V();if(t.activeSessionId&&t.list.length>0){M.activeSessionId=t.activeSessionId,M.sessions=t.list;let n=t.list.find(e=>e.id===t.activeSessionId);if(n){if(M.messageHistory=n.messageHistory||[],M.currentModel=n.model||M.currentModel,M.useTools=n.useTools===void 0?M.useTools:n.useTools,n.enabledTools&&n.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),r=n.enabledTools.filter(e=>t.has(e)),i=new Set(n.enabledTools),a=e.filter(e=>e.enabled&&!i.has(e.id)).map(e=>e.id);M.enabledTools=[...r,...a]}else M.enabledTools=n.enabledTools||M.enabledTools;M.temperature=n.temperature===void 0?M.temperature:n.temperature,M.topP=n.topP===void 0?M.topP:n.topP}M.messageHistory.forEach(e=>{let t=e.wasRevised;if(!t&&e.executionLog)try{t=(typeof e.executionLog==`string`?JSON.parse(e.executionLog):e.executionLog).some(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.action?.decision===`revised`)}catch{}e.htmlContent?ua(e.htmlContent):Z(e.role,e.content,!1,e.executionLog||[],e.reflectionScore,t)});let r=document.querySelector(`.welcome-message`);r&&M.messageHistory.length>0&&r.remove(),pn();let i=`scrollPosition_`+(M.activeSessionId||`default`);chrome.storage.local.get([i],e=>{e[i]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t.scrollTop=e[i]},100)}),W()}else{await dr();let e=await V();e.activeSessionId&&(M.activeSessionId=e.activeSessionId,M.sessions=e.list),W()}}function G(){try{ur().catch(e=>{console.error(`[SidePanel] 保存当前会话失败:`,e)})}catch(e){console.error(`[SidePanel] 保存对话历史异常:`,e)}}function di(){M.messageHistory&&M.messageHistory.length>0&&gr().then(()=>{M.messageHistory=[];let e=document.getElementById(`chatContainer`);if(e){e.innerHTML=``;let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
          <div class="icon-wrapper">
            <div class="icon">💬</div>
          </div>
          <h2>开始对话</h2>
          <p>输入您的问题，AI 助手将为您解答</p>
        `,e.appendChild(t)}chrome.storage.local.remove(`scrollPosition_`+(M.activeSessionId||`default`)),W()})}async function fi(){let e=document.getElementById(`exportSessionsModal`),t=document.getElementById(`exportSessionsList`);if(!(!e||!t)){t.innerHTML=`<div class="export-sessions-empty">加载中...</div>`;try{let{list:e,activeSessionId:n}=await V();if(e.length===0)t.innerHTML=`<div class="export-sessions-empty">暂无会话可导出</div>`;else{let r=n||M.activeSessionId;t.innerHTML=e.map((e,t)=>{let n=e.id===r,i=(e.messageHistory||[]).length,a=e.createdAt?new Date(e.createdAt).toLocaleDateString(`zh-CN`):``;return`
        <div class="export-session-item" data-id="${e.id}">
          <input type="checkbox" class="export-session-checkbox" data-session-id="${e.id}" ${n?`checked`:``}>
          <div class="export-session-info">
            <div class="export-session-title">${L(e.title||`未命名会话`)}${n?`<span class="current-badge">当前</span>`:``}</div>
            <div class="export-session-meta">${i} 条消息${a?` · `+a:``}</div>
          </div>
        </div>`}).join(``),t.querySelectorAll(`.export-session-item`).forEach(e=>{let t=e.querySelector(`.export-session-checkbox`);e.addEventListener(`click`,e=>{e.target!==t&&(t.checked=!t.checked),pi()})});let i=document.getElementById(`exportSelectAllBtn`),a=document.getElementById(`exportDeselectAllBtn`),o=document.getElementById(`exportSelectCurrentBtn`);i&&(i.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=!0}),pi()}),a&&(a.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=!1}),pi()}),o&&(o.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=e.dataset.sessionId===r}),pi()}),pi()}}catch(e){console.error(`[SidePanel] 加载会话列表失败:`,e),t.innerHTML=`<div class="export-sessions-empty">加载失败</div>`}e.classList.add(`show`)}}function pi(){document.querySelectorAll(`#exportSessionsList .export-session-checkbox`);let e=document.querySelectorAll(`#exportSessionsList .export-session-checkbox:checked`),t=document.getElementById(`exportSelectedCount`);t&&(t.textContent=`已选 ${e.length} 个`);let n=document.getElementById(`exportSessionsOkBtn`);n&&(n.textContent=`导出选中 (${e.length})`,n.disabled=e.length===0,n.style.opacity=e.length===0?`0.5`:`1`)}function mi(){let e=document.getElementById(`exportSessionsModal`);e&&e.classList.remove(`show`)}async function hi(){let e=document.querySelectorAll(`#exportSessionsList .export-session-checkbox:checked`),t=Array.from(e).map(e=>e.dataset.sessionId);if(t.length===0){I(`请至少选择一个会话`,`warning`);return}try{let{list:e}=await V(),n=e.filter(e=>t.includes(e.id)),r={version:1,exportedAt:new Date().toISOString(),sessions:n.map(e=>({title:e.title||`未命名会话`,model:e.model,useTools:e.useTools,enabledTools:e.enabledTools,temperature:e.temperature,topP:e.topP,createdAt:e.createdAt,messageHistory:(e.messageHistory||[]).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],htmlContent:e.htmlContent||``,reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1}))}))},i=new Date,a=i.getFullYear()+String(i.getMonth()+1).padStart(2,`0`)+String(i.getDate()).padStart(2,`0`)+`-`+String(i.getHours()).padStart(2,`0`)+String(i.getMinutes()).padStart(2,`0`)+String(i.getSeconds()).padStart(2,`0`),o=n.length,s=o===1?`ai-helper-${n[0].title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)}-${a}.aihelper.json`:`ai-helper-${o}sessions-${a}.aihelper.json`,c=JSON.stringify(r,null,2),l=new Blob([c],{type:`application/json;charset=utf-8;`}),u=URL.createObjectURL(l),d=document.createElement(`a`);d.href=u,d.download=s,document.body.appendChild(d),d.click(),document.body.removeChild(d),URL.revokeObjectURL(u),mi(),console.log(`[SidePanel] 会话已导出:`,s,`共`,o,`个会话`),I(`已导出 ${o} 个会话`,`success`)}catch(e){console.error(`[SidePanel] 导出失败:`,e),I(`导出失败: `+e.message,`error`)}}function gi(){let e=document.getElementById(`exportSessionsCloseBtn`),t=document.getElementById(`exportSessionsCancelBtn`),n=document.getElementById(`exportSessionsOkBtn`),r=document.getElementById(`exportSessionsModal`);e&&e.addEventListener(`click`,mi),t&&t.addEventListener(`click`,mi),n&&n.addEventListener(`click`,hi),r&&r.addEventListener(`click`,e=>{e.target===r&&mi()})}function _i(){let e=document.getElementById(`importSessionsFile`);e&&(e.value=``,e.click())}async function vi(e){try{let t=await e.text(),n=JSON.parse(t),r=[];if(n.version&&n.sessions&&Array.isArray(n.sessions))r=n.sessions;else if(Array.isArray(n))r=n.length>0&&n[0].role?[{title:`导入的对话`,messageHistory:n.map(e=>({role:e.role||`user`,content:e.content||``}))}]:(n.length>0&&n[0].title,n);else throw Error(`无法识别的文件格式`);if(r.length===0){I(`文件中没有可导入的会话数据`,`warning`);return}let i=await _r(r);await W(),console.log(`[SidePanel] 导入完成:`,i.length,`个会话`),I(`成功导入 ${i.length} 个会话`,`success`)}catch(e){console.error(`[SidePanel] 导入失败:`,e),I(`导入失败: `+e.message,`error`)}}function yi(){document.getElementById(`confirmModal`).classList.add(`show`)}function bi(){document.getElementById(`confirmModal`).classList.remove(`show`)}var K=1,q=0,J=0,xi=!1,Si=0,Ci=0,wi=0,Ti=0,Y=[],X=0;function Ei(){let e=document.getElementById(`imagePreviewLarge`);e&&(e.style.transform=`translate(${q}px, ${J}px) scale(${K})`,K>1?(e.classList.add(`zoomable`),xi?e.classList.add(`dragging`):e.classList.remove(`dragging`)):e.classList.remove(`zoomable`,`dragging`))}function Di(){K=1,q=0,J=0,xi=!1,Ei()}function Oi(e,t){let n=document.getElementById(`imagePreviewOverlay`),r=document.getElementById(`imagePreviewLarge`);!n||!r||(ki(e,t),Ai(),Mi(e),n.classList.add(`show`))}function ki(e,t){Y=[],t&&(t.closest(`.image-preview-bar`)||t.classList.contains(`image-preview-thumb`)?document.querySelectorAll(`.image-preview-thumb`).forEach(e=>{e.src&&Y.push(e.src)}):t.closest(`.user-message-images`)&&t.closest(`.user-message-images`).querySelectorAll(`.user-message-image`).forEach(e=>{e.src&&Y.push(e.src)})),Y.length===0&&document.querySelectorAll(`.image-preview-thumb, .user-message-image`).forEach(e=>{e.src&&Y.push(e.src)}),X=Y.indexOf(e),X===-1&&(Y.push(e),X=Y.length-1)}function Ai(){let e=document.getElementById(`imagePreviewPrev`),t=document.getElementById(`imagePreviewNext`),n=document.getElementById(`imagePreviewCounter`);Y.length<=1?(e&&(e.style.display=`none`),t&&(t.style.display=`none`),n&&(n.style.display=`none`)):(e&&(e.style.display=``),t&&(t.style.display=``),n&&(n.style.display=``),ji())}function ji(){let e=document.getElementById(`imagePreviewPrev`),t=document.getElementById(`imagePreviewNext`),n=document.getElementById(`imagePreviewCounter`);e&&(e.disabled=!1),t&&(t.disabled=!1),n&&(n.textContent=`${X+1} / ${Y.length}`)}function Mi(e){let t=document.getElementById(`imagePreviewLarge`);t&&(Di(),t.src=e)}function Ni(e){let t=Y.length;t!==0&&(X=(X+e+t)%t,Mi(Y[X]),ji())}function Pi(){let e=document.getElementById(`imagePreviewOverlay`);if(!e||e.dataset.initialized)return;e.dataset.initialized=`true`;let t=document.getElementById(`imagePreviewLarge`),n=()=>{e.classList.remove(`show`),Di()};e.addEventListener(`click`,t=>{t.target===e&&n()});let r=e.querySelector(`.image-preview-close`);r&&r.addEventListener(`click`,n);let i=document.getElementById(`imagePreviewPrev`),a=document.getElementById(`imagePreviewNext`);i&&i.addEventListener(`click`,e=>{e.stopPropagation(),Ni(-1)}),a&&a.addEventListener(`click`,e=>{e.stopPropagation(),Ni(1)}),document.addEventListener(`keydown`,t=>{e.classList.contains(`show`)&&(t.key===`Escape`?n():t.key===`ArrowLeft`?Ni(-1):t.key===`ArrowRight`&&Ni(1))}),e.addEventListener(`wheel`,n=>{if(!e.classList.contains(`show`))return;n.preventDefault();let r=t.getBoundingClientRect(),i=n.clientX-r.left-r.width/2,a=n.clientY-r.top-r.height/2,o=n.deltaY>0?-.15:.15,s=K,c=Math.max(.3,Math.min(5,K+o)),l=c/s;K=c,q=i-l*(i-q),J=a-l*(a-J),Ei()},{passive:!1}),t.addEventListener(`mousedown`,t=>{!e.classList.contains(`show`)||K<=1||(t.preventDefault(),xi=!0,Si=t.clientX,Ci=t.clientY,wi=q,Ti=J,Ei())}),document.addEventListener(`mousemove`,e=>{xi&&(q=wi+(e.clientX-Si),J=Ti+(e.clientY-Ci),Ei())}),document.addEventListener(`mouseup`,()=>{xi&&(xi=!1,Ei())}),t.addEventListener(`dblclick`,()=>{e.classList.contains(`show`)&&(K>1?Di():(K=2,q=0,J=0,Ei()))})}function Fi(e){let t=new Image,n=URL.createObjectURL(e);t.onload=()=>{URL.revokeObjectURL(n);let{width:e,height:r}=t,i=1024;(e>i||r>i)&&(e>r?(r=Math.round(i/e*r),e=i):(e=Math.round(i/r*e),r=i));let a=document.createElement(`canvas`);a.width=e,a.height=r,a.getContext(`2d`).drawImage(t,0,0,e,r);let o=a.toDataURL(`image/jpeg`,.65);M.attachedImages.push({dataUrl:o});let s=document.getElementById(`imagePreviewBar`),c=document.getElementById(`userInput`);s&&(s.style.display=``),Ii(),c&&c.focus()},t.onerror=()=>{URL.revokeObjectURL(n),console.error(`[ChatManager] 图片加载失败`)},t.src=n}function Ii(){let e=document.getElementById(`imagePreviewBar`);if(e){if(e.innerHTML=``,M.attachedImages.length===0){e.style.display=`none`;return}e.style.display=``,M.attachedImages.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`image-preview-item`;let i=document.createElement(`img`);i.src=t.dataUrl,i.className=`image-preview-thumb`,i.title=`点击查看大图`,i.style.cursor=`zoom-in`,i.addEventListener(`click`,()=>{Oi(t.dataUrl,i)});let a=document.createElement(`button`);a.className=`image-preview-remove`,a.innerHTML=`×`,a.title=`移除图片`,a.addEventListener(`click`,e=>{e.stopPropagation(),M.attachedImages.splice(n,1),Ii()}),r.appendChild(i),r.appendChild(a),e.appendChild(r)})}}function Li(e){if(!M.enableImageInput||M.attachedImages.length===0)return e;let t=[{type:`text`,text:e}];for(let e of M.attachedImages)t.push({type:`image_url`,image_url:{url:e.dataUrl}});return t}function Ri(e){if(typeof e==`string`)return e;if(Array.isArray(e)){let t=e.filter(e=>e.type===`text`);return t.length===1?t[0].text:t}return e}async function zi(){let e=document.getElementById(`userInput`),t=document.getElementById(`sendBtn`),n=document.getElementById(`chatContainer`),r=e.value.trim();if(!r||M.isGenerating)return;let i=n.querySelector(`.welcome-message`);i&&i.remove();let a=r,o=M.enableSelectionQuery&&M.selectedContextText&&M.selectedContextText.trim(),s=M.quotedContextText&&M.quotedContextText.trim();if(s){let{compressed:e,wasCompressed:t}=h(M.quotedContextText.trim());a=`[引用内容${t?`摘要`:``}]\n${e}\n\n[用户问题]\n${r}`,M.quotedContextText=``}else if(o){let{compressed:e,wasCompressed:t}=h(M.selectedContextText.trim());a=`[选中内容${t?`摘要`:``}]\n${e}\n\n[用户问题]\n${r}`,M.selectedContextText=``}let l=Li(a);Z(`user`,l),M.messageHistory.push({role:`user`,content:l}),G(),pt(r),M.inputHistoryIndex=-1,e.value=``,e.style.height=`auto`,(o||s)&&li(),M.isGenerating=!0,t.disabled=!0;let f=M.activeSessionId,m=ca(),_=M.enableImageInput&&M.attachedImages.length>0&&M.imageModelName||M.currentModel;if(M.attachedImages.length>0){let e=document.getElementById(`imagePreviewBar`);e&&(e.innerHTML=``,e.style.display=`none`)}try{await ut();let e=await Gn(),t=Kn(e);M.activeAgentToolIds=t,console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - agent:`,e?e.name:`默认助手`),console.log(`  - agentToolIds:`,t),console.log(`  - isolateChat:`,M.isolateChat),console.log(`  - chatConfig:`,M.chatConfig),console.log(`  - messageHistory.length:`,M.messageHistory.length);let n=[{role:`system`,content:await st(e)}];if(M.isolateChat){let e=M.messageHistory,t=M.chatConfig.contextWindow||0,r=g(_,M.enabledTools.length,t),i=Math.floor(r*.7),a=M.messageHistory.slice(0,-1),o=M.messageHistory[M.messageHistory.length-1],s=[],c=v([o]);for(let e=a.length-1;e>=0;e--){let t=a[e],n=v([t]);if(c+n<=i)s.unshift(t),c+=n;else break}if(s.length<a.length){let e=a.length-s.length,t=u(a.slice(0,e));t&&(n[0]={...n[0],content:n[0].content+`

`+t}),console.log(`[SidePanel] Token 预算裁剪: 保留 ${s.length} 条历史消息, 裁剪 ${e} 条 (预算: ${i} tokens)`)}else console.log(`[SidePanel] Token 预算内: ${s.length} 条历史消息 (预算: ${i} tokens)`);e=[...s,o],n=[...n,...e];for(let e=0;e<n.length-1;e++)n[e]={...n[e],content:Ri(n[e].content)}}else{let e=Li(a);n.push({role:`user`,content:e})}let r=await ct();r._loadingId=m;let i=M.chatConfig.contextWindow||0,o=v(n),s=c(o,d(_,i));if(console.log(`[SidePanel] 发送上下文: ${o} tokens (消息: ${n.length} 条), 压力: ${s.level}(${Math.round(s.ratio*100)}%)`),s.level===`critical`){console.warn(`[SidePanel] 上下文压力过高，主动裁剪...`);let e=g(_,M.enabledTools.length,i),t=p(n,e,{generateSummary:!1});n=t.messages,console.warn(`[SidePanel] 已主动裁剪: ${o} → ${v(n)} tokens (${t.trimmedCount} 条)`)}let l,h,y,b=!1,x=!1,S=null,C=!0;try{let e=await _a(n,_,M.useTools,r);l=e.content,h=e.executionLog||[],y=e.reflectionScore,b=e.wasRevised||!1,x=e.wasStreamed||!1,S=e.streamingHtml||null,C=e.streamingConnected===void 0?!0:e.streamingConnected}catch(e){if(M.activeSessionId!==f){e.message===`任务已被用户停止`?vr(f,{role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}):vr(f,{role:`assistant`,content:`❌ 请求失败：`+(e.message||`未知错误`),executionLog:e.executionLog||[]}),$(m),M.substituteLoadingIds.delete(f);return}if(e.message===`任务已被用户停止`){$(m),M.substituteLoadingIds.delete(f),Z(`assistant`,`任务已取消`,!1,e.executionLog||[]),M.messageHistory.push({role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}),G();return}throw $(m),M.substituteLoadingIds.delete(f),l=`❌ 请求失败：`+(e.message||`未知错误`),h=e.executionLog||[],Z(`assistant`,l,!0,h,y),M.messageHistory.push({role:`assistant`,content:l,executionLog:h,reflectionScore:y}),e}if(M.activeSessionId!==f){let e={role:`assistant`,content:l,executionLog:h,reflectionScore:y,wasRevised:b};x&&S&&(e.htmlContent=S),vr(f,e),$(m),M.substituteLoadingIds.delete(f);return}x?M.substituteLoadingIds.has(f)&&($(M.substituteLoadingIds.get(f)),M.substituteLoadingIds.delete(f)):($(m),M.substituteLoadingIds.has(f)&&($(M.substituteLoadingIds.get(f)),M.substituteLoadingIds.delete(f)),await yn(Z(`assistant`,l,!0,h,y,b)));let w={role:`assistant`,content:l,executionLog:h,reflectionScore:y,wasRevised:b};if(x&&S&&(w.htmlContent=S,!C)){ua(S);let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)}M.messageHistory.push(w)}catch(e){console.error(`[SidePanel] sendMessage 异常:`,e?.message||e)}finally{G(),M.generatingSessionIds.delete(f),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),t.disabled=!1,e.focus(),M.attachedImages=[];let n=document.getElementById(`imagePreviewBar`);n&&(n.style.display=`none`)}}function Bi(e,t){let n=document.getElementById(`userInput`);if(!t||M.isGenerating){console.log(`[SidePanel] triggerSelectionSearch 跳过:`,{hasText:!!t,isGenerating:M.isGenerating});return}let r=M.enableSelectionQuery;M.enableSelectionQuery=!0,M.selectedContextText=t,M.quotedContextText=``,n.value=`搜索一下`,n.dispatchEvent(new Event(`input`)),zi(),M.enableSelectionQuery=!1,setTimeout(()=>{M.enableSelectionQuery=r},1500)}function Vi(e){let t=document.getElementById(`userInput`);!t||!e||(t.value=e,t.dispatchEvent(new Event(`input`)),t.focus())}function Hi(e,t=``){let n=document.getElementById(`userInput`);!n||!e||M.isGenerating||(t&&(M.enableSelectionQuery=!0,M.selectedContextText=t,M.quotedContextText=``),n.value=e,n.dispatchEvent(new Event(`input`)),n.focus(),zi(),t&&(M.enableSelectionQuery=!1,setTimeout(()=>{M.enableSelectionQuery=!0},1500)))}function Ui(e,t,n=!0){let r=document.getElementById(`chatContainer`),i=document.createElement(`div`);i.className=`user-context-bubble`,i.dataset.role=`context`,i.innerHTML=`
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${e===`quoted`?`💬`:`📌`}</span>
        <span class="context-type">${e===`quoted`?`引用内容`:`选中内容`}</span>
      </div>
      <div class="context-bubble-content">${L(t)}</div>
    </div>
  `;let a=i.querySelector(`.context-bubble-header`),o=i.querySelector(`.context-bubble-content`);return a.addEventListener(`click`,e=>{e.stopPropagation(),o.classList.toggle(`expanded`)}),r.appendChild(i),n&&(r.scrollTop=r.scrollHeight),i}function Z(e,t,n=!0,r=[],i=null,a=!1){let o=document.getElementById(`chatContainer`),s=document.createElement(`div`);s.className=`message ${e}`;let c=new Date().toISOString();s.dataset.timestamp=c;let l=Array.isArray(t)?t.filter(e=>e.type===`text`).map(e=>e.text).join(``):t,u=Array.isArray(t)&&t.some(e=>e.type===`image_url`);if(s.dataset.rawContent=Array.isArray(t)?JSON.stringify(t):t,s.dataset.textContent_=l,s.dataset.executionLog=JSON.stringify(r),a&&(s.dataset.wasRevised=`true`),e===`assistant`){s.innerHTML=mn(t);let e=document.createElement(`div`);e.className=`message-footer`;let n=document.createElement(`button`);n.className=`copy-btn`,n.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),n.addEventListener(`click`,e=>{e.stopPropagation(),xa(s,n)}),e.appendChild(n);let o=document.createElement(`button`);o.className=`quote-btn`,o.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),wa(s)}),e.appendChild(o);let c=document.createElement(`div`);c.className=`export-menu-container`;let l=document.createElement(`button`);l.className=`export-trigger-btn`,l.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let u=document.createElement(`div`);u.className=`export-dropdown`,u.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),u.querySelector(`.export-docx-item`).addEventListener(`click`,e=>{e.stopPropagation(),Sa(s,l),u.classList.remove(`show`)}),u.querySelector(`.export-pdf-item`).addEventListener(`click`,e=>{e.stopPropagation(),Ca(s,l),u.classList.remove(`show`)}),l.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.toggle(`show`)});let d=null;c.addEventListener(`mouseenter`,()=>{d=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.add(`show`)},300)}),c.addEventListener(`mouseleave`,()=>{d&&=(clearTimeout(d),null),setTimeout(()=>{!c.matches(`:hover`)&&!u.matches(`:hover`)&&u.classList.remove(`show`)},100)}),c.appendChild(l),c.appendChild(u),e.appendChild(c);let f=r&&r.length>0,p=i!=null,m=r?r.filter(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.status===`success`).length:0;Ji(),Xi();let h=r?.find(e=>e.nodeType===`reflection`&&e.reflectionType===`post`);if(f&&M.chatConfig.enableExecutionLog){let t=document.createElement(`button`);t.className=`execution-log-btn`,t.type=`button`,t.title=`执行日志`,t.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),e.appendChild(t)}if(p&&M.chatConfig.enableExecutionLog){let t=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,n=i>=8?`✅`:i>=5?`🔍`:`⚠️`,r=a?` <span class="reflection-revised-tag">已修订</span>`:``,o=m>1?` (${m}轮)`:``,s=document.createElement(`button`);s.className=`reflection-score-btn`,s.type=`button`,s.title=`AI 质量评估: ${i}/10${o}${a?`（已修订）`:``}\n点击查看评估详情`,s.innerHTML=`<span class="reflection-badge ${t}">${n} ${i}/10${r}</span>`,s.dataset.reflectionData=JSON.stringify({overallScore:h?.overallScore??i,dimensions:h?.dimensions||null,issues:h?.issues||null,suggestions:h?.suggestions||null,decision:h?.action?.decision||null,useful:h?.useful??null,reasoning:h?.reasoning||null,suggestion:h?.suggestion||null,rounds:m,wasRevised:a}),e.appendChild(s)}else if(!p&&h&&h.status===`failed`&&M.chatConfig?.enableExecutionLog){let t=document.createElement(`button`);t.className=`reflection-score-btn`,t.type=`button`,t.title=`反思评估失败（点击查看执行日志）`,t.innerHTML=`<span class="reflection-badge score-low">⚠️ 反思失败</span>`,e.appendChild(t)}let g=r?.find(e=>e.nodeType===`tool_exec`&&e.action?.name===`preview_ui_prototype`&&e.status===`success`);if(g){let t=document.createElement(`button`);t.className=`prototype-btn-small`,t.type=`button`,t.title=`查看 UI 原型`,t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,t.addEventListener(`click`,()=>{let e=g.prototypeId;if(!e&&g.observation)try{e=(typeof g.observation==`string`?JSON.parse(g.observation):g.observation)?.prototypeId}catch{}e?Wt(e):console.error(`[SidePanel] 未找到 prototypeId，entry keys:`,Object.keys(g),`observation:`,g.observation)}),e.appendChild(t)}s.appendChild(e)}else{let e=l.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),n=l.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),r=e||n;if(r){let t=e?`quoted`:`selected`,n=r[1].trim(),i=r[2].trim();s._pendingContext={type:t,contextText:n,userQuestion:i},s.textContent=i}else s.textContent=l;if(u){let e=document.createElement(`div`);e.className=`user-message-images`,t.filter(e=>e.type===`image_url`).forEach((t,n)=>{let r=document.createElement(`img`);r.src=t.image_url.url,r.className=`user-message-image`,r.title=`点击查看大图`,r.addEventListener(`click`,()=>{Oi(t.image_url.url,r)}),e.appendChild(r)}),s.appendChild(e)}let i=document.createElement(`div`);i.className=`message-toolbar`;let a=document.createElement(`button`);a.className=`message-toolbar-btn copy-btn`,a.title=`复制内容`,a.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`].join(``),a.addEventListener(`click`,e=>{e.stopPropagation(),ya(s,a)});let o=document.createElement(`button`);o.className=`message-toolbar-btn edit-btn`,o.title=`编辑后重新发送`,o.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>`,`</svg>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),ba(s)}),i.appendChild(a),i.appendChild(o),s.appendChild(i)}if(o.appendChild(s),s._pendingContext){let{type:e,contextText:t}=s._pendingContext,n=Ui(e,t,!1);o.insertBefore(n,s),delete s._pendingContext}if(n){let e=o.querySelectorAll(`.message.user`);if(e.length>0){let t=e[e.length-1],n=t.previousElementSibling;n&&n.classList.contains(`user-context-bubble`)?n.scrollIntoView({behavior:`smooth`,block:`start`}):t.scrollIntoView({behavior:`smooth`,block:`start`})}}return e===`assistant`&&Sn(),s}var Wi=!1,Gi=new Map,Q=null,Ki=0,qi=0;function Ji(){if(Wi)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.execution-log-btn`);if(!t)return;let n=t.closest(`.message`);if(!n)return;e.preventDefault(),e.stopPropagation();let r=n.dataset.executionLog;if(r)try{let e=JSON.parse(r);console.log(`[chat-manager] 执行日志按钮点击(委托), entries:`,e.length),va(e)}catch(e){console.error(`[chat-manager] 解析 executionLog 失败:`,e)}}),Wi=!0)}var Yi=!1;function Xi(){if(Yi)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.reflection-score-btn`);if(!t)return;e.preventDefault(),e.stopPropagation();let n=t.dataset.reflectionData;if(n)try{Zi(JSON.parse(n),t)}catch(e){console.error(`[chat-manager] 解析 reflectionData 失败:`,e)}}),Yi=!0)}function Zi(e,t){let n=document.querySelector(`.reflection-info-overlay`);n&&n.remove();let r=document.createElement(`div`);r.className=`reflection-info-overlay`;let{overallScore:i,dimensions:a,issues:o,suggestions:s,decision:c,useful:l,reasoning:u,suggestion:d,rounds:f,wasRevised:p}=e,m=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,h=i>=8?`✅`:i>=5?`🔍`:`⚠️`,g=c===`passed`?`✅ 通过`:c===`revised`?`🔧 已修订`:c===`needs_improvement`?`⚠️ 需改进`:``,_={accuracy:`准确性`,completeness:`完整性`,relevance:`相关性`,clarity:`清晰度`,usefulness:`实用性`,safety:`安全性`,efficiency:`效率`},v=``;a&&Object.keys(a).length>0&&(v=`
      <div class="ri-section">
        <div class="ri-section-title">📊 各维度评分</div>
        <div class="ri-dimensions">
          ${Object.entries(a).map(([e,t])=>{let n=_[e]||e,r=t>=8?`#10b981`:t>=5?`#f59e0b`:`#ef4444`;return`
              <div class="ri-dim-item">
                <span class="ri-dim-label">${L(n)}</span>
                <span class="ri-dim-bar-bg"><span class="ri-dim-bar-fill" style="width:${t*10}%;background:${r}"></span></span>
                <span class="ri-dim-score" style="color:${r}">${t}/10</span>
              </div>
            `}).join(``)}
        </div>
      </div>
    `);let y=``;o&&o.length>0&&(y=`
      <div class="ri-section">
        <div class="ri-section-title">📋 发现的问题</div>
        <ul class="ri-list">${o.map(e=>`<li>${L(e)}</li>`).join(``)}</ul>
      </div>
    `);let b=``;s&&s.length>0&&(b=`
      <div class="ri-section">
        <div class="ri-section-title">💡 改进建议</div>
        <ul class="ri-list">${s.map(e=>`<li>${L(e)}</li>`).join(``)}</ul>
      </div>
    `);let x=``;if(f>0||c||l!==null){let e=[];f>0&&e.push(`<span class="ri-tag">🔄 经过 ${f} 轮评估${p?`（已修订）`:``}</span>`),c&&e.push(`<span class="ri-tag">🎯 最终决策: ${g}</span>`),l!==null&&e.push(`<span class="ri-tag">${l?`✅ AI 认为结果有用`:`⚠️ AI 认为结果需要改进`}</span>`),u&&e.push(`<div class="ri-reasoning">📝 ${L(u)}</div>`),x=`
      <div class="ri-section">
        <div class="ri-section-title">🔍 评估过程</div>
        <div class="ri-process">${e.join(``)}</div>
      </div>
    `}r.innerHTML=`
    <div class="reflection-info-panel">
      <div class="ri-header">
        <div class="ri-title">质量评估详情</div>
        <button class="ri-close" title="关闭">✕</button>
      </div>
      <div class="ri-body">
        <div class="ri-score-overview">
          <span class="ri-score-emoji">${h}</span>
          <span class="ri-score-value ${m}">${i}<span class="ri-score-max">/10</span></span>
          <span class="ri-score-label">综合评分</span>
        </div>
        <div class="ri-section">
          <div class="ri-section-title">📖 评分说明</div>
          <p class="ri-text">${i>=8?`AI 认为回答质量较高，准确性和完整性良好，可以直接使用。`:i>=5?`AI 认为回答存在一些不足，建议核实关键信息或补充细节后再使用。`:`AI 认为回答质量较低，可能存在较多错误或遗漏，建议重新提问或调整问题表述。`}</p>
        </div>
        ${v}
        ${y}
        ${b}
        ${x}
        <div class="ri-section ri-about">
          <div class="ri-section-title">ℹ️ 什么是质量评估？</div>
          <p class="ri-text">质量评估是 AI 在生成回答后，对自己的回答进行的<strong>自我反思和评分</strong>。AI 会从准确性、完整性、相关性等多个维度审视回答质量，发现潜在问题并尝试改进。</p>
          <p class="ri-text ri-text-sm">评分标准：<span style="color:#10b981">✅ 8-10分 质量良好</span> · <span style="color:#f59e0b">🔍 5-7分 需要关注</span> · <span style="color:#ef4444">⚠️ 1-4分 存在较多问题</span></p>
        </div>
      </div>
    </div>
  `,document.body.appendChild(r),r.querySelector(`.ri-close`).addEventListener(`click`,()=>r.remove()),r.addEventListener(`click`,e=>{e.target===r&&r.remove()});let S=t.getBoundingClientRect(),C=r.querySelector(`.reflection-info-panel`),w=Math.min(window.innerHeight-40,560),T=S.right-380;T<10&&(T=10),T+380>window.innerWidth-10&&(T=window.innerWidth-380-10);let E=S.bottom+6;E+w>window.innerHeight-10&&(E=S.top-w-6),E<10&&(E=10),C.style.left=T+`px`,C.style.top=E+`px`,C.style.maxHeight=w+`px`}function Qi(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)),n=t.length,r=``,i=null;return t.forEach((e,t)=>{let a=e.nodeType===`subtask`,o=e.nodeType===`tool_exec`,s=e.nodeType===`api_call`,c=e.nodeType===`preselect`,l=e.nodeType===`reflection`,u=o&&e.action?.name===`plan_task`;a&&(i=e.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&i!==null?(d=`tool-level`,f=`🔧`):s&&i!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=e.status||`processing`;e.status===`success`?p=`✓`:e.status===`failed`&&(p=`✗`),l&&(m=`reflection ${m}`);let h=L(e.nodeName||`未知节点`);if(e.subtaskIndex!==null&&e.subtaskIndex>=0&&(h=`<span class="subtask-badge">${e.subtaskIndex+1}</span> ${h}`),e.subtaskCount&&(h+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!c&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(h+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}r+=`
      <div class="timeline-item ${d}" data-status="${e.status||`processing`}" data-node-type="${e.nodeType||``}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${m}">
          ${p}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${f}</span>
            <span class="iteration-badge">[${t+1}/${n}]</span>
            <span class="node-name" title="${L(e.nodeName||`未知节点`)}">${h}</span>
            <span class="duration-badge" title="耗时">${at(e.duration||0)}</span>
          </div>
          
          <div class="timeline-details">
            ${e.thought&&e.thought.trim()?`
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${L(e.thought)}</div>
            </div>
            `:``}
            
            ${!c&&e.action?`
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${L(e.action.name)}<br>
                <strong>参数:</strong> <code>${L(JSON.stringify(e.action.params,null,2))}</code>
              </div>
            </div>
            `:``}
            
            ${c&&e.action?.params?.selected?`
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${e.action.params.selected.map(e=>L(e)).join(`, `)}<br>
                <strong>数量:</strong> ${e.action.params.selected.length} 个
              </div>
            </div>
            `:``}
            
            ${e.observation?`
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${L(e.observation)}</div>
            </div>
            `:``}
            
            ${e.apiRequest?`
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${e.apiRequest.model?`<strong>模型:</strong> ${L(e.apiRequest.model)}<br>`:``}
                ${e.apiRequest.temperature===void 0?``:`<strong>温度:</strong> ${e.apiRequest.temperature}<br>`}
                ${e.apiRequest.top_p===void 0?``:`<strong>top_p:</strong> ${e.apiRequest.top_p}<br>`}
                ${e.apiRequest.messageCount===void 0?``:`<strong>消息数:</strong> ${e.apiRequest.messageCount}<br>`}
                ${!c&&e.apiRequest.toolCount!==void 0?`<strong>工具数:</strong> ${e.apiRequest.toolCount}<br>`:``}
              </div>
            </div>
            `:``}
            
            ${e.apiResponse?`
            <div class="timeline-section">
              <div class="section-title">📤 API 响应</div>
              <div class="section-content">
                ${e.apiResponse.finishReason?`<strong>完成原因:</strong> ${L(e.apiResponse.finishReason)}<br>`:``}
                ${e.apiResponse.toolCountAfter===void 0?``:`<strong>筛选后工具数:</strong> ${e.apiResponse.toolCountAfter} 个<br>`}
                ${e.apiResponse.tokenUsage?`
                  <strong>Token 使用:</strong><br>
                  - Prompt: ${e.apiResponse.tokenUsage.prompt_tokens||0}<br>
                  - Completion: ${e.apiResponse.tokenUsage.completion_tokens||0}<br>
                  - Total: ${e.apiResponse.tokenUsage.total_tokens||0}
                `:``}
              </div>
            </div>
            `:``}
            
            ${e.error?`
            <div class="timeline-section error">
              <div class="section-title">❌ 错误信息</div>
              <div class="section-content">${L(e.error)}</div>
            </div>
            `:``}
            
            ${e.result?`
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${L(e.result)}</div>
            </div>
            `:``}
            
            ${l?`
            <div class="timeline-section reflection-details">
              ${e.prompt?`
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${L(e.prompt)}</pre></div>
              </div>
              `:``}
              ${e.rawContent?`
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${L(e.rawContent)}</pre></div>
              </div>
              `:``}
              ${e.apiResponse?.tokenUsage?`
              <div class="timeline-section">
                <div class="section-title">📊 Token 使用</div>
                <div class="section-content">
                  - Prompt: ${e.apiResponse.tokenUsage.prompt_tokens||0}<br>
                  - Completion: ${e.apiResponse.tokenUsage.completion_tokens||0}<br>
                  - Total: ${e.apiResponse.tokenUsage.total_tokens||0}
                </div>
              </div>
              `:``}
              ${e.overallScore!==void 0&&e.overallScore!==null?`
              <div class="section-title">⭐ 综合评分: ${e.overallScore}/10</div>
              `:``}
              ${e.dimensions&&Object.keys(e.dimensions).length>0?`
              <div class="reflection-dimensions">
                ${Object.entries(e.dimensions).map(([e,t])=>`
                  <div class="dimension-item">
                    <span class="dim-label">${e}</span>
                    <span class="dim-bar"><span class="dim-fill" style="width:${t*10}%"></span></span>
                    <span class="dim-score">${t}/10</span>
                  </div>
                `).join(``)}
              </div>
              `:``}
              ${e.issues&&e.issues.length>0?`
              <div class="section-title">📋 发现的问题</div>
              <div class="section-content"><ul>${e.issues.map(e=>`<li>${L(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${e.suggestions&&e.suggestions.length>0?`
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${e.suggestions.map(e=>`<li>${L(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${e.action?.decision?`
              <div class="section-title">🎯 决策: ${L(e.action.decision===`passed`?`✅ 通过`:e.action.decision===`revised`?`🔧 已修订`:e.action.decision===`needs_improvement`?`⚠️ 需改进`:e.action.decision)}</div>
              `:``}
              ${e.useful===void 0?``:`
              <div class="section-title">${e.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
              ${e.reasoning?`<div class="section-content">${L(e.reasoning)}</div>`:``}
              ${e.suggestion?`<div class="section-content">建议: ${L(e.suggestion)}</div>`:``}
              `}
            </div>
            `:``}
          </div>
        </div>
      </div>
    `}),r}function $i(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp));if(!t.some(e=>e.taskGroup))return ra(t);let n=new Map,r=[];t.forEach(e=>{e.taskGroup?(n.has(e.taskGroup)||n.set(e.taskGroup,{groupId:e.taskGroup,groupIndex:e.taskGroupIndex,groupName:e.taskGroupName,entries:[],status:e.status}),n.get(e.taskGroup).entries.push(e),e.status&&(n.get(e.taskGroup).status=e.status)):r.push(e)});let i=ea(r,t.length);return n.forEach((e,n)=>{let r=e.status||`processing`;i+=`
      <div class="task-group-container" data-group-id="${n}">
        <div class="task-group-header" onclick="this.parentElement.classList.toggle('collapsed')">
          <div class="task-group-line"></div>
          <div class="task-group-dot ${r}">
            ${r===`success`?`✓`:r===`failed`?`✗`:`○`}
          </div>
          <div class="task-group-content">
            <div class="task-group-title">
              <span class="task-group-expand-icon">▼</span>
              <span class="task-group-icon">📁</span>
              <span class="task-group-index">${e.groupIndex}</span>
              <span class="task-group-name">${L(e.groupName)}</span>
              <span class="task-group-count">(${e.entries.length} 步骤)</span>
            </div>
          </div>
        </div>
        <div class="task-group-timeline">
          ${ta(e.entries,t.length)}
        </div>
      </div>
    `}),i}function ea(e,t){if(e.length===0)return``;let n=``;return n+=`
    <div class="main-tasks-container">
      <div class="main-tasks-header">
        <div class="main-tasks-line"></div>
        <div class="main-tasks-dot processing">
          ◉
        </div>
        <div class="main-tasks-content">
          <div class="main-tasks-title">
            <span class="main-tasks-icon">🏠</span>
            <span class="main-tasks-name">主任务</span>
            <span class="main-tasks-count">(${e.length} 步骤)</span>
          </div>
        </div>
      </div>
      <div class="main-tasks-timeline">
  `,e.forEach((e,r)=>{n+=na(e,r,t)}),n+=`
      </div>
    </div>
  `,n}function ta(e,t){let n=``;return e.forEach((e,r)=>{n+=na(e,r,t)}),n}function na(e,t,n){let r=e.nodeType===`subtask`,i=e.nodeType===`tool_exec`,a=e.nodeType===`api_call`,o=e.nodeType===`preselect`,s=e.nodeType===`reflection`,c=i&&e.action?.name===`plan_task`,l=``,u=``;s?(l=`reflection-level`,u=`🎯`):o?u=`📡`:c?(l=`plan-task-level`,u=`📋`):r?(l=`subtask-level`,u=`🔀`):i?(l=`tool-level`,u=`🔧`):a?(l=`api-level`,u=`📡`):i?u=`⚡`:a&&(u=`📡`);let d=`○`,f=e.status||`processing`;e.status===`success`?d=`✓`:e.status===`failed`&&(d=`✗`),s&&(f=`reflection ${f}`);let p=L(e.nodeName||`未知节点`);if(e.subtaskCount&&(p+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(a||o)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!o&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(p+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}return`
    <div class="timeline-item ${l}">
      <div class="timeline-line"></div>
      <div class="timeline-dot ${f}">
        ${d}
      </div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="expand-icon">▼</span>
          <span class="node-icon">${u}</span>
          <span class="iteration-badge">[${t+1}/${n}]</span>
          <span class="node-name" title="${L(e.nodeName||`未知节点`)}">${p}</span>
          <span class="duration-badge" title="耗时">${at(e.duration)}</span>
        </div>
        
        <div class="timeline-details">
          ${e.thought&&e.thought.trim()?`
          <div class="timeline-section">
            <div class="section-title">💡 思考</div>
            <div class="section-content">${L(e.thought)}</div>
          </div>
          `:``}
          
          ${!o&&e.action?`
          <div class="timeline-section">
            <div class="section-title">⚡ 工具调用</div>
            <div class="section-content">
              <strong>工具:</strong> ${L(e.action.name)}<br>
              <strong>参数:</strong> <code>${L(JSON.stringify(e.action.params,null,2))}</code>
            </div>
          </div>
          `:``}
          
          ${o&&e.action?.params?.selected?`
          <div class="timeline-section">
            <div class="section-title">🔍 筛选结果</div>
            <div class="section-content">
              <strong>选中工具:</strong> ${e.action.params.selected.map(e=>L(e)).join(`, `)}<br>
              <strong>数量:</strong> ${e.action.params.selected.length} 个
            </div>
          </div>
          `:``}
          
          ${e.observation?`
          <div class="timeline-section">
            <div class="section-title">📝 观察结果</div>
            <div class="section-content">${L(e.observation)}</div>
          </div>
          `:``}
          
          ${e.apiRequest?`
          <div class="timeline-section">
            <div class="section-title">📡 API 请求</div>
            <div class="section-content">
              ${e.apiRequest.model?`<strong>模型:</strong> ${L(e.apiRequest.model)}<br>`:``}
              ${e.apiRequest.temperature===void 0?``:`<strong>温度:</strong> ${e.apiRequest.temperature}<br>`}
              ${e.apiRequest.top_p===void 0?``:`<strong>top_p:</strong> ${e.apiRequest.top_p}<br>`}
              ${e.apiRequest.messageCount===void 0?``:`<strong>消息数:</strong> ${e.apiRequest.messageCount}<br>`}
              ${!o&&e.apiRequest.toolCount!==void 0?`<strong>工具数:</strong> ${e.apiRequest.toolCount}<br>`:``}
            </div>
          </div>
          `:``}
          
          ${e.apiResponse?`
          <div class="timeline-section">
            <div class="section-title">📤 API 响应</div>
            <div class="section-content">
              ${e.apiResponse.finishReason?`<strong>完成原因:</strong> ${L(e.apiResponse.finishReason)}<br>`:``}
              ${e.apiResponse.toolCountAfter===void 0?``:`<strong>筛选后工具数:</strong> ${e.apiResponse.toolCountAfter} 个<br>`}
              ${e.apiResponse.tokenUsage?`
                <strong>Token 使用:</strong><br>
                - Prompt: ${e.apiResponse.tokenUsage.prompt_tokens||0}<br>
                - Completion: ${e.apiResponse.tokenUsage.completion_tokens||0}<br>
                - Total: ${e.apiResponse.tokenUsage.total_tokens||0}
              `:``}
            </div>
          </div>
          `:``}
          
          ${e.error?`
          <div class="timeline-section error">
            <div class="section-title">❌ 错误信息</div>
            <div class="section-content">${L(e.error)}</div>
          </div>
          `:``}
          
          ${e.result?`
          <div class="timeline-section">
            <div class="section-title">✅ 子任务结果</div>
            <div class="section-content">${L(e.result)}</div>
          </div>
          `:``}
          
          ${s?`
          <div class="timeline-section reflection-details">
            ${e.overallScore!==void 0&&e.overallScore!==null?`
            <div class="section-title">⭐ 综合评分: ${e.overallScore}/10</div>
            `:``}
            ${e.dimensions&&Object.keys(e.dimensions).length>0?`
            <div class="reflection-dimensions">
              ${Object.entries(e.dimensions).map(([e,t])=>`
                <div class="dimension-item">
                  <span class="dim-label">${e}</span>
                  <span class="dim-bar"><span class="dim-fill" style="width:${t*10}%"></span></span>
                  <span class="dim-score">${t}/10</span>
                </div>
              `).join(``)}
            </div>
            `:``}
            ${e.issues&&e.issues.length>0?`
            <div class="section-title">📋 发现的问题</div>
            <div class="section-content"><ul>${e.issues.map(e=>`<li>${L(e)}</li>`).join(``)}</ul></div>
            `:``}
            ${e.suggestions&&e.suggestions.length>0?`
            <div class="section-title">💡 改进建议</div>
            <div class="section-content"><ul>${e.suggestions.map(e=>`<li>${L(e)}</li>`).join(``)}</ul></div>
            `:``}
            ${e.action?.decision?`
            <div class="section-title">🎯 决策: ${L(e.action.decision===`passed`?`✅ 通过`:e.action.decision===`revised`?`🔧 已修订`:e.action.decision===`needs_improvement`?`⚠️ 需改进`:e.action.decision)}</div>
            `:``}
            ${e.useful===void 0?``:`
            <div class="section-title">${e.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
            ${e.reasoning?`<div class="section-content">${L(e.reasoning)}</div>`:``}
            ${e.suggestion?`<div class="section-content">建议: ${L(e.suggestion)}</div>`:``}
            `}
          </div>
          `:``}
        </div>
      </div>
    </div>
  `}function ra(e){let t=``,n=null;return e.forEach((r,i)=>{let a=r.nodeType===`subtask`,o=r.nodeType===`tool_exec`,s=r.nodeType===`api_call`,c=r.nodeType===`preselect`,l=r.nodeType===`reflection`,u=o&&r.action?.name===`plan_task`;a&&(n=r.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&n!==null?(d=`tool-level`,f=`🔧`):s&&n!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=r.status||`processing`;r.status===`success`?p=`✓`:r.status===`failed`&&(p=`✗`);let h=L(r.nodeName||`未知节点`);if(r.subtaskId&&(h=`<span class="subtask-badge">${n===null?``:n+1}</span> ${h}`),r.subtaskCount&&(h+=` <span class="plan-badge">(${r.subtaskCount}个子任务, ${r.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&r.apiRequest){let e=[];r.apiRequest.messageCount!==void 0&&r.apiRequest.messageCount!==null&&e.push(`💬<span title="本次模型API调用携带的消息数">${r.apiRequest.messageCount}条</span>`),!c&&r.apiRequest.toolCount!==void 0&&r.apiRequest.toolCount!==null&&e.push(`🔧<span title="本次模型API调用携带的工具定义数">${r.apiRequest.toolCount}个</span>`),e.length>0&&(h+=` <span class="api-info-badge">（${e.join(` `)}）</span>`)}t+=`
      <div class="timeline-item ${d}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${m}">
          ${p}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${f}</span>
            <span class="iteration-badge">[${i+1}/${e.length}]</span>
            <span class="node-name" title="${L(r.nodeName||`未知节点`)}">${h}</span>
            <span class="duration-badge" title="耗时">${at(r.duration)}</span>
          </div>
          
          <div class="timeline-details">
            ${r.thought&&r.thought.trim()?`
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${L(r.thought)}</div>
            </div>
            `:``}
            
            ${!c&&r.action?`
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${L(r.action.name)}<br>
                <strong>参数:</strong> <code>${L(JSON.stringify(r.action.params,null,2))}</code>
              </div>
            </div>
            `:``}
            
            ${c&&r.action?.params?.selected?`
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${r.action.params.selected.map(e=>L(e)).join(`, `)}<br>
                <strong>数量:</strong> ${r.action.params.selected.length} 个
              </div>
            </div>
            `:``}
            
            ${r.observation?`
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${L(r.observation)}</div>
            </div>
            `:``}
            
            ${r.apiRequest?`
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${r.apiRequest.model?`<strong>模型:</strong> ${L(r.apiRequest.model)}<br>`:``}
                ${r.apiRequest.temperature===void 0?``:`<strong>温度:</strong> ${r.apiRequest.temperature}<br>`}
                ${r.apiRequest.top_p===void 0?``:`<strong>top_p:</strong> ${r.apiRequest.top_p}<br>`}
                ${r.apiRequest.messageCount===void 0?``:`<strong>消息数:</strong> ${r.apiRequest.messageCount}<br>`}
                ${!c&&r.apiRequest.toolCount!==void 0?`<strong>工具数:</strong> ${r.apiRequest.toolCount}<br>`:``}
              </div>
            </div>
            `:``}
            
            ${r.apiResponse?`
            <div class="timeline-section">
              <div class="section-title">📤 API 响应</div>
              <div class="section-content">
                ${r.apiResponse.finishReason?`<strong>完成原因:</strong> ${L(r.apiResponse.finishReason)}<br>`:``}
                ${r.apiResponse.toolCountAfter===void 0?``:`<strong>筛选后工具数:</strong> ${r.apiResponse.toolCountAfter} 个<br>`}
                ${r.apiResponse.tokenUsage?`
                  <strong>Token 使用:</strong><br>
                  - Prompt: ${r.apiResponse.tokenUsage.prompt_tokens||0}<br>
                  - Completion: ${r.apiResponse.tokenUsage.completion_tokens||0}<br>
                  - Total: ${r.apiResponse.tokenUsage.total_tokens||0}
                `:``}
              </div>
            </div>
            `:``}
            
            ${r.error?`
            <div class="timeline-section error">
              <div class="section-title">❌ 错误信息</div>
              <div class="section-content">${L(r.error)}</div>
            </div>
            `:``}
            
            ${r.result?`
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${L(r.result)}</div>
            </div>
            `:``}
            
            ${l?`
            <div class="timeline-section reflection-details">
              ${r.prompt?`
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${L(r.prompt)}</pre></div>
              </div>
              `:``}
              ${r.rawContent?`
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${L(r.rawContent)}</pre></div>
              </div>
              `:``}
              ${r.apiResponse?.tokenUsage?`
              <div class="timeline-section">
                <div class="section-title">📊 Token 使用</div>
                <div class="section-content">
                  - Prompt: ${r.apiResponse.tokenUsage.prompt_tokens||0}<br>
                  - Completion: ${r.apiResponse.tokenUsage.completion_tokens||0}<br>
                  - Total: ${r.apiResponse.tokenUsage.total_tokens||0}
                </div>
              </div>
              `:``}
              ${r.overallScore!==void 0&&r.overallScore!==null?`
              <div class="section-title">⭐ 综合评分: ${r.overallScore}/10</div>
              `:``}
              ${r.dimensions&&Object.keys(r.dimensions).length>0?`
              <div class="reflection-dimensions">
                ${Object.entries(r.dimensions).map(([e,t])=>`
                  <div class="dimension-item">
                    <span class="dim-label">${e}</span>
                    <span class="dim-bar"><span class="dim-fill" style="width:${t*10}%"></span></span>
                    <span class="dim-score">${t}/10</span>
                  </div>
                `).join(``)}
              </div>
              `:``}
              ${r.issues&&r.issues.length>0?`
              <div class="section-title">📋 发现的问题</div>
              <div class="section-content"><ul>${r.issues.map(e=>`<li>${L(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${r.suggestions&&r.suggestions.length>0?`
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${r.suggestions.map(e=>`<li>${L(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${r.action?.decision?`
              <div class="section-title">🎯 决策: ${L(r.action.decision===`passed`?`✅ 通过`:r.action.decision===`revised`?`🔧 已修订`:r.action.decision===`needs_improvement`?`⚠️ 需改进`:r.action.decision)}</div>
              `:``}
              ${r.useful===void 0?``:`
              <div class="section-title">${r.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
              ${r.reasoning?`<div class="section-content">${L(r.reasoning)}</div>`:``}
              ${r.suggestion?`<div class="section-content">建议: ${L(r.suggestion)}</div>`:``}
              `}
            </div>
            `:``}
          </div>
        </div>
      </div>
    `}),t}function ia(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(!t)return;let n=t.querySelector(`.realtime-executing-node`);n&&(n.textContent=e.nodeName||`处理中...`);let r=e.executionLog||[],i=r.length,a=r.filter(e=>e.status===`success`).length,o=r.filter(e=>e.status===`failed`).length,s=r.filter(e=>e.nodeType===`subtask`).length,c=r.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,l=t.querySelector(`.combo-value`),u=t.querySelector(`.combo-stat.success .stat-value`),d=t.querySelector(`.combo-stat.failed .stat-value`),f=t.querySelector(`.combo-stat.subtask`);l&&(l.textContent=i),u&&(u.textContent=a),d&&(d.textContent=o),f&&(s>0?(f.style.display=``,f.querySelector(`.stat-value`).textContent=`${c}/${s}`):f.style.display=`none`);let p=t.querySelector(`.timeline`);p.innerHTML=r.length>0?Qi(r):`<div class="realtime-waiting-message">等待执行中...</div>`,p.scrollTop=p.scrollHeight}function aa(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel realtime-mode`,n.innerHTML=`
    <div class="log-container">
      <div class="log-header">
        <div class="log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>实时执行日志</h3>
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      
      <div class="log-summary">
        <div class="realtime-executing-indicator">
          <span class="realtime-pulse-dot"></span>
          <span class="realtime-executing-label">执行中:</span>
          <span class="realtime-executing-node">准备中...</span>
        </div>
        <div class="summary-combo">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">总节点</span>
            <span class="combo-value">0</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success">
              <span class="stat-icon">✓</span>
              <span class="stat-label">成功</span>
              <span class="stat-value">0</span>
            </div>
            <div class="combo-stat failed" data-status="failed">
              <span class="stat-icon">✗</span>
              <span class="stat-label">失败</span>
              <span class="stat-value">0</span>
            </div>
            <div class="combo-stat subtask" data-status="subtask" style="display:none">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">子任务</span>
              <span class="stat-value">0/0</span>
            </div>
          </div>
        </div>
        <div class="summary-actions">
          <button class="toggle-expand-btn" title="展开全部节点">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="timeline">
        <div class="realtime-waiting-message">等待执行中...</div>
      </div>
    </div>
  `,document.body.appendChild(n),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()}),n.addEventListener(`click`,e=>{e.target===n&&n.remove()});let r=n.querySelector(`.toggle-expand-btn`),i=!1;r.addEventListener(`click`,()=>{i=!i,n.querySelectorAll(`.timeline-content`).forEach(e=>{i?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=r.querySelector(`svg`);i?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,r.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,r.setAttribute(`title`,`展开全部节点`))}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.timeline-header`);t&&t.parentElement.classList.toggle(`expanded`)}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.combo-stat[data-status]`);if(!t)return;let r=t.dataset.status,i=t.classList.contains(`active`);n.querySelectorAll(`.combo-stat[data-status]`).forEach(e=>{e.classList.remove(`active`)});let a=n.querySelectorAll(`.timeline-item`);i?a.forEach(e=>{e.style.display=``}):(t.classList.add(`active`),a.forEach(e=>{if(r===`subtask`)e.dataset.nodeType===`subtask`?e.style.display=``:e.style.display=`none`;else{let t=e.querySelector(`.timeline-dot`);t&&t.classList.contains(r)?e.style.display=``:e.style.display=`none`}}))}),M.currentExecutionStatus&&ia(M.currentExecutionStatus)}function oa(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(t){t.remove();return}aa(e)}function sa(e,t,n,r){let i=document.getElementById(e);if(!i)return;console.log(`[SidePanel] updateExecutionStatus 被调用:`,t,n,`日志数量:`,r?.length);let a=i.querySelector(`.current-node-name`);a&&(a.textContent=t||`处理中...`,a.title=t||``),M.currentExecutionStatus?(M.currentExecutionStatus.executionLog||(M.currentExecutionStatus.executionLog=[]),r&&r.length>0&&r.forEach(e=>{let t=M.currentExecutionStatus.executionLog.findIndex(t=>t.id===e.id);if(t!==-1){let n=M.currentExecutionStatus.executionLog[t];M.currentExecutionStatus.executionLog[t]={...e,subtaskIndex:e.subtaskIndex??n.subtaskIndex,subtaskId:e.subtaskId??n.subtaskId,subtaskName:e.subtaskName??n.subtaskName}}else M.currentExecutionStatus.executionLog.push(e)}),M.currentExecutionStatus.nodeName=t,M.currentExecutionStatus.status=n):M.currentExecutionStatus={nodeName:t,status:n,executionLog:[]},document.querySelector(`.execution-log-panel.realtime-mode`)&&ia(M.currentExecutionStatus)}function ca(){let e=document.getElementById(`chatContainer`),t=`loading-`+Date.now(),n=document.createElement(`div`);n.className=`loading-message`,n.id=t,n.innerHTML=`
    <div class="loading-content">
      <div class="loading-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span class="loading-text">思考中...</span>
      <button class="stop-task-btn" title="停止任务">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="15" y1="9" x2="9" y2="15"></line>
          <line x1="9" y1="9" x2="15" y2="15"></line>
        </svg>
      </button>
      <div class="execution-status-container" style="display: none;">
        <button class="execution-log-toggle-btn" title="查看执行日志">
          <svg viewBox="0 0 1024 1024">
            <path d="M512 5.12C230.4 5.12 5.12 230.4 5.12 512s225.28 506.88 506.88 506.88 506.88-225.28 506.88-506.88S793.6 5.12 512 5.12z m0 92.16c107.52 0 215.04 46.08 291.84 122.88s122.88 184.32 122.88 291.84-46.08 215.04-122.88 291.84-184.32 122.88-291.84 122.88-215.04-46.08-291.84-122.88-122.88-184.32-122.88-291.84 46.08-215.04 122.88-291.84S404.48 97.28 512 97.28zM430.08 327.68h-5.12c-5.12 0-5.12 5.12-5.12 5.12v353.28l5.12 5.12h20.48l250.88-168.96s5.12 0 5.12-5.12V512v-5.12s0-5.12-5.12-5.12l-256-168.96c-5.12 0-5.12 0-10.24-5.12z" fill="#707070"></path>
          </svg>
        </button>
        <span class="current-node-name">准备中...</span>
      </div>
    </div>
  `,e.appendChild(n),requestAnimationFrame(()=>{e.scrollTop=e.scrollHeight});let r=n.querySelector(`.stop-task-btn`),i=n.querySelector(`.loading-text`);r&&r.addEventListener(`click`,e=>{e.stopPropagation(),r.disabled=!0,r.style.opacity=`0.6`,r.style.cursor=`not-allowed`,i&&(i.textContent=`停止中...`),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:null,sessionId:M.activeSessionId}),M.pendingCancelApi&&M.pendingCancelApi({message:`任务已被用户停止`,executionLog:M.currentExecutionStatus?.executionLog||[]})});let a=M.activeSessionId;if(M.executionLogListener=(e,n,r)=>e.sessionId&&e.sessionId!==a?!1:e.type===`EXECUTION_STATUS_UPDATE`?(console.log(`[SidePanel] 收到执行状态更新:`,e.nodeName,e.status,`日志数量:`,e.executionLog?.length),sa(t,e.nodeName,e.status,e.executionLog),!1):!1,chrome.runtime.onMessage.addListener(M.executionLogListener),M.chatConfig.enableExecutionLog){let e=n.querySelector(`.execution-status-container`);e&&(e.style.display=`flex`)}let o=n.querySelector(`.execution-log-toggle-btn`);return o&&o.addEventListener(`click`,e=>{e.stopPropagation(),oa(t)}),t}function $(e){let t=document.getElementById(e);if(t){let e=t.querySelector(`.loading-text`);e&&(e.textContent=`思考中...`),t.remove()}M.executionLogListener&&=(chrome.runtime.onMessage.removeListener(M.executionLogListener),null),M.currentExecutionStatus=null;let n=document.querySelector(`.execution-log-panel.realtime-mode`);n&&n.remove()}function la(){let e=document.getElementById(`chatContainer`),t=document.createElement(`div`);return t.className=`message-wrapper assistant streaming`,t.innerHTML=`
    <div class="message-content">
      <div class="thinking-indicator">
        <svg class="thinking-icon pulse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
          <circle cx="8" cy="12" r="1.5"/>
          <circle cx="16" cy="12" r="1.5"/>
        </svg>
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
        <span class="thinking-label">思考中...</span>
      </div>
      <div class="stream-content"></div>
      <div class="stream-status hidden"></div>
    </div>
  `,e.appendChild(t),requestAnimationFrame(()=>{e.scrollTop=e.scrollHeight}),t}function ua(e){let t=document.getElementById(`chatContainer`);if(!t||!e)return;let n=document.createElement(`div`);n.innerHTML=e;let r=n.firstElementChild;if(!r)return;r.classList.remove(`streaming`);let i=r.querySelector(`.thinking-process-header`);if(i){let e=i.closest(`.thinking-process`);i.addEventListener(`click`,()=>{e.classList.toggle(`collapsed`)})}r.querySelectorAll(`.tool-call-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.closest(`.tool-call-item`).classList.toggle(`expanded`)})});let a=r.querySelector(`.message-footer`);if(a){let e=a.querySelector(`.copy-btn`);e&&e.addEventListener(`click`,t=>{t.stopPropagation(),xa(r,e)});let t=a.querySelector(`.quote-btn`);t&&t.addEventListener(`click`,e=>{e.stopPropagation(),wa(r)});let n=a.querySelector(`.export-trigger-btn`),i=a.querySelector(`.export-dropdown`);n&&i&&(n.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==i&&e.classList.remove(`show`)}),i.classList.toggle(`show`)}),i.querySelector(`.export-docx-item`)?.addEventListener(`click`,e=>{e.stopPropagation(),Sa(r,n),i.classList.remove(`show`)}),i.querySelector(`.export-pdf-item`)?.addEventListener(`click`,e=>{e.stopPropagation(),Ca(r,n),i.classList.remove(`show`)}))}t.appendChild(r)}function da(e,t){let n=e.querySelector(`.stream-content`);if(!n)return;let r=n.querySelector(`.thinking-indicator:not(.hidden)`)||e.querySelector(`.thinking-indicator:not(.hidden)`);if(r){r.classList.add(`hidden`),n.contains(r)||r.remove();let e=Ki>0?((Date.now()-Ki)/1e3).toFixed(1)+`s`:``,t=document.createElement(`span`);t.className=`thinking-badge`,t.innerHTML=`<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果${e?` <span class="thinking-duration">`+e+`</span>`:``}`,n.appendChild(t)}let i=n.querySelectorAll(`.thinking-badge`);if(i.length>0){let e=i[i.length-1],n=e.nextElementSibling;if(n&&n.classList.contains(`thinking-content`))n.innerHTML=mn(t);else{let n=document.createElement(`div`);n.className=`thinking-content`,n.innerHTML=mn(t),e.after(n)}}else n.innerHTML=mn(t);requestAnimationFrame(()=>{chatContainer.scrollTop=chatContainer.scrollHeight})}function fa(e,t){if(!e||!t?.length)return;let n=e.querySelector(`.thinking-indicator`);n&&n.classList.add(`hidden`);let r=e.querySelector(`.stream-content`);if(!r)return;let i={execute_command:{metaType:`exec`},execute_agent_exec_command:{metaType:`exec`},agent_read_file:{metaType:`file`,action:`读取`},agent_write_file:{metaType:`file`,action:`写入`},file_upload:{metaType:`file`,action:`上传`},download_file:{metaType:`file`,action:`下载`},fetch_url:{metaType:`web`,action:`请求`},click_element:{metaType:`web`,action:`点击`},fill_form:{metaType:`web`,action:`填写`},open_tab:{metaType:`web`,action:`打开`},search_bookmarks:{metaType:`search`},search_history:{metaType:`search`},search_in_page:{metaType:`search`}};t.forEach(e=>{let t=e.function?.name||`unknown`,n=i[t]||{metaType:`other`},a;try{a=JSON.parse(e.function?.arguments||`{}`)}catch{a={raw:e.function?.arguments||``}}let o=JSON.stringify(a,null,2),s=``;if(n.metaType===`exec`)s=`<code class="tool-call-cmd">$ ${L(a.command||a.cmd||JSON.stringify(a))}</code>`;else if(n.metaType===`file`){let e=a.file_path||a.filePath||a.path||a.filename||a.fileName||a.url||``;s=`<span class="tool-call-file">${n.action===`读取`?`📖`:n.action===`写入`?`📝`:n.action===`上传`?`📤`:`📥`} ${L(e)||L(t)}</span>`}else if(n.metaType===`web`){let e=a.url||a.href||a.selector||``;s=`<span class="tool-call-web">${L(n.action)}: ${L(e)||L(JSON.stringify(a).substring(0,80))}</span>`}else if(n.metaType===`search`)s=`<span class="tool-call-search">🔍 ${L(a.query||a.keyword||a.text||``)||L(t)}</span>`;else{let e=Object.keys(a);s=e.length===0?`<span>${L(t)}</span>`:e.length===1?`<span>${L(e[0])}: ${L(JSON.stringify(a[e[0]]).substring(0,80))}</span>`:`<span>${e.slice(0,2).map(e=>`${L(e)}=${L(JSON.stringify(a[e]).substring(0,30))}`).join(`, `)}${e.length>2?` ...`:``}</span>`}let c=n.metaType===`exec`?`<svg class="tool-call-icon exec" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
         </svg>`:n.metaType===`file`?`<svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
         </svg>`:`<svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
         </svg>`,l=document.createElement(`div`);l.className=`tool-call-item`,l.setAttribute(`data-tool-call-id`,e.id||``),l.innerHTML=`
      <div class="tool-call-header">
        ${c}
        <span class="tool-call-name">${L(t)}</span>
        <div class="tool-call-summary">${s}</div>
        <svg class="tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="tool-call-body">
        <pre><code>${L(o)}</code></pre>
      </div>
    `,l.querySelector(`.tool-call-header`).addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),r.appendChild(l)}),requestAnimationFrame(()=>{let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)})}function pa(e,t){if(!e?.toolCallId)return;let n=t;if(!n)return;let r=n.querySelector(`.tool-call-item[data-tool-call-id="${e.toolCallId}"]`);if(!r)return;let i=r.querySelector(`.tool-call-result`);i&&i.remove();let a=e.truncated?`<span class="tool-result-truncated" title="原始结果过大，已截断显示">(输出过长已截断)</span>`:``,o=e.content||(e.success?`(无输出)`:`执行失败`),s=o.length>500?o.substring(0,500)+`
... (点击展开查看完整输出)`:o,c=o,l=document.createElement(`div`);if(l.className=`tool-call-result`,l.innerHTML=`
    <div class="tool-result-header">
      <span class="tool-result-status ${e.success?`success`:`fail`}">
        ${e.success,``}${e.success?`成功`:`失败`}
      </span>
      ${e.duration?`<span class="tool-result-duration">${e.duration}ms</span>`:``}
      ${a}
    </div>
    <div class="tool-result-content">
      <pre><code>${L(s)}</code></pre>
    </div>
  `,r.appendChild(l),c.length>500){let e=l.querySelector(`code`),t=!1;l.style.cursor=`pointer`,l.addEventListener(`click`,()=>{t=!t,e.textContent=t?c:s})}requestAnimationFrame(()=>{let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)})}function ma(e){let t=document.createElement(`div`);t.className=`tool-call-item expanded preselect-card`;let n=e.status===`failed`,r=n?`失败`:`完成`,i=n?`fail`:`success`,a=``;if(e.action?.params?.selected){let t=e.action.params.selected;a=`<span class="preselect-summary">从 ${e.apiRequest?.toolCount||`?`} 个工具中筛选出 <strong>${t.length}</strong> 个：${t.map(e=>`<code>${L(e)}</code>`).join(`、`)}</span>`}else e.action?.name===`all_tools`?a=`<span class="preselect-summary">跳过筛选（${L(e.action.params.reason||``)}），使用全部工具</span>`:e.action?.name===`skip`?a=`<span class="preselect-summary">跳过筛选（${L(e.action.params.reason||``)}），工具总数 ${e.action.params.toolCount||`?`}</span>`:e.error?a=`<span class="preselect-summary" style="color:#dc2626;">${L(e.error)}</span>`:e.thought&&(a=`<span class="preselect-summary">模型直接回答：${L(e.thought).substring(0,200)}</span>`);let o=e.duration?`${e.duration}ms`:``;return t.innerHTML=`
    <div class="tool-call-header">
      <svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span class="tool-call-name">工具预筛选</span>
      <span class="tool-call-status ${i}">${r}</span>
      ${o?`<span class="tool-call-duration">${o}</span>`:``}
      <svg class="tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="tool-call-body">
      ${a}
      ${e.apiResponse?.toolCountAfter===void 0?``:`<div class="preselect-meta">筛选后工具数：<strong>${e.apiResponse.toolCountAfter}</strong></div>`}
    </div>
  `,t.querySelector(`.tool-call-header`).addEventListener(`click`,()=>{t.classList.toggle(`expanded`)}),t}function ha(e,t,n=[],r=null,i=null){if(!e)return;e.querySelectorAll(`.thinking-indicator`).forEach(e=>e.classList.add(`hidden`));let a=e.querySelector(`.stream-status`);a&&a.remove(),e.classList.remove(`streaming`);let o=e.querySelector(`.message-content`),s=e.querySelector(`.stream-content`);if(o&&o.querySelector(`.tool-call-item`)||s&&s.querySelector(`.tool-call-item`)){let e=qi>0?((Date.now()-qi)/1e3).toFixed(1)+`s`:``,r=document.createElement(`div`);r.className=`thinking-process collapsed`;let i=document.createElement(`div`);i.className=`thinking-process-header`,i.innerHTML=`
      <svg class="thinking-process-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
        <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
      </svg>
      <span class="thinking-process-title">思考过程</span>
      <span class="thinking-process-duration">${e}</span>
      <svg class="thinking-process-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    `;let a=document.createElement(`div`);a.className=`thinking-process-body`;let c=document.createElement(`div`);if(c.className=`thinking-process-content`,a.appendChild(c),s)for(;s.firstChild;)c.appendChild(s.firstChild);o.querySelectorAll(`.tool-call-item`).forEach(e=>c.appendChild(e)),c.querySelectorAll(`.preselect-card`).forEach(e=>e.remove());let l=(n||[]).filter(e=>e.nodeType===`preselect`);console.log(`[finalizeStreamingMessage] executionLog length:`,(n||[]).length,`preselectEntries:`,l.length),l.forEach(e=>{console.log(`[finalizeStreamingMessage] creating preselect card for entry:`,e);let t=ma(e);c.insertBefore(t,c.firstChild)});let u=c.querySelectorAll(`.thinking-badge`),d=c.querySelectorAll(`.thinking-content`);u.length>0&&u[u.length-1].remove(),d.length>0&&d[d.length-1].remove(),r.appendChild(i),r.appendChild(a);let f=document.createElement(`div`);f.className=`final-answer`;let p=si(t);p&&p.trim()&&(f.innerHTML=mn(p));let m=o.querySelector(`.thinking-indicator`);m&&m.remove(),o.appendChild(r),o.appendChild(f),i.addEventListener(`click`,()=>{r.classList.toggle(`collapsed`)})}else if(s){let e=si(t);!s.querySelector(`.thinking-content`)&&e&&e.trim()&&(s.innerHTML=mn(e))}e.classList.add(`assistant`,`message`),e.dataset.rawContent=typeof t==`string`?t:JSON.stringify(t),e.dataset.textContent_=si(t),e.dataset.executionLog=JSON.stringify(n);let c=document.createElement(`div`);c.className=`message-footer`;let l=document.createElement(`button`);l.className=`copy-btn`,l.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),l.addEventListener(`click`,t=>{t.stopPropagation(),xa(e,l)}),c.appendChild(l);let u=document.createElement(`button`);u.className=`quote-btn`,u.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),u.addEventListener(`click`,t=>{t.stopPropagation(),wa(e)}),c.appendChild(u);let d=document.createElement(`div`);d.className=`export-menu-container`;let f=document.createElement(`button`);f.className=`export-trigger-btn`,f.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let p=document.createElement(`div`);p.className=`export-dropdown`,p.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),p.querySelector(`.export-docx-item`).addEventListener(`click`,t=>{t.stopPropagation(),Sa(e,f),p.classList.remove(`show`)}),p.querySelector(`.export-pdf-item`).addEventListener(`click`,t=>{t.stopPropagation(),Ca(e,f),p.classList.remove(`show`)}),f.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==p&&e.classList.remove(`show`)}),p.classList.toggle(`show`)});let m=null;if(d.addEventListener(`mouseenter`,()=>{m=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==p&&e.classList.remove(`show`)}),p.classList.add(`show`)},300)}),d.addEventListener(`mouseleave`,()=>{m&&=(clearTimeout(m),null),setTimeout(()=>{!d.matches(`:hover`)&&!p.matches(`:hover`)&&p.classList.remove(`show`)},100)}),d.appendChild(f),d.appendChild(p),c.appendChild(d),n&&n.length>0&&M.chatConfig?.enableExecutionLog){let e=document.createElement(`button`);e.className=`execution-log-btn`,e.type=`button`,e.title=`执行日志`,e.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),c.appendChild(e)}let h=r!=null,g=n?n.filter(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.status===`success`).length:0,_=n?.find(e=>e.nodeType===`reflection`&&e.reflectionType===`post`);if(h&&M.chatConfig?.enableExecutionLog){let e=r>=8?`score-high`:r>=5?`score-mid`:`score-low`,t=r>=8?`✅`:r>=5?`🔍`:`⚠️`,n=g>1?` (${g}轮)`:``,i=document.createElement(`button`);i.className=`reflection-score-btn`,i.type=`button`,i.title=`AI 质量评估: ${r}/10${n}\n点击查看评估详情`,i.innerHTML=`<span class="reflection-badge ${e}">${t} ${r}/10</span>`,i.dataset.reflectionData=JSON.stringify({overallScore:_?.overallScore??r,dimensions:_?.dimensions||null,issues:_?.issues||null,suggestions:_?.suggestions||null,decision:_?.action?.decision||null,useful:_?.useful??null,reasoning:_?.reasoning||null,suggestion:_?.suggestion||null,rounds:g,wasRevised:!1}),c.appendChild(i)}else if(!h&&_&&_.status===`failed`&&M.chatConfig?.enableExecutionLog){let e=document.createElement(`button`);e.className=`reflection-score-btn`,e.type=`button`,e.title=`反思评估失败（点击查看执行日志）`,e.innerHTML=`<span class="reflection-badge score-low">⚠️ 反思失败</span>`,c.appendChild(e)}e.querySelector(`.message-content`).appendChild(c),Ji(),Xi(),Sn(),yn(e),e.dataset.htmlContent=e.outerHTML}function ga(e){if(!e)return;e.querySelectorAll(`.thinking-indicator`).forEach(e=>e.classList.add(`hidden`));let t=e.querySelector(`.stream-status`);t&&(t.textContent=`已取消`),e.classList.remove(`streaming`),e.classList.add(`stream-cancelled`)}async function _a(e,t,n=!1,r={}){let i=(await ft()).loopTimeout,a=M.activeSessionId,o=e=>e===void 0?Gi.get(a)||null:(Gi.set(a,e),e),s=chrome.runtime.connect({name:`keepalive-`+a});console.log(`[SidePanel] keepalive 端口已连接, sessionId:`,a);let c={restarted:!1,rejectFn:null,cleanup:null};s.onMessage.addListener(e=>{e.type===`SW_RESTARTED`&&e.sessionId===a&&(console.warn(`[SidePanel] ⚠️ 收到 SW_RESTARTED 通知，后台已重启，API 调用已丢失`),c.restarted=!0,c.rejectFn&&c.cleanup&&(c.cleanup(),c.rejectFn({message:`后台服务异常重启，API 调用已中断，请重试`,executionLog:[]})))});let l={timeoutId:null,removeListener:()=>{}},u=()=>{try{s.disconnect()}catch{}l.timeoutId&&=(clearTimeout(l.timeoutId),null),l.removeListener(),M.pendingCancelApiMap.delete(a),M.pendingCallApiSessionIds.delete(a),Gi.delete(a),ai()};return new Promise((s,d)=>{if(c.cleanup=u,c.rejectFn=d,c.restarted){u(),d({message:`后台服务异常重启，API 调用已中断，请重试`,executionLog:[]});return}let f=[],p=Math.round(i/1e3);o(null),Q=null,qi=0;let m=``,h={},g=e=>{o()&&ga(o()),u(),(!e.executionLog||e.executionLog.length===0||f.length>0)&&(e.executionLog=f),d(e)};M.pendingCancelApi=g,M.pendingCallApiSessionIds.add(a),ai(),console.log(`[SidePanel] callApi: 添加 pendingCallApiSessionIds, mySessionId =`,a,`, set:`,[...M.pendingCallApiSessionIds]),l.timeoutId=setTimeout(()=>{g({message:`请求超时（${p}秒）`,executionLog:f}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:M.currentTabId,sessionId:M.activeSessionId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},i);let _=Date.now(),v=0,y=null,b=()=>{y===null&&l.timeoutId!==null&&(y=Date.now(),clearTimeout(l.timeoutId),l.timeoutId=null,console.log(`[SidePanel] 前端超时已暂停（澄清工具执行中）`))},x=()=>{if(y!==null){let e=Date.now()-y;v+=e,y=null;let t=Date.now()-_,n=i+v-t;if(n<=0){g({message:`请求超时（${p}秒）`,executionLog:f});return}l.timeoutId=setTimeout(()=>{g({message:`请求超时（${p}秒）`,executionLog:f}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:M.currentTabId,sessionId:a}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},n),console.log(`[SidePanel] 前端超时已恢复，暂停时长:`,Math.round(e/1e3),`s，剩余时间:`,Math.round(n/1e3),`s`)}},S=e=>{if(console.log(`[SidePanel] 收到消息:`,e),e.sessionId&&e.sessionId!==a)return!1;if(e.type===`EXECUTION_STATUS_UPDATE`)return f=e.executionLog||[],!1;if(e.type===`CLARIFY_START`)return b(),!1;if(e.type===`CLARIFY_END`)return x(),!1;if(e.type===`STREAM_PRESELECT`){if(console.log(`[SidePanel] 收到预筛选日志，条数:`,e.preselectLog?.length),Q=e.preselectLog||null,o()&&Q&&Q.length>0){let e=o().querySelector(`.message-content`);e&&(Q.forEach(t=>{let n=ma(t);e.insertBefore(n,e.firstChild)}),Q=null,console.log(`[SidePanel] 预筛选卡片已追加到已有流式元素`))}return!1}if(e.type===`STREAM_START`){console.log(`[SidePanel] 流式输出开始`);let e=r._loadingId,t=e?document.getElementById(e):document.querySelector(`.loading-message`);if(t&&t.remove(),M.executionLogListener&&=(chrome.runtime.onMessage.removeListener(M.executionLogListener),null),M.currentExecutionStatus=null,o()){let e=o().querySelector(`.stream-content`);if(e){let t=document.createElement(`div`);t.className=`thinking-indicator`,t.innerHTML=`
              <svg class="thinking-icon pulse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
                <circle cx="8" cy="12" r="1.5"/>
                <circle cx="16" cy="12" r="1.5"/>
              </svg>
              <div class="thinking-dots"><span></span><span></span><span></span></div>
              <span class="thinking-label">思考中...</span>
            `,e.appendChild(t)}}else if(o(la()),qi=Date.now(),Q&&Q.length>0){let e=o().querySelector(`.message-content`);Q.forEach(t=>{let n=ma(t);e.insertBefore(n,e.firstChild)}),Q=null}return m=``,Ki=Date.now(),!1}if(e.type===`STREAM_CHUNK`)return o()&&(m+=e.delta,da(o(),m)),!1;if(e.type===`STREAM_TOOL_CALL`)return o()&&e.toolCalls?.length>0&&fa(o(),e.toolCalls),!1;if(e.type===`STREAM_TOOL_RESULT`)return o()&&e.result&&pa(e.result,o()),!1;if(e.type===`AGENT_STREAM`){if(o()&&e.execId){let t=h[e.execId];if(!t){let n=document.createElement(`div`);n.className=`agent-stream-output`,n.innerHTML=`
              <div class="agent-stream-header">
                <span class="agent-stream-icon">🖥️</span>
                <span class="agent-stream-label">命令输出</span>
              </div>
              <pre class="agent-stream-content"><code></code></pre>
            `;let r=o().querySelector(`.stream-content`);r&&r.appendChild(n),t={element:n,stdout:``,stderr:``},h[e.execId]=t}let n=t.element.querySelector(`code`);n&&(e.streamType===`stderr`?t.stderr+=e.data:t.stdout+=e.data,n.textContent=t.stdout+(t.stderr?`
`+t.stderr:``),n.parentElement.scrollTop=n.parentElement.scrollHeight)}return!1}if(e.type===`AGENT_STREAM_DONE`){if(e.execId){let t=h[e.execId];if(t){let n=t.element.querySelector(`.agent-stream-label`);n&&(n.textContent=`命令输出 - ${e.exitCode===0?`完成`:`退出 (code: ${e.exitCode})`}`),e.exitCode!==0&&t.element.classList.add(`agent-stream-error`)}}return!1}if(e.type===`STREAM_DONE`){if(o()){let e=o().querySelector(`.stream-status`);e&&(e.textContent=`质量评估中...`)}return!1}if(e.type===`API_COMPLETE`){o()&&e.content&&ha(o(),e.content,e.executionLog||[],e.reflectionScore,e.reasoningContent);let t=o(),n=!!t,r=t?t.dataset.htmlContent||t.outerHTML:null,i=t?t.isConnected:!1;return u(),s({content:e.content,executionLog:e.executionLog||f,reflectionScore:e.reflectionScore,wasStreamed:n,wasRevised:e.wasRevised,streamingHtml:r,streamingConnected:i}),!1}else if(e.type===`API_ERROR`)return u(),d({message:e.error,executionLog:e.executionLog||f}),!1;return!1};chrome.runtime.onMessage.addListener(S),l.removeListener=()=>{chrome.runtime.onMessage.removeListener(S)},console.log(`[SidePanel] 发送 CALL_API 消息，useTools:`,n,`tabId:`,M.currentTabId,`sessionId:`,M.activeSessionId,`apiParams:`,r,`timeout:`,i),chrome.runtime.sendMessage({type:`CALL_API`,sessionId:M.activeSessionId,messages:e,model:t,useTools:n,tabId:M.currentTabId,apiParams:r,agentId:M.activeAgentId,agentToolIds:M.activeAgentToolIds,imageApiBase:M.enableImageInput&&M.attachedImages.length>0&&M.imageApiBase||``,imageApiKey:M.enableImageInput&&M.attachedImages.length>0&&M.imageApiKey||``})})}function va(e){let t=document.querySelector(`.execution-log-panel`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel`;let r=e.reduce((e,t)=>e+(t.duration||0),0),i=e.filter(e=>e.status===`success`).length,a=e.filter(e=>e.status===`failed`).length,o=e.filter(e=>e.nodeType===`subtask`).length,s=e.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,c=e.filter(e=>e.nodeType===`tool_exec`&&e.action?.name===`plan_task`&&e.status===`success`).length,l=e.filter(e=>e.nodeType===`reflection`).find(e=>e.reflectionType===`post`);n.innerHTML=`
    <div class="log-container">
      <div class="log-header">
        <div class="log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>执行日志</h3>
          ${c>0?`<span class="log-badge">任务拆解</span>`:``}
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      
      <div class="log-summary">
        <div class="summary-item" title="总耗时: ${at(r)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${at(r)}</span>
        </div>
        <div class="summary-combo" title="总节点: ${e.length}">
          <div class="combo-main">
            <span class="combo-icon">◉</span>
            <span class="combo-label">总节点</span>
            <span class="combo-value">${e.length}</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success" data-status="success" title="成功: ${i}">
              <span class="stat-icon">✓</span>
              <span class="stat-label">成功</span>
              <span class="stat-value">${i}</span>
            </div>
            <div class="combo-stat failed" data-status="failed" title="失败: ${a}">
              <span class="stat-icon">✗</span>
              <span class="stat-label">失败</span>
              <span class="stat-value">${a}</span>
            </div>
            ${o>0?`
            <div class="combo-stat subtask" data-status="subtask" title="子任务: ${s}/${o}">
              <span class="stat-icon">🔀</span>
              <span class="stat-label">子任务</span>
              <span class="stat-value">${s}/${o}</span>
            </div>
            `:``}
            ${l?`
            <div class="combo-stat reflection" title="质量评估: ${l.overallScore}/10">
              <span class="stat-icon">🎯</span>
              <span class="stat-label">评分</span>
              <span class="stat-value">${l.overallScore}/10</span>
            </div>
            `:``}
          </div>
        </div>
        <div class="summary-actions">
          <button class="toggle-expand-btn" title="展开全部节点">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="7 13 12 18 17 13"></polyline>
              <polyline points="7 6 12 11 17 6"></polyline>
            </svg>
          </button>
        </div>
      </div>
      
      <div class="timeline">
        ${$i(e)}
      </div>
    </div>
  `,document.body.appendChild(n),n.addEventListener(`click`,e=>{e.target===n&&n.remove()}),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()});let u=n.querySelector(`.toggle-expand-btn`),d=n.querySelectorAll(`.timeline-content`),f=!1;u.addEventListener(`click`,()=>{f=!f,d.forEach(e=>{f?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=u.querySelector(`svg`);f?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,u.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,u.setAttribute(`title`,`展开全部节点`))}),n.querySelectorAll(`.timeline-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.parentElement.classList.toggle(`expanded`)})});let p=n.querySelectorAll(`.combo-stat`),m=n.querySelectorAll(`.timeline-item`);p.forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.status,n=e.classList.contains(`active`);p.forEach(e=>e.classList.remove(`active`)),n?m.forEach(e=>{e.style.display=``}):(e.classList.add(`active`),m.forEach(e=>{if(t===`subtask`)e.classList.contains(`subtask-level`)?e.style.display=``:e.style.display=`none`;else{let n=e.querySelector(`.timeline-dot`);n&&n.classList.contains(t)?e.style.display=``:e.style.display=`none`}}))})})}function ya(e,t){try{let n=e.dataset.textContent_||e.dataset.rawContent||``;navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{console.error(`[SidePanel] 复制失败:`,e);let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{I(`复制失败`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),I(`复制失败`,`error`)}}function ba(e){try{let t=e.dataset.rawContent||``,n=e.dataset.textContent_||``;if(!n&&!t){I(`无法获取消息内容`,`error`);return}if(M.attachedImages=[],t.startsWith(`[`))try{let e=JSON.parse(t);if(Array.isArray(e)){let t=e.filter(e=>e.type===`image_url`);for(let e of t)M.attachedImages.push({dataUrl:e.image_url.url})}}catch{}Ii(),M.quotedContextText=``,M.selectedContextText=``;let r=n.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),i=n.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),a=r||i,o=n;if(a){let e=r?`quoted`:`selected`,t=a[1].trim(),n=a[2].trim(),i=document.getElementById(`selectionIndicator`),s=document.getElementById(`selectionText`);if(i&&s){let n;n=t.length>100?t.substring(0,100)+`...`:t.length>50?t.substring(0,50)+`...`:t,e===`quoted`?(M.quotedContextText=t,s.textContent=`💬 已引用: ${n}`):(M.selectedContextText=t,s.textContent=`📌 已选中: ${n}`),i.classList.add(`show`)}o=n}let s=document.getElementById(`userInput`);s.value=o,it(),s.focus(),s.selectionStart=s.selectionEnd=s.value.length,console.log(`[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送`)}catch(e){console.error(`[SidePanel] 编辑消息失败:`,e),I(`编辑失败: `+e.message,`error`)}}function xa(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=M.messageHistory.find(e=>e.role===`assistant`);if(t)n=t.content;else{let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}}navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{I(`复制失败，请手动选择内容复制`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),I(`复制失败`,`error`)}}function Sa(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AI Helper 导出</title>
        <style>
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            padding: 20px;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 16pt;
            margin-bottom: 8pt;
          }
          h1 { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h2 { font-size: 15pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h3 { font-size: 13pt; }
          p { margin: 8pt 0; }
          code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
            border-radius: 3px;
            font-size: 10pt;
          }
          pre {
            background-color: #f5f5f5;
            padding: 10pt;
            border-radius: 5px;
            overflow-x: auto;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10pt 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6pt 10pt;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          blockquote {
            border-left: 4px solid #ddd;
            margin: 10pt 0;
            padding: 5pt 15pt;
            color: #666;
          }
          ul, ol {
            margin: 8pt 0;
            padding-left: 25pt;
          }
          li { margin: 4pt 0; }
          a { color: #0563c1; text-decoration: none; }
          a:hover { text-decoration: underline; }
          img { max-width: 100%; height: auto; }
        </style>
      </head>
      <body>
        ${ln(n)}
      </body>
      </html>
    `,i=new Blob([`﻿`,r],{type:`application/msword`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`word-${new Date().getTime()}.doc`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a);let s=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `,setTimeout(()=>{t.innerHTML=s},2e3),console.log(`[SidePanel] Word 文档导出成功`)}catch(e){console.error(`[SidePanel] 导出 Word 失败:`,e),I(`导出失败: `+e.message,`error`)}}function Ca(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>AI Helper 导出</title>
        <style>
          @page {
            size: A4;
            margin: 20mm;
          }
          body {
            font-family: 'Calibri', 'Arial', sans-serif;
            font-size: 11pt;
            line-height: 1.6;
            color: #333;
            padding: 20px;
          }
          h1, h2, h3, h4, h5, h6 {
            margin-top: 16pt;
            margin-bottom: 8pt;
            page-break-after: avoid;
          }
          h1 { font-size: 18pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h2 { font-size: 15pt; border-bottom: 1px solid #ccc; padding-bottom: 4pt; }
          h3 { font-size: 13pt; }
          p { margin: 8pt 0; page-break-inside: avoid; }
          code {
            font-family: 'Consolas', 'Courier New', monospace;
            background-color: #f5f5f5;
            padding: 2pt 4pt;
            border-radius: 3px;
            font-size: 10pt;
          }
          pre {
            background-color: #f5f5f5;
            padding: 10pt;
            border-radius: 5px;
            overflow-x: auto;
            page-break-inside: avoid;
          }
          pre code {
            background-color: transparent;
            padding: 0;
          }
          table {
            border-collapse: collapse;
            width: 100%;
            margin: 10pt 0;
          }
          th, td {
            border: 1px solid #ddd;
            padding: 6pt 10pt;
            text-align: left;
          }
          th {
            background-color: #f2f2f2;
            font-weight: bold;
          }
          blockquote {
            border-left: 4px solid #ddd;
            margin: 10pt 0;
            padding: 5pt 15pt;
            color: #666;
          }
          ul, ol {
            margin: 8pt 0;
            padding-left: 25pt;
          }
          li { margin: 4pt 0; }
          a { color: #0563c1; text-decoration: none; }
          a:hover { text-decoration: underline; }
          img { max-width: 100%; height: auto; page-break-inside: avoid; }
          .footer {
            margin-top: 30pt;
            padding-top: 10pt;
            border-top: 1px solid #ddd;
            font-size: 9pt;
            color: #999;
            text-align: center;
          }
        </style>
      </head>
      <body>
        ${ln(n)}
        <div class="footer">${`AI Helper - ${new Date().toLocaleString(`zh-CN`)}`}</div>
      </body>
      </html>
    `,i=window.open(``,`_blank`,`width=800,height=600`);if(!i){I(`请允许弹出窗口以使用 PDF 导出功能`,`warning`);return}i.document.write(r),i.document.close(),i.onload=function(){setTimeout(()=>{i.focus(),i.print()},500)};let a=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `,setTimeout(()=>{t.innerHTML=a},2e3),console.log(`[SidePanel] PDF 导出已触发`)}catch(e){console.error(`[SidePanel] 导出 PDF 失败:`,e),I(`导出失败: `+e.message,`error`)}}function wa(e){try{let t=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!t){console.warn(`[SidePanel] 无法获取消息内容`);return}let n=document.getElementById(`userInput`);if(!n){console.warn(`[SidePanel] 找不到输入框`);return}let r=e.querySelector(`.quote-btn`),i=r?r.innerHTML:``;ci(t),r&&(r.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `,r.classList.add(`quoted`),setTimeout(()=>{r.innerHTML=i,r.classList.remove(`quoted`)},2e3)),n.focus(),console.log(`[SidePanel] 已引用消息内容到提示条，输入框已获取焦点`)}catch(e){console.error(`[SidePanel] 引用提问失败:`,e),I(`引用失败: `+e.message,`error`)}}function Ta(){console.log(`[SidePanel] 清除选中内容上下文`),M.selectedContextText=``,M.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=0;for(let t=0;t<e.length;t++)if(e[t].startsWith(`[用户问题]`)){n=t;break}n>0&&(t.value=e.slice(n).join(`
`),t.dispatchEvent(new Event(`input`)),console.log(`[SidePanel] 已移除输入框中的选中内容前缀`))}M.lastSelectedText=``,M.currentSelectionRange=null}function Ea(){let e=document.getElementById(`promptManageList`).querySelectorAll(`.prompt-manage-item`);e.forEach(t=>{t.addEventListener(`dragstart`,e=>{M.draggedItemIndex=parseInt(t.dataset.index),t.classList.add(`dragging`),e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,M.draggedItemIndex)}),t.addEventListener(`dragend`,()=>{t.classList.remove(`dragging`),e.forEach(e=>e.classList.remove(`drag-over`)),M.draggedItemIndex=null}),t.addEventListener(`dragover`,e=>{e.preventDefault(),e.dataTransfer.dropEffect=`move`,t.classList.add(`drag-over`)}),t.addEventListener(`dragleave`,()=>{t.classList.remove(`drag-over`)}),t.addEventListener(`drop`,e=>{e.stopPropagation(),e.preventDefault();let n=parseInt(t.dataset.index);if(M.draggedItemIndex!==null&&M.draggedItemIndex!==n){let e=M.customPrompts[M.draggedItemIndex];M.customPrompts.splice(M.draggedItemIndex,1),M.customPrompts.splice(n,0,e),chrome.storage.local.set({customPrompts:M.customPrompts}),Ra()}t.classList.remove(`drag-over`)})})}function Da(){let e=document.querySelector(`.input-toolbar-right`);if(!e)return;let t=document.createElement(`button`);t.className=`prompt-manage-btn`,t.title=`提示词管理`,t.innerHTML=`<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`,t.addEventListener(`click`,()=>{Ia()}),e.appendChild(t)}function Oa(e=``){let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);t.style.display=`block`,n.classList.add(`show`),Ma(e)}function ka(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`);e.style.display=`none`,t.classList.remove(`show`),M.selectedPromptIndex=-1}function Aa(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`),n=document.getElementById(`userInput`);e.style.display!==`none`&&t.classList.contains(`show`)?ka():(Oa(),n.focus())}function ja(e=``){Ma(e)}function Ma(e=``){let t=document.getElementById(`promptList`),n=e.toLowerCase(),r=M.customPrompts.filter(t=>e?t.code.toLowerCase().includes(n)||t.content.toLowerCase().includes(n):!0);if(r.length===0){t.innerHTML=`<div class="prompt-empty">暂无匹配的提示词</div>`,M.selectedPromptIndex=-1;return}M.selectedPromptIndex=0,t.innerHTML=r.map((e,t)=>`
    <div class="prompt-item ${t===M.selectedPromptIndex?`selected`:``}" data-index="${t}" data-code="${e.code}">
      <span class="prompt-item-content">${e.content}</span>
      <span class="prompt-item-code">/${e.code}</span>
    </div>
  `).join(``),t.querySelectorAll(`.prompt-item`).forEach(e=>{e.addEventListener(`click`,t=>{let n=e.dataset.code;t.ctrlKey||t.metaKey?Pa(n):Fa(n)})})}function Na(e){e.forEach((e,t)=>{t===M.selectedPromptIndex?e.classList.add(`selected`):e.classList.remove(`selected`)})}function Pa(e){let t=M.customPrompts.find(t=>t.code===e);if(!t)return;let n=document.getElementById(`userInput`),r=n.value,i=r.lastIndexOf(`/`),a=r;if(i!==-1){let e=-1;for(let t=i-1;t>=0;t--)if(r[t]===`
`){e=t;break}a=e===-1?r.substring(0,i).trimEnd():r.substring(0,e+1).trimEnd()}n.value=a+(a&&!a.endsWith(`
`)?`

`:``)+t.content,n.focus(),n.selectionStart=n.selectionEnd=n.value.length,ka(),it(),console.log(`[SidePanel] 已追加提示词到输入框:`,t.code,t.content)}async function Fa(e){let t=M.customPrompts.find(t=>t.code===e);if(!t)return;if(M.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}ka();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove();let r=t.content,i=M.enableSelectionQuery&&M.selectedContextText&&M.selectedContextText.trim(),a=M.quotedContextText&&M.quotedContextText.trim();if(a){let e=M.quotedContextText.trim(),{compressed:n,wasCompressed:i}=h(e);r=`[引用内容${i?`摘要`:``}]\n${n}\n\n[用户问题]\n${t.content}`,Ui(`quoted`,e,!1),M.quotedContextText=``}else if(i){let e=M.selectedContextText.trim(),{compressed:n,wasCompressed:i}=h(e);r=`[选中内容${i?`摘要`:``}]\n${n}\n\n[用户问题]\n${t.content}`,Ui(`selected`,e,!1),M.selectedContextText=``}(i||a)&&Ta();let o=Li(r);Z(`user`,Li(t.content)),M.messageHistory.push({role:`user`,content:o}),G(),pt(t.content);let s=document.getElementById(`userInput`);s.value=``,s.style.height=`auto`,M.isGenerating=!0;let c=document.getElementById(`sendBtn`);c.disabled=!0;let l=ca(),d=M.activeSessionId,f=M.enableImageInput&&M.attachedImages.length>0&&M.imageModelName||M.currentModel;if(M.attachedImages.length>0){let e=document.getElementById(`imagePreviewBar`);e&&(e.innerHTML=``)}try{await ut(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,M.isolateChat),console.log(`  - chatConfig:`,M.chatConfig),console.log(`  - messageHistory.length:`,M.messageHistory.length);let e=[{role:`system`,content:await st()}];if(M.isolateChat){let t=M.messageHistory,n=M.chatConfig.contextWindow||0,r=g(f,M.enabledTools.length||50,n),i=Math.floor(r*.7),a=M.messageHistory.slice(0,-1),o=M.messageHistory[M.messageHistory.length-1],s=[],c=v([o]);for(let e=a.length-1;e>=0;e--){let t=a[e],n=v([t]);if(c+n<=i)s.unshift(t),c+=n;else break}if(s.length<a.length){let t=a.length-s.length,n=u(a.slice(0,t));n&&(e[0]={...e[0],content:e[0].content+`

`+n})}t=[...s,o],e=[...e,...t];for(let t=0;t<e.length-1;t++)e[t]={...e[t],content:Ri(e[t].content)}}else e.push({role:`user`,content:o});let t=await ct(),n,r;try{let i=await _a(e,f,M.useTools,t);n=i.content,r=i.executionLog||[]}catch(e){throw $(l),n=`❌ 请求失败：`+(e.message||`未知错误`),r=e.executionLog||[],Z(`assistant`,n,!0,r),M.messageHistory.push({role:`assistant`,content:n,executionLog:r}),G(),e}$(l),await yn(Z(`assistant`,n,!0,r)),M.messageHistory.push({role:`assistant`,content:n,executionLog:r}),G()}catch{}finally{M.generatingSessionIds.delete(d),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),c.disabled=!1,s.focus(),M.attachedImages=[]}}function Ia(){document.getElementById(`promptManageModal`).classList.add(`show`),Ra()}function La(){document.getElementById(`promptManageModal`).classList.remove(`show`);let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=document.getElementById(`promptManageAddBtn`);e&&(e.value=``),t&&(t.value=``),n&&(n.value=``),r&&(r.textContent=`添加提示词`,r.style.background=`#667eea`)}function Ra(){let e=document.getElementById(`promptManageList`);if(M.customPrompts.length===0){e.innerHTML=`<div class="prompt-empty">暂无提示词，请添加</div>`;return}e.innerHTML=M.customPrompts.map((e,t)=>`
    <div class="prompt-manage-item" draggable="true" data-index="${t}">
      <div class="prompt-manage-item-left">
        <span class="prompt-drag-handle" title="拖拽排序">⋮⋮</span>
        <span class="prompt-manage-item-code">/${e.code}</span>
        <span class="prompt-manage-item-content">${e.content}</span>
      </div>
      <div class="prompt-manage-item-actions">
        <button class="prompt-sort-btn move-up-btn" data-index="${t}" title="上移" ${t===0?`disabled`:``}>↑</button>
        <button class="prompt-sort-btn move-down-btn" data-index="${t}" title="下移" ${t===M.customPrompts.length-1?`disabled`:``}>↓</button>
        <button class="prompt-sort-btn menu-toggle-btn ${e.enabledInMenu===!0?`active`:``}" data-index="${t}" title="菜单显示">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.854 3.646a.5.5 0 0 1 0 .708l-7 7a.5.5 0 0 1-.708 0l-3.5-3.5a.5.5 0 1 1 .708-.708L6.5 10.293l6.646-6.647a.5.5 0 0 1 .708 0z"/>
          </svg>
        </button>
        <button class="edit-btn" data-index="${t}" title="编辑">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>
          </svg>
        </button>
        <button class="delete-btn" data-index="${t}" title="删除">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.5 5.5A.5.5 0 0 1 6 6v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m2.5 0a.5.5 0 0 1 .5.5v6a.5.5 0 0 1-1 0V6a.5.5 0 0 1 .5-.5m3 .5a.5.5 0 0 0-1 0v6a.5.5 0 0 0 1 0z"/>
            <path d="M14.5 3a1 1 0 0 1-1 1H13v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V4h-.5a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1H6a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1h3.5a1 1 0 0 1 1 1zM4.118 4 4 4.059V13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V4.059L11.882 4zM2.5 3h11V2h-11z"/>
          </svg>
        </button>
      </div>
    </div>
  `).join(``),e.querySelectorAll(`.move-up-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n>0){let e=M.customPrompts[n];M.customPrompts[n]=M.customPrompts[n-1],M.customPrompts[n-1]=e,chrome.storage.local.set({customPrompts:M.customPrompts}),Ra()}})}),e.querySelectorAll(`.move-down-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n<M.customPrompts.length-1){let e=M.customPrompts[n];M.customPrompts[n]=M.customPrompts[n+1],M.customPrompts[n+1]=e,chrome.storage.local.set({customPrompts:M.customPrompts}),Ra()}})}),e.querySelectorAll(`.menu-toggle-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);M.customPrompts[n].enabledInMenu=!M.customPrompts[n].enabledInMenu,chrome.storage.local.set({customPrompts:M.customPrompts}),Ra()})}),e.querySelectorAll(`.edit-btn`).forEach(e=>{e.addEventListener(`click`,()=>{Ha(parseInt(e.dataset.index))})}),e.querySelectorAll(`.delete-btn`).forEach(e=>{e.addEventListener(`click`,()=>{Ua(parseInt(e.dataset.index))})}),Ea()}function za(e){let t=document.getElementById(`promptErrorModal`),n=document.getElementById(`promptErrorMessage`);n.textContent=e,t.classList.add(`show`)}function Ba(){document.getElementById(`promptErrorModal`).classList.remove(`show`)}function Va(){let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=t.value.trim(),i=n.value.trim();if(!r||!i){za(`请填写编码和内容`);return}let a=e?parseInt(e.value):-1,o=M.customPrompts.findIndex(e=>e.code===r);if(o!==-1&&o!==a){za(`编码已存在`);return}a>=0&&a<M.customPrompts.length?M.customPrompts[a]={...M.customPrompts[a],code:r,content:i}:M.customPrompts.push({code:r,content:i,enabledInMenu:!1}),chrome.storage.local.set({customPrompts:M.customPrompts}),t.value=``,n.value=``,e&&(e.value=``);let s=document.getElementById(`promptManageAddBtn`);s.textContent=`添加提示词`,s.style.background=`#667eea`,Ra()}function Ha(e){let t=M.customPrompts[e];if(!t)return;let n=document.getElementById(`editPromptIndex`),r=document.getElementById(`newPromptCode`),i=document.getElementById(`newPromptContent`),a=document.getElementById(`promptManageAddBtn`);n&&(n.value=e),r.value=t.code,i.value=t.content,a.textContent=`保存修改`,a.style.background=`#ffa502`,r.scrollIntoView({behavior:`smooth`})}function Ua(e){let t=M.customPrompts[e];if(!t)return;M.pendingDeleteIndex=e;let n=document.getElementById(`deleteConfirmModal`),r=document.getElementById(`deleteConfirmMessage`);r.textContent=`确定要删除提示词 "/${t.code}" 吗？`,n.classList.add(`show`)}function Wa(){document.getElementById(`deleteConfirmModal`).classList.remove(`show`),M.pendingDeleteIndex=-1}function Ga(e){M.customPrompts.splice(e,1),chrome.storage.local.set({customPrompts:M.customPrompts}),Ra()}function Ka(){let e=document.getElementById(`promptManageCancelBtn`),t=document.getElementById(`promptManageAddBtn`),n=document.getElementById(`promptModalCloseBtn`);e&&e.addEventListener(`click`,La),t&&t.addEventListener(`click`,Va),n&&n.addEventListener(`click`,La);let r=document.getElementById(`deleteCancelBtn`),i=document.getElementById(`deleteConfirmBtn`);r&&r.addEventListener(`click`,Wa),i&&i.addEventListener(`click`,()=>{M.pendingDeleteIndex>=0&&Ga(M.pendingDeleteIndex),Wa()});let a=document.getElementById(`deleteConfirmModal`);a&&a.addEventListener(`click`,e=>{e.target===a&&Wa()});let o=document.getElementById(`promptErrorConfirmBtn`);o&&o.addEventListener(`click`,Ba);let s=document.getElementById(`promptErrorModal`);s&&s.addEventListener(`click`,e=>{e.target===s&&Ba()})}function qa(){let e=document.getElementById(`toolsPopupOverlay`);if(!e)return;M.currentCategory=`all`,M.currentSearch=``;let t=document.getElementById(`toolsSearchInput`);t&&(t.value=``),eo(),to(),chrome.storage.local.get([`enableToolPreselect`],e=>{let t=document.getElementById(`toolsPreselectToggle`);t&&(t.checked=e.enableToolPreselect===void 0?!0:e.enableToolPreselect)}),document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),Ya(),e.classList.add(`show`),console.log(`[SidePanel] 打开工具弹窗`)}function Ja(){let e=document.getElementById(`toolsPopupOverlay`);e&&(document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.style.background=``,e.style.color=``,e.style.borderColor=``}),e.classList.remove(`show`),console.log(`[SidePanel] 关闭工具弹窗`))}function Ya(){let t=document.getElementById(`toolsPopupList`);if(!t)return;t.innerHTML=``;let n={};e.forEach(e=>{if(M.currentCategory!==`all`&&e.category!==M.currentCategory)return;if(M.currentSearch){let t=e.name.toLowerCase().includes(M.currentSearch),n=e.description.toLowerCase().includes(M.currentSearch);if(!t&&!n)return}let t=e.category||`other`;n[t]||(n[t]=[]),n[t].push(e)});let r=Ke;if(Ge.forEach(i=>{let a=n[i];if(!a||a.length===0)return;let o=e.filter(e=>e.category===i),s=o.length,c=o.filter(e=>M.enabledTools.includes(e.id)).length,l=document.createElement(`div`);l.className=`popup-tool-category-group`,l.dataset.category=i;let u=document.createElement(`div`);u.className=`popup-tool-category`,u.dataset.category=i;let d=M.collapsedCategories[i]||!1;u.innerHTML=`
      <span class="category-expand-icon">${d?`▶`:`▼`}</span>
      <span class="category-name">${r[i]||i}</span>
      <span class="category-count">${c}/${s}</span>
    `,u.addEventListener(`click`,()=>{Xa(i)}),l.appendChild(u);let f=document.createElement(`div`);f.className=`popup-tool-items ${d?`collapsed`:``}`,a.forEach(e=>{let t=M.enabledTools.includes(e.id),n=document.createElement(`div`);n.className=`popup-tool-item`,n.dataset.category=i,n.innerHTML=`
        <input type="checkbox" id="tool_${e.id}" ${t?`checked`:``}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${L(e.name)}</div>
          <div class="popup-tool-desc">${L(e.description)}</div>
        </div>
      `;let r=n.querySelector(`input[type="checkbox"]`);r&&r.addEventListener(`change`,t=>{if(t.stopPropagation(),t.target.checked)M.enabledTools.includes(e.id)||M.enabledTools.push(e.id);else{let t=M.enabledTools.indexOf(e.id);t>-1&&M.enabledTools.splice(t,1)}Za(i),eo(),to()}),f.appendChild(n)}),l.appendChild(f),t.appendChild(l)}),t.children.length===0){let e=document.createElement(`div`);e.className=`popup-tool-empty`,e.textContent=`没有找到匹配的工具`,t.appendChild(e)}}function Xa(e){M.collapsedCategories[e]=!M.collapsedCategories[e];let t=document.querySelector(`.popup-tool-category-group[data-category="${e}"]`);if(!t)return;let n=t.querySelector(`.popup-tool-category`).querySelector(`.category-expand-icon`),r=t.querySelector(`.popup-tool-items`);M.collapsedCategories[e]?(n.textContent=`▶`,r.classList.add(`collapsed`)):(n.textContent=`▼`,r.classList.remove(`collapsed`))}function Za(t){let n=document.querySelector(`.popup-tool-category[data-category="${t}"]`);if(!n)return;let r=n.querySelector(`.category-count`);if(!r)return;let i=e.filter(e=>e.category===t),a=i.length,o=0;i.forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&t.checked&&o++}),r.textContent=`${o}/${a}`}function Qa(){return e.filter(e=>{if(M.currentCategory!==`all`&&e.category!==M.currentCategory)return!1;if(M.currentSearch){let t=e.name.toLowerCase().includes(M.currentSearch.toLowerCase()),n=e.description.toLowerCase().includes(M.currentSearch.toLowerCase());if(!t&&!n)return!1}return!0})}function $a(){Ge.forEach(e=>{Za(e)})}function eo(){let t=[`all`,...Ge],n=new Set(e.map(e=>e.id)),r=M.enabledTools.filter(e=>n.has(e)).length;t.forEach(t=>{let n=document.getElementById(`badge-`+t);if(!n)return;let i=0,a=0;if(t===`all`)i=e.length,a=r;else{let n=e.filter(e=>e.category===t);i=n.length,a=n.filter(e=>M.enabledTools.includes(e.id)).length}n.textContent=`${a}/${i}`})}function to(){let t=document.getElementById(`toolsEnabledCount`);if(!t)return;let n=e.length,r=new Set(e.map(e=>e.id));t.textContent=`(已启用 ${M.enabledTools.filter(e=>r.has(e)).length}/${n})`}function no(){let t=[];new Set(e.map(e=>e.id)),e.forEach(e=>{let n=document.getElementById(`tool_`+e.id);n?n.checked&&t.push(e.id):M.enabledTools.includes(e.id)&&t.push(e.id)}),M.enabledTools=t,M.useTools=M.enabledTools.length>0,chrome.storage.local.set({enabledTools:M.enabledTools},()=>{console.log(`[SidePanel] 工具配置已保存:`,M.enabledTools)}),ur().catch(()=>{});let n=document.getElementById(`toolsPreselectToggle`);n&&chrome.storage.local.set({enableToolPreselect:n.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已保存:`,n.checked)}),ro(),I(M.useTools?`已启用 ${M.enabledTools.length} 个工具`:`工具已全部禁用`,`success`)}function ro(){let t=document.getElementById(`toolsToggleBtn`),n=document.getElementById(`toolsBadge`),r=new Set(e.map(e=>e.id)),i=M.enabledTools.filter(e=>r.has(e)).length;t&&(M.useTools&&i>0?(t.classList.add(`active`),t.title=`工具 (${i}个启用)`):(t.classList.remove(`active`),t.title=`工具 (未启用)`)),n&&(i>0?(n.textContent=i,n.style.display=`inline`):n.style.display=`none`)}function io(e,t){let n=document.getElementById(`tokenStatsOverlay`),r=document.getElementById(`tokenStatsClose`),i=document.getElementById(`tokenStatsRefreshBtn`),a=document.getElementById(`tokenStatsClearBtn`);if(!n)return;function o(){n.style.display=`flex`,c()}function s(){n.style.display=`none`}window.openTokenStats=o,r&&r.addEventListener(`click`,s),n&&n.addEventListener(`click`,e=>{e.target===n&&s()}),i&&i.addEventListener(`click`,c),a&&a.addEventListener(`click`,async()=>{await t(`确定要清空所有 Token 使用统计吗？此操作不可撤销。`,`清空统计`)&&(await y(),c())});async function c(){let t=e(),n=document.getElementById(`tokenStatsLoading`),r=document.getElementById(`tokenStatsEmpty`),i=document.getElementById(`tokenStatsContent`);n&&(n.style.display=``),r&&(r.style.display=`none`),i&&(i.style.display=`none`);try{let[e,a]=await Promise.all([_(t),m()]);if(n&&(n.style.display=`none`),!(a&&a.totalApiCalls>0)){r&&(r.style.display=``);return}i&&(i.style.display=``),l(e),u(a),d(e.records||[])}catch(e){console.error(`[TokenStats] 加载统计失败:`,e),n&&(n.style.display=`none`),r&&(r.textContent=`加载失败`,r.style.display=``)}}function l(e){let t=document.getElementById(`tokenSessionStats`);if(!t)return;if(!e||e.apiCallCount===0){t.innerHTML=`<div style="text-align:center;color:#999;padding:20px;">当前会话暂无数据</div>`;return}let n=e.totalTokens>0?(e.totalPromptTokens/e.totalTokens*100).toFixed(1):0,r=e.totalTokens>0?(e.totalCompletionTokens/e.totalTokens*100).toFixed(1):0;t.innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:#f8f9ff;border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">总 Token 消耗</div>
          <div style="font-size:20px;font-weight:700;color:#333;">${f(e.totalTokens)}</div>
        </div>
        <div style="background:#f0fdf4;border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">API 调用次数</div>
          <div style="font-size:20px;font-weight:700;color:#333;">${e.apiCallCount}</div>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;font-size:12px;color:#666;">
        <span>Prompt: ${f(e.totalPromptTokens)} (${n}%)</span>
        <span>Completion: ${f(e.totalCompletionTokens)} (${r}%)</span>
      </div>
      <div style="margin-top:8px;">
        <div style="font-size:11px;color:#888;margin-bottom:3px;">上下文使用率</div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="flex:1;height:6px;background:#e8e8e8;border-radius:3px;overflow:hidden;">
            <div style="height:100%;background:linear-gradient(90deg,#667eea,#764ba2);border-radius:3px;width:${Math.min(e.maxContextUsageRate*100,100)}%;"></div>
          </div>
          <span style="font-size:12px;color:#667eea;font-weight:600;white-space:nowrap;">${(e.maxContextUsageRate*100).toFixed(1)}%</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#999;margin-top:2px;">
          <span>最大</span><span>平均 ${(e.avgContextUsageRate*100).toFixed(1)}%</span><span>最小 ${(e.minContextUsageRate*100).toFixed(1)}%</span>
        </div>
      </div>`}function u(e){let t=document.getElementById(`tokenOverallStats`);t&&(!e||e.totalApiCalls===0||(t.innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <div style="background:#fff7ed;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:#888;">总 Token</div>
          <div style="font-size:16px;font-weight:700;color:#333;">${f(e.totalTokens)}</div>
        </div>
        <div style="background:#f0f9ff;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:#888;">总会话数</div>
          <div style="font-size:16px;font-weight:700;color:#333;">${e.totalSessions}</div>
        </div>
        <div style="background:#fdf2f8;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:#888;">总 API 调用</div>
          <div style="font-size:16px;font-weight:700;color:#333;">${e.totalApiCalls}</div>
        </div>
      </div>`))}function d(e){let t=document.getElementById(`tokenRecentCalls`);if(!t)return;if(!e||e.length===0){t.innerHTML=``;return}let n={react_loop:`ReAct`,non_stream:`普通`,reflection:`反思`,tool_reflection:`工具反思`,subtask_reflection:`子任务反思`};t.innerHTML=e.slice(0,10).map((e,t)=>{let r=new Date(e.timestamp).toLocaleTimeString(`zh-CN`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`}),i=n[e.callType]||e.callType;return`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12px;">
        <span style="color:#999;">#${t+1}</span>
        <span style="color:#666;">${r}</span>
        <span style="background:#f0f0f5;padding:1px 6px;border-radius:3px;font-size:10px;color:#666;">${L(i)}</span>
        <span style="font-weight:500;color:#333;">${f(e.totalTokens)}</span>
        <span style="color:#aaa;font-size:10px;">${(e.contextUsageRate*100).toFixed(1)}%</span>
      </div>`}).join(``)}function f(e){return e>=1e6?(e/1e6).toFixed(1)+`M`:e>=1e3?(e/1e3).toFixed(1)+`K`:String(e)}}chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.chatMaxMemoryMessages&&(M.chatConfig.maxMemoryMessages=e.chatMaxMemoryMessages.newValue,ao(),console.log(`[SidePanel] 记忆限制配置已更新:`,M.chatConfig.maxMemoryMessages)),t===`local`&&e.chatContextWindow&&(M.chatConfig.contextWindow=e.chatContextWindow.newValue||0,console.log(`[SidePanel] 上下文窗口配置已更新:`,M.chatConfig.contextWindow))});function ao(){let e=document.getElementById(`memoryLimitLabel`);e&&(M.chatConfig.maxMemoryMessages!==null&&M.chatConfig.maxMemoryMessages!==void 0&&M.chatConfig.maxMemoryMessages>0?e.textContent=`(${M.chatConfig.maxMemoryMessages})`:e.textContent=`(全)`,e.style.display=`inline`,e.style.cursor=`pointer`,e.title=`点击设置记忆历史限制条数`)}function oo(e){e.preventDefault(),e.stopPropagation();let t=document.getElementById(`memoryLimitDropdown`);if(t.classList.toggle(`show`),t.classList.contains(`show`)){let e=M.chatConfig.maxMemoryMessages;t.querySelectorAll(`.memory-limit-option`).forEach(t=>{t.classList.remove(`selected`);let n=parseInt(t.dataset.value);(e===null&&n===0||e!==null&&e>0&&n===e)&&t.classList.add(`selected`)});let n=t.querySelector(`#memoryLimitInput`);e!==null&&e>0?n.value=e:n.value=``}}function so(){let e=document.getElementById(`memoryLimitDropdown`),t=document.getElementById(`memoryLimitLabel`),n=e?.querySelector(`#memoryLimitInput`);if(!e||!t)return;ao(),t.addEventListener(`click`,oo);let r=e.querySelectorAll(`.memory-limit-option`);r.forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let i=parseInt(e.dataset.value),a=i===0?null:i;r.forEach(e=>e.classList.remove(`selected`)),e.classList.add(`selected`),n&&(n.value=i===0?``:i),chrome.storage.local.set({chatMaxMemoryMessages:a},()=>{M.chatConfig.maxMemoryMessages=a,ao(),I(`✅ 配置已更新`,`success`)})})}),n&&(n.addEventListener(`click`,e=>e.stopPropagation()),n.addEventListener(`mousedown`,e=>e.stopPropagation()),n.addEventListener(`change`,e=>{e.stopPropagation();let t=e.target.value.trim(),n=t&&parseInt(t)>0?parseInt(t):null;r.forEach(e=>e.classList.remove(`selected`)),chrome.storage.local.set({chatMaxMemoryMessages:n},()=>{M.chatConfig.maxMemoryMessages=n,ao(),I(`✅ 配置已更新`,`success`)})})),document.addEventListener(`click`,n=>{!e.contains(n.target)&&n.target!==t&&e.classList.remove(`show`)})}function co(e){document.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?(t.classList.add(`selected`),t.querySelector(`.model-option-check`).textContent=`✓`):(t.classList.remove(`selected`),t.querySelector(`.model-option-check`).textContent=``)})}function lo(e,t){let n=document.getElementById(`tempDropdown`);if(!n){typeof t==`function`&&t();return}chrome.storage.local.get([`deletedPresetModels`],r=>{if((r.deletedPresetModels||[]).forEach(e=>{let t=n.querySelector(`.model-option[data-value="${e}"]`);t&&t.remove()}),!e||e.length===0){typeof t==`function`&&t();return}let i=[`deepseek-v4-pro`,`deepseek-v4-flash`];e.forEach(e=>{if(i.includes(e)||n.querySelector(`.model-option[data-value="${e}"]`))return;let t=document.createElement(`div`);t.className=`model-option`,t.dataset.value=e,t.innerHTML=`<span class="model-option-check"></span>${e}`,t.addEventListener(`click`,t=>{t.stopPropagation(),M.currentModel=e,co(e),chrome.storage.local.set({modelName:e})}),n.querySelector(`.model-section`).appendChild(t)}),typeof t==`function`&&t()})}function uo(e,t=`📌 已选中`){if(!M.enableSelectionQuery)return;M.quotedContextText=``,M.selectedContextText=e;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let i;i=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,r.textContent=`${t}: ${i}`,n.classList.add(`show`)}}function fo(e,t,n=0,r=0){if(!M.enableSelectionQuery)return;let i=document.getElementById(`selectionFloatingMenu`),a=document.getElementById(`selectionMenuItems`);if(!i||!a)return;let o=M.customPrompts.filter(e=>e.enabledInMenu===!0);if(o.length===0)return;a.innerHTML=``,o.forEach(e=>{let n=e.content.length>10?e.content.substring(0,10)+`...`:e.content,r=document.createElement(`div`);r.className=`menu-item`,r.innerHTML=`
      <span>${n}</span>
      <span class="menu-item-code">/${e.code}</span>
    `,r.addEventListener(`click`,n=>{n.stopPropagation(),po(e,t)}),a.appendChild(r)});let s=document.body.getBoundingClientRect(),c=40+o.length*36,l=r-s.top-c-30,u=n-s.left-20;l<s.top+10&&(l=r-s.top+30),u<s.left+10&&(u=n-s.left+20),u+180>s.right-10&&(u=n-s.left-180-30,u<s.left+10&&(u=n-s.left+20)),l+c>s.bottom-10&&(l=r-s.top-c-30,l<s.top+10&&(l=r-s.top+30)),i.style.top=l+`px`,i.style.left=u+`px`,i.style.maxHeight=s.bottom-l-20+`px`,i.classList.add(`show`)}window.hideFloatingMenu=function(){let e=document.getElementById(`selectionFloatingMenu`);e&&e.classList.remove(`show`),M.lastSelectedText=``,M.currentSelectionRange=null};async function po(e,t){if(!M.enableSelectionQuery)return;if(window.hideFloatingMenu(),M.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}M.selectedContextText=t,li();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove(),Ui(`selected`,t,!1);let{compressed:r,wasCompressed:i}=h(t),a=`[选中内容${i?`摘要`:``}]\n${r}\n\n[用户问题]\n${e.content}`;Z(`user`,e.content),M.messageHistory.push({role:`user`,content:a}),G(),pt(e.content),M.isGenerating=!0;let o=document.getElementById(`sendBtn`);o.disabled=!0;let s=ca(),c=M.activeSessionId,l=M.currentModel;try{await ut(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,M.isolateChat),console.log(`  - chatConfig:`,M.chatConfig),console.log(`  - messageHistory.length:`,M.messageHistory.length);let e=[{role:`system`,content:await st()}];if(M.isolateChat){let t=M.messageHistory,n=M.chatConfig.contextWindow||0,r=g(l,M.enabledTools.length||50,n),i=Math.floor(r*.7),a=M.messageHistory.slice(0,-1),o=M.messageHistory[M.messageHistory.length-1],s=[],c=v([o]);for(let e=a.length-1;e>=0;e--){let t=a[e],n=v([t]);if(c+n<=i)s.unshift(t),c+=n;else break}if(s.length<a.length){let t=a.length-s.length,n=u(a.slice(0,t));n&&(e[0]={...e[0],content:e[0].content+`

`+n})}t=[...s,o],e=[...e,...t]}else e.push({role:`user`,content:a});let t=await ct(),n,r;try{let i=await _a(e,l,M.useTools,t);n=i.content,r=i.executionLog||[]}catch(e){throw $(s),n=`❌ 请求失败：`+(e.message||`未知错误`),r=e.executionLog||[],Z(`assistant`,n,!0,r),M.messageHistory.push({role:`assistant`,content:n,executionLog:r}),G(),e}$(s),await yn(Z(`assistant`,n,!0,r)),M.messageHistory.push({role:`assistant`,content:n,executionLog:r}),G()}catch{}finally{M.generatingSessionIds.delete(c),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),o.disabled=!1,document.getElementById(`userInput`).focus()}}function mo(e){let t=document.getElementById(`headerAgentDot`),n=document.getElementById(`headerAgentIndicator`);if(!(!t||!n))if(!e||!e.connected)t.className=`header-agent-dot disconnected`,n.title=`Agent 未连接 - 点击前往设置`;else{t.className=`header-agent-dot connected`;let r=[`Agent 已连接`];e.platformName&&r.push(e.platformName),e.arch&&r.push(e.arch),n.title=r.join(` | `)+` - 点击前往设置`}}document.addEventListener(`DOMContentLoaded`,async()=>{window.__tableBlocks=[],await dt(),await oi(),chrome.runtime.onMessage.addListener(e=>{e.type===`SELECTION_AI_SEARCH`&&e.prompt&&(console.log(`[SidePanel] 收到选中文本 AI 搜索:`,e.selectedText?.substring(0,50)),Bi(e.prompt,e.selectedText),chrome.storage.session.remove(`pendingSelectionSearch`).catch(()=>{})),e.type===`FILL_SIDEPANEL_INPUT`&&e.text&&(console.log(`[SidePanel] 收到追问填充:`,e.text?.substring(0,50)),Vi(e.text),chrome.storage.session.remove(`pendingFillInput`).catch(()=>{})),e.type===`DIRECT_SEND`&&e.text&&(console.log(`[SidePanel] 收到直接发送:`,e.text?.substring(0,50)),Hi(e.text,e.selectedText||``),chrome.storage.session.remove(`pendingDirectSend`).catch(()=>{})),e.type===`AGENT_STATUS_CHANGE`&&(console.log(`[SidePanel] 收到 Agent 状态变化:`,e.connected,e.status),chrome.storage.local.get(`agentPlatform`,e=>{M.agentPlatform=e.agentPlatform||{connected:!1},mo(M.agentPlatform)})),e.type===`AGENT_CONNECTION_CHANGED`&&(console.log(`[SidePanel] 收到 Agent 连接状态变更:`,e.connected),M.agentPlatform={...M.agentPlatform,connected:e.connected},mo(M.agentPlatform))});let t=await chrome.storage.session.get(`pendingSelectionSearch`);if(t.pendingSelectionSearch&&t.pendingSelectionSearch.selectedText){let{prompt:e,selectedText:n}=t.pendingSelectionSearch;console.log(`[SidePanel] 有待处理的选中文本搜索:`,n?.substring(0,50)),setTimeout(()=>{Bi(e,n)},500),await chrome.storage.session.remove(`pendingSelectionSearch`)}let n=await chrome.storage.session.get(`pendingFillInput`);if(n.pendingFillInput&&n.pendingFillInput.text){let{text:e}=n.pendingFillInput;console.log(`[SidePanel] 有待填充的追问文本:`,e?.substring(0,50)),setTimeout(()=>{Vi(e)},500),await chrome.storage.session.remove(`pendingFillInput`)}let r=await chrome.storage.session.get(`pendingDirectSend`);if(r.pendingDirectSend&&r.pendingDirectSend.text){let{text:e,selectedText:t}=r.pendingDirectSend;console.log(`[SidePanel] 有待直接发送的文本:`,e?.substring(0,50)),setTimeout(()=>{Hi(e,t||``)},500),await chrome.storage.session.remove(`pendingDirectSend`)}chrome.tabs.onActivated.addListener(async e=>{console.log(`[SidePanel] Tab 切换, 新 Tab ID:`,e.tabId),M.currentTabId=e.tabId}),chrome.tabs.onUpdated.addListener(async(e,t)=>{t.status===`complete`&&M.currentTabId===e&&console.log(`[SidePanel] 当前 Tab 页面更新:`,t)}),typeof marked<`u`&&(marked.setOptions({breaks:!0,gfm:!0}),console.log(`[SidePanel] Marked 库已加载`)),typeof mermaid<`u`&&(mermaid.initialize({startOnLoad:!1,theme:`default`,securityLevel:`loose`,fontFamily:`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`}),console.log(`[SidePanel] Mermaid 库已加载`));let i=document.getElementById(`userInput`),a=document.getElementById(`sendBtn`),o=document.getElementById(`clearChatBtn`),s=document.getElementById(`exportChatBtn`),c=document.getElementById(`chatContainer`),l=document.getElementById(`tempDisplay`),u=document.getElementById(`tempDropdown`),d=document.getElementById(`tempPresetList`),f=document.getElementById(`tempSlider`),p=document.getElementById(`tempNumberInput`);function m(){if(!i||M.isScrolling)return;i.style.height=`auto`;let e=i.scrollHeight;e<=50?i.style.height=``:i.style.height=Math.min(e,100)+`px`}chrome.storage.local.get([`temperature`,`topP`,`selectedTempIndex`],e=>{e.temperature!==void 0&&(M.temperature=e.temperature),e.topP!==void 0&&(M.topP=e.topP),e.selectedTempIndex!==void 0&&(M.selectedTempIndex=e.selectedTempIndex),h()});function h(){f&&(f.value=M.temperature),p&&(p.value=M.temperature.toFixed(2));let e=document.getElementById(`tempIconValue`);e&&(e.textContent=M.temperature.toFixed(2)),g()}function g(){d.innerHTML=N.map((e,t)=>`
      <div class="temp-preset-item ${t===M.selectedTempIndex?`selected`:``}" data-index="${t}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${e.label}</div>
          <div class="temp-preset-desc" title="${e.tip}">${e.tip}</div>
        </div>
        <div class="temp-preset-value">${e.temp.toFixed(2)}</div>
      </div>
    `).join(``),d.querySelectorAll(`.temp-preset-item`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation(),_(parseInt(e.dataset.index))})})}function _(e){let t=N[e];t&&(M.selectedTempIndex=e,M.temperature=t.temp,h(),chrome.storage.local.set({temperature:M.temperature,topP:M.topP,selectedTempIndex:M.selectedTempIndex}))}f.addEventListener(`input`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),M.temperature=t,p.value=t.toFixed(2);let n=document.getElementById(`tempIconValue`);n&&(n.textContent=t.toFixed(2));let r=0,i=Math.abs(N[0].temp-t);for(let e=1;e<N.length;e++){let n=Math.abs(N[e].temp-t);n<i&&(i=n,r=e)}M.selectedTempIndex=r,g(),chrome.storage.local.set({temperature:M.temperature,topP:M.topP,selectedTempIndex:M.selectedTempIndex})}),p.addEventListener(`change`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),M.temperature=t,f.value=t,p.value=t.toFixed(2);let n=0,r=Math.abs(N[0].temp-t);for(let e=1;e<N.length;e++){let i=Math.abs(N[e].temp-t);i<r&&(r=i,n=e)}M.selectedTempIndex=n,g(),chrome.storage.local.set({temperature:M.temperature,topP:M.topP,selectedTempIndex:M.selectedTempIndex})}),l&&u&&(l.addEventListener(`click`,e=>{e.stopPropagation(),u.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{let t=document.querySelector(`.temp-selector`);t&&!t.contains(e.target)&&u.classList.remove(`show`)})),c.addEventListener(`mousedown`,e=>{M.lastMouseX=e.clientX,M.lastMouseY=e.clientY}),c.addEventListener(`mouseup`,e=>{M.lastMouseX=e.clientX,M.lastMouseY=e.clientY,M.enableSelectionQuery&&setTimeout(()=>{let e=window.getSelection();if(e&&!e.isCollapsed&&e.toString().trim()){let t=e.toString().trim();c.contains(e.anchorNode)&&t!==M.lastSelectedText&&(M.lastSelectedText=t,M.currentSelectionRange=e.getRangeAt(0).cloneRange(),uo(t),fo(e,t,M.lastMouseX,M.lastMouseY))}else c.contains(e.anchorNode)||(M.lastSelectedText=``,M.currentSelectionRange=null,window.hideFloatingMenu())},10)});let v=``,y=null;async function b(){try{let e=await new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>e(t))});if(e&&e.length>0){let t=await new Promise(t=>{chrome.tabs.sendMessage(e[0].id,{action:`getSelectedText`},e=>{chrome.runtime.lastError?(console.debug(`[SidePanel] content script 未加载或无法通信:`,chrome.runtime.lastError.message),t(null)):t(e)})});if(!t)return;let n=t?.text||``;n&&n.trim()?n!==v&&(v=n,uo(n.trim())):v=``}}catch{}}function x(){y&&=(clearInterval(y),null),M.enableSelectionQuery&&(y=setInterval(b,500))}x(),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`&&`enableSelectionQuery`in e){M.enableSelectionQuery=e.enableSelectionQuery.newValue;let t=document.getElementById(`enableSelectionQueryBtn`);t&&(t.checked=M.enableSelectionQuery),x()}}),chrome.storage.local.get([`modelName`,`customModels`,`customPrompts`,`systemPrompt`,`inputHistory`,`agentPlatform`,`enableImageInput`,`imageModelName`,`imageApiBase`,`imageApiKey`],e=>{let t=e.modelName;t&&(M.currentModel=t),M.customPrompts=e.customPrompts||[],M.systemPrompt=e.systemPrompt||``,M.inputHistory=e.inputHistory||[],e.agentPlatform&&(M.agentPlatform=e.agentPlatform),mo(M.agentPlatform),M.enableImageInput=e.enableImageInput||!1,M.imageModelName=e.imageModelName||``,M.imageApiBase=e.imageApiBase||``,M.imageApiKey=e.imageApiKey||``,ho(),Da(),lo(e.customModels,()=>{t&&co(t)})}),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`){if(e.customModels){let t=e.customModels.newValue||[],n=u.querySelector(`.model-section`);n&&n.querySelectorAll(`.model-option`).forEach(e=>{let t=e.dataset.value;t!==`deepseek-v4-pro`&&t!==`deepseek-v4-flash`&&e.remove()}),lo(t)}if(e.modelName){let t=e.modelName.newValue;t&&(M.currentModel=t,co(t))}e.enableImageInput&&(M.enableImageInput=e.enableImageInput.newValue,ho()),e.imageModelName&&(M.imageModelName=e.imageModelName.newValue||``),e.imageApiBase&&(M.imageApiBase=e.imageApiBase.newValue||``),e.imageApiKey&&(M.imageApiKey=e.imageApiKey.newValue||``),e.deletedPresetModels&&(e.deletedPresetModels.newValue||[]).forEach(e=>{let t=u.querySelector(`.model-option[data-value="${e}"]`);t&&t.remove()})}}),ui(),document.addEventListener(`session-switched`,()=>{let e=document.getElementById(`chatContainer`),t=document.getElementById(`sendBtn`),n=document.getElementById(`userInput`);if(!e)return;let r=document.getElementById(`imagePreviewBar`);if(M.attachedImages.length>0&&r&&r.style.display===`none`&&(M.attachedImages=[]),M.executionLogListener&&=(chrome.runtime.onMessage.removeListener(M.executionLogListener),null),t&&(t.disabled=M.isGenerating),n&&n.focus(),e.innerHTML=``,!M.messageHistory||M.messageHistory.length===0){let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      `,e.appendChild(t)}else M.messageHistory.forEach(e=>{e.htmlContent?ua(e.htmlContent):Z(e.role,e.content,!1,e.executionLog||[],e.reflectionScore,e.wasRevised)}),pn();let i=M.pendingCallApiSessionIds.has(M.activeSessionId)&&!!M.pendingCancelApi;if(console.log(`[SidePanel] session-switched: pendingTask?`,i,`pendingSessionIds:`,[...M.pendingCallApiSessionIds],`activeSessionId:`,M.activeSessionId,`hasCancelApi:`,!!M.pendingCancelApi),i){console.log(`[SidePanel] 切回有后台任务的会话，显示加载状态`);let e=ca();M.substituteLoadingIds.set(M.activeSessionId,e)}let a=`scrollPosition_`+(M.activeSessionId||`default`);chrome.storage.local.get([a],e=>{e[a]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t&&(t.scrollTop=e[a])},150)})}),document.querySelectorAll(`.model-option`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.value;M.currentModel=n,co(n),chrome.storage.local.set({modelName:n})})}),document.addEventListener(`click`,e=>{let t=document.getElementById(`promptDropdown`),n=document.getElementById(`promptSelector`),r=document.getElementById(`selectionFloatingMenu`);if(n.contains(e.target)||(t.classList.remove(`show`),ka()),r&&!r.contains(e.target)){let t=window.getSelection(),n=c.contains(e.target),r=t&&!t.isCollapsed&&c.contains(t.anchorNode);(!n||!r)&&window.hideFloatingMenu()}}),a.addEventListener(`click`,zi);let S=document.getElementById(`promptTriggerBtn`);S&&S.addEventListener(`click`,e=>{e.stopPropagation(),S.blur(),Aa()});let C=document.getElementById(`shortcutsBtn`),w=document.getElementById(`shortcutsModal`),T=document.getElementById(`shortcutsCloseBtn`);function E(){w&&(w.style.display=`flex`)}function D(){w&&(w.style.display=`none`)}C&&C.addEventListener(`click`,e=>{e.stopPropagation(),E();let t=document.getElementById(`headerMoreDropdown`);t&&t.classList.remove(`show`)}),T&&T.addEventListener(`click`,D),w&&w.addEventListener(`click`,e=>{e.target===w&&D()}),document.addEventListener(`keydown`,e=>{if((e.ctrlKey||e.metaKey)&&e.key===`t`){e.preventDefault();let t=document.getElementById(`toolsPopup`);t&&t.style.display!==`none`?Ja():qa()}if(e.key===`Escape`&&w&&w.style.display!==`none`){D();return}if(e.altKey&&e.code===`Slash`){e.preventDefault(),E();return}if(e.altKey&&!e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey){e.preventDefault(),_o();return}if(e.altKey&&e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey){e.preventDefault(),vo();return}if(e.altKey&&(e.key===`ArrowUp`||e.key===`ArrowDown`)){let t=document.getElementById(`chatContainer`);if(!t)return;let n=t.querySelectorAll(`.message.user, .message.assistant, .user-context-bubble`);if(e.shiftKey){e.preventDefault(),e.key===`ArrowUp`&&n.length>0?n[0].scrollIntoView({behavior:`smooth`,block:`start`}):e.key===`ArrowDown`&&n.length>0&&n[n.length-1].scrollIntoView({behavior:`smooth`,block:`start`});return}if(n.length===0)return;let r=t.getBoundingClientRect().top;if(e.key===`ArrowUp`){e.preventDefault();let t=-1;for(let e=0;e<n.length;e++)if(n[e].getBoundingClientRect().bottom>r+10){t=e;break}t===-1&&(t=n.length);let i=t-1;i>=0&&n[i].scrollIntoView({behavior:`smooth`,block:`start`})}else if(e.key===`ArrowDown`){e.preventDefault();let t=-1;for(let e=0;e<n.length;e++)if(n[e].getBoundingClientRect().bottom>r+10){t=e;break}if(t===-1)return;let i=t+1;i<n.length&&n[i].scrollIntoView({behavior:`smooth`,block:`start`})}}}),i.addEventListener(`keydown`,e=>{let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);if(t.style.display!==`none`&&n.classList.contains(`show`)){let t=n.querySelectorAll(`.prompt-item`),r=t.length;if(r!==0&&e.key===`ArrowDown`){e.preventDefault(),M.selectedPromptIndex<0?M.selectedPromptIndex=0:M.selectedPromptIndex=(M.selectedPromptIndex+1)%r,Na(t);return}if(e.key===`ArrowUp`){e.preventDefault(),M.selectedPromptIndex<0||M.selectedPromptIndex===0?M.selectedPromptIndex=r-1:--M.selectedPromptIndex,Na(t);return}if(e.key===`Enter`&&(e.ctrlKey||e.metaKey)&&M.selectedPromptIndex>=0){e.preventDefault();let n=t[M.selectedPromptIndex].dataset.code;Pa(n);return}if(e.key===`Enter`&&M.selectedPromptIndex>=0){e.preventDefault();let n=t[M.selectedPromptIndex].dataset.code;Fa(n);return}if(e.key===`Escape`){ka();return}}if(e.key===`Escape`){M.inputHistoryIndex>=0&&(M.inputHistoryIndex=-1),i.value&&(i.value=``,i.style.height=`auto`,i.dispatchEvent(new Event(`input`))),e.preventDefault();return}if(!(t.style.display!==`none`&&n.classList.contains(`show`))&&!M.isGenerating){if(e.key===`ArrowUp`){e.preventDefault(),M.inputHistoryIndex===-1?M.inputHistoryIndex=M.inputHistory.length-1:M.inputHistoryIndex>0&&M.inputHistoryIndex--,M.inputHistoryIndex<0&&(M.inputHistoryIndex=0),M.inputHistoryIndex>=0&&M.inputHistory.length>0&&(i.value=M.inputHistory[M.inputHistoryIndex],i.dispatchEvent(new Event(`input`)));return}if(e.key===`ArrowDown`){e.preventDefault(),M.inputHistoryIndex>=0&&M.inputHistoryIndex<M.inputHistory.length-1?(M.inputHistoryIndex++,i.value=M.inputHistory[M.inputHistoryIndex],i.dispatchEvent(new Event(`input`))):(M.inputHistoryIndex=-1,i.value=``,i.dispatchEvent(new Event(`input`)));return}}e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),zi())}),i.addEventListener(`paste`,e=>{if(!M.enableImageInput)return;let t=e.clipboardData?.items;if(t){for(let n of t)if(n.type.startsWith(`image/`)){e.preventDefault();let t=n.getAsFile();t&&Fi(t);break}}});let ee=document.getElementById(`screenshotBtn`);ee&&ee.addEventListener(`click`,async e=>{if(!M.enableImageInput)return;let t=e.ctrlKey||e.shiftKey||e.metaKey;try{t?await vo():await _o()}catch(e){console.error(`[SidePanel] 截图失败:`,e),I(`截图失败，请重试`)}}),Pi(),i.addEventListener(`wheel`,e=>{M.isScrolling=!0;let t=i.style.height||i.offsetHeight+`px`;i.style.height=t,i.scrollHeight<=i.clientHeight+10&&(e.preventDefault(),e.stopPropagation()),setTimeout(()=>{M.isScrolling=!1},100)},{passive:!1}),i.addEventListener(`input`,e=>{let t=i.value;document.getElementById(`promptSelector`),document.getElementById(`promptDropdown`);let n=t.lastIndexOf(`/`);if(n!==-1){let e=t.substring(n+1);n===0||t[n-1]===`
`||t[n-1]===` `?Oa(e):ja(e)}else ka();m()}),c.addEventListener(`scroll`,()=>{let e=`scrollPosition_`+(M.activeSessionId||`default`);chrome.storage.local.set({[e]:c.scrollTop})});let te=document.getElementById(`headerMoreBtn`),O=document.getElementById(`headerMoreDropdown`);te&&O&&(te.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{!O.contains(e.target)&&e.target!==te&&O.classList.remove(`show`)})),o.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),yi()}),s&&s.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),fi()});let ne=document.getElementById(`importChatBtn`);ne&&ne.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),_i()});let re=document.getElementById(`importSessionsFile`);re&&re.addEventListener(`change`,e=>{let t=e.target.files[0];t&&vi(t)});let ie=document.getElementById(`settingsBtn`);ie&&ie.addEventListener(`click`,()=>{chrome.runtime.openOptionsPage()});let ae=document.getElementById(`headerAgentIndicator`);ae&&ae.addEventListener(`click`,async()=>{let e=chrome.runtime.getURL(`options.html#agent`),t=await chrome.tabs.query({url:chrome.runtime.getURL(`options.html`)});t.length>0?await chrome.tabs.update(t[0].id,{active:!0,url:e}):await chrome.tabs.create({url:e})});let oe=document.getElementById(`prototypeLibraryBtn`);oe&&oe.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),Gt()});let se=document.getElementById(`tokenStatsHeaderBtn`);se&&se.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),window.openTokenStats&&window.openTokenStats()}),io(()=>M.activeSessionId,we);let ce=document.getElementById(`isolateChatBtn`),k=document.getElementById(`enableToolsBtn`),le=document.getElementById(`toolsConfigBtn`);chrome.storage.local.get([`isolateChat`,`enableSelectionQuery`,`enableTools`,`enabledTools`],t=>{t.isolateChat!==void 0&&(M.isolateChat=t.isolateChat),ce.checked=M.isolateChat,t.enableSelectionQuery!==void 0&&(M.enableSelectionQuery=t.enableSelectionQuery);let n=document.getElementById(`enableSelectionQueryBtn`);if(n&&(n.checked=M.enableSelectionQuery),t.enableTools!==void 0&&(M.useTools=t.enableTools),t.enabledTools&&t.enabledTools.length>0){let n=new Set(e.map(e=>e.id)),r=t.enabledTools.filter(e=>n.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);M.enabledTools=[...r,...i],i.length>0&&chrome.storage.local.set({enabledTools:M.enabledTools})}else M.enabledTools=e.filter(e=>e.enabled).map(e=>e.id);M.enabledTools.length===0&&(M.useTools=!1),k&&(k.checked=M.useTools),x()}),ce.addEventListener(`change`,()=>{M.isolateChat=ce.checked,chrome.storage.local.set({isolateChat:M.isolateChat}),console.log(`[SidePanel] 记忆对话:`,M.isolateChat?`已启用`:`已禁用`)});let ue=document.getElementById(`enableSelectionQueryBtn`);ue&&ue.addEventListener(`change`,()=>{M.enableSelectionQuery=ue.checked,chrome.storage.local.set({enableSelectionQuery:M.enableSelectionQuery}),console.log(`[SidePanel] 划词问答:`,M.enableSelectionQuery?`已启用`:`已禁用`),!M.enableSelectionQuery&&M.selectedContextText&&li()}),k&&k.addEventListener(`change`,()=>{M.useTools=k.checked,chrome.storage.local.set({enableTools:M.useTools}),M.useTools&&M.enabledTools.length===0&&(M.enabledTools=e.filter(e=>e.enabled).map(e=>e.id),chrome.storage.local.set({enabledTools:M.enabledTools})),console.log(`[SidePanel] 工具总开关:`,M.useTools?`已启用`:`已禁用`)}),le&&le.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),qa()});let de=document.getElementById(`toolsPopupOverlay`),fe=document.getElementById(`toolsPopupClose`),pe=de?de.querySelector(`.modal-container`):null;fe&&fe.addEventListener(`click`,Ja),pe&&pe.addEventListener(`click`,e=>{e.stopPropagation()});let me=document.getElementById(`toolsSearchInput`);me&&me.addEventListener(`input`,e=>{M.currentSearch=e.target.value.toLowerCase(),Ya()});let he=document.querySelectorAll(`.category-btn`);he.forEach(e=>{e.addEventListener(`click`,()=>{he.forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.style.background=`#f5f3ff`,e.style.color=`#667eea`,e.style.borderColor=`#d4cfff`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`,M.currentCategory=e.dataset.category,Ya()})});let ge=document.getElementById(`toolsCategories`);ge&&ge.addEventListener(`wheel`,e=>{e.preventDefault(),ge.scrollLeft+=e.deltaY*2},{passive:!1});let _e=document.getElementById(`toolsSelectAll`),ve=document.getElementById(`toolsSelectNone`);_e&&_e.addEventListener(`click`,()=>{Qa().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!0),M.enabledTools.includes(e.id)||M.enabledTools.push(e.id)}),$a(),eo(),to()}),ve&&ve.addEventListener(`click`,()=>{Qa().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!1);let n=M.enabledTools.indexOf(e.id);n>-1&&M.enabledTools.splice(n,1)}),$a(),eo(),to()});let ye=document.getElementById(`toolsPopupSave`);ye&&ye.addEventListener(`click`,()=>{no(),to()});let be=document.getElementById(`toolsPreselectToggle`);be&&be.addEventListener(`change`,()=>{chrome.storage.local.set({enableToolPreselect:be.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已更新:`,be.checked)})});let xe=document.getElementById(`toolsPopupCancel`);xe&&xe.addEventListener(`click`,()=>{Ja()});let Se=document.getElementById(`modalCancelBtn`),Ce=document.getElementById(`modalConfirmBtn`);function we(e,t=`确认操作`){return new Promise(n=>{let r=document.getElementById(`customConfirmOverlay`),i=document.getElementById(`customConfirmTitle`),a=document.getElementById(`customConfirmMessage`),o=document.getElementById(`customConfirmCancelBtn`),s=document.getElementById(`customConfirmOkBtn`);if(!r||!i||!a||!o||!s){n(confirm(e));return}let c=()=>{r.style.display=`none`,s.removeEventListener(`click`,l),o.removeEventListener(`click`,u),r.removeEventListener(`click`,d)},l=()=>{c(),n(!0)},u=()=>{c(),n(!1)},d=e=>{e.target===r&&(c(),n(!1))};i.textContent=t,a.textContent=e,r.style.display=`flex`,s.addEventListener(`click`,l),o.addEventListener(`click`,u),r.addEventListener(`click`,d)})}let A=document.getElementById(`toolStatsOverlay`),Te=document.getElementById(`toolStatsClose`),Ee=document.getElementById(`toolStatsBtn`);function De(){A&&(A.style.display=`flex`,je())}function Oe(){A&&(A.style.display=`none`)}Ee&&Ee.addEventListener(`click`,e=>{e.stopPropagation(),De()}),Te&&Te.addEventListener(`click`,Oe),A&&A.addEventListener(`click`,e=>{e.target===A&&Oe()});let ke=document.getElementById(`toolStatsRefreshBtn`);ke&&ke.addEventListener(`click`,je);let Ae=document.getElementById(`toolStatsClearBtn`);Ae&&Ae.addEventListener(`click`,async()=>{await we(`确定要清空所有工具使用统计吗？此操作不可撤销。`,`清空统计`)&&(await chrome.storage.local.remove([`toolUsageStats`]),je())});let j={column:`callCount`,asc:!1};async function je(){let t=document.getElementById(`toolStatsTable`),n=document.getElementById(`toolStatsTableBody`),r=document.getElementById(`toolStatsLoading`),i=document.getElementById(`toolStatsEmpty`),a=document.getElementById(`toolStatsSummary`),o=document.getElementById(`toolStatsUnusedSection`),s=document.getElementById(`toolStatsUnusedList`);if(!(!t||!n||!r||!i)){t.style.display=`none`,i.style.display=`none`,o&&(o.style.display=`none`),a&&(a.textContent=``),r.style.display=``;try{let n=(await chrome.storage.local.get([`toolUsageStats`])).toolUsageStats||{},c=Object.entries(n);if(c.length===0){r.style.display=`none`,i.style.display=``;return}let l={};e.forEach(e=>{l[e.id]=e.name?`${e.name}：${e.description||``}`:e.description||e.id}),Me(c,l);let u=e.map(e=>e.id),d=new Set(c.map(([e])=>e)),f=u.filter(e=>!d.has(e)),p=c.length,m=f.length;a&&(a.textContent=`已使用 ${p} 个，未使用 ${m} 个`),o&&s&&m>0&&(s.innerHTML=f.sort((e,t)=>e.toLowerCase().localeCompare(t.toLowerCase())).map(e=>`<code title="${L(l[e]||e)}" style="padding: 3px 10px; background: #f5f5f5; color: #aaa; border: 1px solid #eee; border-radius: 4px; font-size: 11px;">${e}</code>`).join(``),o.style.display=``),r.style.display=`none`,t.style.display=``}catch(e){console.error(`[SidePanel] 加载统计失败:`,e),r.style.display=`none`,i.textContent=`加载失败`,i.style.display=``}}}function Me(e,t){let n=document.getElementById(`toolStatsTableBody`);if(!n)return;let{column:r,asc:i}=j;n.innerHTML=[...e].sort((e,t)=>{let[n,a]=e,[o,s]=t,c=a.callCount>0?a.successCount/a.callCount*100:0,l=s.callCount>0?s.successCount/s.callCount*100:0,u=a.callCount>0?a.totalDuration/a.callCount:0,d=s.callCount>0?s.totalDuration/s.callCount:0,f=0;switch(r){case`name`:f=n.toLowerCase().localeCompare(o.toLowerCase());break;case`callCount`:f=a.callCount-s.callCount;break;case`successCount`:f=a.successCount-s.successCount;break;case`successRate`:f=c-l;break;case`duration`:f=u-d;break}return i?f:-f}).map(([e,n])=>{let r=n.callCount>0?n.successCount/n.callCount*100:0,i=n.callCount>0?n.totalDuration/n.callCount:0,a=t[e]||e,o=`#38a169`;r<60?o=`#e53e3e`:r<85&&(o=`#d69e2e`);let s=i<1e3?`${Math.round(i)}ms`:`${(i/1e3).toFixed(1)}s`;return`<tr>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee; color: #333;"><code title="${L(a)}">${e}</code></td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #666;">${n.callCount}</td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #666;">${n.successCount}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">
          <span style="display: inline-block; width: 50px; height: 5px; border-radius: 3px; background: #e0e0e0; vertical-align: middle; margin-right: 6px;">
            <span style="display: inline-block; width: ${r*.5}px; height: 5px; border-radius: 3px; background: ${o}; vertical-align: top;"></span>
          </span>
          <span style="font-size: 12px; color: ${o}; font-weight: 500;">${r.toFixed(0)}%</span>
        </td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #888; font-size: 12px;">${s}</td>
      </tr>`}).join(``),Ne()}function Ne(){let{column:e,asc:t}=j,n=[`name`,`callCount`,`successCount`,`successRate`,`duration`],r={name:`sortByName`,callCount:`sortByCallCount`,successCount:`sortBySuccessCount`,successRate:`sortBySuccessRate`,duration:`sortByDuration`};n.forEach(n=>{let i=document.getElementById(r[n]);if(!i)return;let a=i.querySelector(`.sort-indicator`);a&&(n===e?(a.textContent=t?`▲`:`▼`,a.style.color=`#667eea`):(a.textContent=``,a.style.color=``))})}document.querySelectorAll(`#toolStatsTable th[data-sort]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.sort;j.column===t?j.asc=!j.asc:(j.column=t,j.asc=!1),je()})}),Se.addEventListener(`click`,()=>{bi()}),Ce.addEventListener(`click`,()=>{bi(),di()});let Pe=document.getElementById(`confirmModal`);Pe.addEventListener(`click`,e=>{e.target===Pe&&bi()});let Fe=document.getElementById(`selectionClose`);Fe&&Fe.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),console.log(`[SidePanel] 用户点击关闭选中内容按钮`),li(),window.hideFloatingMenu(),M.lastSelectedText=``,M.currentSelectionRange=null}),i.addEventListener(`input`,()=>{})}),lt().then(()=>ao()),document.addEventListener(`DOMContentLoaded`,()=>{so()}),document.addEventListener(`DOMContentLoaded`,ht),document.addEventListener(`DOMContentLoaded`,Ka),document.addEventListener(`DOMContentLoaded`,At),document.addEventListener(`DOMContentLoaded`,Pt),document.addEventListener(`DOMContentLoaded`,cn),document.addEventListener(`DOMContentLoaded`,gi),document.addEventListener(`DOMContentLoaded`,()=>wn());function ho(){let e=document.getElementById(`imagePreviewBar`),t=document.getElementById(`screenshotBtn`);e&&(e.style.display=M.attachedImages.length>0?``:`none`),t&&(M.enableImageInput?t.style.removeProperty(`display`):t.style.display=`none`),userInput&&(M.enableImageInput?userInput.style.paddingRight=`84px`:userInput.style.paddingRight=``),M.enableImageInput||(M.attachedImages=[]),go()}function go(){let e=document.getElementById(`imagePreviewBar`);if(e){if(e.innerHTML=``,M.attachedImages.length===0){e.style.display=`none`;return}e.style.display=``,M.attachedImages.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`image-preview-item`;let i=document.createElement(`img`);i.src=t.dataUrl,i.className=`image-preview-thumb`,i.title=`点击查看大图`,i.style.cursor=`zoom-in`,i.addEventListener(`click`,()=>{Oi(t.dataUrl,i)});let a=document.createElement(`button`);a.className=`image-preview-remove`,a.innerHTML=`×`,a.title=`移除图片`,a.addEventListener(`click`,e=>{e.stopPropagation(),M.attachedImages.splice(n,1),go()}),r.appendChild(i),r.appendChild(a),e.appendChild(r)})}}async function _o(){if(!M.enableImageInput){I(`请先开启图片输入功能`);return}try{let e=await chrome.runtime.sendMessage({type:`CAPTURE_TAB`});e?.dataUrl&&(Fi(await(await fetch(e.dataUrl)).blob()),I(`截图成功`))}catch(e){console.error(`[SidePanel] 全页面截图失败:`,e),I(`截图失败，请重试`)}}async function vo(){let e=await dt();if(!e){I(`无法获取当前标签页`);return}try{let t=await chrome.tabs.sendMessage(e,{type:`START_REGION_SELECTION`});if(!t)return;console.log(`[SidePanel] 区域选择结果:`,t);let n=await chrome.runtime.sendMessage({type:`CAPTURE_TAB`});if(!n?.dataUrl){I(`截图失败，请重试`);return}let r=await yo(n.dataUrl,t);if(!r){I(`裁剪失败，请重试`);return}Fi(await(await fetch(r)).blob())}catch(e){console.error(`[SidePanel] 区域截图失败:`,e),I(`区域截图失败，请确保页面已加载且未被浏览器限制`)}}function yo(e,t){return new Promise((n,r)=>{let i=new Image;i.onload=()=>{let e=document.createElement(`canvas`),r=window.devicePixelRatio||1,a=t.x*r,o=t.y*r,s=t.width*r,c=t.height*r;e.width=s,e.height=c,e.getContext(`2d`).drawImage(i,a,o,s,c,0,0,s,c),n(e.toDataURL(`image/jpeg`,.85))},i.onerror=()=>r(Error(`图片加载失败`)),i.src=e})}
//# sourceMappingURL=side_panel-Bpu9yXfK.js.map