/**
 * Настоящий `DinoPlane` на настоящем Plane из Phaser, без браузера.
 *
 * Отдельный файл по причине подготовки: Phaser в node не грузится без `window`,
 * поэтому тут заглушки браузера и сцена-пустышка, которой хватает конструктору
 * Mesh. Рисовать ничего не надо — проверяется, что сдвинутые в просвет UV не
 * сбросить ни одним из методов Plane, перечисленных в таблице ниже (правило
 * «инвариант держится конструкцией»: читать код регуляркой в `dinoWarp.test.ts` —
 * запасной путь). Не закрыто и тут не проверяется: `clear()`, `addVertices` и
 * прямой `vertex.setUVs` у Mesh — они сидят в родительском классе и сетку
 * диплодока могут пересобрать или сдвинуть UV в обход переопределений.
 */
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import { MESH_COLS, MESH_ROWS, shiftRestVertices } from '../src/art/dinoWarp';

vi.mock('phaser', () => {
  const noop = (): void => undefined;
  const ctx = { fillRect: noop, drawImage: noop, putImageData: noop, fillText: noop, getImageData: () => ({ data: [0, 0, 0, 0] }), createImageData: () => ({ data: [] }), measureText: () => ({ width: 0 }) };
  const element = () => ({ getContext: () => ctx, style: {}, width: 1, height: 1, addEventListener: noop, toDataURL: () => '' });
  const g = globalThis as Record<string, unknown>;
  g.window = globalThis;
  g.document = { createElement: element, documentElement: { style: {} }, addEventListener: noop, body: {} };
  g.addEventListener = noop;
  g.HTMLCanvasElement = class {};
  g.Image = class {};
  g.Audio = class {};
  Object.defineProperty(globalThis, 'navigator', { value: { userAgent: 'node', platform: 'x', vendor: '', getGamepads: () => [] }, configurable: true });
  const Phaser = createRequire(import.meta.url)('phaser/dist/phaser.js') as unknown;
  return { default: Phaser };
});

const { DinoPlane } = await import('../src/entities/dinoParts');
const Phaser = (await import('phaser')).default;

/** Кадр и сцена-пустышка: ровно то, что читает конструктор Mesh/Plane. */
function fakeScene(): never {
  const noop = (): void => undefined;
  const emitter = { on: noop, off: noop, once: noop };
  const frame = { width: 560, height: 720, u0: 0, u1: 1, v0: 0, v1: 1, glTexture: {}, texture: { key: 'k' }, source: { glTexture: {} }, customPivot: false, pivotX: 0, pivotY: 0, name: '__BASE' };
  const texture = { get: () => frame, key: 'k' };
  // Шахматка Plane кладёт в менеджер новую текстуру и подменяет ею рисунок: у неё свой кадр.
  const boardFrame = { ...frame, width: 16, height: 16, name: '__BASE', texture: { key: 'board' } };
  const board = { get: () => boardFrame, key: 'board', destroy: noop };
  return {
    sys: {
      renderer: { width: 1280, height: 720, pipelines: { get: () => ({}), PIPELINE_CONST: {}, setPostPipeline: noop }, isBooted: true },
      textures: { getFrame: () => frame, get: (key: unknown) => (typeof key === 'object' ? key : texture), addUint8Array: () => board },
      queueDepthSort: noop,
      events: emitter,
      game: { config: {}, anims: emitter },
      anims: emitter,
    },
    events: emitter,
  } as never;
}

/** UV всех вершин одной строкой, и исходные (u, v), и те, что читает рендерер (tu, tv): сравнивать «до» и «после». */
const uvs = (plane: InstanceType<typeof DinoPlane>): string =>
  plane.vertices.map((v) => [v.u, v.v, v.tu, v.tv].map((n) => n.toFixed(6)).join(',')).join(' ');

function build(): InstanceType<typeof DinoPlane> {
  const plane = new DinoPlane(fakeScene(), 0, 0, 'k', undefined, MESH_COLS, MESH_ROWS);
  // Так сдвигает вершины сборка (`createDinoPlane`): UV уходят вместе с вершиной.
  const { u0, u1, v0, v1 } = plane.frame;
  shiftRestVertices(plane.vertices, (vertex, du, dv) => vertex.setUVs(vertex.u + du * (u1 - u0), vertex.v + dv * (v1 - v0)));
  return plane;
}

describe('DinoPlane: сдвинутые в просвет UV не сбросить', () => {
  it('сетка собирается как у Plane: 24×44 клетки, шесть вершин на клетку', () => {
    const plane = new DinoPlane(fakeScene(), 0, 0, 'k', undefined, MESH_COLS, MESH_ROWS);
    expect(plane.vertices).toHaveLength(MESH_COLS * MESH_ROWS * 6);
    expect(plane.gridWidth).toBe(MESH_COLS);
    expect(plane.gridHeight).toBe(MESH_ROWS);
  });

  it('сдвиги есть: после сборки UV не равны ровной сетке (иначе тест ниже ничего не доказывает)', () => {
    const fresh = new DinoPlane(fakeScene(), 0, 0, 'k', undefined, MESH_COLS, MESH_ROWS);
    expect(uvs(build())).not.toBe(uvs(fresh));
  });

  it.each([
    ['setFrame', (p: InstanceType<typeof DinoPlane>) => p.setFrame('k')],
    ['setTexture', (p: InstanceType<typeof DinoPlane>) => p.setTexture('k')],
    ['setSizeToFrame()', (p: InstanceType<typeof DinoPlane>) => p.setSizeToFrame()],
    ['setSizeToFrame(true)', (p: InstanceType<typeof DinoPlane>) => p.setSizeToFrame(true)],
    ['setGridSize', (p: InstanceType<typeof DinoPlane>) => p.setGridSize(4, 4)],
    ['uvScroll', (p: InstanceType<typeof DinoPlane>) => p.uvScroll(0.1, 0.1)],
    ['uvScale', (p: InstanceType<typeof DinoPlane>) => p.uvScale(2, 2)],
    ['createCheckerboard', (p: InstanceType<typeof DinoPlane>) => p.createCheckerboard()],
  ])('после %s сдвинутые UV на месте, сетка та же', (_name, act) => {
    const plane = build();
    const before = uvs(plane);
    const count = plane.vertices.length;
    const { key } = plane.texture;
    const frame = plane.frame;
    act(plane);
    expect(uvs(plane)).toBe(before);
    // Рисунок тот же: шахматка подменяет текстуру и кадр, а UV не трогает, поэтому одних UV мало.
    expect(plane.texture.key).toBe(key);
    expect(plane.frame).toBe(frame);
    expect(plane.vertices).toHaveLength(count);
    expect(plane.gridWidth).toBe(MESH_COLS);
    expect(plane.gridHeight).toBe(MESH_ROWS);
  });

  it.each([
    ['сразу после конструктора', (_p: { setFrame(f: string): unknown }) => undefined],
    ['после setFrame', (p: { setFrame(f: string): unknown }) => p.setFrame('k')],
  ])('перспектива такая же, как у родного Plane: %s', (_name, act) => {
    // Plane считает проекцию в setSizeToFrame (`setPerspective(width / frame.width, ...)`);
    // тело, которое не зовёт родной метод, оставило бы проекцию Mesh по умолчанию
    // (масштаб x 1.358 против 1.056), и диплодок на экране был бы растянут.
    const own = new DinoPlane(fakeScene(), 0, 0, 'k', undefined, MESH_COLS, MESH_ROWS);
    const native = new Phaser.GameObjects.Plane(fakeScene(), 0, 0, 'k', undefined, MESH_COLS, MESH_ROWS);
    act(own);
    act(native);
    expect(Array.from(own.projectionMatrix.val)).toEqual(Array.from(native.projectionMatrix.val));
    // Сверка не пустая: проекция Mesh по умолчанию (без setPerspective) другая.
    const idle = new Phaser.GameObjects.Mesh(fakeScene(), 0, 0, 'k');
    expect(Array.from(idle.projectionMatrix.val)).not.toEqual(Array.from(native.projectionMatrix.val));
  });
});
