"""Кому принадлежит каждая грань сетки диплодока ниже живота: хвосту или лапе.

`src/art/dinoWarp.ts` гнёт рисунок гранями, а не вершинами. Если разные
вершины одной грани уходят разным лапам, между ними растягивается кусок
картинки, а обводка лапы рвётся. Хозяина грани нельзя угадать по линиям
сетки (граница лапы идёт наискосок, а просвет между лапами 2 и 3 — косой и
шириной 4..9 px), поэтому его читают с самого рисунка: связные куски краски
ниже живота и треугольник, отданный тому куску, которому принадлежит больше
всего его краски.

Раскладка граней — как у Phaser.Plane (GenerateGridVerts): клетка даёт две
грани, верхнюю левую (u + v <= 1) и нижнюю правую; в строке 48 символов,
по два на клетку. Символ: `.` — краски нет, грань ходит как её вершины;
`t` — хвост; `0`..`3` — лапа слева направо.

Запускается из dino_art.py, а для проверки — отдельно:

    python tools/dino_owners.py public/art/dino-whole.png
    python tools/dino_owners.py public/art/dino-whole.png src/art/dinoArtMeta.ts   # переписать хвост меты
"""

from __future__ import annotations

import pathlib
import sys

import numpy as np
from PIL import Image

# Должны совпадать с MESH_COLS / MESH_ROWS в src/art/dinoWarp.ts (тест сверяет).
MESH_COLS = 24
MESH_ROWS = 44
# Краска — альфа выше этого. Выше порога 128, которым меряют контур тела:
# тут нужен и полупрозрачный край обводки.
PAINT = 40
# Ниже живота на столько начинаются лапы: сам шов с брюхом хозяина не имеет.
BELLY_MARGIN = 7
# Кусок мельче этого — пылинка на кромке, хозяина ей не назначают.
MIN_PIECE = 50
# Ось лапы может лежать чуть вне куска краски: допуск, px.
AXIS_SLACK = 5
# Не дальше этого от оси лапы вершина «ближайшая» (в долях ширины), как в dinoWarp.
LEG_REACH = 0.67
# Насколько вершину можно увести в просвет, px, и сколько проходов по вершинам.
SHIFT_MAX = 16
PASSES = 4
# Грань не стягивается тоньше этой доли своей площади в покое.
MIN_AREA_SHARE = 0.1
# Вершина, на которой краска делится между хозяевами, и цена каждого пикселя сдвига.
SPLIT_COST = 40.0
MOVE_COST = 0.02
# Вершина в просвете: вокруг не меньше стольких px без краски (тест смотрит окно ±2).
CLEAR_CAP = 3.5


def paint_pieces(alpha: np.ndarray, top: int) -> tuple[dict[tuple[int, int], int], list[tuple[int, int, int]]]:
    """Связные куски краски от строки top и ниже: карта пикселей и (размер, левый x, правый x)."""
    height, width = alpha.shape
    painted = alpha > PAINT
    label: dict[tuple[int, int], int] = {}
    pieces: list[tuple[int, int, int]] = []
    for y in range(top, height):
        for x in range(width):
            if not painted[y, x] or (x, y) in label:
                continue
            index = len(pieces)
            label[(x, y)] = index
            stack = [(x, y)]
            size = 0
            left = right = x
            while stack:
                cx, cy = stack.pop()
                size += 1
                left = min(left, cx)
                right = max(right, cx)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and top <= ny < height and painted[ny, nx] and (nx, ny) not in label:
                        label[(nx, ny)] = index
                        stack.append((nx, ny))
            pieces.append((size, left, right))
    return label, pieces


def nearest_leg(x: float, legs: list[tuple[float, float, float]]) -> int:
    """Лапа, к чьей оси x ближе в долях её ширины, а если ни к чьей — -1."""
    best, best_distance = -1, LEG_REACH
    for index, (axis, width, _bottom) in enumerate(legs):
        distance = abs(x - axis) / width
        if distance <= best_distance:
            best, best_distance = index, distance
    return best


class Mesh:
    """Сетка 24x44 с вершинами, которые можно сдвигать, и хозяевами её граней.

    Грань — как у Phaser: клетка (ix, iy) даёт `0` — треугольник a, b, d
    (верхний левый) и `1` — b, c, d (нижний правый), где a — левый верхний угол
    клетки, b — левый нижний, c — правый нижний, d — правый верхний.
    """

    def __init__(self, alpha: np.ndarray, belly_y: float, legs: list[tuple[float, float, float]]) -> None:
        self.alpha = alpha
        self.height, self.width = alpha.shape
        self.legs = legs
        self.belly_y = belly_y
        self.top = int(belly_y) + BELLY_MARGIN
        self.label, self.pieces = paint_pieces(alpha, self.top)
        big = [i for i, piece in enumerate(self.pieces) if piece[0] > MIN_PIECE]
        if not big:
            raise SystemExit('ниже живота нет краски')
        # Хвост — самый левый кусок: он начинается у края рисунка.
        self.tail = min(big, key=lambda i: self.pieces[i][1])
        # Карта кусков для векторного подсчёта: -1 — нет краски или пылинка.
        self.piece_map = np.full(alpha.shape, -1, dtype=np.int32)
        for (x, y), index in self.label.items():
            if self.pieces[index][0] > MIN_PIECE:
                self.piece_map[y, x] = index
        self.shift: dict[tuple[int, int], tuple[float, float]] = {}
        self.owner: dict[tuple[int, int, int], str] = {}

    def vertex(self, ix: int, iy: int) -> tuple[float, float]:
        dx, dy = self.shift.get((ix, iy), (0.0, 0.0))
        return ix * self.width / MESH_COLS + dx, iy * self.height / MESH_ROWS + dy

    @staticmethod
    def corners(ix: int, iy: int, side: int) -> list[tuple[int, int]]:
        a, b, c, d = (ix, iy), (ix, iy + 1), (ix + 1, iy + 1), (ix + 1, iy)
        return [a, b, d] if side == 0 else [b, c, d]

    def triangle(self, ix: int, iy: int, side: int) -> list[tuple[float, float]]:
        return [self.vertex(*corner) for corner in self.corners(ix, iy, side)]

    def piece_owner(self, piece: int, centre_x: float) -> str:
        if piece == self.tail:
            return 't'
        _size, left, right = self.pieces[piece]
        candidates = [i for i, (axis, _w, _b) in enumerate(self.legs) if left - AXIS_SLACK <= axis <= right + AXIS_SLACK]
        pick = nearest_leg(centre_x, self.legs)
        if pick not in candidates:
            pick = min(candidates, key=lambda i: abs(self.legs[i][0] - centre_x))
        return str(pick)

    def owner_of(self, ix: int, iy: int, side: int) -> str:
        """Хозяин грани: кусок с наибольшей долей её краски, `.` — краски нет."""
        tri = self.triangle(ix, iy, side)
        xs = [p[0] for p in tri]
        ys = [p[1] for p in tri]
        x0, x1 = max(0, int(min(xs))), min(self.width, int(max(xs)) + 1)
        y0, y1 = max(self.top, int(min(ys))), min(self.height, int(max(ys)) + 1)
        if x1 <= x0 or y1 <= y0:
            return '.'
        px, py = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = tri
        area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
        if abs(area) < 1e-9:
            return '.'
        w1 = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)) / area
        w2 = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / area
        inside = (w1 >= 0) & (w2 >= 0) & (w1 + w2 <= 1)
        found = self.piece_map[y0:y1, x0:x1][inside]
        found = found[found >= 0]
        if found.size == 0:
            return '.'
        piece = int(np.bincount(found).argmax())
        return self.piece_owner(piece, sum(xs) / 3)

    def fill_owners(self) -> None:
        for iy in range(MESH_ROWS):
            for ix in range(MESH_COLS):
                for side in (0, 1):
                    self.owner[(ix, iy, side)] = self.owner_of(ix, iy, side)

    def faces_at(self, vertex: tuple[int, int]) -> list[tuple[int, int, int]]:
        vx, vy = vertex
        found = []
        for iy in range(max(0, vy - 1), min(MESH_ROWS, vy + 1)):
            for ix in range(max(0, vx - 1), min(MESH_COLS, vx + 1)):
                for side in (0, 1):
                    if vertex in self.corners(ix, iy, side):
                        found.append((ix, iy, side))
        return found

    def on_paint(self, x: float, y: float) -> bool:
        cx, cy = round(x), round(y)
        window = self.alpha[max(0, cy - 2):cy + 3, max(0, cx - 2):cx + 3]
        return bool((window > PAINT).any())

    def edge_paint(self, p: tuple[float, float], q: tuple[float, float]) -> float:
        """Сколько px вдоль ребра лежит на краске."""
        steps = max(1, int(np.hypot(q[0] - p[0], q[1] - p[1]) * 2))
        count = 0
        for k in range(steps + 1):
            t = k / steps
            x, y = p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t
            xi, yi = int(x), int(y)
            if 0 <= xi < self.width and 0 <= yi < self.height and self.alpha[yi, xi] > PAINT:
                count += 1
        return count / 2

    def split_vertex(self, vertex: tuple[int, int]) -> bool:
        """На краске ли вершина и делят ли её грани с разными хозяевами."""
        owners = {self.owner[f] for f in self.faces_at(vertex)} - {'.'}
        x, y = self.vertex(*vertex)
        # Выше линии живота лапы не качаются (вес поворота ноль), и копии вершины
        # не расходятся, сколько бы хозяев ни сходилось; у хвоста вес другой.
        if y <= self.belly_y and 't' not in owners:
            return False
        return len(owners) > 1 and self.on_paint(x, y)

    def local_cost(self, vertex: tuple[int, int]) -> float:
        """Цена вершины: краска на рёбрах между разными хозяевами и сама вершина на краске."""
        faces = self.faces_at(vertex)
        corners = {c for f in faces for c in self.corners(*f)}
        cost = 0.0
        seen: set[tuple[tuple[int, int], tuple[int, int]]] = set()
        for face in faces:
            for i, c in enumerate(self.corners(*face)):
                edge = tuple(sorted((c, self.corners(*face)[(i + 1) % 3])))
                if edge in seen:
                    continue
                seen.add(edge)
                owners = {self.owner[f] for f in self.faces_on_edge(edge)} - {'.'}
                if len(owners) > 1:
                    cost += self.edge_paint(self.vertex(*edge[0]), self.vertex(*edge[1]))
        for c in corners:
            if self.split_vertex(c):
                cost += SPLIT_COST
        return cost

    def faces_on_edge(self, edge: tuple[tuple[int, int], tuple[int, int]]) -> list[tuple[int, int, int]]:
        a, b = edge
        return [f for f in self.faces_at(a) if b in self.corners(*f)]

    def sound(self, vertex: tuple[int, int]) -> bool:
        """Грани вокруг вершины не вывернуты и не стянуты в иголку."""
        for ix, iy, side in self.faces_at(vertex):
            (ax, ay), (bx, by), (cx, cy) = self.triangle(ix, iy, side)
            area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay)
            nominal = self.width / MESH_COLS * self.height / MESH_ROWS
            # Обе грани в покое обходятся с отрицательной площадью (y вниз): плюс — вывернута.
            if area >= 0 or -area < MIN_AREA_SHARE * nominal:
                return False
        return True

    def clearance(self, x: float, y: float) -> float:
        """Расстояние от точки до ближайшей краски, px, но не больше CLEAR_CAP."""
        r = int(CLEAR_CAP) + 1
        cx, cy = int(x), int(y)
        y0, x0 = max(0, cy - r), max(0, cx - r)
        window = self.alpha[y0:cy + r + 1, x0:cx + r + 1] > PAINT
        ys, xs = np.nonzero(window)
        if ys.size == 0:
            return CLEAR_CAP
        return min(CLEAR_CAP, float(np.hypot(xs + x0 + 0.5 - x, ys + y0 + 0.5 - y).min()))

    def centre_in_gap(self, vertex: tuple[int, int]) -> bool:
        """Уйти в ближайший просвет: туда, где вокруг не меньше CLEAR_CAP чистого места."""
        base = self.shift.get(vertex, (0.0, 0.0))
        x0, y0 = self.vertex(*vertex)
        best_cost, best = 1e9, base
        for dx in range(-SHIFT_MAX, SHIFT_MAX + 1):
            for dy in range(-SHIFT_MAX, SHIFT_MAX + 1):
                self.shift[vertex] = (base[0] + dx, base[1] + dy)
                if not self.sound(vertex):
                    continue
                if y0 + dy <= self.belly_y and 't' not in {self.owner[f] for f in self.faces_at(vertex)}:
                    # Выше живота копии вершины не расходятся: чище места не надо.
                    cost = MOVE_COST * (dx * dx + dy * dy)
                    if cost < best_cost - 1e-9:
                        best_cost, best = cost, self.shift[vertex]
                    continue
                clear = self.clearance(x0 + dx, y0 + dy)
                # Тест смотрит окно ±2 вокруг округлённой точки: на краске — это промах.
                cost = (CLEAR_CAP - clear) * 10 + (SPLIT_COST if self.on_paint(x0 + dx, y0 + dy) else 0) + MOVE_COST * (dx * dx + dy * dy)
                if cost < best_cost - 1e-9:
                    best_cost, best = cost, self.shift[vertex]
        self.shift[vertex] = best
        for f in self.faces_at(vertex):
            self.owner[f] = self.owner_of(*f)
        return best != base

    def optimise(self, vertex: tuple[int, int]) -> bool:
        """Подвинуть вершину туда, где грани с разными хозяевами не режут краску."""
        faces = self.faces_at(vertex)
        base = self.shift.get(vertex, (0.0, 0.0))
        best = (self.local_cost(vertex) + MOVE_COST * (base[0] ** 2 + base[1] ** 2), base)
        for dx in range(-SHIFT_MAX, SHIFT_MAX + 1):
            for dy in range(-SHIFT_MAX, SHIFT_MAX + 1):
                self.shift[vertex] = (float(dx), float(dy))
                if not self.sound(vertex):
                    continue
                for f in faces:
                    self.owner[f] = self.owner_of(*f)
                cost = self.local_cost(vertex) + MOVE_COST * (dx * dx + dy * dy)
                if cost < best[0] - 1e-9:
                    best = (cost, (float(dx), float(dy)))
        self.shift[vertex] = best[1]
        for f in faces:
            self.owner[f] = self.owner_of(*f)
        return best[1] != base


def face_owners(img: Image.Image, belly_y: float, legs: list[tuple[float, float, float]]) -> tuple[int, list[str], dict]:
    """Номер первой строки с хозяевами, строки по 2 * MESH_COLS символов и сдвиги вершин."""
    mesh = Mesh(np.array(img)[..., 3], belly_y, legs)
    mesh.fill_owners()
    # Вершины, где грани разных хозяев сходятся на краске: их уводят в просвет,
    # вместе с UV, и рисунок в покое не меняется, а грани по разные стороны просвета
    # уже не разрывают краску.
    first_flags = [(ix, iy) for iy in range(1, MESH_ROWS) for ix in range(1, MESH_COLS)
                   if mesh.vertex(ix, iy)[1] >= belly_y and mesh.split_vertex((ix, iy))]
    for vertex in first_flags:
        mesh.centre_in_gap(vertex)
    # Добивка: там, где ребро между гранями разных хозяев всё ещё идёт по краске
    # (вершины в просвете, а ребро между ними срезает угол лапы), двигаем и их.
    for _ in range(PASSES):
        dirty = [(ix, iy) for iy in range(1, MESH_ROWS) for ix in range(1, MESH_COLS)
                 if mesh.vertex(ix, iy)[1] >= belly_y and mesh.local_cost((ix, iy)) > 0]
        if not any(mesh.optimise(v) for v in dirty):
            break
    rows = []
    for iy in range(MESH_ROWS):
        rows.append(''.join(mesh.owner[(ix, iy, side)] for ix in range(MESH_COLS) for side in (0, 1)))
    first = next((i for i, row in enumerate(rows) if row.strip('.')), MESH_ROWS)
    shifts = {v: s for v, s in mesh.shift.items() if s != (0.0, 0.0)}
    return first, rows[first:], shifts


def croup_top(img: Image.Image, tail_base_x: float) -> float:
    """Верх краски на вертикали выхода хвоста: вокруг неё хвост качается, а не вокруг точки."""
    mask = np.array(img)[..., 3] > 128
    column = np.flatnonzero(mask[:, int(tail_base_x)])
    return float(column.min()) if column.size else 0.0


def owners_ts(first: int, rows: list[str]) -> str:
    """Строки для src/art/dinoArtMeta.ts: массив, по строке на ряд сетки."""
    body = '\n'.join(f"    '{row}'," for row in rows)
    return f'[\n{body}\n  ]'


def shifts_ts(shifts: dict[tuple[int, int], tuple[float, float]]) -> str:
    """Сдвиги вершин для dinoArtMeta.ts: [столбец, ряд, dx, dy] в px рисунка."""
    if not shifts:
        return '[]'
    body = '\n'.join(
        f'    [{ix}, {iy}, {dx:g}, {dy:g}],' for (ix, iy), (dx, dy) in sorted(shifts.items(), key=lambda kv: (kv[0][1], kv[0][0]))
    )
    return f'[\n{body}\n  ]'


def owners_meta(first: int, rows: list[str], shifts: dict[tuple[int, int], tuple[float, float]]) -> str:
    """Хвост DINO_MESH в dinoArtMeta.ts: хозяева граней и сдвиги вершин."""
    return f"""  /**
   * Чья каждая грань сетки ниже живота. Строка — ряд сетки, начиная с
   * faceOwnersRow, в ней по две грани на клетку: `.` — без краски (ходит как
   * её вершины), `t` — хвост, `0`..`3` — лапа слева направо. Считана по сетке
   * уже со сдвигами (`vertexShifts`).
   */
  faceOwnersRow: {first},
  faceOwners: {owners_ts(first, rows)},
  /**
   * Вершины, уведённые с краски в просвет: [столбец, ряд, dx, dy], px рисунка.
   * Двигаются все копии вершины вместе с UV, поэтому рисунок в покое тот же, а
   * грани разных хозяев сходятся уже не на краске и не рвут её.
   */
  vertexShifts: {shifts_ts(shifts)},
"""


def main() -> None:
    img = Image.open(sys.argv[1]).convert('RGBA')
    sys.path.insert(0, __file__.rsplit('/', 1)[0])
    from dino_art import body_parts  # noqa: PLC0415

    parts = body_parts(img)
    first, rows, shifts = face_owners(img, parts['bellyY'], parts['legs'])
    text = owners_meta(first, rows, shifts)
    if len(sys.argv) > 2:
        # Переписать хвост меты на месте, остальные числа не трогаем.
        meta = pathlib.Path(sys.argv[2])
        old = meta.read_text(encoding='utf-8')
        head = old[: old.index('  /**\n   * Чья каждая грань')]
        meta.write_text(head + text + '} as const;\n', encoding='utf-8')
        print(f'записано: {meta}, сдвигов {len(shifts)}')
        return
    print(f'croupTopY: {croup_top(img, parts["tailBaseX"]):.1f}')
    print(text)


if __name__ == '__main__':
    main()
