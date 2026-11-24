// 캐릭터 목소리 오디션(나침이·콕이): 같은 대사 두 줄을 Gemini 목소리 후보 × 말투로 읽혀 mp3로 남긴다 (회장이 귀로 고름)
//   node dev/voice-audition.mjs [출력 폴더]   (GEMINI_API_KEY 필요)
//   AUDITION_PICK='Iapetus:C,Leda:C'  AUDITION_LINES='["첫 줄","둘째 줄"]' 로 후보·대사를 바꾼다
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { speak } from '../src/gemini.mjs';

const OUT = process.argv[2] || 'audition';
const key = process.env.GEMINI_API_KEY || '';
if (!key) { console.log('GEMINI_API_KEY 없음'); process.exit(1); }
const DEFAULT_LINES = ['가게는 잘 되는데, 대출은 왜 안 나올까요?', '그래서 나온 게 에스씨비, 소상공인 특화 신용평가예요.'];
let LINES = DEFAULT_LINES;
try { const l = JSON.parse(process.env.AUDITION_LINES || 'null'); if (Array.isArray(l) && l.length && l.every((x) => typeof x === 'string' && x.trim())) LINES = l; } catch { /* 기본 대사 */ }
// 말투는 speech_metadata.style로만 감 (소리 내어 읽지 않음)
const STYLES = {
  A: 'cute, bouncy cartoon mascot; bright and slightly high-pitched; friendly and crisp',
  B: 'curious little explorer character; excited and lively, sentence endings lifting playfully',
  // 콕이(금융, 나침이 동생·안경): 핵심을 콕 짚어 정리하는 말투
  C: 'smart little-brother cartoon mascot with glasses; clear, tidy and composed; friendly, slightly young, crisp diction, calmly sums things up',
};
mkdirSync(OUT, { recursive: true });
const ff = (args) => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]); if (r.status) throw new Error(String(r.stderr).slice(-300)); };
const list = [];
let n = 0;
// 무료 등급(3.8 Flash TTS 분당 3회·하루 10회)에 맞춰 후보 하나 = 요청 하나, 요청 사이 21초, 하루 9개
const PICK = (process.env.AUDITION_PICK || 'Puck:A,Leda:A,Fenrir:A,Laomedeia:A,Sadachbia:A,Kore:A,Puck:B,Leda:B,Laomedeia:B').split(',').map((x) => x.trim().split(':')).filter(([v, sk]) => v && STYLES[sk]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
for (const [v, sk] of PICK) {
  const style = STYLES[sk];
  {
    if (n) await wait(21000);
    n++;
    const tag = `${String(n).padStart(2, '0')}_${v}_${sk}`;
    const tmp = join(OUT, `_${tag}`);
    try {
      const { wav } = await speak({ key, lines: [LINES.join(' ')], voice: v, style, outDir: tmp });
      ff(['-i', wav, '-af', 'aresample=24000,apad=pad_dur=0.45', '-ac', '1', '-b:a', '96k', join(OUT, `${tag}.mp3`)]);
      list.push({ file: `${tag}.mp3`, voice: v, style: sk, pitch: 0 });
      if (sk !== 'B') { // 같은 목소리를 반음 두 개 높여 (빠르기는 그대로, 요청은 더 안 씀)
        ff(['-i', join(OUT, `${tag}.mp3`), '-af', 'asetrate=24000*1.122,aresample=24000,atempo=0.891', '-b:a', '96k', join(OUT, `${tag}_high.mp3`)]);
        list.push({ file: `${tag}_high.mp3`, voice: v, style: sk, pitch: 2 });
      }
      console.log('완료', tag);
    } catch (e) { console.log('실패', tag, String(e.message).slice(0, 400)); }
    rmSync(tmp, { recursive: true, force: true });
  }
}
writeFileSync(join(OUT, 'list.json'), JSON.stringify({ lines: LINES, styles: STYLES, items: list }, null, 2));
console.log(`${list.length}개 만듦`);
