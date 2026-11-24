// 장면마다 프레임 1장 + 장면 넘김 1장 + 자막 검사: node preview/frames.mjs <출력폴더> [설계도 json(이 폴더 기준 경로)]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { launch, serve } from '../src/browser.mjs';

const out = resolve(process.argv[2] || 'out/frames');
const plan = process.argv[3] ? `/${process.argv[3].split('\\').join('/')}` : '/test/fixtures/plan.json';
mkdirSync(out, { recursive: true });
const { url, close } = await serve(resolve('.'));
const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${url}/preview/frames.html?plan=${encodeURIComponent(plan)}`);
await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
const { tl, kinds } = await page.evaluate(() => window.info);
const grab = async (name, t) => {
  await page.evaluate((t) => window.draw(t), t);
  const b64 = (await page.evaluate(() => document.getElementById('c').toDataURL('image/png'))).split(',')[1];
  writeFileSync(join(out, `${name}.png`), Buffer.from(b64, 'base64'));
};
for (const [i, s] of tl.entries()) await grab(`${String(i + 1).padStart(2, '0')}_${kinds[i]}`, s.start + (s.end - s.start) * 0.92);
if (tl.length > 1) await grab('넘김_1to2', tl[1].start + 0.2);
const bad = await page.evaluate(() => window.safeCheck());
await browser.close(); close();
console.log(bad.length ? `자막 문제 ${bad.length}: ${bad.join(' | ')}` : '자막 검사 통과');
console.log(errors.length ? `콘솔 오류 ${errors.length}: ${errors.join(' | ')}` : '콘솔 오류 0');
process.exit(bad.length || errors.length ? 1 : 0);
