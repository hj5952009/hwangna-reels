// 대본 전체를 캐릭터 목소리로 한 번에 읽힌다 (무료 한도: 릴스 한 편 = 목소리 요청 1번)
//   LINES_JSON='["첫 줄","둘째 줄"]' VOICE_SLOT=econ|fin node dev/voice-lines.mjs [출력 폴더]   (GEMINI_API_KEY 필요)
// 줄 사이에는 speak가 <short pause>를 넣는다. 줄 경계는 split.mjs가 무음으로 찾아 info.json에 남긴다.
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { speak, MODELS } from '../src/gemini.mjs';
import { splitTrack } from '../src/split.mjs';
import { CHARACTERS } from '../src/brand.js';

const OUT = process.argv[2] || 'voice-out';
const key = process.env.GEMINI_API_KEY || '';
if (!key) { console.log('GEMINI_API_KEY 없음'); process.exit(1); }
let lines;
try { lines = JSON.parse(process.env.LINES_JSON || '[]'); } catch { lines = []; }
if (!Array.isArray(lines) || !lines.length || lines.some((l) => typeof l !== 'string' || !l.trim())) {
  console.log('LINES_JSON은 글 줄들의 배열이어야 해요'); process.exit(1);
}
mkdirSync(OUT, { recursive: true });
const ch = CHARACTERS[process.env.VOICE_SLOT === 'fin' ? 'fin' : 'econ'];
try {
  const got = await speak({ key, lines: lines.map((l) => l.trim()), voice: ch.voice, style: ch.style, outDir: join(OUT, '_tmp') });
  const { total } = got;
  copyFileSync(got.wav, join(OUT, 'all.wav'));
  const t = splitTrack({ ...got, lines });
  writeFileSync(join(OUT, 'info.json'), JSON.stringify({ voice: ch.voice, model: MODELS.tts, lines: lines.length, sec: total, timing: t.timing, cuts: t.lines.map((l) => +l.to.toFixed(2)) }, null, 2));
  console.log(`완료: ${lines.length}줄, ${total.toFixed(1)}초, 요청 1번`);
} catch (e) {
  console.log('실패', String(e.message).slice(0, 400)); process.exit(1);
}
