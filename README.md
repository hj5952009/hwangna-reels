# hwangna-reels

전북대 금융권 취업 학회 **황금나침반**의 위클리 설명 릴스(경제·금융)를 굽는 저장소입니다.
운영실 앱 → 업로드 서버(Cloudflare Worker) → 이 저장소의 GitHub Actions → 업로드 서버 순으로 돕니다.

- 대본·근거 확인·목소리: Google Gemini (`src/gemini.mjs`)
- 대본 규칙(길이·권유 금지·고지): `src/rules.mjs` · 숫자 읽기: `src/readout.mjs`
- 화면: 캔버스 장면(`src/scene.js`) + 캐릭터(`src/character.js`) → Playwright → ffmpeg (`render.mjs`)
- 조립: `make.mjs` (슬롯마다 따로, 한쪽이 실패해도 다른 쪽은 계속)
- 디자인 기준: `DESIGN.md`

## 지키는 것
- 이 저장소에는 코드·글꼴·캐릭터만 둡니다. 발표 자료·녹음·대본은 실행 때 받아 쓰고 지웁니다.
- Actions 로그에는 단계 이름만 찍습니다. artifact를 올리지 않습니다.
- 키는 저장소 비밀값(`GEMINI_API_KEY`, `RENDER_KEY`)과 변수(`WORKER_URL`, `REEL_CHARACTER`)에만 둡니다.

## 명령
```
npm ci
npm test                                   # 시험 (영상 굽기 시험 포함 약 1분)
node preview/sample.mjs out A              # 시험 대본으로 샘플 릴스
gh workflow run reel.yml -f wid=w-test -f fake=true   # Actions 흐름 시험 (가짜 AI)
```

글꼴: Black Han Sans, Noto Sans KR (SIL Open Font License, `fonts/`).

## 앱 화면 시험 (가짜 서버)
- `node dev/mock-worker.mjs 8791` — 앱의 `/reels/*`·`/publish`를 흉내 내는 가짜 서버. 만들기를 누르면 단계가 1.5초씩 넘어가고 시험용 영상으로 ready가 된다. **실제 인스타에는 아무것도 안 올린다.**
- 앱 CSP는 `https://*.workers.dev`만 허락하므로, 미리보기는 app 사본의 index.html CSP에 `http://localhost:8791`을 더해서 쓴다(제품 CSP에는 넣지 않음).
