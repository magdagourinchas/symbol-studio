'use strict';
// INSTAGRAM DEMO: composition, preview crops, JPEG download, and local-only publishing.
(() => {
  const dialog=$('post-dialog'),preview=$('post-canvas'),ctx=preview.getContext('2d');
  let post=null,request=0;
  function wrap(text,width){
    const lines=[];let line='';
    for(const word of text.trim().split(/\s+/)){
      if(line&&ctx.measureText(line+' '+word).width>width){lines.push(line);line=''}
      for(const char of word){if(ctx.measureText(line+char).width>width){lines.push(line);line=''}line+=char}
      line+=' ';
    }
    if(line.trim())lines.push(line.trim());return lines;
  }
  function artworkBounds(d){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.style.cssText='position:fixed;left:-10000px;top:0;visibility:hidden';
    svg.innerHTML='<g>'+art(d)+'</g>';document.body.append(svg);
    try{const b=svg.firstElementChild.getBBox(),pad=d.w/2+2;return {x:b.x-pad,y:b.y-pad,w:b.width+pad*2,h:b.height+pad*2}}
    finally{svg.remove()}
  }
  // POST DESIGN: 1080 × 1350 output; 760 × 660 artwork area centered at (540, 580).
  // Keep important content inside x=34..1046 and y=135..1215 for both preview crops.
  async function compose(d){
    await document.fonts.load('650 44px "Inter Tight"');
    await document.fonts.load('400 28px "Inter Tight"');
    const b=artworkBounds(d),scale=Math.min(760/b.w,660/b.h,3);
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350" color="#141414"><g transform="translate(${540-(b.x+b.w/2)*scale} ${580-(b.y+b.h/2)*scale}) scale(${scale})">${art(d)}</g></svg>`;
    const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
    const image=new Image();
    try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Could not render the symbol.'));image.src=url})}
    finally{URL.revokeObjectURL(url)}
    const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1350;
    const c=canvas.getContext('2d');c.fillStyle='#C0C0C0';c.fillRect(0,0,1080,1350);c.drawImage(image,0,0);
    // Typography: title starts at 44px, wraps within 840px, and shrinks for long names.
    const name=d.name.trim()||'Untitled';let size=44,lines;
    do{ctx.font=`650 ${size}px "Inter Tight"`;lines=wrap(name,840);if(lines.length<=3)break;size-=2}while(size>=20);
    c.fillStyle='#141414';c.font=`650 ${size}px "Inter Tight"`;c.textBaseline='alphabetic';
    // Footer placement: x=120 left inset; final title line at 1136, date baseline at 1180.
    const lastTitleBaseline=1136;
    lines.forEach((line,i)=>c.fillText(line.trim(),120,lastTitleBaseline-(lines.length-1-i)*(size+5)));
    // Local date formatted MM.DD.YY; change the order/separator here.
    const now=new Date(),date=[String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0'),String(now.getFullYear()).slice(-2)].join('.');
    c.font='400 28px "Inter Tight"';c.fillText(date,120,1180);
    return {canvas,name,date,createdAt:now.toISOString(),jpeg:canvas.toDataURL('image/jpeg',.95)};
  }
  $('instagram').onclick=async()=>{
    const id=++request,snapshot=structuredClone(drawing);post=null;
    $('post-publish').disabled=$('post-download').disabled=true;$('post-result').hidden=true;
    $('post-status').textContent='Preparing your post…';
    ctx.fillStyle='#C0C0C0';ctx.fillRect(0,0,1080,1350);
    $('post-portrait').removeAttribute('src');$('post-square').removeAttribute('src');dialog.showModal();
    if(!snapshot.n.some(n=>!n[2])){$('post-status').textContent='Add a circle or square to your drawing first.';return}
    try{
      const result=await compose(snapshot);if(id!==request||!dialog.open)return;
      post=result;ctx.drawImage(post.canvas,0,0);$('post-portrait').src=$('post-square').src=post.jpeg;
      $('post-publish').disabled=$('post-download').disabled=false;
      $('post-status').textContent='Ready · 1080 × 1350 JPEG. Both crop previews keep the title and date visible.';
    }catch(error){if(id===request)$('post-status').textContent=error.message}
  };
  $('post-close').onclick=()=>dialog.close();
  $('post-download').onclick=()=>{
    if(!post)return;const a=document.createElement('a');a.href=post.jpeg;
    a.download=(post.name.replace(/[<>:"/\\|?*]/g,'-')||'symbol')+'-instagram.jpg';a.click();
  };
  // DEMO ONLY: replace this local save with a backend publishing call for live Instagram posting.
  // Account tokens belong on that backend, never in this browser file.
  $('post-publish').onclick=()=>{
    if(!post)return;
    try{
      localStorage.setItem('mg-instagram-demo-v1',JSON.stringify({name:post.name,date:post.date,createdAt:post.createdAt,image:post.jpeg}));
      $('post-result-title').textContent=post.name+' · '+post.date;$('post-result').hidden=false;
      $('post-status').textContent='Demo published locally. Nothing was sent to Instagram.';$('post-publish').disabled=true;
    }catch{$('post-status').textContent='Browser storage is full. Download the JPEG to keep your post.'}
  };
})();
