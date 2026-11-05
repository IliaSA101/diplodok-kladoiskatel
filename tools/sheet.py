"""Нарезка листа генерации на отдельные спрайты игры.

Делает по рецепту обработки листов генерации:
снять фон нейросетью, починить края, разрезать по сетке, обрезать по альфе
и сложить контактный лист для проверки глазами.

    python tools/sheet.py art-src/01-icons-football.png --grid 3x4 \
        --out public/art --prefix foot- \
        --names ball,boot,whistle,trophy,glove,flag,net,cone,medal,stopwatch,scarf,bottle

Порядок имён — по строкам слева направо. Без --names файлы получат номера.
Повторный прогон даёт те же байты: промежуточное кладётся в art-work/.
"""

from __future__ import annotations

import argparse
import pathlib
import subprocess
import sys
from collections.abc import Callable

import numpy as np
from PIL import Image, ImageFilter

REMBG = pathlib.Path(r"D:\PrmFiles\rembg\rembg.cmd")
REMBG_MODEL = "birefnet-general"
WORK = pathlib.Path("art-work")

# Альфа выше этого порога считается полностью непрозрачной: листы генератора
# просвечивают (224–254), и без этого спрайт выглядит выцветшим.
DENSE_FROM = 224


def run_rembg(src: pathlib.Path, dst: pathlib.Path) -> None:
    """Снять белый фон нейросетью. Для листов значков и наклеек — только она."""
    if dst.exists():
        print(f"  фон уже снят: {dst}")
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    if not REMBG.exists():
        sys.exit(f"не найден rembg: {REMBG}")
    print(f"  rembg {REMBG_MODEL} -> {dst}")
    subprocess.run(
        [str(REMBG), "i", "-m", REMBG_MODEL, str(src), str(dst)],
        check=True,
        shell=False,
    )


Runs = list[list[tuple[int, int, int]]]


def label_runs(region: np.ndarray) -> tuple[Runs, Callable[[int], int]]:
    """Разбить region на четырёхсвязные области.

    Построчные отрезки плюс система непересекающихся множеств: один проход
    вместо наращивания маски. ImageDraw.floodfill из Pillow тут не годится —
    в 12.3 она молча ничего не заливает.

    Возвращает отрезки по строкам (начало, конец, номер) и функцию,
    приводящую номер отрезка к номеру его области.
    """
    height = region.shape[0]
    parent: list[int] = []
    rows: list[list[tuple[int, int, int]]] = []

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    def union(a: int, b: int) -> None:
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    for y in range(height):
        edges = np.flatnonzero(np.diff(np.concatenate(([0], region[y].view(np.int8), [0]))))
        row: list[tuple[int, int, int]] = []
        for start, end in zip(edges[::2], edges[1::2]):
            row.append((int(start), int(end), len(parent)))
            parent.append(len(parent))
        rows.append(row)

    # Соседние строки: отрезки, перекрывающиеся по x, — одна область.
    for y in range(1, height):
        above, below = rows[y - 1], rows[y]
        i = j = 0
        while i < len(above) and j < len(below):
            if above[i][1] <= below[j][0]:
                i += 1
            elif below[j][1] <= above[i][0]:
                j += 1
            else:
                union(above[i][2], below[j][2])
                if above[i][1] < below[j][1]:
                    i += 1
                else:
                    j += 1

    return rows, find


def connected_to_border(region: np.ndarray) -> np.ndarray:
    """Часть region, связанная с краем картинки: это и есть фон вокруг предмета."""
    height, width = region.shape
    rows, find = label_runs(region)

    border: set[int] = set()
    for y, row in enumerate(rows):
        on_edge = y == 0 or y == height - 1
        for start, end, index in row:
            if on_edge or start == 0 or end == width:
                border.add(find(index))

    out = np.zeros_like(region)
    for y, row in enumerate(rows):
        for start, end, index in row:
            if find(index) in border:
                out[y, start:end] = True
    return out


def flood_cut(image: Image.Image, white: int, feather: float) -> Image.Image:
    """Снять фон заливкой от краёв — для белых предметов и тонких линий.

    Нейросеть на таких листах съедает контур и выедает белое внутри предмета
    (циферблат секундомера, ячейки сетки ворот). Заливка убирает только тот
    белый, что связан с краем листа, а запертый внутри предмета остаётся.
    """
    rgb = image.convert("RGB")
    pixels = np.asarray(rgb)
    outside = connected_to_border(pixels.min(axis=2) >= white)
    alpha = Image.fromarray(np.where(outside, 0, 255).astype(np.uint8), "L")
    if feather > 0:
        # Край после заливки ступенчатый: лёгкое размытие даёт ровную границу.
        alpha = alpha.filter(ImageFilter.GaussianBlur(feather))
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def defringe(rgba: np.ndarray) -> np.ndarray:
    """Убрать светлую кайму от белого фона.

    При 0 < a < 255 цвет восстанавливается как C' = (C - (1 - a) * 255) / a,
    иначе на тёмном фоне у спрайта виден белый контур. a = 255 не трогаем.
    """
    out = rgba.astype(np.float32)
    alpha = out[..., 3:4] / 255.0
    edge = (alpha > 0) & (alpha < 1)
    rgb = out[..., :3]
    fixed = (rgb - (1.0 - alpha) * 255.0) / np.clip(alpha, 1e-4, None)
    out[..., :3] = np.where(np.repeat(edge, 3, axis=2), np.clip(fixed, 0, 255), rgb)
    # Полупрозрачную «дымку» внутри предмета делаем плотной.
    a = out[..., 3]
    out[..., 3] = np.where(a >= DENSE_FROM, 255.0, a)
    return out.astype(np.uint8)


def despeckle(cell: Image.Image, min_share: float) -> Image.Image:
    """Убрать из ячейки мелкие куски: хвосты соседних предметов и мусор листа.

    Отсчёт — от самой крупной области: всё мельче min_share от неё стирается.
    Порог долевой, а не абсолютный, потому что предмет в ячейке бывает и
    из двух частей (динозавр и мяч рядом) — такое надо сохранить.
    """
    data = np.array(cell)
    rows, find = label_runs(data[..., 3] > 8)

    areas: dict[int, int] = {}
    for row in rows:
        for start, end, index in row:
            root = find(index)
            areas[root] = areas.get(root, 0) + (end - start)
    if not areas:
        return cell

    limit = max(areas.values()) * min_share
    for y, row in enumerate(rows):
        for start, end, index in row:
            if areas[find(index)] < limit:
                data[y, start:end, 3] = 0
    return Image.fromarray(data, "RGBA")


def cells_by_parts(
    flat: Image.Image, cols: int, rows: int, min_share: float
) -> dict[int, tuple[int, int, int, int]]:
    """Разложить связные куски листа по ячейкам сетки — по центру куска.

    Жёсткая сетка режет предмет, который вылез за границу ячейки (у листа
    частей так отрезало шею у тела и кончик хвоста). Здесь ячейка только
    говорит, какому имени принадлежит кусок, а границы берутся от него самого.
    """
    data = np.array(flat)
    runs, find = label_runs(data[..., 3] > 8)

    boxes: dict[int, list[int]] = {}
    for y, row in enumerate(runs):
        for start, end, index in row:
            root = find(index)
            box = boxes.get(root)
            if box is None:
                boxes[root] = [start, y, end, y + 1, end - start]
            else:
                box[0] = min(box[0], start)
                box[1] = min(box[1], y)
                box[2] = max(box[2], end)
                box[3] = max(box[3], y + 1)
                box[4] += end - start
    if not boxes:
        return {}

    limit = max(box[4] for box in boxes.values()) * min_share
    cell_w, cell_h = flat.width / cols, flat.height / rows
    found: dict[int, list[int]] = {}
    for box in boxes.values():
        if box[4] < limit:
            continue
        col = min(cols - 1, int((box[0] + box[2]) / 2 // cell_w))
        row_index = min(rows - 1, int((box[1] + box[3]) / 2 // cell_h))
        key = row_index * cols + col
        seen = found.get(key)
        # Два куска в одной ячейке — один предмет из частей (динозавр и мяч).
        found[key] = (
            box
            if seen is None
            else [
                min(seen[0], box[0]),
                min(seen[1], box[1]),
                max(seen[2], box[2]),
                max(seen[3], box[3]),
                seen[4] + box[4],
            ]
        )
    return {key: (box[0], box[1], box[2], box[3]) for key, box in found.items()}


def trim(cell: Image.Image, pad: int) -> Image.Image | None:
    """Обрезать по непрозрачному содержимому и добавить поле."""
    alpha = np.array(cell)[..., 3]
    ys, xs = np.nonzero(alpha > 8)
    if ys.size == 0:
        return None
    top, bottom = int(ys.min()), int(ys.max())
    left, right = int(xs.min()), int(xs.max())
    box = (
        max(0, left - pad),
        max(0, top - pad),
        min(cell.width, right + 1 + pad),
        min(cell.height, bottom + 1 + pad),
    )
    return cell.crop(box)


def fit_square(img: Image.Image, side: int) -> Image.Image:
    """Вписать спрайт в квадрат side x side, сохранив пропорции."""
    scale = min(side / img.width, side / img.height)
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    resized = img.resize(size, Image.LANCZOS)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(resized, ((side - size[0]) // 2, (side - size[1]) // 2))
    return canvas


def fit_free(img: Image.Image, side: int) -> Image.Image:
    """Привести к высоте side без полей: для цельного спрайта поля — это
    невидимый отступ, из-за которого персонаж висит над точкой опоры."""
    scale = side / max(img.width, img.height)
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    return img.resize(size, Image.LANCZOS)


def contact_sheet(tiles: list[tuple[str, Image.Image]], path: pathlib.Path) -> None:
    """Лист для проверки глазами: тёмный фон покажет каймы и дыры."""
    if not tiles:
        return
    cols = min(6, len(tiles))
    rows = (len(tiles) + cols - 1) // cols
    cell = 200
    sheet = Image.new("RGBA", (cols * cell, rows * cell), (30, 30, 34, 255))
    for index, (_, tile) in enumerate(tiles):
        preview = fit_square(tile, cell - 16)
        x = (index % cols) * cell + 8
        y = (index // cols) * cell + 8
        sheet.alpha_composite(preview, (x, y))
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(path, "PNG")
    print(f"  контактный лист: {path}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("--grid", required=True, help="колонкиXряды, например 3x4")
    parser.add_argument("--out", required=True, type=pathlib.Path)
    parser.add_argument("--prefix", default="")
    parser.add_argument("--names", default="", help="имена через запятую, по строкам слева направо")
    parser.add_argument("--side", type=int, default=256, help="сторона готового спрайта")
    parser.add_argument(
        "--fit",
        choices=["square", "free"],
        default="square",
        help="square — вписать в квадрат (значки в ячейках), free — по содержимому (цельный спрайт)",
    )
    parser.add_argument("--pad", type=int, default=6)
    parser.add_argument(
        "--min-part",
        type=float,
        default=0.06,
        help="доля от самой крупной области: что мельче — мусор, стирается",
    )
    parser.add_argument("--keep-bg", action="store_true", help="не снимать фон (для фонов и плиток)")
    parser.add_argument(
        "--cut",
        choices=["rembg", "flood"],
        default="rembg",
        help="чем снимать фон: нейросетью или заливкой от краёв (белые предметы, тонкие линии)",
    )
    parser.add_argument("--white", type=int, default=244, help="порог белого для --cut flood")
    parser.add_argument("--feather", type=float, default=0.8, help="сглаживание края для --cut flood")
    parser.add_argument(
        "--by-parts",
        action="store_true",
        help="границы брать от самих кусков, сетка только раздаёт имена",
    )
    parser.add_argument(
        "--inset",
        type=float,
        default=0.0,
        help="доля ячейки, срезаемая с каждой стороны до снятия фона (снимает рамку наклейки)",
    )
    args = parser.parse_args()

    if not args.source.exists():
        sys.exit(f"нет файла: {args.source}")
    cols, _, rows = args.grid.partition("x")
    cols, rows = int(cols), int(rows)

    print(f"лист {args.source} -> сетка {cols}x{rows}")
    if args.keep_bg:
        flat = Image.open(args.source).convert("RGBA")
    elif args.cut == "flood" and args.inset > 0:
        # Рамку наклейки срезаем геометрически, поэтому фон снимаем в каждой
        # ячейке отдельно: белое поле внутри рамки тогда касается края среза.
        print(f"  заливка в каждой ячейке, порог белого {args.white}, срез {args.inset:.0%}")
        flat = Image.open(args.source).convert("RGBA")
    elif args.cut == "flood":
        print(f"  заливка от краёв, порог белого {args.white}")
        flat = flood_cut(Image.open(args.source), args.white, args.feather)
    else:
        cut = WORK / (args.source.stem + "-cut.png")
        run_rembg(args.source, cut)
        flat = Image.open(cut).convert("RGBA")
        flat = Image.fromarray(defringe(np.array(flat)))

    names = [n.strip() for n in args.names.split(",") if n.strip()]
    args.out.mkdir(parents=True, exist_ok=True)

    cell_w = flat.width // cols
    cell_h = flat.height // rows
    tiles: list[tuple[str, Image.Image]] = []
    empty: list[str] = []
    parts = cells_by_parts(flat, cols, rows, args.min_part) if args.by_parts else {}

    for row in range(rows):
        for col in range(cols):
            index = row * cols + col
            name = names[index] if index < len(names) else f"{index + 1:02d}"
            if args.by_parts:
                found = parts.get(index)
                if found is None:
                    empty.append(name)
                    continue
                box = found
            else:
                inset_x = round(cell_w * args.inset)
                inset_y = round(cell_h * args.inset)
                box = (
                    col * cell_w + inset_x,
                    row * cell_h + inset_y,
                    (col + 1) * cell_w - inset_x,
                    (row + 1) * cell_h - inset_y,
                )
            cell = flat.crop(box)
            if args.cut == "flood" and args.inset > 0 and not args.keep_bg:
                cell = flood_cut(cell, args.white, args.feather)
            piece = trim(despeckle(cell, args.min_part), args.pad)
            if piece is None:
                empty.append(name)
                continue
            sprite = fit_square(piece, args.side) if args.fit == "square" else fit_free(piece, args.side)
            path = args.out / f"{args.prefix}{name}.png"
            sprite.save(path, "PNG", optimize=True)
            tiles.append((name, sprite))
            print(f"  {path.name:28s} {piece.width}x{piece.height} -> {args.side}")

    contact_sheet(tiles, WORK / f"{args.source.stem}-check.png")
    if empty:
        print(f"  ПУСТЫЕ ЯЧЕЙКИ: {', '.join(empty)} — перегенерить лист или поправить сетку")
    print(f"готово: {len(tiles)} спрайтов")


if __name__ == "__main__":
    main()
