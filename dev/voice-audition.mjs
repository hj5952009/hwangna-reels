// 나침이 목소리 오디션: 같은 대사 두 줄을 Gemini 목소리 후보 × 말투로 읽혀 mp3로 남긴다 (회장이 귀로 고름)
//   node dev/voice-audition.mjs [출력 폴더]   (GEMINI_API_KEY 필요)
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ffmpeg from 'ffmpeg-static';
import { speak, VOICE } from '../src/gemini.mjs';

const OUT = process.argv[2] || 'audition';
const key = process.env.GEMINI_API_KEY || '';
if (!key) { console.log('GEMINI_API_KEY 없음'); process.exit(1); }
const LINES = ['가게는 잘 되는데, 대출은 왜 안 나올까요?', '그래서 나온 게 에스씨비, 소상공인 특화 신용평가예요.'];
const VOICES = ['Puck', 'Leda', 'Fenrir', 'Laomedeia', 'Sadachbia', 'Kore'];
const STYLES = {
  A: '귀엽고 통통 튀는 마스코트 캐릭터처럼, 밝고 살짝 높은 톤의 친근한 해요체로 또박또박 읽어 주세요: ',
  B: '호기심 많은 꼬마 탐험가 캐릭터처럼 신나고 생동감 있게, 문장 끝을 살짝 올려 경쾌하게 읽어 주세요: ',
};
mkdirSync(OUT, { recursive: true });
const ff = (args) => { const r = spawnSync(ffmpeg, ['-y', '-loglevel', 'error', ...args]); if (r.status) throw new Error(String(r.stderr).slice(-300)); };
const list = [];
let n = 0;
for (const v of VOICES) {
  for (const [sk, style] of Object.entries(STYLES)) {
    n++;
    const tag = `${String(n).padStart(2, '0')}_${v}_${sk}`;
    const tmp = join(OUT, `_${tag}`);
    try {
      VOICE.name = v; VOICE.style = style;
      const { lines } = await speak({ key, lines: LINES, outDir: tmp });
      const ins = lines.flatMap((l) => ['-i', l.wav]);
      const f = `${lines.map((_, i) => `[${i}:a]aresample=24000,apad=pad_dur=0.45[a${i}]`).join(';')};${lines.map((_, i) => `[a${i}]`).join('')}concat=n=${lines.length}:v=0:a=1[o]`;
      ff([...ins, '-filter_complex', f, '-map', '[o]', '-ac', '1', '-b:a', '96k', join(OUT, `${tag}.mp3`)]);
      list.push({ file: `${tag}.mp3`, voice: v, style: sk, pitch: 0 });
      if (sk === 'A') { // 같은 목소리를 반음 두 개 높여 (빠르기는 그대로)
        ff(['-i', join(OUT, `${tag}.mp3`), '-af', 'asetrate=24000*1.122,aresample=24000,atempo=0.891', '-b:a', '96k', join(OUT, `${tag}_high.mp3`)]);
        list.push({ file: `${tag}_high.mp3`, voice: v, style: sk, pitch: 2 });
      }
      console.log('완료', tag);
    } catch (e) { console.log('실패', tag, String(e.message).slice(0, 200)); }
    rmSync(tmp, { recursive: true, force: true });
  }
}
writeFileSync(join(OUT, 'list.json'), JSON.stringify({ lines: LINES, styles: STYLES, items: list }, null, 2));
console.log(`${list.length}개 만듦`);
