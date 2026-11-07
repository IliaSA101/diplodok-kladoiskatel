/**
 * Хук before-stop: что считается правкой экрана после последнего обхода.
 *
 * Отдельный файл — своя подготовка: временный корень проекта на диске.
 * Раньше правкой считалось одно новое время файла, и хук останавливал работу
 * после прогона мутантов и после отката, хотя текст файла был тем же
 * (06–07.11, раз десять). Теперь нужно новое время и новое содержимое.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fingerprints, staleScreens } from '../tools/shots.mjs';

let root = '';
const LOOK = new Date('2026-11-07T00:00:00Z');
const AFTER = new Date('2026-11-07T01:00:00Z');
const BEFORE = new Date('2026-11-06T23:00:00Z');

function put(path: string, text: string, at: Date): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
  utimesSync(full, at, at);
}

/** Метка конца обхода: время LOOK и, если надо, отпечатки на тот момент. */
function stamp(withFiles: boolean): void {
  const files = withFiles ? fingerprints(root) : undefined;
  put('art-work/shots/_stamp.json', JSON.stringify({ at: LOOK.toISOString(), files }), LOOK);
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'shots-'));
  put('src/art/neck.ts', 'export const a = 1;\n', BEFORE);
  put('src/scenes/Forest.ts', 'export const b = 2;\n', BEFORE);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('свежесть экранов для хука before-stop', () => {
  it('файл переписали тем же текстом после обхода — экран не правили', () => {
    stamp(true);
    put('src/art/neck.ts', 'export const a = 1;\n', AFTER);
    expect(staleScreens(root)).toEqual([]);
  });

  it('после обхода изменили текст — правка экрана', () => {
    stamp(true);
    put('src/art/neck.ts', 'export const a = 2;\n', AFTER);
    expect(staleScreens(root)).toEqual(['src/art/neck.ts']);
  });

  it('новый рисующий файл, которого обход не видел, — правка экрана', () => {
    stamp(true);
    put('src/entities/Tail.ts', 'export const t = 0;\n', AFTER);
    expect(staleScreens(root)).toEqual(['src/entities/Tail.ts']);
  });

  it('метка без отпечатков (старый обход) — судим по времени, как раньше', () => {
    stamp(false);
    put('src/art/neck.ts', 'export const a = 1;\n', AFTER);
    expect(staleScreens(root)).toEqual(['src/art/neck.ts']);
  });

  it('файл не трогали после обхода — не правка, даже если текст другой, чем при обходе', () => {
    // Отпечатки обхода тут ни при чём: время файла старше метки.
    stamp(true);
    expect(staleScreens(root)).toEqual([]);
  });

  it('отпечатки берут только рисующие папки и пути от корня через косую', () => {
    put('src/systems/logic.ts', 'export const s = 0;\n', BEFORE);
    expect(Object.keys(fingerprints(root)).sort()).toEqual(['src/art/neck.ts', 'src/scenes/Forest.ts']);
  });

  it('обход кладёт отпечатки в метку: без них сравнение содержимого молча выключено', () => {
    // Middleware живёт в vite.config.ts и в тестах не поднимается — сверяем текст.
    const config = readFileSync(join(import.meta.dirname, '..', 'vite.config.ts'), 'utf8');
    expect(config).toMatch(/files: fingerprints\(ROOT\)/);
    expect(config).toMatch(/_stamp\.json'\), `\$\{JSON\.stringify\(stamp/);
  });
});
