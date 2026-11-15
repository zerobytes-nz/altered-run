import Phaser from 'phaser';
import { GAME_W, GAME_H, GROUND_Y, HERO_X, RUN, SCORE, DEBUG } from '../config';
import { asset, scaleOf, heroHoldsWeapon } from '../assets';
import { guestLoadout, type Loadout } from '../loadout';
import { GestureInput, type Gesture } from '../systems/input';
import { bestScore } from '../systems/highscores';
import { muteButton, slotRow, text } from '../ui';
import { sfx, startMusic, stopMusic } from '../systems/audio';
import type { RunResult } from './GameOverScene';

type Kind = 'spike' | 'crate' | 'bar' | 'slime' | 'flag';

/** Pooled obstacle. Hitbox is relative to the image's (x, bottom) anchor. */
interface Ob {
  img: Phaser.GameObjects.Sprite;
  kind: Kind;
  alive: boolean; // collidable
  hx: number; hy: number; hw: number; hh: number;
  vx: number;     // own motion on top of the world scroll (px/s, negative = towards hero)
}

interface Coin { img: Phaser.GameObjects.Sprite; alive: boolean; pulled: boolean; }

const HITBOX: Record<Kind, [number, number, number, number]> = {
  spike: [-21, -32, 42, 32],
  crate: [-26, -54, 52, 54],
  bar: [-34, -352, 68, 352 - 10],
  slime: [-22, -36, 44, 36],
  flag: [0, 0, 0, 0],
};
/** Manifest key for each obstacle kind. */
const TEX: Record<Kind, string> = { spike: 'obj.spike', crate: 'obj.crate', bar: 'obj.bar', slime: 'enemy.slime', flag: 'obj.flag' };

const HERO_HALF_W = 15;
const HERO_STAND_H = 82;
const HERO_SLIDE_H = 36;
const COYOTE_MS = 90;
const JUMP_BUFFER_MS = 140;

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
  private flag: Ob | null = null;
  private nextSpawn = 0;
  private finishing = false;

  // hero
  private hero!: Phaser.GameObjects.Sprite;
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
  private invulnUntil = 0;
  private visual = '';
  private jumpFrames = 1;
  private dead = false;
  private ended = false;
  private hitStopUntil = 0; // scene time (ms): freeze the world briefly on impacts

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
  private hearts: number = RUN.hearts;
  private shield = 0;

  // HUD
  private heartImgs: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private fpsText?: Phaser.GameObjects.Text;
  private hudTick = 0;
  private lastScoreShown = -1;
  private coinFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private hitFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private slashFx!: Phaser.GameObjects.Particles.ParticleEmitter;
  private dustFx!: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor() { super('Run'); }

  init(data: { loadout?: Loadout }): void {
    this.lo = data?.loadout ?? guestLoadout();
    // Reset all per-run state (the scene instance is reused between runs).
    this.obs = []; this.coins = []; this.flag = null; this.heartImgs = [];
    this.nextSpawn = 2.2 * RUN.speedStart; this.finishing = false;
    this.vy = 0; this.onGround = true; this.lastGroundAt = 0; this.airJumps = this.lo.trinket.airJumps ?? 0;
    this.jumpBufferUntil = 0; this.slideQueued = false; this.slideUntil = 0; this.attackUntil = 0; this.attackReadyAt = 0;
    this.invulnUntil = 0; this.visual = ''; this.dead = false; this.ended = false; this.hitStopUntil = 0;
    this.now = 0; this.elapsed = 0; this.speed = RUN.speedStart; this.distance = 0;
    this.coinCount = 0; this.kills = 0; this.crates = 0; this.hearts = this.lo.hearts; this.shield = this.lo.trinket.shield ?? 0;
    this.hudTick = 0; this.lastScoreShown = -1; this.petReadyAt = 0;
  }

  create(): void {
    // Sky + parallax
    const sky = this.add.graphics();
    sky.fillGradientStyle(0x141c3a, 0x141c3a, 0x3a4a8a, 0x3a4a8a, 1);
    sky.fillRect(0, 0, GAME_W, GROUND_Y);
    this.add.circle(560, 130, 38, 0xfff1c1, 0.85);
    this.bgFar = this.add.tileSprite(0, GROUND_Y - 30, GAME_W, 220, 'bg.far').setOrigin(0, 1).setTileScale(scaleOf('bg.far'));
    this.bgNear = this.add.tileSprite(0, GROUND_Y + 4, GAME_W, 160, 'bg.near').setOrigin(0, 1).setTileScale(scaleOf('bg.near'));
    this.ground = this.add.tileSprite(0, GROUND_Y - 6, GAME_W, GAME_H - GROUND_Y + 6, 'bg.ground').setOrigin(0).setTileScale(scaleOf('bg.ground'));

    // Hero, weapon, pet
    const skin = this.lo.skin.id;
    this.jumpFrames = asset(`hero.${skin}.jump`).frameCount;
    const petKey = `pet.${this.lo.pet.id}`;
    this.pet = this.add.sprite(HERO_X - 70, GROUND_Y - 110, petKey).setScale(scaleOf(petKey)).play(petKey);
    this.petX = this.pet.x; this.petY = this.pet.y;
    this.hero = this.add.sprite(HERO_X, GROUND_Y, `hero.${skin}.run`).setOrigin(0.5, 1).setDepth(5).setScale(scaleOf(`hero.${skin}.run`));
    const wKey = `weapon.${this.lo.weapon.id}`;
    this.weapon = this.add.image(HERO_X, GROUND_Y - 50, wKey).setOrigin(0.12, 0.5).setDepth(6).setScale(scaleOf(wKey));
    // Real hero art (knight, ninja, robot) already holds a weapon: don't draw a second one on top.
    // The weapon AWI still sets range/damage and colours the slash.
    this.weapon.setVisible(!heroHoldsWeapon(skin));
    this.slash = this.add.image(0, 0, 'fx.slash').setOrigin(0.25, 0.5).setDepth(6).setVisible(false);
    this.shieldRing = this.add.circle(HERO_X, GROUND_Y - 44, 56).setStrokeStyle(4, 0x4cc9f0, 0.8).setDepth(6).setVisible(this.shield > 0);

    const dotS = scaleOf('fx.dot'), pxS = scaleOf('fx.px');
    this.coinFx = this.add.particles(0, 0, 'fx.dot', {
      lifespan: 380, speed: { min: 60, max: 200 }, scale: { start: 1.1 * dotS, end: 0 },
      tint: 0xffd34d, emitting: false,
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

    // Pre-warm pools so the first obstacles don't allocate mid-run.
    for (let i = 0; i < 12; i++) this.getOb('spike');
    for (let i = 0; i < 36; i++) this.getCoin(-200, -200);
    for (const o of this.obs) { o.alive = false; o.img.setActive(false).setVisible(false); }
    for (const c of this.coins) { c.alive = false; c.img.setActive(false).setVisible(false); }

    this.buildHud();
    this.gestures = new GestureInput(this);
    startMusic();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, stopMusic);
  }

  /** Freeze the world for a few frames so hits feel heavy. Input is kept and handled after. */
  private hitStop(ms: number): void { this.hitStopUntil = Math.max(this.hitStopUntil, this.time.now + ms); }

  // ───────────────────────────── HUD ─────────────────────────────

  private buildHud(): void {
    const hud = this.add.container(0, 0).setDepth(20);
    for (let i = 0; i < this.lo.hearts; i++) {
      const h = this.add.image(26 + i * 32, 26, 'ui.heart').setScale(scaleOf('ui.heart'));
      this.heartImgs.push(h); hud.add(h);
    }
    this.scoreText = text(this, 14, 46, '0', 30, '#ffffff', '900').setStroke('#0b1020', 5);
    this.coinText = text(this, 16, 86, '● 0', 18, '#ffd34d', '800').setStroke('#0b1020', 4);
    const best = bestScore();
    const bestT = text(this, 24 + this.lo.hearts * 32, 18, best ? `BEST ${best}` : '', 13, '#c0c8ff', '700').setStroke('#0b1020', 3);
    // Run progress → finish flag
    const pw = 220, px = GAME_W / 2 - pw / 2;
    const track = this.add.rectangle(px, 20, pw, 10, 0x0b1020, 0.6).setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff, 0.35);
    this.progressFill = this.add.rectangle(px, 20, 1, 10, 0x80ffdb).setOrigin(0, 0.5);
    const flag = this.add.image(px + pw + 12, 20, 'obj.flag').setScale(scaleOf('obj.flag') * 0.18);
    hud.add([this.scoreText, this.coinText, bestT, track, this.progressFill, flag]);
    // The four AWI slots, always on screen.
    const slots = slotRow(this, GAME_W - (4 * 52 + 3 * 14) - 12, 22, this.lo, 52, 14, true, 12);
    slots.setAlpha(0.92);
    hud.add(slots);
    muteButton(this, GAME_W - 30, GAME_H - 30, 18).setDepth(20).setAlpha(0.8);
    if (DEBUG) this.fpsText = text(this, 14, GAME_H - 28, '', 14, '#80ffdb', '700').setDepth(30);
  }

  private updateHud(): void {
    this.progressFill.width = Math.max(1, 220 * Math.min(1, this.elapsed / RUN.durationSec));
    if (++this.hudTick % 6 !== 0) return; // text re-rasterises: update ~10×/s, only on change
    const s = this.score();
    if (s !== this.lastScoreShown) { this.scoreText.setText(String(s)); this.lastScoreShown = s; }
    if (this.fpsText && this.hudTick % 30 === 0) {
      this.fpsText.setText(`${this.game.loop.actualFps.toFixed(0)} fps · ${this.obs.length + this.coins.length} pooled`);
    }
  }

  private score(): number {
    const base = this.distance * SCORE.perPixel + this.coinCount * SCORE.coin + this.kills * SCORE.kill + this.crates * SCORE.crate;
    return Math.floor(base * (this.lo.trinket.scoreMul ?? 1));
  }

  // ───────────────────────────── Pools ─────────────────────────────

  private getOb(kind: Kind): Ob {
    let o = this.obs.find((x) => !x.img.active);
    if (!o) {
      o = { img: this.add.sprite(0, 0, TEX[kind]).setOrigin(0.5, 1).setDepth(4), kind, alive: true, hx: 0, hy: 0, hw: 0, hh: 0, vx: 0 };
      this.obs.push(o);
    }
    this.tweens.killTweensOf(o.img);
    const [hx, hy, hw, hh] = HITBOX[kind];
    o.kind = kind; o.alive = true; o.hx = hx; o.hy = hy; o.hw = hw; o.hh = hh; o.vx = 0;
    o.img.anims.stop();
    o.img.setActive(true).setVisible(true).setAlpha(1).setAngle(0).setTexture(TEX[kind], 0).setScale(scaleOf(TEX[kind]));
    if (kind === 'slime') { o.img.play(TEX.slime); o.vx = -70; }
    return o;
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
      ['spike', 3],
      ['crate', 2],
      ['bar', p > 0.08 ? 2 : 0.4],
      ['slime', p > 0.12 ? 2.4 : 0.4],
      ['spike2', p > 0.3 ? 1.4 : 0],
      ['crate2', p > 0.25 ? 1 : 0],
      ['coins', 0.8],
    ];
    let r = Math.random() * table.reduce((a, [, w]) => a + w, 0);
    let pick = 'spike';
    for (const [k, w] of table) { if ((r -= w) <= 0) { pick = k; break; } }

    switch (pick) {
      case 'spike': this.place('spike', x); if (Math.random() < 0.6) this.coinArc(x); return 60;
      case 'spike2': this.place('spike', x); this.place('spike', x + 52); if (Math.random() < 0.5) this.coinArc(x + 26); return 110;
      case 'crate': this.place('crate', x); if (Math.random() < 0.5) this.coinArc(x); return 60;
      case 'crate2': this.place('crate', x); this.place('crate', x, GROUND_Y - 54); return 60;
      case 'bar': this.place('bar', x, GROUND_Y - 44); this.coinLine(x - 40, GROUND_Y - 20, 4, 30); return 80;
      case 'slime': this.place('slime', x); return 60;
      default: this.coinLine(x, GROUND_Y - 30 - (Math.random() < 0.5 ? 0 : 120), 6, 40); return 240;
    }
  }

  private coinArc(cx: number): void {
    for (let i = -2; i <= 2; i++) this.getCoin(cx + i * 34, GROUND_Y - 120 - (4 - i * i) * 14);
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
  }

  private tryJump(): void {
    const grounded = this.onGround || this.now - this.lastGroundAt < COYOTE_MS;
    if (grounded) {
      this.vy = -RUN.jumpVelocity; this.onGround = false; this.lastGroundAt = -1e9;
      this.slideUntil = 0; this.slideQueued = false;
      this.dustFx.explode(6, this.hero.x, this.hero.y);
      sfx.jump();
    } else if (this.airJumps > 0) {
      this.airJumps--; this.vy = -RUN.airJumpVelocity;
      this.coinFx.explode(6, this.hero.x, this.hero.y);
      sfx.airJump();
    } else {
      this.jumpBufferUntil = this.now + JUMP_BUFFER_MS;
    }
  }

  private trySlide(): void {
    if (this.onGround) { this.slideUntil = this.now + RUN.slideMs; this.attackUntil = 0; this.dustFx.explode(8, this.hero.x + 10, this.hero.y); sfx.slide(); }
    else { this.vy = Math.max(this.vy, RUN.fastFallVelocity); this.slideQueued = true; }
  }

  private tryAttack(): void {
    if (this.now < this.attackReadyAt) return;
    this.attackUntil = this.now + RUN.attackMs;
    this.attackReadyAt = this.now + RUN.attackCooldownMs;
    this.slideUntil = 0;
    const s = this.slash;
    s.setVisible(true).setAlpha(1).setTint(this.lo.weapon.tint).setPosition(this.hero.x + 4, this.hero.y - 48).setScale(this.lo.weapon.range / 96, 1);
    this.tweens.add({ targets: s, alpha: 0, duration: RUN.attackMs, onComplete: () => s.setVisible(false) });
    this.slashFx.explode(10, this.hero.x + 20, this.hero.y - 48);
    sfx.slash();
  }

  private hurt(): void {
    if (this.now < this.invulnUntil || this.dead) return;
    if (this.shield > 0) {
      this.shield--; this.shieldRing.setVisible(this.shield > 0);
      this.invulnUntil = this.now + 700;
      this.cameras.main.flash(120, 76, 201, 240);
      sfx.shield(); this.hitStop(60);
      return;
    }
    this.hearts--;
    this.heartImgs[this.hearts]?.setTexture('ui.heartEmpty');
    this.invulnUntil = this.now + RUN.hurtInvulnMs;
    this.cameras.main.shake(140, 0.008);
    this.cameras.main.flash(90, 255, 60, 80);
    sfx.hurt(); this.hitStop(90);
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

  private kill(o: Ob): void {
    o.alive = false;
    if (o.kind === 'slime') { this.kills++; sfx.squish(); } else { this.crates++; sfx.smash(); }
    this.hitFx.explode(14, o.img.x, o.img.y - 24);
    this.cameras.main.shake(70, 0.004);
    this.hitStop(45);
    this.tweens.add({ targets: o.img, alpha: 0, y: o.img.y - 50, angle: 80, duration: 260 });
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
    const dt = Math.min(deltaMs, 50) / 1000;
    this.now += dt * 1000;
    const now = this.now;

    this.gestures.poll(this.gbuf);
    for (let i = 0; i < this.gbuf.length; i++) this.handleGesture(this.gbuf[i]);

    // Speed / time
    if (!this.dead) {
      this.elapsed += dt;
      const p = Math.min(1, this.elapsed / RUN.durationSec);
      this.speed = (RUN.speedStart + (RUN.speedEnd - RUN.speedStart) * p) * (this.lo.trinket.speedMul ?? 1);
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

    this.updateHero(dt, now);
    this.moveWorld(dx, dt, now);
    this.updatePet(dt, now);
    this.updateHud();
  }

  private updateHero(dt: number, now: number): void {
    const h = this.hero;
    if (!this.onGround) {
      this.vy += RUN.gravity * dt;
      h.y += this.vy * dt;
      if (h.y >= GROUND_Y && !(this.dead && this.vy < 0)) {
        if (this.vy > 600 && !this.dead) this.dustFx.explode(5, h.x, GROUND_Y);
        h.y = GROUND_Y; this.vy = 0; this.onGround = true; this.lastGroundAt = now;
        this.airJumps = this.lo.trinket.airJumps ?? 0;
        if (!this.dead) {
          if (this.slideQueued) { this.slideQueued = false; this.slideUntil = now + RUN.slideMs; }
          if (now < this.jumpBufferUntil) { this.jumpBufferUntil = 0; this.tryJump(); }
        }
      }
    } else {
      this.lastGroundAt = now;
    }

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
    h.setAlpha(now < this.invulnUntil && !this.dead ? ((now / 70) | 0) % 2 ? 0.35 : 1 : 1);

    // Weapon follows the hand
    const w = this.weapon;
    if (sliding) w.setPosition(h.x + 4, h.y - 22).setAngle(-8);
    else if (attacking) {
      const t = 1 - (this.attackUntil - now) / RUN.attackMs; // 0 → 1
      w.setPosition(h.x + 8, h.y - 56).setAngle(-120 + t * 160);
    } else w.setPosition(h.x - 2, h.y - 54).setAngle(-62);
    this.shieldRing.setPosition(h.x, h.y - (sliding ? 22 : 44));
  }

  private moveWorld(dx: number, dt: number, now: number): void {
    const h = this.hero;
    const sliding = now < this.slideUntil;
    const attacking = now < this.attackUntil;
    const hl = h.x - HERO_HALF_W, hr = h.x + HERO_HALF_W;
    const hb = h.y, ht = h.y - (sliding ? HERO_SLIDE_H : HERO_STAND_H);
    const range = this.lo.weapon.range;

    for (let i = 0; i < this.obs.length; i++) {
      const o = this.obs[i];
      if (!o.img.active) continue;
      o.img.x -= dx - o.vx * dt;
      if (o.img.x < -120) { o.img.setActive(false).setVisible(false); o.alive = false; if (o === this.flag) this.flag = null; continue; }
      if (!o.alive || this.dead) continue;
      const ol = o.img.x + o.hx, ot = o.img.y + o.hy, or = ol + o.hw, ob = ot + o.hh;
      // Attack hitbox: in front of the hero, body height.
      if (attacking && (o.kind === 'crate' || o.kind === 'slime') && ol < h.x + range && or > h.x - 10 && ot < hb && ob > ht - 10) {
        this.kill(o);
        continue;
      }
      if (ol < hr && or > hl && ot < hb && ob > ht) {
        // Stomp a slime by landing on it.
        if (o.kind === 'slime' && this.vy > 0 && hb - this.vy * dt <= ot + 16) {
          this.kill(o); this.vy = -RUN.airJumpVelocity * 0.8; this.onGround = false;
          this.airJumps = this.lo.trinket.airJumps ?? 0;
          continue;
        }
        // Landing on top of a crate counts as standing on it, not a hit.
        if (o.kind === 'crate' && this.vy >= 0 && hb - this.vy * dt <= ot + 12) {
          h.y = ot; this.vy = 0; this.onGround = true; this.lastGroundAt = now;
          this.airJumps = this.lo.trinket.airJumps ?? 0;
          continue;
        }
        this.hurt();
      }
    }
    // Walked off the end of a crate → start falling.
    if (this.onGround && h.y < GROUND_Y && !this.isOnCrate()) this.onGround = false;

    const magnet = this.lo.trinket.magnet ?? 0;
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
      if (magnet && d2 < magnet * magnet) c.pulled = true;
      if (c.pulled) {
        const d = Math.sqrt(d2) || 1, step = Math.min(d, 900 * dt);
        img.x += (ddx / d) * step; img.y += (ddy / d) * step;
      }
      if (d2 < 46 * 46) this.collect(c);
    }
  }

  private isOnCrate(): boolean {
    const h = this.hero;
    for (const o of this.obs) {
      if (!o.img.active || !o.alive || o.kind !== 'crate') continue;
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
    this.coinText.setText(`● ${this.coinCount}`);
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
