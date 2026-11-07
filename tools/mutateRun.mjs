/**
 * Ход прогона мутаций. Вызывается из `tools/mutate.mjs`; чистые правила
 * (ключ кеша, замок, пути копий) живут в `tools/mutateLib.mjs` под тестом.
 *
 * Мутант портит файл не в рабочем дереве, а в одной из K копий проекта в
 * `<tmp>/diplodok-mutate-<хеш>/w<i>/` (не в node_modules: там `vitest related` слеп): пока идёт прогон, исходники свободны,
 * а время правки файлов (его смотрит хук before-stop) не сдвигается.
 */
import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Snapshot,
  acquireLock,
  assertCopyDir,
  cacheDir,
  copyDirs,
  failedFiles,
  mutantKey,
} from './mutateLib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const COPY_DIRS = ['src', 'tests', 'tools', 'public'];
const COPY_FILES = ['index.html', 'package.json', 'tsconfig.json', 'vite.config.ts', 'vitest.config.ts'];
/** Прогон дольше этого — мутант завесил тесты (бесконечный цикл): считаем пойманным. */
const HANG_MS = 180_000;

/** Разбор командной строки: `[фильтр] [--jobs N] [--workers N] [--list файл]`. */
export function parseArgs(argv) {
  const out = { filter: '', jobs: 4, workers: 0, list: 'tools/mutants.json' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--jobs') out.jobs = Number(argv[++i]);
    else if (a === '--workers') out.workers = Number(argv[++i]);
    else if (a === '--list') out.list = argv[++i];
    else if (!a.startsWith('--')) out.filter = a;
    else throw new Error(`Неизвестный флаг ${a}`);
  }
  if (!Number.isInteger(out.jobs) || out.jobs < 1) throw new Error('--jobs: целое число от 1');
  if (!out.workers) out.workers = Math.max(1, Math.floor(availableParallelism() / out.jobs));
  return out;
}

const children = new Set();

/**
 * Убить vitest вместе с его рабочими процессами: мутант с бесконечным циклом
 * держит рабочий процесс, и без группы он доживает до конца света, жжёт ядро.
 */
function killGroup(child) {
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

/** Один запуск vitest в каталоге; json-отчёт читается из файла. */
function vitest(cwd, args, reportFile) {
  rmSync(reportFile, { force: true });
  return new Promise((done) => {
    const child = spawn(
      process.execPath,
      [
        join(cwd, 'node_modules/vitest/vitest.mjs'),
        ...args,
        '--run',
        '--reporter=json',
        `--outputFile=${reportFile}`,
      ],
      { cwd, stdio: 'ignore', detached: true },
    );
    children.add(child);
    const timer = setTimeout(() => killGroup(child), HANG_MS);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      children.delete(child);
      let report = null;
      try {
        report = JSON.parse(readFileSync(reportFile, 'utf8'));
      } catch {
        // нет отчёта: vitest не дошёл до тестов
      }
      done({ code: code ?? 1, hung: signal === 'SIGKILL', report });
    });
  });
}

/** Свежая копия проекта: исходники и тесты настоящие, node_modules — ссылка. */
function refreshCopy(root, dir) {
  assertCopyDir(root, dir);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  for (const d of COPY_DIRS) cpSync(join(root, d), join(dir, d), { recursive: true });
  for (const f of COPY_FILES) if (existsSync(join(root, f))) cpSync(join(root, f), join(dir, f));
  symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'), 'dir');
}

function loadCache(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return {};
  }
}

/** Прогон одного мутанта в копии: узкий, при зелёном — весь набор. */
async function judge(copy, m, workers) {
  const report = join(copy, '.mutate-report.json');
  const extra = [`--maxWorkers=${workers}`];
  const narrow = await vitest(copy, ['related', m.file, '--bail=1', '--passWithNoTests', ...extra], report);
  let witnesses = failedFiles(narrow.report, copy);
  if (narrow.code !== 0 && witnesses.length > 0) return { caught: true, byFull: false, witnesses };
  const full = await vitest(copy, extra, report);
  witnesses = failedFiles(full.report, copy);
  if (full.code === 0) return { caught: false, byFull: false, witnesses: [] };
  // Зависание или падение без отчёта: поймано, но свидетеля нет — в кеш не идёт.
  return { caught: true, byFull: true, witnesses: full.hung ? [] : witnesses };
}

export async function main(argv, root = ROOT) {
  const opts = parseArgs(argv);
  const mutants = JSON.parse(readFileSync(resolve(root, opts.list), 'utf8')).filter((m) =>
    m.id.includes(opts.filter),
  );
  const release = acquireLock(root);
  const stop = () => {
    for (const c of children) killGroup(c);
    release();
    process.exit(130);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    return await run(root, opts, mutants);
  } finally {
    release();
  }
}

async function run(root, opts, mutants) {
  const snap = new Snapshot(root);
  snap.preload(COPY_DIRS);
  const cacheFile = join(cacheDir(root), 'cache.json');
  const cache = loadCache(cacheFile);
  const started = Date.now();

  const skipped = [];
  const survived = [];
  const caughtByFull = [];
  const queue = [];
  let fromCache = 0;
  let caught = 0;
  for (const m of mutants) {
    const original = snap.text(m.file);
    if (original === null) {
      console.log(`${m.id}: нет файла ${m.file}`);
      skipped.push(m);
      continue;
    }
    const hits = original.split(m.find).length - 1;
    if (hits !== 1) {
      console.log(`${m.id}: строка найдена ${hits} раз вместо одного — мутант не применён`);
      skipped.push(m);
      continue;
    }
    const mutated = original.replace(m.find, () => m.replace);
    const entry = cache[m.id];
    if (entry && mutantKey(snap, m, mutated, entry.witnesses) === entry.key) {
      console.log(`пойман (кеш) ${m.id} — ${m.note}`);
      fromCache += 1;
      caught += 1;
    } else {
      queue.push({ m, original, mutated });
    }
  }
  const total = mutants.length - skipped.length;
  console.log(`Мутантов: ${mutants.length}, из кеша: ${fromCache}, к прогону: ${queue.length}\n`);

  if (queue.length > 0) {
    // Набор красный до мутаций — всё дальнейшее бессмысленно. Проверка одна, в рабочем дереве.
    const base = await vitest(root, [], join(cacheDir(root), 'base-report.json'));
    if (base.code !== 0) {
      console.error('Набор красный ещё до мутаций — сначала чиним тесты.');
      process.exitCode = 2;
      return;
    }
    const copies = copyDirs(root, Math.min(opts.jobs, queue.length));
    copies.forEach((dir) => refreshCopy(root, dir));
    const next = () => queue.shift();
    await Promise.all(
      copies.map(async (copy) => {
        for (let item = next(); item; item = next()) {
          const { m, original, mutated } = item;
          assertCopyDir(root, copy);
          const target = join(copy, m.file);
          let verdict;
          try {
            writeFileSync(target, mutated, 'utf8');
            verdict = await judge(copy, m, opts.workers);
          } finally {
            writeFileSync(target, original, 'utf8');
          }
          if (verdict.caught) {
            caught += 1;
            if (verdict.byFull) caughtByFull.push(m);
            if (verdict.witnesses.length > 0) {
              cache[m.id] = { key: mutantKey(snap, m, mutated, verdict.witnesses), witnesses: verdict.witnesses };
              mkdirSync(cacheDir(root), { recursive: true });
              writeFileSync(cacheFile, JSON.stringify(cache, null, 1));
            }
          } else {
            survived.push(m);
            // Выживший в кеш не попадает, и старая запись о нём не должна оставаться.
            delete cache[m.id];
          }
          console.log(`${verdict.caught ? 'пойман  ' : 'ВЫЖИЛ   '} ${m.id} — ${m.note}`);
        }
      }),
    );
  }

  const minutes = ((Date.now() - started) / 60000).toFixed(1);
  const ran = total - fromCache;
  console.log(
    `\nПойманных: ${caught} из ${total} применённых, из них из кеша ${fromCache}, прогнано ${ran}, ${minutes} мин`,
  );
  if (caughtByFull.length > 0) {
    // Не дыра, а сведения: эти тесты читают файл текстом или ловят поломку через чужой модуль.
    console.log(`Узкий прогон пропустил, весь набор поймал (${caughtByFull.length}):`);
    for (const m of caughtByFull) console.log(`  ${m.id}: ${m.file}`);
  }
  if (survived.length > 0) {
    console.log('Пробелы в тестах:');
    for (const m of survived) console.log(`  ${m.id}: ${m.note}`);
  }
  if (skipped.length > 0) {
    console.log(`\nНе применились (${skipped.length}) — список протух, починить find:`);
    for (const m of skipped) console.log(`  ${m.id}: ${m.file}`);
  }
  // Протухший мутант — такая же дыра, как выживший: он ничего не проверил.
  if (survived.length > 0 || skipped.length > 0) process.exitCode = 1;
}

/** Запуск напрямую (`node tools/mutateRun.mjs`) — то же, что `tools/mutate.mjs`. */
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(String(err?.message ?? err));
    process.exit(2);
  });
}
