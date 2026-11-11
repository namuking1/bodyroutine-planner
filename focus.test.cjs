'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Focus=require('./dist/focus.js');
const Core=require('./dist/core.js');
const keys=['shoulders','chest','back','arms','core','glutes','legs'];
test('body map contains seven named regions with view and explanatory metadata',()=>{
  assert.deepEqual(Object.keys(Focus.parts),keys);
  for(const [id,part] of Object.entries(Focus.parts)){
    assert.equal(part.id,id);assert(['front','back'].includes(part.view));
    for(const field of ['name','english','movement','description','tip'])assert(part[field].length>0);
  }
});
test('all body-part, location, equipment, duration, experience and goal choices return valid exercises',()=>{
  let count=0;
  for(const part of keys)for(const place of ['home','gym'])for(const equipment of ['none','band'])for(const minutes of [20,40,60])for(const level of ['beginner','regular'])for(const goal of ['balance','loss','gain']){
    const result=Focus.recommend(part,{place,equipment,minutes,level,goal});count++;
    assert.equal(result.part.id,part);assert(result.exercises.length>=2&&result.exercises.length<=3);
    assert.equal(new Set(result.exercises.map(e=>e.id)).size,result.exercises.length);
    assert.equal(result.reasons.length,3);
    for(const ex of result.exercises){
      assert.equal(ex.kind,'strength');assert(Number.isInteger(ex.sets)&&ex.sets>=1&&ex.sets<=4);
      for(const field of ['id','name','reps','guide','caution','alternative'])assert(typeof ex[field]==='string'&&ex[field].length);
      assert(Focus.lookup(ex.id));
      if(place==='home')assert(ex.equipment===equipment||ex.equipment==='none');
    }
  }
  assert.equal(count,504);
});
test('home no-equipment recommendations never require bands or gym equipment',()=>{
  for(const part of keys){
    for(const ex of Focus.recommend(part,{place:'home',equipment:'none',minutes:60}).exercises){
      assert.equal(ex.equipment,'none');
      assert(!/밴드|덤벨|케이블|머신|레그 프레스|랫 풀다운/.test(ex.name));
    }
  }
});
test('each region has a distinct exercise selection and equipment changes relevant recommendations',()=>{
  const lists=keys.map(part=>Focus.recommend(part,{place:'home',equipment:'none'}).exercises.map(ex=>ex.id).join(','));
  assert.equal(new Set(lists).size,7);
  for(const part of ['shoulders','chest','back','arms']){
    const none=Focus.recommend(part,{place:'home',equipment:'none'}).exercises.map(ex=>ex.id);
    const band=Focus.recommend(part,{place:'home',equipment:'band'}).exercises.map(ex=>ex.id);
    const gym=Focus.recommend(part,{place:'gym',equipment:'none'}).exercises.map(ex=>ex.id);
    assert.notDeepEqual(none,band);assert.notDeepEqual(none,gym);
    assert(Focus.recommend(part,{place:'gym'}).exercises.some(ex=>ex.equipment==='gym'));
  }
});
test('time and experience alter suggested workload without mutating catalog',()=>{
  const short=Focus.recommend('chest',{minutes:20,level:'beginner'});
  const medium=Focus.recommend('chest',{minutes:40,level:'beginner'});
  const regular=Focus.recommend('chest',{minutes:40,level:'regular'});
  const longer=Focus.recommend('chest',{minutes:60,level:'regular',goal:'gain'});
  assert.equal(short.exercises.length,2);assert.equal(medium.exercises.length,3);
  assert(short.exercises[0].sets<medium.exercises[0].sets);
  assert(medium.exercises[0].sets<regular.exercises[0].sets);
  assert(regular.exercises[0].sets<longer.exercises[0].sets);
  short.exercises[0].name='changed';short.part.name='changed';
  assert.notEqual(Focus.recommend('chest',{}).exercises[0].name,'changed');
  assert.notEqual(Focus.parts.chest.name,'changed');
});
test('lookup preserves original exercise kinds and rejects unknown identifiers',()=>{
  for(const ex of Object.values(Core.catalog))assert(Focus.lookup(ex.id));
  assert.equal(Focus.exerciseKind('easy-walk'),'recovery');
  assert.equal(Focus.exerciseKind('steady-cardio'),'cardio');
  assert.equal(Focus.exerciseKind('focus-cable-curl'),'strength');
  assert.equal(Focus.lookup('not-an-exercise'),null);
  assert.equal(Focus.exerciseKind('not-an-exercise'),null);
});
test('missing or hostile inputs fall back safely and measurements do not determine regional recommendations',()=>{
  const fallback=Focus.recommend('<script>',null);
  assert.equal(fallback.part.id,'core');
  assert.equal(Focus.recommend('__proto__',null).part.id,'core');
  assert.equal(Focus.recommend('constructor',{}).part.id,'core');
  assert.deepEqual(Focus.recommend('core',{weight:30,fat:60}),Focus.recommend('core',{weight:100,fat:5}));
  assert.deepEqual(Focus.recommend('core',[]),Focus.recommend('core',null));
  assert(Focus.recommend('core',{goal:'loss'}).reasons[2].includes('체지방만'));
});
