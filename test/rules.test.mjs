// 장면 설계도 규칙·읽기 변환 시험 (v2)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validatePlan, planNumbers, outroScene, PLAN_LIMITS, KIND_DATA, BANNED } from '../src/rules.mjs';
import { toSpeech } from '../src/readout.mjs';

const PLAN = JSON.parse(readFileSync(new URL('./fixtures/plan.json', import.meta.url), 'utf8'));
const LONG = JSON.parse(readFileSync(new URL('./fixtures/plan-long.json', import.meta.url), 'utf8'));
const plan = () => structuredClone(PLAN);
const has = (v, word) => v.some((x) => x.includes(word));

test('정상 설계도 통과', () => {
  assert.deepEqual(validatePlan(plan()), []);
});

test('정상 설계도 통과: 글자 상한에 딱 맞는 긴 data도 통과', () => {
  const p = plan();
  for (const [kind, data] of Object.entries(LONG)) {
    if (kind === 'outro') continue;
    const s = p.scenes.find((x) => x.kind === kind);
    if (s) s.data = structuredClone(data);
    else p.scenes.splice(1, 0, { kind, say: '설명해요', text: '자막', mood: 'explain', data: structuredClone(data) });
  }
  p.scenes = p.scenes.slice(0, PLAN_LIMITS.maxScenes);
  p.scenes[p.scenes.length - 1] = { ...outroScene('econ') };
  // 글자 수는 맞춰 둔다
  const n = p.scenes.reduce((a, s) => a + s.say.length, 0);
  p.scenes[1].say += '가'.repeat(Math.max(0, 320 - n));
  assert.deepEqual(validatePlan(p), []);
  assert.ok(Object.keys(KIND_DATA).length === 9);
});

test('장면 5개·11개는 위반', () => {
  const p5 = plan(); p5.scenes.splice(2, 3);
  assert.ok(has(validatePlan(p5), '장면 5개'));
  const p11 = plan(); const extra = p11.scenes[2];
  while (p11.scenes.length < 11) p11.scenes.splice(2, 0, structuredClone(extra));
  assert.ok(has(validatePlan(p11), '장면 11개'));
});

test('첫 장면이 keyword면 위반', () => {
  const p = plan(); p.scenes[0] = structuredClone(p.scenes.find((s) => s.kind === 'keyword'));
  assert.ok(has(validatePlan(p), '첫 장면'));
});

test('마지막이 outro가 아니면 위반', () => {
  const p = plan(); p.scenes.pop(); p.scenes.push(structuredClone(p.scenes[2]));
  assert.ok(has(validatePlan(p), '마지막 장면'));
});

test('kind data 모양: bars rows에 to가 없으면 위반', () => {
  const p = plan(); delete p.scenes.find((s) => s.kind === 'bars').data.rows[0].to;
  const v = validatePlan(p);
  assert.ok(v.some((x) => x.includes('bars') && x.includes('to')), v.join(' / '));
});

test('kind data 모양: 줄 수가 범위 밖이면 위반 (compare 1줄, steps 5개)', () => {
  const p = plan();
  p.scenes.find((s) => s.kind === 'compare').data.left.rows = ['하나'];
  p.scenes.find((s) => s.kind === 'steps').data.items = ['가', '나', '다', '라', '마'];
  const v = validatePlan(p);
  assert.ok(v.some((x) => x.includes('compare') && x.includes('rows')), v.join(' / '));
  assert.ok(v.some((x) => x.includes('steps') && x.includes('items')), v.join(' / '));
});

test('모르는 장면 종류·말투는 위반', () => {
  const p = plan(); p.scenes[2].kind = 'chart'; p.scenes[3].mood = 'angry';
  const v = validatePlan(p);
  assert.ok(has(v, "'chart'"));
  assert.ok(has(v, "'angry'"));
});

test('아이콘이 목록 밖이면 위반', () => {
  const p = plan(); p.scenes.find((s) => s.kind === 'icons').data.items[0].icon = 'rocket';
  assert.ok(has(validatePlan(p), 'rocket'));
});

test('글자 상한 초과(label 9자) 위반', () => {
  const p = plan(); p.scenes[0].data.left.label = '가나다라마바사아자';
  const v = validatePlan(p);
  assert.ok(v.some((x) => x.includes('label') && x.includes('9자')), v.join(' / '));
});

test('말 글자 수가 범위 밖이면 위반', () => {
  const p = plan(); p.scenes[2].say += '가'.repeat(200);
  assert.ok(has(validatePlan(p), '길이'));
  const q = plan(); q.scenes.forEach((s) => { s.say = s.say.slice(0, 20); });
  assert.ok(has(validatePlan(q), '길이'));
});

test('권유 표현 위반', () => {
  for (const bad of ['삼성전자를 사세요', '이 주식은 반드시 오를 거예요', '지금이 매수 추천 시점']) {
    const p = plan(); p.scenes[2].say = p.scenes[2].say.slice(bad.length) + bad;
    assert.ok(has(validatePlan(p), '권유'), bad);
  }
  const c = plan(); c.caption += ' 지금 사세요';
  assert.ok(has(validatePlan(c), '권유'));
  assert.ok(BANNED.length >= 5);
});

test('이름 막기: names에 있는 이름이 say·text·caption에 있으면 위반', () => {
  const names = ['홍길동'];
  assert.deepEqual(validatePlan(plan(), { names }), []);
  const a = plan(); a.scenes[1].say = a.scenes[1].say.replace('이번 주', '홍길동 님');
  assert.ok(has(validatePlan(a, { names }), '실명'));
  const b = plan(); b.scenes[2].text = '홍길동의 정리';
  assert.ok(has(validatePlan(b, { names }), '실명'));
  const c = plan(); c.caption = '발표 홍길동';
  assert.ok(has(validatePlan(c, { names }), '실명'));
  // 위반 문구에 이름 자체는 넣지 않는다 (로그·앱에 남지 않게)
  assert.ok(!validatePlan(c, { names }).join(' ').includes('홍길동'));
});

test('해시태그 6개 위반', () => {
  const p = plan(); p.hashtags = ['#a', '#b', '#c', '#d', '#e', '#f'];
  assert.ok(has(validatePlan(p), '해시태그'));
});

test('말로 하는 고지 규칙 없음: fin에 투자 권유 문장이 없어도 통과', () => {
  const p = plan(); p.slot = 'fin';
  p.scenes[p.scenes.length - 1] = outroScene('fin');
  assert.ok(!p.scenes.some((s) => /투자\s*권유/.test(s.say)));
  assert.deepEqual(validatePlan(p), []);
});

test('outroScene: 슬롯 캐릭터의 끝인사', () => {
  assert.deepEqual(outroScene('econ'), { kind: 'outro', say: '위클리 경제였어요. 다음 주에 또 만나요!', text: '위클리 경제였어요. 다음 주에 또 만나요!', mood: 'smile', data: {} });
  assert.equal(outroScene('fin').say, '위클리 금융이었어요. 다음 주에 또 만나요!');
});

test('planNumbers: say·text·data 속 숫자 (쉼표 빼고)', () => {
  const n = planNumbers(plan());
  for (const x of ['1400', '100', '12', '14']) assert.ok(n.has(x), x);
  assert.ok(!n.has('1,400'));
  assert.ok(!n.has('999'));
});

test('toSpeech: 숫자·단위·영문 약어를 소리 나는 대로', () => {
  assert.equal(toSpeech('금리 2.5%, GDP 3조 원'), '금리 이 점 오 퍼센트, 지디피 삼 조 원');
  assert.equal(toSpeech('1,200원'), '천이백 원');
  assert.equal(toSpeech('10000원'), '만 원');
  assert.equal(toSpeech('0.25%p 인상'), '영 점 이 오 퍼센트포인트 인상');
  assert.equal(toSpeech('3명이 발표'), '세 명이 발표');
  assert.equal(toSpeech('-1.5%'), '마이너스 일 점 오 퍼센트');
  assert.equal(toSpeech('1억 2,345만 원'), '일 억 이천삼백사십오 만 원');
});
