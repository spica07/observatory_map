# -*- coding: utf-8 -*-
"""한국천문연구원 「국내천문대」 목록(https://astro.kasi.re.kr/learning/pageView/6388)에서
천문대 이름·지역을 긁어 tools/kasi_seed.json 으로 저장.

이 시드는 places.json 의 누락 검증용 체크리스트로만 쓴다.
상세 정보(주소·운영시간·홈페이지)는 이 경로로 얻을 수 없다 —
페이지가 쓰는 GET /learning/observatory?name=<이름> AJAX 엔드포인트는 외부 호출 시 404다.
(GET/POST · EUC-KR/UTF-8 · 세션 쿠키 조합 모두 실패. 2026-07-30 확인)
"""
import json
import re
import sys
import urllib.request
from datetime import date
from html import unescape
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

URL = "https://astro.kasi.re.kr/learning/pageView/6388"
OUT = Path(__file__).resolve().parent / "kasi_seed.json"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# 지역별 목록 블록: <li class="active"><strong>지역명</strong> 뒤로 해당 지역 항목이 이어진다.
RE_REGION = re.compile(r'<li class="active"><strong>(.*?)</strong>')
RE_ITEM = re.compile(r'<li class="area\d+[^"]*"><a href="javascript:">(.*?)</a>')


def fetch_html():
    req = urllib.request.Request(URL, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as res:
        return res.read().decode("utf-8", errors="replace")


def parse(html):
    """local_map 블록마다 (지역, [이름...]) 을 뽑는다."""
    blocks = html.split('<div class="sunMoonMap observatory local_map">')[1:]
    items = []
    for block in blocks:
        block = block.split('<div class="sunMoonMap observatory pc_none"')[0]
        region_m = RE_REGION.search(block)
        region = unescape(region_m.group(1)).strip() if region_m else ""
        for name in RE_ITEM.findall(block):
            items.append({"name": unescape(name).strip(), "kasiRegion": region})
    return items


def main():
    html = fetch_html()
    items = parse(html)
    if not items:
        raise SystemExit("파싱 결과가 비었습니다. 페이지 구조가 바뀐 것 같습니다.")

    # 같은 이름이 pc/mobile 목록에 중복될 수 있어 순서 유지 중복 제거
    seen, uniq = set(), []
    for it in items:
        if it["name"] in seen:
            continue
        seen.add(it["name"])
        uniq.append(it)

    payload = {
        "source": URL,
        "fetchedAt": date.today().isoformat(),
        "total": len(uniq),
        "items": uniq,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    by_region = {}
    for it in uniq:
        by_region.setdefault(it["kasiRegion"], []).append(it["name"])
    for region, names in by_region.items():
        print(f"[{region}] {len(names)}곳")
    print(f"저장: {OUT.name} · 총 {len(uniq)}곳")


if __name__ == "__main__":
    main()
