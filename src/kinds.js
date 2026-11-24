// 장면 종류 9개 — 설계도(plan)의 scene.kind·data를 받아 코드로 그림을 그린다 (설계서 v2 6-3)
// KINDS[kind](ctx, data, p, lt, slot)
//   p    0~1 이 장면 대사를 말한 정도 (항목이 말에 맞춰 하나씩 나옴)
//   lt   장면 시작 후 초 (튀어나옴·그려짐 같은 짧은 움직임)
//   slot 'econ' | 'fin' (색)
// 그림은 STAGE(x 72~1008, y 395~1150) 안에만 그린다. 머리띠(y<395)·자막(y≥1255)·좌우 끝을 넘지 않고,
// 캐릭터가 왼쪽 아래(CHAR_POS.left)에 서는 종류는 y≈900 아래 왼쪽을 비운다 — test/kinds.test.mjs가 픽셀로 센다.
import { BRAND, SLOT, FONTS, CHARACTERS, HANDLE } from './brand.js';
import { drawCharacter } from './character.js';
import { drawIcon } from './icons.js';
import { drawFit } from './text.js';

// 캐릭터 자리: question은 가운데 크게, outro는 장면이 형제를 직접 그림(none), 나머지는 왼쪽 아래에서 그림을 가리킴
export const CHAR_POS = { center: { x: 540, y: 1100, s: 1.25 }, left: { x: 190, y: 1120, s: 0.95 } };
export const KIND_POS = { question: 'center', bignum: 'left', keyword: 'left', formula: 'left', compare: 'left', bars: 'left', steps: 'left', icons: 'left', outro: 'none' };

const X0 = 72, X1 = 1008, W = X1 - X0, CX = 540;
const TT = (s) => `400 ${s}px ${FONTS.title}`;
const BB = (w) => (s) => `${w} ${s}px ${FONTS.body}`;
const cl = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const EASE = (k) => 1 - Math.pow(1 - cl(k), 3);
const BACK = (k) => { const c = 1.7; const q = cl(k) - 1; return 1 + (c + 1) * q * q * q + c * q * q; };
const lerp = (a, b, k) => a + (b - a) * k;
const seg = (v, a, b) => cl((v - a) / (b - a));

function colors(slot) {
  const S = SLOT[slot] || SLOT.econ;
  return { acc: S.accent, on: S.onAccent, tint: S.tint, text: S.accent === BRAND.yellow ? BRAND.brown : S.accent };
}
function rr(c, x, y, w, h, r, fill, stroke, lw = 4) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
// 흰 카드: 그림자는 옅게(알파 0.10) — 금지 구역 검사에 그림자가 잡히지 않게
function card(c, x, y, w, h, fill = '#FFFFFF') {
  c.save(); c.shadowColor = 'rgba(63,47,28,0.10)'; c.shadowBlur = 18; c.shadowOffsetY = 6; rr(c, x, y, w, h, 26, fill); c.restore();
  rr(c, x, y, w, h, 26, null, BRAND.brown, 5);
}
function sparkle(c, x, y, r, col, k) {
  if (k <= 0) return; const rr0 = r * BACK(k);
  c.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; const q = i % 2 ? rr0 * 0.32 : rr0; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath(); c.fillStyle = col; c.fill();
}
// 도장: 커졌다가 쾅 (시작 1.4배 → 1배, 살짝 기울임)
function stamp(c, x, y, label, col, k) {
  if (k <= 0) return;
  const s = lerp(1.4, 1, BACK(k)); c.save(); c.translate(x, y); c.rotate(-0.18); c.scale(s, s); c.globalAlpha *= cl(k * 3);
  rr(c, -90, -40, 180, 80, 16, 'rgba(255,255,255,0.92)', col, 8);
  drawFit(c, label, 0, 4, 150, 60, 36, 1, TT, col);
  c.restore();
}
// 숫자 글자를 0에서 목표까지 세기 ('99,999.9' '-2.1' '3' 같은 꼴만; 아니면 그대로)
function countUp(str, k) {
  const s = String(str ?? ''); const m = s.match(/^([+-]?)([\d,]+)(\.(\d+))?$/);
  if (!m || k >= 1) return s;
  const target = Number(m[2].replace(/,/g, '') + (m[3] || '')); const dec = m[4] ? m[4].length : 0;
  const v = target * EASE(k);
  const out = v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec, useGrouping: m[2].includes(',') });
  return m[1] + out;
}
const fmtNum = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString('en-US') : String(n ?? ''));

// ── question: 아이콘 두 개 + 잇는 화살표 + 결과 도장 (캐릭터가 가운데 아래 → 그림은 y 830 위)
function question(c, d, p, lt, slot) {
  const k = colors(slot); const L = d.left || {}, R = d.right || {};
  const side = (x, it, k0) => {
    const e = seg(lt, k0, k0 + 0.5); if (e <= 0) return;
    c.save(); c.globalAlpha *= cl(e * 2); c.translate(x, 600); const s = lerp(0.7, 1, BACK(e)); c.scale(s, s);
    rr(c, -150, -150, 300, 300, 40, '#FFFFFF', BRAND.brown, 5);
    drawIcon(c, it.icon, 0, 0, 200, k.acc);
    c.restore();
    c.save(); c.globalAlpha *= cl(e * 2);
    drawFit(c, it.label || '', x, 800, 380, 50, 30, 1, TT, BRAND.deep);
    c.restore();
  };
  side(290, L, 0);
  // 점선 화살표 (왼쪽 → 오른쪽)
  const a = EASE(seg(lt, 0.4, 1.0));
  if (a > 0) {
    c.save(); c.setLineDash([16, 14]); c.strokeStyle = BRAND.brown; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(455, 600); c.lineTo(lerp(455, 615, a), 600); c.stroke(); c.restore();
    if (a > 0.95) { c.beginPath(); c.moveTo(630, 600); c.lineTo(608, 584); c.lineTo(608, 616); c.closePath(); c.fillStyle = BRAND.brown; c.fill(); }
  }
  side(790, R, 0.3);
  if (d.stamp) stamp(c, 790, 600, d.stamp, BRAND.up, seg(p, 0.5, 0.7));
}

// ── bignum: 큰 숫자 + 단위 (+ 비율 막대)
function bignum(c, d, p, lt, slot) {
  const k = colors(slot); const e = seg(lt, 0, 0.5);
  c.save(); c.globalAlpha *= cl(e * 2);
  drawFit(c, d.label || '', CX, 470, 900, 52, 32, 1, BB(800), BRAND.brown);
  c.restore();
  // 값·단위 크기: 둘을 합친 폭이 880 안에 들도록 (값 글자 기준, 단위는 값의 0.42배)
  const value = String(d.value ?? ''), unit = String(d.unit ?? '');
  const room = 880; let vs = 220, vw = 0, uw = 0;
  for (; vs >= 60; vs -= 4) {
    c.font = TT(vs); vw = c.measureText(value).width; c.font = TT(Math.round(vs * 0.42)); uw = c.measureText(unit).width;
    if (vw + (unit ? 14 + uw : 0) <= room * 0.94) break;
  }
  const us = Math.round(vs * 0.42); const gap = unit ? 14 : 0; const total = vw + gap + uw;
  const shown = countUp(value, seg(lt, 0.1, 1.2));
  const col = /^-/.test(value) ? BRAND.down : /^\+/.test(value) ? BRAND.up : k.text;
  const sx = CX - total / 2, by = 650;
  const pop = lerp(0.85, 1, BACK(seg(lt, 0, 0.45)));
  c.save(); c.translate(CX, by - vs * 0.3); c.scale(pop, pop); c.translate(-CX, -(by - vs * 0.3));
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  c.font = TT(vs); c.fillStyle = col; c.fillText(shown, sx, by, room - gap - uw);
  c.font = TT(us); c.fillStyle = BRAND.brown; c.fillText(unit, sx + vw + gap, by, Math.max(1, room - vw - gap));
  c.restore();
  const ratio = Number(d.ratio);
  if (Number.isFinite(ratio) && ratio > 0) {
    const r = Math.min(1, ratio) * EASE(seg(lt, 0.4, 1.6));
    rr(c, X0 + 30, 740, W - 60, 56, 28, BRAND.line);
    rr(c, X0 + 30, 740, Math.max(56, (W - 60) * r), 56, 28, k.acc);
    drawFit(c, `${Math.round(Math.min(1, ratio) * 100)}%`, X1 - 30, 840, 300, 44, 30, 1, TT, k.text, 'right');
  }
  sparkle(c, 150, 520, 26, BRAND.gold, seg(lt, 0.5, 0.9)); sparkle(c, 940, 560, 20, BRAND.gold, seg(lt, 0.7, 1.1));
}

// ── keyword: 핵심어 도장 + 한 줄 풀이
function keyword(c, d, p, lt, slot) {
  const k = colors(slot); const e = seg(lt, 0, 0.5);
  if (e > 0) {
    c.save(); c.translate(CX, 580); c.rotate(-0.05); const s = lerp(1.08, 1, BACK(e)); c.scale(s, s); c.globalAlpha *= cl(e * 3);
    const wd = measureFit(c, d.word || '', 760, 130, 56, TT);
    const bw = Math.min(840, wd.width + 90), bh = wd.size * 1.25 + 40;
    rr(c, -bw / 2, -bh / 2, bw, bh, 28, k.tint, k.acc, 10);
    drawFit(c, d.word || '', 0, 6, 760, 130, 56, 1, TT, k.text);
    c.restore();
  }
  const f2 = seg(p, 0.25, 0.5);
  if (f2 > 0) { c.save(); c.globalAlpha *= f2; drawFit(c, d.easy || '', CX, 790, 880, 52, 34, 2, BB(800), BRAND.deep, 'center', 1.3); c.restore(); }
  sparkle(c, 140, 470, 28, BRAND.gold, seg(lt, 0.4, 0.8)); sparkle(c, 950, 690, 22, BRAND.gold, seg(lt, 0.6, 1.0));
}
// 맞춘 크기와 가장 긴 줄 폭만 잰다(그리지 않음)
function measureFit(c, text, maxW, size, min, font) {
  for (let s = size; s >= min; s -= 2) { c.font = font(s); const w = c.measureText(String(text)).width; if (w <= maxW) return { size: s, width: w }; }
  c.font = font(min); return { size: min, width: Math.min(maxW, c.measureText(String(text)).width) };
}

// ── formula: A + B = C 카드 쌓기
function formula(c, d, p, lt, slot) {
  const k = colors(slot); const a = d.a || {}, b = d.b || {}, r = d.c || {};
  const one = (y, it, e, tag, fill) => {
    if (e <= 0) return;
    c.save(); c.globalAlpha *= cl(e * 2); const s = lerp(0.94, 1, EASE(e)); c.translate(CX, y + 60); c.scale(s, s); c.translate(-CX, -(y + 60));
    card(c, X0, y, W, 120);
    rr(c, X0 + 18, y + 18, 84, 84, 20, fill, BRAND.brown, 4);
    drawFit(c, tag, X0 + 60, y + 62, 60, 48, 30, 1, TT, BRAND.deep);
    drawFit(c, it.title || '', X0 + 126, y + 42, W - 150, 50, 30, 1, TT, BRAND.deep, 'left');
    drawFit(c, it.sub || '', X0 + 126, y + 90, W - 150, 32, 22, 1, BB(700), BRAND.brown, 'left');
    c.restore();
  };
  one(420, a, seg(p, 0, 0.18), 'A', BRAND.line);
  const plus = seg(p, 0.3, 0.4); if (plus > 0) { c.save(); c.globalAlpha *= plus; drawFit(c, '+', CX, 572, 80, 70, 40, 1, TT, k.text); c.restore(); }
  one(604, b, seg(p, 0.38, 0.56), 'B', k.tint);
  const eq = seg(p, 0.68, 0.86);
  if (eq > 0) {
    c.save(); c.globalAlpha *= cl(eq * 2); drawFit(c, '=', CX, 756, 80, 70, 40, 1, TT, k.text);
    const s = lerp(0.9, 1, BACK(eq)); c.translate(CX, 840); c.scale(s, s);
    rr(c, -W / 2 + 40, -50, W - 80, 100, 50, k.acc, BRAND.brown, 5);
    drawFit(c, r.title || '', 0, 4, W - 160, 58, 32, 1, TT, k.on);
    c.restore();
  }
}

// ── compare: 두 칸 비교 (2~3줄)
function compare(c, d, p, lt, slot) {
  const k = colors(slot); const L = d.left || {}, R = d.right || {};
  const n = Math.max(1, Math.min(3, Math.max((L.rows || []).length, (R.rows || []).length)));
  const top = 420, hh = 104, rh = 112, half = W / 2;
  card(c, X0, top, W, hh + rh * n);
  rr(c, X0, top, half, hh, [26, 0, 0, 0], BRAND.line);
  rr(c, X0 + half, top, half, hh, [0, 26, 0, 0], k.acc);
  rr(c, X0, top, W, hh + rh * n, 26, null, BRAND.brown, 5);
  drawFit(c, L.title || '', X0 + half / 2, top + hh / 2 + 2, half - 90, 50, 28, 1, TT, BRAND.brown);
  drawFit(c, R.title || '', X0 + half + half / 2, top + hh / 2 + 2, half - 90, 50, 28, 1, TT, k.on);
  for (let i = 0; i < n; i++) {
    const e = seg(p, 0.08 + i * 0.24, 0.24 + i * 0.24); if (e <= 0) continue;
    const y = top + hh + rh * i;
    c.save(); c.globalAlpha *= e;
    c.beginPath(); c.moveTo(X0 + 5, y); c.lineTo(X1 - 5, y); c.strokeStyle = BRAND.line; c.lineWidth = 3; c.stroke();
    rr(c, X0 + half + 10, y + 10, half - 20, rh - 20, 18, k.tint);
    drawFit(c, (L.rows || [])[i] || '', X0 + half / 2, y + rh / 2, half - 50, 36, 24, 2, BB(600), '#7A6B55', 'center', 1.15);
    drawFit(c, (R.rows || [])[i] || '', X0 + half + half / 2, y + rh / 2, half - 50, 38, 24, 2, BB(900), BRAND.deep, 'center', 1.15);
    c.restore();
  }
  // 가운데 VS 동그라미
  c.beginPath(); c.arc(CX, top + hh / 2, 34, 0, Math.PI * 2); c.fillStyle = '#FFFFFF'; c.fill(); c.strokeStyle = BRAND.brown; c.lineWidth = 4; c.stroke();
  drawFit(c, 'VS', CX, top + hh / 2 + 2, 50, 30, 20, 1, TT, BRAND.brown);
}

// ── bars: 전 → 후 막대 2~3개 + 배수
function bars(c, d, p, lt, slot) {
  const k = colors(slot); const rows = (d.rows || []).slice(0, 3);
  const pitch = rows.length <= 2 ? 200 : 158; const y0 = rows.length <= 2 ? 450 : 425;
  rows.forEach((r, i) => {
    const Y = y0 + i * pitch; const e = EASE(seg(p, 0.05 + i * 0.3, 0.35 + i * 0.3));
    const from = Number(r.from) || 0, to = Number(r.to) || 0;
    const up = to >= from; const col = up ? BRAND.up : BRAND.down;
    drawFit(c, r.label || '', X0, Y + 22, 600, 46, 28, 1, TT, BRAND.deep, 'left');
    const ratio = from ? to / from : 0;
    const mult = !from ? '' : ratio >= 1 ? `×${ratio >= 10 ? Math.round(ratio) : ratio >= 2 ? ratio.toFixed(1) : ratio.toFixed(2)}` : `−${Math.round((1 - ratio) * 100)}%`;
    if (e > 0.95 && mult) drawFit(c, mult, X1, Y + 22, 300, 62, 36, 1, TT, col, 'right');
    rr(c, X0, Y + 52, W, 48, 24, BRAND.line);
    // 줄마다 자기 전·후 중 큰 값을 끝으로 (단위가 달라도 변화가 보이게)
    const max = Math.max(Math.abs(from), Math.abs(to)) || 1;
    const w = Math.max(48, W * Math.abs(lerp(from, to, e)) / max);
    rr(c, X0, Y + 52, w, 48, 24, i === 0 ? k.acc : col);
    const cur = lerp(from, to, e);
    drawFit(c, `${fmtNum(from)} → ${fmtNum(cur)}${r.unit || ''}`, X0, Y + 128, W, 40, 26, 1, BB(800), BRAND.deep, 'left');
  });
}

// ── steps: 흐름(flow, 아래로 이어짐) 또는 체크(check)
function steps(c, d, p, lt, slot) {
  const k = colors(slot); const items = (d.items || []).slice(0, 4); const n = Math.max(1, items.length);
  if (d.style === 'check') {
    const rowH = 104, h = 60 + rowH * n, top = 420 + (4 - n) * 30;
    card(c, X0, top, W, h);
    items.forEach((s, i) => {
      const y = top + 30 + rowH * i + rowH / 2; const e = seg(p, 0.1 + i * (0.8 / n), 0.1 + (i + 0.6) * (0.8 / n));
      checkBox(c, X0 + 80, y, e, k);
      c.save(); c.globalAlpha *= 0.35 + 0.65 * cl(e * 2);
      drawFit(c, s, X0 + 140, y + 2, W - 180, 46, 28, 1, BB(800), BRAND.deep, 'left');
      c.restore();
    });
    return;
  }
  const boxH = 92, arrow = 30, total = n * boxH + (n - 1) * arrow, top = 420 + (450 - total) / 2;
  items.forEach((s, i) => {
    const e = seg(p, 0.05 + i * (0.85 / n), 0.05 + (i + 0.5) * (0.85 / n)); if (e <= 0) return;
    const y = top + i * (boxH + arrow);
    c.save(); c.globalAlpha *= cl(e * 2);
    rr(c, X0, y, W, boxH, 46, i === n - 1 ? k.tint : '#FFFFFF', BRAND.brown, 5);
    c.beginPath(); c.arc(X0 + 50, y + boxH / 2, 30, 0, Math.PI * 2); c.fillStyle = k.acc; c.fill();
    drawFit(c, String(i + 1), X0 + 50, y + boxH / 2 + 2, 40, 38, 24, 1, TT, k.on);
    drawFit(c, s, X0 + 100, y + boxH / 2 + 2, W - 130, 44, 28, 1, BB(800), BRAND.deep, 'left');
    if (i < n - 1) { const ay = y + boxH + 4; c.beginPath(); c.moveTo(CX - 16, ay); c.lineTo(CX + 16, ay); c.lineTo(CX, ay + arrow - 8); c.closePath(); c.fillStyle = BRAND.brown; c.fill(); }
    c.restore();
  });
}
function checkBox(c, x, y, e, k) {
  rr(c, x - 30, y - 30, 60, 60, 14, e > 0 ? k.acc : '#FFFFFF', BRAND.brown, 5);
  if (e <= 0) return;
  const a = [x - 15, y], b = [x - 3, y + 13], d = [x + 18, y - 14];
  c.beginPath(); c.moveTo(...a);
  if (e < 0.5) c.lineTo(lerp(a[0], b[0], e * 2), lerp(a[1], b[1], e * 2));
  else { c.lineTo(...b); c.lineTo(lerp(b[0], d[0], (e - 0.5) * 2), lerp(b[1], d[1], (e - 0.5) * 2)); }
  c.strokeStyle = k.on; c.lineWidth = 9; c.lineCap = 'round'; c.stroke();
}

// ── icons: 아이콘 2~4개 + 이름 (한 줄)
function icons(c, d, p, lt, slot) {
  const k = colors(slot); const items = (d.items || []).slice(0, 4); const n = Math.max(1, items.length);
  const colW = W / n; const size = Math.min(190, colW - 60);
  items.forEach((it, i) => {
    const e = seg(p, 0.05 + i * (0.8 / n), 0.05 + (i + 0.5) * (0.8 / n)); if (e <= 0) return;
    const x = X0 + colW * i, cx = x + colW / 2;
    c.save(); c.globalAlpha *= cl(e * 2);
    card(c, x + 10, 440, colW - 20, 420);
    c.translate(cx, 600); const s = lerp(0.7, 1, BACK(e)); c.scale(s, s); drawIcon(c, it.icon, 0, 0, size, k.acc);
    c.restore();
    c.save(); c.globalAlpha *= cl(e * 2);
    drawFit(c, it.label || '', cx, 770, colW - 50, 44, 24, 2, TT, BRAND.deep, 'center', 1.15);
    c.restore();
  });
}

// ── outro: 엠블럼·주차·계정 + 형제가 함께 손 흔들기 (data.week, data.emblem(이미지), data.mouth(말하는 쪽 입))
function outro(c, d, p, lt, slot) {
  const k = colors(slot); const e = BACK(seg(lt, 0, 0.6));
  c.save(); c.translate(CX, 520); c.scale(e, e);
  if (d.emblem) c.drawImage(d.emblem, -100, -100, 200, 200);
  else { c.beginPath(); c.arc(0, 0, 96, 0, Math.PI * 2); c.fillStyle = BRAND.yellow; c.fill(); c.strokeStyle = BRAND.brown; c.lineWidth = 8; c.stroke(); c.beginPath(); c.moveTo(0, -70); c.lineTo(18, 0); c.lineTo(0, 70); c.lineTo(-18, 0); c.closePath(); c.fillStyle = BRAND.brown; c.fill(); }
  c.restore();
  const t = seg(lt, 0.3, 0.8);
  if (t > 0) {
    c.save(); c.globalAlpha *= t;
    drawFit(c, '황금나침반', CX, 660, 600, 44, 30, 1, BB(800), BRAND.brown);
    drawFit(c, `${d.week ? `${d.week} ` : ''}${(SLOT[slot] || SLOT.econ).label}`, CX, 735, 880, 76, 40, 1, TT, BRAND.deep);
    drawFit(c, HANDLE, CX, 800, 700, 36, 26, 1, BB(700), k.text);
    c.restore();
  }
  // 형(나침이) 왼쪽 · 동생(콕이) 오른쪽, 말하는 쪽만 입이 움직임
  const g = EASE(seg(lt, 0.2, 0.8)); if (g <= 0) return;
  const talk = cl(d.mouth);
  c.save(); c.globalAlpha *= g;
  drawCharacter(c, { variant: CHARACTERS.econ.variant, x: 380, y: 1000, scale: 0.7, mood: 'smile', point: -1, t: lt, mouth: slot === 'econ' ? talk : 0, needle: 'econ' });
  drawCharacter(c, { variant: CHARACTERS.fin.variant, x: 700, y: 1000, scale: 0.7, mood: 'smile', point: 1, t: lt + 0.4, mouth: slot === 'fin' ? talk : 0, needle: 'fin' });
  c.restore();
}

export const KINDS = { question, bignum, keyword, formula, compare, bars, steps, icons, outro };
