/**
 * Альфа-канал PNG в node — без картинок-библиотек.
 *
 * Нужен тестам сетки диплодока: куски краски они считают сами по рисунку, а не
 * берут у кода, который проверяют. Умеет ровно то, что лежит в `public/art`:
 * 8 бит, RGBA, без чересстрочности; всё остальное — понятная ошибка.
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

export interface AlphaImage {
  width: number;
  height: number;
  /** Альфа каждого пикселя, строка за строкой. */
  alpha: Uint8Array;
}

/** Предсказатель Пэта (фильтр 4). */
function paeth(left: number, up: number, upLeft: number): number {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  return pb <= pc ? up : upLeft;
}

export function readAlpha(file: string): AlphaImage {
  const png = readFileSync(file);
  if (png.toString('latin1', 12, 16) !== 'IHDR') throw new Error(`${file}: нет IHDR`);
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const depth = png.readUInt8(24);
  const colour = png.readUInt8(25);
  const interlace = png.readUInt8(28);
  if (depth !== 8 || colour !== 6 || interlace !== 0) {
    throw new Error(`${file}: нужен RGBA 8 бит без чересстрочности, а тут ${depth}/${colour}/${interlace}`);
  }

  const parts: Buffer[] = [];
  for (let at = 8; at < png.length; ) {
    const size = png.readUInt32BE(at);
    if (png.toString('latin1', at + 4, at + 8) === 'IDAT') parts.push(png.subarray(at + 8, at + 8 + size));
    at += size + 12;
  }
  const raw = inflateSync(Buffer.concat(parts));

  const stride = width * 4;
  const rows = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)] ?? 0;
    for (let i = 0; i < stride; i += 1) {
      const byte = raw[y * (stride + 1) + 1 + i] ?? 0;
      const left = i >= 4 ? (rows[y * stride + i - 4] ?? 0) : 0;
      const up = y > 0 ? (rows[(y - 1) * stride + i] ?? 0) : 0;
      const upLeft = y > 0 && i >= 4 ? (rows[(y - 1) * stride + i - 4] ?? 0) : 0;
      let value = byte;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) value += paeth(left, up, upLeft);
      rows[y * stride + i] = value & 0xff;
    }
  }

  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i += 1) alpha[i] = rows[i * 4 + 3] ?? 0;
  return { width, height, alpha };
}
