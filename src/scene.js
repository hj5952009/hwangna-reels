// 위클리 설명 릴스 한 장면 그리기 — drawFrame(ctx, script, track, t, assets)
// 순수 함수: ctx(1080×1920 canvas 2D)에만 그린다. 브라우저(render.html·preview)에서 쓴다.
// 줄 순서 = hook → beats[0..n-1] → summary → 끝인사(outro). 줄 사이 GAP초 쉼.
import { W, H, BRAND, SLOT, FONTS, SAFE, LAYOUT, HANDLE, CHARACTER } from './brand.js';
import { drawCharacter } from './character.js';

export const GAP = 0.15;
const EASE = (k) => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);
const BACK = (k) => { const c = 1.6; k = Math.max(0, Math.min(1, k)) - 1; return 1 + (c + 1) * k * k * k + c * k * k; };

// ── 시간표: 각 줄이 몇 초에 시작하는지
export function timeline(track) {
  const out = []; let at = 0;
  (track.lines || []).forEach((l, i) => { out.push({ i, start: at, end: at + l.sec }); at += l.sec + GAP; });
  return out;
}
// t초에 말하고 있는 줄 (쉼 동안은 앞 줄 유지)
export function lineAt(track, t) {
  const tl = timeline(track);
  let cur = tl[0] || { i: 0, start: 0, end: 0 };
  for (const s of tl) if (t >= s.start) cur = s;
  return cur;
}
// 줄 번호 → 장면 종류
export function sceneOf(script, i) {
  const n = (script.beats || []).length;
  if (i === 0) return { kind: 'hook' };
  if (i <= n) return { kind: 'beat', beat: script.beats[i - 1], k: i - 1 };
  if (i === n + 1) return { kind: 'summary' };
  return { kind: 'outro' };
}

// ── 글자 줄바꿈 (띄어쓰기 우선, 긴 단어는 글자로)
export function wrap(ctx, text, maxW) {
  const out = []; let line = '';
  for (const w of String(text || '').split(/(\s+)/)) {
    if (!w) continue;
    const tryLine = line + w;
    if (ctx.measureText(tryLine.trim()).width <= maxW) { line = tryLine; continue; }
    if (line.trim()) { out.push(line.trim()); line = ''; }
    if (ctx.measureText(w.trim()).width <= maxW) { line = w.trimStart(); continue; }
    for (const ch of w) { if (ctx.measureText((line + ch).trim()).width > maxW && line) { out.push(line.trim()); line = ''; } line += ch; }
  }
  if (line.trim()) out.push(line.trim());
  return out;
}
function fit(ctx, text, maxW, size, min, maxLines, font) {
  for (let s = size; s >= min; s -= 4) { ctx.font = font(s); const ls = wrap(ctx, text, maxW); if (ls.length <= maxLines) return { size: s, lines: ls }; }
  ctx.font = font(min); return { size: min, lines: wrap(ctx, text, maxW).slice(0, maxLines) };
}

// ── 자막 쪼개기: 한 줄 대사를 '2줄짜리 자막 조각'으로 나누고 글자 수 비율로 시간 배분
export const CAP = { size: 66, lineH: 92, maxLines: 2 };
const capFont = (s) => `900 ${s}px ${FONTS.body}`;
export function captionChunks(ctx, text) {
  ctx.font = capFont(CAP.size);
  const lines = wrap(ctx, text, LAYOUT.caption.maxW);
  const chunks = [];
  for (let i = 0; i < lines.length; i += CAP.maxLines) chunks.push(lines.slice(i, i + CAP.maxLines));
  const total = chunks.reduce((a, c) => a + c.join('').length, 0) || 1;
  let acc = 0;
  return chunks.map((c) => { const from = acc / total; acc += c.join('').length; return { lines: c, from, to: acc / total }; });
}
// 숫자(단위 포함)와 핵심어를 금색으로
const NUM_RE = /([+-]?\d[\d,.]*\s*(?:%p|%|bp|조\s?원|억\s?원|만\s?원|조|억|만|원|배|달러|엔|위안|포인트|년|개월|주|명)?)/g;
function segments(line, keys) {
  const marks = new Array(line.length).fill(false);
  for (const m of line.matchAll(NUM_RE)) for (let j = m.index; j < m.index + m[0].length; j++) marks[j] = true;
  for (const k of keys) { if (!k || k.length < 2) continue; let p = line.indexOf(k); while (p >= 0) { for (let j = p; j < p + k.length; j++) marks[j] = true; p = line.indexOf(k, p + k.length); } }
  const segs = [];
  for (let j = 0; j < line.length; j++) { const last = segs[segs.length - 1]; if (last && last.hi === marks[j]) last.t += line[j]; else segs.push({ t: line[j], hi: marks[j] }); }
  return segs;
}

// ── 배경: 따뜻한 종이 + 천천히 도는 나침반 눈금 + 위 슬롯 색 띠 + 아래 갈색 그늘(인스타 글자 잘 보이게)
function background(ctx, slot, t) {
  const S = SLOT[slot] || SLOT.econ;
  ctx.fillStyle = BRAND.soft; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.translate(W / 2, LAYOUT.stage.y + LAYOUT.stage.h / 2); ctx.rotate(t * 0.03);
  ctx.strokeStyle = BRAND.line; ctx.lineWidth = 4;
  for (const r of [460, 620]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  for (let i = 0; i < 32; i++) { const a = (i * Math.PI) / 16, r1 = i % 4 ? 600 : 560; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); ctx.lineTo(Math.cos(a) * 640, Math.sin(a) * 640); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = S.accent; ctx.fillRect(0, 0, W, 200);
  ctx.fillStyle = BRAND.brown; ctx.fillRect(0, 200, W, 8);
  const g = ctx.createLinearGradient(0, H - SAFE.bottom + 40, 0, H);
  g.addColorStop(0, 'rgba(63,47,28,0)'); g.addColorStop(0.45, 'rgba(63,47,28,0.55)'); g.addColorStop(1, 'rgba(63,47,28,0.92)');
  ctx.fillStyle = g; ctx.fillRect(0, H - SAFE.bottom + 40, W, SAFE.bottom - 40);
}

function pill(ctx, text, x, cy, { size = 36, h = 72, pad = 30, bg, fg, align = 'left' } = {}) {
  ctx.font = `700 ${size}px ${FONTS.body}`;
  const w = ctx.measureText(text).width + pad * 2;
  const x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x0, cy - h / 2, w, h, h / 2); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + w / 2, cy + 2);
  return w;
}

function header(ctx, script, prog) {
  const S = SLOT[script.slot] || SLOT.econ;
  const y = LAYOUT.header.y + LAYOUT.header.h / 2;
  const w = pill(ctx, S.label, SAFE.side, y, { bg: BRAND.brown, fg: '#FFFFFF', size: 38 });
  ctx.fillStyle = BRAND.brown; ctx.font = `400 46px ${FONTS.title}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(script.week || '', SAFE.side + w + 22, y + 3);
  // 'AI 목소리' 표시 (오른쪽 위, 화면 내내)
  ctx.save();
  ctx.font = `700 26px ${FONTS.body}`;
  const label = 'AI 목소리';
  const bw = ctx.measureText(label).width + 30 + 34;
  const bx = LAYOUT.badge.x - bw, by = y - 24;
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.strokeStyle = BRAND.brown; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.roundRect(bx, by, bw, 48, 24); ctx.fill(); ctx.stroke();
  // 작은 마이크
  ctx.fillStyle = BRAND.brown; ctx.beginPath(); ctx.roundRect(bx + 18, by + 11, 12, 18, 6); ctx.fill();
  ctx.beginPath(); ctx.arc(bx + 24, by + 24, 11, 0.1 * Math.PI, 0.9 * Math.PI); ctx.lineWidth = 3; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(bx + 24, by + 35); ctx.lineTo(bx + 24, by + 40); ctx.stroke();
  ctx.fillText(label, bx + 44, by + 25); ctx.textAlign = 'left';
  ctx.restore();
  // 진행 막대 (나침반 바늘 모양 머리)
  const px = SAFE.side, pw = W - SAFE.side * 2, py = LAYOUT.header.y + LAYOUT.header.h + 4;
  ctx.fillStyle = BRAND.line; ctx.beginPath(); ctx.roundRect(px, py, pw, 10, 5); ctx.fill();
  ctx.fillStyle = S.accent === BRAND.yellow ? BRAND.brown : S.accent;
  ctx.beginPath(); ctx.roundRect(px, py, Math.max(10, pw * prog), 10, 5); ctx.fill();
}

// 무대 카드 (스티커 느낌: 갈색 테두리 + 아래 오른쪽 그림자)
function card(ctx, pop, tint) {
  const { y, h } = LAYOUT.stage; const x = SAFE.side, w = W - SAFE.side * 2;
  const s = 0.9 + 0.1 * BACK(pop);
  ctx.save(); ctx.globalAlpha = EASE(pop * 1.6);
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(s, s); ctx.translate(-(x + w / 2), -(y + h / 2));
  ctx.fillStyle = BRAND.brown; ctx.beginPath(); ctx.roundRect(x + 14, y + 16, w, h, 44); ctx.fill();
  ctx.fillStyle = tint || '#FFFFFF'; ctx.strokeStyle = BRAND.brown; ctx.lineWidth = 7;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 44); ctx.fill(); ctx.stroke();
  return { x, y, w, h, done: () => ctx.restore() };
}
function kicker(ctx, text, cx, y, col) {
  ctx.font = `700 36px ${FONTS.body}`; ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = '6px';
  ctx.fillText(text, cx + 3, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
}
function bigText(ctx, text, cx, cy, maxW, size, min, maxLines, col) {
  const f = fit(ctx, text, maxW, size, min, maxLines, (s) => `400 ${s}px ${FONTS.title}`);
  ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const lh = f.size * 1.18, top = cy - ((f.lines.length - 1) * lh) / 2;
  f.lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lh));
  return { top: top - lh / 2, bottom: top + (f.lines.length - 1) * lh + lh / 2 };
}
function imageCover(ctx, img, x, y, w, h, r) {
  if (!img) return false;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return false;
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.clip();
  const s = Math.max(w / iw, h / ih); ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
  ctx.restore(); return true;
}
function imageContain(ctx, img, x, y, w, h) {
  if (!img) return false;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height; if (!iw || !ih) return false;
  const s = Math.min(w / iw, h / ih);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
  ctx.drawImage(img, x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
  ctx.strokeStyle = BRAND.line; ctx.lineWidth = 3; ctx.strokeRect(x + (w - iw * s) / 2, y + (h - ih * s) / 2, iw * s, ih * s);
  return true;
}

// ── 장면별 카드 내용
function drawStage(ctx, script, sc, local, assets) {
  const S = SLOT[script.slot] || SLOT.econ;
  const pop = Math.min(1, local / 0.35);
  const accentText = S.accent === BRAND.yellow ? BRAND.brown : S.accent;
  if (sc.kind === 'outro') {
    const c = card(ctx, pop, '#FFFFFF');
    const cx = c.x + c.w / 2 - 90; // 오른쪽 아래 캐릭터를 피해 살짝 왼쪽
    if (assets.emblem) { ctx.drawImage(assets.emblem, cx - 120, c.y + 60, 240, 240); }
    kicker(ctx, '황금나침반', cx, c.y + 345, BRAND.brown);
    bigText(ctx, `${script.week || ''} 위클리`, cx, c.y + 440, c.w - 280, 92, 56, 1, BRAND.brown);
    ctx.font = `700 44px ${FONTS.body}`; ctx.fillStyle = BRAND.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`발표 ${script.presenter || ''}`, cx, c.y + 535);
    pill(ctx, HANDLE, cx, c.y + 625, { bg: S.accent, fg: S.onAccent, size: 34, h: 66, align: 'center' });
    c.done(); return;
  }
  if (sc.kind === 'hook') {
    const c = card(ctx, pop, S.tint);
    kicker(ctx, '이번 주 위클리, 한 줄로', c.x + c.w / 2, c.y + 80, accentText);
    ctx.font = `500 34px ${FONTS.body}`; ctx.fillStyle = BRAND.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (script.title) ctx.fillText(`「${script.title}」`, c.x + c.w / 2, c.y + 136, c.w - 100);
    bigText(ctx, script.hook || script.title || '', c.x + c.w / 2, c.y + c.h / 2 + 30, c.w - 110, 118, 70, 3, BRAND.brown);
    c.done(); return;
  }
  if (sc.kind === 'summary') {
    const c = card(ctx, pop, '#FFFFFF');
    kicker(ctx, '한 줄 정리', c.x + c.w / 2, c.y + 90, accentText);
    ctx.fillStyle = S.accent; ctx.fillRect(c.x + c.w / 2 - 60, c.y + 125, 120, 8);
    bigText(ctx, script.summary || '', c.x + c.w / 2, c.y + c.h / 2 + 30, c.w - 110, 92, 56, 4, BRAND.brown);
    c.done(); return;
  }
  // beat
  const show = (sc.beat && sc.beat.show) || {};
  const type = show.type;
  if (type === 'photo' || type === 'slide') {
    const c = card(ctx, pop, '#FFFFFF');
    const img = type === 'photo' ? (assets.photos || [])[show.photo || 0] : (assets.slides || [])[Math.max(0, (show.page || 1) - 1)];
    const ok = type === 'photo' ? imageCover(ctx, img, c.x + 18, c.y + 18, c.w - 36, c.h - 36, 30) : imageContain(ctx, img, c.x + 36, c.y + 36, c.w - 72, c.h - 130);
    if (!ok) bigText(ctx, show.text || '', c.x + c.w / 2, c.y + c.h / 2, c.w - 110, 110, 64, 3, BRAND.brown);
    if (show.text && ok) {
      const lab = type === 'slide' ? `발표 자료 ${show.page || 1}쪽 · ${show.text}` : show.text;
      ctx.font = `700 34px ${FONTS.body}`;
      const tw = Math.min(c.w - 80, ctx.measureText(lab).width + 48);
      // 이름표는 왼쪽 위 (오른쪽 아래는 캐릭터 자리)
      ctx.fillStyle = BRAND.brown; ctx.beginPath(); ctx.roundRect(c.x + 40, c.y + 40, tw, 60, 30); ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lab, c.x + 40 + tw / 2, c.y + 71, tw - 30);
    }
    c.done(); return;
  }
  if (type === 'number') {
    const c = card(ctx, pop, '#FFFFFF');
    const roll = EASE(local / 0.7);
    const raw = String(show.value || '');
    const num = parseFloat(raw.replace(/,/g, ''));
    const dec = (raw.split('.')[1] || '').length;
    const shown = Number.isFinite(num) && /^[+-]?[\d,.]+$/.test(raw) ? (num * roll).toFixed(dec).replace(/\B(?=(\d{3})+(?!\d))/g, raw.includes(',') ? ',' : '') : raw;
    const sign = /^[+]/.test(raw) && !shown.startsWith('+') ? '+' : '';
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    const f = fit(ctx, `${sign}${shown}${show.unit || ''}`, c.w - 100, 230, 110, 1, (s) => `400 ${s}px ${FONTS.title}`);
    const vs = f.size, us = Math.round(vs * 0.42);
    ctx.font = `400 ${vs}px ${FONTS.title}`; const vw = ctx.measureText(sign + shown).width;
    ctx.font = `400 ${us}px ${FONTS.title}`; const uw = ctx.measureText(show.unit || '').width;
    const sx = c.x + (c.w - vw - uw - 12) / 2, by = c.y + c.h / 2 + vs * 0.3;
    const col = /^-/.test(raw) ? BRAND.down : /^\+/.test(raw) ? BRAND.up : accentText;
    ctx.font = `400 ${vs}px ${FONTS.title}`; ctx.fillStyle = col; ctx.fillText(sign + shown, sx, by);
    ctx.font = `400 ${us}px ${FONTS.title}`; ctx.fillStyle = BRAND.brown; ctx.fillText(show.unit || '', sx + vw + 12, by);
    if (show.text) { ctx.font = `700 44px ${FONTS.body}`; ctx.fillStyle = BRAND.ink; ctx.textAlign = 'center'; ctx.fillText(show.text, c.x + c.w / 2, c.y + 120, c.w - 80); }
    c.done(); return;
  }
  if (type === 'compare') {
    const c = card(ctx, pop, '#FFFFFF');
    if (show.text) kicker(ctx, show.text, c.x + c.w / 2, c.y + 90, accentText);
    const bw = (c.w - 170) / 2, bh = c.h - 260, by = c.y + 160;
    const slide = EASE(local / 0.5);
    [[show.a, c.x + 40, BRAND.cream], [show.b, c.x + c.w - 40 - bw, S.tint]].forEach(([txt, bx, bg], i) => {
      const off = (1 - slide) * (i ? 80 : -80);
      ctx.fillStyle = bg; ctx.strokeStyle = BRAND.brown; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.roundRect(bx + off, by, bw, bh, 30); ctx.fill(); ctx.stroke();
      bigText(ctx, txt || '', bx + off + bw / 2, by + bh / 2, bw - 50, 84, 44, 4, BRAND.brown);
    });
    // 가운데 화살표
    const ax = c.x + c.w / 2, ay = by + bh / 2;
    ctx.fillStyle = accentText; ctx.beginPath(); ctx.moveTo(ax - 26, ay - 34); ctx.lineTo(ax + 30, ay); ctx.lineTo(ax - 26, ay + 34); ctx.closePath(); ctx.fill();
    c.done(); return;
  }
  // keyword (기본)
  const c = card(ctx, pop, '#FFFFFF');
  const r = bigText(ctx, show.text || '', c.x + c.w / 2, c.y + c.h / 2, c.w - 120, 150, 72, 3, BRAND.brown);
  const hw = Math.min(c.w - 140, 520) * EASE((local - 0.2) / 0.4);
  ctx.fillStyle = S.accent; ctx.globalAlpha *= 0.85; ctx.fillRect(c.x + c.w / 2 - hw / 2, r.bottom + 6, hw, 16);
  c.done();
}

// ── 큰 자막
function caption(ctx, script, track, cur, t) {
  const line = track.lines[cur.i]; if (!line) return;
  const local = Math.min(1, Math.max(0, (t - cur.start) / Math.max(0.01, cur.end - cur.start)));
  const chunks = captionChunks(ctx, line.text);
  const ch = chunks.find((c) => local >= c.from && local < c.to + 1e-9) || chunks[chunks.length - 1];
  if (!ch) return;
  const keys = (script.beats || []).map((b) => b.show && b.show.text).filter(Boolean);
  ctx.font = capFont(CAP.size); ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  const { y, h } = LAYOUT.caption;
  const top = y + h / 2 - ((ch.lines.length - 1) * CAP.lineH) / 2;
  ch.lines.forEach((ln, i) => {
    const segs = segments(ln, keys);
    const total = segs.reduce((a, s) => a + ctx.measureText(s.t).width, 0);
    let x = W / 2 - total / 2; const yy = top + i * CAP.lineH;
    ctx.textAlign = 'left';
    for (const s of segs) { ctx.strokeStyle = BRAND.deep; ctx.lineWidth = 12; ctx.strokeText(s.t, x, yy); x += ctx.measureText(s.t).width; }
    x = W / 2 - total / 2;
    for (const s of segs) { ctx.fillStyle = s.hi ? BRAND.gold : '#FFFFFF'; ctx.fillText(s.t, x, yy); x += ctx.measureText(s.t).width; }
  });
}

// 입 모양: 그 줄의 30fps 목소리 크기
function mouthAt(track, cur, t) {
  const line = track.lines[cur.i]; if (!line || t > cur.end) return 0;
  const r = line.rms || []; const k = Math.floor((t - cur.start) * 30);
  return Math.max(0, Math.min(1, (r[k] || 0) * 1.6));
}

export function drawFrame(ctx, script, track, t, assets = {}) {
  const tl = timeline(track);
  const cur = lineAt(track, t);
  const sc = sceneOf(script, cur.i);
  const total = track.total || (tl.length ? tl[tl.length - 1].end : 1);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  background(ctx, script.slot, t);
  header(ctx, script, Math.min(1, t / total));
  drawStage(ctx, script, sc, t - cur.start, assets);
  const mood = sc.kind === 'beat' ? (sc.beat.mood || 'explain') : sc.kind === 'outro' || sc.kind === 'summary' ? 'smile' : 'surprise';
  const blink = (t % 3.1) < 0.12 ? 1 : 0;
  const point = sc.kind === 'beat' || sc.kind === 'hook' ? -1 : 0;
  drawCharacter(ctx, { variant: assets.variant || CHARACTER.variant, ...LAYOUT.char, mouth: mouthAt(track, cur, t), blink, mood: sc.kind === 'hook' && t - cur.start > 0.8 ? 'explain' : mood, point, needle: script.slot, t });
  caption(ctx, script, track, cur, t);
  ctx.restore();
}
