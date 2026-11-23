// Gemini 호출 — 대본 쓰기(writeScript) · 근거 확인(checkScript) · 목소리(speak)
// 키는 x-goog-api-key 머리글에만 넣는다 (주소·로그·오류 문구에 넣지 않음).
// 발표 자료·대본 내용도 로그에 찍지 않는다 (공개 저장소 Actions 로그).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { validate, LIMITS, SHOW_TYPES, MOODS } from './rules.mjs';
import { toSpeech } from './readout.mjs';

const BASE = 'https://generativelanguage.googleapis.com';
export const MODELS = {
  text: process.env.GEMINI_TEXT_MODEL || 'gemini-3.8-flash',
  tts: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
};
export const VOICE = {
  name: process.env.GEMINI_VOICE || 'Kore',
  // 3.8 TTS는 text를 그대로 읽으므로 말투는 speech_metadata.style로만 보낸다 (지시문을 앞에 붙이면 소리 내어 읽음)
  style: 'bright, clear and friendly Korean university-student narrator, polite casual tone, slightly fast',
};
const realSleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHECK_MIN = 240; // 근거 확인 뒤에는 줄이 빠질 수 있어 하한을 낮춤

// 오류 문구에서 키를 지움
const scrub = (key, s) => (key ? String(s).split(key).join('***') : String(s));

async function call(key, url, init = {}, { sleep = realSleep, retries = 3 } = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('x-goog-api-key', key);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, headers });
    if (res.ok) return res;
    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      let msg = '';
      try { const j = await res.json(); msg = (j && j.error && j.error.message) || ''; } catch { /* 본문 없음 */ }
      throw new Error(scrub(key, `Gemini ${res.status}${msg ? `: ${msg.slice(0, 200)}` : ''}`));
    }
    await sleep(Math.min(30000, 2000 * 2 ** attempt));
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

const AUDIO_MIME = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac', amr: 'audio/amr' };
export async function uploadSources({ key, audioPath, pdfPath, sleep }) {
  const out = [];
  if (pdfPath) out.push(await uploadFile(key, pdfPath, 'application/pdf', { sleep }));
  if (audioPath) {
    const ext = String(audioPath).split('.').pop().toLowerCase();
    out.push(await uploadFile(key, audioPath, AUDIO_MIME[ext] || 'audio/mp4', { sleep }));
  }
  return out;
}

// ── 대본 형식 (구조화 출력) ───────────────────────────────
const SHOW = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: SHOW_TYPES },
    text: { type: 'string', description: '화면에 크게 보일 짧은 말 (12자 안쪽)' },
    value: { type: 'string', description: 'number일 때 숫자만 (예: 2.5)' },
    unit: { type: 'string', description: 'number일 때 단위 (예: %, 원, 조 원)' },
    a: { type: 'string' }, b: { type: 'string' },
    page: { type: 'integer', description: 'slide일 때 PDF 쪽 번호 (1부터)' },
    photo: { type: 'integer', description: 'photo일 때 사진 번호 (0부터)' },
  },
  required: ['type', 'text'],
};
export const SCRIPT_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    hook: { type: 'string' },
    beats: { type: 'array', minItems: LIMITS.minBeats, maxItems: LIMITS.maxBeats, items: { type: 'object', properties: { line: { type: 'string' }, show: SHOW, mood: { type: 'string', enum: MOODS } }, required: ['line', 'show', 'mood'] } },
    summary: { type: 'string' },
    caption: { type: 'string' },
  },
  required: ['title', 'hook', 'beats', 'summary', 'caption'],
};
const CHECK_SCHEMA = {
  ...SCRIPT_SCHEMA,
  properties: { ...SCRIPT_SCHEMA.properties, check: { type: 'object', properties: { removed: { type: 'array', items: { type: 'string' } }, ok: { type: 'boolean' } }, required: ['removed', 'ok'] } },
  required: [...SCRIPT_SCHEMA.required, 'check'],
};

function writePrompt(meta, problems) {
  const slot = meta.slot === 'fin' ? '금융' : '경제';
  const lines = [
    `너는 전북대 금융권 취업 학회 '황금나침반'의 인스타 릴스 대본 작가야. 첨부한 이번 주 위클리 ${slot} 발표 자료(PDF·녹음)를 보고, 캐릭터가 설명하는 30~60초 세로 릴스 대본을 JSON으로 써 줘.`,
    `발표 제목: ${meta.title || '(자료에서 찾기)'} / 주차: ${meta.week} / 발표자: ${meta.presenter}`,
    '규칙:',
    `- 말하는 글자(hook + 각 beat의 line + summary)를 합쳐 ${LIMITS.minChars}~${LIMITS.maxChars}자. 해요체, 대학생 새내기도 알아듣게 쉽게.`,
    '- hook: 궁금하게 만드는 질문 한 줄. beats: 왜 → 그래서 순서로 이어지게 3~5개. summary: 한 줄 정리.',
    '- 숫자·사실은 첨부 자료에 있는 것만 쓴다. 자료에 없는 숫자를 지어내지 않는다.',
    "- 사라·팔라·오른다 단정 같은 투자 권유 표현을 쓰지 않는다. 특정 종목을 추천하지 않는다.",
    meta.slot === 'fin' ? "- 금융 릴스이므로 summary 끝에 '투자 권유가 아니에요'를 꼭 넣는다." : '',
    `- show.type은 ${SHOW_TYPES.join('·')} 중 하나. number는 value(숫자)·unit, compare는 a·b(짧게), slide는 page(1부터), photo는 photo(0~${Math.max(0, (meta.photos || 0) - 1)}).`,
    (meta.photos || 0) > 0 ? `- 발표 현장 사진이 ${meta.photos}장 있으니 photo 장면을 하나 넣어도 좋아.` : '- 사진이 없으니 photo 장면은 쓰지 않는다.',
    '- caption: 인스타 본문용 2~3줄 요약 + 해시태그 3개 안쪽.',
  ].filter(Boolean);
  if (problems && problems.length) lines.push(`이전 대본 문제: ${problems.join(' / ')} — 이 문제를 고쳐서 다시 써 줘.`);
  return lines.join('\n');
}

async function generateJson(key, parts, schema, { sleep, temperature = 0.7 } = {}) {
  const res = await call(key, `${BASE}/v1beta/models/${MODELS.text}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json', responseJsonSchema: schema, temperature } }),
  }, { sleep });
  const j = await res.json();
  const text = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map((p) => p.text || '').join('');
  return JSON.parse(text); // 깨진 JSON이면 throw
}

const withMeta = (s, meta) => ({ ...s, slot: meta.slot, week: meta.week, presenter: meta.presenter, title: s.title || meta.title || '' });

export async function writeScript({ key, audioPath = null, pdfPath = null, meta, sources = null, sleep = realSleep }) {
  if (!sources && !audioPath && !pdfPath) throw new Error('자료 없음: PDF도 녹음도 없어요');
  const src = sources || await uploadSources({ key, audioPath, pdfPath, sleep });
  if (!src.length) throw new Error('자료 없음: PDF도 녹음도 없어요');
  let problems = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    let s;
    try {
      s = withMeta(await generateJson(key, [...src, { text: writePrompt(meta, problems) }], SCRIPT_SCHEMA, { sleep }), meta);
    } catch (e) {
      problems = [e instanceof SyntaxError ? 'JSON 형식이 깨졌어요' : scrub(key, e.message)];
      continue;
    }
    const v = validate(s);
    if (!v.length) return s;
    problems = v;
  }
  throw new Error(scrub(key, `대본을 만들지 못했어요: ${problems.join(' / ')}`));
}

export async function checkScript({ key, script, sources, sleep = realSleep }) {
  const { slot, week, presenter, check, ...body } = script;
  const prompt = [
    '아래 릴스 대본의 문장과 숫자를 하나씩 첨부한 발표 자료(근거)와 맞춰 봐 줘.',
    '- 근거 자료에 없는 숫자·사실이 들어간 줄은 빼거나 근거에 맞게 고친다. 근거에 있는 내용은 그대로 둔다.',
    '- 투자 권유로 읽히는 표현도 고친다.',
    `- 고친 뒤에도 말하는 글자 합이 ${CHECK_MIN}~${LIMITS.maxChars}자, 장면 ${LIMITS.minBeats}~${LIMITS.maxBeats}개가 되게 한다.`,
    slot === 'fin' ? "- summary 끝의 '투자 권유가 아니에요'는 남긴다." : '',
    '- 같은 형식의 JSON에 check.removed(뺀·고친 원래 문장 목록)와 check.ok(근거와 맞으면 true)를 붙여 돌려줘.',
    `대본: ${JSON.stringify(body)}`,
  ].filter(Boolean).join('\n');
  let out;
  try {
    out = await generateJson(key, [...sources, { text: prompt }], CHECK_SCHEMA, { sleep, temperature: 0.2 });
  } catch (e) {
    throw new Error(scrub(key, `근거 확인 실패: ${e instanceof SyntaxError ? 'JSON 형식이 깨졌어요' : e.message}`));
  }
  const s = withMeta(out, { slot, week, presenter, title: script.title });
  const v = validate(s, { minChars: CHECK_MIN });
  if (v.length) throw new Error(scrub(key, `근거 확인 뒤 대본이 규칙에 안 맞아요: ${v.join(' / ')}`));
  return s;
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
function rmsOf(pcm, rate, fps = 30) {
  const n = Math.floor(pcm.length / 2); const win = Math.max(1, Math.round(rate / fps));
  const out = [];
  for (let s = 0; s < n; s += win) {
    let sum = 0; const e = Math.min(n, s + win);
    for (let i = s; i < e; i++) { const v = pcm.readInt16LE(i * 2) / 32768; sum += v * v; }
    out.push(Math.sqrt(sum / (e - s)));
  }
  const max = Math.max(1e-9, ...out);
  return out.map((v) => Math.min(1, v / max));
}

export async function speak({ key, lines, outDir, sleep = realSleep }) {
  mkdirSync(outDir, { recursive: true });
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const item = { type: 'text', text: toSpeech(text) };
    if (VOICE.style) item.annotations = [{ type: 'speech_metadata', style: VOICE.style }];
    const res = await call(key, `${BASE}/v1beta/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODELS.tts,
        input: [{ type: 'user_input', content: [item] }],
        response_format: { type: 'audio' },
        generation_config: { speech_config: [{ voice: VOICE.name }] },
      }),
    }, { sleep, retries: 3 });
    const j = await res.json();
    const audio = (j.steps || []).flatMap((st) => st.content || []).filter((c) => c.type === 'audio' && c.data).pop();
    if (!audio) throw new Error(`목소리를 받지 못했어요 (줄 ${i + 1})`);
    const { pcm, rate } = toPcm(Buffer.from(audio.data, 'base64'), audio.mime_type);
    const wav = join(outDir, `line${i}.wav`);
    writeFileSync(wav, Buffer.concat([wavHeader(pcm.length, rate), pcm]));
    out.push({ text, wav, sec: pcm.length / 2 / rate, rms: rmsOf(pcm, rate) });
  }
  return { lines: out, total: out.reduce((a, l) => a + l.sec, 0) };
}
