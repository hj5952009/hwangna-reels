// 목소리 한 덩어리 → 줄마다 나누기 (설계서 6-5)
// 릴스 한 편의 대사를 TTS 요청 1번으로 받으므로, 줄 사이 무음을 찾아 줄 경계를 정한다.
//
// 기준값과 근거 (test/fixtures/scb-split.json: 26.11.24 SCB 시안, 9줄 49.4초, 받아쓰기로 찾은 정답 틈 8개)
// - 무음: -35dB 아래가 0.18초 이상. -40dB 목록은 2번 줄 경계(8.2~8.8초)에 무음이 없어 어림값으로 남고,
//   -35dB 목록은 8개 모두 정답 틈 안에 붙었다. 0.18초는 silencedetect d=0.2와 비슷하게 짧은 숨을 거르는 값.
// - 찾는 폭 window 1.2초: 1.5초로 넓히면 -40dB 목록에서 2번 경계가 3번 줄 안의 쉼(9.65~9.96초)에 붙는다.
// - 긴 무음 가중치 2(초당 점수): 줄 사이 쉼은 줄 안 숨보다 길다. 0.5초 무음은 어림값에서 0.9초 더 멀어도 이긴다.
// - 어림값은 '남은 시간 × 이 줄 글자 / 남은 글자'로, 앞 경계를 붙인 뒤마다 다시 잰다(앞쪽 오차가 뒤로 번지지 않게).

import { toSpeech } from './readout.mjs';

const FRAME = 0.01; // 무음 찾기 창 10ms

// Int16LE mono pcm에서 db 아래가 min초 이상 이어지는 구간들
export function findSilences(pcm, rate, { db = -35, min = 0.18 } = {}) {
  const n = Math.floor(pcm.length / 2); const win = Math.max(1, Math.round(rate * FRAME));
  const lim = 10 ** (db / 20);
  const out = []; let from = -1;
  const close = (endSample) => {
    if (from >= 0 && (endSample - from) / rate >= min) out.push({ start: from / rate, end: endSample / rate });
    from = -1;
  };
  for (let s = 0; s < n; s += win) {
    const e = Math.min(n, s + win); let sum = 0;
    for (let i = s; i < e; i++) { const v = pcm.readInt16LE(i * 2) / 32768; sum += v * v; }
    const quiet = Math.sqrt(sum / (e - s)) < lim;
    if (quiet && from < 0) from = s;
    if (!quiet) close(s);
  }
  close(n);
  return out;
}

// 무음 목록 + 줄 글자 수 → 줄 경계(초) 줄 수-1개
export function pickBoundaries(silences, lineChars, total, { window = 1.2, weight = 2 } = {}) {
  if (lineChars.length <= 1) return { cuts: [], timing: 'exact' };
  const edge = 0.01;
  // 맨 앞·맨 뒤 무음은 말이 시작·끝나는 자리를 알려 줄 뿐 경계 후보가 아니다
  const lead = silences.find((x) => x.start <= edge);
  const trail = silences.find((x) => x.end >= total - edge);
  const inner = silences.filter((x) => x !== lead && x !== trail).map((x) => ({ mid: (x.start + x.end) / 2, dur: x.end - x.start }));
  const t1 = trail ? trail.start : total;
  let left = lineChars.reduce((a, b) => a + b, 0);
  let prev = lead ? lead.end : 0;
  const cuts = []; let exact = true;
  for (let i = 0; i < lineChars.length - 1; i++) {
    const est = prev + ((t1 - prev) * lineChars[i]) / Math.max(1, left);
    left -= lineChars[i];
    let best = null; let score = Infinity;
    for (const x of inner) {
      if (x.mid <= prev + 0.05 || Math.abs(x.mid - est) > window) continue;
      const sc = Math.abs(x.mid - est) - weight * x.dur;
      if (sc < score) { score = sc; best = x; }
    }
    if (!best) exact = false;
    const c = Math.min(total - 0.01 * (lineChars.length - 1 - i), Math.max(best ? best.mid : est, (cuts.at(-1) || 0) + 0.01));
    cuts.push(c); prev = c;
  }
  return { cuts, timing: exact ? 'exact' : 'estimate' };
}

// 30fps 소리 크기(0~1, 트랙 전체 최대로 나눔) — 입 모양에 쓴다
export function rmsFrames(pcm, rate, fps = 30) {
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

// 한 덩어리 목소리 → Track { wav, rate, timing, total, lines:[{ text, from, to, sec, rms }] }
//   줄 길이는 읽기 변환한 글자 수로 잰다 ('2.5%' → '이 점 오 퍼센트'처럼 소리 길이에 더 가깝게).
export function splitTrack({ wav, pcm, rate, lines }) {
  const total = Math.floor(pcm.length / 2) / rate;
  const { cuts, timing } = pickBoundaries(findSilences(pcm, rate), lines.map((l) => Math.max(1, toSpeech(String(l)).length)), total);
  const rms = rmsFrames(pcm, rate);
  const edges = [0, ...cuts, total];
  return {
    wav, rate, timing, total,
    lines: lines.map((text, i) => {
      const from = edges[i]; const to = edges[i + 1];
      return { text, from, to, sec: to - from, rms: rms.slice(Math.round(from * 30), Math.round(to * 30)) };
    }),
  };
}
