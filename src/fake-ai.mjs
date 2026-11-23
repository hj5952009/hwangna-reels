// 가짜 AI — Gemini 키 없이 Actions·Worker 흐름만 시험할 때 (make.mjs --fake)
// 대본은 test/fixtures/script.json, 목소리는 사인파. 렌더·PDF 쪽 그리기는 진짜를 쓴다.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpeg from 'ffmpeg-static';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'script.json');

export function fakeDeps(real) {
  return {
    ...real,
    uploadSources: async () => [],
    writeScript: async ({ meta }) => {
      const s = JSON.parse(readFileSync(FIXTURE, 'utf8'));
      if (meta.slot === 'fin') s.summary += ' 투자 권유가 아니에요.';
      // 사진이 없으면 photo 장면을 키워드로
      s.beats = s.beats.map((b) => (b.show.type === 'photo' && !meta.photos ? { ...b, show: { type: 'keyword', text: b.show.text } } : b));
      return { ...s, slot: meta.slot, week: meta.week || s.week, presenter: meta.presenter || '시험', title: meta.title || s.title };
    },
    checkScript: async ({ script }) => ({ ...script, check: { removed: [], ok: true, fake: true } }),
    speak: async ({ lines, outDir }) => {
      mkdirSync(outDir, { recursive: true });
      const out = lines.map((text, i) => {
        const sec = Math.max(2.4, text.length / 7.2);
        const wav = join(outDir, `line${i}.wav`);
        execFileSync(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `sine=frequency=${220 + i * 30}:sample_rate=24000:duration=${sec}`, '-af', 'volume=0.15', '-ac', '1', wav]);
        return { text, wav, sec, rms: Array.from({ length: Math.ceil(sec * 30) }, (_, k) => Math.abs(Math.sin(k * 0.8)) * 0.6) };
      });
      return { lines: out, total: out.reduce((a, l) => a + l.sec, 0) };
    },
  };
}
