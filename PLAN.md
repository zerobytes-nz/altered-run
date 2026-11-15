# Altered Run — Plan

Showcase game #1 for TheoSwap: a one-thumb endless runner played in the phone browser.
It shows how NFTs that players already own become **AWIs (Altered World Items)** in a game.
Game #2 (later, different genre) maps the *same* NFTs to different AWIs.

Stack: **Phaser 3 + TypeScript + Vite**, static build, landscape, mobile-first.
(Phaser was chosen over Godot: the Tanks of Freedom II Godot web export was ~250 MB and ran at 12–18 FPS.)

## Game design

- The hero runs automatically and the world scrolls from right to left.
- **Tap** to jump (with a second tap in the air if the trinket gives a double jump).
- **Swipe right** to attack (breaks crates and defeats enemies). **Swipe down** to slide under high obstacles.
- A run lasts 60–90 seconds and speeds up over time. It ends at the finish line or when the hero dies.
  Hitting an obstacle costs a heart (3 hearts).
- Score = distance + coins×10 + kills×25 + finish bonus. The local top-10 high-score table is kept in `localStorage`.
- **Four AWI slots, always visible in the HUD:**
  | Slot    | Effect in game                                   | Example AWI values              |
  |---------|--------------------------------------------------|---------------------------------|
  | Hero skin | The character sprite set (idle/run/jump/slide/attack/dead) | knight, ninja, robot, … |
  | Weapon  | Attack range, damage, visual                     | sword, kunai, blaster           |
  | Pet     | Follows the hero and picks up coins within a radius | cat, dog, drone              |
  | Trinket | A stat buff                                      | speed, double jump, magnet, shield |

## Milestones

### 1. Core runner on a phone (done)
- Guest mode with default AWIs (knight / sword / cat / double jump).
- Touch controls (tap / swipe) plus a keyboard fallback (Space/Up, Right/X, Down).
- Placeholder art from the asset manifest, swappable file by file for licensed art (see *Art and open source*).
- Boot → Menu (Play, high scores) → Run → Game Over (score, best, retry).
- Performance: a small bundle, object pooling for obstacles and coins, arcade physics, no per-frame allocations, `pixelArt`/`roundPixels` off, FPS meter in debug mode (`?debug`).
- Landscape: the canvas uses Scale.FIT at 960×540. In portrait a "rotate your phone" overlay shows.

### 2. TheoSwap integration (done)
- Hidden TheoSwap game **"Altered Run" (game 7)** with the **published** config **"Altered Run AWIs" (config 15)**, set as the game's default.
  4 groups (Hero, Weapon, Pet, Trinket), 13 AWIs, each with an item image. Each NFT rolls **Rarity** (21 slots: 11 Common / 6 Rare / 3 Epic / 1 Legendary,
  about 52/29/14/5%; 21 is coprime with 4 so Rarity and Element roll independently) and **Element** (Fire / Ice / Shadow / Storm).
- Game icon, banner, genres and platforms set on TheoSwap.
- Connect screen: player code → `GET /api/public/user-items` **called directly from the game** (the developer's choice; the
  endpoint allows any origin). `VITE_THEOSWAP_API_KEY` is therefore in the bundle: **test key only** until a proxy exists.
- Deep link: `/?userCode=CODE` connects straight away and removes the code from the URL. Set the game website on TheoSwap to
  `https://<host>/?userCode=$USER_CODE` once it is hosted.
- Reveal cards ("Your NFT became a Legendary Storm Kunai"), with ×N for identical AWIs.
- Loadout screen: one AWI per slot; several in a slot are all listed; best rarity is picked by default; empty slots use the guest default.
- Rarity effects: +10/20/35% range or coin radius; Legendary hero +1 heart; Legendary feather triple jump; Epic+ shield blocks 2 hits;
  boots +5% score per tier. Element colours the attack slash and the card.
- Profile + last good response cached in `localStorage`, used when the network fails.
- Demo profiles Whale / Collector / New player: TheoSwap test codes AAAAAAAA / BBBBBBBB / CCCCCCCC (tested against the live API
  with the test key), bundled sample data without a key.

Left open (needs a decision or a TheoSwap change):
- Before using the **live** key: a small proxy (e.g. Cloudflare Worker) so the key leaves the bundle.
- NFT images on the reveal card: `user-items` deletes `itemData.image`; needs the proxy or a TheoSwap change. Cards show the AWI art for now.

### 3. Polish (in progress)
Done:
- Sound effects and music, synthesized with Web Audio (no audio files to license). Coin pickups climb in pitch; reveal
  cards play a bigger fanfare for rarer AWIs. Mute button on the menu, run and results screens (and the M key), remembered.
- Particles: element-coloured slash sparks, jump/slide/landing dust, coin and hit bursts. Screen shake and a short
  hit-stop (45 ms smash, 60 ms shield, 90 ms hurt) on impacts. Taps on on-screen buttons no longer count as jumps.
- PWA: `manifest.webmanifest` (fullscreen, landscape), icons drawn by `npm run pwa:icons`, and a build-time service worker
  that precaches the shell and all resolved art (tested offline with `npm run preview`).

Still to do:
- Deploy as a static site (e.g. `play.theoswap.io`): needs the developer's choice of host.
- Real art for the sword, hammer, drone, slime, coins, spikes, flag, trinkets and UI, plus background layers.
- Smaller hero PNGs (about 1 MB per skin now).

### 4. Optional
- Capacitor app build (Android/iOS).
- Buying paid AWIs in the game.

## Art and open source
The repo is **open source**. GameArt2D freebies are **CC0** (public domain) and are committed; craftpix.net freebies may not be redistributed. So:
- `assets.manifest.json` is the single source of truth. It records every asset's key, path, pixel size, frames, animation, use and source pack.
- `public/assets/placeholder/` is committed. It holds original art generated from the manifest, with the same sizes and frame counts.
- `public/assets/cc0/` is committed. It holds art from sources marked `"cc0": true` in the manifest (the GameArt2D packs).
- `public/assets/licensed/` is gitignored. It holds the user's copies of non-redistributable art.
- The game picks `licensed/` → `cc0/` → `placeholder/`, file by file, by exact pixel size.
- `npm run check-assets` runs in the pre-commit hook and CI. It blocks licensed files, non-CC0 files in `cc0/`, unlisted media and secrets from git.
- [ASSETS.md](ASSETS.md) is generated. It lists every file to supply and the pack to get it from.

Packs (URLs in the manifest, licences checked 2026-11-15): GameArt2D "The Knight", "Ninja Adventure", "The Robot", "Cat & Dog" and "Free Platformer Game Tileset" (all CC0). Still to choose, from craftpix.net freebies or another CC0 source: weapon icons, drone pet, slime, spikes/coins/flag and the GUI.

## Repo layout
```
assets.manifest.json   every art/sound file (single source of truth)
public/assets/placeholder/  committed original art   public/assets/cc0/  committed CC0 art   public/assets/licensed/  gitignored real art
scripts/               check-assets, assets-status, assets-docs, gen-placeholders, pack-frames
src/
  main.ts              Phaser config
  assets.ts            manifest-driven preload (licensed → cc0 → placeholder via vite plugin)
  config.ts            tunables (speeds, run length, scoring)
  loadout.ts           AWI slot model + defaults (milestone 2 fills from the API)
  scenes/              Boot, Menu, Run, GameOver
  systems/             input (tap/swipe), highscores
```
