'use strict';
// Pure 2D preview motion. Coordinates in the saved drawing are never changed.
// Inspired by Through Time's slow satellite orbits and 38/11 return spring.
const SymbolMotion=(() => {
  function create(d){
    const neighbors=d.n.map(()=>new Set());
    for(const [a,b] of d.e){neighbors[a].add(b);neighbors[b].add(a)}
    return {neighbors,nodes:d.n.map(()=>({x:0,y:0,vx:0,vy:0,idleX:0,idleY:0})),pending:[]};
  }
  // Breadth-first traversal: only actual connections carry an impulse.
  function distances(state,sources){
    const result=state.nodes.map(()=>Infinity),queue=[];
    for(const i of new Set(sources))if(state.nodes[i]){result[i]=0;queue.push(i)}
    for(let k=0;k<queue.length;k++){const i=queue[k];for(const j of state.neighbors[i])if(result[j]===Infinity){result[j]=result[i]+1;queue.push(j)}}
    return result;
  }
  function tug(state,sources,dx,dy,unitsPerPixel=1){
    const length=Math.hypot(dx,dy),limit=16*unitsPerPixel,factor=length>limit?limit/length:1;
    distances(state,sources).forEach((hops,i)=>{
      if(!Number.isFinite(hops)||hops===0)return;
      const gain=2.6*Math.pow(.48,hops-1);
      state.pending.push({i,delay:.055*hops,vx:dx*factor*gain,vy:dy*factor*gain});
    });
  }
  function step(state,dt,time,held=[],unitsPerPixel=1){
    dt=Math.min(Math.max(dt,0),.05);const pinned=new Set(held),keep=[];
    for(const impulse of state.pending){impulse.delay-=dt;if(impulse.delay>0){keep.push(impulse);continue}if(!pinned.has(impulse.i)){const n=state.nodes[impulse.i];n.vx+=impulse.vx;n.vy+=impulse.vy}}
    state.pending=keep;
    const steps=Math.max(1,Math.ceil(dt*120)),h=dt/steps;
    state.nodes.forEach((n,i)=>{
      if(pinned.has(i)){n.x=n.y=n.vx=n.vy=0}
      else for(let j=0;j<steps;j++){
        n.vx+=(-38*n.x-11*n.vx)*h;n.vy+=(-38*n.y-11*n.vy)*h;
        n.x+=n.vx*h;n.y+=n.vy*h;
        const length=Math.hypot(n.x,n.y),limit=3.5*unitsPerPixel;
        if(length>limit){n.x*=limit/length;n.y*=limit/length;n.vx*=.6;n.vy*=.6}
      }
      // Different phases give a loose constellation, not one rigid moving object.
      const phase=i*2.399963,amplitude=unitsPerPixel/(1+state.neighbors[i].size*.16);
      const targetX=pinned.has(i)?0:amplitude*(1.25*Math.sin(time*.26+phase)+.3*Math.sin(time*.11+phase*.7));
      const targetY=pinned.has(i)?0:amplitude*(.9*Math.cos(time*.21+phase)+.25*Math.sin(time*.13+phase*.4));
      const blend=1-Math.exp(-(pinned.has(i)?16:3)*dt);
      n.idleX+=(targetX-n.idleX)*blend;n.idleY+=(targetY-n.idleY)*blend;
    });
  }
  function snapshot(d,state){return {...d,n:d.n.map((n,i)=>{const s=state.nodes[i];return [n[0]+s.x+s.idleX,n[1]+s.y+s.idleY,...n.slice(2)]})}}
  return {create,distances,tug,step,snapshot};
})();
