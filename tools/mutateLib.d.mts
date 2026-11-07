// Типы для импорта tools/mutateLib.mjs из тестов: сами скрипты инструментов
// живут вне tsconfig.
export interface Mutant {
  id: string;
  file: string;
  find: string;
  replace: string;
  note: string;
}
export const ALWAYS: string[];
export function sha1(data: string | Buffer): string;
export class Snapshot {
  constructor(root: string);
  root: string;
  kind(rel: string): 'file' | 'dir' | null;
  read(rel: string): Buffer | null;
  text(rel: string): string | null;
  hash(rel: string): string;
  list(rel: string): string[];
  preload(dirs: string[]): void;
}
export function importSpecs(text: string): string[];
export function resolveImport(snap: Snapshot, fromRel: string, spec: string): string | null;
export function importClosure(snap: Snapshot, startRel: string): string[];
export function stripComments(text: string): string;
export function textReads(snap: Snapshot, fromRel: string, text: string): string[];
export function dependencies(snap: Snapshot, witnesses: string[]): string[];
export function mutantKey(
  snap: Snapshot,
  mutant: Pick<Mutant, 'file' | 'find' | 'replace'>,
  mutatedText: string,
  witnesses: string[],
): string;
export function failedFiles(report: unknown, root: string): string[];
export function cacheDir(root: string): string;
export function copiesBase(root: string): string;
export function copyDirs(root: string, jobs: number): string[];
export function assertCopyDir(root: string, dir: string): void;
export function acquireLock(
  root: string,
  pid?: number,
  isAlive?: (pid: number) => boolean,
): () => void;
