// 스타일 프레임 4장 + SAFE 검사: node preview/frames.mjs <출력폴더> [variant]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, serve } from '../src/browser.mjs';

const out = resolve(process.argv[2] || 'out/frames');
const variant = process.argv[3] || 'A';
mkdirSync(out, { recursive: true });
const { url, close } = await serve(resolve('.'));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${url}/preview/frames.html`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
const { tl } = await page.evaluate(() => window.info);
// 훅 · 키워드(3번째 beat) · 큰 숫자(1번째 beat) · 끝장
const picks = [['1_훅', tl[0].start + 1.2], ['2_키워드', tl[3].start + 1.0], ['3_큰숫자', tl[1].start + 1.0], ['4_끝장', tl[tl.length - 1].start + 0.8], ['5_비교', tl[2].start + 1.0], ['6_사진', tl[4].start + 1.0]];
for (const [name, t] of picks) {
  await page.evaluate(([t, v]) => window.draw(t, v), [t, variant]);
  const b64 = (await page.evaluate(() => document.getElementById('c').toDataURL('image/png'))).split(',')[1];
  writeFileSync(join(out, `스타일프레임_${name}.png`), Buffer.from(b64, 'base64'));
}
const bad = await page.evaluate(() => window.safeCheck());
await browser.close(); close();
console.log(bad.length ? `SAFE 문제 ${bad.length}: ${bad.join(' | ')}` : 'SAFE 검사 통과');
console.log(errors.length ? `콘솔 오류 ${errors.length}: ${errors.join(' | ')}` : '콘솔 오류 0');
process.exit(bad.length || errors.length ? 1 : 0);
