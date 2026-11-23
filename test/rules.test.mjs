// 대본 규칙·읽기 변환 시험
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, spokenLength, outroLine, BANNED } from '../src/rules.mjs';
import { toSpeech } from '../src/readout.mjs';

// 글자 수를 맞춘 정상 대본 만들기
function make(len, extra = {}) {
  const beats = [
    { line: '', show: { type: 'number', value: '2.5', unit: '%', text: '기준금리' }, mood: 'explain' },
    { line: '', show: { type: 'compare', a: '한국', b: '미국', text: '금리 차이' }, mood: 'stress' },
    { line: '', show: { type: 'keyword', text: '환율' }, mood: 'surprise' },
  ];
  const s = { slot: 'econ', week: '11월 4주차', presenter: '발표자', title: '금리와 환율', hook: '금리는 그대로인데 환율은 왜 올랐을까?', beats, summary: '금리 차이가 벌어지면 환율이 오른다.', caption: '이번 주 위클리 경제 정리', ...extra };
  const base = spokenLength({ ...s, beats: beats.map((b) => ({ ...b, line: '' })) });
  const each = Math.floor((len - base) / beats.length);
  s.beats = beats.map((b, i) => ({ ...b, line: '가'.repeat(i === beats.length - 1 ? len - base - each * (beats.length - 1) : each) }));
  return s;
}

test('길이: 400자 정상 대본은 통과', () => {
  const s = make(400);
  assert.equal(spokenLength(s), 400);
  assert.deepEqual(validate(s), []);
});
test('길이: 1000자·280자는 길이 위반', () => {
  assert.ok(validate(make(1000)).some((v) => v.includes('길이')));
  assert.ok(validate(make(280)).some((v) => v.includes('길이')));
});
test('권유: 종목 매수·단정 표현은 권유 위반', () => {
  for (const bad of ['삼성전자를 사세요', '이 주식은 반드시 오를 거예요', '지금이 매수 추천 시점']) {
    const s = make(400);
    s.beats[0].line = s.beats[0].line.slice(bad.length) + bad;
    assert.ok(validate(s).some((v) => v.includes('권유')), bad);
  }
  assert.ok(BANNED.length >= 5);
});
test('고지: 금융 릴스는 투자 권유 아님 문구가 있어야 함', () => {
  const s = make(400, { slot: 'fin' });
  assert.ok(validate(s).some((v) => v.includes('고지')));
  s.summary = '투자 권유가 아니에요. ' + s.summary;
  s.beats[2].line = s.beats[2].line.slice('투자 권유가 아니에요. '.length);
  assert.deepEqual(validate(s), []);
});
test('끝장: 주차·발표자 형식', () => {
  assert.equal(outroLine(make(400)), '황금나침반 11월 4주차 위클리 · 발표 발표자');
  assert.ok(validate(make(400, { week: '이번 주' })).some((v) => v.includes('끝장')));
  assert.ok(validate(make(400, { presenter: '' })).some((v) => v.includes('끝장')));
});
test('장면: 3~5개, 알맞은 종류', () => {
  const s = make(400); s.beats = s.beats.slice(0, 2);
  assert.ok(validate(s).some((v) => v.includes('장면')));
  const t = make(400); t.beats[0].show.type = 'chart';
  assert.ok(validate(t).some((v) => v.includes('장면')));
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
