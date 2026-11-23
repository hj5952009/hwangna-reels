// 자막 글자 → 목소리로 읽을 글자 (TTS가 숫자·영문 약어를 잘못 읽지 않게)
//   toSpeech('금리 2.5%, GDP 3조 원') -> '금리 이 점 오 퍼센트, 지디피 삼 조 원'
// 자막에는 원래 글자를 그대로 쓰고, 목소리에만 이 결과를 쓴다.

const D = ['영', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
const SMALL = ['', '십', '백', '천'];
const BIG = ['', '만', '억', '조', '경'];

// 한자어 수 읽기 (정수)
export function sino(n) {
  n = String(n).replace(/^0+(?=\d)/, '');
  if (/^0+$/.test(n)) return '영';
  const groups = [];
  for (let i = n.length; i > 0; i -= 4) groups.unshift(n.slice(Math.max(0, i - 4), i));
  let out = '';
  groups.forEach((g, gi) => {
    const big = BIG[groups.length - 1 - gi];
    let part = '';
    const p = g.padStart(4, '0');
    for (let k = 0; k < 4; k++) {
      const d = Number(p[k]); if (!d) continue;
      const sm = SMALL[3 - k];
      part += (d === 1 && sm ? '' : D[d]) + sm;
    }
    if (!part) return;
    if (part === '일' && big === '만' && gi === 0) part = ''; // 10000 → 만
    out += part + big;
  });
  return out;
}

// 고유어 수 (1~99, 명·개 같은 단위 앞)
const NATIVE1 = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
const NATIVE10 = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
function native(n) {
  const t = Math.floor(n / 10), o = n % 10;
  if (t === 2 && o === 0) return '스무';
  return NATIVE10[t] + NATIVE1[o];
}
const NATIVE_COUNTERS = /^(명|개|살|시간|번째|가지|곳|달|권|마리|사람)/;

const UNIT_READ = [
  [/^%p/, '퍼센트포인트'], [/^%/, '퍼센트'], [/^bp/i, '베이시스포인트'],
  [/^조/, '조'], [/^억/, '억'], [/^만/, '만'], [/^천/, '천'],
];

const ABBR = {
  GDP: '지디피', CPI: '씨피아이', PPI: '피피아이', PCE: '피씨이', FOMC: '에프오엠씨', FED: '연준', Fed: '연준', ECB: '이씨비', BOJ: '일본은행',
  IMF: '아이엠에프', ETF: '이티에프', ELS: '이엘에스', ISA: '아이에스에이', IPO: '아이피오', PER: '퍼', PBR: '피비알', ROE: '알오이', EPS: '이피에스',
  KOSPI: '코스피', KOSDAQ: '코스닥', AI: '에이아이', ESG: '이에스지', CBDC: '씨비디씨', BIS: '비아이에스', LTV: '엘티브이', DSR: '디에스알', DTI: '디티아이',
  PF: '피에프', CEO: '씨이오', USD: '미국 달러', KRW: '원화', ECOS: '이코스', KDI: '케이디아이', OECD: '오이씨디', WTI: '더블유티아이', S: '에스', P: '피',
};
const LETTER = { A: '에이', B: '비', C: '씨', D: '디', E: '이', F: '에프', G: '지', H: '에이치', I: '아이', J: '제이', K: '케이', L: '엘', M: '엠', N: '엔', O: '오', P: '피', Q: '큐', R: '알', S: '에스', T: '티', U: '유', V: '브이', W: '더블유', X: '엑스', Y: '와이', Z: '지' };

function readNumber(raw) {
  const neg = raw.startsWith('-'), pos = raw.startsWith('+');
  const s = raw.replace(/^[+-]/, '').replace(/,/g, '');
  const [i, f] = s.split('.');
  let out = sino(i || '0');
  if (f) out += ` 점 ${[...f].map((c) => D[Number(c)]).join(' ')}`;
  return (neg ? '마이너스 ' : pos ? '플러스 ' : '') + out;
}

export function toSpeech(text) {
  let s = String(text || '');
  // 영문 약어 (사전 → 없으면 글자대로)
  s = s.replace(/\b[A-Za-z]{2,6}\b/g, (w) => ABBR[w] || ABBR[w.toUpperCase()] || (/^[A-Z]+$/.test(w) ? [...w].map((c) => LETTER[c]).join('') : w));
  // 숫자 (+단위)
  s = s.replace(/([+-]?)(\d[\d,]*(?:\.\d+)?)(\s*)(%p|%|bp|조|억|만|천)?/gi, (m, sign, num, sp, unit, off, all) => {
    const prev = all[off - 1];
    if (sign && prev && /[\d\w]/.test(prev)) { sign = ''; } // 범위 '1-2' 같은 경우는 부호 아님
    const after = all.slice(off + m.length);
    if (!unit && !num.includes('.') && !sign && NATIVE_COUNTERS.test(after.trimStart()) && Number(num.replace(/,/g, '')) < 100 && Number(num) > 0) {
      return `${native(Number(num))} `;
    }
    let read = readNumber(sign + num);
    if (unit) {
      const u = UNIT_READ.find(([re]) => re.test(unit));
      read += ` ${u ? u[1] : unit}`;
    }
    // 뒤에 바로 '원' 등 단위 글자가 붙으면 띄어 읽기
    if (/^[가-힣]/.test(after) && !NATIVE_COUNTERS.test(after)) read += ' ';
    return read;
  });
  return s.replace(/ {2,}/g, ' ').replace(/ +([,.?!])/g, '$1').trim();
}
