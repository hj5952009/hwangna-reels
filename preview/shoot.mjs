// 캐릭터 시안 PNG·2초 MP4를 만든다: node preview/shoot.mjs <출력폴더>
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ffmpeg from 'ffmpeg-static';
import { launch, serve } from '../src/browser.mjs';

const out = resolve(process.argv[2] || 'out/drafts');
mkdirSync(out, { recursive: true });
const { url, close } = await serve(resolve('.'));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${url}/preview/drafts.html`);
await page.waitForFunction(() => window.ready === true);
const grab = async () => Buffer.from((await page.evaluate(() => document.getElementById('c').toDataURL('image/png'))).split(',')[1], 'base64');
for (const v of ['A', 'B', 'C']) {
  await page.evaluate((v) => window.drawDraft(v), v);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(out, `캐릭터_${v}.png`), await grab());
  const ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-r', '30', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', join(out, `캐릭터_움직임_${v}.mp4`)]);
  for (let f = 0; f < 60; f++) {
    await page.evaluate(([v, t]) => window.drawDraft(v, t, true), [v, f / 30]);
    if (!ff.stdin.write(await grab())) await new Promise((r) => ff.stdin.once('drain', r));
  }
  ff.stdin.end();
  await new Promise((r, j) => ff.on('close', (c) => (c ? j(new Error(`ffmpeg ${c}`)) : r())));
}
await browser.close(); close();
console.log(errors.length ? `콘솔 오류 ${errors.length}: ${errors.join(' | ')}` : '콘솔 오류 0');
