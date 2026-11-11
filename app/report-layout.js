(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InBodyLayout = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const definitions = {
    height: /^(?:신장|키|Height)(?:cm)?$/i,
    age: /^(?:나이|Age)$/i,
    sex: /^(?:성별|Gender|Sex)$/i,
    date: /^(?:검사일시|검사일자|검사일|측정일시|측정일|TestDate|MeasurementDate)$/i,
    weight: /^(?:체중|Weight)(?:kg)?$/i,
    muscle: /^(?:골격근량|SkeletalMuscleMass|SMM)(?:kg)?$/i,
    fat: /^(?:체지방률|PercentBodyFat|PBF)(?:%)?$/i,
    muscleControl: /^(?:근육조절|MuscleControl)(?:kg)?$/i,
    fatControl: /^(?:지방조절|FatControl)(?:kg)?$/i,
    leanHeading: /^(?:부위별(?:근육|제지방)(?:분석|량)|Segmental(?:Lean|FatFree)(?:Analysis|Mass))$/i,
    leanFragment: /^LeanAnalysis$/i,
    fatHeading: /^(?:부위별체지방(?:분석|량)|SegmentalFat(?:Analysis|Mass))$/i,
    historyHeading: /^(?:신체변화|체성분변화|BodyCompositionHistory)$/i,
    controlHeading: /^(?:체중조절|WeightControl)$/i
  };
  const bounds = {height:[100,230],age:[18,64],weight:[30,250],muscle:[5,100],fat:[3,65],muscleControl:[-100,100],fatControl:[-100,100]};
  const fieldNames={height:'키',age:'나이',date:'측정일',sex:'성별',weight:'체중',muscle:'골격근량',fat:'체지방률',muscleControl:'근육 조절',fatControl:'지방 조절'};
  const keys = ['rightArm','leftArm','trunk','rightLeg','leftLeg'];
  const compact = text => String(text || '').replace(/[\s()（）\[\]：:]/g, '').replace(/[−–]/g, '-');
  const normal = text => String(text || '').replace(/\u00a0/g, ' ').replace(/[−–]/g, '-').replace(/％/g, '%');
  const centerX = word => (word.bbox.x0 + word.bbox.x1) / 2;
  const centerY = word => (word.bbox.y0 + word.bbox.y1) / 2;
  const height = word => word.bbox.y1 - word.bbox.y0;
  const unique = values => [...new Set(values)];

  function safeWords(raw) {
    return (Array.isArray(raw) ? raw : []).filter(word => word && typeof word.text === 'string' && word.bbox && ['x0','x1','y0','y1'].every(key => Number.isFinite(word.bbox[key])) && word.bbox.x1 > word.bbox.x0 && word.bbox.y1 > word.bbox.y0).slice(0,12000).map(word => ({text:normal(word.text),bbox:{...word.bbox},region:typeof word.region==='string'?word.region:null,confidence:Number.isFinite(word.confidence)?word.confidence:null}));
  }
  function makeRows(words) {
    const rows = [];
    for (const word of [...words].sort((a,b) => centerY(a)-centerY(b) || a.bbox.x0-b.bbox.x0)) {
      const row = rows.find(item => Math.abs(item.y-centerY(word)) <= Math.max(3, Math.min(item.h,height(word))*.85));
      if (row) {row.words.push(word);row.y=row.words.reduce((sum,w)=>sum+centerY(w),0)/row.words.length;}
      else rows.push({y:centerY(word),h:height(word),words:[word]});
    }
    for (const row of rows) row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);
    return rows;
  }
  function combined(words) {
    return {text:words.map(word=>word.text).join(' '),bbox:{x0:Math.min(...words.map(w=>w.bbox.x0)),y0:Math.min(...words.map(w=>w.bbox.y0)),x1:Math.max(...words.map(w=>w.bbox.x1)),y1:Math.max(...words.map(w=>w.bbox.y1))},region:words.every(word=>word.region===words[0].region)?words[0].region:null,confidence:words.every(word=>word.confidence!=null)?Math.min(...words.map(word=>word.confidence)):null};
  }
  function findAnchors(rows) {
    const found = [];
    // Large characters in the adjacent column can share a centre with a smaller
    // heading. A second pass aligns glyph tops so Korean headings keep all glyphs.
    const topRows=[];
    for(const word of rows.flatMap(row=>row.words).sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0)){
      const row=topRows.find(item=>Math.abs(item.y-word.bbox.y0)<=Math.max(3,Math.min(item.h,height(word))*.35));
      if(row)row.words.push(word);else topRows.push({y:word.bbox.y0,h:height(word),words:[word]});
    }
    for(const row of topRows)row.words.sort((a,b)=>a.bbox.x0-b.bbox.x0);
    for (const row of [...rows,...topRows]) for (let start=0;start<row.words.length;start++) {
      for (let count=1;count<=8 && start+count<=row.words.length;count++) {
        const group=row.words.slice(start,start+count);
        if (group.some((word,index)=>index && word.bbox.x0-group[index-1].bbox.x1 > Math.max(28,height(word)*2))) break;
        const word=combined(group),text=compact(word.text);
        for (const [field,pattern] of Object.entries(definitions)) if (pattern.test(text)) {
          if (!found.some(item=>item.field===field&&Math.abs(centerX(item)-centerX(word))<5&&Math.abs(centerY(item)-centerY(word))<5)) found.push({...word,field});
        }
      }
    }
    return found;
  }
  function numericWords(rows) {
    const results=[];
    for(const row of rows) for(let index=0;index<row.words.length;index++) {
      const word=row.words[index],text=word.text.trim(),match=text.match(/^([+-]?\d{1,3}(?:[.,]\d{1,2})?)(?:kg|㎏|cm|㎝|%|세)?$/i);
      if(!match)continue;
      const before=row.words[index-1],after=row.words[index+1];
      // Brackets and ranges belong to reference intervals, never to the measured value.
      if((before&&/^[([]$/.test(before.text.trim()))||(after&&/^[)\]]$/.test(after.text.trim())))continue;
      if((before&&/^[~〜]$/.test(before.text.trim()))||(after&&/^[~〜-]$/.test(after.text.trim())))continue;
      if(before&&before.text.trim()==='-'&&index>1&&/\d/.test(row.words[index-2].text)&&before.bbox.x0-row.words[index-2].bbox.x1<height(word)*2)continue;
      let numeric=match[1],box=word;
      if(before&&/^[+-]$/.test(before.text.trim())&&word.bbox.x0-before.bbox.x1<height(word)*2&&!/^[+-]/.test(numeric)){numeric=before.text.trim()+numeric;box=combined([before,word]);}
      const value=Number(numeric.replace(',','.'));
      if(Number.isFinite(value))results.push({...box,value,decimal:/[.,]/.test(numeric)});
    }
    return results;
  }
  function parseDate(text) {
    const match=normal(text).match(/(?:^|[^\d])(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/);
    if(!match)return null;
    const y=Number(match[1]),m=Number(match[2]),d=Number(match[3]),value=`${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`,date=new Date(0),now=new Date();
    date.setFullYear(y,m-1,d);date.setHours(12,0,0,0);
    const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    return y>=1900&&date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d&&value<=today?value:null;
  }
  function sexValue(text) {
    const value=compact(text);
    return /^(?:남성|남자|남|Male|M)$/i.test(value)?'male':/^(?:여성|여자|여|Female|F)$/i.test(value)?'female':null;
  }
  function rating(text) {
    const value=compact(text);
    if(/^(?:표준이하|표준미만|부족|BelowNormal|Below|Low|Under)$/i.test(value))return 'low';
    if(/^(?:표준이상|표준초과|이상|AboveNormal|Above|High|Over)$/i.test(value))return 'high';
    return /^(?:표준|정상|Normal|Standard)$/i.test(value)?'normal':null;
  }

  function extract(text,rawWords,geometry={}) {
    const words=safeWords(rawWords),rows=makeRows(words),anchors=findAnchors(rows),numbers=numericWords(rows),values={},extra={segmentRatings:{}},warnings=[],candidates=new Map(),preferred=new Map();
    const add=(key,value)=>{if(value!=null){if(!candidates.has(key))candidates.set(key,[]);candidates.get(key).push(value);}};
    const width=Number.isFinite(geometry.width)&&geometry.width>0?geometry.width:Math.max(0,...words.map(word=>word.bbox.x1));
    const pageHeight=Number.isFinite(geometry.height)&&geometry.height>0?geometry.height:Math.max(0,...words.map(word=>word.bbox.y1));
    const leanHeads=anchors.filter(a=>a.field==='leanHeading').sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0),fatHeads=anchors.filter(a=>a.field==='fatHeading').sort((a,b)=>a.bbox.y0-b.bbox.y0||a.bbox.x0-b.bbox.x0);
    let diagramPair=leanHeads.map(lean=>({lean,fat:fatHeads.find(fat=>fat.bbox.x0>lean.bbox.x1&&Math.abs(centerY(fat)-centerY(lean))<Math.max(height(lean),height(fat))*2)})).find(pair=>pair.fat);
    // A recognized 270 header or the paired diagrams establishes the two-column sheet.
    const is270=/inbody\s*\[?\s*270/i.test(normal(text))||rows.some(row=>/inbody\s*\[?\s*270/i.test(row.words.map(word=>word.text).join(' ')));
    const recognizedTemplate=is270&&unique(anchors.filter(a=>['weight','muscle','fat','muscleControl','fatControl','leanHeading','controlHeading'].includes(a.field)).map(a=>a.field)).length>=3&&pageHeight/width>=1.25&&pageHeight/width<=1.6;
    // In some browser OCR builds the Korean title is duplicated/overlapped and
    // "Segmental" fails, while "Lean Analysis" remains intact. The established
    // 270 layout and its paired heading/glyphs still identify the lean column.
    if(recognizedTemplate&&(!diagramPair||diagramPair.lean.bbox.x0>width*.12||diagramPair.fat.bbox.x0>width*.40)){
      const fragment=anchors.find(a=>a.field==='leanFragment'&&a.bbox.x0>=width*.13&&a.bbox.x1<=width*.32&&a.bbox.y0>=pageHeight*.50&&a.bbox.y0<=pageHeight*.65);
      if(fragment){
        const paired=fatHeads.find(a=>a.bbox.x0>width*.32&&Math.abs(centerY(a)-centerY(fragment))<Math.max(height(a),height(fragment))*2);
        const glyphs=words.filter(word=>word.bbox.x0<width*.30&&word.bbox.x0>=width*.02&&Math.abs(word.bbox.y0-fragment.bbox.y0)<=35&&/^(?:부|위|별|근|육|분석)$/.test(compact(word.text)));
        if(paired||(glyphs.length>=3&&glyphs.some(word=>/^(?:근|육|분석)$/.test(compact(word.text)))))diagramPair={lean:{...fragment,bbox:{...fragment.bbox,x0:width*.025,x1:width*.30}},fat:{...(paired||fragment),bbox:{...(paired||fragment).bbox,x0:width*.33,x1:width*.62}}};
      }
    }
    const twoColumns=Boolean(diagramPair||is270),columnBoundary=twoColumns&&width>0?width*.64:Infinity;
    const bands={height:[330/1600,178/2255,440/1600,213/2255],weight:[235/1600,755/2255,975/1600,795/2255],muscle:[235/1600,820/2255,975/1600,860/2255],fat:[235/1600,1170/2255,975/1600,1198/2255]};
    const inMeasuredBand=(word,field)=>{const band=bands[field];return band&&centerX(word)>=band[0]*width&&centerX(word)<=band[2]*width&&centerY(word)>=band[1]*pageHeight&&centerY(word)<=band[3]*pageHeight;};
    if(recognizedTemplate&&width>0&&pageHeight>0){
      for(const field of ['height','weight','muscle','fat']){
        const regionNumbers=numbers.filter(word=>word.region===field&&(field==='height'||word.decimal)&&inMeasuredBand(word,field)&&word.value>=bounds[field][0]&&word.value<=bounds[field][1]);
        const distinct=unique(regionNumbers.map(word=>word.value));
        if(distinct.length===1)preferred.set(field,distinct[0]);
      }
      for(const [field,x0,x1]of [['height',.20,.31],['age',.31,.38],['sex',.38,.45],['date',.45,.64]]){
        const cell=words.filter(word=>centerX(word)>=width*x0&&centerX(word)<width*x1&&centerY(word)>=pageHeight*.074&&centerY(word)<pageHeight*.103);
        if(field==='sex')for(const word of cell)add(field,sexValue(word.text));
        else if(field==='date')for(const row of makeRows(cell))add(field,parseDate(row.words.map(word=>word.text).join(' ')));
        else for(const word of cell){const match=word.text.trim().match(field==='height'?/^(\d{3}(?:[.,]\d{1,2})?)(?:cm|㎝)$/i:/^(\d{2})(?:세)?$/);if(match){const n=Number(match[1].replace(',','.'));if(n>=bounds[field][0]&&n<=bounds[field][1])add(field,n);}}
      }
    }

    for(const anchor of anchors) {
      const field=anchor.field,h=height(anchor);
      if(['height','age','sex','date'].includes(field)) {
        const neighbors=anchors.filter(a=>['height','age','sex','date'].includes(a.field)&&a!==anchor&&Math.abs(centerY(a)-centerY(anchor))<h);
        const left=Math.max(anchor.bbox.x0-h*1.8,...neighbors.filter(a=>centerX(a)<centerX(anchor)).map(a=>(centerX(a)+centerX(anchor))/2));
        const right=Math.min(anchor.bbox.x1+h*4,...neighbors.filter(a=>centerX(a)>centerX(anchor)).map(a=>(centerX(a)+centerX(anchor))/2));
        const below=words.filter(word=>centerX(word)>=left&&centerX(word)<=right&&word.bbox.y0>=anchor.bbox.y1-h*.1&&word.bbox.y0<=anchor.bbox.y1+h*3);
        if(field==='sex')for(const word of below)add('sex',sexValue(word.text));
        else if(field==='date'){
          for(const row of makeRows(below))add('date',parseDate(row.words.map(word=>word.text).join(' ')));
        }else{
          for(const word of below){const match=word.text.trim().match(field==='height'?/^(\d{3}(?:[.,]\d{1,2})?)(?:cm|㎝)?$/i:/^(\d{2})(?:세)?$/);if(match){const n=Number(match[1].replace(',','.'));if(n>=bounds[field][0]&&n<=bounds[field][1]&&(field!=='age'||Number.isInteger(n)))add(field,n);}}
        }
        continue;
      }
      if(!['weight','muscle','fat','muscleControl','fatControl'].includes(field))continue;
      const control=field.endsWith('Control'),limit=anchor.bbox.x0<columnBoundary?columnBoundary:Infinity;
      let nearby=numbers.filter(word=>word.bbox.x0>=anchor.bbox.x1-h*.25&&centerX(word)<limit&&word.bbox.x0-anchor.bbox.x1<Math.max(380,h*20)&&centerY(word)-centerY(anchor)>=-h*.75&&centerY(word)-centerY(anchor)<=h*(control?.75:2.6)&&word.value>=bounds[field][0]&&word.value<=bounds[field][1]);
      // The recognised 270 layout prints measured values with one decimal below
      // the graph scale. An isolated plausible integer is still an unread value.
      if(recognizedTemplate&&!control)nearby=nearby.filter(word=>word.decimal&&inMeasuredBand(word,field));
      // Graph scales use integers. A decimal measured value is distinct from its ticks.
      if(nearby.some(word=>word.decimal))nearby=nearby.filter(word=>word.decimal);
      const region=control?'controls':field;
      const cropped=nearby.filter(word=>word.region===region);
      if(cropped.length){if(unique([...nearby,...cropped].map(word=>word.value)).length>1)warnings.push(`${fieldNames[field]||field}의 전체 사진 인식값과 확대 인식값이 달라 확대 후보를 표시했어요. 원본과 확인해주세요.`);nearby=cropped;}
      const distinct=unique(nearby.map(word=>word.value));
      if(distinct.length===1)add(field,distinct[0]);
    }

    if(diagramPair) {
      const {lean,fat}=diagramPair,left=lean.bbox.x0,right=fat.bbox.x0,top=Math.max(lean.bbox.y1,fat.bbox.y1);
      const history=anchors.filter(a=>a.field==='historyHeading'&&a.bbox.y0>top).sort((a,b)=>a.bbox.y0-b.bbox.y0)[0];
      const bottom=history?history.bbox.y0:Math.max(...words.map(word=>word.bbox.y1));
      const inside=words.filter(word=>centerX(word)>=left&&centerX(word)<right&&centerY(word)>top&&centerY(word)<bottom);
      const ratingRows=[];
      for(const row of makeRows(inside)){
        const found=[];
        for(let i=0;i<row.words.length;i++){
          let match=null;
          for(let count=Math.min(3,row.words.length-i);count>=1;count--){const group=row.words.slice(i,i+count);if(group.some((w,index)=>index&&w.bbox.x0-group[index-1].bbox.x1>Math.max(25,height(w)*1.5)))continue;const r=rating(group.map(w=>w.text).join(' '));if(r){match={...combined(group),rating:r,count};break;}}
          if(match){found.push(match);i+=match.count-1;}
        }
        if(found.length)ratingRows.push({y:row.y,items:found.sort((a,b)=>centerX(a)-centerX(b))});
      }
      // The 270 diagram has two arms, one trunk and two legs. Partial or extra groups
      // are deliberately left for confirmation rather than assigned to guessed limbs.
      if(ratingRows.length===3&&ratingRows[0].items.length===2&&ratingRows[1].items.length===1&&ratingRows[2].items.length===2){
        const [arms,trunk,legs]=ratingRows,mid=centerX(trunk.items[0]),span=right-left;
        const shapeValid=arms.items[0].bbox.x1<mid&&arms.items[1].bbox.x0>mid&&legs.items[0].bbox.x1<mid&&legs.items[1].bbox.x0>mid&&arms.y<trunk.y&&trunk.y<legs.y&&mid>left+span*.25&&mid<left+span*.75;
        if(shapeValid){
          extra.segmentRatings.trunk=trunk.items[0].rating;
          const side=inside.filter(word=>/^(?:왼|왼쪽|Left|오른|오른쪽|Right)$/i.test(compact(word.text))&&Math.abs(centerY(word)-trunk.y)<Math.max(height(word)*3,(legs.y-arms.y)*.2));
          const leftLabel=side.find(word=>centerX(word)<mid),rightLabel=side.find(word=>centerX(word)>mid);
          const imageLeftIsLeft=leftLabel&&rightLabel&&/^(?:왼|왼쪽|Left)$/i.test(compact(leftLabel.text))&&/^(?:오른|오른쪽|Right)$/i.test(compact(rightLabel.text));
          const imageLeftIsRight=leftLabel&&rightLabel&&/^(?:오른|오른쪽|Right)$/i.test(compact(leftLabel.text))&&/^(?:왼|왼쪽|Left)$/i.test(compact(rightLabel.text));
          for(const [row,part]of [[arms,'Arm'],[legs,'Leg']]){
            if(imageLeftIsLeft||imageLeftIsRight){extra.segmentRatings[(imageLeftIsLeft?'left':'right')+part]=row.items[0].rating;extra.segmentRatings[(imageLeftIsLeft?'right':'left')+part]=row.items[1].rating;}
            else if(row.items[0].rating===row.items[1].rating){extra.segmentRatings['left'+part]=row.items[0].rating;extra.segmentRatings['right'+part]=row.items[1].rating;}
            else warnings.push('부위별 좌우 표시를 확실하게 읽지 못해 서로 다른 좌우 평가는 자동 입력하지 않았어요.');
          }
        }
      }
    }
    for(const [key,value]of preferred){if((candidates.get(key)||[]).some(candidate=>candidate!==value))warnings.push(`${fieldNames[key]||key}의 전체 사진 인식값과 확대 인식값이 달라 확대 후보를 표시했어요. 원본과 확인해주세요.`);candidates.set(key,[value]);}
    for(const [key,list]of candidates){const distinct=unique(list);if(distinct.length!==1){warnings.push(`${fieldNames[key]||key}의 위치별 인식값이 달라 자동 입력하지 않았어요.`);continue;}if(['sex','muscleControl','fatControl'].includes(key))extra[key]=distinct[0];else values[key]=distinct[0];}
    if(keys.some(key=>extra.segmentRatings[key]))warnings.push('부위별 평가는 근육분석 그림에서 읽은 후보입니다. 원본의 표준 이하·표준·표준 이상 표시를 확인해주세요.');
    return {values,extra,warnings:unique(warnings)};
  }
  function planRegions(rawWords,geometry={},text=''){
    const words=safeWords(rawWords),anchors=findAnchors(makeRows(words)),width=geometry.width,pageHeight=geometry.height;
    if(!Number.isFinite(width)||!Number.isFinite(pageHeight)||width<=0||pageHeight<=0)return [];
    const source=normal(text)+' '+words.map(word=>word.text).join(' ');
    const anchorCount=unique(anchors.filter(a=>['weight','muscle','fat','muscleControl','fatControl','leanHeading','controlHeading'].includes(a.field)).map(a=>a.field)).length;
    if(!/inbody\s*\[?\s*270/i.test(source)||anchorCount<3||pageHeight/width<1.25||pageHeight/width>1.6)return [];
    return [['height',330/1600,178/2255,110/1600,35/2255],['weight',235/1600,755/2255,740/1600,40/2255],['muscle',235/1600,820/2255,740/1600,40/2255],['fat',235/1600,1170/2255,740/1600,28/2255]].map(([id,x,y,w,h])=>({id,x:Math.floor(x*width+1e-8),y:Math.floor(y*pageHeight+1e-8),width:Math.min(Math.ceil(w*width-1e-8),width-Math.floor(x*width+1e-8)),height:Math.min(Math.ceil(h*pageHeight-1e-8),pageHeight-Math.floor(y*pageHeight+1e-8)),mode:'number'}));
  }
  return {extract,planRegions};
});
