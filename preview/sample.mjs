// 시험용 설계도로 샘플 릴스 굽기 (목소리는 사인파 한 개): node preview/sample.mjs <출력폴더> [설계도 json]
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { render } from '../render.mjs';

const outDir = resolve(process.argv[2] || 'out');
const plan = JSON.parse(readFileSync(resolve(process.argv[3] || 'test/fixtures/plan.json'), 'utf8'));
mkdirSync(outDir, { recursive: true });
const dir = mkdtempSync(join(tmpdir(), 'reel-sample-'));
let at = 0;
const lines = plan.scenes.map((s) => { const sec = Math.max(2.4, s.say.length / 7.2); const l = { text: s.say, from: at, to: at + sec, sec, rms: Array.from({ length: Math.ceil(sec * 30) }, (_, k) => Math.abs(Math.sin(k * 0.8)) * 0.6) }; at += sec; return l; });
const wav = join(dir, 'voice.wav');
execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=220:sample_rate=24000:duration=${at}`, '-af', 'volume=0.15', '-ac', '1', wav]);
const r = await render({ plan, track: { wav, rate: 24000, timing: 'exact', total: at, lines }, out: join(outDir, `샘플릴스_${plan.slot}.mp4`) });
console.log(JSON.stringify(r));
