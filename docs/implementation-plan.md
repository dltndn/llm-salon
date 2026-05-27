# 구현 계획: LLM-Salon MVP

> **Source of truth:** `docs/specs/` (00–10).
> AGENTS.md §9의 spec-first 원칙에 따라 본 계획서의 모든 결정 인용은 `docs/specs/`를 단일 출처로 사용한다.
> 예외: Phase 0–7의 단계 순서는 `docs/initial-plannings/tech-spec.md` §16(Implementation Phases)을 그대로 따르고, "미해결 질문" 섹션은 specs에 의도적으로 부재하므로 tech-spec §17을 직접 인용한다.

## 개요

`docs/specs/`에 정의된 결정사항을 단일 NestJS 프로세스 기반 로컬 토론 오케스트레이터로 구현하기 위한 작업 분해 문서이다. 데이터 모델 → 도메인 로직 → SSR/SSE → LLM 통합 → MCP → 보고서 파이프라인 순으로, 매 단계가 독립적으로 검증 가능한 수직 슬라이스로 구성된다.

## 아키텍처 결정

- **단일 프로세스/단일 사용자/127.0.0.1 바인딩**: `00-overview.md` Key Invariants, `01-architecture.md` Process Model. 데몬·외부 노출·다중 사용자 격리는 비목표.
- **다중 토픽을 MVP부터 지원**: `00-overview.md` MVP Scope. PRD §5.2 단일 토픽 전제는 본 결정으로 대체.
- **Prisma + PostgreSQL ENUM 매핑**: `04-database.md` General Policies, `02-domain-model.md` ENUMs.
- **모든 도메인 객체에 Human/Anonymous 두 직렬화 경로**: `02-domain-model.md` Anonymization Policy, `06-mcp.md` Anonymization Contract.
- **LLM 시스템 프롬프트 영어 고정 + 보고서 출력 언어만 환경변수로 가변**: `07-llm-integration.md` System Prompt / Report Output Language.
- **API key는 `~/.llm-salon/.env`만**: `08-security.md` API Key Principles. 셸 rc 자동 수정/DB 보관 금지.
- **CLI는 동일 NestJS 컨텍스트 공유 (`nest-commander`)**: `01-architecture.md` Technology Stack, `09-cli.md` Commands.
- **EventEmitter2 → SSE 멀티플렉서**: `02-domain-model.md` Domain Events, `03-modules.md` `sse/`.
- **트랜잭션 + 행 잠금으로 발언권 일관성 보장 (`SELECT … FOR UPDATE`)**: `02-domain-model.md` Concurrency Control.

---

## Execution Rules

- Read `docs/implementation-logs/README.md`.
- Follow dependency order strictly. Do not start downstream milestones before their prerequisites are verified.
- Prefer surgical changes inside the owning domain.
- Write or update tests before implementing or changing business logic.
- Before starting a task, read the relevant execution logs for the current phase and its dependency tasks.
- If previous execution logs contain still-valid constraints, deferred work, or dependency-sensitive findings, reflect them in the current task.
- After finishing a task and verifying it, create a commit for that task before moving on.
- After finishing a task, leave a handoff-oriented execution log under `docs/implementation-logs/` for the current phase.
- Every milestone must define:
  - test-first tasks
  - implementation tasks
  - verification tasks
- Do not start broad parallel work until file ownership boundaries are explicit.
- After each major milestone, run a review pass for correctness, regression risk, and missing coverage.

---

## 작업 목록

> Phase 0–7 분할은 tech-spec §16의 권고 순서를 그대로 사용한다(specs에는 단계 순서 결정이 의도적으로 부재).

### Phase 0: 저장소 부트와 인프라

#### Task 0.1: pnpm 워크스페이스와 NestJS 스캐폴딩

**Description:** `pnpm`/Node 20/TypeScript strict 환경에서 NestJS 10 + Express 어댑터 기본 골격을 만든다(`01-architecture.md` Technology Stack). `nest build`로 단일 dist 산출이 가능해야 한다.

**Acceptance criteria:**
- [ ] `package.json`에 AGENTS.md §11의 명령(`start:dev`, `build`, `test`, `lint`, `typecheck`) 정의.
- [ ] `tsconfig.json` strict 모드 활성화.
- [ ] `pnpm install && pnpm build` 성공.
- [ ] `src/main.ts`에서 `127.0.0.1` 바인딩(기본 포트 4477) — `01-architecture.md` Port.

**Verification:**
- [ ] `pnpm typecheck` 통과.
- [ ] `pnpm build` 성공.
- [ ] `pnpm run start:dev` 후 `curl http://127.0.0.1:4477/health` 200.

**Dependencies:** None

**Files likely touched:**
- `package.json`, `tsconfig.json`, `nest-cli.json`
- `src/main.ts`, `src/app.module.ts`
- `src/http/health.controller.ts`

**Estimated scope:** S

#### Task 0.2: 환경 설정 모듈과 `LLM_SALON_HOME` 부트 보장

**Description:** `@nestjs/config`로 `~/.llm-salon/.env`를 로드하고, 디렉터리·`.env.example` 복사·`LLM_SALON_HOME` 오버라이드를 구현한다(`08-security.md` .env File, `01-architecture.md` User Data Directory).

**Acceptance criteria:**
- [ ] `LLM_SALON_HOME` 미지정 시 `~/.llm-salon/` 자동 생성.
- [ ] `.env` 부재 시 패키지 동봉 `.env.example` 복사 후 stdout 안내(`08-security.md` Lifecycle).
- [ ] OS 환경변수가 `.env` 값보다 우선.
- [ ] `LLM_SALON_PORT`, `LLM_SALON_CONTEXT_PROFILE`, `LLM_SALON_OUTPUT_LANGUAGE` 화이트리스트 검증(잘못된 값은 기본값 폴백 + 경고 로그) — `07-llm-integration.md` Fallback.

**Verification:**
- [ ] 단위 테스트: 잘못된 ENUM 값 → 기본값 폴백.
- [ ] 통합 테스트: 임시 디렉터리에서 첫 부트 시 `.env`가 생성되는지 검증.

**Dependencies:** 0.1

**Files likely touched:**
- `src/config/config.module.ts`, `src/config/env.schema.ts`
- `.env.example`
- `src/config/__tests__/env.schema.spec.ts`

**Estimated scope:** S

#### Task 0.3: PostgreSQL/Prisma 부트와 자동 마이그레이션

**Description:** Prisma 5 클라이언트, `prisma/schema.prisma` 초기 파일(빈 모델), 부트 시 `prisma migrate deploy` 자동 실행 옵션(`--auto-migrate`, 기본 on)을 구현한다(`04-database.md` General Policies).

**Acceptance criteria:**
- [ ] `pnpm prisma generate` 성공.
- [ ] `pnpm prisma migrate dev --name 0001_init` 빈 마이그레이션 생성.
- [ ] 부트 시 `--no-auto-migrate`로 자동 마이그레이션 스킵 가능(`09-cli.md` Boot Flow step 5).
- [ ] `pgcrypto` 확장 활성화 마이그레이션 포함(`04-database.md` General Policies).

**Verification:**
- [ ] 로컬 PostgreSQL에 대해 `pnpm prisma migrate deploy` 멱등 실행.

**Dependencies:** 0.1

**Files likely touched:**
- `prisma/schema.prisma`
- `prisma/migrations/0001_init/migration.sql`
- `src/prisma/prisma.module.ts`, `src/prisma/prisma.service.ts`

**Estimated scope:** S

### Checkpoint: Phase 0
- [ ] `pnpm typecheck && pnpm lint && pnpm build` 모두 통과.
- [ ] 빈 NestJS가 4477에서 부팅, `/health` 응답.
- [ ] `~/.llm-salon/.env` 자동 생성 및 Prisma 연결 확인.

---

### Phase 1: 데이터 모델과 핵심 CRUD

#### Task 1.1: Prisma 스키마 — ENUM과 7개 테이블

**Description:** `02-domain-model.md` ENUMs의 9종과 `04-database.md` Tables의 `projects`, `topics`, `participants`, `documents`, `messages`, `turns`, `reports`를 스키마/마이그레이션으로 작성한다.

**Acceptance criteria:**
- [ ] 모든 FK는 `ON DELETE CASCADE`(`04-database.md` General Policies).
- [ ] `participants` partial UNIQUE 제약(`participant_type`별) 포함(`04-database.md` Additional constraints).
- [ ] `04-database.md` Indexes의 4종 모두 포함.
- [ ] `messages.content` 길이 ≤ 32KB CHECK 제약.

**Verification:**
- [ ] 마이그레이션을 신규 DB에 적용 후 `prisma db pull`로 차이 없음.
- [ ] Prisma 단위 테스트: 익명 이름 UNIQUE 위반 시 에러.

**Dependencies:** 0.3

**Files likely touched:**
- `prisma/schema.prisma`
- `prisma/migrations/0002_domain_tables/migration.sql`

**Estimated scope:** M

#### Task 1.2: Project/Topic CRUD 서비스와 REST

**Description:** `POST/GET /api/projects`, `POST /api/projects/:slug/topics`를 구현한다(`05-api.md` REST API). slug 생성·중복 검증·기본 phase 세팅 포함.

**Acceptance criteria:**
- [ ] 프로젝트 생성 시 `status=created`, slug UNIQUE(`04-database.md` `projects`).
- [ ] 토픽 생성 시 `phase=preparing`, `mode=consensus` 기본(`04-database.md` `topics`).
- [ ] DTO 검증(`class-validator`)으로 잘못된 입력 → 400.

**Verification:**
- [ ] Supertest 통합 테스트: CRUD 왕복 확인(`10-testing.md` REST + SSE).

**Dependencies:** 1.1

**Files likely touched:**
- `src/projects/{projects.module,projects.service,projects.controller}.ts`
- `src/topics/{topics.module,topics.service,topics.controller}.ts`
- `test/projects.e2e-spec.ts`

**Estimated scope:** M

#### Task 1.3: Participant 등록과 익명 이름 부여

**Description:** `participants` 등록 엔드포인트(`05-api.md`)와 트랜잭션 내 `Member A/B/…` 발급 로직(`02-domain-model.md` Anonymous Name Assignment). `removed`도 카운트에 포함.

**Acceptance criteria:**
- [ ] 동일 프로젝트 내 익명 이름 충돌 없이 순차 발급.
- [ ] 26명 초과 시 `Member AA` 확장.
- [ ] `app` 타입의 `(client_name, model_name)` 중복 등록 → `DuplicateAppRegistrationError` (409) — `05-api.md` Error Handling.

**Verification:**
- [ ] 단위 테스트(표 기반): 1~30명 등록 시 익명 이름 시퀀스(`10-testing.md` Round-Robin Algorithm 패턴 응용).
- [ ] 통합 테스트: 동시 등록 2건이 race 없이 서로 다른 이름 획득.

**Dependencies:** 1.2

**Files likely touched:**
- `src/participants/{participants.module,participants.service,participants.controller}.ts`
- `src/participants/__tests__/anonymous-name.spec.ts`

**Estimated scope:** M

#### Task 1.4: CLI `start` / `project list` / `env init`

**Description:** `nest-commander`로 CLI를 구현한다(`09-cli.md` Commands, Boot Flow). 포트 자동 증가 탐색(최대 10회), 잠금 파일, 브라우저 자동 실행 포함.

**Acceptance criteria:**
- [ ] `llm-salon start <project>`가 프로젝트 생성/조회 후 서버 부트(`09-cli.md` Boot Flow).
- [ ] `~/.llm-salon/server.lock`에 PID/포트 기록, 중복 부트 차단(`09-cli.md` Single-Instance Lock).
- [ ] `llm-salon project list`는 서버가 떠 있으면 HTTP, 없으면 일회성 부트.
- [ ] `llm-salon env init`은 `.env.example` 복사만 수행(`09-cli.md` Commands).

**Verification:**
- [ ] 로컬 수동 검증: `start` → 브라우저 오픈 + URL stdout 출력(`09-cli.md` Boot Flow step 8).
- [ ] 잠금 파일 점유 시 두 번째 `start`가 명확한 에러로 종료.

**Dependencies:** 1.2, 0.2

**Files likely touched:**
- `src/cli/{cli.module,start.command,project-list.command,env-init.command}.ts`
- `src/cli/server-lock.ts`

**Estimated scope:** M

### Checkpoint: Phase 1
- [ ] CLI로 프로젝트/토픽/참여자 생성 가능.
- [ ] DB에 익명 이름이 일관되게 발급된다.
- [ ] `pnpm test` 그린.

---

### Phase 2: 익명화 인프라와 발언권 엔진

#### Task 2.1: Human/Anonymous DTO와 가드

**Description:** 모든 도메인 엔티티에 `*HumanDto`/`*AnonymousDto` 페어를 만들고, 응답 인터셉터로 audience 분기를 강제한다(`02-domain-model.md` Anonymization Policy, `03-modules.md` `common/`, `06-mcp.md` Anonymization Contract).

**Acceptance criteria:**
- [ ] `audience=human|anonymous` 쿼리 또는 라우트 메타데이터로 직렬화 결정(`05-api.md` REST API).
- [ ] Anonymous 응답에 `display_name|provider_name|client_name|model_name` 출현 시 throw(`06-mcp.md` Anonymization Contract).
- [ ] 프롬프트 빌더는 `AnonymousDto`만 받도록 타입 강제(`03-modules.md` `prompt/`).

**Verification:**
- [ ] 단위 테스트(블랙리스트/화이트리스트 양방향) — `10-testing.md` Anonymization Guard.
- [ ] e2e: REST `audience=anonymous` 응답 스냅샷 검사.

**Dependencies:** 1.3

**Files likely touched:**
- `src/common/dto/{human,anonymous}.ts`
- `src/common/interceptors/anonymous-guard.interceptor.ts`
- `src/common/__tests__/anonymous-guard.spec.ts`

**Estimated scope:** M

#### Task 2.2: 라운드 로빈 발언권 엔진

**Description:** `02-domain-model.md` Round-Robin Turn Order 알고리즘대로 `next participant` 결정과 `turns` 행 갱신, skip 처리, 신규 참여자는 다음 라운드 합류 규칙을 구현.

**Acceptance criteria:**
- [ ] `join_order` 기반 정렬, 활성/대기만 후보.
- [ ] 라운드 경계 넘을 때 `round_index += 1`.
- [ ] 비활성 참여자는 자동 skip + `turn.status='skipped'` 기록.
- [ ] 라운드 진행 중 등장한 신규 참여자는 다음 라운드부터 후보.

**Verification:**
- [ ] 표 기반 단위 테스트(추가/제거/재가입 시나리오) — `10-testing.md` Round-Robin Algorithm.

**Dependencies:** 1.3

**Files likely touched:**
- `src/turns/{turns.module,turn-engine.service}.ts`
- `src/turns/__tests__/turn-engine.spec.ts`

**Estimated scope:** M

#### Task 2.3: 메시지 제출 트랜잭션과 상태 머신

**Description:** `POST /api/projects/:slug/topics/:topicId/messages` 구현(`05-api.md`). `SELECT … FOR UPDATE`로 `turns` 잠금 → 발언권 검증 → 메시지 INSERT → 다음 턴 결정 → phase 자동 전이 → 도메인 이벤트 발행(`02-domain-model.md` Concurrency Control / Topic Phase State Machine / Domain Events).

**Acceptance criteria:**
- [ ] 발언권 없는 호출 → 409 `WrongTurnError`(`05-api.md` Error Handling).
- [ ] `preparing → debating` 자동 전이(첫 메시지).
- [ ] `max_turns` 또는 `max_rounds` 도달 시 `debating → drafting` 자동 전이.
- [ ] 단일 트랜잭션 내 모든 변경 + 커밋 후 1회만 이벤트 발행.

**Verification:**
- [ ] 회귀 테스트: 동시 두 호출 중 한쪽 409(`10-testing.md` Regression Tests).
- [ ] 회귀 테스트: 메시지 1건당 SSE 이벤트 정확히 1회.

**Dependencies:** 2.1, 2.2

**Files likely touched:**
- `src/messages/{messages.module,messages.service,messages.controller}.ts`
- `src/turns/topic-state-machine.service.ts`
- `src/events/domain-events.ts`
- `test/messages.e2e-spec.ts`

**Estimated scope:** M

### Checkpoint: Phase 2
- [ ] 익명화 가드 단위 테스트 모두 통과.
- [ ] 라운드 로빈/상태 머신 표 기반 테스트 그린.
- [ ] 메시지 제출 → 다음 턴 결정 e2e 통과.

---

### Phase 3: SSE와 EJS 대시보드

#### Task 3.1: 도메인 이벤트 → SSE 멀티플렉서

**Description:** `EventEmitter2` 구독 → 프로젝트별 RxJS `Subject` → `/projects/:slug/events` SSE 엔드포인트(`03-modules.md` `sse/`, `05-api.md` SSE Channel). `Last-Event-ID` 재연결 시 최근 100건 큐에서 재전송.

**Acceptance criteria:**
- [ ] 이벤트 타입은 `05-api.md` Event Types 표와 동일.
- [ ] 프로젝트별 큐 100건 상한.
- [ ] 재연결 시 `Last-Event-ID` 이후 이벤트만 재전송.

**Verification:**
- [ ] Supertest로 SSE 스트림 수신 + 재연결 시나리오.

**Dependencies:** 2.3

**Files likely touched:**
- `src/sse/{sse.module,sse.controller,sse-broadcaster.service}.ts`
- `src/events/event-bus.ts`
- `test/sse.e2e-spec.ts`

**Estimated scope:** M

#### Task 3.2: EJS 대시보드 SSR + vanilla JS/CSS

**Description:** `GET /`(프로젝트 목록), `GET /projects/:slug`(대시보드)를 EJS로 렌더링(`05-api.md` Page Routes / EJS Page Layout). 토픽 셀렉터(`?topic=`), 참여자 패널, 메시지 영역, SSE 클라이언트 스크립트 포함.

**Acceptance criteria:**
- [ ] EJS 템플릿이 Human DTO를 사용해 `display_name` 노출.
- [ ] vanilla JS가 SSE 구독 + DOM append + 자동 스크롤.
- [ ] 페이지네이션·다크모드 없음(`05-api.md` Responsive Scope, 비목표).

**Verification:**
- [ ] 수동 점검: 메시지 제출 시 다른 탭에 즉시 반영.

**Dependencies:** 3.1, 1.4

**Files likely touched:**
- `src/http/views/{layout,projects-index,project-dashboard}.ejs`
- `public/{styles.css,dashboard.js}`
- `src/http/views.controller.ts`

**Estimated scope:** M

### Checkpoint: Phase 3
- [ ] 브라우저 자동 실행 → 대시보드 렌더링 → 메시지 SSE 갱신 확인.
- [ ] `pnpm test` 그린, 회귀 테스트(메시지 1건 = 이벤트 1회) 유지.

---

### Phase 4: LLM 어댑터와 컨텍스트 빌더

#### Task 4.1: LlmAdapter 인터페이스와 OpenAI 어댑터

**Description:** `07-llm-integration.md` LLM Adapter Interface 정의 + OpenAI thin wrapper. 타임아웃 60s, 5xx 지수 백오프 최대 3회(`07-llm-integration.md` Call Policy). API key는 어댑터 내부에서만 `process.env` 참조(`08-security.md` API Key Principles).

**Acceptance criteria:**
- [ ] OpenAI SDK 호출이 mock으로 결정적 응답을 반환(평소 테스트) — `10-testing.md` LLM Adapter Tests.
- [ ] 5xx 발생 시 3회까지 재시도, 그 이상은 `ProviderCallFailedError`.
- [ ] API key 누락 시 `MissingApiKeyError`.

**Verification:**
- [ ] 단위 테스트: 재시도/타임아웃/마스킹.
- [ ] `LLM_SALON_E2E=1`에서 실제 호출 1건 통과.

**Dependencies:** 0.2

**Files likely touched:**
- `src/llm/{llm.module,llm-adapter.interface,openai.adapter}.ts`
- `src/llm/__tests__/openai.adapter.spec.ts`

**Estimated scope:** M

#### Task 4.2: 모델 메타와 컨텍스트 정책

**Description:** `llm/models.ts`에 모델별 윈도우/권장 출력 토큰을 하드코딩(`07-llm-integration.md` Per-Model Token Metadata). `llm/context-policy.ts`에 Context Length Policy 표를 단일 source-of-truth로 작성.

**Acceptance criteria:**
- [ ] 프로파일별 토큰 한도/문서 한도/메시지 보존 비율 노출.
- [ ] 환경변수 폴백/마스킹은 0.2 모듈 활용.

**Verification:**
- [ ] 단위 테스트: 프로파일별 상한 계산(`10-testing.md` Context Profile Policy).

**Dependencies:** 0.2

**Files likely touched:**
- `src/llm/{models,context-policy}.ts`
- `src/llm/__tests__/context-policy.spec.ts`

**Estimated scope:** S

#### Task 4.3: Anthropic / Google 어댑터 연결과 모델 메타 확장

**Description:** `07-llm-integration.md` Supported Providers 표(`anthropic` → `AnthropicAdapter` / `google` → `GoogleAdapter`)에 따라 두 어댑터를 4.1의 `LlmAdapter` 인터페이스에 맞춰 thin wrapper로 구현. 공식 SDK(`@anthropic-ai/sdk`, `@google/generative-ai`) 사용. 4.1과 동일한 호출 정책(60s 타임아웃, 5xx 지수 백오프 최대 3회, 4xx 재시도 금지) 적용. API key는 어댑터 내부에서 `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY`만 참조(`08-security.md` API Key Principles). `LlmModule` provider 레지스트리에서 `providerName` 키로 라우팅 가능하도록 등록. 4.2에서 작성한 `llm/models.ts`에 두 provider의 대표 모델 윈도우 / 권장 출력 토큰 메타를 추가.

**Acceptance criteria:**
- [ ] `AnthropicAdapter` / `GoogleAdapter`가 `LlmAdapter` 인터페이스를 만족하고 `providerName`이 각각 `anthropic` / `google`.
- [ ] 두 어댑터 모두 mock SDK로 결정적 응답 반환(`10-testing.md` LLM Adapter Tests).
- [ ] 5xx/네트워크 오류에 대해 최대 3회 재시도, 그 이상은 `ProviderCallFailedError`. 4xx는 즉시 실패.
- [ ] 해당 API key 누락 시 `MissingApiKeyError` (`08-security.md` Boot-Time Provider Validation 호환).
- [ ] Provider 레지스트리에서 문자열 키(`openai` / `anthropic` / `google`)로 어댑터 인스턴스를 조회할 수 있다.
- [ ] `llm/models.ts`에 Anthropic / Google 대표 모델의 토큰 윈도우와 권장 출력 토큰이 추가되고 4.2의 프로파일 계산이 그대로 동작.

**Verification:**
- [ ] 단위 테스트: 두 어댑터의 재시도/타임아웃/키 마스킹.
- [ ] 단위 테스트: provider 레지스트리 조회와 `providerName` 매핑.
- [ ] 단위 테스트: `models.ts` 신규 모델에 대한 프로파일별 상한 계산.
- [ ] `LLM_SALON_E2E=1`에서 키가 있을 때 각 provider 실제 호출 1건 통과(있을 때만).

**Dependencies:** 4.1, 4.2

**Files likely touched:**
- `src/llm/{anthropic.adapter,google.adapter}.ts`
- `src/llm/llm.module.ts` (provider 레지스트리 갱신)
- `src/llm/models.ts` (Anthropic / Google 모델 메타 추가)
- `src/llm/__tests__/{anthropic.adapter,google.adapter,provider-registry}.spec.ts`

**Estimated scope:** M

#### Task 4.4: 컨텍스트 빌더 + 익명화 결합

**Description:** `07-llm-integration.md` Context Builder의 8단 구조로 LLM 입력을 빌드. 시스템 상태 블록(step 2)과 System Prompt(영어 고정) 포함. `AnonymousDto`만 입력 허용. 메시지 보존 한도 초과 시 Previous Message Overflow 정책에 따라 요약 단계 우선, 실패 시 슬라이딩 윈도우. 요약 호출은 **첫 번째 참여자**(`join_order` 최솟값, `removed` 제외)가 담당하고 `provider` 타입일 때만 동기 호출, `app` 타입이면 즉시 슬라이딩 윈도우 폴백. 요약 시스템 프롬프트는 `prompt/summary-prompt.ts`에 단일 source-of-truth로 둔다.

**Acceptance criteria:**
- [ ] 빌더 출력에 휴먼 식별자 정규식 매치 → throw.
- [ ] 시스템 프롬프트 영어 고정.
- [ ] 첨부 문서 한도 초과 등록은 `DocumentTooLargeError`(`07-llm-integration.md` Document Size Rejection / `05-api.md` Error Handling).
- [ ] 첫 번째 참여자가 `provider` 타입일 때만 요약 호출 수행, `app` 타입이면 슬라이딩 윈도우 폴백.
- [ ] 요약 호출 빈도는 토픽당 `N = max(2, max_rounds // 4)` 라운드에 1회 이하.

**Verification:**
- [ ] 단위 테스트: 휴먼 식별자 누출 방지.
- [ ] 단위 테스트: 요약 호출 실패 시 슬라이딩 윈도우 폴백 + placeholder 삽입.
- [ ] 단위 테스트: 첫 번째 참여자 타입(`provider`/`app`)에 따른 요약 경로 분기.

**Dependencies:** 4.1, 4.2, 4.3, 2.1

**Files likely touched:**
- `src/prompt/{context-builder.service,system-prompt,summary-prompt,summarizer.service}.ts`
- `src/prompt/__tests__/*.spec.ts`

**Estimated scope:** M

#### Task 4.5: Provider 참여자 등록과 자동 발언

**Description:** `POST /api/projects/:slug/participants`의 provider 분기 + `llm-salon provider add` CLI(`09-cli.md` Commands). 발언권이 본인일 때 컨텍스트 빌더 → 어댑터 호출 → 메시지 제출 트랜잭션 위임.

**Acceptance criteria:**
- [ ] Provider 등록 시 `.env`에 해당 키가 없으면 즉시 `MissingApiKeyError`(`08-security.md` Boot-Time Provider Validation).
- [ ] 자동 발언이 일반 메시지 제출 경로(2.3)를 그대로 사용.
- [ ] 호출 실패 시 해당 턴 `skipped` + SSE 알림(`07-llm-integration.md` Call Policy).

**Verification:**
- [ ] mock 어댑터로 자동 발언 e2e: 두 명 provider가 라운드 로빈으로 발언.

**Dependencies:** 4.4, 3.1

**Files likely touched:**
- `src/participants/provider-participant.service.ts`
- `src/cli/provider-add.command.ts`
- `src/turns/auto-speak.service.ts`
- `test/auto-speak.e2e-spec.ts`

**Estimated scope:** M

### Checkpoint: Phase 4
- [ ] OpenAI mock 기반 자동 발언이 한 라운드 완주.
- [ ] 익명화 가드 회귀 테스트 그린.
- [ ] `LLM_SALON_E2E=1`로 실제 키 1건 호출 검증(있을 때만).

---

### Phase 5: MCP/stdio 인터페이스

#### Task 5.1: MCP stdio 서버와 HTTP 위임

**Description:** `llm-salon mcp` 명령이 `@modelcontextprotocol/sdk`의 stdio transport로 동작(`06-mcp.md` Transport, `09-cli.md` Commands). 모든 도구는 내부적으로 HTTP API에 위임.

**Acceptance criteria:**
- [ ] 서버 미기동 시 명확한 에러 응답.
- [ ] JSON-RPC 라운드트립 가능.

**Verification:**
- [ ] 자식 프로세스 spawn 통합 테스트로 `get_server_status` 왕복(`10-testing.md` MCP).

**Dependencies:** 4.5

**Files likely touched:**
- `src/mcp/{mcp.module,stdio-server.ts,http-bridge.ts}`
- `src/cli/mcp.command.ts`
- `test/mcp.e2e-spec.ts`

**Estimated scope:** M

#### Task 5.2: MCP 도구 + 익명화 가드

**Description:** `06-mcp.md` Tools의 도구(`create_project`, `get_server_status`, `get_project_status`, `join_project`, `create_topic`, `add_document`, `get_context`, `get_turn`, `is_my_turn`, `submit_message`, `get_report_status`)를 구현. 변동성 응답에 `serverTime`/`topicVersion` 부가(`06-mcp.md` Response Staleness Detection).

**Acceptance criteria:**
- [ ] 응답 페이로드에 휴먼 식별자 절대 미포함(가드 통과) — `06-mcp.md` Anonymization Contract.
- [ ] `submit_message` 발언권 위반 시 `WRONG_TURN` + 현재 차례의 익명 이름 반환(`06-mcp.md` Debate Tools).
- [ ] `add_document`는 텍스트 본문 인라인만 허용, 바이너리/파일경로 거부.

**Verification:**
- [ ] 도구별 단위 테스트.
- [ ] e2e: `is_my_turn`이 발언권 보유자에게만 true(`10-testing.md` Regression Tests).

**Dependencies:** 5.1, 2.1

**Files likely touched:**
- `src/mcp/tools/*.ts`
- `src/mcp/errors.ts`
- `src/mcp/__tests__/*.spec.ts`

**Estimated scope:** L

### Checkpoint: Phase 5
- [ ] LLM 앱이 MCP를 통해 join → context → submit 한 사이클 완료(스크립트로 자동화).
- [ ] 익명화 가드 회귀 테스트 유지.

---

### Phase 6: 보고서 파이프라인

#### Task 6.1: 보고서 작성자 결정 + drafting 진입

**Description:** `debating → drafting` 자동 전이(`02-domain-model.md` Topic Phase State Machine) 시 `reporter_participant_id`를 결정(MVP 정책: `join_order` 최소 활성 provider)하고 보고서 초안 생성을 큐잉.

**Acceptance criteria:**
- [ ] `topics.reporter_participant_id` 채워짐(`04-database.md` `topics`).
- [ ] `report.status=drafting`, 도메인 이벤트 발행(`02-domain-model.md` Domain Events).

**Verification:**
- [ ] e2e: max_turns 도달 → drafting 진입 + reporter 지정.

**Dependencies:** 4.5

**Files likely touched:**
- `src/reports/{reports.module,reports.service,reporter-selector.ts}`
- `test/reports-drafting.e2e-spec.ts`

**Estimated scope:** S

#### Task 6.2: 초안/피드백/최종 보고서 LLM 호출

**Description:** drafting/reviewing/finalizing 단계 각각에 대한 시스템 프롬프트 변형. 보고서 작성자 모델 호출에 한해 `07-llm-integration.md` Report Output Language의 한 줄 추가. `LLM_SALON_OUTPUT_LANGUAGE`를 `llm/output-languages.ts` 매핑으로 변환.

**Acceptance criteria:**
- [ ] `reviewing → finalizing`은 모든 활성 참여자 피드백 1회 완료 시 자동(`02-domain-model.md` Topic Phase State Machine).
- [ ] `finalizing → finalized`는 최종본 파일 저장 완료 시 자동.
- [ ] 잘못된 `LLM_SALON_OUTPUT_LANGUAGE` → `en` 폴백 + 경고 로그(`07-llm-integration.md` Fallback).

**Verification:**
- [ ] 단위 테스트: 매 단계 시스템 프롬프트 스냅샷.
- [ ] e2e: 토픽 1건이 finalized까지 진행되는 mock 시나리오.

**Dependencies:** 6.1, 4.4

**Files likely touched:**
- `src/reports/report-pipeline.service.ts`
- `src/llm/output-languages.ts`
- `src/prompt/report-prompts.ts`
- `test/report-pipeline.e2e-spec.ts`

**Estimated scope:** L

#### Task 6.3: 보고서 파일 저장과 경로 가드

**Description:** 최종본을 `LLM_SALON_HOME/projects/<slug>/reports/`에 Markdown으로 저장(`01-architecture.md` User Data Directory). `path.resolve` + base prefix 검증(`08-security.md` File System Boundaries). `reports.file_path` 갱신.

**Acceptance criteria:**
- [ ] 베이스 경로 외부로의 traversal(`../`) 차단.
- [ ] 같은 토픽 재실행 시 파일명 충돌 방지(타임스탬프 접미).

**Verification:**
- [ ] 단위 테스트: traversal 입력 거부.

**Dependencies:** 6.2

**Files likely touched:**
- `src/storage/local-storage.service.ts`
- `src/storage/__tests__/local-storage.spec.ts`

**Estimated scope:** S

### Checkpoint: Phase 6
- [ ] 한 토픽이 `preparing → finalized`까지 mock LLM으로 완주.
- [ ] 보고서 파일이 지정 경로에 저장, DB `reports.file_path` 일치.

---

### Phase 7: 문서화와 마감

#### Task 7.1: 영문 README + 사용자 가이드

**Description:** 설치/부팅/`.env` 채우기/`provider add`/MCP 등록 프롬프트(`06-mcp.md` LLM App Registration)를 영문 README에 정리. 단일 사용자/127.0.0.1/외부 노출 비목표 명시.

**Acceptance criteria:**
- [ ] README가 `00-overview.md` Key Invariants, `05-api.md` Authentication, `08-security.md` API Key Principles의 제약을 모두 명시.
- [ ] `chmod 600 ~/.llm-salon/.env` 권장 안내(`08-security.md`).

**Verification:**
- [ ] 신규 사용자가 README만 보고 `start` → 첫 토픽 발언까지 가능(셀프 점검).

**Dependencies:** 6.3

**Files likely touched:**
- `README.md`
- `docs/user-guide.md`

**Estimated scope:** S

#### Task 7.2: 로깅 마스킹과 에러 매핑 점검

**Description:** `08-security.md` API Key Principles의 마스킹 인터셉터, `05-api.md` Error Handling의 도메인 에러 → HTTP/MCP 매핑 표 일치성 점검.

**Acceptance criteria:**
- [ ] 모든 도메인 에러가 HTTP 4xx/5xx와 MCP error code에 1:1 매핑(`05-api.md` Error Handling, `06-mcp.md` 응용).
- [ ] API key 패턴이 로그/SSE 페이로드에 출현하지 않음(테스트 강제).

**Verification:**
- [ ] 단위 테스트: 마스킹 인터셉터 입출력.
- [ ] 회귀 테스트: 모든 도메인 에러 케이스에 대한 매핑 표.

**Dependencies:** 5.2, 6.3

**Files likely touched:**
- `src/security/masking.interceptor.ts`
- `src/common/exception-filter.ts`
- `src/mcp/errors.ts`

**Estimated scope:** S

### Checkpoint: Complete
- [ ] tech-spec §16의 Phase 0–7 산출물 모두 충족.
- [ ] `pnpm typecheck && pnpm lint && pnpm test && pnpm build` 모두 통과.
- [ ] 한 토픽 e2e(부팅 → 참여자 등록 → 발언 → drafting → finalized) 수동 검증 완료.
- [ ] 사람 리뷰 후 머지.

---

## 리스크와 완화

| 리스크 | 영향 | 완화 |
|---|---|---|
| 발언권 동시성 버그로 중복 발언 | High | `SELECT … FOR UPDATE` + 회귀 테스트(동시 호출 409) — `02-domain-model.md` Concurrency Control / `10-testing.md` Regression Tests / Task 2.3 |
| 익명화 누출(휴먼 식별자가 LLM/MCP 응답에 노출) | High | 화이트리스트 인터셉터 + 정규식 검사 + 양방향 단위 테스트 — `02-domain-model.md` Anonymization Policy / `06-mcp.md` Anonymization Contract / Task 2.1, 4.4, 5.2 |
| 컨텍스트 길이 초과로 LLM 호출 실패 | Med | 프로파일 기반 상한 + 요약 단계 + 슬라이딩 윈도우 폴백 — `07-llm-integration.md` Context Length Policy / Task 4.2, 4.4 |
| `.env` 누락/오타로 부팅 후 첫 호출에서만 실패 | Med | 부트 시 환경변수 점검 후 메모리에 캐시 + `provider add` 실패 시 명확한 안내 — `08-security.md` Boot-Time Provider Validation / Task 0.2, 4.5 |
| Prisma 마이그레이션 실수로 ENUM/제약 누락 | Med | 1.1에서 `prisma db pull` 차이 검증 + CI typecheck |
| MCP 자식 프로세스가 서버 미기동 시 무한 대기 | Low | 5.1에서 명확한 에러 + 타임아웃 — `06-mcp.md` Transport |
| 다중 OS/셸에서 브라우저 자동 실행 실패 | Low | URL을 stdout에도 출력 — `09-cli.md` Boot Flow step 8 / Task 1.4 |

---

## 미해결 질문

> specs는 결정사항만 담는 정책이므로 미해결 항목은 tech-spec §17을 직접 인용한다.

- **컨텍스트 프로파일 비율표/첨부 문서 인라인 한도**: 잠정값 적용 후 실 사용 데이터로 재검토 (tech-spec §17.1).
- ~~**컨텍스트 요약 호출에 사용할 모델/프롬프트**~~ → 해소: 첫 번째 참여자(`join_order` 최솟값, `removed` 제외)가 담당하며, `provider` 타입일 때만 동기 호출, `app` 타입이면 슬라이딩 윈도우 폴백. 프롬프트는 `prompt/summary-prompt.ts` 고정 (`07-llm-integration.md` Previous Message Overflow).
- **모더레이터 LLM, 권한 모델, 외부 노출용 토큰/TLS**: MVP 비목표, 후속 스펙에서 다룸 (tech-spec §17.2).

## 병렬화 가이드

- **Phase 0의 0.1/0.2/0.3**: 0.1 완료 후 0.2/0.3 병렬 가능.
- **Phase 1의 1.2/1.3**: 스키마(1.1) 확정 후 병렬.
- **Phase 4의 4.1/4.2**: 인터페이스 합의 후 병렬, 4.3에서 OpenAI 외 provider 어댑터를 추가하고 4.4에서 합류.
- **Phase 4의 4.3**: 4.1 어댑터 인터페이스와 4.2 모델 메타가 확정된 후 Anthropic / Google 어댑터를 동시에 작업 가능.
- **Phase 5/6**: 5.1과 6.1은 4 완료 후 동시 시작 가능. 단, 6.2는 4.4와 5.2의 익명화 가드를 공유하므로 그 합의가 먼저 끝나야 한다.
- **순차 필수**: Prisma 마이그레이션(1.1), 발언권 트랜잭션(2.3), 보고서 상태 머신(6.1→6.2→6.3).
