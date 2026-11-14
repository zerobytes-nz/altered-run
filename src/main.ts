import Phaser from 'phaser';
import { GAME_W, GAME_H, DEBUG } from './config';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { RunScene } from './scenes/RunScene';
import { GameOverScene } from './scenes/GameOverScene';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: GAME_W,
  height: GAME_H,
  backgroundColor: '#0b1020',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  render: { antialias: true, powerPreference: 'high-performance', roundPixels: false },
  fps: { target: 60, smoothStep: true },
  input: { activePointers: 2 },
  disableContextMenu: true,
  banner: false,
  audio: { noAudio: true }, // sound arrives in milestone 3
  scene: [BootScene, MenuScene, RunScene, GameOverScene],
});

if (DEBUG) (window as unknown as { __game: Phaser.Game }).__game = game;
