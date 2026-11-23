// Gemini 호출 시험 (가짜 fetch — 실제 API·키 안 씀)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeScript, checkScript, speak } from '../src/gemini.mjs';

const KEY = 'TEST-KEY-should-never-appear-123';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const nosleep = async () => {};
const meta = { slot: 'econ', week: '11월 4주차', presenter: '김회준', title: '금리와 환율', photos: 1 };

function goodScript(len = 360) {
  const beats = [
    { line: '', show: { type: 'number', value: '2.5', unit: '%', text: '기준금리' }, mood: 'explain' },
    { line: '', show: { type: 'compare', a: '한국', b: '미국', text: '금리 차이' }, mood: 'stress' },
    { line: '', show: { type: 'keyword', text: '환율' }, mood: 'surprise' },
  ];
  const hook = '금리는 그대로인데 환율은 왜 올랐을까?'; const summary = '금리 차이가 벌어지면 환율이 올라요.';
  const each = Math.floor((len - hook.length - summary.length) / 3);
  beats.forEach((b) => { b.line = '나'.repeat(each); });
  return { title: '금리와 환율', hook, beats, summary, caption: '이번 주 위클리 경제' };
}
const textResp = (obj) => ({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] });
const json = (o, status = 200, headers = {}) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', ...headers } });

// 파일 올리기(시작·업로드·상태)와 generateContent를 흉내
function fakeGemini(genReplies, calls) {
  let g = 0;
  return async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes('/upload/v1beta/files') && !u.includes('upload_id')) return new Response('{}', { status: 200, headers: { 'x-goog-upload-url': 'https://upload.example/x?upload_id=1' } });
    if (u.includes('upload_id')) return json({ file: { name: 'files/abc', uri: 'https://gen/files/abc', mimeType: 'application/pdf', state: 'PROCESSING' } });
    if (u.includes('/v1beta/files/abc')) return json({ name: 'files/abc', uri: 'https://gen/files/abc', state: 'ACTIVE' });
    if (u.includes(':generateContent')) { const r = genReplies[Math.min(g, genReplies.length - 1)]; g++; return typeof r === 'function' ? r() : json(r); }
    return new Response('no', { status: 404 });
  };
}
function pdf() { const d = mkdtempSync(join(tmpdir(), 'gm-')); const p = join(d, 'a.pdf'); writeFileSync(p, '%PDF-1.4 fake'); return p; }

test('writeScript: 규칙 위반(720자)이면 이유를 넣어 한 번 더 요청하고 두 번째 결과를 씀', async () => {
  const calls = [];
  globalThis.fetch = fakeGemini([textResp(goodScript(720)), textResp(goodScript(380))], calls);
  const s = await writeScript({ key: KEY, pdfPath: pdf(), audioPath: null, meta, sleep: nosleep });
  const gens = calls.filter((c) => c.url.includes(':generateContent'));
  assert.equal(gens.length, 2);
  const second = String(gens[1].init.body);
  assert.match(second, /길이 7\d\d자/);
  assert.equal(s.slot, 'econ'); assert.equal(s.week, '11월 4주차'); assert.equal(s.presenter, '김회준');
  assert.ok(s.hook.length > 0 && s.beats.length === 3);
  // 업로드한 PDF를 fileData로 넘김
  assert.match(String(gens[0].init.body), /"fileUri":"https:\/\/gen\/files\/abc"/);
});

test('writeScript: 두 번 다 깨진 JSON이면 실패', async () => {
  globalThis.fetch = fakeGemini([textResp('{깨진'), textResp('이것도 아님')], []);
  await assert.rejects(writeScript({ key: KEY, pdfPath: pdf(), audioPath: null, meta, sleep: nosleep }), /대본을 만들지 못했어요/);
});

test('writeScript: 자료가 하나도 없으면 자료 없음', async () => {
  await assert.rejects(writeScript({ key: KEY, pdfPath: null, audioPath: null, meta, sleep: nosleep }), /자료 없음/);
});

test('checkScript: 근거 없는 줄을 뺀 결과와 check 정보를 돌려줌', async () => {
  const calls = [];
  const base = { ...goodScript(380), ...meta };
  const checked = { ...goodScript(330), check: { removed: ['미국 금리가 7%'], ok: true } };
  globalThis.fetch = fakeGemini([textResp(checked)], calls);
  const s = await checkScript({ key: KEY, script: base, sources: [{ fileData: { fileUri: 'https://gen/files/abc', mimeType: 'application/pdf' } }] });
  assert.deepEqual(s.check.removed, ['미국 금리가 7%']);
  assert.equal(s.presenter, '김회준');
  assert.match(String(calls[0].init.body), /근거/);
});

// 1초짜리 24kHz 16bit PCM (사인파)
function pcmB64() {
  const n = 24000; const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 8000 * (i < n / 2 ? 1 : 0.2)), i * 2);
  return b.toString('base64');
}
test('speak: 429 두 번 뒤 세 번째에 성공하면 Track을 돌려줌', async () => {
  let tries = 0;
  globalThis.fetch = async (url, init) => {
    tries++;
    if (tries <= 2) return json({ error: { code: 429, message: 'quota' } }, 429);
    return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64() } }] } }] });
  };
  const out = mkdtempSync(join(tmpdir(), 'sp-'));
  const t = await speak({ key: KEY, lines: ['금리 2.5%예요'], outDir: out, sleep: nosleep });
  assert.equal(tries, 3);
  assert.equal(t.lines.length, 1);
  const l = t.lines[0];
  assert.equal(l.text, '금리 2.5%예요');
  assert.ok(Math.abs(l.sec - 1) < 0.01, `sec ${l.sec}`);
  assert.equal(l.rms.length, 30);
  assert.ok(Math.max(...l.rms) <= 1 && Math.max(...l.rms) > 0.9);
  assert.ok(l.rms[5] > l.rms[25]); // 앞이 더 큼
  assert.ok(existsSync(l.wav)); assert.equal(readFileSync(l.wav).subarray(0, 4).toString(), 'RIFF');
});

test('speak: 목소리 요청에는 읽기 변환된 글자가 들어감', async () => {
  const bodies = [];
  globalThis.fetch = async (url, init) => { bodies.push(String(init.body)); return json({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'audio/L16;codec=pcm;rate=24000', data: pcmB64() } }] } }] }); };
  await speak({ key: KEY, lines: ['GDP 3조 원'], outDir: mkdtempSync(join(tmpdir(), 'sp-')), sleep: nosleep });
  assert.match(bodies[0], /지디피 삼 조 원/);
  assert.match(bodies[0], /"responseModalities":\["AUDIO"\]/);
});

test('키는 주소에 넣지 않고 로그에도 찍히지 않음', async () => {
  const calls = []; const logs = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.join(' '));
  try {
    globalThis.fetch = fakeGemini([textResp('{깨진'), () => json({ error: { message: 'bad' } }, 500)], calls);
    await writeScript({ key: KEY, pdfPath: pdf(), audioPath: null, meta, sleep: nosleep }).catch((e) => logs.push(String(e.message)));
  } finally { Object.assign(console, orig); }
  assert.ok(calls.length > 0);
  for (const c of calls) {
    assert.ok(!c.url.includes(KEY), '주소에 키');
    assert.equal(new Headers(c.init.headers).get('x-goog-api-key'), KEY);
  }
  assert.ok(!logs.join('\n').includes(KEY), '로그에 키');
});
