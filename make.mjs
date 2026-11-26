// 위클리 설명 릴스 조립 v2: 자료 받기(PDF) → 설계도 쓰기(Gemini) → 근거 확인 → 목소리(TTS 1번) → 영상 굽기 → 올리기 → 상태
// 슬롯(경제·금융)마다 따로 돈다 — 한쪽이 실패해도 다른 쪽은 계속.
// 로그에는 단계 이름만 찍는다 (공개 저장소 Actions 로그에 발표 내용·키가 남지 않게).
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePlan, planNumbers, SLACK } from './src/rules.mjs';
import { CHARACTERS } from './src/brand.js';

export const DISCLAIMER = '🤖 AI 목소리·캐릭터로 만든 영상이에요 · 발표 내용 요약이며 투자 권유가 아니에요';
export const withDisclaimer = (caption) => `${String(caption || '').split(DISCLAIMER).join('').trim()}\n\n${DISCLAIMER}`.trim();
const captionOf = (plan) => withDisclaimer([plan.caption, (plan.hashtags || []).join(' ')].filter((x) => String(x || '').trim()).join('\n\n'));
const RERENDER_MIN = 220; // 사람이 고친 대사는 조금 짧아져도 받는다

const log = (slot, step) => console.log(`[${slot}] ${step}`);

async function realDeps() {
  const g = await import('./src/gemini.mjs');
  const { splitTrack } = await import('./src/split.mjs');
  const { render } = await import('./render.mjs');
  return { uploadPdf: g.uploadPdf, writePlan: g.writePlan, checkPlan: g.checkPlan, speak: g.speak, splitTrack, render };
}

async function fetchAll(client, wid, slot, kind, list, up) {
  const parts = [];
  for (const n of [...list].sort((a, b) => a - b)) parts.push(await client.get(wid, slot, kind, n, up));
  return Buffer.concat(parts);
}

// 목소리 한 덩어리 → 줄 경계 Track
async function voice({ plan, slot, key, deps, dir }) {
  const lines = plan.scenes.map((s) => s.say);
  const v = await deps.speak({ key, lines, voice: CHARACTERS[slot].voice, style: CHARACTERS[slot].style, outDir: join(dir, 'voice') });
  return deps.splitTrack({ wav: v.wav, pcm: v.pcm, rate: v.rate, lines });
}

// 다시 굽기: 저장된 설계도에 고친 say·text·문구만 옮긴다 (장면 종류·data·근거는 저장본 그대로)
function merge(saved, edited) {
  const es = (edited && edited.scenes) || [];
  if (es.length !== saved.scenes.length) throw new Error(`장면 수가 저장본과 달라요 (${es.length}개 / ${saved.scenes.length}개)`);
  return {
    ...saved,
    caption: edited.caption != null ? edited.caption : saved.caption,
    hashtags: Array.isArray(edited.hashtags) ? edited.hashtags : saved.hashtags,
    scenes: saved.scenes.map((s, i) => ({ ...s, say: String(es[i].say ?? s.say), text: String(es[i].text ?? s.text) })),
  };
}

async function makeSlot({ wid, slot, bundle, rerender, client, key, deps, work, fake }) {
  const step = (s) => { log(slot, s); return client.state(wid, slot, { state: 'making', step: s }); };
  const metaSlot = (bundle.meta && bundle.meta[slot]) || {};
  const files = (bundle.files && bundle.files[slot]) || {};
  const ups = (bundle.ups && bundle.ups[slot]) || {};
  const meta = { slot, week: (bundle.meta && bundle.meta.week) || '', title: metaSlot.title || '', names: [metaSlot.presenter].filter(Boolean) };
  const dir = join(work, slot); mkdirSync(dir, { recursive: true });

  let plan; let track; let warn = [];
  let base; let names = meta.names; // base: 근거 확인을 거친 설계도의 숫자 (다시 굽기를 여러 번 해도 늘 이것과 비교)
  if (rerender) {
    await step('저장본 받기');
    const saved = JSON.parse((await client.getSaved(wid, slot, 'plan')).toString('utf8'));
    plan = merge(saved.plan, rerender.plan);
    // 자료 목록(rm)은 7일이면 지워지므로 저장본(14일)에 둔 발표자 이름도 함께 본다
    names = [...new Set([...(Array.isArray(saved.names) ? saved.names : []), ...meta.names])];
    const v = validatePlan(plan, { names, minChars: RERENDER_MIN, slack: SLACK });
    if (v.length) throw new Error(`고친 설계도가 규칙에 안 맞아요: ${v.join(' / ')}`);
    base = Array.isArray(saved.base) ? saved.base : [...planNumbers(saved.plan)];
    const before = new Set(base);
    const fresh = [...planNumbers(plan)].filter((n) => !before.has(n));
    if (fresh.length) warn = [`근거 없는 새 숫자: ${fresh.join(', ')}`];
    if (plan.scenes.every((s, i) => s.say === saved.plan.scenes[i].say)) {
      const wav = join(dir, 'voice.wav');
      writeFileSync(wav, await client.getSaved(wid, slot, 'voice'));
      track = { ...saved.track, wav };
    } else {
      await step('목소리');
      track = await voice({ plan, slot, key, deps, dir });
    }
  } else {
    const pdfList = files.pdf || [];
    if (!pdfList.length && !fake) throw new Error('PDF가 없어요: 이 칸에 발표 PDF를 올려 주세요');
    await step('자료 받기');
    let pdfPath = null;
    if (pdfList.length) { pdfPath = join(dir, 'talk.pdf'); writeFileSync(pdfPath, await fetchAll(client, wid, slot, 'pdf', pdfList, ups.pdf || undefined)); }
    await step('설계도 쓰기');
    const sources = await deps.uploadPdf({ key, pdfPath });
    const draft = await deps.writePlan({ key, sources, notes: String(metaSlot.notes || ''), meta });
    await step('근거 확인');
    plan = await deps.checkPlan({ key, plan: draft, sources, names: meta.names });
    base = [...planNumbers(plan)];
    await step('목소리');
    track = await voice({ plan, slot, key, deps, dir });
  }

  await step('영상 굽기');
  const out = join(dir, `reel-${slot}.mp4`);
  const r = await deps.render({ plan, track, out });

  await step('올리기');
  // 다시 굽기용 저장본 (발표 PDF는 남기지 않음 — 설계도·줄 경계·목소리만)
  const { wav: _wav, pcm: _pcm, ...keep } = track;
  // names: 발표자 이름은 다시 굽기 실명 검사에만 쓰고, 공개 저장소·로그에는 남지 않음 (Worker KV 14일)
  await client.putSaved(wid, slot, 'plan', Buffer.from(JSON.stringify({ plan, track: keep, base, names })));
  await client.putSaved(wid, slot, 'voice', readFileSync(track.wav));
  const video = await client.putOut(wid, slot, 'video', readFileSync(r.mp4));
  const cover = await client.putOut(wid, slot, 'cover', readFileSync(r.cover));
  await client.state(wid, slot, {
    state: 'ready', plan, caption: captionOf(plan), video, cover, seconds: r.seconds,
    character: CHARACTERS[slot].name, timing: track.timing, check: plan.check || [], warn, renderedAt: Date.now(),
  });
  log(slot, '끝');
}

// 서버 KV는 지역마다 최대 60초 늦게 보일 수 있어, dispatch에 실린 요청 번호(req)와 같은 묶음을 읽을 때까지 기다린다.
// reqAt이 없으면(손으로 실행) 첫 묶음을 그대로 쓴다.
// 더 새 요청이 보이면 null: 서버가 아직 시작 안 한 앞 요청의 칸을 새 요청에 합쳤으니 새 요청의 실행이 맡는다.
export async function freshBundle(client, wid, reqAt, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), tries = 13, waitMs = 10000 } = {}) {
  const want = Number(reqAt) || 0;
  for (let i = 0; ; i += 1) {
    const b = await client.bundle(wid);
    const at = Number((b.request || {}).at) || 0;
    if (!want || at === want) return b;
    if (at > want) return null;
    if (i + 1 >= tries) throw new Error('최신 요청을 서버에서 읽지 못했어요 — 앱에서 다시 만들어 주세요');
    await sleep(waitMs);
  }
}

export async function make({ wid, slots, rerender = null, client, key, fake = false, deps = null, bundle: given = null }) {
  const d = deps || (fake ? (await import('./src/fake-ai.mjs')).fakeDeps(await realDeps()) : await realDeps());
  const bundle = given || (await client.bundle(wid));
  const work = mkdtempSync(join(tmpdir(), 'reel-'));
  const result = {};
  try {
    for (const slot of slots) {
      try {
        await makeSlot({ wid, slot, bundle, rerender: rerender && rerender[slot], client, key, deps: d, work, fake });
        result[slot] = 'ready';
      } catch (e) {
        const error = String((e && e.message) || e).split(key || '\u0000').join('***').slice(0, 300);
        log(slot, '실패');
        result[slot] = 'failed';
        await client.state(wid, slot, { state: 'failed', error });
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true }); // 작업 폴더(발표 PDF·목소리·영상)는 남기지 않음
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
  const bundle = await freshBundle(client, wid, process.env.REQ_AT);
  if (!bundle) { console.log('{"superseded":true}'); process.exit(0); } // 뒤 요청에 합쳐짐
  const req = bundle.request || {};
  const slots = (req.slots || ['econ', 'fin']).filter((s) => s === 'econ' || s === 'fin');
  const key = process.env.GEMINI_API_KEY || '';
  if (!fake && !key) { console.error('GEMINI_API_KEY 비밀값이 없어요'); process.exit(2); }
  const r = await make({ wid, slots, rerender: req.rerender || null, client, key, fake, bundle });
  console.log(JSON.stringify(r));
  if (!Object.values(r).includes('ready')) process.exit(1);
}
