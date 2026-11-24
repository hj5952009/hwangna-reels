// 가짜 AI — Gemini 키 없이 Actions·Worker 흐름만 시험할 때 (make.mjs --fake)
// 설계도는 test/fixtures/plan.json, 목소리는 사인파 한 덩어리(24kHz 모노, 글자 수/7.2초).
// 줄 나누기(splitTrack)·렌더는 진짜를 쓴다 — 쉼 없는 사인파라 글자 수 비율 경계(estimate)가 된다.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { outroScene } from './rules.mjs';

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'plan.json');
const RATE = 24000;

function wavHeader(bytes, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + bytes, 4); h.write('WAVE', 8);
  h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(bytes, 40);
  return h;
}

export function fakeDeps(real) {
  return {
    ...real,
    uploadPdf: async () => [],
    writePlan: async ({ meta }) => {
      const p = JSON.parse(readFileSync(FIXTURE, 'utf8'));
      p.scenes[p.scenes.length - 1] = outroScene(meta.slot);
      return { ...p, slot: meta.slot, week: meta.week || p.week, title: meta.title || p.title };
    },
    checkPlan: async ({ plan }) => ({ ...plan, check: [] }),
    speak: async ({ lines, outDir }) => {
      mkdirSync(outDir, { recursive: true });
      const sec = Math.max(2.4, lines.join('').length / 7.2);
      const n = Math.round(sec * RATE);
      const pcm = Buffer.alloc(n * 2);
      // 소리 크기가 천천히 오르내림 (입 모양이 움직이게) — 쉼(조용한 구간)은 만들지 않음
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 260 * t) * (0.12 + 0.08 * Math.sin(2 * Math.PI * 3 * t)) * 32767), i * 2);
      }
      const wav = join(outDir, 'voice.wav');
      writeFileSync(wav, Buffer.concat([wavHeader(pcm.length, RATE), pcm]));
      return { wav, pcm, rate: RATE, total: sec };
    },
  };
}
