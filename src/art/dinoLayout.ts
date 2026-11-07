/**
 * Где на экране задачки стоит диплодок-наблюдатель.
 *
 * Жил в `art/layout.ts`, пока тот не упёрся в шестьсот строк. Вынесен целиком,
 * а не наполовину: голова и хвост — это одна композиция, и считать их по
 * разным файлам значит однажды развести их в стороны.
 *
 * Phaser тут нет: всё это проверяет тест `tests/layout.test.ts`.
 */

/**
 * Диплодок-наблюдатель: выглядывает из-за верхнего правого угла панели.
 *
 * Внутри панели места нет — там задачка, а по краям экрана остаётся полоска
 * в восемьдесят пикселей, куда целый диплодок не встаёт. Поэтому он стоит
 * *за* панелью: рисунок высокий, но видно только голову и кусок шеи над
 * верхним краем. Получается «смотрит из-за щита», и ни одной клетки задачки
 * он не закрывает — это и проверяет тест.
 */
export const DINO_WATCH = {
  /** Рост всего рисунка, px: почти весь он уходит за панель. */
  height: 420,
  /** Ширина к росту: рисунок 640×597. */
  aspect: 640 / 597,
  /** Середина рисунка по горизонтали. */
  centerX: 1020,
  /** Макушка: над ней остаётся полоска травы, иначе голова упирается в край. */
  top: 12,
  /** Какую долю высоты рисунка занимает голова (замерено по dino-whole.png). */
  headHeight: 0.15,
  /** Голова по ширине рисунка: от этой доли и до правого края. */
  headFrom: 0.76,
} as const;

/**
 * Хвост, который выходит из-под панели в левом нижнем углу.
 *
 * Голова торчит над панелью справа вверху, и диплодок читался как наклейка в
 * углу, а не как зверь за панелью. Хвост в противоположном углу замыкает
 * картинку: между ними ребёнок достраивает тело сам.
 *
 * Хвост на рисунке — большой завиток: он уходит от крупа влево, загибается,
 * возвращается вправо **под лапами** и кончается остриём у x ≈ 326. Любая
 * рамка его рубит: первая брала одну нижнюю прядь и резала завиток поперёк,
 * вторая обрывалась на x = 180 и отрезала остриё — оба раза ребёнок видел
 * обрубок. Поэтому хвост вырезан по форме отдельной картинкой
 * (`tools/dino_tail.py` → `public/art/dino-tail.png`), и ровный срез у него
 * остался ровно один: вертикальный, на стыке с бедром. Он уходит под панель.
 *
 * Числа ниже печатает тот же инструмент. Размер выреза сверяет с самой
 * картинкой тест в `tests/dinoLayout.test.ts` — разъехаться они не могут.
 */
/** Высота dino-whole.png, px: из неё же выведен DINO_WATCH.aspect. */
const DINO_MESH_HEIGHT = 597;

export const DINO_TAIL = {
  /** Где вырез лежал на целом рисунке и какого он размера, px. */
  cutX: 0,
  cutY: 265,
  cutWidth: 329,
  cutHeight: 332,
  /** Центр завитка в пикселях целого рисунка: по нему хвост и ставится. */
  curlX: 100,
  curlY: 469,
  /** Радиус внешнего края завитка, px картинки. */
  curlRadius: 100,
  /** Куда центр завитка попадает на экране — чуть внутрь угла панели. */
  centerX: 86,
  centerY: 634,
  /** Наклон: хвост лежит на траве, а не торчит вбок. */
  angle: -6,
} as const;

/**
 * Куда поставить диплодока: экранов с ним уже два, и они разные.
 *
 * На задачке он выглядывает из-за панели — виден только верх, и `bottom`
 * уходит далеко под неё. На хабе английского он стоит на траве целиком, и
 * `bottom` — это его ноги. Разница ровно в числах, поэтому рисует их один
 * и тот же класс.
 */
export interface DinoSpot {
  centerX: number;
  /** Низ рисунка на экране. */
  bottom: number;
  height: number;
  /** Нужен ли завиток хвоста из-под угла панели. */
  tail: boolean;
}

/** Наблюдатель за панелью задачки — то, как диплодок стоял до сих пор. */
export const DINO_WATCH_SPOT: DinoSpot = {
  centerX: DINO_WATCH.centerX,
  bottom: DINO_WATCH.top + DINO_WATCH.height,
  height: DINO_WATCH.height,
  tail: true,
};

/**
 * Диплодок целиком на экранах без задачки: выбор леса, «Мои сокровища», альбом.
 *
 * Панели, из-за которой можно выглянуть, там нет или она вся занята (сетка
 * предметов, кнопки), поэтому он стоит целиком — как на хабе английского —
 * в единственной свободной полосе. Координаты — экранные; полосу и то, что
 * рядом с ней, считают `levelSelectLayout`, `treasureLayout` и
 * `stickerAlbumLayout`, а тест `tests/dinoSpots.test.ts` держит его в стороне
 * от всего нарисованного.
 *
 * Хвост-завиток здесь не нужен (`tail: false`): он на самом рисунке.
 */
/**
 * Выбор леса: на траве под вторым рядом кружков, левее кнопки «Ещё лес!».
 * Макушка в прыжке (`dinoCheerReach`) остаётся ниже точек пятого леса.
 */
export const DINO_LEVELS_SPOT: DinoSpot = { centerX: 190, bottom: 716, height: 110, tail: false };

/**
 * «Мои сокровища»: справа внизу панели, правее кнопки «назад».
 * Экранные координаты; панель стоит по центру экрана.
 */
export const DINO_COLLECTION_SPOT: DinoSpot = { centerX: 1152, bottom: 680, height: 130, tail: false };

/**
 * Альбом наклеек: на верхнем ряду ячеек, между заголовком и счётчиком.
 * Макушка в прыжке не доходит до рамки листа (рамка в 14 px от края экрана).
 */
export const DINO_ALBUM_SPOT: DinoSpot = { centerX: 745, bottom: 160, height: 104, tail: false };

/**
 * Прыжок радости (`DinoWatcher.cheer`): подъём вверх и качание тела.
 *
 * Числа живут тут, а не в сущности, потому что от них зависит, где можно
 * поставить диплодока: тест сверяет его место с прыжком, а не с покоем.
 * Тело качается вокруг ног, поэтому верхний угол рисунка уходит вверх ещё
 * на пару пикселей — `dinoCheerReach` их считает.
 */
export const DINO_CHEER = { jump: 26, swayDeg: 6 } as const;

/** На сколько выше макушки в покое окажется верх рисунка в самом высоком месте прыжка, px. */
export function dinoCheerReach(spot: DinoSpot): number {
  const half = (spot.height * DINO_WATCH.aspect) / 2;
  const sway = (DINO_CHEER.swayDeg * Math.PI) / 180;
  // Верхний угол рамки, повёрнутой вокруг середины низа: поднимается на
  // half·sin и опускается на height·(1−cos). Это запас сверху, а не оценка головы.
  const rise = half * Math.sin(sway) - spot.height * (1 - Math.cos(sway));
  return DINO_CHEER.jump + Math.max(0, rise);
}

/** Тот же диплодок в координатах контейнера, чей центр стоит в (originX, originY). */
export function dinoSpotIn(spot: DinoSpot, originX: number, originY: number): DinoSpot {
  return { ...spot, centerX: spot.centerX - originX, bottom: spot.bottom - originY };
}

/** Весь рисунок диплодока на его месте: рост на ширину по пропорции рисунка. */
export function dinoSpotBox(spot: DinoSpot): Box {
  const half = (spot.height * DINO_WATCH.aspect) / 2;
  return {
    left: spot.centerX - half,
    right: spot.centerX + half,
    top: spot.bottom - spot.height,
    bottom: spot.bottom,
  };
}

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Весь рисунок наблюдателя целиком. */
export function dinoWatchBox(): Box {
  const width = DINO_WATCH.height * DINO_WATCH.aspect;
  return {
    left: DINO_WATCH.centerX - width / 2,
    right: DINO_WATCH.centerX + width / 2,
    top: DINO_WATCH.top,
    bottom: DINO_WATCH.top + DINO_WATCH.height,
  };
}

/** Только голова — единственное, что видно поверх панели. */
export function dinoWatchHead(): Box {
  const whole = dinoWatchBox();
  const width = whole.right - whole.left;
  return {
    left: whole.left + width * DINO_WATCH.headFrom,
    right: whole.right,
    top: whole.top,
    bottom: whole.top + DINO_WATCH.height * DINO_WATCH.headHeight,
  };
}

/**
 * Где лежит кончик хвоста: по нему тест и проверяет, что его видно.
 *
 * Считаем только кончик, а не весь прямоугольник: хвост повёрнут, и его
 * габаритная рамка захватывает пустые углы — по ней «видно» вышло бы всегда.
 */
export function dinoTailTip(): { x: number; y: number } {
  const fit = DINO_WATCH.height / DINO_MESH_HEIGHT;
  const reach = DINO_TAIL.curlRadius * fit;
  const radians = (DINO_TAIL.angle * Math.PI) / 180;
  return {
    x: DINO_TAIL.centerX - reach * Math.cos(radians),
    y: DINO_TAIL.centerY - reach * Math.sin(radians),
  };
}

/**
 * Масштаб глаза в покое: у рисованного диплодока глаз вырезан с рисунка в его
 * разрешении и ужат до пикселей рига, у диплодока из кода он и так в них.
 * Возвращать глаз в «единицу» нельзя — на экране победы он вырастал втрое.
 */
export function dinoEyeScale(art: boolean, meshScale: number): number {
  return art ? meshScale : 1;
}

/** Во сколько раз моргание сплющивает глаз от его покойного масштаба. */
export const EYE_BLINK = 0.08;

/**
 * Масштаб по высоте на пике моргания. Считается от покоя: у рисованного глаза
 * покой — 0.327, и абсолютные 0.08 не прищуривали, а растягивали бы его в линию
 * другой толщины, чем у глаза из кода.
 */
export function dinoBlinkScaleY(restScale: number): number {
  return restScale * EYE_BLINK;
}

/**
 * Поворот контейнера `headTurn` с глазом и листиком, рад.
 *
 * `turn` — на сколько сетка повернула голову. Но глаз лежит ещё и в `headWrap`,
 * а его твины (радость −12°, копание 34°, жевание 7°) крутят глаз, не трогая
 * сетку: глаз съезжал с головы на полтора своих размера. Вычитаем то, что
 * `headWrap` уже повернул, и глаз встаёт по сетке; голова на сетке не кивает.
 */
export function dinoEyeTurn(turn: number, headWrapRotation: number): number {
  return turn - headWrapRotation;
}
