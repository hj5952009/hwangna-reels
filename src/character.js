// 황금나침반 해설 캐릭터 — canvas 2D로만 그린다 (이미지 파일 없음 · 상태 없음)
// drawCharacter(ctx, { variant, x, y, scale, mouth, blink, mood, point, needle, t })
//   variant  'A' 나침이(둥근 나침반 몸) · 'B' 황나 선배(나침반을 든 사람) · 'C' 부엉(바늘 머리깃 부엉이)
//   x, y     몸 중심 (scale 1에서 키 약 330px: 위 -200 · 아래 +130)
//   mouth    0(닫힘)~1(크게 벌림) — 목소리 크기(rms)로 움직인다
//   blink    0(뜸)~1(감음)
//   mood     'explain' | 'surprise' | 'stress' | 'smile'
//   point    -1 왼쪽 가리킴 · 0 없음 · 1 오른쪽 가리킴
//   needle   'econ' | 'fin' — 바늘 끝 색 (슬롯 색)
//   t        초 (몸 흔들림·바늘 떨림)
import { BRAND, SLOT } from './brand.js';

const C = {
  ring: BRAND.yellow,
  edge: BRAND.brown,
  face: BRAND.soft,
  ink: BRAND.deep,
  cheek: 'rgba(232,120,96,0.32)',
  white: '#FFFFFF',
  skin: '#F7D9B5',
  hair: '#4A3622',
  beak: '#F09A3E',
};

const clamp01 = (v) => Math.max(0, Math.min(1, Number(v) || 0));

function circle(ctx, x, y, r, fill, stroke, lw) {
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 6; ctx.stroke(); }
}
function ellipse(ctx, x, y, rx, ry, fill, stroke, lw, rot = 0) {
  ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), rot, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 6; ctx.stroke(); }
}

// 나침반 바늘 (위쪽 절반은 슬롯 색, 아래는 갈색)
function needleShape(ctx, x, y, len, w, ang, tip) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0, -len); ctx.lineTo(w, 0); ctx.lineTo(-w, 0); ctx.closePath();
  ctx.fillStyle = tip; ctx.fill(); ctx.strokeStyle = C.edge; ctx.lineWidth = 5; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, len * 0.55); ctx.lineTo(w, 0); ctx.lineTo(-w, 0); ctx.closePath();
  ctx.fillStyle = C.edge; ctx.fill(); ctx.stroke();
  circle(ctx, 0, 0, w * 0.55, C.ring, C.edge, 4);
  ctx.restore();
}

// 눈: 기분에 따라 눈썹, blink로 감김
function eyes(ctx, dx, y, r, blink, mood, look = 0) {
  const open = 1 - clamp01(blink);
  for (const s of [-1, 1]) {
    const ex = s * dx;
    if (mood === 'smile' && open > 0.3) {
      // 웃는 눈 (반달)
      ctx.beginPath(); ctx.arc(ex, y + r * 0.3, r * 0.85, Math.PI * 1.1, Math.PI * 1.9);
      ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.38; ctx.lineCap = 'round'; ctx.stroke();
    } else if (open < 0.15) {
      ctx.beginPath(); ctx.moveTo(ex - r * 0.8, y); ctx.lineTo(ex + r * 0.8, y);
      ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.34; ctx.lineCap = 'round'; ctx.stroke();
    } else {
      const big = mood === 'surprise' ? 1.18 : 1;
      ellipse(ctx, ex + look * r * 0.25, y, r * 0.78 * big, r * 1.12 * big * open, C.ink);
      circle(ctx, ex + look * r * 0.25 - r * 0.28, y - r * 0.42 * open, r * 0.28, C.white);
    }
    // 눈썹
    ctx.beginPath();
    const by = y - r * 1.75 - (mood === 'surprise' ? r * 0.45 : 0);
    const tilt = mood === 'stress' ? r * 0.45 * -s : mood === 'explain' ? r * 0.12 * s : 0;
    ctx.moveTo(ex - r * 0.75, by - tilt); ctx.lineTo(ex + r * 0.75, by + tilt);
    ctx.strokeStyle = C.ink; ctx.lineWidth = r * 0.3; ctx.lineCap = 'round'; ctx.stroke();
  }
}

// 입: mouth 크기에 따라 벌어짐. 닫혀 있을 땐 기분별 모양
function mouthShape(ctx, x, y, w, mouth, mood) {
  const m = clamp01(mouth);
  if (m > 0.06 || mood === 'surprise') {
    const h = Math.max(mood === 'surprise' ? w * 0.55 : 0, w * (0.12 + 0.62 * m));
    ctx.beginPath(); ctx.ellipse(x, y + h * 0.25, w * (mood === 'surprise' ? 0.45 : 0.62), h / 2 + 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5A2E1F'; ctx.fill();
    ctx.save(); ctx.clip();
    ellipse(ctx, x, y + h * 0.25 + h * 0.42, w * 0.38, h * 0.32, '#E9806E');
    ctx.restore();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.stroke();
    return;
  }
  ctx.beginPath();
  if (mood === 'stress') { ctx.moveTo(x - w * 0.5, y + 6); ctx.quadraticCurveTo(x - w * 0.25, y - 6, x, y + 4); ctx.quadraticCurveTo(x + w * 0.25, y + 12, x + w * 0.5, y); }
  else { ctx.arc(x, y - w * 0.25, w * 0.55, Math.PI * 0.18, Math.PI * 0.82); }
  ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();
}

// 땀방울 (stress)
function sweat(ctx, x, y, s) {
  ctx.beginPath(); ctx.moveTo(x, y - 18 * s); ctx.quadraticCurveTo(x + 12 * s, y + 4 * s, x, y + 10 * s); ctx.quadraticCurveTo(x - 12 * s, y + 4 * s, x, y - 18 * s);
  ctx.fillStyle = '#8CC8F0'; ctx.fill(); ctx.strokeStyle = '#3B7FB0'; ctx.lineWidth = 3; ctx.stroke();
}
// 반짝 (surprise·smile)
function spark(ctx, x, y, r, col) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4; const rr = i % 2 ? r * 0.35 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  ctx.closePath(); ctx.fillStyle = col; ctx.fill();
}

// 팔: 기본은 몸 옆에 붙고, point 방향 팔은 위로 뻗어 가리킨다
function arm(ctx, sx, sy, side, pointing, t, col, hand) {
  const wave = Math.sin(t * 6) * 0.06;
  const ang = pointing ? -0.55 + wave : 0.95 + Math.sin(t * 2.2 + side) * 0.05;
  const len = pointing ? 120 : 70;
  const ex = sx + side * Math.cos(ang) * len, ey = sy + Math.sin(ang) * len;
  ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(sx + side * len * 0.55, sy + (pointing ? -10 : 30), ex, ey);
  ctx.strokeStyle = col; ctx.lineWidth = 22; ctx.lineCap = 'round'; ctx.stroke();
  circle(ctx, ex, ey, 17, hand, C.edge, 5);
  if (pointing) {
    // 검지
    ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex + side * 26, ey - 14);
    ctx.strokeStyle = hand; ctx.lineWidth = 12; ctx.stroke();
    ctx.strokeStyle = C.edge; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(ex + side * 26, ey - 14, 6, 0, Math.PI * 2); ctx.stroke();
  }
}

// ── A 나침이: 둥근 나침반이 몸, 바늘이 머리 위 안테나
function drawA(ctx, o) {
  const tip = SLOT[o.needle] ? SLOT[o.needle].needle : SLOT.econ.needle;
  // 발
  ellipse(ctx, -46, 122, 34, 16, C.edge); ellipse(ctx, 46, 122, 34, 16, C.edge);
  // 팔 (몸 뒤)
  arm(ctx, -110, 20, -1, o.point === -1, o.t, C.edge, C.ring);
  arm(ctx, 110, 20, 1, o.point === 1, o.t, C.edge, C.ring);
  // 바늘 안테나 (떨림)
  needleShape(ctx, 0, -122, 78, 18, Math.sin(o.t * 3.1) * 0.1 + (o.mood === 'surprise' ? Math.sin(o.t * 20) * 0.08 : 0), tip);
  // 몸 = 나침반 테
  circle(ctx, 0, 0, 124, C.ring, C.edge, 8);
  // 테 눈금 (N·E·S·W 자리)
  ctx.strokeStyle = C.edge; ctx.lineWidth = 5; ctx.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8, r1 = i % 4 === 0 ? 100 : 108, r2 = 116;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); ctx.stroke();
  }
  // 얼굴판
  circle(ctx, 0, 0, 96, C.face, C.edge, 5);
  ellipse(ctx, -58, 30, 18, 11, C.cheek); ellipse(ctx, 58, 30, 18, 11, C.cheek);
  eyes(ctx, 36, -14, 15, o.blink, o.mood, o.point);
  mouthShape(ctx, 0, 40, 34, o.mouth, o.mood);
}

// ── B 황나 선배: 나침반을 가슴에 든 사람 (갈색 재킷·노란 넥타이)
function drawB(ctx, o) {
  const tip = SLOT[o.needle] ? SLOT[o.needle].needle : SLOT.econ.needle;
  // 몸통 (재킷)
  ctx.beginPath(); ctx.moveTo(-100, 130); ctx.quadraticCurveTo(-108, 20, -56, 6); ctx.lineTo(56, 6); ctx.quadraticCurveTo(108, 20, 100, 130); ctx.closePath();
  ctx.fillStyle = C.edge; ctx.fill(); ctx.strokeStyle = BRAND.deep; ctx.lineWidth = 6; ctx.stroke();
  // 셔츠·넥타이
  ctx.beginPath(); ctx.moveTo(-30, 6); ctx.lineTo(0, 50); ctx.lineTo(30, 6); ctx.closePath(); ctx.fillStyle = C.white; ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, 14); ctx.lineTo(12, 30); ctx.lineTo(4, 96); ctx.lineTo(0, 104); ctx.lineTo(-4, 96); ctx.lineTo(-12, 30); ctx.closePath(); ctx.fillStyle = C.ring; ctx.fill();
  // 팔
  arm(ctx, -82, 40, -1, o.point === -1, o.t, C.edge, C.skin);
  arm(ctx, 82, 40, 1, o.point === 1, o.t, C.edge, C.skin);
  // 가슴에 든 작은 나침반
  circle(ctx, -40, 86, 32, C.ring, BRAND.deep, 5); circle(ctx, -40, 86, 23, C.face, BRAND.deep, 3);
  needleShape(ctx, -40, 86, 18, 6, Math.sin(o.t * 3.1) * 0.25, tip);
  // 머리
  circle(ctx, 0, -84, 86, C.skin, BRAND.deep, 6);
  // 머리카락 (앞머리)
  ctx.beginPath(); ctx.arc(0, -96, 84, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(40, -120, 10, -132); ctx.quadraticCurveTo(-30, -112, -84, -100); ctx.closePath();
  ctx.fillStyle = C.hair; ctx.fill();
  // 머리 위 바늘 머리핀
  needleShape(ctx, 52, -158, 30, 9, 0.5 + Math.sin(o.t * 3.1) * 0.08, tip);
  ellipse(ctx, -50, -58, 15, 9, C.cheek); ellipse(ctx, 50, -58, 15, 9, C.cheek);
  eyes(ctx, 30, -86, 12, o.blink, o.mood, o.point);
  mouthShape(ctx, 0, -40, 28, o.mouth, o.mood);
}

// ── C 부엉: 바늘이 머리깃인 황금 부엉이 (배에 나침반 눈금)
function drawC(ctx, o) {
  const tip = SLOT[o.needle] ? SLOT[o.needle].needle : SLOT.econ.needle;
  // 발
  for (const s of [-1, 1]) { ctx.beginPath(); for (let k = -1; k <= 1; k++) { ctx.moveTo(s * 40, 116); ctx.lineTo(s * 40 + k * 14, 134); } ctx.strokeStyle = C.beak; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke(); }
  // 날개 (팔)
  for (const s of [-1, 1]) {
    const up = o.point === s;
    ctx.save(); ctx.translate(s * 98, 0); ctx.rotate(up ? s * -1.0 + Math.sin(o.t * 6) * 0.06 : s * 0.15 + Math.sin(o.t * 2 + s) * 0.04);
    ellipse(ctx, s * 10, up ? -40 : 30, 34, 78, C.edge, BRAND.deep, 5);
    ctx.restore();
  }
  // 머리깃 = 바늘 두 개 (V자)
  const wob = Math.sin(o.t * 3.1) * 0.07;
  needleShape(ctx, -56, -118, 58, 14, -0.42 + wob, tip);
  needleShape(ctx, 56, -118, 58, 14, 0.42 - wob, tip);
  // 몸
  ellipse(ctx, 0, 0, 112, 130, C.ring, C.edge, 8);
  // 배 (나침반 눈금 반원)
  ellipse(ctx, 0, 58, 70, 62, C.face, C.edge, 4);
  ctx.strokeStyle = BRAND.line; ctx.lineWidth = 4;
  for (let i = 0; i < 5; i++) { const a = Math.PI * (0.15 + i * 0.175); ctx.beginPath(); ctx.moveTo(Math.cos(a) * 40, 58 + Math.sin(a) * 40); ctx.lineTo(Math.cos(a) * 54, 58 + Math.sin(a) * 54); ctx.stroke(); }
  // 큰 눈판
  for (const s of [-1, 1]) circle(ctx, s * 46, -42, 44, C.white, C.edge, 6);
  eyes(ctx, 46, -40, 17, o.blink, o.mood, o.point);
  // 부리 (입): mouth만큼 아래로 벌어짐
  const m = clamp01(o.mouth) * 16 + (o.mood === 'surprise' ? 8 : 0);
  ctx.beginPath(); ctx.moveTo(-16, 2); ctx.lineTo(16, 2); ctx.lineTo(0, 22); ctx.closePath(); ctx.fillStyle = C.beak; ctx.fill(); ctx.strokeStyle = C.edge; ctx.lineWidth = 4; ctx.stroke();
  if (m > 1) { ctx.beginPath(); ctx.moveTo(-12, 6 + m * 0.4); ctx.lineTo(12, 6 + m * 0.4); ctx.lineTo(0, 20 + m); ctx.closePath(); ctx.fillStyle = '#C9702A'; ctx.fill(); ctx.stroke(); }
  ellipse(ctx, -84, -2, 13, 8, C.cheek); ellipse(ctx, 84, -2, 13, 8, C.cheek);
}

const DRAW = { A: drawA, B: drawB, C: drawC };
export const VARIANTS = {
  A: { name: '나침이', desc: '둥근 나침반이 몸, 바늘이 머리 위 안테나. 가장 단순하고 엠블럼과 닮음' },
  B: { name: '황나 선배', desc: '갈색 재킷·노란 넥타이 선배가 나침반을 들고 설명. 사람 같아 친근함' },
  C: { name: '부엉', desc: '바늘 두 개가 머리깃인 황금 부엉이. 배에 나침반 눈금. 똑똑한 해설가 느낌' },
};

export function drawCharacter(ctx, opts = {}) {
  const o = {
    variant: 'A', x: 0, y: 0, scale: 1, mouth: 0, blink: 0, mood: 'explain', point: 0, needle: 'econ', t: 0, ...opts,
  };
  const draw = DRAW[o.variant] || drawA;
  const bob = Math.sin(o.t * Math.PI * 1.6) * 5 + (o.mood === 'surprise' ? -8 : 0);
  const squash = 1 + clamp01(o.mouth) * 0.02;
  ctx.save();
  ctx.translate(o.x, o.y + bob * o.scale);
  // 그림자
  ctx.save(); ctx.globalAlpha = 0.16; ellipse(ctx, 0, 140 * o.scale - bob * o.scale, 110 * o.scale, 16 * o.scale, '#000000'); ctx.restore();
  ctx.scale(o.scale, o.scale * squash);
  ctx.lineJoin = 'round';
  draw(ctx, o);
  if (o.mood === 'stress') sweat(ctx, 118, -96, 1.2);
  if (o.mood === 'surprise') { spark(ctx, -150, -150, 22, BRAND.gold); spark(ctx, 150, -170, 16, BRAND.gold); }
  if (o.mood === 'smile') spark(ctx, 140, -140, 14 + Math.sin(o.t * 8) * 3, BRAND.gold);
  ctx.restore();
}
