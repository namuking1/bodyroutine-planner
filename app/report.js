(function (root, factory) {
  'use strict';
  const node = typeof module === 'object' && module.exports;
  const layout = node ? (() => { try { return require('./report-layout.js'); } catch { return null; } })() : root.InBodyLayout;
  const api = factory(node ? require('./core.js') : root.BodyCore, node ? require('./focus.js') : root.BodyFocus, layout);
  if (node) module.exports = api;
  if (root) root.InBodyReport = api;
})(typeof window !== 'undefined' ? window : null, function (C, F, L) {
  'use strict';

  const SOURCES = [
    'https://uk.inbody.com/wp-content/uploads/2021/01/The-Professionals-Guide-to-the-InBody-Result-Sheet_ENGLISH-rev2.pdf',
    'https://nl.inbody.com/wp-content/uploads/2019/01/InBody230_CDmanual_Eng_L.pdf',
    'https://acsm.org/resistance-training-guidelines-update-2026/'
  ];
  const segmentKeys = ['rightArm', 'leftArm', 'trunk', 'rightLeg', 'leftLeg'];
  const segmentNames = { rightArm: '오른팔', leftArm: '왼팔', trunk: '몸통', rightLeg: '오른다리', leftLeg: '왼다리' };
  const ratingNames = { low: '표준 이하', normal: '표준', high: '표준 이상' };
  const segmentLabels = {
    rightArm: /(?:오른\s*팔|오른쪽\s*팔|우측\s*팔|Right\s*Arm)/gi,
    leftArm: /(?:왼\s*팔|왼쪽\s*팔|좌측\s*팔|Left\s*Arm)/gi,
    trunk: /(?:몸통|체간|Trunk)/gi,
    rightLeg: /(?:오른\s*다리|오른쪽\s*다리|우측\s*다리|Right\s*Leg)/gi,
    leftLeg: /(?:왼\s*다리|왼쪽\s*다리|좌측\s*다리|Left\s*Leg)/gi
  };
  const leanHeading = /(?:부위별\s*(?:근육|제지방)\s*(?:분석|량)?|Segmental\s*(?:Lean|Fat\s*Free)\s*(?:Analysis|Mass)?)/i;
  const fatHeading = /(?:부위별\s*체지방|Segmental\s*Fat\s*(?:Analysis|Mass)?)/i;
  const stopHeading = /(?:체중\s*조절|체중\s*관리|Weight\s*Control|임피던스|Impedance|연구\s*항목|Research\s*Parameters|영양\s*평가|Nutrition\s*Evaluation)/i;
  const round = value => Math.round((value + Number.EPSILON) * 10) / 10;
  const signed = value => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string') return null;
    const text = value.trim().replace(/[−–]/g, '-').replace(/([+-])\s+(?=\d)/g, '$1');
    return /^[+-]?\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(',', '.')) : null;
  }
  function bounded(value, low, high) { const n = number(value); return n != null && n >= low && n <= high ? round(n) : null; }
  function object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  function sanitizeExtra(raw) {
    raw = object(raw);
    const segments = object(raw.segments), ratings = object(raw.segmentRatings);
    return {
      sex: raw.sex === 'male' || raw.sex === 'female' ? raw.sex : null,
      muscleControl: bounded(raw.muscleControl, -100, 100),
      fatControl: bounded(raw.fatControl, -100, 100),
      // These are candidate percentages, not kg. Only a confirmed lower/current-body-weight reference is actionable.
      segments: Object.fromEntries(segmentKeys.map(key => [key, bounded(segments[key], 40, 250)])),
      segmentReference: raw.segmentReference === 'bodyWeight' ? 'bodyWeight' : null,
      segmentRatings: Object.fromEntries(segmentKeys.map(key => [key, Object.hasOwn(ratingNames, ratings[key]) ? ratings[key] : null])),
      ratingReference: raw.ratingReference === 'lean' ? 'lean' : null,
      source: raw.source === 'photo' ? 'photo' : 'manual'
    };
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0); date.setFullYear(year, month - 1, day); date.setHours(12, 0, 0, 0);
    return year >= 1900 && date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day && value <= C.today();
  }
  function normalizeText(text) {
    return typeof text === 'string' ? text.replace(/\u00a0/g, ' ').replace(/[−–]/g, '-').replace(/％/g, '%').replace(/([+-])\s+(?=\d)/g, '$1') : '';
  }
  function sameLineWords(words) {
    const safe = (Array.isArray(words) ? words : []).filter(w => w && typeof w.text === 'string' && w.bbox && ['x0', 'x1', 'y0', 'y1'].every(k => Number.isFinite(w.bbox[k])) && w.bbox.x1 > w.bbox.x0 && w.bbox.y1 > w.bbox.y0).slice(0, 10000).map(w => ({text: normalizeText(w.text), bbox: {...w.bbox}})).sort((a,b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
    const rows = [];
    for (const word of safe) {
      const center = (word.bbox.y0 + word.bbox.y1) / 2, height = word.bbox.y1 - word.bbox.y0;
      const row = rows.find(r => Math.abs(r.center - center) <= Math.max(4, Math.min(height, r.height) * .55));
      if (row) { row.words.push(word); row.center = row.words.reduce((sum,w) => sum + (w.bbox.y0+w.bbox.y1)/2,0)/row.words.length; }
      else rows.push({center, height, words:[word]});
    }
    return rows.sort((a,b) => a.center-b.center).map(row => ({...row,words:row.words.sort((a,b) => a.bbox.x0-b.bbox.x0),text:row.words.map(w=>w.text).join(' ')}));
  }
  function sexValue(text) {
    if (/^(?:여성|여자|여|female|f)$/i.test(text)) return 'female';
    if (/^(?:남성|남자|남|male|m)$/i.test(text)) return 'male';
    return null;
  }
  function parse(text, words, geometry) {
    const source = normalizeText(text), rows = sameLineWords(words), core = C.parseOcr(source);
    const layout = L?.extract ? L.extract(source, words, geometry) : {values:{},extra:{},warnings:[]};
    const candidates = new Map();
    const warnings = [...(layout.warnings || [])], blockedSegments = new Set();
    const put = (key,value) => { if (value != null) { if (!candidates.has(key)) candidates.set(key,[]); candidates.get(key).push(value); } };
    // Spatially anchored measured values supersede graph ticks adjacent to flattened OCR labels.
    const valueBounds={height:[100,230],age:[18,64],weight:[30,250],muscle:[5,100],fat:[3,65]};
    for (const [key,value] of Object.entries(core.values)) if(layout.values?.[key]==null) put(key,value);
    for (const [key,value] of Object.entries(layout.values || {})) {
      if(key==='date'){if(validDate(value))put(key,value);}
      else if(valueBounds[key]){const n=bounded(value,...valueBounds[key]);if(n!=null&&(key!=='age'||Number.isInteger(n)))put(key,n);}
    }
    for(const key of ['sex','muscleControl','fatControl'])put(key,layout.extra?.[key]);
    for(const key of segmentKeys)if(Object.hasOwn(ratingNames,layout.extra?.segmentRatings?.[key]))put(`segmentRatings.${key}`,layout.extra.segmentRatings[key]);
    const lines = source.split(/\r?\n/);
    for (const line of lines) {
      for (const match of line.matchAll(/(?:성별|Gender|\bSex\b)\s*[:：]?\s*(여성|여자|여|Female\b|F\b|남성|남자|남|Male\b|M\b)/gi)) put('sex',sexValue(match[1]));
      for (const [key,label] of [['muscleControl',/(?:근육\s*조절|Muscle\s*Control)/gi],['fatControl',/(?:지방\s*조절|Fat\s*Control)/gi]]) {
        for (const match of line.matchAll(label)) {
          if (/(?:목표|표준|예시|sample)\s*$/i.test(line.slice(Math.max(0,match.index-12),match.index))) continue;
          const tail = line.slice(match.index+match[0].length);
          const value = tail.match(/^\s*(?:[(（]\s*(?:kg|㎏)\s*[)）])?\s*[:：]?\s*([+-]?\s*\d{1,3}(?:[.,]\d{1,2})?)(?![\d.,])/i);
          if (!value || /^\s*(?:%|[-~〜]\s*\d)/.test(tail.slice(value[0].length))) continue;
          put(key,bounded(value[1],-100,100));
        }
      }
      for (const match of line.matchAll(/(?:검사일시|검사일자|검사일|측정일시|측정일|Test\s*Date|Measurement\s*Date)\s*[:：]?\s*(\d{4})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})(?!\d)/gi)) {
        if (/(?:목표|예정|target|scheduled)\s*$/i.test(line.slice(Math.max(0,match.index-15),match.index))) continue;
        const value = `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
        if (validDate(value)) put('date',value);
      }
    }
    // Header cells can be arranged as labels on one row and values immediately below.
    const anchors = [];
    for (const row of rows) for (const word of row.words) {
      const label = word.text.replace(/\s|[()（）]/g,'');
      const field = /^(?:신장|Height)(?:cm)?$/i.test(label) ? 'height' : /^(?:나이|Age)$/i.test(label) ? 'age' : /^(?:성별|Gender|Sex)$/i.test(label) ? 'sex' : null;
      if (field) anchors.push({...word,field});
    }
    const allWords = rows.flatMap(row=>row.words);
    for (const anchor of anchors) {
      if(layout.values?.[anchor.field]!=null||(anchor.field==='sex'&&layout.extra?.sex!=null))continue;
      const h=anchor.bbox.y1-anchor.bbox.y0, ax=(anchor.bbox.x0+anchor.bbox.x1)/2;
      const neighbors=anchors.filter(a=>a!==anchor&&Math.abs(a.bbox.y0-anchor.bbox.y0)<h);
      const left=Math.max(anchor.bbox.x0-Math.max(20,h*2),...neighbors.filter(a=>(a.bbox.x0+a.bbox.x1)/2<ax).map(a=>((a.bbox.x0+a.bbox.x1)/2+ax)/2));
      const right=Math.min(anchor.bbox.x1+Math.max(40,h*3),...neighbors.filter(a=>(a.bbox.x0+a.bbox.x1)/2>ax).map(a=>((a.bbox.x0+a.bbox.x1)/2+ax)/2));
      for (const word of allWords) {
        const x=(word.bbox.x0+word.bbox.x1)/2;
        if (x<left||x>right||word.bbox.y0<anchor.bbox.y1-h*.1||word.bbox.y0>anchor.bbox.y1+h*2.5) continue;
        if(anchor.field==='sex') put('sex',sexValue(word.text));
        else {const match=word.text.match(anchor.field==='height'?/^(\d{3}(?:[.,]\d{1,2})?)(?:cm|㎝)?$/i:/^(\d{2})$/);if(match)put(anchor.field,bounded(match[1],anchor.field==='height'?100:18,anchor.field==='height'?230:64));}
      }
    }
    let mode=null;
    for (const line of lines) {
      if(fatHeading.test(line)){mode='fat';continue;}
      if(leanHeading.test(line))mode='lean';
      else if(stopHeading.test(line)){mode=null;continue;}
      if(mode!=='lean')continue;
      const matches=[];
      for(const [key,label]of Object.entries(segmentLabels))for(const match of line.matchAll(label))matches.push({key,index:match.index,end:match.index+match[0].length});
      matches.sort((a,b)=>a.index-b.index);
      for(let i=0;i<matches.length;i++){
        const item=matches[i],tail=line.slice(item.end,matches[i+1]?.index??line.length);
        // Named qualitative rows are safe only inside an unambiguous lean section.
        if(!/(?:목표|기준|예시|target|reference)\s*$/i.test(line.slice(Math.max(0,item.index-15),item.index))){
          const rating=tail.match(/^\s*[:：]?\s*(표준\s*이하|표준\s*이상|표준|below\s*(?:normal|standard)|above\s*(?:normal|standard)|normal)\s*(?:$|[,;])/i);
          if(rating)put(`segmentRatings.${item.key}`,/이하|below/i.test(rating[1])?'low':/이상|above/i.test(rating[1])?'high':'normal');
        }
        if(/(?:목표|표준|예시|target|reference)\s*$/i.test(line.slice(Math.max(0,item.index-15),item.index))||/^\s*(?:목표|표준|기준|target|reference)/i.test(tail))continue;
        const percents=[...tail.matchAll(/([+-]?\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)].filter(m=>!/\d\s*[-~〜]\s*$/.test(tail.slice(Math.max(0,m.index-10),m.index))).map(m=>bounded(m[1],40,250)).filter(n=>n!=null);
        if(percents.length===1)put(`segments.${item.key}`,percents[0]);
        else if(percents.length>1){blockedSegments.add(item.key);warnings.push(`${segmentNames[item.key]}에 여러 비율이 보여 자동 입력하지 않았어요. 체중 대비 하단 비율을 확인해주세요.`);}
      }
    }
    // Diagram labels and their values may be on separate OCR rows. The header must establish a lean section.
    let leanTop=null,leanBottom=Infinity;
    for(const row of rows){if(leanHeading.test(row.text)&&leanTop==null)leanTop=row.center;else if(leanTop!=null&&row.center>leanTop&&(fatHeading.test(row.text)||stopHeading.test(row.text))){leanBottom=row.center;break;}}
    if(leanTop!=null){
      for(const row of rows){if(row.center<=leanTop||row.center>=leanBottom)continue;for(let wi=0;wi<row.words.length;wi++){
        let word=row.words[wi],key=null;
        for(const [field,label]of Object.entries(segmentLabels)){const re=new RegExp(`^(?:${label.source})$`,'i');if(re.test(word.text)){key=field;break;}if(row.words[wi+1]&&re.test(`${word.text} ${row.words[wi+1].text}`)){key=field;word={text:'',bbox:{x0:word.bbox.x0,x1:row.words[wi+1].bbox.x1,y0:Math.min(word.bbox.y0,row.words[wi+1].bbox.y0),y1:Math.max(word.bbox.y1,row.words[wi+1].bbox.y1)}};break;}}
        if(!key)continue;const h=word.bbox.y1-word.bbox.y0,x=(word.bbox.x0+word.bbox.x1)/2;
        const found=[];
        for(const val of allWords){const vx=(val.bbox.x0+val.bbox.x1)/2;if(val.bbox.y0<word.bbox.y0-h*.2||val.bbox.y0>word.bbox.y1+h*3.5||val.bbox.y0>=leanBottom||Math.abs(vx-x)>Math.max(55,h*3))continue;for(const match of val.text.matchAll(/(\d{1,3}(?:[.,]\d{1,2})?)\s*%/g)){const n=bounded(match[1],40,250);if(n!=null)found.push(n);}}
        const unique=[...new Set(found)];if(unique.length===1)put(`segments.${key}`,unique[0]);else if(unique.length>1){blockedSegments.add(key);warnings.push(`${segmentNames[key]}의 비율 후보가 여러 개예요. 직접 확인해주세요.`);}
      }}
    }
    const values={},rawExtra={segments:{},segmentRatings:{},source:'photo'};
    for(const [key,list]of candidates){if(key.startsWith('segments.')&&blockedSegments.has(key.slice(9)))continue;const unique=[...new Set(list)];if(unique.length!==1){warnings.push(`${key.startsWith('segments.')?segmentNames[key.slice(9)]:key.startsWith('segmentRatings.')?segmentNames[key.slice(15)]:key}에 서로 다른 후보가 있어 자동 입력하지 않았어요.`);continue;}if(key.startsWith('segments.'))rawExtra.segments[key.slice(9)]=unique[0];else if(key.startsWith('segmentRatings.'))rawExtra.segmentRatings[key.slice(15)]=unique[0];else if(['sex','muscleControl','fatControl'].includes(key))rawExtra[key]=unique[0];else values[key]=unique[0];}
    const extra=sanitizeExtra(rawExtra),extraMatched=[];
    for(const key of ['sex','muscleControl','fatControl'])if(extra[key]!=null)extraMatched.push(key);
    for(const key of segmentKeys)if(extra.segments[key]!=null)extraMatched.push(`segments.${key}`);
    for(const key of segmentKeys)if(extra.segmentRatings[key]!=null)extraMatched.push(`segmentRatings.${key}`);
    if(extraMatched.some(key=>key.startsWith('segments.')))warnings.push('부위별 비율은 후보값입니다. 결과지의 체중 대비 하단 비율인지 확인해야 추천에 반영됩니다.');
    if(extraMatched.some(key=>key.startsWith('segmentRatings.')))warnings.push('부위별 평가는 후보값입니다. 부위별 근육·제지방 분석의 문구인지 확인해야 추천에 반영됩니다.');
    if(!values.date)warnings.push('검사일을 확실하게 읽지 못했어요. 사진의 측정 날짜를 직접 확인해주세요.');
    return {values,extra,matched:Object.keys(values),extraMatched,warnings:[...new Set(warnings)]};
  }

  function signature(measurement){const m=object(measurement),r=sanitizeExtra(m.report||m.extra);return `report-v2:${JSON.stringify([m.date||null,...['height','age','weight','muscle','fat'].map(k=>number(m[k])),r.sex,r.muscleControl,r.fatControl,...segmentKeys.map(k=>r.segments[k]),r.segmentReference,...segmentKeys.map(k=>r.segmentRatings[k]),r.ratingReference,r.source])}`;}
  function analyze(measurement,history=[]){
    const m=object(measurement),r=sanitizeExtra(m.report||m.extra),evidence=[],focusParts=[],missing=[];
    const base={weight:bounded(m.weight,30,250),muscle:bounded(m.muscle,5,100),fat:bounded(m.fat,3,65)};
    if(base.weight!=null)evidence.push({label:'체중',value:`${base.weight.toFixed(1)} kg`,explanation:'확인한 결과지의 측정값입니다.'});
    if(base.muscle!=null)evidence.push({label:'골격근량',value:`${base.muscle.toFixed(1)} kg`,explanation:'근력이나 실제 수행 능력과 같은 뜻은 아닙니다.'});
    if(base.fat!=null)evidence.push({label:'체지방률',value:`${base.fat.toFixed(1)} %`,explanation:'몸 전체의 체지방 비율이며 특정 부위의 지방 감소를 의미하지 않습니다.'});
    if(r.muscleControl!=null)evidence.push({label:'결과지 근육조절',value:`${signed(r.muscleControl)} kg`,explanation:'결과지에 인쇄된 조절량을 그대로 확인한 값입니다. 운동 중량 처방이 아닙니다.'});
    if(r.fatControl!=null)evidence.push({label:'결과지 지방조절',value:`${signed(r.fatControl)} kg`,explanation:'결과지에 인쇄된 지방 조절 방향을 운동 구성의 참고 정보로 사용합니다.'});
    const hasSegments=segmentKeys.some(k=>r.segments[k]!=null),hasRatings=segmentKeys.some(k=>r.segmentRatings[k]!=null);
    if(r.segmentReference==='bodyWeight'){
      for(const [part,keys]of [['arms',['rightArm','leftArm']],['core',['trunk']],['legs',['rightLeg','leftLeg']]]){
        const present=keys.filter(k=>r.segments[k]!=null);if(!present.length)continue;
        const ratio=Math.min(...present.map(k=>r.segments[k]));
        evidence.push({label:`${part==='arms'?'팔':part==='legs'?'하체':'몸통'} 제지방 비율`,value:present.map(k=>`${segmentNames[k]} ${r.segments[k].toFixed(1)}%`).join(' / '),explanation:'직접 확인한 체중 대비 하단 비율입니다. 제지방은 순수 근육이나 근력과 같지 않습니다.'});
        if(ratio<100)focusParts.push({part,ratio,segments:present,reason:`${present.filter(k=>r.segments[k]<100).map(k=>`${segmentNames[k]} ${r.segments[k].toFixed(1)}%`).join(', ')}로 결과지의 100% 기준 아래에 표시되어 해당 영역 동작을 우선 살펴봐요. 한쪽에 추가 중량을 지정하지는 않습니다.`});
      }
      focusParts.sort((a,b)=>a.ratio-b.ratio||a.part.localeCompare(b.part));
    }else if(hasSegments)missing.push('부위별 비율이 결과지의 체중 대비 하단 비율인지 확인해주세요. 확인 전에는 부위 추천에 쓰지 않습니다.');
    if(r.ratingReference==='lean'){
      for(const [part,keys]of [['arms',['rightArm','leftArm']],['core',['trunk']],['legs',['rightLeg','leftLeg']]]){
        const present=keys.filter(k=>r.segmentRatings[k]!=null);if(!present.length)continue;
        evidence.push({label:`${part==='arms'?'팔':part==='legs'?'하체':'몸통'} 결과지 평가`,value:present.map(k=>`${segmentNames[k]} ${ratingNames[r.segmentRatings[k]]}`).join(' / '),explanation:'부위별 근육·제지방 분석에 인쇄된 문구를 확인했어요. 문구를 임의의 비율이나 중량으로 바꾸지 않습니다.'});
        const conflicting=r.segmentReference==='bodyWeight'&&present.some(k=>r.segments[k]!=null&&((r.segmentRatings[k]==='low'&&r.segments[k]>=100)||(r.segmentRatings[k]!=='low'&&r.segments[k]<100)));
        if(conflicting){const index=focusParts.findIndex(p=>p.part===part);if(index>=0)focusParts.splice(index,1);missing.push(`${part==='arms'?'팔':part==='legs'?'하체':'몸통'}의 부위별 비율과 평가 문구가 달라요. 같은 근육·제지방 분석 영역인지 원본을 확인해주세요.`);continue;}
        const low=present.filter(k=>r.segmentRatings[k]==='low');
        if(low.length&&!focusParts.some(p=>p.part===part))focusParts.push({part,ratio:null,rating:'low',segments:low,reason:`${low.map(k=>segmentNames[k]).join('·')}이 결과지의 부위별 근육·제지방 분석에서 ‘표준 이하’로 표시되어, 전신 근력 운동 안에 해당 영역 동작을 우선 배치해요. 한쪽에 추가 중량을 지정하지는 않습니다.`});
      }
    }else if(hasRatings)missing.push('부위별 평가 문구가 결과지의 근육·제지방 분석에 적힌 값인지 확인해주세요. 체지방 분석의 평가는 추천에 쓰지 않습니다.');
    let strategy='insufficient',goal=null,summary='확인한 수치는 기록할 수 있지만, 자동으로 운동 방향을 정할 근거가 아직 부족해요.';
    const validBase=Object.values(base).every(v=>v!=null)&&base.muscle<base.weight*(1-base.fat/100);
    const adultSexReference=r.sex&&Number.isInteger(Number(m.age))&&Number(m.age)>=18&&Number(m.age)<=64?(r.sex==='male'?[10,20]:[18,28]):null;
    const controlImpossible=validBase&&([r.muscleControl,r.fatControl].some(value=>value!=null&&Math.abs(value)>=base.weight)||(r.fatControl!=null&&r.fatControl<0&&Math.abs(r.fatControl)>=base.weight*base.fat/100));
    const conflictingFatLoss=validBase&&adultSexReference&&base.fat<adultSexReference[0]&&r.fatControl<0;
    if(!validBase){focusParts.length=0;missing.push('체중·골격근량·체지방률의 값과 단위를 확인해주세요.');}
    else if(controlImpossible){focusParts.length=0;missing.push('조절량이 체중 또는 현재 체지방량과 맞지 않아요. 부호·단위·소수점을 원본과 다시 확인해주세요.');summary='결과지 조절량을 다시 확인해야 해서 분석 기반 운동 방향을 자동으로 적용하지 않아요.';}
    else if(conflictingFatLoss){focusParts.length=0;missing.push('체지방률이 성인 참고 범위 하단보다 낮지만 지방조절은 감소로 입력되어 있어요. 성별·체지방률·지방조절의 부호를 원본과 다시 확인해주세요.');summary='확인한 값들이 서로 다른 방향을 보여 지방 감량을 자동으로 추천하지 않아요.';}
    else if(r.muscleControl!=null||r.fatControl!=null){
      const muscle=r.muscleControl>0,fat=r.fatControl<0;
      // Product rule for routine composition, not a medical threshold or a target-setting formula.
      const minorFatAdjustment=muscle&&fat&&Math.abs(r.fatControl)<=0.5&&r.muscleControl>=Math.abs(r.fatControl)*5;
      strategy=muscle&&fat&&!minorFatAdjustment?'combined':muscle?'muscle':fat?'fat':'balance';
      summary=minorFatAdjustment?'결과지의 근육 증가 방향을 우선해 근력 운동 중심으로 구성해요. 작은 지방조절량 하나로 감량 중심 루틴을 선택하지 않습니다.':muscle&&fat?'결과지에 근육 증가와 지방 감소가 함께 표시되어, 전신 근력과 유산소를 함께 배치해요.':muscle?'결과지의 양수 근육조절량을 참고해 근력 운동을 중심으로 구성해요.':fat?'결과지의 음수 지방조절량을 참고해 근력 운동을 유지하며 유산소를 함께 배치해요.':'결과지 조절량에 근육 증가·지방 감소 방향이 표시되지 않아, 전신 균형 루틴을 사용해요.';
      if(minorFatAdjustment)evidence.push({label:'앱의 운동 구성 규칙',value:'근육 증가 방향 우선',explanation:'근육조절이 양수이고 지방 감소량이 0.5kg 이하이며, 근육 증가량이 그 5배 이상이면 근력 중심으로 구성합니다. 앱이 정한 구성 규칙이며 의학적 기준이나 달성 기간·목표 중량이 아닙니다.'});
    }else if(adultSexReference){
      const [low,high]=adultSexReference;
      evidence.push({label:'제조사 성인 체지방률 참고 범위',value:`${r.sex==='male'?'남성':'여성'} ${low}–${high}%`,explanation:'InBody 설명서의 일반 참고 범위입니다. 진단이나 개인별 목표 수치가 아닙니다.'});
      if(base.fat>high){strategy='fat';summary=`확인한 체지방률 ${base.fat.toFixed(1)}%가 제조사 성인 참고 범위의 상단 ${high}%보다 높게 표시되어, 근력과 유산소를 함께 구성해요.`;}
      else{strategy='balance';summary=base.fat<low?'체지방률이 제조사 참고 범위 하단보다 낮게 표시되어, 지방 감량을 우선하는 루틴을 자동 적용하지 않아요.':'체지방률이 제조사 일반 참고 범위 안에 표시되어, 특정 체중 조절을 단정하지 않고 전신 균형 루틴을 사용해요.';}
    }else if(focusParts.length){strategy='balance';summary='확인한 부위별 근육·제지방 정보를 참고해 전신 균형 루틴 안에서 해당 영역의 동작을 우선 배치해요.';}
    if(strategy==='insufficient'&&validBase)missing.push('결과지의 성별과 나이, 또는 근육조절·지방조절 수치를 확인하면 운동 방향을 정하는 데 사용할 수 있어요.');
    if(!hasSegments&&!hasRatings)missing.push('부위별 비율이나 평가 문구가 없어서 팔·몸통·하체 중 어느 영역을 우선할지는 자동으로 정하지 않아요. 원하는 부위는 직접 선택할 수 있습니다.');
    goal=strategy==='muscle'?'gain':strategy==='fat'||strategy==='combined'?'loss':strategy==='balance'?'balance':null;
    const title={muscle:'근력 중심으로 시작하기',fat:'근력과 유산소를 함께',combined:'근육 유지·증가와 지방 조절을 함께',balance:'전신 균형과 꾸준한 움직임',insufficient:'추천에 쓸 결과값을 먼저 확인해주세요'}[strategy];
    return {signature:signature(m),strategy,goal,title,summary,evidence,focusParts,missing,sources:[...SOURCES]};
  }
  function generate(measurement,prefs,history=[]){
    const analysis=analyze(measurement,history),input={...object(prefs)};
    if(analysis.goal)input.goal=analysis.goal;
    const routine=C.generateRoutine(input);
    if(analysis.strategy==='insufficient'){
      routine.reason.unshift('인바디에서 운동 방향을 정할 근거가 충분하지 않아, 현재 사용자가 선택한 운동 조건을 유지했어요.');
      return {analysis,routine};
    }
    let strengthIndex=0;
    routine.days=routine.days.map(day=>{
      if(day.type!=='strength'||!analysis.focusParts.length)return day;
      const priority=analysis.focusParts[strengthIndex++%analysis.focusParts.length],candidate=F.recommend(priority.part,input).exercises[0];
      if(!candidate)return day;
      const exercises=day.exercises.map(ex=>({...ex})),index=exercises.findIndex(ex=>ex.id===candidate.id);
      if(index>=0){const [target]=exercises.splice(index,1);exercises.unshift({...target,_analysis:true,_analysisPart:priority.part});}
      else{const baselineSets=exercises.at(-1)?.sets||2;exercises[exercises.length-1]={...candidate,sets:baselineSets,_analysis:true,_analysisPart:priority.part};}
      return {...day,exercises};
    });
    routine.title=`인바디 분석 · ${analysis.title}`;
    routine.reason=routine.reason.filter(text=>!text.startsWith('체성분 수치는 변화 추적에 쓰며'));
    routine.reason.unshift(analysis.summary);
    if(analysis.focusParts.length)routine.reason.push(`확인한 부위별 근육·제지방 정보를 참고해 ${analysis.focusParts.map(p=>p.part==='arms'?'팔':p.part==='legs'?'하체':'몸통').join('·')} 동작의 순서 또는 일부 구성을 바꿨어요. 동작 수·운동 시간·세트 수는 기본 조건 안에서 유지합니다.`);
    routine.reason.push('이 운동 구성은 확인한 결과값을 참고한 앱의 규칙입니다. 제조사의 운동 처방이나 의학적 진단이 아니며, 비율로 수행 능력·통증 원인을 단정하거나 한쪽에 추가 중량을 지정하지 않습니다.');
    return {analysis,routine};
  }
  return {sanitizeExtra,parse,analyze,generate,signature,sources:[...SOURCES]};
});
