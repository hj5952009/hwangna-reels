// 줄 경계 맞추기 시험 — 목소리를 한 번에 받아 무음에서 줄을 나눈다 (설계서 6-5)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { findSilences, pickBoundaries, splitTrack } from '../src/split.mjs';

const F = JSON.parse(readFileSync(new URL('./fixtures/scb-split.json', import.meta.url), 'utf8'));
const sil = (list) => list.map(([start, end]) => ({ start, end }));
const inGap = (c, [a, b]) => c >= a - 0.15 && c <= b + 0.15;

test('SCB 자료: -35dB 무음으로 경계 8개가 모두 정답 틈 ±0.15초 안', () => {
  const { cuts, timing } = pickBoundaries(sil(F.silences.db35), F.lineChars, F.total);
  assert.equal(cuts.length, F.gaps.length);
  cuts.forEach((c, i) => assert.ok(inGap(c, F.gaps[i]), `경계 ${i + 1}: ${c.toFixed(2)}초가 ${F.gaps[i]} 밖`));
  assert.equal(timing, 'exact');
});

test('-40dB 목록만 줘도 2번 경계가 줄 안 쉼에 붙지 않음', () => {
  const { cuts } = pickBoundaries(sil(F.silences.db40), F.lineChars, F.total);
  // 9.65~9.96초 무음은 3번 줄 안의 쉼이다
  assert.ok(!(cuts[1] >= 9.6 && cuts[1] <= 10.0), `2번 경계 ${cuts[1].toFixed(2)}초가 줄 안 쉼에 붙음`);
  cuts.forEach((c, i) => assert.ok(inGap(c, F.gaps[i]), `경계 ${i + 1}: ${c.toFixed(2)}초`));
});

test('긴 무음이 조금 더 멀어도 짧은 숨보다 먼저 고름 (가중치)', () => {
  // 어림값 5.0초: 4.9초의 짧은 숨(0.05초) vs 5.6초의 긴 무음(0.5초)
  const { cuts } = pickBoundaries([{ start: 4.875, end: 4.925 }, { start: 5.35, end: 5.85 }], [10, 10], 10);
  assert.ok(Math.abs(cuts[0] - 5.6) < 0.01, `${cuts[0]}`);
});

test('무음이 없으면 timing estimate, 경계는 0<…<total 증가', () => {
  const { cuts, timing } = pickBoundaries([], [10, 20, 30, 40], 20);
  assert.equal(timing, 'estimate');
  assert.equal(cuts.length, 3);
  let prev = 0;
  for (const c of cuts) { assert.ok(c > prev && c < 20, `${c}`); prev = c; }
  assert.ok(Math.abs(cuts[0] - 2) < 0.01); // 글자 수 비율
});

test('줄이 하나면 경계 없음', () => {
  assert.deepEqual(pickBoundaries([], [10], 5), { cuts: [], timing: 'exact' });
});

// 24kHz 16bit: 소리(사인파) 1초 · 무음 0.4초 · 소리 1초
function synth(parts, rate = 24000) {
  const n = parts.reduce((a, [sec]) => a + Math.round(sec * rate), 0);
  const b = Buffer.alloc(n * 2); let i = 0;
  for (const [sec, loud] of parts) for (let k = 0; k < Math.round(sec * rate); k++, i++) b.writeInt16LE(loud ? Math.round(Math.sin(i / 7) * 9000) : 0, i * 2);
  return b;
}

test('findSilences: 합성 pcm(소리 1초·무음 0.4초·소리 1초)에서 무음 1개 [1.0,1.4]±0.02', () => {
  const s = findSilences(synth([[1, true], [0.4, false], [1, true]]), 24000);
  assert.equal(s.length, 1);
  assert.ok(Math.abs(s[0].start - 1.0) <= 0.02 && Math.abs(s[0].end - 1.4) <= 0.02, JSON.stringify(s));
  // min보다 짧은 무음은 무시
  assert.equal(findSilences(synth([[1, true], [0.1, false], [1, true]]), 24000).length, 0);
});

test('splitTrack: 무음에서 줄을 나누고 줄마다 시작·끝·길이·입 모양(30fps)', () => {
  const rate = 24000;
  const pcm = synth([[0.1, false], [1.2, true], [0.4, false], [1.2, true], [0.1, false]]);
  const t = splitTrack({ wav: 'v.wav', pcm, rate, lines: ['가나다라마바', '가나다라마바'] });
  assert.equal(t.wav, 'v.wav'); assert.equal(t.rate, rate); assert.equal(t.timing, 'exact');
  assert.ok(Math.abs(t.total - 3.0) < 0.01);
  assert.equal(t.lines.length, 2);
  const [a, b] = t.lines;
  assert.equal(a.from, 0); assert.ok(Math.abs(b.to - t.total) < 1e-9);
  assert.equal(a.to, b.from);
  assert.ok(Math.abs(a.to - 1.5) < 0.03, `경계 ${a.to}`);
  assert.ok(Math.abs(a.sec - (a.to - a.from)) < 1e-9);
  assert.ok(Math.abs(a.rms.length - Math.round(a.sec * 30)) <= 1);
  assert.ok(Math.max(...a.rms) > 0.9 && Math.max(...a.rms) <= 1);
  assert.ok(a.rms.at(-1) < 0.05); // 줄 끝 무음은 입을 다묾
  assert.equal(a.text, '가나다라마바');
});
