"""Фон или бесшовная плитка из листа генерации.

Фон у этих картинок не снимаем — они и должны быть непрозрачными.
Задача простая: обрезать по нужному соотношению, привести к размеру игры
и, если это плитка, сшить края, чтобы стык не был виден.

    python tools/backdrop.py art-src/05-map-stadium.png --out public/art/quest-map-bg.png --size 1280x720
    python tools/backdrop.py art-src/06-grass-tile.png  --out public/art/pitch-tile.png   --size 512x512 --seamless 48

Повторный прогон даёт тот же файл.
"""

from __future__ import annotations

import argparse
import pathlib
import sys

import numpy as np
from PIL import Image


def crop_to_ratio(img: Image.Image, ratio: float) -> Image.Image:
    """Обрезать по центру до нужного соотношения сторон."""
    if img.width / img.height > ratio:
        width = round(img.height * ratio)
        left = (img.width - width) // 2
        return img.crop((left, 0, left + width, img.height))
    height = round(img.width / ratio)
    top = (img.height - height) // 2
    return img.crop((0, top, img.width, top + height))


def make_seamless(img: Image.Image, blend: int) -> Image.Image:
    """Сшить края плитки.

    Берём зеркальную полосу с противоположного края и подмешиваем её с
    линейным весом. На шумной траве стык после этого не виден, а рисунок
    в середине плитки остаётся нетронутым.
    """
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    blend = min(blend, w // 4, h // 4)
    if blend < 2:
        return img

    ramp = np.linspace(0.5, 0.0, blend, dtype=np.float32)

    # Левый край подмешиваем к правому и наоборот — так обе стороны сходятся.
    left = a[:, :blend].copy()
    right = a[:, -blend:].copy()
    a[:, :blend] = left * (1 - ramp)[None, :, None] + right[:, ::-1] * ramp[None, :, None]
    a[:, -blend:] = right * (1 - ramp[::-1])[None, :, None] + left[:, ::-1] * ramp[::-1][None, :, None]

    top = a[:blend].copy()
    bottom = a[-blend:].copy()
    a[:blend] = top * (1 - ramp)[None, :, None].transpose(1, 0, 2) + bottom[::-1] * ramp[:, None, None]
    a[-blend:] = bottom * (1 - ramp[::-1])[:, None, None] + top[::-1] * ramp[::-1][:, None, None]

    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


def seam_report(img: Image.Image) -> str:
    """Насколько заметен стык: сравниваем с разницей соседних строк внутри плитки."""
    a = np.asarray(img.convert('RGB')).astype(np.float32)
    seam_x = float(np.abs(a[:, 0] - a[:, -1]).mean())
    seam_y = float(np.abs(a[0] - a[-1]).mean())
    inner = float(np.abs(a[a.shape[0] // 2] - a[a.shape[0] // 2 + 1]).mean())
    return f"стык по X {seam_x:.1f}, по Y {seam_y:.1f}, обычная разница соседних строк {inner:.1f}"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=pathlib.Path)
    parser.add_argument("--out", required=True, type=pathlib.Path)
    parser.add_argument("--size", required=True, help="ШxВ готового файла, например 1280x720")
    parser.add_argument("--seamless", type=int, default=0, help="ширина сшивки краёв в пикселях")
    args = parser.parse_args()

    if not args.source.exists():
        sys.exit(f"нет файла: {args.source}")
    width, _, height = args.size.partition("x")
    width, height = int(width), int(height)

    img = Image.open(args.source).convert("RGB")
    img = crop_to_ratio(img, width / height).resize((width, height), Image.LANCZOS)
    if args.seamless > 0:
        img = make_seamless(img, args.seamless)
        print(f"  после сшивки: {seam_report(img)}")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    img.save(args.out, "PNG", optimize=True)
    print(f"готово: {args.out} {width}x{height}, {args.out.stat().st_size // 1024} КБ")


if __name__ == "__main__":
    main()
