import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve,relative,dirname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),dryRun=process.argv.includes('--dry-run');
const args=process.argv.slice(2),url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_KEY;
const fail=message=>{throw new Error(message);};
if(args.some(a=>a!=='--dry-run'))fail('Usage: node scripts/apply-approved.mjs [--dry-run]');
if(!url||!key)fail('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in your environment.');
const endpoint=new URL(url);if(!['https:','http:'].includes(endpoint.protocol))fail('Invalid project URL.');
const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
async function request(path,options={}){
 const response=await fetch(new URL('rest/v1/'+path,endpoint.href.replace(/\/$/,'')+'/'),{...options,headers:{...headers,...options.headers}});
 if(!response.ok)fail('Backend request failed (HTTP '+response.status+').');
 return response.status===204?null:response.json();
}
const files=new Map();
function dataPath(path){
 if(typeof path!=='string'||!/^data\/[a-zA-Z0-9_./-]+\.json$/.test(path)||path.split('/').includes('..')||path.split('/').includes('tiles'))fail('Invalid data file in map registry.');
 const absolute=resolve(root,path),local=relative(root,absolute);if(local.startsWith('..'+sep)||local==='..')fail('Data file is outside the atlas.');return absolute;
}
async function file(path){
 if(!files.has(path)){const original=await readFile(dataPath(path),'utf8');const spacing=original.match(/\r?\n([ \t]+)\S/);files.set(path,{data:JSON.parse(original),original,indent:spacing?spacing[1]:2,newline:original.includes('\r\n')?'\r\n':'\n',trailing:/\r?\n$/.test(original),changed:false});}
 return files.get(path);
}
const registry=JSON.parse(await readFile(resolve(root,'data/maps.json'),'utf8'));
// Reuse the site's supported categories, trades, arrows and colour palette.
const context=vm.createContext({});
const app=await readFile(resolve(root,'app.js'),'utf8'),icons=await readFile(resolve(root,'icons.js'),'utf8');
vm.runInContext(app.slice(app.indexOf('const baseCategories='),app.indexOf('const mobileLayout=')),context);
vm.runInContext(icons,context);
const supported=vm.runInContext('({categories:Object.keys(allCategories),trades:Object.keys(tradePaths),arrows:Object.keys(exitArrows),colours:Object.values(pinColours)})',context);
for(const map of registry.maps)for(const extra of [map.extraCategories,...(map.levels||[]).map(l=>l.extraCategories)])for(const category of Object.keys(extra||{}))if(!supported.categories.includes(category))supported.categories.push(category);
function configuration(row){
 const base=registry.maps.find(m=>m.id===row.map);if(!base)fail('Unknown map for suggestion '+row.id+'.');
 if(!base.levels){if(row.level)fail('Unexpected level for suggestion '+row.id+'.');return base;}
 const level=base.levels.find(l=>l.id===row.level);if(!level)fail('A valid level is required for suggestion '+row.id+'.');return {...base,...level,id:base.id,levelId:level.id};
}
function point(p,c,id){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)||p[0]<0||p[1]<0||p[0]>c.width||p[1]>c.height)fail('Invalid position for suggestion '+id+'.');return p.map(Math.round);}
function validatePayload(row){
 const p=row.payload;if(!p||Array.isArray(p)||typeof p!=='object'||typeof p.name!=='string'||!p.name.trim()||p.name.length>100||Buffer.byteLength(JSON.stringify(p))>=4096)fail('Invalid payload for suggestion '+row.id+'.');
 if(!['move-marker','move-label','new-marker'].includes(row.kind))fail('Invalid kind for suggestion '+row.id+'.');
 if(row.kind==='new-marker'){
  if(!supported.categories.includes(p.category)||typeof (p.note??'')!=='string'||(p.note||'').length>2000||![undefined,'marker','label','exit'].includes(p.noteType)||p.trade!==undefined&&!supported.trades.includes(p.trade)||p.color!==undefined&&!supported.colours.includes(p.color)||p.arrow!==undefined&&!supported.arrows.includes(p.arrow))fail('Unsupported marker fields for suggestion '+row.id+'.');
 }else if(typeof row.target_id!=='string'||!row.target_id)fail('Missing target for suggestion '+row.id+'.');
 return p;
}
async function apply(row){
 const c=configuration(row),p=validatePayload(row),id='community-'+row.id;
 if(row.kind==='new-marker'){
  const [x,y]=point([p.x,p.y],c,row.id),label=p.noteType==='label'||p.noteType==='exit',path=label?c.labelsFile:c.markersFile,f=await file(path),rows=label?f.data.labels:f.data;
  if(!Array.isArray(rows))fail('Invalid feature file for suggestion '+row.id+'.');
  if(rows.some(m=>m.id===id))return 'already present';
  const m={id,name:p.name.trim(),...(label?{kind:p.noteType==='exit'?'exit':'building',priority:50,minZoom:0}:{category:p.category}),note:p.note||'',x,y,...(c.levels?{level:c.levelId}:{})};
  if(label&&p.noteType==='exit')m.arrow=p.arrow||'east';
  if(!label){if(p.trade&&p.category==='Tradeskill')m.trade=p.trade;if(p.color)m.color=p.color;}
  rows.push(m);f.changed=true;return label?'place name added':'marker added';
 }
 const path=row.kind==='move-label'?c.labelsFile:c.markersFile,f=await file(path),rows=row.kind==='move-label'?f.data.labels:f.data;
 if(!Array.isArray(rows))fail('Invalid feature file for suggestion '+row.id+'.');
 const m=rows.find(m=>m.id===row.target_id&&(!c.levels||!m.level||m.level===c.levelId));if(!m)fail('Target missing for suggestion '+row.id+'.');
 const [x,y]=point(p.to,c,row.id),from=point(p.from,c,row.id);
 if(Math.round(m.x)===x&&Math.round(m.y)===y)return 'already positioned';
 if(Math.round(m.x)!==from[0]||Math.round(m.y)!==from[1])fail('Published position has changed for suggestion '+row.id+'; review it again.');
 m.x=x;m.y=y;f.changed=true;
 if(row.kind==='move-marker'&&c.labelsFile){const labels=await file(c.labelsFile),trainer=labels.data.trainers?.find(t=>t.id===m.id);if(trainer){trainer.x=x;trainer.y=y;labels.changed=true;}}
 return 'position moved';
}
async function main(){
 const rows=[];let after='0';
 while(true){const batch=await request('suggestions?status=eq.approved&select=*&order=id.asc&id=gt.'+after+'&limit=1000');if(!Array.isArray(batch))fail('Invalid suggestions response.');rows.push(...batch);if(batch.length<1000)break;after=batch.at(-1).id;}
 if(!rows.length){console.log('No approved suggestions.');return;}
 const applied=[];
 for(const row of rows){if(!/^\d+$/.test(String(row.id)))fail('Invalid suggestion id.');const result=await apply(row);applied.push(row.id);console.log((dryRun?'Would apply ':'Ready to apply ')+row.id+': '+result+'.');}
 const changed=[...files].filter(([,f])=>f.changed);
 if(!dryRun){
  for(const [path,f] of changed){let content=JSON.stringify(f.data,null,f.indent).replace(/\n/g,f.newline);if(f.trailing)content+=f.newline;const target=dataPath(path),temporary=target+'.tmp';await writeFile(temporary,content,'utf8');await rename(temporary,target);}
  for(let offset=0;offset<applied.length;offset+=100){const ids=applied.slice(offset,offset+100).join(',');await request('suggestions?status=eq.approved&id=in.('+ids+')',{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({status:'published'})});}
 }
 console.log((dryRun?'Dry run: ':'Complete: ')+applied.length+' suggestions, '+changed.length+' data files'+(dryRun?' would change.':' changed.'));
}
main().catch(e=>{console.error(e.message==='fetch failed'?'Backend could not be reached.':e.message);process.exitCode=1;});
