# -*- coding: utf-8 -*-
"""Playwright 로 UI를 실제로 띄워 검증한다.

확인 항목
 1) 콘솔 에러 없이 로드되는지
 2) 카드·마커가 전체 개수만큼 렌더되는지
 3) 필터(종류·유아 등급·밤하늘 등급·빠른필터)가 결과 수를 실제로 줄이는지
 4) 상세 모달에 판정 등급·근거 문장·직접확인 문구가 나오는지
 5) 달 위상 패널과 달력이 렌더되는지
 6) 독도 라벨이 지도에 그려지는지
 7) report.html 이 에러 없이 렌더되는지
스크린샷은 tools/screenshots/ 에 남긴다.
"""
import http.server
import json
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

sys.stdout.reconfigure(encoding="utf-8")

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "tools" / "screenshots"
CHROME = r"C:\Users\spica\AppData\Local\ms-playwright\chromium-1228\chrome-win64\chrome.exe"
PORT = 8731

failures = []


def check(label, ok, detail=""):
    print(("  통과  " if ok else "  실패  ") + label + ((" — " + detail) if detail else ""))
    if not ok:
        failures.append(label + ((" — " + detail) if detail else ""))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, *a):
        pass


def serve():
    socketserver.TCPServer.allow_reuse_address = True
    httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd


def count_cards(page):
    return page.locator(".facility-card").count()


def count_markers(page):
    return page.locator(".place-pin").count()


def main():
    SHOTS.mkdir(parents=True, exist_ok=True)
    httpd = serve()
    base = f"http://127.0.0.1:{PORT}"
    total = len(json.loads((ROOT / "tools" / "places.json").read_text(encoding="utf-8")))

    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=CHROME)
        page = browser.new_page(viewport={"width": 1280, "height": 1000})
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))

        print("\n[1] 메인 페이지 로드")
        page.goto(base + "/index.html", wait_until="networkidle")
        page.wait_for_timeout(700)
        check("콘솔 에러 없음", not errors, "; ".join(errors[:3]))

        print("\n[2] 초기 렌더")
        cards = count_cards(page)
        markers = count_markers(page)
        check(f"카드 {total}개 렌더", cards == total, f"실제 {cards}")
        check(f"마커 {total}개 렌더", markers == total, f"실제 {markers}")
        check("결과 수 표시", "총 " in page.locator("#resultCount").inner_text())

        print("\n[3] 달 위상 패널")
        check("달 위상 이름 표시", bool(page.locator("#moonPhaseName").inner_text().strip()))
        check("달 밝기 표시", "%" in page.locator("#moonIllum").inner_text())
        check("관측 조언 표시", bool(page.locator("#moonAdvice").inner_text().strip()))
        page.click("#moonToggle")
        page.wait_for_timeout(200)
        cells = page.locator(".moon-cell:not(.head):not(.blank)").count()
        check("달력에 날짜 셀 렌더 (28~31)", 28 <= cells <= 31, f"실제 {cells}")
        page.screenshot(path=str(SHOTS / "01-main-moon.png"), full_page=False)

        print("\n[4] 독도 표시")
        check("독도 라벨 존재", page.locator(".dokdo-label").count() >= 1)

        print("\n[5] 필터 동작")
        page.click("#filterToggleBtn")
        page.wait_for_timeout(200)

        # 종류 필터
        page.click('[data-kind="관측명소"]')
        page.wait_for_timeout(300)
        spots = count_cards(page)
        check("종류=관측명소 필터가 결과를 줄임", 0 < spots < total, f"{spots}곳")
        check("관측명소 마커 수 일치", count_markers(page) == spots)
        page.click('[data-kind=""]')
        page.wait_for_timeout(200)

        # 유아 동반 등급
        page.click('[data-kid="1"]')
        page.wait_for_timeout(300)
        kid1 = count_cards(page)
        check("유아 등급 1 필터 동작", 0 < kid1 < total, f"{kid1}곳")
        page.click('[data-kid=""]')
        page.wait_for_timeout(200)

        # 밤하늘 등급
        page.click('[data-dark="1"]')
        page.wait_for_timeout(300)
        dark1 = count_cards(page)
        check("밤하늘 등급 1 필터 동작", 0 < dark1 < total, f"{dark1}곳")
        page.screenshot(path=str(SHOTS / "02-filter-milkyway.png"))
        page.click('[data-dark=""]')
        page.wait_for_timeout(200)

        # 빠른필터 조합
        page.click('[data-toggle="fee"]')
        page.click('[data-toggle="toilet"]')
        page.wait_for_timeout(300)
        combo = count_cards(page)
        check("무료+화장실 조합 필터 동작", 0 < combo < total, f"{combo}곳")

        # 검색
        page.fill("#searchInput", "제주")
        page.wait_for_timeout(400)
        page.click("#resetBtn")
        page.wait_for_timeout(400)
        check("초기화가 전체를 되돌림", count_cards(page) == total, f"실제 {count_cards(page)}")

        print("\n[6] 상세 모달")
        page.locator(".facility-card").first.click()
        page.wait_for_timeout(400)
        check("모달 열림", page.locator("#modalOverlay").is_visible())
        body = page.locator("#modalBody").inner_text()
        check("유아 등급 배지 존재", page.locator(".judge-badge").count() >= 2)
        check("판정 근거 문장 존재",
              all(len(t.strip()) > 5 for t in page.locator(".judge-note").all_inner_texts()))
        check("직접 확인 문구 존재", "직접 확인" in body)
        check("근거 자료 링크 존재", page.locator(".link-btn.src").count() >= 1)
        check("조사일 표시", "조사일" in body)
        page.screenshot(path=str(SHOTS / "03-detail-modal.png"))
        page.keyboard.press("Escape")
        page.wait_for_timeout(200)
        check("Esc 로 모달 닫힘", not page.locator("#modalOverlay").is_visible())

        print("\n[7] 데스크톱 지도 (지도·목록 동시 표시)")
        # 데스크톱에서는 .view-toggle 이 숨겨져 있고 두 패널이 함께 보인다
        check("지도 패널 보임", page.locator("#map").is_visible())
        check("목록 패널 보임", page.locator("#listPane").is_visible())
        check("뷰 토글은 데스크톱에서 숨김", not page.locator("#viewToggle").is_visible())
        page.screenshot(path=str(SHOTS / "04-desktop.png"))

        print("\n[8] 모바일 폭 + 지도/목록 전환")
        page.set_viewport_size({"width": 390, "height": 844})
        page.wait_for_timeout(400)
        scroll_w = page.evaluate("document.documentElement.scrollWidth")
        check("가로 스크롤 없음 (390px)", scroll_w <= 391, f"scrollWidth={scroll_w}")
        check("모바일에서 뷰 토글 보임", page.locator("#viewToggle").is_visible())
        page.screenshot(path=str(SHOTS / "05-mobile-list.png"), full_page=False)

        page.click('#viewToggle [data-view="map"]')
        page.wait_for_timeout(900)
        check("지도 뷰 전환 시 지도 보임", page.locator("#map").is_visible())
        check("지도 뷰에서 목록 숨김", not page.locator("#listPane").is_visible())
        check("지도 뷰에서 마커 유지", count_markers(page) == total)
        page.screenshot(path=str(SHOTS / "05b-mobile-map.png"), full_page=False)

        print("\n[9] 리포트 페이지")
        rep_errors = []
        page2 = browser.new_page(viewport={"width": 1280, "height": 1200})
        page2.on("console", lambda m: rep_errors.append(m.text) if m.type == "error" else None)
        page2.on("pageerror", lambda e: rep_errors.append(str(e)))
        page2.goto(base + "/report.html", wait_until="networkidle")
        page2.wait_for_timeout(500)
        check("리포트 콘솔 에러 없음", not rep_errors, "; ".join(rep_errors[:3]))
        check("통계 타일 렌더", page2.locator(".stat-tile").count() >= 4)
        check("지역 표 행 렌더", page2.locator("#regionTable tbody tr").count() >= 10)
        check("미확인 정보 표 렌더", page2.locator("#unknownTable tbody tr").count() >= 5)
        check("출처 목록 렌더", page2.locator("#sourceList li").count() >= 2)
        page2.screenshot(path=str(SHOTS / "06-report.png"), full_page=True)

        browser.close()
    httpd.shutdown()

    print("\n" + "=" * 50)
    if failures:
        print(f"실패 {len(failures)}건:")
        for f in failures:
            print("  -", f)
        sys.exit(1)
    print("모든 검증 통과")


if __name__ == "__main__":
    main()
