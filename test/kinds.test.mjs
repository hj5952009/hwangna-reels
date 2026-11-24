// 장면 종류 9개·아이콘 20개: 금지 구역 겹침·글자 넘침·끝장 형제 (Playwright로 harness.html에서 그린다)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openHarness } from './browser-helper.mjs';

const LONG = JSON.parse(readFileSync(new URL('./fixtures/plan-long.json', import.meta.url), 'utf8'));
const NAMES = ['shop', 'bank', 'factory', 'house', 'money', 'won', 'dollar', 'chartUp', 'chartDown', 'person', 'phone', 'globe', 'doc', 'search', 'check', 'warn', 'clock', 'ship', 'oil', 'card'];
// 짧은 자료(최소 개수)도 같이 본다
const SHORT = {
  bars: { rows: [{ label: '방문', from: 10, to: 50, unit: '회' }, { label: '주문', from: 30, to: 31, unit: '건' }] },
  steps: { style: 'check', items: ['금리', '이자'] },
  icons: { items: [{ icon: 'won', label: '원화' }, { icon: 'dollar', label: '달러' }] },
  compare: { left: { title: '전', rows: ['과거', '대표자'] }, right: { title: '후', rows: ['미래', '사업자'] } },
  bignum: { value: '3.5', unit: '%', label: '기준금리' },
};
// 상한을 조금(1.5배까지) 넘긴 글자 — 규칙 검사가 봐주는 범위라 그리기가 줄이거나 줄을 바꿔 넘치지 않아야 함
const stretch = (x, k) => (typeof x === 'string' && !['icon', 'style'].includes(k) ? x + [...x].slice(0, Math.ceil([...x].length * 0.5)).join('')
  : Array.isArray(x) ? x.map((y) => stretch(y)) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([kk, v]) => [kk, stretch(v, kk)])) : x);
const OVER = Object.fromEntries(Object.entries(LONG).filter(([k]) => k !== 'outro').map(([k, d]) => [k, stretch(d)]));
const ALL = Object.entries(LONG).map(([kind, data]) => ({ kind, data, tag: 'long' }))
  .concat(Object.entries(OVER).map(([kind, data]) => ({ kind, data, tag: 'over' })))
  .concat([{ kind: 'steps', data: { ...LONG.steps, style: 'check' }, tag: 'long-check' }])
  .concat(Object.entries(SHORT).map(([kind, data]) => ({ kind, data, tag: 'short' })));

let H;
before(async () => { H = await openHarness(); });
after(async () => { await H?.done(); });

test('ICONS는 20개이고 모두 그려짐', async () => {
  const r = await H.page.evaluate(() => {
    const out = {};
    for (const name of T.ICONS) {
      const cv = document.createElement('canvas'); cv.width = 80; cv.height = 80; const c = cv.getContext('2d');
      T.drawIcon(c, name, 40, 40, 80, '#2F7D6B');
      const d = c.getImageData(0, 0, 80, 80).data; let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 30) n++;
      out[name] = n;
    }
    const c = document.createElement('canvas').getContext('2d');
    let bad = 'ok'; try { T.drawIcon(c, '없는것', 40, 40, 80, '#000'); } catch (e) { bad = String(e); }
    return { list: T.ICONS, px: out, bad };
  });
  assert.deepEqual(r.list, NAMES);
  for (const n of NAMES) assert.ok(r.px[n] > 200, `${n} 픽셀 ${r.px[n]}`);
  assert.equal(r.bad, 'ok', '모르는 아이콘 이름에도 멈추지 않음');
});

test('겹침: 9종 × 진행(0.1,0.5,1, lt 99) × 긴 글자 — 금지 구역 픽셀 0', async () => {
  const kinds = await H.page.evaluate(() => Object.keys(T.KINDS));
  assert.deepEqual([...kinds].sort(), ['bars', 'bignum', 'compare', 'formula', 'icons', 'keyword', 'outro', 'question', 'steps']);
  const r = await H.page.evaluate((cases) => {
    const W = 1080, Hh = 1920; const cv = document.createElement('canvas'); cv.width = W; cv.height = Hh; const c = cv.getContext('2d');
    const count = (x0, y0, w, h) => { if (w <= 0 || h <= 0) return 0; const d = c.getImageData(x0, y0, w, h).data; let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k] > 30) n++; return n; };
    // 캐릭터 상자: 형·동생을 left 자리에 여러 표정·시간으로 그려 합친 실제 범위 + 여유 12px
    const P = T.CHAR_POS.left; let bx0 = W, by0 = Hh, bx1 = 0, by1 = 0;
    for (const variant of ['A', 'S']) for (const mood of ['explain', 'surprise', 'stress', 'smile']) for (const t of [0, 0.15, 0.3, 0.45, 0.6]) {
      c.clearRect(0, 0, W, Hh);
      T.drawCharacter(c, { variant, mood, x: P.x, y: P.y, scale: P.s, t, point: 1, mouth: 1, needle: variant === 'S' ? 'fin' : 'econ' });
      const d = c.getImageData(0, 0, W, Hh).data;
      for (let y = 0; y < Hh; y += 2) for (let x = 0; x < W; x += 2) if (d[(y * W + x) * 4 + 3] > 30) { if (x < bx0) bx0 = x; if (x > bx1) bx1 = x; if (y < by0) by0 = y; if (y > by1) by1 = y; }
    }
    const box = { x0: Math.max(0, bx0 - 12), y0: Math.max(0, by0 - 12), x1: Math.min(W, bx1 + 12), y1: Math.min(Hh, by1 + 12) };
    const bad = [];
    for (const k of cases) {
      const pos = T.KIND_POS[k.kind];
      for (const slot of ['econ', 'fin']) for (const p of [0.1, 0.5, 1]) for (const lt of [0.3, 1, 99]) {
        c.clearRect(0, 0, W, Hh);
        T.KINDS[k.kind](c, k.data, p, lt, slot);
        const r = { top: count(0, 0, W, 395), left: count(0, 395, 40, 860), right: count(1040, 395, 40, 860), cap: count(0, 1255, W, Hh - 1255) };
        if (pos === 'left') r.char = count(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
        if (Object.values(r).some((v) => v > 0)) bad.push({ kind: k.kind, tag: k.tag, slot, p, lt, ...r });
      }
    }
    return { box, bad };
  }, ALL);
  assert.ok(r.box.x1 > r.box.x0 && r.box.y1 > r.box.y0, '캐릭터 상자를 찾음');
  assert.deepEqual(r.bad, [], JSON.stringify(r.bad.slice(0, 6)));
  assert.deepEqual(H.errors, []);
});

test('넘침: 글자 상자 폭 초과 0', async () => {
  const r = await H.page.evaluate((cases) => {
    const proto = CanvasRenderingContext2D.prototype; const orig = proto.fillText; const bad = []; let calls = 0;
    proto.fillText = function (s, x, y, maxW) {
      calls++; const w = this.measureText(String(s)).width;
      if (maxW === undefined || w > maxW + 1) bad.push({ s: String(s), w: Math.round(w), maxW });
      return orig.call(this, s, x, y, maxW);
    };
    const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; const c = cv.getContext('2d');
    try {
      for (const k of cases) for (const slot of ['econ', 'fin']) for (const lt of [0.3, 99]) T.KINDS[k.kind](c, k.data, 1, lt, slot);
    } finally { proto.fillText = orig; }
    return { calls, bad };
  }, ALL);
  assert.ok(r.calls > 50, `글자를 그림 (${r.calls})`);
  assert.deepEqual(r.bad, [], JSON.stringify(r.bad.slice(0, 6)));
});

test('outro: 형제가 함께 나옴', async () => {
  const r = await H.page.evaluate((data) => {
    const out = {};
    const near = (d, k, hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); return Math.abs(d[k] - v[0]) < 12 && Math.abs(d[k + 1] - v[1]) < 12 && Math.abs(d[k + 2] - v[2]) < 12 && d[k + 3] > 200; };
    for (const slot of ['econ', 'fin']) {
      const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; const c = cv.getContext('2d');
      T.KINDS.outro(c, data, 1, 99, slot);
      const S = T.STAGE; const d = c.getImageData(S.x0, S.y0, S.x1 - S.x0, S.y1 - S.y0).data;
      let yellow = 0, jade = 0; for (let k = 0; k < d.length; k += 4) { if (near(d, k, T.BRAND.yellow)) yellow++; if (near(d, k, T.SLOT.fin.accent)) jade++; }
      out[slot] = { yellow, jade };
    }
    return out;
  }, LONG.outro);
  for (const slot of ['econ', 'fin']) {
    assert.ok(r[slot].yellow > 2000, `${slot} 노랑 몸 ${r[slot].yellow}`);
    assert.ok(r[slot].jade > 2000, `${slot} 옥색 테 ${r[slot].jade}`);
  }
});
