const {execFile}=require('node:child_process');const path=require('node:path');
async function windowTargets(screen,display){
 const {app}=require('electron');const file=path.join(app.isPackaged?process.resourcesPath:__dirname,'tools','window-bounds.ps1');
 const data=await new Promise((resolve,reject)=>execFile('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',file,'-ExcludeProcessId',String(process.pid)],{windowsHide:true,timeout:7000,maxBuffer:1024*1024,encoding:'utf8'},(e,out)=>e?reject(e):resolve(out)));
 const bounds=display.bounds;return JSON.parse(data.replace(/^\uFEFF/,'' )).map(item=>{const r=screen.screenToDipRect(null,{x:item.x,y:item.y,width:item.width,height:item.height});const x=Math.max(bounds.x,r.x),y=Math.max(bounds.y,r.y),right=Math.min(bounds.x+bounds.width,r.x+r.width),bottom=Math.min(bounds.y+bounds.height,r.y+r.height);return {x:x-bounds.x,y:y-bounds.y,w:right-x,h:bottom-y,title:item.title};}).filter(r=>r.w>=40&&r.h>=40);
}
module.exports={windowTargets};
