# -*- coding: utf-8 -*-
"""places.json 의 각 장소를 카카오 로컬 API로 지오코딩해 tools/coords.json 에 저장.

places.json 은 사람이 관리하는 원본이므로 이 스크립트는 그 파일을 고치지 않는다.
좌표는 별도 파일(coords.json)에 두고 build_data.py 가 합친다.

지오코딩은 좌표를 얻는 일이자 **시설 실재 여부를 확인하는 수단**이기도 하다.
키워드검색으로 찾히지 않는 이름은 unresolved 로 보고해 사람이 확인하게 한다.

산·고지(관측명소)는 키워드검색이 엉뚱한 카페·식당을 집을 수 있어,
결과 이름이 원래 이름과 너무 다르면 의심(suspect)으로 표시한다.

인증키는 .env(KAKAO_REST_KEY)에서 읽는다.
"""
import json
import re
import sys
import time
from pathlib import Path

import requests

sys.stdout.reconfigure(encoding="utf-8")

TOOLS = Path(__file__).resolve().parent
SRC = TOOLS / "places.json"
OUT = TOOLS / "coords.json"
CACHE_FILE = TOOLS / "kakao_cache.json"

KAKAO_KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
KAKAO_ADDR_URL = "https://dapi.kakao.com/v2/local/search/address.json"
REQUEST_SLEEP = 0.05

# 대한민국 육상 범위 (독도 경도 131.87 포함)
KOREA_BOX = (33.0, 38.7, 124.5, 132.1)

# places.json 의 region → 카카오 region_1depth_name 접두어
REGION_PREFIX = {
    "서울": "서울", "경기": "경기", "인천": "인천", "강원": "강원",
    "충북": "충청북도", "충남": "충청남도", "대전": "대전", "세종": "세종",
    "전북": "전라북도", "전남": "전라남도", "광주": "광주",
    "경북": "경상북도", "경남": "경상남도", "대구": "대구",
    "부산": "부산", "울산": "울산", "제주": "제주",
}
# 카카오가 쓰는 표기(개편 전/후)를 모두 후보로 둔다
REGION_ALIASES = {
    "강원": ("강원", "강원특별자치도"),
    "전북": ("전라북도", "전북특별자치도", "전북"),
    "전남": ("전라남도", "전남"),
    "충북": ("충청북도", "충북"),
    "충남": ("충청남도", "충남"),
    "경북": ("경상북도", "경북"),
    "경남": ("경상남도", "경남"),
    "제주": ("제주", "제주특별자치도"),
    "세종": ("세종", "세종특별자치시"),
    # 카카오는 광주·전남을 "전남광주통합특별시"로 표기한다. 두 region 모두 이 표기를 받아준다.
    "광주": ("광주", "전남광주통합특별시"),
}
REGION_ALIASES["전남"] = ("전라남도", "전남", "전남광주통합특별시")

# 시설 안 부속 공간을 가리키는 접미사. 카카오에는 본 시설 이름만 등록된 경우가 많다.
NAME_SUFFIXES = ("천체관측실", "천문우주체험실", "스타파크")


def load_kakao_key():
    env_path = TOOLS.parent / ".env"
    for line in env_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("KAKAO_REST_KEY="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError(".env 에서 KAKAO_REST_KEY를 찾을 수 없습니다.")


session = requests.Session()
session.headers["Authorization"] = "KakaoAK " + load_kakao_key()

cache = json.loads(CACHE_FILE.read_text(encoding="utf-8")) if CACHE_FILE.exists() else {}


def save_cache():
    CACHE_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def in_korea(lat, lng):
    return KOREA_BOX[0] <= lat <= KOREA_BOX[1] and KOREA_BOX[2] <= lng <= KOREA_BOX[3]


def region1_of(doc):
    """결과의 광역명. 키워드검색 결과에는 region_1depth_name 이 없어 주소 첫 토큰을 쓴다."""
    r = doc.get("region_1depth_name")
    if r:
        return r
    for key in ("address", "road_address"):
        sub = doc.get(key)
        if isinstance(sub, dict) and sub.get("region_1depth_name"):
            return sub["region_1depth_name"]
    addr = doc.get("address_name") or doc.get("road_address_name") or ""
    return addr.split()[0] if addr else ""


def region_matches(region, kakao_region1):
    """카카오가 준 광역명이 places.json 의 region 과 같은 곳을 가리키는지."""
    if not kakao_region1:
        return False
    candidates = REGION_ALIASES.get(region, (REGION_PREFIX.get(region, region),))
    return any(kakao_region1.startswith(c[:2]) for c in candidates)


def _kakao_get(url, query):
    for attempt in range(3):
        try:
            r = session.get(url, params={"query": query, "size": 10}, timeout=15)
            if r.status_code == 429:
                time.sleep(1.0)
                continue
            r.raise_for_status()
            time.sleep(REQUEST_SLEEP)
            return r.json().get("documents", [])
        except requests.RequestException as e:
            if attempt == 2:
                print(f"  ! 요청 실패: {query!r} ({e})")
                return None
            time.sleep(0.5)
    return None


def cached_get(url, query, key_prefix):
    key = f"{key_prefix}:{query}"
    if key not in cache:
        docs = _kakao_get(url, query)
        if docs is None:
            return None  # 에러는 캐시하지 않는다
        cache[key] = docs
        save_cache()
    return cache[key]


def norm(s):
    """이름 비교용 정규화: 공백·괄호·가운뎃점 제거."""
    return re.sub(r"[\s()·\-]", "", s or "")


def similar(a, b):
    """한쪽이 다른 쪽을 포함하거나, 4글자 이상 연속 일치하면 같은 곳으로 본다."""
    na, nb = norm(a), norm(b)
    if not na or not nb:
        return False
    if na in nb or nb in na:
        return True
    for size in range(len(na), 3, -1):
        for i in range(len(na) - size + 1):
            if na[i:i + size] in nb:
                return True
    return False


def pick(docs, place, require_region=True):
    """지역이 맞고 좌표가 국내인 첫 결과를 고른다."""
    for d in docs or []:
        try:
            lat, lng = float(d["y"]), float(d["x"])
        except (KeyError, TypeError, ValueError):
            continue
        if not in_korea(lat, lng):
            continue
        if require_region and not region_matches(place["region"], region1_of(d)):
            continue
        return d, lat, lng
    return None, None, None


def geocode_one(place):
    name = place["name"]
    region = place["region"]
    district = place.get("district", "")
    address = place.get("address", "")

    # 1) 키워드검색: 이름 + 지역, 이름 + 시군구, 이름 단독
    #    searchName(수동 지정) → name → kasiName 순으로 후보를 만든다.
    #    KASI 원래 이름도 넣는다 — 개칭 전 이름으로 등록된 곳이 있다.
    #    부속 공간 접미사를 뗀 형태도 후보에 넣는다 (예: "의정부과학도서관 천문우주체험실" → "의정부과학도서관").
    bases = []
    for base in (place.get("searchName"), name, place.get("kasiName")):
        if not base:
            continue
        bases.append(base)
        for suf in NAME_SUFFIXES:
            if base.endswith(suf):
                stripped = base[: -len(suf)].strip()
                if stripped:
                    bases.append(stripped)

    name_queries = []
    for base in dict.fromkeys(bases):
        name_queries += [f"{base} {region}", f"{base} {district}", base]

    for q in dict.fromkeys(name_queries):
        docs = cached_get(KAKAO_KEYWORD_URL, q, "kw")
        d, lat, lng = pick(docs, place)
        if d and similar(name, d.get("place_name", "")) or (
                d and similar(place.get("kasiName", ""), d.get("place_name", ""))):
            return {
                "lat": round(lat, 6), "lng": round(lng, 6),
                "kakaoName": d.get("place_name", ""),
                "kakaoAddress": d.get("road_address_name") or d.get("address_name") or "",
                "geoSource": "keyword",
                "suspect": False,
            }
        if d:  # 지역은 맞지만 이름이 많이 다름 → 보류 후보로 기억
            fallback = {
                "lat": round(lat, 6), "lng": round(lng, 6),
                "kakaoName": d.get("place_name", ""),
                "kakaoAddress": d.get("road_address_name") or d.get("address_name") or "",
                "geoSource": "keyword",
                "suspect": True,
            }
            break
    else:
        fallback = None

    # 2) 주소검색
    if address:
        for q in dict.fromkeys([address, re.sub(r"\([^)]*\)", "", address).strip()]):
            docs = cached_get(KAKAO_ADDR_URL, q, "addr")
            d, lat, lng = pick(docs, place)
            if d:
                return {
                    "lat": round(lat, 6), "lng": round(lng, 6),
                    "kakaoName": "",
                    "kakaoAddress": d.get("address_name", ""),
                    "geoSource": "address",
                    "suspect": False,
                }

    return fallback


def main():
    places = json.loads(SRC.read_text(encoding="utf-8"))
    coords, unresolved, suspect = {}, [], []

    for i, p in enumerate(places, 1):
        hit = geocode_one(p)
        if hit is None:
            unresolved.append(p["name"])
            print(f"[{i}/{len(places)}] 미해결  {p['name']}")
            continue
        coords[p["name"]] = hit
        if hit["suspect"]:
            suspect.append((p["name"], hit["kakaoName"], hit["kakaoAddress"]))
            print(f"[{i}/{len(places)}] 의심    {p['name']} → {hit['kakaoName']}")

    OUT.write_text(json.dumps(coords, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    print(f"해결 {len(coords)} / 전체 {len(places)}")
    if suspect:
        print(f"\n이름이 많이 다른 결과 {len(suspect)}건 — 좌표를 사람이 확인해야 합니다:")
        for n, kn, ka in suspect:
            print(f"  {n} → 카카오: {kn} ({ka})")
    if unresolved:
        print(f"\n카카오에서 찾지 못한 {len(unresolved)}건 — 실재 여부를 확인해야 합니다:")
        for n in unresolved:
            print(f"  {n}")
    print(f"\n저장: {OUT.name}")


if __name__ == "__main__":
    main()
