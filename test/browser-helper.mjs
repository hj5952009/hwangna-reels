// 시험용: harness.html을 연 Playwright 쪽 하나를 나눠 쓴다
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serve, launch } from '../src/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export async function openHarness() {
  const { url, close } = await serve(ROOT);
  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${url}/test/harness.html`);
  await page.waitForFunction(() => window.ready === true, null, { timeout: 30000 });
  return { page, errors, done: async () => { await browser.close(); close(); } };
}
