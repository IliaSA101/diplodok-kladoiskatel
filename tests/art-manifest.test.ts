/**
 * Манифест готового арта.
 *
 * Манифест — это строки, и типы его не проверяют. Опечатка в ключе тихо
 * оставляет спрайт процедурным, пропавший файл — грузится в никуда.
 * Проверяем и то и другое, пока это дёшево.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DINO_ART, DINO_MESH } from '../src/art/dinoArtMeta';
import { DINO_TEX, TEX } from '../src/art/keys';

const ART_DIR = join(process.cwd(), 'public', 'art');

interface Manifest {
  images?: Record<string, string>;
}

function readManifest(): Record<string, string> {
  const raw: string = readFileSync(join(ART_DIR, 'manifest.json'), 'utf8');
  const parsed = JSON.parse(raw) as Manifest;
  return parsed.images ?? {};
}

/** Все ключи текстур, которые игра вообще знает. */
function knownKeys(): Set<string> {
  const keys = new Set<string>();
  for (const value of Object.values(TEX)) {
    if (typeof value === 'string') keys.add(value);
    // Списком (TEX.FOOT) или словарём по имени (TEX.EN_CLUE) — всё равно ключи.
    else for (const item of Object.values(value)) keys.add(item);
  }
  for (const value of Object.values(DINO_TEX)) keys.add(value);
  for (const part of Object.values(DINO_ART)) if ('key' in part) keys.add(part.key);
  keys.add(DINO_MESH.key);
  keys.add(DINO_MESH.eyeKey);
  return keys;
}

describe('манифест арта', () => {
  const images = readManifest();

  it('не пустой: иначе готовый арт в игру не попадает', () => {
    expect(Object.keys(images).length).toBeGreaterThan(0);
  });

  it('каждый ключ — известная игре текстура, а не опечатка', () => {
    const known = knownKeys();
    for (const key of Object.keys(images)) {
      expect(known.has(key), `ключ ${key} в манифесте, но игра его не спрашивает`).toBe(true);
    }
  });

  it('каждый файл на месте', () => {
    for (const [key, file] of Object.entries(images)) {
      expect(existsSync(join(ART_DIR, file)), `${key} -> ${file}`).toBe(true);
    }
  });

  it('один файл на один ключ', () => {
    const files = Object.values(images);
    expect(new Set(files).size).toBe(files.length);
  });

  it('каждая картинка английских слов, кружков и слов квеста есть в манифесте (И12)', () => {
    // Манифест — строки: забытый ключ тихо оставляет картинку процедурной, а у
    // этих слов процедурной нет, и ребёнок увидит пустое место.
    const wanted = [
      ...Object.values(TEX.EN_CLUE),
      ...Object.values(TEX.EN_SET),
      ...Object.values(TEX.WORD_PIC),
    ];
    expect(wanted).toHaveLength(10 + 10 + 1 + 3);
    for (const key of wanted) {
      expect(images[key], `нет ${key} в манифесте`).toBeDefined();
    }
  });
});
