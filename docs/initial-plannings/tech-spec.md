# LLM-Salon Tech Spec (Draft)

## 0. 문서 정보

- 문서 버전: 0.4 (피드백 3차 반영: 보고서 출력 언어 환경변수 옵션 추가)
- 대상 PRD: `docs/initial-plannings/prd.md`
- 작성 목적: PRD를 구현 가능한 기술 설계 단위로 전환하고, 결정이 필요한 항목을 정리한다.
- 적용 범위: MVP 범위(PRD §16)에 한정한다. 후속 기능은 "후속 확장"으로만 언급한다.

---

## 1. 시스템 개요

LLM-Salon은 사용자의 로컬 머신에서 단일 NestJS 프로세스로 실행되는 토론 오케스트레이터이다. 프로세스는 다음을 모두 수행한다.

- HTTP 서버 (EJS SSR + REST + SSE)
- MCP/stdio 인터페이스 (LLM 앱이 호출)
- LLM Provider API 호출자 (OpenAI/Anthropic/Google 등)
- 토론 상태 머신 및 발언권 제어
- PostgreSQL 접근
- 로컬 파일 시스템 접근 (첨부 문서, 보고서)

CLI는 동일한 NestJS 애플리케이션의 부트 진입점으로 동작한다. `llm-salon start` 명령은 HTTP 서버를 띄우고 브라우저를 연다. 일부 명령(`llm-salon project list`, `llm-salon join …` 등)은 같은 서버 인스턴스에 HTTP로 위임하거나, 서버가 없으면 일회성 모드로 동작한다(§9 참조).

PRD §5.2는 MVP에서 프로젝트당 단일 토픽만 지원하는 것으로 명시했지만, 본 스펙에서는 결정에 따라 **MVP부터 다중 토픽을 지원**한다. 데이터 모델은 이미 `topics`가 `project_id` FK로 분리되어 있어 추가 마이그레이션이 필요하지 않다. 발언권/상태 머신/SSE는 모두 토픽 단위로 독립 운영된다.

---

## 2. 기술 스택

| 영역 | 선택 | 비고 |
|---|---|---|
| 런타임 | Node.js 20 LTS 이상 | 네이티브 fetch, ESM 안정성 |
| 언어 | TypeScript 5.x | strict 모드 |
| 서버 프레임워크 | NestJS 10.x | DI/모듈화, SSE/EJS 통합 용이 |
| HTTP 어댑터 | Express | EJS SSR과 호환성 |
| 템플릿 | EJS | PRD §7.3 명시 |
| 실시간 | SSE (`@nestjs/common` `@Sse`) | PRD §7.4 명시 |
| ORM | Prisma 5.x | 타입 안전성, 마이그레이션 단순성 |
| DB | PostgreSQL 15+ | 사용자가 사전 설치 |
| 검증 | `class-validator` + `class-transformer` | NestJS 표준 |
| 환경 설정 | `@nestjs/config` (dotenv 기반) | `~/.llm-salon/.env`에서 API key 로드 |
| 로깅 | NestJS 기본 `Logger` | 외부 의존성 최소화 |
| MCP | `@modelcontextprotocol/sdk` (TypeScript) | stdio transport |
| LLM 연동 | 각 Provider 공식 SDK (`openai`, `@anthropic-ai/sdk`, `@google/generative-ai`) | 통합 어댑터 레이어 위에서 사용 |
| CLI | `nest-commander` | 동일 NestJS 컨텍스트 공유 |
| 브라우저 오픈 | `open` (npm) | OS별 기본 브라우저 |
| 정적 자산 | vanilla CSS + vanilla JS | 별도 CSS 프레임워크 미도입 |
| 테스트 | Jest, Supertest | NestJS 기본 |
| 패키지 관리 | pnpm | 모노레포 확장성 (현 단계는 단일 패키지) |
| 빌드 | `nest build` (tsc) | 단일 dist 산출 |

---

## 3. 프로세스/배포 모델

### 3.1 단일 프로세스 단일 서버

- `llm-salon start <project>` 실행 시 단 하나의 NestJS 프로세스가 기동된다.
- 동일 사용자의 다른 프로젝트는 같은 서버 인스턴스 내 다른 URL 경로 (`/projects/:slug`)로 표현한다.
- 서버는 OS 사용자별 잠금 파일(`~/.llm-salon/server.lock`)로 중복 기동을 막는다.

### 3.2 포트와 URL

- 기본 포트: `4477` (변경 가능, `--port` 옵션과 `LLM_SALON_PORT` 환경변수)
- 사용 중인 포트일 경우 자동으로 `+1`씩 증가하며 빈 포트를 탐색(최대 10회). 최종적으로 결정된 포트는 stdout과 잠금 파일에 기록한다.
- 프로젝트 URL 패턴: `http://127.0.0.1:<port>/projects/<slug>`
- 모든 외부 노출 인터페이스는 `127.0.0.1`에 바인딩한다(외부 접속 불가).

### 3.3 백그라운드/포그라운드

MVP에서는 포그라운드 실행만 지원한다. 사용자가 터미널을 닫으면 서버도 종료된다. 데몬 모드/`--detach` 옵션은 비목표.

### 3.4 단일 사용자 가정

LLM-Salon은 한 머신에 한 명의 OS 사용자가 사용하는 시나리오만 지원한다. 한 머신에 여러 OS 계정이 동시에 LLM-Salon을 사용하는 시나리오(공용 워크스테이션, 다중 사용자가 SSH로 접근하는 Linux 서버 등)는 **비목표**이며, README에도 동일한 제약을 명시한다. PostgreSQL/포트/잠금 파일에 대한 별도 격리 가이드는 제공하지 않는다.

---

## 4. 디렉토리/모듈 구조

### 4.1 저장소 디렉토리

```text
llm-salon/
├── src/
│   ├── main.ts                  # NestJS 부트
│   ├── cli/                     # CLI 명령(nest-commander)
│   ├── app.module.ts
│   ├── config/                  # 환경변수, 경로 설정
│   ├── http/                    # 컨트롤러, EJS 뷰 라우팅
│   │   └── views/               # *.ejs 템플릿
│   ├── sse/                     # SSE 스트림 모듈
│   ├── mcp/                     # MCP stdio 서버
│   ├── projects/                # Project 도메인
│   ├── topics/
│   ├── participants/
│   ├── documents/
│   ├── messages/
│   ├── turns/                   # 발언권 상태 머신
│   ├── reports/
│   ├── llm/                     # Provider 추상화 + 어댑터
│   ├── prompt/                  # 익명화/프롬프트 빌더
│   ├── events/                  # 도메인 이벤트 + SSE 매핑
│   ├── storage/                 # 로컬 파일 저장소 추상화
│   ├── security/                # 환경변수 점검, 비밀값 마스킹
│   └── common/                  # 공통 DTO, 가드, 인터셉터
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── public/                      # 정적 자산 (vanilla JS, CSS)
├── test/
├── docs/
└── package.json
```

### 4.2 사용자 데이터 디렉토리

- 기본 위치: `~/.llm-salon/`
  - `.env` 사용자 API key 등 비밀값 (사용자가 `.env.example`을 복사해 채움, §12)
  - `projects/<slug>/documents/` 첨부 원본
  - `projects/<slug>/reports/` 보고서 Markdown
  - `server.lock` 단일 인스턴스 잠금
  - `logs/` (선택) 회전 로그
- 환경변수 `LLM_SALON_HOME`으로 변경 가능.

---

## 5. 데이터베이스 설계

### 5.1 ID 정책

- 기본 키는 `uuid` 타입, 기본값 `gen_random_uuid()` (pgcrypto 확장 사용).
- `slug`는 사람이 읽을 수 있는 식별자, 프로젝트 단위 유일.
- 모든 시각 컬럼은 `timestamptz`로 저장(UTC 기준).

### 5.2 ENUM 정의

PostgreSQL ENUM으로 정의하고 Prisma `enum`으로 매핑한다.

- `participant_type`: `app`, `provider`
- `participant_status`: `active`, `waiting`, `inactive`, `removed`
- `project_status`: `created`, `active`, `drafting`, `reviewing`, `finalized`, `closed`
- `topic_phase`: `preparing`, `debating`, `drafting`, `reviewing`, `finalizing`, `finalized`, `closed`
- `topic_mode`: `consensus`, `options`
- `turn_status`: `idle`, `in_progress`, `completed`, `skipped`
- `report_status`: `none`, `drafting`, `draft_ready`, `reviewing`, `finalizing`, `finalized`
- `message_kind`: `statement`, `feedback`, `report_draft`, `report_final`, `system`

### 5.3 테이블 (PRD §11 확장)

PRD 컬럼에 더해 운영에 필요한 항목과 데이터 타입을 명시한다. 모든 FK는 `ON DELETE CASCADE`(같은 프로젝트 하위 데이터)를 기본으로 한다.

#### 5.3.1 `projects`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `slug` | `text` | UNIQUE, NOT NULL | URL 식별자 |
| `name` | `text` | NOT NULL | 사용자 표시명 |
| `status` | `project_status` | NOT NULL, default `created` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

#### 5.3.2 `topics`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK → `projects.id`, NOT NULL | |
| `title` | `text` | NOT NULL | |
| `description` | `text` | NULL | |
| `mode` | `topic_mode` | NOT NULL, default `consensus` | |
| `phase` | `topic_phase` | NOT NULL, default `preparing` | |
| `max_rounds` | `int` | NULL | NULL = 제한 없음 |
| `max_turns` | `int` | NULL | NULL = 제한 없음 |
| `current_round` | `int` | NOT NULL, default `0` | |
| `current_turn_index` | `int` | NOT NULL, default `0` | |
| `reporter_participant_id` | `uuid` | FK → `participants.id`, NULL | drafting 진입 시 결정 |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

#### 5.3.3 `participants`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK → `projects.id`, NOT NULL | |
| `display_name` | `text` | NOT NULL | UI 전용, 예: `Codex / GPT-5.1` |
| `anonymous_name` | `text` | NOT NULL | LLM 컨텍스트 전용, 예: `Member A` |
| `participant_type` | `participant_type` | NOT NULL | |
| `provider_name` | `text` | NULL | provider 타입에 한함 |
| `model_name` | `text` | NULL | provider/app 모두 |
| `client_name` | `text` | NULL | app 타입에 한함 |
| `status` | `participant_status` | NOT NULL, default `waiting` | |
| `join_order` | `int` | NOT NULL | 라운드 로빈 정렬 키 |
| `joined_at` | `timestamptz` | NOT NULL, default `now()` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

추가 제약:

- `UNIQUE(project_id, anonymous_name)`
- `UNIQUE(project_id, client_name, model_name) WHERE participant_type = 'app' AND status <> 'removed'`
- `UNIQUE(project_id, provider_name, model_name) WHERE participant_type = 'provider' AND status <> 'removed'`
  - 동일 앱이 여러 모델로 동시에 같은 프로젝트에 참여하는 것은 불가.

#### 5.3.4 `documents`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK, NOT NULL | |
| `topic_id` | `uuid` | FK, NULL | 프로젝트 단위 문서는 NULL |
| `file_name` | `text` | NOT NULL | |
| `file_path` | `text` | NOT NULL | `LLM_SALON_HOME` 하위 상대경로 |
| `mime_type` | `text` | NOT NULL | |
| `size_bytes` | `bigint` | NOT NULL | |
| `content_hash` | `text` | NOT NULL | SHA-256 hex |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

#### 5.3.5 `messages`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK, NOT NULL | |
| `topic_id` | `uuid` | FK, NOT NULL | |
| `participant_id` | `uuid` | FK, NOT NULL | |
| `kind` | `message_kind` | NOT NULL, default `statement` | |
| `turn_index` | `int` | NOT NULL | |
| `round_index` | `int` | NOT NULL | |
| `phase` | `topic_phase` | NOT NULL | 발언 시점 phase 스냅샷 |
| `content` | `text` | NOT NULL, length ≤ 32 KB | §17.3 정책 |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

#### 5.3.6 `turns`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK, NOT NULL | |
| `topic_id` | `uuid` | FK, NOT NULL | |
| `current_participant_id` | `uuid` | FK, NULL | skipped인 경우 NULL 허용 |
| `turn_index` | `int` | NOT NULL | |
| `round_index` | `int` | NOT NULL | |
| `phase` | `topic_phase` | NOT NULL | |
| `status` | `turn_status` | NOT NULL, default `idle` | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

추가 제약: `UNIQUE(topic_id, turn_index)`.

#### 5.3.7 `reports`

| 컬럼 | 타입 | 제약 | 설명 |
|---|---|---|---|
| `id` | `uuid` | PK | |
| `project_id` | `uuid` | FK, NOT NULL | |
| `topic_id` | `uuid` | FK, NOT NULL | |
| `reporter_participant_id` | `uuid` | FK, NOT NULL | |
| `status` | `report_status` | NOT NULL, default `none` | |
| `draft_content` | `text` | NULL | |
| `final_content` | `text` | NULL | |
| `file_path` | `text` | NULL | 최종본 저장 경로 |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

#### 5.3.8 (삭제됨) `provider_credentials_meta`

이전 초안의 `provider_credentials_meta` 테이블은 폐기한다. API key는 `.env` 파일을 통해서만 관리되며(§12 참조), 부팅 시점에 `process.env`에서 결정되므로 DB에 별도 메타를 보관할 필요가 없다. Provider 사용 가능 여부는 부팅 직후 환경변수 점검 결과를 메모리에서만 유지한다.

### 5.4 인덱스/제약

- `messages(topic_id, created_at)` 시간순 조회용
- `messages(topic_id, turn_index, round_index)` 토론 재생용
- `participants(project_id, join_order)` 라운드 로빈 결정용
- `turns(topic_id, status)` 진행 중 턴 빠른 조회용
- 익명 이름 충돌 방지: 프로젝트 범위 UNIQUE
- 보고서 단일성은 애플리케이션 레벨에서 검증(`reports`는 토픽당 1행 운영)

### 5.5 마이그레이션

- Prisma Migrate 기반. 초기 마이그레이션은 `0001_init`.
- CLI 첫 기동 시 `prisma migrate deploy` 자동 수행 옵션 제공(`--auto-migrate`, 기본 on).

---

## 6. 도메인 모델과 핵심 로직

### 6.1 익명 이름 부여

- 참여자 등록 시 트랜잭션 내에서 `participants` 테이블의 `MAX(join_order)`를 기준으로 `Member A`, `Member B`, … 순으로 발급한다.
- A~Z 초과 시 `Member AA`, `Member AB`로 확장(MVP에서는 26명 이상은 비목표지만 코드 차원에서 안전).
- `removed` 상태도 카운트에 포함한다(이름 재사용 금지로 일관성 유지).

### 6.2 라운드 로빈 발언권

- 후보군: `participants` 중 `status` 이 `active` 또는 `waiting`(등록 완료)인 행.
- 정렬 기준: `join_order` 오름차순.
- 다음 발언자 결정:
  1. 현재 turn의 `current_participant_id`의 `join_order`를 찾음.
  2. 같은 라운드 내에서 그보다 큰 `join_order` 중 최소를 선택.
  3. 없다면 `round_index += 1` 후 가장 작은 `join_order` 선택.
- 비활성/제거된 참여자는 자동 skip하고 `turn.status = 'skipped'`로 기록.
- **신규 참여자는 다음 라운드부터 합류한다.** 현재 라운드 도중 등장하더라도 현재 라운드의 참여자 목록에는 포함되지 않는다.

### 6.3 토론 상태 머신

상태 전이 규칙은 PRD §15와 동일하며, 모든 전이는 시스템이 **자동**으로 수행한다(사용자/외부 호출의 `force_*` 트리거는 MVP에서 제공하지 않음).

- `preparing → debating`: 첫 메시지가 제출되는 순간 자동 전이.
- `debating → drafting`: `topics.max_turns` 또는 `max_rounds` 도달 시 자동.
- `drafting → reviewing`: 보고서 초안 저장 완료 시 자동.
- `reviewing → finalizing`: 모든 활성 참여자의 피드백 1회(고정) 완료 시 자동.
- `finalizing → finalized`: 최종 보고서 파일 저장 완료 시 자동.
- `finalized → closed`: 사용자가 명시적으로 종료 호출 시.

상태 전이는 단일 트랜잭션 내에서 수행하고, 전이 직후 도메인 이벤트를 발행한다.

### 6.4 동시성/잠금

- "메시지 제출 → 턴 변경 → 이벤트 발행"은 단일 DB 트랜잭션 + 행 잠금으로 보호.
  - `SELECT … FOR UPDATE`로 `turns` 행을 잠근 뒤 검증/갱신.
- MCP/HTTP 양쪽에서 동시 호출이 들어와도 발언권 검증으로 늦은 호출은 `409 Conflict`로 거절.

### 6.5 도메인 이벤트

NestJS `EventEmitter2`를 사용해 다음 이벤트를 발행한다.

- `message.created`
- `turn.changed`
- `participant.joined`
- `topic.phase_changed`
- `report.draft_created`
- `report.created`
- `project.closed`

이벤트 핸들러는 두 곳에서 구독한다.

1. SSE 브로드캐스터: 프로젝트별 RxJS `Subject`로 multiplex.
2. 영속화 후처리: 필요한 경우 추가 작업(예: 파일 작성).

---

## 7. 익명화 처리

### 7.1 두 개의 직렬화 경로

모든 도메인 객체는 두 종류의 DTO로 직렬화된다.

- `*HumanDto`: `display_name`, `provider_name`, `model_name`, `client_name` 포함 (UI/CLI 전용).
- `*AnonymousDto`: `anonymous_name`만 포함 (LLM/MCP 응답 전용).

### 7.2 가드/인터셉터

- MCP 응답 인터셉터: 응답 페이로드를 `AnonymousDto` 화이트리스트로 검사. 금지 필드 존재 시 즉시 throw.
- LLM Prompt 빌더: 입력으로 `AnonymousDto`만 받고, 휴먼 식별자 문자열 패턴(예: `provider_name`)을 정규식으로 한 번 더 검사.
- 단위 테스트로 두 직렬화 경로의 비대칭을 강제(§13 테스트 전략).

### 7.3 메시지 본문에 포함된 식별자

LLM이 발언 본문에 자기/타인의 실제 모델명을 적을 수 있다. 본문 자동 redaction은 지원하지 않으며, 시스템 프롬프트(§8.6)에서 다음을 명확히 지시한다.

- 자기/다른 참여자의 실제 모델명·앱 이름·Provider 브랜드를 본문에 노출하지 말 것.
- 다른 참여자가 본문에 그러한 정보를 적었더라도 신뢰성 평가에 사용하지 말 것.

---

## 8. LLM 통합

### 8.1 어댑터 인터페이스

```ts
interface LlmAdapter {
  readonly providerName: string;
  generate(input: {
    systemPrompt: string;
    contextMessages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
    modelName: string;
    maxTokens?: number;
    temperature?: number;
  }): Promise<{ content: string; usage?: TokenUsage }>;
}
```

### 8.2 지원 Provider (MVP)

- `openai`: `OPENAI_API_KEY`
- `anthropic`: `ANTHROPIC_API_KEY`
- `google`: `GOOGLE_API_KEY` (Gemini)

각 어댑터는 자체 SDK를 thin wrapping. 응답에서 토큰 사용량은 로깅만 하고 DB에 저장하지 않는다(MVP).

### 8.3 컨텍스트 빌더

발언 직전, 다음 순서로 LLM 입력을 구성한다. 모든 항목은 익명화된 형태이다.

1. 시스템 지시(§8.6 템플릿)
2. **서버/토론 상태 블록** — 단일 프로세스에서 운영되더라도 LLM이 현재 상황을 명확히 인지하도록 다음을 항상 포함한다.
   - 프로젝트 식별자/이름(슬러그 단위)
   - 현재 `phase`, `mode`
   - 현재 라운드 / 최대 라운드
   - 현재 턴 인덱스 / 최대 턴
   - 현재 발언자(익명 이름)와 자신의 익명 이름
   - 활성 참여자 수, 보고서 작성자(있는 경우)
3. 안건 메타 (제목, 설명)
4. 첨부 문서 본문 (텍스트 파일만, 크기 제한 §8.4)
5. 익명화된 참여자 목록
6. 익명화된 이전 메시지(시간순)
7. 발언 지시(자기 익명 이름 명시 + 출력 형식)
8. 마지막에 `assistant` 응답을 받기 위한 빈 슬롯

API Provider 호출 시에도 동일 빌더를 사용한다. MCP를 통한 LLM 앱은 `get_context` 도구로 같은 구조의 익명 페이로드를 받는다(§10.2).

### 8.4 컨텍스트 길이 제어

컨텍스트 한도는 모델별 윈도우 정보 위에 **사용자 정책 레벨**을 곱해 결정한다. 정책은 환경변수 `LLM_SALON_CONTEXT_PROFILE`로 설정한다.

| 프로파일 | 모델 윈도우 사용 비율 | 첨부 문서 인라인 한도 | 이전 메시지 보존 비율 | 비고 |
|---|---|---|---|---|
| `low` | 모델 윈도우의 25% | 64 KB / 파일, 256 KB / 프로젝트 합계 | 최근 30% | 비용·지연 최소화 |
| `medium` (default) | 50% | 128 KB / 파일, 512 KB / 프로젝트 합계 | 최근 60% | 균형 |
| `high` | 80% | 256 KB / 파일, 1 MB / 프로젝트 합계 | 최근 90% (불가 시 요약 후 보존) | 품질 우선 |

수치는 프로파일 시작 권장값이며 `llm/context-policy.ts`에 단일 source-of-truth로 둔다. 환경변수가 없거나 잘못된 값이면 `medium`을 사용한다.

추가 규칙:

- 모델별 윈도우 메타데이터(토큰 수, 권장 출력 토큰)는 `llm/models.ts`에 하드코딩하고, 위 비율과 곱해 실제 토큰 한도를 계산한다.
- 토큰 카운트는 모델별 토크나이저(가능한 경우) 또는 보수적 추정(영문 4 char ≈ 1 token)을 사용.
- 첨부 문서 단일 파일이 위 한도를 초과하면 등록 시점에서 거절하고, 사용자에게 다음 메시지를 안내한다: "첨부 파일은 현재 컨텍스트 프로파일(`<profile>`)의 한도(`<limit>`)를 초과합니다. 더 작은 파일로 분할하거나 `LLM_SALON_CONTEXT_PROFILE`을 상향 조정해 주세요." 시스템 동작은 멈추지 않으나 등록 자체가 실패하므로 토론에는 사용되지 않는다.
- 이전 메시지가 보존 비율 한도를 넘으면 다음 단계로 처리한다.
  1. **요약 단계 우선**: 가장 오래된 K개 메시지를 LLM 요약 호출로 1개 `[summary]` 메시지로 압축한다. 요약 호출은 **첫 번째 참여자**(`join_order` 최솟값을 가진 참여자, `removed` 제외)가 담당한다. 첫 번째 참여자가 `provider` 타입이면 해당 어댑터를 직접 호출하고, `app` 타입이면 해당 LLM 앱이 다음 자기 차례에 `get_context`로 가져갈 컨텍스트에 요약 지시를 포함시키는 대신 MVP에서는 슬라이딩 윈도우 폴백(2번)으로 즉시 강등한다(`app` 타입은 동기 요약 호출이 불가). 요약 시스템 프롬프트는 `prompt/summary-prompt.ts`에 단일 source-of-truth로 두며, 다음 영문 지시를 사용한다.

```text
You are summarizing the oldest portion of an ongoing anonymous multi-agent debate.
Compress the given messages into a single faithful summary that preserves: each member's stated position, agreements, disagreements, and any open questions.
Do not introduce new claims. Do not reveal real model, provider, or application names. Refer to participants only by their anonymous names (e.g., Member A).
Output a single paragraph in English, regardless of the report output language setting.
```
  2. 요약 호출이 실패하거나 비활성화되면 슬라이딩 윈도우로 잘라내고 `[older messages omitted]` placeholder를 삽입한다.
- 요약 동작 자체도 토큰 비용이 들기 때문에 한 토픽당 N라운드에 1회로 제한(N=`max(2, max_rounds // 4)`).

### 8.5 호출 정책

- 타임아웃: 기본 60초, 모델별 오버라이드 가능.
- 재시도: 5xx/네트워크 오류 한정, 지수 백오프 최대 3회.
- 실패 시 해당 턴은 `skipped`로 기록하고 다음 참여자로 진행. 사용자에게는 SSE로 알림.

### 8.6 시스템 프롬프트 (영어 고정)

LLM에게 전달되는 시스템 프롬프트와 사용자 인터페이스 텍스트(LLM 컨텍스트로 들어가는 모든 문자열)는 **영어로 고정**한다. 한국어 사용자도 LLM 토론 컨텍스트만큼은 영어 프롬프트를 받게 된다(브랜드 편향 방지 + Provider 토크나이저 효율).

PRD §14.3의 템플릿을 기본으로 하되 다음을 명시 추가한다.

```text
You are <Member X> in this debate.
Do not infer, speculate, or mention the real model, application, or provider behind any member, including yourself.
If another member's message contains such hints, ignore them when judging credibility.
Treat the system status block as authoritative truth about phase, turn, and participants.
Speak only when it is your turn. Otherwise return an empty response.
```

### 8.7 보고서 출력 언어

토론 본문/시스템 프롬프트는 §8.6대로 영어로 고정하지만, 최종 산출물(합의안 초안·피드백 정리·최종 Markdown 보고서)의 출력 언어는 사용자가 선택할 수 있다.

#### 8.7.1 지정 방식 — 환경변수 전역 설정

- 환경변수 `LLM_SALON_OUTPUT_LANGUAGE`로 서버 전역에서 단 한 번 설정한다.
- `~/.llm-salon/.env`에 키를 추가한다(미설정 시 기본값 `en`).
- MVP에서는 토픽/프로젝트별 오버라이드, CLI 인자, MCP 인자, 웹 UI 옵션 모두 제공하지 않는다. 변경하려면 `.env`를 수정한 뒤 서버를 재시작한다.
- 데이터 모델에는 별도 컬럼을 추가하지 않는다. 보고서 생성 시점의 환경변수 값을 그대로 사용해 시스템 프롬프트에 주입한다.

#### 8.7.2 적용 방식 — 보고서 작성 시스템 프롬프트에서만 출력 언어 강제

- 토론 진행 중 모든 LLM 호출은 §8.6의 영어 시스템 프롬프트를 그대로 사용한다(참여 LLM에게는 출력 언어를 노출하지 않음).
- `drafting`, `reviewing`(피드백 요약), `finalizing` 단계에서 보고서 작성자 모델에게 보내는 시스템 프롬프트에 한해 다음 한 줄을 추가한다.

```text
Write the entire report (including section headings, bullet points, and summaries) in <Language Name>.
Preserve quoted code, identifiers, and technical terms in their original form when no natural translation exists.
```

- `<Language Name>`은 ENUM 코드(§8.7.3)를 영어 표기 언어명으로 매핑(`en` → `English`, `ko` → `Korean`, …).
- 별도 번역 단계(2-pass)는 두지 않는다. 단일 LLM 호출로 보고서를 산출한다.
- 사용자 화면(EJS), CLI 출력, 메시지 본문은 별도 i18n 처리를 하지 않는다(영어 라벨 + 사용자가 자기 언어로 입력한 메시지가 그대로 표시).

#### 8.7.3 지원 언어 ENUM (화이트리스트)

응용 코드는 다음 ENUM만 허용한다. 잘못된 값이 환경변수로 들어오면 부팅 시점에 경고 로그를 남기고 `en`으로 폴백한다.

| 코드 | Language Name (프롬프트 주입) | 비고 |
|---|---|---|
| `en` | English | **기본값** |
| `ko` | Korean | |
| `ja` | Japanese | |
| `zh` | Chinese (Simplified) | |
| `es` | Spanish | |
| `fr` | French | |
| `de` | German | |

이 매핑은 `llm/output-languages.ts`에 단일 source-of-truth로 둔다. 추가 언어가 필요할 경우 본 표 갱신 + 매핑 상수만 늘리면 된다.

---

## 9. CLI

### 9.1 명령 표 (PRD §9.9 기반 확장)

| 명령 | 동작 | 서버 통신 |
|---|---|---|
| `llm-salon start <project>` | 서버 부트, 프로젝트 생성/열기, 브라우저 자동 실행 | 자체 부트 |
| `llm-salon stop` | 실행 중 서버 종료 | lock + signal |
| `llm-salon project list` | 모든 프로젝트 메타 출력 | 서버가 떠 있으면 HTTP, 없으면 일회성 부트 후 종료 |
| `llm-salon status <project>` | 현재 phase/turn/참여자 출력 | 동상 |
| `llm-salon join <project> --client <name> --model <name>` | LLM 앱 참여자 등록(주로 LLM 앱이 spawn) | HTTP |
| `llm-salon topic create <project> --file <path>` | 안건 생성 | HTTP |
| `llm-salon provider add <provider> --project <p> --model <m>` | API Provider 참여자 등록(환경변수에서 API key 검증만 수행) | HTTP |
| `llm-salon env init` | `~/.llm-salon/.env`가 없으면 패키지에 동봉된 `.env.example`을 복사하고 경로/안내를 출력 | 자체 실행 |
| `llm-salon logs <project>` | 최근 메시지 tail | HTTP |
| `llm-salon mcp` | stdio MCP 서버 모드 (LLM 앱이 spawn) | HTTP 위임 |

### 9.2 부트 흐름

1. `~/.llm-salon/` 디렉터리가 없으면 생성한다.
2. `~/.llm-salon/.env`가 없으면 패키지에 동봉된 `.env.example`을 동일 위치로 복사하고 stdout에 안내 메시지를 출력한다(아직 비어 있으므로 LLM 호출이 필요한 동작은 실패할 수 있음을 함께 안내).
3. `@nestjs/config`가 `~/.llm-salon/.env`를 로드하여 `process.env`에 주입.
4. `--port` 옵션/환경변수에서 포트 결정. 사용 중이면 +1씩 증가하며 빈 포트 탐색(최대 10회).
5. Prisma 마이그레이션 실행(`--auto-migrate` 기본 on).
6. NestJS 컨텍스트 부트.
7. 잠금 파일에 PID/포트 기록.
8. `open("http://127.0.0.1:<port>/projects/<slug>")` 호출. 실패 시 stderr 경고만 출력하고 URL은 반드시 stdout에 출력 (PRD FR-PROJ-001).

### 9.3 stdin 상호작용

CLI는 LLM 앱이 spawn하는 비대화형 호출이 대부분이므로 **API key 입력을 위한 secure prompt는 제공하지 않는다**. `provider add` 실행 시 필요한 환경변수가 없으면 다음 안내를 stderr에 출력하고 비정상 종료한다.

```text
Missing GOOGLE_API_KEY. Set it in ~/.llm-salon/.env (copy from .env.example) and try again.
```

서버 부트 흐름과 관계없이 사용자가 `.env`를 채워넣고 서버를 재시작해야 새 환경변수가 반영된다(자세한 흐름은 §12).

---

## 10. MCP/stdio 인터페이스

### 10.1 트랜스포트

- `@modelcontextprotocol/sdk`의 stdio transport 사용.
- `llm-salon mcp` 명령이 LLM 앱이 spawn하는 자식 프로세스로 동작하며 stdio MCP 서버를 노출.
- 이 자식 프로세스는 HTTP 서버로 요청을 위임한다(서버가 떠 있어야 동작). 서버가 없으면 명확한 에러 메시지를 반환.

### 10.2 도구 목록

각 tool의 입력/출력 스키마는 JSON Schema로 정의한다. 모든 응답은 익명 이름 기반이며, 휴먼 식별자는 절대 포함하지 않는다(§7.2 가드).

#### 프로젝트/세션

- `create_project(name)` → `{ projectId, slug, url }`
- `get_server_status()` → `{ version, projects: [{ slug, name, phase, status }], host: "127.0.0.1", port }`  
  *서버가 어떤 프로젝트를 호스팅 중인지 LLM 앱이 발견할 수 있도록 한다.*
- `get_project_status(projectIdOrSlug)` → `{ phase, mode, currentRound, maxRounds, currentTurnIndex, maxTurns, currentMember, reporterMember, participants: AnonymousDto[], topic: { title, mode }, documents: AnonymousDocDto[] }`
- `join_project(projectId, clientName, modelName)` → `{ participantId, anonymousName, joinOrder }`
- `create_topic(projectId, title, description?, mode?, maxRounds?, maxTurns?)`
- `add_document(projectId, topicId?, fileName, content)`  
  텍스트 본문 인라인 전달만 허용. 바이너리/파일 경로 전달은 거부.

#### 토론 진행

- `get_context(projectId, topicId)` → §8.3 구조의 익명화된 컨텍스트 페이로드(서버/토론 상태 블록 포함)
- `get_turn(projectId, topicId, participantId?)` → `{ currentMember, phase, currentRound, currentTurnIndex }`
  - `participantId`가 함께 전달되면 응답에 다음 두 필드를 추가: `{ isMyTurn: boolean, mySelf: "Member X" }`
- `is_my_turn(projectId, topicId, participantId)` → `{ isMyTurn: boolean, currentMember, phase }`  
  *LLM 앱이 본인 차례인지 단일 호출로 빠르게 확인할 수 있도록 별도 도구로 제공.*
- `submit_message(projectId, topicId, participantId, content)` → `{ messageId, nextMember, phaseAfter }`

#### 보고서

- `get_report_status(projectId, topicId)` → `{ status, draftAvailable, finalAvailable, filePath?, draftPreview? }`

### 10.3 응답 정책

- 모든 응답은 §7 익명화 가드를 통과한다. `display_name` 등 휴먼 식별자는 절대 반환하지 않는다.
- 발언권이 없는 참여자가 `submit_message`를 호출하면 `WRONG_TURN` 에러와 함께 현재 차례의 익명 이름을 알린다.
- 변경 가능성이 있는 응답(`is_my_turn`, `get_turn`, `get_project_status`)에는 서버 측 `serverTime`(ISO 8601)과 `topicVersion`(메시지/turn이 갱신될 때마다 증가하는 정수)을 함께 반환해 LLM 앱이 stale 응답을 감지할 수 있도록 한다.

### 10.4 LLM 앱 등록 가이드

각 클라이언트(Cursor, Claude Code, Codex 등)의 MCP 등록 절차는 본 문서가 단계별로 기술하지 않는다. 대신 `llm-salon mcp install-prompt`(또는 README 부록)에서 사용자에게 다음과 같은 영문 안내 프롬프트를 출력하고, 사용자가 이를 LLM 앱에 직접 붙여넣어 자체 등록 절차를 수행하도록 한다.

```text
Add an MCP server named "llm-salon" using the command `llm-salon mcp`.
After registration, call get_server_status to verify connectivity.
```

---

## 11. HTTP API와 SSR

### 11.1 라우트

- `GET /` → 프로젝트 목록 페이지
- `GET /projects/:slug` → 프로젝트 대시보드 (EJS)
- `GET /projects/:slug/events` → SSE 스트림
- REST (내부용, CLI/MCP 위임 대상):
  - `POST /api/projects`
  - `GET /api/projects` / `/api/projects/:slug`
  - `POST /api/projects/:slug/topics`
  - `POST /api/projects/:slug/participants`
  - `POST /api/projects/:slug/topics/:topicId/messages`
  - `GET /api/projects/:slug/topics/:topicId/context?audience=human|anonymous`
  - `GET /api/projects/:slug/topics/:topicId/turn?participantId=…`
  - `POST /api/projects/:slug/documents` (multipart 또는 JSON 인라인)
  - `GET /api/projects/:slug/topics/:topicId/report`
  - `POST /api/projects/:slug/close`
- 모든 REST 응답은 `audience` 파라미터 또는 호출 컨텍스트에 따라 Human/Anonymous DTO 중 선택.

### 11.2 SSE 채널

- 채널 키: `projects/<slug>`
- 이벤트 타입은 PRD §7.4와 동일.
- 각 클라이언트는 마지막 수신 `Last-Event-ID`로 재연결 시점 메시지 재전송 요청 가능.
- 재연결 큐 크기는 프로젝트당 최근 100건으로 제한.

### 11.3 EJS 페이지 구성

- 헤더: 프로젝트 이름, 현재 선택된 토픽 이름, phase 배지, SSE 연결 상태 인디케이터
- 토픽 전환: 한 프로젝트 내 다중 토픽을 지원하므로 헤더 또는 좌측 상단에 토픽 선택 셀렉터(또는 탭)를 둔다. 선택된 토픽이 URL 쿼리(`?topic=<topicId>`)에 반영된다.
- 좌측 패널: 참여자 목록 (display_name, 상태, 발언권 강조)
- 우측 메인: 메시지 말풍선 (시간 오름차순), 새 메시지 자동 스크롤
- 하단/탭: 첨부 문서 목록, 보고서 영역(초안/최종)
- 정적 자산: vanilla CSS + vanilla JS (모듈 스크립트, 외부 빌드 도구 없음)
- 메시지 렌더링은 단순 DOM append. 페이지네이션이나 가상 스크롤은 사용하지 않는다.

### 11.4 반응형 범위

- 일반적인 16:9 모니터에서 브라우저 너비를 모니터의 절반(약 960px 이상)까지 사용하는 시나리오만 보장.
- 그보다 좁은 환경(모바일/태블릿/세로 분할)은 비목표.
- 다크 모드는 미지원.

### 11.5 인증/접근 제어

- MVP는 단일 사용자 로컬 사용 가정 → 인증 없음.
- 모든 바인딩은 `127.0.0.1`. **외부 노출은 명시적으로 비목표**이며, MVP는 외부 노출을 가정한 토큰/TLS/리버스 프록시 가이드를 제공하지 않는다. 외부 노출이 필요한 사용자는 자체 책임으로 환경을 구성해야 한다(README에도 동일하게 안내).

---

## 12. 보안 (API key 처리)

본 섹션은 PRD §10.4 / FR-PART-002의 "shell script 기반 환경변수 자동 등록" 항목을 **`.env` 파일 기반으로 변경**한다. 셸 rc 자동 수정은 OS/셸 호환성 부담과 사용자 동의 이슈가 크기 때문에, 표준적인 dotenv 흐름을 채택한다.

### 12.1 .env 파일 위치와 라이프사이클

- 기준 경로: `~/.llm-salon/.env` (또는 `LLM_SALON_HOME` 환경변수 하위)
- 패키지에는 **`.env.example`** 템플릿을 동봉한다. 예시 내용:

```dotenv
# Copy this file to ~/.llm-salon/.env and fill in the keys you plan to use.
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
GOOGLE_API_KEY=

# Optional overrides
# LLM_SALON_PORT=4477
# LLM_SALON_CONTEXT_PROFILE=medium
# LLM_SALON_OUTPUT_LANGUAGE=en   # one of: en, ko, ja, zh, es, fr, de
```

- 첫 부트 또는 `llm-salon env init` 실행 시 `~/.llm-salon/.env`가 없으면 `.env.example`을 그 위치로 복사하고 경로를 stdout에 안내한다. 이미 존재하면 덮어쓰지 않는다.
- 서버 부트 시 `@nestjs/config` 모듈이 `~/.llm-salon/.env`를 자동 로드해 `process.env`에 주입한다. 동일 키가 OS 환경변수에 이미 있으면 OS 환경변수가 우선한다.

### 12.2 사용자 흐름

1. 사용자가 `llm-salon env init`을 실행하거나 `llm-salon start` 첫 실행 시 `.env` 자동 생성을 안내받는다.
2. 사용자가 텍스트 에디터로 `~/.llm-salon/.env`를 열어 사용할 Provider의 API key를 직접 채워넣는다.
3. 사용자가 `llm-salon start <project>` 또는 `llm-salon provider add gemini …`를 실행한다.
4. 서버는 부트 시점에 환경변수 점검 결과(어떤 Provider가 사용 가능한지)를 메모리에 보관하고, 누락된 Provider에 대해서는 `provider add`를 안내 메시지와 함께 실패시킨다.
5. 사용자가 `.env`를 갱신했다면 서버를 재시작해야 새 값이 반영된다(MVP에서는 hot-reload 미지원).

### 12.3 API key 보안 원칙

- API key는 DB/로그/이벤트/SSE 페이로드에 절대 출력하지 않는다.
- 어플리케이션은 `process.env.<KEY>`를 LLM 어댑터 내부에서만 직접 참조하며, 컨트롤러/서비스 계층으로 값이 전달되지 않는다.
- NestJS Logger 출력 시 메시지 직렬화 단계에서 알려진 환경변수명/`apiKey`/`Authorization` 키를 마스킹하는 인터셉터를 둔다.
- `.env` 파일 자체는 기본 파일 시스템 권한에 의존한다. README에 `chmod 600 ~/.llm-salon/.env`를 권장한다.
- 셸 rc 자동 수정, child_process를 통한 환경변수 주입 등은 사용하지 않는다.

### 12.4 파일 시스템 경계

- 첨부/보고서 파일 경로는 모두 `LLM_SALON_HOME/projects/<slug>/` 하위로 제한.
- 사용자 입력 경로는 `path.resolve` 후 base prefix 검증.
- `.env`는 `LLM_SALON_HOME` 직속에 위치하며, 위 프로젝트 경로 검증과 별개로 별도 화이트리스트 처리.

---

## 13. 테스트 전략

### 13.1 단위 테스트

- 익명화 가드: `display_name`, `provider_name` 등이 LLM/MCP 응답에 절대 포함되지 않음을 화이트리스트/블랙리스트 양방향 검사.
- 라운드 로빈 알고리즘: 활성/비활성/추가/제거 시나리오 표 기반 테스트.
- 상태 머신: 모든 전이/금지 전이 테이블 테스트.
- 컨텍스트 정책(§8.4): 프로파일별 상한 계산 단위 테스트.

### 13.2 통합 테스트

- Supertest로 REST + SSE 동작 검증.
- Prisma는 testcontainers 또는 로컬 PostgreSQL의 임시 스키마 사용.
- MCP는 stdio 자식 프로세스를 띄워 JSON-RPC 메시지 왕복 테스트.

### 13.3 LLM 어댑터

- 실제 Provider 호출은 기본 비활성. `LLM_SALON_E2E=1`인 경우에만 실행.
- 평소엔 SDK를 mock하여 결정적 응답 사용.

### 13.4 회귀 보호

- "메시지 제출 후 SSE event가 정확히 1회 발행" 테스트.
- "동시 두 참여자가 같은 turn에 submit 시 한쪽은 409" 테스트.
- "`is_my_turn`이 발언권을 가진 참여자에게만 true" 테스트.

---

## 14. 로깅/관측

- NestJS 기본 `Logger` 사용. 컨텍스트 라벨로 모듈을 구분.
- 기본 레벨 `log`, `--verbose`로 `debug`.
- 요청 컨텍스트(요청 ID, 프로젝트 slug)는 `AsyncLocalStorage` 기반 컨텍스트 서비스로 주입.
- 메트릭은 MVP에서 도입하지 않음. Provider 호출 latency만 로그로 남김.
- 사용자 화면용 "최근 활동 로그"는 DB의 `messages` + 도메인 이벤트로 충분.

---

## 15. 에러 처리

- 도메인 에러 클래스: `WrongTurnError`, `PhaseTransitionError`, `ParticipantConflictError`, `MissingApiKeyError`, `ProviderCallFailedError`, `DocumentTooLargeError`, `DuplicateAppRegistrationError`.
- HTTP 매핑: 도메인 에러 → 4xx 변환, 외부 호출 오류 → 502/504.
- MCP 응답: JSON-RPC error code 매핑 표를 `mcp/errors.ts`에 정의.

---

## 16. 구현 단계 제안

1. **Phase 0**: 저장소 부트, NestJS/Prisma 스캐폴딩, 헬스 체크.
2. **Phase 1**: 데이터 모델 + 마이그레이션, 프로젝트/토픽/참여자 CRUD, CLI `start`/`project list`.
3. **Phase 2**: 익명화 DTO 인프라, 라운드 로빈 turn 엔진, 메시지 제출 트랜잭션.
4. **Phase 3**: SSE + EJS 대시보드, 브라우저 자동 실행.
5. **Phase 4**: LLM 어댑터(OpenAI 1종 우선) + 컨텍스트 빌더 + 컨텍스트 프로파일 정책 + Provider 참여자 등록 + `.env`/`.env.example` 기반 API key 로딩.
6. **Phase 5**: MCP/stdio 도구 노출(서버/턴 인지 도구 포함), LLM 앱 참여 시나리오 검증.
7. **Phase 6**: 합의안 초안/피드백/최종 보고서 파이프라인(컨텍스트 요약 단계 + `LLM_SALON_OUTPUT_LANGUAGE` 기반 출력 언어 적용 포함).
8. **Phase 7**: 영문 README, 사용자 가이드 문서화.

---

## 17. Open Questions

직전 라운드의 결정은 모두 본문에 통합되었다. 본 라운드에서는 이후 결정 또는 후속 라운드 재논의가 필요한 항목만 남긴다.

### 17.1 후속 재검토 예정 (현재 잠정 적용)

다음 항목은 본문에 잠정값을 적용했지만 실제 사용 데이터가 쌓인 뒤 재검토한다.

1. **첨부 문서 인라인 한도**: 컨텍스트 프로파일별로 (low: 64KB/256KB, medium: 128KB/512KB, high: 256KB/1MB)을 잠정 적용. 실 사용 자료 평균 크기에 따라 조정.
2. **컨텍스트 프로파일 비율표**: 표의 비율(25/50/80%, 보존 30/60/90%)을 잠정 적용. 비용/품질 관찰 후 조정.

### 17.2 후속 결정으로 미룬 사항

- 모더레이터 LLM, 권한 모델, 외부 노출용 토큰 기반 접근 제어/TLS는 본 MVP 스펙의 비목표이며 후속 버전 스펙에서 다룬다(다중 토픽은 본 MVP에서 지원).
- ~~컨텍스트 요약 호출에 사용할 모델/프롬프트 선택은 Phase 6 진입 전에 별도 노트로 정한다.~~ (해소: §8.4. 첫 번째 참여자가 담당하며, 프롬프트는 `prompt/summary-prompt.ts`에 고정.)
