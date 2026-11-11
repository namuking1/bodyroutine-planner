'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('./dist/core.js');
const valid = () => ({ id:'measure-1',date:core.today(),height:170,age:28,weight:65,muscle:27,fat:24,at:123 });

test('new measurement normalizes numeric fields and computes values without diagnosis', () => {
  const result = core.validateMeasurement({...valid(),weight:'65,0',height:'170',age:'28'});
  assert.equal(result.ok,true);
  assert.deepEqual(result.errors,{});
  assert.equal(result.value.weight,65);
  assert.deepEqual(core.computed(result.value),{bmi:22.5,fatMass:15.6,leanMass:49.4});
  assert.deepEqual(core.computed({weight:65,fat:24,height:null}),{bmi:null,fatMass:15.6,leanMass:49.4});
});

test('new measurements reject missing, inconsistent, out-of-range and impossible dates', () => {
  const invalid = [
    [{height:''},'height'],[{height:null},'height'],[{age:true},'age'],[{age:28.5},'age'],
    [{weight:0},'weight'],[{fat:66},'fat'],[{muscle:60},'muscle'],[{date:'2026-02-30'},'date'],
    [{date:'2099-01-01'},'date'],[{date:'2025-02-29'},'date'],[{weight:Infinity},'weight']
  ];
  for(const [change,field] of invalid){const r=core.validateMeasurement({...valid(),...change});assert.equal(r.ok,false,JSON.stringify(change));assert(r.errors[field]);assert.equal(r.value,null);}
  assert.equal(core.validateMeasurement({...valid(),date:'2024-02-29'}).ok,true);
  assert.equal(core.validateMeasurement(null).ok,false);
  assert.equal(core.validateMeasurement([]).ok,false);
});

test('import cleaning preserves legacy unknown profile, removes corrupt data and hostile identifiers', () => {
  const legacy={date:'2026-01-02',weight:66,muscle:27,fat:24,at:1};
  const records=core.cleanMeasurements([legacy,null,{}, {...valid(),date:'2026-01-03',weight:67,at:2,id:'<img src=x onerror=alert(1)>'}, {...legacy,weight:65,at:3}, {...legacy,date:'2026-01-04',weight:'<svg/onload=1>'}]);
  assert.equal(records.length,2);
  assert.equal(records[0].date,'2026-01-03');
  assert.equal(records[0].id,'m-2026-01-03');
  assert.equal(records[1].weight,65);
  assert.equal(records[1].height,null);
  assert.equal(records[1].age,null);
  assert.equal(core.computed(records[1]).bmi,null);
  assert.deepEqual(core.cleanMeasurements({records}),[]);
  assert.deepEqual(core.cleanMeasurements([legacy,{...legacy,weight:64,at:3},{...legacy,weight:63,at:2}]).map(x=>x.weight),[64]);
});

test('history comparison uses latest two distinct dates and a stable first entry', () => {
  const records=[{...valid(),date:'2026-01-01',weight:68,muscle:26,fat:26}, {...valid(),date:'2026-02-01',weight:67,muscle:26.5,fat:25}, {...valid(),date:'2026-03-01',weight:66.5,muscle:27,fat:24}];
  const comparison=core.latestComparison(records);
  assert.equal(comparison.latest.date,'2026-03-01');
  assert.equal(comparison.previous.date,'2026-02-01');
  assert.equal(comparison.first.date,'2026-01-01');
  assert.deepEqual(comparison.delta,{weight:-0.5,muscle:0.5,fat:-1});
  assert.equal(core.latestComparison([records[0]]).delta,null);
  assert.deepEqual(core.latestComparison([]),{latest:null,previous:null,first:null,delta:null});
});

test('measurement history caps latest 200 distinct dates',()=>{
  const rows=Array.from({length:240},(_,i)=>{const d=new Date(2025,0,1+i,12);return {...valid(),date:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};});
  const cleaned=core.cleanMeasurements(rows);
  assert.equal(cleaned.length,200);
  assert.equal(cleaned[0].date,rows.at(-1).date);
  assert.equal(cleaned.at(-1).date,rows[40].date);
});

test('all 432 preference combinations yield seven valid days and requested number of workout days', () => {
  let combinations=0;
  for(const goal of ['balance','loss','gain']) for(const level of ['beginner','regular']) for(const days of [2,3,4,5]) for(const place of ['home','gym']) for(const minutes of [20,40,60]) for(const equipment of ['none','band','gym']){
    const plan=core.generateRoutine({goal,level,days,place,minutes,equipment});
    combinations++;
    assert.equal(plan.days.length,7);
    assert.equal(plan.days.filter(x=>x.type!=='recovery').length,days);
    assert.deepEqual(plan.days.map(x=>x.index),[0,1,2,3,4,5,6]);
    assert.equal(plan.reason.length,5);
    for(const day of plan.days){
      assert(['strength','cardio','recovery'].includes(day.type));
      assert.equal(typeof day.duration,'number');
      assert(day.exercises.length>0);
      if(day.type!=='recovery')assert.equal(day.duration,minutes);
      if(day.type==='strength')assert.equal(day.exercises.length,minutes===20?3:minutes===40?4:5);
      for(const x of day.exercises){
        for(const property of ['id','name','reps','guide','caution','alternative'])assert.equal(typeof x[property],'string');
        assert(x.sets>=1&&x.sets<=4);
        if(place==='home'&&equipment==='none')assert.notEqual(x.id,'band-row');
      }
    }
  }
  assert.equal(combinations,432);
});

test('exercise choices and volumes change with available equipment, time and experience',()=>{
  const base={goal:'balance',level:'beginner',days:3,place:'home',minutes:40,equipment:'none'};
  const full=p=>core.generateRoutine({...base,...p}).days[0].exercises;
  assert(full({equipment:'band'}).some(x=>x.id==='band-row'));
  assert(full({place:'gym',equipment:'gym'}).some(x=>x.id==='leg-press'));
  assert.equal(full({minutes:20}).length,3);
  assert.equal(full({minutes:60}).length,5);
  assert(full({level:'regular'}).every(x=>x.sets===3));
  assert.equal(core.generateRoutine({...base,goal:'gain'}).days.filter(d=>d.type==='strength').length,3);
  assert.equal(core.generateRoutine({...base,goal:'loss'}).days.filter(d=>d.type==='cardio').length,1);
  assert.equal(core.generateRoutine(null).days.length,7);
  const a=core.generateRoutine(base);a.days[0].exercises[0].guide='changed';assert.notEqual(core.generateRoutine(base).days[0].exercises[0].guide,'changed');
});

test('OCR accepts only unambiguous immediate labelled values within measurement bounds',()=>{
  assert.deepEqual(core.parseOcr('신장 (cm) 170.0\n나이: 28\n체중 (kg): 65,0\n골격근량 27.0 kg\n체지방률 (%) 24.0').values,{height:170,age:28,weight:65,muscle:27,fat:24});
  assert.deepEqual(core.parseOcr('Height: 170 Age 28 Weight 65.0 SMM (kg) 27.0 PBF (%) 24.0').matched,['height','age','weight','muscle','fat']);
  assert.deepEqual(core.parseOcr('체중 60–80 kg\n체지방률 10~20 %').values,{});
  assert.deepEqual(core.parseOcr('체중 65.0\n체중 66.0\n나이 99\n체지방률 95.0').values,{});
  assert.deepEqual(core.parseOcr('체중 65.0\n체중 65.0').values,{weight:65});
  assert.deepEqual(core.parseOcr(null),{values:{},matched:[]});
  assert.deepEqual(core.parseOcr('일반 수치 65.0 27.0 24.0').values,{});
  assert.deepEqual(core.parseOcr('목표체중 60.0\n표준 골격근량 28.0\nTarget Weight 62').values,{});
});

test('illustrative demo has six distinct valid measurements ending today',()=>{
  const rows=core.demoMeasurements();
  assert.equal(rows.length,6);
  assert.equal(new Set(rows.map(r=>r.date)).size,6);
  assert.equal(rows.at(-1).date,core.today());
  assert(rows.every(r=>core.validateMeasurement(r).ok));
  assert.equal(core.cleanMeasurements(rows).length,6);
});
