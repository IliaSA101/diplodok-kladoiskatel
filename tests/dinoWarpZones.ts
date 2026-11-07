/**
 * Разметка граней сетки по зонам: чья грань (по центру в покое) и где на ней
 * краска. Вынесена из `dinoWarpPoses.test.ts` на пороге в шестьсот строк, чтобы
 * зоны можно было делить дальше (шея за плечом → шея и грудь), не трогая счёт поз.
 * Грудь — тело под шеей: она поворачивается вместе с основанием шеи, и ей нужны
 * свои потолки, чтобы сжатие в изгибе не пряталось за потолками шеи.
 */
import { prepareWarp } from '../src/art/dinoWarp';
import { FACE_COUNT, H, IMAGE, PAINT, REST_PX, W, phaserGrid } from './dinoWarpKit';

/** Зона грани по её центру в покое, px рисунка. */
export function zoneOf(cx: number, cy: number, onRoot = false): string {
  if (cx < 200 && cy >= 240 && cy < 434) return 'круп';
  if (cy >= 434 && cy < 482 && cx >= 180 && cx < 510) return 'шов';
  if (cx < 180 && cy >= 434) return 'хвост';
  if (cy >= 482) return 'лапы';
  if (cy >= 195 && cy < 245 && cx >= 508 && cx < 600) return 'плечо справа';
  if (cy >= 40 && cy < 140 && cx >= 520) return 'под челюстью';
  // Грудь и холка: тело, которое поворачивается вместе с основанием шеи (И13-3).
  if (onRoot) return 'грудь';
  return 'прочее';
}

export const REST_BOUNDS = prepareWarp({ vertices: phaserGrid() });

/**
 * Грань лапы, которую правило LEG_GAP_FADE тянет намеренно: у неё есть вершина за
 * полушириной лапы (`gap`, то же правило, что в `legBound`), которая ещё не набрала
 * полный поворот. Ниже, где вес уже единица, лапа жёсткая и сторож у неё строгий.
 */
export function pullsAtGap(face: number): boolean {
  return [0, 1, 2].some((k) => {
    const bound = REST_BOUNDS[face * 3 + k];
    return bound?.kind === 'leg' && bound.gap && bound.weight < 1;
  });
}

/**
 * Грань, у которой хоть одна вершина — тело у плеча (`root`). Правило из
 * `rootBound`, а не список: сдвинется радиус поворота — сдвинется и зона.
 */
export function turnsWithRoot(face: number): boolean {
  return [0, 1, 2].some((k) => REST_BOUNDS[face * 3 + k]?.kind === 'root');
}

export const FACE_ZONE = Array.from({ length: FACE_COUNT }, (_, face) => {
  const points = [0, 1, 2].map((k) => REST_PX[face * 3 + k] ?? [0, 0]);
  const zone = zoneOf(
    points.reduce((s, p) => s + (p[0] ?? 0), 0) / 3,
    points.reduce((s, p) => s + (p[1] ?? 0), 0) / 3,
    turnsWithRoot(face),
  );
  return zone === 'лапы' && pullsAtGap(face) ? 'лапа у просвета' : zone;
});

export const onPaintAt = (x: number, y: number): boolean => {
  const px = Math.floor(x);
  const py = Math.floor(y);
  return px >= 0 && py >= 0 && px < W && py < H && (IMAGE.alpha[py * W + px] ?? 0) > PAINT;
};
