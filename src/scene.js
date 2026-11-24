// 위클리 설명 릴스 한 프레임 그리기 — drawFrame(ctx, plan, track, t, assets) (설계서 v2 6-6)
// 순수 함수: ctx(1080×1920 canvas 2D)에만 그린다. 브라우저(render.html·preview)에서 쓴다.
// 장면 i = 설계도 scenes[i] = 목소리 줄 i. 줄 사이 GAP초 쉼(그동안 앞 장면·자막 유지).
// 그리는 순서: 배경 → 머리띠(슬롯 칩·주차·'AI 캐릭터 · AI 목소리'·진행 막대)
//             → 앞 장면 사라짐·새 장면 등장(XFADE초) → 캐릭터(슬롯 시안, 입=소리 크기, 표정=mood, 자리 이동) → 자막 2줄
import { W, H, BRAND, SLOT, FONTS, CHARACTERS, GAP_V2, XFADE, CAPTION_Y0 } from './brand.js';
import { drawCharacter } from './character.js';
import { KINDS, CHAR_POS, KIND_POS } from './kinds.js';
import { drawFit } from './text.js';

export const GAP = GAP_V2;
const cl = (v) => Math.max(0, Math.min(1, Number(v) || 0));
const EASE = (k) => 1 - Math.pow(1 - cl(k), 3);
const lerp = (a, b, k) => a + (b - a) * k;
const BODY = (w) => (s) => `${w} ${s}px ${FONTS.body}`;

// ── 시간표: 줄마다 sec초, 사이 GAP초
export function timeline(track) {
  const out = []; let at = 0;
  (track.lines || []).forEach((l, i) => { out.push({ i, start: at, end: at + l.sec }); at += l.sec + GAP; });
  return out;
}
// t초에 보이는 줄 번호 (쉼 동안은 앞 줄)
export function lineAt(tl, t) {
  let i = 0;
  for (let k = 0; k < tl.length; k++) if (t >= tl[k].start) i = k;
  return i;
}

// ── 자막: '**강조**'는 금색, 936px 폭으로 줄을 바꾸고 2줄씩 말한 만큼 넘긴다
export const CAP = { size: 60, lineH: 86, y: 1350, maxW: W - 72 * 2, maxLines: 2 };
const capFont = `900 ${CAP.size}px ${FONTS.body}`;
// 낱말(띄어쓰기 단위) 목록, 낱말 = 글자 조각들 [{ s, hi }]
function words(text) {
  const out = []; let cur = [];
  String(text || '').split('**').forEach((part, i) => {
    part.split(' ').forEach((b, j) => {
      if (j > 0) { if (cur.length) out.push(cur); cur = []; }
      if (b) cur.push({ s: b, hi: i % 2 === 1 });
    });
  });
  if (cur.length) out.push(cur);
  return out;
}
// 한 낱말이 자막 폭보다 길면 글자 단위로 쪼갠다
function splitLong(ctx, runs) {
  const all = runs.map((r) => r.s).join('');
  if (ctx.measureText(all).width <= CAP.maxW) return [runs];
  const out = []; let cur = []; let curS = '';
  for (const r of runs) {
    for (const ch of r.s) {
      if (curS && ctx.measureText(curS + ch).width > CAP.maxW) { out.push(cur); cur = []; curS = ''; }
      const last = cur[cur.length - 1];
      if (last && last.hi === r.hi) last.s += ch; else cur.push({ s: ch, hi: r.hi });
      curS += ch;
    }
  }
  if (cur.length) out.push(cur);
  return out;
}
// → [{ lines: [[{ w, width, runs }]], from, to }] (from·to = 대사 진행 0~1)
export function captionChunks(ctx, text) {
  ctx.font = capFont; const sp = ctx.measureText(' ').width;
  const lines = []; let cur = []; let wsum = 0;
  for (const runs0 of words(text)) {
    for (const runs of splitLong(ctx, runs0)) {
      const w = runs.map((r) => r.s).join(''); const width = ctx.measureText(w).width;
      if (cur.length && wsum + sp + width > CAP.maxW) { lines.push(cur); cur = []; wsum = 0; }
      wsum += (cur.length ? sp : 0) + width; cur.push({ w, width, runs });
    }
  }
  if (cur.length) lines.push(cur);
  const chunks = [];
  for (let i = 0; i < lines.length; i += CAP.maxLines) chunks.push(lines.slice(i, i + CAP.maxLines));
  const len = chunks.map((ch) => ch.flat().reduce((a, t) => a + t.w.length, 0));
  const tot = len.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return chunks.map((ch, i) => { const from = acc / tot; acc += len[i]; return { lines: ch, from, to: acc / tot }; });
}
function drawCaption(ctx, text, p) {
  const chunks = captionChunks(ctx, text); if (!chunks.length) return;
  let cur = chunks[0];
  for (const c of chunks) if (p >= c.from) cur = c;
  ctx.font = capFont; const sp = ctx.measureText(' ').width;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  cur.lines.forEach((ln, li) => {
    const lw = ln.reduce((a, t) => a + t.width, 0) + sp * (ln.length - 1);
    let x = W / 2 - lw / 2; const y = CAP.y + li * CAP.lineH;
    for (const t of ln) {
      ctx.strokeStyle = BRAND.deep; ctx.lineWidth = 14; ctx.strokeText(t.w, x, y, t.width + 1);
      let rx = x;
      for (const r of t.runs) {
        const rw = ctx.measureText(r.s).width;
        ctx.fillStyle = r.hi ? BRAND.gold : '#FFFFFF'; ctx.fillText(r.s, rx, y, rw + 1); rx += rw;
      }
      x += t.width + sp;
    }
  });
}

// ── 배경: 따뜻한 종이 + 천천히 내려가는 줄 + 옅게 도는 나침반
function background(ctx, t) {
  ctx.fillStyle = BRAND.soft; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.globalAlpha = 0.5; ctx.strokeStyle = BRAND.line; ctx.lineWidth = 2;
  const o = (t * 18) % 90;
  for (let y = -90 + o; y < H; y += 90) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.06; ctx.translate(900, 300); ctx.rotate(t * 0.15);
  ctx.beginPath(); ctx.arc(0, 0, 260, 0, Math.PI * 2); ctx.strokeStyle = BRAND.brown; ctx.lineWidth = 18; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(0, -220); ctx.lineTo(30, 0); ctx.lineTo(0, 220); ctx.lineTo(-30, 0); ctx.closePath();
  ctx.fillStyle = BRAND.brown; ctx.fill(); ctx.restore();
}
function pill(ctx, x, y, w, h, fill, stroke, lw = 3) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
// ── 머리띠: 슬롯 칩 · 주차 · AI 표시 · 진행 막대 (y 236~336, SAFE.top 220 아래)
function header(ctx, plan, t, total) {
  const S = SLOT[plan.slot] || SLOT.econ;
  pill(ctx, 72, 236, 236, 70, S.accent);
  drawFit(ctx, S.label, 190, 272, 200, 36, 26, 1, BODY(800), S.onAccent);
  drawFit(ctx, String(plan.week || ''), 330, 272, 410, 36, 24, 1, BODY(800), BRAND.deep, 'left');
  pill(ctx, 760, 244, 248, 54, '#FFFFFF', BRAND.line);
  drawFit(ctx, 'AI 캐릭터 · AI 목소리', 884, 272, 224, 24, 18, 1, BODY(700), BRAND.brown);
  pill(ctx, 72, 326, 936, 10, BRAND.line);
  pill(ctx, 72, 326, Math.max(10, 936 * cl(total ? t / total : 0)), 10, S.accent);
}

// 장면 그리기에 넘길 data (끝장은 엠블럼·주차·입 모양을 더함)
function dataOf(scene, plan, assets, mouth) {
  const d = scene.data || {};
  return scene.kind === 'outro' ? { ...d, emblem: assets.emblem || null, week: plan.week, mouth } : d;
}
function drawScene(ctx, scene, plan, assets, p, lt, mouth) {
  const f = KINDS[scene.kind]; if (!f) return;
  f(ctx, dataOf(scene, plan, assets, mouth), p, lt, plan.slot);
}
const posOf = (kind) => CHAR_POS[KIND_POS[kind]] || null; // null = 캐릭터를 장면이 직접 그림(outro)

// 입 모양: 말하는 동안 소리 크기(0~1)를 보고 연다 (작은 소리는 다묾)
function mouthAt(line, lt) {
  if (!line || lt < 0 || lt >= line.sec) return 0;
  const v = (line.rms || [])[Math.floor(lt * 30)] || 0;
  return v > 0.08 ? cl(Math.sqrt(v) * 1.25) : 0;
}

// plan: 설계도 · track: { lines:[{ text, sec, rms }], total? } · assets: { emblem }
export function drawFrame(ctx, plan, track, t, assets = {}) {
  const lines = track.lines || []; const scenes = plan.scenes || [];
  const tl = timeline(track); if (!tl.length) return;
  const total = tl[tl.length - 1].end;
  const i = lineAt(tl, t); const L = lines[i]; const sc = scenes[i] || scenes[scenes.length - 1];
  const lt = t - tl[i].start; const p = cl(lt / (L.sec || 1));
  const mouth = mouthAt(L, lt);

  background(ctx, t);
  header(ctx, plan, t, total);

  // 장면 넘김: 앞 장면은 XFADE초 동안 위로 사라지고, 새 장면은 아래에서 올라온다
  const e = EASE(lt / XFADE);
  const prev = i > 0 ? scenes[i - 1] : null;
  if (prev && e < 1) {
    ctx.save(); ctx.globalAlpha = 1 - e; ctx.translate(0, -e * 40);
    drawScene(ctx, prev, plan, assets, 1, 99, 0); ctx.restore();
  }
  ctx.save(); ctx.globalAlpha = e; ctx.translate(0, (1 - e) * 50);
  drawScene(ctx, sc, plan, assets, p, lt, mouth); ctx.restore();

  // 캐릭터: 장면 종류에 맞는 자리로 0.5초 동안 옮겨 간다. 끝장(outro)은 장면이 형제를 직접 그리므로 사라진다
  const ch = CHARACTERS[plan.slot] || CHARACTERS.econ;
  const to = posOf(sc.kind); const from = prev ? posOf(prev.kind) : to;
  const m = EASE(lt / 0.5);
  const opts = { variant: ch.variant, mood: sc.mood, mouth, blink: (t % 3.3) < 0.12 ? 1 : 0, needle: plan.slot, t };
  if (to) {
    const a = from || to;
    drawCharacter(ctx, { ...opts, x: lerp(a.x, to.x, m), y: lerp(a.y, to.y, m), scale: lerp(a.s, to.s, m), point: KIND_POS[sc.kind] === 'left' && m > 0.5 ? 1 : 0 });
  } else if (from && e < 1) {
    ctx.save(); ctx.globalAlpha = 1 - e;
    drawCharacter(ctx, { ...opts, mouth: 0, x: from.x, y: from.y, scale: from.s, point: 0 }); ctx.restore();
  }

  drawCaption(ctx, sc.text || L.text, p);
}

// 미리보기 검사용: 자막이 2줄·폭·아래 안전선 안인지 (설계서 6-6)
export function captionProblems(ctx, plan) {
  const bad = []; ctx.font = capFont;
  for (const [i, s] of (plan.scenes || []).entries()) {
    for (const c of captionChunks(ctx, s.text)) {
      if (c.lines.length > CAP.maxLines) bad.push(`장면 ${i + 1}: 자막 ${c.lines.length}줄`);
      for (const ln of c.lines) {
        const w = ln.reduce((a, t) => a + t.width, 0) + ctx.measureText(' ').width * (ln.length - 1);
        if (w > CAP.maxW + 0.5) bad.push(`장면 ${i + 1}: 자막 폭 ${Math.round(w)}`);
      }
    }
  }
  const bottom = CAP.y + (CAP.maxLines - 1) * CAP.lineH + CAP.size / 2;
  if (CAP.y - CAP.size / 2 < CAPTION_Y0) bad.push('자막 위끝이 장면 구역에 닿음');
  if (bottom > H - 420) bad.push(`자막 아래끝 ${bottom} > ${H - 420}`);
  return bad;
}
