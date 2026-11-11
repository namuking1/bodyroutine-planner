(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.BodyCore = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const weekdays = ['월', '화', '수', '목', '금', '토', '일'];
  const bounds = { height: [100, 230], age: [18, 64], weight: [30, 250], muscle: [5, 100], fat: [3, 65] };
  const names = { height: '키', age: '나이', weight: '체중', muscle: '골격근량', fat: '체지방률' };
  const round = value => Math.round((value + Number.EPSILON) * 10) / 10;
  const pad = value => String(value).padStart(2, '0');
  function dateString(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }
  function today() { return dateString(new Date()); }
  function number(value) {
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value !== 'string' || !/^-?\d+(?:[.,]\d+)?$/.test(value.trim())) return null;
    const result = Number(value.trim().replace(',', '.'));
    return Number.isFinite(result) ? result : null;
  }
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (year < 1 || month < 1 || month > 12 || day < 1) return false;
    const date = new Date(0);
    date.setFullYear(year, month - 1, day);
    date.setHours(12, 0, 0, 0);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  }
  function measurement(raw, allowMissingProfile) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const errors = {};
    const values = {};
    for (const [field, range] of Object.entries(bounds)) {
      const absentProfile = allowMissingProfile && ['height', 'age'].includes(field) && raw[field] == null;
      const parsed = absentProfile ? null : number(raw[field]);
      values[field] = parsed;
      if (absentProfile) continue;
      if (parsed == null || parsed < range[0] || parsed > range[1] || (field === 'age' && !Number.isInteger(parsed))) {
        errors[field] = `${names[field]}는 ${range[0]}–${range[1]} 범위${field === 'age' ? '의 정수' : ''}로 입력해주세요.`;
      }
    }
    const date = typeof raw.date === 'string' ? raw.date : '';
    if (!validDate(date)) errors.date = '올바른 측정일을 선택해주세요.';
    else if (date > today()) errors.date = '측정일은 오늘 또는 과거 날짜로 선택해주세요.';
    if (!errors.weight && !errors.muscle && !errors.fat && values.muscle >= values.weight * (1 - values.fat / 100)) {
      errors.muscle = '골격근량은 체중에서 체지방량을 뺀 값보다 작아야 해요. 숫자와 단위를 확인해주세요.';
    }
    if (Object.keys(errors).length) return { ok: false, errors, value: null };
    const timestamp = number(raw.at);
    const at = timestamp != null && timestamp >= 0 && timestamp < 1e14 ? Math.floor(timestamp) : Date.now();
    const id = typeof raw.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(raw.id) ? raw.id : `m-${date}`;
    return { ok: true, errors: {}, value: { id, date, ...values, at, ...(raw.report&&typeof raw.report==='object'&&!Array.isArray(raw.report)?{report:normalizedReport(raw.report)}:{}) } };
  }
  function normalizedReport(raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    const optional=(v,min,max)=>{const n=number(v);return n!=null&&n>=min&&n<=max?n:null;};
    const segments={},segmentRatings={};
    for(const key of ['rightArm','leftArm','trunk','rightLeg','leftLeg']) {segments[key]=optional(raw.segments&&raw.segments[key],40,250);segmentRatings[key]=['low','normal','high'].includes(raw.segmentRatings?.[key])?raw.segmentRatings[key]:null;}
    return {sex:raw.sex==='male'||raw.sex==='female'?raw.sex:null,muscleControl:optional(raw.muscleControl,-100,100),fatControl:optional(raw.fatControl,-100,100),segments,segmentRatings,ratingReference:raw.ratingReference==='lean'?'lean':null,source:raw.source==='photo'?'photo':'manual',segmentReference:raw.segmentReference==='bodyWeight'?'bodyWeight':null};
  }
  function validateMeasurement(raw) { return measurement(raw, false); }
  function computed(raw) {
    const weight = number(raw && raw.weight), fat = number(raw && raw.fat), height = number(raw && raw.height);
    const fatMass = weight != null && fat != null ? round(weight * fat / 100) : null;
    return {
      bmi: weight != null && height != null && height > 0 ? round(weight / ((height / 100) ** 2)) : null,
      fatMass,
      leanMass: fatMass == null ? null : round(weight - weight * fat / 100)
    };
  }
  function cleanMeasurements(input) {
    if (!Array.isArray(input)) return [];
    const unique = new Map();
    for (const raw of input.slice(0, 10000)) {
      const result = measurement(raw, true);
      if (!result.ok) continue;
      const item = result.value, existing = unique.get(item.date);
      if (!existing || item.at >= existing.at) unique.set(item.date, item);
    }
    return [...unique.values()].sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at).slice(0, 200);
  }
  function latestComparison(records) {
    const sorted = cleanMeasurements(records);
    const latest = sorted[0] || null, previous = sorted[1] || null, first = sorted[sorted.length - 1] || null;
    return { latest, previous, first, delta: previous ? Object.fromEntries(['weight', 'muscle', 'fat'].map(key => [key, round(latest[key] - previous[key])])) : null };
  }

  function exercise(id, name, reps, guide, caution, alternative) { return { id, name, reps, guide, caution, alternative }; }
  const catalog = {
    chairSquat: exercise('chair-squat', '의자 스쿼트', '8–12회', '움직이지 않는 의자를 뒤에 두고 발을 어깨너비로 벌려요. 엉덩이를 뒤로 보내 천천히 앉았다가 발바닥으로 바닥을 밀며 일어나요.', '의자를 벽에 붙여 고정하고, 무릎과 발끝의 방향을 맞춰요. 통증이 생기면 멈춰요.', '앉은 자세에서 한 번씩 천천히 일어서기'),
    wallPush: exercise('wall-pushup', '벽 푸시업', '8–12회', '벽에 양손을 어깨너비로 짚고 발을 조금 뒤로 옮겨요. 몸을 일직선으로 유지한 채 팔꿈치를 구부렸다가 천천히 밀어요.', '허리가 꺾이거나 어깨가 올라가지 않게 해요. 벽에 가까이 서면 강도를 낮출 수 있어요.', '벽에 더 가까이 서서 작은 범위로 밀기'),
    bridge: exercise('glute-bridge', '글루트 브리지', '10–12회', '등을 대고 누워 무릎을 세우고 발바닥을 바닥에 둬요. 엉덩이를 조이며 골반을 들어 올린 뒤 천천히 내려요.', '허리를 과하게 젖히지 말고 어깨부터 무릎까지 편안한 선을 만들어요.', '엉덩이를 낮게 들어 올리는 작은 범위 브리지'),
    birdDog: exercise('bird-dog', '버드독', '좌우 각 6–8회', '네발기기 자세에서 배에 가볍게 힘을 주고 반대쪽 팔과 다리를 천천히 뻗었다가 돌아와요.', '허리와 골반이 돌아가지 않게 유지해요. 균형이 어렵다면 팔 또는 다리만 움직여요.', '네발기기에서 한쪽 팔 또는 다리만 들기'),
    deadBug: exercise('dead-bug', '데드버그', '좌우 각 6–8회', '등을 대고 누워 팔을 위로 뻗고 무릎을 들어요. 반대쪽 팔과 다리를 편안한 범위로 천천히 낮췄다가 돌아와요.', '허리가 바닥에서 과하게 뜨지 않는 범위로 움직이고 숨을 참지 않아요.', '팔을 고정하고 한쪽 발뒤꿈치만 바닥에 가볍게 대기'),
    wallSlide: exercise('wall-slide', '월 슬라이드', '8–10회', '벽 앞에 서서 팔을 편안하게 올려요. 어깨를 으쓱하지 않고 팔을 천천히 위아래로 움직여요.', '팔을 억지로 벽에 붙이거나 통증이 있는 범위까지 올리지 않아요.', '앉은 자세에서 통증 없는 범위로 팔 올리기'),
    calf: exercise('calf-raise', '지지대 잡고 카프 레이즈', '10–15회', '튼튼한 지지대를 가볍게 잡고 서서 양발의 뒤꿈치를 천천히 들었다가 내려요.', '반동 없이 움직이고 균형을 잃지 않도록 지지대를 가까이 둬요.', '의자에 앉아서 뒤꿈치 들어 올리기'),
    bandRow: exercise('band-row', '밴드 로우', '10–12회', '운동용 밴드를 사용 설명에 맞춰 안전하게 고정해요. 어깨를 내리고 팔꿈치를 몸 옆으로 당겼다가 천천히 돌아와요.', '사용 전 밴드의 균열과 고정부를 확인하고, 밴드가 얼굴 쪽으로 튕기지 않게 해요.', '밴드 없이 견갑골을 가볍게 모으는 자세 연습'),
    legPress: exercise('leg-press', '레그 프레스', '8–12회', '등과 골반을 패드에 붙이고 발을 발판에 둬요. 가벼운 중량으로 무릎을 편안하게 굽혔다가 천천히 밀어요.', '기구 조절법을 먼저 확인하고 무릎을 끝까지 잠그거나 허리를 말지 않아요.', '의자 스쿼트'),
    chestPress: exercise('chest-press', '체스트 프레스', '8–12회', '손잡이가 가슴 높이에 오도록 좌석을 맞춰요. 등을 패드에 대고 손잡이를 천천히 밀었다가 돌아와요.', '어깨를 올리거나 팔꿈치를 과하게 뒤로 보내지 않아요. 처음 쓰는 기구는 사용법을 확인해요.', '벽 푸시업'),
    seatedRow: exercise('seated-row', '시티드 로우', '10–12회', '허리를 편안하게 세우고 손잡이를 잡아요. 몸을 뒤로 젖히지 않고 팔꿈치를 몸 옆으로 당겨요.', '반동을 쓰거나 어깨를 으쓱하지 않아요. 무게보다 안정적인 동작을 우선해요.', '안전하게 고정한 밴드 로우'),
    legCurl: exercise('leg-curl', '레그 컬', '10–12회', '기구의 회전축과 무릎 위치를 맞추고 패드를 조절해요. 가벼운 중량으로 무릎을 굽혔다가 천천히 돌아와요.', '기구의 안내에 따라 자세를 맞추고 골반이 들리거나 반동이 생기면 중량을 줄여요.', '글루트 브리지'),
    latPull: exercise('lat-pulldown', '랫 풀다운', '10–12회', '허벅지 패드를 고정하고 손잡이를 잡아요. 가슴을 편안하게 세우고 손잡이를 몸 앞쪽으로 당겼다가 천천히 올려요.', '목 뒤로 당기거나 상체를 크게 젖히지 않아요.', '시티드 로우'),
    hipAbduction: exercise('hip-abduction', '힙 어브덕션', '10–12회', '등을 패드에 대고 기구를 조절한 뒤 가벼운 중량으로 무릎을 천천히 벌렸다가 돌아와요.', '다리를 무리하게 벌리거나 반동을 쓰지 않아요.', '옆으로 누워 무릎을 가볍게 벌리기'),
    walk: exercise('easy-walk', '편안한 걷기', '10–20분', '편안한 보폭으로 시작해 호흡이 안정적으로 유지되는 속도로 걸어요.', '시간과 속도는 컨디션에 맞춰 줄이고, 불편함이 생기면 쉬어요.', '실내에서 천천히 제자리 걷기'),
    mobility: exercise('easy-mobility', '가벼운 관절 움직이기', '5분', '발목, 어깨, 골반을 통증 없는 범위에서 부드럽게 움직여요.', '반동을 주거나 관절을 끝까지 억지로 밀지 않아요.', '앉아서 발목 돌리기와 어깨 가볍게 움직이기'),
    cardio: exercise('steady-cardio', '걷기 · 실내 자전거', '20분', '처음에는 천천히 시작하고, 대화가 가능한 편안한 속도를 유지해요. 마무리에는 속도를 낮춰요.', '숨이 지나치게 차거나 통증, 어지럼이 생기면 멈추고 회복해요.', '실내 제자리 걷기')
  };
  function generateRoutine(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const prefs = {
      goal: ['balance', 'loss', 'gain'].includes(raw.goal) ? raw.goal : 'balance',
      level: raw.level === 'regular' ? 'regular' : 'beginner',
      days: [2, 3, 4, 5].includes(Number(raw.days)) ? Number(raw.days) : 3,
      place: raw.place === 'gym' ? 'gym' : 'home',
      minutes: [20, 40, 60].includes(Number(raw.minutes)) ? Number(raw.minutes) : 40,
      equipment: ['none', 'band', 'gym'].includes(raw.equipment) ? raw.equipment : 'none'
    };
    // A gym setting makes machine-based alternatives available; no-equipment home plans never require bands.
    const gym = prefs.place === 'gym';
    const band = !gym && prefs.equipment === 'band';
    const beginner = prefs.level === 'beginner';
    const goalNames = { balance: '체력 향상과 균형', loss: '체지방 감량', gain: '근육 증가' };
    const schedules = {
      2: [[0, 'full'], [3, 'full']],
      3: [[0, 'full'], [2, 'full'], [4, prefs.goal === 'gain' ? 'full' : 'cardio']],
      4: prefs.goal === 'loss' ? [[0, 'full'], [1, 'cardio'], [3, 'full'], [5, 'cardio']] : [[0, 'upper'], [1, 'lower'], [3, 'upper'], [4, 'lower']],
      5: prefs.goal === 'loss' ? [[0, 'upper'], [1, 'lower'], [2, 'cardio'], [4, 'full'], [5, 'cardio']] : [[0, 'upper'], [1, 'lower'], [2, 'cardio'], [3, 'upper'], [4, 'lower']]
    };
    const sets = prefs.minutes === 20 ? 2 : beginner ? (prefs.minutes === 60 ? 3 : 2) : (prefs.goal === 'gain' && prefs.minutes === 60 ? 4 : 3);
    const count = prefs.minutes === 20 ? 3 : prefs.minutes === 40 ? 4 : 5;
    const pools = gym ? {
      full: ['legPress', 'chestPress', 'seatedRow', 'legCurl', 'deadBug'],
      upper: ['chestPress', 'seatedRow', 'latPull', 'wallSlide', 'deadBug'],
      lower: ['legPress', 'legCurl', 'bridge', 'hipAbduction', 'calf']
    } : {
      full: ['chairSquat', 'wallPush', band ? 'bandRow' : 'bridge', band ? 'bridge' : 'birdDog', 'deadBug'],
      upper: ['wallPush', band ? 'bandRow' : 'wallSlide', 'birdDog', band ? 'wallSlide' : 'deadBug', 'bridge'],
      lower: ['chairSquat', 'bridge', 'calf', 'deadBug', 'birdDog']
    };
    const schedule = new Map(schedules[prefs.days]);
    const labels = { full: '전신 근력', upper: '상체 근력', lower: '하체 근력' };
    const days = weekdays.map((weekday, index) => {
      const kind = schedule.get(index);
      if (!kind) return { index, weekday, type: 'recovery', title: '휴식과 가벼운 움직임', duration: 15, exercises: [{ ...catalog.walk, sets: 1, reps: '10분 · 선택' }, { ...catalog.mobility, sets: 1 }] };
      if (kind === 'cardio') return { index, weekday, type: 'cardio', title: '유산소 · 내 페이스로', duration: prefs.minutes, exercises: [{ ...catalog.cardio, sets: 1, reps: `${prefs.minutes - 10}분 · 준비·정리 각 5분` }] };
      const chosen = pools[kind].slice(0, count).map(key => ({ ...catalog[key], sets }));
      return { index, weekday, type: 'strength', title: labels[kind], duration: prefs.minutes, exercises: chosen };
    });
    return {
      title: `${goalNames[prefs.goal]} · 주 ${prefs.days}일`,
      reason: [
        `주 ${prefs.days}일, 한 번에 약 ${prefs.minutes}분을 기준으로 구성했어요. 준비·정리 운동 시간을 포함한 시작 계획이에요.`,
        `${beginner ? '입문자는' : '운동 경험자는'} 동작마다 ${sets}세트로 시작해요. 2–3회를 더 할 여유를 남기고, 세트 사이 60–90초 쉬어요.`,
        gym ? '헬스장 기구를 사용하는 동작을 넣었어요. 기구 사용법과 편안한 중량을 먼저 확인해주세요.' : band ? '맨몸 운동에 밴드로 당기는 동작을 더했어요. 밴드의 고정 상태를 확인해주세요.' : '집에서 별도 운동 기구 없이 할 수 있는 동작을 골랐어요. 의자와 지지대는 움직이지 않게 고정해주세요.',
        prefs.goal === 'gain' ? '근육 증가 목표에서는 근력 운동을 중심으로 구성했어요. 동작이 편안해지면 수행 기록을 보며 조금씩 조정해주세요.' : prefs.goal === 'loss' ? '체지방 감량 목표에서도 근력 운동을 유지하고 유산소 운동을 함께 배치했어요.' : '근력과 일상 속 유산소 운동을 함께 꾸준히 하는 시작 계획이에요.',
        '체성분 수치는 변화 추적에 쓰며, 운동 목표·경험·시간·일수·장소·기구가 루틴 구성을 결정해요. 체성분 수치만으로 운동 능력이나 질환을 판단하지 않아요.'
      ],
      days
    };
  }

  function parseOcr(text) {
    if (typeof text !== 'string') return { values: {}, matched: [] };
    const source = text.replace(/\u00a0/g, ' ');
    const definitions = {
      height: { label: /(?:신장|키|\bHeight\b)/gi, unit: '(?:cm|㎝)' },
      age: { label: /(?:나이|\bAge\b)/gi, unit: '(?:세|years?)' },
      weight: { label: /(?:체중|\bWeight\b)/gi, unit: '(?:kg|㎏)' },
      muscle: { label: /(?:골격근량|Skeletal\s*Muscle\s*Mass|\bSMM\b)/gi, unit: '(?:kg|㎏)' },
      fat: { label: /(?:체지방률|Percent\s*Body\s*Fat|\bPBF\b)/gi, unit: '(?:%|％)' }
    };
    const values = {};
    for (const [field, definition] of Object.entries(definitions)) {
      const candidates = [];
      for (const labelMatch of source.matchAll(definition.label)) {
        const prefix = source.slice(Math.max(0, labelMatch.index - 12), labelMatch.index);
        if (/(?:목표|표준|적정|권장|target|standard)\s*$/i.test(prefix)) continue;
        // Read only the immediate value after a known label, never a later graph/table value.
        const tail = source.slice(labelMatch.index + labelMatch[0].length, labelMatch.index + labelMatch[0].length + 70);
        const valuePattern = new RegExp('^\\s*(?:[（(]\\s*' + definition.unit + '\\s*[)）])?\\s*[:：]?\\s*(-?\\d{1,3}(?:[.,]\\d{1,2})?)(?![\\d.,])', 'i');
        const match = tail.match(valuePattern);
        if (!match) continue;
        const value = number(match[1]);
        if (value == null || value < bounds[field][0] || value > bounds[field][1] || (field === 'age' && !Number.isInteger(value))) continue;
        // A reference interval immediately following a label is not a measured value.
        const remainder = tail.slice(match[0].length);
        if (/^\s*(?:-|–|~|〜)\s*\d/.test(remainder)) continue;
        candidates.push(value);
      }
      const unique = [...new Set(candidates)];
      if (unique.length === 1) values[field] = unique[0];
    }
    return { values, matched: Object.keys(values) };
  }
  function demoMeasurements() {
    const offsets = [70, 56, 42, 28, 14, 0];
    const weights = [68.4, 68.0, 67.6, 67.4, 66.9, 66.5];
    const muscles = [27.1, 27.2, 27.3, 27.4, 27.5, 27.7];
    const fats = [25.8, 25.3, 24.9, 24.6, 24.0, 23.6];
    return offsets.map((offset, index) => {
      const date = new Date(); date.setHours(12, 0, 0, 0); date.setDate(date.getDate() - offset);
      return { id: `demo-${index + 1}`, date: dateString(date), height: 170, age: 28, weight: weights[index], muscle: muscles[index], fat: fats[index], at: date.getTime() };
    });
  }
  return { SCHEMA_VERSION, today, validateMeasurement, computed, cleanMeasurements, latestComparison, generateRoutine, parseOcr, demoMeasurements, catalog };
});
