/**
 * Футбольный квест: диплодок бежит по стадиону круг за кругом и за каждую
 * задачку получает наклейку в альбом.
 *
 * Здесь лежит вся «начинка» квеста — узлы, слова и вопросы.
 * Добавить задачку = добавить узел сюда, сцены ничего не знают о составе.
 *
 * Кругов шесть, в каждом восемь узлов на одной и той же дорожке стадиона.
 * Круг задаёт **нижнюю** ступень сложности, а сверху прибавляется то, что
 * ребёнок набрал сам (`systems/skill.ts`): решает быстро и без ошибок —
 * задачки этого вида растут, возится — возвращаются назад.
 *
 * Наклеек по-прежнему двадцать четыре: круги с четвёртого выдают те же, но
 * «золотыми». Рисовать сорок восемь наклеек ради шести кругов не стоит, да и
 * альбом в три ряда по восемь — ровно та страница, которую видно целиком.
 */
import { CARD_ICONS, TEX } from '../art/keys';
import { buildMahjongBoard, type MahjongBoard } from '../systems/mahjongBoard';
import { makeRng } from '../systems/rng';

export type PuzzleKind =
  | 'sudoku'
  | 'mahjong'
  | 'word'
  | 'quiz'
  | 'memory'
  | 'count'
  | 'pattern'
  | 'sequence';

export interface QuestNode {
  id: string;
  kind: PuzzleKind;
  /** Позиция узла на карте в координатах экрана 1280x720. */
  x: number;
  y: number;
  /** Наклейка в награду — ключ текстуры из TEX.STICKER. */
  sticker: string;
  /** Какой набор заданий своего типа брать: нужен ради разнообразия. */
  variant: number;
  /** Круг, 1…ROUND_COUNT. Он задаёт нижнюю ступень сложности. */
  round: number;
}

export const ROUND_COUNT = 6;
export const NODES_PER_ROUND = 8;
/** Столько кругов дают свою наклейку; дальше те же, но золотые. */
export const PLAIN_ROUNDS = 3;

/** Круг, который выдаёт золотую наклейку вместо новой. */
export function isGoldenRound(round: number): boolean {
  return round > PLAIN_ROUNDS;
}

/** Восемь мест на дорожке стадиона: круги проходят по ним же. */
const TRACK: readonly { x: number; y: number }[] = [
  { x: 190, y: 530 },
  { x: 360, y: 400 },
  { x: 520, y: 540 },
  { x: 690, y: 390 },
  { x: 840, y: 530 },
  { x: 980, y: 380 },
  { x: 1110, y: 520 },
  { x: 1180, y: 330 },
];

/**
 * Что за задачка на каждом месте каждого круга.
 *
 * В круге есть все виды, а повторы расставлены так, чтобы два одинаковых
 * не шли подряд: ребёнку скучно решать то же самое дважды.
 *
 * Первые три круга оставлены ровно такими, какими их прошёл ребёнок: узлы
 * помечены решёнными по id, и если сменить вид у решённого узла, новая задачка
 * ему уже не достанется. Поэтому «Счёт на табло» живёт в кругах с четвёртого —
 * там, где ребёнок сейчас и находится, — и занимает там восемь узлов из
 * двадцати четырёх.
 */
const ROUND_KINDS: readonly (readonly PuzzleKind[])[] = [
  ['mahjong', 'memory', 'sudoku', 'quiz', 'mahjong', 'memory', 'sudoku', 'word'],
  ['memory', 'quiz', 'mahjong', 'sudoku', 'quiz', 'memory', 'sudoku', 'word'],
  ['quiz', 'mahjong', 'memory', 'word', 'sudoku', 'quiz', 'mahjong', 'word'],
  ['count', 'mahjong', 'word', 'memory', 'quiz', 'count', 'sudoku', 'mahjong'],
  ['memory', 'pattern', 'sudoku', 'word', 'sequence', 'mahjong', 'count', 'quiz'],
  ['pattern', 'quiz', 'mahjong', 'sequence', 'memory', 'sudoku', 'count', 'word'],
];

/** Узлы всех кругов подряд: q1…q48, наклейка по порядку из TEX.STICKER. */
function buildNodes(): QuestNode[] {
  const nodes: QuestNode[] = [];
  // Вариант считается отдельно по каждому виду: это номер набора заданий.
  const seen: Partial<Record<PuzzleKind, number>> = {};
  ROUND_KINDS.forEach((kinds, roundIndex) => {
    kinds.forEach((kind, place) => {
      const index = roundIndex * NODES_PER_ROUND + place;
      const spot = TRACK[place] ?? { x: 0, y: 0 };
      const variant = seen[kind] ?? 0;
      seen[kind] = variant + 1;
      nodes.push({
        id: `q${index + 1}`,
        kind,
        x: spot.x,
        y: spot.y,
        // Наклеек двадцать четыре, узлов сорок восемь: со второй половины
        // квеста те же наклейки идут по второму разу (круги 4-6 — золотые).
        sticker: TEX.STICKER[index % TEX.STICKER.length] ?? TEX.STICKER[0] ?? '',
        variant,
        round: roundIndex + 1,
      });
    });
  });
  return nodes;
}

export const QUEST_NODES: readonly QuestNode[] = buildNodes();

/** Узлы одного круга, 1…ROUND_COUNT. */
export function roundNodes(round: number): readonly QuestNode[] {
  return QUEST_NODES.filter((node) => node.round === round);
}

/** Собери слово по картинке. Слова растут от круга к кругу. */
export interface WordPuzzle {
  /** Слово заглавными буквами. */
  word: string;
  /** Картинка-подсказка: ключ из TEX.FOOT или TEX.GEAR. */
  icon: string;
}

/**
 * Слова по длине: ступень поднимает строку, вариант крутит порядок внутри неё.
 *
 * Раньше тут лежали четыре готовых набора по три слова, и `tier` выбирал
 * набор целиком. Со ступени 3 окно упиралось в конец таблицы, и все узлы со
 * второго круга получали один и тот же набор — «СВИСТОК, БУТЫЛКА, ПЕРЧАТКА»
 * на всю игру. Теперь строка задаёт только длину слов, а три слова из неё
 * выбирает перемешивание по варианту: в верхней строке их восемь, и наборов
 * из неё набирается полсотни.
 *
 * Строки растут по длине слова, и это проверяет тест, а не глаз.
 */
export const WORD_TIERS: readonly (readonly WordPuzzle[])[] = [
  [
    { word: 'МЯЧ', icon: TEX.FOOT[0] },
    { word: 'ФЛАГ', icon: TEX.FOOT[5] },
    { word: 'ШАРФ', icon: TEX.FOOT[10] },
    { word: 'ЧАСЫ', icon: TEX.FOOT[9] },
  ],
  [
    { word: 'СЕТКА', icon: TEX.FOOT[6] },
    { word: 'КОНУС', icon: TEX.FOOT[7] },
    { word: 'БУТСА', icon: TEX.FOOT[1] },
    { word: 'КУБОК', icon: TEX.FOOT[3] },
    { word: 'НАСОС', icon: TEX.GEAR[6] },
    { word: 'ЩИТКИ', icon: TEX.GEAR[5] },
    { word: 'ГЕТРЫ', icon: TEX.GEAR[4] },
    { word: 'ШОРТЫ', icon: TEX.GEAR[3] },
    { word: 'ДУДКА', icon: TEX.GEAR[9] },
    { word: 'МЕДАЛЬ', icon: TEX.FOOT[8] },
    { word: 'РЮКЗАК', icon: TEX.GEAR[11] },
  ],
  [
    { word: 'СВИСТОК', icon: TEX.FOOT[2] },
    { word: 'БУТЫЛКА', icon: TEX.FOOT[11] },
    { word: 'ПОВЯЗКА', icon: TEX.GEAR[7] },
    { word: 'АПТЕЧКА', icon: TEX.GEAR[10] },
    { word: 'ПЕРЧАТКА', icon: TEX.FOOT[4] },
    { word: 'КАРТОЧКА', icon: TEX.GEAR[0] },
    { word: 'ФУТБОЛКА', icon: TEX.GEAR[2] },
    { word: 'СКАМЕЙКА', icon: TEX.GEAR[8] },
  ],
];

/** Сколько слов в одной задачке. */
export const WORDS_PER_PUZZLE = 3;

/**
 * Викторина: короткий вопрос, одна правильная картинка и запас неправильных.
 *
 * Неправильные перечислены явно, а не берутся случайно из TEX.FOOT: половина
 * значков на другой вопрос отвечает не хуже правильного («что вешают на шею
 * чемпиону» — медаль, но шарф тоже вешают). Случайный лишний вариант сделал бы
 * вопрос без правильного ответа, и ребёнок был бы прав, а игра — нет.
 *
 * Сколько из них показать, решает ступень: три варианта на первых кругах,
 * пять на последних. Поэтому их тут четыре — запас до пяти кнопок.
 */
export interface QuizQuestion {
  question: string;
  /** Правильный ответ — ключ из TEX.FOOT. */
  answer: string;
  /** Неправильные, все до одного заведомо неправильные. */
  wrong: readonly [string, string, string, string];
}

/**
 * Имена картинок футбола: вопросы читаются словами, а не индексами.
 *
 * Раньше в каждом вопросе стояло `TEX.FOOT[8]`, и проверить глазами, что
 * неправильный ответ и правда неправильный, было нельзя — приходилось
 * держать в голове весь список. Теперь видно, что чему противопоставлено.
 */
const [
  BALL,
  BOOT,
  WHISTLE,
  TROPHY,
  GLOVE,
  FLAG,
  NET,
  CONE,
  MEDAL,
  STOPWATCH,
  SCARF,
  BOTTLE,
] = TEX.FOOT;
const [
  YELLOW_CARD,
  RED_CARD,
  SHIRT,
  SHORTS,
  SOCKS,
  SHIN,
  PUMP,
  ARMBAND,
  BENCH,
  HORN,
  AID,
  BACKPACK,
  BALL_BAG,
] = TEX.GEAR;

/**
 * Вопросы викторины, разложенные по трудности.
 *
 * Строка — это **ступень**, а не «набор на один узел». Раньше таблица была
 * из наборов по три вопроса, и узел брал набор целиком: на верхних ступенях
 * окно упиралось в последний набор, и ребёнок получал одни и те же три
 * вопроса в каждом круге. Он это заметил первым.
 *
 * Трудность растёт не только числом картинок на выбор:
 *  - нижняя строка — узнавание: предмет назван своим делом («что пинают»),
 *    а неправильные ответы из совсем другой оперы;
 *  - средняя — роль: спрашивают не про предмет, а зачем он нужен;
 *  - верхняя — различение: правильный ответ отличается от соседнего
 *    деталью («что одно на всю команду» — кубок, а не медаль).
 *
 * Неправильные ответы выписаны руками и не подбираются случайно: шарф тоже
 * носят на шее, медаль тоже дают за победу, и случайный «лишний» вариант
 * оказывается вторым правильным. Это уже случалось, см. CLAUDE.md.
 */
export const QUIZ_TIERS: readonly (readonly QuizQuestion[])[] = [
  [
    { question: 'Что пинают ногой?', answer: BALL, wrong: [WHISTLE, MEDAL, SCARF, BOTTLE] },
    { question: 'Что надевают на ноги?', answer: BOOT, wrong: [GLOVE, MEDAL, WHISTLE, BOTTLE] },
    { question: 'Чем судья свистит?', answer: WHISTLE, wrong: [BALL, BOOT, FLAG, TROPHY] },
    { question: 'Что вратарь надевает на руки?', answer: GLOVE, wrong: [BOOT, SCARF, MEDAL, CONE] },
    { question: 'Из чего пьют воду?', answer: BOTTLE, wrong: [BALL, WHISTLE, CONE, MEDAL] },
    { question: 'Что вешают на шею чемпиону?', answer: MEDAL, wrong: [GLOVE, BOOT, CONE, WHISTLE] },
    { question: 'Куда забивают гол?', answer: NET, wrong: [CONE, BOTTLE, WHISTLE, MEDAL] },
    { question: 'Что показывает время?', answer: STOPWATCH, wrong: [BALL, BOOT, FLAG, SCARF] },
    { question: 'Чем машет боковой судья?', answer: FLAG, wrong: [BOTTLE, MEDAL, BOOT, BALL] },
    { question: 'Что расставляют на траве?', answer: CONE, wrong: [MEDAL, SCARF, GLOVE, STOPWATCH] },
    { question: 'Что надевают на туловище?', answer: SHIRT, wrong: [BOOT, GLOVE, WHISTLE, MEDAL] },
    { question: 'Чем накачивают мяч?', answer: PUMP, wrong: [BOTTLE, WHISTLE, FLAG, MEDAL] },
    { question: 'Какую карточку судья показывает первой?', answer: YELLOW_CARD, wrong: [FLAG, WHISTLE, MEDAL, SCARF] },
    { question: 'В чём несут вещи на тренировку?', answer: BACKPACK, wrong: [BOTTLE, CONE, MEDAL, WHISTLE] },
    { question: 'Чем болельщик шумит на трибуне?', answer: HORN, wrong: [SCARF, BOTTLE, MEDAL, CONE] },
    { question: 'Что защищает ноги от удара?', answer: SHIN, wrong: [GLOVE, SCARF, CONE, WHISTLE] },
    { question: 'Что надевают на ноги выше бутс?', answer: SOCKS, wrong: [GLOVE, SCARF, CONE, MEDAL] },
    { question: 'Где сидят запасные игроки?', answer: BENCH, wrong: [NET, CONE, FLAG, TROPHY] },
    { question: 'Что несут, если игрок ушибся?', answer: AID, wrong: [TROPHY, CONE, FLAG, MEDAL] },
  ],
  [
    { question: 'Чем судья останавливает игру?', answer: WHISTLE, wrong: [FLAG, STOPWATCH, CONE, SCARF] },
    { question: 'Что защищает руки вратаря?', answer: GLOVE, wrong: [BOOT, SCARF, TROPHY, CONE] },
    { question: 'Что натянуто за штангами?', answer: NET, wrong: [FLAG, CONE, SCARF, STOPWATCH] },
    { question: 'Что берут с собой, чтобы попить?', answer: BOTTLE, wrong: [TROPHY, MEDAL, WHISTLE, FLAG] },
    { question: 'Что обводят на тренировке?', answer: CONE, wrong: [MEDAL, STOPWATCH, SCARF, TROPHY] },
    { question: 'Что поднимают над головой всей командой?', answer: TROPHY, wrong: [BALL, BOTTLE, FLAG, CONE] },
    { question: 'Что вручают игроку после финала?', answer: MEDAL, wrong: [BALL, NET, CONE, BOTTLE] },
    { question: 'Чем показывают, что мяч ушёл за линию?', answer: FLAG, wrong: [BOTTLE, MEDAL, BOOT, GLOVE] },
    { question: 'По чему узнают, что тайм кончился?', answer: STOPWATCH, wrong: [BALL, BOOT, FLAG, SCARF] },
    { question: 'Что болельщик носит в цветах команды?', answer: SCARF, wrong: [GLOVE, CONE, WHISTLE, BOTTLE] },
    { question: 'Чем бьют по мячу?', answer: BOOT, wrong: [WHISTLE, FLAG, MEDAL, BOTTLE] },
    { question: 'Что должно попасть в ворота?', answer: BALL, wrong: [CONE, STOPWATCH, SCARF, GLOVE] },
    { question: 'Что судья достаёт, когда удаляет игрока?', answer: RED_CARD, wrong: [FLAG, WHISTLE, SCARF, MEDAL] },
    { question: 'Что капитан носит на рукаве?', answer: ARMBAND, wrong: [MEDAL, SCARF, GLOVE, STOPWATCH] },
    { question: 'Чем помогают сдувшемуся мячу?', answer: PUMP, wrong: [BOTTLE, NET, CONE, FLAG] },
    { question: 'Где ждут своей очереди запасные?', answer: BENCH, wrong: [NET, CONE, TROPHY, FLAG] },
    { question: 'Что надевают под гетры, чтобы не было больно?', answer: SHIN, wrong: [GLOVE, SCARF, CONE, WHISTLE] },
    { question: 'В чём несут форму на игру?', answer: BACKPACK, wrong: [BOTTLE, TROPHY, NET, CONE] },
    { question: 'Что открывают, если игрок поранился?', answer: AID, wrong: [BOTTLE, TROPHY, NET, CONE] },
    { question: 'В чём приносят на поле сразу много мячей?', answer: BALL_BAG, wrong: [CONE, FLAG, WHISTLE, MEDAL] },
  ],
  [
    { question: 'Что получает каждый игрок?', answer: MEDAL, wrong: [TROPHY, NET, FLAG, WHISTLE] },
    { question: 'Что одно на всю команду?', answer: TROPHY, wrong: [MEDAL, BOOT, GLOVE, SCARF] },
    { question: 'Что на шее у болельщика?', answer: SCARF, wrong: [MEDAL, GLOVE, WHISTLE, TROPHY] },
    { question: 'Что надевают на руки, а не на ноги?', answer: GLOVE, wrong: [BOOT, SCARF, CONE, BALL] },
    { question: 'Чем машут, а не свистят?', answer: FLAG, wrong: [WHISTLE, BALL, BOTTLE, MEDAL] },
    { question: 'Что считает время, а не голы?', answer: STOPWATCH, wrong: [MEDAL, TROPHY, FLAG, BALL] },
    { question: 'Что стоит на траве и никуда не летит?', answer: CONE, wrong: [BALL, FLAG, WHISTLE, MEDAL] },
    { question: 'Что надевают до игры, а не получают после?', answer: BOOT, wrong: [MEDAL, TROPHY, SCARF, FLAG] },
    { question: 'Что ловят руками, а не ногами?', answer: BALL, wrong: [CONE, NET, BOOT, FLAG] },
    { question: 'Что висит на воротах, а не на шее?', answer: NET, wrong: [SCARF, MEDAL, GLOVE, FLAG] },
    { question: 'Что открывают, а не выигрывают?', answer: BOTTLE, wrong: [TROPHY, MEDAL, NET, FLAG] },
    { question: 'Что берут в рот, а не в руку?', answer: WHISTLE, wrong: [FLAG, TROPHY, BOOT, CONE] },
    { question: 'Какая карточка строже?', answer: RED_CARD, wrong: [YELLOW_CARD, FLAG, SCARF, MEDAL] },
    { question: 'Что надевают на руку, а не на шею?', answer: ARMBAND, wrong: [SCARF, MEDAL, HORN, TROPHY] },
    { question: 'Что надевают на ноги, а не на руки?', answer: SOCKS, wrong: [GLOVE, ARMBAND, SCARF, HORN] },
    { question: 'Что надевают выше пояса?', answer: SHIRT, wrong: [SHORTS, BOOT, SOCKS, SHIN] },
    { question: 'Что надевают ниже пояса?', answer: SHORTS, wrong: [SHIRT, GLOVE, SCARF, ARMBAND] },
    { question: 'Что накачивает воздух, а не наливает воду?', answer: PUMP, wrong: [BOTTLE, NET, CONE, HORN] },
    { question: 'На чём сидят, а не стоят?', answer: BENCH, wrong: [CONE, NET, FLAG, TROPHY] },
    { question: 'Что гудит, а не свистит?', answer: HORN, wrong: [WHISTLE, BALL, FLAG, MEDAL] },
    { question: 'Что открывают при ушибе, а не при жажде?', answer: AID, wrong: [BOTTLE, BACKPACK, TROPHY, NET] },
  ],
];

/**
 * Что взять из таблицы, упорядоченной от простого к сложному.
 *
 * Ступень задаёт **нижнюю** границу, вариант крутит всё, что выше неё. На
 * нулевой ступени ребёнок получает наборы по кругу с самого начала, на верхней
 * — только последний. Так одна таблица даёт и рост сложности, и разнообразие:
 * без второй половины ребёнок на третьем круге получал бы один и тот же
 * сложный набор три раза подряд.
 *
 * Ступень выше таблицы — не ошибка: ступень растёт от круга и от самого
 * ребёнка (`systems/skill.ts`) и доходит до девяти, а таблицы короче. Запас
 * просто кончается, и дальше идёт самое сложное, что есть.
 */
/** Какую строку таблицы берёт `tier`: номер нужен, когда таблиц несколько. */
export function tierIndex(length: number, step: number, variant: number): number {
  const last = length - 1;
  const from = Math.min(last, Math.max(0, Math.round(step)));
  const spread = length - from;
  return from + (Math.max(0, Math.round(variant)) % spread);
}

export function tier<T>(table: readonly T[], step: number, variant: number): T {
  const last = table.length - 1;
  const value = table[tierIndex(table.length, step, variant)] ?? table[last];
  // Пустая таблица — это опечатка в данных, а не случай игры: лучше упасть
  // на тесте, чем молча выдать ребёнку задачку без содержимого.
  if (value === undefined) throw new Error('tier из пустой таблицы');
  return value;
}

/**
 * Сколько пар в маджонге на ступени: чем выше, тем больше стол.
 *
 * Нулевая ступень плоская, там шесть и восемь пар — то есть 4×3 и 4×4. Числа
 * тут не любые: плоский стол кладётся в четыре колонки, и семь пар давали три
 * полных ряда и огрызок из двух карточек. Со второй ступени это горка, и она
 * сразу вдвое больше: двадцать четыре карточки на двенадцать пар. Двадцать
 * карточек, что были тут раньше, семилетний разбирал не думая — стол выходил
 * на четыре года. Двадцать пар — полный стол, больше на экран не влезает,
 * поэтому расти маджонгу дальше некуда и ступень тут упирается в потолок.
 */
export const MAHJONG_PAIRS: readonly number[] = [6, 8, 12, 16, 20];

/**
 * С какой ступени «Найди пару» становится настоящим маджонгом.
 *
 * На первых ступенях все карточки лежат в один слой: ребёнок просто ищет пары.
 * Дальше часть карточек ложится сверху, и начинает работать правило маджонга —
 * взять можно только ту, что ничем не накрыта.
 */
export const MAHJONG_STACKED_FROM = 2;

/**
 * Ступени «Запомни пары»: сколько групп, по скольку карточек и в сколько колонок.
 *
 * Таблица росла по одной карточке и дважды топталась на месте (6, 6, 8, 8):
 * два круга подряд выглядели одинаково, и ребёнок справедливо не видел, что
 * стало труднее. Теперь каждая строка больше предыдущей.
 *
 * `columns` тут же, а не считается из числа карточек: четыре колонки на
 * двадцать четыре карточки дают шесть рядов, они не влезают в панель по
 * высоте, и карточка усыхает. Ширины же вокруг было пусто — вот её и берём.
 *
 * `group` — по скольку карточек собирают вместе. Тройки стоят последними
 * нарочно: встретить знакомый значок в тройке легче (их три, а не два), но
 * держать в голове надо не «где лежит вторая», а «где лежат две» — и на
 * ребёнке это читается как самое трудное, что тут есть.
 */
export interface MemoryLevel {
  /** Сколько одинаковых наборов на столе. */
  groups: number;
  /** По скольку карточек в наборе: двойки, а наверху тройки. */
  group: number;
  columns: number;
}

export const MEMORY_LEVELS: readonly MemoryLevel[] = [
  { groups: 6, group: 2, columns: 4 },
  { groups: 8, group: 2, columns: 4 },
  { groups: 10, group: 2, columns: 5 },
  { groups: 12, group: 2, columns: 6 },
  { groups: 9, group: 3, columns: 6 },
  { groups: 10, group: 3, columns: 6 },
];

/** Seed судоку для варианта: какое именно поле — от варианта, а не от ступени. */
export const SUDOKU_SEEDS: readonly number[] = [
  4201, 9317, 5508, 7724, 3366, 6143, 2879, 8052, 1764, 9630, 4488, 7215,
];

/**
 * Судоку по ступени: сторона поля и сколько клеток открыто.
 *
 * 4×4 из четырёх значков семилетний разбирает не думая, и убавлять подсказки
 * там можно недолго — поле маленькое. Настоящий запас даёт 6×6: шесть значков,
 * квадраты 3×2, и в ряду их уже не перебрать взглядом. Клетка там мельче
 * (80 px против 118), поэтому 6×6 — про мышь на ноутбуке; габариты держит
 * `art/layout.ts` и тест на нижний порог.
 *
 * `clues` — нижняя граница: если дальше закрывать клетки нельзя без потери
 * единственного решения, открытых останется больше.
 */
export const SUDOKU_LEVELS: readonly { size: number; clues: number }[] = [
  { size: 4, clues: 8 },
  { size: 4, clues: 7 },
  { size: 4, clues: 6 },
  { size: 6, clues: 20 },
  { size: 6, clues: 16 },
];

/** Какое судоку на этой ступени. */
export function sudokuLevel(step: number): { size: number; clues: number } {
  return tier(SUDOKU_LEVELS, step, 0);
}

/** Сколько пар на столе маджонга на этой ступени. */
export function mahjongPairs(step: number): number {
  return tier(MAHJONG_PAIRS, step, 0);
}

/** Горка или плоский стол на этой ступени. */
export function mahjongStacked(step: number): boolean {
  return Math.round(step) >= MAHJONG_STACKED_FROM;
}

/** Какой стол «Запомни пары» на этой ступени. */
export function memoryLevel(step: number): MemoryLevel {
  return tier(MEMORY_LEVELS, step, 0);
}

/** Что лежит на столе «Запомни пары»: какие значки и в каком порядке. */
export interface MemoryDeal {
  /** Индексы в `CARD_ICONS` — по одному на набор. */
  icons: readonly number[];
  /** Номер набора в каждой клетке стола, по порядку. */
  layout: readonly number[];
}

/**
 * Расклад «Запомни пары» для узла.
 *
 * Лежит тут, а не в сцене, по той же причине, по которой тут лежит поле
 * судоку: иначе «у двух узлов один и тот же стол» нельзя проверить тестом.
 * Один `rng` на выбор значков и на порядок — порознь их брать нельзя, поток
 * один, и разделение сменило бы все расклады сразу.
 *
 * Значки берутся из общего запаса, а не всегда с начала списка: расклад у
 * каждого узла и раньше был свой, а набор картинок — один и тот же, и со
 * стороны это читалось как «то же самое».
 */
export function memoryDeal(step: number, variant: number): MemoryDeal {
  const level = memoryLevel(step);
  const rng = makeRng(2000 + Math.max(0, Math.round(variant)) * 41);
  const icons = rng.shuffle(CARD_ICONS.map((_, index) => index)).slice(0, level.groups);
  const symbols: number[] = [];
  for (let group = 0; group < level.groups; group += 1) {
    for (let copy = 0; copy < level.group; copy += 1) symbols.push(group);
  }
  return { icons, layout: rng.shuffle(symbols) };
}

/** Стол маджонга для узла: ступень даёт число пар и горку, вариант — расклад. */
export function mahjongDeal(step: number, variant: number): MahjongBoard {
  return buildMahjongBoard(
    mahjongPairs(step),
    1000 + Math.max(0, Math.round(variant)) * 37,
    mahjongStacked(step),
    CARD_ICONS.length,
  );
}

/**
 * Поле судоку для этого узла.
 *
 * Seed'ов тут должно быть не меньше, чем узлов судоку в квесте: пока их было
 * пять на восемь узлов, варианты 0 и 5 получали ровно одно и то же поле.
 * Что все двенадцать дают разные поля на каждой ступени — проверяет тест,
 * потому что разные seed'ы сами по себе этого не обещают.
 */
export function sudokuSeed(variant: number): number {
  return SUDOKU_SEEDS[Math.max(0, Math.round(variant)) % SUDOKU_SEEDS.length] ?? 4201;
}

/** Какой длины слова на этой ступени. */
export function wordTierIndex(step: number): number {
  const last = WORD_TIERS.length - 1;
  return Math.min(last, Math.max(0, Math.floor(Math.max(0, step) / 3)));
}

/**
 * Слова для узла: длина — от ступени, какие именно — от варианта.
 *
 * Строку целиком брать нельзя (`tier` на верхней ступени перестаёт слышать
 * вариант, и все узлы получают один набор), поэтому вариант перемешивает
 * слова внутри строки, а берём первые три.
 */
export function wordSet(step: number, variant: number): readonly WordPuzzle[] {
  const row = WORD_TIERS[wordTierIndex(step)] ?? [];
  const rng = makeRng(5300 + wordTierIndex(step) * 6421 + Math.max(0, Math.round(variant)) * 197);
  return rng
    .shuffle(row.map((_, index) => index))
    .slice(0, WORDS_PER_PUZZLE)
    .map((index) => row[index]);
}

/**
 * Ступени викторины: сколько вопросов и сколько картинок на выбор.
 *
 * Раньше ступень меняла только набор вопросов — трудность оставалась та же,
 * и со стороны это выглядело как «уровни ни на что не влияют». Теперь растёт
 * и длина, и выбор: три картинки угадываются тыком, пять — уже нет.
 *
 * Пять вопросов — потолок: ряд точек над панелью на большее не рассчитан,
 * а пять картинок — потолок по ширине панели (проверено `quizOptionSpot`).
 */
export interface QuizLevel {
  questions: number;
  options: number;
}

export const QUIZ_LEVELS: readonly QuizLevel[] = [
  { questions: 3, options: 3 },
  { questions: 3, options: 4 },
  { questions: 4, options: 4 },
  { questions: 4, options: 5 },
  { questions: 5, options: 5 },
];

export interface QuizTask {
  questions: readonly QuizQuestion[];
  /** Сколько картинок показать под вопросом, считая правильную. */
  options: number;
}

/**
 * Какая строка `QUIZ_TIERS` в ходу на этой ступени.
 *
 * Делим пополам нарочно: ступень доходит до девяти, строк три, и без
 * деления ребёнок перескакивал бы на самые трудные вопросы со второго узла.
 */
export function quizTierIndex(step: number): number {
  const last = QUIZ_TIERS.length - 1;
  return Math.min(last, Math.max(0, Math.floor(Math.max(0, step) / 2)));
}

/**
 * Вопросы для узла: трудность — от ступени, какие именно — от варианта.
 *
 * Вариант у каждого узла свой (`seen[kind]` при сборке кругов), поэтому
 * перемешивание даёт разные вопросы на разных узлах. Так и чинится то, из-за
 * чего всё это переписано: раньше узел брал готовый набор из трёх вопросов,
 * и на верхних ступенях окно упиралось в последний набор — один и тот же.
 *
 * Два вопроса с одним ответом в один узел не попадают: подряд «что пинают»
 * и «что должно попасть в ворота» с одной и той же картинкой читаются как
 * повтор, даже когда спрошено разное.
 */
export function quizTask(step: number, variant: number): QuizTask {
  const level = tier(QUIZ_LEVELS, step, 0);
  const row = QUIZ_TIERS[quizTierIndex(step)] ?? [];
  const rng = makeRng(9100 + quizTierIndex(step) * 7919 + Math.max(0, Math.round(variant)) * 131);

  const questions: QuizQuestion[] = [];
  const answered = new Set<string>();
  for (const index of rng.shuffle(row.map((_, i) => i))) {
    const question = row[index];
    if (question === undefined || answered.has(question.answer)) continue;
    answered.add(question.answer);
    questions.push(question);
    if (questions.length === level.questions) break;
  }
  return { questions, options: level.options };
}
