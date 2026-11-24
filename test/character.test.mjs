// 캐릭터 시험: 슬롯별 캐릭터 설정 + 그림이 주마다 바뀌지 않게 굵은 격자 스냅숏으로 고정
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CHARACTERS } from '../src/brand.js';
import { VARIANTS } from '../src/character.js';
import { openHarness } from './browser-helper.mjs';

const SNAP = new URL('./fixtures/character-sig.json', import.meta.url);
let H;
before(async () => { H = await openHarness(); });
after(async () => { await H.done(); });

test('CHARACTERS: 경제는 나침이 A·Puck, 금융은 콕이 S·Iapetus', () => {
  assert.equal(CHARACTERS.econ.variant, 'A');
  assert.equal(CHARACTERS.econ.name, '나침이');
  assert.equal(CHARACTERS.econ.voice, 'Puck');
  assert.equal(CHARACTERS.fin.variant, 'S');
  assert.equal(CHARACTERS.fin.name, '콕이');
  assert.equal(CHARACTERS.fin.voice, 'Iapetus');
  for (const s of ['econ', 'fin']) {
    for (const k of ['style', 'tone', 'outro']) assert.ok(String(CHARACTERS[s][k]).trim().length > 5, `${s}.${k}`);
    assert.equal(CHARACTERS[s].pitch, 0);
  }
});

test('VARIANTS에는 A와 S만 있음', () => {
  assert.deepEqual(Object.keys(VARIANTS).sort(), ['A', 'S']);
});

test('그림 스냅숏: 형·동생 × 표정 4가 고정값과 같음', async (t) => {
  const got = {};
  for (const variant of ['A', 'S']) {
    for (const mood of ['explain', 'surprise', 'stress', 'smile']) {
      got[`${variant}-${mood}`] = await H.page.evaluate(([v, m]) => window.sig(400, 420, (c, T) => {
        T.drawCharacter(c, { variant: v, mood: m, x: 200, y: 230, t: 0, blink: 0, mouth: 0, needle: v === 'S' ? 'fin' : 'econ' });
      }), [variant, mood]);
    }
  }
  assert.deepEqual(H.errors, []);
  // 형과 동생은 달라야 한다
  assert.notDeepEqual(got['A-explain'], got['S-explain']);
  if (!existsSync(SNAP)) { writeFileSync(SNAP, JSON.stringify(got)); t.skip('스냅숏을 처음 만들었어요 — 다시 돌리면 비교해요'); return; }
  const want = JSON.parse(readFileSync(SNAP, 'utf8'));
  for (const k of Object.keys(want)) {
    const diff = Math.max(...want[k].flatMap((px, i) => px.map((v, j) => Math.abs(v - got[k][i][j]))));
    assert.ok(diff <= 12, `${k} 그림이 달라졌어요 (최대 차이 ${diff})`);
  }
});
