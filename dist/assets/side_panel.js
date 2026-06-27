import{n as e,r as t}from"./constants-CYfGTw-M.js";import{_ as n,c as r,d as i,f as a,g as o,h as s,i as c,l,m as u,n as d,s as f,t as p,u as m,v as h,x as g}from"./token-counter-C6QcPNvr.js";var _=new Set,v=[],y=`deepseek-v4-pro`,b=null,x=[],S=!0,C=!0,w=!1,ee=null,te=``,T=``,E=[],ne=-1,D=null,re=``,ie=[],ae=-1,O={maxInputHistory:20,maxHistoryMessages:50,maxMessageLength:1e5,maxMemoryMessages:20},oe=.2,k=1,se=0,ce=`all`,le=``,A=[],ue={},j=new Map,de=null,M=new Map,fe=new Set,pe=new Map,me=null,he=null,ge=null,_e=null,ve=null,ye=18e4,be=null,xe=!1,Se=null,Ce=``,we=null,Te=0,Ee=0,De=-1,Oe=!1,N={get isGenerating(){return _.has(b)},set isGenerating(e){e?_.add(b):_.delete(b)},get generatingSessionIds(){return _},get messageHistory(){return v},set messageHistory(e){v=e},get currentModel(){return y},set currentModel(e){y=e},get activeSessionId(){return b},set activeSessionId(e){b=e},get sessions(){return x},set sessions(e){x=e},get useTools(){return S},set useTools(e){S=e},get isolateChat(){return C},set isolateChat(e){C=e},get enableSelectionQuery(){return w},set enableSelectionQuery(e){w=e},get currentTabId(){return ee},set currentTabId(e){ee=e},get selectedContextText(){return te},set selectedContextText(e){te=e},get quotedContextText(){return T},set quotedContextText(e){T=e},get customPrompts(){return E},set customPrompts(e){E=e},get selectedPromptIndex(){return ne},set selectedPromptIndex(e){ne=e},get draggedItemIndex(){return D},set draggedItemIndex(e){D=e},get systemPrompt(){return re},set systemPrompt(e){re=e},get inputHistory(){return ie},set inputHistory(e){ie=e},get inputHistoryIndex(){return ae},set inputHistoryIndex(e){ae=e},get chatConfig(){return O},set chatConfig(e){O=e},get temperature(){return oe},set temperature(e){oe=e},get topP(){return k},set topP(e){k=e},get selectedTempIndex(){return se},set selectedTempIndex(e){se=e},get currentCategory(){return ce},set currentCategory(e){ce=e},get currentSearch(){return le},set currentSearch(e){le=e},get enabledTools(){return A},set enabledTools(e){A=e},get collapsedCategories(){return ue},get sessionExecutionStatus(){return j},set sessionExecutionStatus(e){j=e},get currentExecutionStatus(){return j.get(b)||null},set currentExecutionStatus(e){e===null?j.delete(b):j.set(b,e)},get executionLogListener(){return de},set executionLogListener(e){de=e},get pendingCancelApi(){return M.get(b)||null},set pendingCancelApi(e){e===null?M.delete(b):M.set(b,e)},get pendingCancelApiMap(){return M},get pendingCallApiSessionIds(){return fe},set pendingCallApiSessionIds(e){fe=e},get substituteLoadingIds(){return pe},set substituteLoadingIds(e){pe=e},get currentClarifyToolCallId(){return me},set currentClarifyToolCallId(e){me=e},get currentClarifySessionId(){return he},set currentClarifySessionId(e){he=e},get currentConfirmToolCallId(){return ge},set currentConfirmToolCallId(e){ge=e},get currentConfirmSessionId(){return _e},set currentConfirmSessionId(e){_e=e},get clarifyTimerInterval(){return ve},set clarifyTimerInterval(e){ve=e},get clarifyTimeoutValue(){return ye},set clarifyTimeoutValue(e){ye=e},get messageTocContainer(){return be},set messageTocContainer(e){be=e},get isMouseOverToc(){return xe},set isMouseOverToc(e){xe=e},get tocHideTimer(){return Se},set tocHideTimer(e){Se=e},get lastSelectedText(){return Ce},set lastSelectedText(e){Ce=e},get currentSelectionRange(){return we},set currentSelectionRange(e){we=e},get lastMouseX(){return Te},set lastMouseX(e){Te=e},get lastMouseY(){return Ee},set lastMouseY(e){Ee=e},get pendingDeleteIndex(){return De},set pendingDeleteIndex(e){De=e},get isScrolling(){return Oe},set isScrolling(e){Oe=e}},ke=t,P=[{label:`精准编码`,temp:.2,topP:1,tip:`较低随机性，适合业务开发、调试、纠错`},{label:`均衡开发`,temp:.45,topP:.9,tip:`兼顾稳定性，用于封装工具类、常规脚本`},{label:`架构探索`,temp:.65,topP:.9,tip:`提供多种实现思路，用于组件重构、方案对比`},{label:`创意发散`,temp:.9,topP:.9,tip:`随机性较高，仅用于原型探索，不建议生产代码`}],Ae={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,info_extract:`📄 信息提取`,page_analysis:`🔍 页面分析`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_process:`📷 媒体处理`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,system_integration:`⚙️ 系统集成`,memory:`🧠 记忆检索`};function F(e,t=`info`,n=3e3){let r=document.getElementById(`toastContainer`);if(!r)return;let i=document.createElement(`div`);i.className=`toast ${t}`,i.textContent=e,r.appendChild(i),requestAnimationFrame(()=>{i.classList.add(`toast-show`)}),setTimeout(()=>{i.classList.remove(`toast-show`),setTimeout(()=>{i.parentNode&&i.parentNode.removeChild(i)},300)},n)}function je(){let e=document.getElementById(`userInput`);e&&(e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,100)+`px`)}function I(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function L(e){return!e||e<0?`0ms`:e<1e3?`${Math.round(e)}ms`:e<6e4?`${(e/1e3).toFixed(1)}s`:`${Math.floor(e/6e4)}分${(e%6e4/1e3).toFixed(1)}秒`}function Me(e,t){navigator.clipboard.writeText(e).then(()=>{let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(n=>{console.error(`[SidePanel] 复制失败:`,n);let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败`,`error`)}document.body.removeChild(r)})}function Ne(){let e=new Date().toLocaleString(`zh-CN`),t=`

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
- 当前时间：${e}${t}
`:`你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题
- **任务规划**：能够将复杂任务拆解为多个子任务，规划执行顺序和所需工具${t}

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
- 当前时间：${e}
`}function Pe(){return new Promise(e=>{chrome.storage.local.get([`temperature`,`topP`],t=>{e({temperature:t.temperature===void 0?parseFloat(N.temperature.toFixed(2)):parseFloat(t.temperature.toFixed(2)),top_p:t.topP===void 0?parseFloat(N.topP.toFixed(2)):parseFloat(t.topP.toFixed(2))})})})}function Fe(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(N.chatConfig=t,console.log(`[SidePanel] 对话配置已加载:`,N.chatConfig)),e(t)})})}async function Ie(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(N.chatConfig=t,console.log(`[SidePanel] 同步加载对话配置:`,N.chatConfig)),e()})})}async function Le(){return new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>{t&&t.length>0&&t[0].id?(N.currentTabId=t[0].id,console.log(`[SidePanel] 获取当前 Tab ID:`,N.currentTabId,`URL:`,t[0].url),e(N.currentTabId)):(console.warn(`[SidePanel] 未获取到有效的 Tab ID`),e(null))})})}function Re(){return new Promise(e=>{chrome.storage.local.get([`reactMaxIterations`,`reactApiTimeout`,`reactLoopTimeout`,`reactToolTimeout`,`reactClarifyTimeout`],t=>{e({maxIterations:t.reactMaxIterations||30,apiTimeout:t.reactApiTimeout||6e4,loopTimeout:t.reactLoopTimeout||3e5,toolTimeout:t.reactToolTimeout||3e4,clarifyTimeout:t.reactClarifyTimeout||18e4})})})}function ze(e){if(!e||!e.trim()||e.trim()==`/`)return;let t=e.trim(),n=N.inputHistory.indexOf(t);n!==-1&&N.inputHistory.splice(n,1),N.inputHistory.push(t),N.inputHistory.length>N.chatConfig.maxInputHistory&&N.inputHistory.shift(),Be()}function Be(){try{chrome.storage.local.set({inputHistory:N.inputHistory}),console.log(`[SidePanel] 输入历史已保存，数量:`,N.inputHistory.length)}catch(e){console.error(`[SidePanel] 保存输入历史失败:`,e)}}function Ve(){document.addEventListener(`mouseover`,He,!0),document.addEventListener(`mouseout`,Ue,!0),console.log(`[SidePanel] 消息目录功能已初始化`)}function He(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){N.isMouseOverToc=!0;return}let t=e.target.closest(`.message.assistant`);if(!t)return;let n=t.querySelectorAll(`.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6`);if(n.length===0){Ge();return}We(t,n)}function Ue(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){N.isMouseOverToc=!1,N.tocHideTimer&&=(clearTimeout(N.tocHideTimer),null);return}if(!e.target.closest(`.message.assistant`))return;let t=e.relatedTarget;t&&(t.closest(`.message-toc-container`)||t.closest(`.message.assistant`))||N.isMouseOverToc||(N.tocHideTimer&&clearTimeout(N.tocHideTimer),N.tocHideTimer=setTimeout(()=>{N.isMouseOverToc||Ge(),N.tocHideTimer=null},800))}function We(e,t){let n=Array.from(t);N.messageTocContainer&&Ge(),n.forEach((e,t)=>{e.id||=`toc-heading-${Date.now()}-${t}`});let r=document.createElement(`div`);r.className=`message-toc-container`,r.dataset.headingsCount=n.length;let i=0,a=n.map(e=>{let t=parseInt(e.tagName.charAt(1)),n=e.textContent.trim(),r=n.length>30?n.substring(0,30)+`...`:n,a=`H${t}`;return i++,`
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
  `,document.body.appendChild(r),N.messageTocContainer=r;let o=e.getBoundingClientRect(),s=window.innerWidth-280;o.right<s&&(r.style.left=o.right+`px`,r.style.right=`0`,r.style.width=`auto`);let c=r.querySelector(`.message-toc-toggle`),l=r.querySelector(`.message-toc-panel`);c.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),c.addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),l.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),r.querySelectorAll(`.message-toc-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.target,n=document.getElementById(t);n&&(n.scrollIntoView({behavior:`smooth`,block:`start`}),n.classList.add(`toc-highlight`),setTimeout(()=>{n.classList.remove(`toc-highlight`)},1500))})})}function Ge(){N.tocHideTimer&&=(clearTimeout(N.tocHideTimer),null),N.messageTocContainer&&=(N.messageTocContainer.remove(),null)}function Ke(e){return`${Math.floor(e/60)}:${(e%60).toString().padStart(2,`0`)}`}function qe(e=`default`){try{let t=new(window.AudioContext||window.webkitAudioContext),n=t.createOscillator(),r=t.createGain();n.connect(r),r.connect(t.destination);let i={default:{frequency:800,duration:.3},success:{frequency:523,duration:.2},warning:{frequency:440,duration:.4},error:{frequency:220,duration:.5}},a=i[e]||i.default;n.frequency.value=a.frequency,n.type=`sine`,r.gain.setValueAtTime(.3,t.currentTime),r.gain.exponentialRampToValueAtTime(.01,t.currentTime+a.duration),n.start(t.currentTime),n.stop(t.currentTime+a.duration),console.log(`[SidePanel] 提示音已播放:`,e)}catch(e){console.error(`[SidePanel] 播放提示音失败:`,e.message)}}function Je(e,t){let n=document.getElementById(`clarifyTimer`),r=document.getElementById(`clarifyTimerText`);if(!n||!r)return;r.textContent=`剩余时间: ${Ke(e)}`;let i=e/t*100;n.classList.remove(`warning`,`critical`),e<=10?(n.classList.add(`critical`),r.textContent=`即将超时: ${Ke(e)}`):(e<=30||i<=15)&&n.classList.add(`warning`),e===30&&qe(`warning`)}function Ye(e){Xe(),N.clarifyTimeoutValue=e;let t=Math.ceil(e/1e3),n=t;Je(n,t),N.clarifyTimerInterval=setInterval(()=>{n--,n<=0?Xe():Je(n,t)},1e3)}function Xe(){N.clarifyTimerInterval&&=(clearInterval(N.clarifyTimerInterval),null)}function Ze(e){console.log(`[SidePanel] 显示澄清对话框:`,e);let{question:t,options:n,recommendedOption:r,allowCustomInput:i=!0,allowAdditionalInfo:a=!0,toolCallId:o,timeout:s=18e4,sessionId:c}=e;N.currentClarifyToolCallId=o,N.currentClarifySessionId=c||null;let l=document.getElementById(`clarifySessionName`);if(l)if(c&&N.sessions){let e=N.sessions.find(e=>e.id===c);e?(l.textContent=`会话: ${e.title}`,l.style.display=`block`):(l.textContent=`会话: ${c.substring(0,8)}...`,l.style.display=`block`)}else l.textContent=``,l.style.display=`none`;let u=r!==void 0&&r>=0?r:0,d=[u],f=u,p=document.getElementById(`clarifyQuestion`);p&&(p.textContent=t);let m=document.getElementById(`clarifyOptionsList`);if(m&&(document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.remove()}),n.forEach((e,t)=>{let n=d.includes(t),r=document.createElement(`div`);r.className=`clarify-option-item ${f===t?`selected`:``} ${n?`recommended`:``}`,r.dataset.index=t,r.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${e}${n?`<span class="clarify-option-badge">推荐</span>`:``}</div>
      `,r.addEventListener(`click`,()=>$e(t)),m.appendChild(r)}),i)){let e=document.createElement(`div`);e.className=`clarify-option-item`,e.dataset.index=-1,e.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `,e.addEventListener(`click`,()=>$e(-1)),m.appendChild(e);let t=document.getElementById(`clarifyCustomInput`);t&&m.appendChild(t)}let h=document.getElementById(`clarifyCustomInput`);h&&h.classList.remove(`show`);let g=document.getElementById(`clarifyAdditionalInfo`);g&&g.classList.toggle(`show`,a);let _=document.getElementById(`clarifyCustomTextarea`);_&&(_.value=``);let v=document.getElementById(`clarifyAdditionalTextarea`);v&&(v.value=``);let y=document.getElementById(`clarifyOverlay`);y&&y.classList.add(`show`),Ye(s),console.log(`[SidePanel] 澄清对话框已显示`)}function Qe(){let e=document.getElementById(`clarifyOverlay`);e&&e.classList.remove(`show`),N.currentClarifyToolCallId=null,N.currentClarifySessionId=null,Xe(),console.log(`[SidePanel] 澄清对话框已隐藏`)}function $e(e){document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.classList.remove(`selected`)});let t=document.querySelector(`.clarify-option-item[data-index="${e}"]`);t&&t.classList.add(`selected`);let n=document.getElementById(`clarifyCustomInput`);if(n)if(e===-1){n.classList.add(`show`);let e=document.getElementById(`clarifyCustomTextarea`);e&&e.focus()}else n.classList.remove(`show`);console.log(`[SidePanel] 选择澄清选项:`,e)}function et(){if(!N.currentClarifyToolCallId){console.error(`[SidePanel] 没有当前工具调用ID`);return}let e=-1;document.querySelectorAll(`.clarify-option-item`).forEach((t,n)=>{t.classList.contains(`selected`)&&(e=parseInt(t.dataset.index))});let t=document.getElementById(`clarifyCustomTextarea`),n=t?t.value.trim():``,r=document.getElementById(`clarifyAdditionalTextarea`),i=r?r.value.trim():``,a={type:`CLARIFY_RESPONSE`,toolCallId:N.currentClarifyToolCallId,selectedOption:e,customInput:n,additionalInfo:i};console.log(`[SidePanel] 发送澄清响应:`,a),chrome.runtime.sendMessage(a),Qe()}function tt(){if(N.currentClarifyToolCallId){let e={type:`CLARIFY_RESPONSE`,toolCallId:N.currentClarifyToolCallId,selectedOption:-1,customInput:``,additionalInfo:``};chrome.runtime.sendMessage(e)}Qe()}function nt(){let e=document.getElementById(`clarifyConfirmBtn`);e&&e.addEventListener(`click`,et);let t=document.getElementById(`clarifyCancelBtn`);t&&t.addEventListener(`click`,tt),chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.type===`SHOW_CLARIFY_DIALOG`)console.log(`[SidePanel] 收到澄清请求:`,e,`当前激活会话:`,N.activeSessionId),Ze(e.data),n({success:!0});else if(e.type===`PLAY_NOTIFICATION_SOUND`)console.log(`[SidePanel] 收到播放提示音请求:`,e),qe(e.soundType),n({success:!0});else if(e.type===`CLARIFY_TIMEOUT`){if(console.log(`[SidePanel] 收到澄清超时通知:`,e),e.sessionId&&N.currentClarifySessionId&&e.sessionId!==N.currentClarifySessionId){console.log(`[SidePanel] 澄清超时来自其他会话，忽略`);return}let t=document.getElementById(`clarifyTimer`),n=document.getElementById(`clarifyTimerText`);t&&n&&(t.classList.remove(`warning`),t.classList.add(`critical`),n.textContent=`已超时`),qe(`error`)}}),console.log(`[SidePanel] 澄清对话框事件已初始化`)}var R=null;function rt(e){let{toolName:t,toolLabel:n,args:r,message:i,toolCallId:a,sessionId:o,timeout:s=3e4}=e;console.log(`[SidePanel] 显示确认对话框:`,t,e),N.currentConfirmToolCallId=a,N.currentConfirmSessionId=o||null;let c=document.getElementById(`confirmOverlay`);if(!c)return;document.getElementById(`confirmToolName`).textContent=n||t;let l=document.getElementById(`confirmArgsSummary`);if(l&&r){let e=Object.entries(r).filter(([e,t])=>t!=null&&t!==``).slice(0,5);e.length>0?(l.innerHTML=e.map(([e,t])=>`<span class="confirm-arg"><strong>${e}:</strong> ${typeof t==`string`?t.substring(0,50):JSON.stringify(t).substring(0,50)}</span>`).join(``),l.style.display=`block`):l.style.display=`none`}let u=document.getElementById(`confirmMessage`);return u&&(u.textContent=i||`模型请求执行操作: ${n||t}`),c.style.display=`flex`,new Promise(e=>{R=e,setTimeout(()=>{R&&(console.log(`[SidePanel] 确认对话框超时，自动拒绝`),it(!1))},s)})}function it(e){let t=document.getElementById(`confirmOverlay`);t&&(t.style.display=`none`),chrome.runtime.sendMessage({type:`TOOL_CONFIRMATION_RESPONSE`,toolCallId:N.currentConfirmToolCallId,confirmed:e,sessionId:N.currentConfirmSessionId}).catch(e=>{console.log(`[SidePanel] 发送确认响应失败:`,e.message)}),N.currentConfirmToolCallId=null,N.currentConfirmSessionId=null,R&&=(R(e),null)}function at(){let e=document.getElementById(`confirmApproveBtn`),t=document.getElementById(`confirmDenyBtn`);e&&e.addEventListener(`click`,()=>it(!0)),t&&t.addEventListener(`click`,()=>it(!1)),chrome.runtime.onMessage.addListener((e,t,n)=>e.type===`SHOW_CONFIRM_DIALOG`?(rt(e.data),n({received:!0}),!1):!1)}var z=null,B=1,ot=.25,st=2,ct=.1;function lt(e){let t=e.trim();return/^\s*<!DOCTYPE\s/i.test(t)||/^\s*<html[\s>]/i.test(t)?/<\/head>/i.test(t)?t.replace(/<\/head>/i,`<style>html,body{overflow:auto!important;height:auto!important;}</style></head>`):/<body[\s>]/i.test(t)?t.replace(/<body([\s>])/i,`<body$1<style>html,body{overflow:auto!important;height:auto!important;}</style>`):t:`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;overflow:auto;">${t}</body>
</html>`}function ut(e){console.log(`[SidePanel] 显示 UI 原型预览:`,e),z=e,Tt();let t=document.getElementById(`prototypeTitle`),n=document.getElementById(`prototypeDescription`),r=document.getElementById(`prototypeIframe`);t&&(t.textContent=e.title||`UI 原型预览`),n&&(n.textContent=e.description||``,n.style.display=e.description?`block`:`none`),r&&e.html&&(r.srcdoc=lt(e.html));let i=document.getElementById(`prototypeOverlay`);i&&i.classList.add(`show`),console.log(`[SidePanel] UI 原型预览弹窗已显示`)}function dt(){let e=document.getElementById(`prototypeOverlay`);e&&e.classList.remove(`show`);let t=document.getElementById(`prototypeIframe`);t&&(t.srcdoc=``),z=null,console.log(`[SidePanel] UI 原型预览弹窗已隐藏`)}function ft(){if(!z)return;let e=z.id,t=z.title||`原型`;dt();let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 继续优化原型:`,e)}function pt(){if(!z||!z.html){console.error(`[SidePanel] 没有可下载的原型`);return}let e=lt(z.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t),r=document.createElement(`a`);r.href=n,r.download=(z.title||`prototype`).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)+`.html`,document.body.appendChild(r),r.click(),document.body.removeChild(r),URL.revokeObjectURL(n),console.log(`[SidePanel] 原型已下载:`,r.download)}function mt(){if(!z||!z.html){console.error(`[SidePanel] 没有可打开的原型`);return}let e=lt(z.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t);chrome.tabs.create({url:n,active:!0}),console.log(`[SidePanel] 原型已在新标签页打开`)}async function ht(e){try{let t=await s(e);if(!t){console.error(`[SidePanel] 未找到原型:`,e);return}ut(t)}catch(e){console.error(`[SidePanel] 加载原型失败:`,e)}}async function gt(){let e=document.getElementById(`prototypeLibraryList`),t=document.getElementById(`prototypeLibraryModal`);if(!(!e||!t)){e.innerHTML=`<div class="prototype-library-empty">加载中...</div>`;try{let t=await o();t.length===0?e.innerHTML=`<div class="prototype-library-empty">暂无原型</div>`:(e.innerHTML=t.map(e=>{let t=e.id.replace(`proto_`,``).slice(-6);return`
        <div class="prototype-library-item" data-id="${e.id}">
          <div class="prototype-library-item-info">
            <div class="prototype-library-item-title">${bt(e.title)}</div>
            <div class="prototype-library-item-id">ID: ${t}</div>
            <div class="prototype-library-item-time">${xt(e.createdAt)}</div>
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
      `}).join(``),e.querySelectorAll(`.prototype-library-item`).forEach(e=>{let t=e.querySelector(`.prototype-library-item-info`),n=e.querySelector(`.prototype-library-item-open`),r=e.querySelector(`.prototype-library-item-optimize`),i=e.querySelector(`.prototype-library-item-delete`);t&&t.addEventListener(`click`,()=>{let t=e.dataset.id;ht(t),V()}),n&&n.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.id;ht(n),V()}),r&&r.addEventListener(`click`,t=>{t.stopPropagation();let n=r.dataset.id;_t(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`),V()}),i&&i.addEventListener(`click`,t=>{t.stopPropagation();let n=i.dataset.id;vt(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`)})}))}catch(t){console.error(`[SidePanel] 加载原型库失败:`,t),e.innerHTML=`<div class="prototype-library-empty">加载失败</div>`}t.classList.add(`show`),console.log(`[SidePanel] 原型库已显示`)}}function V(){let e=document.getElementById(`prototypeLibraryModal`);e&&e.classList.remove(`show`),console.log(`[SidePanel] 原型库已隐藏`)}function _t(e,t){let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 从原型库继续优化原型:`,e)}async function vt(e,t){if(await yt(`确认删除`,`确定删除原型 "${t}" 吗？此操作不可撤销。`,`删除`))try{await r(e),console.log(`[SidePanel] 原型已删除:`,e),gt()}catch(e){console.error(`[SidePanel] 删除原型失败:`,e),alert(`删除失败: `+e.message)}}function yt(e,t,n=`确认`){return new Promise(r=>{let i=document.getElementById(`genericConfirmModal`),a=document.getElementById(`genericConfirmTitle`),o=document.getElementById(`genericConfirmMessage`),s=document.getElementById(`genericConfirmOkBtn`),c=document.getElementById(`genericConfirmCancelBtn`);if(!i){r(confirm(t));return}a.textContent=e,o.textContent=t,s.textContent=n;let l=()=>{i.classList.remove(`show`),s.removeEventListener(`click`,u),c.removeEventListener(`click`,d)},u=()=>{l(),r(!0)},d=()=>{l(),r(!1)};s.addEventListener(`click`,u),c.addEventListener(`click`,d),i.classList.add(`show`)})}function bt(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function xt(e){if(!e)return``;let t=new Date(e),n=new Date-t;return n<6e4?`刚刚`:n<36e5?Math.floor(n/6e4)+` 分钟前`:n<864e5?Math.floor(n/36e5)+` 小时前`:t.toLocaleDateString(`zh-CN`)}function St(e){B=Math.max(ot,Math.min(st,e)),B=Math.round(B*100)/100;let t=document.getElementById(`prototypeIframe`),n=document.getElementById(`prototypeZoomLevel`);t&&(t.style.zoom=B),n&&(n.textContent=Math.round(B*100)+`%`,B===1?n.classList.remove(`zoomed`):n.classList.add(`zoomed`))}function Ct(){St(B+ct),Et()}function wt(){St(B-ct),Et()}function Tt(){St(1)}function Et(){let e=document.getElementById(`prototypeZoomLevel`);e&&(e.classList.add(`flash`),setTimeout(()=>e.classList.remove(`flash`),150))}function Dt(e){!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.deltaY<0?Ct():wt())}function Ot(e){(e.ctrlKey||e.metaKey)&&e.key===`0`&&(e.preventDefault(),Tt())}function kt(){let e=document.getElementById(`prototypeCloseBtn`);e&&e.addEventListener(`click`,dt);let t=document.getElementById(`prototypeDownloadBtn`);t&&t.addEventListener(`click`,pt);let n=document.getElementById(`prototypeOpenTabBtn`);n&&n.addEventListener(`click`,mt);let r=document.getElementById(`prototypeContinueBtn`);r&&r.addEventListener(`click`,ft);let i=document.getElementById(`prototypeZoomInBtn`);i&&i.addEventListener(`click`,Ct);let a=document.getElementById(`prototypeZoomOutBtn`);a&&a.addEventListener(`click`,wt);let o=document.getElementById(`prototypeZoomLevel`);o&&o.addEventListener(`click`,Tt);let s=document.getElementById(`prototypeContent`);s&&s.addEventListener(`wheel`,Dt,{passive:!1}),document.addEventListener(`keydown`,Ot);let c=document.getElementById(`prototypeLibraryCloseBtn`);c&&c.addEventListener(`click`,V);let l=document.getElementById(`prototypeLibraryCancelBtn`);l&&l.addEventListener(`click`,V),chrome.runtime.onMessage.addListener((e,t,n)=>{e.type===`SHOW_UI_PROTOTYPE`&&(console.log(`[SidePanel] 收到显示原型请求:`,e),ht(e.data.prototypeId),n({success:!0}))}),console.log(`[SidePanel] UI 原型模块事件已初始化`)}function At(e){if(!e)return``;let t=[];e=e.replace(/```mermaid\n?([\s\S]*?)```/g,(e,n)=>{let r=t.length;return t.push(n.trim()),`%%MERMAID_BLOCK_${r}%%`});let n=[];e=e.replace(/```(\w*)\n?([\s\S]*?)```/g,(e,t,r)=>{let i=n.length;return n.push({language:t||`text`,content:r.trim()}),`%%CODE_BLOCK_${i}%%`});let r=[];e=e.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(e,t,n,i)=>{let a=r.length;return r.push({header:t,separator:n,body:i,full:e.trim()}),`\n%%TABLE_BLOCK_${a}%%\n`});let i=``;return typeof marked<`u`?(marked.setOptions({breaks:!0,gfm:!0}),i=marked.parse(e)):i=e.replace(/`([^`]+)`/g,`<code>$1</code>`).replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`).replace(/\*([^*]+)\*/g,`<em>$1</em>`).replace(/\n/g,`<br>`),t.forEach((e,t)=>{i=i.replace(`%%MERMAID_BLOCK_${t}%%`,`<div class="mermaid" data-raw-code="${encodeURIComponent(e)}">${e}</div>`)}),n.forEach((e,t)=>{let n=e.content.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`);i=i.replace(`%%CODE_BLOCK_${t}%%`,`<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${t}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${e.language}">${n}</code></pre>
      </div>`)}),r.forEach((e,t)=>{i=i.replace(`%%TABLE_BLOCK_${t}%%`,Mt(e))}),i}function jt(e){if(!e)return``;let t=e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`);return t=t.replace(/`([^`]+)`/g,`<code>$1</code>`),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/\*([^*]+)\*/g,`<em>$1</em>`),t=t.replace(/~~([^~]+)~~/g,`<del>$1</del>`),t}function Mt(e){let{header:t,body:n,full:r}=e,i=window.__tableBlocks?window.__tableBlocks.length:0;window.__tableBlocks&&(window.__tableBlocks[i]={full:r,header:t,body:n});let a=t.split(`|`).filter(e=>e.trim()).map(e=>jt(e.trim())),o=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>jt(e.trim()))),s=`<div class="table-container-wrapper"><table>`;return s+=`<thead><tr>`,a.forEach((e,t)=>{t===a.length-1?s+=`<th class="table-header-cell-wrapper">
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
      </th>`:s+=`<th>${e}</th>`}),s+=`</tr></thead>`,s+=`<tbody>`,o.forEach(e=>{s+=`<tr>`,e.forEach(e=>{s+=`<td>${e}</td>`}),s+=`</tr>`}),s+=`</tbody>`,s+=`</table></div>`,s}function Nt(e){try{let{header:t,body:n}=e,r=t.split(`|`).filter(e=>e.trim()).map(e=>e.trim()),i=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>e.trim())),a=`﻿`;a+=r.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`,i.forEach(e=>{a+=e.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`});let o=new Blob([a],{type:`text/csv;charset=utf-8;`}),s=document.createElement(`a`),c=URL.createObjectURL(o);s.setAttribute(`href`,c),s.setAttribute(`download`,`table-${Date.now()}.csv`),s.style.visibility=`hidden`,document.body.appendChild(s),s.click(),document.body.removeChild(s),console.log(`[SidePanel] Excel 下载成功`)}catch(e){console.error(`[SidePanel] 下载 Excel 失败:`,e),F(`下载失败: `+e.message,`error`)}}async function Pt(){if(typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}console.log(`[SidePanel] ===== renderMermaidCharts 开始 =====`);let e=document.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,e.length),e.length!==0){for(let t=0;t<e.length;t++){let n=e[t];try{await mermaid.run({nodes:[n]}),console.log(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染成功`),It(n)}catch(e){console.error(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染失败:`,e),!n.querySelector(`svg`)&&!n.querySelector(`.mermaid-controls`)&&(n.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${e.message}</div>`)}}console.log(`[SidePanel] ===== renderMermaidCharts 完成 =====`)}}function Ft(e){return e?`<div class="markdown-body">${At(e)}</div>`:``}function It(e){if(e.querySelector(`.mermaid-controls`)){console.log(`[SidePanel] 工具栏已存在，跳过`);return}let t=e.querySelector(`svg`);if(!t){console.warn(`[SidePanel] SVG 元素未找到，当前内容:`,e.innerHTML.substring(0,100));return}console.log(`[SidePanel] 找到 SVG 元素，开始添加工具栏`),console.log(`[SidePanel] container 类名:`,e.className),console.log(`[SidePanel] container HTML:`,e.innerHTML.substring(0,200)),e.style.position=`relative`,e.style.cursor=`grab`,e.style.userSelect=`none`,e.style.webkitUserSelect=`none`;let n=e.querySelector(`.mermaid-svg-wrapper`);if(!n){n=document.createElement(`div`),n.className=`mermaid-svg-wrapper`,n.style.transformOrigin=`center center`,n.style.transition=`transform 0.2s ease`,n.style.display=`inline-block`,n.style.width=`100%`,t.style.maxWidth=`100%`,t.style.height=`auto`,t.style.userSelect=`none`,t.style.webkitUserSelect=`none`,n.appendChild(t),e.insertBefore(n,e.firstChild);let r=[];Array.from(e.childNodes).forEach(e=>{e.nodeType===Node.TEXT_NODE&&e.textContent.trim()&&r.push(e)}),r.forEach(e=>e.remove())}let r=document.createElement(`div`);r.className=`mermaid-controls`,r.innerHTML=`
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
  `,e.appendChild(r),console.log(`[SidePanel] 工具栏 HTML 已添加`),console.log(`[SidePanel] container 子元素:`,Array.from(e.children).map(e=>e.className).join(`, `));let i=1,a=.3,o=.15,s=e.dataset.rawCode||``;if(!s){let e=t.querySelector(`title`);e&&e.textContent&&(s=e.textContent.trim())}if(!s){let e=t.querySelector(`script[type="text/plain"]`);e&&(s=e.textContent.trim())}s&&!e.dataset.rawMermaidCode&&(e.dataset.rawMermaidCode=s),r.querySelector(`.view-source`).addEventListener(`click`,r=>{r.stopPropagation();let s=e.getAttribute(`data-raw-code`);zt(e,s?decodeURIComponent(s):e.dataset.rawMermaidCode||``,n,t,i,{MIN_SCALE:a,MAX_SCALE:10,SCALE_STEP:o})}),r.querySelector(`.copy-to-clipboard`).addEventListener(`click`,e=>{e.stopPropagation(),Lt(t,n,i)}),r.querySelector(`.download-png`).addEventListener(`click`,e=>{e.stopPropagation(),Rt(t,i)}),e.addEventListener(`wheel`,e=>{!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.stopPropagation(),i=e.deltaY<0?Math.min(10,i+o):Math.max(a,i-o),p())},{passive:!1});let c=!1,l,u,d=0,f=0;function p(){n.style.transform=`translate(${d}px, ${f}px) scale(${i})`}r.querySelector(`.zoom-in`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.min(10,i+o),p()}),r.querySelector(`.zoom-out`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.max(a,i-o),p()}),r.querySelector(`.reset-zoom`).addEventListener(`click`,e=>{e.stopPropagation(),i=1,d=0,f=0,p()}),e.addEventListener(`mousedown`,t=>{t.target.tagName!==`BUTTON`&&(c=!0,l=t.clientX-d,u=t.clientY-f,e.style.cursor=`grabbing`)}),document.addEventListener(`mousemove`,e=>{c&&(d=e.clientX-l,f=e.clientY-u,p())}),document.addEventListener(`mouseup`,()=>{c&&(c=!1,e.style.cursor=`grab`)})}async function Lt(e,t,n){try{console.log(`[SidePanel] 开始复制到剪贴板`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){if(e)if(navigator.clipboard&&typeof ClipboardItem<`u`)navigator.clipboard.write([new ClipboardItem({"image/png":e})]).then(()=>{console.log(`[SidePanel] 图片复制到剪贴板成功`),F(`Mermaid 图表已复制到剪贴板！`,`success`)}).catch(e=>{console.error(`[SidePanel] 复制到剪贴板失败:`,e),F(`复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。`,`error`)});else{console.warn(`[SidePanel] Clipboard API 不可用，降级为下载`),F(`当前浏览器不支持图片复制功能，已自动转为下载。`,`warning`);let t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(t),t.click(),document.body.removeChild(t)}},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] 图片转换失败:`,e),F(`图片转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 复制到剪贴板失败:`,e),F(`复制失败: `+e.message,`error`)}}function Rt(e,t){try{console.log(`[SidePanel] 开始下载 PNG`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){console.log(`[SidePanel] SVG 图片加载成功`);let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){let t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t),console.log(`[SidePanel] PNG 下载成功`)},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] PNG 转换失败:`,e),F(`PNG 转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 下载 PNG 失败:`,e),F(`下载失败: `+e.message,`error`)}}function zt(e,t,n,r,i,a){let o=e.querySelector(`.mermaid-source-view`),s=e.querySelector(`.mermaid-controls`);if(o)o.parentElement&&o.parentElement.remove(),n&&(n.style.display=`inline-block`),It(e);else{n&&(n.style.display=`none`),s&&s.remove();let o=document.createElement(`div`);o.className=`mermaid-container-wrapper`,o.style.position=`relative`;let c=document.createElement(`pre`);c.className=`mermaid-source-view`,c.style.position=`relative`,c.textContent=t;let l=document.createElement(`button`);l.className=`source-copy-btn`,l.title=`复制源代码`,l.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `,l.addEventListener(`click`,e=>{e.stopPropagation(),Me(t,l)});let u=document.createElement(`button`);u.className=`source-copy-btn`,u.style.right=`44px`,u.title=`返回图表`,u.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `,u.addEventListener(`click`,o=>{o.stopPropagation(),zt(e,t,n,r,i,a)}),c.appendChild(l),c.appendChild(u),o.appendChild(c),e.appendChild(o)}}async function Bt(e){if(console.log(`[SidePanel] ===== renderMessageMermaid 开始 =====`),typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}await new Promise(e=>setTimeout(e,300));let t=e.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,t.length),t.length===0){console.log(`[SidePanel] 未找到 mermaid 元素`);return}try{for(let n=0;n<t.length;n++){let r=t[n];try{await mermaid.run({nodes:[r]}),console.log(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染成功`);let t=e.querySelectorAll(`.mermaid`)[n];t&&It(t)}catch(t){console.error(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染失败:`,t);let r=e.querySelectorAll(`.mermaid`)[n];r&&!r.querySelector(`svg`)&&!r.querySelector(`.mermaid-controls`)&&(r.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${t.message}</div>`)}}console.log(`[SidePanel] Mermaid 渲染完成`);let n=e.querySelectorAll(`.mermaid-controls`);console.log(`[SidePanel] 工具栏添加结果:`,n.length,`个成功`)}catch(e){console.error(`[SidePanel] Mermaid 渲染整体失败:`,e)}Vt()}function Vt(){let e=document.querySelectorAll(`.code-copy-btn`);console.log(`[SidePanel] 找到代码复制按钮数量:`,e.length),e.forEach((e,t)=>{if(e.dataset.bound){console.log(`[SidePanel] 按钮`,t,`已绑定，跳过`);return}e.dataset.bound=`true`,e.addEventListener(`click`,t=>{console.log(`[SidePanel] 代码复制按钮被点击`),t.stopPropagation();let n=e.closest(`.code-block-container`);if(console.log(`[SidePanel] 找到容器:`,!!n),n){let t=n.querySelector(`pre code`);if(console.log(`[SidePanel] 找到代码元素:`,!!t),t){let n=t.textContent;console.log(`[SidePanel] 代码长度:`,n.length),Me(n,e)}}}),console.log(`[SidePanel] 已绑定按钮`,t)}),Ht()}function Ht(){document.querySelectorAll(`.copy-md-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&Me(r.full,e)}))}),document.querySelectorAll(`.download-excel-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&Nt(r)}))})}var Ut=!1;async function Wt(){Ut||=(await l(),!0)}async function Gt(){await Wt();let[e,t]=await Promise.all([a(),m()]);return{activeSessionId:t,list:e}}async function Kt(){if(!N.activeSessionId)return!1;let e=await u(N.activeSessionId);if(!e)return!1;e.model=N.currentModel,e.useTools=N.useTools,e.enabledTools=[...N.enabledTools],e.temperature=N.temperature,e.topP=N.topP;let t=N.chatConfig.maxHistoryMessages||50;e.messageHistory=N.messageHistory.slice(-t).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1})),e.updatedAt=new Date().toISOString();let r=N.messageHistory.find(e=>e.role===`user`);return r&&(e.title=r.content.substring(0,50).replace(/\n/g,` `)),await n(e),!0}async function qt(){await Wt();let e=Yt(),t={id:e,title:`新会话`,model:N.currentModel,useTools:N.useTools,enabledTools:[...N.enabledTools],temperature:N.temperature,topP:N.topP,messageHistory:[],scrollPosition:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),isGenerating:!1,lastExecutionLog:[]};return await n(t),await g(e),t}async function Jt(e,t){let r=await u(e);return r?(r.messageHistory=r.messageHistory||[],r.messageHistory.push({role:t.role,content:t.content||``,executionLog:t.executionLog||[],reflectionScore:t.reflectionScore,wasRevised:t.wasRevised||!1}),r.updatedAt=new Date().toISOString(),r.isGenerating=!1,await n(r),!0):!1}function Yt(){return`sess_`+Date.now().toString(36)+`_`+Math.random().toString(36).substring(2,8)}async function Xt(e){if(e===N.activeSessionId)return;await Kt();let t=await u(e);return t?(await g(e),N.activeSessionId=e,N.messageHistory=t.messageHistory||[],N.currentModel=t.model||N.currentModel,N.useTools=t.useTools===void 0?N.useTools:t.useTools,N.enabledTools=t.enabledTools||N.enabledTools,N.temperature=t.temperature===void 0?N.temperature:t.temperature,N.topP=t.topP===void 0?N.topP:t.topP,t.isGenerating?N.generatingSessionIds.add(e):N.generatingSessionIds.delete(e),t):(console.error(`[SessionStore] 找不到会话:`,e),!1)}async function Zt(e){let t=await a(),n=await m();if(await f(e),n===e){let n=t.filter(t=>t.id!==e);n.length>0?await g(n[0].id):await g(null)}return!0}async function Qt(e,t){let r=await u(e);return r?(r.title=t,r.updatedAt=new Date().toISOString(),await n(r),!0):!1}async function $t(){if(!N.messageHistory||N.messageHistory.length===0)return;let e=await u(N.activeSessionId);if(!e)return;let t=N.messageHistory.find(e=>e.role===`user`),n=t?t.content.substring(0,50).replace(/\n/g,` `):e.title||`未命名会话`,r=Date.now().toString(36)+Math.random().toString(36).substring(2,8),a=N.messageHistory.map(e=>({role:e.role,content:e.content||``})),o=await i();o.push({id:r,title:n,createdAt:new Date().toISOString(),messages:a}),o.length>20&&o.splice(0,o.length-20),await h(o);let s=await qt();return await Zt(e.id),await Xt(s.id),!0}async function H(){return Gt()}async function en(){return Kt()}async function tn(){return qt()}async function nn(e){return Xt(e)}async function rn(e){return Zt(e)}async function an(e,t){return Qt(e,t)}async function on(){return $t()}async function sn(e,t){return Jt(e,t)}async function U(){let e=await H();N.sessions=e.list,N.activeSessionId=e.activeSessionId;let t=document.getElementById(`sessionTabs`),n=document.getElementById(`sessionTabsScroll`),r=document.getElementById(`sessionTabsAddWrapper`);if(!t||!n||!r)return;n.innerHTML=``,r.innerHTML=``,e.list.forEach(e=>{let t=document.createElement(`div`);t.className=`session-tab`,t.dataset.sessionId=e.id,e.id===N.activeSessionId&&t.classList.add(`active`),t.title=e.title;let r=document.createElement(`span`);r.className=`session-tab-title`,r.textContent=e.title||`新会话`,t.appendChild(r);let i=document.createElement(`span`);if(i.className=`session-tab-close`,i.innerHTML=`&#10005;`,i.title=`关闭会话`,i.addEventListener(`click`,async t=>{t.stopPropagation(),pn(e,async()=>{let e=await H();N.activeSessionId=e.activeSessionId,N.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t?N.messageHistory=t.messageHistory||[]:N.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`)),U()})}),t.appendChild(i),e.isGenerating||N.generatingSessionIds.has(e.id)){let e=document.createElement(`span`);e.className=`session-tab-indicator`,t.appendChild(e)}t.addEventListener(`click`,async t=>{t.preventDefault(),e.id!==N.activeSessionId&&await cn(e.id)}),t.addEventListener(`contextmenu`,t=>{t.preventDefault(),mn(t,e)}),n.appendChild(t)});let i=document.createElement(`div`);i.className=`session-tab-add`,i.title=`新建会话`,i.textContent=`+`,i.addEventListener(`click`,async()=>{await en();let e=await tn();N.activeSessionId=e.id,N.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:e.id}})),U()}),r.appendChild(i),dn(n)}async function cn(e){if(await en(),!await nn(e))return;let t=await H();N.sessions=t.list,N.activeSessionId=e;let n=t.list.find(t=>t.id===e);n&&(N.messageHistory=n.messageHistory||[],N.currentModel=n.model||N.currentModel,N.useTools=n.useTools===void 0?N.useTools:n.useTools,N.enabledTools=n.enabledTools||N.enabledTools,N.temperature=n.temperature===void 0?N.temperature:n.temperature,N.topP=n.topP===void 0?N.topP:n.topP),document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:e}})),U(),ln(),setTimeout(()=>{let e=document.querySelector(`.session-tab.active`);e&&e.scrollIntoView({behavior:`smooth`,block:`nearest`,inline:`center`})},50)}function ln(){let e=document.querySelector(`.model-display`);e&&N.currentModel&&(e.textContent=N.currentModel);let t=document.getElementById(`enableToolsBtn`);t&&(t.checked=N.useTools);let n=document.getElementById(`tempIconValue`);n&&N.temperature!==void 0&&(n.textContent=N.temperature.toFixed(2))}var un=new WeakSet;function dn(e){un.has(e)||(un.add(e),e.addEventListener(`wheel`,t=>{e.scrollWidth<=e.clientWidth||(t.preventDefault(),e.scrollLeft+=t.deltaY)},{passive:!1}))}function fn(e){let t=document.getElementById(`sessionRenameModal`),n=document.getElementById(`sessionRenameInput`),r=document.getElementById(`sessionRenameConfirmBtn`),i=document.getElementById(`sessionRenameCancelBtn`),a=document.getElementById(`sessionRenameCloseBtn`);if(!t||!n)return;n.value=e.title,n.focus(),n.select();let o=()=>{t.classList.remove(`show`),r.removeEventListener(`click`,s),i.removeEventListener(`click`,c),a.removeEventListener(`click`,c)},s=()=>{let t=n.value.trim();t&&t!==e.title&&an(e.id,t).then(()=>{U()}),o()},c=()=>{o()};r.addEventListener(`click`,s),i.addEventListener(`click`,c),a.addEventListener(`click`,c),n.onkeydown=e=>{e.key===`Enter`?s():e.key===`Escape`&&c()},t.classList.add(`show`)}function pn(e,t){let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r)return;r.textContent=`确定要删除会话"${e.title}"吗？此操作不可撤销。`;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=async()=>{await rn(e.id),t&&await t(),s()},l=()=>{s()};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)}function mn(e,t){let n=document.querySelector(`.session-context-menu`);n&&n.remove();let r=document.createElement(`div`);r.className=`session-context-menu`,r.style.left=e.clientX+`px`,r.style.top=e.clientY+`px`;let i=hn(`重命名`,()=>{r.remove(),fn(t)});r.appendChild(i);let a=hn(`删除`,()=>{r.remove(),pn(t,async()=>{let e=await H();N.activeSessionId=e.activeSessionId,N.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t?N.messageHistory=t.messageHistory||[]:N.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`)),U()})},`danger`);r.appendChild(a),document.body.appendChild(r);let o=e=>{r.contains(e.target)||(r.remove(),document.removeEventListener(`click`,o))};setTimeout(()=>document.addEventListener(`click`,o),0)}function hn(e,t,n=``){let r=document.createElement(`div`);return r.className=`session-context-menu-item `+n,r.textContent=e,r.addEventListener(`click`,t),r}var W=`pendingCallApiSessions`;function gn(){chrome.storage.session.set({[W]:[...N.pendingCallApiSessionIds]}).catch(()=>{})}async function _n(){try{let e=await chrome.storage.session.get([W]);e[W]&&Array.isArray(e[W])&&(N.pendingCallApiSessionIds=new Set(e[W]))}catch{}}function vn(e){N.quotedContextText=e;let t=document.getElementById(`selectionIndicator`),n=document.getElementById(`selectionText`),r=document.getElementById(`userInput`);if(t&&n&&r){let r;r=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,n.textContent=`💬 已引用: ${r}`,t.classList.add(`show`)}}function yn(){console.log(`[SidePanel] 清除选中内容上下文`),N.selectedContextText=``,N.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=e.findIndex(e=>e.startsWith(`[用户问题]`));n===-1?t.value=``:t.value=e.slice(n+1).join(`
`).trim()}}async function bn(){let e=await H();if(e.activeSessionId&&e.list.length>0){N.activeSessionId=e.activeSessionId,N.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t&&(N.messageHistory=t.messageHistory||[],N.currentModel=t.model||N.currentModel,N.useTools=t.useTools===void 0?N.useTools:t.useTools,N.enabledTools=t.enabledTools||N.enabledTools,N.temperature=t.temperature===void 0?N.temperature:t.temperature,N.topP=t.topP===void 0?N.topP:t.topP),N.messageHistory.forEach(e=>{let t=e.wasRevised;if(!t&&e.executionLog)try{t=(typeof e.executionLog==`string`?JSON.parse(e.executionLog):e.executionLog).some(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.action?.decision===`revised`)}catch{}q(e.role,e.content,!1,e.executionLog||[],e.reflectionScore,t)});let n=document.querySelector(`.welcome-message`);n&&N.messageHistory.length>0&&n.remove(),Pt();let r=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.get([r],e=>{e[r]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t.scrollTop=e[r]},100)}),U()}else{await tn();let e=await H();e.activeSessionId&&(N.activeSessionId=e.activeSessionId,N.sessions=e.list),U()}}function G(){try{en().catch(e=>{console.error(`[SidePanel] 保存当前会话失败:`,e)})}catch(e){console.error(`[SidePanel] 保存对话历史异常:`,e)}}function xn(){N.messageHistory&&N.messageHistory.length>0&&on().then(()=>{N.messageHistory=[];let e=document.getElementById(`chatContainer`);if(e){e.innerHTML=``;let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
          <div class="icon-wrapper">
            <div class="icon">💬</div>
          </div>
          <h2>开始对话</h2>
          <p>输入您的问题，AI 助手将为您解答</p>
        `,e.appendChild(t)}chrome.storage.local.remove(`scrollPosition_`+(N.activeSessionId||`default`)),U()})}function Sn(){if(!N.messageHistory||N.messageHistory.length===0){F(`当前没有对话历史可导出`,`warning`);return}let e=N.messageHistory.map((e,t)=>{let n=document.querySelectorAll(`.message`)[t],r=null;return r=n&&n.dataset.timestamp?n.dataset.timestamp:new Date().toISOString(),{role:e.role===`user`?`user`:`assistant`,content:e.content||``,timestamp:r,displayName:e.role===`user`?`我`:`AI助手`}}),t=new Date,n=`ai-helper-${t.getFullYear()+String(t.getMonth()+1).padStart(2,`0`)+String(t.getDate()).padStart(2,`0`)+`-`+String(t.getHours()).padStart(2,`0`)+String(t.getMinutes()).padStart(2,`0`)+String(t.getSeconds()).padStart(2,`0`)}.json`,r=JSON.stringify(e,null,2),i=new Blob([r],{type:`application/json;charset=utf-8;`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=n,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a),console.log(`[SidePanel] 对话历史已导出:`,n,`共`,e.length,`条消息`),F(`对话历史已导出 (${e.length} 条消息)`,`success`)}function Cn(){document.getElementById(`confirmModal`).classList.add(`show`)}function wn(){document.getElementById(`confirmModal`).classList.remove(`show`)}async function Tn(){let e=document.getElementById(`userInput`),t=document.getElementById(`sendBtn`),n=document.getElementById(`chatContainer`),r=e.value.trim();if(!r||N.isGenerating)return;let i=n.querySelector(`.welcome-message`);i&&i.remove();let a=r,o=N.enableSelectionQuery&&N.selectedContextText&&N.selectedContextText.trim(),s=N.quotedContextText&&N.quotedContextText.trim();if(s){let e=N.quotedContextText.trim();a=`[引用内容]\n${e}\n\n[用户问题]\n${r}`,K(`quoted`,e,!1),N.quotedContextText=``}else if(o){let e=N.selectedContextText.trim();a=`[选中内容]\n${e}\n\n[用户问题]\n${r}`,K(`selected`,e,!1),N.selectedContextText=``}q(`user`,r),N.messageHistory.push({role:`user`,content:a}),G(),ze(r),N.inputHistoryIndex=-1,e.value=``,e.style.height=`auto`,(o||s)&&yn(),N.isGenerating=!0,t.disabled=!0;let l=N.activeSessionId,u=Vn(),f=N.currentModel;try{await Ie(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let e=[{role:`system`,content:Ne()}];if(N.isolateChat){let t=N.messageHistory;N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?(t=[...N.messageHistory.slice(0,-1).slice(-N.chatConfig.maxMemoryMessages),N.messageHistory[N.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,N.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,N.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:a});let t=await Pe(),n=d(e),r=d([e[0]]),i=n-r,o=p(n,c(f));console.log(`[SidePanel] 发送上下文: ${n} tokens (系统提示词: ${r}, 历史: ${i}), 压力: ${o.level}(${Math.round(o.ratio*100)}%), 消息: ${e.length} 条`),o.level===`critical`&&console.warn(`[SidePanel] 上下文压力过高，可能触发 API 错误`);let s,m,h,g=!1;try{let n=await Hn(e,f,N.useTools,t);s=n.content,m=n.executionLog||[],h=n.reflectionScore,g=n.wasRevised||!1}catch(e){if(N.activeSessionId!==l){e.message===`任务已被用户停止`?sn(l,{role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}):sn(l,{role:`assistant`,content:`❌ 请求失败：`+(e.message||`未知错误`),executionLog:e.executionLog||[]}),J(u),N.substituteLoadingIds.delete(l);return}if(e.message===`任务已被用户停止`){J(u),N.substituteLoadingIds.delete(l),q(`assistant`,`任务已取消`,!1,e.executionLog||[]),N.messageHistory.push({role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}),G();return}throw J(u),N.substituteLoadingIds.delete(l),s=`❌ 请求失败：`+(e.message||`未知错误`),m=e.executionLog||[],q(`assistant`,s,!0,m,h),N.messageHistory.push({role:`assistant`,content:s,executionLog:m,reflectionScore:h}),e}if(N.activeSessionId!==l){sn(l,{role:`assistant`,content:s,executionLog:m,reflectionScore:h,wasRevised:g}),J(u),N.substituteLoadingIds.delete(l);return}J(u),N.substituteLoadingIds.has(l)&&(J(N.substituteLoadingIds.get(l)),N.substituteLoadingIds.delete(l)),await Bt(q(`assistant`,s,!0,m,h,g)),N.messageHistory.push({role:`assistant`,content:s,executionLog:m,reflectionScore:h,wasRevised:g})}catch(e){console.error(`[SidePanel] sendMessage 异常:`,e?.message||e)}finally{G(),N.generatingSessionIds.delete(l),t.disabled=!1,e.focus()}}function En(e,t){let n=document.getElementById(`userInput`);if(!t||N.isGenerating){console.log(`[SidePanel] triggerSelectionSearch 跳过:`,{hasText:!!t,isGenerating:N.isGenerating});return}let r=N.enableSelectionQuery;N.enableSelectionQuery=!0,N.selectedContextText=t,N.quotedContextText=``,n.value=`搜索一下`,n.dispatchEvent(new Event(`input`)),Tn(),N.enableSelectionQuery=!1,setTimeout(()=>{N.enableSelectionQuery=r},1500)}function Dn(e){let t=document.getElementById(`userInput`);!t||!e||(t.value=e,t.dispatchEvent(new Event(`input`)),t.focus())}function On(e,t=``){let n=document.getElementById(`userInput`);!n||!e||N.isGenerating||(t&&(N.enableSelectionQuery=!0,N.selectedContextText=t,N.quotedContextText=``),n.value=e,n.dispatchEvent(new Event(`input`)),n.focus(),Tn(),t&&(N.enableSelectionQuery=!1,setTimeout(()=>{N.enableSelectionQuery=!0},1500)))}function K(e,t,n=!0){let r=document.getElementById(`chatContainer`),i=document.createElement(`div`);i.className=`user-context-bubble`,i.dataset.role=`context`,i.innerHTML=`
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${e===`quoted`?`💬`:`📌`}</span>
        <span class="context-type">${e===`quoted`?`引用内容`:`选中内容`}</span>
      </div>
      <div class="context-bubble-content">${I(t)}</div>
    </div>
  `;let a=i.querySelector(`.context-bubble-header`),o=i.querySelector(`.context-bubble-content`);return a.addEventListener(`click`,e=>{e.stopPropagation(),o.classList.toggle(`expanded`)}),r.appendChild(i),n&&(r.scrollTop=r.scrollHeight),i}function q(e,t,n=!0,r=[],i=null,a=!1){let o=document.getElementById(`chatContainer`),s=document.createElement(`div`);s.className=`message ${e}`;let c=new Date().toISOString();if(s.dataset.timestamp=c,s.dataset.rawContent=t,s.dataset.executionLog=JSON.stringify(r),a&&(s.dataset.wasRevised=`true`),e===`assistant`){s.innerHTML=Ft(t);let e=document.createElement(`div`);e.className=`message-footer`;let n=document.createElement(`button`);n.className=`copy-btn`,n.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),n.addEventListener(`click`,e=>{e.stopPropagation(),Kn(s,n)}),e.appendChild(n);let o=document.createElement(`button`);o.className=`quote-btn`,o.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),Yn(s)}),e.appendChild(o);let c=document.createElement(`div`);c.className=`export-menu-container`;let l=document.createElement(`button`);l.className=`export-trigger-btn`,l.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let u=document.createElement(`div`);u.className=`export-dropdown`,u.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),u.querySelector(`.export-docx-item`).addEventListener(`click`,e=>{e.stopPropagation(),qn(s,l),u.classList.remove(`show`)}),u.querySelector(`.export-pdf-item`).addEventListener(`click`,e=>{e.stopPropagation(),Jn(s,l),u.classList.remove(`show`)}),l.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.toggle(`show`)});let d=null;c.addEventListener(`mouseenter`,()=>{d=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.add(`show`)},300)}),c.addEventListener(`mouseleave`,()=>{d&&=(clearTimeout(d),null),setTimeout(()=>{!c.matches(`:hover`)&&!u.matches(`:hover`)&&u.classList.remove(`show`)},100)}),c.appendChild(l),c.appendChild(u),e.appendChild(c);let f=r&&r.length>0,p=i!=null,m=r?r.filter(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.status===`success`).length:0;if(An(),f){let t=document.createElement(`button`);if(t.className=`execution-log-btn`,t.type=`button`,t.title=`执行日志`,t.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),p){t.classList.add(`has-reflection`);let e=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,n=i>=8?`✅`:i>=5?`🔍`:`⚠️`,r=a?` <span class="reflection-revised-tag">已修订</span>`:``;t.title=`执行日志 | AI 自我评估: ${i}/10${m>1?` (${m}轮)`:``}${a?`（已修订）`:``}`,t.insertAdjacentHTML(`beforeend`,`<span class="reflection-badge ${e}">${n} ${i}/10${r}</span>`)}e.appendChild(t)}else if(p){let t=document.createElement(`button`);t.className=`execution-log-btn has-reflection`,t.type=`button`;let n=i>=8?`score-high`:i>=5?`score-mid`:`score-low`;t.classList.add(n);let r=i>=8?`✅`:i>=5?`🔍`:`⚠️`;t.title=`AI 自我评估: ${i}/10`,t.innerHTML=`<span class="reflection-badge ${n}">${r} ${i}/10</span>`,e.appendChild(t)}else if(r&&r.some(e=>e.nodeType===`reflection`&&e.status===`failed`)){let t=document.createElement(`button`);t.className=`execution-log-btn has-reflection score-low`,t.type=`button`,t.title=`反思评估失败（点击查看执行日志）`,t.innerHTML=`<span class="reflection-badge score-low">⚠️ 反思失败</span>`,e.appendChild(t)}let h=r?.find(e=>e.nodeType===`tool_exec`&&e.action?.name===`preview_ui_prototype`&&e.status===`success`);if(h){let t=document.createElement(`button`);t.className=`prototype-btn-small`,t.type=`button`,t.title=`查看 UI 原型`,t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,t.addEventListener(`click`,()=>{let e=h.prototypeId;if(!e&&h.observation)try{e=(typeof h.observation==`string`?JSON.parse(h.observation):h.observation)?.prototypeId}catch{}e?ht(e):console.error(`[SidePanel] 未找到 prototypeId，entry keys:`,Object.keys(h),`observation:`,h.observation)}),e.appendChild(t)}s.appendChild(e)}else{let e=t.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),n=t.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),r=e||n;if(r){let t=e?`quoted`:`selected`,n=r[1].trim(),i=r[2].trim();s._pendingContext={type:t,contextText:n,userQuestion:i},s.textContent=i}else s.textContent=t;let i=document.createElement(`div`);i.className=`message-toolbar`;let a=document.createElement(`button`);a.className=`message-toolbar-btn copy-btn`,a.title=`复制内容`,a.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`].join(``),a.addEventListener(`click`,e=>{e.stopPropagation(),Wn(s,a)});let o=document.createElement(`button`);o.className=`message-toolbar-btn edit-btn`,o.title=`编辑后重新发送`,o.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>`,`</svg>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),Gn(s)}),i.appendChild(a),i.appendChild(o),s.appendChild(i)}if(o.appendChild(s),s._pendingContext){let{type:e,contextText:t}=s._pendingContext,n=K(e,t,!1);o.insertBefore(n,s),delete s._pendingContext}if(n){let e=o.querySelectorAll(`.message.user`);if(e.length>0){let t=e[e.length-1],n=t.previousElementSibling;n&&n.classList.contains(`user-context-bubble`)?n.scrollIntoView({behavior:`smooth`,block:`start`}):t.scrollIntoView({behavior:`smooth`,block:`start`})}}return e===`assistant`&&Vt(),s}var kn=!1;function An(){if(kn)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.execution-log-btn`);if(!t)return;let n=t.closest(`.message`);if(!n)return;e.preventDefault(),e.stopPropagation();let r=n.dataset.executionLog;if(r)try{let e=JSON.parse(r);console.log(`[chat-manager] 执行日志按钮点击(委托), entries:`,e.length),Un(e)}catch(e){console.error(`[chat-manager] 解析 executionLog 失败:`,e)}}),kn=!0)}function jn(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)),n=t.length,r=``,i=null;return t.forEach((e,t)=>{let a=e.nodeType===`subtask`,o=e.nodeType===`tool_exec`,s=e.nodeType===`api_call`,c=e.nodeType===`preselect`,l=e.nodeType===`reflection`,u=o&&e.action?.name===`plan_task`;a&&(i=e.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&i!==null?(d=`tool-level`,f=`🔧`):s&&i!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=e.status||`processing`;e.status===`success`?p=`✓`:e.status===`failed`&&(p=`✗`),l&&(m=`reflection ${m}`);let h=I(e.nodeName||`未知节点`);if(e.subtaskIndex!==null&&e.subtaskIndex>=0&&(h=`<span class="subtask-badge">${e.subtaskIndex+1}</span> ${h}`),e.subtaskCount&&(h+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!c&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(h+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}r+=`
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
            <span class="duration-badge" title="耗时">${L(e.duration||0)}</span>
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
    `}),r}function Mn(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp));if(!t.some(e=>e.taskGroup))return In(t);let n=new Map,r=[];t.forEach(e=>{e.taskGroup?(n.has(e.taskGroup)||n.set(e.taskGroup,{groupId:e.taskGroup,groupIndex:e.taskGroupIndex,groupName:e.taskGroupName,entries:[],status:e.status}),n.get(e.taskGroup).entries.push(e),e.status&&(n.get(e.taskGroup).status=e.status)):r.push(e)});let i=Nn(r,t.length);return n.forEach((e,n)=>{let r=e.status||`processing`;i+=`
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
          ${Pn(e.entries,t.length)}
        </div>
      </div>
    `}),i}function Nn(e,t){if(e.length===0)return``;let n=``;return n+=`
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
  `,e.forEach((e,r)=>{n+=Fn(e,r,t)}),n+=`
      </div>
    </div>
  `,n}function Pn(e,t){let n=``;return e.forEach((e,r)=>{n+=Fn(e,r,t)}),n}function Fn(e,t,n){let r=e.nodeType===`subtask`,i=e.nodeType===`tool_exec`,a=e.nodeType===`api_call`,o=e.nodeType===`preselect`,s=e.nodeType===`reflection`,c=i&&e.action?.name===`plan_task`,l=``,u=``;s?(l=`reflection-level`,u=`🎯`):o?u=`📡`:c?(l=`plan-task-level`,u=`📋`):r?(l=`subtask-level`,u=`🔀`):i?(l=`tool-level`,u=`🔧`):a?(l=`api-level`,u=`📡`):i?u=`⚡`:a&&(u=`📡`);let d=`○`,f=e.status||`processing`;e.status===`success`?d=`✓`:e.status===`failed`&&(d=`✗`),s&&(f=`reflection ${f}`);let p=I(e.nodeName||`未知节点`);if(e.subtaskCount&&(p+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(a||o)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!o&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(p+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}return`
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
          <span class="duration-badge" title="耗时">${L(e.duration)}</span>
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
  `}function In(e){let t=``,n=null;return e.forEach((r,i)=>{let a=r.nodeType===`subtask`,o=r.nodeType===`tool_exec`,s=r.nodeType===`api_call`,c=r.nodeType===`preselect`,l=r.nodeType===`reflection`,u=o&&r.action?.name===`plan_task`;a&&(n=r.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&n!==null?(d=`tool-level`,f=`🔧`):s&&n!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=r.status||`processing`;r.status===`success`?p=`✓`:r.status===`failed`&&(p=`✗`);let h=I(r.nodeName||`未知节点`);if(r.subtaskId&&(h=`<span class="subtask-badge">${n===null?``:n+1}</span> ${h}`),r.subtaskCount&&(h+=` <span class="plan-badge">(${r.subtaskCount}个子任务, ${r.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&r.apiRequest){let e=[];r.apiRequest.messageCount!==void 0&&r.apiRequest.messageCount!==null&&e.push(`💬<span title="本次模型API调用携带的消息数">${r.apiRequest.messageCount}条</span>`),!c&&r.apiRequest.toolCount!==void 0&&r.apiRequest.toolCount!==null&&e.push(`🔧<span title="本次模型API调用携带的工具定义数">${r.apiRequest.toolCount}个</span>`),e.length>0&&(h+=` <span class="api-info-badge">（${e.join(` `)}）</span>`)}t+=`
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
            <span class="duration-badge" title="耗时">${L(r.duration)}</span>
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
    `}),t}function Ln(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(!t)return;let n=t.querySelector(`.realtime-executing-node`);n&&(n.textContent=e.nodeName||`处理中...`);let r=e.executionLog||[],i=r.length,a=r.filter(e=>e.status===`success`).length,o=r.filter(e=>e.status===`failed`).length,s=r.filter(e=>e.nodeType===`subtask`).length,c=r.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,l=t.querySelector(`.combo-value`),u=t.querySelector(`.combo-stat.success .stat-value`),d=t.querySelector(`.combo-stat.failed .stat-value`),f=t.querySelector(`.combo-stat.subtask`);l&&(l.textContent=i),u&&(u.textContent=a),d&&(d.textContent=o),f&&(s>0?(f.style.display=``,f.querySelector(`.stat-value`).textContent=`${c}/${s}`):f.style.display=`none`);let p=t.querySelector(`.timeline`);p.innerHTML=r.length>0?jn(r):`<div class="realtime-waiting-message">等待执行中...</div>`,p.scrollTop=p.scrollHeight}function Rn(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel realtime-mode`,n.innerHTML=`
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
  `,document.body.appendChild(n),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()}),n.addEventListener(`click`,e=>{e.target===n&&n.remove()});let r=n.querySelector(`.toggle-expand-btn`),i=!1;r.addEventListener(`click`,()=>{i=!i,n.querySelectorAll(`.timeline-content`).forEach(e=>{i?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=r.querySelector(`svg`);i?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,r.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,r.setAttribute(`title`,`展开全部节点`))}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.timeline-header`);t&&t.parentElement.classList.toggle(`expanded`)}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.combo-stat[data-status]`);if(!t)return;let r=t.dataset.status,i=t.classList.contains(`active`);n.querySelectorAll(`.combo-stat[data-status]`).forEach(e=>{e.classList.remove(`active`)});let a=n.querySelectorAll(`.timeline-item`);i?a.forEach(e=>{e.style.display=``}):(t.classList.add(`active`),a.forEach(e=>{if(r===`subtask`)e.dataset.nodeType===`subtask`?e.style.display=``:e.style.display=`none`;else{let t=e.querySelector(`.timeline-dot`);t&&t.classList.contains(r)?e.style.display=``:e.style.display=`none`}}))}),N.currentExecutionStatus&&Ln(N.currentExecutionStatus)}function zn(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(t){t.remove();return}Rn(e)}function Bn(e,t,n,r){let i=document.getElementById(e);if(!i)return;console.log(`[SidePanel] updateExecutionStatus 被调用:`,t,n,`日志数量:`,r?.length);let a=i.querySelector(`.current-node-name`);a&&(a.textContent=t||`处理中...`,a.title=t||``),N.currentExecutionStatus?(N.currentExecutionStatus.executionLog||(N.currentExecutionStatus.executionLog=[]),r&&r.length>0&&r.forEach(e=>{let t=N.currentExecutionStatus.executionLog.findIndex(t=>t.id===e.id);if(t!==-1){let n=N.currentExecutionStatus.executionLog[t];N.currentExecutionStatus.executionLog[t]={...e,subtaskIndex:e.subtaskIndex??n.subtaskIndex,subtaskId:e.subtaskId??n.subtaskId,subtaskName:e.subtaskName??n.subtaskName}}else N.currentExecutionStatus.executionLog.push(e)}),N.currentExecutionStatus.nodeName=t,N.currentExecutionStatus.status=n):N.currentExecutionStatus={nodeName:t,status:n,executionLog:[]},document.querySelector(`.execution-log-panel.realtime-mode`)&&Ln(N.currentExecutionStatus)}function Vn(){let e=document.getElementById(`chatContainer`),t=`loading-`+Date.now(),n=document.createElement(`div`);n.className=`loading-message`,n.id=t,n.innerHTML=`
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
  `,e.appendChild(n),e.scrollTop=e.scrollHeight;let r=n.querySelector(`.stop-task-btn`),i=n.querySelector(`.loading-text`);r&&r.addEventListener(`click`,e=>{e.stopPropagation(),r.disabled=!0,r.style.opacity=`0.6`,r.style.cursor=`not-allowed`,i&&(i.textContent=`停止中...`),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:null,sessionId:N.activeSessionId}),N.pendingCancelApi&&N.pendingCancelApi({message:`任务已被用户停止`,executionLog:N.currentExecutionStatus?.executionLog||[]})});let a=N.activeSessionId;N.executionLogListener=(e,n,r)=>e.sessionId&&e.sessionId!==a?!1:e.type===`EXECUTION_STATUS_UPDATE`?(console.log(`[SidePanel] 收到执行状态更新:`,e.nodeName,e.status,`日志数量:`,e.executionLog?.length),Bn(t,e.nodeName,e.status,e.executionLog),!1):!1,chrome.runtime.onMessage.addListener(N.executionLogListener),chrome.storage.local.get(`enableExecutionLog`,e=>{if(e.enableExecutionLog){let e=n.querySelector(`.execution-status-container`);e&&(e.style.display=`flex`)}});let o=n.querySelector(`.execution-log-toggle-btn`);return o&&o.addEventListener(`click`,e=>{e.stopPropagation(),zn(t)}),t}function J(e){let t=document.getElementById(e);if(t){let e=t.querySelector(`.loading-text`);e&&(e.textContent=`思考中...`),t.remove()}N.executionLogListener&&=(chrome.runtime.onMessage.removeListener(N.executionLogListener),null),N.currentExecutionStatus=null;let n=document.querySelector(`.execution-log-panel.realtime-mode`);n&&n.remove()}async function Hn(e,t,n=!1,r={}){let i=(await Re()).loopTimeout,a=N.activeSessionId,o=chrome.runtime.connect({name:`keepalive-`+a});console.log(`[SidePanel] keepalive 端口已连接, sessionId:`,a);let s=()=>{try{o.disconnect()}catch{}timeoutId&&clearTimeout(timeoutId),removeListener(),N.pendingCancelApiMap.delete(a),N.pendingCallApiSessionIds.delete(a),gn()};return new Promise((o,c)=>{let l=[],u=Math.round(i/1e3),d=e=>{s(),(!e.executionLog||e.executionLog.length===0||l.length>0)&&(e.executionLog=l),c(e)};N.pendingCancelApi=d,N.pendingCallApiSessionIds.add(a),gn(),console.log(`[SidePanel] callApi: 添加 pendingCallApiSessionIds, mySessionId =`,a,`, set:`,[...N.pendingCallApiSessionIds]);let f=setTimeout(()=>{d({message:`请求超时（${u}秒）`,executionLog:l}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:N.currentTabId,sessionId:N.activeSessionId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},i),p=Date.now(),m=0,h=null,g=()=>{h===null&&f!==null&&(h=Date.now(),clearTimeout(f),f=null,console.log(`[SidePanel] 前端超时已暂停（澄清工具执行中）`))},_=()=>{if(h!==null){let e=Date.now()-h;m+=e,h=null;let t=Date.now()-p,n=i+m-t;if(n<=0){d({message:`请求超时（${u}秒）`,executionLog:l});return}f=setTimeout(()=>{d({message:`请求超时（${u}秒）`,executionLog:l}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:N.currentTabId,sessionId:a}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},n),console.log(`[SidePanel] 前端超时已恢复，暂停时长:`,Math.round(e/1e3),`s，剩余时间:`,Math.round(n/1e3),`s`)}};chrome.runtime.onMessage.addListener(e=>(console.log(`[SidePanel] 收到消息:`,e),e.sessionId&&e.sessionId!==a?!1:e.type===`EXECUTION_STATUS_UPDATE`?(l=e.executionLog||[],!1):e.type===`CLARIFY_START`?(g(),!1):e.type===`CLARIFY_END`?(_(),!1):e.type===`API_COMPLETE`?(s(),o({content:e.content,executionLog:e.executionLog||l,reflectionScore:e.reflectionScore}),!1):e.type===`API_ERROR`?(s(),c({message:e.error,executionLog:e.executionLog||l}),!1):!1)),console.log(`[SidePanel] 发送 CALL_API 消息，useTools:`,n,`tabId:`,N.currentTabId,`sessionId:`,N.activeSessionId,`apiParams:`,r,`timeout:`,i),chrome.runtime.sendMessage({type:`CALL_API`,sessionId:N.activeSessionId,messages:e,model:t,useTools:n,tabId:N.currentTabId,apiParams:r})})}function Un(e){let t=document.querySelector(`.execution-log-panel`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel`;let r=e.reduce((e,t)=>e+(t.duration||0),0),i=e.filter(e=>e.status===`success`).length,a=e.filter(e=>e.status===`failed`).length,o=e.filter(e=>e.nodeType===`subtask`).length,s=e.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,c=e.filter(e=>e.nodeType===`tool_exec`&&e.action?.name===`plan_task`&&e.status===`success`).length,l=e.filter(e=>e.nodeType===`reflection`).find(e=>e.reflectionType===`post`);n.innerHTML=`
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
        <div class="summary-item" title="总耗时: ${L(r)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${L(r)}</span>
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
        ${Mn(e)}
      </div>
    </div>
  `,document.body.appendChild(n),n.addEventListener(`click`,e=>{e.target===n&&n.remove()}),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()});let u=n.querySelector(`.toggle-expand-btn`),d=n.querySelectorAll(`.timeline-content`),f=!1;u.addEventListener(`click`,()=>{f=!f,d.forEach(e=>{f?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=u.querySelector(`svg`);f?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,u.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,u.setAttribute(`title`,`展开全部节点`))}),n.querySelectorAll(`.timeline-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.parentElement.classList.toggle(`expanded`)})});let p=n.querySelectorAll(`.combo-stat`),m=n.querySelectorAll(`.timeline-item`);p.forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.status,n=e.classList.contains(`active`);p.forEach(e=>e.classList.remove(`active`)),n?m.forEach(e=>{e.style.display=``}):(e.classList.add(`active`),m.forEach(e=>{if(t===`subtask`)e.classList.contains(`subtask-level`)?e.style.display=``:e.style.display=`none`;else{let n=e.querySelector(`.timeline-dot`);n&&n.classList.contains(t)?e.style.display=``:e.style.display=`none`}}))})})}function Wn(e,t){try{let n=e.dataset.rawContent||``;navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{console.error(`[SidePanel] 复制失败:`,e);let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),F(`复制失败`,`error`)}}function Gn(e){try{let t=e.dataset.rawContent||``;if(!t){F(`无法获取消息内容`,`error`);return}let n=document.getElementById(`userInput`);n.value=t,je(),n.focus(),n.selectionStart=n.selectionEnd=n.value.length,console.log(`[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送`)}catch(e){console.error(`[SidePanel] 编辑消息失败:`,e),F(`编辑失败: `+e.message,`error`)}}function Kn(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=N.messageHistory.find(e=>e.role===`assistant`);if(t)n=t.content;else{let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}}navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{F(`复制失败，请手动选择内容复制`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),F(`复制失败`,`error`)}}function qn(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${At(n)}
      </body>
      </html>
    `,i=new Blob([`﻿`,r],{type:`application/msword`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`word-${new Date().getTime()}.doc`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a);let s=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `,setTimeout(()=>{t.innerHTML=s},2e3),console.log(`[SidePanel] Word 文档导出成功`)}catch(e){console.error(`[SidePanel] 导出 Word 失败:`,e),F(`导出失败: `+e.message,`error`)}}function Jn(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${At(n)}
        <div class="footer">${`AI Helper - ${new Date().toLocaleString(`zh-CN`)}`}</div>
      </body>
      </html>
    `,i=window.open(``,`_blank`,`width=800,height=600`);if(!i){F(`请允许弹出窗口以使用 PDF 导出功能`,`warning`);return}i.document.write(r),i.document.close(),i.onload=function(){setTimeout(()=>{i.focus(),i.print()},500)};let a=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `,setTimeout(()=>{t.innerHTML=a},2e3),console.log(`[SidePanel] PDF 导出已触发`)}catch(e){console.error(`[SidePanel] 导出 PDF 失败:`,e),F(`导出失败: `+e.message,`error`)}}function Yn(e){try{let t=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!t){console.warn(`[SidePanel] 无法获取消息内容`);return}let n=document.getElementById(`userInput`);if(!n){console.warn(`[SidePanel] 找不到输入框`);return}let r=e.querySelector(`.quote-btn`),i=r?r.innerHTML:``;vn(t),r&&(r.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `,r.classList.add(`quoted`),setTimeout(()=>{r.innerHTML=i,r.classList.remove(`quoted`)},2e3)),n.focus(),console.log(`[SidePanel] 已引用消息内容到提示条，输入框已获取焦点`)}catch(e){console.error(`[SidePanel] 引用提问失败:`,e),F(`引用失败: `+e.message,`error`)}}function Xn(){console.log(`[SidePanel] 清除选中内容上下文`),N.selectedContextText=``,N.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=0;for(let t=0;t<e.length;t++)if(e[t].startsWith(`[用户问题]`)){n=t;break}n>0&&(t.value=e.slice(n).join(`
`),t.dispatchEvent(new Event(`input`)),console.log(`[SidePanel] 已移除输入框中的选中内容前缀`))}N.lastSelectedText=``,N.currentSelectionRange=null}function Zn(){let e=document.getElementById(`promptManageList`).querySelectorAll(`.prompt-manage-item`);e.forEach(t=>{t.addEventListener(`dragstart`,e=>{N.draggedItemIndex=parseInt(t.dataset.index),t.classList.add(`dragging`),e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,N.draggedItemIndex)}),t.addEventListener(`dragend`,()=>{t.classList.remove(`dragging`),e.forEach(e=>e.classList.remove(`drag-over`)),N.draggedItemIndex=null}),t.addEventListener(`dragover`,e=>{e.preventDefault(),e.dataTransfer.dropEffect=`move`,t.classList.add(`drag-over`)}),t.addEventListener(`dragleave`,()=>{t.classList.remove(`drag-over`)}),t.addEventListener(`drop`,e=>{e.stopPropagation(),e.preventDefault();let n=parseInt(t.dataset.index);if(N.draggedItemIndex!==null&&N.draggedItemIndex!==n){let e=N.customPrompts[N.draggedItemIndex];N.customPrompts.splice(N.draggedItemIndex,1),N.customPrompts.splice(n,0,e),chrome.storage.local.set({customPrompts:N.customPrompts}),X()}t.classList.remove(`drag-over`)})})}function Qn(){let e=document.querySelector(`.input-toolbar-right`);if(!e)return;let t=document.createElement(`button`);t.className=`prompt-manage-btn`,t.title=`提示词管理`,t.innerHTML=`<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`,t.addEventListener(`click`,()=>{or()}),e.appendChild(t)}function $n(e=``){let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);t.style.display=`block`,n.classList.add(`show`),nr(e)}function Y(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`);e.style.display=`none`,t.classList.remove(`show`),N.selectedPromptIndex=-1}function er(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`),n=document.getElementById(`userInput`);e.style.display!==`none`&&t.classList.contains(`show`)?Y():($n(),n.focus())}function tr(e=``){nr(e)}function nr(e=``){let t=document.getElementById(`promptList`),n=e.toLowerCase(),r=N.customPrompts.filter(t=>e?t.code.toLowerCase().includes(n)||t.content.toLowerCase().includes(n):!0);if(r.length===0){t.innerHTML=`<div class="prompt-empty">暂无匹配的提示词</div>`,N.selectedPromptIndex=-1;return}N.selectedPromptIndex=0,t.innerHTML=r.map((e,t)=>`
    <div class="prompt-item ${t===N.selectedPromptIndex?`selected`:``}" data-index="${t}" data-code="${e.code}">
      <span class="prompt-item-content">${e.content}</span>
      <span class="prompt-item-code">/${e.code}</span>
    </div>
  `).join(``),t.querySelectorAll(`.prompt-item`).forEach(e=>{e.addEventListener(`click`,t=>{let n=e.dataset.code;t.ctrlKey||t.metaKey?ir(n):ar(n)})})}function rr(e){e.forEach((e,t)=>{t===N.selectedPromptIndex?e.classList.add(`selected`):e.classList.remove(`selected`)})}function ir(e){let t=N.customPrompts.find(t=>t.code===e);if(!t)return;let n=document.getElementById(`userInput`),r=n.value,i=r.lastIndexOf(`/`),a=r;if(i!==-1){let e=-1;for(let t=i-1;t>=0;t--)if(r[t]===`
`){e=t;break}a=e===-1?r.substring(0,i).trimEnd():r.substring(0,e+1).trimEnd()}n.value=a+(a&&!a.endsWith(`
`)?`

`:``)+t.content,n.focus(),n.selectionStart=n.selectionEnd=n.value.length,Y(),je(),console.log(`[SidePanel] 已追加提示词到输入框:`,t.code,t.content)}async function ar(e){let t=N.customPrompts.find(t=>t.code===e);if(!t)return;if(N.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}Y();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove();let r=t.content,i=N.enableSelectionQuery&&N.selectedContextText&&N.selectedContextText.trim(),a=N.quotedContextText&&N.quotedContextText.trim();if(a){let e=N.quotedContextText.trim();r=`[引用内容]\n${e}\n\n[用户问题]\n${t.content}`,K(`quoted`,e,!1),N.quotedContextText=``}else if(i){let e=N.selectedContextText.trim();r=`[选中内容]\n${e}\n\n[用户问题]\n${t.content}`,K(`selected`,e,!1),N.selectedContextText=``}(i||a)&&Xn(),q(`user`,t.content),N.messageHistory.push({role:`user`,content:r}),G(),ze(t.content);let o=document.getElementById(`userInput`);o.value=``,o.style.height=`auto`,N.isGenerating=!0;let s=document.getElementById(`sendBtn`);s.disabled=!0;let c=Vn(),l=N.activeSessionId,u=N.currentModel;try{await Ie(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let e=[{role:`system`,content:Ne()}];if(N.isolateChat){let t=N.messageHistory;N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?(t=[...N.messageHistory.slice(0,-1).slice(-N.chatConfig.maxMemoryMessages),N.messageHistory[N.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,N.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,N.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:r});let t=await Pe(),n,i;try{let r=await Hn(e,u,N.useTools,t);n=r.content,i=r.executionLog||[]}catch(e){throw J(c),n=`❌ 请求失败：`+(e.message||`未知错误`),i=e.executionLog||[],q(`assistant`,n,!0,i),N.messageHistory.push({role:`assistant`,content:n,executionLog:i}),G(),e}J(c),await Bt(q(`assistant`,n,!0,i)),N.messageHistory.push({role:`assistant`,content:n,executionLog:i}),G()}catch{}finally{N.generatingSessionIds.delete(l),s.disabled=!1,o.focus()}}function or(){document.getElementById(`promptManageModal`).classList.add(`show`),X()}function sr(){document.getElementById(`promptManageModal`).classList.remove(`show`);let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=document.getElementById(`promptManageAddBtn`);e&&(e.value=``),t&&(t.value=``),n&&(n.value=``),r&&(r.textContent=`添加提示词`,r.style.background=`#667eea`)}function X(){let e=document.getElementById(`promptManageList`);if(N.customPrompts.length===0){e.innerHTML=`<div class="prompt-empty">暂无提示词，请添加</div>`;return}e.innerHTML=N.customPrompts.map((e,t)=>`
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
  `).join(``),e.querySelectorAll(`.move-up-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n>0){let e=N.customPrompts[n];N.customPrompts[n]=N.customPrompts[n-1],N.customPrompts[n-1]=e,chrome.storage.local.set({customPrompts:N.customPrompts}),X()}})}),e.querySelectorAll(`.move-down-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n<N.customPrompts.length-1){let e=N.customPrompts[n];N.customPrompts[n]=N.customPrompts[n+1],N.customPrompts[n+1]=e,chrome.storage.local.set({customPrompts:N.customPrompts}),X()}})}),e.querySelectorAll(`.menu-toggle-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);N.customPrompts[n].enabledInMenu=!N.customPrompts[n].enabledInMenu,chrome.storage.local.set({customPrompts:N.customPrompts}),X()})}),e.querySelectorAll(`.edit-btn`).forEach(e=>{e.addEventListener(`click`,()=>{dr(parseInt(e.dataset.index))})}),e.querySelectorAll(`.delete-btn`).forEach(e=>{e.addEventListener(`click`,()=>{fr(parseInt(e.dataset.index))})}),Zn()}function cr(e){let t=document.getElementById(`promptErrorModal`),n=document.getElementById(`promptErrorMessage`);n.textContent=e,t.classList.add(`show`)}function lr(){document.getElementById(`promptErrorModal`).classList.remove(`show`)}function ur(){let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=t.value.trim(),i=n.value.trim();if(!r||!i){cr(`请填写编码和内容`);return}let a=e?parseInt(e.value):-1,o=N.customPrompts.findIndex(e=>e.code===r);if(o!==-1&&o!==a){cr(`编码已存在`);return}a>=0&&a<N.customPrompts.length?N.customPrompts[a]={...N.customPrompts[a],code:r,content:i}:N.customPrompts.push({code:r,content:i,enabledInMenu:!1}),chrome.storage.local.set({customPrompts:N.customPrompts}),t.value=``,n.value=``,e&&(e.value=``);let s=document.getElementById(`promptManageAddBtn`);s.textContent=`添加提示词`,s.style.background=`#667eea`,X()}function dr(e){let t=N.customPrompts[e];if(!t)return;let n=document.getElementById(`editPromptIndex`),r=document.getElementById(`newPromptCode`),i=document.getElementById(`newPromptContent`),a=document.getElementById(`promptManageAddBtn`);n&&(n.value=e),r.value=t.code,i.value=t.content,a.textContent=`保存修改`,a.style.background=`#ffa502`,r.scrollIntoView({behavior:`smooth`})}function fr(e){let t=N.customPrompts[e];if(!t)return;N.pendingDeleteIndex=e;let n=document.getElementById(`deleteConfirmModal`),r=document.getElementById(`deleteConfirmMessage`);r.textContent=`确定要删除提示词 "/${t.code}" 吗？`,n.classList.add(`show`)}function pr(){document.getElementById(`deleteConfirmModal`).classList.remove(`show`),N.pendingDeleteIndex=-1}function mr(e){N.customPrompts.splice(e,1),chrome.storage.local.set({customPrompts:N.customPrompts}),X()}function hr(){let e=document.getElementById(`promptManageCancelBtn`),t=document.getElementById(`promptManageAddBtn`),n=document.getElementById(`promptModalCloseBtn`);e&&e.addEventListener(`click`,sr),t&&t.addEventListener(`click`,ur),n&&n.addEventListener(`click`,sr);let r=document.getElementById(`deleteCancelBtn`),i=document.getElementById(`deleteConfirmBtn`);r&&r.addEventListener(`click`,pr),i&&i.addEventListener(`click`,()=>{N.pendingDeleteIndex>=0&&mr(N.pendingDeleteIndex),pr()});let a=document.getElementById(`deleteConfirmModal`);a&&a.addEventListener(`click`,e=>{e.target===a&&pr()});let o=document.getElementById(`promptErrorConfirmBtn`);o&&o.addEventListener(`click`,lr);let s=document.getElementById(`promptErrorModal`);s&&s.addEventListener(`click`,e=>{e.target===s&&lr()})}function gr(){let e=document.getElementById(`toolsPopupOverlay`);if(!e)return;N.currentCategory=`all`,N.currentSearch=``;let t=document.getElementById(`toolsSearchInput`);t&&(t.value=``),Cr(),Z(),chrome.storage.local.get([`enableToolPreselect`],e=>{let t=document.getElementById(`toolsPreselectToggle`);t&&(t.checked=e.enableToolPreselect===void 0?!0:e.enableToolPreselect)}),document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),vr(),e.classList.add(`show`),console.log(`[SidePanel] 打开工具弹窗`)}function _r(){let e=document.getElementById(`toolsPopupOverlay`);e&&(document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.style.background=``,e.style.color=``,e.style.borderColor=``}),e.classList.remove(`show`),console.log(`[SidePanel] 关闭工具弹窗`))}function vr(){let t=document.getElementById(`toolsPopupList`);if(!t)return;t.innerHTML=``;let n={};e.forEach(e=>{if(N.currentCategory!==`all`&&e.category!==N.currentCategory)return;if(N.currentSearch){let t=e.name.toLowerCase().includes(N.currentSearch),n=e.description.toLowerCase().includes(N.currentSearch);if(!t&&!n)return}let t=e.category||`other`;n[t]||(n[t]=[]),n[t].push(e)});let r=Ae;if(ke.forEach(i=>{let a=n[i];if(!a||a.length===0)return;let o=e.filter(e=>e.category===i),s=o.length,c=o.filter(e=>N.enabledTools.includes(e.id)).length,l=document.createElement(`div`);l.className=`popup-tool-category-group`,l.dataset.category=i;let u=document.createElement(`div`);u.className=`popup-tool-category`,u.dataset.category=i;let d=N.collapsedCategories[i]||!1;u.innerHTML=`
      <span class="category-expand-icon">${d?`▶`:`▼`}</span>
      <span class="category-name">${r[i]||i}</span>
      <span class="category-count">${c}/${s}</span>
    `,u.addEventListener(`click`,()=>{yr(i)}),l.appendChild(u);let f=document.createElement(`div`);f.className=`popup-tool-items ${d?`collapsed`:``}`,a.forEach(e=>{let t=N.enabledTools.includes(e.id),n=document.createElement(`div`);n.className=`popup-tool-item`,n.dataset.category=i,n.innerHTML=`
        <input type="checkbox" id="tool_${e.id}" ${t?`checked`:``}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${e.name}</div>
          <div class="popup-tool-desc">${e.description}</div>
        </div>
      `;let r=n.querySelector(`input[type="checkbox"]`);r&&r.addEventListener(`change`,t=>{if(t.stopPropagation(),t.target.checked)N.enabledTools.includes(e.id)||N.enabledTools.push(e.id);else{let t=N.enabledTools.indexOf(e.id);t>-1&&N.enabledTools.splice(t,1)}br(i),Cr(),Z()}),f.appendChild(n)}),l.appendChild(f),t.appendChild(l)}),t.children.length===0){let e=document.createElement(`div`);e.className=`popup-tool-empty`,e.textContent=`没有找到匹配的工具`,t.appendChild(e)}}function yr(e){N.collapsedCategories[e]=!N.collapsedCategories[e];let t=document.querySelector(`.popup-tool-category-group[data-category="${e}"]`);if(!t)return;let n=t.querySelector(`.popup-tool-category`).querySelector(`.category-expand-icon`),r=t.querySelector(`.popup-tool-items`);N.collapsedCategories[e]?(n.textContent=`▶`,r.classList.add(`collapsed`)):(n.textContent=`▼`,r.classList.remove(`collapsed`))}function br(t){let n=document.querySelector(`.popup-tool-category[data-category="${t}"]`);if(!n)return;let r=n.querySelector(`.category-count`);if(!r)return;let i=e.filter(e=>e.category===t),a=i.length,o=0;i.forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&t.checked&&o++}),r.textContent=`${o}/${a}`}function xr(){return e.filter(e=>{if(N.currentCategory!==`all`&&e.category!==N.currentCategory)return!1;if(N.currentSearch){let t=e.name.toLowerCase().includes(N.currentSearch.toLowerCase()),n=e.description.toLowerCase().includes(N.currentSearch.toLowerCase());if(!t&&!n)return!1}return!0})}function Sr(){ke.forEach(e=>{br(e)})}function Cr(){[`all`,...ke].forEach(t=>{let n=document.getElementById(`badge-`+t);if(!n)return;let r=0,i=0;if(t===`all`)r=e.length,i=N.enabledTools.length;else{let n=e.filter(e=>e.category===t);r=n.length,i=n.filter(e=>N.enabledTools.includes(e.id)).length}n.textContent=`${i}/${r}`})}function Z(){let t=document.getElementById(`toolsEnabledCount`);if(!t)return;let n=e.length;t.textContent=`(已启用 ${N.enabledTools.length}/${n})`}function wr(){let t=[];e.forEach(e=>{let n=document.getElementById(`tool_`+e.id);n?n.checked&&t.push(e.id):N.enabledTools.includes(e.id)&&t.push(e.id)}),N.enabledTools=t,N.useTools=N.enabledTools.length>0,chrome.storage.local.set({enabledTools:N.enabledTools},()=>{console.log(`[SidePanel] 工具配置已保存:`,N.enabledTools)});let n=document.getElementById(`toolsPreselectToggle`);n&&chrome.storage.local.set({enableToolPreselect:n.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已保存:`,n.checked)}),Tr(),F(N.useTools?`已启用 ${N.enabledTools.length} 个工具`:`工具已全部禁用`,`success`)}function Tr(){let e=document.getElementById(`toolsToggleBtn`),t=document.getElementById(`toolsBadge`);e&&(N.useTools&&N.enabledTools.length>0?(e.classList.add(`active`),e.title=`工具 (${N.enabledTools.length}个启用)`):(e.classList.remove(`active`),e.title=`工具 (未启用)`)),t&&(N.enabledTools.length>0?(t.textContent=N.enabledTools.length,t.style.display=`inline`):t.style.display=`none`)}chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.chatMaxMemoryMessages&&(N.chatConfig.maxMemoryMessages=e.chatMaxMemoryMessages.newValue,Q(),console.log(`[SidePanel] 记忆限制配置已更新:`,N.chatConfig.maxMemoryMessages))});function Q(){let e=document.getElementById(`memoryLimitLabel`);e&&(N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?e.textContent=`(${N.chatConfig.maxMemoryMessages})`:e.textContent=`(全)`,e.style.display=`inline`,e.style.cursor=`pointer`,e.title=`点击设置记忆历史限制条数`)}function Er(e){e.preventDefault(),e.stopPropagation();let t=document.getElementById(`memoryLimitDropdown`);if(t.classList.toggle(`show`),t.classList.contains(`show`)){let e=N.chatConfig.maxMemoryMessages;t.querySelectorAll(`.memory-limit-option`).forEach(t=>{t.classList.remove(`selected`);let n=parseInt(t.dataset.value);(e===null&&n===0||e!==null&&e>0&&n===e)&&t.classList.add(`selected`)});let n=t.querySelector(`#memoryLimitInput`);e!==null&&e>0?n.value=e:n.value=``}}function Dr(){let e=document.getElementById(`memoryLimitDropdown`),t=document.getElementById(`memoryLimitLabel`),n=e?.querySelector(`#memoryLimitInput`);if(!e||!t)return;Q(),t.addEventListener(`click`,Er);let r=e.querySelectorAll(`.memory-limit-option`);r.forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let i=parseInt(e.dataset.value),a=i===0?null:i;r.forEach(e=>e.classList.remove(`selected`)),e.classList.add(`selected`),n&&(n.value=i===0?``:i),chrome.storage.local.set({chatMaxMemoryMessages:a},()=>{N.chatConfig.maxMemoryMessages=a,Q(),F(`✅ 配置已更新`,`success`)})})}),n&&(n.addEventListener(`click`,e=>e.stopPropagation()),n.addEventListener(`mousedown`,e=>e.stopPropagation()),n.addEventListener(`change`,e=>{e.stopPropagation();let t=e.target.value.trim(),n=t&&parseInt(t)>0?parseInt(t):null;r.forEach(e=>e.classList.remove(`selected`)),chrome.storage.local.set({chatMaxMemoryMessages:n},()=>{N.chatConfig.maxMemoryMessages=n,Q(),F(`✅ 配置已更新`,`success`)})})),document.addEventListener(`click`,n=>{!e.contains(n.target)&&n.target!==t&&e.classList.remove(`show`)})}function $(e){document.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?(t.classList.add(`selected`),t.querySelector(`.model-option-check`).textContent=`✓`):(t.classList.remove(`selected`),t.querySelector(`.model-option-check`).textContent=``)})}function Or(e,t){let n=document.getElementById(`tempDropdown`);if(!n||!e){typeof t==`function`&&t();return}let r=[`deepseek-v4-pro`,`deepseek-v4-flash`];e.forEach(e=>{if(r.includes(e)||n.querySelector(`.model-option[data-value="${e}"]`))return;let t=document.createElement(`div`);t.className=`model-option`,t.dataset.value=e,t.innerHTML=`<span class="model-option-check"></span>${e}`,t.addEventListener(`click`,t=>{t.stopPropagation(),N.currentModel=e,$(e),chrome.storage.local.set({modelName:e})}),n.querySelector(`.model-section`).appendChild(t)}),typeof t==`function`&&t()}function kr(e,t=`📌 已选中`){if(!N.enableSelectionQuery)return;N.quotedContextText=``,N.selectedContextText=e;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let i;i=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,r.textContent=`${t}: ${i}`,n.classList.add(`show`)}}function Ar(e,t,n=0,r=0){if(!N.enableSelectionQuery)return;let i=document.getElementById(`selectionFloatingMenu`),a=document.getElementById(`selectionMenuItems`);if(!i||!a)return;let o=N.customPrompts.filter(e=>e.enabledInMenu===!0);if(o.length===0)return;a.innerHTML=``,o.forEach(e=>{let n=e.content.length>10?e.content.substring(0,10)+`...`:e.content,r=document.createElement(`div`);r.className=`menu-item`,r.innerHTML=`
      <span>${n}</span>
      <span class="menu-item-code">/${e.code}</span>
    `,r.addEventListener(`click`,n=>{n.stopPropagation(),jr(e,t)}),a.appendChild(r)});let s=document.body.getBoundingClientRect(),c=40+o.length*36,l=r-s.top-c-30,u=n-s.left-20;l<s.top+10&&(l=r-s.top+30),u<s.left+10&&(u=n-s.left+20),u+180>s.right-10&&(u=n-s.left-180-30,u<s.left+10&&(u=n-s.left+20)),l+c>s.bottom-10&&(l=r-s.top-c-30,l<s.top+10&&(l=r-s.top+30)),i.style.top=l+`px`,i.style.left=u+`px`,i.style.maxHeight=s.bottom-l-20+`px`,i.classList.add(`show`)}window.hideFloatingMenu=function(){let e=document.getElementById(`selectionFloatingMenu`);e&&e.classList.remove(`show`),N.lastSelectedText=``,N.currentSelectionRange=null};async function jr(e,t){if(!N.enableSelectionQuery)return;if(window.hideFloatingMenu(),N.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}N.selectedContextText=t,yn();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove(),K(`selected`,t,!1);let r=`[选中内容]\n${t}\n\n[用户问题]\n${e.content}`;q(`user`,e.content),N.messageHistory.push({role:`user`,content:r}),G(),ze(e.content),N.isGenerating=!0;let i=document.getElementById(`sendBtn`);i.disabled=!0;let a=Vn(),o=N.activeSessionId,s=N.currentModel;try{await Ie(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,N.isolateChat),console.log(`  - chatConfig:`,N.chatConfig),console.log(`  - messageHistory.length:`,N.messageHistory.length);let e=[{role:`system`,content:Ne()}];if(N.isolateChat){let t=N.messageHistory;N.chatConfig.maxMemoryMessages!==null&&N.chatConfig.maxMemoryMessages!==void 0&&N.chatConfig.maxMemoryMessages>0?(t=[...N.messageHistory.slice(0,-1).slice(-N.chatConfig.maxMemoryMessages),N.messageHistory[N.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,N.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,N.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:r});let t=await Pe(),n,i;try{let r=await Hn(e,s,N.useTools,t);n=r.content,i=r.executionLog||[]}catch(e){throw J(a),n=`❌ 请求失败：`+(e.message||`未知错误`),i=e.executionLog||[],q(`assistant`,n,!0,i),N.messageHistory.push({role:`assistant`,content:n,executionLog:i}),G(),e}J(a),await Bt(q(`assistant`,n,!0,i)),N.messageHistory.push({role:`assistant`,content:n,executionLog:i}),G()}catch{}finally{N.generatingSessionIds.delete(o),i.disabled=!1,document.getElementById(`userInput`).focus()}}document.addEventListener(`DOMContentLoaded`,async()=>{window.__tableBlocks=[],await Le(),await _n(),chrome.runtime.onMessage.addListener(e=>{e.type===`SELECTION_AI_SEARCH`&&e.prompt&&(console.log(`[SidePanel] 收到选中文本 AI 搜索:`,e.selectedText?.substring(0,50)),En(e.prompt,e.selectedText),chrome.storage.session.remove(`pendingSelectionSearch`).catch(()=>{})),e.type===`FILL_SIDEPANEL_INPUT`&&e.text&&(console.log(`[SidePanel] 收到追问填充:`,e.text?.substring(0,50)),Dn(e.text),chrome.storage.session.remove(`pendingFillInput`).catch(()=>{})),e.type===`DIRECT_SEND`&&e.text&&(console.log(`[SidePanel] 收到直接发送:`,e.text?.substring(0,50)),On(e.text,e.selectedText||``),chrome.storage.session.remove(`pendingDirectSend`).catch(()=>{}))});let t=await chrome.storage.session.get(`pendingSelectionSearch`);if(t.pendingSelectionSearch&&t.pendingSelectionSearch.selectedText){let{prompt:e,selectedText:n}=t.pendingSelectionSearch;console.log(`[SidePanel] 有待处理的选中文本搜索:`,n?.substring(0,50)),setTimeout(()=>{En(e,n)},500),await chrome.storage.session.remove(`pendingSelectionSearch`)}let n=await chrome.storage.session.get(`pendingFillInput`);if(n.pendingFillInput&&n.pendingFillInput.text){let{text:e}=n.pendingFillInput;console.log(`[SidePanel] 有待填充的追问文本:`,e?.substring(0,50)),setTimeout(()=>{Dn(e)},500),await chrome.storage.session.remove(`pendingFillInput`)}let r=await chrome.storage.session.get(`pendingDirectSend`);if(r.pendingDirectSend&&r.pendingDirectSend.text){let{text:e,selectedText:t}=r.pendingDirectSend;console.log(`[SidePanel] 有待直接发送的文本:`,e?.substring(0,50)),setTimeout(()=>{On(e,t||``)},500),await chrome.storage.session.remove(`pendingDirectSend`)}chrome.tabs.onActivated.addListener(async e=>{console.log(`[SidePanel] Tab 切换, 新 Tab ID:`,e.tabId),N.currentTabId=e.tabId}),chrome.tabs.onUpdated.addListener(async(e,t)=>{t.status===`complete`&&N.currentTabId===e&&console.log(`[SidePanel] 当前 Tab 页面更新:`,t)}),typeof marked<`u`&&(marked.setOptions({breaks:!0,gfm:!0}),console.log(`[SidePanel] Marked 库已加载`)),typeof mermaid<`u`&&(mermaid.initialize({startOnLoad:!1,theme:`default`,securityLevel:`loose`,fontFamily:`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`}),console.log(`[SidePanel] Mermaid 库已加载`));let i=document.getElementById(`userInput`),a=document.getElementById(`sendBtn`),o=document.getElementById(`clearChatBtn`),s=document.getElementById(`exportChatBtn`),c=document.getElementById(`chatContainer`),l=document.getElementById(`tempDisplay`),u=document.getElementById(`tempDropdown`),d=document.getElementById(`tempPresetList`),f=document.getElementById(`tempSlider`),p=document.getElementById(`tempNumberInput`);function m(){!i||N.isScrolling||(i.style.height=`auto`,i.style.height=Math.min(i.scrollHeight,100)+`px`)}chrome.storage.local.get([`temperature`,`topP`,`selectedTempIndex`],e=>{e.temperature!==void 0&&(N.temperature=e.temperature),e.topP!==void 0&&(N.topP=e.topP),e.selectedTempIndex!==void 0&&(N.selectedTempIndex=e.selectedTempIndex),h()});function h(){f&&(f.value=N.temperature),p&&(p.value=N.temperature.toFixed(2));let e=document.getElementById(`tempIconValue`);e&&(e.textContent=N.temperature.toFixed(2)),g()}function g(){d.innerHTML=P.map((e,t)=>`
      <div class="temp-preset-item ${t===N.selectedTempIndex?`selected`:``}" data-index="${t}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${e.label}</div>
          <div class="temp-preset-desc" title="${e.tip}">${e.tip}</div>
        </div>
        <div class="temp-preset-value">${e.temp.toFixed(2)}</div>
      </div>
    `).join(``),d.querySelectorAll(`.temp-preset-item`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation(),_(parseInt(e.dataset.index))})})}function _(e){let t=P[e];t&&(N.selectedTempIndex=e,N.temperature=t.temp,h(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex}))}f.addEventListener(`input`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),N.temperature=t,p.value=t.toFixed(2);let n=document.getElementById(`tempIconValue`);n&&(n.textContent=t.toFixed(2));let r=0,i=Math.abs(P[0].temp-t);for(let e=1;e<P.length;e++){let n=Math.abs(P[e].temp-t);n<i&&(i=n,r=e)}N.selectedTempIndex=r,g(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex})}),p.addEventListener(`change`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),N.temperature=t,f.value=t,p.value=t.toFixed(2);let n=0,r=Math.abs(P[0].temp-t);for(let e=1;e<P.length;e++){let i=Math.abs(P[e].temp-t);i<r&&(r=i,n=e)}N.selectedTempIndex=n,g(),chrome.storage.local.set({temperature:N.temperature,topP:N.topP,selectedTempIndex:N.selectedTempIndex})}),l&&u&&(l.addEventListener(`click`,e=>{e.stopPropagation(),u.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{let t=document.querySelector(`.temp-selector`);t&&!t.contains(e.target)&&u.classList.remove(`show`)})),c.addEventListener(`mousedown`,e=>{N.lastMouseX=e.clientX,N.lastMouseY=e.clientY}),c.addEventListener(`mouseup`,e=>{N.lastMouseX=e.clientX,N.lastMouseY=e.clientY,N.enableSelectionQuery&&setTimeout(()=>{let e=window.getSelection();if(e&&!e.isCollapsed&&e.toString().trim()){let t=e.toString().trim();c.contains(e.anchorNode)&&t!==N.lastSelectedText&&(N.lastSelectedText=t,N.currentSelectionRange=e.getRangeAt(0).cloneRange(),kr(t),Ar(e,t,N.lastMouseX,N.lastMouseY))}else c.contains(e.anchorNode)||(N.lastSelectedText=``,N.currentSelectionRange=null,window.hideFloatingMenu())},10)});let v=``,y=null;async function b(){try{let e=await new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>e(t))});if(e&&e.length>0){let t=await new Promise(t=>{chrome.tabs.sendMessage(e[0].id,{action:`getSelectedText`},e=>{chrome.runtime.lastError?(console.debug(`[SidePanel] content script 未加载或无法通信:`,chrome.runtime.lastError.message),t(null)):t(e)})});if(!t)return;let n=t?.text||``;n&&n.trim()?n!==v&&(v=n,kr(n.trim())):v=``}}catch{}}function x(){y&&=(clearInterval(y),null),N.enableSelectionQuery&&(y=setInterval(b,500))}x(),chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&`enableSelectionQuery`in e&&(N.enableSelectionQuery=e.enableSelectionQuery.newValue,x())}),chrome.storage.local.get([`modelName`,`customModels`,`customPrompts`,`systemPrompt`,`inputHistory`],e=>{let t=e.modelName;t&&(N.currentModel=t),N.customPrompts=e.customPrompts||[],N.systemPrompt=e.systemPrompt||``,N.inputHistory=e.inputHistory||[],Qn(),Or(e.customModels,()=>{t&&$(t)})}),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`){if(e.customModels){let t=e.customModels.newValue||[],n=u.querySelector(`.model-section`);n&&n.querySelectorAll(`.model-option`).forEach(e=>{let t=e.dataset.value;t!==`deepseek-v4-pro`&&t!==`deepseek-v4-flash`&&e.remove()}),Or(t)}if(e.modelName){let t=e.modelName.newValue;t&&(N.currentModel=t,$(t))}}}),bn(),document.addEventListener(`session-switched`,()=>{let e=document.getElementById(`chatContainer`),t=document.getElementById(`sendBtn`),n=document.getElementById(`userInput`);if(!e)return;if(N.executionLogListener&&=(chrome.runtime.onMessage.removeListener(N.executionLogListener),null),t&&(t.disabled=N.isGenerating),n&&n.focus(),e.innerHTML=``,!N.messageHistory||N.messageHistory.length===0){let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      `,e.appendChild(t)}else N.messageHistory.forEach(e=>{q(e.role,e.content,!1,e.executionLog||[])}),Pt();let r=N.pendingCallApiSessionIds.has(N.activeSessionId)&&!!N.pendingCancelApi;if(console.log(`[SidePanel] session-switched: pendingTask?`,r,`pendingSessionIds:`,[...N.pendingCallApiSessionIds],`activeSessionId:`,N.activeSessionId,`hasCancelApi:`,!!N.pendingCancelApi),r){console.log(`[SidePanel] 切回有后台任务的会话，显示加载状态`);let e=Vn();N.substituteLoadingIds.set(N.activeSessionId,e)}let i=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.get([i],e=>{e[i]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t&&(t.scrollTop=e[i])},150)})}),document.querySelectorAll(`.model-option`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.value;N.currentModel=n,$(n),chrome.storage.local.set({modelName:n})})}),document.addEventListener(`click`,e=>{let t=document.getElementById(`promptDropdown`),n=document.getElementById(`promptSelector`),r=document.getElementById(`selectionFloatingMenu`);if(n.contains(e.target)||(t.classList.remove(`show`),Y()),r&&!r.contains(e.target)){let t=window.getSelection(),n=c.contains(e.target),r=t&&!t.isCollapsed&&c.contains(t.anchorNode);(!n||!r)&&window.hideFloatingMenu()}}),a.addEventListener(`click`,Tn);let S=document.getElementById(`promptTriggerBtn`);S&&S.addEventListener(`click`,e=>{e.stopPropagation(),S.blur(),er()}),document.addEventListener(`keydown`,e=>{if((e.ctrlKey||e.metaKey)&&e.key===`t`){e.preventDefault();let t=document.getElementById(`toolsPopup`);t&&t.style.display!==`none`?_r():gr()}}),i.addEventListener(`keydown`,e=>{let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);if(t.style.display!==`none`&&n.classList.contains(`show`)){let t=n.querySelectorAll(`.prompt-item`),r=t.length;if(r!==0&&e.key===`ArrowDown`){e.preventDefault(),N.selectedPromptIndex<0?N.selectedPromptIndex=0:N.selectedPromptIndex=(N.selectedPromptIndex+1)%r,rr(t);return}if(e.key===`ArrowUp`){e.preventDefault(),N.selectedPromptIndex<0||N.selectedPromptIndex===0?N.selectedPromptIndex=r-1:--N.selectedPromptIndex,rr(t);return}if(e.key===`Enter`&&(e.ctrlKey||e.metaKey)&&N.selectedPromptIndex>=0){e.preventDefault();let n=t[N.selectedPromptIndex].dataset.code;ir(n);return}if(e.key===`Enter`&&N.selectedPromptIndex>=0){e.preventDefault();let n=t[N.selectedPromptIndex].dataset.code;ar(n);return}if(e.key===`Escape`){Y();return}}if(e.key===`Escape`){N.inputHistoryIndex>=0&&(N.inputHistoryIndex=-1),i.value&&(i.value=``,i.style.height=`auto`,i.dispatchEvent(new Event(`input`))),e.preventDefault();return}if(!(t.style.display!==`none`&&n.classList.contains(`show`))&&!N.isGenerating){if(e.key===`ArrowUp`){e.preventDefault(),N.inputHistoryIndex===-1?N.inputHistoryIndex=N.inputHistory.length-1:N.inputHistoryIndex>0&&N.inputHistoryIndex--,N.inputHistoryIndex<0&&(N.inputHistoryIndex=0),N.inputHistoryIndex>=0&&N.inputHistory.length>0&&(i.value=N.inputHistory[N.inputHistoryIndex],i.dispatchEvent(new Event(`input`)));return}if(e.key===`ArrowDown`){e.preventDefault(),N.inputHistoryIndex>=0&&N.inputHistoryIndex<N.inputHistory.length-1?(N.inputHistoryIndex++,i.value=N.inputHistory[N.inputHistoryIndex],i.dispatchEvent(new Event(`input`))):(N.inputHistoryIndex=-1,i.value=``,i.dispatchEvent(new Event(`input`)));return}}e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),Tn())}),i.addEventListener(`wheel`,e=>{N.isScrolling=!0;let t=i.style.height||i.offsetHeight+`px`;i.style.height=t,i.scrollHeight<=i.clientHeight+10&&(e.preventDefault(),e.stopPropagation()),setTimeout(()=>{N.isScrolling=!1},100)},{passive:!1}),i.addEventListener(`input`,e=>{let t=i.value;document.getElementById(`promptSelector`),document.getElementById(`promptDropdown`);let n=t.lastIndexOf(`/`);if(n!==-1){let e=t.substring(n+1);n===0||t[n-1]===`
`||t[n-1]===` `?$n(e):tr(e)}else Y();m()}),c.addEventListener(`scroll`,()=>{let e=`scrollPosition_`+(N.activeSessionId||`default`);chrome.storage.local.set({[e]:c.scrollTop})});let C=document.getElementById(`headerMoreBtn`),w=document.getElementById(`headerMoreDropdown`);C&&w&&(C.addEventListener(`click`,e=>{e.stopPropagation(),w.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{!w.contains(e.target)&&e.target!==C&&w.classList.remove(`show`)})),o.addEventListener(`click`,e=>{e.stopPropagation(),w.classList.remove(`show`),Cn()}),s&&s.addEventListener(`click`,e=>{e.stopPropagation(),w.classList.remove(`show`),Sn()});let ee=document.getElementById(`settingsBtn`);ee&&ee.addEventListener(`click`,()=>{chrome.runtime.openOptionsPage()});let te=document.getElementById(`prototypeLibraryBtn`);te&&te.addEventListener(`click`,e=>{e.stopPropagation(),w.classList.remove(`show`),gt()});let T=document.getElementById(`isolateChatBtn`),E=document.getElementById(`enableToolsBtn`),ne=document.getElementById(`toolsConfigBtn`);chrome.storage.local.get([`isolateChat`,`enableSelectionQuery`,`enableTools`,`enabledTools`],t=>{t.isolateChat!==void 0&&(N.isolateChat=t.isolateChat),T.checked=N.isolateChat,t.enableSelectionQuery!==void 0&&(N.enableSelectionQuery=t.enableSelectionQuery);let n=document.getElementById(`enableSelectionQueryBtn`);n&&(n.checked=N.enableSelectionQuery),t.enableTools!==void 0&&(N.useTools=t.enableTools),t.enabledTools&&t.enabledTools.length>0?N.enabledTools=t.enabledTools:N.enabledTools=e.filter(e=>e.enabled).map(e=>e.id),N.enabledTools.length===0&&(N.useTools=!1),E&&(E.checked=N.useTools),x()}),T.addEventListener(`change`,()=>{N.isolateChat=T.checked,chrome.storage.local.set({isolateChat:N.isolateChat}),console.log(`[SidePanel] 记忆对话:`,N.isolateChat?`已启用`:`已禁用`)});let D=document.getElementById(`enableSelectionQueryBtn`);D&&D.addEventListener(`change`,()=>{N.enableSelectionQuery=D.checked,chrome.storage.local.set({enableSelectionQuery:N.enableSelectionQuery}),console.log(`[SidePanel] 划词问答:`,N.enableSelectionQuery?`已启用`:`已禁用`),!N.enableSelectionQuery&&N.selectedContextText&&yn()}),E&&E.addEventListener(`change`,()=>{N.useTools=E.checked,chrome.storage.local.set({enableTools:N.useTools}),N.useTools&&N.enabledTools.length===0&&(N.enabledTools=e.filter(e=>e.enabled).map(e=>e.id),chrome.storage.local.set({enabledTools:N.enabledTools})),console.log(`[SidePanel] 工具总开关:`,N.useTools?`已启用`:`已禁用`)}),ne&&ne.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),gr()});let re=document.getElementById(`toolsPopupOverlay`),ie=document.getElementById(`toolsPopupClose`),ae=re?re.querySelector(`.modal-container`):null;ie&&ie.addEventListener(`click`,_r),ae&&ae.addEventListener(`click`,e=>{e.stopPropagation()});let O=document.getElementById(`toolsSearchInput`);O&&O.addEventListener(`input`,e=>{N.currentSearch=e.target.value.toLowerCase(),vr()});let oe=document.querySelectorAll(`.category-btn`);oe.forEach(e=>{e.addEventListener(`click`,()=>{oe.forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.style.background=`#f5f3ff`,e.style.color=`#667eea`,e.style.borderColor=`#d4cfff`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`,N.currentCategory=e.dataset.category,vr()})});let k=document.getElementById(`toolsCategories`);k&&k.addEventListener(`wheel`,e=>{e.preventDefault(),k.scrollLeft+=e.deltaY*2},{passive:!1});let se=document.getElementById(`toolsSelectAll`),ce=document.getElementById(`toolsSelectNone`);se&&se.addEventListener(`click`,()=>{xr().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!0),N.enabledTools.includes(e.id)||N.enabledTools.push(e.id)}),Sr(),Cr(),Z()}),ce&&ce.addEventListener(`click`,()=>{xr().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!1);let n=N.enabledTools.indexOf(e.id);n>-1&&N.enabledTools.splice(n,1)}),Sr(),Cr(),Z()});let le=document.getElementById(`toolsPopupSave`);le&&le.addEventListener(`click`,()=>{wr(),Z()});let A=document.getElementById(`toolsPreselectToggle`);A&&A.addEventListener(`change`,()=>{chrome.storage.local.set({enableToolPreselect:A.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已更新:`,A.checked)})});let ue=document.getElementById(`toolsPopupCancel`);ue&&ue.addEventListener(`click`,()=>{_r()});let j=document.getElementById(`modalCancelBtn`),de=document.getElementById(`modalConfirmBtn`);j.addEventListener(`click`,()=>{wn()}),de.addEventListener(`click`,()=>{wn(),xn()});let M=document.getElementById(`confirmModal`);M.addEventListener(`click`,e=>{e.target===M&&wn()});let fe=document.getElementById(`selectionClose`);fe&&fe.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),console.log(`[SidePanel] 用户点击关闭选中内容按钮`),yn(),window.hideFloatingMenu(),N.lastSelectedText=``,N.currentSelectionRange=null}),i.addEventListener(`input`,()=>{})}),Fe().then(()=>Q()),document.addEventListener(`DOMContentLoaded`,()=>{Dr()}),document.addEventListener(`DOMContentLoaded`,Ve),document.addEventListener(`DOMContentLoaded`,hr),document.addEventListener(`DOMContentLoaded`,nt),document.addEventListener(`DOMContentLoaded`,at),document.addEventListener(`DOMContentLoaded`,kt);
//# sourceMappingURL=side_panel-CAsxvqCO.js.map