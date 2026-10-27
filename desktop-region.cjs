const {BrowserWindow,desktopCapturer,screen,ipcMain}=require('electron');
const path=require('node:path');
let active=false;
async function selectDesktopRegion(main,sourceId,testMode=false){
 if(active)throw Error('正在选择录制区域');active=true;
 let overlay;
 try{
 const sources=await desktopCapturer.getSources({types:['screen']});
 const source=sources.find(s=>s.id===sourceId)||sources.find(s=>s.display_id===String(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id))||sources[0];
 if(!source)throw Error('未找到可用屏幕');
 const display=screen.getAllDisplays().find(d=>String(d.id)===source.display_id)||screen.getPrimaryDisplay();
 main.minimize();await new Promise(r=>setTimeout(r,350));
 let targets=[];let snapAvailable=true;try{targets=await require('./window-targets.cjs').windowTargets(screen,display);}catch{snapAvailable=false;}
 return await new Promise((resolve,reject)=>{
  let done=false;
  const finish=value=>{if(done)return;done=true;ipcMain.removeListener('desktop-region-result',receive);if(overlay&&!overlay.isDestroyed())overlay.destroy();if(!main.isDestroyed()){main.restore();main.show();main.focus();}resolve(value);};
  const receive=(event,rect)=>{if(event.sender!==overlay?.webContents)return;if(rect===null)return finish(null);const {x,y,w,h}=rect||{},bounds=display.bounds;if(![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<2||h<2||x+w>bounds.width+1||y+h>bounds.height+1)return;const factor=display.scaleFactor;finish({source:source.id,snapAvailable,snapWindows:targets.length,width:Math.round(bounds.width*factor),height:Math.round(bounds.height*factor),rect:{x:Math.round(x*factor),y:Math.round(y*factor),w:Math.round((x+w)*factor)-Math.round(x*factor),h:Math.round((y+h)*factor)-Math.round(y*factor)}});};
  ipcMain.on('desktop-region-result',receive);
  overlay=new BrowserWindow({...display.bounds,show:false,frame:false,transparent:true,resizable:false,movable:false,skipTaskbar:true,hasShadow:false,enableLargerThanScreen:true,webPreferences:{preload:path.join(__dirname,'region-preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
  overlay.setAlwaysOnTop(true,'screen-saver');overlay.setMenuBarVisibility(false);
  overlay.webContents.setWindowOpenHandler(()=>({action:'deny'}));overlay.webContents.on('will-navigate',e=>e.preventDefault());
  overlay.webContents.once('did-finish-load',()=>overlay.webContents.send('snap-targets',{targets,available:snapAvailable}));
  overlay.once('closed',()=>finish(null));overlay.webContents.once('render-process-gone',()=>finish(null));
  overlay.loadFile(path.join(__dirname,'ui','desktop-region.html')).catch(err=>{finish(null);});
  overlay.once('ready-to-show',async()=>{overlay.show();overlay.focus();if(testMode){try{if(!main.isMinimized())throw Error('主窗口没有最小化');await overlay.webContents.executeJavaScript(testMode==='cancel'?`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`:`targets=[{x:100,y:100,w:400,h:300,title:'吸附测试窗口'}];document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:200,clientY:200}));if(selection?.w!==400)throw Error('悬停吸附失败');document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,button:0,clientX:100,clientY:100}));document.body.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:500,clientY:400}));document.body.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,clientX:500,clientY:400}));document.querySelector('#confirm').click();`);}catch(e){finish(null);}}});
 });
 }finally{active=false;if(!main.isDestroyed()&&main.isMinimized()){main.restore();main.focus();}}
}
module.exports={selectDesktopRegion};
