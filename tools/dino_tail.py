"""Вырез хвоста из целого диплодока — отдельной картинкой, а не рамкой в коде.

Хвост на экранах задачек лежит сам по себе в левом нижнем углу: тело и лапы
там не нужны. Прямоугольником его не взять — хвост делает петлю влево, а потом
уходит вправо *под лапами* и кончается у правого края рисунка. Любая рамка
либо рубит кончик, либо тащит за собой ногу. Вырезать надо по форме.

Обе границы формы считаются по самому рисунку, руками их задавать нельзя —
рисунок поменяется, а числа устареют молча:

- **просвет** — строка, которая отделяет лапы сверху от хвоста снизу: ищем ту,
  где краска есть и выше, и ниже, а на самой строке её нет, и таких столбцов
  больше всего;
- **стык** — столбец, в котором петля закрылась: пока хвост идёт сам по себе,
  между его верхним и нижним ремнём видна щель, а у бедра она пропадает.

Что осталось от тела после разреза (обрубок лапы), отсекается само: берём
только самый большой связный кусок.

    python tools/dino_tail.py

Пишет `public/art/dino-tail.png` и печатает числа для `src/art/dinoLayout.ts`.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sheet import label_runs  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
ART = ROOT / "public" / "art"

#: Непрозрачность, с которой пиксель считается краской.
INK = 8
#: Насколько близко к просвету кончается лапа. Больше этого над просветом
#: проходит только верхний ремень петли, и он далеко — запас тут тройной.
MERGE_GAP = 24


def runs(column: np.ndarray) -> list[tuple[int, int]]:
    """Сплошные отрезки краски в столбце: (первый y, последний y)."""
    ys = np.flatnonzero(column)
    if ys.size == 0:
        return []
    breaks = np.flatnonzero(np.diff(ys) > 1)
    starts = np.concatenate(([0], breaks + 1))
    ends = np.concatenate((breaks, [ys.size - 1]))
    return [(int(ys[a]), int(ys[b])) for a, b in zip(starts, ends)]


def floor_line(ink: np.ndarray) -> int:
    """Строка просвета между лапами и хвостом.

    «Самая пустая строка» тут не годится: у нижнего края рисунка пусто почти
    всё. Считаем столбцы, где краска есть и выше строки, и ниже, а на самой
    строке её нет, — это и есть щель, по которой хвост проходит под лапами.
    """
    height = ink.shape[0]
    best = (0, height // 2)
    for y in range(height // 2, height - 1):
        below = ink[y + 1 :]
        if not below.any():
            break
        score = int((ink[:y].any(axis=0) & below.any(axis=0) & ~ink[y]).sum())
        if score > best[0]:
            best = (score, y)
    if best[0] == 0:
        raise SystemExit("щели между телом и хвостом нет — рисунок не тот")
    return best[1]


def split_column(ink: np.ndarray, floor_y: int) -> int:
    """Столбец, где тело встало на просвет: левее него всё — хвост.

    Ищем ровно ту картинку, которая на рисунке и нарисована: лапа кончается
    впритык над просветом, а отдельно под просветом уже идёт хвост. Пока хвост
    идёт сам по себе, над просветом либо пусто, либо высоко вверху его же
    верхний ремень, а его нижний ремень просвет пересекает — такой кусок
    в расчёт не берём, он и есть хвост.
    """
    for x in range(ink.shape[1]):
        parts = runs(ink[:, x])
        stands = any(end < floor_y and floor_y - end <= MERGE_GAP for _, end in parts)
        passes = any(start > floor_y for start, _ in parts)
        if stands and passes:
            return x
    raise SystemExit("тело нигде не встало на просвет — рисунок не тот")


def biggest_part(data: np.ndarray) -> np.ndarray:
    """Оставить самый большой связный кусок: обрубок лапы отваливается сам."""
    rows, find = label_runs(data[..., 3] > INK)
    areas: dict[int, int] = {}
    for row in rows:
        for start, end, index in row:
            root = find(index)
            areas[root] = areas.get(root, 0) + (end - start)
    if not areas:
        raise SystemExit("в вырезе нет краски")
    keep = max(areas, key=lambda root: areas[root])

    out = data.copy()
    for y, row in enumerate(rows):
        for start, end, index in row:
            if find(index) != keep:
                out[y, start:end, 3] = 0
    return out


def main() -> None:
    whole = Image.open(ART / "dino-whole.png").convert("RGBA")
    data = np.array(whole)
    ink = data[..., 3] > INK

    floor_y = floor_line(ink)
    split_x = split_column(ink, floor_y)

    height, width = ink.shape
    xs = np.arange(width)[None, :]
    ys = np.arange(height)[:, None]
    keep = (xs < split_x) | (ys > floor_y)

    cut = data.copy()
    cut[..., 3] = np.where(keep & ink, data[..., 3], 0)
    tail = Image.fromarray(biggest_part(cut), "RGBA")

    box = tail.split()[3].getbbox()
    if box is None:
        raise SystemExit("в вырезе нет краски")
    tail = tail.crop(box)
    tail.save(ART / "dino-tail.png", "PNG", optimize=True)

    # Центр петли: самая левая краска по x, середина её отрезка по y. За эту
    # точку DinoWatcher и держит хвост — она не зависит от размера выреза.
    alpha = np.array(tail)[..., 3] > INK
    left = int(np.flatnonzero(alpha.any(axis=0))[0])
    column = np.flatnonzero(alpha[:, left])
    curl_y = int((column[0] + column[-1]) / 2)

    print(
        json.dumps(
            {
                "вырез": {"x": box[0], "y": box[1], "w": tail.width, "h": tail.height},
                "стык": split_x,
                "просвет": floor_y,
                "петля в вырезе": {"x": left, "y": curl_y},
                "петля на целом": {"x": box[0] + left, "y": box[1] + curl_y},
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
