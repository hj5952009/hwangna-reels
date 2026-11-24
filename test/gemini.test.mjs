// Gemini 호출 시험 (가짜 fetch — 실제 API·키 안 씀)
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeScript, checkScript, speak, writePlan, checkPlan, uploadPdf, PLAN_SCHEMA } from '../src/gemini.mjs';
import { validatePlan, outroScene } from '../src/rules.mjs';
import { CHARACTERS } from '../src/brand.js';

const KEY = 'TEST-KEY-should-never-appear-123';
const realFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = realFetch; });
const nosleep = async () => {};
const meta = { slot: 'econ', week: '11월 4주차', presenter: '발표자', title: '금리와 환율', photos: 1 };

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

// ── v1 대본 (Task 6에서 make.mjs를 v2로 바꾸면 지움) ──────────────

test('writeScript: 규칙 위반(720자)이면 이유를 넣어 한 번 더 요청하고 두 번째 결과를 씀', async () => {
  const calls = [];
  globalThis.fetch = fakeGemini([textResp(goodScript(720)), textResp(goodScript(380))], calls);
  const s = await writeScript({ key: KEY, pdfPath: pdf(), audioPath: null, meta, sleep: nosleep });
  const gens = calls.filter((c) => c.url.includes(':generateContent'));
  assert.equal(gens.length, 2);
  const second = String(gens[1].init.body);
  assert.match(second, /길이 7\d\d자/);
  assert.equal(s.slot, 'econ'); assert.equal(s.week, '11월 4주차'); assert.equal(s.presenter, '발표자');
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
  assert.equal(s.presenter, '발표자');
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
    return json(ttsResp());
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

// Gemini 3.8 TTS(Interactions API) 응답: steps[].content[]의 audio (기본 WAV, RIFF 머리 있음)
function ttsResp() {
  const pcm = Buffer.from(pcmB64(), 'base64'); const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  return { steps: [{ type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data: Buffer.concat([h, pcm]).toString('base64') }] }] };
}

test('speak: 목소리 요청에는 읽기 변환된 글자가 들어감', async () => {
  const bodies = [];
  globalThis.fetch = async (url, init) => { bodies.push(String(init.body)); return json(ttsResp()); };
  await speak({ key: KEY, lines: ['GDP 3조 원'], outDir: mkdtempSync(join(tmpdir(), 'sp-')), sleep: nosleep });
  assert.match(bodies[0], /지디피 삼 조 원/);
});

// 3.8 TTS는 text를 그대로 읽으므로 말투 지시는 speech_metadata.style에만 (회장 확인: 지시문을 소리 내어 읽었음 26.11.24)
test('speak: 말투 지시는 소리 내어 읽지 않게 style 칸에만 넣음', async () => {
  const reqs = [];
  globalThis.fetch = async (url, init) => { reqs.push({ url: String(url), body: JSON.parse(String(init.body)) }); return json(ttsResp()); };
  await speak({ key: KEY, lines: ['가게는 잘 되는데요'], outDir: mkdtempSync(join(tmpdir(), 'sp-')), sleep: nosleep });
  const { url, body } = reqs[0];
  assert.match(url, /\/v1beta\/interactions$/);
  const item = body.input[0].content[0];
  assert.equal(item.text, '가게는 잘 되는데요'); // 지시문이 섞이지 않음
  assert.equal(item.annotations[0].type, 'speech_metadata');
  assert.ok(item.annotations[0].style.length > 0);
  assert.equal(body.generation_config.speech_config[0].voice, 'Puck'); // 회장 선택 26.11.24: Puck · 귀여운 마스코트
  assert.match(item.annotations[0].style, /mascot/);
  assert.equal(body.response_format.type, 'audio');
});

// 무료 등급 하루 한도를 넘기면 다시 시도해도 실패하고 한도만 더 깎이므로 바로 멈춘다
test('speak: 하루 한도 초과(429 PerDay)면 다시 시도하지 않고 바로 알림', async () => {
  let tries = 0;
  globalThis.fetch = async () => { tries++; return json({ error: { code: 429, message: 'You exceeded your current quota', details: [{ '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }] } }, 429); };
  await assert.rejects(speak({ key: KEY, lines: ['안녕'], outDir: mkdtempSync(join(tmpdir(), 'sp-')), sleep: nosleep }), /하루 한도/);
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
