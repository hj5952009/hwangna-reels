// Gemini 호출 — 장면 설계도 쓰기(writePlan) · 근거 확인(checkPlan) · 목소리(speak)
// 키는 x-goog-api-key 머리글에만 넣는다 (주소·로그·오류 문구에 넣지 않음).
// 발표 자료·대본 내용도 로그에 찍지 않는다 (공개 저장소 Actions 로그).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { MOODS, validatePlan, checkData, outroScene, PLAN_LIMITS, KINDS, KIND_DATA, SLACK } from './rules.mjs';
import { ICONS } from './icons.js';
import { CHARACTERS } from './brand.js';
import { toSpeech } from './readout.mjs';

const BASE = 'https://generativelanguage.googleapis.com';
export const MODELS = {
  text: process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash',
  tts: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
  // 첫 모델이 붐비면(503 high demand 등) 차례로 넘어갈 모델 (26.11.25 실제 시험에서 3.8 Flash 503으로 두 칸 실패)
  // 2.5 Flash는 새 사용자에게 안 열림(404, 26.11.25 네 번째 시험) — 없는 모델은 404로 건너뛴다
  textFallback: (process.env.GEMINI_TEXT_FALLBACK || 'gemini-3.5-flash-lite').split(',').map((x) => x.trim()).filter(Boolean),
  ttsFallback: (process.env.GEMINI_TTS_FALLBACK || 'gemini-3.8-flash-lite-tts').split(',').map((x) => x.trim()).filter(Boolean),
};
const BUSY_MSG = 'Gemini가 붐벼요 (모든 모델이 바빠요) — 잠시 뒤 다시 만들기를 눌러 주세요';
const PER_DAY_MSG = 'Gemini 429: 오늘 무료 하루 한도를 다 썼어요 (한국 시간 오후 5시에 다시 채워져요)';
// 다음 모델로 넘어가도 되는 오류: 서버 붐빔·과부하(5xx)와 한도(429) — 무료 하루 한도도 모델마다 따로라(PerProjectPerModel) 넘어간다
// + 그 모델을 못 씀(404) + 답이 없거나 연결이 끊김(network)
const canFallback = (e) => !!e && (e.status >= 500 || e.status === 429 || e.status === 404 || e.network === true);
// 요청 하나의 시간 제한 — 없으면 Node fetch가 5분(헤더 대기 기본값)을 기다린 뒤 'fetch failed' (26.11.25 경제 칸)
const REQ_TIMEOUT_MS = Number(process.env.GEMINI_REQ_TIMEOUT_MS) || 150000;
// 모델 목록을 차례로 써 본다 — 붐빔·한도면 다음 모델, 다른 오류(400 등)는 바로 throw
async function withModels(models, fn) {
  const errs = [];
  for (const m of models) {
    try { return await fn(m); } catch (e) {
      if (!canFallback(e)) throw e;
      errs.push(e);
      // 원인 찾기용: 모델 이름과 상태 번호만 남긴다 (키·발표 내용·오류 본문은 안 찍음)
      console.log(`[gemini] ${m} ${e.network ? 'network' : e.status || '?'}${e.perDay ? ' PerDay' : ''} → 다음 모델`);
    }
  }
  const allPerDay = errs.length && errs.every((e) => e.perDay);
  throw Object.assign(new Error(allPerDay ? PER_DAY_MSG : BUSY_MSG), { status: errs.at(-1) && errs.at(-1).status, busy: !allPerDay, perDay: allPerDay });
}
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 오류 문구에서 키를 지움
const scrub = (key, s) => (key ? String(s).split(key).join('***') : String(s));

// 붐빔(5xx)·분당 한도는 3번까지 5·15·30초 쉬고 다시 — 실패한 요청도 무료 몫을 깎을 수 있어 그 뒤엔 다음 모델로 (withModels)
async function call(key, url, init = {}, { sleep = realSleep, retries = 3 } = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('x-goog-api-key', key);
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(REQ_TIMEOUT_MS) });
    } catch (e) {
      // 답이 없거나(시간 초과) 연결이 끊김 — 한 번만 다시 묻고, 그래도 안 되면 다음 모델로 (withModels)
      if (attempt >= 1) throw Object.assign(new Error(scrub(key, `Gemini 연결 실패 (${e && e.name === 'TimeoutError' ? `${REQ_TIMEOUT_MS / 1000}초 동안 답이 없음` : (e && e.message) || '네트워크'})`)), { status: 0, network: true });
      await sleep(5000);
      continue;
    }
    if (res.ok) return res;
    let body = null;
    try { body = await res.json(); } catch { /* 본문 없음 */ }
    // 무료 등급 하루 한도(PerDay)는 다시 시도해도 안 되고 한도만 더 깎이므로 바로 멈춘다 (태평양 자정 = 한국 17시에 다시 참)
    if (res.status === 429 && /PerDay/.test(JSON.stringify((body && body.error && body.error.details) || []))) {
      throw Object.assign(new Error(PER_DAY_MSG), { status: 429, perDay: true });
    }
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      const msg = (body && body.error && body.error.message) || '';
      throw Object.assign(new Error(scrub(key, `Gemini ${res.status}${msg ? `: ${msg.slice(0, 200)}` : ''}`)), { status: res.status });
    }
    await sleep([5000, 15000, 30000][Math.min(attempt, 2)]);
  }
}

// ── 파일 올리기 (resumable) ───────────────────────────────
export async function uploadFile(key, path, mimeType, { sleep = realSleep } = {}) {
  const bytes = readFileSync(path);
  const start = await call(key, `${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(bytes.length),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: basename(path) } }),
  }, { sleep });
  const upUrl = start.headers.get('x-goog-upload-url');
  if (!upUrl) throw new Error('Gemini 파일 올리기 주소를 받지 못했어요');
  const up = await call(key, upUrl, {
    method: 'POST',
    headers: { 'Content-Length': String(bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
    body: bytes,
  }, { sleep });
  let file = (await up.json()).file;
  for (let i = 0; file.state !== 'ACTIVE'; i++) {
    if (file.state === 'FAILED') throw new Error('Gemini가 파일을 읽지 못했어요');
    if (i >= 60) throw new Error('Gemini 파일 처리 시간 초과');
    await sleep(3000);
    const r = await call(key, `${BASE}/v1beta/${file.name}`, { method: 'GET' }, { sleep });
    file = { ...file, ...(await r.json()) };
  }
  return { fileData: { fileUri: file.uri, mimeType: file.mimeType || mimeType } };
}

// 구조화 출력(JSON) 한 번 요청 — 깨진 JSON이면 SyntaxError
async function generateJson(key, parts, schema, { sleep, temperature = 0.7 } = {}) {
  const res = await withModels([MODELS.text, ...MODELS.textFallback], async (model) => {
    const ask = (generationConfig, extra = []) => call(key, `${BASE}/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [...parts, ...extra] }], generationConfig }),
    }, { sleep });
    try {
      return await ask({ responseMimeType: 'application/json', responseJsonSchema: schema, temperature });
    } catch (e) {
      // 모델에 따라 설계도 스키마가 '너무 복잡(too many states)'하다고 400 (26.11.25 다섯 번째 시험)
      // → 스키마는 글로 주고 JSON만 요구해 같은 모델에 한 번 더 (결과는 규칙 검사가 다시 봄)
      if (e.status !== 400 || !/too many states|schema/i.test(e.message)) throw e;
      return await ask({ responseMimeType: 'application/json', temperature }, [{ text: `출력은 아래 JSON 스키마를 그대로 따르는 JSON 하나만 써요:\n${JSON.stringify(schema)}` }]);
    }
  });
  const j = await res.json();
  const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('');
  return JSON.parse(text); // 깨진 JSON이면 throw
}

// ── v2: 장면 설계도 (설계서 6-3·6-4) ───────────────────────
export async function uploadPdf({ key, pdfPath, sleep = realSleep }) {
  if (!pdfPath) throw new Error('자료 없음: PDF가 없어요');
  return [await uploadFile(key, pdfPath, 'application/pdf', { sleep })];
}

const STR = { type: 'string' };
const NUM = { type: 'number' };
const ICON = { type: 'string', enum: ICONS };
const SIDE = { type: 'object', properties: { icon: ICON, label: STR, title: STR, rows: { type: 'array', items: STR } } };
const CARD = { type: 'object', properties: { title: STR, sub: STR } };
// 종류마다 모양이 달라 필드를 모두 열어 두고, 종류별 모양·글자 상한은 코드(validatePlan)가 강제한다
const DATA = {
  type: 'object',
  properties: {
    left: SIDE, right: SIDE, stamp: STR,
    value: STR, unit: STR, label: STR, ratio: NUM,
    word: STR, easy: STR,
    a: CARD, b: CARD, c: CARD,
    rows: { type: 'array', items: { type: 'object', properties: { label: STR, from: NUM, to: NUM, unit: STR }, required: ['label', 'from', 'to'] } },
    items: { type: 'array', items: { anyOf: [STR, { type: 'object', properties: { icon: ICON, label: STR }, required: ['icon', 'label'] }] } },
    style: { type: 'string', enum: ['flow', 'check'] },
  },
};
const SCENE = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: KINDS.filter((k) => k !== 'outro') }, // 끝장은 코드가 붙인다
    say: { type: 'string', description: '소리로 읽을 문장 (해요체)' },
    text: { type: 'string', description: '자막. 핵심어 한 곳을 **강조**' },
    mood: { type: 'string', enum: MOODS },
    data: DATA,
    src: { type: 'object', properties: { page: { type: 'integer' }, quote: STR }, required: ['page', 'quote'] },
  },
  required: ['kind', 'say', 'text', 'mood', 'data'],
};
const L = PLAN_LIMITS;
export const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    title: STR,
    scenes: { type: 'array', minItems: L.minScenes - 1, maxItems: L.maxScenes - 1, items: SCENE },
    caption: STR,
    hashtags: { type: 'array', maxItems: L.hashtags, items: STR },
  },
  required: ['title', 'scenes', 'caption', 'hashtags'],
};
const PLAN_CHECK_SCHEMA = {
  type: 'object',
  properties: {
    check: { type: 'array', items: { type: 'object', properties: { scene: { type: 'integer' }, action: { type: 'string', enum: ['kept', 'fixed', 'removed'] }, why: STR, fixed: SCENE }, required: ['scene', 'action', 'why'] } },
  },
  required: ['check'],
};
const CHECK_MIN_CHARS = 220; // 근거 확인으로 장면이 빠질 수 있어 하한을 낮춤 (약 30초)

// 규칙 표(KIND_DATA)를 사람이 읽는 글로 — 프롬프트와 코드 검사가 같은 상한을 쓰게
const shapeText = (sp) => {
  if (sp.t === 'str') return `글자 ${sp.max}자까지${sp.opt ? '(선택)' : ''}`;
  if (sp.t === 'num') return `숫자${sp.opt ? '(선택, 0~1)' : ''}`;
  if (sp.t === 'icon') return '아이콘';
  if (sp.t === 'enum') return sp.values.join('|');
  if (sp.t === 'arr') return `[${sp.min}~${sp.max}개: ${shapeText(sp.item)}]`;
  return `{ ${Object.entries(sp.fields).map(([k, f]) => `${k}: ${shapeText(f)}`).join(', ')} }`;
};
const KIND_HELP = {
  question: '아이콘 두 개를 선으로 잇고 결과 도장(✕ 또는 ?)을 찍는 질문 장면',
  bignum: '큰 숫자 하나 + 단위 + 이름 (ratio는 0~1 채움 막대)',
  keyword: '핵심어 도장 + 한 줄 쉬운 풀이',
  formula: 'A + B = C 카드',
  compare: '두 칸 비교 (칸마다 2~3줄)',
  bars: '전→후 막대 2~3개 (숫자만, 단위는 unit)',
  steps: '흐름(flow) 또는 체크(check) 2~4단계',
  icons: '아이콘 2~4개와 이름',
};

function planPrompt(meta, notes, problems) {
  const ch = CHARACTERS[meta.slot];
  const outroLen = ch.outro.length;
  const lines = [
    `너는 전북대 금융권 취업 학회 '황금나침반'의 인스타 릴스 설계자야. 첨부한 이번 주 위클리 ${SLOT_NAME[meta.slot]} 발표 PDF를 보고, 캐릭터 '${ch.name}'가 설명하는 30~60초 세로 릴스의 장면 설계도를 JSON으로 써 줘.`,
    `발표 제목: ${meta.title || '(PDF에서 찾기)'} / 주차: ${meta.week}`,
    `캐릭터 말투: ${ch.tone}. 해요체로, 대학교 새내기도 알아듣게 쉽게.`,
    `즐겨 쓰는 장면(권장): ${ch.favor.join('·')}. 다른 종류도 써도 된다.`,
    '규칙:',
    `- 장면 ${L.minScenes - 1}~${L.maxScenes - 1}개. 끝인사 장면은 쓰지 마 (코드가 붙인다).`,
    `- 첫 장면은 question 또는 bignum. 왜 → 그래서 순서로 이어지게.`,
    `- 모든 장면의 say 글자 수 합이 ${L.minChars - outroLen}~${L.maxChars - outroLen}자.`,
    '- 숫자·사실은 첨부 PDF에 있는 것만 쓴다. 숫자나 사실이 있는 장면은 src에 PDF 쪽 번호(1부터)와 PDF 원문 그대로의 짧은 인용을 넣는다.',
    "- 사람 이름(발표자 포함)을 쓰지 말고 '발표자'라고 쓴다.",
    '- 사라·팔라·오른다 단정 같은 투자 권유 표현, 특정 종목 추천, 겁주는 표현을 쓰지 않는다. 투자 권유 아님 고지는 쓰지 않는다 (게시할 때 붙는다).',
    `- mood는 ${MOODS.join('|')} 중 하나. text는 자막(짧게, 핵심어 한 곳을 **강조**).`,
    '- 장면 종류별 data 모양(다른 필드는 비워 둔다, 글자 수는 띄어쓰기 포함):',
    ...Object.keys(KIND_HELP).map((k) => `  · ${k} — ${KIND_HELP[k]}: ${shapeText({ t: 'obj', fields: KIND_DATA[k] })}`),
    `- 아이콘은 이 목록에서만: ${ICONS.join(', ')}`,
    `- caption: 인스타 본문용 2~3줄 요약. hashtags: '#황금나침반' 포함 ${L.hashtags}개 이하.`,
  ];
  if (String(notes || '').trim()) lines.push('발표자가 붙인 대본·메모 (참고용, 숫자는 PDF로 확인):', String(notes).trim());
  if (problems && problems.length) lines.push(`이전 설계도 문제: ${problems.join(' / ')} — 이 문제를 고쳐서 다시 써 줘.`);
  return lines.join('\n');
}
const SLOT_NAME = { econ: '경제', fin: '금융' };

// Gemini 결과 → 설계도 (끝장은 코드가 붙인다)
const assemble = (raw, meta) => ({
  slot: meta.slot,
  week: meta.week,
  title: String(raw.title || meta.title || ''),
  scenes: [...(Array.isArray(raw.scenes) ? raw.scenes : []).filter((s) => s && s.kind !== 'outro'), outroScene(meta.slot)],
  caption: raw.caption,
  hashtags: raw.hashtags,
});

export async function writePlan({ key, sources, notes = '', meta, sleep = realSleep }) {
  if (!sources || !sources.length) throw new Error('자료 없음: PDF가 없어요');
  const names = meta.names || [];
  let problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let raw;
    try {
      raw = await generateJson(key, [...sources, { text: planPrompt(meta, notes, problems) }], PLAN_SCHEMA, { sleep });
    } catch (e) {
      // 깨진 JSON만 다시 묻는다. 한도·서버 오류는 다시 물어도 몫만 쓴다
      if (!(e instanceof SyntaxError)) throw new Error(scrub(key, e.message));
      problems = ['JSON 형식이 깨졌어요'];
      continue;
    }
    const plan = assemble(raw, meta);
    const v = validatePlan(plan, { names });
    if (!v.length) return plan;
    // 마지막 시도: 글자 상한을 조금(1.5배까지) 넘긴 것뿐이면 그대로 쓴다 (그리기가 줄여 그림)
    if (attempt === 1 && !validatePlan(plan, { names, slack: SLACK }).length) return plan;
    // 마지막 시도: 몇 장면의 data만 틀렸으면 그 장면만 빼고 쓴다 (첫 장면·끝장은 빼지 않음, 근거 확인처럼 하한을 낮춰 다시 검사)
    if (attempt === 1) {
      const scenes = plan.scenes.filter((s, i) => i === 0 || s.kind === 'outro' || !checkData(s.kind, s.data, SLACK).length);
      const pruned = { ...plan, scenes };
      if (scenes.length < plan.scenes.length && !validatePlan(pruned, { names, minChars: CHECK_MIN_CHARS, slack: SLACK }).length) return pruned;
    }
    problems = v;
  }
  throw new Error(scrub(key, `설계도를 만들지 못했어요: ${problems.join(' / ')}`));
}

// 장면마다 근거(PDF)와 맞춰 보고 고치거나 뺀다. 다시 묻지 않는다 (설계서 6-4)
export async function checkPlan({ key, plan, sources, names = [], sleep = realSleep }) {
  const body = plan.scenes.filter((s) => s.kind !== 'outro').map((s, i) => ({ scene: i + 1, ...s }));
  const prompt = [
    '아래 릴스 장면 설계도를 첨부한 발표 PDF(근거)와 장면마다 맞춰 봐 줘.',
    '- src의 인용이 PDF에 정말 있는지, say·text·data의 숫자가 인용·PDF와 같은지 본다.',
    '- 근거가 없거나 틀린 숫자·사실이 있으면 근거에 맞게 고치고(fixed), 고칠 수 없으면 뺀다(removed). 숫자가 없는 장면(keyword·icons·steps)으로 바꿔 남겨도 된다.',
    "- 사람 이름이 들어 있으면 '발표자'로 고친다(fixed).",
    '- 투자 권유로 읽히는 표현도 고친다(fixed). 문제없으면 kept.',
    '- 첫 장면은 question 또는 bignum으로 남긴다. 고친 장면의 글자 수 상한·data 모양은 원래 장면과 같게 지킨다.',
    '- 장면마다 check 하나: scene(번호), action(kept|fixed|removed), why(짧게), fixed(action이 fixed일 때 고친 장면 전체).',
    `설계도: ${JSON.stringify(body)}`,
  ].join('\n');
  let out;
  try {
    out = await generateJson(key, [...sources, { text: prompt }], PLAN_CHECK_SCHEMA, { sleep, temperature: 0.2 });
  } catch (e) {
    throw new Error(scrub(key, `근거 확인 실패: ${e instanceof SyntaxError ? 'JSON 형식이 깨졌어요' : e.message}`));
  }
  const check = [];
  const byScene = new Map();
  for (const c of Array.isArray(out.check) ? out.check : []) {
    if (!c || !Number.isInteger(c.scene) || c.scene < 1 || c.scene > body.length) continue;
    let { action, why } = c;
    if (!['kept', 'fixed', 'removed'].includes(action)) continue;
    // 고쳤다는데 고친 장면이 없으면 확인되지 않은 것이므로 뺀다
    if (action === 'fixed' && !(c.fixed && typeof c.fixed === 'object' && c.fixed.kind && c.fixed.kind !== 'outro')) { action = 'removed'; why = `${why || ''} (고친 장면이 없어 뺌)`.trim(); }
    // 고친 장면의 종류·data가 규칙에 안 맞으면 그 장면만 뺀다 (영상 전체를 실패시키지 않게)
    else if (action === 'fixed' && (!KINDS.includes(c.fixed.kind) || checkData(c.fixed.kind, c.fixed.data, SLACK).length)) { action = 'removed'; why = `${why || ''} (고친 장면이 규칙에 안 맞아 뺌)`.trim(); }
    byScene.set(c.scene, { action, fixed: c.fixed });
    check.push({ scene: c.scene, action, why: String(why || '') });
  }
  const scenes = [];
  body.forEach(({ scene, ...s }) => {
    const c = byScene.get(scene);
    if (c && c.action === 'removed') return;
    if (c && c.action === 'fixed') { const { scene: _n, ...f } = c.fixed; scenes.push(f); return; }
    scenes.push(s);
  });
  scenes.push(outroScene(plan.slot));
  if (scenes.length < L.minScenes) throw new Error(`PDF에서 읽을 내용이 부족해요 (근거가 있는 장면 ${scenes.length - 1}개)`);
  const checked = { ...plan, scenes, check };
  const v = validatePlan(checked, { names, minChars: CHECK_MIN_CHARS, slack: SLACK });
  if (v.length) throw new Error(scrub(key, `근거 확인 뒤 설계도가 규칙에 안 맞아요: ${v.join(' / ')}`));
  return checked;
}

// ── 목소리 ─────────────────────────────────────────────
function wavHeader(dataLen, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + dataLen, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(dataLen, 40);
  return h;
}
// WAV(RIFF)면 fmt·data를 찾아 PCM을 꺼내고, 아니면 raw PCM으로 본다
function toPcm(buf, mimeType) {
  if (buf.subarray(0, 4).toString() === 'RIFF') {
    let off = 12, rate = 24000, data = null;
    while (off + 8 <= buf.length) {
      const id = buf.subarray(off, off + 4).toString(); const len = buf.readUInt32LE(off + 4);
      if (id === 'fmt ') rate = buf.readUInt32LE(off + 12);
      if (id === 'data') { data = buf.subarray(off + 8, Math.min(buf.length, off + 8 + len)); break; }
      off += 8 + len + (len % 2);
    }
    return { pcm: data || Buffer.alloc(0), rate };
  }
  const m = /rate=(\d+)/.exec(mimeType || '');
  return { pcm: buf, rate: m ? Number(m[1]) : 24000 };
}
// 릴스 한 편의 대사를 요청 1번으로 읽힌다 (무료 몫: 3.8 Flash TTS 하루 10회, 설계서 6-5)
//   줄 사이에는 <short pause>를 넣고(소리 내어 읽지 않음 26.11.24 확인), 줄 나누기는 split.mjs splitTrack이 한다.
//   목소리·말투는 슬롯 캐릭터(CHARACTERS[slot].voice·style). 말투는 speech_metadata.style에만 넣는다.
export async function speak({ key, lines, voice = CHARACTERS.econ.voice, style = CHARACTERS.econ.style, outDir, sleep = realSleep }) {
  mkdirSync(outDir, { recursive: true });
  const item = { type: 'text', text: lines.map((l) => toSpeech(String(l))).join(' <short pause> ') };
  if (style) item.annotations = [{ type: 'speech_metadata', style }];
  const res = await withModels([MODELS.tts, ...MODELS.ttsFallback], (model) => call(key, `${BASE}/v1beta/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: [{ type: 'user_input', content: [item] }],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
    }),
  }, { sleep }));
  const j = await res.json();
  const audio = (j.steps || []).flatMap((st) => st.content || []).filter((c) => c.type === 'audio' && c.data).pop();
  if (!audio) throw new Error('목소리를 받지 못했어요');
  const { pcm, rate } = toPcm(Buffer.from(audio.data, 'base64'), audio.mime_type);
  const wav = join(outDir, 'voice.wav');
  writeFileSync(wav, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
  return { wav, pcm, rate, total: pcm.length / 2 / rate };
}
