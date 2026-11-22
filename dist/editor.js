'use strict';
// EDITOR MAP: presets/defaults → geometry/warp → slider scales → rendering → gestures → saving/shortcuts.
// Layout and labels: index.html. Appearance: studio.css. Instagram composition: post.js.
const $=id=>document.getElementById(id), canvas=$('canvas'), title=document.querySelector('[name=title]');
$('grid').checked=true;
const embedded=Boolean(document.documentElement?.classList.contains('embed-mode'));
const draftKey=embedded?'mg-embed-draft-v1':'mg-draft-v1';
// Keep the experimental connected motion code available, but disabled for production.
const canvasMotionEnabled=false;
// New-symbol defaults: r = half the shape size; w = artwork line weight.
// Nodes: [x, y, invisibleJunction, filled, 'circle'|'square', dottedStroke].
// Edges: [startNodeIndex, endNodeIndex, bendOffsetX, bendOffsetY, dottedStroke].
function symbol(name,n,e){return {name,n,e,r:16,w:3}}
// Edit these names/coordinates to change the built-in Sketchbook; saved local edits override them.
const presets=[symbol('Me',[[320,200]],[]),symbol('You & Me',[[245,200],[395,200]],[[0,1,0,0]]),symbol('Distant Love',[[90,200],[550,200]],[[0,1,0,0]]),symbol('Close Love',[[215,200],[425,200]],[[0,1,0,-75],[0,1,0,75]]),symbol('Mother & Daughter',[[225,132],[225,268],[172,200,1],[416,125],[416,275],[353,200,1],[416,200]],[[0,2,-16,-12],[2,1,-16,12],[3,5,-22,-14],[5,4,-22,14],[2,5,0,0],[5,6,0,0]])];
// Grid spacing in drawing units; shared by snapping and the visible grid.
const gridStep = 32;
function gridValue(value){return Math.round(value / gridStep) * gridStep}
function placement(p){
  if (!$('grid').checked) return p;
  return p.map(gridValue);
}
function connectionTarget(raw, source){
  const position = placement(raw);
  const sourceNode = drawing.n[source];
  if ($('grid').checked && sourceNode[0] === position[0] && sourceNode[1] === position[1])
    return {position, index:source};
  const index = drawing.n.findIndex(([x,y],i) => i !== source && (
    (x === position[0] && y === position[1]) ||
    Math.hypot(x-raw[0], y-raw[1]) <= drawing.r
  ));
  return {position:index < 0 ? position : drawing.n[index].slice(0,2), index};
}
for(const preset of presets){
  for(const node of preset.n){node.splice(0,2,gridValue(node[0]),gridValue(node[1]))}
  for(const edge of preset.e)setCurve(preset,edge,curveLevel(preset,edge));
}
function gridMarkup(){return gridVisible?`<defs><pattern id="unit-grid" width="${gridStep}" height="${gridStep}" patternUnits="userSpaceOnUse"><path d="M0 ${gridStep} V0 H${gridStep}" fill="none" stroke="#141414" stroke-opacity=".18" stroke-width="1" vector-effect="non-scaling-stroke"/></pattern></defs><rect x="${view.x}" y="${view.y}" width="${view.w}" height="${view.h}" fill="url(#unit-grid)" pointer-events="none"/>`:''}
// Browser persistence: keep these storage keys stable to retain existing drawings.
function read(k,f){try{return JSON.parse(localStorage.getItem(k))??f}catch{return f}}
let drawing=read(draftKey,null),variations=read('mg-variations-v1',[]),mode='move',history=[],gesture=null;
let selected=null, future=[];
let librarySource=null;
const storedSketchbook=read('mg-sketchbook-v1',null);
if(Array.isArray(storedSketchbook))presets.splice(0,presets.length,...storedSketchbook.map(migrate));
function selectedNodes(){return selected?.type==='multi'?selected.indices.filter(i=>drawing.n[i]):selected?.type==='n'?[selected.i]:[]}
function selectedShapes(){return selectedNodes().filter(i=>!drawing.n[i][2])}
function selectedEdges(){return selected?.type==='multi'?(selected.edges||[]).filter(i=>drawing.e[i]):selected?.type==='e'?[selected.i]:[]}
function selectNodes(indices,edges=[]){indices=[...new Set(indices)];edges=[...new Set(edges)];const count=indices.length+edges.length;selected=count===1?(indices.length?{type:'n',i:indices[0]}:{type:'e',i:edges[0]}):count?{type:'multi',indices,edges}:null}
function movableNodes(){return [...new Set([...selectedNodes(),...selectedEdges().flatMap(i=>drawing.e[i].slice(0,2))])]}
function canvasRatio(){return canvas.clientWidth&&canvas.clientHeight?canvas.clientWidth/canvas.clientHeight:1.6}
// Camera window only: changing zoom never changes saved node coordinates.
let view={x:0,y:0,w:640,h:400},gridVisible=true;
let motionRuntime=null;
function bounds(d){if(!d.n.length)return {x:0,y:0,w:640,h:400};const xs=d.n.map(n=>n[0]),ys=d.n.map(n=>n[1]);for(const e of d.e){const f=frame(d,e);xs.push(f.mid[0]+2*e[2]);ys.push(f.mid[1]+2*e[3])}const pad=d.r+d.w+32+warpAmount(d),x=Math.min(...xs)-pad,y=Math.min(...ys)-pad;return {x,y,w:Math.max(...xs)-x+pad,h:Math.max(...ys)-y+pad}}
function fitView(){const b=bounds(drawing),ratio=canvasRatio(),w=Math.max(640,b.w,b.h*ratio),cx=b.x+b.w/2,cy=b.y+b.h/2,h=w/ratio;view={x:cx-w/2,y:cy-h/2,w,h};render()}
function zoom(factor){cancelGesture();const w=Math.max(320,Math.min(10240,view.w*factor)),h=w/canvasRatio();view={x:view.x+(view.w-w)/2,y:view.y+(view.h-h)/2,w,h};render()}
function migrate(d){for(const n of d.n) if(n[3]===undefined)n[3]=!n[2]&&Boolean(d.filled);delete d.filled;return d}
if(drawing)migrate(drawing);variations.forEach(migrate);
function frame(d,e){const A=d.n[e[0]],B=d.n[e[1]],length=Math.hypot(B[0]-A[0],B[1]-A[1])||1;return {mid:[(A[0]+B[0])/2,(A[1]+B[1])/2],normal:[-(B[1]-A[1])/length,(B[0]-A[0])/length],length}}
function curveLevel(d,e){const f=frame(d,e);return Math.max(-4,Math.min(5,Math.round((e[2]*f.normal[0]+e[3]*f.normal[1])/(f.length/8))))}
function setCurve(d,e,level){const f=frame(d,e);e[2]=f.normal[0]*f.length/8*level;e[3]=f.normal[1]*f.length/8*level}
function persist(){try{localStorage.setItem(draftKey,JSON.stringify(drawing))}catch{$('status').textContent='Browser storage unavailable. Export JSON to keep this drawing.'}}
// Trim connections to circle/square boundaries; use this geometry for curves and handles.
function curveGeometry(d,[a,b,dx,dy]){let A=d.n[a],B=d.n[b],mx=(A[0]+B[0])/2+dx*2,my=(A[1]+B[1])/2+dy*2;
function rim(p){let x=mx-p[0],y=my-p[1],len=(p[4]==='square'?Math.max(Math.abs(x),Math.abs(y)):Math.hypot(x,y))||1,r=p[2]?0:d.r;return [p[0]+r*x/len,p[1]+r*y/len]}
return {a:rim(A),c:[mx,my],b:rim(B)}}
function curvePoint(g,t){const u=1-t;return [u*u*g.a[0]+2*u*t*g.c[0]+t*t*g.b[0],u*u*g.a[1]+2*u*t*g.c[1]+t*t*g.b[1]]}
function path(d,e){const g=curveGeometry(d,e);return 'M'+g.a+' Q'+g.c+' '+g.b}
function offsetCurve(g,distance){const points=[];for(let i=0;i<=96;i++){const t=i/96,p=curvePoint(g,t),dx=(1-t)*(g.c[0]-g.a[0])+t*(g.b[0]-g.c[0]),dy=(1-t)*(g.c[1]-g.a[1])+t*(g.b[1]-g.c[1]),length=Math.hypot(dx,dy)||1;points.push([p[0]-dy/length*distance,p[1]+dx/length*distance])}return 'M'+points.map(p=>p.join(',')).join(' L')}
function nodeMarkup(n,r,attrs){return n[4]==='square'&&!n[2]?`<rect x="${n[0]-r}" y="${n[1]-r}" width="${r*2}" height="${r*2}" ${attrs}/>`:`<circle cx="${n[0]}" cy="${n[1]}" r="${r}" ${attrs}/>`}
// Warp tuning: .16 converts slider strength to displacement; scale changes wavelength, not amplitude.
// If you extend slider ranges below, also update the clamps in warpAmount/warpScale.
function warpAmount(d){return d.texture===false?0:Math.max(0,Math.min(40,d.textureStrength??1.5))*.16}
function warpScale(d){return Math.max(.2,Math.min(8,d.distortionScale??1))}
function warpPoint(d,p){const a=warpAmount(d),[x,y]=p,s=warpScale(d),u=x/s,v=y/s;return [x+a*(Math.sin(u*.071+v*.043+1.7)+.35*Math.sin(u*.131-v*.067))/1.35,y+a*(Math.sin(u*.037-v*.083+3.1)+.35*Math.sin(u*.097+v*.113))/1.35]}
function warpSteps(d,length){return Math.max(16,Math.min(4096,Math.ceil(length/Math.min(8,warpScale(d)*6))))}
// Smooth cubic centerlines are stroked AFTER warping: stroke width never changes.
function smoothPath(sample,steps,move=true){let result=move?'M'+sample(0):'';const h=.00001;
  for(let i=0;i<steps;i++){const t=i/steps,u=(i+1)/steps,p=sample(t),q=sample(u),a=sample(t-h),b=sample(t+h),c=sample(u-h),d=sample(u+h),factor=(u-t)/(6*h);result+=' C'+[p[0]+(b[0]-a[0])*factor,p[1]+(b[1]-a[1])*factor]+' '+[q[0]-(d[0]-c[0])*factor,q[1]-(d[1]-c[1])*factor]+' '+q}return result}
function inkPath(d,e){if(!warpAmount(d))return path(d,e);const g=curveGeometry(d,e),length=Math.hypot(g.c[0]-g.a[0],g.c[1]-g.a[1])+Math.hypot(g.b[0]-g.c[0],g.b[1]-g.c[1]);return smoothPath(t=>warpPoint(d,curvePoint(g,t)),warpSteps(d,length))}
function warpedNodePath(d,n){let line;
  if(n[4]==='square'){const r=d.r,corners=[[-r,-r],[r,-r],[r,r],[-r,r]];line='';for(let i=0;i<4;i++){const a=corners[i],b=corners[(i+1)%4];line+=smoothPath(t=>warpPoint(d,[n[0]+a[0]+(b[0]-a[0])*t,n[1]+a[1]+(b[1]-a[1])*t]),warpSteps(d,r*2),i===0)}}
  else line=smoothPath(t=>warpPoint(d,[n[0]+d.r*Math.cos(t*Math.PI*2),n[1]+d.r*Math.sin(t*Math.PI*2)]),Math.max(64,warpSteps(d,d.r*Math.PI*2)));
  return line+' Z';
}
function inkNode(d,n,attrs){return warpAmount(d)?`<path d="${warpedNodePath(d,n)}" ${attrs}/>`:nodeMarkup(n,d.r,attrs)}
// Shared artwork renderer: canvas, library thumbnails, SVG downloads, and Instagram all use this.
// Interactive hit areas/hover outlines are included only on the editing canvas.
// Zero-length round dashes create circular dots; spacing scales with artwork line weight.
function dottedStroke(d,on){return on?`stroke-linecap="round" stroke-dasharray="0 ${d.w*2.5}"`:''}
function art(d,interactive=false){
  const ink=[];
  const edges=d.e.map((e,i)=>{
    const line=inkPath(d,e),visible=`<path ${interactive?`data-ink-edge="${i}"`:''} pointer-events="none" fill="none" stroke="currentColor" stroke-width="${d.w}" ${dottedStroke(d,e[4])} d="${line}"/>`;
    ink.push(visible);if(!interactive)return '';
    const g=curveGeometry(d,e),offset=d.w/2+4*view.w/640;
    const outline=[-1,1].map(side=>`<path class="hover-outline" d="${offsetCurve(g,offset*side)}"/>`).join('');
    return `<g class="editable" data-edge-group="${i}"><path data-e="${i}" fill="none" stroke="transparent" stroke-width="20" vector-effect="non-scaling-stroke" pointer-events="stroke" d="${line}"/>${outline}</g>`;
  }).join('');
  const nodes=d.n.map((n,i)=>{
    const visible=n[2]?'':inkNode(d,n,`${interactive?`data-ink-node="${i}"`:''} pointer-events="none" stroke-width="${d.w}" stroke="currentColor" ${dottedStroke(d,n[5])} fill="${n[3]?'currentColor':'none'}"`);
    ink.push(visible);if(!interactive)return '';
    const hitRadius=n[2]?11:Math.max(d.r+5,12);
    return `<g class="editable" data-node-group="${i}">${nodeMarkup(n,hitRadius,`data-n="${i}" fill="transparent" pointer-events="all"`)}${nodeMarkup(n,n[2]?7:d.r+5,'class="hover-outline"')}</g>`;
  }).join('');
  const markup=ink.join('')+edges+nodes;
  return interactive?`<g id="canvas-art">${markup}</g>`:markup;
}
// MAIN SLIDER SETTINGS: edit these ten values to change each slider's increments/range.
// radius is stored as half the displayed shape size; distortion is a wavelength multiplier.
const scales={
  radius:{key:'r',levels:[4,8,12,16,24,32,48,64,80,96],factor:2},
  weight:{key:'w',levels:[.5,1,2,3,4,6,8,10,12,16],factor:1},
  texture:{key:'textureStrength',levels:[0,.75,1.5,3,5,8,12,18,26,40],factor:1},
  distortion:{key:'distortionScale',levels:[.2,.35,.5,.75,1,1.5,2,3,5,8],factor:1}
};
for(const id of Object.keys(scales)){const slider=$(id);slider.min=0;slider.max=9;slider.step=1;slider.parentElement?.querySelector('.ticks')?.replaceChildren(...Array.from({length:10},()=>document.createElement('i')))}
if(!drawing)drawing=randomSymbol();
// Refresh the canvas, selection outlines, and control states after an edit.
function render(){const h=view.w/canvasRatio();view.y+=(view.h-h)/2;view.h=h;canvas.setAttribute('viewBox',`${view.x} ${view.y} ${view.w} ${view.h}`);canvas.innerHTML=gridMarkup()+art(drawing,true);
$('zoom-value').textContent=Math.round(640/view.w*100)+'%';$('zoom-out').disabled=view.w>=10240;$('zoom-in').disabled=view.w<=320;
const artLayer=canvas.querySelector('#canvas-art');
for(const i of selectedNodes()){const n=drawing.n[i];artLayer.insertAdjacentHTML('beforeend',nodeMarkup(n,n[2]?9:drawing.r+8,`data-selection-node="${i}" class="selection-ring" pointer-events="none" fill="none" stroke="#141414" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="3 3"`))}
if(selected?.type==='e'&&drawing.e[selected.i]){const p=warpPoint(drawing,curvePoint(curveGeometry(drawing,drawing.e[selected.i]),.5)),r=5*view.w/640;artLayer.insertAdjacentHTML('beforeend',`<circle data-handle="${selected.i}" data-e="${selected.i}" cx="${p[0]}" cy="${p[1]}" r="${r}" fill="#fffef8" stroke="#141414" stroke-width="1" vector-effect="non-scaling-stroke"/>`)}
for(const i of selectedEdges()){const g=curveGeometry(drawing,drawing.e[i]);for(const side of [-1,1])artLayer.insertAdjacentHTML('beforeend',`<path data-selection-edge="${i}" data-side="${side}" class="selected-line" pointer-events="none" d="${offsetCurve(g,side*(drawing.w/2+4*view.w/640))}" fill="none" stroke="#141414" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="1 3"/>`)}
for(const [id,{key,levels,factor}] of Object.entries(scales)){
  const value=id==='texture'?(drawing.texture===false?0:drawing[key]??1.5):id==='distortion'?warpScale(drawing):drawing[key];
  const nearest=levels.reduce((best,v,i)=>Math.abs(v-value)<Math.abs(levels[best]-value)?i:best,0);
  $(id).value=nearest;
  const units=value*factor;
  const label=id==='texture'?(value===0?'Clean':`Distortion level ${nearest+1} of 10`):id==='distortion'?`Scale level ${nearest+1} of 10, ${value} times`:units+(units===1?' unit':' units');
  $(id+'-value').textContent=label;
  $(id).setAttribute('aria-valuetext',label);
}
const shapes=selectedShapes(),filled=shapes.filter(i=>drawing.n[i][3]).length;
$('filled').disabled=!shapes.length;$('filled').checked=shapes.length>0&&filled===shapes.length;$('filled').indeterminate=filled>0&&filled<shapes.length;
const edges=selectedEdges(),dottedValues=[...edges.map(i=>Boolean(drawing.e[i][4])),...shapes.map(i=>Boolean(drawing.n[i][5]))];
$('dotted').disabled=!dottedValues.length;$('dotted').checked=dottedValues.length>0&&dottedValues.every(Boolean);$('dotted').indeterminate=dottedValues.some(Boolean)&&!dottedValues.every(Boolean);
for(const shape of ['circle','square']){const b=$('shape-'+shape);b.disabled=!shapes.length;b.setAttribute('aria-pressed',String(shapes.length>0&&shapes.every(i=>(drawing.n[i][4]||'circle')===shape)))}
$('delete').disabled=!selected;
$('curve').disabled=$('straighten').disabled=!edges.length;
const level=edges.length?curveLevel(drawing,drawing.e[edges[0]]):0;
$('curve').value=level;$('curve-value').textContent=edges.length?(edges.every(i=>curveLevel(drawing,drawing.e[i])===level)?String(level):'Mixed'):'—';
$('selection').textContent='';
for(const [id,show] of [['selected-shapes',shapes.length],['selected-fill',shapes.length],['selected-dots',dottedValues.length],['selected-curve',edges.length],['selected-actions',selected],['selected-empty',!selected]])$(id).hidden=!show;
$('straighten').hidden=!edges.length;
$('update-entry').disabled=$('delete-entry').disabled=!librarySource;
$('library-source').textContent=librarySource?'Editing '+(librarySource.key==='seeds'?'Sketchbook':'Your variations')+' · Save edits to update this entry.':'Select a library symbol to edit its saved entry.';
$('undo').disabled=!history.length;
$('redo').disabled=!future.length;
if(motionRuntime)paintCanvasMotion();
}
function remember(){history.push(structuredClone(drawing));if(history.length>80)history.shift();future=[]}
function load(d,source=null){cancelGesture();remember();selected=null;librarySource=source;drawing=migrate(structuredClone(d));title.value=drawing.name;fitView();persist();archives()}
function archives(){for(const [key,items] of [['seeds',presets],['saved',variations]]){let el=$(key);el.replaceChildren();items.forEach((d,index)=>{let b=document.createElement('button');b.className='card'+(librarySource?.key===key&&librarySource.index===index?' active':'');const box=bounds(d);b.innerHTML='<svg viewBox="'+[box.x,box.y,box.w,box.h].join(' ')+'">'+art(d)+'</svg>';b.append(document.createTextNode(d.name));b.title='Edit '+d.name;b.onclick=()=>load(d,{key,index});el.append(b)});if(!items.length)el.innerHTML='<span class="label">No saved symbols</span>'}}
const hints={move:'',dot:'Click empty space to place a circle. Press V to return to selection.',grow:'Drag from a circle or line to grow a branch. Drop on a circle to connect.',bend:'Drag across a line to choose a symmetric curve level. Click Straighten to reset.',erase:'Click a line or circle to remove it. Press V to return to selection.'};
function tool(t){cancelGesture();mode=t;canvas.dataset.tool=t;for(const k in hints){$(k).classList.toggle('on',t===k);$(k).setAttribute('aria-pressed',String(t===k))}$('hint').textContent=hints[t]}
for(const k in hints)$(k).onclick=()=>tool(k);
function point(ev){let p=new DOMPoint(ev.clientX,ev.clientY).matrixTransform(canvas.getScreenCTM().inverse());return [p.x,p.y]}
// Find and split the underlying quadratic so a placed shape becomes a real endpoint.
const mix=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function nearestEdge(p,exclude=-1){let best=null;drawing.e.forEach((e,i)=>{if(e[0]===exclude||e[1]===exclude)return;const A=drawing.n[e[0]],B=drawing.n[e[1]],f=frame(drawing,e),C=[f.mid[0]+2*e[2],f.mid[1]+2*e[3]];for(let k=1;k<200;k++){const t=k/200,q=mix(mix(A,C,t),mix(C,B,t),t),dist=Math.hypot(q[0]-p[0],q[1]-p[1]);if((!best||dist<best.dist)&&Math.hypot(q[0]-A[0],q[1]-A[1])>drawing.r&&Math.hypot(q[0]-B[0],q[1]-B[1])>drawing.r)best={i,t,q,dist}}});return best}
function splitEdge(hit,nodeIndex){const edge=drawing.e[hit.i],A=drawing.n[edge[0]],B=drawing.n[edge[1]],f=frame(drawing,edge),C=[f.mid[0]+2*edge[2],f.mid[1]+2*edge[3]],L=mix(A,C,hit.t),R=mix(C,B,hit.t);const segment=(a,b,c)=>[a,b,(c[0]-(drawing.n[a][0]+drawing.n[b][0])/2)/2,(c[1]-(drawing.n[a][1]+drawing.n[b][1])/2)/2,...edge.slice(4)];drawing.e.splice(hit.i,1,segment(edge[0],nodeIndex,L),segment(nodeIndex,edge[1],R))}
function attachNode(i,raw=drawing.n[i]){const hit=nearestEdge(raw,i);const tolerance=Math.max(8,drawing.r);if(hit&&hit.dist<=tolerance){drawing.n[i].splice(0,2,...placement(hit.q));splitEdge(hit,i);return true}return false}
function finish(){title.value=drawing.name;render();persist();archives()}
function removeSelection(){if(!selected)return;remember();const removed=new Set(selectedNodes()),edges=new Set(selectedEdges()),map=new Map();drawing.n=drawing.n.filter((n,i)=>{if(removed.has(i))return false;map.set(i,map.size);return true});drawing.e=drawing.e.filter(([a,b],i)=>!edges.has(i)&&!removed.has(a)&&!removed.has(b)).map(([a,b,...rest])=>[map.get(a),map.get(b),...rest]);selected=null;finish()}
function cancelGesture(){if(!gesture)return;const id=gesture.id;drawing=gesture.before;gesture=null;selected=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);render()}
// POINTER GESTURES: selection box, Shift-click, move, connect, bend, and erase.
// Commit one undo snapshot on pointerup; cancellation restores the pre-drag drawing.
canvas.ondragstart=ev=>ev.preventDefault();
canvas.onpointerdown=ev=>{
  if(gesture||ev.button!==0||!ev.isPrimary)return;
  ev.preventDefault();canvas.focus({preventScroll:true});
  const p=point(ev),n=ev.target.dataset.n,e=ev.target.dataset.e;
  const previous=selectedNodes(),previousEdges=selectedEdges();
  if(mode==='move'&&ev.shiftKey&&(n!==undefined||e!==undefined)){if(n!==undefined)selectNodes(previous.includes(+n)?previous.filter(i=>i!==+n):[...previous,+n],previousEdges);else selectNodes(previous,previousEdges.includes(+e)?previousEdges.filter(i=>i!==+e):[...previousEdges,+e]);render();return}
  if(mode==='move'&&n===undefined&&e===undefined){gesture={type:'marquee',id:ev.pointerId,start:p,before:structuredClone(drawing),base:ev.shiftKey?previous:[],baseEdges:ev.shiftKey?previousEdges:[]};if(!ev.shiftKey)selected=null;canvas.setPointerCapture(ev.pointerId);render();return}
  if(!(mode==='move'&&((n!==undefined&&previous.includes(+n))||(e!==undefined&&previousEdges.includes(+e)))))selected=n!==undefined?{type:'n',i:+n}:e!==undefined?{type:'e',i:+e}:null;
  if(mode==='erase'){removeSelection();return}
  const before=structuredClone(drawing);
  if(mode==='dot'&&selected?.type!=='n'){const i=drawing.n.push([...placement(p),0,false])-1;selected={type:'n',i};gesture={type:'move',i,created:true};}
  else if(mode==='grow'&&selected){
    let i=selected.i;
    if(selected.type==='e'){
      const edge=drawing.e[i],A=drawing.n[edge[0]],B=drawing.n[edge[1]],f=frame(drawing,edge),control=[f.mid[0]+2*edge[2],f.mid[1]+2*edge[3]];
      const mix=(a,b,t)=>a.slice(0,2).map((v,k)=>v+(b[k]-v)*t);
      let best=Infinity,t=.5;
      for(let k=1;k<100;k++){const u=k/100,q=mix(mix(A,control,u),mix(control,B,u),u),dist=Math.hypot(q[0]-p[0],q[1]-p[1]);if(dist<best){best=dist;t=u}}
      const left=mix(A,control,t),right=mix(control,B,t),q=placement(mix(left,right,t)),j=drawing.n.push([...q,1,false])-1;
      const segment=(a,b,c)=>[a,b,(c[0]-(drawing.n[a][0]+drawing.n[b][0])/2)/2,(c[1]-(drawing.n[a][1]+drawing.n[b][1])/2)/2,...edge.slice(4)];
      drawing.e.splice(i,1,segment(edge[0],j,left),segment(j,edge[1],right));i=j;
    }
    selected={type:'n',i};gesture={type:'grow',i};
   }else if((selectedNodes().length||selected?.type==='multi')&&mode==='move'){const ids=movableNodes();gesture={type:'move',i:ids[0],indices:ids,origins:ids.map(i=>drawing.n[i].slice(0,2))}};
  if(!gesture&&selected?.type==='e'&&(mode==='move'||mode==='bend'))gesture={type:'bend',i:selected.i,level:curveLevel(drawing,drawing.e[selected.i])};
  if(gesture){Object.assign(gesture,{id:ev.pointerId,start:p,before,origin:gesture.type==='move'?drawing.n[gesture.i].slice(0,2):null});canvas.setPointerCapture(ev.pointerId);canvas.classList.add('dragging')}
  render();
};
canvas.onpointermove=ev=>{
  const g=gesture;if(!g||g.id!==ev.pointerId)return;
  const p=point(ev),delta=[p[0]-g.start[0],p[1]-g.start[1]];
  if(g.type==='marquee'){const x=Math.min(p[0],g.start[0]),y=Math.min(p[1],g.start[1]),w=Math.abs(delta[0]),h=Math.abs(delta[1]),inside=p=>p[0]>=x&&p[0]<=x+w&&p[1]>=y&&p[1]<=y+h;const ids=drawing.n.flatMap((n,i)=>inside(n)?[i]:[]),edges=drawing.e.flatMap((e,i)=>{const geometry=curveGeometry(drawing,e);for(let k=0;k<=64;k++)if(inside(warpPoint(drawing,curvePoint(geometry,k/64))))return [i];return []});selectNodes([...g.base,...ids],[...g.baseEdges,...edges]);render();canvas.insertAdjacentHTML('beforeend',`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#141414" fill-opacity=".04" stroke="#141414" stroke-width="1" vector-effect="non-scaling-stroke" stroke-dasharray="3 3" pointer-events="none"/>`);return}
  if(Math.hypot(...delta)<2)return;
  if(g.type==='move'){
    if(g.indices?.length>1){const snapped=placement([g.origins[0][0]+delta[0],g.origins[0][1]+delta[1]]),dx=snapped[0]-g.origins[0][0],dy=snapped[1]-g.origins[0][1];g.indices.forEach((i,k)=>drawing.n[i].splice(0,2,g.origins[k][0]+dx,g.origins[k][1]+dy));render();return}
    const levels=drawing.e.map(e=>curveLevel(drawing,e));
    drawing.n[g.i].splice(0,2,...placement([g.origin[0]+delta[0],g.origin[1]+delta[1]]));
    drawing.e.forEach((e,i)=>{if(e[0]===g.i||e[1]===g.i)setCurve(drawing,e,levels[i])});
  }
  if(g.type==='bend'){const e=drawing.e[g.i],f=frame(drawing,e),level=Math.max(-4,Math.min(5,Math.round(g.level+(delta[0]*f.normal[0]+delta[1]*f.normal[1])/(f.length/8))));setCurve(drawing,e,level)}
  render();
  if(g.type==='grow'){const target=connectionTarget(p,g.i).position;canvas.insertAdjacentHTML('beforeend',`<path pointer-events="none" fill="none" stroke="#141414" stroke-dasharray="4 4" d="M${drawing.n[g.i].slice(0,2)} L${target}"/><circle pointer-events="none" cx="${target[0]}" cy="${target[1]}" r="${drawing.r}" fill="none" stroke="#141414"/>`)}
};
canvas.onpointerup=ev=>{
  const g=gesture;if(!g||g.id!==ev.pointerId)return;
  if(g.type==='grow'){
    const p=point(ev),target=connectionTarget(p,g.i);
    if(Math.hypot(p[0]-g.start[0],p[1]-g.start[1])>5&&target.index!==g.i){let b=target.index;if(b<0){b=drawing.n.push([...target.position,0,false])-1;attachNode(b,p)}const parallel=drawing.e.some(([a,c])=>(a===g.i&&c===b)||(a===b&&c===g.i));const edge=[g.i,b,0,0];if(parallel)setCurve(drawing,edge,2);drawing.e.push(edge);selected={type:'e',i:drawing.e.length-1}}else{drawing=g.before;selected=null}
  }
  if(g.type==='move'&&!(g.indices?.length>1)&&(g.created||Math.hypot(...point(ev).map((v,i)=>v-g.start[i]))>2))attachNode(g.i,g.created?point(ev):drawing.n[g.i]);
  if(JSON.stringify(drawing)!==JSON.stringify(g.before)){history.push(g.before);if(history.length>80)history.shift();future=[]}
  gesture=null;canvas.classList.remove('dragging');if(canvas.hasPointerCapture(ev.pointerId))canvas.releasePointerCapture(ev.pointerId);finish();
};
canvas.onpointercancel=cancelGesture;canvas.onlostpointercapture=cancelGesture;window.addEventListener('blur',cancelGesture);
$('undo').onclick=()=>{cancelGesture();if(history.length){future.push(structuredClone(drawing));drawing=history.pop();selected=null;librarySource=null;finish()}};
$('redo').onclick=()=>{cancelGesture();if(future.length){history.push(structuredClone(drawing));drawing=future.pop();selected=null;librarySource=null;finish()}};
$('delete').onclick=removeSelection;
for(const shape of ['circle','square'])$('shape-'+shape).onclick=()=>{const ids=selectedShapes();if(!ids.length)return;remember();ids.forEach(i=>drawing.n[i][4]=shape);finish()};
$('zoom-out').onclick=()=>zoom(1.5);$('zoom-in').onclick=()=>zoom(1/1.5);$('zoom-fit').onclick=()=>{cancelGesture();fitView()};
let curveEditing=false;
function changeCurve(value){const edges=selectedEdges();if(!edges.length)return;if(!curveEditing)remember();edges.forEach(i=>setCurve(drawing,drawing.e[i],value));finish()}
$('curve').oninput=()=>{changeCurve(Number($('curve').value));curveEditing=true};
$('curve').onchange=$('curve').onblur=()=>{curveEditing=false};
$('straighten').onclick=()=>{curveEditing=false;changeCurve(0)};
$('blank').onclick=()=>load(symbol('Untitled',[],[]));
// RANDOM SYMBOL: 4–20 shapes, ten-stop style ranges, and a connected tree plus occasional extra lines.
function randomSymbol(random=Math.random){
  const pick=values=>values[Math.floor(random()*values.length)],count=4+Math.floor(random()*17),d=symbol('Random symbol',[],[]);
  d.r=pick(scales.radius.levels);d.w=pick(scales.weight.levels);d.textureStrength=pick(scales.texture.levels);d.distortionScale=pick(scales.distortion.levels);d.texture=d.textureStrength>0;
  const spacing=Math.ceil((d.r*2+32)/32)*32,positions=[];
  for(let x=0;x<7;x++)for(let y=0;y<5;y++)positions.push([64+x*spacing,64+y*spacing]);
  while(d.n.length<count){const [x,y]=positions.splice(Math.floor(random()*positions.length),1)[0];d.n.push([x,y,0,random()<.3,random()<.35?'square':'circle',random()<.3])}
  const connect=(a,b)=>{const e=[a,b,0,0,random()<.35];setCurve(d,e,Math.floor(random()*5)-2);d.e.push(e)};
  for(let i=1;i<count;i++){let nearest=0;for(let j=1;j<i;j++)if(Math.hypot(d.n[j][0]-d.n[i][0],d.n[j][1]-d.n[i][1])<Math.hypot(d.n[nearest][0]-d.n[i][0],d.n[nearest][1]-d.n[i][1]))nearest=j;connect(nearest,i)}
  for(let i=0;i<Math.floor(count/4);i++){const a=Math.floor(random()*count),b=Math.floor(random()*count);if(a!==b&&!d.e.some(e=>(e[0]===a&&e[1]===b)||(e[0]===b&&e[1]===a)))connect(Math.min(a,b),Math.max(a,b))}
  return d;
}
$('randomize').onclick=()=>{load(randomSymbol());tool('move')};
// Library actions update the selected saved entry; Save variation below creates a separate copy.
function saveLibrary(items,key){localStorage.setItem(key==='seeds'?'mg-sketchbook-v1':'mg-variations-v1',JSON.stringify(items))}
$('update-entry').onclick=()=>{if(!librarySource)return;const {key,index}=librarySource,items=key==='seeds'?presets:variations,next=items.slice();next[index]=structuredClone(drawing);next[index].name=next[index].name.trim()||'Untitled';try{saveLibrary(next,key);items.splice(0,items.length,...next);archives();$('status').textContent='Saved edits to '+next[index].name+'.'}catch{$('status').textContent='Could not save edits. Export JSON to keep a copy.'}};
$('delete-entry').onclick=()=>{if(!librarySource)return;const {key,index}=librarySource,items=key==='seeds'?presets:variations,next=items.filter((d,i)=>i!==index);try{saveLibrary(next,key);items.splice(0,items.length,...next);librarySource=null;render();archives();$('status').textContent='Library entry deleted. The drawing is still open.'}catch{$('status').textContent='Could not delete the saved entry.'}};
$('grid').onclick=()=>{const button=$('grid');button.checked=!button.checked;button.setAttribute('aria-pressed',String(button.checked));render()};
$('grid-toggle').onclick=()=>{gridVisible=!gridVisible;const button=$('grid-toggle');button.setAttribute('aria-pressed',String(gridVisible));render()};
for(const [id,{key,levels}] of Object.entries(scales)){
  const slider=$(id);
  let editing=false;
  slider.oninput=()=>{
    const next=levels[Number(slider.value)];
    if(drawing[key]===next)return;
    if(!editing)remember();
    editing=true;
    drawing[key]=next;
    if(id==='texture')drawing.texture=next>0;
    navigator.vibrate?.(8);
    render();
    persist();
  };
  slider.onchange=slider.onblur=()=>{editing=false};
}
$('filled').onchange=()=>{
  const ids=selectedShapes();if(!ids.length)return;remember();
  ids.forEach(i=>drawing.n[i][3]=$('filled').checked);
  render();
  persist();
};
$('dotted').onchange=()=>{const ids=selectedShapes(),edges=selectedEdges();if(!edges.length&&!ids.length)return;remember();const dotted=$('dotted').checked;edges.forEach(i=>drawing.e[i][4]=dotted);ids.forEach(i=>drawing.n[i][5]=dotted);finish()};
title.oninput=()=>{drawing.name=title.value;persist()};
$('save').onclick=()=>{let copy=structuredClone(drawing);copy.name=copy.name.trim()||'Untitled';let base=copy.name,i=2;while(variations.some(v=>v.name===copy.name)||presets.some(v=>v.name===copy.name))copy.name=base+' · '+i++;try{localStorage.setItem('mg-variations-v1',JSON.stringify([...variations,copy]));variations.push(copy);load(copy,{key:'saved',index:variations.length-1});$('status').textContent='Variation saved on this device.'}catch{$('status').textContent='Storage full. Export JSON to keep this variation.'}};
// EXPORTS: JSON preserves editable state; SVG contains the complete warped vector artwork.
function download(ext,data,type){let a=document.createElement('a'),url=URL.createObjectURL(new Blob([data],{type}));a.href=url;a.download=(drawing.name||'symbol')+'.'+ext;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
$('json').onclick=()=>download('json',JSON.stringify(drawing,null,2),'application/json');
$('export').onclick=()=>{const b=bounds(drawing);download('svg',`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x} ${b.y} ${b.w} ${b.h}" color="#141414">`+art(drawing)+'</svg>','image/svg+xml')};
// PNG export: render the complete symbol centered on a clean paper-colored background.
$('png').onclick=async()=>{
  const b=bounds(drawing),padding=Math.max(32,drawing.r+drawing.w+24),size=1200,scale=Math.min((size-padding*2)/b.w,(size-padding*2)/b.h),svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" color="#141414"><rect width="${size}" height="${size}" fill="#FFFEF8"/><g transform="translate(${size/2-(b.x+b.w/2)*scale} ${size/2-(b.y+b.h/2)*scale}) scale(${scale})">${art(drawing)}</g></svg>`,url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})),image=new Image();
  try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url});const c=document.createElement('canvas');c.width=c.height=size;c.getContext('2d').drawImage(image,0,0);const a=document.createElement('a');a.href=c.toDataURL('image/png');a.download=(drawing.name||'symbol')+'.png';a.click()}catch{$('status').textContent='Could not render PNG.'}finally{URL.revokeObjectURL(url)}
};
title.value=drawing.name;tool('move');fitView();archives();
new ResizeObserver(()=>render()).observe(canvas);
// Connected 2D motion: only preview coordinates move. See motion.js for orbit/spring tuning.
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
motionRuntime={owner:null,state:null,nodeRefs:[],topology:'',time:0,last:0,visible:true,pointer:null,layer:null};
function ensureMotionState(){
  const m=motionRuntime,topology=drawing.e.map(e=>e[0]+':'+e[1]).join(',');
  if(m.owner!==drawing||m.topology!==topology||m.nodeRefs.length!==drawing.n.length||m.nodeRefs.some((n,i)=>n!==drawing.n[i])){
    m.owner=drawing;m.topology=topology;m.nodeRefs=drawing.n.slice();m.state=SymbolMotion.create(drawing);
  }
  return m.state;
}
function motionSources(){
  if(!gesture)return [];
  if(gesture.type==='move')return gesture.indices||[gesture.i];
  if(gesture.type==='bend')return drawing.e[gesture.i]?.slice(0,2)||[];
  if(gesture.type==='grow')return [gesture.i];
  return [];
}
function paintCanvasMotion(){
  const m=motionRuntime,layer=canvas.querySelector('#canvas-art');if(!m||!layer)return;
  const state=ensureMotionState(),d=reducedMotion.matches?drawing:SymbolMotion.snapshot(drawing,state);
  if(m.layer!==layer){m.layer=layer;m.elements={
    edges:[...layer.querySelectorAll('[data-ink-edge]')],nodes:[...layer.querySelectorAll('[data-ink-node]')],
    edgeGroups:[...layer.querySelectorAll('[data-edge-group]')],nodeGroups:[...layer.querySelectorAll('[data-node-group]')],
    selections:[...layer.querySelectorAll('[data-selection-node]')],lines:[...layer.querySelectorAll('[data-selection-edge]')],handle:layer.querySelector('[data-handle]')};
  }
  const parts=m.elements,paths=d.e.map(e=>inkPath(d,e));
  for(const el of parts.edges)el.setAttribute('d',paths[+el.dataset.inkEdge]);
  for(const group of parts.edgeGroups){const i=+group.dataset.edgeGroup;group.querySelector('[data-e]').setAttribute('d',paths[i]);
    if(group.matches(':hover')){const g=curveGeometry(d,d.e[i]);group.querySelectorAll('.hover-outline').forEach((el,k)=>el.setAttribute('d',offsetCurve(g,(k?1:-1)*(d.w/2+4*view.w/640))))}
  }
  for(const el of parts.nodes){const n=d.n[+el.dataset.inkNode];
    if(el.tagName==='path')el.setAttribute('d',warpedNodePath(d,n));
    else if(el.tagName==='rect'){el.setAttribute('x',n[0]-d.r);el.setAttribute('y',n[1]-d.r)}
    else{el.setAttribute('cx',n[0]);el.setAttribute('cy',n[1])}
  }
  // Move hit regions and selection outlines with their actual nodes, never as one global group.
  for(const group of parts.nodeGroups){const i=+group.dataset.nodeGroup;group.setAttribute('transform',`translate(${d.n[i][0]-drawing.n[i][0]} ${d.n[i][1]-drawing.n[i][1]})`)}
  for(const el of parts.selections){const i=+el.dataset.selectionNode;el.setAttribute('transform',`translate(${d.n[i][0]-drawing.n[i][0]} ${d.n[i][1]-drawing.n[i][1]})`)}
  for(const el of parts.lines){const i=+el.dataset.selectionEdge;el.setAttribute('d',offsetCurve(curveGeometry(d,d.e[i]),Number(el.dataset.side)*(d.w/2+4*view.w/640)))}
  if(parts.handle){const i=+parts.handle.dataset.handle,p=warpPoint(d,curvePoint(curveGeometry(d,d.e[i]),.5));parts.handle.setAttribute('cx',p[0]);parts.handle.setAttribute('cy',p[1])}
}
canvas.addEventListener('pointerdown',ev=>{motionRuntime.pointer=[ev.clientX,ev.clientY]},{passive:true});
canvas.addEventListener('pointermove',ev=>{
  const m=motionRuntime,sources=motionSources(),last=m.pointer;m.pointer=[ev.clientX,ev.clientY];
  if(!canvasMotionEnabled||!sources.length||!last||reducedMotion.matches)return;
  const scale=view.w/Math.max(1,canvas.clientWidth);
  SymbolMotion.tug(ensureMotionState(),sources,(ev.clientX-last[0])*scale,(ev.clientY-last[1])*scale,scale);
},{passive:true});
for(const type of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(type,()=>{motionRuntime.pointer=null},{passive:true});
reducedMotion.addEventListener('change',()=>{motionRuntime.owner=null;paintCanvasMotion()});
new IntersectionObserver(([entry])=>{motionRuntime.visible=entry.isIntersecting}).observe(canvas);
function animateCanvas(time){
  requestAnimationFrame(animateCanvas);const m=motionRuntime;
  if(document.hidden||!m.visible||document.querySelector('dialog[open]')||reducedMotion.matches){m.last=time;return}
  if(time-m.last<1000/30)return;
  const dt=m.last?Math.min((time-m.last)/1000,.05):1/30;m.last=time;m.time+=dt;
  SymbolMotion.step(ensureMotionState(),dt,m.time,motionSources(),view.w/Math.max(1,canvas.clientWidth));paintCanvasMotion();
}
if(canvasMotionEnabled)requestAnimationFrame(animateCanvas);
// Let a cross-origin host resize its iframe without inspecting this document.
if(embedded&&window.parent!==window){
  let lastHeight=0;
  const notifyHost=()=>{const height=Math.ceil(document.documentElement.scrollHeight);if(height!==lastHeight){lastHeight=height;window.parent.postMessage({type:'symbol-studio:resize',height},'*')}};
  new ResizeObserver(notifyHost).observe(document.body);window.addEventListener('load',notifyHost,{once:true});notifyHost();
}
// Portfolio-style cursor. The overlay never participates in hit testing.
const cursor=document.createElement('div');cursor.className='site-cursor';cursor.setAttribute('aria-hidden','true');document.body.append(cursor);
const finePointer=matchMedia('(hover:hover) and (pointer:fine)');
function hideCursor(){cursor.classList.remove('visible','pressed');document.body.classList.remove('custom-cursor')}
document.addEventListener('pointermove',ev=>{
  if(!finePointer.matches||ev.pointerType==='touch'){hideCursor();return}
  const layer=document.querySelector('dialog[open]')||document.body;if(cursor.parentElement!==layer)layer.append(cursor);
  cursor.style.left=ev.clientX+'px';cursor.style.top=ev.clientY+'px';
  cursor.classList.toggle('hover',Boolean(ev.target.closest('button:not(:disabled),a,summary,input:not(:disabled),label:has(input:not(:disabled)),[data-n],[data-e]')));
  cursor.classList.add('visible');document.body.classList.add('custom-cursor');
},{passive:true});
document.addEventListener('pointerdown',()=>cursor.classList.add('pressed'),{passive:true});
document.addEventListener('pointerup',()=>cursor.classList.remove('pressed'),{passive:true});
document.addEventListener('pointercancel',hideCursor);document.documentElement.addEventListener('pointerleave',hideCursor);window.addEventListener('blur',hideCursor);finePointer.addEventListener('change',hideCursor);
// KEYBOARD SHORTCUTS: change key mappings here and the help text in index.html together.
document.addEventListener('keydown',ev=>{
  if(document.querySelector('dialog[open]'))return;
  if(ev.target.closest?.('input,textarea,select,[contenteditable="true"]'))return;
  const key=ev.key.toLowerCase(),mod=ev.ctrlKey||ev.metaKey;
  if(key==='escape'){ev.preventDefault();cancelGesture();selected=null;tool('move');render();return}
  if(gesture)return;
  if(mod&&key==='a'){ev.preventDefault();selectNodes(drawing.n.map((n,i)=>i),drawing.e.map((e,i)=>i));render();return}
  if(mod&&key==='z'){ev.preventDefault();$(ev.shiftKey?'redo':'undo').click();return}
  if(mod&&key==='s'){ev.preventDefault();return}
  if(mod&&key==='y'){ev.preventDefault();$('redo').click();return}
  if(mod||ev.altKey)return;
  const tools={v:'move',o:'dot',c:'grow',b:'bend',e:'erase'};
  if(tools[key]){ev.preventDefault();tool(tools[key])}
  if(key==='f'&&!$('filled').disabled){ev.preventDefault();$('filled').click()}
  if(key==='d'&&!$('dotted').disabled){ev.preventDefault();$('dotted').click()}
  if(key==='g'){ev.preventDefault();$('grid-toggle').click()}
  if(key==='s'){ev.preventDefault();$('grid').click()}
  if(key==='delete'||key==='backspace'){ev.preventDefault();removeSelection()}
  if(key.startsWith('arrow')&&selected?.type==='multi'){ev.preventDefault();remember();const step=$('grid').checked?32:ev.shiftKey?10:1;movableNodes().forEach(i=>{drawing.n[i][0]+=key==='arrowright'?step:key==='arrowleft'?-step:0;drawing.n[i][1]+=key==='arrowdown'?step:key==='arrowup'?-step:0});finish();return}
  if(key.startsWith('arrow')&&selected?.type==='n'){
    ev.preventDefault();remember();const n=drawing.n[selected.i],step=$('grid').checked?32:ev.shiftKey?10:1;
    const levels=drawing.e.map(e=>curveLevel(drawing,e));
    const p=placement([n[0]+(key==='arrowright'?step:key==='arrowleft'?-step:0),n[1]+(key==='arrowdown'?step:key==='arrowup'?-step:0)]);
    n.splice(0,2,...p);
    drawing.e.forEach((e,i)=>{if(e[0]===selected.i||e[1]===selected.i)setCurve(drawing,e,levels[i])});attachNode(selected.i);finish();
  }
});
