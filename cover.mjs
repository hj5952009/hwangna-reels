// 위클리 인스타 표지 장면 뽑기 (운영실 PLAN ⑦-35) — 업로드 서버(Worker)가 repository_dispatch(cover)로 부른다.
// 26.11.27: Worker에 넣은 Gemini 키가 결제 계정 선불 0원(402)이라, 정상인 이 저장소 키로 장면을 뽑는다.
// 흐름: Worker에서 맡긴 일(PDF 조각·장면 글·스키마) 받기 → PDF를 Gemini에 올림 → 장면 JSON → 근거 확인 → Worker에 결과
// 발표 내용·장면은 로그에 찍지 않는다 (공개 저장소 Actions 로그) — 단계 이름과 상태 번호만.
import { writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const scrub = (key, s) => (key ? String(s).split(key).join('***') : String(s));

// 근거 확인에 보낼 장면 — Worker(cover.js coverout)와 같은 순서: 객체만 · 앞 4개 · 1부터
export const checkList = (raw) => (Array.isArray(raw && raw.scenes) ? raw.scenes : [])
  .filter((x) => x && typeof x === 'object').slice(0, 4)
  .map((s, i) => ({ scene: i + 1, page: s.page, quote: s.quote }));

export async function runCover({ client, wid, slot, req, key, upload, gen, log = console.log }) {
  let job;
  try { job = await client.coverJob(wid, slot); } catch (e) { log(`{"stale":true,"why":"job"}`); return { stale: true }; }
  if (Number(req) && job.req !== Number(req)) { log('{"stale":true,"why":"req"}'); return { stale: true }; } // 뒤 요청이 이미 있음
  const dir = mkdtempSync(join(tmpdir(), 'cover-'));
  try {
    log(`[${slot}] 자료 받기`);
    const bufs = [];
    for (const n of job.pdf.parts) bufs.push(await client.get(wid, slot, 'pdf', n, job.pdf.up));
    const path = join(dir, 'weekly.pdf');
    writeFileSync(path, Buffer.concat(bufs));
    log(`[${slot}] 장면 뽑기`);
    const src = await upload(key, path, 'application/pdf');
    const raw = await gen(key, [src, { text: job.prompt }], job.schema, { temperature: 0.6 });
    log(`[${slot}] 근거 확인`);
    let check = null;
    try { check = await gen(key, [src, { text: `${job.checkPrompt}\n장면: ${JSON.stringify(checkList(raw))}` }], job.checkSchema, { temperature: 0.1 }); } catch (e) { log(`[${slot}] 근거 확인 못 함 ${e.status || '?'}`); }
    await client.coverOut(wid, { slot, req: job.req, raw, check });
    log(`[${slot}] 끝`);
    return { ok: true };
  } catch (e) {
    const status = e instanceof SyntaxError ? 502 : Number(e.status) || 0;
    const error = e instanceof SyntaxError ? 'Gemini 답이 JSON 모양이 아니에요 — 다시 눌러 주세요' : scrub(key, (e && e.message) || '장면을 뽑지 못했어요').slice(0, 280);
    log(`[${slot}] 실패 ${status}`);
    try { await client.coverOut(wid, { slot, req: job.req, error, status }); } catch (_) { log('[cover] 실패 알림도 못 함'); }
    return { ok: false, status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── 명령줄: Actions에서 node cover.mjs (WID·SLOT·REQ_AT) ──
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { createClient } = await import('./src/worker-client.mjs');
  const { uploadFile, generateJson } = await import('./src/gemini.mjs');
  const wid = process.env.WID; const slot = process.env.SLOT;
  if (!/^w-\d{4}-\d{2}-\d{2}$|^w-test$/.test(String(wid)) || !['econ', 'fin'].includes(slot)) { console.error('주 id·칸 형식이 아니에요'); process.exit(2); }
  const key = process.env.GEMINI_API_KEY || '';
  if (!key) { console.error('GEMINI_API_KEY 비밀값이 없어요'); process.exit(2); }
  const client = createClient({ url: process.env.WORKER_URL, renderKey: process.env.RENDER_KEY });
  const r = await runCover({ client, wid, slot, req: process.env.REQ_AT, key, upload: uploadFile, gen: generateJson });
  if (r.ok === false) process.exit(1);
}
