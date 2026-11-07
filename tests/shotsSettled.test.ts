/**
 * Обход `?shots`: когда экран считается улёгшимся. Отдельно от раскладки — это
 * не про то, где что стоит, а про то, когда снимать кадр.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unfinishedTweens } from '../src/dev/settled';

describe('обход экранов ждёт настоящий признак', () => {
  const once = { isInfinite: false, data: [{ repeat: 0 }] };

  it('считает конечные твины: пока предметы альбома растут, экран не готов', () => {
    // Двенадцать ячеек «Моих сокровищ» плюс тайник, каждая — свой конечный твин.
    expect(unfinishedTweens(Array.from({ length: 26 }, () => once))).toBe(26);
    expect(unfinishedTweens([])).toBe(0);
  });

  it('покачивания не мешают снять кадр: loop -1 и repeat -1', () => {
    // Phaser сам зажигает `isInfinite` и у `loop: -1`, и у `{ repeat: -1 }`.
    const loop = { isInfinite: true, data: [{ repeat: 0 }] };
    const repeat = { isInfinite: true, data: [{ repeat: -1 }] };
    expect(unfinishedTweens([loop, repeat])).toBe(0);
    expect(unfinishedTweens([loop, once, repeat])).toBe(1);
  });

  it('подстраховка: repeat -1 в данных держит твин бесконечным и без isInfinite', () => {
    expect(unfinishedTweens([{ isInfinite: false, data: [{ repeat: -1 }] }, once])).toBe(1);
  });

  it('бесконечная цепочка не держит кадр: и через loop, и через звено', () => {
    // У `TweenChain` поля `isInfinite` нет, а в `data` лежат звенья-твины.
    const chainLoop = { loop: -1, data: [{ isInfinite: false }] };
    const chainLink = { loop: 0, data: [{ isInfinite: false }, { isInfinite: true }] };
    const shake = { loop: 0, data: [{ isInfinite: false }, { isInfinite: false }] };
    expect(unfinishedTweens([chainLoop, chainLink])).toBe(0);
    expect(unfinishedTweens([chainLoop, shake, chainLink])).toBe(1);
  });

  it('кончившийся и разобранный твин (данных нет) ничего не держит', () => {
    // Phaser зануляет `data` у уничтоженного твина: на этом проверка уже падала.
    expect(unfinishedTweens([{ isInfinite: false, data: null }, once])).toBe(1);
  });

  it('обход вызывает проверку перед каждым снимком', () => {
    const src = readFileSync(join(process.cwd(), 'src', 'dev', 'shots.ts'), 'utf8');
    // Тело функции целиком: до первой строки, где закрывающая скобка стоит в начале.
    const body = (name: string): string => {
      const start = src.indexOf(`async function ${name}(`);
      expect(start, name).toBeGreaterThanOrEqual(0);
      return src.slice(start, src.indexOf('\n}\n', start));
    };
    // Смотрим на вызовы, а не на определения: убери вызов — и обход снова
    // молча снимет «Мои сокровища» с тремя предметами. Подмену самого `throw`
    // или `keepsTweening` ловит только прогон `?shots`.
    expect(body('show')).toContain('await untilTweensEnd(game, shot.scene)');
    expect(body('takeShots')).toContain('noLagSmoothing(game);');
    expect(body('untilTweensEnd')).toContain('unfinishedTweens(game.scene.getScene(key).tweens.getTweens())');
    expect(src).toContain('scene.tweens.setLagSmooth()');
  });
});
