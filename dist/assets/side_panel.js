import{n as e,r as t}from"./constants-CIsVXb3D.js";import{S as n,T as r,a as i,b as a,c as o,d as s,f as c,g as l,h as u,m as d,n as f,o as p,p as m,r as h,t as g,v as _,x as v,y}from"./token-store-CgV-rD1I.js";var b=new Set,x=[],S=`deepseek-v4-pro`,C=null,w=[],T=!0,E=!0,ee=!1,te=null,ne=``,D=``,re=[],ie=-1,ae=null,oe=``,se=[],ce=-1,le={platformName:`Unknown`,platform:`unknown`,arch:`unknown`,shell:`/bin/sh`,homeDir:`/home/user`,workdir:``,connected:!1},O={maxInputHistory:20,maxHistoryMessages:50,maxMessageLength:1e5,maxMemoryMessages:20,enableExecutionLog:!1},ue=.2,de=1,fe=0,pe=`all`,me=``,he=[],ge={},k=new Map,_e=null,A=new Map,ve=new Set,j=new Map,ye=null,be=null,xe=null,Se=null,M=null,Ce=18e4,we=null,Te=!1,Ee=null,De=``,Oe=null,N=0,P=0,ke=-1,Ae=!1,je=``,Me=``,Ne=``,Pe=[],Fe=!1,F={get isGenerating(){return b.has(C)},set isGenerating(e){e?b.add(C):b.delete(C)},get generatingSessionIds(){return b},get messageHistory(){return x},set messageHistory(e){x=e},get currentModel(){return S},set currentModel(e){S=e},get activeSessionId(){return C},set activeSessionId(e){C=e},get sessions(){return w},set sessions(e){w=e},get useTools(){return T},set useTools(e){T=e},get isolateChat(){return E},set isolateChat(e){E=e},get enableSelectionQuery(){return ee},set enableSelectionQuery(e){ee=e},get currentTabId(){return te},set currentTabId(e){te=e},get selectedContextText(){return ne},set selectedContextText(e){ne=e},get quotedContextText(){return D},set quotedContextText(e){D=e},get customPrompts(){return re},set customPrompts(e){re=e},get selectedPromptIndex(){return ie},set selectedPromptIndex(e){ie=e},get draggedItemIndex(){return ae},set draggedItemIndex(e){ae=e},get systemPrompt(){return oe},set systemPrompt(e){oe=e},get agentPlatform(){return le},set agentPlatform(e){Object.assign(le,e)},get inputHistory(){return se},set inputHistory(e){se=e},get inputHistoryIndex(){return ce},set inputHistoryIndex(e){ce=e},get chatConfig(){return O},set chatConfig(e){O=e},get temperature(){return ue},set temperature(e){ue=e},get topP(){return de},set topP(e){de=e},get selectedTempIndex(){return fe},set selectedTempIndex(e){fe=e},get currentCategory(){return pe},set currentCategory(e){pe=e},get currentSearch(){return me},set currentSearch(e){me=e},get enabledTools(){return he},set enabledTools(e){he=e},get collapsedCategories(){return ge},get sessionExecutionStatus(){return k},set sessionExecutionStatus(e){k=e},get currentExecutionStatus(){return k.get(C)||null},set currentExecutionStatus(e){e===null?k.delete(C):k.set(C,e)},get executionLogListener(){return _e},set executionLogListener(e){_e=e},get pendingCancelApi(){return A.get(C)||null},set pendingCancelApi(e){e===null?A.delete(C):A.set(C,e)},get pendingCancelApiMap(){return A},get pendingCallApiSessionIds(){return ve},set pendingCallApiSessionIds(e){ve=e},get substituteLoadingIds(){return j},set substituteLoadingIds(e){j=e},get currentClarifyToolCallId(){return ye},set currentClarifyToolCallId(e){ye=e},get currentClarifySessionId(){return be},set currentClarifySessionId(e){be=e},get currentConfirmToolCallId(){return xe},set currentConfirmToolCallId(e){xe=e},get currentConfirmSessionId(){return Se},set currentConfirmSessionId(e){Se=e},get clarifyTimerInterval(){return M},set clarifyTimerInterval(e){M=e},get clarifyTimeoutValue(){return Ce},set clarifyTimeoutValue(e){Ce=e},get messageTocContainer(){return we},set messageTocContainer(e){we=e},get isMouseOverToc(){return Te},set isMouseOverToc(e){Te=e},get tocHideTimer(){return Ee},set tocHideTimer(e){Ee=e},get lastSelectedText(){return De},set lastSelectedText(e){De=e},get currentSelectionRange(){return Oe},set currentSelectionRange(e){Oe=e},get lastMouseX(){return N},set lastMouseX(e){N=e},get lastMouseY(){return P},set lastMouseY(e){P=e},get pendingDeleteIndex(){return ke},set pendingDeleteIndex(e){ke=e},get enableImageInput(){return Ae},set enableImageInput(e){Ae=e},get imageModelName(){return je},set imageModelName(e){je=e},get imageApiBase(){return Me},set imageApiBase(e){Me=e},get imageApiKey(){return Ne},set imageApiKey(e){Ne=e},get attachedImages(){return Pe},set attachedImages(e){Pe=e},get isScrolling(){return Fe},set isScrolling(e){Fe=e}},Ie=t,I=[{label:`精准编码`,temp:.2,topP:1,tip:`较低随机性，适合业务开发、调试、纠错`},{label:`均衡开发`,temp:.45,topP:.9,tip:`兼顾稳定性，用于封装工具类、常规脚本`},{label:`架构探索`,temp:.65,topP:.9,tip:`提供多种实现思路，用于组件重构、方案对比`},{label:`创意发散`,temp:.9,topP:.9,tip:`随机性较高，仅用于原型探索，不建议生产代码`}],Le={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,content_extraction:`📄 内容提取`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_output:`📷 媒体与输出`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,local_agent:`🖥️ 本地Agent`};function L(e,t=`info`,n=3e3){let r=document.getElementById(`toastContainer`);if(!r)return;let i=document.createElement(`div`);i.className=`toast ${t}`,i.textContent=e,r.appendChild(i),requestAnimationFrame(()=>{i.classList.add(`toast-show`)}),setTimeout(()=>{i.classList.remove(`toast-show`),setTimeout(()=>{i.parentNode&&i.parentNode.removeChild(i)},300)},n)}function Re(){let e=document.getElementById(`userInput`);e&&(e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,100)+`px`)}function R(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function ze(e){return!e||e<0?`0ms`:e<1e3?`${Math.round(e)}ms`:e<6e4?`${(e/1e3).toFixed(1)}s`:`${Math.floor(e/6e4)}分${(e%6e4/1e3).toFixed(1)}秒`}function Be(e,t){navigator.clipboard.writeText(e).then(()=>{let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(n=>{console.error(`[SidePanel] 复制失败:`,n);let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{L(`复制失败`,`error`)}document.body.removeChild(r)})}function Ve(){let e=new Date().toLocaleString(`zh-CN`),t=``;if(F.agentPlatform&&F.agentPlatform.connected){let e=F.agentPlatform;t=`\n- 本地 Agent：${e.platformName} (${e.arch})，默认 shell: ${e.shell}，工作目录: ${e.workdir||`未设置`}`}let n=`

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
   - 指定执行策略：sequential（顺序执行）、parallel（并行执行）或 conditional（条件执行）`;return F.systemPrompt&&F.systemPrompt.trim()?`${F.systemPrompt}

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
`}function He(){return new Promise(e=>{chrome.storage.local.get([`temperature`,`topP`],t=>{e({temperature:t.temperature===void 0?parseFloat(F.temperature.toFixed(2)):parseFloat(t.temperature.toFixed(2)),top_p:t.topP===void 0?parseFloat(F.topP.toFixed(2)):parseFloat(t.topP.toFixed(2))})})})}function Ue(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(F.chatConfig=t,console.log(`[SidePanel] 对话配置已加载:`,F.chatConfig)),e(t)})})}async function We(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(F.chatConfig=t,console.log(`[SidePanel] 同步加载对话配置:`,F.chatConfig)),e()})})}async function Ge(){return new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>{t&&t.length>0&&t[0].id?(F.currentTabId=t[0].id,console.log(`[SidePanel] 获取当前 Tab ID:`,F.currentTabId,`URL:`,t[0].url),e(F.currentTabId)):(console.warn(`[SidePanel] 未获取到有效的 Tab ID`),e(null))})})}function Ke(){return new Promise(e=>{chrome.storage.local.get([`reactMaxIterations`,`reactApiTimeout`,`reactLoopTimeout`,`reactToolTimeout`,`reactClarifyTimeout`],t=>{e({maxIterations:t.reactMaxIterations||30,apiTimeout:t.reactApiTimeout||6e4,loopTimeout:t.reactLoopTimeout||3e5,toolTimeout:t.reactToolTimeout||3e4,clarifyTimeout:t.reactClarifyTimeout||18e4})})})}function qe(e){if(!e||!e.trim()||e.trim()==`/`)return;let t=e.trim(),n=F.inputHistory.indexOf(t);n!==-1&&F.inputHistory.splice(n,1),F.inputHistory.push(t),F.inputHistory.length>F.chatConfig.maxInputHistory&&F.inputHistory.shift(),Je()}function Je(){try{chrome.storage.local.set({inputHistory:F.inputHistory}),console.log(`[SidePanel] 输入历史已保存，数量:`,F.inputHistory.length)}catch(e){console.error(`[SidePanel] 保存输入历史失败:`,e)}}function Ye(){document.addEventListener(`mouseover`,Xe,!0),document.addEventListener(`mouseout`,Ze,!0),console.log(`[SidePanel] 消息目录功能已初始化`)}function Xe(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){F.isMouseOverToc=!0;return}let t=e.target.closest(`.message.assistant`);if(!t)return;let n=t.querySelectorAll(`.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6`);if(n.length===0){$e();return}Qe(t,n)}function Ze(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){F.isMouseOverToc=!1,F.tocHideTimer&&=(clearTimeout(F.tocHideTimer),null);return}if(!e.target.closest(`.message.assistant`))return;let t=e.relatedTarget;t&&(t.closest(`.message-toc-container`)||t.closest(`.message.assistant`))||F.isMouseOverToc||(F.tocHideTimer&&clearTimeout(F.tocHideTimer),F.tocHideTimer=setTimeout(()=>{F.isMouseOverToc||$e(),F.tocHideTimer=null},800))}function Qe(e,t){let n=Array.from(t);F.messageTocContainer&&$e(),n.forEach((e,t)=>{e.id||=`toc-heading-${Date.now()}-${t}`});let r=document.createElement(`div`);r.className=`message-toc-container`,r.dataset.headingsCount=n.length;let i=0,a=n.map(e=>{let t=parseInt(e.tagName.charAt(1)),n=e.textContent.trim(),r=n.length>30?n.substring(0,30)+`...`:n,a=`H${t}`;return i++,`
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
  `,document.body.appendChild(r),F.messageTocContainer=r;let o=e.getBoundingClientRect(),s=window.innerWidth-280;o.right<s&&(r.style.left=o.right+`px`,r.style.right=`0`,r.style.width=`auto`);let c=r.querySelector(`.message-toc-toggle`),l=r.querySelector(`.message-toc-panel`);c.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),c.addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),l.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),r.querySelectorAll(`.message-toc-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.target,n=document.getElementById(t);n&&(n.scrollIntoView({behavior:`smooth`,block:`start`}),n.classList.add(`toc-highlight`),setTimeout(()=>{n.classList.remove(`toc-highlight`)},1500))})})}function $e(){F.tocHideTimer&&=(clearTimeout(F.tocHideTimer),null),F.messageTocContainer&&=(F.messageTocContainer.remove(),null)}function et(e){return`${Math.floor(e/60)}:${(e%60).toString().padStart(2,`0`)}`}function tt(e=`default`){try{let t=new(window.AudioContext||window.webkitAudioContext),n=t.createOscillator(),r=t.createGain();n.connect(r),r.connect(t.destination);let i={default:{frequency:800,duration:.3},success:{frequency:523,duration:.2},warning:{frequency:440,duration:.4},error:{frequency:220,duration:.5}},a=i[e]||i.default;n.frequency.value=a.frequency,n.type=`sine`,r.gain.setValueAtTime(.3,t.currentTime),r.gain.exponentialRampToValueAtTime(.01,t.currentTime+a.duration),n.start(t.currentTime),n.stop(t.currentTime+a.duration),console.log(`[SidePanel] 提示音已播放:`,e)}catch(e){console.error(`[SidePanel] 播放提示音失败:`,e.message)}}function nt(e,t){let n=document.getElementById(`clarifyTimer`),r=document.getElementById(`clarifyTimerText`);if(!n||!r)return;r.textContent=`剩余时间: ${et(e)}`;let i=e/t*100;n.classList.remove(`warning`,`critical`),e<=10?(n.classList.add(`critical`),r.textContent=`即将超时: ${et(e)}`):(e<=30||i<=15)&&n.classList.add(`warning`),e===30&&tt(`warning`)}function rt(e){it(),F.clarifyTimeoutValue=e;let t=Math.ceil(e/1e3),n=t;nt(n,t),F.clarifyTimerInterval=setInterval(()=>{n--,n<=0?it():nt(n,t)},1e3)}function it(){F.clarifyTimerInterval&&=(clearInterval(F.clarifyTimerInterval),null)}function at(e){console.log(`[SidePanel] 显示澄清对话框:`,e);let{question:t,options:n,recommendedOption:r,allowCustomInput:i=!0,allowAdditionalInfo:a=!0,toolCallId:o,timeout:s=18e4,sessionId:c}=e;F.currentClarifyToolCallId=o,F.currentClarifySessionId=c||null;let l=document.getElementById(`clarifySessionName`);if(l)if(c&&F.sessions){let e=F.sessions.find(e=>e.id===c);e?(l.textContent=`会话: ${e.title}`,l.style.display=`block`):(l.textContent=`会话: ${c.substring(0,8)}...`,l.style.display=`block`)}else l.textContent=``,l.style.display=`none`;let u=r!==void 0&&r>=0?r:0,d=[u],f=u,p=document.getElementById(`clarifyQuestion`);p&&(p.textContent=t);let m=document.getElementById(`clarifyOptionsList`);if(m&&(document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.remove()}),n.forEach((e,t)=>{let n=d.includes(t),r=document.createElement(`div`);r.className=`clarify-option-item ${f===t?`selected`:``} ${n?`recommended`:``}`,r.dataset.index=t,r.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${e}${n?`<span class="clarify-option-badge">推荐</span>`:``}</div>
      `,r.addEventListener(`click`,()=>st(t)),m.appendChild(r)}),i)){let e=document.createElement(`div`);e.className=`clarify-option-item`,e.dataset.index=-1,e.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `,e.addEventListener(`click`,()=>st(-1)),m.appendChild(e);let t=document.getElementById(`clarifyCustomInput`);t&&m.appendChild(t)}let h=document.getElementById(`clarifyCustomInput`);h&&h.classList.remove(`show`);let g=document.getElementById(`clarifyAdditionalInfo`);g&&g.classList.toggle(`show`,a);let _=document.getElementById(`clarifyCustomTextarea`);_&&(_.value=``);let v=document.getElementById(`clarifyAdditionalTextarea`);v&&(v.value=``);let y=document.getElementById(`clarifyOverlay`);y&&y.classList.add(`show`),rt(s),console.log(`[SidePanel] 澄清对话框已显示`)}function ot(){let e=document.getElementById(`clarifyOverlay`);e&&e.classList.remove(`show`),F.currentClarifyToolCallId=null,F.currentClarifySessionId=null,it(),console.log(`[SidePanel] 澄清对话框已隐藏`)}function st(e){document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.classList.remove(`selected`)});let t=document.querySelector(`.clarify-option-item[data-index="${e}"]`);t&&t.classList.add(`selected`);let n=document.getElementById(`clarifyCustomInput`);if(n)if(e===-1){n.classList.add(`show`);let e=document.getElementById(`clarifyCustomTextarea`);e&&e.focus()}else n.classList.remove(`show`);console.log(`[SidePanel] 选择澄清选项:`,e)}function ct(){if(!F.currentClarifyToolCallId){console.error(`[SidePanel] 没有当前工具调用ID`);return}let e=-1;document.querySelectorAll(`.clarify-option-item`).forEach((t,n)=>{t.classList.contains(`selected`)&&(e=parseInt(t.dataset.index))});let t=document.getElementById(`clarifyCustomTextarea`),n=t?t.value.trim():``,r=document.getElementById(`clarifyAdditionalTextarea`),i=r?r.value.trim():``,a={type:`CLARIFY_RESPONSE`,toolCallId:F.currentClarifyToolCallId,selectedOption:e,customInput:n,additionalInfo:i};console.log(`[SidePanel] 发送澄清响应:`,a),chrome.runtime.sendMessage(a),ot()}function lt(){if(F.currentClarifyToolCallId){let e={type:`CLARIFY_RESPONSE`,toolCallId:F.currentClarifyToolCallId,selectedOption:-1,customInput:``,additionalInfo:``};chrome.runtime.sendMessage(e)}ot()}function ut(){let e=document.getElementById(`clarifyConfirmBtn`);e&&e.addEventListener(`click`,ct);let t=document.getElementById(`clarifyCancelBtn`);t&&t.addEventListener(`click`,lt),chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.type===`SHOW_CLARIFY_DIALOG`)console.log(`[SidePanel] 收到澄清请求:`,e,`当前激活会话:`,F.activeSessionId),at(e.data),n({success:!0});else if(e.type===`PLAY_NOTIFICATION_SOUND`)console.log(`[SidePanel] 收到播放提示音请求:`,e),tt(e.soundType),n({success:!0});else if(e.type===`CLARIFY_TIMEOUT`){if(console.log(`[SidePanel] 收到澄清超时通知:`,e),e.sessionId&&F.currentClarifySessionId&&e.sessionId!==F.currentClarifySessionId){console.log(`[SidePanel] 澄清超时来自其他会话，忽略`);return}let t=document.getElementById(`clarifyTimer`),n=document.getElementById(`clarifyTimerText`);t&&n&&(t.classList.remove(`warning`),t.classList.add(`critical`),n.textContent=`已超时`),tt(`error`)}}),console.log(`[SidePanel] 澄清对话框事件已初始化`)}var dt=null;function ft(e){let{toolName:t,toolLabel:n,args:r,message:i,toolCallId:a,sessionId:o,timeout:s=3e4}=e;console.log(`[SidePanel] 显示确认对话框:`,t,e),F.currentConfirmToolCallId=a,F.currentConfirmSessionId=o||null;let c=document.getElementById(`confirmOverlay`);if(!c)return;document.getElementById(`confirmToolName`).textContent=n||t;let l=document.getElementById(`confirmArgsSummary`);if(l&&r){let e=Object.entries(r).filter(([e,t])=>t!=null&&t!==``).slice(0,5);e.length>0?(l.innerHTML=e.map(([e,t])=>`<span class="confirm-arg"><strong>${e}:</strong> ${typeof t==`string`?t.substring(0,50):JSON.stringify(t).substring(0,50)}</span>`).join(``),l.style.display=`block`):l.style.display=`none`}let u=document.getElementById(`confirmMessage`);return u&&(u.textContent=i||`模型请求执行操作: ${n||t}`),c.style.display=`flex`,new Promise(e=>{dt=e,setTimeout(()=>{dt&&(console.log(`[SidePanel] 确认对话框超时，自动拒绝`),pt(!1))},s)})}function pt(e){let t=document.getElementById(`confirmOverlay`);t&&(t.style.display=`none`),chrome.runtime.sendMessage({type:`TOOL_CONFIRMATION_RESPONSE`,toolCallId:F.currentConfirmToolCallId,confirmed:e,sessionId:F.currentConfirmSessionId}).catch(e=>{console.log(`[SidePanel] 发送确认响应失败:`,e.message)}),F.currentConfirmToolCallId=null,F.currentConfirmSessionId=null,dt&&=(dt(e),null)}function mt(){let e=document.getElementById(`confirmApproveBtn`),t=document.getElementById(`confirmDenyBtn`);e&&e.addEventListener(`click`,()=>pt(!0)),t&&t.addEventListener(`click`,()=>pt(!1)),chrome.runtime.onMessage.addListener((e,t,n)=>e.type===`SHOW_CONFIRM_DIALOG`?(ft(e.data),n({received:!0}),!1):!1)}var z=null,B=1,ht=.25,gt=2,_t=.1;function vt(e){let t=e.trim();return/^\s*<!DOCTYPE\s/i.test(t)||/^\s*<html[\s>]/i.test(t)?/<\/head>/i.test(t)?t.replace(/<\/head>/i,`<style>html,body{overflow:auto!important;height:auto!important;}</style></head>`):/<body[\s>]/i.test(t)?t.replace(/<body([\s>])/i,`<body$1<style>html,body{overflow:auto!important;height:auto!important;}</style>`):t:`<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;overflow:auto;">${t}</body>
</html>`}function yt(e){console.log(`[SidePanel] 显示 UI 原型预览:`,e),z=e,Ft();let t=document.getElementById(`prototypeTitle`),n=document.getElementById(`prototypeDescription`),r=document.getElementById(`prototypeIframe`);t&&(t.textContent=e.title||`UI 原型预览`),n&&(n.textContent=e.description||``,n.style.display=e.description?`block`:`none`),r&&e.html&&(r.srcdoc=vt(e.html));let i=document.getElementById(`prototypeOverlay`);i&&i.classList.add(`show`),console.log(`[SidePanel] UI 原型预览弹窗已显示`)}function bt(){let e=document.getElementById(`prototypeOverlay`);e&&e.classList.remove(`show`);let t=document.getElementById(`prototypeIframe`);t&&(t.srcdoc=``),z=null,console.log(`[SidePanel] UI 原型预览弹窗已隐藏`)}function xt(){if(!z)return;let e=z.id,t=z.title||`原型`;bt();let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 继续优化原型:`,e)}function St(){if(!z||!z.html){console.error(`[SidePanel] 没有可下载的原型`);return}let e=vt(z.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t),r=document.createElement(`a`);r.href=n,r.download=(z.title||`prototype`).replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)+`.html`,document.body.appendChild(r),r.click(),document.body.removeChild(r),URL.revokeObjectURL(n),console.log(`[SidePanel] 原型已下载:`,r.download)}function Ct(){if(!z||!z.html){console.error(`[SidePanel] 没有可打开的原型`);return}let e=vt(z.html),t=new Blob([e],{type:`text/html`}),n=URL.createObjectURL(t);chrome.tabs.create({url:n,active:!0}),console.log(`[SidePanel] 原型已在新标签页打开`)}async function wt(e){try{let t=await y(e);if(!t){console.error(`[SidePanel] 未找到原型:`,e);return}yt(t)}catch(e){console.error(`[SidePanel] 加载原型失败:`,e)}}async function Tt(){let e=document.getElementById(`prototypeLibraryList`),t=document.getElementById(`prototypeLibraryModal`);if(!(!e||!t)){e.innerHTML=`<div class="prototype-library-empty">加载中...</div>`;try{let t=await a();t.length===0?e.innerHTML=`<div class="prototype-library-empty">暂无原型</div>`:(e.innerHTML=t.map(e=>{let t=e.id.replace(`proto_`,``).slice(-6);return`
        <div class="prototype-library-item" data-id="${e.id}">
          <div class="prototype-library-item-info">
            <div class="prototype-library-item-title">${At(e.title)}</div>
            <div class="prototype-library-item-id">ID: ${t}</div>
            <div class="prototype-library-item-time">${jt(e.createdAt)}</div>
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
      `}).join(``),e.querySelectorAll(`.prototype-library-item`).forEach(e=>{let t=e.querySelector(`.prototype-library-item-info`),n=e.querySelector(`.prototype-library-item-open`),r=e.querySelector(`.prototype-library-item-optimize`),i=e.querySelector(`.prototype-library-item-delete`);t&&t.addEventListener(`click`,()=>{let t=e.dataset.id;wt(t),Et()}),n&&n.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.id;wt(n),Et()}),r&&r.addEventListener(`click`,t=>{t.stopPropagation();let n=r.dataset.id;Dt(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`),Et()}),i&&i.addEventListener(`click`,t=>{t.stopPropagation();let n=i.dataset.id;Ot(n,e.querySelector(`.prototype-library-item-title`)?.textContent||`原型`)})}))}catch(t){console.error(`[SidePanel] 加载原型库失败:`,t),e.innerHTML=`<div class="prototype-library-empty">加载失败</div>`}t.classList.add(`show`),console.log(`[SidePanel] 原型库已显示`)}}function Et(){let e=document.getElementById(`prototypeLibraryModal`);e&&e.classList.remove(`show`),console.log(`[SidePanel] 原型库已隐藏`)}function Dt(e,t){let n=document.getElementById(`userInput`);n&&(n.value=`请帮我优化这个UI原型界面 ${e}（${t}），`,n.focus(),n.style.height=`auto`,n.style.height=n.scrollHeight+`px`),console.log(`[SidePanel] 从原型库继续优化原型:`,e)}async function Ot(e,t){if(await kt(`确认删除`,`确定删除原型 "${t}" 吗？此操作不可撤销。`,`删除`))try{await c(e),console.log(`[SidePanel] 原型已删除:`,e),Tt()}catch(e){console.error(`[SidePanel] 删除原型失败:`,e),alert(`删除失败: `+e.message)}}function kt(e,t,n=`确认`){return new Promise(r=>{let i=document.getElementById(`genericConfirmModal`),a=document.getElementById(`genericConfirmTitle`),o=document.getElementById(`genericConfirmMessage`),s=document.getElementById(`genericConfirmOkBtn`),c=document.getElementById(`genericConfirmCancelBtn`);if(!i){r(confirm(t));return}a.textContent=e,o.textContent=t,s.textContent=n;let l=()=>{i.classList.remove(`show`),s.removeEventListener(`click`,u),c.removeEventListener(`click`,d)},u=()=>{l(),r(!0)},d=()=>{l(),r(!1)};s.addEventListener(`click`,u),c.addEventListener(`click`,d),i.classList.add(`show`)})}function At(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function jt(e){if(!e)return``;let t=new Date(e),n=new Date-t;return n<6e4?`刚刚`:n<36e5?Math.floor(n/6e4)+` 分钟前`:n<864e5?Math.floor(n/36e5)+` 小时前`:t.toLocaleDateString(`zh-CN`)}function Mt(e){B=Math.max(ht,Math.min(gt,e)),B=Math.round(B*100)/100;let t=document.getElementById(`prototypeIframe`),n=document.getElementById(`prototypeZoomLevel`);t&&(t.style.zoom=B),n&&(n.textContent=Math.round(B*100)+`%`,B===1?n.classList.remove(`zoomed`):n.classList.add(`zoomed`))}function Nt(){Mt(B+_t),It()}function Pt(){Mt(B-_t),It()}function Ft(){Mt(1)}function It(){let e=document.getElementById(`prototypeZoomLevel`);e&&(e.classList.add(`flash`),setTimeout(()=>e.classList.remove(`flash`),150))}function Lt(e){!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.deltaY<0?Nt():Pt())}function Rt(e){(e.ctrlKey||e.metaKey)&&e.key===`0`&&(e.preventDefault(),Ft())}function zt(){let e=document.getElementById(`prototypeCloseBtn`);e&&e.addEventListener(`click`,bt);let t=document.getElementById(`prototypeDownloadBtn`);t&&t.addEventListener(`click`,St);let n=document.getElementById(`prototypeOpenTabBtn`);n&&n.addEventListener(`click`,Ct);let r=document.getElementById(`prototypeContinueBtn`);r&&r.addEventListener(`click`,xt);let i=document.getElementById(`prototypeZoomInBtn`);i&&i.addEventListener(`click`,Nt);let a=document.getElementById(`prototypeZoomOutBtn`);a&&a.addEventListener(`click`,Pt);let o=document.getElementById(`prototypeZoomLevel`);o&&o.addEventListener(`click`,Ft);let s=document.getElementById(`prototypeContent`);s&&s.addEventListener(`wheel`,Lt,{passive:!1}),document.addEventListener(`keydown`,Rt);let c=document.getElementById(`prototypeLibraryCloseBtn`);c&&c.addEventListener(`click`,Et);let l=document.getElementById(`prototypeLibraryCancelBtn`);l&&l.addEventListener(`click`,Et),chrome.runtime.onMessage.addListener((e,t,n)=>{e.type===`SHOW_UI_PROTOTYPE`&&(console.log(`[SidePanel] 收到显示原型请求:`,e),wt(e.data.prototypeId),n({success:!0}))}),console.log(`[SidePanel] UI 原型模块事件已初始化`)}function Bt(e){if(!e)return``;let t=[];e=e.replace(/```mermaid\n?([\s\S]*?)```/g,(e,n)=>{let r=t.length;return t.push(n.trim()),`%%MERMAID_BLOCK_${r}%%`});let n=[];e=e.replace(/```(\w*)\n?([\s\S]*?)```/g,(e,t,r)=>{let i=n.length;return n.push({language:t||`text`,content:r.trim()}),`%%CODE_BLOCK_${i}%%`});let r=[];e=e.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(e,t,n,i)=>{let a=r.length;return r.push({header:t,separator:n,body:i,full:e.trim()}),`\n%%TABLE_BLOCK_${a}%%\n`});let i=``;return typeof marked<`u`?(marked.setOptions({breaks:!0,gfm:!0}),i=marked.parse(e)):i=e.replace(/`([^`]+)`/g,`<code>$1</code>`).replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`).replace(/\*([^*]+)\*/g,`<em>$1</em>`).replace(/\n/g,`<br>`),t.forEach((e,t)=>{i=i.replace(`%%MERMAID_BLOCK_${t}%%`,`<div class="mermaid" data-raw-code="${encodeURIComponent(e)}">${e}</div>`)}),n.forEach((e,t)=>{let n=e.content.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`);i=i.replace(`%%CODE_BLOCK_${t}%%`,`<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${t}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${e.language}">${n}</code></pre>
      </div>`)}),r.forEach((e,t)=>{i=i.replace(`%%TABLE_BLOCK_${t}%%`,Ht(e))}),i}function Vt(e){if(!e)return``;let t=e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`);return t=t.replace(/`([^`]+)`/g,`<code>$1</code>`),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/\*([^*]+)\*/g,`<em>$1</em>`),t=t.replace(/~~([^~]+)~~/g,`<del>$1</del>`),t}function Ht(e){let{header:t,body:n,full:r}=e,i=window.__tableBlocks?window.__tableBlocks.length:0;window.__tableBlocks&&(window.__tableBlocks[i]={full:r,header:t,body:n});let a=t.split(`|`).filter(e=>e.trim()).map(e=>Vt(e.trim())),o=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>Vt(e.trim()))),s=`<div class="table-container-wrapper"><table>`;return s+=`<thead><tr>`,a.forEach((e,t)=>{t===a.length-1?s+=`<th class="table-header-cell-wrapper">
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
      </th>`:s+=`<th>${e}</th>`}),s+=`</tr></thead>`,s+=`<tbody>`,o.forEach(e=>{s+=`<tr>`,e.forEach(e=>{s+=`<td>${e}</td>`}),s+=`</tr>`}),s+=`</tbody>`,s+=`</table></div>`,s}function Ut(e){try{let{header:t,body:n}=e,r=t.split(`|`).filter(e=>e.trim()).map(e=>e.trim()),i=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>e.trim())),a=`﻿`;a+=r.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`,i.forEach(e=>{a+=e.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`});let o=new Blob([a],{type:`text/csv;charset=utf-8;`}),s=document.createElement(`a`),c=URL.createObjectURL(o);s.setAttribute(`href`,c),s.setAttribute(`download`,`table-${Date.now()}.csv`),s.style.visibility=`hidden`,document.body.appendChild(s),s.click(),document.body.removeChild(s),console.log(`[SidePanel] Excel 下载成功`)}catch(e){console.error(`[SidePanel] 下载 Excel 失败:`,e),L(`下载失败: `+e.message,`error`)}}async function Wt(){if(typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}console.log(`[SidePanel] ===== renderMermaidCharts 开始 =====`);let e=document.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,e.length),e.length!==0){for(let t=0;t<e.length;t++){let n=e[t];try{await mermaid.run({nodes:[n]}),console.log(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染成功`),Kt(n)}catch(e){console.error(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染失败:`,e),!n.querySelector(`svg`)&&!n.querySelector(`.mermaid-controls`)&&(n.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${e.message}</div>`)}}console.log(`[SidePanel] ===== renderMermaidCharts 完成 =====`)}}function Gt(e){return e?`<div class="markdown-body">${Bt(e)}</div>`:``}function Kt(e){if(e.querySelector(`.mermaid-controls`)){console.log(`[SidePanel] 工具栏已存在，跳过`);return}let t=e.querySelector(`svg`);if(!t){console.warn(`[SidePanel] SVG 元素未找到，当前内容:`,e.innerHTML.substring(0,100));return}console.log(`[SidePanel] 找到 SVG 元素，开始添加工具栏`),console.log(`[SidePanel] container 类名:`,e.className),console.log(`[SidePanel] container HTML:`,e.innerHTML.substring(0,200)),e.style.position=`relative`,e.style.cursor=`grab`,e.style.userSelect=`none`,e.style.webkitUserSelect=`none`;let n=e.querySelector(`.mermaid-svg-wrapper`);if(!n){n=document.createElement(`div`),n.className=`mermaid-svg-wrapper`,n.style.transformOrigin=`center center`,n.style.transition=`transform 0.2s ease`,n.style.display=`inline-block`,n.style.width=`100%`,t.style.maxWidth=`100%`,t.style.height=`auto`,t.style.userSelect=`none`,t.style.webkitUserSelect=`none`,n.appendChild(t),e.insertBefore(n,e.firstChild);let r=[];Array.from(e.childNodes).forEach(e=>{e.nodeType===Node.TEXT_NODE&&e.textContent.trim()&&r.push(e)}),r.forEach(e=>e.remove())}let r=document.createElement(`div`);r.className=`mermaid-controls`,r.innerHTML=`
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
  `,e.appendChild(r),console.log(`[SidePanel] 工具栏 HTML 已添加`),console.log(`[SidePanel] container 子元素:`,Array.from(e.children).map(e=>e.className).join(`, `));let i=1,a=.3,o=.15,s=e.dataset.rawCode||``;if(!s){let e=t.querySelector(`title`);e&&e.textContent&&(s=e.textContent.trim())}if(!s){let e=t.querySelector(`script[type="text/plain"]`);e&&(s=e.textContent.trim())}s&&!e.dataset.rawMermaidCode&&(e.dataset.rawMermaidCode=s),r.querySelector(`.view-source`).addEventListener(`click`,r=>{r.stopPropagation();let s=e.getAttribute(`data-raw-code`);Yt(e,s?decodeURIComponent(s):e.dataset.rawMermaidCode||``,n,t,i,{MIN_SCALE:a,MAX_SCALE:10,SCALE_STEP:o})}),r.querySelector(`.copy-to-clipboard`).addEventListener(`click`,e=>{e.stopPropagation(),qt(t,n,i)}),r.querySelector(`.download-png`).addEventListener(`click`,e=>{e.stopPropagation(),Jt(t,i)}),e.addEventListener(`wheel`,e=>{!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.stopPropagation(),i=e.deltaY<0?Math.min(10,i+o):Math.max(a,i-o),p())},{passive:!1});let c=!1,l,u,d=0,f=0;function p(){n.style.transform=`translate(${d}px, ${f}px) scale(${i})`}r.querySelector(`.zoom-in`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.min(10,i+o),p()}),r.querySelector(`.zoom-out`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.max(a,i-o),p()}),r.querySelector(`.reset-zoom`).addEventListener(`click`,e=>{e.stopPropagation(),i=1,d=0,f=0,p()}),e.addEventListener(`mousedown`,t=>{t.target.tagName!==`BUTTON`&&(c=!0,l=t.clientX-d,u=t.clientY-f,e.style.cursor=`grabbing`)}),document.addEventListener(`mousemove`,e=>{c&&(d=e.clientX-l,f=e.clientY-u,p())}),document.addEventListener(`mouseup`,()=>{c&&(c=!1,e.style.cursor=`grab`)})}async function qt(e,t,n){try{console.log(`[SidePanel] 开始复制到剪贴板`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){if(e)if(navigator.clipboard&&typeof ClipboardItem<`u`)navigator.clipboard.write([new ClipboardItem({"image/png":e})]).then(()=>{console.log(`[SidePanel] 图片复制到剪贴板成功`),L(`Mermaid 图表已复制到剪贴板！`,`success`)}).catch(e=>{console.error(`[SidePanel] 复制到剪贴板失败:`,e),L(`复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。`,`error`)});else{console.warn(`[SidePanel] Clipboard API 不可用，降级为下载`),L(`当前浏览器不支持图片复制功能，已自动转为下载。`,`warning`);let t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(t),t.click(),document.body.removeChild(t)}},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] 图片转换失败:`,e),L(`图片转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 复制到剪贴板失败:`,e),L(`复制失败: `+e.message,`error`)}}function Jt(e,t){try{console.log(`[SidePanel] 开始下载 PNG`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){console.log(`[SidePanel] SVG 图片加载成功`);let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){let t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t),console.log(`[SidePanel] PNG 下载成功`)},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] PNG 转换失败:`,e),L(`PNG 转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 下载 PNG 失败:`,e),L(`下载失败: `+e.message,`error`)}}function Yt(e,t,n,r,i,a){let o=e.querySelector(`.mermaid-source-view`),s=e.querySelector(`.mermaid-controls`);if(o)o.parentElement&&o.parentElement.remove(),n&&(n.style.display=`inline-block`),Kt(e);else{n&&(n.style.display=`none`),s&&s.remove();let o=document.createElement(`div`);o.className=`mermaid-container-wrapper`,o.style.position=`relative`;let c=document.createElement(`pre`);c.className=`mermaid-source-view`,c.style.position=`relative`,c.textContent=t;let l=document.createElement(`button`);l.className=`source-copy-btn`,l.title=`复制源代码`,l.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `,l.addEventListener(`click`,e=>{e.stopPropagation(),Be(t,l)});let u=document.createElement(`button`);u.className=`source-copy-btn`,u.style.right=`44px`,u.title=`返回图表`,u.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `,u.addEventListener(`click`,o=>{o.stopPropagation(),Yt(e,t,n,r,i,a)}),c.appendChild(l),c.appendChild(u),o.appendChild(c),e.appendChild(o)}}async function Xt(e){if(console.log(`[SidePanel] ===== renderMessageMermaid 开始 =====`),typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}await new Promise(e=>setTimeout(e,300));let t=e.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,t.length),t.length===0){console.log(`[SidePanel] 未找到 mermaid 元素`);return}try{for(let n=0;n<t.length;n++){let r=t[n];try{await mermaid.run({nodes:[r]}),console.log(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染成功`);let t=e.querySelectorAll(`.mermaid`)[n];t&&Kt(t)}catch(t){console.error(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染失败:`,t);let r=e.querySelectorAll(`.mermaid`)[n];r&&!r.querySelector(`svg`)&&!r.querySelector(`.mermaid-controls`)&&(r.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${t.message}</div>`)}}console.log(`[SidePanel] Mermaid 渲染完成`);let n=e.querySelectorAll(`.mermaid-controls`);console.log(`[SidePanel] 工具栏添加结果:`,n.length,`个成功`)}catch(e){console.error(`[SidePanel] Mermaid 渲染整体失败:`,e)}$t()}var Zt=!1;function Qt(){if(Zt)return;Zt=!0;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{if(!e.ctrlKey&&!e.metaKey)return;let t=e.target.closest(`code`);if(!t||e.target.closest(`.code-copy-btn`))return;e.preventDefault();let n=t.textContent;n&&navigator.clipboard.writeText(n).then(()=>{L(`${t.closest(`.code-block-container`)?`代码块`:`代码`}已复制到剪贴板`,`success`)}).catch(e=>{console.error(`[SidePanel] Ctrl+单击复制失败:`,e);let t=document.createElement(`textarea`);t.value=n,t.style.position=`fixed`,t.style.left=`-999999px`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),document.body.removeChild(t),L(`代码已复制到剪贴板`,`success`)})}),console.log(`[SidePanel] Ctrl+单击复制代码事件已绑定`))}function $t(){let e=document.querySelectorAll(`.code-copy-btn`);console.log(`[SidePanel] 找到代码复制按钮数量:`,e.length),e.forEach((e,t)=>{if(e.dataset.bound){console.log(`[SidePanel] 按钮`,t,`已绑定，跳过`);return}e.dataset.bound=`true`,e.addEventListener(`click`,t=>{console.log(`[SidePanel] 代码复制按钮被点击`),t.stopPropagation();let n=e.closest(`.code-block-container`);if(console.log(`[SidePanel] 找到容器:`,!!n),n){let t=n.querySelector(`pre code`);if(console.log(`[SidePanel] 找到代码元素:`,!!t),t){let n=t.textContent;console.log(`[SidePanel] 代码长度:`,n.length),Be(n,e)}}}),console.log(`[SidePanel] 已绑定按钮`,t)}),Qt(),en()}function en(){document.querySelectorAll(`.copy-md-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&Be(r.full,e)}))}),document.querySelectorAll(`.download-excel-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&Ut(r)}))})}var tn=!1;async function nn(){tn||=(await m(),!0)}async function rn(){await nn();let[e,t]=await Promise.all([l(),d()]);return e.sort((e,t)=>e.order!==void 0&&t.order!==void 0?e.order-t.order:e.order===void 0?t.order===void 0?new Date(e.createdAt)-new Date(t.createdAt):1:-1),{activeSessionId:t,list:e}}function an(e){return typeof e==`string`?e:Array.isArray(e)?e.filter(e=>e.type===`text`).map(e=>e.text).join(``):``}async function on(){if(!F.activeSessionId)return!1;let e=await _(F.activeSessionId);if(!e)return!1;e.model=F.currentModel,e.useTools=F.useTools,e.enabledTools=[...F.enabledTools],e.temperature=F.temperature,e.topP=F.topP;let t=F.chatConfig.maxHistoryMessages||50;e.messageHistory=F.messageHistory.slice(-t).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1})),e.updatedAt=new Date().toISOString();let n=F.messageHistory.find(e=>e.role===`user`);return n&&(e.title=an(n.content).substring(0,50).replace(/\n/g,` `)),await v(e),!0}async function sn(){await nn();let e=un(),t={id:e,title:`新会话`,model:F.currentModel,useTools:F.useTools,enabledTools:[...F.enabledTools],temperature:F.temperature,topP:F.topP,messageHistory:[],scrollPosition:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),order:Date.now(),isGenerating:!1,lastExecutionLog:[]};return await v(t),await r(e),t}async function cn(e){await nn();let t=[];for(let n of e){let e={id:un(),title:n.title||`导入的会话`,model:n.model||F.currentModel,useTools:n.useTools===void 0?!0:n.useTools,enabledTools:n.enabledTools||[...F.enabledTools],temperature:n.temperature===void 0?F.temperature:n.temperature,topP:n.topP===void 0?F.topP:n.topP,messageHistory:(n.messageHistory||[]).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1})),scrollPosition:0,createdAt:n.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),order:Date.now()+t.length,isGenerating:!1,lastExecutionLog:[]};await v(e),t.push(e)}return!await d()&&t.length>0&&await r(t[0].id),t}async function ln(e,t){let n=await _(e);return n?(n.messageHistory=n.messageHistory||[],n.messageHistory.push({role:t.role,content:t.content||``,executionLog:t.executionLog||[],reflectionScore:t.reflectionScore,wasRevised:t.wasRevised||!1}),n.updatedAt=new Date().toISOString(),n.isGenerating=!1,await v(n),!0):!1}function un(){return`sess_`+Date.now().toString(36)+`_`+Math.random().toString(36).substring(2,8)}async function dn(t){if(t===F.activeSessionId)return;await on();let n=await _(t);if(!n)return console.error(`[SessionStore] 找不到会话:`,t),!1;if(await r(t),F.activeSessionId=t,F.messageHistory=n.messageHistory||[],F.currentModel=n.model||F.currentModel,F.useTools=n.useTools===void 0?F.useTools:n.useTools,n.enabledTools&&n.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),r=n.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);F.enabledTools=[...r,...i]}else F.enabledTools=n.enabledTools||F.enabledTools;return F.temperature=n.temperature===void 0?F.temperature:n.temperature,F.topP=n.topP===void 0?F.topP:n.topP,n.isGenerating?F.generatingSessionIds.add(t):F.generatingSessionIds.delete(t),n}async function fn(e){let t=await l(),n=await d();if(await s(e),n===e){let n=t.filter(t=>t.id!==e);n.length>0?await r(n[0].id):await r(null)}return!0}async function pn(e,t){let n=await _(e);return n?(n.title=t,n.updatedAt=new Date().toISOString(),await v(n),!0):!1}async function mn(e){let t=await l(),n=new Map(t.map(e=>[e.id,e])),r=[];return e.forEach((e,t)=>{let i=n.get(e);i&&(i.order=t,r.push(v(i)))}),await Promise.all(r),!0}async function hn(){if(!F.messageHistory||F.messageHistory.length===0)return;let e=await _(F.activeSessionId);if(!e)return;let t=F.messageHistory.find(e=>e.role===`user`),r=t?an(t.content).substring(0,50).replace(/\n/g,` `):e.title||`未命名会话`,i=Date.now().toString(36)+Math.random().toString(36).substring(2,8),a=F.messageHistory.map(e=>({role:e.role,content:e.content||``})),o=await u();o.push({id:i,title:r,createdAt:new Date().toISOString(),messages:a}),o.length>20&&o.splice(0,o.length-20),await n(o);let s=await sn();return await fn(e.id),await dn(s.id),!0}async function V(){return rn()}async function gn(){return on()}async function _n(){return sn()}async function vn(e){return dn(e)}async function yn(e){return fn(e)}async function bn(e,t){return pn(e,t)}async function xn(e){return mn(e)}async function Sn(){return hn()}async function Cn(e){return cn(e)}async function wn(e,t){return ln(e,t)}var H={visible:!1,highlightIndex:-1,filteredSessions:[]},U={draggedId:null,sourceType:null};async function W(){let e=await V();F.sessions=e.list,F.activeSessionId=e.activeSessionId;let t=document.getElementById(`sessionTabs`),n=document.getElementById(`sessionTabsScroll`),r=document.getElementById(`sessionTabsActions`);!t||!n||!r||(n.innerHTML=``,e.list.forEach(e=>{let t=document.createElement(`div`);t.className=`session-tab`,t.dataset.sessionId=e.id,e.id===F.activeSessionId&&t.classList.add(`active`),t.title=e.title;let r=document.createElement(`span`);r.className=`session-tab-title`,r.textContent=e.title||`新会话`,t.appendChild(r);let i=document.createElement(`span`);if(i.className=`session-tab-close`,i.innerHTML=`&#10005;`,i.title=`关闭会话`,i.addEventListener(`click`,async t=>{t.stopPropagation(),or(e,async()=>{let e=await V();F.activeSessionId=e.activeSessionId,F.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t?F.messageHistory=t.messageHistory||[]:F.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`)),W()})}),t.appendChild(i),e.isGenerating||F.generatingSessionIds.has(e.id)){let e=document.createElement(`span`);e.className=`session-tab-indicator`,t.appendChild(e)}t.addEventListener(`click`,async t=>{t.preventDefault(),e.id!==F.activeSessionId&&await tr(e.id)}),t.addEventListener(`contextmenu`,t=>{t.preventDefault(),sr(t,e)}),t.draggable=!0,t.addEventListener(`dragstart`,t=>jn(t,e.id)),t.addEventListener(`dragover`,e=>Mn(e)),t.addEventListener(`dragleave`,e=>Nn(e)),t.addEventListener(`drop`,t=>Pn(t,e.id)),t.addEventListener(`dragend`,e=>Fn(e)),n.appendChild(t)}),Tn(),En(),Zn(),ir(n),Dn(n),An(n))}function Tn(){let e=document.getElementById(`sessionTabsMore`);if(!e)return;let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`click`,e=>{e.stopPropagation(),Vn()})}function En(){let e=document.getElementById(`sessionTabsAdd`);if(!e)return;let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`click`,async()=>{await gn();let e=await _n();F.activeSessionId=e.id,F.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:e.id}})),W()})}function Dn(e){let t=document.getElementById(`sessionTabsMore`);t&&(e.scrollWidth>e.clientWidth?t.style.display=`flex`:t.style.display=`none`)}var On=null;function kn(){if(On)return;let e=document.getElementById(`sessionTabsScroll`);e&&(On=new ResizeObserver(()=>{requestAnimationFrame(()=>{Dn(e)})}),On.observe(e))}function An(e){setTimeout(()=>{let t=e.querySelector(`.session-tab.active`);t&&t.scrollIntoView({behavior:`smooth`,block:`nearest`,inline:`center`})},50)}function jn(e,t){U.draggedId=t,U.sourceType=`tab`,e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,t),e.currentTarget.classList.add(`dragging`)}function Mn(e){e.preventDefault(),e.dataTransfer.dropEffect=`move`,e.currentTarget.classList.add(`drag-over`)}function Nn(e){e.currentTarget.classList.remove(`drag-over`)}async function Pn(e,t){e.preventDefault(),e.currentTarget.classList.remove(`drag-over`);let n=U.draggedId;if(!n||n===t)return;let r=F.sessions||[],i=r.findIndex(e=>e.id===n),a=r.findIndex(e=>e.id===t);if(i===-1||a===-1)return;let o=[...r],[s]=o.splice(i,1);o.splice(a,0,s),F.sessions=o,await xn(o.map(e=>e.id)),W()}function Fn(e){e.currentTarget.classList.remove(`dragging`),document.querySelectorAll(`.session-tab.drag-over`).forEach(e=>e.classList.remove(`drag-over`)),U.draggedId=null,U.sourceType=null}function In(e,t){U.draggedId=t,U.sourceType=`dropdown`,e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,t),e.currentTarget.classList.add(`dragging`)}function Ln(e){e.preventDefault(),e.dataTransfer.dropEffect=`move`,e.currentTarget.classList.add(`drag-over`)}function Rn(e){e.currentTarget.classList.remove(`drag-over`)}async function zn(e,t){e.preventDefault(),e.currentTarget.classList.remove(`drag-over`);let n=U.draggedId;if(!n||n===t)return;let r=H.filteredSessions,i=r.findIndex(e=>e.id===n),a=r.findIndex(e=>e.id===t);if(i===-1||a===-1)return;let o=[...r],[s]=o.splice(i,1);o.splice(a,0,s),H.filteredSessions=o;let c=F.sessions||[],l=c.map(e=>e.id),u=new Set(o.map(e=>e.id)),d=l.filter(e=>!u.has(e)),f=[...o.map(e=>e.id),...d];F.sessions=f.map(e=>c.find(t=>t.id===e)).filter(Boolean),await xn(f),Kn(),W()}function Bn(e){e.currentTarget.classList.remove(`dragging`),document.querySelectorAll(`.session-dropdown-item.drag-over`).forEach(e=>e.classList.remove(`drag-over`)),U.draggedId=null,U.sourceType=null}function Vn(){H.visible?Un():Hn()}async function Hn(){let e=document.getElementById(`sessionTabsMore`),t=document.getElementById(`sessionDropdown`);if(!e||!t)return;let n=await V();F.sessions=n.list,F.activeSessionId=n.activeSessionId,H.filteredSessions=[...n.list],H.highlightIndex=-1,H.visible=!0,Kn(),Gn(e,t);let r=document.getElementById(`sessionDropdownSearch`);r&&(r.value=``,setTimeout(()=>r.focus(),50)),e.classList.add(`active`),setTimeout(()=>{document.addEventListener(`click`,Wn)},0)}function Un(){let e=document.getElementById(`sessionTabsMore`),t=document.getElementById(`sessionDropdown`);t&&t.classList.remove(`show`),e&&e.classList.remove(`active`),H.visible=!1,H.highlightIndex=-1,H.filteredSessions=[],document.removeEventListener(`click`,Wn)}function Wn(e){let t=document.getElementById(`sessionDropdown`),n=document.getElementById(`sessionTabsMore`);!t||!n||!t.contains(e.target)&&e.target!==n&&!n.contains(e.target)&&Un()}function Gn(e,t){t.classList.add(`show`);let n=e.getBoundingClientRect(),r=n.bottom+4,i=n.right-240;r+360>window.innerHeight-8&&(r=n.top-360-4,r<8&&(r=8)),i<8&&(i=8),t.style.top=r+`px`,t.style.left=i+`px`}function Kn(){let e=document.getElementById(`sessionDropdownList`);if(e){if(e.innerHTML=``,H.filteredSessions.length===0){let t=document.createElement(`div`);t.className=`session-dropdown-empty`,t.textContent=`无匹配会话`,e.appendChild(t);return}H.filteredSessions.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`session-dropdown-item`,r.dataset.sessionId=t.id,r.dataset.index=n,t.id===F.activeSessionId&&r.classList.add(`active`),n===H.highlightIndex&&r.classList.add(`highlighted`);let i=document.createElement(`span`);i.className=`session-dropdown-item-title`,i.textContent=t.title||`新会话`,r.appendChild(i);let a=document.createElement(`span`);a.className=`session-dropdown-item-close`,a.innerHTML=`&#10005;`,a.title=`关闭会话`,a.addEventListener(`click`,async e=>{e.stopPropagation(),e.preventDefault(),await Yn(t.id)}),r.appendChild(a),r.addEventListener(`click`,async e=>{e.preventDefault(),await Jn(t.id)}),r.draggable=!0,r.addEventListener(`dragstart`,e=>In(e,t.id)),r.addEventListener(`dragover`,e=>Ln(e)),r.addEventListener(`dragleave`,e=>Rn(e)),r.addEventListener(`drop`,e=>zn(e,t.id)),r.addEventListener(`dragend`,e=>Bn(e)),e.appendChild(r)})}}function qn(e){let t=F.sessions||[];if(!e.trim())H.filteredSessions=[...t];else{let n=e.trim().toLowerCase();H.filteredSessions=t.filter(e=>(e.title||`新会话`).toLowerCase().includes(n))}H.highlightIndex=-1,Kn()}async function Jn(e){Un(),e!==F.activeSessionId&&await tr(e)}async function Yn(e){await yn(e);let t=await V();F.sessions=t.list,F.activeSessionId=t.activeSessionId;let n=document.getElementById(`sessionDropdownSearch`),r=n?n.value:``,i=F.sessions||[];if(!r.trim())H.filteredSessions=[...i];else{let e=r.trim().toLowerCase();H.filteredSessions=i.filter(t=>(t.title||`新会话`).toLowerCase().includes(e))}H.highlightIndex=Math.min(H.highlightIndex,H.filteredSessions.length-1),Kn();let a=i.find(e=>e.id===F.activeSessionId);a?F.messageHistory=a.messageHistory||[]:F.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`)),W()}async function Xn(){let e=F.sessions||[];if(e.length===0)return;if(Un(),!await er(`确定要关闭全部 ${e.length} 个会话吗？此操作不可撤销。`,`关闭全部会话`)){Hn();return}for(let t of e)await yn(t.id);let t=await V();F.sessions=t.list,F.activeSessionId=t.activeSessionId;let n=t.list.find(e=>e.id===t.activeSessionId);F.messageHistory=n&&n.messageHistory||[],document.dispatchEvent(new CustomEvent(`session-switched`)),W()}function Zn(){let e=document.getElementById(`sessionDropdownSearch`),t=document.getElementById(`sessionDropdownCloseAll`),n=document.getElementById(`sessionDropdown`);if(n){if(e){let t=e.cloneNode(!0);e.parentNode.replaceChild(t,e),t.addEventListener(`input`,e=>{qn(e.target.value)}),t.addEventListener(`keydown`,e=>{Qn(e)})}if(t){let e=t.cloneNode(!0);t.parentNode.replaceChild(e,t),e.addEventListener(`click`,async e=>{e.stopPropagation(),await Xn()})}n.addEventListener(`click`,e=>{e.stopPropagation()})}}function Qn(e){if(!H.visible)return;let t=H.filteredSessions.length;if(t===0){e.key===`Escape`&&Un();return}switch(e.key){case`ArrowDown`:e.preventDefault(),H.highlightIndex=Math.min(H.highlightIndex+1,t-1),Kn(),$n();break;case`ArrowUp`:e.preventDefault(),H.highlightIndex=Math.max(H.highlightIndex-1,0),Kn(),$n();break;case`Enter`:if(e.preventDefault(),H.highlightIndex>=0&&H.highlightIndex<t){let e=H.filteredSessions[H.highlightIndex];Jn(e.id)}break;case`Escape`:e.preventDefault(),Un();break}}function $n(){let e=document.querySelector(`.session-dropdown-item.highlighted`);e&&e.scrollIntoView({block:`nearest`})}function er(e,t){return new Promise(t=>{let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r){t(!1);return}r.textContent=e;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=()=>{s(),t(!0)},l=()=>{s(),t(!1)};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)})}async function tr(t){if(await gn(),!await vn(t))return;let n=await V();F.sessions=n.list,F.activeSessionId=t;let r=n.list.find(e=>e.id===t);if(r){if(F.messageHistory=r.messageHistory||[],F.currentModel=r.model||F.currentModel,F.useTools=r.useTools===void 0?F.useTools:r.useTools,r.enabledTools&&r.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),n=r.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!n.includes(e.id)).map(e=>e.id);F.enabledTools=[...n,...i]}else F.enabledTools=r.enabledTools||F.enabledTools;F.temperature=r.temperature===void 0?F.temperature:r.temperature,F.topP=r.topP===void 0?F.topP:r.topP}document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:t}})),W(),nr()}function nr(){let e=document.querySelector(`.model-display`);e&&F.currentModel&&(e.textContent=F.currentModel);let t=document.getElementById(`enableToolsBtn`);t&&(t.checked=F.useTools);let n=document.getElementById(`tempIconValue`);n&&F.temperature!==void 0&&(n.textContent=F.temperature.toFixed(2))}var rr=new WeakSet;function ir(e){rr.has(e)||(rr.add(e),e.addEventListener(`wheel`,t=>{e.scrollWidth<=e.clientWidth||(t.preventDefault(),e.scrollLeft+=t.deltaY)},{passive:!1}))}function ar(e){let t=document.getElementById(`sessionRenameModal`),n=document.getElementById(`sessionRenameInput`),r=document.getElementById(`sessionRenameConfirmBtn`),i=document.getElementById(`sessionRenameCancelBtn`),a=document.getElementById(`sessionRenameCloseBtn`);if(!t||!n)return;n.value=e.title,n.focus(),n.select();let o=()=>{t.classList.remove(`show`),r.removeEventListener(`click`,s),i.removeEventListener(`click`,c),a.removeEventListener(`click`,c)},s=()=>{let t=n.value.trim();t&&t!==e.title&&bn(e.id,t).then(()=>{W()}),o()},c=()=>{o()};r.addEventListener(`click`,s),i.addEventListener(`click`,c),a.addEventListener(`click`,c),n.onkeydown=e=>{e.key===`Enter`?s():e.key===`Escape`&&c()},t.classList.add(`show`)}function or(e,t){let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r)return;r.textContent=`确定要删除会话"${e.title}"吗？此操作不可撤销。`;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=async()=>{await yn(e.id),t&&await t(),s()},l=()=>{s()};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)}function sr(e,t){let n=document.querySelector(`.session-context-menu`);n&&n.remove();let r=document.createElement(`div`);r.className=`session-context-menu`,r.style.left=e.clientX+`px`,r.style.top=e.clientY+`px`;let i=cr(`重命名`,()=>{r.remove(),ar(t)});r.appendChild(i);let a=cr(`删除`,()=>{r.remove(),or(t,async()=>{let e=await V();F.activeSessionId=e.activeSessionId,F.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t?F.messageHistory=t.messageHistory||[]:F.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`)),W()})},`danger`);r.appendChild(a),document.body.appendChild(r);let o=e=>{r.contains(e.target)||(r.remove(),document.removeEventListener(`click`,o))};setTimeout(()=>document.addEventListener(`click`,o),0)}function cr(e,t,n=``){let r=document.createElement(`div`);return r.className=`session-context-menu-item `+n,r.textContent=e,r.addEventListener(`click`,t),r}document.readyState===`loading`?document.addEventListener(`DOMContentLoaded`,kn):kn();var lr=`pendingCallApiSessions`;function ur(){chrome.storage.session.set({[lr]:[...F.pendingCallApiSessionIds]}).catch(()=>{})}async function dr(){try{let e=await chrome.storage.session.get([lr]);e[lr]&&Array.isArray(e[lr])&&(F.pendingCallApiSessionIds=new Set(e[lr]))}catch{}}function fr(e){if(Array.isArray(e))return e.filter(e=>e.type===`text`).map(e=>e.text).join(``);if(typeof e==`string`&&e.startsWith(`[`))try{let t=JSON.parse(e);if(Array.isArray(t))return t.filter(e=>e.type===`text`).map(e=>e.text).join(``)}catch{}return e}function pr(e){let t=fr(e);F.quotedContextText=t;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let e;e=t.length>100?t.substring(0,100)+`...`:t.length>50?t.substring(0,50)+`...`:t,r.textContent=`💬 已引用: ${e}`,n.classList.add(`show`)}}function mr(){console.log(`[SidePanel] 清除选中内容上下文`),F.selectedContextText=``,F.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=e.findIndex(e=>e.startsWith(`[用户问题]`));n===-1?t.value=``:t.value=e.slice(n+1).join(`
`).trim()}}async function hr(){let t=await V();if(t.activeSessionId&&t.list.length>0){F.activeSessionId=t.activeSessionId,F.sessions=t.list;let n=t.list.find(e=>e.id===t.activeSessionId);if(n){if(F.messageHistory=n.messageHistory||[],F.currentModel=n.model||F.currentModel,F.useTools=n.useTools===void 0?F.useTools:n.useTools,n.enabledTools&&n.enabledTools.length>0){let t=new Set(e.map(e=>e.id)),r=n.enabledTools.filter(e=>t.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);F.enabledTools=[...r,...i]}else F.enabledTools=n.enabledTools||F.enabledTools;F.temperature=n.temperature===void 0?F.temperature:n.temperature,F.topP=n.topP===void 0?F.topP:n.topP}F.messageHistory.forEach(e=>{let t=e.wasRevised;if(!t&&e.executionLog)try{t=(typeof e.executionLog==`string`?JSON.parse(e.executionLog):e.executionLog).some(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.action?.decision===`revised`)}catch{}Z(e.role,e.content,!1,e.executionLog||[],e.reflectionScore,t)});let r=document.querySelector(`.welcome-message`);r&&F.messageHistory.length>0&&r.remove(),Wt();let i=`scrollPosition_`+(F.activeSessionId||`default`);chrome.storage.local.get([i],e=>{e[i]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t.scrollTop=e[i]},100)}),W()}else{await _n();let e=await V();e.activeSessionId&&(F.activeSessionId=e.activeSessionId,F.sessions=e.list),W()}}function G(){try{gn().catch(e=>{console.error(`[SidePanel] 保存当前会话失败:`,e)})}catch(e){console.error(`[SidePanel] 保存对话历史异常:`,e)}}function gr(){F.messageHistory&&F.messageHistory.length>0&&Sn().then(()=>{F.messageHistory=[];let e=document.getElementById(`chatContainer`);if(e){e.innerHTML=``;let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
          <div class="icon-wrapper">
            <div class="icon">💬</div>
          </div>
          <h2>开始对话</h2>
          <p>输入您的问题，AI 助手将为您解答</p>
        `,e.appendChild(t)}chrome.storage.local.remove(`scrollPosition_`+(F.activeSessionId||`default`)),W()})}async function _r(){let e=document.getElementById(`exportSessionsModal`),t=document.getElementById(`exportSessionsList`);if(!(!e||!t)){t.innerHTML=`<div class="export-sessions-empty">加载中...</div>`;try{let{list:e,activeSessionId:n}=await V();if(e.length===0)t.innerHTML=`<div class="export-sessions-empty">暂无会话可导出</div>`;else{let r=n||F.activeSessionId;t.innerHTML=e.map((e,t)=>{let n=e.id===r,i=(e.messageHistory||[]).length,a=e.createdAt?new Date(e.createdAt).toLocaleDateString(`zh-CN`):``;return`
        <div class="export-session-item" data-id="${e.id}">
          <input type="checkbox" class="export-session-checkbox" data-session-id="${e.id}" ${n?`checked`:``}>
          <div class="export-session-info">
            <div class="export-session-title">${R(e.title||`未命名会话`)}${n?`<span class="current-badge">当前</span>`:``}</div>
            <div class="export-session-meta">${i} 条消息${a?` · `+a:``}</div>
          </div>
        </div>`}).join(``),t.querySelectorAll(`.export-session-item`).forEach(e=>{let t=e.querySelector(`.export-session-checkbox`);e.addEventListener(`click`,e=>{e.target!==t&&(t.checked=!t.checked),vr()})});let i=document.getElementById(`exportSelectAllBtn`),a=document.getElementById(`exportDeselectAllBtn`),o=document.getElementById(`exportSelectCurrentBtn`);i&&(i.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=!0}),vr()}),a&&(a.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=!1}),vr()}),o&&(o.onclick=()=>{t.querySelectorAll(`.export-session-checkbox`).forEach(e=>{e.checked=e.dataset.sessionId===r}),vr()}),vr()}}catch(e){console.error(`[SidePanel] 加载会话列表失败:`,e),t.innerHTML=`<div class="export-sessions-empty">加载失败</div>`}e.classList.add(`show`)}}function vr(){document.querySelectorAll(`#exportSessionsList .export-session-checkbox`);let e=document.querySelectorAll(`#exportSessionsList .export-session-checkbox:checked`),t=document.getElementById(`exportSelectedCount`);t&&(t.textContent=`已选 ${e.length} 个`);let n=document.getElementById(`exportSessionsOkBtn`);n&&(n.textContent=`导出选中 (${e.length})`,n.disabled=e.length===0,n.style.opacity=e.length===0?`0.5`:`1`)}function yr(){let e=document.getElementById(`exportSessionsModal`);e&&e.classList.remove(`show`)}async function br(){let e=document.querySelectorAll(`#exportSessionsList .export-session-checkbox:checked`),t=Array.from(e).map(e=>e.dataset.sessionId);if(t.length===0){L(`请至少选择一个会话`,`warning`);return}try{let{list:e}=await V(),n=e.filter(e=>t.includes(e.id)),r={version:1,exportedAt:new Date().toISOString(),sessions:n.map(e=>({title:e.title||`未命名会话`,model:e.model,useTools:e.useTools,enabledTools:e.enabledTools,temperature:e.temperature,topP:e.topP,createdAt:e.createdAt,messageHistory:(e.messageHistory||[]).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[],reflectionScore:e.reflectionScore,wasRevised:e.wasRevised||!1}))}))},i=new Date,a=i.getFullYear()+String(i.getMonth()+1).padStart(2,`0`)+String(i.getDate()).padStart(2,`0`)+`-`+String(i.getHours()).padStart(2,`0`)+String(i.getMinutes()).padStart(2,`0`)+String(i.getSeconds()).padStart(2,`0`),o=n.length,s=o===1?`ai-helper-${n[0].title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g,`_`)}-${a}.aihelper.json`:`ai-helper-${o}sessions-${a}.aihelper.json`,c=JSON.stringify(r,null,2),l=new Blob([c],{type:`application/json;charset=utf-8;`}),u=URL.createObjectURL(l),d=document.createElement(`a`);d.href=u,d.download=s,document.body.appendChild(d),d.click(),document.body.removeChild(d),URL.revokeObjectURL(u),yr(),console.log(`[SidePanel] 会话已导出:`,s,`共`,o,`个会话`),L(`已导出 ${o} 个会话`,`success`)}catch(e){console.error(`[SidePanel] 导出失败:`,e),L(`导出失败: `+e.message,`error`)}}function xr(){let e=document.getElementById(`exportSessionsCloseBtn`),t=document.getElementById(`exportSessionsCancelBtn`),n=document.getElementById(`exportSessionsOkBtn`),r=document.getElementById(`exportSessionsModal`);e&&e.addEventListener(`click`,yr),t&&t.addEventListener(`click`,yr),n&&n.addEventListener(`click`,br),r&&r.addEventListener(`click`,e=>{e.target===r&&yr()})}function Sr(){let e=document.getElementById(`importSessionsFile`);e&&(e.value=``,e.click())}async function Cr(e){try{let t=await e.text(),n=JSON.parse(t),r=[];if(n.version&&n.sessions&&Array.isArray(n.sessions))r=n.sessions;else if(Array.isArray(n))r=n.length>0&&n[0].role?[{title:`导入的对话`,messageHistory:n.map(e=>({role:e.role||`user`,content:e.content||``}))}]:(n.length>0&&n[0].title,n);else throw Error(`无法识别的文件格式`);if(r.length===0){L(`文件中没有可导入的会话数据`,`warning`);return}let i=await Cn(r);await W(),console.log(`[SidePanel] 导入完成:`,i.length,`个会话`),L(`成功导入 ${i.length} 个会话`,`success`)}catch(e){console.error(`[SidePanel] 导入失败:`,e),L(`导入失败: `+e.message,`error`)}}function wr(){document.getElementById(`confirmModal`).classList.add(`show`)}function Tr(){document.getElementById(`confirmModal`).classList.remove(`show`)}var K=1,q=0,J=0,Er=!1,Dr=0,Or=0,kr=0,Ar=0,Y=[],X=0;function jr(){let e=document.getElementById(`imagePreviewLarge`);e&&(e.style.transform=`translate(${q}px, ${J}px) scale(${K})`,K>1?(e.classList.add(`zoomable`),Er?e.classList.add(`dragging`):e.classList.remove(`dragging`)):e.classList.remove(`zoomable`,`dragging`))}function Mr(){K=1,q=0,J=0,Er=!1,jr()}function Nr(e,t){let n=document.getElementById(`imagePreviewOverlay`),r=document.getElementById(`imagePreviewLarge`);!n||!r||(Pr(e,t),Fr(),Lr(e),n.classList.add(`show`))}function Pr(e,t){Y=[],t&&(t.closest(`.image-preview-bar`)||t.classList.contains(`image-preview-thumb`)?document.querySelectorAll(`.image-preview-thumb`).forEach(e=>{e.src&&Y.push(e.src)}):t.closest(`.user-message-images`)&&t.closest(`.user-message-images`).querySelectorAll(`.user-message-image`).forEach(e=>{e.src&&Y.push(e.src)})),Y.length===0&&document.querySelectorAll(`.image-preview-thumb, .user-message-image`).forEach(e=>{e.src&&Y.push(e.src)}),X=Y.indexOf(e),X===-1&&(Y.push(e),X=Y.length-1)}function Fr(){let e=document.getElementById(`imagePreviewPrev`),t=document.getElementById(`imagePreviewNext`),n=document.getElementById(`imagePreviewCounter`);Y.length<=1?(e&&(e.style.display=`none`),t&&(t.style.display=`none`),n&&(n.style.display=`none`)):(e&&(e.style.display=``),t&&(t.style.display=``),n&&(n.style.display=``),Ir())}function Ir(){let e=document.getElementById(`imagePreviewPrev`),t=document.getElementById(`imagePreviewNext`),n=document.getElementById(`imagePreviewCounter`);e&&(e.disabled=!1),t&&(t.disabled=!1),n&&(n.textContent=`${X+1} / ${Y.length}`)}function Lr(e){let t=document.getElementById(`imagePreviewLarge`);t&&(Mr(),t.src=e)}function Rr(e){let t=Y.length;t!==0&&(X=(X+e+t)%t,Lr(Y[X]),Ir())}function zr(){let e=document.getElementById(`imagePreviewOverlay`);if(!e||e.dataset.initialized)return;e.dataset.initialized=`true`;let t=document.getElementById(`imagePreviewLarge`),n=()=>{e.classList.remove(`show`),Mr()};e.addEventListener(`click`,t=>{t.target===e&&n()});let r=e.querySelector(`.image-preview-close`);r&&r.addEventListener(`click`,n);let i=document.getElementById(`imagePreviewPrev`),a=document.getElementById(`imagePreviewNext`);i&&i.addEventListener(`click`,e=>{e.stopPropagation(),Rr(-1)}),a&&a.addEventListener(`click`,e=>{e.stopPropagation(),Rr(1)}),document.addEventListener(`keydown`,t=>{e.classList.contains(`show`)&&(t.key===`Escape`?n():t.key===`ArrowLeft`?Rr(-1):t.key===`ArrowRight`&&Rr(1))}),e.addEventListener(`wheel`,n=>{if(!e.classList.contains(`show`))return;n.preventDefault();let r=t.getBoundingClientRect(),i=n.clientX-r.left-r.width/2,a=n.clientY-r.top-r.height/2,o=n.deltaY>0?-.15:.15,s=K,c=Math.max(.3,Math.min(5,K+o)),l=c/s;K=c,q=i-l*(i-q),J=a-l*(a-J),jr()},{passive:!1}),t.addEventListener(`mousedown`,t=>{!e.classList.contains(`show`)||K<=1||(t.preventDefault(),Er=!0,Dr=t.clientX,Or=t.clientY,kr=q,Ar=J,jr())}),document.addEventListener(`mousemove`,e=>{Er&&(q=kr+(e.clientX-Dr),J=Ar+(e.clientY-Or),jr())}),document.addEventListener(`mouseup`,()=>{Er&&(Er=!1,jr())}),t.addEventListener(`dblclick`,()=>{e.classList.contains(`show`)&&(K>1?Mr():(K=2,q=0,J=0,jr()))})}function Br(e){let t=new Image,n=URL.createObjectURL(e);t.onload=()=>{URL.revokeObjectURL(n);let{width:e,height:r}=t,i=1024;(e>i||r>i)&&(e>r?(r=Math.round(i/e*r),e=i):(e=Math.round(i/r*e),r=i));let a=document.createElement(`canvas`);a.width=e,a.height=r,a.getContext(`2d`).drawImage(t,0,0,e,r);let o=a.toDataURL(`image/jpeg`,.65);F.attachedImages.push({dataUrl:o});let s=document.getElementById(`imagePreviewBar`),c=document.getElementById(`userInput`);s&&(s.style.display=``),Vr(),c&&c.focus()},t.onerror=()=>{URL.revokeObjectURL(n),console.error(`[ChatManager] 图片加载失败`)},t.src=n}function Vr(){let e=document.getElementById(`imagePreviewBar`);if(e){if(e.innerHTML=``,F.attachedImages.length===0){e.style.display=`none`;return}e.style.display=``,F.attachedImages.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`image-preview-item`;let i=document.createElement(`img`);i.src=t.dataUrl,i.className=`image-preview-thumb`,i.title=`点击查看大图`,i.style.cursor=`zoom-in`,i.addEventListener(`click`,()=>{Nr(t.dataUrl,i)});let a=document.createElement(`button`);a.className=`image-preview-remove`,a.innerHTML=`×`,a.title=`移除图片`,a.addEventListener(`click`,e=>{e.stopPropagation(),F.attachedImages.splice(n,1),Vr()}),r.appendChild(i),r.appendChild(a),e.appendChild(r)})}}function Hr(e){if(!F.enableImageInput||F.attachedImages.length===0)return e;let t=[{type:`text`,text:e}];for(let e of F.attachedImages)t.push({type:`image_url`,image_url:{url:e.dataUrl}});return t}function Ur(e){if(typeof e==`string`)return e;if(Array.isArray(e)){let t=e.filter(e=>e.type===`text`);return t.length===1?t[0].text:t}return e}async function Wr(){let e=document.getElementById(`userInput`),t=document.getElementById(`sendBtn`),n=document.getElementById(`chatContainer`),r=e.value.trim();if(!r||F.isGenerating)return;let a=n.querySelector(`.welcome-message`);a&&a.remove();let s=r,c=F.enableSelectionQuery&&F.selectedContextText&&F.selectedContextText.trim(),l=F.quotedContextText&&F.quotedContextText.trim();l?(s=`[引用内容]\n${F.quotedContextText.trim()}\n\n[用户问题]\n${r}`,F.quotedContextText=``):c&&(s=`[选中内容]\n${F.selectedContextText.trim()}\n\n[用户问题]\n${r}`,F.selectedContextText=``);let u=Hr(s);Z(`user`,u),F.messageHistory.push({role:`user`,content:u}),G(),qe(r),F.inputHistoryIndex=-1,e.value=``,e.style.height=`auto`,(c||l)&&mr(),F.isGenerating=!0,t.disabled=!0;let d=F.activeSessionId,f=ui(),m=F.enableImageInput&&F.attachedImages.length>0&&F.imageModelName||F.currentModel;if(F.attachedImages.length>0){let e=document.getElementById(`imagePreviewBar`);e&&(e.innerHTML=``,e.style.display=`none`)}try{await We(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,F.isolateChat),console.log(`  - chatConfig:`,F.chatConfig),console.log(`  - messageHistory.length:`,F.messageHistory.length);let e=[{role:`system`,content:Ve()}];if(F.isolateChat){let t=F.messageHistory;F.chatConfig.maxMemoryMessages!==null&&F.chatConfig.maxMemoryMessages!==void 0&&F.chatConfig.maxMemoryMessages>0?(t=[...F.messageHistory.slice(0,-1).slice(-F.chatConfig.maxMemoryMessages),F.messageHistory[F.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,F.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,F.chatConfig.maxMemoryMessages),e=[...e,...t];for(let t=0;t<e.length-1;t++)e[t]={...e[t],content:Ur(e[t].content)}}else{let t=Hr(s);e.push({role:`user`,content:t})}let t=await He(),n=p(e),r=p([e[0]]),a=n-r,c=i(n,o(m));console.log(`[SidePanel] 发送上下文: ${n} tokens (系统提示词: ${r}, 历史: ${a}), 压力: ${c.level}(${Math.round(c.ratio*100)}%), 消息: ${e.length} 条`),c.level===`critical`&&console.warn(`[SidePanel] 上下文压力过高，可能触发 API 错误`);let l,u,h,g=!1;try{let n=await di(e,m,F.useTools,t);l=n.content,u=n.executionLog||[],h=n.reflectionScore,g=n.wasRevised||!1}catch(e){if(F.activeSessionId!==d){e.message===`任务已被用户停止`?wn(d,{role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}):wn(d,{role:`assistant`,content:`❌ 请求失败：`+(e.message||`未知错误`),executionLog:e.executionLog||[]}),Q(f),F.substituteLoadingIds.delete(d);return}if(e.message===`任务已被用户停止`){Q(f),F.substituteLoadingIds.delete(d),Z(`assistant`,`任务已取消`,!1,e.executionLog||[]),F.messageHistory.push({role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}),G();return}throw Q(f),F.substituteLoadingIds.delete(d),l=`❌ 请求失败：`+(e.message||`未知错误`),u=e.executionLog||[],Z(`assistant`,l,!0,u,h),F.messageHistory.push({role:`assistant`,content:l,executionLog:u,reflectionScore:h}),e}if(F.activeSessionId!==d){wn(d,{role:`assistant`,content:l,executionLog:u,reflectionScore:h,wasRevised:g}),Q(f),F.substituteLoadingIds.delete(d);return}Q(f),F.substituteLoadingIds.has(d)&&(Q(F.substituteLoadingIds.get(d)),F.substituteLoadingIds.delete(d)),await Xt(Z(`assistant`,l,!0,u,h,g)),F.messageHistory.push({role:`assistant`,content:l,executionLog:u,reflectionScore:h,wasRevised:g})}catch(e){console.error(`[SidePanel] sendMessage 异常:`,e?.message||e)}finally{G(),F.generatingSessionIds.delete(d),t.disabled=!1,e.focus(),F.attachedImages=[];let n=document.getElementById(`imagePreviewBar`);n&&(n.style.display=`none`)}}function Gr(e,t){let n=document.getElementById(`userInput`);if(!t||F.isGenerating){console.log(`[SidePanel] triggerSelectionSearch 跳过:`,{hasText:!!t,isGenerating:F.isGenerating});return}let r=F.enableSelectionQuery;F.enableSelectionQuery=!0,F.selectedContextText=t,F.quotedContextText=``,n.value=`搜索一下`,n.dispatchEvent(new Event(`input`)),Wr(),F.enableSelectionQuery=!1,setTimeout(()=>{F.enableSelectionQuery=r},1500)}function Kr(e){let t=document.getElementById(`userInput`);!t||!e||(t.value=e,t.dispatchEvent(new Event(`input`)),t.focus())}function qr(e,t=``){let n=document.getElementById(`userInput`);!n||!e||F.isGenerating||(t&&(F.enableSelectionQuery=!0,F.selectedContextText=t,F.quotedContextText=``),n.value=e,n.dispatchEvent(new Event(`input`)),n.focus(),Wr(),t&&(F.enableSelectionQuery=!1,setTimeout(()=>{F.enableSelectionQuery=!0},1500)))}function Jr(e,t,n=!0){let r=document.getElementById(`chatContainer`),i=document.createElement(`div`);i.className=`user-context-bubble`,i.dataset.role=`context`,i.innerHTML=`
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${e===`quoted`?`💬`:`📌`}</span>
        <span class="context-type">${e===`quoted`?`引用内容`:`选中内容`}</span>
      </div>
      <div class="context-bubble-content">${R(t)}</div>
    </div>
  `;let a=i.querySelector(`.context-bubble-header`),o=i.querySelector(`.context-bubble-content`);return a.addEventListener(`click`,e=>{e.stopPropagation(),o.classList.toggle(`expanded`)}),r.appendChild(i),n&&(r.scrollTop=r.scrollHeight),i}function Z(e,t,n=!0,r=[],i=null,a=!1){let o=document.getElementById(`chatContainer`),s=document.createElement(`div`);s.className=`message ${e}`;let c=new Date().toISOString();s.dataset.timestamp=c;let l=Array.isArray(t)?t.filter(e=>e.type===`text`).map(e=>e.text).join(``):t,u=Array.isArray(t)&&t.some(e=>e.type===`image_url`);if(s.dataset.rawContent=Array.isArray(t)?JSON.stringify(t):t,s.dataset.textContent_=l,s.dataset.executionLog=JSON.stringify(r),a&&(s.dataset.wasRevised=`true`),e===`assistant`){s.innerHTML=Gt(t);let e=document.createElement(`div`);e.className=`message-footer`;let n=document.createElement(`button`);n.className=`copy-btn`,n.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),n.addEventListener(`click`,e=>{e.stopPropagation(),hi(s,n)}),e.appendChild(n);let o=document.createElement(`button`);o.className=`quote-btn`,o.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),vi(s)}),e.appendChild(o);let c=document.createElement(`div`);c.className=`export-menu-container`;let l=document.createElement(`button`);l.className=`export-trigger-btn`,l.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let u=document.createElement(`div`);u.className=`export-dropdown`,u.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),u.querySelector(`.export-docx-item`).addEventListener(`click`,e=>{e.stopPropagation(),gi(s,l),u.classList.remove(`show`)}),u.querySelector(`.export-pdf-item`).addEventListener(`click`,e=>{e.stopPropagation(),_i(s,l),u.classList.remove(`show`)}),l.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.toggle(`show`)});let d=null;c.addEventListener(`mouseenter`,()=>{d=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==u&&e.classList.remove(`show`)}),u.classList.add(`show`)},300)}),c.addEventListener(`mouseleave`,()=>{d&&=(clearTimeout(d),null),setTimeout(()=>{!c.matches(`:hover`)&&!u.matches(`:hover`)&&u.classList.remove(`show`)},100)}),c.appendChild(l),c.appendChild(u),e.appendChild(c);let f=r&&r.length>0,p=i!=null,m=r?r.filter(e=>e.nodeType===`reflection`&&e.reflectionType===`post`&&e.status===`success`).length:0;Xr(),Qr();let h=r?.find(e=>e.nodeType===`reflection`&&e.reflectionType===`post`);if(f&&F.chatConfig.enableExecutionLog){let t=document.createElement(`button`);t.className=`execution-log-btn`,t.type=`button`,t.title=`执行日志`,t.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),e.appendChild(t)}if(p&&F.chatConfig.enableExecutionLog){let t=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,n=i>=8?`✅`:i>=5?`🔍`:`⚠️`,r=a?` <span class="reflection-revised-tag">已修订</span>`:``,o=m>1?` (${m}轮)`:``,s=document.createElement(`button`);s.className=`reflection-score-btn`,s.type=`button`,s.title=`AI 质量评估: ${i}/10${o}${a?`（已修订）`:``}\n点击查看评估详情`,s.innerHTML=`<span class="reflection-badge ${t}">${n} ${i}/10${r}</span>`,s.dataset.reflectionData=JSON.stringify({overallScore:h?.overallScore??i,dimensions:h?.dimensions||null,issues:h?.issues||null,suggestions:h?.suggestions||null,decision:h?.action?.decision||null,useful:h?.useful??null,reasoning:h?.reasoning||null,suggestion:h?.suggestion||null,rounds:m,wasRevised:a}),e.appendChild(s)}else if(!p&&r&&r.some(e=>e.nodeType===`reflection`&&e.status===`failed`)&&F.chatConfig.enableExecutionLog){let t=document.createElement(`button`);t.className=`reflection-score-btn`,t.type=`button`,t.title=`反思评估失败（点击查看执行日志）`,t.innerHTML=`<span class="reflection-badge score-low">⚠️ 反思失败</span>`,e.appendChild(t)}let g=r?.find(e=>e.nodeType===`tool_exec`&&e.action?.name===`preview_ui_prototype`&&e.status===`success`);if(g){let t=document.createElement(`button`);t.className=`prototype-btn-small`,t.type=`button`,t.title=`查看 UI 原型`,t.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,t.addEventListener(`click`,()=>{let e=g.prototypeId;if(!e&&g.observation)try{e=(typeof g.observation==`string`?JSON.parse(g.observation):g.observation)?.prototypeId}catch{}e?wt(e):console.error(`[SidePanel] 未找到 prototypeId，entry keys:`,Object.keys(g),`observation:`,g.observation)}),e.appendChild(t)}s.appendChild(e)}else{let e=l.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),n=l.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),r=e||n;if(r){let t=e?`quoted`:`selected`,n=r[1].trim(),i=r[2].trim();s._pendingContext={type:t,contextText:n,userQuestion:i},s.textContent=i}else s.textContent=l;if(u){let e=document.createElement(`div`);e.className=`user-message-images`,t.filter(e=>e.type===`image_url`).forEach((t,n)=>{let r=document.createElement(`img`);r.src=t.image_url.url,r.className=`user-message-image`,r.title=`点击查看大图`,r.addEventListener(`click`,()=>{Nr(t.image_url.url,r)}),e.appendChild(r)}),s.appendChild(e)}let i=document.createElement(`div`);i.className=`message-toolbar`;let a=document.createElement(`button`);a.className=`message-toolbar-btn copy-btn`,a.title=`复制内容`,a.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`].join(``),a.addEventListener(`click`,e=>{e.stopPropagation(),pi(s,a)});let o=document.createElement(`button`);o.className=`message-toolbar-btn edit-btn`,o.title=`编辑后重新发送`,o.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>`,`</svg>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),mi(s)}),i.appendChild(a),i.appendChild(o),s.appendChild(i)}if(o.appendChild(s),s._pendingContext){let{type:e,contextText:t}=s._pendingContext,n=Jr(e,t,!1);o.insertBefore(n,s),delete s._pendingContext}if(n){let e=o.querySelectorAll(`.message.user`);if(e.length>0){let t=e[e.length-1],n=t.previousElementSibling;n&&n.classList.contains(`user-context-bubble`)?n.scrollIntoView({behavior:`smooth`,block:`start`}):t.scrollIntoView({behavior:`smooth`,block:`start`})}}return e===`assistant`&&$t(),s}var Yr=!1;function Xr(){if(Yr)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.execution-log-btn`);if(!t)return;let n=t.closest(`.message`);if(!n)return;e.preventDefault(),e.stopPropagation();let r=n.dataset.executionLog;if(r)try{let e=JSON.parse(r);console.log(`[chat-manager] 执行日志按钮点击(委托), entries:`,e.length),fi(e)}catch(e){console.error(`[chat-manager] 解析 executionLog 失败:`,e)}}),Yr=!0)}var Zr=!1;function Qr(){if(Zr)return;let e=document.getElementById(`chatContainer`);e&&(e.addEventListener(`click`,e=>{let t=e.target.closest(`.reflection-score-btn`);if(!t)return;e.preventDefault(),e.stopPropagation();let n=t.dataset.reflectionData;if(n)try{$r(JSON.parse(n),t)}catch(e){console.error(`[chat-manager] 解析 reflectionData 失败:`,e)}}),Zr=!0)}function $r(e,t){let n=document.querySelector(`.reflection-info-overlay`);n&&n.remove();let r=document.createElement(`div`);r.className=`reflection-info-overlay`;let{overallScore:i,dimensions:a,issues:o,suggestions:s,decision:c,useful:l,reasoning:u,suggestion:d,rounds:f,wasRevised:p}=e,m=i>=8?`score-high`:i>=5?`score-mid`:`score-low`,h=i>=8?`✅`:i>=5?`🔍`:`⚠️`,g=c===`passed`?`✅ 通过`:c===`revised`?`🔧 已修订`:c===`needs_improvement`?`⚠️ 需改进`:``,_={accuracy:`准确性`,completeness:`完整性`,relevance:`相关性`,clarity:`清晰度`,usefulness:`实用性`,safety:`安全性`,efficiency:`效率`},v=``;a&&Object.keys(a).length>0&&(v=`
      <div class="ri-section">
        <div class="ri-section-title">📊 各维度评分</div>
        <div class="ri-dimensions">
          ${Object.entries(a).map(([e,t])=>{let n=_[e]||e,r=t>=8?`#10b981`:t>=5?`#f59e0b`:`#ef4444`;return`
              <div class="ri-dim-item">
                <span class="ri-dim-label">${R(n)}</span>
                <span class="ri-dim-bar-bg"><span class="ri-dim-bar-fill" style="width:${t*10}%;background:${r}"></span></span>
                <span class="ri-dim-score" style="color:${r}">${t}/10</span>
              </div>
            `}).join(``)}
        </div>
      </div>
    `);let y=``;o&&o.length>0&&(y=`
      <div class="ri-section">
        <div class="ri-section-title">📋 发现的问题</div>
        <ul class="ri-list">${o.map(e=>`<li>${R(e)}</li>`).join(``)}</ul>
      </div>
    `);let b=``;s&&s.length>0&&(b=`
      <div class="ri-section">
        <div class="ri-section-title">💡 改进建议</div>
        <ul class="ri-list">${s.map(e=>`<li>${R(e)}</li>`).join(``)}</ul>
      </div>
    `);let x=``;if(f>0||c||l!==null){let e=[];f>0&&e.push(`<span class="ri-tag">🔄 经过 ${f} 轮评估${p?`（已修订）`:``}</span>`),c&&e.push(`<span class="ri-tag">🎯 最终决策: ${g}</span>`),l!==null&&e.push(`<span class="ri-tag">${l?`✅ AI 认为结果有用`:`⚠️ AI 认为结果需要改进`}</span>`),u&&e.push(`<div class="ri-reasoning">📝 ${R(u)}</div>`),x=`
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
  `,document.body.appendChild(r),r.querySelector(`.ri-close`).addEventListener(`click`,()=>r.remove()),r.addEventListener(`click`,e=>{e.target===r&&r.remove()});let S=t.getBoundingClientRect(),C=r.querySelector(`.reflection-info-panel`),w=Math.min(window.innerHeight-40,560),T=S.right-380;T<10&&(T=10),T+380>window.innerWidth-10&&(T=window.innerWidth-380-10);let E=S.bottom+6;E+w>window.innerHeight-10&&(E=S.top-w-6),E<10&&(E=10),C.style.left=T+`px`,C.style.top=E+`px`,C.style.maxHeight=w+`px`}function ei(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)),n=t.length,r=``,i=null;return t.forEach((e,t)=>{let a=e.nodeType===`subtask`,o=e.nodeType===`tool_exec`,s=e.nodeType===`api_call`,c=e.nodeType===`preselect`,l=e.nodeType===`reflection`,u=o&&e.action?.name===`plan_task`;a&&(i=e.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&i!==null?(d=`tool-level`,f=`🔧`):s&&i!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=e.status||`processing`;e.status===`success`?p=`✓`:e.status===`failed`&&(p=`✗`),l&&(m=`reflection ${m}`);let h=R(e.nodeName||`未知节点`);if(e.subtaskIndex!==null&&e.subtaskIndex>=0&&(h=`<span class="subtask-badge">${e.subtaskIndex+1}</span> ${h}`),e.subtaskCount&&(h+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!c&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(h+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}r+=`
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
            <span class="node-name" title="${R(e.nodeName||`未知节点`)}">${h}</span>
            <span class="duration-badge" title="耗时">${ze(e.duration||0)}</span>
          </div>
          
          <div class="timeline-details">
            ${e.thought&&e.thought.trim()?`
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${R(e.thought)}</div>
            </div>
            `:``}
            
            ${!c&&e.action?`
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${R(e.action.name)}<br>
                <strong>参数:</strong> <code>${R(JSON.stringify(e.action.params,null,2))}</code>
              </div>
            </div>
            `:``}
            
            ${c&&e.action?.params?.selected?`
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${e.action.params.selected.map(e=>R(e)).join(`, `)}<br>
                <strong>数量:</strong> ${e.action.params.selected.length} 个
              </div>
            </div>
            `:``}
            
            ${e.observation?`
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${R(e.observation)}</div>
            </div>
            `:``}
            
            ${e.apiRequest?`
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${e.apiRequest.model?`<strong>模型:</strong> ${R(e.apiRequest.model)}<br>`:``}
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
                ${e.apiResponse.finishReason?`<strong>完成原因:</strong> ${R(e.apiResponse.finishReason)}<br>`:``}
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
              <div class="section-content">${R(e.error)}</div>
            </div>
            `:``}
            
            ${e.result?`
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${R(e.result)}</div>
            </div>
            `:``}
            
            ${l?`
            <div class="timeline-section reflection-details">
              ${e.prompt?`
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${R(e.prompt)}</pre></div>
              </div>
              `:``}
              ${e.rawContent?`
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${R(e.rawContent)}</pre></div>
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
              <div class="section-content"><ul>${e.issues.map(e=>`<li>${R(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${e.suggestions&&e.suggestions.length>0?`
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${e.suggestions.map(e=>`<li>${R(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${e.action?.decision?`
              <div class="section-title">🎯 决策: ${R(e.action.decision===`passed`?`✅ 通过`:e.action.decision===`revised`?`🔧 已修订`:e.action.decision===`needs_improvement`?`⚠️ 需改进`:e.action.decision)}</div>
              `:``}
              ${e.useful===void 0?``:`
              <div class="section-title">${e.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
              ${e.reasoning?`<div class="section-content">${R(e.reasoning)}</div>`:``}
              ${e.suggestion?`<div class="section-content">建议: ${R(e.suggestion)}</div>`:``}
              `}
            </div>
            `:``}
          </div>
        </div>
      </div>
    `}),r}function ti(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp));if(!t.some(e=>e.taskGroup))return ai(t);let n=new Map,r=[];t.forEach(e=>{e.taskGroup?(n.has(e.taskGroup)||n.set(e.taskGroup,{groupId:e.taskGroup,groupIndex:e.taskGroupIndex,groupName:e.taskGroupName,entries:[],status:e.status}),n.get(e.taskGroup).entries.push(e),e.status&&(n.get(e.taskGroup).status=e.status)):r.push(e)});let i=ni(r,t.length);return n.forEach((e,n)=>{let r=e.status||`processing`;i+=`
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
              <span class="task-group-name">${R(e.groupName)}</span>
              <span class="task-group-count">(${e.entries.length} 步骤)</span>
            </div>
          </div>
        </div>
        <div class="task-group-timeline">
          ${ri(e.entries,t.length)}
        </div>
      </div>
    `}),i}function ni(e,t){if(e.length===0)return``;let n=``;return n+=`
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
  `,e.forEach((e,r)=>{n+=ii(e,r,t)}),n+=`
      </div>
    </div>
  `,n}function ri(e,t){let n=``;return e.forEach((e,r)=>{n+=ii(e,r,t)}),n}function ii(e,t,n){let r=e.nodeType===`subtask`,i=e.nodeType===`tool_exec`,a=e.nodeType===`api_call`,o=e.nodeType===`preselect`,s=e.nodeType===`reflection`,c=i&&e.action?.name===`plan_task`,l=``,u=``;s?(l=`reflection-level`,u=`🎯`):o?u=`📡`:c?(l=`plan-task-level`,u=`📋`):r?(l=`subtask-level`,u=`🔀`):i?(l=`tool-level`,u=`🔧`):a?(l=`api-level`,u=`📡`):i?u=`⚡`:a&&(u=`📡`);let d=`○`,f=e.status||`processing`;e.status===`success`?d=`✓`:e.status===`failed`&&(d=`✗`),s&&(f=`reflection ${f}`);let p=R(e.nodeName||`未知节点`);if(e.subtaskCount&&(p+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(a||o)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!o&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(p+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}return`
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
          <span class="node-name" title="${R(e.nodeName||`未知节点`)}">${p}</span>
          <span class="duration-badge" title="耗时">${ze(e.duration)}</span>
        </div>
        
        <div class="timeline-details">
          ${e.thought&&e.thought.trim()?`
          <div class="timeline-section">
            <div class="section-title">💡 思考</div>
            <div class="section-content">${R(e.thought)}</div>
          </div>
          `:``}
          
          ${!o&&e.action?`
          <div class="timeline-section">
            <div class="section-title">⚡ 工具调用</div>
            <div class="section-content">
              <strong>工具:</strong> ${R(e.action.name)}<br>
              <strong>参数:</strong> <code>${R(JSON.stringify(e.action.params,null,2))}</code>
            </div>
          </div>
          `:``}
          
          ${o&&e.action?.params?.selected?`
          <div class="timeline-section">
            <div class="section-title">🔍 筛选结果</div>
            <div class="section-content">
              <strong>选中工具:</strong> ${e.action.params.selected.map(e=>R(e)).join(`, `)}<br>
              <strong>数量:</strong> ${e.action.params.selected.length} 个
            </div>
          </div>
          `:``}
          
          ${e.observation?`
          <div class="timeline-section">
            <div class="section-title">📝 观察结果</div>
            <div class="section-content">${R(e.observation)}</div>
          </div>
          `:``}
          
          ${e.apiRequest?`
          <div class="timeline-section">
            <div class="section-title">📡 API 请求</div>
            <div class="section-content">
              ${e.apiRequest.model?`<strong>模型:</strong> ${R(e.apiRequest.model)}<br>`:``}
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
              ${e.apiResponse.finishReason?`<strong>完成原因:</strong> ${R(e.apiResponse.finishReason)}<br>`:``}
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
            <div class="section-content">${R(e.error)}</div>
          </div>
          `:``}
          
          ${e.result?`
          <div class="timeline-section">
            <div class="section-title">✅ 子任务结果</div>
            <div class="section-content">${R(e.result)}</div>
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
            <div class="section-content"><ul>${e.issues.map(e=>`<li>${R(e)}</li>`).join(``)}</ul></div>
            `:``}
            ${e.suggestions&&e.suggestions.length>0?`
            <div class="section-title">💡 改进建议</div>
            <div class="section-content"><ul>${e.suggestions.map(e=>`<li>${R(e)}</li>`).join(``)}</ul></div>
            `:``}
            ${e.action?.decision?`
            <div class="section-title">🎯 决策: ${R(e.action.decision===`passed`?`✅ 通过`:e.action.decision===`revised`?`🔧 已修订`:e.action.decision===`needs_improvement`?`⚠️ 需改进`:e.action.decision)}</div>
            `:``}
            ${e.useful===void 0?``:`
            <div class="section-title">${e.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
            ${e.reasoning?`<div class="section-content">${R(e.reasoning)}</div>`:``}
            ${e.suggestion?`<div class="section-content">建议: ${R(e.suggestion)}</div>`:``}
            `}
          </div>
          `:``}
        </div>
      </div>
    </div>
  `}function ai(e){let t=``,n=null;return e.forEach((r,i)=>{let a=r.nodeType===`subtask`,o=r.nodeType===`tool_exec`,s=r.nodeType===`api_call`,c=r.nodeType===`preselect`,l=r.nodeType===`reflection`,u=o&&r.action?.name===`plan_task`;a&&(n=r.subtaskIndex);let d=``,f=``;l?f=`🎯`:c?f=`🔍`:u?(d=`plan-task-level`,f=`📋`):a?(d=`subtask-level`,f=`🔀`):o&&n!==null?(d=`tool-level`,f=`🔧`):s&&n!==null?(d=`api-level`,f=`📡`):o?f=`⚡`:s&&(f=`📡`);let p=`○`,m=r.status||`processing`;r.status===`success`?p=`✓`:r.status===`failed`&&(p=`✗`);let h=R(r.nodeName||`未知节点`);if(r.subtaskId&&(h=`<span class="subtask-badge">${n===null?``:n+1}</span> ${h}`),r.subtaskCount&&(h+=` <span class="plan-badge">(${r.subtaskCount}个子任务, ${r.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c||l)&&r.apiRequest){let e=[];r.apiRequest.messageCount!==void 0&&r.apiRequest.messageCount!==null&&e.push(`💬<span title="本次模型API调用携带的消息数">${r.apiRequest.messageCount}条</span>`),!c&&r.apiRequest.toolCount!==void 0&&r.apiRequest.toolCount!==null&&e.push(`🔧<span title="本次模型API调用携带的工具定义数">${r.apiRequest.toolCount}个</span>`),e.length>0&&(h+=` <span class="api-info-badge">（${e.join(` `)}）</span>`)}t+=`
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
            <span class="node-name" title="${R(r.nodeName||`未知节点`)}">${h}</span>
            <span class="duration-badge" title="耗时">${ze(r.duration)}</span>
          </div>
          
          <div class="timeline-details">
            ${r.thought&&r.thought.trim()?`
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${R(r.thought)}</div>
            </div>
            `:``}
            
            ${!c&&r.action?`
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${R(r.action.name)}<br>
                <strong>参数:</strong> <code>${R(JSON.stringify(r.action.params,null,2))}</code>
              </div>
            </div>
            `:``}
            
            ${c&&r.action?.params?.selected?`
            <div class="timeline-section">
              <div class="section-title">🔍 筛选结果</div>
              <div class="section-content">
                <strong>选中工具:</strong> ${r.action.params.selected.map(e=>R(e)).join(`, `)}<br>
                <strong>数量:</strong> ${r.action.params.selected.length} 个
              </div>
            </div>
            `:``}
            
            ${r.observation?`
            <div class="timeline-section">
              <div class="section-title">📝 观察结果</div>
              <div class="section-content">${R(r.observation)}</div>
            </div>
            `:``}
            
            ${r.apiRequest?`
            <div class="timeline-section">
              <div class="section-title">📡 API 请求</div>
              <div class="section-content">
                ${r.apiRequest.model?`<strong>模型:</strong> ${R(r.apiRequest.model)}<br>`:``}
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
                ${r.apiResponse.finishReason?`<strong>完成原因:</strong> ${R(r.apiResponse.finishReason)}<br>`:``}
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
              <div class="section-content">${R(r.error)}</div>
            </div>
            `:``}
            
            ${r.result?`
            <div class="timeline-section">
              <div class="section-title">✅ 子任务结果</div>
              <div class="section-content">${R(r.result)}</div>
            </div>
            `:``}
            
            ${l?`
            <div class="timeline-section reflection-details">
              ${r.prompt?`
              <div class="timeline-section">
                <div class="section-title">📊 评估提示词</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:300px;overflow-y:auto;">${R(r.prompt)}</pre></div>
              </div>
              `:``}
              ${r.rawContent?`
              <div class="timeline-section">
                <div class="section-title">📤 评估结果（原始响应）</div>
                <div class="section-content"><pre style="white-space:pre-wrap;word-break:break-word;max-height:200px;overflow-y:auto;">${R(r.rawContent)}</pre></div>
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
              <div class="section-content"><ul>${r.issues.map(e=>`<li>${R(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${r.suggestions&&r.suggestions.length>0?`
              <div class="section-title">💡 改进建议</div>
              <div class="section-content"><ul>${r.suggestions.map(e=>`<li>${R(e)}</li>`).join(``)}</ul></div>
              `:``}
              ${r.action?.decision?`
              <div class="section-title">🎯 决策: ${R(r.action.decision===`passed`?`✅ 通过`:r.action.decision===`revised`?`🔧 已修订`:r.action.decision===`needs_improvement`?`⚠️ 需改进`:r.action.decision)}</div>
              `:``}
              ${r.useful===void 0?``:`
              <div class="section-title">${r.useful?`✅ 结果有用`:`⚠️ 结果无效`}</div>
              ${r.reasoning?`<div class="section-content">${R(r.reasoning)}</div>`:``}
              ${r.suggestion?`<div class="section-content">建议: ${R(r.suggestion)}</div>`:``}
              `}
            </div>
            `:``}
          </div>
        </div>
      </div>
    `}),t}function oi(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(!t)return;let n=t.querySelector(`.realtime-executing-node`);n&&(n.textContent=e.nodeName||`处理中...`);let r=e.executionLog||[],i=r.length,a=r.filter(e=>e.status===`success`).length,o=r.filter(e=>e.status===`failed`).length,s=r.filter(e=>e.nodeType===`subtask`).length,c=r.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,l=t.querySelector(`.combo-value`),u=t.querySelector(`.combo-stat.success .stat-value`),d=t.querySelector(`.combo-stat.failed .stat-value`),f=t.querySelector(`.combo-stat.subtask`);l&&(l.textContent=i),u&&(u.textContent=a),d&&(d.textContent=o),f&&(s>0?(f.style.display=``,f.querySelector(`.stat-value`).textContent=`${c}/${s}`):f.style.display=`none`);let p=t.querySelector(`.timeline`);p.innerHTML=r.length>0?ei(r):`<div class="realtime-waiting-message">等待执行中...</div>`,p.scrollTop=p.scrollHeight}function si(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel realtime-mode`,n.innerHTML=`
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
  `,document.body.appendChild(n),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()}),n.addEventListener(`click`,e=>{e.target===n&&n.remove()});let r=n.querySelector(`.toggle-expand-btn`),i=!1;r.addEventListener(`click`,()=>{i=!i,n.querySelectorAll(`.timeline-content`).forEach(e=>{i?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=r.querySelector(`svg`);i?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,r.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,r.setAttribute(`title`,`展开全部节点`))}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.timeline-header`);t&&t.parentElement.classList.toggle(`expanded`)}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.combo-stat[data-status]`);if(!t)return;let r=t.dataset.status,i=t.classList.contains(`active`);n.querySelectorAll(`.combo-stat[data-status]`).forEach(e=>{e.classList.remove(`active`)});let a=n.querySelectorAll(`.timeline-item`);i?a.forEach(e=>{e.style.display=``}):(t.classList.add(`active`),a.forEach(e=>{if(r===`subtask`)e.dataset.nodeType===`subtask`?e.style.display=``:e.style.display=`none`;else{let t=e.querySelector(`.timeline-dot`);t&&t.classList.contains(r)?e.style.display=``:e.style.display=`none`}}))}),F.currentExecutionStatus&&oi(F.currentExecutionStatus)}function ci(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(t){t.remove();return}si(e)}function li(e,t,n,r){let i=document.getElementById(e);if(!i)return;console.log(`[SidePanel] updateExecutionStatus 被调用:`,t,n,`日志数量:`,r?.length);let a=i.querySelector(`.current-node-name`);a&&(a.textContent=t||`处理中...`,a.title=t||``),F.currentExecutionStatus?(F.currentExecutionStatus.executionLog||(F.currentExecutionStatus.executionLog=[]),r&&r.length>0&&r.forEach(e=>{let t=F.currentExecutionStatus.executionLog.findIndex(t=>t.id===e.id);if(t!==-1){let n=F.currentExecutionStatus.executionLog[t];F.currentExecutionStatus.executionLog[t]={...e,subtaskIndex:e.subtaskIndex??n.subtaskIndex,subtaskId:e.subtaskId??n.subtaskId,subtaskName:e.subtaskName??n.subtaskName}}else F.currentExecutionStatus.executionLog.push(e)}),F.currentExecutionStatus.nodeName=t,F.currentExecutionStatus.status=n):F.currentExecutionStatus={nodeName:t,status:n,executionLog:[]},document.querySelector(`.execution-log-panel.realtime-mode`)&&oi(F.currentExecutionStatus)}function ui(){let e=document.getElementById(`chatContainer`),t=`loading-`+Date.now(),n=document.createElement(`div`);n.className=`loading-message`,n.id=t,n.innerHTML=`
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
  `,e.appendChild(n),e.scrollTop=e.scrollHeight;let r=n.querySelector(`.stop-task-btn`),i=n.querySelector(`.loading-text`);r&&r.addEventListener(`click`,e=>{e.stopPropagation(),r.disabled=!0,r.style.opacity=`0.6`,r.style.cursor=`not-allowed`,i&&(i.textContent=`停止中...`),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:null,sessionId:F.activeSessionId}),F.pendingCancelApi&&F.pendingCancelApi({message:`任务已被用户停止`,executionLog:F.currentExecutionStatus?.executionLog||[]})});let a=F.activeSessionId;if(F.executionLogListener=(e,n,r)=>e.sessionId&&e.sessionId!==a?!1:e.type===`EXECUTION_STATUS_UPDATE`?(console.log(`[SidePanel] 收到执行状态更新:`,e.nodeName,e.status,`日志数量:`,e.executionLog?.length),li(t,e.nodeName,e.status,e.executionLog),!1):!1,chrome.runtime.onMessage.addListener(F.executionLogListener),F.chatConfig.enableExecutionLog){let e=n.querySelector(`.execution-status-container`);e&&(e.style.display=`flex`)}let o=n.querySelector(`.execution-log-toggle-btn`);return o&&o.addEventListener(`click`,e=>{e.stopPropagation(),ci(t)}),t}function Q(e){let t=document.getElementById(e);if(t){let e=t.querySelector(`.loading-text`);e&&(e.textContent=`思考中...`),t.remove()}F.executionLogListener&&=(chrome.runtime.onMessage.removeListener(F.executionLogListener),null),F.currentExecutionStatus=null;let n=document.querySelector(`.execution-log-panel.realtime-mode`);n&&n.remove()}async function di(e,t,n=!1,r={}){let i=(await Ke()).loopTimeout,a=F.activeSessionId,o=chrome.runtime.connect({name:`keepalive-`+a});console.log(`[SidePanel] keepalive 端口已连接, sessionId:`,a);let s={restarted:!1,rejectFn:null,cleanup:null};o.onMessage.addListener(e=>{e.type===`SW_RESTARTED`&&e.sessionId===a&&(console.warn(`[SidePanel] ⚠️ 收到 SW_RESTARTED 通知，后台已重启，API 调用已丢失`),s.restarted=!0,s.rejectFn&&s.cleanup&&(s.cleanup(),s.rejectFn({message:`后台服务异常重启，API 调用已中断，请重试`,executionLog:[]})))});let c={timeoutId:null,removeListener:()=>{}},l=()=>{try{o.disconnect()}catch{}c.timeoutId&&=(clearTimeout(c.timeoutId),null),c.removeListener(),F.pendingCancelApiMap.delete(a),F.pendingCallApiSessionIds.delete(a),ur()};return new Promise((o,u)=>{if(s.cleanup=l,s.rejectFn=u,s.restarted){l(),u({message:`后台服务异常重启，API 调用已中断，请重试`,executionLog:[]});return}let d=[],f=Math.round(i/1e3),p=e=>{l(),(!e.executionLog||e.executionLog.length===0||d.length>0)&&(e.executionLog=d),u(e)};F.pendingCancelApi=p,F.pendingCallApiSessionIds.add(a),ur(),console.log(`[SidePanel] callApi: 添加 pendingCallApiSessionIds, mySessionId =`,a,`, set:`,[...F.pendingCallApiSessionIds]),c.timeoutId=setTimeout(()=>{p({message:`请求超时（${f}秒）`,executionLog:d}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:F.currentTabId,sessionId:F.activeSessionId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},i);let m=Date.now(),h=0,g=null,_=()=>{g===null&&c.timeoutId!==null&&(g=Date.now(),clearTimeout(c.timeoutId),c.timeoutId=null,console.log(`[SidePanel] 前端超时已暂停（澄清工具执行中）`))},v=()=>{if(g!==null){let e=Date.now()-g;h+=e,g=null;let t=Date.now()-m,n=i+h-t;if(n<=0){p({message:`请求超时（${f}秒）`,executionLog:d});return}c.timeoutId=setTimeout(()=>{p({message:`请求超时（${f}秒）`,executionLog:d}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:F.currentTabId,sessionId:a}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},n),console.log(`[SidePanel] 前端超时已恢复，暂停时长:`,Math.round(e/1e3),`s，剩余时间:`,Math.round(n/1e3),`s`)}},y=e=>(console.log(`[SidePanel] 收到消息:`,e),e.sessionId&&e.sessionId!==a?!1:e.type===`EXECUTION_STATUS_UPDATE`?(d=e.executionLog||[],!1):e.type===`CLARIFY_START`?(_(),!1):e.type===`CLARIFY_END`?(v(),!1):e.type===`API_COMPLETE`?(l(),o({content:e.content,executionLog:e.executionLog||d,reflectionScore:e.reflectionScore}),!1):e.type===`API_ERROR`?(l(),u({message:e.error,executionLog:e.executionLog||d}),!1):!1);chrome.runtime.onMessage.addListener(y),c.removeListener=()=>{chrome.runtime.onMessage.removeListener(y)},console.log(`[SidePanel] 发送 CALL_API 消息，useTools:`,n,`tabId:`,F.currentTabId,`sessionId:`,F.activeSessionId,`apiParams:`,r,`timeout:`,i),chrome.runtime.sendMessage({type:`CALL_API`,sessionId:F.activeSessionId,messages:e,model:t,useTools:n,tabId:F.currentTabId,apiParams:r,imageApiBase:F.enableImageInput&&F.attachedImages.length>0&&F.imageApiBase||``,imageApiKey:F.enableImageInput&&F.attachedImages.length>0&&F.imageApiKey||``})})}function fi(e){let t=document.querySelector(`.execution-log-panel`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel`;let r=e.reduce((e,t)=>e+(t.duration||0),0),i=e.filter(e=>e.status===`success`).length,a=e.filter(e=>e.status===`failed`).length,o=e.filter(e=>e.nodeType===`subtask`).length,s=e.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,c=e.filter(e=>e.nodeType===`tool_exec`&&e.action?.name===`plan_task`&&e.status===`success`).length,l=e.filter(e=>e.nodeType===`reflection`).find(e=>e.reflectionType===`post`);n.innerHTML=`
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
        <div class="summary-item" title="总耗时: ${ze(r)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${ze(r)}</span>
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
        ${ti(e)}
      </div>
    </div>
  `,document.body.appendChild(n),n.addEventListener(`click`,e=>{e.target===n&&n.remove()}),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()});let u=n.querySelector(`.toggle-expand-btn`),d=n.querySelectorAll(`.timeline-content`),f=!1;u.addEventListener(`click`,()=>{f=!f,d.forEach(e=>{f?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=u.querySelector(`svg`);f?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,u.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,u.setAttribute(`title`,`展开全部节点`))}),n.querySelectorAll(`.timeline-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.parentElement.classList.toggle(`expanded`)})});let p=n.querySelectorAll(`.combo-stat`),m=n.querySelectorAll(`.timeline-item`);p.forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.status,n=e.classList.contains(`active`);p.forEach(e=>e.classList.remove(`active`)),n?m.forEach(e=>{e.style.display=``}):(e.classList.add(`active`),m.forEach(e=>{if(t===`subtask`)e.classList.contains(`subtask-level`)?e.style.display=``:e.style.display=`none`;else{let n=e.querySelector(`.timeline-dot`);n&&n.classList.contains(t)?e.style.display=``:e.style.display=`none`}}))})})}function pi(e,t){try{let n=e.dataset.textContent_||e.dataset.rawContent||``;navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{console.error(`[SidePanel] 复制失败:`,e);let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{L(`复制失败`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),L(`复制失败`,`error`)}}function mi(e){try{let t=e.dataset.rawContent||``,n=e.dataset.textContent_||``;if(!n&&!t){L(`无法获取消息内容`,`error`);return}if(F.attachedImages=[],t.startsWith(`[`))try{let e=JSON.parse(t);if(Array.isArray(e)){let t=e.filter(e=>e.type===`image_url`);for(let e of t)F.attachedImages.push({dataUrl:e.image_url.url})}}catch{}Vr(),F.quotedContextText=``,F.selectedContextText=``;let r=n.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),i=n.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),a=r||i,o=n;if(a){let e=r?`quoted`:`selected`,t=a[1].trim(),n=a[2].trim(),i=document.getElementById(`selectionIndicator`),s=document.getElementById(`selectionText`);if(i&&s){let n;n=t.length>100?t.substring(0,100)+`...`:t.length>50?t.substring(0,50)+`...`:t,e===`quoted`?(F.quotedContextText=t,s.textContent=`💬 已引用: ${n}`):(F.selectedContextText=t,s.textContent=`📌 已选中: ${n}`),i.classList.add(`show`)}o=n}let s=document.getElementById(`userInput`);s.value=o,Re(),s.focus(),s.selectionStart=s.selectionEnd=s.value.length,console.log(`[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送`)}catch(e){console.error(`[SidePanel] 编辑消息失败:`,e),L(`编辑失败: `+e.message,`error`)}}function hi(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=F.messageHistory.find(e=>e.role===`assistant`);if(t)n=t.content;else{let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}}navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{L(`复制失败，请手动选择内容复制`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),L(`复制失败`,`error`)}}function gi(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${Bt(n)}
      </body>
      </html>
    `,i=new Blob([`﻿`,r],{type:`application/msword`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`word-${new Date().getTime()}.doc`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a);let s=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `,setTimeout(()=>{t.innerHTML=s},2e3),console.log(`[SidePanel] Word 文档导出成功`)}catch(e){console.error(`[SidePanel] 导出 Word 失败:`,e),L(`导出失败: `+e.message,`error`)}}function _i(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${Bt(n)}
        <div class="footer">${`AI Helper - ${new Date().toLocaleString(`zh-CN`)}`}</div>
      </body>
      </html>
    `,i=window.open(``,`_blank`,`width=800,height=600`);if(!i){L(`请允许弹出窗口以使用 PDF 导出功能`,`warning`);return}i.document.write(r),i.document.close(),i.onload=function(){setTimeout(()=>{i.focus(),i.print()},500)};let a=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `,setTimeout(()=>{t.innerHTML=a},2e3),console.log(`[SidePanel] PDF 导出已触发`)}catch(e){console.error(`[SidePanel] 导出 PDF 失败:`,e),L(`导出失败: `+e.message,`error`)}}function vi(e){try{let t=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!t){console.warn(`[SidePanel] 无法获取消息内容`);return}let n=document.getElementById(`userInput`);if(!n){console.warn(`[SidePanel] 找不到输入框`);return}let r=e.querySelector(`.quote-btn`),i=r?r.innerHTML:``;pr(t),r&&(r.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `,r.classList.add(`quoted`),setTimeout(()=>{r.innerHTML=i,r.classList.remove(`quoted`)},2e3)),n.focus(),console.log(`[SidePanel] 已引用消息内容到提示条，输入框已获取焦点`)}catch(e){console.error(`[SidePanel] 引用提问失败:`,e),L(`引用失败: `+e.message,`error`)}}function yi(){console.log(`[SidePanel] 清除选中内容上下文`),F.selectedContextText=``,F.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=0;for(let t=0;t<e.length;t++)if(e[t].startsWith(`[用户问题]`)){n=t;break}n>0&&(t.value=e.slice(n).join(`
`),t.dispatchEvent(new Event(`input`)),console.log(`[SidePanel] 已移除输入框中的选中内容前缀`))}F.lastSelectedText=``,F.currentSelectionRange=null}function bi(){let e=document.getElementById(`promptManageList`).querySelectorAll(`.prompt-manage-item`);e.forEach(t=>{t.addEventListener(`dragstart`,e=>{F.draggedItemIndex=parseInt(t.dataset.index),t.classList.add(`dragging`),e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,F.draggedItemIndex)}),t.addEventListener(`dragend`,()=>{t.classList.remove(`dragging`),e.forEach(e=>e.classList.remove(`drag-over`)),F.draggedItemIndex=null}),t.addEventListener(`dragover`,e=>{e.preventDefault(),e.dataTransfer.dropEffect=`move`,t.classList.add(`drag-over`)}),t.addEventListener(`dragleave`,()=>{t.classList.remove(`drag-over`)}),t.addEventListener(`drop`,e=>{e.stopPropagation(),e.preventDefault();let n=parseInt(t.dataset.index);if(F.draggedItemIndex!==null&&F.draggedItemIndex!==n){let e=F.customPrompts[F.draggedItemIndex];F.customPrompts.splice(F.draggedItemIndex,1),F.customPrompts.splice(n,0,e),chrome.storage.local.set({customPrompts:F.customPrompts}),$()}t.classList.remove(`drag-over`)})})}function xi(){let e=document.querySelector(`.input-toolbar-right`);if(!e)return;let t=document.createElement(`button`);t.className=`prompt-manage-btn`,t.title=`提示词管理`,t.innerHTML=`<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`,t.addEventListener(`click`,()=>{Ai()}),e.appendChild(t)}function Si(e=``){let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);t.style.display=`block`,n.classList.add(`show`),Ei(e)}function Ci(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`);e.style.display=`none`,t.classList.remove(`show`),F.selectedPromptIndex=-1}function wi(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`),n=document.getElementById(`userInput`);e.style.display!==`none`&&t.classList.contains(`show`)?Ci():(Si(),n.focus())}function Ti(e=``){Ei(e)}function Ei(e=``){let t=document.getElementById(`promptList`),n=e.toLowerCase(),r=F.customPrompts.filter(t=>e?t.code.toLowerCase().includes(n)||t.content.toLowerCase().includes(n):!0);if(r.length===0){t.innerHTML=`<div class="prompt-empty">暂无匹配的提示词</div>`,F.selectedPromptIndex=-1;return}F.selectedPromptIndex=0,t.innerHTML=r.map((e,t)=>`
    <div class="prompt-item ${t===F.selectedPromptIndex?`selected`:``}" data-index="${t}" data-code="${e.code}">
      <span class="prompt-item-content">${e.content}</span>
      <span class="prompt-item-code">/${e.code}</span>
    </div>
  `).join(``),t.querySelectorAll(`.prompt-item`).forEach(e=>{e.addEventListener(`click`,t=>{let n=e.dataset.code;t.ctrlKey||t.metaKey?Oi(n):ki(n)})})}function Di(e){e.forEach((e,t)=>{t===F.selectedPromptIndex?e.classList.add(`selected`):e.classList.remove(`selected`)})}function Oi(e){let t=F.customPrompts.find(t=>t.code===e);if(!t)return;let n=document.getElementById(`userInput`),r=n.value,i=r.lastIndexOf(`/`),a=r;if(i!==-1){let e=-1;for(let t=i-1;t>=0;t--)if(r[t]===`
`){e=t;break}a=e===-1?r.substring(0,i).trimEnd():r.substring(0,e+1).trimEnd()}n.value=a+(a&&!a.endsWith(`
`)?`

`:``)+t.content,n.focus(),n.selectionStart=n.selectionEnd=n.value.length,Ci(),Re(),console.log(`[SidePanel] 已追加提示词到输入框:`,t.code,t.content)}async function ki(e){let t=F.customPrompts.find(t=>t.code===e);if(!t)return;if(F.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}Ci();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove();let r=t.content,i=F.enableSelectionQuery&&F.selectedContextText&&F.selectedContextText.trim(),a=F.quotedContextText&&F.quotedContextText.trim();if(a){let e=F.quotedContextText.trim();r=`[引用内容]\n${e}\n\n[用户问题]\n${t.content}`,Jr(`quoted`,e,!1),F.quotedContextText=``}else if(i){let e=F.selectedContextText.trim();r=`[选中内容]\n${e}\n\n[用户问题]\n${t.content}`,Jr(`selected`,e,!1),F.selectedContextText=``}(i||a)&&yi();let o=Hr(r);Z(`user`,Hr(t.content)),F.messageHistory.push({role:`user`,content:o}),G(),qe(t.content);let s=document.getElementById(`userInput`);s.value=``,s.style.height=`auto`,F.isGenerating=!0;let c=document.getElementById(`sendBtn`);c.disabled=!0;let l=ui(),u=F.activeSessionId,d=F.enableImageInput&&F.attachedImages.length>0&&F.imageModelName||F.currentModel;if(F.attachedImages.length>0){let e=document.getElementById(`imagePreviewBar`);e&&(e.innerHTML=``)}try{await We(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,F.isolateChat),console.log(`  - chatConfig:`,F.chatConfig),console.log(`  - messageHistory.length:`,F.messageHistory.length);let e=[{role:`system`,content:Ve()}];if(F.isolateChat){let t=F.messageHistory;F.chatConfig.maxMemoryMessages!==null&&F.chatConfig.maxMemoryMessages!==void 0&&F.chatConfig.maxMemoryMessages>0?(t=[...F.messageHistory.slice(0,-1).slice(-F.chatConfig.maxMemoryMessages),F.messageHistory[F.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,F.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,F.chatConfig.maxMemoryMessages),e=[...e,...t];for(let t=0;t<e.length-1;t++)e[t]={...e[t],content:Ur(e[t].content)}}else e.push({role:`user`,content:o});let t=await He(),n,r;try{let i=await di(e,d,F.useTools,t);n=i.content,r=i.executionLog||[]}catch(e){throw Q(l),n=`❌ 请求失败：`+(e.message||`未知错误`),r=e.executionLog||[],Z(`assistant`,n,!0,r),F.messageHistory.push({role:`assistant`,content:n,executionLog:r}),G(),e}Q(l),await Xt(Z(`assistant`,n,!0,r)),F.messageHistory.push({role:`assistant`,content:n,executionLog:r}),G()}catch{}finally{F.generatingSessionIds.delete(u),c.disabled=!1,s.focus(),F.attachedImages=[]}}function Ai(){document.getElementById(`promptManageModal`).classList.add(`show`),$()}function ji(){document.getElementById(`promptManageModal`).classList.remove(`show`);let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=document.getElementById(`promptManageAddBtn`);e&&(e.value=``),t&&(t.value=``),n&&(n.value=``),r&&(r.textContent=`添加提示词`,r.style.background=`#667eea`)}function $(){let e=document.getElementById(`promptManageList`);if(F.customPrompts.length===0){e.innerHTML=`<div class="prompt-empty">暂无提示词，请添加</div>`;return}e.innerHTML=F.customPrompts.map((e,t)=>`
    <div class="prompt-manage-item" draggable="true" data-index="${t}">
      <div class="prompt-manage-item-left">
        <span class="prompt-drag-handle" title="拖拽排序">⋮⋮</span>
        <span class="prompt-manage-item-code">/${e.code}</span>
        <span class="prompt-manage-item-content">${e.content}</span>
      </div>
      <div class="prompt-manage-item-actions">
        <button class="prompt-sort-btn move-up-btn" data-index="${t}" title="上移" ${t===0?`disabled`:``}>↑</button>
        <button class="prompt-sort-btn move-down-btn" data-index="${t}" title="下移" ${t===F.customPrompts.length-1?`disabled`:``}>↓</button>
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
  `).join(``),e.querySelectorAll(`.move-up-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n>0){let e=F.customPrompts[n];F.customPrompts[n]=F.customPrompts[n-1],F.customPrompts[n-1]=e,chrome.storage.local.set({customPrompts:F.customPrompts}),$()}})}),e.querySelectorAll(`.move-down-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n<F.customPrompts.length-1){let e=F.customPrompts[n];F.customPrompts[n]=F.customPrompts[n+1],F.customPrompts[n+1]=e,chrome.storage.local.set({customPrompts:F.customPrompts}),$()}})}),e.querySelectorAll(`.menu-toggle-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);F.customPrompts[n].enabledInMenu=!F.customPrompts[n].enabledInMenu,chrome.storage.local.set({customPrompts:F.customPrompts}),$()})}),e.querySelectorAll(`.edit-btn`).forEach(e=>{e.addEventListener(`click`,()=>{Fi(parseInt(e.dataset.index))})}),e.querySelectorAll(`.delete-btn`).forEach(e=>{e.addEventListener(`click`,()=>{Ii(parseInt(e.dataset.index))})}),bi()}function Mi(e){let t=document.getElementById(`promptErrorModal`),n=document.getElementById(`promptErrorMessage`);n.textContent=e,t.classList.add(`show`)}function Ni(){document.getElementById(`promptErrorModal`).classList.remove(`show`)}function Pi(){let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=t.value.trim(),i=n.value.trim();if(!r||!i){Mi(`请填写编码和内容`);return}let a=e?parseInt(e.value):-1,o=F.customPrompts.findIndex(e=>e.code===r);if(o!==-1&&o!==a){Mi(`编码已存在`);return}a>=0&&a<F.customPrompts.length?F.customPrompts[a]={...F.customPrompts[a],code:r,content:i}:F.customPrompts.push({code:r,content:i,enabledInMenu:!1}),chrome.storage.local.set({customPrompts:F.customPrompts}),t.value=``,n.value=``,e&&(e.value=``);let s=document.getElementById(`promptManageAddBtn`);s.textContent=`添加提示词`,s.style.background=`#667eea`,$()}function Fi(e){let t=F.customPrompts[e];if(!t)return;let n=document.getElementById(`editPromptIndex`),r=document.getElementById(`newPromptCode`),i=document.getElementById(`newPromptContent`),a=document.getElementById(`promptManageAddBtn`);n&&(n.value=e),r.value=t.code,i.value=t.content,a.textContent=`保存修改`,a.style.background=`#ffa502`,r.scrollIntoView({behavior:`smooth`})}function Ii(e){let t=F.customPrompts[e];if(!t)return;F.pendingDeleteIndex=e;let n=document.getElementById(`deleteConfirmModal`),r=document.getElementById(`deleteConfirmMessage`);r.textContent=`确定要删除提示词 "/${t.code}" 吗？`,n.classList.add(`show`)}function Li(){document.getElementById(`deleteConfirmModal`).classList.remove(`show`),F.pendingDeleteIndex=-1}function Ri(e){F.customPrompts.splice(e,1),chrome.storage.local.set({customPrompts:F.customPrompts}),$()}function zi(){let e=document.getElementById(`promptManageCancelBtn`),t=document.getElementById(`promptManageAddBtn`),n=document.getElementById(`promptModalCloseBtn`);e&&e.addEventListener(`click`,ji),t&&t.addEventListener(`click`,Pi),n&&n.addEventListener(`click`,ji);let r=document.getElementById(`deleteCancelBtn`),i=document.getElementById(`deleteConfirmBtn`);r&&r.addEventListener(`click`,Li),i&&i.addEventListener(`click`,()=>{F.pendingDeleteIndex>=0&&Ri(F.pendingDeleteIndex),Li()});let a=document.getElementById(`deleteConfirmModal`);a&&a.addEventListener(`click`,e=>{e.target===a&&Li()});let o=document.getElementById(`promptErrorConfirmBtn`);o&&o.addEventListener(`click`,Ni);let s=document.getElementById(`promptErrorModal`);s&&s.addEventListener(`click`,e=>{e.target===s&&Ni()})}function Bi(){let e=document.getElementById(`toolsPopupOverlay`);if(!e)return;F.currentCategory=`all`,F.currentSearch=``;let t=document.getElementById(`toolsSearchInput`);t&&(t.value=``),qi(),Ji(),chrome.storage.local.get([`enableToolPreselect`],e=>{let t=document.getElementById(`toolsPreselectToggle`);t&&(t.checked=e.enableToolPreselect===void 0?!0:e.enableToolPreselect)}),document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),Hi(),e.classList.add(`show`),console.log(`[SidePanel] 打开工具弹窗`)}function Vi(){let e=document.getElementById(`toolsPopupOverlay`);e&&(document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.style.background=``,e.style.color=``,e.style.borderColor=``}),e.classList.remove(`show`),console.log(`[SidePanel] 关闭工具弹窗`))}function Hi(){let t=document.getElementById(`toolsPopupList`);if(!t)return;t.innerHTML=``;let n={};e.forEach(e=>{if(F.currentCategory!==`all`&&e.category!==F.currentCategory)return;if(F.currentSearch){let t=e.name.toLowerCase().includes(F.currentSearch),n=e.description.toLowerCase().includes(F.currentSearch);if(!t&&!n)return}let t=e.category||`other`;n[t]||(n[t]=[]),n[t].push(e)});let r=Le;if(Ie.forEach(i=>{let a=n[i];if(!a||a.length===0)return;let o=e.filter(e=>e.category===i),s=o.length,c=o.filter(e=>F.enabledTools.includes(e.id)).length,l=document.createElement(`div`);l.className=`popup-tool-category-group`,l.dataset.category=i;let u=document.createElement(`div`);u.className=`popup-tool-category`,u.dataset.category=i;let d=F.collapsedCategories[i]||!1;u.innerHTML=`
      <span class="category-expand-icon">${d?`▶`:`▼`}</span>
      <span class="category-name">${r[i]||i}</span>
      <span class="category-count">${c}/${s}</span>
    `,u.addEventListener(`click`,()=>{Ui(i)}),l.appendChild(u);let f=document.createElement(`div`);f.className=`popup-tool-items ${d?`collapsed`:``}`,a.forEach(e=>{let t=F.enabledTools.includes(e.id),n=document.createElement(`div`);n.className=`popup-tool-item`,n.dataset.category=i,n.innerHTML=`
        <input type="checkbox" id="tool_${e.id}" ${t?`checked`:``}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${R(e.name)}</div>
          <div class="popup-tool-desc">${R(e.description)}</div>
        </div>
      `;let r=n.querySelector(`input[type="checkbox"]`);r&&r.addEventListener(`change`,t=>{if(t.stopPropagation(),t.target.checked)F.enabledTools.includes(e.id)||F.enabledTools.push(e.id);else{let t=F.enabledTools.indexOf(e.id);t>-1&&F.enabledTools.splice(t,1)}Wi(i),qi(),Ji()}),f.appendChild(n)}),l.appendChild(f),t.appendChild(l)}),t.children.length===0){let e=document.createElement(`div`);e.className=`popup-tool-empty`,e.textContent=`没有找到匹配的工具`,t.appendChild(e)}}function Ui(e){F.collapsedCategories[e]=!F.collapsedCategories[e];let t=document.querySelector(`.popup-tool-category-group[data-category="${e}"]`);if(!t)return;let n=t.querySelector(`.popup-tool-category`).querySelector(`.category-expand-icon`),r=t.querySelector(`.popup-tool-items`);F.collapsedCategories[e]?(n.textContent=`▶`,r.classList.add(`collapsed`)):(n.textContent=`▼`,r.classList.remove(`collapsed`))}function Wi(t){let n=document.querySelector(`.popup-tool-category[data-category="${t}"]`);if(!n)return;let r=n.querySelector(`.category-count`);if(!r)return;let i=e.filter(e=>e.category===t),a=i.length,o=0;i.forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&t.checked&&o++}),r.textContent=`${o}/${a}`}function Gi(){return e.filter(e=>{if(F.currentCategory!==`all`&&e.category!==F.currentCategory)return!1;if(F.currentSearch){let t=e.name.toLowerCase().includes(F.currentSearch.toLowerCase()),n=e.description.toLowerCase().includes(F.currentSearch.toLowerCase());if(!t&&!n)return!1}return!0})}function Ki(){Ie.forEach(e=>{Wi(e)})}function qi(){let t=[`all`,...Ie],n=new Set(e.map(e=>e.id)),r=F.enabledTools.filter(e=>n.has(e)).length;t.forEach(t=>{let n=document.getElementById(`badge-`+t);if(!n)return;let i=0,a=0;if(t===`all`)i=e.length,a=r;else{let n=e.filter(e=>e.category===t);i=n.length,a=n.filter(e=>F.enabledTools.includes(e.id)).length}n.textContent=`${a}/${i}`})}function Ji(){let t=document.getElementById(`toolsEnabledCount`);if(!t)return;let n=e.length,r=new Set(e.map(e=>e.id));t.textContent=`(已启用 ${F.enabledTools.filter(e=>r.has(e)).length}/${n})`}function Yi(){let t=[];new Set(e.map(e=>e.id)),e.forEach(e=>{let n=document.getElementById(`tool_`+e.id);n?n.checked&&t.push(e.id):F.enabledTools.includes(e.id)&&t.push(e.id)}),F.enabledTools=t,F.useTools=F.enabledTools.length>0,chrome.storage.local.set({enabledTools:F.enabledTools},()=>{console.log(`[SidePanel] 工具配置已保存:`,F.enabledTools)}),gn().catch(()=>{});let n=document.getElementById(`toolsPreselectToggle`);n&&chrome.storage.local.set({enableToolPreselect:n.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已保存:`,n.checked)}),Xi(),L(F.useTools?`已启用 ${F.enabledTools.length} 个工具`:`工具已全部禁用`,`success`)}function Xi(){let t=document.getElementById(`toolsToggleBtn`),n=document.getElementById(`toolsBadge`),r=new Set(e.map(e=>e.id)),i=F.enabledTools.filter(e=>r.has(e)).length;t&&(F.useTools&&i>0?(t.classList.add(`active`),t.title=`工具 (${i}个启用)`):(t.classList.remove(`active`),t.title=`工具 (未启用)`)),n&&(i>0?(n.textContent=i,n.style.display=`inline`):n.style.display=`none`)}function Zi(e,t){let n=document.getElementById(`tokenStatsOverlay`),r=document.getElementById(`tokenStatsClose`),i=document.getElementById(`tokenStatsRefreshBtn`),a=document.getElementById(`tokenStatsClearBtn`);if(!n)return;function o(){n.style.display=`flex`,c()}function s(){n.style.display=`none`}window.openTokenStats=o,r&&r.addEventListener(`click`,s),n&&n.addEventListener(`click`,e=>{e.target===n&&s()}),i&&i.addEventListener(`click`,c),a&&a.addEventListener(`click`,async()=>{await t(`确定要清空所有 Token 使用统计吗？此操作不可撤销。`,`清空统计`)&&(await g(),c())});async function c(){let t=e(),n=document.getElementById(`tokenStatsLoading`),r=document.getElementById(`tokenStatsEmpty`),i=document.getElementById(`tokenStatsContent`);n&&(n.style.display=``),r&&(r.style.display=`none`),i&&(i.style.display=`none`);try{let[e,a]=await Promise.all([h(t),f()]);if(n&&(n.style.display=`none`),!(a&&a.totalApiCalls>0)){r&&(r.style.display=``);return}i&&(i.style.display=``),l(e),u(a),d(e.records||[])}catch(e){console.error(`[TokenStats] 加载统计失败:`,e),n&&(n.style.display=`none`),r&&(r.textContent=`加载失败`,r.style.display=``)}}function l(e){let t=document.getElementById(`tokenSessionStats`);if(!t)return;if(!e||e.apiCallCount===0){t.innerHTML=`<div style="text-align:center;color:#999;padding:20px;">当前会话暂无数据</div>`;return}let n=e.totalTokens>0?(e.totalPromptTokens/e.totalTokens*100).toFixed(1):0,r=e.totalTokens>0?(e.totalCompletionTokens/e.totalTokens*100).toFixed(1):0;t.innerHTML=`
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
      </div>`))}function d(e){let t=document.getElementById(`tokenRecentCalls`);if(!t)return;if(!e||e.length===0){t.innerHTML=``;return}let n={react_loop:`ReAct`,non_stream:`普通`,reflection:`反思`,tool_reflection:`工具反思`,subtask_reflection:`子任务反思`};t.innerHTML=e.slice(0,10).map((e,t)=>{let r=new Date(e.timestamp).toLocaleTimeString(`zh-CN`,{hour:`2-digit`,minute:`2-digit`,second:`2-digit`}),i=n[e.callType]||e.callType;return`<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f5f5f5;font-size:12px;">
        <span style="color:#999;">#${t+1}</span>
        <span style="color:#666;">${r}</span>
        <span style="background:#f0f0f5;padding:1px 6px;border-radius:3px;font-size:10px;color:#666;">${R(i)}</span>
        <span style="font-weight:500;color:#333;">${p(e.totalTokens)}</span>
        <span style="color:#aaa;font-size:10px;">${(e.contextUsageRate*100).toFixed(1)}%</span>
      </div>`}).join(``)}function p(e){return e>=1e6?(e/1e6).toFixed(1)+`M`:e>=1e3?(e/1e3).toFixed(1)+`K`:String(e)}}chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.chatMaxMemoryMessages&&(F.chatConfig.maxMemoryMessages=e.chatMaxMemoryMessages.newValue,Qi(),console.log(`[SidePanel] 记忆限制配置已更新:`,F.chatConfig.maxMemoryMessages))});function Qi(){let e=document.getElementById(`memoryLimitLabel`);e&&(F.chatConfig.maxMemoryMessages!==null&&F.chatConfig.maxMemoryMessages!==void 0&&F.chatConfig.maxMemoryMessages>0?e.textContent=`(${F.chatConfig.maxMemoryMessages})`:e.textContent=`(全)`,e.style.display=`inline`,e.style.cursor=`pointer`,e.title=`点击设置记忆历史限制条数`)}function $i(e){e.preventDefault(),e.stopPropagation();let t=document.getElementById(`memoryLimitDropdown`);if(t.classList.toggle(`show`),t.classList.contains(`show`)){let e=F.chatConfig.maxMemoryMessages;t.querySelectorAll(`.memory-limit-option`).forEach(t=>{t.classList.remove(`selected`);let n=parseInt(t.dataset.value);(e===null&&n===0||e!==null&&e>0&&n===e)&&t.classList.add(`selected`)});let n=t.querySelector(`#memoryLimitInput`);e!==null&&e>0?n.value=e:n.value=``}}function ea(){let e=document.getElementById(`memoryLimitDropdown`),t=document.getElementById(`memoryLimitLabel`),n=e?.querySelector(`#memoryLimitInput`);if(!e||!t)return;Qi(),t.addEventListener(`click`,$i);let r=e.querySelectorAll(`.memory-limit-option`);r.forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let i=parseInt(e.dataset.value),a=i===0?null:i;r.forEach(e=>e.classList.remove(`selected`)),e.classList.add(`selected`),n&&(n.value=i===0?``:i),chrome.storage.local.set({chatMaxMemoryMessages:a},()=>{F.chatConfig.maxMemoryMessages=a,Qi(),L(`✅ 配置已更新`,`success`)})})}),n&&(n.addEventListener(`click`,e=>e.stopPropagation()),n.addEventListener(`mousedown`,e=>e.stopPropagation()),n.addEventListener(`change`,e=>{e.stopPropagation();let t=e.target.value.trim(),n=t&&parseInt(t)>0?parseInt(t):null;r.forEach(e=>e.classList.remove(`selected`)),chrome.storage.local.set({chatMaxMemoryMessages:n},()=>{F.chatConfig.maxMemoryMessages=n,Qi(),L(`✅ 配置已更新`,`success`)})})),document.addEventListener(`click`,n=>{!e.contains(n.target)&&n.target!==t&&e.classList.remove(`show`)})}function ta(e){document.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?(t.classList.add(`selected`),t.querySelector(`.model-option-check`).textContent=`✓`):(t.classList.remove(`selected`),t.querySelector(`.model-option-check`).textContent=``)})}function na(e,t){let n=document.getElementById(`tempDropdown`);if(!n){typeof t==`function`&&t();return}chrome.storage.local.get([`deletedPresetModels`],r=>{if((r.deletedPresetModels||[]).forEach(e=>{let t=n.querySelector(`.model-option[data-value="${e}"]`);t&&t.remove()}),!e||e.length===0){typeof t==`function`&&t();return}let i=[`deepseek-v4-pro`,`deepseek-v4-flash`];e.forEach(e=>{if(i.includes(e)||n.querySelector(`.model-option[data-value="${e}"]`))return;let t=document.createElement(`div`);t.className=`model-option`,t.dataset.value=e,t.innerHTML=`<span class="model-option-check"></span>${e}`,t.addEventListener(`click`,t=>{t.stopPropagation(),F.currentModel=e,ta(e),chrome.storage.local.set({modelName:e})}),n.querySelector(`.model-section`).appendChild(t)}),typeof t==`function`&&t()})}function ra(e,t=`📌 已选中`){if(!F.enableSelectionQuery)return;F.quotedContextText=``,F.selectedContextText=e;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let i;i=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,r.textContent=`${t}: ${i}`,n.classList.add(`show`)}}function ia(e,t,n=0,r=0){if(!F.enableSelectionQuery)return;let i=document.getElementById(`selectionFloatingMenu`),a=document.getElementById(`selectionMenuItems`);if(!i||!a)return;let o=F.customPrompts.filter(e=>e.enabledInMenu===!0);if(o.length===0)return;a.innerHTML=``,o.forEach(e=>{let n=e.content.length>10?e.content.substring(0,10)+`...`:e.content,r=document.createElement(`div`);r.className=`menu-item`,r.innerHTML=`
      <span>${n}</span>
      <span class="menu-item-code">/${e.code}</span>
    `,r.addEventListener(`click`,n=>{n.stopPropagation(),aa(e,t)}),a.appendChild(r)});let s=document.body.getBoundingClientRect(),c=40+o.length*36,l=r-s.top-c-30,u=n-s.left-20;l<s.top+10&&(l=r-s.top+30),u<s.left+10&&(u=n-s.left+20),u+180>s.right-10&&(u=n-s.left-180-30,u<s.left+10&&(u=n-s.left+20)),l+c>s.bottom-10&&(l=r-s.top-c-30,l<s.top+10&&(l=r-s.top+30)),i.style.top=l+`px`,i.style.left=u+`px`,i.style.maxHeight=s.bottom-l-20+`px`,i.classList.add(`show`)}window.hideFloatingMenu=function(){let e=document.getElementById(`selectionFloatingMenu`);e&&e.classList.remove(`show`),F.lastSelectedText=``,F.currentSelectionRange=null};async function aa(e,t){if(!F.enableSelectionQuery)return;if(window.hideFloatingMenu(),F.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}F.selectedContextText=t,mr();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove(),Jr(`selected`,t,!1);let r=`[选中内容]\n${t}\n\n[用户问题]\n${e.content}`;Z(`user`,e.content),F.messageHistory.push({role:`user`,content:r}),G(),qe(e.content),F.isGenerating=!0;let i=document.getElementById(`sendBtn`);i.disabled=!0;let a=ui(),o=F.activeSessionId,s=F.currentModel;try{await We(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,F.isolateChat),console.log(`  - chatConfig:`,F.chatConfig),console.log(`  - messageHistory.length:`,F.messageHistory.length);let e=[{role:`system`,content:Ve()}];if(F.isolateChat){let t=F.messageHistory;F.chatConfig.maxMemoryMessages!==null&&F.chatConfig.maxMemoryMessages!==void 0&&F.chatConfig.maxMemoryMessages>0?(t=[...F.messageHistory.slice(0,-1).slice(-F.chatConfig.maxMemoryMessages),F.messageHistory[F.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,F.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,F.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:r});let t=await He(),n,i;try{let r=await di(e,s,F.useTools,t);n=r.content,i=r.executionLog||[]}catch(e){throw Q(a),n=`❌ 请求失败：`+(e.message||`未知错误`),i=e.executionLog||[],Z(`assistant`,n,!0,i),F.messageHistory.push({role:`assistant`,content:n,executionLog:i}),G(),e}Q(a),await Xt(Z(`assistant`,n,!0,i)),F.messageHistory.push({role:`assistant`,content:n,executionLog:i}),G()}catch{}finally{F.generatingSessionIds.delete(o),i.disabled=!1,document.getElementById(`userInput`).focus()}}function oa(e){let t=document.getElementById(`headerAgentDot`),n=document.getElementById(`headerAgentIndicator`);if(!(!t||!n))if(!e||!e.connected)t.className=`header-agent-dot disconnected`,n.title=`Agent 未连接 - 点击前往设置`;else{t.className=`header-agent-dot connected`;let r=[`Agent 已连接`];e.platformName&&r.push(e.platformName),e.arch&&r.push(e.arch),n.title=r.join(` | `)+` - 点击前往设置`}}document.addEventListener(`DOMContentLoaded`,async()=>{window.__tableBlocks=[],await Ge(),await dr(),chrome.runtime.onMessage.addListener(e=>{e.type===`SELECTION_AI_SEARCH`&&e.prompt&&(console.log(`[SidePanel] 收到选中文本 AI 搜索:`,e.selectedText?.substring(0,50)),Gr(e.prompt,e.selectedText),chrome.storage.session.remove(`pendingSelectionSearch`).catch(()=>{})),e.type===`FILL_SIDEPANEL_INPUT`&&e.text&&(console.log(`[SidePanel] 收到追问填充:`,e.text?.substring(0,50)),Kr(e.text),chrome.storage.session.remove(`pendingFillInput`).catch(()=>{})),e.type===`DIRECT_SEND`&&e.text&&(console.log(`[SidePanel] 收到直接发送:`,e.text?.substring(0,50)),qr(e.text,e.selectedText||``),chrome.storage.session.remove(`pendingDirectSend`).catch(()=>{})),e.type===`AGENT_STATUS_CHANGE`&&(console.log(`[SidePanel] 收到 Agent 状态变化:`,e.connected,e.status),chrome.storage.local.get(`agentPlatform`,e=>{F.agentPlatform=e.agentPlatform||{connected:!1},oa(F.agentPlatform)})),e.type===`AGENT_CONNECTION_CHANGED`&&(console.log(`[SidePanel] 收到 Agent 连接状态变更:`,e.connected),F.agentPlatform={...F.agentPlatform,connected:e.connected},oa(F.agentPlatform))});let t=await chrome.storage.session.get(`pendingSelectionSearch`);if(t.pendingSelectionSearch&&t.pendingSelectionSearch.selectedText){let{prompt:e,selectedText:n}=t.pendingSelectionSearch;console.log(`[SidePanel] 有待处理的选中文本搜索:`,n?.substring(0,50)),setTimeout(()=>{Gr(e,n)},500),await chrome.storage.session.remove(`pendingSelectionSearch`)}let n=await chrome.storage.session.get(`pendingFillInput`);if(n.pendingFillInput&&n.pendingFillInput.text){let{text:e}=n.pendingFillInput;console.log(`[SidePanel] 有待填充的追问文本:`,e?.substring(0,50)),setTimeout(()=>{Kr(e)},500),await chrome.storage.session.remove(`pendingFillInput`)}let r=await chrome.storage.session.get(`pendingDirectSend`);if(r.pendingDirectSend&&r.pendingDirectSend.text){let{text:e,selectedText:t}=r.pendingDirectSend;console.log(`[SidePanel] 有待直接发送的文本:`,e?.substring(0,50)),setTimeout(()=>{qr(e,t||``)},500),await chrome.storage.session.remove(`pendingDirectSend`)}chrome.tabs.onActivated.addListener(async e=>{console.log(`[SidePanel] Tab 切换, 新 Tab ID:`,e.tabId),F.currentTabId=e.tabId}),chrome.tabs.onUpdated.addListener(async(e,t)=>{t.status===`complete`&&F.currentTabId===e&&console.log(`[SidePanel] 当前 Tab 页面更新:`,t)}),typeof marked<`u`&&(marked.setOptions({breaks:!0,gfm:!0}),console.log(`[SidePanel] Marked 库已加载`)),typeof mermaid<`u`&&(mermaid.initialize({startOnLoad:!1,theme:`default`,securityLevel:`loose`,fontFamily:`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`}),console.log(`[SidePanel] Mermaid 库已加载`));let i=document.getElementById(`userInput`),a=document.getElementById(`sendBtn`),o=document.getElementById(`clearChatBtn`),s=document.getElementById(`exportChatBtn`),c=document.getElementById(`chatContainer`),l=document.getElementById(`tempDisplay`),u=document.getElementById(`tempDropdown`),d=document.getElementById(`tempPresetList`),f=document.getElementById(`tempSlider`),p=document.getElementById(`tempNumberInput`);function m(){if(!i||F.isScrolling)return;i.style.height=`auto`;let e=i.scrollHeight;e<=50?i.style.height=``:i.style.height=Math.min(e,100)+`px`}chrome.storage.local.get([`temperature`,`topP`,`selectedTempIndex`],e=>{e.temperature!==void 0&&(F.temperature=e.temperature),e.topP!==void 0&&(F.topP=e.topP),e.selectedTempIndex!==void 0&&(F.selectedTempIndex=e.selectedTempIndex),h()});function h(){f&&(f.value=F.temperature),p&&(p.value=F.temperature.toFixed(2));let e=document.getElementById(`tempIconValue`);e&&(e.textContent=F.temperature.toFixed(2)),g()}function g(){d.innerHTML=I.map((e,t)=>`
      <div class="temp-preset-item ${t===F.selectedTempIndex?`selected`:``}" data-index="${t}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${e.label}</div>
          <div class="temp-preset-desc" title="${e.tip}">${e.tip}</div>
        </div>
        <div class="temp-preset-value">${e.temp.toFixed(2)}</div>
      </div>
    `).join(``),d.querySelectorAll(`.temp-preset-item`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation(),_(parseInt(e.dataset.index))})})}function _(e){let t=I[e];t&&(F.selectedTempIndex=e,F.temperature=t.temp,h(),chrome.storage.local.set({temperature:F.temperature,topP:F.topP,selectedTempIndex:F.selectedTempIndex}))}f.addEventListener(`input`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),F.temperature=t,p.value=t.toFixed(2);let n=document.getElementById(`tempIconValue`);n&&(n.textContent=t.toFixed(2));let r=0,i=Math.abs(I[0].temp-t);for(let e=1;e<I.length;e++){let n=Math.abs(I[e].temp-t);n<i&&(i=n,r=e)}F.selectedTempIndex=r,g(),chrome.storage.local.set({temperature:F.temperature,topP:F.topP,selectedTempIndex:F.selectedTempIndex})}),p.addEventListener(`change`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),F.temperature=t,f.value=t,p.value=t.toFixed(2);let n=0,r=Math.abs(I[0].temp-t);for(let e=1;e<I.length;e++){let i=Math.abs(I[e].temp-t);i<r&&(r=i,n=e)}F.selectedTempIndex=n,g(),chrome.storage.local.set({temperature:F.temperature,topP:F.topP,selectedTempIndex:F.selectedTempIndex})}),l&&u&&(l.addEventListener(`click`,e=>{e.stopPropagation(),u.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{let t=document.querySelector(`.temp-selector`);t&&!t.contains(e.target)&&u.classList.remove(`show`)})),c.addEventListener(`mousedown`,e=>{F.lastMouseX=e.clientX,F.lastMouseY=e.clientY}),c.addEventListener(`mouseup`,e=>{F.lastMouseX=e.clientX,F.lastMouseY=e.clientY,F.enableSelectionQuery&&setTimeout(()=>{let e=window.getSelection();if(e&&!e.isCollapsed&&e.toString().trim()){let t=e.toString().trim();c.contains(e.anchorNode)&&t!==F.lastSelectedText&&(F.lastSelectedText=t,F.currentSelectionRange=e.getRangeAt(0).cloneRange(),ra(t),ia(e,t,F.lastMouseX,F.lastMouseY))}else c.contains(e.anchorNode)||(F.lastSelectedText=``,F.currentSelectionRange=null,window.hideFloatingMenu())},10)});let v=``,y=null;async function b(){try{let e=await new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>e(t))});if(e&&e.length>0){let t=await new Promise(t=>{chrome.tabs.sendMessage(e[0].id,{action:`getSelectedText`},e=>{chrome.runtime.lastError?(console.debug(`[SidePanel] content script 未加载或无法通信:`,chrome.runtime.lastError.message),t(null)):t(e)})});if(!t)return;let n=t?.text||``;n&&n.trim()?n!==v&&(v=n,ra(n.trim())):v=``}}catch{}}function x(){y&&=(clearInterval(y),null),F.enableSelectionQuery&&(y=setInterval(b,500))}x(),chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&`enableSelectionQuery`in e&&(F.enableSelectionQuery=e.enableSelectionQuery.newValue,x())}),chrome.storage.local.get([`modelName`,`customModels`,`customPrompts`,`systemPrompt`,`inputHistory`,`agentPlatform`,`enableImageInput`,`imageModelName`,`imageApiBase`,`imageApiKey`],e=>{let t=e.modelName;t&&(F.currentModel=t),F.customPrompts=e.customPrompts||[],F.systemPrompt=e.systemPrompt||``,F.inputHistory=e.inputHistory||[],e.agentPlatform&&(F.agentPlatform=e.agentPlatform),oa(F.agentPlatform),F.enableImageInput=e.enableImageInput||!1,F.imageModelName=e.imageModelName||``,F.imageApiBase=e.imageApiBase||``,F.imageApiKey=e.imageApiKey||``,sa(),xi(),na(e.customModels,()=>{t&&ta(t)})}),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`){if(e.customModels){let t=e.customModels.newValue||[],n=u.querySelector(`.model-section`);n&&n.querySelectorAll(`.model-option`).forEach(e=>{let t=e.dataset.value;t!==`deepseek-v4-pro`&&t!==`deepseek-v4-flash`&&e.remove()}),na(t)}if(e.modelName){let t=e.modelName.newValue;t&&(F.currentModel=t,ta(t))}e.enableImageInput&&(F.enableImageInput=e.enableImageInput.newValue,sa()),e.imageModelName&&(F.imageModelName=e.imageModelName.newValue||``),e.imageApiBase&&(F.imageApiBase=e.imageApiBase.newValue||``),e.imageApiKey&&(F.imageApiKey=e.imageApiKey.newValue||``),e.deletedPresetModels&&(e.deletedPresetModels.newValue||[]).forEach(e=>{let t=u.querySelector(`.model-option[data-value="${e}"]`);t&&t.remove()})}}),hr(),document.addEventListener(`session-switched`,()=>{let e=document.getElementById(`chatContainer`),t=document.getElementById(`sendBtn`),n=document.getElementById(`userInput`);if(!e)return;if(F.executionLogListener&&=(chrome.runtime.onMessage.removeListener(F.executionLogListener),null),t&&(t.disabled=F.isGenerating),n&&n.focus(),e.innerHTML=``,!F.messageHistory||F.messageHistory.length===0){let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      `,e.appendChild(t)}else F.messageHistory.forEach(e=>{Z(e.role,e.content,!1,e.executionLog||[])}),Wt();let r=F.pendingCallApiSessionIds.has(F.activeSessionId)&&!!F.pendingCancelApi;if(console.log(`[SidePanel] session-switched: pendingTask?`,r,`pendingSessionIds:`,[...F.pendingCallApiSessionIds],`activeSessionId:`,F.activeSessionId,`hasCancelApi:`,!!F.pendingCancelApi),r){console.log(`[SidePanel] 切回有后台任务的会话，显示加载状态`);let e=ui();F.substituteLoadingIds.set(F.activeSessionId,e)}let i=`scrollPosition_`+(F.activeSessionId||`default`);chrome.storage.local.get([i],e=>{e[i]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t&&(t.scrollTop=e[i])},150)})}),document.querySelectorAll(`.model-option`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.value;F.currentModel=n,ta(n),chrome.storage.local.set({modelName:n})})}),document.addEventListener(`click`,e=>{let t=document.getElementById(`promptDropdown`),n=document.getElementById(`promptSelector`),r=document.getElementById(`selectionFloatingMenu`);if(n.contains(e.target)||(t.classList.remove(`show`),Ci()),r&&!r.contains(e.target)){let t=window.getSelection(),n=c.contains(e.target),r=t&&!t.isCollapsed&&c.contains(t.anchorNode);(!n||!r)&&window.hideFloatingMenu()}}),a.addEventListener(`click`,Wr);let S=document.getElementById(`promptTriggerBtn`);S&&S.addEventListener(`click`,e=>{e.stopPropagation(),S.blur(),wi()});let C=document.getElementById(`shortcutsBtn`),w=document.getElementById(`shortcutsModal`),T=document.getElementById(`shortcutsCloseBtn`);function E(){w&&(w.style.display=`flex`)}function ee(){w&&(w.style.display=`none`)}C&&C.addEventListener(`click`,e=>{e.stopPropagation(),E();let t=document.getElementById(`headerMoreDropdown`);t&&t.classList.remove(`show`)}),T&&T.addEventListener(`click`,ee),w&&w.addEventListener(`click`,e=>{e.target===w&&ee()}),document.addEventListener(`keydown`,e=>{if((e.ctrlKey||e.metaKey)&&e.key===`t`){e.preventDefault();let t=document.getElementById(`toolsPopup`);t&&t.style.display!==`none`?Vi():Bi()}if(e.key===`Escape`&&w&&w.style.display!==`none`){ee();return}if(e.altKey&&e.code===`Slash`){e.preventDefault(),E();return}if(e.altKey&&!e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey){e.preventDefault(),la();return}if(e.altKey&&e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey){e.preventDefault(),ua();return}if(e.altKey&&(e.key===`ArrowUp`||e.key===`ArrowDown`)){let t=document.getElementById(`chatContainer`);if(!t)return;let n=t.querySelectorAll(`.message.user, .message.assistant, .user-context-bubble`);if(e.shiftKey){e.preventDefault(),e.key===`ArrowUp`&&n.length>0?n[0].scrollIntoView({behavior:`smooth`,block:`start`}):e.key===`ArrowDown`&&n.length>0&&n[n.length-1].scrollIntoView({behavior:`smooth`,block:`start`});return}if(n.length===0)return;let r=t.getBoundingClientRect().top;if(e.key===`ArrowUp`){e.preventDefault();let t=-1;for(let e=0;e<n.length;e++)if(n[e].getBoundingClientRect().bottom>r+10){t=e;break}t===-1&&(t=n.length);let i=t-1;i>=0&&n[i].scrollIntoView({behavior:`smooth`,block:`start`})}else if(e.key===`ArrowDown`){e.preventDefault();let t=-1;for(let e=0;e<n.length;e++)if(n[e].getBoundingClientRect().bottom>r+10){t=e;break}if(t===-1)return;let i=t+1;i<n.length&&n[i].scrollIntoView({behavior:`smooth`,block:`start`})}}}),i.addEventListener(`keydown`,e=>{let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);if(t.style.display!==`none`&&n.classList.contains(`show`)){let t=n.querySelectorAll(`.prompt-item`),r=t.length;if(r!==0&&e.key===`ArrowDown`){e.preventDefault(),F.selectedPromptIndex<0?F.selectedPromptIndex=0:F.selectedPromptIndex=(F.selectedPromptIndex+1)%r,Di(t);return}if(e.key===`ArrowUp`){e.preventDefault(),F.selectedPromptIndex<0||F.selectedPromptIndex===0?F.selectedPromptIndex=r-1:--F.selectedPromptIndex,Di(t);return}if(e.key===`Enter`&&(e.ctrlKey||e.metaKey)&&F.selectedPromptIndex>=0){e.preventDefault();let n=t[F.selectedPromptIndex].dataset.code;Oi(n);return}if(e.key===`Enter`&&F.selectedPromptIndex>=0){e.preventDefault();let n=t[F.selectedPromptIndex].dataset.code;ki(n);return}if(e.key===`Escape`){Ci();return}}if(e.key===`Escape`){F.inputHistoryIndex>=0&&(F.inputHistoryIndex=-1),i.value&&(i.value=``,i.style.height=`auto`,i.dispatchEvent(new Event(`input`))),e.preventDefault();return}if(!(t.style.display!==`none`&&n.classList.contains(`show`))&&!F.isGenerating){if(e.key===`ArrowUp`){e.preventDefault(),F.inputHistoryIndex===-1?F.inputHistoryIndex=F.inputHistory.length-1:F.inputHistoryIndex>0&&F.inputHistoryIndex--,F.inputHistoryIndex<0&&(F.inputHistoryIndex=0),F.inputHistoryIndex>=0&&F.inputHistory.length>0&&(i.value=F.inputHistory[F.inputHistoryIndex],i.dispatchEvent(new Event(`input`)));return}if(e.key===`ArrowDown`){e.preventDefault(),F.inputHistoryIndex>=0&&F.inputHistoryIndex<F.inputHistory.length-1?(F.inputHistoryIndex++,i.value=F.inputHistory[F.inputHistoryIndex],i.dispatchEvent(new Event(`input`))):(F.inputHistoryIndex=-1,i.value=``,i.dispatchEvent(new Event(`input`)));return}}e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),Wr())}),i.addEventListener(`paste`,e=>{if(!F.enableImageInput)return;let t=e.clipboardData?.items;if(t){for(let n of t)if(n.type.startsWith(`image/`)){e.preventDefault();let t=n.getAsFile();t&&Br(t);break}}});let te=document.getElementById(`screenshotBtn`);te&&te.addEventListener(`click`,async e=>{if(!F.enableImageInput)return;let t=e.ctrlKey||e.shiftKey||e.metaKey;try{t?await ua():await la()}catch(e){console.error(`[SidePanel] 截图失败:`,e),L(`截图失败，请重试`)}}),zr(),i.addEventListener(`wheel`,e=>{F.isScrolling=!0;let t=i.style.height||i.offsetHeight+`px`;i.style.height=t,i.scrollHeight<=i.clientHeight+10&&(e.preventDefault(),e.stopPropagation()),setTimeout(()=>{F.isScrolling=!1},100)},{passive:!1}),i.addEventListener(`input`,e=>{let t=i.value;document.getElementById(`promptSelector`),document.getElementById(`promptDropdown`);let n=t.lastIndexOf(`/`);if(n!==-1){let e=t.substring(n+1);n===0||t[n-1]===`
`||t[n-1]===` `?Si(e):Ti(e)}else Ci();m()}),c.addEventListener(`scroll`,()=>{let e=`scrollPosition_`+(F.activeSessionId||`default`);chrome.storage.local.set({[e]:c.scrollTop})});let ne=document.getElementById(`headerMoreBtn`),D=document.getElementById(`headerMoreDropdown`);ne&&D&&(ne.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{!D.contains(e.target)&&e.target!==ne&&D.classList.remove(`show`)})),o.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),wr()}),s&&s.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),_r()});let re=document.getElementById(`importChatBtn`);re&&re.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),Sr()});let ie=document.getElementById(`importSessionsFile`);ie&&ie.addEventListener(`change`,e=>{let t=e.target.files[0];t&&Cr(t)});let ae=document.getElementById(`settingsBtn`);ae&&ae.addEventListener(`click`,()=>{chrome.runtime.openOptionsPage()});let oe=document.getElementById(`headerAgentIndicator`);oe&&oe.addEventListener(`click`,async()=>{let e=chrome.runtime.getURL(`options.html#agent`),t=await chrome.tabs.query({url:chrome.runtime.getURL(`options.html`)});t.length>0?await chrome.tabs.update(t[0].id,{active:!0,url:e}):await chrome.tabs.create({url:e})});let se=document.getElementById(`prototypeLibraryBtn`);se&&se.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),Tt()});let ce=document.getElementById(`tokenStatsHeaderBtn`);ce&&ce.addEventListener(`click`,e=>{e.stopPropagation(),D.classList.remove(`show`),window.openTokenStats&&window.openTokenStats()}),Zi(()=>F.activeSessionId,Se);let le=document.getElementById(`isolateChatBtn`),O=document.getElementById(`enableToolsBtn`),ue=document.getElementById(`toolsConfigBtn`);chrome.storage.local.get([`isolateChat`,`enableSelectionQuery`,`enableTools`,`enabledTools`],t=>{t.isolateChat!==void 0&&(F.isolateChat=t.isolateChat),le.checked=F.isolateChat,t.enableSelectionQuery!==void 0&&(F.enableSelectionQuery=t.enableSelectionQuery);let n=document.getElementById(`enableSelectionQueryBtn`);if(n&&(n.checked=F.enableSelectionQuery),t.enableTools!==void 0&&(F.useTools=t.enableTools),t.enabledTools&&t.enabledTools.length>0){let n=new Set(e.map(e=>e.id)),r=t.enabledTools.filter(e=>n.has(e)),i=e.filter(e=>e.enabled&&!r.includes(e.id)).map(e=>e.id);F.enabledTools=[...r,...i],i.length>0&&chrome.storage.local.set({enabledTools:F.enabledTools})}else F.enabledTools=e.filter(e=>e.enabled).map(e=>e.id);F.enabledTools.length===0&&(F.useTools=!1),O&&(O.checked=F.useTools),x()}),le.addEventListener(`change`,()=>{F.isolateChat=le.checked,chrome.storage.local.set({isolateChat:F.isolateChat}),console.log(`[SidePanel] 记忆对话:`,F.isolateChat?`已启用`:`已禁用`)});let de=document.getElementById(`enableSelectionQueryBtn`);de&&de.addEventListener(`change`,()=>{F.enableSelectionQuery=de.checked,chrome.storage.local.set({enableSelectionQuery:F.enableSelectionQuery}),console.log(`[SidePanel] 划词问答:`,F.enableSelectionQuery?`已启用`:`已禁用`),!F.enableSelectionQuery&&F.selectedContextText&&mr()}),O&&O.addEventListener(`change`,()=>{F.useTools=O.checked,chrome.storage.local.set({enableTools:F.useTools}),F.useTools&&F.enabledTools.length===0&&(F.enabledTools=e.filter(e=>e.enabled).map(e=>e.id),chrome.storage.local.set({enabledTools:F.enabledTools})),console.log(`[SidePanel] 工具总开关:`,F.useTools?`已启用`:`已禁用`)}),ue&&ue.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),Bi()});let fe=document.getElementById(`toolsPopupOverlay`),pe=document.getElementById(`toolsPopupClose`),me=fe?fe.querySelector(`.modal-container`):null;pe&&pe.addEventListener(`click`,Vi),me&&me.addEventListener(`click`,e=>{e.stopPropagation()});let he=document.getElementById(`toolsSearchInput`);he&&he.addEventListener(`input`,e=>{F.currentSearch=e.target.value.toLowerCase(),Hi()});let ge=document.querySelectorAll(`.category-btn`);ge.forEach(e=>{e.addEventListener(`click`,()=>{ge.forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.style.background=`#f5f3ff`,e.style.color=`#667eea`,e.style.borderColor=`#d4cfff`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`,F.currentCategory=e.dataset.category,Hi()})});let k=document.getElementById(`toolsCategories`);k&&k.addEventListener(`wheel`,e=>{e.preventDefault(),k.scrollLeft+=e.deltaY*2},{passive:!1});let _e=document.getElementById(`toolsSelectAll`),A=document.getElementById(`toolsSelectNone`);_e&&_e.addEventListener(`click`,()=>{Gi().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!0),F.enabledTools.includes(e.id)||F.enabledTools.push(e.id)}),Ki(),qi(),Ji()}),A&&A.addEventListener(`click`,()=>{Gi().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!1);let n=F.enabledTools.indexOf(e.id);n>-1&&F.enabledTools.splice(n,1)}),Ki(),qi(),Ji()});let ve=document.getElementById(`toolsPopupSave`);ve&&ve.addEventListener(`click`,()=>{Yi(),Ji()});let j=document.getElementById(`toolsPreselectToggle`);j&&j.addEventListener(`change`,()=>{chrome.storage.local.set({enableToolPreselect:j.checked},()=>{console.log(`[SidePanel] 工具预筛选开关已更新:`,j.checked)})});let ye=document.getElementById(`toolsPopupCancel`);ye&&ye.addEventListener(`click`,()=>{Vi()});let be=document.getElementById(`modalCancelBtn`),xe=document.getElementById(`modalConfirmBtn`);function Se(e,t=`确认操作`){return new Promise(n=>{let r=document.getElementById(`customConfirmOverlay`),i=document.getElementById(`customConfirmTitle`),a=document.getElementById(`customConfirmMessage`),o=document.getElementById(`customConfirmCancelBtn`),s=document.getElementById(`customConfirmOkBtn`);if(!r||!i||!a||!o||!s){n(confirm(e));return}let c=()=>{r.style.display=`none`,s.removeEventListener(`click`,l),o.removeEventListener(`click`,u),r.removeEventListener(`click`,d)},l=()=>{c(),n(!0)},u=()=>{c(),n(!1)},d=e=>{e.target===r&&(c(),n(!1))};i.textContent=t,a.textContent=e,r.style.display=`flex`,s.addEventListener(`click`,l),o.addEventListener(`click`,u),r.addEventListener(`click`,d)})}let M=document.getElementById(`toolStatsOverlay`),Ce=document.getElementById(`toolStatsClose`),we=document.getElementById(`toolStatsBtn`);function Te(){M&&(M.style.display=`flex`,P())}function Ee(){M&&(M.style.display=`none`)}we&&we.addEventListener(`click`,e=>{e.stopPropagation(),Te()}),Ce&&Ce.addEventListener(`click`,Ee),M&&M.addEventListener(`click`,e=>{e.target===M&&Ee()});let De=document.getElementById(`toolStatsRefreshBtn`);De&&De.addEventListener(`click`,P);let Oe=document.getElementById(`toolStatsClearBtn`);Oe&&Oe.addEventListener(`click`,async()=>{await Se(`确定要清空所有工具使用统计吗？此操作不可撤销。`,`清空统计`)&&(await chrome.storage.local.remove([`toolUsageStats`]),P())});let N={column:`callCount`,asc:!1};async function P(){let t=document.getElementById(`toolStatsTable`),n=document.getElementById(`toolStatsTableBody`),r=document.getElementById(`toolStatsLoading`),i=document.getElementById(`toolStatsEmpty`),a=document.getElementById(`toolStatsSummary`),o=document.getElementById(`toolStatsUnusedSection`),s=document.getElementById(`toolStatsUnusedList`);if(!(!t||!n||!r||!i)){t.style.display=`none`,i.style.display=`none`,o&&(o.style.display=`none`),a&&(a.textContent=``),r.style.display=``;try{let n=(await chrome.storage.local.get([`toolUsageStats`])).toolUsageStats||{},c=Object.entries(n);if(c.length===0){r.style.display=`none`,i.style.display=``;return}let l={};e.forEach(e=>{l[e.id]=e.name?`${e.name}：${e.description||``}`:e.description||e.id}),ke(c,l);let u=e.map(e=>e.id),d=new Set(c.map(([e])=>e)),f=u.filter(e=>!d.has(e)),p=c.length,m=f.length;a&&(a.textContent=`已使用 ${p} 个，未使用 ${m} 个`),o&&s&&m>0&&(s.innerHTML=f.sort((e,t)=>e.toLowerCase().localeCompare(t.toLowerCase())).map(e=>`<code title="${R(l[e]||e)}" style="padding: 3px 10px; background: #f5f5f5; color: #aaa; border: 1px solid #eee; border-radius: 4px; font-size: 11px;">${e}</code>`).join(``),o.style.display=``),r.style.display=`none`,t.style.display=``}catch(e){console.error(`[SidePanel] 加载统计失败:`,e),r.style.display=`none`,i.textContent=`加载失败`,i.style.display=``}}}function ke(e,t){let n=document.getElementById(`toolStatsTableBody`);if(!n)return;let{column:r,asc:i}=N;n.innerHTML=[...e].sort((e,t)=>{let[n,a]=e,[o,s]=t,c=a.callCount>0?a.successCount/a.callCount*100:0,l=s.callCount>0?s.successCount/s.callCount*100:0,u=a.callCount>0?a.totalDuration/a.callCount:0,d=s.callCount>0?s.totalDuration/s.callCount:0,f=0;switch(r){case`name`:f=n.toLowerCase().localeCompare(o.toLowerCase());break;case`callCount`:f=a.callCount-s.callCount;break;case`successCount`:f=a.successCount-s.successCount;break;case`successRate`:f=c-l;break;case`duration`:f=u-d;break}return i?f:-f}).map(([e,n])=>{let r=n.callCount>0?n.successCount/n.callCount*100:0,i=n.callCount>0?n.totalDuration/n.callCount:0,a=t[e]||e,o=`#38a169`;r<60?o=`#e53e3e`:r<85&&(o=`#d69e2e`);let s=i<1e3?`${Math.round(i)}ms`:`${(i/1e3).toFixed(1)}s`;return`<tr>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee; color: #333;"><code title="${R(a)}">${e}</code></td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #666;">${n.callCount}</td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #666;">${n.successCount}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #eee;">
          <span style="display: inline-block; width: 50px; height: 5px; border-radius: 3px; background: #e0e0e0; vertical-align: middle; margin-right: 6px;">
            <span style="display: inline-block; width: ${r*.5}px; height: 5px; border-radius: 3px; background: ${o}; vertical-align: top;"></span>
          </span>
          <span style="font-size: 12px; color: ${o}; font-weight: 500;">${r.toFixed(0)}%</span>
        </td>
        <td style="padding: 6px 10px; text-align: right; border-bottom: 1px solid #eee; color: #888; font-size: 12px;">${s}</td>
      </tr>`}).join(``),Ae()}function Ae(){let{column:e,asc:t}=N,n=[`name`,`callCount`,`successCount`,`successRate`,`duration`],r={name:`sortByName`,callCount:`sortByCallCount`,successCount:`sortBySuccessCount`,successRate:`sortBySuccessRate`,duration:`sortByDuration`};n.forEach(n=>{let i=document.getElementById(r[n]);if(!i)return;let a=i.querySelector(`.sort-indicator`);a&&(n===e?(a.textContent=t?`▲`:`▼`,a.style.color=`#667eea`):(a.textContent=``,a.style.color=``))})}document.querySelectorAll(`#toolStatsTable th[data-sort]`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.sort;N.column===t?N.asc=!N.asc:(N.column=t,N.asc=!1),P()})}),be.addEventListener(`click`,()=>{Tr()}),xe.addEventListener(`click`,()=>{Tr(),gr()});let je=document.getElementById(`confirmModal`);je.addEventListener(`click`,e=>{e.target===je&&Tr()});let Me=document.getElementById(`selectionClose`);Me&&Me.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),console.log(`[SidePanel] 用户点击关闭选中内容按钮`),mr(),window.hideFloatingMenu(),F.lastSelectedText=``,F.currentSelectionRange=null}),i.addEventListener(`input`,()=>{})}),Ue().then(()=>Qi()),document.addEventListener(`DOMContentLoaded`,()=>{ea()}),document.addEventListener(`DOMContentLoaded`,Ye),document.addEventListener(`DOMContentLoaded`,zi),document.addEventListener(`DOMContentLoaded`,ut),document.addEventListener(`DOMContentLoaded`,mt),document.addEventListener(`DOMContentLoaded`,zt),document.addEventListener(`DOMContentLoaded`,xr);function sa(){let e=document.getElementById(`imagePreviewBar`),t=document.getElementById(`screenshotBtn`);e&&(e.style.display=F.attachedImages.length>0?``:`none`),t&&(F.enableImageInput?t.style.removeProperty(`display`):t.style.display=`none`),userInput&&(F.enableImageInput?userInput.style.paddingRight=`84px`:userInput.style.paddingRight=``),F.enableImageInput||(F.attachedImages=[]),ca()}function ca(){let e=document.getElementById(`imagePreviewBar`);if(e){if(e.innerHTML=``,F.attachedImages.length===0){e.style.display=`none`;return}e.style.display=``,F.attachedImages.forEach((t,n)=>{let r=document.createElement(`div`);r.className=`image-preview-item`;let i=document.createElement(`img`);i.src=t.dataUrl,i.className=`image-preview-thumb`,i.title=`点击查看大图`,i.style.cursor=`zoom-in`,i.addEventListener(`click`,()=>{Nr(t.dataUrl,i)});let a=document.createElement(`button`);a.className=`image-preview-remove`,a.innerHTML=`×`,a.title=`移除图片`,a.addEventListener(`click`,e=>{e.stopPropagation(),F.attachedImages.splice(n,1),ca()}),r.appendChild(i),r.appendChild(a),e.appendChild(r)})}}async function la(){if(!F.enableImageInput){L(`请先开启图片输入功能`);return}try{let e=await chrome.runtime.sendMessage({type:`CAPTURE_TAB`});e?.dataUrl&&(Br(await(await fetch(e.dataUrl)).blob()),L(`截图成功`))}catch(e){console.error(`[SidePanel] 全页面截图失败:`,e),L(`截图失败，请重试`)}}async function ua(){let e=await Ge();if(!e){L(`无法获取当前标签页`);return}try{let t=await chrome.tabs.sendMessage(e,{type:`START_REGION_SELECTION`});if(!t)return;console.log(`[SidePanel] 区域选择结果:`,t);let n=await chrome.runtime.sendMessage({type:`CAPTURE_TAB`});if(!n?.dataUrl){L(`截图失败，请重试`);return}let r=await da(n.dataUrl,t);if(!r){L(`裁剪失败，请重试`);return}Br(await(await fetch(r)).blob())}catch(e){console.error(`[SidePanel] 区域截图失败:`,e),L(`区域截图失败，请确保页面已加载且未被浏览器限制`)}}function da(e,t){return new Promise((n,r)=>{let i=new Image;i.onload=()=>{let e=document.createElement(`canvas`),r=window.devicePixelRatio||1,a=t.x*r,o=t.y*r,s=t.width*r,c=t.height*r;e.width=s,e.height=c,e.getContext(`2d`).drawImage(i,a,o,s,c,0,0,s,c),n(e.toDataURL(`image/jpeg`,.85))},i.onerror=()=>r(Error(`图片加载失败`)),i.src=e})}
//# sourceMappingURL=side_panel-BaJwTt1v.js.map