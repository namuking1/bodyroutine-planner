const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('./dist/core.js');
const R = require('./dist/report.js');
const base = (report = {}) => ({id:'m-test', date:C.today(), height:170, age:28, weight:65, muscle:27, fat:24, report});
const prefs = {goal:'balance', level:'beginner', days:3, minutes:40, place:'home', equipment:'none'};
const counts = routine => ({strength:routine.days.filter(d=>d.type==='strength').length,cardio:routine.days.filter(d=>d.type==='cardio').length});

test('extra metadata keeps only canonical optional values without inventing missing fields', () => {
  const raw={sex:'male',muscleControl:'+ 1.5',fatControl:'−3,0',segments:{rightArm:'95.5',leftArm:999,trunk:99,rightLeg:null},segmentReference:'bodyWeight',source:'photo',name:'private'};
  const copy=JSON.stringify(raw),clean=R.sanitizeExtra(raw);
  assert.equal(clean.muscleControl,1.5);assert.equal(clean.fatControl,-3);
  assert.equal(clean.segments.rightArm,95.5);assert.equal(clean.segments.leftArm,null);
  assert.equal(clean.segments.leftLeg,null);assert.equal(clean.segmentReference,'bodyWeight');
  assert(!Object.hasOwn(clean,'name'));assert.equal(JSON.stringify(raw),copy);
  assert.equal(R.sanitizeExtra({sex:'unknown',muscleControl:Infinity,segmentReference:'height'}).sex,null);
  assert.equal(R.sanitizeExtra({segmentReference:'height'}).segmentReference,null);
});

test('photo text parses Korean values, signed controls and lean percentages but excludes segmental fat', () => {
  const result=R.parse(`신장 170.0\n나이 28\n성별 남성\n검사일시 ${C.today().replaceAll('-','.')} 10:00\n체중 (kg) 65.0\n골격근량 (kg) 27.0\n체지방률 (%) 24.0\n체중조절\n근육조절 +1.5kg\n지방조절 -3.0kg\n부위별 근육분석\n오른팔 2.80kg 95.0%\n왼팔 2.70kg 93.0%\n몸통 22.0kg 102.0%\n오른다리 7.2kg 98.0%\n왼다리 7.1kg 97.0%\n부위별 체지방분석\n오른팔 1.0kg 150.0%\n왼팔 1.0kg 160.0%`);
  assert.deepEqual(result.values,{height:170,age:28,weight:65,muscle:27,fat:24,date:C.today()});
  assert.equal(result.extra.sex,'male');assert.equal(result.extra.muscleControl,1.5);assert.equal(result.extra.fatControl,-3);
  assert.equal(result.extra.segments.rightArm,95);assert.equal(result.extra.segments.leftArm,93);
  assert.equal(result.extra.segmentReference,null);
  assert(result.warnings.some(w=>w.includes('하단')));
});

test('English labels and explicit measurement dates parse with decimal commas', () => {
  const out=R.parse(`Height 170cm\nAge 28\nGender Female\nWeight 65,0\nSMM 27,0\nPBF 24,0\nTest Date: 2025/12/01\nMuscle Control (kg): +2,0\nFat Control (kg): -4,5\nSegmental Lean Analysis\nRight Arm 2.9kg 101.0%\nLeft Leg 7.3kg 91.5%`);
  assert.equal(out.extra.sex,'female');assert.equal(out.values.date,'2025-12-01');
  assert.equal(out.extra.fatControl,-4.5);assert.equal(out.extra.segments.leftLeg,91.5);
});

test('kg-only regional rows and percentages outside a lean section are never treated as lean ratios', () => {
  const out=R.parse('오른팔 90%\n왼팔 95%\n부위별 근육분석\n오른다리 7.5kg\n부위별 체지방분석\n몸통 120%');
  assert(segmentKeys(out.extra.segments).every(v=>v===null));
});
function segmentKeys(s){return Object.values(s)}

test('contradictory values and multiple regional reference percentages require manual entry', () => {
  const out=R.parse('성별 남\n성별 여\n근육조절 +1.5kg\n근육조절 +2.0kg\n부위별 근육분석\n오른팔 2.5kg 95% 85%\n왼팔 2.8kg 96%\n왼팔 2.9kg 97%');
  assert.equal(out.extra.sex,null);assert.equal(out.extra.muscleControl,null);
  assert.equal(out.extra.segments.rightArm,null);assert.equal(out.extra.segments.leftArm,null);
  assert(out.warnings.length>=3);
});

test('explicit impossible, future, or conflicting dates are not guessed', () => {
  assert.equal(R.parse('검사일 2025.02.30').values.date,undefined);
  assert.equal(R.parse('검사일 2999.01.01').values.date,undefined);
  assert.equal(R.parse('검사일 2025.01.01\n측정일 2025.02.01').values.date,undefined);
  assert.equal(R.parse('이름 2025.01.01').values.date,undefined);
  assert.equal(R.parse('목표 측정일 2025.01.01').values.date,undefined);
});

test('reference intervals and target regional values are not treated as measured percentages', () => {
  const out=R.parse('부위별 근육분석\n목표 오른팔 100%\n왼팔 표준 100%\n몸통 90~110%\n오른다리 90-110%');
  assert(Object.values(out.extra.segments).every(v=>v===null));
});

test('two-reference text stays rejected even if word geometry exposes only one candidate', () => {
  const word=(text,x,y,width=40)=>({text,bbox:{x0:x,y0:y,x1:x+width,y1:y+16}});
  const words=[word('부위별 근육분석',100,10,150),word('오른팔',100,60),word('95%',100,82)];
  const out=R.parse('부위별 근육분석\n오른팔 2.5kg 95% 85%',words);
  assert.equal(out.extra.segments.rightArm,null);
});

test('OCR word geometry can recover label-above-value header cells without borrowing neighboring fields', () => {
  const word=(text,x,y,width=35)=>({text,bbox:{x0:x,y0:y,x1:x+width,y1:y+16}});
  const words=[word('신장',100,10),word('나이',220,10),word('성별',300,10),word('170cm',100,35,50),word('28',223,35,20),word('여',307,35,16)];
  const out=R.parse('신장 나이 성별\n170cm 28 여',words);
  assert.equal(out.values.height,170);assert.equal(out.values.age,28);assert.equal(out.extra.sex,'female');
});

test('printed control signs choose muscle, fat and combined strategies and actually change weekly composition', () => {
  const muscle=R.generate(base({muscleControl:2,fatControl:0}),prefs);
  const fat=R.generate(base({muscleControl:0,fatControl:-3}),prefs);
  const combined=R.generate(base({muscleControl:1,fatControl:-3}),prefs);
  assert.equal(muscle.analysis.strategy,'muscle');assert.equal(fat.analysis.strategy,'fat');assert.equal(combined.analysis.strategy,'combined');
  assert.deepEqual(counts(muscle.routine),{strength:3,cardio:0});
  assert.deepEqual(counts(fat.routine),{strength:2,cardio:1});
  assert.equal(combined.analysis.goal,'loss');assert.equal(combined.routine.days.length,7);
});

test('reported control direction takes priority over generic reference ranges and never treats fat gain as fat loss', () => {
  assert.equal(R.analyze(base({sex:'male',muscleControl:1,fatControl:0})).strategy,'muscle');
  assert.equal(R.analyze(base({sex:'male',fatControl:2})).strategy,'balance');
  assert.equal(R.analyze(base({muscleControl:0,fatControl:0})).strategy,'balance');
});

test('adult sex-specific reference changes strategy while unknown sex or nonadult age does not guess a range', () => {
  assert.equal(R.analyze(base({sex:'male'})).strategy,'fat');
  assert.equal(R.analyze(base({sex:'female'})).strategy,'balance');
  assert.equal(R.analyze(base({})).strategy,'insufficient');
  assert.equal(R.analyze({...base({sex:'male'}),age:null}).strategy,'insufficient');
  assert.equal(R.analyze({...base({sex:'male'}),age:17}).strategy,'insufficient');
  assert.equal(R.analyze({...base({sex:'male'}),fat:8}).strategy,'balance');
});

test('regional candidates do not affect recommendations until current-body-weight reference is confirmed', () => {
  const candidate=base({segments:{leftLeg:80,rightLeg:82}});
  assert.deepEqual(R.analyze(candidate).focusParts,[]);assert.equal(R.analyze(candidate).strategy,'insufficient');
  candidate.report.segmentReference='bodyWeight';
  const analysis=R.analyze(candidate);assert.equal(analysis.strategy,'balance');assert.equal(analysis.focusParts[0].part,'legs');
  assert.equal(analysis.focusParts[0].ratio,80);
});

test('five segments map only to arms, core and legs without inventing chest, back, shoulder or unilateral loading', () => {
  const result=R.analyze(base({segments:{rightArm:90,leftArm:98,trunk:95,rightLeg:97,leftLeg:96},segmentReference:'bodyWeight'}));
  assert.deepEqual(result.focusParts.map(p=>p.part),['arms','core','legs']);
  assert(!JSON.stringify(result.focusParts).includes('chest'));
  assert(result.focusParts.every(p=>p.reason.includes('한쪽')));
  assert.equal(R.analyze(base({segments:{rightArm:100,leftArm:105},segmentReference:'bodyWeight'})).focusParts.length,0);
});

test('different confirmed low regions change actual selected exercises without raising day count, time or sets', () => {
  const arms=R.generate(base({segments:{rightArm:85},segmentReference:'bodyWeight'}),prefs).routine;
  const legs=R.generate(base({segments:{rightLeg:85},segmentReference:'bodyWeight'}),prefs).routine;
  const baseline=C.generateRoutine(prefs);
  assert.notDeepEqual(arms.days[0].exercises.map(e=>e.id),legs.days[0].exercises.map(e=>e.id));
  for(const routine of [arms,legs])for(let i=0;i<7;i++){
    assert.equal(routine.days[i].duration,baseline.days[i].duration);
    assert.equal(routine.days[i].exercises.length,baseline.days[i].exercises.length);
    assert.deepEqual(routine.days[i].exercises.map(e=>e.sets).sort(),baseline.days[i].exercises.map(e=>e.sets).sort());
  }
  assert(arms.days[0].exercises.some(e=>e._analysis&&e._analysisPart==='arms'));
  assert(legs.days[0].exercises.some(e=>e._analysis&&e._analysisPart==='legs'));
});

test('missing evidence keeps user-selected routine and invalid base values do not auto-apply a strategy', () => {
  const chosen={...prefs,goal:'gain'},out=R.generate(base(),chosen);
  assert.equal(out.analysis.goal,null);assert.deepEqual(counts(out.routine),counts(C.generateRoutine(chosen)));
  const invalid=R.analyze({...base({muscleControl:2,segments:{rightArm:80},segmentReference:'bodyWeight'}),muscle:64});
  assert.equal(invalid.strategy,'insufficient');assert.deepEqual(invalid.focusParts,[]);
  assert(out.analysis.missing.length>0);
});

test('low reference body fat conflicting with a printed fat-loss amount requires rechecking rather than auto-fat-loss', () => {
  const out=R.generate({...base({sex:'male',fatControl:-1,segments:{leftLeg:80},segmentReference:'bodyWeight'}),fat:8},prefs);
  assert.equal(out.analysis.strategy,'insufficient');assert.equal(out.analysis.goal,null);
  assert.deepEqual(out.analysis.focusParts,[]);assert(out.analysis.missing.some(text=>text.includes('부호')));
});

test('physically inconsistent control magnitudes never create automatic recommendations', () => {
  assert.equal(R.analyze(base({muscleControl:65})).strategy,'insufficient');
  assert.equal(R.analyze(base({fatControl:-65})).strategy,'insufficient');
  assert.equal(R.analyze(base({fatControl:-16})).strategy,'insufficient');
});

test('signature changes for confirmed evidence edits, ignores storage timestamp, and APIs do not mutate inputs', () => {
  const m=base({sex:'male',segments:{rightLeg:90},segmentReference:'bodyWeight'}),before=JSON.stringify(m),p=JSON.stringify(prefs);
  assert.equal(R.signature(m),R.signature({...m,at:123}));
  assert.notEqual(R.signature(m),R.signature({...m,report:{...m.report,fatControl:-2}}));
  const out=R.generate(m,prefs);out.routine.days[0].exercises[0].name='changed';
  assert.equal(JSON.stringify(m),before);assert.equal(JSON.stringify(prefs),p);
  assert.notEqual(R.generate(m,prefs).routine.days[0].exercises[0].name,'changed');
});

test('qualitative metadata keeps printed categories without inventing percentages', () => {
  const raw={segmentRatings:{rightArm:'low',leftArm:'normal',trunk:'high',rightLeg:80,leftLeg:'unknown'},ratingReference:'lean'};
  const clean=R.sanitizeExtra(raw);
  assert.deepEqual(clean.segmentRatings,{rightArm:'low',leftArm:'normal',trunk:'high',rightLeg:null,leftLeg:null});
  assert.equal(clean.ratingReference,'lean');
  assert(Object.values(clean.segments).every(value=>value===null));
  assert.equal(R.sanitizeExtra({...raw,ratingReference:'fat'}).ratingReference,null);
});

test('named lean category rows parse independently of percentages and exclude fat ratings', () => {
  const out=R.parse('부위별 근육분석\n오른팔 표준 이하\n왼팔 표준이하\n몸통 표준\n오른다리 표준 이상\n왼다리 표준\n부위별 체지방분석\n오른팔 표준 이상\n왼팔 표준 이상');
  assert.deepEqual(out.extra.segmentRatings,{rightArm:'low',leftArm:'low',trunk:'normal',rightLeg:'high',leftLeg:'normal'});
  assert.equal(out.extra.ratingReference,null);
  assert(Object.values(out.extra.segments).every(value=>value===null));
  assert(out.extraMatched.includes('segmentRatings.leftArm'));
  const ambiguous=R.parse('부위별 근육분석 부위별 체지방분석\n오른팔 표준이하 표준\n왼팔 표준이하 표준');
  assert(Object.values(ambiguous.extra.segmentRatings).every(value=>value===null));
});

test('conflicting categories and target rows stay blank rather than choosing a plausible rating', () => {
  const out=R.parse('부위별 근육분석\n오른팔 표준 이하\n오른팔 표준\n목표 왼팔 표준\n몸통 정상\n부위별 체지방분석\n왼다리 표준 이하');
  assert(Object.values(out.extra.segmentRatings).every(value=>value===null));
  assert(out.warnings.some(value=>value.includes('서로 다른')));
});

test('printed lean ratings require confirmation and confirmed low arms change real exercise selection', () => {
  const record=base({segmentRatings:{rightArm:'low',leftArm:'low',trunk:'normal',rightLeg:'normal',leftLeg:'normal'}});
  const unconfirmed=R.analyze(record);
  assert.deepEqual(unconfirmed.focusParts,[]);assert.equal(unconfirmed.strategy,'insufficient');
  record.report.ratingReference='lean';
  const out=R.generate(record,prefs);
  assert.equal(out.analysis.strategy,'balance');
  assert.deepEqual(out.analysis.focusParts.map(part=>part.part),['arms']);
  assert.equal(out.analysis.focusParts[0].ratio,null);
  assert(out.analysis.evidence.some(row=>row.label==='팔 결과지 평가'&&row.value.includes('표준 이하')));
  assert(out.routine.days.some(day=>day.exercises.some(ex=>ex._analysisPart==='arms')));
  assert.notEqual(R.signature(record),R.signature({...record,report:{...record.report,ratingReference:null}}));
});

test('conflicting confirmed percent and qualitative rating does not prioritize that region', () => {
  const lowTextHighNumber=R.analyze(base({segments:{rightArm:110},segmentReference:'bodyWeight',segmentRatings:{rightArm:'low'},ratingReference:'lean'}));
  const normalTextLowNumber=R.analyze(base({segments:{rightLeg:85},segmentReference:'bodyWeight',segmentRatings:{rightLeg:'normal'},ratingReference:'lean'}));
  for(const out of [lowTextHighNumber,normalTextLowNumber]){
    assert.deepEqual(out.focusParts,[]);assert(out.missing.some(text=>text.includes('평가 문구')));
  }
});

test('minor fat adjustment no longer overrides a dominant positive muscle control', () => {
  const out=R.generate(base({muscleControl:3.5,fatControl:-0.2}),prefs);
  assert.equal(out.analysis.strategy,'muscle');assert.equal(out.analysis.goal,'gain');
  assert.deepEqual(counts(out.routine),{strength:3,cardio:0});
  assert(out.analysis.evidence.some(row=>row.label==='앱의 운동 구성 규칙'&&row.explanation.includes('의학적 기준')));
  assert.equal(R.analyze(base({muscleControl:0.2,fatControl:-0.3})).strategy,'combined');
  assert.equal(R.analyze(base({muscleControl:3.5,fatControl:-0.6})).strategy,'combined');
});
