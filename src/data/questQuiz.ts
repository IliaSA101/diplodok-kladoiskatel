/**
 * Викторина: таблица вопросов по трудности, ступени и выдача вопросов узлу.
 * Без Phaser; вынесено из `quest.ts` по обязанностям.
 */
import { TEX } from '../art/keys';
import { tier } from './quest';
import { dealFromDeck } from './questDeck';

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

/** Самый длинный набор: на столько вопросов колода делится между узлами. */
const QUIZ_MAX_QUESTIONS = Math.max(...QUIZ_LEVELS.map((level) => level.questions));

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
 * Строка — колода (`questDeck.ts`): перемешана один раз, узел берёт срез по
 * своему варианту, и соседние узлы не делят вопросов. Так чинится то, из-за
 * чего всё это переписано: раньше узел брал готовый набор из трёх вопросов,
 * и на верхних ступенях окно упиралось в последний набор — один и тот же.
 *
 * Два вопроса с одним ответом в один узел не попадают: подряд «что пинают»
 * и «что должно попасть в ворота» с одной и той же картинкой читаются как
 * повтор, даже когда спрошено разное. Колода раскладывает такие вопросы
 * врозь, поэтому пропуск повтора не залезает в срез соседа.
 */
export function quizTask(step: number, variant: number): QuizTask {
  const level = tier(QUIZ_LEVELS, step, 0);
  const index = quizTierIndex(step);
  const questions = dealFromDeck(QUIZ_TIERS[index] ?? [], 9100 + index * 7919, variant, {
    count: level.questions,
    stride: QUIZ_MAX_QUESTIONS,
    key: (question) => question.answer,
  });
  return { questions, options: level.options };
}
