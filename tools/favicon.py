"""Значок вкладки и иконка «на экран Домой» — из головы нарисованного диплодока.

Отдельного рисунка под значок нет и не нужно: голова у нас уже есть, и ребёнок
узнаёт вкладку по ней же, по кому узнаёт игру. Берём `dino-whole.png`, ставим
на место глаз (в самом рисунке там пустая глазница — глаз лежит отдельной
картинкой, им моргают) и кладём голову на зелёный круг: диплодок голубой, и на
синем небе значок в шестнадцать пикселей сливается, а на траве — нет.

Запуск:

    python tools/favicon.py

Пишет `public/favicon.ico`, `public/favicon.png`, `public/apple-touch-icon.png`.
"""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "public" / "art"

# Числа из src/art/dinoArtMeta.ts: глаз на рисунке и сколько пикселей рига
# в пикселе рисунка. Правятся там, tools/dino_art.py, а не тут.
EYE_X = 556.5
EYE_Y = 37.5
MESH_SCALE = 0.3272

# Что считаем «головой»: только голова, почти без шеи. С шеей значок
# в шестнадцать пикселей превращался в зелёный кругляш с синей палкой:
# на вкладке важно, чтобы морда занимала почти весь круг.
HEAD_BOX = (500, 0, 640, 112)

# Трава из src/art/palette.ts: grassMid и grassShadow на обводку.
GRASS = (0x5F, 0xB5, 0x56, 0xFF)
GRASS_DARK = (0x3B, 0x8C, 0x42, 0xFF)

#: Во сколько раз значок рисуется крупнее, чтобы края сгладились при ужатии.
SUPER = 4
SIZE = 512
#: Доля значка под головой: остальное — поля, иначе в круге тесно.
FILL = 0.96


def dino_head() -> Image.Image:
    """Голова с глазом на месте, обрезанная по краске."""
    whole = Image.open(ART / "dino-whole.png").convert("RGBA")
    eye = Image.open(ART / "dino-mesh-eye.png").convert("RGBA")

    # Глаз сохранён в пикселях рига — он мельче рисунка во столько же раз,
    # во сколько DinoWatcher его потом увеличивает обратно.
    grown = round(eye.width / MESH_SCALE), round(eye.height / MESH_SCALE)
    eye = eye.resize(grown, Image.LANCZOS)
    whole.alpha_composite(eye, (round(EYE_X - eye.width / 2), round(EYE_Y - eye.height / 2)))

    head = whole.crop(HEAD_BOX)
    box = head.split()[3].getbbox()
    if box is None:
        raise SystemExit("в вырезе головы нет краски — проверьте HEAD_BOX")
    return head.crop(box)


def icon(size: int) -> Image.Image:
    """Зелёный круг с головой по центру."""
    big = size * SUPER
    canvas = Image.new("RGBA", (big, big), (0, 0, 0, 0))
    draw = ImageDraw.Draw(canvas)
    ring = max(2, round(big * 0.022))
    draw.ellipse((0, 0, big - 1, big - 1), fill=GRASS, outline=GRASS_DARK, width=ring)

    head = dino_head()
    room = big * FILL
    scale = min(room / head.width, room / head.height)
    head = head.resize((max(1, round(head.width * scale)), max(1, round(head.height * scale))), Image.LANCZOS)
    canvas.alpha_composite(head, ((big - head.width) // 2, (big - head.height) // 2))

    # Шея уходит вниз за круг, и без обрезки её ровный срез торчал бы в пустой
    # угол значка — ту же ошибку мы уже делали с хвостом. Режем кругом: срез
    # по дуге читается как портрет в медальоне, а не как поломка.
    mask = Image.new("L", (big, big), 0)
    ImageDraw.Draw(mask).ellipse((0, 0, big - 1, big - 1), fill=255)
    canvas.putalpha(Image.composite(canvas.split()[3], Image.new("L", (big, big), 0), mask))

    # Обводка рисуется последней: шея перекрыла бы её снизу, и у значка
    # пропал бы ровно тот край, по которому он читается как кругляш.
    ImageDraw.Draw(canvas).ellipse((0, 0, big - 1, big - 1), outline=GRASS_DARK, width=ring)

    return canvas.resize((size, size), Image.LANCZOS)


def main() -> None:
    out = ROOT / "public"
    icon(SIZE).save(out / "favicon.png")
    icon(180).save(out / "apple-touch-icon.png")
    # .ico держит несколько размеров сразу: вкладка берёт 16, закладка — 32.
    icon(64).save(out / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    made = ["favicon.ico", "favicon.png", "apple-touch-icon.png"]
    print(json.dumps({"написано": made}, ensure_ascii=False))


if __name__ == "__main__":
    main()
