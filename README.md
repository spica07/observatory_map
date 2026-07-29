# 천문대 지도 (observatory_map)

전국 천문대·천문과학관과 은하수 관측 명소를 한 지도에 담은 PWA.
**"유아를 데리고 갈 수 있는가"를 1급 정보로 다룬다**는 점이 다른 지도 앱과 다르다.

- 수록: 87곳 (천문대 61 · 과학관 15 · 관측명소 11)
- 달 위상 달력으로 "은하수 보기 좋은 밤"을 표시 (API 없이 계산, 오프라인 동작)
- 모든 지도 앱 공통 규칙대로 독도를 직접 표시

설계 문서: `docs/superpowers/specs/2026-07-30-observatory-map-design.md`

## 구조

```
index.html            지도 + 필터 + 상세 모달 + 달 위상 패널
report.html           데이터 현황 리포트 (메인 UI에서 버튼 숨김, URL 직접 접근)
assets/js/data.js     자동 생성 — 직접 수정 금지
assets/js/moon.js     달 위상 계산 (외부 의존성 없음)
tools/places.json     ★ 사람이 관리하는 원본 (단일 진실 공급원)
```

## 데이터 갱신 절차

```bash
py tools/fetch_kasi.py     # KASI 국내천문대 목록 → tools/kasi_seed.json (누락 검증용)
# tools/places.json 을 손으로 고친다
py tools/geocode.py        # 카카오 로컬 API로 좌표 → tools/coords.json
py tools/check_links.py    # homepage/reserveUrl/source 링크 생존 확인
py tools/build_data.py     # → assets/js/data.js, 검증 경고가 있으면 종료코드 1
py tools/verify_ui.py      # Playwright 로 UI 동작 검증
```

배포 후 `sw.js` 의 `CACHE` 버전을 올린다.

`tools/make_icons.py` 는 PWA 아이콘 4종을 다시 그린다 (밤하늘 + 은하수 + 초승달 + 천문대 돔).

## 데이터에 대해 알아야 할 것

**이 앱에는 자동 갱신 가능한 공공 표준데이터셋이 없다.** 다른 지도 앱 5종과 결정적으로 다르다.

- 한국천문연구원 「국내천문대」 목록은 **이름·지역 68곳만** 파싱된다. 상세 정보를 주는
  `/learning/observatory` AJAX 엔드포인트는 외부 호출 시 404다 (GET/POST · EUC-KR/UTF-8 ·
  세션 쿠키 조합 모두 실패, 2026-07-30 확인). 그래서 이 목록은 **시설 누락 검증용 체크리스트**로만 쓴다.
- 그 목록도 최신이 아니다. 강서별빛우주과학관·강화천문과학관·부천천문과학관·서울시립과학관이
  빠져 있고, 폐관한 국립서울과학관이 남아 있다. 제외 대상은 `build_data.py` 의 `KASI_EXCLUDED` 에
  이유와 함께 적어 두었다.
- 과학관은 공공데이터포털에 표준데이터셋이 없고, 관측명소는 공공 데이터가 애초에 없다.

### 판정 필드 (중요)

`kidLevel`(유아 동반 등급)과 `darkLevel`(밤하늘 어둠 등급)은 **어떤 공공 데이터에도 없는,
조사 기반 추정 판정이다.** 그래서

- 반드시 근거 문장(`kidNote` / `darkNote`)과 함께 저장한다 — `build_data.py` 가 빈 값을 경고한다
- 상세 모달에 근거와 `source` 링크를 노출하고 "방문 전 직접 확인" 문구를 함께 띄운다
- 모르는 값은 `"모름"` 으로 둔다. 추측으로 채우지 않는다

`report.html` 의 "아직 확인하지 못한 정보" 표가 항목별 미확인 비율을 보여준다.
전화번호·수유실·망원경 정보는 아직 미확인 비율이 높다.

## 환경

- 파이썬은 `python` 이 아니라 **`py`** (Windows 스토어 스텁 때문)
- 카카오 지오코딩 키는 `.env` 의 `KAKAO_REST_KEY` (gitignore, 카카오맵 API 활성화 필요)
- Playwright 실행 파일 경로는 `tools/verify_ui.py` 의 `CHROME` 상수

### 카카오 로컬 API 함정

카카오는 **광주·전남을 "전남광주통합특별시"로 표기**한다. 지역 검증에서 이걸 처리하지 않으면
국립광주과학관·빛고을천문대 같은 광주 시설이 전부 걸러진다 (`geocode.py` 의 `REGION_ALIASES`).
또 **키워드검색 결과에는 `region_1depth_name` 필드가 없다** — 주소 검색에만 있어서,
키워드 결과는 `address_name` 의 첫 토큰에서 광역명을 뽑아야 한다 (`region1_of`).
