/**
 * Состояние сцены не переживает выход из неё.
 *
 * Phaser при повторном входе зовёт `init` и `create` у того же объекта, а
 * поля класса остаются как были. В лесу `busy = true` (его ставит «назад»)
 * дожил до следующего захода, и лес замер: ни клика, ни ходьбы, ни кнопки.
 * Секретный сундук, зажжённый в одном лесу, горел сразу в следующем.
 *
 * Phaser в node не поднять, поэтому читаем исходники: каждое поле с
 * начальным значением в объявлении должно быть присвоено заново в `init` или
 * `create`. Считаются только те методы, что вызваны из них отдельным
 * оператором (`this.buildGround();`) — вызов внутри обработчика сработает
 * когда-нибудь потом, а не при входе, и сбросом не служит. Строки после
 * раннего `if (...) return;` тоже не считаются. Не считаются и многострочное
 * `= new Map(\n…)`, и `splice(0)`: исключение — строкой в EXEMPT с причиной.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SCENES_DIR = join(__dirname, '..', 'src', 'scenes');

/** Поля, которые вход в сцену не обязан сбрасывать, — с причиной. */
const EXEMPT: Readonly<Record<string, string>> = {
  'BootScene.built': 'загрузочная сцена идёт один раз за запуск и больше не стартует',
};

interface Field {
  name: string;
  /** Начальное значение, как написано в коде. */
  initial: string;
}

/**
 * Индекс первого `=` присваивания после имени поля: тип пропускается
 * сбалансированно, а `=>` внутри типа (`(() => void) | null`) присваиванием не служит.
 */
function assignmentAt(rest: string): number {
  let depth = 0;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '=' && rest[i + 1] === '>') {
      i++;
    } else if (ch === '(' || ch === '[' || ch === '{' || ch === '<') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}' || ch === '>') {
      depth--;
    } else if (ch === '=' && depth === 0 && rest[i + 1] !== '=') {
      return i;
    }
  }
  return -1;
}

/** Значение начинается как стрелочная функция: `(…) =>`, `(…): T =>`, `async (…) =>`, `x =>`. */
function startsAsArrow(value: string): boolean {
  const text = value.replace(/^async\s*/, '');
  if (/^\w+\s*=>/.test(text)) return true;
  if (!text.startsWith('(')) return false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') depth++;
    if (text[i] === ')' && --depth === 0) {
      const tail = text.slice(i + 1).trimStart();
      return tail.startsWith('=>') || tail.startsWith(':');
    }
  }
  return false;
}

/** Поля вида `private name: Type = value;` на уровне класса (методы-стрелки без типа — не состояние). */
export function declaredFields(source: string): Field[] {
  const out: Field[] = [];
  for (const line of source.split('\n')) {
    const head = /^ {2}(?:private |protected |public )?(?:readonly )?(\w+)[!?]?(.*;)$/.exec(line);
    if (head === null) continue;
    const rest = head[2] ?? '';
    const at = assignmentAt(rest);
    if (at < 0 || !/^(?::| =)/.test(rest)) continue;
    const initial = rest.slice(at + 1).trim().replace(/;$/, '');
    // Стрелка без типа — метод в виде поля; с типом (`pick: () => void = () => undefined`) —
    // ячейка под обработчик, которую сцена перезаписывает, то есть состояние.
    if (initial === '' || (rest.startsWith(' =') && startsAsArrow(initial))) continue;
    out.push({ name: head[1] ?? '', initial });
  }
  return out;
}

/** Тело метода класса (с отступом в два пробела) или пустая строка. */
export function methodBody(source: string, name: string): string {
  const lines = source.split('\n');
  const head = new RegExp(`^ {2}(?:private |protected |public )?(?:override )?(?:async )?${name}\\(.*\\{$`);
  const start = lines.findIndex((line) => head.test(line));
  if (start < 0) return '';
  const end = lines.findIndex((line, i) => i > start && line === '  }');
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

/**
 * Часть тела метода до первого раннего выхода: `if (...) return;` или блока
 * `if (...) {` с `return` внутри, оба на первом уровне. Что стоит ниже,
 * при входе может и не исполниться.
 */
export function beforeEarlyReturn(body: string): string {
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (/^ {4}(?:if \(.*\) )?return\b/.test(line)) return lines.slice(0, i).join('\n');
    if (/^ {4}if \(.*\) \{$/.test(line)) {
      for (let j = i + 1; j < lines.length && !/^ {4}\S/.test(lines[j] ?? ''); j++) {
        if (/^ {6}return\b/.test(lines[j] ?? '')) return lines.slice(0, i).join('\n');
      }
    }
  }
  return body;
}

/** Всё, что исполняется при входе: init, create и методы, вызванные из них отдельным оператором. */
export function entryCode(source: string): string {
  const seen = new Set<string>();
  const queue = ['init', 'create'];
  let code = '';
  while (queue.length > 0) {
    const name = queue.pop() ?? '';
    if (seen.has(name)) continue;
    seen.add(name);
    const body = beforeEarlyReturn(methodBody(source, name));
    code += `${body}\n`;
    for (const call of body.matchAll(/^ {4}(?:void |await )?this\.(\w+)\(/gm)) {
      queue.push(call[1] ?? '');
    }
  }
  return code;
}

const LITERAL = /^(?:true|false|null|-?\d+(?:\.\d+)?|'[^']*'|"[^"]*")$/;

/**
 * Поле присвоено заново (или очищено на месте, если оно readonly).
 *
 * Считаются только операторы первого уровня тела метода: присваивание внутри
 * обработчика или условия случится когда-нибудь, а не при входе. Литерал,
 * отличный от начального (`secretLit = true` при начальном `false`), —
 * это не сброс, а перемена состояния.
 */
export function isReset(code: string, name: string, initial: string): boolean {
  const top = code.split('\n').filter((line) => /^ {4}\S/.test(line));
  const inPlace = new RegExp(`^\\s*this\\.${name}(?:\\.length\\s*=\\s*0|\\.clear\\(\\));`);
  const assign = new RegExp(`^\\s*this\\.${name}\\s*=(?!=)\\s*(.+);$`);
  return top.some((line) => {
    if (inPlace.test(line)) return true;
    const value = assign.exec(line)?.[1]?.trim();
    if (value === undefined) return false;
    return !LITERAL.test(value) || !LITERAL.test(initial) || value === initial;
  });
}

/** Поля сцены, которые вход не сбрасывает (`имя = начальное`). */
export function unreset(source: string, keep: (field: Field) => boolean = () => true): string[] {
  const code = entryCode(source);
  return declaredFields(source)
    .filter(keep)
    .filter((field) => !isReset(code, field.name, field.initial))
    .map((field) => `${field.name} = ${field.initial}`);
}

const sceneFiles = readdirSync(SCENES_DIR).filter((file) => /Scene\.ts$/.test(file));

describe('состояние сцены сбрасывается при входе', () => {
  it('сцены нашлись', () => {
    expect(sceneFiles.length).toBeGreaterThan(20);
  });

  for (const file of sceneFiles) {
    const scene = file.replace('.ts', '');
    it(`${scene}: каждое поле с начальным значением присваивается в init/create`, () => {
      const source = readFileSync(join(SCENES_DIR, file), 'utf8');
      const missing = unreset(source, (field) => EXEMPT[`${scene}.${field.name}`] === undefined);
      expect(missing, `${scene}: поля переживут выход из сцены`).toEqual([]);
    });
  }

  it('исключения не устарели: поле существует и правда не сбрасывается', () => {
    for (const key of Object.keys(EXEMPT)) {
      const [scene = '', name = ''] = key.split('.');
      const source = readFileSync(join(SCENES_DIR, `${scene}.ts`), 'utf8');
      const field = declaredFields(source).find((one) => one.name === name);
      expect(field, `${key}: поля нет — уберите из EXEMPT`).toBeDefined();
      expect(
        isReset(entryCode(source), name, field?.initial ?? ''),
        `${key} уже сбрасывается — уберите из EXEMPT`,
      ).toBe(false);
    }
  });

  it('проверка отличает сброс от перемены состояния', () => {
    const scene = [
      'class S {',
      '  private busy = false;',
      '  private lit = false;',
      '  private target: number | null = null;',
      '  private list: number[] = [];',
      '  init(): void {',
      '    this.busy = false;',
      '    this.target = data.level;',
      '    this.list.length = 0;',
      '    this.arm();',
      '  }',
      '  create(): void {',
      '    this.events.once(X, () => this.leave());',
      '    this.on(() => {',
      '      this.lit = false;',
      '    });',
      '  }',
      '  private arm(): void {',
      '    if (x) return;',
      '    this.lit = true;',
      '  }',
      '  private leave(): void {',
      '    this.busy = true;',
      '  }',
      '}',
    ].join('\n');
    const code = entryCode(scene);
    const fields = new Map(declaredFields(scene).map((f) => [f.name, f.initial]));
    expect(isReset(code, 'busy', fields.get('busy') ?? '')).toBe(true);
    expect(isReset(code, 'target', fields.get('target') ?? '')).toBe(true);
    expect(isReset(code, 'list', fields.get('list') ?? '')).toBe(true);
    // lit: `= true` в вызванном методе и `= false` внутри обработчика — не сброс.
    expect(isReset(code, 'lit', fields.get('lit') ?? '')).toBe(false);
  });

  it('видит поля со стрелкой в типе и в значении и не принимает за состояние стрелочную функцию', () => {
    const scene = [
      'class S {',
      '  private keyBack: (() => void) | null = null;',
      '  private presses = new Map<number, () => void>();',
      '  private readonly handler = (): void => this.leave();',
      '  private pick: () => void = () => undefined;',
      '  private fine = false;',
      '  init(): void {',
      '    this.fine = false;',
      '  }',
      '  create(): void {',
      '    this.leave();',
      '  }',
      '}',
    ].join('\n');
    const names = declaredFields(scene).map((field) => field.name);
    expect(names).toEqual(['keyBack', 'presses', 'pick', 'fine']);
    expect(unreset(scene)).toEqual([
      'keyBack = null',
      'presses = new Map<number, () => void>()',
      'pick = () => undefined',
    ]);
  });

  it('сбросом считается только то, что стоит до раннего выхода', () => {
    const scene = [
      'class S {',
      '  private early = false;',
      '  private blocked = false;',
      '  private late = false;',
      '  private ok = false;',
      '  init(): void {',
      '    this.ok = false;',
      '  }',
      '  create(): void {',
      '    this.early = false;',
      '    this.arm();',
      '    if (x) return;',
      '    this.late = false;',
      '    this.tail();',
      '  }',
      '  private arm(): void {',
      '    this.blocked = false;',
      '  }',
      '  private tail(): void {',
      '    this.late = false;',
      '    this.blocked = false;',
      '  }',
      '}',
    ].join('\n');
    expect(unreset(scene)).toEqual(['late = false']);

    const block = [
      'class S {',
      '  private a = false;',
      '  init(): void {',
      '  }',
      '  create(): void {',
      '    if (x) {',
      '      return;',
      '    }',
      '    this.a = false;',
      '  }',
      '}',
    ].join('\n');
    expect(unreset(block)).toEqual(['a = false']);
  });
});
