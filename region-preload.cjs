const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('regionPicker',{onTargets:fn=>ipcRenderer.on('snap-targets',(_e,data)=>fn(data)),finish:rect=>ipcRenderer.send('desktop-region-result',rect)});
