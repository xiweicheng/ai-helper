/**
 * 读取 en-final-map.txt (key=value格式)，处理所有文件中 console/logger 调用的残留中文
 */
const fs=require('fs');const p=require('path');
const CJK=/[\u4e00-\u9fff]/;
const LC=/(console|logger)\.(log|debug|info|warn|error)\s*\(/;
const XF=['locales/zh.js','locales/en.js'];const XD='_locales/';

// 加载映射表
function loadMap(fn){
  const raw=fs.readFileSync(p.join(__dirname,fn),'utf-8');
  const arr=[];
  raw.trim().split('\n').forEach(l=>{
    const e=l.indexOf('=');
    if(e>0) arr.push([l.substring(0,e), l.substring(e+1)]);
  });
  return arr;
}
const mapArr=[...loadMap('en-final-map.txt'),...loadMap('en-final-map2.txt')];
// 按中文长度降序
mapArr.sort((a,b)=>b[0].length-a[0].length);
console.log(`Loaded ${mapArr.length} mappings`);

function exc(fp){ return XF.some(x=>fp.includes(x)) || fp.includes(XD); }

function fix(line){
  if(!CJK.test(line)||!LC.test(line)) return line;
  let r=line;
  for(const[zh,en] of mapArr){
    let i=0;
    while((i=r.indexOf(zh,i))>=0){
      r=r.slice(0,i)+en+r.slice(i+zh.length);
      i+=en.length;
    }
  }
  return r;
}

let total=0;
for(const dir of['src','agent/src','agent/test']){
  const dp=p.join(__dirname,'..',dir);
  if(!fs.existsSync(dp)) continue;
  for(const f of fs.readdirSync(dp,{recursive:true})){
    if(!f.endsWith('.js')) continue;
    const fp=p.join(dp,f);
    if(exc(fp)) continue;
    const c=fs.readFileSync(fp,'utf-8');let ch=0;
    const ls=c.split('\n');
    for(let i=0;i<ls.length;i++){
      const o=ls[i],n=fix(o);
      if(n!==o){ls[i]=n;ch++;}
    }
    if(ch>0){fs.writeFileSync(fp,ls.join('\n'),'utf-8');total+=ch;}
  }
}
console.log(`Fixed ${total} lines`);
