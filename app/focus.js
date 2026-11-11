(function (root, factory) {
  'use strict';
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.BodyCore;
  const api = factory(core);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BodyFocus = api;
})(typeof window !== 'undefined' ? window : null, function (core) {
  'use strict';
  const parts = {
    shoulders: { id:'shoulders', name:'어깨', english:'SHOULDERS', view:'front', movement:'팔 올리기와 어깨 움직임', description:'팔을 편안하게 들어 올리고 어깨 주변의 움직임을 연습해요.', tip:'어깨를 으쓱하거나 허리를 젖히지 않는 범위를 찾아보세요.' },
    chest: { id:'chest', name:'가슴', english:'CHEST', view:'front', movement:'앞으로 밀기', description:'가슴과 팔을 함께 사용하는 밀기 동작을 연습해요.', tip:'손목과 어깨가 편안한 높이에서 천천히 밀어보세요.' },
    back: { id:'back', name:'등', english:'BACK', view:'back', movement:'당기기와 견갑골 움직임', description:'등 주변을 사용하는 당기기와 자세 유지 동작을 골랐어요.', tip:'상체를 크게 젖히는 반동보다 어깨와 팔의 안정적인 움직임에 집중해요.' },
    arms: { id:'arms', name:'팔', english:'ARMS', view:'front', movement:'팔꿈치 굽히기와 펴기', description:'팔꿈치를 굽히고 펴는 동작을 가볍게 연습해요.', tip:'몸통을 흔들지 않고 편안한 저항으로 천천히 움직여요.' },
    core: { id:'core', name:'코어', english:'CORE', view:'front', movement:'몸통 안정과 팔다리 조절', description:'몸통을 안정적으로 유지하며 팔다리를 조절하는 동작을 연습해요.', tip:'숨을 참지 않고 허리가 편안하게 유지되는 범위로 움직여요.' },
    glutes: { id:'glutes', name:'둔근', english:'GLUTES', view:'back', movement:'엉덩이 펴기와 벌리기', description:'엉덩이를 펴고 다리를 벌리는 움직임을 연습해요.', tip:'허리를 과하게 젖히기보다 골반의 움직임을 작게 조절해요.' },
    legs: { id:'legs', name:'하체', english:'LEGS', view:'front', movement:'앉았다 일어나기와 무릎 조절', description:'허벅지와 종아리를 함께 쓰며 일상 속 하체 움직임을 연습해요.', tip:'발바닥을 안정적으로 딛고 무릎과 발끝의 방향을 맞춰요.' }
  };
  const catalog = {};
  const gymIds = new Set(['leg-press','chest-press','seated-row','leg-curl','lat-pulldown','hip-abduction']);
  for (const [key, value] of Object.entries(core && core.catalog || {})) {
    const kind = value.id === 'steady-cardio' ? 'cardio' : ['easy-walk','easy-mobility'].includes(value.id) ? 'recovery' : 'strength';
    catalog[key] = { ...value, sets:kind === 'strength' ? 2 : 1, kind, equipment:gymIds.has(value.id) ? 'gym' : value.id === 'band-row' ? 'band' : 'none' };
  }
  function add(key,id,name,equipment,guide,caution,alternative,reps='8–12회') {
    catalog[key] = { id, name, sets:2, reps, guide, caution, alternative, kind:'strength', equipment };
  }
  add('scapularReach','focus-scapular-reach','벽에서 팔 뻗기','none','벽을 마주 보고 양손을 어깨 높이에 가볍게 짚어요. 팔꿈치를 편안하게 유지하며 벽을 살짝 밀었다가 돌아와요.','목을 앞으로 빼거나 어깨를 으쓱하지 않아요. 작은 움직임으로 시작해요.','서서 양팔을 앞으로 가볍게 뻗었다가 돌아오기');
  add('armRaise','focus-arm-raise','맨몸 팔 올리기','none','서거나 앉아서 양팔을 몸 앞쪽으로 천천히 들어요. 편안한 높이에서 잠깐 멈춘 뒤 내려요.','허리를 젖히지 않고 통증 없는 높이까지만 올려요.','한 팔씩 낮은 범위로 올리기');
  add('palmPress','focus-palm-press','손바닥 가볍게 밀기','none','가슴 앞에서 양손바닥을 맞대요. 숨을 편안하게 쉬면서 가볍게 서로 밀고 힘을 풀어요.','목과 어깨에 힘을 과하게 주거나 숨을 참지 않아요.','벽 푸시업의 작은 범위 동작','3초씩 6–8회');
  add('closeWallPush','focus-close-wall-push','좁은 간격 벽 푸시업','none','벽에 양손을 어깨너비보다 조금 좁게 짚어요. 몸을 편안한 일직선으로 유지하며 팔꿈치를 굽혔다가 밀어요.','손목이 불편할 정도로 손 간격을 좁히지 않아요. 발을 벽 가까이에 두면 저항이 줄어요.','어깨너비로 손을 둔 벽 푸시업');
  add('proneW','focus-prone-w','엎드려 W 팔 모으기','none','매트나 편안한 바닥에 엎드리고 팔꿈치를 굽혀 W 모양을 만들어요. 어깨를 내린 채 팔을 아주 조금 들었다가 내려요.','허리를 꺾거나 고개를 높이 들지 않아요. 바닥에서 드는 높이를 작게 유지해요.','앉아서 팔꿈치를 몸 옆으로 두고 견갑골을 가볍게 모으기');
  add('selfCurl','focus-self-curl','손으로 저항 주는 팔 굽히기','none','한쪽 손바닥을 위로 향하게 하고 팔꿈치를 몸 옆에 둬요. 반대 손으로 아주 가볍게 저항을 주며 팔꿈치를 천천히 굽혔다 펴요.','서로 미는 힘을 세게 주지 않고 손목과 팔꿈치가 편안한 범위를 유지해요.','저항 없이 한쪽 팔꿈치를 천천히 굽혔다 펴기','좌우 각 8–10회');
  add('selfExtension','focus-self-extension','손으로 저항 주는 팔 펴기','none','한쪽 팔꿈치를 몸 옆에서 굽히고 반대 손으로 손목 가까이를 가볍게 받쳐요. 작은 저항을 느끼며 팔꿈치를 천천히 펴고 돌아와요.','팔꿈치를 끝까지 세게 잠그지 않고 반대 손의 저항을 약하게 유지해요.','저항 없이 한쪽 팔꿈치를 편안하게 펴기','좌우 각 8–10회');
  add('heelSlide','focus-heel-slide','누워 발뒤꿈치 밀기','none','등을 대고 누워 무릎을 세워요. 한쪽 발뒤꿈치를 바닥에 가볍게 대고 천천히 앞으로 밀었다가 돌아와요.','허리가 불편해지기 전까지만 다리를 뻗고 숨을 참지 않아요.','발을 조금만 앞으로 움직이는 작은 범위 동작','좌우 각 6–8회');
  add('hipExtension','focus-standing-hip-extension','지지대 잡고 다리 뒤로 보내기','none','튼튼한 지지대를 가볍게 잡고 서요. 몸통을 세운 채 한쪽 다리를 조금 뒤로 보냈다가 돌아와요.','허리를 젖히거나 몸을 앞으로 크게 숙이지 않아요.','누워서 글루트 브리지','좌우 각 8–10회');
  add('sideClam','focus-side-clam','옆으로 누워 무릎 벌리기','none','옆으로 누워 무릎을 편안하게 굽히고 발을 포개요. 골반이 뒤로 돌아가지 않게 유지하며 위쪽 무릎을 조금 벌렸다가 닫아요.','다리를 높게 벌리는 것보다 골반이 안정적인 범위를 우선해요.','서서 지지대를 잡고 다리를 옆으로 조금 벌리기','좌우 각 8–12회');
  add('supportedLunge','focus-supported-lunge','지지대 잡고 뒤로 한 발','none','튼튼한 지지대를 가볍게 잡아요. 한쪽 발을 뒤로 짧게 옮기고 양 무릎을 조금 굽혔다가 돌아와요.','균형이 흔들리거나 무릎이 불편하면 깊이를 줄여요. 지지대가 움직이지 않는지 확인해요.','의자에 앉았다 일어서기','좌우 각 6–8회');
  add('bandPullApart','focus-band-pull-apart','가벼운 밴드 벌리기','band','운동용 밴드를 가슴 앞에서 양손으로 잡아요. 어깨를 내리고 팔을 편안한 높이에 둔 채 밴드를 조금 벌렸다가 돌아와요.','밴드의 균열을 확인하고 과하게 늘리지 않아요. 얼굴 쪽으로 튕기지 않게 위치를 낮춰요.','밴드 없이 견갑골을 가볍게 모으기');
  add('bandChestPress','focus-band-chest-press','가벼운 밴드 체스트 프레스','band','제품 설명에 맞게 긴 운동 밴드를 등 뒤에 두고 양 끝을 잡아요. 팔꿈치를 편안하게 굽힌 자세에서 양손을 앞으로 천천히 밀어요.','손목이나 피부를 조이지 않게 하고 밴드가 손에서 풀리지 않는지 확인해요. 저항이 크면 벽 푸시업으로 바꿔요.','벽 푸시업');
  add('bandCurl','focus-band-curl','밴드 팔 굽히기','band','제품 설명에 따라 운동 밴드를 발로 안전하게 고정하고 양 끝을 잡아요. 팔꿈치를 몸 옆에 둔 채 천천히 굽혔다 펴요.','사용 전 밴드와 고정 상태를 확인하고 허리를 흔들며 반동을 주지 않아요.','손으로 가볍게 저항 주는 팔 굽히기');
  add('shoulderPress','focus-machine-shoulder-press','머신 숄더 프레스','gym','기구 안내에 맞춰 좌석과 손잡이를 조절해요. 가벼운 중량으로 손잡이를 편안한 범위까지 밀어 올렸다가 내려요.','어깨를 억지로 뒤로 보내거나 허리를 크게 젖히지 않아요. 사용법을 모르면 시설 안내를 먼저 받아요.','맨몸 팔 올리기');
  add('lateralRaise','focus-dumbbell-lateral-raise','가벼운 덤벨 옆으로 들기','gym','가벼운 덤벨을 잡고 팔꿈치를 약간 굽혀요. 양팔을 옆으로 편안한 높이까지 천천히 올렸다가 내려요.','반동을 쓰거나 어깨를 으쓱하지 않아요. 중량보다 편안한 움직임을 먼저 찾아요.','맨몸으로 낮게 팔 올리기');
  add('cableCurl','focus-cable-curl','케이블 팔 굽히기','gym','낮은 위치의 손잡이를 잡고 팔꿈치를 몸 옆에 둬요. 가벼운 저항으로 팔꿈치를 천천히 굽혔다 펴요.','몸통을 흔들거나 손목을 과하게 꺾지 않아요. 케이블과 손잡이 연결을 확인해요.','손으로 가볍게 저항 주는 팔 굽히기');
  add('cablePushdown','focus-cable-pushdown','케이블 팔 펴기','gym','기구 안내에 맞춰 위쪽 손잡이를 잡고 팔꿈치를 몸 옆에 둬요. 가벼운 저항으로 팔꿈치를 천천히 폈다가 돌아와요.','어깨를 들거나 상체를 크게 숙이며 밀지 않아요. 팔꿈치를 끝까지 세게 잠그지 않아요.','좁은 간격 벽 푸시업');
  const pools = {
    none: {
      shoulders:['wallSlide','scapularReach','armRaise'], chest:['wallPush','palmPress','closeWallPush'], back:['proneW','birdDog','wallSlide'], arms:['selfCurl','closeWallPush','selfExtension'], core:['deadBug','birdDog','heelSlide'], glutes:['bridge','hipExtension','sideClam'], legs:['chairSquat','calf','supportedLunge']
    },
    band: {
      shoulders:['bandPullApart','wallSlide','armRaise'], chest:['bandChestPress','wallPush','palmPress'], back:['bandRow','bandPullApart','birdDog'], arms:['bandCurl','closeWallPush','selfExtension'], core:['deadBug','birdDog','heelSlide'], glutes:['bridge','sideClam','hipExtension'], legs:['chairSquat','calf','supportedLunge']
    },
    gym: {
      shoulders:['shoulderPress','lateralRaise','wallSlide'], chest:['chestPress','wallPush','palmPress'], back:['latPull','seatedRow','birdDog'], arms:['cableCurl','cablePushdown','closeWallPush'], core:['deadBug','birdDog','heelSlide'], glutes:['hipAbduction','bridge','hipExtension'], legs:['legPress','legCurl','calf']
    }
  };
  function prefs(raw) {
    raw=raw&&typeof raw==='object'&&!Array.isArray(raw)?raw:{};
    return { goal:['balance','loss','gain'].includes(raw.goal)?raw.goal:'balance', level:raw.level==='regular'?'regular':'beginner', minutes:[20,40,60].includes(Number(raw.minutes))?Number(raw.minutes):40, place:raw.place==='gym'?'gym':'home', equipment:raw.equipment==='band'?'band':'none' };
  }
  function lookup(id) { const item=Object.values(catalog).find(ex=>ex.id===id); return item?{...item}:null; }
  function exerciseKind(id) { return lookup(id)?.kind || null; }
  function recommend(partId,raw) {
    const part=typeof partId==='string'&&Object.hasOwn(parts,partId)?parts[partId]:parts.core,p=prefs(raw),setting=p.place==='gym'?'gym':p.equipment;
    const count=p.minutes===20?2:3;
    const sets=p.level==='beginner'?(p.minutes===20?1:p.minutes===40?2:3):(p.minutes===20?2:p.minutes===40?3:p.goal==='gain'?4:3);
    const exercises=pools[setting][part.id].slice(0,count).map(key=>({...catalog[key],sets}));
    const placeText=setting==='gym'?'헬스장 기구를 사용할 수 있어 해당 기구 동작을 우선했어요.':setting==='band'?'밴드를 사용하는 동작을 가능한 부위에 반영했어요.':'집에서 별도 운동 기구 없이 시작할 수 있는 동작을 골랐어요.';
    const levelText=p.level==='regular'?'운동 경험자':'입문자';
    return {
      part:{...part}, exercises,
      reasons:[
        `직접 선택한 ${part.name} 부위에서 ${part.movement} 동작을 연습하도록 ${exercises.length}개 동작을 골랐어요.`,
        `${placeText} ${levelText}의 ${p.minutes}분 운동 조건을 참고해 각 ${sets}세트로 제안해요.`,
        p.goal==='gain'?'근육 증가 목표에 맞춰 근력 동작을 선택했어요. 실제 수행 기록을 보며 편안한 저항과 반복 수를 조절하세요.':p.goal==='loss'?'선택한 부위의 근력 운동을 제안해요. 특정 부위 운동이 그 부위의 체지방만 줄여준다는 뜻은 아니에요.':'몸의 균형을 위한 시작 동작이에요. 체성분으로 부위별 약점을 판정하지 않고, 선택한 부위와 운동 조건을 사용해요.'
      ]
    };
  }
  return {parts,catalog,recommend,lookup,exerciseKind};
});
