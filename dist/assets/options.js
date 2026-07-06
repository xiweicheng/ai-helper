import{l as e}from"./constants-oU5WfDbI.js";var t=[`deepseek-v4-pro`,`deepseek-v4-flash`],n=`你是AI智能助手(AI Helper)，专为IT从业者（产品经理、架构师、开发工程师、测试工程师等）打造的AI技术助手。

## 你的能力
- **编程开发**：精通主流编程语言（Java/Python/JavaScript/Go/C++等）及框架，能编写、调试、优化代码
- **技术问题解答**：擅长解答架构设计、算法优化、性能调优、Bug排查等技术问题
- **代码审查**：能提供代码质量评估、最佳实践建议、潜在风险识别
- **文档编写**：协助撰写技术文档、API说明、测试用例等
- **工具使用**：可调用浏览器工具获取当前网页内容或选中文本，辅助解答与网页相关的问题

## 回答原则
1. **精准专业**：使用准确的技术术语，回答直击要点
2. **代码优先**：涉及代码时，优先给出可运行的代码示例，并添加必要注释
3. **结构清晰**：善用Markdown格式（标题、列表、代码块、表格等）组织内容
4. **实用导向**：提供可落地的解决方案，避免空泛的理论
5. **安全合规**：不生成违反安全规范的代码，不涉及敏感信息处理`,r={maxIterations:100,apiTimeout:3e5,loopTimeout:18e5,toolTimeout:6e5,clarifyTimeout:18e4,apiRetryCount:3,apiRetryBaseDelay:1e3,enableToolPreselect:!0,preselectMinToolCount:3,toolConfirmationEnabled:!0},i=[{id:`ai-search`,name:`AI搜索`,systemPrompt:`使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。`,builtin:!0,order:0},{id:`explain`,name:`解释`,systemPrompt:`对选中的内容进行解释说明，帮助理解其含义。`,builtin:!0,order:1},{id:`translate`,name:`翻译`,systemPrompt:`将选中的内容翻译成中文。`,builtin:!0,order:2},{id:`summary`,name:`总结`,systemPrompt:`对选中的内容进行归纳总结，提炼关键要点。`,builtin:!0,order:3},{id:`copy`,name:`复制`,systemPrompt:`将选中内容复制到剪贴板。`,builtin:!0,order:99}],a={maxInputHistory:20,maxHistoryMessages:50,maxMessageLength:1e5,maxMemoryMessages:20,enableExecutionLog:!1,contextWindow:0},o=`deepseek-v4-pro`;function s(e){o=e}var c=``;function l(e){c=e}var u=[];function d(e){chrome.storage.local.get([`deletedPresetModels`],t=>{u=t.deletedPresetModels||[],typeof e==`function`&&e()})}function f(){chrome.storage.local.set({deletedPresetModels:u})}function p(){let e=document.getElementById(`modelDropdown`);e&&e.querySelectorAll(`.model-option:not([data-is-custom="true"])`).forEach(e=>{if(e.querySelector(`.delete-model-btn`))return;let t=document.createElement(`button`);t.type=`button`,t.className=`delete-model-btn`,t.title=`删除此模型`,t.innerHTML=`×`,t.style.display=`inline-block`,e.appendChild(t)})}function m(e){let t=document.createElement(`span`);t.className=`model-option-left`;let n=[];for(let t of[...e.childNodes])t.nodeType===Node.TEXT_NODE&&n.push(t);n.forEach(e=>{t.appendChild(e)}),e.insertBefore(t,e.firstChild)}function h(e,n){let r=document.getElementById(`modelDropdown`),i=r.querySelector(`.model-option[data-value="${e}"]`);if(i){if(n&&n>0){i.dataset.contextWindow=n,i.dataset.isCustom=`true`;let e=i.querySelector(`.model-option-left`);e||=(m(i),i.querySelector(`.model-option-left`));let t=i.querySelector(`.model-option-right`);if(!t){t=document.createElement(`span`),t.className=`model-option-right`;let e=i.querySelector(`:scope > .model-ctx-badge`);e&&t.appendChild(e);let n=i.querySelector(`:scope > .delete-model-btn`);n||(n=document.createElement(`button`),n.type=`button`,n.className=`delete-model-btn`,n.title=`删除此模型`,n.innerHTML=`×`),n.style.display=`inline-block`,t.appendChild(n),i.appendChild(t)}let r=t.querySelector(`.model-ctx-badge`);if(r)r.textContent=_(n);else{let e=document.createElement(`span`);e.className=`model-ctx-badge`,e.textContent=_(n),t.insertBefore(e,t.firstChild)}v()}return}t.includes(e)&&u.includes(e)&&(u=u.filter(t=>t!==e),f());let a=document.createElement(`div`);a.className=`model-option`,a.dataset.value=e,(!t.includes(e)||n&&n>0)&&(a.dataset.isCustom=`true`),n&&n>0&&(a.dataset.contextWindow=n);let o=document.createElement(`span`);o.className=`model-option-left`,o.textContent=e,a.appendChild(o);let s=document.createElement(`span`);if(s.className=`model-option-right`,n&&n>0){let e=document.createElement(`span`);e.className=`model-ctx-badge`,e.textContent=_(n),s.appendChild(e)}let c=document.createElement(`button`);c.type=`button`,c.className=`delete-model-btn`,c.title=`删除此模型`,c.innerHTML=`×`,c.style.display=`inline-block`,s.appendChild(c),a.appendChild(s),r.appendChild(a),v()}function g(e){let n=document.getElementById(`modelDropdown`).querySelector(`.model-option[data-value="${e}"]`);if(n&&n.remove(),t.includes(e)&&!u.includes(e)&&(u.push(e),f()),o===e){let e=t.find(e=>!u.includes(e))||``;s(e);let n=document.getElementById(`modelInput`);n&&(n.value=e),b(e)}v()}function _(e){return e>=1e6?Math.round(e/1e6*10)/10+`M`:e>=1e3?Math.round(e/1e3)+`K`:String(e)}function v(){let e=document.getElementById(`modelDropdown`),t=[];e.querySelectorAll(`.model-option[data-is-custom="true"]`).forEach(e=>{t.push({name:e.dataset.value,contextWindow:parseInt(e.dataset.contextWindow)||0})}),chrome.storage.local.set({customModels:t,deletedPresetModels:u},()=>{console.log(`[Options] 自定义模型已保存:`,t,`已删除预设:`,u)})}function y(e){d(()=>{let t=document.getElementById(`modelDropdown`);t&&(u.forEach(e=>{let n=t.querySelector(`.model-option[data-value="${e}"]`);n&&n.remove()}),p()),chrome.storage.local.get([`customModels`],n=>{let r=n.customModels||[],i=!1;r.forEach(e=>{let n,r=0;if(typeof e==`string`)n=e,i=!0;else if(e&&typeof e==`object`&&e.name)n=e.name,r=e.contextWindow||0;else return;let a=t.querySelector(`.model-option[data-value="${n}"]`);if(a){if(r&&r>0){a.dataset.contextWindow=r,a.dataset.isCustom=`true`;let e=a.querySelector(`.model-option-left`);e||=(m(a),a.querySelector(`.model-option-left`));let t=a.querySelector(`.model-option-right`);if(!t){t=document.createElement(`span`),t.className=`model-option-right`;let e=a.querySelector(`:scope > .model-ctx-badge`);e&&t.appendChild(e);let n=a.querySelector(`:scope > .delete-model-btn`);if(n)t.appendChild(n);else{let e=document.createElement(`button`);e.type=`button`,e.className=`delete-model-btn`,e.title=`删除此模型`,e.innerHTML=`×`,e.style.display=`inline-block`,t.appendChild(e)}a.appendChild(t)}let n=t.querySelector(`.model-ctx-badge`);if(n)n.textContent=_(r);else{let e=document.createElement(`span`);e.className=`model-ctx-badge`,e.textContent=_(r),t.insertBefore(e,t.firstChild)}if(!t.querySelector(`.delete-model-btn`)){let e=document.createElement(`button`);e.type=`button`,e.className=`delete-model-btn`,e.title=`删除此模型`,e.innerHTML=`×`,e.style.display=`inline-block`,t.appendChild(e)}}return}let o=document.createElement(`div`);o.className=`model-option`,o.dataset.value=n,o.dataset.isCustom=`true`,r&&r>0&&(o.dataset.contextWindow=r);let s=document.createElement(`span`);s.className=`model-option-left`,s.textContent=n,o.appendChild(s);let c=document.createElement(`span`);if(c.className=`model-option-right`,r&&r>0){let e=document.createElement(`span`);e.className=`model-ctx-badge`,e.textContent=_(r),c.appendChild(e)}let l=document.createElement(`button`);l.type=`button`,l.className=`delete-model-btn`,l.title=`删除此模型`,l.innerHTML=`×`,l.style.display=`inline-block`,c.appendChild(l),o.appendChild(c),t.appendChild(o)}),i&&(v(),console.log(`[Options] 自定义模型已自动迁移为新格式`)),typeof e==`function`&&e()})})}function b(e){document.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?t.classList.add(`selected`):t.classList.remove(`selected`)}),x(`modelInput`,`modelSelectedCtxBadge`,`modelDropdown`)}function x(e,t,n){let r=document.getElementById(e),i=document.getElementById(t),a=document.getElementById(n);if(!i||!a)return;if(r&&!r.value){i.style.display=`none`;return}let o=a.querySelector(`.model-option.selected`)||(r?a.querySelector(`.model-option[data-value="${r.value}"]`):null);if(o){let e=parseInt(o.dataset.contextWindow);e>0?(i.textContent=_(e),i.style.display=``):i.style.display=`none`}else i.style.display=`none`}function S(e,t){let n=document.getElementById(`imageModelDropdown`);if(!n)return;let r=n.querySelector(`.model-option[data-value="${e}"]`);if(r){if(t&&t>0){r.dataset.contextWindow=t;let e=r.querySelector(`.model-option-left`);e||=(m(r),r.querySelector(`.model-option-left`));let n=r.querySelector(`.model-option-right`);if(!n){n=document.createElement(`span`),n.className=`model-option-right`;let e=r.querySelector(`:scope > .model-ctx-badge`);e&&n.appendChild(e);let t=r.querySelector(`:scope > .delete-model-btn`);t&&n.appendChild(t),r.appendChild(n)}let i=n.querySelector(`.model-ctx-badge`);if(i)i.textContent=_(t);else{let e=document.createElement(`span`);e.className=`model-ctx-badge`,e.textContent=_(t),n.insertBefore(e,n.firstChild)}}return}let i=document.createElement(`div`);i.className=`model-option`,i.dataset.value=e,t&&t>0&&(i.dataset.contextWindow=t);let a=document.createElement(`span`);a.className=`model-option-left`,a.textContent=e,i.appendChild(a);let o=document.createElement(`span`);if(o.className=`model-option-right`,t&&t>0){let e=document.createElement(`span`);e.className=`model-ctx-badge`,e.textContent=_(t),o.appendChild(e)}let s=document.createElement(`button`);s.type=`button`,s.className=`delete-model-btn`,s.title=`删除此模型`,s.innerHTML=`×`,s.style.display=`inline-block`,o.appendChild(s),i.appendChild(o),n.appendChild(i),C()}function ee(e){let t=document.getElementById(`imageModelDropdown`);if(!t)return;let n=t.querySelector(`.model-option[data-value="${e}"]`);if(n&&n.remove(),c===e){let e=t.querySelector(`.model-option`),n=e?e.dataset.value:``;l(n);let r=document.getElementById(`imageModelInput`);r&&(r.value=n),T(n)}C()}function C(){let e=document.getElementById(`imageModelDropdown`);if(!e)return;let t=[];e.querySelectorAll(`.model-option`).forEach(e=>{t.push({name:e.dataset.value,contextWindow:parseInt(e.dataset.contextWindow)||0})}),chrome.storage.local.set({imageModels:t},()=>{console.log(`[Options] 图片识别模型已保存:`,t)})}function w(e){chrome.storage.local.get([`imageModels`],t=>{let n=document.getElementById(`imageModelDropdown`);if(!n){typeof e==`function`&&e();return}let r=t.imageModels||[],i=!1;n.innerHTML=``,r.forEach(e=>{let t,r=0;if(typeof e==`string`)t=e,i=!0;else if(e&&typeof e==`object`&&e.name)t=e.name,r=e.contextWindow||0;else return;let a=document.createElement(`div`);a.className=`model-option`,a.dataset.value=t,r&&r>0&&(a.dataset.contextWindow=r);let o=document.createElement(`span`);o.className=`model-option-left`,o.textContent=t,a.appendChild(o);let s=document.createElement(`span`);if(s.className=`model-option-right`,r&&r>0){let e=document.createElement(`span`);e.className=`model-ctx-badge`,e.textContent=_(r),s.appendChild(e)}let c=document.createElement(`button`);c.type=`button`,c.className=`delete-model-btn`,c.title=`删除此模型`,c.innerHTML=`×`,c.style.display=`inline-block`,s.appendChild(c),a.appendChild(s),n.appendChild(a)}),i&&(C(),console.log(`[Options] 图片识别模型已自动迁移为新格式`)),typeof e==`function`&&e()})}function T(e){let t=document.getElementById(`imageModelDropdown`);t&&(t.querySelectorAll(`.model-option`).forEach(t=>{t.dataset.value===e?t.classList.add(`selected`):t.classList.remove(`selected`)}),x(`imageModelInput`,`imageModelSelectedCtxBadge`,`imageModelDropdown`))}function E(){chrome.storage.local.get(`apiBase.apiKey.modelName.customModels.systemPrompt.enableImageInput.imageModelName.imageModels.imageApiBase.imageApiKey.reactMaxIterations.reactApiTimeout.reactLoopTimeout.reactToolTimeout.reactClarifyTimeout.reactApiRetryCount.reactApiRetryBaseDelay.enableToolPreselect.preselectMinToolCount.toolConfirmationEnabled.chatMaxInputHistory.chatMaxHistoryMessages.chatMaxMessageLength.chatMaxMemoryMessages.enableExecutionLog.chatContextWindow.reflectionConfig.streamEnabled.streamChunkDelay`.split(`.`),function(t){t.apiBase&&(document.getElementById(`apiBase`).value=t.apiBase),t.apiKey&&(document.getElementById(`apiKey`).value=t.apiKey),t.modelName&&(s(t.modelName),document.getElementById(`modelInput`).value=t.modelName),t.systemPrompt&&(document.getElementById(`systemPrompt`).value=t.systemPrompt);let n=document.getElementById(`enableImageInput`),i=document.getElementById(`imageModelGroup`),o=document.getElementById(`imageApiGroup`),c=document.getElementById(`imageApiKeyGroup`);if(n&&i&&(n.checked=t.enableImageInput||!1,i.style.display=n.checked?``:`none`,o&&(o.style.display=n.checked?``:`none`),c&&(c.style.display=n.checked?``:`none`)),t.imageModelName){l(t.imageModelName);let e=document.getElementById(`imageModelInput`);e&&(e.value=t.imageModelName)}t.imageApiBase&&(document.getElementById(`imageApiBase`).value=t.imageApiBase),t.imageApiKey&&(document.getElementById(`imageApiKey`).value=t.imageApiKey),document.getElementById(`reactMaxIterations`).value=t.reactMaxIterations||r.maxIterations,document.getElementById(`reactApiTimeout`).value=(t.reactApiTimeout||r.apiTimeout)/1e3,document.getElementById(`reactLoopTimeout`).value=Math.round((t.reactLoopTimeout||r.loopTimeout)/6e4),document.getElementById(`reactToolTimeout`).value=(t.reactToolTimeout||r.toolTimeout)/1e3,document.getElementById(`reactClarifyTimeout`).value=Math.round((t.reactClarifyTimeout||r.clarifyTimeout)/6e4),document.getElementById(`reactApiRetryCount`).value=t.reactApiRetryCount===void 0?r.apiRetryCount:t.reactApiRetryCount,document.getElementById(`reactApiRetryBaseDelay`).value=t.reactApiRetryBaseDelay===void 0?r.apiRetryBaseDelay:t.reactApiRetryBaseDelay;let u=document.getElementById(`enableToolPreselect`);u.checked=t.enableToolPreselect===void 0?r.enableToolPreselect:t.enableToolPreselect,u.dispatchEvent(new Event(`change`)),document.getElementById(`preselectMinToolCount`).value=t.preselectMinToolCount===void 0?r.preselectMinToolCount:t.preselectMinToolCount,document.getElementById(`toolConfirmationEnabled`).checked=t.toolConfirmationEnabled===void 0?r.toolConfirmationEnabled:t.toolConfirmationEnabled,document.getElementById(`chatMaxInputHistory`).value=t.chatMaxInputHistory||a.maxInputHistory,document.getElementById(`chatMaxHistoryMessages`).value=t.chatMaxHistoryMessages||a.maxHistoryMessages,document.getElementById(`chatMaxMessageLength`).value=t.chatMaxMessageLength||a.maxMessageLength,t.chatMaxMemoryMessages!==void 0&&t.chatMaxMemoryMessages!==null&&(document.getElementById(`chatMaxMemoryMessages`).value=t.chatMaxMemoryMessages),t.chatContextWindow!==void 0&&t.chatContextWindow>0&&(document.getElementById(`chatContextWindow`).value=t.chatContextWindow),document.getElementById(`enableExecutionLog`).checked=t.enableExecutionLog||a.enableExecutionLog;let d=t.reflectionConfig||e;document.getElementById(`reflectionEnabled`).checked=d.enabled!==!1,document.getElementById(`postReflectionEnabled`).checked=d.postReflection?.enabled!==!1,document.getElementById(`reflectionPostMaxRounds`).value=d.postReflection?.maxRounds??e.postReflection.maxRounds,document.getElementById(`reflectionPostQualityThreshold`).value=d.postReflection?.qualityThreshold??e.postReflection.qualityThreshold,document.getElementById(`reflectionPostRefineThreshold`).value=d.postReflection?.refineThreshold??e.postReflection.refineThreshold,document.getElementById(`reflectionPostModel`).value=d.postReflection?.model||``,document.getElementById(`reflectionPostTemperature`).value=d.postReflection?.temperature??e.postReflection.temperature,document.getElementById(`reflectionPostMaxTokens`).value=d.postReflection?.maxTokens??e.postReflection.maxTokens,document.getElementById(`toolReflectionEnabled`).checked=d.toolReflection?.enabled!==!1,document.getElementById(`toolReflectionTriggerOnError`).checked=d.toolReflection?.triggerOnError!==!1,document.getElementById(`toolReflectionTriggerOnEmpty`).checked=d.toolReflection?.triggerOnEmpty!==!1,document.getElementById(`toolReflectionTriggerOnOversized`).checked=d.toolReflection?.triggerOnOversized!==!1,document.getElementById(`toolReflectionOversizeThreshold`).value=d.toolReflection?.oversizeThreshold??e.toolReflection.oversizeThreshold,document.getElementById(`toolReflectionConsecutiveFails`).value=d.toolReflection?.triggerOnConsecutiveFails??e.toolReflection.triggerOnConsecutiveFails,document.getElementById(`toolReflectionMaxPerIteration`).value=d.toolReflection?.maxPerIteration??e.toolReflection.maxPerIteration,document.getElementById(`subtaskReflectionEnabled`).checked=d.subtaskReflection?.enabled===!0,document.getElementById(`subtaskReflectionOnlyComplex`).checked=d.subtaskReflection?.onlyForComplexSubtasks!==!1,document.getElementById(`subtaskReflectionMaxRounds`).value=d.subtaskReflection?.maxRounds??e.subtaskReflection.maxRounds,document.getElementById(`subtaskReflectionDimensions`).value=(d.subtaskReflection?.dimensions||e.subtaskReflection.dimensions).join(`,`),document.getElementById(`subtaskReflectionModel`).value=d.subtaskReflection?.model||``,document.getElementById(`subtaskReflectionTemperature`).value=d.subtaskReflection?.temperature??e.subtaskReflection.temperature,document.getElementById(`subtaskReflectionMaxTokens`).value=d.subtaskReflection?.maxTokens??e.subtaskReflection.maxTokens;let f=document.getElementById(`streamEnabled`);f&&(f.checked=t.streamEnabled===void 0?!0:t.streamEnabled);let p=document.getElementById(`streamChunkDelay`);p&&(p.value=t.streamChunkDelay===void 0?30:t.streamChunkDelay);function m(){let e=document.getElementById(`reflectionConfig`),t=document.getElementById(`reflectionEnabled`);e&&(!t||!t.checked?e.classList.add(`disabled`):e.classList.remove(`disabled`));function n(e,t){let n=document.getElementById(e),r=document.getElementById(t);n&&r&&(r.checked?n.classList.remove(`disabled`):n.classList.add(`disabled`))}n(`postReflectionSection`,`postReflectionEnabled`),n(`toolReflectionSection`,`toolReflectionEnabled`),n(`subtaskReflectionSection`,`subtaskReflectionEnabled`)}y(()=>{t.modelName&&b(t.modelName),m()}),w(()=>{t.imageModelName&&T(t.imageModelName)})})}function te(){let t=document.getElementById(`apiBase`).value.trim(),n=document.getElementById(`apiKey`).value.trim(),i=document.getElementById(`systemPrompt`).value.trim(),s=parseInt(document.getElementById(`reactMaxIterations`).value)||r.maxIterations,l=(parseInt(document.getElementById(`reactApiTimeout`).value)||60)*1e3,u=(parseInt(document.getElementById(`reactLoopTimeout`).value)||5)*6e4,d=(parseInt(document.getElementById(`reactToolTimeout`).value)||30)*1e3,f=(parseInt(document.getElementById(`reactClarifyTimeout`).value)||3)*6e4,p=parseInt(document.getElementById(`reactApiRetryCount`).value)??r.apiRetryCount,m=parseInt(document.getElementById(`reactApiRetryBaseDelay`).value)||r.apiRetryBaseDelay,h=document.getElementById(`enableToolPreselect`).checked,g=parseInt(document.getElementById(`preselectMinToolCount`).value)||r.preselectMinToolCount,_=document.getElementById(`toolConfirmationEnabled`).checked,v=parseInt(document.getElementById(`chatMaxInputHistory`).value)||a.maxInputHistory,y=parseInt(document.getElementById(`chatMaxHistoryMessages`).value)||a.maxHistoryMessages,b=parseInt(document.getElementById(`chatMaxMessageLength`).value)||a.maxMessageLength,x=document.getElementById(`chatMaxMemoryMessages`).value.trim(),S=x?parseInt(x):null,ee=document.getElementById(`chatContextWindow`).value.trim(),C=ee?parseInt(ee):0,w=document.getElementById(`enableExecutionLog`).checked,T=document.getElementById(`streamEnabled`)?.checked!==!1,E=parseInt(document.getElementById(`streamChunkDelay`)?.value)||30,te=document.getElementById(`enableImageInput`)?.checked||!1,ne=c||``,k=document.getElementById(`imageApiBase`)?.value.trim()||``,re=document.getElementById(`imageApiKey`)?.value.trim()||``,A={enabled:document.getElementById(`reflectionEnabled`).checked,postReflection:{enabled:document.getElementById(`postReflectionEnabled`).checked,maxRounds:parseInt(document.getElementById(`reflectionPostMaxRounds`).value)||e.postReflection.maxRounds,qualityThreshold:parseInt(document.getElementById(`reflectionPostQualityThreshold`).value)||e.postReflection.qualityThreshold,refineThreshold:parseInt(document.getElementById(`reflectionPostRefineThreshold`).value)||e.postReflection.refineThreshold,model:document.getElementById(`reflectionPostModel`).value.trim()||null,temperature:parseFloat(document.getElementById(`reflectionPostTemperature`).value)||e.postReflection.temperature,maxTokens:parseInt(document.getElementById(`reflectionPostMaxTokens`).value)||e.postReflection.maxTokens},toolReflection:{enabled:document.getElementById(`toolReflectionEnabled`).checked,triggerOnError:document.getElementById(`toolReflectionTriggerOnError`).checked,triggerOnEmpty:document.getElementById(`toolReflectionTriggerOnEmpty`).checked,triggerOnOversized:document.getElementById(`toolReflectionTriggerOnOversized`).checked,oversizeThreshold:parseInt(document.getElementById(`toolReflectionOversizeThreshold`).value)||e.toolReflection.oversizeThreshold,triggerOnConsecutiveFails:parseInt(document.getElementById(`toolReflectionConsecutiveFails`).value)||e.toolReflection.triggerOnConsecutiveFails,maxPerIteration:parseInt(document.getElementById(`toolReflectionMaxPerIteration`).value)||e.toolReflection.maxPerIteration},subtaskReflection:{enabled:document.getElementById(`subtaskReflectionEnabled`).checked,onlyForComplexSubtasks:document.getElementById(`subtaskReflectionOnlyComplex`).checked,maxRounds:parseInt(document.getElementById(`subtaskReflectionMaxRounds`).value)||e.subtaskReflection.maxRounds,dimensions:document.getElementById(`subtaskReflectionDimensions`).value.trim().split(`,`).map(e=>e.trim()).filter(e=>e),model:document.getElementById(`subtaskReflectionModel`).value.trim()||null,temperature:parseFloat(document.getElementById(`subtaskReflectionTemperature`).value)||e.subtaskReflection.temperature,maxTokens:parseInt(document.getElementById(`subtaskReflectionMaxTokens`).value)||e.subtaskReflection.maxTokens}};if(A.postReflection.maxRounds<0||A.postReflection.maxRounds>3){D(`❌ 后置反思最大轮数必须在 0-3 之间`,`error`);return}if(A.postReflection.qualityThreshold<1||A.postReflection.qualityThreshold>10){D(`❌ 质量评分阈值必须在 1-10 之间`,`error`);return}if(A.postReflection.refineThreshold<1||A.postReflection.refineThreshold>10){D(`❌ 修订阈值必须在 1-10 之间`,`error`);return}if(A.postReflection.temperature<0||A.postReflection.temperature>1){D(`❌ 反思温度系数必须在 0-1 之间`,`error`);return}if(A.postReflection.maxTokens<256||A.postReflection.maxTokens>8192){D(`❌ 反思最大 Token 必须在 256-8192 之间`,`error`);return}if(A.toolReflection.oversizeThreshold<1e3||A.toolReflection.oversizeThreshold>2e5){D(`❌ 工具反思结果大小阈值必须在 1000-200000 之间`,`error`);return}if(A.toolReflection.triggerOnConsecutiveFails<1||A.toolReflection.triggerOnConsecutiveFails>10){D(`❌ 连续失败触发次数必须在 1-10 之间`,`error`);return}if(A.toolReflection.maxPerIteration<1||A.toolReflection.maxPerIteration>5){D(`❌ 每轮最多触发次数必须在 1-5 之间`,`error`);return}if(s<1||s>200){D(`❌ 最大循环次数必须在 1-200 之间`,`error`);return}if(l<1e4||l>6e5){D(`❌ API 请求超时必须在 10-600 秒 之间`,`error`);return}if(u<6e4||u>36e5){D(`❌ 整体循环超时必须在 1-60 分钟 之间`,`error`);return}if(d<5e3||d>18e5){D(`❌ 工具执行超时必须在 5-1800 秒 之间`,`error`);return}if(f<6e4||f>6e5){D(`❌ 澄清等待超时必须在 1-10 分钟 之间`,`error`);return}if(p<0||p>10){D(`❌ API 重试次数必须在 0-10 之间`,`error`);return}if(m<500||m>3e4){D(`❌ API 重试基础延迟必须在 500-30000ms 之间`,`error`);return}if(v<10||v>100){D(`❌ 最大输入历史记录数必须在 10-100 之间`,`error`);return}if(y<10||y>200){D(`❌ 最大保留对话轮数必须在 10-200 之间`,`error`);return}if(b<1e3||b>2e5){D(`❌ 单条消息最大字符数必须在 1000-200000 之间`,`error`);return}if(S!==null&&(S<1||S>400)){D(`❌ 记忆历史限制条数必须在 1-400 之间或置空`,`error`);return}if(t||=`https://api.deepseek.com`,!n){D(`❌ API Key 不能为空`,`error`);return}chrome.storage.local.set({apiBase:t,apiKey:n,modelName:o||`deepseek-v4-pro`,systemPrompt:i,reactMaxIterations:s,reactApiTimeout:l,reactLoopTimeout:u,reactToolTimeout:d,reactClarifyTimeout:f,reactApiRetryCount:p,reactApiRetryBaseDelay:m,enableToolPreselect:h,preselectMinToolCount:g,toolConfirmationEnabled:_,chatMaxInputHistory:v,chatMaxHistoryMessages:y,chatMaxMessageLength:b,chatMaxMemoryMessages:S,chatContextWindow:C,enableExecutionLog:w,enableImageInput:te,imageModelName:ne,imageApiBase:k,imageApiKey:re,reflectionConfig:A,streamEnabled:T,streamChunkDelay:E},async function(){if(chrome.runtime.lastError)D(`❌ 保存失败：`+chrome.runtime.lastError.message,`error`);else{D(`✅ 配置已保存成功！`,`success`);let e=document.getElementById(`status`);e.style.display=`none`;let n=await chrome.storage.local.get([`agentUrl`,`agentToken`]),r=null;if(n.agentUrl){r={url:n.agentUrl,connected:!!n.agentToken};try{if(n.agentToken){let e=await fetch(`${n.agentUrl}/api/status/detail`,{headers:{Authorization:`Bearer ${n.agentToken}`}});if(e.ok){let t=await e.json();r.workdir=t.workdir,r.connected=!0}}}catch{}}O(t,o,{maxIterations:s,apiTimeout:l,loopTimeout:u,toolTimeout:d,clarifyTimeout:f,apiRetryCount:p,apiRetryBaseDelay:m,enableToolPreselect:h,preselectMinToolCount:g,toolConfirmationEnabled:_},{maxInputHistory:v,maxHistoryMessages:y,maxMessageLength:b,maxMemoryMessages:S,enableExecutionLog:w,contextWindow:C},A,r,{streamEnabled:T,streamChunkDelay:E})}})}function D(e,t=`info`,n=3e3){let r=document.getElementById(`toastContainer`);if(!r)return;let i=document.createElement(`div`);i.className=`toast ${t}`,i.textContent=e,r.appendChild(i),requestAnimationFrame(()=>{i.classList.add(`toast-show`)}),setTimeout(()=>{i.classList.remove(`toast-show`),setTimeout(()=>{i.parentNode&&i.parentNode.removeChild(i)},300)},n)}function ne(){let e=document.getElementById(`configDetails`);e.textContent=`💡 提示：保存配置后，新配置将立即生效`}function O(t,n,i,o,s,c,l){let u=document.getElementById(`configDetails`),d=t||`https://api.deepseek.com`,f=n||`deepseek-v4-pro`,p=i||r,m=o||a,h=s||e,g=l||{streamEnabled:!0,streamChunkDelay:30},_=e=>e>=6e4?`${Math.round(e/6e4)}分钟`:`${Math.round(e/1e3)}秒`;u.innerHTML=`
    <strong>当前配置：</strong><br>
    API Base: ${d}<br>
    模型名称: ${f}<br>
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>推理配置：</strong><br>
    最大循环次数: ${p.maxIterations} 次<br>
    API 请求超时: ${_(p.apiTimeout)}<br>
    整体循环超时: ${_(p.loopTimeout)}<br>
    工具执行超时: ${_(p.toolTimeout)}<br>
    澄清等待超时: ${_(p.clarifyTimeout)}<br>
    API 重试次数: ${p.apiRetryCount} 次<br>
    API 重试基础延迟: ${p.apiRetryBaseDelay}ms<br>
    工具预筛选: ${p.enableToolPreselect?`✅ 启用`:`❌ 关闭`}<br>
    预筛选最小工具数: ${p.preselectMinToolCount??3} 个<br>
    敏感工具操作确认: ${p.toolConfirmationEnabled?`✅ 启用`:`❌ 关闭`}<br>
    流式输出: ${g.streamEnabled===!1?`❌ 关闭`:`✅ 启用`}<br>
    流式渲染延迟: ${g.streamChunkDelay??30} ms<br>
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>反思配置：</strong><br>
    反思功能: ${h.enabled?`✅ 启用`:`❌ 关闭`}<br>
    后置反思: ${h.postReflection?.enabled?`✅ 启用`:`❌ 关闭`}<br>
    &nbsp;&nbsp;最大轮数: ${h.postReflection?.maxRounds??`-`} 轮<br>
    &nbsp;&nbsp;质量阈值: ${h.postReflection?.qualityThreshold??`-`} /10<br>
    &nbsp;&nbsp;修订阈值: ${h.postReflection?.refineThreshold??`-`} /10<br>
    &nbsp;&nbsp;反思模型: ${h.postReflection?.model||`使用当前模型`}<br>
    &nbsp;&nbsp;温度系数: ${h.postReflection?.temperature??`-`}<br>
    &nbsp;&nbsp;最大 Token: ${h.postReflection?.maxTokens??`-`}<br>
    工具级反思: ${h.toolReflection?.enabled?`✅ 启用`:`❌ 关闭`}<br>
    &nbsp;&nbsp;触发条件: 错误${h.toolReflection?.triggerOnError?`✓`:`✗`} / 空${h.toolReflection?.triggerOnEmpty?`✓`:`✗`} / 过大${h.toolReflection?.triggerOnOversized?`✓`:`✗`}<br>
    &nbsp;&nbsp;过大阈值: ${h.toolReflection?.oversizeThreshold??`-`} 字符<br>
    &nbsp;&nbsp;连续失败触发: ${h.toolReflection?.triggerOnConsecutiveFails??`-`} 次<br>
    &nbsp;&nbsp;每轮上限: ${h.toolReflection?.maxPerIteration??`-`} 次<br>
    子任务反思: ${h.subtaskReflection?.enabled?`✅ 启用`:`❌ 关闭`}<br>
    &nbsp;&nbsp;仅复杂子任务: ${h.subtaskReflection?.onlyForComplexSubtasks?`✓`:`✗`}<br>
    &nbsp;&nbsp;最大轮数: ${h.subtaskReflection?.maxRounds??`-`} 轮<br>
    &nbsp;&nbsp;评估维度: ${(h.subtaskReflection?.dimensions||[]).join(`, `)||`-`}<br>
    &nbsp;&nbsp;反思模型: ${h.subtaskReflection?.model||`使用当前模型`}<br>
    &nbsp;&nbsp;温度系数: ${h.subtaskReflection?.temperature??`-`}<br>
    &nbsp;&nbsp;最大 Token: ${h.subtaskReflection?.maxTokens??`-`}<br>
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>对话配置：</strong><br>
    输入历史记录数: ${m.maxInputHistory} 条<br>
    最大对话轮数: ${m.maxHistoryMessages} 轮<br>
    消息最大长度: ${m.maxMessageLength} 字符<br>
    记忆历史限制条数: ${m.maxMemoryMessages===null?`不限制`:m.maxMemoryMessages+` 条`}<br>
    执行日志: ${m.enableExecutionLog?`✅ 启用`:`❌ 关闭`}<br>
    ${c?`<hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    <strong>代理配置：</strong><br>
    代理地址: ${c.url||`未配置`}<br>
    连接状态: ${c.connected?`✅ 已连接`:`⚠️ 未配对`}<br>
    ${c.workdir?`工作目录: ${c.workdir}<br>`:``}`:``}
    <hr style="margin: 8px 0; border: none; border-top: 1px dashed #ccc;">
    💡 <strong>提示</strong>：澄清等待时间不计入整体循环超时<br>
    ⚠️ API Key 如果过期或失效，需要重新生成并更新配置
  `}var k=-1;function re(){return new Promise(e=>{chrome.storage.local.get([`toolbarTools`,`toolbarMaxVisible`,`toolbarIconOnly`,`enableSelectionToolbar`],t=>{let n=t.toolbarTools&&t.toolbarTools.length>0?t.toolbarTools:[...i],r=t.toolbarMaxVisible||4,a=t.toolbarIconOnly===void 0?!1:t.toolbarIconOnly,o=t.enableSelectionToolbar===void 0?!0:t.enableSelectionToolbar,s=new Map(i.map(e=>[e.id,e])),c=n.map(e=>e.builtin&&s.has(e.id)?{...e,systemPrompt:s.get(e.id).systemPrompt}:e);document.getElementById(`toolbarMaxVisible`).value=r;let l=document.getElementById(`toolbarIconOnly`);l&&(l.checked=a);let u=document.getElementById(`enableSelectionToolbar`);u&&(u.checked=o),e(c)})})}function A(e){let t=document.getElementById(`toolbarToolsList`);if(!t)return;let n=[...e].filter(e=>e.id!==`ai-search`&&e.id!==`copy`).sort((e,t)=>e.order-t.order);t.innerHTML=n.map((e,t)=>{let r=e.builtin,i=r?`<span class="tool-badge builtin">内置</span>`:`<span class="tool-badge custom">自定义</span>`,a=e.systemPrompt?`<div class="tool-prompt-preview" title="${M(e.systemPrompt)}">${M(e.systemPrompt)}</div>`:``,o=t===0,s=t===n.length-1,c=``;return r||(c+=`<button class="tool-action-btn" data-action="edit" data-index="${t}">编辑</button>`,c+=`<button class="tool-action-btn danger" data-action="delete" data-index="${t}">删除</button>`),`
      <div class="tool-item" data-tool-id="${e.id}" draggable="true" data-sorted-index="${t}">
        <div class="tool-drag-handle" title="拖拽排序">⋮⋮</div>
        <div class="tool-order-btns">
          <button class="tool-order-btn" data-action="moveUp" data-index="${t}" ${o?`disabled`:``} title="上移">▲</button>
          <button class="tool-order-btn" data-action="moveDown" data-index="${t}" ${s?`disabled`:``} title="下移">▼</button>
        </div>
        <div class="tool-info">
          <div class="tool-name">${M(e.name)}${i}</div>
          ${a}
        </div>
        <div class="tool-actions">
          ${c}
        </div>
      </div>
    `}).join(``),ie()}function ie(){let e=document.getElementById(`toolbarToolsList`);if(!e)return;let t=e.querySelectorAll(`.tool-item`);t.forEach(e=>{e.addEventListener(`dragstart`,t=>{e.classList.add(`dragging`),t.dataTransfer.effectAllowed=`move`,t.dataTransfer.setData(`text/plain`,e.dataset.sortedIndex)}),e.addEventListener(`dragend`,()=>{e.classList.remove(`dragging`),t.forEach(e=>e.classList.remove(`drag-over`))}),e.addEventListener(`dragover`,t=>{t.preventDefault(),t.dataTransfer.dropEffect=`move`,e.classList.add(`drag-over`)}),e.addEventListener(`dragleave`,()=>{e.classList.remove(`drag-over`)}),e.addEventListener(`drop`,t=>{t.stopPropagation(),t.preventDefault();let n=parseInt(t.dataTransfer.getData(`text/plain`)),r=parseInt(e.dataset.sortedIndex);isNaN(n)||isNaN(r)||n===r||(chrome.storage.local.get([`toolbarTools`],e=>{let t=e.toolbarTools&&e.toolbarTools.length>0?e.toolbarTools:[...i],a=[...t].filter(e=>e.id!==`ai-search`&&e.id!==`copy`).sort((e,t)=>e.order-t.order);if(n>=a.length||r>=a.length)return;let o=a[n].order;a[n].order=a[r].order,a[r].order=o;let s=t.filter(e=>e.id===`ai-search`||e.id===`copy`),c=[...a,...s];chrome.storage.local.set({toolbarTools:c},()=>{A(c)})}),e.classList.remove(`drag-over`))})})}function j(){let e=parseInt(document.getElementById(`toolbarMaxVisible`).value)||4,t=document.getElementById(`toolbarIconOnly`)?.checked||!1,n=document.getElementById(`enableSelectionToolbar`)?.checked!==!1;chrome.storage.local.get([`toolbarTools`],r=>{let a=r.toolbarTools||[...i];chrome.storage.local.set({toolbarTools:a,toolbarMaxVisible:Math.max(1,Math.min(5,e)),toolbarIconOnly:t,enableSelectionToolbar:n},()=>{console.log(`[Options] 工具栏配置已保存`)})})}function ae(e,t,n){let r=e.filter(e=>e.id===`ai-search`||e.id===`copy`),i=[...e].filter(e=>e.id!==`ai-search`&&e.id!==`copy`).sort((e,t)=>e.order-t.order),a=t+n;if(a<0||a>=i.length)return e;let o=i[t].order;return i[t].order=i[a].order,i[a].order=o,[...i,...r]}function oe(e,t){let n=e.filter(e=>e.id===`ai-search`||e.id===`copy`),r=[...e].filter(e=>e.id!==`ai-search`&&e.id!==`copy`).sort((e,t)=>e.order-t.order);return r[t].builtin?(console.warn(`[Options] 不能删除内置工具`),e):(r.splice(t,1),[...r,...n])}function se(e,t=-1){k=t;let n=document.getElementById(`toolEditModal`),r=document.getElementById(`toolEditModalTitle`),i=document.getElementById(`toolEditName`),a=document.getElementById(`toolEditPrompt`);if(t>=0){let n=[...e].filter(e=>e.id!==`ai-search`&&e.id!==`copy`).sort((e,t)=>e.order-t.order)[t];r.textContent=`编辑自定义工具`,i.value=n.name,a.value=n.systemPrompt||``}else r.textContent=`添加自定义工具`,i.value=``,a.value=``;n.style.display=`flex`}function ce(){document.getElementById(`toolEditModal`).style.display=`none`,k=-1}function le(e){let t=document.getElementById(`toolEditName`).value.trim(),n=document.getElementById(`toolEditPrompt`).value.trim();if(!t)return{error:`工具名称不能为空`};if(!n)return{error:`系统提示词不能为空`};let r=[...e].sort((e,t)=>e.order-t.order);if(k>=0){let e=r.filter(e=>e.id!==`ai-search`&&e.id!==`copy`)[k];if(!e)return{error:`未找到该工具`};if(e.builtin)return{error:`不能编辑内置工具`};e.name=t,e.systemPrompt=n}else{let e=r.length>0?Math.max(...r.map(e=>e.order)):0;r.push({id:`custom_`+Date.now(),name:t,systemPrompt:n,builtin:!1,order:e+1})}return ce(),e.filter(e=>e.id===`ai-search`||e.id===`copy`).forEach(e=>{r.find(t=>t.id===e.id)||r.push(e)}),{tools:r}}function M(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function ue(){chrome.storage.local.get([`blockedDomains`],e=>{N(e.blockedDomains||[])})}function N(e){let t=document.getElementById(`domainBlocklistList`);t&&(e.length===0?t.innerHTML=`<div class="domain-blocklist-empty">暂无屏蔽域名，在上方输入域名添加</div>`:t.innerHTML=e.map(e=>`
      <div class="domain-blocklist-item">
        <span class="domain-blocklist-item-name" title="${M(e)}">${M(e)}</span>
        <button class="domain-blocklist-item-remove" data-domain="${M(e)}" title="取消屏蔽">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
    `).join(``))}function de(e,t){if(e=e.trim().toLowerCase(),!e){t&&t({error:`域名不能为空`});return}if(!e.includes(`.`)){t&&t({error:`请输入有效的域名，例如 example.com`});return}chrome.storage.local.get([`blockedDomains`],n=>{let r=n.blockedDomains||[];if(r.includes(e)){t&&t({error:`该域名已存在`});return}r.push(e),chrome.storage.local.set({blockedDomains:r},()=>{N(r),t&&t({})})})}function fe(e){chrome.storage.local.get([`blockedDomains`],t=>{let n=(t.blockedDomains||[]).filter(t=>t!==e);chrome.storage.local.set({blockedDomains:n},()=>{N(n)})})}var P=`apiBase.modelName.customModels.systemPrompt.enableImageInput.imageModelName.imageModels.imageApiBase.reactMaxIterations.reactApiTimeout.reactLoopTimeout.reactToolTimeout.reactClarifyTimeout.reactApiRetryCount.reactApiRetryBaseDelay.enableToolPreselect.preselectMinToolCount.toolConfirmationEnabled.reflectionConfig.chatMaxInputHistory.chatMaxHistoryMessages.chatMaxMessageLength.chatMaxMemoryMessages.enableExecutionLog.chatContextWindow.toolbarTools.toolbarMaxVisible.toolbarIconOnly.enableSelectionToolbar.blockedDomains.streamEnabled.streamChunkDelay.customAgents.activeAgentId.temperature.topP.selectedTempIndex.customPrompts.agentUrl.agentPlatform.agentStreamEnabled.enableTools.isolateChat.enableSelectionQuery.deletedPresetModels.mcpEnabled.skillsEnabled`.split(`.`),F=[`apiKey`,`imageApiKey`,`agentToken`];async function pe(e){let t=e?[...P,...F]:P;return new Promise(e=>{chrome.storage.local.get(null,n=>{let r={};for(let e of t)n[e]!==void 0&&(r[e]=n[e]);for(let e of Object.keys(n))e.startsWith(`agentEnabledTools_`)&&(r[e]=n[e]);e(r)})})}async function me(){let e=document.getElementById(`exportIncludeSecrets`)?.checked||!1;try{let t=await pe(e),n={version:1,app:`ai-helper`,exportedAt:new Date().toISOString(),includeSecrets:e,config:t},r=new Date,i=`ai-helper-config-${r.getFullYear()+String(r.getMonth()+1).padStart(2,`0`)+String(r.getDate()).padStart(2,`0`)+`-`+String(r.getHours()).padStart(2,`0`)+String(r.getMinutes()).padStart(2,`0`)+String(r.getSeconds()).padStart(2,`0`)}.json`,a=JSON.stringify(n,null,2),o=new Blob([a],{type:`application/json;charset=utf-8;`}),s=URL.createObjectURL(o),c=document.createElement(`a`);c.href=s,c.download=i,document.body.appendChild(c),c.click(),document.body.removeChild(c),URL.revokeObjectURL(s),I(),z(`配置已导出`,`success`)}catch(e){console.error(`[Options] 导出配置失败:`,e),z(`导出失败: `+e.message,`error`)}}function he(){let e=document.getElementById(`exportConfigModal`);e&&(e.style.display=`flex`)}function I(){let e=document.getElementById(`exportConfigModal`);e&&(e.style.display=`none`)}function L(e){let t=e.config||e,n=Object.keys(t).length,r=e.exportedAt?new Date(e.exportedAt).toLocaleString(`zh-CN`):`未知`,i=document.getElementById(`importSummary`);i&&(i.textContent=`导出时间: ${r}，包含 ${n} 项配置`);let a=document.getElementById(`importConfigModal`);a&&(a.dataset.importData=JSON.stringify(e),a.style.display=`flex`)}function R(){let e=document.getElementById(`importConfigModal`);e&&(e.style.display=`none`)}function ge(){let e=document.getElementById(`importConfigFile`);e&&(e.value=``,e.click())}function _e(e){if(!e||typeof e!=`object`)return{valid:!1,error:`无效的文件格式`};let t;if(e.version&&e.config&&typeof e.config==`object`)t=e.config;else if(e.apiBase||e.modelName!==void 0)t=e;else return{valid:!1,error:`无法识别的配置格式`};for(let e of Object.keys(t))if(!P.includes(e)&&!F.includes(e)&&!e.startsWith(`agentEnabledTools_`))return{valid:!1,error:`未知的配置项: ${e}`};return{valid:!0}}async function ve(e){try{let t=await e.text(),n=JSON.parse(t),r=_e(n);if(!r.valid){z(`导入失败: `+r.error,`error`);return}L(n)}catch(e){console.error(`[Options] 导入文件解析失败:`,e),z(`导入失败: 无法解析文件格式`,`error`)}}async function ye(){let e=document.getElementById(`importConfigModal`);if(!e)return;let t=e.dataset.importData;if(t)try{let e=JSON.parse(t),n=e.config||e;document.getElementById(`importStrategyReplace`)?.checked,await new Promise(e=>{chrome.storage.local.set(n,e)}),R(),z(`已导入 ${Object.keys(n).length} 项配置`,`success`),setTimeout(()=>{E(()=>{re().then(()=>{typeof updateToolbarUI==`function`&&updateToolbarUI()}),ue()})},300)}catch(e){console.error(`[Options] 导入配置失败:`,e),z(`导入失败: `+e.message,`error`)}}function be(){let e=document.getElementById(`exportConfigCloseBtn`),t=document.getElementById(`exportConfigCancelBtn`),n=document.getElementById(`exportConfigOkBtn`),r=document.getElementById(`exportConfigModal`);e&&e.addEventListener(`click`,I),t&&t.addEventListener(`click`,I),n&&n.addEventListener(`click`,me),r&&r.addEventListener(`click`,e=>{e.target===r&&I()});let i=document.getElementById(`importConfigCloseBtn`),a=document.getElementById(`importConfigCancelBtn`),o=document.getElementById(`importConfigOkBtn`),s=document.getElementById(`importConfigModal`);i&&i.addEventListener(`click`,R),a&&a.addEventListener(`click`,R),o&&o.addEventListener(`click`,ye),s&&s.addEventListener(`click`,e=>{e.target===s&&R()})}function z(e,t=`info`){let n=document.getElementById(`toastContainer`);if(!n)return;let r=document.createElement(`div`);r.className=`toast ${t}`,r.textContent=e,n.appendChild(r),requestAnimationFrame(()=>r.classList.add(`toast-show`)),setTimeout(()=>{r.classList.remove(`toast-show`),setTimeout(()=>{r.parentNode&&r.parentNode.removeChild(r)},300)},3e3)}var B=null,V=null,H=!1,U=[],W=null;function G(e,t=`确认操作`){return new Promise(n=>{let r=document.createElement(`div`);r.className=`modal-overlay`,r.innerHTML=`
      <div class="modal-content" style="max-width: 400px;">
        <div class="modal-header">
          <h3>${Q(t)}</h3>
        </div>
        <div class="modal-body">
          <p>${Q(e)}</p>
        </div>
        <div class="modal-actions">
          <button class="btn btn-cancel" id="confirmCancelBtn">取消</button>
          <button class="btn btn-primary" id="confirmOkBtn" style="width: auto;">确定</button>
        </div>
      </div>
    `,document.body.appendChild(r);let i=e=>{r.remove(),n(e)};r.querySelector(`#confirmCancelBtn`).addEventListener(`click`,()=>i(!1)),r.querySelector(`#confirmOkBtn`).addEventListener(`click`,()=>i(!0)),r.addEventListener(`click`,e=>{e.target===r&&i(!1)})})}function xe(e,t){let n=document.getElementById(`agentSkillViewerModal`);n&&n.remove();let r=document.createElement(`div`);r.className=`modal-overlay`,r.id=`agentSkillViewerModal`;let i=document.createElement(`div`);i.className=`modal-content agent-skill-editor-container`,i.style.width=`700px`,i.style.maxHeight=`85vh`,i.innerHTML=`
    <div class="modal-header">
      <h3>查看 Skill: ${Q(e)}</h3>
      <button class="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>名称</label>
        <input type="text" value="${Q(t.frontmatter?.name||t.name||``)}" readonly style="background:#f5f5f5;color:#666;">
      </div>
      <div class="form-group">
        <label>描述</label>
        <input type="text" value="${Q(t.frontmatter?.description||``)}" readonly style="background:#f5f5f5;color:#666;">
      </div>
      <div class="form-group">
        <label>版本</label>
        <input type="text" value="${Q(t.frontmatter?.version||`1.0`)}" readonly style="background:#f5f5f5;color:#666;">
      </div>
      <div class="form-group">
        <label>SKILL.md 内容（只读）</label>
        <textarea readonly style="min-height: 350px; font-family: monospace; background:#f5f5f5; color:#666; resize: vertical;">${Q(t.markdown||``)}</textarea>
      </div>
      ${t.resources&&t.resources.length>0?`
      <div class="form-group">
        <label>资源文件</label>
        <div class="skill-resource-list">
          ${t.resources.map(e=>`<span class="skill-resource-tag">📄 ${Q(e.name||e)}</span>`).join(``)}
        </div>
      </div>`:``}
    </div>
    <div class="modal-actions">
      <button class="btn btn-primary" id="closeAgentSkillViewerBtn" style="width: auto;">关闭</button>
    </div>
  `,r.appendChild(i),document.body.appendChild(r);let a=()=>r.remove();r.querySelector(`.modal-close-btn`).addEventListener(`click`,a),r.querySelector(`#closeAgentSkillViewerBtn`).addEventListener(`click`,a)}async function K(){let e=await chrome.storage.local.get([`agentUrl`,`agentToken`]);return B=e.agentUrl||null,V=e.agentToken||null,H=!!(B&&V),{url:B,token:V,connected:H}}async function q(e,t,n=null){let r={method:e,headers:{"Content-Type":`application/json`,Authorization:`Bearer ${V}`}};return n&&(r.body=JSON.stringify(n)),(await fetch(`${B}${t}`,r)).json()}async function Se(){if(await K(),!H)return{servers:[]};try{return await q(`GET`,`/api/mcp/servers`)}catch{return{servers:[]}}}function Ce(e){let t=document.getElementById(`mcpServerList`);if(t){if(U=e||[],!H){t.innerHTML=`
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🔌</div>
        <div class="toolbox-empty-title">代理未连接</div>
        <div class="toolbox-empty-desc">请先在「代理」Tab 中连接 Agent 服务后，再配置 MCP 服务器</div>
      </div>`;return}if(!e||e.length===0){t.innerHTML=`
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">📦</div>
        <div class="toolbox-empty-title">暂无 MCP 服务器</div>
        <div class="toolbox-empty-desc">点击下方按钮添加 MCP 服务器，扩展 AI 助手的工具能力</div>
      </div>`;return}t.innerHTML=e.map(e=>{if(e.id===W)return`
        <div class="mcp-server-card editing">
          <div class="mcp-add-form">
            <div class="mcp-add-form-row">
              <input type="text" id="mcpEditId" value="${Q(e.id)}" placeholder="服务器 ID" class="toolbox-input">
              <input type="text" id="mcpEditName" value="${Q(e.name||``)}" placeholder="显示名称" class="toolbox-input">
            </div>
            <div class="mcp-add-form-row">
              <input type="text" id="mcpEditCommand" value="${Q(e.command||``)}" placeholder="命令路径" class="toolbox-input" style="flex: 2;">
              <input type="text" id="mcpEditArgs" value="${Q((e.args||[]).join(` `))}" placeholder="参数，空格分隔" class="toolbox-input" style="flex: 3;">
            </div>
            <div class="mcp-env-section">
              <div class="mcp-env-header">
                <span class="mcp-env-title">环境变量</span>
                <span class="mcp-env-hint">（敏感值优先在宿主机 shell 配置中 export，此处仅用于 MCP 专用变量）</span>
              </div>
              <div class="mcp-env-rows" id="mcpEditEnvRows">
                ${we(e.env||{})}
              </div>
              <button type="button" class="toolbox-btn mcp-env-add-row" data-action="add-env-row" data-target="mcpEditEnvRows" style="font-size: 12px; padding: 2px 10px;">+ 添加变量</button>
            </div>
            <div class="mcp-add-form-actions">
              <button class="toolbox-btn toolbox-btn-cancel" data-mcp-id="${Q(e.id)}" data-action="cancel-edit">取消</button>
              <button class="toolbox-btn toolbox-btn-primary" data-mcp-id="${Q(e.id)}" data-action="save-edit">保存</button>
            </div>
          </div>
        </div>`;let t=e.connected?`connected`:`disconnected`,n=e.connected?`已连接`:`未连接`,r=e.connected?`🟢`:`🔴`,i=e.toolCount||0;return`
      <div class="mcp-server-card ${e.enabled===!1?`disabled`:`enabled`}">
        <div class="mcp-server-header">
          <div class="mcp-server-info">
            <span class="mcp-server-status ${t}" title="${n}">${r}</span>
            <span class="mcp-server-name">${Q(e.name||e.id)}</span>
            <span class="mcp-server-badge">${Q(e.transport||`stdio`)}</span>
          </div>
          <div class="mcp-server-tools-count">${i} 工具</div>
        </div>
        <div class="mcp-server-command">
          <code>${Q(e.command||``)} ${(e.args||[]).map(Q).join(` `)}</code>
        </div>
        ${e.tools&&e.tools.length>0?`
        <div class="mcp-tools-section">
          <button class="mcp-tools-toggle" data-mcp-id="${Q(e.id)}" data-action="toggle-tools">
            &#9654; 查看 ${e.tools.length} 个工具
          </button>
          <div class="mcp-tools-list" id="mcp-tools-${Q(e.id)}" style="display:none;">
            ${e.tools.map(e=>`
              <div class="mcp-tool-item">
                <div class="mcp-tool-name">${Q(e.name)}</div>
                <div class="mcp-tool-desc">${Q(e.description||``)}</div>
              </div>
            `).join(``)}
          </div>
        </div>`:``}
        <div class="mcp-server-actions">
          <label class="toolbox-toggle" title="${e.enabled===!1?`已禁用，点击启用`:`启用中，点击禁用`}">
            <input type="checkbox" ${e.enabled===!1?``:`checked`} data-mcp-id="${Q(e.id)}" data-action="toggle">
            <span class="toolbox-toggle-slider"></span>
          </label>
          ${e.connected?`<button class="toolbox-btn toolbox-btn-warn" data-mcp-id="${Q(e.id)}" data-action="disconnect">断开</button>`:`<button class="toolbox-btn toolbox-btn-primary" data-mcp-id="${Q(e.id)}" data-action="connect">连接</button>`}
          <button class="toolbox-btn toolbox-btn-edit" data-mcp-id="${Q(e.id)}" data-action="edit">编辑</button>
          <button class="toolbox-btn toolbox-btn-danger" data-mcp-id="${Q(e.id)}" data-action="delete">删除</button>
        </div>
      </div>`}).join(``)}}function we(e={}){let t=Object.entries(e);return t.length===0&&t.push([``,``]),t.map(([e,t])=>`
    <div class="mcp-env-row">
      <input type="text" class="mcp-env-key toolbox-input" placeholder="变量名" value="${Q(e)}" style="flex: 1;">
      <div class="mcp-env-value-wrap token-input-wrapper" style="flex: 2;">
        <input type="password" class="mcp-env-value token-input" placeholder="值" value="${Q(t)}">
        <button type="button" class="mcp-env-eye toggle-token-btn" title="显示/隐藏" data-action="toggle-env-eye">
          <svg class="icon-eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
            <circle cx="12" cy="12" r="3"></circle>
          </svg>
          <svg class="icon-eye-closed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
            <line x1="1" y1="1" x2="23" y2="23"></line>
          </svg>
        </button>
      </div>
      <button type="button" class="mcp-env-remove toolbox-btn toolbox-btn-danger" title="删除此行" data-action="remove-env-row" style="flex-shrink: 0;">×</button>
    </div>
  `).join(``)}function Te(e){let t={};return e.querySelectorAll(`.mcp-env-row`).forEach(e=>{let n=e.querySelector(`.mcp-env-key`)?.value.trim(),r=e.querySelector(`.mcp-env-value`)?.value;n&&r!==void 0&&(t[n]=r)}),Object.keys(t).length>0?t:{}}function Ee(e){let t=e.target.closest(`[data-action]`);if(!t)return!1;let n=t.dataset.action;if(n===`toggle-env-eye`){let e=t.closest(`.mcp-env-value-wrap`),n=e?.querySelector(`.mcp-env-value`),r=e?.querySelector(`.icon-eye-open`),i=e?.querySelector(`.icon-eye-closed`);return n&&(n.type===`password`?(n.type=`text`,r&&(r.style.display=`none`),i&&(i.style.display=`block`)):(n.type=`password`,r&&(r.style.display=`block`),i&&(i.style.display=`none`))),!0}if(n===`remove-env-row`)return t.closest(`.mcp-env-row`)?.remove(),!0;if(n===`add-env-row`){let e=t.dataset.target,n=e?document.getElementById(e):null;if(n){let e=document.createElement(`div`);e.className=`mcp-env-row`,e.innerHTML=`
        <input type="text" class="mcp-env-key toolbox-input" placeholder="变量名" style="flex: 1;">
        <div class="mcp-env-value-wrap token-input-wrapper" style="flex: 2;">
          <input type="password" class="mcp-env-value token-input" placeholder="值">
          <button type="button" class="mcp-env-eye toggle-token-btn" title="显示/隐藏" data-action="toggle-env-eye">
            <svg class="icon-eye-open" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
            <svg class="icon-eye-closed" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          </button>
        </div>
        <button type="button" class="mcp-env-remove toolbox-btn toolbox-btn-danger" title="删除此行" data-action="remove-env-row" style="flex-shrink: 0;">×</button>
      `,n.appendChild(e);let t=e.querySelector(`.mcp-env-key`);t&&setTimeout(()=>t.focus(),0)}return!0}return!1}function De(){let e=document.getElementById(`mcpAddForm`);e&&(e.innerHTML=`
    <div class="mcp-add-form">
      <div class="mcp-add-form-row">
        <input type="text" id="mcpAddId" placeholder="服务器 ID（唯一标识）" class="toolbox-input">
        <input type="text" id="mcpAddName" placeholder="显示名称" class="toolbox-input">
      </div>
      <div class="mcp-add-form-row">
        <input type="text" id="mcpAddCommand" placeholder="命令路径，如 npx、python" class="toolbox-input" style="flex: 2;">
        <input type="text" id="mcpAddArgs" placeholder="参数，空格分隔" class="toolbox-input" style="flex: 3;">
      </div>
      <div class="mcp-env-section">
        <div class="mcp-env-header">
          <span class="mcp-env-title">环境变量</span>
          <span class="mcp-env-hint">（敏感值优先在宿主机 shell 配置中 export，此处仅用于 MCP 专用变量）</span>
        </div>
        <div class="mcp-env-rows" id="mcpAddEnvRows">
          ${we()}
        </div>
        <button type="button" class="toolbox-btn mcp-env-add-row" data-action="add-env-row" data-target="mcpAddEnvRows" style="font-size: 12px; padding: 2px 10px;">+ 添加变量</button>
      </div>
      <div class="mcp-add-form-actions">
        <button class="toolbox-btn toolbox-btn-cancel" id="mcpAddCancel">取消</button>
        <button class="toolbox-btn toolbox-btn-primary" id="mcpAddConfirm">添加</button>
      </div>
    </div>`)}function Oe(){let e=document.getElementById(`mcpAddForm`);e&&(e.innerHTML=``)}async function ke(e){try{let t=await q(`POST`,`/api/mcp/servers`,e);if(t.success)return!0;throw Error(t.error||`添加失败`)}catch(e){throw e}}async function Ae(e){try{let t=await q(`DELETE`,`/api/mcp/servers`,{id:e});if(t.success)return!0;throw Error(t.error||`删除失败`)}catch(e){throw e}}async function je(e){let t=await q(`POST`,`/api/mcp/servers/connect`,{id:e});if(t.success)return t;throw Error(t.error||`连接失败`)}async function Me(e){let t=await q(`POST`,`/api/mcp/servers/disconnect`,{id:e});if(t.success)return!0;throw Error(t.error||`断开失败`)}async function Ne(e,t){let n=await q(`PUT`,`/api/mcp/servers/toggle`,{id:e,enabled:t});if(n.success)return!0;throw Error(n.error||`操作失败`)}async function Pe(){if(await K(),!H)return{skills:[]};try{return await q(`GET`,`/api/skill/list`)}catch{return{skills:[]}}}function Fe(e){let t=document.getElementById(`skillList`);if(!t)return;if(!H){t.innerHTML=`
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🔌</div>
        <div class="toolbox-empty-title">代理未连接</div>
        <div class="toolbox-empty-desc">请先在「代理」Tab 中连接 Agent 服务后，再管理 Skill</div>
      </div>`;return}if(!e||e.length===0){t.innerHTML=`
      <div class="toolbox-empty">
        <div class="toolbox-empty-icon">🧩</div>
        <div class="toolbox-empty-title">暂无 Skill</div>
        <div class="toolbox-empty-desc">
          支持两种 Skill 类型：<br>
          <strong>Workflow Skill</strong>：导入 JSON 文件（确定性自动化流程）<br>
          <strong>Agent Skill</strong>：导入 SKILL.md 目录/Zip/URL（AI 能力扩展）
        </div>
      </div>`;return}let n=e.filter(e=>e.type!==`agent`),r=e.filter(e=>e.type===`agent`),i=``;n.length>0&&(i+=`<div class="skill-section-title">Workflow Skills（自动化流程）</div>`,i+=n.map(e=>`
      <div class="skill-card skill-card-workflow${e.enabled===!1?` skill-disabled`:``}">
        <div class="skill-card-header">
          <div class="skill-card-info">
            <span class="skill-card-icon">⚙️</span>
            <span class="skill-card-name">${Q(e.name)}</span>
            <span class="skill-card-version">v${Q(e.version||`1.0`)}</span>
            <span class="skill-card-badge badge-workflow">Workflow</span>
            ${e.enabled===!1?`<span class="skill-card-badge badge-disabled">已停用</span>`:``}
            <span class="skill-card-step-count">${e.stepCount||0} 步骤</span>
          </div>
        </div>
        <div class="skill-card-desc">${Q(e.description||``)}</div>
        <div class="skill-card-params">
          ${Ie(e.parameters)}
        </div>
        <div class="skill-card-actions">
          ${e.enabled===!1?``:`<button class="toolbox-btn toolbox-btn-primary" data-skill-name="${Q(e.name)}" data-action="run-skill">运行</button>`}
          <button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${Q(e.name)}" data-action="toggle-skill">${e.enabled===!1?`启用`:`停用`}</button>
          <button class="toolbox-btn toolbox-btn-danger" data-skill-name="${Q(e.name)}" data-action="delete-skill">删除</button>
        </div>
      </div>
    `).join(``)),r.length>0&&(i+=`<div class="skill-section-title">Agent Skills（AI 能力扩展）</div>`,i+=r.map(e=>{let t=e.builtin===!0,n=e.editable!==!1,r=e.deletable!==!1;return`
      <div class="skill-card skill-card-agent${e.enabled===!1?` skill-disabled`:``}">
        <div class="skill-card-header">
          <div class="skill-card-info">
            <span class="skill-card-icon">🤖</span>
            <span class="skill-card-name">${Q(e.name)}</span>
            <span class="skill-card-version">v${Q(e.version||`1.0`)}</span>
            <span class="skill-card-badge badge-agent">Agent</span>
            ${t?`<span class="skill-card-badge badge-builtin">内置</span>`:``}
            ${e.enabled===!1?`<span class="skill-card-badge badge-disabled">已停用</span>`:``}
            <span class="skill-card-step-count">${e.resourceCount||0} 资源</span>
          </div>
        </div>
        <div class="skill-card-desc">${Q(e.description||``)}</div>
        ${e.resources&&e.resources.length>0?`
        <div class="skill-card-params">
          ${e.resources.map(e=>`<span class="skill-param-tag" title="大小: ${e.size} 字节">📄 ${Q(e.name)}</span>`).join(``)}
        </div>`:``}
        <div class="skill-card-actions">
          ${n?`<button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${Q(e.name)}" data-action="edit-agent-skill">编辑 SKILL.md</button>`:`<button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${Q(e.name)}" data-action="view-agent-skill">查看详情</button>`}
          <button class="toolbox-btn toolbox-btn-secondary" data-skill-name="${Q(e.name)}" data-action="toggle-skill">${e.enabled===!1?`启用`:`停用`}</button>
          ${r?`<button class="toolbox-btn toolbox-btn-danger" data-skill-name="${Q(e.name)}" data-action="delete-skill">删除</button>`:``}
        </div>
      </div>
    `}).join(``)),t.innerHTML=i}function Ie(e){if(!e||!e.properties)return``;let t=e.properties,n=e.required||[];return Object.entries(t).map(([e,t])=>{let r=n.includes(e);return`<span class="skill-param-tag ${r?`required`:``}" title="${Q(t.description||``)}">${Q(e)}${r?`*`:``}</span>`}).join(``)}async function Le(e){let t=await q(`POST`,`/api/skill/import`,e);if(t.success)return!0;throw Error(t.error||`导入失败`)}async function Re(e){let t=await q(`DELETE`,`/api/skill/delete`,{name:e});if(t.success)return!0;throw Error(t.error||`删除失败`)}async function ze(e){let t=await q(`POST`,`/api/skill/toggle`,{name:e});if(t.success)return t.enabled!==!1;throw Error(t.error||`操作失败`)}async function Be(e,t={}){return await q(`POST`,`/api/skill/run`,{name:e,params:t})}function Ve(e){let t=e.parameters||{},n=t.properties||{},r=Array.isArray(t.required)?t.required:[],i=Object.entries(n);return{hasRequired:i.length>0,required:i.filter(([e])=>r.includes(e)),optional:i.filter(([e])=>!r.includes(e)),all:i}}function He(e,t){return new Promise(n=>{let r=document.createElement(`div`);r.className=`modal-overlay`;let i=t.required.map(([e,t])=>`
      <div class="form-group">
        <label for="skill-param-${e}">${Q(t.description||e)} <span class="param-required">*必填</span></label>
        <input type="text" id="skill-param-${e}" class="form-input"
               placeholder="${Q(t.type||`string`)}${t.default===void 0?``:` (默认: `+t.default+`)`}" />
      </div>
    `).join(``),a=t.optional.map(([e,t])=>`
      <div class="form-group">
        <label for="skill-param-${e}">${Q(t.description||e)} <span class="param-optional">选填</span></label>
        <input type="text" id="skill-param-${e}" class="form-input"
               placeholder="${Q(t.type||`string`)}${t.default===void 0?``:` (默认: `+t.default+`)`}" />
      </div>
    `).join(``);r.innerHTML=`
      <div class="modal-content" style="max-width:500px;">
        <div class="modal-header">
          <h2>运行 Skill "${Q(e)}"</h2>
          <button class="modal-close-btn" id="skillParamsCancel">×</button>
        </div>
        <div class="modal-body">
          <p style="margin:0 0 16px;color:#666;font-size:13px;">请填写以下参数后运行：</p>
          ${i}
          ${t.required.length>0&&t.optional.length>0?`<div style="border-top:1px dashed #e0e0e0;margin:12px 0;"></div>`:``}
          ${a}
        </div>
        <div class="modal-actions">
          <button class="btn btn-cancel" id="skillParamsCancel">取消</button>
          <button class="btn btn-primary" id="skillParamsSubmit">运行</button>
        </div>
      </div>
    `,document.body.appendChild(r);let o=()=>{r.remove(),n(null)};r.addEventListener(`click`,e=>{e.target===r&&o()}),r.querySelectorAll(`#skillParamsCancel`).forEach(e=>{e.addEventListener(`click`,o)}),r.querySelector(`#skillParamsSubmit`).addEventListener(`click`,()=>{let e={},i=!0;for(let[n,a]of t.required){let t=r.querySelector(`#skill-param-${n}`),a=t?.value?.trim();a?(e[n]=a,t&&(t.style.borderColor=``)):(i=!1,t&&(t.style.borderColor=`#e53e3e`))}for(let[n]of t.optional){let t=r.querySelector(`#skill-param-${n}`);t&&(e[n]=t.value)}i&&(r.remove(),n(e))}),r.addEventListener(`keydown`,e=>{e.key===`Enter`&&r.querySelector(`#skillParamsSubmit`).click()});let s=r.querySelector(`input`);s&&setTimeout(()=>s.focus(),100)})}function Ue(e,t,n){let r=document.createElement(`div`);r.className=`modal-overlay`,r.id=`skillResultModal`;let i=t?.success&&t.skill?.steps||[],a={};i.forEach(e=>{a[e.id]=e});let o=n.results||{},s=Object.keys(o),c=``,l=0,u=0,d=0;c=s.length===0?`<div style="padding:16px;text-align:center;color:#999;">${n.error||`无执行结果`}</div>`:s.map((e,t)=>{let n=o[e],r=a[e]||{},i=r.name||r.description||e,s=r.tool||``,c=n?.success,f=n?.skipped;f?d++:c?l++:u++;let p=f?`⊘`:c?`✓`:`✗`,m=f?`step-skipped`:c?`step-success`:`step-error`,h=f?n.message||`条件不满足，已跳过`:c?n.content||n.stdout||n.message||`执行成功`:n.error||`执行失败`,g=h.length>500?h.substring(0,500)+`\n... (共 ${h.length} 字符，已截断)`:h;return`
        <div class="skill-run-step ${m}">
          <div class="step-header">
            <span class="step-status-icon">${p}</span>
            <span class="step-title">${Q(i)}</span>
            ${s?`<span class="step-tool-tag">${Q(s)}</span>`:``}
          </div>
          <pre class="step-output">${Q(g)}</pre>
        </div>
      `}).join(``);let f=n.success?`✓`:`✗`,p=n.success?`执行完成`:`执行失败`,m=n.success?`${l} 成功, ${u} 失败, ${d} 跳过`:n.error||`未知错误`;r.innerHTML=`
    <div class="modal-content" style="max-width:700px;max-height:85vh;">
      <div class="modal-header">
        <h2>${f} Skill "${Q(e)}" ${p}</h2>
        <button class="modal-close-btn" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body" style="max-height:calc(85vh - 120px);overflow-y:auto;">
        <div class="skill-run-summary">${Q(m)}</div>
        ${c}
      </div>
      <div class="modal-actions">
        <button class="btn btn-primary modal-close-btn">关闭</button>
      </div>
    </div>
  `,document.body.appendChild(r),r.addEventListener(`click`,e=>{(e.target===r||e.target.classList.contains(`modal-close-btn`))&&r.remove()})}async function We(){return await q(`POST`,`/api/skill/reload`)}async function Ge(e){return await q(`GET`,`/api/skill/markdown?name=${encodeURIComponent(e)}`)}function Ke(e,t=null){let n=document.getElementById(`agentSkillEditorModal`);n&&n.remove();let r=!!t,i=document.createElement(`div`);i.className=`modal-overlay`,i.id=`agentSkillEditorModal`;let a=document.createElement(`div`);a.className=`modal-content agent-skill-editor-container`,a.style.width=`700px`,a.style.maxHeight=`85vh`,a.innerHTML=`
    <div class="modal-header">
      <h3>${r?`编辑 Agent Skill`:`新建 Agent Skill`}</h3>
      <button class="modal-close-btn">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>Skill 名称</label>
        <input type="text" id="agentSkillName" placeholder="e.g. code-review" value="${Q(r?t.name:``)}" ${r?`readonly`:``}>
      </div>
      <div class="form-group">
        <label>描述</label>
        <input type="text" id="agentSkillDesc" placeholder="简要描述此 Skill 的功能" value="${Q(r&&t.frontmatter?.description||``)}">
      </div>
      <div class="form-group">
        <label>版本</label>
        <input type="text" id="agentSkillVersion" placeholder="1.0" value="${Q(r&&t.frontmatter?.version||`1.0`)}">
      </div>
      <div class="form-group">
        <label>SKILL.md 内容（Markdown）</label>
        <textarea id="agentSkillMarkdown" style="min-height: 300px; font-family: monospace;" placeholder="# Skill 名称&#10;&#10;## 何时使用&#10;- 条件1&#10;- 条件2&#10;&#10;## 执行步骤&#10;1. 步骤1&#10;2. 步骤2">${Q(r&&t.markdown||``)}</textarea>
      </div>
      ${r&&t.resources&&t.resources.length>0?`
      <div class="form-group">
        <label>已有资源文件</label>
        <div class="skill-resource-list">
          ${t.resources.map(e=>`<span class="skill-resource-tag">📄 ${Q(e.name)} (${e.size} 字节)</span>`).join(``)}
        </div>
      </div>`:``}
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="cancelAgentSkillBtn">取消</button>
      <button class="btn btn-primary" id="saveAgentSkillBtn" style="width: auto;">保存</button>
    </div>
  `,i.appendChild(a),document.body.appendChild(i);let o=()=>i.remove();i.querySelector(`.modal-close-btn`).addEventListener(`click`,o),i.querySelector(`#cancelAgentSkillBtn`).addEventListener(`click`,o),i.querySelector(`#saveAgentSkillBtn`).addEventListener(`click`,async()=>{let e=i.querySelector(`#agentSkillName`).value.trim(),n=i.querySelector(`#agentSkillDesc`).value.trim(),a=i.querySelector(`#agentSkillVersion`).value.trim()||`1.0`,s=i.querySelector(`#agentSkillMarkdown`).value.trim(),c=r?t.frontmatter?.enabled!==!1:!0;if(!e)return D(`请输入 Skill 名称`,`error`);if(!s)return D(`请输入 SKILL.md 内容`,`error`);try{let t=await q(`POST`,`/api/skill/save-markdown`,{name:e,description:n,version:a,markdown:s,enabled:c});t.success?(D(`Agent Skill "${e}" 保存成功`,`success`),o(),Y()):D(t.error||`保存失败`,`error`)}catch(e){D(`保存失败: `+e.message,`error`)}})}function qe(){let e=document.getElementById(`skillImportModal`);e&&e.remove();let t=document.createElement(`div`);t.className=`modal-overlay`,t.id=`skillImportModal`;let n=document.createElement(`div`);n.className=`modal-content`,n.style.width=`640px`,n.innerHTML=`
    <div class="modal-header">
      <h3>导入 Skill</h3>
      <button class="modal-close-btn">&times;</button>
    </div>
    <div style="padding: 0 24px 8px 24px;">
      <div class="import-tabs">
        <button class="import-tab active" data-tab="json">JSON 导入</button>
        <button class="import-tab" data-tab="markdown">新建编写</button>
        <button class="import-tab" data-tab="zip">Zip 包</button>
        <button class="import-tab" data-tab="url">URL 导入</button>
      </div>

      <!-- JSON Import -->
      <div class="import-panel active" data-panel="json">
        <div class="import-panel-desc">导入 JSON 格式的 Workflow Skill（确定性自动化流程）</div>
        <div class="upload-drop-zone" id="jsonDropZone">
          <span class="upload-icon">📄</span>
          <span class="upload-text">点击选择 JSON 文件或拖拽到此处</span>
          <span class="upload-hint">支持 .json 格式的 Workflow Skill 定义文件</span>
          <input type="file" id="skillJsonFile" accept=".json">
        </div>
      </div>

      <!-- Agent Skill Markdown -->
      <div class="import-panel" data-panel="markdown">
        <div class="import-panel-desc">直接编写 SKILL.md 内容，创建 Agent Skill（AI 能力扩展）</div>
        <div class="form-group">
          <label>Skill 名称</label>
          <input type="text" id="quickAgentName" placeholder="e.g. code-review 或 deploy-to-server">
        </div>
        <div class="form-group">
          <label>描述</label>
          <input type="text" id="quickAgentDesc" placeholder="简要描述此 Skill 的功能和适用场景">
        </div>
        <div class="form-group">
          <label>SKILL.md 内容（Markdown）</label>
          <textarea id="quickAgentMarkdown" style="min-height: 180px; font-family: 'SF Mono', 'Monaco', 'Menlo', monospace; font-size: 13px; line-height: 1.6;" placeholder="## 何时使用&#10;- 条件1&#10;- 条件2&#10;&#10;## 执行步骤&#10;1. 步骤1&#10;2. 步骤2"></textarea>
        </div>
      </div>

      <!-- Zip Import -->
      <div class="import-panel" data-panel="zip">
        <div class="import-panel-desc">导入包含 SKILL.md 的 Zip 压缩包，可附带 scripts/templates/assets 等辅助资源</div>
        <div class="upload-drop-zone" id="zipDropZone">
          <span class="upload-icon">📦</span>
          <span class="upload-text">点击选择 Zip 文件或拖拽到此处</span>
          <span class="upload-hint">Zip 包内需包含 SKILL.md 文件，可选的 scripts/ templates/ assets/ 子目录</span>
          <input type="file" id="skillZipFile" accept=".zip">
        </div>
      </div>

      <!-- URL Import -->
      <div class="import-panel" data-panel="url">
        <div class="import-panel-desc">从远程 URL 下载 Skill 的 Zip 包并自动导入</div>
        <div class="form-group">
          <label>下载地址</label>
          <div class="url-input-wrapper">
            <span class="url-input-icon">🔗</span>
            <input type="url" id="skillUrl" placeholder="https://example.com/skills/my-skill.zip">
          </div>
        </div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-cancel" id="cancelImportBtn">取消</button>
      <button class="btn btn-primary" id="confirmImportBtn" style="width: auto;">导入</button>
    </div>
  `,t.appendChild(n),document.body.appendChild(t);let r=()=>t.remove();t.querySelector(`.modal-close-btn`).addEventListener(`click`,r),t.querySelector(`#cancelImportBtn`).addEventListener(`click`,r),t.querySelectorAll(`.import-tab`).forEach(e=>{e.addEventListener(`click`,()=>{t.querySelectorAll(`.import-tab`).forEach(e=>e.classList.remove(`active`)),e.classList.add(`active`),t.querySelectorAll(`.import-panel`).forEach(e=>e.classList.remove(`active`)),t.querySelector(`[data-panel="${e.dataset.tab}"]`).classList.add(`active`)})});let i=(e,n)=>{let r=t.querySelector(e),i=t.querySelector(n);!r||!i||(r.addEventListener(`click`,()=>i.click()),r.addEventListener(`dragover`,e=>{e.preventDefault(),r.style.borderColor=`#667eea`,r.style.background=`#f5f7ff`}),r.addEventListener(`dragleave`,()=>{r.style.borderColor=`#d0d5dd`,r.style.background=`#fafbfc`}),r.addEventListener(`drop`,e=>{e.preventDefault(),r.style.borderColor=`#d0d5dd`,r.style.background=`#fafbfc`;let t=e.dataTransfer.files;t.length>0&&(i.files=t,a(r,t[0].name))}),i.addEventListener(`change`,()=>{i.files&&i.files[0]&&a(r,i.files[0].name)}))},a=(e,t)=>{e.classList.add(`has-file`);let n=e.querySelector(`.file-name`);n&&n.remove();let r=document.createElement(`span`);r.className=`file-name`,r.textContent=`✓ ${t}`,e.appendChild(r)};i(`#jsonDropZone`,`#skillJsonFile`),i(`#zipDropZone`,`#skillZipFile`),t.querySelector(`#confirmImportBtn`).addEventListener(`click`,async()=>{let e=t.querySelector(`.import-tab.active`)?.dataset.tab;try{if(e===`json`){let e=t.querySelector(`#skillJsonFile`).files[0];if(!e)return D(`请选择 JSON 文件`,`warning`);let n=await e.text(),r=JSON.parse(n);await Le(r),D(`Workflow Skill "${r.name}" 导入成功`,`success`)}else if(e===`markdown`){let e=t.querySelector(`#quickAgentName`).value.trim(),n=t.querySelector(`#quickAgentDesc`).value.trim(),r=t.querySelector(`#quickAgentMarkdown`).value.trim();if(!e)return D(`请输入 Skill 名称`,`warning`);if(!r)return D(`请输入 SKILL.md 内容`,`warning`);let i=await q(`POST`,`/api/skill/save-markdown`,{name:e,description:n,version:`1.0`,markdown:r});if(i.success)D(`Agent Skill "${e}" 创建成功`,`success`);else return D(i.error||`创建失败`,`error`)}else if(e===`zip`){let e=t.querySelector(`#skillZipFile`).files[0];if(!e)return D(`请选择 Zip 文件`,`warning`);if(e.size>50*1024*1024)return D(`文件过大，最大支持 50MB`,`warning`);let n=await q(`POST`,`/api/skill/import-zip`,{zipData:await new Promise((t,n)=>{let r=new FileReader;r.onload=()=>t(r.result.split(`,`)[1]),r.onerror=()=>n(Error(`文件读取失败`)),r.readAsDataURL(e)})});if(n.success)D(`Agent Skill "${n.skill?.name||`unknown`}" 导入成功`,`success`);else return D(n.error||`导入失败`,`error`)}else if(e===`url`){let e=t.querySelector(`#skillUrl`).value.trim();if(!e)return D(`请输入 URL`,`warning`);let n=await q(`POST`,`/api/skill/import-url`,{url:e});if(n.success)D(`Agent Skill "${n.skill?.name||`unknown`}" 导入成功`,`success`);else return D(n.error||`导入失败`,`error`)}r(),Y()}catch(e){D(`导入失败: `+e.message,`error`)}})}function J(){try{chrome.runtime.sendMessage({type:`RELOAD_MCP_TOOLS`},e=>{e?.success&&console.log(`[Toolbox] Background 已重载 ${e.count} 个 MCP 工具`)})}catch{}}async function Y(){let[e,t]=await Promise.all([Se(),Pe()]);Ce(e.servers||[]),Fe(t.skills||[]);let n=document.getElementById(`toolboxAgentStatus`);n&&(H?(n.innerHTML=`<span class="toolbox-status-dot connected"></span> 代理已连接 - 支持MCP和Skill`,n.className=`toolbox-agent-status connected`):(n.innerHTML=`<span class="toolbox-status-dot disconnected"></span> 代理未连接 — 请在「代理」Tab 中连接`,n.className=`toolbox-agent-status disconnected`));let r=!H,i=document.getElementById(`addMcpServerBtn`),a=document.getElementById(`importSkillBtn`),o=document.getElementById(`reloadSkillsBtn`);i&&(i.disabled=r),a&&(a.disabled=r),o&&(o.disabled=r)}function Je(e){U.find(t=>t.id===e)&&(W=e,document.getElementById(`mcpServerList`)&&Ce(U))}function Ye(){W=null,Ce(U)}async function Xe(){let e=document.getElementById(`mcpEditId`),t=document.getElementById(`mcpEditName`),n=document.getElementById(`mcpEditCommand`),r=document.getElementById(`mcpEditArgs`),i=e?.value.trim(),a=t?.value.trim(),o=n?.value.trim(),s=r?.value.trim();if(!i||!o){Z(`请填写服务器 ID 和命令路径`,`warning`);return}let c={id:i,name:a||i,command:o,args:s?s.split(/\s+/):[],env:Te(document.getElementById(`mcpEditEnvRows`)),enabled:U.find(e=>e.id===W)?.enabled!==!1};try{if(await ke(c),U.find(e=>e.id===W)?.connected){Z(`正在重新连接...`,`info`),await Me(W),await new Promise(e=>setTimeout(e,500));let e=await je(i);e.success?Z(`MCP 服务器更新成功，已重连（${e.toolCount||0} 工具）`,`success`):Z(`配置已更新，但重连失败: ${e.error||`未知错误，请检查命令与参数是否正确`}`,`warning`)}else Z(`MCP 服务器更新成功`,`success`);W=null,J(),await Y()}catch(e){Z(`更新失败: ${e.message}`,`error`)}}function X(e,t){let n=document.getElementById(e===`mcp`?`mcpToggleLabel`:`skillToggleLabel`),r=document.getElementById(e===`mcp`?`mcpSection`:`skillSection`);n&&(n.textContent=t?`已启用`:`已停用`,n.style.color=t?`#666`:`#999`),r&&(t?r.classList.remove(`disabled-section`):r.classList.add(`disabled-section`))}function Ze(){let e=document.getElementById(`mcpGlobalToggle`),t=document.getElementById(`skillGlobalToggle`);document.getElementById(`mcpToggleLabel`),document.getElementById(`skillToggleLabel`),document.getElementById(`mcpSection`),document.getElementById(`skillSection`),chrome.storage.local.get([`mcpEnabled`,`skillsEnabled`],n=>{let r=n.mcpEnabled!==!1,i=n.skillsEnabled!==!1;e&&(e.checked=r),t&&(t.checked=i),X(`mcp`,r),X(`skill`,i)}),e&&e.addEventListener(`change`,()=>{let t=e.checked;chrome.storage.local.set({mcpEnabled:t}),X(`mcp`,t),Z(`MCP 服务已${t?`启用`:`停用`}`,`info`)}),t&&t.addEventListener(`change`,()=>{let e=t.checked;chrome.storage.local.set({skillsEnabled:e}),X(`skill`,e),Z(`Skill 服务已${e?`启用`:`停用`}`,`info`)});let n=document.getElementById(`addMcpServerBtn`);n&&n.addEventListener(`click`,()=>{let e=document.getElementById(`mcpAddForm`);e&&e.innerHTML.trim()?Oe():De()});let r=document.getElementById(`mcpAddForm`);r&&r.addEventListener(`click`,async e=>{if(!Ee(e)&&(e.target.id===`mcpAddCancel`&&Oe(),e.target.id===`mcpAddConfirm`)){let e=document.getElementById(`mcpAddId`)?.value.trim(),t=document.getElementById(`mcpAddName`)?.value.trim(),n=document.getElementById(`mcpAddCommand`)?.value.trim(),r=document.getElementById(`mcpAddArgs`)?.value.trim();if(!e||!n){Z(`请填写服务器 ID 和命令路径`,`warning`);return}let i=document.getElementById(`mcpAddEnvRows`),a={id:e,name:t||e,command:n,args:r?r.split(/\s+/):[],env:i?Te(i):{},enabled:!0};try{await ke(a),Z(`MCP 服务器添加成功`,`success`),Oe(),J(),await Y()}catch(e){Z(`添加失败: ${e.message}`,`error`)}}});let i=document.getElementById(`mcpServerList`);i&&i.addEventListener(`click`,async e=>{if(Ee(e))return;let t=e.target.closest(`button, input`);if(!t)return;let n=t.dataset.action,r=t.dataset.mcpId;if(!(!n||!r))try{if(n===`connect`)Z(`正在连接...`,`info`),await je(r),Z(`连接成功`,`success`),J(),await Y();else if(n===`disconnect`)await Me(r),Z(`已断开连接`,`success`),J(),await Y();else if(n===`toggle`){let e=t.checked;await Ne(r,e),Z(e?`已启用`:`已禁用`,`success`),J(),await Y()}else if(n===`delete`){if(!await G(`确定要删除该 MCP 服务器吗？`,`删除确认`))return;await Ae(r),Z(`删除成功`,`success`),J(),await Y()}else if(n===`edit`)Je(r);else if(n===`cancel-edit`)Ye();else if(n===`save-edit`)await Xe();else if(n===`toggle-tools`){let e=document.getElementById(`mcp-tools-${r}`),n=t;if(e){let t=e.style.display===`none`;e.style.display=t?`block`:`none`,n.innerHTML=t?`&#9660; 收起 ${e.children.length} 个工具`:`&#9654; 查看 ${e.children.length} 个工具`}}}catch(e){Z(`操作失败: ${e.message}`,`error`)}});let a=document.getElementById(`skillList`);a&&a.addEventListener(`click`,async e=>{let t=e.target.closest(`button`);if(!t)return;let n=t.dataset.action,r=t.dataset.skillName;if(!(!n||!r))try{if(n===`delete-skill`){if(!await G(`确定要删除 Skill "${r}" 吗？`,`删除确认`))return;await Re(r),Z(`删除成功`,`success`),await Y()}else if(n===`toggle-skill`)Z(`已${await ze(r)?`启用`:`停用`} Skill "${r}"`,`success`),await Y();else if(n===`run-skill`){let e=await q(`GET`,`/api/skill/detail?name=${encodeURIComponent(r)}`);if(!e?.success||!e.skill){Z(`获取 Skill 信息失败: ${e?.error||`未知错误`}`,`error`);return}let t=Ve(e.skill);if(t.hasRequired){let n=await He(r,t);if(n===null)return;Z(`正在运行 Skill "${r}"...`,`info`),Ue(r,e,await Be(r,n))}else Z(`正在运行 Skill "${r}"...`,`info`),Ue(r,e,await Be(r))}else if(n===`edit-agent-skill`)try{let e=await Ge(r);e.success?Ke(r,e):Z(e.error||`获取 Skill 内容失败`,`error`)}catch(e){Z(`获取失败: ${e.message}`,`error`)}else if(n===`view-agent-skill`)try{let e=await Ge(r);e.success?xe(r,e):Z(e.error||`获取 Skill 内容失败`,`error`)}catch(e){Z(`获取失败: ${e.message}`,`error`)}}catch(e){Z(`操作失败: ${e.message}`,`error`)}});let o=document.getElementById(`importSkillBtn`);o&&o.addEventListener(`click`,()=>qe());let s=document.getElementById(`reloadSkillsBtn`);s&&s.addEventListener(`click`,async()=>{try{Z(`已重新加载 ${(await We()).count||0} 个 Skill`,`success`),await Y()}catch(e){Z(`重新加载失败: ${e.message}`,`error`)}}),Y()}function Z(e,t=`info`){let n=document.getElementById(`toastContainer`);if(!n)return;let r=document.createElement(`div`);r.className=`toast ${t}`,r.textContent=e,n.appendChild(r),requestAnimationFrame(()=>r.classList.add(`toast-show`)),setTimeout(()=>{r.classList.remove(`toast-show`),setTimeout(()=>r.remove(),300)},2500)}function Q(e){return e?String(e).replace(/&/g,`&amp;`).replace(/</g,`&lt;`).replace(/>/g,`&gt;`).replace(/"/g,`&quot;`).replace(/'/g,`&#39;`):``}var $=[];function Qe(e){document.querySelectorAll(`.tab-nav-btn`).forEach(e=>e.classList.remove(`active`)),document.querySelectorAll(`.tab-panel`).forEach(e=>e.classList.remove(`active`));let t=document.querySelector(`.tab-nav-btn[data-tab="${e}"]`),n=document.querySelector(`.tab-panel[data-tab="${e}"]`);t&&t.classList.add(`active`),n&&n.classList.add(`active`),window.location.hash!==`#`+e&&history.replaceState(null,``,`#`+e)}function $e(){let e=window.location.hash.replace(`#`,``);[`basic`,`toolbar`,`react`,`reflection`,`chat`,`agent`,`toolbox`].includes(e)&&Qe(e)}document.addEventListener(`DOMContentLoaded`,async function(){document.querySelectorAll(`.tab-nav-btn`).forEach(e=>{e.addEventListener(`click`,function(){Qe(this.dataset.tab)})}),$e(),window.addEventListener(`hashchange`,$e),E(),$=await re(),A($),document.getElementById(`saveBtn`).addEventListener(`click`,te);let e=document.getElementById(`modelInput`),t=document.getElementById(`modelDropdown`);e.addEventListener(`click`,function(e){e.stopPropagation(),t.classList.toggle(`show`)}),t.addEventListener(`click`,function(n){if(n.target.classList.contains(`delete-model-btn`)){n.stopPropagation();let e=n.target.closest(`.model-option`).dataset.value;g(e);return}let r=n.target.closest(`.model-option`);if(r){n.stopPropagation();let i=r.dataset.value;s(i),e.value=i,b(i),t.classList.remove(`show`)}}),document.addEventListener(`click`,function(n){!t.contains(n.target)&&n.target!==e&&t.classList.remove(`show`)});let r=document.getElementById(`addModelToggleBtn`),i=document.getElementById(`addModelForm`),a=document.getElementById(`addModelName`),o=document.getElementById(`addModelContextWindow`),c=document.getElementById(`confirmAddModelBtn`),u=document.getElementById(`cancelAddModelBtn`);r&&i&&(r.addEventListener(`click`,function(){let e=i.style.display!==`none`;i.style.display=e?`none`:``,r.textContent=e?`+ 添加模型`:`− 收起`,e||(a.value=``,o.value=``,a.focus())}),u.addEventListener(`click`,function(){i.style.display=`none`,r.textContent=`+ 添加模型`,a.value=``,o.value=``}),c.addEventListener(`click`,function(){let t=a.value.trim(),n=parseInt(o.value)||0;if(!t){D(`❌ 请输入模型名称`,`error`);return}h(t,n),e.value=t,s(t),b(t),chrome.storage.local.set({modelName:t}),i.style.display=`none`,r.textContent=`+ 添加模型`,a.value=``,o.value=``,D(`✅ 模型已添加`,`success`)}),a.addEventListener(`keydown`,function(e){e.key===`Enter`&&c.click()}),o.addEventListener(`keydown`,function(e){e.key===`Enter`&&c.click()}));let d=document.getElementById(`enableImageInput`),f=document.getElementById(`imageModelGroup`),p=document.getElementById(`imageApiGroup`),m=document.getElementById(`imageApiKeyGroup`);d&&f&&d.addEventListener(`change`,function(){f.style.display=this.checked?``:`none`,p&&(p.style.display=this.checked?``:`none`),m&&(m.style.display=this.checked?``:`none`),chrome.storage.local.set({enableImageInput:this.checked})});let _=document.getElementById(`imageModelInput`),v=document.getElementById(`imageModelDropdown`);_&&v&&(_.addEventListener(`click`,function(e){e.stopPropagation(),v.classList.toggle(`show`)}),v.addEventListener(`click`,function(e){if(e.target.classList.contains(`delete-model-btn`)){e.stopPropagation();let t=e.target.closest(`.model-option`).dataset.value;ee(t);return}let t=e.target.closest(`.model-option`);if(t){e.stopPropagation();let n=t.dataset.value;l(n),_.value=n,T(n),v.classList.remove(`show`)}}),document.addEventListener(`click`,function(e){!v.contains(e.target)&&e.target!==_&&v.classList.remove(`show`)}));let y=document.getElementById(`addImageModelToggleBtn`),x=document.getElementById(`addImageModelForm`),C=document.getElementById(`addImageModelName`),w=document.getElementById(`addImageModelContextWindow`),O=document.getElementById(`confirmAddImageModelBtn`),k=document.getElementById(`cancelAddImageModelBtn`);y&&x&&(y.addEventListener(`click`,function(){let e=x.style.display!==`none`;x.style.display=e?`none`:``,y.textContent=e?`+ 添加模型`:`− 收起`,e||(C.value=``,w.value=``,C.focus())}),k.addEventListener(`click`,function(){x.style.display=`none`,y.textContent=`+ 添加模型`,C.value=``,w.value=``}),O.addEventListener(`click`,function(){let e=C.value.trim(),t=parseInt(w.value)||0;if(!e){D(`❌ 请输入模型名称`,`error`);return}S(e,t),_.value=e,l(e),T(e),chrome.storage.local.set({imageModelName:e}),x.style.display=`none`,y.textContent=`+ 添加模型`,C.value=``,w.value=``,D(`✅ 图片模型已添加`,`success`)}),C.addEventListener(`keydown`,function(e){e.key===`Enter`&&O.click()}),w.addEventListener(`keydown`,function(e){e.key===`Enter`&&O.click()}));let ie=document.getElementById(`imageApiBase`);ie&&ie.addEventListener(`blur`,function(){chrome.storage.local.set({imageApiBase:this.value.trim()})});let M=document.getElementById(`imageApiKey`),N=document.getElementById(`toggleImageApiKeyBtn`);if(M&&M.addEventListener(`blur`,function(){chrome.storage.local.set({imageApiKey:this.value.trim()})}),M&&N){let e=N.querySelector(`.icon-eye-open`),t=N.querySelector(`.icon-eye-closed`);N.addEventListener(`click`,function(){M.type===`password`?(M.type=`text`,e.style.display=`none`,t.style.display=`block`):(M.type=`password`,e.style.display=`block`,t.style.display=`none`)})}let P=document.getElementById(`toggleToken`),F=document.getElementById(`apiKey`),pe=P.querySelector(`.icon-eye-open`),me=P.querySelector(`.icon-eye-closed`);P.addEventListener(`click`,function(){F.type===`password`?(F.type=`text`,pe.style.display=`none`,me.style.display=`block`):(F.type=`password`,pe.style.display=`block`,me.style.display=`none`)}),ne();let I=document.getElementById(`resetSystemPromptBtn`);I&&I.addEventListener(`click`,function(){document.getElementById(`systemPrompt`).value=n});let L=document.getElementById(`enableToolPreselect`),R=document.getElementById(`preselectMinToolCountSection`);if(L&&R){let e=()=>{R.style.display=L.checked?``:`none`};L.addEventListener(`change`,e),e()}document.getElementById(`toolbarMaxVisible`).addEventListener(`change`,function(){j()});let _e=document.getElementById(`toolbarIconOnly`);_e&&_e.addEventListener(`change`,function(){j()});let ye=document.getElementById(`enableSelectionToolbar`);ye&&ye.addEventListener(`change`,function(){j()}),document.getElementById(`toolbarToolsList`).addEventListener(`click`,function(e){let t=e.target.closest(`[data-action]`);if(!t)return;let n=t.dataset.action,r=parseInt(t.dataset.index);switch(n){case`moveUp`:$=ae($,r,-1),et();break;case`moveDown`:$=ae($,r,1),et();break;case`edit`:se($,r);break;case`delete`:$=oe($,r),et();break}}),document.getElementById(`addCustomToolBtn`).addEventListener(`click`,function(){se($,-1)}),document.getElementById(`domainAddBtn`).addEventListener(`click`,function(){let e=document.getElementById(`domainAddInput`);de(e.value,t=>{t.error?D(`❌ `+t.error,`error`):e.value=``})}),document.getElementById(`domainAddInput`).addEventListener(`keydown`,function(e){e.key===`Enter`&&de(this.value,e=>{e.error?D(`❌ `+e.error,`error`):this.value=``})}),document.getElementById(`domainBlocklistList`).addEventListener(`click`,function(e){let t=e.target.closest(`.domain-blocklist-item-remove`);t&&fe(t.dataset.domain)}),ue(),chrome.storage.onChanged.addListener((e,t)=>{t===`local`&&e.blockedDomains&&ue()}),document.getElementById(`toolEditCancel`).addEventListener(`click`,function(){ce()}),document.getElementById(`toolEditClose`).addEventListener(`click`,function(){ce()}),document.getElementById(`toolEditSave`).addEventListener(`click`,function(){let e=le($);if(e.error){D(`❌ `+e.error,`error`);return}$=e.tools,et()});let z=document.getElementById(`subtaskReflectionSection`);z&&z.addEventListener(`click`,function(e){e.target.closest(`.reflection-section-toggle`)||e.target.closest(`.reflection-config-item`)||this.classList.toggle(`collapsed`)});let B=document.getElementById(`reflectionEnabled`),V=document.getElementById(`reflectionConfig`);function H(){V&&(!B||!B.checked?V.classList.add(`disabled`):V.classList.remove(`disabled`))}function U(e,t){let n=document.getElementById(e),r=document.getElementById(t);!n||!r||(r.checked?n.classList.remove(`disabled`):n.classList.add(`disabled`))}B&&B.addEventListener(`change`,H);let W=document.getElementById(`postReflectionEnabled`);W&&W.addEventListener(`change`,function(){U(`postReflectionSection`,`postReflectionEnabled`)});let G=document.getElementById(`toolReflectionEnabled`);G&&G.addEventListener(`change`,function(){U(`toolReflectionSection`,`toolReflectionEnabled`)});let xe=document.getElementById(`subtaskReflectionEnabled`);xe&&xe.addEventListener(`change`,function(){U(`subtaskReflectionSection`,`subtaskReflectionEnabled`)}),H(),U(`postReflectionSection`,`postReflectionEnabled`),U(`toolReflectionSection`,`toolReflectionEnabled`),U(`subtaskReflectionSection`,`subtaskReflectionEnabled`);let K=document.getElementById(`streamEnabled`),q=document.getElementById(`streamChunkDelaySection`);K&&q&&(K.addEventListener(`change`,function(){q.style.display=K.checked?``:`none`}),q.style.display=K.checked?``:`none`),tt(),document.getElementById(`exportConfigBtn`).addEventListener(`click`,he),document.getElementById(`importConfigBtn`).addEventListener(`click`,ge),document.getElementById(`importConfigFile`).addEventListener(`change`,function(e){e.target.files&&e.target.files.length>0&&ve(e.target.files[0])}),be(),Ze(),document.querySelector(`[data-tab="toolbox"]`)?.addEventListener(`click`,()=>{Y()})});function et(){chrome.storage.local.set({toolbarTools:$},()=>{A($),j()})}function tt(){let e=document.getElementById(`agentUrl`),t=document.getElementById(`agentPairCode`),n=document.getElementById(`agentConnectBtn`),r=document.getElementById(`agentDisconnectBtn`);document.getElementById(`agentStatusDot`);let i=document.getElementById(`agentStatusText`),a=document.getElementById(`agentStatus`),o=document.getElementById(`pairCodeGroup`),s=document.getElementById(`disconnectGroup`),c=document.getElementById(`agentInfo`),l=document.getElementById(`agentWorkdir`),u=document.getElementById(`agentDetailToggle`),d=document.getElementById(`agentDetailPanel`);if(!e||!n)return;function f(e){if(e==null||e===0)return`无限制`;let t=[`B`,`KB`,`MB`,`GB`],n=0,r=e;for(;r>=1024&&n<t.length-1;)r/=1024,n++;return Math.round(r*10)/10+` `+t[n]}function p(e){return e==null||e===0?`无限制`:e<1e3?e+`ms`:e<6e4?(e/1e3).toFixed(0)+`s`:(e/6e4).toFixed(1)+` min`}function m(e){if(!d)return;let t=[];if(e.searchTools){let n=e.searchTools.fd?`✅`:`❌`,r=e.searchTools.rg?`✅`:`❌`;t.push(`<div class="detail-row"><span class="detail-label">搜索引擎</span><span class="detail-value">fd ${n} &nbsp; rg ${r}</span></div>`)}if(e.hostname&&t.push(`<div class="detail-row"><span class="detail-label">主机名</span><span class="detail-value">${h(e.hostname)}</span></div>`),e.shell&&t.push(`<div class="detail-row"><span class="detail-label">Shell</span><span class="detail-value">${h(e.shell)}</span></div>`),e.homeDir&&t.push(`<div class="detail-row"><span class="detail-label">用户目录</span><span class="detail-value">${h(e.homeDir)}</span></div>`),e.nodeVersion&&t.push(`<div class="detail-row"><span class="detail-label">Node.js</span><span class="detail-value">${h(e.nodeVersion)}</span></div>`),e.commandTimeout!=null&&t.push(`<div class="detail-row"><span class="detail-label">命令超时</span><span class="detail-value">${p(e.commandTimeout)}</span></div>`),e.fileMaxSize!=null&&t.push(`<div class="detail-row"><span class="detail-label">文件大小限制</span><span class="detail-value">${f(e.fileMaxSize)}</span></div>`),e.allowedPaths&&e.allowedPaths.length>0){let n=e.allowedPaths.map(e=>`<code>${h(e)}</code>`).join(`<br>`);t.push(`<div class="detail-row"><span class="detail-label">允许访问的目录</span><span class="detail-value">${n}</span></div>`)}e.pairCodeTTL!=null&&t.push(`<div class="detail-row"><span class="detail-label">配对码有效期</span><span class="detail-value">${e.pairCodeTTL}s</span></div>`),d.innerHTML=t.join(``),u.style.display=`block`}function h(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function g(e,t,n){a.className=`agent-status `+e,i.textContent=t,e===`connected`?(o.style.display=`none`,s.style.display=``,a.className=`agent-status connected`,n&&(c.style.display=``,n.workdir&&(l.innerHTML=`📁 工作目录: ${n.workdir}`),m(n))):e===`checking`?a.className=`agent-status checking`:(o.style.display=``,s.style.display=`none`,c.style.display=`none`,a.className=`agent-status disconnected`,u&&(u.style.display=`none`),d&&(d.innerHTML=``))}function _(e,t){return{version:t?.version||e?.version,platformName:e?.platformName,platform:e?.platform,arch:e?.arch,hostname:e?.hostname,shell:e?.shell,homeDir:e?.homeDir,nodeVersion:e?.nodeVersion,searchTools:e?.searchTools,workdir:t?.workdir||e?.workdir||``,allowedPaths:t?.allowedPaths||[],commandTimeout:t?.commandTimeout,fileMaxSize:t?.fileMaxSize,pairCodeTTL:t?.pairCodeTTL}}async function v(){g(`checking`,`正在检查连接...`);let t=await chrome.storage.local.get([`agentUrl`,`agentToken`]),n=t.agentUrl,r=t.agentToken;if(!n){g(`disconnected`,`未连接 - 请填入配对码完成配对`),e.value=`http://127.0.0.1:18910`;return}e.value=n;try{let e=await fetch(`${n}/api/status`);if(e.ok){let t=await e.json(),i={platformName:t.platformName||`Unknown`,platform:t.platform||`unknown`,arch:t.arch||`unknown`,shell:t.shell||`/bin/sh`,homeDir:t.homeDir||``,workdir:``,connected:!0};if(await chrome.storage.local.set({agentPlatform:i}),!r){g(`disconnected`,`Agent 在线 - 请填入配对码完成配对`);return}try{let e=await fetch(`${n}/api/status/detail`,{headers:{Authorization:`Bearer ${r}`}});if(e.ok){let n=await e.json();i.workdir=n.workdir||``,await chrome.storage.local.set({agentPlatform:i});let r=_(t,n),a=[`Agent v${r.version}`];r.platformName&&r.arch&&a.push(`${r.platformName} ${r.arch}`),r.nodeVersion&&a.push(`Node ${r.nodeVersion}`),g(`connected`,a.join(` | `),r)}else g(`disconnected`,`Token 已失效 - 请重新配对`)}catch{g(`disconnected`,`Token 已失效 - 请重新配对`)}}else g(`disconnected`,`连接失败 - Token 已失效，请重新配对`)}catch{await chrome.storage.local.remove(`agentPlatform`),g(`disconnected`,`无法连接到代理 - 请确认代理服务已启动`)}}async function y(){let r=e.value.trim()||`http://127.0.0.1:18910`,i=t.value.trim();if(!i||i.length!==4){D(`请输入4位配对码`,`warning`);return}g(`checking`,`正在配对...`),n.disabled=!0,n.textContent=`配对中...`;try{let e=await(await fetch(`${r}/api/pair`,{method:`POST`,headers:{"Content-Type":`application/json`},body:JSON.stringify({code:i,extensionId:chrome.runtime.id})})).json();if(e.success&&e.token){await chrome.storage.local.set({agentUrl:r,agentToken:e.token}),t.value=``,g(`connected`,`配对成功`),D(`✅ 配对成功！Agent 已连接`,`success`);try{let e=await fetch(`${r}/api/status`);if(e.ok){let t=await e.json(),n={platformName:t.platformName||`Unknown`,platform:t.platform||`unknown`,arch:t.arch||`unknown`,shell:t.shell||`/bin/sh`,homeDir:t.homeDir||``,workdir:t.workdir||``,connected:!0};await chrome.storage.local.set({agentPlatform:n}),console.log(`[Options] Agent 平台信息已保存:`,n)}}catch(e){console.warn(`[Options] 获取 Agent 平台信息失败:`,e)}try{let[t,n]=await Promise.all([fetch(`${r}/api/status`),fetch(`${r}/api/status/detail`,{headers:{Authorization:`Bearer ${e.token}`}})]);if(t.ok&&n.ok){let e=await t.json(),r=await n.json(),i=(await chrome.storage.local.get(`agentPlatform`)).agentPlatform||{};i.workdir=r.workdir||``,await chrome.storage.local.set({agentPlatform:i});let a=_(e,r),o=[`Agent v${a.version}`];a.platformName&&a.arch&&o.push(`${a.platformName} ${a.arch}`),a.nodeVersion&&o.push(`Node ${a.nodeVersion}`),g(`connected`,o.join(` | `),a)}}catch(e){console.warn(`[Options] 获取 Agent 详情失败:`,e)}chrome.runtime.sendMessage({type:`AGENT_CONNECTION_CHANGED`,connected:!0}).catch(()=>{})}else g(`disconnected`,`配对失败：`+(e.error||`未知错误`)),D(`❌ `+(e.error||`配对失败`),`error`)}catch(e){g(`disconnected`,`连接失败 - 请确认代理服务已启动`),D(`❌ 无法连接到 Agent: `+e.message,`error`)}finally{n.disabled=!1,n.textContent=`连接`}}async function b(){await chrome.storage.local.remove([`agentUrl`,`agentToken`,`agentPlatform`]),t.value=``,g(`disconnected`,`已断开连接`),D(`已断开 Agent 连接`,`info`),chrome.runtime.sendMessage({type:`AGENT_CONNECTION_CHANGED`,connected:!1}).catch(()=>{})}u&&d&&u.addEventListener(`click`,()=>{let e=getComputedStyle(d).display!==`none`;d.style.display=e?`none`:`block`,u.textContent=e?`▶ 详细信息`:`▼ 详细信息`,u.classList.toggle(`open`,!e)}),n.addEventListener(`click`,y),r.addEventListener(`click`,b),t.addEventListener(`keydown`,e=>{e.key===`Enter`&&y()}),v()}
//# sourceMappingURL=options-COAMqenK.js.map