const $=s=>document.querySelector(s),api=window.studio;
let state={videos:[],courses:[],learners:[]},activeVideo=null,recorder=null,recId=null,streams=[],audioContext=null,drawTimer=null,tickTimer=null,elapsed=0,writeQueue=Promise.resolve(),recordFailed=false;
const titles={home:'工作概览',record:'录制工作室',library:'视频媒体库',courses:'课程管理',learners:'学员档案',live:'视频推流',share:'公司局域网共享',settings:'设置与上线说明'};
let toastTimer;
function toast(msg){$('#toast').textContent=String(msg);$('#toast').classList.remove('hidden');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.add('hidden'),9000);}
function guard(fn){return async(...args)=>{try{return await fn(...args);}catch(e){toast(e.message||e);}};}
function escapeHTML(s){return String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));}
function time(n){n=Math.max(0,Math.floor(n||0));return [Math.floor(n/3600),Math.floor(n/60)%60,n%60].map(x=>String(x).padStart(2,'0')).join(':');}
function courseName(id){return state.courses.find(c=>c.id===id)?.title||'未分类';}
async function page(id){document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!==id));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));$('#page-title').textContent=titles[id];if(id==='record')await sources();if(id==='share')shareUI(await api['share-info']());}
function empty(title,detail){return `<div class="empty"><strong>${title}</strong>${detail}</div>`;}
function courseOptions(){return '<option value="">未分类</option>'+state.courses.map(c=>`<option value="${c.id}">${escapeHTML(c.title)}</option>`).join('');}
function card(v){const percent=v.duration?Math.min(100,v.progress/v.duration*100):0;return `<article class="video-card"><div class="video-cover" data-play="${v.id}"><span class="play">▶</span><span class="duration">${v.duration?time(v.duration):'本地视频'}</span></div><div class="video-body"><h3 title="${escapeHTML(v.title)}">${escapeHTML(v.title)}</h3><p>${escapeHTML(courseName(v.courseId))} · ${new Date(v.createdAt).toLocaleDateString('zh-CN')}</p><progress max="100" value="${percent}" aria-label="观看进度"></progress><div class="video-actions"><button class="secondary" data-play="${v.id}">${v.progress>1?'继续观看':'播放 / 剪辑'}</button><button class="link" data-remove="${v.id}">移除</button></div></div></article>`;}
function render(){
 $('#stats').innerHTML=[['视频总数',state.videos.length+' 个'],['课程数量',state.courses.length+' 门'],['本地学员档案',state.learners.length+' 人']].map(([s,n])=>`<div class="stat"><span>${s}</span><strong>${n}</strong></div>`).join('');
 $('#recent').innerHTML=state.videos.slice(0,3).map(card).join('')||empty('开始你的第一堂课','点击右上角“开始录课”，或导入已经录好的视频。');
 const query=$('#search').value.trim().toLowerCase(),filter=$('#filter-course').value;
 const list=state.videos.filter(v=>v.title.toLowerCase().includes(query)&&(!filter||v.courseId===filter));
 $('#videos').innerHTML=list.map(card).join('')||empty('这里还没有视频','导入视频、录制新内容，或更换搜索条件。');$('#video-count').textContent=`${list.length} 个视频`;
 $('#course-list').innerHTML=state.courses.map(c=>`<div class="panel"><h3>${escapeHTML(c.title)}</h3><p class="muted">${escapeHTML(c.description||'暂无介绍')}</p><p>${state.videos.filter(v=>v.courseId===c.id).length} 个视频 · 公司内部免费课程</p><span class="badge">可通过局域网共享观看</span></div>`).join('')||empty('创建第一门课程','给视频一个清晰的归属。');
 $('#learner-list').innerHTML=state.learners.map(l=>`<div class="panel"><h3>${escapeHTML(l.name)}</h3><span class="badge">${escapeHTML(courseName(l.courseId))}</span><p class="muted">${escapeHTML(l.note)}</p></div>`).join('')||empty('还没有学员档案','可以在右侧保存姓名、课程和备注。');
 $('#storage').textContent='资料目录：'+state.root;
 for(const id of ['rec-course','learner-course','player-course']){const sel=$('#'+id),old=sel.value;sel.innerHTML=courseOptions();sel.value=old;}
 const old=$('#filter-course').value;$('#filter-course').innerHTML='<option value="">全部课程</option>'+state.courses.map(c=>`<option value="${c.id}">${escapeHTML(c.title)}</option>`).join('');$('#filter-course').value=old;
 const liveOld=$('#live-video').value;$('#live-video').innerHTML=state.videos.map(v=>`<option value="${v.id}">${escapeHTML(v.title)}</option>`).join('');if(state.videos.some(v=>v.id===liveOld))$('#live-video').value=liveOld;
}
async function refresh(){state=await api.state();render();}
document.querySelectorAll('nav button').forEach(b=>b.onclick=guard(()=>page(b.dataset.page)));
for(const id of ['go-record','hero-record'])$('#'+id).onclick=guard(()=>page('record'));
$('#all-videos').onclick=()=>page('library');
$('#import').onclick=guard(async()=>{const files=await api.import();if(files.length){await refresh();await page('library');toast('已导入 '+files.length+' 个视频');}});
$('#search').oninput=render;$('#filter-course').onchange=render;
document.body.addEventListener('click',guard(async e=>{const play=e.target.closest('[data-play]'),remove=e.target.closest('[data-remove]');if(play)await openVideo(play.dataset.play);if(remove&&await api['video-remove'](remove.dataset.remove))await refresh();}));
async function persist(){if(activeVideo)await api['video-update']({id:activeVideo.id,progress:$('#player').currentTime,duration:$('#player').duration});}
async function openVideo(id){if(recorder)throw Error('录制期间请先结束录制再播放视频');await persist();const v=state.videos.find(v=>v.id===id);await api['prepare-play'](id);activeVideo=v;$('#player-title').textContent=v.title;$('#rename-title').value=v.title;$('#player-course').value=v.courseId;$('#player').innerHTML='';$('#player').src=`studio-media://${v.id}/video`;$('#player').playbackRate=Number($('#speed').value);if(v.subtitle){const track=document.createElement('track');track.kind='subtitles';track.label='中文字幕';track.srclang='zh';track.src=`studio-media://${v.id}/subtitle`;track.default=true;$('#player').append(track);}$('#player').onloadedmetadata=()=>{$('#player').currentTime=v.progress<$('#player').duration-2?v.progress:0;$('#trim-start').value=0;$('#trim-end').value=Number.isFinite($('#player').duration)?$('#player').duration.toFixed(1):'';};if(!$('#player-dialog').open)$('#player-dialog').showModal();}
$('#close-player').onclick=()=>$('#player-dialog').close();
$('#player-dialog').addEventListener('close',guard(async()=>{await persist();$('#player').pause();$('#player').removeAttribute('src');$('#player').load();activeVideo=null;await refresh();}));
$('#player').addEventListener('pause',guard(persist));let lastSave=0;$('#player').addEventListener('timeupdate',()=>{if(Date.now()-lastSave>5000){lastSave=Date.now();guard(persist)();}});
$('#speed').onchange=()=>$('#player').playbackRate=Number($('#speed').value);
$('#rename').onclick=guard(async()=>{await api['video-update']({id:activeVideo.id,title:$('#rename-title').value.trim()||activeVideo.title,courseId:$('#player-course').value});$('#player-title').textContent=$('#rename-title').value;await refresh();toast('已保存名称与课程分类');});
$('#subtitle').onclick=guard(async()=>{const id=activeVideo.id;await persist();if(await api.subtitle(id)){await refresh();await openVideo(id);toast('字幕已导入，可在播放器字幕菜单启用');}});
$('#mark-start').onclick=()=>$('#trim-start').value=$('#player').currentTime.toFixed(1);$('#mark-end').onclick=()=>$('#trim-end').value=$('#player').currentTime.toFixed(1);
$('#export').onclick=guard(async()=>{$('#export').disabled=true;$('#export').textContent='正在导出…';try{const file=await api.export({id:activeVideo.id,start:Number($('#trim-start').value),end:Number($('#trim-end').value)});if(file)toast('导出完成：'+file);}finally{$('#export').disabled=false;$('#export').textContent='导出片段';}});
$('#course-form').onsubmit=guard(async e=>{e.preventDefault();await api['course-save'](Object.fromEntries(new FormData(e.target)));e.target.reset();await refresh();toast('课程已保存');});
$('#learner-form').onsubmit=guard(async e=>{e.preventDefault();await api['learner-save'](Object.fromEntries(new FormData(e.target)));e.target.reset();await refresh();toast('学员档案已保存');});
$('#folder').onclick=guard(()=>api.folder());
async function sources(){const old=$('#source').value;const data=await api.sources();$('#source').innerHTML=data.map(x=>`<option value="${escapeHTML(x.id)}">${escapeHTML(x.name)}</option>`).join('');if(data.some(x=>x.id===old))$('#source').value=old;if(old!==$('#source').value)resetRegion();}
$('#refresh-sources').onclick=guard(sources);
function stopStreams(){clearInterval(drawTimer);clearInterval(tickTimer);streams.forEach(s=>s.getTracks().forEach(t=>t.stop()));streams=[];if(audioContext){audioContext.close().catch(()=>{});audioContext=null;}}
function setRecordingUI(on){$('#start').disabled=on;$('#preview-open').disabled=!on;$('#pause').disabled=!on;$('#stop').disabled=!on;$('#pause').textContent='暂停';for(const id of ['mode','source','quality','mic','system-audio','rec-title','rec-course','refresh-sources','choose-region','reset-region','output-width','output-height'])$('#'+id).disabled=on;$('#rec-status').textContent=on?'● 正在录制':'未开始';$('#preview-placeholder').classList.toggle('hidden',on);if(!on)syncRegionMode();}
async function feed(stream){const el=document.createElement('video');el.muted=true;el.srcObject=stream;await el.play();return el;}
$('#start').onclick=guard(async()=>{
 $('#start').disabled=true;let screenVideo,camVideo;
 try{
 const mode=$('#mode').value;const canvas=$('#canvas');
 if(mode!=='camera'){
  if(!$('#source').value)throw Error('没有可用录制来源，请刷新来源');await api.source($('#source').value);
  const stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:$('#system-audio').checked});streams.push(stream);screenVideo=await feed(stream);stream.getVideoTracks()[0].addEventListener('ended',()=>{if(recorder?.state==='recording'||recorder?.state==='paused')$('#stop').click();});
 }
 if(mode!=='screen'){const stream=await navigator.mediaDevices.getUserMedia({video:{width:1280,height:720},audio:false});streams.push(stream);camVideo=await feed(stream);}
 if($('#mic').checked){const mic=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});streams.push(mic);}
 const rect=CaptureGeometry.scaleRect(mode==='camera'?null:captureRegion,screenVideo?.videoWidth||camVideo.videoWidth,screenVideo?.videoHeight||camVideo.videoHeight);const {w,h}=CaptureGeometry.outputSize($('#quality').value,$('#output-width').value,$('#output-height').value,rect);canvas.width=w;canvas.height=h;const ctx=canvas.getContext('2d');const fit=(v,x,y,bw,bh)=>{const scale=Math.min(bw/v.videoWidth,bh/v.videoHeight);ctx.drawImage(v,x+(bw-v.videoWidth*scale)/2,y+(bh-v.videoHeight*scale)/2,v.videoWidth*scale,v.videoHeight*scale);};
 const draw=()=>{ctx.fillStyle='#080d16';ctx.fillRect(0,0,w,h);CaptureGeometry.draw(ctx,screenVideo||camVideo,rect,0,0,w,h);if(screenVideo&&camVideo){const cw=w*.24,ch=cw*9/16;ctx.fillStyle='#161b2a';ctx.fillRect(w-cw-28,h-ch-28,cw+8,ch+8);fit(camVideo,w-cw-24,h-ch-24,cw,ch);}sendPreviewFrame(canvas);};draw();drawTimer=setInterval(draw,33);
 const output=canvas.captureStream(30);streams.push(output);const audioStreams=streams.filter(s=>s.getAudioTracks().length);
 if(audioStreams.length){audioContext=new AudioContext();await audioContext.resume();const dest=audioContext.createMediaStreamDestination();audioStreams.forEach(s=>audioContext.createMediaStreamSource(s).connect(dest));dest.stream.getAudioTracks().forEach(t=>output.addTrack(t));}
 const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
 recorder=new MediaRecorder(output,{mimeType:mime,videoBitsPerSecond:Math.min(24000000,Math.max(1500000,Math.round(w*h*3)))});
 recId=await api['record-start']({title:$('#rec-title').value.trim()||'录课 '+new Date().toLocaleString('zh-CN'),courseId:$('#rec-course').value});
 writeQueue=Promise.resolve();recordFailed=false;const id=recId;
 recorder.ondataavailable=e=>{if(e.data.size)writeQueue=writeQueue.then(async()=>{const bytes=await e.data.arrayBuffer();await api['record-chunk']({id,bytes});}).catch(err=>{recordFailed=true;toast('保存分段失败：'+err.message);if(recorder&&recorder.state!=='inactive')recorder.stop();});};
 recorder.onerror=e=>{recordFailed=true;toast('录制发生错误：'+(e.error?.message||'未知错误'));if(recorder?.state!=='inactive')recorder.stop();};
 recorder.onstop=guard(async()=>{stopStreams();$('#stop').disabled=true;$('#rec-status').textContent='正在保存…';try{await writeQueue;await api['record-end'](id);toast(recordFailed?'录制存在错误，已保留已写入的文件，请检查内容。':'录制已保存到视频媒体库');}finally{recorder=null;recId=null;setRecordingUI(false);await refresh();}});
 elapsed=0;$('#timer').textContent=time(0);setRecordingUI(true);recorder.start(1000);tickTimer=setInterval(()=>{if(recorder?.state==='recording'){$('#timer').textContent=time(++elapsed);}},1000);
 }catch(e){stopStreams();if(recId){await api['record-end'](recId).catch(()=>{});recId=null;}recorder=null;setRecordingUI(false);throw e;}
});
$('#pause').onclick=guard(()=>{if(recorder.state==='recording'){recorder.pause();$('#pause').textContent='继续录制';$('#rec-status').textContent='已暂停';}else{recorder.resume();$('#pause').textContent='暂停';$('#rec-status').textContent='● 正在录制';}});
$('#stop').onclick=()=>{if(recorder&&recorder.state!=='inactive'){recorder.stop();$('#stop').disabled=true;$('#pause').disabled=true;}};
$('#live-start').onclick=guard(async()=>{if(!$('#live-video').value)throw Error('请先导入或录制一个视频');await api['live-start']({id:$('#live-video').value,url:$('#live-url').value.trim()});$('#live-start').disabled=true;$('#live-stop').disabled=false;$('#live-status').textContent='推流进程已启动，连接结果以直播服务端为准';});
$('#live-stop').onclick=guard(()=>api['live-stop']());api.onLive(s=>{$('#live-start').disabled=s.active;$('#live-stop').disabled=!s.active;$('#live-status').textContent=s.message;});
window.addEventListener('unhandledrejection',e=>{toast(e.reason?.message||e.reason);e.preventDefault();});
guard(refresh)();

function shareUI(s){$('#share-start').disabled=s.active;$('#share-stop').disabled=!s.active;$('#share-copy').disabled=!s.active;$('#share-port').disabled=s.active;$('#share-status').textContent=s.active?'共享已开启 · 持链接可观看全部视频':'尚未开启';$('#share-links').value=s.urls.join('\n')||(s.active?'未找到局域网地址。请确认已连接公司网络。':'');}
$('#share-start').onclick=guard(async()=>{shareUI(await api['share-start'](Number($('#share-port').value)));toast('局域网共享已开启');});
$('#share-stop').onclick=guard(async()=>{shareUI(await api['share-stop']());toast('已停止共享，原链接已失效');});
$('#share-copy').onclick=guard(async()=>{const url=await api['share-copy']();if(url)toast('访问链接已复制');});

let previewWanted=false,previewBusy=false,previewLast=0;
const previewCanvas=document.createElement('canvas');
api.onPreview(on=>{previewWanted=on;});
$('#preview-open').onclick=guard(()=>api['preview-open']());
function sendPreviewFrame(source){if(!previewWanted||previewBusy||performance.now()-previewLast<30)return;previewLast=performance.now();previewBusy=true;try{const scale=Math.min(480/source.width,480/source.height,1),width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));if(previewCanvas.width!==width||previewCanvas.height!==height){previewCanvas.width=width;previewCanvas.height=height;}const ctx=previewCanvas.getContext('2d',{willReadFrequently:true,alpha:false});ctx.drawImage(source,0,0,width,height);const bytes=ctx.getImageData(0,0,width,height).data.buffer;api['preview-frame']({bytes,width,height,time:time(elapsed),paused:recorder?.state==='paused'}).catch(()=>{}).finally(()=>{previewBusy=false;});}catch{previewBusy=false;}}

let seekingByHand=false;
function syncSeek(){const p=$('#player');if(!seekingByHand)$('#seek').value=Number.isFinite(p.duration)&&p.duration>0?Math.round(p.currentTime/p.duration*1000):0;$('#seek-current').textContent=time(p.currentTime);$('#seek-duration').textContent=time(Number.isFinite(p.duration)?p.duration:0);$('#seek').disabled=!Number.isFinite(p.duration)||p.duration<=0;}
for(const event of ['timeupdate','loadedmetadata','durationchange'])$('#player').addEventListener(event,syncSeek);
async function seekToRatio(ratio){const p=$('#player');if(!Number.isFinite(p.duration)||p.duration<=0)return;p.currentTime=Math.max(0,Math.min(p.duration-0.01,ratio*p.duration));await p.play();}
$('#seek').addEventListener('pointerdown',()=>{seekingByHand=true;});
$('#seek').addEventListener('input',guard(async()=>{await seekToRatio(Number($('#seek').value)/1000);}));
$('#seek').addEventListener('change',guard(async()=>{seekingByHand=false;await seekToRatio(Number($('#seek').value)/1000);}));
$('#seek').addEventListener('pointercancel',()=>{seekingByHand=false;});
