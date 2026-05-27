# LLM-Salon PRD

## 1. 문서 개요

### 1.1 제품명

**LLM-Salon**

### 1.2 제품 한 줄 설명

LLM-Salon은 여러 LLM 앱과 LLM API Provider 모델을 하나의 로컬 토론 공간에 참여시켜, 공통 자료와 이전 대화 기록을 바탕으로 순차 토론을 진행하고 최종 합의안 또는 선택지를 산출하는 로컬 기반 에이전트 토론 시스템이다.

### 1.3 문서 목적

본 문서는 LLM-Salon의 제품 목적, 사용자 시나리오, 기능 요구사항, 비기능 요구사항, 화면 요구사항, 데이터 요구사항, 시스템 플로우, MVP 범위를 정의한다.

---

## 2. 배경 및 문제 정의

### 2.1 배경

현대 업무 환경에서 사용자는 Codex, Claude Code, Cursor, ChatGPT, Gemini 등 다양한 LLM 도구를 사용한다. 각 모델은 서로 다른 강점과 약점을 가지며, 같은 문제에 대해서도 다른 관점과 해결책을 제시할 수 있다.

그러나 현재 일반적인 사용 방식은 다음과 같은 한계를 가진다.

* 사용자가 각 LLM에게 개별적으로 질문해야 한다.
* 여러 LLM의 답변을 수동으로 비교해야 한다.
* 모델 간 상호 반박, 검토, 합의 과정이 자동화되어 있지 않다.
* 토론 기록과 자료가 일관된 구조로 관리되지 않는다.
* LLM 앱과 API 모델이 같은 토론 공간에 함께 참여하기 어렵다.

### 2.2 해결하고자 하는 문제

LLM-Salon은 여러 LLM 참여자가 하나의 안건을 기준으로 순차적으로 의견을 제시하고, 서로의 주장을 검토하며, 최종적으로 사용자가 활용 가능한 합의안 또는 선택지를 산출하도록 한다.

이를 통해 다음 문제를 해결한다.

* 여러 LLM의 관점을 한곳에서 비교하기 어렵다.
* 개별 LLM 답변의 오류나 편향을 다른 모델이 검토하기 어렵다.
* 업무 자료와 토론 기록이 분산된다.
* 토론의 흐름과 발언 순서를 수동으로 관리해야 한다.
* LLM 브랜드명에 따른 편향이 토론 품질에 영향을 줄 수 있다.

---

## 3. 제품 목표

### 3.1 주요 목표

LLM-Salon의 주요 목표는 다음과 같다.

1. 서로 다른 LLM 모델 간 토론을 통해 업무 결과물의 품질을 높인다.
2. LLM 앱과 LLM API Provider 모델이 같은 로컬 프로젝트에 참여할 수 있게 한다.
3. 공통 문서, 토론 주제, 발언 기록, 최종 결과물을 로컬에서 관리한다.
4. 자동 발언권 제어를 통해 질서 있는 토론을 진행한다.
5. 사용자에게는 실제 참여 주체와 모델명을 명확히 보여주되, LLM 간 컨텍스트에서는 참여자를 익명화해 브랜드 편향을 줄인다.
6. EJS 서버사이드 렌더링 화면과 SSE 기반 실시간 업데이트를 제공한다.
7. 프로그램은 가볍고 단순하게 유지한다.

### 3.2 비목표

초기 버전에서 다음은 목표로 하지 않는다.

* 클라우드 기반 SaaS 서비스 제공
* 다중 사용자 계정 및 권한 관리
* 복잡한 팀 협업 기능
* 장기 실행 에이전트 워크플로우 관리
* 완전 자동화된 모든 외부 LLM 앱 제어
* 고급 벡터 검색 기반 RAG 시스템
* 복잡한 프론트엔드 SPA 구현
* 별도의 전용 데스크톱 앱 제공

---

## 4. 사용자 및 참여자 정의

### 4.1 인간 사용자

인간 사용자는 LLM-Salon을 실행하고, 프로젝트를 만들고, 토론 안건과 자료를 제공하며, 각 LLM 앱 또는 API Provider 모델을 토론에 참여시키는 사람이다.

주요 행동은 다음과 같다.

* 프로젝트 생성
* 토론 안건 생성
* 첨부 자료 등록
* LLM 앱 참여 요청
* API Provider 모델 추가
* 토론 진행 상황 확인
* 최종 결과물 확인

### 4.2 LLM 앱 참여자

LLM 앱 참여자는 Codex, Claude Code, Cursor 등 로컬 또는 개발 환경에서 실행되는 LLM 기반 애플리케이션이다.

이들은 MCP 또는 stdio 기반 명령어를 통해 LLM-Salon에 접근할 수 있어야 한다.

LLM 앱 참여자는 실제 앱 이름과 해당 앱에서 사용 중인 모델명을 함께 사용자 화면에 표시할 수 있어야 한다.

예시:

* Codex / GPT-5.1
* Claude Code / Claude Sonnet 4.5
* Cursor / GPT-5.1
* 기타 MCP 호환 LLM 클라이언트 및 해당 실행 모델

### 4.3 LLM API Provider 참여자

LLM API Provider 참여자는 LLM-Salon 서버가 API를 통해 직접 호출하는 모델이다.

예시:

* OpenAI 모델
* Anthropic 모델
* Google Gemini 모델
* Mistral 모델
* 기타 API Provider 모델

API Provider 참여자는 환경변수에 유효한 API key가 설정된 경우 사용할 수 있어야 한다. 해당 Provider의 API key가 환경변수에 없을 경우, 사용자는 Provider 추가 과정에서 API key를 입력할 수 있어야 하며, 시스템은 내부적으로 shell script를 실행하여 해당 API key를 환경변수에 추가하는 구조를 제공해야 한다.

### 4.4 시스템

시스템은 토론의 사회자 중 일부 기능을 수행한다.

시스템이 담당하는 역할은 다음과 같다.

* 프로젝트 상태 관리
* 참여자 등록 관리
* 발언권 부여
* 토론 단계 전환
* 발언 기록 저장
* 문서 목록 관리
* 실시간 UI 업데이트 이벤트 발행
* 결과물 저장

---

## 5. 핵심 개념

### 5.1 Project

Project는 하나의 독립적인 토론 공간이다.

프로젝트는 사용자가 지정한 이름을 가진다. 토론 주제, 참여자, 첨부 문서, 메시지, 결과물은 모두 특정 프로젝트에 귀속된다.

### 5.2 Topic

Topic은 프로젝트 내에서 진행되는 하나의 토론 안건이다.

초기 MVP에서는 프로젝트당 하나의 Topic만 지원할 수 있다. 향후 확장 시 프로젝트 하나에 여러 Topic을 둘 수 있다.

### 5.3 Participant

Participant는 토론에 참여하는 LLM 주체이다.

참여자는 다음 유형을 가질 수 있다.

* LLM App Participant
* API Provider Participant

각 참여자는 사용자 화면용 실제 표시명과 LLM 컨텍스트용 익명 표시명을 모두 가진다.

### 5.4 Display Name

Display Name은 인간 사용자에게 표시되는 실제 참여 주체명이다.

LLM App Participant의 Display Name은 앱 이름과 모델명을 함께 포함해야 한다. API Provider Participant의 Display Name은 Provider 또는 제품 식별이 가능한 모델명을 포함해야 한다.

예시:

* Codex / GPT-5.1
* Cursor / GPT-5.1
* Claude Code / Claude Sonnet 4.5
* Gemini 1.5 Pro
* GPT-4.1

사용자 화면에서는 Display Name을 표시한다.

### 5.5 Anonymous Name

Anonymous Name은 LLM들이 서로의 발언을 읽을 때 사용되는 익명 이름이다.

익명 이름은 `Member` 명칭을 사용한다.

예시:

* Member A
* Member B
* Member C
* Member D

LLM에게 제공되는 이전 대화 기록, 발언 지시문, 합의안 피드백 요청에는 Anonymous Name을 사용한다.

### 5.6 Message

Message는 특정 참여자가 특정 턴에 제출한 발언이다.

메시지는 다음 맥락 정보를 가진다.

* 프로젝트
* 토론 안건
* 참여자
* 토론 단계
* 턴 번호
* 발언 내용
* 생성 시각

### 5.7 Turn

Turn은 현재 어떤 참여자가 발언할 수 있는지를 나타내는 토론 제어 단위이다.

시스템은 현재 Turn을 관리하고, 발언권을 가진 참여자만 발언을 제출할 수 있도록 해야 한다.

### 5.8 Phase

Phase는 토론 진행 단계를 의미한다.

주요 Phase는 다음과 같다.

* preparing
* debating
* drafting
* reviewing
* finalizing
* finalized
* closed

---

## 6. 익명화 정책

### 6.1 목적

익명화의 목적은 인간 사용자를 속이거나 정보를 숨기는 것이 아니다.

LLM들이 서로 토론할 때 특정 모델 브랜드명에 영향을 받아 편향된 판단을 하지 않도록 하기 위한 것이다.

예를 들어 LLM이 “Claude가 말했으므로 더 신뢰한다” 또는 “Gemini가 말했으므로 덜 신뢰한다”와 같은 브랜드 기반 판단을 하지 않게 해야 한다.

### 6.2 사용자 화면 표시 정책

사용자 화면에서는 실제 참여 주체명과 모델명이 포함된 Display Name을 표시해야 한다.

예시:

```text
Codex / GPT-5.1: 이 요구사항에서는 발언권 제어가 핵심입니다.
Cursor / GPT-5.1: 구현 관점에서는 PostgreSQL 트랜잭션 처리가 중요합니다.
Claude Code / Claude Sonnet 4.5: 합의안 작성 단계에서는 참여자 추가를 막아야 합니다.
Gemini 1.5 Pro: 사용자 선택지 모드도 별도로 모델링해야 합니다.
```

사용자는 어떤 앱 또는 모델이 어떤 의견을 냈는지 확인할 수 있어야 한다.

### 6.3 LLM 컨텍스트 표시 정책

LLM에게 이전 대화 기록을 제공할 때는 실제 모델명과 앱 이름을 제거하고 익명 이름으로 대체해야 한다.

예시:

```text
Member A: 이 요구사항에서는 발언권 제어가 핵심입니다.
Member B: 구현 관점에서는 PostgreSQL 트랜잭션 처리가 중요합니다.
Member C: 합의안 작성 단계에서는 참여자 추가를 막아야 합니다.
Member D: 사용자 선택지 모드도 별도로 모델링해야 합니다.
```

### 6.4 내부 저장 정책

데이터베이스에는 실제 표시명과 익명 표시명을 모두 저장할 수 있다.

권장 구조:

* display_name: 사용자 화면에 표시할 실제 이름
* anonymous_name: LLM 컨텍스트에서 사용할 이름
* participant_type: app 또는 provider
* provider_name: 내부 식별용 Provider 이름
* model_name: 내부 식별용 모델 이름
* client_name: 내부 식별용 LLM 앱 이름

단, LLM 프롬프트 구성 시에는 display_name, provider_name, model_name, client_name이 노출되지 않도록 해야 한다.

### 6.5 익명화 적용 범위

익명화가 적용되는 영역:

* LLM에게 제공되는 이전 대화 기록
* LLM에게 제공되는 현재 참여자 목록
* LLM에게 제공되는 피드백 요청
* LLM에게 제공되는 합의안 검토 문맥
* API Provider 모델 호출 프롬프트
* MCP/stdio로 LLM 앱이 조회하는 토론 컨텍스트

익명화가 적용되지 않는 영역:

* 인간 사용자용 웹 UI
* 인간 사용자용 로그 화면
* 인간 사용자용 최종 보고서의 선택적 메타데이터
* 관리자/디버깅용 내부 로그

최종 보고서 본문에는 기본적으로 익명 이름을 사용하되, 사용자가 확인하는 메타데이터 영역에는 실제 참여자 목록을 표시할 수 있다.

---

## 7. 시스템 아키텍처

### 7.1 전체 구조

LLM-Salon은 로컬에서 실행되는 NestJS 서버를 중심으로 동작한다.

```text
Human User
  ├─ Browser UI
  │    └─ EJS-rendered pages + SSE updates
  │
  ├─ LLM Apps
  │    ├─ Codex
  │    ├─ Cursor
  │    └─ Claude Code
  │         └─ MCP / stdio commands
  │
  └─ CLI

Local LLM-Salon Server
  ├─ NestJS Application
  ├─ EJS Server-Side Rendering
  ├─ SSE Event Stream
  ├─ MCP / stdio Interface
  ├─ Provider API Connectors
  ├─ PostgreSQL
  └─ Local File Storage
```

### 7.2 Backend

서버는 NestJS로 구현한다.

NestJS는 다음 역할을 수행한다.

* HTTP 라우팅
* EJS 템플릿 렌더링
* SSE 스트림 제공
* 프로젝트/참여자/메시지 API 제공
* MCP 또는 stdio 명령 처리와 연동
* LLM Provider API 호출
* PostgreSQL 데이터 접근
* 토론 상태 머신 관리

### 7.3 Server-Side Rendering

화면은 EJS 기반 서버사이드 렌더링으로 제공한다.

초기 HTML은 서버에서 렌더링하여 브라우저에 전달한다.

브라우저는 최초 로드 이후 SSE를 구독하여 새 메시지, 참여자 상태 변경, 토론 상태 변경을 실시간으로 반영한다.

SPA 프레임워크는 초기 MVP에서 사용하지 않는다.

### 7.4 SSE

SSE는 브라우저가 서버로부터 단방향 실시간 이벤트를 수신하기 위해 사용한다.

사용 목적:

* 새 LLM 발언 실시간 표시
* 현재 발언권 변경 표시
* 참여자 추가 표시
* 토론 Phase 변경 표시
* 합의안 초안 생성 표시
* 최종 보고서 생성 완료 표시

SSE 엔드포인트 예시:

```text
GET /projects/:projectId/events
```

SSE 이벤트 타입 예시:

```text
event: message.created
event: turn.changed
event: participant.joined
event: topic.phase_changed
event: report.created
event: project.closed
```

### 7.5 PostgreSQL

모든 주요 데이터는 PostgreSQL에 저장한다.

저장 대상:

* 프로젝트
* 토론 안건
* 참여자
* 문서 메타데이터
* 메시지
* 턴 상태
* 토론 설정
* 보고서

### 7.6 Local File Storage

첨부 문서와 최종 결과물은 로컬 파일 시스템에 저장한다.

PostgreSQL에는 파일 경로, 파일명, MIME type, hash, 생성 시각 등 메타데이터를 저장한다.

---

## 8. 주요 사용자 시나리오

### 8.1 프로젝트 시작

1. 사용자가 터미널에서 LLM-Salon을 실행한다.
2. 사용자가 프로젝트 이름을 지정한다.
3. NestJS 로컬 서버가 시작된다.
4. 서버는 EJS 기반 웹 UI 주소를 출력한다.
5. 시스템은 기본 브라우저를 자동으로 실행하여 해당 프로젝트 URL에 접속한다.
6. 사용자는 브라우저에서 프로젝트 화면을 확인한다.

예상 명령어:

```bash
llm-salon start my-project
```

### 8.2 Codex가 안건 생성 및 첫 참여자로 등록

1. 사용자가 Codex에게 프로젝트에 첨부 자료를 제출하고 안건을 생성하라고 요청한다.
2. Codex는 MCP/stdio 명령을 통해 LLM-Salon에 접근한다.
3. Codex는 참여자 1로 등록된다.
4. Codex는 안건과 첨부 문서를 등록한다.
5. Codex는 첫 발언을 제출한다.
6. 사용자 화면에는 Codex 앱 이름과 실제 모델명이 포함된 Display Name으로 발언이 표시된다.
7. 이후 다른 LLM에게는 이 발언자가 `Member A`로 제공된다.

### 8.3 Cursor 중도 참여

1. 사용자가 Cursor에게 동일 프로젝트에 참여하라고 요청한다.
2. Cursor는 MCP/stdio 명령으로 프로젝트 상태를 조회한다.
3. Cursor는 참여자로 등록된다.
4. 시스템은 Cursor에 익명 이름을 부여한다.
5. Cursor는 이전 토론 기록을 익명화된 형태로 열람한다.
6. Cursor는 자기 발언 차례를 기다린다.
7. 사용자 화면에는 Cursor 앱 이름과 실제 모델명이 포함된 Display Name으로 표시된다.

### 8.4 Claude Code 중도 참여

1. 사용자가 Claude Code에게 동일 프로젝트에 참여하라고 요청한다.
2. Claude Code는 프로젝트에 참여자로 등록된다.
3. 이전 토론 기록은 익명화된 형태로 제공된다.
4. Claude Code는 발언 차례를 기다린다.
5. 사용자 화면에는 Claude Code 앱 이름과 실제 모델명이 포함된 Display Name으로 표시된다.

### 8.5 API Provider 모델 참여

1. 사용자가 Provider를 선택한다.
2. 시스템은 해당 Provider API key가 환경변수에 존재하는지 확인한다.
3. API key가 환경변수에 존재하지 않으면, 사용자는 Provider 추가 과정에서 API key를 입력할 수 있다.
4. 시스템은 입력된 API key를 내부 shell script를 통해 환경변수에 추가한다.
5. 환경변수 설정이 완료되면 모델을 참여자로 등록한다.
6. 등록된 API 모델은 시스템이 직접 호출하여 발언을 생성한다.
7. 사용자 화면에는 실제 모델명이 표시된다.
8. 다른 LLM에게는 익명 이름으로만 표시된다.

예상 명령어:

```bash
llm-salon provider add gemini --project my-project --model gemini-1.5-pro
```

### 8.6 토론 진행

1. 시스템은 현재 Phase와 발언권을 확인한다.
2. 발언권을 가진 참여자에게만 발언을 허용한다.
3. LLM은 발언 전 이전 대화 기록과 공통 문서를 읽는다.
4. LLM은 자기 의견을 제출한다.
5. 메시지는 PostgreSQL에 저장된다.
6. 서버는 SSE로 브라우저에 message.created 이벤트를 전송한다.
7. 브라우저는 새로고침 없이 말풍선을 추가한다.
8. 시스템은 다음 참여자에게 발언권을 넘긴다.
9. 서버는 SSE로 turn.changed 이벤트를 전송한다.

### 8.7 합의안 작성

1. 정해진 턴 또는 라운드가 완료된다.
2. 시스템은 Phase를 drafting으로 변경한다.
3. drafting이 시작되면 신규 참여자 등록은 차단된다.
4. 지정된 보고서 작성자 모델이 합의안 초안을 작성한다.
5. 초안은 메시지 또는 별도 report draft로 저장된다.
6. 서버는 SSE로 topic.phase_changed 및 report.draft_created 이벤트를 전송한다.

### 8.8 합의안 피드백

1. Phase가 reviewing으로 변경된다.
2. 각 참여자는 순서대로 합의안 초안에 대해 피드백한다.
3. 피드백은 익명화된 참여자명 기준으로 LLM에게 제공된다.
4. 사용자 화면에는 실제 Display Name 기준으로 피드백이 표시된다.

### 8.9 최종 결과물 생성

1. 보고서 작성자 모델이 피드백을 반영해 최종 결과물을 작성한다.
2. 최종 결과물은 Markdown 파일로 로컬에 저장된다.
3. 파일 경로는 PostgreSQL에 저장된다.
4. 사용자 화면에 최종 결과물 경로가 표시된다.
5. 서버는 SSE로 report.created 및 project.closed 이벤트를 전송한다.

---

## 9. 기능 요구사항

### 9.1 프로젝트 관리

#### FR-PROJ-001 프로젝트 생성

사용자는 프로젝트 이름을 지정하여 새 프로젝트를 생성할 수 있어야 한다.

수용 기준:

* 프로젝트 이름은 필수이다.
* 동일한 이름의 활성 프로젝트가 있을 경우 충돌을 안내해야 한다.
* 생성된 프로젝트는 PostgreSQL에 저장되어야 한다.
* 프로젝트 생성 후 브라우저에서 접근 가능한 URL을 제공해야 한다.
* 프로젝트 생성 후 시스템은 기본 브라우저를 자동으로 실행하여 해당 프로젝트 URL에 접속해야 한다.
* 브라우저 자동 실행에 실패하더라도 프로젝트 생성은 성공으로 처리하며, CLI에는 접근 가능한 URL을 출력해야 한다.

#### FR-PROJ-002 프로젝트 조회

사용자는 현재 로컬에 저장된 프로젝트 목록을 조회할 수 있어야 한다.

수용 기준:

* 프로젝트 이름, 상태, 생성 시각, 최근 업데이트 시각을 표시한다.
* CLI와 웹 UI 양쪽에서 조회 가능해야 한다.

#### FR-PROJ-003 프로젝트 상태 관리

프로젝트는 상태를 가져야 한다.

상태 예시:

* created
* active
* drafting
* reviewing
* finalized
* closed

---

### 9.2 안건 관리

#### FR-TOPIC-001 안건 생성

사용자 또는 LLM 앱은 프로젝트 내에 토론 안건을 생성할 수 있어야 한다.

수용 기준:

* 안건 제목은 필수이다.
* 안건 설명은 선택 사항이다.
* 토론 모드를 지정할 수 있어야 한다.
* 최대 턴 또는 최대 라운드를 설정할 수 있어야 한다.

#### FR-TOPIC-002 토론 모드 선택

시스템은 최소 두 가지 토론 모드를 지원해야 한다.

* consensus: 하나의 합의안을 도출
* options: 사용자에게 선택지를 제시

수용 기준:

* 안건 생성 시 모드를 선택할 수 있어야 한다.
* 모드가 지정되지 않으면 consensus를 기본값으로 사용한다.

#### FR-TOPIC-003 합의안 작성 단계 이후 참여자 추가 제한

토론 Phase가 drafting 이상으로 진입하면 신규 참여자 추가를 차단해야 한다.

수용 기준:

* debating Phase에서는 중도 참여가 가능하다.
* drafting Phase부터는 참여자 추가 요청을 거절한다.
* 거절 사유를 CLI/API/UI에 명확히 반환한다.

---

### 9.3 문서 관리

#### FR-DOC-001 첨부 문서 등록

사용자 또는 LLM 앱은 토론 주제와 관련된 문서를 등록할 수 있어야 한다.

수용 기준:

* 파일은 로컬 파일 시스템에 저장한다.
* PostgreSQL에는 파일 메타데이터를 저장한다.
* 문서는 프로젝트 또는 안건에 연결되어야 한다.

#### FR-DOC-002 공통 문서 열람

모든 참여자는 발언 전 공통 문서를 열람할 수 있어야 한다.

수용 기준:

* MCP/stdio 또는 API를 통해 문서 목록을 조회할 수 있어야 한다.
* 파일 내용은 가능한 경우 텍스트로 제공되어야 한다.
* 초기 MVP에서는 Markdown, txt 등 텍스트 기반 파일을 우선 지원한다.

---

### 9.4 참여자 관리

#### FR-PART-001 LLM 앱 참여자 등록

Codex, Cursor, Claude Code 같은 LLM 앱은 MCP/stdio 명령을 통해 프로젝트에 참여자로 등록될 수 있어야 한다.

수용 기준:

* 참여자 유형은 app으로 저장한다.
* display_name에는 실제 앱 이름과 모델명을 함께 저장한다.
* client_name에는 실제 앱 이름을 저장한다.
* model_name에는 해당 앱에서 사용 중인 모델명을 저장한다.
* anonymous_name은 `Member A`, `Member B` 형식으로 시스템이 자동 부여한다.
* 이미 등록된 앱이 중복 등록되지 않도록 처리해야 한다.

#### FR-PART-002 API Provider 참여자 등록

사용자는 API Provider 모델을 참여자로 등록할 수 있어야 한다.

수용 기준:

* Provider 선택이 가능해야 한다.
* 모델명을 지정할 수 있어야 한다.
* 필요한 API key가 환경변수에 없으면 사용자에게 API key 입력을 요청할 수 있어야 한다.
* 입력된 API key는 내부 shell script를 통해 환경변수에 추가되어야 한다.
* API key 자체는 PostgreSQL에 저장하지 않는다.
* display_name에는 실제 모델명을 저장한다.
* anonymous_name은 `Member A`, `Member B` 형식으로 시스템이 자동 부여한다.

#### FR-PART-003 참여자 목록 표시

사용자 화면에서는 실제 참여자명을 표시해야 한다.

수용 기준:

* 웹 UI의 참여자 목록에는 display_name을 표시한다.
* LLM App Participant의 display_name은 앱 이름과 모델명을 함께 표시한다.
* 각 참여자의 상태를 표시한다.
* 발언권을 가진 참여자를 강조한다.

#### FR-PART-004 LLM용 참여자 목록 익명화

LLM에게 제공되는 참여자 목록은 익명 이름으로만 구성되어야 한다.

수용 기준:

* LLM 컨텍스트에는 display_name, provider_name, model_name, client_name이 포함되면 안 된다.
* LLM 컨텍스트에는 anonymous_name만 포함된다.
* anonymous_name은 `Member A`, `Member B` 형식을 사용한다.

---

### 9.5 메시지 및 토론 기록

#### FR-MSG-001 메시지 제출

발언권을 가진 참여자는 메시지를 제출할 수 있어야 한다.

수용 기준:

* 현재 발언권을 가진 참여자만 메시지를 제출할 수 있다.
* 메시지는 PostgreSQL에 저장된다.
* 메시지 저장 후 SSE 이벤트가 발행된다.

#### FR-MSG-002 사용자 화면 메시지 표시

사용자 화면에는 실제 참여자명으로 메시지가 표시되어야 한다.

수용 기준:

* 메시지 말풍선에는 display_name을 표시한다.
* LLM App Participant의 메시지 말풍선에는 앱 이름과 모델명이 함께 표시된다.
* 메시지 생성 시각을 표시한다.
* Phase 또는 Turn 정보는 선택적으로 표시할 수 있다.

#### FR-MSG-003 LLM 컨텍스트 메시지 익명화

LLM이 이전 대화 기록을 조회할 때는 메시지 작성자가 익명 이름으로 표시되어야 한다.

수용 기준:

* 이전 대화 기록의 작성자명은 anonymous_name으로 치환된다.
* anonymous_name은 `Member A`, `Member B` 형식을 사용한다.
* 실제 모델명과 앱 이름은 제공하지 않는다.
* 현재 요청 중인 LLM 자신도 익명 이름으로 식별된다.

#### FR-MSG-004 대화 기록 조회

사용자와 LLM 앱은 대화 기록을 조회할 수 있어야 한다.

수용 기준:

* 사용자용 조회는 실제 이름 기반이다.
* LLM용 조회는 익명 이름 기반이다.
* 조회 결과는 시간순으로 정렬된다.

---

### 9.6 발언권 제어

#### FR-TURN-001 자동 발언권 부여

시스템은 자동으로 다음 발언자를 결정해야 한다.

수용 기준:

* 기본 전략은 라운드 로빈이다.
* 비활성 참여자는 건너뛸 수 있어야 한다.
* 현재 발언권 정보는 DB에 저장되어야 한다.

#### FR-TURN-002 발언권 없는 참여자의 발언 차단

현재 발언권이 없는 참여자는 메시지를 제출할 수 없어야 한다.

수용 기준:

* 발언권이 없는 참여자의 제출은 실패 처리한다.
* 실패 응답에는 현재 발언권을 가진 참여자 정보를 포함할 수 있다.
* LLM용 응답에서는 현재 발언권자를 익명 이름으로 알려준다.

#### FR-TURN-003 발언 전 컨텍스트 조회

LLM은 발언하기 전 이전 대화 기록과 공통 문서를 조회해야 한다.

수용 기준:

* MCP/stdio 도구는 발언에 필요한 컨텍스트 조회 명령을 제공해야 한다.
* API Provider 호출 시 시스템이 자동으로 익명화된 컨텍스트를 구성해야 한다.

---

### 9.7 결과물 생성

#### FR-REPORT-001 보고서 작성자 지정

사용자는 결과물을 정리할 참여자를 지정할 수 있어야 한다.

수용 기준:

* 지정하지 않으면 첫 번째 참여자를 기본 보고서 작성자로 사용한다.
* 보고서 작성자는 drafting 및 finalizing 단계에서 초안과 최종안을 작성한다.

#### FR-REPORT-002 합의안 초안 생성

정해진 턴 또는 라운드 이후 보고서 작성자는 합의안 초안을 생성해야 한다.

수용 기준:

* 초안은 DB에 저장된다.
* 사용자 화면에 표시된다.
* SSE로 초안 생성 이벤트를 전송한다.

#### FR-REPORT-003 합의안 피드백

각 참여자는 합의안 초안에 대해 피드백할 수 있어야 한다.

수용 기준:

* 피드백 순서는 시스템이 제어한다.
* 피드백은 메시지 또는 report feedback으로 저장된다.
* LLM에게는 익명화된 초안 및 피드백 맥락을 제공한다.

#### FR-REPORT-004 최종 보고서 생성

보고서 작성자는 피드백을 반영해 최종 보고서를 생성해야 한다.

수용 기준:

* 최종 보고서는 Markdown 파일로 저장한다.
* 파일 경로를 DB에 저장한다.
* 사용자 화면에 파일 경로를 표시한다.
* SSE로 최종 보고서 생성 이벤트를 전송한다.

---

### 9.8 웹 UI

#### FR-UI-001 프로젝트 화면 제공

서버는 프로젝트 상태를 확인할 수 있는 EJS 기반 페이지를 제공해야 한다.

수용 기준:

* 프로젝트 이름 표시
* 현재 Phase 표시
* 참여자 목록 표시
* 현재 발언권 표시
* 메시지 목록 표시
* 첨부 문서 목록 표시
* 최종 보고서 경로 표시

#### FR-UI-002 말풍선 형태 메시지 표시

LLM 발언은 말풍선 형태로 표시되어야 한다.

수용 기준:

* 각 말풍선에는 display_name이 표시된다.
* LLM App Participant의 display_name은 앱 이름과 모델명을 함께 포함한다.
* 메시지 본문이 표시된다.
* 생성 시각이 표시된다.
* 발언 순서대로 표시된다.

#### FR-UI-003 SSE 기반 실시간 반영

브라우저는 SSE를 통해 새 이벤트를 수신하고 화면을 새로고침 없이 갱신해야 한다.

수용 기준:

* 새 메시지가 도착하면 말풍선이 추가된다.
* 현재 발언권이 바뀌면 UI가 갱신된다.
* 참여자가 추가되면 목록이 갱신된다.
* Phase가 바뀌면 상태 표시가 갱신된다.
* 최종 보고서가 생성되면 경로가 표시된다.

---

### 9.9 CLI 및 MCP/stdio

#### FR-CLI-001 영어 명령어 제공

프로그램 구동 명령어는 영어로 제공되어야 한다.

예시:

```bash
llm-salon start my-project
llm-salon project list
llm-salon join my-project --client codex --model gpt-5.1
llm-salon topic create my-project --file ./brief.md
llm-salon provider add gemini --project my-project --model gemini-1.5-pro
llm-salon status my-project
llm-salon logs my-project
```

#### FR-MCP-001 MCP/stdio 지원

LLM 앱은 MCP/stdio 방식으로 LLM-Salon 기능을 호출할 수 있어야 한다.

필수 도구:

* create_project
* get_project_status
* join_project
* create_topic
* add_document
* get_context
* get_turn
* submit_message
* get_report_status

#### FR-MCP-002 LLM용 응답 익명화

MCP/stdio를 통해 LLM 앱이 조회하는 토론 컨텍스트는 익명화되어야 한다.

수용 기준:

* 참여자명은 anonymous_name으로 표시된다.
* anonymous_name은 `Member A`, `Member B` 형식을 사용한다.
* 실제 모델명과 앱 이름은 포함하지 않는다.
* 사용자 화면용 display_name은 MCP 컨텍스트 응답에 포함하지 않는다.

---

## 10. 비기능 요구사항

### 10.1 로컬 실행

LLM-Salon은 로컬에서 실행되어야 한다.

수용 기준:

* 서버는 로컬 프로세스로 실행된다.
* 데이터베이스는 로컬 PostgreSQL을 사용한다.
* 첨부 파일과 결과물은 로컬 파일 시스템에 저장한다.

### 10.2 단순성

프로그램은 가볍고 단순해야 한다.

수용 기준:

* 초기 UI는 EJS + vanilla JavaScript + SSE로 구현한다.
* 별도 SPA 프레임워크를 도입하지 않는다.
* 초기 MVP에서는 복잡한 플러그인 시스템을 피한다.

### 10.3 신뢰성

발언 순서와 메시지 저장은 일관성을 가져야 한다.

수용 기준:

* 메시지 저장과 턴 변경은 트랜잭션으로 처리한다.
* 중복 발언 제출을 방지한다.
* 서버 재시작 후에도 프로젝트 상태를 복구할 수 있어야 한다.

### 10.4 보안

API key와 작업 자료는 안전하게 다뤄야 한다.

수용 기준:

* API key는 환경변수로 관리한다.
* Provider 추가 과정에서 API key가 없는 경우 사용자가 입력할 수 있어야 한다.
* 입력된 API key는 내부 shell script를 통해 환경변수에 추가되어야 한다.
* API key를 DB에 저장하지 않는다.
* 로그에 API key를 출력하지 않는다.
* 로컬 파일 경로 접근은 프로젝트 디렉터리 내부로 제한한다.

### 10.5 성능

초기 MVP는 소규모 로컬 토론을 대상으로 한다.

수용 기준:

* 참여자 2~6명 규모를 우선 지원한다.
* 수백 개 메시지까지 웹 UI에서 확인 가능해야 한다.
* SSE 연결은 프로젝트 화면당 1개를 기본으로 한다.

---

## 11. 데이터 모델 초안

### 11.1 projects

```text
id
name
slug
status
created_at
updated_at
```

### 11.2 topics

```text
id
project_id
title
description
mode
phase
max_rounds
max_turns
current_round
reporter_participant_id
created_at
updated_at
```

### 11.3 participants

```text
id
project_id
display_name
anonymous_name
participant_type
provider_name
model_name
client_name
status
joined_at
created_at
updated_at
```

### 11.4 documents

```text
id
project_id
topic_id
file_name
file_path
mime_type
content_hash
created_at
```

### 11.5 messages

```text
id
project_id
topic_id
participant_id
turn_index
round_index
phase
content
created_at
```

### 11.6 turns

```text
id
project_id
topic_id
current_participant_id
turn_index
round_index
phase
status
created_at
updated_at
```

### 11.7 reports

```text
id
project_id
topic_id
reporter_participant_id
status
draft_content
final_content
file_path
created_at
updated_at
```

---

## 12. SSE 이벤트 명세 초안

### 12.1 message.created

새 메시지가 생성되었을 때 발생한다.

사용자 화면용 payload는 display_name을 포함한다.

```json
{
  "type": "message.created",
  "projectId": "project-id",
  "topicId": "topic-id",
  "message": {
    "id": "message-id",
    "displayName": "Codex / GPT-5.1",
    "content": "이 요구사항에서는 발언권 제어가 핵심입니다.",
    "phase": "debating",
    "turnIndex": 1,
    "createdAt": "2026-05-14T12:00:00.000Z"
  }
}
```

### 12.2 turn.changed

현재 발언권이 바뀌었을 때 발생한다.

```json
{
  "type": "turn.changed",
  "projectId": "project-id",
  "topicId": "topic-id",
  "currentParticipant": {
    "id": "participant-id",
    "displayName": "Cursor / GPT-5.1"
  },
  "turnIndex": 2,
  "roundIndex": 1
}
```

### 12.3 participant.joined

새 참여자가 등록되었을 때 발생한다.

```json
{
  "type": "participant.joined",
  "projectId": "project-id",
  "participant": {
    "id": "participant-id",
    "displayName": "Claude Code / Claude Sonnet 4.5",
    "status": "waiting"
  }
}
```

### 12.4 topic.phase_changed

토론 단계가 변경되었을 때 발생한다.

```json
{
  "type": "topic.phase_changed",
  "projectId": "project-id",
  "topicId": "topic-id",
  "phase": "drafting"
}
```

### 12.5 report.created

최종 보고서가 생성되었을 때 발생한다.

```json
{
  "type": "report.created",
  "projectId": "project-id",
  "topicId": "topic-id",
  "report": {
    "id": "report-id",
    "filePath": "./llm-salon/projects/my-project/final-report.md"
  }
}
```

---

## 13. 화면 요구사항

### 13.1 Project Dashboard

프로젝트 대시보드는 사용자가 토론 상태를 실시간으로 확인하는 메인 화면이다.

필수 영역:

* 프로젝트 헤더
* 토론 상태 배지
* 참여자 목록
* 현재 발언권 표시
* 첨부 문서 목록
* 메시지 말풍선 영역
* 합의안 또는 결과물 영역

### 13.2 메시지 말풍선

각 메시지는 다음 정보를 포함한다.

* 실제 참여자명
* 메시지 본문
* 생성 시각
* 토론 Phase

사용자 화면에는 반드시 display_name을 표시한다.

LLM App Participant의 display_name은 앱 이름과 모델명을 함께 포함해야 한다.

### 13.3 실시간 업데이트 UX

브라우저는 페이지 로드 시 SSE 연결을 생성한다.

동작:

* message.created 수신 시 메시지 목록 끝에 말풍선 추가
* turn.changed 수신 시 현재 발언권 표시 갱신
* participant.joined 수신 시 참여자 목록 갱신
* topic.phase_changed 수신 시 상태 배지 갱신
* report.created 수신 시 결과물 경로 표시

### 13.4 연결 상태 표시

SSE 연결 상태를 사용자에게 표시할 수 있어야 한다.

상태 예시:

* Connected
* Reconnecting
* Disconnected

---

## 14. LLM 프롬프트 컨텍스트 요구사항

### 14.1 LLM 발언 전 컨텍스트

LLM에게 발언을 요청할 때 제공되는 컨텍스트는 다음을 포함해야 한다.

* 프로젝트 개요
* 안건 제목
* 안건 설명
* 토론 모드
* 현재 Phase
* 현재 라운드와 턴
* 공통 문서 내용 또는 요약
* 익명화된 참여자 목록
* 익명화된 이전 대화 기록
* 현재 LLM의 익명 이름
* 발언 지시사항

### 14.2 금지되는 컨텍스트

LLM에게 제공되는 컨텍스트에는 다음이 포함되면 안 된다.

* 실제 모델명
* 실제 앱 이름
* Provider 브랜드명
* API Provider 이름
* 다른 참여자의 display_name

### 14.3 LLM 발언 지시사항 예시

```text
You are Member B in this discussion.
Do not infer or speculate about the real model, app, or provider behind each member.
Evaluate arguments only by their content.
Before responding, consider the shared documents and previous messages.
Respond only when it is your turn.
```

---

## 15. 토론 상태 머신

### 15.1 기본 흐름

```text
created
  -> preparing
  -> debating
  -> drafting
  -> reviewing
  -> finalizing
  -> finalized
  -> closed
```

### 15.2 상태별 규칙

#### preparing

* 프로젝트와 안건을 준비하는 단계
* 문서 등록 가능
* 참여자 등록 가능

#### debating

* 참여자들이 순서대로 의견을 제시하는 단계
* 중도 참여 가능
* 메시지 제출 가능
* 최대 턴 또는 라운드 도달 시 drafting으로 전환

#### drafting

* 보고서 작성자가 합의안 초안을 작성하는 단계
* 신규 참여자 등록 불가
* 초안 생성 후 reviewing으로 전환

#### reviewing

* 참여자들이 합의안 초안에 대해 피드백하는 단계
* 신규 참여자 등록 불가
* 피드백 완료 후 finalizing으로 전환

#### finalizing

* 보고서 작성자가 최종 보고서를 작성하는 단계
* 완료 시 finalized로 전환

#### finalized

* 최종 보고서가 생성된 상태
* 프로젝트 종료 준비 상태

#### closed

* 프로젝트가 종료된 상태
* 신규 메시지 제출 불가

---

## 16. MVP 범위

### 16.1 MVP에 포함

* NestJS 로컬 서버
* PostgreSQL 저장소
* EJS 기반 프로젝트 화면
* SSE 기반 실시간 메시지 반영
* 프로젝트 생성
* 프로젝트 생성 후 브라우저 자동 실행
* 단일 안건 생성
* 문서 첨부
* LLM 앱 참여자 등록 인터페이스
* LLM 앱 이름과 모델명을 포함한 Display Name 표시
* API Provider 참여자 등록
* Provider API key가 없는 경우 사용자 입력 및 shell script 기반 환경변수 추가
* 실제 이름과 익명 이름 분리
* 사용자 화면 실제 이름 표시
* LLM 컨텍스트 익명 이름 표시
* `Member A`, `Member B` 형식의 익명 이름 사용
* 라운드 로빈 발언권 제어
* 메시지 저장
* 최대 턴 또는 라운드 제한
* 합의안 초안 작성
* 피드백 라운드
* 최종 Markdown 보고서 생성
* 영어 README
* 인간 사용자를 위한 사용법 문서

### 16.2 MVP에서 제외

* 다중 안건 동시 진행
* 복잡한 권한 시스템
* 클라우드 동기화
* 사용자 계정
* 고급 파일 파싱
* 벡터 DB 기반 문서 검색
* 고급 프론트엔드 프레임워크
* 모바일 최적화
* 별도 moderator LLM
* 복잡한 합의 알고리즘

---

## 17. 성공 기준

LLM-Salon MVP는 다음 조건을 만족하면 성공으로 본다.

1. 사용자가 로컬에서 프로젝트를 생성할 수 있다.
2. 프로젝트 생성 후 시스템이 기본 브라우저를 자동으로 실행하여 해당 프로젝트 URL에 접속한다.
3. 브라우저 자동 실행에 실패하더라도 CLI에 프로젝트 접근 URL이 출력된다.
4. Codex, Cursor, Claude Code 같은 LLM 앱이 MCP/stdio 방식으로 프로젝트에 참여할 수 있다.
5. LLM 앱 참여자의 사용자 화면 Display Name에는 앱 이름과 모델명이 함께 표시된다.
6. API key가 환경변수에 존재하는 Provider 모델을 토론에 참여시킬 수 있다.
7. API key가 환경변수에 없는 경우 사용자가 API key를 입력하고, 시스템이 내부 shell script를 통해 환경변수에 추가한 뒤 Provider 모델을 참여시킬 수 있다.
8. 사용자 화면에서는 실제 모델명 또는 앱 이름이 표시된다.
9. LLM에게 제공되는 토론 컨텍스트에서는 참여자명이 `Member A`, `Member B` 형식으로 익명화된다.
10. 시스템이 발언권을 자동으로 제어한다.
11. LLM 발언이 PostgreSQL에 저장된다.
12. 브라우저 화면은 SSE를 통해 새 발언을 새로고침 없이 표시한다.
13. 정해진 턴 이후 합의안 초안과 피드백 라운드가 진행된다.
14. 최종 결과물이 Markdown 파일로 저장되고 경로가 사용자에게 표시된다.

---

## 18. 오픈 이슈

### 18.1 별도 사회자 LLM 필요 여부

현재 MVP에서는 별도 사회자 LLM을 두지 않는다.

시스템이 발언권과 상태 전환을 관리하고, 지정된 보고서 작성자가 합의안 작성과 최종 정리를 담당한다.

향후 필요 시 moderator participant를 선택 기능으로 추가할 수 있다.

### 18.2 LLM 앱 제어 범위

Codex, Cursor, Claude Code 같은 LLM 앱을 서버가 직접 완전히 제어하기는 어렵다.

따라서 MVP에서는 LLM 앱이 MCP/stdio 명령을 통해 능동적으로 다음 행동을 수행하는 구조를 전제로 한다.

* 프로젝트 참여
* 컨텍스트 조회
* 발언권 확인
* 발언 제출

### 18.3 문서 파싱 범위

초기에는 Markdown, txt 등 텍스트 기반 파일을 우선 지원한다.

PDF, docx, xlsx, 이미지 기반 문서는 후속 버전에서 별도 파서 또는 추출기를 도입할 수 있다.

### 18.4 최종 보고서에서 실제 모델명 표시 여부

기본 최종 보고서 본문은 익명 이름 기준으로 작성하는 것이 적절하다.

다만 사용자용 메타데이터 영역에는 실제 참여자 목록을 표시할 수 있다.

이 정책은 사용자가 설정할 수 있도록 확장 가능하다.

---

## 19. README 요구사항

README는 영어로 작성한다.

포함해야 할 내용:

* What is LLM-Salon?
* Installation
* Requirements
* PostgreSQL setup
* Environment variables
* Starting a project
* Opening the web UI
* Adding LLM app participants
* Adding API provider participants
* Creating a topic
* Attaching documents
* Running a debate
* Viewing real-time messages
* Understanding anonymization
* Generating a final report
* CLI reference
* MCP/stdio integration guide
* Troubleshooting

---

## 20. 제품 요약

LLM-Salon은 로컬에서 실행되는 경량 LLM 토론 오케스트레이터이다.

사용자는 프로젝트를 만들고, 공통 자료를 첨부하고, Codex, Cursor, Claude Code 같은 LLM 앱과 API Provider 모델을 참여시켜 하나의 안건에 대해 토론하게 할 수 있다.

사용자 화면에서는 실제 모델명과 앱 이름이 표시되어 투명성을 유지한다. LLM App Participant의 경우 앱 이름과 모델명을 함께 표시한다. 반면 LLM에게 제공되는 대화 기록과 참여자 정보는 `Member A`, `Member B` 형식으로 익명화되어, 모델 브랜드에 따른 편향을 줄인다.

서버는 NestJS로 구현하며, EJS 기반 서버사이드 렌더링 화면을 제공한다. 브라우저는 SSE를 통해 새 발언, 발언권 변경, 참여자 추가, 보고서 생성 상태를 새로고침 없이 실시간으로 반영한다.

프로젝트 생성 후에는 기본 브라우저를 자동으로 실행해 해당 프로젝트 URL에 접속한다. API Provider 추가 시 필요한 API key가 환경변수에 없으면 사용자가 입력할 수 있으며, 시스템은 내부 shell script를 통해 환경변수에 추가한다.

최종적으로 LLM-Salon은 여러 LLM이 하나의 로컬 회의실에서 질서 있게 토론하고, 사용자가 활용 가능한 합의안 또는 선택지 기반 보고서를 생성하도록 돕는 도구이다.
