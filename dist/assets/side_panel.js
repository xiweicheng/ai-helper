import{n as e,r as t}from"./constants-MgsnqggU.js";import{A as n,D as r,E as i,O as a,S as o,a as s,b as c,c as l,f as u,g as d,h as f,k as p,l as m,m as h,n as g,o as _,p as v,r as y,s as b,t as x,u as S,x as C,y as w}from"./token-store-D6sbpX_G.js";var T=new Set,E=[],ee=`deepseek-v4-pro`,D=null,te=[],ne=!0,O=!0,re=!1,ie=null,ae=``,oe=``,se=[],ce=-1,le=-1,k=null,ue=``,de=[],fe=-1,pe=null,me=null,he=[],ge={platformName:`Unknown`,platform:`unknown`,arch:`unknown`,shell:`/bin/sh`,homeDir:`/home/user`,workdir:``,connected:!1},_e={maxInputHistory:20,maxHistoryMessages:50,maxMessageLength:1e5,maxMemoryMessages:20,enableExecutionLog:!1,contextWindow:0},ve=.2,ye=1,be=0,xe=`all`,Se=``,Ce=[],we={},A=new Map,j=null,Te=new Map,Ee=new Set,De=new Map,Oe=null,ke=null,Ae=null,M=null,je=null,Me=18e4,Ne=null,Pe=!1,Fe=null,Ie=``,Le=null,Re=0,ze=0,Be=-1,Ve=!1,He=``,Ue=``,We=``,Ge=[],Ke=!1,qe=new Map,N={get isGenerating(){return T.has(D)},set isGenerating(e){e?T.add(D):T.delete(D),document.dispatchEvent(new CustomEvent(`generating-state-changed`))},get generatingSessionIds(){return T},get messageHistory(){return E},set messageHistory(e){E=e},get currentModel(){return ee},set currentModel(e){ee=e},get activeSessionId(){return D},set activeSessionId(e){D=e},get sessions(){return te},set sessions(e){te=e},get useTools(){return ne},set useTools(e){ne=e},get isolateChat(){return O},set isolateChat(e){O=e},get enableSelectionQuery(){return re},set enableSelectionQuery(e){re=e},get currentTabId(){return ie},set currentTabId(e){ie=e},get selectedContextText(){return ae},set selectedContextText(e){ae=e},get quotedContextText(){return oe},set quotedContextText(e){oe=e},get customPrompts(){return se},set customPrompts(e){se=e},get selectedPromptIndex(){return ce},set selectedPromptIndex(e){ce=e},get selectedAgentAtIndex(){return le},set selectedAgentAtIndex(e){le=e},get draggedItemIndex(){return k},set draggedItemIndex(e){k=e},get systemPrompt(){return ue},set systemPrompt(e){ue=e},get activeAgentId(){return pe},set activeAgentId(e){pe=e},get activeAgentToolIds(){return me},set activeAgentToolIds(e){me=e},get customAgents(){return he},set customAgents(e){he=e},get agentPlatform(){return ge},set agentPlatform(e){Object.assign(ge,e)},get inputHistory(){return de},set inputHistory(e){de=e},get inputHistoryIndex(){return fe},set inputHistoryIndex(e){fe=e},get chatConfig(){return _e},set chatConfig(e){_e=e},get temperature(){return ve},set temperature(e){ve=e},get topP(){return ye},set topP(e){ye=e},get selectedTempIndex(){return be},set selectedTempIndex(e){be=e},get currentCategory(){return xe},set currentCategory(e){xe=e},get currentSearch(){return Se},set currentSearch(e){Se=e},get enabledTools(){return Ce},set enabledTools(e){Ce=e},get collapsedCategories(){return we},get sessionExecutionStatus(){return A},set sessionExecutionStatus(e){A=e},get currentExecutionStatus(){return A.get(D)||null},set currentExecutionStatus(e){e===null?A.delete(D):A.set(D,e)},get executionLogListener(){return j},set executionLogListener(e){j=e},get pendingCancelApi(){return Te.get(D)||null},set pendingCancelApi(e){e===null?Te.delete(D):Te.set(D,e)},get pendingCancelApiMap(){return Te},get pendingCallApiSessionIds(){return Ee},set pendingCallApiSessionIds(e){Ee=e},get substituteLoadingIds(){return De},set substituteLoadingIds(e){De=e},get currentClarifyToolCallId(){return Oe},set currentClarifyToolCallId(e){Oe=e},get currentClarifySessionId(){return ke},set currentClarifySessionId(e){ke=e},get currentConfirmToolCallId(){return Ae},set currentConfirmToolCallId(e){Ae=e},get currentConfirmSessionId(){return M},set currentConfirmSessionId(e){M=e},get clarifyTimerInterval(){return je},set clarifyTimerInterval(e){je=e},get clarifyTimeoutValue(){return Me},set clarifyTimeoutValue(e){Me=e},get messageTocContainer(){return Ne},set messageTocContainer(e){Ne=e},get isMouseOverToc(){return Pe},set isMouseOverToc(e){Pe=e},get tocHideTimer(){return Fe},set tocHideTimer(e){Fe=e},get lastSelectedText(){return Ie},set lastSelectedText(e){Ie=e},get currentSelectionRange(){return Le},set currentSelectionRange(e){Le=e},get lastMouseX(){return Re},set lastMouseX(e){Re=e},get lastMouseY(){return ze},set lastMouseY(e){ze=e},get pendingDeleteIndex(){return Be},set pendingDeleteIndex(e){Be=e},get enableImageInput(){return Ve},set enableImageInput(e){Ve=e},get imageModelName(){return He},set imageModelName(e){He=e},get imageApiBase(){return Ue},set imageApiBase(e){Ue=e},get imageApiKey(){return We},set imageApiKey(e){We=e},get attachedImages(){return Ge},set attachedImages(e){Ge=e},get isScrolling(){return Ke},set isScrolling(e){Ke=e},get customModelMap(){return qe},set customModelMap(e){qe=e}},Je=t,P=[{label:`精准编码`,temp:.2,topP:1,tip:`较低随机性，适合业务开发、调试、纠错`},{label:`均衡开发`,temp:.45,topP:.9,tip:`兼顾稳定性，用于封装工具类、常规脚本`},{label:`架构探索`,temp:.65,topP:.9,tip:`提供多种实现思路，用于组件重构、方案对比`},{label:`创意发散`,temp:.9,topP:.9,tip:`随机性较高，仅用于原型探索，不建议生产代码`}],Ye={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,content_extraction:`📄 内容提取`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_output:`📷 媒体与输出`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,local_agent:`🖥️ 代理`},Xe=[{id:`default`,name:`默认助手`,description:`全能 AI 助手，拥有所有工具能力`,icon:`🤖`,systemPrompt:null,toolIds:null,isBuiltin:!0,allowSubDispatch:!1,model:null,temperature:null,topP:null}],Ze=[{name:`代码审查专家`,icon:`🔍`,description:`专注于代码审查与质量保证`,systemPrompt:`你是一个资深的代码审查专家(Code Review Expert)。你的职责是：
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
- 保持简洁：避免冗余，每段话都要有信息量`,toolIds:[`get_page_text`,`page_to_markdown`,`copy_to_clipboard`,`search_bookmarks`,`search_history`,`search_conversation_memory`],allowSubDispatch:!1}];function Qe(){return`agent_`+Date.now().toString(36)+`_`+Math.random().toString(36).substring(2,6)}var $e=`customAgents`,et=`activeAgentId`;async function tt(){let e=(await chrome.storage.local.get([$e]))[$e]||[];return[...Xe,...e]}async function nt(){return(await chrome.storage.local.get([$e]))[$e]||[]}async function rt(e){return e&&(await tt()).find(t=>t.id===e)||null}async function it(e){let t=await nt(),n={id:Qe(),name:e.name||`未命名Agent`,description:e.description||``,icon:e.icon||`🤖`,systemPrompt:e.systemPrompt||``,toolIds:e.toolIds||null,isBuiltin:!1,allowSubDispatch:e.allowSubDispatch===void 0?!1:e.allowSubDispatch,model:e.model||null,temperature:e.temperature===void 0?null:e.temperature,topP:e.topP===void 0?null:e.topP,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return t.push(n),await chrome.storage.local.set({[$e]:t}),n}async function at(e,t){let n=await nt(),r=n.findIndex(t=>t.id===e);return r===-1?null:(n[r]={...n[r],...t,id:e,isBuiltin:!1,updatedAt:new Date().toISOString()},await chrome.storage.local.set({[$e]:n}),n[r])}async function ot(e){let t=await nt(),n=t.findIndex(t=>t.id===e);return n===-1?!1:(t.splice(n,1),await chrome.storage.local.set({[$e]:t}),(await chrome.storage.local.get([et]))[et]===e&&await chrome.storage.local.remove(et),!0)}async function st(){return(await chrome.storage.local.get([et]))[et]||null}async function ct(e){e?await chrome.storage.local.set({[et]:e}):await chrome.storage.local.remove(et)}function F(e,t=`info`,n=3e3){let r=document.getElementById(`toastContainer`);if(!r)return;let i=document.createElement(`div`);i.className=`toast ${t}`,i.textContent=e,r.appendChild(i),requestAnimationFrame(()=>{i.classList.add(`toast-show`)}),setTimeout(()=>{i.classList.remove(`toast-show`),setTimeout(()=>{i.parentNode&&i.parentNode.removeChild(i)},300)},n)}function lt(){let e=document.getElementById(`userInput`);e&&(e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,100)+`px`)}function I(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function ut(e){return!e||e<0?`0ms`:e<1e3?`${Math.round(e)}ms`:e<6e4?`${(e/1e3).toFixed(1)}s`:`${Math.floor(e/6e4)}分${(e%6e4/1e3).toFixed(1)}秒`}function dt(e,t){navigator.clipboard.writeText(e).then(()=>{let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(n=>{console.error(`[SidePanel] 复制失败:`,n);let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败`,`error`)}document.body.removeChild(r)})}async function ft(e=null){let t=new Date().toLocaleString(`zh-CN`),n=``;if(N.agentPlatform&&N.agentPlatform.connected){let e=N.agentPlatform;n=`\n- 本地 Agent：${e.platformName} (${e.arch})，默认 shell: ${e.shell}，工作目录: ${e.workdir||`未设置`}`}let r=``;e&&e.allowSubDispatch&&(r=`
  
## Sub-Agent 调度
你可以使用 dispatch_sub_agent 工具将子任务分派给其他专业 Agent 执行。每个子 Agent 拥有独立的角色定义和工具集。
使用场景：复杂任务需要不同领域的专业能力时（如代码审查 + 文档撰写）。
调用方式：在一次响应中可并行调用多个 dispatch_sub_agent。

当前可用的子 Agent：
${(await tt()).filter(t=>t.allowSubDispatch&&t.id!==(e.id||``)).map(e=>`- **${e.id}** (${e.icon} ${e.name}): ${e.description||`无描述`}`).join(`
`)||`（暂无可用子 Agent，请先在 Agent 管理中创建并启用 Sub-Agent 调度）`}`);let i=N.useTools?`

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
   - 指定执行策略：sequential（顺序执行）、parallel（并行执行）或 conditional（条件执行）`:``,a;return a=e&&e.systemPrompt&&e.systemPrompt.trim()?e.systemPrompt:N.systemPrompt&&N.systemPrompt.trim()?N.systemPrompt:null,a?`${a}

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
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题${N.useTools?`
- **任务规划**：能够将复杂任务拆解为多个子任务，规划执行顺序和所需工具`:``}${i}${r}

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理${N.useTools?`
6. **任务驱动**：复杂任务先规划后执行，使用 plan_task 工具进行拆解`:``}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${t}${n}
`}function pt(){return new Promise(e=>{chrome.storage.local.get([`temperature`,`topP`],t=>{e({temperature:t.temperature===void 0?parseFloat(N.temperature.toFixed(2)):parseFloat(t.temperature.toFixed(2)),top_p:t.topP===void 0?parseFloat(N.topP.toFixed(2)):parseFloat(t.topP.toFixed(2))})})})}function mt(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(N.chatConfig=t,console.log(`[SidePanel] 对话配置已加载:`,N.chatConfig)),e(t)})})}async function ht(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(N.chatConfig=t,console.log(`[SidePanel] 同步加载对话配置:`,N.chatConfig)),e()})})}async function gt(){return new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>{t&&t.length>0&&t[0].id?(N.currentTabId=t[0].id,console.log(`[SidePanel] 获取当前 Tab ID:`,N.currentTabId,`URL:`,t[0].url),e(N.currentTabId)):(console.warn(`[SidePanel] 未获取到有效的 Tab ID`),e(null))})})}function _t(){return new Promise(e=>{chrome.storage.local.get([`reactMaxIterations`,`reactApiTimeout`,`reactLoopTimeout`,`reactToolTimeout`,`reactClarifyTimeout`],t=>{e({maxIterations:t.reactMaxIterations||30,apiTimeout:t.reactApiTimeout||6e4,loopTimeout:t.reactLoopTimeout||3e5,toolTimeout:t.reactToolTimeout||3e4,clarifyTimeout:t.reactClarifyTimeout||18e4})})})}function vt(e){if(!e||!e.trim()||e.trim()==`/`)return;let t=e.trim(),n=N.inputHistory.indexOf(t);n!==-1&&N.inputHistory.splice(n,1),N.inputHistory.push(t),N.inputHistory.length>N.chatConfig.maxInputHistory&&N.inputHistory.shift(),yt()}function yt(){try{chrome.storage.local.set({inputHistory:N.inputHistory}),console.log(`[SidePanel] 输入历史已保存，数量:`,N.inputHistory.length)}catch(e){console.error(`[SidePanel] 保存输入历史失败:`,e)}}function bt(){document.addEventListener(`mouseover`,xt,!0),document.addEventListener(`mouseout`,St,!0),console.log(`[SidePanel] 消息目录功能已初始化`)}function xt(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){N.isMouseOverToc=!0;return}let t=e.target.closest(`.message.assistant`);if(!t)return;let n=t.querySelectorAll(`.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6`);if(n.length===0){wt();return}Ct(t,n)}function St(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){N.isMouseOverToc=!1,N.tocHideTimer&&=(clearTimeout(N.tocHideTimer),null);return}if(!e.target.closest(`.message.assistant`))return;let t=e.relatedTarget;t&&(t.closest(`.message-toc-container`)||t.closest(`.message.assistant`))||N.isMouseOverToc||(N.tocHideTimer&&clearTimeout(N.tocHideTimer),N.tocHideTimer=setTimeout(()=>{N.isMouseOverToc||wt(),N.tocHideTimer=null},800))}function Ct(e,t){let n=Array.from(t);N.messageTocContainer&&wt(),n.forEach((e,t)=>{e.id||=`toc-heading-${Date.now()}-${t}`});let r=document.createElement(`div`);r.className=`message-toc-container`,r.dataset.headingsCount=n.length;let i=0,a=n.map(e=>{let t=parseInt(e.tagName.charAt(1)),n=e.textContent.trim(),r=n.length>30?n.substring(0,30)+`...`:n,a=`H${t}`;return i++,`
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
  `,document.body.appendChild(r),N.messageTocContainer=r;let o=e.getBoundingClientRect(),s=window.innerWidth-280;o.right<s&&(r.style.left=o.right+`px`,r.style.right=`0`,r.style.width=`auto`);let c=r.querySelector(`.message-toc-toggle`),l=r.querySelector(`.message-toc-panel`);c.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),c.addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),l.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),r.querySelectorAll(`.message-toc-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.target,n=document.getElementById(t);n&&(n.scrollIntoView({behavior:`smooth`,block:`start`}),n.classList.add(`toc-highlight`),setTimeout(()=>{n.classList.remove(`toc-highlight`)},1500))})})}function wt(){N.tocHideTimer&&=(clearTimeout(N.tocHideTimer),null),N.messageTocContainer&&=(N.messageTocContainer.remove(),null)}function Tt(e){return`${Math.floor(e/60)}:${(e%60).toString().padStart(2,`0`)}`}function Et(e=`default`){try{let t=new(window.AudioContext||window.webkitAudioContext),n=t.createOscillator(),r=t.createGain();n.connect(r),r.connect(t.destination);let i={default:{frequency:800,duration:.3},success:{frequency:523,duration:.2},warning:{frequency:440,duration:.4},error:{frequency:220,duration:.5}},a=i[e]||i.default;n.frequency.value=a.frequency,n.type=`sine`,r.gain.setValueAtTime(.3,t.currentTime),r.gain.exponentialRampToValueAtTime(.01,t.currentTime+a.duration),n.start(t.currentTime),n.stop(t.currentTime+a.duration),console.log(`[SidePanel] 提示音已播放:`,e)}catch(e){console.error(`[SidePanel] 播放提示音失败:`,e.message)}}function Dt(e,t){let n=document.getElementById(`clarifyTimer`),r=document.getElementById(`clarifyTimerText`);if(!n||!r)return;r.textContent=`剩余时间: ${Tt(e)}`;let i=e/t*100;n.classList.remove(`warning`,`critical`),e<=10?(n.classList.add(`critical`),r.textContent=`即将超时: ${Tt(e)}`):(e<=30||i<=15)&&n.classList.add(`warning`),e===30&&Et(`warning`)}function Ot(e){kt(),N.clarifyTimeoutValue=e;let t=Math.ceil(e/1e3),n=t;Dt(n,t),N.clarifyTimerInterval=setInterval(()=>{n--,n<=0?kt():Dt(n,t)},1e3)}function kt(){N.clarifyTimerInterval&&=(clearInterval(N.clarifyTimerInterval),null)}function At(e){console.log(`[SidePanel] 显示澄清对话框:`,e);let{question:t,recommendedOption:n,allowCustomInput:r=!0,allowAdditionalInfo:i=!0,toolCallId:a,timeout:o=18e4,sessionId:s}=e,c=Array.isArray(e.options)?e.options:e.options?[String(e.options)]:[];N.currentClarifyToolCallId=a,N.currentClarifySessionId=s||null;let l=document.getElementById(`clarifySessionName`);if(l)if(s&&N.sessions){let e=N.sessions.find(e=>e.id===s);e?(l.textContent=`会话: ${e.title}`,l.style.display=`block`):(l.textContent=`会话: ${s.substring(0,8)}...`,l.style.display=`block`)}else l.textContent=``,l.style.display=`none`;let u=n!==void 0&&n>=0?n:0,d=[u],f=u,p=document.getElementById(`clarifyQuestion`);p&&(p.textContent=t);let m=document.getElementById(`clarifyOptionsList`);if(m&&(document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.remove()}),c.forEach((e,t)=>{let n=d.includes(t),r=document.createElement(`div`);r.className=`clarify-option-item ${f===t?`selected`:``} ${n?`recommended`:``}`,r.dataset.index=t,r.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${e}${n?`<span class="clarify-option-badge">推荐</span>`:``}</div>
      `,r.addEventListener(`click`,()=>Mt(t)),m.appendChild(r)}),r)){let e=document.createElement(`div`);e.className=`clarify-option-item`,e.dataset.index=-1,e.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `,e.addEventListener(`click`,()=>Mt(-1)),m.appendChild(e);let t=document.getElementById(`clarifyCustomInput`);t&&m.appendChild(t)}let h=document.getElementById(`clarifyCustomInput`);h&&h.classList.remove(`show`);let g=document.getElementById(`clarifyAdditionalInfo`);g&&g.classList.toggle(`show`,i);let _=document.getElementById(`clarifyCustomTextarea`);_&&(_.value=``);let v=document.getElementById(`clarifyAdditionalTextarea`);v&&(v.value=``);let y=document.getElementById(`clarifyOverlay`);y&&y.classList.add(`show`),Ot(o),console.log(`[SidePanel] 澄清对话框已显示`)}function jt(){let e=document.getElementById(`clarifyOverlay`);e&&e.classList.remove(`show`),N.currentClarifyToolCallId=null,N.currentClarifySessionId=null,kt(),console.log(`[SidePanel] 澄清对话框已隐藏`)}function Mt(e){document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.classList.remove(`selected`)});let t=document.querySelector(`.clarify-option-item[data-index="${e}"]`);t&&t.classList.add(`selected`);let n=document.getElementById(`clarifyCustomInput`);if(n)if(e===-1){n.classList.add(`show`);let e=document.getElementById(`clarifyCustomTextarea`);e&&e.focus()}else n.classList.remove(`show`);console.log(`[SidePanel] 选择澄清选项:`,e)}function Nt(){if(!N.currentClarifyToolCallId){console.error(`[SidePanel] 没有当前工具调用ID`);return}let e=-1;document.querySelectorAll(`.clarify-option-item`).forEach((t,n)=>{t.classList.contains(`selected`)&&(e=parseInt(t.dataset.index))});let t=document.getElementById(`clarifyCustomTextarea`),n=t?t.value.trim():``,r=document.getElementById(`clarifyAdditionalTextarea`),i=r?r.value.trim():``,a={type:`CLARIFY_RESPONSE`,toolCallId:N.currentClarifyToolCallId,selectedOption:e,customInput:n,additionalInfo:i};console.log(`[SidePanel] 发送澄清响应:`,a),chrome.runtime.sendMessage(a),jt()}function Pt(){if(N.currentClarifyToolCallId){let e={type:`CLARIFY_RESPONSE`,toolCallId:N.currentClarifyToolCallId,selectedOption:-1,customInput:``,additionalInfo:``};chrome.runtime.sendMessage(e)}jt()}function Ft(){let e=document.getElementById(`clarifyConfirmBtn`);e&&e.addEventListener(`click`,Nt);let t=document.getElementById(`clarifyCancelBtn`);t&&t.addEventListener(`click`,Pt),chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.type===`SHOW_CLARIFY_DIALOG`)console.log(`[SidePanel] 收到澄清请求:`,e,`当前激活会话:`,N.activeSessionId),At(e.data),n({success:!0});else if(e.type===`PLAY_NOTIFICATION_SOUND`)console.log(`[SidePanel] 收到播放提示音请求:`,e),Et(e.soundType),n({success:!0});else if(e.type===`CLARIFY_TIMEOUT`){if(console.log(`[SidePanel] 收到澄清超时通知:`,e),e.sessionId&&N.currentClarifySessionId&&e.sessionId!==N.currentClarifySessionId){console.log(`[SidePanel] 澄清超时来自其他会话，忽略`);return}let t=document.getElementById(`clarifyTimer`),n=document.getElementById(`clarifyTimerText`);t&&n&&(t.classList.remove(`warning`),t.classList.add(`critical`),n.textContent=`已超时`),Et(`error`)}}),console.log(`[SidePanel] 澄清对话框事件已初始化`)}var It=null;function Lt(e){let{toolName:t,toolLabel:n,args:r,message:i,toolCallId:a,sessionId:o,timeout:s=3e4}=e;console.log(`[SidePanel] 显示确认对话框:`,t,e),N.currentConfirmToolCallId=a,N.currentConfirmSessionId=o||null;let c=document.getElementById(`confirmOverlay`);if(!c)return;document.getElementById(`confirmToolName`).textContent=n||t;let l=document.getElementById(`confirmArgsSummary`);if(l&&r){let e=Object.entries(r).filter(([e,t])=>t!=null&&t!==``).slice(0,5);e.length>0?(l.innerHTML=e.map(([e,t])=>`<span class="confirm-arg"><strong>${e}:</strong> ${typeof t==`string`?t.substring(0,50):JSON.stringify(t).substring(0,50)}</span>`).join(``),l.style.display=`block`):l.style.display=`none`}let u=document.getElementById(`confirmMessage`);return u&&(u.textContent=i||`模型请求执行操作: ${n||t}`),c.style.display=`flex`,new Promise(e=>{It=e,setTimeout(()=>{It&&(console.log(`[SidePanel] 确认对话框超时，自动拒绝`),Rt(!1))},s)})}function Rt(e){let t=document.getElementById(`confirmOverlay`);t&&(t.style.display=`none`),chrome.runtime.sendMessage({type:`TOOL_CONFIRMATION_RESPONSE`,toolCallId:N.currentConfirmToolCallId,confirmed:e,sessionId:N.currentConfirmSessionId}).catch(e=>{console.log(`[SidePanel] 发送确认响应失败:`,e.message)}),N.currentConfirmToolCallId=null,N.currentConfirmSessionId=null,It&&=(It(e),null)}function zt(){let e=document.getElementById(`confirmApproveBtn`),t=document.getElementById(`confirmDenyBtn`);e&&e.addEventListener(`click`,()=>Rt(!0)),t&&t.addEventListener(`click`,()=>Rt(!1)),chrome.runtime.onMessage.addListener((e,t,n)=>e.type===`SHOW_CONFIRM_DIALOG`?(Lt(e.data),n({received:!0}),!1):!1)}var L=null,R=1,Bt=.25,Vt=2,Ht=.1;function Ut(e){let t=e.trim();return/^\s*<!DOCTYPE\s/i.test(t)||/^\s*<html[\s>]/i.test(t)?/<\/head>/i.test(t)?t.replace(/<\/head>/i,`<style>html,body{overflow:auto!important;height:auto!important;}</style></head>`):/<body[\s>]/i.test(t)?t.replace(/<body([\s>])/i,`<body$1<style>html,body{overflow:auto!important;height:auto!important;}</style>`):t:`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;overflow:auto;">${t}</body>
</html>`}function Wt(e){console.log(`[SidePanel] 显示 UI 原型预览:`,e),L=e,ln();let t=document.getElementById(`prototypeTitle`),n=document.getElementById(`prototypeDescription`),r=document.getElementById(`prototypeIframe`);t&&(t.textContent=e.title||`UI 原型预览`),n&&(n.textContent=e.description||``,n.style.display=e.description?`block`:`none`),r&&e.html&&(r.srcdoc=Ut(e.html));let i=document.getElementById(`prototypeOverlay`);i&&i.classList.add(`show`),console.log(`[SidePanel] UI 原型预览弹窗已显示`)}function Gt(){let e=document.getElementById(`prototypeOverlay`);e&&e.classList.remove(`show`);let t=document.getElementById(`prototypeIframe`);t&&(t.srcdoc=``),L=null,console.log(`[SidePanel] UI 原型预览弹窗已隐藏`)}function Kt(){if(!L)return;let e=L.id,t=L.title||`原型`;Gt();let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 继续优化原型:`,e)}function qt(){if(!L||!L.html){console.error(`[SidePanel] 没有可下载的原型`);return}let e=Ut(L.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t),r=document.createElement(`a`);r.href=n,r.download=(L.title||`prototype`).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)+`.html`,document.body.appendChild(r),r.click(),document.body.removeChild(r),URL.revokeObjectURL(n),console.log(`[SidePanel] 原型已下载:`,r.download)}function Jt(){if(!L||!L.html){console.error(`[SidePanel] 没有可打开的原型`);return}let e=Ut(L.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t);chrome.tabs.create({url:n,active:!0}),console.log(`[SidePanel] 原型已在新标签页打开`)}async function Yt(e){try{let t=await v(e);if(!t){console.error(`[SidePanel] 未找到原型:`,e);return}Wt(t)}catch(e){console.error(`[SidePanel] 加载原型失败:`,e)}}async function Xt(){let e=document.getElementById(`prototypeLibraryList`),t=document.getElementById(`prototypeLibraryModal`);if(!(!e||!t)){e.innerHTML=`<div class="prototype-library-empty">加载中...</div>`;try{let e=await h();Zt(e),Qt(e)}catch(t){console.error(`[SidePanel] 加载原型库失败:`,t),e.innerHTML=`<div class="prototype-library-empty">加载失败</div>`}t.classList.add(`show`),console.log(`[SidePanel] 原型库已显示`)}}function Zt(e){let t=document.getElementById(`prototypeLibraryList`);t&&(e.length===0?t.innerHTML=`<div class="prototype-library-empty">暂无原型</div>`:(t.innerHTML=e.map(e=>{let t=e.id.replace(`proto_`,``).slice(-6);return`
        <div class="prototype-library-item" data-id="${e.id}">
          <div class="prototype-library-item-info">
            <div class="prototype-library-item-title" title="${rn(e.title)}">${rn(e.title)}</div>
            ${e.description?`<div class="prototype-library-item-desc" title="${rn(e.description)}">${rn(e.description)}</div>`:`<div class="prototype-library-item-desc prototype-library-item-desc-empty">暂无描述</div>`}
            <div class="prototype-library-item-meta">
              <span class="prototype-library-item-id">ID: ${t}</span>
              <span class="prototype-library-item-time">${an(e.createdAt)}</span>
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
      `}).join(``),t.querySelectorAll(`.prototype-library-item`).forEach(e=>{let t=e.querySelector(`.prototype-library-item-info`),n=e.querySelector(`.prototype-library-item-open`),r=e.querySelector(`.prototype-library-item-optimize`),i=e.querySelector(`.prototype-library-item-delete`);t&&t.addEventListener(`click`,()=>{let t=e.dataset.id;Yt(t),$t()}),n&&n.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.id;Yt(n),$t()}),r&&r.addEventListener(`click`,t=>{t.stopPropagation();let n=r.dataset.id;en(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`),$t()}),i&&i.addEventListener(`click`,t=>{t.stopPropagation();let n=i.dataset.id;tn(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`)})})))}function Qt(e){let t=()=>{let t=document.getElementById(`prototypeLibrarySearch`),n=document.getElementById(`prototypeLibrarySort`),r=(t?.value||``).trim().toLowerCase(),i=n?.value||`createdAt_desc`,a=e;r&&(a=e.filter(e=>(e.title||``).toLowerCase().includes(r)||(e.description||``).toLowerCase().includes(r)));let[o,s]=i.split(`_`);a=[...a].sort((e,t)=>{let n;return n=o===`title`?(e.title||``).localeCompare(t.title||``,`zh-CN`):(e.createdAt||0)-(t.createdAt||0),s===`desc`?-n:n}),Zt(a)},n=document.getElementById(`prototypeLibrarySearch`),r=document.getElementById(`prototypeLibrarySort`);if(n){let e=n.cloneNode(!0);n.parentNode.replaceChild(e,n),e.addEventListener(`input`,t)}if(r){let e=r.cloneNode(!0);r.parentNode.replaceChild(e,r),e.addEventListener(`change`,t)}}function $t(){let e=document.getElementById(`prototypeLibraryModal`);e&&e.classList.remove(`show`),console.log(`[SidePanel] 原型库已隐藏`)}function en(e,t){let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 从原型库继续优化原型:`,e)}async function tn(e,t){if(await nn(`确认删除`,`确定删除原型 "${t}" 吗？此操作不可撤销。`,`删除`))try{await _(e),console.log(`[SidePanel] 原型已删除:`,e),Xt()}catch(e){console.error(`[SidePanel] 删除原型失败:`,e),alert(`删除失败: `+e.message)}}function nn(e,t,n=`确认`){return new Promise(r=>{let i=document.getElementById(`genericConfirmModal`),a=document.getElementById(`genericConfirmTitle`),o=document.getElementById(`genericConfirmMessage`),s=document.getElementById(`genericConfirmOkBtn`),c=document.getElementById(`genericConfirmCancelBtn`);if(!i){r(confirm(t));return}a.textContent=e,o.textContent=t,s.textContent=n;let l=()=>{i.classList.remove(`show`),s.removeEventListener(`click`,u),c.removeEventListener(`click`,d)},u=()=>{l(),r(!0)},d=()=>{l(),r(!1)};s.addEventListener(`click`,u),c.addEventListener(`click`,d),i.classList.add(`show`)})}function rn(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function an(e){if(!e)return``;let t=new Date(e),n=new Date-t;return n<6e4?`刚刚`:n<36e5?Math.floor(n/6e4)+` 分钟前`:n<864e5?Math.floor(n/36e5)+` 小时前`:t.toLocaleDateString(`zh-CN`)}function on(e){R=Math.max(Bt,Math.min(Vt,e)),R=Math.round(R*100)/100;let t=document.getElementById(`prototypeIframe`),n=document.getElementById(`prototypeZoomLevel`);t&&(t.style.zoom=R),n&&(n.textContent=Math.round(R*100)+`%`,R===1?n.classList.remove(`zoomed`):n.classList.add(`zoomed`))}function sn(){on(R+Ht),un()}function cn(){on(R-Ht),un()}function ln(){on(1)}function un(){let e=document.getElementById(`prototypeZoomLevel`);e&&(e.classList.add(`flash`),setTimeout(()=>e.classList.remove(`flash`),150))}function dn(e){!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.deltaY<0?sn():cn())}function fn(e){(e.ctrlKey||e.metaKey)&&e.key===`0`&&(e.preventDefault(),ln())}function pn(){let e=document.getElementById(`prototypeCloseBtn`);e&&e.addEventListener(`click`,Gt);let t=document.getElementById(`prototypeDownloadBtn`);t&&t.addEventListener(`click`,qt);let n=document.getElementById(`prototypeOpenTabBtn`);n&&n.addEventListener(`click`,Jt);let r=document.getElementById(`prototypeContinueBtn`);r&&r.addEventListener(`click`,Kt);let i=document.getElementById(`prototypeZoomInBtn`);i&&i.addEventListener(`click`,sn);let a=document.getElementById(`prototypeZoomOutBtn`);a&&a.addEventListener(`click`,cn);let o=document.getElementById(`prototypeZoomLevel`);o&&o.addEventListener(`click`,ln);let s=document.getElementById(`prototypeContent`);s&&s.addEventListener(`wheel`,dn,{passive:!1}),document.addEventListener(`keydown`,fn);let c=document.getElementById(`prototypeLibraryCloseBtn`);c&&c.addEventListener(`click`,$t),chrome.runtime.onMessage.addListener((e,t,n)=>{e.type===`SHOW_UI_PROTOTYPE`&&(console.log(`[SidePanel] 收到显示原型请求:`,e),Yt(e.data.prototypeId),n({success:!0}))}),console.log(`[SidePanel] UI 原型模块事件已初始化`)}function mn(e){if(!e)return``;let t=[];e=e.replace(/```mermaid\n?([\s\S]*?)```/g,(e,n)=>{let r=t.length;return t.push(n.trim()),`%%MERMAID_BLOCK_${r}%%`});let n=[];e=e.replace(/```(\w*)\n?([\s\S]*?)```/g,(e,t,r)=>{let i=n.length;return n.push({language:t||`text`,content:r.trim()}),`%%CODE_BLOCK_${i}%%`});let r=[];e=e.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(e,t,n,i)=>{let a=r.length;return r.push({header:t,separator:n,body:i,full:e.trim()}),`\n%%TABLE_BLOCK_${a}%%\n`});let i=``;return typeof marked<`u`?(marked.setOptions({breaks:!0,gfm:!0}),i=marked.parse(e)):i=e.replace(/`([^`]+)`/g,`<code>$1</code>`).replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`).replace(/\*([^*]+)\*/g,`<em>$1</em>`).replace(/\n/g,`<br>`),t.forEach((e,t)=>{i=i.replace(`%%MERMAID_BLOCK_${t}%%`,`<div class="mermaid" data-raw-code="${encodeURIComponent(e)}">${e}</div>`)}),n.forEach((e,t)=>{let n=e.content.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`);i=i.replace(`%%CODE_BLOCK_${t}%%`,`<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${t}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${e.language}">${n}</code></pre>
      </div>`)}),r.forEach((e,t)=>{i=i.replace(`%%TABLE_BLOCK_${t}%%`,gn(e))}),i}function hn(e){if(!e)return``;let t=e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`);return t=t.replace(/`([^`]+)`/g,`<code>$1</code>`),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/\*([^*]+)\*/g,`<em>$1</em>`),t=t.replace(/~~([^~]+)~~/g,`<del>$1</del>`),t}function gn(e){let{header:t,body:n,full:r}=e,i=window.__tableBlocks?window.__tableBlocks.length:0;window.__tableBlocks&&(window.__tableBlocks[i]={full:r,header:t,body:n});let a=t.split(`|`).filter(e=>e.trim()).map(e=>hn(e.trim())),o=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>hn(e.trim()))),s=`<div class="table-container-wrapper"><table>`;return s+=`<thead><tr>`,a.forEach((e,t)=>{t===a.length-1?s+=`<th class="table-header-cell-wrapper">
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
      </th>`:s+=`<th>${e}</th>`}),s+=`</tr></thead>`,s+=`<tbody>`,o.forEach(e=>{s+=`<tr>`,e.forEach(e=>{s+=`<td>${e}</td>`}),s+=`</tr>`}),s+=`</tbody>`,s+=`</table></div>`,s}function _n(e){try{let{header:t,body:n}=e,r=t.split(`|`).filter(e=>e.trim()).map(e=>e.trim()),i=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>e.trim())),a=`﻿`;a+=r.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`,i.forEach(e=>{a+=e.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`});let o=new Blob([a],{type:`text/csv;charset=utf-8;`}),s=document.createElement(`a`),c=URL.createObjectURL(o);s.setAttribute(`href`,c),s.setAttribute(`download`,`table-${Date.now()}.csv`),s.style.visibility=`hidden`,document.body.appendChild(s),s.click(),document.body.removeChild(s),console.log(`[SidePanel] Excel 下载成功`)}catch(e){console.error(`[SidePanel] 下载 Excel 失败:`,e),F(`下载失败: `+e.message,`error`)}}async function vn(){if(typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}console.log(`[SidePanel] ===== renderMermaidCharts 开始 =====`);let e=document.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,e.length),e.length!==0){for(let t=0;t<e.length;t++){let n=e[t];try{await mermaid.run({nodes:[n]}),console.log(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染成功`),bn(n)}catch(e){console.error(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染失败:`,e),!n.querySelector(`svg`)&&!n.querySelector(`.mermaid-controls`)&&(n.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${e.message}</div>`)}}console.log(`[SidePanel] ===== renderMermaidCharts 完成 =====`)}}function yn(e){return e?`<div class="markdown-body">${mn(e)}</div>`:``}function bn(e){if(e.querySelector(`.mermaid-controls`)){console.log(`[SidePanel] 工具栏已存在，跳过`);return}let t=e.querySelector(`svg`);if(!t){console.warn(`[SidePanel] SVG 元素未找到，当前内容:`,e.innerHTML.substring(0,100));return}console.log(`[SidePanel] 找到 SVG 元素，开始添加工具栏`),console.log(`[SidePanel] container 类名:`,e.className),console.log(`[SidePanel] container HTML:`,e.innerHTML.substring(0,200)),e.style.position=`relative`,e.style.cursor=`grab`,e.style.userSelect=`none`,e.style.webkitUserSelect=`none`;let n=e.querySelector(`.mermaid-svg-wrapper`);if(!n){n=document.createElement(`div`),n.className=`mermaid-svg-wrapper`,n.style.transformOrigin=`center center`,n.style.transition=`transform 0.2s ease`,n.style.display=`inline-block`,n.style.width=`100%`,t.style.maxWidth=`100%`,t.style.height=`auto`,t.style.userSelect=`none`,t.style.webkitUserSelect=`none`,n.appendChild(t),e.insertBefore(n,e.firstChild);let r=[];Array.from(e.childNodes).forEach(e=>{e.nodeType===Node.TEXT_NODE&&e.textContent.trim()&&r.push(e)}),r.forEach(e=>e.remove())}let r=document.createElement(`div`);r.className=`mermaid-controls`,r.innerHTML=`
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
  `,e.appendChild(r),console.log(`[SidePanel] 工具栏 HTML 已添加`),console.log(`[SidePanel] container 子元素:`,Array.from(e.children).map(e=>e.className).join(`, `));let i=1,a=.3,o=.15,s=e.dataset.rawCode||``;if(!s){let e=t.querySelector(`title`);e&&e.textContent&&(s=e.textContent.trim())}if(!s){let e=t.querySelector(`script[type="text/plain"]`);e&&(s=e.textContent.trim())}s&&!e.dataset.rawMermaidCode&&(e.dataset.rawMermaidCode=s),r.querySelector(`.view-source`).addEventListener(`click`,r=>{r.stopPropagation();let s=e.getAttribute(`data-raw-code`);Cn(e,s?decodeURIComponent(s):e.dataset.rawMermaidCode||``,n,t,i,{MIN_SCALE:a,MAX_SCALE:10,SCALE_STEP:o})}),r.querySelector(`.copy-to-clipboard`).addEventListener(`click`,e=>{e.stopPropagation(),xn(t,n,i)}),r.querySelector(`.download-png`).addEventListener(`click`,e=>{e.stopPropagation(),Sn(t,i)}),e.addEventListener(`wheel`,e=>{!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.stopPropagation(),i=e.deltaY<0?Math.min(10,i+o):Math.max(a,i-o),p())},{passive:!1});let c=!1,l,u,d=0,f=0;function p(){n.style.transform=`translate(${d}px, ${f}px) scale(${i})`}r.querySelector(`.zoom-in`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.min(10,i+o),p()}),r.querySelector(`.zoom-out`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.max(a,i-o),p()}),r.querySelector(`.reset-zoom`).addEventListener(`click`,e=>{e.stopPropagation(),i=1,d=0,f=0,p()}),e.addEventListener(`mousedown`,t=>{t.target.tagName!==`BUTTON`&&(c=!0,l=t.clientX-d,u=t.clientY-f,e.style.cursor=`grabbing`)}),document.addEventListener(`mousemove`,e=>{c&&(d=e.clientX-l,f=e.clientY-u,p())}),document.addEventListener(`mouseup`,()=>{c&&(c=!1,e.style.cursor=`grab`)})}async function xn(e,t,n){try{console.log(`[SidePanel] 开始复制到剪贴板`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){if(e)if(navigator.clipboard&&typeof ClipboardItem<`u`)navigator.clipboard.write([new ClipboardItem({"image/png":e})]).then(()=>{console.log(`[SidePanel] 图片复制到剪贴板成功`),F(`Mermaid 图表已复制到剪贴板！`,`success`)}).catch(e=>{console.error(`[SidePanel] 复制到剪贴板失败:`,e),F(`复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。`,`error`)});else{console.warn(`[SidePanel] Clipboard API 不可用，降级为下载`),F(`当前浏览器不支持图片复制功能，已自动转为下载。`,`warning`);let t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(t),t.click(),document.body.removeChild(t)}},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] 图片转换失败:`,e),F(`图片转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 复制到剪贴板失败:`,e),F(`复制失败: `+e.message,`error`)}}function Sn(e,t){try{console.log(`[SidePanel] 开始下载 PNG`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){console.log(`[SidePanel] SVG 图片加载成功`);let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){let t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t),console.log(`[SidePanel] PNG 下载成功`)},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] PNG 转换失败:`,e),F(`PNG 转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 下载 PNG 失败:`,e),F(`下载失败: `+e.message,`error`)}}function Cn(e,t,n,r,i,a){let o=e.querySelector(`.mermaid-source-view`),s=e.querySelector(`.mermaid-controls`);if(o)o.parentElement&&o.parentElement.remove(),n&&(n.style.display=`inline-block`),bn(e);else{n&&(n.style.display=`none`),s&&s.remove();let o=document.createElement(`div`);o.className=`mermaid-container-wrapper`,o.style.position=`relative`;let c=document.createElement(`pre`);c.className=`mermaid-source-view`,c.style.position=`relative`,c.textContent=t;let l=document.createElement(`button`);l.className=`source-copy-btn`,l.title=`复制源代码`,l.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `,l.addEventListener(`click`,e=>{e.stopPropagation(),dt(t,l)});let u=document.createElement(`button`);u.className=`source-copy-btn`,u.style.right=`44px`,u.title=`返回图表`,u.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `,u.addEventListener(`click`,o=>{o.stopPropagation(),Cn(e,t,n,r,i,a)}),c.appendChild(l),c.appendChild(u),o.appendChild(c),e.appendChild(o)}}async function wn(e){if(console.log(`[SidePanel] ===== renderMessageMermaid 开始 =====`),typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}await new Promise(e=>setTimeout(e,300));let t=e.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,t.length),t.length===0){console.log(`[SidePanel] 未找到 mermaid 元素`);return}try{for(let n=0;n<t.length;n++){let r=t[n];try{await mermaid.run({nodes:[r]}),console.log(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染成功`);let t=e.querySelectorAll(`.mermaid`)[n];t&&bn(t)}catch(t){console.error(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染失败:`,t);let r=e.querySelectorAll(`.mermaid`)[n];r&&!r.querySelector(`svg`)&&!r.querySelector(`.mermaid-controls`)&&(r.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${t.message}</div>`)}}console.log(`[SidePanel] Mermaid 渲染完成`);let n=e.querySelectorAll(`.mermaid-controls`);console.log(`[SidePanel] 工具栏添加结果:`,n.length,`个成功`)}catch(e){console.error(`[SidePanel] Mermaid 渲染整体失败:`,e)}Dn()}var Tn=!1;function En(){if(Tn)return;Tn=!0;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{if(!e.ctrlKey&&!e.metaKey)return;let t=e.target.closest(`code`);if(!t||e.target.closest(`.code-copy-btn`))return;e.preventDefault();let n=t.textContent;n&&navigator.clipboard.writeText(n).then(()=>{F(`${t.closest(`.code-block-container`)?`代码块`:`代码`}已复制到剪贴板`,`success`)}).catch(e=>{console.error(`[SidePanel] Ctrl+单击复制失败:`,e);let t=document.createElement(`textarea`);t.value=n,t.style.position=`fixed`,t.style.left=`-999999px`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),document.body.removeChild(t),F(`代码已复制到剪贴板`,`success`)})}),console.log(`[SidePanel] Ctrl+单击复制代码事件已绑定`))}function Dn(){let e=document.querySelectorAll(`.code-copy-btn`);console.log(`[SidePanel] 找到代码复制按钮数量:`,e.length),e.forEach((e,t)=>{if(e.dataset.bound){console.log(`[SidePanel] 按钮`,t,`已绑定，跳过`);return}e.dataset.bound=`true`,e.addEventListener(`click`,t=>{console.log(`[SidePanel] 代码复制按钮被点击`),t.stopPropagation();let n=e.closest(`.code-block-container`);if(console.log(`[SidePanel] 找到容器:`,!!n),n){let t=n.querySelector(`pre code`);if(console.log(`[SidePanel] 找到代码元素:`,!!t),t){let n=t.textContent;console.log(`[SidePanel] 代码长度:`,n.length),dt(n,e)}}}),console.log(`[SidePanel] 已绑定按钮`,t)}),En(),On()}function On(){document.querySelectorAll(`.copy-md-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&dt(r.full,e)}))}),document.querySelectorAll(`.download-excel-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&_n(r)}))})}var kn=!1,An=null;async function jn(){kn||=(await b(),!0)}async function Mn(){await jn();let[e,t]=await Promise.all([S(),l()]);return e.sort((e,t)=>e.order!==void 0&&t.order!==void 0?e.order-t.order:e.order===void 0?t.order===void 0?new Date(e.createdAt)-new Date(t.createdAt):1:-1),{activeSessionId:t,list:e}}function Nn(e){return typeof e==`string`?e:Array.isArray(e)?e.filter(e=>e.type===`text`).map(e=>e.text).join(``):``}async function Pn(){if(!N.activeSessionId)return!1;let e=await u(N.activeSessionId);if(!e)return!1;e.model=N.currentModel,e.useTools=N.useTools,e.enabledTools=[...N.enabledTools],e.agentId=N.activeAgentId||null,e.temperature=N.temperature,e.topP=N.topP;let t=N.chatConfig.maxHistoryMessages||50;e.messageHistory=N.messageHistory.slice(-t).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1,htmlContent:e.htmlContent||void 0})),e.updatedAt=new Date().toISOString();let n=N.messageHistory.find(e=>e.role===`user`);return n&&(e.title=Nn(n.content).substring(0,50).replace(/\n/g,` `)),await f(e),!0}async function Fn(){await jn();let e=Rn(),t={id:e,title:`新会话`,model:N.currentModel,useTools:N.useTools,enabledTools:[...N.enabledTools],agentId:N.activeAgentId||null,temperature:N.temperature,topP:N.topP,messageHistory:[],scrollPosition:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),order:Date.now(),isGenerating:!1,lastExecutionLog:[]};return await f(t),await w(e),t}async function In(e){await jn();let t=[];for(let n of e){let e={id:Rn(),title:n.title||`导入的会话`,model:n.model||N.currentModel,useTools:n.useTools===void 0?!0:n.useTools,enabledTools:n.enabledTools||[...N.enabledTools],temperature:n.temperature===void 0?N.temperature:n.temperature,topP:n.topP===void 0?N.topP:n.topP,agentId:n.agentId||null,messageHistory:(n.messageHistory||[]).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1,htmlContent:e.htmlContent||void 0})),scrollPosition:0,createdAt:n.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),order:Date.now()+t.length,isGenerating:!1,lastExecutionLog:[]};await f(e),t.push(e)}return!await l()&&t.length>0&&await w(t[0].id),t}async function Ln(e,t){let n=await u(e);return n?(n.messageHistory=n.messageHistory||[],n.messageHistory.push({role:t.role,content:t.content||``,executionLog:t.executionLog||[],reflectionScore:t.reflectionScore,wasRevised:t.wasRevised||!1,htmlContent:t.htmlContent||void 0}),n.updatedAt=new Date().toISOString(),n.isGenerating=!1,await f(n),!0):!1}function Rn(){return`sess_`+Date.now().toString(36)+`_`+Math.random().toString(36).substring(2,8)}async function zn(t){if(t===N.activeSessionId)return;await Pn(),An=N.activeSessionId;let n=await u(t);if(!n)return console.error(`[SessionStore] 找不到会话:`,t),!1;if(await w(t),N.activeSessionId=t,N.messageHistory=n.messageHistory||[],N.currentModel=n.model||N.currentModel,N.useTools=n.useTools===void 0?N.useTools:n.useTools,n.enabledTools&&n.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),r=n.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);N.enabledTools=[...r,...i]}else N.enabledTools=n.enabledTools||N.enabledTools;return N.temperature=n.temperature===void 0?N.temperature:n.temperature,N.topP=n.topP===void 0?N.topP:n.topP,N.activeAgentId=n.agentId||null,n.isGenerating&&N.generatingSessionIds.add(t),n}async function Bn(e){let t=await S(),n=await l();if(await s(e),n===e){let n=t.filter(t=>t.id!==e);if(n.length>0){let e=n.find(e=>e.id===An);await w(e?e.id:n[0].id),An=null}else await w(null)}return!0}async function Vn(e,t){let n=await u(e);return n?(n.title=t,n.updatedAt=new Date().toISOString(),await f(n),!0):!1}async function Hn(e){let t=await S(),n=new Map(t.map(e=>[e.id,e])),r=[];return e.forEach((e,t)=>{let i=n.get(e);i&&(i.order=t,r.push(f(i)))}),await Promise.all(r),!0}async function Un(){if(!N.messageHistory||N.messageHistory.length===0)return;let e=await u(N.activeSessionId);if(!e)return;let t=N.messageHistory.find(e=>e.role===`user`),n=t?Nn(t.content).substring(0,50).replace(/\n/g,` `):e.title||`未命名会话`,r=Date.now().toString(36)+Math.random().toString(36).substring(2,8),i=N.messageHistory.map(e=>({role:e.role,content:e.content||``})),a=await m();a.push({id:r,title:n,createdAt:new Date().toISOString(),messages:i}),a.length>20&&a.splice(0,a.length-20),await d(a);let o=await Fn();return await Bn(e.id),await zn(o.id),!0}async function z(){return Mn()}async function Wn(){return Pn()}async function Gn(){return Fn()}async function Kn(e){return zn(e)}async function qn(e){return Bn(e)}async function Jn(e,t){return Vn(e,t)}async function Yn(e){return Hn(e)}async function Xn(){return Un()}async function Zn(e){return In(e)}async function Qn(e,t){return Ln(e,t)}function $n(){let t=N.activeAgentToolIds;if(t==null)return e;let n=new Set(t);return e.filter(e=>n.has(e.id))}function er(){let e=document.getElementById(`toolsPopupOverlay`);if(!e)return;N.currentCategory=`all`,N.currentSearch=``;let t=document.getElementById(`toolsSearchInput`);t&&(t.value=``),sr(),B(),chrome.storage.local.get([`enableToolPreselect`],e=>{let t=document.getElementById(`toolsPreselectToggle`);t&&(t.checked=e.enableToolPreselect===void 0?!0:e.enableToolPreselect)}),document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),nr(),e.classList.add(`show`),console.log(`[SidePanel] 打开工具弹窗`)}function tr(){let e=document.getElementById(`toolsPopupOverlay`);e&&(document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.style.background=``,e.style.color=``,e.style.borderColor=``}),e.classList.remove(`show`),console.log(`[SidePanel] 关闭工具弹窗`))}function nr(){let e=document.getElementById(`toolsPopupList`);if(!e)return;e.innerHTML=``;let t=$n();if(N.activeAgentToolIds!==null&&N.activeAgentToolIds!==void 0){let t=document.createElement(`div`);t.className=`popup-tool-agent-banner`,t.innerHTML=`<span>🔒 当前助手已限定工具范围，以下仅展示该助手绑定的工具（范围内可自由调整）</span>`,e.appendChild(t)}let n={};t.forEach(e=>{if(N.currentCategory!==`all`&&e.category!==N.currentCategory)return;if(N.currentSearch){let t=e.name.toLowerCase().includes(N.currentSearch),n=e.description.toLowerCase().includes(N.currentSearch);if(!t&&!n)return}let t=e.category||`other`;n[t]||(n[t]=[]),n[t].push(e)});let r=Ye;if(Je.forEach(i=>{let a=n[i];if(!a||a.length===0)return;let o=t.filter(e=>e.category===i),s=o.length,c=o.filter(e=>N.enabledTools.includes(e.id)).length,l=document.createElement(`div`);l.className=`popup-tool-category-group`,l.dataset.category=i;let u=document.createElement(`div`);u.className=`popup-tool-category`,u.dataset.category=i;let d=N.collapsedCategories[i]||!1;u.innerHTML=`
      <span class="category-expand-icon">${d?`▶`:`▼`}</span>
      <span class="category-name">${r[i]||i}</span>
      <span class="category-count">${c}/${s}</span>
    `,u.addEventListener(`click`,()=>{rr(i)}),l.appendChild(u);let f=document.createElement(`div`);f.className=`popup-tool-items ${d?`collapsed`:``}`,a.forEach(e=>{let t=N.enabledTools.includes(e.id),n=document.createElement(`div`);n.className=`popup-tool-item`,n.dataset.category=i,n.innerHTML=`
        <input type="checkbox" id="tool_${e.id}" ${t?`checked`:``}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${I(e.name)}</div>
          <div class="popup-tool-desc">${I(e.description)}</div>
        </div>
      `;let r=n.querySelector(`input[type="checkbox"]`);r&&r.addEventListener(`change`,t=>{if(t.stopPropagation(),t.target.checked)N.enabledTools.includes(e.id)||N.enabledTools.push(e.id);else{let t=N.enabledTools.indexOf(e.id);t>-1&&N.enabledTools.splice(t,1)}ir(i),sr(),B()}),f.appendChild(n)}),l.appendChild(f),e.appendChild(l)}),e.children.length===0){let t=document.createElement(`div`);t.className=`popup-tool-empty`,t.textContent=`没有找到匹配的工具`,e.appendChild(t)}}function rr(e){N.collapsedCategories[e]=!N.collapsedCategories[e];let t=document.querySelector(`.popup-tool-category-group[data-category="${e}"]`);if(!t)return;let n=t.querySelector(`.popup-tool-category`).querySelector(`.category-expand-icon`),r=t.querySelector(`.popup-tool-items`);N.collapsedCategories[e]?(n.textContent=`▶`,r.classList.add(`collapsed`)):(n.textContent=`▼`,r.classList.remove(`collapsed`))}function ir(t){let n=document.querySelector(`.popup-tool-category[data-category="${t}"]`);if(!n)return;let r=n.querySelector(`.category-count`);if(!r)return;let i=e.filter(e=>e.category===t),a=i.length,o=0;i.forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&t.checked&&o++}),r.textContent=`${o}/${a}`}function ar(){return $n().filter(e=>{if(N.currentCategory!==`all`&&e.category!==N.currentCategory)return!1;if(N.currentSearch){let t=e.name.toLowerCase().includes(N.currentSearch.toLowerCase()),n=e.description.toLowerCase().includes(N.currentSearch.toLowerCase());if(!t&&!n)return!1}return!0})}function or(){Je.forEach(e=>{ir(e)})}function sr(){let e=[`all`,...Je],t=$n(),n=new Set(t.map(e=>e.id)),r=N.enabledTools.filter(e=>n.has(e)).length;e.forEach(e=>{let n=document.getElementById(`badge-`+e);if(!n)return;let i=0,a=0;if(e===`all`)i=t.length,a=r;else{let n=t.filter(t=>t.category===e);i=n.length,a=n.filter(e=>N.enabledTools.includes(e.id)).length}n.textContent=`${a}/${i}`,e!==`all`&&n.parentElement&&(n.parentElement.style.display=i===0?`none`:``)})}function B(){let e=document.getElementById(`toolsEnabledCount`);if(!e)return;let t=$n(),n=t.length,r=new Set(t.map(e=>e.id));e.textContent=`(已启用 ${N.enabledTools.filter(e=>r.has(e)).length}/${n})`}function cr(){let t=[];new Set(e.map(e=>e.id)),e.forEach(e=>{let n=document.getElementById(`tool_`+e.id);n?n.checked&&t.push(e.id):N.enabledTools.includes(e.id)&&t.push(e.id)}),N.enabledTools=t,N.useTools=N.enabledTools.length>0,chrome.storage.local.set({enabledTools:N.enabledTools},()=>{console.log(`[SidePanel] 工具配置已保存:`,N.enabledTools)}),Wn().catch(()=>{});let n=document.getElementById(`toolsPreselectToggle`);n&&chrome.storage.local.set({enableToolPreselect:n.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已保存:`,n.checked)}),lr();let r=$n(),i=new Set(r.map(e=>e.id)),a=N.enabledTools.filter(e=>i.has(e)).length;F(N.useTools?`已启用 ${a} 个工具`:`工具已全部禁用`,`success`)}function lr(){let e=document.getElementById(`toolsToggleBtn`),t=document.getElementById(`toolsBadge`),n=$n(),r=new Set(n.map(e=>e.id)),i=N.enabledTools.filter(e=>r.has(e)).length;e&&(N.useTools&&i>0?(e.classList.add(`active`),e.title=`工具 (${i}个启用)`):(e.classList.remove(`active`),e.title=`工具 (未启用)`)),t&&(i>0?(t.textContent=i,t.style.display=`inline`):t.style.display=`none`)}async function ur(){await dr(),await V(),mr(),gr(),console.log(`[AgentMgr] Agent 管理器初始化完成, activeAgentId:`,N.activeAgentId)}async function dr(){let[e,t]=await Promise.all([st(),tt()]);N.activeAgentId=e,N.customAgents=t.filter(e=>!e.isBuiltin),console.log(`[AgentMgr] Agent 状态已加载, activeAgentId:`,e,`total:`,t.length)}async function V(){let e=document.getElementById(`agentListItems`),t=document.getElementById(`agentDropdownFooter`);if(!e)return;let n=await tt(),r=N.activeAgentId,i=``;for(let e of n){let t=e.id===r||!r&&e.id==="default",n=e.toolIds?e.toolIds.length:`全部`;i+=`
      <div class="agent-item ${t?`active`:``}" data-agent-id="${H(e.id)}">
        <span class="agent-item-icon">${Mr(e.icon)}</span>
        <div class="agent-item-info">
          <span class="agent-item-name">${Mr(e.name)}</span>
          <span class="agent-item-desc">${Mr(e.description||`${n} 个工具`)}</span>
        </div>
        ${e.isBuiltin?``:`<button class="agent-item-edit" data-action="edit" data-agent-id="${H(e.id)}" title="编辑">✎</button>`}
      </div>`}e.innerHTML=i,t&&(t.innerHTML=`
      <div class="agent-item" id="agentAddBtn" style="color:#667eea;">
        <span class="agent-item-icon" style="color:#667eea;">＋</span>
        <span class="agent-item-name">创建新助手</span>
      </div>`),fr(n,r)}function fr(e,t){let n=document.getElementById(`agentSelectorBtn`),r=document.getElementById(`agentSelectorText`),i=document.getElementById(`agentSelectorEmoji`);if(!n||!r)return;let a=e.find(e=>e.id===t)||e.find(e=>e.id==="default");a?(r.textContent=`${a.icon} ${a.name}`,i&&(i.textContent=a.icon)):(r.textContent=`🤖 默认助手`,i&&(i.textContent=`🤖`))}function pr(){let e=document.getElementById(`agentSelectorBtn`),t=document.getElementById(`agentSelectorDropdown`);if(!e||!t)return;let n=e.getBoundingClientRect(),r=t.getBoundingClientRect(),i=document.getElementById(`agentSelectorWrapper`).getBoundingClientRect(),a=document.body.clientWidth,o=n.left+n.width/2,s=o-r.width/2,c=a-r.width-8;if(c<8){t.style.maxWidth=a-16+`px`;let e=t.getBoundingClientRect();s=o-e.width/2;let n=a-e.width-8;s=Math.max(8,Math.min(n,s))}else t.style.maxWidth=``,s=Math.max(8,Math.min(c,s));t.style.left=s-i.left+`px`}function mr(){let e=document.getElementById(`agentSelectorBtn`),t=document.getElementById(`agentSelectorDropdown`);!e||!t||(e.addEventListener(`click`,e=>{e.stopPropagation(),t.style.display===`flex`?t.style.display=`none`:(V(),t.style.display=`flex`,pr())}),document.addEventListener(`click`,()=>{t.style.display=`none`}),t.addEventListener(`click`,async e=>{let n=e.target.closest(`.agent-item`);if(!n)return;let r=e.target.closest(`[data-action]`);if(r&&r.dataset.action===`edit`){e.stopPropagation();let t=r.dataset.agentId;Sr(t);return}if(n.id===`agentAddBtn`){Sr(null);return}let i=n.dataset.agentId;i&&(await hr(i),t.style.display=`none`)}))}async function hr(e){let t=e?await rt(e):null;N.activeAgentId=e,N.activeAgentToolIds=t?t.toolIds:null,await ct(e),await V();let n=document.getElementById(`toolsPopupOverlay`);n&&n.classList.contains(`show`)&&(nr(),sr(),B()),lr();let r=t?t.name:`默认助手`;F(`已切换到：${r}`,`info`,2e3),console.log(`[AgentMgr] 已切换 Agent:`,e,r)}function gr(){let e=document.getElementById(`agentEditModal`);if(!e)return;e.querySelector(`#agentModalCloseBtn`)?.addEventListener(`click`,Cr),e.querySelector(`#agentSaveBtn`)?.addEventListener(`click`,Or),e.querySelector(`#agentDeleteBtn`)?.addEventListener(`click`,kr),e.querySelector(`#agentTemplateSelect`)?.addEventListener(`change`,Tr),vr();let t=document.getElementById(`agentToolActions`);t&&t.addEventListener(`click`,e=>{let t=e.target.closest(`button`);if(!t)return;let n=t.dataset.action;n===`selectAll`?yr():n===`deselectAll`&&br()});let n=document.getElementById(`agentToolList`);n&&n.addEventListener(`click`,e=>{let t=e.target.closest(`.agent-tool-category-clickable`);t&&xr(t.dataset.category)}),document.addEventListener(`click`,e=>{let t=document.getElementById(`emojiPicker`),n=document.getElementById(`agentEditIconBtn`);t&&n&&t.style.display===`block`&&!n.contains(e.target)&&!t.contains(e.target)&&(t.style.display=`none`)})}var _r=[{label:`人物表情`,emojis:[`😀`,`😃`,`😎`,`🤩`,`🥳`,`😇`,`🤔`,`🧐`,`😤`,`😭`,`🥺`,`🤗`,`😏`,`🫡`,`🤫`,`🤯`,`🥱`,`😴`,`🤤`,`💀`]},{label:`手势动作`,emojis:[`👋`,`🤝`,`👍`,`👎`,`👏`,`🙌`,`💪`,`✍️`,`🙏`,`🤞`,`✌️`,`🤘`,`👆`,`👇`,`👉`,`👈`,`🖐️`,`🤙`,`🤌`,`🫶`]},{label:`职业角色`,emojis:[`🤖`,`🧑‍💻`,`👨‍🔬`,`👩‍🎨`,`🧑‍🏫`,`👨‍💼`,`🧑‍🔧`,`👩‍⚕️`,`🧑‍🚀`,`👨‍🍳`,`🧑‍🎓`,`👩‍🚒`,`👮`,`🕵️`,`👷`,`🧙`,`🦸`,`🧛`,`🧜`,`👼`]},{label:`AI & 科技`,emojis:[`🧠`,`💡`,`🔍`,`🔬`,`🧪`,`🧬`,`🛰️`,`📡`,`🔗`,`🌐`,`💻`,`🖥️`,`⌨️`,`🖱️`,`🖨️`,`📱`,`🔌`,`💾`,`🎛️`,`⚙️`]},{label:`工具物品`,emojis:[`🔧`,`🔨`,`🪛`,`🔐`,`🔑`,`🛡️`,`🔒`,`🔓`,`✂️`,`📐`,`📏`,`🧲`,`💣`,`🧨`,`🔔`,`🔕`,`💎`,`💿`,`📀`,`🎥`]},{label:`文档数据`,emojis:[`📝`,`📋`,`📄`,`📊`,`📈`,`📉`,`🗂️`,`📁`,`📂`,`📚`,`📖`,`📌`,`📎`,`🖇️`,`✏️`,`🖊️`,`📏`,`📐`,`🗑️`,`📇`]},{label:`状态标记`,emojis:[`✅`,`❌`,`⚠️`,`⛔`,`🚫`,`➕`,`➖`,`⭐`,`🔥`,`💯`,`🎯`,`🏆`,`🥇`,`📌`,`📍`,`💬`,`🗨️`,`💭`,`🗯️`,`💢`]},{label:`交通出行`,emojis:[`🚀`,`✈️`,`🚗`,`🚲`,`🛵`,`🏎️`,`🚢`,`🚁`,`🛸`,`🏃`,`🚶`,`🧗`,`🏄`,`🚴`,`🏊`,`⛵`,`🚂`,`🚌`,`🚕`,`🛴`]},{label:`自然天气`,emojis:[`☀️`,`🌙`,`⭐`,`🌈`,`☁️`,`⛈️`,`❄️`,`🔥`,`💧`,`🌊`,`🌸`,`🌺`,`🌻`,`🌲`,`🍀`,`🌍`,`🏔️`,`🌋`,`🏝️`,`🌌`]},{label:`符号标志`,emojis:[`©️`,`®️`,`™️`,`♻️`,`⚡`,`💲`,`🔴`,`🟠`,`🟡`,`🟢`,`🔵`,`🟣`,`⬛`,`⬜`,`🟤`,`❤️`,`💙`,`💚`,`💛`,`💜`]}];function vr(){let e=document.getElementById(`emojiPicker`),t=document.getElementById(`agentEditIconBtn`),n=document.getElementById(`agentEditIcon`);if(!e||!t)return;let r=``;for(let e of _r){r+=`<div class="emoji-category-label">${e.label}</div>`,r+=`<div class="emoji-picker-grid">`;for(let t of e.emojis)r+=`<button type="button" class="emoji-picker-item" data-emoji="${t}">${t}</button>`;r+=`</div>`}e.innerHTML=r,t.addEventListener(`click`,n=>{if(n.stopPropagation(),e.style.display===`block`){e.style.display=`none`;return}let r=t.getBoundingClientRect();document.body.clientWidth-r.left>=330?(e.style.left=`0`,e.style.right=`auto`):(e.style.left=`auto`,e.style.right=`0`),e.style.display=`block`}),e.addEventListener(`click`,r=>{let i=r.target.closest(`.emoji-picker-item`);if(!i)return;let a=i.dataset.emoji;t.textContent=a,n&&(n.value=a),e.style.display=`none`})}function yr(){document.querySelectorAll(`#agentToolList input[type="checkbox"]`).forEach(e=>{e.checked=!0})}function br(){document.querySelectorAll(`#agentToolList input[type="checkbox"]`).forEach(e=>{e.checked=!1})}function xr(e){let t=document.querySelectorAll(`#agentToolList .agent-tool-item[data-category="${e}"]`),n=[];if(t.forEach(e=>{let t=e.querySelector(`input[type="checkbox"]`);t&&n.push(t)}),n.length===0)return;let r=n.every(e=>e.checked);n.forEach(e=>{e.checked=!r})}async function Sr(e){let t=document.getElementById(`agentEditModal`);if(!t)return;t.querySelector(`#agentEditId`).value=``,t.querySelector(`#agentEditName`).value=``,t.querySelector(`#agentEditIcon`).value=`🤖`;let n=t.querySelector(`#agentEditIconBtn`);n&&(n.textContent=`🤖`),t.querySelector(`#agentEditDesc`).value=``,t.querySelector(`#agentEditPrompt`).value=``,t.querySelector(`#agentEditAllowSub`).checked=!1,t.querySelector(`#agentTemplateSelect`).value=``;let r=t.querySelector(`#agentDeleteBtn`),i=t.querySelector(`#agentEditTitle`);if(e){let n=await rt(e);if(!n||n.isBuiltin)return;i.textContent=`编辑助手`,t.querySelector(`#agentEditId`).value=n.id,t.querySelector(`#agentEditName`).value=n.name,t.querySelector(`#agentEditIcon`).value=n.icon||`🤖`;let a=t.querySelector(`#agentEditIconBtn`);a&&(a.textContent=n.icon||`🤖`),t.querySelector(`#agentEditDesc`).value=n.description||``,t.querySelector(`#agentEditPrompt`).value=n.systemPrompt||``,t.querySelector(`#agentEditAllowSub`).checked=n.allowSubDispatch||!1,r.style.display=`block`,Er(n.toolIds)}else i.textContent=`创建新助手`,r.style.display=`none`,Er(null),wr();t.style.display=`flex`}function Cr(){let e=document.getElementById(`agentEditModal`);e&&(e.style.display=`none`)}function wr(){let e=document.getElementById(`agentTemplateSelect`);if(!e)return;let t=`<option value="">-- 选择模板（可选） --</option>`;for(let e=0;e<Ze.length;e++){let n=Ze[e];t+=`<option value="${e}">${n.icon} ${n.name}</option>`}e.innerHTML=t}function Tr(e){let t=parseInt(e.target.value);if(isNaN(t)||t<0||t>=Ze.length)return;let n=Ze[t],r=document.getElementById(`agentEditModal`);if(!r)return;r.querySelector(`#agentEditName`).value=n.name,r.querySelector(`#agentEditIcon`).value=n.icon;let i=r.querySelector(`#agentEditIconBtn`);i&&(i.textContent=n.icon),r.querySelector(`#agentEditDesc`).value=n.description,r.querySelector(`#agentEditPrompt`).value=n.systemPrompt,r.querySelector(`#agentEditAllowSub`).checked=n.allowSubDispatch||!1,Er(n.toolIds),F(`已加载模板：${n.name}`,`info`,2e3)}function Er(t){let n=document.getElementById(`agentToolList`);if(!n)return;let r=new Set(t||[]),i={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,content_extraction:`📄 内容提取`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_output:`📷 媒体与输出`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,local_agent:`🖥️ 代理`},a={};for(let t of e){let e=t.category||`other`;a[e]||(a[e]=[]),a[e].push(t)}let o=e.length,s=``;for(let[e,t]of Object.entries(a)){let n=i[e]||e;s+=`<div class="agent-tool-category agent-tool-category-clickable" data-category="${H(e)}" title="点击切换该分类全选/取消全选">${n} <span style="font-weight:400;color:#bbb;">(${t.length})</span></div>`;for(let n of t){let t=r.has(n.id)?`checked`:``;s+=`
        <label class="agent-tool-item" data-category="${H(e)}" title="${H(n.description)}">
          <input type="checkbox" value="${H(n.id)}" ${t} data-tool-id="${H(n.id)}">
          <span class="agent-tool-name">${Mr(n.name)}</span>
          <span class="agent-tool-desc">${Mr(n.description.substring(0,40))}${n.description.length>40?`...`:``}</span>
        </label>`}}n.innerHTML=s;let c=document.getElementById(`agentToolCount`);c&&(c.textContent=`(${o})`)}function Dr(){let e=document.getElementById(`agentToolList`);if(!e)return null;let t=e.querySelectorAll(`input[type="checkbox"]:checked`),n=[];return t.forEach(e=>n.push(e.value)),n.length>0?n:null}async function Or(){let e=document.getElementById(`agentEditModal`);if(!e)return;let t=e.querySelector(`#agentEditId`).value,n=e.querySelector(`#agentEditName`).value.trim(),r=e.querySelector(`#agentEditIcon`).value.trim()||`🤖`,i=e.querySelector(`#agentEditDesc`).value.trim(),a=e.querySelector(`#agentEditPrompt`).value.trim(),o=e.querySelector(`#agentEditAllowSub`).checked,s=Dr();if(!n){F(`请输入助手名称`,`warning`);return}let c={name:n,icon:r,description:i,systemPrompt:a,allowSubDispatch:o,toolIds:s};try{t?(await at(t,c),F(`助手已更新`,`success`)):F(`助手 "${(await it(c)).name}" 已创建`,`success`),await dr(),await V(),Cr()}catch(e){console.error(`[AgentMgr] 保存 Agent 失败:`,e),F(`保存失败：`+e.message,`error`)}}async function kr(){let e=document.getElementById(`agentEditModal`);if(!e)return;let t=e.querySelector(`#agentEditId`)?.value;if(t&&await Nr(`确定要删除这个助手吗？正在使用该助手的会话将恢复为默认助手。`,`删除助手`))try{await ot(t),F(`助手已删除`,`success`),await dr(),await V(),Cr()}catch(e){console.error(`[AgentMgr] 删除 Agent 失败:`,e),F(`删除失败：`+e.message,`error`)}}async function Ar(){return N.activeAgentId?await rt(N.activeAgentId):null}function jr(e){return e?e.toolIds:null}function Mr(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function H(e){return e?e.replace(/["&<>]/g,e=>({'"':`&quot;`,"&":`&amp;`,"<":`&lt;`,">":`&gt;`})[e]):``}async function Nr(e,t){return typeof window.showCustomConfirm==`function`?window.showCustomConfirm(e,t):new Promise(n=>{let r=document.getElementById(`agentConfirmModal`);if(!r){n(confirm(e));return}r.querySelector(`#agentConfirmMessage`).textContent=e,r.querySelector(`#agentConfirmTitle`).textContent=t||`确认`,r.style.display=`flex`;let i=()=>{r.style.display=`none`,r.querySelector(`#agentConfirmOk`).removeEventListener(`click`,a),r.querySelector(`#agentConfirmCancel`).removeEventListener(`click`,o),r.removeEventListener(`click`,s)},a=()=>{i(),n(!0)},o=()=>{i(),n(!1)},s=e=>{e.target===r&&(i(),n(!1))};r.querySelector(`#agentConfirmOk`).addEventListener(`click`,a),r.querySelector(`#agentConfirmCancel`).addEventListener(`click`,o),r.addEventListener(`click`,s)})}var U={visible:!1,highlightIndex:-1,filteredSessions:[]},W={draggedId:null,sourceType:null};async function G(){let e=await z();N.sessions=e.list,N.activeSessionId=e.activeSessionId;let t=document.getElementById(`sessionTabs`),n=document.getElementById(`sessionTabsScroll`),r=document.getElementById(`sessionTabsActions`);!t||!n||!r||(n.innerHTML=``,e.list.forEach(e=>{let t=document.createElement(`div`);t.className=`session-tab`,t.dataset.sessionId=e.id,e.id===N.activeSessionId&&t.classList.add(`active`),t.title=e.title;let r=document.createElement(`span`);r.className=`session-tab-title`,r.textContent=e.title||`新会话`,t.appendChild(r);let i=document.createElement(`span`);if(i.className=`session-tab-close`,i.innerHTML=`&#10005;`,i.title=`关闭会话`,i.addEventListener(`click`,async t=>{t.stopPropagation(),hi(e,async()=>{await vi()})}),t.appendChild(i),e.isGenerating||N.generatingSessionIds.has(e.id)){let e=document.createElement(`span`);e.className=`session-tab-indicator`,t.appendChild(e)}t.addEventListener(`click`,async t=>{t.preventDefault(),e.id!==N.activeSessionId&&await ui(e.id)}),t.addEventListener(`contextmenu`,t=>{t.preventDefault(),gi(t,e)}),t.addEventListener(`mousedown`,async t=>{t.button===1&&(t.preventDefault(),t.stopPropagation(),await qn(e.id),await vi())}),t.draggable=!0,t.addEventListener(`dragstart`,t=>Br(t,e.id)),t.addEventListener(`dragover`,e=>Vr(e)),t.addEventListener(`dragleave`,e=>Hr(e)),t.addEventListener(`drop`,t=>Ur(t,e.id)),t.addEventListener(`dragend`,e=>Wr(e)),n.appendChild(t)}),Pr(),Fr(),oi(),pi(n),Ir(n),zr(n))}function Pr(){let e=document.getElementById(`sessionTabsMore`);if(!e)return;let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`click`,e=>{e.stopPropagation(),Xr()})}function Fr(){let e=document.getElementById(`sessionTabsAdd`);if(!e)return;let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`click`,async()=>{await Wn();let e=await Gn();N.activeSessionId=e.id,N.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:e.id}})),G()})}function Ir(e){let t=document.getElementById(`sessionTabsMore`);t&&(e.scrollWidth>e.clientWidth?t.style.display=`flex`:t.style.display=`none`)}var Lr=null;function Rr(){if(Lr)return;let e=document.getElementById(`sessionTabsScroll`);e&&(Lr=new ResizeObserver(()=>{requestAnimationFrame(()=>{Ir(e)})}),Lr.observe(e))}function zr(e){setTimeout(()=>{let t=e.querySelector(`.session-tab.active`);t&&t.scrollIntoView({behavior:`smooth`,block:`nearest`,inline:`center`})},50)}function Br(e,t){W.draggedId=t,W.sourceType=`tab`,e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,t),e.currentTarget.classList.add(`dragging`)}function Vr(e){e.preventDefault(),e.dataTransfer.dropEffect=`move`,e.currentTarget.classList.add(`drag-over`)}function Hr(e){e.currentTarget.classList.remove(`drag-over`)}async function Ur(e,t){e.preventDefault(),e.currentTarget.classList.remove(`drag-over`);let n=W.draggedId;if(!n||n===t)return;let r=N.sessions||[],i=r.findIndex(e=>e.id===n),a=r.findIndex(e=>e.id===t);if(i===-1||a===-1)return;let o=[...r],[s]=o.splice(i,1);o.splice(a,0,s),N.sessions=o,await Yn(o.map(e=>e.id)),G()}function Wr(e){e.currentTarget.classList.remove(`dragging`),document.querySelectorAll(`.session-tab.drag-over`).forEach(e=>e.classList.remove(`drag-over`)),W.draggedId=null,W.sourceType=null}function Gr(e,t){W.draggedId=t,W.sourceType=`dropdown`,e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,t),e.currentTarget.classList.add(`dragging`)}function Kr(e){e.preventDefault(),e.dataTransfer.dropEffect=`move`,e.currentTarget.classList.add(`drag-over`)}function qr(e){e.currentTarget.classList.remove(`drag-over`)}async function Jr(e,t){e.preventDefault(),e.currentTarget.classList.remove(`drag-over`);let n=W.draggedId;if(!n||n===t)return;let r=U.filteredSessions,i=r.findIndex(e=>e.id===n),a=r.findIndex(e=>e.id===t);if(i===-1||a===-1)return;let o=[...r],[s]=o.splice(i,1);o.splice(a,0,s),U.filteredSessions=o;let c=N.sessions||[],l=c.map(e=>e.id),u=new Set(o.map(e=>e.id)),d=l.filter(e=>!u.has(e)),f=[...o.map(e=>e.id),...d];N.sessions=f.map(e=>c.find(t=>t.id===e)).filter(Boolean),await Yn(f),ti(),G()}function Yr(e){e.currentTarget.classList.remove(`dragging`),document.querySelectorAll(`.session-dropdown-item.drag-over`).forEach(e=>e.classList.remove(`drag-over`)),W.draggedId=null,W.sourceType=null}function Xr(){U.visible?Qr():Zr()}async function Zr(){let e=document.getElementById(`sessionTabsMore`),t=document.getElementById(`sessionDropdown`);if(!e||!t)return;let n=await z();N.sessions=n.list,N.activeSessionId=n.activeSessionId,U.filteredSessions=[...n.list],U.highlightIndex=-1,U.visible=!0,ti(),ei(e,t);let r=document.getElementById(`sessionDropdownSearch`);r&&(r.value=``,setTimeout(()=>r.focus(),50)),e.classList.add(`active`),setTimeout(()=>{document.addEventListener(`click`,$r)},0)}function Qr(){let e=document.getElementById(`sessionTabsMore`),t=document.getElementById(`sessionDropdown`);t&&t.classList.remove(`show`),e&&e.classList.remove(`active`),U.visible=!1,U.highlightIndex=-1,U.filteredSessions=[],document.removeEventListener(`click`,$r)}function $r(e){let t=document.getElementById(`sessionDropdown`),n=document.getElementById(`sessionTabsMore`);!t||!n||!t.contains(e.target)&&e.target!==n&&!n.contains(e.target)&&Qr()}function ei(e,t){t.classList.add(`show`);let n=e.getBoundingClientRect(),r=n.bottom+4,i=n.right-240;r+360>window.innerHeight-8&&(r=n.top-360-4,r<8&&(r=8)),i<8&&(i=8),t.style.top=r+`px`,t.style.left=i+`px`}function ti(){let e=document.getElementById(`sessionDropdownList`);if(e){if(e.innerHTML=``,U.filteredSessions.length===0){let t=document.createElement(`div`);t.className=`session-dropdown-empty`,t.textContent=`无匹配会话`,e.appendChild(t);return}U.filteredSessions.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`session-dropdown-item`,r.dataset.sessionId=t.id,r.dataset.index=n,t.id===N.activeSessionId&&r.classList.add(`active`),n===U.highlightIndex&&r.classList.add(`highlighted`);let i=document.createElement(`span`);i.className=`session-dropdown-item-title`,i.textContent=t.title||`新会话`,r.appendChild(i);let a=document.createElement(`span`);a.className=`session-dropdown-item-close`,a.innerHTML=`&#10005;`,a.title=`关闭会话`,a.addEventListener(`click`,async e=>{e.stopPropagation(),e.preventDefault(),await ii(t.id)}),r.appendChild(a),r.addEventListener(`click`,async e=>{e.preventDefault(),await ri(t.id)}),r.draggable=!0,r.addEventListener(`dragstart`,e=>Gr(e,t.id)),r.addEventListener(`dragover`,e=>Kr(e)),r.addEventListener(`dragleave`,e=>qr(e)),r.addEventListener(`drop`,e=>Jr(e,t.id)),r.addEventListener(`dragend`,e=>Yr(e)),e.appendChild(r)})}}function ni(e){let t=N.sessions||[];if(!e.trim())U.filteredSessions=[...t];else{let n=e.trim().toLowerCase();U.filteredSessions=t.filter(e=>(e.title||`新会话`).toLowerCase().includes(n))}U.highlightIndex=-1,ti()}async function ri(e){Qr(),e!==N.activeSessionId&&await ui(e)}async function ii(e){await qn(e),await vi();let t=document.getElementById(`sessionDropdownSearch`),n=t?t.value:``,r=N.sessions||[];if(!n.trim())U.filteredSessions=[...r];else{let e=n.trim().toLowerCase();U.filteredSessions=r.filter(t=>(t.title||`新会话`).toLowerCase().includes(e))}U.highlightIndex=Math.min(U.highlightIndex,U.filteredSessions.length-1),ti()}async function ai(){let e=N.sessions||[];if(e.length!==0){if(Qr(),!await li(`确定要关闭全部 ${e.length} 个会话吗？此操作不可撤销。`,`关闭全部会话`)){Zr();return}for(let t of e)await qn(t.id);await vi()}}function oi(){let e=document.getElementById(`sessionDropdownSearch`),t=document.getElementById(`sessionDropdownCloseAll`),n=document.getElementById(`sessionDropdown`);if(n){if(e){let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`input`,e=>{ni(e.target.value)}),t.addEventListener(`keydown`,e=>{si(e)})}if(t){let e=t.cloneNode(!0);t.parentNode.replaceChild(e,t),e.addEventListener(`click`,async e=>{e.stopPropagation(),await ai()})}n.addEventListener(`click`,e=>{e.stopPropagation()})}}function si(e){if(!U.visible)return;let t=U.filteredSessions.length;if(t===0){e.key===`Escape`&&Qr();return}switch(e.key){case`ArrowDown`:e.preventDefault(),U.highlightIndex=Math.min(U.highlightIndex+1,t-1),ti(),ci();break;case`ArrowUp`:e.preventDefault(),U.highlightIndex=Math.max(U.highlightIndex-1,0),ti(),ci();break;case`Enter`:if(e.preventDefault(),U.highlightIndex>=0&&U.highlightIndex<t){let e=U.filteredSessions[U.highlightIndex];ri(e.id)}break;case`Escape`:e.preventDefault(),Qr();break}}function ci(){let e=document.querySelector(`.session-dropdown-item.highlighted`);e&&e.scrollIntoView({block:`nearest`})}function li(e,t){return new Promise(t=>{let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r){t(!1);return}r.textContent=e;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=()=>{s(),t(!0)},l=()=>{s(),t(!1)};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)})}async function ui(t){if(await Wn(),!await Kn(t))return;let n=await z();N.sessions=n.list,N.activeSessionId=t;let r=n.list.find(e=>e.id===t);if(r){if(N.messageHistory=r.messageHistory||[],N.currentModel=r.model||N.currentModel,N.useTools=r.useTools===void 0?N.useTools:r.useTools,r.enabledTools&&r.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),n=r.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!n.includes(e.id)).map(e=>e.id);N.enabledTools=[...n,...i]}else N.enabledTools=r.enabledTools||N.enabledTools;N.temperature=r.temperature===void 0?N.temperature:r.temperature,N.topP=r.topP===void 0?N.topP:r.topP}if(N.activeAgentId){let e=await rt(N.activeAgentId);N.activeAgentToolIds=e?e.toolIds:null}else N.activeAgentToolIds=null;document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:t}})),G(),di(),V();let i=document.getElementById(`toolsPopupOverlay`);i&&i.classList.contains(`show`)&&(nr(),sr(),B()),lr()}function di(){let e=document.querySelector(`.model-display`);e&&N.currentModel&&(e.textContent=N.currentModel);let t=document.getElementById(`enableToolsBtn`);t&&(t.checked=N.useTools);let n=document.getElementById(`tempIconValue`);n&&N.temperature!==void 0&&(n.textContent=N.temperature.toFixed(2))}var fi=new WeakSet;function pi(e){fi.has(e)||(fi.add(e),e.addEventListener(`wheel`,t=>{e.scrollWidth<=e.clientWidth||(t.preventDefault(),e.scrollLeft+=t.deltaY)},{passive:!1}))}function mi(e){let t=document.getElementById(`sessionRenameModal`),n=document.getElementById(`sessionRenameInput`),r=document.getElementById(`sessionRenameConfirmBtn`),i=document.getElementById(`sessionRenameCancelBtn`),a=document.getElementById(`sessionRenameCloseBtn`);if(!t||!n)return;n.value=e.title,n.focus(),n.select();let o=()=>{t.classList.remove(`show`),r.removeEventListener(`click`,s),i.removeEventListener(`click`,c),a.removeEventListener(`click`,c)},s=()=>{let t=n.value.trim();t&&t!==e.title&&Jn(e.id,t).then(()=>{G()}),o()},c=()=>{o()};r.addEventListener(`click`,s),i.addEventListener(`click`,c),a.addEventListener(`click`,c),n.onkeydown=e=>{e.key===`Enter`?s():e.key===`Escape`&&c()},t.classList.add(`show`)}function hi(e,t){let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r)return;r.textContent=`确定要删除会话"${e.title}"吗？此操作不可撤销。`;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=async()=>{await qn(e.id),t&&await t(),s()},l=()=>{s()};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)}function gi(e,t){let n=document.querySelector(`.session-context-menu`);n&&n.remove();let r=document.createElement(`div`);r.className=`session-context-menu`,r.style.left=e.clientX+`px`,r.style.top=e.clientY+`px`;let i=_i(`重命名`,()=>{r.remove(),mi(t)});r.appendChild(i);let a=_i(`删除`,()=>{r.remove(),hi(t,async()=>{let e=await z();N.activeSessionId=e.activeSessionId,N.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);if(t?(N.messageHistory=t.messageHistory||[],N.activeAgentId=t.agentId||null):(N.messageHistory=[],N.activeAgentId=null),N.activeAgentId){let e=await rt(N.activeAgentId);N.activeAgentToolIds=e?e.toolIds:null}else N.activeAgentToolIds=null;document.dispatchEvent(new CustomEvent(`session-switched`)),G(),await V()})},`danger`);r.appendChild(a),document.body.appendChild(r);let o=e=>{r.contains(e.target)||(r.remove(),document.removeEventListener(`click`,o))};setTimeout(()=>document.addEventListener(`click`,o),0)}function _i(e,t,n=``){let r=document.createElement(`div`);return r.className=`session-context-menu-item `+n,r.textContent=e,r.addEventListener(`click`,t),r}async function vi(){let e=await z();e.activeSessionId||(await Gn(),e=await z()),N.activeSessionId=e.activeSessionId,N.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);if(N.messageHistory=t&&t.messageHistory||[],N.activeAgentId=t&&t.agentId||null,N.activeAgentId){let e=await rt(N.activeAgentId);N.activeAgentToolIds=e?e.toolIds:null}else N.activeAgentToolIds=null;document.dispatchEvent(new CustomEvent(`session-switched`)),G(),await V()}document.addEventListener(`generating-state-changed`,()=>{G()}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,Rr):Rr();var yi=`pendingCallApiSessions`;function bi(){chrome.storage.session.set({[yi]:[...N.pendingCallApiSessionIds]}).catch(()=>{})}async function xi(){try{let e=await chrome.storage.session.get([yi]);e[yi]&&Array.isArray(e[yi])&&(N.pendingCallApiSessionIds=new Set(e[yi]))}catch{}}function Si(e){if(Array.isArray(e))return e.filter(e=>e.type===`text`).map(e=>e.text).join(``);if(typeof e==`string`&&e.startsWith(`[`))try{let t=JSON.parse(e);if(Array.isArray(t))return t.filter(e=>e.type===`text`).map(e=>e.text).join(``)}catch{}return e}function Ci(e){let t=Si(e);N.quotedContextText=t;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let e;e=t.length>100?t.substring(0,100)+`...`:t.length>50?t.substring(0,50)+`...`:t,r.textContent=`💬 已引用: ${e}`,n.classList.add(`show`)}}function wi(){console.log(`[SidePanel] 清除选中内容上下文`),N.selectedContextText=``,N.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=e.findIndex(e=>e.startsWith(`[用户问题]`));n===-1?t.value=``:t.value=e.slice(n+1).join(`
`).trim()}}async function Ti(){let t=await z();if(t.activeSessionId&&t.list.length>0){N.activeSessionId=t.activeSessionId,N.sessions=t.list;let n=t.list.find(e=>e.id===t.activeSessionId);if(n){if(N.messageHistory=n.messageHistory||[],N.currentModel=n.model||N.currentModel,N.useTools=n.useTools===void 0?N.useTools:n.useTools,n.enabledTools&&n.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),r=n.enabledTools.filter(e=>t.has(e)),i=new Set(n.enabledTools),a=e.filter(e=>e.enabled&&!i.has(e.id)).map(e=>e.id);N.enabledTools=[...r,...a]}else N.enabledTools=n.enabledTools||N.enabledTools;N.temperature=n.temperature===void 0?N.temperature:n.temperature,N.topP=n.topP===void 0?N.topP:n.topP}N.messageHistory.forEach(e=>{let t=e.wasRevised;if(!t&&e.executionLog)try{t=(typeof e.executionLog==`string`?JSON.parse(e.executionLog):e.executionLog).some(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.action?.decision===`revised`)}catch{}e.htmlContent?Da(e.htmlContent):X(e.role,e.content,!1,e.executionLog||[],e.reflectionScore,t)});let r=document.querySelector(`.welcome-message`);r&&N.messageHistory.length>0&&r.remove(),vn();let i=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.get([i],e=>{e[i]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t.scrollTop=e[i]},100)}),G()}else{await Gn();let e=await z();e.activeSessionId&&(N.activeSessionId=e.activeSessionId,N.sessions=e.list),G()}}function K(){try{Wn().catch(e=>{console.error(`[SidePanel] 保存当前会话失败:`,e)})}catch(e){console.error(`[SidePanel] 保存对话历史异常:`,e)}}function Ei(){N.messageHistory&&N.messageHistory.length>0&&Xn().then(()=>{N.messageHistory=[];let e=document.getElementById(`chatContainer`);if(e){e.innerHTML=``;let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
          <div class="icon-wrapper">
            <div class="icon">💬</div>
          </div>
          <h2>开始对话</h2>
          <p>输入您的问题，AI 助手将为您解答</p>
        `,e.appendChild(t)}chrome.storage.local.remove(`scrollPosition_`+(N.activeSessionId||`default`)),G()})}async function Di(){let e=document.getElementById(`exportSessionsModal`),t=document.getElementById(`exportSessionsList`);if(!(!e||!t)){t.innerHTML=`<div class="export-sessions-empty">加载中...</div>`;try{let{list:e,activeSessionId:n}=await z();if(e.length===0)t.innerHTML=`<div class="export-sessions-empty">暂无会话可导出</div>`;else{let r=n||N.activeSessionId;t.innerHTML=e.map((e,t)=>{let n=e.id===r,i=(e.messageHistory||[]).length,a=e.createdAt?new Date(e.createdAt).toLocaleDateString(`zh-CN`):``;return`
        <div class="export-session-item" data-id="${e.id}">
          <input type="checkbox" class="export-session-checkbox" data-session-id="${e.id}" ${n?`checked`:``}>
          <div class="export-session-info">
            <div class="export-session-title">${I(e.title||`未命名会话`)}${n?`<span class="current-badge">当前</span>`:``}</div>
            <div class="export-session-meta">${i} 条消息${a?` · `+a:``}</div>
          </div>
        </div>`}).join(``),t.querySelectorAll(`.export-session-item`).forEach(e=>{let t=e.querySelector(`.export-session-checkbox`);e.addEventListener(`click`,e=>{e.target!==t&&(t.checked=!t.checked),Oi()})});let i=document.getElementById(`exportSelectAllBtn`),a=document.getElementById(`exportDeselectAllBtn`),o=document.getElementById(`exportSelectCurrentBtn`);i&&(i.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=!0}),Oi()}),a&&(a.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=!1}),Oi()}),o&&(o.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=e.dataset.sessionId===r}),Oi()}),Oi()}}catch(e){console.error(`[SidePanel] 加载会话列表失败:`,e),t.innerHTML=`<div class="export-sessions-empty">加载失败</div>`}e.classList.add(`show`)}}function Oi(){document.querySelectorAll(`#exportSessionsList .export-session-checkbox`);let e=document.querySelectorAll(`#exportSessionsList .export-session-checkbox:checked`),t=document.getElementById(`exportSelectedCount`);t&&(t.textContent=`已选 ${e.length} 个`);let n=document.getElementById(`exportSessionsOkBtn`);n&&(n.textContent=`导出选中 (${e.length})`,n.disabled=e.length===0,n.style.opacity=e.length===0?`0.5`:`1`)}function ki(){let e=document.getElementById(`exportSessionsModal`);e&&e.classList.remove(`show`)}async function Ai(){let e=document.querySelectorAll(`#exportSessionsList .export-session-checkbox:checked`),t=Array.from(e).map(e=>e.dataset.sessionId);if(t.length===0){F(`请至少选择一个会话`,`warning`);return}try{let{list:e}=await z(),n=e.filter(e=>t.includes(e.id)),r={version:1,exportedAt:new Date().toISOString(),sessions:n.map(e=>({title:e.title||`未命名会话`,model:e.model,useTools:e.useTools,enabledTools:e.enabledTools,temperature:e.temperature,topP:e.topP,createdAt:e.createdAt,messageHistory:(e.messageHistory||[]).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],htmlContent:e.htmlContent||``,reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1}))}))},i=new Date,a=i.getFullYear()+String(i.getMonth()+1).padStart(2,`0`)+String(i.getDate()).padStart(2,`0`)+`-`+String(i.getHours()).padStart(2,`0`)+String(i.getMinutes()).padStart(2,`0`)+String(i.getSeconds()).padStart(2,`0`),o=n.length,s=o===1?`ai-helper-${n[0].title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)}-${a}.aihelper.json`:`ai-helper-${o}sessions-${a}.aihelper.json`,c=JSON.stringify(r,null,2),l=new Blob([c],{type:`application/json;charset=utf-8;`}),u=URL.createObjectURL(l),d=document.createElement(`a`);d.href=u,d.download=s,document.body.appendChild(d),d.click(),document.body.removeChild(d),URL.revokeObjectURL(u),ki(),console.log(`[SidePanel] 会话已导出:`,s,`共`,o,`个会话`),F(`已导出 ${o} 个会话`,`success`)}catch(e){console.error(`[SidePanel] 导出失败:`,e),F(`导出失败: `+e.message,`error`)}}function ji(){let e=document.getElementById(`exportSessionsCloseBtn`),t=document.getElementById(`exportSessionsCancelBtn`),n=document.getElementById(`exportSessionsOkBtn`),r=document.getElementById(`exportSessionsModal`);e&&e.addEventListener(`click`,ki),t&&t.addEventListener(`click`,ki),n&&n.addEventListener(`click`,Ai),r&&r.addEventListener(`click`,e=>{e.target===r&&ki()})}function Mi(){let e=document.getElementById(`importSessionsFile`);e&&(e.value=``,e.click())}async function Ni(e){try{let t=await e.text(),n=JSON.parse(t),r=[];if(n.version&&n.sessions&&Array.isArray(n.sessions))r=n.sessions;else if(Array.isArray(n))r=n.length>0&&n[0].role?[{title:`导入的对话`,messageHistory:n.map(e=>({role:e.role||`user`,content:e.content||``}))}]:(n.length>0&&n[0].title,n);else throw Error(`无法识别的文件格式`);if(r.length===0){F(`文件中没有可导入的会话数据`,`warning`);return}let i=await Zn(r);await G(),console.log(`[SidePanel] 导入完成:`,i.length,`个会话`),F(`成功导入 ${i.length} 个会话`,`success`)}catch(e){console.error(`[SidePanel] 导入失败:`,e),F(`导入失败: `+e.message,`error`)}}function Pi(){document.getElementById(`confirmModal`).classList.add(`show`)}function Fi(){document.getElementById(`confirmModal`).classList.remove(`show`)}var q=1,J=0,Ii=0,Li=!1,Ri=0,zi=0,Bi=0,Vi=0,Y=[],Hi=0;function Ui(){let e=document.getElementById(`imagePreviewLarge`);e&&(e.style.transform=`translate(${J}px, ${Ii}px) scale(${q})`,q>1?(e.classList.add(`zoomable`),Li?e.classList.add(`dragging`):e.classList.remove(`dragging`)):e.classList.remove(`zoomable`,`dragging`))}function Wi(){q=1,J=0,Ii=0,Li=!1,Ui()}function Gi(e,t){let n=document.getElementById(`imagePreviewOverlay`),r=document.getElementById(`imagePreviewLarge`);!n||!r||(Ki(e,t),qi(),Yi(e),n.classList.add(`show`))}function Ki(e,t){Y=[],t&&(t.closest(`.image-preview-bar`)||t.classList.contains(`image-preview-thumb`)?document.querySelectorAll(`.image-preview-thumb`).forEach(e=>{e.src&&Y.push(e.src)}):t.closest(`.user-message-images`)&&t.closest(`.user-message-images`).querySelectorAll(`.user-message-image`).forEach(e=>{e.src&&Y.push(e.src)})),Y.length===0&&document.querySelectorAll(`.image-preview-thumb, .user-message-image`).forEach(e=>{e.src&&Y.push(e.src)}),Hi=Y.indexOf(e),Hi===-1&&(Y.push(e),Hi=Y.length-1)}function qi(){let e=document.getElementById(`imagePreviewPrev`),t=document.getElementById(`imagePreviewNext`),n=document.getElementById(`imagePreviewCounter`);Y.length<=1?(e&&(e.style.display=`none`),t&&(t.style.display=`none`),n&&(n.style.display=`none`)):(e&&(e.style.display=``),t&&(t.style.display=``),n&&(n.style.display=``),Ji())}function Ji(){let e=document.getElementById(`imagePreviewPrev`),t=document.getElementById(`imagePreviewNext`),n=document.getElementById(`imagePreviewCounter`);e&&(e.disabled=!1),t&&(t.disabled=!1),n&&(n.textContent=`${Hi+1} / ${Y.length}`)}function Yi(e){let t=document.getElementById(`imagePreviewLarge`);t&&(Wi(),t.src=e)}function Xi(e){let t=Y.length;t!==0&&(Hi=(Hi+e+t)%t,Yi(Y[Hi]),Ji())}function Zi(){let e=document.getElementById(`imagePreviewOverlay`);if(!e||e.dataset.initialized)return;e.dataset.initialized=`true`;let t=document.getElementById(`imagePreviewLarge`),n=()=>{e.classList.remove(`show`),Wi()};e.addEventListener(`click`,t=>{t.target===e&&n()});let r=e.querySelector(`.image-preview-close`);r&&r.addEventListener(`click`,n);let i=document.getElementById(`imagePreviewPrev`),a=document.getElementById(`imagePreviewNext`);i&&i.addEventListener(`click`,e=>{e.stopPropagation(),Xi(-1)}),a&&a.addEventListener(`click`,e=>{e.stopPropagation(),Xi(1)}),document.addEventListener(`keydown`,t=>{e.classList.contains(`show`)&&(t.key===`Escape`?n():t.key===`ArrowLeft`?Xi(-1):t.key===`ArrowRight`&&Xi(1))}),e.addEventListener(`wheel`,n=>{if(!e.classList.contains(`show`))return;n.preventDefault();let r=t.getBoundingClientRect(),i=n.clientX-r.left-r.width/2,a=n.clientY-r.top-r.height/2,o=n.deltaY>0?-.15:.15,s=q,c=Math.max(.3,Math.min(5,q+o)),l=c/s;q=c,J=i-l*(i-J),Ii=a-l*(a-Ii),Ui()},{passive:!1}),t.addEventListener(`mousedown`,t=>{!e.classList.contains(`show`)||q<=1||(t.preventDefault(),Li=!0,Ri=t.clientX,zi=t.clientY,Bi=J,Vi=Ii,Ui())}),document.addEventListener(`mousemove`,e=>{Li&&(J=Bi+(e.clientX-Ri),Ii=Vi+(e.clientY-zi),Ui())}),document.addEventListener(`mouseup`,()=>{Li&&(Li=!1,Ui())}),t.addEventListener(`dblclick`,()=>{e.classList.contains(`show`)&&(q>1?Wi():(q=2,J=0,Ii=0,Ui()))})}function Qi(e){let t=new Image,n=URL.createObjectURL(e);t.onload=()=>{URL.revokeObjectURL(n);let{width:e,height:r}=t,i=1024;(e>i||r>i)&&(e>r?(r=Math.round(i/e*r),e=i):(e=Math.round(i/r*e),r=i));let a=document.createElement(`canvas`);a.width=e,a.height=r,a.getContext(`2d`).drawImage(t,0,0,e,r);let o=a.toDataURL(`image/jpeg`,.65);N.attachedImages.push({dataUrl:o});let s=document.getElementById(`imagePreviewBar`),c=document.getElementById(`userInput`);s&&(s.style.display=``),$i(),c&&c.focus()},t.onerror=()=>{URL.revokeObjectURL(n),console.error(`[ChatManager] 图片加载失败`)},t.src=n}function $i(){let e=document.getElementById(`imagePreviewBar`);if(e){if(e.innerHTML=``,N.attachedImages.length===0){e.style.display=`none`;return}e.style.display=``,N.attachedImages.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`image-preview-item`;let i=document.createElement(`img`);i.src=t.dataUrl,i.className=`image-preview-thumb`,i.title=`点击查看大图`,i.style.cursor=`zoom-in`,i.addEventListener(`click`,()=>{Gi(t.dataUrl,i)});let a=document.createElement(`button`);a.className=`image-preview-remove`,a.innerHTML=`×`,a.title=`移除图片`,a.addEventListener(`click`,e=>{e.stopPropagation(),N.attachedImages.splice(n,1),$i()}),r.appendChild(i),r.appendChild(a),e.appendChild(r)})}}function ea(e){if(!N.enableImageInput||N.attachedImages.length===0)return e;let t=[{type:`text`,text:e}];for(let e of N.attachedImages)t.push({type:`image_url`,image_url:{url:e.dataUrl}});return t}function ta(e){if(typeof e==`string`)return e;if(Array.isArray(e)){let t=e.filter(e=>e.type===`text`);return t.length===1?t[0].text:t}return e}async function na(){let e=document.getElementById(`userInput`),t=document.getElementById(`chatContainer`),s=e.value.trim();if(!s||N.isGenerating)return;let l=t.querySelector(`.welcome-message`);l&&l.remove();let u=s,d=N.enableSelectionQuery&&N.selectedContextText&&N.selectedContextText.trim(),f=N.quotedContextText&&N.quotedContextText.trim();if(f){let{compressed:e,wasCompressed:t}=C(N.quotedContextText.trim());u=`[引用内容${t?`摘要`:``}]\n${e}\n\n[用户问题]\n${s}`,N.quotedContextText=``}else if(d){let{compressed:e,wasCompressed:t}=C(N.selectedContextText.trim());u=`[选中内容${t?`摘要`:``}]\n${e}\n\n[用户问题]\n${s}`,N.selectedContextText=``}let p=ea(u);X(`user`,p),N.messageHistory.push({role:`user`,content:p}),K(),vt(s),N.inputHistoryIndex=-1,e.value=``,e.style.height=`auto`,(d||f)&&wi(),N.isGenerating=!0;let m=N.activeSessionId,h=Ta(),g=N.enableImageInput&&N.attachedImages.length>0&&N.imageModelName||N.currentModel;if(N.attachedImages.length>0){let e=document.getElementById(`imagePreviewBar`);e&&(e.innerHTML=``,e.style.display=`none`)}try{await ht();let e=await Ar(),t=jr(e);N.activeAgentToolIds=t,console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - agent:`,e?e.name:`默认助手`),console.log(`  - agentToolIds:`,t),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let s=[{role:`system`,content:await ft(e)}];if(N.isolateChat){let e=N.messageHistory,t=N.chatConfig.contextWindow||0,n=a(g,N.enabledTools.length,t,N.customModelMap),r=Math.floor(n*.7),c=N.messageHistory.slice(0,-1),l=N.messageHistory[N.messageHistory.length-1],u=[],d=o([l]);for(let e=c.length-1;e>=0;e--){let t=c[e],n=o([t]);if(d+n<=r)u.unshift(t),d+=n;else break}if(u.length<c.length){let e=c.length-u.length,t=i(c.slice(0,e));t&&(s[0]={...s[0],content:s[0].content+`

`+t}),console.log(`[SidePanel] Token 预算裁剪: 保留 ${u.length} 条历史消息, 裁剪 ${e} 条 (预算: ${r} tokens)`)}else console.log(`[SidePanel] Token 预算内: ${u.length} 条历史消息 (预算: ${r} tokens)`);e=[...u,l],s=[...s,...e];for(let e=0;e<s.length-1;e++)s[e]={...s[e],content:ta(s[e].content)}}else{let e=ea(u);s.push({role:`user`,content:e})}let l=await pt();l._loadingId=h;let d=N.chatConfig.contextWindow||0,f=o(s),p=c(f,r(g,d,N.customModelMap));if(console.log(`[SidePanel] 发送上下文: ${f} tokens (消息: ${s.length} 条), 压力: ${p.level}(${Math.round(p.ratio*100)}%)`),p.level===`critical`){console.warn(`[SidePanel] 上下文压力过高，主动裁剪...`);let e=a(g,N.enabledTools.length,d,N.customModelMap),t=n(s,e,{generateSummary:!1});s=t.messages,console.warn(`[SidePanel] 已主动裁剪: ${f} → ${o(s)} tokens (${t.trimmedCount} 条)`)}let _,v,y,b=!1,x=!1,S=null,C=!0;try{let e=await Fa(s,g,N.useTools,l);_=e.content,v=e.executionLog||[],y=e.reflectionScore,b=e.wasRevised||!1,x=e.wasStreamed||!1,S=e.streamingHtml||null,C=e.streamingConnected===void 0?!0:e.streamingConnected}catch(e){if(N.activeSessionId!==m){e.message===`任务已被用户停止`?Qn(m,{role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}):Qn(m,{role:`assistant`,content:`❌ 请求失败：`+(e.message||`未知错误`),executionLog:e.executionLog||[]}),Q(h),N.substituteLoadingIds.delete(m);return}if(e.message===`任务已被用户停止`){Q(h),N.substituteLoadingIds.delete(m),X(`assistant`,`任务已取消`,!1,e.executionLog||[]),N.messageHistory.push({role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}),K();return}throw Q(h),N.substituteLoadingIds.delete(m),_=`❌ 请求失败：`+(e.message||`未知错误`),v=e.executionLog||[],X(`assistant`,_,!0,v,y),N.messageHistory.push({role:`assistant`,content:_,executionLog:v,reflectionScore:y}),e}if(N.activeSessionId!==m){let e={role:`assistant`,content:_,executionLog:v,reflectionScore:y,wasRevised:b};x&&S&&(e.htmlContent=S),Qn(m,e),Q(h),N.substituteLoadingIds.delete(m);return}x?N.substituteLoadingIds.has(m)&&(Q(N.substituteLoadingIds.get(m)),N.substituteLoadingIds.delete(m)):(Q(h),N.substituteLoadingIds.has(m)&&(Q(N.substituteLoadingIds.get(m)),N.substituteLoadingIds.delete(m)),await wn(X(`assistant`,_,!0,v,y,b)));let w={role:`assistant`,content:_,executionLog:v,reflectionScore:y,wasRevised:b};if(x&&S&&(w.htmlContent=S,!C)){Da(S);let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)}N.messageHistory.push(w)}catch(e){console.error(`[SidePanel] sendMessage 异常:`,e?.message||e)}finally{K(),N.generatingSessionIds.delete(m),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),e.focus(),N.attachedImages=[];let t=document.getElementById(`imagePreviewBar`);t&&(t.style.display=`none`)}}function ra(e,t){let n=document.getElementById(`userInput`);if(!t||N.isGenerating){console.log(`[SidePanel] triggerSelectionSearch 跳过:`,{hasText:!!t,isGenerating:N.isGenerating});return}let r=N.enableSelectionQuery;N.enableSelectionQuery=!0,N.selectedContextText=t,N.quotedContextText=``,n.value=`搜索一下`,n.dispatchEvent(new Event(`input`)),na(),N.enableSelectionQuery=!1,setTimeout(()=>{N.enableSelectionQuery=r},1500)}function ia(e){let t=document.getElementById(`userInput`);!t||!e||(t.value=e,t.dispatchEvent(new Event(`input`)),t.focus())}function aa(e,t=``){let n=document.getElementById(`userInput`);!n||!e||N.isGenerating||(t&&(N.enableSelectionQuery=!0,N.selectedContextText=t,N.quotedContextText=``),n.value=e,n.dispatchEvent(new Event(`input`)),n.focus(),na(),t&&(N.enableSelectionQuery=!1,setTimeout(()=>{N.enableSelectionQuery=!0},1500)))}function oa(e,t,n=!0){let r=document.getElementById(`chatContainer`),i=document.createElement(`div`);i.className=`user-context-bubble`,i.dataset.role=`context`,i.innerHTML=`
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${e===`quoted`?`💬`:`📌`}</span>
        <span class="context-type">${e===`quoted`?`引用内容`:`选中内容`}</span>
      </div>
      <div class="context-bubble-content">${I(t)}</div>
    </div>
  `;let a=i.querySelector(`.context-bubble-header`),o=i.querySelector(`.context-bubble-content`);return a.addEventListener(`click`,e=>{e.stopPropagation(),o.classList.toggle(`expanded`)}),r.appendChild(i),n&&(r.scrollTop=r.scrollHeight),i}function X(e,t,n=!0,r=[],i=null,a=!1){let o=document.getElementById(`chatContainer`),s=document.createElement(`div`);s.className=`message ${e}`;let c=new Date().toISOString();s.dataset.timestamp=c;let l=Array.isArray(t)?t.filter(e=>e.type===`text`).map(e=>e.text).join(``):t,u=Array.isArray(t)&&t.some(e=>e.type===`image_url`);if(s.dataset.rawContent=Array.isArray(t)?JSON.stringify(t):t,s.dataset.textContent_=l,s.dataset.executionLog=JSON.stringify(r),a&&(s.dataset.wasRevised=`true`),e===`assistant`){s.innerHTML=yn(t);let e=document.createElement(`div`);e.className=`message-footer`;let n=document.createElement(`button`);n.className=`copy-btn`,n.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),n.addEventListener(`click`,e=>{e.stopPropagation(),za(s,n)}),e.appendChild(n);let o=document.createElement(`button`);o.className=`quote-btn`,o.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),Ha(s)}),e.appendChild(o);let c=document.createElement(`div`);c.className=`export-menu-container`;let l=document.createElement(`button`);l.className=`export-trigger-btn`,l.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let u=document.createElement(`div`);u.className=`export-dropdown`,u.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),u.querySelector(`.export-docx-item`).addEventListener(`click`,e=>{e.stopPropagation(),Ba(s,l),u.classList.remove(`show`)}),u.querySelector(`.export-pdf-item`).addEventListener(`click`,e=>{e.stopPropagation(),Va(s,l),u.classList.remove(`show`)}),l.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.toggle(`show`)});let d=null;c.addEventListener(`mouseenter`,()=>{d=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.add(`show`)},300)}),c.addEventListener(`mouseleave`,()=>{d&&=(clearTimeout(d),null),setTimeout(()=>{!c.matches(`:hover`)&&!u.matches(`:hover`)&&u.classList.remove(`show`)},100)}),c.appendChild(l),c.appendChild(u),e.appendChild(c);let f=r&&r.length>0,p=i!=null,m=r?r.filter(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.status===`success`).length:0;da(),pa();let h=r?.find(e=>e.nodeType===`reflection`&&e.reflectionType===`post`);if(f&&N.chatConfig.enableExecutionLog){let t=document.createElement(`button`);t.className=`execution-log-btn`,t.type=`button`,t.title=`执行日志`,t.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),e.appendChild(t)}if(p&&N.chatConfig.enableExecutionLog){let t=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,n=i>=8?`✅`:i>=5?`🔍`:`⚠️`,r=a?` <span class="reflection-revised-tag">已修订</span>`:``,o=m>1?` (${m}轮)`:``,s=document.createElement(`button`);s.className=`reflection-score-btn`,s.type=`button`,s.title=`AI 质量评估: ${i}/10${o}${a?`（已修订）`:``}\n点击查看评估详情`,s.innerHTML=`<span class="reflection-badge ${t}">${n} ${i}/10${r}</span>`,s.dataset.reflectionData=JSON.stringify({overallScore:h?.overallScore??i,dimensions:h?.dimensions||null,issues:h?.issues||null,suggestions:h?.suggestions||null,decision:h?.action?.decision||null,useful:h?.useful??null,reasoning:h?.reasoning||null,suggestion:h?.suggestion||null,rounds:m,wasRevised:a}),e.appendChild(s)}else if(!p&&h&&h.status===`failed`&&N.chatConfig?.enableExecutionLog){let t=document.createElement(`button`);t.className=`reflection-score-btn`,t.type=`button`,t.title=`反思评估失败（点击查看执行日志）`,t.innerHTML=`<span class="reflection-badge score-low">⚠️ 反思失败</span>`,e.appendChild(t)}let g=r?.find(e=>e.nodeType===`tool_exec`&&e.action?.name===`preview_ui_prototype`&&e.status===`success`);if(g){let t=document.createElement(`button`);t.className=`prototype-btn-small`,t.type=`button`,t.title=`查看 UI 原型`,t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,t.addEventListener(`click`,()=>{let e=g.prototypeId;if(!e&&g.observation)try{e=(typeof g.observation==`string`?JSON.parse(g.observation):g.observation)?.prototypeId}catch{}e?Yt(e):console.error(`[SidePanel] 未找到 prototypeId，entry keys:`,Object.keys(g),`observation:`,g.observation)}),e.appendChild(t)}s.appendChild(e)}else{let e=l.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),n=l.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),r=e||n;if(r){let t=e?`quoted`:`selected`,n=r[1].trim(),i=r[2].trim();s._pendingContext={type:t,contextText:n,userQuestion:i},s.textContent=i}else s.textContent=l;if(u){let e=document.createElement(`div`);e.className=`user-message-images`,t.filter(e=>e.type===`image_url`).forEach((t,n)=>{let r=document.createElement(`img`);r.src=t.image_url.url,r.className=`user-message-image`,r.title=`点击查看大图`,r.addEventListener(`click`,()=>{Gi(t.image_url.url,r)}),e.appendChild(r)}),s.appendChild(e)}let i=document.createElement(`div`);i.className=`message-toolbar`;let a=document.createElement(`button`);a.className=`message-toolbar-btn copy-btn`,a.title=`复制内容`,a.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`].join(``),a.addEventListener(`click`,e=>{e.stopPropagation(),La(s,a)});let o=document.createElement(`button`);o.className=`message-toolbar-btn edit-btn`,o.title=`编辑后重新发送`,o.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>`,`</svg>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),Ra(s)}),i.appendChild(a),i.appendChild(o),s.appendChild(i)}if(o.appendChild(s),s._pendingContext){let{type:e,contextText:t}=s._pendingContext,n=oa(e,t,!1);o.insertBefore(n,s),delete s._pendingContext}if(n){let e=o.querySelectorAll(`.message.user`);if(e.length>0){let t=e[e.length-1],n=t.previousElementSibling;n&&n.classList.contains(`user-context-bubble`)?n.scrollIntoView({behavior:`smooth`,block:`start`}):t.scrollIntoView({behavior:`smooth`,block:`start`})}}return e===`assistant`&&Dn(),s}var sa=!1,ca=new Map,Z=null,la=0,ua=0;function da(){if(sa)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.execution-log-btn`);if(!t)return;let n=t.closest(`.message`);if(!n)return;e.preventDefault(),e.stopPropagation();let r=n.dataset.executionLog;if(r)try{let e=JSON.parse(r);console.log(`[chat-manager] 执行日志按钮点击(委托), entries:`,e.length),Ia(e)}catch(e){console.error(`[chat-manager] 解析 executionLog 失败:`,e)}}),sa=!0)}var fa=!1;function pa(){if(fa)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.reflection-score-btn`);if(!t)return;e.preventDefault(),e.stopPropagation();let n=t.dataset.reflectionData;if(n)try{ma(JSON.parse(n),t)}catch(e){console.error(`[chat-manager] 解析 reflectionData 失败:`,e)}}),fa=!0)}function ma(e,t){let n=document.querySelector(`.reflection-info-overlay`);n&&n.remove();let r=document.createElement(`div`);r.className=`reflection-info-overlay`;let{overallScore:i,dimensions:a,issues:o,suggestions:s,decision:c,useful:l,reasoning:u,suggestion:d,rounds:f,wasRevised:p}=e,m=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,h=i>=8?`✅`:i>=5?`🔍`:`⚠️`,g=c===`passed`?`✅ 通过`:c===`revised`?`🔧 已修订`:c===`needs_improvement`?`⚠️ 需改进`:``,_={accuracy:`准确性`,completeness:`完整性`,relevance:`相关性`,clarity:`清晰度`,usefulness:`实用性`,safety:`安全性`,efficiency:`效率`},v=``;a&&Object.keys(a).length>0&&(v=`
      <div class="ri-section">
        <div class="ri-section-title">📊 各维度评分</div>
        <div class="ri-dimensions">
          ${Object.entries(a).map(([e,t])=>{let n=_[e]||e,r=t>=8?`#10b981`:t>=5?`#f59e0b`:`#ef4444`;return`
              <div class="ri-dim-item">
                <span class="ri-dim-label">${I(n)}</span>
                <span class="ri-dim-bar-bg"><span class="ri-dim-bar-fill" style="width:${t*10}%;background:${r}"></span></span>
                <span class="ri-dim-score" style="color:${r}">${t}/10</span>
              </div>
            `}).join(``)}
        </div>
      </div>
    `);let y=``;o&&o.length>0&&(y=`
      <div class="ri-section">
        <div class="ri-section-title">📋 发现的问题</div>
        <ul class="ri-list">${o.map(e=>`<li>${I(e)}</li>`).join(``)}</ul>
      </div>
    `);let b=``;s&&s.length>0&&(b=`
      <div class="ri-section">
        <div class="ri-section-title">💡 改进建议</div>
        <ul class="ri-list">${s.map(e=>`<li>${I(e)}</li>`).join(``)}</ul>
      </div>
    `);let x=``;if(f>0||c||l!==null){let e=[];f>0&&e.push(`<span class="ri-tag">🔄 经过 ${f} 轮评估${p?`（已修订）`:``}</span>`),c&&e.push(`<span class="ri-tag">🎯 最终决策: ${g}</span>`),l!==null&&e.push(`<span class="ri-tag">${l?`✅ AI 认为结果有用`:`⚠️ AI 认为结果需要改进`}</span>`),u&&e.push(`<div class="ri-reasoning">📝 ${I(u)}</div>`),x=`
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
  `,document.body.appendChild(r),r.querySelector(`.ri-close`).addEventListener(`click`,()=>r.remove()),r.addEventListener(`click`,e=>{e.target===r&&r.remove()});let S=t.getBoundingClientRect(),C=r.querySelector(`.reflection-info-panel`),w=Math.min(window.innerHeight-40,560),T=S.right-380;T<10&&(T=10),T+380>window.innerWidth-10&&(T=window.innerWidth-380-10);let E=S.bottom+6;E+w>window.innerHeight-10&&(E=S.top-w-6),E<10&&(E=10),C.style.left=T+`px`,C.style.top=E+`px`,C.style.maxHeight=w+`px`}function ha(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)),n=t.length,r=``,i=null;return t.forEach((e,t)=>{let a=e.nodeType===`subtask`,o=e.nodeType===`tool_exec`,s=e.nodeType===`api_call`,c=e.nodeType===`preselect`,l=e.nodeType===`reflection`,u=o&&e.action?.name===`plan_task`;a&&(i=e.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&i!==null?(d=`tool-level`,f=`🔧`):s&&i!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=e.status||`processing`;e.status===`success`?p=`✓`:e.status===`failed`&&(p=`✗`),l&&(m=`reflection ${m}`);let h=I(e.nodeName||`未知节点`);if(e.subtaskIndex!==null&&e.subtaskIndex>=0&&(h=`<span class="subtask-badge">${e.subtaskIndex+1}</span> ${h}`),e.subtaskCount&&(h+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!c&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(h+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}r+=`
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
            <span class="node-name" title="${I(e.nodeName||`未知节点`)}">${h}</span>
            <span class="duration-badge" title="耗时">${ut(e.duration||0)}</span>
          </div>
          
          <div class="timeline-details">
            ${e.thought&&e.thought.trim()?`
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${I(e.thought)}</div>
            </div>
            `:``}
            
            ${!c&&e.action?`
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${I(e.action.name)}<br>
                <strong>参数:</strong> <code>${I(JSON.stringify(e.action.params,null,2))}</code>
              </div>
            </div>
            `:``}
            
            ${c&&e.action?.params?.selected?`
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${e.action.params.selected.map(e=>I(e)).join(`, `)}<br>
                <strong>数量:</strong> ${e.action.params.selected.length} 个
              </div>
            </div>
            `:``}
            
            ${e.observation?`
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${I(e.observation)}</div>
            </div>
            `:``}
            
            ${e.apiRequest?`
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${e.apiRequest.model?`<strong>模型:</strong> ${I(e.apiRequest.model)}<br>`:``}
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
                ${e.apiResponse.finishReason?`<strong>完成原因:</strong> ${I(e.apiResponse.finishReason)}<br>`:``}
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
              <div class="section-content">${I(e.error)}</div>
            </div>
            `:``}
            
            ${e.result?`
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${I(e.result)}</div>
            </div>
            `:``}
            
            ${l?`
            <div class="timeline-section reflection-details">
              ${e.prompt?`
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${I(e.prompt)}</pre></div>
              </div>
              `:``}
              ${e.rawContent?`
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${I(e.rawContent)}</pre></div>
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
              <div class="section-content"><ul>${e.issues.map(e=>`<li>${I(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${e.suggestions&&e.suggestions.length>0?`
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${e.suggestions.map(e=>`<li>${I(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${e.action?.decision?`
              <div class="section-title">🎯 决策: ${I(e.action.decision===`passed`?`✅ 通过`:e.action.decision===`revised`?`🔧 已修订`:e.action.decision===`needs_improvement`?`⚠️ 需改进`:e.action.decision)}</div>
              `:``}
              ${e.useful===void 0?``:`
              <div class="section-title">${e.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
              ${e.reasoning?`<div class="section-content">${I(e.reasoning)}</div>`:``}
              ${e.suggestion?`<div class="section-content">建议: ${I(e.suggestion)}</div>`:``}
              `}
            </div>
            `:``}
          </div>
        </div>
      </div>
    `}),r}function ga(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp));if(!t.some(e=>e.taskGroup))return ba(t);let n=new Map,r=[];t.forEach(e=>{e.taskGroup?(n.has(e.taskGroup)||n.set(e.taskGroup,{groupId:e.taskGroup,groupIndex:e.taskGroupIndex,groupName:e.taskGroupName,entries:[],status:e.status}),n.get(e.taskGroup).entries.push(e),e.status&&(n.get(e.taskGroup).status=e.status)):r.push(e)});let i=_a(r,t.length);return n.forEach((e,n)=>{let r=e.status||`processing`;i+=`
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
              <span class="task-group-name">${I(e.groupName)}</span>
              <span class="task-group-count">(${e.entries.length} 步骤)</span>
            </div>
          </div>
        </div>
        <div class="task-group-timeline">
          ${va(e.entries,t.length)}
        </div>
      </div>
    `}),i}function _a(e,t){if(e.length===0)return``;let n=``;return n+=`
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
  `,e.forEach((e,r)=>{n+=ya(e,r,t)}),n+=`
      </div>
    </div>
  `,n}function va(e,t){let n=``;return e.forEach((e,r)=>{n+=ya(e,r,t)}),n}function ya(e,t,n){let r=e.nodeType===`subtask`,i=e.nodeType===`tool_exec`,a=e.nodeType===`api_call`,o=e.nodeType===`preselect`,s=e.nodeType===`reflection`,c=i&&e.action?.name===`plan_task`,l=``,u=``;s?(l=`reflection-level`,u=`🎯`):o?u=`📡`:c?(l=`plan-task-level`,u=`📋`):r?(l=`subtask-level`,u=`🔀`):i?(l=`tool-level`,u=`🔧`):a?(l=`api-level`,u=`📡`):i?u=`⚡`:a&&(u=`📡`);let d=`○`,f=e.status||`processing`;e.status===`success`?d=`✓`:e.status===`failed`&&(d=`✗`),s&&(f=`reflection ${f}`);let p=I(e.nodeName||`未知节点`);if(e.subtaskCount&&(p+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(a||o)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!o&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(p+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}return`
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
          <span class="node-name" title="${I(e.nodeName||`未知节点`)}">${p}</span>
          <span class="duration-badge" title="耗时">${ut(e.duration)}</span>
        </div>
        
        <div class="timeline-details">
          ${e.thought&&e.thought.trim()?`
          <div class="timeline-section">
            <div class="section-title">💡 思考</div>
            <div class="section-content">${I(e.thought)}</div>
          </div>
          `:``}
          
          ${!o&&e.action?`
          <div class="timeline-section">
            <div class="section-title">⚡ 工具调用</div>
            <div class="section-content">
              <strong>工具:</strong> ${I(e.action.name)}<br>
              <strong>参数:</strong> <code>${I(JSON.stringify(e.action.params,null,2))}</code>
            </div>
          </div>
          `:``}
          
          ${o&&e.action?.params?.selected?`
          <div class="timeline-section">
            <div class="section-title">🔍 筛选结果</div>
            <div class="section-content">
              <strong>选中工具:</strong> ${e.action.params.selected.map(e=>I(e)).join(`, `)}<br>
              <strong>数量:</strong> ${e.action.params.selected.length} 个
            </div>
          </div>
          `:``}
          
          ${e.observation?`
          <div class="timeline-section">
            <div class="section-title">📝 观察结果</div>
            <div class="section-content">${I(e.observation)}</div>
          </div>
          `:``}
          
          ${e.apiRequest?`
          <div class="timeline-section">
            <div class="section-title">📡 API 请求</div>
            <div class="section-content">
              ${e.apiRequest.model?`<strong>模型:</strong> ${I(e.apiRequest.model)}<br>`:``}
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
              ${e.apiResponse.finishReason?`<strong>完成原因:</strong> ${I(e.apiResponse.finishReason)}<br>`:``}
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
            <div class="section-content">${I(e.error)}</div>
          </div>
          `:``}
          
          ${e.result?`
          <div class="timeline-section">
            <div class="section-title">✅ 子任务结果</div>
            <div class="section-content">${I(e.result)}</div>
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
            <div class="section-content"><ul>${e.issues.map(e=>`<li>${I(e)}</li>`).join(``)}</ul></div>
            `:``}
            ${e.suggestions&&e.suggestions.length>0?`
            <div class="section-title">💡 改进建议</div>
            <div class="section-content"><ul>${e.suggestions.map(e=>`<li>${I(e)}</li>`).join(``)}</ul></div>
            `:``}
            ${e.action?.decision?`
            <div class="section-title">🎯 决策: ${I(e.action.decision===`passed`?`✅ 通过`:e.action.decision===`revised`?`🔧 已修订`:e.action.decision===`needs_improvement`?`⚠️ 需改进`:e.action.decision)}</div>
            `:``}
            ${e.useful===void 0?``:`
            <div class="section-title">${e.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
            ${e.reasoning?`<div class="section-content">${I(e.reasoning)}</div>`:``}
            ${e.suggestion?`<div class="section-content">建议: ${I(e.suggestion)}</div>`:``}
            `}
          </div>
          `:``}
        </div>
      </div>
    </div>
  `}function ba(e){let t=``,n=null;return e.forEach((r,i)=>{let a=r.nodeType===`subtask`,o=r.nodeType===`tool_exec`,s=r.nodeType===`api_call`,c=r.nodeType===`preselect`,l=r.nodeType===`reflection`,u=o&&r.action?.name===`plan_task`;a&&(n=r.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&n!==null?(d=`tool-level`,f=`🔧`):s&&n!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=r.status||`processing`;r.status===`success`?p=`✓`:r.status===`failed`&&(p=`✗`);let h=I(r.nodeName||`未知节点`);if(r.subtaskId&&(h=`<span class="subtask-badge">${n===null?``:n+1}</span> ${h}`),r.subtaskCount&&(h+=` <span class="plan-badge">(${r.subtaskCount}个子任务, ${r.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&r.apiRequest){let e=[];r.apiRequest.messageCount!==void 0&&r.apiRequest.messageCount!==null&&e.push(`💬<span title="本次模型API调用携带的消息数">${r.apiRequest.messageCount}条</span>`),!c&&r.apiRequest.toolCount!==void 0&&r.apiRequest.toolCount!==null&&e.push(`🔧<span title="本次模型API调用携带的工具定义数">${r.apiRequest.toolCount}个</span>`),e.length>0&&(h+=` <span class="api-info-badge">（${e.join(` `)}）</span>`)}t+=`
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
            <span class="node-name" title="${I(r.nodeName||`未知节点`)}">${h}</span>
            <span class="duration-badge" title="耗时">${ut(r.duration)}</span>
          </div>
          
          <div class="timeline-details">
            ${r.thought&&r.thought.trim()?`
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${I(r.thought)}</div>
            </div>
            `:``}
            
            ${!c&&r.action?`
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${I(r.action.name)}<br>
                <strong>参数:</strong> <code>${I(JSON.stringify(r.action.params,null,2))}</code>
              </div>
            </div>
            `:``}
            
            ${c&&r.action?.params?.selected?`
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${r.action.params.selected.map(e=>I(e)).join(`, `)}<br>
                <strong>数量:</strong> ${r.action.params.selected.length} 个
              </div>
            </div>
            `:``}
            
            ${r.observation?`
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${I(r.observation)}</div>
            </div>
            `:``}
            
            ${r.apiRequest?`
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${r.apiRequest.model?`<strong>模型:</strong> ${I(r.apiRequest.model)}<br>`:``}
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
                ${r.apiResponse.finishReason?`<strong>完成原因:</strong> ${I(r.apiResponse.finishReason)}<br>`:``}
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
              <div class="section-content">${I(r.error)}</div>
            </div>
            `:``}
            
            ${r.result?`
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${I(r.result)}</div>
            </div>
            `:``}
            
            ${l?`
            <div class="timeline-section reflection-details">
              ${r.prompt?`
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${I(r.prompt)}</pre></div>
              </div>
              `:``}
              ${r.rawContent?`
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${I(r.rawContent)}</pre></div>
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
              <div class="section-content"><ul>${r.issues.map(e=>`<li>${I(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${r.suggestions&&r.suggestions.length>0?`
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${r.suggestions.map(e=>`<li>${I(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${r.action?.decision?`
              <div class="section-title">🎯 决策: ${I(r.action.decision===`passed`?`✅ 通过`:r.action.decision===`revised`?`🔧 已修订`:r.action.decision===`needs_improvement`?`⚠️ 需改进`:r.action.decision)}</div>
              `:``}
              ${r.useful===void 0?``:`
              <div class="section-title">${r.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
              ${r.reasoning?`<div class="section-content">${I(r.reasoning)}</div>`:``}
              ${r.suggestion?`<div class="section-content">建议: ${I(r.suggestion)}</div>`:``}
              `}
            </div>
            `:``}
          </div>
        </div>
      </div>
    `}),t}function xa(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(!t)return;let n=t.querySelector(`.realtime-executing-node`);n&&(n.textContent=e.nodeName||`处理中...`);let r=e.executionLog||[],i=r.length,a=r.filter(e=>e.status===`success`).length,o=r.filter(e=>e.status===`failed`).length,s=r.filter(e=>e.nodeType===`subtask`).length,c=r.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,l=t.querySelector(`.combo-value`),u=t.querySelector(`.combo-stat.success .stat-value`),d=t.querySelector(`.combo-stat.failed .stat-value`),f=t.querySelector(`.combo-stat.subtask`);l&&(l.textContent=i),u&&(u.textContent=a),d&&(d.textContent=o),f&&(s>0?(f.style.display=``,f.querySelector(`.stat-value`).textContent=`${c}/${s}`):f.style.display=`none`);let p=t.querySelector(`.timeline`);p.innerHTML=r.length>0?ha(r):`<div class="realtime-waiting-message">等待执行中...</div>`,p.scrollTop=p.scrollHeight}function Sa(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel realtime-mode`,n.innerHTML=`
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
  `,document.body.appendChild(n),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()}),n.addEventListener(`click`,e=>{e.target===n&&n.remove()});let r=n.querySelector(`.toggle-expand-btn`),i=!1;r.addEventListener(`click`,()=>{i=!i,n.querySelectorAll(`.timeline-content`).forEach(e=>{i?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=r.querySelector(`svg`);i?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,r.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,r.setAttribute(`title`,`展开全部节点`))}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.timeline-header`);t&&t.parentElement.classList.toggle(`expanded`)}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.combo-stat[data-status]`);if(!t)return;let r=t.dataset.status,i=t.classList.contains(`active`);n.querySelectorAll(`.combo-stat[data-status]`).forEach(e=>{e.classList.remove(`active`)});let a=n.querySelectorAll(`.timeline-item`);i?a.forEach(e=>{e.style.display=``}):(t.classList.add(`active`),a.forEach(e=>{if(r===`subtask`)e.dataset.nodeType===`subtask`?e.style.display=``:e.style.display=`none`;else{let t=e.querySelector(`.timeline-dot`);t&&t.classList.contains(r)?e.style.display=``:e.style.display=`none`}}))}),N.currentExecutionStatus&&xa(N.currentExecutionStatus)}function Ca(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(t){t.remove();return}Sa(e)}function wa(e,t,n,r){let i=document.getElementById(e);if(!i)return;console.log(`[SidePanel] updateExecutionStatus 被调用:`,t,n,`日志数量:`,r?.length);let a=i.querySelector(`.current-node-name`);a&&(a.textContent=t||`处理中...`,a.title=t||``),N.currentExecutionStatus?(N.currentExecutionStatus.executionLog||(N.currentExecutionStatus.executionLog=[]),r&&r.length>0&&r.forEach(e=>{let t=N.currentExecutionStatus.executionLog.findIndex(t=>t.id===e.id);if(t!==-1){let n=N.currentExecutionStatus.executionLog[t];N.currentExecutionStatus.executionLog[t]={...e,subtaskIndex:e.subtaskIndex??n.subtaskIndex,subtaskId:e.subtaskId??n.subtaskId,subtaskName:e.subtaskName??n.subtaskName}}else N.currentExecutionStatus.executionLog.push(e)}),N.currentExecutionStatus.nodeName=t,N.currentExecutionStatus.status=n):N.currentExecutionStatus={nodeName:t,status:n,executionLog:[]},document.querySelector(`.execution-log-panel.realtime-mode`)&&xa(N.currentExecutionStatus)}function Ta(){let e=document.getElementById(`chatContainer`),t=`loading-`+Date.now(),n=document.createElement(`div`);n.className=`loading-message`,n.id=t,n.innerHTML=`
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
  `,e.appendChild(n),requestAnimationFrame(()=>{e.scrollTop=e.scrollHeight});let r=n.querySelector(`.stop-task-btn`),i=n.querySelector(`.loading-text`);r&&r.addEventListener(`click`,e=>{e.stopPropagation(),r.disabled=!0,r.style.opacity=`0.6`,r.style.cursor=`not-allowed`,i&&(i.textContent=`停止中...`),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:null,sessionId:N.activeSessionId}),N.pendingCancelApi&&N.pendingCancelApi({message:`任务已被用户停止`,executionLog:N.currentExecutionStatus?.executionLog||[]})});let a=N.activeSessionId;if(N.executionLogListener=(e,n,r)=>e.sessionId&&e.sessionId!==a?!1:e.type===`EXECUTION_STATUS_UPDATE`?(console.log(`[SidePanel] 收到执行状态更新:`,e.nodeName,e.status,`日志数量:`,e.executionLog?.length),wa(t,e.nodeName,e.status,e.executionLog),!1):!1,chrome.runtime.onMessage.addListener(N.executionLogListener),N.chatConfig.enableExecutionLog){let e=n.querySelector(`.execution-status-container`);e&&(e.style.display=`flex`)}let o=n.querySelector(`.execution-log-toggle-btn`);return o&&o.addEventListener(`click`,e=>{e.stopPropagation(),Ca(t)}),t}function Q(e){let t=document.getElementById(e);if(t){let e=t.querySelector(`.loading-text`);e&&(e.textContent=`思考中...`),t.remove()}N.executionLogListener&&=(chrome.runtime.onMessage.removeListener(N.executionLogListener),null),N.currentExecutionStatus=null;let n=document.querySelector(`.execution-log-panel.realtime-mode`);n&&n.remove()}function Ea(){let e=document.getElementById(`chatContainer`),t=document.createElement(`div`);t.className=`message-wrapper assistant streaming`,t.innerHTML=`
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
        <button class="streaming-stop-btn" title="停止生成">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
        </button>
      </div>
      <div class="stream-content"></div>
      <div class="stream-status hidden"></div>
    </div>
  `,e.appendChild(t),requestAnimationFrame(()=>{e.scrollTop=e.scrollHeight});let n=t.querySelector(`.streaming-stop-btn`);return n&&n.addEventListener(`click`,e=>{e.stopPropagation(),Na(n)}),t}function Da(e){let t=document.getElementById(`chatContainer`);if(!t||!e)return;let n=document.createElement(`div`);n.innerHTML=e;let r=n.firstElementChild;if(!r)return;r.classList.remove(`streaming`);let i=r.querySelector(`.thinking-process-header`);if(i){let e=i.closest(`.thinking-process`);i.addEventListener(`click`,()=>{e.classList.toggle(`collapsed`)})}r.querySelectorAll(`.tool-call-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.closest(`.tool-call-item`).classList.toggle(`expanded`)})});let a=r.querySelector(`.message-footer`);if(a){let e=a.querySelector(`.copy-btn`);e&&e.addEventListener(`click`,t=>{t.stopPropagation(),za(r,e)});let t=a.querySelector(`.quote-btn`);t&&t.addEventListener(`click`,e=>{e.stopPropagation(),Ha(r)});let n=a.querySelector(`.export-trigger-btn`),i=a.querySelector(`.export-dropdown`);n&&i&&(n.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==i&&e.classList.remove(`show`)}),i.classList.toggle(`show`)}),i.querySelector(`.export-docx-item`)?.addEventListener(`click`,e=>{e.stopPropagation(),Ba(r,n),i.classList.remove(`show`)}),i.querySelector(`.export-pdf-item`)?.addEventListener(`click`,e=>{e.stopPropagation(),Va(r,n),i.classList.remove(`show`)}))}da(),pa(),t.appendChild(r)}function Oa(e,t){let n=e.querySelector(`.stream-content`);if(!n)return;let r=n.querySelector(`.thinking-indicator:not(.hidden)`)||e.querySelector(`.thinking-indicator:not(.hidden)`);if(r){r.classList.add(`hidden`),n.contains(r)||r.remove();let e=la>0?((Date.now()-la)/1e3).toFixed(1)+`s`:``,t=document.createElement(`span`);t.className=`thinking-badge`,t.innerHTML=`<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果${e?` <span class="thinking-duration">`+e+`</span>`:``}`,n.appendChild(t)}let i=n.querySelectorAll(`.thinking-badge`);if(i.length>0){let e=i[i.length-1],n=e.nextElementSibling;if(n&&n.classList.contains(`thinking-content`))n.innerHTML=yn(t);else{let n=document.createElement(`div`);n.className=`thinking-content`,n.innerHTML=yn(t),e.after(n)}}else n.innerHTML=yn(t);requestAnimationFrame(()=>{chatContainer.scrollTop=chatContainer.scrollHeight})}function ka(e,t){if(!e||!t?.length)return;let n=e.querySelector(`.thinking-indicator`);n&&n.classList.add(`hidden`);let r=e.querySelector(`.stream-content`);if(!r)return;let i={execute_command:{metaType:`exec`},execute_agent_exec_command:{metaType:`exec`},agent_read_file:{metaType:`file`,action:`读取`},agent_write_file:{metaType:`file`,action:`写入`},file_upload:{metaType:`file`,action:`上传`},download_file:{metaType:`file`,action:`下载`},fetch_url:{metaType:`web`,action:`请求`},click_element:{metaType:`web`,action:`点击`},fill_form:{metaType:`web`,action:`填写`},open_tab:{metaType:`web`,action:`打开`},search_bookmarks:{metaType:`search`},search_history:{metaType:`search`},search_in_page:{metaType:`search`}};t.forEach(e=>{let t=e.function?.name||`unknown`,n=i[t]||{metaType:`other`},a;try{a=JSON.parse(e.function?.arguments||`{}`)}catch{a={raw:e.function?.arguments||``}}let o=JSON.stringify(a,null,2),s=``;if(n.metaType===`exec`)s=`<code class="tool-call-cmd">$ ${I(a.command||a.cmd||JSON.stringify(a))}</code>`;else if(n.metaType===`file`){let e=a.file_path||a.filePath||a.path||a.filename||a.fileName||a.url||``;s=`<span class="tool-call-file">${n.action===`读取`?`📖`:n.action===`写入`?`📝`:n.action===`上传`?`📤`:`📥`} ${I(e)||I(t)}</span>`}else if(n.metaType===`web`){let e=a.url||a.href||a.selector||``;s=`<span class="tool-call-web">${I(n.action)}: ${I(e)||I(JSON.stringify(a).substring(0,80))}</span>`}else if(n.metaType===`search`)s=`<span class="tool-call-search">🔍 ${I(a.query||a.keyword||a.text||``)||I(t)}</span>`;else{let e=Object.keys(a);s=e.length===0?`<span>${I(t)}</span>`:e.length===1?`<span>${I(e[0])}: ${I(JSON.stringify(a[e[0]]).substring(0,80))}</span>`:`<span>${e.slice(0,2).map(e=>`${I(e)}=${I(JSON.stringify(a[e]).substring(0,30))}`).join(`, `)}${e.length>2?` ...`:``}</span>`}let c=n.metaType===`exec`?`<svg class="tool-call-icon exec" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
         </svg>`:n.metaType===`file`?`<svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
         </svg>`:`<svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
         </svg>`,l=document.createElement(`div`);l.className=`tool-call-item`,l.setAttribute(`data-tool-call-id`,e.id||``),l.innerHTML=`
      <div class="tool-call-header">
        ${c}
        <span class="tool-call-name">${I(t)}</span>
        <div class="tool-call-summary">${s}</div>
        <svg class="tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="tool-call-body">
        <pre><code>${I(o)}</code></pre>
      </div>
    `,l.querySelector(`.tool-call-header`).addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),r.appendChild(l)}),requestAnimationFrame(()=>{let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)})}function Aa(e,t){if(!e?.toolCallId)return;let n=t;if(!n)return;let r=n.querySelector(`.tool-call-item[data-tool-call-id="${e.toolCallId}"]`);if(!r)return;let i=r.querySelector(`.tool-call-result`);i&&i.remove();let a=e.truncated?`<span class="tool-result-truncated" title="原始结果过大，已截断显示">(输出过长已截断)</span>`:``,o=e.content||(e.success?`(无输出)`:`执行失败`),s=o.length>500?o.substring(0,500)+`
... (点击展开查看完整输出)`:o,c=o,l=document.createElement(`div`);if(l.className=`tool-call-result`,l.innerHTML=`
    <div class="tool-result-header">
      <span class="tool-result-status ${e.success?`success`:`fail`}">
        ${e.success,``}${e.success?`成功`:`失败`}
      </span>
      ${e.duration?`<span class="tool-result-duration">${e.duration}ms</span>`:``}
      ${a}
    </div>
    <div class="tool-result-content">
      <pre><code>${I(s)}</code></pre>
    </div>
  `,r.appendChild(l),c.length>500){let e=l.querySelector(`code`),t=!1;l.style.cursor=`pointer`,l.addEventListener(`click`,()=>{t=!t,e.textContent=t?c:s})}requestAnimationFrame(()=>{let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)})}function ja(e){let t=document.createElement(`div`);t.className=`tool-call-item expanded preselect-card`;let n=e.status===`failed`,r=n?`失败`:`完成`,i=n?`fail`:`success`,a=``;if(e.action?.params?.selected){let t=e.action.params.selected;a=`<span class="preselect-summary">从 ${e.apiRequest?.toolCount||`?`} 个工具中筛选出 <strong>${t.length}</strong> 个：${t.map(e=>`<code>${I(e)}</code>`).join(`、`)}</span>`}else e.action?.name===`all_tools`?a=`<span class="preselect-summary">跳过筛选（${I(e.action.params.reason||``)}），使用全部工具</span>`:e.action?.name===`skip`?a=`<span class="preselect-summary">跳过筛选（${I(e.action.params.reason||``)}），工具总数 ${e.action.params.toolCount||`?`}</span>`:e.error?a=`<span class="preselect-summary" style="color:#dc2626;">${I(e.error)}</span>`:e.thought&&(a=`<span class="preselect-summary">模型直接回答：${I(e.thought).substring(0,200)}</span>`);let o=e.duration?`${e.duration}ms`:``;return t.innerHTML=`
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
  `,t.querySelector(`.tool-call-header`).addEventListener(`click`,()=>{t.classList.toggle(`expanded`)}),t}function Ma(e,t,n=[],r=null,i=null){if(!e)return;e.querySelectorAll(`.thinking-indicator`).forEach(e=>e.classList.add(`hidden`));let a=e.querySelector(`.stream-status`);a&&a.remove(),e.classList.remove(`streaming`);let o=e.querySelector(`.message-content`),s=e.querySelector(`.stream-content`);if(o&&o.querySelector(`.tool-call-item`)||s&&s.querySelector(`.tool-call-item`)){let e=ua>0?((Date.now()-ua)/1e3).toFixed(1)+`s`:``,r=document.createElement(`div`);r.className=`thinking-process collapsed`;let i=document.createElement(`div`);i.className=`thinking-process-header`,i.innerHTML=`
      <svg class="thinking-process-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
        <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
      </svg>
      <span class="thinking-process-title">思考过程</span>
      <span class="thinking-process-duration">${e}</span>
      <svg class="thinking-process-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    `;let a=document.createElement(`div`);a.className=`thinking-process-body`;let c=document.createElement(`div`);if(c.className=`thinking-process-content`,a.appendChild(c),s)for(;s.firstChild;)c.appendChild(s.firstChild);o.querySelectorAll(`.tool-call-item`).forEach(e=>c.appendChild(e)),c.querySelectorAll(`.preselect-card`).forEach(e=>e.remove());let l=(n||[]).filter(e=>e.nodeType===`preselect`);console.log(`[finalizeStreamingMessage] executionLog length:`,(n||[]).length,`preselectEntries:`,l.length),l.forEach(e=>{console.log(`[finalizeStreamingMessage] creating preselect card for entry:`,e);let t=ja(e);c.insertBefore(t,c.firstChild)});let u=c.querySelectorAll(`.thinking-badge`),d=c.querySelectorAll(`.thinking-content`);u.length>0&&u[u.length-1].remove(),d.length>0&&d[d.length-1].remove(),r.appendChild(i),r.appendChild(a);let f=document.createElement(`div`);f.className=`final-answer`;let p=Si(t);p&&p.trim()&&(f.innerHTML=yn(p));let m=o.querySelector(`.thinking-indicator`);m&&m.remove(),o.appendChild(r),o.appendChild(f),i.addEventListener(`click`,()=>{r.classList.toggle(`collapsed`)})}else if(s){let e=Si(t);!s.querySelector(`.thinking-content`)&&e&&e.trim()&&(s.innerHTML=yn(e))}e.classList.add(`assistant`,`message`),e.dataset.rawContent=typeof t==`string`?t:JSON.stringify(t),e.dataset.textContent_=Si(t),e.dataset.executionLog=JSON.stringify(n);let c=document.createElement(`div`);c.className=`message-footer`;let l=document.createElement(`button`);l.className=`copy-btn`,l.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),l.addEventListener(`click`,t=>{t.stopPropagation(),za(e,l)}),c.appendChild(l);let u=document.createElement(`button`);u.className=`quote-btn`,u.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),u.addEventListener(`click`,t=>{t.stopPropagation(),Ha(e)}),c.appendChild(u);let d=document.createElement(`div`);d.className=`export-menu-container`;let f=document.createElement(`button`);f.className=`export-trigger-btn`,f.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let p=document.createElement(`div`);p.className=`export-dropdown`,p.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),p.querySelector(`.export-docx-item`).addEventListener(`click`,t=>{t.stopPropagation(),Ba(e,f),p.classList.remove(`show`)}),p.querySelector(`.export-pdf-item`).addEventListener(`click`,t=>{t.stopPropagation(),Va(e,f),p.classList.remove(`show`)}),f.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==p&&e.classList.remove(`show`)}),p.classList.toggle(`show`)});let m=null;if(d.addEventListener(`mouseenter`,()=>{m=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==p&&e.classList.remove(`show`)}),p.classList.add(`show`)},300)}),d.addEventListener(`mouseleave`,()=>{m&&=(clearTimeout(m),null),setTimeout(()=>{!d.matches(`:hover`)&&!p.matches(`:hover`)&&p.classList.remove(`show`)},100)}),d.appendChild(f),d.appendChild(p),c.appendChild(d),n&&n.length>0&&N.chatConfig?.enableExecutionLog){let e=document.createElement(`button`);e.className=`execution-log-btn`,e.type=`button`,e.title=`执行日志`,e.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),c.appendChild(e)}let h=r!=null,g=n?n.filter(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.status===`success`).length:0,_=n?.find(e=>e.nodeType===`reflection`&&e.reflectionType===`post`);if(h&&N.chatConfig?.enableExecutionLog){let e=r>=8?`score-high`:r>=5?`score-mid`:`score-low`,t=r>=8?`✅`:r>=5?`🔍`:`⚠️`,n=g>1?` (${g}轮)`:``,i=document.createElement(`button`);i.className=`reflection-score-btn`,i.type=`button`,i.title=`AI 质量评估: ${r}/10${n}\n点击查看评估详情`,i.innerHTML=`<span class="reflection-badge ${e}">${t} ${r}/10</span>`,i.dataset.reflectionData=JSON.stringify({overallScore:_?.overallScore??r,dimensions:_?.dimensions||null,issues:_?.issues||null,suggestions:_?.suggestions||null,decision:_?.action?.decision||null,useful:_?.useful??null,reasoning:_?.reasoning||null,suggestion:_?.suggestion||null,rounds:g,wasRevised:!1}),c.appendChild(i)}else if(!h&&_&&_.status===`failed`&&N.chatConfig?.enableExecutionLog){let e=document.createElement(`button`);e.className=`reflection-score-btn`,e.type=`button`,e.title=`反思评估失败（点击查看执行日志）`,e.innerHTML=`<span class="reflection-badge score-low">⚠️ 反思失败</span>`,c.appendChild(e)}e.querySelector(`.message-content`).appendChild(c),da(),pa(),Dn(),wn(e),e.dataset.htmlContent=e.outerHTML}function Na(e){if(!e||e.disabled)return;e.disabled=!0,e.style.opacity=`0.4`,e.style.cursor=`not-allowed`;let t=document.querySelector(`.loading-message .stop-task-btn`);if(t){t.disabled=!0,t.style.opacity=`0.6`,t.style.cursor=`not-allowed`;let e=document.querySelector(`.loading-message .loading-text`);e&&(e.textContent=`停止中...`)}chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:null,sessionId:N.activeSessionId}),N.pendingCancelApi&&N.pendingCancelApi({message:`任务已被用户停止`,executionLog:N.currentExecutionStatus?.executionLog||[]})}function Pa(e){if(!e)return;e.querySelectorAll(`.thinking-indicator`).forEach(e=>e.classList.add(`hidden`));let t=e.querySelector(`.stream-status`);t&&(t.textContent=`已取消`),e.classList.remove(`streaming`),e.classList.add(`stream-cancelled`)}async function Fa(e,t,n=!1,r={}){let i=(await _t()).loopTimeout,a=N.activeSessionId,o=e=>e===void 0?ca.get(a)||null:(ca.set(a,e),e),s=chrome.runtime.connect({name:`keepalive-`+a});console.log(`[SidePanel] keepalive 端口已连接, sessionId:`,a);let c={restarted:!1,rejectFn:null,cleanup:null};s.onMessage.addListener(e=>{e.type===`SW_RESTARTED`&&e.sessionId===a&&(console.warn(`[SidePanel] ⚠️ 收到 SW_RESTARTED 通知，后台已重启，API 调用已丢失`),c.restarted=!0,c.rejectFn&&c.cleanup&&(c.cleanup(),c.rejectFn({message:`后台服务异常重启，API 调用已中断，请重试`,executionLog:[]})))});let l={timeoutId:null,removeListener:()=>{}},u=()=>{try{s.disconnect()}catch{}l.timeoutId&&=(clearTimeout(l.timeoutId),null),l.removeListener(),N.pendingCancelApiMap.delete(a),N.pendingCallApiSessionIds.delete(a),ca.delete(a),bi()};return new Promise((s,d)=>{if(c.cleanup=u,c.rejectFn=d,c.restarted){u(),d({message:`后台服务异常重启，API 调用已中断，请重试`,executionLog:[]});return}let f=[],p=Math.round(i/1e3);o(null),Z=null,ua=0;let m=``,h={},g=e=>{o()&&Pa(o()),u(),(!e.executionLog||e.executionLog.length===0||f.length>0)&&(e.executionLog=f),d(e)};N.pendingCancelApi=g,N.pendingCallApiSessionIds.add(a),bi(),console.log(`[SidePanel] callApi: 添加 pendingCallApiSessionIds, mySessionId =`,a,`, set:`,[...N.pendingCallApiSessionIds]),l.timeoutId=setTimeout(()=>{g({message:`请求超时（${p}秒）`,executionLog:f}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:N.currentTabId,sessionId:N.activeSessionId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},i);let _=Date.now(),v=0,y=null,b=()=>{y===null&&l.timeoutId!==null&&(y=Date.now(),clearTimeout(l.timeoutId),l.timeoutId=null,console.log(`[SidePanel] 前端超时已暂停（澄清工具执行中）`))},x=()=>{if(y!==null){let e=Date.now()-y;v+=e,y=null;let t=Date.now()-_,n=i+v-t;if(n<=0){g({message:`请求超时（${p}秒）`,executionLog:f});return}l.timeoutId=setTimeout(()=>{g({message:`请求超时（${p}秒）`,executionLog:f}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:N.currentTabId,sessionId:a}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},n),console.log(`[SidePanel] 前端超时已恢复，暂停时长:`,Math.round(e/1e3),`s，剩余时间:`,Math.round(n/1e3),`s`)}},S=e=>{if(console.log(`[SidePanel] 收到消息:`,e),e.sessionId&&e.sessionId!==a)return!1;if(e.type===`EXECUTION_STATUS_UPDATE`)return f=e.executionLog||[],!1;if(e.type===`CLARIFY_START`)return b(),!1;if(e.type===`CLARIFY_END`)return x(),!1;if(e.type===`STREAM_PRESELECT`){if(console.log(`[SidePanel] 收到预筛选日志，条数:`,e.preselectLog?.length),Z=e.preselectLog||null,o()&&Z&&Z.length>0){let e=o().querySelector(`.message-content`);e&&(Z.forEach(t=>{let n=ja(t);e.insertBefore(n,e.firstChild)}),Z=null,console.log(`[SidePanel] 预筛选卡片已追加到已有流式元素`))}return!1}if(e.type===`STREAM_START`){console.log(`[SidePanel] 流式输出开始`);let e=r._loadingId,t=e?document.getElementById(e):document.querySelector(`.loading-message`);if(t&&t.remove(),N.executionLogListener&&=(chrome.runtime.onMessage.removeListener(N.executionLogListener),null),N.currentExecutionStatus=null,o()){let e=o().querySelector(`.stream-content`);if(e){let t=document.createElement(`div`);t.className=`thinking-indicator`,t.innerHTML=`
              <svg class="thinking-icon pulse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
                <circle cx="8" cy="12" r="1.5"/>
                <circle cx="16" cy="12" r="1.5"/>
              </svg>
              <div class="thinking-dots"><span></span><span></span><span></span></div>
              <span class="thinking-label">思考中...</span>
              <button class="streaming-stop-btn" title="停止生成">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                </svg>
              </button>
            `;let n=t.querySelector(`.streaming-stop-btn`);n&&n.addEventListener(`click`,e=>{e.stopPropagation(),Na(n)}),e.appendChild(t)}}else if(o(Ea()),ua=Date.now(),Z&&Z.length>0){let e=o().querySelector(`.message-content`);Z.forEach(t=>{let n=ja(t);e.insertBefore(n,e.firstChild)}),Z=null}return m=``,la=Date.now(),!1}if(e.type===`STREAM_CHUNK`)return o()&&(m+=e.delta,Oa(o(),m)),!1;if(e.type===`STREAM_TOOL_CALL`)return o()&&e.toolCalls?.length>0&&ka(o(),e.toolCalls),!1;if(e.type===`STREAM_TOOL_RESULT`)return o()&&e.result&&Aa(e.result,o()),!1;if(e.type===`AGENT_STREAM`){if(o()&&e.execId){let t=h[e.execId];if(!t){let n=document.createElement(`div`);n.className=`agent-stream-output`,n.innerHTML=`
              <div class="agent-stream-header">
                <span class="agent-stream-icon">🖥️</span>
                <span class="agent-stream-label">命令输出</span>
              </div>
              <pre class="agent-stream-content"><code></code></pre>
            `;let r=o().querySelector(`.stream-content`);r&&r.appendChild(n),t={element:n,stdout:``,stderr:``},h[e.execId]=t}let n=t.element.querySelector(`code`);n&&(e.streamType===`stderr`?t.stderr+=e.data:t.stdout+=e.data,n.textContent=t.stdout+(t.stderr?`
`+t.stderr:``),n.parentElement.scrollTop=n.parentElement.scrollHeight)}return!1}if(e.type===`AGENT_STREAM_DONE`){if(e.execId){let t=h[e.execId];if(t){let n=t.element.querySelector(`.agent-stream-label`);n&&(n.textContent=`命令输出 - ${e.exitCode===0?`完成`:`退出 (code: ${e.exitCode})`}`),e.exitCode!==0&&t.element.classList.add(`agent-stream-error`)}}return!1}if(e.type===`STREAM_DONE`){if(o()){let e=o().querySelector(`.stream-status`);e&&(e.textContent=`质量评估中...`)}return!1}if(e.type===`API_COMPLETE`){o()&&e.content&&Ma(o(),e.content,e.executionLog||[],e.reflectionScore,e.reasoningContent);let t=o(),n=!!t,r=t?t.dataset.htmlContent||t.outerHTML:null,i=t?t.isConnected:!1;return u(),s({content:e.content,executionLog:e.executionLog||f,reflectionScore:e.reflectionScore,wasStreamed:n,wasRevised:e.wasRevised,streamingHtml:r,streamingConnected:i}),!1}else if(e.type===`API_ERROR`)return u(),d({message:e.error,executionLog:e.executionLog||f}),!1;return!1};chrome.runtime.onMessage.addListener(S),l.removeListener=()=>{chrome.runtime.onMessage.removeListener(S)},console.log(`[SidePanel] 发送 CALL_API 消息，useTools:`,n,`tabId:`,N.currentTabId,`sessionId:`,N.activeSessionId,`apiParams:`,r,`timeout:`,i),chrome.runtime.sendMessage({type:`CALL_API`,sessionId:N.activeSessionId,messages:e,model:t,useTools:n,tabId:N.currentTabId,apiParams:r,agentId:N.activeAgentId,agentToolIds:N.activeAgentToolIds,imageApiBase:N.enableImageInput&&N.attachedImages.length>0&&N.imageApiBase||``,imageApiKey:N.enableImageInput&&N.attachedImages.length>0&&N.imageApiKey||``})})}function Ia(e){let t=document.querySelector(`.execution-log-panel`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel`;let r=e.reduce((e,t)=>e+(t.duration||0),0),i=e.filter(e=>e.status===`success`).length,a=e.filter(e=>e.status===`failed`).length,o=e.filter(e=>e.nodeType===`subtask`).length,s=e.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,c=e.filter(e=>e.nodeType===`tool_exec`&&e.action?.name===`plan_task`&&e.status===`success`).length,l=e.filter(e=>e.nodeType===`reflection`).find(e=>e.reflectionType===`post`);n.innerHTML=`
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
        <div class="summary-item" title="总耗时: ${ut(r)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${ut(r)}</span>
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
        ${ga(e)}
      </div>
    </div>
  `,document.body.appendChild(n),n.addEventListener(`click`,e=>{e.target===n&&n.remove()}),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()});let u=n.querySelector(`.toggle-expand-btn`),d=n.querySelectorAll(`.timeline-content`),f=!1;u.addEventListener(`click`,()=>{f=!f,d.forEach(e=>{f?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=u.querySelector(`svg`);f?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,u.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,u.setAttribute(`title`,`展开全部节点`))}),n.querySelectorAll(`.timeline-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.parentElement.classList.toggle(`expanded`)})});let p=n.querySelectorAll(`.combo-stat`),m=n.querySelectorAll(`.timeline-item`);p.forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.status,n=e.classList.contains(`active`);p.forEach(e=>e.classList.remove(`active`)),n?m.forEach(e=>{e.style.display=``}):(e.classList.add(`active`),m.forEach(e=>{if(t===`subtask`)e.classList.contains(`subtask-level`)?e.style.display=``:e.style.display=`none`;else{let n=e.querySelector(`.timeline-dot`);n&&n.classList.contains(t)?e.style.display=``:e.style.display=`none`}}))})})}function La(e,t){try{let n=e.dataset.textContent_||e.dataset.rawContent||``;navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{console.error(`[SidePanel] 复制失败:`,e);let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),F(`复制失败`,`error`)}}function Ra(e){try{let t=e.dataset.rawContent||``,n=e.dataset.textContent_||``;if(!n&&!t){F(`无法获取消息内容`,`error`);return}if(N.attachedImages=[],t.startsWith(`[`))try{let e=JSON.parse(t);if(Array.isArray(e)){let t=e.filter(e=>e.type===`image_url`);for(let e of t)N.attachedImages.push({dataUrl:e.image_url.url})}}catch{}$i(),N.quotedContextText=``,N.selectedContextText=``;let r=n.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),i=n.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),a=r||i,o=n;if(a){let e=r?`quoted`:`selected`,t=a[1].trim(),n=a[2].trim(),i=document.getElementById(`selectionIndicator`),s=document.getElementById(`selectionText`);if(i&&s){let n;n=t.length>100?t.substring(0,100)+`...`:t.length>50?t.substring(0,50)+`...`:t,e===`quoted`?(N.quotedContextText=t,s.textContent=`💬 已引用: ${n}`):(N.selectedContextText=t,s.textContent=`📌 已选中: ${n}`),i.classList.add(`show`)}o=n}let s=document.getElementById(`userInput`);s.value=o,lt(),s.focus(),s.selectionStart=s.selectionEnd=s.value.length,console.log(`[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送`)}catch(e){console.error(`[SidePanel] 编辑消息失败:`,e),F(`编辑失败: `+e.message,`error`)}}function za(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=N.messageHistory.find(e=>e.role===`assistant`);if(t)n=t.content;else{let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}}navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败，请手动选择内容复制`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),F(`复制失败`,`error`)}}function Ba(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${mn(n)}
      </body>
      </html>
    `,i=new Blob([`﻿`,r],{type:`application/msword`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`word-${new Date().getTime()}.doc`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a);let s=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `,setTimeout(()=>{t.innerHTML=s},2e3),console.log(`[SidePanel] Word 文档导出成功`)}catch(e){console.error(`[SidePanel] 导出 Word 失败:`,e),F(`导出失败: `+e.message,`error`)}}function Va(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${mn(n)}
        <div class="footer">${`AI Helper - ${new Date().toLocaleString(`zh-CN`)}`}</div>
      </body>
      </html>
    `,i=window.open(``,`_blank`,`width=800,height=600`);if(!i){F(`请允许弹出窗口以使用 PDF 导出功能`,`warning`);return}i.document.write(r),i.document.close(),i.onload=function(){setTimeout(()=>{i.focus(),i.print()},500)};let a=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `,setTimeout(()=>{t.innerHTML=a},2e3),console.log(`[SidePanel] PDF 导出已触发`)}catch(e){console.error(`[SidePanel] 导出 PDF 失败:`,e),F(`导出失败: `+e.message,`error`)}}function Ha(e){try{let t=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!t){console.warn(`[SidePanel] 无法获取消息内容`);return}let n=document.getElementById(`userInput`);if(!n){console.warn(`[SidePanel] 找不到输入框`);return}let r=e.querySelector(`.quote-btn`),i=r?r.innerHTML:``;Ci(t),r&&(r.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `,r.classList.add(`quoted`),setTimeout(()=>{r.innerHTML=i,r.classList.remove(`quoted`)},2e3)),n.focus(),console.log(`[SidePanel] 已引用消息内容到提示条，输入框已获取焦点`)}catch(e){console.error(`[SidePanel] 引用提问失败:`,e),F(`引用失败: `+e.message,`error`)}}function Ua(){console.log(`[SidePanel] 清除选中内容上下文`),N.selectedContextText=``,N.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=0;for(let t=0;t<e.length;t++)if(e[t].startsWith(`[用户问题]`)){n=t;break}n>0&&(t.value=e.slice(n).join(`
`),t.dispatchEvent(new Event(`input`)),console.log(`[SidePanel] 已移除输入框中的选中内容前缀`))}N.lastSelectedText=``,N.currentSelectionRange=null}function Wa(){let e=document.getElementById(`promptManageList`).querySelectorAll(`.prompt-manage-item`);e.forEach(t=>{t.addEventListener(`dragstart`,e=>{N.draggedItemIndex=parseInt(t.dataset.index),t.classList.add(`dragging`),e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,N.draggedItemIndex)}),t.addEventListener(`dragend`,()=>{t.classList.remove(`dragging`),e.forEach(e=>e.classList.remove(`drag-over`)),N.draggedItemIndex=null}),t.addEventListener(`dragover`,e=>{e.preventDefault(),e.dataTransfer.dropEffect=`move`,t.classList.add(`drag-over`)}),t.addEventListener(`dragleave`,()=>{t.classList.remove(`drag-over`)}),t.addEventListener(`drop`,e=>{e.stopPropagation(),e.preventDefault();let n=parseInt(t.dataset.index);if(N.draggedItemIndex!==null&&N.draggedItemIndex!==n){let e=N.customPrompts[N.draggedItemIndex];N.customPrompts.splice(N.draggedItemIndex,1),N.customPrompts.splice(n,0,e),chrome.storage.local.set({customPrompts:N.customPrompts}),to()}t.classList.remove(`drag-over`)})})}function Ga(){let e=document.querySelector(`.input-toolbar-right`);if(!e)return;let t=document.createElement(`button`);t.className=`prompt-manage-btn`,t.title=`提示词管理`,t.innerHTML=`<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`,t.addEventListener(`click`,()=>{$a()}),e.appendChild(t)}function Ka(e=``){let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);t.style.display=`block`,n.classList.add(`show`),Ya(e)}function $(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`);e.style.display=`none`,t.classList.remove(`show`),N.selectedPromptIndex=-1}function qa(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`),n=document.getElementById(`userInput`);e.style.display!==`none`&&t.classList.contains(`show`)?$():(Ka(),n.focus())}function Ja(e=``){Ya(e)}function Ya(e=``){let t=document.getElementById(`promptList`),n=e.toLowerCase(),r=N.customPrompts.filter(t=>e?t.code.toLowerCase().includes(n)||t.content.toLowerCase().includes(n):!0);if(r.length===0){t.innerHTML=`<div class="prompt-empty">暂无匹配的提示词</div>`,N.selectedPromptIndex=-1;return}N.selectedPromptIndex=0,t.innerHTML=r.map((e,t)=>`
    <div class="prompt-item ${t===N.selectedPromptIndex?`selected`:``}" data-index="${t}" data-code="${e.code}">
      <span class="prompt-item-content">${e.content}</span>
      <span class="prompt-item-code">/${e.code}</span>
    </div>
  `).join(``),t.querySelectorAll(`.prompt-item`).forEach(e=>{e.addEventListener(`click`,t=>{let n=e.dataset.code;t.ctrlKey||t.metaKey?Za(n):Qa(n)})})}function Xa(e){e.forEach((e,t)=>{t===N.selectedPromptIndex?e.classList.add(`selected`):e.classList.remove(`selected`)})}function Za(e){let t=N.customPrompts.find(t=>t.code===e);if(!t)return;let n=document.getElementById(`userInput`),r=n.value,i=r.lastIndexOf(`/`),a=r;if(i!==-1){let e=-1;for(let t=i-1;t>=0;t--)if(r[t]===`
`){e=t;break}a=e===-1?r.substring(0,i).trimEnd():r.substring(0,e+1).trimEnd()}n.value=a+(a&&!a.endsWith(`
`)?`

`:``)+t.content,n.focus(),n.selectionStart=n.selectionEnd=n.value.length,$(),lt(),console.log(`[SidePanel] 已追加提示词到输入框:`,t.code,t.content)}async function Qa(e){let t=N.customPrompts.find(t=>t.code===e);if(!t)return;if(N.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}$();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove();let r=t.content,s=N.enableSelectionQuery&&N.selectedContextText&&N.selectedContextText.trim(),c=N.quotedContextText&&N.quotedContextText.trim();if(c){let e=N.quotedContextText.trim(),{compressed:n,wasCompressed:i}=C(e);r=`[引用内容${i?`摘要`:``}]\n${n}\n\n[用户问题]\n${t.content}`,oa(`quoted`,e,!1),N.quotedContextText=``}else if(s){let e=N.selectedContextText.trim(),{compressed:n,wasCompressed:i}=C(e);r=`[选中内容${i?`摘要`:``}]\n${n}\n\n[用户问题]\n${t.content}`,oa(`selected`,e,!1),N.selectedContextText=``}(s||c)&&Ua();let l=ea(r);X(`user`,ea(t.content)),N.messageHistory.push({role:`user`,content:l}),K(),vt(t.content);let u=document.getElementById(`userInput`);u.value=``,u.style.height=`auto`,N.isGenerating=!0;let d=Ta(),f=N.activeSessionId,p=N.enableImageInput&&N.attachedImages.length>0&&N.imageModelName||N.currentModel;if(N.attachedImages.length>0){let e=document.getElementById(`imagePreviewBar`);e&&(e.innerHTML=``)}try{await ht(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let e=[{role:`system`,content:await ft()}];if(N.isolateChat){let t=N.messageHistory,n=N.chatConfig.contextWindow||0,r=a(p,N.enabledTools.length||50,n,N.customModelMap),s=Math.floor(r*.7),c=N.messageHistory.slice(0,-1),l=N.messageHistory[N.messageHistory.length-1],u=[],d=o([l]);for(let e=c.length-1;e>=0;e--){let t=c[e],n=o([t]);if(d+n<=s)u.unshift(t),d+=n;else break}if(u.length<c.length){let t=c.length-u.length,n=i(c.slice(0,t));n&&(e[0]={...e[0],content:e[0].content+`

`+n})}t=[...u,l],e=[...e,...t];for(let t=0;t<e.length-1;t++)e[t]={...e[t],content:ta(e[t].content)}}else e.push({role:`user`,content:l});let t=await pt(),n,r;try{let i=await Fa(e,p,N.useTools,t);n=i.content,r=i.executionLog||[]}catch(e){throw Q(d),n=`❌ 请求失败：`+(e.message||`未知错误`),r=e.executionLog||[],X(`assistant`,n,!0,r),N.messageHistory.push({role:`assistant`,content:n,executionLog:r}),K(),e}Q(d),await wn(X(`assistant`,n,!0,r)),N.messageHistory.push({role:`assistant`,content:n,executionLog:r}),K()}catch{}finally{N.generatingSessionIds.delete(f),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),u.focus(),N.attachedImages=[]}}function $a(){document.getElementById(`promptManageModal`).classList.add(`show`),to()}function eo(){document.getElementById(`promptManageModal`).classList.remove(`show`);let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=document.getElementById(`promptManageAddBtn`);e&&(e.value=``),t&&(t.value=``),n&&(n.value=``),r&&(r.textContent=`添加提示词`,r.style.background=`#667eea`)}function to(){let e=document.getElementById(`promptManageList`);if(N.customPrompts.length===0){e.innerHTML=`<div class="prompt-empty">暂无提示词，请添加</div>`;return}e.innerHTML=N.customPrompts.map((e,t)=>`
    <div class="prompt-manage-item" draggable="true" data-index="${t}">
      <div class="prompt-manage-item-left">
        <span class="prompt-drag-handle" title="拖拽排序">⋮⋮</span>
        <span class="prompt-manage-item-code">/${e.code}</span>
        <span class="prompt-manage-item-content">${e.content}</span>
      </div>
      <div class="prompt-manage-item-actions">
        <button class="prompt-sort-btn move-up-btn" data-index="${t}" title="上移" ${t===0?`disabled`:``}>↑</button>
        <button class="prompt-sort-btn move-down-btn" data-index="${t}" title="下移" ${t===N.customPrompts.length-1?`disabled`:``}>↓</button>
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
  `).join(``),e.querySelectorAll(`.move-up-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n>0){let e=N.customPrompts[n];N.customPrompts[n]=N.customPrompts[n-1],N.customPrompts[n-1]=e,chrome.storage.local.set({customPrompts:N.customPrompts}),to()}})}),e.querySelectorAll(`.move-down-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n<N.customPrompts.length-1){let e=N.customPrompts[n];N.customPrompts[n]=N.customPrompts[n+1],N.customPrompts[n+1]=e,chrome.storage.local.set({customPrompts:N.customPrompts}),to()}})}),e.querySelectorAll(`.menu-toggle-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);N.customPrompts[n].enabledInMenu=!N.customPrompts[n].enabledInMenu,chrome.storage.local.set({customPrompts:N.customPrompts}),to()})}),e.querySelectorAll(`.edit-btn`).forEach(e=>{e.addEventListener(`click`,()=>{ao(parseInt(e.dataset.index))})}),e.querySelectorAll(`.delete-btn`).forEach(e=>{e.addEventListener(`click`,()=>{oo(parseInt(e.dataset.index))})}),Wa()}function no(e){let t=document.getElementById(`promptErrorModal`),n=document.getElementById(`promptErrorMessage`);n.textContent=e,t.classList.add(`show`)}function ro(){document.getElementById(`promptErrorModal`).classList.remove(`show`)}function io(){let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=t.value.trim(),i=n.value.trim();if(!r||!i){no(`请填写编码和内容`);return}let a=e?parseInt(e.value):-1,o=N.customPrompts.findIndex(e=>e.code===r);if(o!==-1&&o!==a){no(`编码已存在`);return}a>=0&&a<N.customPrompts.length?N.customPrompts[a]={...N.customPrompts[a],code:r,content:i}:N.customPrompts.push({code:r,content:i,enabledInMenu:!1}),chrome.storage.local.set({customPrompts:N.customPrompts}),t.value=``,n.value=``,e&&(e.value=``);let s=document.getElementById(`promptManageAddBtn`);s.textContent=`添加提示词`,s.style.background=`#667eea`,to()}function ao(e){let t=N.customPrompts[e];if(!t)return;let n=document.getElementById(`editPromptIndex`),r=document.getElementById(`newPromptCode`),i=document.getElementById(`newPromptContent`),a=document.getElementById(`promptManageAddBtn`);n&&(n.value=e),r.value=t.code,i.value=t.content,a.textContent=`保存修改`,a.style.background=`#ffa502`,r.scrollIntoView({behavior:`smooth`})}function oo(e){let t=N.customPrompts[e];if(!t)return;N.pendingDeleteIndex=e;let n=document.getElementById(`deleteConfirmModal`),r=document.getElementById(`deleteConfirmMessage`);r.textContent=`确定要删除提示词 "/${t.code}" 吗？`,n.classList.add(`show`)}function so(){document.getElementById(`deleteConfirmModal`).classList.remove(`show`),N.pendingDeleteIndex=-1}function co(e){N.customPrompts.splice(e,1),chrome.storage.local.set({customPrompts:N.customPrompts}),to()}function lo(){let e=document.getElementById(`promptManageCancelBtn`),t=document.getElementById(`promptManageAddBtn`),n=document.getElementById(`promptModalCloseBtn`);e&&e.addEventListener(`click`,eo),t&&t.addEventListener(`click`,io),n&&n.addEventListener(`click`,eo);let r=document.getElementById(`deleteCancelBtn`),i=document.getElementById(`deleteConfirmBtn`);r&&r.addEventListener(`click`,so),i&&i.addEventListener(`click`,()=>{N.pendingDeleteIndex>=0&&co(N.pendingDeleteIndex),so()});let a=document.getElementById(`deleteConfirmModal`);a&&a.addEventListener(`click`,e=>{e.target===a&&so()});let o=document.getElementById(`promptErrorConfirmBtn`);o&&o.addEventListener(`click`,ro);let s=document.getElementById(`promptErrorModal`);s&&s.addEventListener(`click`,e=>{e.target===s&&ro()})}async function uo(e=``){let t=document.getElementById(`agentAtSelector`),n=document.getElementById(`agentAtDropdown`);t.style.display=`block`,n.classList.add(`show`),await po(e)}function fo(){let e=document.getElementById(`agentAtSelector`),t=document.getElementById(`agentAtDropdown`);e.style.display=`none`,t.classList.remove(`show`),N.selectedAgentAtIndex=-1}async function po(e=``){let t=document.getElementById(`agentAtList`),n=await tt(),r=e.toLowerCase(),i=n.filter(t=>e?t.name.toLowerCase().includes(r)||t.description&&t.description.toLowerCase().includes(r):!0);if(i.length===0){t.innerHTML=`<div class="prompt-empty">暂无匹配的 Agent</div>`,N.selectedAgentAtIndex=-1;return}N.selectedAgentAtIndex=0,t.innerHTML=i.map((e,t)=>{let n=e.id===N.activeAgentId||!N.activeAgentId&&e.id==="default",r=e.toolIds?e.toolIds.length:e.toolIds===null?`全局`:0,i=typeof r==`number`?`${r} 个工具`:`继承全局工具`;return`
      <div class="prompt-item ${t===0?`selected`:``} ${n?`agent-at-active`:``}"
           data-index="${t}" data-agent-id="${I(e.id)}">
        <span class="agent-at-icon">${I(e.icon)}</span>
        <span class="prompt-item-content">${I(e.name)}</span>
        <span class="prompt-item-code">${I(e.description||i)}${n?` ✓`:``}</span>
      </div>
    `}).join(``),t.querySelectorAll(`.prompt-item`).forEach(e=>{e.addEventListener(`click`,async t=>{let n=e.dataset.agentId;await ho(n)})})}function mo(e){e.forEach((e,t)=>{t===N.selectedAgentAtIndex?e.classList.add(`selected`):e.classList.remove(`selected`)})}async function ho(e){let t=document.getElementById(`userInput`),n=t.value,r=n.lastIndexOf(`@`);if(r!==-1){let e=n.substring(0,r);t.value=e,t.focus(),t.selectionStart=t.selectionEnd=e.length}fo(),await hr(e),lt()}function go(e,t){let n=document.getElementById(`tokenStatsOverlay`),r=document.getElementById(`tokenStatsClose`),i=document.getElementById(`tokenStatsRefreshBtn`),a=document.getElementById(`tokenStatsClearBtn`);if(!n)return;function o(){n.style.display=`flex`,c()}function s(){n.style.display=`none`}window.openTokenStats=o,r&&r.addEventListener(`click`,s),n&&n.addEventListener(`click`,e=>{e.target===n&&s()}),i&&i.addEventListener(`click`,c),a&&a.addEventListener(`click`,async()=>{await t(`确定要清空所有 Token 使用统计吗？此操作不可撤销。`,`清空统计`)&&(await x(),c())});async function c(){let t=e(),n=document.getElementById(`tokenStatsLoading`),r=document.getElementById(`tokenStatsEmpty`),i=document.getElementById(`tokenStatsContent`);n&&(n.style.display=``),r&&(r.style.display=`none`),i&&(i.style.display=`none`);try{let[e,a]=await Promise.all([y(t),g()]);if(n&&(n.style.display=`none`),!(a&&a.totalApiCalls>0)){r&&(r.style.display=``);return}i&&(i.style.display=``),l(e),u(a),d(e.records||[])}catch(e){console.error(`[TokenStats] 加载统计失败:`,e),n&&(n.style.display=`none`),r&&(r.textContent=`加载失败`,r.style.display=``)}}function l(e){let t=document.getElementById(`tokenSessionStats`);if(!t)return;if(!e||e.apiCallCount===0){t.innerHTML=`<div style="text-align:center;color:#999;padding:20px;">当前会话暂无数据</div>`;return}let n=e.totalTokens>0?(e.totalPromptTokens/e.totalTokens*100).toFixed(1):0,r=e.totalTokens>0?(e.totalCompletionTokens/e.totalTokens*100).toFixed(1):0;t.innerHTML=`
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
        <span style="background:#f0f0f5;padding:1px 6px;border-radius:3px;font-size:10px;color:#666;">${I(i)}</span>
        <span style="font-weight:500;color:#333;">${f(e.totalTokens)}</span>
        <span style="color:#aaa;font-size:10px;">${(e.contextUsageRate*100).toFixed(1)}%</span>
      </div>`}).join(``)}function f(e){return e>=1e6?(e/1e6).toFixed(1)+`M`:e>=1e3?(e/1e3).toFixed(1)+`K`:String(e)}}function _o(e){return e>=1e6?Math.round(e/1e6*10)/10+`M`:e>=1e3?Math.round(e/1e3)+`K`:String(e)}chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.chatMaxMemoryMessages&&(N.chatConfig.maxMemoryMessages=e.chatMaxMemoryMessages.newValue,vo(),console.log(`[SidePanel] 记忆限制配置已更新:`,N.chatConfig.maxMemoryMessages)),t===`local`&&e.chatContextWindow&&(N.chatConfig.contextWindow=e.chatContextWindow.newValue||0,console.log(`[SidePanel] 上下文窗口配置已更新:`,N.chatConfig.contextWindow))});function vo(){let e=document.getElementById(`memoryLimitLabel`);e&&(N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?e.textContent=`(最近${N.chatConfig.maxMemoryMessages}条)`:e.textContent=`(全)`,e.style.display=`inline`,e.style.cursor=`pointer`,e.title=`点击设置记忆历史限制条数`)}function yo(e){e.preventDefault(),e.stopPropagation();let t=document.getElementById(`memoryLimitDropdown`);if(t.classList.toggle(`show`),t.classList.contains(`show`)){let e=N.chatConfig.maxMemoryMessages;t.querySelectorAll(`.memory-limit-option`).forEach(t=>{t.classList.remove(`selected`);let n=parseInt(t.dataset.value);(e===null&&n===0||e!==null&&e>0&&n===e)&&t.classList.add(`selected`)});let n=t.querySelector(`#memoryLimitInput`);e!==null&&e>0?n.value=e:n.value=``}}function bo(){let e=document.getElementById(`memoryLimitDropdown`),t=document.getElementById(`memoryLimitLabel`),n=e?.querySelector(`#memoryLimitInput`);if(!e||!t)return;vo(),t.addEventListener(`click`,yo);let r=e.querySelectorAll(`.memory-limit-option`);r.forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let i=parseInt(e.dataset.value),a=i===0?null:i;r.forEach(e=>e.classList.remove(`selected`)),e.classList.add(`selected`),n&&(n.value=i===0?``:i),chrome.storage.local.set({chatMaxMemoryMessages:a},()=>{N.chatConfig.maxMemoryMessages=a,vo(),F(`✅ 配置已更新`,`success`)})})}),n&&(n.addEventListener(`click`,e=>e.stopPropagation()),n.addEventListener(`mousedown`,e=>e.stopPropagation()),n.addEventListener(`change`,e=>{e.stopPropagation();let t=e.target.value.trim(),n=t&&parseInt(t)>0?parseInt(t):null;r.forEach(e=>e.classList.remove(`selected`)),chrome.storage.local.set({chatMaxMemoryMessages:n},()=>{N.chatConfig.maxMemoryMessages=n,vo(),F(`✅ 配置已更新`,`success`)})})),document.addEventListener(`click`,n=>{!e.contains(n.target)&&n.target!==t&&e.classList.remove(`show`)})}function xo(e){document.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?(t.classList.add(`selected`),t.querySelector(`.model-option-check`).textContent=`✓`):(t.classList.remove(`selected`),t.querySelector(`.model-option-check`).textContent=``)})}function So(e,t){let n=document.getElementById(`tempDropdown`);if(!n){typeof t==`function`&&t();return}chrome.storage.local.get([`deletedPresetModels`],r=>{if((r.deletedPresetModels||[]).forEach(e=>{let t=n.querySelector(`.model-option[data-value="${e}"]`);t&&t.remove()}),!e||e.length===0){typeof t==`function`&&t();return}let i=[`deepseek-v4-pro`,`deepseek-v4-flash`],a=!1;if(e.forEach(e=>{let t,r=0;if(typeof e==`string`)t=e,a=!0;else if(e&&typeof e==`object`&&e.name)t=e.name,r=e.contextWindow||0;else return;if(i.includes(t)){if(r&&r>0){let e=n.querySelector(`.model-option[data-value="${t}"]`);if(e){let t=e.querySelector(`.model-option-left`);if(!t){t=document.createElement(`span`),t.className=`model-option-left`,t.textContent=e.textContent;for(let t of[...e.childNodes])t.nodeType===Node.TEXT_NODE&&e.removeChild(t);e.insertBefore(t,e.firstChild)}let n=e.querySelector(`.model-option-right`);if(!n){n=document.createElement(`span`),n.className=`model-option-right`;let t=e.querySelector(`:scope > .model-ctx-badge`);t&&n.appendChild(t),e.appendChild(n)}let i=n.querySelector(`.model-ctx-badge`);if(i)i.textContent=_o(r);else{let e=document.createElement(`span`);e.className=`model-ctx-badge`,e.textContent=_o(r),n.appendChild(e)}}}return}if(n.querySelector(`.model-option[data-value="${t}"]`))return;let o=document.createElement(`div`);if(o.className=`model-option`,o.dataset.value=t,o.innerHTML=`<span class="model-option-check"></span><span class="model-option-left">${t}</span>`,r&&r>0){let e=document.createElement(`span`);e.className=`model-option-right`;let t=document.createElement(`span`);t.className=`model-ctx-badge`,t.textContent=_o(r),e.appendChild(t),o.appendChild(e)}o.addEventListener(`click`,e=>{e.stopPropagation(),N.currentModel=t,xo(t),chrome.storage.local.set({modelName:t})}),n.querySelector(`.model-section`).appendChild(o)}),a){let t=e.map(e=>typeof e==`string`?{name:e,contextWindow:0}:e);chrome.storage.local.set({customModels:t})}N.customModelMap=p(e),typeof t==`function`&&t()})}function Co(e,t=`📌 已选中`){if(!N.enableSelectionQuery)return;N.quotedContextText=``,N.selectedContextText=e;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let i;i=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,r.textContent=`${t}: ${i}`,n.classList.add(`show`)}}function wo(e,t,n=0,r=0){if(!N.enableSelectionQuery)return;let i=document.getElementById(`selectionFloatingMenu`),a=document.getElementById(`selectionMenuItems`);if(!i||!a)return;let o=N.customPrompts.filter(e=>e.enabledInMenu===!0);if(o.length===0)return;a.innerHTML=``,o.forEach(e=>{let n=e.content.length>10?e.content.substring(0,10)+`...`:e.content,r=document.createElement(`div`);r.className=`menu-item`,r.innerHTML=`
      <span>${n}</span>
      <span class="menu-item-code">/${e.code}</span>
    `,r.addEventListener(`click`,n=>{n.stopPropagation(),To(e,t)}),a.appendChild(r)});let s=document.body.getBoundingClientRect(),c=40+o.length*36,l=r-s.top-c-30,u=n-s.left-20;l<s.top+10&&(l=r-s.top+30),u<s.left+10&&(u=n-s.left+20),u+180>s.right-10&&(u=n-s.left-180-30,u<s.left+10&&(u=n-s.left+20)),l+c>s.bottom-10&&(l=r-s.top-c-30,l<s.top+10&&(l=r-s.top+30)),i.style.top=l+`px`,i.style.left=u+`px`,i.style.maxHeight=s.bottom-l-20+`px`,i.classList.add(`show`)}window.hideFloatingMenu=function(){let e=document.getElementById(`selectionFloatingMenu`);e&&e.classList.remove(`show`),N.lastSelectedText=``,N.currentSelectionRange=null};async function To(e,t){if(!N.enableSelectionQuery)return;if(window.hideFloatingMenu(),N.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}N.selectedContextText=t,wi();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove(),oa(`selected`,t,!1);let{compressed:r,wasCompressed:s}=C(t),c=`[选中内容${s?`摘要`:``}]\n${r}\n\n[用户问题]\n${e.content}`;X(`user`,e.content),N.messageHistory.push({role:`user`,content:c}),K(),vt(e.content),N.isGenerating=!0;let l=Ta(),u=N.activeSessionId,d=N.currentModel;try{await ht(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let e=[{role:`system`,content:await ft()}];if(N.isolateChat){let t=N.messageHistory,n=N.chatConfig.contextWindow||0,r=a(d,N.enabledTools.length||50,n,N.customModelMap),s=Math.floor(r*.7),c=N.messageHistory.slice(0,-1),l=N.messageHistory[N.messageHistory.length-1],u=[],f=o([l]);for(let e=c.length-1;e>=0;e--){let t=c[e],n=o([t]);if(f+n<=s)u.unshift(t),f+=n;else break}if(u.length<c.length){let t=c.length-u.length,n=i(c.slice(0,t));n&&(e[0]={...e[0],content:e[0].content+`

`+n})}t=[...u,l],e=[...e,...t]}else e.push({role:`user`,content:c});let t=await pt(),n,r;try{let i=await Fa(e,d,N.useTools,t);n=i.content,r=i.executionLog||[]}catch(e){throw Q(l),n=`❌ 请求失败：`+(e.message||`未知错误`),r=e.executionLog||[],X(`assistant`,n,!0,r),N.messageHistory.push({role:`assistant`,content:n,executionLog:r}),K(),e}Q(l),await wn(X(`assistant`,n,!0,r)),N.messageHistory.push({role:`assistant`,content:n,executionLog:r}),K()}catch{}finally{N.generatingSessionIds.delete(u),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),document.getElementById(`userInput`).focus()}}function Eo(e){let t=document.getElementById(`headerAgentDot`),n=document.getElementById(`headerAgentIndicator`);if(!(!t||!n))if(!e||!e.connected)t.className=`header-agent-dot disconnected`,n.title=`Agent 未连接 - 点击前往设置`;else{t.className=`header-agent-dot connected`;let r=[`Agent 已连接`];e.platformName&&r.push(e.platformName),e.arch&&r.push(e.arch),n.title=r.join(` | `)+` - 点击前往设置`}}document.addEventListener(`DOMContentLoaded`,async()=>{window.__tableBlocks=[],await gt(),await xi(),chrome.runtime.onMessage.addListener(e=>{e.type===`SELECTION_AI_SEARCH`&&e.prompt&&(console.log(`[SidePanel] 收到选中文本 AI 搜索:`,e.selectedText?.substring(0,50)),ra(e.prompt,e.selectedText),chrome.storage.session.remove(`pendingSelectionSearch`).catch(()=>{})),e.type===`FILL_SIDEPANEL_INPUT`&&e.text&&(console.log(`[SidePanel] 收到追问填充:`,e.text?.substring(0,50)),ia(e.text),chrome.storage.session.remove(`pendingFillInput`).catch(()=>{})),e.type===`DIRECT_SEND`&&e.text&&(console.log(`[SidePanel] 收到直接发送:`,e.text?.substring(0,50)),aa(e.text,e.selectedText||``),chrome.storage.session.remove(`pendingDirectSend`).catch(()=>{})),e.type===`AGENT_STATUS_CHANGE`&&(console.log(`[SidePanel] 收到 Agent 状态变化:`,e.connected,e.status),chrome.storage.local.get(`agentPlatform`,e=>{N.agentPlatform=e.agentPlatform||{connected:!1},Eo(N.agentPlatform)})),e.type===`AGENT_CONNECTION_CHANGED`&&(console.log(`[SidePanel] 收到 Agent 连接状态变更:`,e.connected),N.agentPlatform={...N.agentPlatform,connected:e.connected},Eo(N.agentPlatform))});let t=await chrome.storage.session.get(`pendingSelectionSearch`);if(t.pendingSelectionSearch&&t.pendingSelectionSearch.selectedText){let{prompt:e,selectedText:n}=t.pendingSelectionSearch;console.log(`[SidePanel] 有待处理的选中文本搜索:`,n?.substring(0,50)),setTimeout(()=>{ra(e,n)},500),await chrome.storage.session.remove(`pendingSelectionSearch`)}let n=await chrome.storage.session.get(`pendingFillInput`);if(n.pendingFillInput&&n.pendingFillInput.text){let{text:e}=n.pendingFillInput;console.log(`[SidePanel] 有待填充的追问文本:`,e?.substring(0,50)),setTimeout(()=>{ia(e)},500),await chrome.storage.session.remove(`pendingFillInput`)}let r=await chrome.storage.session.get(`pendingDirectSend`);if(r.pendingDirectSend&&r.pendingDirectSend.text){let{text:e,selectedText:t}=r.pendingDirectSend;console.log(`[SidePanel] 有待直接发送的文本:`,e?.substring(0,50)),setTimeout(()=>{aa(e,t||``)},500),await chrome.storage.session.remove(`pendingDirectSend`)}chrome.tabs.onActivated.addListener(async e=>{console.log(`[SidePanel] Tab 切换, 新 Tab ID:`,e.tabId),N.currentTabId=e.tabId}),chrome.tabs.onUpdated.addListener(async(e,t)=>{t.status===`complete`&&N.currentTabId===e&&console.log(`[SidePanel] 当前 Tab 页面更新:`,t)}),typeof marked<`u`&&(marked.setOptions({breaks:!0,gfm:!0}),console.log(`[SidePanel] Marked 库已加载`)),typeof mermaid<`u`&&(mermaid.initialize({startOnLoad:!1,theme:`default`,securityLevel:`loose`,fontFamily:`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`}),console.log(`[SidePanel] Mermaid 库已加载`));let i=document.getElementById(`userInput`),a=document.getElementById(`sendBtn`),o=document.getElementById(`clearChatBtn`),s=document.getElementById(`exportChatBtn`),c=document.getElementById(`chatContainer`),l=document.getElementById(`tempDisplay`),u=document.getElementById(`tempDropdown`),d=document.getElementById(`tempPresetList`),f=document.getElementById(`tempSlider`),p=document.getElementById(`tempNumberInput`);function m(){if(!i||N.isScrolling)return;i.style.height=`auto`;let e=i.scrollHeight;e<=50?i.style.height=``:i.style.height=Math.min(e,100)+`px`}chrome.storage.local.get([`temperature`,`topP`,`selectedTempIndex`],e=>{e.temperature!==void 0&&(N.temperature=e.temperature),e.topP!==void 0&&(N.topP=e.topP),e.selectedTempIndex!==void 0&&(N.selectedTempIndex=e.selectedTempIndex),h()});function h(){f&&(f.value=N.temperature),p&&(p.value=N.temperature.toFixed(2));let e=document.getElementById(`tempIconValue`);e&&(e.textContent=N.temperature.toFixed(2)),g()}function g(){d.innerHTML=P.map((e,t)=>`
      <div class="temp-preset-item ${t===N.selectedTempIndex?`selected`:``}" data-index="${t}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${e.label}</div>
          <div class="temp-preset-desc" title="${e.tip}">${e.tip}</div>
        </div>
        <div class="temp-preset-value">${e.temp.toFixed(2)}</div>
      </div>
    `).join(``),d.querySelectorAll(`.temp-preset-item`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation(),_(parseInt(e.dataset.index))})})}function _(e){let t=P[e];t&&(N.selectedTempIndex=e,N.temperature=t.temp,h(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex}))}f.addEventListener(`input`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),N.temperature=t,p.value=t.toFixed(2);let n=document.getElementById(`tempIconValue`);n&&(n.textContent=t.toFixed(2));let r=0,i=Math.abs(P[0].temp-t);for(let e=1;e<P.length;e++){let n=Math.abs(P[e].temp-t);n<i&&(i=n,r=e)}N.selectedTempIndex=r,g(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex})}),p.addEventListener(`change`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),N.temperature=t,f.value=t,p.value=t.toFixed(2);let n=0,r=Math.abs(P[0].temp-t);for(let e=1;e<P.length;e++){let i=Math.abs(P[e].temp-t);i<r&&(r=i,n=e)}N.selectedTempIndex=n,g(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex})}),l&&u&&(l.addEventListener(`click`,e=>{e.stopPropagation(),u.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{let t=document.querySelector(`.temp-selector`);t&&!t.contains(e.target)&&u.classList.remove(`show`)})),c.addEventListener(`mousedown`,e=>{N.lastMouseX=e.clientX,N.lastMouseY=e.clientY}),c.addEventListener(`mouseup`,e=>{N.lastMouseX=e.clientX,N.lastMouseY=e.clientY,N.enableSelectionQuery&&setTimeout(()=>{let e=window.getSelection();if(e&&!e.isCollapsed&&e.toString().trim()){let t=e.toString().trim();c.contains(e.anchorNode)&&t!==N.lastSelectedText&&(N.lastSelectedText=t,N.currentSelectionRange=e.getRangeAt(0).cloneRange(),Co(t),wo(e,t,N.lastMouseX,N.lastMouseY))}else c.contains(e.anchorNode)||(N.lastSelectedText=``,N.currentSelectionRange=null,window.hideFloatingMenu())},10)});let v=``,y=null;async function b(){try{let e=await new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>e(t))});if(e&&e.length>0){let t=await new Promise(t=>{chrome.tabs.sendMessage(e[0].id,{action:`getSelectedText`},e=>{chrome.runtime.lastError?(console.debug(`[SidePanel] content script 未加载或无法通信:`,chrome.runtime.lastError.message),t(null)):t(e)})});if(!t)return;let n=t?.text||``;n&&n.trim()?n!==v&&(v=n,Co(n.trim())):v=``}}catch{}}function x(){y&&=(clearInterval(y),null),N.enableSelectionQuery&&(y=setInterval(b,500))}x(),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`&&`enableSelectionQuery`in e){N.enableSelectionQuery=e.enableSelectionQuery.newValue;let t=document.getElementById(`enableSelectionQueryBtn`);t&&(t.checked=N.enableSelectionQuery),x()}}),chrome.storage.local.get([`modelName`,`customModels`,`customPrompts`,`systemPrompt`,`inputHistory`,`agentPlatform`,`enableImageInput`,`imageModelName`,`imageApiBase`,`imageApiKey`],e=>{let t=e.modelName;t&&(N.currentModel=t),N.customPrompts=e.customPrompts||[],N.systemPrompt=e.systemPrompt||``,N.inputHistory=e.inputHistory||[],e.agentPlatform&&(N.agentPlatform=e.agentPlatform),Eo(N.agentPlatform),N.enableImageInput=e.enableImageInput||!1,N.imageModelName=e.imageModelName||``,N.imageApiBase=e.imageApiBase||``,N.imageApiKey=e.imageApiKey||``,Do(),Ga(),So(e.customModels,()=>{t&&xo(t)})}),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`){if(e.customModels){let t=e.customModels.newValue||[],n=u.querySelector(`.model-section`);n&&n.querySelectorAll(`.model-option`).forEach(e=>{let t=e.dataset.value;t!==`deepseek-v4-pro`&&t!==`deepseek-v4-flash`&&e.remove()}),So(t)}if(e.modelName){let t=e.modelName.newValue;t&&(N.currentModel=t,xo(t))}e.enableImageInput&&(N.enableImageInput=e.enableImageInput.newValue,Do()),e.imageModelName&&(N.imageModelName=e.imageModelName.newValue||``),e.imageApiBase&&(N.imageApiBase=e.imageApiBase.newValue||``),e.imageApiKey&&(N.imageApiKey=e.imageApiKey.newValue||``),e.deletedPresetModels&&(e.deletedPresetModels.newValue||[]).forEach(e=>{let t=u.querySelector(`.model-option[data-value="${e}"]`);t&&t.remove()})}}),Ti(),document.addEventListener(`session-switched`,()=>{let e=document.getElementById(`chatContainer`),t=document.getElementById(`userInput`);if(!e)return;let n=document.getElementById(`imagePreviewBar`);if(N.attachedImages.length>0&&n&&n.style.display===`none`&&(N.attachedImages=[]),N.executionLogListener&&=(chrome.runtime.onMessage.removeListener(N.executionLogListener),null),S(),t&&t.focus(),e.innerHTML=``,!N.messageHistory||N.messageHistory.length===0){let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      `,e.appendChild(t)}else N.messageHistory.forEach(e=>{e.htmlContent?Da(e.htmlContent):X(e.role,e.content,!1,e.executionLog||[],e.reflectionScore,e.wasRevised)}),vn();let r=N.pendingCallApiSessionIds.has(N.activeSessionId)&&!!N.pendingCancelApi;if(console.log(`[SidePanel] session-switched: pendingTask?`,r,`pendingSessionIds:`,[...N.pendingCallApiSessionIds],`activeSessionId:`,N.activeSessionId,`hasCancelApi:`,!!N.pendingCancelApi),r){console.log(`[SidePanel] 切回有后台任务的会话，显示加载状态`);let e=Ta();N.substituteLoadingIds.set(N.activeSessionId,e)}let i=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.get([i],e=>{e[i]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t&&(t.scrollTop=e[i])},150)})}),document.querySelectorAll(`.model-option`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.value;N.currentModel=n,xo(n),chrome.storage.local.set({modelName:n})})}),document.addEventListener(`click`,e=>{let t=document.getElementById(`promptDropdown`),n=document.getElementById(`promptSelector`),r=document.getElementById(`agentAtSelector`),i=document.getElementById(`selectionFloatingMenu`);if(n.contains(e.target)||(t.classList.remove(`show`),$()),r&&!r.contains(e.target)&&fo(),i&&!i.contains(e.target)){let t=window.getSelection(),n=c.contains(e.target),r=t&&!t.isCollapsed&&c.contains(t.anchorNode);(!n||!r)&&window.hideFloatingMenu()}});function S(){N.isGenerating?(a.classList.add(`stop-mode`),a.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`,a.title=`停止生成`,a.disabled=!1):(a.classList.remove(`stop-mode`),a.innerHTML=`<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z"/></svg>`,a.title=`发送`,a.disabled=!1,a.style.opacity=``,a.style.cursor=``)}a.addEventListener(`click`,()=>{N.isGenerating?Na(a):na()}),document.addEventListener(`generating-state-changed`,S);let C=document.getElementById(`promptTriggerBtn`);C&&C.addEventListener(`click`,e=>{e.stopPropagation(),C.blur(),qa()});let w=document.getElementById(`shortcutsBtn`),T=document.getElementById(`shortcutsModal`),E=document.getElementById(`shortcutsCloseBtn`);function ee(){T&&(T.style.display=`flex`)}function D(){T&&(T.style.display=`none`)}w&&w.addEventListener(`click`,e=>{e.stopPropagation(),ee();let t=document.getElementById(`headerMoreDropdown`);t&&t.classList.remove(`show`)}),E&&E.addEventListener(`click`,D),T&&T.addEventListener(`click`,e=>{e.target===T&&D()}),document.addEventListener(`keydown`,e=>{if((e.ctrlKey||e.metaKey)&&e.key===`t`){e.preventDefault();let t=document.getElementById(`toolsPopup`);t&&t.style.display!==`none`?tr():er()}if(e.key===`Escape`&&T&&T.style.display!==`none`){D();return}if(e.altKey&&e.code===`Slash`){e.preventDefault(),ee();return}if(e.altKey&&!e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey){e.preventDefault(),ko();return}if(e.altKey&&e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey){e.preventDefault(),Ao();return}if(e.altKey&&(e.key===`ArrowUp`||e.key===`ArrowDown`)){let t=document.getElementById(`chatContainer`);if(!t)return;let n=t.querySelectorAll(`.message.user, .message.assistant, .user-context-bubble`);if(e.shiftKey){e.preventDefault(),e.key===`ArrowUp`&&n.length>0?n[0].scrollIntoView({behavior:`smooth`,block:`start`}):e.key===`ArrowDown`&&n.length>0&&n[n.length-1].scrollIntoView({behavior:`smooth`,block:`start`});return}if(n.length===0)return;let r=t.getBoundingClientRect().top;if(e.key===`ArrowUp`){e.preventDefault();let t=-1;for(let e=0;e<n.length;e++)if(n[e].getBoundingClientRect().bottom>r+10){t=e;break}t===-1&&(t=n.length);let i=t-1;i>=0&&n[i].scrollIntoView({behavior:`smooth`,block:`start`})}else if(e.key===`ArrowDown`){e.preventDefault();let t=-1;for(let e=0;e<n.length;e++)if(n[e].getBoundingClientRect().bottom>r+10){t=e;break}if(t===-1)return;let i=t+1;i<n.length&&n[i].scrollIntoView({behavior:`smooth`,block:`start`})}}}),i.addEventListener(`keydown`,e=>{let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`),r=document.getElementById(`agentAtSelector`),a=document.getElementById(`agentAtDropdown`);if(r.style.display!==`none`&&a.classList.contains(`show`)){let t=a.querySelectorAll(`.prompt-item`),n=t.length;if(n!==0){if(e.key===`ArrowDown`){e.preventDefault(),N.selectedAgentAtIndex<0?N.selectedAgentAtIndex=0:N.selectedAgentAtIndex=(N.selectedAgentAtIndex+1)%n,mo(t);return}else if(e.key===`ArrowUp`){e.preventDefault(),N.selectedAgentAtIndex<0||N.selectedAgentAtIndex===0?N.selectedAgentAtIndex=n-1:--N.selectedAgentAtIndex,mo(t);return}else if(e.key===`Enter`&&N.selectedAgentAtIndex>=0){e.preventDefault(),t[N.selectedAgentAtIndex].click();return}else if(e.key===`Escape`){fo();return}}}if(t.style.display!==`none`&&n.classList.contains(`show`)){let t=n.querySelectorAll(`.prompt-item`),r=t.length;if(r!==0&&e.key===`ArrowDown`){e.preventDefault(),N.selectedPromptIndex<0?N.selectedPromptIndex=0:N.selectedPromptIndex=(N.selectedPromptIndex+1)%r,Xa(t);return}if(e.key===`ArrowUp`){e.preventDefault(),N.selectedPromptIndex<0||N.selectedPromptIndex===0?N.selectedPromptIndex=r-1:--N.selectedPromptIndex,Xa(t);return}if(e.key===`Enter`&&(e.ctrlKey||e.metaKey)&&N.selectedPromptIndex>=0){e.preventDefault();let n=t[N.selectedPromptIndex].dataset.code;Za(n);return}if(e.key===`Enter`&&N.selectedPromptIndex>=0){e.preventDefault();let n=t[N.selectedPromptIndex].dataset.code;Qa(n);return}if(e.key===`Escape`){$();return}}if(e.key===`Escape`){N.inputHistoryIndex>=0&&(N.inputHistoryIndex=-1),i.value&&(i.value=``,i.style.height=`auto`,i.dispatchEvent(new Event(`input`))),e.preventDefault();return}let o=t.style.display!==`none`&&n.classList.contains(`show`),s=r.style.display!==`none`&&a.classList.contains(`show`);if(!o&&!s&&!N.isGenerating){if(e.key===`ArrowUp`){e.preventDefault(),N.inputHistoryIndex===-1?N.inputHistoryIndex=N.inputHistory.length-1:N.inputHistoryIndex>0&&N.inputHistoryIndex--,N.inputHistoryIndex<0&&(N.inputHistoryIndex=0),N.inputHistoryIndex>=0&&N.inputHistory.length>0&&(i.value=N.inputHistory[N.inputHistoryIndex],i.dispatchEvent(new Event(`input`)));return}if(e.key===`ArrowDown`){e.preventDefault(),N.inputHistoryIndex>=0&&N.inputHistoryIndex<N.inputHistory.length-1?(N.inputHistoryIndex++,i.value=N.inputHistory[N.inputHistoryIndex],i.dispatchEvent(new Event(`input`))):(N.inputHistoryIndex=-1,i.value=``,i.dispatchEvent(new Event(`input`)));return}}e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),na())}),i.addEventListener(`paste`,e=>{if(!N.enableImageInput)return;let t=e.clipboardData?.items;if(t){for(let n of t)if(n.type.startsWith(`image/`)){e.preventDefault();let t=n.getAsFile();t&&Qi(t);break}}});let te=document.getElementById(`screenshotBtn`);te&&te.addEventListener(`click`,async e=>{if(!N.enableImageInput)return;let t=e.ctrlKey||e.shiftKey||e.metaKey;try{t?await Ao():await ko()}catch(e){console.error(`[SidePanel] 截图失败:`,e),F(`截图失败，请重试`)}}),Zi(),i.addEventListener(`wheel`,e=>{N.isScrolling=!0;let t=i.style.height||i.offsetHeight+`px`;i.style.height=t,i.scrollHeight<=i.clientHeight+10&&(e.preventDefault(),e.stopPropagation()),setTimeout(()=>{N.isScrolling=!1},100)},{passive:!1}),i.addEventListener(`input`,e=>{let t=i.value,n=document.getElementById(`promptSelector`),r=document.getElementById(`promptDropdown`);document.getElementById(`agentAtSelector`),document.getElementById(`agentAtDropdown`);let a=t.lastIndexOf(`/`),o=t.lastIndexOf(`@`),s=!1;a!==-1&&(s=a===0||t[a-1]===`
`||t[a-1]===` `);let c=!1;if(o!==-1&&(c=o===0||t[o-1]===`
`||t[o-1]===` `),s&&c)if(o>a)s=!1,$(),uo(t.substring(o+1));else{c=!1,fo();let e=t.substring(a+1);n.style.display!==`none`&&r.classList.contains(`show`)?Ja(e):Ka(e)}else if(s){fo();let e=t.substring(a+1);n.style.display!==`none`&&r.classList.contains(`show`)?Ja(e):Ka(e)}else c?($(),uo(t.substring(o+1))):($(),fo());m()}),c.addEventListener(`scroll`,()=>{let e=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.set({[e]:c.scrollTop})});let ne=document.getElementById(`headerMoreBtn`),O=document.getElementById(`headerMoreDropdown`);ne&&O&&(ne.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{!O.contains(e.target)&&e.target!==ne&&O.classList.remove(`show`)})),o.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),Pi()}),s&&s.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),Di()});let re=document.getElementById(`importChatBtn`);re&&re.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),Mi()});let ie=document.getElementById(`importSessionsFile`);ie&&ie.addEventListener(`change`,e=>{let t=e.target.files[0];t&&Ni(t)});let ae=document.getElementById(`settingsBtn`);ae&&ae.addEventListener(`click`,()=>{chrome.runtime.openOptionsPage()});let oe=document.getElementById(`headerAgentIndicator`);oe&&oe.addEventListener(`click`,async()=>{let e=chrome.runtime.getURL(`options.html#agent`),t=await chrome.tabs.query({url:chrome.runtime.getURL(`options.html`)});t.length>0?await chrome.tabs.update(t[0].id,{active:!0,url:e}):await chrome.tabs.create({url:e})});let se=document.getElementById(`prototypeLibraryBtn`);se&&se.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),Xt()});let ce=document.getElementById(`tokenStatsHeaderBtn`);ce&&ce.addEventListener(`click`,e=>{e.stopPropagation(),O.classList.remove(`show`),window.openTokenStats&&window.openTokenStats()}),go(()=>N.activeSessionId,A);let le=document.getElementById(`isolateChatBtn`),k=document.getElementById(`enableToolsBtn`),ue=document.getElementById(`toolsConfigBtn`);chrome.storage.local.get([`isolateChat`,`enableSelectionQuery`,`enableTools`,`enabledTools`],t=>{t.isolateChat!==void 0&&(N.isolateChat=t.isolateChat),le.checked=N.isolateChat,t.enableSelectionQuery!==void 0&&(N.enableSelectionQuery=t.enableSelectionQuery);let n=document.getElementById(`enableSelectionQueryBtn`);if(n&&(n.checked=N.enableSelectionQuery),t.enableTools!==void 0&&(N.useTools=t.enableTools),t.enabledTools&&t.enabledTools.length>0){let n=new Set(e.map(e=>e.id)),r=t.enabledTools.filter(e=>n.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);N.enabledTools=[...r,...i],i.length>0&&chrome.storage.local.set({enabledTools:N.enabledTools})}else N.enabledTools=e.filter(e=>e.enabled).map(e=>e.id);N.enabledTools.length===0&&(N.useTools=!1),k&&(k.checked=N.useTools),x()}),le.addEventListener(`change`,()=>{N.isolateChat=le.checked,chrome.storage.local.set({isolateChat:N.isolateChat}),console.log(`[SidePanel] 记忆对话:`,N.isolateChat?`已启用`:`已禁用`)});let de=document.getElementById(`enableSelectionQueryBtn`);de&&de.addEventListener(`change`,()=>{N.enableSelectionQuery=de.checked,chrome.storage.local.set({enableSelectionQuery:N.enableSelectionQuery}),console.log(`[SidePanel] 划词问答:`,N.enableSelectionQuery?`已启用`:`已禁用`),!N.enableSelectionQuery&&N.selectedContextText&&wi()}),k&&k.addEventListener(`change`,()=>{N.useTools=k.checked,chrome.storage.local.set({enableTools:N.useTools}),N.useTools&&N.enabledTools.length===0&&(N.enabledTools=e.filter(e=>e.enabled).map(e=>e.id),chrome.storage.local.set({enabledTools:N.enabledTools})),console.log(`[SidePanel] 工具总开关:`,N.useTools?`已启用`:`已禁用`)}),ue&&ue.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),er()});let fe=document.getElementById(`toolsPopupOverlay`),pe=document.getElementById(`toolsPopupClose`),me=fe?fe.querySelector(`.modal-container`):null;pe&&pe.addEventListener(`click`,tr),me&&me.addEventListener(`click`,e=>{e.stopPropagation()});let he=document.getElementById(`toolsSearchInput`);he&&he.addEventListener(`input`,e=>{N.currentSearch=e.target.value.toLowerCase(),nr()});let ge=document.querySelectorAll(`.category-btn`);ge.forEach(e=>{e.addEventListener(`click`,()=>{ge.forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.style.background=`#f5f3ff`,e.style.color=`#667eea`,e.style.borderColor=`#d4cfff`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`,N.currentCategory=e.dataset.category,nr()})});let _e=document.getElementById(`toolsCategories`);_e&&_e.addEventListener(`wheel`,e=>{e.preventDefault(),_e.scrollLeft+=e.deltaY*2},{passive:!1});let ve=document.getElementById(`toolsSelectAll`),ye=document.getElementById(`toolsSelectNone`);ve&&ve.addEventListener(`click`,()=>{ar().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!0),N.enabledTools.includes(e.id)||N.enabledTools.push(e.id)}),or(),sr(),B()}),ye&&ye.addEventListener(`click`,()=>{ar().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!1);let n=N.enabledTools.indexOf(e.id);n>-1&&N.enabledTools.splice(n,1)}),or(),sr(),B()});let be=document.getElementById(`toolsPopupSave`);be&&be.addEventListener(`click`,()=>{cr(),B()});let xe=document.getElementById(`toolsPreselectToggle`);xe&&xe.addEventListener(`change`,()=>{chrome.storage.local.set({enableToolPreselect:xe.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已更新:`,xe.checked)})});let Se=document.getElementById(`toolsPopupCancel`);Se&&Se.addEventListener(`click`,()=>{tr()});let Ce=document.getElementById(`modalCancelBtn`),we=document.getElementById(`modalConfirmBtn`);function A(e,t=`确认操作`){return new Promise(n=>{let r=document.getElementById(`customConfirmOverlay`),i=document.getElementById(`customConfirmTitle`),a=document.getElementById(`customConfirmMessage`),o=document.getElementById(`customConfirmCancelBtn`),s=document.getElementById(`customConfirmOkBtn`);if(!r||!i||!a||!o||!s){n(confirm(e));return}let c=()=>{r.style.display=`none`,s.removeEventListener(`click`,l),o.removeEventListener(`click`,u),r.removeEventListener(`click`,d)},l=()=>{c(),n(!0)},u=()=>{c(),n(!1)},d=e=>{e.target===r&&(c(),n(!1))};i.textContent=t,a.textContent=e,r.style.display=`flex`,s.addEventListener(`click`,l),o.addEventListener(`click`,u),r.addEventListener(`click`,d)})}let j=document.getElementById(`toolStatsOverlay`),Te=document.getElementById(`toolStatsClose`),Ee=document.getElementById(`toolStatsBtn`);function De(){j&&(j.style.display=`flex`,je())}function Oe(){j&&(j.style.display=`none`)}Ee&&Ee.addEventListener(`click`,e=>{e.stopPropagation(),De()}),Te&&Te.addEventListener(`click`,Oe),j&&j.addEventListener(`click`,e=>{e.target===j&&Oe()});let ke=document.getElementById(`toolStatsRefreshBtn`);ke&&ke.addEventListener(`click`,je);let Ae=document.getElementById(`toolStatsClearBtn`);Ae&&Ae.addEventListener(`click`,async()=>{await A(`确定要清空所有工具使用统计吗？此操作不可撤销。`,`清空统计`)&&(await chrome.storage.local.remove([`toolUsageStats`]),je())});let M={column:`callCount`,asc:!1};async function je(){let t=document.getElementById(`toolStatsTable`),n=document.getElementById(`toolStatsTableBody`),r=document.getElementById(`toolStatsLoading`),i=document.getElementById(`toolStatsEmpty`),a=document.getElementById(`toolStatsSummary`),o=document.getElementById(`toolStatsUnusedSection`),s=document.getElementById(`toolStatsUnusedList`);if(!(!t||!n||!r||!i)){t.style.display=`none`,i.style.display=`none`,o&&(o.style.display=`none`),a&&(a.textContent=``),r.style.display=``;try{let n=(await chrome.storage.local.get([`toolUsageStats`])).toolUsageStats||{},c=Object.entries(n);if(c.length===0){r.style.display=`none`,i.style.display=``;return}let l={};e.forEach(e=>{l[e.id]=e.name?`${e.name}：${e.description||``}`:e.description||e.id}),Me(c,l);let u=e.map(e=>e.id),d=new Set(c.map(([e])=>e)),f=u.filter(e=>!d.has(e)),p=c.length,m=f.length;a&&(a.textContent=`已使用 ${p} 个，未使用 ${m} 个`),o&&s&&m>0&&(s.innerHTML=f.sort((e,t)=>e.toLowerCase().localeCompare(t.toLowerCase())).map(e=>`<code title="${I(l[e]||e)}" style="padding: 3px 10px; background: #f5f5f5; color: #aaa; border: 1px solid #eee; border-radius: 4px; font-size: 11px;">${e}</code>`).join(``),o.style.display=``),r.style.display=`none`,t.style.display=``}catch(e){console.error(`[SidePanel] 加载统计失败:`,e),r.style.display=`none`,i.textContent=`加载失败`,i.style.display=``}}}function Me(e,t){let n=document.getElementById(`toolStatsTableBody`);if(!n)return;let{column:r,asc:i}=M;n.innerHTML=[...e].sort((e,t)=>{let[n,a]=e,[o,s]=t,c=a.callCount>0?a.successCount/a.callCount*100:0,l=s.callCount>0?s.successCount/s.callCount*100:0,u=a.callCount>0?a.totalDuration/a.callCount:0,d=s.callCount>0?s.totalDuration/s.callCount:0,f=0;switch(r){case`name`:f=n.toLowerCase().localeCompare(o.toLowerCase());break;case`callCount`:f=a.callCount-s.callCount;break;case`successCount`:f=a.successCount-s.successCount;break;case`successRate`:f=c-l;break;case`duration`:f=u-d;break}return i?f:-f}).map(([e,n])=>{let r=n.callCount>0?n.successCount/n.callCount*100:0,i=n.callCount>0?n.totalDuration/n.callCount:0,a=t[e]||e,o=`#38a169`;r<60?o=`#e53e3e`:r<85&&(o=`#d69e2e`);let s=i<1e3?`${Math.round(i)}ms`:`${(i/1e3).toFixed(1)}s`;return`<tr>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee; color: #333;"><code title="${I(a)}">${e}</code></td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #666;">${n.callCount}</td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #666;">${n.successCount}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">
          <span style="display: inline-block; width: 50px; height: 5px; border-radius: 3px; background: #e0e0e0; vertical-align: middle; margin-right: 6px;">
            <span style="display: inline-block; width: ${r*.5}px; height: 5px; border-radius: 3px; background: ${o}; vertical-align: top;"></span>
          </span>
          <span style="font-size: 12px; color: ${o}; font-weight: 500;">${r.toFixed(0)}%</span>
        </td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #888; font-size: 12px;">${s}</td>
      </tr>`}).join(``),Ne()}function Ne(){let{column:e,asc:t}=M,n=[`name`,`callCount`,`successCount`,`successRate`,`duration`],r={name:`sortByName`,callCount:`sortByCallCount`,successCount:`sortBySuccessCount`,successRate:`sortBySuccessRate`,duration:`sortByDuration`};n.forEach(n=>{let i=document.getElementById(r[n]);if(!i)return;let a=i.querySelector(`.sort-indicator`);a&&(n===e?(a.textContent=t?`▲`:`▼`,a.style.color=`#667eea`):(a.textContent=``,a.style.color=``))})}document.querySelectorAll(`#toolStatsTable th[data-sort]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.sort;M.column===t?M.asc=!M.asc:(M.column=t,M.asc=!1),je()})}),Ce.addEventListener(`click`,()=>{Fi()}),we.addEventListener(`click`,()=>{Fi(),Ei()});let Pe=document.getElementById(`confirmModal`);Pe.addEventListener(`click`,e=>{e.target===Pe&&Fi()});let Fe=document.getElementById(`selectionClose`);Fe&&Fe.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),console.log(`[SidePanel] 用户点击关闭选中内容按钮`),wi(),window.hideFloatingMenu(),N.lastSelectedText=``,N.currentSelectionRange=null}),i.addEventListener(`input`,()=>{})}),mt().then(()=>vo()),document.addEventListener(`DOMContentLoaded`,()=>{bo()}),document.addEventListener(`DOMContentLoaded`,bt),document.addEventListener(`DOMContentLoaded`,lo),document.addEventListener(`DOMContentLoaded`,Ft),document.addEventListener(`DOMContentLoaded`,zt),document.addEventListener(`DOMContentLoaded`,pn),document.addEventListener(`DOMContentLoaded`,ji),document.addEventListener(`DOMContentLoaded`,()=>ur());function Do(){let e=document.getElementById(`imagePreviewBar`),t=document.getElementById(`screenshotBtn`);e&&(e.style.display=N.attachedImages.length>0?``:`none`),t&&(N.enableImageInput?t.style.removeProperty(`display`):t.style.display=`none`),userInput&&(N.enableImageInput?userInput.style.paddingRight=`84px`:userInput.style.paddingRight=``),N.enableImageInput||(N.attachedImages=[]),Oo()}function Oo(){let e=document.getElementById(`imagePreviewBar`);if(e){if(e.innerHTML=``,N.attachedImages.length===0){e.style.display=`none`;return}e.style.display=``,N.attachedImages.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`image-preview-item`;let i=document.createElement(`img`);i.src=t.dataUrl,i.className=`image-preview-thumb`,i.title=`点击查看大图`,i.style.cursor=`zoom-in`,i.addEventListener(`click`,()=>{Gi(t.dataUrl,i)});let a=document.createElement(`button`);a.className=`image-preview-remove`,a.innerHTML=`×`,a.title=`移除图片`,a.addEventListener(`click`,e=>{e.stopPropagation(),N.attachedImages.splice(n,1),Oo()}),r.appendChild(i),r.appendChild(a),e.appendChild(r)})}}async function ko(){if(!N.enableImageInput){F(`请先开启图片输入功能`);return}try{let e=await chrome.runtime.sendMessage({type:`CAPTURE_TAB`});e?.dataUrl&&(Qi(await(await fetch(e.dataUrl)).blob()),F(`截图成功`))}catch(e){console.error(`[SidePanel] 全页面截图失败:`,e),F(`截图失败，请重试`)}}async function Ao(){let e=await gt();if(!e){F(`无法获取当前标签页`);return}try{let t=await chrome.tabs.sendMessage(e,{type:`START_REGION_SELECTION`});if(!t)return;console.log(`[SidePanel] 区域选择结果:`,t);let n=await chrome.runtime.sendMessage({type:`CAPTURE_TAB`});if(!n?.dataUrl){F(`截图失败，请重试`);return}let r=await jo(n.dataUrl,t);if(!r){F(`裁剪失败，请重试`);return}Qi(await(await fetch(r)).blob())}catch(e){console.error(`[SidePanel] 区域截图失败:`,e),F(`区域截图失败，请确保页面已加载且未被浏览器限制`)}}function jo(e,t){return new Promise((n,r)=>{let i=new Image;i.onload=()=>{let e=document.createElement(`canvas`),r=window.devicePixelRatio||1,a=t.x*r,o=t.y*r,s=t.width*r,c=t.height*r;e.width=s,e.height=c,e.getContext(`2d`).drawImage(i,a,o,s,c,0,0,s,c),n(e.toDataURL(`image/jpeg`,.85))},i.onerror=()=>r(Error(`图片加载失败`)),i.src=e})}
//# sourceMappingURL=side_panel-QgrhdzAy.js.map