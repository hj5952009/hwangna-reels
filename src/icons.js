// 장면 아이콘 20개 — 코드로만 그린다(이미지 파일 없음). 설계도(plan)의 icon 값은 이 목록 안에서만 고른다(스키마 enum).
// drawIcon(ctx, name, x, y, size, color): (x, y) 가운데, size 한 변. 모르는 이름이면 문서 아이콘.
import { BRAND, FONTS } from './brand.js';

export const ICONS = ['shop', 'bank', 'factory', 'house', 'money', 'won', 'dollar', 'chartUp', 'chartDown', 'person', 'phone', 'globe', 'doc', 'search', 'check', 'warn', 'clock', 'ship', 'oil', 'card'];

const E = BRAND.brown; // 테두리
function poly(c, pts, fill, stroke = E, lw = 5) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function box(c, x, y, w, h, r, fill, stroke = E, lw = 5) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function dot(c, x, y, r, fill, stroke = E, lw = 5) {
  c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); }
}
function line(c, pts, col, lw) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.strokeStyle = col; c.lineWidth = lw; c.stroke();
}
function glyph(c, s, col) {
  c.font = `900 58px ${FONTS.body}`; c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, 0, 3, 64);
}
function arrowHead(c, x, y, ang, col) {
  c.save(); c.translate(x, y); c.rotate(ang); poly(c, [[10, 0], [-8, -9], [-8, 9]], col, null); c.restore();
}

// 모두 -50~50 좌표에서 그린다
const DRAW = {
  shop(c, col) {
    box(c, -38, -18, 76, 60, 4, '#FFFFFF');
    box(c, -10, 10, 20, 32, 2, BRAND.cream, E, 4);
    box(c, -32, -8, 16, 14, 2, '#CFE8F7', E, 3); box(c, 16, -8, 16, 14, 2, '#CFE8F7', E, 3);
    for (let i = 0; i < 5; i++) {
      const x0 = -45 + i * 18; c.beginPath(); c.moveTo(x0, -42); c.lineTo(x0 + 18, -42); c.lineTo(x0 + 18, -22); c.arc(x0 + 9, -22, 9, 0, Math.PI); c.closePath();
      c.fillStyle = i % 2 ? '#FFFFFF' : col; c.fill(); c.strokeStyle = E; c.lineWidth = 4; c.stroke();
    }
  },
  bank(c, col) {
    poly(c, [[-46, -14], [0, -44], [46, -14]], col);
    for (let i = 0; i < 4; i++) box(c, -35 + i * 20, -10, 10, 40, 2, '#FFFFFF', E, 4);
    box(c, -48, 30, 96, 12, 3, BRAND.cream);
  },
  factory(c, col) {
    box(c, 22, -44, 14, 44, 2, col);
    poly(c, [[-46, 42], [-46, -4], [-24, -20], [-24, -4], [-2, -20], [-2, -4], [46, -4], [46, 42]], '#FFFFFF');
    for (const x of [-36, -12, 12]) box(c, x, 10, 16, 14, 2, col, E, 3);
  },
  house(c, col) {
    box(c, -34, -6, 68, 48, 3, '#FFFFFF');
    poly(c, [[-48, -2], [0, -44], [48, -2]], col);
    box(c, -10, 14, 20, 28, 2, BRAND.cream, E, 4);
  },
  money(c, col) {
    box(c, -46, -28, 92, 56, 8, col);
    box(c, -36, -18, 72, 36, 4, null, '#FFFFFF', 3);
    dot(c, 0, 0, 13, '#FFFFFF', E, 4);
  },
  won(c, col) { dot(c, 0, 0, 44, col); glyph(c, '₩', '#FFFFFF'); },
  dollar(c, col) { dot(c, 0, 0, 44, col); glyph(c, '$', '#FFFFFF'); },
  chartUp(c) {
    c.lineCap = 'round'; line(c, [[-42, -42], [-42, 42], [44, 42]], E, 6);
    line(c, [[-30, 26], [-12, 6], [6, 16], [30, -22]], BRAND.up, 9); arrowHead(c, 34, -28, -1.0, BRAND.up);
  },
  chartDown(c) {
    c.lineCap = 'round'; line(c, [[-42, -42], [-42, 42], [44, 42]], E, 6);
    line(c, [[-30, -24], [-12, -4], [6, -14], [30, 20]], BRAND.down, 9); arrowHead(c, 34, 26, 1.0, BRAND.down);
  },
  person(c, col) {
    c.beginPath(); c.ellipse(0, 44, 36, 40, 0, Math.PI, Math.PI * 2); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = E; c.lineWidth = 5; c.stroke();
    dot(c, 0, -20, 19, BRAND.cream);
  },
  phone(c, col) {
    box(c, -26, -46, 52, 92, 10, '#FFFFFF');
    box(c, -18, -34, 36, 58, 4, col, null);
    dot(c, 0, 35, 4, E, null);
  },
  globe(c, col) {
    dot(c, 0, 0, 44, col);
    c.beginPath(); c.ellipse(0, 0, 18, 44, 0, 0, Math.PI * 2); c.strokeStyle = '#FFFFFF'; c.lineWidth = 4; c.stroke();
    line(c, [[-44, 0], [44, 0]], '#FFFFFF', 4); line(c, [[-38, -22], [38, -22]], '#FFFFFF', 3); line(c, [[-38, 22], [38, 22]], '#FFFFFF', 3);
    dot(c, 0, 0, 44, null);
  },
  doc(c, col) {
    poly(c, [[-32, -44], [16, -44], [34, -26], [34, 44], [-32, 44]], '#FFFFFF');
    poly(c, [[16, -44], [16, -26], [34, -26]], BRAND.cream, E, 4);
    c.lineCap = 'round'; for (const y of [-12, 4, 20]) line(c, [[-20, y], [22, y]], col, 6); line(c, [[-20, 32], [4, 32]], col, 6);
  },
  search(c, col) {
    c.lineCap = 'round'; line(c, [[12, 12], [40, 40]], col, 13);
    dot(c, -8, -8, 28, '#FFFFFF', E, 7);
  },
  check(c, col) {
    box(c, -40, -40, 80, 80, 16, col);
    c.lineCap = 'round'; c.lineJoin = 'round'; line(c, [[-20, 2], [-5, 18], [22, -16]], '#FFFFFF', 11);
  },
  warn(c) {
    poly(c, [[0, -44], [48, 40], [-48, 40]], BRAND.yellow);
    c.lineCap = 'round'; line(c, [[0, -14], [0, 12]], E, 9); dot(c, 0, 27, 5, E, null);
  },
  clock(c, col) {
    dot(c, 0, 0, 44, '#FFFFFF');
    c.lineCap = 'round'; for (let i = 0; i < 12; i += 3) { const a = (i * Math.PI) / 6; line(c, [[Math.cos(a) * 34, Math.sin(a) * 34], [Math.cos(a) * 40, Math.sin(a) * 40]], E, 4); }
    line(c, [[0, 0], [0, -28]], col, 7); line(c, [[0, 0], [20, 8]], col, 7); dot(c, 0, 0, 5, E, null);
  },
  ship(c, col) {
    box(c, -36, -16, 22, 26, 2, BRAND.yellow, E, 4); box(c, -12, -16, 22, 26, 2, '#FFFFFF', E, 4); box(c, 12, -16, 22, 26, 2, BRAND.up, E, 4);
    poly(c, [[-48, 10], [48, 10], [36, 36], [-36, 36]], col);
    c.lineCap = 'round'; line(c, [[-44, 46], [-22, 42], [0, 46], [22, 42], [44, 46]], BRAND.down, 4);
  },
  oil(c, col) {
    box(c, -30, -44, 60, 88, 10, col);
    line(c, [[-30, -20], [30, -20]], E, 5); line(c, [[-30, 20], [30, 20]], E, 5);
    c.beginPath(); c.moveTo(0, -12); c.quadraticCurveTo(12, 2, 9, 7); c.arc(0, 6, 9, 0.1, Math.PI - 0.1); c.quadraticCurveTo(-12, 2, 0, -12); c.fillStyle = '#FFFFFF'; c.fill();
  },
  card(c, col) {
    box(c, -48, -32, 96, 64, 10, col);
    box(c, -46, -20, 92, 12, 0, BRAND.deep, null);
    box(c, -36, 4, 20, 15, 3, BRAND.gold, E, 3);
  },
};

export function drawIcon(ctx, name, x, y, size, color = BRAND.brown) {
  const fn = DRAW[name] || DRAW.doc;
  ctx.save(); ctx.translate(x, y); ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round'; ctx.lineCap = 'butt';
  fn(ctx, color);
  ctx.restore();
}
