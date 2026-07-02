import{n as e,r as t}from"./constants-Ozwupw5C.js";import{C as n,D as r,S as i,_ as a,a as o,b as s,g as c,h as l,m as u,n as d,o as f,p,r as m,t as h,u as g,v as _,w as v,x as y}from"./token-store-RQS7cCqv.js";var b=new Set,x=[],S=`deepseek-v4-pro`,C=null,w=[],T=!0,E=!0,ee=!1,te=null,ne=``,D=``,re=[],ie=-1,ae=null,oe=``,se=[],ce=-1,le={platformName:`Unknown`,platform:`unknown`,arch:`unknown`,shell:`/bin/sh`,homeDir:`/home/user`,workdir:``,connected:!1},O={maxInputHistory:20,maxHistoryMessages:50,maxMessageLength:1e5,maxMemoryMessages:20,enableExecutionLog:!1},ue=.2,de=1,fe=0,pe=`all`,me=``,he=[],ge={},k=new Map,_e=null,A=new Map,ve=new Set,ye=new Map,be=null,xe=null,Se=null,Ce=null,j=null,we=18e4,Te=null,Ee=!1,De=null,Oe=``,ke=null,M=0,Ae=0,je=-1,Me=!1,Ne=``,Pe=``,Fe=``,Ie=[],Le=!1,N={get isGenerating(){return b.has(C)},set isGenerating(e){e?b.add(C):b.delete(C),document.dispatchEvent(new CustomEvent(`generating-state-changed`))},get generatingSessionIds(){return b},get messageHistory(){return x},set messageHistory(e){x=e},get currentModel(){return S},set currentModel(e){S=e},get activeSessionId(){return C},set activeSessionId(e){C=e},get sessions(){return w},set sessions(e){w=e},get useTools(){return T},set useTools(e){T=e},get isolateChat(){return E},set isolateChat(e){E=e},get enableSelectionQuery(){return ee},set enableSelectionQuery(e){ee=e},get currentTabId(){return te},set currentTabId(e){te=e},get selectedContextText(){return ne},set selectedContextText(e){ne=e},get quotedContextText(){return D},set quotedContextText(e){D=e},get customPrompts(){return re},set customPrompts(e){re=e},get selectedPromptIndex(){return ie},set selectedPromptIndex(e){ie=e},get draggedItemIndex(){return ae},set draggedItemIndex(e){ae=e},get systemPrompt(){return oe},set systemPrompt(e){oe=e},get agentPlatform(){return le},set agentPlatform(e){Object.assign(le,e)},get inputHistory(){return se},set inputHistory(e){se=e},get inputHistoryIndex(){return ce},set inputHistoryIndex(e){ce=e},get chatConfig(){return O},set chatConfig(e){O=e},get temperature(){return ue},set temperature(e){ue=e},get topP(){return de},set topP(e){de=e},get selectedTempIndex(){return fe},set selectedTempIndex(e){fe=e},get currentCategory(){return pe},set currentCategory(e){pe=e},get currentSearch(){return me},set currentSearch(e){me=e},get enabledTools(){return he},set enabledTools(e){he=e},get collapsedCategories(){return ge},get sessionExecutionStatus(){return k},set sessionExecutionStatus(e){k=e},get currentExecutionStatus(){return k.get(C)||null},set currentExecutionStatus(e){e===null?k.delete(C):k.set(C,e)},get executionLogListener(){return _e},set executionLogListener(e){_e=e},get pendingCancelApi(){return A.get(C)||null},set pendingCancelApi(e){e===null?A.delete(C):A.set(C,e)},get pendingCancelApiMap(){return A},get pendingCallApiSessionIds(){return ve},set pendingCallApiSessionIds(e){ve=e},get substituteLoadingIds(){return ye},set substituteLoadingIds(e){ye=e},get currentClarifyToolCallId(){return be},set currentClarifyToolCallId(e){be=e},get currentClarifySessionId(){return xe},set currentClarifySessionId(e){xe=e},get currentConfirmToolCallId(){return Se},set currentConfirmToolCallId(e){Se=e},get currentConfirmSessionId(){return Ce},set currentConfirmSessionId(e){Ce=e},get clarifyTimerInterval(){return j},set clarifyTimerInterval(e){j=e},get clarifyTimeoutValue(){return we},set clarifyTimeoutValue(e){we=e},get messageTocContainer(){return Te},set messageTocContainer(e){Te=e},get isMouseOverToc(){return Ee},set isMouseOverToc(e){Ee=e},get tocHideTimer(){return De},set tocHideTimer(e){De=e},get lastSelectedText(){return Oe},set lastSelectedText(e){Oe=e},get currentSelectionRange(){return ke},set currentSelectionRange(e){ke=e},get lastMouseX(){return M},set lastMouseX(e){M=e},get lastMouseY(){return Ae},set lastMouseY(e){Ae=e},get pendingDeleteIndex(){return je},set pendingDeleteIndex(e){je=e},get enableImageInput(){return Me},set enableImageInput(e){Me=e},get imageModelName(){return Ne},set imageModelName(e){Ne=e},get imageApiBase(){return Pe},set imageApiBase(e){Pe=e},get imageApiKey(){return Fe},set imageApiKey(e){Fe=e},get attachedImages(){return Ie},set attachedImages(e){Ie=e},get isScrolling(){return Le},set isScrolling(e){Le=e}},Re=t,P=[{label:`精准编码`,temp:.2,topP:1,tip:`较低随机性，适合业务开发、调试、纠错`},{label:`均衡开发`,temp:.45,topP:.9,tip:`兼顾稳定性，用于封装工具类、常规脚本`},{label:`架构探索`,temp:.65,topP:.9,tip:`提供多种实现思路，用于组件重构、方案对比`},{label:`创意发散`,temp:.9,topP:.9,tip:`随机性较高，仅用于原型探索，不建议生产代码`}],ze={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,content_extraction:`📄 内容提取`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_output:`📷 媒体与输出`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,local_agent:`🖥️ 本地Agent`};function F(e,t=`info`,n=3e3){let r=document.getElementById(`toastContainer`);if(!r)return;let i=document.createElement(`div`);i.className=`toast ${t}`,i.textContent=e,r.appendChild(i),requestAnimationFrame(()=>{i.classList.add(`toast-show`)}),setTimeout(()=>{i.classList.remove(`toast-show`),setTimeout(()=>{i.parentNode&&i.parentNode.removeChild(i)},300)},n)}function Be(){let e=document.getElementById(`userInput`);e&&(e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,100)+`px`)}function I(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function Ve(e){return!e||e<0?`0ms`:e<1e3?`${Math.round(e)}ms`:e<6e4?`${(e/1e3).toFixed(1)}s`:`${Math.floor(e/6e4)}分${(e%6e4/1e3).toFixed(1)}秒`}function He(e,t){navigator.clipboard.writeText(e).then(()=>{let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(n=>{console.error(`[SidePanel] 复制失败:`,n);let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败`,`error`)}document.body.removeChild(r)})}function Ue(){let e=new Date().toLocaleString(`zh-CN`),t=``;if(N.agentPlatform&&N.agentPlatform.connected){let e=N.agentPlatform;t=`\n- 本地 Agent：${e.platformName} (${e.arch})，默认 shell: ${e.shell}，工作目录: ${e.workdir||`未设置`}`}let n=`

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
   - 指定执行策略：sequential（顺序执行）、parallel（并行执行）或 conditional（条件执行）`;return N.systemPrompt&&N.systemPrompt.trim()?`${N.systemPrompt}

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${e}${t}${n}
`:`你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题
- **任务规划**：能够将复杂任务拆解为多个子任务，规划执行顺序和所需工具${n}

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理
6. **任务驱动**：复杂任务先规划后执行，使用 plan_task 工具进行拆解

## 当前环境
- 运行环境：Chrome 浏览器扩展（Side Panel）
- 操作系统：Windows 10.0
- 当前时间：${e}${t}
`}function We(){return new Promise(e=>{chrome.storage.local.get([`temperature`,`topP`],t=>{e({temperature:t.temperature===void 0?parseFloat(N.temperature.toFixed(2)):parseFloat(t.temperature.toFixed(2)),top_p:t.topP===void 0?parseFloat(N.topP.toFixed(2)):parseFloat(t.topP.toFixed(2))})})})}function Ge(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(N.chatConfig=t,console.log(`[SidePanel] 对话配置已加载:`,N.chatConfig)),e(t)})})}async function Ke(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(N.chatConfig=t,console.log(`[SidePanel] 同步加载对话配置:`,N.chatConfig)),e()})})}async function qe(){return new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>{t&&t.length>0&&t[0].id?(N.currentTabId=t[0].id,console.log(`[SidePanel] 获取当前 Tab ID:`,N.currentTabId,`URL:`,t[0].url),e(N.currentTabId)):(console.warn(`[SidePanel] 未获取到有效的 Tab ID`),e(null))})})}function Je(){return new Promise(e=>{chrome.storage.local.get([`reactMaxIterations`,`reactApiTimeout`,`reactLoopTimeout`,`reactToolTimeout`,`reactClarifyTimeout`],t=>{e({maxIterations:t.reactMaxIterations||30,apiTimeout:t.reactApiTimeout||6e4,loopTimeout:t.reactLoopTimeout||3e5,toolTimeout:t.reactToolTimeout||3e4,clarifyTimeout:t.reactClarifyTimeout||18e4})})})}function Ye(e){if(!e||!e.trim()||e.trim()==`/`)return;let t=e.trim(),n=N.inputHistory.indexOf(t);n!==-1&&N.inputHistory.splice(n,1),N.inputHistory.push(t),N.inputHistory.length>N.chatConfig.maxInputHistory&&N.inputHistory.shift(),Xe()}function Xe(){try{chrome.storage.local.set({inputHistory:N.inputHistory}),console.log(`[SidePanel] 输入历史已保存，数量:`,N.inputHistory.length)}catch(e){console.error(`[SidePanel] 保存输入历史失败:`,e)}}function Ze(){document.addEventListener(`mouseover`,Qe,!0),document.addEventListener(`mouseout`,$e,!0),console.log(`[SidePanel] 消息目录功能已初始化`)}function Qe(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){N.isMouseOverToc=!0;return}let t=e.target.closest(`.message.assistant`);if(!t)return;let n=t.querySelectorAll(`.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6`);if(n.length===0){tt();return}et(t,n)}function $e(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){N.isMouseOverToc=!1,N.tocHideTimer&&=(clearTimeout(N.tocHideTimer),null);return}if(!e.target.closest(`.message.assistant`))return;let t=e.relatedTarget;t&&(t.closest(`.message-toc-container`)||t.closest(`.message.assistant`))||N.isMouseOverToc||(N.tocHideTimer&&clearTimeout(N.tocHideTimer),N.tocHideTimer=setTimeout(()=>{N.isMouseOverToc||tt(),N.tocHideTimer=null},800))}function et(e,t){let n=Array.from(t);N.messageTocContainer&&tt(),n.forEach((e,t)=>{e.id||=`toc-heading-${Date.now()}-${t}`});let r=document.createElement(`div`);r.className=`message-toc-container`,r.dataset.headingsCount=n.length;let i=0,a=n.map(e=>{let t=parseInt(e.tagName.charAt(1)),n=e.textContent.trim(),r=n.length>30?n.substring(0,30)+`...`:n,a=`H${t}`;return i++,`
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
  `,document.body.appendChild(r),N.messageTocContainer=r;let o=e.getBoundingClientRect(),s=window.innerWidth-280;o.right<s&&(r.style.left=o.right+`px`,r.style.right=`0`,r.style.width=`auto`);let c=r.querySelector(`.message-toc-toggle`),l=r.querySelector(`.message-toc-panel`);c.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),c.addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),l.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),r.querySelectorAll(`.message-toc-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.target,n=document.getElementById(t);n&&(n.scrollIntoView({behavior:`smooth`,block:`start`}),n.classList.add(`toc-highlight`),setTimeout(()=>{n.classList.remove(`toc-highlight`)},1500))})})}function tt(){N.tocHideTimer&&=(clearTimeout(N.tocHideTimer),null),N.messageTocContainer&&=(N.messageTocContainer.remove(),null)}function nt(e){return`${Math.floor(e/60)}:${(e%60).toString().padStart(2,`0`)}`}function rt(e=`default`){try{let t=new(window.AudioContext||window.webkitAudioContext),n=t.createOscillator(),r=t.createGain();n.connect(r),r.connect(t.destination);let i={default:{frequency:800,duration:.3},success:{frequency:523,duration:.2},warning:{frequency:440,duration:.4},error:{frequency:220,duration:.5}},a=i[e]||i.default;n.frequency.value=a.frequency,n.type=`sine`,r.gain.setValueAtTime(.3,t.currentTime),r.gain.exponentialRampToValueAtTime(.01,t.currentTime+a.duration),n.start(t.currentTime),n.stop(t.currentTime+a.duration),console.log(`[SidePanel] 提示音已播放:`,e)}catch(e){console.error(`[SidePanel] 播放提示音失败:`,e.message)}}function it(e,t){let n=document.getElementById(`clarifyTimer`),r=document.getElementById(`clarifyTimerText`);if(!n||!r)return;r.textContent=`剩余时间: ${nt(e)}`;let i=e/t*100;n.classList.remove(`warning`,`critical`),e<=10?(n.classList.add(`critical`),r.textContent=`即将超时: ${nt(e)}`):(e<=30||i<=15)&&n.classList.add(`warning`),e===30&&rt(`warning`)}function at(e){ot(),N.clarifyTimeoutValue=e;let t=Math.ceil(e/1e3),n=t;it(n,t),N.clarifyTimerInterval=setInterval(()=>{n--,n<=0?ot():it(n,t)},1e3)}function ot(){N.clarifyTimerInterval&&=(clearInterval(N.clarifyTimerInterval),null)}function st(e){console.log(`[SidePanel] 显示澄清对话框:`,e);let{question:t,recommendedOption:n,allowCustomInput:r=!0,allowAdditionalInfo:i=!0,toolCallId:a,timeout:o=18e4,sessionId:s}=e,c=Array.isArray(e.options)?e.options:e.options?[String(e.options)]:[];N.currentClarifyToolCallId=a,N.currentClarifySessionId=s||null;let l=document.getElementById(`clarifySessionName`);if(l)if(s&&N.sessions){let e=N.sessions.find(e=>e.id===s);e?(l.textContent=`会话: ${e.title}`,l.style.display=`block`):(l.textContent=`会话: ${s.substring(0,8)}...`,l.style.display=`block`)}else l.textContent=``,l.style.display=`none`;let u=n!==void 0&&n>=0?n:0,d=[u],f=u,p=document.getElementById(`clarifyQuestion`);p&&(p.textContent=t);let m=document.getElementById(`clarifyOptionsList`);if(m&&(document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.remove()}),c.forEach((e,t)=>{let n=d.includes(t),r=document.createElement(`div`);r.className=`clarify-option-item ${f===t?`selected`:``} ${n?`recommended`:``}`,r.dataset.index=t,r.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${e}${n?`<span class="clarify-option-badge">推荐</span>`:``}</div>
      `,r.addEventListener(`click`,()=>lt(t)),m.appendChild(r)}),r)){let e=document.createElement(`div`);e.className=`clarify-option-item`,e.dataset.index=-1,e.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `,e.addEventListener(`click`,()=>lt(-1)),m.appendChild(e);let t=document.getElementById(`clarifyCustomInput`);t&&m.appendChild(t)}let h=document.getElementById(`clarifyCustomInput`);h&&h.classList.remove(`show`);let g=document.getElementById(`clarifyAdditionalInfo`);g&&g.classList.toggle(`show`,i);let _=document.getElementById(`clarifyCustomTextarea`);_&&(_.value=``);let v=document.getElementById(`clarifyAdditionalTextarea`);v&&(v.value=``);let y=document.getElementById(`clarifyOverlay`);y&&y.classList.add(`show`),at(o),console.log(`[SidePanel] 澄清对话框已显示`)}function ct(){let e=document.getElementById(`clarifyOverlay`);e&&e.classList.remove(`show`),N.currentClarifyToolCallId=null,N.currentClarifySessionId=null,ot(),console.log(`[SidePanel] 澄清对话框已隐藏`)}function lt(e){document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.classList.remove(`selected`)});let t=document.querySelector(`.clarify-option-item[data-index="${e}"]`);t&&t.classList.add(`selected`);let n=document.getElementById(`clarifyCustomInput`);if(n)if(e===-1){n.classList.add(`show`);let e=document.getElementById(`clarifyCustomTextarea`);e&&e.focus()}else n.classList.remove(`show`);console.log(`[SidePanel] 选择澄清选项:`,e)}function ut(){if(!N.currentClarifyToolCallId){console.error(`[SidePanel] 没有当前工具调用ID`);return}let e=-1;document.querySelectorAll(`.clarify-option-item`).forEach((t,n)=>{t.classList.contains(`selected`)&&(e=parseInt(t.dataset.index))});let t=document.getElementById(`clarifyCustomTextarea`),n=t?t.value.trim():``,r=document.getElementById(`clarifyAdditionalTextarea`),i=r?r.value.trim():``,a={type:`CLARIFY_RESPONSE`,toolCallId:N.currentClarifyToolCallId,selectedOption:e,customInput:n,additionalInfo:i};console.log(`[SidePanel] 发送澄清响应:`,a),chrome.runtime.sendMessage(a),ct()}function dt(){if(N.currentClarifyToolCallId){let e={type:`CLARIFY_RESPONSE`,toolCallId:N.currentClarifyToolCallId,selectedOption:-1,customInput:``,additionalInfo:``};chrome.runtime.sendMessage(e)}ct()}function ft(){let e=document.getElementById(`clarifyConfirmBtn`);e&&e.addEventListener(`click`,ut);let t=document.getElementById(`clarifyCancelBtn`);t&&t.addEventListener(`click`,dt),chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.type===`SHOW_CLARIFY_DIALOG`)console.log(`[SidePanel] 收到澄清请求:`,e,`当前激活会话:`,N.activeSessionId),st(e.data),n({success:!0});else if(e.type===`PLAY_NOTIFICATION_SOUND`)console.log(`[SidePanel] 收到播放提示音请求:`,e),rt(e.soundType),n({success:!0});else if(e.type===`CLARIFY_TIMEOUT`){if(console.log(`[SidePanel] 收到澄清超时通知:`,e),e.sessionId&&N.currentClarifySessionId&&e.sessionId!==N.currentClarifySessionId){console.log(`[SidePanel] 澄清超时来自其他会话，忽略`);return}let t=document.getElementById(`clarifyTimer`),n=document.getElementById(`clarifyTimerText`);t&&n&&(t.classList.remove(`warning`),t.classList.add(`critical`),n.textContent=`已超时`),rt(`error`)}}),console.log(`[SidePanel] 澄清对话框事件已初始化`)}var pt=null;function mt(e){let{toolName:t,toolLabel:n,args:r,message:i,toolCallId:a,sessionId:o,timeout:s=3e4}=e;console.log(`[SidePanel] 显示确认对话框:`,t,e),N.currentConfirmToolCallId=a,N.currentConfirmSessionId=o||null;let c=document.getElementById(`confirmOverlay`);if(!c)return;document.getElementById(`confirmToolName`).textContent=n||t;let l=document.getElementById(`confirmArgsSummary`);if(l&&r){let e=Object.entries(r).filter(([e,t])=>t!=null&&t!==``).slice(0,5);e.length>0?(l.innerHTML=e.map(([e,t])=>`<span class="confirm-arg"><strong>${e}:</strong> ${typeof t==`string`?t.substring(0,50):JSON.stringify(t).substring(0,50)}</span>`).join(``),l.style.display=`block`):l.style.display=`none`}let u=document.getElementById(`confirmMessage`);return u&&(u.textContent=i||`模型请求执行操作: ${n||t}`),c.style.display=`flex`,new Promise(e=>{pt=e,setTimeout(()=>{pt&&(console.log(`[SidePanel] 确认对话框超时，自动拒绝`),ht(!1))},s)})}function ht(e){let t=document.getElementById(`confirmOverlay`);t&&(t.style.display=`none`),chrome.runtime.sendMessage({type:`TOOL_CONFIRMATION_RESPONSE`,toolCallId:N.currentConfirmToolCallId,confirmed:e,sessionId:N.currentConfirmSessionId}).catch(e=>{console.log(`[SidePanel] 发送确认响应失败:`,e.message)}),N.currentConfirmToolCallId=null,N.currentConfirmSessionId=null,pt&&=(pt(e),null)}function gt(){let e=document.getElementById(`confirmApproveBtn`),t=document.getElementById(`confirmDenyBtn`);e&&e.addEventListener(`click`,()=>ht(!0)),t&&t.addEventListener(`click`,()=>ht(!1)),chrome.runtime.onMessage.addListener((e,t,n)=>e.type===`SHOW_CONFIRM_DIALOG`?(mt(e.data),n({received:!0}),!1):!1)}var L=null,R=1,_t=.25,vt=2,yt=.1;function bt(e){let t=e.trim();return/^\s*<!DOCTYPE\s/i.test(t)||/^\s*<html[\s>]/i.test(t)?/<\/head>/i.test(t)?t.replace(/<\/head>/i,`<style>html,body{overflow:auto!important;height:auto!important;}</style></head>`):/<body[\s>]/i.test(t)?t.replace(/<body([\s>])/i,`<body$1<style>html,body{overflow:auto!important;height:auto!important;}</style>`):t:`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;overflow:auto;">${t}</body>
</html>`}function xt(e){console.log(`[SidePanel] 显示 UI 原型预览:`,e),L=e,zt();let t=document.getElementById(`prototypeTitle`),n=document.getElementById(`prototypeDescription`),r=document.getElementById(`prototypeIframe`);t&&(t.textContent=e.title||`UI 原型预览`),n&&(n.textContent=e.description||``,n.style.display=e.description?`block`:`none`),r&&e.html&&(r.srcdoc=bt(e.html));let i=document.getElementById(`prototypeOverlay`);i&&i.classList.add(`show`),console.log(`[SidePanel] UI 原型预览弹窗已显示`)}function St(){let e=document.getElementById(`prototypeOverlay`);e&&e.classList.remove(`show`);let t=document.getElementById(`prototypeIframe`);t&&(t.srcdoc=``),L=null,console.log(`[SidePanel] UI 原型预览弹窗已隐藏`)}function Ct(){if(!L)return;let e=L.id,t=L.title||`原型`;St();let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 继续优化原型:`,e)}function wt(){if(!L||!L.html){console.error(`[SidePanel] 没有可下载的原型`);return}let e=bt(L.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t),r=document.createElement(`a`);r.href=n,r.download=(L.title||`prototype`).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)+`.html`,document.body.appendChild(r),r.click(),document.body.removeChild(r),URL.revokeObjectURL(n),console.log(`[SidePanel] 原型已下载:`,r.download)}function Tt(){if(!L||!L.html){console.error(`[SidePanel] 没有可打开的原型`);return}let e=bt(L.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t);chrome.tabs.create({url:n,active:!0}),console.log(`[SidePanel] 原型已在新标签页打开`)}async function Et(e){try{let t=await y(e);if(!t){console.error(`[SidePanel] 未找到原型:`,e);return}xt(t)}catch(e){console.error(`[SidePanel] 加载原型失败:`,e)}}async function Dt(){let e=document.getElementById(`prototypeLibraryList`),t=document.getElementById(`prototypeLibraryModal`);if(!(!e||!t)){e.innerHTML=`<div class="prototype-library-empty">加载中...</div>`;try{let e=await i();Ot(e),kt(e)}catch(t){console.error(`[SidePanel] 加载原型库失败:`,t),e.innerHTML=`<div class="prototype-library-empty">加载失败</div>`}t.classList.add(`show`),console.log(`[SidePanel] 原型库已显示`)}}function Ot(e){let t=document.getElementById(`prototypeLibraryList`);t&&(e.length===0?t.innerHTML=`<div class="prototype-library-empty">暂无原型</div>`:(t.innerHTML=e.map(e=>{let t=e.id.replace(`proto_`,``).slice(-6);return`
        <div class="prototype-library-item" data-id="${e.id}">
          <div class="prototype-library-item-info">
            <div class="prototype-library-item-title" title="${Pt(e.title)}">${Pt(e.title)}</div>
            ${e.description?`<div class="prototype-library-item-desc">${Pt(e.description)}</div>`:``}
            <div class="prototype-library-item-meta">
              <span class="prototype-library-item-id">ID: ${t}</span>
              <span class="prototype-library-item-time">${Ft(e.createdAt)}</span>
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
      `}).join(``),t.querySelectorAll(`.prototype-library-item`).forEach(e=>{let t=e.querySelector(`.prototype-library-item-info`),n=e.querySelector(`.prototype-library-item-open`),r=e.querySelector(`.prototype-library-item-optimize`),i=e.querySelector(`.prototype-library-item-delete`);t&&t.addEventListener(`click`,()=>{let t=e.dataset.id;Et(t),At()}),n&&n.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.id;Et(n),At()}),r&&r.addEventListener(`click`,t=>{t.stopPropagation();let n=r.dataset.id;jt(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`),At()}),i&&i.addEventListener(`click`,t=>{t.stopPropagation();let n=i.dataset.id;Mt(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`)})})))}function kt(e){let t=()=>{let t=document.getElementById(`prototypeLibrarySearch`),n=document.getElementById(`prototypeLibrarySort`),r=(t?.value||``).trim().toLowerCase(),i=n?.value||`createdAt_desc`,a=e;r&&(a=e.filter(e=>(e.title||``).toLowerCase().includes(r)||(e.description||``).toLowerCase().includes(r)));let[o,s]=i.split(`_`);a=[...a].sort((e,t)=>{let n;return n=o===`title`?(e.title||``).localeCompare(t.title||``,`zh-CN`):(e.createdAt||0)-(t.createdAt||0),s===`desc`?-n:n}),Ot(a)},n=document.getElementById(`prototypeLibrarySearch`),r=document.getElementById(`prototypeLibrarySort`);if(n){let e=n.cloneNode(!0);n.parentNode.replaceChild(e,n),e.addEventListener(`input`,t)}if(r){let e=r.cloneNode(!0);r.parentNode.replaceChild(e,r),e.addEventListener(`change`,t)}}function At(){let e=document.getElementById(`prototypeLibraryModal`);e&&e.classList.remove(`show`),console.log(`[SidePanel] 原型库已隐藏`)}function jt(e,t){let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 从原型库继续优化原型:`,e)}async function Mt(e,t){if(await Nt(`确认删除`,`确定删除原型 "${t}" 吗？此操作不可撤销。`,`删除`))try{await u(e),console.log(`[SidePanel] 原型已删除:`,e),Dt()}catch(e){console.error(`[SidePanel] 删除原型失败:`,e),alert(`删除失败: `+e.message)}}function Nt(e,t,n=`确认`){return new Promise(r=>{let i=document.getElementById(`genericConfirmModal`),a=document.getElementById(`genericConfirmTitle`),o=document.getElementById(`genericConfirmMessage`),s=document.getElementById(`genericConfirmOkBtn`),c=document.getElementById(`genericConfirmCancelBtn`);if(!i){r(confirm(t));return}a.textContent=e,o.textContent=t,s.textContent=n;let l=()=>{i.classList.remove(`show`),s.removeEventListener(`click`,u),c.removeEventListener(`click`,d)},u=()=>{l(),r(!0)},d=()=>{l(),r(!1)};s.addEventListener(`click`,u),c.addEventListener(`click`,d),i.classList.add(`show`)})}function Pt(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function Ft(e){if(!e)return``;let t=new Date(e),n=new Date-t;return n<6e4?`刚刚`:n<36e5?Math.floor(n/6e4)+` 分钟前`:n<864e5?Math.floor(n/36e5)+` 小时前`:t.toLocaleDateString(`zh-CN`)}function It(e){R=Math.max(_t,Math.min(vt,e)),R=Math.round(R*100)/100;let t=document.getElementById(`prototypeIframe`),n=document.getElementById(`prototypeZoomLevel`);t&&(t.style.zoom=R),n&&(n.textContent=Math.round(R*100)+`%`,R===1?n.classList.remove(`zoomed`):n.classList.add(`zoomed`))}function Lt(){It(R+yt),Bt()}function Rt(){It(R-yt),Bt()}function zt(){It(1)}function Bt(){let e=document.getElementById(`prototypeZoomLevel`);e&&(e.classList.add(`flash`),setTimeout(()=>e.classList.remove(`flash`),150))}function Vt(e){!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.deltaY<0?Lt():Rt())}function Ht(e){(e.ctrlKey||e.metaKey)&&e.key===`0`&&(e.preventDefault(),zt())}function Ut(){let e=document.getElementById(`prototypeCloseBtn`);e&&e.addEventListener(`click`,St);let t=document.getElementById(`prototypeDownloadBtn`);t&&t.addEventListener(`click`,wt);let n=document.getElementById(`prototypeOpenTabBtn`);n&&n.addEventListener(`click`,Tt);let r=document.getElementById(`prototypeContinueBtn`);r&&r.addEventListener(`click`,Ct);let i=document.getElementById(`prototypeZoomInBtn`);i&&i.addEventListener(`click`,Lt);let a=document.getElementById(`prototypeZoomOutBtn`);a&&a.addEventListener(`click`,Rt);let o=document.getElementById(`prototypeZoomLevel`);o&&o.addEventListener(`click`,zt);let s=document.getElementById(`prototypeContent`);s&&s.addEventListener(`wheel`,Vt,{passive:!1}),document.addEventListener(`keydown`,Ht);let c=document.getElementById(`prototypeLibraryCloseBtn`);c&&c.addEventListener(`click`,At),chrome.runtime.onMessage.addListener((e,t,n)=>{e.type===`SHOW_UI_PROTOTYPE`&&(console.log(`[SidePanel] 收到显示原型请求:`,e),Et(e.data.prototypeId),n({success:!0}))}),console.log(`[SidePanel] UI 原型模块事件已初始化`)}function Wt(e){if(!e)return``;let t=[];e=e.replace(/```mermaid\n?([\s\S]*?)```/g,(e,n)=>{let r=t.length;return t.push(n.trim()),`%%MERMAID_BLOCK_${r}%%`});let n=[];e=e.replace(/```(\w*)\n?([\s\S]*?)```/g,(e,t,r)=>{let i=n.length;return n.push({language:t||`text`,content:r.trim()}),`%%CODE_BLOCK_${i}%%`});let r=[];e=e.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(e,t,n,i)=>{let a=r.length;return r.push({header:t,separator:n,body:i,full:e.trim()}),`\n%%TABLE_BLOCK_${a}%%\n`});let i=``;return typeof marked<`u`?(marked.setOptions({breaks:!0,gfm:!0}),i=marked.parse(e)):i=e.replace(/`([^`]+)`/g,`<code>$1</code>`).replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`).replace(/\*([^*]+)\*/g,`<em>$1</em>`).replace(/\n/g,`<br>`),t.forEach((e,t)=>{i=i.replace(`%%MERMAID_BLOCK_${t}%%`,`<div class="mermaid" data-raw-code="${encodeURIComponent(e)}">${e}</div>`)}),n.forEach((e,t)=>{let n=e.content.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`);i=i.replace(`%%CODE_BLOCK_${t}%%`,`<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${t}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${e.language}">${n}</code></pre>
      </div>`)}),r.forEach((e,t)=>{i=i.replace(`%%TABLE_BLOCK_${t}%%`,Kt(e))}),i}function Gt(e){if(!e)return``;let t=e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`);return t=t.replace(/`([^`]+)`/g,`<code>$1</code>`),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/\*([^*]+)\*/g,`<em>$1</em>`),t=t.replace(/~~([^~]+)~~/g,`<del>$1</del>`),t}function Kt(e){let{header:t,body:n,full:r}=e,i=window.__tableBlocks?window.__tableBlocks.length:0;window.__tableBlocks&&(window.__tableBlocks[i]={full:r,header:t,body:n});let a=t.split(`|`).filter(e=>e.trim()).map(e=>Gt(e.trim())),o=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>Gt(e.trim()))),s=`<div class="table-container-wrapper"><table>`;return s+=`<thead><tr>`,a.forEach((e,t)=>{t===a.length-1?s+=`<th class="table-header-cell-wrapper">
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
      </th>`:s+=`<th>${e}</th>`}),s+=`</tr></thead>`,s+=`<tbody>`,o.forEach(e=>{s+=`<tr>`,e.forEach(e=>{s+=`<td>${e}</td>`}),s+=`</tr>`}),s+=`</tbody>`,s+=`</table></div>`,s}function qt(e){try{let{header:t,body:n}=e,r=t.split(`|`).filter(e=>e.trim()).map(e=>e.trim()),i=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>e.trim())),a=`﻿`;a+=r.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`,i.forEach(e=>{a+=e.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`});let o=new Blob([a],{type:`text/csv;charset=utf-8;`}),s=document.createElement(`a`),c=URL.createObjectURL(o);s.setAttribute(`href`,c),s.setAttribute(`download`,`table-${Date.now()}.csv`),s.style.visibility=`hidden`,document.body.appendChild(s),s.click(),document.body.removeChild(s),console.log(`[SidePanel] Excel 下载成功`)}catch(e){console.error(`[SidePanel] 下载 Excel 失败:`,e),F(`下载失败: `+e.message,`error`)}}async function Jt(){if(typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}console.log(`[SidePanel] ===== renderMermaidCharts 开始 =====`);let e=document.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,e.length),e.length!==0){for(let t=0;t<e.length;t++){let n=e[t];try{await mermaid.run({nodes:[n]}),console.log(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染成功`),Yt(n)}catch(e){console.error(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染失败:`,e),!n.querySelector(`svg`)&&!n.querySelector(`.mermaid-controls`)&&(n.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${e.message}</div>`)}}console.log(`[SidePanel] ===== renderMermaidCharts 完成 =====`)}}function z(e){return e?`<div class="markdown-body">${Wt(e)}</div>`:``}function Yt(e){if(e.querySelector(`.mermaid-controls`)){console.log(`[SidePanel] 工具栏已存在，跳过`);return}let t=e.querySelector(`svg`);if(!t){console.warn(`[SidePanel] SVG 元素未找到，当前内容:`,e.innerHTML.substring(0,100));return}console.log(`[SidePanel] 找到 SVG 元素，开始添加工具栏`),console.log(`[SidePanel] container 类名:`,e.className),console.log(`[SidePanel] container HTML:`,e.innerHTML.substring(0,200)),e.style.position=`relative`,e.style.cursor=`grab`,e.style.userSelect=`none`,e.style.webkitUserSelect=`none`;let n=e.querySelector(`.mermaid-svg-wrapper`);if(!n){n=document.createElement(`div`),n.className=`mermaid-svg-wrapper`,n.style.transformOrigin=`center center`,n.style.transition=`transform 0.2s ease`,n.style.display=`inline-block`,n.style.width=`100%`,t.style.maxWidth=`100%`,t.style.height=`auto`,t.style.userSelect=`none`,t.style.webkitUserSelect=`none`,n.appendChild(t),e.insertBefore(n,e.firstChild);let r=[];Array.from(e.childNodes).forEach(e=>{e.nodeType===Node.TEXT_NODE&&e.textContent.trim()&&r.push(e)}),r.forEach(e=>e.remove())}let r=document.createElement(`div`);r.className=`mermaid-controls`,r.innerHTML=`
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
  `,e.appendChild(r),console.log(`[SidePanel] 工具栏 HTML 已添加`),console.log(`[SidePanel] container 子元素:`,Array.from(e.children).map(e=>e.className).join(`, `));let i=1,a=.3,o=.15,s=e.dataset.rawCode||``;if(!s){let e=t.querySelector(`title`);e&&e.textContent&&(s=e.textContent.trim())}if(!s){let e=t.querySelector(`script[type="text/plain"]`);e&&(s=e.textContent.trim())}s&&!e.dataset.rawMermaidCode&&(e.dataset.rawMermaidCode=s),r.querySelector(`.view-source`).addEventListener(`click`,r=>{r.stopPropagation();let s=e.getAttribute(`data-raw-code`);Qt(e,s?decodeURIComponent(s):e.dataset.rawMermaidCode||``,n,t,i,{MIN_SCALE:a,MAX_SCALE:10,SCALE_STEP:o})}),r.querySelector(`.copy-to-clipboard`).addEventListener(`click`,e=>{e.stopPropagation(),Xt(t,n,i)}),r.querySelector(`.download-png`).addEventListener(`click`,e=>{e.stopPropagation(),Zt(t,i)}),e.addEventListener(`wheel`,e=>{!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.stopPropagation(),i=e.deltaY<0?Math.min(10,i+o):Math.max(a,i-o),p())},{passive:!1});let c=!1,l,u,d=0,f=0;function p(){n.style.transform=`translate(${d}px, ${f}px) scale(${i})`}r.querySelector(`.zoom-in`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.min(10,i+o),p()}),r.querySelector(`.zoom-out`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.max(a,i-o),p()}),r.querySelector(`.reset-zoom`).addEventListener(`click`,e=>{e.stopPropagation(),i=1,d=0,f=0,p()}),e.addEventListener(`mousedown`,t=>{t.target.tagName!==`BUTTON`&&(c=!0,l=t.clientX-d,u=t.clientY-f,e.style.cursor=`grabbing`)}),document.addEventListener(`mousemove`,e=>{c&&(d=e.clientX-l,f=e.clientY-u,p())}),document.addEventListener(`mouseup`,()=>{c&&(c=!1,e.style.cursor=`grab`)})}async function Xt(e,t,n){try{console.log(`[SidePanel] 开始复制到剪贴板`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){if(e)if(navigator.clipboard&&typeof ClipboardItem<`u`)navigator.clipboard.write([new ClipboardItem({"image/png":e})]).then(()=>{console.log(`[SidePanel] 图片复制到剪贴板成功`),F(`Mermaid 图表已复制到剪贴板！`,`success`)}).catch(e=>{console.error(`[SidePanel] 复制到剪贴板失败:`,e),F(`复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。`,`error`)});else{console.warn(`[SidePanel] Clipboard API 不可用，降级为下载`),F(`当前浏览器不支持图片复制功能，已自动转为下载。`,`warning`);let t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(t),t.click(),document.body.removeChild(t)}},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] 图片转换失败:`,e),F(`图片转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 复制到剪贴板失败:`,e),F(`复制失败: `+e.message,`error`)}}function Zt(e,t){try{console.log(`[SidePanel] 开始下载 PNG`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){console.log(`[SidePanel] SVG 图片加载成功`);let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){let t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t),console.log(`[SidePanel] PNG 下载成功`)},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] PNG 转换失败:`,e),F(`PNG 转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 下载 PNG 失败:`,e),F(`下载失败: `+e.message,`error`)}}function Qt(e,t,n,r,i,a){let o=e.querySelector(`.mermaid-source-view`),s=e.querySelector(`.mermaid-controls`);if(o)o.parentElement&&o.parentElement.remove(),n&&(n.style.display=`inline-block`),Yt(e);else{n&&(n.style.display=`none`),s&&s.remove();let o=document.createElement(`div`);o.className=`mermaid-container-wrapper`,o.style.position=`relative`;let c=document.createElement(`pre`);c.className=`mermaid-source-view`,c.style.position=`relative`,c.textContent=t;let l=document.createElement(`button`);l.className=`source-copy-btn`,l.title=`复制源代码`,l.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `,l.addEventListener(`click`,e=>{e.stopPropagation(),He(t,l)});let u=document.createElement(`button`);u.className=`source-copy-btn`,u.style.right=`44px`,u.title=`返回图表`,u.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `,u.addEventListener(`click`,o=>{o.stopPropagation(),Qt(e,t,n,r,i,a)}),c.appendChild(l),c.appendChild(u),o.appendChild(c),e.appendChild(o)}}async function $t(e){if(console.log(`[SidePanel] ===== renderMessageMermaid 开始 =====`),typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}await new Promise(e=>setTimeout(e,300));let t=e.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,t.length),t.length===0){console.log(`[SidePanel] 未找到 mermaid 元素`);return}try{for(let n=0;n<t.length;n++){let r=t[n];try{await mermaid.run({nodes:[r]}),console.log(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染成功`);let t=e.querySelectorAll(`.mermaid`)[n];t&&Yt(t)}catch(t){console.error(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染失败:`,t);let r=e.querySelectorAll(`.mermaid`)[n];r&&!r.querySelector(`svg`)&&!r.querySelector(`.mermaid-controls`)&&(r.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${t.message}</div>`)}}console.log(`[SidePanel] Mermaid 渲染完成`);let n=e.querySelectorAll(`.mermaid-controls`);console.log(`[SidePanel] 工具栏添加结果:`,n.length,`个成功`)}catch(e){console.error(`[SidePanel] Mermaid 渲染整体失败:`,e)}nn()}var en=!1;function tn(){if(en)return;en=!0;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{if(!e.ctrlKey&&!e.metaKey)return;let t=e.target.closest(`code`);if(!t||e.target.closest(`.code-copy-btn`))return;e.preventDefault();let n=t.textContent;n&&navigator.clipboard.writeText(n).then(()=>{F(`${t.closest(`.code-block-container`)?`代码块`:`代码`}已复制到剪贴板`,`success`)}).catch(e=>{console.error(`[SidePanel] Ctrl+单击复制失败:`,e);let t=document.createElement(`textarea`);t.value=n,t.style.position=`fixed`,t.style.left=`-999999px`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),document.body.removeChild(t),F(`代码已复制到剪贴板`,`success`)})}),console.log(`[SidePanel] Ctrl+单击复制代码事件已绑定`))}function nn(){let e=document.querySelectorAll(`.code-copy-btn`);console.log(`[SidePanel] 找到代码复制按钮数量:`,e.length),e.forEach((e,t)=>{if(e.dataset.bound){console.log(`[SidePanel] 按钮`,t,`已绑定，跳过`);return}e.dataset.bound=`true`,e.addEventListener(`click`,t=>{console.log(`[SidePanel] 代码复制按钮被点击`),t.stopPropagation();let n=e.closest(`.code-block-container`);if(console.log(`[SidePanel] 找到容器:`,!!n),n){let t=n.querySelector(`pre code`);if(console.log(`[SidePanel] 找到代码元素:`,!!t),t){let n=t.textContent;console.log(`[SidePanel] 代码长度:`,n.length),He(n,e)}}}),console.log(`[SidePanel] 已绑定按钮`,t)}),tn(),rn()}function rn(){document.querySelectorAll(`.copy-md-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&He(r.full,e)}))}),document.querySelectorAll(`.download-excel-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&qt(r)}))})}var an=!1,on=null;async function sn(){an||=(await l(),!0)}async function cn(){await sn();let[e,t]=await Promise.all([_(),c()]);return e.sort((e,t)=>e.order!==void 0&&t.order!==void 0?e.order-t.order:e.order===void 0?t.order===void 0?new Date(e.createdAt)-new Date(t.createdAt):1:-1),{activeSessionId:t,list:e}}function ln(e){return typeof e==`string`?e:Array.isArray(e)?e.filter(e=>e.type===`text`).map(e=>e.text).join(``):``}async function un(){if(!N.activeSessionId)return!1;let e=await s(N.activeSessionId);if(!e)return!1;e.model=N.currentModel,e.useTools=N.useTools,e.enabledTools=[...N.enabledTools],e.temperature=N.temperature,e.topP=N.topP;let t=N.chatConfig.maxHistoryMessages||50;e.messageHistory=N.messageHistory.slice(-t).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1,htmlContent:e.htmlContent||void 0})),e.updatedAt=new Date().toISOString();let r=N.messageHistory.find(e=>e.role===`user`);return r&&(e.title=ln(r.content).substring(0,50).replace(/\n/g,` `)),await n(e),!0}async function dn(){await sn();let e=mn(),t={id:e,title:`新会话`,model:N.currentModel,useTools:N.useTools,enabledTools:[...N.enabledTools],temperature:N.temperature,topP:N.topP,messageHistory:[],scrollPosition:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),order:Date.now(),isGenerating:!1,lastExecutionLog:[]};return await n(t),await r(e),t}async function fn(e){await sn();let t=[];for(let r of e){let e={id:mn(),title:r.title||`导入的会话`,model:r.model||N.currentModel,useTools:r.useTools===void 0?!0:r.useTools,enabledTools:r.enabledTools||[...N.enabledTools],temperature:r.temperature===void 0?N.temperature:r.temperature,topP:r.topP===void 0?N.topP:r.topP,messageHistory:(r.messageHistory||[]).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1,htmlContent:e.htmlContent||void 0})),scrollPosition:0,createdAt:r.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),order:Date.now()+t.length,isGenerating:!1,lastExecutionLog:[]};await n(e),t.push(e)}return!await c()&&t.length>0&&await r(t[0].id),t}async function pn(e,t){let r=await s(e);return r?(r.messageHistory=r.messageHistory||[],r.messageHistory.push({role:t.role,content:t.content||``,executionLog:t.executionLog||[],reflectionScore:t.reflectionScore,wasRevised:t.wasRevised||!1,htmlContent:t.htmlContent||void 0}),r.updatedAt=new Date().toISOString(),r.isGenerating=!1,await n(r),!0):!1}function mn(){return`sess_`+Date.now().toString(36)+`_`+Math.random().toString(36).substring(2,8)}async function hn(t){if(t===N.activeSessionId)return;await un(),on=N.activeSessionId;let n=await s(t);if(!n)return console.error(`[SessionStore] 找不到会话:`,t),!1;if(await r(t),N.activeSessionId=t,N.messageHistory=n.messageHistory||[],N.currentModel=n.model||N.currentModel,N.useTools=n.useTools===void 0?N.useTools:n.useTools,n.enabledTools&&n.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),r=n.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);N.enabledTools=[...r,...i]}else N.enabledTools=n.enabledTools||N.enabledTools;return N.temperature=n.temperature===void 0?N.temperature:n.temperature,N.topP=n.topP===void 0?N.topP:n.topP,n.isGenerating?N.generatingSessionIds.add(t):N.generatingSessionIds.delete(t),n}async function gn(e){let t=await _(),n=await c();if(await p(e),n===e){let n=t.filter(t=>t.id!==e);if(n.length>0){let e=n.find(e=>e.id===on);await r(e?e.id:n[0].id),on=null}else await r(null)}return!0}async function _n(e,t){let r=await s(e);return r?(r.title=t,r.updatedAt=new Date().toISOString(),await n(r),!0):!1}async function vn(e){let t=await _(),r=new Map(t.map(e=>[e.id,e])),i=[];return e.forEach((e,t)=>{let a=r.get(e);a&&(a.order=t,i.push(n(a)))}),await Promise.all(i),!0}async function yn(){if(!N.messageHistory||N.messageHistory.length===0)return;let e=await s(N.activeSessionId);if(!e)return;let t=N.messageHistory.find(e=>e.role===`user`),n=t?ln(t.content).substring(0,50).replace(/\n/g,` `):e.title||`未命名会话`,r=Date.now().toString(36)+Math.random().toString(36).substring(2,8),i=N.messageHistory.map(e=>({role:e.role,content:e.content||``})),o=await a();o.push({id:r,title:n,createdAt:new Date().toISOString(),messages:i}),o.length>20&&o.splice(0,o.length-20),await v(o);let c=await dn();return await gn(e.id),await hn(c.id),!0}async function B(){return cn()}async function bn(){return un()}async function xn(){return dn()}async function Sn(e){return hn(e)}async function Cn(e){return gn(e)}async function wn(e,t){return _n(e,t)}async function Tn(e){return vn(e)}async function En(){return yn()}async function Dn(e){return fn(e)}async function On(e,t){return pn(e,t)}var V={visible:!1,highlightIndex:-1,filteredSessions:[]},H={draggedId:null,sourceType:null};async function U(){let e=await B();N.sessions=e.list,N.activeSessionId=e.activeSessionId;let t=document.getElementById(`sessionTabs`),n=document.getElementById(`sessionTabsScroll`),r=document.getElementById(`sessionTabsActions`);!t||!n||!r||(n.innerHTML=``,e.list.forEach(e=>{let t=document.createElement(`div`);t.className=`session-tab`,t.dataset.sessionId=e.id,e.id===N.activeSessionId&&t.classList.add(`active`),t.title=e.title;let r=document.createElement(`span`);r.className=`session-tab-title`,r.textContent=e.title||`新会话`,t.appendChild(r);let i=document.createElement(`span`);if(i.className=`session-tab-close`,i.innerHTML=`&#10005;`,i.title=`关闭会话`,i.addEventListener(`click`,async t=>{t.stopPropagation(),ur(e,async()=>{await pr()})}),t.appendChild(i),e.isGenerating||N.generatingSessionIds.has(e.id)){let e=document.createElement(`span`);e.className=`session-tab-indicator`,t.appendChild(e)}t.addEventListener(`click`,async t=>{t.preventDefault(),e.id!==N.activeSessionId&&await ar(e.id)}),t.addEventListener(`contextmenu`,t=>{t.preventDefault(),dr(t,e)}),t.addEventListener(`mousedown`,async t=>{t.button===1&&(t.preventDefault(),t.stopPropagation(),await Cn(e.id),await pr())}),t.draggable=!0,t.addEventListener(`dragstart`,t=>Fn(t,e.id)),t.addEventListener(`dragover`,e=>In(e)),t.addEventListener(`dragleave`,e=>Ln(e)),t.addEventListener(`drop`,t=>Rn(t,e.id)),t.addEventListener(`dragend`,e=>zn(e)),n.appendChild(t)}),kn(),An(),tr(),cr(n),jn(n),Pn(n))}function kn(){let e=document.getElementById(`sessionTabsMore`);if(!e)return;let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`click`,e=>{e.stopPropagation(),Gn()})}function An(){let e=document.getElementById(`sessionTabsAdd`);if(!e)return;let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`click`,async()=>{await bn();let e=await xn();N.activeSessionId=e.id,N.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:e.id}})),U()})}function jn(e){let t=document.getElementById(`sessionTabsMore`);t&&(e.scrollWidth>e.clientWidth?t.style.display=`flex`:t.style.display=`none`)}var Mn=null;function Nn(){if(Mn)return;let e=document.getElementById(`sessionTabsScroll`);e&&(Mn=new ResizeObserver(()=>{requestAnimationFrame(()=>{jn(e)})}),Mn.observe(e))}function Pn(e){setTimeout(()=>{let t=e.querySelector(`.session-tab.active`);t&&t.scrollIntoView({behavior:`smooth`,block:`nearest`,inline:`center`})},50)}function Fn(e,t){H.draggedId=t,H.sourceType=`tab`,e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,t),e.currentTarget.classList.add(`dragging`)}function In(e){e.preventDefault(),e.dataTransfer.dropEffect=`move`,e.currentTarget.classList.add(`drag-over`)}function Ln(e){e.currentTarget.classList.remove(`drag-over`)}async function Rn(e,t){e.preventDefault(),e.currentTarget.classList.remove(`drag-over`);let n=H.draggedId;if(!n||n===t)return;let r=N.sessions||[],i=r.findIndex(e=>e.id===n),a=r.findIndex(e=>e.id===t);if(i===-1||a===-1)return;let o=[...r],[s]=o.splice(i,1);o.splice(a,0,s),N.sessions=o,await Tn(o.map(e=>e.id)),U()}function zn(e){e.currentTarget.classList.remove(`dragging`),document.querySelectorAll(`.session-tab.drag-over`).forEach(e=>e.classList.remove(`drag-over`)),H.draggedId=null,H.sourceType=null}function Bn(e,t){H.draggedId=t,H.sourceType=`dropdown`,e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,t),e.currentTarget.classList.add(`dragging`)}function Vn(e){e.preventDefault(),e.dataTransfer.dropEffect=`move`,e.currentTarget.classList.add(`drag-over`)}function Hn(e){e.currentTarget.classList.remove(`drag-over`)}async function Un(e,t){e.preventDefault(),e.currentTarget.classList.remove(`drag-over`);let n=H.draggedId;if(!n||n===t)return;let r=V.filteredSessions,i=r.findIndex(e=>e.id===n),a=r.findIndex(e=>e.id===t);if(i===-1||a===-1)return;let o=[...r],[s]=o.splice(i,1);o.splice(a,0,s),V.filteredSessions=o;let c=N.sessions||[],l=c.map(e=>e.id),u=new Set(o.map(e=>e.id)),d=l.filter(e=>!u.has(e)),f=[...o.map(e=>e.id),...d];N.sessions=f.map(e=>c.find(t=>t.id===e)).filter(Boolean),await Tn(f),Xn(),U()}function Wn(e){e.currentTarget.classList.remove(`dragging`),document.querySelectorAll(`.session-dropdown-item.drag-over`).forEach(e=>e.classList.remove(`drag-over`)),H.draggedId=null,H.sourceType=null}function Gn(){V.visible?qn():Kn()}async function Kn(){let e=document.getElementById(`sessionTabsMore`),t=document.getElementById(`sessionDropdown`);if(!e||!t)return;let n=await B();N.sessions=n.list,N.activeSessionId=n.activeSessionId,V.filteredSessions=[...n.list],V.highlightIndex=-1,V.visible=!0,Xn(),Yn(e,t);let r=document.getElementById(`sessionDropdownSearch`);r&&(r.value=``,setTimeout(()=>r.focus(),50)),e.classList.add(`active`),setTimeout(()=>{document.addEventListener(`click`,Jn)},0)}function qn(){let e=document.getElementById(`sessionTabsMore`),t=document.getElementById(`sessionDropdown`);t&&t.classList.remove(`show`),e&&e.classList.remove(`active`),V.visible=!1,V.highlightIndex=-1,V.filteredSessions=[],document.removeEventListener(`click`,Jn)}function Jn(e){let t=document.getElementById(`sessionDropdown`),n=document.getElementById(`sessionTabsMore`);!t||!n||!t.contains(e.target)&&e.target!==n&&!n.contains(e.target)&&qn()}function Yn(e,t){t.classList.add(`show`);let n=e.getBoundingClientRect(),r=n.bottom+4,i=n.right-240;r+360>window.innerHeight-8&&(r=n.top-360-4,r<8&&(r=8)),i<8&&(i=8),t.style.top=r+`px`,t.style.left=i+`px`}function Xn(){let e=document.getElementById(`sessionDropdownList`);if(e){if(e.innerHTML=``,V.filteredSessions.length===0){let t=document.createElement(`div`);t.className=`session-dropdown-empty`,t.textContent=`无匹配会话`,e.appendChild(t);return}V.filteredSessions.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`session-dropdown-item`,r.dataset.sessionId=t.id,r.dataset.index=n,t.id===N.activeSessionId&&r.classList.add(`active`),n===V.highlightIndex&&r.classList.add(`highlighted`);let i=document.createElement(`span`);i.className=`session-dropdown-item-title`,i.textContent=t.title||`新会话`,r.appendChild(i);let a=document.createElement(`span`);a.className=`session-dropdown-item-close`,a.innerHTML=`&#10005;`,a.title=`关闭会话`,a.addEventListener(`click`,async e=>{e.stopPropagation(),e.preventDefault(),await $n(t.id)}),r.appendChild(a),r.addEventListener(`click`,async e=>{e.preventDefault(),await Qn(t.id)}),r.draggable=!0,r.addEventListener(`dragstart`,e=>Bn(e,t.id)),r.addEventListener(`dragover`,e=>Vn(e)),r.addEventListener(`dragleave`,e=>Hn(e)),r.addEventListener(`drop`,e=>Un(e,t.id)),r.addEventListener(`dragend`,e=>Wn(e)),e.appendChild(r)})}}function Zn(e){let t=N.sessions||[];if(!e.trim())V.filteredSessions=[...t];else{let n=e.trim().toLowerCase();V.filteredSessions=t.filter(e=>(e.title||`新会话`).toLowerCase().includes(n))}V.highlightIndex=-1,Xn()}async function Qn(e){qn(),e!==N.activeSessionId&&await ar(e)}async function $n(e){await Cn(e),await pr();let t=document.getElementById(`sessionDropdownSearch`),n=t?t.value:``,r=N.sessions||[];if(!n.trim())V.filteredSessions=[...r];else{let e=n.trim().toLowerCase();V.filteredSessions=r.filter(t=>(t.title||`新会话`).toLowerCase().includes(e))}V.highlightIndex=Math.min(V.highlightIndex,V.filteredSessions.length-1),Xn()}async function er(){let e=N.sessions||[];if(e.length!==0){if(qn(),!await ir(`确定要关闭全部 ${e.length} 个会话吗？此操作不可撤销。`,`关闭全部会话`)){Kn();return}for(let t of e)await Cn(t.id);await pr()}}function tr(){let e=document.getElementById(`sessionDropdownSearch`),t=document.getElementById(`sessionDropdownCloseAll`),n=document.getElementById(`sessionDropdown`);if(n){if(e){let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`input`,e=>{Zn(e.target.value)}),t.addEventListener(`keydown`,e=>{nr(e)})}if(t){let e=t.cloneNode(!0);t.parentNode.replaceChild(e,t),e.addEventListener(`click`,async e=>{e.stopPropagation(),await er()})}n.addEventListener(`click`,e=>{e.stopPropagation()})}}function nr(e){if(!V.visible)return;let t=V.filteredSessions.length;if(t===0){e.key===`Escape`&&qn();return}switch(e.key){case`ArrowDown`:e.preventDefault(),V.highlightIndex=Math.min(V.highlightIndex+1,t-1),Xn(),rr();break;case`ArrowUp`:e.preventDefault(),V.highlightIndex=Math.max(V.highlightIndex-1,0),Xn(),rr();break;case`Enter`:if(e.preventDefault(),V.highlightIndex>=0&&V.highlightIndex<t){let e=V.filteredSessions[V.highlightIndex];Qn(e.id)}break;case`Escape`:e.preventDefault(),qn();break}}function rr(){let e=document.querySelector(`.session-dropdown-item.highlighted`);e&&e.scrollIntoView({block:`nearest`})}function ir(e,t){return new Promise(t=>{let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r){t(!1);return}r.textContent=e;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=()=>{s(),t(!0)},l=()=>{s(),t(!1)};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)})}async function ar(t){if(await bn(),!await Sn(t))return;let n=await B();N.sessions=n.list,N.activeSessionId=t;let r=n.list.find(e=>e.id===t);if(r){if(N.messageHistory=r.messageHistory||[],N.currentModel=r.model||N.currentModel,N.useTools=r.useTools===void 0?N.useTools:r.useTools,r.enabledTools&&r.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),n=r.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!n.includes(e.id)).map(e=>e.id);N.enabledTools=[...n,...i]}else N.enabledTools=r.enabledTools||N.enabledTools;N.temperature=r.temperature===void 0?N.temperature:r.temperature,N.topP=r.topP===void 0?N.topP:r.topP}document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:t}})),U(),or()}function or(){let e=document.querySelector(`.model-display`);e&&N.currentModel&&(e.textContent=N.currentModel);let t=document.getElementById(`enableToolsBtn`);t&&(t.checked=N.useTools);let n=document.getElementById(`tempIconValue`);n&&N.temperature!==void 0&&(n.textContent=N.temperature.toFixed(2))}var sr=new WeakSet;function cr(e){sr.has(e)||(sr.add(e),e.addEventListener(`wheel`,t=>{e.scrollWidth<=e.clientWidth||(t.preventDefault(),e.scrollLeft+=t.deltaY)},{passive:!1}))}function lr(e){let t=document.getElementById(`sessionRenameModal`),n=document.getElementById(`sessionRenameInput`),r=document.getElementById(`sessionRenameConfirmBtn`),i=document.getElementById(`sessionRenameCancelBtn`),a=document.getElementById(`sessionRenameCloseBtn`);if(!t||!n)return;n.value=e.title,n.focus(),n.select();let o=()=>{t.classList.remove(`show`),r.removeEventListener(`click`,s),i.removeEventListener(`click`,c),a.removeEventListener(`click`,c)},s=()=>{let t=n.value.trim();t&&t!==e.title&&wn(e.id,t).then(()=>{U()}),o()},c=()=>{o()};r.addEventListener(`click`,s),i.addEventListener(`click`,c),a.addEventListener(`click`,c),n.onkeydown=e=>{e.key===`Enter`?s():e.key===`Escape`&&c()},t.classList.add(`show`)}function ur(e,t){let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r)return;r.textContent=`确定要删除会话"${e.title}"吗？此操作不可撤销。`;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=async()=>{await Cn(e.id),t&&await t(),s()},l=()=>{s()};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)}function dr(e,t){let n=document.querySelector(`.session-context-menu`);n&&n.remove();let r=document.createElement(`div`);r.className=`session-context-menu`,r.style.left=e.clientX+`px`,r.style.top=e.clientY+`px`;let i=fr(`重命名`,()=>{r.remove(),lr(t)});r.appendChild(i);let a=fr(`删除`,()=>{r.remove(),ur(t,async()=>{let e=await B();N.activeSessionId=e.activeSessionId,N.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t?N.messageHistory=t.messageHistory||[]:N.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`)),U()})},`danger`);r.appendChild(a),document.body.appendChild(r);let o=e=>{r.contains(e.target)||(r.remove(),document.removeEventListener(`click`,o))};setTimeout(()=>document.addEventListener(`click`,o),0)}function fr(e,t,n=``){let r=document.createElement(`div`);return r.className=`session-context-menu-item `+n,r.textContent=e,r.addEventListener(`click`,t),r}async function pr(){let e=await B();e.activeSessionId||(await xn(),e=await B()),N.activeSessionId=e.activeSessionId,N.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);N.messageHistory=t&&t.messageHistory||[],document.dispatchEvent(new CustomEvent(`session-switched`)),U()}document.addEventListener(`generating-state-changed`,()=>{U()}),document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,Nn):Nn();var mr=`pendingCallApiSessions`;function hr(){chrome.storage.session.set({[mr]:[...N.pendingCallApiSessionIds]}).catch(()=>{})}async function gr(){try{let e=await chrome.storage.session.get([mr]);e[mr]&&Array.isArray(e[mr])&&(N.pendingCallApiSessionIds=new Set(e[mr]))}catch{}}function _r(e){if(Array.isArray(e))return e.filter(e=>e.type===`text`).map(e=>e.text).join(``);if(typeof e==`string`&&e.startsWith(`[`))try{let t=JSON.parse(e);if(Array.isArray(t))return t.filter(e=>e.type===`text`).map(e=>e.text).join(``)}catch{}return e}function vr(e){let t=_r(e);N.quotedContextText=t;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let e;e=t.length>100?t.substring(0,100)+`...`:t.length>50?t.substring(0,50)+`...`:t,r.textContent=`💬 已引用: ${e}`,n.classList.add(`show`)}}function yr(){console.log(`[SidePanel] 清除选中内容上下文`),N.selectedContextText=``,N.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=e.findIndex(e=>e.startsWith(`[用户问题]`));n===-1?t.value=``:t.value=e.slice(n+1).join(`
`).trim()}}async function br(){let t=await B();if(t.activeSessionId&&t.list.length>0){N.activeSessionId=t.activeSessionId,N.sessions=t.list;let n=t.list.find(e=>e.id===t.activeSessionId);if(n){if(N.messageHistory=n.messageHistory||[],N.currentModel=n.model||N.currentModel,N.useTools=n.useTools===void 0?N.useTools:n.useTools,n.enabledTools&&n.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),r=n.enabledTools.filter(e=>t.has(e)),i=new Set(n.enabledTools),a=e.filter(e=>e.enabled&&!i.has(e.id)).map(e=>e.id);N.enabledTools=[...r,...a]}else N.enabledTools=n.enabledTools||N.enabledTools;N.temperature=n.temperature===void 0?N.temperature:n.temperature,N.topP=n.topP===void 0?N.topP:n.topP}N.messageHistory.forEach(e=>{let t=e.wasRevised;if(!t&&e.executionLog)try{t=(typeof e.executionLog==`string`?JSON.parse(e.executionLog):e.executionLog).some(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.action?.decision===`revised`)}catch{}e.htmlContent?bi(e.htmlContent):X(e.role,e.content,!1,e.executionLog||[],e.reflectionScore,t)});let r=document.querySelector(`.welcome-message`);r&&N.messageHistory.length>0&&r.remove(),Jt();let i=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.get([i],e=>{e[i]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t.scrollTop=e[i]},100)}),U()}else{await xn();let e=await B();e.activeSessionId&&(N.activeSessionId=e.activeSessionId,N.sessions=e.list),U()}}function W(){try{bn().catch(e=>{console.error(`[SidePanel] 保存当前会话失败:`,e)})}catch(e){console.error(`[SidePanel] 保存对话历史异常:`,e)}}function xr(){N.messageHistory&&N.messageHistory.length>0&&En().then(()=>{N.messageHistory=[];let e=document.getElementById(`chatContainer`);if(e){e.innerHTML=``;let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
          <div class="icon-wrapper">
            <div class="icon">💬</div>
          </div>
          <h2>开始对话</h2>
          <p>输入您的问题，AI 助手将为您解答</p>
        `,e.appendChild(t)}chrome.storage.local.remove(`scrollPosition_`+(N.activeSessionId||`default`)),U()})}async function Sr(){let e=document.getElementById(`exportSessionsModal`),t=document.getElementById(`exportSessionsList`);if(!(!e||!t)){t.innerHTML=`<div class="export-sessions-empty">加载中...</div>`;try{let{list:e,activeSessionId:n}=await B();if(e.length===0)t.innerHTML=`<div class="export-sessions-empty">暂无会话可导出</div>`;else{let r=n||N.activeSessionId;t.innerHTML=e.map((e,t)=>{let n=e.id===r,i=(e.messageHistory||[]).length,a=e.createdAt?new Date(e.createdAt).toLocaleDateString(`zh-CN`):``;return`
        <div class="export-session-item" data-id="${e.id}">
          <input type="checkbox" class="export-session-checkbox" data-session-id="${e.id}" ${n?`checked`:``}>
          <div class="export-session-info">
            <div class="export-session-title">${I(e.title||`未命名会话`)}${n?`<span class="current-badge">当前</span>`:``}</div>
            <div class="export-session-meta">${i} 条消息${a?` · `+a:``}</div>
          </div>
        </div>`}).join(``),t.querySelectorAll(`.export-session-item`).forEach(e=>{let t=e.querySelector(`.export-session-checkbox`);e.addEventListener(`click`,e=>{e.target!==t&&(t.checked=!t.checked),Cr()})});let i=document.getElementById(`exportSelectAllBtn`),a=document.getElementById(`exportDeselectAllBtn`),o=document.getElementById(`exportSelectCurrentBtn`);i&&(i.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=!0}),Cr()}),a&&(a.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=!1}),Cr()}),o&&(o.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=e.dataset.sessionId===r}),Cr()}),Cr()}}catch(e){console.error(`[SidePanel] 加载会话列表失败:`,e),t.innerHTML=`<div class="export-sessions-empty">加载失败</div>`}e.classList.add(`show`)}}function Cr(){document.querySelectorAll(`#exportSessionsList .export-session-checkbox`);let e=document.querySelectorAll(`#exportSessionsList .export-session-checkbox:checked`),t=document.getElementById(`exportSelectedCount`);t&&(t.textContent=`已选 ${e.length} 个`);let n=document.getElementById(`exportSessionsOkBtn`);n&&(n.textContent=`导出选中 (${e.length})`,n.disabled=e.length===0,n.style.opacity=e.length===0?`0.5`:`1`)}function wr(){let e=document.getElementById(`exportSessionsModal`);e&&e.classList.remove(`show`)}async function Tr(){let e=document.querySelectorAll(`#exportSessionsList .export-session-checkbox:checked`),t=Array.from(e).map(e=>e.dataset.sessionId);if(t.length===0){F(`请至少选择一个会话`,`warning`);return}try{let{list:e}=await B(),n=e.filter(e=>t.includes(e.id)),r={version:1,exportedAt:new Date().toISOString(),sessions:n.map(e=>({title:e.title||`未命名会话`,model:e.model,useTools:e.useTools,enabledTools:e.enabledTools,temperature:e.temperature,topP:e.topP,createdAt:e.createdAt,messageHistory:(e.messageHistory||[]).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],htmlContent:e.htmlContent||``,reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1}))}))},i=new Date,a=i.getFullYear()+String(i.getMonth()+1).padStart(2,`0`)+String(i.getDate()).padStart(2,`0`)+`-`+String(i.getHours()).padStart(2,`0`)+String(i.getMinutes()).padStart(2,`0`)+String(i.getSeconds()).padStart(2,`0`),o=n.length,s=o===1?`ai-helper-${n[0].title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)}-${a}.aihelper.json`:`ai-helper-${o}sessions-${a}.aihelper.json`,c=JSON.stringify(r,null,2),l=new Blob([c],{type:`application/json;charset=utf-8;`}),u=URL.createObjectURL(l),d=document.createElement(`a`);d.href=u,d.download=s,document.body.appendChild(d),d.click(),document.body.removeChild(d),URL.revokeObjectURL(u),wr(),console.log(`[SidePanel] 会话已导出:`,s,`共`,o,`个会话`),F(`已导出 ${o} 个会话`,`success`)}catch(e){console.error(`[SidePanel] 导出失败:`,e),F(`导出失败: `+e.message,`error`)}}function Er(){let e=document.getElementById(`exportSessionsCloseBtn`),t=document.getElementById(`exportSessionsCancelBtn`),n=document.getElementById(`exportSessionsOkBtn`),r=document.getElementById(`exportSessionsModal`);e&&e.addEventListener(`click`,wr),t&&t.addEventListener(`click`,wr),n&&n.addEventListener(`click`,Tr),r&&r.addEventListener(`click`,e=>{e.target===r&&wr()})}function Dr(){let e=document.getElementById(`importSessionsFile`);e&&(e.value=``,e.click())}async function Or(e){try{let t=await e.text(),n=JSON.parse(t),r=[];if(n.version&&n.sessions&&Array.isArray(n.sessions))r=n.sessions;else if(Array.isArray(n))r=n.length>0&&n[0].role?[{title:`导入的对话`,messageHistory:n.map(e=>({role:e.role||`user`,content:e.content||``}))}]:(n.length>0&&n[0].title,n);else throw Error(`无法识别的文件格式`);if(r.length===0){F(`文件中没有可导入的会话数据`,`warning`);return}let i=await Dn(r);await U(),console.log(`[SidePanel] 导入完成:`,i.length,`个会话`),F(`成功导入 ${i.length} 个会话`,`success`)}catch(e){console.error(`[SidePanel] 导入失败:`,e),F(`导入失败: `+e.message,`error`)}}function kr(){document.getElementById(`confirmModal`).classList.add(`show`)}function Ar(){document.getElementById(`confirmModal`).classList.remove(`show`)}var G=1,K=0,q=0,jr=!1,Mr=0,Nr=0,Pr=0,Fr=0,J=[],Y=0;function Ir(){let e=document.getElementById(`imagePreviewLarge`);e&&(e.style.transform=`translate(${K}px, ${q}px) scale(${G})`,G>1?(e.classList.add(`zoomable`),jr?e.classList.add(`dragging`):e.classList.remove(`dragging`)):e.classList.remove(`zoomable`,`dragging`))}function Lr(){G=1,K=0,q=0,jr=!1,Ir()}function Rr(e,t){let n=document.getElementById(`imagePreviewOverlay`),r=document.getElementById(`imagePreviewLarge`);!n||!r||(zr(e,t),Br(),Hr(e),n.classList.add(`show`))}function zr(e,t){J=[],t&&(t.closest(`.image-preview-bar`)||t.classList.contains(`image-preview-thumb`)?document.querySelectorAll(`.image-preview-thumb`).forEach(e=>{e.src&&J.push(e.src)}):t.closest(`.user-message-images`)&&t.closest(`.user-message-images`).querySelectorAll(`.user-message-image`).forEach(e=>{e.src&&J.push(e.src)})),J.length===0&&document.querySelectorAll(`.image-preview-thumb, .user-message-image`).forEach(e=>{e.src&&J.push(e.src)}),Y=J.indexOf(e),Y===-1&&(J.push(e),Y=J.length-1)}function Br(){let e=document.getElementById(`imagePreviewPrev`),t=document.getElementById(`imagePreviewNext`),n=document.getElementById(`imagePreviewCounter`);J.length<=1?(e&&(e.style.display=`none`),t&&(t.style.display=`none`),n&&(n.style.display=`none`)):(e&&(e.style.display=``),t&&(t.style.display=``),n&&(n.style.display=``),Vr())}function Vr(){let e=document.getElementById(`imagePreviewPrev`),t=document.getElementById(`imagePreviewNext`),n=document.getElementById(`imagePreviewCounter`);e&&(e.disabled=!1),t&&(t.disabled=!1),n&&(n.textContent=`${Y+1} / ${J.length}`)}function Hr(e){let t=document.getElementById(`imagePreviewLarge`);t&&(Lr(),t.src=e)}function Ur(e){let t=J.length;t!==0&&(Y=(Y+e+t)%t,Hr(J[Y]),Vr())}function Wr(){let e=document.getElementById(`imagePreviewOverlay`);if(!e||e.dataset.initialized)return;e.dataset.initialized=`true`;let t=document.getElementById(`imagePreviewLarge`),n=()=>{e.classList.remove(`show`),Lr()};e.addEventListener(`click`,t=>{t.target===e&&n()});let r=e.querySelector(`.image-preview-close`);r&&r.addEventListener(`click`,n);let i=document.getElementById(`imagePreviewPrev`),a=document.getElementById(`imagePreviewNext`);i&&i.addEventListener(`click`,e=>{e.stopPropagation(),Ur(-1)}),a&&a.addEventListener(`click`,e=>{e.stopPropagation(),Ur(1)}),document.addEventListener(`keydown`,t=>{e.classList.contains(`show`)&&(t.key===`Escape`?n():t.key===`ArrowLeft`?Ur(-1):t.key===`ArrowRight`&&Ur(1))}),e.addEventListener(`wheel`,n=>{if(!e.classList.contains(`show`))return;n.preventDefault();let r=t.getBoundingClientRect(),i=n.clientX-r.left-r.width/2,a=n.clientY-r.top-r.height/2,o=n.deltaY>0?-.15:.15,s=G,c=Math.max(.3,Math.min(5,G+o)),l=c/s;G=c,K=i-l*(i-K),q=a-l*(a-q),Ir()},{passive:!1}),t.addEventListener(`mousedown`,t=>{!e.classList.contains(`show`)||G<=1||(t.preventDefault(),jr=!0,Mr=t.clientX,Nr=t.clientY,Pr=K,Fr=q,Ir())}),document.addEventListener(`mousemove`,e=>{jr&&(K=Pr+(e.clientX-Mr),q=Fr+(e.clientY-Nr),Ir())}),document.addEventListener(`mouseup`,()=>{jr&&(jr=!1,Ir())}),t.addEventListener(`dblclick`,()=>{e.classList.contains(`show`)&&(G>1?Lr():(G=2,K=0,q=0,Ir()))})}function Gr(e){let t=new Image,n=URL.createObjectURL(e);t.onload=()=>{URL.revokeObjectURL(n);let{width:e,height:r}=t,i=1024;(e>i||r>i)&&(e>r?(r=Math.round(i/e*r),e=i):(e=Math.round(i/r*e),r=i));let a=document.createElement(`canvas`);a.width=e,a.height=r,a.getContext(`2d`).drawImage(t,0,0,e,r);let o=a.toDataURL(`image/jpeg`,.65);N.attachedImages.push({dataUrl:o});let s=document.getElementById(`imagePreviewBar`),c=document.getElementById(`userInput`);s&&(s.style.display=``),Kr(),c&&c.focus()},t.onerror=()=>{URL.revokeObjectURL(n),console.error(`[ChatManager] 图片加载失败`)},t.src=n}function Kr(){let e=document.getElementById(`imagePreviewBar`);if(e){if(e.innerHTML=``,N.attachedImages.length===0){e.style.display=`none`;return}e.style.display=``,N.attachedImages.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`image-preview-item`;let i=document.createElement(`img`);i.src=t.dataUrl,i.className=`image-preview-thumb`,i.title=`点击查看大图`,i.style.cursor=`zoom-in`,i.addEventListener(`click`,()=>{Rr(t.dataUrl,i)});let a=document.createElement(`button`);a.className=`image-preview-remove`,a.innerHTML=`×`,a.title=`移除图片`,a.addEventListener(`click`,e=>{e.stopPropagation(),N.attachedImages.splice(n,1),Kr()}),r.appendChild(i),r.appendChild(a),e.appendChild(r)})}}function qr(e){if(!N.enableImageInput||N.attachedImages.length===0)return e;let t=[{type:`text`,text:e}];for(let e of N.attachedImages)t.push({type:`image_url`,image_url:{url:e.dataUrl}});return t}function Jr(e){if(typeof e==`string`)return e;if(Array.isArray(e)){let t=e.filter(e=>e.type===`text`);return t.length===1?t[0].text:t}return e}async function Yr(){let e=document.getElementById(`userInput`),t=document.getElementById(`sendBtn`),n=document.getElementById(`chatContainer`),r=e.value.trim();if(!r||N.isGenerating)return;let i=n.querySelector(`.welcome-message`);i&&i.remove();let a=r,s=N.enableSelectionQuery&&N.selectedContextText&&N.selectedContextText.trim(),c=N.quotedContextText&&N.quotedContextText.trim();c?(a=`[引用内容]\n${N.quotedContextText.trim()}\n\n[用户问题]\n${r}`,N.quotedContextText=``):s&&(a=`[选中内容]\n${N.selectedContextText.trim()}\n\n[用户问题]\n${r}`,N.selectedContextText=``);let l=qr(a);X(`user`,l),N.messageHistory.push({role:`user`,content:l}),W(),Ye(r),N.inputHistoryIndex=-1,e.value=``,e.style.height=`auto`,(s||c)&&yr(),N.isGenerating=!0,t.disabled=!0;let u=N.activeSessionId,d=vi(),p=N.enableImageInput&&N.attachedImages.length>0&&N.imageModelName||N.currentModel;if(N.attachedImages.length>0){let e=document.getElementById(`imagePreviewBar`);e&&(e.innerHTML=``,e.style.display=`none`)}try{await Ke(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let e=[{role:`system`,content:Ue()}];if(N.isolateChat){let t=N.messageHistory;N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?(t=[...N.messageHistory.slice(0,-1).slice(-N.chatConfig.maxMemoryMessages),N.messageHistory[N.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,N.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,N.chatConfig.maxMemoryMessages),e=[...e,...t];for(let t=0;t<e.length-1;t++)e[t]={...e[t],content:Jr(e[t].content)}}else{let t=qr(a);e.push({role:`user`,content:t})}let t=await We();t._loadingId=d;let n=f(e),r=f([e[0]]),i=n-r,s=o(n,g(p));console.log(`[SidePanel] 发送上下文: ${n} tokens (系统提示词: ${r}, 历史: ${i}), 压力: ${s.level}(${Math.round(s.ratio*100)}%), 消息: ${e.length} 条`),s.level===`critical`&&console.warn(`[SidePanel] 上下文压力过高，可能触发 API 错误`);let c,l,m,h=!1,_=!1,v=null,y=!0;try{let n=await Di(e,p,N.useTools,t);c=n.content,l=n.executionLog||[],m=n.reflectionScore,h=n.wasRevised||!1,_=n.wasStreamed||!1,v=n.streamingHtml||null,y=n.streamingConnected===void 0?!0:n.streamingConnected}catch(e){if(N.activeSessionId!==u){e.message===`任务已被用户停止`?On(u,{role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}):On(u,{role:`assistant`,content:`❌ 请求失败：`+(e.message||`未知错误`),executionLog:e.executionLog||[]}),Q(d),N.substituteLoadingIds.delete(u);return}if(e.message===`任务已被用户停止`){Q(d),N.substituteLoadingIds.delete(u),X(`assistant`,`任务已取消`,!1,e.executionLog||[]),N.messageHistory.push({role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}),W();return}throw Q(d),N.substituteLoadingIds.delete(u),c=`❌ 请求失败：`+(e.message||`未知错误`),l=e.executionLog||[],X(`assistant`,c,!0,l,m),N.messageHistory.push({role:`assistant`,content:c,executionLog:l,reflectionScore:m}),e}if(N.activeSessionId!==u){let e={role:`assistant`,content:c,executionLog:l,reflectionScore:m,wasRevised:h};_&&v&&(e.htmlContent=v),On(u,e),Q(d),N.substituteLoadingIds.delete(u);return}_?N.substituteLoadingIds.has(u)&&(Q(N.substituteLoadingIds.get(u)),N.substituteLoadingIds.delete(u)):(Q(d),N.substituteLoadingIds.has(u)&&(Q(N.substituteLoadingIds.get(u)),N.substituteLoadingIds.delete(u)),await $t(X(`assistant`,c,!0,l,m,h)));let b={role:`assistant`,content:c,executionLog:l,reflectionScore:m,wasRevised:h};if(_&&v&&(b.htmlContent=v,!y)){bi(v);let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)}N.messageHistory.push(b)}catch(e){console.error(`[SidePanel] sendMessage 异常:`,e?.message||e)}finally{W(),N.generatingSessionIds.delete(u),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),t.disabled=!1,e.focus(),N.attachedImages=[];let n=document.getElementById(`imagePreviewBar`);n&&(n.style.display=`none`)}}function Xr(e,t){let n=document.getElementById(`userInput`);if(!t||N.isGenerating){console.log(`[SidePanel] triggerSelectionSearch 跳过:`,{hasText:!!t,isGenerating:N.isGenerating});return}let r=N.enableSelectionQuery;N.enableSelectionQuery=!0,N.selectedContextText=t,N.quotedContextText=``,n.value=`搜索一下`,n.dispatchEvent(new Event(`input`)),Yr(),N.enableSelectionQuery=!1,setTimeout(()=>{N.enableSelectionQuery=r},1500)}function Zr(e){let t=document.getElementById(`userInput`);!t||!e||(t.value=e,t.dispatchEvent(new Event(`input`)),t.focus())}function Qr(e,t=``){let n=document.getElementById(`userInput`);!n||!e||N.isGenerating||(t&&(N.enableSelectionQuery=!0,N.selectedContextText=t,N.quotedContextText=``),n.value=e,n.dispatchEvent(new Event(`input`)),n.focus(),Yr(),t&&(N.enableSelectionQuery=!1,setTimeout(()=>{N.enableSelectionQuery=!0},1500)))}function $r(e,t,n=!0){let r=document.getElementById(`chatContainer`),i=document.createElement(`div`);i.className=`user-context-bubble`,i.dataset.role=`context`,i.innerHTML=`
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${e===`quoted`?`💬`:`📌`}</span>
        <span class="context-type">${e===`quoted`?`引用内容`:`选中内容`}</span>
      </div>
      <div class="context-bubble-content">${I(t)}</div>
    </div>
  `;let a=i.querySelector(`.context-bubble-header`),o=i.querySelector(`.context-bubble-content`);return a.addEventListener(`click`,e=>{e.stopPropagation(),o.classList.toggle(`expanded`)}),r.appendChild(i),n&&(r.scrollTop=r.scrollHeight),i}function X(e,t,n=!0,r=[],i=null,a=!1){let o=document.getElementById(`chatContainer`),s=document.createElement(`div`);s.className=`message ${e}`;let c=new Date().toISOString();s.dataset.timestamp=c;let l=Array.isArray(t)?t.filter(e=>e.type===`text`).map(e=>e.text).join(``):t,u=Array.isArray(t)&&t.some(e=>e.type===`image_url`);if(s.dataset.rawContent=Array.isArray(t)?JSON.stringify(t):t,s.dataset.textContent_=l,s.dataset.executionLog=JSON.stringify(r),a&&(s.dataset.wasRevised=`true`),e===`assistant`){s.innerHTML=z(t);let e=document.createElement(`div`);e.className=`message-footer`;let n=document.createElement(`button`);n.className=`copy-btn`,n.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),n.addEventListener(`click`,e=>{e.stopPropagation(),ji(s,n)}),e.appendChild(n);let o=document.createElement(`button`);o.className=`quote-btn`,o.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),Pi(s)}),e.appendChild(o);let c=document.createElement(`div`);c.className=`export-menu-container`;let l=document.createElement(`button`);l.className=`export-trigger-btn`,l.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let u=document.createElement(`div`);u.className=`export-dropdown`,u.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),u.querySelector(`.export-docx-item`).addEventListener(`click`,e=>{e.stopPropagation(),Mi(s,l),u.classList.remove(`show`)}),u.querySelector(`.export-pdf-item`).addEventListener(`click`,e=>{e.stopPropagation(),Ni(s,l),u.classList.remove(`show`)}),l.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.toggle(`show`)});let d=null;c.addEventListener(`mouseenter`,()=>{d=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.add(`show`)},300)}),c.addEventListener(`mouseleave`,()=>{d&&=(clearTimeout(d),null),setTimeout(()=>{!c.matches(`:hover`)&&!u.matches(`:hover`)&&u.classList.remove(`show`)},100)}),c.appendChild(l),c.appendChild(u),e.appendChild(c);let f=r&&r.length>0,p=i!=null,m=r?r.filter(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.status===`success`).length:0;ii(),oi();let h=r?.find(e=>e.nodeType===`reflection`&&e.reflectionType===`post`);if(f&&N.chatConfig.enableExecutionLog){let t=document.createElement(`button`);t.className=`execution-log-btn`,t.type=`button`,t.title=`执行日志`,t.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),e.appendChild(t)}if(p&&N.chatConfig.enableExecutionLog){let t=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,n=i>=8?`✅`:i>=5?`🔍`:`⚠️`,r=a?` <span class="reflection-revised-tag">已修订</span>`:``,o=m>1?` (${m}轮)`:``,s=document.createElement(`button`);s.className=`reflection-score-btn`,s.type=`button`,s.title=`AI 质量评估: ${i}/10${o}${a?`（已修订）`:``}\n点击查看评估详情`,s.innerHTML=`<span class="reflection-badge ${t}">${n} ${i}/10${r}</span>`,s.dataset.reflectionData=JSON.stringify({overallScore:h?.overallScore??i,dimensions:h?.dimensions||null,issues:h?.issues||null,suggestions:h?.suggestions||null,decision:h?.action?.decision||null,useful:h?.useful??null,reasoning:h?.reasoning||null,suggestion:h?.suggestion||null,rounds:m,wasRevised:a}),e.appendChild(s)}else if(!p&&h&&h.status===`failed`&&N.chatConfig?.enableExecutionLog){let t=document.createElement(`button`);t.className=`reflection-score-btn`,t.type=`button`,t.title=`反思评估失败（点击查看执行日志）`,t.innerHTML=`<span class="reflection-badge score-low">⚠️ 反思失败</span>`,e.appendChild(t)}let g=r?.find(e=>e.nodeType===`tool_exec`&&e.action?.name===`preview_ui_prototype`&&e.status===`success`);if(g){let t=document.createElement(`button`);t.className=`prototype-btn-small`,t.type=`button`,t.title=`查看 UI 原型`,t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,t.addEventListener(`click`,()=>{let e=g.prototypeId;if(!e&&g.observation)try{e=(typeof g.observation==`string`?JSON.parse(g.observation):g.observation)?.prototypeId}catch{}e?Et(e):console.error(`[SidePanel] 未找到 prototypeId，entry keys:`,Object.keys(g),`observation:`,g.observation)}),e.appendChild(t)}s.appendChild(e)}else{let e=l.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),n=l.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),r=e||n;if(r){let t=e?`quoted`:`selected`,n=r[1].trim(),i=r[2].trim();s._pendingContext={type:t,contextText:n,userQuestion:i},s.textContent=i}else s.textContent=l;if(u){let e=document.createElement(`div`);e.className=`user-message-images`,t.filter(e=>e.type===`image_url`).forEach((t,n)=>{let r=document.createElement(`img`);r.src=t.image_url.url,r.className=`user-message-image`,r.title=`点击查看大图`,r.addEventListener(`click`,()=>{Rr(t.image_url.url,r)}),e.appendChild(r)}),s.appendChild(e)}let i=document.createElement(`div`);i.className=`message-toolbar`;let a=document.createElement(`button`);a.className=`message-toolbar-btn copy-btn`,a.title=`复制内容`,a.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`].join(``),a.addEventListener(`click`,e=>{e.stopPropagation(),ki(s,a)});let o=document.createElement(`button`);o.className=`message-toolbar-btn edit-btn`,o.title=`编辑后重新发送`,o.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>`,`</svg>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),Ai(s)}),i.appendChild(a),i.appendChild(o),s.appendChild(i)}if(o.appendChild(s),s._pendingContext){let{type:e,contextText:t}=s._pendingContext,n=$r(e,t,!1);o.insertBefore(n,s),delete s._pendingContext}if(n){let e=o.querySelectorAll(`.message.user`);if(e.length>0){let t=e[e.length-1],n=t.previousElementSibling;n&&n.classList.contains(`user-context-bubble`)?n.scrollIntoView({behavior:`smooth`,block:`start`}):t.scrollIntoView({behavior:`smooth`,block:`start`})}}return e===`assistant`&&nn(),s}var ei=!1,ti=new Map,Z=null,ni=0,ri=0;function ii(){if(ei)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.execution-log-btn`);if(!t)return;let n=t.closest(`.message`);if(!n)return;e.preventDefault(),e.stopPropagation();let r=n.dataset.executionLog;if(r)try{let e=JSON.parse(r);console.log(`[chat-manager] 执行日志按钮点击(委托), entries:`,e.length),Oi(e)}catch(e){console.error(`[chat-manager] 解析 executionLog 失败:`,e)}}),ei=!0)}var ai=!1;function oi(){if(ai)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.reflection-score-btn`);if(!t)return;e.preventDefault(),e.stopPropagation();let n=t.dataset.reflectionData;if(n)try{si(JSON.parse(n),t)}catch(e){console.error(`[chat-manager] 解析 reflectionData 失败:`,e)}}),ai=!0)}function si(e,t){let n=document.querySelector(`.reflection-info-overlay`);n&&n.remove();let r=document.createElement(`div`);r.className=`reflection-info-overlay`;let{overallScore:i,dimensions:a,issues:o,suggestions:s,decision:c,useful:l,reasoning:u,suggestion:d,rounds:f,wasRevised:p}=e,m=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,h=i>=8?`✅`:i>=5?`🔍`:`⚠️`,g=c===`passed`?`✅ 通过`:c===`revised`?`🔧 已修订`:c===`needs_improvement`?`⚠️ 需改进`:``,_={accuracy:`准确性`,completeness:`完整性`,relevance:`相关性`,clarity:`清晰度`,usefulness:`实用性`,safety:`安全性`,efficiency:`效率`},v=``;a&&Object.keys(a).length>0&&(v=`
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
  `,document.body.appendChild(r),r.querySelector(`.ri-close`).addEventListener(`click`,()=>r.remove()),r.addEventListener(`click`,e=>{e.target===r&&r.remove()});let S=t.getBoundingClientRect(),C=r.querySelector(`.reflection-info-panel`),w=Math.min(window.innerHeight-40,560),T=S.right-380;T<10&&(T=10),T+380>window.innerWidth-10&&(T=window.innerWidth-380-10);let E=S.bottom+6;E+w>window.innerHeight-10&&(E=S.top-w-6),E<10&&(E=10),C.style.left=T+`px`,C.style.top=E+`px`,C.style.maxHeight=w+`px`}function ci(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)),n=t.length,r=``,i=null;return t.forEach((e,t)=>{let a=e.nodeType===`subtask`,o=e.nodeType===`tool_exec`,s=e.nodeType===`api_call`,c=e.nodeType===`preselect`,l=e.nodeType===`reflection`,u=o&&e.action?.name===`plan_task`;a&&(i=e.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&i!==null?(d=`tool-level`,f=`🔧`):s&&i!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=e.status||`processing`;e.status===`success`?p=`✓`:e.status===`failed`&&(p=`✗`),l&&(m=`reflection ${m}`);let h=I(e.nodeName||`未知节点`);if(e.subtaskIndex!==null&&e.subtaskIndex>=0&&(h=`<span class="subtask-badge">${e.subtaskIndex+1}</span> ${h}`),e.subtaskCount&&(h+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!c&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(h+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}r+=`
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
            <span class="duration-badge" title="耗时">${Ve(e.duration||0)}</span>
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
    `}),r}function li(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp));if(!t.some(e=>e.taskGroup))return pi(t);let n=new Map,r=[];t.forEach(e=>{e.taskGroup?(n.has(e.taskGroup)||n.set(e.taskGroup,{groupId:e.taskGroup,groupIndex:e.taskGroupIndex,groupName:e.taskGroupName,entries:[],status:e.status}),n.get(e.taskGroup).entries.push(e),e.status&&(n.get(e.taskGroup).status=e.status)):r.push(e)});let i=ui(r,t.length);return n.forEach((e,n)=>{let r=e.status||`processing`;i+=`
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
          ${di(e.entries,t.length)}
        </div>
      </div>
    `}),i}function ui(e,t){if(e.length===0)return``;let n=``;return n+=`
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
  `,e.forEach((e,r)=>{n+=fi(e,r,t)}),n+=`
      </div>
    </div>
  `,n}function di(e,t){let n=``;return e.forEach((e,r)=>{n+=fi(e,r,t)}),n}function fi(e,t,n){let r=e.nodeType===`subtask`,i=e.nodeType===`tool_exec`,a=e.nodeType===`api_call`,o=e.nodeType===`preselect`,s=e.nodeType===`reflection`,c=i&&e.action?.name===`plan_task`,l=``,u=``;s?(l=`reflection-level`,u=`🎯`):o?u=`📡`:c?(l=`plan-task-level`,u=`📋`):r?(l=`subtask-level`,u=`🔀`):i?(l=`tool-level`,u=`🔧`):a?(l=`api-level`,u=`📡`):i?u=`⚡`:a&&(u=`📡`);let d=`○`,f=e.status||`processing`;e.status===`success`?d=`✓`:e.status===`failed`&&(d=`✗`),s&&(f=`reflection ${f}`);let p=I(e.nodeName||`未知节点`);if(e.subtaskCount&&(p+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(a||o)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!o&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(p+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}return`
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
          <span class="duration-badge" title="耗时">${Ve(e.duration)}</span>
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
  `}function pi(e){let t=``,n=null;return e.forEach((r,i)=>{let a=r.nodeType===`subtask`,o=r.nodeType===`tool_exec`,s=r.nodeType===`api_call`,c=r.nodeType===`preselect`,l=r.nodeType===`reflection`,u=o&&r.action?.name===`plan_task`;a&&(n=r.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&n!==null?(d=`tool-level`,f=`🔧`):s&&n!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=r.status||`processing`;r.status===`success`?p=`✓`:r.status===`failed`&&(p=`✗`);let h=I(r.nodeName||`未知节点`);if(r.subtaskId&&(h=`<span class="subtask-badge">${n===null?``:n+1}</span> ${h}`),r.subtaskCount&&(h+=` <span class="plan-badge">(${r.subtaskCount}个子任务, ${r.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&r.apiRequest){let e=[];r.apiRequest.messageCount!==void 0&&r.apiRequest.messageCount!==null&&e.push(`💬<span title="本次模型API调用携带的消息数">${r.apiRequest.messageCount}条</span>`),!c&&r.apiRequest.toolCount!==void 0&&r.apiRequest.toolCount!==null&&e.push(`🔧<span title="本次模型API调用携带的工具定义数">${r.apiRequest.toolCount}个</span>`),e.length>0&&(h+=` <span class="api-info-badge">（${e.join(` `)}）</span>`)}t+=`
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
            <span class="duration-badge" title="耗时">${Ve(r.duration)}</span>
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
    `}),t}function mi(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(!t)return;let n=t.querySelector(`.realtime-executing-node`);n&&(n.textContent=e.nodeName||`处理中...`);let r=e.executionLog||[],i=r.length,a=r.filter(e=>e.status===`success`).length,o=r.filter(e=>e.status===`failed`).length,s=r.filter(e=>e.nodeType===`subtask`).length,c=r.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,l=t.querySelector(`.combo-value`),u=t.querySelector(`.combo-stat.success .stat-value`),d=t.querySelector(`.combo-stat.failed .stat-value`),f=t.querySelector(`.combo-stat.subtask`);l&&(l.textContent=i),u&&(u.textContent=a),d&&(d.textContent=o),f&&(s>0?(f.style.display=``,f.querySelector(`.stat-value`).textContent=`${c}/${s}`):f.style.display=`none`);let p=t.querySelector(`.timeline`);p.innerHTML=r.length>0?ci(r):`<div class="realtime-waiting-message">等待执行中...</div>`,p.scrollTop=p.scrollHeight}function hi(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel realtime-mode`,n.innerHTML=`
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
  `,document.body.appendChild(n),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()}),n.addEventListener(`click`,e=>{e.target===n&&n.remove()});let r=n.querySelector(`.toggle-expand-btn`),i=!1;r.addEventListener(`click`,()=>{i=!i,n.querySelectorAll(`.timeline-content`).forEach(e=>{i?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=r.querySelector(`svg`);i?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,r.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,r.setAttribute(`title`,`展开全部节点`))}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.timeline-header`);t&&t.parentElement.classList.toggle(`expanded`)}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.combo-stat[data-status]`);if(!t)return;let r=t.dataset.status,i=t.classList.contains(`active`);n.querySelectorAll(`.combo-stat[data-status]`).forEach(e=>{e.classList.remove(`active`)});let a=n.querySelectorAll(`.timeline-item`);i?a.forEach(e=>{e.style.display=``}):(t.classList.add(`active`),a.forEach(e=>{if(r===`subtask`)e.dataset.nodeType===`subtask`?e.style.display=``:e.style.display=`none`;else{let t=e.querySelector(`.timeline-dot`);t&&t.classList.contains(r)?e.style.display=``:e.style.display=`none`}}))}),N.currentExecutionStatus&&mi(N.currentExecutionStatus)}function gi(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(t){t.remove();return}hi(e)}function _i(e,t,n,r){let i=document.getElementById(e);if(!i)return;console.log(`[SidePanel] updateExecutionStatus 被调用:`,t,n,`日志数量:`,r?.length);let a=i.querySelector(`.current-node-name`);a&&(a.textContent=t||`处理中...`,a.title=t||``),N.currentExecutionStatus?(N.currentExecutionStatus.executionLog||(N.currentExecutionStatus.executionLog=[]),r&&r.length>0&&r.forEach(e=>{let t=N.currentExecutionStatus.executionLog.findIndex(t=>t.id===e.id);if(t!==-1){let n=N.currentExecutionStatus.executionLog[t];N.currentExecutionStatus.executionLog[t]={...e,subtaskIndex:e.subtaskIndex??n.subtaskIndex,subtaskId:e.subtaskId??n.subtaskId,subtaskName:e.subtaskName??n.subtaskName}}else N.currentExecutionStatus.executionLog.push(e)}),N.currentExecutionStatus.nodeName=t,N.currentExecutionStatus.status=n):N.currentExecutionStatus={nodeName:t,status:n,executionLog:[]},document.querySelector(`.execution-log-panel.realtime-mode`)&&mi(N.currentExecutionStatus)}function vi(){let e=document.getElementById(`chatContainer`),t=`loading-`+Date.now(),n=document.createElement(`div`);n.className=`loading-message`,n.id=t,n.innerHTML=`
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
  `,e.appendChild(n),requestAnimationFrame(()=>{e.scrollTop=e.scrollHeight});let r=n.querySelector(`.stop-task-btn`),i=n.querySelector(`.loading-text`);r&&r.addEventListener(`click`,e=>{e.stopPropagation(),r.disabled=!0,r.style.opacity=`0.6`,r.style.cursor=`not-allowed`,i&&(i.textContent=`停止中...`),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:null,sessionId:N.activeSessionId}),N.pendingCancelApi&&N.pendingCancelApi({message:`任务已被用户停止`,executionLog:N.currentExecutionStatus?.executionLog||[]})});let a=N.activeSessionId;if(N.executionLogListener=(e,n,r)=>e.sessionId&&e.sessionId!==a?!1:e.type===`EXECUTION_STATUS_UPDATE`?(console.log(`[SidePanel] 收到执行状态更新:`,e.nodeName,e.status,`日志数量:`,e.executionLog?.length),_i(t,e.nodeName,e.status,e.executionLog),!1):!1,chrome.runtime.onMessage.addListener(N.executionLogListener),N.chatConfig.enableExecutionLog){let e=n.querySelector(`.execution-status-container`);e&&(e.style.display=`flex`)}let o=n.querySelector(`.execution-log-toggle-btn`);return o&&o.addEventListener(`click`,e=>{e.stopPropagation(),gi(t)}),t}function Q(e){let t=document.getElementById(e);if(t){let e=t.querySelector(`.loading-text`);e&&(e.textContent=`思考中...`),t.remove()}N.executionLogListener&&=(chrome.runtime.onMessage.removeListener(N.executionLogListener),null),N.currentExecutionStatus=null;let n=document.querySelector(`.execution-log-panel.realtime-mode`);n&&n.remove()}function yi(){let e=document.getElementById(`chatContainer`),t=document.createElement(`div`);return t.className=`message-wrapper assistant streaming`,t.innerHTML=`
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
  `,e.appendChild(t),requestAnimationFrame(()=>{e.scrollTop=e.scrollHeight}),t}function bi(e){let t=document.getElementById(`chatContainer`);if(!t||!e)return;let n=document.createElement(`div`);n.innerHTML=e;let r=n.firstElementChild;if(!r)return;r.classList.remove(`streaming`);let i=r.querySelector(`.thinking-process-header`);if(i){let e=i.closest(`.thinking-process`);i.addEventListener(`click`,()=>{e.classList.toggle(`collapsed`)})}r.querySelectorAll(`.tool-call-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.closest(`.tool-call-item`).classList.toggle(`expanded`)})});let a=r.querySelector(`.message-footer`);if(a){let e=a.querySelector(`.copy-btn`);e&&e.addEventListener(`click`,t=>{t.stopPropagation(),ji(r,e)});let t=a.querySelector(`.quote-btn`);t&&t.addEventListener(`click`,e=>{e.stopPropagation(),Pi(r)});let n=a.querySelector(`.export-trigger-btn`),i=a.querySelector(`.export-dropdown`);n&&i&&(n.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==i&&e.classList.remove(`show`)}),i.classList.toggle(`show`)}),i.querySelector(`.export-docx-item`)?.addEventListener(`click`,e=>{e.stopPropagation(),Mi(r,n),i.classList.remove(`show`)}),i.querySelector(`.export-pdf-item`)?.addEventListener(`click`,e=>{e.stopPropagation(),Ni(r,n),i.classList.remove(`show`)}))}t.appendChild(r)}function xi(e,t){let n=e.querySelector(`.stream-content`);if(!n)return;let r=n.querySelector(`.thinking-indicator:not(.hidden)`)||e.querySelector(`.thinking-indicator:not(.hidden)`);if(r){r.classList.add(`hidden`),n.contains(r)||r.remove();let e=ni>0?((Date.now()-ni)/1e3).toFixed(1)+`s`:``,t=document.createElement(`span`);t.className=`thinking-badge`,t.innerHTML=`<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果${e?` <span class="thinking-duration">`+e+`</span>`:``}`,n.appendChild(t)}let i=n.querySelectorAll(`.thinking-badge`);if(i.length>0){let e=i[i.length-1],n=e.nextElementSibling;if(n&&n.classList.contains(`thinking-content`))n.innerHTML=z(t);else{let n=document.createElement(`div`);n.className=`thinking-content`,n.innerHTML=z(t),e.after(n)}}else n.innerHTML=z(t);requestAnimationFrame(()=>{chatContainer.scrollTop=chatContainer.scrollHeight})}function Si(e,t){if(!e||!t?.length)return;let n=e.querySelector(`.thinking-indicator`);n&&n.classList.add(`hidden`);let r=e.querySelector(`.stream-content`);if(!r)return;let i={execute_command:{metaType:`exec`},execute_agent_exec_command:{metaType:`exec`},agent_read_file:{metaType:`file`,action:`读取`},agent_write_file:{metaType:`file`,action:`写入`},file_upload:{metaType:`file`,action:`上传`},download_file:{metaType:`file`,action:`下载`},fetch_url:{metaType:`web`,action:`请求`},click_element:{metaType:`web`,action:`点击`},fill_form:{metaType:`web`,action:`填写`},open_tab:{metaType:`web`,action:`打开`},search_bookmarks:{metaType:`search`},search_history:{metaType:`search`},search_in_page:{metaType:`search`}};t.forEach(e=>{let t=e.function?.name||`unknown`,n=i[t]||{metaType:`other`},a;try{a=JSON.parse(e.function?.arguments||`{}`)}catch{a={raw:e.function?.arguments||``}}let o=JSON.stringify(a,null,2),s=``;if(n.metaType===`exec`)s=`<code class="tool-call-cmd">$ ${I(a.command||a.cmd||JSON.stringify(a))}</code>`;else if(n.metaType===`file`){let e=a.file_path||a.filePath||a.path||a.filename||a.fileName||a.url||``;s=`<span class="tool-call-file">${n.action===`读取`?`📖`:n.action===`写入`?`📝`:n.action===`上传`?`📤`:`📥`} ${I(e)||I(t)}</span>`}else if(n.metaType===`web`){let e=a.url||a.href||a.selector||``;s=`<span class="tool-call-web">${I(n.action)}: ${I(e)||I(JSON.stringify(a).substring(0,80))}</span>`}else if(n.metaType===`search`)s=`<span class="tool-call-search">🔍 ${I(a.query||a.keyword||a.text||``)||I(t)}</span>`;else{let e=Object.keys(a);s=e.length===0?`<span>${I(t)}</span>`:e.length===1?`<span>${I(e[0])}: ${I(JSON.stringify(a[e[0]]).substring(0,80))}</span>`:`<span>${e.slice(0,2).map(e=>`${I(e)}=${I(JSON.stringify(a[e]).substring(0,30))}`).join(`, `)}${e.length>2?` ...`:``}</span>`}let c=n.metaType===`exec`?`<svg class="tool-call-icon exec" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
    `,l.querySelector(`.tool-call-header`).addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),r.appendChild(l)}),requestAnimationFrame(()=>{let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)})}function Ci(e,t){if(!e?.toolCallId)return;let n=t;if(!n)return;let r=n.querySelector(`.tool-call-item[data-tool-call-id="${e.toolCallId}"]`);if(!r)return;let i=r.querySelector(`.tool-call-result`);i&&i.remove();let a=e.truncated?`<span class="tool-result-truncated" title="原始结果过大，已截断显示">(输出过长已截断)</span>`:``,o=e.content||(e.success?`(无输出)`:`执行失败`),s=o.length>500?o.substring(0,500)+`
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
  `,r.appendChild(l),c.length>500){let e=l.querySelector(`code`),t=!1;l.style.cursor=`pointer`,l.addEventListener(`click`,()=>{t=!t,e.textContent=t?c:s})}requestAnimationFrame(()=>{let e=document.getElementById(`chatContainer`);e&&(e.scrollTop=e.scrollHeight)})}function wi(e){let t=document.createElement(`div`);t.className=`tool-call-item expanded preselect-card`;let n=e.status===`failed`,r=n?`失败`:`完成`,i=n?`fail`:`success`,a=``;if(e.action?.params?.selected){let t=e.action.params.selected;a=`<span class="preselect-summary">从 ${e.apiRequest?.toolCount||`?`} 个工具中筛选出 <strong>${t.length}</strong> 个：${t.map(e=>`<code>${I(e)}</code>`).join(`、`)}</span>`}else e.action?.name===`all_tools`?a=`<span class="preselect-summary">跳过筛选（${I(e.action.params.reason||``)}），使用全部工具</span>`:e.action?.name===`skip`?a=`<span class="preselect-summary">跳过筛选（${I(e.action.params.reason||``)}），工具总数 ${e.action.params.toolCount||`?`}</span>`:e.error?a=`<span class="preselect-summary" style="color:#dc2626;">${I(e.error)}</span>`:e.thought&&(a=`<span class="preselect-summary">模型直接回答：${I(e.thought).substring(0,200)}</span>`);let o=e.duration?`${e.duration}ms`:``;return t.innerHTML=`
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
  `,t.querySelector(`.tool-call-header`).addEventListener(`click`,()=>{t.classList.toggle(`expanded`)}),t}function Ti(e,t,n=[],r=null,i=null){if(!e)return;e.querySelectorAll(`.thinking-indicator`).forEach(e=>e.classList.add(`hidden`));let a=e.querySelector(`.stream-status`);a&&a.remove(),e.classList.remove(`streaming`);let o=e.querySelector(`.message-content`),s=e.querySelector(`.stream-content`);if(o&&o.querySelector(`.tool-call-item`)||s&&s.querySelector(`.tool-call-item`)){let e=ri>0?((Date.now()-ri)/1e3).toFixed(1)+`s`:``,r=document.createElement(`div`);r.className=`thinking-process collapsed`;let i=document.createElement(`div`);i.className=`thinking-process-header`,i.innerHTML=`
      <svg class="thinking-process-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
        <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
      </svg>
      <span class="thinking-process-title">思考过程</span>
      <span class="thinking-process-duration">${e}</span>
      <svg class="thinking-process-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    `;let a=document.createElement(`div`);a.className=`thinking-process-body`;let c=document.createElement(`div`);if(c.className=`thinking-process-content`,a.appendChild(c),s)for(;s.firstChild;)c.appendChild(s.firstChild);o.querySelectorAll(`.tool-call-item`).forEach(e=>c.appendChild(e)),c.querySelectorAll(`.preselect-card`).forEach(e=>e.remove());let l=(n||[]).filter(e=>e.nodeType===`preselect`);console.log(`[finalizeStreamingMessage] executionLog length:`,(n||[]).length,`preselectEntries:`,l.length),l.forEach(e=>{console.log(`[finalizeStreamingMessage] creating preselect card for entry:`,e);let t=wi(e);c.insertBefore(t,c.firstChild)});let u=c.querySelectorAll(`.thinking-badge`),d=c.querySelectorAll(`.thinking-content`);u.length>0&&u[u.length-1].remove(),d.length>0&&d[d.length-1].remove(),r.appendChild(i),r.appendChild(a);let f=document.createElement(`div`);f.className=`final-answer`;let p=_r(t);p&&p.trim()&&(f.innerHTML=z(p));let m=o.querySelector(`.thinking-indicator`);m&&m.remove(),o.appendChild(r),o.appendChild(f),i.addEventListener(`click`,()=>{r.classList.toggle(`collapsed`)})}else if(s){let e=_r(t);!s.querySelector(`.thinking-content`)&&e&&e.trim()&&(s.innerHTML=z(e))}e.classList.add(`assistant`,`message`),e.dataset.rawContent=typeof t==`string`?t:JSON.stringify(t),e.dataset.textContent_=_r(t),e.dataset.executionLog=JSON.stringify(n);let c=document.createElement(`div`);c.className=`message-footer`;let l=document.createElement(`button`);l.className=`copy-btn`,l.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),l.addEventListener(`click`,t=>{t.stopPropagation(),ji(e,l)}),c.appendChild(l);let u=document.createElement(`button`);u.className=`quote-btn`,u.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),u.addEventListener(`click`,t=>{t.stopPropagation(),Pi(e)}),c.appendChild(u);let d=document.createElement(`div`);d.className=`export-menu-container`;let f=document.createElement(`button`);f.className=`export-trigger-btn`,f.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let p=document.createElement(`div`);p.className=`export-dropdown`,p.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),p.querySelector(`.export-docx-item`).addEventListener(`click`,t=>{t.stopPropagation(),Mi(e,f),p.classList.remove(`show`)}),p.querySelector(`.export-pdf-item`).addEventListener(`click`,t=>{t.stopPropagation(),Ni(e,f),p.classList.remove(`show`)}),f.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==p&&e.classList.remove(`show`)}),p.classList.toggle(`show`)});let m=null;if(d.addEventListener(`mouseenter`,()=>{m=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==p&&e.classList.remove(`show`)}),p.classList.add(`show`)},300)}),d.addEventListener(`mouseleave`,()=>{m&&=(clearTimeout(m),null),setTimeout(()=>{!d.matches(`:hover`)&&!p.matches(`:hover`)&&p.classList.remove(`show`)},100)}),d.appendChild(f),d.appendChild(p),c.appendChild(d),n&&n.length>0&&N.chatConfig?.enableExecutionLog){let e=document.createElement(`button`);e.className=`execution-log-btn`,e.type=`button`,e.title=`执行日志`,e.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),c.appendChild(e)}let h=r!=null,g=n?n.filter(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.status===`success`).length:0,_=n?.find(e=>e.nodeType===`reflection`&&e.reflectionType===`post`);if(h&&N.chatConfig?.enableExecutionLog){let e=r>=8?`score-high`:r>=5?`score-mid`:`score-low`,t=r>=8?`✅`:r>=5?`🔍`:`⚠️`,n=g>1?` (${g}轮)`:``,i=document.createElement(`button`);i.className=`reflection-score-btn`,i.type=`button`,i.title=`AI 质量评估: ${r}/10${n}\n点击查看评估详情`,i.innerHTML=`<span class="reflection-badge ${e}">${t} ${r}/10</span>`,i.dataset.reflectionData=JSON.stringify({overallScore:_?.overallScore??r,dimensions:_?.dimensions||null,issues:_?.issues||null,suggestions:_?.suggestions||null,decision:_?.action?.decision||null,useful:_?.useful??null,reasoning:_?.reasoning||null,suggestion:_?.suggestion||null,rounds:g,wasRevised:!1}),c.appendChild(i)}else if(!h&&_&&_.status===`failed`&&N.chatConfig?.enableExecutionLog){let e=document.createElement(`button`);e.className=`reflection-score-btn`,e.type=`button`,e.title=`反思评估失败（点击查看执行日志）`,e.innerHTML=`<span class="reflection-badge score-low">⚠️ 反思失败</span>`,c.appendChild(e)}e.querySelector(`.message-content`).appendChild(c),ii(),oi(),nn(),$t(e),e.dataset.htmlContent=e.outerHTML}function Ei(e){if(!e)return;e.querySelectorAll(`.thinking-indicator`).forEach(e=>e.classList.add(`hidden`));let t=e.querySelector(`.stream-status`);t&&(t.textContent=`已取消`),e.classList.remove(`streaming`),e.classList.add(`stream-cancelled`)}async function Di(e,t,n=!1,r={}){let i=(await Je()).loopTimeout,a=N.activeSessionId,o=e=>e===void 0?ti.get(a)||null:(ti.set(a,e),e),s=chrome.runtime.connect({name:`keepalive-`+a});console.log(`[SidePanel] keepalive 端口已连接, sessionId:`,a);let c={restarted:!1,rejectFn:null,cleanup:null};s.onMessage.addListener(e=>{e.type===`SW_RESTARTED`&&e.sessionId===a&&(console.warn(`[SidePanel] ⚠️ 收到 SW_RESTARTED 通知，后台已重启，API 调用已丢失`),c.restarted=!0,c.rejectFn&&c.cleanup&&(c.cleanup(),c.rejectFn({message:`后台服务异常重启，API 调用已中断，请重试`,executionLog:[]})))});let l={timeoutId:null,removeListener:()=>{}},u=()=>{try{s.disconnect()}catch{}l.timeoutId&&=(clearTimeout(l.timeoutId),null),l.removeListener(),N.pendingCancelApiMap.delete(a),N.pendingCallApiSessionIds.delete(a),ti.delete(a),hr()};return new Promise((s,d)=>{if(c.cleanup=u,c.rejectFn=d,c.restarted){u(),d({message:`后台服务异常重启，API 调用已中断，请重试`,executionLog:[]});return}let f=[],p=Math.round(i/1e3);o(null),Z=null,ri=0;let m=``,h={},g=e=>{o()&&Ei(o()),u(),(!e.executionLog||e.executionLog.length===0||f.length>0)&&(e.executionLog=f),d(e)};N.pendingCancelApi=g,N.pendingCallApiSessionIds.add(a),hr(),console.log(`[SidePanel] callApi: 添加 pendingCallApiSessionIds, mySessionId =`,a,`, set:`,[...N.pendingCallApiSessionIds]),l.timeoutId=setTimeout(()=>{g({message:`请求超时（${p}秒）`,executionLog:f}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:N.currentTabId,sessionId:N.activeSessionId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},i);let _=Date.now(),v=0,y=null,b=()=>{y===null&&l.timeoutId!==null&&(y=Date.now(),clearTimeout(l.timeoutId),l.timeoutId=null,console.log(`[SidePanel] 前端超时已暂停（澄清工具执行中）`))},x=()=>{if(y!==null){let e=Date.now()-y;v+=e,y=null;let t=Date.now()-_,n=i+v-t;if(n<=0){g({message:`请求超时（${p}秒）`,executionLog:f});return}l.timeoutId=setTimeout(()=>{g({message:`请求超时（${p}秒）`,executionLog:f}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:N.currentTabId,sessionId:a}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},n),console.log(`[SidePanel] 前端超时已恢复，暂停时长:`,Math.round(e/1e3),`s，剩余时间:`,Math.round(n/1e3),`s`)}},S=e=>{if(console.log(`[SidePanel] 收到消息:`,e),e.sessionId&&e.sessionId!==a)return!1;if(e.type===`EXECUTION_STATUS_UPDATE`)return f=e.executionLog||[],!1;if(e.type===`CLARIFY_START`)return b(),!1;if(e.type===`CLARIFY_END`)return x(),!1;if(e.type===`STREAM_PRESELECT`){if(console.log(`[SidePanel] 收到预筛选日志，条数:`,e.preselectLog?.length),Z=e.preselectLog||null,o()&&Z&&Z.length>0){let e=o().querySelector(`.message-content`);e&&(Z.forEach(t=>{let n=wi(t);e.insertBefore(n,e.firstChild)}),Z=null,console.log(`[SidePanel] 预筛选卡片已追加到已有流式元素`))}return!1}if(e.type===`STREAM_START`){console.log(`[SidePanel] 流式输出开始`);let e=r._loadingId,t=e?document.getElementById(e):document.querySelector(`.loading-message`);if(t&&t.remove(),N.executionLogListener&&=(chrome.runtime.onMessage.removeListener(N.executionLogListener),null),N.currentExecutionStatus=null,o()){let e=o().querySelector(`.stream-content`);if(e){let t=document.createElement(`div`);t.className=`thinking-indicator`,t.innerHTML=`
              <svg class="thinking-icon pulse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
                <circle cx="8" cy="12" r="1.5"/>
                <circle cx="16" cy="12" r="1.5"/>
              </svg>
              <div class="thinking-dots"><span></span><span></span><span></span></div>
              <span class="thinking-label">思考中...</span>
            `,e.appendChild(t)}}else if(o(yi()),ri=Date.now(),Z&&Z.length>0){let e=o().querySelector(`.message-content`);Z.forEach(t=>{let n=wi(t);e.insertBefore(n,e.firstChild)}),Z=null}return m=``,ni=Date.now(),!1}if(e.type===`STREAM_CHUNK`)return o()&&(m+=e.delta,xi(o(),m)),!1;if(e.type===`STREAM_TOOL_CALL`)return o()&&e.toolCalls?.length>0&&Si(o(),e.toolCalls),!1;if(e.type===`STREAM_TOOL_RESULT`)return o()&&e.result&&Ci(e.result,o()),!1;if(e.type===`AGENT_STREAM`){if(o()&&e.execId){let t=h[e.execId];if(!t){let n=document.createElement(`div`);n.className=`agent-stream-output`,n.innerHTML=`
              <div class="agent-stream-header">
                <span class="agent-stream-icon">🖥️</span>
                <span class="agent-stream-label">命令输出</span>
              </div>
              <pre class="agent-stream-content"><code></code></pre>
            `;let r=o().querySelector(`.stream-content`);r&&r.appendChild(n),t={element:n,stdout:``,stderr:``},h[e.execId]=t}let n=t.element.querySelector(`code`);n&&(e.streamType===`stderr`?t.stderr+=e.data:t.stdout+=e.data,n.textContent=t.stdout+(t.stderr?`
`+t.stderr:``),n.parentElement.scrollTop=n.parentElement.scrollHeight)}return!1}if(e.type===`AGENT_STREAM_DONE`){if(e.execId){let t=h[e.execId];if(t){let n=t.element.querySelector(`.agent-stream-label`);n&&(n.textContent=`命令输出 - ${e.exitCode===0?`完成`:`退出 (code: ${e.exitCode})`}`),e.exitCode!==0&&t.element.classList.add(`agent-stream-error`)}}return!1}if(e.type===`STREAM_DONE`){if(o()){let e=o().querySelector(`.stream-status`);e&&(e.textContent=`质量评估中...`)}return!1}if(e.type===`API_COMPLETE`){o()&&e.content&&Ti(o(),e.content,e.executionLog||[],e.reflectionScore,e.reasoningContent);let t=o(),n=!!t,r=t?t.dataset.htmlContent||t.outerHTML:null,i=t?t.isConnected:!1;return u(),s({content:e.content,executionLog:e.executionLog||f,reflectionScore:e.reflectionScore,wasStreamed:n,wasRevised:e.wasRevised,streamingHtml:r,streamingConnected:i}),!1}else if(e.type===`API_ERROR`)return u(),d({message:e.error,executionLog:e.executionLog||f}),!1;return!1};chrome.runtime.onMessage.addListener(S),l.removeListener=()=>{chrome.runtime.onMessage.removeListener(S)},console.log(`[SidePanel] 发送 CALL_API 消息，useTools:`,n,`tabId:`,N.currentTabId,`sessionId:`,N.activeSessionId,`apiParams:`,r,`timeout:`,i),chrome.runtime.sendMessage({type:`CALL_API`,sessionId:N.activeSessionId,messages:e,model:t,useTools:n,tabId:N.currentTabId,apiParams:r,imageApiBase:N.enableImageInput&&N.attachedImages.length>0&&N.imageApiBase||``,imageApiKey:N.enableImageInput&&N.attachedImages.length>0&&N.imageApiKey||``})})}function Oi(e){let t=document.querySelector(`.execution-log-panel`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel`;let r=e.reduce((e,t)=>e+(t.duration||0),0),i=e.filter(e=>e.status===`success`).length,a=e.filter(e=>e.status===`failed`).length,o=e.filter(e=>e.nodeType===`subtask`).length,s=e.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,c=e.filter(e=>e.nodeType===`tool_exec`&&e.action?.name===`plan_task`&&e.status===`success`).length,l=e.filter(e=>e.nodeType===`reflection`).find(e=>e.reflectionType===`post`);n.innerHTML=`
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
        <div class="summary-item" title="总耗时: ${Ve(r)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${Ve(r)}</span>
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
        ${li(e)}
      </div>
    </div>
  `,document.body.appendChild(n),n.addEventListener(`click`,e=>{e.target===n&&n.remove()}),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()});let u=n.querySelector(`.toggle-expand-btn`),d=n.querySelectorAll(`.timeline-content`),f=!1;u.addEventListener(`click`,()=>{f=!f,d.forEach(e=>{f?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=u.querySelector(`svg`);f?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,u.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,u.setAttribute(`title`,`展开全部节点`))}),n.querySelectorAll(`.timeline-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.parentElement.classList.toggle(`expanded`)})});let p=n.querySelectorAll(`.combo-stat`),m=n.querySelectorAll(`.timeline-item`);p.forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.status,n=e.classList.contains(`active`);p.forEach(e=>e.classList.remove(`active`)),n?m.forEach(e=>{e.style.display=``}):(e.classList.add(`active`),m.forEach(e=>{if(t===`subtask`)e.classList.contains(`subtask-level`)?e.style.display=``:e.style.display=`none`;else{let n=e.querySelector(`.timeline-dot`);n&&n.classList.contains(t)?e.style.display=``:e.style.display=`none`}}))})})}function ki(e,t){try{let n=e.dataset.textContent_||e.dataset.rawContent||``;navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{console.error(`[SidePanel] 复制失败:`,e);let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),F(`复制失败`,`error`)}}function Ai(e){try{let t=e.dataset.rawContent||``,n=e.dataset.textContent_||``;if(!n&&!t){F(`无法获取消息内容`,`error`);return}if(N.attachedImages=[],t.startsWith(`[`))try{let e=JSON.parse(t);if(Array.isArray(e)){let t=e.filter(e=>e.type===`image_url`);for(let e of t)N.attachedImages.push({dataUrl:e.image_url.url})}}catch{}Kr(),N.quotedContextText=``,N.selectedContextText=``;let r=n.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),i=n.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),a=r||i,o=n;if(a){let e=r?`quoted`:`selected`,t=a[1].trim(),n=a[2].trim(),i=document.getElementById(`selectionIndicator`),s=document.getElementById(`selectionText`);if(i&&s){let n;n=t.length>100?t.substring(0,100)+`...`:t.length>50?t.substring(0,50)+`...`:t,e===`quoted`?(N.quotedContextText=t,s.textContent=`💬 已引用: ${n}`):(N.selectedContextText=t,s.textContent=`📌 已选中: ${n}`),i.classList.add(`show`)}o=n}let s=document.getElementById(`userInput`);s.value=o,Be(),s.focus(),s.selectionStart=s.selectionEnd=s.value.length,console.log(`[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送`)}catch(e){console.error(`[SidePanel] 编辑消息失败:`,e),F(`编辑失败: `+e.message,`error`)}}function ji(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=N.messageHistory.find(e=>e.role===`assistant`);if(t)n=t.content;else{let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}}navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败，请手动选择内容复制`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),F(`复制失败`,`error`)}}function Mi(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${Wt(n)}
      </body>
      </html>
    `,i=new Blob([`﻿`,r],{type:`application/msword`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`word-${new Date().getTime()}.doc`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a);let s=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `,setTimeout(()=>{t.innerHTML=s},2e3),console.log(`[SidePanel] Word 文档导出成功`)}catch(e){console.error(`[SidePanel] 导出 Word 失败:`,e),F(`导出失败: `+e.message,`error`)}}function Ni(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${Wt(n)}
        <div class="footer">${`AI Helper - ${new Date().toLocaleString(`zh-CN`)}`}</div>
      </body>
      </html>
    `,i=window.open(``,`_blank`,`width=800,height=600`);if(!i){F(`请允许弹出窗口以使用 PDF 导出功能`,`warning`);return}i.document.write(r),i.document.close(),i.onload=function(){setTimeout(()=>{i.focus(),i.print()},500)};let a=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `,setTimeout(()=>{t.innerHTML=a},2e3),console.log(`[SidePanel] PDF 导出已触发`)}catch(e){console.error(`[SidePanel] 导出 PDF 失败:`,e),F(`导出失败: `+e.message,`error`)}}function Pi(e){try{let t=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!t){console.warn(`[SidePanel] 无法获取消息内容`);return}let n=document.getElementById(`userInput`);if(!n){console.warn(`[SidePanel] 找不到输入框`);return}let r=e.querySelector(`.quote-btn`),i=r?r.innerHTML:``;vr(t),r&&(r.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `,r.classList.add(`quoted`),setTimeout(()=>{r.innerHTML=i,r.classList.remove(`quoted`)},2e3)),n.focus(),console.log(`[SidePanel] 已引用消息内容到提示条，输入框已获取焦点`)}catch(e){console.error(`[SidePanel] 引用提问失败:`,e),F(`引用失败: `+e.message,`error`)}}function Fi(){console.log(`[SidePanel] 清除选中内容上下文`),N.selectedContextText=``,N.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=0;for(let t=0;t<e.length;t++)if(e[t].startsWith(`[用户问题]`)){n=t;break}n>0&&(t.value=e.slice(n).join(`
`),t.dispatchEvent(new Event(`input`)),console.log(`[SidePanel] 已移除输入框中的选中内容前缀`))}N.lastSelectedText=``,N.currentSelectionRange=null}function Ii(){let e=document.getElementById(`promptManageList`).querySelectorAll(`.prompt-manage-item`);e.forEach(t=>{t.addEventListener(`dragstart`,e=>{N.draggedItemIndex=parseInt(t.dataset.index),t.classList.add(`dragging`),e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,N.draggedItemIndex)}),t.addEventListener(`dragend`,()=>{t.classList.remove(`dragging`),e.forEach(e=>e.classList.remove(`drag-over`)),N.draggedItemIndex=null}),t.addEventListener(`dragover`,e=>{e.preventDefault(),e.dataTransfer.dropEffect=`move`,t.classList.add(`drag-over`)}),t.addEventListener(`dragleave`,()=>{t.classList.remove(`drag-over`)}),t.addEventListener(`drop`,e=>{e.stopPropagation(),e.preventDefault();let n=parseInt(t.dataset.index);if(N.draggedItemIndex!==null&&N.draggedItemIndex!==n){let e=N.customPrompts[N.draggedItemIndex];N.customPrompts.splice(N.draggedItemIndex,1),N.customPrompts.splice(n,0,e),chrome.storage.local.set({customPrompts:N.customPrompts}),$()}t.classList.remove(`drag-over`)})})}function Li(){let e=document.querySelector(`.input-toolbar-right`);if(!e)return;let t=document.createElement(`button`);t.className=`prompt-manage-btn`,t.title=`提示词管理`,t.innerHTML=`<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`,t.addEventListener(`click`,()=>{Ki()}),e.appendChild(t)}function Ri(e=``){let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);t.style.display=`block`,n.classList.add(`show`),Hi(e)}function zi(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`);e.style.display=`none`,t.classList.remove(`show`),N.selectedPromptIndex=-1}function Bi(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`),n=document.getElementById(`userInput`);e.style.display!==`none`&&t.classList.contains(`show`)?zi():(Ri(),n.focus())}function Vi(e=``){Hi(e)}function Hi(e=``){let t=document.getElementById(`promptList`),n=e.toLowerCase(),r=N.customPrompts.filter(t=>e?t.code.toLowerCase().includes(n)||t.content.toLowerCase().includes(n):!0);if(r.length===0){t.innerHTML=`<div class="prompt-empty">暂无匹配的提示词</div>`,N.selectedPromptIndex=-1;return}N.selectedPromptIndex=0,t.innerHTML=r.map((e,t)=>`
    <div class="prompt-item ${t===N.selectedPromptIndex?`selected`:``}" data-index="${t}" data-code="${e.code}">
      <span class="prompt-item-content">${e.content}</span>
      <span class="prompt-item-code">/${e.code}</span>
    </div>
  `).join(``),t.querySelectorAll(`.prompt-item`).forEach(e=>{e.addEventListener(`click`,t=>{let n=e.dataset.code;t.ctrlKey||t.metaKey?Wi(n):Gi(n)})})}function Ui(e){e.forEach((e,t)=>{t===N.selectedPromptIndex?e.classList.add(`selected`):e.classList.remove(`selected`)})}function Wi(e){let t=N.customPrompts.find(t=>t.code===e);if(!t)return;let n=document.getElementById(`userInput`),r=n.value,i=r.lastIndexOf(`/`),a=r;if(i!==-1){let e=-1;for(let t=i-1;t>=0;t--)if(r[t]===`
`){e=t;break}a=e===-1?r.substring(0,i).trimEnd():r.substring(0,e+1).trimEnd()}n.value=a+(a&&!a.endsWith(`
`)?`

`:``)+t.content,n.focus(),n.selectionStart=n.selectionEnd=n.value.length,zi(),Be(),console.log(`[SidePanel] 已追加提示词到输入框:`,t.code,t.content)}async function Gi(e){let t=N.customPrompts.find(t=>t.code===e);if(!t)return;if(N.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}zi();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove();let r=t.content,i=N.enableSelectionQuery&&N.selectedContextText&&N.selectedContextText.trim(),a=N.quotedContextText&&N.quotedContextText.trim();if(a){let e=N.quotedContextText.trim();r=`[引用内容]\n${e}\n\n[用户问题]\n${t.content}`,$r(`quoted`,e,!1),N.quotedContextText=``}else if(i){let e=N.selectedContextText.trim();r=`[选中内容]\n${e}\n\n[用户问题]\n${t.content}`,$r(`selected`,e,!1),N.selectedContextText=``}(i||a)&&Fi();let o=qr(r);X(`user`,qr(t.content)),N.messageHistory.push({role:`user`,content:o}),W(),Ye(t.content);let s=document.getElementById(`userInput`);s.value=``,s.style.height=`auto`,N.isGenerating=!0;let c=document.getElementById(`sendBtn`);c.disabled=!0;let l=vi(),u=N.activeSessionId,d=N.enableImageInput&&N.attachedImages.length>0&&N.imageModelName||N.currentModel;if(N.attachedImages.length>0){let e=document.getElementById(`imagePreviewBar`);e&&(e.innerHTML=``)}try{await Ke(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let e=[{role:`system`,content:Ue()}];if(N.isolateChat){let t=N.messageHistory;N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?(t=[...N.messageHistory.slice(0,-1).slice(-N.chatConfig.maxMemoryMessages),N.messageHistory[N.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,N.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,N.chatConfig.maxMemoryMessages),e=[...e,...t];for(let t=0;t<e.length-1;t++)e[t]={...e[t],content:Jr(e[t].content)}}else e.push({role:`user`,content:o});let t=await We(),n,r;try{let i=await Di(e,d,N.useTools,t);n=i.content,r=i.executionLog||[]}catch(e){throw Q(l),n=`❌ 请求失败：`+(e.message||`未知错误`),r=e.executionLog||[],X(`assistant`,n,!0,r),N.messageHistory.push({role:`assistant`,content:n,executionLog:r}),W(),e}Q(l),await $t(X(`assistant`,n,!0,r)),N.messageHistory.push({role:`assistant`,content:n,executionLog:r}),W()}catch{}finally{N.generatingSessionIds.delete(u),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),c.disabled=!1,s.focus(),N.attachedImages=[]}}function Ki(){document.getElementById(`promptManageModal`).classList.add(`show`),$()}function qi(){document.getElementById(`promptManageModal`).classList.remove(`show`);let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=document.getElementById(`promptManageAddBtn`);e&&(e.value=``),t&&(t.value=``),n&&(n.value=``),r&&(r.textContent=`添加提示词`,r.style.background=`#667eea`)}function $(){let e=document.getElementById(`promptManageList`);if(N.customPrompts.length===0){e.innerHTML=`<div class="prompt-empty">暂无提示词，请添加</div>`;return}e.innerHTML=N.customPrompts.map((e,t)=>`
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
  `).join(``),e.querySelectorAll(`.move-up-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n>0){let e=N.customPrompts[n];N.customPrompts[n]=N.customPrompts[n-1],N.customPrompts[n-1]=e,chrome.storage.local.set({customPrompts:N.customPrompts}),$()}})}),e.querySelectorAll(`.move-down-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n<N.customPrompts.length-1){let e=N.customPrompts[n];N.customPrompts[n]=N.customPrompts[n+1],N.customPrompts[n+1]=e,chrome.storage.local.set({customPrompts:N.customPrompts}),$()}})}),e.querySelectorAll(`.menu-toggle-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);N.customPrompts[n].enabledInMenu=!N.customPrompts[n].enabledInMenu,chrome.storage.local.set({customPrompts:N.customPrompts}),$()})}),e.querySelectorAll(`.edit-btn`).forEach(e=>{e.addEventListener(`click`,()=>{Zi(parseInt(e.dataset.index))})}),e.querySelectorAll(`.delete-btn`).forEach(e=>{e.addEventListener(`click`,()=>{Qi(parseInt(e.dataset.index))})}),Ii()}function Ji(e){let t=document.getElementById(`promptErrorModal`),n=document.getElementById(`promptErrorMessage`);n.textContent=e,t.classList.add(`show`)}function Yi(){document.getElementById(`promptErrorModal`).classList.remove(`show`)}function Xi(){let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=t.value.trim(),i=n.value.trim();if(!r||!i){Ji(`请填写编码和内容`);return}let a=e?parseInt(e.value):-1,o=N.customPrompts.findIndex(e=>e.code===r);if(o!==-1&&o!==a){Ji(`编码已存在`);return}a>=0&&a<N.customPrompts.length?N.customPrompts[a]={...N.customPrompts[a],code:r,content:i}:N.customPrompts.push({code:r,content:i,enabledInMenu:!1}),chrome.storage.local.set({customPrompts:N.customPrompts}),t.value=``,n.value=``,e&&(e.value=``);let s=document.getElementById(`promptManageAddBtn`);s.textContent=`添加提示词`,s.style.background=`#667eea`,$()}function Zi(e){let t=N.customPrompts[e];if(!t)return;let n=document.getElementById(`editPromptIndex`),r=document.getElementById(`newPromptCode`),i=document.getElementById(`newPromptContent`),a=document.getElementById(`promptManageAddBtn`);n&&(n.value=e),r.value=t.code,i.value=t.content,a.textContent=`保存修改`,a.style.background=`#ffa502`,r.scrollIntoView({behavior:`smooth`})}function Qi(e){let t=N.customPrompts[e];if(!t)return;N.pendingDeleteIndex=e;let n=document.getElementById(`deleteConfirmModal`),r=document.getElementById(`deleteConfirmMessage`);r.textContent=`确定要删除提示词 "/${t.code}" 吗？`,n.classList.add(`show`)}function $i(){document.getElementById(`deleteConfirmModal`).classList.remove(`show`),N.pendingDeleteIndex=-1}function ea(e){N.customPrompts.splice(e,1),chrome.storage.local.set({customPrompts:N.customPrompts}),$()}function ta(){let e=document.getElementById(`promptManageCancelBtn`),t=document.getElementById(`promptManageAddBtn`),n=document.getElementById(`promptModalCloseBtn`);e&&e.addEventListener(`click`,qi),t&&t.addEventListener(`click`,Xi),n&&n.addEventListener(`click`,qi);let r=document.getElementById(`deleteCancelBtn`),i=document.getElementById(`deleteConfirmBtn`);r&&r.addEventListener(`click`,$i),i&&i.addEventListener(`click`,()=>{N.pendingDeleteIndex>=0&&ea(N.pendingDeleteIndex),$i()});let a=document.getElementById(`deleteConfirmModal`);a&&a.addEventListener(`click`,e=>{e.target===a&&$i()});let o=document.getElementById(`promptErrorConfirmBtn`);o&&o.addEventListener(`click`,Yi);let s=document.getElementById(`promptErrorModal`);s&&s.addEventListener(`click`,e=>{e.target===s&&Yi()})}function na(){let e=document.getElementById(`toolsPopupOverlay`);if(!e)return;N.currentCategory=`all`,N.currentSearch=``;let t=document.getElementById(`toolsSearchInput`);t&&(t.value=``),la(),ua(),chrome.storage.local.get([`enableToolPreselect`],e=>{let t=document.getElementById(`toolsPreselectToggle`);t&&(t.checked=e.enableToolPreselect===void 0?!0:e.enableToolPreselect)}),document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),ia(),e.classList.add(`show`),console.log(`[SidePanel] 打开工具弹窗`)}function ra(){let e=document.getElementById(`toolsPopupOverlay`);e&&(document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.style.background=``,e.style.color=``,e.style.borderColor=``}),e.classList.remove(`show`),console.log(`[SidePanel] 关闭工具弹窗`))}function ia(){let t=document.getElementById(`toolsPopupList`);if(!t)return;t.innerHTML=``;let n={};e.forEach(e=>{if(N.currentCategory!==`all`&&e.category!==N.currentCategory)return;if(N.currentSearch){let t=e.name.toLowerCase().includes(N.currentSearch),n=e.description.toLowerCase().includes(N.currentSearch);if(!t&&!n)return}let t=e.category||`other`;n[t]||(n[t]=[]),n[t].push(e)});let r=ze;if(Re.forEach(i=>{let a=n[i];if(!a||a.length===0)return;let o=e.filter(e=>e.category===i),s=o.length,c=o.filter(e=>N.enabledTools.includes(e.id)).length,l=document.createElement(`div`);l.className=`popup-tool-category-group`,l.dataset.category=i;let u=document.createElement(`div`);u.className=`popup-tool-category`,u.dataset.category=i;let d=N.collapsedCategories[i]||!1;u.innerHTML=`
      <span class="category-expand-icon">${d?`▶`:`▼`}</span>
      <span class="category-name">${r[i]||i}</span>
      <span class="category-count">${c}/${s}</span>
    `,u.addEventListener(`click`,()=>{aa(i)}),l.appendChild(u);let f=document.createElement(`div`);f.className=`popup-tool-items ${d?`collapsed`:``}`,a.forEach(e=>{let t=N.enabledTools.includes(e.id),n=document.createElement(`div`);n.className=`popup-tool-item`,n.dataset.category=i,n.innerHTML=`
        <input type="checkbox" id="tool_${e.id}" ${t?`checked`:``}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${I(e.name)}</div>
          <div class="popup-tool-desc">${I(e.description)}</div>
        </div>
      `;let r=n.querySelector(`input[type="checkbox"]`);r&&r.addEventListener(`change`,t=>{if(t.stopPropagation(),t.target.checked)N.enabledTools.includes(e.id)||N.enabledTools.push(e.id);else{let t=N.enabledTools.indexOf(e.id);t>-1&&N.enabledTools.splice(t,1)}oa(i),la(),ua()}),f.appendChild(n)}),l.appendChild(f),t.appendChild(l)}),t.children.length===0){let e=document.createElement(`div`);e.className=`popup-tool-empty`,e.textContent=`没有找到匹配的工具`,t.appendChild(e)}}function aa(e){N.collapsedCategories[e]=!N.collapsedCategories[e];let t=document.querySelector(`.popup-tool-category-group[data-category="${e}"]`);if(!t)return;let n=t.querySelector(`.popup-tool-category`).querySelector(`.category-expand-icon`),r=t.querySelector(`.popup-tool-items`);N.collapsedCategories[e]?(n.textContent=`▶`,r.classList.add(`collapsed`)):(n.textContent=`▼`,r.classList.remove(`collapsed`))}function oa(t){let n=document.querySelector(`.popup-tool-category[data-category="${t}"]`);if(!n)return;let r=n.querySelector(`.category-count`);if(!r)return;let i=e.filter(e=>e.category===t),a=i.length,o=0;i.forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&t.checked&&o++}),r.textContent=`${o}/${a}`}function sa(){return e.filter(e=>{if(N.currentCategory!==`all`&&e.category!==N.currentCategory)return!1;if(N.currentSearch){let t=e.name.toLowerCase().includes(N.currentSearch.toLowerCase()),n=e.description.toLowerCase().includes(N.currentSearch.toLowerCase());if(!t&&!n)return!1}return!0})}function ca(){Re.forEach(e=>{oa(e)})}function la(){let t=[`all`,...Re],n=new Set(e.map(e=>e.id)),r=N.enabledTools.filter(e=>n.has(e)).length;t.forEach(t=>{let n=document.getElementById(`badge-`+t);if(!n)return;let i=0,a=0;if(t===`all`)i=e.length,a=r;else{let n=e.filter(e=>e.category===t);i=n.length,a=n.filter(e=>N.enabledTools.includes(e.id)).length}n.textContent=`${a}/${i}`})}function ua(){let t=document.getElementById(`toolsEnabledCount`);if(!t)return;let n=e.length,r=new Set(e.map(e=>e.id));t.textContent=`(已启用 ${N.enabledTools.filter(e=>r.has(e)).length}/${n})`}function da(){let t=[];new Set(e.map(e=>e.id)),e.forEach(e=>{let n=document.getElementById(`tool_`+e.id);n?n.checked&&t.push(e.id):N.enabledTools.includes(e.id)&&t.push(e.id)}),N.enabledTools=t,N.useTools=N.enabledTools.length>0,chrome.storage.local.set({enabledTools:N.enabledTools},()=>{console.log(`[SidePanel] 工具配置已保存:`,N.enabledTools)}),bn().catch(()=>{});let n=document.getElementById(`toolsPreselectToggle`);n&&chrome.storage.local.set({enableToolPreselect:n.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已保存:`,n.checked)}),fa(),F(N.useTools?`已启用 ${N.enabledTools.length} 个工具`:`工具已全部禁用`,`success`)}function fa(){let t=document.getElementById(`toolsToggleBtn`),n=document.getElementById(`toolsBadge`),r=new Set(e.map(e=>e.id)),i=N.enabledTools.filter(e=>r.has(e)).length;t&&(N.useTools&&i>0?(t.classList.add(`active`),t.title=`工具 (${i}个启用)`):(t.classList.remove(`active`),t.title=`工具 (未启用)`)),n&&(i>0?(n.textContent=i,n.style.display=`inline`):n.style.display=`none`)}function pa(e,t){let n=document.getElementById(`tokenStatsOverlay`),r=document.getElementById(`tokenStatsClose`),i=document.getElementById(`tokenStatsRefreshBtn`),a=document.getElementById(`tokenStatsClearBtn`);if(!n)return;function o(){n.style.display=`flex`,c()}function s(){n.style.display=`none`}window.openTokenStats=o,r&&r.addEventListener(`click`,s),n&&n.addEventListener(`click`,e=>{e.target===n&&s()}),i&&i.addEventListener(`click`,c),a&&a.addEventListener(`click`,async()=>{await t(`确定要清空所有 Token 使用统计吗？此操作不可撤销。`,`清空统计`)&&(await h(),c())});async function c(){let t=e(),n=document.getElementById(`tokenStatsLoading`),r=document.getElementById(`tokenStatsEmpty`),i=document.getElementById(`tokenStatsContent`);n&&(n.style.display=``),r&&(r.style.display=`none`),i&&(i.style.display=`none`);try{let[e,a]=await Promise.all([m(t),d()]);if(n&&(n.style.display=`none`),!(a&&a.totalApiCalls>0)){r&&(r.style.display=``);return}i&&(i.style.display=``),l(e),u(a),f(e.records||[])}catch(e){console.error(`[TokenStats] 加载统计失败:`,e),n&&(n.style.display=`none`),r&&(r.textContent=`加载失败`,r.style.display=``)}}function l(e){let t=document.getElementById(`tokenSessionStats`);if(!t)return;if(!e||e.apiCallCount===0){t.innerHTML=`<div style="text-align:center;color:#999;padding:20px;">当前会话暂无数据</div>`;return}let n=e.totalTokens>0?(e.totalPromptTokens/e.totalTokens*100).toFixed(1):0,r=e.totalTokens>0?(e.totalCompletionTokens/e.totalTokens*100).toFixed(1):0;t.innerHTML=`
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div style="background:#f8f9ff;border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">总 Token 消耗</div>
          <div style="font-size:20px;font-weight:700;color:#333;">${p(e.totalTokens)}</div>
        </div>
        <div style="background:#f0fdf4;border-radius:8px;padding:12px;">
          <div style="font-size:11px;color:#888;margin-bottom:4px;">API 调用次数</div>
          <div style="font-size:20px;font-weight:700;color:#333;">${e.apiCallCount}</div>
        </div>
      </div>
      <div style="margin-top:10px;display:flex;gap:10px;font-size:12px;color:#666;">
        <span>Prompt: ${p(e.totalPromptTokens)} (${n}%)</span>
        <span>Completion: ${p(e.totalCompletionTokens)} (${r}%)</span>
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
          <div style="font-size:16px;font-weight:700;color:#333;">${p(e.totalTokens)}</div>
        </div>
        <div style="background:#f0f9ff;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:#888;">总会话数</div>
          <div style="font-size:16px;font-weight:700;color:#333;">${e.totalSessions}</div>
        </div>
        <div style="background:#fdf2f8;border-radius:8px;padding:10px;text-align:center;">
          <div style="font-size:10px;color:#888;">总 API 调用</div>
          <div style="font-size:16px;font-weight:700;color:#333;">${e.totalApiCalls}</div>
        </div>
      </div>`))}function f(e){let t=document.getElementById(`tokenRecentCalls`);if(!t)return;if(!e||e.length===0){t.innerHTML=``;return}let n={react_loop:`ReAct`,non_stream:`普通`,reflection:`反思`,tool_reflection:`工具反思`,subtask_reflection:`子任务反思`};t.innerHTML=e.slice(0,10).map((e,t)=>{let r=new Date(e.timestamp).toLocaleTimeString(`zh-CN`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`}),i=n[e.callType]||e.callType;return`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12px;">
        <span style="color:#999;">#${t+1}</span>
        <span style="color:#666;">${r}</span>
        <span style="background:#f0f0f5;padding:1px 6px;border-radius:3px;font-size:10px;color:#666;">${I(i)}</span>
        <span style="font-weight:500;color:#333;">${p(e.totalTokens)}</span>
        <span style="color:#aaa;font-size:10px;">${(e.contextUsageRate*100).toFixed(1)}%</span>
      </div>`}).join(``)}function p(e){return e>=1e6?(e/1e6).toFixed(1)+`M`:e>=1e3?(e/1e3).toFixed(1)+`K`:String(e)}}chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.chatMaxMemoryMessages&&(N.chatConfig.maxMemoryMessages=e.chatMaxMemoryMessages.newValue,ma(),console.log(`[SidePanel] 记忆限制配置已更新:`,N.chatConfig.maxMemoryMessages))});function ma(){let e=document.getElementById(`memoryLimitLabel`);e&&(N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?e.textContent=`(${N.chatConfig.maxMemoryMessages})`:e.textContent=`(全)`,e.style.display=`inline`,e.style.cursor=`pointer`,e.title=`点击设置记忆历史限制条数`)}function ha(e){e.preventDefault(),e.stopPropagation();let t=document.getElementById(`memoryLimitDropdown`);if(t.classList.toggle(`show`),t.classList.contains(`show`)){let e=N.chatConfig.maxMemoryMessages;t.querySelectorAll(`.memory-limit-option`).forEach(t=>{t.classList.remove(`selected`);let n=parseInt(t.dataset.value);(e===null&&n===0||e!==null&&e>0&&n===e)&&t.classList.add(`selected`)});let n=t.querySelector(`#memoryLimitInput`);e!==null&&e>0?n.value=e:n.value=``}}function ga(){let e=document.getElementById(`memoryLimitDropdown`),t=document.getElementById(`memoryLimitLabel`),n=e?.querySelector(`#memoryLimitInput`);if(!e||!t)return;ma(),t.addEventListener(`click`,ha);let r=e.querySelectorAll(`.memory-limit-option`);r.forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let i=parseInt(e.dataset.value),a=i===0?null:i;r.forEach(e=>e.classList.remove(`selected`)),e.classList.add(`selected`),n&&(n.value=i===0?``:i),chrome.storage.local.set({chatMaxMemoryMessages:a},()=>{N.chatConfig.maxMemoryMessages=a,ma(),F(`✅ 配置已更新`,`success`)})})}),n&&(n.addEventListener(`click`,e=>e.stopPropagation()),n.addEventListener(`mousedown`,e=>e.stopPropagation()),n.addEventListener(`change`,e=>{e.stopPropagation();let t=e.target.value.trim(),n=t&&parseInt(t)>0?parseInt(t):null;r.forEach(e=>e.classList.remove(`selected`)),chrome.storage.local.set({chatMaxMemoryMessages:n},()=>{N.chatConfig.maxMemoryMessages=n,ma(),F(`✅ 配置已更新`,`success`)})})),document.addEventListener(`click`,n=>{!e.contains(n.target)&&n.target!==t&&e.classList.remove(`show`)})}function _a(e){document.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?(t.classList.add(`selected`),t.querySelector(`.model-option-check`).textContent=`✓`):(t.classList.remove(`selected`),t.querySelector(`.model-option-check`).textContent=``)})}function va(e,t){let n=document.getElementById(`tempDropdown`);if(!n){typeof t==`function`&&t();return}chrome.storage.local.get([`deletedPresetModels`],r=>{if((r.deletedPresetModels||[]).forEach(e=>{let t=n.querySelector(`.model-option[data-value="${e}"]`);t&&t.remove()}),!e||e.length===0){typeof t==`function`&&t();return}let i=[`deepseek-v4-pro`,`deepseek-v4-flash`];e.forEach(e=>{if(i.includes(e)||n.querySelector(`.model-option[data-value="${e}"]`))return;let t=document.createElement(`div`);t.className=`model-option`,t.dataset.value=e,t.innerHTML=`<span class="model-option-check"></span>${e}`,t.addEventListener(`click`,t=>{t.stopPropagation(),N.currentModel=e,_a(e),chrome.storage.local.set({modelName:e})}),n.querySelector(`.model-section`).appendChild(t)}),typeof t==`function`&&t()})}function ya(e,t=`📌 已选中`){if(!N.enableSelectionQuery)return;N.quotedContextText=``,N.selectedContextText=e;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let i;i=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,r.textContent=`${t}: ${i}`,n.classList.add(`show`)}}function ba(e,t,n=0,r=0){if(!N.enableSelectionQuery)return;let i=document.getElementById(`selectionFloatingMenu`),a=document.getElementById(`selectionMenuItems`);if(!i||!a)return;let o=N.customPrompts.filter(e=>e.enabledInMenu===!0);if(o.length===0)return;a.innerHTML=``,o.forEach(e=>{let n=e.content.length>10?e.content.substring(0,10)+`...`:e.content,r=document.createElement(`div`);r.className=`menu-item`,r.innerHTML=`
      <span>${n}</span>
      <span class="menu-item-code">/${e.code}</span>
    `,r.addEventListener(`click`,n=>{n.stopPropagation(),xa(e,t)}),a.appendChild(r)});let s=document.body.getBoundingClientRect(),c=40+o.length*36,l=r-s.top-c-30,u=n-s.left-20;l<s.top+10&&(l=r-s.top+30),u<s.left+10&&(u=n-s.left+20),u+180>s.right-10&&(u=n-s.left-180-30,u<s.left+10&&(u=n-s.left+20)),l+c>s.bottom-10&&(l=r-s.top-c-30,l<s.top+10&&(l=r-s.top+30)),i.style.top=l+`px`,i.style.left=u+`px`,i.style.maxHeight=s.bottom-l-20+`px`,i.classList.add(`show`)}window.hideFloatingMenu=function(){let e=document.getElementById(`selectionFloatingMenu`);e&&e.classList.remove(`show`),N.lastSelectedText=``,N.currentSelectionRange=null};async function xa(e,t){if(!N.enableSelectionQuery)return;if(window.hideFloatingMenu(),N.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}N.selectedContextText=t,yr();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove(),$r(`selected`,t,!1);let r=`[选中内容]\n${t}\n\n[用户问题]\n${e.content}`;X(`user`,e.content),N.messageHistory.push({role:`user`,content:r}),W(),Ye(e.content),N.isGenerating=!0;let i=document.getElementById(`sendBtn`);i.disabled=!0;let a=vi(),o=N.activeSessionId,s=N.currentModel;try{await Ke(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let e=[{role:`system`,content:Ue()}];if(N.isolateChat){let t=N.messageHistory;N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?(t=[...N.messageHistory.slice(0,-1).slice(-N.chatConfig.maxMemoryMessages),N.messageHistory[N.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,N.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,N.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:r});let t=await We(),n,i;try{let r=await Di(e,s,N.useTools,t);n=r.content,i=r.executionLog||[]}catch(e){throw Q(a),n=`❌ 请求失败：`+(e.message||`未知错误`),i=e.executionLog||[],X(`assistant`,n,!0,i),N.messageHistory.push({role:`assistant`,content:n,executionLog:i}),W(),e}Q(a),await $t(X(`assistant`,n,!0,i)),N.messageHistory.push({role:`assistant`,content:n,executionLog:i}),W()}catch{}finally{N.generatingSessionIds.delete(o),document.dispatchEvent(new CustomEvent(`generating-state-changed`)),i.disabled=!1,document.getElementById(`userInput`).focus()}}function Sa(e){let t=document.getElementById(`headerAgentDot`),n=document.getElementById(`headerAgentIndicator`);if(!(!t||!n))if(!e||!e.connected)t.className=`header-agent-dot disconnected`,n.title=`Agent 未连接 - 点击前往设置`;else{t.className=`header-agent-dot connected`;let r=[`Agent 已连接`];e.platformName&&r.push(e.platformName),e.arch&&r.push(e.arch),n.title=r.join(` | `)+` - 点击前往设置`}}document.addEventListener(`DOMContentLoaded`,async()=>{window.__tableBlocks=[],await qe(),await gr(),chrome.runtime.onMessage.addListener(e=>{e.type===`SELECTION_AI_SEARCH`&&e.prompt&&(console.log(`[SidePanel] 收到选中文本 AI 搜索:`,e.selectedText?.substring(0,50)),Xr(e.prompt,e.selectedText),chrome.storage.session.remove(`pendingSelectionSearch`).catch(()=>{})),e.type===`FILL_SIDEPANEL_INPUT`&&e.text&&(console.log(`[SidePanel] 收到追问填充:`,e.text?.substring(0,50)),Zr(e.text),chrome.storage.session.remove(`pendingFillInput`).catch(()=>{})),e.type===`DIRECT_SEND`&&e.text&&(console.log(`[SidePanel] 收到直接发送:`,e.text?.substring(0,50)),Qr(e.text,e.selectedText||``),chrome.storage.session.remove(`pendingDirectSend`).catch(()=>{})),e.type===`AGENT_STATUS_CHANGE`&&(console.log(`[SidePanel] 收到 Agent 状态变化:`,e.connected,e.status),chrome.storage.local.get(`agentPlatform`,e=>{N.agentPlatform=e.agentPlatform||{connected:!1},Sa(N.agentPlatform)})),e.type===`AGENT_CONNECTION_CHANGED`&&(console.log(`[SidePanel] 收到 Agent 连接状态变更:`,e.connected),N.agentPlatform={...N.agentPlatform,connected:e.connected},Sa(N.agentPlatform))});let t=await chrome.storage.session.get(`pendingSelectionSearch`);if(t.pendingSelectionSearch&&t.pendingSelectionSearch.selectedText){let{prompt:e,selectedText:n}=t.pendingSelectionSearch;console.log(`[SidePanel] 有待处理的选中文本搜索:`,n?.substring(0,50)),setTimeout(()=>{Xr(e,n)},500),await chrome.storage.session.remove(`pendingSelectionSearch`)}let n=await chrome.storage.session.get(`pendingFillInput`);if(n.pendingFillInput&&n.pendingFillInput.text){let{text:e}=n.pendingFillInput;console.log(`[SidePanel] 有待填充的追问文本:`,e?.substring(0,50)),setTimeout(()=>{Zr(e)},500),await chrome.storage.session.remove(`pendingFillInput`)}let r=await chrome.storage.session.get(`pendingDirectSend`);if(r.pendingDirectSend&&r.pendingDirectSend.text){let{text:e,selectedText:t}=r.pendingDirectSend;console.log(`[SidePanel] 有待直接发送的文本:`,e?.substring(0,50)),setTimeout(()=>{Qr(e,t||``)},500),await chrome.storage.session.remove(`pendingDirectSend`)}chrome.tabs.onActivated.addListener(async e=>{console.log(`[SidePanel] Tab 切换, 新 Tab ID:`,e.tabId),N.currentTabId=e.tabId}),chrome.tabs.onUpdated.addListener(async(e,t)=>{t.status===`complete`&&N.currentTabId===e&&console.log(`[SidePanel] 当前 Tab 页面更新:`,t)}),typeof marked<`u`&&(marked.setOptions({breaks:!0,gfm:!0}),console.log(`[SidePanel] Marked 库已加载`)),typeof mermaid<`u`&&(mermaid.initialize({startOnLoad:!1,theme:`default`,securityLevel:`loose`,fontFamily:`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`}),console.log(`[SidePanel] Mermaid 库已加载`));let i=document.getElementById(`userInput`),a=document.getElementById(`sendBtn`),o=document.getElementById(`clearChatBtn`),s=document.getElementById(`exportChatBtn`),c=document.getElementById(`chatContainer`),l=document.getElementById(`tempDisplay`),u=document.getElementById(`tempDropdown`),d=document.getElementById(`tempPresetList`),f=document.getElementById(`tempSlider`),p=document.getElementById(`tempNumberInput`);function m(){if(!i||N.isScrolling)return;i.style.height=`auto`;let e=i.scrollHeight;e<=50?i.style.height=``:i.style.height=Math.min(e,100)+`px`}chrome.storage.local.get([`temperature`,`topP`,`selectedTempIndex`],e=>{e.temperature!==void 0&&(N.temperature=e.temperature),e.topP!==void 0&&(N.topP=e.topP),e.selectedTempIndex!==void 0&&(N.selectedTempIndex=e.selectedTempIndex),h()});function h(){f&&(f.value=N.temperature),p&&(p.value=N.temperature.toFixed(2));let e=document.getElementById(`tempIconValue`);e&&(e.textContent=N.temperature.toFixed(2)),g()}function g(){d.innerHTML=P.map((e,t)=>`
      <div class="temp-preset-item ${t===N.selectedTempIndex?`selected`:``}" data-index="${t}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${e.label}</div>
          <div class="temp-preset-desc" title="${e.tip}">${e.tip}</div>
        </div>
        <div class="temp-preset-value">${e.temp.toFixed(2)}</div>
      </div>
    `).join(``),d.querySelectorAll(`.temp-preset-item`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation(),_(parseInt(e.dataset.index))})})}function _(e){let t=P[e];t&&(N.selectedTempIndex=e,N.temperature=t.temp,h(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex}))}f.addEventListener(`input`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),N.temperature=t,p.value=t.toFixed(2);let n=document.getElementById(`tempIconValue`);n&&(n.textContent=t.toFixed(2));let r=0,i=Math.abs(P[0].temp-t);for(let e=1;e<P.length;e++){let n=Math.abs(P[e].temp-t);n<i&&(i=n,r=e)}N.selectedTempIndex=r,g(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex})}),p.addEventListener(`change`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),N.temperature=t,f.value=t,p.value=t.toFixed(2);let n=0,r=Math.abs(P[0].temp-t);for(let e=1;e<P.length;e++){let i=Math.abs(P[e].temp-t);i<r&&(r=i,n=e)}N.selectedTempIndex=n,g(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex})}),l&&u&&(l.addEventListener(`click`,e=>{e.stopPropagation(),u.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{let t=document.querySelector(`.temp-selector`);t&&!t.contains(e.target)&&u.classList.remove(`show`)})),c.addEventListener(`mousedown`,e=>{N.lastMouseX=e.clientX,N.lastMouseY=e.clientY}),c.addEventListener(`mouseup`,e=>{N.lastMouseX=e.clientX,N.lastMouseY=e.clientY,N.enableSelectionQuery&&setTimeout(()=>{let e=window.getSelection();if(e&&!e.isCollapsed&&e.toString().trim()){let t=e.toString().trim();c.contains(e.anchorNode)&&t!==N.lastSelectedText&&(N.lastSelectedText=t,N.currentSelectionRange=e.getRangeAt(0).cloneRange(),ya(t),ba(e,t,N.lastMouseX,N.lastMouseY))}else c.contains(e.anchorNode)||(N.lastSelectedText=``,N.currentSelectionRange=null,window.hideFloatingMenu())},10)});let v=``,y=null;async function b(){try{let e=await new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>e(t))});if(e&&e.length>0){let t=await new Promise(t=>{chrome.tabs.sendMessage(e[0].id,{action:`getSelectedText`},e=>{chrome.runtime.lastError?(console.debug(`[SidePanel] content script 未加载或无法通信:`,chrome.runtime.lastError.message),t(null)):t(e)})});if(!t)return;let n=t?.text||``;n&&n.trim()?n!==v&&(v=n,ya(n.trim())):v=``}}catch{}}function x(){y&&=(clearInterval(y),null),N.enableSelectionQuery&&(y=setInterval(b,500))}x(),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`&&`enableSelectionQuery`in e){N.enableSelectionQuery=e.enableSelectionQuery.newValue;let t=document.getElementById(`enableSelectionQueryBtn`);t&&(t.checked=N.enableSelectionQuery),x()}}),chrome.storage.local.get([`modelName`,`customModels`,`customPrompts`,`systemPrompt`,`inputHistory`,`agentPlatform`,`enableImageInput`,`imageModelName`,`imageApiBase`,`imageApiKey`],e=>{let t=e.modelName;t&&(N.currentModel=t),N.customPrompts=e.customPrompts||[],N.systemPrompt=e.systemPrompt||``,N.inputHistory=e.inputHistory||[],e.agentPlatform&&(N.agentPlatform=e.agentPlatform),Sa(N.agentPlatform),N.enableImageInput=e.enableImageInput||!1,N.imageModelName=e.imageModelName||``,N.imageApiBase=e.imageApiBase||``,N.imageApiKey=e.imageApiKey||``,Ca(),Li(),va(e.customModels,()=>{t&&_a(t)})}),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`){if(e.customModels){let t=e.customModels.newValue||[],n=u.querySelector(`.model-section`);n&&n.querySelectorAll(`.model-option`).forEach(e=>{let t=e.dataset.value;t!==`deepseek-v4-pro`&&t!==`deepseek-v4-flash`&&e.remove()}),va(t)}if(e.modelName){let t=e.modelName.newValue;t&&(N.currentModel=t,_a(t))}e.enableImageInput&&(N.enableImageInput=e.enableImageInput.newValue,Ca()),e.imageModelName&&(N.imageModelName=e.imageModelName.newValue||``),e.imageApiBase&&(N.imageApiBase=e.imageApiBase.newValue||``),e.imageApiKey&&(N.imageApiKey=e.imageApiKey.newValue||``),e.deletedPresetModels&&(e.deletedPresetModels.newValue||[]).forEach(e=>{let t=u.querySelector(`.model-option[data-value="${e}"]`);t&&t.remove()})}}),br(),document.addEventListener(`session-switched`,()=>{let e=document.getElementById(`chatContainer`),t=document.getElementById(`sendBtn`),n=document.getElementById(`userInput`);if(!e)return;let r=document.getElementById(`imagePreviewBar`);if(N.attachedImages.length>0&&r&&r.style.display===`none`&&(N.attachedImages=[]),N.executionLogListener&&=(chrome.runtime.onMessage.removeListener(N.executionLogListener),null),t&&(t.disabled=N.isGenerating),n&&n.focus(),e.innerHTML=``,!N.messageHistory||N.messageHistory.length===0){let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      `,e.appendChild(t)}else N.messageHistory.forEach(e=>{e.htmlContent?bi(e.htmlContent):X(e.role,e.content,!1,e.executionLog||[],e.reflectionScore,e.wasRevised)}),Jt();let i=N.pendingCallApiSessionIds.has(N.activeSessionId)&&!!N.pendingCancelApi;if(console.log(`[SidePanel] session-switched: pendingTask?`,i,`pendingSessionIds:`,[...N.pendingCallApiSessionIds],`activeSessionId:`,N.activeSessionId,`hasCancelApi:`,!!N.pendingCancelApi),i){console.log(`[SidePanel] 切回有后台任务的会话，显示加载状态`);let e=vi();N.substituteLoadingIds.set(N.activeSessionId,e)}let a=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.get([a],e=>{e[a]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t&&(t.scrollTop=e[a])},150)})}),document.querySelectorAll(`.model-option`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.value;N.currentModel=n,_a(n),chrome.storage.local.set({modelName:n})})}),document.addEventListener(`click`,e=>{let t=document.getElementById(`promptDropdown`),n=document.getElementById(`promptSelector`),r=document.getElementById(`selectionFloatingMenu`);if(n.contains(e.target)||(t.classList.remove(`show`),zi()),r&&!r.contains(e.target)){let t=window.getSelection(),n=c.contains(e.target),r=t&&!t.isCollapsed&&c.contains(t.anchorNode);(!n||!r)&&window.hideFloatingMenu()}}),a.addEventListener(`click`,Yr);let S=document.getElementById(`promptTriggerBtn`);S&&S.addEventListener(`click`,e=>{e.stopPropagation(),S.blur(),Bi()});let C=document.getElementById(`shortcutsBtn`),w=document.getElementById(`shortcutsModal`),T=document.getElementById(`shortcutsCloseBtn`);function E(){w&&(w.style.display=`flex`)}function ee(){w&&(w.style.display=`none`)}C&&C.addEventListener(`click`,e=>{e.stopPropagation(),E();let t=document.getElementById(`headerMoreDropdown`);t&&t.classList.remove(`show`)}),T&&T.addEventListener(`click`,ee),w&&w.addEventListener(`click`,e=>{e.target===w&&ee()}),document.addEventListener(`keydown`,e=>{if((e.ctrlKey||e.metaKey)&&e.key===`t`){e.preventDefault();let t=document.getElementById(`toolsPopup`);t&&t.style.display!==`none`?ra():na()}if(e.key===`Escape`&&w&&w.style.display!==`none`){ee();return}if(e.altKey&&e.code===`Slash`){e.preventDefault(),E();return}if(e.altKey&&!e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey){e.preventDefault(),Ta();return}if(e.altKey&&e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey){e.preventDefault(),Ea();return}if(e.altKey&&(e.key===`ArrowUp`||e.key===`ArrowDown`)){let t=document.getElementById(`chatContainer`);if(!t)return;let n=t.querySelectorAll(`.message.user, .message.assistant, .user-context-bubble`);if(e.shiftKey){e.preventDefault(),e.key===`ArrowUp`&&n.length>0?n[0].scrollIntoView({behavior:`smooth`,block:`start`}):e.key===`ArrowDown`&&n.length>0&&n[n.length-1].scrollIntoView({behavior:`smooth`,block:`start`});return}if(n.length===0)return;let r=t.getBoundingClientRect().top;if(e.key===`ArrowUp`){e.preventDefault();let t=-1;for(let e=0;e<n.length;e++)if(n[e].getBoundingClientRect().bottom>r+10){t=e;break}t===-1&&(t=n.length);let i=t-1;i>=0&&n[i].scrollIntoView({behavior:`smooth`,block:`start`})}else if(e.key===`ArrowDown`){e.preventDefault();let t=-1;for(let e=0;e<n.length;e++)if(n[e].getBoundingClientRect().bottom>r+10){t=e;break}if(t===-1)return;let i=t+1;i<n.length&&n[i].scrollIntoView({behavior:`smooth`,block:`start`})}}}),i.addEventListener(`keydown`,e=>{let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);if(t.style.display!==`none`&&n.classList.contains(`show`)){let t=n.querySelectorAll(`.prompt-item`),r=t.length;if(r!==0&&e.key===`ArrowDown`){e.preventDefault(),N.selectedPromptIndex<0?N.selectedPromptIndex=0:N.selectedPromptIndex=(N.selectedPromptIndex+1)%r,Ui(t);return}if(e.key===`ArrowUp`){e.preventDefault(),N.selectedPromptIndex<0||N.selectedPromptIndex===0?N.selectedPromptIndex=r-1:--N.selectedPromptIndex,Ui(t);return}if(e.key===`Enter`&&(e.ctrlKey||e.metaKey)&&N.selectedPromptIndex>=0){e.preventDefault();let n=t[N.selectedPromptIndex].dataset.code;Wi(n);return}if(e.key===`Enter`&&N.selectedPromptIndex>=0){e.preventDefault();let n=t[N.selectedPromptIndex].dataset.code;Gi(n);return}if(e.key===`Escape`){zi();return}}if(e.key===`Escape`){N.inputHistoryIndex>=0&&(N.inputHistoryIndex=-1),i.value&&(i.value=``,i.style.height=`auto`,i.dispatchEvent(new Event(`input`))),e.preventDefault();return}if(!(t.style.display!==`none`&&n.classList.contains(`show`))&&!N.isGenerating){if(e.key===`ArrowUp`){e.preventDefault(),N.inputHistoryIndex===-1?N.inputHistoryIndex=N.inputHistory.length-1:N.inputHistoryIndex>0&&N.inputHistoryIndex--,N.inputHistoryIndex<0&&(N.inputHistoryIndex=0),N.inputHistoryIndex>=0&&N.inputHistory.length>0&&(i.value=N.inputHistory[N.inputHistoryIndex],i.dispatchEvent(new Event(`input`)));return}if(e.key===`ArrowDown`){e.preventDefault(),N.inputHistoryIndex>=0&&N.inputHistoryIndex<N.inputHistory.length-1?(N.inputHistoryIndex++,i.value=N.inputHistory[N.inputHistoryIndex],i.dispatchEvent(new Event(`input`))):(N.inputHistoryIndex=-1,i.value=``,i.dispatchEvent(new Event(`input`)));return}}e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),Yr())}),i.addEventListener(`paste`,e=>{if(!N.enableImageInput)return;let t=e.clipboardData?.items;if(t){for(let n of t)if(n.type.startsWith(`image/`)){e.preventDefault();let t=n.getAsFile();t&&Gr(t);break}}});let te=document.getElementById(`screenshotBtn`);te&&te.addEventListener(`click`,async e=>{if(!N.enableImageInput)return;let t=e.ctrlKey||e.shiftKey||e.metaKey;try{t?await Ea():await Ta()}catch(e){console.error(`[SidePanel] 截图失败:`,e),F(`截图失败，请重试`)}}),Wr(),i.addEventListener(`wheel`,e=>{N.isScrolling=!0;let t=i.style.height||i.offsetHeight+`px`;i.style.height=t,i.scrollHeight<=i.clientHeight+10&&(e.preventDefault(),e.stopPropagation()),setTimeout(()=>{N.isScrolling=!1},100)},{passive:!1}),i.addEventListener(`input`,e=>{let t=i.value;document.getElementById(`promptSelector`),document.getElementById(`promptDropdown`);let n=t.lastIndexOf(`/`);if(n!==-1){let e=t.substring(n+1);n===0||t[n-1]===`
`||t[n-1]===` `?Ri(e):Vi(e)}else zi();m()}),c.addEventListener(`scroll`,()=>{let e=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.set({[e]:c.scrollTop})});let ne=document.getElementById(`headerMoreBtn`),D=document.getElementById(`headerMoreDropdown`);ne&&D&&(ne.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{!D.contains(e.target)&&e.target!==ne&&D.classList.remove(`show`)})),o.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),kr()}),s&&s.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),Sr()});let re=document.getElementById(`importChatBtn`);re&&re.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),Dr()});let ie=document.getElementById(`importSessionsFile`);ie&&ie.addEventListener(`change`,e=>{let t=e.target.files[0];t&&Or(t)});let ae=document.getElementById(`settingsBtn`);ae&&ae.addEventListener(`click`,()=>{chrome.runtime.openOptionsPage()});let oe=document.getElementById(`headerAgentIndicator`);oe&&oe.addEventListener(`click`,async()=>{let e=chrome.runtime.getURL(`options.html#agent`),t=await chrome.tabs.query({url:chrome.runtime.getURL(`options.html`)});t.length>0?await chrome.tabs.update(t[0].id,{active:!0,url:e}):await chrome.tabs.create({url:e})});let se=document.getElementById(`prototypeLibraryBtn`);se&&se.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),Dt()});let ce=document.getElementById(`tokenStatsHeaderBtn`);ce&&ce.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),window.openTokenStats&&window.openTokenStats()}),pa(()=>N.activeSessionId,Ce);let le=document.getElementById(`isolateChatBtn`),O=document.getElementById(`enableToolsBtn`),ue=document.getElementById(`toolsConfigBtn`);chrome.storage.local.get([`isolateChat`,`enableSelectionQuery`,`enableTools`,`enabledTools`],t=>{t.isolateChat!==void 0&&(N.isolateChat=t.isolateChat),le.checked=N.isolateChat,t.enableSelectionQuery!==void 0&&(N.enableSelectionQuery=t.enableSelectionQuery);let n=document.getElementById(`enableSelectionQueryBtn`);if(n&&(n.checked=N.enableSelectionQuery),t.enableTools!==void 0&&(N.useTools=t.enableTools),t.enabledTools&&t.enabledTools.length>0){let n=new Set(e.map(e=>e.id)),r=t.enabledTools.filter(e=>n.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);N.enabledTools=[...r,...i],i.length>0&&chrome.storage.local.set({enabledTools:N.enabledTools})}else N.enabledTools=e.filter(e=>e.enabled).map(e=>e.id);N.enabledTools.length===0&&(N.useTools=!1),O&&(O.checked=N.useTools),x()}),le.addEventListener(`change`,()=>{N.isolateChat=le.checked,chrome.storage.local.set({isolateChat:N.isolateChat}),console.log(`[SidePanel] 记忆对话:`,N.isolateChat?`已启用`:`已禁用`)});let de=document.getElementById(`enableSelectionQueryBtn`);de&&de.addEventListener(`change`,()=>{N.enableSelectionQuery=de.checked,chrome.storage.local.set({enableSelectionQuery:N.enableSelectionQuery}),console.log(`[SidePanel] 划词问答:`,N.enableSelectionQuery?`已启用`:`已禁用`),!N.enableSelectionQuery&&N.selectedContextText&&yr()}),O&&O.addEventListener(`change`,()=>{N.useTools=O.checked,chrome.storage.local.set({enableTools:N.useTools}),N.useTools&&N.enabledTools.length===0&&(N.enabledTools=e.filter(e=>e.enabled).map(e=>e.id),chrome.storage.local.set({enabledTools:N.enabledTools})),console.log(`[SidePanel] 工具总开关:`,N.useTools?`已启用`:`已禁用`)}),ue&&ue.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),na()});let fe=document.getElementById(`toolsPopupOverlay`),pe=document.getElementById(`toolsPopupClose`),me=fe?fe.querySelector(`.modal-container`):null;pe&&pe.addEventListener(`click`,ra),me&&me.addEventListener(`click`,e=>{e.stopPropagation()});let he=document.getElementById(`toolsSearchInput`);he&&he.addEventListener(`input`,e=>{N.currentSearch=e.target.value.toLowerCase(),ia()});let ge=document.querySelectorAll(`.category-btn`);ge.forEach(e=>{e.addEventListener(`click`,()=>{ge.forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.style.background=`#f5f3ff`,e.style.color=`#667eea`,e.style.borderColor=`#d4cfff`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`,N.currentCategory=e.dataset.category,ia()})});let k=document.getElementById(`toolsCategories`);k&&k.addEventListener(`wheel`,e=>{e.preventDefault(),k.scrollLeft+=e.deltaY*2},{passive:!1});let _e=document.getElementById(`toolsSelectAll`),A=document.getElementById(`toolsSelectNone`);_e&&_e.addEventListener(`click`,()=>{sa().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!0),N.enabledTools.includes(e.id)||N.enabledTools.push(e.id)}),ca(),la(),ua()}),A&&A.addEventListener(`click`,()=>{sa().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!1);let n=N.enabledTools.indexOf(e.id);n>-1&&N.enabledTools.splice(n,1)}),ca(),la(),ua()});let ve=document.getElementById(`toolsPopupSave`);ve&&ve.addEventListener(`click`,()=>{da(),ua()});let ye=document.getElementById(`toolsPreselectToggle`);ye&&ye.addEventListener(`change`,()=>{chrome.storage.local.set({enableToolPreselect:ye.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已更新:`,ye.checked)})});let be=document.getElementById(`toolsPopupCancel`);be&&be.addEventListener(`click`,()=>{ra()});let xe=document.getElementById(`modalCancelBtn`),Se=document.getElementById(`modalConfirmBtn`);function Ce(e,t=`确认操作`){return new Promise(n=>{let r=document.getElementById(`customConfirmOverlay`),i=document.getElementById(`customConfirmTitle`),a=document.getElementById(`customConfirmMessage`),o=document.getElementById(`customConfirmCancelBtn`),s=document.getElementById(`customConfirmOkBtn`);if(!r||!i||!a||!o||!s){n(confirm(e));return}let c=()=>{r.style.display=`none`,s.removeEventListener(`click`,l),o.removeEventListener(`click`,u),r.removeEventListener(`click`,d)},l=()=>{c(),n(!0)},u=()=>{c(),n(!1)},d=e=>{e.target===r&&(c(),n(!1))};i.textContent=t,a.textContent=e,r.style.display=`flex`,s.addEventListener(`click`,l),o.addEventListener(`click`,u),r.addEventListener(`click`,d)})}let j=document.getElementById(`toolStatsOverlay`),we=document.getElementById(`toolStatsClose`),Te=document.getElementById(`toolStatsBtn`);function Ee(){j&&(j.style.display=`flex`,Ae())}function De(){j&&(j.style.display=`none`)}Te&&Te.addEventListener(`click`,e=>{e.stopPropagation(),Ee()}),we&&we.addEventListener(`click`,De),j&&j.addEventListener(`click`,e=>{e.target===j&&De()});let Oe=document.getElementById(`toolStatsRefreshBtn`);Oe&&Oe.addEventListener(`click`,Ae);let ke=document.getElementById(`toolStatsClearBtn`);ke&&ke.addEventListener(`click`,async()=>{await Ce(`确定要清空所有工具使用统计吗？此操作不可撤销。`,`清空统计`)&&(await chrome.storage.local.remove([`toolUsageStats`]),Ae())});let M={column:`callCount`,asc:!1};async function Ae(){let t=document.getElementById(`toolStatsTable`),n=document.getElementById(`toolStatsTableBody`),r=document.getElementById(`toolStatsLoading`),i=document.getElementById(`toolStatsEmpty`),a=document.getElementById(`toolStatsSummary`),o=document.getElementById(`toolStatsUnusedSection`),s=document.getElementById(`toolStatsUnusedList`);if(!(!t||!n||!r||!i)){t.style.display=`none`,i.style.display=`none`,o&&(o.style.display=`none`),a&&(a.textContent=``),r.style.display=``;try{let n=(await chrome.storage.local.get([`toolUsageStats`])).toolUsageStats||{},c=Object.entries(n);if(c.length===0){r.style.display=`none`,i.style.display=``;return}let l={};e.forEach(e=>{l[e.id]=e.name?`${e.name}：${e.description||``}`:e.description||e.id}),je(c,l);let u=e.map(e=>e.id),d=new Set(c.map(([e])=>e)),f=u.filter(e=>!d.has(e)),p=c.length,m=f.length;a&&(a.textContent=`已使用 ${p} 个，未使用 ${m} 个`),o&&s&&m>0&&(s.innerHTML=f.sort((e,t)=>e.toLowerCase().localeCompare(t.toLowerCase())).map(e=>`<code title="${I(l[e]||e)}" style="padding: 3px 10px; background: #f5f5f5; color: #aaa; border: 1px solid #eee; border-radius: 4px; font-size: 11px;">${e}</code>`).join(``),o.style.display=``),r.style.display=`none`,t.style.display=``}catch(e){console.error(`[SidePanel] 加载统计失败:`,e),r.style.display=`none`,i.textContent=`加载失败`,i.style.display=``}}}function je(e,t){let n=document.getElementById(`toolStatsTableBody`);if(!n)return;let{column:r,asc:i}=M;n.innerHTML=[...e].sort((e,t)=>{let[n,a]=e,[o,s]=t,c=a.callCount>0?a.successCount/a.callCount*100:0,l=s.callCount>0?s.successCount/s.callCount*100:0,u=a.callCount>0?a.totalDuration/a.callCount:0,d=s.callCount>0?s.totalDuration/s.callCount:0,f=0;switch(r){case`name`:f=n.toLowerCase().localeCompare(o.toLowerCase());break;case`callCount`:f=a.callCount-s.callCount;break;case`successCount`:f=a.successCount-s.successCount;break;case`successRate`:f=c-l;break;case`duration`:f=u-d;break}return i?f:-f}).map(([e,n])=>{let r=n.callCount>0?n.successCount/n.callCount*100:0,i=n.callCount>0?n.totalDuration/n.callCount:0,a=t[e]||e,o=`#38a169`;r<60?o=`#e53e3e`:r<85&&(o=`#d69e2e`);let s=i<1e3?`${Math.round(i)}ms`:`${(i/1e3).toFixed(1)}s`;return`<tr>
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
      </tr>`}).join(``),Me()}function Me(){let{column:e,asc:t}=M,n=[`name`,`callCount`,`successCount`,`successRate`,`duration`],r={name:`sortByName`,callCount:`sortByCallCount`,successCount:`sortBySuccessCount`,successRate:`sortBySuccessRate`,duration:`sortByDuration`};n.forEach(n=>{let i=document.getElementById(r[n]);if(!i)return;let a=i.querySelector(`.sort-indicator`);a&&(n===e?(a.textContent=t?`▲`:`▼`,a.style.color=`#667eea`):(a.textContent=``,a.style.color=``))})}document.querySelectorAll(`#toolStatsTable th[data-sort]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.sort;M.column===t?M.asc=!M.asc:(M.column=t,M.asc=!1),Ae()})}),xe.addEventListener(`click`,()=>{Ar()}),Se.addEventListener(`click`,()=>{Ar(),xr()});let Ne=document.getElementById(`confirmModal`);Ne.addEventListener(`click`,e=>{e.target===Ne&&Ar()});let Pe=document.getElementById(`selectionClose`);Pe&&Pe.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),console.log(`[SidePanel] 用户点击关闭选中内容按钮`),yr(),window.hideFloatingMenu(),N.lastSelectedText=``,N.currentSelectionRange=null}),i.addEventListener(`input`,()=>{})}),Ge().then(()=>ma()),document.addEventListener(`DOMContentLoaded`,()=>{ga()}),document.addEventListener(`DOMContentLoaded`,Ze),document.addEventListener(`DOMContentLoaded`,ta),document.addEventListener(`DOMContentLoaded`,ft),document.addEventListener(`DOMContentLoaded`,gt),document.addEventListener(`DOMContentLoaded`,Ut),document.addEventListener(`DOMContentLoaded`,Er);function Ca(){let e=document.getElementById(`imagePreviewBar`),t=document.getElementById(`screenshotBtn`);e&&(e.style.display=N.attachedImages.length>0?``:`none`),t&&(N.enableImageInput?t.style.removeProperty(`display`):t.style.display=`none`),userInput&&(N.enableImageInput?userInput.style.paddingRight=`84px`:userInput.style.paddingRight=``),N.enableImageInput||(N.attachedImages=[]),wa()}function wa(){let e=document.getElementById(`imagePreviewBar`);if(e){if(e.innerHTML=``,N.attachedImages.length===0){e.style.display=`none`;return}e.style.display=``,N.attachedImages.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`image-preview-item`;let i=document.createElement(`img`);i.src=t.dataUrl,i.className=`image-preview-thumb`,i.title=`点击查看大图`,i.style.cursor=`zoom-in`,i.addEventListener(`click`,()=>{Rr(t.dataUrl,i)});let a=document.createElement(`button`);a.className=`image-preview-remove`,a.innerHTML=`×`,a.title=`移除图片`,a.addEventListener(`click`,e=>{e.stopPropagation(),N.attachedImages.splice(n,1),wa()}),r.appendChild(i),r.appendChild(a),e.appendChild(r)})}}async function Ta(){if(!N.enableImageInput){F(`请先开启图片输入功能`);return}try{let e=await chrome.runtime.sendMessage({type:`CAPTURE_TAB`});e?.dataUrl&&(Gr(await(await fetch(e.dataUrl)).blob()),F(`截图成功`))}catch(e){console.error(`[SidePanel] 全页面截图失败:`,e),F(`截图失败，请重试`)}}async function Ea(){let e=await qe();if(!e){F(`无法获取当前标签页`);return}try{let t=await chrome.tabs.sendMessage(e,{type:`START_REGION_SELECTION`});if(!t)return;console.log(`[SidePanel] 区域选择结果:`,t);let n=await chrome.runtime.sendMessage({type:`CAPTURE_TAB`});if(!n?.dataUrl){F(`截图失败，请重试`);return}let r=await Da(n.dataUrl,t);if(!r){F(`裁剪失败，请重试`);return}Gr(await(await fetch(r)).blob())}catch(e){console.error(`[SidePanel] 区域截图失败:`,e),F(`区域截图失败，请确保页面已加载且未被浏览器限制`)}}function Da(e,t){return new Promise((n,r)=>{let i=new Image;i.onload=()=>{let e=document.createElement(`canvas`),r=window.devicePixelRatio||1,a=t.x*r,o=t.y*r,s=t.width*r,c=t.height*r;e.width=s,e.height=c,e.getContext(`2d`).drawImage(i,a,o,s,c,0,0,s,c),n(e.toDataURL(`image/jpeg`,.85))},i.onerror=()=>r(Error(`图片加载失败`)),i.src=e})}
//# sourceMappingURL=side_panel-D2f10ooN.js.map