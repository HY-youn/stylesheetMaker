# 캐릭터 스타일시트 생성 파이프라인 — Claude Code 실행 지침

이 문서는 Claude Code가 "새소망교회 캐릭터 생성기" 파이프라인을 이해하고,
n8n 워크플로우 및 SPA 프론트엔드 코드를 생성/수정/배포할 때 따라야 할
프롬프트 구조와 작업 순서를 정의한다.

---

## 0. 목적

사용자가 20개 질문에 답하면 다음 2단계 산출물을 자동 생성하는 시스템을 구축한다.

1. **Core Output**: 캐릭터 스타일시트 (배경/성격/말투/색상/소품 등)
   — GPT 노드가 생성하고, Google Sheets에 행으로 append + update 저장한다.
2. **output_final**: Core Output(스타일시트) 전체 내용을 그대로 담은 **인포그래픽 이미지**
   — GPT-image 노드가 Core Output을 근거로 생성하고, 웹훅 응답으로 이미지 파일을 반환한다.

Claude Code는 이 로직을 n8n 워크플로우 + SPA 코드로 구현한다.
SPA는 웹훅 응답에서 이미지 파일을 감지해 `output_final` 패널에 표시하고,
버튼으로 다운로드할 수 있게 한다.

---

## 1. 필수 파라미터 스키마

SPA 폼에서 수집해야 할 최소 입력값. 프로젝트마다 확장 가능하다.

```json
{
  "name": "string, optional (인포그래픽 상단 표시)",
  "gender": "string, required",
  "age": "number, required",
  "affiliation": "string, required (예: 새소망교회 고등부 교사)",
  "title": "string, required (직함 — 질문 문구 재구성 키. 예: 교사/학생/간사/학생부장/총무)",
  "extra_params": ["string[], optional, 사용자 정의 슬롯"],
  "questions": ["string[20], 직함에 맞게 재구성된 질문 문구 (answers와 1:1 대응)"],
  "answers": ["string[20], 각 질문에 대한 답변 (빈 문자열 허용)"]
}
```

`questions[i]`와 `answers[i]`는 같은 슬롯이다. LLM 프롬프트에서 두 배열을 zip 하여
"질문 → 답변" 쌍으로 주입한다. `questions`는 SPA가 `title` 기준으로 이미 재구성해서 보낸다.

---

## 2. 질문 리스트 (유저 노출용, 카테고리 비노출)

SPA 폼에는 아래 20개 질문을 **순서대로, 카테고리 구분 없이** 렌더링한다.
번호와 텍스트만 사용자에게 보인다.

```
1. 원래 직업이나 전공은 무엇이었나요?
2. 어떤 계기로 신앙을 갖게 됐나요?
3. 왜 하필 '가르치는 일'을 택했나요?
4. 그 일을 하기 전과 후, 가장 크게 달라진 점은?
5. 인생에서 가장 큰 전환점은 무엇이었나요?
6. 스트레스를 받을 때 어떻게 반응하나요?
7. 사람을 처음 만날 때 먼저 관찰하는 부분은?
8. 스스로 생각하는 강점과 약점은?
9. 감정을 표현하는 방식은 직접적인가요, 우회적인가요?
10. 원칙과 융통성 중 어느 쪽에 가까운가요?
11. 상대가 실수했을 때 첫마디는 보통 어떤가요?
12. 질문을 받으면 바로 답하는 편인가요, 되묻는 편인가요?
13. 자주 쓰는 말버릇이 있나요?
14. 유머는 어떤 방식으로 구사하나요?
15. 사람들과의 관계에서 가장 중요하게 여기는 것은?
16. 자신의 신념을 전할 때 이성/논리 중심인가요, 경험/감성 중심인가요?
17. 존경하거나 영향을 받은 인물이 있나요?
18. 가장 견디기 힘든 상황은 무엇인가요?
19. 옷차림에서 절대 포기 못 하는 요소가 있나요?
20. 남들이 받는 첫인상과 실제 성격의 괴리가 있나요?
```

### 내부 인지 매핑 (백엔드/프롬프트 로직 전용 — 유저에게 절대 노출 금지)

| 질문 번호 | 카테고리 |
|---|---|
| 1~5 | 배경 스토리 (Background) |
| 6~10 | 성격 (Personality) |
| 11~14 | 말투 & 대화 스타일 (Speech Style) |
| 15~18 | 관계 & 가치관 (Relationships & Values) |
| 19~20 | 외형 & 분위기 (Appearance & Mood) |

이 매핑은 LLM 호출 시 시스템 프롬프트 내부 로직으로만 사용하고,
API 응답이나 UI 텍스트에 카테고리명을 노출하지 않는다.

### 직함(affiliation)에 따른 질문 문구 재구성

20개 슬롯 번호와 위 카테고리 매핑은 **고정**이다. 바뀌는 것은 일부 슬롯의 **표면 문구뿐**이다.
직함에 따라 삶의 정황이 달라 어색해지는 질문(주로 1·3·4번, 배경 스토리 축)만
직함별 문구로 치환하고, 매칭되는 직함이 없으면 기본 문구를 그대로 쓴다.

| 슬롯 | 기본(교사) | 학생 | 총무 | 간사 | 학생부장 |
|---|---|---|---|---|---|
| 1 | 원래 직업이나 전공은? | 지금 하는 공부나 관심 분야는? | (기본) | (기본) | (기본) |
| 3 | 왜 '가르치는 일'을 택했나요? | 왜 이 공동체에 계속 나오나요? | 왜 살림·재정 역할을 택했나요? | 왜 이 사역에 헌신했나요? | 왜 이끄는 자리를 맡았나요? |
| 4 | 그 일 전과 후 달라진 점은? | 이 공동체 전과 후 달라진 점은? | 그 역할 전과 후 달라진 점은? | 사역 전과 후 달라진 점은? | 그 자리 전과 후 달라진 점은? |

- SPA는 `title` 값으로 위 표를 조회해 `questions` 배열을 만든 뒤 payload에 담아 보낸다.
- 6~20번은 직함과 무관하게 공통 문구를 유지한다.
- 사용자에게는 재구성 사실만 안내하고(직함 변경 시 토스트), 카테고리·매핑은 노출하지 않는다.
- 새 직함을 추가하려면 SPA의 `Q_OVERRIDES` / `SAMPLE_OVERRIDES` 테이블에 슬롯별 문구를 넣는다.

---

## 3. Core Prompt (스타일시트 생성)

n8n의 첫 번째 LLM 노드(GPT 계열)에 전달할 프롬프트.
`{{ $json.body }}`로 필수 파라미터 + 20문항을 주입한다.
`questions[i]`와 `answers[i]`를 zip 하여 "Q. … / A. …" 쌍으로 `{{qa_pairs}}`에 넣는다
(예: Function 노드에서 `questions.map((q,i)=>` `Q${i+1}. ${q}\nA. ${answers[i]||'(무응답)'}` `).join('\n\n')`).

```
당신은 캐릭터 프로파일링 전문가입니다.
아래 [필수 파라미터]와 [질문-답변 자료]를 바탕으로 캐릭터 스타일시트를 완성하세요.

[규칙]
- 유저가 제공한 답변은 성격에 따라 배경 스토리 / 성격 / 말투 / 관계·가치관 / 외형
  다섯 축으로 스스로 분류하여 재구성할 것.
- 답변에 없는 부분은 앞뒤 맥락에서 귀납적으로 추론하되, 추론한 항목은 별도로 표시할 것.
- 유저에게는 이 내부 분류 체계를 언급하거나 노출하지 말 것.

[필수 파라미터]
- 성별: {{gender}}
- 나이: {{age}}
- 소속/직함: {{affiliation}}
- 직함: {{title}}
- 추가 파라미터: {{extra_params}}

[질문-답변 자료]  (질문 문구는 직함에 맞게 재구성된 것임)
{{qa_pairs}}

[출력 형식]
1. 배경 스토리 (3~5줄 서술)
2. 성격 요약 (키워드 5개 + 짧은 설명)
3. 말투 가이드 (예시 대사 3개 포함)
4. 스타일시트 표
   - 주 색상 / 보조 색상 / 포인트 색상
   - 의상 스타일
   - 소품
   - 표정 특징
   - 배경/공간 설정
   - 분위기 키워드
5. 추론 근거 메모 (답변에 없어서 추측한 항목과 그 이유)
```

---

## 4. output_final Prompt (인포그래픽 이미지 생성 프롬프트)

Core Output을 입력으로 받는 GPT-image 노드용 프롬프트.
스타일시트 전체 내용을 "왜곡하거나 요약하지 않고 그대로" 한 페이지 인포그래픽 이미지로 렌더링한다.
아래 프롬프트로 인포그래픽 지시문을 만든 뒤, 그 출력을 GPT-image 노드 입력으로 전달한다.
(간단히 하려면 GPT-image 노드에 `{{core_output}}`를 직접 넣고 시스템 지시로 아래 규칙을 줘도 된다.)

```
당신은 캐릭터 프로파일 인포그래픽 디자인 프롬프트 에디터입니다.
아래 [캐릭터 스타일시트]의 내용을 "왜곡하거나 수정하지 않고 그대로"
한 페이지 인포그래픽 이미지 생성 프롬프트로 변환하세요.

[규칙]
1. 배경 스토리, 성격 키워드, 말투 예시, 색상 팔레트, 소품, 분위기 키워드를
   빠짐없이 텍스트 라벨/문구로 이미지 안에 포함시킬 것.
2. 내용을 요약하거나 재해석하지 말고, 원문 그대로를 인포그래픽 섹션에 배치할 것.
3. 인물 일러스트(Korean webtoon style)를 페이지 중심 또는 좌측에 배치하고,
   나머지 텍스트/색상 정보는 우측 또는 하단에 섹션화하여 배치.
4. 레이아웃: 상단(이름/직함) → 좌측(인물 일러스트) → 우측(배경/성격/말투 섹션)
   → 하단(색상 팔레트 스와치 + 소품 아이콘 + 분위기 키워드 태그).
5. 한글 텍스트 렌더링 정확도를 최우선으로 할 것. 세로형 3:4 비율.

[캐릭터 스타일시트]
{{core_output}}

[출력 형식]
1. GPT-image 이미지 생성 프롬프트 (영문 지시 + 한글 라벨 원문 유지)
2. [원문 유지 확인 로그] — 스타일시트 문구가 어느 섹션에 배치되었는지 매핑표
```

---

## 5. (삭제됨) 일러스트 이미지 프롬프트

이전 버전의 "Output 1 — 네이버웹툰/카카오페이지 일러스트 프롬프트" 단계는 이 파이프라인에서 제거되었다.
인물 일러스트는 이제 별도 산출물이 아니라 `output_final` 인포그래픽 안에 포함되는 요소로만 존재한다.

---

## 6. n8n 워크플로우 구조 (Claude Code가 생성/유지할 노드 순서)

```
1. Webhook Trigger (POST)
   - Body: { name, gender, age, affiliation, title, extra_params,
             questions: [20 strings], answers: [20 strings] }
   - Response Mode: "Using Respond to Webhook Node"

2. Function / Set Node — 입력 검증 및 프롬프트 변수 조립
   - 필수 파라미터(gender, age, affiliation) 누락 시 400 에러로 응답

3. LLM Node (GPT 계열) — Core Prompt 실행
   - Credential: n8n Credentials 등록 (하드코딩 금지)
   - 응답 텍스트를 core_output 변수로 저장

4. Google Sheets Node — 행 Append & Update
   - a) Append Row: 요청 시각 / name / gender / age / affiliation / extra_params / answers 를
        새 행으로 추가하고, 반환된 행 번호(row_number)를 보관
   - b) Update Row: 3번에서 생성한 core_output(스타일시트 전문)과 status=generated 를
        방금 추가한 행에 갱신

5. LLM Node (GPT 계열) — output_final Prompt 실행 (선택)
   - core_output 주입 → 인포그래픽 이미지 프롬프트 생성
   - 생략 시 6번 노드에서 core_output을 직접 사용

6. GPT-image 2.0 Node — 인포그래픽 이미지 생성
   - 입력: 5번 프롬프트(또는 core_output)
   - 출력: 바이너리 이미지(png). 바이너리 프로퍼티명 예: data

7. (선택) Google Sheets Update Row — 이미지를 외부 저장소에 올렸다면 그 URL을 행에 기록

8. Respond to Webhook Node
   - Respond With: "Binary File" (6번 노드의 바이너리 프로퍼티)
   - Response Headers:
       Content-Type: image/png
       X-Core-Output: {{ $base64Encode($node["LLM-Core"].json["core_output"]) }}   ← 스타일시트 원문(UTF-8 base64, 선택)
       Access-Control-Allow-Origin: <SPA 도메인>
       Access-Control-Expose-Headers: X-Core-Output
   - 본문: 인포그래픽 이미지 파일

9. Error Trigger / IF Node — 각 단계 실패 시 재시도 또는 에러 응답
   - 실패 응답은 Content-Type: application/json, 본문 { "error": "..." }
   - SPA는 이미지가 아닌 응답을 에러로 처리한다
```

### SPA ↔ 워크플로우 계약

- **성공**: HTTP 200, `Content-Type: image/*`, 본문 = 인포그래픽 이미지 파일.
  `X-Core-Output` 헤더에 스타일시트 원문(base64)을 함께 실으면 SPA가 Core 패널에 표시한다.
- **실패**: HTTP 4xx/5xx 이거나 `Content-Type: application/json` 본문 `{ "error": "..." }`.
- SPA는 응답 `Content-Type`이 `image/`로 시작하면 Blob으로 읽어 `output_final` 패널에
  표시하고 다운로드 버튼을 활성화한다. 그 외 응답은 에러 화면으로 처리한다.
- JS가 `X-Core-Output` 헤더를 읽으려면 워크플로우에서 반드시
  `Access-Control-Expose-Headers: X-Core-Output` 를 내려줘야 한다.

---

## 7. SPA 배포 프로세스 (Vite + Vercel)

스택: 단일 `index.html`(인라인 CSS + 인라인 `type="module"` 스크립트) + Vite 빌드 + Vercel 정적 호스팅.
자세한 명령/화면 순서는 [README.md](./README.md).

### 빌드/배포
- [ ] 1. `npm install` → `npm run dev` (http://localhost:8765) 로 데모 모드 동작 확인
- [ ] 2. webhook URL은 코드에 하드코딩하지 않는다. 우선순위:
      설정(⚙) 입력값 → `VITE_N8N_WEBHOOK` 환경변수 → `<meta name="n8n-webhook">` 폴백
- [ ] 3. `npm run build` → `dist/` 생성, `npm run preview` 로 프로덕션 번들 검증
- [ ] 4. GitHub 저장소 push → Vercel **Add New → Project** 로 Import
- [ ] 5. Vercel Framework Preset = **Vite** 자동 인식 (Build `npm run build`, Output `dist`)
- [ ] 6. Vercel **Environment Variables** 에 `VITE_N8N_WEBHOOK` = n8n **Production** URL
      (`/webhook/<id>`, `-test` 아님). 값 변경 시 재배포 필요
- [ ] 7. Deploy → `https://<프로젝트>.vercel.app`. 이후 `main` push마다 자동 재배포
- [ ] 8. (선택) 커스텀 도메인 + HTTPS 연결

### n8n 연동
- [ ] 9. 워크플로우 **Active** 토글 ON
- [ ] 10. LLM / GPT-image API 키는 n8n Credentials 로만 관리 (하드코딩 금지)
- [ ] 11. Webhook 노드 **Allowed Origins (CORS)** 에 배포 도메인 + `http://localhost:8765` 추가
- [ ] 12. Respond to Webhook: 바이너리 이미지(`Content-Type: image/*`) 반환,
      헤더에 `Access-Control-Expose-Headers: X-Core-Output`
- [ ] 13. Google Sheets 시트 ID / 탭 이름 / 헤더 행 구성 확인 (append + update 대상)

### 검증
- [ ] 14. `curl -i -X POST <URL> -H 'Content-Type: application/json' -d '{...}'` 로
      바이너리 이미지 응답 확인 (CORS 배제한 워크플로우 단독 검증)
- [ ] 15. 배포 사이트에서 실제 입력값으로 엔드투엔드 재검증 (이미지 표시 + 다운로드)
- [ ] 16. (선택) 에러 트래킹(Sentry) + n8n 실행 로그/알림(Slack) 연동

---

## 8. 절대 규칙 (Claude Code가 항상 지켜야 할 것)

1. 사용자에게 노출되는 UI/텍스트에 내부 카테고리 매핑을 절대 표시하지 않는다.
2. Core Prompt와 output_final Prompt는 서로 독립된 n8n 노드로 분리하여 재사용성을 유지한다.
3. 스타일시트에 없는 내용을 인포그래픽 이미지 생성 단계에서 임의로 창작하지 않는다.
   Core Output의 문구는 요약 없이 그대로 이미지에 실린다.
4. API 키, webhook URL 등 민감정보는 코드에 하드코딩하지 않고 환경변수/Credentials로만 관리한다.
5. 각 단계 산출물은 다음 단계 입력으로 그대로 체이닝한다:
   답변 → Core Output → Google Sheets 저장 → 인포그래픽 이미지 → 웹훅 이미지 응답.
6. 웹훅 성공 응답은 항상 바이너리 이미지이며, 실패는 JSON(`{ error }`) 또는 4xx/5xx로 구분한다.
