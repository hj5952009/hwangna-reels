// 장면 설계도(plan) + 목소리(Track, 한 덩어리 wav와 줄 경계) → 1080×1920 30fps MP4 + 표지 JPG (설계서 v2 6-6)
//   async render({ plan, track, out }) -> { mp4, cover, seconds }
import { spawn, execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { launch, serve } from './src/browser.mjs';
import { GAP, timeline } from './src/scene.js';
import { FPS, CHARACTERS } from './src/brand.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const run = (args) => new Promise((res, rej) => {
  const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c ? rej(new Error(`ffmpeg 실패 (${c}): ${err.slice(-400)}`)) : res()));
});

// 목소리 한 덩어리(track.wav)에서 줄마다 from~to를 잘라 sec초로 맞추고, 줄 사이 GAP초 쉼을 넣어 48kHz 스테레오로
//   pitch(반음) ≠ 0이면 빠르기는 그대로 두고 높이만 바꾼다 (asetrate → aresample → atempo)
export async function joinAudio(track, outWav, { pitch = 0 } = {}) {
  const lines = track.lines || [];
  if (!lines.length) throw new Error('목소리 줄이 없어요');
  const n = lines.length;
  const parts = [`[0:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,asplit=${n}${lines.map((_, i) => `[s${i}]`).join('')}`];
  lines.forEach((l, i) => {
    const len = (l.sec + (i < n - 1 ? GAP : 0)).toFixed(3);
    parts.push(`[s${i}]atrim=start=${l.from.toFixed(3)}:end=${(l.from + l.sec).toFixed(3)},asetpts=PTS-STARTPTS,apad=whole_dur=${len}[a${i}]`);
  });
  const shift = pitch ? `,asetrate=${(48000 * 2 ** (pitch / 12)).toFixed(2)},aresample=48000,atempo=${(2 ** (-pitch / 12)).toFixed(6)}` : '';
  parts.push(`${lines.map((_, i) => `[a${i}]`).join('')}concat=n=${n}:v=0:a=1${shift},pan=stereo|c0=c0|c1=c0[out]`);
  await run(['-y', '-loglevel', 'error', '-i', track.wav, '-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', outWav]);
}

const b64 = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');

export async function render({ plan, track, out }) {
  out = resolve(out);
  const tl = timeline(track);
  const total = tl.length ? tl[tl.length - 1].end : 0;
  const audio = join(dirname(out), `${Date.now()}-voice.wav`);
  await joinAudio(track, audio, { pitch: (CHARACTERS[plan.slot] || {}).pitch || 0 });

  const { url, close } = await serve(ROOT);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${url}/render.html`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    // 화면에는 글자·길이·입 모양만 보낸다 (wav 경로는 필요 없음)
    await page.evaluate((d) => window.setup(d), { plan, track: { lines: track.lines.map(({ text, sec, rms }) => ({ text, sec, rms })) } });

    const n = Math.ceil(total * FPS);
    const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-', '-i', audio,
      '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'medium', '-crf', '21', '-maxrate', '3M', '-bufsize', '6M',
      '-pix_fmt', 'yuv420p', '-r', String(FPS), '-profile:v', 'high', '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
      '-movflags', '+faststart', '-shortest', out], { stdio: ['pipe', 'ignore', 'pipe'] });
    let ffErr = ''; ff.stderr.on('data', (d) => { ffErr += d; });
    const done = new Promise((res, rej) => ff.on('close', (c) => (c ? rej(new Error(`ffmpeg 실패 (${c}): ${ffErr.slice(-400)}`)) : res())));
    const BATCH = 15;
    for (let f = 0; f < n; f += BATCH) {
      const ts = [];
      for (let k = f; k < Math.min(n, f + BATCH); k++) ts.push(k / FPS);
      const urls = await page.evaluate((ts) => window.frames(ts), ts);
      for (const u of urls) {
        if (!ff.stdin.write(b64(u))) await new Promise((r) => ff.stdin.once('drain', r));
      }
      if (errors.length) throw new Error(`장면 그리기 오류: ${errors[0]}`);
    }
    ff.stdin.end();
    await done;

    // 표지: 첫 장면 그림(질문 도장·큰 숫자)이 다 나온 순간
    const first = tl[0] || { start: 0, end: 0 };
    const coverT = Math.min(Math.max(0, total - 0.05), first.start + Math.min(Math.max(1.0, (first.end - first.start) * 0.85), first.end - first.start));
    const [cu] = await page.evaluate((t) => window.frames([t], 0.92), coverT);
    const cover = `${out.replace(/\.mp4$/i, '')}.cover.jpg`;
    writeFileSync(cover, b64(cu));

    const probe = JSON.parse(execFileSync(ffprobeStatic.path, ['-v', 'error', '-show_format', '-of', 'json', out]).toString());
    return { mp4: out, cover, seconds: Number(probe.format.duration) };
  } finally {
    await browser.close(); close();
    try { unlinkSync(audio); } catch (_) { /* 없어도 됨 */ }
  }
}
