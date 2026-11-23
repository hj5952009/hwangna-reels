// 위클리 설명 릴스 대본 규칙 — validate(script) -> 위반 목록 (빈 배열이면 통과)
// 근거: 설계서 docs/superpowers/specs/2026-11-23-weekly-reels-design.md (짧고 쉽게 · 숫자는 자료에 있는 것만 · 권유 금지 · 금융은 고지)

export const LIMITS = { minChars: 300, maxChars: 450, minBeats: 3, maxBeats: 5 };
export const SHOW_TYPES = ['keyword', 'number', 'compare', 'slide', 'photo'];
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
const DISCLAIMER_RE = /투자\s*권유/;
const WEEK_RE = /^\d{1,2}월 \d주차$/;

const spoken = (s) => [s.hook, ...(s.beats || []).map((b) => b.line), s.summary].map((x) => String(x || ''));
export const spokenLength = (s) => spoken(s).reduce((a, x) => a + x.length, 0);

// 끝장 문구 (코드가 붙임 — Gemini가 만들지 않음)
export const outroLine = (s) => `황금나침반 ${s.week} 위클리 · 발표 ${s.presenter}`;
// 끝인사 말 (목소리로 읽는 마지막 줄)
export const outroSpeech = (s) => `황금나침반 ${s.week} 위클리, 발표는 ${s.presenter}였어요.`;

export function validate(s, { minChars = LIMITS.minChars } = {}) {
  const v = [];
  if (!s || typeof s !== 'object') return ['대본 형식이 아니에요'];
  if (!['econ', 'fin'].includes(s.slot)) v.push('슬롯이 econ/fin이 아니에요');
  if (!String(s.hook || '').trim()) v.push('훅이 비었어요');
  if (!String(s.summary || '').trim()) v.push('한 줄 정리가 비었어요');
  const n = spokenLength(s);
  if (n < minChars || n > LIMITS.maxChars) v.push(`길이 ${n}자 (${minChars}~${LIMITS.maxChars}자여야 해요)`);
  const beats = Array.isArray(s.beats) ? s.beats : [];
  if (beats.length < LIMITS.minBeats || beats.length > LIMITS.maxBeats) v.push(`장면 ${beats.length}개 (${LIMITS.minBeats}~${LIMITS.maxBeats}개여야 해요)`);
  beats.forEach((b, i) => {
    const t = b && b.show && b.show.type;
    if (!SHOW_TYPES.includes(t)) v.push(`장면 ${i + 1}의 종류 '${t}'는 쓸 수 없어요`);
    else if (t === 'number' && !String(b.show.value || '').trim()) v.push(`장면 ${i + 1}: 숫자 값이 비었어요`);
    else if (t === 'compare' && (!b.show.a || !b.show.b)) v.push(`장면 ${i + 1}: 비교할 두 값이 필요해요`);
    else if (t === 'keyword' && !String(b.show.text || '').trim()) v.push(`장면 ${i + 1}: 핵심어가 비었어요`);
    if (!String((b && b.line) || '').trim()) v.push(`장면 ${i + 1}: 대사가 비었어요`);
  });
  const all = [...spoken(s), s.caption || '', s.title || ''].join('\n');
  for (const re of BANNED) { const m = all.match(re); if (m) v.push(`권유로 읽히는 표현: '${m[0]}'`); }
  if (s.slot === 'fin' && !DISCLAIMER_RE.test([s.summary, s.caption, ...spoken(s)].join('\n'))) v.push("고지: 금융 릴스에는 '투자 권유가 아니에요'가 있어야 해요");
  if (!WEEK_RE.test(String(s.week || ''))) v.push(`끝장: 주차 '${s.week}' 형식이 '11월 4주차'가 아니에요`);
  if (!String(s.presenter || '').trim()) v.push('끝장: 발표자 이름이 비었어요');
  return v;
}
