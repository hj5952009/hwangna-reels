// 가짜 릴스 서버 — 앱 화면(promoReels.js)을 브라우저 미리보기에서 시험할 때만 쓴다. 실제 인스타에는 아무것도 안 올린다.
// 실행: node tools/reel-render/dev/mock-worker.mjs [포트=8787] → 앱 설정 promoApi = http://localhost:8787
// make를 받으면 단계(차례 기다리는 중 → 대본 쓰기 → … → 올리기)를 STEP_MS마다 넘기고 ready로 바꾼다. 영상은 시험용 색 화면.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const PORT = Number(process.argv[2] || 8787);
const STEP_MS = Number(process.env.STEP_MS || 1500);
const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = JSON.parse(readFileSync(join(HERE, '..', 'test', 'fixtures', 'script.json'), 'utf8'));
const DISCLAIMER = '🤖 AI 목소리·캐릭터로 만든 영상이에요 · 발표 내용 요약이며 투자 권유가 아니에요';
const SAMPLE = join(tmpdir(), 'hwangna-mock-reel.mp4');
if (!existsSync(SAMPLE)) execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xF6E7B8:s=540x960:d=4', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=4', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', SAMPLE]);

const db = {}; // wid → { rs, meta, chunks:Set('slot/kind/up/n'), request }
const W = (wid) => (db[wid] ||= { rs: {}, meta: {}, chunks: new Set(), request: null });
const UP_RE = /^[a-z0-9]{4,16}$/;
const part = (v) => (v && typeof v === 'object' && UP_RE.test(String(v.up || '')) && Number.isInteger(v.n) ? v : null);
const seq = (n) => Array.from({ length: Math.max(0, n | 0) }, (_, i) => i);
const filesOf = (m = {}) => ({
  econ: { pdf: seq((part((m.econ || {}).pdf) || {}).n), audio: seq((part((m.econ || {}).audio) || {}).n) },
  fin: { pdf: seq((part((m.fin || {}).pdf) || {}).n), audio: seq((part((m.fin || {}).audio) || {}).n) },
  photo: seq((part(m.photo) || {}).n),
});
const STEPS = ['차례 기다리는 중', '자료 받기', '대본 쓰기', '근거 확인', '목소리', '영상 굽기', '올리기'];
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,POST,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' };
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { ...cors, 'Content-Type': type }); res.end(type === 'application/json' ? JSON.stringify(body) : body); };
const body = (req) => new Promise((ok) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => ok(Buffer.concat(b))); });

function run(wid, slot, rerender) {
  const w = W(wid);
  let i = 0;
  const tick = () => {
    i += 1;
    if (i < STEPS.length) { w.rs[slot] = { ...w.rs[slot], state: 'making', step: STEPS[i], at: Date.now() }; setTimeout(tick, STEP_MS); return; }
    const m = (w.meta || {})[slot] || {};
    const script = rerender || { ...FIXTURE, slot, week: w.meta.week || FIXTURE.week, presenter: m.presenter || '시험', title: m.title || FIXTURE.title, check: { removed: ['근거 없는 숫자 문장 (가짜 서버 예시)'], ok: true } };
    const now = Date.now();
    w.rs[slot] = { state: 'ready', script, caption: `${String(script.caption || '').split(DISCLAIMER).join('').trim()}\n\n${DISCLAIMER}`, video: `http://localhost:${PORT}/m/sample.mp4?${slot}${now}`, cover: '', seconds: 4, renderedAt: now, at: now };
    console.log(`[${wid}/${slot}] ready`);
  };
  setTimeout(tick, STEP_MS);
}

createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const p = u.pathname.split('/').filter(Boolean);
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (p[0] === 'm') { res.writeHead(200, { ...cors, 'Content-Type': 'video/mp4' }); return res.end(readFileSync(SAMPLE)); }
  if (p[0] === 'health') return send(res, 200, { ok: true, mock: true });
  if (!/^Bearer .+/.test(req.headers.authorization || '')) return send(res, 401, { error: '운영진 로그인이 필요해요' });
  if (req.method === 'POST' && p[0] === 'publish') {
    const b = JSON.parse(String(await body(req)) || '{}');
    const m = /^reel-(\d{4}-\d{2}-\d{2})-(econ|fin)$/.exec(String(b.id || ''));
    if (!m) return send(res, 400, { error: '홍보물 번호가 이상해요' });
    const w = W(`w-${m[1]}`); const cur = w.rs[m[2]] || {};
    if (cur.state !== 'ready') return send(res, 409, { error: '릴스가 아직 준비되지 않았어요' });
    w.rs[m[2]] = { ...cur, state: 'posted', video: null, cover: null };
    console.log(`[가짜 게시] ${b.id} 문구 ${String(cur.caption || '').length}자 (서버에 있는 확인된 문구만 씀 · 실제로는 안 올림)`);
    return send(res, 200, { ok: true, id: 'mock', permalink: '' });
  }
  if (p[0] !== 'reels' || !/^w-\d{4}-\d{2}-\d{2}$/.test(p[1] || '')) return send(res, 404, { error: '없는 주소예요' });
  const wid = p[1]; const w = W(wid); const what = p[2];
  const busy = (slot) => (slot === 'photo' ? ['econ', 'fin'] : [slot]).some((s) => (w.rs[s] || {}).state === 'making');
  const BUSY = { error: '지금 만드는 중이라 자료를 바꿀 수 없어요 — 다 만든 뒤에 다시 해 주세요' };
  if (req.method === 'GET' && what === 'status') return send(res, 200, { ...w.rs, files: filesOf(w.meta) });
  if (req.method === 'PUT' && what === 'meta') {
    const b = JSON.parse(String(await body(req)) || '{}'); const o = w.meta || {};
    const slotMeta = (slot) => {
      const x = b[slot]; const m = { ...(o[slot] || {}) };
      if (!x || typeof x !== 'object') return m;
      for (const k of ['presenter', 'title', 'audioExt']) if (k in x) m[k] = x[k];
      for (const k of ['pdf', 'audio']) if (part(x[k])) { if (busy(slot)) throw Object.assign(new Error(BUSY.error), { code: 409 }); m[k] = { up: x[k].up, n: x[k].n }; }
      return m;
    };
    try {
      const meta = { week: b.week ?? o.week, meet: b.meet ?? o.meet, econ: slotMeta('econ'), fin: slotMeta('fin'), photo: o.photo || null };
      if (part(b.photo)) { if (busy('photo')) return send(res, 409, BUSY); meta.photo = { up: b.photo.up, n: b.photo.n }; }
      w.meta = meta;
    } catch (e) { return send(res, e.code || 400, { error: e.message }); }
    return send(res, 200, { ok: true });
  }
  if (req.method === 'PUT' && p.length === 5) {
    const [slot, kind, n] = p.slice(2); const up = u.searchParams.get('up') || '';
    if (!UP_RE.test(up)) return send(res, 400, { error: '올리기 번호(up)가 없어요' });
    if (busy(slot)) return send(res, 409, BUSY);
    const buf = await body(req);
    if (buf.length > 20 * 1024 * 1024) return send(res, 413, { error: '조각이 20MB를 넘어요' });
    w.chunks.add(`${slot}/${kind}/${up}/${+n}`);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'DELETE' && p.length === 3) { if (busy(what)) return send(res, 409, BUSY); if (what === 'photo') w.meta.photo = null; else w.meta[what] = { ...(w.meta[what] || {}), pdf: null, audio: null }; return send(res, 200, { ok: true }); }
  if (req.method === 'POST' && what === 'make') {
    const b = JSON.parse(String(await body(req)) || '{}');
    const slots = (b.slots || []).filter((s) => s === 'econ' || s === 'fin');
    for (const s of slots) if ((w.rs[s] || {}).state === 'making') return send(res, 409, { error: '이미 만드는 중이에요' });
    const need = [];
    for (const s of slots) for (const k of ['pdf', 'audio']) { const x = part((w.meta[s] || {})[k]); if (x) need.push(...seq(x.n).map((n) => `${s}/${k}/${x.up}/${n}`)); }
    const ph = part(w.meta.photo); if (ph) need.push(...seq(ph.n).map((n) => `photo/jpg/${ph.up}/${n}`));
    if (need.some((k) => !w.chunks.has(k))) return send(res, 409, { error: '자료가 다 올라가지 않았거나 7일이 지나 지워졌어요 — 다시 골라 올려 주세요' });
    for (const s of slots) { w.rs[s] = { state: 'making', step: STEPS[0], since: Date.now(), at: Date.now() }; run(wid, s, b.rerender && b.rerender[s]); }
    return send(res, 200, { ok: true, slots });
  }
  return send(res, 404, { error: '없는 주소예요' });
}).listen(PORT, () => console.log(`가짜 릴스 서버 http://localhost:${PORT} (단계 ${STEP_MS}ms)`));
