const fs=require('node:fs');const path=require('node:path');const asar=require('@electron/asar');
const root=path.resolve(process.argv[2]||'release-clean/win-unpacked');
const forbidden=name=>/\.(mp4|webm|mkv|avi|mov|m4v|srt|vtt|sqlite|db)$/i.test(name)||/(^|[\\/])(library\.json(?:\.tmp)?|userData|library|data)([\\/]|$)/i.test(name);
const problems=[];function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name),relative=path.relative(root,file);if(forbidden(relative))problems.push(relative);if(entry.isDirectory())walk(file);else if(entry.name.endsWith('.asar')){for(const inner of asar.listPackage(file))if(forbidden(inner))problems.push(relative+':'+inner);}}}walk(root);
if(problems.length){console.error('拒绝发布：发现媒体或用户资料',problems);process.exit(1);}console.log('发布隐私检查通过：发行目录与 app.asar 均无视频、字幕、用户资料库。');
