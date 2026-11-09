/* An original, code-drawn voxel study. Brand marks are used separately, unmodified. */
window.renderSpecimen = function(mode='solid') {
  const svg=document.getElementById('void-specimen');
  if(!svg)return;
  const project=(x,y,z)=>[310+(x-y)*24,318+(x+y)*12-z*25];
  const pts=arr=>arr.map(p=>p.map(n=>n.toFixed(1)).join(',')).join(' ');
  const polygon=(points,fill,stroke='#6a2525',opacity=1)=>`<polygon points="${pts(points)}" fill="${fill}" stroke="${stroke}" stroke-width=".75" opacity="${opacity}"/>`;
  const cube=(x,y,z,tint,wire=false)=>{
    const top=[project(x,y,z+1),project(x+1,y,z+1),project(x+1,y+1,z+1),project(x,y+1,z+1)];
    const left=[project(x,y+1,z+1),project(x+1,y+1,z+1),project(x+1,y+1,z),project(x,y+1,z)];
    const right=[project(x+1,y,z+1),project(x+1,y+1,z+1),project(x+1,y+1,z),project(x+1,y,z)];
    if(wire)return polygon(left,'#080404','#7b2528',.9)+polygon(right,'#080404','#7b2528',.9)+polygon(top,'#110706','#bd3a35',.95);
    const colors=tint==='hot'?['#ff3a32','#a91a1b','#6b1114']:tint==='bone'?['#ae8175','#62413c','#402724']:tint==='edge'?['#8b2827','#501516','#2c0d0e']:['#432424','#281313','#1b0c0d'];
    return polygon(left,colors[1])+polygon(right,colors[2])+polygon(top,colors[0]);
  };
  let floor='';
  for(let i=-7;i<=7;i++){
    const a=project(-7,i,-1),b=project(7,i,-1),c=project(i,-7,-1),d=project(i,7,-1);
    floor+=`<path d="M${a}L${b}M${c}L${d}" stroke="#3f1919" stroke-width=".55" opacity=".65"/>`;
  }
  let blocks=[];
  for(let x=-4;x<=3;x++)for(let y=-4;y<=3;y++){
    if(x>=-1&&x<=1&&y>=-1&&y<=1)continue;
    if((x===-4&&y>=2)||(y===3&&x>=2)||(x===3&&y<=-3))continue;
    const hash=Math.abs((x*71+y*47+x*y*13)%17);
    const h=2+(hash>10?1:0)+(x===-3&&y===-2?1:0);
    for(let z=0;z<h;z++){
      const inner=(x===-2&&y>=-1&&y<=1)||(y===-2&&x>=-1&&x<=1);
      const tint=z===h-1?(inner?'hot':hash>13?'bone':'edge'):'dark';
      blocks.push({x,y,z,tint,order:x+y+z*.001});
    }
  }
  // Detached pieces continue the grid without turning the illustration into a logo.
  blocks.push({x:4,y:2,z:2,tint:'hot',order:6},{x:-4,y:4,z:1,tint:'edge',order:0},{x:1,y:-5,z:4,tint:'bone',order:-4},{x:3,y:4,z:0,tint:'edge',order:7});
  blocks.sort((a,b)=>a.order-b.order||a.z-b.z);
  let shapes=blocks.map(b=>cube(b.x,b.y,b.z,b.tint,mode==='wire')).join('');
  svg.innerHTML=`<defs><radialGradient id="voidGlow"><stop offset="0" stop-color="#ff2a2a" stop-opacity=".13"/><stop offset="1" stop-color="#ff2a2a" stop-opacity="0"/></radialGradient><pattern id="scan" width="6" height="6" patternUnits="userSpaceOnUse"><path d="M0 1H6" stroke="#080404" stroke-opacity=".18" stroke-width="2"/></pattern></defs><ellipse cx="310" cy="340" rx="220" ry="115" fill="url(#voidGlow)"/>${floor}<path d="M310 166V456M42 318H578" stroke="#702024" stroke-dasharray="2 6" stroke-width=".7" opacity=".5"/>${shapes}<path d="M70 200h75l43 42M488 350h57v38" fill="none" stroke="#93534b" stroke-width=".7"/><circle cx="188" cy="242" r="2" fill="#ff2a2a"/><circle cx="488" cy="350" r="2" fill="#ff2a2a"/><g fill="#b3978e" font-size="8" font-family="JetBrains Mono,monospace" letter-spacing="1"><text x="70" y="186">THE SURFACE</text><text x="486" y="408">THE UNKNOWN</text><text x="264" y="492" fill="#855e57">X +  /  Z −</text></g><path d="M22 132v-13h13M584 132v-13h-13M22 485v13h13M584 485v13h-13" stroke="#73302b" fill="none"/><rect x="90" y="150" width="440" height="290" fill="url(#scan)" pointer-events="none"/>`;
};
