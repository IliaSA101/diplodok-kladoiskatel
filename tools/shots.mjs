/**
 * Свежесть снимков экранов: что правили после того, как в игру смотрели.
 *
 * `npm run shots` печатает отчёт и адрес, который надо открыть. Тот же модуль
 * зовёт хук `.claude/hooks/before-stop.mjs` — он не даёт закончить работу,
 * пока правка сцены не показана на экране. Напоминание тут уже стояло и не
 * помогло: хвост диплодока ушёл в игру обрубком три раза подряд, потому что
 * напоминание можно отложить, а блокировку нельзя.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Что меняет картинку на экране: правка тут требует взгляда. */
const WATCHED = ['src/scenes', 'src/entities', 'src/art', 'public/art'];

/** Куда `?shots` складывает кадры. */
export const SHOTS_DIR = join(ROOT, 'art-work', 'shots');
export const SHOTS_URL = 'http://localhost:5173/diplodok-kladoiskatel/?shots';

function filesUnder(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(path));
    else out.push(path);
  }
  return out;
}

/**
 * Когда в игру смотрели в последний раз, мс. Ноль — ни разу.
 *
 * Метку кладёт middleware из vite.config.ts в самом конце обхода: если обход
 * не доехал, метка остаётся старой, и это правильно.
 */
export function lastLook(root = ROOT) {
  try {
    return statSync(join(root, 'art-work', 'shots', '_stamp.json')).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Отпечатки рисующих файлов: путь от корня → sha1 содержимого.
 *
 * Их кладёт в `_stamp.json` middleware из vite.config.ts в конце обхода.
 * Одного времени правки мало: прогон мутантов подменяет строку и возвращает
 * её, откат недоделанного переписывает файл тем же текстом — время новое,
 * а экран тот же, и хук требовал обход зря (06–07.11 — раз десять подряд).
 */
export function fingerprints(root = ROOT) {
  const out = {};
  for (const watched of WATCHED) {
    for (const path of filesUnder(join(root, watched))) {
      const key = path.slice(root.length + 1).replace(/\\/g, '/');
      out[key] = createHash('sha1').update(readFileSync(path)).digest('hex');
    }
  }
  return out;
}

/** Отпечатки, снятые в конце последнего обхода; пусто — обход их не писал. */
function lookedFingerprints(root) {
  try {
    const stamp = JSON.parse(readFileSync(join(root, 'art-work', 'shots', '_stamp.json'), 'utf8'));
    return stamp !== null && typeof stamp.files === 'object' && stamp.files !== null ? stamp.files : {};
  } catch {
    return {};
  }
}

/**
 * Файлы, которые правили после последнего взгляда, путями от корня проекта.
 *
 * Правкой считается новое время *и* новое содержимое: файл, который после
 * обхода переписали тем же текстом, экран не меняет. Если обход отпечатков
 * не оставил (старая метка), судим по одному времени, как раньше.
 */
export function staleScreens(root = ROOT) {
  const looked = lookedFingerprints(root);
  const candidates = watchedSince(root, lastLook(root));
  if (candidates.length === 0) return candidates;
  const now = fingerprints(root);
  // Чего обход не видел, у того отпечатка нет: undefined ≠ хэш — правка.
  return candidates.filter((path) => looked[path] !== now[path]);
}

/** Что из рисующего правили после момента `since`. */
function watchedSince(root, since) {
  const stale = [];
  for (const watched of WATCHED) {
    for (const path of filesUnder(join(root, watched))) {
      if (statSync(path).mtimeMs > since) {
        stale.push(path.slice(root.length + 1).replace(/\\/g, '/'));
      }
    }
  }
  return stale.sort();
}

/**
 * Шёл ли обход, пока правили файлы.
 *
 * Такой обход врёт: vite перезагружает страницу на каждой правке, обход
 * начинается заново, и часть кадров остаётся от прерванной попытки — экран
 * на них снят на влёте. Один раз так вышел кадр «Что дальше?», где ряд ещё
 * съезжался, а вариантов ответа не было вовсе, хотя экран целый.
 *
 * Считаем по времени: самый ранний кадр — начало обхода, метка — конец.
 * Правка рисующего файла между ними делает весь обход негодным.
 */
export function shotsDisturbed(root = ROOT) {
  const frames = filesUnder(join(root, 'art-work', 'shots')).filter((path) =>
    path.endsWith('.png'),
  );
  if (frames.length === 0) return [];
  const started = Math.min(...frames.map((path) => statSync(path).mtimeMs));
  const ended = lastLook(root);
  if (ended <= started) return [];
  return watchedSince(root, started).filter(
    (path) => statSync(join(root, path)).mtimeMs < ended,
  );
}


// Сравнивать пути строками тут нельзя: на Windows argv[1] — это `D:\…`,
// и самодельный `file://` выходит с двумя косыми вместо трёх.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const stale = staleScreens();
  const since = lastLook();
  if (since === 0) console.log('В игру ещё ни разу не смотрели этим способом.');
  else console.log(`Последний взгляд: ${new Date(since).toLocaleString('ru-RU')}`);
  const disturbed = shotsDisturbed();
  if (disturbed.length > 0) {
    console.log(`
Обход шёл, пока правили ${disturbed.length} файл(ов) — кадрам верить нельзя:`);
    for (const path of disturbed.slice(0, 10)) console.log(`  ${path}`);
    console.log(`
Прогнать заново, ничего не правя:
  ${SHOTS_URL}`);
  }
  if (stale.length === 0) {
    console.log('Снимки свежие: после них ничего рисующего не правили.');
  } else {
    console.log(`\nПравили после взгляда (${stale.length}):`);
    for (const path of stale.slice(0, 20)) console.log(`  ${path}`);
    if (stale.length > 20) console.log(`  … и ещё ${stale.length - 20}`);
    console.log(`\nОткрыть при запущенном npm run dev:\n  ${SHOTS_URL}`);
    console.log(`Кадры лягут в art-work/shots/ — 1280×720, их и смотреть.`);
  }
}
