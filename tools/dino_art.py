"""Три части нарисованного диплодока и числа, по которым они сходятся.

Предыдущая попытка собрать персонажа развалилась на швах: лапы стояли рядом
с телом, а шея рисовалась кодом и была плоской рядом с нарисованной головой.
Теперь частей три:

    тело с лапами и хвостом  —  прямой кусок шеи  —  голова

Шею в игре гнёт Phaser.Rope по той же кривой, по которой раньше её рисовал код,
так что нарисованным оказывается весь диплодок, а швов остаётся два, и оба —
между кусками одного рисунка.

Масштабы:

    тело   — выводится из рига: от среза шеи до земли ровно |shoulderY| пикселей;
    голова — из пропорции на самом листе: на целом диплодоке голова занимает
             долю HEAD_SHARE его длины, её и держим;
    шея    — чтобы у плеча быть толщиной NECK_AT_SHOULDER, как культя тела.

Выводить толщину головы из толщины шеи нельзя: на листе голова нарисована
крупно и с тонкой культёй, а на целом диплодоке шея у головы заметно толще
этой культи. Правда — целый диплодок, культя у головы просто прячется за ним.

    python tools/dino_art.py art-work/parts/mE4IBGLhJQ --out public/art

Пишет спрайты в --out и числа в src/art/dinoArtMeta.ts.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
from dino_owners import croup_top, face_owners, owners_meta  # noqa: E402
from dino_parts import eye_box, eye_centre, patch_eye  # noqa: E402

# Плечо диплодока в системе рига — из DINO_GEOM (src/art/diplodocus.ts).
SHOULDER_X = 38.0
SHOULDER_Y = -124.0
# Доля длины головы от длины диплодока — снята с целого диплодока на листе.
HEAD_SHARE = 0.246
# Толщина шеи у головы, px рига. Задаём именно этот конец: стык у плеча прячется
# внутри тела, а у головы шея должна входить в неё, а не торчать вокруг.
NECK_AT_HEAD = 15.0
# Мерить срез у самой кромки нельзя — он скруглён; отступаем внутрь.
EDGE_INSET = 10
# Глаз на целом диплодоке мелкий: ищем его в окне такого радиуса, px.
EYE_WINDOW = 22
# Шея на целом диплодоке: её строки уже этой доли от самой широкой строки тела.
NECK_WIDTH_SHARE = 0.55
# Срезаем кремовый торец культи у тела: шея начинается ровно там, и светлое
# кольцо на плече иначе видно из-под неё.
STUB_TRIM = 26


def alpha_mask(img: Image.Image) -> np.ndarray:
    return np.array(img)[..., 3] > 128


def run_containing(row: np.ndarray, x: int) -> tuple[int, int]:
    """Непрерывный отрезок непрозрачного, в который попадает x."""
    if not row[x]:
        return (x, x)
    left = x
    while left > 0 and row[left - 1]:
        left -= 1
    right = x
    while right + 1 < len(row) and row[right + 1]:
        right += 1
    return (left, right + 1)


def longest_run(row: np.ndarray) -> tuple[int, int]:
    edges = np.flatnonzero(np.diff(np.concatenate(([0], row.view(np.int8), [0]))))
    best = (0, 0)
    for start, end in zip(edges[::2], edges[1::2]):
        if end - start > best[1] - best[0]:
            best = (int(start), int(end))
    return best


def resized(img: Image.Image, scale: float) -> Image.Image:
    size = (max(1, round(img.width * scale)), max(1, round(img.height * scale)))
    return img.resize(size, Image.LANCZOS)


def measure_body(img: Image.Image) -> dict[str, float]:
    """Срез шеи у тела: самый верхний выступ рисунка."""
    mask = alpha_mask(img)
    top = int(np.flatnonzero(mask.any(axis=1))[0])
    tip_start, tip_end = longest_run(mask[top + EDGE_INSET])
    return {'tipX': (tip_start + tip_end) / 2, 'tipY': float(top)}


def measure_head(img: Image.Image) -> dict[str, float]:
    """Срез шеи у головы: самый низ рисунка."""
    mask = alpha_mask(img)
    bottom = int(np.flatnonzero(mask.any(axis=1))[-1])
    start, end = longest_run(mask[bottom - EDGE_INSET])
    ys, xs = np.nonzero(mask)
    # Длина самой головы, без культи: верхние три пятых куска.
    height = int(ys.max() - ys.min() + 1)
    band = mask[int(ys.min()) : int(ys.min() + height * 0.6)]
    return {
        'cutX': (start + end) / 2,
        'cutY': float(bottom),
        'length': float(band.sum(axis=1).max()),
        'centreX': float(xs.mean()),
        'centreY': float(ys.mean()),
    }


def measure_neck(img: Image.Image) -> dict[str, float]:
    """Кусок шеи: толщина обоих концов, с отступом от скруглённых срезов."""
    mask = alpha_mask(img)
    left = longest_run(mask[:, EDGE_INSET * 2])
    right = longest_run(mask[:, -EDGE_INSET * 2])
    return {'left': float(left[1] - left[0]), 'right': float(right[1] - right[0])}


def neck_axis(img: Image.Image) -> dict[str, float]:
    """Осевая линия шеи на целом диплодоке.

    Шея — это полоса строк между головой (она шире) и телом (оно гораздо шире).
    Берём в каждой такой строке середину непрозрачного отрезка: получается ось,
    вдоль которой сетка и будет гнуть картинку.
    """
    mask = alpha_mask(img)
    height = mask.shape[0]

    def single_run(y: int) -> tuple[int, int] | None:
        """Отрезок строки, если он там ровно один: иначе в строке уже и тело."""
        row = mask[y]
        edges = np.flatnonzero(np.diff(np.concatenate(([0], row.view(np.int8), [0]))))
        runs = [(int(s), int(e)) for s, e in zip(edges[::2], edges[1::2]) if e - s > 3]
        return runs[0] if len(runs) == 1 else None

    # Голова сверху: её строки шире шейных. Ищем, где ширина резко падает.
    head_peak = 0
    head_row = 0
    for y in range(height // 3):
        run = single_run(y)
        if run is not None and run[1] - run[0] > head_peak:
            head_peak = run[1] - run[0]
            head_row = y
    if head_peak == 0:
        raise SystemExit('голова на целом диплодоке не нашлась')

    centres: list[tuple[float, float, float]] = []
    started = False
    # Шею ищем только ниже самой широкой строки головы: выше неё узкие строки —
    # это кончик морды, и на нём поиск срывался.
    for y in range(head_row, height):
        run = single_run(y)
        if run is None:
            if started:
                break
            continue
        thickness = run[1] - run[0]
        if not started and thickness < head_peak * NECK_WIDTH_SHARE:
            started = True
        if not started:
            continue
        # Снизу шея расширяется в спину — на этом и останавливаемся.
        if centres and thickness > centres[0][2] * 1.6:
            break
        centres.append(((run[0] + run[1]) / 2, float(y), float(thickness)))
    if len(centres) < 5:
        raise SystemExit('шея на целом диплодоке не нашлась')

    return {
        'topX': centres[0][0],
        'topY': centres[0][1],
        'baseX': centres[-1][0],
        'baseY': centres[-1][1],
        'thickness': float(np.median([c[2] for c in centres])),
        'groundY': float(np.flatnonzero(mask.any(axis=1))[-1] + 1),
    }


def tight_box(img: Image.Image, centre: tuple[float, float], window: int) -> tuple[int, int, int, int]:
    """Рамка глаза: тёмное и белое рядом с найденным зрачком, но не дальше window."""
    data = np.array(img)
    solid = data[..., 3] > 128
    rgb = data[..., :3]
    ink = solid & ((rgb.max(axis=2) < 90) | (rgb.min(axis=2) > 235))
    cx, cy = int(centre[0]), int(centre[1])
    patch = np.zeros_like(ink)
    patch[max(0, cy - window) : cy + window, max(0, cx - window) : cx + window] = ink[
        max(0, cy - window) : cy + window, max(0, cx - window) : cx + window
    ]
    ys, xs = np.nonzero(patch)
    if ys.size == 0:
        return (cx - 8, cy - 8, cx + 8, cy + 8)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def body_parts(img: Image.Image) -> dict[str, object]:
    """Глаз, морда, линия живота и четыре лапы на целом диплодоке.

    По этим числам код оживляет рисунок, не разрезая его: глаз вырезается
    в свою текстуру и моргает, листик едет ко рту, а вершины каждой лапы
    поворачиваются вокруг своего бедра.
    """
    data = np.array(img)
    mask = data[..., 3] > 128
    height, width = mask.shape
    rgb = data[..., :3]

    def runs_at(y: int, least: int) -> list[tuple[int, int]]:
        row = mask[y]
        edges = np.flatnonzero(np.diff(np.concatenate(([0], row.view(np.int8), [0]))))
        return [(int(s), int(e)) for s, e in zip(edges[::2], edges[1::2]) if e - s > least]

    # Живот: строка, ниже которой тело распадается на отдельные лапы.
    belly = 0
    legs: list[tuple[int, int]] = []
    for y in range(height // 2, height):
        found = runs_at(y, 12)
        if len(found) >= 4:
            belly = y
            # Хвост тоже даёт отрезок: лапы — четыре самых правых.
            legs = sorted(found, key=lambda r: r[0])[-4:]
            break
    if not legs:
        raise SystemExit('лапы на целом диплодоке не нашлись')
    # Чуть ниже живота лапы уже разошлись, но ещё не сузились к копытам.
    sample = min(height - 1, belly + (height - belly) // 3)
    wide = sorted(runs_at(sample, 12), key=lambda r: r[0])[-4:]
    if len(wide) == 4:
        legs = wide

    # Глаз: самое плотное тёмное пятно в голове, то есть справа вверху.
    dark = mask & (rgb.max(axis=2) < 90)
    best = (0, 0.0, 0.0)
    for cy in range(10, int(height * 0.3), 4):
        for cx in range(int(width * 0.6), width, 4):
            count = int(dark[cy - 10 : cy + 10, cx - 10 : cx + 10].sum())
            if count > best[0]:
                best = (count, float(cx), float(cy))

    # Морда: самая правая точка головы.
    band = mask[: int(height * 0.25)]
    ys, xs = np.nonzero(band)
    snout_x = float(xs.max())
    snout_y = float(ys[xs >= snout_x - 4].mean())

    # Хвост у этого диплодока — крюк: от крупа он уходит влево и вниз,
    # а кончиком возвращается вправо под брюхо, ниже лап. Поэтому хвост —
    # это всё левее задней лапы ПЛЮС всё, что ниже самой низкой лапы.
    # Одним «левее» не обойтись: кончик остаётся справа и рвёт рисунок.
    tail_base_x = float(legs[0][0])
    column = np.flatnonzero(mask[:, int(tail_base_x)])
    tail_base_y = float((column.min() + column.max()) / 2) if column.size else float(belly)
    tail_tip_x = float(np.flatnonzero(mask.any(axis=0)).min())
    # Низ копыт: идём вниз по середине каждой лапы, пока под ней рисунок.
    # Брать самый низ столбца нельзя — под лапой проходит кончик хвоста.
    foot_bottom = 0
    bottoms: list[float] = []
    for a, b in legs:
        centre = (a + b) // 2
        y = sample
        while y + 1 < height and mask[y + 1, centre]:
            y += 1
        bottoms.append(float(y))
        foot_bottom = max(foot_bottom, y)
    tail_floor_y = float(foot_bottom + 4)

    ys, xs = np.nonzero(mask)
    is_tail = (xs < tail_base_x) | (ys > tail_floor_y)
    tail_reach = float(
        np.hypot(xs[is_tail] - tail_base_x, ys[is_tail] - tail_base_y).max()
    ) if is_tail.any() else 1.0

    return {
        'eyeX': best[1],
        'eyeY': best[2],
        'mouthX': snout_x,
        'mouthY': snout_y,
        'bellyY': float(belly),
        'legs': [
            ((a + b) / 2, float(b - a), bottom) for (a, b), bottom in zip(legs, bottoms)
        ],
        'tailBaseX': float(tail_base_x),
        'tailBaseY': tail_base_y,
        'tailTipX': tail_tip_x,
        'tailFloorY': tail_floor_y,
        'tailReach': tail_reach,
    }


def neck_palette(img: Image.Image) -> dict[str, str]:
    """Цвета шеи прямо с рисунка: кожа, кремовое горло и контур.

    Шею в игре рисует код — она единственная часть, которая тянется. Чтобы
    не выделяться рядом с нарисованными телом и головой, она берёт их цвета
    отсюда, а не подбирается на глаз.
    """
    data = np.array(img)
    solid = data[..., 3] > 200
    rgb = data[..., :3]

    def common(selected: np.ndarray) -> str:
        values = rgb[selected].reshape(-1, 3)
        if values.size == 0:
            return '0x000000'
        colours, counts = np.unique(values, axis=0, return_counts=True)
        r, g, b = colours[int(np.argmax(counts))]
        return f'0x{r:02x}{g:02x}{b:02x}'

    skin = solid & (rgb.min(axis=2) > 120) & (rgb[..., 2] > rgb[..., 0])
    belly = solid & (rgb.min(axis=2) > 190) & (rgb[..., 0] >= rgb[..., 2])
    outline = solid & (rgb.max(axis=2) < 110)
    return {'body': common(skin), 'belly': common(belly), 'outline': common(outline)}


def measure_whole(img: Image.Image) -> dict[str, float]:
    """Целый диплодок с того же листа — источник правды по пропорциям."""
    mask = alpha_mask(img)
    ys, xs = np.nonzero(mask)
    height = float(ys.max() - ys.min() + 1)
    band = mask[int(ys.min()) : int(ys.min() + height * 0.22)]
    return {
        'length': float(xs.max() - xs.min() + 1),
        'height': height,
        'headLength': float(band.sum(axis=1).max()),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=pathlib.Path, help='папка с p-body.png, p-head.png, p-neck.png')
    parser.add_argument('--out', required=True, type=pathlib.Path)
    parser.add_argument('--meta', type=pathlib.Path, default=pathlib.Path('src/art/dinoArtMeta.ts'))
    parser.add_argument(
        '--head-share',
        type=float,
        default=0.0,
        help='доля длины головы от длины диплодока; 0 — взять с целого рисунка на листе',
    )
    args = parser.parse_args()

    body = Image.open(args.source / 'p-body.png').convert('RGBA')
    # Срез культи измеряем до обрезки: после неё в верхней строке появляется
    # ещё и спина, и самый длинный отрезок там уже не культя.
    stub_x = measure_body(body)['tipX']
    top_row = int(np.flatnonzero(alpha_mask(body).any(axis=1))[0])
    body = body.crop((0, top_row + STUB_TRIM, body.width, body.height))
    head = Image.open(args.source / 'p-head.png').convert('RGBA')
    neck = Image.open(args.source / 'p-neck.png').convert('RGBA')
    whole = Image.open(args.source / 'p-whole.png').convert('RGBA')

    # После обрезки культя начинается с самой верхней строки; её центр берём
    # по отрезку, в который попадает измеренный до обрезки x.
    stub_run = run_containing(alpha_mask(body)[2], int(stub_x))
    b = {'tipX': (stub_run[0] + stub_run[1]) / 2, 'tipY': 0.0}
    h = measure_head(head)
    n = measure_neck(neck)
    w = measure_whole(whole)
    palette = neck_palette(neck)
    axis = neck_axis(whole)
    # Масштаб целой картинки: от основания шеи до земли ровно |shoulderY|.
    mesh_scale = abs(SHOULDER_Y) / (axis['groundY'] - axis['baseY'])

    def to_rig(x: float, y: float) -> tuple[float, float]:
        return (
            (x - axis['baseX']) * mesh_scale + SHOULDER_X,
            (y - axis['groundY']) * mesh_scale,
        )

    head_rest = to_rig(axis['topX'], axis['topY'])
    parts = body_parts(whole)
    # Хозяева граней сетки ниже живота и верх спины над выходом хвоста
    # (tools/dino_owners.py): по ним dinoWarp гнёт лапы и хвост гранями.
    owners_row, owners_rows, owners_shifts = face_owners(whole, parts['bellyY'], parts['legs'])
    croup_y = croup_top(whole, parts['tailBaseX'])
    # Окно под размер глаза, а не под размер картинки: иначе в рамку попадает
    # контур всей головы и заплатка ложится на морду.
    eye_box_whole = tight_box(whole, (parts['eyeX'], parts['eyeY']), EYE_WINDOW)
    whole_patched = patch_eye(whole, eye_box_whole)
    whole_patched.save(args.out / 'dino-whole.png', 'PNG', optimize=True)
    # Глаз сохраняем в разрешении самого рисунка. Раньше он тут же ужимался
    # в mesh_scale — до девяти пикселей, — а на экране его растягивали обратно,
    # и моргал диплодок явной лесенкой. Ужимать картинку, которую всё равно
    # увеличат, смысла нет: кто рисует глаз в пикселях рига, тот и ужмёт.
    whole.crop(eye_box_whole).save(args.out / 'dino-mesh-eye.png', 'PNG', optimize=True)
    legs_ts = ', '.join(
        f'{{ x: {cx:.1f}, width: {w:.1f}, bottom: {bottom:.1f} }}'
        for cx, w, bottom in parts['legs']
    )

    # Тело: от среза шеи до земли должно уложиться ровно |shoulderY|.
    body_scale = abs(SHOULDER_Y) / (body.height - b['tipY'])
    # Голова: держим её долю от длины диплодока, снятую с целого рисунка.
    share = args.head_share if args.head_share > 0 else w['headLength'] / w['length']
    head_scale = share * (body.width * body_scale) / h['length']
    # Шея: задан тонкий конец, толстый получается из собственного сбега рисунка.
    neck_scale = NECK_AT_HEAD / n['right']
    head_join = NECK_AT_HEAD
    shoulder_width = n['left'] * neck_scale

    args.out.mkdir(parents=True, exist_ok=True)
    body_img = resized(body, body_scale)
    neck_img = resized(neck, neck_scale)

    box = eye_box(head, eye_centre(head))
    head_img = resized(patch_eye(head, box), head_scale)
    eye_img = resized(head.crop(box), head_scale)

    body_img.save(args.out / 'dino-art-body.png', 'PNG', optimize=True)
    neck_img.save(args.out / 'dino-art-neck.png', 'PNG', optimize=True)
    head_img.save(args.out / 'dino-art-head.png', 'PNG', optimize=True)
    eye_img.save(args.out / 'dino-art-eye.png', 'PNG', optimize=True)

    # Угол культи головы: от среза к середине головы. На него поворачивается
    # голова, чтобы продолжать шею, куда бы та ни изогнулась.
    stub_angle = float(np.degrees(np.arctan2(h['centreY'] - h['cutY'], h['centreX'] - h['cutX'])))
    eye_x = ((box[0] + box[2]) / 2 - h['cutX']) * head_scale
    eye_y = ((box[1] + box[3]) / 2 - h['cutY']) * head_scale

    meta = f'''/**
 * Числа нарисованного диплодока — посчитаны tools/dino_art.py по самим картинкам.
 *
 * Правка руками бессмысленна: при следующем прогоне инструмент перезапишет файл.
 * Масштабы выведены друг из друга по толщине стыков, поэтому тело, шея и голова
 * сходятся без подгонки на глаз.
 */

export const DINO_ART = {{
  /** Тело с лапами и хвостом; привязка — срез шеи, он встаёт в плечо рига. */
  body: {{
    key: 'dino-art-body',
    originX: {b['tipX'] * body_scale / body_img.width:.4f},
    originY: {b['tipY'] * body_scale / body_img.height:.4f},
  }},
  /**
   * Шея: единственная часть, которую рисует код, — она тянется к кронам.
   * Цвета и толщина сняты с нарисованного куска шеи, чтобы шов не бросался.
   */
  neck: {{
    radiusShoulder: {shoulder_width / 2:.1f},
    radiusHead: {head_join / 2:.1f},
    body: {palette['body']},
    belly: {palette['belly']},
    outline: {palette['outline']},
  }},
  /** Голова; привязка — срез шеи, вокруг него голова и поворачивается. */
  head: {{
    key: 'dino-art-head',
    originX: {h['cutX'] * head_scale / head_img.width:.4f},
    originY: {h['cutY'] * head_scale / head_img.height:.4f},
    /** Куда смотрит культя на рисунке, градусы: на столько голову доворачиваем. */
    stubAngle: {stub_angle:.1f},
    /** Глаз относительно привязки, px. */
    eyeX: {eye_x:.1f},
    eyeY: {eye_y:.1f},
  }},
  /** Глаз отдельной текстурой: риг его моргает. */
  eye: {{ key: 'dino-art-eye' }},
}} as const;

/**
 * Целый диплодок одной картинкой, которую гнёт сетка.
 *
 * Швов нет, потому что нет кусков: Plane натягивает рисунок на сетку вершин,
 * а код двигает только те вершины, что попали в шею и голову. Числа ниже —
 * где на рисунке шея начинается и кончается, в координатах рига.
 */
export const DINO_MESH = {{
  key: 'dino-whole',
  /** Глаз, вырезанный с этого же рисунка: им моргают. */
  eyeKey: 'dino-mesh-eye',
  /** Размер картинки, px: по нему вершины переводятся в пиксели рисунка. */
  imageWidth: {whole.width},
  imageHeight: {whole.height},
  /** Сколько пикселей рига в пикселе рисунка. */
  scale: {mesh_scale:.4f},
  /** Основание шеи: совпадает с плечом рига. */
  shoulderX: {SHOULDER_X:.1f},
  shoulderY: {SHOULDER_Y:.1f},
  /** Оно же на самой картинке, px: по нему вершины переводятся в риг. */
  shoulderImageX: {axis['baseX']:.1f},
  /** Где голова сидит на нетронутом рисунке: отсюда и считается изгиб. */
  headRestX: {head_rest[0]:.1f},
  headRestY: {head_rest[1]:.1f},
  /** Толщина шеи на рисунке, px рига. */
  neckThickness: {axis['thickness'] * mesh_scale:.1f},
  /** Глаз на рисунке, px картинки: вокруг него моргание. */
  eyeX: {(eye_box_whole[0] + eye_box_whole[2]) / 2:.1f},
  eyeY: {(eye_box_whole[1] + eye_box_whole[3]) / 2:.1f},
  /** Кончик морды: туда едет листик. */
  mouthX: {parts['mouthX']:.1f},
  mouthY: {parts['mouthY']:.1f},
  /** Линия живота: ниже неё начинаются лапы. */
  bellyY: {parts['bellyY']:.1f},
  /** Четыре лапы слева направо: середина, ширина и низ копыта, px картинки. */
  legs: [{legs_ts}],
  /** Где хвост выходит из крупа: вокруг этой точки он качается. */
  tailBaseX: {parts['tailBaseX']:.1f},
  tailBaseY: {parts['tailBaseY']:.1f},
  /** Кончик хвоста: по нему считается, насколько сильно качать вершину. */
  tailTipX: {parts['tailTipX']:.1f},
  /** Ниже этой строки лап уже нет — там только кончик хвоста. */
  tailFloorY: {parts['tailFloorY']:.1f},
  /** Самая дальняя точка хвоста от основания, px картинки. */
  tailReach: {parts['tailReach']:.1f},
  /** Верх спины над выходом хвоста: хвост качается вокруг отрезка от неё до tailBaseY. */
  croupTopY: {croup_y:.1f},
{owners_meta(owners_row, owners_rows, owners_shifts)}}} as const;
'''
    args.meta.write_text(meta, encoding='utf-8')

    print(f'  тело   {body_img.size}  масштаб {body_scale:.3f}  срез {shoulder_width:.1f} px')
    print(f'  шея    {neck_img.size}  масштаб {neck_scale:.3f}  концы {shoulder_width:.1f} -> {head_join:.1f}')
    print(f'  голова {head_img.size}  масштаб {head_scale:.3f}  доля {share:.3f}  культя {stub_angle:.1f}°')
    print(f'  глаз   {eye_img.size}  в ({eye_x:.1f}, {eye_y:.1f}) от привязки')
    print(f'  сетка: рисунок {whole.width}x{whole.height}, масштаб {mesh_scale:.3f}')
    print(f'         шея от плеча ({SHOULDER_X:.0f}, {SHOULDER_Y:.0f}) '
          f'до головы ({head_rest[0]:.0f}, {head_rest[1]:.0f}), толщина {axis['thickness'] * mesh_scale:.0f}')
    print(f'  глаз на целом ({eye_box_whole[0]:.0f}..{eye_box_whole[2]:.0f}), '
          f'живот y={parts['bellyY']:.0f}, лап {len(parts['legs'])}')
    print(f'  числа: {args.meta}')


if __name__ == '__main__':
    main()
