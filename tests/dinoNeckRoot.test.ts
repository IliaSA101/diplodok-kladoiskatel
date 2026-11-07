/**
 * Основание шеи (И13-3): тело у плеча поворачивается вместе с шеей на толчке и
 * нырках. Отдельный файл: счёт граней по позам живёт в `dinoWarpPoses.test.ts`
 * и упёрся в шестьсот строк; здесь — числа самого поворота, возврат в покой,
 * позы, где поворота быть не должно, и проводка веса копания.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROOT_FAR, ROOT_MAX, ROOT_NEAR, ROOT_START, rootAngle, rootBound } from '../src/art/dinoNeckRoot';
import { applyWarp, prepareWarp } from '../src/art/dinoWarp';
import { ACTIONS, dipAction, frames, phaserGrid, reachAction, type Action } from './dinoWarpKit';
import { REST_BOUNDS } from './dinoWarpZones';

const deg = (value: number): number => (value * Math.PI) / 180;
const POSES: Action[] = [
  ...ACTIONS,
  dipAction('нырок ближе', 58, 40),
  dipAction('нырок дальше', 118, 0),
  dipAction('нырок высоко', 80, -100),
  reachAction('к кроне вверх', 46, -374),
  reachAction('к кроне вперёд', 135, -330),
];
const pose = (name: string): Action => POSES.find((a) => a.name === name) ?? ACTIONS[0];
const REST = phaserGrid();
const ROOT_IDS = REST_BOUNDS.flatMap((bound, i) => (bound?.kind === 'root' ? [i] : []));

describe('поворот основания шеи: числа', () => {
  it('хорда не ушла дальше 30° — поворота нет; дальше — растёт в сторону хорды и не выше потолка', () => {
    expect(rootAngle(deg(30), deg(40), 1).phi).toBe(0);
    expect(rootAngle(deg(-20), deg(-25), 1).phi).toBe(0);
    let last = 0;
    for (let a = 31; a <= 170; a += 1) {
      const { phi } = rootAngle(deg(a), deg(a + 20), 1);
      expect(phi, `хорда ${a}°`).toBeGreaterThanOrEqual(last - 1e-9);
      expect(phi).toBeLessThanOrEqual(ROOT_MAX + 1e-9);
      last = phi;
    }
    expect(rootAngle(deg(90), deg(100), 1).phi).toBeGreaterThan(deg(30));
    expect(rootAngle(deg(-90), deg(-100), 1).phi).toBe(-rootAngle(deg(90), deg(100), 1).phi);
    expect(ROOT_START).toBeCloseTo(deg(30), 10);
  });

  it('вес 0 выключает поворот, дробный вес включает его плавно', () => {
    expect(rootAngle(deg(90), deg(100), 0).phi).toBe(0);
    const half = rootAngle(deg(90), deg(100), 0.5).phi;
    expect(half).toBeGreaterThan(0);
    expect(half).toBeLessThan(rootAngle(deg(90), deg(100), 1).phi);
  });

  it('вершина тела: вес 1 у плеча, спад к нулю на ROOT_FAR, дальше поворота нет', () => {
    const shoulder = { x: 500, y: 200 };
    const at = (distance: number) => rootBound(shoulder.x + distance, shoulder.y, shoulder, { x: 0, y: 0 });
    expect(at(ROOT_NEAR - 1)?.weight).toBe(1);
    const mid = at((ROOT_NEAR + ROOT_FAR) / 2)?.weight ?? -1;
    expect(mid).toBeGreaterThan(0.4);
    expect(mid).toBeLessThan(0.6);
    expect(at(ROOT_FAR)).toBeNull();
    expect(ROOT_IDS.length, 'у плеча есть вершины тела').toBeGreaterThan(300);
  });
});

describe('где поворота быть не должно — вершины как до правки, бит в бит', () => {
  for (const name of ['шаг', 'радость', 'копание', 'к кроне вверх', 'к кроне вперёд']) {
    it(`${name}: тело у плеча стоит на месте Phaser, остальное не зависит от веса основания`, () => {
      const action = pose(name);
      const bounds = prepareWarp({ vertices: phaserGrid() });
      let compared = 0;
      for (const f of frames(action)) {
        const one = { vertices: phaserGrid() };
        const off = { vertices: phaserGrid() };
        applyWarp(one, bounds, f.head[0], f.head[1], f.legs, f.lifts, f.tail, f.lag, f.rootGain);
        applyWarp(off, bounds, f.head[0], f.head[1], f.legs, f.lifts, f.tail, f.lag, 0);
        for (const i of ROOT_IDS) expect([one.vertices[i]?.x, one.vertices[i]?.y], `${name} ${Math.round(f.t)} мс, вершина ${i}`).toEqual([REST[i]?.x, REST[i]?.y]);
        expect(one.vertices.map((v) => [v.x, v.y])).toEqual(off.vertices.map((v) => [v.x, v.y]));
        compared += 1;
      }
      expect(compared).toBeGreaterThan(25);
    });
  }

  it('копание с весом 1 основание поворачивает бы, с весом 0 — нет (вес решает, а не поза)', () => {
    const bounds = prepareWarp({ vertices: phaserGrid() });
    const moved = (gain: number): number => {
      let worst = 0;
      for (const f of frames(pose('копание'))) {
        const mesh = { vertices: phaserGrid() };
        applyWarp(mesh, bounds, f.head[0], f.head[1], f.legs, f.lifts, f.tail, f.lag, gain);
        for (const i of ROOT_IDS) worst = Math.max(worst, Math.hypot(((mesh.vertices[i]?.x ?? 0) - (REST[i]?.x ?? 0)) * 640, ((mesh.vertices[i]?.y ?? 0) - (REST[i]?.y ?? 0)) * 597));
      }
      return worst;
    };
    expect(moved(0)).toBe(0);
    expect(moved(1)).toBeGreaterThan(5);
  });
});

describe('поворот на толчке и нырках', () => {
  it('на нырке тело у плеча поворачивается, а голова не уходит вверх ногами (поворот ≤ 125°)', () => {
    const bounds = prepareWarp({ vertices: phaserGrid() });
    for (const name of ['толчок', 'нырок ближе', 'нырок дальше', 'нырок высоко']) {
      let worstMove = 0;
      let worstTurn = 0;
      for (const f of frames(pose(name))) {
        const mesh = { vertices: phaserGrid() };
        const turn = applyWarp(mesh, bounds, f.head[0], f.head[1], f.legs, f.lifts, f.tail, f.lag, f.rootGain);
        worstTurn = Math.max(worstTurn, (Math.abs(turn) * 180) / Math.PI);
        for (const i of ROOT_IDS) worstMove = Math.max(worstMove, Math.hypot(((mesh.vertices[i]?.x ?? 0) - (REST[i]?.x ?? 0)) * 640, ((mesh.vertices[i]?.y ?? 0) - (REST[i]?.y ?? 0)) * 597));
      }
      expect(worstMove, `${name}: тело у плеча не повернулось`).toBeGreaterThan(20);
      expect(worstTurn, `${name}: голова повёрнута на ${worstTurn.toFixed(0)}°`).toBeLessThan(125);
    }
  });

  it('две позы подряд на одной сетке: после толчка покой возвращает тело точно (сетка в игре одна на все кадры)', () => {
    const mesh = { vertices: phaserGrid() };
    const bounds = prepareWarp(mesh);
    const push = frames(pose('толчок')).find((f) => f.head[1] > 100) ?? frames(pose('толчок'))[10];
    applyWarp(mesh, bounds, push.head[0], push.head[1], push.legs, push.lifts, push.tail, push.lag, 1);
    const bent = ROOT_IDS.filter((i) => mesh.vertices[i]?.x !== REST[i]?.x || mesh.vertices[i]?.y !== REST[i]?.y).length;
    expect(bent, 'толчок поворачивает тело у плеча').toBeGreaterThan(100);
    const still = frames(pose('шаг'))[0];
    applyWarp(mesh, bounds, still.head[0], still.head[1], [0, 0, 0, 0], [0, 0, 0, 0], 0, 0, 1);
    for (const i of ROOT_IDS) expect([mesh.vertices[i]?.x, mesh.vertices[i]?.y], `вершина ${i}`).toEqual([REST[i]?.x, REST[i]?.y]);
  });
});

describe('вес основания: проводка от копания до сетки', () => {
  it('копание в тесте идёт с весом 0, остальные позы — с 1', () => {
    for (const action of POSES) {
      for (const f of frames(action)) expect(f.rootGain, action.name).toBe(action.name === 'копание' ? 0 : 1);
    }
  });

  it('риг отдаёт вес сетке, взмах копания его гасит, любое другое действие и конец копания возвращают', () => {
    const rig = readFileSync('src/entities/dinoRig.ts', 'utf8');
    expect(rig).toContain('protected neckRootGain = 1;');
    expect(rig).toMatch(/this\.rememberTail\(this\.tailImg\.angle\),\s+this\.neckRootGain,\s+\);/);
    const dip = readFileSync('src/entities/Diplodocus.ts', 'utf8');
    const begin = dip.slice(dip.indexOf('private beginAction(): void'), dip.indexOf('/** Завершить занимающую'));
    expect(begin).toContain('this.neckRootGain = 1;');
    const end = dip.slice(dip.indexOf('private endActionAfter'), dip.indexOf('private showHappyEyes'));
    expect(end).toContain('this.neckRootGain = 1;');
    const stroke = dip.slice(dip.indexOf('playDigStroke(): void'), dip.indexOf('reachToCrown'));
    expect(stroke.indexOf('this.beginAction();')).toBeGreaterThan(0);
    expect(stroke.indexOf('this.neckRootGain = 0;')).toBeGreaterThan(stroke.indexOf('this.beginAction();'));
  });

  it('голова копания возвращается в покой явным твином, а не yoyo в точку нажатия (быстрые нажатия не рвут холку)', () => {
    const dip = readFileSync('src/entities/Diplodocus.ts', 'utf8');
    const stroke = dip.slice(dip.indexOf('playDigStroke(): void'), dip.indexOf('reachToCrown'));
    const head = stroke.slice(stroke.indexOf('targets: this.headWrap'), stroke.indexOf('// Передняя ближняя лапа'));
    expect(head).not.toContain('yoyo');
    expect(head).toMatch(/x: this\.restX,\s+y: this\.restY,\s+angle: 0,/);
  });
});
