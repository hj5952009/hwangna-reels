# hwangna-reels

전북대 금융권 취업 학회 **황금나침반**의 위클리 설명 릴스(경제·금융)를 굽는 저장소입니다.
운영실 앱 → 업로드 서버(Cloudflare Worker) → 이 저장소의 GitHub Actions → 업로드 서버 순으로 돕니다.

- 입력: 발표 PDF(필수) + 발표자가 붙인 대본 글(notes, 선택)
- 장면 설계도 쓰기·근거 확인·목소리: Google Gemini 무료 키 (`src/gemini.mjs`) — 목소리는 편당 요청 1번
- 설계도 규칙(장면 6~10개·종류별 data 모양·권유 금지·실명 금지): `src/rules.mjs` · 숫자 읽기: `src/readout.mjs`
- 목소리 한 덩어리 → 줄 경계: `src/split.mjs` (쉼을 찾고, 못 찾으면 글자 수 비율)
- 화면: 장면 종류 9개(`src/kinds.js`) + 캐릭터 형제 나침이(경제)·콕이(금융)(`src/character.js`) + 틀·자막(`src/scene.js`) → Playwright → ffmpeg (`render.mjs`)
- 조립: `make.mjs` (슬롯마다 따로, 한쪽이 실패해도 다른 쪽은 계속). 다시 굽기는 저장된 설계도·목소리를 다시 쓰고, 대사를 고쳤을 때만 목소리를 새로 받음
- 디자인 기준: `DESIGN.md`

## 지키는 것
- 이 저장소에는 코드·글꼴·캐릭터만 둡니다. 발표 자료·설계도·목소리는 실행 때 받아 쓰고 지웁니다(다시 굽기용 저장본은 업로드 서버에 14일).
- Actions 로그에는 단계 이름만 찍습니다. artifact를 올리지 않습니다.
- 키는 저장소 비밀값(`GEMINI_API_KEY`, `RENDER_KEY`)과 변수(`WORKER_URL`)에만 둡니다.

## 명령
```
npm ci
npm test                                   # 시험 (영상 굽기 시험 포함 약 1분)
node preview/sample.mjs out                # 시험 설계도(test/fixtures/plan.json)로 샘플 릴스
node preview/frames.mjs out/frames         # 장면마다 프레임 1장 + 자막 검사
gh workflow run reel.yml -f wid=w-test -f fake=true   # Actions 흐름 시험 (가짜 AI)
```

글꼴: Black Han Sans, Noto Sans KR (SIL Open Font License, `fonts/`).

## 앱 화면 시험 (가짜 서버)
- `node dev/mock-worker.mjs 8791` — 앱의 `/reels/*`·`/publish`를 흉내 내는 가짜 서버. 만들기를 누르면 단계가 1.5초씩 넘어가고 시험용 영상으로 ready가 된다. **실제 인스타에는 아무것도 안 올린다.**
- 앱 CSP는 `https://*.workers.dev`만 허락하므로, 미리보기는 app 사본의 index.html CSP에 `http://localhost:8791`을 더해서 쓴다(제품 CSP에는 넣지 않음).
