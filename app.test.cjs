'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const core = require('./dist/core.js');
const focus = require('./dist/focus.js');
const report = require('./dist/report.js');
const reportViewSource = fs.readFileSync(require.resolve('./dist/report-view.js'), 'utf8');
const focusViewSource = fs.readFileSync(require.resolve('./dist/focus-view.js'), 'utf8');
const source = fs.readFileSync(require.resolve('./dist/app.js'), 'utf8');
const STORE = 'bodyroutine.app.v3', LEGACY = 'bodyroutine.records.v1';

// Minimal document fixtures exercise state transitions and event handlers, not browser layout.
function app(seed = {}, { quota = false, search = '', hash = '' } = {}) {
  const nodes = new Map(), listeners = {}, windowListeners = {}, writes = [];
  const data = new Map(Object.entries(seed));
  let timer = 0;
  function node(id = '') {
    const attrs = {}, handlers = {}, children = new Set();
    let html = '';
    const item = { id, value: '', checked: false, hidden: false, open: false, disabled: false, textContent: '', style: {}, dataset: {},
      classList: { add() {}, remove() {}, contains() { return false; } },
      setAttribute(name, value) { attrs[name] = String(value); },
      getAttribute(name) { return attrs[name] ?? null; },
      addEventListener(name, fn) { (handlers[name] ||= []).push(fn); },
      querySelector(selector) { if (selector === '[aria-invalid=true]') return [...nodes.values()].find(n => n.getAttribute('aria-invalid') === 'true') || null; return null; },
      focus() {}, showModal() { item.open = true; }, close() { item.open = false; }, click() { if (item.onclick) item.onclick(); },
      closest() { return item; }
    };
    Object.defineProperty(item, 'innerHTML', { get: () => html, set(value) {
      for (const child of children) nodes.delete(child); children.clear(); html = String(value);
      for (const match of html.matchAll(/<[a-z][\w-]*\b([^>]*\bid="([^"]+)"[^>]*)>/gi)) {
        const childId = match[2], attributes = match[1], child = node(childId);
        child.value = attributes.match(/\bvalue="([^"]*)"/)?.[1] || '';
        child.hidden = /(?:^|\s)hidden(?:\s|$)/.test(attributes);
        child.checked = /(?:^|\s)checked(?:\s|$)/.test(attributes);
        child.disabled = /(?:^|\s)disabled(?:\s|$)/.test(attributes);
        for (const entry of attributes.matchAll(/\bdata-([a-z-]+)="([^"]*)"/g)) child.dataset[entry[1].replace(/-([a-z])/g, (_,c) => c.toUpperCase())] = entry[2];
        nodes.set(childId, child); children.add(childId);
      }
    }});
    return item;
  }
  for (const id of ['navigation','bottomNavigation','breadcrumb','todayLabel','demoBanner','content','importFile','appDialog','dialogContent','toast']) nodes.set(id,node(id));
  const localStorage = {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key,value) { if (quota) throw new Error('QuotaExceededError'); data.set(key,String(value)); writes.push({key,value:String(value)}); },
    removeItem(key) { data.delete(key); }
  };
  const document = { getElementById:id => nodes.get(id) || null, addEventListener(name,fn) { (listeners[name] ||= []).push(fn); }, createElement:tag => node(tag), head: { append() {} } };
  const window = { BodyCore:core, BodyFocus:focus, InBodyReport:report, addEventListener(name,fn) { (windowListeners[name] ||= []).push(fn); }, scrollTo() {}, print() {} };
  const location = { hash, search };
  const context = vm.createContext({ window, document, localStorage, location, Date, Intl, URL, URLSearchParams, Blob, console, setTimeout:()=>++timer, clearTimeout() {} });
  vm.runInContext(focusViewSource,context,{filename:'dist/focus-view.js'});
  vm.runInContext(reportViewSource,context,{filename:'dist/report-view.js'});
  vm.runInContext(source,context,{filename:'dist/app.js'});
  const run = code => vm.runInContext(code,context);
  const plain = code => JSON.parse(run(`JSON.stringify(${code})`));
  function click(action, extra = {}) { const button = node(); button.dataset = { action, ...extra }; for (const handler of listeners.click || []) handler({target:button}); }
  function submit(id) { const form = nodes.get(id); assert(form,`${id} must be open`); for (const handler of listeners.submit || []) handler({target:form,preventDefault(){}}); }
  return { context,run,plain,nodes,data,writes,click,submit,toast:()=>nodes.get('toast').textContent };
}
function record(date = core.today(), overrides = {}) { return {id:`m-${date}`,date,height:170,age:28,weight:65,muscle:27,fat:24,at:10,...overrides}; }
function stored(measurements, extras = {}) { return JSON.stringify({version:3,measurements,prefs:{goal:'balance',level:'beginner',days:3,place:'home',minutes:40,equipment:'none'},goal:null,logs:{},...extras}); }
function fillMeasurement(a, changes = {}) {
  const values = {mdate:core.today(),height:'170',age:'28',weight:'65',muscle:'27',fat:'24',...changes};
  for(const [key,value] of Object.entries(values)) a.nodes.get(key).value=value;
}

test('legacy v1 records migrate without invented height or age and survive a later reload', () => {
  const legacy = [{date:'2026-01-01',weight:66,muscle:27,fat:25,at:1},{date:'2026-02-01',weight:65,muscle:27.2,fat:24,at:2}];
  const a = app({[LEGACY]:JSON.stringify(legacy)});
  const migrated = a.plain('state.measurements');
  assert.equal(migrated.length,2);
  assert.equal(migrated[0].date,'2026-02-01');
  assert.equal(migrated[0].height,null);
  assert.equal(migrated[0].age,null);
  assert.equal(core.computed(migrated[0]).bmi,null);
  assert.match(a.run('composition()'),/키 미등록/);
  a.run('persist()');
  assert.equal(a.data.get(LEGACY),JSON.stringify(legacy),'migration leaves original backup available');
  const reloaded=app(Object.fromEntries(a.data));
  assert.deepEqual(reloaded.plain('state.measurements'),migrated);
});

test('v3 valid measurements survive null preferences with safe default settings', () => {
  const a=app({[STORE]:stored([record()],{prefs:null})});
  assert.equal(a.plain('state.measurements').length,1);
  assert.equal(a.plain('state.measurements')[0].weight,65);
  assert.equal(a.run('state.prefs.goal'),'balance');
  assert.equal(a.run('storageAvailable'),true);
});

test('demo starts with latest measurement first, an oldest-record goal baseline and ordered trends', () => {
  const a=app(); a.click('demo');
  const measurements=a.plain('active().measurements');
  assert.equal(measurements[0].date,core.today());
  assert.equal(a.run('active().goal.startDate'),measurements.at(-1).date);
  assert.equal(a.run('active().goal.startValue'),measurements.at(-1).muscle);
  const trend=a.plain('filteredRecords()');
  assert.equal(trend[0].date,measurements.at(-1).date);
  assert.equal(trend.at(-1).date,core.today());
  assert.match(a.run('composition()'),new RegExp(String(measurements[0].weight.toFixed(1))));
});

test('demo mutations stay out of actual state and persistent storage', () => {
  const initial=stored([record('2026-01-01')]);
  const a=app({[STORE]:initial});
  const actual=a.plain('state');
  a.click('demo');
  a.run("demoState.measurements[0].weight=72; demoState.prefs.days=5; persist()");
  a.click('complete',{exercise:'leg-press'});
  assert.deepEqual(a.plain('state'),actual);
  assert.equal(a.data.get(STORE),initial);
  assert.equal(a.writes.length,0);
  a.click('exit-demo');
  assert.equal(a.run('demo'),false);
  assert.deepEqual(a.plain('active()'),actual);
});

test('quota failure on measurement save stays explicit and never claims durable success', () => {
  const a=app({}, {quota:true});
  a.click('measurement');fillMeasurement(a);a.submit('measurementForm');
  assert.equal(a.run('state.measurements.length'),1,'in-memory entry remains available for export');
  assert.equal(a.data.has(STORE),false);
  assert.equal(a.run('storageAvailable'),false);
  assert.match(a.toast(),/저장 공간을 사용할 수 없어/);
  assert.doesNotMatch(a.toast(),/측정값을 저장했어요/);
});

test('quota failure on preferences and workout completion also keeps a failure message', () => {
  const a=app({}, {quota:true});
  a.click('preferences');
  for(const [id,value] of Object.entries({pgoal:'gain',plevel:'regular',pdays:'4',pminutes:'60',pplace:'gym',pequipment:'none'}))a.nodes.get(id).value=value;
  a.submit('prefsForm');
  assert.match(a.toast(),/저장 공간을 사용할 수 없어/);
  assert.doesNotMatch(a.toast(),/루틴을 조정했어요/);
  a.click('complete',{exercise:'leg-press'});
  assert.match(a.toast(),/저장 공간을 사용할 수 없어/);
  assert.doesNotMatch(a.toast(),/완료한 동작으로 기록했어요/);
});

test('changing workout equipment keeps previous exercises and recorded volume visible', () => {
  const a=app();
  a.run("weekOffset=-1; dayIndex=0; state.prefs=cleanPrefs({days:3,place:'home',equipment:'band',minutes:40}); const logDate=shifted(currentWeek(),dayIndex); state.logs[logDate]={'band-row':{done:true,sets:3,reps:12,weight:7.5,minutes:null}};");
  assert.match(a.run('workout()'),/밴드 로우/);
  a.run("state.prefs=cleanPrefs({...state.prefs,equipment:'none'})");
  const rendered=a.run('workout()');
  assert.match(rendered,/밴드 로우/);
  assert.match(rendered,/3세트/);
  assert.match(rendered,/12회/);
  assert.match(rendered,/7\.5kg/);
  assert.equal(a.run("activeRoutine().days[0].exercises.some(e=>e.id==='band-row')"),false,'old row is history rather than a newly scheduled band exercise');
});

test('editing an older strength record retains sets and weight after its date becomes a cardio day', () => {
  const a=app();
  a.run("weekOffset=-1; dayIndex=4; state.prefs=cleanPrefs({goal:'gain',days:3,place:'home',equipment:'band',minutes:40}); const olderDate=shifted(currentWeek(),dayIndex); state.logs[olderDate]={'band-row':{done:true,sets:3,reps:12,weight:7.5,minutes:null}}; state.prefs=cleanPrefs({...state.prefs,goal:'balance'});");
  assert.equal(a.run('activeRoutine().days[dayIndex].type'),'cardio');
  a.click('log',{exercise:'band-row'});
  assert(a.nodes.has('logSets'),'previous strength record must still offer sets');
  assert(a.nodes.has('logReps'),'previous strength record must still offer repetitions');
  assert(a.nodes.has('logWeight'),'previous strength record must still offer weight');
  a.nodes.get('logSets').value='4';a.nodes.get('logReps').value='10';a.nodes.get('logWeight').value='8';
  a.submit('logForm');
  const log=a.plain("state.logs[shifted(currentWeek(),dayIndex)]['band-row']");
  assert.deepEqual(log,{done:true,sets:4,reps:10,weight:8,minutes:null});
});

test('moving a measurement date then reusing the original date does not delete a different record on later edits', () => {
  const dateA='2026-01-03',dateB='2026-01-04';
  const a=app({[STORE]:stored([record(dateA)])});
  a.click('edit-measurement',{date:dateA});
  fillMeasurement(a,{mdate:dateB,weight:'66'});a.submit('measurementForm');
  assert.deepEqual(a.plain('state.measurements.map(r=>({date:r.date,weight:r.weight}))'),[{date:dateB,weight:66}]);
  a.click('measurement');
  fillMeasurement(a,{mdate:dateA,weight:'64'});a.submit('measurementForm');
  assert.equal(a.run('state.measurements.length'),2);
  a.click('edit-measurement',{date:dateB});
  fillMeasurement(a,{mdate:dateB,weight:'67'});a.submit('measurementForm');
  assert.deepEqual(a.plain('state.measurements.map(r=>({date:r.date,weight:r.weight}))'),[{date:dateB,weight:67},{date:dateA,weight:64}]);
  a.click('edit-measurement',{date:dateA});
  fillMeasurement(a,{mdate:dateA,weight:'63'});a.submit('measurementForm');
  assert.deepEqual(a.plain('state.measurements.map(r=>({date:r.date,weight:r.weight}))'),[{date:dateB,weight:67},{date:dateA,weight:63}]);
  const reloaded=app(Object.fromEntries(a.data));
  assert.deepEqual(reloaded.plain('state.measurements.map(r=>({date:r.date,weight:r.weight}))'),[{date:dateB,weight:67},{date:dateA,weight:63}]);
});

test('new sessions open photo analysis while keeping all seven body-focus regions selectable', () => {
  const a=app();
  assert.equal(a.run('page'),'report');
  assert.match(a.nodes.get('content').innerHTML,/인바디/);
  a.run("page='focus';render()");
  const rendered=a.nodes.get('content').innerHTML;
  assert.match(rendered,/BODY FOCUS LAB/);
  for(const key of Object.keys(focus.parts))assert.match(rendered,new RegExp(`data-part="${key}"`));
  a.click('focus-part',{part:'back'});
  assert.equal(a.run('focusPart'),'back');
  assert.equal(a.run('focusView'),'back');
  a.click('focus-view',{view:'front'});
  assert.equal(a.run('focusView'),'front');
  assert.equal(a.run('focusPart'),'chest');
});

test('focus plans reject corrupt dates, unknown or non-strength IDs, duplicate IDs and invalid volumes', () => {
  const a=app(),today=core.today();
  const strength=Object.values(focus.catalog).filter(ex=>ex.kind==='strength').slice(0,8);
  const date365=a.run('shifted(C.today(),365)'),date366=a.run('shifted(C.today(),366)');
  const valid=strength.map(ex=>({id:ex.id,part:'chest',sets:2}));
  const raw={
    [today]:[{id:'missing',part:'chest',sets:2},{id:'easy-walk',part:'legs',sets:2},{id:strength[0].id,part:'chest',sets:0},{id:strength[0].id,part:'chest',sets:1.5},valid[0],valid[0],...valid.slice(1)],
    [date365]:[{id:'focus-palm-press',part:'chest',sets:6}],
    [date366]:[{id:'focus-palm-press',part:'chest',sets:2}],
    '2026-02-30':[{id:'focus-palm-press',part:'chest',sets:2}],
    'invalid':valid,
    '2026-01-01':[{id:'focus-palm-press',part:'chest',sets:7}]
  };
  a.context.focusInput=raw;
  const cleaned=a.plain('cleanFocusPlans(focusInput)');
  assert.equal(cleaned[today].length,6);
  assert.equal(new Set(cleaned[today].map(ex=>ex.id)).size,6);
  assert.equal(cleaned[today][0].sets,2);
  assert.equal(cleaned[date365][0].sets,6);
  assert.equal(cleaned[date366],undefined);
  assert.equal(cleaned['2026-02-30'],undefined);
  assert.equal(cleaned.invalid,undefined);
  assert.equal(cleaned['2026-01-01'],undefined);
  assert.deepEqual(a.plain('cleanFocusPlans(null)'),{});
});

test('unknown and inherited body-part names normalize to the supported core region', () => {
  const a=app(),date=core.today();
  a.context.focusInput={ [date]:[
    {id:'focus-palm-press',part:'__proto__',sets:2},
    {id:'focus-close-wall-push',part:'constructor',sets:2},
    {id:'focus-self-curl',part:'not-a-part',sets:2}
  ]};
  const parts=a.plain('cleanFocusPlans(focusInput)[C.today()].map(ex=>ex.part)');
  assert.deepEqual(parts,['core','core','core']);
});

test('adding a body-part exercise preserves recommended volume, deduplicates and survives reload', () => {
  const a=app();
  a.run("state.prefs=cleanPrefs({goal:'gain',level:'regular',place:'home',equipment:'none',minutes:60})");
  const recommended=a.plain("F.recommend('chest',state.prefs).exercises.find(ex=>ex.id==='focus-palm-press')");
  a.click('focus-add',{exercise:'focus-palm-press',part:'chest'});
  a.click('focus-add',{exercise:'focus-palm-press',part:'chest'});
  const plans=a.plain('state.focusPlans[C.today()]');
  assert.deepEqual(plans,[{id:'focus-palm-press',part:'chest',sets:recommended.sets}]);
  const todayExercise=a.plain("activeRoutine(monday(C.today())).days[(new Date().getDay()+6)%7].exercises.filter(ex=>ex.id==='focus-palm-press')");
  assert.equal(todayExercise.length,1);
  assert.equal(todayExercise[0].sets,recommended.sets);
  assert.equal(todayExercise[0].reps,recommended.reps);
  assert.equal(todayExercise[0]._focus,true);
  const reloaded=app(Object.fromEntries(a.data));
  assert.deepEqual(reloaded.plain('state.focusPlans'),a.plain('state.focusPlans'));
  assert.equal(reloaded.run("activeRoutine(monday(C.today())).days[(new Date().getDay()+6)%7].exercises.filter(ex=>ex.id==='focus-palm-press').length"),1);
});

test('adding refuses exercises outside the selected recommendation and active base-plan duplicates', () => {
  const a=app();
  a.click('focus-add',{exercise:'focus-cable-curl',part:'chest'});
  assert.deepEqual(a.plain('state.focusPlans'),{});
  a.run("state.prefs=cleanPrefs({goal:'gain',days:5,place:'gym',level:'regular',minutes:40}); dayIndex=(new Date().getDay()+6)%7");
  const base=a.plain('C.generateRoutine(state.prefs).days[(new Date().getDay()+6)%7].exercises');
  const part=Object.keys(focus.parts).find(key=>focus.recommend(key,a.plain('state.prefs')).exercises.some(ex=>base.some(b=>b.id===ex.id)));
  if(part){
    const ex=focus.recommend(part,a.plain('state.prefs')).exercises.find(ex=>base.some(b=>b.id===ex.id));
    a.click('focus-add',{exercise:ex.id,part});
    assert.deepEqual(a.plain('state.focusPlans'),{});
  }
  const before=a.writes.length;
  a.run('state.prefs.pain=true');
  a.click('focus-add',{exercise:'focus-palm-press',part:'chest'});
  assert.deepEqual(a.plain('state.focusPlans'),{});
  assert.equal(a.writes.length,before);
});

test('date-specific focus plans apply to their own week and do not duplicate base exercises', () => {
  const a=app();
  const pastWeek=a.run('monday(shifted(C.today(),-7))'),pastDate=a.run(`shifted('${pastWeek}',2)`);
  a.context.pastDate=pastDate;
  a.run("state.focusPlans[pastDate]=[{id:'focus-palm-press',part:'chest',sets:3},{id:'wall-pushup',part:'chest',sets:6}]");
  const own=a.plain(`activeRoutine('${pastWeek}').days[2]`);
  assert.equal(own.exercises.filter(ex=>ex.id==='focus-palm-press').length,1);
  assert.equal(own.exercises.find(ex=>ex.id==='focus-palm-press').sets,3);
  assert.equal(own.exercises.filter(ex=>ex.id==='wall-pushup').length,1);
  assert.notEqual(own.exercises.find(ex=>ex.id==='wall-pushup').sets,6,'existing base exercise retains its own prescription');
  assert.equal(a.run("activeRoutine(monday(C.today())).days.some(day=>day.exercises.some(ex=>ex.id==='focus-palm-press'))"),false);
});

test('demo focus additions and removals never alter actual plans or persistent storage', () => {
  const date=core.today(),actualPlan={ [date]:[{id:'focus-palm-press',part:'chest',sets:2}] };
  const initial=stored([record()],{focusPlans:actualPlan});
  const a=app({[STORE]:initial});
  a.click('demo');
  a.click('focus-add',{exercise:'wall-pushup',part:'chest'});
  assert(a.run("demoState.focusPlans[C.today()].some(ex=>ex.id==='wall-pushup')"));
  a.click('focus-remove',{exercise:'wall-pushup'});
  assert.deepEqual(a.plain('state.focusPlans'),actualPlan);
  assert.equal(a.data.get(STORE),initial);
  assert.equal(a.writes.length,0);
});

test('removing a focus plan keeps its actual completed volume and makes the historical row visible', () => {
  const date=core.today(),entry={done:true,sets:3,reps:10,weight:0,minutes:null};
  const initial=stored([record()],{focusPlans:{[date]:[{id:'focus-palm-press',part:'chest',sets:2}]},logs:{[date]:{'focus-palm-press':entry}}});
  const a=app({[STORE]:initial});
  a.click('focus-remove',{exercise:'focus-palm-press'});
  assert.equal(a.run('state.focusPlans[C.today()]'),undefined);
  assert.deepEqual(a.plain("state.logs[C.today()]['focus-palm-press']"),entry);
  assert.match(a.run('workout()'),/손바닥 가볍게 밀기/);
  assert.match(a.run('workout()'),/3세트/);
  const reloaded=app(Object.fromEntries(a.data));
  assert.deepEqual(reloaded.plain("state.logs[C.today()]['focus-palm-press']"),entry);
});

function reportRecord(extra = {}, overrides = {}) {
  return record(core.today(), {report:{sex:null,muscleControl:null,fatControl:null,segments:{rightArm:null,leftArm:null,trunk:null,rightLeg:null,leftLeg:null},segmentReference:null,source:'photo',...extra},...overrides});
}
function countTypes(a) { return a.plain("activeRoutine(monday(C.today())).days.reduce((counts,day)=>(counts[day.type]=(counts[day.type]||0)+1,counts),{})"); }
function fillReport(a, values={}) {
  const defaults={reportSex:'',reportMuscleControl:'',reportFatControl:'',segRightArm:'',segLeftArm:'',segTrunk:'',segRightLeg:'',segLeftLeg:'',...values};
  for(const [id,value]of Object.entries(defaults)){assert(a.nodes.has(id),`${id} must exist in the measurement form`);a.nodes.get(id).value=String(value);}
  if(a.nodes.has('segmentConfirmed'))a.nodes.get('segmentConfirmed').checked=false;
}

test('confirmed report metadata survives validation, persistent reload and JSON backup merge', async()=>{
  const input=reportRecord({sex:'female',muscleControl:1.5,fatControl:-3.2,segments:{rightArm:95,leftArm:93,trunk:98,rightLeg:104,leftLeg:103},segmentReference:'bodyWeight'});
  const validated=core.validateMeasurement(input);
  assert.equal(validated.ok,true);
  assert.equal(validated.value.report.sex,'female');
  assert.equal(validated.value.report.muscleControl,1.5);
  assert.equal(validated.value.report.fatControl,-3.2);
  assert.equal(validated.value.report.segmentReference,'bodyWeight');
  assert.deepEqual(validated.value.report.segments,input.report.segments);
  const a=app({[STORE]:stored([validated.value])});a.run('persist()');
  const reloaded=app(Object.fromEntries(a.data));
  assert.deepEqual(reloaded.plain('state.measurements[0].report'),validated.value.report);
  const receiver=app();
  const backup={version:5,measurements:[validated.value],logs:{},focusPlans:{}};
  receiver.context.backupFile={size:1000,text:async()=>JSON.stringify(backup)};
  await receiver.run('importBackup(backupFile)');
  assert(receiver.nodes.get('confirmImport'),'valid backup should offer an explicit merge action');
  receiver.nodes.get('confirmImport').click();
  assert.deepEqual(receiver.plain('state.measurements[0].report'),validated.value.report);
  assert.equal(receiver.run('state.reportPlan'),null,'bringing in data must not silently apply a prescription');
});

test('explicit report application changes actual three-day exercise mix from muscle to fat orientation',()=>{
  const muscle=app({[STORE]:stored([reportRecord({muscleControl:2})])});
  const fat=app({[STORE]:stored([reportRecord({fatControl:-4})])});
  assert.equal(muscle.run('state.reportPlan'),null);
  assert.equal(fat.run('state.reportPlan'),null);
  assert.equal(countTypes(muscle).strength,2,'mere presence of a report does not replace the user plan');
  muscle.click('apply-report');fat.click('apply-report');
  assert(muscle.run('activeReportPlan()'));
  assert(fat.run('activeReportPlan()'));
  assert.equal(countTypes(muscle).strength,3);
  assert.equal(countTypes(muscle).cardio||0,0);
  assert.equal(countTypes(fat).strength,2);
  assert.equal(countTypes(fat).cardio,1);
  assert.notDeepEqual(muscle.plain('activeRoutine().days'),fat.plain('activeRoutine().days'));
  const reloaded=app(Object.fromEntries(muscle.data));
  assert.equal(countTypes(reloaded).strength,3,'an explicitly applied valid plan survives reload');
});

test('regional priorities use confirmed body-weight percentages and produce distinct arm or leg emphasis',()=>{
  const arms={rightArm:82,leftArm:87,trunk:108,rightLeg:109,leftLeg:110};
  const legs={rightArm:109,leftArm:110,trunk:108,rightLeg:82,leftLeg:87};
  const make=(segments,reference)=>app({[STORE]:stored([reportRecord({segments,segmentReference:reference})])});
  const armApp=make(arms,'bodyWeight'),legApp=make(legs,'bodyWeight'),unconfirmed=make(arms,null);
  assert.equal(armApp.run('currentReportAnalysis().focusParts[0].part'),'arms');
  assert.equal(legApp.run('currentReportAnalysis().focusParts[0].part'),'legs');
  assert.equal(unconfirmed.run('currentReportAnalysis().focusParts.length'),0,'ambiguous upper/lower/fat percentages are not used for regional inference');
  armApp.click('apply-report');legApp.click('apply-report');
  const armDays=armApp.plain('activeRoutine().days'),legDays=legApp.plain('activeRoutine().days');
  assert.notDeepEqual(armDays,legDays,'confirmed region changes must alter real exercise order or content');
  assert(armDays.some(day=>day.exercises.some(ex=>ex._analysisPart==='arms')));
  assert(legDays.some(day=>day.exercises.some(ex=>ex._analysisPart==='legs')));
});

test('a confirmed photo save opens analysis without silently applying a new exercise plan',()=>{
  const a=app();a.run("page='dashboard';render()");
  a.click('measurement');fillMeasurement(a);fillReport(a,{reportSex:'male',reportMuscleControl:'2'});
  a.run('photoInputUsed=true');
  a.nodes.get('ocrReview').hidden=false;a.nodes.get('ocrReviewed').checked=true;
  a.submit('measurementForm');
  assert.equal(a.run('page'),'report');
  assert.equal(a.run('state.measurements[0].report.source'),'photo');
  assert.equal(a.run('state.measurements[0].report.muscleControl'),2);
  assert.equal(a.run('state.reportPlan'),null);
  assert.equal(a.run('activeReportPlan()'),null);
  assert.equal(countTypes(a).strength,2);
  a.click('apply-report');
  assert.equal(countTypes(a).strength,3);
});

test('photo recognition fills the complete form and confirmed printed arm ratings survive save and reload',async()=>{
  const a=app();a.click('measurement');
  const text=`검사일 ${core.today()}\n신장 172cm\n나이 29\n성별 남성\n체중 68.2\n골격근량 28.4\n체지방률 22.5\n근육조절 +3.1\n지방조절 -0.1\n부위별 근육분석\n오른팔 표준이하\n왼팔 표준이하\n몸통 표준\n오른다리 표준\n왼다리 표준`;
  a.run(`ocrWorker=Promise.resolve({});window.PhotoReader={recognize:async()=>({text:${JSON.stringify(text)},words:[],geometry:{width:1600,height:2255}})}`);
  await a.run("processPhoto(new Blob(['fixture'],{type:'image/png'}))");
  for(const [id,value]of Object.entries({mdate:core.today(),height:172,age:29,weight:68.2,muscle:28.4,fat:22.5,ratingRightArm:'low',ratingLeftArm:'low',ratingTrunk:'normal'}))assert.equal(String(a.nodes.get(id).value),String(value),id);
  assert.match(a.nodes.get('ocrResultSummary').innerHTML,/6 \/ 6/);
  assert.equal(a.nodes.get('ratingConfirmed').checked,false,'OCR does not confirm its own output');
  assert.equal(a.nodes.get('saveMeasurement').disabled,false);
  a.submit('measurementForm');assert.equal(a.run('state.measurements.length'),0,'unconfirmed ratings cannot silently save');
  a.nodes.get('ratingConfirmed').checked=true;a.nodes.get('ocrReviewed').checked=true;a.submit('measurementForm');
  assert.equal(a.run('state.measurements[0].report.segmentRatings.leftArm'),'low');
  assert.equal(a.run('state.measurements[0].report.ratingReference'),'lean');
  assert.equal(a.run('currentReportAnalysis().focusParts[0].part'),'arms');
  a.click('apply-report');assert.equal(countTypes(a).strength,3);
  const reloaded=app(Object.fromEntries(a.data));
  assert.equal(reloaded.run('state.measurements[0].report.segmentRatings.leftArm'),'low');
  assert(reloaded.run("activeRoutine().days.some(day=>day.exercises.some(ex=>ex._analysisPart==='arms'))"));
});

test('editing the report source invalidates its old signature and stops applying the outdated analysis',()=>{
  const a=app({[STORE]:stored([reportRecord({muscleControl:2})])});
  a.click('apply-report');
  assert.equal(countTypes(a).strength,3);
  const signature=a.run('activeReportPlan().signature');
  a.click('edit-measurement',{date:core.today()});fillMeasurement(a);fillReport(a,{reportMuscleControl:'3'});
  a.submit('measurementForm');
  assert.notEqual(a.run('currentReportAnalysis().signature'),signature);
  assert.equal(a.run('activeReportPlan()'),null);
  assert.equal(countTypes(a).strength,2,'stale analysis cannot keep overriding the manual base plan');
});

test('manual goal changes clear an applied photo-analysis plan',()=>{
  const a=app({[STORE]:stored([reportRecord({muscleControl:2})])});a.click('apply-report');
  assert(a.run('activeReportPlan()'));
  a.click('preferences');
  for(const [id,value]of Object.entries({pgoal:'loss',plevel:'beginner',pdays:'3',pminutes:'40',pplace:'home',pequipment:'none'}))a.nodes.get(id).value=value;
  a.submit('prefsForm');
  assert.equal(a.run('state.reportPlan'),null);
  assert.equal(a.run('state.prefs.goal'),'loss');
  assert.equal(a.run('activeReportPlan()'),null);
  assert.equal(countTypes(a).cardio,1);
});

test('an older selected measurement cannot replace the latest source plan',()=>{
  const older=reportRecord({muscleControl:2},{date:'2026-01-01',id:'old-source'});
  const latest=reportRecord({fatControl:-4});
  const a=app({[STORE]:stored([latest,older])});
  a.run("reportDate='2026-01-01'");a.click('apply-report');
  assert.equal(a.run('state.reportPlan'),null);
  a.run('reportDate=C.today()');a.click('apply-report');
  assert.equal(countTypes(a).cardio,1);
});
