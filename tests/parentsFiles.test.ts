/**
 * Что угол взрослых делает с файлами (design 001, раздел 9): выбранный файл, три скачивания
 * и сводка перед заменой. Всё это без Phaser — меню только вызывает и показывает.
 *
 * Тихие поломки тут две: файл читается целиком раньше, чем его размер проверен (случайный
 * гигабайт из «Загрузок» зависит вкладку), и отчёт, который сам теряет `storage`. Хранилище —
 * `tests/memoryStorage.ts`.
 */
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  PARENTS_MENU,
  PARENTS_TEXT,
  REFUSED_TITLE_LINES,
  SUMMARY_QUESTION_LINES,
  estimateLines,
  parentsAnswerRects,
  refusedBlockLines,
  summaryBlockLines,
} from '../src/art/parentsLayout';
import { GAME_HEIGHT } from '../src/config';
import { CONFIG } from '../src/config';
import { SAVE_PREFIX as P, SERVICE_KEYS, SPECS } from '../src/systems/saveKeys';
import { PROGRESS_KIND } from '../src/systems/saveFile';
import {
  backupDownload,
  backupFileName,
  progressDownload,
  readPickedFile,
  reportDownload,
  summaryParts,
  hasBackupFile,
  hasCrashReport,
} from '../src/systems/parentsFiles';
import { REFUSED_REASON, REFUSED_TITLE } from '../src/systems/saveFile';
import { rolledBackAtOpen } from '../src/systems/openStatus';
import { clearHeldBack, openStore } from '../src/systems/saveStore';
import { eraseAllProgress } from '../src/systems/eraseAll';
import { installMemoryStorage, type MemoryStorage } from './memoryStorage';

let storage: MemoryStorage;
beforeEach(() => {
  installMemoryStorage();
  openStore();
  storage = installMemoryStorage();
  clearHeldBack();
});

const NOW = new Date(2026, 10, 7, 9, 5, 0);
const SOLVED = JSON.stringify(['q1', 'q2']);

function goodFile(): string {
  return JSON.stringify({
    kind: PROGRESS_KIND,
    format: 2,
    game: '1.2.0',
    savedAt: '2026-11-06T11:32:05.000Z',
    keys: { [SPECS.solved.key]: SOLVED },
  });
}

/** Файл, у которого считают, сколько раз его прочли. */
function pickedFile(text: string, size = text.length): { size: number; reads: number; text: () => Promise<string> } {
  const file = {
    size,
    reads: 0,
    text: (): Promise<string> => {
      file.reads += 1;
      return Promise.resolve(text);
    },
  };
  return file;
}

describe('выбранный файл: размер смотрят раньше, чем читают', () => {
  it('больше предела — отказ «слишком большой», а читать файл не начали', async () => {
    const file = pickedFile(goodFile(), CONFIG.save.fileMaxBytes + 1);
    const verdict = await readPickedFile(file);
    expect(verdict).toEqual({ ok: false, reason: 'too-big' });
    expect(file.reads).toBe(0);
  });

  it('ровно предел — читается и проходит как обычный файл', async () => {
    const file = pickedFile(goodFile(), CONFIG.save.fileMaxBytes);
    const verdict = await readPickedFile(file);
    expect(file.reads).toBe(1);
    expect(verdict.ok).toBe(true);
  });

  it('файл, который не удалось прочесть, — «обрезан или испорчен», а не вылет', async () => {
    const verdict = await readPickedFile({
      size: 10,
      text: () => Promise.reject(new Error('диск ушёл')),
    });
    expect(verdict).toEqual({ ok: false, reason: 'not-json' });
  });

  it('проверка хранилища не трогает: после отказа и после «да» оно то же', async () => {
    storage.setItem(SPECS.solved.key, SOLVED);
    const before = storage.dump();
    await readPickedFile(pickedFile('{ нет', 5));
    await readPickedFile(pickedFile(goodFile()));
    expect(storage.dump()).toBe(before);
  });
});

describe('скачивание прогресса', () => {
  it('имя с датой, текст — файл, который проходит собственную проверку', async () => {
    storage.setItem(SPECS.solved.key, SOLVED);
    openStore();
    const got = progressDownload('1.2.0', NOW);
    if (!got.ok) throw new Error('должно скачаться');
    expect(got.file.name).toBe('diplodok-progress-2026-11-07.json');
    const verdict = await readPickedFile(pickedFile(got.file.text));
    expect(verdict.ok && verdict.keys[SPECS.solved.key]).toBe(SOLVED);
  });

  it('в режиме только чтение файла нет: ответ «refused», а не пустой файл', () => {
    storage.setItem(P + 'format', '9');
    storage.setItem(P + 'format-min-writer', '9');
    openStore();
    expect(progressDownload('1.2.0', NOW)).toEqual({ ok: false, why: 'refused' });
  });
});

describe('резервная копия в файл', () => {
  it('нет копии — нечего скачивать; есть — пункт виден', () => {
    expect(hasBackupFile()).toBe(false);
    expect(backupDownload(NOW)).toEqual({ ok: false, why: 'none' });
    storage.setItem(SPECS.solved.key, SOLVED);
    openStore();
    eraseAllProgress();
    expect(hasBackupFile()).toBe(true);
  });

  it('после «Стереть всё» копия — файл, который «Прогресс из файла» принимает и из него возвращает прежнее', async () => {
    storage.setItem(SPECS.solved.key, SOLVED);
    openStore();
    eraseAllProgress();
    const got = backupDownload(NOW);
    if (!got.ok) throw new Error('копия должна быть');
    expect(got.file.name).toMatch(/^diplodok-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const verdict = await readPickedFile(pickedFile(got.file.text));
    expect(verdict.ok && verdict.keys[SPECS.solved.key]).toBe(SOLVED);
    expect(verdict.ok && verdict.file.backupOf).toBeDefined();
  });

  it('имя — по дню, когда копия снята, а не по сегодня; без даты — сегодняшнее', () => {
    expect(backupFileName('2026-11-06T11:32:05.000Z', NOW)).toBe('diplodok-backup-2026-11-06.json');
    expect(backupFileName(undefined, NOW)).toBe('diplodok-backup-2026-11-07.json');
    expect(backupFileName('не дата', NOW)).toBe('diplodok-backup-2026-11-07.json');
  });

  it('копия не разбирается: нечитаемая отдаётся как есть', () => {
    storage.setItem(SERVICE_KEYS.backup, '{ обрезано');
    const got = backupDownload(NOW);
    expect(got.ok && got.file.text).toBe('{ обрезано');
  });
});

describe('отчёт о сбое из угла взрослых (001-86)', () => {
  const record = {
    kind: 'diplodok-report',
    report: 1,
    game: '1.2.0',
    errors: [{ at: 'x', type: 'error', message: 'e2e-crash' }],
    journal: [],
    storage: {} as Record<string, string>,
  };

  it('нет сбоя — нет пункта и нечего скачивать', () => {
    expect(hasCrashReport()).toBe(false);
    expect(reportDownload(NOW)).toEqual({ ok: false, why: 'none' });
  });

  it('storage достраивается свежим снимком, без журнала и самого crash', () => {
    storage.setItem(SERVICE_KEYS.crash, JSON.stringify(record));
    storage.setItem(SERVICE_KEYS.journal, '[]');
    storage.setItem(SPECS.solved.key, SOLVED);
    expect(hasCrashReport()).toBe(true);
    const got = reportDownload(NOW);
    if (!got.ok) throw new Error('отчёт должен быть');
    expect(got.file.name).toBe('diplodok-report-2026-11-07-0905.json');
    const report = JSON.parse(got.file.text) as typeof record;
    expect(report.errors[0]?.message).toBe('e2e-crash');
    expect(report.storage[SPECS.solved.key]).toBe(SOLVED);
    expect(Object.keys(report.storage)).not.toContain(SERVICE_KEYS.crash);
    expect(Object.keys(report.storage)).not.toContain(SERVICE_KEYS.journal);
  });

  it('отчёт не примется как файл прогресса', async () => {
    storage.setItem(SERVICE_KEYS.crash, JSON.stringify(record));
    const got = reportDownload(NOW);
    if (!got.ok) throw new Error('отчёт должен быть');
    expect(await readPickedFile(pickedFile(got.file.text))).toEqual({ ok: false, reason: 'foreign' });
  });

  it('нечитаемый crash отдаётся как есть: лучше сырой, чем никакой', () => {
    storage.setItem(SERVICE_KEYS.crash, '{ обрезано');
    const got = reportDownload(NOW);
    expect(got.ok && got.file.text).toBe('{ обрезано');
  });
});

describe('сводка перед заменой на крайних числах', () => {
  it('в файле и сейчас — своими словами; 48 лесов, 48 узлов, 18 игр читаются целиком', () => {
    const parts = summaryParts(
      { forests: 48, quest: 48, english: 18, backupOf: '2026-11-06T11:32:05.000Z' },
      { forests: 1, quest: 4, english: 0 },
    );
    expect(parts.head).toBe('Резервная копия от 06.11.2026');
    expect(parts.file).toBe('В файле — лесов пройдено: 48, задачек квеста: 48, английских игр: 18.');
    expect(parts.current).toBe('Сейчас — лесов: 1, задачек: 4, игр: 0.');
    expect(parts.question).toBe('Заменить?');
  });

  it('у обычного файла «Резервная копия от» нет', () => {
    const parts = summaryParts({ forests: 3, quest: 17, english: 5 }, { forests: 1, quest: 4, english: 0 });
    expect(parts.head).toBeNull();
  });

  it('дата копии — по местному дню, как в имени файла', () => {
    const parts = summaryParts(
      { forests: 0, quest: 0, english: 0, backupOf: new Date(2026, 0, 5, 23, 59).toISOString() },
      { forests: 0, quest: 0, english: 0 },
    );
    expect(parts.head).toBe('Резервная копия от 05.01.2026');
  });
});

describe('ответ на файл помещается на экран', () => {
  const m = PARENTS_MENU;
  const fits = (r: { panel: { y: number; h: number } }): boolean =>
    r.panel.y >= m.screenMargin && r.panel.y + r.panel.h <= GAME_HEIGHT - m.screenMargin;

  it('сводка на 48 лесах, 48 узлах, 18 играх и копии: панель на экране, текст в блоке', () => {
    const parts = summaryParts(
      { forests: 48, quest: 48, english: 18, backupOf: '2026-11-06T11:32:05.000Z' },
      { forests: 48, quest: 48, english: 18 },
    );
    const text = [parts.head ?? '', parts.file, parts.current].join('\n');
    const rects = parentsAnswerRects(2, summaryBlockLines(text));
    expect(fits(rects)).toBe(true);
    // Строки текста плюс вопрос — ровно столько, сколько отведено блоку.
    expect(rects.block.h).toBe(
      (estimateLines(text, m.answerSize, m.answerWrap) + SUMMARY_QUESTION_LINES) * m.answerLine,
    );
    expect(estimateLines(text, m.answerSize, m.answerWrap)).toBeGreaterThanOrEqual(4);
  });

  it('отказ: заголовок и самая длинная причина — в блоке, панель на экране', () => {
    for (const reason of Object.values(REFUSED_REASON)) {
      const rects = parentsAnswerRects(1, refusedBlockLines(reason));
      expect(fits(rects), reason).toBe(true);
      expect(estimateLines(reason, m.answerSize, m.answerWrap) + REFUSED_TITLE_LINES, reason).toBeLessThanOrEqual(
        rects.block.h / m.answerLine,
      );
    }
    expect(REFUSED_TITLE.length * 40 * m.glyphWidth).toBeLessThanOrEqual(m.answerWrap);
    expect(PARENTS_TEXT.noSpace).toContain('ничего не изменилось');
  });
});

describe('меню взрослых: проводка', () => {
  const menu = readFileSync('src/scenes/parentsMenu.ts', 'utf8');

  it('файл читается только через readPickedFile: размер смотрится до чтения', () => {
    expect(menu).toContain('readPickedFile(');
    expect(menu).not.toMatch(/\.text\(\)/);
  });

  it('окно выбора файла открывается раньше любого await: иначе нет жеста пользователя', () => {
    const body = menu.slice(menu.indexOf('async function chooseFile'));
    const text = body.slice(0, body.indexOf('\n  }\n'));
    const call = text.indexOf('(options.pick ?? pickFile)()');
    expect(call).toBeGreaterThanOrEqual(0);
    expect(call).toBeLessThan(text.indexOf('await'));
  });

  it('«Прошлая замена не удалась»: запуск, который откатил метку, это запоминает; следующий — нет', () => {
    storage.setItem(SPECS.solved.key, SOLVED);
    openStore();
    expect(rolledBackAtOpen()).toBe(false);
    eraseAllProgress();
    const marker = { format: 2, minWriter: 2, reason: 'restore', backup: false, keys: { [SPECS.solved.key]: SOLVED } };
    storage.setItem(SERVICE_KEYS.restore, JSON.stringify(marker));
    storage.failOnWrite(2);
    expect(openStore()).toBe('rolled-back');
    expect(rolledBackAtOpen()).toBe(true);
    expect(openStore()).toBe('ok');
    expect(rolledBackAtOpen()).toBe(false);
  });
});
