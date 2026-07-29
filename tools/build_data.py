# -*- coding: utf-8 -*-
"""places.json + coords.json -> assets/js/data.js

동시에 세 가지를 검증한다.
 1) KASI 시드(kasi_seed.json) 대조 — places.json 에도 없고 제외 목록에도 없는 천문대가 있으면 경고
 2) 필수 필드 — source·checkedAt, kidLevel/darkLevel 근거 문장
 3) 좌표 — 국내 범위, region 과 좌표의 대략적 일치

경고가 하나라도 있으면 종료 코드 1로 끝난다.
"""
import json
import re
import sys
from collections import Counter
from datetime import date
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

TOOLS = Path(__file__).resolve().parent
PLACES = TOOLS / "places.json"
COORDS = TOOLS / "coords.json"
SEED = TOOLS / "kasi_seed.json"
OUT = TOOLS.parent / "assets" / "js" / "data.js"

# KASI 목록에 있으나 이 지도에 넣지 않는 시설과 그 이유.
# 여기 적어 두면 누락 경고에서 빠지고, 왜 뺐는지가 코드에 남는다.
KASI_EXCLUDED = {
    "한국우주전파관측망 연세대학교천문대": "전파 관측 연구시설, 일반 관람 불가",
    "한국우주전파관측망 울산전파천문대": "전파 관측 연구시설, 일반 관람 불가",
    "한국우주전파관측망 탐라전파천문대": "전파 관측 연구시설, 일반 관람 불가",
    "대덕전파천문대": "전파 관측 연구시설, 일반 관람 불가",
    "소백산 천문대": "연구용 관측소, 일반 관람 제한",
    "영천보현산천문대": "연구용 관측소, 일반 관람 제한 (별도 시설 영천보현산천문과학관은 수록)",
    "한국천문연구원본원": "연구기관 본원, 관측 시설 아님",
    "국립서울과학관": "폐관 (국립어린이과학관으로 전환)",
}

# 광역 단위 좌표 범위 (느슨하게 — 경계 지역을 배제하지 않을 정도로)
REGION_BOX = {
    "서울": (37.40, 37.72, 126.75, 127.22), "인천": (36.95, 37.98, 124.55, 126.80),
    "경기": (36.85, 38.30, 126.35, 127.90), "강원": (37.00, 38.65, 127.05, 129.40),
    "충북": (36.00, 37.30, 127.25, 128.75), "충남": (35.95, 37.05, 125.95, 127.60),
    "대전": (36.18, 36.50, 127.25, 127.55), "세종": (36.40, 36.75, 127.05, 127.45),
    "전북": (35.30, 36.20, 126.35, 127.95), "전남": (33.90, 35.50, 125.05, 127.85),
    "광주": (35.05, 35.30, 126.60, 127.05), "경북": (35.55, 37.15, 127.75, 129.65),
    "경남": (34.55, 35.95, 127.55, 129.30), "대구": (35.60, 36.05, 128.35, 128.80),
    "부산": (34.90, 35.40, 128.75, 129.35), "울산": (35.30, 35.75, 128.95, 129.50),
    "제주": (33.10, 33.60, 126.10, 126.99),
}

REQUIRED = ("name", "kind", "region", "district", "source", "checkedAt")
KINDS = ("천문대", "과학관", "관측명소")
TRISTATE = ("있음", "없음", "모름")


def norm(s):
    return re.sub(r"[\s()·\-]", "", s or "")


def main():
    places = json.loads(PLACES.read_text(encoding="utf-8"))
    coords = json.loads(COORDS.read_text(encoding="utf-8"))
    seed = json.loads(SEED.read_text(encoding="utf-8"))

    warnings = []

    # --- 1) KASI 시드 대조 ---
    known = set()
    for p in places:
        known.add(norm(p["name"]))
        if p.get("kasiName"):
            known.add(norm(p["kasiName"]))
    for item in seed["items"]:
        name = item["name"]
        if name in KASI_EXCLUDED:
            continue
        if norm(name) in known:
            continue
        # 부분 일치도 인정 (예: KASI "화천청소년수련관" ↔ 수록 "화천조경철천문대"는 kasiName 으로 잡힘)
        if any(norm(name) in k or k in norm(name) for k in known):
            continue
        warnings.append(f"KASI 목록에 있으나 수록되지 않음: {name}")

    # --- 2) 필드 검증 + 레코드 조립 ---
    out = []
    for i, p in enumerate(places, 1):
        who = p.get("name", f"#{i}")
        for f in REQUIRED:
            if not p.get(f):
                warnings.append(f"{who}: 필수 필드 누락 ({f})")
        if p.get("kind") not in KINDS:
            warnings.append(f"{who}: kind 값이 이상함 ({p.get('kind')!r})")
        for lvl, note in (("kidLevel", "kidNote"), ("darkLevel", "darkNote")):
            if p.get(lvl) not in (1, 2, 3):
                warnings.append(f"{who}: {lvl} 이 1~3 이 아님 ({p.get(lvl)!r})")
            if not (p.get(note) or "").strip():
                warnings.append(f"{who}: {lvl} 판정 근거({note})가 비어 있음")
        for f in ("toilet", "parking", "nursing"):
            if p.get(f) not in TRISTATE:
                warnings.append(f"{who}: {f} 값이 이상함 ({p.get(f)!r})")

        hit = coords.get(p["name"])
        if not hit:
            warnings.append(f"{who}: 좌표 없음 (geocode.py 를 먼저 실행하세요)")
            continue
        lat, lng = hit["lat"], hit["lng"]
        box = REGION_BOX.get(p["region"])
        if not box:
            warnings.append(f"{who}: region 을 알 수 없음 ({p['region']!r})")
        elif not (box[0] <= lat <= box[1] and box[2] <= lng <= box[3]):
            warnings.append(
                f"{who}: 좌표가 {p['region']} 범위를 벗어남 ({lat}, {lng})")

        rec = {k: v for k, v in p.items() if k not in ("searchName",)}
        rec["id"] = i
        rec["lat"] = lat
        rec["lng"] = lng
        rec["geoSource"] = hit["geoSource"]
        if hit.get("kakaoAddress") and not rec.get("address"):
            rec["address"] = hit["kakaoAddress"]
        out.append(rec)

    # --- 3) 출력 ---
    kinds = Counter(r["kind"] for r in out)
    meta = {
        "surveyDate": date.today().isoformat(),
        "total": len(out),
        "byKind": dict(kinds),
        "kasiSeedTotal": seed["total"],
        "kasiFetchedAt": seed["fetchedAt"],
        "sources": [
            "한국천문연구원 국내천문대 목록 (이름·지역 시드)",
            "각 시설 공식 누리집",
            "한국관광공사 대한민국 구석구석 (관측명소)",
        ],
        "notice": "유아 동반 등급과 밤하늘 어둠 등급은 공공 데이터가 아닌 조사 기반 판정입니다. 방문 전 직접 확인하세요.",
    }

    js = (
        "/* 천문대 지도 데이터 — 자동 생성 파일. tools/build_data.py 가 생성합니다. 직접 수정하지 마세요. */\n"
        "window.DATA_META = " + json.dumps(meta, ensure_ascii=False, indent=2) + ";\n"
        "window.PLACES = " + json.dumps(out, ensure_ascii=False, indent=2) + ";\n"
    )
    OUT.write_text(js, encoding="utf-8")

    print(f"생성: {OUT.relative_to(TOOLS.parent)} · {len(out)}곳")
    for k in KINDS:
        print(f"  {k} {kinds.get(k, 0)}곳")
    print(f"  KASI 시드 {seed['total']}곳 중 제외 {len(KASI_EXCLUDED)}곳")

    if warnings:
        print(f"\n경고 {len(warnings)}건:")
        for w in warnings:
            print(f"  - {w}")
        sys.exit(1)
    print("\n검증 통과: 경고 0건")


if __name__ == "__main__":
    main()
