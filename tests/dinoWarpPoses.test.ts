/**
 * Сетка диплодока в крайних позах: лапы, копыта, круп, хвост, шов, трещины.
 *
 * Позы — из `src/art/dinoPoses.ts`, те же числа, что в твинах; каждую тест
 * проходит кадрами по 1/60 с (`tests/dinoWarpKit.ts`) на сетке в раскладке
 * Phaser, какой её строит игра, со сдвигами вершин в просвет.
 *
 * Здесь же храповики на принятое: число и дата в комментарии, хуже — красный,
 * лучше — можно и нужно подтянуть потолок.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DINO_MESH } from '../src/art/dinoArtMeta';
import * as poses from '../src/art/dinoPoses';
import { applyWarp, prepareWarp } from '../src/art/dinoWarp';
import {
  ACTIONS,
  FACE_COUNT,
  H,
  REST_PX,
  W,
  dipAction,
  frames,
  jacobian,
  paintShare,
  phaserGrid,
  reachAction,
  toPx,
  type Action,
} from './dinoWarpKit';
import { BAD_FACES, BELLY_EDGES, NECK_CALM, NECK_PEAKS, SOUND, STILL, type Limits } from './dinoWarpCeilings';
import { FACE_ZONE, onPaintAt } from './dinoWarpZones';

const PAINT_SHARE = paintShare();

/**
 * Худшее по зоне, каждое своё: самое большое растяжение, самое малое сжатие и
 * самая малая площадь могут принадлежать разным граням, и если хранить одну
 * «худшую» грань, остальные два числа никто не проверяет.
 */
interface ZoneStat {
  s1: number;
  s2: number;
  det: number;
  s1At: string;
  s2At: string;
  detAt: string;
}

interface Run {
  action: Action;
  frameCount: number;
  /** Худшие s1, s2 и площадь по зоне за всё действие. */
  zones: Map<string, ZoneStat>;
  /** Кадров, где в зоне «плечо справа» грань хуже s1 > 2 или s2 < 0.5. */
  shoulderBad: number;
  /** Кадров, где в зоне грань вывернута или растянута больше ×2: зона → число кадров. */
  bad: Map<string, number>;
  /** Сумма «грань × кадр» с гранью хуже s1 > 2, s2 < 0.5 или вывернутой: зона → число. */
  badFaces: Map<string, number>;
  /** То же, но только вывернутые грани (площадь не больше нуля). */
  flipped: Map<string, number>;
  /** Расхождение экземпляров одной точки покоя на краске, px: точка → худшее за действие. */
  cracks: Map<string, number>;
  /** Расхождение двух граней вдоль общего ребра на краске, px: ребро → худшее за действие. */
  edgeCracks: Map<string, number>;
}

/** Точки покоя на краске (альфа > 40 в радиусе 2 px), где у граней разные экземпляры вершины. */
function crackPoints(): number[][] {
  const groups = new Map<string, number[]>();
  REST_PX.forEach(([x = 0, y = 0], i) => {
    const key = `${x.toFixed(2)},${y.toFixed(2)}`;
    groups.set(key, [...(groups.get(key) ?? []), i]);
  });
  const onPaint = (x: number, y: number): boolean => {
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        if (onPaintAt(Math.round(x) + dx, Math.round(y) + dy)) return true;
      }
    }
    return false;
  };
  return [...groups.values()].filter((g) => g.length > 1 && onPaint(...(REST_PX[g[0] ?? 0])));
}
const CRACK_POINTS = crackPoints();

interface SharedEdge {
  label: string;
  /** Вершины ребра в первой грани и во второй (вторая — в том же порядке концов). */
  a: [number, number];
  b: [number, number];
  /** Доли вдоль ребра, где в покое краска. */
  paint: number[];
}

/**
 * Рёбра, общие у двух граней, ниже линии крупа, с краской на них. Трещина
 * бывает не только в вершине: ребро между вершинами, стоящими в просвете,
 * может срезать угол лапы, и тогда две грани тянут краску в разные стороны.
 */
function sharedEdges(): SharedEdge[] {
  const key = (i: number): string => `${(REST_PX[i]?.[0] ?? 0).toFixed(2)},${(REST_PX[i]?.[1] ?? 0).toFixed(2)}`;
  const byKey = new Map<string, [number, number][]>();
  for (let face = 0; face < FACE_COUNT; face += 1) {
    for (let k = 0; k < 3; k += 1) {
      const i = face * 3 + k;
      const j = face * 3 + ((k + 1) % 3);
      const [p, q] = [key(i), key(j)].sort();
      byKey.set(`${p}|${q}`, [...(byKey.get(`${p}|${q}`) ?? []), [i, j]]);
    }
  }
  const out: SharedEdge[] = [];
  for (const pairs of byKey.values()) {
    if (pairs.length !== 2) continue;
    const [a, b0] = pairs as [[number, number], [number, number]];
    const b: [number, number] = key(b0[0]) === key(a[0]) ? b0 : [b0[1], b0[0]];
    const [p = [0, 0], q = [0, 0]] = [REST_PX[a[0]], REST_PX[a[1]]];
    if (Math.max(p[1] ?? 0, q[1] ?? 0) < 420) continue;
    const steps = Math.max(1, Math.round(Math.hypot((q[0] ?? 0) - (p[0] ?? 0), (q[1] ?? 0) - (p[1] ?? 0))));
    const paint: number[] = [];
    for (let s = 0; s <= steps; s += 1) {
      const t = s / steps;
      if (onPaintAt((p[0] ?? 0) + ((q[0] ?? 0) - (p[0] ?? 0)) * t, (p[1] ?? 0) + ((q[1] ?? 0) - (p[1] ?? 0)) * t)) paint.push(t);
    }
    if (paint.length === 0) continue;
    const ends = [p, q].map((e) => `${Math.round(e[0] ?? 0)},${Math.round(e[1] ?? 0)}`).sort();
    out.push({ label: ends.join('>'), a, b, paint });
  }
  return out;
}
const EDGES = sharedEdges();

const cache = new Map<string, Run>();

function run(action: Action): Run {
  const cached = cache.get(action.name);
  if (cached !== undefined) return cached;
  const bounds = prepareWarp({ vertices: phaserGrid() });
  const result: Run = {
    action,
    frameCount: 0,
    zones: new Map(),
    shoulderBad: 0,
    bad: new Map(),
    badFaces: new Map(),
    flipped: new Map(),
    cracks: new Map(),
    edgeCracks: new Map(),
  };
  for (const frame of frames(action)) {
    const mesh = { vertices: phaserGrid() };
    applyWarp(mesh, bounds, frame.head[0], frame.head[1], frame.legs, frame.lifts, frame.tail, frame.lag, frame.rootGain);
    const now = mesh.vertices.map(toPx);
    result.frameCount += 1;
    let shoulder = false;
    const badZones = new Set<string>();
    for (let face = 0; face < FACE_COUNT; face += 1) {
      if ((PAINT_SHARE[face] ?? 0) < 0.2) continue;
      const ids = [0, 1, 2].map((k) => face * 3 + k);
      const metric = jacobian(ids.map((i) => REST_PX[i] ?? [0, 0]), ids.map((i) => now[i] ?? [0, 0]));
      const zone = FACE_ZONE[face] ?? 'прочее';
      const at = `${action.name}, ${Math.round(frame.t)} мс, грань ${face}`;
      const known = result.zones.get(zone) ?? { s1: 0, s2: Infinity, det: Infinity, s1At: at, s2At: at, detAt: at };
      if (metric.s1 > known.s1) [known.s1, known.s1At] = [metric.s1, at];
      if (metric.s2 < known.s2) [known.s2, known.s2At] = [metric.s2, at];
      if (metric.det < known.det) [known.det, known.detAt] = [metric.det, at];
      result.zones.set(zone, known);
      const count = (map: Map<string, number>): void => void map.set(zone, (map.get(zone) ?? 0) + 1);
      if (metric.s1 > 2 || metric.s2 < 0.5 || metric.det <= 0) count(result.badFaces);
      if (metric.det <= 0) count(result.flipped);
      if (zone === 'плечо справа' && (metric.s1 > 2 || metric.s2 < 0.5 || metric.det <= 0)) shoulder = true;
      if (metric.s1 > 2 || metric.det <= 0) badZones.add(zone);
    }
    if (shoulder) result.shoulderBad += 1;
    for (const zone of badZones) result.bad.set(zone, (result.bad.get(zone) ?? 0) + 1);
    for (const group of CRACK_POINTS) {
      const [first = 0] = group;
      const base = now[first] ?? [0, 0];
      let spread = 0;
      for (const i of group) spread = Math.max(spread, Math.hypot((now[i]?.[0] ?? 0) - (base[0] ?? 0), (now[i]?.[1] ?? 0) - (base[1] ?? 0)));
      const key = (REST_PX[first] ?? [0, 0]).map(Math.round).join(',');
      result.cracks.set(key, Math.max(result.cracks.get(key) ?? 0, spread));
    }
    for (const edge of EDGES) {
      const [a0 = 0, a1 = 0] = edge.a;
      const [b0 = 0, b1 = 0] = edge.b;
      let spread = 0;
      for (const t of edge.paint) {
        const one = [0, 1].map((c) => (now[a0]?.[c] ?? 0) + ((now[a1]?.[c] ?? 0) - (now[a0]?.[c] ?? 0)) * t);
        const two = [0, 1].map((c) => (now[b0]?.[c] ?? 0) + ((now[b1]?.[c] ?? 0) - (now[b0]?.[c] ?? 0)) * t);
        spread = Math.max(spread, Math.hypot((one[0] ?? 0) - (two[0] ?? 0), (one[1] ?? 0) - (two[1] ?? 0)));
      }
      result.edgeCracks.set(edge.label, Math.max(result.edgeCracks.get(edge.label) ?? 0, spread));
    }
  }
  cache.set(action.name, result);
  return result;
}

const POSES: Action[] = [
  ...ACTIONS,
  dipAction('нырок ближе', 58, 40),
  dipAction('нырок дальше', 118, 0),
  dipAction('нырок высоко', 80, -100),
  reachAction('к кроне вверх', 46, -374),
  reachAction('к кроне вперёд', 135, -330),
];

/** Поза по имени: порядок в `ACTIONS` не должен решать, какую позу проверяет тест. */
function pose(name: string): Action {
  const found = POSES.find((action) => action.name === name);
  if (found === undefined) throw new Error(`позы «${name}» нет среди проверяемых`);
  return found;
}

/**
 * Зона во всех позах: ни одна грань не вывернута, ни одна не растянута больше
 * s1 и ни одна не сжата больше s2. Каждое число копится по зоне отдельно: у
 * самой растянутой грани сжатие может быть в порядке, а сжатая сильнее лежит
 * в другом месте. Пороги — из `SOUND` по позе; нет строки — поза обязана
 * оставить зону нетронутой.
 */
function expectSound(zone: string, actions: Action[]): void {
  let checked = 0;
  for (const action of actions) {
    const stat = run(action).zones.get(zone);
    if (stat === undefined) continue;
    const own: Limits = SOUND[zone]?.[action.name] ?? STILL;
    const text = `${zone}, ${action.name}: s1 ${stat.s1.toFixed(2)} (${stat.s1At}), s2 ${stat.s2.toFixed(2)} (${stat.s2At}), площадь ${stat.det.toFixed(2)} (${stat.detAt})`;
    expect(stat.det, text).toBeGreaterThan(0);
    expect(stat.s1, text).toBeLessThanOrEqual(own.s1);
    expect(stat.s2, text).toBeGreaterThanOrEqual(own.s2);
    checked += 1;
  }
  expect(checked, `${zone}: ни в одной позе не измерено`).toBe(actions.length);
}

describe('позы тестов — те же числа, что в твинах', () => {
  it('каждое число из src/art/dinoPoses.ts твины читают по имени поля, своей копии у них нет', () => {
    // Числа поз живут в одном месте: твины берут их оттуда, тест — оттуда же.
    // Поле, которое ни один твин не читает по имени, — число, ушедшее литералом
    // в твин: тест гонял бы одну позу, а ребёнок видел другую.
    const text = readFileSync('src/entities/Diplodocus.ts', 'utf8') + readFileSync('src/entities/dinoRig.ts', 'utf8');
    const lost: string[] = [];
    let fields = 0;
    for (const [name, pose] of Object.entries(poses)) {
      for (const field of Object.keys(pose)) {
        fields += 1;
        if (!new RegExp(`\\b${name}\\.${field}\\b`).test(text)) lost.push(`${name}.${field}`);
      }
    }
    expect(fields).toBeGreaterThan(50);
    expect(lost).toEqual([]);
    expect(Object.keys(poses).sort()).toEqual(['CHEW', 'DIG', 'DIP', 'JOY', 'PUSH', 'REACH', 'WALK']);
  });

  it('твины шага, радости, копания и толчка стоят на этих полях', () => {
    const dip = readFileSync('src/entities/Diplodocus.ts', 'utf8');
    const rig = readFileSync('src/entities/dinoRig.ts', 'utf8');
    expect(dip).toContain('angle: JOY.front,');
    expect(dip).toContain('angle: JOY.back,');
    expect(dip).toContain('x: this.restX + DIG.headDx,');
    expect(dip).toContain('y: JOY.jump,');
    expect(dip).toContain('angle: DIG.paw,');
    expect(rig).toContain('angle: { from: -WALK_SWING, to: WALK_SWING },');
    expect(rig).toContain('angle: CHEW.headAngle,');
  });
});

describe('лапы и копыта в шаге, радости, толчке и нырке', () => {
  it('лапы во всех позах не растягиваются и не сплющиваются: замер 1.00 и 1.00, предел ×1.01 и 0.99', () => {
    // Ниже живота на 34 px лапа качается целиком, и грань только поворачивается.
    // Прежний предел 1.5 и 0.6 пропускал растяжение, которого нет: LIFT_FADE 12 → 30
    // растягивал копыто в полтора раза. Строка у просвета между лапами — отдельная
    // зона, см. следующий кейс: сторож остаётся строгим на всей остальной лапе.
    expectSound('лапы', POSES);
    // Самый тяжёлый замер набора: один идёт 2,4 с, а в CI рядом с остальными файлами
    // перевалил за общие 5 с, и выкладка 1.2.0 упала, не дойдя до проверок (07.11).
  }, 30_000);

  it('лапа у просвета: первая строка граней, которую тянет LEG_GAP_FADE, — потолки по позам в SOUND', () => {
    // Вершины за полушириной лапы набирают поворот за 60 px (шов у брюха): грань с
    // такой вершиной растянута до 1.46 в радости, 1.28 на шаге (замер 06.11). Это
    // цена шва; всё, что на лапе не попало в строку, остаётся строгим.
    expectSound('лапа у просвета', POSES);
    const faces = FACE_ZONE.filter((zone) => zone === 'лапа у просвета').length;
    expect(faces, 'строка у просвета выделена: граней немного, но есть').toBeGreaterThan(3);
    expect(faces, 'строка у просвета — не вся лапа').toBeLessThan(40);
  });

  it('вершина за полушириной лапы набирает поворот за 60 px, на оси — за 34 (LEG_GAP_FADE)', () => {
    // Шов у брюха: две грани делят вершину в просвете, и у каждой своя лапа крутится
    // вокруг своего бедра. Чтобы копии не расходились, вершина у просвета встаёт на
    // место медленнее. Без этого правила числа в потолках у брюха выросли бы вдвое,
    // а замер не сказал бы почему.
    const leg = DINO_MESH.legs[1];
    expect(leg, 'в мете нет лапы 1').toBeDefined();
    const weightAt = (dx: number, below: number): number | undefined => {
      const y = DINO_MESH.bellyY + below;
      const mesh = { vertices: [{ x: ((leg?.x ?? 0) + dx - W / 2) / W, y: (H / 2 - y) / H }] };
      const bound = prepareWarp(mesh)[0];
      return bound?.kind === 'leg' ? bound.weight : undefined;
    };
    const width = leg?.width ?? 0;
    expect(weightAt(0, 17)).toBeCloseTo(0.5, 2);
    expect(weightAt(width * 0.3, 17)).toBeCloseTo(0.5, 2);
    expect(weightAt(width * 0.6, 17)).toBeCloseTo(17 / 60, 2);
    expect(weightAt(width * 0.6, 40)).toBeCloseTo(40 / 60, 2);
    expect(weightAt(0, 40)).toBe(1);
  });

  it('подъём копыта набирается круто: в 20 px под животом нога поднята целиком, у самого живота — нет', () => {
    // Нога на махе поднимается вся, а не телескопом: выше 12 px под животом подъём
    // уже полный. Растяжение и сжатие граней этого не видят (ниже 44 px под животом
    // вес и так единица), поэтому пробная вершина — прямо под бедром лапы 1.
    const leg = DINO_MESH.legs[1];
    expect(leg, 'в мете нет лапы 1').toBeDefined();
    const rise = (below: number): number => {
      const y = DINO_MESH.bellyY + below;
      const mesh = { vertices: [{ x: ((leg?.x ?? 0) - W / 2) / W, y: (H / 2 - y) / H }] };
      const bounds = prepareWarp(mesh);
      applyWarp(mesh, bounds, DINO_MESH.headRestX, DINO_MESH.headRestY, [0, 0, 0, 0], [0, 8, 0, 0], 0, 0);
      return y - (toPx(mesh.vertices[0] ?? { x: 0, y: 0 })[1] ?? 0);
    };
    expect(rise(0)).toBeCloseTo(0, 1);
    expect(rise(20)).toBeCloseTo(8, 1);
  });

  it('все позы обходят кадр за кадром: шаг идёт полным циклом, радость — до конца', () => {
    expect(run(pose('шаг')).frameCount).toBeGreaterThan(95);
    expect(run(pose('радость')).frameCount).toBeGreaterThan(50);
  });

  it('шов в развилке лап по позам: растяжение и сжатие считаются по всей зоне (храповик 06.11)', () => {
    // Развилка между лапами — тень под брюхом. Замер по всем граням зоны, а не по
    // одной «самой плохой»: растяжение шва до ×1.56 в радости (1.32 на шаге, 1.24 в
    // толчке, 1.18 в нырках, 1.68 на копании), сжатие 0.477 в радости и 0.51 на шаге
    // (до LEG_GAP_FADE было 1.70 и 0.415, 1.40 и 0.50). Пороги — в `SOUND` по позам: хуже
    // становиться нельзя, лучше — можно и нужно (LIFT_FADE 12 → 8 краснеет на шаге).
    expectSound('шов', POSES);
  });

  it('трещины по краске в вершинах: ни одной больше пикселя в любой позе', () => {
    // Экземпляры одной точки покоя на краске держатся вместе. До сдвига вершин
    // в просвет здесь стояли потолки до 85 px (хвост под копытом лапы 0, копыто
    // лапы 1, просвет между лапами 2 и 3): теперь они все нули. Ослаблять потолок
    // нельзя: разрыв хвоста посередине — это ровно такая трещина.
    let measured = 0;
    for (const action of POSES) {
      for (const [key, spread] of run(action).cracks) {
        measured += 1;
        expect(spread, `${action.name}: точка (${key}) разошлась на ${spread.toFixed(1)} px`).toBeLessThanOrEqual(1);
      }
    }
    expect(measured).toBeGreaterThan(CRACK_POINTS.length * POSES.length - 1);
  });

  it('трещины по краске вдоль рёбер: везде не больше пикселя, кроме двух рёбер у брюха — у каждой позы своё', () => {
    // Вершина в просвете ещё не значит, что ребро между вершинами краску не режет.
    // Ребро (347, 438) — (347, 461) между лапами 1 и 2 идёт через нижнюю обводку
    // живота, где поворот ног ещё набирает вес: 7.07 px рисунка в радости, 4.05 на
    // шаге, 3.04 в толчке, 2.28 в нырках (замер 06.11 после LEG_GAP_FADE; до него 12.44,
    // 7.13, 5.35 и 4.02). Рядом (266, 461) — (273, 438): 0.82 px в радости. На копании
    // лапа 2 крутится одна: 5.23 px у (347, 438) и 0.74 у ребра (427, 438) с лапой 3. Потолок один на все позы прятал бы ухудшение шага и нырка:
    // у каждой позы он свой, с запасом около процента.
    expect(EDGES.length).toBeGreaterThan(400);
    let worst = 0;
    for (const action of POSES) {
      const ceiling = BELLY_EDGES[action.name];
      expect(ceiling, `для позы «${action.name}» нет потолков у брюха`).toBeDefined();
      for (const [label, spread] of run(action).edgeCracks) {
        worst = Math.max(worst, spread);
        expect(spread, `${action.name}: ребро ${label} разошлось на ${spread.toFixed(2)} px`).toBeLessThanOrEqual(ceiling?.[label] ?? 1);
      }
    }
    expect(worst, 'рёбра у брюха измерены: потолок не пустой').toBeGreaterThan(6);
  });
});

describe('круп и хвост', () => {
  it('хвост ниже живота цел: в радости s1 ≤ 1.23, s2 ≥ 0.82 (замер 1.21 и 0.83), на шаге 1.08 и 0.92', () => {
    // Раньше хранилась одна «самая плохая» грань, и s2 хвоста смотрели только у неё
    // (0.89, а настоящий минимум по зоне — 0.83). Теперь s1, s2 и площадь копятся раздельно.
    expectSound('хвост', POSES);
  });

  it('круп: на радости хвост ±16° не ступенькой на спине: s1 ≤ 1.31, s2 ≥ 0.67 (замер 1.29 и 0.69)', () => {
    // Вершины хвоста высоко на спине, вращаясь вокруг точки основания, уезжали
    // от неподвижного тела рядом на 40 px: на крупе вставала ступенька. Пороги —
    // у самого замера: затухание хвоста ×1.3 или ось крупа на 40 px ниже уводят
    // зону за них (мутанты warp-tail-fade-wide и warp-croup-axis-low).
    expectSound('круп', POSES);
    expect(run(pose('радость')).zones.get('круп'), 'круп на радости не измерен: зона пустая').toBeDefined();
    expect(run(pose('шаг')).zones.get('хвост'), 'хвост на шаге не измерен: зона пустая').toBeDefined();
  });

  it('хвост качается вокруг оси на крупе по формуле: знак угла, затухание у основания, отставание кончика', () => {
    const bounds = prepareWarp({ vertices: phaserGrid() });
    const fade = Math.max(1, DINO_MESH.tailReach * 0.45);
    const tail = 14;
    const lag = -10;
    const mesh = { vertices: phaserGrid() };
    applyWarp(mesh, bounds, DINO_MESH.headRestX, DINO_MESH.headRestY, [0, 0, 0, 0], [0, 0, 0, 0], tail, lag);
    let checked = 0;
    let near = 0;
    let onCroup = 0;
    mesh.vertices.forEach((vertex, i) => {
      const bound = bounds[i];
      if (bound?.kind !== 'tail') return;
      const [rx = 0, ry = 0] = REST_PX[i] ?? [];
      // Независимая формула: ось — отрезок на вертикали выхода хвоста, от верха спины до его основания.
      const pivotY = Math.min(DINO_MESH.tailBaseY, Math.max(DINO_MESH.croupTopY, ry));
      const weight = Math.min(1, Math.hypot(rx - DINO_MESH.tailBaseX, ry - pivotY) / fade);
      const angle = ((tail + (lag - tail) * weight) * weight * Math.PI) / 180;
      const dx = rx - DINO_MESH.tailBaseX;
      const dy = ry - pivotY;
      const wantX = DINO_MESH.tailBaseX + dx * Math.cos(angle) - dy * Math.sin(angle);
      const wantY = pivotY + dx * Math.sin(angle) + dy * Math.cos(angle);
      const [gotX = 0, gotY = 0] = toPx(vertex);
      expect(Math.hypot(gotX - wantX, gotY - wantY), `вершина ${i} в (${rx.toFixed(0)}, ${ry.toFixed(0)})`).toBeLessThan(0.01);
      checked += 1;
      if (weight < 1 && weight > 0.2) near += 1;
      if (ry < DINO_MESH.tailBaseY - 20 && ry > DINO_MESH.croupTopY) onCroup += 1;
    });
    // Тест не пустой: есть вершины и у основания, где вес меньше единицы, и на самом крупе.
    expect(checked).toBeGreaterThan(200);
    expect(near).toBeGreaterThan(10);
    expect(onCroup).toBeGreaterThan(10);
  });
});

describe('принятое в шее: потолки, ниже которых оно не должно стать хуже (храповик 06.11)', () => {
  it('шея на шаге и в радости цела: ни одна грань не вывернута, растяжение и сжатие не хуже замера', () => {
    // Здесь голова только покачивается, и шея ещё держит форму: подбородок на радости
    // ×1.81, плечо ×1.86, шея за плечом ×1.86. Раньше был один потолок ×2.0 на
    // подбородок и ничего на плечо и шею; теперь каждая зона на каждой из двух поз.
    // Идём по таблице и ищем позу по имени: переставленная или переименованная
    // поза не должна превращать проход в пустой.
    expect(Object.keys(NECK_CALM).sort(), 'в таблице шаг и радость').toEqual(['радость', 'шаг']);
    for (const [name, zones] of Object.entries(NECK_CALM)) {
      expect(Object.keys(zones).sort(), `в позе «${name}» четыре зоны шеи и груди`).toEqual(['грудь', 'плечо справа', 'под челюстью', 'прочее']);
      const action = pose(name);
      for (const [zone, own] of Object.entries(zones)) {
        const stat = run(action).zones.get(zone);
        expect(stat, `${zone} в позе «${name}» не измерено`).toBeDefined();
        const text = `${zone}, ${name}: s1 ${stat?.s1.toFixed(2)} (${stat?.s1At}), s2 ${stat?.s2.toFixed(2)} (${stat?.s2At})`;
        expect(stat?.det ?? -1, text).toBeGreaterThan(0);
        expect(stat?.s1 ?? 99, text).toBeLessThanOrEqual(own.s1);
        expect(stat?.s2 ?? -1, text).toBeGreaterThanOrEqual(own.s2);
      }
    }
  });

  it('шея в крайних позах: растяжение, площадь и сжатие по зоне не хуже замера (храповик 06.11)', () => {
    // Счёт «грань × кадр» не видит, как уже плохая грань стала хуже: растяжение
    // ×7 может стать ×14 при том же числе плохих граней. Поэтому на каждую из
    // трёх зон шеи в каждой крайней позе есть потолок s1 и пол площади (он ниже
    // нуля там, где замер уже вывернут: хуже — ещё глубже).
    const extreme = POSES.map((action) => action.name).filter((name) => !(name in NECK_CALM));
    expect(Object.keys(NECK_PEAKS).sort(), 'в таблице все крайние позы').toEqual([...extreme].sort());
    expect(extreme.length, 'крайних поз семь').toBe(7);
    for (const [name, zones] of Object.entries(NECK_PEAKS)) {
      expect(Object.keys(zones).sort(), `в позе «${name}» четыре зоны шеи и груди`).toEqual(['грудь', 'плечо справа', 'под челюстью', 'прочее']);
      const action = pose(name);
      for (const [zone, peak] of Object.entries(zones)) {
        const stat = run(action).zones.get(zone);
        expect(stat, `${zone} в позе «${name}» не измерено`).toBeDefined();
        const text = `${zone}, ${name}: s1 ${stat?.s1.toFixed(2)} (${stat?.s1At}), площадь ${stat?.det.toFixed(2)} (${stat?.detAt})`;
        expect(stat?.s1 ?? 99, text).toBeLessThanOrEqual(peak.s1);
        expect(stat?.det ?? -99, text).toBeGreaterThanOrEqual(peak.det);
        // Площадь и s1 берутся у разных граней: игла s1 5 / s2 0.2 проходит обе проверки.
        // Сжатие держит пол s2; где зона вывернута, пола нет — но зона обязана остаться
        // вывернутой (по знаку площади, как счёт вывернутых), иначе таблица молчит о
        // зоне, которая выправилась. s2 тут не годится: у нуля он лишь в одном кадре.
        if (peak.s2 === undefined) expect(stat?.det ?? 99, `${text}: пола s2 нет, а зона уже не вывернута`).toBeLessThan(0);
        else expect(stat?.s2 ?? -1, `${text}, s2 ${stat?.s2.toFixed(3)}`).toBeGreaterThanOrEqual(peak.s2);
      }
    }
  });

  it('граней×кадров с s1 > 2, s2 < 0.5 или вывернутой не больше нынешнего (и вывернутых отдельно)', () => {
    // Счёт «кадров, где есть хоть одна плохая грань» в крайних позах уже упёрся в
    // потолок (88 из 102, 95 из 102, 67–71 из 73): шея стала хуже вдвое, а число то
    // же. Сумма по граням растёт вместе с поломкой; вывернутые — самый заметный
    // глазу дефект — считаются отдельно. Сжатие s2 < 0.5 тоже плохо: под челюстью
    // на копании s2 0.33. Замер 06.11, этап 2 подтянет числа вниз.
    let measured = 0;
    for (const action of POSES) {
      const want = BAD_FACES[action.name];
      expect(want, `для позы «${action.name}» нет счёта`).toBeDefined();
      for (const zone of ['шов', 'плечо справа', 'грудь', 'прочее', 'под челюстью']) {
        const [bad, flipped] = want?.[zone] ?? [0, 0];
        const got = run(action);
        const text = `${action.name}, ${zone}`;
        expect(got.badFaces.get(zone) ?? 0, `${text}: плохих граней×кадров`).toBeLessThanOrEqual(bad);
        expect(got.flipped.get(zone) ?? 0, `${text}: вывернутых граней×кадров`).toBeLessThanOrEqual(flipped);
        measured += got.badFaces.get(zone) ?? 0;
      }
    }
    expect(measured, 'счёт не пустой').toBeGreaterThan(10000);
  });

  it('плечо справа: кадров с гранью хуже s1 > 2 или s2 < 0.5 не больше нынешнего', () => {
    // Здесь шея ещё складывается пеньком (И13-2, этап 2: другая модель шеи).
    // Числа — потолок на 06.11, из кадров по 1/60 с; этап 2 их ужесточит.
    const ceiling: Record<string, number> = {
      копание: 18,
      толчок: 43,
      'нырок ближе': 67,
      'нырок дальше': 71,
      'нырок высоко': 69,
      'к кроне вверх': 88,
      'к кроне вперёд': 95,
      шаг: 0,
      радость: 0,
    };
    for (const action of POSES) {
      const bad = run(action).shoulderBad;
      expect(bad, `${action.name}: плохих кадров у плеча ${bad}, потолок ${ceiling[action.name] ?? 0}`).toBeLessThanOrEqual(ceiling[action.name] ?? 0);
    }
  });

  it('шея, грудь и подбородок: кадров с вывернутой или растянутой больше ×2 гранью не больше нынешнего', () => {
    // Зона «прочее» — шея от плеча до затылка (x 453..545, y 108..215) и то, что не
    // вошло в другие зоны; «грудь» — тело, что поворачивается с основанием шеи (И13-3),
    // его раньше считали шеей; «под челюстью» — тень под подбородком. Числа — замер
    // 07.11 из кадров по 1/60 с (прежний счёт шеи с грудью на 06.11: 39 / 58 / 67 / 63).
    const behind: Record<string, number> = {
      копание: 10,
      толчок: 30,
      'нырок ближе': 56,
      'нырок дальше': 49,
      'нырок высоко': 13,
      'к кроне вверх': 88,
      'к кроне вперёд': 86,
    };
    const chest: Record<string, number> = {
      копание: 14,
      толчок: 29,
      'нырок ближе': 52,
      'нырок дальше': 57,
      'нырок высоко': 40,
      'к кроне вверх': 88,
      'к кроне вперёд': 92,
    };
    const chin: Record<string, number> = {
      копание: 7,
      толчок: 25,
      'нырок ближе': 44,
      'нырок дальше': 49,
      'нырок высоко': 11,
      'к кроне вверх': 88,
      'к кроне вперёд': 86,
    };
    for (const action of POSES) {
      const bad = run(action).bad;
      expect(bad.get('прочее') ?? 0, `${action.name}: плохих кадров на шее ${bad.get('прочее') ?? 0}`).toBeLessThanOrEqual(behind[action.name] ?? 0);
      expect(bad.get('грудь') ?? 0, `${action.name}: плохих кадров на груди ${bad.get('грудь') ?? 0}`).toBeLessThanOrEqual(chest[action.name] ?? 0);
      expect(bad.get('под челюстью') ?? 0, `${action.name}: плохих кадров под подбородком ${bad.get('под челюстью') ?? 0}`).toBeLessThanOrEqual(chin[action.name] ?? 0);
    }
  });
});
