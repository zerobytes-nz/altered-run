import Phaser from 'phaser';
import { GAME_W, GAME_H, GROUND_Y, HERO_X, RUN, SCORE, POWER, DEBUG } from '../config';
import { asset, scaleOf, heroHoldsWeapon } from '../assets';
import { guestLoadout, SKINS, type Loadout } from '../loadout';
import { ELEMENT_COLOR, ELEMENT_ICON, POWER_NAME, hex, type Element } from '../awi';
import { GestureInput, type Gesture } from '../systems/input';
import { bestScore } from '../systems/highscores';
import { dailySeed, dailyToday } from '../systems/daily';
import { sfx, startMusic, stopMusic } from '../systems/audio';
import { ShieldBubble } from '../systems/shieldBubble';
import { muteButton, slotRow, text } from '../ui';
import { SECRET_GEMS, WORLDS, getStage, parseEntry, type Stage, type World } from '../stages';
import type { RunMode, RunResult } from './GameOverScene';

// ─────────────────────────────────────────────────────────────────────────────
// Obstacles. Every kind asks something of the player, and an AWI makes it easier:
//   spike / bar   jump / slide                      (any loadout)
//   crate         jump onto it, or smash it          (weapon, Robot stomp)
//   slime         stomp it or hit it                 (weapon)
//   fly           head height: slide under or hit    (Kunai reaches it early)
//   rival         a giant "Altered" copy of a hero you did not pick: 4 HP, too tall to jump
//                 (Hammer 1 hit, Sword 2, Kunai 4 from range; Feather hops it; Robot stomps it)
//   rock          falls onto its shadow and lands just ahead of you: jump it (smash it; Shield blocks it)
//   pit           a hole; wide ones have a ledge     (Feather clears them; Fire / Shadow / Ice powers make them safe)
//   ledge         one-way platform, often with coins (Feather / Magnet / pets reach the coins)
//   guard         a shield bearer: blocks hits under 3 damage (Hammer smashes it; anyone can jump it)
//   archer        stands on a high ledge and shoots arrows at you (slide / jump / swat; the Kunai aims up at it)
//   mite          swarms of small hoppers: chain-stomp them (the Robot's landing stomp clears a swarm)
//   arrow         an enemy shot: archers' arrows and the boss's fireballs
//   wave          the boss's ground shake: jump it
//   boss          World 1's Ember Rival (see updateBoss)
// Hidden gems (secret pattern) float out of reach of one jump: the Feather or the Magnet gets them.
// ─────────────────────────────────────────────────────────────────────────────
/** The hero's coin pickup point is this far above the feet (pickup radius 46 px). */
const HERO_COIN_Y = 44;

type Kind = 'spike' | 'crate' | 'bar' | 'slime' | 'flag' | 'fly' | 'rival' | 'rock' | 'ledge' | 'pit'
  | 'guard' | 'archer' | 'mite' | 'arrow' | 'wave' | 'boss'
  // THEOS-39 (Worlds 2–4):
  //   icicle   hangs up top, drops as you come (like a rock) and stays stuck in the ground: jump it
  //   golem    an ice golem: armoured like a guard but bigger and tougher (Hammer / Fire; anyone can jump it)
  //   wall     an ice wall, too tall to jump: break it (Fire's Blaze dash melts it at once)
  //   zone     ground effect over a stretch: 'ice' (longer slides), 'up' / 'down' (wind bends your jumps)
  //   zap      lightning: marks the ground, strikes, crackles for a moment (jump it, or wait it out)
  //   swooper  a flyer that dives at you when you get close (slide under, or hit it low)
  //   phantom  fades in and out: only solid (and dangerous, and hittable) part of the time
  | 'icicle' | 'golem' | 'wall' | 'zone' | 'zap' | 'swooper' | 'phantom';

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
  armed: boolean;   // rocks: started falling · rivals: swung their attack
  skin: string;     // rivals: which hero sheet they use
  frozen: boolean;  // Ice power
  minGap: number;   // closest the hero came (for near-miss slow-mo)
  passed: boolean;
  w: number;        // pits: width
  t: number;        // archers: next shot time (scene ms)
  n: number;        // archers: shots fired
  tint: number;     // resting tint (0 = none)
  shadow?: Phaser.GameObjects.Image;
  prop?: Phaser.GameObjects.Image; // guards: the shield they hold
  label?: Phaser.GameObjects.Text;  // wind zones: the arrow sign
}

interface Coin { img: Phaser.GameObjects.Sprite; alive: boolean; pulled: boolean; secret: boolean; }
interface Shot { img: Phaser.GameObjects.Image; alive: boolean; dist: number; vx: number; vy: number; }

const HITBOX: Record<Kind, [number, number, number, number]> = {
  spike: [-21, -32, 42, 32],
  crate: [-26, -54, 52, 54],
  bar: [-34, -352, 68, 352 - 10],
  slime: [-22, -36, 44, 36],
  flag: [0, 0, 0, 0],
  fly: [-20, -32, 40, 28],
  rival: [-30, -205, 60, 205], // a hero sheet at 2.4 × the hero's size (~205 px tall)
  rock: [-20, -42, 40, 40],
  ledge: [-94, -44, 188, 10],
  pit: [0, 0, 0, 0],
  guard: [-22, -94, 44, 94],
  archer: [-18, -80, 36, 80],
  mite: [-12, -20, 24, 20],
  arrow: [-14, -6, 28, 12],   // centred (arrows use origin 0.5, 0.5)
  wave: [-20, -26, 40, 26],
  boss: [-40, -240, 80, 240],
  icicle: [-16, -44, 32, 44],
  golem: [-28, -136, 56, 136],
  wall: [-30, -212, 60, 212],
  zone: [0, 0, 0, 0],
  zap: [-44, -30, 88, 30],
  swooper: [-20, -32, 40, 28],
  phantom: [-22, -92, 44, 92],
};
const TEX: Record<Kind, string> = {
  spike: 'obj.spike', crate: 'obj.crate', bar: 'obj.bar', slime: 'enemy.slime', flag: 'obj.flag',
  fly: 'enemy.fly', rival: 'hero.knight.run', rock: 'obj.rock', ledge: 'obj.ledge', pit: 'obj.pit',
  guard: 'hero.knight.run', archer: 'hero.knight.run', mite: 'enemy.slime', arrow: 'weapon.kunai', wave: 'fx.dot', boss: 'hero.knight.run',
  icicle: 'obj.spike', golem: 'hero.knight.run', wall: 'fx.px', zone: 'fx.px', zap: 'fx.dot', swooper: 'enemy.fly', phantom: 'hero.knight.run',
};
const HP: Partial<Record<Kind, number>> = {
  crate: 1, slime: 1, fly: 1, rock: 1, rival: 4, guard: 4, archer: 1, mite: 1, arrow: 1, boss: 12,
  icicle: 1, golem: 5, wall: 3, swooper: 1, phantom: 2,
};
const DAMAGEABLE = new Set<Kind>(['crate', 'slime', 'fly', 'rock', 'rival', 'guard', 'archer', 'mite', 'arrow', 'boss',
  'icicle', 'golem', 'wall', 'swooper', 'phantom']);
const PLATFORM = new Set<Kind>(['crate', 'ledge']);
/** Enemies (count as "defeated" and squish); the rest of DAMAGEABLE are things you break. */
const ENEMY = new Set<Kind>(['slime', 'fly', 'rival', 'guard', 'archer', 'mite', 'boss', 'golem', 'swooper', 'phantom']);
const KILL_SCORE: Partial<Record<Kind, number>> = {
  slime: SCORE.kill, fly: SCORE.kill, rival: SCORE.kill * 3, crate: SCORE.crate, rock: SCORE.crate,
  guard: SCORE.kill * 2, archer: SCORE.kill * 2, mite: 10, arrow: 5, boss: 500,
  icicle: SCORE.crate, golem: SCORE.kill * 3, wall: SCORE.crate * 2, swooper: SCORE.kill, phantom: SCORE.kill * 2,
};
/** Enemies drawn with a hero sheet the player did not pick ("Altered" copies), at this size × the hero. */
const ALTERED: Partial<Record<Kind, number>> = { rival: 2.4, guard: 1.15, archer: 1, boss: 2.9, golem: 1.6, phantom: 1.1 };
/** Things that hurt you once, then are spent (they fade instead of hurting again). */
const SPENT_ON_HIT = new Set<Kind>(['rival', 'rock', 'guard', 'icicle', 'golem', 'wall', 'phantom']);
/** Armoured: hits weaker than GUARD_ARMOUR bounce off (powers always get through). */
const ARMOURED = new Set<Kind>(['guard', 'golem']);
/** Stomping these only bounces you (the Robot's heavy stomp hurts them). */
const HEAVY = new Set<Kind>(['rival', 'guard', 'golem', 'phantom', 'boss']);
const STOMPABLE = new Set<Kind>(['slime', 'fly', 'mite', 'archer', 'swooper']);
const ICE_THING = 0xbfeaff;
/** Phantoms: solid this long, then faded this long. */
const PHANTOM_SOLID_MS = 1100, PHANTOM_FADE_MS = 950;
/** Blinking ledges: there this long, then gone this long (they flicker for the last 350 ms). */
const BLINK_ON_MS = 1500, BLINK_OFF_MS = 1000;
/** Lightning crackles on the ground this long after it strikes. */
const ZAP_LIVE_MS = 850;

/** Each world's boss (stage entry "boss"). Attack lists are per phase. */
interface BossDef { tint: number; shotTint: number; attacks: string[][]; gapMs: number[]; openMs: number[]; beaten: string; call: string; }
const BOSSES: Record<number, BossDef> = {
  1: { tint: 0xff9566, shotTint: 0xff7a45, beaten: 'RIVAL DEFEATED!', call: 'COME, MY ALTERED!',
    attacks: [['throwLow', 'throwHigh', 'throwLow'], ['throwHigh', 'slam', 'throwLow', 'summon'], ['slam', 'throwLow', 'throwHigh', 'slam', 'summon', 'throwLow']],
    gapMs: [1250, 1000, 820], openMs: [2800, 2400, 2000] },
  2: { tint: 0x7fc8ff, shotTint: ICE_THING, beaten: 'THE GOLEM SHATTERS!', call: 'THE MOUNTAIN ANSWERS!',
    attacks: [['throwLow', 'icicles', 'throwHigh'], ['throwHigh', 'slam', 'icicles', 'summon'], ['icicles', 'slam', 'throwLow', 'throwHigh', 'summon', 'icicles']],
    gapMs: [1350, 1100, 900], openMs: [2800, 2400, 2000] },
  3: { tint: 0xffe066, shotTint: 0xfff3a0, beaten: 'THE STORM BREAKS!', call: 'FLY, MY SWOOPERS!',
    attacks: [['zap', 'throwHigh', 'zap'], ['zap', 'swoop', 'throwLow', 'zap'], ['zap', 'zap', 'swoop', 'throwHigh', 'zap', 'throwLow']],
    gapMs: [1300, 1080, 900], openMs: [2700, 2300, 1950] },
  4: { tint: 0xb084ff, shotTint: 0x8a6cff, beaten: 'THE ALTERING ENDS!', call: 'RISE, PHANTOMS!',
    attacks: [['throwLow', 'phantom', 'throwHigh'], ['dark', 'throwHigh', 'throwLow', 'phantom'], ['dark', 'throwLow', 'throwHigh', 'phantom', 'throwLow', 'throwHigh']],
    gapMs: [1250, 1050, 880], openMs: [2700, 2300, 1950] },
};

const HERO_HALF_W = 15;
/** Thumb buttons (bottom right). `pad` = extra touch radius around the drawing. */
const BTN = {
  attack: { x: GAME_W - 72, y: GAME_H - 70, r: 56, pad: 44 },
  power: { x: GAME_W - 200, y: GAME_H - 52, r: 42, pad: 32 },
};
/** Rivals, guards and archers are hero sheets flipped to face left, in an "Altered" purple; the boss glows ember. */
const RIVAL_TINT = 0xa58cff;
const BOSS_OPEN_TINT = 0x8c93b8;
const MITE_TINT = 0xffa060;
/** Guards block hits weaker than this (the Hammer does 4; a Legendary Sword 3). */
const GUARD_ARMOUR = 3;
const SECRET_TINT = 0xd28cff;
const SECRET_SCORE = 50;
/** Boss: 12 HP in three phases of 4. Each OPEN window can take at most the rest of the current phase. */
const BOSS_PHASE_HP = 4;
const BOSS_HOME_X = GAME_W - 170;
type BossState = 'enter' | 'attack' | 'open' | 'retreat';
const ICE_TINT = 0x9fe8ff;
/** Seconds between a rock landing and the hero reaching it. */
const ROCK_LEAD_S = 0.5;
const HERO_STAND_H = 82;
const HERO_SLIDE_H = 36;
const COYOTE_MS = 90;
const JUMP_BUFFER_MS = 140;
const PIT_TOP = GROUND_Y - 6;

export class RunScene extends Phaser.Scene {
  private lo!: Loadout;
  /** Hero skins the player did not pick: these become the giant Altered rivals. */
  private rivals: string[] = [];
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
  private shieldBubble!: ShieldBubble;
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
  private powerMs = 1; // length of the running power, for the button ring
  private coinPullUntil = 0;

  // HUD
  private heartImgs: Phaser.GameObjects.Image[] = [];
  private scoreText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private progressFill!: Phaser.GameObjects.Rectangle;
  private meterFill!: Phaser.GameObjects.Rectangle;
  private meterLabel!: Phaser.GameObjects.Text;
  private powerBtn!: Phaser.GameObjects.Container;
  private powerArc!: Phaser.GameObjects.Graphics;
  private powerLbl!: Phaser.GameObjects.Text;
  private attackBtn!: Phaser.GameObjects.Container;
  private attackArc!: Phaser.GameObjects.Graphics;
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

  // Stage mode (world map) vs a random run. In a stage, patterns come from stage.seq in order.
  private stage: Stage | undefined;
  /** Runs without a stage (THEOS-40): Endless (random every time) or the Daily (seeded from the date). */
  private mode: RunMode = 'endless';
  private distText?: Phaser.GameObjects.Text;
  private seqIdx = 0;
  /** All pattern randomness: seeded per stage so it plays the same every time; unseeded in a random run. */
  private rng = new Phaser.Math.RandomDataGenerator();
  private coinsSpawned = 0;
  private hitsTaken = 0;
  private secretsFound = 0;
  private secretsSpawned = 0;

  // Boss (stage entry "boss"): no other patterns spawn while it is alive.
  private boss: Ob | null = null;
  private bossState: BossState = 'enter';
  private bossPhase = 0;          // 0, 1, 2
  private bossQueue: string[] = [];
  private bossNextAt = 0;         // scene ms of the next attack / state change
  private bossInvulnUntil = 0;
  private bossBar?: Phaser.GameObjects.Container;
  private bossFill?: Phaser.GameObjects.Rectangle;
  private bossDef: BossDef = BOSSES[1];

  // Worlds (THEOS-39): the stage's world, and +1 weapon damage when the weapon AWI's element is strong here.
  private world: World = WORLDS[0];
  private dmgBonus = 0;
  // Darkness (Shadow Wilds): the overlay, how dark it is now, and how dark it is heading.
  private darkRT?: Phaser.GameObjects.RenderTexture;
  private darkHole?: Phaser.GameObjects.Image;
  private dark = 0;
  private darkTarget = 0;
  private darkUntil = 0;   // scene ms: a boss's "lights out" ends then

  constructor() { super('Run'); }

  init(data: { loadout?: Loadout; stageId?: string; mode?: RunMode }): void {
    this.lo = data?.loadout ?? guestLoadout();
    this.stage = getStage(data?.stageId);
    this.mode = data?.mode === 'daily' ? 'daily' : 'endless';
    this.distText = undefined;
    this.seqIdx = 0; this.coinsSpawned = 0; this.hitsTaken = 0; this.secretsFound = 0; this.secretsSpawned = 0;
    this.boss = null; this.bossState = 'enter'; this.bossPhase = 0; this.bossQueue = []; this.bossNextAt = 0; this.bossInvulnUntil = 0;
    this.bossBar = undefined; this.bossFill = undefined;
    this.world = WORLDS.find((w) => w.num === this.stage?.world) ?? WORLDS[0];
    this.bossDef = BOSSES[this.world.num] ?? BOSSES[1];
    this.dmgBonus = this.stage && this.lo.element === this.world.strong ? 1 : 0;
    this.darkRT = undefined; this.darkHole = undefined; this.dark = 0; this.darkTarget = 0; this.darkUntil = 0;
    this.rng = new Phaser.Math.RandomDataGenerator([this.stage ? `stage-${this.stage.id}-${this.stage.seed}` : this.mode === 'daily' ? dailySeed() : `${Date.now()}-${Math.random()}`]);
    this.rivals = Object.keys(SKINS).filter((id) => id !== this.lo.skin.id);
    // Reset all per-run state (the scene instance is reused between runs).
    this.obs = []; this.coins = []; this.shots = []; this.flag = null; this.heartImgs = []; this.popups = []; this.flyCoins = [];
    this.nextSpawn = 2.2 * RUN.speedStart; this.finishing = false;
    this.vy = 0; this.onGround = true; this.lastGroundAt = 0; this.airJumps = this.lo.trinket.airJumps ?? 0;
    this.jumpBufferUntil = 0; this.slideQueued = false; this.slideUntil = 0; this.attackUntil = 0; this.attackReadyAt = 0; this.swingId = 0;
    this.invulnUntil = 0; this.visual = ''; this.dead = false; this.ended = false; this.hitStopUntil = 0; this.slowUntil = 0; this.slowScale = 1;
    this.sqX = 1; this.sqY = 1;
    this.now = 0; this.elapsed = 0; this.speed = this.stage?.speedStart ?? RUN.speedStart; this.distance = 0;
    this.coinCount = 0; this.kills = 0; this.crates = 0; this.bonus = 0; this.hearts = this.lo.hearts;
    this.shield = this.lo.trinket.shield ?? 0; this.shieldRechargeAt = 0; this.combo = 0; this.comboUntil = 0;
    this.meter = 0; this.powerEl = this.lo.element; this.powerUntil = 0; this.coinPullUntil = 0;
    this.hudTick = 0; this.lastScoreShown = -1; this.petReadyAt = 0;
  }

  create(): void {
    // Day sky: the bottom colour matches GameArt2D's BG.png, whose own sky is keyed out of bg.far.
    // Each world tints the same art (its own background art comes with THEOS-41).
    const th = this.world.theme;
    const sky = this.add.graphics();
    sky.fillGradientStyle(th.skyTop, th.skyTop, th.skyBottom, th.skyBottom, 1);
    sky.fillRect(0, 0, GAME_W, GROUND_Y);
    this.add.circle(560, 110, 34, th.sun, 0.95);
    this.bgFar = this.add.tileSprite(0, GROUND_Y - 30, GAME_W, 220, 'bg.far').setOrigin(0, 1).setTileScale(scaleOf('bg.far')).setTint(th.bgTint);
    this.bgNear = this.add.tileSprite(0, GROUND_Y + 4, GAME_W, 160, 'bg.near').setOrigin(0, 1).setTileScale(scaleOf('bg.near')).setTint(th.bgTint);
    this.ground = this.add.tileSprite(0, GROUND_Y - 6, GAME_W, GAME_H - GROUND_Y + 6, 'bg.ground').setOrigin(0).setTileScale(scaleOf('bg.ground')).setTint(th.groundTint);
    this.weather(th.weather);

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
    this.shieldBubble = new ShieldBubble(this, 6);
    this.shieldBubble.setCharges(this.shield);

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
    for (let i = 0; i < 4; i++) this.shots.push({ img: this.add.image(-100, -100, wKey).setScale(scaleOf(wKey)).setDepth(6).setVisible(false), alive: false, dist: 0, vx: 1, vy: 0 });

    this.buildHud();
    this.stageBanner();
    this.gestures = new GestureInput(this);
    this.gestures.claim = (p) => this.claimTouch(p);
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
    const best = !this.stage && this.mode === 'daily' ? dailyToday().best : bestScore();
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
    if (!this.stage) {
      // Endless and Daily have no finish line: show the distance instead.
      track.setVisible(false); this.progressFill.setVisible(false); flag.setVisible(false);
      this.distText = text(this, GAME_W / 2, 20, '0 m', 18, '#ffffff', '900').setOrigin(0.5).setStroke('#2b2440', 5);
      hud.add(this.distText);
    }
    // The four AWI slots, always on screen.
    const slots = slotRow(this, GAME_W - (4 * 52 + 3 * 14) - 12, 22, this.lo, 52, 14, true, 12);
    slots.setAlpha(0.92);
    hud.add(slots);
    this.comboText = text(this, GAME_W / 2, 64, '', 30, '#ffd34d', '900').setOrigin(0.5).setStroke('#2b2440', 7).setDepth(21).setAlpha(0);

    this.makeActionButtons();
    this.showControlsHint();
    muteButton(this, 30, GAME_H - 30, 18).setDepth(21).setAlpha(0.85);

    // Red edge when on the last heart.
    this.vignette = this.add.graphics().setDepth(19).setAlpha(0);
    this.vignette.lineStyle(26, 0xff2244, 0.5).strokeRect(0, 0, GAME_W, GAME_H);
    if (DEBUG) this.fpsText = text(this, 64, GAME_H - 28, '', 14, '#2b2440', '700').setDepth(30);
  }

  /**
   * Thumb buttons in the dirt strip under the ground line (so they never hide what is coming):
   * ATTACK (bottom right, shows your weapon, dims while it recharges) and POWER (to its left, a ring that
   * fills with the meter and pulses when ready). Both fire on touch-down. Swipes and keys still work.
   */
  private makeActionButtons(): void {
    const round = (x: number, y: number, r: number, col: number, kids: Phaser.GameObjects.GameObject[]) => {
      const bg = this.add.circle(0, 0, r, 0x2b2440, 0.72).setStrokeStyle(5, col, 1);
      return this.add.container(x, y, [bg, ...kids]).setDepth(21);
    };
    // ATTACK: big, in the corner under the right thumb, showing the equipped weapon angled like a swing.
    const A = BTN.attack;
    const wKey = `weapon.${this.lo.weapon.id}`;
    const wIcon = this.add.image(0, -6, wKey).setAngle(-45).setTint(this.lo.weapon.tint);
    wIcon.setScale(Math.min(64 / wIcon.width, 64 / wIcon.height) * 1.25);
    const aLbl = text(this, 0, A.r - 18, 'ATTACK', 14, '#ffffff', '900').setOrigin(0.5).setStroke('#2b2440', 4);
    this.attackArc = this.add.graphics();
    this.attackBtn = round(A.x, A.y, A.r, 0xffffff, [this.attackArc, wIcon, aLbl]);
    // POWER: element icon + a ring that fills as the meter charges.
    const P = BTN.power, col = ELEMENT_COLOR[this.powerEl];
    this.powerArc = this.add.graphics();
    const pIcon = text(this, 0, -7, ELEMENT_ICON[this.powerEl], 34, '#ffffff').setOrigin(0.5);
    this.powerLbl = text(this, 0, P.r - 15, 'POWER', 13, '#ffffff', '900').setOrigin(0.5).setStroke('#2b2440', 4);
    this.powerBtn = round(P.x, P.y, P.r, col, [this.powerArc, pIcon, this.powerLbl]);

    // Touch zones much bigger than the drawings, checked before a touch can become a jump:
    // the nearest button whose zone the finger lands in gets it.
  }

  /** A touch-down in a button's zone fires that button (and is not a jump). Wired to GestureInput.claim. */
  private claimTouch(p: Phaser.Input.Pointer): boolean {
    if (this.dead || this.ended) return false; // the buttons are faded out once the run is over
    const A = BTN.attack, P = BTN.power;
    const press = (c: Phaser.GameObjects.Container) => { c.setScale(0.88); this.time.delayedCall(110, () => c.setScale(1)); };
    const da = Phaser.Math.Distance.Between(p.x, p.y, A.x, A.y), dp = Phaser.Math.Distance.Between(p.x, p.y, P.x, P.y);
    const inA = da < A.r + A.pad, inP = dp < P.r + P.pad;
    if (inA && (!inP || da / A.r <= dp / P.r)) { press(this.attackBtn); this.tryAttack(); return true; }
    if (inP) { press(this.powerBtn); this.activatePower(); return true; }
    return false;
  }

  /** A stage starts with its name and what it teaches (the stage tip). */
  private stageBanner(): void {
    const st = this.stage;
    const tip = st ? st.tip : this.mode === 'daily' ? `Same run for everyone today · your best ${dailyToday().best}` : 'No finish line. It only gets faster.';
    const name = st ? `${st.world}-${st.num} · ${st.name.toUpperCase()}` : this.mode === 'daily' ? 'DAILY RUN' : 'ENDLESS';
    const title = text(this, GAME_W / 2, 132, name, 30, '#ffffff', '900')
      .setOrigin(0.5).setStroke('#2b2440', 7).setDepth(22);
    const parts: Phaser.GameObjects.Text[] = [title];
    if (tip) parts.push(text(this, GAME_W / 2, 164, tip, 17, '#ffd34d', '800').setOrigin(0.5).setStroke('#2b2440', 5).setDepth(22));
    if (st && st.world > 1) {
      const el = this.world.strong, mine = this.lo.element === el;
      const msg = mine ? `${ELEMENT_ICON[el]} Your ${el} AWI is strong here: harder hits, longer POWER` : `${ELEMENT_ICON[el]} ${el} AWIs are strongest in ${this.world.name}`;
      parts.push(text(this, GAME_W / 2, 192, msg, 15, mine ? '#80ffdb' : '#ffffff', '800').setOrigin(0.5).setStroke('#2b2440', 5).setDepth(22));
    }
    for (const t of parts) {
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 250 });
      this.tweens.add({ targets: t, alpha: 0, delay: 3600, duration: 500, onComplete: () => t.destroy() });
    }
  }

  /** The first few runs: point at the controls for a few seconds (phones have no keys to discover). */
  private showControlsHint(): void {
    const KEY = 'altered-run.hints.v1';
    let seen = 0;
    try { seen = Number(localStorage.getItem(KEY)) || 0; localStorage.setItem(KEY, String(seen + 1)); } catch { /* private mode */ }
    if (seen >= 3) return;
    const touch = this.sys.game.device.input.touch;
    const tip = (x: number, y: number, msg: string, size = 18) =>
      text(this, x, y, msg, size, '#ffffff', '900').setOrigin(0.5).setStroke('#2b2440', 6).setDepth(22).setAlign('center');
    const items = [
      tip(GAME_W / 2, 190, touch ? 'TAP anywhere = JUMP   ·   SWIPE ↓ = SLIDE' : 'SPACE = JUMP   ·   ↓ = SLIDE', 22),
      tip(BTN.attack.x, BTN.attack.y - BTN.attack.r - 34, touch ? 'ATTACK\n↓' : 'ATTACK (X)\n↓'),
      tip(BTN.power.x, BTN.power.y - BTN.power.r - 34, touch ? 'POWER\n↓' : 'POWER (Q)\n↓'),
      tip(GAME_W / 2, 224, 'Coins and hits fill your POWER', 16),
    ];
    for (const t of items) {
      t.setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, duration: 250 });
      this.tweens.add({ targets: t, y: t.y - 6, duration: 420, yoyo: true, repeat: 6, ease: 'Sine.InOut' });
      this.tweens.add({ targets: t, alpha: 0, delay: 5200, duration: 500, onComplete: () => t.destroy() });
    }
  }

  private updateHud(): void {
    this.progressFill.width = Math.max(1, 220 * this.progress());
    this.distText?.setText(`${Math.round(this.distance / 10)} m`);
    this.meterFill.width = Math.max(1, 150 * this.meter);
    const ready = this.meter >= 1 && !this.powerActive();
    // POWER ring: fills with the meter, pulses + "READY!" when full, drains while the power runs.
    const fill = this.powerActive() ? Math.max(0, (this.powerUntil - this.now) / this.powerMs) : this.meter;
    this.powerArc.clear().lineStyle(6, ELEMENT_COLOR[this.powerEl], ready ? 1 : 0.85)
      .beginPath().arc(0, 0, BTN.power.r - 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * fill).strokePath();
    this.powerBtn.setAlpha(ready || this.powerActive() ? 1 : 0.75);
    if (this.powerBtn.scale > 0.9) this.powerBtn.setScale(ready ? 1.06 + Math.sin(this.now / 110) * 0.08 : 1);
    this.powerLbl.setText(ready ? 'READY!' : 'POWER');
    // ATTACK: dims and shows a sweep while the weapon recharges.
    const cd = this.lo.weapon.cooldownMs * (this.lo.skin.attackCdMul ?? 1);
    const left = Math.max(0, (this.attackReadyAt - this.now) / cd);
    this.attackArc.clear();
    if (left > 0) this.attackArc.fillStyle(0x000000, 0.45).slice(0, 0, BTN.attack.r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left).fillPath();
    this.attackBtn.setAlpha(left > 0 ? 0.7 : 1);
    if (this.dead || this.ended) { this.attackBtn.setAlpha(0.25); this.powerBtn.setAlpha(0.25).setScale(1); }
    this.vignette.setAlpha(this.hearts === 1 && !this.dead ? 0.55 + Math.sin(this.now / 160) * 0.35 : 0);
    if (this.boss && this.bossFill) this.bossFill.width = Math.max(1, 296 * (this.boss.hp / (HP.boss ?? 12)));
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

  /** Light ambient particles per world: snow, rain, or drifting motes. */
  private weather(kind: World['theme']['weather']): void {
    if (!kind) return;
    const dotS = scaleOf('fx.dot'), pxS = scaleOf('fx.px');
    if (kind === 'snow') {
      this.add.particles(0, -10, 'fx.dot', {
        x: { min: 0, max: GAME_W + 300 }, lifespan: 5200, speedX: { min: -160, max: -60 }, speedY: { min: 60, max: 120 },
        scale: { min: 0.25 * dotS, max: 0.6 * dotS }, alpha: 0.85, frequency: 70,
      }).setDepth(8);
    } else if (kind === 'rain') {
      this.add.particles(0, -20, 'fx.px', {
        x: { min: 0, max: GAME_W + 400 }, lifespan: 700, speedX: -420, speedY: 900, rotate: 65,
        scaleX: 9 * pxS, scaleY: 0.6 * pxS, alpha: 0.45, tint: 0xcfe0ff, frequency: 18,
      }).setDepth(8);
    } else {
      this.add.particles(0, 0, 'fx.dot', {
        x: { min: 0, max: GAME_W }, y: { min: 120, max: GROUND_Y - 20 }, lifespan: 2600, speedX: { min: -60, max: -20 }, speedY: { min: -20, max: 20 },
        scale: { start: 0.45 * dotS, end: 0 }, alpha: { start: 0.9, end: 0 }, tint: 0xc8a8ff, blendMode: 'ADD', frequency: 180,
      }).setDepth(13);
    }
  }

  /** Darkness: a black layer with a soft hole of light around the hero (made the first time it is needed). */
  private setDark(on: boolean): void {
    this.darkTarget = on ? 1 : 0;
    if (!on || this.darkRT) return;
    if (!this.textures.exists('fx.hole')) {
      const g = this.make.graphics({}, false);
      for (let r = 200; r > 0; r -= 8) g.fillStyle(0xffffff, r > 120 ? 0.05 : 0.14).fillCircle(200, 200, r);
      g.generateTexture('fx.hole', 400, 400); g.destroy();
    }
    this.darkHole = this.make.image({ key: 'fx.hole', add: false });
    this.darkRT = this.add.renderTexture(0, 0, GAME_W, GAME_H).setOrigin(0).setDepth(12);
  }

  private updateDark(dt: number, now: number): void {
    if (!this.darkRT) return;
    if (this.darkUntil && now >= this.darkUntil) { this.darkUntil = 0; this.darkTarget = 0; }
    // A Chain storm (and its coin pull afterwards) lights everything up.
    const target = now < this.coinPullUntil || this.powerActive('Storm') ? 0 : this.darkTarget;
    this.dark += Phaser.Math.Clamp(target - this.dark, -dt * 2.5, dt * 1.2);
    if (this.dark < 0.01) { this.darkRT.setVisible(false); return; }
    this.darkRT.setVisible(true).clear().fill(0x05030f, 0.93 * this.dark);
    this.darkRT.erase(this.darkHole!, this.hero.x + 30, this.hero.y - 50);
  }

  private getOb(kind: Kind): Ob {
    let o = this.obs.find((x) => !x.img.active);
    if (!o) {
      o = {
        img: this.add.sprite(0, 0, TEX[kind]).setDepth(4), kind, alive: true, hx: 0, hy: 0, hw: 0, hh: 0, vx: 0, vy: 0,
        hp: 1, kick: 0, swing: -1, baseY: 0, falling: false, armed: false, frozen: false, minGap: 1e9, passed: false, w: 0, skin: '',
        t: 0, n: 0, tint: 0,
      };
      this.obs.push(o);
    }
    this.tweens.killTweensOf(o.img);
    const [hx, hy, hw, hh] = HITBOX[kind];
    const altered = ALTERED[kind];
    Object.assign(o, { kind, alive: true, hx, hy, hw, hh, vx: 0, vy: 0, hp: HP[kind] ?? 1, kick: 0, swing: -1, falling: false, armed: false,
      frozen: this.powerActive('Ice'), minGap: 1e9, passed: false, w: 0, t: 0, n: 0,
      tint: kind === 'boss' ? this.bossDef.tint : kind === 'golem' ? 0x7fb4ff : kind === 'phantom' ? 0x7a5cc0 : altered ? RIVAL_TINT
        : kind === 'mite' ? MITE_TINT : kind === 'arrow' ? 0xff6b6b : kind === 'wave' ? 0xff7a45
        : kind === 'icicle' || kind === 'wall' ? ICE_THING : kind === 'swooper' || kind === 'zap' ? 0xffe066 : 0,
      skin: altered ? Phaser.Utils.Array.GetRandom(this.rivals) : '' });
    const tex = altered ? `hero.${o.skin}.run` : TEX[kind];
    const scale = scaleOf(tex) * (altered ?? (kind === 'mite' ? 0.55 : 1));
    o.img.anims.stop();
    o.img.setActive(true).setVisible(true).setAlpha(1).setAngle(0).setOrigin(0.5, kind === 'arrow' ? 0.5 : 1)
      .setFlipX(!!altered || kind === 'arrow').setFlipY(kind === 'icicle').setTexture(tex, 0).setScale(scale)
      .setDepth(kind === 'pit' || kind === 'zone' || kind === 'zap' ? 1 : kind === 'ledge' ? 3 : 4);
    o.label?.setVisible(false);
    this.baseTint(o);
    o.prop?.setVisible(false);
    o.img.setBlendMode(Phaser.BlendModes.NORMAL);
    if (kind === 'slime') { o.img.play(TEX.slime); o.vx = -70; }
    if (kind === 'mite') { o.img.play(TEX.slime); o.vx = -60; }
    if (kind === 'fly') { o.img.play(TEX.fly); o.vx = -90; }
    if (kind === 'rival') { o.img.play(tex); o.vx = -40; }
    if (kind === 'guard') {
      o.img.play(tex); o.vx = -45;
      o.prop ??= this.add.image(0, 0, 'trinket.shield').setDepth(5);
      o.prop.setVisible(true).setAlpha(1).setAngle(0).setTint(0xd0d6ff).setScale(scaleOf('trinket.shield') * 1.5);
    }
    if (kind === 'boss') o.img.play(tex);
    if (kind === 'golem') { o.img.play(tex); o.img.anims.timeScale = 0.6; o.vx = -25; }
    if (kind === 'phantom') { o.img.play(tex); o.vx = -30; o.armed = false; o.t = this.now + this.rng.between(300, PHANTOM_SOLID_MS); }
    if (kind === 'swooper') { o.img.play(TEX.fly); o.vx = -50; }
    if (kind === 'wall') o.img.setDisplaySize(60, 212).setAlpha(0.92);
    if (o.frozen) o.img.anims.pause();
    return o;
  }

  /** The tint an obstacle shows when nothing is flashing it. */
  private baseTint(o: Ob): void {
    if (o.frozen) o.img.setTint(ICE_TINT);
    else if (o.tint) o.img.setTint(o.tint);
    else o.img.clearTint();
  }

  private free(o: Ob): void {
    o.img.setActive(false).setVisible(false); o.alive = false;
    o.label?.setVisible(false);
    if (o.kind === 'golem') o.img.anims.timeScale = 1;
    o.shadow?.setVisible(false);
    o.prop?.setVisible(false);
    if (o === this.flag) this.flag = null;
  }

  private getCoin(x: number, y: number): Coin {
    let c = this.coins.find((k) => !k.img.active);
    if (!c) {
      c = { img: this.add.sprite(0, 0, 'obj.coin').setDepth(3).setScale(scaleOf('obj.coin')).play('obj.coin'), alive: true, pulled: false, secret: false };
      this.coins.push(c);
    }
    c.alive = true; c.pulled = false; c.secret = false;
    c.img.setActive(true).setVisible(true).setPosition(x, y).clearTint().setScale(scaleOf('obj.coin'));
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
      ['rock', p > 0.2 ? 0.9 : 0],
      ['rival', p > 0.22 ? 1.1 : 0],
      ['widePit', p > 0.3 ? 1.1 : 0],
      ['spike2', p > 0.3 ? 1.1 : 0],
      ['crate2', p > 0.25 ? 0.8 : 0],
      ['guard', p > 0.2 ? 0.8 : 0],
      ['swarm', p > 0.25 ? 0.8 : 0],
      ['archer', p > 0.3 ? 0.7 : 0],
      ['secret', p > 0.15 ? 0.25 : 0],
      ['coins', 0.7],
    ];
    let r = this.rng.frac() * table.reduce((a, [, w]) => a + w, 0);
    let pick = 'spike';
    for (const [k, w] of table) { if ((r -= w) <= 0) { pick = k; break; } }
    return this.spawn(pick, x);
  }

  /** Place one pattern at x; returns how much room it takes. Public so ?debug can force patterns. */
  spawn(pick: string, x = GAME_W + 80): number {
    const air = (2 * RUN.jumpVelocity) / RUN.gravity; // seconds in the air for one jump
    switch (pick) {
      case 'spike': this.place('spike', x); if (this.rng.frac() < 0.6) this.coinArc(x); return 60;
      case 'spike2': this.place('spike', x); this.place('spike', x + 52); if (this.rng.frac() < 0.5) this.coinArc(x + 26); return 110;
      case 'crate': this.place('crate', x); if (this.rng.frac() < 0.5) this.coinArc(x); return 60;
      case 'crate2': this.place('crate', x); this.place('crate', x, GROUND_Y - 54); return 60;
      case 'bar': this.place('bar', x, GROUND_Y - 44); this.coinLine(x - 40, GROUND_Y - 20, 4, 30); return 80;
      case 'slime': this.place('slime', x); return 60;
      case 'fly': case 'flyLow': case 'flyHigh': {
        // Head height: slide under, or hit it. Now and then a high one guards a coin line.
        const high = pick === 'flyHigh' || (pick === 'fly' && this.rng.frac() < 0.3);
        const o = this.place('fly', x, high ? GROUND_Y - 170 : GROUND_Y - 52);
        o.baseY = o.img.y;
        if (high) this.coinLine(x - 60, GROUND_Y - 200, 4, 34);
        return 80;
      }
      case 'rival': this.place('rival', x); return 90;
      case 'rock': {
        const o = this.place('rock', x + 40, -60);
        o.falling = true; o.armed = false;
        o.shadow ??= this.add.image(0, 0, 'fx.dot').setTint(0x2b2440).setDepth(2);
        o.shadow.setVisible(true).setAlpha(0.25).setScale(3.2 * scaleOf('fx.dot'), 0.8 * scaleOf('fx.dot')).setPosition(o.img.x, GROUND_Y - 2);
        return 90;
      }
      case 'pit': {
        // Narrow: one well-timed jump clears it.
        const w = Math.round(this.speed * air * this.rng.realInRange(0.45, 0.62));
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
      case 'high': case 'highStep': case 'highTop': {
        // A high ledge full of coins: double jump, or use the low step first. Magnets and pets can pull them down.
        const step = pick === 'highStep' || (pick === 'high' && this.rng.frac() < 0.6);
        if (step) this.place('ledge', x, GROUND_Y - 95 + 44);
        this.place('ledge', x + (step ? 230 : 60), GROUND_Y - 215 + 44);
        this.coinLine(x + (step ? 170 : 0), GROUND_Y - 240, 5, 30);
        return step ? 360 : 220;
      }
      case 'guard': this.place('guard', x); if (this.rng.frac() < 0.5) this.coinArc(x); return 70;
      case 'guard2': this.place('guard', x); this.place('guard', x + 130); return 190;
      case 'guardBar':
        // Jump the guard, land, then slide under the bar. A Hammer just smashes the guard.
        this.place('guard', x);
        this.place('bar', x + 400, GROUND_Y - 44); this.coinLine(x + 360, GROUND_Y - 20, 4, 30);
        return 460;
      case 'swarm': case 'swarmBig': {
        const n = pick === 'swarmBig' ? 7 : 5;
        for (let i = 0; i < n; i++) { const o = this.place('mite', x + i * 44); o.baseY = GROUND_Y; }
        return n * 44 + 30;
      }
      case 'archer': case 'archerPit': {
        // A high ledge with an archer on it. archerPit: a pit underneath, so you can't just stand and wait.
        let ax = x + 60;
        if (pick === 'archerPit') {
          const w = Math.round(this.speed * air * 0.5);
          this.placePit(x, w); this.coinArcOver(x + w / 2, 3);
          ax = x + w + 140;
        }
        this.placeArcher(ax);
        return ax - x + 140;
      }
      case 'archer2': this.placeArcher(x + 60); this.placeArcher(x + 380); return 520;
      case 'secret': {
        // Hidden gems, too high for one jump: the Feather's extra jump or the Magnet reaches them. A faint sparkle hints.
        this.secretsSpawned += SECRET_GEMS;
        for (let i = 0; i < SECRET_GEMS; i++) {
          const c = this.getCoin(x + i * 36, GROUND_Y - 322 - (i === 1 ? 10 : 0));
          c.secret = true;
          c.img.setTint(SECRET_TINT).setScale(scaleOf('obj.coin') * 1.15);
        }
        return 120;
      }
      // ── Frost Peaks ──
      case 'icicle': this.placeIcicle(x + 40); if (this.rng.frac() < 0.5) this.coinArc(x + 40); return 90;
      case 'icicles': for (let i = 0; i < 3; i++) this.placeIcicle(x + 40 + i * 170); return 400;
      case 'slick': {
        // A stretch of ice with spikes on it: your slides go further, the jumps stay the same.
        this.placeZone(x, 820, 'ice');
        this.place('spike', x + 260); this.place('spike', x + 560); this.coinLine(x + 340, GROUND_Y - 30, 5, 40);
        return 820;
      }
      case 'slickBars': {
        // Two bars close together on ice: one long ice slide passes under both.
        this.placeZone(x, 900, 'ice');
        this.place('bar', x + 300, GROUND_Y - 44); this.place('bar', x + 640, GROUND_Y - 44);
        this.coinLine(x + 260, GROUND_Y - 20, 10, 46);
        return 900;
      }
      case 'golem': this.place('golem', x); if (this.rng.frac() < 0.5) this.coinArc(x); return 80;
      case 'golem2': this.place('golem', x); this.place('golem', x + 260); return 320;
      case 'iceWall': {
        // Coins on the way in fill your POWER; break the wall before you reach it.
        this.coinLine(x, GROUND_Y - 30, 5, 40);
        this.place('wall', x + 380);
        return 420;
      }
      // ── Storm Coast ──
      case 'zap': this.placeZap(x + 40); return 100;
      case 'zap2': this.placeZap(x + 40); this.placeZap(x + 330); return 400;
      case 'updraft': {
        // A gap wider than one jump, inside an updraft that carries you across. Coins show the way.
        const w = Math.round(this.speed * air * 1.4);
        this.placeZone(x, w + 380, 'up');
        this.placePit(x + 200, w);
        this.coinLine(x + 200, GROUND_Y - 200, Math.max(4, Math.round(w / 60)), 60);
        return w + 400;
      }
      case 'downdraft': {
        // Short jumps: spikes in a row inside a downdraft.
        this.placeZone(x, 760, 'down');
        this.place('spike', x + 200); this.place('spike', x + 252); this.place('spike', x + 520);
        this.coinLine(x + 330, GROUND_Y - 30, 4, 40);
        return 760;
      }
      case 'swooper': this.placeSwooper(x + 60); return 100;
      case 'swooper2': this.placeSwooper(x + 60); this.placeSwooper(x + 420); return 480;
      // ── Shadow Wilds ──
      case 'phantom': this.place('phantom', x); if (this.rng.frac() < 0.5) this.coinArc(x); return 80;
      case 'phantom2': this.place('phantom', x); this.place('phantom', x + 300); return 360;
      case 'blinkPit': {
        // A wide pit with two ledges that come and go, out of step with each other.
        const w = Math.round(this.speed * air * 1.7);
        this.placePit(x, w);
        for (let i = 0; i < 2; i++) {
          const l = this.place('ledge', x + w * (0.3 + 0.4 * i), GROUND_Y - 84 + 44);
          l.skin = 'blink'; l.armed = false; l.t = this.now + BLINK_ON_MS - i * 600;
        }
        this.coinLine(x + w * 0.3 - 40, GROUND_Y - 118, 3, 40);
        return w + 60;
      }
      case 'dark': this.setDark(true); return 0;
      case 'light': this.setDark(false); return 0;
      case 'boss': this.startBoss(); return 0;
      case 'rest': return 0;
      case 'coinsLow': this.coinLine(x, GROUND_Y - 30, 6, 40); return 240;
      case 'coinsHigh': this.jumpArc(x + 100, 6, 40); return 240;
      default: if (this.rng.frac() < 0.5) this.coinLine(x, GROUND_Y - 30, 6, 40); else this.jumpArc(x + 100, 6, 40); return 240;
    }
  }

  private placeIcicle(x: number): void {
    const o = this.place('icicle', x, 150);
    o.falling = true; o.armed = false; o.baseY = 150;
    o.shadow ??= this.add.image(0, 0, 'fx.dot').setTint(0x2b2440).setDepth(2);
    o.shadow.setVisible(true).setAlpha(0.2).setScale(2.4 * scaleOf('fx.dot'), 0.7 * scaleOf('fx.dot')).setPosition(x, GROUND_Y - 2);
  }

  /** A ground effect over [x, x + w): 'ice', 'up' or 'down' (see zoneAt). */
  private placeZone(x: number, w: number, type: 'ice' | 'up' | 'down'): void {
    const o = this.getOb('zone');
    o.alive = false; o.w = w; o.skin = type;
    const ice = type === 'ice';
    o.img.setOrigin(0, 1).setPosition(x, ice ? GROUND_Y + 8 : GROUND_Y).setTint(ice ? 0xdff6ff : type === 'up' ? 0xbfe6ff : 0x8a9ab8)
      .setDisplaySize(w, ice ? 16 : 380).setAlpha(ice ? 0.85 : 0.16);
    if (!ice) {
      o.label ??= text(this, 0, 0, '', 16, '#ffffff', '900').setOrigin(0.5).setStroke('#2b2440', 4).setDepth(3);
      o.label.setText(type === 'up' ? '⇡ UPDRAFT ⇡' : '⇣ DOWNDRAFT ⇣').setVisible(true).setAlpha(0.9);
    }
  }

  /** The zone of this type under x, if any. */
  private zoneAt(x: number, type: string): boolean {
    for (const o of this.obs) if (o.kind === 'zone' && o.img.active && o.skin === type && x >= o.img.x && x < o.img.x + o.w) return true;
    return false;
  }

  private placeZap(x: number, leadS = this.rng.realInRange(0.3, 1.3)): void {
    const o = this.place('zap', x, GROUND_Y + 4);
    o.alive = false; o.n = 0; o.baseY = leadS;
    o.img.setScale(5.5 * scaleOf('fx.dot'), 1.1 * scaleOf('fx.dot')).setOrigin(0.5, 1).setAlpha(0.6).setBlendMode(Phaser.BlendModes.ADD);
  }

  private placeSwooper(x: number): void {
    const o = this.place('swooper', x, GROUND_Y - 250);
    o.baseY = o.img.y; o.armed = false;
  }

  /** Per-frame behaviour of the Worlds 2–4 things. */
  private updateWorldThing(o: Ob, now: number): void {
    const h = this.hero;
    switch (o.kind) {
      case 'zap':
        if (o.n === 0) {
          o.img.setAlpha(((now / 120) | 0) % 2 ? 0.75 : 0.35);
          if (o.img.x - h.x < this.speed * o.baseY + 30 || o.img.x < h.x) {
            o.n = 1; o.t = now + ZAP_LIVE_MS; o.alive = !o.frozen;
            this.bolts.clear(); this.drawBolt(o.img.x, GROUND_Y);
            this.tweens.add({ targets: this.bolts, alpha: { from: 1, to: 0 }, duration: 260, onComplete: () => this.bolts.clear() });
            o.img.setAlpha(1).setTint(0xffffff).setScale(5.5 * scaleOf('fx.dot'), 2 * scaleOf('fx.dot'));
            this.time.delayedCall(60, () => this.baseTint(o));
            this.cameras.main.flash(70, 255, 240, 160);
            sfx.zap();
          }
        } else if (o.n === 1) {
          if (((now / 50) | 0) % 2) this.coinFx.explode(1, o.img.x + Phaser.Math.Between(-40, 40), GROUND_Y - 8);
          if (now >= o.t) { o.n = 2; o.alive = false; this.tweens.add({ targets: o.img, alpha: 0, duration: 250 }); }
        }
        break;
      case 'swooper':
        if (!o.armed && o.alive && !o.frozen && o.img.x - h.x < 380) {
          o.armed = true; this.telegraph(o);
          this.tweens.add({ targets: o.img, y: GROUND_Y - 44, duration: 430, ease: 'Quad.In', hold: 320, yoyo: true });
        } else if (!o.armed) o.img.y = o.baseY + Math.sin(now / 200) * 10;
        break;
      case 'phantom':
        if (o.frozen || !o.img.active) break;
        if (now >= o.t) {
          o.armed = !o.armed; // armed = faded
          o.t = now + (o.armed ? PHANTOM_FADE_MS : PHANTOM_SOLID_MS);
          this.tweens.add({ targets: o.img, alpha: o.armed ? 0.22 : 1, duration: 180 });
        }
        break;
      case 'ledge':
        if (o.skin !== 'blink') break;
        if (now >= o.t) {
          o.armed = !o.armed; // armed = gone
          o.alive = !o.armed;
          o.t = now + (o.armed ? BLINK_OFF_MS : BLINK_ON_MS);
          o.img.setAlpha(o.armed ? 0.12 : 1);
        } else if (!o.armed && o.t - now < 350) o.img.setAlpha(((now / 60) | 0) % 2 ? 0.35 : 1);
        break;
      case 'zone':
        o.label?.setPosition(o.img.x + o.w / 2, GROUND_Y - 250);
        if (o.skin !== 'ice' && ((now / 90) | 0) % 3 === 0) {
          this.dustFx.explode(1, o.img.x + Math.random() * o.w, o.skin === 'up' ? GROUND_Y - 20 : GROUND_Y - 340);
        }
        break;
    }
  }

  /** A high ledge (double-jump height) with an archer standing on it. */
  private placeArcher(x: number): void {
    const top = GROUND_Y - 215;
    this.place('ledge', x, top + 44);
    const a = this.place('archer', x, top);
    a.img.anims.stop(); a.img.setFrame(0);
  }

  private placePit(x: number, w: number): void {
    const o = this.getOb('pit');
    o.alive = false; o.w = w;
    o.img.setOrigin(0, 0).setPosition(x, PIT_TOP).setDisplaySize(w, asset('obj.pit').height * scaleOf('obj.pit'));
  }

  /**
   * n coins on the path of one full jump that peaks over cx, at the current speed. The world moves at `speed`,
   * so a coin u px from the peak is passed (u / speed) s from the top of the jump; it sits where the hero's
   * centre is then (pickup radius 46 px). One jump timed to peak over cx collects them all.
   */
  private jumpArc(cx: number, n: number, gap: number): void {
    this.coinsSpawned += n;
    const v = this.jumpVel(), g = RUN.gravity, s = Math.max(200, this.speed);
    const peak = (v * v) / (2 * g) - 6; // feet height at the top, a little under so early/late jumps still reach
    for (let i = 0; i < n; i++) {
      const u = (i - (n - 1) / 2) * gap, t = u / s;
      const feet = Math.max(24, peak - 0.5 * g * t * t);
      this.getCoin(cx + u, GROUND_Y - HERO_COIN_Y - feet);
    }
  }

  /** The arc over a spike or crate. */
  private coinArc(cx: number): void { this.jumpArc(cx, 5, 36); }

  /** The arc over a pit. */
  private coinArcOver(cx: number, n: number): void { this.jumpArc(cx, n, 55); }

  private coinLine(x: number, y: number, n: number, gap: number): void {
    this.coinsSpawned += n;
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

  /** Slides last longer on ice (Frost Peaks). */
  private slideMs(): number {
    if (!this.zoneAt(this.hero.x, 'ice')) return RUN.slideMs;
    this.coinFx.explode(6, this.hero.x, this.hero.y - 4);
    return RUN.slideMs * 1.8;
  }

  private trySlide(): void {
    if (this.onGround) {
      this.slideUntil = this.now + this.slideMs(); this.attackUntil = 0;
      this.dustFx.explode(8, this.hero.x + 10, this.hero.y); this.sqX = 1.2; this.sqY = 0.85;
      sfx.slide();
    } else { this.vy = Math.max(this.vy, RUN.fastFallVelocity); this.slideQueued = true; }
  }

  private tryAttack(): void {
    if (this.dead || this.ended || this.now < this.attackReadyAt) return;
    const w = this.lo.weapon;
    this.attackReadyAt = this.now + w.cooldownMs * (this.lo.skin.attackCdMul ?? 1);
    this.slideUntil = 0;
    this.swingId++;
    // Camera kick: a tiny shove in the attack direction.
    const cam = this.cameras.main;
    cam.scrollX = -5; this.tweens.add({ targets: cam, scrollX: 0, duration: 90 });
    if (w.thrown) {
      const s = this.shots.find((k) => !k.alive);
      if (s) {
        const sx = this.hero.x + 18, sy = this.hero.y - 52;
        // The Kunai's reach: it aims up at the nearest archer in range (melee can't reach a ledge from the ground).
        let vx = 1, vy = 0;
        const target = this.obs.find((o) => o.img.active && o.alive && o.kind === 'archer' && o.img.x > sx + 40
          && Phaser.Math.Distance.Between(sx, sy, o.img.x, o.img.y - 40) < w.range);
        if (target) {
          // Lead the target: it scrolls left while the kunai flies.
          const ty = target.img.y - 40, t = Phaser.Math.Distance.Between(sx, sy, target.img.x, ty) / 1150;
          const a = Math.atan2(ty - sy, target.img.x - this.speed * t - sx); vx = Math.cos(a); vy = Math.sin(a);
        }
        s.alive = true; s.dist = 0; s.vx = vx; s.vy = vy;
        s.img.setVisible(true).setPosition(sx, sy).setAngle(Phaser.Math.RadToDeg(Math.atan2(vy, vx))).setTint(w.tint);
      }
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
    const dur = { Fire: POWER.fireMs, Ice: POWER.iceMs, Storm: POWER.stormPullMs, Shadow: POWER.shadowMs }[el] * mul * (this.dmgBonus ? 1.4 : 1);
    this.powerUntil = this.now + dur; this.powerMs = dur;
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
      this.powerUntil = this.now + 350; this.powerMs = 350; // the strike itself is instant; the coin pull lasts
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
      this.shield--; this.shieldBubble.pop(this.shield);
      this.shieldRechargeAt = this.now + (this.lo.trinket.shieldRechargeMs ?? 15000);
      this.invulnUntil = this.now + 700;
      this.cameras.main.flash(120, 76, 201, 240);
      this.popup(this.hero.x, this.hero.y - 110, 'POP! BLOCKED', '#9ff3ff', 20);
      sfx.shield(); this.hitStop(60);
      return;
    }
    this.hearts--;
    this.hitsTaken++;
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
    if (ARMOURED.has(o.kind) && !byPower && dmg < GUARD_ARMOUR) { this.blocked(o); return false; }
    if (o.kind === 'boss') return this.damageBoss(o, dmg, byPower);
    o.hp -= dmg;
    const col = hex(ELEMENT_COLOR[this.powerEl]);
    this.popup(o.img.x, o.img.y + o.hy - 10, byPower ? ELEMENT_ICON[this.powerEl] : `-${Math.min(dmg, 9)}`, byPower ? col : '#ffffff', 22);
    if (o.hp <= 0) { this.kill(o); return true; }
    // Survived: white flash, knock-back, clang.
    o.img.setTintFill(0xffffff);
    this.time.delayedCall(70, () => this.baseTint(o));
    o.kick += kick;
    this.cameras.main.shake(60, 0.004);
    sfx.clang(); this.hitStop(50);
    return false;
  }

  /** A hit that bounced off a guard's shield. */
  private blocked(o: Ob): void {
    this.popup(o.img.x, o.img.y + o.hy - 14, 'BLOCKED', '#c0c8ff', 18);
    if (o.prop) { o.prop.setTintFill(0xffffff); this.time.delayedCall(80, () => o.prop?.setTint(0xd0d6ff)); }
    o.kick += 60;
    sfx.clang(); this.hitStop(35);
  }

  private kill(o: Ob): void {
    o.alive = false;
    if (ENEMY.has(o.kind)) {
      this.kills++;
      if (HEAVY.has(o.kind)) sfx.crash(); else sfx.squish();
    } else if (o.kind === 'arrow') { sfx.clang(); }
    else { this.crates++; sfx.smash(); }
    if (o.prop?.visible) {
      const pr = o.prop;
      this.tweens.add({ targets: pr, x: pr.x + 60, y: pr.y - 90, angle: 200, alpha: 0, duration: 420, onComplete: () => pr.setVisible(false) });
    }
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
    const big = HEAVY.has(o.kind) || o.kind === 'wall';
    this.hitFx.explode(big ? 26 : 14, o.img.x, o.img.y - 24);
    this.cameras.main.shake(70, big ? 0.01 : 0.004);
    this.hitStop(big ? 90 : 45);
    this.tweens.add({ targets: o.img, alpha: 0, y: o.img.y - 50, angle: 80, duration: 260 });
  }

  private addMeter(v: number): void {
    if (this.powerActive()) return;
    const was = this.meter;
    this.meter = Math.min(1, this.meter + v * (this.lo.fillMul ?? 1)); // coin shop: Quick POWER
    if (was < 1 && this.meter >= 1) {
      sfx.meterFull();
      this.bump(this.meterLabel, 1.6);
      this.popup(this.hero.x, this.hero.y - 120, 'POWER READY!', hex(ELEMENT_COLOR[this.powerEl]), 22);
    }
  }

  /** 0 → 1 through the run: patterns placed in a stage, time in a random run. */
  private progress(): number {
    if (this.stage) return this.finishing ? 1 : Math.min(1, this.seqIdx / Math.max(1, this.stage.seq.length));
    return Math.min(1, this.elapsed / RUN.durationSec);
  }

  /** Endless and Daily: past the usual run length the speed keeps creeping up, by up to 25%. */
  private overtime(): number {
    if (this.stage) return 1;
    return 1 + Math.min(0.25, Math.max(0, this.elapsed - RUN.durationSec) / 400);
  }

  private endRun(finished: boolean): void {
    if (this.ended) return;
    this.ended = true;
    if (finished) sfx.finish();
    const result: RunResult = {
      score: this.score() + (finished ? SCORE.finishBonus : 0),
      coins: this.coinCount, kills: this.kills + this.crates, distance: this.distance,
      finished, timeSec: this.elapsed, loadout: this.lo,
      ...(this.stage ? {} : { mode: this.mode }),
      ...(this.stage ? {
        stageId: this.stage.id,
        coinsTotal: this.coinsSpawned,
        hits: this.hitsTaken,
        secrets: this.secretsFound, secretsTotal: this.secretsSpawned,
        stars: [finished, finished && this.coinCount >= this.coinsSpawned, finished && this.hitsTaken === 0],
      } : {}),
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
      const p = this.progress();
      const s0 = this.stage?.speedStart ?? RUN.speedStart, s1 = this.stage?.speedEnd ?? RUN.speedEnd;
      this.speed = (s0 + (s1 - s0) * p) * this.overtime() * (this.lo.trinket.speedMul ?? 1)
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
    if (this.boss) {
      // Nothing else spawns during the boss fight.
    } else if (!this.finishing && !this.dead && this.stage) {
      if ((this.nextSpawn -= dx) <= 0) {
        if (this.seqIdx >= this.stage.seq.length) {
          this.finishing = true;
          this.flag = this.place('flag', GAME_W + 260);
          this.flag.alive = false;
        } else {
          const { pattern, gap } = parseEntry(this.stage.seq[this.seqIdx++], this.stage.gap);
          const w = this.spawn(pattern);
          this.nextSpawn = this.speed * gap + w;
        }
      }
    } else if (!this.finishing && !this.dead) {
      // Endless / Daily: patterns forever, until the last heart goes.
      if ((this.nextSpawn -= dx) <= 0) {
        const w = this.spawnPattern();
        const gapSec = this.rng.realInRange(0.95, 1.6) * (this.elapsed < 12 ? 1.3 : 1);
        this.nextSpawn = this.speed * gapSec + w;
      }
    }
    if (this.flag && !this.dead && this.flag.img.x <= this.hero.x) this.endRun(true);

    // Shield recharge
    const maxShield = this.lo.trinket.shield ?? 0;
    if (maxShield && this.shield < maxShield && this.shieldRechargeAt && now >= this.shieldRechargeAt) {
      this.shield++; this.shieldBubble.setCharges(this.shield);
      this.shieldRechargeAt = this.shield < maxShield ? now + (this.lo.trinket.shieldRechargeMs ?? 15000) : 0;
      this.shieldBubble.inflate();
      this.popup(this.hero.x, this.hero.y - 110, 'SHIELD UP!', '#9ff3ff', 18);
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
    if (!this.powerActive('Ice')) for (const o of this.obs) if (o.frozen) { o.frozen = false; this.baseTint(o); o.img.anims.resume(); }

    this.updateHero(dt, now);
    this.moveWorld(dx, dt, now);
    this.moveShots(dt);
    this.updateDark(dt, now);
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
      // Wind (Storm Coast): updrafts make you float, downdrafts pull you down.
      const wind = this.zoneAt(h.x, 'up') ? (this.vy < 0 ? 0.55 : 0.4) : this.zoneAt(h.x, 'down') ? 1.5 : 1;
      this.vy += RUN.gravity * wind * dt;
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
    this.shieldBubble.update(h.x, h.y - (sliding ? 24 : 44), now);
  }

  /** Feet touched something solid after falling at `vy`. */
  private land(vy: number, now: number): void {
    this.vy = 0; this.onGround = true; this.lastGroundAt = now;
    this.airJumps = this.lo.trinket.airJumps ?? 0;
    if (this.dead) return;
    if (vy > 600) { this.dustFx.explode(6, this.hero.x, this.hero.y); this.sqX = 1.25; this.sqY = 0.78; }
    if (this.lo.skin.stomp && vy > 850) this.stomp();
    if (this.slideQueued) { this.slideQueued = false; this.slideUntil = now + this.slideMs(); }
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
      if (o.kind === 'boss') { if (o.alive) this.updateBoss(o, dt, now); }
      else {
        // Movement: world scroll + own motion + knock-back
        const own = o.frozen ? 0 : o.vx;
        o.img.x -= dx - own * dt;
        if (o.kick > 0) { const k = Math.min(o.kick, 1400 * dt); o.img.x += k; o.kick -= k; }
      }
      if (o.kind === 'fly' && !o.frozen && o.alive) o.img.y = o.baseY + Math.sin(now / 180 + i) * 8;
      if (o.kind === 'mite' && !o.frozen && o.alive) o.img.y = o.baseY - Math.abs(Math.sin(now / 130 + i * 0.9)) * 14;
      if (o.kind === 'rock' || o.kind === 'icicle') this.updateRock(o, dt, h);
      this.updateWorldThing(o, now);
      if (o.kind === 'archer' && o.alive && !o.frozen) this.updateArcher(o, now);
      if (o.kind === 'arrow' && !o.frozen && o.alive) {
        o.img.y += o.vy * dt;
        if (o.img.y > GROUND_Y - 4) { o.alive = false; o.vx = 0; o.vy = 0; this.tweens.add({ targets: o.img, alpha: 0, duration: 300 }); }
      }
      if (o.kind === 'wave' && o.alive && !o.frozen && ((now / 40) | 0) % 2) this.dustFx.explode(1, o.img.x, GROUND_Y - 4);
      if (o.prop?.visible && o.alive) o.prop.setPosition(o.img.x - 24, o.img.y - 44).setAngle(Math.sin(now / 150) * 4);
      if (o.kind === 'rival' && o.alive && !o.frozen && !o.armed && o.img.x - h.x < 230) {
        o.armed = true;
        o.img.play({ key: `hero.${o.skin}.attack`, frameRate: 16 }).chain(`hero.${o.skin}.run`);
        sfx.whistle();
      }
      const right = o.kind === 'pit' || o.kind === 'zone' ? o.img.x + o.w : o.img.x + 120;
      if (right < -60 || (o.kind === 'arrow' && o.img.y > GAME_H + 40)) { this.free(o); continue; }
      if (!o.alive || this.dead) continue;
      if (o.kind === 'phantom' && o.armed) continue; // faded: nothing touches it, it touches nothing

      const ol = o.img.x + o.hx, ot = o.img.y + o.hy, or = ol + o.hw, ob = ot + o.hh;
      // Melee swing: in front of the hero, body height (+ above for falling rocks).
      if (attacking && DAMAGEABLE.has(o.kind) && o.swing !== this.swingId && ol < h.x + range && or > h.x - 10
        && ot < hb && ob > ht - (o.kind === 'rock' || o.kind === 'icicle' ? 120 : 10)) {
        o.swing = this.swingId;
        if (this.damage(o, this.lo.weapon.damage + this.dmgBonus)) continue;
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
      if (o.frozen && o.kind === 'boss') continue; // a frozen boss is just in the way for a moment
      if (o.frozen && (DAMAGEABLE.has(o.kind) || o.kind === 'wave' || o.kind === 'zap')) { this.kill(o); continue; }
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
      if ((STOMPABLE.has(o.kind) || HEAVY.has(o.kind)) && this.vy > 0 && hb - this.vy * dt <= ot + 16) {
        // Small things squash; armour (rival, guard, golem) and the boss only take the Robot's heavy stomp.
        if (STOMPABLE.has(o.kind)) this.kill(o);
        else if (this.lo.skin.stomp) this.damage(o, 2, ARMOURED.has(o.kind));
        else if (o.kind === 'boss' || o.kind === 'phantom') this.damage(o, 1);
        this.vy = -RUN.airJumpVelocity * 0.85; this.onGround = false; this.sqX = 0.8; this.sqY = 1.2;
        this.airJumps = this.lo.trinket.airJumps ?? 0;
        continue;
      }
      this.hurt();
      if (SPENT_ON_HIT.has(o.kind)) { o.alive = false; this.tweens.add({ targets: o.img, alpha: 0.3, duration: 200 }); o.prop?.setAlpha(0.3); }
      if (o.kind === 'arrow' || o.kind === 'wave' || o.kind === 'zap') { o.alive = false; o.img.setAlpha(0.3); }
    }
    // Walked off the end of a crate or ledge → start falling.
    if (this.onGround && h.y < GROUND_Y && !this.onPlatform()) this.onGround = false;

    const magnet = this.lo.trinket.magnet ?? 0;
    const pullAll = now < this.coinPullUntil;
    const hcy = h.y - HERO_COIN_Y;
    for (let i = 0; i < this.coins.length; i++) {
      const c = this.coins[i];
      if (!c.img.active) continue;
      const img = c.img;
      img.x -= dx;
      if (img.x < -40) { img.setActive(false).setVisible(false); c.alive = false; continue; }
      if (!c.alive || this.dead) continue;
      const ddx = h.x - img.x, ddy = hcy - img.y;
      const d2 = ddx * ddx + ddy * ddy;
      if ((magnet && d2 < magnet * magnet) || (pullAll && !c.secret && img.x < GAME_W)) c.pulled = true;
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
    // Drop early enough that it lands ROCK_LEAD_S before the hero gets there: you see it land, then jump it.
    const icicle = o.kind === 'icicle';
    const fallT = Math.sqrt((2 * (GROUND_Y - (icicle ? o.baseY : -60))) / RUN.gravity);
    if (!o.armed && o.img.x - h.x < this.speed * (fallT + ROCK_LEAD_S) + 40) { o.armed = true; sfx.whistle(); }
    if (!o.armed) { if (icicle && o.img.x - h.x < this.speed * (fallT + ROCK_LEAD_S) + 260) o.img.angle = Math.sin(this.now / 40) * 4; return; }
    o.vy += RUN.gravity * dt;
    o.img.y += o.vy * dt;
    if (icicle) o.img.angle = 0; else o.img.angle += 240 * dt;
    if (o.img.y >= GROUND_Y) {
      o.img.y = GROUND_Y; o.falling = false; o.vy = 0;
      o.shadow?.setVisible(false);
      if (o.alive) { this.hitFx.explode(10, o.img.x, GROUND_Y - 6); this.cameras.main.shake(80, 0.005); sfx.crash(); }
    }
  }

  /** Archers wait until you are in range, flash, then shoot at where you are (up to two shots). */
  private updateArcher(o: Ob, now: number): void {
    const d = o.img.x - this.hero.x;
    if (!o.armed) {
      if (d < 640 && o.img.x < GAME_W - 30) { o.armed = true; o.t = now + 380; this.telegraph(o); }
      return;
    }
    if (o.n >= 2 || now < o.t || d < 150) return;
    o.n++; o.t = now + 1150;
    o.img.play({ key: `hero.${o.skin}.attack`, frameRate: 24 });
    this.shoot(o.img.x - 20, o.img.y - 50, this.hero.x, GROUND_Y - 60, 520, 'arrow');
    if (o.n < 2) this.time.delayedCall(Math.max(0, o.t - now - 380), () => { if (o.alive && o.img.active) this.telegraph(o); });
  }

  /** A quick white flash and "!" so a shot never comes without warning. */
  private telegraph(o: Ob): void {
    o.img.setTintFill(0xffffff);
    this.time.delayedCall(90, () => this.baseTint(o));
    this.popup(o.img.x, o.img.y + o.hy - 16, '!', '#ff6b81', 26);
    sfx.whistle();
  }

  /**
   * An enemy shot from (x, y) that reaches (tx, ty) on screen at `screenSpeed` px/s, in a straight line.
   * Things move left with the world, so the shot's own speed adds the run speed back.
   */
  private shoot(x: number, y: number, tx: number, ty: number, screenSpeed: number, look: 'arrow' | 'fireball'): void {
    const o = this.getOb('arrow');
    o.img.setPosition(x, y);
    const dx = tx - x, dy = ty - y, d = Math.hypot(dx, dy) || 1, T = d / screenSpeed;
    o.vx = dx / T + this.speed; o.vy = dy / T;
    if (look === 'fireball') {
      o.img.setTexture('obj.rock').setFlipX(false).setScale(scaleOf('obj.rock') * 0.8).setAngle(0);
      o.tint = this.bossDef.shotTint; o.hx = -16; o.hy = -14; o.hw = 32; o.hh = 28;
      this.tweens.add({ targets: o.img, angle: -720, duration: 1600 });
    } else {
      o.img.setAngle(Phaser.Math.RadToDeg(Math.atan2(dy, dx)) - 180);
    }
    this.baseTint(o);
    sfx.throw();
  }

  // ───────────────────────────── Boss ─────────────────────────────
  // The Ember Rival runs ahead of you (right of the screen) and attacks in a pattern per phase: thrown fireballs
  // (low: jump, high: slide), ground slams (a shock wave: jump) and summoned slimes. After each pattern it stops,
  // OPEN, and comes close: hit it. 12 HP, 3 phases of 4; one OPEN window can take at most what is left of the phase,
  // so every weapon sees all three phases (Hammer: 1 hit per phase, Sword 2, Kunai 4).

  private startBoss(): void {
    const o = this.place('boss', GAME_W + 140);
    o.hp = HP.boss ?? 12;
    this.boss = o; this.bossPhase = 0; this.bossState = 'enter'; this.bossQueue = [...this.bossDef.attacks[0]];
    this.bossNextAt = this.now + 1800; this.bossInvulnUntil = 0;
    const name = this.stage?.name.toUpperCase() ?? 'THE RIVAL';
    const t = text(this, GAME_W / 2, 150, `⚔ ${name} ⚔`, 40, hex(this.bossDef.tint), '900').setOrigin(0.5).setStroke('#2b2440', 8).setDepth(22);
    this.bump(t, 1.6);
    this.tweens.add({ targets: t, alpha: 0, delay: 1600, duration: 400, onComplete: () => t.destroy() });
    this.cameras.main.shake(260, 0.008);
    sfx.crash();
    // Health bar under the progress bar.
    const bg = this.add.rectangle(GAME_W / 2 - 150, 44, 300, 16, 0x2b2440, 0.7).setOrigin(0, 0.5).setStrokeStyle(2, 0xffffff, 0.7);
    this.bossFill = this.add.rectangle(GAME_W / 2 - 148, 44, 296, 12, this.bossDef.tint).setOrigin(0, 0.5);
    const ticks = this.add.graphics().lineStyle(2, 0x2b2440, 1);
    for (let i = 1; i < 3; i++) ticks.lineBetween(GAME_W / 2 - 148 + (296 * i) / 3, 38, GAME_W / 2 - 148 + (296 * i) / 3, 50);
    const lbl = text(this, GAME_W / 2, 62, name, 12, '#ffffff', '800').setOrigin(0.5, 0).setStroke('#2b2440', 3);
    this.bossBar = this.add.container(0, 0, [bg, this.bossFill, ticks, lbl]).setDepth(20);
  }

  private updateBoss(o: Ob, dt: number, now: number): void {
    if (o.frozen) { this.bossNextAt += dt * 1000; return; } // Deep freeze pauses the fight too
    const h = this.hero;
    // Steer on screen (it keeps pace with you, it does not scroll away).
    const targetX = this.bossState === 'open' ? h.x + 120 : BOSS_HOME_X;
    const step = (this.bossState === 'open' ? 700 : 480) * dt;
    o.img.x += Phaser.Math.Clamp(targetX - o.img.x, -step, step);
    if (now < this.bossNextAt) return;

    switch (this.bossState) {
      case 'enter': case 'retreat':
        this.bossState = 'attack'; this.bossNextAt = now + 500;
        break;
      case 'attack': {
        const a = this.bossQueue.shift();
        if (a) { this.bossAttack(o, a); this.bossNextAt = now + this.bossDef.gapMs[this.bossPhase]; break; }
        // Pattern done: tired, OPEN.
        this.bossState = 'open'; this.bossNextAt = now + this.bossDef.openMs[this.bossPhase];
        o.tint = BOSS_OPEN_TINT; this.baseTint(o); o.img.anims.pause();
        this.popup(o.img.x - 100, o.img.y - 260, 'OPEN! HIT IT!', '#80ffdb', 26);
        sfx.meterFull();
        break;
      }
      case 'open': this.bossRetreat(o); break;
    }
  }

  private bossRetreat(o: Ob): void {
    this.bossState = 'retreat'; this.bossNextAt = this.now + 900;
    this.bossQueue = [...this.bossDef.attacks[this.bossPhase]];
    o.tint = this.bossDef.tint; this.baseTint(o); o.img.anims.resume();
  }

  private bossAttack(o: Ob, a: string): void {
    const x = o.img.x - 50;
    o.img.play({ key: `hero.${o.skin}.attack`, frameRate: 20 }).chain(`hero.${o.skin}.run`);
    if (a === 'throwLow') this.shoot(x, GROUND_Y - 26, -100, GROUND_Y - 26, 470, 'fireball');      // jump it
    else if (a === 'throwHigh') this.shoot(x, GROUND_Y - 76, -100, GROUND_Y - 76, 470, 'fireball'); // slide under it
    else if (a === 'slam') {
      // Up, down, and a shock wave runs along the ground: jump it.
      this.tweens.add({
        targets: o.img, y: GROUND_Y - 110, duration: 260, yoyo: true, ease: 'Quad.Out',
        onComplete: () => {
          o.img.y = GROUND_Y;
          if (!o.alive) return;
          this.cameras.main.shake(180, 0.012); sfx.stomp();
          this.hitFx.explode(16, o.img.x, GROUND_Y - 6);
          const w = this.place('wave', o.img.x - 50);
          w.img.setScale(5.5 * scaleOf('fx.dot'), 3.6 * scaleOf('fx.dot')).setOrigin(0.5, 1).setBlendMode(Phaser.BlendModes.ADD);
          w.vx = this.speed - 540;
        },
      });
    } else if (a === 'summon') {
      if (this.bossPhase >= 2) for (let i = 0; i < 3; i++) { const m = this.place('mite', x - i * 44); m.baseY = GROUND_Y; if (this.world.num === 2) { m.tint = ICE_THING; this.baseTint(m); } }
      else { this.place('slime', x); this.place('slime', x - 70); }
      this.popup(o.img.x, o.img.y - 250, this.bossDef.call, hex(this.bossDef.tint), 18);
    } else if (a === 'icicles') {
      // Icicles drop just ahead of you, one after another: jump them as they land.
      for (let i = 0; i < 2 + this.bossPhase; i++) this.placeIcicle(GAME_W + 60 + i * 190);
    } else if (a === 'zap') {
      // Lightning called down ahead of you: it is still crackling when you arrive, so jump it.
      this.placeZap(this.hero.x + this.speed * 1.15, 0.55);
    } else if (a === 'swoop') {
      this.placeSwooper(GAME_W + 40);
      this.popup(o.img.x, o.img.y - 250, this.bossDef.call, hex(this.bossDef.tint), 18);
    } else if (a === 'phantom') {
      this.place('phantom', GAME_W + 60);
      this.popup(o.img.x, o.img.y - 250, this.bossDef.call, hex(this.bossDef.tint), 18);
    } else if (a === 'dark') {
      // Lights out for a few seconds.
      this.setDark(true); this.darkUntil = this.now + 4200;
      this.popup(o.img.x, o.img.y - 250, 'DARKNESS!', hex(this.bossDef.tint), 22);
    }
  }

  /** The boss only takes damage while OPEN (powers always land a little). Returns true when it is beaten. */
  private damageBoss(o: Ob, dmg: number, byPower: boolean): boolean {
    if (this.now < this.bossInvulnUntil) return false;
    if (!byPower && this.bossState !== 'open') {
      this.popup(o.img.x, o.img.y - 200, 'BLOCKED', '#c0c8ff', 18);
      sfx.clang(); this.hitStop(30);
      return false;
    }
    const floor = Math.max(0, (HP.boss ?? 12) - BOSS_PHASE_HP * (this.bossPhase + 1));
    const hit = Math.min(byPower ? Math.min(dmg, 2) : dmg, o.hp - floor);
    o.hp -= hit;
    if (byPower) this.bossInvulnUntil = this.now + 600;
    this.popup(o.img.x - 20, o.img.y - 200, `-${hit}`, '#ffffff', 26);
    o.img.setTintFill(0xffffff);
    this.time.delayedCall(80, () => this.baseTint(o));
    this.cameras.main.shake(90, 0.007);
    sfx.clang(); this.hitStop(70);
    this.bonus += 40 * hit;
    if (o.hp > floor) return false;
    if (o.hp <= 0) { this.bossDefeated(o); return true; }
    // Next phase: angrier and faster.
    this.bossPhase++;
    this.bossInvulnUntil = this.now + 1200;
    this.bossRetreat(o);
    this.slowMo(0.4, 500);
    this.comboText.setText(`PHASE ${this.bossPhase + 1}!`).setColor(hex(this.bossDef.tint)).setAlpha(1);
    this.bump(this.comboText, 1.6);
    this.tweens.add({ targets: this.comboText, alpha: 0, delay: 900, duration: 300 });
    sfx.crash();
    return false;
  }

  private bossDefeated(o: Ob): void {
    this.kill(o);
    this.boss = null;
    this.time.delayedCall(400, () => this.free(o)); // it does not scroll away on its own
    this.slowMo(0.3, 900);
    this.cameras.main.flash(260, 255, 200, 150);
    const t = text(this, GAME_W / 2, 170, this.bossDef.beaten, 44, '#80ffdb', '900').setOrigin(0.5).setStroke('#2b2440', 8).setDepth(22);
    this.bump(t, 1.8);
    this.tweens.add({ targets: t, alpha: 0, delay: 1800, duration: 500, onComplete: () => t.destroy() });
    if (this.bossBar) this.tweens.add({ targets: this.bossBar, alpha: 0, duration: 600 });
    // Its fireballs and helpers go with it.
    for (const x of this.obs) {
      if (!x.img.active || !x.alive || !(x.kind === 'arrow' || x.kind === 'wave' || x.kind === 'slime' || x.kind === 'mite'
        || x.kind === 'icicle' || x.kind === 'zap' || x.kind === 'swooper' || x.kind === 'phantom')) continue;
      x.alive = false; this.hitFx.explode(6, x.img.x, x.img.y - 10);
      this.tweens.add({ targets: x.img, alpha: 0, duration: 250 });
    }
    sfx.finish();
    this.setDark(false); this.darkUntil = 0;
    this.nextSpawn = this.speed * 1.6;
  }

  private moveShots(dt: number): void {
    for (const s of this.shots) {
      if (!s.alive) continue;
      const step = 1150 * dt;
      s.img.x += step * s.vx; s.img.y += step * s.vy; s.dist += step;
      if (s.dist > this.lo.weapon.range || s.img.x > GAME_W + 40) { s.alive = false; s.img.setVisible(false); continue; }
      for (const o of this.obs) {
        if (!o.img.active || !o.alive || !DAMAGEABLE.has(o.kind) || (o.kind === 'phantom' && o.armed)) continue;
        const ol = o.img.x + o.hx, ot = o.img.y + o.hy;
        if (s.img.x > ol && s.img.x < ol + o.hw + 10 && s.img.y > ot - 10 && s.img.y < ot + o.hh + 10) {
          this.damage(o, this.lo.weapon.damage + this.dmgBonus, false, 45); // small knock-back: the kunai trades safety for damage
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
    if (c.secret) {
      this.secretsFound++; this.bonus += SECRET_SCORE; this.addMeter(POWER.perCoin * 2);
      this.coinFx.explode(12, c.img.x, c.img.y);
      this.popup(c.img.x, c.img.y - 20, `◆ SECRET +${SECRET_SCORE}`, hex(SECRET_TINT), 20);
      sfx.combo(6 + this.secretsFound % 4);
      return;
    }
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
    // Fetch coins the hero has run past and missed, nearest first (short cooldown, so it can catch a few).
    if (now >= this.petReadyAt && !this.dead) {
      let best: Coin | null = null, bd = 1e9;
      for (const c of this.coins) {
        if (!c.alive || c.pulled || c.secret) continue;
        const x = c.img.x;
        if (x > h.x - 24 || x < 8) continue;
        const d = Math.abs(x - this.petX) + Math.abs(c.img.y - this.petY);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) {
        tx = best.img.x; ty = best.img.y;
        const ddx = tx - this.petX, ddy = ty - this.petY;
        if (ddx * ddx + ddy * ddy < pet.radius * pet.radius * 0.25) { this.collect(best); this.petReadyAt = now + 220; }
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
