/**
 * Чистая часть `tools/mutate.mjs`: из чего складывается ключ кеша мутанта.
 *
 * Пойманный мутант не гоняют заново, пока не менялось ничего из того, от чего
 * зависело его «пойман»: определение мутанта, испорченный файл, тест-свидетель
 * (тот, что покраснел), всё, что свидетель импортирует (по цепочке), и всё,
 * что он читает как текст. Последнее важно: `vitest related` таких чтений не
 * видит, а половина стражей проекта проверяет именно исходники сцен.
 *
 * Здесь нет ни vitest, ни процессов — только тексты и хеши, поэтому правило
 * ключа проверяется тестом на временном корне (`tests/mutateLib.test.ts`).
 */
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, relative, resolve, sep } from 'node:path';

/** Каталоги, которые никогда не входят в ключ: сборка, чужой код, наши же кадры. */
const SKIP = new Set(['node_modules', 'dist', '.git', 'test-results', 'playwright-report']);

/**
 * Файлы, от которых зависит любой прогон тестов, и сами скрипты мутаций:
 * правка скрипта сбрасывает кеш сама, без флага и без памяти человека.
 */
export const ALWAYS = [
  'package-lock.json',
  'vitest.config.ts',
  'tsconfig.json',
  'tools/mutate.mjs',
  'tools/mutateLib.mjs',
  'tools/mutateRun.mjs',
];

const CODE = /\.(?:ts|mts|cts|tsx|js|mjs|cjs)$/;
const EXTENSIONS = ['.ts', '.mts', '.mjs', '.js', '.json'];

export const sha1 = (data) => createHash('sha1').update(data).digest('hex');

/**
 * Снимок рабочего дерева: файлы читаются один раз и дальше не меняются, даже
 * если их правят во время прогона. Ключ, посчитанный по снимку, описывает
 * ровно то дерево, на котором мутант проверяли.
 */
export class Snapshot {
  /** @param {string} root корень проекта */
  constructor(root) {
    this.root = root;
    this.files = new Map();
    this.kinds = new Map();
    this.lists = new Map();
    this.hashes = new Map();
  }

  /** Что лежит по пути: 'file', 'dir' или null. */
  kind(rel) {
    if (!this.kinds.has(rel)) {
      const full = join(this.root, rel);
      let kind = null;
      if (existsSync(full)) kind = statSync(full).isDirectory() ? 'dir' : 'file';
      this.kinds.set(rel, kind);
    }
    return this.kinds.get(rel);
  }

  /** Содержимое файла или null. */
  read(rel) {
    if (!this.files.has(rel)) {
      this.files.set(rel, this.kind(rel) === 'file' ? readFileSync(join(this.root, rel)) : null);
    }
    return this.files.get(rel);
  }

  text(rel) {
    return this.read(rel)?.toString('utf8') ?? null;
  }

  hash(rel) {
    if (!this.hashes.has(rel)) {
      const data = this.read(rel);
      this.hashes.set(rel, data === null ? 'нет' : sha1(data));
    }
    return this.hashes.get(rel);
  }

  /** Все файлы под путём (сам файл, если это файл), по алфавиту. */
  list(rel) {
    if (!this.lists.has(rel)) {
      const out = [];
      const kind = this.kind(rel);
      if (kind === 'file') out.push(rel);
      if (kind === 'dir') {
        for (const name of readdirSync(join(this.root, rel)).sort()) {
          if (SKIP.has(name)) continue;
          out.push(...this.list(posix.join(rel, name)));
        }
      }
      this.lists.set(rel, out);
    }
    return this.lists.get(rel);
  }

  /** Прочитать заранее всё в этих каталогах: дальше правки на диске не видны. */
  preload(dirs) {
    for (const dir of dirs) for (const file of this.list(dir)) this.read(file);
  }
}

/** Относительные пути из import/export/require/import() в тексте. */
export function importSpecs(text) {
  const out = new Set();
  const patterns = [
    /\bfrom\s*['"]([^'"\n]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
    /\bimport\s*['"]([^'"\n]+)['"]/g,
    /\brequire\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) if (m[1].startsWith('.')) out.add(m[1]);
  }
  return [...out];
}

/** Файл, на который указывает относительный импорт из `fromRel`, или null. */
export function resolveImport(snap, fromRel, spec) {
  const base = posix.normalize(posix.join(posix.dirname(fromRel), spec));
  if (base.startsWith('..')) return null;
  const tries = [base];
  for (const ext of EXTENSIONS) tries.push(base + ext);
  // Запись `./a.js` в TypeScript часто означает `./a.ts`.
  if (base.endsWith('.js')) tries.push(base.slice(0, -3) + '.ts');
  for (const ext of EXTENSIONS) tries.push(posix.join(base, 'index' + ext));
  return tries.find((p) => snap.kind(p) === 'file') ?? null;
}

/** Файл и всё, что он импортирует по цепочке. Только файлы внутри корня. */
export function importClosure(snap, startRel) {
  const seen = new Set();
  const stack = [startRel];
  while (stack.length > 0) {
    const rel = stack.pop();
    if (seen.has(rel) || snap.kind(rel) !== 'file') continue;
    seen.add(rel);
    if (!CODE.test(rel)) continue;
    for (const spec of importSpecs(snap.text(rel) ?? '')) {
      const next = resolveImport(snap, rel, spec);
      if (next !== null) stack.push(next);
    }
  }
  return [...seen].sort();
}

/** Текст без комментариев: слово в комментарии не путь и не импорт. */
export function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');
}

const LITERAL = String.raw`(?:'[^'\n]*'|"[^"\n]*"|` + '`[^`\\n]*`)';
const LITERAL_RUN = new RegExp(`${LITERAL}(?:\\s*,\\s*${LITERAL})*`, 'g');
const ONE_LITERAL = new RegExp(LITERAL, 'g');

/**
 * Строковые литералы, идущие через запятую: `'src', 'scenes'` в `join(...)`.
 * Шаблон режется на первом `${`: что дальше, неизвестно, и путь считается
 * каталогом до последней косой.
 */
function literalRuns(code) {
  const runs = [];
  for (const m of code.matchAll(LITERAL_RUN)) {
    const parts = [];
    for (const lit of m[0].match(ONE_LITERAL) ?? []) {
      const body = lit.slice(1, -1);
      const cut = body.indexOf('${');
      if (cut < 0) {
        parts.push(body);
      } else {
        parts.push(body.slice(0, body.lastIndexOf('/', cut) + 1));
        break; // дальше этого шаблона путь неизвестен
      }
    }
    runs.push(parts);
  }
  return runs;
}

/**
 * Годится ли путь из литерала как чтение файла проекта: не корень целиком
 * (литерал `'/'` или `'.'` — это не «весь проект»), не вне корня, не node_modules и не кадры
 * обхода экранов: они пишутся при каждом `?shots`, и ни один тест не вправе
 * от них зависеть.
 */
function readable(p) {
  if (p === '.' || p === '' || p.startsWith('..') || p.startsWith('/')) return false;
  const top = p.split('/')[0];
  return top !== 'art-work' && !SKIP.has(top);
}

/**
 * Файлы, которые код читает как текст: пути, спрятанные в строках.
 * Пробуются два основания: корень проекта (тест гоняют из него) и каталог
 * самого файла (`new URL('../src/x.ts', import.meta.url)`). Из ряда литералов
 * берётся самый длинный существующий путь, поэтому `'src', 'scenes'` — это
 * каталог scenes, а не весь src. Каталог раскрывается в файлы.
 */
export function textReads(snap, fromRel, text) {
  const found = new Set();
  const dir = posix.dirname(fromRel);
  for (const parts of literalRuns(stripComments(text))) {
    for (let i = 0; i < parts.length; i += 1) {
      for (let j = parts.length; j > i; j -= 1) {
        const joined = parts.slice(i, j).filter((p) => p !== '').join('/');
        if (joined === '') continue;
        const hits = [posix.normalize(joined)];
        if (joined.startsWith('./') || joined.startsWith('../')) {
          hits.push(posix.normalize(posix.join(dir, joined)));
        }
        const real = hits.filter((p) => readable(p) && snap.kind(p) !== null);
        for (const p of real) for (const f of snap.list(p)) found.add(f);
        if (real.length > 0) break;
      }
    }
  }
  return [...found].sort();
}

/**
 * Все файлы, от которых зависит, что свидетель красный: он сам, его импорты
 * по цепочке, всё, что он или его импорты читают текстом, и общие файлы.
 */
export function dependencies(snap, witnesses) {
  const all = new Set(ALWAYS);
  for (const w of witnesses) {
    for (const file of importClosure(snap, w)) {
      all.add(file);
      if (CODE.test(file)) {
        for (const read of textReads(snap, file, snap.text(file) ?? '')) all.add(read);
      }
    }
  }
  return [...all].sort();
}

/**
 * Ключ кеша: меняется, когда меняется что-то из зависимостей, и не меняется
 * от правки чужого файла. `mutatedText` — текст испорченного файла.
 */
export function mutantKey(snap, mutant, mutatedText, witnesses) {
  const parts = [
    ['мутант', mutant.file, mutant.find, mutant.replace],
    ['испорченный', mutant.file, sha1(mutatedText)],
  ];
  for (const file of dependencies(snap, [...witnesses].sort())) parts.push([file, snap.hash(file)]);
  return sha1(JSON.stringify(parts));
}

/** Пути упавших тестовых файлов из отчёта `vitest --reporter=json`, от корня. */
export function failedFiles(report, root) {
  const out = [];
  for (const file of report?.testResults ?? []) {
    if (file.status === 'failed' && typeof file.name === 'string') {
      out.push(relative(root, file.name).split('\\').join('/'));
    }
  }
  return out.sort();
}

/** Где живут кеш, замок и копии: внутри node_modules, в git это не попадает. */
export const cacheDir = (root) => join(root, 'node_modules', '.cache', 'mutate');

/**
 * Где лежат рабочие копии. Не в `node_modules`: vitest не строит граф импортов
 * для файлов под `node_modules`, и `vitest related` в такой копии не находит
 * ни одного теста (опыт 07.11: 0 файлов вместо 10). Копии — во временном
 * каталоге системы, свой для каждого проекта; в git они попасть не могут.
 */
export const copiesBase = (root) => join(tmpdir(), `diplodok-mutate-${sha1(resolve(root)).slice(0, 8)}`);

/**
 * Рабочие копии, в которых портят файлы. Это единственное место, куда мутант
 * вообще может записать: рабочее дерево прогон не трогает.
 */
export function copyDirs(root, jobs) {
  return Array.from({ length: jobs }, (_, i) => join(copiesBase(root), `w${i}`));
}

/** Бросает, если каталог — не копия строго внутри `copiesBase` (например, сам корень). */
export function assertCopyDir(root, dir) {
  const full = resolve(dir);
  const rootFull = resolve(root);
  const inside = full.startsWith(resolve(copiesBase(root)) + sep);
  const overlaps = full === rootFull || full.startsWith(rootFull + sep) || rootFull.startsWith(full + sep);
  if (!inside || overlaps) {
    throw new Error(`Каталог ${dir} не рабочая копия: мутанты портят только копии в ${copiesBase(root)}`);
  }
}

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === 'EPERM';
  }
};

/**
 * Замок на один прогон: два прогона разом делили бы копии и кеш и портили
 * друг другу результаты. Замок — файл с pid; если процесса с таким pid нет,
 * замок мёртвый и снимается. Возвращает функцию, снимающую замок.
 */
export function acquireLock(root, pid = process.pid, isAlive = alive) {
  const dir = cacheDir(root);
  const file = join(dir, 'lock');
  mkdirSync(dir, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      writeFileSync(file, String(pid), { flag: 'wx' });
      return () => {
        if (existsSync(file) && readFileSync(file, 'utf8') === String(pid)) rmSync(file);
      };
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
      const holder = Number.parseInt(readFileSync(file, 'utf8'), 10);
      if (Number.isInteger(holder) && isAlive(holder)) {
        throw new Error(`Мутации уже идут (pid ${holder}). Дождись конца или останови тот прогон.`);
      }
      rmSync(file, { force: true }); // мёртвый замок
    }
  }
  throw new Error('Не удалось взять замок мутаций');
}
