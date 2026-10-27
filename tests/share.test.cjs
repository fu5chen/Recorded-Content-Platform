const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const net=require('node:net');const {createShare}=require('../share.cjs');
// Restarting the server deliberately closes keep-alive sockets; use a fresh
// connection for each assertion rather than reusing an undici pooled socket.
const fetch=(url,options={})=>globalThis.fetch(url,{...options,headers:{...options.headers,Connection:'close'}});
async function freePort(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
test('局域网链接鉴权、页面转义、视频分段读取、字幕、只读与链接失效',async()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'luke-share-test-'));const file=path.join(dir,'sample.mp4'),sub=path.join(dir,'sample.vtt');fs.writeFileSync(file,Buffer.from('0123456789'));fs.writeFileSync(sub,'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n测试字幕');const db={videos:[{id:'test-video',title:'<script>alert(1)</script>',file,subtitle:sub,courseId:'c'}],courses:[{id:'c',title:'测试课程'}]};const share=createShare(()=>db);let url;
try{const info=await share.start(await freePort());url=info.localUrl;assert.equal(info.active,true);
 assert.equal((await fetch(url.replace(/\/[a-f0-9]+\/$/,'/invalid/'))).status,404);
 const index=await (await fetch(url)).text();assert.ok(index.includes('&lt;script&gt;'));assert.ok(!index.includes('<script>alert'));
 const watch=await (await fetch(url+'watch/test-video')).text();assert.ok(watch.includes('<video controls'));assert.ok(watch.includes('测试课程')===false);assert.ok(watch.includes('kind="subtitles"'));
 const range=await fetch(url+'media/test-video',{headers:{Range:'bytes=2-5'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-range'),'bytes 2-5/10');assert.equal(await range.text(),'2345');
 const suffix=await fetch(url+'media/test-video',{headers:{Range:'bytes=-3'}});assert.equal(await suffix.text(),'789');
 assert.equal((await fetch(url+'media/test-video',{headers:{Range:'bytes=99-'}})).status,416);
 assert.equal((await fetch(url+'media/test-video',{headers:{Range:'bytes=0-1,3-4'}})).status,416);
 const head=await fetch(url+'media/test-video',{method:'HEAD'});assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
 assert.ok((await (await fetch(url+'subtitle/test-video')).text()).includes('WEBVTT'));
 assert.equal((await fetch(url,{method:'POST'})).status,405);
 const oldPort=info.port;await share.stop();const newer=await share.start(oldPort);assert.notEqual(newer.localUrl,url);assert.equal((await fetch(url)).status,404);
}finally{await share.stop();fs.rmSync(dir,{recursive:true,force:true});}});
