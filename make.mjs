// 위클리 설명 릴스 조립: 자료 받기 → 대본(Gemini) → 근거 확인 → 목소리 → 렌더 → 올리기 → 상태
// 슬롯(경제·금융)마다 따로 돈다 — 한쪽이 실패해도 다른 쪽은 계속.
// 로그에는 단계 이름만 찍는다 (공개 저장소 Actions 로그에 발표 내용·키가 남지 않게).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validate, outroSpeech } from './src/rules.mjs';

export const DISCLAIMER = '🤖 AI 목소리·캐릭터로 만든 영상이에요 · 발표 내용 요약이며 투자 권유가 아니에요';
export const withDisclaimer = (caption) => `${String(caption || '').split(DISCLAIMER).join('').trim()}\n\n${DISCLAIMER}`.trim();

const run = promisify(execFile);
const log = (slot, step) => console.log(`[${slot}] ${step}`);

// PDF에서 대본이 쓰는 쪽만 PNG로 (pdftoppm 없으면 건너뜀 → 화면은 글자 카드로 대신함)
export async function pdfPages(pdf, pages, dir) {
  for (const p of pages) {
    try { await run('pdftoppm', ['-png', '-r', '110', '-f', String(p), '-l', String(p), '-singlefile', pdf, join(dir, `slide${p}`)]); } catch { /* 없음 */ }
  }
}

async function realDeps() {
  const g = await import('./src/gemini.mjs');
  const { render } = await import('./render.mjs');
  return { uploadSources: g.uploadSources, writeScript: g.writeScript, checkScript: g.checkScript, speak: g.speak, render, pdfPages };
}

async function fetchAll(client, wid, slot, kind, list) {
  const parts = [];
  for (const n of [...list].sort((a, b) => a - b)) parts.push(await client.get(wid, slot, kind, n));
  return Buffer.concat(parts);
}

async function makeSlot({ wid, slot, bundle, rerender, client, key, deps, variant, work, fake }) {
  const step = (s) => { log(slot, s); return client.state(wid, slot, { state: 'making', step: s }); };
  const metaSlot = (bundle.meta && bundle.meta[slot]) || {};
  const files = (bundle.files && bundle.files[slot]) || {};
  const photoList = (bundle.files && bundle.files.photo) || [];
  const meta = { slot, week: (bundle.meta && bundle.meta.week) || '', presenter: metaSlot.presenter || '', title: metaSlot.title || '', photos: photoList.length };
  const dir = join(work, slot); mkdirSync(dir, { recursive: true });

  const hasPdf = (files.pdf || []).length > 0; const hasAudio = (files.audio || []).length > 0;
  if (!rerender && !hasPdf && !hasAudio && !fake) throw new Error('자료 없음: 이 칸에 PDF도 녹음도 없어요');

  await step('자료 받기');
  let pdfPath = null;
  if (hasPdf) { pdfPath = join(dir, 'talk.pdf'); writeFileSync(pdfPath, await fetchAll(client, wid, slot, 'pdf', files.pdf)); }
  const assets = join(dir, 'assets'); mkdirSync(assets, { recursive: true });
  for (const n of photoList) writeFileSync(join(assets, `photo${n}.jpg`), await client.get(wid, 'photo', 'jpg', n));

  let script;
  if (rerender) {
    script = { ...rerender, slot, week: meta.week, presenter: meta.presenter || rerender.presenter };
    const v = validate(script, { minChars: 240 });
    if (v.length) throw new Error(`고친 대본이 규칙에 안 맞아요: ${v.join(' / ')}`);
  } else {
    let audioPath = null;
    if (hasAudio) { audioPath = join(dir, `talk.${metaSlot.audioExt || 'm4a'}`); writeFileSync(audioPath, await fetchAll(client, wid, slot, 'audio', files.audio)); }
    await step('대본 쓰기');
    const sources = await deps.uploadSources({ key, audioPath, pdfPath });
    const draft = await deps.writeScript({ key, audioPath, pdfPath, meta, sources });
    await step('근거 확인');
    script = await deps.checkScript({ key, script: draft, sources });
  }

  const pages = [...new Set(script.beats.filter((b) => b.show && b.show.type === 'slide').map((b) => Number(b.show.page) || 1))];
  if (pdfPath && pages.length) await deps.pdfPages(pdfPath, pages, assets);

  await step('목소리');
  const lines = [script.hook, ...script.beats.map((b) => b.line), script.summary, outroSpeech(script)];
  const track = await deps.speak({ key, lines, outDir: join(dir, 'voice') });

  await step('영상 굽기');
  const out = join(dir, `reel-${slot}.mp4`);
  const r = await deps.render({ script, track, assetsDir: assets, out, variant });

  await step('올리기');
  const video = await client.putOut(wid, slot, 'video', readFileSync(r.mp4));
  const cover = await client.putOut(wid, slot, 'cover', readFileSync(r.cover));
  const caption = withDisclaimer(script.caption);
  await client.state(wid, slot, { state: 'ready', script, caption, video, cover, seconds: r.seconds, renderedAt: Date.now() });
  log(slot, '끝');
}

export async function make({ wid, slots, rerender = null, client, key, fake = false, deps = null, variant }) {
  const d = deps || (fake ? (await import('./src/fake-ai.mjs')).fakeDeps(await realDeps()) : await realDeps());
  const bundle = await client.bundle(wid);
  const work = mkdtempSync(join(tmpdir(), 'reel-'));
  const result = {};
  try {
    for (const slot of slots) {
      try {
        await makeSlot({ wid, slot, bundle, rerender: rerender && rerender[slot], client, key, deps: d, variant, work, fake });
        result[slot] = 'ready';
      } catch (e) {
        const error = String((e && e.message) || e).split(key || '\u0000').join('***').slice(0, 300);
        log(slot, '실패');
        result[slot] = 'failed';
        await client.state(wid, slot, { state: 'failed', error });
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true }); // 발표 자료·녹음·목소리는 남기지 않음
  }
  return result;
}

// ── 명령줄: Actions에서 node make.mjs <wid> [--fake] ──
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { createClient } = await import('./src/worker-client.mjs');
  const wid = process.argv[2] || process.env.WID;
  const fake = process.argv.includes('--fake') || process.env.FAKE === 'true';
  if (!/^w-\d{4}-\d{2}-\d{2}$|^w-test$/.test(String(wid))) { console.error('주 id 형식이 아니에요'); process.exit(2); }
  const client = createClient({ url: process.env.WORKER_URL, renderKey: process.env.RENDER_KEY });
  const req = (await client.bundle(wid)).request || {};
  const slots = (req.slots || ['econ', 'fin']).filter((s) => s === 'econ' || s === 'fin');
  const key = process.env.GEMINI_API_KEY || '';
  if (!fake && !key) { console.error('GEMINI_API_KEY 비밀값이 없어요'); process.exit(2); }
  const variant = process.env.REEL_CHARACTER || undefined;
  const r = await make({ wid, slots, rerender: req.rerender || null, client, key, fake, variant });
  console.log(JSON.stringify(r));
  if (!Object.values(r).includes('ready')) process.exit(1);
}
