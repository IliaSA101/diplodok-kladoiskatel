/**
 * Карта футбольного квеста: восемь узлов-задачек на дорожке по полю.
 * Диплодок стоит у последнего решённого узла, по тапу на любой узел идёт к нему
 * по дорожке и запускает задачку. Застрять нельзя: все узлы открыты всегда.
 *
 * Кругов три, и все они проходят по одной и той же дорожке: на экране всегда
 * восемь узлов — узлы одного круга. Круг открывается сам, когда предыдущий
 * собран, а вернуться в любой можно по кнопкам-кругам в правом верхнем углу.
 */
import Phaser from 'phaser';
import { CONFIG, GAME_HEIGHT, GAME_WIDTH } from '../config';
import { MAP_DINO, MAP_NODE, ROUND_PICKER, roundPickerSpot, roundResetSpot } from '../art/layout';
import { PALETTE } from '../art/palette';
import { TEX } from '../art/keys';
import { createBackButton, createPanel, createRoundButton, createText } from '../art/ui';
import { audio } from '../audio/AudioEngine';
import { Diplodocus } from '../entities/Diplodocus';
import { MapWalker, type WalkingDino } from '../entities/MapWalker';
import { QUEST_NODES, ROUND_COUNT, roundNodes } from '../data/quest';
import { skillSave } from '../systems/skill';
import type { PuzzleKind, QuestNode } from '../data/quest';
import { askConfirm } from '../systems/confirm';
import { onEscape } from '../systems/quest';
import { questSave } from '../systems/questSave';
import type { PuzzleSceneData } from '../systems/quest';
import { pathBetween, pathLength, trackSegments } from '../systems/questTrack';
import type { Pt } from '../systems/questTrack';
import { SCENE } from '../types';

/** Диаметр круга узла и радиус зоны касания (диаметр зоны 128 px). */
const NODE_DIAMETER = MAP_NODE.diameter;
const NODE_HIT_RADIUS = 64;
const NODE_ICON_SIZE = 62;

/** Диплодок на карте мельче, чем в лесу, чтобы не закрывать соседние узлы. */
const DINO_SCALE = 0.6;

/** Шаг точек-«следов» на дорожке, px. */
const PATH_STEP = 38;
/** Время пути, мс: пропорционально длине, но в пределах 0.4–1.2 с. */
const WALK_MS_PER_PX = 2.2;
const WALK_MS_MIN = 400;
const WALK_MS_MAX = 1200;

/** Слои: фон < дорожка < узлы < диплодок < интерфейс. */
const DEPTH_PATH = 1;
const DEPTH_NODE = 10;
const DEPTH_DINO = 11;
const DEPTH_UI = 20;

const KIND_SCENE: Record<PuzzleKind, string> = {
  sudoku: SCENE.PUZZLE_SUDOKU,
  mahjong: SCENE.PUZZLE_MAHJONG,
  word: SCENE.PUZZLE_WORD,
  quiz: SCENE.PUZZLE_QUIZ,
  memory: SCENE.PUZZLE_MEMORY,
  count: SCENE.PUZZLE_COUNT,
  pattern: SCENE.PUZZLE_PATTERN,
  sequence: SCENE.PUZZLE_SEQUENCE,
};

/**
 * Буква поверх значка узла: плашка маджонга, Memory и «Собери слово» — это
 * одна и та же плитка, и без пометки ребёнок не видит, куда идёт.
 */
const KIND_MARK: Partial<Record<PuzzleKind, string>> = {
  word: 'А',
  count: '+',
};

const KIND_ICON: Record<PuzzleKind, string> = {
  sudoku: TEX.FOOT[3],
  mahjong: TEX.CARD_BACK,
  word: TEX.LETTER_TILE,
  quiz: TEX.FOOT[2],
  memory: TEX.CARD_DOWN,
  count: TEX.LETTER_TILE,
  pattern: TEX.FOOT[6],
  sequence: TEX.FOOT[9],
};

/** Запуск карты: без номера — открываем круг, который сейчас идёт. */
export interface QuestMapSceneData {
  round?: number;
}

/** Круг, который сейчас идёт: первый, где есть нерешённый узел. */
function currentRound(): number {
  const solved = new Set(questSave.solvedNodes());
  const next = QUEST_NODES.find((node) => !solved.has(node.id));
  return next === undefined ? ROUND_COUNT : next.round;
}

function clampRound(round: number): number {
  return Math.min(ROUND_COUNT, Math.max(1, Math.round(round)));
}

type NodeState = 'solved' | 'next' | 'calm';

const STATE_COLORS: Record<NodeState, { main: number; dark: number }> = {
  solved: { main: PALETTE.gold, dark: PALETTE.goldDark },
  next: { main: PALETTE.uiButton, dark: PALETTE.uiButtonDark },
  calm: { main: PALETTE.uiButtonCalm, dark: PALETTE.uiButtonCalmDark },
};

/** Вписать картинку в квадрат size×size, сохранив пропорции. */
function fitImage(image: Phaser.GameObjects.Image, size: number): void {
  image.setScale(size / Math.max(image.width, image.height, 1));
}

export class QuestMapScene extends Phaser.Scene {
  /** Какой круг показан, 1…ROUND_COUNT. */
  private round = 1;
  /** Узлы показанного круга — восемь штук. */
  private nodes: readonly QuestNode[] = [];
  private dino: WalkingDino | null = null;
  /** Индекс узла, у которого сейчас стоит диплодок. */
  private dinoNode = 0;
  /** Идёт переход (диплодок шагает или уже уходим со сцены) — тапы игнорируются. */
  private busy = false;
  /** Точки дорожки между узлом i и i+1 (с обоими концами). */
  private segments: Pt[][] = [];
  /** Невидимая точка, которую двигают твины, а диплодок следует за ней. */
  private walker: Pt = { x: 0, y: 0 };
  private keyBack: (() => void) | null = null;

  constructor() {
    super(SCENE.QUEST_MAP);
  }

  init(data: QuestMapSceneData = {}): void {
    this.round = clampRound(data.round ?? currentRound());
    this.nodes = roundNodes(this.round);
    this.dino = null;
    this.dinoNode = 0;
    this.busy = false;
    this.segments = [];
    this.walker = { x: 0, y: 0 };
    this.keyBack = null;
  }

  create(): void {
    const solved = new Set(questSave.solvedNodes());
    const complete = questSave.isComplete();
    const nextIndex = this.nodes.findIndex((node) => !solved.has(node.id));

    this.drawBackground();
    this.segments = trackSegments(this.nodes, PATH_STEP);
    this.drawPath();

    this.nodes.forEach((node, index) => {
      const state: NodeState = solved.has(node.id) ? 'solved' : index === nextIndex ? 'next' : 'calm';
      this.createNode(node, index, state);
    });

    // Диплодок стоит у последнего (по порядку) решённого узла круга или у первого.
    let startIndex = 0;
    this.nodes.forEach((node, index) => {
      if (solved.has(node.id)) startIndex = index;
    });
    this.dinoNode = startIndex;
    const start = this.nodes[startIndex] ?? { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };
    // Рисованный диплодок, если лист пришёл; иначе собранный из частей.
    const dino: WalkingDino = this.textures.exists(TEX.DINO_WHOLE)
      ? new MapWalker(this, start.x + MAP_DINO.offsetX, start.y + MAP_DINO.offsetY)
      : new Diplodocus(this, start.x + MAP_DINO.offsetX, start.y + MAP_DINO.offsetY, {
          scale: DINO_SCALE,
        });
    dino.showHint(false);
    dino.root.setDepth(DEPTH_DINO);
    this.dino = dino;

    this.createCounter(Math.min(solved.size, QUEST_NODES.length), complete);
    this.createRoundPicker(solved);
    this.createRoundReset(solved);
    if (complete) this.createCelebration();
    this.createButtons();

    // iOS Safari: звук разблокируется только жестом пользователя.
    this.input.once(Phaser.Input.Events.POINTER_DOWN, () => audio.unlock());
    const keyboard = this.input.keyboard;
    if (keyboard !== null) {
      this.keyBack = () => this.goTo(SCENE.START);
      onEscape(this, this.keyBack);
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killAll();
      this.time.removeAllEvents();
      if (this.keyBack !== null) this.input.keyboard?.off('keydown-ESC', this.keyBack);
      this.keyBack = null;
      this.dino?.destroy();
      this.dino = null;
    });
  }

  override update(time: number, delta: number): void {
    this.dino?.update(time, delta);
  }

  // ---------------------------------------------------------------------------
  // Дорожка
  // ---------------------------------------------------------------------------

  /** Толстая светлая дорожка и кружки-«следы» вдоль неё. */
  private drawPath(): void {
    const g = this.add.graphics().setDepth(DEPTH_PATH);
    for (const points of this.segments) {
      g.lineStyle(30, PALETTE.uiPanelShadow, 0.5);
      g.strokePoints(points, false, false);
      g.lineStyle(22, PALETTE.uiPanel, 0.75);
      g.strokePoints(points, false, false);
    }
    // Следы: пропускаем крайние точки — там узлы.
    g.fillStyle(PALETTE.soilLight, 0.85);
    for (const points of this.segments) {
      for (let s = 1; s < points.length - 1; s += 1) {
        const p = points[s];
        g.fillCircle(p.x, p.y, 5.5);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Узлы
  // ---------------------------------------------------------------------------

  private createNode(node: QuestNode, index: number, state: NodeState): void {
    const colors = STATE_COLORS[state];
    // Три слоя: внешний — нажатие, внутренний — пульсация (твины не мешают друг другу).
    const body = this.add.container(0, 0);
    const pulse = this.add.container(0, 0, [body]);
    const press = this.add.container(0, 0, [pulse]);

    // Белое кольцо с тенью: на рисованном поле круги сливались с фоном,
    // а по кольцу узел виден на любой картинке.
    const ringRadius = NODE_DIAMETER / 2 + 7;
    body.add([
      this.add.circle(0, 7, ringRadius, 0x1d2d1a, 0.3),
      this.add.circle(0, 0, ringRadius, 0xffffff, 0.95),
    ]);

    if (this.textures.exists(TEX.NODE_DISC)) {
      // Готовый арт круга: красим в цвет состояния.
      const disc = this.add.image(0, 0, TEX.NODE_DISC).setTint(colors.main);
      disc.setDisplaySize(NODE_DIAMETER, NODE_DIAMETER);
      body.add(disc);
    } else {
      const r = NODE_DIAMETER / 2;
      const shadow = this.add.circle(0, 6, r, colors.dark);
      const main = this.add.circle(0, 0, r, colors.main);
      main.setStrokeStyle(5, colors.dark);
      const shine = this.add.ellipse(0, -r * 0.52, r * 1.15, r * 0.5, 0xffffff, 0.3);
      body.add([shadow, main, shine]);
    }

    const icon = this.add.image(0, 0, KIND_ICON[node.kind]);
    fitImage(icon, NODE_ICON_SIZE);
    body.add(icon);

    const mark = KIND_MARK[node.kind];
    if (mark !== undefined) body.add(createText(this, 0, -2, mark, 44, PALETTE.uiText));

    if (state === 'solved') {
      // Наклейка-награда в верхнем левом углу круга.
      const sticker = this.add.image(MAP_NODE.stickerDx, MAP_NODE.stickerDy, node.sticker);
      fitImage(sticker, MAP_NODE.sticker);
      sticker.setAngle(-MAP_NODE.stickerAngle);
      body.add(sticker);
    }

    const container = this.add.container(node.x, node.y, [press]).setDepth(DEPTH_NODE);
    container.setInteractive({
      hitArea: new Phaser.Geom.Circle(0, 0, NODE_HIT_RADIUS),
      hitAreaCallback: Phaser.Geom.Circle.Contains,
      useHandCursor: true,
    });
    container.on(Phaser.Input.Events.POINTER_DOWN, () => {
      if (this.busy) return;
      audio.unlock();
      audio.play('tap');
      this.tweens.add({ targets: press, scale: 0.9, duration: 90, yoyo: true, ease: 'Sine.easeOut' });
      this.walkTo(index);
    });

    if (state === 'next') {
      this.tweens.add({
        targets: pulse,
        scale: 1.09,
        duration: 800,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Ходьба диплодока
  // ---------------------------------------------------------------------------

  /** Диплодок идёт к узлу по точкам дорожки, затем запускается задачка. */
  private walkTo(index: number): void {
    const dino = this.dino;
    if (dino === null || this.busy) return;
    this.busy = true;

    const node = this.nodes[index];
    if (node === undefined) return;
    const path = pathBetween(this.segments, this.dinoNode, index);

    const launch = (): void => {
      this.dinoNode = index;
      // Ступень: круг задаёт нижнюю границу, остальное ребёнок набрал сам.
      const data: PuzzleSceneData = {
        nodeId: node.id,
        variant: node.variant,
        sticker: node.sticker,
        kind: node.kind,
        step: node.round - 1 + skillSave.of(node.kind),
      };
      this.scene.start(KIND_SCENE[node.kind], data);
    };

    // Уже стоим у этого узла — радуемся и сразу открываем задачку.
    if (path.length < 2) {
      dino.playJoy();
      this.time.delayedCall(450, launch);
      return;
    }

    const length = pathLength(path);
    const totalMs = Phaser.Math.Clamp(length * WALK_MS_PER_PX, WALK_MS_MIN, WALK_MS_MAX);

    const first = path[0];
    this.walker = { x: first.x, y: first.y };
    dino.setPosition(first.x + MAP_DINO.offsetX, first.y + MAP_DINO.offsetY);
    dino.setWalking(true, (path[1]).x - first.x);

    // Последовательные твины от точки к точке; время каждого пропорционально длине шага.
    const step = (i: number): void => {
      const current = this.dino;
      if (current === null) return;
      if (i >= path.length) {
        current.setWalking(false);
        this.time.delayedCall(180, launch);
        return;
      }
      const from = path[i - 1];
      const to = path[i];
      const dist = Math.hypot(to.x - from.x, to.y - from.y);
      if (Math.abs(to.x - from.x) > 0.5) current.setWalking(true, to.x - from.x);
      this.tweens.add({
        targets: this.walker,
        x: to.x,
        y: to.y,
        duration: Math.max(16, (totalMs * dist) / length),
        ease: 'Linear',
        onUpdate: () =>
          current.setPosition(
            this.walker.x + MAP_DINO.offsetX,
            this.walker.y + MAP_DINO.offsetY,
          ),
        onComplete: () => step(i + 1),
      });
    };
    step(1);
  }

  // ---------------------------------------------------------------------------
  // Интерфейс
  // ---------------------------------------------------------------------------

  /**
   * Сверху: «N из 24» крупно и ряд точек этого круга (решённые золотые).
   * Точки — только по текущему кругу: двадцать четыре в ряд не влезают,
   * а восемь показывают ровно то, что ребёнок сейчас видит на дорожке.
   */
  private createCounter(solvedCount: number, complete: boolean): void {
    const total = QUEST_NODES.length;
    const centerX = GAME_WIDTH / 2;
    const panelW = 420;
    const panelH = 128;
    const panelY = CONFIG.ui.padding + panelH / 2 - 8;
    createPanel(this, centerX, panelY, panelW, panelH).setDepth(DEPTH_UI);

    createText(this, centerX, panelY - 22, `${solvedCount} из ${total}`, CONFIG.ui.fontSizeBig, PALETTE.uiText)
      .setDepth(DEPTH_UI + 1);

    const solved = new Set(questSave.solvedNodes());
    const dotStep = 40;
    const count = this.nodes.length;
    this.nodes.forEach((node, i) => {
      const isSolved = solved.has(node.id);
      const dot = this.add.circle(
        centerX + (i - (count - 1) / 2) * dotStep,
        panelY + 36,
        11,
        isSolved ? PALETTE.gold : PALETTE.uiButtonCalm,
      );
      dot.setStrokeStyle(3, isSolved ? PALETTE.goldDark : PALETTE.uiButtonCalmDark);
      dot.setDepth(DEPTH_UI + 1);
    });

    if (complete) {
      // Слева: справа стоят круги-кнопки.
      const hooray = createText(this, centerX - panelW / 2 - 130, panelY, 'Ура!', 84, PALETTE.gold);
      hooray.setDepth(DEPTH_UI + 1);
      this.tweens.add({
        targets: hooray,
        scale: 1.12,
        angle: 4,
        duration: 650,
        ease: 'Sine.easeInOut',
        yoyo: true,
        repeat: -1,
      });
    }
  }

  /** Весь квест пройден: салют из конфетти сверху. */
  private createCelebration(): void {
    const third = GAME_WIDTH / 3;
    TEX.CONFETTI.forEach((key, i) => {
      const emitter = this.add.particles(0, -30, key, {
        x: { min: i * third, max: (i + 1) * third },
        lifespan: 4000,
        frequency: 140,
        quantity: 1,
        speedY: { min: 120, max: 210 },
        speedX: { min: -40, max: 40 },
        rotate: { start: 0, end: i % 2 === 0 ? 360 : -360 },
        scale: { min: 0.7, max: 1.1 },
        alpha: { start: 1, end: 0.7 },
      });
      emitter.setDepth(DEPTH_UI + 2);
    });
  }

  /**
   * Круги в правом верхнем углу: какой идёт, какие собраны, куда вернуться.
   * Собранный круг золотой, текущий — тёплый и крупнее, остальные тихие.
   * Раскладка в два ряда по три живёт в layout.ts: её проверяет тест.
   */
  private createRoundPicker(solved: ReadonlySet<string>): void {
    const radius = ROUND_PICKER.radius;

    for (let round = 1; round <= ROUND_COUNT; round += 1) {
      const done = roundNodes(round).every((node) => solved.has(node.id));
      const here = round === this.round;
      const colors = done ? STATE_COLORS.solved : here ? STATE_COLORS.next : STATE_COLORS.calm;
      const { x, y } = roundPickerSpot(round);

      const circle = this.add.circle(0, 0, radius, colors.main).setStrokeStyle(5, colors.dark);
      const label = createText(this, 0, -2, String(round), 40, PALETTE.uiText);
      const button = this.add.container(x, y, [circle, label]).setDepth(DEPTH_UI + 1);
      button.setSize(radius * 2, radius * 2);
      if (here) {
        button.setScale(1.14);
        continue;
      }
      button.setInteractive({ useHandCursor: true });
      button.on(Phaser.Input.Events.POINTER_DOWN, () => {
        if (this.busy) return;
        audio.unlock();
        audio.play('tap');
        this.busy = true;
        const data: QuestMapSceneData = { round };
        this.scene.start(SCENE.QUEST_MAP, data);
      });
    }
  }

  /**
   * «Этот круг заново» — под кнопками кругов.
   *
   * Решённые узлы круга и их наклейки забываются, остальные круги целы:
   * откат нужен точечный, а не «стереть всё и начать сначала».
   */
  private createRoundReset(solved: ReadonlySet<string>): void {
    const nodes = this.nodes;
    if (!nodes.some((node) => solved.has(node.id))) return;

    const radius = ROUND_PICKER.radius;
    const { x, y } = roundResetSpot(ROUND_COUNT);
    const round = this.round;
    const button = createRoundButton(
      this,
      x,
      y,
      TEX.ICON_AGAIN,
      () => {
        if (this.busy) return;
        askConfirm(this, {
          question: `Круг ${round} заново?`,
          icon: TEX.ICON_AGAIN,
          onYes: () => {
            questSave.resetNodes(nodes);
            const data: QuestMapSceneData = { round };
            this.scene.restart(data);
          },
        });
      },
      { radius, tone: 'calm' },
    );
    button.container.setDepth(DEPTH_UI + 1);
  }

  /** Альбом — внизу справа, назад — вверху слева: внизу слева стоит диплодок. */
  private createButtons(): void {
    const radius = CONFIG.ui.buttonRadius;
    const y = GAME_HEIGHT - CONFIG.ui.padding - radius;

    const album = createRoundButton(
      this,
      GAME_WIDTH - CONFIG.ui.padding - radius,
      y,
      TEX.ICON_BACKPACK,
      () => this.goTo(SCENE.ALBUM),
      { radius },
    );
    album.container.setDepth(DEPTH_UI);

    const back = createBackButton(this, () => this.goTo(SCENE.START));
    back.container.setDepth(DEPTH_UI);
  }

  private goTo(target: string): void {
    if (this.busy) return;
    this.busy = true;
    audio.unlock();
    this.scene.start(target);
  }

  // ---------------------------------------------------------------------------
  // Фон
  // ---------------------------------------------------------------------------

  /** Готовый арт на весь экран или процедурное поле с полосками газона. */
  private drawBackground(): void {
    if (this.textures.exists(TEX.QUEST_MAP_BG)) {
      this.add
        .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, TEX.QUEST_MAP_BG)
        .setDisplaySize(GAME_WIDTH, GAME_HEIGHT)
        .setDepth(-10);
      // Светлая вуаль приглушает детали рисунка, чтобы узлы и дорожка читались.
      this.add
        .rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0.2)
        .setOrigin(0, 0)
        .setDepth(-9);
      return;
    }

    // Готовый газон: мостим им весь экран, полоски уже нарисованы на плитке.
    if (this.textures.exists(TEX.PITCH_TILE)) {
      this.add
        .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, TEX.PITCH_TILE)
        .setOrigin(0, 0)
        .setDepth(-10);
      return;
    }

    const g = this.add.graphics().setDepth(-10);
    g.fillStyle(PALETTE.grassMid, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    // Полосы газона, как после покоса.
    const stripe = 90;
    g.fillStyle(PALETTE.grassLight, 0.55);
    for (let x = 0; x < GAME_WIDTH; x += stripe * 2) {
      g.fillRect(x, 0, stripe, GAME_HEIGHT);
    }
    // Тёмная кайма по краям поля.
    g.fillStyle(PALETTE.grassDark, 0.8);
    g.fillRect(0, 0, GAME_WIDTH, 14);
    g.fillRect(0, GAME_HEIGHT - 14, GAME_WIDTH, 14);

    // Пара деревьев по краям, если текстуры уже готовы.
    if (this.textures.exists(TEX.TREE[0])) {
      this.add.image(52, GAME_HEIGHT - 6, TEX.TREE[0]).setOrigin(0.5, 1).setScale(0.8).setDepth(-9);
    }
    if (this.textures.exists(TEX.TREE[1])) {
      this.add.image(GAME_WIDTH - 52, GAME_HEIGHT - 6, TEX.TREE[1]).setOrigin(0.5, 1).setScale(0.8).setDepth(-9);
    }
  }
}
