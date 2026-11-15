import Phaser from 'phaser';
import { GAME_W, GAME_H, GROUND_Y, HERO_X, RUN, SCORE, POWER, DEBUG } from '../config';
import { asset, scaleOf, heroHoldsWeapon } from '../assets';
import { guestLoadout, type Loadout } from '../loadout';
import { ELEMENT_COLOR, ELEMENT_ICON, POWER_NAME, hex, type Element } from '../awi';
import { GestureInput, type Gesture } from '../systems/input';
import { bestScore } from '../systems/highscores';
import { sfx, startMusic, stopMusic } from '../systems/audio';
import { muteButton, slotRow, text } from '../ui';
import type { RunResult } from './GameOverScene';

// ─────────────────────────────────────────────────────────────────────────────
// Obstacles. Every kind asks something of the player, and an AWI makes it easier:
//   spike / bar   jump / slide                      (any loadout)
//   crate         jump onto it, or smash it          (weapon, Robot stomp)
//   slime         stomp it or hit it                 (weapon)
//   fly           head height: slide under or hit    (Kunai reaches it early)
//   armour        4 HP and too tall to jump          (Hammer 1 hit, Sword 2, Kunai 4 from range; Feather hops it; Robot stomps it)
//   rock          falls from the sky onto its shadow (smash it as it lands; Shield blocks it)
//   pit           a hole; wide ones have a ledge     (Feather clears them; Fire / Shadow / Ice powers make them safe)
//   ledge         one-way platform, often with coins (Feather / Magnet / pets reach the coins)
// ─────────────────────────────────────────────────────────────────────────────
type Kind = 'spike' | 'crate' | 'bar' | 'slime' | 'flag' | 'fly' | 'armor' | 'rock' | 'ledge' | 'pit';

interface Ob {
  img: Phaser.GameObjects.Sprite;
  kind: Kind;
  alive: boolean;   // collidable
  hx: number; hy: number; hw: number; hh: number; // hitbox relative to the image's (x, bottom)
  vx: number;       // own motion on top of the world scroll (px/s, negative = towards hero)
  vy: number;       // rocks: fall speed
  hp: number;
  kick: number;     // knock-back still to apply (px)
  swing: number;    // id of the last swing that hit it (one hit per swing)
  baseY: number;    // flies: bob around this
  falling: boolean; // rocks: still in the air
  armed: boolean;   // rocks: started falling
  frozen: boolean;  // Ice power
  minGap: number;   // closest the hero came (for near-miss slow-mo)
  passed: boolean;
  w: number;        // pits: width
  shadow?: Phaser.GameObjects.Image;
}

interface Coin { img: Phaser.GameObjects.Sprite; alive: boolean; pulled: boolean; }
interface Shot { img: Phaser.GameObjects.Image; alive: boolean; dist: number; }

const HITBOX: Record<Kind, [number, number, number, number]> = {
  spike: [-21, -32, 42, 32],
  crate: [-26, -54, 52, 54],
  bar: [-34, -352, 68, 352 - 10],
  slime: [-22, -36, 44, 36],
  flag: [0, 0, 0, 0],
  fly: [-20, -32, 40, 28],
  armor: [-34, -205, 68, 205], // art is 128×340 at 0.62 scale
  rock: [-20, -42, 40, 40],
  ledge: [-94, -44, 188, 10],
  pit: [0, 0, 0, 0],
};
const TEX: Record<Kind, string> = {
  spike: 'obj.spike', crate: 'obj.crate', bar: 'obj.bar', slime: 'enemy.slime', flag: 'obj.flag',
  fly: 'enemy.fly', armor: 'enemy.armor', rock: 'obj.rock', ledge: 'obj.ledge', pit: 'obj.pit',
};
const HP: Partial<Record<Kind, number>> = { crate: 1, slime: 1, fly: 1, rock: 1, armor: 4 };
const DAMAGEABLE = new Set<Kind>(['crate', 'slime', 'fly', 'rock', 'armor']);
const PLATFORM = new Set<Kind>(['crate', 'ledge']);
const KILL_SCORE: Partial<Record<Kind, number>> = { slime: SCORE.kill, fly: SCORE.kill, armor: SCORE.kill * 3, crate: SCORE.crate, rock: SCORE.crate };

const HERO_HALF_W = 15;
const HERO_STAND_H = 82;
const HERO_SLIDE_H = 36;
const COYOTE_MS = 90;
const JUMP_BUFFER_MS = 140;
const PIT_TOP = GROUND_Y - 6;

export class RunScene extends Phaser.Scene {
  private lo!: Loadout;
  private gestures!: GestureInput;
  private gbuf: Gesture[] = [];

  // world
  private bgFar!: Phaser.GameObjects.TileSprite;
  private bgNear!: Phaser.GameObjects.TileSprite;
  private ground!: Phaser.GameObjects.TileSprite;
  private obs: Ob[] = [];
  private coins: Coin[] = [];
  private shots: Shot[] = [];
  private flag: Ob | null = null;
  private nextSpawn = 0;
  private finishing = false;

  // hero
  private hero!: Phaser.GameObjects.Sprite;
  private heroScale = 1;
  private sqX = 1; private sqY = 1; // squash & stretch
  private weapon!: Phaser.GameObjects.Image;
  private slash!: Phaser.GameObjects.Image;
  private pet!: Phaser.GameObjects.Sprite;
  private shieldRing!: Phaser.GameObjects.Arc;
  private vy = 0;
  private onGround = true;
  private lastGroundAt = 0;
  private airJumps = 0;
  private jumpBufferUntil = 0;
  private slideQueued = false;
  private slideUntil = 0;
  private attackUntil = 0;
  private attackReadyAt = 0;
  private swingId = 0;
  private invulnUntil = 0;
  private visual = '';
  private jumpFrames = 1;
  private dead = false;
  private ended = false;
  private hitStopUntil = 0;   // scene time (ms): freeze the world briefly on impacts
  private slowUntil = 0; private slowScale = 1;

  // pet
  private petX = 0; private petY = 0; private petReadyAt = 0;

  // run stats
  private now = 0;
  private elapsed = 0;
  private speed: number = RUN.speedStart;
  private distance = 0;
  private coinCount = 0;
  private kills = 0;
  private crates = 0;
  private bonus = 0;
  private hearts: number = RUN.hearts;
  private shield = 0;
  private shieldRechargeAt = 0;
  private combo = 0; private comboUntil = 0;

  // POWER
  private meter = 0;
  private powerEl: Element = 'Fire';
  private powerUntil = 0;
  private coinPullUntil = 0;

  // HUD
  private heartImgs: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private meterFill!: Phaser.GameObjects.Rectangle;
  private meterLabel!: Phaser.GameObjects.Text;
  private powerBtn!: Phaser.GameObjects.Container;
  private comboText!: Phaser.GameObjects.Text;
  private vignette!: Phaser.GameObjects.Graphics;
  private fpsText?: Phaser.GameObjects.Text;
  private hudTick = 0;
  private lastScoreShown = -1;
  private popups: Phaser.GameObjects.Text[] = [];
  private flyCoins: Phaser.GameObjects.Image[] = [];

  // FX
  private coinFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hitFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private slashFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private speedFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private powerFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private bolts!: Phaser.GameObjects.Graphics;

  constructor() { super('Run'); }

  init(data: { loadout?: Loadout }): void {
    this.lo = data?.loadout ?? guestLoadout();
    // Reset all per-run state (the scene instance is reused between runs).
    this.obs = []; this.coins = []; this.shots = []; this.flag = null; this.heartImgs = []; this.popups = []; this.flyCoins = [];
    this.nextSpawn = 2.2 * RUN.speedStart; this.finishing = false;
    this.vy = 0; this.onGround = true; this.lastGroundAt = 0; this.airJumps = this.lo.trinket.airJumps ?? 0;
    this.jumpBufferUntil = 0; this.slideQueued = false; this.slideUntil = 0; this.attackUntil = 0; this.attackReadyAt = 0; this.swingId = 0;
    this.invulnUntil = 0; this.visual = ''; this.dead = false; this.ended = false; this.hitStopUntil = 0; this.slowUntil = 0; this.slowScale = 1;
    this.sqX = 1; this.sqY = 1;
    this.now = 0; this.elapsed = 0; this.speed = RUN.speedStart; this.distance = 0;
    this.coinCount = 0; this.kills = 0; this.crates = 0; this.bonus = 0; this.hearts = this.lo.hearts;
    this.shield = this.lo.trinket.shield ?? 0; this.shieldRechargeAt = 0; this.combo = 0; this.comboUntil = 0;
    this.meter = 0; this.powerEl = this.lo.element; this.powerUntil = 0; this.coinPullUntil = 0;
    this.hudTick = 0; this.lastScoreShown = -1; this.petReadyAt = 0;
  }

  create(): void {
    // Day sky: the bottom colour matches GameArt2D's BG.png, whose own sky is keyed out of bg.far.
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x7fd0f2, 0x7fd0f2, 0xddf8ff, 0xddf8ff, 1);
    sky.fillRect(0, 0, GAME_W, GROUND_Y);
    this.add.circle(560, 110, 34, 0xfff4b8, 0.95);
    this.bgFar = this.add.tileSprite(0, GROUND_Y - 30, GAME_W, 220, 'bg.far').setOrigin(0, 1).setTileScale(scaleOf('bg.far'));
    this.bgNear = this.add.tileSprite(0, GROUND_Y + 4, GAME_W, 160, 'bg.near').setOrigin(0, 1).setTileScale(scaleOf('bg.near'));
    this.ground = this.add.tileSprite(0, GROUND_Y - 6, GAME_W, GAME_H - GROUND_Y + 6, 'bg.ground').setOrigin(0).setTileScale(scaleOf('bg.ground'));

    // Hero, weapon, pet
    const skin = this.lo.skin.id;
    this.jumpFrames = asset(`hero.${skin}.jump`).frameCount;
    const petKey = `pet.${this.lo.pet.id}`;
    this.pet = this.add.sprite(HERO_X - 70, GROUND_Y - 110, petKey).setScale(scaleOf(petKey)).play(petKey).setDepth(6);
    this.petX = this.pet.x; this.petY = this.pet.y;
    this.heroScale = scaleOf(`hero.${skin}.run`);
    this.hero = this.add.sprite(HERO_X, GROUND_Y, `hero.${skin}.run`).setOrigin(0.5, 1).setDepth(5).setScale(this.heroScale);
    const wKey = `weapon.${this.lo.weapon.id}`;
    this.weapon = this.add.image(HERO_X, GROUND_Y - 50, wKey).setOrigin(0.12, 0.5).setDepth(6).setScale(scaleOf(wKey));
    // Real hero art (knight, ninja, robot) already holds a weapon: don't draw a second one on top.
    this.weapon.setVisible(!heroHoldsWeapon(skin));
    this.slash = this.add.image(0, 0, 'fx.slash').setOrigin(0.25, 0.5).setDepth(6).setVisible(false);
    this.shieldRing = this.add.circle(HERO_X, GROUND_Y - 44, 56).setStrokeStyle(4, 0x4cc9f0, 0.8).setDepth(6).setVisible(this.shield > 0);

    const dotS = scaleOf('fx.dot'), pxS = scaleOf('fx.px');
    this.coinFx = this.add.particles(0, 0, 'fx.dot', {
      lifespan: 380, speed: { min: 60, max: 200 }, scale: { start: 1.1 * dotS, end: 0 }, tint: 0xffd34d, emitting: false,
    }).setDepth(7);
    this.hitFx = this.add.particles(0, 0, 'fx.px', {
      lifespan: 520, speed: { min: 120, max: 360 }, gravityY: 900, scale: { start: 2 * pxS, end: 0.5 * pxS },
      tint: [0xffffff, 0xb07a43, 0x80b918], emitting: false,
    }).setDepth(7);
    this.slashFx = this.add.particles(0, 0, 'fx.dot', {
      lifespan: 260, speedX: { min: 160, max: 420 }, speedY: { min: -90, max: 90 }, scale: { start: 0.8 * dotS, end: 0 },
      tint: this.lo.weapon.tint, blendMode: 'ADD', emitting: false,
    }).setDepth(7);
    this.dustFx = this.add.particles(0, 0, 'fx.dot', {
      lifespan: 340, speedX: { min: -140, max: 60 }, speedY: { min: -70, max: -10 }, scale: { start: 0.9 * dotS, end: 0 },
      tint: 0xd8c8a8, alpha: { start: 0.7, end: 0 }, emitting: false,
    }).setDepth(4);
    // Speed lines: thin streaks from the right edge, more of them as the run speeds up.
    this.speedFx = this.add.particles(GAME_W + 20, 0, 'fx.px', {
      y: { min: 40, max: GROUND_Y - 30 }, lifespan: 420, speedX: { min: -2200, max: -1500 },
      scaleX: { min: 24 * pxS, max: 56 * pxS }, scaleY: 0.7 * pxS, alpha: { start: 0.55, end: 0 }, frequency: -1,
    }).setDepth(8);
    this.powerFx = this.add.particles(0, 0, 'fx.dot', {
      lifespan: 420, speedX: { min: -320, max: -120 }, speedY: { min: -60, max: 60 }, scale: { start: 1.2 * dotS, end: 0 },
      tint: ELEMENT_COLOR[this.powerEl], blendMode: 'ADD', frequency: -1,
    }).setDepth(4);
    this.bolts = this.add.graphics().setDepth(9);

    // Pre-warm pools so the first obstacles don't allocate mid-run.
    for (let i = 0; i < 14; i++) this.getOb('spike');
    for (let i = 0; i < 40; i++) this.getCoin(-200, -200);
    for (const o of this.obs) this.free(o);
    for (const c of this.coins) { c.alive = false; c.img.setActive(false).setVisible(false); }
    for (let i = 0; i < 4; i++) this.shots.push({ img: this.add.image(-100, -100, wKey).setScale(scaleOf(wKey)).setDepth(6).setVisible(false), alive: false, dist: 0 });

    this.buildHud();
    this.gestures = new GestureInput(this);
    startMusic();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopMusic);
  }

  /** Freeze the world for a few frames so hits feel heavy. Input is kept and handled after. */
  private hitStop(ms: number): void { this.hitStopUntil = Math.max(this.hitStopUntil, this.time.now + ms); }
  /** Slow motion for a moment (near misses, last heart). */
  private slowMo(scale: number, ms: number): void { this.slowScale = scale; this.slowUntil = this.time.now + ms; }

  // ───────────────────────────── HUD ─────────────────────────────

  private buildHud(): void {
    const hud = this.add.container(0, 0).setDepth(20);
    for (let i = 0; i < this.lo.hearts; i++) {
      const h = this.add.image(26 + i * 32, 26, 'ui.heart').setScale(scaleOf('ui.heart'));
      this.heartImgs.push(h); hud.add(h);
    }
    this.scoreText = text(this, 14, 46, '0', 30, '#ffffff', '900').setStroke('#2b2440', 6);
    this.coinText = text(this, 16, 86, '● 0', 18, '#ffd34d', '800').setStroke('#2b2440', 4);
    const best = bestScore();
    const bestT = text(this, 24 + this.lo.hearts * 32, 18, best ? `BEST ${best}` : '', 13, '#ffffff', '700').setStroke('#2b2440', 3);
    // POWER meter under the coins: coins and kills fill it.
    const meterBg = this.add.rectangle(16, 122, 150, 12, 0x2b2440, 0.6).setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff, 0.6);
    this.meterFill = this.add.rectangle(16, 122, 1, 12, ELEMENT_COLOR[this.powerEl]).setOrigin(0, 0.5);
    this.meterLabel = text(this, 172, 122, `${ELEMENT_ICON[this.powerEl]} POWER`, 13, '#ffffff', '800').setOrigin(0, 0.5).setStroke('#2b2440', 3);
    // Run progress → finish flag
    const pw = 220, px = GAME_W / 2 - pw / 2;
    const track = this.add.rectangle(px, 20, pw, 10, 0x2b2440, 0.5).setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff, 0.6);
    this.progressFill = this.add.rectangle(px, 20, 1, 10, 0x80ffdb).setOrigin(0, 0.5);
    const flag = this.add.image(px + pw + 12, 20, 'obj.flag').setScale(scaleOf('obj.flag') * 0.18);
    hud.add([this.scoreText, this.coinText, bestT, meterBg, this.meterFill, this.meterLabel, track, this.progressFill, flag]);
    // The four AWI slots, always on screen.
    const slots = slotRow(this, GAME_W - (4 * 52 + 3 * 14) - 12, 22, this.lo, 52, 14, true, 12);
    slots.setAlpha(0.92);
    hud.add(slots);
    this.comboText = text(this, GAME_W / 2, 64, '', 30, '#ffd34d', '900').setOrigin(0.5).setStroke('#2b2440', 7).setDepth(21).setAlpha(0);

    // POWER button (bottom right). Swipe left, Q or E work too.
    const r = 38, col = ELEMENT_COLOR[this.powerEl];
    const ring = this.add.circle(0, 0, r, 0x2b2440, 0.55).setStrokeStyle(4, col, 1);
    const icon = text(this, 0, -4, ELEMENT_ICON[this.powerEl], 30, '#ffffff').setOrigin(0.5);
    const lbl = text(this, 0, r - 12, 'POWER', 11, '#ffffff', '900').setOrigin(0.5).setStroke('#2b2440', 3);
    this.powerBtn = this.add.container(GAME_W - 56, GAME_H - 58, [ring, icon, lbl]).setDepth(21).setAlpha(0.45).setSize(r * 2, r * 2);
    ring.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.activatePower());
    muteButton(this, 30, GAME_H - 30, 18).setDepth(21).setAlpha(0.85);

    // Red edge when on the last heart.
    this.vignette = this.add.graphics().setDepth(19).setAlpha(0);
    this.vignette.lineStyle(26, 0xff2244, 0.5).strokeRect(0, 0, GAME_W, GAME_H);
    if (DEBUG) this.fpsText = text(this, 64, GAME_H - 28, '', 14, '#2b2440', '700').setDepth(30);
  }

  private updateHud(): void {
    this.progressFill.width = Math.max(1, 220 * Math.min(1, this.elapsed / RUN.durationSec));
    this.meterFill.width = Math.max(1, 150 * this.meter);
    const ready = this.meter >= 1 && !this.powerActive();
    this.powerBtn.setAlpha(ready ? 1 : 0.45).setScale(ready ? 1 + Math.sin(this.now / 120) * 0.06 : 1);
    this.vignette.setAlpha(this.hearts === 1 && !this.dead ? 0.55 + Math.sin(this.now / 160) * 0.35 : 0);
    if (++this.hudTick % 6 !== 0) return; // text re-rasterises: update ~10×/s, only on change
    const s = this.score();
    if (s !== this.lastScoreShown) { this.scoreText.setText(String(s)); this.lastScoreShown = s; }
    if (this.fpsText && this.hudTick % 30 === 0) {
      this.fpsText.setText(`${this.game.loop.actualFps.toFixed(0)} fps · ${this.obs.length + this.coins.length} pooled`);
    }
  }

  private score(): number {
    const base = this.distance * SCORE.perPixel + this.coinCount * SCORE.coin + this.bonus;
    return Math.floor(base * (this.lo.trinket.scoreMul ?? 1));
  }

  /** Floating text (damage numbers, +score, CLOSE!). Pooled. */
  private popup(x: number, y: number, s: string, color = '#ffffff', size = 20): void {
    let t = this.popups.find((p) => !p.active);
    if (!t) { t = text(this, 0, 0, '', size, color, '900').setOrigin(0.5).setStroke('#2b2440', 5).setDepth(18); this.popups.push(t); }
    const p = t;
    this.tweens.killTweensOf(p);
    p.setActive(true).setVisible(true).setText(s).setColor(color).setFontSize(size).setPosition(x, y).setAlpha(1).setScale(0.6);
    this.tweens.add({ targets: p, scale: 1, duration: 120, ease: 'Back.Out' });
    this.tweens.add({ targets: p, y: y - 46, alpha: 0, delay: 260, duration: 420, onComplete: () => p.setActive(false).setVisible(false) });
  }

  private bump(t: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, s = 1.35): void {
    this.tweens.killTweensOf(t);
    t.setScale(s);
    this.tweens.add({ targets: t, scale: 1, duration: 220, ease: 'Back.Out' });
  }

  // ───────────────────────────── Pools ─────────────────────────────

  private getOb(kind: Kind): Ob {
    let o = this.obs.find((x) => !x.img.active);
    if (!o) {
      o = {
        img: this.add.sprite(0, 0, TEX[kind]).setDepth(4), kind, alive: true, hx: 0, hy: 0, hw: 0, hh: 0, vx: 0, vy: 0,
        hp: 1, kick: 0, swing: -1, baseY: 0, falling: false, armed: false, frozen: false, minGap: 1e9, passed: false, w: 0,
      };
      this.obs.push(o);
    }
    this.tweens.killTweensOf(o.img);
    const [hx, hy, hw, hh] = HITBOX[kind];
    Object.assign(o, { kind, alive: true, hx, hy, hw, hh, vx: 0, vy: 0, hp: HP[kind] ?? 1, kick: 0, swing: -1, falling: false, armed: false,
      frozen: this.powerActive('Ice'), minGap: 1e9, passed: false, w: 0 });
    o.img.anims.stop();
    o.img.setActive(true).setVisible(true).setAlpha(1).setAngle(0).setOrigin(0.5, 1).setTexture(TEX[kind], 0).setScale(scaleOf(TEX[kind]))
      .setDepth(kind === 'pit' ? 1 : kind === 'ledge' ? 3 : 4);
    if (o.frozen) o.img.setTint(0x9fe8ff); else o.img.clearTint();
    if (kind === 'slime') { o.img.play(TEX.slime); o.vx = -70; }
    if (kind === 'fly') { o.img.play(TEX.fly); o.vx = -90; }
    if (kind === 'armor') { o.img.play(TEX.armor); o.vx = -40; }
    if (o.frozen) o.img.anims.pause();
    return o;
  }

  private free(o: Ob): void {
    o.img.setActive(false).setVisible(false); o.alive = false;
    o.shadow?.setVisible(false);
    if (o === this.flag) this.flag = null;
  }

  private getCoin(x: number, y: number): Coin {
    let c = this.coins.find((k) => !k.img.active);
    if (!c) {
      c = { img: this.add.sprite(0, 0, 'obj.coin').setDepth(3).setScale(scaleOf('obj.coin')).play('obj.coin'), alive: true, pulled: false };
      this.coins.push(c);
    }
    c.alive = true; c.pulled = false;
    c.img.setActive(true).setVisible(true).setPosition(x, y);
    return c;
  }

  private place(kind: Kind, x: number, yBottom = GROUND_Y): Ob {
    const o = this.getOb(kind);
    o.img.setPosition(x, yBottom);
    return o;
  }

  // ───────────────────────────── Spawning ─────────────────────────────

  private spawnPattern(): number {
    const p = this.elapsed / RUN.durationSec;
    const x = GAME_W + 80;
    const table: [string, number][] = [
      ['spike', 2.6],
      ['crate', 1.6],
      ['bar', p > 0.08 ? 1.6 : 0.3],
      ['slime', p > 0.1 ? 2 : 0.4],
      ['fly', p > 0.12 ? 1.6 : 0],
      ['pit', p > 0.08 ? 1.5 : 0],
      ['high', p > 0.12 ? 1 : 0],
      ['rock', p > 0.2 ? 1.1 : 0],
      ['armor', p > 0.22 ? 1.1 : 0],
      ['widePit', p > 0.3 ? 1.1 : 0],
      ['spike2', p > 0.3 ? 1.1 : 0],
      ['crate2', p > 0.25 ? 0.8 : 0],
      ['coins', 0.7],
    ];
    let r = Math.random() * table.reduce((a, [, w]) => a + w, 0);
    let pick = 'spike';
    for (const [k, w] of table) { if ((r -= w) <= 0) { pick = k; break; } }
    return this.spawn(pick, x);
  }

  /** Place one pattern at x; returns how much room it takes. Public so ?debug can force patterns. */
  spawn(pick: string, x = GAME_W + 80): number {
    const air = (2 * RUN.jumpVelocity) / RUN.gravity; // seconds in the air for one jump
    switch (pick) {
      case 'spike': this.place('spike', x); if (Math.random() < 0.6) this.coinArc(x); return 60;
      case 'spike2': this.place('spike', x); this.place('spike', x + 52); if (Math.random() < 0.5) this.coinArc(x + 26); return 110;
      case 'crate': this.place('crate', x); if (Math.random() < 0.5) this.coinArc(x); return 60;
      case 'crate2': this.place('crate', x); this.place('crate', x, GROUND_Y - 54); return 60;
      case 'bar': this.place('bar', x, GROUND_Y - 44); this.coinLine(x - 40, GROUND_Y - 20, 4, 30); return 80;
      case 'slime': this.place('slime', x); return 60;
      case 'fly': {
        // Head height: slide under, or hit it. Now and then a high one guards a coin line.
        const high = Math.random() < 0.3;
        const o = this.place('fly', x, high ? GROUND_Y - 170 : GROUND_Y - 52);
        o.baseY = o.img.y;
        if (high) this.coinLine(x - 60, GROUND_Y - 200, 4, 34);
        return 80;
      }
      case 'armor': this.place('armor', x); return 90;
      case 'rock': {
        const o = this.place('rock', x + 40, -60);
        o.falling = true; o.armed = false;
        o.shadow ??= this.add.image(0, 0, 'fx.dot').setTint(0x2b2440).setDepth(2);
        o.shadow.setVisible(true).setAlpha(0.25).setScale(3.2 * scaleOf('fx.dot'), 0.8 * scaleOf('fx.dot')).setPosition(o.img.x, GROUND_Y - 2);
        return 90;
      }
      case 'pit': {
        // Narrow: one well-timed jump clears it.
        const w = Math.round(this.speed * air * Phaser.Math.FloatBetween(0.45, 0.62));
        this.placePit(x, w);
        this.coinArcOver(x + w / 2, 3);
        return w + 40;
      }
      case 'widePit': {
        // Wider than one jump: hop on the ledge in the middle, or double jump straight over.
        const w = Math.round(this.speed * air * 1.25);
        this.placePit(x, w);
        this.place('ledge', x + w / 2, GROUND_Y - 84 + 44);
        this.coinLine(x + w / 2 - 60, GROUND_Y - 118, 4, 40);
        return w + 60;
      }
      case 'high': {
        // A high ledge full of coins: double jump, or use the low step first. Magnets and pets can pull them down.
        const step = Math.random() < 0.6;
        if (step) this.place('ledge', x, GROUND_Y - 95 + 44);
        this.place('ledge', x + (step ? 230 : 60), GROUND_Y - 215 + 44);
        this.coinLine(x + (step ? 170 : 0), GROUND_Y - 240, 5, 30);
        return step ? 360 : 220;
      }
      default: this.coinLine(x, GROUND_Y - 30 - (Math.random() < 0.5 ? 0 : 120), 6, 40); return 240;
    }
  }

  private placePit(x: number, w: number): void {
    const o = this.getOb('pit');
    o.alive = false; o.w = w;
    o.img.setOrigin(0, 0).setPosition(x, PIT_TOP).setDisplaySize(w, asset('obj.pit').height * scaleOf('obj.pit'));
  }

  private coinArc(cx: number): void {
    for (let i = -2; i <= 2; i++) this.getCoin(cx + i * 34, GROUND_Y - 120 - (4 - i * i) * 14);
  }

  private coinArcOver(cx: number, n: number): void {
    for (let i = 0; i < n; i++) { const t = n === 1 ? 0 : i / (n - 1) - 0.5; this.getCoin(cx + t * 110, GROUND_Y - 150 + t * t * 120); }
  }

  private coinLine(x: number, y: number, n: number, gap: number): void {
    for (let i = 0; i < n; i++) this.getCoin(x + i * gap, y);
  }

  // ───────────────────────────── Actions ─────────────────────────────

  private handleGesture(g: Gesture): void {
    if (this.dead) return;
    if (g === 'tap' || g === 'swipeUp') this.tryJump();
    else if (g === 'swipeRight') this.tryAttack();
    else if (g === 'swipeDown') this.trySlide();
    else if (g === 'swipeLeft') this.activatePower();
  }

  private jumpVel(air = false): number {
    return (air ? RUN.airJumpVelocity : RUN.jumpVelocity) * (this.lo.skin.jumpMul ?? 1);
  }

  private tryJump(): void {
    const grounded = this.onGround || this.now - this.lastGroundAt < COYOTE_MS;
    if (grounded) {
      this.vy = -this.jumpVel(); this.onGround = false; this.lastGroundAt = -1e9;
      this.slideUntil = 0; this.slideQueued = false;
      this.dustFx.explode(6, this.hero.x, this.hero.y);
      this.sqX = 0.78; this.sqY = 1.25;
      sfx.jump();
    } else if (this.airJumps > 0) {
      this.airJumps--; this.vy = -this.jumpVel(true);
      this.coinFx.explode(8, this.hero.x, this.hero.y - 20);
      this.sqX = 0.8; this.sqY = 1.2;
      sfx.airJump();
    } else {
      this.jumpBufferUntil = this.now + JUMP_BUFFER_MS;
    }
  }

  private trySlide(): void {
    if (this.onGround) {
      this.slideUntil = this.now + RUN.slideMs; this.attackUntil = 0;
      this.dustFx.explode(8, this.hero.x + 10, this.hero.y); this.sqX = 1.2; this.sqY = 0.85;
      sfx.slide();
    } else { this.vy = Math.max(this.vy, RUN.fastFallVelocity); this.slideQueued = true; }
  }

  private tryAttack(): void {
    if (this.now < this.attackReadyAt) return;
    const w = this.lo.weapon;
    this.attackReadyAt = this.now + w.cooldownMs * (this.lo.skin.attackCdMul ?? 1);
    this.slideUntil = 0;
    this.swingId++;
    // Camera kick: a tiny shove in the attack direction.
    const cam = this.cameras.main;
    cam.scrollX = -5; this.tweens.add({ targets: cam, scrollX: 0, duration: 90 });
    if (w.thrown) {
      const s = this.shots.find((k) => !k.alive);
      if (s) { s.alive = true; s.dist = 0; s.img.setVisible(true).setPosition(this.hero.x + 18, this.hero.y - 52).setAngle(0).setTint(w.tint); }
      this.attackUntil = this.now + 160;
      sfx.throw();
      return;
    }
    this.attackUntil = this.now + RUN.attackMs;
    const s = this.slash;
    s.setVisible(true).setAlpha(1).setTint(w.tint).setPosition(this.hero.x + 4, this.hero.y - 48).setScale(w.range / 96, w.id === 'hammer' ? 1.3 : 1);
    this.tweens.add({ targets: s, alpha: 0, duration: RUN.attackMs, onComplete: () => s.setVisible(false) });
    this.slashFx.explode(10, this.hero.x + 20, this.hero.y - 48);
    sfx.slash();
  }

  private powerActive(el?: Element): boolean {
    return this.now < this.powerUntil && (!el || this.powerEl === el);
  }

  /** Fire the element POWER when the coin meter is full. Rarity of the weapon AWI makes it last longer. */
  activatePower(): void {
    if (this.dead || this.meter < 1 || this.powerActive()) return;
    this.meter = 0;
    const el = this.powerEl, mul = this.lo.powerMul, col = ELEMENT_COLOR[el];
    const dur = { Fire: POWER.fireMs, Ice: POWER.iceMs, Storm: POWER.stormPullMs, Shadow: POWER.shadowMs }[el] * mul;
    this.powerUntil = this.now + dur;
    sfx.power(el);
    const cam = this.cameras.main;
    cam.flash(160, (col >> 16) & 255, (col >> 8) & 255, col & 255);
    cam.zoomTo(1.04, 110, 'Sine.easeOut', true, (_c: unknown, p: number) => { if (p === 1) cam.zoomTo(1, 320, 'Sine.easeInOut', true); });
    this.hitStop(80);
    const ring = this.add.circle(this.hero.x, this.hero.y - 44, 30).setStrokeStyle(8, col, 1).setDepth(9);
    this.tweens.add({ targets: ring, scale: 9, alpha: 0, duration: 520, ease: 'Cubic.Out', onComplete: () => ring.destroy() });
    this.comboText.setText(`${ELEMENT_ICON[el]} ${POWER_NAME[el].toUpperCase()}!`).setColor(hex(col)).setAlpha(1);
    this.bump(this.comboText, 1.6);
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 700, duration: 300 });

    if (el === 'Ice') {
      for (const o of this.obs) if (o.img.active && o.kind !== 'ledge' && o.kind !== 'flag') this.freeze(o);
    } else if (el === 'Storm') {
      this.coinPullUntil = this.powerUntil;
      this.powerUntil = this.now + 350; // the strike itself is instant; the coin pull lasts
      this.bolts.clear();
      for (const o of this.obs) {
        if (!o.img.active || !o.alive || !DAMAGEABLE.has(o.kind) || o.img.x > GAME_W + 40) continue;
        this.drawBolt(o.img.x, o.img.y - 30);
        this.damage(o, 99, true);
      }
      this.tweens.add({ targets: this.bolts, alpha: { from: 1, to: 0 }, duration: 320, onComplete: () => this.bolts.clear() });
      sfx.zap();
    }
  }

  private freeze(o: Ob): void {
    o.frozen = true; o.img.setTint(0x9fe8ff); o.img.anims.pause();
  }

  private drawBolt(x: number, y: number): void {
    const g = this.bolts.setAlpha(1);
    const pts: [number, number][] = [[x + Phaser.Math.Between(-40, 40), 0]];
    for (let i = 1; i <= 6; i++) pts.push([x + (i < 6 ? Phaser.Math.Between(-22, 22) : 0), (y * i) / 6]);
    for (const [w, c] of [[7, 0xffe066], [3, 0xffffff]] as const) {
      g.lineStyle(w, c, 1).beginPath().moveTo(pts[0][0], pts[0][1]);
      for (const [px, py] of pts.slice(1)) g.lineTo(px, py);
      g.strokePath();
    }
  }

  /** Hurt the hero. Shield, Fire and Shadow powers protect; pits ignore the shield. */
  private hurt(fromPit = false): void {
    if (this.dead || (!fromPit && this.now < this.invulnUntil)) return;
    if (!fromPit && (this.powerActive('Fire') || this.powerActive('Shadow'))) return;
    if (!fromPit && this.shield > 0) {
      this.shield--; this.shieldRing.setVisible(this.shield > 0);
      this.shieldRechargeAt = this.now + (this.lo.trinket.shieldRechargeMs ?? 15000);
      this.invulnUntil = this.now + 700;
      this.cameras.main.flash(120, 76, 201, 240);
      this.popup(this.hero.x, this.hero.y - 100, 'BLOCKED', '#9fe8ff', 18);
      sfx.shield(); this.hitStop(60);
      return;
    }
    this.hearts--;
    const h = this.heartImgs[this.hearts];
    if (h) { h.setTexture('ui.heartEmpty'); this.bump(h, 1.8); }
    this.invulnUntil = this.now + RUN.hurtInvulnMs;
    this.combo = 0;
    this.cameras.main.shake(140, 0.008);
    this.cameras.main.flash(90, 255, 60, 80);
    sfx.hurt(); this.hitStop(90);
    if (this.hearts === 1) this.slowMo(0.35, 650);
    if (this.hearts <= 0) this.die();
  }

  private die(): void {
    this.dead = true;
    this.vy = -520; this.onGround = false;
    this.weapon.setVisible(false);
    this.cameras.main.shake(320, 0.014);
    sfx.die();
    this.time.delayedCall(1300, () => this.endRun(false));
  }

  /** Damage an obstacle; returns true if it was destroyed. */
  private damage(o: Ob, dmg: number, byPower = false, kick = 170): boolean {
    if (!o.alive) return false;
    o.hp -= dmg;
    const col = hex(ELEMENT_COLOR[this.powerEl]);
    this.popup(o.img.x, o.img.y + o.hy - 10, byPower ? ELEMENT_ICON[this.powerEl] : `-${Math.min(dmg, 9)}`, byPower ? col : '#ffffff', 22);
    if (o.hp <= 0) { this.kill(o); return true; }
    // Survived: white flash, knock-back, clang.
    o.img.setTintFill(0xffffff);
    this.time.delayedCall(70, () => { if (o.frozen) o.img.setTint(0x9fe8ff); else o.img.clearTint(); });
    o.kick += kick;
    this.cameras.main.shake(60, 0.004);
    sfx.clang(); this.hitStop(50);
    return false;
  }

  private kill(o: Ob): void {
    o.alive = false;
    if (o.kind === 'slime' || o.kind === 'fly' || o.kind === 'armor') {
      this.kills++;
      if (o.kind === 'armor') sfx.crash(); else sfx.squish();
    } else { this.crates++; sfx.smash(); }
    // Combo: kills close together score more.
    this.combo = this.now < this.comboUntil ? this.combo + 1 : 1;
    this.comboUntil = this.now + 1700;
    const pts = (KILL_SCORE[o.kind] ?? SCORE.kill) * this.combo;
    this.bonus += pts;
    this.popup(o.img.x, o.img.y + o.hy - 30, `+${pts}`, '#ffd34d', 20);
    if (this.combo >= 2) {
      this.comboText.setText(`COMBO ×${this.combo}`).setColor('#ffd34d').setAlpha(1);
      this.bump(this.comboText, 1.5);
      this.tweens.add({ targets: this.comboText, alpha: 0, delay: 600, duration: 300 });
      sfx.combo(this.combo);
    }
    this.addMeter(POWER.perKill);
    o.shadow?.setVisible(false);
    o.img.clearTint();
    this.hitFx.explode(o.kind === 'armor' ? 26 : 14, o.img.x, o.img.y - 24);
    this.cameras.main.shake(70, o.kind === 'armor' ? 0.01 : 0.004);
    this.hitStop(o.kind === 'armor' ? 90 : 45);
    this.tweens.add({ targets: o.img, alpha: 0, y: o.img.y - 50, angle: 80, duration: 260 });
  }

  private addMeter(v: number): void {
    if (this.powerActive()) return;
    const was = this.meter;
    this.meter = Math.min(1, this.meter + v);
    if (was < 1 && this.meter >= 1) {
      sfx.meterFull();
      this.bump(this.meterLabel, 1.6);
      this.popup(this.hero.x, this.hero.y - 120, 'POWER READY!', hex(ELEMENT_COLOR[this.powerEl]), 22);
    }
  }

  private endRun(finished: boolean): void {
    if (this.ended) return;
    this.ended = true;
    if (finished) sfx.finish();
    const result: RunResult = {
      score: this.score() + (finished ? SCORE.finishBonus : 0),
      coins: this.coinCount, kills: this.kills + this.crates, distance: this.distance,
      finished, timeSec: this.elapsed, loadout: this.lo,
    };
    this.scene.start('GameOver', result);
  }

  // ───────────────────────────── Frame ─────────────────────────────

  update(_t: number, deltaMs: number): void {
    if (this.time.now < this.hitStopUntil) return; // gestures stay queued until the freeze ends
    const ts = this.time.now < this.slowUntil ? this.slowScale : 1;
    const dt = (Math.min(deltaMs, 50) / 1000) * ts;
    this.now += dt * 1000;
    const now = this.now;

    this.gestures.poll(this.gbuf);
    for (let i = 0; i < this.gbuf.length; i++) this.handleGesture(this.gbuf[i]);

    // Speed / time
    if (!this.dead) {
      this.elapsed += dt;
      const p = Math.min(1, this.elapsed / RUN.durationSec);
      this.speed = (RUN.speedStart + (RUN.speedEnd - RUN.speedStart) * p) * (this.lo.trinket.speedMul ?? 1)
        * (this.powerActive('Fire') ? POWER.fireSpeed : 1);
    } else {
      this.speed = Math.max(0, this.speed - 900 * dt);
    }
    const dx = this.speed * dt;
    this.distance += dx;
    // tilePosition is in texture pixels; divide by tileScale to move in game pixels.
    this.bgFar.tilePositionX += (dx * 0.12) / this.bgFar.tileScaleX;
    this.bgNear.tilePositionX += (dx * 0.35) / this.bgNear.tileScaleX;
    this.ground.tilePositionX += dx / this.ground.tileScaleX;

    // Spawning / finish line
    if (!this.finishing && !this.dead) {
      if (this.elapsed >= RUN.durationSec) {
        this.finishing = true;
        this.flag = this.place('flag', GAME_W + 260);
        this.flag.alive = false;
      } else if ((this.nextSpawn -= dx) <= 0) {
        const w = this.spawnPattern();
        const gapSec = Phaser.Math.FloatBetween(0.95, 1.6) * (this.elapsed < 12 ? 1.3 : 1);
        this.nextSpawn = this.speed * gapSec + w;
      }
    }
    if (this.flag && !this.dead && this.flag.img.x <= this.hero.x) this.endRun(true);

    // Shield recharge
    const maxShield = this.lo.trinket.shield ?? 0;
    if (maxShield && this.shield < maxShield && this.shieldRechargeAt && now >= this.shieldRechargeAt) {
      this.shield++; this.shieldRing.setVisible(true);
      this.shieldRechargeAt = this.shield < maxShield ? now + (this.lo.trinket.shieldRechargeMs ?? 15000) : 0;
      this.bump(this.shieldRing, 1.5);
      sfx.shield();
    }
    if (this.combo && now > this.comboUntil) this.combo = 0;

    // Speed lines and power trail
    const lines = this.speed > 470 && !this.dead;
    this.speedFx.frequency = lines ? Math.max(18, 140 - (this.speed - 470) * 0.5) : -1;
    if (this.powerActive() && this.powerEl !== 'Storm') {
      if (this.powerFx.frequency < 0) this.powerFx.frequency = 16;
      this.powerFx.setPosition(this.hero.x - 6, this.hero.y - 40);
    } else this.powerFx.frequency = -1;
    if (!this.powerActive('Ice')) for (const o of this.obs) if (o.frozen) { o.frozen = false; o.img.clearTint(); o.img.anims.resume(); }

    this.updateHero(dt, now);
    this.moveWorld(dx, dt, now);
    this.moveShots(dt);
    this.updatePet(dt, now);
    this.updateHud();
  }

  /** The pit under x, if it can swallow the hero right now. */
  private pitAt(x: number): Ob | null {
    if (this.powerActive('Fire') || this.powerActive('Shadow') || this.powerActive('Ice')) return null;
    for (const o of this.obs) {
      if (o.kind !== 'pit' || !o.img.active) continue;
      if (x > o.img.x + 12 && x < o.img.x + o.w - 12) return o;
    }
    return null;
  }

  private updateHero(dt: number, now: number): void {
    const h = this.hero;
    // Walking onto a pit: start falling.
    if (this.onGround && h.y >= GROUND_Y && !this.dead && this.pitAt(h.x)) { this.onGround = false; this.vy = 0; }
    if (!this.onGround) {
      const fallVy = this.vy;
      this.vy += RUN.gravity * dt;
      h.y += this.vy * dt;
      const overPit = !this.dead && this.pitAt(h.x);
      // Land on the ground only when coming down onto it (not from inside a pit).
      if (h.y >= GROUND_Y && !overPit && !(this.dead && this.vy < 0) && (this.dead || h.y - this.vy * dt <= GROUND_Y + 2)) {
        h.y = GROUND_Y; this.land(fallVy, now);
      } else if (h.y > GROUND_Y + 70 && !this.dead) {
        this.fellInPit();
      }
    } else {
      this.lastGroundAt = now;
    }

    // Squash & stretch eases back to 1.
    const k = 1 - Math.exp(-dt * 14);
    this.sqX += (1 - this.sqX) * k; this.sqY += (1 - this.sqY) * k;
    h.setScale(this.heroScale * this.sqX, this.heroScale * this.sqY);

    // Visual state
    const sliding = now < this.slideUntil;
    const attacking = now < this.attackUntil;
    let v: string;
    if (this.dead) v = 'dead';
    else if (sliding) v = 'slide';
    else if (attacking) v = 'attack';
    else if (!this.onGround) v = 'jump';
    else v = 'run';
    const base = `hero.${this.lo.skin.id}.`;
    if (v !== this.visual) {
      this.visual = v;
      if (v === 'jump') { h.anims.stop(); h.setTexture(base + 'jump', 0); }
      else if (v === 'attack') h.play({ key: base + 'attack', duration: RUN.attackMs });
      else h.play(base + v);
      h.anims.timeScale = 1;
    }
    if (v === 'run') h.anims.timeScale = this.speed / RUN.speedStart;
    else if (v === 'jump') {
      // Jump sheet = rising → falling; pick the frame from vertical speed.
      const last = this.jumpFrames - 1;
      const t = (this.vy + RUN.jumpVelocity) / (2 * RUN.jumpVelocity);
      h.setFrame(Math.max(0, Math.min(last, Math.round(t * last))));
    }
    const blink = now < this.invulnUntil && !this.dead ? (((now / 70) | 0) % 2 ? 0.35 : 1) : 1;
    h.setAlpha(this.powerActive('Shadow') ? 0.45 : blink);
    if (this.powerActive('Fire')) h.setTint(0xffb080); else if (this.powerActive('Shadow')) h.setTint(0x8a6cff); else h.clearTint();

    // Weapon follows the hand
    const w = this.weapon;
    if (sliding) w.setPosition(h.x + 4, h.y - 22).setAngle(-8);
    else if (attacking) {
      const t = 1 - (this.attackUntil - now) / RUN.attackMs; // 0 → 1
      w.setPosition(h.x + 8, h.y - 56).setAngle(-120 + t * 160);
    } else w.setPosition(h.x - 2, h.y - 54).setAngle(-62);
    this.shieldRing.setPosition(h.x, h.y - (sliding ? 22 : 44));
  }

  /** Feet touched something solid after falling at `vy`. */
  private land(vy: number, now: number): void {
    this.vy = 0; this.onGround = true; this.lastGroundAt = now;
    this.airJumps = this.lo.trinket.airJumps ?? 0;
    if (this.dead) return;
    if (vy > 600) { this.dustFx.explode(6, this.hero.x, this.hero.y); this.sqX = 1.25; this.sqY = 0.78; }
    if (this.lo.skin.stomp && vy > 850) this.stomp();
    if (this.slideQueued) { this.slideQueued = false; this.slideUntil = now + RUN.slideMs; }
    if (now < this.jumpBufferUntil) { this.jumpBufferUntil = 0; this.tryJump(); }
  }

  /** Robot passive: a heavy landing hurts enemies and breaks crates nearby. */
  private stomp(): void {
    const r = this.lo.skin.stomp ?? 0, h = this.hero;
    const ring = this.add.ellipse(h.x, h.y - 4, 40, 12).setStrokeStyle(4, 0xffffff, 0.9).setDepth(6);
    this.tweens.add({ targets: ring, scaleX: (r * 2) / 40, scaleY: 2, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    this.cameras.main.shake(90, 0.006);
    sfx.stomp();
    const dmg = this.lo.awis.skin?.rarity === 'Legendary' ? 2 : 1;
    for (const o of this.obs) {
      if (!o.img.active || !o.alive || !DAMAGEABLE.has(o.kind) || o.kind === 'fly' || o.falling) continue;
      if (Math.abs(o.img.x - h.x) < r + 20 && Math.abs(o.img.y - h.y) < 60) this.damage(o, dmg);
    }
  }

  private fellInPit(): void {
    sfx.pitFall();
    this.hurt(true);
    if (this.dead) return;
    // Pop back out over the far edge.
    this.hero.y = GROUND_Y + 60;
    this.vy = -this.jumpVel() * 1.3; this.onGround = false;
    this.airJumps = this.lo.trinket.airJumps ?? 0;
    this.popup(this.hero.x, GROUND_Y - 120, 'OOF!', '#ff6b81', 22);
  }

  private moveWorld(dx: number, dt: number, now: number): void {
    const h = this.hero;
    const sliding = now < this.slideUntil;
    const attacking = now < this.attackUntil && !this.lo.weapon.thrown;
    const hl = h.x - HERO_HALF_W, hr = h.x + HERO_HALF_W;
    const hb = h.y, ht = h.y - (sliding ? HERO_SLIDE_H : HERO_STAND_H);
    const range = this.lo.weapon.range;
    const fire = this.powerActive('Fire'), ghost = this.powerActive('Shadow');

    for (let i = 0; i < this.obs.length; i++) {
      const o = this.obs[i];
      if (!o.img.active) continue;
      // Movement: world scroll + own motion + knock-back
      const own = o.frozen ? 0 : o.vx;
      o.img.x -= dx - own * dt;
      if (o.kick > 0) { const k = Math.min(o.kick, 1400 * dt); o.img.x += k; o.kick -= k; }
      if (o.kind === 'fly' && !o.frozen && o.alive) o.img.y = o.baseY + Math.sin(now / 180 + i) * 8;
      if (o.kind === 'rock') this.updateRock(o, dt, h);
      const right = o.kind === 'pit' ? o.img.x + o.w : o.img.x + 120;
      if (right < -60) { this.free(o); continue; }
      if (!o.alive || this.dead) continue;

      const ol = o.img.x + o.hx, ot = o.img.y + o.hy, or = ol + o.hw, ob = ot + o.hh;
      // Melee swing: in front of the hero, body height (+ above for falling rocks).
      if (attacking && DAMAGEABLE.has(o.kind) && o.swing !== this.swingId && ol < h.x + range && or > h.x - 10
        && ot < hb && ob > ht - (o.kind === 'rock' ? 120 : 10)) {
        o.swing = this.swingId;
        if (this.damage(o, this.lo.weapon.damage)) continue;
      }
      const overlap = ol < hr && or > hl && ot < hb && ob > ht;
      // Near-miss tracking: how close did it come while level with the hero?
      if (ol < hr + 6 && or > hl - 6 && o.kind !== 'ledge') o.minGap = Math.min(o.minGap, Math.max(ot - hb, ht - ob));
      if (!o.passed && or < hl && o.kind !== 'ledge') {
        o.passed = true;
        if (o.minGap >= 0 && o.minGap < 14 && o.kind !== 'crate') {
          this.slowMo(0.45, 170); sfx.nearMiss();
          this.popup(h.x, ht - 30, 'CLOSE!', '#80ffdb', 18);
          this.bonus += 5; this.addMeter(POWER.perNearMiss);
        }
      }
      if (!overlap) continue;
      // Powers: Fire smashes everything it touches, Ice-frozen things shatter, Shadow passes through.
      if (fire && DAMAGEABLE.has(o.kind)) { this.damage(o, 99, true); continue; }
      if (o.frozen && DAMAGEABLE.has(o.kind)) { this.kill(o); continue; }
      if (PLATFORM.has(o.kind) && this.vy >= 0 && hb - this.vy * dt <= ot + 12) {
        // Landing on top of a crate or ledge counts as standing on it.
        const fallVy = this.vy;
        h.y = ot;
        if (!this.onGround) this.land(fallVy, now); else { this.vy = 0; this.lastGroundAt = now; }
        continue;
      }
      if (o.kind === 'ledge') continue; // one-way: pass through from below and the sides
      if (ghost || fire) continue;
      // Stomp a slime / fly, or bounce off an armour's head, by landing on it.
      if ((o.kind === 'slime' || o.kind === 'armor' || o.kind === 'fly') && this.vy > 0 && hb - this.vy * dt <= ot + 16) {
        if (o.kind !== 'armor') this.kill(o); else if (this.lo.skin.stomp) this.damage(o, 2);
        this.vy = -RUN.airJumpVelocity * 0.85; this.onGround = false; this.sqX = 0.8; this.sqY = 1.2;
        this.airJumps = this.lo.trinket.airJumps ?? 0;
        continue;
      }
      this.hurt();
      if (o.kind === 'armor' || o.kind === 'rock') { o.alive = false; this.tweens.add({ targets: o.img, alpha: 0.3, duration: 200 }); }
    }
    // Walked off the end of a crate or ledge → start falling.
    if (this.onGround && h.y < GROUND_Y && !this.onPlatform()) this.onGround = false;

    const magnet = this.lo.trinket.magnet ?? 0;
    const pullAll = now < this.coinPullUntil;
    const hcy = h.y - 44;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c.img.active) continue;
      const img = c.img;
      img.x -= dx;
      if (img.x < -40) { img.setActive(false).setVisible(false); c.alive = false; continue; }
      if (!c.alive || this.dead) continue;
      const ddx = h.x - img.x, ddy = hcy - img.y;
      const d2 = ddx * ddx + ddy * ddy;
      if ((magnet && d2 < magnet * magnet) || (pullAll && img.x < GAME_W)) c.pulled = true;
      if (c.pulled) {
        const d = Math.sqrt(d2) || 1, step = Math.min(d, 900 * dt);
        img.x += (ddx / d) * step; img.y += (ddy / d) * step;
      }
      if (d2 < 46 * 46) this.collect(c);
    }
  }

  private updateRock(o: Ob, dt: number, h: Phaser.GameObjects.Sprite): void {
    if (o.shadow?.visible) {
      o.shadow.x = o.img.x;
      o.shadow.setAlpha(0.2 + 0.4 * Math.min(1, Math.max(0, (o.img.y + 60) / (GROUND_Y + 60))));
    }
    if (!o.falling || o.frozen) return;
    // Drop when the shadow is about to reach the hero: it lands right about where the hero will be.
    const fallT = Math.sqrt((2 * (GROUND_Y + 60)) / RUN.gravity);
    if (!o.armed && o.img.x - h.x < this.speed * fallT + 30) { o.armed = true; sfx.whistle(); }
    if (!o.armed) return;
    o.vy += RUN.gravity * dt;
    o.img.y += o.vy * dt;
    o.img.angle += 240 * dt;
    if (o.img.y >= GROUND_Y) {
      o.img.y = GROUND_Y; o.falling = false; o.vy = 0;
      o.shadow?.setVisible(false);
      if (o.alive) { this.hitFx.explode(10, o.img.x, GROUND_Y - 6); this.cameras.main.shake(80, 0.005); sfx.crash(); }
    }
  }

  private moveShots(dt: number): void {
    for (const s of this.shots) {
      if (!s.alive) continue;
      const step = 1150 * dt;
      s.img.x += step; s.dist += step;
      if (s.dist > this.lo.weapon.range || s.img.x > GAME_W + 40) { s.alive = false; s.img.setVisible(false); continue; }
      for (const o of this.obs) {
        if (!o.img.active || !o.alive || !DAMAGEABLE.has(o.kind)) continue;
        const ol = o.img.x + o.hx, ot = o.img.y + o.hy;
        if (s.img.x > ol && s.img.x < ol + o.hw + 10 && s.img.y > ot - 10 && s.img.y < ot + o.hh + 10) {
          this.damage(o, this.lo.weapon.damage, false, 45); // small knock-back: the kunai trades safety for damage
          this.slashFx.explode(6, s.img.x, s.img.y);
          s.alive = false; s.img.setVisible(false);
          break;
        }
      }
    }
  }

  private onPlatform(): boolean {
    const h = this.hero;
    for (const o of this.obs) {
      if (!o.img.active || !o.alive || !PLATFORM.has(o.kind)) continue;
      const ol = o.img.x + o.hx, or = ol + o.hw, ot = o.img.y + o.hy;
      if (Math.abs(h.y - ot) < 2 && ol < h.x + HERO_HALF_W && or > h.x - HERO_HALF_W) return true;
    }
    return false;
  }

  private collect(c: Coin): void {
    c.alive = false;
    c.img.setActive(false).setVisible(false);
    this.coinCount++;
    this.coinFx.explode(6, c.img.x, c.img.y);
    sfx.coin();
    this.addMeter(POWER.perCoin);
    // A coin flies up to the counter, then the counter bumps.
    let f = this.flyCoins.find((k) => !k.active);
    if (!f) { f = this.add.image(0, 0, 'obj.coin', 0).setScale(scaleOf('obj.coin') * 0.8).setDepth(22); this.flyCoins.push(f); }
    const fc = f;
    fc.setActive(true).setVisible(true).setPosition(c.img.x, c.img.y);
    this.tweens.add({
      targets: fc, x: 24, y: 96, duration: 380, ease: 'Cubic.In',
      onComplete: () => { fc.setActive(false).setVisible(false); this.coinText.setText(`● ${this.coinCount}`); this.bump(this.coinText, 1.25); },
    });
  }

  private updatePet(dt: number, now: number): void {
    const pet = this.lo.pet;
    const h = this.hero;
    let tx = h.x - 64, ty = Math.min(h.y, GROUND_Y) - 104 + Math.sin(now / 260) * 6;
    // Seek the nearest coin a little ahead (one at a time, short cooldown).
    if (now >= this.petReadyAt && !this.dead) {
      let best: Coin | null = null, bd = 1e9;
      for (const c of this.coins) {
        if (!c.alive || c.pulled) continue;
        const x = c.img.x;
        if (x < h.x - 30 || x > h.x + 320) continue;
        const d = Math.abs(x - this.petX) + Math.abs(c.img.y - this.petY);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) {
        tx = best.img.x; ty = best.img.y;
        const ddx = tx - this.petX, ddy = ty - this.petY;
        if (ddx * ddx + ddy * ddy < pet.radius * pet.radius * 0.25) { this.collect(best); this.petReadyAt = now + 550; }
      }
    }
    const ddx = tx - this.petX, ddy = ty - this.petY;
    const d = Math.sqrt(ddx * ddx + ddy * ddy);
    if (d > 0.5) {
      const step = Math.min(d, pet.speed * dt);
      this.petX += (ddx / d) * step; this.petY += (ddy / d) * step;
    }
    this.pet.setPosition(this.petX, this.petY).setFlipX(ddx < -2);
  }
}
