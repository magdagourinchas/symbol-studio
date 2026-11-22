const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../dist/motion.js'),'utf8');
const motion=vm.runInNewContext(source+'\nSymbolMotion');
const drawing=()=>({n:[[0,0],[100,0],[200,0],[1,1],[2,2]],e:[[0,1,0,0],[1,2,0,0],[3,4,0,0]],r:16,w:3});

test('tugs travel through connections, never to nearby disconnected nodes',()=>{
  const state=motion.create(drawing());
  assert.deepEqual(Array.from(motion.distances(state,[0])),[0,1,2,Infinity,Infinity]);
  motion.tug(state,[0],12,0);
  motion.step(state,.04,.04,[0]);assert.equal(state.nodes[1].x,0);
  motion.step(state,.04,.08,[0]);assert.ok(state.nodes[1].x>0);assert.equal(state.nodes[2].x,0);
  motion.step(state,.04,.12,[0]);assert.ok(state.nodes[2].x>0);
  for(const i of [0,3,4])assert.equal(state.nodes[i].x,0);
});

test('multi-selection remains pinned and neighbors receive a bounded, damped response',()=>{
  const state=motion.create(drawing());motion.tug(state,[0,1],1000,-500);
  for(let i=0;i<60;i++){motion.step(state,1/60,i/60,[0,1]);for(const n of state.nodes)assert.ok(Math.hypot(n.x,n.y)<=3.5+1e-9)}
  assert.equal(state.nodes[0].x,0);assert.equal(state.nodes[1].x,0);
  assert.ok(state.nodes[2].x>0);assert.equal(state.nodes[3].x,0);
  for(let i=60;i<600;i++)motion.step(state,1/60,i/60);
  assert.ok(Math.abs(state.nodes[2].x)<1e-8);
});

test('idle drift is independent per node, purely 2D, and never mutates saved geometry',()=>{
  const d=drawing(),original=JSON.stringify(d),state=motion.create(d);
  for(let i=0;i<120;i++)motion.step(state,1/60,i/60);
  const preview=motion.snapshot(d,state);
  assert.notEqual(preview.n[0][0],d.n[0][0]);
  assert.notEqual(preview.n[0][0]-d.n[0][0],preview.n[1][0]-d.n[1][0]);
  assert.equal(JSON.stringify(d),original);assert.equal(preview.e,d.e);
  assert.ok(state.nodes.every(n=>Math.abs(n.idleX)<=1.55&&Math.abs(n.idleY)<=1.15));
  assert.ok(preview.n.every(n=>n.length===2));
});

test('unconnected components retain identical idle motion during another component’s drag',()=>{
  const a=motion.create(drawing()),b=motion.create(drawing());motion.tug(a,[0],10,8);
  for(let i=0;i<180;i++){motion.step(a,1/60,i/60,[0]);motion.step(b,1/60,i/60,[0])}
  for(const i of [3,4])assert.deepEqual(JSON.parse(JSON.stringify(a.nodes[i])),JSON.parse(JSON.stringify(b.nodes[i])));
});
