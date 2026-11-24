// 대본 전체를 나침이 목소리로 한 번에 읽힌다 (무료 한도: 릴스 한 편 = 목소리 요청 1번)
//   LINES_JSON='["첫 줄","둘째 줄"]' node dev/voice-lines.mjs [출력 폴더]   (GEMINI_API_KEY 필요)
// 줄 사이에는 <short pause>를 넣는다. 줄별로 자르는 일은 받아쓰기 시각으로 따로 한다.
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { speak, VOICE, MODELS } from '../src/gemini.mjs';

const OUT = process.argv[2] || 'voice-out';
const key = process.env.GEMINI_API_KEY || '';
if (!key) { console.log('GEMINI_API_KEY 없음'); process.exit(1); }
let lines;
try { lines = JSON.parse(process.env.LINES_JSON || '[]'); } catch { lines = []; }
if (!Array.isArray(lines) || !lines.length || lines.some((l) => typeof l !== 'string' || !l.trim())) {
  console.log('LINES_JSON은 글 줄들의 배열이어야 해요'); process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const text = lines.map((l) => l.trim()).join(' <short pause> ');
try {
  const { lines: got, total } = await speak({ key, lines: [text], outDir: join(OUT, '_tmp') });
  copyFileSync(got[0].wav, join(OUT, 'all.wav'));
  writeFileSync(join(OUT, 'info.json'), JSON.stringify({ voice: VOICE.name, model: MODELS.tts, lines: lines.length, sec: total }, null, 2));
  console.log(`완료: ${lines.length}줄, ${total.toFixed(1)}초, 요청 1번`);
} catch (e) {
  console.log('실패', String(e.message).slice(0, 400)); process.exit(1);
}
