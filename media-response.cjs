const fs=require('node:fs');const {Readable}=require('node:stream');
function mediaResponse(request,file){
 if(!fs.existsSync(file))return new Response('Not found',{status:404});
 if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405});
 const size=fs.statSync(file).size;let start=0,end=size-1,status=200;
 const range=request.headers.get('range');
 if(range){const m=/^bytes=(\d*)-(\d*)$/.exec(range);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});if(!m[1])start=Math.max(0,size-Number(m[2]));else{start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}if(start>end||start>=size||!Number.isSafeInteger(start)||!Number.isSafeInteger(end))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206;}
 const ext=file.split('.').pop().toLowerCase();const type={webm:'video/webm',mp4:'video/mp4',m4v:'video/mp4',vtt:'text/vtt; charset=utf-8',mov:'video/quicktime',mkv:'video/x-matroska'}[ext]||'application/octet-stream';
 const headers={'Content-Type':type,'Accept-Ranges':'bytes','Content-Length':String(Math.max(0,end-start+1)),'Cache-Control':'no-store',...(status===206?{'Content-Range':`bytes ${start}-${end}/${size}`}:{})};
 return new Response(request.method==='HEAD'||!size?null:Readable.toWeb(fs.createReadStream(file,{start,end})),{status,headers});
}
module.exports={mediaResponse};
