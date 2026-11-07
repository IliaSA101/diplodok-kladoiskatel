// Фикстура сохранения, собранная кодом старой версии игры.
//
//   node tools/save-fixture.mjs <ref…> <имя> <сценарий>
//
// Пример: node tools/save-fixture.mjs 03b2164 8077300 pre-1.0 pre-1.0
//
// Для каждого `ref` берётся `git archive <ref> src package.json` во временную папку,
// раннер `tools/save-fixture-run.mjs` (под `npx vite-node`) проигрывает сценарий
// МОДУЛЯМИ той версии и пишет `tests/fixtures/save-<имя>.json`: снимок `localStorage`
// (`storage`) и то, что видел ребёнок (`seen`). Тест `tests/saveFixtures.test.ts`
// открывает `storage` нынешней игрой и сверяет с `seen`.
//
// Сценарии: pre-1.0 | since-first | max | erased | broken (описаны в раннере).
// Несколько ref идут по очереди (сперва первая сборка, потом 1.0.0).
// Новая версия игры добавляет свою фикстуру тем же инструментом (design 001-7).
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length < 3) {
  console.error('usage: node tools/save-fixture.mjs <ref…> <имя> <сценарий>');
  process.exit(2);
}
const scenario = args.pop();
const name = args.pop();
const refs = args;
const out = join(ROOT, 'tests', 'fixtures', `save-${name}.json`);

function run(cmd, cmdArgs, options = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', ...options });
  if (res.status !== 0) {
    console.error(`${cmd} ${cmdArgs.join(' ')} — код ${res.status}`);
    process.exit(res.status ?? 1);
  }
}

const work = mkdtempSync(join(tmpdir(), 'save-fixture-'));
try {
  for (const ref of refs) {
    const dir = join(work, 'tree-' + ref);
    mkdirSync(dir);
    const tar = spawnSync('git', ['archive', ref, 'src', 'package.json'], { cwd: ROOT, maxBuffer: 1 << 28 });
    if (tar.status !== 0) {
      console.error(`git archive ${ref}: ${String(tar.stderr)}`);
      process.exit(1);
    }
    run('tar', ['-x', '-C', dir], { input: tar.stdout, stdio: ['pipe', 'inherit', 'inherit'] });
  }
  mkdirSync(dirname(out), { recursive: true });
  run(
    join(ROOT, 'node_modules', '.bin', 'vite-node'),
    ['--root', work, join(ROOT, 'tools', 'save-fixture-run.mjs')],
    { cwd: ROOT, env: { ...process.env, DK_FIXTURE: JSON.stringify({ work, refs, scenario, out, name }) } },
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
