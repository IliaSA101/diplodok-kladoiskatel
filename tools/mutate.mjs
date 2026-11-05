/**
 * Мутации: проверка, что тесты ловят настоящие поломки, а не просто зелёные.
 *
 * Качество тестов меряется не их числом, а тем, сколько поломок они ловят.
 * Скрипт по очереди портит одну строку в коде (мутант), гоняет весь набор
 * и смотрит, покраснел ли он. Файл восстанавливается всегда, в том числе
 * после Ctrl+C и падения: мутант не должен остаться в репозитории.
 *
 * Запуск:
 *   node tools/mutate.mjs              # все мутанты из tools/mutants.json
 *   node tools/mutate.mjs digTaps      # только мутанты, в чьём id есть строка
 *
 * Выжил мутант — в тестах пробел: поведение сломано, а набор молчит.
 * Такой пробел закрывается кейсом в существующем файле тестов своей зоны.
 */
import { readFileSync, writeFileSync, existsSync, statSync, utimesSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const filter = process.argv[2] ?? '';
const mutants = JSON.parse(readFileSync(join(root, 'tools/mutants.json'), 'utf8')).filter(
  (m) => m.id.includes(filter),
);

/** Прогон всего набора: он идёт секунды, выбирать зону незачем. */
function runTests() {
  const r = spawnSync(
    process.execPath,
    [join(root, 'node_modules/vitest/vitest.mjs'), 'run', '--reporter=dot'],
    { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26 },
  );
  return r.status === 0;
}

if (!runTests()) {
  console.error('Набор красный ещё до мутаций — сначала чиним тесты.');
  process.exit(2);
}
console.log(`Набор зелёный. Мутантов: ${mutants.length}\n`);

/**
 * Мутанты, которых не удалось применить: строка в коде изменилась, а в
 * списке осталась старой. Такой мутант молча шёл в зачёт как пойманный —
 * именно так `dino-watch-covers-panel` «ловил» то, чего не трогал.
 */
const skipped = [];
const survived = [];
for (const m of mutants) {
  const path = join(root, m.file);
  if (!existsSync(path)) {
    console.log(`${m.id}: нет файла ${m.file}`);
    skipped.push(m);
    continue;
  }
  const original = readFileSync(path, 'utf8');
  const hits = original.split(m.find).length - 1;
  if (hits !== 1) {
    console.log(`${m.id}: строка найдена ${hits} раз вместо одного — мутант не применён`);
    skipped.push(m);
    continue;
  }
  // Вернуть не только текст, но и время правки: иначе хук before-stop.mjs
  // считает файл свежеправленным и требует обход экранов после каждого
  // прогона мутантов, хотя в файле не изменилось ни буквы.
  const { atime, mtime } = statSync(path);
  const restore = () => {
    writeFileSync(path, original, 'utf8');
    utimesSync(path, atime, mtime);
  };
  process.on('SIGINT', restore);
  let green = true;
  try {
    writeFileSync(path, original.replace(m.find, () => m.replace), 'utf8');
    green = runTests();
  } finally {
    restore();
    process.removeListener('SIGINT', restore);
  }
  if (green) survived.push(m);
  console.log(`${green ? 'ВЫЖИЛ   ' : 'пойман  '} ${m.id} — ${m.note}`);
}

const applied = mutants.length - skipped.length;
console.log(`\nПойманных: ${applied - survived.length} из ${applied} применённых`);
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
