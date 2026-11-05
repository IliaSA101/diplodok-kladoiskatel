"""Подогнать нарисованные части диплодока под риг игры.

Риг в src/art/diplodocus.ts собирает персонажа по DINO_GEOM: у каждой части
свой размер текстуры и своя точка привязки — бедро у лапы, основание у хвоста,
стык с шеей у головы. Поэтому части не просто уменьшаются: каждая кладётся
в холст своего размера так, чтобы её собственная точка привязки совпала с той,
которую риг уже ожидает. Тогда код рига и сцены трогать не нужно.

    python tools/dino_parts.py art-work/dino --out public/art

Печатает числа для DINO_GEOM: привязку головы, глаз и рот. Их вписать руками —
это свойства конкретного рисунка, и в коде им место рядом с остальной геометрией.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image, ImageDraw

# Размер текстуры и место, которое часть в ней занимает.
#
# Числа сняты с текстур, нарисованных кодом: риг годами собран под них, точки
# крепления лап и хвоста заданы относительно именно такого заполнения холста.
# Поэтому рисованная часть не подгоняется под точку привязки, а занимает ту же
# рамку, что занимала процедурная, — и весь риг остаётся в прежних пропорциях.
# Снять заново: в консоли браузера взять альфа-рамку текстуры из DINO_TEX.
PLACE = {
    "body": {"size": (124, 92), "box": (1, 1, 123, 87)},
    "head": {"size": (48, 36), "box": (2, 1, 46, 31)},
    "leg": {"size": (40, 72), "box": (1, 2, 39, 71)},
    "tail": {"size": (108, 64), "box": (2, 1, 108, 57)},
}
BODY_SIZE = PLACE["body"]["size"]
LEG_SIZE = PLACE["leg"]["size"]
TAIL_SIZE = PLACE["tail"]["size"]
HEAD_SIZE = PLACE["head"]["size"]
# Холсты глаза — как у процедурных текстур, риг кладёт их по центру.
EYE_SIZE = (18, 18)
EYE_HAPPY_SIZE = (20, 16)

# Шея начинается там, где голова перестала быть широкой.
NECK_WIDTH_SHARE = 0.62
# Дальняя пара лап уходит в тень.
FAR_LEG_DIM = 0.86


def opaque(img: Image.Image) -> np.ndarray:
    return np.array(img)[..., 3] > 128


def jaw_row(mask: np.ndarray) -> int:
    """Строка, ниже которой голова переходит в шею."""
    widths = mask.sum(axis=1)
    peak = int(widths.max())
    for y in range(int(np.argmax(widths)), len(widths)):
        if widths[y] < peak * NECK_WIDTH_SHARE:
            return y
    return len(widths)


def top_anchor(mask: np.ndarray) -> tuple[float, float]:
    """Центр самой верхней полосы: бедро у лапы, основание шеи у тела."""
    ys, xs = np.nonzero(mask)
    top = int(ys.min())
    return float(xs[ys <= top + 3].mean()), float(top)


def right_anchor(mask: np.ndarray) -> tuple[float, float]:
    """Центр самого правого столбца: толстый конец хвоста."""
    ys, xs = np.nonzero(mask)
    right = int(xs.max())
    return float(right), float(ys[xs >= right - 3].mean())


def place(src: Image.Image, slot: dict) -> tuple[Image.Image, float, tuple[float, float]]:
    """Вписать часть в ту же рамку холста, которую занимала процедурная.

    Возвращает холст, масштаб и смещение, чтобы вызывающий мог пересчитать
    в те же координаты что-то ещё — например центр глаза.
    """
    size = slot["size"]
    left, top, right, bottom = slot["box"]
    scale = min((right - left) / src.width, (bottom - top) / src.height)
    width = max(1, round(src.width * scale))
    height = max(1, round(src.height * scale))
    offset = (left + (right - left - width) / 2, top + (bottom - top - height) / 2)

    canvas = Image.new("RGBA", size, (0, 0, 0, 0))
    canvas.alpha_composite(src.resize((width, height), Image.LANCZOS), (round(offset[0]), round(offset[1])))
    return canvas, scale, offset


def eye_centre(img: Image.Image) -> tuple[float, float]:
    """Самое плотное тёмное пятно — зрачок."""
    data = np.array(img)
    dark = (data[..., 3] > 128) & (data[..., :3].max(axis=2) < 90)
    window = 26
    best = (0, 0.0, 0.0)
    for cy in range(0, dark.shape[0], 8):
        for cx in range(0, dark.shape[1], 8):
            count = int(dark[max(0, cy - window) : cy + window, max(0, cx - window) : cx + window].sum())
            if count > best[0]:
                best = (count, float(cx), float(cy))
    return best[1], best[2]


def eye_box(head: Image.Image, centre: tuple[float, float]) -> tuple[int, int, int, int]:
    """Прямоугольник глаза: тёмное и белое рядом с найденным зрачком."""
    data = np.array(head)
    solid = data[..., 3] > 128
    rgb = data[..., :3]
    ink = solid & ((rgb.max(axis=2) < 90) | (rgb.min(axis=2) > 235))
    window = round(head.width * 0.16)
    cx, cy = int(centre[0]), int(centre[1])
    sel = np.zeros_like(ink)
    sel[max(0, cy - window) : cy + window, max(0, cx - window) : cx + window] = ink[
        max(0, cy - window) : cy + window, max(0, cx - window) : cx + window
    ]
    ys, xs = np.nonzero(sel)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def patch_eye(head: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    """Замазать глаз цветом головы вокруг него.

    Глаз выносится в отдельную текстуру, потому что риг его моргает: если
    оставить нарисованный на месте, при зажмуривании он проступит сквозь.
    Заплатка видна только те сто миллисекунд, что длится моргание.
    """
    data = np.array(head)
    left, top, right, bottom = box
    margin = 6
    ring = data[
        max(0, top - margin) : bottom + margin, max(0, left - margin) : right + margin
    ].reshape(-1, 4)
    skin = ring[(ring[:, 3] > 128) & (ring[:, :3].min(axis=1) > 120) & (ring[:, :3].max(axis=1) < 235)]
    if skin.size == 0:
        return head
    colour = np.median(skin[:, :3], axis=0).astype(np.uint8)

    patched = data.copy()
    height, width = bottom - top, right - left
    yy, xx = np.mgrid[0:height, 0:width]
    inside = ((yy - height / 2) / (height / 2 + 1)) ** 2 + ((xx - width / 2) / (width / 2 + 1)) ** 2 <= 1
    region = patched[top:bottom, left:right]
    region[..., :3] = np.where(inside[..., None], colour, region[..., :3])
    region[..., 3] = np.where(inside, 255, region[..., 3])
    patched[top:bottom, left:right] = region
    return Image.fromarray(patched, "RGBA")


def dim(img: Image.Image, factor: float) -> Image.Image:
    """Притушить часть: дальняя пара лап в тени."""
    data = np.array(img).astype(np.float32)
    data[..., :3] *= factor
    return Image.fromarray(np.clip(data, 0, 255).astype(np.uint8), "RGBA")


def save_eye(eye: Image.Image, scale: float, out: pathlib.Path) -> None:
    """Глаз отдельной текстурой и его зажмуренный вариант.

    Размеры холстов — те же, что у процедурных (риг кладёт обе по центру),
    а сам глаз внутри ровно такой, каким его нарисовали, после уменьшения.
    """
    width = max(2, round(eye.width * scale))
    height = max(2, round(eye.height * scale))
    small = eye.resize((width, height), Image.LANCZOS)

    canvas = Image.new("RGBA", EYE_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(small, ((EYE_SIZE[0] - width) // 2, (EYE_SIZE[1] - height) // 2))
    canvas.save(out / "dino-eye.png", "PNG", optimize=True)

    # Зажмуренный глаз — дуга цветом контура исходного глаза.
    data = np.array(small)
    ink = data[..., :3][(data[..., 3] > 128) & (data[..., :3].max(axis=2) < 90)]
    colour = tuple(int(v) for v in (ink.mean(axis=0) if ink.size else (40, 40, 50)))
    happy = Image.new("RGBA", EYE_HAPPY_SIZE, (0, 0, 0, 0))
    draw = ImageDraw.Draw(happy)
    pad = 2
    draw.arc(
        (pad, pad, EYE_HAPPY_SIZE[0] - pad, EYE_HAPPY_SIZE[1] + EYE_HAPPY_SIZE[1] // 2),
        start=200,
        end=340,
        fill=(*colour, 255),
        width=max(2, height // 4),
    )
    happy.save(out / "dino-eye-happy.png", "PNG", optimize=True)
    print(f"  dino-eye.png       глаз {width}x{height} в холсте {EYE_SIZE[0]}x{EYE_SIZE[1]}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path, help="папка с part-*.png")
    parser.add_argument("--out", required=True, type=pathlib.Path)
    args = parser.parse_args()

    need = ["body", "head", "leg-near", "leg-far", "tail"]
    parts = {name: args.source / f"part-{name}.png" for name in need}
    missing = [str(path) for path in parts.values() if not path.exists()]
    if missing:
        sys.exit("нет частей: " + ", ".join(missing))
    args.out.mkdir(parents=True, exist_ok=True)

    # Тело: основание шеи — в плечо рига.
    body = Image.open(parts["body"]).convert("RGBA")
    canvas, _, _ = place(body, PLACE["body"])
    canvas.save(args.out / "dino-body.png", "PNG", optimize=True)
    print(f"  dino-body.png      {BODY_SIZE[0]}x{BODY_SIZE[1]}")

    # Лапы: бедро — в точку вращения.
    # Ближняя лапа — та, что крупнее и с пальцами; дальняя — тоньше и в тени.
    for name, key, factor in (
        ("leg-far", "dino-leg-near", 1.0),
        ("leg-near", "dino-leg-far", FAR_LEG_DIM),
    ):
        leg = Image.open(parts[name]).convert("RGBA")
        canvas, _, _ = place(leg, PLACE["leg"])
        if factor < 1.0:
            canvas = dim(canvas, factor)
        canvas.save(args.out / f"{key}.png", "PNG", optimize=True)
        print(f"  {key}.png  {LEG_SIZE[0]}x{LEG_SIZE[1]}")

    # Хвост: толстый конец — в место стыка с телом.
    tail = Image.open(parts["tail"]).convert("RGBA")
    canvas, _, _ = place(tail, PLACE["tail"])
    canvas.save(args.out / "dino-tail.png", "PNG", optimize=True)
    print(f"  dino-tail.png      {TAIL_SIZE[0]}x{TAIL_SIZE[1]}")

    # Голова: шею отрезаем — её риг рисует сам, живой кривой.
    head_full = Image.open(parts["head"]).convert("RGBA")
    mask = opaque(head_full)
    jaw = jaw_row(mask)
    head = head_full.crop((0, 0, head_full.width, jaw))
    eye = eye_centre(head)
    box = eye_box(head, eye)
    eye = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
    canvas, scale, offset = place(patch_eye(head, box), PLACE["head"])
    canvas.save(args.out / "dino-head.png", "PNG", optimize=True)
    save_eye(head.crop(box), scale, args.out)
    print(f"  dino-head.png      {HEAD_SIZE[0]}x{HEAD_SIZE[1]} (шея отрезана по y={jaw})")

    # Стык с шеей: низ головы по центру той полосы, где начиналась шея.
    neck_xs = np.nonzero(mask[min(jaw, mask.shape[0] - 1)])[0]
    neck_x = float(neck_xs.mean()) if neck_xs.size else head.width / 2
    joint = (neck_x * scale + offset[0], (jaw - 1) * scale + offset[1])
    eye_tex = (eye[0] * scale + offset[0], eye[1] * scale + offset[1])
    # Морда: самая правая точка головы.
    ys, xs = np.nonzero(opaque(head))
    snout = (float(xs.max()) * scale + offset[0], float(ys[xs >= xs.max() - 3].mean()) * scale + offset[1])

    print("\nчисла для DINO_GEOM:")
    print(f"  headOriginX: {joint[0]:.1f} / {HEAD_SIZE[0]},")
    print(f"  headOriginY: {joint[1]:.1f} / {HEAD_SIZE[1]},")
    print(f"  eyeX: {eye_tex[0] - joint[0]:.0f},")
    print(f"  eyeY: {eye_tex[1] - joint[1]:.0f},")
    print(f"  mouthX: {snout[0] - joint[0]:.0f},")
    print(f"  mouthY: {snout[1] - joint[1]:.0f},")


if __name__ == "__main__":
    main()
