/**
 * Из чего собран диплодок: контейнеры, картинки и сетка.
 *
 * Здесь только сборка — кто кого содержит и где стоит в покое. Как это
 * ходит и что умеет делать, живёт в dinoRig.ts и Diplodocus.ts.
 *
 * Сборка зависит от того, есть ли нарисованный диплодок: с рисунком тело,
 * хвост, лапы и голова живут на одной сетке, а старые объекты остаются
 * невидимыми — по их углам сетка и гнётся, и походка работает прежним кодом.
 */

import Phaser from 'phaser';
import {
  DINO_ART_HEAD,
  DINO_GEOM,
  DINO_TEX,
  generateDiplodocusTextures,
  hasArtDino,
  hasArtParts,
} from '../art/diplodocus';
import { DINO_ART, DINO_MESH } from '../art/dinoArtMeta';
import { createDinoPlane, HEAD_EYE, HEAD_MOUTH, prepareWarp } from '../art/dinoWarp';

/** Глаз, вырезанный с целого рисунка: им моргает сетчатый диплодок. */
const MESH_EYE = 'dino-mesh-eye';

export interface DinoParts {
  /** Корневой контейнер. Его точка привязки — ЛАПЫ (касание земли). */
  root: Phaser.GameObjects.Container;
  rig: Phaser.GameObjects.Container;
  bodyWrap: Phaser.GameObjects.Container;
  bodyImg: Phaser.GameObjects.Image;
  tailImg: Phaser.GameObjects.Image;
  neckG: Phaser.GameObjects.Graphics;
  headWrap: Phaser.GameObjects.Container;
  /** Голова доворачивается по касательной шеи отдельно от своих твинов. */
  headTurn: Phaser.GameObjects.Container;
  eyeOpen: Phaser.GameObjects.Image;
  eyeHappy: Phaser.GameObjects.Image;
  leafImg: Phaser.GameObjects.Image;
  starWrap: Phaser.GameObjects.Container;
  starImg: Phaser.GameObjects.Image;
  /** Все лапы и пары для противофазной ходьбы. */
  legs: Phaser.GameObjects.Image[];
  frontLegs: Phaser.GameObjects.Image[];
  backLegs: Phaser.GameObjects.Image[];
  /** Сетка с целым диплодоком: у неё гнётся шея. Пусто у диплодока из кода. */
  plane: Phaser.GameObjects.Plane | null;
  /** Разложение вершин сетки по шее, голове, лапам и хвосту — считается один раз. */
  planeBounds: ReturnType<typeof prepareWarp> | null;
  /** Тело, шея и голова — нарисованные картинки, а не фигуры из кода. */
  art: boolean;
  /** Где голова сидит в покое: у рисунка своё место, не как у кода. */
  restX: number;
  restY: number;
}

/** Собрать диплодока в точке (x, y) и вернуть все его части. */
export function buildDinoParts(scene: Phaser.Scene, x: number, y: number): DinoParts {
  generateDiplodocusTextures(scene);

  const geom = DINO_GEOM;
  const art = hasArtDino(scene);
  const restX = art ? DINO_MESH.headRestX : DINO_GEOM.headRestX;
  const restY = art ? DINO_MESH.headRestY : DINO_GEOM.headRestY;
  // У рисованной головы свои стык с шеей, глаз и рот.
  const head = art
    ? {
        headOriginX: DINO_ART.head.originX,
        headOriginY: DINO_ART.head.originY,
        eyeX: HEAD_EYE.x,
        eyeY: HEAD_EYE.y,
        mouthX: HEAD_MOUTH.x,
        mouthY: HEAD_MOUTH.y,
      }
    : hasArtParts(scene)
      ? DINO_ART_HEAD
      : geom;

  const makeLeg = (
    texture: string,
    legX: number,
    legY: number,
    scale: number,
  ): Phaser.GameObjects.Image =>
    scene.add
      .image(legX, legY, texture)
      .setOrigin(DINO_GEOM.legOriginX, DINO_GEOM.legOriginY)
      .setScale(scale)
      // У рисованного диплодока лапы уже на теле: объект нужен только затем,
      // чтобы походка и её твины работали прежним кодом.
      .setVisible(!art);

  const root = scene.add.container(x, y);
  const rig = scene.add.container(0, 0);
  root.add(rig);

  // Дальние лапы — за телом, в тени.
  const farBack = makeLeg(DINO_TEX.LEG_FAR, geom.legFarBackX, geom.hipFarY, geom.legFarScale);
  const farFront = makeLeg(DINO_TEX.LEG_FAR, geom.legFarFrontX, geom.hipFarY, geom.legFarScale);

  // Тело с хвостом: покачивается на ходу как одно целое.
  const bodyWrap = scene.add.container(0, 0);
  const tailImg = scene.add
    .image(geom.tailX, geom.tailY, DINO_TEX.TAIL)
    .setOrigin(geom.tailOriginX, geom.tailOriginY);
  const bodyImg = art
    ? scene.add
        .image(geom.shoulderX, geom.shoulderY, DINO_ART.body.key)
        .setOrigin(DINO_ART.body.originX, DINO_ART.body.originY)
    : scene.add.image(geom.bodyX, geom.bodyY, DINO_TEX.BODY).setOrigin(0.5, 0.5);
  if (art) tailImg.setVisible(false);
  if (art) bodyImg.setVisible(false);
  bodyWrap.add([tailImg, bodyImg]);

  // Шея: пустой Graphics, его наполняет drawNeck каждый кадр.
  const neckG = scene.add.graphics();

  // Ближние лапы — перед телом.
  const nearBack = makeLeg(DINO_TEX.LEG_NEAR, geom.legNearBackX, geom.hipNearY, 1);
  const nearFront = makeLeg(DINO_TEX.LEG_NEAR, geom.legNearFrontX, geom.hipNearY, 1);

  // Голова со всем, что к ней прикреплено.
  const headWrap = scene.add.container(restX, restY);
  const headImg = scene.add
    .image(0, 0, art ? DINO_ART.head.key : DINO_TEX.HEAD)
    .setOrigin(head.headOriginX, head.headOriginY)
    // Голова нарисована на самой сетке, отдельная картинка не нужна.
    .setVisible(!art);
  // Глаз вырезан с самого рисунка, поэтому моргание выглядит как на нём.
  // Глаз лежит в пикселях рисунка, а тут мы в пикселях рига: ужимаем. Хранить
  // его сразу мелким нельзя — на экранах задачек его растягивают обратно,
  // и там была видна лесенка.
  const eyeFit = art ? DINO_MESH.scale : 1;
  const eyeOpen = scene.add
    .image(head.eyeX, head.eyeY, art ? MESH_EYE : DINO_TEX.EYE)
    .setScale(eyeFit);
  const eyeHappy = scene.add
    .image(head.eyeX, head.eyeY, art ? MESH_EYE : DINO_TEX.EYE_HAPPY)
    .setScale(eyeFit)
    .setVisible(false);
  const leafImg = scene.add
    .image(head.mouthX, head.mouthY, DINO_TEX.LEAF)
    .setOrigin(0.1, 0.5)
    .setVisible(false);
  const starWrap = scene.add.container(geom.starX, geom.starY);
  const starImg = scene.add.image(0, 0, DINO_TEX.HINT_STAR);
  starWrap.add(starImg);
  // Голова крутится по шее внутри headTurn, а её собственные твины крутят
  // headWrap — два поворота не мешают друг другу.
  const headTurn = scene.add.container(0, 0, [headImg, eyeOpen, eyeHappy, leafImg]);
  headWrap.add([headTurn, starWrap]);

  const plane = art ? createDinoPlane(scene) : null;
  const planeBounds = plane === null ? null : prepareWarp(plane);

  const inRig: Phaser.GameObjects.GameObject[] = [
    farBack,
    farFront,
    bodyWrap,
    neckG,
    nearBack,
    nearFront,
  ];
  if (plane !== null) inRig.push(plane);
  inRig.push(headWrap);
  rig.add(inRig);

  return {
    root,
    rig,
    bodyWrap,
    bodyImg,
    tailImg,
    neckG,
    headWrap,
    headTurn,
    eyeOpen,
    eyeHappy,
    leafImg,
    starWrap,
    starImg,
    legs: [farBack, farFront, nearBack, nearFront],
    frontLegs: [farFront, nearFront],
    backLegs: [farBack, nearBack],
    plane,
    planeBounds,
    art,
    restX,
    restY,
  };
}
