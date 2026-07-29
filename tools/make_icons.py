# -*- coding: utf-8 -*-
"""PWA 아이콘 4종 생성 (192 / 512 / apple-180 / maskable-512).

마스터 이미지를 1024px로 한 번 그리고 각 크기로 리사이즈한다.
디자인: 밤하늘 배경 + 별 + 초승달 + 천문대 돔 실루엣.
maskable 은 안전영역(중앙 80%)을 지키도록 여백을 더 둔다.
"""
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.stdout.reconfigure(encoding="utf-8")

OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "icons"
MASTER = 1024

SKY_TOP = (34, 48, 96)
SKY_BOTTOM = (11, 16, 35)
DOME = (18, 25, 54)
DOME_EDGE = (123, 156, 255)
MOON = (255, 244, 214)


def draw_master(scale=1.0):
    """scale < 1 이면 그림을 가운데로 축소해 그린다 (maskable 안전영역용)."""
    img = Image.new("RGB", (MASTER, MASTER), SKY_BOTTOM)
    d = ImageDraw.Draw(img)

    # 하늘 그라데이션
    for y in range(MASTER):
        t = y / (MASTER - 1)
        d.line([(0, y), (MASTER, y)], fill=(
            round(SKY_TOP[0] + (SKY_BOTTOM[0] - SKY_TOP[0]) * t),
            round(SKY_TOP[1] + (SKY_BOTTOM[1] - SKY_TOP[1]) * t),
            round(SKY_TOP[2] + (SKY_BOTTOM[2] - SKY_TOP[2]) * t),
        ))

    cx = MASTER / 2
    # 그림 요소의 기준 좌표를 scale 로 축소 (중앙 기준)
    def sx(x):
        return cx + (x - cx) * scale

    def sy(y):
        return cx + (y - cx) * scale

    # 별 — 위치를 고정 시드로 뽑아 매번 같은 그림이 나오게 한다
    rnd = random.Random(20260730)
    for _ in range(150):
        x = rnd.uniform(40, MASTER - 40)
        y = rnd.uniform(40, MASTER * 0.62)
        r = rnd.choice([1.6, 2.2, 2.8, 3.6, 4.6])
        a = rnd.uniform(0.45, 1.0)
        col = (round(255 * a + SKY_TOP[0] * (1 - a)),
               round(255 * a + SKY_TOP[1] * (1 - a)),
               round(255 * a + SKY_TOP[2] * (1 - a)))
        d.ellipse([sx(x - r), sy(y - r), sx(x + r), sy(y + r)], fill=col)

    # 은하수 — 대각선으로 흐리게 깔린 별 띠
    for _ in range(420):
        t = rnd.uniform(0, 1)
        bx = 90 + t * (MASTER - 180)
        by = 300 - t * 190 + rnd.gauss(0, 46)
        if by < 30 or by > MASTER * 0.62:
            continue
        r = rnd.uniform(0.8, 2.0)
        a = rnd.uniform(0.2, 0.55)
        col = (round(255 * a + SKY_TOP[0] * (1 - a)),
               round(255 * a + SKY_TOP[1] * (1 - a)),
               round(255 * a + SKY_TOP[2] * (1 - a)))
        d.ellipse([sx(bx - r), sy(by - r), sx(bx + r), sy(by + r)], fill=col)

    # 초승달 — 밝은 원에서 살짝 겹친 원을 하늘색으로 덮어 만든다
    mr = 108 * scale
    mcx, mcy = sx(752), sy(232)
    d.ellipse([mcx - mr, mcy - mr, mcx + mr, mcy + mr], fill=MOON)
    off = 62 * scale
    sky_at_moon = (
        round(SKY_TOP[0] + (SKY_BOTTOM[0] - SKY_TOP[0]) * (mcy / MASTER)),
        round(SKY_TOP[1] + (SKY_BOTTOM[1] - SKY_TOP[1]) * (mcy / MASTER)),
        round(SKY_TOP[2] + (SKY_BOTTOM[2] - SKY_TOP[2]) * (mcy / MASTER)),
    )
    d.ellipse([mcx - mr + off, mcy - mr - off * 0.35,
               mcx + mr + off, mcy + mr - off * 0.35], fill=sky_at_moon)

    # 천문대 돔 실루엣 — 아래쪽에 반원 + 몸통
    base_y = sy(880)
    dome_r = 300 * scale
    dome_cy = sy(742)
    d.ellipse([cx - dome_r, dome_cy - dome_r, cx + dome_r, dome_cy + dome_r],
              fill=DOME)
    d.rectangle([cx - dome_r, dome_cy, cx + dome_r, base_y], fill=DOME)
    # 돔 윤곽선(위쪽 반원만)
    d.arc([cx - dome_r, dome_cy - dome_r, cx + dome_r, dome_cy + dome_r],
          start=180, end=360, fill=DOME_EDGE, width=round(9 * scale))
    # 관측 슬릿 — 돔이 열린 틈
    slit_w = 46 * scale
    d.polygon([
        (cx - slit_w / 2, dome_cy + 20 * scale),
        (cx + slit_w / 2, dome_cy + 20 * scale),
        (cx + slit_w / 2 * 0.55, dome_cy - dome_r - 6 * scale),
        (cx - slit_w / 2 * 0.55, dome_cy - dome_r - 6 * scale),
    ], fill=(240, 178, 74))
    # 바닥 라인
    d.rectangle([0, base_y, MASTER, MASTER], fill=SKY_BOTTOM)
    d.line([(0, base_y), (MASTER, base_y)], fill=(48, 60, 105), width=6)

    return img


def main():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    normal = draw_master(1.0)
    normal.save(OUT_DIR / "master-icon.png")

    for size, name in [(192, "app-icon-192.png"),
                       (512, "app-icon-512.png"),
                       (180, "app-icon-apple-180.png")]:
        normal.resize((size, size), Image.LANCZOS).save(OUT_DIR / name)
        print("생성:", name)

    # maskable: 원형 마스크로 잘려도 주요 요소가 남도록 78%로 축소해 그린다
    maskable = draw_master(0.78)
    maskable.resize((512, 512), Image.LANCZOS).save(OUT_DIR / "app-icon-maskable-512.png")
    print("생성: app-icon-maskable-512.png")


if __name__ == "__main__":
    main()
