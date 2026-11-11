(function(root,factory){
  'use strict';
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./report-layout.js'):root.InBodyLayout);
  if(node)module.exports=api;
  if(root)root.PhotoReader=api;
})(typeof window!=='undefined'?window:null,function(Layout){
  'use strict';
  const jobs=new WeakMap();
  function mappedWords(words,region,scale=1){
    return (words||[]).filter(w=>w.bbox&&typeof w.text==='string').map(w=>({text:w.text,confidence:w.confidence,region:region.id,bbox:{x0:region.x+w.bbox.x0/scale,y0:region.y+w.bbox.y0/scale,x1:region.x+w.bbox.x1/scale,y1:region.y+w.bbox.y1/scale}}));
  }
  function recognize(file,worker,onProgress=()=>{},isCurrent=()=>true){
    const previous=jobs.get(worker)||Promise.resolve();
    const job=previous.catch(()=>{}).then(()=>readPhoto(file,worker,onProgress,isCurrent));
    jobs.set(worker,job);
    const clear=()=>{if(jobs.get(worker)===job)jobs.delete(worker);};
    job.then(clear,clear);return job;
  }
  async function readPhoto(file,worker,onProgress,isCurrent){
    if(!isCurrent())throw new Error('Photo cancelled');
    const bitmap=await createImageBitmap(file);
    const canvas=document.createElement('canvas'),factor=Math.min(1,3000/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.round(bitmap.width*factor);canvas.height=Math.round(bitmap.height*factor);
    canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const geometry={width:canvas.width,height:canvas.height};
    let numericMode=false;
    try{
      onProgress('결과지 전체에서 항목과 위치를 찾고 있어요.');
      await worker.setParameters({tessedit_pageseg_mode:'3',tessedit_char_whitelist:''});
      const full=await worker.recognize(canvas);
      if(!isCurrent())throw new Error('Photo cancelled');
      const words=[...(full.data.words||[])];
      const regions=Layout.planRegions(words,geometry,full.data.text).filter(r=>['height','weight','muscle','fat'].includes(r.id));
      if(regions.length){
        onProgress('표와 그래프의 숫자를 한 번 더 읽고 있어요.');
        await worker.reinitialize('eng');numericMode=true;
        await worker.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'0123456789.cm+-'});
        for(let i=0;i<regions.length;i++){
          if(!isCurrent())throw new Error('Photo cancelled');
          const region=regions[i],crop=document.createElement('canvas'),scale=3;
          const width=Math.min(region.width,canvas.width-region.x),height=Math.min(region.height,canvas.height-region.y);
          if(width<=0||height<=0)continue;
          crop.width=width*scale;crop.height=height*scale;
          const ctx=crop.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,crop.width,crop.height);
          ctx.drawImage(canvas,region.x,region.y,width,height,0,0,crop.width,crop.height);
          const result=await worker.recognize(crop);
          words.push(...mappedWords(result.data.words,region,scale));
          crop.width=0;crop.height=0;
          onProgress(`숫자 영역 재확인 ${i+1} / ${regions.length}`);
        }
      }
      return {text:full.data.text,words,geometry,regionCount:regions.length};
    }finally{
      canvas.width=0;canvas.height=0;
      if(numericMode)await worker.reinitialize('kor+eng');
    }
  }
  return {recognize,mappedWords};
});
