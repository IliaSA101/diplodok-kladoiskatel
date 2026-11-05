/**
 * Каталог находок без рисования: id, название и признак секретного.
 *
 * Модуль намеренно без Phaser. Генератору леса нужны только id предметов,
 * и пока они лежали рядом с функциями рисования, генерацию нельзя было
 * проверить тестом: импорт тянул за собой весь движок.
 */

export interface TreasureInfo {
  /** Короткий латинский id, он же часть имени текстуры и ключ сохранения. */
  id: string;
  /** Русское название — показывается крупно под предметом при находке. */
  name: string;
  /** Секретный предмет не попадает в обычный набор клада. */
  secret?: boolean;
}

/** id секретного предмета — главного приза уровня. */
export const SECRET_ITEM_ID = 'goldcrown';

/** Все предметы, включая секретный: по ним запекаются текстуры. */
export const TREASURE_INFO: readonly TreasureInfo[] = [
  { id: 'crystal', name: 'Кристалл' },
  { id: 'coin', name: 'Монета' },
  { id: 'fossil', name: 'Окаменелость' },
  { id: 'egg', name: 'Яйцо' },
  { id: 'shell', name: 'Ракушка' },
  { id: 'crown', name: 'Корона' },
  { id: 'pearl', name: 'Жемчужина' },
  { id: 'key', name: 'Золотой ключик' },
  { id: 'amber', name: 'Янтарь' },
  { id: 'bone', name: 'Косточка' },
  { id: 'starstone', name: 'Звёздный камень' },
  { id: 'ring', name: 'Колечко' },
  { id: SECRET_ITEM_ID, name: 'Золотая корона', secret: true },
];

/** Только обычные предметы: из них набираются клады уровня. */
export const REGULAR_TREASURE_IDS: readonly string[] = TREASURE_INFO.filter(
  (item) => item.secret !== true,
).map((item) => item.id);
