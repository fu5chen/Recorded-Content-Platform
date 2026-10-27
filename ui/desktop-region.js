const box=document.querySelector('#box'),hint=document.querySelector('#hint');
let anchor=null,selection=null,targets=[],locked=false,dragged=false,hovered=null,lastPoint=null,altDown=false;
const help='悬停吸附窗口，单击选中 · 拖动自由框选 · Alt 取消吸附 · Esc 退出';
window.regionPicker.onTargets(data=>{targets=data.targets;hint.textContent=data.available?help:'窗口识别不可用 · 仍可拖动框选 · Esc 退出';});
function point(e){return{x:Math.max(0,Math.min(innerWidth,e.clientX)),y:Math.max(0,Math.min(innerHeight,e.clientY))};}
function paint(label=''){if(!selection){box.hidden=true;document.body.classList.remove('selected');return;}const r=selection;box.hidden=false;document.body.classList.add('selected');Object.assign(box.style,{left:r.x+'px',top:r.y+'px',width:r.w+'px',height:r.h+'px'});document.querySelector('#size').textContent=`${r.w} × ${r.h}${label?' · '+label:''}`;}
function hover(p){hovered=altDown?null:SnapGeometry.hit(p,targets);selection=hovered?{x:hovered.x,y:hovered.y,w:hovered.w,h:hovered.h}:null;document.querySelector('#actions').hidden=true;paint(hovered?.title||'');}
window.addEventListener('pointerdown',e=>{if(e.button!==0||e.target.closest?.('button'))return;anchor=point(e);lastPoint=anchor;altDown=e.altKey;hovered=altDown?null:SnapGeometry.hit(anchor,targets);dragged=false;locked=false;document.querySelector('#actions').hidden=true;});
window.addEventListener('pointermove',e=>{if(e.target.closest?.('button'))return;const b=point(e);lastPoint=b;altDown=e.altKey;if(!anchor){if(!locked)hover(b);return;}if(Math.hypot(b.x-anchor.x,b.y-anchor.y)>=4)dragged=true;if(dragged){selection=SnapGeometry.drag(anchor,b,targets,innerWidth,innerHeight,!altDown);paint(altDown?'自由选择':'边缘吸附');}});
window.addEventListener('pointerup',e=>{if(!anchor)return;if(!dragged){const target=e.altKey?null:SnapGeometry.hit(point(e),targets);selection=target?{x:target.x,y:target.y,w:target.w,h:target.h}:null;paint(target?.title||'');}anchor=null;if(selection?.w>=2&&selection?.h>=2){locked=true;document.querySelector('#actions').hidden=false;hint.textContent='已选定区域 · 确认或按 Enter · 重新拖动可重选 · Esc 取消';}});
function finishSelection(rect){window.regionPicker.finish(rect);}
document.querySelector('#confirm').onclick=()=>{if(selection?.w>=2&&selection?.h>=2)finishSelection(selection);};
document.querySelector('#cancel').onclick=()=>finishSelection(null);
window.addEventListener('keydown',e=>{if(e.key==='Escape')finishSelection(null);if(e.key==='Enter'&&selection?.w>=2&&selection?.h>=2)finishSelection(selection);if(e.key==='Alt'){e.preventDefault();altDown=true;if(anchor&&dragged&&lastPoint){selection=SnapGeometry.drag(anchor,lastPoint,targets,innerWidth,innerHeight,false);paint('自由选择');}else if(!locked&&lastPoint)hover(lastPoint);}});
window.addEventListener('keyup',e=>{if(e.key==='Alt'){altDown=false;if(anchor&&dragged&&lastPoint){selection=SnapGeometry.drag(anchor,lastPoint,targets,innerWidth,innerHeight,true);paint('边缘吸附');}else if(!locked&&lastPoint)hover(lastPoint);}});
window.addEventListener('contextmenu',e=>{e.preventDefault();finishSelection(null);});
