import Phaser from 'phaser';
import manifest from '../assets.manifest.json';
import urls from 'virtual:asset-urls';
import type { Loadout } from './loadout';

/**
 * All art/sound comes from assets.manifest.json. Game code refers to assets by manifest
 * key only (e.g. `hero.ninja.run`); paths, sizes and frame data live in the manifest.
 */
export interface AssetDef {
  key: string;
  type: 'image' | 'spritesheet' | 'audio';
  path: string;
  width: number; height: number;
  frameWidth: number; frameHeight: number; frameCount: number;
  displayScale: number;
  animation?: { frameRate: number; repeat: number };
  tile?: boolean;
}

const DEFS = new Map<string, AssetDef>((manifest.assets as AssetDef[]).map((a) => [a.key, a]));

export function asset(key: string): AssetDef {
  const a = DEFS.get(key);
  if (!a) throw new Error(`Unknown asset key "${key}" (not in assets.manifest.json)`);
  return a;
}

/** Display scale for a key (art is authored at 2× the game's logical size). */
export const scaleOf = (key: string): number => asset(key).displayScale;

/** Hero sheets are big, so only the selected skin's are loaded up front. */
const isOptional = (key: string) => key.startsWith('hero.');
const neededFor = (lo: Loadout) => (key: string) => !isOptional(key) || key.startsWith(`hero.${lo.skin.id}.`);

function queue(scene: Phaser.Scene, filter: (key: string) => boolean): number {
  let n = 0;
  for (const a of DEFS.values()) {
    if (!filter(a.key) || scene.textures.exists(a.key) || scene.cache.audio.exists(a.key)) continue;
    const url = urls[a.key];
    if (a.type === 'spritesheet') scene.load.spritesheet(a.key, url, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
    else if (a.type === 'image') scene.load.image(a.key, url);
    else scene.load.audio(a.key, url);
    n++;
  }
  return n;
}

function createAnims(scene: Phaser.Scene): void {
  for (const a of DEFS.values()) {
    if (!a.animation || scene.anims.exists(a.key) || !scene.textures.exists(a.key)) continue;
    scene.anims.create({
      key: a.key,
      frames: scene.anims.generateFrameNumbers(a.key, { start: 0, end: a.frameCount - 1 }),
      frameRate: a.animation.frameRate || 10,
      repeat: a.animation.repeat,
    });
  }
}

/** Call from a scene's preload(). */
export function preloadFor(scene: Phaser.Scene, lo: Loadout): void {
  queue(scene, neededFor(lo));
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => createAnims(scene));
}

/** Load whatever the loadout still needs, then run `done` (immediately if nothing is missing). */
export function ensureLoaded(scene: Phaser.Scene, lo: Loadout, done: () => void): void {
  if (queue(scene, neededFor(lo)) === 0) { createAnims(scene); done(); return; }
  scene.load.once(Phaser.Loader.Events.COMPLETE, () => { createAnims(scene); done(); });
  scene.load.start();
}
