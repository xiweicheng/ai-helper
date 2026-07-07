function getPageText(e={}){let{maxLength:t=15e3,includeHeadings:n=!0,includeLinks:r=!0}=e,i=document.body?document.body.innerText:``,a={title:document.title||``,url:window.location.href,content:i.substring(0,t),wordCount:i.split(/\s+/).length};return n&&(a.headings=Array.from(document.querySelectorAll(`h1, h2, h3, h4, h5, h6`)).map(e=>({level:e.tagName,text:e.textContent.trim()})).filter(e=>e.text.length>0).slice(0,30)),r&&(a.links=Array.from(document.querySelectorAll(`a`)).map(e=>({text:e.textContent.trim(),href:e.href})).filter(e=>e.text.length>0).slice(0,50)),{success:!0,data:a}}function getFullHtml(e={}){let{includeStyles:t=!1,maxLength:n=5e4}=e,r=document.documentElement.outerHTML;return t||(r=r.replace(/\s*style="[^"]*"/gi,``)),{success:!0,content:JSON.stringify({title:document.title,url:window.location.href,html:r.substring(0,n),fullLength:r.length})}}function queryInteractiveElements(e={}){let{filterByText:t,elementTypes:n,maxResults:r=100}=e,i=[],a=new Set,o={button:`button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]`,input:`input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])`,select:`select`,textarea:`textarea`,a:`a[href]`,checkbox:`input[type="checkbox"]`,radio:`input[type="radio"]`,menuitem:`[role="menuitem"], [role="menu"], [role="menuitemcheckbox"], [role="menuitemradio"]`},s=[];return n&&n.length>0?n.forEach(e=>{o[e]&&s.push(o[e])}):s=Object.values(o),s.forEach(e=>{try{document.querySelectorAll(e).forEach(e=>{let n=generateUniqueSelector(e);if(a.has(n))return;a.add(n);let r=e.tagName.toLowerCase(),o=getElementText(e),s=getElementValue(e);if(t&&!o.toLowerCase().includes(t.toLowerCase()))return;let c={tag:r,selector:n,text:o.substring(0,100)};r===`a`?c.href=e.href:(r===`input`||r===`select`||r===`textarea`)&&(c.name=e.name,c.type=e.type||`text`,c.value=s,c.placeholder=e.placeholder),e.id&&(c.id=e.id),e.className&&typeof e.className==`string`&&(c.className=e.className.split(` `).filter(e=>e).slice(0,3).join(` `)),i.push(c)})}catch{}}),{success:!0,count:Math.min(i.length,r),total:i.length,elements:i.slice(0,r)}}function generateUniqueSelector(e){if(e.id)return`#${e.id}`;let t=[],n=e;for(;n&&n!==document.body&&n!==document.documentElement;){let e=n.tagName.toLowerCase();if(n.id){e=`#${n.id}`,t.unshift(e);break}if(n.className&&typeof n.className==`string`){let t=n.className.trim().split(/\s+/).filter(e=>e);t.length>0&&(e+=`.`+t[0])}let r=n.parentElement;if(r){let t=Array.from(r.children).filter(e=>e.tagName===n.tagName);if(t.length>1){let r=t.indexOf(n)+1;e+=`:nth-child(${r})`}}t.unshift(e),n=r}return t.join(` > `)}function getElementText(e){if(e.tagName===`INPUT`||e.tagName===`TEXTAREA`)return e.value||e.placeholder||e.name||``;if(e.tagName===`SELECT`){let t=e.options[e.selectedIndex];return t?t.text:``}return e.textContent.trim()}function getElementValue(e){return e.tagName===`INPUT`?e.type===`checkbox`||e.type===`radio`?e.checked?`checked`:`unchecked`:e.value:e.tagName===`SELECT`?e.value:``}function getSelectedContent(e=`text`){try{let t=window.getSelection();if(!t||t.isCollapsed||t.rangeCount===0)return{success:!1,error:`当前没有选中的内容`};let n={success:!0,data:{selectedCount:t.rangeCount,text:``}};if(e===`html`){let e=[];for(let n=0;n<t.rangeCount;n++){let r=t.getRangeAt(n).cloneContents(),i=document.createElement(`div`);i.appendChild(r),e.push(i.innerHTML)}n.data.html=e.join(`
`),n.data.text=t.toString()}else n.data.text=t.toString();return n}catch(e){return{success:!1,error:e.message}}}function extractTable(e=`table`,t=!0,n=`json`){try{let r=document.querySelector(e);if(!r)return{success:!1,error:`未找到匹配选择器的表格: ${e}`};let i=Array.from(r.querySelectorAll(`tr`)),a=[];return i.forEach((e,n)=>{let r=Array.from(e.querySelectorAll(`td, th`)).map(e=>e.textContent.trim());(t||n>0)&&a.push(r)}),n===`markdown`?a.length===0?{success:!0,content:`表格为空`}:{success:!0,content:`${`| ${a[0].join(` | `)} |`}\n${`| ${a[0].map(()=>`---`).join(` | `)} |`}\n${a.slice(1).map(e=>`| ${e.join(` | `)} |`).join(`
`)}`}:{success:!0,content:JSON.stringify({data:a,rowCount:a.length,columnCount:a[0]?.length||0}),data:a}}catch(e){return{success:!1,error:e.message}}}async function copyToClipboard$1(e){try{return await navigator.clipboard.writeText(e),{success:!0,message:`已复制到剪贴板`}}catch{try{let t=document.createElement(`textarea`);return t.value=e,t.style.position=`fixed`,t.style.left=`-9999px`,document.body.appendChild(t),t.select(),document.execCommand(`copy`),document.body.removeChild(t),{success:!0,message:`已复制到剪贴板（降级方案）`}}catch(e){return{success:!1,error:e.message}}}}async function pasteFromClipboard(){try{return{success:!0,content:await navigator.clipboard.readText()}}catch(e){return{success:!1,error:e.message}}}function hoverElement(e){try{let t=document.querySelector(e);if(!t)return{success:!1,error:`未找到元素: ${e}`};let n=new MouseEvent(`mouseenter`,{bubbles:!0,cancelable:!0,view:window});t.dispatchEvent(n);let r=new MouseEvent(`mouseover`,{bubbles:!0,cancelable:!0,view:window});return t.dispatchEvent(r),{success:!0,message:`已在元素上触发悬停效果: ${e}`}}catch(e){return{success:!1,error:e.message}}}function extractMetadata(){try{let e=e=>{let t=document.querySelector(`meta[name="${e}"]`)||document.querySelector(`meta[property="${e}"]`)||document.querySelector(`meta[property="og:${e}"]`);return t?t.content:null},t=e=>{let t=document.querySelectorAll(`meta[name="${e}"], meta[property="${e}"], meta[property="og:${e}"]`);return Array.from(t).map(e=>e.content).filter(Boolean)},n=[];document.querySelectorAll(`script[type="application/ld+json"]`).forEach(e=>{try{let t=JSON.parse(e.textContent);Array.isArray(t)?n.push(...t):t&&t[`@graph`]&&Array.isArray(t[`@graph`])?n.push(...t[`@graph`]):t&&n.push(t)}catch{}});let r=[];return document.querySelectorAll(`[itemscope]`).forEach(e=>{let t=e.getAttribute(`itemtype`)||``;if(!t)return;let n={};e.querySelectorAll(`[itemprop]`).forEach(t=>{if(t.closest(`[itemscope]`)!==e)return;let r=t.getAttribute(`itemprop`)||``;if(!r)return;let i=t.getAttribute(`content`)||t.getAttribute(`href`)||t.getAttribute(`src`)||t.textContent?.trim();i&&(n[r]?n[r]=Array.isArray(n[r])?[...n[r],i]:[n[r],i]:n[r]=i)}),r.push({itemType:t,properties:n})}),{success:!0,data:{title:document.title,description:e(`description`),keywords:e(`keywords`),author:e(`author`),ogTitle:e(`og:title`),ogDescription:e(`og:description`),ogImage:e(`og:image`),ogUrl:e(`og:url`),ogType:e(`og:type`),ogSiteName:e(`og:site_name`),ogLocale:e(`og:locale`),articlePublishedTime:e(`article:published_time`),articleModifiedTime:e(`article:modified_time`),articleAuthor:e(`article:author`),twitterCard:e(`twitter:card`),twitterTitle:e(`twitter:title`),twitterDescription:e(`twitter:description`),twitterImage:e(`twitter:image`),twitterSite:e(`twitter:site`),twitterCreator:e(`twitter:creator`),canonicalUrl:document.querySelector(`link[rel="canonical"]`)?.href,links:t(`citation_author`),jsonLd:n.length>0?n:void 0,microdata:r.length>0?r:void 0}}}catch(e){return{success:!1,error:e.message}}}function removeHighlights(){document.querySelectorAll(`.ai-helper-highlight`).forEach(e=>{let t=e.parentNode;if(t&&t.insertBefore&&t.removeChild){for(;e.firstChild;)t.insertBefore(e.firstChild,e);t.removeChild(e),typeof t.normalize==`function`&&t.normalize()}});let e=document.getElementById(`ai-helper-highlight-style`);e&&e.remove()}function highlightText(e,t=`yellow`){try{if(!e)return{success:!1,error:`未提供要高亮的文本`};removeHighlights();let n=document.createElement(`style`);n.id=`ai-helper-highlight-style`,n.textContent=`
      .ai-helper-highlight {
        background-color: ${t} !important;
        padding: 2px 0;
      }
    `,document.head.appendChild(n);let r=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),i=[],a;for(;a=r.nextNode();)a.nodeValue.toLowerCase().includes(e.toLowerCase())&&i.push(a);let o=[];return i.forEach(e=>{let t=e.parentNode;if(!t||!t.replaceChild||!t.insertBefore)return;let n=e.nodeValue,r=n.toLowerCase(),i=n.toLowerCase(),a=r.indexOf(i);if(a!==-1){let r=document.createElement(`span`);r.className=`ai-helper-highlight`,r.textContent=n.substring(a,a+n.length);let i=document.createTextNode(n.substring(0,a)),s=document.createTextNode(n.substring(a+n.length));t.replaceChild(s,e),t.insertBefore(r,s),t.insertBefore(i,r),o.push(r)}}),o.length>0&&o[0].scrollIntoView({behavior:`smooth`,block:`center`}),{success:!0,message:`已高亮 ${o.length} 处文本`,count:o.length}}catch(e){return{success:!1,error:e.message}}}function extractLinks(e=`all`,t=!1){try{let n=window.location.hostname,r=[];return document.querySelectorAll(`a[href]`).forEach(t=>{try{let i=t.href;if(!i||i.startsWith(`javascript:`)||i.startsWith(`#`))return;let a=new URL(i),o=a.hostname!==n;if(e===`internal`&&o||e===`external`&&!o)return;r.push({href:i,text:t.textContent.trim(),title:t.title,domain:a.hostname,isExternal:o,target:t.target})}catch{}}),t&&document.querySelectorAll(`img[src]`).forEach(t=>{try{let i=t.src;if(!i)return;let a=new URL(i),o=a.hostname!==n;if(e===`internal`&&o||e===`external`&&!o)return;r.push({href:i,text:t.alt||``,title:t.title,domain:a.hostname,isExternal:o,type:`image`})}catch{}}),{success:!0,total:r.length,links:r}}catch(e){return{success:!1,error:e.message}}}function extractForms(e=null){try{let t=(e?[document.querySelector(e)].filter(Boolean):Array.from(document.querySelectorAll(`form`))).map((e,t)=>{let n=[],r=e.id||`form-${t}`;return e.querySelectorAll(`input`).forEach(e=>{n.push({tag:`input`,name:e.name,id:e.id,type:e.type,placeholder:e.placeholder,required:e.required,selector:getElementSelector$1(e)})}),e.querySelectorAll(`textarea`).forEach(e=>{n.push({tag:`textarea`,name:e.name,id:e.id,placeholder:e.placeholder,required:e.required,selector:getElementSelector$1(e)})}),e.querySelectorAll(`select`).forEach(e=>{let t=Array.from(e.options).map(e=>({value:e.value,text:e.textContent.trim()}));n.push({tag:`select`,name:e.name,id:e.id,required:e.required,options:t,selector:getElementSelector$1(e)})}),{formId:r,action:e.action,method:e.method,fields:n}});return{success:!0,total:t.length,forms:t}}catch(e){return{success:!1,error:e.message}}}function getElementSelector$1(e){if(e.id)return`#${e.id}`;let t=e.tagName.toLowerCase();if(e.className){let n=e.className.split(` `).filter(e=>e).slice(0,2);n.length&&(t+=`.`+n.join(`.`))}return t}function extractImages(e={}){try{let{minWidth:t=0,minHeight:n=0,includeBackgroundImages:r=!1,download:i=!1,maxResults:a=100}=e,o=[],s=new Set;return document.querySelectorAll(`img[src]`).forEach(e=>{try{let r=e.src;if(!r||s.has(r))return;let i=e.naturalWidth||e.width||0,a=e.naturalHeight||e.height||0;i>=t&&a>=n&&(s.add(r),o.push({src:r,alt:e.alt||``,title:e.title||``,width:i,height:a,selector:getElementSelector$1(e)}))}catch{}}),r&&document.querySelectorAll(`*`).forEach(e=>{try{let t=window.getComputedStyle(e).backgroundImage;if(!t||t===`none`||t.startsWith(`gradient`))return;let n=t.match(/url\(['"]?([^'")]+)['"]?\)/);if(n&&n[1]){let t=n[1];s.has(t)||(s.add(t),o.push({src:t,alt:``,title:``,width:0,height:0,type:`background`,selector:getElementSelector$1(e)}))}}catch{}}),i&&o.length>0&&o.slice(0,Math.min(a,10)).forEach((e,t)=>{setTimeout(()=>{let n=document.createElement(`a`);n.href=e.src,n.download=`image_${t+1}.png`,document.body.appendChild(n),n.click(),document.body.removeChild(n)},t*500)}),{success:!0,total:o.length,images:o.slice(0,a),message:i?`已开始下载 ${Math.min(o.length,10)} 张图片`:``}}catch(e){return{success:!1,error:e.message}}}function searchInPage(e={}){try{let{query:t,pattern:n,mode:r=`plain`,caseSensitive:i=!1,contextLength:a=50,maxResults:o=20,highlight:s=!1}=e,c=t||n;if(!c)return{success:!1,error:`需要提供搜索关键词`};if(r===`plain`){let e=window.find(c,i,!1,!0,!1,!0,!1),t=0,n=[];try{let e=window.getSelection(),r=e&&e.rangeCount>0?e.getRangeAt(0):null,s=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),l=i?`g`:`gi`,u=c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),d=new RegExp(u,l),f=document.body.innerText,p=0;for(;s.nextNode();){let e=s.currentNode.textContent.match(d);if(e)for(let r of e){if(n.length>=o)break;let e=f.indexOf(r,p),i=Math.max(0,e-a),s=Math.min(f.length,e+r.length+a);n.push({match:r,position:e,context:f.substring(i,s),lineNumber:f.substring(0,e).split(`
`).length}),t++,p=e+r.length}if(n.length>=o)break}r&&(e.removeAllRanges(),e.addRange(r))}catch{t=+!!e}if(s&&t>0){removeHighlights();let e=document.createElement(`style`);e.id=`ai-helper-highlight-style`,e.textContent=`
          .ai-helper-search-highlight {
            background-color: #ffff00;
            color: #000;
            padding: 1px 2px;
            border-radius: 2px;
          }
        `,document.head.appendChild(e);let t=i?`g`:`gi`,n=c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`);document.body.innerHTML=document.body.innerHTML.replace(new RegExp(n,t),`<span class="ai-helper-search-highlight">$&</span>`)}return{success:!0,query:c,mode:`plain`,found:e,total:t,matches:n,highlighted:s}}let l=i?`g`:`gi`,u=new RegExp(c,l),d=document.body.innerText,f=[],p;for(;(p=u.exec(d))!==null&&f.length<o;){let e=Math.max(0,p.index-a),t=Math.min(d.length,p.index+p[0].length+a);f.push({match:p[0],position:p.index,context:d.substring(e,t),lineNumber:d.substring(0,p.index).split(`
`).length}),p[0].length===0&&u.lastIndex++}if(s&&f.length>0){removeHighlights();let e=document.createElement(`style`);e.id=`ai-helper-highlight-style`,e.textContent=`
        .ai-helper-search-highlight {
          background-color: #ffff00;
          color: #000;
          padding: 1px 2px;
          border-radius: 2px;
        }
      `,document.head.appendChild(e),document.body.innerHTML=document.body.innerHTML.replace(new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g,`\\$&`),l),`<span class="ai-helper-search-highlight">$&</span>`)}return{success:!0,pattern:c,mode:`regex`,total:f.length,matches:f,highlighted:s}}catch(e){return{success:!1,error:e.message}}}function pageToMarkdown(e=null,t=!0,n=!0,r=5e4){try{let i=e?document.querySelector(e):document.body;if(!i)return{success:!1,error:`未找到目标元素`};let a=``,o=(e,r=0)=>{if(r>6)return``;let i=``,a=e.tagName.toLowerCase();switch(a){case`h1`:case`h2`:case`h3`:case`h4`:case`h5`:case`h6`:let s=parseInt(a[1]);i+=`
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

*内容已截断*`),{success:!0,markdown:a,length:a.length,url:window.location.href,title:document.title}}catch(e){return{success:!1,error:e.message}}}function pageToJson(e=null,t=100){try{let n=e?Array.from(document.querySelectorAll(e)):[document.body];if(!n.length)return{success:!1,error:`未找到匹配选择器的元素: ${e}`};let r=[],i=[],a=[],o=[],s=[],c=new Set,l=new Set;return n.forEach(e=>{r.length<t&&e.querySelectorAll(`table`).forEach(e=>{if(r.length>=t)return;let n=[];e.querySelectorAll(`th`).forEach(e=>{n.push(e.textContent.trim())});let i=[];e.querySelectorAll(`tr`).forEach(e=>{let t=[];e.querySelectorAll(`td, th`).forEach(e=>{t.push(e.textContent.trim())}),i.push(t)}),r.push({headers:n,rows:i})}),i.length<t&&e.querySelectorAll(`ul, ol`).forEach(e=>{if(i.length>=t)return;let n=[];e.querySelectorAll(`:scope > li`).forEach(e=>{n.push(e.textContent.trim())}),i.push({tag:e.tagName.toLowerCase(),items:n})}),a.length<t&&e.querySelectorAll(`script[type="application/ld+json"]`).forEach(e=>{if(a.length>=t)return;let n=e.textContent.substring(0,200);if(!c.has(n)){c.add(n);try{let t=JSON.parse(e.textContent);a.push(t)}catch{}}}),o.length<t&&e.querySelectorAll(`article`).forEach(e=>{if(o.length>=t)return;let n=e.textContent.trim();o.push({textContent:n.substring(0,500),wordCount:n.split(/\s+/).filter(Boolean).length})}),s.length<t&&e.querySelectorAll(`[itemscope]`).forEach(e=>{if(s.length>=t)return;let n=e.getAttribute(`itemtype`)||``;if(!n)return;let r=n+e.textContent.trim().substring(0,100);if(l.has(r))return;l.add(r);let i={};e.querySelectorAll(`[itemprop]`).forEach(t=>{if(t.closest(`[itemscope]`)!==e)return;let n=t.getAttribute(`itemprop`)||``;if(!n)return;let r=t.getAttribute(`content`)||t.getAttribute(`href`)||t.getAttribute(`src`)||t.textContent?.trim();r&&(i[n]?i[n]=Array.isArray(i[n])?[...i[n],r]:[i[n],r]:i[n]=r)}),s.push({itemType:n,properties:i})})}),{success:!0,data:{tables:r,lists:i,jsonLd:a,articles:o,microdata:s},counts:{tables:r.length,lists:i.length,jsonLd:a.length,articles:o.length,microdata:s.length}}}catch(e){return{success:!1,error:e.message}}}function findSimilarElements(e,t=50){try{if(!e)return{success:!1,error:`选择器不能为空`};let n=document.querySelector(e);if(!n)return{success:!1,error:`未找到目标元素: ${e}`};let r=e=>{let t=e.tagName.toLowerCase(),n=e.classList?Array.from(e.classList).sort().join(`.`):``,r={};return Array.from(e.children).forEach(e=>{let t=e.tagName.toLowerCase();r[t]=(r[t]||0)+1}),`${t}|${n}|${Object.keys(r).sort().map(e=>`${e}:${r[e]}`).join(`,`)}`},i=r(n),a=[],o=document.querySelectorAll(n.tagName.toLowerCase());for(let e of o)if(e!==n){if(a.length>=t)break;r(e)===i&&a.push({tag:e.tagName.toLowerCase(),selector:generateUniqueSelector(e),text:(e.textContent||``).trim().substring(0,200),id:e.id||``,className:typeof e.className==`string`?e.className:``})}return{success:!0,original:{tag:n.tagName.toLowerCase(),selector:generateUniqueSelector(n),text:(n.textContent||``).trim().substring(0,200),signature:i},similar:a,count:a.length}}catch(e){return{success:!1,error:e.message}}}function getIframeContent(e=`iframe`,t=!1,n=1e4){try{let r=document.querySelectorAll(e),i=[],a=(e,r=1,o=``)=>{try{let s=generateUniqueSelector(e),c=o?`${o} > iframe`:s,l=e.src||`about:blank`,u=!1,d=``,f=``,p=0;try{let i=e.contentDocument||e.contentWindow?.document;i&&(u=!0,d=i.title||``,f=(i.body?.innerText||``).substring(0,n),p=(i.documentElement?.outerHTML||``).length,t&&r<2&&i.querySelectorAll(`iframe`).forEach(e=>{a(e,r+1,c)}))}catch{u=!1}i.push({selector:c,url:l,accessible:u,title:d,textContent:f,htmlLength:p})}catch{}};return r.forEach(e=>a(e)),{success:!0,iframes:i,total:i.length,accessible:i.filter(e=>e.accessible).length}}catch(e){return{success:!1,error:e.message}}}function getElementCount(e,t=!1){try{let n=document.querySelectorAll(e);if(!t){let t=0,r=n.length;return n.forEach(e=>{let n=window.getComputedStyle(e);n.display!==`none`&&n.visibility!==`hidden`&&n.opacity!==`0`&&t++}),{success:!0,count:t,totalCount:r,empty:t===0,selector:e}}return{success:!0,count:n.length,totalCount:n.length,empty:n.length===0,selector:e}}catch(e){return{success:!1,error:e.message}}}function scrollAndCollect(e={}){let{scrollPixels:t=800,maxScrolls:n=20,pauseMs:r=500,selector:i}=e;return new Promise(async e=>{try{let a=i?document.querySelector(i):null,o=()=>{let e=a||document.body,t=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),n=``,r;for(;r=t.nextNode();){let e=r.parentElement;if(!e)continue;let t=e.getBoundingClientRect();if(t.bottom>-100&&t.top<window.innerHeight+100){let e=r.textContent.trim();e&&(n+=e+`
`)}}return n},s=a||document.scrollingElement||document.documentElement,c=``,l=window.scrollY;for(let e=0;e<n;e++){let e=o();c+=e+`
`;let n=window.scrollY;if(s.scrollBy({top:t,behavior:`auto`}),await new Promise(e=>setTimeout(e,r)),Math.abs(window.scrollY-n)<5&&(await new Promise(e=>setTimeout(e,r)),Math.abs(window.scrollY-n)<5))break}a&&s.scrollTo({top:l,behavior:`auto`});let u=c.split(`
`),d=[];for(let e of u){let t=e.trim();t&&t!==d[d.length-1]&&d.push(t)}e({success:!0,content:d.join(`
`),contentLength:d.join(`
`).length,scrolls:n,startScrollY:l,endScrollY:window.scrollY})}catch(t){e({success:!1,error:t.message})}})}var currentUtterance=null;function clickElement(e,t=500,n=3e3){try{if(!e)return{success:!1,error:`选择器不能为空`};let t=e.trim().replace(/[`'"“”''""``]/g,``),n=document.querySelector(t);return n?(n.click(),{success:!0,message:`已成功点击元素: ${e}`}):{success:!1,error:`未找到匹配选择器的元素: ${e}`}}catch(e){return{success:!1,error:e.message}}}function isContentEditableElement(e){return e.isContentEditable||e.getAttribute(`contenteditable`)===`true`}function fillContentEditable(e,t){try{return e.focus(),document.execCommand(`insertText`,!1,t)||(e.textContent=t),e.dispatchEvent(new Event(`input`,{bubbles:!0})),e.dispatchEvent(new Event(`change`,{bubbles:!0})),!0}catch{try{return e.textContent=t,e.dispatchEvent(new Event(`input`,{bubbles:!0})),!0}catch{return!1}}}function fillForm(e,t=500){try{let t=[];return e.forEach(e=>{let{selector:n,value:r,fieldType:i=`text`}=e,a=document.querySelector(n);if(!a){t.push({selector:n,success:!1,error:`未找到元素`});return}try{if(i===`text`){if(isContentEditableElement(a)){let e=fillContentEditable(a,r);t.push({selector:n,success:e,value:r});return}a.value=r,a.dispatchEvent(new Event(`input`,{bubbles:!0})),a.dispatchEvent(new Event(`change`,{bubbles:!0}))}else if(i===`contenteditable`){let e=fillContentEditable(a,r);t.push({selector:n,success:e,value:r});return}else if(i===`select`){let e=a.querySelector(`option[value="${r}"]`)||Array.from(a.options).find(e=>e.textContent===r);if(e)a.value=e.value,a.dispatchEvent(new Event(`change`,{bubbles:!0}));else{t.push({selector:n,success:!1,error:`未找到匹配的选项`});return}}else if(i===`checkbox`)a.checked=r===`true`||r===!0,a.dispatchEvent(new Event(`change`,{bubbles:!0}));else if(i===`radio`){let e=document.querySelector(`${n}[value="${r}"]`);if(e)e.checked=!0,e.dispatchEvent(new Event(`change`,{bubbles:!0}));else{t.push({selector:n,success:!1,error:`未找到匹配的单选按钮`});return}}t.push({selector:n,success:!0,value:r})}catch(e){t.push({selector:n,success:!1,error:e.message})}}),{success:!0,message:`表单填充完成，成功 ${t.filter(e=>e.success).length}/${e.length} 个字段`,details:t}}catch(e){return{success:!1,error:e.message}}}function scrollToPosition(e){try{let{target:t=`selector`,selector:n,x:r=0,y:i=0,behavior:a=`smooth`,align:o=`center`}=e;if(t===`top`)window.scrollTo({top:0,left:0,behavior:a});else if(t===`bottom`)window.scrollTo({top:document.body.scrollHeight,left:0,behavior:a});else if(t===`coordinates`)window.scrollTo({top:i,left:r,behavior:a});else if(t===`selector`&&n){let e=document.querySelector(n);if(!e)return{success:!1,error:`未找到元素: ${n}`};e.scrollIntoView({behavior:a,block:o})}else return{success:!1,error:`无效的滚动目标或缺少选择器`};return{success:!0,message:`滚动完成`}}catch(e){return{success:!1,error:e.message}}}function isElementTrulyVisible(e){if(!e)return!1;if(e.offsetParent===null&&e.tagName!==`BODY`){let t=window.getComputedStyle(e);if(t.display===`none`||t.visibility===`hidden`||t.position!==`fixed`)return!1}let t=window.getComputedStyle(e);if(t.display===`none`||t.visibility===`hidden`||parseFloat(t.opacity)<=0)return!1;let n=e.getBoundingClientRect();if(n.width<=0||n.height<=0)return!1;let r=window.innerHeight||document.documentElement.clientHeight,i=window.innerWidth||document.documentElement.clientWidth;return n.top<r&&n.bottom>0&&n.left<i&&n.right>0}function waitForElement(e,t=`appeared`,n=1e4){return new Promise((r,i)=>{let a=Date.now(),o=()=>{let i=document.querySelector(e);if(t===`appeared`&&i){r({success:!0,message:`元素 ${e} 已出现`,element:e});return}if(t===`disappeared`&&!i){r({success:!0,message:`元素 ${e} 已消失`});return}if(t===`visible`&&i&&isElementTrulyVisible(i)){r({success:!0,message:`元素 ${e} 已可见`,element:e});return}if(t===`hidden`&&(!i||!isElementTrulyVisible(i))){r({success:!0,message:`元素 ${e} 已隐藏`});return}if(Date.now()-a>n){r({success:!1,error:`等待超时（${n}ms），元素 ${e} 未达到 ${t} 状态`});return}setTimeout(o,100)};o()})}function keyboardInput({key:e,text:t,ctrlKey:n=!1,shiftKey:r=!1,altKey:i=!1}){try{let a=document.activeElement;if(!a)return{success:!1,error:`没有聚焦的元素`};if(t){let e=a.tagName===`INPUT`||a.tagName===`TEXTAREA`,n=a.isContentEditable;if(e||n){if(a.focus(),n)try{document.execCommand(`selectAll`,!1,null),document.execCommand(`insertText`,!1,t)}catch{a.textContent+=t}else{let e=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,`value`)||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,`value`);e&&e.set?e.set.call(a,a.value+t):a.value+=t}try{a.dispatchEvent(new InputEvent(`input`,{bubbles:!0,cancelable:!0,inputType:`insertText`,data:t}))}catch{a.dispatchEvent(new Event(`input`,{bubbles:!0}))}a.dispatchEvent(new Event(`change`,{bubbles:!0}))}}if(e){let t={key:e,code:e.length===1?`Key${e.toUpperCase()}`:e,keyCode:e.toUpperCase().charCodeAt(0),which:e.toUpperCase().charCodeAt(0),bubbles:!0,cancelable:!0,ctrlKey:n,shiftKey:r,altKey:i};document.activeElement.dispatchEvent(new KeyboardEvent(`keydown`,t)),document.activeElement.dispatchEvent(new KeyboardEvent(`keypress`,t)),document.activeElement.dispatchEvent(new KeyboardEvent(`keyup`,t))}return{success:!0,message:`键盘输入成功`}}catch(e){return{success:!1,error:e.message}}}function dragAndDrop(e,t){return new Promise((n,r)=>{try{let r=document.querySelector(e),i=document.querySelector(t);if(!r){n({success:!1,error:`未找到源元素: ${e}`});return}if(!i){n({success:!1,error:`未找到目标元素: ${t}`});return}let a=r.getBoundingClientRect(),o=i.getBoundingClientRect(),s=a.left+a.width/2,c=a.top+a.height/2,l=o.left+o.width/2,u=o.top+o.height/2,d=(e,t,n)=>{let r=new DragEvent(e,{bubbles:!0,cancelable:!0,clientX:t,clientY:n,screenX:t,screenY:n});Object.defineProperty(r,"dataTransfer",{value:{getData:()=>``,setData:()=>{},effectAllowed:`all`,dropEffect:`none`}}),document.elementFromPoint(t,n)?.dispatchEvent(r)};d(`dragstart`,s,c),d(`dragenter`,l,u),d(`dragover`,l,u),d(`drop`,l,u),d(`dragend`,s,c),n({success:!0,experimental:!0,message:`[实验性] 已尝试拖拽 ${e} → ${t}（拖拽模拟在浏览器中为部分支持，可能未生效）`})}catch(e){n({success:!1,error:e.message})}})}function fileUpload(e,t,n,r=`application/octet-stream`){try{let i=document.querySelector(e);if(!i)return{success:!1,error:`未找到文件上传控件: ${e}`};if(i.type!==`file`)return{success:!1,error:`选择的元素不是文件上传控件`};let a;try{let e=atob(n),t=new Uint8Array(e.length);for(let n=0;n<e.length;n++)t[n]=e.charCodeAt(n);a=new Blob([t],{type:r})}catch{a=new Blob([n],{type:r})}let o=new File([a],t,{type:r}),s=new DataTransfer;return s.items.add(o),i.files=s.files,i.dispatchEvent(new Event(`change`,{bubbles:!0})),{success:!0,message:`已上传文件: ${t}`}}catch(e){return{success:!1,error:e.message}}}function selectDropdown(e,t,n=null,r=5e3){return new Promise(async i=>{try{let a=document.querySelector(e);if(!a){i({success:!1,error:`未找到触发器: ${e}`});return}if(a.tagName===`SELECT`){let e=a.options;for(let n=0;n<e.length;n++){let r=e[n],o=(r.textContent||r.label||``).trim();if(o===t||o.includes(t)){a.value=r.value,a.dispatchEvent(new Event(`change`,{bubbles:!0})),a.dispatchEvent(new Event(`input`,{bubbles:!0})),i({success:!0,message:`已选择: ${o}`,triggerTag:`SELECT`});return}}i({success:!1,error:`在 <select> 中未找到匹配的选项: "${t}"`,availableOptions:Array.from(e).map(e=>e.textContent?.trim()).filter(Boolean)});return}a.click(),await new Promise(e=>setTimeout(e,300));let o=Date.now(),s=n?document.querySelector(n):document,c=null;for(;Date.now()-o<r;){let e=s.querySelectorAll(`li, [role="option"], [role="menuitem"], .option, .dropdown-item, .select-item, [data-value], div`);for(let n of e){let e=(n.textContent||``).trim();if(!(e.length<2)&&(e===t||e.includes(t)||e.replace(/\s+/g,``)===t.replace(/\s+/g,``))){c=n;break}}if(c)break;await new Promise(e=>setTimeout(e,100))}if(!c){i({success:!1,error:`在 ${r}ms 内未找到匹配选项: "${t}"`});return}c.click(),i({success:!0,message:`已选择: ${c.textContent?.trim()}`,triggerTag:a.tagName})}catch(e){i({success:!1,error:e.message})}})}function manageStorage({action:e,storage:t,key:n,value:r}){try{let i=t===`session`?sessionStorage:localStorage;switch(e){case`get`:if(!n){let e={};for(let t=0;t<i.length;t++){let n=i.key(t);e[n]=i.getItem(n)}return{success:!0,content:JSON.stringify(e),data:e}}let t=i.getItem(n);return{success:!0,content:JSON.stringify({key:n,value:t}),value:t};case`set`:return!n||r===void 0?{success:!1,error:`set操作需要提供key和value`}:(i.setItem(n,r),{success:!0,message:`已设置 ${n}`});case`remove`:return n?(i.removeItem(n),{success:!0,message:`已删除 ${n}`}):{success:!1,error:`remove操作需要提供key`};case`clear`:return i.clear(),{success:!0,message:`已清空存储`};default:return{success:!1,error:`未知操作: ${e}`}}}catch(e){return{success:!1,error:e.message}}}function pickColor(){return new Promise((e,t)=>{if(!(`EyeDropper`in window)){e({success:!1,error:`您的浏览器不支持 EyeDropper API`});return}new EyeDropper().open().then(t=>{e({success:!0,color:t.sRGBHex,message:`已取色: ${t.sRGBHex}`})}).catch(t=>{t.name===`AbortError`?e({success:!1,error:`用户取消了取色`}):e({success:!1,error:t.message})})})}function textToSpeech(e,t=`zh-CN`,n=1,r=1){try{if(!(`speechSynthesis`in window))return{success:!1,error:`您的浏览器不支持语音合成`};currentUtterance&&speechSynthesis.cancel();let i=new SpeechSynthesisUtterance(e);return i.lang=t,i.rate=n,i.pitch=r,currentUtterance=i,new Promise(e=>{i.onend=()=>{currentUtterance=null,e({success:!0,message:`朗读完成`})},i.onerror=t=>{currentUtterance=null,e({success:!1,error:t.error})},speechSynthesis.speak(i),e({success:!0,message:`开始朗读...`})})}catch(e){return{success:!1,error:e.message}}}function videoControl(e,t=null,n=null){try{let r=t?document.querySelector(t):document.querySelector(`video, audio`);if(!r)return{success:!1,error:`未找到视频/音频元素`};switch(e){case`play`:return r.play(),{success:!0,message:`已播放`};case`pause`:return r.pause(),{success:!0,message:`已暂停`};case`toggle`:return r.paused?(r.play(),{success:!0,message:`已播放`}):(r.pause(),{success:!0,message:`已暂停`});case`stop`:return r.pause(),r.currentTime=0,{success:!0,message:`已停止`};case`seek`:return n===null?{success:!1,error:`seek操作需要提供value参数`}:(r.currentTime=n,{success:!0,message:`已跳转到 ${n} 秒`});case`volume`:return n===null?{success:!1,error:`volume操作需要提供value参数`}:(r.volume=Math.max(0,Math.min(1,n)),{success:!0,message:`音量已设置为 ${Math.round(n*100)}%`});case`mute`:return r.muted=!r.muted,{success:!0,message:r.muted?`已静音`:`已取消静音`};case`speed`:return n===null?{success:!1,error:`speed操作需要提供value参数`}:(r.playbackRate=Math.max(.1,Math.min(10,n)),{success:!0,message:`播放速度已设置为 ${n}x`});case`fullscreen`:return r.requestFullscreen?r.requestFullscreen():r.webkitRequestFullscreen?r.webkitRequestFullscreen():r.mozRequestFullScreen&&r.mozRequestFullScreen(),{success:!0,message:`已进入全屏`};default:return{success:!1,error:`未知操作: ${e}`}}}catch(e){return{success:!1,error:e.message}}}function generateQRCodeSVG(e,t){try{let n=document.createElement(`canvas`);n.width=t,n.height=t;let r=n.getContext(`2d`);r.fillStyle=`#FFFFFF`,r.fillRect(0,0,t,t);let i=[];for(let t=0;t<e.length;t++)i.push(e.charCodeAt(t));let a=Math.max(2,Math.floor(t/41)),o=Math.floor(t/a),s=Math.floor((t-o*a)/2);r.fillStyle=`#000000`;let c=(e,t)=>{let n=7*a;r.fillRect(e,t,n,n),r.fillStyle=`#FFFFFF`,r.fillRect(e+a,t+a,n-2*a,n-2*a),r.fillStyle=`#000000`,r.fillRect(e+2*a,t+2*a,n-4*a,n-4*a),r.fillStyle=`#000000`};c(s,s),c(s+(o-7)*a,s),c(s,s+(o-7)*a);let l=0;for(let t=0;t<e.length;t++)l=(l<<5)-l+e.charCodeAt(t),l|=0;let u=e=>{let t=e+1831565813;return t=Math.imul(t^t>>>15,t|1),t^=t+Math.imul(t^t>>>7,t|61),((t^t>>>14)>>>0)/4294967296};for(let e=0;e<o;e++)for(let t=0;t<o;t++){let n=e<8&&t<8,i=e<8&&t>=o-8,c=e>=o-8&&t<8;n||i||c||u(l+e*o+t)>.5&&r.fillRect(s+t*a,s+e*a,a,a)}return n.toDataURL(`image/png`)}catch{return null}}function generateQRCode(e=``,t=200,n=`M`,r=!0){return new Promise(i=>{try{let a=e||window.location.href,o=document.createElement(`div`);o.id=`ai-helper-qrcode`,o.style.cssText=`
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
      `,l.onclick=()=>{document.body.removeChild(o)},o.appendChild(l),typeof QRCode>`u`){let e=generateQRCodeSVG(a,t);if(e){let n=document.createElement(`img`);n.src=e,n.width=t,n.height=t,s.replaceWith(n),r&&document.body.appendChild(o),i({success:!0,content:a,size:t,dataUrl:e,shown:r,fallback:!0,warning:`QRCode 库未加载，已使用 SVG 降级方案生成`})}else i({success:!1,error:`二维码库未加载且降级方案不可用`});return}QRCode.toCanvas(s,a,{width:t,margin:2,color:{dark:`#000000`,light:`#ffffff`},errorCorrectionLevel:n.toLowerCase()},e=>{e?i({success:!1,error:e.message}):(r&&document.body.appendChild(o),i({success:!0,content:a,size:t,dataUrl:s.toDataURL(`image/png`),shown:r}))})}catch(e){i({success:!1,error:e.message})}})}function performanceAudit(e=!1,t=!0,n=!1){try{let r=(e,t)=>{try{let n=performance.getEntriesByType(e);return t?n.slice(0,t):n}catch{return[]}},i={url:window.location.href,title:document.title,navigation:null,paintTiming:null,resourceTiming:[],memory:null,metrics:{}},a=r(`navigation`)[0];if(a)i.navigation={domContentLoaded:a.domContentLoadedEventEnd-a.fetchStart,load:a.loadEventEnd-a.fetchStart,firstByte:a.responseStart-a.requestStart,dns:a.domainLookupEnd-a.domainLookupStart,tcp:a.connectEnd-a.connectStart,request:a.responseStart-a.requestStart,response:a.responseEnd-a.responseStart,domInteractive:a.domInteractive-a.fetchStart};else try{let e=performance.timing;e&&e.navigationStart>0&&(i.navigation={domContentLoaded:e.domContentLoadedEventEnd-e.navigationStart,load:e.loadEventEnd-e.navigationStart,firstByte:e.responseStart-e.requestStart,dns:e.domainLookupEnd-e.domainLookupStart,tcp:e.connectEnd-e.connectStart,request:e.responseStart-e.requestStart,response:e.responseEnd-e.responseStart,domInteractive:e.domInteractive-e.navigationStart})}catch{}if(t){try{let e=r(`paint`),t={};e.forEach(e=>{t[e.name]=e.startTime}),i.paintTiming=t}catch{}try{let e=r(`largest-contentful-paint`);e.length>0&&(i.metrics.LCP=e[e.length-1].startTime)}catch{}try{let e=r(`layout-shift`);e.length>0&&(i.metrics.CLS=e.reduce((e,t)=>e+(t.value||0),0))}catch{}}if(e&&(i.resourceTiming=r(`resource`,20).map(e=>({name:e.name.substring(0,100),type:e.initiatorType,duration:Math.round(e.duration),size:e.transferSize}))),n)try{let e=performance.memory;e&&(i.memory={used:Math.round(e.usedJSHeapSize/1024/1024),total:Math.round(e.totalJSHeapSize/1024/1024),limit:Math.round(e.jsHeapSizeLimit/1024/1024)})}catch{}return{success:!0,...i}}catch(e){return{success:!1,error:e.message}}}function screenshotElement(e,t=.9,n=`png`){return new Promise(t=>{try{let r=document.querySelector(e);if(!r){t({success:!1,error:`未找到目标元素`});return}let i=r.getBoundingClientRect();chrome.runtime.sendMessage({type:`CAPTURE_ELEMENT_SCREENSHOT`,rect:i},e=>{e&&e.success?t({success:!0,dataUrl:e.dataUrl,width:i.width,height:i.height,format:n}):t({success:!1,error:e?.error||`截图失败`})})}catch(e){t({success:!1,error:e.message})}})}function shadowDomQuery(e,t=!0,n=5,r=50){try{let i=[],a=(o,s=0)=>{if(!(s>n||i.length>=r))try{o.querySelector&&o.querySelectorAll(e).forEach(e=>{i.length>=r||i.push({tag:e.tagName.toLowerCase(),id:e.id,className:e.className,textContent:e.textContent?.substring(0,200),selector:getElementSelector(e),depth:s})}),t&&o.querySelectorAll(`*`).forEach(e=>{e.shadowRoot&&a(e.shadowRoot,s+1)})}catch{}};return a(document),{success:!0,selector:e,total:i.length,elements:i.slice(0,r)}}catch(e){return{success:!1,error:e.message}}}function pageToPdf(e=`page.pdf`,t=!1,n=1,r=!0,i=null){return new Promise(a=>{try{let o={landscape:t,scale:n,printBackground:r,displayHeaderFooter:!1,marginTop:i?.top===void 0?1:i.top,marginBottom:i?.bottom===void 0?1:i.bottom,marginLeft:i?.left===void 0?1:i.left,marginRight:i?.right===void 0?1:i.right,paperWidth:8.27,paperHeight:11.69};chrome.runtime.sendMessage({type:`GENERATE_PDF`,options:o},t=>{if(!t){a({success:!1,error:`PDF 生成失败：Background 无响应`});return}if(!t.success){a({success:!1,error:t.error||`PDF 生成失败`});return}let n=document.createElement(`a`);n.href=`data:application/pdf;base64,${t.data}`,n.download=e,document.body.appendChild(n),n.click(),document.body.removeChild(n),a({success:!0,message:`PDF 已生成并开始下载`,fileName:e,size:t.data?Math.round(t.data.length*3/4):0})})}catch(e){a({success:!1,error:e.message})}})}function runJavascript(code,timeout=5e3){return new Promise(resolve=>{try{let result;try{result=eval(code)}catch(e){resolve({success:!1,error:e.message});return}if(result&&typeof result.then==`function`){let e=setTimeout(()=>{resolve({success:!1,error:`执行超时 (${timeout}ms)`})},timeout);result.then(t=>{clearTimeout(e),resolve({success:!0,result:t,type:typeof t})}).catch(t=>{clearTimeout(e),resolve({success:!1,error:t.message})});return}resolve({success:!0,result,type:typeof result})}catch(e){resolve({success:!1,error:e.message})}})}function injectCss(e,t=null,n=`style`){try{if(!e||typeof e!=`string`)return{success:!1,error:`css 参数必须是非空字符串`};if(n!==`style`&&n!==`inline`)return{success:!1,error:`不支持的 injectMode: ${n}，支持 'style' 或 'inline'`};if(n===`style`)if(t){let n=document.querySelectorAll(t),r=`ai-helper-scoped-style-${Date.now()}`,i=``,a=e.split(`}`);for(let e of a){let t=e.trim();if(!t)continue;let n=t.indexOf(`{`);if(n===-1)continue;let a=t.substring(0,n).trim(),o=t.substring(n+1).trim();i+=`#${r} ${a} { ${o} } `}n.forEach(e=>{e.setAttribute(`id`,r)});let o=document.createElement(`style`);return o.setAttribute(`data-ai-helper`,`scoped`),o.textContent=i,document.head.appendChild(o),{success:!0,injectMode:`style`,scoped:!0,selector:t,hitCount:n.length}}else{let t=document.createElement(`style`);return t.setAttribute(`data-ai-helper`,`global`),t.textContent=e,document.head.appendChild(t),{success:!0,injectMode:`style`,scoped:!1,hitCount:0}}if(n===`inline`){let n=t?document.querySelectorAll(t):document.querySelectorAll(`*`),r=0,i={};return e.split(`;`).forEach(e=>{let t=e.indexOf(`:`);if(t===-1)return;let n=e.substring(0,t).trim(),r=e.substring(t+1).trim();n&&r&&(i[n]=r)}),n.forEach(e=>{if(e.nodeType===1){for(let[t,n]of Object.entries(i))try{e.style.setProperty(t,n)}catch{}r++}}),{success:!0,injectMode:`inline`,selector:t||`*`,hitCount:r}}}catch(e){return{success:!1,error:e.message}}}var ICONS={search:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,explain:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>`,translate:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,summary:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,copy:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,close:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,sparkle:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,lock:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,unlock:`<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,copyLarge:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,grip:`<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>`,send:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,more:`<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,gear:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,refresh:`<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,block:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,eyeOff:`<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`},toolbarEl=null,resultPanelEl=null,isToolbarVisible=!1,isAskMode=!1,askSavedSelectedText=``,askSavedRange=null,askSavedLeft=``,isResultVisible=!1,isResultLocked=!1,resultRawContent=``,savedActionText=``,lastActionType=``,lastActionCustomPrompt=``,currentSelectedText=``,enableSelectionToolbar=!0,blockedDomains=[],toolbarTemporarilyHidden=!1,suppressNextClick=!1,lastPanelPos={x:0,y:0},pendingSelection=null,toolbarTools=null,toolbarMaxVisible=4,toolbarIconOnly=!1,overflowDropdownEl=null,streamContent=``,dragState=null;function makeDraggable(e,t){let n=t?e.querySelector(t):e;n&&(n.style.cursor=`grab`,n.addEventListener(`mousedown`,t=>{if(t.target.closest(`[role="button"]`)||t.button!==0)return;t.preventDefault(),t.stopPropagation();let r=e.getBoundingClientRect();dragState={el:e,startX:t.clientX,startY:t.clientY,startLeft:r.left,startTop:r.top,pointerId:t.pointerId||0},n.style.cursor=`grabbing`,e.style.transition=`none`}))}document.addEventListener(`mousemove`,e=>{if(!dragState)return;let t=e.clientX-dragState.startX,n=e.clientY-dragState.startY,r=dragState.startLeft+t,i=dragState.startTop+n,a=window.innerWidth,o=window.innerHeight,s=dragState.el.getBoundingClientRect();r=Math.max(0,Math.min(r,a-s.width)),i=Math.max(0,Math.min(i,o-s.height)),dragState.el.style.left=r+`px`,dragState.el.style.top=i+`px`}),document.addEventListener(`mouseup`,()=>{if(!dragState)return;dragState.el.style.transition=``;let e=dragState.el.querySelector(`.aih-result-header`)||dragState.el;e.style.cursor=`grab`,dragState=null});function isExtensionValid(){try{return!!(chrome&&chrome.runtime&&chrome.runtime.id)}catch{return!1}}function injectStyles(){if(document.getElementById(`aih-selection-toolbar-styles`))return;let e=document.createElement(`style`);e.id=`aih-selection-toolbar-styles`,e.textContent=`
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
  `,document.head.appendChild(e)}var DEFAULT_TOOLS=[{id:`ai-search`,name:`AI搜索`,systemPrompt:`使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。`,builtin:!0,order:0},{id:`explain`,name:`解释`,systemPrompt:`对选中的内容进行解释说明，帮助理解其含义。`,builtin:!0,order:1},{id:`translate`,name:`翻译`,systemPrompt:`将选中的内容翻译成中文。`,builtin:!0,order:2},{id:`summary`,name:`总结`,systemPrompt:`对选中的内容进行归纳总结，提炼关键要点。`,builtin:!0,order:3},{id:`copy`,name:`复制`,systemPrompt:`将选中内容复制到剪贴板。`,builtin:!0,order:99}];function loadToolbarTools(){return new Promise(e=>{if(toolbarTools){e(toolbarTools);return}chrome.storage.local.get([`toolbarTools`,`toolbarMaxVisible`,`toolbarIconOnly`],t=>{let n=t.toolbarTools&&t.toolbarTools.length>0?t.toolbarTools:DEFAULT_TOOLS,r=new Map(DEFAULT_TOOLS.map(e=>[e.id,e]));toolbarTools=n.map(e=>e.builtin&&r.has(e.id)?{...e,systemPrompt:r.get(e.id).systemPrompt}:e),toolbarMaxVisible=t.toolbarMaxVisible||4,toolbarIconOnly=t.toolbarIconOnly||!1,e(toolbarTools)})})}function refreshToolbarCache(){toolbarTools=null,toolbarIconOnly=!1,loadToolbarTools()}function getToolIcon(e){return{"ai-search":ICONS.search,explain:ICONS.explain,translate:ICONS.translate,summary:ICONS.summary,copy:ICONS.copy}[e]||ICONS.sparkle}function createOverflowDropdown(){overflowDropdownEl||(overflowDropdownEl=document.createElement(`div`),overflowDropdownEl.id=`aih-overflow-dropdown`,overflowDropdownEl.className=`aih-overflow-dropdown`,overflowDropdownEl.style.display=`none`,document.body.appendChild(overflowDropdownEl),document.addEventListener(`click`,e=>{overflowDropdownEl&&overflowDropdownEl.style.display===`block`&&!overflowDropdownEl.contains(e.target)&&!e.target.closest(`.aih-tb-btn-overflow`)&&(overflowDropdownEl.style.display=`none`)}))}function renderOverflowDropdown(e){overflowDropdownEl||createOverflowDropdown();let t=e.map(e=>{let t=getToolIcon(e.id);return`<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${e.id}">
      <span class="aih-tb-icon">${t}</span>${e.name}
    </div>`}).join(``);t+=`<div class="aih-dropdown-divider"></div>`,t+=`<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="打开配置页面">
    <span class="aih-tb-icon">${ICONS.gear}</span>设置
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="暂时隐藏直到页面刷新">
    <span class="aih-tb-icon">${ICONS.eyeOff}</span>本次临时禁用
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="在此网站禁用工具栏">
    <span class="aih-tb-icon">${ICONS.block}</span>在此网站禁用
  </div>`,overflowDropdownEl.innerHTML=t,overflowDropdownEl._clickHandler=e=>{if(e.target.closest(`.aih-dropdown-settings`)){e.stopPropagation(),overflowDropdownEl.style.display=`none`,chrome.runtime.sendMessage({type:`OPEN_OPTIONS_PAGE`,hash:`toolbar`}).catch(()=>{});return}if(e.target.closest(`.aih-dropdown-block`)){e.stopPropagation(),e.preventDefault(),overflowDropdownEl.style.display=`none`,blockCurrentDomain();return}if(e.target.closest(`.aih-dropdown-hide`)){e.stopPropagation(),e.preventDefault(),overflowDropdownEl.style.display=`none`,toolbarTemporarilyHidden=!0,hideToolbar(),hideResultPanel(),currentSelectedText=``;return}let t=e.target.closest(`[data-action]`);t&&(e.stopPropagation(),overflowDropdownEl.style.display=`none`,handleAction(t.dataset.action,currentSelectedText))},overflowDropdownEl.addEventListener(`click`,overflowDropdownEl._clickHandler),overflowDropdownEl.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&(e.preventDefault(),t.click())}})}async function createToolbar(){if(toolbarEl)return;await loadToolbarTools();let e=[...toolbarTools].sort((e,t)=>e.order-t.order),t=e.find(e=>e.id===`ai-search`),n=e.filter(e=>e.id!==`ai-search`&&e.id!==`copy`),r=n.slice(0,toolbarMaxVisible-1),i=n.slice(toolbarMaxVisible-1);toolbarEl=document.createElement(`div`),toolbarEl.id=`aih-selection-toolbar`;let a=`<span class="aih-tb-buttons">`;a+=`<span class="aih-tb-grip" title="拖拽移动">${ICONS.grip}</span>`;let o=toolbarIconOnly;t&&(a+=`<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="AI 搜索">
      <span class="aih-tb-icon">${ICONS.search}</span>${o?``:`AI搜索`}
    </div>`),r.forEach(e=>{let t=getToolIcon(e.id);a+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="${e.id}" title="${e.name}">
      <span class="aih-tb-icon">${t}</span>${o?``:e.name}
    </div>`}),a+=`<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="更多工具">
    <span class="aih-tb-icon">${ICONS.more}</span>
  </div>`,renderOverflowDropdown(i),a+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="复制选中内容">
    <span class="aih-tb-icon">${ICONS.copy}</span>${o?``:`复制`}
  </div>`,a+=`</span>`,a+=`<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="问问..." />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="发送">
      <span class="aih-tb-icon">${ICONS.send}</span>
    </div>
  </span>`,toolbarEl.innerHTML=a,toolbarEl.addEventListener(`click`,e=>{if(e.target.closest(`.aih-tb-btn-overflow`)){e.stopPropagation();let t=e.target.closest(`.aih-tb-btn-overflow`).getBoundingClientRect();overflowDropdownEl&&(overflowDropdownEl.style.display=overflowDropdownEl.style.display===`block`?`none`:`block`,overflowDropdownEl.style.top=t.bottom+4+`px`,overflowDropdownEl.style.left=t.right-160+`px`);return}let t=e.target.closest(`[data-action]`);if(!t)return;e.stopPropagation();let n=t.dataset.action;handleAction(n,currentSelectedText)}),toolbarEl.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&!t.classList.contains(`aih-tb-ask-send`)&&(e.preventDefault(),t.click())}}),document.body.appendChild(toolbarEl);let s=toolbarEl.querySelector(`.aih-tb-ask-input`),c=toolbarEl.querySelector(`.aih-tb-ask-send`);toolbarEl.querySelector(`.aih-tb-buttons`);let l=()=>{let e=s.value.trim();if(e){let t=askSavedSelectedText;d(),s.value=``,sendToSidePanelInputWithContext(e,t),hideToolbar()}},u=()=>{if(isAskMode)return;isAskMode=!0,askSavedSelectedText=currentSelectedText||``;let e=window.getSelection();e.rangeCount>0&&(askSavedRange=e.getRangeAt(0).cloneRange());let t=toolbarEl.getBoundingClientRect().right;askSavedLeft=toolbarEl.style.left,toolbarEl.classList.add(`aih-ask-mode`),toolbarEl.style.width=`360px`;let n=Math.max(8,t-360);toolbarEl.style.left=n+`px`,requestAnimationFrame(()=>{if(askSavedRange){let e=window.getSelection();e.removeAllRanges(),e.addRange(askSavedRange)}requestAnimationFrame(()=>{s.focus()})})},d=()=>{isAskMode&&(isAskMode=!1,askSavedSelectedText=``,askSavedRange=null,toolbarEl.classList.remove(`aih-ask-mode`),toolbarEl.style.width=``,askSavedLeft&&=(toolbarEl.style.left=askSavedLeft,``))};s.addEventListener(`focus`,()=>{isAskMode||u()}),s.addEventListener(`mousedown`,e=>{isAskMode||(e.preventDefault(),u())}),s.addEventListener(`blur`,()=>{setTimeout(()=>{isAskMode&&!toolbarEl.contains(document.activeElement)&&(d(),hideToolbar())},150)}),s.addEventListener(`keydown`,e=>{e.key===`Escape`?(e.preventDefault(),e.stopPropagation(),d(),s.blur()):e.key===`Enter`&&(e.preventDefault(),e.stopPropagation(),l())}),c.addEventListener(`mousedown`,e=>{e.preventDefault(),e.stopPropagation(),l()}),makeDraggable(toolbarEl,`.aih-tb-grip`)}function createResultPanel(){if(resultPanelEl)return;resultPanelEl=document.createElement(`div`),resultPanelEl.id=`aih-selection-result`,resultPanelEl.innerHTML=`
    <div class="aih-result-header">
      <span>${ICONS.sparkle} AI 回答</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="锁定窗口">${ICONS.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="关闭">${ICONS.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="复制全部内容">
          <span class="aih-tb-icon">${ICONS.copyLarge}</span>复制
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="重新生成答案">
          <span class="aih-tb-icon">${ICONS.refresh}</span>重新生成
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
        <div class="aih-followup-send" role="button" tabindex="0" title="发送到侧边栏">${ICONS.send}</div>
      </span>
    </div>
  `,resultPanelEl.querySelector(`.aih-result-close`).addEventListener(`click`,e=>{e.stopPropagation(),hideResultPanel()}),resultPanelEl.querySelector(`.aih-result-lock`).addEventListener(`click`,e=>{e.stopPropagation(),toggleResultLock()}),resultPanelEl.querySelector(`.aih-result-footer`).addEventListener(`click`,e=>{e.stopPropagation();let t=e.target.closest(`[data-action]`)?.dataset?.action;if(t===`regenerate-result`){if(!lastActionType||!savedActionText)return;sendToAI(lastActionType,savedActionText,lastActionCustomPrompt)}else t===`copy-result`&&copyResultContent()});let e=resultPanelEl.querySelector(`.aih-followup-input`);resultPanelEl.querySelector(`.aih-followup-send`).addEventListener(`click`,t=>{t.stopPropagation();let n=e.value.trim();n&&(sendToSidePanelInput(n),e.value=``)}),e.addEventListener(`keydown`,t=>{if(t.key===`Enter`){t.preventDefault();let n=e.value.trim();n&&(sendToSidePanelInput(n),e.value=``)}}),resultPanelEl.querySelector(`.aih-suggestions-list`).addEventListener(`click`,e=>{let t=e.target.closest(`.aih-suggestion-chip`);if(!t)return;e.stopPropagation();let n=t.dataset.question;n&&sendToSidePanelInput(n)}),resultPanelEl.addEventListener(`keydown`,e=>{if(e.key===`Enter`||e.key===` `){let t=e.target.closest(`[role="button"]`);t&&(e.preventDefault(),t.click())}}),document.body.appendChild(resultPanelEl),makeDraggable(resultPanelEl,`.aih-result-header`)}function showResultPanel(e,t,n,r=[]){if(!resultPanelEl)return;document.body.appendChild(resultPanelEl);let i=window.innerWidth,a=window.innerHeight;resultPanelEl.style.display=`flex`,resultPanelEl.style.left=`-9999px`,resultPanelEl.style.top=`-9999px`;let o=resultPanelEl.querySelector(`.aih-result-body`);o.innerHTML=n;let s=resultPanelEl.querySelector(`.aih-result-suggestions`),c=resultPanelEl.querySelector(`.aih-suggestions-list`);r.length>0&&s&&c?(c.innerHTML=r.map(e=>`<div class="aih-suggestion-chip" role="button" tabindex="0" data-question="${escapeHtml(e)}">${escapeHtml(e)}</div>`).join(``),s.style.display=`block`):s&&(s.style.display=`none`),requestAnimationFrame(()=>{let n=resultPanelEl.getBoundingClientRect(),r=n.width||420,o=Math.min(n.height||200,520),s=e-r/2;s<8&&(s=8),s+r>i-8&&(s=i-r-8);let c=t-o-8;c<8&&(c=t+8),resultPanelEl.style.left=s+`px`,resultPanelEl.style.top=c+`px`,resultPanelEl.style.maxHeight=Math.min(520,a-c-16)+`px`,isResultVisible=!0,document.body.appendChild(resultPanelEl)})}function showResultLoading(e,t){if(!resultPanelEl)return;lastPanelPos={x:e,y:t},isResultLocked=!1,updateLockButton();let n=resultPanelEl.querySelector(`.aih-result-suggestions`);n&&(n.style.display=`none`);let r=resultPanelEl.querySelector(`.aih-followup-input`);r&&(r.value=``),document.body.appendChild(resultPanelEl),resultPanelEl.style.display=`flex`;let i=resultPanelEl.querySelector(`.aih-result-body`);i.innerHTML=`<div class="aih-result-loading"><div class="aih-spinner"></div>AI 正在思考...</div>`,positionPanel(resultPanelEl,e,t),isResultVisible=!0,hideToolbar()}function showResultError(e,t,n){if(!resultPanelEl)return;isResultLocked=!1,resultRawContent=``,updateLockButton(),document.body.appendChild(resultPanelEl),resultPanelEl.style.display=`flex`;let r=resultPanelEl.querySelector(`.aih-result-body`);r.innerHTML=`<div class="aih-result-error">请求失败: ${escapeHtml(n)}</div>`,positionPanel(resultPanelEl,e,t),isResultVisible=!0}function positionPanel(e,t,n){let r=window.innerWidth,i=window.innerHeight;e.style.left=`-9999px`,e.style.top=`-9999px`,requestAnimationFrame(()=>{let a=e.getBoundingClientRect(),o=a.width||420,s=Math.min(a.height||200,520),c=t-o/2;c<8&&(c=8),c+o>r-8&&(c=r-o-8);let l=n-s-8;l<8&&(l=n+8),e.style.left=c+`px`,e.style.top=l+`px`,e.style.maxHeight=Math.min(520,i-l-16)+`px`,document.body.appendChild(e)})}function hideResultPanel(){resultPanelEl&&(resultPanelEl.style.display=`none`,isResultVisible=!1,isResultLocked=!1,resultRawContent=``,updateLockButton())}function toggleResultLock(){isResultLocked=!isResultLocked,updateLockButton()}function updateLockButton(){if(!resultPanelEl)return;let e=resultPanelEl.querySelector(`.aih-result-lock`);e&&(isResultLocked?(e.innerHTML=ICONS.lock,e.classList.add(`locked`),e.title=`解除锁定`):(e.innerHTML=ICONS.unlock,e.classList.remove(`locked`),e.title=`锁定窗口`))}function sendToSidePanelInput(e){if(!e||!isExtensionValid())return;let t=currentSelectedText||savedActionText||``;chrome.runtime.sendMessage({type:`DIRECT_SEND`,text:e,selectedText:t}).catch(e=>{console.error(`[SelectionToolbar] 发送追问到侧边栏失败:`,e)})}function sendToSidePanelInputWithContext(e,t){!e||!isExtensionValid()||chrome.runtime.sendMessage({type:`DIRECT_SEND`,text:e,selectedText:t||``}).catch(e=>{console.error(`[SelectionToolbar] 发送到侧边栏失败:`,e)})}function escapeHtml(e){let t=document.createElement(`div`);return t.textContent=e,t.innerHTML}function showToolbar(e,t){if(!toolbarEl||!currentSelectedText||isResultVisible)return;document.body.appendChild(toolbarEl);let n=window.innerWidth,r=window.innerHeight;toolbarEl.style.display=`flex`,requestAnimationFrame(()=>{let i=toolbarEl.getBoundingClientRect(),a=i.width||300,o=i.height||40,s=e-a/2;s<8&&(s=8),s+a>n-8&&(s=n-a-8);let c=t-o-10;c<8&&(c=t+10),c<8&&(c=8),c+o>r-8&&(c=r-o-8),toolbarEl.style.left=s+`px`,toolbarEl.style.top=c+`px`,isToolbarVisible||=(toolbarEl.classList.add(`show`),!0)})}function hideToolbar(){!toolbarEl||!isToolbarVisible||(isAskMode&&(isAskMode=!1,askSavedSelectedText=``,askSavedRange=null,toolbarEl.classList.remove(`aih-ask-mode`),toolbarEl.style.width=``,askSavedLeft&&=(toolbarEl.style.left=askSavedLeft,``)),toolbarEl.classList.remove(`show`),toolbarEl.style.display=`none`,isToolbarVisible=!1)}function getToolbarPosition(){if(!toolbarEl)return{x:0,y:0};let e=toolbarEl.getBoundingClientRect();return{x:e.left+e.width/2,y:e.top}}function getPanelCenter(e){let t=e.getBoundingClientRect();return{x:t.left+t.width/2,y:t.top}}function onSelectionChange(){if(!enableSelectionToolbar||blockedDomains.length>0&&blockedDomains.includes(window.location.hostname)||toolbarTemporarilyHidden)return;let e=window.getSelection(),t=e?e.toString().trim():``;if(!t||t.length<2){isAskMode||hideToolbar(),currentSelectedText=``,pendingSelection=null;return}let n=5e3,r=t.length>n?t.substring(0,n)+`...`:t;if(e.rangeCount>0){let t=e.getRangeAt(0).commonAncestorContainer,n=t.nodeType===Node.TEXT_NODE?t.parentElement.closest(`[contenteditable], input, textarea`):t.closest&&t.closest(`[contenteditable], input, textarea`);if(n instanceof HTMLElement&&(n.tagName===`INPUT`||n.tagName===`TEXTAREA`)){hideToolbar(),currentSelectedText=``,pendingSelection=null;return}}if(!(t===currentSelectedText&&isToolbarVisible)&&(currentSelectedText=r,e.rangeCount>0)){let t=e.getRangeAt(0).getBoundingClientRect();if(t.width===0&&t.height===0)return;pendingSelection={x:t.left+t.width/2,y:t.top}}}function onDocumentClick(e){if(isResultVisible&&resultPanelEl){!resultPanelEl.contains(e.target)&&!isResultLocked&&hideResultPanel();return}if(isToolbarVisible&&toolbarEl&&!isAskMode){if(suppressNextClick){suppressNextClick=!1;return}toolbarEl.contains(e.target)||hideToolbar()}}function onMouseUp(){suppressNextClick=!0,pendingSelection&&currentSelectedText&&(showToolbar(pendingSelection.x,pendingSelection.y),pendingSelection=null)}function onScrollOrResize(){if(isAskMode||!isToolbarVisible)return;let e=window.getSelection();if(e&&e.rangeCount>0&&currentSelectedText){let t=e.getRangeAt(0).getBoundingClientRect();if(t.width>0||t.height>0){showToolbar(t.left+t.width/2,t.top);return}}hideToolbar()}function onResize(){isAskMode||isToolbarVisible&&hideToolbar()}function handleAction(e,t){if(!t)return;if(savedActionText=t,e===`copy`){copySelectedText(t),hideToolbar();return}if(lastActionType=e,lastActionCustomPrompt=``,[`ai-search`,`explain`,`translate`,`summary`].includes(e)){sendToAI(e,t);return}let n=toolbarTools.find(t=>t.id===e);n&&(lastActionCustomPrompt=n.systemPrompt||``,sendToAI(e,t,n.systemPrompt))}function copySelectedText(e){copyToClipboard(e).then(()=>{showCopyToast()}).catch(e=>{console.error(`[SelectionToolbar] 复制失败:`,e),showCopyErrorToast()})}function copyResultContent(){let e=resultRawContent;e&&copyToClipboard(e).then(()=>{showCopyToast()}).catch(e=>{console.error(`[SelectionToolbar] 复制结果失败:`,e),showCopyErrorToast()})}async function copyToClipboard(e){if(!navigator.clipboard)return fallbackCopy(e);try{await navigator.clipboard.writeText(e)}catch(t){if(t.name===`NotAllowedError`||t.name===`SecurityError`)return fallbackCopy(e);throw t}}function fallbackCopy(e){return new Promise((t,n)=>{let r=document.createElement(`textarea`);r.value=e,r.style.position=`fixed`,r.style.left=`-9999px`,r.style.opacity=`0`,document.body.appendChild(r);try{r.select(),r.setSelectionRange(0,e.length),document.execCommand(`copy`)?t():n(Error(`execCommand copy failed`))}catch(e){n(e)}finally{r.remove()}})}function showCopyErrorToast(){let e=document.getElementById(`aih-copy-toast`);e&&e.remove();let t=document.createElement(`div`);t.id=`aih-copy-toast`,t.textContent=`复制失败，请手动复制`,t.style.cssText=`
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
  `,document.body.appendChild(t),t.style.zIndex=`2147483647`,setTimeout(()=>t.remove(),1800)}function showCopyToast(){let e=document.getElementById(`aih-copy-toast`);e&&e.remove();let t=document.createElement(`div`);if(t.id=`aih-copy-toast`,t.textContent=`已复制`,t.style.cssText=`
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
    `,document.head.appendChild(e)}document.body.appendChild(t),t.style.zIndex=`2147483647`,setTimeout(()=>t.remove(),1300)}function sendToAI(e,t,n){if(!isExtensionValid()){console.warn(`[SelectionToolbar] 扩展上下文已失效，请刷新页面`);return}let r={"ai-search":`搜索并分析以下内容：\n\n${t}`,explain:`用1-3句话简洁解释以下内容，不需要展开说明。\n\n${t}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`,translate:`翻译以下内容，只输出翻译结果：\n\n${t}`,summary:`用3-5个要点总结以下内容，每条要点一句话。\n\n${t}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`},i=n?`请处理以下内容：\n\n${t}`:r[e]||t;if(e===`ai-search`){hideToolbar(),window.getSelection().removeAllRanges(),chrome.runtime.sendMessage({type:`SELECTION_TOOLBAR_ACTION`,action:e,text:t,prompt:i}).catch(e=>{console.error(`[SelectionToolbar] 发送消息失败:`,e)});return}createResultPanel();let a={"ai-search":`AI搜索`,explain:`解释`,translate:`翻译`,summary:`总结`}[e];if(!a&&toolbarTools){let t=toolbarTools.find(t=>t.id===e);a=t?t.name:`AI 回答`}let o=resultPanelEl.querySelector(`.aih-result-header span`);o&&(o.innerHTML=`${ICONS.sparkle} ${a||`AI 回答`}`);let s=isResultVisible&&resultPanelEl?getPanelCenter(resultPanelEl):getToolbarPosition();showResultLoading(s.x,s.y),chrome.runtime.sendMessage({type:`SELECTION_TOOLBAR_ACTION`,action:e,text:t,prompt:i,systemPrompt:n||``}).catch(e=>{console.error(`[SelectionToolbar] 发送消息失败:`,e),showResultError(s.x,s.y,e.message)})}chrome.runtime.onMessage.addListener((e,t,n)=>{if(isExtensionValid()){if(e.type===`SELECTION_TOOLBAR_STREAM_START`){streamContent=``;return}if(e.type===`SELECTION_TOOLBAR_STREAM_CHUNK`){if(streamContent+=e.delta||``,resultPanelEl&&isResultVisible){let e=resultPanelEl.querySelector(`.aih-result-body`);e&&(e.querySelector(`.aih-result-content-stream`)||(e.innerHTML=`<div class="aih-result-content-stream"></div>`),e.innerHTML=`<div class="aih-result-content-stream">`+escapeHtml(streamContent).replace(/\n/g,`<br>`)+`</div>`)}return}if(e.type===`SELECTION_TOOLBAR_STREAM_DONE`){e.finalContent&&(streamContent=e.finalContent);let t=streamContent||`无响应`;resultRawContent=streamContent;let n=t,r=[],i=t.indexOf(`---SUGGESTIONS---`);i!==-1&&(n=t.substring(0,i).trim(),resultRawContent=n,r=t.substring(i+17).split(`
`).map(e=>e.replace(/^[\d]+[\.\、\s]+/,``).trim()).filter(e=>e.length>0).slice(0,3));let a=typeof marked<`u`?marked.parse(n):escapeHtml(n).replace(/\n/g,`<br>`);showResultPanel(lastPanelPos.x,lastPanelPos.y,a,r),streamContent=``;return}if(e.type===`SELECTION_TOOLBAR_RESULT`)if(e.error)resultRawContent=``,showResultError(lastPanelPos.x,lastPanelPos.y,e.error);else{let t=e.content||`无响应`,n=t;resultRawContent=t;let r=[],i=t.indexOf(`---SUGGESTIONS---`);i!==-1&&(n=t.substring(0,i).trim(),resultRawContent=n,r=t.substring(i+17).split(`
`).map(e=>e.replace(/^[\d]+[\.\、\s]+/,``).trim()).filter(e=>e.length>0).slice(0,3));let a=typeof marked<`u`?marked.parse(n):escapeHtml(n).replace(/\n/g,`<br>`);showResultPanel(lastPanelPos.x,lastPanelPos.y,a,r)}}});function blockCurrentDomain(){let e=window.location.hostname;chrome.storage.local.get([`blockedDomains`],t=>{let n=t.blockedDomains||[];n.includes(e)||(n.push(e),chrome.storage.local.set({blockedDomains:n},()=>{blockedDomains=n,hideToolbar(),hideResultPanel(),currentSelectedText=``}))})}function loadToggleState(){isExtensionValid()&&chrome.storage.local.get([`enableSelectionToolbar`,`blockedDomains`],e=>{enableSelectionToolbar=e.enableSelectionToolbar===void 0?!0:!!e.enableSelectionToolbar,blockedDomains=e.blockedDomains||[],console.log(`[SelectionToolbar] 开关状态:`,enableSelectionToolbar?`已启用`:`已禁用`,`屏蔽域名:`,blockedDomains.length)})}chrome.storage.onChanged.addListener((e,t)=>{isExtensionValid()&&(t===`local`&&e.enableSelectionToolbar&&(enableSelectionToolbar=!!e.enableSelectionToolbar.newValue,enableSelectionToolbar||(hideToolbar(),hideResultPanel(),currentSelectedText=``)),t===`local`&&e.blockedDomains&&(blockedDomains=e.blockedDomains.newValue||[]),t===`local`&&(e.toolbarTools||e.toolbarMaxVisible)&&refreshToolbarCache())});function initSelectionToolbar(){injectStyles(),createToolbar(),createResultPanel(),loadToggleState(),document.addEventListener(`selectionchange`,onSelectionChange),document.addEventListener(`click`,onDocumentClick,!0),document.addEventListener(`mouseup`,onMouseUp,!0),window.addEventListener(`scroll`,onScrollOrResize,!0),window.addEventListener(`resize`,onResize),console.log(`[SelectionToolbar] 初始化完成`)}document.addEventListener(`keydown`,e=>{(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key===`A`&&(e.preventDefault(),chrome.action.click())});var HANDLERS={GET_PAGE_TEXT:e=>getPageText(e),GET_FULL_HTML:e=>getFullHtml(e),QUERY_INTERACTIVE_ELEMENTS:e=>queryInteractiveElements(e),GET_SELECTED_CONTENT:e=>getSelectedContent(e.format),CLICK_ELEMENT:e=>clickElement(e.selector,e.waitTime,e.timeout),FILL_FORM:e=>fillForm(e.fields,e.waitTime),SCROLL_TO:e=>scrollToPosition(e),HOVER_ELEMENT:e=>hoverElement(e.selector),KEYBOARD_INPUT:e=>keyboardInput(e),FILE_UPLOAD:e=>fileUpload(e.selector,e.fileName,e.fileContent,e.fileType),EXTRACT_TABLE:e=>extractTable(e.selector,e.includeHeaders,e.format),EXTRACT_METADATA:()=>extractMetadata(),EXTRACT_LINKS:e=>extractLinks(e.filterType,e.includeImages),EXTRACT_FORMS:e=>extractForms(e.formSelector),EXTRACT_IMAGES:e=>extractImages(e),SEARCH_IN_PAGE:e=>searchInPage(e),PAGE_TO_MARKDOWN:e=>pageToMarkdown(e.selector,e.includeImages,e.includeLinks,e.maxLength),PAGE_TO_JSON:e=>pageToJson(e.selector,e.maxItems),FIND_SIMILAR_ELEMENTS:e=>findSimilarElements(e.selector,e.maxResults),GET_IFRAME_CONTENT:e=>getIframeContent(e.selector,e.includeNested,e.maxLength),HIGHLIGHT_TEXT:e=>highlightText(e.text,e.color),REMOVE_HIGHLIGHTS:()=>removeHighlights(),SHADOW_DOM_QUERY:e=>shadowDomQuery(e.selector,e.deep,e.maxDepth,e.maxResults),MANAGE_STORAGE:e=>manageStorage(e),TEXT_TO_SPEECH:e=>textToSpeech(e.text,e.lang,e.rate,e.pitch),INJECT_CSS:e=>injectCss(e.css,e.targetSelector,e.injectMode),VIDEO_CONTROL:e=>videoControl(e.action,e.selector,e.value),COPY_TO_CLIPBOARD:e=>copyToClipboard$1(e.text),PASTE_FROM_CLIPBOARD:()=>pasteFromClipboard(),WAIT_FOR_ELEMENT:e=>waitForElement(e.selector,e.state,e.timeout),DRAG_AND_DROP:e=>dragAndDrop(e.sourceSelector,e.targetSelector),SELECT_DROPDOWN:e=>selectDropdown(e.triggerSelector,e.optionText,e.optionSelector,e.timeout),COLOR_PICKER:()=>pickColor(),GENERATE_QRCODE:e=>generateQRCode(e.content,e.size,e.errorCorrection,e.showImage),RUN_JAVASCRIPT:e=>runJavascript(e.code,e.timeout),GET_ELEMENT_COUNT:e=>getElementCount(e.selector,e.includeHidden),SCROLL_AND_COLLECT:e=>scrollAndCollect(e),CLEAR_PAGE_DATA:e=>{try{let t=[];return e.site?window.location.href.includes(new URL(e.site).hostname)&&(localStorage.clear(),sessionStorage.clear(),t.push(`localStorage`,`sessionStorage`)):(localStorage.clear(),sessionStorage.clear(),t.push(`localStorage`,`sessionStorage`)),{success:!0,cleared:t}}catch(e){return{success:!1,error:e.message}}},START_REGION_SELECTION:()=>startRegionSelection()},ASYNC_HANDLERS=new Set([`COPY_TO_CLIPBOARD`,`PASTE_FROM_CLIPBOARD`,`WAIT_FOR_ELEMENT`,`DRAG_AND_DROP`,`SELECT_DROPDOWN`,`SCROLL_AND_COLLECT`,`WATCH_ELEMENT`,`COLOR_PICKER`,`GENERATE_QRCODE`,`SCREENSHOT_ELEMENT`,`PAGE_TO_PDF`,`RUN_JAVASCRIPT`,`START_REGION_SELECTION`]);chrome.runtime.onMessage.addListener((e,t,n)=>{if(e.action===`getSelectedText`){n({text:window.getSelection()?.toString()||``});return}let r=HANDLERS[e.type];if(!r)return;let i=r(e);if(ASYNC_HANDLERS.has(e.type)||i instanceof Promise)return Promise.resolve(i).then(n),!0;n(i)}),initSelectionToolbar();function startRegionSelection(){return new Promise(e=>{let t=document.createElement(`div`);t.id=`__region_select_overlay__`,t.style.cssText=`
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
//# sourceMappingURL=content-DOvstIM3.js.map