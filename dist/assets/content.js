(()=>{var X={DEBUG:0,INFO:1,WARN:2,ERROR:3},G=X.DEBUG;function Ue(e){G=e}function We(){return G}function Ke(...e){G<=X.DEBUG&&console.debug("[AIH]",...e)}function Xe(...e){G<=X.INFO&&console.info("[AIH]",...e)}function Ye(...e){G<=X.WARN&&console.warn("[AIH]",...e)}function Ve(...e){G<=X.ERROR&&console.error("[AIH]",...e)}var k={debug:Ke,info:Xe,warn:Ye,error:Ve,setLogLevel:Ue,getLogLevel:We};function _(e,t=document,r=5,o=0){if(o>r)return null;try{if(t.querySelectorAll)for(let n of t.querySelectorAll("*")){if(n.shadowRoot){let l=_(e,n.shadowRoot,r,o+1);if(l)return l}if(n.tagName==="IFRAME"||n.tagName==="FRAME")try{let l=n.contentDocument||n.contentWindow?.document;if(l){let s=_(e,l,r,o+1);if(s)return s}}catch{}}let i=t.querySelector?.(e);if(i)return i}catch{}return null}function Q(e,t=document,r=5,o=0,i=new Set){if(o>r)return[];try{t.querySelectorAll&&(t.querySelectorAll(e).forEach(n=>{i.add(n)}),t.querySelectorAll("*").forEach(n=>{if(n.shadowRoot&&Q(e,n.shadowRoot,r,o+1,i),n.tagName==="IFRAME"||n.tagName==="FRAME")try{let l=n.contentDocument||n.contentWindow?.document;l&&Q(e,l,r,o+1,i)}catch{}}))}catch{}return Array.from(i)}function j(e=document,t=5,r=0){if(r>t)return{text:"",range:null};try{let o=e.getSelection?.();if(o&&!o.isCollapsed&&o.rangeCount>0){let i=o.toString().trim();if(i)return{text:i,range:o.getRangeAt(0),depth:r,source:"shadow"}}if(e.querySelectorAll){for(let i of e.querySelectorAll("*"))if(i.shadowRoot){let n=j(i.shadowRoot,t,r+1);if(n.text)return n}}}catch{}return{text:"",range:null}}function le(e=document,t=5,r=0,o=new Set){if(r>t||o.has(e))return"";o.add(e);let i="";try{e.body?i+=e.body.innerText||"":e instanceof ShadowRoot&&(i+=e.textContent||""),e.querySelectorAll&&e.querySelectorAll("*").forEach(n=>{if(n.shadowRoot&&(i+=`
`+le(n.shadowRoot,t,r+1,o)),n.tagName==="IFRAME"||n.tagName==="FRAME")try{let l=n.contentDocument||n.contentWindow?.document;l&&l.body&&(i+=`
`+le(l,t,r+1,o))}catch{}})}catch{}return i.trim().replace(/\n{3,}/g,`

`)}function se(e=document,t=5,r=0,o=new Set){if(r>t||o.has(e))return"";o.add(e);let i="";try{e.documentElement?i=e.documentElement.outerHTML:e instanceof ShadowRoot&&(i=e.innerHTML||"");let n=[];e.querySelectorAll&&e.querySelectorAll("*").forEach(l=>{if(l.shadowRoot){let s=se(l.shadowRoot,t,r+1,o);s&&n.push(`<!-- shadow-root of ${l.tagName} -->
${s}`)}if(l.tagName==="IFRAME"||l.tagName==="FRAME")try{let s=l.contentDocument||l.contentWindow?.document;if(s&&s.documentElement){let a=se(s,t,r+1,o);a&&n.push(`<!-- iframe content -->
${a}`)}}catch{}}),n.length>0&&(i+=`
<!-- Shadow DOM and iframe content -->
`+n.join(`
`))}catch{}return i}function ae(e){if(!e)return{x:window.innerWidth/2,y:window.innerHeight/2};let t;try{t=e.getBoundingClientRect()}catch{t={left:0,top:0,width:0,height:0}}if(!t||t.width===0&&t.height===0){let i=e.commonAncestorContainer;if(i){let n=i.nodeType===Node.TEXT_NODE?i.parentElement:i;n&&n.getBoundingClientRect&&(t=n.getBoundingClientRect())}}let r=t.left+t.width/2,o=t.top;if(window.top!==window){let i=e.startContainer.ownerDocument;for(;i&&i!==window.top.document;){let n=i.defaultView?.frameElement;if(!n)break;let l=n.getBoundingClientRect();r+=l.left,o+=l.top,i=n.ownerDocument}}return{x:r,y:o}}function ye(e,t=document,r=5,o=0,i=new Set){if(o>r||i.has(t))return i;try{let n=()=>e();t.addEventListener?.("selectionchange",n),i.add({root:t,listener:n}),t.querySelectorAll&&t.querySelectorAll("*").forEach(l=>{l.shadowRoot&&ye(e,l.shadowRoot,r,o+1,i)})}catch{}return i}function Je(e){for(let{root:t,listener:r}of e)try{t.removeEventListener?.("selectionchange",r)}catch{}e.clear()}function ce(e){if(e.id)return`#${e.id}`;let t=[],r=e;for(;r&&r!==document.body&&r!==document.documentElement;){let o=r.tagName.toLowerCase();if(r.id){o=`#${r.id}`,t.unshift(o);break}if(r.className&&typeof r.className=="string"){let n=r.className.trim().split(/\s+/).filter(l=>l);n.length>0&&(o+="."+n[0])}let i=r.parentElement;if(i){let n=Array.from(i.children).filter(l=>l.tagName===r.tagName);if(n.length>1){let l=n.indexOf(r)+1;o+=`:nth-child(${l})`}}t.unshift(o),r=i}return t.join(" > ")}function Qe(e){if(e.tagName==="INPUT"||e.tagName==="TEXTAREA")return e.value||e.placeholder||e.name||"";if(e.tagName==="SELECT"){let t=e.options[e.selectedIndex];return t?t.text:""}return e.textContent.trim()}function Ze(e){return e.tagName==="INPUT"?e.type==="checkbox"||e.type==="radio"?e.checked?"checked":"unchecked":e.value:e.tagName==="SELECT"?e.value:""}function V(e){if(e.id)return`#${e.id}`;let t=e.tagName.toLowerCase();if(e.className){let r=e.className.split(" ").filter(o=>o).slice(0,2);r.length&&(t+="."+r.join("."))}return t}function ue(){document.querySelectorAll(".ai-helper-highlight").forEach(t=>{let r=t.parentNode;if(r&&r.insertBefore&&r.removeChild){for(;t.firstChild;)r.insertBefore(t.firstChild,t);r.removeChild(t),typeof r.normalize=="function"&&r.normalize()}});let e=document.getElementById("ai-helper-highlight-style");e&&e.remove()}function et(){try{let e=i=>{let n=document.querySelector(`meta[name="${i}"]`)||document.querySelector(`meta[property="${i}"]`)||document.querySelector(`meta[property="og:${i}"]`);return n?n.content:null},t=i=>{let n=document.querySelectorAll(`meta[name="${i}"], meta[property="${i}"], meta[property="og:${i}"]`);return Array.from(n).map(l=>l.content).filter(Boolean)},r=[];document.querySelectorAll('script[type="application/ld+json"]').forEach(i=>{try{let n=JSON.parse(i.textContent);Array.isArray(n)?r.push(...n):n&&n["@graph"]&&Array.isArray(n["@graph"])?r.push(...n["@graph"]):n&&r.push(n)}catch{}});let o=[];return document.querySelectorAll("[itemscope]").forEach(i=>{let n=i.getAttribute("itemtype")||"";if(!n)return;let l={};i.querySelectorAll("[itemprop]").forEach(s=>{if(s.closest("[itemscope]")!==i)return;let a=s.getAttribute("itemprop")||"";if(!a)return;let u=s.getAttribute("content")||s.getAttribute("href")||s.getAttribute("src")||s.textContent?.trim();u&&(l[a]?l[a]=Array.isArray(l[a])?[...l[a],u]:[l[a],u]:l[a]=u)}),o.push({itemType:n,properties:l})}),{success:!0,data:{title:document.title,description:e("description"),keywords:e("keywords"),author:e("author"),ogTitle:e("og:title"),ogDescription:e("og:description"),ogImage:e("og:image"),ogUrl:e("og:url"),ogType:e("og:type"),ogSiteName:e("og:site_name"),ogLocale:e("og:locale"),articlePublishedTime:e("article:published_time"),articleModifiedTime:e("article:modified_time"),articleAuthor:e("article:author"),twitterCard:e("twitter:card"),twitterTitle:e("twitter:title"),twitterDescription:e("twitter:description"),twitterImage:e("twitter:image"),twitterSite:e("twitter:site"),twitterCreator:e("twitter:creator"),canonicalUrl:document.querySelector('link[rel="canonical"]')?.href,links:t("citation_author"),jsonLd:r.length>0?r:void 0,microdata:o.length>0?o:void 0}}}catch(e){return{success:!1,error:e.message}}}function tt(e="all",t=!1){try{let r=window.location.hostname,o=[];return document.querySelectorAll("a[href]").forEach(i=>{try{let n=i.href;if(!n||n.startsWith("javascript:")||n.startsWith("#"))return;let l=new URL(n),s=l.hostname!==r;if(e==="internal"&&s||e==="external"&&!s)return;o.push({href:n,text:i.textContent.trim(),title:i.title,domain:l.hostname,isExternal:s,target:i.target})}catch{}}),t&&document.querySelectorAll("img[src]").forEach(i=>{try{let n=i.src;if(!n)return;let l=new URL(n),s=l.hostname!==r;if(e==="internal"&&s||e==="external"&&!s)return;o.push({href:n,text:i.alt||"",title:i.title,domain:l.hostname,isExternal:s,type:"image"})}catch{}}),{success:!0,total:o.length,links:o}}catch(r){return{success:!1,error:r.message}}}function rt(e=null){try{let t=(e?[document.querySelector(e)].filter(Boolean):Array.from(document.querySelectorAll("form"))).map((r,o)=>{let i=[],n=r.id||`form-${o}`;return r.querySelectorAll("input").forEach(l=>{i.push({tag:"input",name:l.name,id:l.id,type:l.type,placeholder:l.placeholder,required:l.required,selector:V(l)})}),r.querySelectorAll("textarea").forEach(l=>{i.push({tag:"textarea",name:l.name,id:l.id,placeholder:l.placeholder,required:l.required,selector:V(l)})}),r.querySelectorAll("select").forEach(l=>{let s=Array.from(l.options).map(a=>({value:a.value,text:a.textContent.trim()}));i.push({tag:"select",name:l.name,id:l.id,required:l.required,options:s,selector:V(l)})}),{formId:n,action:r.action,method:r.method,fields:i}});return{success:!0,total:t.length,forms:t}}catch(t){return{success:!1,error:t.message}}}function nt(e={}){try{let{minWidth:t=0,minHeight:r=0,includeBackgroundImages:o=!1,download:i=!1,maxResults:n=100}=e,l=[],s=new Set;return document.querySelectorAll("img[src]").forEach(a=>{try{let u=a.src;if(!u||s.has(u))return;let h=a.naturalWidth||a.width||0,d=a.naturalHeight||a.height||0;h>=t&&d>=r&&(s.add(u),l.push({src:u,alt:a.alt||"",title:a.title||"",width:h,height:d,selector:V(a)}))}catch{}}),o&&document.querySelectorAll("*").forEach(a=>{try{let u=window.getComputedStyle(a).backgroundImage;if(!u||u==="none"||u.startsWith("gradient"))return;let h=u.match(/url\(['"]?([^'")]+)['"]?\)/);if(h&&h[1]){let d=h[1];s.has(d)||(s.add(d),l.push({src:d,alt:"",title:"",width:0,height:0,type:"background",selector:V(a)}))}}catch{}}),i&&l.length>0&&l.slice(0,Math.min(n,10)).forEach((a,u)=>{setTimeout(()=>{let h=document.createElement("a");h.href=a.src,h.download=`image_${u+1}.png`,document.body.appendChild(h),h.click(),document.body.removeChild(h)},u*500)}),{success:!0,total:l.length,images:l.slice(0,n),message:i?`\u5DF2\u5F00\u59CB\u4E0B\u8F7D ${Math.min(l.length,10)} \u5F20\u56FE\u7247`:""}}catch(t){return{success:!1,error:t.message}}}function ot(e=null,t=!0,r=!0,o=5e4){try{let i=e?document.querySelector(e):document.body;if(!i)return{success:!1,error:"\u672A\u627E\u5230\u76EE\u6807\u5143\u7D20"};let n="",l=(s,a=0)=>{if(a>6)return"";let u="",h=s.tagName.toLowerCase();switch(h){case"h1":case"h2":case"h3":case"h4":case"h5":case"h6":let d=parseInt(h[1]);u+=`
`+"#".repeat(d)+" "+s.textContent.trim()+`

`;break;case"p":u+=s.textContent.trim()+`

`;break;case"a":if(r){let f=s.getAttribute("href"),b=s.textContent.trim();u+=`[${b||f}](${f})`}else u+=s.textContent.trim();break;case"img":if(t){let f=s.getAttribute("src"),b=s.getAttribute("alt")||"";u+=`![${b}](${f})

`}break;case"ul":s.querySelectorAll("li").forEach((f,b)=>{u+=`
- `+f.textContent.trim()}),u+=`

`;break;case"ol":s.querySelectorAll("li").forEach((f,b)=>{u+=`
`+(b+1)+". "+f.textContent.trim()}),u+=`

`;break;case"blockquote":u+=`
> `+s.textContent.trim().replace(/\n/g,`
> `)+`

`;break;case"code":let c=s.parentElement;c&&c.tagName.toLowerCase()==="pre"?u+="\n```\n"+s.textContent+"\n```\n\n":u+="`"+s.textContent.trim()+"`";break;case"table":let p=`
`,m=s.querySelectorAll("tr");m.forEach((f,b)=>{let E=f.querySelectorAll("th, td"),N=Array.from(E).map(q=>q.textContent.trim());p+="| "+N.join(" | ")+` |
`,b===0&&m.length>1&&(p+="| "+N.map(()=>"---").join(" | ")+` |
`)}),u+=p+`
`;break;case"br":u+=`
`;break;default:s.childNodes.length>0&&s.childNodes.forEach(f=>{f.nodeType===Node.ELEMENT_NODE?u+=l(f,a+1):f.nodeType===Node.TEXT_NODE&&(u+=f.textContent)})}return u};return n=l(i),n=n.replace(/\n{3,}/g,`

`).trim(),n.length>o&&(n=n.substring(0,o)+`...

*\u5185\u5BB9\u5DF2\u622A\u65AD*`),{success:!0,markdown:n,length:n.length,url:window.location.href,title:document.title}}catch(i){return{success:!1,error:i.message}}}function it(e=null,t=100){try{let r=e?Array.from(document.querySelectorAll(e)):[document.body];if(!r.length)return{success:!1,error:`\u672A\u627E\u5230\u5339\u914D\u9009\u62E9\u5668\u7684\u5143\u7D20: ${e}`};let o=[],i=[],n=[],l=[],s=[],a=new Set,u=new Set;return r.forEach(h=>{o.length<t&&h.querySelectorAll("table").forEach(d=>{if(o.length>=t)return;let c=[];d.querySelectorAll("th").forEach(m=>{c.push(m.textContent.trim())});let p=[];d.querySelectorAll("tr").forEach(m=>{let f=[];m.querySelectorAll("td, th").forEach(b=>{f.push(b.textContent.trim())}),p.push(f)}),o.push({headers:c,rows:p})}),i.length<t&&h.querySelectorAll("ul, ol").forEach(d=>{if(i.length>=t)return;let c=[];d.querySelectorAll(":scope > li").forEach(p=>{c.push(p.textContent.trim())}),i.push({tag:d.tagName.toLowerCase(),items:c})}),n.length<t&&h.querySelectorAll('script[type="application/ld+json"]').forEach(d=>{if(n.length>=t)return;let c=d.textContent.substring(0,200);if(!a.has(c)){a.add(c);try{let p=JSON.parse(d.textContent);n.push(p)}catch{}}}),l.length<t&&h.querySelectorAll("article").forEach(d=>{if(l.length>=t)return;let c=d.textContent.trim();l.push({textContent:c.substring(0,500),wordCount:c.split(/\s+/).filter(Boolean).length})}),s.length<t&&h.querySelectorAll("[itemscope]").forEach(d=>{if(s.length>=t)return;let c=d.getAttribute("itemtype")||"";if(!c)return;let p=c+d.textContent.trim().substring(0,100);if(u.has(p))return;u.add(p);let m={};d.querySelectorAll("[itemprop]").forEach(f=>{if(f.closest("[itemscope]")!==d)return;let b=f.getAttribute("itemprop")||"";if(!b)return;let E=f.getAttribute("content")||f.getAttribute("href")||f.getAttribute("src")||f.textContent?.trim();E&&(m[b]?m[b]=Array.isArray(m[b])?[...m[b],E]:[m[b],E]:m[b]=E)}),s.push({itemType:c,properties:m})})}),{success:!0,data:{tables:o,lists:i,jsonLd:n,articles:l,microdata:s},counts:{tables:o.length,lists:i.length,jsonLd:n.length,articles:l.length,microdata:s.length}}}catch(r){return{success:!1,error:r.message}}}function lt(e="iframe",t=!1,r=1e4){try{let o=document.querySelectorAll(e),i=[],n=(l,s=1,a="")=>{try{let u=ce(l),h=a?`${a} > iframe`:u,d=l.src||"about:blank",c=!1,p="",m="",f=0;try{let b=l.contentDocument||l.contentWindow?.document;b&&(c=!0,p=b.title||"",m=le(b).substring(0,r),f=se(b).length,t&&s<2&&b.querySelectorAll("iframe").forEach(E=>{n(E,s+1,h)}))}catch{c=!1}i.push({selector:h,url:d,accessible:c,title:p,textContent:m,htmlLength:f})}catch{}};return o.forEach(l=>n(l)),{success:!0,iframes:i,total:i.length,accessible:i.filter(l=>l.accessible).length}}catch(o){return{success:!1,error:o.message}}}function st(e={}){try{let{query:t,pattern:r,mode:o="plain",caseSensitive:i=!1,contextLength:n=50,maxResults:l=20,highlight:s=!1}=e,a=t||r;if(!a)return{success:!1,error:"\u9700\u8981\u63D0\u4F9B\u641C\u7D22\u5173\u952E\u8BCD"};if(o==="plain"){let m=window.find(a,i,!1,!0,!1,!0,!1),f=0,b=[];try{let E=window.getSelection(),N=E&&E.rangeCount>0?E.getRangeAt(0):null,q=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),Fe=i?"g":"gi",He=a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),je=new RegExp(He,Fe),te=document.body.innerText,ve=0;for(;q.nextNode();){let ke=q.currentNode.textContent.match(je);if(ke)for(let re of ke){if(b.length>=l)break;let K=te.indexOf(re,ve),ze=Math.max(0,K-n),Ge=Math.min(te.length,K+re.length+n);b.push({match:re,position:K,context:te.substring(ze,Ge),lineNumber:te.substring(0,K).split(`
`).length}),f++,ve=K+re.length}if(b.length>=l)break}N&&(E.removeAllRanges(),E.addRange(N))}catch{f=+!!m}if(s&&f>0){ue();let E=document.createElement("style");E.id="ai-helper-highlight-style",E.textContent=`
          .ai-helper-search-highlight {
            background-color: #ffff00;
            color: #000;
            padding: 1px 2px;
            border-radius: 2px;
          }
        `,document.head.appendChild(E);let N=i?"g":"gi",q=a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");document.body.innerHTML=document.body.innerHTML.replace(new RegExp(q,N),'<span class="ai-helper-search-highlight">$&</span>')}return{success:!0,query:a,mode:"plain",found:m,total:f,matches:b,highlighted:s}}let u=i?"g":"gi",h=new RegExp(a,u),d=document.body.innerText,c=[],p;for(;(p=h.exec(d))!==null&&c.length<l;){let m=Math.max(0,p.index-n),f=Math.min(d.length,p.index+p[0].length+n);c.push({match:p[0],position:p.index,context:d.substring(m,f),lineNumber:d.substring(0,p.index).split(`
`).length}),p[0].length===0&&h.lastIndex++}if(s&&c.length>0){ue();let m=document.createElement("style");m.id="ai-helper-highlight-style",m.textContent=`
        .ai-helper-search-highlight {
          background-color: #ffff00;
          color: #000;
          padding: 1px 2px;
          border-radius: 2px;
        }
      `,document.head.appendChild(m),document.body.innerHTML=document.body.innerHTML.replace(new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),u),'<span class="ai-helper-search-highlight">$&</span>')}return{success:!0,pattern:a,mode:"regex",total:c.length,matches:c,highlighted:s}}catch(t){return{success:!1,error:t.message}}}function at(e={}){let{filterByText:t,elementTypes:r,maxResults:o=100}=e,i=[],n=new Set,l={button:'button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]',input:'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',select:"select",textarea:"textarea",a:"a[href]",checkbox:'input[type="checkbox"]',radio:'input[type="radio"]',menuitem:'[role="menuitem"], [role="menu"], [role="menuitemcheckbox"], [role="menuitemradio"]'},s=[];return r&&r.length>0?r.forEach(a=>{l[a]&&s.push(l[a])}):s=Object.values(l),s.forEach(a=>{try{Q(a).forEach(u=>{let h=ce(u);if(n.has(h))return;n.add(h);let d=u.tagName.toLowerCase(),c=Qe(u),p=Ze(u);if(t&&!c.toLowerCase().includes(t.toLowerCase()))return;let m={tag:d,selector:h,text:c.substring(0,100)};d==="a"?m.href=u.href:(d==="input"||d==="select"||d==="textarea")&&(m.name=u.name,m.type=u.type||"text",m.value=p,m.placeholder=u.placeholder),u.id&&(m.id=u.id),u.className&&typeof u.className=="string"&&(m.className=u.className.split(" ").filter(f=>f).slice(0,3).join(" ")),i.push(m)})}catch{}}),{success:!0,count:Math.min(i.length,o),total:i.length,elements:i.slice(0,o)}}function ct(e,t=50){try{if(!e)return{success:!1,error:"\u9009\u62E9\u5668\u4E0D\u80FD\u4E3A\u7A7A"};let r=_(e);if(!r)return{success:!1,error:`\u672A\u627E\u5230\u76EE\u6807\u5143\u7D20: ${e}`};let o=s=>{let a=s.tagName.toLowerCase(),u=s.classList?Array.from(s.classList).sort().join("."):"",h={};return Array.from(s.children).forEach(d=>{let c=d.tagName.toLowerCase();h[c]=(h[c]||0)+1}),`${a}|${u}|${Object.keys(h).sort().map(d=>`${d}:${h[d]}`).join(",")}`},i=o(r),n=[],l=document.querySelectorAll(r.tagName.toLowerCase());for(let s of l)if(s!==r){if(n.length>=t)break;o(s)===i&&n.push({tag:s.tagName.toLowerCase(),selector:ce(s),text:(s.textContent||"").trim().substring(0,200),id:s.id||"",className:typeof s.className=="string"?s.className:""})}return{success:!0,original:{tag:r.tagName.toLowerCase(),selector:ce(r),text:(r.textContent||"").trim().substring(0,200),signature:i},similar:n,count:n.length}}catch(r){return{success:!1,error:r.message}}}function ut(e,t=!1){try{let r=document.querySelectorAll(e);if(!t){let o=0,i=r.length;return r.forEach(n=>{let l=window.getComputedStyle(n);l.display!=="none"&&l.visibility!=="hidden"&&l.opacity!=="0"&&o++}),{success:!0,count:o,totalCount:i,empty:o===0,selector:e}}return{success:!0,count:r.length,totalCount:r.length,empty:r.length===0,selector:e}}catch(r){return{success:!1,error:r.message}}}function dt(e={}){let{scrollPixels:t=800,maxScrolls:r=20,pauseMs:o=500,selector:i}=e;return new Promise(async n=>{try{let l=i?document.querySelector(i):null,s=()=>{let p=l||document.body,m=document.createTreeWalker(p,NodeFilter.SHOW_TEXT),f="",b;for(;b=m.nextNode();){let E=b.parentElement;if(!E)continue;let N=E.getBoundingClientRect();if(N.bottom>-100&&N.top<window.innerHeight+100){let q=b.textContent.trim();q&&(f+=q+`
`)}}return f},a=l||document.scrollingElement||document.documentElement,u="",h=window.scrollY;for(let p=0;p<r;p++){let m=s();u+=m+`
`;let f=window.scrollY;if(a.scrollBy({top:t,behavior:"auto"}),await new Promise(b=>setTimeout(b,o)),Math.abs(window.scrollY-f)<5&&(await new Promise(b=>setTimeout(b,o)),Math.abs(window.scrollY-f)<5))break}l&&a.scrollTo({top:h,behavior:"auto"});let d=u.split(`
`),c=[];for(let p of d){let m=p.trim();m&&m!==c[c.length-1]&&c.push(m)}n({success:!0,content:c.join(`
`),contentLength:c.join(`
`).length,scrolls:r,startScrollY:h,endScrollY:window.scrollY})}catch(l){n({success:!1,error:l.message})}})}function ht(e={}){let{maxLength:t=5e4,includeHeadings:r=!0,includeLinks:o=!0}=e,i=le(),n={title:document.title||"",url:window.location.href,content:i.substring(0,t),wordCount:i.split(/\s+/).length};return r&&(n.headings=Array.from(Q("h1, h2, h3, h4, h5, h6")).map(l=>({level:l.tagName,text:l.textContent.trim()})).filter(l=>l.text.length>0).slice(0,30)),o&&(n.links=Array.from(Q("a")).map(l=>({text:l.textContent.trim(),href:l.href})).filter(l=>l.text.length>0).slice(0,50)),{success:!0,data:n}}function pt(e={}){let{includeStyles:t=!1,maxLength:r=5e4}=e,o=se();return t||(o=o.replace(/\s*style="[^"]*"/gi,"")),{success:!0,content:JSON.stringify({title:document.title,url:window.location.href,html:o.substring(0,r),fullLength:o.length})}}function mt(e="text"){try{let t=window.getSelection();if(!t||t.isCollapsed||t.rangeCount===0)return{success:!1,error:"\u5F53\u524D\u6CA1\u6709\u9009\u4E2D\u7684\u5185\u5BB9"};let r={success:!0,data:{selectedCount:t.rangeCount,text:""}};if(e==="html"){let o=[];for(let i=0;i<t.rangeCount;i++){let n=t.getRangeAt(i).cloneContents(),l=document.createElement("div");l.appendChild(n),o.push(l.innerHTML)}r.data.html=o.join(`
`),r.data.text=t.toString()}else r.data.text=t.toString();return r}catch(t){return{success:!1,error:t.message}}}function ft(e="table",t=!0,r="json"){try{let o=_(e);if(!o)return{success:!1,error:`\u672A\u627E\u5230\u5339\u914D\u9009\u62E9\u5668\u7684\u8868\u683C: ${e}`};let i=Array.from(o.querySelectorAll("tr")),n=[];return i.forEach((l,s)=>{let a=Array.from(l.querySelectorAll("td, th")).map(u=>u.textContent.trim());(t||s>0)&&n.push(a)}),r==="markdown"?n.length===0?{success:!0,content:"\u8868\u683C\u4E3A\u7A7A"}:{success:!0,content:`${`| ${n[0].join(" | ")} |`}
${`| ${n[0].map(()=>"---").join(" | ")} |`}
${n.slice(1).map(l=>`| ${l.join(" | ")} |`).join(`
`)}`}:{success:!0,content:JSON.stringify({data:n,rowCount:n.length,columnCount:n[0]?.length||0}),data:n}}catch(o){return{success:!1,error:o.message}}}async function gt(e){try{return await navigator.clipboard.writeText(e),{success:!0,message:"\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F"}}catch{try{let t=document.createElement("textarea");return t.value=e,t.style.position="fixed",t.style.left="-9999px",document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t),{success:!0,message:"\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF08\u964D\u7EA7\u65B9\u6848\uFF09"}}catch(t){return{success:!1,error:t.message}}}}async function yt(){try{return{success:!0,content:await navigator.clipboard.readText()}}catch(e){return{success:!1,error:e.message}}}function bt(e){try{let t=_(e);if(!t)return{success:!1,error:`\u672A\u627E\u5230\u5143\u7D20: ${e}`};let r=new MouseEvent("mouseenter",{bubbles:!0,cancelable:!0,view:window});t.dispatchEvent(r);let o=new MouseEvent("mouseover",{bubbles:!0,cancelable:!0,view:window});return t.dispatchEvent(o),{success:!0,message:`\u5DF2\u5728\u5143\u7D20\u4E0A\u89E6\u53D1\u60AC\u505C\u6548\u679C: ${e}`}}catch(t){return{success:!1,error:t.message}}}function xt(e,t="yellow"){try{if(!e)return{success:!1,error:"\u672A\u63D0\u4F9B\u8981\u9AD8\u4EAE\u7684\u6587\u672C"};ue();let r=document.createElement("style");r.id="ai-helper-highlight-style",r.textContent=`
      .ai-helper-highlight {
        background-color: ${t} !important;
        padding: 2px 0;
      }
    `,document.head.appendChild(r);let o=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),i=[],n;for(;n=o.nextNode();)n.nodeValue.toLowerCase().includes(e.toLowerCase())&&i.push(n);let l=[];return i.forEach(s=>{let a=s.parentNode;if(!a||!a.replaceChild||!a.insertBefore)return;let u=s.nodeValue,h=u.toLowerCase(),d=u.toLowerCase(),c=h.indexOf(d);if(c!==-1){let p=document.createElement("span");p.className="ai-helper-highlight",p.textContent=u.substring(c,c+u.length);let m=document.createTextNode(u.substring(0,c)),f=document.createTextNode(u.substring(c+u.length));a.replaceChild(f,s),a.insertBefore(p,f),a.insertBefore(m,p),l.push(p)}}),l.length>0&&l[0].scrollIntoView({behavior:"smooth",block:"center"}),{success:!0,message:`\u5DF2\u9AD8\u4EAE ${l.length} \u5904\u6587\u672C`,count:l.length}}catch(r){return{success:!1,error:r.message}}}var ne=null;function wt(e,t=500,r=3e3){try{if(!e)return{success:!1,error:"\u9009\u62E9\u5668\u4E0D\u80FD\u4E3A\u7A7A"};let o=e.trim();for(let[n,l]of[[/^"([\s\S]*)"$/,"$1"],[/^'([\s\S]*)'$/,"$1"],[/^`([\s\S]*)`$/,"$1"],[/^"([\s\S]*)"$/,"$1"],[/^'([\s\S]*)'$/,"$1"],[/^「([\s\S]*)」$/,"$1"]])o=o.replace(n,l);let i=_(o);return i?(i.click(),{success:!0,message:`\u5DF2\u6210\u529F\u70B9\u51FB\u5143\u7D20: ${e}`}):{success:!1,error:`\u672A\u627E\u5230\u5339\u914D\u9009\u62E9\u5668\u7684\u5143\u7D20: ${e}`}}catch(o){return{success:!1,error:o.message}}}function Et(e){return e.isContentEditable||e.getAttribute("contenteditable")==="true"}function Se(e,t){try{return e.focus(),document.execCommand("insertText",!1,t)||(e.textContent=t),e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0})),!0}catch{try{return e.textContent=t,e.dispatchEvent(new Event("input",{bubbles:!0})),!0}catch{return!1}}}function vt(e,t=500){try{let r=[];return e.forEach(o=>{let{selector:i,value:n,fieldType:l="text"}=o,s=_(i);if(!s){r.push({selector:i,success:!1,error:"\u672A\u627E\u5230\u5143\u7D20"});return}try{if(l==="text"){if(Et(s)){let a=Se(s,n);r.push({selector:i,success:a,value:n});return}s.value=n,s.dispatchEvent(new Event("input",{bubbles:!0})),s.dispatchEvent(new Event("change",{bubbles:!0}))}else if(l==="contenteditable"){let a=Se(s,n);r.push({selector:i,success:a,value:n});return}else if(l==="select"){let a=s.querySelector(`option[value="${n}"]`)||Array.from(s.options).find(u=>u.textContent===n);if(a)s.value=a.value,s.dispatchEvent(new Event("change",{bubbles:!0}));else{r.push({selector:i,success:!1,error:"\u672A\u627E\u5230\u5339\u914D\u7684\u9009\u9879"});return}}else if(l==="checkbox")s.checked=n==="true"||n===!0,s.dispatchEvent(new Event("change",{bubbles:!0}));else if(l==="radio"){let a=document.querySelector(`${i}[value="${n}"]`);if(a)a.checked=!0,a.dispatchEvent(new Event("change",{bubbles:!0}));else{r.push({selector:i,success:!1,error:"\u672A\u627E\u5230\u5339\u914D\u7684\u5355\u9009\u6309\u94AE"});return}}r.push({selector:i,success:!0,value:n})}catch(a){r.push({selector:i,success:!1,error:a.message})}}),{success:!0,message:`\u8868\u5355\u586B\u5145\u5B8C\u6210\uFF0C\u6210\u529F ${r.filter(o=>o.success).length}/${e.length} \u4E2A\u5B57\u6BB5`,details:r}}catch(r){return{success:!1,error:r.message}}}function kt(e){try{let{target:t="selector",selector:r,x:o=0,y:i=0,behavior:n="smooth",align:l="center"}=e;if(t==="top")window.scrollTo({top:0,left:0,behavior:n});else if(t==="bottom")window.scrollTo({top:document.body.scrollHeight,left:0,behavior:n});else if(t==="coordinates")window.scrollTo({top:i,left:o,behavior:n});else if(t==="selector"&&r){let s=_(r);if(!s)return{success:!1,error:`\u672A\u627E\u5230\u5143\u7D20: ${r}`};s.scrollIntoView({behavior:n,block:l})}else return{success:!1,error:"\u65E0\u6548\u7684\u6EDA\u52A8\u76EE\u6807\u6216\u7F3A\u5C11\u9009\u62E9\u5668"};return{success:!0,message:"\u6EDA\u52A8\u5B8C\u6210"}}catch(t){return{success:!1,error:t.message}}}function Ce(e){if(!e)return!1;if(e.offsetParent===null&&e.tagName!=="BODY"){let n=window.getComputedStyle(e);if(n.display==="none"||n.visibility==="hidden"||n.position!=="fixed")return!1}let t=window.getComputedStyle(e);if(t.display==="none"||t.visibility==="hidden"||parseFloat(t.opacity)<=0)return!1;let r=e.getBoundingClientRect();if(r.width<=0||r.height<=0)return!1;let o=window.innerHeight||document.documentElement.clientHeight,i=window.innerWidth||document.documentElement.clientWidth;return r.top<o&&r.bottom>0&&r.left<i&&r.right>0}function St(e,t="appeared",r=1e4){return new Promise((o,i)=>{let n=Date.now(),l=()=>{let s=_(e);if(t==="appeared"&&s){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u51FA\u73B0`,element:e});return}if(t==="disappeared"&&!s){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u6D88\u5931`});return}if(t==="visible"&&s&&Ce(s)){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u53EF\u89C1`,element:e});return}if(t==="hidden"&&(!s||!Ce(s))){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u9690\u85CF`});return}if(Date.now()-n>r){o({success:!1,error:`\u7B49\u5F85\u8D85\u65F6\uFF08${r}ms\uFF09\uFF0C\u5143\u7D20 ${e} \u672A\u8FBE\u5230 ${t} \u72B6\u6001`});return}setTimeout(l,100)};l()})}function Ct({key:e,text:t,ctrlKey:r=!1,shiftKey:o=!1,altKey:i=!1}){try{let n=document.activeElement;if(!n)return{success:!1,error:"\u6CA1\u6709\u805A\u7126\u7684\u5143\u7D20"};if(t){let l=n.tagName==="INPUT"||n.tagName==="TEXTAREA",s=n.isContentEditable;if(l||s){if(n.focus(),s)try{document.execCommand("selectAll",!1,null),document.execCommand("insertText",!1,t)}catch{n.textContent+=t}else{let a=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value");a&&a.set?a.set.call(n,n.value+t):n.value+=t}try{n.dispatchEvent(new InputEvent("input",{bubbles:!0,cancelable:!0,inputType:"insertText",data:t}))}catch{n.dispatchEvent(new Event("input",{bubbles:!0}))}n.dispatchEvent(new Event("change",{bubbles:!0}))}}if(e){let l={key:e,code:e.length===1?`Key${e.toUpperCase()}`:e,keyCode:e.toUpperCase().charCodeAt(0),which:e.toUpperCase().charCodeAt(0),bubbles:!0,cancelable:!0,ctrlKey:r,shiftKey:o,altKey:i};document.activeElement.dispatchEvent(new KeyboardEvent("keydown",l)),document.activeElement.dispatchEvent(new KeyboardEvent("keypress",l)),document.activeElement.dispatchEvent(new KeyboardEvent("keyup",l))}return{success:!0,message:"\u952E\u76D8\u8F93\u5165\u6210\u529F"}}catch(n){return{success:!1,error:n.message}}}function Tt(e,t){return new Promise((r,o)=>{try{let i=_(e),n=_(t);if(!i){r({success:!1,error:`\u672A\u627E\u5230\u6E90\u5143\u7D20: ${e}`});return}if(!n){r({success:!1,error:`\u672A\u627E\u5230\u76EE\u6807\u5143\u7D20: ${t}`});return}let l=i.getBoundingClientRect(),s=n.getBoundingClientRect(),a=l.left+l.width/2,u=l.top+l.height/2,h=s.left+s.width/2,d=s.top+s.height/2,c=(p,m,f)=>{let b=new DragEvent(p,{bubbles:!0,cancelable:!0,clientX:m,clientY:f,screenX:m,screenY:f});Object.defineProperty(b,"dataTransfer",{value:{getData:()=>"",setData:()=>{},effectAllowed:"all",dropEffect:"none"}}),document.elementFromPoint(m,f)?.dispatchEvent(b)};c("dragstart",a,u),c("dragenter",h,d),c("dragover",h,d),c("drop",h,d),c("dragend",a,u),r({success:!0,experimental:!0,message:`[\u5B9E\u9A8C\u6027] \u5DF2\u5C1D\u8BD5\u62D6\u62FD ${e} \u2192 ${t}\uFF08\u62D6\u62FD\u6A21\u62DF\u5728\u6D4F\u89C8\u5668\u4E2D\u4E3A\u90E8\u5206\u652F\u6301\uFF0C\u53EF\u80FD\u672A\u751F\u6548\uFF09`})}catch(i){r({success:!1,error:i.message})}})}function At(e,t,r,o="application/octet-stream"){try{let i=_(e);if(!i)return{success:!1,error:`\u672A\u627E\u5230\u6587\u4EF6\u4E0A\u4F20\u63A7\u4EF6: ${e}`};if(i.type!=="file")return{success:!1,error:"\u9009\u62E9\u7684\u5143\u7D20\u4E0D\u662F\u6587\u4EF6\u4E0A\u4F20\u63A7\u4EF6"};let n;try{let a=atob(r),u=new Uint8Array(a.length);for(let h=0;h<a.length;h++)u[h]=a.charCodeAt(h);n=new Blob([u],{type:o})}catch{n=new Blob([r],{type:o})}let l=new File([n],t,{type:o}),s=new DataTransfer;return s.items.add(l),i.files=s.files,i.dispatchEvent(new Event("change",{bubbles:!0})),{success:!0,message:`\u5DF2\u4E0A\u4F20\u6587\u4EF6: ${t}`}}catch(i){return{success:!1,error:i.message}}}function Lt(e,t,r=null,o=5e3){return new Promise(async i=>{try{let n=document.querySelector(e);if(!n){i({success:!1,error:`\u672A\u627E\u5230\u89E6\u53D1\u5668: ${e}`});return}if(n.tagName==="SELECT"){let u=n.options;for(let h=0;h<u.length;h++){let d=u[h],c=(d.textContent||d.label||"").trim();if(c===t||c.includes(t)){n.value=d.value,n.dispatchEvent(new Event("change",{bubbles:!0})),n.dispatchEvent(new Event("input",{bubbles:!0})),i({success:!0,message:`\u5DF2\u9009\u62E9: ${c}`,triggerTag:"SELECT"});return}}i({success:!1,error:`\u5728 <select> \u4E2D\u672A\u627E\u5230\u5339\u914D\u7684\u9009\u9879: "${t}"`,availableOptions:Array.from(u).map(h=>h.textContent?.trim()).filter(Boolean)});return}n.click(),await new Promise(u=>setTimeout(u,300));let l=Date.now(),s=r?document.querySelector(r):document,a=null;for(;Date.now()-l<o;){let u=s.querySelectorAll('li, [role="option"], [role="menuitem"], .option, .dropdown-item, .select-item, [data-value], div');for(let h of u){let d=(h.textContent||"").trim();if(!(d.length<2)&&(d===t||d.includes(t)||d.replace(/\s+/g,"")===t.replace(/\s+/g,""))){a=h;break}}if(a)break;await new Promise(h=>setTimeout(h,100))}if(!a){i({success:!1,error:`\u5728 ${o}ms \u5185\u672A\u627E\u5230\u5339\u914D\u9009\u9879: "${t}"`});return}a.click(),i({success:!0,message:`\u5DF2\u9009\u62E9: ${a.textContent?.trim()}`,triggerTag:n.tagName})}catch(n){i({success:!1,error:n.message})}})}function Rt({action:e,storage:t,key:r,value:o}){try{let i=t==="session"?sessionStorage:localStorage;switch(e){case"get":if(!r){let l={};for(let s=0;s<i.length;s++){let a=i.key(s);l[a]=i.getItem(a)}return{success:!0,content:JSON.stringify(l),data:l}}let n=i.getItem(r);return{success:!0,content:JSON.stringify({key:r,value:n}),value:n};case"set":return!r||o===void 0?{success:!1,error:"set\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bkey\u548Cvalue"}:(i.setItem(r,o),{success:!0,message:`\u5DF2\u8BBE\u7F6E ${r}`});case"remove":return r?(i.removeItem(r),{success:!0,message:`\u5DF2\u5220\u9664 ${r}`}):{success:!1,error:"remove\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bkey"};case"clear":return i.clear(),{success:!0,message:"\u5DF2\u6E05\u7A7A\u5B58\u50A8"};default:return{success:!1,error:`\u672A\u77E5\u64CD\u4F5C: ${e}`}}}catch(i){return{success:!1,error:i.message}}}function Mt(){return new Promise((e,t)=>{if(!("EyeDropper"in window)){e({success:!1,error:"\u60A8\u7684\u6D4F\u89C8\u5668\u4E0D\u652F\u6301 EyeDropper API"});return}new EyeDropper().open().then(r=>{e({success:!0,color:r.sRGBHex,message:`\u5DF2\u53D6\u8272: ${r.sRGBHex}`})}).catch(r=>{r.name==="AbortError"?e({success:!1,error:"\u7528\u6237\u53D6\u6D88\u4E86\u53D6\u8272"}):e({success:!1,error:r.message})})})}function Nt(e,t="zh-CN",r=1,o=1){try{if(!("speechSynthesis"in window))return{success:!1,error:"\u60A8\u7684\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u8BED\u97F3\u5408\u6210"};ne&&speechSynthesis.cancel();let i=new SpeechSynthesisUtterance(e);return i.lang=t,i.rate=r,i.pitch=o,ne=i,new Promise(n=>{i.onend=()=>{ne=null,n({success:!0,message:"\u6717\u8BFB\u5B8C\u6210"})},i.onerror=l=>{ne=null,n({success:!1,error:l.error})},speechSynthesis.speak(i),n({success:!0,message:"\u5F00\u59CB\u6717\u8BFB..."})})}catch(i){return{success:!1,error:i.message}}}function _t(e,t=null,r=null){try{let o=t?document.querySelector(t):document.querySelector("video, audio");if(!o)return{success:!1,error:"\u672A\u627E\u5230\u89C6\u9891/\u97F3\u9891\u5143\u7D20"};switch(e){case"play":return o.play(),{success:!0,message:"\u5DF2\u64AD\u653E"};case"pause":return o.pause(),{success:!0,message:"\u5DF2\u6682\u505C"};case"toggle":return o.paused?(o.play(),{success:!0,message:"\u5DF2\u64AD\u653E"}):(o.pause(),{success:!0,message:"\u5DF2\u6682\u505C"});case"stop":return o.pause(),o.currentTime=0,{success:!0,message:"\u5DF2\u505C\u6B62"};case"seek":return r===null?{success:!1,error:"seek\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bvalue\u53C2\u6570"}:(o.currentTime=r,{success:!0,message:`\u5DF2\u8DF3\u8F6C\u5230 ${r} \u79D2`});case"volume":return r===null?{success:!1,error:"volume\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bvalue\u53C2\u6570"}:(o.volume=Math.max(0,Math.min(1,r)),{success:!0,message:`\u97F3\u91CF\u5DF2\u8BBE\u7F6E\u4E3A ${Math.round(r*100)}%`});case"mute":return o.muted=!o.muted,{success:!0,message:o.muted?"\u5DF2\u9759\u97F3":"\u5DF2\u53D6\u6D88\u9759\u97F3"};case"speed":return r===null?{success:!1,error:"speed\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bvalue\u53C2\u6570"}:(o.playbackRate=Math.max(.1,Math.min(10,r)),{success:!0,message:`\u64AD\u653E\u901F\u5EA6\u5DF2\u8BBE\u7F6E\u4E3A ${r}x`});case"fullscreen":return o.requestFullscreen?o.requestFullscreen():o.webkitRequestFullscreen?o.webkitRequestFullscreen():o.mozRequestFullScreen&&o.mozRequestFullScreen(),{success:!0,message:"\u5DF2\u8FDB\u5165\u5168\u5C4F"};default:return{success:!1,error:`\u672A\u77E5\u64CD\u4F5C: ${e}`}}}catch(o){return{success:!1,error:o.message}}}function It(e,t){try{let r=document.createElement("canvas");r.width=t,r.height=t;let o=r.getContext("2d");o.fillStyle="#FFFFFF",o.fillRect(0,0,t,t);let i=[];for(let d=0;d<e.length;d++)i.push(e.charCodeAt(d));let n=Math.max(2,Math.floor(t/41)),l=Math.floor(t/n),s=Math.floor((t-l*n)/2);o.fillStyle="#000000";let a=(d,c)=>{let p=7*n;o.fillRect(d,c,p,p),o.fillStyle="#FFFFFF",o.fillRect(d+n,c+n,p-2*n,p-2*n),o.fillStyle="#000000",o.fillRect(d+2*n,c+2*n,p-4*n,p-4*n),o.fillStyle="#000000"};a(s,s),a(s+(l-7)*n,s),a(s,s+(l-7)*n);let u=0;for(let d=0;d<e.length;d++)u=(u<<5)-u+e.charCodeAt(d),u|=0;let h=d=>{let c=d+1831565813;return c=Math.imul(c^c>>>15,c|1),c^=c+Math.imul(c^c>>>7,c|61),((c^c>>>14)>>>0)/4294967296};for(let d=0;d<l;d++)for(let c=0;c<l;c++){let p=d<8&&c<8,m=d<8&&c>=l-8,f=d>=l-8&&c<8;p||m||f||h(u+d*l+c)>.5&&o.fillRect(s+c*n,s+d*n,n,n)}return r.toDataURL("image/png")}catch{return null}}function Ot(e="",t=200,r="M",o=!0){return new Promise(i=>{try{let n=e||window.location.href,l=document.createElement("div");l.id="ai-helper-qrcode",l.style.cssText=`
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
      `;let s=document.createElement("canvas");s.width=t,s.height=t,l.appendChild(s);let a=document.createElement("p");a.textContent=n.length>50?n.substring(0,50)+"...":n,a.style.cssText="margin-top: 12px; font-size: 12px; color: #666; word-break: break-all; max-width: 200px;",l.appendChild(a);let u=document.createElement("button");if(u.textContent="\u5173\u95ED",u.style.cssText=`
        margin-top: 12px;
        padding: 6px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
      `,u.onclick=()=>{document.body.removeChild(l)},l.appendChild(u),typeof QRCode>"u"){let h=It(n,t);if(h){let d=document.createElement("img");d.src=h,d.width=t,d.height=t,s.replaceWith(d),o&&document.body.appendChild(l),i({success:!0,content:n,size:t,dataUrl:h,shown:o,fallback:!0,warning:"QRCode \u5E93\u672A\u52A0\u8F7D\uFF0C\u5DF2\u4F7F\u7528 SVG \u964D\u7EA7\u65B9\u6848\u751F\u6210"})}else i({success:!1,error:"\u4E8C\u7EF4\u7801\u5E93\u672A\u52A0\u8F7D\u4E14\u964D\u7EA7\u65B9\u6848\u4E0D\u53EF\u7528"});return}QRCode.toCanvas(s,n,{width:t,margin:2,color:{dark:"#000000",light:"#ffffff"},errorCorrectionLevel:r.toLowerCase()},h=>{h?i({success:!1,error:h.message}):(o&&document.body.appendChild(l),i({success:!0,content:n,size:t,dataUrl:s.toDataURL("image/png"),shown:o}))})}catch(n){i({success:!1,error:n.message})}})}function $t(e,t=!0,r=5,o=50){try{let i=[],n=(l,s=0)=>{if(!(s>r||i.length>=o))try{l.querySelector&&l.querySelectorAll(e).forEach(a=>{i.length>=o||i.push({tag:a.tagName.toLowerCase(),id:a.id,className:a.className,textContent:a.textContent?.substring(0,200),selector:getElementSelector(a),depth:s})}),t&&l.querySelectorAll("*").forEach(a=>{a.shadowRoot&&n(a.shadowRoot,s+1)})}catch{}};return n(document),{success:!0,selector:e,total:i.length,elements:i.slice(0,o)}}catch(i){return{success:!1,error:i.message}}}function qt(e,t=null,r="style"){try{if(!e||typeof e!="string")return{success:!1,error:"css \u53C2\u6570\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32"};if(r!=="style"&&r!=="inline")return{success:!1,error:`\u4E0D\u652F\u6301\u7684 injectMode: ${r}\uFF0C\u652F\u6301 'style' \u6216 'inline'`};if(r==="style")if(t){let o=document.querySelectorAll(t),i=`ai-helper-scoped-style-${Date.now()}`,n="",l=e.split("}");for(let a of l){let u=a.trim();if(!u)continue;let h=u.indexOf("{");if(h===-1)continue;let d=u.substring(0,h).trim(),c=u.substring(h+1).trim();n+=`#${i} ${d} { ${c} } `}o.forEach(a=>{a.setAttribute("id",i)});let s=document.createElement("style");return s.setAttribute("data-ai-helper","scoped"),s.textContent=n,document.head.appendChild(s),{success:!0,injectMode:"style",scoped:!0,selector:t,hitCount:o.length}}else{let o=document.createElement("style");return o.setAttribute("data-ai-helper","global"),o.textContent=e,document.head.appendChild(o),{success:!0,injectMode:"style",scoped:!1,hitCount:0}}if(r==="inline"){let o=t?document.querySelectorAll(t):document.querySelectorAll("*"),i=0,n={};return e.split(";").forEach(l=>{let s=l.indexOf(":");if(s===-1)return;let a=l.substring(0,s).trim(),u=l.substring(s+1).trim();a&&u&&(n[a]=u)}),o.forEach(l=>{if(l.nodeType===1){for(let[s,a]of Object.entries(n))try{l.style.setProperty(s,a)}catch{}i++}}),{success:!0,injectMode:"inline",selector:t||"*",hitCount:i}}}catch(o){return{success:!1,error:o.message}}}function Dt(){if(document.getElementById("aih-selection-toolbar-styles"))return;let e=document.createElement("style");e.id="aih-selection-toolbar-styles",e.textContent=`
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

    /* \u6EA2\u51FA\u4E0B\u62C9\u83DC\u5355 */
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

    /* \u4E0B\u62C9\u83DC\u5355\u5206\u9694\u7EBF */
    .aih-overflow-dropdown .aih-dropdown-divider {
      height: 1px;
      background: #e8e8e8;
      margin: 4px 8px;
    }
    /* \u4E0B\u62C9\u83DC\u5355\u8BBE\u7F6E\u6309\u94AE */
    .aih-overflow-dropdown .aih-dropdown-settings {
      color: #555;
    }
    .aih-overflow-dropdown .aih-dropdown-settings:hover {
      background: #f0f0f0;
      color: #667eea;
    }

    /* \u95EE\u95EEAI \u5185\u8054\u8F93\u5165\u6846 */
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
    /* ask \u6A21\u5F0F\uFF1A\u5DE5\u5177\u680F\u5BBD\u5EA6\u9650\u5236 360px\uFF0C\u8F93\u5165\u6846\u6491\u6EE1 */
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

    /* \u7ED3\u679C\u9762\u677F */
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
    /* \u63A8\u8350\u8FFD\u95EE */
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
    /* \u8FFD\u95EE\u8F93\u5165\u6846 */
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
  `,document.head.appendChild(e)}var v={search:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',explain:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>',translate:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',summary:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>',copy:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',close:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',sparkle:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',lock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',unlock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',copyLarge:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',grip:'<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>',send:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',more:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',gear:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',refresh:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',block:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',eyeOff:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'},g=null,y=null,M=!1,A=!1,ie="",Y=null,J="",O=!1,D=!1,P="",de="",be="",xe="",x="",Z=!0,W=[],Re=!1,he=!1,H={x:0,y:0},B=null,R=null,Te=5,Ee=!1,w=null,F="",me=new Set,L=window.top===window;if(!L)try{window.parent===window.top&&window.top.document.querySelector("frameset")&&(L=!0)}catch{}k.debug("[SelectionToolbar] \u6A21\u5757\u52A0\u8F7D isTopFrame:",L,"top===window:",window.top===window,"hasBody:",!!document.body,"parent===top:",window.parent===window.top);var T=null;function I(e){(document.body||document.documentElement).appendChild(e)}var C=null;function Me(e,t){let r=t?e.querySelector(t):e;r&&(r.style.cursor="grab",r.addEventListener("mousedown",o=>{if(o.target.closest('[role="button"]')||o.button!==0)return;o.preventDefault(),o.stopPropagation();let i=e.getBoundingClientRect();C={el:e,startX:o.clientX,startY:o.clientY,startLeft:i.left,startTop:i.top,pointerId:o.pointerId||0},r.style.cursor="grabbing",e.style.transition="none"}))}document.addEventListener("mousemove",e=>{if(!C)return;let t=e.clientX-C.startX,r=e.clientY-C.startY,o=C.startLeft+t,i=C.startTop+r,n=window.innerWidth,l=window.innerHeight,s=C.el.getBoundingClientRect();o=Math.max(0,Math.min(o,n-s.width)),i=Math.max(0,Math.min(i,l-s.height)),C.el.style.left=o+"px",C.el.style.top=i+"px"}),document.addEventListener("mouseup",()=>{if(!C)return;C.el.style.transition="";let e=C.el.querySelector(".aih-result-header")||C.el;e.style.cursor="grab",C=null});function $(){try{return typeof chrome!="object"||!chrome||typeof chrome.runtime!="object"||!chrome.runtime?!1:!!chrome.runtime.id}catch{return!1}}var oe=[{id:"ai-search",name:"AI\u641C\u7D22",systemPrompt:"\u4F7F\u7528ReAct Agent\u6A21\u5F0F\uFF0C\u901A\u8FC7\u591A\u8F6E\u601D\u8003\u3001\u641C\u7D22\u548C\u63A8\u7406\u6765\u56DE\u7B54\u9009\u4E2D\u7684\u95EE\u9898\u3002",builtin:!0,order:0},{id:"explain",name:"\u89E3\u91CA",systemPrompt:"\u5BF9\u9009\u4E2D\u7684\u5185\u5BB9\u8FDB\u884C\u89E3\u91CA\u8BF4\u660E\uFF0C\u5E2E\u52A9\u7406\u89E3\u5176\u542B\u4E49\u3002",builtin:!0,order:1},{id:"translate",name:"\u7FFB\u8BD1",systemPrompt:"\u5C06\u9009\u4E2D\u7684\u5185\u5BB9\u7FFB\u8BD1\u6210\u4E2D\u6587\u3002",builtin:!0,order:2},{id:"summary",name:"\u603B\u7ED3",systemPrompt:"\u5BF9\u9009\u4E2D\u7684\u5185\u5BB9\u8FDB\u884C\u5F52\u7EB3\u603B\u7ED3\uFF0C\u63D0\u70BC\u5173\u952E\u8981\u70B9\u3002",builtin:!0,order:3},{id:"copy",name:"\u590D\u5236",systemPrompt:"\u5C06\u9009\u4E2D\u5185\u5BB9\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",builtin:!0,order:99}];function Ne(){return new Promise(e=>{if(!$()){R=[...oe],e(R);return}if(R){e(R);return}try{chrome.storage.local.get(["toolbarTools","toolbarIconOnly"],t=>{let r=t.toolbarTools&&t.toolbarTools.length>0?t.toolbarTools:oe,o=new Map(oe.map(i=>[i.id,i]));R=r.map(i=>i.builtin&&o.has(i.id)?{...i,systemPrompt:o.get(i.id).systemPrompt}:i),Ee=t.toolbarIconOnly||!1,e(R)})}catch{R=[...oe],e(R)}})}function Pt(){R=null,Ee=!1,Ne()}function _e(e){return{"ai-search":v.search,explain:v.explain,translate:v.translate,summary:v.summary,copy:v.copy}[e]||v.sparkle}function Bt(){w||(w=document.createElement("div"),w.id="aih-overflow-dropdown",w.className="aih-overflow-dropdown",w.style.display="none",I(w),document.addEventListener("click",e=>{w&&w.style.display==="block"&&!w.contains(e.target)&&!e.target.closest(".aih-tb-btn-overflow")&&(w.style.display="none")}))}function Ft(e){w||Bt();let t=e.map(r=>{let o=_e(r.id);return`<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${r.id}">
      <span class="aih-tb-icon">${o}</span>${r.name}
    </div>`}).join("");t+='<div class="aih-dropdown-divider"></div>',t+=`<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="\u6253\u5F00\u914D\u7F6E\u9875\u9762">
    <span class="aih-tb-icon">${v.gear}</span>\u8BBE\u7F6E
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="\u6682\u65F6\u9690\u85CF\u76F4\u5230\u9875\u9762\u5237\u65B0">
    <span class="aih-tb-icon">${v.eyeOff}</span>\u672C\u6B21\u4E34\u65F6\u7981\u7528
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="\u5728\u6B64\u7F51\u7AD9\u7981\u7528\u5DE5\u5177\u680F">
    <span class="aih-tb-icon">${v.block}</span>\u5728\u6B64\u7F51\u7AD9\u7981\u7528
  </div>`,w.innerHTML=t,w._clickHandler=r=>{if(r.target.closest(".aih-dropdown-settings")){r.stopPropagation(),w.style.display="none";try{chrome.runtime.sendMessage({type:"OPEN_OPTIONS_PAGE",hash:"toolbar"}).catch(()=>{})}catch{}return}if(r.target.closest(".aih-dropdown-block")){r.stopPropagation(),r.preventDefault(),w.style.display="none",Zt();return}if(r.target.closest(".aih-dropdown-hide")){r.stopPropagation(),r.preventDefault(),w.style.display="none",Re=!0,S(),z(),x="";return}let o=r.target.closest("[data-action]");o&&(r.stopPropagation(),w.style.display="none",qe(o.dataset.action,x))},w.addEventListener("click",w._clickHandler),w.addEventListener("keydown",r=>{if(r.key==="Enter"||r.key===" "){let o=r.target.closest('[role="button"]');o&&(r.preventDefault(),o.click())}})}async function Ht(){if(g)return;await Ne();let e=[...R].sort((c,p)=>c.order-p.order),t=e.find(c=>c.id==="ai-search"),r=e.filter(c=>c.id!=="ai-search"&&c.id!=="copy"),o=r.slice(0,Te-1),i=r.slice(Te-1);g=document.createElement("div"),g.id="aih-selection-toolbar";let n='<span class="aih-tb-buttons">';n+=`<span class="aih-tb-grip" title="\u62D6\u62FD\u79FB\u52A8">${v.grip}</span>`;let l=Ee;t&&(n+=`<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="AI \u641C\u7D22">
      <span class="aih-tb-icon">${v.search}</span>${l?"":"AI\u641C\u7D22"}
    </div>`),o.forEach(c=>{let p=_e(c.id);n+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="${c.id}" title="${c.name}">
      <span class="aih-tb-icon">${p}</span>${l?"":c.name}
    </div>`}),n+=`<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="\u66F4\u591A\u5DE5\u5177">
    <span class="aih-tb-icon">${v.more}</span>
  </div>`,Ft(i),n+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="\u590D\u5236\u9009\u4E2D\u5185\u5BB9">
    <span class="aih-tb-icon">${v.copy}</span>${l?"":"\u590D\u5236"}
  </div>`,n+="</span>",n+=`<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="\u95EE\u95EE..." />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="\u53D1\u9001">
      <span class="aih-tb-icon">${v.send}</span>
    </div>
  </span>`,g.innerHTML=n,g.addEventListener("click",c=>{if(c.target.closest(".aih-tb-btn-overflow")){c.stopPropagation();let f=c.target.closest(".aih-tb-btn-overflow").getBoundingClientRect();w&&(w.style.display=w.style.display==="block"?"none":"block",w.style.top=f.bottom+4+"px",w.style.left=f.right-160+"px");return}let p=c.target.closest("[data-action]");if(!p)return;c.stopPropagation();let m=p.dataset.action;qe(m,x)}),g.addEventListener("keydown",c=>{if(c.key==="Enter"||c.key===" "){let p=c.target.closest('[role="button"]');p&&!p.classList.contains("aih-tb-ask-send")&&(c.preventDefault(),p.click())}}),I(g);let s=g.querySelector(".aih-tb-ask-input"),a=g.querySelector(".aih-tb-ask-send");g.querySelector(".aih-tb-buttons");let u=()=>{let c=s.value.trim();if(c){let p=ie;d(),s.value="",Gt(c,p),S()}},h=()=>{if(A)return;A=!0,ie=x||"";let c=window.getSelection();c.rangeCount>0&&(Y=c.getRangeAt(0).cloneRange());let p=g.getBoundingClientRect().right;J=g.style.left,g.classList.add("aih-ask-mode"),g.style.width="360px";let m=Math.max(8,p-360);g.style.left=m+"px",requestAnimationFrame(()=>{if(Y){let f=window.getSelection();f.removeAllRanges(),f.addRange(Y)}requestAnimationFrame(()=>{s.focus()})})},d=()=>{A&&(A=!1,ie="",Y=null,g.classList.remove("aih-ask-mode"),g.style.width="",J&&=(g.style.left=J,""))};s.addEventListener("focus",()=>{A||h()}),s.addEventListener("mousedown",c=>{A||(c.preventDefault(),h())}),s.addEventListener("blur",()=>{setTimeout(()=>{A&&!g.contains(document.activeElement)&&(d(),S())},150)}),s.addEventListener("keydown",c=>{c.key==="Escape"?(c.preventDefault(),c.stopPropagation(),d(),s.blur()):c.key==="Enter"&&(c.preventDefault(),c.stopPropagation(),u())}),a.addEventListener("mousedown",c=>{c.preventDefault(),c.stopPropagation(),u()}),Me(g,".aih-tb-grip")}function Ie(){if(y)return;y=document.createElement("div"),y.id="aih-selection-result",y.innerHTML=`
    <div class="aih-result-header">
      <span>${v.sparkle} AI \u56DE\u7B54</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="\u9501\u5B9A\u7A97\u53E3">${v.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="\u5173\u95ED">${v.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="\u590D\u5236\u5168\u90E8\u5185\u5BB9">
          <span class="aih-tb-icon">${v.copyLarge}</span>\u590D\u5236
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="\u91CD\u65B0\u751F\u6210\u7B54\u6848">
          <span class="aih-tb-icon">${v.refresh}</span>\u91CD\u65B0\u751F\u6210
        </div>
      </div>
      <div class="aih-result-suggestions" style="display:none;">
        <div class="aih-suggestions-label">\u{1F4A1} \u63A8\u8350\u8FFD\u95EE</div>
        <div class="aih-suggestions-list"></div>
      </div>
    </div>
    <div class="aih-result-followup">
      <span class="aih-followup-wrap">
        <input type="text" class="aih-followup-input" placeholder="\u7EE7\u7EED\u63D0\u95EE..." />
        <div class="aih-followup-send" role="button" tabindex="0" title="\u53D1\u9001\u5230\u4FA7\u8FB9\u680F">${v.send}</div>
      </span>
    </div>
  `,y.querySelector(".aih-result-close").addEventListener("click",t=>{t.stopPropagation(),z()}),y.querySelector(".aih-result-lock").addEventListener("click",t=>{t.stopPropagation(),zt()}),y.querySelector(".aih-result-footer").addEventListener("click",t=>{t.stopPropagation();let r=t.target.closest("[data-action]")?.dataset?.action;if(r==="regenerate-result"){if(!be||!de)return;we(be,de,xe)}else r==="copy-result"&&Qt()});let e=y.querySelector(".aih-followup-input");y.querySelector(".aih-followup-send").addEventListener("click",t=>{t.stopPropagation();let r=e.value.trim();r&&(fe(r),e.value="")}),e.addEventListener("keydown",t=>{if(t.key==="Enter"){t.preventDefault();let r=e.value.trim();r&&(fe(r),e.value="")}}),y.querySelector(".aih-suggestions-list").addEventListener("click",t=>{let r=t.target.closest(".aih-suggestion-chip");if(!r)return;t.stopPropagation();let o=r.dataset.question;o&&fe(o)}),y.addEventListener("keydown",t=>{if(t.key==="Enter"||t.key===" "){let r=t.target.closest('[role="button"]');r&&(t.preventDefault(),r.click())}}),I(y),Me(y,".aih-result-header")}function Ae(e,t,r,o=[]){if(!y)return;I(y);let i=window.innerWidth,n=window.innerHeight;y.style.display="flex",y.style.left="-9999px",y.style.top="-9999px";let l=y.querySelector(".aih-result-body");l.innerHTML=r;let s=y.querySelector(".aih-result-suggestions"),a=y.querySelector(".aih-suggestions-list");o.length>0&&s&&a?(a.innerHTML=o.map(u=>`<div class="aih-suggestion-chip" role="button" tabindex="0" data-question="${U(u)}">${U(u)}</div>`).join(""),s.style.display="block"):s&&(s.style.display="none"),requestAnimationFrame(()=>{let u=y.getBoundingClientRect(),h=u.width||420,d=Math.min(u.height||200,520),c=e-h/2;c<8&&(c=8),c+h>i-8&&(c=i-h-8);let p=t-d-8;p<8&&(p=t+8),y.style.left=c+"px",y.style.top=p+"px",y.style.maxHeight=Math.min(520,n-p-16)+"px",O=!0,I(y)})}function jt(e,t){if(!y)return;H={x:e,y:t},D=!1,pe();let r=y.querySelector(".aih-result-suggestions");r&&(r.style.display="none");let o=y.querySelector(".aih-followup-input");o&&(o.value=""),I(y),y.style.display="flex";let i=y.querySelector(".aih-result-body");i.innerHTML='<div class="aih-result-loading"><div class="aih-spinner"></div>AI \u6B63\u5728\u601D\u8003...</div>',$e(y,e,t),O=!0,S()}function Oe(e,t,r){if(!y)return;D=!1,P="",pe(),I(y),y.style.display="flex";let o=y.querySelector(".aih-result-body");o.innerHTML=`<div class="aih-result-error">\u8BF7\u6C42\u5931\u8D25: ${U(r)}</div>`,$e(y,e,t),O=!0}function $e(e,t,r){let o=window.innerWidth,i=window.innerHeight;e.style.left="-9999px",e.style.top="-9999px",requestAnimationFrame(()=>{let n=e.getBoundingClientRect(),l=n.width||420,s=Math.min(n.height||200,520),a=t-l/2;a<8&&(a=8),a+l>o-8&&(a=o-l-8);let u=r-s-8;u<8&&(u=r+8),e.style.left=a+"px",e.style.top=u+"px",e.style.maxHeight=Math.min(520,i-u-16)+"px",I(e)})}function z(){y&&(y.style.display="none",O=!1,D=!1,P="",pe())}function zt(){D=!D,pe()}function pe(){if(!y)return;let e=y.querySelector(".aih-result-lock");e&&(D?(e.innerHTML=v.lock,e.classList.add("locked"),e.title="\u89E3\u9664\u9501\u5B9A"):(e.innerHTML=v.unlock,e.classList.remove("locked"),e.title="\u9501\u5B9A\u7A97\u53E3"))}function fe(e){if(!e||!$())return;let t=x||de||"";try{chrome.runtime.sendMessage({type:"DIRECT_SEND",text:e,selectedText:t}).catch(r=>{k.error("[SelectionToolbar] \u53D1\u9001\u8FFD\u95EE\u5230\u4FA7\u8FB9\u680F\u5931\u8D25:",r)})}catch{}}function Gt(e,t){if(!(!e||!$()))try{chrome.runtime.sendMessage({type:"DIRECT_SEND",text:e,selectedText:t||""}).catch(r=>{k.error("[SelectionToolbar] \u53D1\u9001\u5230\u4FA7\u8FB9\u680F\u5931\u8D25:",r)})}catch{}}function U(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function ee(e,t){if(!g||!x||O)return;I(g);let r=window.innerWidth,o=window.innerHeight;g.style.display="flex",lastToolbarShowTime=Date.now(),requestAnimationFrame(()=>{let i=g.getBoundingClientRect(),n=i.width||300,l=i.height||40,s=e-n/2;s<8&&(s=8),s+n>r-8&&(s=r-n-8);let a=t-l-10;a<8&&(a=t+10),a<8&&(a=8),a+l>o-8&&(a=o-l-8),g.style.left=s+"px",g.style.top=a+"px",M||=(g.classList.add("show"),!0)})}function S(){!g||!M||(A&&(A=!1,ie="",Y=null,g.classList.remove("aih-ask-mode"),g.style.width="",J&&=(g.style.left=J,"")),g.classList.remove("show"),g.style.display="none",M=!1)}function Ut(){if(!g)return{x:0,y:0};let e=g.getBoundingClientRect();return{x:e.left+e.width/2,y:e.top}}function Wt(e){let t=e.getBoundingClientRect();return{x:t.left+t.width/2,y:t.top}}function ge(){if(!$()||!Z)return;if(!L){let n=j();if(k.debug("[SelectionToolbar] iframe onSelectionChange text:",n.text?.substring(0,30),"currentSelectedText:",!!x,"pendingIframeSelection:",!!T),n.text&&n.text.length>=2){let l=ae(n.range);T={text:n.text,x:l.x,y:l.y},k.debug("[SelectionToolbar] iframe pendingIframeSelection \u5DF2\u8BBE\u7F6E")}else if(x){x="",T=null;try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION_CLEAR"}).catch(()=>{})}catch{}}return}if(W.length>0&&W.includes(window.location.hostname)||Re)return;let e=window.getSelection(),t=e?e.toString().trim():"",r=null;if(t&&t.length>=2&&e.rangeCount>0)r=e.getRangeAt(0);else{let n=j();n.text&&n.text.length>=2&&(t=n.text,r=n.range)}if(!t||t.length<2){A||S(),x="",B=null;return}let o=5e3,i=t.length>o?t.substring(0,o)+"...":t;if(r){let n=r.commonAncestorContainer,l=n.nodeType===Node.TEXT_NODE?n.parentElement.closest("[contenteditable], input, textarea"):n.closest&&n.closest("[contenteditable], input, textarea");if(l instanceof HTMLElement&&(l.tagName==="INPUT"||l.tagName==="TEXTAREA")){S(),x="",B=null;return}}x=i,B=!0}function Kt(e){if(!(g&&g.contains(e.target))&&!(y&&y.contains(e.target))){if(he){he=!1;return}O&&!D&&z(),M&&!A&&S(),chrome.runtime.sendMessage({type:"IFRAME_CLICK_DISMISS"}).catch(()=>{})}}function Xt(){if(k.debug("[SelectionToolbar] onMouseUp isTopFrame:",L,"pendingSelection:",B,"pendingIframeSelection:",!!T,"currentSelectedText:",!!x,"isToolbarVisible:",M,"toolbarEl:",!!g),!L){if(T){he=!0,T.text,x=T.text;try{window.parent.postMessage({type:"IFRAME_SELECTION",text:T.text,x:T.x,y:T.y},"*")}catch{}try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION",text:T.text,x:T.x,y:T.y}).catch(()=>{})}catch{}T=null}return}if(!M&&B&&x){he=!0;let e=window.innerWidth/2,t=window.innerHeight/2,r=window.getSelection();if(r&&r.rangeCount>0){let o=r.getRangeAt(0).getBoundingClientRect();(o.width>0||o.height>0)&&(e=o.left+o.width/2,t=o.top)}if(e===window.innerWidth/2&&t===window.innerHeight/2){let o=j();if(o.text&&o.text.length>=2){let i=ae(o.range);e=i.x,t=i.y}}chrome.runtime.sendMessage({type:"IFRAME_CLICK_DISMISS"}).catch(()=>{}),ee(e,t),B=null}}function Yt(){if(A)return;if(!L&&x){let r=j();if(r.text){let o=ae(r.range);try{window.parent.postMessage({type:"IFRAME_SELECTION",text:r.text,x:o.x,y:o.y},"*")}catch{}try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION",text:r.text,x:o.x,y:o.y}).catch(()=>{})}catch{}}return}if(!M)return;let e=window.getSelection();if(e&&e.rangeCount>0&&x){let r=e.getRangeAt(0).getBoundingClientRect();if(r.width>0||r.height>0){ee(r.left+r.width/2,r.top);return}}let t=j();if(t.text&&t.text.length>=2&&x){let r=ae(t.range);ee(r.x,r.y);return}S()}function Vt(){A||M&&S()}function qe(e,t){if(!t)return;if(de=t,e==="copy"){Jt(t),S();return}if(be=e,xe="",["ai-search","explain","translate","summary"].includes(e)){we(e,t);return}let r=R.find(o=>o.id===e);r&&(xe=r.systemPrompt||"",we(e,t,r.systemPrompt))}function Jt(e){De(e).then(()=>{Be()}).catch(t=>{k.error("[SelectionToolbar] \u590D\u5236\u5931\u8D25:",t),Pe()})}function Qt(){let e=P;e&&De(e).then(()=>{Be()}).catch(t=>{k.error("[SelectionToolbar] \u590D\u5236\u7ED3\u679C\u5931\u8D25:",t),Pe()})}async function De(e){if(!navigator.clipboard)return Le(e);try{await navigator.clipboard.writeText(e)}catch(t){if(t.name==="NotAllowedError"||t.name==="SecurityError")return Le(e);throw t}}function Le(e){return new Promise((t,r)=>{let o=document.createElement("textarea");o.value=e,o.style.position="fixed",o.style.left="-9999px",o.style.opacity="0",I(o);try{o.select(),o.setSelectionRange(0,e.length),document.execCommand("copy")?t():r(Error("execCommand copy failed"))}catch(i){r(i)}finally{o.remove()}})}function Pe(){let e=document.getElementById("aih-copy-toast");e&&e.remove();let t=document.createElement("div");t.id="aih-copy-toast",t.textContent="\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236",t.style.cssText=`
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
  `,I(t),t.style.zIndex="2147483647",setTimeout(()=>t.remove(),1800)}function Be(){let e=document.getElementById("aih-copy-toast");e&&e.remove();let t=document.createElement("div");if(t.id="aih-copy-toast",t.textContent="\u5DF2\u590D\u5236",t.style.cssText=`
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
  `,!document.getElementById("aih-toast-anim")){let r=document.createElement("style");r.id="aih-toast-anim",r.textContent=`
      @keyframes aih-toast-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      @keyframes aih-toast-out { from { opacity: 1; } to { opacity: 0; } }
    `,document.head.appendChild(r)}I(t),t.style.zIndex="2147483647",setTimeout(()=>t.remove(),1300)}function we(e,t,r){if(!$()){k.warn("[SelectionToolbar] \u6269\u5C55\u4E0A\u4E0B\u6587\u5DF2\u5931\u6548\uFF0C\u8BF7\u5237\u65B0\u9875\u9762");return}let o={"ai-search":`\u641C\u7D22\u5E76\u5206\u6790\u4EE5\u4E0B\u5185\u5BB9\uFF1A

${t}`,explain:`\u75281-3\u53E5\u8BDD\u7B80\u6D01\u89E3\u91CA\u4EE5\u4E0B\u5185\u5BB9\uFF0C\u4E0D\u9700\u8981\u5C55\u5F00\u8BF4\u660E\u3002

${t}

---
\u56DE\u7B54\u5B8C\u6BD5\u540E\uFF0C\u8BF7\u5728\u6700\u540E\u53E6\u8D77\u4E00\u884C\uFF0C\u4E25\u683C\u6309\u4EE5\u4E0B\u683C\u5F0F\u63D0\u4F9B3\u4E2A\u7528\u6237\u53EF\u80FD\u8FFD\u95EE\u7684\u95EE\u9898\uFF1A
---SUGGESTIONS---
\u95EE\u98981
\u95EE\u98982
\u95EE\u98983`,translate:`\u7FFB\u8BD1\u4EE5\u4E0B\u5185\u5BB9\uFF0C\u53EA\u8F93\u51FA\u7FFB\u8BD1\u7ED3\u679C\uFF1A

${t}`,summary:`\u75283-5\u4E2A\u8981\u70B9\u603B\u7ED3\u4EE5\u4E0B\u5185\u5BB9\uFF0C\u6BCF\u6761\u8981\u70B9\u4E00\u53E5\u8BDD\u3002

${t}

---
\u56DE\u7B54\u5B8C\u6BD5\u540E\uFF0C\u8BF7\u5728\u6700\u540E\u53E6\u8D77\u4E00\u884C\uFF0C\u4E25\u683C\u6309\u4EE5\u4E0B\u683C\u5F0F\u63D0\u4F9B3\u4E2A\u7528\u6237\u53EF\u80FD\u8FFD\u95EE\u7684\u95EE\u9898\uFF1A
---SUGGESTIONS---
\u95EE\u98981
\u95EE\u98982
\u95EE\u98983`},i=r?`\u8BF7\u5904\u7406\u4EE5\u4E0B\u5185\u5BB9\uFF1A

${t}`:o[e]||t;if(e==="ai-search"){S(),window.getSelection().removeAllRanges();try{chrome.runtime.sendMessage({type:"SELECTION_TOOLBAR_ACTION",action:e,text:t,prompt:i}).catch(a=>{k.error("[SelectionToolbar] \u53D1\u9001\u6D88\u606F\u5931\u8D25:",a)})}catch{}return}Ie();let n={"ai-search":"AI\u641C\u7D22",explain:"\u89E3\u91CA",translate:"\u7FFB\u8BD1",summary:"\u603B\u7ED3"}[e];if(!n&&R){let a=R.find(u=>u.id===e);n=a?a.name:"AI \u56DE\u7B54"}let l=y.querySelector(".aih-result-header span");l&&(l.innerHTML=`${v.sparkle} ${n||"AI \u56DE\u7B54"}`);let s=O&&y?Wt(y):Ut();jt(s.x,s.y),chrome.runtime.sendMessage({type:"SELECTION_TOOLBAR_ACTION",action:e,text:t,prompt:i,systemPrompt:r||""}).catch(a=>{k.error("[SelectionToolbar] \u53D1\u9001\u6D88\u606F\u5931\u8D25:",a),Oe(s.x,s.y,a.message)})}$()&&chrome.runtime.onMessage.addListener((e,t,r)=>{if($()){if(e.type==="IFRAME_SELECTION"){if(!L)return;k.debug("[SelectionToolbar] \u6536\u5230 IFRAME_SELECTION text:",e.text?.substring(0,30),"isToolbarVisible:",M,"isResultVisible:",O),x=e.text;let o=e.x,i=e.y;if(window.top!==window&&window.frameElement)try{let n=window.frameElement.getBoundingClientRect();o=e.x-n.left,i=e.y-n.top}catch{}if(M&&g&&x){requestAnimationFrame(()=>{let n=window.innerWidth,l=g.offsetWidth||300,s=g.offsetHeight||40,a=o-l/2;a<8&&(a=8),a+l>n-8&&(a=n-l-8);let u=i-s-8;u<8&&(u=i+8),g.style.left=a+"px",g.style.top=u+"px"});return}B={x:o,y:i},x&&x.length>=2&&ee(o,i);return}if(e.type==="IFRAME_SELECTION_CLEAR"){if(!L)return;M&&!A&&(S(),x="");return}if(e.type==="IFRAME_CLICK_DISMISS"){M&&g&&Date.now()-lastToolbarShowTime>300&&(S(),x=""),O&&!D&&z();return}if(L){if(e.type==="SELECTION_TOOLBAR_STREAM_START"){F="";return}if(e.type==="SELECTION_TOOLBAR_STREAM_CHUNK"){if(F+=e.delta||"",y&&O){let o=y.querySelector(".aih-result-body");o&&(o.querySelector(".aih-result-content-stream")||(o.innerHTML='<div class="aih-result-content-stream"></div>'),o.innerHTML='<div class="aih-result-content-stream">'+U(F).replace(/\n/g,"<br>")+"</div>")}return}if(e.type==="SELECTION_TOOLBAR_STREAM_DONE"){e.finalContent&&(F=e.finalContent);let o=F||"\u65E0\u54CD\u5E94";P=F;let i=o,n=[],l=o.indexOf("---SUGGESTIONS---");l!==-1&&(i=o.substring(0,l).trim(),P=i,n=o.substring(l+17).split(`
`).map(a=>a.replace(/^[\d]+[\.\、\s]+/,"").trim()).filter(a=>a.length>0).slice(0,3));let s=typeof marked<"u"?marked.parse(i):U(i).replace(/\n/g,"<br>");Ae(H.x,H.y,s,n),F="";return}if(e.type==="SELECTION_TOOLBAR_RESULT")if(e.error)P="",Oe(H.x,H.y,e.error);else{let o=e.content||"\u65E0\u54CD\u5E94",i=o;P=o;let n=[],l=o.indexOf("---SUGGESTIONS---");l!==-1&&(i=o.substring(0,l).trim(),P=i,n=o.substring(l+17).split(`
`).map(a=>a.replace(/^[\d]+[\.\、\s]+/,"").trim()).filter(a=>a.length>0).slice(0,3));let s=typeof marked<"u"?marked.parse(i):U(i).replace(/\n/g,"<br>");Ae(H.x,H.y,s,n)}}}});function Zt(){if(!$())return;let e=window.location.hostname;try{chrome.storage.local.get(["blockedDomains"],t=>{try{let r=t.blockedDomains||[];r.includes(e)||(r.push(e),chrome.storage.local.set({blockedDomains:r},()=>{W=r,S(),z(),x=""}))}catch{}})}catch{}}function er(){$()&&chrome.storage.local.get(["enableSelectionToolbar","blockedDomains"],e=>{Z=e.enableSelectionToolbar===void 0?!0:!!e.enableSelectionToolbar,W=e.blockedDomains||[],k.debug("[SelectionToolbar] \u5F00\u5173\u72B6\u6001:",Z?"\u5DF2\u542F\u7528":"\u5DF2\u7981\u7528","\u5C4F\u853D\u57DF\u540D:",W.length)})}$()&&chrome.storage.onChanged.addListener((e,t)=>{$()&&(t==="local"&&e.enableSelectionToolbar&&(Z=!!e.enableSelectionToolbar.newValue,Z||(S(),z(),x="")),t==="local"&&e.blockedDomains&&(W=e.blockedDomains.newValue||[]),t==="local"&&e.toolbarTools&&Pt())});function tr(){Dt(),Ht(),Ie(),er(),document.addEventListener("selectionchange",ge),document.addEventListener("click",Kt,!0),document.addEventListener("mouseup",Xt,!0),window.addEventListener("scroll",Yt,!0),window.addEventListener("resize",Vt),window.addEventListener("message",e=>{if(e.data?.type==="IFRAME_SELECTION"&&L){x=e.data.text;let t=e.data.x,r=e.data.y;if(window.top!==window&&window.frameElement)try{let o=window.frameElement.getBoundingClientRect();t=e.data.x-o.left,r=e.data.y-o.top}catch{}if(M&&g&&x){requestAnimationFrame(()=>{let o=window.innerWidth,i=g.offsetWidth||300,n=g.offsetHeight||40,l=t-i/2;l<8&&(l=8),l+i>o-8&&(l=o-i-8);let s=r-n-8;s<8&&(s=r+8),g.style.left=l+"px",g.style.top=s+"px"});return}B={x:t,y:r},x&&x.length>=2&&ee(t,r);return}e.data?.type==="IFRAME_CLICK_DISMISS"&&L&&O&&!D&&z()}),L&&(me=ye(ge),new MutationObserver(()=>{Je(me),me=ye(ge)}).observe(document.body,{childList:!0,subtree:!0})),k.debug("[SelectionToolbar] \u521D\u59CB\u5316\u5B8C\u6210",L?"(\u9876\u5C42frame)":"(\u5B50frame)")}k.debug("[ContentScript] \u5185\u5BB9\u811A\u672C\u5DF2\u52A0\u8F7D URL:",window.location.href,"isTopFrame:",window.top===window,"hasBody:",!!document.body),document.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==="A"&&(e.preventDefault(),chrome.action.click()),e.altKey&&!e.shiftKey&&e.code==="KeyS"&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:"CAPTURE_TAB_FROM_PAGE"})),e.altKey&&e.shiftKey&&e.code==="KeyS"&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:"CAPTURE_REGION_FROM_PAGE"}))});var rr={GET_PAGE_TEXT:e=>ht(e),GET_FULL_HTML:e=>pt(e),QUERY_INTERACTIVE_ELEMENTS:e=>at(e),GET_SELECTED_CONTENT:e=>mt(e.format),CLICK_ELEMENT:e=>wt(e.selector,e.waitTime,e.timeout),FILL_FORM:e=>vt(e.fields,e.waitTime),SCROLL_TO:e=>kt(e),HOVER_ELEMENT:e=>bt(e.selector),KEYBOARD_INPUT:e=>Ct(e),FILE_UPLOAD:e=>At(e.selector,e.fileName,e.fileContent,e.fileType),EXTRACT_TABLE:e=>ft(e.selector,e.includeHeaders,e.format),EXTRACT_METADATA:()=>et(),EXTRACT_LINKS:e=>tt(e.filterType,e.includeImages),EXTRACT_FORMS:e=>rt(e.formSelector),EXTRACT_IMAGES:e=>nt(e),SEARCH_IN_PAGE:e=>st(e),PAGE_TO_MARKDOWN:e=>ot(e.selector,e.includeImages,e.includeLinks,e.maxLength),PAGE_TO_JSON:e=>it(e.selector,e.maxItems),FIND_SIMILAR_ELEMENTS:e=>ct(e.selector,e.maxResults),GET_IFRAME_CONTENT:e=>lt(e.selector,e.includeNested,e.maxLength),HIGHLIGHT_TEXT:e=>xt(e.text,e.color),REMOVE_HIGHLIGHTS:()=>ue(),SHADOW_DOM_QUERY:e=>$t(e.selector,e.deep,e.maxDepth,e.maxResults),MANAGE_STORAGE:e=>Rt(e),TEXT_TO_SPEECH:e=>Nt(e.text,e.lang,e.rate,e.pitch),INJECT_CSS:e=>qt(e.css,e.targetSelector,e.injectMode),VIDEO_CONTROL:e=>_t(e.action,e.selector,e.value),COPY_TO_CLIPBOARD:e=>gt(e.text),PASTE_FROM_CLIPBOARD:()=>yt(),WAIT_FOR_ELEMENT:e=>St(e.selector,e.state,e.timeout),DRAG_AND_DROP:e=>Tt(e.sourceSelector,e.targetSelector),SELECT_DROPDOWN:e=>Lt(e.triggerSelector,e.optionText,e.optionSelector,e.timeout),COLOR_PICKER:()=>Mt(),GENERATE_QRCODE:e=>Ot(e.content,e.size,e.errorCorrection,e.showImage),GET_ELEMENT_COUNT:e=>ut(e.selector,e.includeHidden),SCROLL_AND_COLLECT:e=>dt(e),CLEAR_PAGE_DATA:e=>{try{let t=[];return e.site?window.location.href.includes(new URL(e.site).hostname)&&(localStorage.clear(),sessionStorage.clear(),t.push("localStorage","sessionStorage")):(localStorage.clear(),sessionStorage.clear(),t.push("localStorage","sessionStorage")),{success:!0,cleared:t}}catch(t){return{success:!1,error:t.message}}},START_REGION_SELECTION:()=>ir()},nr=new Set(["COPY_TO_CLIPBOARD","PASTE_FROM_CLIPBOARD","WAIT_FOR_ELEMENT","DRAG_AND_DROP","SELECT_DROPDOWN","SCROLL_AND_COLLECT","WATCH_ELEMENT","COLOR_PICKER","GENERATE_QRCODE","SCREENSHOT_ELEMENT","PAGE_TO_PDF","START_REGION_SELECTION"]),or=new Set(["GET_PAGE_TEXT","GET_FULL_HTML","PAGE_TO_MARKDOWN","PAGE_TO_JSON","EXTRACT_METADATA","EXTRACT_TABLE","GET_ELEMENT_COUNT","SCROLL_AND_COLLECT","GET_IFRAME_CONTENT","QUERY_INTERACTIVE_ELEMENTS"]);chrome.runtime.onMessage.addListener((e,t,r)=>{if(or.has(e.type)&&window.top!==window)return;if(e.action==="getSelectedText"){let n=window.getSelection()?.toString()?.trim()||"";if(n&&document.hasFocus())return r({text:n}),!0;let l=j();return l.text&&l.text.trim()&&document.hasFocus()&&r({text:l.text.trim()}),!0}let o=rr[e.type];if(!o)return;let i=o(e);if(nr.has(e.type)||i instanceof Promise)return Promise.resolve(i).then(r),!0;r(i)}),tr();function ir(){return new Promise(e=>{let t=document.createElement("div");t.id="__region_select_overlay__",t.style.cssText=`
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 2147483647; cursor: crosshair;
      background: rgba(0, 0, 0, 0.15);
    `;let r=document.createElement("div");r.id="__region_select_box__",r.style.cssText=`
      position: fixed; z-index: 2147483647; pointer-events: none;
      border: 2px dashed #667eea;
      background: rgba(102, 126, 234, 0.1);
      display: none;
    `;let o=document.createElement("div");o.style.cssText=`
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; pointer-events: none;
      padding: 8px 20px; border-radius: 20px;
      background: rgba(0, 0, 0, 0.75); color: #fff;
      font-size: 14px; font-family: sans-serif;
    `,o.textContent="\u62D6\u62FD\u9009\u62E9\u622A\u56FE\u533A\u57DF\uFF0C\u6309 Esc \u53D6\u6D88";let i=0,n=0,l=!1;function s(d){return{x:d.clientX,y:d.clientY}}function a(d,c,p,m){let f=Math.min(d,p),b=Math.min(c,m),E=Math.abs(p-d),N=Math.abs(m-c);r.style.left=f+"px",r.style.top=b+"px",r.style.width=E+"px",r.style.height=N+"px",r.style.display="block"}function u(){t.remove(),r.remove(),o.remove(),document.removeEventListener("keydown",h,!0)}function h(d){d.key==="Escape"&&(d.preventDefault(),d.stopPropagation(),u(),e(null))}t.addEventListener("mousedown",d=>{if(d.button!==0)return;d.preventDefault(),d.stopPropagation();let{x:c,y:p}=s(d);i=c,n=p,l=!0,document.body.appendChild(r),document.body.appendChild(o)}),t.addEventListener("mousemove",d=>{if(!l)return;d.preventDefault();let{x:c,y:p}=s(d);a(i,n,c,p)}),t.addEventListener("mouseup",d=>{if(!l)return;d.preventDefault(),d.stopPropagation(),l=!1;let{x:c,y:p}=s(d),m={x:Math.min(i,c),y:Math.min(n,p),width:Math.abs(c-i),height:Math.abs(p-n)};if(u(),m.width<10||m.height<10){e(null);return}requestAnimationFrame(()=>e(m))}),document.addEventListener("keydown",h,!0),document.body.appendChild(t)})}})();
