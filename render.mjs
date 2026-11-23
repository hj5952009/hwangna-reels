// 대본(ReelScript) + 목소리(Track) → 1080×1920 30fps MP4 + 표지 JPG
//   async render({ script, track, assetsDir, out, variant? }) -> { mp4, cover, seconds }
// assetsDir 안: photo0.jpg, photo1.jpg … (그 주 발표 사진) · slide1.png, slide2.png … (PDF 쪽, 1부터)
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { launch, serve } from './src/browser.mjs';
import { GAP, timeline } from './src/scene.js';
import { FPS } from './src/brand.js';

const ROOT = dirname(fileURLToPath(import.meta.url));
const run = (args) => new Promise((res, rej) => {
  const p = spawn(ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; p.stderr.on('data', (d) => { err += d; });
  p.on('close', (c) => (c ? rej(new Error(`ffmpeg 실패 (${c}): ${err.slice(-400)}`)) : res()));
});

// 줄 wav들을 하나로: 줄마다 정확히 sec초로 맞추고(+줄 사이 GAP초 쉼) 48kHz 스테레오
export async function joinAudio(lines, outWav) {
  const args = ['-y', '-loglevel', 'error'];
  lines.forEach((l) => args.push('-i', l.wav));
  const parts = lines.map((l, i) => {
    const len = (l.sec + (i < lines.length - 1 ? GAP : 0)).toFixed(3);
    return `[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=mono,atrim=0:${l.sec.toFixed(3)},apad=whole_dur=${len}[a${i}]`;
  });
  const filter = `${parts.join(';')};${lines.map((_, i) => `[a${i}]`).join('')}concat=n=${lines.length}:v=0:a=1,pan=stereo|c0=c0|c1=c0[out]`;
  args.push('-filter_complex', filter, '-map', '[out]', '-ar', '48000', outWav);
  await run(args);
}

const num = (f) => Number((f.match(/\d+/) || ['0'])[0]);
const list = (dir, re) => (dir && existsSync(dir) ? readdirSync(dir).filter((f) => re.test(f)).sort((a, b) => num(a) - num(b)) : []);
const b64 = (u) => Buffer.from(u.slice(u.indexOf(',') + 1), 'base64');

export async function render({ script, track, assetsDir, out, variant }) {
  out = resolve(out);
  const tl = timeline(track);
  const total = tl.length ? tl[tl.length - 1].end : 0;
  track = { ...track, total };
  const audio = join(dirname(out), `${Date.now()}-voice.wav`);
  await joinAudio(track.lines, audio);

  // 사진·슬라이드는 /a/ 아래 주소로만 내준다 (assetsDir 밖은 안 보임)
  const photos = list(assetsDir, /^photo\d+\.(jpg|jpeg|png)$/i);
  const slides = list(assetsDir, /^slide\d+\.png$/i);
  const extra = {};
  for (const f of [...photos, ...slides]) extra[`/a/${f}`] = join(assetsDir, f);
  // 빠진 쪽이 있어도 쪽 번호 자리를 지킨다 (slide3.png → 배열 [2])
  const slideUrls = [];
  slides.forEach((f) => { slideUrls[num(f) - 1] = `/a/${f}`; });

  const { url, close } = await serve(ROOT, extra);
  const browser = await launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${url}/render.html`);
    await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
    await page.evaluate((d) => window.setup(d), {
      script, track, variant, photos: photos.map((f) => `/a/${f}`), slides: Array.from(slideUrls, (u) => u || ''),
    });

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

    // 표지: 훅 카드가 다 나온 순간
    const coverT = Math.min(Math.max(0, total - 0.05), (tl[0] ? tl[0].start : 0) + 1.0);
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
