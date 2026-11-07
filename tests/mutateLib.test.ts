/**
 * Ключ кеша мутантов (tools/mutateLib.mjs): когда пойманный мутант можно не
 * гонять заново. Ошибка в обе стороны плоха по-разному: лишняя перемена ключа
 * стоит минуты, а ключ, который не заметил правку, прячет выжившего мутанта.
 *
 * Отдельный файл — своя подготовка: временный корень проекта на диске.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Snapshot,
  acquireLock,
  assertCopyDir,
  cacheDir,
  copiesBase,
  copyDirs,
  failedFiles,
  importClosure,
  importSpecs,
  mutantKey,
} from '../tools/mutateLib.mjs';

let root = '';

function put(path: string, text: string): void {
  const full = join(root, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, text);
}

const MUTANT = { file: 'src/a.ts', find: 'return 1', replace: 'return 2' };
const MUTATED = 'export const a = () => { return 2; };\n';
const WITNESS = 'tests/w.test.ts';

/** Ключ мутанта на текущем состоянии диска. */
function key(over: { mutant?: typeof MUTANT; text?: string; witnesses?: string[] } = {}): string {
  return mutantKey(
    new Snapshot(root),
    over.mutant ?? MUTANT,
    over.text ?? MUTATED,
    over.witnesses ?? [WITNESS],
  );
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'mutate-'));
  put('src/a.ts', 'export const a = () => { return 1; };\n');
  put('src/b.ts', "import { c } from './c';\nexport const b = c;\n");
  put('src/c.ts', "import { d } from './deep/index';\nexport const c = d;\n");
  put('src/deep/index.ts', 'export const d = 4;\n');
  put('src/scenes/One.ts', 'export const one = 1;\n');
  put('src/tpl/x.ts', 'export const x = 1;\n');
  put('src/other.ts', 'export const other = 0;\n');
  put('public/art/note.txt', 'нота\n');
  put(
    WITNESS,
    [
      "import { readFileSync } from 'node:fs';",
      "import { a } from '../src/a';",
      "import { b } from '../src/b';",
      "// читать 'src/other.ts' не надо: это комментарий",
      "const scenes = readdirSync(join(process.cwd(), 'src', 'scenes'));",
      "const note = readFileSync('public/art/note.txt', 'utf8');",
      'const tpl = (n: string) => readFileSync(new URL(`../src/tpl/${n}.ts`, import.meta.url));',
      '',
    ].join('\n'),
  );
  for (const f of [
    'package-lock.json',
    'vitest.config.ts',
    'tsconfig.json',
    'tools/mutate.mjs',
    'tools/mutateLib.mjs',
    'tools/mutateRun.mjs',
  ]) {
    put(f, '1');
  }
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('ключ кеша мутанта', () => {
  it('на тех же файлах ключ тот же', () => {
    expect(key()).toBe(key());
  });

  it('правка испорченного файла меняет ключ', () => {
    expect(key({ text: MUTATED + '// ещё\n' })).not.toBe(key());
  });

  it('правка определения мутанта меняет ключ', () => {
    expect(key({ mutant: { ...MUTANT, replace: 'return 3' } })).not.toBe(key());
    expect(key({ mutant: { ...MUTANT, find: 'return  1' } })).not.toBe(key());
  });

  it('правка теста-свидетеля меняет ключ', () => {
    const before = key();
    put(WITNESS, readFileSync(join(root, WITNESS), 'utf8') + 'expect(1);\n');
    expect(key()).not.toBe(before);
  });

  it('правка того, что свидетель импортирует, меняет ключ', () => {
    const before = key();
    put('src/b.ts', "import { c } from './c';\nexport const b = c + 1;\n");
    expect(key()).not.toBe(before);
  });

  it('правка импорта импорта (и каталога с index.ts) меняет ключ', () => {
    const before = key();
    put('src/deep/index.ts', 'export const d = 5;\n');
    expect(key()).not.toBe(before);
  });

  it('правка файла, который свидетель читает как текст, меняет ключ', () => {
    const before = key();
    put('public/art/note.txt', 'другая нота\n');
    expect(key()).not.toBe(before);
  });

  it('правка файла внутри каталога, который свидетель читает, меняет ключ', () => {
    const before = key();
    put('src/scenes/One.ts', 'export const one = 2;\n');
    expect(key()).not.toBe(before);
  });

  it('новый файл в прочитанном каталоге меняет ключ', () => {
    const before = key();
    put('src/scenes/Two.ts', 'export const two = 2;\n');
    expect(key()).not.toBe(before);
  });

  it('путь в шаблоне читается как каталог', () => {
    const before = key();
    put('src/tpl/x.ts', 'export const x = 2;\n');
    expect(key()).not.toBe(before);
  });

  it.each(['package-lock.json', 'vitest.config.ts', 'tsconfig.json'])(
    'правка %s меняет ключ',
    (file) => {
      const before = key();
      put(file, '2');
      expect(key()).not.toBe(before);
    },
  );

  // Правка самого скрипта мутаций сбрасывает кеш: вместо флага «забудь всё».
  it.each(['tools/mutate.mjs', 'tools/mutateLib.mjs', 'tools/mutateRun.mjs'])(
    'правка %s меняет ключ',
    (file) => {
      const before = key();
      put(file, '2');
      expect(key()).not.toBe(before);
    },
  );

  it('правка чужого файла ключ не меняет', () => {
    const before = key();
    put('src/other.ts', 'export const other = 99;\n'); // в комментарии свидетеля, не в коде
    put('src/scenes-extra.ts', 'export const z = 1;\n');
    put('tests/unrelated.test.ts', 'export {};\n');
    expect(key()).toBe(before);
  });

  it('другой свидетель — другой ключ', () => {
    put('tests/v.test.ts', "import { a } from '../src/a';\n");
    expect(key({ witnesses: ['tests/v.test.ts'] })).not.toBe(key());
  });

  it('правка файла второго свидетеля меняет ключ, порядок свидетелей не важен', () => {
    put('tests/v.test.ts', "import { a } from '../src/a';\n");
    const both = key({ witnesses: [WITNESS, 'tests/v.test.ts'] });
    expect(key({ witnesses: ['tests/v.test.ts', WITNESS] })).toBe(both);
    put('tests/v.test.ts', "import { a } from '../src/a';\n// правка\n");
    expect(key({ witnesses: [WITNESS, 'tests/v.test.ts'] })).not.toBe(both);
  });
});

describe('поиск импортов и отчёт vitest', () => {
  it('находит from, import(), export from и побочный импорт', () => {
    const text = [
      "import a from './a';",
      "export { b } from '../b';",
      "const c = await import('./c');",
      "import './side';",
      "import x from 'phaser';",
    ].join('\n');
    expect(importSpecs(text).sort()).toEqual(['../b', './a', './c', './side']);
  });

  it('./a.js ведёт на a.ts, каталог — на index.ts, цепочка не зацикливается', () => {
    put('src/loop1.ts', "import './loop2.js';\n");
    put('src/loop2.ts', "import './loop1';\n");
    expect(importClosure(new Snapshot(root), 'src/loop1.ts')).toEqual(['src/loop1.ts', 'src/loop2.ts']);
    expect(importClosure(new Snapshot(root), 'src/c.ts')).toEqual(['src/c.ts', 'src/deep/index.ts']);
  });

  it('упавшие тестовые файлы берутся из отчёта и считаются от корня', () => {
    const report = {
      testResults: [
        { name: join(root, 'tests/z.test.ts'), status: 'failed' },
        { name: join(root, 'tests/ok.test.ts'), status: 'passed' },
        { name: join(root, 'tests/a.test.ts'), status: 'failed' },
      ],
    };
    expect(failedFiles(report, root)).toEqual(['tests/a.test.ts', 'tests/z.test.ts']);
    expect(failedFiles(null, root)).toEqual([]);
  });
});

describe('замок: один прогон за раз', () => {
  it('второй прогон при живом первом отказывается с понятным сообщением', () => {
    const release = acquireLock(root, 111, () => true);
    expect(() => acquireLock(root, 222, () => true)).toThrow(/Мутации уже идут \(pid 111\)/);
    release();
    expect(() => acquireLock(root, 222, () => true)).not.toThrow();
  });

  it('замок мёртвого процесса снимается', () => {
    acquireLock(root, 111, () => true);
    const release = acquireLock(root, 222, () => false);
    expect(readFileSync(join(cacheDir(root), 'lock'), 'utf8')).toBe('222');
    release();
  });

  it('чужой замок снимающая функция не трогает', () => {
    const first = acquireLock(root, 111, () => true);
    rmSync(join(cacheDir(root), 'lock'));
    const second = acquireLock(root, 222, () => true);
    first();
    expect(() => acquireLock(root, 333, () => true)).toThrow(/pid 222/);
    second();
  });
});

describe('мутант не попадает в рабочее дерево', () => {
  it('копии лежат строго внутри своего каталога, вне проекта и вне node_modules', () => {
    const dirs = copyDirs(root, 6);
    expect(new Set(dirs).size).toBe(6);
    for (const dir of dirs) {
      expect(dir).not.toBe(root);
      expect(dir.startsWith(copiesBase(root) + '/')).toBe(true);
      expect(dir.startsWith(root)).toBe(false);
      // Под node_modules vitest не строит граф импортов и `related` ничего не находит.
      expect(dir.split('/')).not.toContain('node_modules');
      expect(() => assertCopyDir(root, dir)).not.toThrow();
    }
  });

  it('корень, его каталоги, кеш и сам каталог копий копией не считаются', () => {
    const bad = [root, join(root, 'src'), cacheDir(root), copiesBase(root), join(root, '..'), join(copiesBase(root), '..')];
    for (const dir of bad) expect(() => assertCopyDir(root, dir), dir).toThrow(/не рабочая копия/);
  });

  it('ход прогона проверяет каталог перед очисткой копии и перед порчей файла', () => {
    const run = readFileSync(join(__dirname, '..', 'tools', 'mutateRun.mjs'), 'utf8');
    const refresh = run.slice(run.indexOf('function refreshCopy'), run.indexOf('function loadCache'));
    expect(refresh.indexOf('assertCopyDir(root, dir)')).toBeGreaterThan(-1);
    expect(refresh.indexOf('assertCopyDir(root, dir)')).toBeLessThan(refresh.indexOf('rmSync'));
    const loop = run.indexOf('assertCopyDir(root, copy)');
    expect(loop).toBeGreaterThan(-1);
    expect(loop).toBeLessThan(run.indexOf("writeFileSync(target, mutated"));
  });
});
