// Playwright 크롬 띄우기 + 작은 정적 파일 서버 (ES 모듈은 file:// 에서 안 열려서)
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { join, normalize, extname, sep } from 'node:path';
import { homedir } from 'node:os';
import { chromium } from 'playwright';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

// root 아래 파일만 내준다 (+ extra: 경로 → 실제 파일, 예: 이번 주 사진)
export function serve(root, extra = {}) {
  return new Promise((res) => {
    const srv = createServer(async (req, rsp) => {
      try {
        const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        const file = extra[p] || normalize(join(root, p));
        if (!extra[p] && !file.startsWith(normalize(root + sep))) { rsp.writeHead(403); rsp.end(); return; }
        const buf = await readFile(file);
        rsp.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
        rsp.end(buf);
      } catch (_) { rsp.writeHead(404); rsp.end(); }
    });
    srv.listen(0, '127.0.0.1', () => res({ url: `http://127.0.0.1:${srv.address().port}`, close: () => srv.close() }));
  });
}

// 설치된 Playwright 크롬이 판과 안 맞으면(로컬 PC) 이미 받아 둔 다른 판을 쓴다
export async function launch() {
  try { return await chromium.launch(); } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), 'AppData', 'Local', 'ms-playwright');
    const dirs = existsSync(base) ? readdirSync(base).filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d)).sort((a, b) => (a.includes('headless') ? -1 : 1) - (b.includes('headless') ? -1 : 1) || b.localeCompare(a)) : [];
    for (const d of dirs) {
      for (const exe of [join(base, d, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe'), join(base, d, 'chrome-win64', 'chrome.exe'), join(base, d, 'chrome-linux', 'chrome')]) {
        if (!existsSync(exe)) continue;
        try { return await chromium.launch({ executablePath: exe }); } catch (_) { /* 다음 판 */ }
      }
    }
    throw e;
  }
}
