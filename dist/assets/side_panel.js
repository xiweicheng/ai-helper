import{a as e,c as t,d as n,i as r,l as i,n as a,p as o,r as s,s as c,t as l}from"./db-xKyxY0bf.js";var u=new Set,d=[],f=`deepseek-v4-pro`,p=null,m=[],h=!0,g=!0,_=!1,v=null,y=``,ee=``,b=[],x=-1,S=null,C=``,w=[],T=-1,E={maxInputHistory:20,maxHistoryMessages:50,maxMessageLength:1e5,maxMemoryMessages:null},te=.2,ne=1,D=0,O=`all`,k=``,A=[],re={},j=null,M=null,N=new Map,ie=new Set,ae=new Map,oe=null,se=null,ce=18e4,le=null,ue=!1,de=null,fe=``,pe=null,me=0,he=0,ge=-1,_e=!1,P={get isGenerating(){return u.has(p)},set isGenerating(e){e?u.add(p):u.delete(p)},get generatingSessionIds(){return u},get messageHistory(){return d},set messageHistory(e){d=e},get currentModel(){return f},set currentModel(e){f=e},get activeSessionId(){return p},set activeSessionId(e){p=e},get sessions(){return m},set sessions(e){m=e},get useTools(){return h},set useTools(e){h=e},get isolateChat(){return g},set isolateChat(e){g=e},get enableSelectionQuery(){return _},set enableSelectionQuery(e){_=e},get currentTabId(){return v},set currentTabId(e){v=e},get selectedContextText(){return y},set selectedContextText(e){y=e},get quotedContextText(){return ee},set quotedContextText(e){ee=e},get customPrompts(){return b},set customPrompts(e){b=e},get selectedPromptIndex(){return x},set selectedPromptIndex(e){x=e},get draggedItemIndex(){return S},set draggedItemIndex(e){S=e},get systemPrompt(){return C},set systemPrompt(e){C=e},get inputHistory(){return w},set inputHistory(e){w=e},get inputHistoryIndex(){return T},set inputHistoryIndex(e){T=e},get chatConfig(){return E},set chatConfig(e){E=e},get temperature(){return te},set temperature(e){te=e},get topP(){return ne},set topP(e){ne=e},get selectedTempIndex(){return D},set selectedTempIndex(e){D=e},get currentCategory(){return O},set currentCategory(e){O=e},get currentSearch(){return k},set currentSearch(e){k=e},get enabledTools(){return A},set enabledTools(e){A=e},get collapsedCategories(){return re},get currentExecutionStatus(){return j},set currentExecutionStatus(e){j=e},get executionLogListener(){return M},set executionLogListener(e){M=e},get pendingCancelApi(){return N.get(p)||null},set pendingCancelApi(e){e===null?N.delete(p):N.set(p,e)},get pendingCancelApiMap(){return N},get pendingCallApiSessionIds(){return ie},set pendingCallApiSessionIds(e){ie=e},get substituteLoadingIds(){return ae},set substituteLoadingIds(e){ae=e},get currentClarifyToolCallId(){return oe},set currentClarifyToolCallId(e){oe=e},get clarifyTimerInterval(){return se},set clarifyTimerInterval(e){se=e},get clarifyTimeoutValue(){return ce},set clarifyTimeoutValue(e){ce=e},get messageTocContainer(){return le},set messageTocContainer(e){le=e},get isMouseOverToc(){return ue},set isMouseOverToc(e){ue=e},get tocHideTimer(){return de},set tocHideTimer(e){de=e},get lastSelectedText(){return fe},set lastSelectedText(e){fe=e},get currentSelectionRange(){return pe},set currentSelectionRange(e){pe=e},get lastMouseX(){return me},set lastMouseX(e){me=e},get lastMouseY(){return he},set lastMouseY(e){he=e},get pendingDeleteIndex(){return ge},set pendingDeleteIndex(e){ge=e},get isScrolling(){return _e},set isScrolling(e){_e=e}},F=[{label:`精准编码`,temp:.2,topP:1,tip:`较低随机性，适合业务开发、调试、纠错`},{label:`均衡开发`,temp:.45,topP:.9,tip:`兼顾稳定性，用于封装工具类、常规脚本`},{label:`架构探索`,temp:.65,topP:.9,tip:`提供多种实现思路，用于组件重构、方案对比`},{label:`创意发散`,temp:.9,topP:.9,tip:`随机性较高，仅用于原型探索，不建议生产代码`}];function I(e,t=`info`,n=3e3){let r=document.getElementById(`toastContainer`);if(!r)return;let i=document.createElement(`div`);i.className=`toast ${t}`,i.textContent=e,r.appendChild(i),requestAnimationFrame(()=>{i.classList.add(`toast-show`)}),setTimeout(()=>{i.classList.remove(`toast-show`),setTimeout(()=>{i.parentNode&&i.parentNode.removeChild(i)},300)},n)}function ve(){let e=document.getElementById(`userInput`);e&&(e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,100)+`px`)}function L(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function R(e){return!e||e<0?`0ms`:e<1e3?`${Math.round(e)}ms`:e<6e4?`${(e/1e3).toFixed(1)}s`:`${Math.floor(e/6e4)}分${(e%6e4/1e3).toFixed(1)}秒`}function ye(e,t){navigator.clipboard.writeText(e).then(()=>{let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(n=>{console.error(`[SidePanel] 复制失败:`,n);let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{I(`复制失败`,`error`)}document.body.removeChild(r)})}function be(){let e=new Date().toLocaleString(`zh-CN`),t=`

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
   - 指定执行策略：sequential（顺序执行）、parallel（并行执行）或 conditional（条件执行）`;return P.systemPrompt&&P.systemPrompt.trim()?`${P.systemPrompt}

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
`}function xe(){return new Promise(e=>{chrome.storage.local.get([`temperature`,`topP`],t=>{e({temperature:t.temperature===void 0?parseFloat(P.temperature.toFixed(2)):parseFloat(t.temperature.toFixed(2)),top_p:t.topP===void 0?parseFloat(P.topP.toFixed(2)):parseFloat(t.topP.toFixed(2))})})})}function Se(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(P.chatConfig=t,console.log(`[SidePanel] 对话配置已加载:`,P.chatConfig)),e(t)})})}async function Ce(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(P.chatConfig=t,console.log(`[SidePanel] 同步加载对话配置:`,P.chatConfig)),e()})})}async function we(){return new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>{t&&t.length>0&&t[0].id?(P.currentTabId=t[0].id,console.log(`[SidePanel] 获取当前 Tab ID:`,P.currentTabId,`URL:`,t[0].url),e(P.currentTabId)):(console.warn(`[SidePanel] 未获取到有效的 Tab ID`),e(null))})})}function Te(){return new Promise(e=>{chrome.storage.local.get([`reactMaxIterations`,`reactApiTimeout`,`reactLoopTimeout`,`reactToolTimeout`,`reactClarifyTimeout`],t=>{e({maxIterations:t.reactMaxIterations||30,apiTimeout:t.reactApiTimeout||6e4,loopTimeout:t.reactLoopTimeout||3e5,toolTimeout:t.reactToolTimeout||3e4,clarifyTimeout:t.reactClarifyTimeout||18e4})})})}function Ee(e){if(!e||!e.trim()||e.trim()==`/`)return;let t=e.trim(),n=P.inputHistory.indexOf(t);n!==-1&&P.inputHistory.splice(n,1),P.inputHistory.push(t),P.inputHistory.length>P.chatConfig.maxInputHistory&&P.inputHistory.shift(),De()}function De(){try{chrome.storage.local.set({inputHistory:P.inputHistory}),console.log(`[SidePanel] 输入历史已保存，数量:`,P.inputHistory.length)}catch(e){console.error(`[SidePanel] 保存输入历史失败:`,e)}}function Oe(){document.addEventListener(`mouseover`,ke,!0),document.addEventListener(`mouseout`,Ae,!0),console.log(`[SidePanel] 消息目录功能已初始化`)}function ke(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){P.isMouseOverToc=!0;return}let t=e.target.closest(`.message.assistant`);if(!t)return;let n=t.querySelectorAll(`.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6`);if(n.length===0){Me();return}je(t,n)}function Ae(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){P.isMouseOverToc=!1,P.tocHideTimer&&=(clearTimeout(P.tocHideTimer),null);return}if(!e.target.closest(`.message.assistant`))return;let t=e.relatedTarget;t&&(t.closest(`.message-toc-container`)||t.closest(`.message.assistant`))||P.isMouseOverToc||(P.tocHideTimer&&clearTimeout(P.tocHideTimer),P.tocHideTimer=setTimeout(()=>{P.isMouseOverToc||Me(),P.tocHideTimer=null},800))}function je(e,t){let n=Array.from(t);P.messageTocContainer&&Me(),n.forEach((e,t)=>{e.id||=`toc-heading-${Date.now()}-${t}`});let r=document.createElement(`div`);r.className=`message-toc-container`,r.dataset.headingsCount=n.length;let i=0,a=n.map(e=>{let t=parseInt(e.tagName.charAt(1)),n=e.textContent.trim(),r=n.length>30?n.substring(0,30)+`...`:n,a=`H${t}`;return i++,`
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
  `,document.body.appendChild(r),P.messageTocContainer=r;let o=e.getBoundingClientRect(),s=window.innerWidth-280;o.right<s&&(r.style.left=o.right+`px`,r.style.right=`0`,r.style.width=`auto`);let c=r.querySelector(`.message-toc-toggle`),l=r.querySelector(`.message-toc-panel`);c.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),c.addEventListener(`click`,()=>{l.classList.toggle(`expanded`)}),l.addEventListener(`mouseenter`,()=>{l.classList.add(`expanded`)}),r.querySelectorAll(`.message-toc-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.target,n=document.getElementById(t);n&&(n.scrollIntoView({behavior:`smooth`,block:`start`}),n.classList.add(`toc-highlight`),setTimeout(()=>{n.classList.remove(`toc-highlight`)},1500))})})}function Me(){P.tocHideTimer&&=(clearTimeout(P.tocHideTimer),null),P.messageTocContainer&&=(P.messageTocContainer.remove(),null)}function Ne(e){return`${Math.floor(e/60)}:${(e%60).toString().padStart(2,`0`)}`}function Pe(e=`default`){try{let t=new(window.AudioContext||window.webkitAudioContext),n=t.createOscillator(),r=t.createGain();n.connect(r),r.connect(t.destination);let i={default:{frequency:800,duration:.3},success:{frequency:523,duration:.2},warning:{frequency:440,duration:.4},error:{frequency:220,duration:.5}},a=i[e]||i.default;n.frequency.value=a.frequency,n.type=`sine`,r.gain.setValueAtTime(.3,t.currentTime),r.gain.exponentialRampToValueAtTime(.01,t.currentTime+a.duration),n.start(t.currentTime),n.stop(t.currentTime+a.duration),console.log(`[SidePanel] 提示音已播放:`,e)}catch(e){console.error(`[SidePanel] 播放提示音失败:`,e.message)}}function Fe(e,t){let n=document.getElementById(`clarifyTimer`),r=document.getElementById(`clarifyTimerText`);if(!n||!r)return;r.textContent=`剩余时间: ${Ne(e)}`;let i=e/t*100;n.classList.remove(`warning`,`critical`),e<=10?(n.classList.add(`critical`),r.textContent=`即将超时: ${Ne(e)}`):(e<=30||i<=15)&&n.classList.add(`warning`),e===30&&Pe(`warning`)}function Ie(e){Le(),P.clarifyTimeoutValue=e;let t=Math.ceil(e/1e3),n=t;Fe(n,t),P.clarifyTimerInterval=setInterval(()=>{n--,n<=0?Le():Fe(n,t)},1e3)}function Le(){P.clarifyTimerInterval&&=(clearInterval(P.clarifyTimerInterval),null)}function Re(e){console.log(`[SidePanel] 显示澄清对话框:`,e);let{question:t,options:n,recommendedOption:r,allowCustomInput:i=!0,allowAdditionalInfo:a=!0,toolCallId:o,timeout:s=18e4}=e;P.currentClarifyToolCallId=o;let c=r!==void 0&&r>=0?r:0,l=[c],u=c,d=document.getElementById(`clarifyQuestion`);d&&(d.textContent=t);let f=document.getElementById(`clarifyOptionsList`);if(f&&(document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.remove()}),n.forEach((e,t)=>{let n=l.includes(t),r=document.createElement(`div`);r.className=`clarify-option-item ${u===t?`selected`:``} ${n?`recommended`:``}`,r.dataset.index=t,r.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${e}${n?`<span class="clarify-option-badge">推荐</span>`:``}</div>
      `,r.addEventListener(`click`,()=>Be(t)),f.appendChild(r)}),i)){let e=document.createElement(`div`);e.className=`clarify-option-item`,e.dataset.index=-1,e.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `,e.addEventListener(`click`,()=>Be(-1)),f.appendChild(e);let t=document.getElementById(`clarifyCustomInput`);t&&f.appendChild(t)}let p=document.getElementById(`clarifyCustomInput`);p&&p.classList.remove(`show`);let m=document.getElementById(`clarifyAdditionalInfo`);m&&m.classList.toggle(`show`,a);let h=document.getElementById(`clarifyCustomTextarea`);h&&(h.value=``);let g=document.getElementById(`clarifyAdditionalTextarea`);g&&(g.value=``);let _=document.getElementById(`clarifyOverlay`);_&&_.classList.add(`show`),Ie(s),console.log(`[SidePanel] 澄清对话框已显示`)}function ze(){let e=document.getElementById(`clarifyOverlay`);e&&e.classList.remove(`show`),P.currentClarifyToolCallId=null,Le(),console.log(`[SidePanel] 澄清对话框已隐藏`)}function Be(e){document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.classList.remove(`selected`)});let t=document.querySelector(`.clarify-option-item[data-index="${e}"]`);t&&t.classList.add(`selected`);let n=document.getElementById(`clarifyCustomInput`);if(n)if(e===-1){n.classList.add(`show`);let e=document.getElementById(`clarifyCustomTextarea`);e&&e.focus()}else n.classList.remove(`show`);console.log(`[SidePanel] 选择澄清选项:`,e)}function Ve(){if(!P.currentClarifyToolCallId){console.error(`[SidePanel] 没有当前工具调用ID`);return}let e=-1;document.querySelectorAll(`.clarify-option-item`).forEach((t,n)=>{t.classList.contains(`selected`)&&(e=parseInt(t.dataset.index))});let t=document.getElementById(`clarifyCustomTextarea`),n=t?t.value.trim():``,r=document.getElementById(`clarifyAdditionalTextarea`),i=r?r.value.trim():``,a={type:`CLARIFY_RESPONSE`,toolCallId:P.currentClarifyToolCallId,selectedOption:e,customInput:n,additionalInfo:i};console.log(`[SidePanel] 发送澄清响应:`,a),chrome.runtime.sendMessage(a),ze()}function He(){if(P.currentClarifyToolCallId){let e={type:`CLARIFY_RESPONSE`,toolCallId:P.currentClarifyToolCallId,selectedOption:-1,customInput:``,additionalInfo:``};chrome.runtime.sendMessage(e)}ze()}function Ue(){let e=document.getElementById(`clarifyConfirmBtn`);e&&e.addEventListener(`click`,Ve);let t=document.getElementById(`clarifyCancelBtn`);t&&t.addEventListener(`click`,He),chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.type===`SHOW_CLARIFY_DIALOG`)console.log(`[SidePanel] 收到澄清请求:`,e),Re(e.data),n({success:!0});else if(e.type===`PLAY_NOTIFICATION_SOUND`)console.log(`[SidePanel] 收到播放提示音请求:`,e),Pe(e.soundType),n({success:!0});else if(e.type===`CLARIFY_TIMEOUT`){console.log(`[SidePanel] 收到澄清超时通知:`,e);let t=document.getElementById(`clarifyTimer`),n=document.getElementById(`clarifyTimerText`);t&&n&&(t.classList.remove(`warning`),t.classList.add(`critical`),n.textContent=`已超时`),Pe(`error`)}}),console.log(`[SidePanel] 澄清对话框事件已初始化`)}function We(e){if(!e)return``;let t=[];e=e.replace(/```mermaid\n?([\s\S]*?)```/g,(e,n)=>{let r=t.length;return t.push(n.trim()),`%%MERMAID_BLOCK_${r}%%`});let n=[];e=e.replace(/```(\w*)\n?([\s\S]*?)```/g,(e,t,r)=>{let i=n.length;return n.push({language:t||`text`,content:r.trim()}),`%%CODE_BLOCK_${i}%%`});let r=[];e=e.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(e,t,n,i)=>{let a=r.length;return r.push({header:t,separator:n,body:i,full:e.trim()}),`\n%%TABLE_BLOCK_${a}%%\n`});let i=``;return typeof marked<`u`?(marked.setOptions({breaks:!0,gfm:!0}),i=marked.parse(e)):i=e.replace(/`([^`]+)`/g,`<code>$1</code>`).replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`).replace(/\*([^*]+)\*/g,`<em>$1</em>`).replace(/\n/g,`<br>`),t.forEach((e,t)=>{i=i.replace(`%%MERMAID_BLOCK_${t}%%`,`<div class="mermaid" data-raw-code="${encodeURIComponent(e)}">${e}</div>`)}),n.forEach((e,t)=>{let n=e.content.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`);i=i.replace(`%%CODE_BLOCK_${t}%%`,`<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${t}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${e.language}">${n}</code></pre>
      </div>`)}),r.forEach((e,t)=>{i=i.replace(`%%TABLE_BLOCK_${t}%%`,Ke(e))}),i}function Ge(e){if(!e)return``;let t=e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`);return t=t.replace(/`([^`]+)`/g,`<code>$1</code>`),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/\*([^*]+)\*/g,`<em>$1</em>`),t=t.replace(/~~([^~]+)~~/g,`<del>$1</del>`),t}function Ke(e){let{header:t,body:n,full:r}=e,i=window.__tableBlocks?window.__tableBlocks.length:0;window.__tableBlocks&&(window.__tableBlocks[i]={full:r,header:t,body:n});let a=t.split(`|`).filter(e=>e.trim()).map(e=>Ge(e.trim())),o=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>Ge(e.trim()))),s=`<div class="table-container-wrapper"><table>`;return s+=`<thead><tr>`,a.forEach((e,t)=>{t===a.length-1?s+=`<th class="table-header-cell-wrapper">
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
      </th>`:s+=`<th>${e}</th>`}),s+=`</tr></thead>`,s+=`<tbody>`,o.forEach(e=>{s+=`<tr>`,e.forEach(e=>{s+=`<td>${e}</td>`}),s+=`</tr>`}),s+=`</tbody>`,s+=`</table></div>`,s}function qe(e){try{let{header:t,body:n}=e,r=t.split(`|`).filter(e=>e.trim()).map(e=>e.trim()),i=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>e.trim())),a=`﻿`;a+=r.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`,i.forEach(e=>{a+=e.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`});let o=new Blob([a],{type:`text/csv;charset=utf-8;`}),s=document.createElement(`a`),c=URL.createObjectURL(o);s.setAttribute(`href`,c),s.setAttribute(`download`,`table-${Date.now()}.csv`),s.style.visibility=`hidden`,document.body.appendChild(s),s.click(),document.body.removeChild(s),console.log(`[SidePanel] Excel 下载成功`)}catch(e){console.error(`[SidePanel] 下载 Excel 失败:`,e),I(`下载失败: `+e.message,`error`)}}async function Je(){if(typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}console.log(`[SidePanel] ===== renderMermaidCharts 开始 =====`);let e=document.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,e.length),e.length!==0){for(let t=0;t<e.length;t++){let n=e[t];try{await mermaid.run({nodes:[n]}),console.log(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染成功`),Xe(n)}catch(e){console.error(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染失败:`,e),!n.querySelector(`svg`)&&!n.querySelector(`.mermaid-controls`)&&(n.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${e.message}</div>`)}}console.log(`[SidePanel] ===== renderMermaidCharts 完成 =====`)}}function Ye(e){return e?`<div class="markdown-body">${We(e)}</div>`:``}function Xe(e){if(e.querySelector(`.mermaid-controls`)){console.log(`[SidePanel] 工具栏已存在，跳过`);return}let t=e.querySelector(`svg`);if(!t){console.warn(`[SidePanel] SVG 元素未找到，当前内容:`,e.innerHTML.substring(0,100));return}console.log(`[SidePanel] 找到 SVG 元素，开始添加工具栏`),console.log(`[SidePanel] container 类名:`,e.className),console.log(`[SidePanel] container HTML:`,e.innerHTML.substring(0,200)),e.style.position=`relative`,e.style.cursor=`grab`,e.style.userSelect=`none`,e.style.webkitUserSelect=`none`;let n=e.querySelector(`.mermaid-svg-wrapper`);if(!n){n=document.createElement(`div`),n.className=`mermaid-svg-wrapper`,n.style.transformOrigin=`center center`,n.style.transition=`transform 0.2s ease`,n.style.display=`inline-block`,n.style.width=`100%`,t.style.maxWidth=`100%`,t.style.height=`auto`,t.style.userSelect=`none`,t.style.webkitUserSelect=`none`,n.appendChild(t),e.insertBefore(n,e.firstChild);let r=[];Array.from(e.childNodes).forEach(e=>{e.nodeType===Node.TEXT_NODE&&e.textContent.trim()&&r.push(e)}),r.forEach(e=>e.remove())}let r=document.createElement(`div`);r.className=`mermaid-controls`,r.innerHTML=`
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
  `,e.appendChild(r),console.log(`[SidePanel] 工具栏 HTML 已添加`),console.log(`[SidePanel] container 子元素:`,Array.from(e.children).map(e=>e.className).join(`, `));let i=1,a=.3,o=.15,s=e.dataset.rawCode||``;if(!s){let e=t.querySelector(`title`);e&&e.textContent&&(s=e.textContent.trim())}if(!s){let e=t.querySelector(`script[type="text/plain"]`);e&&(s=e.textContent.trim())}s&&!e.dataset.rawMermaidCode&&(e.dataset.rawMermaidCode=s),r.querySelector(`.view-source`).addEventListener(`click`,r=>{r.stopPropagation();let s=e.getAttribute(`data-raw-code`);$e(e,s?decodeURIComponent(s):e.dataset.rawMermaidCode||``,n,t,i,{MIN_SCALE:a,MAX_SCALE:10,SCALE_STEP:o})}),r.querySelector(`.copy-to-clipboard`).addEventListener(`click`,e=>{e.stopPropagation(),Ze(t,n,i)}),r.querySelector(`.download-png`).addEventListener(`click`,e=>{e.stopPropagation(),Qe(t,i)}),e.addEventListener(`wheel`,e=>{!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.stopPropagation(),i=e.deltaY<0?Math.min(10,i+o):Math.max(a,i-o),p())},{passive:!1});let c=!1,l,u,d=0,f=0;function p(){n.style.transform=`translate(${d}px, ${f}px) scale(${i})`}r.querySelector(`.zoom-in`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.min(10,i+o),p()}),r.querySelector(`.zoom-out`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.max(a,i-o),p()}),r.querySelector(`.reset-zoom`).addEventListener(`click`,e=>{e.stopPropagation(),i=1,d=0,f=0,p()}),e.addEventListener(`mousedown`,t=>{t.target.tagName!==`BUTTON`&&(c=!0,l=t.clientX-d,u=t.clientY-f,e.style.cursor=`grabbing`)}),document.addEventListener(`mousemove`,e=>{c&&(d=e.clientX-l,f=e.clientY-u,p())}),document.addEventListener(`mouseup`,()=>{c&&(c=!1,e.style.cursor=`grab`)})}async function Ze(e,t,n){try{console.log(`[SidePanel] 开始复制到剪贴板`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){if(e)if(navigator.clipboard&&typeof ClipboardItem<`u`)navigator.clipboard.write([new ClipboardItem({"image/png":e})]).then(()=>{console.log(`[SidePanel] 图片复制到剪贴板成功`),I(`Mermaid 图表已复制到剪贴板！`,`success`)}).catch(e=>{console.error(`[SidePanel] 复制到剪贴板失败:`,e),I(`复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。`,`error`)});else{console.warn(`[SidePanel] Clipboard API 不可用，降级为下载`),I(`当前浏览器不支持图片复制功能，已自动转为下载。`,`warning`);let t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(t),t.click(),document.body.removeChild(t)}},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] 图片转换失败:`,e),I(`图片转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 复制到剪贴板失败:`,e),I(`复制失败: `+e.message,`error`)}}function Qe(e,t){try{console.log(`[SidePanel] 开始下载 PNG`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){console.log(`[SidePanel] SVG 图片加载成功`);let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){let t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t),console.log(`[SidePanel] PNG 下载成功`)},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] PNG 转换失败:`,e),I(`PNG 转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 下载 PNG 失败:`,e),I(`下载失败: `+e.message,`error`)}}function $e(e,t,n,r,i,a){let o=e.querySelector(`.mermaid-source-view`),s=e.querySelector(`.mermaid-controls`);if(o)o.parentElement&&o.parentElement.remove(),n&&(n.style.display=`inline-block`),Xe(e);else{n&&(n.style.display=`none`),s&&s.remove();let o=document.createElement(`div`);o.className=`mermaid-container-wrapper`,o.style.position=`relative`;let c=document.createElement(`pre`);c.className=`mermaid-source-view`,c.style.position=`relative`,c.textContent=t;let l=document.createElement(`button`);l.className=`source-copy-btn`,l.title=`复制源代码`,l.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `,l.addEventListener(`click`,e=>{e.stopPropagation(),ye(t,l)});let u=document.createElement(`button`);u.className=`source-copy-btn`,u.style.right=`44px`,u.title=`返回图表`,u.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `,u.addEventListener(`click`,o=>{o.stopPropagation(),$e(e,t,n,r,i,a)}),c.appendChild(l),c.appendChild(u),o.appendChild(c),e.appendChild(o)}}async function et(e){if(console.log(`[SidePanel] ===== renderMessageMermaid 开始 =====`),typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}await new Promise(e=>setTimeout(e,300));let t=e.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,t.length),t.length===0){console.log(`[SidePanel] 未找到 mermaid 元素`);return}try{for(let n=0;n<t.length;n++){let r=t[n];try{await mermaid.run({nodes:[r]}),console.log(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染成功`);let t=e.querySelectorAll(`.mermaid`)[n];t&&Xe(t)}catch(t){console.error(`[SidePanel] 第`,n+1,`个 mermaid 图表渲染失败:`,t);let r=e.querySelectorAll(`.mermaid`)[n];r&&!r.querySelector(`svg`)&&!r.querySelector(`.mermaid-controls`)&&(r.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${t.message}</div>`)}}console.log(`[SidePanel] Mermaid 渲染完成`);let n=e.querySelectorAll(`.mermaid-controls`);console.log(`[SidePanel] 工具栏添加结果:`,n.length,`个成功`)}catch(e){console.error(`[SidePanel] Mermaid 渲染整体失败:`,e)}tt()}function tt(){let e=document.querySelectorAll(`.code-copy-btn`);console.log(`[SidePanel] 找到代码复制按钮数量:`,e.length),e.forEach((e,t)=>{if(e.dataset.bound){console.log(`[SidePanel] 按钮`,t,`已绑定，跳过`);return}e.dataset.bound=`true`,e.addEventListener(`click`,t=>{console.log(`[SidePanel] 代码复制按钮被点击`),t.stopPropagation();let n=e.closest(`.code-block-container`);if(console.log(`[SidePanel] 找到容器:`,!!n),n){let t=n.querySelector(`pre code`);if(console.log(`[SidePanel] 找到代码元素:`,!!t),t){let n=t.textContent;console.log(`[SidePanel] 代码长度:`,n.length),ye(n,e)}}}),console.log(`[SidePanel] 已绑定按钮`,t)}),nt()}function nt(){document.querySelectorAll(`.copy-md-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&ye(r.full,e)}))}),document.querySelectorAll(`.download-excel-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&qe(r)}))})}var rt=!1;async function it(){rt||=(await a(),!0)}async function at(){await it();let[t,n]=await Promise.all([e(),s()]);return{activeSessionId:n,list:t}}async function ot(){if(!P.activeSessionId)return!1;let e=await c(P.activeSessionId);if(!e)return!1;e.model=P.currentModel,e.useTools=P.useTools,e.enabledTools=[...P.enabledTools],e.temperature=P.temperature,e.topP=P.topP;let n=P.chatConfig.maxHistoryMessages||50;e.messageHistory=P.messageHistory.slice(-n).map(e=>({role:e.role,content:e.content||``,executionLog:e.executionLog||[]})),e.updatedAt=new Date().toISOString();let r=P.messageHistory.find(e=>e.role===`user`);return r&&(e.title=r.content.substring(0,50).replace(/\n/g,` `)),await t(e),!0}async function st(){await it();let e=lt(),r={id:e,title:`新会话`,model:P.currentModel,useTools:P.useTools,enabledTools:[...P.enabledTools],temperature:P.temperature,topP:P.topP,messageHistory:[],scrollPosition:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),isGenerating:!1,lastExecutionLog:[]};return await t(r),await n(e),r}async function ct(e,n){let r=await c(e);return r?(r.messageHistory=r.messageHistory||[],r.messageHistory.push({role:n.role,content:n.content||``,executionLog:n.executionLog||[]}),r.updatedAt=new Date().toISOString(),r.isGenerating=!1,await t(r),!0):!1}function lt(){return`sess_`+Date.now().toString(36)+`_`+Math.random().toString(36).substring(2,8)}async function ut(e){if(e===P.activeSessionId)return;await ot();let t=await c(e);return t?(await n(e),P.activeSessionId=e,P.messageHistory=t.messageHistory||[],P.currentModel=t.model||P.currentModel,P.useTools=t.useTools===void 0?P.useTools:t.useTools,P.enabledTools=t.enabledTools||P.enabledTools,P.temperature=t.temperature===void 0?P.temperature:t.temperature,P.topP=t.topP===void 0?P.topP:t.topP,t.isGenerating?P.generatingSessionIds.add(e):P.generatingSessionIds.delete(e),t):(console.error(`[SessionStore] 找不到会话:`,e),!1)}async function dt(t){let r=await e(),i=await s();if(await l(t),i===t){let e=r.filter(e=>e.id!==t);e.length>0?await n(e[0].id):await n(null)}return!0}async function ft(e,n){let r=await c(e);return r?(r.title=n,r.updatedAt=new Date().toISOString(),await t(r),!0):!1}async function pt(){if(!P.messageHistory||P.messageHistory.length===0)return;let e=await c(P.activeSessionId);if(!e)return;let t=P.messageHistory.find(e=>e.role===`user`),n=t?t.content.substring(0,50).replace(/\n/g,` `):e.title||`未命名会话`,a=Date.now().toString(36)+Math.random().toString(36).substring(2,8),o=P.messageHistory.map(e=>({role:e.role,content:e.content||``})),s=await r();s.push({id:a,title:n,createdAt:new Date().toISOString(),messages:o}),s.length>20&&s.splice(0,s.length-20),await i(s);let l=await st();return await dt(e.id),await ut(l.id),!0}async function z(){return at()}async function mt(){return ot()}async function ht(){return st()}async function gt(e){return ut(e)}async function _t(e){return dt(e)}async function vt(e,t){return ft(e,t)}async function yt(){return pt()}async function bt(e,t){return ct(e,t)}async function B(){let e=await z();P.sessions=e.list,P.activeSessionId=e.activeSessionId;let t=document.getElementById(`sessionTabs`),n=document.getElementById(`sessionTabsScroll`),r=document.getElementById(`sessionTabsAddWrapper`);if(!t||!n||!r)return;n.innerHTML=``,r.innerHTML=``,e.list.forEach(e=>{let t=document.createElement(`div`);t.className=`session-tab`,t.dataset.sessionId=e.id,e.id===P.activeSessionId&&t.classList.add(`active`),t.title=e.title;let r=document.createElement(`span`);if(r.className=`session-tab-title`,r.textContent=e.title||`新会话`,t.appendChild(r),e.isGenerating||P.generatingSessionIds.has(e.id)){let e=document.createElement(`span`);e.className=`session-tab-indicator`,t.appendChild(e)}t.addEventListener(`click`,async t=>{t.preventDefault(),e.id!==P.activeSessionId&&await xt(e.id)}),t.addEventListener(`contextmenu`,t=>{t.preventDefault(),Dt(t,e)}),n.appendChild(t)});let i=document.createElement(`div`);i.className=`session-tab-add`,i.title=`新建会话`,i.textContent=`+`,i.addEventListener(`click`,async()=>{await mt();let e=await ht();P.activeSessionId=e.id,P.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:e.id}})),B()}),r.appendChild(i),wt(n)}async function xt(e){if(await mt(),!await gt(e))return;let t=await z();P.sessions=t.list,P.activeSessionId=e;let n=t.list.find(t=>t.id===e);n&&(P.messageHistory=n.messageHistory||[],P.currentModel=n.model||P.currentModel,P.useTools=n.useTools===void 0?P.useTools:n.useTools,P.enabledTools=n.enabledTools||P.enabledTools,P.temperature=n.temperature===void 0?P.temperature:n.temperature,P.topP=n.topP===void 0?P.topP:n.topP),document.dispatchEvent(new CustomEvent(`session-switched`,{detail:{sessionId:e}})),B(),St(),setTimeout(()=>{let e=document.querySelector(`.session-tab.active`);e&&e.scrollIntoView({behavior:`smooth`,block:`nearest`,inline:`center`})},50)}function St(){let e=document.querySelector(`.model-display`);e&&P.currentModel&&(e.textContent=P.currentModel);let t=document.getElementById(`enableToolsBtn`);t&&(t.checked=P.useTools);let n=document.getElementById(`tempIconValue`);n&&P.temperature!==void 0&&(n.textContent=P.temperature.toFixed(2))}var Ct=new WeakSet;function wt(e){Ct.has(e)||(Ct.add(e),e.addEventListener(`wheel`,t=>{e.scrollWidth<=e.clientWidth||(t.preventDefault(),e.scrollLeft+=t.deltaY)},{passive:!1}))}function Tt(e){let t=document.getElementById(`sessionRenameModal`),n=document.getElementById(`sessionRenameInput`),r=document.getElementById(`sessionRenameConfirmBtn`),i=document.getElementById(`sessionRenameCancelBtn`),a=document.getElementById(`sessionRenameCloseBtn`);if(!t||!n)return;n.value=e.title,n.focus(),n.select();let o=()=>{t.classList.remove(`show`),r.removeEventListener(`click`,s),i.removeEventListener(`click`,c),a.removeEventListener(`click`,c)},s=()=>{let t=n.value.trim();t&&t!==e.title&&vt(e.id,t).then(()=>{B()}),o()},c=()=>{o()};r.addEventListener(`click`,s),i.addEventListener(`click`,c),a.addEventListener(`click`,c),n.onkeydown=e=>{e.key===`Enter`?s():e.key===`Escape`&&c()},t.classList.add(`show`)}function Et(e,t){let n=document.getElementById(`sessionDeleteModal`),r=document.getElementById(`sessionDeleteMessage`),i=document.getElementById(`sessionDeleteConfirmBtn`),a=document.getElementById(`sessionDeleteCancelBtn`),o=document.getElementById(`sessionDeleteCloseBtn`);if(!n||!r)return;r.textContent=`确定要删除会话"${e.title}"吗？此操作不可撤销。`;let s=()=>{n.classList.remove(`show`),i.removeEventListener(`click`,c),a.removeEventListener(`click`,l),o.removeEventListener(`click`,l)},c=async()=>{await _t(e.id),t&&await t(),s()},l=()=>{s()};i.addEventListener(`click`,c),a.addEventListener(`click`,l),o.addEventListener(`click`,l),n.classList.add(`show`)}function Dt(e,t){let n=document.querySelector(`.session-context-menu`);n&&n.remove();let r=document.createElement(`div`);r.className=`session-context-menu`,r.style.left=e.clientX+`px`,r.style.top=e.clientY+`px`;let i=Ot(`重命名`,()=>{r.remove(),Tt(t)});r.appendChild(i);let a=Ot(`删除`,()=>{r.remove(),Et(t,async()=>{let e=await z();P.activeSessionId=e.activeSessionId,P.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t?P.messageHistory=t.messageHistory||[]:P.messageHistory=[],document.dispatchEvent(new CustomEvent(`session-switched`)),B()})},`danger`);r.appendChild(a),document.body.appendChild(r);let o=e=>{r.contains(e.target)||(r.remove(),document.removeEventListener(`click`,o))};setTimeout(()=>document.addEventListener(`click`,o),0)}function Ot(e,t,n=``){let r=document.createElement(`div`);return r.className=`session-context-menu-item `+n,r.textContent=e,r.addEventListener(`click`,t),r}var V=`pendingCallApiSessions`;function H(){chrome.storage.session.set({[V]:[...P.pendingCallApiSessionIds]}).catch(()=>{})}async function kt(){try{let e=await chrome.storage.session.get([V]);e[V]&&Array.isArray(e[V])&&(P.pendingCallApiSessionIds=new Set(e[V]))}catch{}}function At(e){P.quotedContextText=e;let t=document.getElementById(`selectionIndicator`),n=document.getElementById(`selectionText`),r=document.getElementById(`userInput`);if(t&&n&&r){let r;r=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,n.textContent=`💬 已引用: ${r}`,t.classList.add(`show`)}}function U(){console.log(`[SidePanel] 清除选中内容上下文`),P.selectedContextText=``,P.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=e.findIndex(e=>e.startsWith(`[用户问题]`));n===-1?t.value=``:t.value=e.slice(n+1).join(`
`).trim()}}async function jt(){let e=await z();if(e.activeSessionId&&e.list.length>0){P.activeSessionId=e.activeSessionId,P.sessions=e.list;let t=e.list.find(t=>t.id===e.activeSessionId);t&&(P.messageHistory=t.messageHistory||[],P.currentModel=t.model||P.currentModel,P.useTools=t.useTools===void 0?P.useTools:t.useTools,P.enabledTools=t.enabledTools||P.enabledTools,P.temperature=t.temperature===void 0?P.temperature:t.temperature,P.topP=t.topP===void 0?P.topP:t.topP),P.messageHistory.forEach(e=>{q(e.role,e.content,!1,e.executionLog||[])});let n=document.querySelector(`.welcome-message`);n&&P.messageHistory.length>0&&n.remove(),Je();let r=`scrollPosition_`+(P.activeSessionId||`default`);chrome.storage.local.get([r],e=>{e[r]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t.scrollTop=e[r]},100)}),B()}else{await ht();let e=await z();e.activeSessionId&&(P.activeSessionId=e.activeSessionId,P.sessions=e.list),B()}}function W(){try{mt().catch(e=>{console.error(`[SidePanel] 保存当前会话失败:`,e)})}catch(e){console.error(`[SidePanel] 保存对话历史异常:`,e)}}function Mt(){P.messageHistory&&P.messageHistory.length>0&&yt().then(()=>{P.messageHistory=[];let e=document.getElementById(`chatContainer`);if(e){e.innerHTML=``;let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
          <div class="icon-wrapper">
            <div class="icon">💬</div>
          </div>
          <h2>开始对话</h2>
          <p>输入您的问题，AI 助手将为您解答</p>
        `,e.appendChild(t)}chrome.storage.local.remove(`scrollPosition_`+(P.activeSessionId||`default`)),B()})}function Nt(){if(!P.messageHistory||P.messageHistory.length===0){I(`当前没有对话历史可导出`,`warning`);return}let e=P.messageHistory.map((e,t)=>{let n=document.querySelectorAll(`.message`)[t],r=null;return r=n&&n.dataset.timestamp?n.dataset.timestamp:new Date().toISOString(),{role:e.role===`user`?`user`:`assistant`,content:e.content||``,timestamp:r,displayName:e.role===`user`?`我`:`AI助手`}}),t=new Date,n=`ai-helper-${t.getFullYear()+String(t.getMonth()+1).padStart(2,`0`)+String(t.getDate()).padStart(2,`0`)+`-`+String(t.getHours()).padStart(2,`0`)+String(t.getMinutes()).padStart(2,`0`)+String(t.getSeconds()).padStart(2,`0`)}.json`,r=JSON.stringify(e,null,2),i=new Blob([r],{type:`application/json;charset=utf-8;`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=n,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a),console.log(`[SidePanel] 对话历史已导出:`,n,`共`,e.length,`条消息`),I(`对话历史已导出 (${e.length} 条消息)`,`success`)}function Pt(){document.getElementById(`confirmModal`).classList.add(`show`)}function Ft(){document.getElementById(`confirmModal`).classList.remove(`show`)}async function G(){let e=document.getElementById(`userInput`),t=document.getElementById(`sendBtn`),n=document.getElementById(`chatContainer`),r=e.value.trim();if(!r||P.isGenerating)return;let i=n.querySelector(`.welcome-message`);i&&i.remove();let a=r,o=P.enableSelectionQuery&&P.selectedContextText&&P.selectedContextText.trim(),s=P.quotedContextText&&P.quotedContextText.trim();if(s){let e=P.quotedContextText.trim();a=`[引用内容]\n${e}\n\n[用户问题]\n${r}`,K(`quoted`,e,!1),P.quotedContextText=``}else if(o){let e=P.selectedContextText.trim();a=`[选中内容]\n${e}\n\n[用户问题]\n${r}`,K(`selected`,e,!1),P.selectedContextText=``}q(`user`,r),P.messageHistory.push({role:`user`,content:a}),W(),Ee(r),e.value=``,e.style.height=`auto`,(o||s)&&U(),P.isGenerating=!0,t.disabled=!0;let c=P.activeSessionId,l=J(),u=P.currentModel;try{await Ce(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,P.isolateChat),console.log(`  - chatConfig:`,P.chatConfig),console.log(`  - messageHistory.length:`,P.messageHistory.length);let e=[{role:`system`,content:be()}];if(P.isolateChat){let t=P.messageHistory;P.chatConfig.maxMemoryMessages!==null&&P.chatConfig.maxMemoryMessages!==void 0&&P.chatConfig.maxMemoryMessages>0?(t=[...P.messageHistory.slice(0,-1).slice(-P.chatConfig.maxMemoryMessages),P.messageHistory[P.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,P.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,P.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:a});let t=await xe(),n,r;try{let i=await Yt(e,u,P.useTools,t);n=i.content,r=i.executionLog||[]}catch(e){if(P.activeSessionId!==c){e.message===`任务已被用户停止`?bt(c,{role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}):bt(c,{role:`assistant`,content:`❌ 请求失败：`+(e.message||`未知错误`),executionLog:e.executionLog||[]}),Y(l),P.substituteLoadingIds.delete(c);return}if(e.message===`任务已被用户停止`){Y(l),P.substituteLoadingIds.delete(c),q(`assistant`,`任务已取消`,!1,e.executionLog||[]),P.messageHistory.push({role:`assistant`,content:`任务已取消`,executionLog:e.executionLog||[]}),W();return}throw Y(l),P.substituteLoadingIds.delete(c),n=`❌ 请求失败：`+(e.message||`未知错误`),r=e.executionLog||[],q(`assistant`,n,!0,r),P.messageHistory.push({role:`assistant`,content:n,executionLog:r}),e}if(P.activeSessionId!==c){bt(c,{role:`assistant`,content:n,executionLog:r}),Y(l),P.substituteLoadingIds.delete(c);return}Y(l),P.substituteLoadingIds.has(c)&&(Y(P.substituteLoadingIds.get(c)),P.substituteLoadingIds.delete(c)),await et(q(`assistant`,n,!0,r)),P.messageHistory.push({role:`assistant`,content:n,executionLog:r})}catch(e){console.error(`[SidePanel] sendMessage 异常:`,e?.message||e)}finally{W(),P.generatingSessionIds.delete(c),t.disabled=!1,e.focus()}}function It(e,t){let n=document.getElementById(`userInput`);if(!t||P.isGenerating){console.log(`[SidePanel] triggerSelectionSearch 跳过:`,{hasText:!!t,isGenerating:P.isGenerating});return}let r=P.enableSelectionQuery;P.enableSelectionQuery=!0,P.selectedContextText=t,P.quotedContextText=``,n.value=`搜索一下`,n.dispatchEvent(new Event(`input`)),G(),P.enableSelectionQuery=!1,setTimeout(()=>{P.enableSelectionQuery=r},1500)}function Lt(e){let t=document.getElementById(`userInput`);!t||!e||(t.value=e,t.dispatchEvent(new Event(`input`)),t.focus())}function Rt(e,t=``){let n=document.getElementById(`userInput`);!n||!e||P.isGenerating||(t&&(P.enableSelectionQuery=!0,P.selectedContextText=t,P.quotedContextText=``),n.value=e,n.dispatchEvent(new Event(`input`)),n.focus(),G(),t&&(P.enableSelectionQuery=!1,setTimeout(()=>{P.enableSelectionQuery=!0},1500)))}function K(e,t,n=!0){let r=document.getElementById(`chatContainer`),i=document.createElement(`div`);i.className=`user-context-bubble`,i.dataset.role=`context`,i.innerHTML=`
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${e===`quoted`?`💬`:`📌`}</span>
        <span class="context-type">${e===`quoted`?`引用内容`:`选中内容`}</span>
      </div>
      <div class="context-bubble-content">${L(t)}</div>
    </div>
  `;let a=i.querySelector(`.context-bubble-header`),o=i.querySelector(`.context-bubble-content`);return a.addEventListener(`click`,e=>{e.stopPropagation(),o.classList.toggle(`expanded`)}),r.appendChild(i),n&&(r.scrollTop=r.scrollHeight),i}function q(e,t,n=!0,r=[]){let i=document.getElementById(`chatContainer`),a=document.createElement(`div`);a.className=`message ${e}`;let o=new Date().toISOString();if(a.dataset.timestamp=o,a.dataset.rawContent=t,a.dataset.executionLog=JSON.stringify(r),e===`assistant`){a.innerHTML=Ye(t);let e=document.createElement(`div`);e.className=`message-footer`;let n=document.createElement(`button`);n.className=`copy-btn`,n.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),n.addEventListener(`click`,e=>{e.stopPropagation(),$t(a,n)}),e.appendChild(n);let i=document.createElement(`button`);i.className=`quote-btn`,i.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),i.addEventListener(`click`,e=>{e.stopPropagation(),nn(a)}),e.appendChild(i);let o=document.createElement(`div`);o.className=`export-menu-container`;let s=document.createElement(`button`);s.className=`export-trigger-btn`,s.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let c=document.createElement(`div`);c.className=`export-dropdown`,c.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),c.querySelector(`.export-docx-item`).addEventListener(`click`,e=>{e.stopPropagation(),en(a,s),c.classList.remove(`show`)}),c.querySelector(`.export-pdf-item`).addEventListener(`click`,e=>{e.stopPropagation(),tn(a,s),c.classList.remove(`show`)}),s.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==c&&e.classList.remove(`show`)}),c.classList.toggle(`show`)});let l=null;o.addEventListener(`mouseenter`,()=>{l=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==c&&e.classList.remove(`show`)}),c.classList.add(`show`)},300)}),o.addEventListener(`mouseleave`,()=>{l&&=(clearTimeout(l),null),setTimeout(()=>{!o.matches(`:hover`)&&!c.matches(`:hover`)&&c.classList.remove(`show`)},100)}),o.appendChild(s),o.appendChild(c),e.appendChild(o),r&&r.length>0&&chrome.storage.local.get(`enableExecutionLog`,t=>{if(t.enableExecutionLog){let t=document.createElement(`button`);t.className=`execution-log-btn`,t.title=`执行日志`,t.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),t.addEventListener(`click`,e=>{e.stopPropagation(),Xt(r)}),e.appendChild(t)}}),a.appendChild(e)}else{let e=t.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),n=t.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),r=e||n;if(r){let t=e?`quoted`:`selected`,n=r[1].trim(),i=r[2].trim();a._pendingContext={type:t,contextText:n,userQuestion:i},a.textContent=i}else a.textContent=t;let i=document.createElement(`div`);i.className=`message-toolbar`;let o=document.createElement(`button`);o.className=`message-toolbar-btn copy-btn`,o.title=`复制内容`,o.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),Zt(a,o)});let s=document.createElement(`button`);s.className=`message-toolbar-btn edit-btn`,s.title=`编辑后重新发送`,s.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>`,`</svg>`].join(``),s.addEventListener(`click`,e=>{e.stopPropagation(),Qt(a)}),i.appendChild(o),i.appendChild(s),a.appendChild(i)}if(i.appendChild(a),a._pendingContext){let{type:e,contextText:t}=a._pendingContext,n=K(e,t,!1);i.insertBefore(n,a),delete a._pendingContext}if(n){let e=i.querySelectorAll(`.message.user`);if(e.length>0){let t=e[e.length-1],n=t.previousElementSibling;n&&n.classList.contains(`user-context-bubble`)?n.scrollIntoView({behavior:`smooth`,block:`start`}):t.scrollIntoView({behavior:`smooth`,block:`start`})}}return e===`assistant`&&tt(),a}function zt(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)),n=t.length,r=``,i=null;return t.forEach((e,t)=>{let a=e.nodeType===`subtask`,o=e.nodeType===`tool_exec`,s=e.nodeType===`api_call`,c=e.nodeType===`preselect`,l=o&&e.action?.name===`plan_task`;a&&(i=e.subtaskIndex);let u=``,d=``;c?d=`📡`:l?(u=`plan-task-level`,d=`📋`):a?(u=`subtask-level`,d=`🔀`):o&&i!==null?(u=`tool-level`,d=`🔧`):s&&i!==null?(u=`api-level`,d=`📡`):o?d=`⚡`:s&&(d=`📡`);let f=`○`,p=e.status||`processing`;e.status===`success`?f=`✓`:e.status===`failed`&&(f=`✗`);let m=L(e.nodeName||`未知节点`);if(e.subtaskIndex!==null&&e.subtaskIndex>=0&&(m=`<span class="subtask-badge">${e.subtaskIndex+1}</span> ${m}`),e.subtaskCount&&(m+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!c&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(m+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}r+=`
      <div class="timeline-item ${u}" data-status="${e.status||`processing`}" data-node-type="${e.nodeType||``}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${p}">
          ${f}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${d}</span>
            <span class="iteration-badge">[${t+1}/${n}]</span>
            <span class="node-name" title="${L(e.nodeName||`未知节点`)}">${m}</span>
            <span class="duration-badge" title="耗时">${R(e.duration||0)}</span>
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
          </div>
        </div>
      </div>
    `}),r}function Bt(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp));if(!t.some(e=>e.taskGroup))return Wt(t);let n=new Map,r=[];t.forEach(e=>{e.taskGroup?(n.has(e.taskGroup)||n.set(e.taskGroup,{groupId:e.taskGroup,groupIndex:e.taskGroupIndex,groupName:e.taskGroupName,entries:[],status:e.status}),n.get(e.taskGroup).entries.push(e),e.status&&(n.get(e.taskGroup).status=e.status)):r.push(e)});let i=Vt(r,t.length);return n.forEach((e,n)=>{let r=e.status||`processing`;i+=`
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
          ${Ht(e.entries,t.length)}
        </div>
      </div>
    `}),i}function Vt(e,t){if(e.length===0)return``;let n=``;return n+=`
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
  `,e.forEach((e,r)=>{n+=Ut(e,r,t)}),n+=`
      </div>
    </div>
  `,n}function Ht(e,t){let n=``;return e.forEach((e,r)=>{n+=Ut(e,r,t)}),n}function Ut(e,t,n){let r=e.nodeType===`subtask`,i=e.nodeType===`tool_exec`,a=e.nodeType===`api_call`,o=e.nodeType===`preselect`,s=i&&e.action?.name===`plan_task`,c=``,l=``;o?l=`📡`:s?(c=`plan-task-level`,l=`📋`):r?(c=`subtask-level`,l=`🔀`):i?(c=`tool-level`,l=`🔧`):a?(c=`api-level`,l=`📡`):i?l=`⚡`:a&&(l=`📡`);let u=`○`,d=e.status||`processing`;e.status===`success`?u=`✓`:e.status===`failed`&&(u=`✗`);let f=L(e.nodeName||`未知节点`);if(e.subtaskCount&&(f+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(a||o)&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),!o&&e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(f+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}return`
    <div class="timeline-item ${c}">
      <div class="timeline-line"></div>
      <div class="timeline-dot ${d}">
        ${u}
      </div>
      <div class="timeline-content">
        <div class="timeline-header">
          <span class="expand-icon">▼</span>
          <span class="node-icon">${l}</span>
          <span class="iteration-badge">[${t+1}/${n}]</span>
          <span class="node-name" title="${L(e.nodeName||`未知节点`)}">${f}</span>
          <span class="duration-badge" title="耗时">${R(e.duration)}</span>
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
        </div>
      </div>
    </div>
  `}function Wt(e){let t=``,n=null;return e.forEach((r,i)=>{let a=r.nodeType===`subtask`,o=r.nodeType===`tool_exec`,s=r.nodeType===`api_call`,c=r.nodeType===`preselect`,l=o&&r.action?.name===`plan_task`;a&&(n=r.subtaskIndex);let u=``,d=``;c?d=`📡`:l?(u=`plan-task-level`,d=`📋`):a?(u=`subtask-level`,d=`🔀`):o&&n!==null?(u=`tool-level`,d=`🔧`):s&&n!==null?(u=`api-level`,d=`📡`):o?d=`⚡`:s&&(d=`📡`);let f=`○`,p=r.status||`processing`;r.status===`success`?f=`✓`:r.status===`failed`&&(f=`✗`);let m=L(r.nodeName||`未知节点`);if(r.subtaskId&&(m=`<span class="subtask-badge">${n===null?``:n+1}</span> ${m}`),r.subtaskCount&&(m+=` <span class="plan-badge">(${r.subtaskCount}个子任务, ${r.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),(s||c)&&r.apiRequest){let e=[];r.apiRequest.messageCount!==void 0&&r.apiRequest.messageCount!==null&&e.push(`💬<span title="本次模型API调用携带的消息数">${r.apiRequest.messageCount}条</span>`),!c&&r.apiRequest.toolCount!==void 0&&r.apiRequest.toolCount!==null&&e.push(`🔧<span title="本次模型API调用携带的工具定义数">${r.apiRequest.toolCount}个</span>`),e.length>0&&(m+=` <span class="api-info-badge">（${e.join(` `)}）</span>`)}t+=`
      <div class="timeline-item ${u}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${p}">
          ${f}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${d}</span>
            <span class="iteration-badge">[${i+1}/${e.length}]</span>
            <span class="node-name" title="${L(r.nodeName||`未知节点`)}">${m}</span>
            <span class="duration-badge" title="耗时">${R(r.duration)}</span>
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
          </div>
        </div>
      </div>
    `}),t}function Gt(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(!t)return;let n=t.querySelector(`.realtime-executing-node`);n&&(n.textContent=e.nodeName||`处理中...`);let r=e.executionLog||[],i=r.length,a=r.filter(e=>e.status===`success`).length,o=r.filter(e=>e.status===`failed`).length,s=r.filter(e=>e.nodeType===`subtask`).length,c=r.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,l=t.querySelector(`.combo-value`),u=t.querySelector(`.combo-stat.success .stat-value`),d=t.querySelector(`.combo-stat.failed .stat-value`),f=t.querySelector(`.combo-stat.subtask`);l&&(l.textContent=i),u&&(u.textContent=a),d&&(d.textContent=o),f&&(s>0?(f.style.display=``,f.querySelector(`.stat-value`).textContent=`${c}/${s}`):f.style.display=`none`);let p=t.querySelector(`.timeline`);p.innerHTML=r.length>0?zt(r):`<div class="realtime-waiting-message">等待执行中...</div>`,p.scrollTop=p.scrollHeight}function Kt(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel realtime-mode`,n.innerHTML=`
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
  `,document.body.appendChild(n),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()}),n.addEventListener(`click`,e=>{e.target===n&&n.remove()});let r=n.querySelector(`.toggle-expand-btn`),i=!1;r.addEventListener(`click`,()=>{i=!i,n.querySelectorAll(`.timeline-content`).forEach(e=>{i?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=r.querySelector(`svg`);i?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,r.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,r.setAttribute(`title`,`展开全部节点`))}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.timeline-header`);t&&t.parentElement.classList.toggle(`expanded`)}),n.addEventListener(`click`,e=>{let t=e.target.closest(`.combo-stat[data-status]`);if(!t)return;let r=t.dataset.status,i=t.classList.contains(`active`);n.querySelectorAll(`.combo-stat[data-status]`).forEach(e=>{e.classList.remove(`active`)});let a=n.querySelectorAll(`.timeline-item`);i?a.forEach(e=>{e.style.display=``}):(t.classList.add(`active`),a.forEach(e=>{if(r===`subtask`)e.dataset.nodeType===`subtask`?e.style.display=``:e.style.display=`none`;else{let t=e.querySelector(`.timeline-dot`);t&&t.classList.contains(r)?e.style.display=``:e.style.display=`none`}}))}),P.currentExecutionStatus&&Gt(P.currentExecutionStatus)}function qt(e){let t=document.querySelector(`.execution-log-panel.realtime-mode`);if(t){t.remove();return}Kt(e)}function Jt(e,t,n,r){let i=document.getElementById(e);if(!i)return;console.log(`[SidePanel] updateExecutionStatus 被调用:`,t,n,`日志数量:`,r?.length);let a=i.querySelector(`.current-node-name`);a&&(a.textContent=t||`处理中...`,a.title=t||``),P.currentExecutionStatus?(P.currentExecutionStatus.executionLog||(P.currentExecutionStatus.executionLog=[]),r&&r.length>0&&r.forEach(e=>{let t=P.currentExecutionStatus.executionLog.findIndex(t=>t.id===e.id);if(t!==-1){let n=P.currentExecutionStatus.executionLog[t];P.currentExecutionStatus.executionLog[t]={...e,subtaskIndex:e.subtaskIndex??n.subtaskIndex,subtaskId:e.subtaskId??n.subtaskId,subtaskName:e.subtaskName??n.subtaskName}}else P.currentExecutionStatus.executionLog.push(e)}),P.currentExecutionStatus.nodeName=t,P.currentExecutionStatus.status=n):P.currentExecutionStatus={nodeName:t,status:n,executionLog:[]},document.querySelector(`.execution-log-panel.realtime-mode`)&&Gt(P.currentExecutionStatus)}function J(){let e=document.getElementById(`chatContainer`),t=`loading-`+Date.now(),n=document.createElement(`div`);n.className=`loading-message`,n.id=t,n.innerHTML=`
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
  `,e.appendChild(n),e.scrollTop=e.scrollHeight;let r=n.querySelector(`.stop-task-btn`),i=n.querySelector(`.loading-text`);r&&r.addEventListener(`click`,e=>{e.stopPropagation(),r.disabled=!0,r.style.opacity=`0.6`,r.style.cursor=`not-allowed`,i&&(i.textContent=`停止中...`),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:null,sessionId:P.activeSessionId}),P.pendingCancelApi&&P.pendingCancelApi({message:`任务已被用户停止`,executionLog:P.currentExecutionStatus?.executionLog||[]})}),P.executionLogListener=(e,n,r)=>e.sessionId&&e.sessionId!==P.activeSessionId?!1:e.type===`EXECUTION_STATUS_UPDATE`?(console.log(`[SidePanel] 收到执行状态更新:`,e.nodeName,e.status,`日志数量:`,e.executionLog?.length),Jt(t,e.nodeName,e.status,e.executionLog),!1):!1,chrome.runtime.onMessage.addListener(P.executionLogListener),chrome.storage.local.get(`enableExecutionLog`,e=>{if(e.enableExecutionLog){let e=n.querySelector(`.execution-status-container`);e&&(e.style.display=`flex`)}});let a=n.querySelector(`.execution-log-toggle-btn`);return a&&a.addEventListener(`click`,e=>{e.stopPropagation(),qt(t)}),t}function Y(e){let t=document.getElementById(e);if(t){let e=t.querySelector(`.loading-text`);e&&(e.textContent=`思考中...`),t.remove()}P.executionLogListener&&=(chrome.runtime.onMessage.removeListener(P.executionLogListener),null),P.currentExecutionStatus=null;let n=document.querySelector(`.execution-log-panel.realtime-mode`);n&&n.remove()}async function Yt(e,t,n=!1,r={}){let i=(await Te()).loopTimeout,a=P.activeSessionId;return new Promise((o,s)=>{let c=[],l=Math.round(i/1e3),u=e=>{d&&clearTimeout(d),v(),P.pendingCancelApiMap.delete(a),P.pendingCallApiSessionIds.delete(a),H(),(!e.executionLog||e.executionLog.length===0||c.length>0)&&(e.executionLog=c),s(e)};P.pendingCancelApi=u,P.pendingCallApiSessionIds.add(a),H(),console.log(`[SidePanel] callApi: 添加 pendingCallApiSessionIds, mySessionId =`,a,`, set:`,[...P.pendingCallApiSessionIds]);let d=setTimeout(()=>{u({message:`请求超时（${l}秒）`,executionLog:c}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:P.currentTabId,sessionId:P.activeSessionId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},i),f=Date.now(),p=0,m=null,h=()=>{m===null&&d!==null&&(m=Date.now(),clearTimeout(d),d=null,console.log(`[SidePanel] 前端超时已暂停（澄清工具执行中）`))},g=()=>{if(m!==null){let e=Date.now()-m;p+=e,m=null;let t=Date.now()-f,n=i+p-t;if(n<=0){u({message:`请求超时（${l}秒）`,executionLog:c});return}d=setTimeout(()=>{u({message:`请求超时（${l}秒）`,executionLog:c}),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:P.currentTabId,sessionId:P.activeSessionId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)})},n),console.log(`[SidePanel] 前端超时已恢复，暂停时长:`,Math.round(e/1e3),`s，剩余时间:`,Math.round(n/1e3),`s`)}},_=e=>(console.log(`[SidePanel] 收到消息:`,e),e.sessionId&&e.sessionId!==a?!1:e.type===`EXECUTION_STATUS_UPDATE`?(c=e.executionLog||[],!1):e.type===`CLARIFY_START`?(h(),!1):e.type===`CLARIFY_END`?(g(),!1):e.type===`API_COMPLETE`?(d&&clearTimeout(d),P.pendingCancelApiMap.delete(a),P.pendingCallApiSessionIds.delete(a),H(),chrome.runtime.onMessage.removeListener(_),o({content:e.content,executionLog:e.executionLog||c}),!1):e.type===`API_ERROR`?(d&&clearTimeout(d),P.pendingCancelApiMap.delete(a),P.pendingCallApiSessionIds.delete(a),H(),chrome.runtime.onMessage.removeListener(_),s({message:e.error,executionLog:e.executionLog||c}),!1):!1);chrome.runtime.onMessage.addListener(_);let v=()=>{chrome.runtime.onMessage.removeListener(_)};console.log(`[SidePanel] 发送 CALL_API 消息，useTools:`,n,`tabId:`,P.currentTabId,`sessionId:`,P.activeSessionId,`apiParams:`,r,`timeout:`,i),chrome.runtime.sendMessage({type:`CALL_API`,sessionId:P.activeSessionId,messages:e,model:t,useTools:n,tabId:P.currentTabId,apiParams:r})})}function Xt(e){let t=document.querySelector(`.execution-log-panel`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel`;let r=e.reduce((e,t)=>e+(t.duration||0),0),i=e.filter(e=>e.status===`success`).length,a=e.filter(e=>e.status===`failed`).length,o=e.filter(e=>e.nodeType===`subtask`).length,s=e.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length;n.innerHTML=`
    <div class="log-container">
      <div class="log-header">
        <div class="log-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <h3>执行日志</h3>
          ${e.filter(e=>e.nodeType===`tool_exec`&&e.action?.name===`plan_task`&&e.status===`success`).length>0?`<span class="log-badge">任务拆解</span>`:``}
        </div>
        <div class="log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      
      <div class="log-summary">
        <div class="summary-item" title="总耗时: ${R(r)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${R(r)}</span>
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
        ${Bt(e)}
      </div>
    </div>
  `,document.body.appendChild(n),n.addEventListener(`click`,e=>{e.target===n&&n.remove()}),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()});let c=n.querySelector(`.toggle-expand-btn`),l=n.querySelectorAll(`.timeline-content`),u=!1;c.addEventListener(`click`,()=>{u=!u,l.forEach(e=>{u?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=c.querySelector(`svg`);u?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,c.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,c.setAttribute(`title`,`展开全部节点`))}),n.querySelectorAll(`.timeline-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.parentElement.classList.toggle(`expanded`)})});let d=n.querySelectorAll(`.combo-stat`),f=n.querySelectorAll(`.timeline-item`);d.forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.status,n=e.classList.contains(`active`);d.forEach(e=>e.classList.remove(`active`)),n?f.forEach(e=>{e.style.display=``}):(e.classList.add(`active`),f.forEach(e=>{if(t===`subtask`)e.classList.contains(`subtask-level`)?e.style.display=``:e.style.display=`none`;else{let n=e.querySelector(`.timeline-dot`);n&&n.classList.contains(t)?e.style.display=``:e.style.display=`none`}}))})})}function Zt(e,t){try{let n=e.dataset.rawContent||``;navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{console.error(`[SidePanel] 复制失败:`,e);let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{I(`复制失败`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),I(`复制失败`,`error`)}}function Qt(e){try{let t=e.dataset.rawContent||``;if(!t){I(`无法获取消息内容`,`error`);return}let n=document.getElementById(`userInput`);n.value=t,ve(),n.focus(),n.selectionStart=n.selectionEnd=n.value.length,console.log(`[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送`)}catch(e){console.error(`[SidePanel] 编辑消息失败:`,e),I(`编辑失败: `+e.message,`error`)}}function $t(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=P.messageHistory.find(e=>e.role===`assistant`);if(t)n=t.content;else{let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}}navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{I(`复制失败，请手动选择内容复制`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),I(`复制失败`,`error`)}}function en(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${We(n)}
      </body>
      </html>
    `,i=new Blob([`﻿`,r],{type:`application/msword`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`word-${new Date().getTime()}.doc`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a);let s=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `,setTimeout(()=>{t.innerHTML=s},2e3),console.log(`[SidePanel] Word 文档导出成功`)}catch(e){console.error(`[SidePanel] 导出 Word 失败:`,e),I(`导出失败: `+e.message,`error`)}}function tn(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${We(n)}
        <div class="footer">${`AI Helper - ${new Date().toLocaleString(`zh-CN`)}`}</div>
      </body>
      </html>
    `,i=window.open(``,`_blank`,`width=800,height=600`);if(!i){I(`请允许弹出窗口以使用 PDF 导出功能`,`warning`);return}i.document.write(r),i.document.close(),i.onload=function(){setTimeout(()=>{i.focus(),i.print()},500)};let a=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `,setTimeout(()=>{t.innerHTML=a},2e3),console.log(`[SidePanel] PDF 导出已触发`)}catch(e){console.error(`[SidePanel] 导出 PDF 失败:`,e),I(`导出失败: `+e.message,`error`)}}function nn(e){try{let t=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!t){console.warn(`[SidePanel] 无法获取消息内容`);return}let n=document.getElementById(`userInput`);if(!n){console.warn(`[SidePanel] 找不到输入框`);return}let r=e.querySelector(`.quote-btn`),i=r?r.innerHTML:``;At(t),r&&(r.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `,r.classList.add(`quoted`),setTimeout(()=>{r.innerHTML=i,r.classList.remove(`quoted`)},2e3)),n.focus(),console.log(`[SidePanel] 已引用消息内容到提示条，输入框已获取焦点`)}catch(e){console.error(`[SidePanel] 引用提问失败:`,e),I(`引用失败: `+e.message,`error`)}}function rn(){console.log(`[SidePanel] 清除选中内容上下文`),P.selectedContextText=``,P.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=0;for(let t=0;t<e.length;t++)if(e[t].startsWith(`[用户问题]`)){n=t;break}n>0&&(t.value=e.slice(n).join(`
`),t.dispatchEvent(new Event(`input`)),console.log(`[SidePanel] 已移除输入框中的选中内容前缀`))}P.lastSelectedText=``,P.currentSelectionRange=null}function an(){let e=document.getElementById(`promptManageList`).querySelectorAll(`.prompt-manage-item`);e.forEach(t=>{t.addEventListener(`dragstart`,e=>{P.draggedItemIndex=parseInt(t.dataset.index),t.classList.add(`dragging`),e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,P.draggedItemIndex)}),t.addEventListener(`dragend`,()=>{t.classList.remove(`dragging`),e.forEach(e=>e.classList.remove(`drag-over`)),P.draggedItemIndex=null}),t.addEventListener(`dragover`,e=>{e.preventDefault(),e.dataTransfer.dropEffect=`move`,t.classList.add(`drag-over`)}),t.addEventListener(`dragleave`,()=>{t.classList.remove(`drag-over`)}),t.addEventListener(`drop`,e=>{e.stopPropagation(),e.preventDefault();let n=parseInt(t.dataset.index);if(P.draggedItemIndex!==null&&P.draggedItemIndex!==n){let e=P.customPrompts[P.draggedItemIndex];P.customPrompts.splice(P.draggedItemIndex,1),P.customPrompts.splice(n,0,e),chrome.storage.local.set({customPrompts:P.customPrompts}),Z()}t.classList.remove(`drag-over`)})})}function on(){let e=document.querySelector(`.input-toolbar-right`);if(!e)return;let t=document.createElement(`button`);t.className=`prompt-manage-btn`,t.title=`提示词管理`,t.innerHTML=`<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`,t.addEventListener(`click`,()=>{mn()}),e.appendChild(t)}function sn(e=``){let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);t.style.display=`block`,n.classList.add(`show`),un(e)}function X(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`);e.style.display=`none`,t.classList.remove(`show`),P.selectedPromptIndex=-1}function cn(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`),n=document.getElementById(`userInput`);e.style.display!==`none`&&t.classList.contains(`show`)?X():(sn(),n.focus())}function ln(e=``){un(e)}function un(e=``){let t=document.getElementById(`promptList`),n=e.toLowerCase(),r=P.customPrompts.filter(t=>e?t.code.toLowerCase().includes(n)||t.content.toLowerCase().includes(n):!0);if(r.length===0){t.innerHTML=`<div class="prompt-empty">暂无匹配的提示词</div>`,P.selectedPromptIndex=-1;return}P.selectedPromptIndex=0,t.innerHTML=r.map((e,t)=>`
    <div class="prompt-item ${t===P.selectedPromptIndex?`selected`:``}" data-index="${t}" data-code="${e.code}">
      <span class="prompt-item-content">${e.content}</span>
      <span class="prompt-item-code">/${e.code}</span>
    </div>
  `).join(``),t.querySelectorAll(`.prompt-item`).forEach(e=>{e.addEventListener(`click`,t=>{let n=e.dataset.code;t.ctrlKey||t.metaKey?fn(n):pn(n)})})}function dn(e){e.forEach((e,t)=>{t===P.selectedPromptIndex?e.classList.add(`selected`):e.classList.remove(`selected`)})}function fn(e){let t=P.customPrompts.find(t=>t.code===e);if(!t)return;let n=document.getElementById(`userInput`),r=n.value,i=r.lastIndexOf(`/`),a=r;if(i!==-1){let e=-1;for(let t=i-1;t>=0;t--)if(r[t]===`
`){e=t;break}a=e===-1?r.substring(0,i).trimEnd():r.substring(0,e+1).trimEnd()}n.value=a+(a&&!a.endsWith(`
`)?`

`:``)+t.content,n.focus(),n.selectionStart=n.selectionEnd=n.value.length,X(),ve(),console.log(`[SidePanel] 已追加提示词到输入框:`,t.code,t.content)}async function pn(e){let t=P.customPrompts.find(t=>t.code===e);if(!t)return;if(P.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}X();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove();let r=t.content,i=P.enableSelectionQuery&&P.selectedContextText&&P.selectedContextText.trim(),a=P.quotedContextText&&P.quotedContextText.trim();if(a){let e=P.quotedContextText.trim();r=`[引用内容]\n${e}\n\n[用户问题]\n${t.content}`,K(`quoted`,e,!1),P.quotedContextText=``}else if(i){let e=P.selectedContextText.trim();r=`[选中内容]\n${e}\n\n[用户问题]\n${t.content}`,K(`selected`,e,!1),P.selectedContextText=``}(i||a)&&rn(),q(`user`,t.content),P.messageHistory.push({role:`user`,content:r}),W(),Ee(t.content);let o=document.getElementById(`userInput`);o.value=``,o.style.height=`auto`,P.isGenerating=!0;let s=document.getElementById(`sendBtn`);s.disabled=!0;let c=J(),l=P.activeSessionId,u=P.currentModel;try{await Ce(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,P.isolateChat),console.log(`  - chatConfig:`,P.chatConfig),console.log(`  - messageHistory.length:`,P.messageHistory.length);let e=[{role:`system`,content:be()}];if(P.isolateChat){let t=P.messageHistory;P.chatConfig.maxMemoryMessages!==null&&P.chatConfig.maxMemoryMessages!==void 0&&P.chatConfig.maxMemoryMessages>0?(t=[...P.messageHistory.slice(0,-1).slice(-P.chatConfig.maxMemoryMessages),P.messageHistory[P.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,P.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,P.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:r});let t=await xe(),n,i;try{let r=await Yt(e,u,P.useTools,t);n=r.content,i=r.executionLog||[]}catch(e){throw Y(c),n=`❌ 请求失败：`+(e.message||`未知错误`),i=e.executionLog||[],q(`assistant`,n,!0,i),P.messageHistory.push({role:`assistant`,content:n,executionLog:i}),W(),e}Y(c),await et(q(`assistant`,n,!0,i)),P.messageHistory.push({role:`assistant`,content:n,executionLog:i}),W()}catch{}finally{P.generatingSessionIds.delete(l),s.disabled=!1,o.focus()}}function mn(){document.getElementById(`promptManageModal`).classList.add(`show`),Z()}function hn(){document.getElementById(`promptManageModal`).classList.remove(`show`);let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=document.getElementById(`promptManageAddBtn`);e&&(e.value=``),t&&(t.value=``),n&&(n.value=``),r&&(r.textContent=`添加提示词`,r.style.background=`#667eea`)}function Z(){let e=document.getElementById(`promptManageList`);if(P.customPrompts.length===0){e.innerHTML=`<div class="prompt-empty">暂无提示词，请添加</div>`;return}e.innerHTML=P.customPrompts.map((e,t)=>`
    <div class="prompt-manage-item" draggable="true" data-index="${t}">
      <div class="prompt-manage-item-left">
        <span class="prompt-drag-handle" title="拖拽排序">⋮⋮</span>
        <span class="prompt-manage-item-code">/${e.code}</span>
        <span class="prompt-manage-item-content">${e.content}</span>
      </div>
      <div class="prompt-manage-item-actions">
        <button class="prompt-sort-btn move-up-btn" data-index="${t}" title="上移" ${t===0?`disabled`:``}>↑</button>
        <button class="prompt-sort-btn move-down-btn" data-index="${t}" title="下移" ${t===P.customPrompts.length-1?`disabled`:``}>↓</button>
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
  `).join(``),e.querySelectorAll(`.move-up-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n>0){let e=P.customPrompts[n];P.customPrompts[n]=P.customPrompts[n-1],P.customPrompts[n-1]=e,chrome.storage.local.set({customPrompts:P.customPrompts}),Z()}})}),e.querySelectorAll(`.move-down-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n<P.customPrompts.length-1){let e=P.customPrompts[n];P.customPrompts[n]=P.customPrompts[n+1],P.customPrompts[n+1]=e,chrome.storage.local.set({customPrompts:P.customPrompts}),Z()}})}),e.querySelectorAll(`.menu-toggle-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);P.customPrompts[n].enabledInMenu=!P.customPrompts[n].enabledInMenu,chrome.storage.local.set({customPrompts:P.customPrompts}),Z()})}),e.querySelectorAll(`.edit-btn`).forEach(e=>{e.addEventListener(`click`,()=>{yn(parseInt(e.dataset.index))})}),e.querySelectorAll(`.delete-btn`).forEach(e=>{e.addEventListener(`click`,()=>{bn(parseInt(e.dataset.index))})}),an()}function gn(e){let t=document.getElementById(`promptErrorModal`),n=document.getElementById(`promptErrorMessage`);n.textContent=e,t.classList.add(`show`)}function _n(){document.getElementById(`promptErrorModal`).classList.remove(`show`)}function vn(){let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=t.value.trim(),i=n.value.trim();if(!r||!i){gn(`请填写编码和内容`);return}let a=e?parseInt(e.value):-1,o=P.customPrompts.findIndex(e=>e.code===r);if(o!==-1&&o!==a){gn(`编码已存在`);return}a>=0&&a<P.customPrompts.length?P.customPrompts[a]={...P.customPrompts[a],code:r,content:i}:P.customPrompts.push({code:r,content:i,enabledInMenu:!1}),chrome.storage.local.set({customPrompts:P.customPrompts}),t.value=``,n.value=``,e&&(e.value=``);let s=document.getElementById(`promptManageAddBtn`);s.textContent=`添加提示词`,s.style.background=`#667eea`,Z()}function yn(e){let t=P.customPrompts[e];if(!t)return;let n=document.getElementById(`editPromptIndex`),r=document.getElementById(`newPromptCode`),i=document.getElementById(`newPromptContent`),a=document.getElementById(`promptManageAddBtn`);n&&(n.value=e),r.value=t.code,i.value=t.content,a.textContent=`保存修改`,a.style.background=`#ffa502`,r.scrollIntoView({behavior:`smooth`})}function bn(e){let t=P.customPrompts[e];if(!t)return;P.pendingDeleteIndex=e;let n=document.getElementById(`deleteConfirmModal`),r=document.getElementById(`deleteConfirmMessage`);r.textContent=`确定要删除提示词 "/${t.code}" 吗？`,n.classList.add(`show`)}function xn(){document.getElementById(`deleteConfirmModal`).classList.remove(`show`),P.pendingDeleteIndex=-1}function Sn(e){P.customPrompts.splice(e,1),chrome.storage.local.set({customPrompts:P.customPrompts}),Z()}function Cn(){let e=document.getElementById(`promptManageCancelBtn`),t=document.getElementById(`promptManageAddBtn`),n=document.getElementById(`promptModalCloseBtn`);e&&e.addEventListener(`click`,hn),t&&t.addEventListener(`click`,vn),n&&n.addEventListener(`click`,hn);let r=document.getElementById(`deleteCancelBtn`),i=document.getElementById(`deleteConfirmBtn`);r&&r.addEventListener(`click`,xn),i&&i.addEventListener(`click`,()=>{P.pendingDeleteIndex>=0&&Sn(P.pendingDeleteIndex),xn()});let a=document.getElementById(`deleteConfirmModal`);a&&a.addEventListener(`click`,e=>{e.target===a&&xn()});let o=document.getElementById(`promptErrorConfirmBtn`);o&&o.addEventListener(`click`,_n);let s=document.getElementById(`promptErrorModal`);s&&s.addEventListener(`click`,e=>{e.target===s&&_n()})}function wn(){let e=document.getElementById(`toolsPopupOverlay`);if(!e)return;P.currentCategory=`all`,P.currentSearch=``;let t=document.getElementById(`toolsSearchInput`);t&&(t.value=``),jn(),Q(),document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),En(),e.classList.add(`show`),console.log(`[SidePanel] 打开工具弹窗`)}function Tn(){let e=document.getElementById(`toolsPopupOverlay`);e&&(document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.style.background=``,e.style.color=``,e.style.borderColor=``}),e.classList.remove(`show`),console.log(`[SidePanel] 关闭工具弹窗`))}function En(){let e=document.getElementById(`toolsPopupList`);if(!e)return;e.innerHTML=``;let t={};o.forEach(e=>{if(P.currentCategory!==`all`&&e.category!==P.currentCategory)return;if(P.currentSearch){let t=e.name.toLowerCase().includes(P.currentSearch),n=e.description.toLowerCase().includes(P.currentSearch);if(!t&&!n)return}let n=e.category||`other`;t[n]||(t[n]=[]),t[n].push(e)});let n={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,info_extract:`📄 信息提取`,page_analysis:`🔍 页面分析`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_process:`📷 媒体处理`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,system_integration:`⚙️ 系统集成`,memory:`🧠 记忆检索`};if([`page_interaction`,`form_operation`,`info_extract`,`page_analysis`,`tab_management`,`bookmark_history`,`storage_management`,`network_request`,`media_process`,`debug_dev`,`ai_collaboration`,`system_integration`,`memory`].forEach(r=>{let i=t[r];if(!i||i.length===0)return;let a=o.filter(e=>e.category===r),s=a.length,c=a.filter(e=>P.enabledTools.includes(e.id)).length,l=document.createElement(`div`);l.className=`popup-tool-category-group`,l.dataset.category=r;let u=document.createElement(`div`);u.className=`popup-tool-category`,u.dataset.category=r;let d=P.collapsedCategories[r]||!1;u.innerHTML=`
      <span class="category-expand-icon">${d?`▶`:`▼`}</span>
      <span class="category-name">${n[r]||r}</span>
      <span class="category-count">${c}/${s}</span>
    `,u.addEventListener(`click`,()=>{Dn(r)}),l.appendChild(u);let f=document.createElement(`div`);f.className=`popup-tool-items ${d?`collapsed`:``}`,i.forEach(e=>{let t=P.enabledTools.includes(e.id),n=document.createElement(`div`);n.className=`popup-tool-item`,n.dataset.category=r,n.innerHTML=`
        <input type="checkbox" id="tool_${e.id}" ${t?`checked`:``}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${e.name}</div>
          <div class="popup-tool-desc">${e.description}</div>
        </div>
      `;let i=n.querySelector(`input[type="checkbox"]`);i&&i.addEventListener(`change`,t=>{if(t.stopPropagation(),t.target.checked)P.enabledTools.includes(e.id)||P.enabledTools.push(e.id);else{let t=P.enabledTools.indexOf(e.id);t>-1&&P.enabledTools.splice(t,1)}On(r),jn(),Q()}),f.appendChild(n)}),l.appendChild(f),e.appendChild(l)}),e.children.length===0){let t=document.createElement(`div`);t.className=`popup-tool-empty`,t.textContent=`没有找到匹配的工具`,e.appendChild(t)}}function Dn(e){P.collapsedCategories[e]=!P.collapsedCategories[e];let t=document.querySelector(`.popup-tool-category-group[data-category="${e}"]`);if(!t)return;let n=t.querySelector(`.popup-tool-category`).querySelector(`.category-expand-icon`),r=t.querySelector(`.popup-tool-items`);P.collapsedCategories[e]?(n.textContent=`▶`,r.classList.add(`collapsed`)):(n.textContent=`▼`,r.classList.remove(`collapsed`))}function On(e){let t=document.querySelector(`.popup-tool-category[data-category="${e}"]`);if(!t)return;let n=t.querySelector(`.category-count`);if(!n)return;let r=o.filter(t=>t.category===e),i=r.length,a=0;r.forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&t.checked&&a++}),n.textContent=`${a}/${i}`}function kn(){return o.filter(e=>{if(P.currentCategory!==`all`&&e.category!==P.currentCategory)return!1;if(P.currentSearch){let t=e.name.toLowerCase().includes(P.currentSearch.toLowerCase()),n=e.description.toLowerCase().includes(P.currentSearch.toLowerCase());if(!t&&!n)return!1}return!0})}function An(){[`page_interaction`,`form_operation`,`info_extract`,`page_analysis`,`tab_management`,`bookmark_history`,`storage_management`,`network_request`,`media_process`,`debug_dev`,`ai_collaboration`,`system_integration`,`memory`].forEach(e=>{On(e)})}function jn(){[`all`,`page_interaction`,`form_operation`,`info_extract`,`page_analysis`,`tab_management`,`bookmark_history`,`storage_management`,`network_request`,`media_process`,`debug_dev`,`ai_collaboration`,`system_integration`,`memory`].forEach(e=>{let t=document.getElementById(`badge-`+e);if(!t)return;let n=0,r=0;if(e===`all`)n=o.length,r=P.enabledTools.length;else{let t=o.filter(t=>t.category===e);n=t.length,r=t.filter(e=>P.enabledTools.includes(e.id)).length}t.textContent=`${r}/${n}`})}function Q(){let e=document.getElementById(`toolsEnabledCount`);if(!e)return;let t=o.length;e.textContent=`(已启用 ${P.enabledTools.length}/${t})`}function Mn(){let e=[];o.forEach(t=>{let n=document.getElementById(`tool_`+t.id);n?n.checked&&e.push(t.id):P.enabledTools.includes(t.id)&&e.push(t.id)}),P.enabledTools=e,P.useTools=P.enabledTools.length>0,chrome.storage.local.set({enabledTools:P.enabledTools},()=>{console.log(`[SidePanel] 工具配置已保存:`,P.enabledTools)}),Nn(),I(P.useTools?`已启用 ${P.enabledTools.length} 个工具`:`工具已全部禁用`,`success`)}function Nn(){let e=document.getElementById(`toolsToggleBtn`),t=document.getElementById(`toolsBadge`);e&&(P.useTools&&P.enabledTools.length>0?(e.classList.add(`active`),e.title=`工具 (${P.enabledTools.length}个启用)`):(e.classList.remove(`active`),e.title=`工具 (未启用)`)),t&&(P.enabledTools.length>0?(t.textContent=P.enabledTools.length,t.style.display=`inline`):t.style.display=`none`)}chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.chatMaxMemoryMessages&&(P.chatConfig.maxMemoryMessages=e.chatMaxMemoryMessages.newValue,$(),console.log(`[SidePanel] 记忆限制配置已更新:`,P.chatConfig.maxMemoryMessages))});function $(){let e=document.getElementById(`memoryLimitLabel`);e&&(P.chatConfig.maxMemoryMessages!==null&&P.chatConfig.maxMemoryMessages!==void 0&&P.chatConfig.maxMemoryMessages>0?e.textContent=`(${P.chatConfig.maxMemoryMessages})`:e.textContent=`(全)`,e.style.display=`inline`,e.style.cursor=`pointer`,e.title=`点击设置记忆历史限制条数`)}function Pn(e){e.preventDefault(),e.stopPropagation();let t=document.getElementById(`memoryLimitDropdown`);if(t.classList.toggle(`show`),t.classList.contains(`show`)){let e=P.chatConfig.maxMemoryMessages;t.querySelectorAll(`.memory-limit-option`).forEach(t=>{t.classList.remove(`selected`);let n=parseInt(t.dataset.value);(e===null&&n===0||e!==null&&e>0&&n===e)&&t.classList.add(`selected`)});let n=t.querySelector(`#memoryLimitInput`);e!==null&&e>0?n.value=e:n.value=``}}function Fn(){let e=document.getElementById(`memoryLimitDropdown`),t=document.getElementById(`memoryLimitLabel`),n=e?.querySelector(`#memoryLimitInput`);if(!e||!t)return;$(),t.addEventListener(`click`,Pn);let r=e.querySelectorAll(`.memory-limit-option`);r.forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let i=parseInt(e.dataset.value),a=i===0?null:i;r.forEach(e=>e.classList.remove(`selected`)),e.classList.add(`selected`),n&&(n.value=i===0?``:i),chrome.storage.local.set({chatMaxMemoryMessages:a},()=>{P.chatConfig.maxMemoryMessages=a,$(),I(`✅ 配置已更新`,`success`)})})}),n&&(n.addEventListener(`click`,e=>e.stopPropagation()),n.addEventListener(`mousedown`,e=>e.stopPropagation()),n.addEventListener(`change`,e=>{e.stopPropagation();let t=e.target.value.trim(),n=t&&parseInt(t)>0?parseInt(t):null;r.forEach(e=>e.classList.remove(`selected`)),chrome.storage.local.set({chatMaxMemoryMessages:n},()=>{P.chatConfig.maxMemoryMessages=n,$(),I(`✅ 配置已更新`,`success`)})})),document.addEventListener(`click`,n=>{!e.contains(n.target)&&n.target!==t&&e.classList.remove(`show`)})}function In(e){document.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?(t.classList.add(`selected`),t.querySelector(`.model-option-check`).textContent=`✓`):(t.classList.remove(`selected`),t.querySelector(`.model-option-check`).textContent=``)})}function Ln(e,t){let n=document.getElementById(`tempDropdown`);if(!n||!e){typeof t==`function`&&t();return}let r=[`deepseek-v4-pro`,`deepseek-v4-flash`];e.forEach(e=>{if(r.includes(e)||n.querySelector(`.model-option[data-value="${e}"]`))return;let t=document.createElement(`div`);t.className=`model-option`,t.dataset.value=e,t.innerHTML=`<span class="model-option-check"></span>${e}`,t.addEventListener(`click`,t=>{t.stopPropagation(),P.currentModel=e,In(e),chrome.storage.local.set({modelName:e})}),n.querySelector(`.model-section`).appendChild(t)}),typeof t==`function`&&t()}function Rn(e,t=`📌 已选中`){if(!P.enableSelectionQuery)return;P.quotedContextText=``,P.selectedContextText=e;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let i;i=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,r.textContent=`${t}: ${i}`,n.classList.add(`show`)}}function zn(e,t,n=0,r=0){if(!P.enableSelectionQuery)return;let i=document.getElementById(`selectionFloatingMenu`),a=document.getElementById(`selectionMenuItems`);if(!i||!a)return;let o=P.customPrompts.filter(e=>e.enabledInMenu===!0);if(o.length===0)return;a.innerHTML=``,o.forEach(e=>{let n=e.content.length>10?e.content.substring(0,10)+`...`:e.content,r=document.createElement(`div`);r.className=`menu-item`,r.innerHTML=`
      <span>${n}</span>
      <span class="menu-item-code">/${e.code}</span>
    `,r.addEventListener(`click`,n=>{n.stopPropagation(),Bn(e,t)}),a.appendChild(r)});let s=document.body.getBoundingClientRect(),c=40+o.length*36,l=r-s.top-c-10,u=n-s.left-20;l<s.top+10&&(l=r-s.top+15),u<s.left+10&&(u=n-s.left+20),u+180>s.right-10&&(u=n-s.left-180-10,u<s.left+10&&(u=n-s.left+20)),l+c>s.bottom-10&&(l=r-s.top-c-10,l<s.top+10&&(l=r-s.top+15)),i.style.top=l+`px`,i.style.left=u+`px`,i.style.maxHeight=s.bottom-l-20+`px`,i.classList.add(`show`)}window.hideFloatingMenu=function(){let e=document.getElementById(`selectionFloatingMenu`);e&&e.classList.remove(`show`),P.lastSelectedText=``,P.currentSelectionRange=null};async function Bn(e,t){if(!P.enableSelectionQuery)return;if(window.hideFloatingMenu(),P.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}P.selectedContextText=t,U();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove(),K(`selected`,t,!1);let r=`[选中内容]\n${t}\n\n[用户问题]\n${e.content}`;q(`user`,e.content),P.messageHistory.push({role:`user`,content:r}),W(),Ee(e.content),P.isGenerating=!0;let i=document.getElementById(`sendBtn`);i.disabled=!0;let a=J(),o=P.activeSessionId,s=P.currentModel;try{await Ce(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,P.isolateChat),console.log(`  - chatConfig:`,P.chatConfig),console.log(`  - messageHistory.length:`,P.messageHistory.length);let e=[{role:`system`,content:be()}];if(P.isolateChat){let t=P.messageHistory;P.chatConfig.maxMemoryMessages!==null&&P.chatConfig.maxMemoryMessages!==void 0&&P.chatConfig.maxMemoryMessages>0?(t=[...P.messageHistory.slice(0,-1).slice(-P.chatConfig.maxMemoryMessages),P.messageHistory[P.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,P.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,P.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:r});let t=await xe(),n,i;try{let r=await Yt(e,s,P.useTools,t);n=r.content,i=r.executionLog||[]}catch(e){throw Y(a),n=`❌ 请求失败：`+(e.message||`未知错误`),i=e.executionLog||[],q(`assistant`,n,!0,i),P.messageHistory.push({role:`assistant`,content:n,executionLog:i}),W(),e}Y(a),await et(q(`assistant`,n,!0,i)),P.messageHistory.push({role:`assistant`,content:n,executionLog:i}),W()}catch{}finally{P.generatingSessionIds.delete(o),i.disabled=!1,document.getElementById(`userInput`).focus()}}document.addEventListener(`DOMContentLoaded`,async()=>{window.__tableBlocks=[],await we(),await kt(),chrome.runtime.onMessage.addListener(e=>{e.type===`SELECTION_AI_SEARCH`&&e.prompt&&(console.log(`[SidePanel] 收到选中文本 AI 搜索:`,e.selectedText?.substring(0,50)),It(e.prompt,e.selectedText),chrome.storage.session.remove(`pendingSelectionSearch`).catch(()=>{})),e.type===`FILL_SIDEPANEL_INPUT`&&e.text&&(console.log(`[SidePanel] 收到追问填充:`,e.text?.substring(0,50)),Lt(e.text),chrome.storage.session.remove(`pendingFillInput`).catch(()=>{})),e.type===`DIRECT_SEND`&&e.text&&(console.log(`[SidePanel] 收到直接发送:`,e.text?.substring(0,50)),Rt(e.text,e.selectedText||``),chrome.storage.session.remove(`pendingDirectSend`).catch(()=>{}))});let e=await chrome.storage.session.get(`pendingSelectionSearch`);if(e.pendingSelectionSearch&&e.pendingSelectionSearch.selectedText){let{prompt:t,selectedText:n}=e.pendingSelectionSearch;console.log(`[SidePanel] 有待处理的选中文本搜索:`,n?.substring(0,50)),setTimeout(()=>{It(t,n)},500),await chrome.storage.session.remove(`pendingSelectionSearch`)}let t=await chrome.storage.session.get(`pendingFillInput`);if(t.pendingFillInput&&t.pendingFillInput.text){let{text:e}=t.pendingFillInput;console.log(`[SidePanel] 有待填充的追问文本:`,e?.substring(0,50)),setTimeout(()=>{Lt(e)},500),await chrome.storage.session.remove(`pendingFillInput`)}let n=await chrome.storage.session.get(`pendingDirectSend`);if(n.pendingDirectSend&&n.pendingDirectSend.text){let{text:e,selectedText:t}=n.pendingDirectSend;console.log(`[SidePanel] 有待直接发送的文本:`,e?.substring(0,50)),setTimeout(()=>{Rt(e,t||``)},500),await chrome.storage.session.remove(`pendingDirectSend`)}chrome.tabs.onActivated.addListener(async e=>{console.log(`[SidePanel] Tab 切换, 新 Tab ID:`,e.tabId),P.currentTabId=e.tabId}),chrome.tabs.onUpdated.addListener(async(e,t)=>{t.status===`complete`&&P.currentTabId===e&&console.log(`[SidePanel] 当前 Tab 页面更新:`,t)}),typeof marked<`u`&&(marked.setOptions({breaks:!0,gfm:!0}),console.log(`[SidePanel] Marked 库已加载`)),typeof mermaid<`u`&&(mermaid.initialize({startOnLoad:!1,theme:`default`,securityLevel:`loose`,fontFamily:`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`}),console.log(`[SidePanel] Mermaid 库已加载`));let r=document.getElementById(`userInput`),i=document.getElementById(`sendBtn`),a=document.getElementById(`clearChatBtn`),s=document.getElementById(`exportChatBtn`),c=document.getElementById(`chatContainer`),l=document.getElementById(`tempDisplay`),u=document.getElementById(`tempDropdown`),d=document.getElementById(`tempPresetList`),f=document.getElementById(`tempSlider`),p=document.getElementById(`tempNumberInput`);function m(){!r||P.isScrolling||(r.style.height=`auto`,r.style.height=Math.min(r.scrollHeight,100)+`px`)}chrome.storage.local.get([`temperature`,`topP`,`selectedTempIndex`],e=>{e.temperature!==void 0&&(P.temperature=e.temperature),e.topP!==void 0&&(P.topP=e.topP),e.selectedTempIndex!==void 0&&(P.selectedTempIndex=e.selectedTempIndex),h()});function h(){f&&(f.value=P.temperature),p&&(p.value=P.temperature.toFixed(2));let e=document.getElementById(`tempIconValue`);e&&(e.textContent=P.temperature.toFixed(2)),g()}function g(){d.innerHTML=F.map((e,t)=>`
      <div class="temp-preset-item ${t===P.selectedTempIndex?`selected`:``}" data-index="${t}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${e.label}</div>
          <div class="temp-preset-desc" title="${e.tip}">${e.tip}</div>
        </div>
        <div class="temp-preset-value">${e.temp.toFixed(2)}</div>
      </div>
    `).join(``),d.querySelectorAll(`.temp-preset-item`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation(),_(parseInt(e.dataset.index))})})}function _(e){let t=F[e];t&&(P.selectedTempIndex=e,P.temperature=t.temp,h(),chrome.storage.local.set({temperature:P.temperature,topP:P.topP,selectedTempIndex:P.selectedTempIndex}))}f.addEventListener(`input`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),P.temperature=t,p.value=t.toFixed(2);let n=document.getElementById(`tempIconValue`);n&&(n.textContent=t.toFixed(2));let r=0,i=Math.abs(F[0].temp-t);for(let e=1;e<F.length;e++){let n=Math.abs(F[e].temp-t);n<i&&(i=n,r=e)}P.selectedTempIndex=r,g(),chrome.storage.local.set({temperature:P.temperature,topP:P.topP,selectedTempIndex:P.selectedTempIndex})}),p.addEventListener(`change`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),P.temperature=t,f.value=t,p.value=t.toFixed(2);let n=0,r=Math.abs(F[0].temp-t);for(let e=1;e<F.length;e++){let i=Math.abs(F[e].temp-t);i<r&&(r=i,n=e)}P.selectedTempIndex=n,g(),chrome.storage.local.set({temperature:P.temperature,topP:P.topP,selectedTempIndex:P.selectedTempIndex})}),l&&u&&(l.addEventListener(`click`,e=>{e.stopPropagation(),u.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{let t=document.querySelector(`.temp-selector`);t&&!t.contains(e.target)&&u.classList.remove(`show`)})),c.addEventListener(`mousedown`,e=>{P.lastMouseX=e.clientX,P.lastMouseY=e.clientY}),c.addEventListener(`mouseup`,e=>{P.lastMouseX=e.clientX,P.lastMouseY=e.clientY,P.enableSelectionQuery&&setTimeout(()=>{let e=window.getSelection();if(e&&!e.isCollapsed&&e.toString().trim()){let t=e.toString().trim();c.contains(e.anchorNode)&&t!==P.lastSelectedText&&(P.lastSelectedText=t,P.currentSelectionRange=e.getRangeAt(0).cloneRange(),Rn(t),zn(e,t,P.lastMouseX,P.lastMouseY))}else c.contains(e.anchorNode)||(P.lastSelectedText=``,P.currentSelectionRange=null,window.hideFloatingMenu())},10)});let v=``,y=null;async function ee(){try{let e=await new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>e(t))});if(e&&e.length>0){let t=await new Promise(t=>{chrome.tabs.sendMessage(e[0].id,{action:`getSelectedText`},e=>{chrome.runtime.lastError?(console.debug(`[SidePanel] content script 未加载或无法通信:`,chrome.runtime.lastError.message),t(null)):t(e)})});if(!t)return;let n=t?.text||``;n&&n.trim()?n!==v&&(v=n,Rn(n.trim())):v=``}}catch{}}function b(){y&&=(clearInterval(y),null),P.enableSelectionQuery&&(y=setInterval(ee,500))}b(),chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&`enableSelectionQuery`in e&&(P.enableSelectionQuery=e.enableSelectionQuery.newValue,b())}),chrome.storage.local.get([`modelName`,`customModels`,`customPrompts`,`systemPrompt`,`inputHistory`],e=>{let t=e.modelName;t&&(P.currentModel=t),P.customPrompts=e.customPrompts||[],P.systemPrompt=e.systemPrompt||``,P.inputHistory=e.inputHistory||[],on(),Ln(e.customModels,()=>{t&&In(t)})}),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`){if(e.customModels){let t=e.customModels.newValue||[],n=u.querySelector(`.model-section`);n&&n.querySelectorAll(`.model-option`).forEach(e=>{let t=e.dataset.value;t!==`deepseek-v4-pro`&&t!==`deepseek-v4-flash`&&e.remove()}),Ln(t)}if(e.modelName){let t=e.modelName.newValue;t&&(P.currentModel=t,In(t))}}}),jt(),document.addEventListener(`session-switched`,()=>{let e=document.getElementById(`chatContainer`),t=document.getElementById(`sendBtn`),n=document.getElementById(`userInput`);if(!e)return;if(t&&(t.disabled=!1),n&&n.focus(),e.innerHTML=``,!P.messageHistory||P.messageHistory.length===0){let t=document.createElement(`div`);t.className=`welcome-message`,t.innerHTML=`
        <div class="icon-wrapper">
          <div class="icon">💬</div>
        </div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      `,e.appendChild(t)}else P.messageHistory.forEach(e=>{q(e.role,e.content,!1,e.executionLog||[])}),Je();let r=P.pendingCallApiSessionIds.has(P.activeSessionId)&&!!P.pendingCancelApi;if(console.log(`[SidePanel] session-switched: pendingTask?`,r,`pendingSessionIds:`,[...P.pendingCallApiSessionIds],`activeSessionId:`,P.activeSessionId,`hasCancelApi:`,!!P.pendingCancelApi),r){console.log(`[SidePanel] 切回有后台任务的会话，显示加载状态`);let e=J();P.substituteLoadingIds.set(P.activeSessionId,e)}let i=`scrollPosition_`+(P.activeSessionId||`default`);chrome.storage.local.get([i],e=>{e[i]!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t&&(t.scrollTop=e[i])},150)})}),document.querySelectorAll(`.model-option`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.value;P.currentModel=n,In(n),chrome.storage.local.set({modelName:n})})}),document.addEventListener(`click`,e=>{let t=document.getElementById(`promptDropdown`),n=document.getElementById(`promptSelector`),r=document.getElementById(`selectionFloatingMenu`);if(n.contains(e.target)||(t.classList.remove(`show`),X()),r&&!r.contains(e.target)){let t=window.getSelection(),n=c.contains(e.target),r=t&&!t.isCollapsed&&c.contains(t.anchorNode);(!n||!r)&&window.hideFloatingMenu()}}),i.addEventListener(`click`,G);let x=document.getElementById(`promptTriggerBtn`);x&&x.addEventListener(`click`,e=>{e.stopPropagation(),x.blur(),cn()}),document.addEventListener(`keydown`,e=>{if((e.ctrlKey||e.metaKey)&&e.key===`t`){e.preventDefault();let t=document.getElementById(`toolsPopup`);t&&t.style.display!==`none`?Tn():wn()}}),r.addEventListener(`keydown`,e=>{let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);if(t.style.display!==`none`&&n.classList.contains(`show`)){let t=n.querySelectorAll(`.prompt-item`),r=t.length;if(r!==0&&e.key===`ArrowDown`){e.preventDefault(),P.selectedPromptIndex<0?P.selectedPromptIndex=0:P.selectedPromptIndex=(P.selectedPromptIndex+1)%r,dn(t);return}if(e.key===`ArrowUp`){e.preventDefault(),P.selectedPromptIndex<0||P.selectedPromptIndex===0?P.selectedPromptIndex=r-1:--P.selectedPromptIndex,dn(t);return}if(e.key===`Enter`&&(e.ctrlKey||e.metaKey)&&P.selectedPromptIndex>=0){e.preventDefault();let n=t[P.selectedPromptIndex].dataset.code;fn(n);return}if(e.key===`Enter`&&P.selectedPromptIndex>=0){e.preventDefault();let n=t[P.selectedPromptIndex].dataset.code;pn(n);return}if(e.key===`Escape`){X();return}}if(e.key===`Escape`){P.inputHistoryIndex>=0&&(P.inputHistoryIndex=-1),r.value&&(r.value=``,r.style.height=`auto`,r.dispatchEvent(new Event(`input`))),e.preventDefault();return}if(!(t.style.display!==`none`&&n.classList.contains(`show`))&&!P.isGenerating){if(e.key===`ArrowUp`){e.preventDefault(),P.inputHistoryIndex===-1?P.inputHistoryIndex=P.inputHistory.length-1:P.inputHistoryIndex>0&&P.inputHistoryIndex--,P.inputHistoryIndex<0&&(P.inputHistoryIndex=0),P.inputHistoryIndex>=0&&P.inputHistory.length>0&&(r.value=P.inputHistory[P.inputHistoryIndex],r.dispatchEvent(new Event(`input`)));return}if(e.key===`ArrowDown`){e.preventDefault(),P.inputHistoryIndex>=0&&P.inputHistoryIndex<P.inputHistory.length-1?(P.inputHistoryIndex++,r.value=P.inputHistory[P.inputHistoryIndex],r.dispatchEvent(new Event(`input`))):(P.inputHistoryIndex=-1,r.value=``,r.dispatchEvent(new Event(`input`)));return}}e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),G())}),r.addEventListener(`wheel`,e=>{P.isScrolling=!0;let t=r.style.height||r.offsetHeight+`px`;r.style.height=t,r.scrollHeight<=r.clientHeight+10&&(e.preventDefault(),e.stopPropagation()),setTimeout(()=>{P.isScrolling=!1},100)},{passive:!1}),r.addEventListener(`input`,e=>{let t=r.value;document.getElementById(`promptSelector`),document.getElementById(`promptDropdown`);let n=t.lastIndexOf(`/`);if(n!==-1){let e=t.substring(n+1);n===0||t[n-1]===`
`||t[n-1]===` `?sn(e):ln(e)}else X();m()}),c.addEventListener(`scroll`,()=>{let e=`scrollPosition_`+(P.activeSessionId||`default`);chrome.storage.local.set({[e]:c.scrollTop})}),a.addEventListener(`click`,()=>{Pt()}),s&&s.addEventListener(`click`,Nt);let S=document.getElementById(`settingsBtn`);S&&S.addEventListener(`click`,()=>{chrome.runtime.openOptionsPage()});let C=document.getElementById(`isolateChatBtn`),w=document.getElementById(`enableToolsBtn`),T=document.getElementById(`toolsConfigBtn`);chrome.storage.local.get([`isolateChat`,`enableSelectionQuery`,`enableTools`,`enabledTools`],e=>{e.isolateChat!==void 0&&(P.isolateChat=e.isolateChat),C.checked=P.isolateChat,e.enableSelectionQuery!==void 0&&(P.enableSelectionQuery=e.enableSelectionQuery);let t=document.getElementById(`enableSelectionQueryBtn`);t&&(t.checked=P.enableSelectionQuery),e.enableTools!==void 0&&(P.useTools=e.enableTools),e.enabledTools&&e.enabledTools.length>0?P.enabledTools=e.enabledTools:P.enabledTools=o.filter(e=>e.enabled).map(e=>e.id),P.enabledTools.length===0&&(P.useTools=!1),w&&(w.checked=P.useTools)}),C.addEventListener(`change`,()=>{P.isolateChat=C.checked,chrome.storage.local.set({isolateChat:P.isolateChat}),console.log(`[SidePanel] 记忆对话:`,P.isolateChat?`已启用`:`已禁用`)});let E=document.getElementById(`enableSelectionQueryBtn`);E&&E.addEventListener(`change`,()=>{P.enableSelectionQuery=E.checked,chrome.storage.local.set({enableSelectionQuery:P.enableSelectionQuery}),console.log(`[SidePanel] 划词问答:`,P.enableSelectionQuery?`已启用`:`已禁用`),!P.enableSelectionQuery&&P.selectedContextText&&U()}),w&&w.addEventListener(`change`,()=>{P.useTools=w.checked,chrome.storage.local.set({enableTools:P.useTools}),P.useTools&&P.enabledTools.length===0&&(P.enabledTools=o.filter(e=>e.enabled).map(e=>e.id),chrome.storage.local.set({enabledTools:P.enabledTools})),console.log(`[SidePanel] 工具总开关:`,P.useTools?`已启用`:`已禁用`)}),T&&T.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),wn()});let te=document.getElementById(`toolsPopupOverlay`),ne=document.getElementById(`toolsPopupClose`),D=te?te.querySelector(`.modal-container`):null;ne&&ne.addEventListener(`click`,Tn),D&&D.addEventListener(`click`,e=>{e.stopPropagation()});let O=document.getElementById(`toolsSearchInput`);O&&O.addEventListener(`input`,e=>{P.currentSearch=e.target.value.toLowerCase(),En()});let k=document.querySelectorAll(`.category-btn`);k.forEach(e=>{e.addEventListener(`click`,()=>{k.forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.style.background=`#f5f3ff`,e.style.color=`#667eea`,e.style.borderColor=`#d4cfff`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`,P.currentCategory=e.dataset.category,En()})});let A=document.getElementById(`toolsCategories`);A&&A.addEventListener(`wheel`,e=>{e.preventDefault(),A.scrollLeft+=e.deltaY*2},{passive:!1});let re=document.getElementById(`toolsSelectAll`),j=document.getElementById(`toolsSelectNone`);re&&re.addEventListener(`click`,()=>{kn().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!0),P.enabledTools.includes(e.id)||P.enabledTools.push(e.id)}),An(),jn(),Q()}),j&&j.addEventListener(`click`,()=>{kn().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!1);let n=P.enabledTools.indexOf(e.id);n>-1&&P.enabledTools.splice(n,1)}),An(),jn(),Q()});let M=document.getElementById(`toolsPopupSave`);M&&M.addEventListener(`click`,()=>{Mn(),Q()});let N=document.getElementById(`toolsPopupCancel`);N&&N.addEventListener(`click`,()=>{Tn()});let ie=document.getElementById(`modalCancelBtn`),ae=document.getElementById(`modalConfirmBtn`);ie.addEventListener(`click`,()=>{Ft()}),ae.addEventListener(`click`,()=>{Ft(),Mt()});let oe=document.getElementById(`confirmModal`);oe.addEventListener(`click`,e=>{e.target===oe&&Ft()});let se=document.getElementById(`selectionClose`);se&&se.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),console.log(`[SidePanel] 用户点击关闭选中内容按钮`),U(),window.hideFloatingMenu(),P.lastSelectedText=``,P.currentSelectionRange=null}),r.addEventListener(`input`,()=>{})}),Se().then(()=>$()),document.addEventListener(`DOMContentLoaded`,()=>{Fn()}),document.addEventListener(`DOMContentLoaded`,Oe),document.addEventListener(`DOMContentLoaded`,Cn),document.addEventListener(`DOMContentLoaded`,Ue);
//# sourceMappingURL=side_panel-CEwOtk-r.js.map