/**
 * Глаз рисованного диплодока и его голова на сетке (баг И13-1).
 *
 * Глаз — отдельная картинка в `headWrap`, голова — вершины сетки `Plane`. Phaser
 * переводит вершины в экранные в `preUpdate`, а он идёт раньше, чем сцена зовёт
 * `dino.update` и шея гнётся: пока `redrawNeck` не пересчитывал сетку сам
 * (`DinoPlane.refresh`), на экран уходила голова прошлого кадра, и глаз
 * обгонял её на шаг. Чистая логика этого не видит — вершины считает Phaser.
 *
 * Поза выставляется руками (твины убраны), кадр шагается вручную, как в обходе
 * `?shots`, и на `postrender` сравнивается то, что ушло на экран: сдвиг картинки
 * глаза от покоя и сдвиг отрисованной точки сетки у глаза (`vx`/`vy` после
 * `preUpdate`). Углы поворота `headWrap` берутся те же, что в твинах.
 * Проверено поломкой: без `plane.refresh()` в `redrawNeck` краснеет вся тройка,
 * с `headTurn.setRotation(turn)` вместо `dinoEyeTurn` — радость и копание.
 */
import { expect, test } from '@playwright/test';
import { DINO_MESH } from '../src/art/dinoArtMeta';
import { CHEW, DIG, JOY } from '../src/art/dinoPoses';
import { openGame, waitScene } from './game';

/** Сколько px экрана допускается между двумя сдвигами: глаз крупнее десяти. */
const TOLERANCE = 2;

/** Позы `headWrap` из твинов Diplodocus: место (в риге) и угол в градусах. */
const POSES = [
  { name: 'пик радости', x: DINO_MESH.headRestX + JOY.headDx, y: DINO_MESH.headRestY + JOY.headDy, angle: JOY.headAngle },
  { name: 'копание', x: DINO_MESH.headRestX + DIG.headDx, y: DIG.headY, angle: DIG.headAngle },
  { name: 'жевание', x: DINO_MESH.headRestX, y: DINO_MESH.headRestY, angle: CHEW.headAngle },
];

interface Sample {
  name: string;
  /** Накладка глаза: на сколько сдвинулась от покоя, px экрана. */
  overlay: [number, number];
  /** Точка сетки у глаза, какой она ушла на экран: тоже от покоя. */
  drawn: [number, number];
  gap: number;
}

test('глаз лежит на сетке в тот же кадр, что и сдвинулась голова', async ({ page }) => {
  await openGame(page);
  // Рисунок диплодока грузится в BootScene: без него сетки нет вовсе.
  await waitScene(page, 'Start');

  const result = await page.evaluate(
    ({ poses, mesh }) => {
      const game = window.game;
      if (game === undefined) throw new Error('нет window.game');
      const FRAME = 1000 / 60;
      let clock = game.loop.time;
      const step = (): void => {
        clock += FRAME;
        game.step(clock, FRAME);
      };
      // Кадры шагаем сами: настоящий rAF не успел бы встать между позой и снимком.
      game.loop.sleep();
      for (const s of game.scene.getScenes(true)) game.scene.stop(s.scene.key);
      step();
      game.scene.start('Victory', { level: 8, itemIds: ['coin'], crownItemId: 'crown' });
      for (let i = 0; i < 40; i += 1) step();

      interface Vert {
        u: number;
        v: number;
        vx: number;
        vy: number;
      }
      interface Wrap {
        x: number;
        y: number;
        setPosition(x: number, y: number): Wrap;
        setAngle(a: number): Wrap;
      }
      interface Dino {
        headWrap: Wrap;
        eyeOpen: { getWorldTransformMatrix(): { tx: number; ty: number } };
        plane: {
          frame: { u0: number; v0: number; u1: number; v1: number };
          faces: { vertex1: Vert; vertex2: Vert; vertex3: Vert }[];
          getWorldTransformMatrix(): {
            transformPoint(x: number, y: number): { x: number; y: number };
          };
        };
      }
      const scene = game.scene.getScene('Victory') as unknown as {
        dino: Dino;
        time: { removeAllEvents(): void };
        tweens: { killTweensOf(t: object): void };
      };
      const dino = scene.dino;
      // Твины и таймеры радости не мешают: позой управляем мы.
      scene.time.removeAllEvents();
      scene.tweens.killTweensOf(dino.headWrap);

      // Грань, на которую приходится глаз рисунка, и веса его вершин. Положение
      // глаза на рисунке и UV вершин не меняются, сколько бы сетку ни гнуло.
      const f = dino.plane.frame;
      const eu = f.u0 + (f.u1 - f.u0) * (mesh.eyeX / mesh.imageWidth);
      const ev = f.v0 + (f.v1 - f.v0) * (mesh.eyeY / mesh.imageHeight);
      let hit: { verts: Vert[]; w: number[] } | null = null;
      for (const face of dino.plane.faces) {
        const [a, b, c] = [face.vertex1, face.vertex2, face.vertex3];
        const den = (b.v - c.v) * (a.u - c.u) + (c.u - b.u) * (a.v - c.v);
        const l1 = ((b.v - c.v) * (eu - c.u) + (c.u - b.u) * (ev - c.v)) / den;
        const l2 = ((c.v - a.v) * (eu - c.u) + (a.u - c.u) * (ev - c.v)) / den;
        const l3 = 1 - l1 - l2;
        if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) {
          hit = { verts: [a, b, c], w: [l1, l2, l3] };
          break;
        }
      }
      if (hit === null) throw new Error('грань с глазом не найдена');
      const found = hit;

      /** Что ушло на экран в последнем кадре: накладка и точка сетки. */
      let overlay: [number, number] = [0, 0];
      let drawn: [number, number] = [0, 0];
      game.events.on('postrender', () => {
        const m = dino.eyeOpen.getWorldTransformMatrix();
        overlay = [m.tx, m.ty];
        const world = dino.plane.getWorldTransformMatrix();
        const local = { x: 0, y: 0 };
        found.verts.forEach((v, i) => {
          local.x += v.vx * (found.w[i] ?? 0);
          local.y += v.vy * (found.w[i] ?? 0);
        });
        const p = world.transformPoint(local.x, local.y);
        drawn = [p.x, p.y];
      });

      const pose = (x: number, y: number, angle: number): void => {
        dino.headWrap.setPosition(x, y).setAngle(angle);
      };
      // Покой: опорная точка, от которой считаются оба сдвига.
      pose(mesh.headRestX, mesh.headRestY, 0);
      step();
      step();
      const rest = { overlay, drawn };
      const restGap = Math.hypot(overlay[0] - drawn[0], overlay[1] - drawn[1]);

      const out: Sample[] = [];
      for (const p of poses) {
        pose(p.x, p.y, p.angle);
        // Ровно один кадр: сетка обязана успеть за головой сразу, а не потом.
        step();
        const o: [number, number] = [overlay[0] - rest.overlay[0], overlay[1] - rest.overlay[1]];
        const d: [number, number] = [drawn[0] - rest.drawn[0], drawn[1] - rest.drawn[1]];
        out.push({ name: p.name, overlay: o, drawn: d, gap: Math.hypot(o[0] - d[0], o[1] - d[1]) });
        pose(mesh.headRestX, mesh.headRestY, 0);
        step();
        step();
      }
      return { restGap, out };
    },
    {
      poses: POSES,
      mesh: {
        eyeX: DINO_MESH.eyeX,
        eyeY: DINO_MESH.eyeY,
        imageWidth: DINO_MESH.imageWidth,
        imageHeight: DINO_MESH.imageHeight,
        headRestX: DINO_MESH.headRestX,
        headRestY: DINO_MESH.headRestY,
      },
    },
  );

  // В покое картинка глаза стоит на глазнице рисунка: иначе веса вершин взяты не те.
  expect(result.restGap, 'в покое накладка не на глазнице').toBeLessThan(TOLERANCE * 2);
  for (const s of result.out) {
    expect(
      s.gap,
      `${s.name}: накладка сдвинулась на ${s.overlay.map(Math.round).join(',')}, сетка у глаза на ${s.drawn.map(Math.round).join(',')}`,
    ).toBeLessThan(TOLERANCE);
  }
});
