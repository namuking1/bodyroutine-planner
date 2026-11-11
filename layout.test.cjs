const test=require('node:test');
const assert=require('node:assert/strict');
const L=require('./dist/report-layout.js');
const w=(text,x,y,width=60,h=20,extra={})=>({text,bbox:{x0:x,y0:y,x1:x+width,y1:y+h},...extra});
const geometry={width:1600,height:2255};
function sheet(){return [
  w('InBody270',840,90,150),w('신장',340,145),w('나이',515,145),w('성별',630,145),w('검사일시',745,145,110),
  w('178cm',340,185,80),w('25',515,185,35),w('남성',630,185,50),w('2025.07.03.',745,185,190),
  w('체중',510,540),w('58.2',745,540),w('(58.0~79.0)',830,540,145),w('68.5',1270,540),
  w('체중',50,735),w('70',270,740,30),w('100',470,740,30),w('58.6',415,765),
  w('골격근량',50,800,160),w('70',270,810,30),w('100',470,810,30),w('26.8',360,830),
  w('체지방률',50,1145,160),w('5.0',270,1150,35),w('10.0',335,1150,40),w('18.4',420,1175),
  w('근육조절',1040,630,120),w('+',1250,630,15),w('9.8',1280,630),
  w('지방조절',1040,597,120),w('-',1250,597,15),w('0.2',1280,597),
  w('부위별근육분석',45,1290,200),w('부위별체지방분석',535,1290,230),
  w('표준이하',110,1430,95),w('표준이하',335,1430,95),
  w('왼',50,1550,25),w('표준',240,1550,60),w('오른',440,1550,50),
  w('표준',130,1670,60),w('표준',355,1670,60),
  w('표준이상',590,1430,95),w('표준이상',820,1430,95),w('표준이상',710,1550,95),
  w('신체변화',45,1880,130),w('52.2',250,1940),w('표준',130,2010,60)
];}

test('270 spatial header restores label-above-value fields and isolates diagram ratings from fat/history',()=>{
 const out=L.extract('[InBody270]',sheet(),geometry);
 assert.equal(out.values.height,178);assert.equal(out.values.age,25);assert.equal(out.values.date,'2025-07-03');
 assert.equal(out.extra.sex,'male');assert.equal(out.extra.muscleControl,9.8);assert.equal(out.extra.fatControl,-.2);
 assert.deepEqual(out.extra.segmentRatings,{trunk:'normal',leftArm:'low',rightArm:'low',leftLeg:'normal',rightLeg:'normal'});
 assert.equal(out.values.muscle,26.8);
 // The chart value band excludes the composition table's conflicting OCR value.
 assert.equal(out.values.weight,58.6);
});

test('number-region candidates override conflicting whole-sheet OCR while warning for review',()=>{
 const words=sheet();words.find(word=>word.text==='58.6').text='58.2';words.push(w('58.6',415,765,60,20,{region:'weight',confidence:91}),w('26.8',360,830,60,20,{region:'muscle',confidence:94}),w('18.4',420,1175,60,20,{region:'fat',confidence:19}));
 const out=L.extract('[InBody270]',words,geometry);
 assert.equal(out.values.weight,58.6);assert.equal(out.values.muscle,26.8);assert.equal(out.values.fat,18.4);
 assert(out.warnings.some(message=>message.includes('체중')&&message.includes('확대')));
});

test('recognized template restores header even if the small Korean header labels fail OCR',()=>{
 const words=sheet().filter(word=>!['신장','나이','성별','검사일시'].includes(word.text));
 const out=L.extract('[InBody270]',words,geometry);
 assert.equal(out.values.height,178);assert.equal(out.values.age,25);assert.equal(out.extra.sex,'male');assert.equal(out.values.date,'2025-07-03');
 assert.equal(L.extract('',words.filter(word=>word.text!=='InBody270'),geometry).values.height,undefined);
});

test('split Korean heading and ratings still form a lean diagram without relying on a numerical percentage',()=>{
 const words=sheet().filter(word=>!['부위별근육분석','표준이하','왼'].includes(word.text));
 words.push(w('부',51,1289,20,12),w('위',79,1288,21,29),w('별',105,1288,23,15),w('근',134,1289,24,15),w('육',164,1288,19,12),w('분석',190,1288,50,23));
 // A tall adjacent-column label must not pull the taller Korean glyphs away.
 words.push(w('운동',1040,1266,80,43));
 for(const x of [102,330])words.push(w('표',x,1431,23,18),w('준',x+30,1430,21,21),w('이하',x+57,1428,49,24));
 const out=L.extract('[InBody270]',words,geometry);
 assert.equal(out.extra.segmentRatings.leftArm,'low');assert.equal(out.extra.segmentRatings.rightArm,'low');assert.equal(out.extra.segmentRatings.trunk,'normal');
});

test('ambiguous diagram orientation rejects asymmetric limb assignments but keeps trunk',()=>{
 const words=sheet().filter(word=>!['왼','오른'].includes(word.text));words.find(word=>word.text==='표준이하'&&word.bbox.x0===335).text='표준';
 const out=L.extract('[InBody270]',words,geometry);
 assert.equal(out.extra.segmentRatings.leftArm,undefined);assert.equal(out.extra.segmentRatings.rightArm,undefined);assert.equal(out.extra.segmentRatings.trunk,'normal');
 assert(out.warnings.some(message=>message.includes('좌우')));
});

test('browser OCR with overlapping heading glyphs still resolves the established lean column',()=>{
 const words=sheet().filter(word=>word.text!=='부위별근육분석');
 words.push(w('으',79,1288,14,13),w('으',162,1288,21,12),w('브',194,1288,16,12),w('부',47,1289,49,28),w('위',81,1284,29,41),w('별',109,1288,19,29),w('근',140,1289,18,27),w('육',168,1302,18,15),w('분석',187,1288,53,29),w('omental',261,1284,64,41),w('Lean',333,1304,31,12),w('Analysis',373,1303,54,13));
 const out=L.extract('[InBody270]',words,geometry);
 assert.deepEqual(out.extra.segmentRatings,{trunk:'normal',leftArm:'low',rightArm:'low',leftLeg:'normal',rightLeg:'normal'});
 // A loose English fragment must not establish a template on an unknown sheet.
 const unknown=L.extract('',words.filter(word=>word.text!=='InBody270'),geometry);
 assert.deepEqual(unknown.extra.segmentRatings,{});
});

test('height enlargement restores a corrupted cm token without guessing its digits',()=>{
 const words=sheet();words.find(word=>word.text==='178cm').text='17800';
 assert.equal(L.extract('[InBody270]',words,geometry).values.height,undefined);
 words.push(w('178cm',340,185,80,20,{region:'height'}));
 assert.equal(L.extract('[InBody270]',words,geometry).values.height,178);
});

test('incomplete diagrams, missing lean headings and pure fat diagrams never become muscle ratings',()=>{
 assert.deepEqual(L.extract('',sheet().filter(word=>word.text!=='부위별근육분석'),geometry).extra.segmentRatings,{});
 assert.deepEqual(L.extract('',sheet().filter(word=>!(word.bbox.x0===335&&word.text==='표준이하')),geometry).extra.segmentRatings,{});
 assert.deepEqual(L.extract('부위별 체지방분석',[w('부위별체지방분석',40,100,220),w('표준이하',100,200)],geometry).extra.segmentRatings,{});
});

test('reference intervals and neighboring columns are not numeric measurements',()=>{
 const words=[w('체중',50,100),w('(',300,100,8),w('57.5',320,100),w('~',385,100,12),w('75.0',405,100),w(')',470,100,8)];
 assert.equal(L.extract('',words).values.weight,undefined);
 assert.equal(L.extract('',[w('체지방률',40,100,150),w('10',240,100),w('20',310,100)]).values.fat,undefined);
});

test('270 graph ticks and a plausible integer OCR fragment do not become a measured body-fat value',()=>{
 const words=sheet().filter(word=>word.text!=='18.4');words.push(w('9',478,1175,20));
 const out=L.extract('[InBody270]',words,geometry);
 assert.equal(out.values.fat,undefined);
 // A failed enlarged pass must also stay empty rather than accepting the fragment.
 words.push(w('9',478,1175,20,20,{region:'fat'}));
 assert.equal(L.extract('[InBody270]',words,geometry).values.fat,undefined);
});

test('crop plans require a recognized template, preserve bounds and omit unknown layouts',()=>{
 const regions=L.planRegions(sheet(),geometry,'[InBody270]');
 assert.equal(regions.length,4);assert.deepEqual(regions.map(region=>region.id),['height','weight','muscle','fat']);
 assert.equal(regions[0].x,330);assert.equal(regions[0].y,178);assert.equal(regions[0].width,110);assert.equal(regions[0].height,35);
 assert.equal(regions[3].y,1170);assert.equal(regions[3].height,28);
 assert(regions.every(region=>region.x>=0&&region.y>=0&&region.x+region.width<=geometry.width&&region.y+region.height<=geometry.height));
 assert.deepEqual(L.planRegions(sheet(),{width:1600,height:900},'[InBody270]'),[]);
 assert.deepEqual(L.planRegions([w('InBody270',0,0)],geometry,'InBody270'),[]);
});
