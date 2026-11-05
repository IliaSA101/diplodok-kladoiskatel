/**
 * Сценарии в живой игре: клики, клавиатура, переходы сцен — то, чего не
 * умеют ни тесты на чистой логике (`tests/`, node без браузера), ни обход
 * `?shots` (он только снимает экраны, но ничего не нажимает).
 *
 * Браузер — установленный Google Chrome (`channel: 'chrome'`), свои браузеры
 * Playwright не качает. Игре нужен WebGL: на стенде Ubuntu без видеокарты
 * Chrome даёт его программно (SwiftShader), а встроенная панель браузера —
 * нет. Каждый сценарий сперва проверяет, что рендерер WebGL: кадр Canvas врёт.
 *
 * Кадры шагов кладутся в `art-work/e2e/` (вне git) — смотреть надо их,
 * в натуральную величину.
 */
import { defineConfig } from '@playwright/test';

// pre-push гоняет сценарии во временной рабочей копии того дерева, что уходит в main:
// на своём порту и со своим сервером (E2E_FRESH), иначе Playwright подхватил бы
// уже запущенный `npm run dev` рабочей копии — с её правками, а не публикуемое.
const PORT = Number(process.env.E2E_PORT ?? 5173);
const FRESH = process.env.E2E_FRESH === '1';
const BASE = `http://localhost:${PORT}/diplodok-kladoiskatel/`;

export default defineConfig({
  testDir: 'e2e',
  // Игра одна, dev-сервер один: сценарии по очереди, чтобы не делить процессор
  // с программным WebGL.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  use: {
    baseURL: BASE,
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 720 },
    launchOptions: { args: ['--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE,
    reuseExistingServer: !FRESH,
    timeout: 60_000,
  },
});
