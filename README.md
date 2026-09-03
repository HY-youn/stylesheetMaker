# 새소망교회 캐릭터 생성기

20문항 답변 → **캐릭터 스타일시트(Core)** + 그 내용을 담은 **인포그래픽 이미지(output_final)**.
Vite로 빌드하는 단일 페이지 정적 웹앱. 생성 요청은 n8n Webhook으로 POST 하고,
응답으로 받은 바이너리 이미지를 화면에 표시 + 다운로드한다.

파이프라인 상세: [CHARACTER_PIPELINE.md](./CHARACTER_PIPELINE.md)

---

## 로컬 개발

```bash
npm install
npm run dev        # http://localhost:8765
```

- `.env` 의 `VITE_N8N_WEBHOOK` 이 비어 있으면 **데모 모드**(예시 스타일시트 + SVG 인포그래픽).
- 실제 n8n과 붙이려면 `.env` 에 Production Webhook URL 을 넣는다.
- `.env` 는 git에 커밋되지 않는다(`.gitignore`). 공유용 템플릿은 `.env.example`.

```bash
npm run build      # dist/ 생성
npm run preview     # 빌드 결과 확인 http://localhost:4173
```

## Webhook URL 우선순위

1. 화면 우측 상단 **설정(⚙)** 에서 입력한 값 — 이 브라우저에만 저장
2. 빌드 환경변수 `VITE_N8N_WEBHOOK`
3. `index.html` 의 `<meta name="n8n-webhook">` content — 빌드 없이 열 때의 폴백

셋 다 비면 데모 모드.

---

## Vercel 배포

### 방법 A — GitHub 연동 (권장)

1. 이 폴더를 GitHub 저장소로 push.
2. [vercel.com](https://vercel.com) → **Add New… → Project** → 저장소 Import.
3. Framework Preset: **Vite** 로 자동 인식됨 (Build `npm run build`, Output `dist`).
4. **Environment Variables** 에 추가:
   | Name | Value |
   |---|---|
   | `VITE_N8N_WEBHOOK` | `https://<your-n8n>/webhook/<id>` (Production URL, `-test` 아님) |
5. **Deploy** → `https://<프로젝트>.vercel.app` 발급.
6. 이후 `main` 브랜치 push 마다 자동 재배포. **환경변수를 바꾸면 재배포가 필요**하다.

### 방법 B — CLI

```bash
npm i -g vercel
vercel            # 최초 1회 프로젝트 연결
vercel --prod     # 프로덕션 배포
```

환경변수는 `vercel env add VITE_N8N_WEBHOOK production` 또는 대시보드에서 설정.

---

## 배포 후 필수 체크 (CORS)

n8n Webhook은 **브라우저 Origin** 기준으로 CORS를 검사한다. 배포 도메인이 확정되면:

1. n8n **Webhook 노드 → Allowed Origins (CORS)** 에
   `https://<프로젝트>.vercel.app` 추가 (로컬 병행 시 `http://localhost:8765` 도).
2. n8n **Respond to Webhook 노드** 응답 헤더에
   - `Content-Type: image/png`
   - `Access-Control-Expose-Headers: X-Core-Output`
3. 워크플로우 **Active** 토글 ON, URL은 `/webhook/…` (테스트 URL `/webhook-test/…` 아님).

`curl -i -X POST <URL> -H 'Content-Type: application/json' -d '{...}'` 로 먼저
바이너리 이미지 응답을 확인하면 CORS 문제와 워크플로우 문제를 분리할 수 있다.

---

## 구조

```
index.html              # 마크업 + 인라인 CSS + 인라인 module 스크립트 (앱 전체)
vite.config.js          # dev 포트 8765, 빌드 outDir=dist
.env / .env.example     # VITE_N8N_WEBHOOK
CHARACTER_PIPELINE.md   # n8n 워크플로우 + 프롬프트 규격
```

빌드 시 Vite가 인라인 module 스크립트를 `dist/assets/*.js` 로 추출하고
`import.meta.env.VITE_N8N_WEBHOOK` 를 빌드 시점 문자열로 치환한다.
