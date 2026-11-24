// Gemini 호출 시험 (가짜 fetch — 실제 API·키 안 씀)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { speak, writePlan, checkPlan, uploadPdf, PLAN_SCHEMA } from '../src/gemini.mjs';
import { validatePlan, outroScene } from '../src/rules.mjs';
import { CHARACTERS } from '../src/brand.js';

const KEY = 'TEST-KEY-should-never-appear-123';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const nosleep = async () => {};
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

// ── v2: 장면 설계도 ─────────────────────────────────────
const PLAN = JSON.parse(readFileSync(new URL('./fixtures/plan.json', import.meta.url), 'utf8'));
const pmeta = { slot: 'econ', week: '12월 1주차', title: '금리와 환율', names: ['홍길동'] };
// Gemini가 돌려주는 모양: 끝장(outro)·slot·week 없이
const planReply = (edit = (p) => p) => { const { slot, week, ...p } = structuredClone(PLAN); p.scenes = p.scenes.filter((s) => s.kind !== 'outro'); return textResp(edit(p)); };
const SRC = [{ fileData: { fileUri: 'https://gen/files/abc', mimeType: 'application/pdf' } }];

test('uploadPdf: PDF를 올려 fileData 하나를 돌려줌, PDF가 없으면 자료 없음', async () => {
  globalThis.fetch = fakeGemini([], []);
  const src = await uploadPdf({ key: KEY, pdfPath: pdf(), sleep: nosleep });
  assert.deepEqual(src, [{ fileData: { fileUri: 'https://gen/files/abc', mimeType: 'application/pdf' } }]);
  await assert.rejects(uploadPdf({ key: KEY, pdfPath: null, sleep: nosleep }), /자료 없음/);
});

test('writePlan: 요청 본문에 PDF 파일·대본 글·캐릭터 말투가 들어가고, 결과 끝에 outro가 붙음', async () => {
  const calls = [];
  globalThis.fetch = fakeGemini([planReply()], calls);
  const p = await writePlan({ key: KEY, sources: SRC, notes: '메모: 환율 이야기를 쉽게', meta: pmeta, sleep: nosleep });
  const gens = calls.filter((c) => c.url.includes(':generateContent'));
  assert.equal(gens.length, 1);
  const body = JSON.parse(String(gens[0].init.body));
  const all = JSON.stringify(body);
  assert.match(all, /"fileUri":"https:\/\/gen\/files\/abc"/);
  assert.ok(all.includes('메모: 환율 이야기를 쉽게'));
  assert.ok(all.includes(CHARACTERS.econ.tone.slice(0, 12)));
  assert.ok(all.includes('발표자'));
  for (const k of CHARACTERS.econ.favor) assert.ok(all.includes(k), k);
  assert.deepEqual(body.generationConfig.responseJsonSchema, PLAN_SCHEMA);
  // 끝장은 코드가 붙임
  assert.deepEqual(p.scenes.at(-1), outroScene('econ'));
  assert.equal(p.scenes.length, PLAN.scenes.length);
  assert.equal(p.slot, 'econ'); assert.equal(p.week, '12월 1주차');
  assert.deepEqual(validatePlan(p), []);
});

test('writePlan: 금융 슬롯은 콕이 말투로', async () => {
  const calls = [];
  globalThis.fetch = fakeGemini([planReply()], calls);
  const p = await writePlan({ key: KEY, sources: SRC, notes: '', meta: { ...pmeta, slot: 'fin' }, sleep: nosleep });
  const all = String(calls.find((c) => c.url.includes(':generateContent')).init.body);
  assert.ok(all.includes(CHARACTERS.fin.tone.slice(0, 12)));
  assert.deepEqual(p.scenes.at(-1), outroScene('fin'));
});

test('writePlan: 규칙 위반이면 이유를 넣어 한 번 더, 두 번 다 실패면 throw', async () => {
  const bad = planReply((p) => { p.scenes[0].data.left.label = '가나다라마바사아자'; return p; });
  const calls = [];
  globalThis.fetch = fakeGemini([bad, planReply()], calls);
  const p = await writePlan({ key: KEY, sources: SRC, notes: '', meta: pmeta, sleep: nosleep });
  const gens = calls.filter((c) => c.url.includes(':generateContent'));
  assert.equal(gens.length, 2);
  assert.match(String(gens[1].init.body), /label.*9자/);
  assert.equal(p.scenes[0].data.left.label, '한국 금리');
  // 실명이 들어간 설계도도 위반
  const named = planReply((x) => { x.caption = '발표 홍길동'; return x; });
  globalThis.fetch = fakeGemini([bad, named], []);
  await assert.rejects(writePlan({ key: KEY, sources: SRC, notes: '', meta: pmeta, sleep: nosleep }), /설계도를 만들지 못했어요/);
  globalThis.fetch = fakeGemini([textResp('{깨진'), textResp('아님')], []);
  await assert.rejects(writePlan({ key: KEY, sources: SRC, notes: '', meta: pmeta, sleep: nosleep }), /설계도를 만들지 못했어요/);
});

test('checkPlan: 고친 장면은 바꾸고 뺀 장면은 빼고 check를 남김, 사람 이름도 물어봄', async () => {
  const calls = [];
  const fixedScene = { ...structuredClone(PLAN.scenes[1]), say: '이번 주 자료를 보면 원달러 환율이 1,400원을 넘었어요. 꽤 높은 값이에요.' };
  globalThis.fetch = fakeGemini([textResp({ check: [
    { scene: 2, action: 'fixed', why: '인용과 숫자를 맞춤', fixed: fixedScene },
    { scene: 5, action: 'removed', why: 'PDF에 근거 없음' },
    { scene: 1, action: 'kept', why: '근거 있음' },
  ] })], calls);
  const base = { ...structuredClone(PLAN), week: '12월 1주차' };
  const p = await checkPlan({ key: KEY, plan: base, sources: SRC, names: ['홍길동'], sleep: nosleep });
  assert.equal(p.scenes.length, PLAN.scenes.length - 1);
  assert.equal(p.scenes[1].say, fixedScene.say);
  assert.ok(!p.scenes.some((s) => s.kind === 'icons')); // 5번째(icons)가 빠짐
  assert.deepEqual(p.scenes.at(-1), outroScene('econ'));
  assert.deepEqual(p.check.map((c) => c.action), ['fixed', 'removed', 'kept']);
  const all = String(calls.find((c) => c.url.includes(':generateContent')).init.body);
  assert.match(all, /사람 이름/);
  assert.match(all, /"fileUri"/);
  assert.equal(p.slot, 'econ'); assert.equal(p.week, '12월 1주차');
});

test('checkPlan: removed 장면이 빠지고 6개 미만이면 "PDF에서 읽을 내용이 부족해요"', async () => {
  globalThis.fetch = fakeGemini([textResp({ check: [2, 3, 4].map((scene) => ({ scene, action: 'removed', why: '근거 없음' })) })], []);
  await assert.rejects(checkPlan({ key: KEY, plan: structuredClone(PLAN), sources: SRC, names: [], sleep: nosleep }), /PDF에서 읽을 내용이 부족해요/);
});

test('checkPlan: 고친 뒤 규칙 위반이면 다시 묻지 않고 실패', async () => {
  const calls = [];
  const fixedScene = { ...structuredClone(PLAN.scenes[2]), text: '지금 사세요' };
  globalThis.fetch = fakeGemini([textResp({ check: [{ scene: 3, action: 'fixed', why: 'x', fixed: fixedScene }] })], calls);
  await assert.rejects(checkPlan({ key: KEY, plan: structuredClone(PLAN), sources: SRC, names: [], sleep: nosleep }), /근거 확인 뒤/);
  assert.equal(calls.filter((c) => c.url.includes(':generateContent')).length, 1);
});

// 1초짜리 24kHz 16bit PCM (사인파)
function pcmB64() {
  const n = 24000; const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 8000 * (i < n / 2 ? 1 : 0.2)), i * 2);
  return b.toString('base64');
}
// Gemini 3.8 TTS(Interactions API) 응답: steps[].content[]의 audio (기본 WAV, RIFF 머리 있음)
function ttsResp() {
  const pcm = Buffer.from(pcmB64(), 'base64'); const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return { steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data: Buffer.concat([h, pcm]).toString('base64') }] }] };
}
const fin = CHARACTERS.fin;

test('speak: 429 두 번 뒤 세 번째에 성공하면 wav 하나와 pcm·길이를 돌려줌', async () => {
  let tries = 0;
  globalThis.fetch = async () => { tries++; return tries <= 2 ? json({ error: { code: 429, message: 'quota' } }, 429) : json(ttsResp()); };
  const out = mkdtempSync(join(tmpdir(), 'sp-'));
  const t = await speak({ key: KEY, lines: ['금리 2.5%예요'], voice: fin.voice, style: fin.style, outDir: out, sleep: nosleep });
  assert.equal(tries, 3);
  assert.equal(t.rate, 24000);
  assert.ok(Math.abs(t.total - 1) < 0.01, `total ${t.total}`);
  assert.equal(t.pcm.length, 48000);
  assert.ok(existsSync(t.wav)); assert.equal(readFileSync(t.wav).subarray(0, 4).toString(), 'RIFF');
});

// 3.8 TTS는 text를 그대로 읽으므로 말투 지시는 speech_metadata.style에만 (회장 확인: 지시문을 소리 내어 읽었음 26.11.24)
test('speak: 요청 1번, 본문에 <short pause>, style은 speech_metadata에만, voice는 인자', async () => {
  const reqs = [];
  globalThis.fetch = async (url, init) => { reqs.push({ url: String(url), body: JSON.parse(String(init.body)) }); return json(ttsResp()); };
  await speak({ key: KEY, lines: ['가게는 잘 되는데요', 'GDP 3조 원', '정리하면 이래요'], voice: fin.voice, style: fin.style, outDir: mkdtempSync(join(tmpdir(), 'sp-')), sleep: nosleep });
  assert.equal(reqs.length, 1);
  const { url, body } = reqs[0];
  assert.match(url, /\/v1beta\/interactions$/);
  const item = body.input[0].content[0];
  assert.equal(item.text, '가게는 잘 되는데요 <short pause> 지디피 삼 조 원 <short pause> 정리하면 이래요'); // 읽기 변환 + 지시문 안 섞임
  assert.equal(item.annotations[0].type, 'speech_metadata');
  assert.equal(item.annotations[0].style, fin.style);
  assert.equal(body.generation_config.speech_config[0].voice, 'Iapetus');
  assert.equal(body.response_format.type, 'audio');
});

// 무료 등급 하루 한도를 넘기면 다시 시도해도 실패하고 한도만 더 깎이므로 바로 멈춘다
test('speak: 하루 한도 초과(429 PerDay)면 다시 시도하지 않고 바로 알림', async () => {
  let tries = 0;
  globalThis.fetch = async () => { tries++; return json({ error: { code: 429, message: 'You exceeded your current quota', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }, 429); };
  await assert.rejects(speak({ key: KEY, lines: ['안녕'], voice: fin.voice, style: fin.style, outDir: mkdtempSync(join(tmpdir(), 'sp-')), sleep: nosleep }), /하루 한도/);
  assert.equal(tries, 1);
});

test('키는 주소에 넣지 않고 로그에도 찍히지 않음', async () => {
  const calls = []; const logs = [];
  const orig = { log: console.log, error: console.error, warn: console.warn, info: console.info };
  for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.join(' '));
  try {
    globalThis.fetch = fakeGemini([textResp('{깨진'), () => json({ error: { message: `bad ${KEY}` } }, 500)], calls);
    const sources = await uploadPdf({ key: KEY, pdfPath: pdf(), sleep: nosleep });
    await writePlan({ key: KEY, sources, notes: '', meta: pmeta, sleep: nosleep }).catch((e) => logs.push(String(e.message)));
  } finally { Object.assign(console, orig); }
  assert.ok(calls.length > 0);
  for (const c of calls) {
    assert.ok(!c.url.includes(KEY), '주소에 키');
    assert.equal(new Headers(c.init.headers).get('x-goog-api-key'), KEY);
  }
  assert.ok(!logs.join('\n').includes(KEY), '로그에 키');
});
