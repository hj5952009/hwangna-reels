// 시험용 대본으로 샘플 릴스 굽기 (목소리는 사인파): node preview/sample.mjs <출력폴더> [variant]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { render } from '../render.mjs';

const outDir = resolve(process.argv[2] || 'out');
const variant = process.argv[3] || 'A';
mkdirSync(outDir, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'reel-sample-'));
const script = JSON.parse(readFileSync(resolve('test/fixtures/script.json'), 'utf8'));
const texts = [script.hook, ...script.beats.map((b) => b.line), script.summary, `황금나침반 ${script.week} 위클리였어요. 다음 주에 또 만나요!`];
const lines = texts.map((text, i) => {
  const sec = Math.max(2.4, text.length / 7.2);
  const wav = join(dir, `l${i}.wav`);
  execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${220 + i * 30}:sample_rate=24000:duration=${sec}`, '-af', 'volume=0.15', '-ac', '1', wav]);
  return { text, wav, sec, rms: Array.from({ length: Math.ceil(sec * 30) }, (_, k) => Math.abs(Math.sin(k * 0.8)) * 0.6) };
});
copyFileSync(resolve('preview/sample-photo.jpg'), join(dir, 'photo0.jpg'));
const r = await render({ script, track: { lines }, assetsDir: dir, out: join(outDir, `샘플릴스_${variant}.mp4`), variant });
console.log(JSON.stringify(r));
