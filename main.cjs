const {app,BrowserWindow,ipcMain,dialog,desktopCapturer,session,shell,net,protocol,clipboard}=require('electron');
const share=require('./share.cjs').createShare(()=>db);
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const {randomUUID}=require('node:crypto');
if(process.argv.includes('--smoke'))app.setPath('userData',path.join(app.getPath('temp'),'luke-studio-smoke-'+process.pid));
protocol.registerSchemesAsPrivileged([{scheme:'studio-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let win,root,db,selectedSource=null,recording=null,live=null;
const handles=new Map();
const {mediaResponse}=require('./media-response.cjs');
let preview;
const {selectDesktopRegion}=require('./desktop-region.cjs');
function save(){const p=path.join(root,'library.json');fs.writeFileSync(p+'.tmp',JSON.stringify(db,null,2));fs.renameSync(p+'.tmp',p);}
function video(id){const v=db.videos.find(x=>x.id===id);if(!v)throw Error('视频不存在');return v;}
function ffmpeg(){return path.join(app.isPackaged?process.resourcesPath:__dirname,'tools','ffmpeg.exe');}
function run(args){return new Promise((resolve,reject)=>{let log='';const p=spawn(ffmpeg(),['-hide_banner','-nostdin',...args],{windowsHide:true});p.stderr.on('data',d=>{log=(log+d).slice(-6000)});p.on('error',reject);p.on('close',c=>c===0?resolve():reject(Error('视频处理失败：'+log.slice(-1800))));});}
function add(file,title,courseId=''){const v={id:randomUUID(),file,title,courseId,createdAt:new Date().toISOString(),progress:0,duration:0};db.videos.unshift(v);save();return v;}
function listen(name,fn){ipcMain.handle(name,async(e,...args)=>{if(e.sender!==win.webContents)throw Error('无权访问');return fn(...args);});}
app.whenReady().then(()=>{
 root=path.join(app.getPath('userData'),'library');fs.mkdirSync(path.join(root,'media'),{recursive:true});
 const p=path.join(root,'library.json');db=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{videos:[],courses:[],learners:[]};
 protocol.handle('studio-media',request=>{const url=new URL(request.url);const v=db.videos.find(x=>x.id===url.hostname);if(!v)return new Response('Not found',{status:404});const file=url.pathname==='/subtitle'?v.subtitle:(v.seekFile||v.file);return file?mediaResponse(request,file):new Response('Not found',{status:404});});
 session.defaultSession.setPermissionRequestHandler((wc,permission,cb)=>cb(wc===win?.webContents&&['media','display-capture'].includes(permission)));
 session.defaultSession.setPermissionCheckHandler((wc,permission)=>wc===win?.webContents&&['media','display-capture'].includes(permission));
 session.defaultSession.setDisplayMediaRequestHandler(async(request,callback)=>{try{const sources=await desktopCapturer.getSources({types:['screen','window']});const source=sources.find(x=>x.id===selectedSource);if(!source)return callback({});callback({video:source,...(request.audioRequested?{audio:'loopback'}:{})});}catch{callback({});}});
 win=new BrowserWindow({width:1400,height:920,minWidth:1080,minHeight:760,title:'录课工作台 v0.6.0',backgroundColor:'#0c111b',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
 preview=require('./preview.cjs').createPreview(win);
 win.on('closed',()=>preview.close());
 win.setMenuBarVisibility(false);
 win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',e=>e.preventDefault());
 win.on('close',e=>{if(recording||live){const n=dialog.showMessageBoxSync(win,{type:'warning',buttons:['继续工作','结束并退出'],defaultId:0,cancelId:0,message:'录制或推流正在进行。退出会停止任务，未完成录制将保留恢复文件。'});if(n===0)e.preventDefault();}});
 listen('preview-open',()=>{if(recording)preview.open();});
 listen('preview-frame',data=>preview.frame(data));
 listen('prepare-play',async id=>{const v=video(id);if(v.file.toLowerCase().endsWith('.webm')&&!v.seekFile){const dest=path.join(root,'media',v.id+'.seek.webm');await run(['-y','-i',v.file,'-c','copy',dest]);v.seekFile=dest;save();}return true;});
 listen('state',()=>({...db,root,ffmpeg:fs.existsSync(ffmpeg())}));
 listen('sources',async()=> (await desktopCapturer.getSources({types:['screen','window'],thumbnailSize:{width:300,height:170}})).map(s=>({id:s.id,name:s.name,thumbnail:s.thumbnail.toDataURL()})));
 listen('desktop-region',id=>{if(recording)throw Error('请先结束录制');return selectDesktopRegion(win,String(id),process.argv.includes('--smoke'));});
 listen('source',id=>{selectedSource=String(id);});
 listen('import',async()=>{const r=await dialog.showOpenDialog(win,{title:'导入视频（复制到媒体库）',properties:['openFile','multiSelections'],filters:[{name:'视频',extensions:['mp4','webm','mov','mkv','avi','m4v']}]});if(r.canceled)return [];const out=[];for(const f of r.filePaths){const dest=path.join(root,'media',randomUUID()+path.extname(f));await fs.promises.copyFile(f,dest);out.push(add(dest,path.basename(f,path.extname(f))));}return out;});
 listen('record-start',({title,courseId})=>{if(recording)throw Error('已有录制任务');const id=randomUUID(),file=path.join(root,'media',id+'.webm');recording={id,file,title:String(title||'新录制'),courseId:String(courseId||''),fd:fs.openSync(file,'w')};preview.open();return id;});
 listen('record-chunk',({id,bytes})=>{if(recording?.id!==id)throw Error('录制任务已结束');fs.writeSync(recording.fd,Buffer.from(bytes));});
 listen('record-end',async id=>{if(recording?.id!==id)throw Error('录制任务不存在');const r=recording;fs.closeSync(r.fd);recording=null;preview.close();if(!fs.statSync(r.file).size){fs.unlinkSync(r.file);throw Error('录制没有产生有效数据');}const indexed=r.file+'.indexed.webm';try{await run(['-y','-i',r.file,'-c','copy',indexed]);fs.renameSync(indexed,r.file);}catch{if(fs.existsSync(indexed))fs.unlinkSync(indexed);}return add(r.file,r.title,r.courseId);});
 listen('video-update',({id,title,courseId,progress,duration})=>{const v=video(id);if(title!==undefined)v.title=String(title).slice(0,200);if(courseId!==undefined)v.courseId=db.courses.some(c=>c.id===courseId)?courseId:'';if(Number.isFinite(progress))v.progress=Math.max(0,progress);if(Number.isFinite(duration))v.duration=Math.max(0,duration);save();});
 listen('video-remove',async id=>{const v=video(id);const r=await dialog.showMessageBox(win,{type:'warning',message:'从媒体库移除“'+v.title+'”？',detail:'磁盘视频会保留在资料目录，不会删除。',buttons:['取消','移除'],cancelId:0,defaultId:0});if(r.response!==1)return false;db.videos=db.videos.filter(x=>x.id!==id);save();return true;});
 listen('subtitle',async id=>{const v=video(id);const r=await dialog.showOpenDialog(win,{properties:['openFile'],filters:[{name:'字幕',extensions:['vtt','srt']}]});if(r.canceled)return false;let text=await fs.promises.readFile(r.filePaths[0],'utf8');if(path.extname(r.filePaths[0]).toLowerCase()==='.srt')text='WEBVTT\n\n'+text.replace(/\r/g,'').replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g,'$1.$2');if(!text.replace(/^\uFEFF/,'').startsWith('WEBVTT'))throw Error('字幕格式无效，请使用 UTF-8 编码的 SRT / VTT');const file=path.join(root,'media',v.id+'.vtt');await fs.promises.writeFile(file,text);v.subtitle=file;save();return true;});
 listen('export',async({id,start,end})=>{const v=video(id);const a=Number(start),b=Number(end);if(!Number.isFinite(a)||a<0||!Number.isFinite(b)||b<=a)throw Error('请填写正确的开始和结束秒数');const r=await dialog.showSaveDialog(win,{defaultPath:v.title.replace(/[<>:"/\\|?*]/g,'_')+'.mp4',filters:[{name:'MP4',extensions:['mp4']}]});if(r.canceled)return null;if(path.resolve(r.filePath)===path.resolve(v.file))throw Error('不能覆盖原视频');await run(['-y','-i',v.file,'-ss',String(a),'-t',String(b-a),'-c:v','libx264','-preset','fast','-crf','22','-c:a','aac','-movflags','+faststart',r.filePath]);return r.filePath;});
 listen('course-save',({id,title,description,price})=>{if(!String(title).trim())throw Error('请填写课程名称');let c=db.courses.find(x=>x.id===id);if(!c){c={id:randomUUID()};db.courses.push(c);}Object.assign(c,{title:String(title).slice(0,200),description:String(description||'').slice(0,4000),price:Math.max(0,Number(price)||0)});save();return c;});
 listen('learner-save',({name,note,courseId})=>{if(!String(name).trim())throw Error('请填写学员姓名');const x={id:randomUUID(),name:String(name).slice(0,100),note:String(note||'').slice(0,1000),courseId};db.learners.push(x);save();return x;});
 listen('live-start',({id,url})=>{if(live)throw Error('已有推流任务');if(!/^rtmps?:\/\//i.test(url)||/[\r\n]/.test(url))throw Error('请输入完整 RTMP / RTMPS 推流地址');const v=video(id);live=spawn(ffmpeg(),['-hide_banner','-nostdin','-re','-i',v.file,'-c:v','libx264','-preset','veryfast','-tune','zerolatency','-c:a','aac','-ar','44100','-f','flv',url],{windowsHide:true});const proc=live;let error='';proc.stderr.on('data',d=>{error=(error+d).slice(-2000)});proc.on('error',()=>{live=null;win?.webContents.send('live-status',{active:false,message:'推流程序无法启动'});});proc.on('close',code=>{if(live===proc)live=null;win?.webContents.send('live-status',{active:false,message:code===0?'视频推流已完成':'推流已结束或连接失败，请检查地址与直播服务状态'});});return {active:true};});
 listen('live-stop',()=>{live?.kill();live=null;});
 listen('folder',()=>shell.openPath(root));
 listen('share-info',()=>share.info());
 listen('share-start',port=>share.start(port));
 listen('share-stop',()=>share.stop());
 listen('share-copy',()=>{const s=share.info();const url=s.urls[0]||s.localUrl;if(url)clipboard.writeText(url);return url;});
 win.loadFile(path.join(__dirname,'ui','index.html'));
 if(process.argv.includes('--smoke'))win.webContents.once('did-finish-load',async()=>{let result;const previewDuringRecord={};let checked=false;const observer=setInterval(()=>{if(!checked&&recording&&preview.window&&!preview.window.webContents.isLoading()){checked=true;const id=recording.id;preview.window.once('closed',()=>{previewDuringRecord.closeKeepsRecording=recording?.id===id;preview.open();});preview.close();}},100);try{result=await win.webContents.executeJavaScript(`(async()=>{
 const errors=[];window.addEventListener('error',e=>errors.push(e.message));
 await page('record');await document.querySelector('#choose-region').onclick();if(!captureRegion||captureRegion.rect.w<400)throw Error('桌面区域选择失败');const sourcePreview={width:captureRegion.width,height:captureRegion.height,snapAvailable:captureRegion.snapAvailable,snapWindows:captureRegion.snapWindows,rect:captureRegion.rect,restored:true};resetRegion();
 const sample=document.createElement('canvas');sample.width=400;sample.height=200;const sc=sample.getContext('2d');sc.fillStyle='red';sc.fillRect(0,0,200,200);sc.fillStyle='blue';sc.fillRect(200,0,200,200);
 const cropped=document.createElement('canvas');cropped.width=100;cropped.height=100;CaptureGeometry.draw(cropped.getContext('2d'),sample,{x:200,y:0,w:200,h:200},0,0,100,100);const pixel=Array.from(cropped.getContext('2d').getImageData(50,50,1,1).data);if(pixel[2]!==255||pixel[0]!==0)throw Error('裁切画面内容验证失败');
 regionBase=sample;regionSource='smoke-source';regionDraft={x:200,y:0,w:200,h:200};document.querySelector('#region-canvas').width=400;document.querySelector('#region-canvas').height=200;document.querySelector('#region-dialog').showModal();drawRegion();document.querySelector('#region-apply').click();if(captureRegion?.rect.x!==200)throw Error('区域设置未生效');resetRegion();
 const c=await studio['course-save']({title:'测试课程',description:'集成验证',price:9.9});
 await studio['learner-save']({name:'测试学员',courseId:c.id,note:'测试'});
 const id=await studio['record-start']({title:'自动录制测试',courseId:c.id});
 const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;const ctx=canvas.getContext('2d');
 const stream=canvas.captureStream(15);const rec=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});let q=Promise.resolve();
 rec.ondataavailable=e=>{q=q.then(async()=>studio['record-chunk']({id,bytes:await e.data.arrayBuffer()}));};
 const stopped=new Promise(r=>rec.onstop=r);rec.start(200);let i=0;const draw=setInterval(()=>{ctx.fillStyle=i++%2?'#4455aa':'#225533';ctx.fillRect(0,0,320,180);sendPreviewFrame(canvas);},60);
 await new Promise(r=>setTimeout(r,1600));rec.stop();await stopped;clearInterval(draw);stream.getTracks().forEach(t=>t.stop());await q;
 const v=await studio['record-end'](id);await refresh();await openVideo(v.id);
 const p=document.querySelector('#player');await new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('媒体读取超时')),10000);p.addEventListener('loadeddata',()=>{clearTimeout(t);resolve();},{once:true});p.addEventListener('error',()=>reject(Error('媒体播放失败')),{once:true});});
 const measuredDuration=p.duration;if(!Number.isFinite(measuredDuration)||measuredDuration<=0)throw Error('视频时长无效');const waitSeek=()=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('seek timeout')),4000);p.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});});let seeked=waitSeek();await seekToRatio(0.8);await seeked;const forward=p.currentTime;seeked=waitSeek();await seekToRatio(0.2);await seeked;const backward=p.currentTime;if(forward<=backward)throw Error('seek failed');p.pause();p.currentTime=0.5;await studio['video-update']({id:v.id,progress:0.5,duration:p.duration});
 document.querySelector('#player-dialog').close();await new Promise(r=>setTimeout(r,200));await page('library');
 return {title:document.title,bridge:!!studio,nav:document.querySelectorAll('nav button').length,duration:measuredDuration,seek:{forward,backward},sourcePreview,cropPixel:pixel,videoId:v.id,root:(await studio.state()).root,courses:(await studio.state()).courses.length,learners:(await studio.state()).learners.length,cards:document.querySelectorAll('#videos .video-card').length,errors};
 })()`);clearInterval(observer);result.previewDuringRecord=previewDuringRecord;if(!previewDuringRecord.closeKeepsRecording)throw Error('预览关闭后录制状态异常');const cancelled=await selectDesktopRegion(win,null,'cancel');await new Promise(r=>setTimeout(r,200));result.cancelRestored=cancelled===null&&!win.isMinimized();if(!result.cancelRestored)throw Error('取消选区后未恢复窗口');const v=video(result.videoId);const out=path.join(root,'test-export.mp4');await run(['-y','-i',v.file,'-ss','0','-t','1','-c:v','libx264','-c:a','aac',out]);result.exportBytes=fs.statSync(out).size;
 preview.open();await new Promise(r=>preview.window.webContents.once('did-finish-load',r));
 const previewStart=Date.now();for(let frame=0;frame<20;frame++)await preview.frame({bytes:new Uint8Array(480*270*4).fill(200),width:480,height:270,time:'00:00:01',paused:false});result.previewFrames=await preview.window.webContents.executeJavaScript("({count:Number(document.querySelector('#frame').dataset.frames),width:document.querySelector('#frame').width})");result.previewElapsedMs=Date.now()-previewStart;if(result.previewFrames.count!==20||result.previewElapsedMs>2500)throw Error('预览刷新验证失败');
 let closed=new Promise(r=>preview.window.once('closed',r));preview.close();await closed;result.previewClosed=!preview.window;
 preview.open();await new Promise(r=>preview.window.webContents.once('did-finish-load',r));result.previewReopened=!!preview.window;closed=new Promise(r=>preview.window.once('closed',r));preview.close();await closed;
 result.sources=(await desktopCapturer.getSources({types:['screen','window']})).length;await win.webContents.executeJavaScript("page('record')");const capture=await win.webContents.capturePage();fs.writeFileSync(path.join(__dirname,'smoke-preview.png'),capture.toPNG());}catch(e){result={error:e.stack};}finally{clearInterval(observer);fs.writeFileSync(path.join(__dirname,'smoke-result.json'),JSON.stringify(result,null,2));recording=null;app.quit();}});
});
app.on('before-quit',()=>{share.stop();if(recording){fs.closeSync(recording.fd);recording=null;}live?.kill();});
app.on('window-all-closed',()=>app.quit());
