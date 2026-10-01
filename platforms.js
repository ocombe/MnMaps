/* Optional stacked-platform outlines; artwork stays unchanged. */
'use strict';
function setupPlatforms(map,config,data){
 const rows=data.platforms||[],toPoint=p=>map.unproject(p,config.coordinateZoom);
 const group=L.layerGroup().addTo(map),ink=L.layerGroup().addTo(map);
 const pane=map.getPane('platformInk')||map.createPane('platformInk');pane.style.zIndex='460';pane.style.pointerEvents='none';
 let controls=$('platform-controls');if(!controls){controls=text('section','','platform-controls');controls.id='platform-controls';$('hidden-controls').after(controls);}
 controls.replaceChildren();controls.hidden=!rows.length||config.levelId!==data.interactiveLevel;
 const label=text('label','Platform outlines'),select=text('select','');select.id='platform-select';select.setAttribute('aria-label','Bring a platform outline forward');
 label.htmlFor=select.id;select.append(new Option('Hover a deck or choose a platform',''));
 for(const [i,r] of rows.entries())select.append(new Option(r.name+(r.name==='Platform'?' '+(i+1):'')+' · '+r.band,r.id));
 controls.append(label,select,text('p','Hover to trace a deck. Click an overlap to choose a platform beneath it. Only its outline comes forward.'));
 const shape=(polys,style)=>L.polygon(polys.map(poly=>poly.map(r=>r.map(toPoint))),{smoothFactor:0,bubblingMouseEvents:false,...style});
 let selected=null,locked=false;
 function show(id,keep=false){
  ink.clearLayers();selected=rows.find(r=>r.id===id)||null;select.value=selected?.id||'';locked=keep&&!!selected;
  if(!selected)return;
  const base={pane:'platformInk',interactive:false,fill:false,color:'#3f2818',opacity:1,weight:2.3,className:'platform-outline'};
  // The complete rim is dashed; its visible sections receive a solid line.
  ink.addLayer(shape(selected.fullPolygons,{...base,dashArray:'6 5',className:'platform-outline platform-under'}));
  if(selected.visiblePolygons.length)ink.addLayer(shape(selected.visiblePolygons,{...base,className:'platform-outline platform-visible'}));
  for(const l of ink.getLayers()){const el=l.getElement();if(el){el.dataset.platform=selected.id;el.setAttribute('aria-label',selected.name+' outline');}}
 }
 select.onchange=()=>show(select.value,true);
 function inside(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;
 }return yes;}
 const contains=(r,p)=>r.fullPolygons.some(poly=>inside(p,poly[0])&&!poly.slice(1).some(h=>inside(p,h)));
 if(config.levelId===data.dottedLevel){
  for(const r of rows)group.addLayer(shape(r.fullPolygons,{pane:'platformInk',interactive:false,fill:false,color:'#473824',weight:1.3,dashArray:'1 5',opacity:.5,className:'platform-footprint'}));
 }else if(config.levelId===data.interactiveLevel){
  for(const r of rows){
   const hit=shape(r.fullPolygons,{color:'#473824',weight:0,fillOpacity:0,opacity:0,className:'platform-hit'});
   hit.bindTooltip(()=>text('span',r.name+' · '+r.band),{sticky:true});
   hit.on('mouseover',()=>{if(!locked)show(r.id);});
   hit.on('mouseout',()=>{if(!locked)show(null);});
   hit.on('click',e=>{
    const pixel=map.project(e.latlng,config.coordinateZoom),choices=rows.filter(row=>contains(row,[pixel.x,pixel.y]));
    const content=text('div','','platform-choices');content.append(text('strong','Choose a platform'));
    for(const row of choices){const b=text('button',row.name+' · '+row.band);b.type='button';b.dataset.platformChoice=row.id;b.onclick=()=>{show(row.id,true);map.closePopup();};content.append(b);}
    show(r.id,true);L.popup().setLatLng(e.latlng).setContent(content).openOn(map);
   });
   hit.on('add',()=>{const el=hit.getElement();el.dataset.platform=r.id;el.setAttribute('aria-label',r.name+' · '+r.band);el.setAttribute('role','button');el.setAttribute('tabindex','0');el.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();show(r.id,true);}};});
   group.addLayer(hit);
  }
 }
 return {show,dispose(){group.remove();ink.remove();controls.replaceChildren();controls.hidden=true;},get selected(){return selected?.id||null;}};
}
