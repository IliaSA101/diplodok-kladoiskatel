/**
 * Старты сцен в журнал (design 001, раздел 7): какая сцена и с какими данными.
 * По ним видно и открытый узел квеста, и набор с игрой английского.
 *
 * Список сцен появляется только после `READY` (`SceneManager.bootQueue`), поэтому подписка
 * идёт после него. Самая первая сцена к этому часу могла уже стартовать, и её START мы
 * пропустили бы: такие записываются сразу.
 */
import Phaser from 'phaser';

/** Пишет запись о старте. `detail` — `{ key, data }`. */
type NoteScene = (detail: { key: string; data: unknown }) => void;

export function trackScenes(game: Phaser.Game, note: NoteScene): void {
  game.events.once(Phaser.Core.Events.READY, () => {
    for (const scene of game.scene.scenes) {
      const record = (): void => {
        try {
          note({ key: scene.sys.settings.key, data: scene.sys.settings.data });
        } catch {
          /* журнал не вправе ломать игру */
        }
      };
      scene.events.on(Phaser.Scenes.Events.START, record);
      if (scene.sys.isActive()) record();
    }
  });
}
