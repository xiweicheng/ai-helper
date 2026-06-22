import{n as e}from"./constants-BMbKeydk.js";var t=!1,n=[],r=`deepseek-v4-pro`,i=!0,a=!0,o=!1,s=null,c=``,l=``,u=[],d=-1,f=null,p=``,m=[],h=-1,g={maxInputHistory:20,maxHistoryMessages:50,maxMessageLength:5e3,maxMemoryMessages:null},_=.2,v=1,y=0,b=`all`,x=``,S=[],ee={},C=null,w=null,T=null,E=null,D=18e4,O=null,k=!1,A=``,j=null,M=null,N=0,te=0,ne=-1,P=!1,F={get isGenerating(){return t},set isGenerating(e){t=e},get messageHistory(){return n},set messageHistory(e){n=e},get currentModel(){return r},set currentModel(e){r=e},get useTools(){return i},set useTools(e){i=e},get isolateChat(){return a},set isolateChat(e){a=e},get enableSelectionQuery(){return o},set enableSelectionQuery(e){o=e},get currentTabId(){return s},set currentTabId(e){s=e},get selectedContextText(){return c},set selectedContextText(e){c=e},get quotedContextText(){return l},set quotedContextText(e){l=e},get customPrompts(){return u},set customPrompts(e){u=e},get selectedPromptIndex(){return d},set selectedPromptIndex(e){d=e},get draggedItemIndex(){return f},set draggedItemIndex(e){f=e},get systemPrompt(){return p},set systemPrompt(e){p=e},get inputHistory(){return m},set inputHistory(e){m=e},get inputHistoryIndex(){return h},set inputHistoryIndex(e){h=e},get chatConfig(){return g},set chatConfig(e){g=e},get temperature(){return _},set temperature(e){_=e},get topP(){return v},set topP(e){v=e},get selectedTempIndex(){return y},set selectedTempIndex(e){y=e},get currentCategory(){return b},set currentCategory(e){b=e},get currentSearch(){return x},set currentSearch(e){x=e},get enabledTools(){return S},set enabledTools(e){S=e},get collapsedCategories(){return ee},get currentExecutionStatus(){return C},set currentExecutionStatus(e){C=e},get executionLogListener(){return w},set executionLogListener(e){w=e},get currentClarifyToolCallId(){return T},set currentClarifyToolCallId(e){T=e},get clarifyTimerInterval(){return E},set clarifyTimerInterval(e){E=e},get clarifyTimeoutValue(){return D},set clarifyTimeoutValue(e){D=e},get messageTocContainer(){return O},set messageTocContainer(e){O=e},get isMouseOverToc(){return k},set isMouseOverToc(e){k=e},get lastSelectedText(){return A},set lastSelectedText(e){A=e},get currentSelectionRange(){return j},set currentSelectionRange(e){j=e},get selectedHighlightElement(){return M},set selectedHighlightElement(e){M=e},get lastMouseX(){return N},set lastMouseX(e){N=e},get lastMouseY(){return te},set lastMouseY(e){te=e},get pendingDeleteIndex(){return ne},set pendingDeleteIndex(e){ne=e},get isScrolling(){return P},set isScrolling(e){P=e}},I=[{label:`精准编码`,temp:.2,topP:1,tip:`较低随机性，适合业务开发、调试、纠错`},{label:`均衡开发`,temp:.45,topP:.9,tip:`兼顾稳定性，用于封装工具类、常规脚本`},{label:`架构探索`,temp:.65,topP:.9,tip:`提供多种实现思路，用于组件重构、方案对比`},{label:`创意发散`,temp:.9,topP:.9,tip:`随机性较高，仅用于原型探索，不建议生产代码`}];function L(e,t=`info`,n=3e3){let r=document.getElementById(`toastContainer`);if(!r)return;let i=document.createElement(`div`);i.className=`toast ${t}`,i.textContent=e,r.appendChild(i),requestAnimationFrame(()=>{i.classList.add(`toast-show`)}),setTimeout(()=>{i.classList.remove(`toast-show`),setTimeout(()=>{i.parentNode&&i.parentNode.removeChild(i)},300)},n)}function re(){let e=document.getElementById(`userInput`);e&&(e.style.height=`auto`,e.style.height=Math.min(e.scrollHeight,100)+`px`)}function R(e){if(!e)return``;let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function z(e){return!e||e<0?`0ms`:e<1e3?`${Math.round(e)}ms`:e<6e4?`${(e/1e3).toFixed(1)}s`:`${Math.floor(e/6e4)}分${(e%6e4/1e3).toFixed(1)}秒`}function ie(e,t){navigator.clipboard.writeText(e).then(()=>{let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
    </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(n=>{console.error(`[SidePanel] 复制失败:`,n);let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>`,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{L(`复制失败`,`error`)}document.body.removeChild(r)})}function ae(){let e=new Date().toLocaleString(`zh-CN`),t=`

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
`}function oe(){return new Promise(e=>{chrome.storage.local.get([`temperature`,`topP`],t=>{e({temperature:t.temperature===void 0?parseFloat(F.temperature.toFixed(2)):parseFloat(t.temperature.toFixed(2)),top_p:t.topP===void 0?parseFloat(F.topP.toFixed(2)):parseFloat(t.topP.toFixed(2))})})})}function se(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(F.chatConfig=t,console.log(`[SidePanel] 对话配置已加载:`,F.chatConfig)),e(t)})})}async function ce(){return new Promise(e=>{chrome.runtime.sendMessage({type:`GET_CHAT_CONFIG`},t=>{t&&(F.chatConfig=t,console.log(`[SidePanel] 同步加载对话配置:`,F.chatConfig)),e()})})}async function le(){return new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>{t&&t.length>0&&t[0].id?(F.currentTabId=t[0].id,console.log(`[SidePanel] 获取当前 Tab ID:`,F.currentTabId,`URL:`,t[0].url),e(F.currentTabId)):(console.warn(`[SidePanel] 未获取到有效的 Tab ID`),e(null))})})}function ue(){return new Promise(e=>{chrome.storage.local.get([`reactMaxIterations`,`reactApiTimeout`,`reactLoopTimeout`,`reactToolTimeout`,`reactClarifyTimeout`],t=>{e({maxIterations:t.reactMaxIterations||30,apiTimeout:t.reactApiTimeout||6e4,loopTimeout:t.reactLoopTimeout||3e5,toolTimeout:t.reactToolTimeout||3e4,clarifyTimeout:t.reactClarifyTimeout||18e4})})})}function de(e){if(!e||!e.trim()||e.trim()==`/`)return;let t=e.trim(),n=F.inputHistory.indexOf(t);n!==-1&&F.inputHistory.splice(n,1),F.inputHistory.push(t),F.inputHistory.length>F.chatConfig.maxInputHistory&&F.inputHistory.shift(),fe()}function fe(){try{chrome.storage.local.set({inputHistory:F.inputHistory}),console.log(`[SidePanel] 输入历史已保存，数量:`,F.inputHistory.length)}catch(e){console.error(`[SidePanel] 保存输入历史失败:`,e)}}function pe(){document.addEventListener(`mouseover`,me,!0),document.addEventListener(`mouseout`,he,!0),console.log(`[SidePanel] 消息目录功能已初始化`)}function me(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){F.isMouseOverToc=!0;return}let t=e.target.closest(`.message.assistant`);if(!t)return;let n=t.querySelectorAll(`.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6`);if(n.length===0){_e();return}ge(t,n)}function he(e){if(!(e.target instanceof Element))return;if(e.target.closest(`.message-toc-container`)){F.isMouseOverToc=!1;return}if(!e.target.closest(`.message.assistant`))return;let t=e.relatedTarget;t&&(t.closest(`.message-toc-container`)||t.closest(`.message.assistant`))||F.isMouseOverToc||_e()}function ge(e,t){let n=Array.from(t);F.messageTocContainer&&_e(),n.forEach((e,t)=>{e.id||=`toc-heading-${Date.now()}-${t}`});let r=document.createElement(`div`);r.className=`message-toc-container`,r.dataset.headingsCount=n.length;let i=0,a=n.map(e=>{let t=parseInt(e.tagName.charAt(1)),n=e.textContent.trim(),r=n.length>30?n.substring(0,30)+`...`:n,a=`H${t}`;return i++,`
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
  `,document.body.appendChild(r),F.messageTocContainer=r;let o=r.querySelector(`.message-toc-toggle`),s=r.querySelector(`.message-toc-panel`);o.addEventListener(`mouseenter`,()=>{s.classList.add(`expanded`)}),o.addEventListener(`click`,()=>{s.classList.toggle(`expanded`)}),s.addEventListener(`mouseenter`,()=>{s.classList.add(`expanded`)}),r.querySelectorAll(`.message-toc-item`).forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.target,n=document.getElementById(t);n&&(n.scrollIntoView({behavior:`smooth`,block:`start`}),n.classList.add(`toc-highlight`),setTimeout(()=>{n.classList.remove(`toc-highlight`)},1500))})})}function _e(){F.messageTocContainer&&=(F.messageTocContainer.remove(),null)}function ve(e){return`${Math.floor(e/60)}:${(e%60).toString().padStart(2,`0`)}`}function ye(e=`default`){try{let t=new(window.AudioContext||window.webkitAudioContext),n=t.createOscillator(),r=t.createGain();n.connect(r),r.connect(t.destination);let i={default:{frequency:800,duration:.3},success:{frequency:523,duration:.2},warning:{frequency:440,duration:.4},error:{frequency:220,duration:.5}},a=i[e]||i.default;n.frequency.value=a.frequency,n.type=`sine`,r.gain.setValueAtTime(.3,t.currentTime),r.gain.exponentialRampToValueAtTime(.01,t.currentTime+a.duration),n.start(t.currentTime),n.stop(t.currentTime+a.duration),console.log(`[SidePanel] 提示音已播放:`,e)}catch(e){console.error(`[SidePanel] 播放提示音失败:`,e.message)}}function be(e,t){let n=document.getElementById(`clarifyTimer`),r=document.getElementById(`clarifyTimerText`);if(!n||!r)return;r.textContent=`剩余时间: ${ve(e)}`;let i=e/t*100;n.classList.remove(`warning`,`critical`),e<=10?(n.classList.add(`critical`),r.textContent=`即将超时: ${ve(e)}`):(e<=30||i<=15)&&n.classList.add(`warning`),e===30&&ye(`warning`)}function xe(e){B(),F.clarifyTimeoutValue=e;let t=Math.ceil(e/1e3),n=t;be(n,t),F.clarifyTimerInterval=setInterval(()=>{n--,n<=0?B():be(n,t)},1e3)}function B(){F.clarifyTimerInterval&&=(clearInterval(F.clarifyTimerInterval),null)}function Se(e){console.log(`[SidePanel] 显示澄清对话框:`,e);let{question:t,options:n,recommendedOption:r,allowCustomInput:i=!0,allowAdditionalInfo:a=!0,toolCallId:o,timeout:s=18e4}=e;F.currentClarifyToolCallId=o;let c=r!==void 0&&r>=0?r:0,l=[c],u=c,d=document.getElementById(`clarifyQuestion`);d&&(d.textContent=t);let f=document.getElementById(`clarifyOptionsList`);if(f&&(document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.remove()}),n.forEach((e,t)=>{let n=l.includes(t),r=document.createElement(`div`);r.className=`clarify-option-item ${u===t?`selected`:``} ${n?`recommended`:``}`,r.dataset.index=t,r.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${e}${n?`<span class="clarify-option-badge">推荐</span>`:``}</div>
      `,r.addEventListener(`click`,()=>we(t)),f.appendChild(r)}),i)){let e=document.createElement(`div`);e.className=`clarify-option-item`,e.dataset.index=-1,e.innerHTML=`
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `,e.addEventListener(`click`,()=>we(-1)),f.appendChild(e);let t=document.getElementById(`clarifyCustomInput`);t&&f.appendChild(t)}let p=document.getElementById(`clarifyCustomInput`);p&&p.classList.remove(`show`);let m=document.getElementById(`clarifyAdditionalInfo`);m&&m.classList.toggle(`show`,a);let h=document.getElementById(`clarifyCustomTextarea`);h&&(h.value=``);let g=document.getElementById(`clarifyAdditionalTextarea`);g&&(g.value=``);let _=document.getElementById(`clarifyOverlay`);_&&_.classList.add(`show`),xe(s),console.log(`[SidePanel] 澄清对话框已显示`)}function Ce(){let e=document.getElementById(`clarifyOverlay`);e&&e.classList.remove(`show`),F.currentClarifyToolCallId=null,B(),console.log(`[SidePanel] 澄清对话框已隐藏`)}function we(e){document.querySelectorAll(`.clarify-option-item`).forEach(e=>{e.classList.remove(`selected`)});let t=document.querySelector(`.clarify-option-item[data-index="${e}"]`);t&&t.classList.add(`selected`);let n=document.getElementById(`clarifyCustomInput`);if(n)if(e===-1){n.classList.add(`show`);let e=document.getElementById(`clarifyCustomTextarea`);e&&e.focus()}else n.classList.remove(`show`);console.log(`[SidePanel] 选择澄清选项:`,e)}function Te(){if(!F.currentClarifyToolCallId){console.error(`[SidePanel] 没有当前工具调用ID`);return}let e=-1;document.querySelectorAll(`.clarify-option-item`).forEach((t,n)=>{t.classList.contains(`selected`)&&(e=parseInt(t.dataset.index))});let t=document.getElementById(`clarifyCustomTextarea`),n=t?t.value.trim():``,r=document.getElementById(`clarifyAdditionalTextarea`),i=r?r.value.trim():``,a={type:`CLARIFY_RESPONSE`,toolCallId:F.currentClarifyToolCallId,selectedOption:e,customInput:n,additionalInfo:i};console.log(`[SidePanel] 发送澄清响应:`,a),chrome.runtime.sendMessage(a),Ce()}function Ee(){if(F.currentClarifyToolCallId){let e={type:`CLARIFY_RESPONSE`,toolCallId:F.currentClarifyToolCallId,selectedOption:-1,customInput:``,additionalInfo:``};chrome.runtime.sendMessage(e)}Ce()}function De(){let e=document.getElementById(`clarifyConfirmBtn`);e&&e.addEventListener(`click`,Te);let t=document.getElementById(`clarifyCancelBtn`);t&&t.addEventListener(`click`,Ee),chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.type===`SHOW_CLARIFY_DIALOG`)console.log(`[SidePanel] 收到澄清请求:`,e),Se(e.data),n({success:!0});else if(e.type===`PLAY_NOTIFICATION_SOUND`)console.log(`[SidePanel] 收到播放提示音请求:`,e),ye(e.soundType),n({success:!0});else if(e.type===`CLARIFY_TIMEOUT`){console.log(`[SidePanel] 收到澄清超时通知:`,e);let t=document.getElementById(`clarifyTimer`),n=document.getElementById(`clarifyTimerText`);t&&n&&(t.classList.remove(`warning`),t.classList.add(`critical`),n.textContent=`已超时`),ye(`error`)}}),console.log(`[SidePanel] 澄清对话框事件已初始化`)}function Oe(e){if(!e)return``;let t=[];e=e.replace(/```mermaid\n?([\s\S]*?)```/g,(e,n)=>{let r=t.length;return t.push(n.trim()),`%%MERMAID_BLOCK_${r}%%`});let n=[];e=e.replace(/```(\w*)\n?([\s\S]*?)```/g,(e,t,r)=>{let i=n.length;return n.push({language:t||`text`,content:r.trim()}),`%%CODE_BLOCK_${i}%%`});let r=[];e=e.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)*)/gm,(e,t,n,i)=>{let a=r.length;return r.push({header:t,separator:n,body:i,full:e.trim()}),`\n%%TABLE_BLOCK_${a}%%\n`});let i=``;return typeof marked<`u`?(marked.setOptions({breaks:!0,gfm:!0}),i=marked.parse(e)):i=e.replace(/`([^`]+)`/g,`<code>$1</code>`).replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`).replace(/\*([^*]+)\*/g,`<em>$1</em>`).replace(/\n/g,`<br>`),t.forEach((e,t)=>{i=i.replace(`%%MERMAID_BLOCK_${t}%%`,`<div class="mermaid" data-raw-code="${encodeURIComponent(e)}">${e}</div>`)}),n.forEach((e,t)=>{let n=e.content.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`);i=i.replace(`%%CODE_BLOCK_${t}%%`,`<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" data-code="${t}" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre><code class="language-${e.language}">${n}</code></pre>
      </div>`)}),r.forEach((e,t)=>{i=i.replace(`%%TABLE_BLOCK_${t}%%`,Ae(e))}),i}function ke(e){if(!e)return``;let t=e.replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`);return t=t.replace(/`([^`]+)`/g,`<code>$1</code>`),t=t.replace(/\*\*([^*]+)\*\*/g,`<strong>$1</strong>`),t=t.replace(/\*([^*]+)\*/g,`<em>$1</em>`),t=t.replace(/~~([^~]+)~~/g,`<del>$1</del>`),t}function Ae(e){let{header:t,body:n,full:r}=e,i=window.__tableBlocks?window.__tableBlocks.length:0;window.__tableBlocks&&(window.__tableBlocks[i]={full:r,header:t,body:n});let a=t.split(`|`).filter(e=>e.trim()).map(e=>ke(e.trim())),o=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>ke(e.trim()))),s=`<div class="table-container-wrapper"><table>`;return s+=`<thead><tr>`,a.forEach((e,t)=>{t===a.length-1?s+=`<th class="table-header-cell-wrapper">
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
      </th>`:s+=`<th>${e}</th>`}),s+=`</tr></thead>`,s+=`<tbody>`,o.forEach(e=>{s+=`<tr>`,e.forEach(e=>{s+=`<td>${e}</td>`}),s+=`</tr>`}),s+=`</tbody>`,s+=`</table></div>`,s}function je(e){try{let{header:t,body:n}=e,r=t.split(`|`).filter(e=>e.trim()).map(e=>e.trim()),i=n.trim().split(`
`).filter(e=>e.trim()).map(e=>e.split(`|`).filter(e=>e.trim()).map(e=>e.trim())),a=`﻿`;a+=r.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`,i.forEach(e=>{a+=e.map(e=>`"${e.replace(/"/g,`""`)}"`).join(`,`)+`
`});let o=new Blob([a],{type:`text/csv;charset=utf-8;`}),s=document.createElement(`a`),c=URL.createObjectURL(o);s.setAttribute(`href`,c),s.setAttribute(`download`,`table-${Date.now()}.csv`),s.style.visibility=`hidden`,document.body.appendChild(s),s.click(),document.body.removeChild(s),console.log(`[SidePanel] Excel 下载成功`)}catch(e){console.error(`[SidePanel] 下载 Excel 失败:`,e),L(`下载失败: `+e.message,`error`)}}async function Me(){if(typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}console.log(`[SidePanel] ===== renderMermaidCharts 开始 =====`);let e=document.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,e.length),e.length!==0){for(let t=0;t<e.length;t++){let n=e[t];try{await mermaid.run({nodes:[n]}),console.log(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染成功`),Pe(n)}catch(e){console.error(`[SidePanel] 第`,t+1,`个 mermaid 图表渲染失败:`,e),!n.querySelector(`svg`)&&!n.querySelector(`.mermaid-controls`)&&(n.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0;">图表渲染失败: ${e.message}</div>`)}}console.log(`[SidePanel] ===== renderMermaidCharts 完成 =====`)}}function Ne(e){return e?`<div class="markdown-body">${Oe(e)}</div>`:``}function Pe(e){if(e.querySelector(`.mermaid-controls`)){console.log(`[SidePanel] 工具栏已存在，跳过`);return}let t=e.querySelector(`svg`);if(!t){console.warn(`[SidePanel] SVG 元素未找到，当前内容:`,e.innerHTML.substring(0,100));return}console.log(`[SidePanel] 找到 SVG 元素，开始添加工具栏`),console.log(`[SidePanel] container 类名:`,e.className),console.log(`[SidePanel] container HTML:`,e.innerHTML.substring(0,200)),e.style.position=`relative`,e.style.cursor=`grab`,e.style.userSelect=`none`,e.style.webkitUserSelect=`none`;let n=e.querySelector(`.mermaid-svg-wrapper`);if(!n){n=document.createElement(`div`),n.className=`mermaid-svg-wrapper`,n.style.transformOrigin=`center center`,n.style.transition=`transform 0.2s ease`,n.style.display=`inline-block`,n.style.width=`100%`,t.style.maxWidth=`100%`,t.style.height=`auto`,t.style.userSelect=`none`,t.style.webkitUserSelect=`none`,n.appendChild(t),e.insertBefore(n,e.firstChild);let r=[];Array.from(e.childNodes).forEach(e=>{e.nodeType===Node.TEXT_NODE&&e.textContent.trim()&&r.push(e)}),r.forEach(e=>e.remove())}let r=document.createElement(`div`);r.className=`mermaid-controls`,r.innerHTML=`
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
  `,e.appendChild(r),console.log(`[SidePanel] 工具栏 HTML 已添加`),console.log(`[SidePanel] container 子元素:`,Array.from(e.children).map(e=>e.className).join(`, `));let i=1,a=.3,o=.15,s=e.dataset.rawCode||``;if(!s){let e=t.querySelector(`title`);e&&e.textContent&&(s=e.textContent.trim())}if(!s){let e=t.querySelector(`script[type="text/plain"]`);e&&(s=e.textContent.trim())}s&&!e.dataset.rawMermaidCode&&(e.dataset.rawMermaidCode=s),r.querySelector(`.view-source`).addEventListener(`click`,r=>{r.stopPropagation();let s=e.getAttribute(`data-raw-code`);Le(e,s?decodeURIComponent(s):e.dataset.rawMermaidCode||``,n,t,i,{MIN_SCALE:a,MAX_SCALE:3,SCALE_STEP:o})}),r.querySelector(`.copy-to-clipboard`).addEventListener(`click`,e=>{e.stopPropagation(),Fe(t,n,i)}),r.querySelector(`.download-png`).addEventListener(`click`,e=>{e.stopPropagation(),Ie(t,i)}),e.addEventListener(`wheel`,e=>{!e.ctrlKey&&!e.metaKey||(e.preventDefault(),e.stopPropagation(),i=e.deltaY<0?Math.min(3,i+o):Math.max(a,i-o),p())},{passive:!1});let c=!1,l,u,d=0,f=0;function p(){n.style.transform=`translate(${d}px, ${f}px) scale(${i})`}r.querySelector(`.zoom-in`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.min(3,i+o),p()}),r.querySelector(`.zoom-out`).addEventListener(`click`,e=>{e.stopPropagation(),i=Math.max(a,i-o),p()}),r.querySelector(`.reset-zoom`).addEventListener(`click`,e=>{e.stopPropagation(),i=1,d=0,f=0,p()}),e.addEventListener(`mousedown`,t=>{t.target.tagName!==`BUTTON`&&(c=!0,l=t.clientX-d,u=t.clientY-f,e.style.cursor=`grabbing`)}),document.addEventListener(`mousemove`,e=>{c&&(d=e.clientX-l,f=e.clientY-u,p())}),document.addEventListener(`mouseup`,()=>{c&&(c=!1,e.style.cursor=`grab`)})}async function Fe(e,t,n){try{console.log(`[SidePanel] 开始复制到剪贴板`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){if(e)if(navigator.clipboard&&typeof ClipboardItem<`u`)navigator.clipboard.write([new ClipboardItem({"image/png":e})]).then(()=>{console.log(`[SidePanel] 图片复制到剪贴板成功`),L(`Mermaid 图表已复制到剪贴板！`,`success`)}).catch(e=>{console.error(`[SidePanel] 复制到剪贴板失败:`,e),L(`复制失败，您的浏览器可能不支持此功能。请尝试使用下载按钮保存图表。`,`error`)});else{console.warn(`[SidePanel] Clipboard API 不可用，降级为下载`),L(`当前浏览器不支持图片复制功能，已自动转为下载。`,`warning`);let t=document.createElement(`a`);t.href=URL.createObjectURL(e),t.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(t),t.click(),document.body.removeChild(t)}},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] 图片转换失败:`,e),L(`图片转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 复制到剪贴板失败:`,e),L(`复制失败: `+e.message,`error`)}}function Ie(e,t){try{console.log(`[SidePanel] 开始下载 PNG`);let t=e.width.baseVal?.value||e.getAttribute(`width`)?.replace(`px`,``)||800,n=e.height.baseVal?.value||e.getAttribute(`height`)?.replace(`px`,``)||600,r=e.getAttribute(`viewBox`);if(r){let e=r.split(` `).map(parseFloat);t=e[2],n=e[3]}console.log(`[SidePanel] SVG 原始尺寸:`,t,`x`,n);let i=new XMLSerializer().serializeToString(e),a=`data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(i)))}`,o=new Image;o.onload=function(){console.log(`[SidePanel] SVG 图片加载成功`);let e=t+40,r=n+40,i=document.createElement(`canvas`);i.width=e*2,i.height=r*2;let a=i.getContext(`2d`);a.fillStyle=`#ffffff`,a.fillRect(0,0,i.width,i.height),a.drawImage(o,40,40,t*2,n*2),i.toBlob(function(e){let t=URL.createObjectURL(e),n=document.createElement(`a`);n.href=t,n.download=`mermaid-diagram-`+Date.now()+`.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n),URL.revokeObjectURL(t),console.log(`[SidePanel] PNG 下载成功`)},`image/png`)},o.onerror=function(e){console.error(`[SidePanel] PNG 转换失败:`,e),L(`PNG 转换失败，请重试`,`error`)},o.src=a}catch(e){console.error(`[SidePanel] 下载 PNG 失败:`,e),L(`下载失败: `+e.message,`error`)}}function Le(e,t,n,r,i,a){let o=e.querySelector(`.mermaid-source-view`),s=e.querySelector(`.mermaid-controls`);if(o)o.parentElement&&o.parentElement.remove(),n&&(n.style.display=`inline-block`),Pe(e);else{n&&(n.style.display=`none`),s&&s.remove();let o=document.createElement(`div`);o.className=`mermaid-container-wrapper`,o.style.position=`relative`;let c=document.createElement(`pre`);c.className=`mermaid-source-view`,c.style.position=`relative`,c.textContent=t;let l=document.createElement(`button`);l.className=`source-copy-btn`,l.title=`复制源代码`,l.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
      </svg>
    `,l.addEventListener(`click`,e=>{e.stopPropagation(),ie(t,l)});let u=document.createElement(`button`);u.className=`source-copy-btn`,u.style.right=`44px`,u.title=`返回图表`,u.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 0 1 .192.41l-1.966 2.36a1.25 1.25 0 0 0 0 1.32l1.965 2.36a.25.25 0 0 1-.192.41h-3.932a.25.25 0 0 1-.192-.41l-1.966-2.36a1.25 1.25 0 0 0 0-1.32l1.966-2.36a.25.25 0 0 1 .192-.41zm-6.068 0H1.534a.25.25 0 0 0-.192.41l1.966 2.36a1.25 1.25 0 0 1 0 1.32l-1.966 2.36A.25.25 0 0 0 1.534 14h3.932a.25.25 0 0 0 .192-.41l-1.966-2.36a1.25 1.25 0 0 1 0-1.32l1.966-2.36a.25.25 0 0 0-.192-.41z"/>
      </svg>
    `,u.addEventListener(`click`,o=>{o.stopPropagation(),Le(e,t,n,r,i,a)}),c.appendChild(l),c.appendChild(u),o.appendChild(c),e.appendChild(o)}}async function Re(e){if(console.log(`[SidePanel] ===== renderMessageMermaid 开始 =====`),typeof mermaid>`u`){console.warn(`[SidePanel] Mermaid 库未加载`);return}await new Promise(e=>setTimeout(e,300));let t=e.querySelectorAll(`.mermaid`);if(console.log(`[SidePanel] 找到 mermaid 元素数量:`,t.length),t.length===0){console.log(`[SidePanel] 未找到 mermaid 元素`);return}try{await mermaid.run({nodes:Array.from(t)}),console.log(`[SidePanel] Mermaid.run 完成`),await new Promise(e=>setTimeout(e,300)),t.forEach((e,t)=>{console.log(`[SidePanel] 开始为第`,t+1,`个图表添加工具栏`),Pe(e)}),await new Promise(e=>setTimeout(e,100));let n=e.querySelectorAll(`.mermaid-controls`);console.log(`[SidePanel] 工具栏添加结果:`,n.length,`个成功`)}catch(e){console.error(`[SidePanel] Mermaid 渲染失败:`,e),t.forEach(t=>{!t.querySelector(`svg`)&&!t.querySelector(`.mermaid-controls`)&&(t.innerHTML=`<div style="color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px;">图表渲染失败: ${e.message}</div>`)})}ze()}function ze(){let e=document.querySelectorAll(`.code-copy-btn`);console.log(`[SidePanel] 找到代码复制按钮数量:`,e.length),e.forEach((e,t)=>{if(e.dataset.bound){console.log(`[SidePanel] 按钮`,t,`已绑定，跳过`);return}e.dataset.bound=`true`,e.addEventListener(`click`,t=>{console.log(`[SidePanel] 代码复制按钮被点击`),t.stopPropagation();let n=e.closest(`.code-block-container`);if(console.log(`[SidePanel] 找到容器:`,!!n),n){let t=n.querySelector(`pre code`);if(console.log(`[SidePanel] 找到代码元素:`,!!t),t){let n=t.textContent;console.log(`[SidePanel] 代码长度:`,n.length),ie(n,e)}}}),console.log(`[SidePanel] 已绑定按钮`,t)}),Be()}function Be(){document.querySelectorAll(`.copy-md-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&ie(r.full,e)}))}),document.querySelectorAll(`.download-excel-btn`).forEach((e,t)=>{e.dataset.bound||(e.dataset.bound=`true`,e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.tableIndex,r=window.__tableBlocks?.[parseInt(n)];r&&je(r)}))})}function Ve(e){F.quotedContextText=e;let t=document.getElementById(`selectionIndicator`),n=document.getElementById(`selectionText`),r=document.getElementById(`userInput`);if(t&&n&&r){let r;r=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,n.textContent=`💬 已引用: ${r}`,t.classList.add(`show`)}}function V(){console.log(`[SidePanel] 清除选中内容上下文`),F.selectedContextText=``,F.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=e.findIndex(e=>e.startsWith(`[用户问题]`));n===-1?t.value=``:t.value=e.slice(n+1).join(`
`).trim()}}async function He(){chrome.storage.local.get([`chatHistory`,`scrollPosition`],e=>{if(e.chatHistory&&e.chatHistory.length>0){F.messageHistory=e.chatHistory,F.messageHistory.forEach(e=>{G(e.role,e.content,!1,e.executionLog||[])});let t=document.querySelector(`.welcome-message`);t&&t.remove(),Me(),e.scrollPosition!==void 0&&setTimeout(()=>{let t=document.getElementById(`chatContainer`);t.scrollTop=e.scrollPosition},100)}})}function H(){let e=F.messageHistory.slice(-F.chatConfig.maxHistoryMessages).map(e=>({role:e.role,content:e.content.substring(0,F.chatConfig.maxMessageLength),executionLog:e.executionLog||[]}));try{chrome.storage.local.set({chatHistory:e},t=>{if(chrome.runtime.lastError){if(console.error(`[SidePanel] 保存对话历史失败:`,chrome.runtime.lastError.message),F.messageHistory.length>5){F.messageHistory=F.messageHistory.slice(-5);let e=F.messageHistory.map(e=>({role:e.role,content:e.content.substring(0,2e3),executionLog:e.executionLog||[]}));chrome.storage.local.set({chatHistory:e},()=>{chrome.runtime.lastError?console.error(`[SidePanel] 再次保存失败:`,chrome.runtime.lastError.message):console.log(`[SidePanel] 截断后保存成功，消息数:`,e.length)})}}else console.log(`[SidePanel] 对话历史已保存，消息数:`,e.length)})}catch(e){console.error(`[SidePanel] 保存对话历史异常:`,e)}}function Ue(){F.messageHistory=[],chrome.storage.local.remove([`chatHistory`,`scrollPosition`],()=>{let e=document.getElementById(`chatContainer`);e.innerHTML=`
      <div class="welcome-message">
        <div class="icon">💬</div>
        <h2>开始对话</h2>
        <p>输入您的问题，AI 助手将为您解答</p>
      </div>
    `,console.log(`[SidePanel] 对话历史已清除`)})}function We(){if(!F.messageHistory||F.messageHistory.length===0){L(`当前没有对话历史可导出`,`warning`);return}let e=F.messageHistory.map((e,t)=>{let n=document.querySelectorAll(`.message`)[t],r=null;return r=n&&n.dataset.timestamp?n.dataset.timestamp:new Date().toISOString(),{role:e.role===`user`?`user`:`assistant`,content:e.content||``,timestamp:r,displayName:e.role===`user`?`我`:`AI助手`}}),t=new Date,n=`ai-helper-${t.getFullYear()+String(t.getMonth()+1).padStart(2,`0`)+String(t.getDate()).padStart(2,`0`)+`-`+String(t.getHours()).padStart(2,`0`)+String(t.getMinutes()).padStart(2,`0`)+String(t.getSeconds()).padStart(2,`0`)}.json`,r=JSON.stringify(e,null,2),i=new Blob([r],{type:`application/json;charset=utf-8;`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=n,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a),console.log(`[SidePanel] 对话历史已导出:`,n,`共`,e.length,`条消息`),L(`对话历史已导出 (${e.length} 条消息)`,`success`)}function Ge(){document.getElementById(`confirmModal`).classList.add(`show`)}function Ke(){document.getElementById(`confirmModal`).classList.remove(`show`)}async function U(){let e=document.getElementById(`userInput`),t=document.getElementById(`sendBtn`),n=document.getElementById(`chatContainer`),r=e.value.trim();if(!r||F.isGenerating)return;let i=n.querySelector(`.welcome-message`);i&&i.remove();let a=r,o=F.enableSelectionQuery&&F.selectedContextText&&F.selectedContextText.trim(),s=F.quotedContextText&&F.quotedContextText.trim();if(s){let e=F.quotedContextText.trim();a=`[引用内容]\n${e}\n\n[用户问题]\n${r}`,W(`quoted`,e,!1),F.quotedContextText=``}else if(o){let e=F.selectedContextText.trim();a=`[选中内容]\n${e}\n\n[用户问题]\n${r}`,W(`selected`,e,!1),F.selectedContextText=``}G(`user`,r),F.messageHistory.push({role:`user`,content:a}),H(),de(r),e.value=``,e.style.height=`auto`,(o||s)&&V(),F.isGenerating=!0,t.disabled=!0;let c=nt(),l=F.currentModel;try{await ce(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,F.isolateChat),console.log(`  - chatConfig:`,F.chatConfig),console.log(`  - messageHistory.length:`,F.messageHistory.length);let e=[{role:`system`,content:ae()}];if(F.isolateChat){let t=F.messageHistory;F.chatConfig.maxMemoryMessages!==null&&F.chatConfig.maxMemoryMessages!==void 0&&F.chatConfig.maxMemoryMessages>0?(t=[...F.messageHistory.slice(0,-1).slice(-F.chatConfig.maxMemoryMessages),F.messageHistory[F.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,F.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,F.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:a});let t=await oe(),n,r;try{let i=await rt(e,l,F.useTools,t);n=i.content,r=i.executionLog||[]}catch(e){throw K(c),n=`❌ 请求失败：`+(e.message||`未知错误`),r=e.executionLog||[],G(`assistant`,n,!0,r),F.messageHistory.push({role:`assistant`,content:n,executionLog:r}),H(),e}K(c),await Re(G(`assistant`,n,!0,r)),F.messageHistory.push({role:`assistant`,content:n,executionLog:r}),H()}catch{}finally{F.isGenerating=!1,t.disabled=!1,e.focus()}}function qe(e,t){let n=document.getElementById(`userInput`);if(!t||F.isGenerating){console.log(`[SidePanel] triggerSelectionSearch 跳过:`,{hasText:!!t,isGenerating:F.isGenerating});return}let r=F.enableSelectionQuery;F.enableSelectionQuery=!0,F.selectedContextText=t,F.quotedContextText=``,n.value=`搜索一下`,n.dispatchEvent(new Event(`input`)),U(),F.enableSelectionQuery=!1,setTimeout(()=>{F.enableSelectionQuery=r},1500)}function Je(e){let t=document.getElementById(`userInput`);!t||!e||(t.value=e,t.dispatchEvent(new Event(`input`)),t.focus())}function Ye(e,t=``){let n=document.getElementById(`userInput`);!n||!e||F.isGenerating||(t&&(F.enableSelectionQuery=!0,F.selectedContextText=t,F.quotedContextText=``),n.value=e,n.dispatchEvent(new Event(`input`)),n.focus(),U(),t&&(F.enableSelectionQuery=!1,setTimeout(()=>{F.enableSelectionQuery=!0},1500)))}function W(e,t,n=!0){let r=document.getElementById(`chatContainer`),i=document.createElement(`div`);i.className=`user-context-bubble`,i.dataset.role=`context`,i.innerHTML=`
    <div class="context-bubble-inner">
      <div class="context-bubble-header" title="点击展开/收起">
        <span class="context-icon">${e===`quoted`?`💬`:`📌`}</span>
        <span class="context-type">${e===`quoted`?`引用内容`:`选中内容`}</span>
      </div>
      <div class="context-bubble-content">${R(t)}</div>
    </div>
  `;let a=i.querySelector(`.context-bubble-header`),o=i.querySelector(`.context-bubble-content`);return a.addEventListener(`click`,e=>{e.stopPropagation(),o.classList.toggle(`expanded`)}),r.appendChild(i),n&&(r.scrollTop=r.scrollHeight),i}function G(e,t,n=!0,r=[]){let i=document.getElementById(`chatContainer`),a=document.createElement(`div`);a.className=`message ${e}`;let o=new Date().toISOString();if(a.dataset.timestamp=o,a.dataset.rawContent=t,a.dataset.executionLog=JSON.stringify(r),e===`assistant`){a.innerHTML=Ne(t);let e=document.createElement(`div`);e.className=`message-footer`;let n=document.createElement(`button`);n.className=`copy-btn`,n.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`,`<span>复制</span>`].join(``),n.addEventListener(`click`,e=>{e.stopPropagation(),st(a,n)}),e.appendChild(n);let i=document.createElement(`button`);i.className=`quote-btn`,i.innerHTML=[`<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>`,`<span>引用</span>`].join(``),i.addEventListener(`click`,e=>{e.stopPropagation(),ut(a)}),e.appendChild(i);let o=document.createElement(`div`);o.className=`export-menu-container`;let s=document.createElement(`button`);s.className=`export-trigger-btn`,s.innerHTML=`<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>`;let c=document.createElement(`div`);c.className=`export-dropdown`,c.innerHTML=[`<div class="export-dropdown-item export-docx-item">`,`<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>`,`<span>导出 Word</span>`,`</div>`,`<div class="export-dropdown-item export-pdf-item">`,`<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>`,`<span>导出 PDF</span>`,`</div>`].join(``),c.querySelector(`.export-docx-item`).addEventListener(`click`,e=>{e.stopPropagation(),ct(a,s),c.classList.remove(`show`)}),c.querySelector(`.export-pdf-item`).addEventListener(`click`,e=>{e.stopPropagation(),lt(a,s),c.classList.remove(`show`)}),s.addEventListener(`click`,e=>{e.stopPropagation(),document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==c&&e.classList.remove(`show`)}),c.classList.toggle(`show`)});let l=null;o.addEventListener(`mouseenter`,()=>{l=setTimeout(()=>{document.querySelectorAll(`.export-dropdown.show`).forEach(e=>{e!==c&&e.classList.remove(`show`)}),c.classList.add(`show`)},300)}),o.addEventListener(`mouseleave`,()=>{l&&=(clearTimeout(l),null),setTimeout(()=>{!o.matches(`:hover`)&&!c.matches(`:hover`)&&c.classList.remove(`show`)},100)}),o.appendChild(s),o.appendChild(c),e.appendChild(o),r&&r.length>0&&chrome.storage.local.get(`enableExecutionLog`,t=>{if(t.enableExecutionLog){let t=document.createElement(`button`);t.className=`execution-log-btn`,t.title=`执行日志`,t.innerHTML=[`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">`,`<circle cx="12" cy="12" r="10"></circle>`,`<polyline points="12 6 12 12 16 14"></polyline>`,`</svg>`].join(``),t.addEventListener(`click`,e=>{e.stopPropagation(),it(r)}),e.appendChild(t)}}),a.appendChild(e)}else{let e=t.match(/^\[引用内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),n=t.match(/^\[选中内容\]\n([\s\S]+?)\n\n\[用户问题\]\n([\s\S]*)$/),r=e||n;if(r){let t=e?`quoted`:`selected`,n=r[1].trim(),i=r[2].trim();a._pendingContext={type:t,contextText:n,userQuestion:i},a.textContent=i}else a.textContent=t;let i=document.createElement(`div`);i.className=`message-toolbar`;let o=document.createElement(`button`);o.className=`message-toolbar-btn copy-btn`,o.title=`复制内容`,o.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>`,`</svg>`].join(``),o.addEventListener(`click`,e=>{e.stopPropagation(),at(a,o)});let s=document.createElement(`button`);s.className=`message-toolbar-btn edit-btn`,s.title=`编辑后重新发送`,s.innerHTML=[`<svg viewBox="0 0 16 16" fill="currentColor">`,`<path d="M12.146.146a.5.5 0 0 1 .708 0l2.5 2.5a.5.5 0 0 1 0 .708l-10 10a.5.5 0 0 1-.168.11l-5 2a.5.5 0 0 1-.65-.65l2-5a.5.5 0 0 1 .11-.168l10-10zM11.207 2.5 13.5 4.793 14.793 3.5 12.5 1.207 11.207 2.5zm1.586 3L10.5 3.207 4 9.707V10h.5a.5.5 0 0 1 .5.5v.5h.5a.5.5 0 0 1 .5.5v.5h.293l6.5-6.5zm-9.761 5.175-.106.106-1.528 3.821 3.821-1.528.106-.106A.5.5 0 0 1 5 12h.5a.5.5 0 0 1 .5.5v.5a.5.5 0 0 1-.5.5h-.5a.5.5 0 0 1-.468-.325z"/>`,`</svg>`].join(``),s.addEventListener(`click`,e=>{e.stopPropagation(),ot(a)}),i.appendChild(o),i.appendChild(s),a.appendChild(i)}if(i.appendChild(a),a._pendingContext){let{type:e,contextText:t}=a._pendingContext,n=W(e,t,!1);i.insertBefore(n,a),delete a._pendingContext}if(n){let e=i.querySelectorAll(`.message.user`);if(e.length>0){let t=e[e.length-1],n=t.previousElementSibling;n&&n.classList.contains(`user-context-bubble`)?n.scrollIntoView({behavior:`smooth`,block:`start`}):t.scrollIntoView({behavior:`smooth`,block:`start`})}}return e===`assistant`&&ze(),a}function Xe(e){console.log(`[SidePanel] renderExecutionTimeline 被调用，日志数量:`,e.length),e.forEach((e,t)=>{console.log(`[SidePanel] 日志条目 ${t}:`,e.nodeType,e.nodeName,e.status)});let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)),n=``,r=null;return t.forEach((e,t)=>{let i=e.nodeType===`subtask`,a=e.nodeType===`tool_exec`,o=e.nodeType===`api_call`;e.nodeType,i&&(r=e.subtaskIndex);let s=``,c=``;i?(s=`subtask-level`,c=`🔀`):a&&r!==null?(s=`tool-level`,c=`🔧`):o&&r!==null&&(s=`api-level`,c=`📡`);let l=`○`,u=e.status||`processing`;e.status===`success`?l=`✓`:e.status===`failed`&&(l=`✗`);let d=R(e.nodeName||`未知节点`);if(e.subtaskIndex!==null&&e.subtaskIndex>=0&&(d=`<span class="subtask-badge">${e.subtaskIndex+1}</span> ${d}`),e.subtaskCount&&(d+=` <span class="plan-badge">(${e.subtaskCount}个子任务)</span>`),o&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(d+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}n+=`
      <div class="realtime-timeline-item ${s}" data-status="${e.status||`processing`}" data-node-type="${e.nodeType||``}">
        <div class="realtime-timeline-dot ${u}">${l}</div>
        <div class="realtime-timeline-content">
          <span class="realtime-node-name">${c} ${d}</span>
          <span class="realtime-duration">${z(e.duration||0)}</span>
          ${e.error?`<span class="realtime-error">${R(e.error)}</span>`:``}
        </div>
      </div>
    `}),n}function Ze(e){let t=[...e].sort((e,t)=>new Date(e.timestamp)-new Date(t.timestamp)),n=``,r=null;return t.forEach((e,i)=>{let a=e.nodeType===`subtask`,o=e.nodeType===`tool_exec`,s=e.nodeType===`api_call`,c=e.nodeType===`preselect`,l=o&&e.action?.name===`plan_task`;a&&(r=e.subtaskIndex);let u=``,d=``;c?d=`📡`:l?(u=`plan-task-level`,d=`📋`):a?(u=`subtask-level`,d=`🔀`):o&&r!==null?(u=`tool-level`,d=`🔧`):s&&r!==null?(u=`api-level`,d=`📡`):o?d=`⚡`:s&&(d=`📡`);let f=`○`,p=e.status||`processing`;e.status===`success`?f=`✓`:e.status===`failed`&&(f=`✗`);let m=R(e.nodeName||`未知节点`);if(e.subtaskId&&(m=`<span class="subtask-badge">${r===null?``:r+1}</span> ${m}`),e.subtaskCount&&(m+=` <span class="plan-badge">(${e.subtaskCount}个子任务, ${e.strategy===`sequential`?`顺序执行`:`并行执行`})</span>`),s&&e.apiRequest){let t=[];e.apiRequest.messageCount!==void 0&&e.apiRequest.messageCount!==null&&t.push(`💬<span title="本次模型API调用携带的消息数">${e.apiRequest.messageCount}条</span>`),e.apiRequest.toolCount!==void 0&&e.apiRequest.toolCount!==null&&t.push(`🔧<span title="本次模型API调用携带的工具定义数">${e.apiRequest.toolCount}个</span>`),t.length>0&&(m+=` <span class="api-info-badge">（${t.join(` `)}）</span>`)}n+=`
      <div class="timeline-item ${u}">
        <div class="timeline-line"></div>
        <div class="timeline-dot ${p}">
          ${f}
        </div>
        <div class="timeline-content">
          <div class="timeline-header">
            <span class="expand-icon">▼</span>
            <span class="node-icon">${d}</span>
            <span class="iteration-badge">[${i+1}/${t.length}]</span>
            <span class="node-name" title="${R(e.nodeName||`未知节点`)}">${m}</span>
            <span class="duration-badge" title="耗时">${z(e.duration)}</span>
          </div>
          
          <div class="timeline-details">
            ${e.thought&&e.thought.trim()?`
            <div class="timeline-section">
              <div class="section-title">💡 思考</div>
              <div class="section-content">${R(e.thought)}</div>
            </div>
            `:``}
            
            ${e.action?`
            <div class="timeline-section">
              <div class="section-title">⚡ 工具调用</div>
              <div class="section-content">
                <strong>工具:</strong> ${R(e.action.name)}<br>
                <strong>参数:</strong> <code>${R(JSON.stringify(e.action.params,null,2))}</code>
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
              </div>
            </div>
            `:``}
            
            ${e.apiResponse?`
            <div class="timeline-section">
              <div class="section-title">📤 API 响应</div>
              <div class="section-content">
                ${e.apiResponse.finishReason?`<strong>完成原因:</strong> ${R(e.apiResponse.finishReason)}<br>`:``}
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
          </div>
        </div>
      </div>
    `}),n}function Qe(e){let t=document.querySelector(`.realtime-execution-log-panel`);if(!t)return;console.log(`[SidePanel] updateRealtimeExecutionLogPanel 被调用，状态:`,e.nodeName,`日志数量:`,e.executionLog?.length);let n=t.querySelector(`.realtime-execution-value`);n&&(n.textContent=e.nodeName||`处理中...`);let r=e.executionLog||[],i=r.length,a=r.filter(e=>e.status===`success`).length,o=r.filter(e=>e.status===`failed`).length,s=r.filter(e=>e.nodeType===`subtask`).length,c=r.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length,l=t.querySelector(`.realtime-stat-total`),u=t.querySelector(`.realtime-stat-success`),d=t.querySelector(`.realtime-stat-failed`),f=t.querySelector(`.realtime-stat-subtask`);l&&(l.querySelector(`.stat-count-mini`).textContent=i),u&&(u.querySelector(`.stat-count-mini`).textContent=a),d&&(d.querySelector(`.stat-count-mini`).textContent=o),f&&(s>0?(f.style.display=`flex`,f.querySelector(`.stat-count-mini`).textContent=`${c}/${s}`):f.style.display=`none`);let p=t.querySelector(`.realtime-log-timeline`);p.innerHTML=r.length>0?Xe(r):`<div class="realtime-waiting-message">等待执行中...</div>`;let m=t.querySelector(`.realtime-log-timeline-wrapper`);m&&(m.scrollTop=m.scrollHeight)}function $e(e){let t=document.createElement(`div`);t.className=`realtime-execution-log-panel`,t.innerHTML=`
    <div class="realtime-log-container">
      <div class="realtime-log-header">
        <div class="realtime-log-title">
          <svg viewBox="0 0 1024 1024">
            <path d="M512 5.12C230.4 5.12 5.12 230.4 5.12 512s225.28 506.88 506.88 506.88 506.88-225.28 506.88-506.88S793.6 5.12 512 5.12z m0 92.16c107.52 0 215.04 46.08 291.84 122.88s122.88 184.32 122.88 291.84-46.08 215.04-122.88 291.84-184.32 122.88-291.84 122.88-215.04-46.08-291.84-122.88-122.88-184.32-122.88-291.84 46.08-215.04 122.88-291.84S404.48 97.28 512 97.28zM430.08 327.68h-5.12c-5.12 0-5.12 5.12-5.12 5.12v353.28l5.12 5.12h20.48l250.88-168.96s5.12 0 5.12-5.12V512v-5.12s0-5.12-5.12-5.12l-256-168.96c-5.12 0-5.12 0-10.24-5.12z" fill="#707070"></path>
          </svg>
          <h3>实时执行日志</h3>
        </div>
        <div class="realtime-log-close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </div>
      </div>
      <div class="realtime-log-content">
        <div class="realtime-header-bar">
          <div class="realtime-current-execution">
            <span class="realtime-execution-label">当前执行:</span>
            <span class="realtime-execution-value">准备中...</span>
          </div>
          <div class="realtime-stat-summary-inline">
            <span class="realtime-stat-item-mini realtime-stat-total">
              <span class="stat-icon">◉</span>
              <span class="stat-text-mini">总节点</span>
              <span class="stat-count-mini">0</span>
            </span>
            <span class="realtime-stat-item-mini realtime-stat-success" data-status="success">
              <span class="stat-icon">✓</span>
              <span class="stat-text-mini">成功</span>
              <span class="stat-count-mini">0</span>
            </span>
            <span>|</span>
            <span class="realtime-stat-item-mini realtime-stat-failed" data-status="failed">
              <span class="stat-icon">✗</span>
              <span class="stat-text-mini">失败</span>
              <span class="stat-count-mini">0</span>
            </span>
            <span class="realtime-stat-item-mini realtime-stat-subtask" data-status="subtask" style="display:none">
              <span class="stat-icon">🔀</span>
              <span class="stat-text-mini">子任务</span>
              <span class="stat-count-mini">0/0</span>
            </span>
          </div>
        </div>
        <div class="realtime-log-timeline-wrapper">
          <div class="realtime-log-timeline">
            <div class="realtime-waiting-message">等待执行中...</div>
          </div>
        </div>
      </div>
    </div>
  `,document.body.appendChild(t),t.querySelector(`.realtime-log-close`).addEventListener(`click`,()=>{t.remove()}),t.addEventListener(`click`,e=>{e.target===t&&t.remove()}),t.addEventListener(`click`,e=>{let n=e.target.closest(`.realtime-stat-item-mini[data-status]`);if(n){let e=n.dataset.status,r=n.classList.contains(`active`);t.querySelectorAll(`.realtime-stat-item-mini[data-status]`).forEach(e=>{e.classList.remove(`active`)}),r?t.querySelectorAll(`.realtime-timeline-item`).forEach(e=>{e.style.display=``}):(n.classList.add(`active`),t.querySelectorAll(`.realtime-timeline-item`).forEach(t=>{e===`subtask`?t.dataset.nodeType===`subtask`?t.style.display=``:t.style.display=`none`:t.dataset.status===e?t.style.display=``:t.style.display=`none`}))}}),F.currentExecutionStatus&&Qe(F.currentExecutionStatus)}function et(e){let t=document.querySelector(`.realtime-execution-log-panel`);if(t){t.remove();return}$e(e)}function tt(e,t,n,r){let i=document.getElementById(e);if(!i)return;console.log(`[SidePanel] updateExecutionStatus 被调用:`,t,n,`日志数量:`,r?.length);let a=i.querySelector(`.current-node-name`);a&&(a.textContent=t||`处理中...`,a.title=t||``),F.currentExecutionStatus?(F.currentExecutionStatus.executionLog||(F.currentExecutionStatus.executionLog=[]),r&&r.length>0&&r.forEach(e=>{let t=F.currentExecutionStatus.executionLog.findIndex(t=>t.id===e.id);if(t!==-1){let n=F.currentExecutionStatus.executionLog[t];F.currentExecutionStatus.executionLog[t]={...e,subtaskIndex:e.subtaskIndex??n.subtaskIndex,subtaskId:e.subtaskId??n.subtaskId,subtaskName:e.subtaskName??n.subtaskName}}else F.currentExecutionStatus.executionLog.push(e)}),F.currentExecutionStatus.nodeName=t,F.currentExecutionStatus.status=n):F.currentExecutionStatus={nodeName:t,status:n,executionLog:[]},document.querySelector(`.realtime-execution-log-panel`)&&Qe(F.currentExecutionStatus)}function nt(){let e=document.getElementById(`chatContainer`),t=`loading-`+Date.now(),n=document.createElement(`div`);n.className=`loading-message`,n.id=t,n.innerHTML=`
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
  `,e.appendChild(n),e.scrollTop=e.scrollHeight;let r=n.querySelector(`.stop-task-btn`),i=n.querySelector(`.loading-text`);r&&r.addEventListener(`click`,e=>{e.stopPropagation(),r.disabled=!0,r.style.opacity=`0.6`,r.style.cursor=`not-allowed`,i&&(i.textContent=`停止中...`),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:null})}),F.executionLogListener=(e,n,r)=>e.type===`EXECUTION_STATUS_UPDATE`?(console.log(`[SidePanel] 收到执行状态更新:`,e.nodeName,e.status,`日志数量:`,e.executionLog?.length),tt(t,e.nodeName,e.status,e.executionLog),!1):!1,chrome.runtime.onMessage.addListener(F.executionLogListener),chrome.storage.local.get(`enableExecutionLog`,e=>{if(e.enableExecutionLog){let e=n.querySelector(`.execution-status-container`);e&&(e.style.display=`flex`)}});let a=n.querySelector(`.execution-log-toggle-btn`);return a&&a.addEventListener(`click`,e=>{e.stopPropagation(),et(t)}),t}function K(e){let t=document.getElementById(e);if(t){let e=t.querySelector(`.loading-text`);e&&(e.textContent=`思考中...`),t.remove()}F.executionLogListener&&=(chrome.runtime.onMessage.removeListener(F.executionLogListener),null),F.currentExecutionStatus=null;let n=document.querySelector(`.realtime-execution-log-panel`);n&&n.remove()}async function rt(e,t,n=!1,r={}){let i=(await ue()).loopTimeout;return new Promise((a,o)=>{let s=[],c=Math.round(i/1e3),l=setTimeout(()=>{g(),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:F.currentTabId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)}),o({message:`请求超时（${c}秒）`,executionLog:s})},i),u=Date.now(),d=0,f=null,p=()=>{f===null&&l!==null&&(f=Date.now(),clearTimeout(l),l=null,console.log(`[SidePanel] 前端超时已暂停（澄清工具执行中）`))},m=()=>{if(f!==null){let e=Date.now()-f;d+=e,f=null;let t=Date.now()-u,n=i+d-t;if(n<=0){g(),o({message:`请求超时（${c}秒）`,executionLog:s});return}l=setTimeout(()=>{g(),chrome.runtime.sendMessage({type:`CANCEL_REACT`,tabId:F.currentTabId}).catch(e=>{console.log(`[SidePanel] 发送取消请求失败:`,e.message)}),o({message:`请求超时（${c}秒）`,executionLog:s})},n),console.log(`[SidePanel] 前端超时已恢复，暂停时长:`,Math.round(e/1e3),`s，剩余时间:`,Math.round(n/1e3),`s`)}},h=e=>(console.log(`[SidePanel] 收到消息:`,e),e.type===`EXECUTION_STATUS_UPDATE`?(s=e.executionLog||[],!1):e.type===`CLARIFY_START`?(p(),!1):e.type===`CLARIFY_END`?(m(),!1):e.type===`API_COMPLETE`?(l&&clearTimeout(l),chrome.runtime.onMessage.removeListener(h),a({content:e.content,executionLog:e.executionLog||s}),!1):e.type===`API_ERROR`?(l&&clearTimeout(l),chrome.runtime.onMessage.removeListener(h),o({message:e.error,executionLog:e.executionLog||s}),!1):!1);chrome.runtime.onMessage.addListener(h);let g=()=>{chrome.runtime.onMessage.removeListener(h)};console.log(`[SidePanel] 发送 CALL_API 消息，useTools:`,n,`tabId:`,F.currentTabId,`apiParams:`,r,`timeout:`,i),chrome.runtime.sendMessage({type:`CALL_API`,messages:e,model:t,useTools:n,tabId:F.currentTabId,apiParams:r})})}function it(e){let t=document.querySelector(`.execution-log-panel`);t&&t.remove();let n=document.createElement(`div`);n.className=`execution-log-panel`;let r=e.reduce((e,t)=>e+(t.duration||0),0),i=e.filter(e=>e.status===`success`).length,a=e.filter(e=>e.status===`failed`).length,o=e.filter(e=>e.nodeType===`subtask`).length,s=e.filter(e=>e.nodeType===`subtask`&&e.status===`success`).length;n.innerHTML=`
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
        <div class="summary-item" title="总耗时: ${z(r)}">
          <svg class="summary-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span class="summary-label">总耗时</span>
          <span class="summary-value">${z(r)}</span>
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
        ${Ze(e)}
      </div>
    </div>
  `,document.body.appendChild(n),n.addEventListener(`click`,e=>{e.target===n&&n.remove()}),n.querySelector(`.log-close`).addEventListener(`click`,()=>{n.remove()});let c=n.querySelector(`.toggle-expand-btn`),l=n.querySelectorAll(`.timeline-content`),u=!1;c.addEventListener(`click`,()=>{u=!u,l.forEach(e=>{u?e.classList.add(`expanded`):e.classList.remove(`expanded`)});let e=c.querySelector(`svg`);u?(e.innerHTML=`<polyline points="17 11 12 6 7 11"></polyline><polyline points="17 18 12 13 7 18"></polyline>`,c.setAttribute(`title`,`收起全部节点`)):(e.innerHTML=`<polyline points="7 13 12 18 17 13"></polyline><polyline points="7 6 12 11 17 6"></polyline>`,c.setAttribute(`title`,`展开全部节点`))}),n.querySelectorAll(`.timeline-header`).forEach(e=>{e.addEventListener(`click`,()=>{e.parentElement.classList.toggle(`expanded`)})});let d=n.querySelectorAll(`.combo-stat`),f=n.querySelectorAll(`.timeline-item`);d.forEach(e=>{e.addEventListener(`click`,()=>{let t=e.dataset.status,n=e.classList.contains(`active`);d.forEach(e=>e.classList.remove(`active`)),n?f.forEach(e=>{e.style.display=``}):(e.classList.add(`active`),f.forEach(e=>{if(t===`subtask`)e.classList.contains(`subtask-level`)?e.style.display=``:e.style.display=`none`;else{let n=e.querySelector(`.timeline-dot`);n&&n.classList.contains(t)?e.style.display=``:e.style.display=`none`}}))})})}function at(e,t){try{let n=e.dataset.rawContent||``;navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{console.error(`[SidePanel] 复制失败:`,e);let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{L(`复制失败`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),L(`复制失败`,`error`)}}function ot(e){try{let t=e.dataset.rawContent||``;if(!t){L(`无法获取消息内容`,`error`);return}let n=document.getElementById(`userInput`);n.value=t,re(),n.focus(),n.selectionStart=n.selectionEnd=n.value.length,console.log(`[SidePanel] 已加载消息内容到输入框，等待用户编辑后发送`)}catch(e){console.error(`[SidePanel] 编辑消息失败:`,e),L(`编辑失败: `+e.message,`error`)}}function st(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=F.messageHistory.find(e=>e.role===`assistant`);if(t)n=t.content;else{let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}}navigator.clipboard.writeText(n).then(()=>{let e=t.innerHTML;t.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已复制</span>
      `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}).catch(e=>{let r=document.createElement(`textarea`);r.value=n,r.style.position=`fixed`,r.style.left=`-999999px`,document.body.appendChild(r),r.select();try{document.execCommand(`copy`);let e=t.innerHTML;t.innerHTML=`
          <svg viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
          </svg>
          <span>已复制</span>
        `,t.classList.add(`copied`),setTimeout(()=>{t.innerHTML=e,t.classList.remove(`copied`)},2e3)}catch{L(`复制失败，请手动选择内容复制`,`error`)}document.body.removeChild(r)})}catch(e){console.error(`[SidePanel] 复制失败:`,e),L(`复制失败`,`error`)}}function ct(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${Oe(n)}
      </body>
      </html>
    `,i=new Blob([`﻿`,r],{type:`application/msword`}),a=URL.createObjectURL(i),o=document.createElement(`a`);o.href=a,o.download=`word-${new Date().getTime()}.doc`,document.body.appendChild(o),o.click(),document.body.removeChild(o),URL.revokeObjectURL(a);let s=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已导出</span>
    `,setTimeout(()=>{t.innerHTML=s},2e3),console.log(`[SidePanel] Word 文档导出成功`)}catch(e){console.error(`[SidePanel] 导出 Word 失败:`,e),L(`导出失败: `+e.message,`error`)}}function lt(e,t){try{let n=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!n){let t=e.querySelector(`.markdown-body`);n=t?t.innerText:e.innerText}let r=`
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
        ${Oe(n)}
        <div class="footer">${`AI Helper - ${new Date().toLocaleString(`zh-CN`)}`}</div>
      </body>
      </html>
    `,i=window.open(``,`_blank`,`width=800,height=600`);if(!i){L(`请允许弹出窗口以使用 PDF 导出功能`,`warning`);return}i.document.write(r),i.document.close(),i.onload=function(){setTimeout(()=>{i.focus(),i.print()},500)};let a=t.innerHTML;t.innerHTML=`
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
      </svg>
      <span>已触发</span>
    `,setTimeout(()=>{t.innerHTML=a},2e3),console.log(`[SidePanel] PDF 导出已触发`)}catch(e){console.error(`[SidePanel] 导出 PDF 失败:`,e),L(`导出失败: `+e.message,`error`)}}function ut(e){try{let t=e.dataset.rawMarkdown||e.dataset.rawContent||``;if(!t){console.warn(`[SidePanel] 无法获取消息内容`);return}let n=document.getElementById(`userInput`);if(!n){console.warn(`[SidePanel] 找不到输入框`);return}let r=e.querySelector(`.quote-btn`),i=r?r.innerHTML:``;Ve(t),r&&(r.innerHTML=`
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/>
        </svg>
        <span>已引用</span>
      `,r.classList.add(`quoted`),setTimeout(()=>{r.innerHTML=i,r.classList.remove(`quoted`)},2e3)),n.focus(),console.log(`[SidePanel] 已引用消息内容到提示条，输入框已获取焦点`)}catch(e){console.error(`[SidePanel] 引用提问失败:`,e),L(`引用失败: `+e.message,`error`)}}function dt(){console.log(`[SidePanel] 清除选中内容上下文`),F.selectedContextText=``,F.quotedContextText=``;let e=document.getElementById(`selectionIndicator`),t=document.getElementById(`userInput`);if(e&&(e.classList.remove(`show`),console.log(`[SidePanel] 已隐藏选中内容提示条`)),typeof window.hideFloatingMenu==`function`&&window.hideFloatingMenu(),t&&t.value.startsWith(`[选中内容]`)){let e=t.value.split(`
`),n=0;for(let t=0;t<e.length;t++)if(e[t].startsWith(`[用户问题]`)){n=t;break}n>0&&(t.value=e.slice(n).join(`
`),t.dispatchEvent(new Event(`input`)),console.log(`[SidePanel] 已移除输入框中的选中内容前缀`))}F.lastSelectedText=``,F.currentSelectionRange=null}function ft(){let e=document.getElementById(`promptManageList`).querySelectorAll(`.prompt-manage-item`);e.forEach(t=>{t.addEventListener(`dragstart`,e=>{F.draggedItemIndex=parseInt(t.dataset.index),t.classList.add(`dragging`),e.dataTransfer.effectAllowed=`move`,e.dataTransfer.setData(`text/plain`,F.draggedItemIndex)}),t.addEventListener(`dragend`,()=>{t.classList.remove(`dragging`),e.forEach(e=>e.classList.remove(`drag-over`)),F.draggedItemIndex=null}),t.addEventListener(`dragover`,e=>{e.preventDefault(),e.dataTransfer.dropEffect=`move`,t.classList.add(`drag-over`)}),t.addEventListener(`dragleave`,()=>{t.classList.remove(`drag-over`)}),t.addEventListener(`drop`,e=>{e.stopPropagation(),e.preventDefault();let n=parseInt(t.dataset.index);if(F.draggedItemIndex!==null&&F.draggedItemIndex!==n){let e=F.customPrompts[F.draggedItemIndex];F.customPrompts.splice(F.draggedItemIndex,1),F.customPrompts.splice(n,0,e),chrome.storage.local.set({customPrompts:F.customPrompts}),J()}t.classList.remove(`drag-over`)})})}function pt(){let e=document.querySelector(`.input-toolbar-right`);if(!e)return;let t=document.createElement(`button`);t.className=`prompt-manage-btn`,t.title=`提示词管理`,t.innerHTML=`<svg t="1781177976746" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5076" width="16" height="16"><path d="M674.56 231.552l101.568 56.96-56.896-101.632 56.96-101.568-101.632 56.896-101.632-56.896 56.96 101.568-56.896 101.632 101.568-56.96zM186.944 629.76l-101.504-56.896 56.832 101.632-56.832 101.568 101.504-56.96 101.632 56.96-56.896-101.568 56.896-101.568-101.568 56.832zM85.44 85.312l56.832 101.568-56.832 101.632 101.504-56.96 101.632 56.96L231.68 186.88l56.896-101.568-101.568 56.896-101.568-56.896z m351.872 438.016l-99.2-99.136L424.32 337.984l99.072 99.264-86.08 86.144m-41.856-223.04L300.352 395.392a40.448 40.448 0 0 0 0 57.28l474.24 474.112a40.448 40.448 0 0 0 57.344 0l94.912-95.04a40.448 40.448 0 0 0 0-57.344L452.736 300.288a40.448 40.448 0 0 0-57.28 0z" p-id="5077" fill="#777"></path></svg>`,t.addEventListener(`click`,()=>{xt()}),e.appendChild(t)}function mt(e=``){let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);t.style.display=`block`,n.classList.add(`show`),_t(e)}function q(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`);e.style.display=`none`,t.classList.remove(`show`),F.selectedPromptIndex=-1}function ht(){let e=document.getElementById(`promptSelector`),t=document.getElementById(`promptDropdown`),n=document.getElementById(`userInput`);e.style.display!==`none`&&t.classList.contains(`show`)?q():(mt(),n.focus())}function gt(e=``){_t(e)}function _t(e=``){let t=document.getElementById(`promptList`),n=e.toLowerCase(),r=F.customPrompts.filter(t=>e?t.code.toLowerCase().includes(n)||t.content.toLowerCase().includes(n):!0);if(r.length===0){t.innerHTML=`<div class="prompt-empty">暂无匹配的提示词</div>`,F.selectedPromptIndex=-1;return}F.selectedPromptIndex=0,t.innerHTML=r.map((e,t)=>`
    <div class="prompt-item ${t===F.selectedPromptIndex?`selected`:``}" data-index="${t}" data-code="${e.code}">
      <span class="prompt-item-content">${e.content}</span>
      <span class="prompt-item-code">/${e.code}</span>
    </div>
  `).join(``),t.querySelectorAll(`.prompt-item`).forEach(e=>{e.addEventListener(`click`,t=>{let n=e.dataset.code;t.ctrlKey||t.metaKey?yt(n):bt(n)})})}function vt(e){e.forEach((e,t)=>{t===F.selectedPromptIndex?e.classList.add(`selected`):e.classList.remove(`selected`)})}function yt(e){let t=F.customPrompts.find(t=>t.code===e);if(!t)return;let n=document.getElementById(`userInput`),r=n.value,i=r.lastIndexOf(`/`),a=r;if(i!==-1){let e=-1;for(let t=i-1;t>=0;t--)if(r[t]===`
`){e=t;break}a=e===-1?r.substring(0,i).trimEnd():r.substring(0,e+1).trimEnd()}n.value=a+(a&&!a.endsWith(`
`)?`

`:``)+t.content,n.focus(),n.selectionStart=n.selectionEnd=n.value.length,q(),re(),console.log(`[SidePanel] 已追加提示词到输入框:`,t.code,t.content)}async function bt(e){let t=F.customPrompts.find(t=>t.code===e);if(!t)return;if(F.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}q();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove();let r=t.content,i=F.enableSelectionQuery&&F.selectedContextText&&F.selectedContextText.trim(),a=F.quotedContextText&&F.quotedContextText.trim();if(a){let e=F.quotedContextText.trim();r=`[引用内容]\n${e}\n\n[用户问题]\n${t.content}`,W(`quoted`,e,!1),F.quotedContextText=``}else if(i){let e=F.selectedContextText.trim();r=`[选中内容]\n${e}\n\n[用户问题]\n${t.content}`,W(`selected`,e,!1),F.selectedContextText=``}(i||a)&&dt(),G(`user`,t.content),F.messageHistory.push({role:`user`,content:r}),H(),de(t.content);let o=document.getElementById(`userInput`);o.value=``,o.style.height=`auto`,F.isGenerating=!0;let s=document.getElementById(`sendBtn`);s.disabled=!0;let c=nt(),l=F.currentModel;try{await ce(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,F.isolateChat),console.log(`  - chatConfig:`,F.chatConfig),console.log(`  - messageHistory.length:`,F.messageHistory.length);let e=[{role:`system`,content:ae()}];if(F.isolateChat){let t=F.messageHistory;F.chatConfig.maxMemoryMessages!==null&&F.chatConfig.maxMemoryMessages!==void 0&&F.chatConfig.maxMemoryMessages>0?(t=[...F.messageHistory.slice(0,-1).slice(-F.chatConfig.maxMemoryMessages),F.messageHistory[F.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,F.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,F.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:r});let t=await oe(),n,i;try{let r=await rt(e,l,F.useTools,t);n=r.content,i=r.executionLog||[]}catch(e){throw K(c),n=`❌ 请求失败：`+(e.message||`未知错误`),i=e.executionLog||[],G(`assistant`,n,!0,i),F.messageHistory.push({role:`assistant`,content:n,executionLog:i}),H(),e}K(c),await Re(G(`assistant`,n,!0,i)),F.messageHistory.push({role:`assistant`,content:n,executionLog:i}),H()}catch{}finally{F.isGenerating=!1,s.disabled=!1,o.focus()}}function xt(){document.getElementById(`promptManageModal`).classList.add(`show`),J()}function St(){document.getElementById(`promptManageModal`).classList.remove(`show`);let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=document.getElementById(`promptManageAddBtn`);e&&(e.value=``),t&&(t.value=``),n&&(n.value=``),r&&(r.textContent=`添加提示词`,r.style.background=`#667eea`)}function J(){let e=document.getElementById(`promptManageList`);if(F.customPrompts.length===0){e.innerHTML=`<div class="prompt-empty">暂无提示词，请添加</div>`;return}e.innerHTML=F.customPrompts.map((e,t)=>`
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
  `).join(``),e.querySelectorAll(`.move-up-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n>0){let e=F.customPrompts[n];F.customPrompts[n]=F.customPrompts[n-1],F.customPrompts[n-1]=e,chrome.storage.local.set({customPrompts:F.customPrompts}),J()}})}),e.querySelectorAll(`.move-down-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);if(n<F.customPrompts.length-1){let e=F.customPrompts[n];F.customPrompts[n]=F.customPrompts[n+1],F.customPrompts[n+1]=e,chrome.storage.local.set({customPrompts:F.customPrompts}),J()}})}),e.querySelectorAll(`.menu-toggle-btn`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=parseInt(e.dataset.index);F.customPrompts[n].enabledInMenu=!F.customPrompts[n].enabledInMenu,chrome.storage.local.set({customPrompts:F.customPrompts}),J()})}),e.querySelectorAll(`.edit-btn`).forEach(e=>{e.addEventListener(`click`,()=>{Et(parseInt(e.dataset.index))})}),e.querySelectorAll(`.delete-btn`).forEach(e=>{e.addEventListener(`click`,()=>{Dt(parseInt(e.dataset.index))})}),ft()}function Ct(e){let t=document.getElementById(`promptErrorModal`),n=document.getElementById(`promptErrorMessage`);n.textContent=e,t.classList.add(`show`)}function wt(){document.getElementById(`promptErrorModal`).classList.remove(`show`)}function Tt(){let e=document.getElementById(`editPromptIndex`),t=document.getElementById(`newPromptCode`),n=document.getElementById(`newPromptContent`),r=t.value.trim(),i=n.value.trim();if(!r||!i){Ct(`请填写编码和内容`);return}let a=e?parseInt(e.value):-1,o=F.customPrompts.findIndex(e=>e.code===r);if(o!==-1&&o!==a){Ct(`编码已存在`);return}a>=0&&a<F.customPrompts.length?F.customPrompts[a]={...F.customPrompts[a],code:r,content:i}:F.customPrompts.push({code:r,content:i,enabledInMenu:!1}),chrome.storage.local.set({customPrompts:F.customPrompts}),t.value=``,n.value=``,e&&(e.value=``);let s=document.getElementById(`promptManageAddBtn`);s.textContent=`添加提示词`,s.style.background=`#667eea`,J()}function Et(e){let t=F.customPrompts[e];if(!t)return;let n=document.getElementById(`editPromptIndex`),r=document.getElementById(`newPromptCode`),i=document.getElementById(`newPromptContent`),a=document.getElementById(`promptManageAddBtn`);n&&(n.value=e),r.value=t.code,i.value=t.content,a.textContent=`保存修改`,a.style.background=`#ffa502`,r.scrollIntoView({behavior:`smooth`})}function Dt(e){let t=F.customPrompts[e];if(!t)return;F.pendingDeleteIndex=e;let n=document.getElementById(`deleteConfirmModal`),r=document.getElementById(`deleteConfirmMessage`);r.textContent=`确定要删除提示词 "/${t.code}" 吗？`,n.classList.add(`show`)}function Y(){document.getElementById(`deleteConfirmModal`).classList.remove(`show`),F.pendingDeleteIndex=-1}function Ot(e){F.customPrompts.splice(e,1),chrome.storage.local.set({customPrompts:F.customPrompts}),J()}function kt(){let e=document.getElementById(`promptManageCancelBtn`),t=document.getElementById(`promptManageAddBtn`),n=document.getElementById(`promptModalCloseBtn`);e&&e.addEventListener(`click`,St),t&&t.addEventListener(`click`,Tt),n&&n.addEventListener(`click`,St);let r=document.getElementById(`deleteCancelBtn`),i=document.getElementById(`deleteConfirmBtn`);r&&r.addEventListener(`click`,Y),i&&i.addEventListener(`click`,()=>{F.pendingDeleteIndex>=0&&Ot(F.pendingDeleteIndex),Y()});let a=document.getElementById(`deleteConfirmModal`);a&&a.addEventListener(`click`,e=>{e.target===a&&Y()});let o=document.getElementById(`promptErrorConfirmBtn`);o&&o.addEventListener(`click`,wt);let s=document.getElementById(`promptErrorModal`);s&&s.addEventListener(`click`,e=>{e.target===s&&wt()})}function At(){let e=document.getElementById(`toolsPopupOverlay`);if(!e)return;F.currentCategory=`all`,F.currentSearch=``;let t=document.getElementById(`toolsSearchInput`);t&&(t.value=``),X(),Z(),document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),Mt(),e.classList.add(`show`),console.log(`[SidePanel] 打开工具弹窗`)}function jt(){let e=document.getElementById(`toolsPopupOverlay`);e&&(document.querySelectorAll(`.category-btn`).forEach(e=>{e.classList.remove(`active`),e.style.background=``,e.style.color=``,e.style.borderColor=``}),e.classList.remove(`show`),console.log(`[SidePanel] 关闭工具弹窗`))}function Mt(){let t=document.getElementById(`toolsPopupList`);if(!t)return;t.innerHTML=``;let n={};e.forEach(e=>{if(F.currentCategory!==`all`&&e.category!==F.currentCategory)return;if(F.currentSearch){let t=e.name.toLowerCase().includes(F.currentSearch),n=e.description.toLowerCase().includes(F.currentSearch);if(!t&&!n)return}let t=e.category||`other`;n[t]||(n[t]=[]),n[t].push(e)});let r={page_interaction:`🖱️ 页面交互`,form_operation:`📝 表单操作`,info_extract:`📄 信息提取`,page_analysis:`🔍 页面分析`,tab_management:`📑 标签页管理`,bookmark_history:`🔖 书签历史`,storage_management:`💾 存储管理`,network_request:`🌐 网络请求`,media_process:`📷 媒体处理`,debug_dev:`🔧 调试开发`,ai_collaboration:`🤖 AI协作`,system_integration:`⚙️ 系统集成`};if([`page_interaction`,`form_operation`,`info_extract`,`page_analysis`,`tab_management`,`bookmark_history`,`storage_management`,`network_request`,`media_process`,`debug_dev`,`ai_collaboration`,`system_integration`].forEach(i=>{let a=n[i];if(!a||a.length===0)return;let o=e.filter(e=>e.category===i),s=o.length,c=o.filter(e=>F.enabledTools.includes(e.id)).length,l=document.createElement(`div`);l.className=`popup-tool-category-group`,l.dataset.category=i;let u=document.createElement(`div`);u.className=`popup-tool-category`,u.dataset.category=i;let d=F.collapsedCategories[i]||!1;u.innerHTML=`
      <span class="category-expand-icon">${d?`▶`:`▼`}</span>
      <span class="category-name">${r[i]||i}</span>
      <span class="category-count">${c}/${s}</span>
    `,u.addEventListener(`click`,()=>{Nt(i)}),l.appendChild(u);let f=document.createElement(`div`);f.className=`popup-tool-items ${d?`collapsed`:``}`,a.forEach(e=>{let t=F.enabledTools.includes(e.id),n=document.createElement(`div`);n.className=`popup-tool-item`,n.dataset.category=i,n.innerHTML=`
        <input type="checkbox" id="tool_${e.id}" ${t?`checked`:``}>
        <div class="popup-tool-content">
          <div class="popup-tool-name">${e.name}</div>
          <div class="popup-tool-desc">${e.description}</div>
        </div>
      `;let r=n.querySelector(`input[type="checkbox"]`);r&&r.addEventListener(`change`,t=>{if(t.stopPropagation(),t.target.checked)F.enabledTools.includes(e.id)||F.enabledTools.push(e.id);else{let t=F.enabledTools.indexOf(e.id);t>-1&&F.enabledTools.splice(t,1)}Pt(i),X(),Z()}),f.appendChild(n)}),l.appendChild(f),t.appendChild(l)}),t.children.length===0){let e=document.createElement(`div`);e.className=`popup-tool-empty`,e.textContent=`没有找到匹配的工具`,t.appendChild(e)}}function Nt(e){F.collapsedCategories[e]=!F.collapsedCategories[e];let t=document.querySelector(`.popup-tool-category-group[data-category="${e}"]`);if(!t)return;let n=t.querySelector(`.popup-tool-category`).querySelector(`.category-expand-icon`),r=t.querySelector(`.popup-tool-items`);F.collapsedCategories[e]?(n.textContent=`▶`,r.classList.add(`collapsed`)):(n.textContent=`▼`,r.classList.remove(`collapsed`))}function Pt(t){let n=document.querySelector(`.popup-tool-category[data-category="${t}"]`);if(!n)return;let r=n.querySelector(`.category-count`);if(!r)return;let i=e.filter(e=>e.category===t),a=i.length,o=0;i.forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&t.checked&&o++}),r.textContent=`${o}/${a}`}function Ft(){return e.filter(e=>{if(F.currentCategory!==`all`&&e.category!==F.currentCategory)return!1;if(F.currentSearch){let t=e.name.toLowerCase().includes(F.currentSearch.toLowerCase()),n=e.description.toLowerCase().includes(F.currentSearch.toLowerCase());if(!t&&!n)return!1}return!0})}function It(){[`page_interaction`,`form_operation`,`info_extract`,`page_analysis`,`tab_management`,`bookmark_history`,`storage_management`,`network_request`,`media_process`,`debug_dev`,`ai_collaboration`,`system_integration`].forEach(e=>{Pt(e)})}function X(){[`all`,`page_interaction`,`form_operation`,`info_extract`,`page_analysis`,`tab_management`,`bookmark_history`,`storage_management`,`network_request`,`media_process`,`debug_dev`,`ai_collaboration`,`system_integration`].forEach(t=>{let n=document.getElementById(`badge-`+t);if(!n)return;let r=0,i=0;if(t===`all`)r=e.length,i=F.enabledTools.length;else{let n=e.filter(e=>e.category===t);r=n.length,i=n.filter(e=>F.enabledTools.includes(e.id)).length}n.textContent=`${i}/${r}`})}function Z(){let t=document.getElementById(`toolsEnabledCount`);if(!t)return;let n=e.length;t.textContent=`(已启用 ${F.enabledTools.length}/${n})`}function Lt(){let t=[];e.forEach(e=>{let n=document.getElementById(`tool_`+e.id);n?n.checked&&t.push(e.id):F.enabledTools.includes(e.id)&&t.push(e.id)}),F.enabledTools=t,F.useTools=F.enabledTools.length>0,chrome.storage.local.set({enabledTools:F.enabledTools},()=>{console.log(`[SidePanel] 工具配置已保存:`,F.enabledTools)}),Rt(),L(F.useTools?`已启用 ${F.enabledTools.length} 个工具`:`工具已全部禁用`,`success`)}function Rt(){let e=document.getElementById(`toolsToggleBtn`),t=document.getElementById(`toolsBadge`);e&&(F.useTools&&F.enabledTools.length>0?(e.classList.add(`active`),e.title=`工具 (${F.enabledTools.length}个启用)`):(e.classList.remove(`active`),e.title=`工具 (未启用)`)),t&&(F.enabledTools.length>0?(t.textContent=F.enabledTools.length,t.style.display=`inline`):t.style.display=`none`)}chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.chatMaxMemoryMessages&&(F.chatConfig.maxMemoryMessages=e.chatMaxMemoryMessages.newValue,Q(),console.log(`[SidePanel] 记忆限制配置已更新:`,F.chatConfig.maxMemoryMessages))});function Q(){let e=document.getElementById(`memoryLimitLabel`);e&&(F.chatConfig.maxMemoryMessages!==null&&F.chatConfig.maxMemoryMessages!==void 0&&F.chatConfig.maxMemoryMessages>0?e.textContent=`(${F.chatConfig.maxMemoryMessages})`:e.textContent=`(全)`,e.style.display=`inline`,e.style.cursor=`pointer`,e.title=`点击设置记忆历史限制条数`)}function zt(e){e.preventDefault(),e.stopPropagation();let t=document.getElementById(`memoryLimitDropdown`);if(t.classList.toggle(`show`),t.classList.contains(`show`)){let e=F.chatConfig.maxMemoryMessages;t.querySelectorAll(`.memory-limit-option`).forEach(t=>{t.classList.remove(`selected`);let n=parseInt(t.dataset.value);(e===null&&n===0||e!==null&&e>0&&n===e)&&t.classList.add(`selected`)});let n=t.querySelector(`#memoryLimitInput`);e!==null&&e>0?n.value=e:n.value=``}}function Bt(){let e=document.getElementById(`memoryLimitDropdown`),t=document.getElementById(`memoryLimitLabel`),n=e?.querySelector(`#memoryLimitInput`);if(!e||!t)return;Q(),t.addEventListener(`click`,zt);let r=e.querySelectorAll(`.memory-limit-option`);r.forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let i=parseInt(e.dataset.value),a=i===0?null:i;r.forEach(e=>e.classList.remove(`selected`)),e.classList.add(`selected`),n&&(n.value=i===0?``:i),chrome.storage.local.set({chatMaxMemoryMessages:a},()=>{F.chatConfig.maxMemoryMessages=a,Q(),L(`✅ 配置已更新`,`success`)})})}),n&&(n.addEventListener(`click`,e=>e.stopPropagation()),n.addEventListener(`mousedown`,e=>e.stopPropagation()),n.addEventListener(`change`,e=>{e.stopPropagation();let t=e.target.value.trim(),n=t&&parseInt(t)>0?parseInt(t):null;r.forEach(e=>e.classList.remove(`selected`)),chrome.storage.local.set({chatMaxMemoryMessages:n},()=>{F.chatConfig.maxMemoryMessages=n,Q(),L(`✅ 配置已更新`,`success`)})})),document.addEventListener(`click`,n=>{!e.contains(n.target)&&n.target!==t&&e.classList.remove(`show`)})}function $(e){document.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?(t.classList.add(`selected`),t.querySelector(`.model-option-check`).textContent=`✓`):(t.classList.remove(`selected`),t.querySelector(`.model-option-check`).textContent=``)})}function Vt(e,t){let n=document.getElementById(`tempDropdown`);if(!n||!e){typeof t==`function`&&t();return}let r=[`deepseek-v4-pro`,`deepseek-v4-flash`];e.forEach(e=>{if(r.includes(e)||n.querySelector(`.model-option[data-value="${e}"]`))return;let t=document.createElement(`div`);t.className=`model-option`,t.dataset.value=e,t.innerHTML=`<span class="model-option-check"></span>${e}`,t.addEventListener(`click`,t=>{t.stopPropagation(),F.currentModel=e,$(e),chrome.storage.local.set({modelName:e})}),n.querySelector(`.model-section`).appendChild(t)}),typeof t==`function`&&t()}function Ht(e,t=`📌 已选中`){if(!F.enableSelectionQuery)return;F.quotedContextText=``,F.selectedContextText=e;let n=document.getElementById(`selectionIndicator`),r=document.getElementById(`selectionText`),i=document.getElementById(`userInput`);if(n&&r&&i){let i;i=e.length>100?e.substring(0,100)+`...`:e.length>50?e.substring(0,50)+`...`:e,r.textContent=`${t}: ${i}`,n.classList.add(`show`)}}function Ut(e){let t=document.createElement(`span`);t.className=`selection-highlight`,t.id=`temp-selection-highlight`;try{return e.surroundContents(t),t}catch{return console.log(`[SidePanel] 无法直接高亮，使用其他方式`),null}}function Wt(){if(F.selectedHighlightElement){try{let e=F.selectedHighlightElement.parentNode;if(e&&e.insertBefore&&e.removeChild){for(;F.selectedHighlightElement.firstChild;)e.insertBefore(F.selectedHighlightElement.firstChild,F.selectedHighlightElement);e.removeChild(F.selectedHighlightElement),typeof e.normalize==`function`&&e.normalize()}}catch(e){console.log(`[SidePanel] 移除高亮失败:`,e)}F.selectedHighlightElement=null}}function Gt(e,t,n=0,r=0){if(!F.enableSelectionQuery)return;let i=document.getElementById(`selectionFloatingMenu`),a=document.getElementById(`selectionMenuItems`);if(!i||!a)return;let o=F.customPrompts.filter(e=>e.enabledInMenu===!0);if(o.length===0)return;a.innerHTML=``,o.forEach(e=>{let n=e.content.length>10?e.content.substring(0,10)+`...`:e.content,r=document.createElement(`div`);r.className=`menu-item`,r.innerHTML=`
      <span>${n}</span>
      <span class="menu-item-code">/${e.code}</span>
    `,r.addEventListener(`click`,n=>{n.stopPropagation(),Kt(e,t)}),a.appendChild(r)});let s=document.body.getBoundingClientRect(),c=40+o.length*36,l=r-s.top-c-10,u=n-s.left-20;l<s.top+10&&(l=r-s.top+15),u<s.left+10&&(u=n-s.left+20),u+180>s.right-10&&(u=n-s.left-180-10,u<s.left+10&&(u=n-s.left+20)),l+c>s.bottom-10&&(l=r-s.top-c-10,l<s.top+10&&(l=r-s.top+15)),i.style.top=l+`px`,i.style.left=u+`px`,i.style.maxHeight=s.bottom-l-20+`px`,i.classList.add(`show`)}window.hideFloatingMenu=function(){let e=document.getElementById(`selectionFloatingMenu`);e&&e.classList.remove(`show`),Wt()};async function Kt(e,t){if(!F.enableSelectionQuery)return;if(window.hideFloatingMenu(),F.isGenerating){console.log(`[SidePanel] 正在生成中，请稍候...`);return}F.selectedContextText=t,V();let n=document.getElementById(`chatContainer`).querySelector(`.welcome-message`);n&&n.remove(),W(`selected`,t,!1);let r=`[选中内容]\n${t}\n\n[用户问题]\n${e.content}`;G(`user`,e.content),F.messageHistory.push({role:`user`,content:r}),H(),de(e.content),F.isGenerating=!0;let i=document.getElementById(`sendBtn`);i.disabled=!0;let a=nt(),o=F.currentModel;try{await ce(),console.log(`[SidePanel] 发送消息调试信息:`),console.log(`  - isolateChat:`,F.isolateChat),console.log(`  - chatConfig:`,F.chatConfig),console.log(`  - messageHistory.length:`,F.messageHistory.length);let e=[{role:`system`,content:ae()}];if(F.isolateChat){let t=F.messageHistory;F.chatConfig.maxMemoryMessages!==null&&F.chatConfig.maxMemoryMessages!==void 0&&F.chatConfig.maxMemoryMessages>0?(t=[...F.messageHistory.slice(0,-1).slice(-F.chatConfig.maxMemoryMessages),F.messageHistory[F.messageHistory.length-1]],console.log(`[SidePanel] 记忆历史限制生效:`,F.chatConfig.maxMemoryMessages,`条（不含当前消息），实际发送:`,t.length,`条`)):console.log(`[SidePanel] 记忆历史限制未生效:`,F.chatConfig.maxMemoryMessages),e=[...e,...t]}else e.push({role:`user`,content:r});let t=await oe(),n,i;try{let r=await rt(e,o,F.useTools,t);n=r.content,i=r.executionLog||[]}catch(e){throw K(a),n=`❌ 请求失败：`+(e.message||`未知错误`),i=e.executionLog||[],G(`assistant`,n,!0,i),F.messageHistory.push({role:`assistant`,content:n,executionLog:i}),H(),e}K(a),await Re(G(`assistant`,n,!0,i)),F.messageHistory.push({role:`assistant`,content:n,executionLog:i}),H()}catch{}finally{F.isGenerating=!1,i.disabled=!1,document.getElementById(`userInput`).focus()}}document.addEventListener(`DOMContentLoaded`,async()=>{window.__tableBlocks=[],await le(),chrome.runtime.onMessage.addListener(e=>{e.type===`SELECTION_AI_SEARCH`&&e.prompt&&(console.log(`[SidePanel] 收到选中文本 AI 搜索:`,e.selectedText?.substring(0,50)),qe(e.prompt,e.selectedText),chrome.storage.session.remove(`pendingSelectionSearch`).catch(()=>{})),e.type===`FILL_SIDEPANEL_INPUT`&&e.text&&(console.log(`[SidePanel] 收到追问填充:`,e.text?.substring(0,50)),Je(e.text),chrome.storage.session.remove(`pendingFillInput`).catch(()=>{})),e.type===`DIRECT_SEND`&&e.text&&(console.log(`[SidePanel] 收到直接发送:`,e.text?.substring(0,50)),Ye(e.text,e.selectedText||``),chrome.storage.session.remove(`pendingDirectSend`).catch(()=>{}))});let t=await chrome.storage.session.get(`pendingSelectionSearch`);if(t.pendingSelectionSearch&&t.pendingSelectionSearch.selectedText){let{prompt:e,selectedText:n}=t.pendingSelectionSearch;console.log(`[SidePanel] 有待处理的选中文本搜索:`,n?.substring(0,50)),setTimeout(()=>{qe(e,n)},500),await chrome.storage.session.remove(`pendingSelectionSearch`)}let n=await chrome.storage.session.get(`pendingFillInput`);if(n.pendingFillInput&&n.pendingFillInput.text){let{text:e}=n.pendingFillInput;console.log(`[SidePanel] 有待填充的追问文本:`,e?.substring(0,50)),setTimeout(()=>{Je(e)},500),await chrome.storage.session.remove(`pendingFillInput`)}let r=await chrome.storage.session.get(`pendingDirectSend`);if(r.pendingDirectSend&&r.pendingDirectSend.text){let{text:e,selectedText:t}=r.pendingDirectSend;console.log(`[SidePanel] 有待直接发送的文本:`,e?.substring(0,50)),setTimeout(()=>{Ye(e,t||``)},500),await chrome.storage.session.remove(`pendingDirectSend`)}chrome.tabs.onActivated.addListener(async e=>{console.log(`[SidePanel] Tab 切换, 新 Tab ID:`,e.tabId),F.currentTabId=e.tabId}),chrome.tabs.onUpdated.addListener(async(e,t)=>{t.status===`complete`&&F.currentTabId===e&&console.log(`[SidePanel] 当前 Tab 页面更新:`,t)}),typeof marked<`u`&&(marked.setOptions({breaks:!0,gfm:!0}),console.log(`[SidePanel] Marked 库已加载`)),typeof mermaid<`u`&&(mermaid.initialize({startOnLoad:!1,theme:`default`,securityLevel:`loose`,fontFamily:`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`}),console.log(`[SidePanel] Mermaid 库已加载`));let i=document.getElementById(`userInput`),a=document.getElementById(`sendBtn`),o=document.getElementById(`clearChatBtn`),s=document.getElementById(`exportChatBtn`),c=document.getElementById(`chatContainer`),l=document.getElementById(`tempDisplay`),u=document.getElementById(`tempDropdown`),d=document.getElementById(`tempPresetList`),f=document.getElementById(`tempSlider`),p=document.getElementById(`tempNumberInput`);function m(){!i||F.isScrolling||(i.style.height=`auto`,i.style.height=Math.min(i.scrollHeight,100)+`px`)}chrome.storage.local.get([`temperature`,`topP`,`selectedTempIndex`],e=>{e.temperature!==void 0&&(F.temperature=e.temperature),e.topP!==void 0&&(F.topP=e.topP),e.selectedTempIndex!==void 0&&(F.selectedTempIndex=e.selectedTempIndex),h()});function h(){f&&(f.value=F.temperature),p&&(p.value=F.temperature.toFixed(2));let e=document.getElementById(`tempIconValue`);e&&(e.textContent=F.temperature.toFixed(2)),g()}function g(){d.innerHTML=I.map((e,t)=>`
      <div class="temp-preset-item ${t===F.selectedTempIndex?`selected`:``}" data-index="${t}">
        <div class="temp-preset-radio"></div>
        <div class="temp-preset-info">
          <div class="temp-preset-name">${e.label}</div>
          <div class="temp-preset-desc" title="${e.tip}">${e.tip}</div>
        </div>
        <div class="temp-preset-value">${e.temp.toFixed(2)}</div>
      </div>
    `).join(``),d.querySelectorAll(`.temp-preset-item`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation(),_(parseInt(e.dataset.index))})})}function _(e){let t=I[e];t&&(F.selectedTempIndex=e,F.temperature=t.temp,h(),chrome.storage.local.set({temperature:F.temperature,topP:F.topP,selectedTempIndex:F.selectedTempIndex}))}f.addEventListener(`input`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),F.temperature=t,p.value=t.toFixed(2);let n=document.getElementById(`tempIconValue`);n&&(n.textContent=t.toFixed(2));let r=0,i=Math.abs(I[0].temp-t);for(let e=1;e<I.length;e++){let n=Math.abs(I[e].temp-t);n<i&&(i=n,r=e)}F.selectedTempIndex=r,g(),chrome.storage.local.set({temperature:F.temperature,topP:F.topP,selectedTempIndex:F.selectedTempIndex})}),p.addEventListener(`change`,e=>{e.stopPropagation();let t=parseFloat(e.target.value);isNaN(t)&&(t=0),t=Math.max(0,Math.min(1,t)),F.temperature=t,f.value=t,p.value=t.toFixed(2);let n=0,r=Math.abs(I[0].temp-t);for(let e=1;e<I.length;e++){let i=Math.abs(I[e].temp-t);i<r&&(r=i,n=e)}F.selectedTempIndex=n,g(),chrome.storage.local.set({temperature:F.temperature,topP:F.topP,selectedTempIndex:F.selectedTempIndex})}),l&&u&&(l.addEventListener(`click`,e=>{e.stopPropagation(),u.classList.toggle(`show`)}),document.addEventListener(`click`,e=>{let t=document.querySelector(`.temp-selector`);t&&!t.contains(e.target)&&u.classList.remove(`show`)})),c.addEventListener(`mousedown`,e=>{F.lastMouseX=e.clientX,F.lastMouseY=e.clientY}),c.addEventListener(`mouseup`,e=>{F.lastMouseX=e.clientX,F.lastMouseY=e.clientY,F.enableSelectionQuery&&setTimeout(()=>{let e=window.getSelection();if(e&&!e.isCollapsed&&e.toString().trim()){let t=e.toString().trim();c.contains(e.anchorNode)&&t!==F.lastSelectedText&&(F.lastSelectedText=t,F.currentSelectionRange=e.getRangeAt(0).cloneRange(),F.selectedHighlightElement=Ut(F.currentSelectionRange),Ht(t),Gt(e,t,F.lastMouseX,F.lastMouseY))}else c.contains(e.anchorNode)||(F.lastSelectedText=``,F.currentSelectionRange=null,window.hideFloatingMenu())},10)});let v=``;setInterval(async()=>{try{if(!F.enableSelectionQuery)return;let e=await new Promise(e=>{chrome.tabs.query({active:!0,currentWindow:!0},t=>e(t))});if(e&&e.length>0){let t=await new Promise(t=>{chrome.tabs.sendMessage(e[0].id,{action:`getSelectedText`},e=>{chrome.runtime.lastError?(console.debug(`[SidePanel] content script 未加载或无法通信:`,chrome.runtime.lastError.message),t(null)):t(e)})});if(!t)return;let n=t?.text||``;n&&n.trim()?n!==v&&(v=n,Ht(n.trim())):v=``}}catch{}},500),chrome.storage.local.get([`modelName`,`customModels`,`customPrompts`,`systemPrompt`,`inputHistory`],e=>{let t=e.modelName;t&&(F.currentModel=t),F.customPrompts=e.customPrompts||[],F.systemPrompt=e.systemPrompt||``,F.inputHistory=e.inputHistory||[],pt(),Vt(e.customModels,()=>{t&&$(t)})}),chrome.storage.onChanged.addListener((e,t)=>{if(t===`local`){if(e.customModels){let t=e.customModels.newValue||[],n=u.querySelector(`.model-section`);n&&n.querySelectorAll(`.model-option`).forEach(e=>{let t=e.dataset.value;t!==`deepseek-v4-pro`&&t!==`deepseek-v4-flash`&&e.remove()}),Vt(t)}if(e.modelName){let t=e.modelName.newValue;t&&(F.currentModel=t,$(t))}}}),He(),document.querySelectorAll(`.model-option`).forEach(e=>{e.addEventListener(`click`,t=>{t.stopPropagation();let n=e.dataset.value;F.currentModel=n,$(n),chrome.storage.local.set({modelName:n})})}),document.addEventListener(`click`,e=>{let t=document.getElementById(`promptDropdown`),n=document.getElementById(`promptSelector`),r=document.getElementById(`selectionFloatingMenu`);if(n.contains(e.target)||(t.classList.remove(`show`),q()),r&&!r.contains(e.target)){let e=window.getSelection();(!e||e.isCollapsed||!c.contains(e.anchorNode))&&(window.hideFloatingMenu(),F.lastSelectedText=``,F.currentSelectionRange=null)}}),a.addEventListener(`click`,U);let y=document.getElementById(`promptTriggerBtn`);y&&y.addEventListener(`click`,e=>{e.stopPropagation(),y.blur(),ht()}),document.addEventListener(`keydown`,e=>{if((e.ctrlKey||e.metaKey)&&e.key===`t`){e.preventDefault();let t=document.getElementById(`toolsPopup`);t&&t.style.display!==`none`?jt():At()}}),i.addEventListener(`keydown`,e=>{let t=document.getElementById(`promptSelector`),n=document.getElementById(`promptDropdown`);if(t.style.display!==`none`&&n.classList.contains(`show`)){let t=n.querySelectorAll(`.prompt-item`),r=t.length;if(r!==0&&e.key===`ArrowDown`){e.preventDefault(),F.selectedPromptIndex<0?F.selectedPromptIndex=0:F.selectedPromptIndex=(F.selectedPromptIndex+1)%r,vt(t);return}if(e.key===`ArrowUp`){e.preventDefault(),F.selectedPromptIndex<0||F.selectedPromptIndex===0?F.selectedPromptIndex=r-1:--F.selectedPromptIndex,vt(t);return}if(e.key===`Enter`&&(e.ctrlKey||e.metaKey)&&F.selectedPromptIndex>=0){e.preventDefault();let n=t[F.selectedPromptIndex].dataset.code;yt(n);return}if(e.key===`Enter`&&F.selectedPromptIndex>=0){e.preventDefault();let n=t[F.selectedPromptIndex].dataset.code;bt(n);return}if(e.key===`Escape`){q();return}}if(e.key===`Escape`){F.inputHistoryIndex>=0&&(F.inputHistoryIndex=-1),i.value&&(i.value=``,i.style.height=`auto`,i.dispatchEvent(new Event(`input`))),e.preventDefault();return}if(!(t.style.display!==`none`&&n.classList.contains(`show`))&&!F.isGenerating){if(e.key===`ArrowUp`){e.preventDefault(),F.inputHistoryIndex===-1?F.inputHistoryIndex=F.inputHistory.length-1:F.inputHistoryIndex>0&&F.inputHistoryIndex--,F.inputHistoryIndex<0&&(F.inputHistoryIndex=0),F.inputHistoryIndex>=0&&F.inputHistory.length>0&&(i.value=F.inputHistory[F.inputHistoryIndex],i.dispatchEvent(new Event(`input`)));return}if(e.key===`ArrowDown`){e.preventDefault(),F.inputHistoryIndex>=0&&F.inputHistoryIndex<F.inputHistory.length-1?(F.inputHistoryIndex++,i.value=F.inputHistory[F.inputHistoryIndex],i.dispatchEvent(new Event(`input`))):(F.inputHistoryIndex=-1,i.value=``,i.dispatchEvent(new Event(`input`)));return}}e.key===`Enter`&&!e.shiftKey&&(e.preventDefault(),U())}),i.addEventListener(`wheel`,e=>{F.isScrolling=!0;let t=i.style.height||i.offsetHeight+`px`;i.style.height=t,i.scrollHeight<=i.clientHeight+10&&(e.preventDefault(),e.stopPropagation()),setTimeout(()=>{F.isScrolling=!1},100)},{passive:!1}),i.addEventListener(`input`,e=>{let t=i.value;document.getElementById(`promptSelector`),document.getElementById(`promptDropdown`);let n=t.lastIndexOf(`/`);if(n!==-1){let e=t.substring(n+1);n===0||t[n-1]===`
`||t[n-1]===` `?mt(e):gt(e)}else q();m()}),c.addEventListener(`scroll`,()=>{chrome.storage.local.set({scrollPosition:c.scrollTop})}),o.addEventListener(`click`,()=>{Ge()}),s&&s.addEventListener(`click`,We);let b=document.getElementById(`settingsBtn`);b&&b.addEventListener(`click`,()=>{chrome.runtime.openOptionsPage()});let x=document.getElementById(`isolateChatBtn`),S=document.getElementById(`enableToolsBtn`),ee=document.getElementById(`toolsConfigBtn`);chrome.storage.local.get([`isolateChat`,`enableSelectionQuery`,`enableTools`,`enabledTools`],t=>{t.isolateChat!==void 0&&(F.isolateChat=t.isolateChat),x.checked=F.isolateChat,t.enableSelectionQuery!==void 0&&(F.enableSelectionQuery=t.enableSelectionQuery);let n=document.getElementById(`enableSelectionQueryBtn`);n&&(n.checked=F.enableSelectionQuery),t.enableTools!==void 0&&(F.useTools=t.enableTools),t.enabledTools&&t.enabledTools.length>0?F.enabledTools=t.enabledTools:F.enabledTools=e.filter(e=>e.enabled).map(e=>e.id),F.enabledTools.length===0&&(F.useTools=!1),S&&(S.checked=F.useTools)}),x.addEventListener(`change`,()=>{F.isolateChat=x.checked,chrome.storage.local.set({isolateChat:F.isolateChat}),console.log(`[SidePanel] 记忆对话:`,F.isolateChat?`已启用`:`已禁用`)});let C=document.getElementById(`enableSelectionQueryBtn`);C&&C.addEventListener(`change`,()=>{F.enableSelectionQuery=C.checked,chrome.storage.local.set({enableSelectionQuery:F.enableSelectionQuery}),console.log(`[SidePanel] 划词问答:`,F.enableSelectionQuery?`已启用`:`已禁用`),!F.enableSelectionQuery&&F.selectedContextText&&V()}),S&&S.addEventListener(`change`,()=>{F.useTools=S.checked,chrome.storage.local.set({enableTools:F.useTools}),F.useTools&&F.enabledTools.length===0&&(F.enabledTools=e.filter(e=>e.enabled).map(e=>e.id),chrome.storage.local.set({enabledTools:F.enabledTools})),console.log(`[SidePanel] 工具总开关:`,F.useTools?`已启用`:`已禁用`)}),ee&&ee.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),At()});let w=document.getElementById(`toolsPopupOverlay`),T=document.getElementById(`toolsPopupClose`),E=w?w.querySelector(`.modal-container`):null;T&&T.addEventListener(`click`,jt),E&&E.addEventListener(`click`,e=>{e.stopPropagation()});let D=document.getElementById(`toolsSearchInput`);D&&D.addEventListener(`input`,e=>{F.currentSearch=e.target.value.toLowerCase(),Mt()});let O=document.querySelectorAll(`.category-btn`);O.forEach(e=>{e.addEventListener(`click`,()=>{O.forEach(e=>{e.classList.remove(`active`),e.classList.contains(`category-all`)?(e.style.background=`#f5f3ff`,e.style.color=`#667eea`,e.style.borderColor=`#d4cfff`):(e.style.background=`white`,e.style.color=`#555`,e.style.borderColor=`#ececec`)}),e.classList.add(`active`),e.style.background=`linear-gradient(135deg, #667eea 0%, #764ba2 100%)`,e.style.color=`white`,e.style.borderColor=`transparent`,F.currentCategory=e.dataset.category,Mt()})});let k=document.getElementById(`toolsCategories`);k&&k.addEventListener(`wheel`,e=>{e.preventDefault(),k.scrollLeft+=e.deltaY*2},{passive:!1});let A=document.getElementById(`toolsSelectAll`),j=document.getElementById(`toolsSelectNone`);A&&A.addEventListener(`click`,()=>{Ft().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!0),F.enabledTools.includes(e.id)||F.enabledTools.push(e.id)}),It(),X(),Z()}),j&&j.addEventListener(`click`,()=>{Ft().forEach(e=>{let t=document.getElementById(`tool_`+e.id);t&&(t.checked=!1);let n=F.enabledTools.indexOf(e.id);n>-1&&F.enabledTools.splice(n,1)}),It(),X(),Z()});let M=document.getElementById(`toolsPopupSave`);M&&M.addEventListener(`click`,()=>{Lt(),Z()});let N=document.getElementById(`toolsPopupCancel`);N&&N.addEventListener(`click`,()=>{jt()});let te=document.getElementById(`modalCancelBtn`),ne=document.getElementById(`modalConfirmBtn`);te.addEventListener(`click`,()=>{Ke()}),ne.addEventListener(`click`,()=>{Ke(),Ue()});let P=document.getElementById(`confirmModal`);P.addEventListener(`click`,e=>{e.target===P&&Ke()});let L=document.getElementById(`selectionClose`);L&&L.addEventListener(`click`,e=>{e.preventDefault(),e.stopPropagation(),console.log(`[SidePanel] 用户点击关闭选中内容按钮`),V(),window.hideFloatingMenu(),F.lastSelectedText=``,F.currentSelectionRange=null}),i.addEventListener(`input`,()=>{})}),se().then(()=>Q()),document.addEventListener(`DOMContentLoaded`,()=>{Bt()}),document.addEventListener(`DOMContentLoaded`,pe),document.addEventListener(`DOMContentLoaded`,kt),document.addEventListener(`DOMContentLoaded`,De);
//# sourceMappingURL=side_panel-ImdTNAvG.js.map