// 업로드 서버(Cloudflare Worker hwangna-insta)의 렌더 쪽 경로를 부르는 client
// 모든 요청에 X-Render-Key 머리글 (주소·로그에 넣지 않음)
//   GET  /reels/<wid>/bundle                         → {meta, files, request}
//   GET  /reels/<wid>/file/<slot>/<kind>/<n>         → 조각 바이트
//   PUT  /reels/<wid>/out/<slot>/<video|cover>?part=i&of=N → 마지막 조각 응답 {url}
//   PUT|GET /reels/<wid>/saved/<slot>/<plan|voice>   다시 굽기용 저장본
//   POST /reels/<wid>/state  {slot, state, ...}
export const PART = 20 * 1024 * 1024; // KV 값 25MB 한도 아래

export function createClient({ url, renderKey, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }) {
  if (!url) throw new Error('WORKER_URL이 없어요');
  const base = String(url).replace(/\/+$/, '');
  async function req(path, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set('X-Render-Key', renderKey || '');
    for (let attempt = 0; ; attempt++) {
      let res;
      try { res = await fetch(base + path, { ...init, headers }); } catch (e) { res = null; if (attempt >= 3) throw new Error(`Worker 연결 실패: ${path.split('?')[0]}`); }
      if (res && res.ok) return res;
      if (res && res.status < 500 && res.status !== 429) throw new Error(`Worker ${res.status}: ${path.split('?')[0]}`);
      if (attempt >= 3) throw new Error(`Worker ${res ? res.status : '연결 실패'}: ${path.split('?')[0]}`);
      await sleep(1500 * 2 ** attempt);
    }
  }
  return {
    bundle: async (wid) => (await req(`/reels/${wid}/bundle`)).json(),
    get: async (wid, slot, kind, n, up) => Buffer.from(await (await req(`/reels/${wid}/file/${slot}/${kind}/${n}${up ? `?up=${encodeURIComponent(up)}` : ''}`)).arrayBuffer()),
    putOut: async (wid, slot, kind, buf) => {
      const of = Math.max(1, Math.ceil(buf.length / PART));
      let last;
      for (let i = 0; i < of; i++) {
        last = await (await req(`/reels/${wid}/out/${slot}/${kind}?part=${i}&of=${of}`, {
          method: 'PUT', headers: { 'Content-Type': kind === 'video' ? 'video/mp4' : 'image/jpeg' }, body: buf.subarray(i * PART, (i + 1) * PART),
        })).json();
      }
      if (!last || !last.url) throw new Error('Worker가 결과 주소를 주지 않았어요');
      return last.url;
    },
    // 다시 굽기용 저장본 (plan = 설계도+줄 경계 JSON, voice = 목소리 wav)
    putSaved: async (wid, slot, kind, buf) => {
      await req(`/reels/${wid}/saved/${slot}/${kind}`, { method: 'PUT', headers: { 'Content-Type': kind === 'voice' ? 'audio/wav' : 'application/json' }, body: buf });
    },
    getSaved: async (wid, slot, kind) => Buffer.from(await (await req(`/reels/${wid}/saved/${slot}/${kind}`)).arrayBuffer()),
    state: async (wid, slot, st) => { await req(`/reels/${wid}/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slot, ...st }) }); },
  };
}
