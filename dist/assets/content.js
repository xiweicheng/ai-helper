(()=>{var te={DEBUG:0,INFO:1,WARN:2,ERROR:3},V=te.DEBUG;function Ye(e){V=e}function Ve(){return V}function Qe(...e){V<=te.DEBUG&&console.debug("[AIH]",...e)}function Je(...e){V<=te.INFO&&console.info("[AIH]",...e)}function Ze(...e){V<=te.WARN&&console.warn("[AIH]",...e)}function et(...e){V<=te.ERROR&&console.error("[AIH]",...e)}var k={debug:Qe,info:Je,warn:Ze,error:et,setLogLevel:Ye,getLogLevel:Ve};function C(e,t=document,n=5,o=0){if(o>n)return null;try{if(t.querySelectorAll)for(let r of t.querySelectorAll("*")){if(r.shadowRoot){let i=C(e,r.shadowRoot,n,o+1);if(i)return i}if(r.tagName==="IFRAME"||r.tagName==="FRAME")try{let i=r.contentDocument||r.contentWindow?.document;if(i){let a=C(e,i,n,o+1);if(a)return a}}catch{}}let l=t.querySelector?.(e);if(l)return l}catch{}return null}function H(e,t=document,n=5,o=0,l=new Set){if(o>n)return[];try{t.querySelectorAll&&(t.querySelectorAll(e).forEach(r=>{l.add(r)}),t.querySelectorAll("*").forEach(r=>{if(r.shadowRoot&&H(e,r.shadowRoot,n,o+1,l),r.tagName==="IFRAME"||r.tagName==="FRAME")try{let i=r.contentDocument||r.contentWindow?.document;i&&H(e,i,n,o+1,l)}catch{}}))}catch{}return Array.from(l)}function U(e=document,t=5,n=0){if(n>t)return{text:"",range:null};try{let o=e.getSelection?.();if(o&&!o.isCollapsed&&o.rangeCount>0){let l=o.toString().trim();if(l)return{text:l,range:o.getRangeAt(0),depth:n,source:"shadow"}}if(e.querySelectorAll){for(let l of e.querySelectorAll("*"))if(l.shadowRoot){let r=U(l.shadowRoot,t,n+1);if(r.text)return r}}}catch{}return{text:"",range:null}}function ue(e=document,t=5,n=0,o=new Set){if(n>t||o.has(e))return"";o.add(e);let l="";try{e.body?l+=e.body.innerText||"":e instanceof ShadowRoot&&(l+=e.textContent||""),e.querySelectorAll&&e.querySelectorAll("*").forEach(r=>{if(r.shadowRoot&&(l+=`
`+ue(r.shadowRoot,t,n+1,o)),r.tagName==="IFRAME"||r.tagName==="FRAME")try{let i=r.contentDocument||r.contentWindow?.document;i&&i.body&&(l+=`
`+ue(i,t,n+1,o))}catch{}})}catch{}return l.trim().replace(/\n{3,}/g,`

`)}function he(e=document,t=5,n=0,o=new Set){if(n>t||o.has(e))return"";o.add(e);let l="";try{e.documentElement?l=e.documentElement.outerHTML:e instanceof ShadowRoot&&(l=e.innerHTML||"");let r=[];e.querySelectorAll&&e.querySelectorAll("*").forEach(i=>{if(i.shadowRoot){let a=he(i.shadowRoot,t,n+1,o);a&&r.push(`<!-- shadow-root of ${i.tagName} -->
${a}`)}if(i.tagName==="IFRAME"||i.tagName==="FRAME")try{let a=i.contentDocument||i.contentWindow?.document;if(a&&a.documentElement){let s=he(a,t,n+1,o);s&&r.push(`<!-- iframe content -->
${s}`)}}catch{}}),r.length>0&&(l+=`
<!-- Shadow DOM and iframe content -->
`+r.join(`
`))}catch{}return l}function pe(e){if(!e)return{x:window.innerWidth/2,y:window.innerHeight/2};let t;try{t=e.getBoundingClientRect()}catch{t={left:0,top:0,width:0,height:0}}if(!t||t.width===0&&t.height===0){let l=e.commonAncestorContainer;if(l){let r=l.nodeType===Node.TEXT_NODE?l.parentElement:l;r&&r.getBoundingClientRect&&(t=r.getBoundingClientRect())}}let n=t.left+t.width/2,o=t.top;if(window.top!==window){let l=e.startContainer.ownerDocument;for(;l&&l!==window.top.document;){let r=l.defaultView?.frameElement;if(!r)break;let i=r.getBoundingClientRect();n+=i.left,o+=i.top,l=r.ownerDocument}}return{x:n,y:o}}function ve(e,t=document,n=5,o=0,l=new Set){if(o>n||l.has(t))return l;try{let r=()=>e();t.addEventListener?.("selectionchange",r),l.add({root:t,listener:r}),t.querySelectorAll&&t.querySelectorAll("*").forEach(i=>{i.shadowRoot&&ve(e,i.shadowRoot,n,o+1,l)})}catch{}return l}function tt(e){for(let{root:t,listener:n}of e)try{t.removeEventListener?.("selectionchange",n)}catch{}e.clear()}function ie(e){if(e.id)return`#${e.id}`;let t=[],n=e;for(;n&&n!==document.body&&n!==document.documentElement;){let o=n.tagName.toLowerCase();if(n.id){o=`#${n.id}`,t.unshift(o);break}if(n.className&&typeof n.className=="string"){let r=n.className.trim().split(/\s+/).filter(i=>i);r.length>0&&(o+="."+r[0])}let l=n.parentElement;if(l){let r=Array.from(l.children).filter(i=>i.tagName===n.tagName);if(r.length>1){let i=r.indexOf(n)+1;o+=`:nth-child(${i})`}}t.unshift(o),n=l}return t.join(" > ")}function nt(e){if(e.tagName==="INPUT"||e.tagName==="TEXTAREA")return e.value||e.placeholder||e.name||"";if(e.tagName==="SELECT"){let t=e.options[e.selectedIndex];return t?t.text:""}return e.textContent.trim()}function rt(e){return e.tagName==="INPUT"?e.type==="checkbox"||e.type==="radio"?e.checked?"checked":"unchecked":e.value:e.tagName==="SELECT"?e.value:""}function re(e){if(e.id)return`#${e.id}`;let t=e.tagName.toLowerCase();if(e.className){let n=e.className.split(" ").filter(o=>o).slice(0,2);n.length&&(t+="."+n.join("."))}return t}function Ee(){document.querySelectorAll(".ai-helper-highlight").forEach(t=>{let n=t.parentNode;if(n&&n.insertBefore&&n.removeChild){for(;t.firstChild;)n.insertBefore(t.firstChild,t);n.removeChild(t),typeof n.normalize=="function"&&n.normalize()}});let e=document.getElementById("ai-helper-highlight-style");e&&e.remove()}function W(){let e=document.body,t=document.querySelectorAll('button, input, a[href], dialog, [role="dialog"], [role="alert"]').length;return`${location.href}|${e?e.childElementCount:0}|${t}`}async function G(e,t=300,n=2e3){let o=Date.now();await new Promise(h=>setTimeout(h,Math.min(t,n)));let l=e.split("|")[0],r=location.href!==l,i=!1,a=e,s=0;for(;Date.now()-o<n;){let h=W();if(h===a?s++:(i=!0,s=0,a=h),s>=2)break;await new Promise(u=>setTimeout(u,100))}r=location.href!==l;let c={changed:r||i,urlChanged:r,domChanged:i,waitedMs:Date.now()-o};return r&&(c.newUrl=location.href),c}function ot(){try{let e=l=>{let r=document.querySelector(`meta[name="${l}"]`)||document.querySelector(`meta[property="${l}"]`)||document.querySelector(`meta[property="og:${l}"]`);return r?r.content:null},t=l=>{let r=document.querySelectorAll(`meta[name="${l}"], meta[property="${l}"], meta[property="og:${l}"]`);return Array.from(r).map(i=>i.content).filter(Boolean)},n=[];document.querySelectorAll('script[type="application/ld+json"]').forEach(l=>{try{let r=JSON.parse(l.textContent);Array.isArray(r)?n.push(...r):r&&r["@graph"]&&Array.isArray(r["@graph"])?n.push(...r["@graph"]):r&&n.push(r)}catch{}});let o=[];return document.querySelectorAll("[itemscope]").forEach(l=>{let r=l.getAttribute("itemtype")||"";if(!r)return;let i={};l.querySelectorAll("[itemprop]").forEach(a=>{if(a.closest("[itemscope]")!==l)return;let s=a.getAttribute("itemprop")||"";if(!s)return;let c=a.getAttribute("content")||a.getAttribute("href")||a.getAttribute("src")||a.textContent?.trim();c&&(i[s]?i[s]=Array.isArray(i[s])?[...i[s],c]:[i[s],c]:i[s]=c)}),o.push({itemType:r,properties:i})}),{success:!0,data:{title:document.title,description:e("description"),keywords:e("keywords"),author:e("author"),ogTitle:e("og:title"),ogDescription:e("og:description"),ogImage:e("og:image"),ogUrl:e("og:url"),ogType:e("og:type"),ogSiteName:e("og:site_name"),ogLocale:e("og:locale"),articlePublishedTime:e("article:published_time"),articleModifiedTime:e("article:modified_time"),articleAuthor:e("article:author"),twitterCard:e("twitter:card"),twitterTitle:e("twitter:title"),twitterDescription:e("twitter:description"),twitterImage:e("twitter:image"),twitterSite:e("twitter:site"),twitterCreator:e("twitter:creator"),canonicalUrl:document.querySelector('link[rel="canonical"]')?.href,links:t("citation_author"),jsonLd:n.length>0?n:void 0,microdata:o.length>0?o:void 0}}}catch(e){return{success:!1,error:e.message}}}function it(e="all",t=!1){try{let n=window.location.hostname,o=[];return document.querySelectorAll("a[href]").forEach(l=>{try{let r=l.href;if(!r||r.startsWith("javascript:")||r.startsWith("#"))return;let i=new URL(r),a=i.hostname!==n;if(e==="internal"&&a||e==="external"&&!a)return;o.push({href:r,text:l.textContent.trim(),title:l.title,domain:i.hostname,isExternal:a,target:l.target})}catch{}}),t&&document.querySelectorAll("img[src]").forEach(l=>{try{let r=l.src;if(!r)return;let i=new URL(r),a=i.hostname!==n;if(e==="internal"&&a||e==="external"&&!a)return;o.push({href:r,text:l.alt||"",title:l.title,domain:i.hostname,isExternal:a,type:"image"})}catch{}}),{success:!0,total:o.length,links:o}}catch(n){return{success:!1,error:n.message}}}function lt(e=null){try{let t=(e?[document.querySelector(e)].filter(Boolean):Array.from(document.querySelectorAll("form"))).map((n,o)=>{let l=[],r=n.id||`form-${o}`;return n.querySelectorAll("input").forEach(i=>{l.push({tag:"input",name:i.name,id:i.id,type:i.type,placeholder:i.placeholder,required:i.required,selector:re(i)})}),n.querySelectorAll("textarea").forEach(i=>{l.push({tag:"textarea",name:i.name,id:i.id,placeholder:i.placeholder,required:i.required,selector:re(i)})}),n.querySelectorAll("select").forEach(i=>{let a=Array.from(i.options).map(s=>({value:s.value,text:s.textContent.trim()}));l.push({tag:"select",name:i.name,id:i.id,required:i.required,options:a,selector:re(i)})}),{formId:r,action:n.action,method:n.method,fields:l}});return{success:!0,total:t.length,forms:t}}catch(t){return{success:!1,error:t.message}}}function at(e={}){try{let{minWidth:t=0,minHeight:n=0,includeBackgroundImages:o=!1,download:l=!1,maxResults:r=100}=e,i=[],a=new Set;return document.querySelectorAll("img[src]").forEach(s=>{try{let c=s.src;if(!c||a.has(c))return;let h=s.naturalWidth||s.width||0,u=s.naturalHeight||s.height||0;h>=t&&u>=n&&(a.add(c),i.push({src:c,alt:s.alt||"",title:s.title||"",width:h,height:u,selector:re(s)}))}catch{}}),o&&document.querySelectorAll("*").forEach(s=>{try{let c=window.getComputedStyle(s).backgroundImage;if(!c||c==="none"||c.startsWith("gradient"))return;let h=c.match(/url\(['"]?([^'")]+)['"]?\)/);if(h&&h[1]){let u=h[1];a.has(u)||(a.add(u),i.push({src:u,alt:"",title:"",width:0,height:0,type:"background",selector:re(s)}))}}catch{}}),l&&i.length>0&&i.slice(0,Math.min(r,10)).forEach((s,c)=>{setTimeout(()=>{let h=document.createElement("a");h.href=s.src,h.download=`image_${c+1}.png`,document.body.appendChild(h),h.click(),document.body.removeChild(h)},c*500)}),{success:!0,total:i.length,images:i.slice(0,r),message:l?`\u5DF2\u5F00\u59CB\u4E0B\u8F7D ${Math.min(i.length,10)} \u5F20\u56FE\u7247`:""}}catch(t){return{success:!1,error:t.message}}}function st(e="iframe",t=!1,n=1e4){try{let o=document.querySelectorAll(e),l=[],r=(i,a=1,s="")=>{try{let c=ie(i),h=s?`${s} > iframe`:c,u=i.src||"about:blank",d=!1,p="",f="",y=0;try{let w=i.contentDocument||i.contentWindow?.document;w&&(d=!0,p=w.title||"",f=ue(w).substring(0,n),y=he(w).length,t&&a<2&&w.querySelectorAll("iframe").forEach(x=>{r(x,a+1,h)}))}catch{d=!1}l.push({selector:h,url:u,accessible:d,title:p,textContent:f,htmlLength:y})}catch{}};return o.forEach(i=>r(i)),{success:!0,iframes:l,total:l.length,accessible:l.filter(i=>i.accessible).length}}catch(o){return{success:!1,error:o.message}}}function ct(e={}){try{let{query:t,pattern:n,mode:o="plain",caseSensitive:l=!1,contextLength:r=50,maxResults:i=20,highlight:a=!1}=e,s=t||n;if(!s)return{success:!1,error:"\u9700\u8981\u63D0\u4F9B\u641C\u7D22\u5173\u952E\u8BCD"};if(o==="plain"){let f=window.find(s,l,!1,!0,!1,!0,!1),y=0,w=[];try{let x=window.getSelection(),N=x&&x.rangeCount>0?x.getRangeAt(0):null,D=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),q=l?"g":"gi",ye=s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),X=new RegExp(ye,q),Y=document.body.innerText,Ae=0;for(;D.nextNode();){let Me=D.currentNode.textContent.match(X);if(Me)for(let se of Me){if(w.length>=i)break;let ee=Y.indexOf(se,Ae),Ke=Math.max(0,ee-r),Xe=Math.min(Y.length,ee+se.length+r);w.push({match:se,position:ee,context:Y.substring(Ke,Xe),lineNumber:Y.substring(0,ee).split(`
`).length}),y++,Ae=ee+se.length}if(w.length>=i)break}N&&(x.removeAllRanges(),x.addRange(N))}catch{y=+!!f}if(a&&y>0){Ee();let x=document.createElement("style");x.id="ai-helper-highlight-style",x.textContent=`
          .ai-helper-search-highlight {
            background-color: #ffff00;
            color: #000;
            padding: 1px 2px;
            border-radius: 2px;
          }
        `,document.head.appendChild(x);let N=l?"g":"gi",D=s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");document.body.innerHTML=document.body.innerHTML.replace(new RegExp(D,N),'<span class="ai-helper-search-highlight">$&</span>')}return{success:!0,query:s,mode:"plain",found:f,total:y,matches:w,highlighted:a}}let c=l?"g":"gi",h=new RegExp(s,c),u=document.body.innerText,d=[],p;for(;(p=h.exec(u))!==null&&d.length<i;){let f=Math.max(0,p.index-r),y=Math.min(u.length,p.index+p[0].length+r);d.push({match:p[0],position:p.index,context:u.substring(f,y),lineNumber:u.substring(0,p.index).split(`
`).length}),p[0].length===0&&h.lastIndex++}if(a&&d.length>0){Ee();let f=document.createElement("style");f.id="ai-helper-highlight-style",f.textContent=`
        .ai-helper-search-highlight {
          background-color: #ffff00;
          color: #000;
          padding: 1px 2px;
          border-radius: 2px;
        }
      `,document.head.appendChild(f),document.body.innerHTML=document.body.innerHTML.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),c),'<span class="ai-helper-search-highlight">$&</span>')}return{success:!0,pattern:s,mode:"regex",total:d.length,matches:d,highlighted:a}}catch(t){return{success:!1,error:t.message}}}var J=new Map;function dt(e){let t=parseInt(e,10);return!t||!J.has(t)?null:J.get(t).selector}function ut(e={}){let{filterByText:t,elementTypes:n,maxResults:o=100}=e,l=[],r=new Set;J.clear();let i={button:'button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]',input:'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',select:"select",textarea:"textarea",a:"a[href]",checkbox:'input[type="checkbox"]',radio:'input[type="radio"]',menuitem:'[role="menuitem"], [role="menu"], [role="menuitemcheckbox"], [role="menuitemradio"]'},a=[];return n&&n.length>0?n.forEach(s=>{i[s]&&a.push(i[s])}):a=Object.values(i),a.forEach(s=>{try{H(s).forEach(c=>{let h=ie(c);if(r.has(h))return;r.add(h);let u=c.tagName.toLowerCase(),d=nt(c),p=rt(c);if(t&&!d.toLowerCase().includes(t.toLowerCase()))return;let f={tag:u,selector:h,text:d.substring(0,100)};u==="a"?f.href=c.href:(u==="input"||u==="select"||u==="textarea")&&(f.name=c.name,f.type=c.type||"text",f.value=p,f.placeholder=c.placeholder),c.id&&(f.id=c.id),c.className&&typeof c.className=="string"&&(f.className=c.className.split(" ").filter(w=>w).slice(0,3).join(" "));let y=l.length+1;f.ref=y,J.set(y,{element:c,selector:h,tag:u}),l.push(f)})}catch{}}),{success:!0,count:Math.min(l.length,o),total:l.length,elements:l.slice(0,o),hint:"ref \u7F16\u53F7\u4EC5\u672C\u6B21\u67E5\u8BE2\u6709\u6548\uFF0C\u9875\u9762\u5BFC\u822A/\u5237\u65B0\u6216\u5207\u6362 tab \u540E\u9700\u91CD\u65B0 query_elements"}}function ht(e={}){let{scrollPixels:t=800,maxScrolls:n=20,pauseMs:o=500,selector:l}=e;return new Promise(async r=>{try{let i=l?document.querySelector(l):null,a=()=>{let f=i||document.body,y=document.createTreeWalker(f,NodeFilter.SHOW_TEXT),w="",x;for(;x=y.nextNode();){let N=x.parentElement;if(!N)continue;let D=N.getBoundingClientRect();if(D.bottom>-100&&D.top<window.innerHeight+100){let q=x.textContent.trim();q&&(w+=q+`
`)}}return w},s=i||document.scrollingElement||document.documentElement,c="",h=window.scrollY,u=0;for(let f=0;f<n;f++){let y=a();c+=y+`
`;let w=window.scrollY;if(s.scrollBy({top:t,behavior:"auto"}),u++,await new Promise(x=>setTimeout(x,o)),Math.abs(window.scrollY-w)<5&&(await new Promise(x=>setTimeout(x,o)),Math.abs(window.scrollY-w)<5))break}i&&s.scrollTo({top:h,behavior:"auto"});let d=c.split(`
`),p=[];for(let f of d){let y=f.trim();y&&y!==p[p.length-1]&&p.push(y)}r({success:!0,content:p.join(`
`),contentLength:p.join(`
`).length,scrolls:u,startScrollY:h,endScrollY:window.scrollY})}catch(i){r({success:!1,error:i.message})}})}async function pt(e,t="click",n={}){let{waitTime:o=300,timeout:l=2e3}=n,r=parseInt(e,10);if(!r||!J.has(r))return{success:!1,error:`\u65E0\u6548\u7684\u5143\u7D20\u7F16\u53F7 ref=${e}\u3002ref \u4EC5\u5F53\u524D\u9875\u9762\u6709\u6548\uFF0C\u9875\u9762\u5BFC\u822A/\u5237\u65B0\u6216\u5207\u6362 tab \u540E\u9700\u91CD\u65B0 query_elements`};let i=J.get(r),a=i.element;if(!a.isConnected&&(a=C(i.selector),!a))return{success:!1,error:`\u5143\u7D20 ref=${e} \u5DF2\u5931\u6548\uFF08\u9875\u9762\u53EF\u80FD\u5DF2\u53D8\u5316\uFF09\uFF0C\u8BF7\u91CD\u65B0\u8C03\u7528 query_elements \u83B7\u53D6\u6700\u65B0\u5143\u7D20`};let s=window.getComputedStyle(a);if(s.display==="none"||s.visibility==="hidden")return{success:!1,error:`\u5143\u7D20 ref=${e}\uFF08${i.tag}\uFF09\u5F53\u524D\u4E0D\u53EF\u89C1\uFF0C\u53EF\u80FD\u88AB\u9690\u85CF\u6216\u6298\u53E0`};if(t==="hover"){let d=W();a.dispatchEvent(new MouseEvent("mouseover",{bubbles:!0,cancelable:!0,view:window})),a.dispatchEvent(new MouseEvent("mouseenter",{bubbles:!0,cancelable:!0,view:window}));let p=await G(d,o,l),f=p.changed?`\uFF08\u68C0\u6D4B\u5230${p.urlChanged?"\u5BFC\u822A":"DOM"}\u53D8\u5316\uFF0C\u5DF2\u7B49\u5F85 ${p.waitedMs}ms\uFF09`:"";return{success:!0,message:`\u5DF2\u60AC\u505C\u5143\u7D20 ref=${e}\uFF08${i.tag}\uFF09${f}`,selector:i.selector,...p}}let c=W();a.click();let h=await G(c,o,l),u=h.changed?`\uFF08\u68C0\u6D4B\u5230${h.urlChanged?"\u5BFC\u822A":"DOM"}\u53D8\u5316\uFF0C\u5DF2\u7B49\u5F85 ${h.waitedMs}ms\uFF09`:"";return{success:!0,message:`\u5DF2\u70B9\u51FB\u5143\u7D20 ref=${e}\uFF08${i.tag}\uFF09${u}`,selector:i.selector,...h}}async function ft(e,t={}){let{maxScrolls:n=20,pauseMs:o=500}=t;if(!e)return{success:!1,error:"text \u4E0D\u80FD\u4E3A\u7A7A"};let l=e.toLowerCase(),r=()=>{let a=H("h1, h2, h3, h4, h5, h6, p, span, a, button, li, td, th, label, div");for(let s of a){let c=Array.from(s.childNodes).filter(h=>h.nodeType===Node.TEXT_NODE).map(h=>h.textContent).join("").trim();if(c&&c.toLowerCase().includes(l))return s}return null},i=r();if(i)return i.scrollIntoView({behavior:"smooth",block:"center"}),await new Promise(a=>setTimeout(a,300)),{success:!0,message:`\u5DF2\u6EDA\u52A8\u5230\u5305\u542B"${e}"\u7684\u5143\u7D20`,selector:ie(i),scrolls:0};for(let a=0;a<n;a++){let s=window.scrollY;if(window.scrollBy({top:Math.floor(window.innerHeight*.8),behavior:"auto"}),await new Promise(c=>setTimeout(c,o)),i=r(),i)return i.scrollIntoView({behavior:"smooth",block:"center"}),await new Promise(c=>setTimeout(c,300)),{success:!0,message:`\u5DF2\u6EDA\u52A8\u5230\u5305\u542B"${e}"\u7684\u5143\u7D20`,selector:ie(i),scrolls:a+1};if(Math.abs(window.scrollY-s)<5&&(await new Promise(c=>setTimeout(c,o)),Math.abs(window.scrollY-s)<5))break}return{success:!1,error:`\u6EDA\u52A8 ${n} \u6B21\u672A\u627E\u5230\u5305\u542B"${e}"\u7684\u6587\u672C`,scrolls:n}}function mt(e={}){let{maxLength:t=5e4,includeHeadings:n=!0,includeLinks:o=!0}=e,l=ue(),r={title:document.title||"",url:window.location.href,content:l.substring(0,t),wordCount:l.split(/\s+/).length};return n&&(r.headings=Array.from(H("h1, h2, h3, h4, h5, h6")).map(i=>({level:i.tagName,text:i.textContent.trim()})).filter(i=>i.text.length>0).slice(0,30)),o&&(r.links=Array.from(H("a")).map(i=>({text:i.textContent.trim(),href:i.href})).filter(i=>i.text.length>0).slice(0,50)),{success:!0,data:r}}function gt(e={}){let{includeStyles:t=!1,maxLength:n=5e4}=e,o=he();return t||(o=o.replace(/\s*style="[^"]*"/gi,"")),{success:!0,content:JSON.stringify({title:document.title,url:window.location.href,html:o.substring(0,n),fullLength:o.length})}}function yt(e="text"){try{let t=window.getSelection();if(!t||t.isCollapsed||t.rangeCount===0)return{success:!1,error:"\u5F53\u524D\u6CA1\u6709\u9009\u4E2D\u7684\u5185\u5BB9"};let n={success:!0,data:{selectedCount:t.rangeCount,text:""}};if(e==="html"){let o=[];for(let l=0;l<t.rangeCount;l++){let r=t.getRangeAt(l).cloneContents(),i=document.createElement("div");i.appendChild(r),o.push(i.innerHTML)}n.data.html=o.join(`
`),n.data.text=t.toString()}else n.data.text=t.toString();return n}catch(t){return{success:!1,error:t.message}}}function bt(e="table",t=!0,n="json"){try{let o=C(e);if(!o)return{success:!1,error:`\u672A\u627E\u5230\u5339\u914D\u9009\u62E9\u5668\u7684\u8868\u683C: ${e}`};let l=Array.from(o.querySelectorAll("tr")),r=[];return l.forEach((i,a)=>{let s=Array.from(i.querySelectorAll("td, th")).map(c=>c.textContent.trim());(t||a>0)&&r.push(s)}),n==="markdown"?r.length===0?{success:!0,content:"\u8868\u683C\u4E3A\u7A7A"}:{success:!0,content:`${`| ${r[0].join(" | ")} |`}
${`| ${r[0].map(()=>"---").join(" | ")} |`}
${r.slice(1).map(i=>`| ${i.join(" | ")} |`).join(`
`)}`}:{success:!0,content:JSON.stringify({data:r,rowCount:r.length,columnCount:r[0]?.length||0}),data:r}}catch(o){return{success:!1,error:o.message}}}async function wt(e){try{return await navigator.clipboard.writeText(e),{success:!0,message:"\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F"}}catch{try{let t=document.createElement("textarea");return t.value=e,t.style.position="fixed",t.style.left="-9999px",document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t),{success:!0,message:"\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF08\u964D\u7EA7\u65B9\u6848\uFF09"}}catch(t){return{success:!1,error:t.message}}}}async function xt(){try{return{success:!0,content:await navigator.clipboard.readText()}}catch(e){return{success:!1,error:e.message}}}async function vt(e){try{let t=C(e);if(!t)return{success:!1,error:`\u672A\u627E\u5230\u5143\u7D20: ${e}`};let n=W();t.dispatchEvent(new MouseEvent("mouseover",{bubbles:!0,cancelable:!0,view:window})),t.dispatchEvent(new MouseEvent("mouseenter",{bubbles:!0,cancelable:!0,view:window}));let o=await G(n,300,2e3);return{success:!0,message:`\u5DF2\u5728\u5143\u7D20\u4E0A\u89E6\u53D1\u60AC\u505C\u6548\u679C: ${e}${o.changed?`\uFF08\u68C0\u6D4B\u5230${o.urlChanged?"\u5BFC\u822A":"DOM"}\u53D8\u5316\uFF0C\u5DF2\u7B49\u5F85 ${o.waitedMs}ms\uFF09`:""}`,...o}}catch(t){return{success:!1,error:t.message}}}function Et(e,t="yellow"){try{if(!e)return{success:!1,error:"\u672A\u63D0\u4F9B\u8981\u9AD8\u4EAE\u7684\u6587\u672C"};Ee();let n=document.createElement("style");n.id="ai-helper-highlight-style",n.textContent=`
      .ai-helper-highlight {
        background-color: ${t} !important;
        padding: 2px 0;
      }
    `,document.head.appendChild(n);let o=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),l=[],r;for(;r=o.nextNode();)r.nodeValue.toLowerCase().includes(e.toLowerCase())&&l.push(r);let i=[];return l.forEach(a=>{let s=a.parentNode;if(!s||!s.replaceChild||!s.insertBefore)return;let c=a.nodeValue,h=c.toLowerCase(),u=c.toLowerCase(),d=h.indexOf(u);if(d!==-1){let p=document.createElement("span");p.className="ai-helper-highlight",p.textContent=c.substring(d,d+c.length);let f=document.createTextNode(c.substring(0,d)),y=document.createTextNode(c.substring(d+c.length));s.replaceChild(y,a),s.insertBefore(p,y),s.insertBefore(f,p),i.push(p)}}),i.length>0&&i[0].scrollIntoView({behavior:"smooth",block:"center"}),{success:!0,message:`\u5DF2\u9AD8\u4EAE ${i.length} \u5904\u6587\u672C`,count:i.length}}catch(n){return{success:!1,error:n.message}}}async function kt(e,t=300,n=2e3){try{if(!e)return{success:!1,error:"\u9009\u62E9\u5668\u4E0D\u80FD\u4E3A\u7A7A"};let o=e.trim();for(let[a,s]of[[/^"([\s\S]*)"$/,"$1"],[/^'([\s\S]*)'$/,"$1"],[/^`([\s\S]*)`$/,"$1"],[/^"([\s\S]*)"$/,"$1"],[/^'([\s\S]*)'$/,"$1"],[/^「([\s\S]*)」$/,"$1"]])o=o.replace(a,s);let l=C(o);if(!l)return{success:!1,error:`\u672A\u627E\u5230\u5339\u914D\u9009\u62E9\u5668\u7684\u5143\u7D20: ${e}`};let r=W();l.click();let i=await G(r,t,n);return{success:!0,message:`\u5DF2\u70B9\u51FB\u5143\u7D20: ${e}${i.changed?`\uFF08\u68C0\u6D4B\u5230${i.urlChanged?"\u5BFC\u822A":"DOM"}\u53D8\u5316\uFF0C\u5DF2\u7B49\u5F85 ${i.waitedMs}ms\uFF09`:""}`,...i}}catch(o){return{success:!1,error:o.message}}}function Ct(e){return e.isContentEditable||e.getAttribute("contenteditable")==="true"}function Oe(e,t){let n=e.tagName==="TEXTAREA"?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,o=Object.getOwnPropertyDescriptor(n,"value");o&&o.set?o.set.call(e,t):e.value=t}function Le(e,t){try{return e.focus(),document.execCommand("insertText",!1,t)||(e.textContent=t),e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0})),!0}catch{try{return e.textContent=t,e.dispatchEvent(new Event("input",{bubbles:!0})),!0}catch{return!1}}}function Tt(e,t=500){try{let n=[];return e.forEach(o=>{let{selector:l,value:r,fieldType:i="text"}=o,a=C(l);if(!a){n.push({selector:l,success:!1,error:"\u672A\u627E\u5230\u5143\u7D20"});return}try{if(i==="text"){if(Ct(a)){let s=Le(a,r);n.push({selector:l,success:s,value:r});return}Oe(a,r),a.dispatchEvent(new Event("input",{bubbles:!0})),a.dispatchEvent(new Event("change",{bubbles:!0}))}else if(i==="contenteditable"){let s=Le(a,r);n.push({selector:l,success:s,value:r});return}else if(i==="select"){let s=a.querySelector(`option[value="${r}"]`)||Array.from(a.options).find(c=>c.textContent===r);if(s)a.value=s.value,a.dispatchEvent(new Event("change",{bubbles:!0}));else{n.push({selector:l,success:!1,error:"\u672A\u627E\u5230\u5339\u914D\u7684\u9009\u9879"});return}}else if(i==="checkbox")a.checked=r==="true"||r===!0,a.dispatchEvent(new Event("change",{bubbles:!0}));else if(i==="radio"){let s=C(`${l}[value="${r}"]`);if(s)s.checked=!0,s.dispatchEvent(new Event("change",{bubbles:!0}));else{n.push({selector:l,success:!1,error:"\u672A\u627E\u5230\u5339\u914D\u7684\u5355\u9009\u6309\u94AE"});return}}n.push({selector:l,success:!0,value:r})}catch(s){n.push({selector:l,success:!1,error:s.message})}}),{success:!0,message:`\u8868\u5355\u586B\u5145\u5B8C\u6210\uFF0C\u6210\u529F ${n.filter(o=>o.success).length}/${e.length} \u4E2A\u5B57\u6BB5`,details:n}}catch(n){return{success:!1,error:n.message}}}function St(e){try{let{target:t="selector",selector:n,x:o=0,y:l=0,behavior:r="smooth",align:i="center"}=e;if(t==="top")window.scrollTo({top:0,left:0,behavior:r});else if(t==="bottom")window.scrollTo({top:document.body.scrollHeight,left:0,behavior:r});else if(t==="coordinates")window.scrollTo({top:l,left:o,behavior:r});else if(t==="selector"&&n){let a=C(n);if(!a)return{success:!1,error:`\u672A\u627E\u5230\u5143\u7D20: ${n}`};a.scrollIntoView({behavior:r,block:i})}else return{success:!1,error:"\u65E0\u6548\u7684\u6EDA\u52A8\u76EE\u6807\u6216\u7F3A\u5C11\u9009\u62E9\u5668"};return{success:!0,message:"\u6EDA\u52A8\u5B8C\u6210"}}catch(t){return{success:!1,error:t.message}}}function Re(e){if(!e)return!1;if(e.offsetParent===null&&e.tagName!=="BODY"){let r=window.getComputedStyle(e);if(r.display==="none"||r.visibility==="hidden"||r.position!=="fixed")return!1}let t=window.getComputedStyle(e);if(t.display==="none"||t.visibility==="hidden"||parseFloat(t.opacity)<=0)return!1;let n=e.getBoundingClientRect();if(n.width<=0||n.height<=0)return!1;let o=window.innerHeight||document.documentElement.clientHeight,l=window.innerWidth||document.documentElement.clientWidth;return n.top<o&&n.bottom>0&&n.left<l&&n.right>0}function At(e,t="appeared",n=1e4){return new Promise((o,l)=>{let r=Date.now(),i=()=>{let a=C(e);if(t==="appeared"&&a){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u51FA\u73B0`,element:e});return}if(t==="disappeared"&&!a){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u6D88\u5931`});return}if(t==="visible"&&a&&Re(a)){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u53EF\u89C1`,element:e});return}if(t==="hidden"&&(!a||!Re(a))){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u9690\u85CF`});return}if(Date.now()-r>n){o({success:!1,error:`\u7B49\u5F85\u8D85\u65F6\uFF08${n}ms\uFF09\uFF0C\u5143\u7D20 ${e} \u672A\u8FBE\u5230 ${t} \u72B6\u6001`});return}setTimeout(i,100)};i()})}var $e={enter:{code:"Enter",keyCode:13},escape:{code:"Escape",keyCode:27},esc:{code:"Escape",keyCode:27},tab:{code:"Tab",keyCode:9},backspace:{code:"Backspace",keyCode:8},delete:{code:"Delete",keyCode:46},arrowup:{code:"ArrowUp",keyCode:38},arrowdown:{code:"ArrowDown",keyCode:40},arrowleft:{code:"ArrowLeft",keyCode:37},arrowright:{code:"ArrowRight",keyCode:39},home:{code:"Home",keyCode:36},end:{code:"End",keyCode:35},pageup:{code:"PageUp",keyCode:33},pagedown:{code:"PageDown",keyCode:34},space:{code:"Space",keyCode:32}};function Mt(e){let t=e.toLowerCase();if($e[t])return $e[t];if(e.length===1&&/[a-zA-Z]/.test(e))return{code:`Key${e.toUpperCase()}`,keyCode:e.toUpperCase().charCodeAt(0)};if(e.length===1&&/[0-9]/.test(e))return{code:`Digit${e}`,keyCode:e.charCodeAt(0)};let n=e.match(/^F([1-9]|1[0-2])$/i);if(n){let o=parseInt(n[1],10);return{code:`F${o}`,keyCode:111+o}}return{code:e,keyCode:e.toUpperCase().charCodeAt(0)}}async function Lt({key:e,text:t,ctrlKey:n=!1,shiftKey:o=!1,altKey:l=!1}){try{let r=document.activeElement;if(!r)return{success:!1,error:"\u6CA1\u6709\u805A\u7126\u7684\u5143\u7D20"};let i=W();if(t){let s=r.tagName==="INPUT"||r.tagName==="TEXTAREA",c=r.isContentEditable;if(s||c){if(r.focus(),c)try{document.execCommand("selectAll",!1,null),document.execCommand("insertText",!1,t)}catch{r.textContent+=t}else Oe(r,r.value+t);try{r.dispatchEvent(new InputEvent("input",{bubbles:!0,cancelable:!0,inputType:"insertText",data:t}))}catch{r.dispatchEvent(new Event("input",{bubbles:!0}))}r.dispatchEvent(new Event("change",{bubbles:!0}))}}if(e){let s=Mt(e),c={key:e,code:s.code,keyCode:s.keyCode,which:s.keyCode,bubbles:!0,cancelable:!0,ctrlKey:n,shiftKey:o,altKey:l};document.activeElement.dispatchEvent(new KeyboardEvent("keydown",c)),document.activeElement.dispatchEvent(new KeyboardEvent("keypress",c)),document.activeElement.dispatchEvent(new KeyboardEvent("keyup",c))}let a=await G(i,300,2e3);return{success:!0,message:`\u952E\u76D8\u8F93\u5165\u6210\u529F${a.changed?`\uFF08\u68C0\u6D4B\u5230${a.urlChanged?"\u5BFC\u822A":"DOM"}\u53D8\u5316\uFF0C\u5DF2\u7B49\u5F85 ${a.waitedMs}ms\uFF09`:""}`,...a}}catch(r){return{success:!1,error:r.message}}}function Rt(e,t){return new Promise((n,o)=>{try{let l=C(e),r=C(t);if(!l){n({success:!1,error:`\u672A\u627E\u5230\u6E90\u5143\u7D20: ${e}`});return}if(!r){n({success:!1,error:`\u672A\u627E\u5230\u76EE\u6807\u5143\u7D20: ${t}`});return}let i=l.getBoundingClientRect(),a=r.getBoundingClientRect(),s=i.left+i.width/2,c=i.top+i.height/2,h=a.left+a.width/2,u=a.top+a.height/2,d=(p,f,y)=>{let w=new DragEvent(p,{bubbles:!0,cancelable:!0,clientX:f,clientY:y,screenX:f,screenY:y});Object.defineProperty(w,"dataTransfer",{value:{getData:()=>"",setData:()=>{},effectAllowed:"all",dropEffect:"none"}}),document.elementFromPoint(f,y)?.dispatchEvent(w)};d("dragstart",s,c),d("dragenter",h,u),d("dragover",h,u),d("drop",h,u),d("dragend",s,c),n({success:!0,experimental:!0,message:`\u26A0\uFE0F\u62D6\u62FD\u4E3A\u5B9E\u9A8C\u6027\uFF0C\u53EF\u80FD\u672A\u751F\u6548\uFF08${e} \u2192 ${t}\uFF09\u3002\u53D7\u6D4F\u89C8\u5668 dataTransfer \u9650\u5236\uFF0C\u4F9D\u8D56\u62D6\u62FD\u6570\u636E\u7684\u7F51\u9875\u591A\u6570\u65E0\u6CD5\u89E6\u53D1\uFF0C\u5EFA\u8BAE\u9A8C\u8BC1\u7ED3\u679C\u6216\u6539\u7528\u70B9\u51FB\u5750\u6807\u5B9E\u73B0`})}catch(l){n({success:!1,error:l.message})}})}function $t(e,t,n,o="application/octet-stream"){try{let l=C(e);if(!l)return{success:!1,error:`\u672A\u627E\u5230\u6587\u4EF6\u4E0A\u4F20\u63A7\u4EF6: ${e}`};if(l.type!=="file")return{success:!1,error:"\u9009\u62E9\u7684\u5143\u7D20\u4E0D\u662F\u6587\u4EF6\u4E0A\u4F20\u63A7\u4EF6"};let r;try{let s=atob(n),c=new Uint8Array(s.length);for(let h=0;h<s.length;h++)c[h]=s.charCodeAt(h);r=new Blob([c],{type:o})}catch{r=new Blob([n],{type:o})}let i=new File([r],t,{type:o}),a=new DataTransfer;return a.items.add(i),l.files=a.files,l.dispatchEvent(new Event("change",{bubbles:!0})),{success:!0,message:`\u5DF2\u4E0A\u4F20\u6587\u4EF6: ${t}`}}catch(l){return{success:!1,error:l.message}}}async function Nt(e,t={}){let{tag:n,action:o="click",waitTime:l=300,timeout:r=2e3}=t;if(!e)return{success:!1,error:"text \u4E0D\u80FD\u4E3A\u7A7A"};let i=n?[n]:["button",'[role="button"]','input[type="submit"]','input[type="button"]',"a[href]",'[role="menuitem"]','[role="menuitemradio"]','[role="menuitemcheckbox"]','[role="option"]','[role="tab"]',"[onclick]","summary","li"],a=e.toLowerCase();for(let d of i){let p=[];try{p=H(d)}catch{continue}for(let f of p){let y=(f.textContent||f.value||"").trim();if(!y)continue;let w=y.toLowerCase();if(y===e||w===a||w.includes(a)){let x=window.getComputedStyle(f);if(x.display==="none"||x.visibility==="hidden"||parseFloat(x.opacity)<=0)continue;let N=ie(f),D=W();if(o==="hover"){f.dispatchEvent(new MouseEvent("mouseover",{bubbles:!0,cancelable:!0,view:window})),f.dispatchEvent(new MouseEvent("mouseenter",{bubbles:!0,cancelable:!0,view:window}));let X=await G(D,l,r),Y=X.changed?`\uFF08\u68C0\u6D4B\u5230${X.urlChanged?"\u5BFC\u822A":"DOM"}\u53D8\u5316\uFF0C\u5DF2\u7B49\u5F85 ${X.waitedMs}ms\uFF09`:"";return{success:!0,message:`\u5DF2\u60AC\u505C\u6587\u672C"${e}"\u5BF9\u5E94\u7684${f.tagName.toLowerCase()}\u5143\u7D20${Y}`,selector:N,matchedText:y.substring(0,100),...X}}f.click();let q=await G(D,l,r),ye=q.changed?`\uFF08\u68C0\u6D4B\u5230${q.urlChanged?"\u5BFC\u822A":"DOM"}\u53D8\u5316\uFF0C\u5DF2\u7B49\u5F85 ${q.waitedMs}ms\uFF09`:"";return{success:!0,message:`\u5DF2\u70B9\u51FB\u6587\u672C"${e}"\u5BF9\u5E94\u7684${f.tagName.toLowerCase()}\u5143\u7D20${ye}`,selector:N,matchedText:y.substring(0,100),...q}}}}let s=!1,c=!1,h=!1;try{let d=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null);for(;d.nextNode();)if((d.currentNode.textContent||"").toLowerCase().includes(a)){s=!0;let p=d.currentNode.parentElement;if(p){let f=window.getComputedStyle(p);(f.display==="none"||f.visibility==="hidden"||parseFloat(f.opacity)<=0)&&(c=!0),p.closest('button, [role="button"], [role="option"], [role="tab"], li, a[href], [onclick], summary, [tabindex]')||(h=!0)}break}}catch{}let u;return u=s?c?`\u627E\u5230\u6587\u672C"${e}"\u4F46\u5143\u7D20\u4E0D\u53EF\u89C1\uFF0C\u53EF\u80FD\u9700\u8981\u5148\u6253\u5F00\u4E0B\u62C9\u9762\u677F/\u6EDA\u52A8\u5230\u53EF\u89C1\u533A\u57DF`:h?`\u627E\u5230\u6587\u672C"${e}"\u4F46\u4E0D\u5728\u53EF\u70B9\u51FB\u5143\u7D20\u4E2D\uFF0C\u8BF7\u7528 query_elements \u67E5\u770B\u5B9E\u9645\u7ED3\u6784\u6216\u7528 selector \u5B9A\u4F4D`:`\u627E\u5230\u6587\u672C"${e}"\u5728\u53EF\u70B9\u51FB\u5143\u7D20\u4E2D\u4F46\u672A\u5339\u914D\uFF0C\u53EF\u80FD\u6587\u672C\u88AB\u5206\u5272\u6216\u5927\u5C0F\u5199\u4E0D\u4E00\u81F4`:`\u9875\u9762\u4E2D\u4E0D\u5B58\u5728\u6587\u672C"${e}"\uFF0C\u53EF\u80FD\u9700\u8981\u5148\u64CD\u4F5C\uFF08\u5982\u6253\u5F00\u4E0B\u62C9\u9762\u677F\uFF09\u6216\u6587\u672C\u6709\u8BEF`,{success:!1,error:u+(n?`\uFF08\u9650\u5B9A\u6807\u7B7E: ${n}\uFF09`:"")}}function It(e,t,n=null,o=5e3){return new Promise(async l=>{try{let r=C(e);if(!r){l({success:!1,error:`\u672A\u627E\u5230\u89E6\u53D1\u5668: ${e}`});return}if(r.tagName==="SELECT"){let c=r.options;for(let h=0;h<c.length;h++){let u=c[h],d=(u.textContent||u.label||"").trim();if(d===t||d.includes(t)){r.value=u.value,r.dispatchEvent(new Event("change",{bubbles:!0})),r.dispatchEvent(new Event("input",{bubbles:!0})),l({success:!0,message:`\u5DF2\u9009\u62E9: ${d}`,triggerTag:"SELECT"});return}}l({success:!1,error:`\u5728 <select> \u4E2D\u672A\u627E\u5230\u5339\u914D\u7684\u9009\u9879: "${t}"`,availableOptions:Array.from(c).map(h=>h.textContent?.trim()).filter(Boolean)});return}r.click(),await new Promise(c=>setTimeout(c,300));let i=Date.now(),a=n?C(n):document;if(!a){l({success:!1,error:`\u672A\u627E\u5230\u9009\u9879\u5BB9\u5668: ${n}`});return}let s=null;for(;Date.now()-i<o;){let c=H('li, [role="option"], [role="menuitem"], .option, .dropdown-item, .select-item, [data-value], div',a);for(let h of c){let u=(h.textContent||"").trim();if(!(u.length<2)&&(u===t||u.includes(t)||u.replace(/\s+/g,"")===t.replace(/\s+/g,""))){s=h;break}}if(s)break;await new Promise(h=>setTimeout(h,100))}if(!s){l({success:!1,error:`\u5728 ${o}ms \u5185\u672A\u627E\u5230\u5339\u914D\u9009\u9879: "${t}"`});return}s.click(),l({success:!0,message:`\u5DF2\u9009\u62E9: ${s.textContent?.trim()}`,triggerTag:r.tagName})}catch(r){l({success:!1,error:r.message})}})}function _t({action:e,storage:t,key:n,value:o}){try{let l=t==="session"?sessionStorage:localStorage;switch(e){case"get":if(!n){let i={};for(let a=0;a<l.length;a++){let s=l.key(a);i[s]=l.getItem(s)}return{success:!0,content:JSON.stringify(i),data:i}}let r=l.getItem(n);return{success:!0,content:JSON.stringify({key:n,value:r}),value:r};case"set":return!n||o===void 0?{success:!1,error:"set\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bkey\u548Cvalue"}:(l.setItem(n,o),{success:!0,message:`\u5DF2\u8BBE\u7F6E ${n}`});case"remove":return n?(l.removeItem(n),{success:!0,message:`\u5DF2\u5220\u9664 ${n}`}):{success:!1,error:"remove\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bkey"};case"clear":return l.clear(),{success:!0,message:"\u5DF2\u6E05\u7A7A\u5B58\u50A8"};default:return{success:!1,error:`\u672A\u77E5\u64CD\u4F5C: ${e}`}}}catch(l){return{success:!1,error:l.message}}}function Ot(e,t){try{let n=document.createElement("canvas");n.width=t,n.height=t;let o=n.getContext("2d");o.fillStyle="#FFFFFF",o.fillRect(0,0,t,t);let l=[];for(let u=0;u<e.length;u++)l.push(e.charCodeAt(u));let r=Math.max(2,Math.floor(t/41)),i=Math.floor(t/r),a=Math.floor((t-i*r)/2);o.fillStyle="#000000";let s=(u,d)=>{let p=7*r;o.fillRect(u,d,p,p),o.fillStyle="#FFFFFF",o.fillRect(u+r,d+r,p-2*r,p-2*r),o.fillStyle="#000000",o.fillRect(u+2*r,d+2*r,p-4*r,p-4*r),o.fillStyle="#000000"};s(a,a),s(a+(i-7)*r,a),s(a,a+(i-7)*r);let c=0;for(let u=0;u<e.length;u++)c=(c<<5)-c+e.charCodeAt(u),c|=0;let h=u=>{let d=u+1831565813;return d=Math.imul(d^d>>>15,d|1),d^=d+Math.imul(d^d>>>7,d|61),((d^d>>>14)>>>0)/4294967296};for(let u=0;u<i;u++)for(let d=0;d<i;d++){let p=u<8&&d<8,f=u<8&&d>=i-8,y=u>=i-8&&d<8;p||f||y||h(c+u*i+d)>.5&&o.fillRect(a+d*r,a+u*r,r,r)}return n.toDataURL("image/png")}catch{return null}}function Dt(e="",t=200,n="M",o=!0){return new Promise(l=>{try{let r=e||window.location.href,i=document.createElement("div");i.id="ai-helper-qrcode",i.style.cssText=`
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
      `;let a=document.createElement("canvas");a.width=t,a.height=t,i.appendChild(a);let s=document.createElement("p");s.textContent=r.length>50?r.substring(0,50)+"...":r,s.style.cssText="margin-top: 12px; font-size: 12px; color: #666; word-break: break-all; max-width: 200px;",i.appendChild(s);let c=document.createElement("button");if(c.textContent="\u5173\u95ED",c.style.cssText=`
        margin-top: 12px;
        padding: 6px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
      `,c.onclick=()=>{document.body.removeChild(i)},i.appendChild(c),typeof QRCode>"u"){let h=Ot(r,t);if(h){let u=document.createElement("img");u.src=h,u.width=t,u.height=t,a.replaceWith(u),o&&document.body.appendChild(i),l({success:!0,content:r,size:t,dataUrl:h,shown:o,fallback:!0,warning:"QRCode \u5E93\u672A\u52A0\u8F7D\uFF0C\u5DF2\u4F7F\u7528 SVG \u964D\u7EA7\u65B9\u6848\u751F\u6210"})}else l({success:!1,error:"\u4E8C\u7EF4\u7801\u5E93\u672A\u52A0\u8F7D\u4E14\u964D\u7EA7\u65B9\u6848\u4E0D\u53EF\u7528"});return}QRCode.toCanvas(a,r,{width:t,margin:2,color:{dark:"#000000",light:"#ffffff"},errorCorrectionLevel:n.toLowerCase()},h=>{h?l({success:!1,error:h.message}):(o&&document.body.appendChild(i),l({success:!0,content:r,size:t,dataUrl:a.toDataURL("image/png"),shown:o}))})}catch(r){l({success:!1,error:r.message})}})}function qt(e,t=null,n="style"){try{if(!e||typeof e!="string")return{success:!1,error:"css \u53C2\u6570\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32"};if(n!=="style"&&n!=="inline")return{success:!1,error:`\u4E0D\u652F\u6301\u7684 injectMode: ${n}\uFF0C\u652F\u6301 'style' \u6216 'inline'`};if(n==="style")if(t){let o=document.querySelectorAll(t),l=`ai-helper-scoped-style-${Date.now()}`,r="",i=e.split("}");for(let s of i){let c=s.trim();if(!c)continue;let h=c.indexOf("{");if(h===-1)continue;let u=c.substring(0,h).trim(),d=c.substring(h+1).trim();r+=`#${l} ${u} { ${d} } `}o.forEach(s=>{s.setAttribute("id",l)});let a=document.createElement("style");return a.setAttribute("data-ai-helper","scoped"),a.textContent=r,document.head.appendChild(a),{success:!0,injectMode:"style",scoped:!0,selector:t,hitCount:o.length}}else{let o=document.createElement("style");return o.setAttribute("data-ai-helper","global"),o.textContent=e,document.head.appendChild(o),{success:!0,injectMode:"style",scoped:!1,hitCount:0}}if(n==="inline"){let o=t?document.querySelectorAll(t):document.querySelectorAll("*"),l=0,r={};return e.split(";").forEach(i=>{let a=i.indexOf(":");if(a===-1)return;let s=i.substring(0,a).trim(),c=i.substring(a+1).trim();s&&c&&(r[s]=c)}),o.forEach(i=>{if(i.nodeType===1){for(let[a,s]of Object.entries(r))try{i.style.setProperty(a,s)}catch{}l++}}),{success:!0,injectMode:"inline",selector:t||"*",hitCount:l}}}catch(o){return{success:!1,error:o.message}}}function Pt(){if(document.getElementById("aih-selection-toolbar-styles"))return;let e=document.createElement("style");e.id="aih-selection-toolbar-styles",e.textContent=`
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
  `,document.head.appendChild(e)}var E={search:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',explain:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>',translate:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',summary:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>',copy:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',close:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',sparkle:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',lock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',unlock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',copyLarge:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',grip:'<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>',send:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',more:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',gear:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',refresh:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',block:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',eyeOff:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'},m=null,g=null,$=!1,M=!1,de="",ne=null,oe="",O=!1,P=!1,B="",fe="",ke="",Ce="",b="",le=!0,Z=[],De=!1,me=!1,z={x:0,y:0},F=null,R=null,Ne=5,Se=!1,v=null,j="",be=new Set,L=window.top===window;if(!L)try{window.parent===window.top&&window.top.document.querySelector("frameset")&&(L=!0)}catch{}k.debug("[SelectionToolbar] \u6A21\u5757\u52A0\u8F7D isTopFrame:",L,"top===window:",window.top===window,"hasBody:",!!document.body,"parent===top:",window.parent===window.top);var A=null;function I(e){(document.body||document.documentElement).appendChild(e)}var S=null;function qe(e,t){let n=t?e.querySelector(t):e;n&&(n.style.cursor="grab",n.addEventListener("mousedown",o=>{if(o.target.closest('[role="button"]')||o.button!==0)return;o.preventDefault(),o.stopPropagation();let l=e.getBoundingClientRect();S={el:e,startX:o.clientX,startY:o.clientY,startLeft:l.left,startTop:l.top,pointerId:o.pointerId||0},n.style.cursor="grabbing",e.style.transition="none"}))}document.addEventListener("mousemove",e=>{if(!S)return;let t=e.clientX-S.startX,n=e.clientY-S.startY,o=S.startLeft+t,l=S.startTop+n,r=window.innerWidth,i=window.innerHeight,a=S.el.getBoundingClientRect();o=Math.max(0,Math.min(o,r-a.width)),l=Math.max(0,Math.min(l,i-a.height)),S.el.style.left=o+"px",S.el.style.top=l+"px"}),document.addEventListener("mouseup",()=>{if(!S)return;S.el.style.transition="";let e=S.el.querySelector(".aih-result-header")||S.el;e.style.cursor="grab",S=null});function _(){try{return typeof chrome!="object"||!chrome||typeof chrome.runtime!="object"||!chrome.runtime?!1:!!chrome.runtime.id}catch{return!1}}var ce=[{id:"ai-search",name:"AI\u641C\u7D22",systemPrompt:"\u4F60\u6B63\u5728\u5904\u7406\u7528\u6237\u5728\u7F51\u9875\u4E0A\u9009\u4E2D\u7684\u5185\u5BB9\u3002\u4F7F\u7528ReAct Agent\u6A21\u5F0F\uFF0C\u901A\u8FC7\u591A\u8F6E\u601D\u8003\u3001\u641C\u7D22\u548C\u63A8\u7406\u6765\u56DE\u7B54\u9009\u4E2D\u7684\u95EE\u9898\u3002",builtin:!0,order:0},{id:"explain",name:"\u89E3\u91CA",systemPrompt:"\u4F60\u6B63\u5728\u5904\u7406\u7528\u6237\u5728\u7F51\u9875\u4E0A\u9009\u4E2D\u7684\u5185\u5BB9\u3002\u75281-3\u53E5\u7B80\u6D01\u89E3\u91CA\u9009\u4E2D\u5185\u5BB9\uFF0C\u5FC5\u8981\u65F6\u8865\u5145\u4E00\u4E2A\u7B80\u77ED\u793A\u4F8B\u3002\u4E0D\u8981\u5C55\u5F00\u957F\u7BC7\u8BBA\u8FF0\u3002",builtin:!0,order:1},{id:"translate",name:"\u7FFB\u8BD1",systemPrompt:"\u4F60\u6B63\u5728\u5904\u7406\u7528\u6237\u5728\u7F51\u9875\u4E0A\u9009\u4E2D\u7684\u5185\u5BB9\u3002\u81EA\u52A8\u68C0\u6D4B\u8BED\u8A00\uFF1A\u4E2D\u6587\u2192\u82F1\u6587\uFF0C\u82F1\u6587\u2192\u4E2D\u6587\uFF0C\u5176\u4ED6\u8BED\u8A00\u2192\u540C\u65F6\u7ED9\u51FA\u4E2D\u82F1\u6587\u3002\u53EA\u8F93\u51FA\u7FFB\u8BD1\u7ED3\u679C\uFF0C\u4E0D\u6DFB\u52A0\u989D\u5916\u8BF4\u660E\u3002",builtin:!0,order:2},{id:"summary",name:"\u603B\u7ED3",systemPrompt:"\u4F60\u6B63\u5728\u5904\u7406\u7528\u6237\u5728\u7F51\u9875\u4E0A\u9009\u4E2D\u7684\u5185\u5BB9\u3002\u75283-5\u4E2A\u8981\u70B9\u603B\u7ED3\u9009\u4E2D\u5185\u5BB9\uFF0C\u6BCF\u6761\u8981\u70B9\u4E00\u53E5\u8BDD\uFF0C\u63D0\u70BC\u6838\u5FC3\u4FE1\u606F\u5373\u53EF\u3002",builtin:!0,order:3},{id:"copy",name:"\u590D\u5236",systemPrompt:"\u5C06\u9009\u4E2D\u5185\u5BB9\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",builtin:!0,order:99}];function Pe(){return new Promise(e=>{if(!_()){R=[...ce],e(R);return}if(R){e(R);return}try{chrome.storage.local.get(["toolbarTools","toolbarIconOnly"],t=>{let n=t.toolbarTools&&t.toolbarTools.length>0?t.toolbarTools:ce,o=new Map(ce.map(l=>[l.id,l]));R=n.map(l=>l.builtin&&o.has(l.id)?{...l,systemPrompt:o.get(l.id).systemPrompt}:l),Se=t.toolbarIconOnly||!1,e(R)})}catch{R=[...ce],e(R)}})}function Bt(){R=null,Se=!1,Pe()}function Be(e){return{"ai-search":E.search,explain:E.explain,translate:E.translate,summary:E.summary,copy:E.copy}[e]||E.sparkle}function Ft(){v||(v=document.createElement("div"),v.id="aih-overflow-dropdown",v.className="aih-overflow-dropdown",v.style.display="none",I(v),document.addEventListener("click",e=>{v&&v.style.display==="block"&&!v.contains(e.target)&&!e.target.closest(".aih-tb-btn-overflow")&&(v.style.display="none")}))}function Ht(e){v||Ft();let t=e.map(n=>{let o=Be(n.id);return`<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${n.id}">
      <span class="aih-tb-icon">${o}</span>${n.name}
    </div>`}).join("");t+='<div class="aih-dropdown-divider"></div>',t+=`<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="\u6253\u5F00\u914D\u7F6E\u9875\u9762">
    <span class="aih-tb-icon">${E.gear}</span>\u8BBE\u7F6E
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="\u6682\u65F6\u9690\u85CF\u76F4\u5230\u9875\u9762\u5237\u65B0">
    <span class="aih-tb-icon">${E.eyeOff}</span>\u672C\u6B21\u4E34\u65F6\u7981\u7528
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="\u5728\u6B64\u7F51\u7AD9\u7981\u7528\u5DE5\u5177\u680F">
    <span class="aih-tb-icon">${E.block}</span>\u5728\u6B64\u7F51\u7AD9\u7981\u7528
  </div>`,v.innerHTML=t,v._clickHandler=n=>{if(n.target.closest(".aih-dropdown-settings")){n.stopPropagation(),v.style.display="none";try{chrome.runtime.sendMessage({type:"OPEN_OPTIONS_PAGE",hash:"toolbar"}).catch(()=>{})}catch{}return}if(n.target.closest(".aih-dropdown-block")){n.stopPropagation(),n.preventDefault(),v.style.display="none",en();return}if(n.target.closest(".aih-dropdown-hide")){n.stopPropagation(),n.preventDefault(),v.style.display="none",De=!0,T(),K(),b="";return}let o=n.target.closest("[data-action]");o&&(n.stopPropagation(),v.style.display="none",ze(o.dataset.action,b))},v.addEventListener("click",v._clickHandler),v.addEventListener("keydown",n=>{if(n.key==="Enter"||n.key===" "){let o=n.target.closest('[role="button"]');o&&(n.preventDefault(),o.click())}})}async function jt(){if(m)return;await Pe();let e=[...R].sort((d,p)=>d.order-p.order),t=e.find(d=>d.id==="ai-search"),n=e.filter(d=>d.id!=="ai-search"&&d.id!=="copy"),o=n.slice(0,Ne-1),l=n.slice(Ne-1);m=document.createElement("div"),m.id="aih-selection-toolbar";let r='<span class="aih-tb-buttons">';r+=`<span class="aih-tb-grip" title="\u62D6\u62FD\u79FB\u52A8">${E.grip}</span>`;let i=Se;t&&(r+=`<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="AI \u641C\u7D22">
      <span class="aih-tb-icon">${E.search}</span>${i?"":"AI\u641C\u7D22"}
    </div>`),o.forEach(d=>{let p=Be(d.id);r+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="${d.id}" title="${d.name}">
      <span class="aih-tb-icon">${p}</span>${i?"":d.name}
    </div>`}),r+=`<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="\u66F4\u591A\u5DE5\u5177">
    <span class="aih-tb-icon">${E.more}</span>
  </div>`,Ht(l),r+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="\u590D\u5236\u9009\u4E2D\u5185\u5BB9">
    <span class="aih-tb-icon">${E.copy}</span>${i?"":"\u590D\u5236"}
  </div>`,r+="</span>",r+=`<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="\u95EE\u95EE..." />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="\u53D1\u9001">
      <span class="aih-tb-icon">${E.send}</span>
    </div>
  </span>`,m.innerHTML=r,m.addEventListener("click",d=>{if(d.target.closest(".aih-tb-btn-overflow")){d.stopPropagation();let y=d.target.closest(".aih-tb-btn-overflow").getBoundingClientRect();v&&(v.style.display=v.style.display==="block"?"none":"block",v.style.top=y.bottom+4+"px",v.style.left=y.right-160+"px");return}let p=d.target.closest("[data-action]");if(!p)return;d.stopPropagation();let f=p.dataset.action;ze(f,b)}),m.addEventListener("keydown",d=>{if(d.key==="Enter"||d.key===" "){let p=d.target.closest('[role="button"]');p&&!p.classList.contains("aih-tb-ask-send")&&(d.preventDefault(),p.click())}}),I(m);let a=m.querySelector(".aih-tb-ask-input"),s=m.querySelector(".aih-tb-ask-send");m.querySelector(".aih-tb-buttons");let c=()=>{let d=a.value.trim();if(d){let p=de;u(),a.value="",Wt(d,p),T()}},h=()=>{if(M)return;M=!0,de=b||"";let d=window.getSelection();d.rangeCount>0&&(ne=d.getRangeAt(0).cloneRange());let p=m.getBoundingClientRect().right;oe=m.style.left,m.classList.add("aih-ask-mode"),m.style.width="360px";let f=Math.max(8,p-360);m.style.left=f+"px",requestAnimationFrame(()=>{if(ne){let y=window.getSelection();y.removeAllRanges(),y.addRange(ne)}requestAnimationFrame(()=>{a.focus()})})},u=()=>{M&&(M=!1,de="",ne=null,m.classList.remove("aih-ask-mode"),m.style.width="",oe&&=(m.style.left=oe,""))};a.addEventListener("focus",()=>{M||h()}),a.addEventListener("mousedown",d=>{M||(d.preventDefault(),h())}),a.addEventListener("blur",()=>{setTimeout(()=>{M&&!m.contains(document.activeElement)&&(u(),T())},150)}),a.addEventListener("keydown",d=>{d.key==="Escape"?(d.preventDefault(),d.stopPropagation(),u(),a.blur()):d.key==="Enter"&&(d.preventDefault(),d.stopPropagation(),c())}),s.addEventListener("mousedown",d=>{d.preventDefault(),d.stopPropagation(),c()}),qe(m,".aih-tb-grip")}function Fe(){if(g)return;g=document.createElement("div"),g.id="aih-selection-result",g.innerHTML=`
    <div class="aih-result-header">
      <span>${E.sparkle} AI \u56DE\u7B54</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="\u9501\u5B9A\u7A97\u53E3">${E.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="\u5173\u95ED">${E.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="\u590D\u5236\u5168\u90E8\u5185\u5BB9">
          <span class="aih-tb-icon">${E.copyLarge}</span>\u590D\u5236
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="\u91CD\u65B0\u751F\u6210\u7B54\u6848">
          <span class="aih-tb-icon">${E.refresh}</span>\u91CD\u65B0\u751F\u6210
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
        <div class="aih-followup-send" role="button" tabindex="0" title="\u53D1\u9001\u5230\u4FA7\u8FB9\u680F">${E.send}</div>
      </span>
    </div>
  `,g.querySelector(".aih-result-close").addEventListener("click",t=>{t.stopPropagation(),K()}),g.querySelector(".aih-result-lock").addEventListener("click",t=>{t.stopPropagation(),Ut()}),g.querySelector(".aih-result-footer").addEventListener("click",t=>{t.stopPropagation();let n=t.target.closest("[data-action]")?.dataset?.action;if(n==="regenerate-result"){if(!ke||!fe)return;Te(ke,fe,Ce)}else n==="copy-result"&&Zt()});let e=g.querySelector(".aih-followup-input");g.querySelector(".aih-followup-send").addEventListener("click",t=>{t.stopPropagation();let n=e.value.trim();n&&(we(n),e.value="")}),e.addEventListener("keydown",t=>{if(t.key==="Enter"){t.preventDefault();let n=e.value.trim();n&&(we(n),e.value="")}}),g.querySelector(".aih-suggestions-list").addEventListener("click",t=>{let n=t.target.closest(".aih-suggestion-chip");if(!n)return;t.stopPropagation();let o=n.dataset.question;o&&we(o)}),g.addEventListener("keydown",t=>{if(t.key==="Enter"||t.key===" "){let n=t.target.closest('[role="button"]');n&&(t.preventDefault(),n.click())}}),I(g),qe(g,".aih-result-header")}function Ie(e,t,n,o=[]){if(!g)return;I(g);let l=window.innerWidth,r=window.innerHeight;g.style.display="flex",g.style.left="-9999px",g.style.top="-9999px";let i=g.querySelector(".aih-result-body");i.innerHTML=n;let a=g.querySelector(".aih-result-suggestions"),s=g.querySelector(".aih-suggestions-list");o.length>0&&a&&s?(s.innerHTML=o.map(c=>`<div class="aih-suggestion-chip" role="button" tabindex="0" data-question="${Q(c)}">${Q(c)}</div>`).join(""),a.style.display="block"):a&&(a.style.display="none"),requestAnimationFrame(()=>{let c=g.getBoundingClientRect(),h=c.width||420,u=Math.min(c.height||200,520),d=e-h/2;d<8&&(d=8),d+h>l-8&&(d=l-h-8);let p=t-u-8;p<8&&(p=t+8),g.style.left=d+"px",g.style.top=p+"px",g.style.maxHeight=Math.min(520,r-p-16)+"px",O=!0,I(g)})}function zt(e,t){if(!g)return;z={x:e,y:t},P=!1,ge();let n=g.querySelector(".aih-result-suggestions");n&&(n.style.display="none");let o=g.querySelector(".aih-followup-input");o&&(o.value=""),I(g),g.style.display="flex";let l=g.querySelector(".aih-result-body");l.innerHTML='<div class="aih-result-loading"><div class="aih-spinner"></div>AI \u6B63\u5728\u601D\u8003...</div>',je(g,e,t),O=!0,T()}function He(e,t,n){if(!g)return;P=!1,B="",ge(),I(g),g.style.display="flex";let o=g.querySelector(".aih-result-body");o.innerHTML=`<div class="aih-result-error">\u8BF7\u6C42\u5931\u8D25: ${Q(n)}</div>`,je(g,e,t),O=!0}function je(e,t,n){let o=window.innerWidth,l=window.innerHeight;e.style.left="-9999px",e.style.top="-9999px",requestAnimationFrame(()=>{let r=e.getBoundingClientRect(),i=r.width||420,a=Math.min(r.height||200,520),s=t-i/2;s<8&&(s=8),s+i>o-8&&(s=o-i-8);let c=n-a-8;c<8&&(c=n+8),e.style.left=s+"px",e.style.top=c+"px",e.style.maxHeight=Math.min(520,l-c-16)+"px",I(e)})}function K(){g&&(g.style.display="none",O=!1,P=!1,B="",ge())}function Ut(){P=!P,ge()}function ge(){if(!g)return;let e=g.querySelector(".aih-result-lock");e&&(P?(e.innerHTML=E.lock,e.classList.add("locked"),e.title="\u89E3\u9664\u9501\u5B9A"):(e.innerHTML=E.unlock,e.classList.remove("locked"),e.title="\u9501\u5B9A\u7A97\u53E3"))}function we(e){if(!e||!_())return;let t=b||fe||"";try{chrome.runtime.sendMessage({type:"DIRECT_SEND",text:e,selectedText:t}).catch(n=>{k.error("[SelectionToolbar] \u53D1\u9001\u8FFD\u95EE\u5230\u4FA7\u8FB9\u680F\u5931\u8D25:",n)})}catch{}}function Wt(e,t){if(!(!e||!_()))try{chrome.runtime.sendMessage({type:"DIRECT_SEND",text:e,selectedText:t||""}).catch(n=>{k.error("[SelectionToolbar] \u53D1\u9001\u5230\u4FA7\u8FB9\u680F\u5931\u8D25:",n)})}catch{}}function Q(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function ae(e,t){if(!m||!b||O)return;I(m);let n=window.innerWidth,o=window.innerHeight;m.style.display="flex",lastToolbarShowTime=Date.now(),requestAnimationFrame(()=>{let l=m.getBoundingClientRect(),r=l.width||300,i=l.height||40,a=e-r/2;a<8&&(a=8),a+r>n-8&&(a=n-r-8);let s=t-i-10;s<8&&(s=t+10),s<8&&(s=8),s+i>o-8&&(s=o-i-8),m.style.left=a+"px",m.style.top=s+"px",$||=(m.classList.add("show"),!0)})}function T(){!m||!$||(M&&(M=!1,de="",ne=null,m.classList.remove("aih-ask-mode"),m.style.width="",oe&&=(m.style.left=oe,"")),m.classList.remove("show"),m.style.display="none",$=!1)}function Gt(){if(!m)return{x:0,y:0};let e=m.getBoundingClientRect();return{x:e.left+e.width/2,y:e.top}}function Kt(e){let t=e.getBoundingClientRect();return{x:t.left+t.width/2,y:t.top}}function xe(){if(!_()||!le)return;if(!L){let r=U();if(k.debug("[SelectionToolbar] iframe onSelectionChange text:",r.text?.substring(0,30),"currentSelectedText:",!!b,"pendingIframeSelection:",!!A),r.text&&r.text.length>=2){let i=pe(r.range);A={text:r.text,x:i.x,y:i.y},k.debug("[SelectionToolbar] iframe pendingIframeSelection \u5DF2\u8BBE\u7F6E")}else if(b){b="",A=null;try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION_CLEAR"}).catch(()=>{})}catch{}}return}if(Z.length>0&&Z.includes(window.location.hostname)||De)return;let e=window.getSelection(),t=e?e.toString().trim():"",n=null;if(t&&t.length>=2&&e.rangeCount>0)n=e.getRangeAt(0);else{let r=U();r.text&&r.text.length>=2&&(t=r.text,n=r.range)}if(!t||t.length<2){M||T(),b="",F=null;return}let o=5e3,l=t.length>o?t.substring(0,o)+"...":t;if(n){let r=n.commonAncestorContainer,i=r.nodeType===Node.TEXT_NODE?r.parentElement.closest("[contenteditable], input, textarea"):r.closest&&r.closest("[contenteditable], input, textarea");if(i instanceof HTMLElement&&(i.tagName==="INPUT"||i.tagName==="TEXTAREA")){T(),b="",F=null;return}}b=l,F=!0}function Xt(e){if(!(m&&m.contains(e.target))&&!(g&&g.contains(e.target))){if(me){me=!1;return}O&&!P&&K(),$&&!M&&T(),chrome.runtime.sendMessage({type:"IFRAME_CLICK_DISMISS"}).catch(()=>{})}}function Yt(){if(k.debug("[SelectionToolbar] onMouseUp isTopFrame:",L,"pendingSelection:",F,"pendingIframeSelection:",!!A,"currentSelectedText:",!!b,"isToolbarVisible:",$,"toolbarEl:",!!m),!L){if(A){me=!0,A.text,b=A.text;try{window.parent.postMessage({type:"IFRAME_SELECTION",text:A.text,x:A.x,y:A.y},"*")}catch{}try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION",text:A.text,x:A.x,y:A.y}).catch(()=>{})}catch{}A=null}return}if(!$&&F&&b){me=!0;let e=window.innerWidth/2,t=window.innerHeight/2,n=window.getSelection();if(n&&n.rangeCount>0){let o=n.getRangeAt(0).getBoundingClientRect();(o.width>0||o.height>0)&&(e=o.left+o.width/2,t=o.top)}if(e===window.innerWidth/2&&t===window.innerHeight/2){let o=U();if(o.text&&o.text.length>=2){let l=pe(o.range);e=l.x,t=l.y}}chrome.runtime.sendMessage({type:"IFRAME_CLICK_DISMISS"}).catch(()=>{}),ae(e,t),F=null}}function Vt(){if(M)return;if(!L&&b){let n=U();if(n.text){let o=pe(n.range);try{window.parent.postMessage({type:"IFRAME_SELECTION",text:n.text,x:o.x,y:o.y},"*")}catch{}try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION",text:n.text,x:o.x,y:o.y}).catch(()=>{})}catch{}}return}if(!$)return;let e=window.getSelection();if(e&&e.rangeCount>0&&b){let n=e.getRangeAt(0).getBoundingClientRect();if(n.width>0||n.height>0){ae(n.left+n.width/2,n.top);return}}let t=U();if(t.text&&t.text.length>=2&&b){let n=pe(t.range);ae(n.x,n.y);return}T()}function Qt(){M||$&&T()}function ze(e,t){if(!t)return;if(fe=t,e==="copy"){Jt(t),T();return}if(ke=e,Ce="",["ai-search","explain","translate","summary"].includes(e)){Te(e,t);return}let n=R.find(o=>o.id===e);n&&(Ce=n.systemPrompt||"",Te(e,t,n.systemPrompt))}function Jt(e){Ue(e).then(()=>{Ge()}).catch(t=>{k.error("[SelectionToolbar] \u590D\u5236\u5931\u8D25:",t),We()})}function Zt(){let e=B;e&&Ue(e).then(()=>{Ge()}).catch(t=>{k.error("[SelectionToolbar] \u590D\u5236\u7ED3\u679C\u5931\u8D25:",t),We()})}async function Ue(e){if(!navigator.clipboard)return _e(e);try{await navigator.clipboard.writeText(e)}catch(t){if(t.name==="NotAllowedError"||t.name==="SecurityError")return _e(e);throw t}}function _e(e){return new Promise((t,n)=>{let o=document.createElement("textarea");o.value=e,o.style.position="fixed",o.style.left="-9999px",o.style.opacity="0",I(o);try{o.select(),o.setSelectionRange(0,e.length),document.execCommand("copy")?t():n(Error("execCommand copy failed"))}catch(l){n(l)}finally{o.remove()}})}function We(){let e=document.getElementById("aih-copy-toast");e&&e.remove();let t=document.createElement("div");t.id="aih-copy-toast",t.textContent="\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236",t.style.cssText=`
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
  `,I(t),t.style.zIndex="2147483647",setTimeout(()=>t.remove(),1800)}function Ge(){let e=document.getElementById("aih-copy-toast");e&&e.remove();let t=document.createElement("div");if(t.id="aih-copy-toast",t.textContent="\u5DF2\u590D\u5236",t.style.cssText=`
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
  `,!document.getElementById("aih-toast-anim")){let n=document.createElement("style");n.id="aih-toast-anim",n.textContent=`
      @keyframes aih-toast-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      @keyframes aih-toast-out { from { opacity: 1; } to { opacity: 0; } }
    `,document.head.appendChild(n)}I(t),t.style.zIndex="2147483647",setTimeout(()=>t.remove(),1300)}function Te(e,t,n){if(!_()){k.warn("[SelectionToolbar] \u6269\u5C55\u4E0A\u4E0B\u6587\u5DF2\u5931\u6548\uFF0C\u8BF7\u5237\u65B0\u9875\u9762");return}let o={"ai-search":`\u641C\u7D22\u5E76\u5206\u6790\u4EE5\u4E0B\u5185\u5BB9\uFF1A

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
\u95EE\u98983`},l=n?`\u8BF7\u5904\u7406\u4EE5\u4E0B\u5185\u5BB9\uFF1A

${t}`:o[e]||t;if(e==="ai-search"){T(),window.getSelection().removeAllRanges();try{chrome.runtime.sendMessage({type:"SELECTION_TOOLBAR_ACTION",action:e,text:t,prompt:l}).catch(s=>{k.error("[SelectionToolbar] \u53D1\u9001\u6D88\u606F\u5931\u8D25:",s)})}catch{}return}Fe();let r={"ai-search":"AI\u641C\u7D22",explain:"\u89E3\u91CA",translate:"\u7FFB\u8BD1",summary:"\u603B\u7ED3"}[e];if(!r&&R){let s=R.find(c=>c.id===e);r=s?s.name:"AI \u56DE\u7B54"}let i=g.querySelector(".aih-result-header span");i&&(i.innerHTML=`${E.sparkle} ${r||"AI \u56DE\u7B54"}`);let a=O&&g?Kt(g):Gt();zt(a.x,a.y),chrome.runtime.sendMessage({type:"SELECTION_TOOLBAR_ACTION",action:e,text:t,prompt:l,systemPrompt:n||""}).catch(s=>{k.error("[SelectionToolbar] \u53D1\u9001\u6D88\u606F\u5931\u8D25:",s),He(a.x,a.y,s.message)})}_()&&chrome.runtime.onMessage.addListener((e,t,n)=>{if(_()){if(e.type==="IFRAME_SELECTION"){if(!L)return;k.debug("[SelectionToolbar] \u6536\u5230 IFRAME_SELECTION text:",e.text?.substring(0,30),"isToolbarVisible:",$,"isResultVisible:",O),b=e.text;let o=e.x,l=e.y;if(window.top!==window&&window.frameElement)try{let r=window.frameElement.getBoundingClientRect();o=e.x-r.left,l=e.y-r.top}catch{}if($&&m&&b){requestAnimationFrame(()=>{let r=window.innerWidth,i=m.offsetWidth||300,a=m.offsetHeight||40,s=o-i/2;s<8&&(s=8),s+i>r-8&&(s=r-i-8);let c=l-a-8;c<8&&(c=l+8),m.style.left=s+"px",m.style.top=c+"px"});return}F={x:o,y:l},b&&b.length>=2&&ae(o,l);return}if(e.type==="IFRAME_SELECTION_CLEAR"){if(!L)return;$&&!M&&(T(),b="");return}if(e.type==="IFRAME_CLICK_DISMISS"){$&&m&&Date.now()-lastToolbarShowTime>300&&(T(),b=""),O&&!P&&K();return}if(L){if(e.type==="SELECTION_TOOLBAR_STREAM_START"){j="";return}if(e.type==="SELECTION_TOOLBAR_STREAM_CHUNK"){if(j+=e.delta||"",g&&O){let o=g.querySelector(".aih-result-body");o&&(o.querySelector(".aih-result-content-stream")||(o.innerHTML='<div class="aih-result-content-stream"></div>'),o.innerHTML='<div class="aih-result-content-stream">'+Q(j).replace(/\n/g,"<br>")+"</div>")}return}if(e.type==="SELECTION_TOOLBAR_STREAM_DONE"){e.finalContent&&(j=e.finalContent);let o=j||"\u65E0\u54CD\u5E94";B=j;let l=o,r=[],i=o.indexOf("---SUGGESTIONS---");i!==-1&&(l=o.substring(0,i).trim(),B=l,r=o.substring(i+17).split(`
`).map(s=>s.replace(/^[\d]+[\.\、\s]+/,"").trim()).filter(s=>s.length>0).slice(0,3));let a=typeof marked<"u"?marked.parse(l):Q(l).replace(/\n/g,"<br>");Ie(z.x,z.y,a,r),j="";return}if(e.type==="SELECTION_TOOLBAR_RESULT")if(e.error)B="",He(z.x,z.y,e.error);else{let o=e.content||"\u65E0\u54CD\u5E94",l=o;B=o;let r=[],i=o.indexOf("---SUGGESTIONS---");i!==-1&&(l=o.substring(0,i).trim(),B=l,r=o.substring(i+17).split(`
`).map(s=>s.replace(/^[\d]+[\.\、\s]+/,"").trim()).filter(s=>s.length>0).slice(0,3));let a=typeof marked<"u"?marked.parse(l):Q(l).replace(/\n/g,"<br>");Ie(z.x,z.y,a,r)}}}});function en(){if(!_())return;let e=window.location.hostname;try{chrome.storage.local.get(["blockedDomains"],t=>{try{let n=t.blockedDomains||[];n.includes(e)||(n.push(e),chrome.storage.local.set({blockedDomains:n},()=>{Z=n,T(),K(),b=""}))}catch{}})}catch{}}function tn(){_()&&chrome.storage.local.get(["enableSelectionToolbar","blockedDomains"],e=>{le=e.enableSelectionToolbar===void 0?!0:!!e.enableSelectionToolbar,Z=e.blockedDomains||[],k.debug("[SelectionToolbar] \u5F00\u5173\u72B6\u6001:",le?"\u5DF2\u542F\u7528":"\u5DF2\u7981\u7528","\u5C4F\u853D\u57DF\u540D:",Z.length)})}_()&&chrome.storage.onChanged.addListener((e,t)=>{_()&&(t==="local"&&e.enableSelectionToolbar&&(le=!!e.enableSelectionToolbar.newValue,le||(T(),K(),b="")),t==="local"&&e.blockedDomains&&(Z=e.blockedDomains.newValue||[]),t==="local"&&e.toolbarTools&&Bt())});function nn(){Pt(),jt(),Fe(),tn(),document.addEventListener("selectionchange",xe),document.addEventListener("click",Xt,!0),document.addEventListener("mouseup",Yt,!0),window.addEventListener("scroll",Vt,!0),window.addEventListener("resize",Qt),window.addEventListener("message",e=>{if(e.data?.type==="IFRAME_SELECTION"&&L){b=e.data.text;let t=e.data.x,n=e.data.y;if(window.top!==window&&window.frameElement)try{let o=window.frameElement.getBoundingClientRect();t=e.data.x-o.left,n=e.data.y-o.top}catch{}if($&&m&&b){requestAnimationFrame(()=>{let o=window.innerWidth,l=m.offsetWidth||300,r=m.offsetHeight||40,i=t-l/2;i<8&&(i=8),i+l>o-8&&(i=o-l-8);let a=n-r-8;a<8&&(a=n+8),m.style.left=i+"px",m.style.top=a+"px"});return}F={x:t,y:n},b&&b.length>=2&&ae(t,n);return}e.data?.type==="IFRAME_CLICK_DISMISS"&&L&&O&&!P&&K()}),L&&(be=ve(xe),new MutationObserver(()=>{tt(be),be=ve(xe)}).observe(document.body,{childList:!0,subtree:!0})),k.debug("[SelectionToolbar] \u521D\u59CB\u5316\u5B8C\u6210",L?"(\u9876\u5C42frame)":"(\u5B50frame)")}console.log("[ContentScript] \u5185\u5BB9\u811A\u672C\u5DF2\u52A0\u8F7D URL:",window.location.href,"isTopFrame:",window.top===window,"hasBody:",!!document.body),document.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==="A"&&(e.preventDefault(),chrome.action.click()),e.altKey&&!e.shiftKey&&e.code==="KeyS"&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:"CAPTURE_TAB_FROM_PAGE"})),e.altKey&&e.shiftKey&&e.code==="KeyS"&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:"CAPTURE_REGION_FROM_PAGE"}))});var rn={GET_PAGE_TEXT:e=>mt(e),GET_FULL_HTML:e=>gt(e),QUERY_ELEMENTS:e=>ut(e),GET_SELECTED_CONTENT:e=>yt(e.format),INTERACT_ELEMENT:e=>e.ref==null?e.text?Nt(e.text,{tag:e.tag,action:e.action,waitTime:e.waitTime,timeout:e.timeout}):e.action==="hover"?vt(e.selector):kt(e.selector,e.waitTime,e.timeout):pt(e.ref,e.action,{waitTime:e.waitTime,timeout:e.timeout}),FILL_FORM:e=>Tt(e.fields,e.waitTime),SCROLL_TO:e=>e.target==="text"&&e.text?ft(e.text,{maxScrolls:e.maxScrolls,pauseMs:e.pauseMs}):St(e),KEYBOARD_INPUT:e=>Lt(e),FILE_UPLOAD:e=>$t(e.selector,e.fileName,e.fileContent,e.fileType),EXTRACT_TABLE:e=>bt(e.selector,e.includeHeaders,e.format),EXTRACT_METADATA:()=>ot(),EXTRACT_LINKS:e=>it(e.filterType,e.includeImages),EXTRACT_FORMS:e=>lt(e.formSelector),EXTRACT_IMAGES:e=>at(e),SEARCH_IN_PAGE:e=>ct(e),IFRAME_CONTENT:e=>st(e.selector,e.includeNested,e.maxLength),SCROLL_COLLECT:e=>ht(e),HIGHLIGHT_TEXT:e=>Et(e.text,e.color),MANAGE_STORAGE:e=>_t(e),INJECT_CSS:e=>qt(e.css,e.targetSelector,e.injectMode),COPY_TO_CLIPBOARD:e=>wt(e.text),PASTE_FROM_CLIPBOARD:()=>xt(),WAIT_ELEMENT:e=>At(e.selector,e.state,e.timeout),DRAG_DROP:e=>Rt(e.sourceSelector,e.targetSelector),SELECT_DROPDOWN:e=>{let t=e.triggerSelector;return e.ref!=null&&!t&&(t=dt(e.ref),!t)?{success:!1,error:`\u65E0\u6548\u7684\u5143\u7D20\u7F16\u53F7 ref=${e.ref}\uFF0C\u8BF7\u5148\u8C03\u7528 query_elements`}:It(t,e.optionText,e.optionSelector,e.timeout)},QRCODE:e=>Dt(e.content,e.size,e.errorCorrection,e.showImage),CLEAR_DATA:e=>{try{let t=[];return e.site?window.location.href.includes(new URL(e.site).hostname)&&(localStorage.clear(),sessionStorage.clear(),t.push("localStorage","sessionStorage")):(localStorage.clear(),sessionStorage.clear(),t.push("localStorage","sessionStorage")),{success:!0,cleared:t}}catch(t){return{success:!1,error:t.message}}},START_REGION_SELECTION:()=>an(),GET_PAGE_METRICS:()=>({width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth||0,window.innerWidth),height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight||0,window.innerHeight)})},on=new Set(["COPY_TO_CLIPBOARD","PASTE_FROM_CLIPBOARD","WAIT_ELEMENT","DRAG_DROP","SELECT_DROPDOWN","QRCODE","START_REGION_SELECTION","INTERACT_ELEMENT","SCROLL_TO","KEYBOARD_INPUT"]),ln=new Set(["GET_PAGE_TEXT","GET_FULL_HTML","EXTRACT_METADATA","EXTRACT_TABLE","IFRAME_CONTENT","QUERY_ELEMENTS","INTERACT_ELEMENT","SCROLL_TO"]);_()&&chrome.runtime.onMessage.addListener((e,t,n)=>{if(ln.has(e.type)&&window.top!==window)return;if(e.action==="getSelectedText"){let r=window.getSelection()?.toString()?.trim()||"";if(r&&document.hasFocus())return n({text:r}),!0;let i=U();return i.text&&i.text.trim()&&document.hasFocus()&&n({text:i.text.trim()}),!0}let o=rn[e.type];if(!o)return;let l=o(e);if(on.has(e.type)||l instanceof Promise)return Promise.resolve(l).then(n),!0;n(l)}),nn();function an(){return new Promise(e=>{let t=document.createElement("div");t.id="__region_select_overlay__",t.style.cssText=`
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 2147483647; cursor: crosshair;
      background: rgba(0, 0, 0, 0.15);
    `;let n=document.createElement("div");n.id="__region_select_box__",n.style.cssText=`
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
    `,o.textContent="\u62D6\u62FD\u9009\u62E9\u622A\u56FE\u533A\u57DF\uFF0C\u6309 Esc \u53D6\u6D88";let l=0,r=0,i=!1;function a(u){return{x:u.clientX,y:u.clientY}}function s(u,d,p,f){let y=Math.min(u,p),w=Math.min(d,f),x=Math.abs(p-u),N=Math.abs(f-d);n.style.left=y+"px",n.style.top=w+"px",n.style.width=x+"px",n.style.height=N+"px",n.style.display="block"}function c(){t.remove(),n.remove(),o.remove(),document.removeEventListener("keydown",h,!0)}function h(u){u.key==="Escape"&&(u.preventDefault(),u.stopPropagation(),c(),e(null))}t.addEventListener("mousedown",u=>{if(u.button!==0)return;u.preventDefault(),u.stopPropagation();let{x:d,y:p}=a(u);l=d,r=p,i=!0,document.body.appendChild(n),document.body.appendChild(o)}),t.addEventListener("mousemove",u=>{if(!i)return;u.preventDefault();let{x:d,y:p}=a(u);s(l,r,d,p)}),t.addEventListener("mouseup",u=>{if(!i)return;u.preventDefault(),u.stopPropagation(),i=!1;let{x:d,y:p}=a(u),f={x:Math.min(l,d),y:Math.min(r,p),width:Math.abs(d-l),height:Math.abs(p-r)};if(c(),f.width<10||f.height<10){e(null);return}requestAnimationFrame(()=>e(f))}),document.addEventListener("keydown",h,!0),document.body.appendChild(t)})}})();
