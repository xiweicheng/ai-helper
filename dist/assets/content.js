import{t as e}from"./logger-BEz2S157.js";function t(e,n=document,r=5,i=0){if(i>r)return null;try{if(n.querySelectorAll)for(let a of n.querySelectorAll(`*`)){if(a.shadowRoot){let n=t(e,a.shadowRoot,r,i+1);if(n)return n}if(a.tagName===`IFRAME`||a.tagName===`FRAME`)try{let n=a.contentDocument||a.contentWindow?.document;if(n){let a=t(e,n,r,i+1);if(a)return a}}catch{}}let a=n.querySelector?.(e);if(a)return a}catch{}return null}function n(e,t=document,r=5,i=0,a=new Set){if(i>r)return[];try{t.querySelectorAll&&(t.querySelectorAll(e).forEach(e=>{a.add(e)}),t.querySelectorAll(`*`).forEach(t=>{if(t.shadowRoot&&n(e,t.shadowRoot,r,i+1,a),t.tagName===`IFRAME`||t.tagName===`FRAME`)try{let o=t.contentDocument||t.contentWindow?.document;o&&n(e,o,r,i+1,a)}catch{}}))}catch{}return Array.from(a)}function r(e=document,t=5,n=0){if(n>t)return{text:``,range:null};try{let i=e.getSelection?.();if(i&&!i.isCollapsed&&i.rangeCount>0){let e=i.toString().trim();if(e)return{text:e,range:i.getRangeAt(0),depth:n,source:`shadow`}}if(e.querySelectorAll){for(let i of e.querySelectorAll(`*`))if(i.shadowRoot){let e=r(i.shadowRoot,t,n+1);if(e.text)return e}}}catch{}return{text:``,range:null}}function i(e=document,t=5,n=0,r=new Set){if(n>t||r.has(e))return``;r.add(e);let a=``;try{e.body?a+=e.body.innerText||``:e instanceof ShadowRoot&&(a+=e.textContent||``),e.querySelectorAll&&e.querySelectorAll(`*`).forEach(e=>{if(e.shadowRoot&&(a+=`
`+i(e.shadowRoot,t,n+1,r)),e.tagName===`IFRAME`||e.tagName===`FRAME`)try{let o=e.contentDocument||e.contentWindow?.document;o&&o.body&&(a+=`
`+i(o,t,n+1,r))}catch{}})}catch{}return a.trim().replace(/\n{3,}/g,`

`)}function a(e=document,t=5,n=0,r=new Set){if(n>t||r.has(e))return``;r.add(e);let i=``;try{e.documentElement?i=e.documentElement.outerHTML:e instanceof ShadowRoot&&(i=e.innerHTML||``);let o=[];e.querySelectorAll&&e.querySelectorAll(`*`).forEach(e=>{if(e.shadowRoot){let i=a(e.shadowRoot,t,n+1,r);i&&o.push(`<!-- shadow-root of ${e.tagName} -->\n${i}`)}if(e.tagName===`IFRAME`||e.tagName===`FRAME`)try{let i=e.contentDocument||e.contentWindow?.document;if(i&&i.documentElement){let e=a(i,t,n+1,r);e&&o.push(`<!-- iframe content -->\n${e}`)}}catch{}}),o.length>0&&(i+=`
<!-- Shadow DOM and iframe content -->
`+o.join(`
`))}catch{}return i}function o(e){if(!e)return{x:window.innerWidth/2,y:window.innerHeight/2};let t;try{t=e.getBoundingClientRect()}catch{t={left:0,top:0,width:0,height:0}}if(!t||t.width===0&&t.height===0){let n=e.commonAncestorContainer;if(n){let e=n.nodeType===Node.TEXT_NODE?n.parentElement:n;e&&e.getBoundingClientRect&&(t=e.getBoundingClientRect())}}let n=t.left+t.width/2,r=t.top;if(window.top!==window){let t=e.startContainer.ownerDocument;for(;t&&t!==window.top.document;){let e=t.defaultView?.frameElement;if(!e)break;let i=e.getBoundingClientRect();n+=i.left,r+=i.top,t=e.ownerDocument}}return{x:n,y:r}}function s(e,t=document,n=5,r=0,i=new Set){if(r>n||i.has(t))return i;try{let a=()=>e();t.addEventListener?.(`selectionchange`,a),i.add({root:t,listener:a}),t.querySelectorAll&&t.querySelectorAll(`*`).forEach(t=>{t.shadowRoot&&s(e,t.shadowRoot,n,r+1,i)})}catch{}return i}function c(e){for(let{root:t,listener:n}of e)try{t.removeEventListener?.(`selectionchange`,n)}catch{}e.clear()}function l(e={}){let{maxLength:t=5e4,includeHeadings:r=!0,includeLinks:a=!0}=e,o=i(),s={title:document.title||``,url:window.location.href,content:o.substring(0,t),wordCount:o.split(/\s+/).length};return r&&(s.headings=Array.from(n(`h1, h2, h3, h4, h5, h6`)).map(e=>({level:e.tagName,text:e.textContent.trim()})).filter(e=>e.text.length>0).slice(0,30)),a&&(s.links=Array.from(n(`a`)).map(e=>({text:e.textContent.trim(),href:e.href})).filter(e=>e.text.length>0).slice(0,50)),{success:!0,data:s}}function u(e={}){let{includeStyles:t=!1,maxLength:n=5e4}=e,r=a();return t||(r=r.replace(/\s*style="[^"]*"/gi,``)),{success:!0,content:JSON.stringify({title:document.title,url:window.location.href,html:r.substring(0,n),fullLength:r.length})}}function d(e={}){let{filterByText:t,elementTypes:r,maxResults:i=100}=e,a=[],o=new Set,s={button:`button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]`,input:`input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])`,select:`select`,textarea:`textarea`,a:`a[href]`,checkbox:`input[type="checkbox"]`,radio:`input[type="radio"]`,menuitem:`[role="menuitem"], [role="menu"], [role="menuitemcheckbox"], [role="menuitemradio"]`},c=[];return r&&r.length>0?r.forEach(e=>{s[e]&&c.push(s[e])}):c=Object.values(s),c.forEach(e=>{try{n(e).forEach(e=>{let n=f(e);if(o.has(n))return;o.add(n);let r=e.tagName.toLowerCase(),i=p(e),s=ee(e);if(t&&!i.toLowerCase().includes(t.toLowerCase()))return;let c={tag:r,selector:n,text:i.substring(0,100)};r===`a`?c.href=e.href:(r===`input`||r===`select`||r===`textarea`)&&(c.name=e.name,c.type=e.type||`text`,c.value=s,c.placeholder=e.placeholder),e.id&&(c.id=e.id),e.className&&typeof e.className==`string`&&(c.className=e.className.split(` `).filter(e=>e).slice(0,3).join(` `)),a.push(c)})}catch{}}),{success:!0,count:Math.min(a.length,i),total:a.length,elements:a.slice(0,i)}}function f(e){if(e.id)return`#${e.id}`;let t=[],n=e;for(;n&&n!==document.body&&n!==document.documentElement;){let e=n.tagName.toLowerCase();if(n.id){e=`#${n.id}`,t.unshift(e);break}if(n.className&&typeof n.className==`string`){let t=n.className.trim().split(/\s+/).filter(e=>e);t.length>0&&(e+=`.`+t[0])}let r=n.parentElement;if(r){let t=Array.from(r.children).filter(e=>e.tagName===n.tagName);if(t.length>1){let r=t.indexOf(n)+1;e+=`:nth-child(${r})`}}t.unshift(e),n=r}return t.join(` > `)}function p(e){if(e.tagName===`INPUT`||e.tagName===`TEXTAREA`)return e.value||e.placeholder||e.name||``;if(e.tagName===`SELECT`){let t=e.options[e.selectedIndex];return t?t.text:``}return e.textContent.trim()}function ee(e){return e.tagName===`INPUT`?e.type===`checkbox`||e.type===`radio`?e.checked?`checked`:`unchecked`:e.value:e.tagName===`SELECT`?e.value:``}function te(e=`text`){try{let t=window.getSelection();if(!t||t.isCollapsed||t.rangeCount===0)return{success:!1,error:`当前没有选中的内容`};let n={success:!0,data:{selectedCount:t.rangeCount,text:``}};if(e===`html`){let e=[];for(let n=0;n<t.rangeCount;n++){let r=t.getRangeAt(n).cloneContents(),i=document.createElement(`div`);i.appendChild(r),e.push(i.innerHTML)}n.data.html=e.join(`
`),n.data.text=t.toString()}else n.data.text=t.toString();return n}catch(e){return{success:!1,error:e.message}}}function m(e=`table`,n=!0,r=`json`){try{let i=t(e);if(!i)return{success:!1,error:`未找到匹配选择器的表格: ${e}`};let a=Array.from(i.querySelectorAll(`tr`)),o=[];return a.forEach((e,t)=>{let r=Array.from(e.querySelectorAll(`td, th`)).map(e=>e.textContent.trim());(n||t>0)&&o.push(r)}),r===`markdown`?o.length===0?{success:!0,content:`表格为空`}:{success:!0,content:`${`| ${o[0].join(` | `)} |`}\n${`| ${o[0].map(()=>`---`).join(` | `)} |`}\n${o.slice(1).map(e=>`| ${e.join(` | `)} |`).join(`
`)}`}:{success:!0,content:JSON.stringify({data:o,rowCount:o.length,columnCount:o[0]?.length||0}),data:o}}catch(e){return{success:!1,error:e.message}}}async function ne(e){try{return await navigator.clipboard.writeText(e),{success:!0,message:`已复制到剪贴板`}}catch{try{let t=document.createElement(`textarea`);return t.value=e,t.style.position=`fixed`,t.style.left=`-9999px`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),document.body.removeChild(t),{success:!0,message:`已复制到剪贴板（降级方案）`}}catch(e){return{success:!1,error:e.message}}}}async function re(){try{return{success:!0,content:await navigator.clipboard.readText()}}catch(e){return{success:!1,error:e.message}}}function ie(e){try{let n=t(e);if(!n)return{success:!1,error:`未找到元素: ${e}`};let r=new MouseEvent(`mouseenter`,{bubbles:!0,cancelable:!0,view:window});n.dispatchEvent(r);let i=new MouseEvent(`mouseover`,{bubbles:!0,cancelable:!0,view:window});return n.dispatchEvent(i),{success:!0,message:`已在元素上触发悬停效果: ${e}`}}catch(e){return{success:!1,error:e.message}}}function ae(){try{let e=e=>{let t=document.querySelector(`meta[name="${e}"]`)||document.querySelector(`meta[property="${e}"]`)||document.querySelector(`meta[property="og:${e}"]`);return t?t.content:null},t=e=>{let t=document.querySelectorAll(`meta[name="${e}"], meta[property="${e}"], meta[property="og:${e}"]`);return Array.from(t).map(e=>e.content).filter(Boolean)},n=[];document.querySelectorAll(`script[type="application/ld+json"]`).forEach(e=>{try{let t=JSON.parse(e.textContent);Array.isArray(t)?n.push(...t):t&&t[`@graph`]&&Array.isArray(t[`@graph`])?n.push(...t[`@graph`]):t&&n.push(t)}catch{}});let r=[];return document.querySelectorAll(`[itemscope]`).forEach(e=>{let t=e.getAttribute(`itemtype`)||``;if(!t)return;let n={};e.querySelectorAll(`[itemprop]`).forEach(t=>{if(t.closest(`[itemscope]`)!==e)return;let r=t.getAttribute(`itemprop`)||``;if(!r)return;let i=t.getAttribute(`content`)||t.getAttribute(`href`)||t.getAttribute(`src`)||t.textContent?.trim();i&&(n[r]?n[r]=Array.isArray(n[r])?[...n[r],i]:[n[r],i]:n[r]=i)}),r.push({itemType:t,properties:n})}),{success:!0,data:{title:document.title,description:e(`description`),keywords:e(`keywords`),author:e(`author`),ogTitle:e(`og:title`),ogDescription:e(`og:description`),ogImage:e(`og:image`),ogUrl:e(`og:url`),ogType:e(`og:type`),ogSiteName:e(`og:site_name`),ogLocale:e(`og:locale`),articlePublishedTime:e(`article:published_time`),articleModifiedTime:e(`article:modified_time`),articleAuthor:e(`article:author`),twitterCard:e(`twitter:card`),twitterTitle:e(`twitter:title`),twitterDescription:e(`twitter:description`),twitterImage:e(`twitter:image`),twitterSite:e(`twitter:site`),twitterCreator:e(`twitter:creator`),canonicalUrl:document.querySelector(`link[rel="canonical"]`)?.href,links:t(`citation_author`),jsonLd:n.length>0?n:void 0,microdata:r.length>0?r:void 0}}}catch(e){return{success:!1,error:e.message}}}function h(){document.querySelectorAll(`.ai-helper-highlight`).forEach(e=>{let t=e.parentNode;if(t&&t.insertBefore&&t.removeChild){for(;e.firstChild;)t.insertBefore(e.firstChild,e);t.removeChild(e),typeof t.normalize==`function`&&t.normalize()}});let e=document.getElementById(`ai-helper-highlight-style`);e&&e.remove()}function oe(e,t=`yellow`){try{if(!e)return{success:!1,error:`未提供要高亮的文本`};h();let n=document.createElement(`style`);n.id=`ai-helper-highlight-style`,n.textContent=`
      .ai-helper-highlight {
        background-color: ${t} !important;
        padding: 2px 0;
      }
    `,document.head.appendChild(n);let r=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),i=[],a;for(;a=r.nextNode();)a.nodeValue.toLowerCase().includes(e.toLowerCase())&&i.push(a);let o=[];return i.forEach(e=>{let t=e.parentNode;if(!t||!t.replaceChild||!t.insertBefore)return;let n=e.nodeValue,r=n.toLowerCase(),i=n.toLowerCase(),a=r.indexOf(i);if(a!==-1){let r=document.createElement(`span`);r.className=`ai-helper-highlight`,r.textContent=n.substring(a,a+n.length);let i=document.createTextNode(n.substring(0,a)),s=document.createTextNode(n.substring(a+n.length));t.replaceChild(s,e),t.insertBefore(r,s),t.insertBefore(i,r),o.push(r)}}),o.length>0&&o[0].scrollIntoView({behavior:`smooth`,block:`center`}),{success:!0,message:`已高亮 ${o.length} 处文本`,count:o.length}}catch(e){return{success:!1,error:e.message}}}function se(e=`all`,t=!1){try{let n=window.location.hostname,r=[];return document.querySelectorAll(`a[href]`).forEach(t=>{try{let i=t.href;if(!i||i.startsWith(`javascript:`)||i.startsWith(`#`))return;let a=new URL(i),o=a.hostname!==n;if(e===`internal`&&o||e===`external`&&!o)return;r.push({href:i,text:t.textContent.trim(),title:t.title,domain:a.hostname,isExternal:o,target:t.target})}catch{}}),t&&document.querySelectorAll(`img[src]`).forEach(t=>{try{let i=t.src;if(!i)return;let a=new URL(i),o=a.hostname!==n;if(e===`internal`&&o||e===`external`&&!o)return;r.push({href:i,text:t.alt||``,title:t.title,domain:a.hostname,isExternal:o,type:`image`})}catch{}}),{success:!0,total:r.length,links:r}}catch(e){return{success:!1,error:e.message}}}function ce(e=null){try{let t=(e?[document.querySelector(e)].filter(Boolean):Array.from(document.querySelectorAll(`form`))).map((e,t)=>{let n=[],r=e.id||`form-${t}`;return e.querySelectorAll(`input`).forEach(e=>{n.push({tag:`input`,name:e.name,id:e.id,type:e.type,placeholder:e.placeholder,required:e.required,selector:g(e)})}),e.querySelectorAll(`textarea`).forEach(e=>{n.push({tag:`textarea`,name:e.name,id:e.id,placeholder:e.placeholder,required:e.required,selector:g(e)})}),e.querySelectorAll(`select`).forEach(e=>{let t=Array.from(e.options).map(e=>({value:e.value,text:e.textContent.trim()}));n.push({tag:`select`,name:e.name,id:e.id,required:e.required,options:t,selector:g(e)})}),{formId:r,action:e.action,method:e.method,fields:n}});return{success:!0,total:t.length,forms:t}}catch(e){return{success:!1,error:e.message}}}function g(e){if(e.id)return`#${e.id}`;let t=e.tagName.toLowerCase();if(e.className){let n=e.className.split(` `).filter(e=>e).slice(0,2);n.length&&(t+=`.`+n.join(`.`))}return t}function le(e={}){try{let{minWidth:t=0,minHeight:n=0,includeBackgroundImages:r=!1,download:i=!1,maxResults:a=100}=e,o=[],s=new Set;return document.querySelectorAll(`img[src]`).forEach(e=>{try{let r=e.src;if(!r||s.has(r))return;let i=e.naturalWidth||e.width||0,a=e.naturalHeight||e.height||0;i>=t&&a>=n&&(s.add(r),o.push({src:r,alt:e.alt||``,title:e.title||``,width:i,height:a,selector:g(e)}))}catch{}}),r&&document.querySelectorAll(`*`).forEach(e=>{try{let t=window.getComputedStyle(e).backgroundImage;if(!t||t===`none`||t.startsWith(`gradient`))return;let n=t.match(/url\(['"]?([^'")]+)['"]?\)/);if(n&&n[1]){let t=n[1];s.has(t)||(s.add(t),o.push({src:t,alt:``,title:``,width:0,height:0,type:`background`,selector:g(e)}))}}catch{}}),i&&o.length>0&&o.slice(0,Math.min(a,10)).forEach((e,t)=>{setTimeout(()=>{let n=document.createElement(`a`);n.href=e.src,n.download=`image_${t+1}.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n)},t*500)}),{success:!0,total:o.length,images:o.slice(0,a),message:i?`已开始下载 ${Math.min(o.length,10)} 张图片`:``}}catch(e){return{success:!1,error:e.message}}}function ue(e={}){try{let{query:t,pattern:n,mode:r=`plain`,caseSensitive:i=!1,contextLength:a=50,maxResults:o=20,highlight:s=!1}=e,c=t||n;if(!c)return{success:!1,error:`需要提供搜索关键词`};if(r===`plain`){let e=window.find(c,i,!1,!0,!1,!0,!1),t=0,n=[];try{let e=window.getSelection(),r=e&&e.rangeCount>0?e.getRangeAt(0):null,s=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),l=i?`g`:`gi`,u=c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),d=new RegExp(u,l),f=document.body.innerText,p=0;for(;s.nextNode();){let e=s.currentNode.textContent.match(d);if(e)for(let r of e){if(n.length>=o)break;let e=f.indexOf(r,p),i=Math.max(0,e-a),s=Math.min(f.length,e+r.length+a);n.push({match:r,position:e,context:f.substring(i,s),lineNumber:f.substring(0,e).split(`
`).length}),t++,p=e+r.length}if(n.length>=o)break}r&&(e.removeAllRanges(),e.addRange(r))}catch{t=+!!e}if(s&&t>0){h();let e=document.createElement(`style`);e.id=`ai-helper-highlight-style`,e.textContent=`
          .ai-helper-search-highlight {
            background-color: #ffff00;
            color: #000;
            padding: 1px 2px;
            border-radius: 2px;
          }
        `,document.head.appendChild(e);let t=i?`g`:`gi`,n=c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`);document.body.innerHTML=document.body.innerHTML.replace(new RegExp(n,t),`<span class="ai-helper-search-highlight">$&</span>`)}return{success:!0,query:c,mode:`plain`,found:e,total:t,matches:n,highlighted:s}}let l=i?`g`:`gi`,u=new RegExp(c,l),d=document.body.innerText,f=[],p;for(;(p=u.exec(d))!==null&&f.length<o;){let e=Math.max(0,p.index-a),t=Math.min(d.length,p.index+p[0].length+a);f.push({match:p[0],position:p.index,context:d.substring(e,t),lineNumber:d.substring(0,p.index).split(`
`).length}),p[0].length===0&&u.lastIndex++}if(s&&f.length>0){h();let e=document.createElement(`style`);e.id=`ai-helper-highlight-style`,e.textContent=`
        .ai-helper-search-highlight {
          background-color: #ffff00;
          color: #000;
          padding: 1px 2px;
          border-radius: 2px;
        }
      `,document.head.appendChild(e),document.body.innerHTML=document.body.innerHTML.replace(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),l),`<span class="ai-helper-search-highlight">$&</span>`)}return{success:!0,pattern:c,mode:`regex`,total:f.length,matches:f,highlighted:s}}catch(e){return{success:!1,error:e.message}}}function de(e=null,t=!0,n=!0,r=5e4){try{let i=e?document.querySelector(e):document.body;if(!i)return{success:!1,error:`未找到目标元素`};let a=``,o=(e,r=0)=>{if(r>6)return``;let i=``,a=e.tagName.toLowerCase();switch(a){case`h1`:case`h2`:case`h3`:case`h4`:case`h5`:case`h6`:let s=parseInt(a[1]);i+=`
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

*内容已截断*`),{success:!0,markdown:a,length:a.length,url:window.location.href,title:document.title}}catch(e){return{success:!1,error:e.message}}}function fe(e=null,t=100){try{let n=e?Array.from(document.querySelectorAll(e)):[document.body];if(!n.length)return{success:!1,error:`未找到匹配选择器的元素: ${e}`};let r=[],i=[],a=[],o=[],s=[],c=new Set,l=new Set;return n.forEach(e=>{r.length<t&&e.querySelectorAll(`table`).forEach(e=>{if(r.length>=t)return;let n=[];e.querySelectorAll(`th`).forEach(e=>{n.push(e.textContent.trim())});let i=[];e.querySelectorAll(`tr`).forEach(e=>{let t=[];e.querySelectorAll(`td, th`).forEach(e=>{t.push(e.textContent.trim())}),i.push(t)}),r.push({headers:n,rows:i})}),i.length<t&&e.querySelectorAll(`ul, ol`).forEach(e=>{if(i.length>=t)return;let n=[];e.querySelectorAll(`:scope > li`).forEach(e=>{n.push(e.textContent.trim())}),i.push({tag:e.tagName.toLowerCase(),items:n})}),a.length<t&&e.querySelectorAll(`script[type="application/ld+json"]`).forEach(e=>{if(a.length>=t)return;let n=e.textContent.substring(0,200);if(!c.has(n)){c.add(n);try{let t=JSON.parse(e.textContent);a.push(t)}catch{}}}),o.length<t&&e.querySelectorAll(`article`).forEach(e=>{if(o.length>=t)return;let n=e.textContent.trim();o.push({textContent:n.substring(0,500),wordCount:n.split(/\s+/).filter(Boolean).length})}),s.length<t&&e.querySelectorAll(`[itemscope]`).forEach(e=>{if(s.length>=t)return;let n=e.getAttribute(`itemtype`)||``;if(!n)return;let r=n+e.textContent.trim().substring(0,100);if(l.has(r))return;l.add(r);let i={};e.querySelectorAll(`[itemprop]`).forEach(t=>{if(t.closest(`[itemscope]`)!==e)return;let n=t.getAttribute(`itemprop`)||``;if(!n)return;let r=t.getAttribute(`content`)||t.getAttribute(`href`)||t.getAttribute(`src`)||t.textContent?.trim();r&&(i[n]?i[n]=Array.isArray(i[n])?[...i[n],r]:[i[n],r]:i[n]=r)}),s.push({itemType:n,properties:i})})}),{success:!0,data:{tables:r,lists:i,jsonLd:a,articles:o,microdata:s},counts:{tables:r.length,lists:i.length,jsonLd:a.length,articles:o.length,microdata:s.length}}}catch(e){return{success:!1,error:e.message}}}function pe(e,n=50){try{if(!e)return{success:!1,error:`选择器不能为空`};let r=t(e);if(!r)return{success:!1,error:`未找到目标元素: ${e}`};let i=e=>{let t=e.tagName.toLowerCase(),n=e.classList?Array.from(e.classList).sort().join(`.`):``,r={};return Array.from(e.children).forEach(e=>{let t=e.tagName.toLowerCase();r[t]=(r[t]||0)+1}),`${t}|${n}|${Object.keys(r).sort().map(e=>`${e}:${r[e]}`).join(`,`)}`},a=i(r),o=[],s=document.querySelectorAll(r.tagName.toLowerCase());for(let e of s)if(e!==r){if(o.length>=n)break;i(e)===a&&o.push({tag:e.tagName.toLowerCase(),selector:f(e),text:(e.textContent||``).trim().substring(0,200),id:e.id||``,className:typeof e.className==`string`?e.className:``})}return{success:!0,original:{tag:r.tagName.toLowerCase(),selector:f(r),text:(r.textContent||``).trim().substring(0,200),signature:a},similar:o,count:o.length}}catch(e){return{success:!1,error:e.message}}}function me(e=`iframe`,t=!1,n=1e4){try{let r=document.querySelectorAll(e),o=[],s=(e,r=1,c=``)=>{try{let l=f(e),u=c?`${c} > iframe`:l,d=e.src||`about:blank`,p=!1,ee=``,te=``,m=0;try{let o=e.contentDocument||e.contentWindow?.document;o&&(p=!0,ee=o.title||``,te=i(o).substring(0,n),m=a(o).length,t&&r<2&&o.querySelectorAll(`iframe`).forEach(e=>{s(e,r+1,u)}))}catch{p=!1}o.push({selector:u,url:d,accessible:p,title:ee,textContent:te,htmlLength:m})}catch{}};return r.forEach(e=>s(e)),{success:!0,iframes:o,total:o.length,accessible:o.filter(e=>e.accessible).length}}catch(e){return{success:!1,error:e.message}}}function he(e,t=!1){try{let n=document.querySelectorAll(e);if(!t){let t=0,r=n.length;return n.forEach(e=>{let n=window.getComputedStyle(e);n.display!==`none`&&n.visibility!==`hidden`&&n.opacity!==`0`&&t++}),{success:!0,count:t,totalCount:r,empty:t===0,selector:e}}return{success:!0,count:n.length,totalCount:n.length,empty:n.length===0,selector:e}}catch(e){return{success:!1,error:e.message}}}function ge(e={}){let{scrollPixels:t=800,maxScrolls:n=20,pauseMs:r=500,selector:i}=e;return new Promise(async e=>{try{let a=i?document.querySelector(i):null,o=()=>{let e=a||document.body,t=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n=``,r;for(;r=t.nextNode();){let e=r.parentElement;if(!e)continue;let t=e.getBoundingClientRect();if(t.bottom>-100&&t.top<window.innerHeight+100){let e=r.textContent.trim();e&&(n+=e+`
`)}}return n},s=a||document.scrollingElement||document.documentElement,c=``,l=window.scrollY;for(let e=0;e<n;e++){let e=o();c+=e+`
`;let n=window.scrollY;if(s.scrollBy({top:t,behavior:`auto`}),await new Promise(e=>setTimeout(e,r)),Math.abs(window.scrollY-n)<5&&(await new Promise(e=>setTimeout(e,r)),Math.abs(window.scrollY-n)<5))break}a&&s.scrollTo({top:l,behavior:`auto`});let u=c.split(`
`),d=[];for(let e of u){let t=e.trim();t&&t!==d[d.length-1]&&d.push(t)}e({success:!0,content:d.join(`
`),contentLength:d.join(`
`).length,scrolls:n,startScrollY:l,endScrollY:window.scrollY})}catch(t){e({success:!1,error:t.message})}})}var _=null;function _e(e,n=500,r=3e3){try{if(!e)return{success:!1,error:`选择器不能为空`};let n=e.trim();for(let[e,t]of[[/^"([\s\S]*)"$/,`$1`],[/^'([\s\S]*)'$/,`$1`],[/^`([\s\S]*)`$/,`$1`],[/^"([\s\S]*)"$/,`$1`],[/^'([\s\S]*)'$/,`$1`],[/^「([\s\S]*)」$/,`$1`]])n=n.replace(e,t);let r=t(n);return r?(r.click(),{success:!0,message:`已成功点击元素: ${e}`}):{success:!1,error:`未找到匹配选择器的元素: ${e}`}}catch(e){return{success:!1,error:e.message}}}function ve(e){return e.isContentEditable||e.getAttribute(`contenteditable`)===`true`}function ye(e,t){try{return e.focus(),document.execCommand(`insertText`,!1,t)||(e.textContent=t),e.dispatchEvent(new Event(`input`,{bubbles:!0})),e.dispatchEvent(new Event(`change`,{bubbles:!0})),!0}catch{try{return e.textContent=t,e.dispatchEvent(new Event(`input`,{bubbles:!0})),!0}catch{return!1}}}function be(e,n=500){try{let n=[];return e.forEach(e=>{let{selector:r,value:i,fieldType:a=`text`}=e,o=t(r);if(!o){n.push({selector:r,success:!1,error:`未找到元素`});return}try{if(a===`text`){if(ve(o)){let e=ye(o,i);n.push({selector:r,success:e,value:i});return}o.value=i,o.dispatchEvent(new Event(`input`,{bubbles:!0})),o.dispatchEvent(new Event(`change`,{bubbles:!0}))}else if(a===`contenteditable`){let e=ye(o,i);n.push({selector:r,success:e,value:i});return}else if(a===`select`){let e=o.querySelector(`option[value="${i}"]`)||Array.from(o.options).find(e=>e.textContent===i);if(e)o.value=e.value,o.dispatchEvent(new Event(`change`,{bubbles:!0}));else{n.push({selector:r,success:!1,error:`未找到匹配的选项`});return}}else if(a===`checkbox`)o.checked=i===`true`||i===!0,o.dispatchEvent(new Event(`change`,{bubbles:!0}));else if(a===`radio`){let e=document.querySelector(`${r}[value="${i}"]`);if(e)e.checked=!0,e.dispatchEvent(new Event(`change`,{bubbles:!0}));else{n.push({selector:r,success:!1,error:`未找到匹配的单选按钮`});return}}n.push({selector:r,success:!0,value:i})}catch(e){n.push({selector:r,success:!1,error:e.message})}}),{success:!0,message:`表单填充完成，成功 ${n.filter(e=>e.success).length}/${e.length} 个字段`,details:n}}catch(e){return{success:!1,error:e.message}}}function xe(e){try{let{target:n=`selector`,selector:r,x:i=0,y:a=0,behavior:o=`smooth`,align:s=`center`}=e;if(n===`top`)window.scrollTo({top:0,left:0,behavior:o});else if(n===`bottom`)window.scrollTo({top:document.body.scrollHeight,left:0,behavior:o});else if(n===`coordinates`)window.scrollTo({top:a,left:i,behavior:o});else if(n===`selector`&&r){let e=t(r);if(!e)return{success:!1,error:`未找到元素: ${r}`};e.scrollIntoView({behavior:o,block:s})}else return{success:!1,error:`无效的滚动目标或缺少选择器`};return{success:!0,message:`滚动完成`}}catch(e){return{success:!1,error:e.message}}}function Se(e){if(!e)return!1;if(e.offsetParent===null&&e.tagName!==`BODY`){let t=window.getComputedStyle(e);if(t.display===`none`||t.visibility===`hidden`||t.position!==`fixed`)return!1}let t=window.getComputedStyle(e);if(t.display===`none`||t.visibility===`hidden`||parseFloat(t.opacity)<=0)return!1;let n=e.getBoundingClientRect();if(n.width<=0||n.height<=0)return!1;let r=window.innerHeight||document.documentElement.clientHeight,i=window.innerWidth||document.documentElement.clientWidth;return n.top<r&&n.bottom>0&&n.left<i&&n.right>0}function Ce(e,n=`appeared`,r=1e4){return new Promise((i,a)=>{let o=Date.now(),s=()=>{let a=t(e);if(n===`appeared`&&a){i({success:!0,message:`元素 ${e} 已出现`,element:e});return}if(n===`disappeared`&&!a){i({success:!0,message:`元素 ${e} 已消失`});return}if(n===`visible`&&a&&Se(a)){i({success:!0,message:`元素 ${e} 已可见`,element:e});return}if(n===`hidden`&&(!a||!Se(a))){i({success:!0,message:`元素 ${e} 已隐藏`});return}if(Date.now()-o>r){i({success:!1,error:`等待超时（${r}ms），元素 ${e} 未达到 ${n} 状态`});return}setTimeout(s,100)};s()})}function we({key:e,text:t,ctrlKey:n=!1,shiftKey:r=!1,altKey:i=!1}){try{let a=document.activeElement;if(!a)return{success:!1,error:`没有聚焦的元素`};if(t){let e=a.tagName===`INPUT`||a.tagName===`TEXTAREA`,n=a.isContentEditable;if(e||n){if(a.focus(),n)try{document.execCommand(`selectAll`,!1,null),document.execCommand(`insertText`,!1,t)}catch{a.textContent+=t}else{let e=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,`value`)||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,`value`);e&&e.set?e.set.call(a,a.value+t):a.value+=t}try{a.dispatchEvent(new InputEvent(`input`,{bubbles:!0,cancelable:!0,inputType:`insertText`,data:t}))}catch{a.dispatchEvent(new Event(`input`,{bubbles:!0}))}a.dispatchEvent(new Event(`change`,{bubbles:!0}))}}if(e){let t={key:e,code:e.length===1?`Key${e.toUpperCase()}`:e,keyCode:e.toUpperCase().charCodeAt(0),which:e.toUpperCase().charCodeAt(0),bubbles:!0,cancelable:!0,ctrlKey:n,shiftKey:r,altKey:i};document.activeElement.dispatchEvent(new KeyboardEvent(`keydown`,t)),document.activeElement.dispatchEvent(new KeyboardEvent(`keypress`,t)),document.activeElement.dispatchEvent(new KeyboardEvent(`keyup`,t))}return{success:!0,message:`键盘输入成功`}}catch(e){return{success:!1,error:e.message}}}function Te(e,n){return new Promise((r,i)=>{try{let i=t(e),a=t(n);if(!i){r({success:!1,error:`未找到源元素: ${e}`});return}if(!a){r({success:!1,error:`未找到目标元素: ${n}`});return}let o=i.getBoundingClientRect(),s=a.getBoundingClientRect(),c=o.left+o.width/2,l=o.top+o.height/2,u=s.left+s.width/2,d=s.top+s.height/2,f=(e,t,n)=>{let r=new DragEvent(e,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,screenX:t,screenY:n});Object.defineProperty(r,"dataTransfer",{value:{getData:()=>``,setData:()=>{},effectAllowed:`all`,dropEffect:`none`}}),document.elementFromPoint(t,n)?.dispatchEvent(r)};f(`dragstart`,c,l),f(`dragenter`,u,d),f(`dragover`,u,d),f(`drop`,u,d),f(`dragend`,c,l),r({success:!0,experimental:!0,message:`[实验性] 已尝试拖拽 ${e} → ${n}（拖拽模拟在浏览器中为部分支持，可能未生效）`})}catch(e){r({success:!1,error:e.message})}})}function Ee(e,n,r,i=`application/octet-stream`){try{let a=t(e);if(!a)return{success:!1,error:`未找到文件上传控件: ${e}`};if(a.type!==`file`)return{success:!1,error:`选择的元素不是文件上传控件`};let o;try{let e=atob(r),t=new Uint8Array(e.length);for(let n=0;n<e.length;n++)t[n]=e.charCodeAt(n);o=new Blob([t],{type:i})}catch{o=new Blob([r],{type:i})}let s=new File([o],n,{type:i}),c=new DataTransfer;return c.items.add(s),a.files=c.files,a.dispatchEvent(new Event(`change`,{bubbles:!0})),{success:!0,message:`已上传文件: ${n}`}}catch(e){return{success:!1,error:e.message}}}function De(e,t,n=null,r=5e3){return new Promise(async i=>{try{let a=document.querySelector(e);if(!a){i({success:!1,error:`未找到触发器: ${e}`});return}if(a.tagName===`SELECT`){let e=a.options;for(let n=0;n<e.length;n++){let r=e[n],o=(r.textContent||r.label||``).trim();if(o===t||o.includes(t)){a.value=r.value,a.dispatchEvent(new Event(`change`,{bubbles:!0})),a.dispatchEvent(new Event(`input`,{bubbles:!0})),i({success:!0,message:`已选择: ${o}`,triggerTag:`SELECT`});return}}i({success:!1,error:`在 <select> 中未找到匹配的选项: "${t}"`,availableOptions:Array.from(e).map(e=>e.textContent?.trim()).filter(Boolean)});return}a.click(),await new Promise(e=>setTimeout(e,300));let o=Date.now(),s=n?document.querySelector(n):document,c=null;for(;Date.now()-o<r;){let e=s.querySelectorAll(`li, [role="option"], [role="menuitem"], .option, .dropdown-item, .select-item, [data-value], div`);for(let n of e){let e=(n.textContent||``).trim();if(!(e.length<2)&&(e===t||e.includes(t)||e.replace(/\s+/g,``)===t.replace(/\s+/g,``))){c=n;break}}if(c)break;await new Promise(e=>setTimeout(e,100))}if(!c){i({success:!1,error:`在 ${r}ms 内未找到匹配选项: "${t}"`});return}c.click(),i({success:!0,message:`已选择: ${c.textContent?.trim()}`,triggerTag:a.tagName})}catch(e){i({success:!1,error:e.message})}})}function Oe({action:e,storage:t,key:n,value:r}){try{let i=t===`session`?sessionStorage:localStorage;switch(e){case`get`:if(!n){let e={};for(let t=0;t<i.length;t++){let n=i.key(t);e[n]=i.getItem(n)}return{success:!0,content:JSON.stringify(e),data:e}}let t=i.getItem(n);return{success:!0,content:JSON.stringify({key:n,value:t}),value:t};case`set`:return!n||r===void 0?{success:!1,error:`set操作需要提供key和value`}:(i.setItem(n,r),{success:!0,message:`已设置 ${n}`});case`remove`:return n?(i.removeItem(n),{success:!0,message:`已删除 ${n}`}):{success:!1,error:`remove操作需要提供key`};case`clear`:return i.clear(),{success:!0,message:`已清空存储`};default:return{success:!1,error:`未知操作: ${e}`}}}catch(e){return{success:!1,error:e.message}}}function ke(){return new Promise((e,t)=>{if(!(`EyeDropper`in window)){e({success:!1,error:`您的浏览器不支持 EyeDropper API`});return}new EyeDropper().open().then(t=>{e({success:!0,color:t.sRGBHex,message:`已取色: ${t.sRGBHex}`})}).catch(t=>{t.name===`AbortError`?e({success:!1,error:`用户取消了取色`}):e({success:!1,error:t.message})})})}function Ae(e,t=`zh-CN`,n=1,r=1){try{if(!(`speechSynthesis`in window))return{success:!1,error:`您的浏览器不支持语音合成`};_&&speechSynthesis.cancel();let i=new SpeechSynthesisUtterance(e);return i.lang=t,i.rate=n,i.pitch=r,_=i,new Promise(e=>{i.onend=()=>{_=null,e({success:!0,message:`朗读完成`})},i.onerror=t=>{_=null,e({success:!1,error:t.error})},speechSynthesis.speak(i),e({success:!0,message:`开始朗读...`})})}catch(e){return{success:!1,error:e.message}}}function je(e,t=null,n=null){try{let r=t?document.querySelector(t):document.querySelector(`video, audio`);if(!r)return{success:!1,error:`未找到视频/音频元素`};switch(e){case`play`:return r.play(),{success:!0,message:`已播放`};case`pause`:return r.pause(),{success:!0,message:`已暂停`};case`toggle`:return r.paused?(r.play(),{success:!0,message:`已播放`}):(r.pause(),{success:!0,message:`已暂停`});case`stop`:return r.pause(),r.currentTime=0,{success:!0,message:`已停止`};case`seek`:return n===null?{success:!1,error:`seek操作需要提供value参数`}:(r.currentTime=n,{success:!0,message:`已跳转到 ${n} 秒`});case`volume`:return n===null?{success:!1,error:`volume操作需要提供value参数`}:(r.volume=Math.max(0,Math.min(1,n)),{success:!0,message:`音量已设置为 ${Math.round(n*100)}%`});case`mute`:return r.muted=!r.muted,{success:!0,message:r.muted?`已静音`:`已取消静音`};case`speed`:return n===null?{success:!1,error:`speed操作需要提供value参数`}:(r.playbackRate=Math.max(.1,Math.min(10,n)),{success:!0,message:`播放速度已设置为 ${n}x`});case`fullscreen`:return r.requestFullscreen?r.requestFullscreen():r.webkitRequestFullscreen?r.webkitRequestFullscreen():r.mozRequestFullScreen&&r.mozRequestFullScreen(),{success:!0,message:`已进入全屏`};default:return{success:!1,error:`未知操作: ${e}`}}}catch(e){return{success:!1,error:e.message}}}function Me(e,t){try{let n=document.createElement(`canvas`);n.width=t,n.height=t;let r=n.getContext(`2d`);r.fillStyle=`#FFFFFF`,r.fillRect(0,0,t,t);let i=[];for(let t=0;t<e.length;t++)i.push(e.charCodeAt(t));let a=Math.max(2,Math.floor(t/41)),o=Math.floor(t/a),s=Math.floor((t-o*a)/2);r.fillStyle=`#000000`;let c=(e,t)=>{let n=7*a;r.fillRect(e,t,n,n),r.fillStyle=`#FFFFFF`,r.fillRect(e+a,t+a,n-2*a,n-2*a),r.fillStyle=`#000000`,r.fillRect(e+2*a,t+2*a,n-4*a,n-4*a),r.fillStyle=`#000000`};c(s,s),c(s+(o-7)*a,s),c(s,s+(o-7)*a);let l=0;for(let t=0;t<e.length;t++)l=(l<<5)-l+e.charCodeAt(t),l|=0;let u=e=>{let t=e+1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296};for(let e=0;e<o;e++)for(let t=0;t<o;t++){let n=e<8&&t<8,i=e<8&&t>=o-8,c=e>=o-8&&t<8;n||i||c||u(l+e*o+t)>.5&&r.fillRect(s+t*a,s+e*a,a,a)}return n.toDataURL(`image/png`)}catch{return null}}function Ne(e=``,t=200,n=`M`,r=!0){return new Promise(i=>{try{let a=e||window.location.href,o=document.createElement(`div`);o.id=`ai-helper-qrcode`,o.style.cssText=`
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
      `,l.onclick=()=>{document.body.removeChild(o)},o.appendChild(l),typeof QRCode>`u`){let e=Me(a,t);if(e){let n=document.createElement(`img`);n.src=e,n.width=t,n.height=t,s.replaceWith(n),r&&document.body.appendChild(o),i({success:!0,content:a,size:t,dataUrl:e,shown:r,fallback:!0,warning:`QRCode 库未加载，已使用 SVG 降级方案生成`})}else i({success:!1,error:`二维码库未加载且降级方案不可用`});return}QRCode.toCanvas(s,a,{width:t,margin:2,color:{dark:`#000000`,light:`#ffffff`},errorCorrectionLevel:n.toLowerCase()},e=>{e?i({success:!1,error:e.message}):(r&&document.body.appendChild(o),i({success:!0,content:a,size:t,dataUrl:s.toDataURL(`image/png`),shown:r}))})}catch(e){i({success:!1,error:e.message})}})}function Pe(e,t=!0,n=5,r=50){try{let i=[],a=(o,s=0)=>{if(!(s>n||i.length>=r))try{o.querySelector&&o.querySelectorAll(e).forEach(e=>{i.length>=r||i.push({tag:e.tagName.toLowerCase(),id:e.id,className:e.className,textContent:e.textContent?.substring(0,200),selector:getElementSelector(e),depth:s})}),t&&o.querySelectorAll(`*`).forEach(e=>{e.shadowRoot&&a(e.shadowRoot,s+1)})}catch{}};return a(document),{success:!0,selector:e,total:i.length,elements:i.slice(0,r)}}catch(e){return{success:!1,error:e.message}}}function Fe(e,t=null,n=`style`){try{if(!e||typeof e!=`string`)return{success:!1,error:`css 参数必须是非空字符串`};if(n!==`style`&&n!==`inline`)return{success:!1,error:`不支持的 injectMode: ${n}，支持 'style' 或 'inline'`};if(n===`style`)if(t){let n=document.querySelectorAll(t),r=`ai-helper-scoped-style-${Date.now()}`,i=``,a=e.split(`}`);for(let e of a){let t=e.trim();if(!t)continue;let n=t.indexOf(`{`);if(n===-1)continue;let a=t.substring(0,n).trim(),o=t.substring(n+1).trim();i+=`#${r} ${a} { ${o} } `}n.forEach(e=>{e.setAttribute(`id`,r)});let o=document.createElement(`style`);return o.setAttribute(`data-ai-helper`,`scoped`),o.textContent=i,document.head.appendChild(o),{success:!0,injectMode:`style`,scoped:!0,selector:t,hitCount:n.length}}else{let t=document.createElement(`style`);return t.setAttribute(`data-ai-helper`,`global`),t.textContent=e,document.head.appendChild(t),{success:!0,injectMode:`style`,scoped:!1,hitCount:0}}if(n===`inline`){let n=t?document.querySelectorAll(t):document.querySelectorAll(`*`),r=0,i={};return e.split(`;`).forEach(e=>{let t=e.indexOf(`:`);if(t===-1)return;let n=e.substring(0,t).trim(),r=e.substring(t+1).trim();n&&r&&(i[n]=r)}),n.forEach(e=>{if(e.nodeType===1){for(let[t,n]of Object.entries(i))try{e.style.setProperty(t,n)}catch{}r++}}),{success:!0,injectMode:`inline`,selector:t||`*`,hitCount:r}}}catch(e){return{success:!1,error:e.message}}}var v={search:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,explain:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>`,translate:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,summary:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,copy:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,close:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,sparkle:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,lock:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,unlock:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,copyLarge:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,grip:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>`,send:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,more:`<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,gear:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,refresh:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,block:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,eyeOff:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`},y=null,b=null,x=!1,S=!1,C=``,w=null,T=``,E=!1,D=!1,O=``,k=``,A=``,Ie=``,j=``,M=!0,N=[],Le=!1,P=!1,F={x:0,y:0},I=null,L=null,Re=5,R=!1,z=null,B=``,V=new Set,H=window.top===window;if(!H)try{window.parent===window.top&&window.top.document.querySelector(`frameset`)&&(H=!0)}catch{}e.debug(`[SelectionToolbar] 模块加载 isTopFrame:`,H,`top===window:`,window.top===window,`hasBody:`,!!document.body,`parent===top:`,window.parent===window.top);var U=null;function W(e){(document.body||document.documentElement).appendChild(e)}var G=null;function ze(e,t){let n=t?e.querySelector(t):e;n&&(n.style.cursor=`grab`,n.addEventListener(`mousedown`,t=>{if(t.target.closest(`[role="button"]`)||t.button!==0)return;t.preventDefault(),t.stopPropagation();let r=e.getBoundingClientRect();G={el:e,startX:t.clientX,startY:t.clientY,startLeft:r.left,startTop:r.top,pointerId:t.pointerId||0},n.style.cursor=`grabbing`,e.style.transition=`none`}))}document.addEventListener(`mousemove`,e=>{if(!G)return;let t=e.clientX-G.startX,n=e.clientY-G.startY,r=G.startLeft+t,i=G.startTop+n,a=window.innerWidth,o=window.innerHeight,s=G.el.getBoundingClientRect();r=Math.max(0,Math.min(r,a-s.width)),i=Math.max(0,Math.min(i,o-s.height)),G.el.style.left=r+`px`,G.el.style.top=i+`px`}),document.addEventListener(`mouseup`,()=>{if(!G)return;G.el.style.transition=``;let e=G.el.querySelector(`.aih-result-header`)||G.el;e.style.cursor=`grab`,G=null});function K(){try{return typeof chrome!=`object`||!chrome||typeof chrome.runtime!=`object`||!chrome.runtime?!1:!!chrome.runtime.id}catch{return!1}}function Be(){if(document.getElementById(`aih-selection-toolbar-styles`))return;let e=document.createElement(`style`);e.id=`aih-selection-toolbar-styles`,e.textContent=`
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
  `,document.head.appendChild(e)}var q=[{id:`ai-search`,name:`AI搜索`,systemPrompt:`使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。`,builtin:!0,order:0},{id:`explain`,name:`解释`,systemPrompt:`对选中的内容进行解释说明，帮助理解其含义。`,builtin:!0,order:1},{id:`translate`,name:`翻译`,systemPrompt:`将选中的内容翻译成中文。`,builtin:!0,order:2},{id:`summary`,name:`总结`,systemPrompt:`对选中的内容进行归纳总结，提炼关键要点。`,builtin:!0,order:3},{id:`copy`,name:`复制`,systemPrompt:`将选中内容复制到剪贴板。`,builtin:!0,order:99}];function Ve(){return new Promise(e=>{if(!K()){L=[...q],e(L);return}if(L){e(L);return}try{chrome.storage.local.get([`toolbarTools`,`toolbarIconOnly`],t=>{let n=t.toolbarTools&&t.toolbarTools.length>0?t.toolbarTools:q,r=new Map(q.map(e=>[e.id,e]));L=n.map(e=>e.builtin&&r.has(e.id)?{...e,systemPrompt:r.get(e.id).systemPrompt}:e),R=t.toolbarIconOnly||!1,e(L)})}catch{L=[...q],e(L)}})}function He(){L=null,R=!1,Ve()}function Ue(e){return{"ai-search":v.search,explain:v.explain,translate:v.translate,summary:v.summary,copy:v.copy}[e]||v.sparkle}function We(){z||(z=document.createElement(`div`),z.id=`aih-overflow-dropdown`,z.className=`aih-overflow-dropdown`,z.style.display=`none`,W(z),document.addEventListener(`click`,e=>{z&&z.style.display===`block`&&!z.contains(e.target)&&!e.target.closest(`.aih-tb-btn-overflow`)&&(z.style.display=`none`)}))}function Ge(e){z||We();let t=e.map(e=>{let t=Ue(e.id);return`<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${e.id}">
      <span class="aih-tb-icon">${t}</span>${e.name}
    </div>`}).join(``);t+=`<div class="aih-dropdown-divider"></div>`,t+=`<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="打开配置页面">
    <span class="aih-tb-icon">${v.gear}</span>设置
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="暂时隐藏直到页面刷新">
    <span class="aih-tb-icon">${v.eyeOff}</span>本次临时禁用
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="在此网站禁用工具栏">
    <span class="aih-tb-icon">${v.block}</span>在此网站禁用
  </div>`,z.innerHTML=t,z._clickHandler=e=>{if(e.target.closest(`.aih-dropdown-settings`)){e.stopPropagation(),z.style.display=`none`;try{chrome.runtime.sendMessage({type:`OPEN_OPTIONS_PAGE`,hash:`toolbar`}).catch(()=>{})}catch{}return}if(e.target.closest(`.aih-dropdown-block`)){e.stopPropagation(),e.preventDefault(),z.style.display=`none`,ht();return}if(e.target.closest(`.aih-dropdown-hide`)){e.stopPropagation(),e.preventDefault(),z.style.display=`none`,Le=!0,Q(),J(),j=``;return}let t=e.target.closest(`[data-action]`);t&&(e.stopPropagation(),z.style.display=`none`,ct(t.dataset.action,j))},z.addEventListener(`click`,z._clickHandler),z.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&(e.preventDefault(),t.click())}})}async function Ke(){if(y)return;await Ve();let e=[...L].sort((e,t)=>e.order-t.order),t=e.find(e=>e.id===`ai-search`),n=e.filter(e=>e.id!==`ai-search`&&e.id!==`copy`),r=n.slice(0,Re-1),i=n.slice(Re-1);y=document.createElement(`div`),y.id=`aih-selection-toolbar`;let a=`<span class="aih-tb-buttons">`;a+=`<span class="aih-tb-grip" title="拖拽移动">${v.grip}</span>`;let o=R;t&&(a+=`<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="AI 搜索">
      <span class="aih-tb-icon">${v.search}</span>${o?``:`AI搜索`}
    </div>`),r.forEach(e=>{let t=Ue(e.id);a+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="${e.id}" title="${e.name}">
      <span class="aih-tb-icon">${t}</span>${o?``:e.name}
    </div>`}),a+=`<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="更多工具">
    <span class="aih-tb-icon">${v.more}</span>
  </div>`,Ge(i),a+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="复制选中内容">
    <span class="aih-tb-icon">${v.copy}</span>${o?``:`复制`}
  </div>`,a+=`</span>`,a+=`<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="问问..." />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="发送">
      <span class="aih-tb-icon">${v.send}</span>
    </div>
  </span>`,y.innerHTML=a,y.addEventListener(`click`,e=>{if(e.target.closest(`.aih-tb-btn-overflow`)){e.stopPropagation();let t=e.target.closest(`.aih-tb-btn-overflow`).getBoundingClientRect();z&&(z.style.display=z.style.display===`block`?`none`:`block`,z.style.top=t.bottom+4+`px`,z.style.left=t.right-160+`px`);return}let t=e.target.closest(`[data-action]`);if(!t)return;e.stopPropagation();let n=t.dataset.action;ct(n,j)}),y.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&!t.classList.contains(`aih-tb-ask-send`)&&(e.preventDefault(),t.click())}}),W(y);let s=y.querySelector(`.aih-tb-ask-input`),c=y.querySelector(`.aih-tb-ask-send`);y.querySelector(`.aih-tb-buttons`);let l=()=>{let e=s.value.trim();if(e){let t=C;d(),s.value=``,et(e,t),Q()}},u=()=>{if(S)return;S=!0,C=j||``;let e=window.getSelection();e.rangeCount>0&&(w=e.getRangeAt(0).cloneRange());let t=y.getBoundingClientRect().right;T=y.style.left,y.classList.add(`aih-ask-mode`),y.style.width=`360px`;let n=Math.max(8,t-360);y.style.left=n+`px`,requestAnimationFrame(()=>{if(w){let e=window.getSelection();e.removeAllRanges(),e.addRange(w)}requestAnimationFrame(()=>{s.focus()})})},d=()=>{S&&(S=!1,C=``,w=null,y.classList.remove(`aih-ask-mode`),y.style.width=``,T&&=(y.style.left=T,``))};s.addEventListener(`focus`,()=>{S||u()}),s.addEventListener(`mousedown`,e=>{S||(e.preventDefault(),u())}),s.addEventListener(`blur`,()=>{setTimeout(()=>{S&&!y.contains(document.activeElement)&&(d(),Q())},150)}),s.addEventListener(`keydown`,e=>{e.key===`Escape`?(e.preventDefault(),e.stopPropagation(),d(),s.blur()):e.key===`Enter`&&(e.preventDefault(),e.stopPropagation(),l())}),c.addEventListener(`mousedown`,e=>{e.preventDefault(),e.stopPropagation(),l()}),ze(y,`.aih-tb-grip`)}function qe(){if(b)return;b=document.createElement(`div`),b.id=`aih-selection-result`,b.innerHTML=`
    <div class="aih-result-header">
      <span>${v.sparkle} AI 回答</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="锁定窗口">${v.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="关闭">${v.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="复制全部内容">
          <span class="aih-tb-icon">${v.copyLarge}</span>复制
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="重新生成答案">
          <span class="aih-tb-icon">${v.refresh}</span>重新生成
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
        <div class="aih-followup-send" role="button" tabindex="0" title="发送到侧边栏">${v.send}</div>
      </span>
    </div>
  `,b.querySelector(`.aih-result-close`).addEventListener(`click`,e=>{e.stopPropagation(),J()}),b.querySelector(`.aih-result-lock`).addEventListener(`click`,e=>{e.stopPropagation(),Qe()}),b.querySelector(`.aih-result-footer`).addEventListener(`click`,e=>{e.stopPropagation();let t=e.target.closest(`[data-action]`)?.dataset?.action;if(t===`regenerate-result`){if(!A||!k)return;$(A,k,Ie)}else t===`copy-result`&&ut()});let e=b.querySelector(`.aih-followup-input`);b.querySelector(`.aih-followup-send`).addEventListener(`click`,t=>{t.stopPropagation();let n=e.value.trim();n&&($e(n),e.value=``)}),e.addEventListener(`keydown`,t=>{if(t.key===`Enter`){t.preventDefault();let n=e.value.trim();n&&($e(n),e.value=``)}}),b.querySelector(`.aih-suggestions-list`).addEventListener(`click`,e=>{let t=e.target.closest(`.aih-suggestion-chip`);if(!t)return;e.stopPropagation();let n=t.dataset.question;n&&$e(n)}),b.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&(e.preventDefault(),t.click())}}),W(b),ze(b,`.aih-result-header`)}function Je(e,t,n,r=[]){if(!b)return;W(b);let i=window.innerWidth,a=window.innerHeight;b.style.display=`flex`,b.style.left=`-9999px`,b.style.top=`-9999px`;let o=b.querySelector(`.aih-result-body`);o.innerHTML=n;let s=b.querySelector(`.aih-result-suggestions`),c=b.querySelector(`.aih-suggestions-list`);r.length>0&&s&&c?(c.innerHTML=r.map(e=>`<div class="aih-suggestion-chip" role="button" tabindex="0" data-question="${X(e)}">${X(e)}</div>`).join(``),s.style.display=`block`):s&&(s.style.display=`none`),requestAnimationFrame(()=>{let n=b.getBoundingClientRect(),r=n.width||420,o=Math.min(n.height||200,520),s=e-r/2;s<8&&(s=8),s+r>i-8&&(s=i-r-8);let c=t-o-8;c<8&&(c=t+8),b.style.left=s+`px`,b.style.top=c+`px`,b.style.maxHeight=Math.min(520,a-c-16)+`px`,E=!0,W(b)})}function Ye(e,t){if(!b)return;F={x:e,y:t},D=!1,Y();let n=b.querySelector(`.aih-result-suggestions`);n&&(n.style.display=`none`);let r=b.querySelector(`.aih-followup-input`);r&&(r.value=``),W(b),b.style.display=`flex`;let i=b.querySelector(`.aih-result-body`);i.innerHTML=`<div class="aih-result-loading"><div class="aih-spinner"></div>AI 正在思考...</div>`,Ze(b,e,t),E=!0,Q()}function Xe(e,t,n){if(!b)return;D=!1,O=``,Y(),W(b),b.style.display=`flex`;let r=b.querySelector(`.aih-result-body`);r.innerHTML=`<div class="aih-result-error">请求失败: ${X(n)}</div>`,Ze(b,e,t),E=!0}function Ze(e,t,n){let r=window.innerWidth,i=window.innerHeight;e.style.left=`-9999px`,e.style.top=`-9999px`,requestAnimationFrame(()=>{let a=e.getBoundingClientRect(),o=a.width||420,s=Math.min(a.height||200,520),c=t-o/2;c<8&&(c=8),c+o>r-8&&(c=r-o-8);let l=n-s-8;l<8&&(l=n+8),e.style.left=c+`px`,e.style.top=l+`px`,e.style.maxHeight=Math.min(520,i-l-16)+`px`,W(e)})}function J(){b&&(b.style.display=`none`,E=!1,D=!1,O=``,Y())}function Qe(){D=!D,Y()}function Y(){if(!b)return;let e=b.querySelector(`.aih-result-lock`);e&&(D?(e.innerHTML=v.lock,e.classList.add(`locked`),e.title=`解除锁定`):(e.innerHTML=v.unlock,e.classList.remove(`locked`),e.title=`锁定窗口`))}function $e(t){if(!t||!K())return;let n=j||k||``;try{chrome.runtime.sendMessage({type:`DIRECT_SEND`,text:t,selectedText:n}).catch(t=>{e.error(`[SelectionToolbar] 发送追问到侧边栏失败:`,t)})}catch{}}function et(t,n){if(!(!t||!K()))try{chrome.runtime.sendMessage({type:`DIRECT_SEND`,text:t,selectedText:n||``}).catch(t=>{e.error(`[SelectionToolbar] 发送到侧边栏失败:`,t)})}catch{}}function X(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function Z(e,t){if(!y||!j||E)return;W(y);let n=window.innerWidth,r=window.innerHeight;y.style.display=`flex`,lastToolbarShowTime=Date.now(),requestAnimationFrame(()=>{let i=y.getBoundingClientRect(),a=i.width||300,o=i.height||40,s=e-a/2;s<8&&(s=8),s+a>n-8&&(s=n-a-8);let c=t-o-10;c<8&&(c=t+10),c<8&&(c=8),c+o>r-8&&(c=r-o-8),y.style.left=s+`px`,y.style.top=c+`px`,x||=(y.classList.add(`show`),!0)})}function Q(){!y||!x||(S&&(S=!1,C=``,w=null,y.classList.remove(`aih-ask-mode`),y.style.width=``,T&&=(y.style.left=T,``)),y.classList.remove(`show`),y.style.display=`none`,x=!1)}function tt(){if(!y)return{x:0,y:0};let e=y.getBoundingClientRect();return{x:e.left+e.width/2,y:e.top}}function nt(e){let t=e.getBoundingClientRect();return{x:t.left+t.width/2,y:t.top}}function rt(){if(!K()||!M)return;if(!H){let t=r();if(e.debug(`[SelectionToolbar] iframe onSelectionChange text:`,t.text?.substring(0,30),`currentSelectedText:`,!!j,`pendingIframeSelection:`,!!U),t.text&&t.text.length>=2){let n=o(t.range);U={text:t.text,x:n.x,y:n.y},e.debug(`[SelectionToolbar] iframe pendingIframeSelection 已设置`)}else if(j){j=``,U=null;try{chrome.runtime.sendMessage({type:`IFRAME_SELECTION_CLEAR`}).catch(()=>{})}catch{}}return}if(N.length>0&&N.includes(window.location.hostname)||Le)return;let t=window.getSelection(),n=t?t.toString().trim():``,i=null;if(n&&n.length>=2&&t.rangeCount>0)i=t.getRangeAt(0);else{let e=r();e.text&&e.text.length>=2&&(n=e.text,i=e.range)}if(!n||n.length<2){S||Q(),j=``,I=null;return}let a=5e3,s=n.length>a?n.substring(0,a)+`...`:n;if(i){let e=i.commonAncestorContainer,t=e.nodeType===Node.TEXT_NODE?e.parentElement.closest(`[contenteditable], input, textarea`):e.closest&&e.closest(`[contenteditable], input, textarea`);if(t instanceof HTMLElement&&(t.tagName===`INPUT`||t.tagName===`TEXTAREA`)){Q(),j=``,I=null;return}}j=s,I=!0}function it(e){if(!(y&&y.contains(e.target))&&!(b&&b.contains(e.target))){if(P){P=!1;return}E&&!D&&J(),x&&!S&&Q(),chrome.runtime.sendMessage({type:`IFRAME_CLICK_DISMISS`}).catch(()=>{})}}function at(){if(e.debug(`[SelectionToolbar] onMouseUp isTopFrame:`,H,`pendingSelection:`,I,`pendingIframeSelection:`,!!U,`currentSelectedText:`,!!j,`isToolbarVisible:`,x,`toolbarEl:`,!!y),!H){if(U){P=!0,U.text,j=U.text;try{window.parent.postMessage({type:`IFRAME_SELECTION`,text:U.text,x:U.x,y:U.y},`*`)}catch{}try{chrome.runtime.sendMessage({type:`IFRAME_SELECTION`,text:U.text,x:U.x,y:U.y}).catch(()=>{})}catch{}U=null}return}if(!x&&I&&j){P=!0;let e=window.innerWidth/2,t=window.innerHeight/2,n=window.getSelection();if(n&&n.rangeCount>0){let r=n.getRangeAt(0).getBoundingClientRect();(r.width>0||r.height>0)&&(e=r.left+r.width/2,t=r.top)}if(e===window.innerWidth/2&&t===window.innerHeight/2){let n=r();if(n.text&&n.text.length>=2){let r=o(n.range);e=r.x,t=r.y}}chrome.runtime.sendMessage({type:`IFRAME_CLICK_DISMISS`}).catch(()=>{}),Z(e,t),I=null}}function ot(){if(S)return;if(!H&&j){let e=r();if(e.text){let t=o(e.range);try{window.parent.postMessage({type:`IFRAME_SELECTION`,text:e.text,x:t.x,y:t.y},`*`)}catch{}try{chrome.runtime.sendMessage({type:`IFRAME_SELECTION`,text:e.text,x:t.x,y:t.y}).catch(()=>{})}catch{}}return}if(!x)return;let e=window.getSelection();if(e&&e.rangeCount>0&&j){let t=e.getRangeAt(0).getBoundingClientRect();if(t.width>0||t.height>0){Z(t.left+t.width/2,t.top);return}}let t=r();if(t.text&&t.text.length>=2&&j){let e=o(t.range);Z(e.x,e.y);return}Q()}function st(){S||x&&Q()}function ct(e,t){if(!t)return;if(k=t,e===`copy`){lt(t),Q();return}if(A=e,Ie=``,[`ai-search`,`explain`,`translate`,`summary`].includes(e)){$(e,t);return}let n=L.find(t=>t.id===e);n&&(Ie=n.systemPrompt||``,$(e,t,n.systemPrompt))}function lt(t){dt(t).then(()=>{mt()}).catch(t=>{e.error(`[SelectionToolbar] 复制失败:`,t),pt()})}function ut(){let t=O;t&&dt(t).then(()=>{mt()}).catch(t=>{e.error(`[SelectionToolbar] 复制结果失败:`,t),pt()})}async function dt(e){if(!navigator.clipboard)return ft(e);try{await navigator.clipboard.writeText(e)}catch(t){if(t.name===`NotAllowedError`||t.name===`SecurityError`)return ft(e);throw t}}function ft(e){return new Promise((t,n)=>{let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-9999px`,r.style.opacity=`0`,W(r);try{r.select(),r.setSelectionRange(0,e.length),document.execCommand(`copy`)?t():n(Error(`execCommand copy failed`))}catch(e){n(e)}finally{r.remove()}})}function pt(){let e=document.getElementById(`aih-copy-toast`);e&&e.remove();let t=document.createElement(`div`);t.id=`aih-copy-toast`,t.textContent=`复制失败，请手动复制`,t.style.cssText=`
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
  `,W(t),t.style.zIndex=`2147483647`,setTimeout(()=>t.remove(),1800)}function mt(){let e=document.getElementById(`aih-copy-toast`);e&&e.remove();let t=document.createElement(`div`);if(t.id=`aih-copy-toast`,t.textContent=`已复制`,t.style.cssText=`
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
    `,document.head.appendChild(e)}W(t),t.style.zIndex=`2147483647`,setTimeout(()=>t.remove(),1300)}function $(t,n,r){if(!K()){e.warn(`[SelectionToolbar] 扩展上下文已失效，请刷新页面`);return}let i={"ai-search":`搜索并分析以下内容：\n\n${n}`,explain:`用1-3句话简洁解释以下内容，不需要展开说明。\n\n${n}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`,translate:`翻译以下内容，只输出翻译结果：\n\n${n}`,summary:`用3-5个要点总结以下内容，每条要点一句话。\n\n${n}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`},a=r?`请处理以下内容：\n\n${n}`:i[t]||n;if(t===`ai-search`){Q(),window.getSelection().removeAllRanges();try{chrome.runtime.sendMessage({type:`SELECTION_TOOLBAR_ACTION`,action:t,text:n,prompt:a}).catch(t=>{e.error(`[SelectionToolbar] 发送消息失败:`,t)})}catch{}return}qe();let o={"ai-search":`AI搜索`,explain:`解释`,translate:`翻译`,summary:`总结`}[t];if(!o&&L){let e=L.find(e=>e.id===t);o=e?e.name:`AI 回答`}let s=b.querySelector(`.aih-result-header span`);s&&(s.innerHTML=`${v.sparkle} ${o||`AI 回答`}`);let c=E&&b?nt(b):tt();Ye(c.x,c.y),chrome.runtime.sendMessage({type:`SELECTION_TOOLBAR_ACTION`,action:t,text:n,prompt:a,systemPrompt:r||``}).catch(t=>{e.error(`[SelectionToolbar] 发送消息失败:`,t),Xe(c.x,c.y,t.message)})}chrome.runtime.onMessage.addListener((t,n,r)=>{if(K()){if(t.type===`IFRAME_SELECTION`){if(!H)return;e.debug(`[SelectionToolbar] 收到 IFRAME_SELECTION text:`,t.text?.substring(0,30),`isToolbarVisible:`,x,`isResultVisible:`,E),j=t.text;let n=t.x,r=t.y;if(window.top!==window&&window.frameElement)try{let e=window.frameElement.getBoundingClientRect();n=t.x-e.left,r=t.y-e.top}catch{}if(x&&y&&j){requestAnimationFrame(()=>{let e=window.innerWidth,t=y.offsetWidth||300,i=y.offsetHeight||40,a=n-t/2;a<8&&(a=8),a+t>e-8&&(a=e-t-8);let o=r-i-8;o<8&&(o=r+8),y.style.left=a+`px`,y.style.top=o+`px`});return}I={x:n,y:r},j&&j.length>=2&&Z(n,r);return}if(t.type===`IFRAME_SELECTION_CLEAR`){if(!H)return;x&&!S&&(Q(),j=``);return}if(t.type===`IFRAME_CLICK_DISMISS`){x&&y&&Date.now()-lastToolbarShowTime>300&&(Q(),j=``),E&&!D&&J();return}if(H){if(t.type===`SELECTION_TOOLBAR_STREAM_START`){B=``;return}if(t.type===`SELECTION_TOOLBAR_STREAM_CHUNK`){if(B+=t.delta||``,b&&E){let e=b.querySelector(`.aih-result-body`);e&&(e.querySelector(`.aih-result-content-stream`)||(e.innerHTML=`<div class="aih-result-content-stream"></div>`),e.innerHTML=`<div class="aih-result-content-stream">`+X(B).replace(/\n/g,`<br>`)+`</div>`)}return}if(t.type===`SELECTION_TOOLBAR_STREAM_DONE`){t.finalContent&&(B=t.finalContent);let e=B||`无响应`;O=B;let n=e,r=[],i=e.indexOf(`---SUGGESTIONS---`);i!==-1&&(n=e.substring(0,i).trim(),O=n,r=e.substring(i+17).split(`
`).map(e=>e.replace(/^[\d]+[\.\、\s]+/,``).trim()).filter(e=>e.length>0).slice(0,3));let a=typeof marked<`u`?marked.parse(n):X(n).replace(/\n/g,`<br>`);Je(F.x,F.y,a,r),B=``;return}if(t.type===`SELECTION_TOOLBAR_RESULT`)if(t.error)O=``,Xe(F.x,F.y,t.error);else{let e=t.content||`无响应`,n=e;O=e;let r=[],i=e.indexOf(`---SUGGESTIONS---`);i!==-1&&(n=e.substring(0,i).trim(),O=n,r=e.substring(i+17).split(`
`).map(e=>e.replace(/^[\d]+[\.\、\s]+/,``).trim()).filter(e=>e.length>0).slice(0,3));let a=typeof marked<`u`?marked.parse(n):X(n).replace(/\n/g,`<br>`);Je(F.x,F.y,a,r)}}}});function ht(){if(!K())return;let e=window.location.hostname;try{chrome.storage.local.get([`blockedDomains`],t=>{try{let n=t.blockedDomains||[];n.includes(e)||(n.push(e),chrome.storage.local.set({blockedDomains:n},()=>{N=n,Q(),J(),j=``}))}catch{}})}catch{}}function gt(){K()&&chrome.storage.local.get([`enableSelectionToolbar`,`blockedDomains`],t=>{M=t.enableSelectionToolbar===void 0?!0:!!t.enableSelectionToolbar,N=t.blockedDomains||[],e.debug(`[SelectionToolbar] 开关状态:`,M?`已启用`:`已禁用`,`屏蔽域名:`,N.length)})}chrome.storage.onChanged.addListener((e,t)=>{K()&&(t===`local`&&e.enableSelectionToolbar&&(M=!!e.enableSelectionToolbar.newValue,M||(Q(),J(),j=``)),t===`local`&&e.blockedDomains&&(N=e.blockedDomains.newValue||[]),t===`local`&&e.toolbarTools&&He())});function _t(){Be(),Ke(),qe(),gt(),document.addEventListener(`selectionchange`,rt),document.addEventListener(`click`,it,!0),document.addEventListener(`mouseup`,at,!0),window.addEventListener(`scroll`,ot,!0),window.addEventListener(`resize`,st),window.addEventListener(`message`,e=>{if(e.data?.type===`IFRAME_SELECTION`&&H){j=e.data.text;let t=e.data.x,n=e.data.y;if(window.top!==window&&window.frameElement)try{let r=window.frameElement.getBoundingClientRect();t=e.data.x-r.left,n=e.data.y-r.top}catch{}if(x&&y&&j){requestAnimationFrame(()=>{let e=window.innerWidth,r=y.offsetWidth||300,i=y.offsetHeight||40,a=t-r/2;a<8&&(a=8),a+r>e-8&&(a=e-r-8);let o=n-i-8;o<8&&(o=n+8),y.style.left=a+`px`,y.style.top=o+`px`});return}I={x:t,y:n},j&&j.length>=2&&Z(t,n);return}e.data?.type===`IFRAME_CLICK_DISMISS`&&H&&E&&!D&&J()}),H&&(V=s(rt),new MutationObserver(()=>{c(V),V=s(rt)}).observe(document.body,{childList:!0,subtree:!0})),e.debug(`[SelectionToolbar] 初始化完成`,H?`(顶层frame)`:`(子frame)`)}e.debug(`[ContentScript] 内容脚本已加载 URL:`,window.location.href,`isTopFrame:`,window.top===window,`hasBody:`,!!document.body),document.addEventListener(`keydown`,e=>{(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key===`A`&&(e.preventDefault(),chrome.action.click()),e.altKey&&!e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:`CAPTURE_TAB_FROM_PAGE`})),e.altKey&&e.shiftKey&&e.code===`KeyS`&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:`CAPTURE_REGION_FROM_PAGE`}))});var vt={GET_PAGE_TEXT:e=>l(e),GET_FULL_HTML:e=>u(e),QUERY_INTERACTIVE_ELEMENTS:e=>d(e),GET_SELECTED_CONTENT:e=>te(e.format),CLICK_ELEMENT:e=>_e(e.selector,e.waitTime,e.timeout),FILL_FORM:e=>be(e.fields,e.waitTime),SCROLL_TO:e=>xe(e),HOVER_ELEMENT:e=>ie(e.selector),KEYBOARD_INPUT:e=>we(e),FILE_UPLOAD:e=>Ee(e.selector,e.fileName,e.fileContent,e.fileType),EXTRACT_TABLE:e=>m(e.selector,e.includeHeaders,e.format),EXTRACT_METADATA:()=>ae(),EXTRACT_LINKS:e=>se(e.filterType,e.includeImages),EXTRACT_FORMS:e=>ce(e.formSelector),EXTRACT_IMAGES:e=>le(e),SEARCH_IN_PAGE:e=>ue(e),PAGE_TO_MARKDOWN:e=>de(e.selector,e.includeImages,e.includeLinks,e.maxLength),PAGE_TO_JSON:e=>fe(e.selector,e.maxItems),FIND_SIMILAR_ELEMENTS:e=>pe(e.selector,e.maxResults),GET_IFRAME_CONTENT:e=>me(e.selector,e.includeNested,e.maxLength),HIGHLIGHT_TEXT:e=>oe(e.text,e.color),REMOVE_HIGHLIGHTS:()=>h(),SHADOW_DOM_QUERY:e=>Pe(e.selector,e.deep,e.maxDepth,e.maxResults),MANAGE_STORAGE:e=>Oe(e),TEXT_TO_SPEECH:e=>Ae(e.text,e.lang,e.rate,e.pitch),INJECT_CSS:e=>Fe(e.css,e.targetSelector,e.injectMode),VIDEO_CONTROL:e=>je(e.action,e.selector,e.value),COPY_TO_CLIPBOARD:e=>ne(e.text),PASTE_FROM_CLIPBOARD:()=>re(),WAIT_FOR_ELEMENT:e=>Ce(e.selector,e.state,e.timeout),DRAG_AND_DROP:e=>Te(e.sourceSelector,e.targetSelector),SELECT_DROPDOWN:e=>De(e.triggerSelector,e.optionText,e.optionSelector,e.timeout),COLOR_PICKER:()=>ke(),GENERATE_QRCODE:e=>Ne(e.content,e.size,e.errorCorrection,e.showImage),GET_ELEMENT_COUNT:e=>he(e.selector,e.includeHidden),SCROLL_AND_COLLECT:e=>ge(e),CLEAR_PAGE_DATA:e=>{try{let t=[];return e.site?window.location.href.includes(new URL(e.site).hostname)&&(localStorage.clear(),sessionStorage.clear(),t.push(`localStorage`,`sessionStorage`)):(localStorage.clear(),sessionStorage.clear(),t.push(`localStorage`,`sessionStorage`)),{success:!0,cleared:t}}catch(e){return{success:!1,error:e.message}}},START_REGION_SELECTION:()=>xt()},yt=new Set([`COPY_TO_CLIPBOARD`,`PASTE_FROM_CLIPBOARD`,`WAIT_FOR_ELEMENT`,`DRAG_AND_DROP`,`SELECT_DROPDOWN`,`SCROLL_AND_COLLECT`,`WATCH_ELEMENT`,`COLOR_PICKER`,`GENERATE_QRCODE`,`SCREENSHOT_ELEMENT`,`PAGE_TO_PDF`,`START_REGION_SELECTION`]),bt=new Set([`GET_PAGE_TEXT`,`GET_FULL_HTML`,`PAGE_TO_MARKDOWN`,`PAGE_TO_JSON`,`EXTRACT_METADATA`,`EXTRACT_TABLE`,`GET_ELEMENT_COUNT`,`SCROLL_AND_COLLECT`,`GET_IFRAME_CONTENT`,`QUERY_INTERACTIVE_ELEMENTS`]);chrome.runtime.onMessage.addListener((e,t,n)=>{if(bt.has(e.type)&&window.top!==window)return;if(e.action===`getSelectedText`){let e=window.getSelection()?.toString()?.trim()||``;if(e&&document.hasFocus())return n({text:e}),!0;let t=r();return t.text&&t.text.trim()&&document.hasFocus()&&n({text:t.text.trim()}),!0}let i=vt[e.type];if(!i)return;let a=i(e);if(yt.has(e.type)||a instanceof Promise)return Promise.resolve(a).then(n),!0;n(a)}),_t();function xt(){return new Promise(e=>{let t=document.createElement(`div`);t.id=`__region_select_overlay__`,t.style.cssText=`
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
//# sourceMappingURL=content-AUnPY9-H.js.map