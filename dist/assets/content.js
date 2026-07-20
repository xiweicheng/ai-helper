(()=>{var K={DEBUG:0,INFO:1,WARN:2,ERROR:3},z=K.DEBUG;function Ue(e){z=e}function Ge(){return z}function We(...e){z<=K.DEBUG&&console.debug("[AIH]",...e)}function Ke(...e){z<=K.INFO&&console.info("[AIH]",...e)}function Xe(...e){z<=K.WARN&&console.warn("[AIH]",...e)}function Ve(...e){z<=K.ERROR&&console.error("[AIH]",...e)}var E={debug:We,info:Ke,warn:Xe,error:Ve,setLogLevel:Ue,getLogLevel:Ge};function N(e,t=document,n=5,o=0){if(o>n)return null;try{if(t.querySelectorAll)for(let r of t.querySelectorAll("*")){if(r.shadowRoot){let a=N(e,r.shadowRoot,n,o+1);if(a)return a}if(r.tagName==="IFRAME"||r.tagName==="FRAME")try{let a=r.contentDocument||r.contentWindow?.document;if(a){let l=N(e,a,n,o+1);if(l)return l}}catch{}}let i=t.querySelector?.(e);if(i)return i}catch{}return null}function Q(e,t=document,n=5,o=0,i=new Set){if(o>n)return[];try{t.querySelectorAll&&(t.querySelectorAll(e).forEach(r=>{i.add(r)}),t.querySelectorAll("*").forEach(r=>{if(r.shadowRoot&&Q(e,r.shadowRoot,n,o+1,i),r.tagName==="IFRAME"||r.tagName==="FRAME")try{let a=r.contentDocument||r.contentWindow?.document;a&&Q(e,a,n,o+1,i)}catch{}}))}catch{}return Array.from(i)}function F(e=document,t=5,n=0){if(n>t)return{text:"",range:null};try{let o=e.getSelection?.();if(o&&!o.isCollapsed&&o.rangeCount>0){let i=o.toString().trim();if(i)return{text:i,range:o.getRangeAt(0),depth:n,source:"shadow"}}if(e.querySelectorAll){for(let i of e.querySelectorAll("*"))if(i.shadowRoot){let r=F(i.shadowRoot,t,n+1);if(r.text)return r}}}catch{}return{text:"",range:null}}function ie(e=document,t=5,n=0,o=new Set){if(n>t||o.has(e))return"";o.add(e);let i="";try{e.body?i+=e.body.innerText||"":e instanceof ShadowRoot&&(i+=e.textContent||""),e.querySelectorAll&&e.querySelectorAll("*").forEach(r=>{if(r.shadowRoot&&(i+=`
`+ie(r.shadowRoot,t,n+1,o)),r.tagName==="IFRAME"||r.tagName==="FRAME")try{let a=r.contentDocument||r.contentWindow?.document;a&&a.body&&(i+=`
`+ie(a,t,n+1,o))}catch{}})}catch{}return i.trim().replace(/\n{3,}/g,`

`)}function ae(e=document,t=5,n=0,o=new Set){if(n>t||o.has(e))return"";o.add(e);let i="";try{e.documentElement?i=e.documentElement.outerHTML:e instanceof ShadowRoot&&(i=e.innerHTML||"");let r=[];e.querySelectorAll&&e.querySelectorAll("*").forEach(a=>{if(a.shadowRoot){let l=ae(a.shadowRoot,t,n+1,o);l&&r.push(`<!-- shadow-root of ${a.tagName} -->
${l}`)}if(a.tagName==="IFRAME"||a.tagName==="FRAME")try{let l=a.contentDocument||a.contentWindow?.document;if(l&&l.documentElement){let s=ae(l,t,n+1,o);s&&r.push(`<!-- iframe content -->
${s}`)}}catch{}}),r.length>0&&(i+=`
<!-- Shadow DOM and iframe content -->
`+r.join(`
`))}catch{}return i}function le(e){if(!e)return{x:window.innerWidth/2,y:window.innerHeight/2};let t;try{t=e.getBoundingClientRect()}catch{t={left:0,top:0,width:0,height:0}}if(!t||t.width===0&&t.height===0){let i=e.commonAncestorContainer;if(i){let r=i.nodeType===Node.TEXT_NODE?i.parentElement:i;r&&r.getBoundingClientRect&&(t=r.getBoundingClientRect())}}let n=t.left+t.width/2,o=t.top;if(window.top!==window){let i=e.startContainer.ownerDocument;for(;i&&i!==window.top.document;){let r=i.defaultView?.frameElement;if(!r)break;let a=r.getBoundingClientRect();n+=a.left,o+=a.top,i=r.ownerDocument}}return{x:n,y:o}}function me(e,t=document,n=5,o=0,i=new Set){if(o>n||i.has(t))return i;try{let r=()=>e();t.addEventListener?.("selectionchange",r),i.add({root:t,listener:r}),t.querySelectorAll&&t.querySelectorAll("*").forEach(a=>{a.shadowRoot&&me(e,a.shadowRoot,n,o+1,i)})}catch{}return i}function Ye(e){for(let{root:t,listener:n}of e)try{t.removeEventListener?.("selectionchange",n)}catch{}e.clear()}function se(e){if(e.id)return`#${e.id}`;let t=[],n=e;for(;n&&n!==document.body&&n!==document.documentElement;){let o=n.tagName.toLowerCase();if(n.id){o=`#${n.id}`,t.unshift(o);break}if(n.className&&typeof n.className=="string"){let r=n.className.trim().split(/\s+/).filter(a=>a);r.length>0&&(o+="."+r[0])}let i=n.parentElement;if(i){let r=Array.from(i.children).filter(a=>a.tagName===n.tagName);if(r.length>1){let a=r.indexOf(n)+1;o+=`:nth-child(${a})`}}t.unshift(o),n=i}return t.join(" > ")}function Qe(e){if(e.tagName==="INPUT"||e.tagName==="TEXTAREA")return e.value||e.placeholder||e.name||"";if(e.tagName==="SELECT"){let t=e.options[e.selectedIndex];return t?t.text:""}return e.textContent.trim()}function Je(e){return e.tagName==="INPUT"?e.type==="checkbox"||e.type==="radio"?e.checked?"checked":"unchecked":e.value:e.tagName==="SELECT"?e.value:""}function V(e){if(e.id)return`#${e.id}`;let t=e.tagName.toLowerCase();if(e.className){let n=e.className.split(" ").filter(o=>o).slice(0,2);n.length&&(t+="."+n.join("."))}return t}function Ee(){document.querySelectorAll(".ai-helper-highlight").forEach(t=>{let n=t.parentNode;if(n&&n.insertBefore&&n.removeChild){for(;t.firstChild;)n.insertBefore(t.firstChild,t);n.removeChild(t),typeof n.normalize=="function"&&n.normalize()}});let e=document.getElementById("ai-helper-highlight-style");e&&e.remove()}function Ze(){try{let e=i=>{let r=document.querySelector(`meta[name="${i}"]`)||document.querySelector(`meta[property="${i}"]`)||document.querySelector(`meta[property="og:${i}"]`);return r?r.content:null},t=i=>{let r=document.querySelectorAll(`meta[name="${i}"], meta[property="${i}"], meta[property="og:${i}"]`);return Array.from(r).map(a=>a.content).filter(Boolean)},n=[];document.querySelectorAll('script[type="application/ld+json"]').forEach(i=>{try{let r=JSON.parse(i.textContent);Array.isArray(r)?n.push(...r):r&&r["@graph"]&&Array.isArray(r["@graph"])?n.push(...r["@graph"]):r&&n.push(r)}catch{}});let o=[];return document.querySelectorAll("[itemscope]").forEach(i=>{let r=i.getAttribute("itemtype")||"";if(!r)return;let a={};i.querySelectorAll("[itemprop]").forEach(l=>{if(l.closest("[itemscope]")!==i)return;let s=l.getAttribute("itemprop")||"";if(!s)return;let d=l.getAttribute("content")||l.getAttribute("href")||l.getAttribute("src")||l.textContent?.trim();d&&(a[s]?a[s]=Array.isArray(a[s])?[...a[s],d]:[a[s],d]:a[s]=d)}),o.push({itemType:r,properties:a})}),{success:!0,data:{title:document.title,description:e("description"),keywords:e("keywords"),author:e("author"),ogTitle:e("og:title"),ogDescription:e("og:description"),ogImage:e("og:image"),ogUrl:e("og:url"),ogType:e("og:type"),ogSiteName:e("og:site_name"),ogLocale:e("og:locale"),articlePublishedTime:e("article:published_time"),articleModifiedTime:e("article:modified_time"),articleAuthor:e("article:author"),twitterCard:e("twitter:card"),twitterTitle:e("twitter:title"),twitterDescription:e("twitter:description"),twitterImage:e("twitter:image"),twitterSite:e("twitter:site"),twitterCreator:e("twitter:creator"),canonicalUrl:document.querySelector('link[rel="canonical"]')?.href,links:t("citation_author"),jsonLd:n.length>0?n:void 0,microdata:o.length>0?o:void 0}}}catch(e){return{success:!1,error:e.message}}}function et(e="all",t=!1){try{let n=window.location.hostname,o=[];return document.querySelectorAll("a[href]").forEach(i=>{try{let r=i.href;if(!r||r.startsWith("javascript:")||r.startsWith("#"))return;let a=new URL(r),l=a.hostname!==n;if(e==="internal"&&l||e==="external"&&!l)return;o.push({href:r,text:i.textContent.trim(),title:i.title,domain:a.hostname,isExternal:l,target:i.target})}catch{}}),t&&document.querySelectorAll("img[src]").forEach(i=>{try{let r=i.src;if(!r)return;let a=new URL(r),l=a.hostname!==n;if(e==="internal"&&l||e==="external"&&!l)return;o.push({href:r,text:i.alt||"",title:i.title,domain:a.hostname,isExternal:l,type:"image"})}catch{}}),{success:!0,total:o.length,links:o}}catch(n){return{success:!1,error:n.message}}}function tt(e=null){try{let t=(e?[document.querySelector(e)].filter(Boolean):Array.from(document.querySelectorAll("form"))).map((n,o)=>{let i=[],r=n.id||`form-${o}`;return n.querySelectorAll("input").forEach(a=>{i.push({tag:"input",name:a.name,id:a.id,type:a.type,placeholder:a.placeholder,required:a.required,selector:V(a)})}),n.querySelectorAll("textarea").forEach(a=>{i.push({tag:"textarea",name:a.name,id:a.id,placeholder:a.placeholder,required:a.required,selector:V(a)})}),n.querySelectorAll("select").forEach(a=>{let l=Array.from(a.options).map(s=>({value:s.value,text:s.textContent.trim()}));i.push({tag:"select",name:a.name,id:a.id,required:a.required,options:l,selector:V(a)})}),{formId:r,action:n.action,method:n.method,fields:i}});return{success:!0,total:t.length,forms:t}}catch(t){return{success:!1,error:t.message}}}function nt(e={}){try{let{minWidth:t=0,minHeight:n=0,includeBackgroundImages:o=!1,download:i=!1,maxResults:r=100}=e,a=[],l=new Set;return document.querySelectorAll("img[src]").forEach(s=>{try{let d=s.src;if(!d||l.has(d))return;let h=s.naturalWidth||s.width||0,u=s.naturalHeight||s.height||0;h>=t&&u>=n&&(l.add(d),a.push({src:d,alt:s.alt||"",title:s.title||"",width:h,height:u,selector:V(s)}))}catch{}}),o&&document.querySelectorAll("*").forEach(s=>{try{let d=window.getComputedStyle(s).backgroundImage;if(!d||d==="none"||d.startsWith("gradient"))return;let h=d.match(/url\(['"]?([^'")]+)['"]?\)/);if(h&&h[1]){let u=h[1];l.has(u)||(l.add(u),a.push({src:u,alt:"",title:"",width:0,height:0,type:"background",selector:V(s)}))}}catch{}}),i&&a.length>0&&a.slice(0,Math.min(r,10)).forEach((s,d)=>{setTimeout(()=>{let h=document.createElement("a");h.href=s.src,h.download=`image_${d+1}.png`,document.body.appendChild(h),h.click(),document.body.removeChild(h)},d*500)}),{success:!0,total:a.length,images:a.slice(0,r),message:i?`\u5DF2\u5F00\u59CB\u4E0B\u8F7D ${Math.min(a.length,10)} \u5F20\u56FE\u7247`:""}}catch(t){return{success:!1,error:t.message}}}function rt(e="iframe",t=!1,n=1e4){try{let o=document.querySelectorAll(e),i=[],r=(a,l=1,s="")=>{try{let d=se(a),h=s?`${s} > iframe`:d,u=a.src||"about:blank",c=!1,p="",g="",b=0;try{let v=a.contentDocument||a.contentWindow?.document;v&&(c=!0,p=v.title||"",g=ie(v).substring(0,n),b=ae(v).length,t&&l<2&&v.querySelectorAll("iframe").forEach(L=>{r(L,l+1,h)}))}catch{c=!1}i.push({selector:h,url:u,accessible:c,title:p,textContent:g,htmlLength:b})}catch{}};return o.forEach(a=>r(a)),{success:!0,iframes:i,total:i.length,accessible:i.filter(a=>a.accessible).length}}catch(o){return{success:!1,error:o.message}}}function ot(e={}){try{let{query:t,pattern:n,mode:o="plain",caseSensitive:i=!1,contextLength:r=50,maxResults:a=20,highlight:l=!1}=e,s=t||n;if(!s)return{success:!1,error:"\u9700\u8981\u63D0\u4F9B\u641C\u7D22\u5173\u952E\u8BCD"};if(o==="plain"){let g=window.find(s,i,!1,!0,!1,!0,!1),b=0,v=[];try{let L=window.getSelection(),j=L&&L.rangeCount>0?L.getRangeAt(0):null,ee=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),Pe=i?"g":"gi",Fe=s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),He=new RegExp(Fe,Pe),te=document.body.innerText,we=0;for(;ee.nextNode();){let ve=ee.currentNode.textContent.match(He);if(ve)for(let ne of ve){if(v.length>=a)break;let W=te.indexOf(ne,we),je=Math.max(0,W-r),ze=Math.min(te.length,W+ne.length+r);v.push({match:ne,position:W,context:te.substring(je,ze),lineNumber:te.substring(0,W).split(`
`).length}),b++,we=W+ne.length}if(v.length>=a)break}j&&(L.removeAllRanges(),L.addRange(j))}catch{b=+!!g}if(l&&b>0){Ee();let L=document.createElement("style");L.id="ai-helper-highlight-style",L.textContent=`
          .ai-helper-search-highlight {
            background-color: #ffff00;
            color: #000;
            padding: 1px 2px;
            border-radius: 2px;
          }
        `,document.head.appendChild(L);let j=i?"g":"gi",ee=s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");document.body.innerHTML=document.body.innerHTML.replace(new RegExp(ee,j),'<span class="ai-helper-search-highlight">$&</span>')}return{success:!0,query:s,mode:"plain",found:g,total:b,matches:v,highlighted:l}}let d=i?"g":"gi",h=new RegExp(s,d),u=document.body.innerText,c=[],p;for(;(p=h.exec(u))!==null&&c.length<a;){let g=Math.max(0,p.index-r),b=Math.min(u.length,p.index+p[0].length+r);c.push({match:p[0],position:p.index,context:u.substring(g,b),lineNumber:u.substring(0,p.index).split(`
`).length}),p[0].length===0&&h.lastIndex++}if(l&&c.length>0){Ee();let g=document.createElement("style");g.id="ai-helper-highlight-style",g.textContent=`
        .ai-helper-search-highlight {
          background-color: #ffff00;
          color: #000;
          padding: 1px 2px;
          border-radius: 2px;
        }
      `,document.head.appendChild(g),document.body.innerHTML=document.body.innerHTML.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"),d),'<span class="ai-helper-search-highlight">$&</span>')}return{success:!0,pattern:s,mode:"regex",total:c.length,matches:c,highlighted:l}}catch(t){return{success:!1,error:t.message}}}function it(e={}){let{filterByText:t,elementTypes:n,maxResults:o=100}=e,i=[],r=new Set,a={button:'button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]',input:'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"])',select:"select",textarea:"textarea",a:"a[href]",checkbox:'input[type="checkbox"]',radio:'input[type="radio"]',menuitem:'[role="menuitem"], [role="menu"], [role="menuitemcheckbox"], [role="menuitemradio"]'},l=[];return n&&n.length>0?n.forEach(s=>{a[s]&&l.push(a[s])}):l=Object.values(a),l.forEach(s=>{try{Q(s).forEach(d=>{let h=se(d);if(r.has(h))return;r.add(h);let u=d.tagName.toLowerCase(),c=Qe(d),p=Je(d);if(t&&!c.toLowerCase().includes(t.toLowerCase()))return;let g={tag:u,selector:h,text:c.substring(0,100)};u==="a"?g.href=d.href:(u==="input"||u==="select"||u==="textarea")&&(g.name=d.name,g.type=d.type||"text",g.value=p,g.placeholder=d.placeholder),d.id&&(g.id=d.id),d.className&&typeof d.className=="string"&&(g.className=d.className.split(" ").filter(b=>b).slice(0,3).join(" ")),i.push(g)})}catch{}}),{success:!0,count:Math.min(i.length,o),total:i.length,elements:i.slice(0,o)}}function at(e,t=50){try{if(!e)return{success:!1,error:"\u9009\u62E9\u5668\u4E0D\u80FD\u4E3A\u7A7A"};let n=N(e);if(!n)return{success:!1,error:`\u672A\u627E\u5230\u76EE\u6807\u5143\u7D20: ${e}`};let o=l=>{let s=l.tagName.toLowerCase(),d=l.classList?Array.from(l.classList).sort().join("."):"",h={};return Array.from(l.children).forEach(u=>{let c=u.tagName.toLowerCase();h[c]=(h[c]||0)+1}),`${s}|${d}|${Object.keys(h).sort().map(u=>`${u}:${h[u]}`).join(",")}`},i=o(n),r=[],a=document.querySelectorAll(n.tagName.toLowerCase());for(let l of a)if(l!==n){if(r.length>=t)break;o(l)===i&&r.push({tag:l.tagName.toLowerCase(),selector:se(l),text:(l.textContent||"").trim().substring(0,200),id:l.id||"",className:typeof l.className=="string"?l.className:""})}return{success:!0,original:{tag:n.tagName.toLowerCase(),selector:se(n),text:(n.textContent||"").trim().substring(0,200),signature:i},similar:r,count:r.length}}catch(n){return{success:!1,error:n.message}}}function lt(e={}){let{maxLength:t=5e4,includeHeadings:n=!0,includeLinks:o=!0}=e,i=ie(),r={title:document.title||"",url:window.location.href,content:i.substring(0,t),wordCount:i.split(/\s+/).length};return n&&(r.headings=Array.from(Q("h1, h2, h3, h4, h5, h6")).map(a=>({level:a.tagName,text:a.textContent.trim()})).filter(a=>a.text.length>0).slice(0,30)),o&&(r.links=Array.from(Q("a")).map(a=>({text:a.textContent.trim(),href:a.href})).filter(a=>a.text.length>0).slice(0,50)),{success:!0,data:r}}function st(e={}){let{includeStyles:t=!1,maxLength:n=5e4}=e,o=ae();return t||(o=o.replace(/\s*style="[^"]*"/gi,"")),{success:!0,content:JSON.stringify({title:document.title,url:window.location.href,html:o.substring(0,n),fullLength:o.length})}}function ct(e="text"){try{let t=window.getSelection();if(!t||t.isCollapsed||t.rangeCount===0)return{success:!1,error:"\u5F53\u524D\u6CA1\u6709\u9009\u4E2D\u7684\u5185\u5BB9"};let n={success:!0,data:{selectedCount:t.rangeCount,text:""}};if(e==="html"){let o=[];for(let i=0;i<t.rangeCount;i++){let r=t.getRangeAt(i).cloneContents(),a=document.createElement("div");a.appendChild(r),o.push(a.innerHTML)}n.data.html=o.join(`
`),n.data.text=t.toString()}else n.data.text=t.toString();return n}catch(t){return{success:!1,error:t.message}}}function dt(e="table",t=!0,n="json"){try{let o=N(e);if(!o)return{success:!1,error:`\u672A\u627E\u5230\u5339\u914D\u9009\u62E9\u5668\u7684\u8868\u683C: ${e}`};let i=Array.from(o.querySelectorAll("tr")),r=[];return i.forEach((a,l)=>{let s=Array.from(a.querySelectorAll("td, th")).map(d=>d.textContent.trim());(t||l>0)&&r.push(s)}),n==="markdown"?r.length===0?{success:!0,content:"\u8868\u683C\u4E3A\u7A7A"}:{success:!0,content:`${`| ${r[0].join(" | ")} |`}
${`| ${r[0].map(()=>"---").join(" | ")} |`}
${r.slice(1).map(a=>`| ${a.join(" | ")} |`).join(`
`)}`}:{success:!0,content:JSON.stringify({data:r,rowCount:r.length,columnCount:r[0]?.length||0}),data:r}}catch(o){return{success:!1,error:o.message}}}async function ut(e){try{return await navigator.clipboard.writeText(e),{success:!0,message:"\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F"}}catch{try{let t=document.createElement("textarea");return t.value=e,t.style.position="fixed",t.style.left="-9999px",document.body.appendChild(t),t.select(),document.execCommand("copy"),document.body.removeChild(t),{success:!0,message:"\u5DF2\u590D\u5236\u5230\u526A\u8D34\u677F\uFF08\u964D\u7EA7\u65B9\u6848\uFF09"}}catch(t){return{success:!1,error:t.message}}}}async function ht(){try{return{success:!0,content:await navigator.clipboard.readText()}}catch(e){return{success:!1,error:e.message}}}function pt(e){try{let t=N(e);if(!t)return{success:!1,error:`\u672A\u627E\u5230\u5143\u7D20: ${e}`};let n=new MouseEvent("mouseenter",{bubbles:!0,cancelable:!0,view:window});t.dispatchEvent(n);let o=new MouseEvent("mouseover",{bubbles:!0,cancelable:!0,view:window});return t.dispatchEvent(o),{success:!0,message:`\u5DF2\u5728\u5143\u7D20\u4E0A\u89E6\u53D1\u60AC\u505C\u6548\u679C: ${e}`}}catch(t){return{success:!1,error:t.message}}}function ft(e,t="yellow"){try{if(!e)return{success:!1,error:"\u672A\u63D0\u4F9B\u8981\u9AD8\u4EAE\u7684\u6587\u672C"};removeHighlights();let n=document.createElement("style");n.id="ai-helper-highlight-style",n.textContent=`
      .ai-helper-highlight {
        background-color: ${t} !important;
        padding: 2px 0;
      }
    `,document.head.appendChild(n);let o=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,null,!1),i=[],r;for(;r=o.nextNode();)r.nodeValue.toLowerCase().includes(e.toLowerCase())&&i.push(r);let a=[];return i.forEach(l=>{let s=l.parentNode;if(!s||!s.replaceChild||!s.insertBefore)return;let d=l.nodeValue,h=d.toLowerCase(),u=d.toLowerCase(),c=h.indexOf(u);if(c!==-1){let p=document.createElement("span");p.className="ai-helper-highlight",p.textContent=d.substring(c,c+d.length);let g=document.createTextNode(d.substring(0,c)),b=document.createTextNode(d.substring(c+d.length));s.replaceChild(b,l),s.insertBefore(p,b),s.insertBefore(g,p),a.push(p)}}),a.length>0&&a[0].scrollIntoView({behavior:"smooth",block:"center"}),{success:!0,message:`\u5DF2\u9AD8\u4EAE ${a.length} \u5904\u6587\u672C`,count:a.length}}catch(n){return{success:!1,error:n.message}}}function mt(e,t=500,n=3e3){try{if(!e)return{success:!1,error:"\u9009\u62E9\u5668\u4E0D\u80FD\u4E3A\u7A7A"};let o=e.trim();for(let[r,a]of[[/^"([\s\S]*)"$/,"$1"],[/^'([\s\S]*)'$/,"$1"],[/^`([\s\S]*)`$/,"$1"],[/^"([\s\S]*)"$/,"$1"],[/^'([\s\S]*)'$/,"$1"],[/^「([\s\S]*)」$/,"$1"]])o=o.replace(r,a);let i=N(o);return i?(i.click(),{success:!0,message:`\u5DF2\u6210\u529F\u70B9\u51FB\u5143\u7D20: ${e}`}):{success:!1,error:`\u672A\u627E\u5230\u5339\u914D\u9009\u62E9\u5668\u7684\u5143\u7D20: ${e}`}}catch(o){return{success:!1,error:o.message}}}function gt(e){return e.isContentEditable||e.getAttribute("contenteditable")==="true"}function ke(e,t){try{return e.focus(),document.execCommand("insertText",!1,t)||(e.textContent=t),e.dispatchEvent(new Event("input",{bubbles:!0})),e.dispatchEvent(new Event("change",{bubbles:!0})),!0}catch{try{return e.textContent=t,e.dispatchEvent(new Event("input",{bubbles:!0})),!0}catch{return!1}}}function yt(e,t=500){try{let n=[];return e.forEach(o=>{let{selector:i,value:r,fieldType:a="text"}=o,l=N(i);if(!l){n.push({selector:i,success:!1,error:"\u672A\u627E\u5230\u5143\u7D20"});return}try{if(a==="text"){if(gt(l)){let s=ke(l,r);n.push({selector:i,success:s,value:r});return}l.value=r,l.dispatchEvent(new Event("input",{bubbles:!0})),l.dispatchEvent(new Event("change",{bubbles:!0}))}else if(a==="contenteditable"){let s=ke(l,r);n.push({selector:i,success:s,value:r});return}else if(a==="select"){let s=l.querySelector(`option[value="${r}"]`)||Array.from(l.options).find(d=>d.textContent===r);if(s)l.value=s.value,l.dispatchEvent(new Event("change",{bubbles:!0}));else{n.push({selector:i,success:!1,error:"\u672A\u627E\u5230\u5339\u914D\u7684\u9009\u9879"});return}}else if(a==="checkbox")l.checked=r==="true"||r===!0,l.dispatchEvent(new Event("change",{bubbles:!0}));else if(a==="radio"){let s=document.querySelector(`${i}[value="${r}"]`);if(s)s.checked=!0,s.dispatchEvent(new Event("change",{bubbles:!0}));else{n.push({selector:i,success:!1,error:"\u672A\u627E\u5230\u5339\u914D\u7684\u5355\u9009\u6309\u94AE"});return}}n.push({selector:i,success:!0,value:r})}catch(s){n.push({selector:i,success:!1,error:s.message})}}),{success:!0,message:`\u8868\u5355\u586B\u5145\u5B8C\u6210\uFF0C\u6210\u529F ${n.filter(o=>o.success).length}/${e.length} \u4E2A\u5B57\u6BB5`,details:n}}catch(n){return{success:!1,error:n.message}}}function bt(e){try{let{target:t="selector",selector:n,x:o=0,y:i=0,behavior:r="smooth",align:a="center"}=e;if(t==="top")window.scrollTo({top:0,left:0,behavior:r});else if(t==="bottom")window.scrollTo({top:document.body.scrollHeight,left:0,behavior:r});else if(t==="coordinates")window.scrollTo({top:i,left:o,behavior:r});else if(t==="selector"&&n){let l=N(n);if(!l)return{success:!1,error:`\u672A\u627E\u5230\u5143\u7D20: ${n}`};l.scrollIntoView({behavior:r,block:a})}else return{success:!1,error:"\u65E0\u6548\u7684\u6EDA\u52A8\u76EE\u6807\u6216\u7F3A\u5C11\u9009\u62E9\u5668"};return{success:!0,message:"\u6EDA\u52A8\u5B8C\u6210"}}catch(t){return{success:!1,error:t.message}}}function Se(e){if(!e)return!1;if(e.offsetParent===null&&e.tagName!=="BODY"){let r=window.getComputedStyle(e);if(r.display==="none"||r.visibility==="hidden"||r.position!=="fixed")return!1}let t=window.getComputedStyle(e);if(t.display==="none"||t.visibility==="hidden"||parseFloat(t.opacity)<=0)return!1;let n=e.getBoundingClientRect();if(n.width<=0||n.height<=0)return!1;let o=window.innerHeight||document.documentElement.clientHeight,i=window.innerWidth||document.documentElement.clientWidth;return n.top<o&&n.bottom>0&&n.left<i&&n.right>0}function xt(e,t="appeared",n=1e4){return new Promise((o,i)=>{let r=Date.now(),a=()=>{let l=N(e);if(t==="appeared"&&l){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u51FA\u73B0`,element:e});return}if(t==="disappeared"&&!l){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u6D88\u5931`});return}if(t==="visible"&&l&&Se(l)){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u53EF\u89C1`,element:e});return}if(t==="hidden"&&(!l||!Se(l))){o({success:!0,message:`\u5143\u7D20 ${e} \u5DF2\u9690\u85CF`});return}if(Date.now()-r>n){o({success:!1,error:`\u7B49\u5F85\u8D85\u65F6\uFF08${n}ms\uFF09\uFF0C\u5143\u7D20 ${e} \u672A\u8FBE\u5230 ${t} \u72B6\u6001`});return}setTimeout(a,100)};a()})}function wt({key:e,text:t,ctrlKey:n=!1,shiftKey:o=!1,altKey:i=!1}){try{let r=document.activeElement;if(!r)return{success:!1,error:"\u6CA1\u6709\u805A\u7126\u7684\u5143\u7D20"};if(t){let a=r.tagName==="INPUT"||r.tagName==="TEXTAREA",l=r.isContentEditable;if(a||l){if(r.focus(),l)try{document.execCommand("selectAll",!1,null),document.execCommand("insertText",!1,t)}catch{r.textContent+=t}else{let s=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")||Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value");s&&s.set?s.set.call(r,r.value+t):r.value+=t}try{r.dispatchEvent(new InputEvent("input",{bubbles:!0,cancelable:!0,inputType:"insertText",data:t}))}catch{r.dispatchEvent(new Event("input",{bubbles:!0}))}r.dispatchEvent(new Event("change",{bubbles:!0}))}}if(e){let a={key:e,code:e.length===1?`Key${e.toUpperCase()}`:e,keyCode:e.toUpperCase().charCodeAt(0),which:e.toUpperCase().charCodeAt(0),bubbles:!0,cancelable:!0,ctrlKey:n,shiftKey:o,altKey:i};document.activeElement.dispatchEvent(new KeyboardEvent("keydown",a)),document.activeElement.dispatchEvent(new KeyboardEvent("keypress",a)),document.activeElement.dispatchEvent(new KeyboardEvent("keyup",a))}return{success:!0,message:"\u952E\u76D8\u8F93\u5165\u6210\u529F"}}catch(r){return{success:!1,error:r.message}}}function vt(e,t){return new Promise((n,o)=>{try{let i=N(e),r=N(t);if(!i){n({success:!1,error:`\u672A\u627E\u5230\u6E90\u5143\u7D20: ${e}`});return}if(!r){n({success:!1,error:`\u672A\u627E\u5230\u76EE\u6807\u5143\u7D20: ${t}`});return}let a=i.getBoundingClientRect(),l=r.getBoundingClientRect(),s=a.left+a.width/2,d=a.top+a.height/2,h=l.left+l.width/2,u=l.top+l.height/2,c=(p,g,b)=>{let v=new DragEvent(p,{bubbles:!0,cancelable:!0,clientX:g,clientY:b,screenX:g,screenY:b});Object.defineProperty(v,"dataTransfer",{value:{getData:()=>"",setData:()=>{},effectAllowed:"all",dropEffect:"none"}}),document.elementFromPoint(g,b)?.dispatchEvent(v)};c("dragstart",s,d),c("dragenter",h,u),c("dragover",h,u),c("drop",h,u),c("dragend",s,d),n({success:!0,experimental:!0,message:`[\u5B9E\u9A8C\u6027] \u5DF2\u5C1D\u8BD5\u62D6\u62FD ${e} \u2192 ${t}\uFF08\u62D6\u62FD\u6A21\u62DF\u5728\u6D4F\u89C8\u5668\u4E2D\u4E3A\u90E8\u5206\u652F\u6301\uFF0C\u53EF\u80FD\u672A\u751F\u6548\uFF09`})}catch(i){n({success:!1,error:i.message})}})}function Et(e,t,n,o="application/octet-stream"){try{let i=N(e);if(!i)return{success:!1,error:`\u672A\u627E\u5230\u6587\u4EF6\u4E0A\u4F20\u63A7\u4EF6: ${e}`};if(i.type!=="file")return{success:!1,error:"\u9009\u62E9\u7684\u5143\u7D20\u4E0D\u662F\u6587\u4EF6\u4E0A\u4F20\u63A7\u4EF6"};let r;try{let s=atob(n),d=new Uint8Array(s.length);for(let h=0;h<s.length;h++)d[h]=s.charCodeAt(h);r=new Blob([d],{type:o})}catch{r=new Blob([n],{type:o})}let a=new File([r],t,{type:o}),l=new DataTransfer;return l.items.add(a),i.files=l.files,i.dispatchEvent(new Event("change",{bubbles:!0})),{success:!0,message:`\u5DF2\u4E0A\u4F20\u6587\u4EF6: ${t}`}}catch(i){return{success:!1,error:i.message}}}function kt(e,t,n=null,o=5e3){return new Promise(async i=>{try{let r=document.querySelector(e);if(!r){i({success:!1,error:`\u672A\u627E\u5230\u89E6\u53D1\u5668: ${e}`});return}if(r.tagName==="SELECT"){let d=r.options;for(let h=0;h<d.length;h++){let u=d[h],c=(u.textContent||u.label||"").trim();if(c===t||c.includes(t)){r.value=u.value,r.dispatchEvent(new Event("change",{bubbles:!0})),r.dispatchEvent(new Event("input",{bubbles:!0})),i({success:!0,message:`\u5DF2\u9009\u62E9: ${c}`,triggerTag:"SELECT"});return}}i({success:!1,error:`\u5728 <select> \u4E2D\u672A\u627E\u5230\u5339\u914D\u7684\u9009\u9879: "${t}"`,availableOptions:Array.from(d).map(h=>h.textContent?.trim()).filter(Boolean)});return}r.click(),await new Promise(d=>setTimeout(d,300));let a=Date.now(),l=n?document.querySelector(n):document,s=null;for(;Date.now()-a<o;){let d=l.querySelectorAll('li, [role="option"], [role="menuitem"], .option, .dropdown-item, .select-item, [data-value], div');for(let h of d){let u=(h.textContent||"").trim();if(!(u.length<2)&&(u===t||u.includes(t)||u.replace(/\s+/g,"")===t.replace(/\s+/g,""))){s=h;break}}if(s)break;await new Promise(h=>setTimeout(h,100))}if(!s){i({success:!1,error:`\u5728 ${o}ms \u5185\u672A\u627E\u5230\u5339\u914D\u9009\u9879: "${t}"`});return}s.click(),i({success:!0,message:`\u5DF2\u9009\u62E9: ${s.textContent?.trim()}`,triggerTag:r.tagName})}catch(r){i({success:!1,error:r.message})}})}function St({action:e,storage:t,key:n,value:o}){try{let i=t==="session"?sessionStorage:localStorage;switch(e){case"get":if(!n){let a={};for(let l=0;l<i.length;l++){let s=i.key(l);a[s]=i.getItem(s)}return{success:!0,content:JSON.stringify(a),data:a}}let r=i.getItem(n);return{success:!0,content:JSON.stringify({key:n,value:r}),value:r};case"set":return!n||o===void 0?{success:!1,error:"set\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bkey\u548Cvalue"}:(i.setItem(n,o),{success:!0,message:`\u5DF2\u8BBE\u7F6E ${n}`});case"remove":return n?(i.removeItem(n),{success:!0,message:`\u5DF2\u5220\u9664 ${n}`}):{success:!1,error:"remove\u64CD\u4F5C\u9700\u8981\u63D0\u4F9Bkey"};case"clear":return i.clear(),{success:!0,message:"\u5DF2\u6E05\u7A7A\u5B58\u50A8"};default:return{success:!1,error:`\u672A\u77E5\u64CD\u4F5C: ${e}`}}}catch(i){return{success:!1,error:i.message}}}function Tt(e,t){try{let n=document.createElement("canvas");n.width=t,n.height=t;let o=n.getContext("2d");o.fillStyle="#FFFFFF",o.fillRect(0,0,t,t);let i=[];for(let u=0;u<e.length;u++)i.push(e.charCodeAt(u));let r=Math.max(2,Math.floor(t/41)),a=Math.floor(t/r),l=Math.floor((t-a*r)/2);o.fillStyle="#000000";let s=(u,c)=>{let p=7*r;o.fillRect(u,c,p,p),o.fillStyle="#FFFFFF",o.fillRect(u+r,c+r,p-2*r,p-2*r),o.fillStyle="#000000",o.fillRect(u+2*r,c+2*r,p-4*r,p-4*r),o.fillStyle="#000000"};s(l,l),s(l+(a-7)*r,l),s(l,l+(a-7)*r);let d=0;for(let u=0;u<e.length;u++)d=(d<<5)-d+e.charCodeAt(u),d|=0;let h=u=>{let c=u+1831565813;return c=Math.imul(c^c>>>15,c|1),c^=c+Math.imul(c^c>>>7,c|61),((c^c>>>14)>>>0)/4294967296};for(let u=0;u<a;u++)for(let c=0;c<a;c++){let p=u<8&&c<8,g=u<8&&c>=a-8,b=u>=a-8&&c<8;p||g||b||h(d+u*a+c)>.5&&o.fillRect(l+c*r,l+u*r,r,r)}return n.toDataURL("image/png")}catch{return null}}function Ct(e="",t=200,n="M",o=!0){return new Promise(i=>{try{let r=e||window.location.href,a=document.createElement("div");a.id="ai-helper-qrcode",a.style.cssText=`
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
      `;let l=document.createElement("canvas");l.width=t,l.height=t,a.appendChild(l);let s=document.createElement("p");s.textContent=r.length>50?r.substring(0,50)+"...":r,s.style.cssText="margin-top: 12px; font-size: 12px; color: #666; word-break: break-all; max-width: 200px;",a.appendChild(s);let d=document.createElement("button");if(d.textContent="\u5173\u95ED",d.style.cssText=`
        margin-top: 12px;
        padding: 6px 20px;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        border: none;
        border-radius: 20px;
        cursor: pointer;
      `,d.onclick=()=>{document.body.removeChild(a)},a.appendChild(d),typeof QRCode>"u"){let h=Tt(r,t);if(h){let u=document.createElement("img");u.src=h,u.width=t,u.height=t,l.replaceWith(u),o&&document.body.appendChild(a),i({success:!0,content:r,size:t,dataUrl:h,shown:o,fallback:!0,warning:"QRCode \u5E93\u672A\u52A0\u8F7D\uFF0C\u5DF2\u4F7F\u7528 SVG \u964D\u7EA7\u65B9\u6848\u751F\u6210"})}else i({success:!1,error:"\u4E8C\u7EF4\u7801\u5E93\u672A\u52A0\u8F7D\u4E14\u964D\u7EA7\u65B9\u6848\u4E0D\u53EF\u7528"});return}QRCode.toCanvas(l,r,{width:t,margin:2,color:{dark:"#000000",light:"#ffffff"},errorCorrectionLevel:n.toLowerCase()},h=>{h?i({success:!1,error:h.message}):(o&&document.body.appendChild(a),i({success:!0,content:r,size:t,dataUrl:l.toDataURL("image/png"),shown:o}))})}catch(r){i({success:!1,error:r.message})}})}function At(e,t=null,n="style"){try{if(!e||typeof e!="string")return{success:!1,error:"css \u53C2\u6570\u5FC5\u987B\u662F\u975E\u7A7A\u5B57\u7B26\u4E32"};if(n!=="style"&&n!=="inline")return{success:!1,error:`\u4E0D\u652F\u6301\u7684 injectMode: ${n}\uFF0C\u652F\u6301 'style' \u6216 'inline'`};if(n==="style")if(t){let o=document.querySelectorAll(t),i=`ai-helper-scoped-style-${Date.now()}`,r="",a=e.split("}");for(let s of a){let d=s.trim();if(!d)continue;let h=d.indexOf("{");if(h===-1)continue;let u=d.substring(0,h).trim(),c=d.substring(h+1).trim();r+=`#${i} ${u} { ${c} } `}o.forEach(s=>{s.setAttribute("id",i)});let l=document.createElement("style");return l.setAttribute("data-ai-helper","scoped"),l.textContent=r,document.head.appendChild(l),{success:!0,injectMode:"style",scoped:!0,selector:t,hitCount:o.length}}else{let o=document.createElement("style");return o.setAttribute("data-ai-helper","global"),o.textContent=e,document.head.appendChild(o),{success:!0,injectMode:"style",scoped:!1,hitCount:0}}if(n==="inline"){let o=t?document.querySelectorAll(t):document.querySelectorAll("*"),i=0,r={};return e.split(";").forEach(a=>{let l=a.indexOf(":");if(l===-1)return;let s=a.substring(0,l).trim(),d=a.substring(l+1).trim();s&&d&&(r[s]=d)}),o.forEach(a=>{if(a.nodeType===1){for(let[l,s]of Object.entries(r))try{a.style.setProperty(l,s)}catch{}i++}}),{success:!0,injectMode:"inline",selector:t||"*",hitCount:i}}}catch(o){return{success:!1,error:o.message}}}function Lt(){if(document.getElementById("aih-selection-toolbar-styles"))return;let e=document.createElement("style");e.id="aih-selection-toolbar-styles",e.textContent=`
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
  `,document.head.appendChild(e)}var w={search:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',explain:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>',translate:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',summary:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>',copy:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',close:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',sparkle:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>',lock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',unlock:'<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>',copyLarge:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',grip:'<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>',send:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>',more:'<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>',gear:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',refresh:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>',block:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>',eyeOff:'<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'},f=null,m=null,M=!1,C=!1,oe="",X=null,Y="",$=!1,O=!1,q="",ce="",ge="",ye="",y="",J=!0,G=[],Le=!1,de=!1,P={x:0,y:0},D=null,R=null,Te=5,xe=!1,x=null,B="",he=new Set,A=window.top===window;if(!A)try{window.parent===window.top&&window.top.document.querySelector("frameset")&&(A=!0)}catch{}E.debug("[SelectionToolbar] \u6A21\u5757\u52A0\u8F7D isTopFrame:",A,"top===window:",window.top===window,"hasBody:",!!document.body,"parent===top:",window.parent===window.top);var T=null;function I(e){(document.body||document.documentElement).appendChild(e)}var S=null;function Re(e,t){let n=t?e.querySelector(t):e;n&&(n.style.cursor="grab",n.addEventListener("mousedown",o=>{if(o.target.closest('[role="button"]')||o.button!==0)return;o.preventDefault(),o.stopPropagation();let i=e.getBoundingClientRect();S={el:e,startX:o.clientX,startY:o.clientY,startLeft:i.left,startTop:i.top,pointerId:o.pointerId||0},n.style.cursor="grabbing",e.style.transition="none"}))}document.addEventListener("mousemove",e=>{if(!S)return;let t=e.clientX-S.startX,n=e.clientY-S.startY,o=S.startLeft+t,i=S.startTop+n,r=window.innerWidth,a=window.innerHeight,l=S.el.getBoundingClientRect();o=Math.max(0,Math.min(o,r-l.width)),i=Math.max(0,Math.min(i,a-l.height)),S.el.style.left=o+"px",S.el.style.top=i+"px"}),document.addEventListener("mouseup",()=>{if(!S)return;S.el.style.transition="";let e=S.el.querySelector(".aih-result-header")||S.el;e.style.cursor="grab",S=null});function _(){try{return typeof chrome!="object"||!chrome||typeof chrome.runtime!="object"||!chrome.runtime?!1:!!chrome.runtime.id}catch{return!1}}var re=[{id:"ai-search",name:"AI\u641C\u7D22",systemPrompt:"\u4F7F\u7528ReAct Agent\u6A21\u5F0F\uFF0C\u901A\u8FC7\u591A\u8F6E\u601D\u8003\u3001\u641C\u7D22\u548C\u63A8\u7406\u6765\u56DE\u7B54\u9009\u4E2D\u7684\u95EE\u9898\u3002",builtin:!0,order:0},{id:"explain",name:"\u89E3\u91CA",systemPrompt:"\u5BF9\u9009\u4E2D\u7684\u5185\u5BB9\u8FDB\u884C\u89E3\u91CA\u8BF4\u660E\uFF0C\u5E2E\u52A9\u7406\u89E3\u5176\u542B\u4E49\u3002",builtin:!0,order:1},{id:"translate",name:"\u7FFB\u8BD1",systemPrompt:"\u5C06\u9009\u4E2D\u7684\u5185\u5BB9\u7FFB\u8BD1\u6210\u4E2D\u6587\u3002",builtin:!0,order:2},{id:"summary",name:"\u603B\u7ED3",systemPrompt:"\u5BF9\u9009\u4E2D\u7684\u5185\u5BB9\u8FDB\u884C\u5F52\u7EB3\u603B\u7ED3\uFF0C\u63D0\u70BC\u5173\u952E\u8981\u70B9\u3002",builtin:!0,order:3},{id:"copy",name:"\u590D\u5236",systemPrompt:"\u5C06\u9009\u4E2D\u5185\u5BB9\u590D\u5236\u5230\u526A\u8D34\u677F\u3002",builtin:!0,order:99}];function Me(){return new Promise(e=>{if(!_()){R=[...re],e(R);return}if(R){e(R);return}try{chrome.storage.local.get(["toolbarTools","toolbarIconOnly"],t=>{let n=t.toolbarTools&&t.toolbarTools.length>0?t.toolbarTools:re,o=new Map(re.map(i=>[i.id,i]));R=n.map(i=>i.builtin&&o.has(i.id)?{...i,systemPrompt:o.get(i.id).systemPrompt}:i),xe=t.toolbarIconOnly||!1,e(R)})}catch{R=[...re],e(R)}})}function Rt(){R=null,xe=!1,Me()}function Ne(e){return{"ai-search":w.search,explain:w.explain,translate:w.translate,summary:w.summary,copy:w.copy}[e]||w.sparkle}function Mt(){x||(x=document.createElement("div"),x.id="aih-overflow-dropdown",x.className="aih-overflow-dropdown",x.style.display="none",I(x),document.addEventListener("click",e=>{x&&x.style.display==="block"&&!x.contains(e.target)&&!e.target.closest(".aih-tb-btn-overflow")&&(x.style.display="none")}))}function Nt(e){x||Mt();let t=e.map(n=>{let o=Ne(n.id);return`<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${n.id}">
      <span class="aih-tb-icon">${o}</span>${n.name}
    </div>`}).join("");t+='<div class="aih-dropdown-divider"></div>',t+=`<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="\u6253\u5F00\u914D\u7F6E\u9875\u9762">
    <span class="aih-tb-icon">${w.gear}</span>\u8BBE\u7F6E
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="\u6682\u65F6\u9690\u85CF\u76F4\u5230\u9875\u9762\u5237\u65B0">
    <span class="aih-tb-icon">${w.eyeOff}</span>\u672C\u6B21\u4E34\u65F6\u7981\u7528
  </div>`,t+=`<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="\u5728\u6B64\u7F51\u7AD9\u7981\u7528\u5DE5\u5177\u680F">
    <span class="aih-tb-icon">${w.block}</span>\u5728\u6B64\u7F51\u7AD9\u7981\u7528
  </div>`,x.innerHTML=t,x._clickHandler=n=>{if(n.target.closest(".aih-dropdown-settings")){n.stopPropagation(),x.style.display="none";try{chrome.runtime.sendMessage({type:"OPEN_OPTIONS_PAGE",hash:"toolbar"}).catch(()=>{})}catch{}return}if(n.target.closest(".aih-dropdown-block")){n.stopPropagation(),n.preventDefault(),x.style.display="none",Ut();return}if(n.target.closest(".aih-dropdown-hide")){n.stopPropagation(),n.preventDefault(),x.style.display="none",Le=!0,k(),H(),y="";return}let o=n.target.closest("[data-action]");o&&(n.stopPropagation(),x.style.display="none",Oe(o.dataset.action,y))},x.addEventListener("click",x._clickHandler),x.addEventListener("keydown",n=>{if(n.key==="Enter"||n.key===" "){let o=n.target.closest('[role="button"]');o&&(n.preventDefault(),o.click())}})}async function It(){if(f)return;await Me();let e=[...R].sort((c,p)=>c.order-p.order),t=e.find(c=>c.id==="ai-search"),n=e.filter(c=>c.id!=="ai-search"&&c.id!=="copy"),o=n.slice(0,Te-1),i=n.slice(Te-1);f=document.createElement("div"),f.id="aih-selection-toolbar";let r='<span class="aih-tb-buttons">';r+=`<span class="aih-tb-grip" title="\u62D6\u62FD\u79FB\u52A8">${w.grip}</span>`;let a=xe;t&&(r+=`<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="AI \u641C\u7D22">
      <span class="aih-tb-icon">${w.search}</span>${a?"":"AI\u641C\u7D22"}
    </div>`),o.forEach(c=>{let p=Ne(c.id);r+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="${c.id}" title="${c.name}">
      <span class="aih-tb-icon">${p}</span>${a?"":c.name}
    </div>`}),r+=`<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="\u66F4\u591A\u5DE5\u5177">
    <span class="aih-tb-icon">${w.more}</span>
  </div>`,Nt(i),r+=`<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="\u590D\u5236\u9009\u4E2D\u5185\u5BB9">
    <span class="aih-tb-icon">${w.copy}</span>${a?"":"\u590D\u5236"}
  </div>`,r+="</span>",r+=`<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="\u95EE\u95EE..." />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="\u53D1\u9001">
      <span class="aih-tb-icon">${w.send}</span>
    </div>
  </span>`,f.innerHTML=r,f.addEventListener("click",c=>{if(c.target.closest(".aih-tb-btn-overflow")){c.stopPropagation();let b=c.target.closest(".aih-tb-btn-overflow").getBoundingClientRect();x&&(x.style.display=x.style.display==="block"?"none":"block",x.style.top=b.bottom+4+"px",x.style.left=b.right-160+"px");return}let p=c.target.closest("[data-action]");if(!p)return;c.stopPropagation();let g=p.dataset.action;Oe(g,y)}),f.addEventListener("keydown",c=>{if(c.key==="Enter"||c.key===" "){let p=c.target.closest('[role="button"]');p&&!p.classList.contains("aih-tb-ask-send")&&(c.preventDefault(),p.click())}}),I(f);let l=f.querySelector(".aih-tb-ask-input"),s=f.querySelector(".aih-tb-ask-send");f.querySelector(".aih-tb-buttons");let d=()=>{let c=l.value.trim();if(c){let p=oe;u(),l.value="",Ot(c,p),k()}},h=()=>{if(C)return;C=!0,oe=y||"";let c=window.getSelection();c.rangeCount>0&&(X=c.getRangeAt(0).cloneRange());let p=f.getBoundingClientRect().right;Y=f.style.left,f.classList.add("aih-ask-mode"),f.style.width="360px";let g=Math.max(8,p-360);f.style.left=g+"px",requestAnimationFrame(()=>{if(X){let b=window.getSelection();b.removeAllRanges(),b.addRange(X)}requestAnimationFrame(()=>{l.focus()})})},u=()=>{C&&(C=!1,oe="",X=null,f.classList.remove("aih-ask-mode"),f.style.width="",Y&&=(f.style.left=Y,""))};l.addEventListener("focus",()=>{C||h()}),l.addEventListener("mousedown",c=>{C||(c.preventDefault(),h())}),l.addEventListener("blur",()=>{setTimeout(()=>{C&&!f.contains(document.activeElement)&&(u(),k())},150)}),l.addEventListener("keydown",c=>{c.key==="Escape"?(c.preventDefault(),c.stopPropagation(),u(),l.blur()):c.key==="Enter"&&(c.preventDefault(),c.stopPropagation(),d())}),s.addEventListener("mousedown",c=>{c.preventDefault(),c.stopPropagation(),d()}),Re(f,".aih-tb-grip")}function Ie(){if(m)return;m=document.createElement("div"),m.id="aih-selection-result",m.innerHTML=`
    <div class="aih-result-header">
      <span>${w.sparkle} AI \u56DE\u7B54</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="\u9501\u5B9A\u7A97\u53E3">${w.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="\u5173\u95ED">${w.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="\u590D\u5236\u5168\u90E8\u5185\u5BB9">
          <span class="aih-tb-icon">${w.copyLarge}</span>\u590D\u5236
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="\u91CD\u65B0\u751F\u6210\u7B54\u6848">
          <span class="aih-tb-icon">${w.refresh}</span>\u91CD\u65B0\u751F\u6210
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
        <div class="aih-followup-send" role="button" tabindex="0" title="\u53D1\u9001\u5230\u4FA7\u8FB9\u680F">${w.send}</div>
      </span>
    </div>
  `,m.querySelector(".aih-result-close").addEventListener("click",t=>{t.stopPropagation(),H()}),m.querySelector(".aih-result-lock").addEventListener("click",t=>{t.stopPropagation(),$t()}),m.querySelector(".aih-result-footer").addEventListener("click",t=>{t.stopPropagation();let n=t.target.closest("[data-action]")?.dataset?.action;if(n==="regenerate-result"){if(!ge||!ce)return;be(ge,ce,ye)}else n==="copy-result"&&zt()});let e=m.querySelector(".aih-followup-input");m.querySelector(".aih-followup-send").addEventListener("click",t=>{t.stopPropagation();let n=e.value.trim();n&&(pe(n),e.value="")}),e.addEventListener("keydown",t=>{if(t.key==="Enter"){t.preventDefault();let n=e.value.trim();n&&(pe(n),e.value="")}}),m.querySelector(".aih-suggestions-list").addEventListener("click",t=>{let n=t.target.closest(".aih-suggestion-chip");if(!n)return;t.stopPropagation();let o=n.dataset.question;o&&pe(o)}),m.addEventListener("keydown",t=>{if(t.key==="Enter"||t.key===" "){let n=t.target.closest('[role="button"]');n&&(t.preventDefault(),n.click())}}),I(m),Re(m,".aih-result-header")}function Ce(e,t,n,o=[]){if(!m)return;I(m);let i=window.innerWidth,r=window.innerHeight;m.style.display="flex",m.style.left="-9999px",m.style.top="-9999px";let a=m.querySelector(".aih-result-body");a.innerHTML=n;let l=m.querySelector(".aih-result-suggestions"),s=m.querySelector(".aih-suggestions-list");o.length>0&&l&&s?(s.innerHTML=o.map(d=>`<div class="aih-suggestion-chip" role="button" tabindex="0" data-question="${U(d)}">${U(d)}</div>`).join(""),l.style.display="block"):l&&(l.style.display="none"),requestAnimationFrame(()=>{let d=m.getBoundingClientRect(),h=d.width||420,u=Math.min(d.height||200,520),c=e-h/2;c<8&&(c=8),c+h>i-8&&(c=i-h-8);let p=t-u-8;p<8&&(p=t+8),m.style.left=c+"px",m.style.top=p+"px",m.style.maxHeight=Math.min(520,r-p-16)+"px",$=!0,I(m)})}function _t(e,t){if(!m)return;P={x:e,y:t},O=!1,ue();let n=m.querySelector(".aih-result-suggestions");n&&(n.style.display="none");let o=m.querySelector(".aih-followup-input");o&&(o.value=""),I(m),m.style.display="flex";let i=m.querySelector(".aih-result-body");i.innerHTML='<div class="aih-result-loading"><div class="aih-spinner"></div>AI \u6B63\u5728\u601D\u8003...</div>',$e(m,e,t),$=!0,k()}function _e(e,t,n){if(!m)return;O=!1,q="",ue(),I(m),m.style.display="flex";let o=m.querySelector(".aih-result-body");o.innerHTML=`<div class="aih-result-error">\u8BF7\u6C42\u5931\u8D25: ${U(n)}</div>`,$e(m,e,t),$=!0}function $e(e,t,n){let o=window.innerWidth,i=window.innerHeight;e.style.left="-9999px",e.style.top="-9999px",requestAnimationFrame(()=>{let r=e.getBoundingClientRect(),a=r.width||420,l=Math.min(r.height||200,520),s=t-a/2;s<8&&(s=8),s+a>o-8&&(s=o-a-8);let d=n-l-8;d<8&&(d=n+8),e.style.left=s+"px",e.style.top=d+"px",e.style.maxHeight=Math.min(520,i-d-16)+"px",I(e)})}function H(){m&&(m.style.display="none",$=!1,O=!1,q="",ue())}function $t(){O=!O,ue()}function ue(){if(!m)return;let e=m.querySelector(".aih-result-lock");e&&(O?(e.innerHTML=w.lock,e.classList.add("locked"),e.title="\u89E3\u9664\u9501\u5B9A"):(e.innerHTML=w.unlock,e.classList.remove("locked"),e.title="\u9501\u5B9A\u7A97\u53E3"))}function pe(e){if(!e||!_())return;let t=y||ce||"";try{chrome.runtime.sendMessage({type:"DIRECT_SEND",text:e,selectedText:t}).catch(n=>{E.error("[SelectionToolbar] \u53D1\u9001\u8FFD\u95EE\u5230\u4FA7\u8FB9\u680F\u5931\u8D25:",n)})}catch{}}function Ot(e,t){if(!(!e||!_()))try{chrome.runtime.sendMessage({type:"DIRECT_SEND",text:e,selectedText:t||""}).catch(n=>{E.error("[SelectionToolbar] \u53D1\u9001\u5230\u4FA7\u8FB9\u680F\u5931\u8D25:",n)})}catch{}}function U(e){let t=document.createElement("div");return t.textContent=e,t.innerHTML}function Z(e,t){if(!f||!y||$)return;I(f);let n=window.innerWidth,o=window.innerHeight;f.style.display="flex",lastToolbarShowTime=Date.now(),requestAnimationFrame(()=>{let i=f.getBoundingClientRect(),r=i.width||300,a=i.height||40,l=e-r/2;l<8&&(l=8),l+r>n-8&&(l=n-r-8);let s=t-a-10;s<8&&(s=t+10),s<8&&(s=8),s+a>o-8&&(s=o-a-8),f.style.left=l+"px",f.style.top=s+"px",M||=(f.classList.add("show"),!0)})}function k(){!f||!M||(C&&(C=!1,oe="",X=null,f.classList.remove("aih-ask-mode"),f.style.width="",Y&&=(f.style.left=Y,"")),f.classList.remove("show"),f.style.display="none",M=!1)}function qt(){if(!f)return{x:0,y:0};let e=f.getBoundingClientRect();return{x:e.left+e.width/2,y:e.top}}function Dt(e){let t=e.getBoundingClientRect();return{x:t.left+t.width/2,y:t.top}}function fe(){if(!_()||!J)return;if(!A){let r=F();if(E.debug("[SelectionToolbar] iframe onSelectionChange text:",r.text?.substring(0,30),"currentSelectedText:",!!y,"pendingIframeSelection:",!!T),r.text&&r.text.length>=2){let a=le(r.range);T={text:r.text,x:a.x,y:a.y},E.debug("[SelectionToolbar] iframe pendingIframeSelection \u5DF2\u8BBE\u7F6E")}else if(y){y="",T=null;try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION_CLEAR"}).catch(()=>{})}catch{}}return}if(G.length>0&&G.includes(window.location.hostname)||Le)return;let e=window.getSelection(),t=e?e.toString().trim():"",n=null;if(t&&t.length>=2&&e.rangeCount>0)n=e.getRangeAt(0);else{let r=F();r.text&&r.text.length>=2&&(t=r.text,n=r.range)}if(!t||t.length<2){C||k(),y="",D=null;return}let o=5e3,i=t.length>o?t.substring(0,o)+"...":t;if(n){let r=n.commonAncestorContainer,a=r.nodeType===Node.TEXT_NODE?r.parentElement.closest("[contenteditable], input, textarea"):r.closest&&r.closest("[contenteditable], input, textarea");if(a instanceof HTMLElement&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")){k(),y="",D=null;return}}y=i,D=!0}function Bt(e){if(!(f&&f.contains(e.target))&&!(m&&m.contains(e.target))){if(de){de=!1;return}$&&!O&&H(),M&&!C&&k(),chrome.runtime.sendMessage({type:"IFRAME_CLICK_DISMISS"}).catch(()=>{})}}function Pt(){if(E.debug("[SelectionToolbar] onMouseUp isTopFrame:",A,"pendingSelection:",D,"pendingIframeSelection:",!!T,"currentSelectedText:",!!y,"isToolbarVisible:",M,"toolbarEl:",!!f),!A){if(T){de=!0,T.text,y=T.text;try{window.parent.postMessage({type:"IFRAME_SELECTION",text:T.text,x:T.x,y:T.y},"*")}catch{}try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION",text:T.text,x:T.x,y:T.y}).catch(()=>{})}catch{}T=null}return}if(!M&&D&&y){de=!0;let e=window.innerWidth/2,t=window.innerHeight/2,n=window.getSelection();if(n&&n.rangeCount>0){let o=n.getRangeAt(0).getBoundingClientRect();(o.width>0||o.height>0)&&(e=o.left+o.width/2,t=o.top)}if(e===window.innerWidth/2&&t===window.innerHeight/2){let o=F();if(o.text&&o.text.length>=2){let i=le(o.range);e=i.x,t=i.y}}chrome.runtime.sendMessage({type:"IFRAME_CLICK_DISMISS"}).catch(()=>{}),Z(e,t),D=null}}function Ft(){if(C)return;if(!A&&y){let n=F();if(n.text){let o=le(n.range);try{window.parent.postMessage({type:"IFRAME_SELECTION",text:n.text,x:o.x,y:o.y},"*")}catch{}try{chrome.runtime.sendMessage({type:"IFRAME_SELECTION",text:n.text,x:o.x,y:o.y}).catch(()=>{})}catch{}}return}if(!M)return;let e=window.getSelection();if(e&&e.rangeCount>0&&y){let n=e.getRangeAt(0).getBoundingClientRect();if(n.width>0||n.height>0){Z(n.left+n.width/2,n.top);return}}let t=F();if(t.text&&t.text.length>=2&&y){let n=le(t.range);Z(n.x,n.y);return}k()}function Ht(){C||M&&k()}function Oe(e,t){if(!t)return;if(ce=t,e==="copy"){jt(t),k();return}if(ge=e,ye="",["ai-search","explain","translate","summary"].includes(e)){be(e,t);return}let n=R.find(o=>o.id===e);n&&(ye=n.systemPrompt||"",be(e,t,n.systemPrompt))}function jt(e){qe(e).then(()=>{Be()}).catch(t=>{E.error("[SelectionToolbar] \u590D\u5236\u5931\u8D25:",t),De()})}function zt(){let e=q;e&&qe(e).then(()=>{Be()}).catch(t=>{E.error("[SelectionToolbar] \u590D\u5236\u7ED3\u679C\u5931\u8D25:",t),De()})}async function qe(e){if(!navigator.clipboard)return Ae(e);try{await navigator.clipboard.writeText(e)}catch(t){if(t.name==="NotAllowedError"||t.name==="SecurityError")return Ae(e);throw t}}function Ae(e){return new Promise((t,n)=>{let o=document.createElement("textarea");o.value=e,o.style.position="fixed",o.style.left="-9999px",o.style.opacity="0",I(o);try{o.select(),o.setSelectionRange(0,e.length),document.execCommand("copy")?t():n(Error("execCommand copy failed"))}catch(i){n(i)}finally{o.remove()}})}function De(){let e=document.getElementById("aih-copy-toast");e&&e.remove();let t=document.createElement("div");t.id="aih-copy-toast",t.textContent="\u590D\u5236\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u590D\u5236",t.style.cssText=`
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
  `,!document.getElementById("aih-toast-anim")){let n=document.createElement("style");n.id="aih-toast-anim",n.textContent=`
      @keyframes aih-toast-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      @keyframes aih-toast-out { from { opacity: 1; } to { opacity: 0; } }
    `,document.head.appendChild(n)}I(t),t.style.zIndex="2147483647",setTimeout(()=>t.remove(),1300)}function be(e,t,n){if(!_()){E.warn("[SelectionToolbar] \u6269\u5C55\u4E0A\u4E0B\u6587\u5DF2\u5931\u6548\uFF0C\u8BF7\u5237\u65B0\u9875\u9762");return}let o={"ai-search":`\u641C\u7D22\u5E76\u5206\u6790\u4EE5\u4E0B\u5185\u5BB9\uFF1A

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
\u95EE\u98983`},i=n?`\u8BF7\u5904\u7406\u4EE5\u4E0B\u5185\u5BB9\uFF1A

${t}`:o[e]||t;if(e==="ai-search"){k(),window.getSelection().removeAllRanges();try{chrome.runtime.sendMessage({type:"SELECTION_TOOLBAR_ACTION",action:e,text:t,prompt:i}).catch(s=>{E.error("[SelectionToolbar] \u53D1\u9001\u6D88\u606F\u5931\u8D25:",s)})}catch{}return}Ie();let r={"ai-search":"AI\u641C\u7D22",explain:"\u89E3\u91CA",translate:"\u7FFB\u8BD1",summary:"\u603B\u7ED3"}[e];if(!r&&R){let s=R.find(d=>d.id===e);r=s?s.name:"AI \u56DE\u7B54"}let a=m.querySelector(".aih-result-header span");a&&(a.innerHTML=`${w.sparkle} ${r||"AI \u56DE\u7B54"}`);let l=$&&m?Dt(m):qt();_t(l.x,l.y),chrome.runtime.sendMessage({type:"SELECTION_TOOLBAR_ACTION",action:e,text:t,prompt:i,systemPrompt:n||""}).catch(s=>{E.error("[SelectionToolbar] \u53D1\u9001\u6D88\u606F\u5931\u8D25:",s),_e(l.x,l.y,s.message)})}_()&&chrome.runtime.onMessage.addListener((e,t,n)=>{if(_()){if(e.type==="IFRAME_SELECTION"){if(!A)return;E.debug("[SelectionToolbar] \u6536\u5230 IFRAME_SELECTION text:",e.text?.substring(0,30),"isToolbarVisible:",M,"isResultVisible:",$),y=e.text;let o=e.x,i=e.y;if(window.top!==window&&window.frameElement)try{let r=window.frameElement.getBoundingClientRect();o=e.x-r.left,i=e.y-r.top}catch{}if(M&&f&&y){requestAnimationFrame(()=>{let r=window.innerWidth,a=f.offsetWidth||300,l=f.offsetHeight||40,s=o-a/2;s<8&&(s=8),s+a>r-8&&(s=r-a-8);let d=i-l-8;d<8&&(d=i+8),f.style.left=s+"px",f.style.top=d+"px"});return}D={x:o,y:i},y&&y.length>=2&&Z(o,i);return}if(e.type==="IFRAME_SELECTION_CLEAR"){if(!A)return;M&&!C&&(k(),y="");return}if(e.type==="IFRAME_CLICK_DISMISS"){M&&f&&Date.now()-lastToolbarShowTime>300&&(k(),y=""),$&&!O&&H();return}if(A){if(e.type==="SELECTION_TOOLBAR_STREAM_START"){B="";return}if(e.type==="SELECTION_TOOLBAR_STREAM_CHUNK"){if(B+=e.delta||"",m&&$){let o=m.querySelector(".aih-result-body");o&&(o.querySelector(".aih-result-content-stream")||(o.innerHTML='<div class="aih-result-content-stream"></div>'),o.innerHTML='<div class="aih-result-content-stream">'+U(B).replace(/\n/g,"<br>")+"</div>")}return}if(e.type==="SELECTION_TOOLBAR_STREAM_DONE"){e.finalContent&&(B=e.finalContent);let o=B||"\u65E0\u54CD\u5E94";q=B;let i=o,r=[],a=o.indexOf("---SUGGESTIONS---");a!==-1&&(i=o.substring(0,a).trim(),q=i,r=o.substring(a+17).split(`
`).map(s=>s.replace(/^[\d]+[\.\、\s]+/,"").trim()).filter(s=>s.length>0).slice(0,3));let l=typeof marked<"u"?marked.parse(i):U(i).replace(/\n/g,"<br>");Ce(P.x,P.y,l,r),B="";return}if(e.type==="SELECTION_TOOLBAR_RESULT")if(e.error)q="",_e(P.x,P.y,e.error);else{let o=e.content||"\u65E0\u54CD\u5E94",i=o;q=o;let r=[],a=o.indexOf("---SUGGESTIONS---");a!==-1&&(i=o.substring(0,a).trim(),q=i,r=o.substring(a+17).split(`
`).map(s=>s.replace(/^[\d]+[\.\、\s]+/,"").trim()).filter(s=>s.length>0).slice(0,3));let l=typeof marked<"u"?marked.parse(i):U(i).replace(/\n/g,"<br>");Ce(P.x,P.y,l,r)}}}});function Ut(){if(!_())return;let e=window.location.hostname;try{chrome.storage.local.get(["blockedDomains"],t=>{try{let n=t.blockedDomains||[];n.includes(e)||(n.push(e),chrome.storage.local.set({blockedDomains:n},()=>{G=n,k(),H(),y=""}))}catch{}})}catch{}}function Gt(){_()&&chrome.storage.local.get(["enableSelectionToolbar","blockedDomains"],e=>{J=e.enableSelectionToolbar===void 0?!0:!!e.enableSelectionToolbar,G=e.blockedDomains||[],E.debug("[SelectionToolbar] \u5F00\u5173\u72B6\u6001:",J?"\u5DF2\u542F\u7528":"\u5DF2\u7981\u7528","\u5C4F\u853D\u57DF\u540D:",G.length)})}_()&&chrome.storage.onChanged.addListener((e,t)=>{_()&&(t==="local"&&e.enableSelectionToolbar&&(J=!!e.enableSelectionToolbar.newValue,J||(k(),H(),y="")),t==="local"&&e.blockedDomains&&(G=e.blockedDomains.newValue||[]),t==="local"&&e.toolbarTools&&Rt())});function Wt(){Lt(),It(),Ie(),Gt(),document.addEventListener("selectionchange",fe),document.addEventListener("click",Bt,!0),document.addEventListener("mouseup",Pt,!0),window.addEventListener("scroll",Ft,!0),window.addEventListener("resize",Ht),window.addEventListener("message",e=>{if(e.data?.type==="IFRAME_SELECTION"&&A){y=e.data.text;let t=e.data.x,n=e.data.y;if(window.top!==window&&window.frameElement)try{let o=window.frameElement.getBoundingClientRect();t=e.data.x-o.left,n=e.data.y-o.top}catch{}if(M&&f&&y){requestAnimationFrame(()=>{let o=window.innerWidth,i=f.offsetWidth||300,r=f.offsetHeight||40,a=t-i/2;a<8&&(a=8),a+i>o-8&&(a=o-i-8);let l=n-r-8;l<8&&(l=n+8),f.style.left=a+"px",f.style.top=l+"px"});return}D={x:t,y:n},y&&y.length>=2&&Z(t,n);return}e.data?.type==="IFRAME_CLICK_DISMISS"&&A&&$&&!O&&H()}),A&&(he=me(fe),new MutationObserver(()=>{Ye(he),he=me(fe)}).observe(document.body,{childList:!0,subtree:!0})),E.debug("[SelectionToolbar] \u521D\u59CB\u5316\u5B8C\u6210",A?"(\u9876\u5C42frame)":"(\u5B50frame)")}console.log("[ContentScript] \u5185\u5BB9\u811A\u672C\u5DF2\u52A0\u8F7D URL:",window.location.href,"isTopFrame:",window.top===window,"hasBody:",!!document.body),document.addEventListener("keydown",e=>{(e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key==="A"&&(e.preventDefault(),chrome.action.click()),e.altKey&&!e.shiftKey&&e.code==="KeyS"&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:"CAPTURE_TAB_FROM_PAGE"})),e.altKey&&e.shiftKey&&e.code==="KeyS"&&!e.ctrlKey&&!e.metaKey&&(e.preventDefault(),chrome.runtime.sendMessage({type:"CAPTURE_REGION_FROM_PAGE"}))});var Kt={GET_PAGE_TEXT:e=>lt(e),GET_FULL_HTML:e=>st(e),QUERY_INTERACTIVE_ELEMENTS:e=>it(e),GET_SELECTED_CONTENT:e=>ct(e.format),CLICK_ELEMENT:e=>mt(e.selector,e.waitTime,e.timeout),FILL_FORM:e=>yt(e.fields,e.waitTime),SCROLL_TO:e=>bt(e),HOVER_ELEMENT:e=>pt(e.selector),KEYBOARD_INPUT:e=>wt(e),FILE_UPLOAD:e=>Et(e.selector,e.fileName,e.fileContent,e.fileType),EXTRACT_TABLE:e=>dt(e.selector,e.includeHeaders,e.format),EXTRACT_METADATA:()=>Ze(),EXTRACT_LINKS:e=>et(e.filterType,e.includeImages),EXTRACT_FORMS:e=>tt(e.formSelector),EXTRACT_IMAGES:e=>nt(e),SEARCH_IN_PAGE:e=>ot(e),FIND_SIMILAR_ELEMENTS:e=>at(e.selector,e.maxResults),GET_IFRAME_CONTENT:e=>rt(e.selector,e.includeNested,e.maxLength),HIGHLIGHT_TEXT:e=>ft(e.text,e.color),MANAGE_STORAGE:e=>St(e),INJECT_CSS:e=>At(e.css,e.targetSelector,e.injectMode),COPY_TO_CLIPBOARD:e=>ut(e.text),PASTE_FROM_CLIPBOARD:()=>ht(),WAIT_FOR_ELEMENT:e=>xt(e.selector,e.state,e.timeout),DRAG_AND_DROP:e=>vt(e.sourceSelector,e.targetSelector),SELECT_DROPDOWN:e=>kt(e.triggerSelector,e.optionText,e.optionSelector,e.timeout),GENERATE_QRCODE:e=>Ct(e.content,e.size,e.errorCorrection,e.showImage),CLEAR_PAGE_DATA:e=>{try{let t=[];return e.site?window.location.href.includes(new URL(e.site).hostname)&&(localStorage.clear(),sessionStorage.clear(),t.push("localStorage","sessionStorage")):(localStorage.clear(),sessionStorage.clear(),t.push("localStorage","sessionStorage")),{success:!0,cleared:t}}catch(t){return{success:!1,error:t.message}}},START_REGION_SELECTION:()=>Yt(),GET_PAGE_METRICS:()=>({width:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth||0,window.innerWidth),height:Math.max(document.documentElement.scrollHeight,document.body.scrollHeight||0,window.innerHeight)})},Xt=new Set(["COPY_TO_CLIPBOARD","PASTE_FROM_CLIPBOARD","WAIT_FOR_ELEMENT","DRAG_AND_DROP","SELECT_DROPDOWN","GENERATE_QRCODE","START_REGION_SELECTION"]),Vt=new Set(["GET_PAGE_TEXT","GET_FULL_HTML","EXTRACT_METADATA","EXTRACT_TABLE","GET_IFRAME_CONTENT","QUERY_INTERACTIVE_ELEMENTS"]);_()&&chrome.runtime.onMessage.addListener((e,t,n)=>{if(Vt.has(e.type)&&window.top!==window)return;if(e.action==="getSelectedText"){let r=window.getSelection()?.toString()?.trim()||"";if(r&&document.hasFocus())return n({text:r}),!0;let a=F();return a.text&&a.text.trim()&&document.hasFocus()&&n({text:a.text.trim()}),!0}let o=Kt[e.type];if(!o)return;let i=o(e);if(Xt.has(e.type)||i instanceof Promise)return Promise.resolve(i).then(n),!0;n(i)}),Wt();function Yt(){return new Promise(e=>{let t=document.createElement("div");t.id="__region_select_overlay__",t.style.cssText=`
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
    `,o.textContent="\u62D6\u62FD\u9009\u62E9\u622A\u56FE\u533A\u57DF\uFF0C\u6309 Esc \u53D6\u6D88";let i=0,r=0,a=!1;function l(u){return{x:u.clientX,y:u.clientY}}function s(u,c,p,g){let b=Math.min(u,p),v=Math.min(c,g),L=Math.abs(p-u),j=Math.abs(g-c);n.style.left=b+"px",n.style.top=v+"px",n.style.width=L+"px",n.style.height=j+"px",n.style.display="block"}function d(){t.remove(),n.remove(),o.remove(),document.removeEventListener("keydown",h,!0)}function h(u){u.key==="Escape"&&(u.preventDefault(),u.stopPropagation(),d(),e(null))}t.addEventListener("mousedown",u=>{if(u.button!==0)return;u.preventDefault(),u.stopPropagation();let{x:c,y:p}=l(u);i=c,r=p,a=!0,document.body.appendChild(n),document.body.appendChild(o)}),t.addEventListener("mousemove",u=>{if(!a)return;u.preventDefault();let{x:c,y:p}=l(u);s(i,r,c,p)}),t.addEventListener("mouseup",u=>{if(!a)return;u.preventDefault(),u.stopPropagation(),a=!1;let{x:c,y:p}=l(u),g={x:Math.min(i,c),y:Math.min(r,p),width:Math.abs(c-i),height:Math.abs(p-r)};if(d(),g.width<10||g.height<10){e(null);return}requestAnimationFrame(()=>e(g))}),document.addEventListener("keydown",h,!0),document.body.appendChild(t)})}})();
