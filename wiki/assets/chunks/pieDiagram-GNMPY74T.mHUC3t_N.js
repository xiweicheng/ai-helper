import{p as et}from"./chunk-JWPE2WC7.B5HeFr3Z.js";import{v as at,s as rt,w as it,x as nt,O as st,N as ot,_ as l,l as E,k as lt,a6 as ct,a9 as dt,aa as gt,ab as U,ac as ht,y as pt,V as ut,ad as ft,a7 as mt}from"./theme.mHRXxg9j.js";import{p as vt}from"./cynefin-EF2NZ3EQ.BsxsxGh-.js";import"./framework.DBpCFmh2.js";var St=mt.pie,R={sections:new Map,showData:!1},T=R.sections,L=R.showData,xt=structuredClone(St),wt=l(()=>structuredClone(xt),"getConfig"),Ct=l(()=>{T=new Map,L=R.showData,ut()},"clear"),$t=l(({label:t,value:a})=>{if(a<0)throw new Error(`"${t}" has invalid value: ${a}. Negative values are not allowed in pie charts. All slice values must be >= 0.`);T.has(t)||(T.set(t,a),E.debug(`added new section: ${t}, with value: ${a}`))},"addSection"),yt=l(()=>T,"getSections"),Dt=l(t=>{L=t},"setShowData"),Tt=l(()=>L,"getShowData"),V={getConfig:wt,clear:Ct,setDiagramTitle:ot,getDiagramTitle:st,setAccTitle:nt,getAccTitle:it,setAccDescription:rt,getAccDescription:at,addSection:$t,getSections:yt,setShowData:Dt,getShowData:Tt},bt=l((t,a)=>{et(t,a),a.setShowData(t.showData),t.sections.map(a.addSection)},"populateDb"),At={parse:l(async t=>{const a=await vt("pie",t);E.debug(a),bt(a,V)},"parse")},kt=l(t=>`
  .pieCircle{
    stroke: ${t.pieStrokeColor};
    stroke-width : ${t.pieStrokeWidth};
    opacity : ${t.pieOpacity};
  }
  .pieCircle.highlighted{
    scale: 1.05;
    opacity: 1;
  }
  .pieCircle.highlightedOnHover:hover{
    transition-duration: 250ms;
    scale: 1.05;
    opacity: 1;
  }
  .pieOuterCircle{
    stroke: ${t.pieOuterStrokeColor};
    stroke-width: ${t.pieOuterStrokeWidth};
    fill: none;
  }
  .pieTitleText {
    text-anchor: middle;
    font-size: ${t.pieTitleTextSize};
    fill: ${t.pieTitleTextColor};
    font-family: ${t.fontFamily};
  }
  .slice {
    font-family: ${t.fontFamily};
    fill: ${t.pieSectionTextColor};
    font-size:${t.pieSectionTextSize};
    // fill: white;
  }
  .legend text {
    fill: ${t.pieLegendTextColor};
    font-family: ${t.fontFamily};
    font-size: ${t.pieLegendTextSize};
  }
`,"getStyles"),_t=kt,zt=l(t=>{const a=[...t.values()].reduce((s,m)=>s+m,0),O=[...t.entries()].map(([s,m])=>({label:s,value:m})).filter(s=>s.value/a*100>=1);return ft().value(s=>s.value).sort(null)(O)},"createPieArcs"),Et=l((t,a,O,W)=>{var I;E.debug(`rendering pie chart
`+t);const s=W.db,m=lt(),p=ct(s.getConfig(),m.pie),F=40,i=18,c=4,C=450,S=C,b=dt(a),$=b.append("g");$.attr("transform","translate("+S/2+","+C/2+")");const{themeVariables:n}=m;let[H]=gt(n.pieOuterStrokeWidth);H??(H=2);const X=p.legendPosition,M=p.textPosition,Z=p.donutHole>0&&p.donutHole<=.9?p.donutHole:0,u=Math.min(S,C)/2-F,j=U().innerRadius(Z*u).outerRadius(u),q=U().innerRadius(u*M).outerRadius(u*M),x=$.append("g");x.append("circle").attr("cx",0).attr("cy",0).attr("r",u+H/2).attr("class","pieOuterCircle");const y=s.getSections(),J=zt(y),K=[n.pie1,n.pie2,n.pie3,n.pie4,n.pie5,n.pie6,n.pie7,n.pie8,n.pie9,n.pie10,n.pie11,n.pie12];let A=0;y.forEach(e=>{A+=e});const P=J.filter(e=>(e.data.value/A*100).toFixed(0)!=="0"),k=ht(K).domain([...y.keys()]);x.selectAll("mySlices").data(P).enter().append("path").attr("d",j).attr("fill",e=>k(e.data.label)).attr("class",e=>{let r="pieCircle";return p.highlightSlice==="hover"?r+=" highlightedOnHover":p.highlightSlice===e.data.label&&(r+=" highlighted"),r}),x.selectAll("mySlices").data(P).enter().append("text").text(e=>(e.data.value/A*100).toFixed(0)+"%").attr("transform",e=>"translate("+q.centroid(e)+")").style("text-anchor","middle").attr("class","slice");const Q=$.append("text").text(s.getDiagramTitle()).attr("x",0).attr("y",-400/2).attr("class","pieTitleText"),w=[...y.entries()].map(([e,r])=>({label:e,value:r})),f=$.selectAll(".legend").data(w).enter().append("g").attr("class","legend");f.append("rect").attr("width",i).attr("height",i).style("fill",e=>k(e.label)).style("stroke",e=>k(e.label)),f.append("text").attr("x",i+c).attr("y",i-c).text(e=>s.getShowData()?`${e.label} [${e.value}]`:e.label);const v=Math.max(...f.selectAll("text").nodes().map(e=>(e==null?void 0:e.getBoundingClientRect().width)??0));let D=C,_=S+F;const o=i+c,z=w.length*o;switch(X){case"center":f.attr("transform",(e,r)=>{const d=o*w.length/2,g=-v/2-(i+c),h=r*o-d;return"translate("+g+","+h+")"});break;case"top":D+=z,f.attr("transform",(e,r)=>{const d=u,g=-v/2-(i+c),h=r*o-d;return`translate(${g}, ${h})`}),x.attr("transform",()=>`translate(0, ${z+o})`);break;case"bottom":D+=z,f.attr("transform",(e,r)=>{const d=-u-o,g=-v/2-(i+c),h=r*o-d;return"translate("+g+","+h+")"});break;case"left":_+=i+c+v,f.attr("transform",(e,r)=>{const d=o*w.length/2,g=-u-(i+c),h=r*o-d;return"translate("+g+","+h+")"}),x.attr("transform",()=>`translate(${v+i+c}, 0)`);break;case"right":default:_+=i+c+v,f.attr("transform",(e,r)=>{const d=o*w.length/2,g=12*i,h=r*o-d;return"translate("+g+","+h+")"});break}const G=((I=Q.node())==null?void 0:I.getBoundingClientRect().width)??0,Y=S/2-G/2,tt=S/2+G/2,N=Math.min(0,Y),B=Math.max(_,tt)-N;b.attr("viewBox",`${N} 0 ${B} ${D}`),pt(b,D,B,p.useMaxWidth)},"draw"),Rt={draw:Et},Mt={parser:At,db:V,renderer:Rt,styles:_t};export{Mt as diagram};
