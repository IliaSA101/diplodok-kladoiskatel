"""Чистка центра поля на фоне карты квеста.

Генератор положил на точку центра поля бесформенный розово-красный комок:
задумывался мяч, вышло пятно. На карте оно оказывается ровно под мордой
диплодока — тот стоит у узла в середине поля, — и читается как грязь на
экране, а не как мяч.

Заплатка растягивает по вертикали одну чистую строку поля, взятую тут же,
чуть выше пятна. Поле в этом месте — вертикальные полосы газона и вертикальная
же линия середины, поэтому растяжка строки вниз повторяет рисунок точно, а
копирование целой полосы — нет: в сорока пикселях выше проходит дуга круга,
и она приезжала в середину куском белой палки.

Скрипт — чтобы правка повторялась: руками подтёртый пиксель нельзя ни
проверить, ни повторить после новой генерации фона.

    python tools/map_spot.py            # посмотреть, что найдено
    python tools/map_spot.py --write    # записать public/art/quest-map-bg.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parent.parent / 'public' / 'art' / 'quest-map-bg.png'

# Окно, в котором ищем пятно: середина поля. Больше брать нельзя — вокруг
# беговая дорожка, она сама красная.
WINDOW = (580, 320, 670, 410)
# Насколько выше пятна искать чистую строку-донор.
LIFT = 2
# Больше белого в строке — значит, в неё попала дуга круга, донор не годится.
CLEAN_WHITE = 6
# Запас вокруг найденного пятна: тёмная обводка комка в маску не попадает.
PAD = 4


def blob(pixels: np.ndarray) -> tuple[int, int, int, int] | None:
    """Границы розового пятна в окне, в координатах всей картинки."""
    x0, y0, x1, y1 = WINDOW
    sub = pixels[y0:y1, x0:x1]
    pink = (sub[:, :, 0] > sub[:, :, 1] + 20) & (sub[:, :, 0] > 110)
    ys, xs = np.nonzero(pink)
    if xs.size == 0:
        return None
    return (
        int(xs.min()) + x0 - PAD,
        int(ys.min()) + y0 - PAD,
        int(xs.max()) + x0 + PAD + 1,
        int(ys.max()) + y0 + PAD + 1,
    )


def clean_row(pixels: np.ndarray, top: int, x0: int, x1: int) -> int:
    """Ближайшая строка выше пятна без краснотых и без дуги круга."""
    for y in range(top - LIFT, top - 40, -1):
        strip = pixels[y, x0:x1]
        red = ((strip[:, 0] > strip[:, 1] + 20) & (strip[:, 0] > 110)).sum()
        white = ((strip[:, 0] > 215) & (strip[:, 1] > 215) & (strip[:, 2] > 200)).sum()
        if red == 0 and white <= CLEAN_WHITE:
            return y
    raise SystemExit('чистой строки над пятном нет — смотреть картинку глазами')


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='записать файл')
    args = parser.parse_args()

    image = Image.open(ART).convert('RGBA')
    pixels = np.array(image).astype(int)
    found = blob(pixels[:, :, :3])
    if found is None:
        print('Пятна на центре поля нет — чистить нечего.')
        return

    x0, y0, x1, y1 = found
    print(f'Пятно: x {x0}..{x1}, y {y0}..{y1} ({x1 - x0}×{y1 - y0})')

    row = clean_row(pixels[:, :, :3], y0, x0, x1)
    print(f'Строка-донор: y {row}')

    out = np.array(image)
    out[y0:y1, x0:x1] = out[row, x0:x1]
    if not args.write:
        print('Запись не просили: добавьте --write.')
        return
    Image.fromarray(out).save(ART, 'PNG', optimize=True)
    print(f'Записано: {ART}')


if __name__ == '__main__':
    main()
