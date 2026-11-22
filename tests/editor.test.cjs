const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function editor(code){
  const elements=new Map();
  const document={getElementById(id){if(!elements.has(id))elements.set(id,{checked:id==='grid',value:0});return elements.get(id)},querySelector(){return {}}};
  const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/editor.js'),'utf8').split('title.value=drawing.name;tool(\'move\');fitView();archives();')[0];
  const storage=new Map();
  const localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)};
  vm.runInNewContext(source+'\n'+code,{document,localStorage,window:{addEventListener(){}},structuredClone,assert});
}

test('inserting a shape splits a connection and remains connected after moving',()=>editor(`
  drawing=symbol('Test',[[64,192],[448,192],[256,192]],[[0,1,0,0]]);
  assert.equal(attachNode(2),true);
  assert.equal(drawing.e.length,2);
  assert.ok(drawing.e.every(e=>e[0]===2||e[1]===2));
  drawing.n[2][1]=224;
  assert.ok(path(drawing,drawing.e[0]).includes('Q'));
  assert.equal(attachNode(2),false);
`));

test('curved line attachment creates two valid segments',()=>editor(`
  drawing=symbol('Curve',[[64,192],[448,192]],[[0,1,0,-96]]);
  drawing.n.push([256,96]);
  assert.equal(attachNode(2),true);
  assert.equal(drawing.e.length,2);
  assert.ok(drawing.e.every(e=>!path(drawing,e).includes('NaN')));
`));

test('square connections meet axis-aligned boundaries and retain individual fills',()=>editor(`
  drawing=symbol('Square',[[64,192,0,false],[256,192,0,true,'square']],[[0,1,0,0]]);
  assert.ok(path(drawing,drawing.e[0]).endsWith('240,192'));
  const svg=art(drawing);
  assert.ok(svg.includes(' Z"'));
  assert.ok(svg.includes('fill="currentColor"'));
  assert.ok(!svg.includes('rotate('));
  assert.equal(drawing.n[0][3],false);
`));

test('expanded canvas positions and export bounds are not clipped to the original canvas',()=>editor(`
  drawing=symbol('Large',[[-640,-480],[1600,960]],[[0,1,0,0]]);
  assert.equal(placement([1600,-480])[0],1600);
  assert.equal(placement([1600,-480])[1],-480);
  const b=bounds(drawing);
  assert.ok(b.x<-640&&b.y<-480&&b.x+b.w>1600&&b.y+b.h>960);
`));

test('junctions remain interactive without visible marks and editable elements have hover outlines',()=>editor(`
  drawing=symbol('Junction',[[64,192],[256,192,1],[448,192]],[[0,1,0,0],[1,2,0,0]]);
  const markup=art(drawing,true);
  assert.ok(markup.includes('data-n="1"'));
  assert.ok(markup.includes('class="hover-outline"'));
  assert.ok(!markup.includes('r="2.5"'));
  drawing.texture=false;
  assert.equal((art(drawing).match(/<circle/g)||[]).length,2);
`));

test('curve handle follows the rim-trimmed curve and hover guides keep a constant offset',()=>editor(`
  drawing=symbol('Curve',[[64,192,0,false,'square'],[448,192]],[[0,1,0,-96]]);
  const g=curveGeometry(drawing,drawing.e[0]);
  const handle=curvePoint(g,.5);
  assert.equal(handle[0],(g.a[0]+2*g.c[0]+g.b[0])/4);
  assert.equal(handle[1],(g.a[1]+2*g.c[1]+g.b[1])/4);
  for(const distance of [-7,7]){
    const points=offsetCurve(g,distance).slice(1).split(' L').map(p=>p.split(',').map(Number));
    points.forEach((p,i)=>{
      const base=curvePoint(g,i/96);
      assert.ok(Math.abs(Math.hypot(p[0]-base[0],p[1]-base[1])-7)<1e-9);
    });
  }
`));

test('bulk fill and shape changes affect only the selected visible shapes',()=>editor(`
  finish=()=>{};render=()=>{};persist=()=>{};
  drawing=symbol('Group',[[64,64,0,false],[128,64,0,false],[192,64,0,false],[256,64,1,false]],[]);
  selectNodes([0,1,3]);
  $('shape-square').onclick();
  assert.equal(drawing.n[0][4],'square');assert.equal(drawing.n[1][4],'square');
  assert.equal(drawing.n[2][4],undefined);assert.equal(drawing.n[3][4],undefined);
  $('filled').checked=true;$('filled').onchange();
  assert.equal(drawing.n[0][3],true);assert.equal(drawing.n[1][3],true);
  assert.equal(drawing.n[2][3],false);assert.equal(drawing.n[3][3],false);
  assert.equal(history.length,2);
`));

test('bulk deletion remaps surviving edge endpoints',()=>editor(`
  finish=()=>{};
  drawing=symbol('Group',[[64,64],[128,64],[192,64],[256,64]],[[0,1,0,0],[2,3,0,0]]);
  selectNodes([0,1]);removeSelection();
  assert.equal(drawing.n.length,2);assert.equal(drawing.e.length,1);
  assert.equal(drawing.e[0][0],0);assert.equal(drawing.e[0][1],1);
`));

test('random symbols are connected, on-grid, and editable even with repeated random values',()=>editor(`
  for(const r of [0,.25,.5,.99]){
    const d=randomSymbol(()=>r);
    assert.ok(d.n.length>=4&&d.n.length<=20);assert.ok(d.e.length>=d.n.length-1);
    assert.equal(new Set(d.n.map(n=>n.slice(0,2).join(','))).size,d.n.length);
    assert.ok(d.n.every(n=>n[0]%32===0&&n[1]%32===0));
    assert.ok(d.e.every(e=>e[0]<e[1]&&!path(d,e).includes('NaN')));
  }
`));

test('mixed bulk selection dots lines and outlines, bends lines, and deletes cleanly',()=>editor(`
  finish=()=>{};
  drawing=symbol('Mixed',[[64,192],[256,192],[448,192],[448,320]],[[0,1,0,0],[1,2,0,0],[2,3,0,0]]);
  selectNodes([0],[1,2]);
  assert.equal(selectedNodes().length,1);assert.equal(selectedEdges().length,2);
  $('dotted').checked=true;$('dotted').onchange();
  assert.equal(drawing.n[0][5],true);assert.equal(drawing.n[1][5],undefined);
  assert.equal(drawing.e[0][4],undefined);assert.ok(drawing.e.slice(1).every(e=>e[4]));
  changeCurve(2);assert.ok(selectedEdges().every(i=>curveLevel(drawing,drawing.e[i])===2));
  assert.equal(movableNodes().length,4);
  removeSelection();assert.equal(drawing.n.length,3);assert.equal(drawing.e.length,0);
`));

test('randomizer varies all style properties and produces larger groups',()=>editor(`
  const results=[0,.25,.5,.75,.99].map(r=>randomSymbol(()=>r));
  assert.ok(results.some(d=>d.n.length===20));
  for(const key of ['r','w','textureStrength','distortionScale'])assert.ok(new Set(results.map(d=>d[key])).size>1);
  assert.ok(results.some(d=>d.n.some(n=>n[5])&&d.e.some(e=>e[4])));
  assert.ok(results.some(d=>d.n.every(n=>!n[5])&&d.e.every(e=>!e[4])));
`));

test('Fit control and centered PNG export are present',()=>editor(`
  assert.ok($('zoom-fit'));
  assert.ok($('png'));
  const b=bounds(drawing),size=1200,padding=Math.max(32,drawing.r+drawing.w+24),scale=Math.min((size-padding*2)/b.w,(size-padding*2)/b.h);
  assert.ok(Number.isFinite(size/2-(b.x+b.w/2)*scale));
  assert.ok(Number.isFinite(size/2-(b.y+b.h/2)*scale));
`));

test('library edits persist to the selected collection without creating duplicate entries',()=>editor(`
  render=()=>{};archives=()=>{};
  for(const key of ['seeds','saved']){
    const items=key==='seeds'?presets:variations;
    if(!items.length)items.push(symbol('Original',[[64,64]],[]));
    const length=items.length;librarySource={key,index:0};
    drawing=symbol('Renamed',[[128,128,0,true,'square']],[]);
    $('update-entry').onclick();
    assert.equal(items.length,length);assert.equal(items[0].name,'Renamed');
    const saved=JSON.parse(localStorage.getItem(key==='seeds'?'mg-sketchbook-v1':'mg-variations-v1'));
    assert.equal(saved[0].n[0][4],'square');
    $('delete-entry').onclick();assert.equal(items.length,length-1);assert.equal(librarySource,null);
    assert.equal(drawing.name,'Renamed');
  }
`));

test('soft warp uses smooth vector paths with constant stroke width and gradual amplitude',()=>editor(`
  const d=symbol('Graphite',[[64,192],[448,192]],[[0,1,0,-96]]);
  const before=JSON.stringify(d),textured=art(d);
  assert.ok(textured.includes(' C'));
  assert.ok(!textured.includes('<filter'));
  assert.ok(!textured.includes('opacity'));
  assert.ok([...textured.matchAll(/stroke-width="([^"]+)"/g)].every(m=>Number(m[1])===d.w));
  assert.equal(JSON.stringify(d),before);
  d.texture=false;const clean=art(d);
  assert.ok(!clean.includes('feTurbulence'));
  assert.notEqual(textured.match(/ d="([^"]+)"/)[1],clean.match(/ d="([^"]+)"/)[1]);
  d.texture=true;d.textureStrength=5;
  assert.equal(warpAmount(d),.8);
  let previous=0;for(const level of scales.texture.levels){d.textureStrength=level;const amount=warpAmount(d);assert.ok(amount>=previous&&amount<=6.4);previous=amount;
    for(let x=0;x<500;x+=13){const p=warpPoint(d,[x,192]);assert.ok(Math.abs(p[0]-x)<=amount+1e-10&&Math.abs(p[1]-192)<=amount+1e-10)}
  }
  d.textureStrength=0;assert.equal(inkPath(d,d.e[0]),path(d,d.e[0]));
`));

test('all Edit sliders have ten stops and distortion scale changes frequency independently of amount',()=>editor(`
  for(const scale of Object.values(scales))assert.equal(scale.levels.length,10);
  const d=symbol('Scale',[[64,192],[448,192]],[[0,1,0,0]]);
  d.textureStrength=8;d.distortionScale=.2;
  const amount=warpAmount(d),fine=inkPath(d,d.e[0]);
  d.distortionScale=8;
  assert.equal(warpAmount(d),amount);
  assert.notEqual(inkPath(d,d.e[0]),fine);
  assert.equal(warpScale(d),8);
  d.textureStrength=0;
  assert.equal(inkPath(d,d.e[0]),path(d,d.e[0]));
  assert.equal(scales.radius.levels.at(-1)*2,192);
  assert.equal(scales.weight.levels.at(-1),16);
`));

test('dotted curves and shape outlines follow distorted paths with weight-scaled round dots',()=>editor(`
  const d=symbol('Dots',[[64,192,0,false,'circle',true],[448,192,0,false,'square',true]],[[0,1,0,-96,true]]);
  d.w=4;d.textureStrength=8;d.distortionScale=.5;
  const svg=art(d);
  assert.equal((svg.match(/stroke-dasharray="0 10"/g)||[]).length,3);
  assert.equal((svg.match(/stroke-linecap="round"/g)||[]).length,3);
  assert.ok(svg.includes('d="'+inkPath(d,d.e[0])+'"'));
  d.w=2;assert.ok(art(d).includes('stroke-dasharray="0 5"'));
`));

test('dotted style survives splitting and deletion of unrelated nodes',()=>editor(`
  finish=()=>{};
  drawing=symbol('Dots',[[32,32],[64,192],[448,192],[256,192]],[[1,2,0,0,true]]);
  assert.equal(attachNode(3),true);
  assert.ok(drawing.e.every(e=>e[4]===true));
  selectNodes([0]);removeSelection();
  assert.equal(drawing.e.length,2);assert.ok(drawing.e.every(e=>e[4]===true));
`));

test('dotted toggle updates a curve or multiple shapes and supports undo snapshots',()=>editor(`
  finish=()=>{};
  drawing=symbol('Dots',[[64,192,0,false],[448,192,0,false]],[[0,1,0,0]]);
  selected={type:'e',i:0};$('dotted').checked=true;$('dotted').onchange();
  assert.equal(drawing.e[0][4],true);assert.equal(history.at(-1).e[0][4],undefined);
  selectNodes([0,1]);$('dotted').onchange();assert.ok(drawing.n.every(n=>n[5]));
  $('dotted').checked=false;$('dotted').onchange();assert.ok(drawing.n.every(n=>!n[5]));
  assert.equal(drawing.e[0][4],true);
`));
