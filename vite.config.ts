import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { fingerprints } from './tools/shots.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(ROOT, 'art-work/shots');

/**
 * Приём кадров от `src/dev/shots.ts`: `?shots` обходит экраны и шлёт сюда PNG.
 *
 * Без этого «посмотреть экран» значило десять действий на каждый экран, и
 * поэтому не делалось. Пишем только в dev и только в `art-work/` — туда же,
 * куда кладёт промежуточное весь конвейер арта, и эта папка не коммитится.
 */
function shotsPlugin(): Plugin {
  return {
    name: 'diplodok-shots',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__shot', (request, response, next) => {
        if (request.method !== 'POST') return next();
        const name = new URL(request.url ?? '', 'http://x').searchParams.get('name') ?? '';
        // Имя приходит из браузера: в путь пускаем только то, что сами же и даём.
        if (!/^[a-z0-9-]{1,64}$/.test(name)) {
          response.statusCode = 400;
          return response.end('имя кадра не годится');
        }
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          mkdirSync(SHOTS, { recursive: true });
          writeFileSync(resolve(SHOTS, `${name}.png`), Buffer.concat(chunks));
          response.end('ok');
        });
      });

      server.middlewares.use('/__shot-done', (request, response, next) => {
        if (request.method !== 'POST') return next();
        const chunks: Buffer[] = [];
        request.on('data', (chunk: Buffer) => chunks.push(chunk));
        request.on('end', () => {
          mkdirSync(SHOTS, { recursive: true });
          // Метка времени и отпечатки рисующих файлов — по ним хук before-stop
          // понимает, смотрели ли экраны после последней правки сцены. Время
          // без отпечатков врёт: прогон мутантов и откат переписывают файл
          // тем же текстом, а экран от этого не меняется.
          const body = Buffer.concat(chunks).toString('utf8') || '{}';
          const stamp = { at: new Date().toISOString(), ...JSON.parse(body), files: fingerprints(ROOT) };
          writeFileSync(resolve(SHOTS, '_stamp.json'), `${JSON.stringify(stamp, null, 2)}\n`);
          response.end('ok');
        });
      });
    },
  };
}

// Сценарии в pre-push идут (E2E_FRESH=1) во временной копии, где `node_modules` — ссылка на
// настоящий. Кэш Vite по умолчанию лежит в `node_modules/.vite` и общий с рабочим `npm run dev`,
// а хэш оптимизации зависимостей зависит от корня проекта: второй сервер переоптимизировал бы
// зависимости под первым. Поэтому у сценариев свой кэш.
const CACHE_DIR = process.env.E2E_FRESH === '1' ? resolve(ROOT, 'node_modules/.vite-e2e') : undefined;

// Игра публикуется как подраздел GitHub Pages, поэтому все пути идут с префиксом.
export default defineConfig({
  base: '/diplodok-kladoiskatel/',
  cacheDir: CACHE_DIR,
  server: { host: true },
  plugins: [shotsPlugin()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 2000,
  },
});
