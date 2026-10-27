let captureRegion=null,regionDraft=null,regionBase=null,regionSource='',regionAnchor=null;
const geometry=window.CaptureGeometry;
function resetRegion(){captureRegion=null;$('#region-summary').textContent='当前区域：整个所选屏幕或窗口';}
function syncRegionMode(){const camera=$('#mode').value==='camera';$('#choose-region').disabled=camera;$('#reset-region').disabled=camera;$('#region-summary').textContent=camera?'摄像头模式使用完整摄像头画面':captureRegion?`当前区域：${captureRegion.rect.w} × ${captureRegion.rect.h}，位置 (${captureRegion.rect.x}, ${captureRegion.rect.y})`:'当前区域：整个所选屏幕或窗口';}
function drawRegion(){if(!regionBase||!regionDraft)return;const canvas=$('#region-canvas'),ctx=canvas.getContext('2d'),r=regionDraft;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(regionBase,0,0);ctx.fillStyle='#0009';ctx.fillRect(0,0,canvas.width,canvas.height);if(r.w>0&&r.h>0){ctx.drawImage(regionBase,r.x,r.y,r.w,r.h,r.x,r.y,r.w,r.h);ctx.strokeStyle='#9ca9ff';ctx.lineWidth=Math.max(2,canvas.width/450);ctx.strokeRect(r.x,r.y,r.w,r.h);}for(const key of ['x','y','w','h'])$('#region-'+key).value=r[key];$('#region-dimensions').textContent=`原始画面 ${canvas.width} × ${canvas.height} 像素 · 拖动重新选择，或输入精确数值`;}
$('#choose-region').onclick=guard(async()=>{
 if(recorder)throw Error('请先结束录制，再调整录制区域');
 const button=$('#choose-region');button.disabled=true;
 try{const result=await api['desktop-region']($('#source').value);if(!result)return;$('#source').value=result.source;if($('#source').value!==result.source){await sources();$('#source').value=result.source;}captureRegion=result;syncRegionMode();$('#quality').value='source';$('#custom-size').classList.add('hidden');toast('已选择录制区域，输出大小已设为区域原始大小');}finally{syncRegionMode();}
});
function regionPoint(e){const canvas=$('#region-canvas'),bounds=canvas.getBoundingClientRect();return {x:(e.clientX-bounds.left)*canvas.width/bounds.width,y:(e.clientY-bounds.top)*canvas.height/bounds.height};}
$('#region-canvas').addEventListener('pointerdown',e=>{if(e.button!==0)return;regionAnchor=regionPoint(e);e.target.setPointerCapture(e.pointerId);});
$('#region-canvas').addEventListener('pointermove',e=>{if(!regionAnchor)return;regionDraft=geometry.fromDrag(regionAnchor,regionPoint(e),regionBase.width,regionBase.height);drawRegion();});
$('#region-canvas').addEventListener('pointerup',e=>{if(!regionAnchor)return;regionDraft=geometry.fromDrag(regionAnchor,regionPoint(e),regionBase.width,regionBase.height);regionAnchor=null;drawRegion();});
$('#region-canvas').addEventListener('pointercancel',()=>{regionAnchor=null;});
for(const key of ['x','y','w','h'])$('#region-'+key).addEventListener('change',guard(()=>{const r=Object.fromEntries(['x','y','w','h'].map(k=>[k,Number($('#region-'+k).value)]));geometry.validateRect(r,regionBase.width,regionBase.height);regionDraft=r;drawRegion();}));
$('#region-apply').onclick=guard(()=>{const rect=Object.fromEntries(['x','y','w','h'].map(k=>[k,Number($('#region-'+k).value)]));geometry.validateRect(rect,regionBase.width,regionBase.height);captureRegion={rect,width:regionBase.width,height:regionBase.height,source:regionSource};syncRegionMode();$('#region-dialog').close();toast('录制区域已设置');});
$('#region-cancel').onclick=()=>$('#region-dialog').close();$('#region-dialog').addEventListener('close',()=>{regionAnchor=null;regionBase=null;});
$('#reset-region').onclick=resetRegion;$('#source').addEventListener('change',resetRegion);$('#mode').addEventListener('change',syncRegionMode);
$('#quality').addEventListener('change',()=>$('#custom-size').classList.toggle('hidden',$('#quality').value!=='custom'));
