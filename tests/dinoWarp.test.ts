/**
 * Карта хозяев граней сетки диплодока и раскладка граней в Phaser.
 * Как сетка ведёт себя в позах — `tests/dinoWarpPoses.test.ts`.
 *
 * Отдельным файлом, потому что подготовка другая: альфа-канал самого рисунка
 * (`tests/pngAlpha.ts`) и сетка в раскладке Phaser, шесть вершин на клетку,
 * у каждой грани свои. Общая сетка 25×45, на которой это проверяли раньше,
 * граней не знала — а хозяин лапы или хвоста теперь назначается грани.
 *
 * Куски краски тест считает сам по альфе, не через `prepareWarp` и не по
 * карте из меты: карта сверяется с ними, а не с собой.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DINO_MESH } from '../src/art/dinoArtMeta';
import { prepareWarp } from '../src/art/dinoWarp';
import {
  COLS,
  FACE_COUNT,
  H,
  IMAGE,
  PAINT,
  ROWS,
  W,
  corners,
  phaserGrid,
  pixelsOf,
  plainGrid,
  toPx,
} from './dinoWarpKit';

/** Ниже живота на столько начинаются лапы (то же число держит tools/dino_owners.py). */
const BELLY_MARGIN = 7;

// --- куски краски, посчитанные тестом самим ------------------------------------

interface Piece {
  size: number;
  left: number;
  right: number;
}

/** Связные куски краски ниже живота: карта пикселей и сами куски крупнее 50 px. */
function findPieces(): { label: Int32Array; pieces: Piece[] } {
  const top = Math.floor(DINO_MESH.bellyY) + BELLY_MARGIN;
  const label = new Int32Array(W * H).fill(-1);
  const pieces: Piece[] = [];
  for (let y = top; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      if ((IMAGE.alpha[y * W + x] ?? 0) <= PAINT || label[y * W + x] !== -1) continue;
      const index = pieces.length;
      const piece: Piece = { size: 0, left: x, right: x };
      const stack = [[x, y]];
      label[y * W + x] = index;
      while (stack.length > 0) {
        const [cx = 0, cy = 0] = stack.pop() ?? [];
        piece.size += 1;
        piece.left = Math.min(piece.left, cx);
        piece.right = Math.max(piece.right, cx);
        for (const [nx = 0, ny = 0] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
          if (nx < 0 || nx >= W || ny < top || ny >= H) continue;
          if ((IMAGE.alpha[ny * W + nx] ?? 0) <= PAINT || label[ny * W + nx] !== -1) continue;
          label[ny * W + nx] = index;
          stack.push([nx, ny]);
        }
      }
      pieces.push(piece);
    }
  }
  return { label, pieces };
}

/** Для каждой грани: голоса за куски краски по пикселям внутри неё. */
function faceVotes(label: Int32Array): Map<number, number>[] {
  return Array.from({ length: FACE_COUNT }, (_, face) => {
    const tally = new Map<number, number>();
    for (const i of pixelsOf(face)) {
      const piece = label[i] ?? -1;
      if ((IMAGE.alpha[i] ?? 0) > PAINT && piece >= 0) tally.set(piece, (tally.get(piece) ?? 0) + 1);
    }
    return tally;
  });
}

const { label: LABEL, pieces: ALL_PIECES } = findPieces();
const BIG = ALL_PIECES.map((piece, index) => ({ piece, index })).filter(({ piece }) => piece.size > 50);
const TAIL_PIECE = BIG.reduce((best, item) => (item.piece.left < best.piece.left ? item : best)).index;
const FACES = faceVotes(LABEL);

/** Лапа для куска и места на нём: ось в пределах куска, из них — ближайшая в долях ширины. */
function legFor(piece: Piece, centreX: number): number {
  const legs = DINO_MESH.legs;
  const candidates = legs
    .map((leg, i) => ({ leg, i }))
    .filter(({ leg }) => leg.x >= piece.left - 5 && leg.x <= piece.right + 5);
  const best = candidates.reduce((a, b) => (Math.abs(centreX - a.leg.x) / a.leg.width <= Math.abs(centreX - b.leg.x) / b.leg.width ? a : b));
  return best.i;
}

/** Символ карты хозяев для грани по рисунку: `.`, `t` или номер лапы. */
function expectedSymbol(face: number): string {
  const votes = FACES[face] ?? new Map<number, number>();
  let best = -1;
  let count = 0;
  for (const [piece, n] of votes) {
    if (n > count && (ALL_PIECES[piece]?.size ?? 0) > 50) [best, count] = [piece, n];
  }
  if (best < 0) return '.';
  if (best === TAIL_PIECE) return 't';
  // Где ось ближе всего — по центру грани, а не клетки: вершины сдвинуты.
  const centre = corners(face).reduce((sum, p) => sum + p[0], 0) / 3;
  return String(legFor(ALL_PIECES[best], centre));
}

function ownerAt(face: number): string {
  const cell = Math.floor(face / 2);
  const row = Math.floor(cell / COLS) - DINO_MESH.faceOwnersRow;
  return DINO_MESH.faceOwners[row]?.charAt((cell % COLS) * 2 + (face % 2)) ?? '.';
}

describe('карта хозяев граней сверена с рисунком', () => {
  it('рисунок того же размера, что в мете, и сетка в мете той же ширины', () => {
    expect([IMAGE.width, IMAGE.height]).toEqual([W, H]);
    for (const row of DINO_MESH.faceOwners) expect(row).toHaveLength(COLS * 2);
    expect(DINO_MESH.faceOwnersRow + DINO_MESH.faceOwners.length).toBeLessThanOrEqual(ROWS);
  });

  it('в карте есть хвост и все четыре лапы, а над животом хозяев нет', () => {
    const all = DINO_MESH.faceOwners.join('');
    for (const symbol of ['t', '0', '1', '2', '3']) expect(all, `нет «${symbol}»`).toContain(symbol);
    expect(all.replace(/[.t0-3]/g, '')).toBe('');
    // Строки выше начала карты — выше живота: лапам и хвосту там делать нечего.
    expect((DINO_MESH.faceOwnersRow + 1) * (H / ROWS)).toBeGreaterThan(DINO_MESH.bellyY);
  });

  it('у каждой грани хозяин — тот кусок краски, которому принадлежит больше её краски', () => {
    // Куски краски: хвост — самый левый; лапы 1 и 2 на этом рисунке слиты
    // одним куском, и между ними решает ближайшая ось, как и должен инструмент.
    const wrong: string[] = [];
    for (let face = 0; face < FACE_COUNT; face += 1) {
      // Все грани, и выше начала карты тоже: там по рисунку должно быть `.`.
      const cell = Math.floor(face / 2);
      const expected = expectedSymbol(face);
      if (expected !== ownerAt(face)) {
        wrong.push(`грань ${face} (клетка ${cell % COLS},${Math.floor(cell / COLS)}): в карте «${ownerAt(face)}», по рисунку «${expected}»`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('верх спины в мете — верхняя краска на вертикали выхода хвоста', () => {
    const x = Math.floor(DINO_MESH.tailBaseX);
    let top = 0;
    while (top < H && (IMAGE.alpha[top * W + x] ?? 0) <= 128) top += 1;
    expect(top, 'на вертикали выхода хвоста нет краски').toBeLessThan(H);
    expect(DINO_MESH.croupTopY).toBeCloseTo(top, 0);
    expect(DINO_MESH.croupTopY).toBeLessThan(DINO_MESH.tailBaseY);
  });
});

describe('сетка в раскладке Phaser и хозяин грани', () => {
  const grid = phaserGrid();
  const plain = plainGrid();

  it('шесть вершин на клетку: грани a-b-d и b-c-d, грани — тройки подряд', () => {
    // Раскладку даёт настоящий GenerateGridVerts из Phaser, а не наша копия:
    // сменится Phaser — этот тест скажет, что `prepareWarp` читает грани не так.
    expect(plain).toHaveLength(COLS * ROWS * 6);
    const cell = (ix: number, iy: number): number[][] =>
      [0, 1, 2, 3, 4, 5].map((k) => toPx(plain[(iy * COLS + ix) * 6 + k] ?? { x: 0, y: 0 }));
    const [a, b, d, b2, c, d2] = cell(3, 7) as [number[], number[], number[], number[], number[], number[]];
    const x0 = (3 * W) / COLS;
    const y0 = (7 * H) / ROWS;
    const x1 = (4 * W) / COLS;
    const y1 = (8 * H) / ROWS;
    const close = (p: number[], x: number, y: number): boolean => Math.hypot((p[0] ?? 0) - x, (p[1] ?? 0) - y) < 1e-6;
    expect(close(a, x0, y0) && close(b, x0, y1) && close(d, x1, y0)).toBe(true);
    expect(close(b2, x0, y1) && close(c, x1, y1) && close(d2, x1, y0)).toBe(true);
  });

  it('сдвиг вершин в просвет несёт с собой UV: рисунок в покое тот же, что до сдвига', () => {
    // Вершина стоит там, где её текстурная точка: u·W и v·H — это её px рисунка.
    // Без UV сдвиг утащил бы кусок рисунка вместе с вершиной.
    let moved = 0;
    grid.forEach((vertex, i) => {
      const [px = 0, py = 0] = toPx(vertex);
      expect(Math.abs(vertex.u * W - px), `вершина ${i}, u`).toBeLessThan(1e-6);
      expect(Math.abs(vertex.v * H - py), `вершина ${i}, v`).toBeLessThan(1e-6);
      const [bx = 0, by = 0] = toPx(plain[i] ?? { x: 0, y: 0 });
      if (Math.hypot(px - bx, py - by) > 1e-6) moved += 1;
    });
    // Сдвинуты ровно вершины из меты и все копии каждой: у внутренней точки сетки
    // шесть вершин (клетка — a, b, d и b, c, d; точка бывает углом четырёх клеток:
    // 1 + 2 + 2 + 1), и все шесть стоят в одном месте — иначе на краске трещина.
    let copiesTotal = 0;
    for (const [ix, iy, dx, dy] of DINO_MESH.vertexShifts) {
      expect(Math.hypot(dx, dy), `сдвиг (${ix}, ${iy}) не дальше полутора клеток`).toBeLessThan(40);
      expect(ix > 0 && ix < COLS && iy > 0 && iy < ROWS, `точка (${ix}, ${iy}) внутри сетки`).toBe(true);
      const restX = (ix * W) / COLS;
      const restY = (iy * H) / ROWS;
      const copies = plain
        .map((vertex, i) => ({ i, at: toPx(vertex) }))
        .filter(({ at }) => Math.hypot(at[0] - restX, at[1] - restY) < 1e-6);
      expect(copies, `точка (${ix}, ${iy}): копий вершины`).toHaveLength(6);
      for (const { i } of copies) {
        const [px = 0, py = 0] = toPx(grid[i] ?? { x: 0, y: 0 });
        expect(Math.hypot(px - (restX + dx), py - (restY + dy)), `точка (${ix}, ${iy}), копия ${i}`).toBeLessThan(1e-6);
      }
      copiesTotal += copies.length;
    }
    expect(moved, 'сдвинуты все копии каждой точки из меты и больше ничьи').toBe(copiesTotal);
    expect(copiesTotal).toBe(DINO_MESH.vertexShifts.length * 6);
  });

  it('сборка диплодока сдвигает вершины вместе с UV до разбора сетки', () => {
    // Сцену целиком в node не запустить (конструктор с рисунком — в `tests/dinoPlane.test.ts`),
    // проводку createDinoPlane читаем в коде: сдвиг идёт в
    // createDinoPlane через `setUVs` (он же обновляет tu/tv, которые читает
    // рендерер) и раньше `prepareWarp`, иначе хозяева и покой считались бы по
    // несдвинутой сетке. Что картинка в покое осталась той же, держит e2e.
    const parts = readFileSync('src/entities/dinoParts.ts', 'utf8');
    const shift = parts.indexOf('shiftRestVertices(plane.vertices');
    expect(shift).toBeGreaterThan(0);
    expect(parts).toContain('vertex.setUVs(vertex.u + du * (u1 - u0), vertex.v + dv * (v1 - v0))');
    expect(parts.indexOf('prepareWarp(plane)')).toBeGreaterThan(shift);
  });

  it('на сетке диплодока никто не зовёт setTexture, setFrame и setSizeToFrame', () => {
    // Plane.setTexture/setFrame зовут setSizeToFrame(), а тот сбрасывает UV на
    // ровную сетку: вершины, сдвинутые в просвет, остаются на месте, и куски
    // рисунка съезжают вместе с ними до 16 px. Главная защита — сам `DinoPlane`,
    // его гоняет `tests/dinoPlane.test.ts` на настоящем Plane; это запасная
    // регулярка по тексту. Она не видит вызов на параметре колбэка
    // (`forEach((p) => { p.setTexture() })`): имя `p` не похоже на plane.
    const strip = (text: string): string => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const forbidden = (text: string): string[] =>
      strip(text)
        // Оператор кончается на `;`, `{` или `}`; условие `if (...)` перед ним не часть оператора.
        .split(/[;{}]/)
        .map((statement) => statement.replace(/^\s*(else\s+)?(if|while)\s*\([^)]*\)\s*/, ''))
        .filter((statement) => /\b(plane|DinoPlane|createDinoPlane)\b[^]*\.(setTexture|setFrame|setSizeToFrame)\b/i.test(statement))
        .map((statement) => statement.trim().slice(0, 80));
    // Сам поиск не пустой: простой вызов, цепочка и вызов через поле находятся, чужая картинка — нет.
    expect(forbidden("plane.setTexture('x');")).toHaveLength(1);
    expect(forbidden('this.plane?.setFrame(1).setAlpha(1);')).toHaveLength(1);
    expect(forbidden("createDinoPlane(scene).setPosition(1, 2).setSizeToFrame();")).toHaveLength(1);
    expect(forbidden("icon.setTexture('x');")).toHaveLength(0);
    // Условие про plane не делает оператор после него вызовом на plane (dinoRig.ts: `if (this.plane !== null) {\n this.eye.setFrame(...)`).
    expect(forbidden('if (this.plane !== null) {\n  this.eye.setFrame(1);\n}')).toHaveLength(0);
    expect(forbidden('if (this.plane !== null) this.eye.setFrame(1);')).toHaveLength(0);
    expect(forbidden('if (ok) {\n  this.plane?.setFrame(1);\n}')).toHaveLength(1);
    expect(forbidden('if (this.plane !== null) this.plane.setTexture(k);')).toHaveLength(1);
    expect(forbidden("// plane.setTexture('x')\n/* plane.setFrame(1) */ icon.setFrame(1);")).toHaveLength(0);
    const files = readdirSync('src/entities').filter((name) => name.endsWith('.ts'));
    expect(files).toContain('dinoParts.ts');
    for (const name of files) {
      expect(forbidden(readFileSync(`src/entities/${name}`, 'utf8')), `src/entities/${name}`).toEqual([]);
    }
  });

  it('все три вершины грани получают хозяина из карты: хвост — хвостом, лапа — своей лапой', () => {
    const bounds = prepareWarp({ vertices: grid });
    const wrong: string[] = [];
    for (let face = 0; face < COLS * ROWS * 2; face += 1) {
      const symbol = ownerAt(face);
      if (symbol === '.') continue;
      for (let k = 0; k < 3; k += 1) {
        const bound = bounds[face * 3 + k];
        const ok =
          symbol === 't' ? bound?.kind === 'tail' : bound?.kind === 'leg' && bound.leg === Number(symbol);
        if (!ok) wrong.push(`грань ${face}, вершина ${k}: ждали «${symbol}», а ${bound?.kind ?? 'тело'}`);
      }
    }
    expect(wrong.slice(0, 5)).toEqual([]);
  });

  it('вершины граней без хозяина: у крупа хвост кончается на линии сетки, под копытами — под лапой 1', () => {
    // Хозяин есть только у граней с краской ниже живота. У остальных вершины
    // делятся по положению, и эта граница видна лишь на соседних гранях: вершина
    // в трёх пикселях от выхода хвоста (x 186.7) — тело, ближайшая левее (x 160) —
    // хвост; ниже копыт хвост идёт под лапами 0 и 1 и кончается до лапы 2.
    const bounds = prepareWarp({ vertices: grid });
    const underLeg2 = (DINO_MESH.legs[2]?.x ?? 0) - (DINO_MESH.legs[2]?.width ?? 0) / 2;
    let croup = 0;
    let hoof = 0;
    for (let face = 0; face < COLS * ROWS * 2; face += 1) {
      if (ownerAt(face) !== '.') continue;
      for (let k = 0; k < 3; k += 1) {
        const [px = 0, py = 0] = toPx(grid[face * 3 + k] ?? { x: 0, y: 0 });
        const isTail = bounds[face * 3 + k]?.kind === 'tail';
        if (px < 200 && py > DINO_MESH.croupTopY + 10 && py < DINO_MESH.tailBaseY) {
          expect(isTail, `спина у крупа, вершина (${px.toFixed(1)}, ${py.toFixed(1)})`).toBe(px < DINO_MESH.tailBaseX - 5);
          croup += 1;
        }
        if (py > DINO_MESH.tailFloorY + 1) {
          expect(isTail, `под копытами, вершина (${px.toFixed(1)}, ${py.toFixed(1)})`).toBe(px < underLeg2);
          hoof += 1;
        }
      }
    }
    expect(croup).toBeGreaterThan(10);
    expect(hoof).toBeGreaterThan(30);
  });
});
