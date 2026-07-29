# -*- coding: utf-8 -*-
"""places.json 의 homepage / reserveUrl / source 링크가 살아 있는지 확인한다.

주소를 조사로 채운 항목이 섞여 있어, 죽은 링크를 남기면 사용자를 헛걸음하게 만든다.
결과는 tools/link_report.json 에 남기고, 죽은 링크는 화면에 표시해 사람이 지우거나 고치게 한다.

판정
  ok      2xx/3xx 응답
  dead    DNS 실패 · 연결 거부 · 4xx/5xx
  unsure  타임아웃 등 판단 보류 (정부·지자체 사이트는 느린 경우가 많다)
"""
import json
import ssl
import sys
import urllib.error
import urllib.request
from collections import OrderedDict
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

TOOLS = Path(__file__).resolve().parent
SRC = TOOLS / "places.json"
OUT = TOOLS / "link_report.json"
FIELDS = ("homepage", "reserveUrl", "source")
TIMEOUT = 12

# 일부 공공 사이트는 인증서 체인이 부실해 검증을 끄지 않으면 접속 자체가 안 된다.
# 링크 생존 확인이 목적이므로 여기서는 검증을 완화한다.
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; observatory-map link check)"}


def probe(url):
    req = urllib.request.Request(url, headers=HEADERS, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT, context=CTX) as res:
            return "ok", res.status
    except urllib.error.HTTPError as e:
        # 403 은 봇 차단인 경우가 많아 살아 있는 것으로 본다
        if e.code in (401, 403, 405, 406, 429):
            return "ok", e.code
        return "dead", e.code
    except urllib.error.URLError as e:
        reason = str(getattr(e, "reason", e))
        if "timed out" in reason.lower():
            return "unsure", reason
        return "dead", reason
    except Exception as e:  # noqa: BLE001
        return "unsure", str(e)


def main():
    places = json.loads(SRC.read_text(encoding="utf-8"))

    # 같은 URL 을 여러 항목이 쓰므로 한 번만 조회한다
    urls = OrderedDict()
    for p in places:
        for f in FIELDS:
            u = (p.get(f) or "").strip()
            if u.startswith("http"):
                urls.setdefault(u, []).append((p["name"], f))

    print(f"확인할 링크 {len(urls)}개\n")
    results = {}
    for i, u in enumerate(urls, 1):
        status, detail = probe(u)
        results[u] = {"status": status, "detail": detail, "users": urls[u]}
        mark = {"ok": "정상", "dead": "죽음", "unsure": "보류"}[status]
        if status != "ok":
            print(f"[{i}/{len(urls)}] {mark}  {u}  ({detail})")
            for name, field in urls[u]:
                print(f"          ← {name}.{field}")

    OUT.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")

    counts = {"ok": 0, "dead": 0, "unsure": 0}
    for r in results.values():
        counts[r["status"]] += 1
    print(f"\n정상 {counts['ok']} · 죽음 {counts['dead']} · 보류 {counts['unsure']}")
    print(f"저장: {OUT.name}")
    if counts["dead"]:
        print("\n죽은 링크는 places.json 에서 지우거나 올바른 주소로 고쳐야 합니다.")
        sys.exit(1)


if __name__ == "__main__":
    main()
