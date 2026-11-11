const test=require('node:test'),assert=require('node:assert/strict');
const Reader=require('./dist/photo-ocr.js');

test('numeric crop words preserve full-sheet coordinates and source without mutating OCR output',()=>{
  const words=[{text:'28.6',confidence:92,bbox:{x0:30,x1:150,y0:12,y1:42}}];
  const original=JSON.stringify(words),mapped=Reader.mappedWords(words,{id:'muscle',x:200,y:700},3);
  assert.deepEqual(mapped,[{text:'28.6',confidence:92,region:'muscle',bbox:{x0:210,x1:250,y0:704,y1:714}}]);
  assert.equal(JSON.stringify(words),original);
});

test('cancel then retry serializes complete recognition jobs on their shared worker',async()=>{
  const canvases=[];
  global.createImageBitmap=async()=>({width:400,height:600,close(){}});
  global.document={createElement(){const canvas={width:0,height:0,getContext:()=>({drawImage(){}})};canvases.push(canvas);return canvas;}};
  let release,started=0,active=0,peak=0,current=true;
  const gate=new Promise(resolve=>{release=resolve;});
  const worker={setParameters:async()=>{},recognize:async()=>{started++;active++;peak=Math.max(peak,active);if(started===1)await gate;active--;return {data:{text:'',words:[]}};}};
  try{
    const first=Reader.recognize({},worker,()=>{},()=>current);const cancelled=assert.rejects(first,/cancelled/);
    await new Promise(setImmediate);current=false;
    const second=Reader.recognize({},worker);
    await new Promise(setImmediate);assert.equal(started,1,'retry waits while previous photo is running');
    release();await cancelled;await second;
    assert.equal(peak,1);assert.equal(started,2);assert(canvases.every(c=>c.width===0&&c.height===0));
  }finally{delete global.createImageBitmap;delete global.document;}
});
