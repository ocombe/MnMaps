/* All positions are pixels on the illustration. */
'use strict';
const $=id=>document.getElementById(id);
const categories={'Bank':['▣','#916c30'],'Inn':['☾','#9a543a'],'Stable':['♞','#665e3e'],'Shady merchant':['♧','#785268'],'Tradeskill':['⚒','#385f60'],'Personal':['✧','#a04438']};
const KEY='mnmaps-night-harbor-notes-v1';
const ALIGN_KEY='mnmaps-night-harbor-alignment-v1';
const alignmentMode=new URLSearchParams(location.search).has('align');
let selectedAlignmentId=null, alignmentPositions={},publishedPositions=new Map();
// Keep this query aligned with the CSS drawer breakpoint. No device sniffing.
const mobileLayout=matchMedia('(max-width: 760px)');
let desktopPanelOpen=true;
let map,config,originals=[],personal=[],pins=new Map(),enabled=new Set(Object.keys(categories)),showPins=true,placing=false,draft=null,statusTimer;
const text=(tag,value,cls)=>{const n=document.createElement(tag);n.textContent=value;if(cls)n.className=cls;return n;};
function status(message,sticky=false){clearTimeout(statusTimer);$('status').textContent=message;$('status').hidden=false;if(!sticky)statusTimer=setTimeout(()=>$('status').hidden=true,4500);}
function valid(m){return m&&typeof m.id==='string'&&/^personal-[a-zA-Z0-9-]{1,80}$/.test(m.id)&&typeof m.name==='string'&&m.name.trim()&&m.name.length<=100&&typeof m.note==='string'&&m.note.length<=2000&&Object.hasOwn(categories,m.category)&&Number.isFinite(m.x)&&m.x>=0&&m.x<=config.width&&Number.isFinite(m.y)&&m.y>=0&&m.y<=config.height;}
function persist(next){try{localStorage.setItem(KEY,JSON.stringify(next));personal=next;return true;}catch{status('Your browser could not save this change. Free some storage and try again.',true);return false;}}
function locationOf(m){return map.unproject([m.x,m.y],config.maxNativeZoom);}
function pixelsOf(latlng){const p=map.project(latlng,config.maxNativeZoom);return [Math.round(p.x),Math.round(p.y)];}
function moveAlignedMarker(id,latlng){
 const point=pixelsOf(latlng);
 if(!Number.isFinite(point[0])||!Number.isFinite(point[1])||point[0]<0||point[1]<0||point[0]>config.width||point[1]>config.height){status('Choose a point inside the illustration.');return;}
 const marker=originals.find(m=>m.id===id);if(!marker)return;
 const next={...alignmentPositions,[id]:point};
 try{localStorage.setItem(ALIGN_KEY,JSON.stringify(next));alignmentPositions=next;}catch{status('Could not save alignment locally. Export your progress before leaving.',true);return;}
 marker.x=point[0];marker.y=point[1];pins.get(id)?.setLatLng(locationOf(marker));updateAlignmentStatus();
}
function updateAlignmentStatus(){if(!alignmentMode)return;const count=Object.keys(alignmentPositions).length;$('alignment-count').textContent=`${count} corrected of ${originals.length}`;}
function restoreSelectedAlignment(){
 if(!selectedAlignmentId)return;
 const point=publishedPositions.get(selectedAlignmentId);if(!point)return;
 const next={...alignmentPositions};delete next[selectedAlignmentId];
 try{localStorage.setItem(ALIGN_KEY,JSON.stringify(next));alignmentPositions=next;}catch{status('Could not save the restored position.',true);return;}
 const marker=originals.find(m=>m.id===selectedAlignmentId);
 [marker.x,marker.y]=point;pins.get(marker.id)?.setLatLng(locationOf(marker));updateAlignmentStatus();status(`Restored ${marker.name} to its published position.`);
}
function exportAlignment(){const blob=new Blob([JSON.stringify({version:1,map:config.id,positions:alignmentPositions},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='night-harbor-marker-alignment.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function allMarkers(){return [...originals,...personal];}
function visibleMarkers(){const terms=$('search').value.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);return allMarkers().filter(m=>enabled.has(m.category)&&terms.every(t=>(m.name+' '+m.category+' '+m.note).toLocaleLowerCase().includes(t)));}
function popup(m){const n=document.createElement('div');n.append(text('div',m.category+(m.id.startsWith('personal-')?' · Your note':''),'tag'),text('h3',m.name));if(m.note)n.append(text('p',m.note));if(m.id.startsWith('personal-')){const edit=text('button','Edit note');edit.onclick=()=>openEditor(m);n.append(edit);}return n;}
function choose(m){if(alignmentMode&&!m.id.startsWith('personal-')){selectedAlignmentId=m.id;status(`Selected ${m.name}. Drag its pin or click the correct position on the map.`,true);}map.setView(locationOf(m),Math.max(map.getZoom(),3),{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});if(!showPins){showPins=true;$('hide-pins').setAttribute('aria-pressed','true');render();}pins.get(m.id)?.openPopup();if(mobileLayout.matches)setPanel(false);}
function render(){for(const pin of pins.values())pin.remove();pins.clear();const list=$('results');list.replaceChildren();const matches=visibleMarkers();$('count').textContent=matches.length+' places';for(const m of matches){const color=categories[m.category][1];const pinFace=text('span','');pinFace.style.setProperty('--pin',color);pinFace.append(markerSymbol(m));const icon=L.divIcon({className:'pin',html:pinFace,iconSize:[25,25],iconAnchor:[12,25],popupAnchor:[0,-23]});const canAlign=alignmentMode&&!m.id.startsWith('personal-');const pin=L.marker(locationOf(m),{icon,title:m.name,keyboard:true,riseOnHover:true,draggable:canAlign}).bindPopup(popup(m));pin.on('click',()=>{if(canAlign){selectedAlignmentId=m.id;status(`Selected ${m.name}. Drag this pin or click its correct position.`,true);}map.panTo(locationOf(m),{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});});if(canAlign)pin.on('dragend',()=>moveAlignedMarker(m.id,pin.getLatLng()));pin.bindTooltip(()=>text('span',m.name),{direction:'top',offset:[0,-23]});if(showPins)pin.addTo(map);pins.set(m.id,pin);const b=text('button','','place');const glyph=text('span','','symbol');glyph.append(markerSymbol(m));b.append(glyph);const label=text('span','');label.append(text('strong',m.name),text('small',m.category+(m.id.startsWith('personal-')?' · Personal note':'')));b.append(label);b.onclick=()=>choose(m);list.append(b);}if(!matches.length)list.append(text('p','No places found. Try another name or enable more categories.','empty'));}
function setPanel(open){if(!mobileLayout.matches)desktopPanelOpen=open;$('journal').classList.toggle('closed',!open);$('toggle-panel').setAttribute('aria-expanded',String(open));setTimeout(()=>map?.invalidateSize({pan:false}),0);}
function cancelPlacement(){placing=false;document.body.classList.remove('placing');$('cancel-place').hidden=true;$('status').hidden=true;}
function openEditor(m){draft={...m};$('editor-title').textContent=personal.some(p=>p.id===m.id)?'Your discovery':'A new discovery';$('name').value=m.name;$('category').value=m.category;$('note').value=m.note;$('delete').hidden=!personal.some(p=>p.id===m.id);$('editor').showModal();$('name').focus();}
function closeEditor(){draft=null;$('editor').close();}
function hashView(){const c=map.project(map.getCenter(),config.maxNativeZoom);return '#view='+[map.getZoom().toFixed(2),Math.round(c.x),Math.round(c.y)].join(',');}
async function init(){try{const responses=await Promise.all([fetch('data/map.json'),fetch('data/markers.json?v=3',{cache:'no-store'})]);if(responses.some(r=>!r.ok))throw Error('Map data unavailable');[config,originals]=await Promise.all(responses.map(r=>r.json()));publishedPositions=new Map(originals.map(m=>[m.id,[m.x,m.y]]));
if(alignmentMode){try{const saved=JSON.parse(localStorage.getItem(ALIGN_KEY)||'{}');if(!saved||Array.isArray(saved)||typeof saved!=='object')throw Error();for(const [id,point] of Object.entries(saved)){if(!originals.some(m=>m.id===id)||!Array.isArray(point)||point.length!==2||!point.every(Number.isFinite)||point[0]<0||point[1]<0||point[0]>config.width||point[1]>config.height)throw Error();}alignmentPositions=saved;for(const m of originals)if(saved[m.id])[m.x,m.y]=saved[m.id];}catch{status('Saved alignment could not be read; starting from published positions.',true);}}
map=L.map('map',{crs:L.CRS.Simple,minZoom:0,maxZoom:6,zoomSnap:.25,zoomDelta:.5,zoomControl:false,attributionControl:true,maxBoundsViscosity:.8});
const bounds=L.latLngBounds(map.unproject([0,config.height],4),map.unproject([config.width,0],4));
map.setMaxBounds(bounds.pad(1));
L.tileLayer('assets/tiles/night-harbor/{z}/{x}/{y}.webp?v='+encodeURIComponent(config.tileRevision||'v12'),{tileSize:256,minZoom:0,maxZoom:6,maxNativeZoom:4,noWrap:true,bounds,keepBuffer:1,attribution:'Illustrated fan atlas · Not an official game map'}).on('tileerror',()=>status('A map tile could not load. Check your connection and reload.')).addTo(map);
const fit=()=>map.fitBounds(bounds,{padding:[18,18],animate:false});fit();
const v=location.hash.match(/^#view=([\d.]+),(-?[\d.]+),(-?[\d.]+)$/);if(v){const [z,x,y]=v.slice(1).map(Number);if([z,x,y].every(Number.isFinite)&&z>=0&&z<=6&&x>=0&&x<=config.width&&y>=0&&y<=config.height)map.setView(map.unproject([x,y],4),z);}
try{const saved=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(saved)||saved.length>2000||!saved.every(valid))throw Error();personal=saved;}catch{status('Saved notes could not be read. Import a valid backup to recover them.',true);}
for(const [kind,[symbol]] of Object.entries(categories)){const b=text('button','');b.setAttribute('aria-pressed','true');b.append(markerSymbol({category:kind,name:''}),text('span',kind));b.onclick=()=>{enabled.has(kind)?enabled.delete(kind):enabled.add(kind);b.setAttribute('aria-pressed',String(enabled.has(kind)));render();};$('categories').append(b);const option=text('option',kind);option.value=kind;$('category').append(option);}
$('all-categories').onclick=()=>{enabled=new Set(Object.keys(categories));for(const b of $('categories').children)b.setAttribute('aria-pressed','true');render();};
$('search').oninput=render;$('zoom-in').onclick=()=>map.zoomIn();$('zoom-out').onclick=()=>map.zoomOut();$('fit').onclick=fit;
$('hide-pins').onclick=()=>{showPins=!showPins;$('hide-pins').setAttribute('aria-pressed',String(showPins));render();};
$('toggle-panel').onclick=()=>setPanel($('journal').classList.contains('closed'));setPanel(!mobileLayout.matches);
mobileLayout.addEventListener('change',()=>setPanel(mobileLayout.matches?false:desktopPanelOpen));
if(alignmentMode){$('alignment-tools').hidden=false;$('add').hidden=true;$('alignment-export').onclick=exportAlignment;$('alignment-restore').onclick=restoreSelectedAlignment;updateAlignmentStatus();}
$('add').onclick=()=>{map.closePopup();placing=true;document.body.classList.add('placing');$('cancel-place').hidden=false;status('Click the map to place your personal marker.',true);if(mobileLayout.matches)setPanel(false);};
$('cancel-place').onclick=cancelPlacement;document.addEventListener('keydown',e=>{if(e.key==='Escape')cancelPlacement();});
map.on('click',e=>{if(alignmentMode&&selectedAlignmentId){moveAlignedMarker(selectedAlignmentId,e.latlng);return;}if(!placing)return;const p=map.project(e.latlng,4);if(p.x<0||p.y<0||p.x>config.width||p.y>config.height){status('Choose a position inside Night Harbor.');return;}cancelPlacement();openEditor({id:'personal-'+crypto.randomUUID(),name:'',note:'',category:'Personal',x:Math.round(p.x),y:Math.round(p.y)});});
$('cancel-edit').onclick=closeEditor;$('editor').addEventListener('close',()=>draft=null);
$('marker-form').onsubmit=e=>{e.preventDefault();if(!draft)return;const m={...draft,name:$('name').value.trim(),note:$('note').value,category:$('category').value};if(!valid(m))return;if(personal.length>=2000&&!personal.some(p=>p.id===m.id)){status('You have reached the 2,000-note limit. Export and remove older notes.');return;}if(persist([...personal.filter(p=>p.id!==m.id),m])){closeEditor();enabled.add(m.category);for(const b of $('categories').children)b.setAttribute('aria-pressed',String(enabled.has(b.lastChild.textContent)));$('search').value='';render();choose(m);status('Marker saved to your field notes.');}};
$('delete').onclick=()=>{if(draft&&persist(personal.filter(p=>p.id!==draft.id))){closeEditor();render();status('Personal marker deleted.');}};
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:1,map:config.id,markers:personal},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='night-harbor-field-notes.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onclick=()=>$('import-file').click();$('import-file').onchange=async e=>{try{const file=e.target.files[0];if(!file)return;if(file.size>5000000)throw Error('File exceeds 5 MB.');const data=JSON.parse(await file.text());if(data.version!==1||data.map!==config.id||!Array.isArray(data.markers)||!data.markers.every(valid))throw Error('Not a valid Night Harbor field-notes file.');const merged=new Map(personal.map(m=>[m.id,m]));for(const m of data.markers)merged.set(m.id,{id:m.id,name:m.name.trim(),category:m.category,note:m.note,x:m.x,y:m.y});if(merged.size>2000)throw Error('The combined notes exceed 2,000 markers.');if(persist([...merged.values()])){render();status('Notes imported. Matching IDs updated; other notes kept.');}}catch(e){status('Import failed: '+e.message,true);}finally{$('import-file').value='';}};
$('share').onclick=async()=>{const url=new URL(location.href);url.hash=hashView();history.replaceState(null,'',url);try{await navigator.clipboard.writeText(url.href);status('View link copied. Personal notes are not included.');}catch{status('This view is now in the address bar. Copy its URL to share.',true);}};
map.on('zoomend',()=>{$('zoom-label').textContent=Math.round(2**(map.getZoom()-4)*100)+'% · NIGHT HARBOR';$('zoom-in').disabled=map.getZoom()>=6;$('zoom-out').disabled=map.getZoom()<=0;});
render();document.body.dataset.ready='true';
}catch(e){status('The atlas could not load. Please reload the page. '+e.message,true);}}
init();
