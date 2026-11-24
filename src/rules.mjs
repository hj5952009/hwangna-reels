// 위클리 설명 릴스 규칙 — validatePlan(plan) -> 위반 목록 (빈 배열이면 통과)
// 근거: 설계서 docs/superpowers/specs/2026-11-24-weekly-reels-v2-design.md 6-3·6-4
//   (장면 6~10개 · 첫 장면 question/bignum · 끝은 outro · data 모양·글자 상한 · 아이콘 목록 · 권유 금지 · 실명 금지)
//   투자 권유 아님 고지는 말로 하지 않고 게시 문구에만 붙인다 (서버가 붙임, 26.11.24 회장 결정)
import { ICONS } from './icons.js';
import { CHARACTERS } from './brand.js';

export const PLAN_LIMITS = { minScenes: 6, maxScenes: 10, minChars: 280, maxChars: 450, hashtags: 5 };
export const KINDS = ['question', 'bignum', 'keyword', 'formula', 'compare', 'bars', 'steps', 'icons', 'outro'];
const FIRST_KINDS = ['question', 'bignum'];
export const MOODS = ['explain', 'surprise', 'stress', 'smile'];

// 투자 권유·단정으로 읽히는 표현 (하나라도 있으면 '권유' 위반)
export const BANNED = [
  /(사세요|파세요|사 두세요|담으세요|팔아야|사야 해요|사야 합니다)/,
  /(매수|매도|비중\s*확대)\s*(추천|권유|하세요|타이밍)/,
  /(반드시|무조건|확실히|100%)\s*(오를|오른|오릅|떨어|내릴|내립|상승|하락)/,
  /목표\s*(주가|가격)/,
  /(수익|원금)\s*(보장|확정)/,
  /(지금|당장)\s*(사|매수|매도|팔)/,
  /(대박|떡상|폭등할|폭락할)/,
];

// 장면 종류별 data 모양 — str(최대 글자) · num · icon · enum · arr(개수, 항목 모양) · obj(필드), opt = 없어도 됨
const str = (max, opt = false) => ({ t: 'str', max, opt });
const num = (opt = false) => ({ t: 'num', opt });
const icon = { t: 'icon' };
const arr = (min, max, item) => ({ t: 'arr', min, max, item });
const obj = (fields) => ({ t: 'obj', fields });
const side = obj({ icon, label: str(8) });
const card = obj({ title: str(10), sub: str(14) });
const col = obj({ title: str(10), rows: arr(2, 3, str(14)) });
export const KIND_DATA = {
  question: { left: side, right: side, stamp: str(2) },
  bignum: { value: str(8), unit: str(6, true), label: str(8), ratio: num(true) },
  keyword: { word: str(8), easy: str(22) },
  formula: { a: card, b: card, c: obj({ title: str(10) }) },
  compare: { left: col, right: col },
  bars: { rows: arr(2, 3, obj({ label: str(8), from: num(), to: num(), unit: str(6, true) })) },
  steps: { items: arr(2, 4, str(12)), style: { t: 'enum', values: ['flow', 'check'] } },
  icons: { items: arr(2, 4, obj({ icon, label: str(8) })) },
  outro: {},
};

// 모양 하나를 검사해 위반을 out에 넣는다 (where = 'bars.rows[0].to' 같은 위치)
function checkShape(spec, v, where, out) {
  const missing = v === undefined || v === null || v === '';
  if (spec.t === 'str') {
    if (missing) { if (!spec.opt) out.push(`${where}가 비었어요`); return; }
    if (typeof v !== 'string') { out.push(`${where}는 글자여야 해요`); return; }
    const n = [...v].length;
    if (n > spec.max) out.push(`${where} ${n}자 (${spec.max}자까지)`);
  } else if (spec.t === 'num') {
    if (missing) { if (!spec.opt) out.push(`${where}가 비었어요`); return; }
    if (typeof v !== 'number' || !Number.isFinite(v)) out.push(`${where}는 숫자여야 해요`);
  } else if (spec.t === 'icon') {
    if (!ICONS.includes(v)) out.push(`${where} 아이콘 '${v}'는 목록에 없어요`);
  } else if (spec.t === 'enum') {
    if (!spec.values.includes(v)) out.push(`${where} '${v}'는 ${spec.values.join('/')} 중 하나여야 해요`);
  } else if (spec.t === 'arr') {
    if (!Array.isArray(v)) { out.push(`${where}가 목록이 아니에요`); return; }
    if (v.length < spec.min || v.length > spec.max) out.push(`${where} ${v.length}개 (${spec.min}~${spec.max}개여야 해요)`);
    v.forEach((x, i) => checkShape(spec.item, x, `${where}[${i}]`, out));
  } else if (spec.t === 'obj') {
    if (!v || typeof v !== 'object') { out.push(`${where}가 비었어요`); return; }
    for (const [k, f] of Object.entries(spec.fields)) checkShape(f, v[k], `${where}.${k}`, out);
  }
}
export function checkData(kind, data) {
  const out = [];
  checkShape(obj(KIND_DATA[kind] || {}), data || {}, kind, out);
  return out;
}

export function outroScene(slot) {
  const line = CHARACTERS[slot].outro;
  return { kind: 'outro', say: line, text: line, mood: 'smile', data: {} };
}

const sayLength = (plan) => (plan.scenes || []).reduce((a, s) => a + String((s && s.say) || '').length, 0);
// data 안의 모든 글자·숫자를 한 줄로 모은다
const flat = (x) => (x && typeof x === 'object' ? Object.values(x).map(flat).join(' ') : String(x ?? ''));

// say·text·data 속 숫자 (쉼표 빼고) — 고친 대사에 새 숫자가 생겼는지 볼 때 쓴다 (설계서 12-6)
export function planNumbers(plan) {
  const out = new Set();
  for (const s of plan.scenes || []) {
    for (const m of `${s.say || ''} ${s.text || ''} ${flat(s.data)}`.matchAll(/\d[\d,]*(?:\.\d+)?/g)) out.add(m[0].replace(/,/g, ''));
  }
  return out;
}

export function validatePlan(plan, { names = [], minChars = PLAN_LIMITS.minChars } = {}) {
  const v = [];
  if (!plan || typeof plan !== 'object') return ['설계도 형식이 아니에요'];
  if (!['econ', 'fin'].includes(plan.slot)) v.push('슬롯이 econ/fin이 아니에요');
  const scenes = Array.isArray(plan.scenes) ? plan.scenes : [];
  const L = PLAN_LIMITS;
  if (scenes.length < L.minScenes || scenes.length > L.maxScenes) v.push(`장면 ${scenes.length}개 (${L.minScenes}~${L.maxScenes}개여야 해요)`);
  if (scenes.length && !FIRST_KINDS.includes(scenes[0] && scenes[0].kind)) v.push(`첫 장면은 ${FIRST_KINDS.join('·')}여야 해요`);
  if (scenes.length && (scenes.at(-1) || {}).kind !== 'outro') v.push('마지막 장면은 outro여야 해요');
  scenes.forEach((s, i) => {
    const at = `장면 ${i + 1}`;
    if (!s || typeof s !== 'object') { v.push(`${at}: 형식이 아니에요`); return; }
    if (!KINDS.includes(s.kind)) { v.push(`${at}: 종류 '${s.kind}'는 쓸 수 없어요`); return; }
    if (s.kind === 'outro' && i !== scenes.length - 1) v.push(`${at}: outro는 마지막에만 써요`);
    if (!MOODS.includes(s.mood)) v.push(`${at}: 표정 '${s.mood}'는 쓸 수 없어요`);
    if (!String(s.say || '').trim()) v.push(`${at}: 대사가 비었어요`);
    if (!String(s.text || '').trim()) v.push(`${at}: 자막이 비었어요`);
    for (const x of checkData(s.kind, s.data)) v.push(`${at}: ${x}`);
  });
  const n = sayLength(plan);
  if (n < minChars || n > L.maxChars) v.push(`길이 ${n}자 (${minChars}~${L.maxChars}자여야 해요)`);
  const tags = plan.hashtags == null ? [] : plan.hashtags;
  if (!Array.isArray(tags) || tags.length > L.hashtags) v.push(`해시태그 ${Array.isArray(tags) ? tags.length : '?'}개 (${L.hashtags}개까지)`);
  if (!String(plan.caption || '').trim()) v.push('게시 문구(caption)가 비었어요');
  const all = [plan.title, plan.caption, ...(Array.isArray(tags) ? tags : []), ...scenes.flatMap((s) => (s ? [s.say, s.text, flat(s.data)] : []))]
    .map((x) => String(x || '')).join('\n');
  for (const re of BANNED) { const m = all.match(re); if (m) v.push(`권유로 읽히는 표현: '${m[0]}'`); }
  // 실명: 위반 문구에 이름을 넣지 않는다 (로그·앱 화면에 남지 않게)
  const hits = names.map((x) => String(x || '').trim()).filter((x) => x.length >= 2 && all.includes(x));
  if (hits.length) v.push(`실명: 사람 이름 ${hits.length}개가 들어 있어요 ('발표자'로 바꿔 주세요)`);
  return v;
}
