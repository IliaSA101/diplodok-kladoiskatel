// Типы для импорта tools/shots.mjs из vite.config.ts и тестов: сами скрипты
// инструментов живут вне tsconfig.
export const SHOTS_DIR: string;
export const SHOTS_URL: string;
export function lastLook(root?: string): number;
export function fingerprints(root?: string): Record<string, string>;
export function staleScreens(root?: string): string[];
export function shotsDisturbed(root?: string): string[];
