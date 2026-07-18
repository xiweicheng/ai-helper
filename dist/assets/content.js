function e(t,n=document,r=5,i=0){if(i>r)return null;try{if(n.querySelectorAll)for(let a of n.querySelectorAll(`*`)){if(a.shadowRoot){let n=e(t,a.shadowRoot,r,i+1);if(n)return n}if(a.tagName===`IFRAME`||a.tagName===`FRAME`)try{let n=a.contentDocument||a.contentWindow?.document;if(n){let a=e(t,n,r,i+1);if(a)return a}}catch{}}let a=n.querySelector?.(t);if(a)return a}catch{}return null}function t(e,n=document,r=5,i=0,a=new Set){if(i>r)return[];try{n.querySelectorAll&&(n.querySelectorAll(e).forEach(e=>{a.add(e)}),n.querySelectorAll(`*`).forEach(n=>{if(n.shadowRoot&&t(e,n.shadowRoot,r,i+1,a),n.tagName===`IFRAME`||n.tagName===`FRAME`)try{let o=n.contentDocument||n.contentWindow?.document;o&&t(e,o,r,i+1,a)}catch{}}))}catch{}return Array.from(a)}function n(e=document,t=5,r=0){if(r>t)return{text:``,range:null};try{let i=e.getSelection?.();if(i&&!i.isCollapsed&&i.rangeCount>0){let e=i.toString().trim();if(e)return{text:e,range:i.getRangeAt(0),depth:r,source:`shadow`}}if(e.querySelectorAll){for(let i of e.querySelectorAll(`*`))if(i.shadowRoot){let e=n(i.shadowRoot,t,r+1);if(e.text)return e}}}catch{}return{text:``,range:null}}function r(e=document,t=5,n=0,i=new Set){if(n>t||i.has(e))return``;i.add(e);let a=``;try{e.body?a+=e.body.innerText||``:e instanceof ShadowRoot&&(a+=e.textContent||``),e.querySelectorAll&&e.querySelectorAll(`*`).forEach(e=>{if(e.shadowRoot&&(a+=`
`+r(e.shadowRoot,t,n+1,i)),e.tagName===`IFRAME`||e.tagName===`FRAME`)try{let o=e.contentDocument||e.contentWindow?.document;o&&o.body&&(a+=`
`+r(o,t,n+1,i))}catch{}})}catch{}return a.trim().replace(/\n{3,}/g,`

`)}function i(e=document,t=5,n=0,r=new Set){if(n>t||r.has(e))return``;r.add(e);let a=``;try{e.documentElement?a=e.documentElement.outerHTML:e instanceof ShadowRoot&&(a=e.innerHTML||``);let o=[];e.querySelectorAll&&e.querySelectorAll(`*`).forEach(e=>{if(e.shadowRoot){let a=i(e.shadowRoot,t,n+1,r);a&&o.push(`<!-- shadow-root of ${e.tagName} -->\n${a}`)}if(e.tagName===`IFRAME`||e.tagName===`FRAME`)try{let a=e.contentDocument||e.contentWindow?.document;if(a&&a.documentElement){let e=i(a,t,n+1,r);e&&o.push(`<!-- iframe content -->\n${e}`)}}catch{}}),o.length>0&&(a+=`
<!-- Shadow DOM and iframe content -->
`+o.join(`
`))}catch{}return a}function a(e){if(!e)return{x:window.innerWidth/2,y:window.innerHeight/2};let t;try{t=e.getBoundingClientRect()}catch{t={left:0,top:0,width:0,height:0}}if(!t||t.width===0&&t.height===0){let n=e.commonAncestorContainer;if(n){let e=n.nodeType===Node.TEXT_NODE?n.parentElement:n;e&&e.getBoundingClientRect&&(t=e.getBoundingClientRect())}}let n=t.left+t.width/2,r=t.top;if(window.top!==window){let t=e.startContainer.ownerDocument;for(;t&&t!==window.top.document;){let e=t.defaultView?.frameElement;if(!e)break;let i=e.getBoundingClientRect();n+=i.left,r+=i.top,t=e.ownerDocument}}return{x:n,y:r}}function o(e,t=document,n=5,r=0,i=new Set){if(r>n||i.has(t))return i;try{let a=()=>e();t.addEventListener?.(`selectionchange`,a),i.add({root:t,listener:a}),t.querySelectorAll&&t.querySelectorAll(`*`).forEach(t=>{t.shadowRoot&&o(e,t.shadowRoot,n,r+1,i)})}catch{}return i}function s(e){for(let{root:t,listener:n}of e)try{t.removeEventListener?.(`selectionchange`,n)}catch{}e.clear()}function c(e={}){let{maxLength:n=5e4,includeHeadings:i=!0,includeLinks:a=!0}=e,o=r(),s={title:document.title||``,url:window.location.href,content:o.substring(0,n),wordCount:o.split(/\s+/).length};return i&&(s.headings=Array.from(t(`h1, h2, h3, h4, h5, h6`)).map(e=>({level:e.tagName,text:e.textContent.trim()})).filter(e=>e.text.length>0).slice(0,30)),a&&(s.links=Array.from(t(`a`)).map(e=>({text:e.textContent.trim(),href:e.href})).filter(e=>e.text.length>0).slice(0,50)),{success:!0,data:s}}function l(e={}){let{includeStyles:t=!1,maxLength:n=5e4}=e,r=i();return t||(r=r.replace(/\s*style="[^"]*"/gi,``)),{success:!0,content:JSON.stringify({title:document.title,url:window.location.href,html:r.substring(0,n),fullLength:r.length})}}function u(e={}){let{filterByText:n,elementTypes:r,maxResults:i=100}=e,a=[],o=new Set,s={button:`button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]`,input:`input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])`,select:`select`,textarea:`textarea`,a:`a[href]`,checkbox:`input[type="checkbox"]`,radio:`input[type="radio"]`,menuitem:`[role="menuitem"], [role="menu"], [role="menuitemcheckbox"], [role="menuitemradio"]`},c=[];return r&&r.length>0?r.forEach(e=>{s[e]&&c.push(s[e])}):c=Object.values(s),c.forEach(e=>{try{t(e).forEach(e=>{let t=d(e);if(o.has(t))return;o.add(t);let r=e.tagName.toLowerCase(),i=f(e),s=p(e);if(n&&!i.toLowerCase().includes(n.toLowerCase()))return;let c={tag:r,selector:t,text:i.substring(0,100)};r===`a`?c.href=e.href:(r===`input`||r===`select`||r===`textarea`)&&(c.name=e.name,c.type=e.type||`text`,c.value=s,c.placeholder=e.placeholder),e.id&&(c.id=e.id),e.className&&typeof e.className==`string`&&(c.className=e.className.split(` `).filter(e=>e).slice(0,3).join(` `)),a.push(c)})}catch{}}),{success:!0,count:Math.min(a.length,i),total:a.length,elements:a.slice(0,i)}}function d(e){if(e.id)return`#${e.id}`;let t=[],n=e;for(;n&&n!==document.body&&n!==document.documentElement;){let e=n.tagName.toLowerCase();if(n.id){e=`#${n.id}`,t.unshift(e);break}if(n.className&&typeof n.className==`string`){let t=n.className.trim().split(/\s+/).filter(e=>e);t.length>0&&(e+=`.`+t[0])}let r=n.parentElement;if(r){let t=Array.from(r.children).filter(e=>e.tagName===n.tagName);if(t.length>1){let r=t.indexOf(n)+1;e+=`:nth-child(${r})`}}t.unshift(e),n=r}return t.join(` > `)}function f(e){if(e.tagName===`INPUT`||e.tagName===`TEXTAREA`)return e.value||e.placeholder||e.name||``;if(e.tagName===`SELECT`){let t=e.options[e.selectedIndex];return t?t.text:``}return e.textContent.trim()}function p(e){return e.tagName===`INPUT`?e.type===`checkbox`||e.type===`radio`?e.checked?`checked`:`unchecked`:e.value:e.tagName===`SELECT`?e.value:``}function m(e=`text`){try{let t=window.getSelection();if(!t||t.isCollapsed||t.rangeCount===0)return{success:!1,error:`当前没有选中的内容`};let n={success:!0,data:{selectedCount:t.rangeCount,text:``}};if(e===`html`){let e=[];for(let n=0;n<t.rangeCount;n++){let r=t.getRangeAt(n).cloneContents(),i=document.createElement(`div`);i.appendChild(r),e.push(i.innerHTML)}n.data.html=e.join(`
`),n.data.text=t.toString()}else n.data.text=t.toString();return n}catch(e){return{success:!1,error:e.message}}}function h(t=`table`,n=!0,r=`json`){try{let i=e(t);if(!i)return{success:!1,error:`未找到匹配选择器的表格: ${t}`};let a=Array.from(i.querySelectorAll(`tr`)),o=[];return a.forEach((e,t)=>{let r=Array.from(e.querySelectorAll(`td, th`)).map(e=>e.textContent.trim());(n||t>0)&&o.push(r)}),r===`markdown`?o.length===0?{success:!0,content:`表格为空`}:{success:!0,content:`${`| ${o[0].join(` | `)} |`}\n${`| ${o[0].map(()=>`---`).join(` | `)} |`}\n${o.slice(1).map(e=>`| ${e.join(` | `)} |`).join(`
`)}`}:{success:!0,content:JSON.stringify({data:o,rowCount:o.length,columnCount:o[0]?.length||0}),data:o}}catch(e){return{success:!1,error:e.message}}}async function ee(e){try{return await navigator.clipboard.writeText(e),{success:!0,message:`已复制到剪贴板`}}catch{try{let t=document.createElement(`textarea`);return t.value=e,t.style.position=`fixed`,t.style.left=`-9999px`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),document.body.removeChild(t),{success:!0,message:`已复制到剪贴板（降级方案）`}}catch(e){return{success:!1,error:e.message}}}}async function te(){try{return{success:!0,content:await navigator.clipboard.readText()}}catch(e){return{success:!1,error:e.message}}}function ne(t){try{let n=e(t);if(!n)return{success:!1,error:`未找到元素: ${t}`};let r=new MouseEvent(`mouseenter`,{bubbles:!0,cancelable:!0,view:window});n.dispatchEvent(r);let i=new MouseEvent(`mouseover`,{bubbles:!0,cancelable:!0,view:window});return n.dispatchEvent(i),{success:!0,message:`已在元素上触发悬停效果: ${t}`}}catch(e){return{success:!1,error:e.message}}}function re(){try{let e=e=>{let t=document.querySelector(`meta[name="${e}"]`)||document.querySelector(`meta[property="${e}"]`)||document.querySelector(`meta[property="og:${e}"]`);return t?t.content:null},t=e=>{let t=document.querySelectorAll(`meta[name="${e}"], meta[property="${e}"], meta[property="og:${e}"]`);return Array.from(t).map(e=>e.content).filter(Boolean)},n=[];document.querySelectorAll(`script[type="application/ld+json"]`).forEach(e=>{try{let t=JSON.parse(e.textContent);Array.isArray(t)?n.push(...t):t&&t[`@graph`]&&Array.isArray(t[`@graph`])?n.push(...t[`@graph`]):t&&n.push(t)}catch{}});let r=[];return document.querySelectorAll(`[itemscope]`).forEach(e=>{let t=e.getAttribute(`itemtype`)||``;if(!t)return;let n={};e.querySelectorAll(`[itemprop]`).forEach(t=>{if(t.closest(`[itemscope]`)!==e)return;let r=t.getAttribute(`itemprop`)||``;if(!r)return;let i=t.getAttribute(`content`)||t.getAttribute(`href`)||t.getAttribute(`src`)||t.textContent?.trim();i&&(n[r]?n[r]=Array.isArray(n[r])?[...n[r],i]:[n[r],i]:n[r]=i)}),r.push({itemType:t,properties:n})}),{success:!0,data:{title:document.title,description:e(`description`),keywords:e(`keywords`),author:e(`author`),ogTitle:e(`og:title`),ogDescription:e(`og:description`),ogImage:e(`og:image`),ogUrl:e(`og:url`),ogType:e(`og:type`),ogSiteName:e(`og:site_name`),ogLocale:e(`og:locale`),articlePublishedTime:e(`article:published_time`),articleModifiedTime:e(`article:modified_time`),articleAuthor:e(`article:author`),twitterCard:e(`twitter:card`),twitterTitle:e(`twitter:title`),twitterDescription:e(`twitter:description`),twitterImage:e(`twitter:image`),twitterSite:e(`twitter:site`),twitterCreator:e(`twitter:creator`),canonicalUrl:document.querySelector(`link[rel="canonical"]`)?.href,links:t(`citation_author`),jsonLd:n.length>0?n:void 0,microdata:r.length>0?r:void 0}}}catch(e){return{success:!1,error:e.message}}}function g(){document.querySelectorAll(`.ai-helper-highlight`).forEach(e=>{let t=e.parentNode;if(t&&t.insertBefore&&t.removeChild){for(;e.firstChild;)t.insertBefore(e.firstChild,e);t.removeChild(e),typeof t.normalize==`function`&&t.normalize()}});let e=document.getElementById(`ai-helper-highlight-style`);e&&e.remove()}function ie(e,t=`yellow`){try{if(!e)return{success:!1,error:`未提供要高亮的文本`};g();let n=document.createElement(`style`);n.id=`ai-helper-highlight-style`,n.textContent=`
      .ai-helper-highlight {
        background-color: ${t} !important;
        padding: 2px 0;
      }
    `,document.head.appendChild(n);let r=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),i=[],a;for(;a=r.nextNode();)a.nodeValue.toLowerCase().includes(e.toLowerCase())&&i.push(a);let o=[];return i.forEach(e=>{let t=e.parentNode;if(!t||!t.replaceChild||!t.insertBefore)return;let n=e.nodeValue,r=n.toLowerCase(),i=n.toLowerCase(),a=r.indexOf(i);if(a!==-1){let r=document.createElement(`span`);r.className=`ai-helper-highlight`,r.textContent=n.substring(a,a+n.length);let i=document.createTextNode(n.substring(0,a)),s=document.createTextNode(n.substring(a+n.length));t.replaceChild(s,e),t.insertBefore(r,s),t.insertBefore(i,r),o.push(r)}}),o.length>0&&o[0].scrollIntoView({behavior:`smooth`,block:`center`}),{success:!0,message:`已高亮 ${o.length} 处文本`,count:o.length}}catch(e){return{success:!1,error:e.message}}}function ae(e=`all`,t=!1){try{let n=window.location.hostname,r=[];return document.querySelectorAll(`a[href]`).forEach(t=>{try{let i=t.href;if(!i||i.startsWith(`javascript:`)||i.startsWith(`#`))return;let a=new URL(i),o=a.hostname!==n;if(e===`internal`&&o||e===`external`&&!o)return;r.push({href:i,text:t.textContent.trim(),title:t.title,domain:a.hostname,isExternal:o,target:t.target})}catch{}}),t&&document.querySelectorAll(`img[src]`).forEach(t=>{try{let i=t.src;if(!i)return;let a=new URL(i),o=a.hostname!==n;if(e===`internal`&&o||e===`external`&&!o)return;r.push({href:i,text:t.alt||``,title:t.title,domain:a.hostname,isExternal:o,type:`image`})}catch{}}),{success:!0,total:r.length,links:r}}catch(e){return{success:!1,error:e.message}}}function oe(e=null){try{let t=(e?[document.querySelector(e)].filter(Boolean):Array.from(document.querySelectorAll(`form`))).map((e,t)=>{let n=[],r=e.id||`form-${t}`;return e.querySelectorAll(`input`).forEach(e=>{n.push({tag:`input`,name:e.name,id:e.id,type:e.type,placeholder:e.placeholder,required:e.required,selector:_(e)})}),e.querySelectorAll(`textarea`).forEach(e=>{n.push({tag:`textarea`,name:e.name,id:e.id,placeholder:e.placeholder,required:e.required,selector:_(e)})}),e.querySelectorAll(`select`).forEach(e=>{let t=Array.from(e.options).map(e=>({value:e.value,text:e.textContent.trim()}));n.push({tag:`select`,name:e.name,id:e.id,required:e.required,options:t,selector:_(e)})}),{formId:r,action:e.action,method:e.method,fields:n}});return{success:!0,total:t.length,forms:t}}catch(e){return{success:!1,error:e.message}}}function _(e){if(e.id)return`#${e.id}`;let t=e.tagName.toLowerCase();if(e.className){let n=e.className.split(` `).filter(e=>e).slice(0,2);n.length&&(t+=`.`+n.join(`.`))}return t}function se(e={}){try{let{minWidth:t=0,minHeight:n=0,includeBackgroundImages:r=!1,download:i=!1,maxResults:a=100}=e,o=[],s=new Set;return document.querySelectorAll(`img[src]`).forEach(e=>{try{let r=e.src;if(!r||s.has(r))return;let i=e.naturalWidth||e.width||0,a=e.naturalHeight||e.height||0;i>=t&&a>=n&&(s.add(r),o.push({src:r,alt:e.alt||``,title:e.title||``,width:i,height:a,selector:_(e)}))}catch{}}),r&&document.querySelectorAll(`*`).forEach(e=>{try{let t=window.getComputedStyle(e).backgroundImage;if(!t||t===`none`||t.startsWith(`gradient`))return;let n=t.match(/url\(['"]?([^'")]+)['"]?\)/);if(n&&n[1]){let t=n[1];s.has(t)||(s.add(t),o.push({src:t,alt:``,title:``,width:0,height:0,type:`background`,selector:_(e)}))}}catch{}}),i&&o.length>0&&o.slice(0,Math.min(a,10)).forEach((e,t)=>{setTimeout(()=>{let n=document.createElement(`a`);n.href=e.src,n.download=`image_${t+1}.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n)},t*500)}),{success:!0,total:o.length,images:o.slice(0,a),message:i?`已开始下载 ${Math.min(o.length,10)} 张图片`:``}}catch(e){return{success:!1,error:e.message}}}function ce(e={}){try{let{query:t,pattern:n,mode:r=`plain`,caseSensitive:i=!1,contextLength:a=50,maxResults:o=20,highlight:s=!1}=e,c=t||n;if(!c)return{success:!1,error:`需要提供搜索关键词`};if(r===`plain`){let e=window.find(c,i,!1,!0,!1,!0,!1),t=0,n=[];try{let e=window.getSelection(),r=e&&e.rangeCount>0?e.getRangeAt(0):null,s=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),l=i?`g`:`gi`,u=c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),d=new RegExp(u,l),f=document.body.innerText,p=0;for(;s.nextNode();){let e=s.currentNode.textContent.match(d);if(e)for(let r of e){if(n.length>=o)break;let e=f.indexOf(r,p),i=Math.max(0,e-a),s=Math.min(f.length,e+r.length+a);n.push({match:r,position:e,context:f.substring(i,s),lineNumber:f.substring(0,e).split(`
`).length}),t++,p=e+r.length}if(n.length>=o)break}r&&(e.removeAllRanges(),e.addRange(r))}catch{t=+!!e}if(s&&t>0){g();let e=document.createElement(`style`);e.id=`ai-helper-highlight-style`,e.textContent=`
          .ai-helper-search-highlight {
            background-color: #ffff00;
            color: #000;
            padding: 1px 2px;
            border-radius: 2px;
          }
        `,document.head.appendChild(e);let t=i?`g`:`gi`,n=c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`);document.body.innerHTML=document.body.innerHTML.replace(new RegExp(n,t),`<span class="ai-helper-search-highlight">$&</span>`)}return{success:!0,query:c,mode:`plain`,found:e,total:t,matches:n,highlighted:s}}let l=i?`g`:`gi`,u=new RegExp(c,l),d=document.body.innerText,f=[],p;for(;(p=u.exec(d))!==null&&f.length<o;){let e=Math.max(0,p.index-a),t=Math.min(d.length,p.index+p[0].length+a);f.push({match:p[0],position:p.index,context:d.substring(e,t),lineNumber:d.substring(0,p.index).split(`
`).length}),p[0].length===0&&u.lastIndex++}if(s&&f.length>0){g();let e=document.createElement(`style`);e.id=`ai-helper-highlight-style`,e.textContent=`
        .ai-helper-search-highlight {
          background-color: #ffff00;
          color: #000;
          padding: 1px 2px;
          border-radius: 2px;
        }
      `,document.head.appendChild(e),document.body.innerHTML=document.body.innerHTML.replace(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),l),`<span class="ai-helper-search-highlight">$&</span>`)}return{success:!0,pattern:c,mode:`regex`,total:f.length,matches:f,highlighted:s}}catch(e){return{success:!1,error:e.message}}}function le(e=null,t=!0,n=!0,r=5e4){try{let i=e?document.querySelector(e):document.body;if(!i)return{success:!1,error:`未找到目标元素`};let a=``,o=(e,r=0)=>{if(r>6)return``;let i=``,a=e.tagName.toLowerCase();switch(a){case`h1`:case`h2`:case`h3`:case`h4`:case`h5`:case`h6`:let s=parseInt(a[1]);i+=`
`+`#`.repeat(s)+` `+e.textContent.trim()+`

`;break;case`p`:i+=e.textContent.trim()+`

`;break;case`a`:if(n){let t=e.getAttribute(`href`),n=e.textContent.trim();i+=`[${n||t}](${t})`}else i+=e.textContent.trim();break;case`img`:if(t){let t=e.getAttribute(`src`),n=e.getAttribute(`alt`)||``;i+=`![${n}](${t})\n\n`}break;case`ul`:e.querySelectorAll(`li`).forEach((e,t)=>{i+=`
- `+e.textContent.trim()}),i+=`

`;break;case`ol`:e.querySelectorAll(`li`).forEach((e,t)=>{i+=`
`+(t+1)+`. `+e.textContent.trim()}),i+=`

`;break;case`blockquote`:i+=`
> `+e.textContent.trim().replace(/\n/g,`
> `)+`

`;break;case`code`:let c=e.parentElement;c&&c.tagName.toLowerCase()===`pre`?i+="\n```\n"+e.textContent+`
\`\`\`

`:i+="`"+e.textContent.trim()+"`";break;case`table`:let l=`
`,u=e.querySelectorAll(`tr`);u.forEach((e,t)=>{let n=e.querySelectorAll(`th, td`),r=Array.from(n).map(e=>e.textContent.trim());l+=`| `+r.join(` | `)+` |
`,t===0&&u.length>1&&(l+=`| `+r.map(()=>`---`).join(` | `)+` |
`)}),i+=l+`
`;break;case`br`:i+=`
`;break;default:e.childNodes.length>0&&e.childNodes.forEach(e=>{e.nodeType===Node.ELEMENT_NODE?i+=o(e,r+1):e.nodeType===Node.TEXT_NODE&&(i+=e.textContent)})}return i};return a=o(i),a=a.replace(/\n{3,}/g,`

`).trim(),a.length>r&&(a=a.substring(0,r)+`...

*内容已截断*`),{success:!0,markdown:a,length:a.length,url:window.location.href,title:document.title}}catch(e){return{success:!1,error:e.message}}}function ue(e=null,t=100){try{let n=e?Array.from(document.querySelectorAll(e)):[document.body];if(!n.length)return{success:!1,error:`未找到匹配选择器的元素: ${e}`};let r=[],i=[],a=[],o=[],s=[],c=new Set,l=new Set;return n.forEach(e=>{r.length<t&&e.querySelectorAll(`table`).forEach(e=>{if(r.length>=t)return;let n=[];e.querySelectorAll(`th`).forEach(e=>{n.push(e.textContent.trim())});let i=[];e.querySelectorAll(`tr`).forEach(e=>{let t=[];e.querySelectorAll(`td, th`).forEach(e=>{t.push(e.textContent.trim())}),i.push(t)}),r.push({headers:n,rows:i})}),i.length<t&&e.querySelectorAll(`ul, ol`).forEach(e=>{if(i.length>=t)return;let n=[];e.querySelectorAll(`:scope > li`).forEach(e=>{n.push(e.textContent.trim())}),i.push({tag:e.tagName.toLowerCase(),items:n})}),a.length<t&&e.querySelectorAll(`script[type="application/ld+json"]`).forEach(e=>{if(a.length>=t)return;let n=e.textContent.substring(0,200);if(!c.has(n)){c.add(n);try{let t=JSON.parse(e.textContent);a.push(t)}catch{}}}),o.length<t&&e.querySelectorAll(`article`).forEach(e=>{if(o.length>=t)return;let n=e.textContent.trim();o.push({textContent:n.substring(0,500),wordCount:n.split(/\s+/).filter(Boolean).length})}),s.length<t&&e.querySelectorAll(`[itemscope]`).forEach(e=>{if(s.length>=t)return;let n=e.getAttribute(`itemtype`)||``;if(!n)return;let r=n+e.textContent.trim().substring(0,100);if(l.has(r))return;l.add(r);let i={};e.querySelectorAll(`[itemprop]`).forEach(t=>{if(t.closest(`[itemscope]`)!==e)return;let n=t.getAttribute(`itemprop`)||``;if(!n)return;let r=t.getAttribute(`content`)||t.getAttribute(`href`)||t.getAttribute(`src`)||t.textContent?.trim();r&&(i[n]?i[n]=Array.isArray(i[n])?[...i[n],r]:[i[n],r]:i[n]=r)}),s.push({itemType:n,properties:i})})}),{success:!0,data:{tables:r,lists:i,jsonLd:a,articles:o,microdata:s},counts:{tables:r.length,lists:i.length,jsonLd:a.length,articles:o.length,microdata:s.length}}}catch(e){return{success:!1,error:e.message}}}function de(t,n=50){try{if(!t)return{success:!1,error:`选择器不能为空`};let r=e(t);if(!r)return{success:!1,error:`未找到目标元素: ${t}`};let i=e=>{let t=e.tagName.toLowerCase(),n=e.classList?Array.from(e.classList).sort().join(`.`):``,r={};return Array.from(e.children).forEach(e=>{let t=e.tagName.toLowerCase();r[t]=(r[t]||0)+1}),`${t}|${n}|${Object.keys(r).sort().map(e=>`${e}:${r[e]}`).join(`,`)}`},a=i(r),o=[],s=document.querySelectorAll(r.tagName.toLowerCase());for(let e of s)if(e!==r){if(o.length>=n)break;i(e)===a&&o.push({tag:e.tagName.toLowerCase(),selector:d(e),text:(e.textContent||``).trim().substring(0,200),id:e.id||``,className:typeof e.className==`string`?e.className:``})}return{success:!0,original:{tag:r.tagName.toLowerCase(),selector:d(r),text:(r.textContent||``).trim().substring(0,200),signature:a},similar:o,count:o.length}}catch(e){return{success:!1,error:e.message}}}function fe(e=`iframe`,t=!1,n=1e4){try{let a=document.querySelectorAll(e),o=[],s=(e,a=1,c=``)=>{try{let l=d(e),u=c?`${c} > iframe`:l,f=e.src||`about:blank`,p=!1,m=``,h=``,ee=0;try{let o=e.contentDocument||e.contentWindow?.document;o&&(p=!0,m=o.title||``,h=r(o).substring(0,n),ee=i(o).length,t&&a<2&&o.querySelectorAll(`iframe`).forEach(e=>{s(e,a+1,u)}))}catch{p=!1}o.push({selector:u,url:f,accessible:p,title:m,textContent:h,htmlLength:ee})}catch{}};return a.forEach(e=>s(e)),{success:!0,iframes:o,total:o.length,accessible:o.filter(e=>e.accessible).length}}catch(e){return{success:!1,error:e.message}}}function pe(e,t=!1){try{let n=document.querySelectorAll(e);if(!t){let t=0,r=n.length;return n.forEach(e=>{let n=window.getComputedStyle(e);n.display!==`none`&&n.visibility!==`hidden`&&n.opacity!==`0`&&t++}),{success:!0,count:t,totalCount:r,empty:t===0,selector:e}}return{success:!0,count:n.length,totalCount:n.length,empty:n.length===0,selector:e}}catch(e){return{success:!1,error:e.message}}}function me(e={}){let{scrollPixels:t=800,maxScrolls:n=20,pauseMs:r=500,selector:i}=e;return new Promise(async e=>{try{let a=i?document.querySelector(i):null,o=()=>{let e=a||document.body,t=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n=``,r;for(;r=t.nextNode();){let e=r.parentElement;if(!e)continue;let t=e.getBoundingClientRect();if(t.bottom>-100&&t.top<window.innerHeight+100){let e=r.textContent.trim();e&&(n+=e+`
`)}}return n},s=a||document.scrollingElement||document.documentElement,c=``,l=window.scrollY;for(let e=0;e<n;e++){let e=o();c+=e+`
`;let n=window.scrollY;if(s.scrollBy({top:t,behavior:`auto`}),await new Promise(e=>setTimeout(e,r)),Math.abs(window.scrollY-n)<5&&(await new Promise(e=>setTimeout(e,r)),Math.abs(window.scrollY-n)<5))break}a&&s.scrollTo({top:l,behavior:`auto`});let u=c.split(`
`),d=[];for(let e of u){let t=e.trim();t&&t!==d[d.length-1]&&d.push(t)}e({success:!0,content:d.join(`
`),contentLength:d.join(`
`).length,scrolls:n,startScrollY:l,endScrollY:window.scrollY})}catch(t){e({success:!1,error:t.message})}})}var v=null;function he(t,n=500,r=3e3){try{if(!t)return{success:!1,error:`选择器不能为空`};let n=t.trim();for(let[e,t]of[[/^"([\s\S]*)"$/,`$1`],[/^'([\s\S]*)'$/,`$1`],[/^`([\s\S]*)`$/,`$1`],[/^"([\s\S]*)"$/,`$1`],[/^'([\s\S]*)'$/,`$1`],[/^「([\s\S]*)」$/,`$1`]])n=n.replace(e,t);let r=e(n);return r?(r.click(),{success:!0,message:`已成功点击元素: ${t}`}):{success:!1,error:`未找到匹配选择器的元素: ${t}`}}catch(e){return{success:!1,error:e.message}}}function ge(e){return e.isContentEditable||e.getAttribute(`contenteditable`)===`true`}function _e(e,t){try{return e.focus(),document.execCommand(`insertText`,!1,t)||(e.textContent=t),e.dispatchEvent(new Event(`input`,{bubbles:!0})),e.dispatchEvent(new Event(`change`,{bubbles:!0})),!0}catch{try{return e.textContent=t,e.dispatchEvent(new Event(`input`,{bubbles:!0})),!0}catch{return!1}}}function ve(t,n=500){try{let n=[];return t.forEach(t=>{let{selector:r,value:i,fieldType:a=`text`}=t,o=e(r);if(!o){n.push({selector:r,success:!1,error:`未找到元素`});return}try{if(a===`text`){if(ge(o)){let e=_e(o,i);n.push({selector:r,success:e,value:i});return}o.value=i,o.dispatchEvent(new Event(`input`,{bubbles:!0})),o.dispatchEvent(new Event(`change`,{bubbles:!0}))}else if(a===`contenteditable`){let e=_e(o,i);n.push({selector:r,success:e,value:i});return}else if(a===`select`){let e=o.querySelector(`option[value="${i}"]`)||Array.from(o.options).find(e=>e.textContent===i);if(e)o.value=e.value,o.dispatchEvent(new Event(`change`,{bubbles:!0}));else{n.push({selector:r,success:!1,error:`未找到匹配的选项`});return}}else if(a===`checkbox`)o.checked=i===`true`||i===!0,o.dispatchEvent(new Event(`change`,{bubbles:!0}));else if(a===`radio`){let e=document.querySelector(`${r}[value="${i}"]`);if(e)e.checked=!0,e.dispatchEvent(new Event(`change`,{bubbles:!0}));else{n.push({selector:r,success:!1,error:`未找到匹配的单选按钮`});return}}n.push({selector:r,success:!0,value:i})}catch(e){n.push({selector:r,success:!1,error:e.message})}}),{success:!0,message:`表单填充完成，成功 ${n.filter(e=>e.success).length}/${t.length} 个字段`,details:n}}catch(e){return{success:!1,error:e.message}}}function ye(t){try{let{target:n=`selector`,selector:r,x:i=0,y:a=0,behavior:o=`smooth`,align:s=`center`}=t;if(n===`top`)window.scrollTo({top:0,left:0,behavior:o});else if(n===`bottom`)window.scrollTo({top:document.body.scrollHeight,left:0,behavior:o});else if(n===`coordinates`)window.scrollTo({top:a,left:i,behavior:o});else if(n===`selector`&&r){let t=e(r);if(!t)return{success:!1,error:`未找到元素: ${r}`};t.scrollIntoView({behavior:o,block:s})}else return{success:!1,error:`无效的滚动目标或缺少选择器`};return{success:!0,message:`滚动完成`}}catch(e){return{success:!1,error:e.message}}}function be(e){if(!e)return!1;if(e.offsetParent===null&&e.tagName!==`BODY`){let t=window.getComputedStyle(e);if(t.display===`none`||t.visibility===`hidden`||t.position!==`fixed`)return!1}let t=window.getComputedStyle(e);if(t.display===`none`||t.visibility===`hidden`||parseFloat(t.opacity)<=0)return!1;let n=e.getBoundingClientRect();if(n.width<=0||n.height<=0)return!1;let r=window.innerHeight||document.documentElement.clientHeight,i=window.innerWidth||document.documentElement.clientWidth;return n.top<r&&n.bottom>0&&n.left<i&&n.right>0}function xe(t,n=`appeared`,r=1e4){return new Promise((i,a)=>{let o=Date.now(),s=()=>{let a=e(t);if(n===`appeared`&&a){i({success:!0,message:`元素 ${t} 已出现`,element:t});return}if(n===`disappeared`&&!a){i({success:!0,message:`元素 ${t} 已消失`});return}if(n===`visible`&&a&&be(a)){i({success:!0,message:`元素 ${t} 已可见`,element:t});return}if(n===`hidden`&&(!a||!be(a))){i({success:!0,message:`元素 ${t} 已隐藏`});return}if(Date.now()-o>r){i({success:!1,error:`等待超时（${r}ms），元素 ${t} 未达到 ${n} 状态`});return}setTimeout(s,100)};s()})}function Se({key:e,text:t,ctrlKey:n=!1,shiftKey:r=!1,altKey:i=!1}){try{let a=document.activeElement;if(!a)return{success:!1,error:`没有聚焦的元素`};if(t){let e=a.tagName===`INPUT`||a.tagName===`TEXTAREA`,n=a.isContentEditable;if(e||n){if(a.focus(),n)try{document.execCommand(`selectAll`,!1,null),document.execCommand(`insertText`,!1,t)}catch{a.textContent+=t}else{let e=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,`value`)||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,`value`);e&&e.set?e.set.call(a,a.value+t):a.value+=t}try{a.dispatchEvent(new InputEvent(`input`,{bubbles:!0,cancelable:!0,inputType:`insertText`,data:t}))}catch{a.dispatchEvent(new Event(`input`,{bubbles:!0}))}a.dispatchEvent(new Event(`change`,{bubbles:!0}))}}if(e){let t={key:e,code:e.length===1?`Key${e.toUpperCase()}`:e,keyCode:e.toUpperCase().charCodeAt(0),which:e.toUpperCase().charCodeAt(0),bubbles:!0,cancelable:!0,ctrlKey:n,shiftKey:r,altKey:i};document.activeElement.dispatchEvent(new KeyboardEvent(`keydown`,t)),document.activeElement.dispatchEvent(new KeyboardEvent(`keypress`,t)),document.activeElement.dispatchEvent(new KeyboardEvent(`keyup`,t))}return{success:!0,message:`键盘输入成功`}}catch(e){return{success:!1,error:e.message}}}function Ce(t,n){return new Promise((r,i)=>{try{let i=e(t),a=e(n);if(!i){r({success:!1,error:`未找到源元素: ${t}`});return}if(!a){r({success:!1,error:`未找到目标元素: ${n}`});return}let o=i.getBoundingClientRect(),s=a.getBoundingClientRect(),c=o.left+o.width/2,l=o.top+o.height/2,u=s.left+s.width/2,d=s.top+s.height/2,f=(e,t,n)=>{let r=new DragEvent(e,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,screenX:t,screenY:n});Object.defineProperty(r,"dataTransfer",{value:{getData:()=>``,setData:()=>{},effectAllowed:`all`,dropEffect:`none`}}),document.elementFromPoint(t,n)?.dispatchEvent(r)};f(`dragstart`,c,l),f(`dragenter`,u,d),f(`dragover`,u,d),f(`drop`,u,d),f(`dragend`,c,l),r({success:!0,experimental:!0,message:`[实验性] 已尝试拖拽 ${t} → ${n}（拖拽模拟在浏览器中为部分支持，可能未生效）`})}catch(e){r({success:!1,error:e.message})}})}function we(t,n,r,i=`application/octet-stream`){try{let a=e(t);if(!a)return{success:!1,error:`未找到文件上传控件: ${t}`};if(a.type!==`file`)return{success:!1,error:`选择的元素不是文件上传控件`};let o;try{let e=atob(r),t=new Uint8Array(e.length);for(let n=0;n<e.length;n++)t[n]=e.charCodeAt(n);o=new Blob([t],{type:i})}catch{o=new Blob([r],{type:i})}let s=new File([o],n,{type:i}),c=new DataTransfer;return c.items.add(s),a.files=c.files,a.dispatchEvent(new Event(`change`,{bubbles:!0})),{success:!0,message:`已上传文件: ${n}`}}catch(e){return{success:!1,error:e.message}}}function Te(e,t,n=null,r=5e3){return new Promise(async i=>{try{let a=document.querySelector(e);if(!a){i({success:!1,error:`未找到触发器: ${e}`});return}if(a.tagName===`SELECT`){let e=a.options;for(let n=0;n<e.length;n++){let r=e[n],o=(r.textContent||r.label||``).trim();if(o===t||o.includes(t)){a.value=r.value,a.dispatchEvent(new Event(`change`,{bubbles:!0})),a.dispatchEvent(new Event(`input`,{bubbles:!0})),i({success:!0,message:`已选择: ${o}`,triggerTag:`SELECT`});return}}i({success:!1,error:`在 <select> 中未找到匹配的选项: "${t}"`,availableOptions:Array.from(e).map(e=>e.textContent?.trim()).filter(Boolean)});return}a.click(),await new Promise(e=>setTimeout(e,300));let o=Date.now(),s=n?document.querySelector(n):document,c=null;for(;Date.now()-o<r;){let e=s.querySelectorAll(`li, [role="option"], [role="menuitem"], .option, .dropdown-item, .select-item, [data-value], div`);for(let n of e){let e=(n.textContent||``).trim();if(!(e.length<2)&&(e===t||e.includes(t)||e.replace(/\s+/g,``)===t.replace(/\s+/g,``))){c=n;break}}if(c)break;await new Promise(e=>setTimeout(e,100))}if(!c){i({success:!1,error:`在 ${r}ms 内未找到匹配选项: "${t}"`});return}c.click(),i({success:!0,message:`已选择: ${c.textContent?.trim()}`,triggerTag:a.tagName})}catch(e){i({success:!1,error:e.message})}})}function Ee({action:e,storage:t,key:n,value:r}){try{let i=t===`session`?sessionStorage:localStorage;switch(e){case`get`:if(!n){let e={};for(let t=0;t<i.length;t++){let n=i.key(t);e[n]=i.getItem(n)}return{success:!0,content:JSON.stringify(e),data:e}}let t=i.getItem(n);return{success:!0,content:JSON.stringify({key:n,value:t}),value:t};case`set`:return!n||r===void 0?{success:!1,error:`set操作需要提供key和value`}:(i.setItem(n,r),{success:!0,message:`已设置 ${n}`});case`remove`:return n?(i.removeItem(n),{success:!0,message:`已删除 ${n}`}):{success:!1,error:`remove操作需要提供key`};case`clear`:return i.clear(),{success:!0,message:`已清空存储`};default:return{success:!1,error:`未知操作: ${e}`}}}catch(e){return{success:!1,error:e.message}}}function De(){return new Promise((e,t)=>{if(!(`EyeDropper`in window)){e({success:!1,error:`您的浏览器不支持 EyeDropper API`});return}new EyeDropper().open().then(t=>{e({success:!0,color:t.sRGBHex,message:`已取色: ${t.sRGBHex}`})}).catch(t=>{t.name===`AbortError`?e({success:!1,error:`用户取消了取色`}):e({success:!1,error:t.message})})})}function Oe(e,t=`zh-CN`,n=1,r=1){try{if(!(`speechSynthesis`in window))return{success:!1,error:`您的浏览器不支持语音合成`};v&&speechSynthesis.cancel();let i=new SpeechSynthesisUtterance(e);return i.lang=t,i.rate=n,i.pitch=r,v=i,new Promise(e=>{i.onend=()=>{v=null,e({success:!0,message:`朗读完成`})},i.onerror=t=>{v=null,e({success:!1,error:t.error})},speechSynthesis.speak(i),e({success:!0,message:`开始朗读...`})})}catch(e){return{success:!1,error:e.message}}}function ke(e,t=null,n=null){try{let r=t?document.querySelector(t):document.querySelector(`video, audio`);if(!r)return{success:!1,error:`未找到视频/音频元素`};switch(e){case`play`:return r.play(),{success:!0,message:`已播放`};case`pause`:return r.pause(),{success:!0,message:`已暂停`};case`toggle`:return r.paused?(r.play(),{success:!0,message:`已播放`}):(r.pause(),{success:!0,message:`已暂停`});case`stop`:return r.pause(),r.currentTime=0,{success:!0,message:`已停止`};case`seek`:return n===null?{success:!1,error:`seek操作需要提供value参数`}:(r.currentTime=n,{success:!0,message:`已跳转到 ${n} 秒`});case`volume`:return n===null?{success:!1,error:`volume操作需要提供value参数`}:(r.volume=Math.max(0,Math.min(1,n)),{success:!0,message:`音量已设置为 ${Math.round(n*100)}%`});case`mute`:return r.muted=!r.muted,{success:!0,message:r.muted?`已静音`:`已取消静音`};case`speed`:return n===null?{success:!1,error:`speed操作需要提供value参数`}:(r.playbackRate=Math.max(.1,Math.min(10,n)),{success:!0,message:`播放速度已设置为 ${n}x`});case`fullscreen`:return r.requestFullscreen?r.requestFullscreen():r.webkitRequestFullscreen?r.webkitRequestFullscreen():r.mozRequestFullScreen&&r.mozRequestFullScreen(),{success:!0,message:`已进入全屏`};default:return{success:!1,error:`未知操作: ${e}`}}}catch(e){return{success:!1,error:e.message}}}function Ae(e,t){try{let n=document.createElement(`canvas`);n.width=t,n.height=t;let r=n.getContext(`2d`);r.fillStyle=`#FFFFFF`,r.fillRect(0,0,t,t);let i=[];for(let t=0;t<e.length;t++)i.push(e.charCodeAt(t));let a=Math.max(2,Math.floor(t/41)),o=Math.floor(t/a),s=Math.floor((t-o*a)/2);r.fillStyle=`#000000`;let c=(e,t)=>{let n=7*a;r.fillRect(e,t,n,n),r.fillStyle=`#FFFFFF`,r.fillRect(e+a,t+a,n-2*a,n-2*a),r.fillStyle=`#000000`,r.fillRect(e+2*a,t+2*a,n-4*a,n-4*a),r.fillStyle=`#000000`};c(s,s),c(s+(o-7)*a,s),c(s,s+(o-7)*a);let l=0;for(let t=0;t<e.length;t++)l=(l<<5)-l+e.charCodeAt(t),l|=0;let u=e=>{let t=e+1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296};for(let e=0;e<o;e++)for(let t=0;t<o;t++){let n=e<8&&t<8,i=e<8&&t>=o-8,c=e>=o-8&&t<8;n||i||c||u(l+e*o+t)>.5&&r.fillRect(s+t*a,s+e*a,a,a)}return n.toDataURL(`image/png`)}catch{return null}}function je(e=``,t=200,n=`M`,r=!0){return new Promise(i=>{try{let a=e||window.location.href,o=document.createElement(`div`);o.id=`ai-helper-qrcode`,o.style.cssText=`
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 99999;
        background: white;
        padding: 20px;
        border-radius: 12px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        text-align: center;
      `;let s=document.createElement(`canvas`);s.width=t,s.height=t,o.appendChild(s);let c=document.createElement(`p`);c.textContent=a.length>50?a.substring(0,50)+`...`:a,c.style.cssText=`margin-top: 12px; font-size: 12px; color: #666; word-break: break-all; max-width: 200px;`,o.appendChild(c);let l=document.createElement(`button`);if(l.textContent=`关闭`,l.style.cssText=`
        margin-top: 12px;
        padding: 6px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
      `,l.onclick=()=>{document.body.removeChild(o)},o.appendChild(l),typeof QRCode>`u`){let e=Ae(a,t);if(e){let n=document.createElement(`img`);n.src=e,n.width=t,n.height=t,s.replaceWith(n),r&&document.body.appendChild(o),i({success:!0,content:a,size:t,dataUrl:e,shown:r,fallback:!0,warning:`QRCode 库未加载，已使用 SVG 降级方案生成`})}else i({success:!1,error:`二维码库未加载且降级方案不可用`});return}QRCode.toCanvas(s,a,{width:t,margin:2,color:{dark:`#000000`,light:`#ffffff`},errorCorrectionLevel:n.toLowerCase()},e=>{e?i({success:!1,error:e.message}):(r&&document.body.appendChild(o),i({success:!0,content:a,size:t,dataUrl:s.toDataURL(`image/png`),shown:r}))})}catch(e){i({success:!1,error:e.message})}})}function Me(e,t=!0,n=5,r=50){try{let i=[],a=(o,s=0)=>{if(!(s>n||i.length>=r))try{o.querySelector&&o.querySelectorAll(e).forEach(e=>{i.length>=r||i.push({tag:e.tagName.toLowerCase(),id:e.id,className:e.className,textContent:e.textContent?.substring(0,200),selector:getElementSelector(e),depth:s})}),t&&o.querySelectorAll(`*`).forEach(e=>{e.shadowRoot&&a(e.shadowRoot,s+1)})}catch{}};return a(document),{success:!0,selector:e,total:i.length,elements:i.slice(0,r)}}catch(e){return{success:!1,error:e.message}}}function Ne(e,t=null,n=`style`){try{if(!e||typeof e!=`string`)return{success:!1,error:`css 参数必须是非空字符串`};if(n!==`style`&&n!==`inline`)return{success:!1,error:`不支持的 injectMode: ${n}，支持 'style' 或 'inline'`};if(n===`style`)if(t){let n=document.querySelectorAll(t),r=`ai-helper-scoped-style-${Date.now()}`,i=``,a=e.split(`}`);for(let e of a){let t=e.trim();if(!t)continue;let n=t.indexOf(`{`);if(n===-1)continue;let a=t.substring(0,n).trim(),o=t.substring(n+1).trim();i+=`#${r} ${a} { ${o} } `}n.forEach(e=>{e.setAttribute(`id`,r)});let o=document.createElement(`style`);return o.setAttribute(`data-ai-helper`,`scoped`),o.textContent=i,document.head.appendChild(o),{success:!0,injectMode:`style`,scoped:!0,selector:t,hitCount:n.length}}else{let t=document.createElement(`style`);return t.setAttribute(`data-ai-helper`,`global`),t.textContent=e,document.head.appendChild(t),{success:!0,injectMode:`style`,scoped:!1,hitCount:0}}if(n===`inline`){let n=t?document.querySelectorAll(t):document.querySelectorAll(`*`),r=0,i={};return e.split(`;`).forEach(e=>{let t=e.indexOf(`:`);if(t===-1)return;let n=e.substring(0,t).trim(),r=e.substring(t+1).trim();n&&r&&(i[n]=r)}),n.forEach(e=>{if(e.nodeType===1){for(let[t,n]of Object.entries(i))try{e.style.setProperty(t,n)}catch{}r++}}),{success:!0,injectMode:`inline`,selector:t||`*`,hitCount:r}}}catch(e){return{success:!1,error:e.message}}}var y={search:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,explain:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>`,translate:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,summary:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,copy:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,close:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,sparkle:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,lock:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,unlock:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,copyLarge:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,grip:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>`,send:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,more:`<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,gear:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,refresh:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,block:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,eyeOff:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`},b=null,x=null,S=!1,C=!1,w=``,T=null,E=``,D=!1,O=!1,k=``,A=``,j=``,Pe=``,M=``,N=!0,P=[],Fe=!1,F=!1,I={x:0,y:0},L=null,R=null,Ie=5,z=!1,B=null,V=``,H=new Set,U=window.top===window;if(!U)try{window.parent===window.top&&window.top.document.querySelector(`frameset`)&&(U=!0)}catch{}console.log(`[SelectionToolbar] 模块加载 isTopFrame:`,U,`top===window:`,window.top===window,`hasBody:`,!!document.body,`parent===top:`,window.parent===window.top);var W=null;function G(e){(document.body||document.documentElement).appendChild(e)}var K=null;function Le(e,t){let n=t?e.querySelector(t):e;n&&(n.style.cursor=`grab`,n.addEventListener(`mousedown`,t=>{if(t.target.closest(`[role="button"]`)||t.button!==0)return;t.preventDefault(),t.stopPropagation();let r=e.getBoundingClientRect();K={el:e,startX:t.clientX,startY:t.clientY,startLeft:r.left,startTop:r.top,pointerId:t.pointerId||0},n.style.cursor=`grabbing`,e.style.transition=`none`}))}document.addEventListener(`mousemove`,e=>{if(!K)return;let t=e.clientX-K.startX,n=e.clientY-K.startY,r=K.startLeft+t,i=K.startTop+n,a=window.innerWidth,o=window.innerHeight,s=K.el.getBoundingClientRect();r=Math.max(0,Math.min(r,a-s.width)),i=Math.max(0,Math.min(i,o-s.height)),K.el.style.left=r+`px`,K.el.style.top=i+`px`}),document.addEventListener(`mouseup`,()=>{if(!K)return;K.el.style.transition=``;let e=K.el.querySelector(`.aih-result-header`)||K.el;e.style.cursor=`grab`,K=null});function q(){try{return typeof chrome!=`object`||!chrome||typeof chrome.runtime!=`object`||!chrome.runtime?!1:!!chrome.runtime.id}catch{return!1}}function Re(){if(document.getElementById(`aih-selection-toolbar-styles`))return;let e=document.createElement(`style`);e.id=`aih-selection-toolbar-styles`,e.textContent=`
    #aih-selection-toolbar {
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 1px;
      padding: 4px 6px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid #e8e8e8;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      line-height: 1;
      user-select: none;
      -webkit-user-select: none;
      transition: opacity 0.15s ease, transform 0.15s ease;
      opacity: 0;
      transform: translateY(2px);
      white-space: nowrap;
    }
    #aih-selection-toolbar.show {
      opacity: 1;
      transform: translateY(0);
    }
    #aih-selection-toolbar .aih-tb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 4px 6px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
      outline: none;
      white-space: nowrap;
      line-height: 1;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-toolbar .aih-tb-btn:hover {
      background: #f0f0f0;
    }
    #aih-selection-toolbar .aih-tb-btn:active {
      background: #e4e4e4;
    }
    #aih-selection-toolbar .aih-tb-btn .aih-tb-icon {
      display: flex;
      align-items: center;
    }
    #aih-selection-toolbar .aih-tb-divider {
      width: 1px;
      height: 14px;
      background: #e0e0e0;
      margin: 0 1px;
      flex-shrink: 0;
    }
    #aih-selection-toolbar .aih-tb-grip {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 2px;
      color: #bbb;
      cursor: grab;
      flex-shrink: 0;
      border-radius: 6px;
      transition: color 0.15s;
    }
    #aih-selection-toolbar .aih-tb-grip:hover {
      color: #666;
    }
    #aih-selection-toolbar .aih-tb-grip:active {
      cursor: grabbing;
    }
    #aih-selection-toolbar .aih-tb-btn.primary {
      background: #3b82f6;
      color: #fff;
      font-weight: 500;
    }
    #aih-selection-toolbar .aih-tb-btn.primary:hover {
      background: #2563eb;
    }
    #aih-selection-toolbar .aih-tb-btn.primary .aih-tb-icon {
      color: #fff;
    }
    
    /* 溢出下拉菜单 */
    .aih-overflow-dropdown {
      position: fixed;
      z-index: 2147483646;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid #e8e8e8;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
      padding: 4px;
      min-width: 140px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    }
    .aih-overflow-dropdown .aih-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
      outline: none;
      font-family: inherit;
      white-space: nowrap;
      text-align: left;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    .aih-overflow-dropdown .aih-dropdown-item:hover {
      background: #f0f0f0;
    }
    .aih-overflow-dropdown .aih-dropdown-item .aih-tb-icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    /* 下拉菜单分隔线 */
    .aih-overflow-dropdown .aih-dropdown-divider {
      height: 1px;
      background: #e8e8e8;
      margin: 4px 8px;
    }
    /* 下拉菜单设置按钮 */
    .aih-overflow-dropdown .aih-dropdown-settings {
      color: #555;
    }
    .aih-overflow-dropdown .aih-dropdown-settings:hover {
      background: #f0f0f0;
      color: #667eea;
    }
    
    /* 问问AI 内联输入框 */
    #aih-selection-toolbar .aih-tb-buttons {
      display: flex;
      align-items: center;
      gap: 1px;
    }
    #aih-selection-toolbar .aih-tb-ask-wrap {
      display: flex;
      align-items: center;
      gap: 0;
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      width: 75px;
      flex-shrink: 0;
      transition: width 0.2s ease;
    }
    #aih-selection-toolbar .aih-tb-ask-input {
      flex: 1;
      min-width: 0;
      padding: 4px 6px;
      margin: 0;
      border: none;
      background: transparent;
      color: #333;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      line-height: 1.4;
      transition: flex 0.2s ease;
      box-sizing: border-box;
    }
    #aih-selection-toolbar .aih-tb-ask-input::placeholder {
      color: #bbb;
    }
    #aih-selection-toolbar .aih-tb-ask-send {
      flex-shrink: 0;
      padding: 4px 6px;
      border-radius: 0;
    }
    /* ask 模式：工具栏宽度限制 360px，输入框撑满 */
    #aih-selection-toolbar.aih-ask-mode {
      max-width: 360px;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-ask-wrap {
      flex: 1;
      width: auto;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-ask-input {
      flex: 1;
      width: auto;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-buttons {
      display: none;
    }
    
    /* 结果面板 */
    #aih-selection-result {
      position: fixed;
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      width: 420px;
      max-width: 92vw;
      max-height: 520px;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid #e8e8e8;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.65;
      color: #333;
      overflow: hidden;
      animation: aih-panel-in 0.2s ease-out;
    }
    @keyframes aih-panel-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #aih-selection-result .aih-result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      padding: 10px 14px;
      border-bottom: 1px solid #f0f0f0;
      background: #fafafa;
      font-size: 15px;
      color: #555;
      font-weight: 600;
    }
    #aih-selection-result .aih-result-header-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    #aih-selection-result .aih-result-lock,
    #aih-selection-result .aih-result-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #999;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      padding: 0;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-result-lock:hover,
    #aih-selection-result .aih-result-close:hover {
      background: #e8e8e8;
      color: #555;
    }
    #aih-selection-result .aih-result-lock.locked {
      color: #3b82f6;
    }
    #aih-selection-result .aih-result-body {
      padding: 12px 14px;
      word-break: break-word;
    }
    #aih-selection-result .aih-result-body p {
      margin: 0 0 8px;
    }
    #aih-selection-result .aih-result-body p:last-child {
      margin-bottom: 0;
    }
    #aih-selection-result .aih-result-body pre {
      background: #f5f5f5;
      padding: 10px 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
      margin: 8px 0;
    }
    #aih-selection-result .aih-result-body code {
      font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      background: #f0f0f0;
      padding: 1px 4px;
      border-radius: 3px;
    }
    #aih-selection-result .aih-result-body pre code {
      background: none;
      padding: 0;
    }
    #aih-selection-result .aih-result-body ul, 
    #aih-selection-result .aih-result-body ol {
      padding-left: 20px;
      margin: 8px 0;
    }
    #aih-selection-result .aih-result-body li {
      margin-bottom: 4px;
    }
    #aih-selection-result .aih-result-body h1,
    #aih-selection-result .aih-result-body h2,
    #aih-selection-result .aih-result-body h3,
    #aih-selection-result .aih-result-body h4 {
      margin: 12px 0 6px;
      font-weight: 600;
    }
    #aih-selection-result .aih-result-body h1 { font-size: 1.3em; }
    #aih-selection-result .aih-result-body h2 { font-size: 1.15em; }
    #aih-selection-result .aih-result-body h3 { font-size: 1.05em; }
    #aih-selection-result .aih-result-body blockquote {
      border-left: 3px solid #3b82f6;
      margin: 8px 0;
      padding: 4px 12px;
      color: #666;
      background: #f8f9fa;
      border-radius: 0 4px 4px 0;
    }
    #aih-selection-result .aih-result-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
      font-size: 13px;
    }
    #aih-selection-result .aih-result-body th,
    #aih-selection-result .aih-result-body td {
      border: 1px solid #e0e0e0;
      padding: 6px 10px;
      text-align: left;
    }
    #aih-selection-result .aih-result-body th {
      background: #f5f5f5;
      font-weight: 600;
    }
    #aih-selection-result .aih-result-body a {
      color: #3b82f6;
      text-decoration: none;
    }
    #aih-selection-result .aih-result-body a:hover {
      text-decoration: underline;
    }
    #aih-selection-result .aih-result-body hr {
      border: none;
      border-top: 1px solid #e0e0e0;
      margin: 12px 0;
    }
    #aih-selection-result .aih-result-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 14px;
      color: #888;
      font-size: 13px;
    }
    #aih-selection-result .aih-result-scroll {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: auto;
    }
    #aih-selection-result .aih-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid #e0e0e0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: aih-spin 0.8s linear infinite;
    }
    @keyframes aih-spin {
      to { transform: rotate(360deg); }
    }
    #aih-selection-result .aih-result-error {
      padding: 16px 14px;
      color: #e53e3e;
      font-size: 13px;
    }
    #aih-selection-result .aih-result-footer {
      display: flex;
      gap: 6px;
      padding: 8px 14px;
      background: #fafafa;
    }
    #aih-selection-result .aih-result-footer-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #666;
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-result-footer-btn:hover {
      background: #e8e8e8;
      color: #333;
    }
    #aih-selection-result .aih-result-footer-btn .aih-tb-icon {
      display: flex;
      align-items: center;
    }
    /* 推荐追问 */
    #aih-selection-result .aih-result-suggestions {
      padding: 10px 14px;
      border-top: 1px solid #f0f0f0;
    }
    #aih-selection-result .aih-suggestions-label {
      font-size: 11px;
      color: #999;
      margin-bottom: 8px;
      font-weight: 500;
    }
    #aih-selection-result .aih-suggestions-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #aih-selection-result .aih-suggestion-chip {
      display: block;
      width: 100%;
      text-align: left;
      padding: 7px 10px;
      border: 1px solid #e8e8e8;
      border-radius: 8px;
      background: #fafafa;
      color: #333;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      outline: none;
      font-family: inherit;
      line-height: 1.4;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-suggestion-chip:hover {
      background: #eff6ff;
      border-color: #3b82f6;
      color: #2563eb;
    }
    /* 追问输入框 */
    #aih-selection-result .aih-result-followup {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      padding: 8px 14px;
      border-top: 1px solid #f0f0f0;
    }
    #aih-selection-result .aih-followup-wrap {
      display: flex;
      align-items: center;
      flex: 1;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      transition: border-color 0.15s;
    }
    #aih-selection-result .aih-followup-wrap:focus-within {
      border-color: #3b82f6;
    }
    #aih-selection-result .aih-followup-input {
      flex: 1;
      padding: 6px 8px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      color: #333;
    }
    #aih-selection-result .aih-followup-input::placeholder {
      color: #bbb;
    }
    #aih-selection-result .aih-followup-send {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 6px 8px;
      border: none;
      border-radius: 0;
      background: transparent;
      color: #3b82f6;
      cursor: pointer;
      transition: color 0.15s;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-followup-send:hover {
      color: #2563eb;
    }
  `,document.head.appendChild(e)}var J=[{id:`ai-search`,name:`AI搜索`,systemPrompt:`使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。`,builtin:!0,order:0},{id:`explain`,name:`解释`,systemPrompt:`对选中的内容进行解释说明，帮助理解其含义。`,builtin:!0,order:1},{id:`translate`,name:`翻译`,systemPrompt:`将选中的内容翻译成中文。`,builtin:!0,order:2},{id:`summary`,name:`总结`,systemPrompt:`对选中的内容进行归纳总结，提炼关键要点。`,builtin:!0,order:3},{id:`copy`,name:`复制`,systemPrompt:`将选中内容复制到剪贴板。`,builtin:!0,order:99}];function ze(){return new Promise(e=>{if(!q()){R=[...J],e(R);return}if(R){e(R);return}try{chrome.storage.local.get([`toolbarTools`,`toolbarIconOnly`],t=>{let n=t.toolbarTools&&t.toolbarTools.length>0?t.toolbarTools:J,r=new Map(J.map(e=>[e.id,e]));R=n.map(e=>e.builtin&&r.has(e.id)?{...e,systemPrompt:r.get(e.id).systemPrompt}:e),z=t.toolbarIconOnly||!1,e(R)})}catch{R=[...J],e(R)}})}function Be(){R=null,z=!1,ze()}function Ve(e){return{"ai-search":y.search,explain:y.explain,translate:y.translate,summary:y.summary,copy:y.copy}[e]||y.sparkle}function He(){B||(B=document.createElement(`div`),B.id=`aih-overflow-dropdown`,B.className=`aih-overflow-dropdown`,B.style.display=`none`,G(B),document.addEventListener(`click`,e=>{B&&B.style.display===`block`&&!B.contains(e.target)&&!e.target.closest(`.aih-tb-btn-overflow`)&&(B.style.display=`none`)}))}function Ue(e){B||He();let t=e.map(e=>{let t=Ve(e.id);return`<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${e.id}">
      <span class="aih-tb-icon">${t}</span>${e.name}
    </div>`}).join(``);t+=`<div class="aih-dropdown-divider"></div>`,t+=`<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="打开配置页面">
    <span class="aih-tb-icon">${y.gear}</span>设置
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="暂时隐藏直到页面刷新">
    <span class="aih-tb-icon">${y.eyeOff}</span>本次临时禁用
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="在此网站禁用工具栏">
    <span class="aih-tb-icon">${y.block}</span>在此网站禁用
  </div>`,B.innerHTML=t,B._clickHandler=e=>{if(e.target.closest(`.aih-dropdown-settings`)){e.stopPropagation(),B.style.display=`none`;try{chrome.runtime.sendMessage({type:`OPEN_OPTIONS_PAGE`,hash:`toolbar`}).catch(()=>{})}catch{}return}if(e.target.closest(`.aih-dropdown-block`)){e.stopPropagation(),e.preventDefault(),B.style.display=`none`,mt();return}if(e.target.closest(`.aih-dropdown-hide`)){e.stopPropagation(),e.preventDefault(),B.style.display=`none`,Fe=!0,$(),Y(),M=``;return}let t=e.target.closest(`[data-action]`);t&&(e.stopPropagation(),B.style.display=`none`,ot(t.dataset.action,M))},B.addEventListener(`click`,B._clickHandler),B.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&(e.preventDefault(),t.click())}})}async function We(){if(b)return;await ze();let e=[...R].sort((e,t)=>e.order-t.order),t=e.find(e=>e.id===`ai-search`),n=e.filter(e=>e.id!==`ai-search`&&e.id!==`copy`),r=n.slice(0,Ie-1),i=n.slice(Ie-1);b=document.createElement(`div`),b.id=`aih-selection-toolbar`;let a=`<span class="aih-tb-buttons">`;a+=`<span class="aih-tb-grip" title="拖拽移动">${y.grip}</span>`;let o=z;t&&(a+=`<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="AI 搜索">
      <span class="aih-tb-icon">${y.search}</span>${o?``:`AI搜索`}
    </div>`),r.forEach(e=>{let t=Ve(e.id);a+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="${e.id}" title="${e.name}">
      <span class="aih-tb-icon">${t}</span>${o?``:e.name}
    </div>`}),a+=`<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="更多工具">
    <span class="aih-tb-icon">${y.more}</span>
  </div>`,Ue(i),a+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="复制选中内容">
    <span class="aih-tb-icon">${y.copy}</span>${o?``:`复制`}
  </div>`,a+=`</span>`,a+=`<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="问问..." />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="发送">
      <span class="aih-tb-icon">${y.send}</span>
    </div>
  </span>`,b.innerHTML=a,b.addEventListener(`click`,e=>{if(e.target.closest(`.aih-tb-btn-overflow`)){e.stopPropagation();let t=e.target.closest(`.aih-tb-btn-overflow`).getBoundingClientRect();B&&(B.style.display=B.style.display===`block`?`none`:`block`,B.style.top=t.bottom+4+`px`,B.style.left=t.right-160+`px`);return}let t=e.target.closest(`[data-action]`);if(!t)return;e.stopPropagation();let n=t.dataset.action;ot(n,M)}),b.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&!t.classList.contains(`aih-tb-ask-send`)&&(e.preventDefault(),t.click())}}),G(b);let s=b.querySelector(`.aih-tb-ask-input`),c=b.querySelector(`.aih-tb-ask-send`);b.querySelector(`.aih-tb-buttons`);let l=()=>{let e=s.value.trim();if(e){let t=w;d(),s.value=``,Qe(e,t),$()}},u=()=>{if(C)return;C=!0,w=M||``;let e=window.getSelection();e.rangeCount>0&&(T=e.getRangeAt(0).cloneRange());let t=b.getBoundingClientRect().right;E=b.style.left,b.classList.add(`aih-ask-mode`),b.style.width=`360px`;let n=Math.max(8,t-360);b.style.left=n+`px`,requestAnimationFrame(()=>{if(T){let e=window.getSelection();e.removeAllRanges(),e.addRange(T)}requestAnimationFrame(()=>{s.focus()})})},d=()=>{C&&(C=!1,w=``,T=null,b.classList.remove(`aih-ask-mode`),b.style.width=``,E&&=(b.style.left=E,``))};s.addEventListener(`focus`,()=>{C||u()}),s.addEventListener(`mousedown`,e=>{C||(e.preventDefault(),u())}),s.addEventListener(`blur`,()=>{setTimeout(()=>{C&&!b.contains(document.activeElement)&&(d(),$())},150)}),s.addEventListener(`keydown`,e=>{e.key===`Escape`?(e.preventDefault(),e.stopPropagation(),d(),s.blur()):e.key===`Enter`&&(e.preventDefault(),e.stopPropagation(),l())}),c.addEventListener(`mousedown`,e=>{e.preventDefault(),e.stopPropagation(),l()}),Le(b,`.aih-tb-grip`)}function Ge(){if(x)return;x=document.createElement(`div`),x.id=`aih-selection-result`,x.innerHTML=`
    <div class="aih-result-header">
      <span>${y.sparkle} AI 回答</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="锁定窗口">${y.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="关闭">${y.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="复制全部内容">
          <span class="aih-tb-icon">${y.copyLarge}</span>复制
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="重新生成答案">
          <span class="aih-tb-icon">${y.refresh}</span>重新生成
        </div>
      </div>
      <div class="aih-result-suggestions" style="display:none;">
        <div class="aih-suggestions-label">💡 推荐追问</div>
        <div class="aih-suggestions-list"></div>
      </div>
    </div>
    <div class="aih-result-followup">
      <span class="aih-followup-wrap">
        <input type="text" class="aih-followup-input" placeholder="继续提问..." />
        <div class="aih-followup-send" role="button" tabindex="0" title="发送到侧边栏">${y.send}</div>
      </span>
    </div>
  `,x.querySelector(`.aih-result-close`).addEventListener(`click`,e=>{e.stopPropagation(),Y()}),x.querySelector(`.aih-result-lock`).addEventListener(`click`,e=>{e.stopPropagation(),Xe()}),x.querySelector(`.aih-result-footer`).addEventListener(`click`,e=>{e.stopPropagation();let t=e.target.closest(`[data-action]`)?.dataset?.action;if(t===`regenerate-result`){if(!j||!A)return;pt(j,A,Pe)}else t===`copy-result`&&ct()});let e=x.querySelector(`.aih-followup-input`);x.querySelector(`.aih-followup-send`).addEventListener(`click`,t=>{t.stopPropagation();let n=e.value.trim();n&&(Ze(n),e.value=``)}),e.addEventListener(`keydown`,t=>{if(t.key===`Enter`){t.preventDefault();let n=e.value.trim();n&&(Ze(n),e.value=``)}}),x.querySelector(`.aih-suggestions-list`).addEventListener(`click`,e=>{let t=e.target.closest(`.aih-suggestion-chip`);if(!t)return;e.stopPropagation();let n=t.dataset.question;n&&Ze(n)}),x.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&(e.preventDefault(),t.click())}}),G(x),Le(x,`.aih-result-header`)}function Ke(e,t,n,r=[]){if(!x)return;G(x);let i=window.innerWidth,a=window.innerHeight;x.style.display=`flex`,x.style.left=`-9999px`,x.style.top=`-9999px`;let o=x.querySelector(`.aih-result-body`);o.innerHTML=n;let s=x.querySelector(`.aih-result-suggestions`),c=x.querySelector(`.aih-suggestions-list`);r.length>0&&s&&c?(c.innerHTML=r.map(e=>`<div class="aih-suggestion-chip" role="button" tabindex="0" data-question="${Z(e)}">${Z(e)}</div>`).join(``),s.style.display=`block`):s&&(s.style.display=`none`),requestAnimationFrame(()=>{let n=x.getBoundingClientRect(),r=n.width||420,o=Math.min(n.height||200,520),s=e-r/2;s<8&&(s=8),s+r>i-8&&(s=i-r-8);let c=t-o-8;c<8&&(c=t+8),x.style.left=s+`px`,x.style.top=c+`px`,x.style.maxHeight=Math.min(520,a-c-16)+`px`,D=!0,G(x)})}function qe(e,t){if(!x)return;I={x:e,y:t},O=!1,X();let n=x.querySelector(`.aih-result-suggestions`);n&&(n.style.display=`none`);let r=x.querySelector(`.aih-followup-input`);r&&(r.value=``),G(x),x.style.display=`flex`;let i=x.querySelector(`.aih-result-body`);i.innerHTML=`<div class="aih-result-loading"><div class="aih-spinner"></div>AI 正在思考...</div>`,Ye(x,e,t),D=!0,$()}function Je(e,t,n){if(!x)return;O=!1,k=``,X(),G(x),x.style.display=`flex`;let r=x.querySelector(`.aih-result-body`);r.innerHTML=`<div class="aih-result-error">请求失败: ${Z(n)}</div>`,Ye(x,e,t),D=!0}function Ye(e,t,n){let r=window.innerWidth,i=window.innerHeight;e.style.left=`-9999px`,e.style.top=`-9999px`,requestAnimationFrame(()=>{let a=e.getBoundingClientRect(),o=a.width||420,s=Math.min(a.height||200,520),c=t-o/2;c<8&&(c=8),c+o>r-8&&(c=r-o-8);let l=n-s-8;l<8&&(l=n+8),e.style.left=c+`px`,e.style.top=l+`px`,e.style.maxHeight=Math.min(520,i-l-16)+`px`,G(e)})}function Y(){x&&(x.style.display=`none`,D=!1,O=!1,k=``,X())}function Xe(){O=!O,X()}function X(){if(!x)return;let e=x.querySelector(`.aih-result-lock`);e&&(O?(e.innerHTML=y.lock,e.classList.add(`locked`),e.title=`解除锁定`):(e.innerHTML=y.unlock,e.classList.remove(`locked`),e.title=`锁定窗口`))}function Ze(e){if(!e||!q())return;let t=M||A||``;try{chrome.runtime.sendMessage({type:`DIRECT_SEND`,text:e,selectedText:t}).catch(e=>{console.error(`[SelectionToolbar] 发送追问到侧边栏失败:`,e)})}catch{}}function Qe(e,t){if(!(!e||!q()))try{chrome.runtime.sendMessage({type:`DIRECT_SEND`,text:e,selectedText:t||``}).catch(e=>{console.error(`[SelectionToolbar] 发送到侧边栏失败:`,e)})}catch{}}function Z(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function Q(e,t){if(!b||!M||D)return;G(b);let n=window.innerWidth,r=window.innerHeight;b.style.display=`flex`,lastToolbarShowTime=Date.now(),requestAnimationFrame(()=>{let i=b.getBoundingClientRect(),a=i.width||300,o=i.height||40,s=e-a/2;s<8&&(s=8),s+a>n-8&&(s=n-a-8);let c=t-o-10;c<8&&(c=t+10),c<8&&(c=8),c+o>r-8&&(c=r-o-8),b.style.left=s+`px`,b.style.top=c+`px`,S||=(b.classList.add(`show`),!0)})}function $(){!b||!S||(C&&(C=!1,w=``,T=null,b.classList.remove(`aih-ask-mode`),b.style.width=``,E&&=(b.style.left=E,``)),b.classList.remove(`show`),b.style.display=`none`,S=!1)}function $e(){if(!b)return{x:0,y:0};let e=b.getBoundingClientRect();return{x:e.left+e.width/2,y:e.top}}function et(e){let t=e.getBoundingClientRect();return{x:t.left+t.width/2,y:t.top}}function tt(){if(!q()||!N)return;if(!U){let e=n();if(console.log(`[SelectionToolbar] iframe onSelectionChange text:`,e.text?.substring(0,30),`currentSelectedText:`,!!M,`pendingIframeSelection:`,!!W),e.text&&e.text.length>=2){let t=a(e.range);W={text:e.text,x:t.x,y:t.y},console.log(`[SelectionToolbar] iframe pendingIframeSelection 已设置`)}else if(M){M=``,W=null;try{chrome.runtime.sendMessage({type:`IFRAME_SELECTION_CLEAR`}).catch(()=>{})}catch{}}return}if(P.length>0&&P.includes(window.location.hostname)||Fe)return;let e=window.getSelection(),t=e?e.toString().trim():``,r=null;if(t&&t.length>=2&&e.rangeCount>0)r=e.getRangeAt(0);else{let e=n();e.text&&e.text.length>=2&&(t=e.text,r=e.range)}if(!t||t.length<2){C||$(),M=``,L=null;return}let i=5e3,o=t.length>i?t.substring(0,i)+`...`:t;if(r){let e=r.commonAncestorContainer,t=e.nodeType===Node.TEXT_NODE?e.parentElement.closest(`[contenteditable], input, textarea`):e.closest&&e.closest(`[contenteditable], input, textarea`);if(t instanceof HTMLElement&&(t.tagName===`INPUT`||t.tagName===`TEXTAREA`)){$(),M=``,L=null;return}}M=o,L=!0}function nt(e){if(!(b&&b.contains(e.target))&&!(x&&x.contains(e.target))){if(F){F=!1;return}D&&!O&&Y(),S&&!C&&$(),chrome.runtime.sendMessage({type:`IFRAME_CLICK_DISMISS`}).catch(()=>{})}}function rt(){if(console.log(`[SelectionToolbar] onMouseUp isTopFrame:`,U,`pendingSelection:`,L,`pendingIframeSelection:`,!!W,`currentSelectedText:`,!!M,`isToolbarVisible:`,S,`toolbarEl:`,!!b),!U){if(W){F=!0,W.text,M=W.text;try{window.parent.postMessage({type:`IFRAME_SELECTION`,text:W.text,x:W.x,y:W.y},`*`)}catch{}try{chrome.runtime.sendMessage({type:`IFRAME_SELECTION`,text:W.text,x:W.x,y:W.y}).catch(()=>{})}catch{}W=null}return}if(!S&&L&&M){F=!0;let e=window.innerWidth/2,t=window.innerHeight/2,r=window.getSelection();if(r&&r.rangeCount>0){let n=r.getRangeAt(0).getBoundingClientRect();(n.width>0||n.height>0)&&(e=n.left+n.width/2,t=n.top)}if(e===window.innerWidth/2&&t===window.innerHeight/2){let r=n();if(r.text&&r.text.length>=2){let n=a(r.range);e=n.x,t=n.y}}chrome.runtime.sendMessage({type:`IFRAME_CLICK_DISMISS`}).catch(()=>{}),Q(e,t),L=null}}function it(){if(C)return;if(!U&&M){let e=n();if(e.text){let t=a(e.range);try{window.parent.postMessage({type:`IFRAME_SELECTION`,text:e.text,x:t.x,y:t.y},`*`)}catch{}try{chrome.runtime.sendMessage({type:`IFRAME_SELECTION`,text:e.text,x:t.x,y:t.y}).catch(()=>{})}catch{}}return}if(!S)return;let e=window.getSelection();if(e&&e.rangeCount>0&&M){let t=e.getRangeAt(0).getBoundingClientRect();if(t.width>0||t.height>0){Q(t.left+t.width/2,t.top);return}}let t=n();if(t.text&&t.text.length>=2&&M){let e=a(t.range);Q(e.x,e.y);return}$()}function at(){C||S&&$()}function ot(e,t){if(!t)return;if(A=t,e===`copy`){st(t),$();return}if(j=e,Pe=``,[`ai-search`,`explain`,`translate`,`summary`].includes(e)){pt(e,t);return}let n=R.find(t=>t.id===e);n&&(Pe=n.systemPrompt||``,pt(e,t,n.systemPrompt))}function st(e){lt(e).then(()=>{ft()}).catch(e=>{console.error(`[SelectionToolbar] 复制失败:`,e),dt()})}function ct(){let e=k;e&&lt(e).then(()=>{ft()}).catch(e=>{console.error(`[SelectionToolbar] 复制结果失败:`,e),dt()})}async function lt(e){if(!navigator.clipboard)return ut(e);try{await navigator.clipboard.writeText(e)}catch(t){if(t.name===`NotAllowedError`||t.name===`SecurityError`)return ut(e);throw t}}function ut(e){return new Promise((t,n)=>{let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-9999px`,r.style.opacity=`0`,G(r);try{r.select(),r.setSelectionRange(0,e.length),document.execCommand(`copy`)?t():n(Error(`execCommand copy failed`))}catch(e){n(e)}finally{r.remove()}})}function dt(){let e=document.getElementById(`aih-copy-toast`);e&&e.remove();let t=document.createElement(`div`);t.id=`aih-copy-toast`,t.textContent=`复制失败，请手动复制`,t.style.cssText=`
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(239, 68, 68, 0.9);
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: none;
    animation: aih-toast-in 0.2s ease-out, aih-toast-out 0.2s 1.5s ease-in forwards;
  `,G(t),t.style.zIndex=`2147483647`,setTimeout(()=>t.remove(),1800)}function ft(){let e=document.getElementById(`aih-copy-toast`);e&&e.remove();let t=document.createElement(`div`);if(t.id=`aih-copy-toast`,t.textContent=`已复制`,t.style.cssText=`
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: none;
    animation: aih-toast-in 0.2s ease-out, aih-toast-out 0.2s 1s ease-in forwards;
  `,!document.getElementById(`aih-toast-anim`)){let e=document.createElement(`style`);e.id=`aih-toast-anim`,e.textContent=`
      @keyframes aih-toast-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      @keyframes aih-toast-out { from { opacity: 1; } to { opacity: 0; } }
    `,document.head.appendChild(e)}G(t),t.style.zIndex=`2147483647`,setTimeout(()=>t.remove(),1300)}function pt(e,t,n){if(!q()){console.warn(`[SelectionToolbar] 扩展上下文已失效，请刷新页面`);return}let r={"ai-search":`搜索并分析以下内容：\n\n${t}`,explain:`用1-3句话简洁解释以下内容，不需要展开说明。\n\n${t}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`,translate:`翻译以下内容，只输出翻译结果：\n\n${t}`,summary:`用3-5个要点总结以下内容，每条要点一句话。\n\n${t}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`},i=n?`请处理以下内容：\n\n${t}`:r[e]||t;if(e===`ai-search`){$(),window.getSelection().removeAllRanges();try{chrome.runtime.sendMessage({type:`SELECTION_TOOLBAR_ACTION`,action:e,text:t,prompt:i}).catch(e=>{console.error(`[SelectionToolbar] 发送消息失败:`,e)})}catch{}return}Ge();let a={"ai-search":`AI搜索`,explain:`解释`,translate:`翻译`,summary:`总结`}[e];if(!a&&R){let t=R.find(t=>t.id===e);a=t?t.name:`AI 回答`}let o=x.querySelector(`.aih-result-header span`);o&&(o.innerHTML=`${y.sparkle} ${a||`AI 回答`}`);let s=D&&x?et(x):$e();qe(s.x,s.y),chrome.runtime.sendMessage({type:`SELECTION_TOOLBAR_ACTION`,action:e,text:t,prompt:i,systemPrompt:n||``}).catch(e=>{console.error(`[SelectionToolbar] 发送消息失败:`,e),Je(s.x,s.y,e.message)})}chrome.runtime.onMessage.addListener((e,t,n)=>{if(q()){if(e.type===`IFRAME_SELECTION`){if(!U)return;console.log(`[SelectionToolbar] 收到 IFRAME_SELECTION text:`,e.text?.substring(0,30),`isToolbarVisible:`,S,`isResultVisible:`,D),M=e.text;let t=e.x,n=e.y;if(window.top!==window&&window.frameElement)try{let r=window.frameElement.getBoundingClientRect();t=e.x-r.left,n=e.y-r.top}catch{}if(S&&b&&M){requestAnimationFrame(()=>{let e=window.innerWidth,r=b.offsetWidth||300,i=b.offsetHeight||40,a=t-r/2;a<8&&(a=8),a+r>e-8&&(a=e-r-8);let o=n-i-8;o<8&&(o=n+8),b.style.left=a+`px`,b.style.top=o+`px`});return}L={x:t,y:n},M&&M.length>=2&&Q(t,n);return}if(e.type===`IFRAME_SELECTION_CLEAR`){if(!U)return;S&&!C&&($(),M=``);return}if(e.type===`IFRAME_CLICK_DISMISS`){S&&b&&Date.now()-lastToolbarShowTime>300&&($(),M=``),D&&!O&&Y();return}if(U){if(e.type===`SELECTION_TOOLBAR_STREAM_START`){V=``;return}if(e.type===`SELECTION_TOOLBAR_STREAM_CHUNK`){if(V+=e.delta||``,x&&D){let e=x.querySelector(`.aih-result-body`);e&&(e.querySelector(`.aih-result-content-stream`)||(e.innerHTML=`<div class="aih-result-content-stream"></div>`),e.innerHTML=`<div class="aih-result-content-stream">`+Z(V).replace(/\n/g,`<br>`)+`</div>`)}return}if(e.type===`SELECTION_TOOLBAR_STREAM_DONE`){e.finalContent&&(V=e.finalContent);let t=V||`无响应`;k=V;let n=t,r=[],i=t.indexOf(`---SUGGESTIONS---`);i!==-1&&(n=t.substring(0,i).trim(),k=n,r=t.substring(i+17).split(`
`).map(e=>e.replace(/^[\d]+[\.\、\s]+/,``).trim()).filter(e=>e.length>0).slice(0,3));let a=typeof marked<`u`?marked.parse(n):Z(n).replace(/\n/g,`<br>`);Ke(I.x,I.y,a,r),V=``;return}if(e.type===`SELECTION_TOOLBAR_RESULT`)if(e.error)k=``,Je(I.x,I.y,e.error);else{let t=e.content||`无响应`,n=t;k=t;let r=[],i=t.indexOf(`---SUGGESTIONS---`);i!==-1&&(n=t.substring(0,i).trim(),k=n,r=t.substring(i+17).split(`
`).map(e=>e.replace(/^[\d]+[\.\、\s]+/,``).trim()).filter(e=>e.length>0).slice(0,3));let a=typeof marked<`u`?marked.parse(n):Z(n).replace(/\n/g,`<br>`);Ke(I.x,I.y,a,r)}}}});function mt(){if(!q())return;let e=window.location.hostname;try{chrome.storage.local.get([`blockedDomains`],t=>{try{let n=t.blockedDomains||[];n.includes(e)||(n.push(e),chrome.storage.local.set({blockedDomains:n},()=>{P=n,$(),Y(),M=``}))}catch{}})}catch{}}function ht(){q()&&chrome.storage.local.get([`enableSelectionToolbar`,`blockedDomains`],e=>{N=e.enableSelectionToolbar===void 0?!0:!!e.enableSelectionToolbar,P=e.blockedDomains||[],console.log(`[SelectionToolbar] 开关状态:`,N?`已启用`:`已禁用`,`屏蔽域名:`,P.length)})}chrome.storage.onChanged.addListener((e,t)=>{q()&&(t===`local`&&e.enableSelectionToolbar&&(N=!!e.enableSelectionToolbar.newValue,N||($(),Y(),M=``)),t===`local`&&e.blockedDomains&&(P=e.blockedDomains.newValue||[]),t===`local`&&e.toolbarTools&&Be())});function gt(){Re(),We(),Ge(),ht(),document.addEventListener(`selectionchange`,tt),document.addEventListener(`click`,nt,!0),document.addEventListener(`mouseup`,rt,!0),window.addEventListener(`scroll`,it,!0),window.addEventListener(`resize`,at),window.addEventListener(`message`,e=>{if(e.data?.type===`IFRAME_SELECTION`&&U){M=e.data.text;let t=e.data.x,n=e.data.y;if(window.top!==window&&window.frameElement)try{let r=window.frameElement.getBoundingClientRect();t=e.data.x-r.left,n=e.data.y-r.top}catch{}if(S&&b&&M){requestAnimationFrame(()=>{let e=window.innerWidth,r=b.offsetWidth||300,i=b.offsetHeight||40,a=t-r/2;a<8&&(a=8),a+r>e-8&&(a=e-r-8);let o=n-i-8;o<8&&(o=n+8),b.style.left=a+`px`,b.style.top=o+`px`});return}L={x:t,y:n},M&&M.length>=2&&Q(t,n);return}e.data?.type===`IFRAME_CLICK_DISMISS`&&U&&D&&!O&&Y()}),U&&(H=o(tt),new MutationObserver(()=>{s(H),H=o(tt)}).observe(document.body,{childList:!0,subtree:!0})),console.log(`[SelectionToolbar] 初始化完成`,U?`(顶层frame)`:`(子frame)`)}console.log(`[ContentScript] 内容脚本已加载 URL:`,window.location.href,`isTopFrame:`,window.top===window,`hasBody:`,!!document.body),document.addEventListener(`keydown`,e=>{(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key===`A`&&(e.preventDefault(),chrome.action.click()),e.altKey&&!e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:`CAPTURE_TAB_FROM_PAGE`})),e.altKey&&e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:`CAPTURE_REGION_FROM_PAGE`}))});var _t={GET_PAGE_TEXT:e=>c(e),GET_FULL_HTML:e=>l(e),QUERY_INTERACTIVE_ELEMENTS:e=>u(e),GET_SELECTED_CONTENT:e=>m(e.format),CLICK_ELEMENT:e=>he(e.selector,e.waitTime,e.timeout),FILL_FORM:e=>ve(e.fields,e.waitTime),SCROLL_TO:e=>ye(e),HOVER_ELEMENT:e=>ne(e.selector),KEYBOARD_INPUT:e=>Se(e),FILE_UPLOAD:e=>we(e.selector,e.fileName,e.fileContent,e.fileType),EXTRACT_TABLE:e=>h(e.selector,e.includeHeaders,e.format),EXTRACT_METADATA:()=>re(),EXTRACT_LINKS:e=>ae(e.filterType,e.includeImages),EXTRACT_FORMS:e=>oe(e.formSelector),EXTRACT_IMAGES:e=>se(e),SEARCH_IN_PAGE:e=>ce(e),PAGE_TO_MARKDOWN:e=>le(e.selector,e.includeImages,e.includeLinks,e.maxLength),PAGE_TO_JSON:e=>ue(e.selector,e.maxItems),FIND_SIMILAR_ELEMENTS:e=>de(e.selector,e.maxResults),GET_IFRAME_CONTENT:e=>fe(e.selector,e.includeNested,e.maxLength),HIGHLIGHT_TEXT:e=>ie(e.text,e.color),REMOVE_HIGHLIGHTS:()=>g(),SHADOW_DOM_QUERY:e=>Me(e.selector,e.deep,e.maxDepth,e.maxResults),MANAGE_STORAGE:e=>Ee(e),TEXT_TO_SPEECH:e=>Oe(e.text,e.lang,e.rate,e.pitch),INJECT_CSS:e=>Ne(e.css,e.targetSelector,e.injectMode),VIDEO_CONTROL:e=>ke(e.action,e.selector,e.value),COPY_TO_CLIPBOARD:e=>ee(e.text),PASTE_FROM_CLIPBOARD:()=>te(),WAIT_FOR_ELEMENT:e=>xe(e.selector,e.state,e.timeout),DRAG_AND_DROP:e=>Ce(e.sourceSelector,e.targetSelector),SELECT_DROPDOWN:e=>Te(e.triggerSelector,e.optionText,e.optionSelector,e.timeout),COLOR_PICKER:()=>De(),GENERATE_QRCODE:e=>je(e.content,e.size,e.errorCorrection,e.showImage),GET_ELEMENT_COUNT:e=>pe(e.selector,e.includeHidden),SCROLL_AND_COLLECT:e=>me(e),CLEAR_PAGE_DATA:e=>{try{let t=[];return e.site?window.location.href.includes(new URL(e.site).hostname)&&(localStorage.clear(),sessionStorage.clear(),t.push(`localStorage`,`sessionStorage`)):(localStorage.clear(),sessionStorage.clear(),t.push(`localStorage`,`sessionStorage`)),{success:!0,cleared:t}}catch(e){return{success:!1,error:e.message}}},START_REGION_SELECTION:()=>bt()},vt=new Set([`COPY_TO_CLIPBOARD`,`PASTE_FROM_CLIPBOARD`,`WAIT_FOR_ELEMENT`,`DRAG_AND_DROP`,`SELECT_DROPDOWN`,`SCROLL_AND_COLLECT`,`WATCH_ELEMENT`,`COLOR_PICKER`,`GENERATE_QRCODE`,`SCREENSHOT_ELEMENT`,`PAGE_TO_PDF`,`START_REGION_SELECTION`]),yt=new Set([`GET_PAGE_TEXT`,`GET_FULL_HTML`,`PAGE_TO_MARKDOWN`,`PAGE_TO_JSON`,`EXTRACT_METADATA`,`EXTRACT_TABLE`,`GET_ELEMENT_COUNT`,`SCROLL_AND_COLLECT`,`GET_IFRAME_CONTENT`,`QUERY_INTERACTIVE_ELEMENTS`]);chrome.runtime.onMessage.addListener((e,t,r)=>{if(yt.has(e.type)&&window.top!==window)return;if(e.action===`getSelectedText`){let e=window.getSelection()?.toString()?.trim()||``;if(e&&document.hasFocus())return r({text:e}),!0;let t=n();return t.text&&t.text.trim()&&document.hasFocus()&&r({text:t.text.trim()}),!0}let i=_t[e.type];if(!i)return;let a=i(e);if(vt.has(e.type)||a instanceof Promise)return Promise.resolve(a).then(r),!0;r(a)}),gt();function bt(){return new Promise(e=>{let t=document.createElement(`div`);t.id=`__region_select_overlay__`,t.style.cssText=`
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 2147483647; cursor: crosshair;
      background: rgba(0, 0, 0, 0.15);
    `;let n=document.createElement(`div`);n.id=`__region_select_box__`,n.style.cssText=`
      position: fixed; z-index: 2147483647; pointer-events: none;
      border: 2px dashed #667eea;
      background: rgba(102, 126, 234, 0.1);
      display: none;
    `;let r=document.createElement(`div`);r.style.cssText=`
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; pointer-events: none;
      padding: 8px 20px; border-radius: 20px;
      background: rgba(0, 0, 0, 0.75); color: #fff;
      font-size: 14px; font-family: sans-serif;
    `,r.textContent=`拖拽选择截图区域，按 Esc 取消`;let i=0,a=0,o=!1;function s(e){return{x:e.clientX,y:e.clientY}}function c(e,t,r,i){let a=Math.min(e,r),o=Math.min(t,i),s=Math.abs(r-e),c=Math.abs(i-t);n.style.left=a+`px`,n.style.top=o+`px`,n.style.width=s+`px`,n.style.height=c+`px`,n.style.display=`block`}function l(){t.remove(),n.remove(),r.remove(),document.removeEventListener(`keydown`,u,!0)}function u(t){t.key===`Escape`&&(t.preventDefault(),t.stopPropagation(),l(),e(null))}t.addEventListener(`mousedown`,e=>{if(e.button!==0)return;e.preventDefault(),e.stopPropagation();let{x:t,y:c}=s(e);i=t,a=c,o=!0,document.body.appendChild(n),document.body.appendChild(r)}),t.addEventListener(`mousemove`,e=>{if(!o)return;e.preventDefault();let{x:t,y:n}=s(e);c(i,a,t,n)}),t.addEventListener(`mouseup`,t=>{if(!o)return;t.preventDefault(),t.stopPropagation(),o=!1;let{x:n,y:r}=s(t),c={x:Math.min(i,n),y:Math.min(a,r),width:Math.abs(n-i),height:Math.abs(r-a)};if(l(),c.width<10||c.height<10){e(null);return}requestAnimationFrame(()=>e(c))}),document.addEventListener(`keydown`,u,!0),document.body.appendChild(t)})}
//# sourceMappingURL=content-BNwc1S_p.js.map