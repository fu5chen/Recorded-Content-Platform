const {test}=require('node:test');const assert=require('node:assert/strict');const g=require('../ui/capture-geometry.js');
test('反向拖动、越界拖动和屏幕缩放下的区域坐标',()=>{
 assert.deepEqual(g.fromDrag({x:900,y:700},{x:100,y:200},1920,1080),{x:100,y:200,w:800,h:500});
 assert.deepEqual(g.fromDrag({x:-20,y:-30},{x:2000,y:1200},1920,1080),{x:0,y:0,w:1920,h:1080});
 assert.deepEqual(g.scaleRect({rect:{x:100,y:200,w:800,h:500},width:1920,height:1080},3840,2160),{x:200,y:400,w:1600,h:1000});
 assert.deepEqual(g.scaleRect(null,1920,1080),{x:0,y:0,w:1920,h:1080});
 assert.throws(()=>g.validateRect({x:1900,y:0,w:40,h:40},1920,1080));
 assert.throws(()=>g.validateRect({x:0,y:0,w:0,h:0},1920,1080));
});
test('输出尺寸和实际绘制保持区域比例，拒绝不合法尺寸',()=>{
 assert.deepEqual(g.outputSize('source',0,0,{w:801,h:501}),{w:800,h:500});
 assert.deepEqual(g.outputSize('custom',1000,800,{}),{w:1000,h:800});
 assert.deepEqual(g.outputSize('1920',0,0,{}),{w:1920,h:1080});
 for(const pair of [[0,0],[1921,1080],[Infinity,720],[7680,7680]])assert.throws(()=>g.outputSize('custom',...pair,{}));
 let args;const source={};g.draw({drawImage:(...a)=>args=a},source,{x:100,y:50,w:800,h:400},0,0,1000,1000);
 assert.deepEqual(args,[source,100,50,800,400,0,250,1000,500]);
});
