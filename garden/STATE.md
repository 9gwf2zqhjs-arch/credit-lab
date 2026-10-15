# 정원 STATE — 현재 상태 정본

갱신: 2026-10-15 · 상태: 1차 완료 기준을 mock 모드로 충족. 실제 키 연결·화면 확인은 로컬 맥에서.

## 실행
```
cd garden
python3 -m server          # http://127.0.0.1:8765
python3 -m unittest -v     # 서버 단위 테스트 18개
```
- 키가 없으면 mock 모드 (문장 해시로 결정적 유전자). `GARDEN_MOCK=1` 이면 키가 있어도 mock.
- 키: `garden/.env` 에 `ANTHROPIC_API_KEY=...` (커밋 금지, `.gitignore` 의 `.env` 에 걸림).
- 설정 환경변수: `GARDEN_MODEL`(기본 `claude-haiku-5-5`), `GARDEN_DAILY_LIMIT`(200),
  `GARDEN_MAX_CHARS`(200), `PORT`(8765), `GARDEN_DATA`(기본 `garden/data/garden.json`).
- 화면 주소에 `?days=N` 을 붙이면 N 일 뒤 정원을 미리 본다 (성장·시듦 확인용).

## 구조
- `server/genes.py` — 유전자 스키마·검증(범위 잘라내기, 잘못된 값은 기본값)·mock 생성.
  형태 7종: tree·shrub·vine·grass·flower·cactus·fern. `seed` 는 항상 서버가 문장 해시로 정한다.
- `server/claude.py` — Messages API 직접 호출(표준 라이브러리 urllib, 의존성 0).
  구조화 출력 `output_config.format`(json_schema) + `effort: low`. refusal·max_tokens·HTTP 오류는 502.
- `server/garden.py` — 식물 목록·문장 캐시·하루 상한을 `garden.json` 에 원자적 저장.
  같은 문장(공백 정규화)은 캐시 → 호출·상한에 안 셈. 새 생성은 실패해도 1회로 센다.
  심을 자리(x)는 후보 8개 중 최근 식물들과 가장 먼 곳.
- `server/__main__.py` — `GET /api/garden`, `POST /api/plant {text}` (201/400/429/502), `web/` 정적 서빙.
- `web/plant.js` — 유전자 → 시드 고정 구조(가지·잎·꽃·가시) → 성장도·시듦에 따라 그리기.
- `web/garden.js` — 씨앗 낙하 → 수십 초 성장(growth_speed), 실제 시간에 따라 최대 25% 더 자람,
  수명 70% 부터 시듦(갈변·잎 떨어짐·처짐), 수명이 끝나면 마른 채로 남음. 마우스 올리면 이름·문장·상태.

## 확인한 것 (클라우드, mock)
- 단위 테스트 18개 통과 (유전자 검증·mock 결정성·10문장 다양성·입력/하루 상한·캐시·영속·HTTP).
- Playwright(헤드리스 Chromium)로 문장 10개를 심어 스크린샷: 서로 다른 식물 10개,
  새로고침 후 유지, 툴팁, 30일 뒤 시듦, 콘솔 오류 없음.
- 실제 API 호출은 한 번도 안 해 봤다 (VM 에 키 없음).

## 할 일
1. (로컬 맥) 키 연결: `garden/.env` 에 키 넣고 `python3 -m server` → 왼쪽 위 표시가 `Claude` 인지,
   문장 몇 개로 실제 유전자가 오는지 확인. 실패하면 서버 로그·화면 오류의 `API 4xx` 메시지 확인.
   구조화 출력 스키마가 거절되면 `server/genes.py` 의 `SCHEMA` 를 손본다.
2. (로컬 맥) 화면으로 확인하고 다듬을 것 정하기. 눈에 띈 후보:
   - 시든 식물은 반투명 가지가 겹치는 마디가 진하게 보임.
   - 식물이 많아지면 정원이 꽉 참 — 오래된 것 치우기·가로 스크롤 등 정할 것.
   - mock 의 mood·이름은 문장 뜻과 무관 (해시). 실제 키로는 Claude 가 정함.

## 폐기
(없음)
