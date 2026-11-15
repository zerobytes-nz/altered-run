// Tunables for the runner. All distances are in game pixels (960×540 design size).
export const GAME_W = 960;
export const GAME_H = 540;
export const GROUND_Y = 462; // y of the running surface
export const HERO_X = 210;

export const RUN = {
  durationSec: 75,        // a run lasts 60–90 s; the finish line arrives at this time
  speedStart: 360,        // px/s
  speedEnd: 640,          // px/s reached at the end of the run
  gravity: 2600,          // px/s²
  jumpVelocity: 980,      // px/s
  airJumpVelocity: 860,
  fastFallVelocity: 1400, // swipe down in the air
  slideMs: 620,
  attackMs: 260,
  attackCooldownMs: 320,
  hurtInvulnMs: 1100,
  hearts: 3,
};

export const SCORE = {
  perPixel: 0.05,  // distance
  coin: 10,
  kill: 25,
  crate: 15,
  finishBonus: 500,
};

/** Coin meter and element powers (see RunScene.activatePower). Durations × the weapon AWI's rarity. */
export const POWER = {
  perCoin: 0.05,      // 20 coins fill the meter
  perKill: 0.06,
  perNearMiss: 0.03,
  fireMs: 2600,       // Blaze dash: invulnerable, 1.6× speed, smashes everything, crosses pits
  fireSpeed: 1.6,
  iceMs: 4200,        // Deep freeze: everything stops and shatters on touch; pits freeze over
  stormPullMs: 3200,  // Chain storm: instant strike on everything on screen, then pulls every coin
  shadowMs: 4200,     // Shadow walk: pass through anything, walk over pits
};

export const INPUT = {
  swipeMinPx: 34,   // in screen pixels
  swipeMaxMs: 450,
};

export const DEBUG = new URLSearchParams(location.search).has('debug');
