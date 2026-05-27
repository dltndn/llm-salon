# 설치 경험 분석 및 개선 제안

## 목적

이 문서는 `README.md`의 설치 절차를 실제 로컬 환경에서 수행하면서 확인한 불편 사항을 사용자 관점에서 정리한다. 목표는 설치 문서를 더 정확하게 만들고, CLI가 사용자를 더 잘 안내하도록 개선 지점을 도출하는 것이다.

## 관찰된 설치 흐름

설치는 대체로 다음 순서로 진행되었다.

1. `README.md`와 프로젝트 지침 확인
2. Node.js, pnpm, PostgreSQL 상태 확인
3. pnpm 설치
4. 의존성 설치 또는 기존 `node_modules` 상태 확인
5. 빌드
6. 전역 CLI 링크
7. `~/.llm-salon/.env` 초기화
8. PostgreSQL 15 설치 및 서비스 시작
9. `llm_salon` 데이터베이스 생성
10. Prisma 마이그레이션 적용
11. `llm-salon` CLI 동작 확인

최종적으로 설치는 완료되었지만, 여러 단계에서 README만 보고 진행하는 사용자가 막힐 수 있는 지점이 확인되었다.

## 주요 불편 사항

### 1. `corepack enable`을 전제로 하지만 Corepack이 없을 수 있음

README는 `corepack enable`을 첫 설치 단계로 안내한다. 그러나 확인한 환경에서는 Node.js가 설치되어 있었지만 `corepack` 명령이 존재하지 않았다.

사용자 영향:

- 첫 명령부터 실패해 설치 절차 전체에 대한 신뢰가 떨어진다.
- 사용자는 pnpm을 어떻게 설치해야 하는지 README만으로 판단하기 어렵다.
- Node.js 버전은 충분히 높아 보여도 Corepack이 없을 수 있다는 점이 드러나지 않는다.

개선 제안:

- README에 `corepack`이 없을 때의 대체 경로를 추가한다.
- 예: `npm install -g pnpm@10.11.0`
- `node -v`, `corepack --version`, `pnpm -v`를 먼저 확인하는 사전 점검 섹션을 둔다.

### 2. pnpm 전역 링크에 `PNPM_HOME` 설정이 필요함

`pnpm link --global`은 `PNPM_HOME` 또는 전역 bin 디렉터리가 설정되어 있지 않으면 실패했다. `pnpm setup` 실행 후에도 현재 셸 세션에는 PATH가 바로 반영되지 않아, 환경변수를 명시한 뒤 다시 링크해야 했다.

사용자 영향:

- `pnpm link --global` 실패 메시지가 나오면 설치가 실패한 것처럼 보인다.
- `pnpm setup` 후 새 터미널을 열어야 한다는 흐름이 README에 충분히 드러나지 않는다.
- 기존 셸 설정이 복잡한 사용자는 `llm-salon` 명령이 설치됐는지 확인하기 어렵다.

개선 제안:

- 전역 링크 전 `pnpm setup`이 필요할 수 있음을 명시한다.
- `pnpm setup` 후 새 터미널을 열거나 `source ~/.zshrc`를 실행하라고 안내한다.
- 링크 검증 명령을 추가한다.

```sh
command -v llm-salon
llm-salon --help
```

### 3. `pnpm install`이 기존 `node_modules` 삭제 확인을 요구할 수 있음

기존 `node_modules`가 있는 상태에서 `pnpm install`을 실행하자, pnpm이 모듈 디렉터리를 삭제하고 재설치할지 묻는 프롬프트를 표시했다. 네트워크나 캐시 상태가 불안정한 환경에서는 이 단계가 특히 위험하게 느껴질 수 있다.

사용자 영향:

- 사용자는 기존 의존성을 지워도 되는지 판단하기 어렵다.
- 네트워크가 막혀 있거나 registry 접근이 실패하면 재설치가 중간에 멈출 수 있다.
- 자동화 환경에서는 프롬프트가 설치를 정지시킬 수 있다.

개선 제안:

- README에 "기존 checkout에 `node_modules`가 있을 때 pnpm이 재설치 확인을 요청할 수 있다"는 주의 문구를 추가한다.
- CI나 자동화용 명령과 일반 사용자용 명령을 구분한다.
- 기존 의존성이 이미 설치된 개발 환경에서는 `pnpm build`로 먼저 검증할 수 있음을 안내한다.

### 4. PostgreSQL 요구 버전과 실제 PATH의 버전이 다를 수 있음

README는 PostgreSQL 15 이상을 요구한다. 실제 환경에는 PostgreSQL 14가 PATH에 연결되어 있었고, PostgreSQL 15를 설치해도 Homebrew 특성상 14가 계속 기본 명령을 가로막았다.

사용자 영향:

- `psql --version`은 14를 보여주지만 15도 설치되어 있는 혼란스러운 상태가 된다.
- `createdb`, `psql`, `pg_isready`가 의도한 PostgreSQL 15가 아니라 기존 14 명령을 실행할 수 있다.
- 사용자는 `brew link postgresql@15`를 해야 하는지, 전체 경로를 써야 하는지 판단하기 어렵다.

개선 제안:

- macOS Homebrew 사용자를 위한 PostgreSQL 15 설치 섹션을 분리한다.
- `postgresql@15`가 keg-only로 설치될 수 있고, 기존 PostgreSQL 버전이 PATH를 shadow할 수 있음을 설명한다.
- 버전 확인 명령을 명확히 제시한다.

```sh
/opt/homebrew/opt/postgresql@15/bin/psql --version
brew services start postgresql@15
/opt/homebrew/opt/postgresql@15/bin/pg_isready
```

### 5. PostgreSQL 서비스 시작과 DB 생성 실패 원인이 분리되어 있지 않음

`createdb llm_salon`은 PostgreSQL 서버가 실행 중이지 않으면 소켓 연결 실패를 낸다. README에는 DB 생성 명령은 있지만, 서버 상태 확인과 서비스 시작 절차가 충분히 앞에 놓여 있지 않다.

사용자 영향:

- `createdb` 실패를 권한 문제, 설치 문제, URL 문제 중 무엇으로 봐야 할지 알기 어렵다.
- macOS 사용자는 PostgreSQL을 설치했더라도 서비스가 자동으로 실행되지 않을 수 있다.

개선 제안:

- DB 생성 전에 `pg_isready`를 실행하도록 안내한다.
- macOS Homebrew 기준 서비스 시작 명령을 함께 제시한다.
- 실패 메시지별 대응표를 README 또는 사용자 가이드에 추가한다.

### 6. `llm-salon env init` 결과에 `DATABASE_URL`이 포함되지 않음

README의 설정 예시는 `DATABASE_URL`을 포함하지만, 실제 `llm-salon env init`으로 생성된 `.env`에는 provider API key 항목만 있었다. 이 때문에 사용자는 README 예시를 다시 보고 수동으로 DB URL을 추가해야 한다.

사용자 영향:

- `env init`만 실행하면 설정이 완료된 것으로 오해하기 쉽다.
- 첫 실행 또는 마이그레이션 단계에서 DB 설정 누락으로 실패할 수 있다.
- README 예시와 CLI 생성 파일이 달라 설치 경험이 끊긴다.

개선 제안:

- `.env.example` 또는 `env init` 출력에 `DATABASE_URL` 템플릿을 포함한다.
- `env init` 완료 메시지에서 "DATABASE_URL은 반드시 직접 채워야 한다"고 강조한다.
- 가능하면 `llm-salon env doctor` 같은 점검 명령으로 필수 값 누락을 알려준다.

### 7. README의 `DATABASE_URL` 예시는 로컬 사용자명 문제를 일으킬 수 있음

README 예시는 다음 형태다.

```dotenv
DATABASE_URL="postgresql://localhost:5432/llm_salon?schema=public"
```

이 값으로 Prisma 마이그레이션을 실행하면 schema engine이 빈 사용자로 접속을 시도했고, `User `` was denied access` 오류가 발생했다. 실제로는 로컬 PostgreSQL 소유자에 맞춰 사용자명을 포함해야 했다.

```dotenv
DATABASE_URL="postgresql://dev@localhost:5432/llm_salon?schema=public"
```

사용자 영향:

- DB는 생성되어 있고 `psql` 접속도 되는데 Prisma만 실패하는 것처럼 보인다.
- Prisma CLI는 상위 오류를 `Schema engine error`로만 보여줘 원인 파악이 어렵다.
- 사용자는 PostgreSQL 권한, Prisma, Node 버전 중 어디를 봐야 할지 혼란스러워진다.

개선 제안:

- README 예시를 사용자명 포함 형태로 바꾼다.
- macOS 로컬 설치 예시는 현재 OS 사용자명을 사용하는 형태로 안내한다.

```sh
DATABASE_URL="postgresql://$(whoami)@localhost:5432/llm_salon?schema=public"
```

- `Schema engine error`가 발생할 때 `DATABASE_URL`에 사용자명이 빠져 있는지 확인하라는 troubleshooting 항목을 추가한다.

### 8. Prisma 마이그레이션 실패 메시지가 너무 불친절함

`llm-salon project list` 실행 중 내부적으로 `prisma migrate deploy`가 실패했지만, 사용자에게 보인 메시지는 `Schema engine error`뿐이었다. 직접 schema engine을 실행해야 `P1010`과 빈 사용자 접근 거부 원인을 확인할 수 있었다.

사용자 영향:

- 사용자는 해결에 필요한 정보를 얻기 위해 내부 도구를 알아야 한다.
- 설치 실패가 DB URL 문제인지 Prisma 바이너리 문제인지 구분하기 어렵다.
- 초보 사용자는 여기서 설치를 포기할 가능성이 높다.

개선 제안:

- 마이그레이션 실패 시 stderr 전체를 보존해 출력한다.
- `DATABASE_URL` 값 자체는 노출하지 않되, host, database, username 존재 여부처럼 안전한 진단 정보를 출력한다.
- 흔한 원인별 힌트를 제공한다.

예:

```text
Prisma migration failed.
- DATABASE_URL has no username.
- PostgreSQL is reachable at localhost:5432.
- Try: DATABASE_URL="postgresql://<your-os-user>@localhost:5432/llm_salon?schema=public"
```

### 9. 설치와 실행 검증의 경계가 불명확함

README의 설치 섹션은 `pnpm link --global`에서 끝나고, 설정과 시작 절차가 이어진다. 그러나 사용자는 어느 시점에 "설치가 끝났고", 어느 시점부터 "설정 문제"인지 구분하기 어렵다.

사용자 영향:

- 빌드 성공, CLI 링크 성공, DB 준비, 마이그레이션 성공이 하나의 긴 절차로 섞인다.
- 실패 지점별로 되돌아갈 기준이 없다.

개선 제안:

- README에 단계별 완료 기준을 추가한다.

| 단계 | 완료 확인 |
|---|---|
| 의존성 | `pnpm -v`가 10.11.0 이상 |
| 빌드 | `pnpm build` 성공 |
| CLI 링크 | `llm-salon --help` 출력 |
| DB | `pg_isready` 성공, `llm_salon` DB 존재 |
| 마이그레이션 | `pnpm prisma migrate deploy` 성공 |
| 앱 | `llm-salon project list` 또는 `llm-salon start "<name>"` 성공 |

## 우선순위별 개선안

### P0: 설치 실패를 직접 줄이는 개선

- `env init`이 생성하는 `.env`에 `DATABASE_URL` 템플릿을 포함한다.
- README의 `DATABASE_URL` 예시를 사용자명 포함 형태로 수정한다.
- Prisma 마이그레이션 실패 시 원인 힌트를 출력한다.
- PostgreSQL 15 설치, 서비스 시작, DB 생성, 연결 확인 순서를 macOS 기준으로 명확히 문서화한다.

### P1: 사용자 혼란을 줄이는 개선

- `corepack`이 없을 때 `npm install -g pnpm@10.11.0` 대체 경로를 제공한다.
- `pnpm setup`과 새 터미널 필요성을 `pnpm link --global` 앞에 배치한다.
- Homebrew PostgreSQL 버전 shadowing 문제를 troubleshooting에 추가한다.
- 단계별 검증 명령을 README에 추가한다.

### P2: 설치 UX를 장기적으로 개선하는 기능

- `llm-salon doctor` 명령 추가
  - Node 버전 확인
  - pnpm 존재 여부 확인
  - `llm-salon` PATH 확인
  - `.env` 존재 및 권한 확인
  - `DATABASE_URL` 필수 값과 사용자명 존재 여부 확인
  - PostgreSQL 연결 확인
  - 마이그레이션 상태 확인
- `llm-salon env init --database-url local` 같은 옵션 추가
  - OS 사용자명을 감지해 로컬 DB URL 템플릿 생성
- 첫 실행 실패 시 다음 명령을 바로 제안하는 guided troubleshooting 추가

## README에 추가하면 좋은 간단한 흐름

macOS Homebrew 사용자 기준으로는 다음 흐름이 더 안전하다.

```sh
node -v
corepack --version || npm install -g pnpm@10.11.0
pnpm -v

pnpm install
pnpm build

pnpm setup
# 새 터미널을 열거나 source ~/.zshrc
pnpm link --global
llm-salon --help

brew install postgresql@15
brew services start postgresql@15
/opt/homebrew/opt/postgresql@15/bin/createdb llm_salon

llm-salon env init
```

그 다음 `~/.llm-salon/.env`에 다음처럼 사용자명을 포함한 DB URL을 넣도록 안내한다.

```dotenv
DATABASE_URL="postgresql://<your-os-user>@localhost:5432/llm_salon?schema=public"
```

## 결론

현재 설치 절차는 필요한 정보를 대부분 제공하지만, "깨끗한 이상적 환경"을 전제로 한다. 실제 사용자 환경에서는 pnpm 전역 설정, PostgreSQL 버전 충돌, 서비스 미시작, DB URL 사용자명 누락, Prisma의 불친절한 오류가 연쇄적으로 발생할 수 있다.

가장 효과가 큰 개선은 README의 DB URL 예시 수정과 `env init` 결과 개선이다. 그 다음으로 `doctor` 명령 또는 상세한 troubleshooting을 추가하면, 사용자가 설치 실패 원인을 스스로 좁힐 수 있고 지원 비용도 크게 줄어든다.
