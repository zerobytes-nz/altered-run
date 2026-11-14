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

### 1. Core runner on a phone (this milestone)
- Guest mode with default AWIs (knight / sword / cat / double jump).
- Touch controls (tap / swipe) plus a keyboard fallback (Space/Up, Right/X, Down).
- Placeholder art generated at runtime (no downloads). The art goes through a `skins` registry so it can be swapped for real art later.
- Boot → Menu (Play, high scores) → Run → Game Over (score, best, retry).
- Performance: a small bundle, object pooling for obstacles and coins, arcade physics, no per-frame allocations, `pixelArt`/`roundPixels` off, FPS meter in debug mode (`?debug`).
- Landscape: the canvas uses Scale.FIT at 960×540. In portrait a "rotate your phone" overlay shows.

### 2. TheoSwap integration (check in with the user before starting)
- Create a **hidden** game and AWI configs through the theoswap MCP. Use dry run first and get approval for each write.
  The config tree has one branch per slot. Each leaf has attributes such as `slot`, `skin`/`weapon`/`pet`/`trinket`, `damage`, `rarity`, and `name`.
- User-code entry screen, then a call to `GET /api/public/user-items?apiKey=&userCode=`.
- Loadout screen: pick which NFT-derived AWI fills each slot.
- A reveal card for each NFT: "Your NFT became a **Fire Kunai Ninja**".
- Attribute → asset mapping with a safe default for unknown values (e.g. an unknown `skin` falls back to knight).
- Demo profiles (Whale / Collector / New player) through `set_test_items` and a test key, so it can be demoed without real wallets.
- Cache the last good response in `localStorage` so the game works with bad signal.
- **Open decisions for the user:**
  - **apiKey proxy** (recommended): a tiny serverless function (e.g. a Cloudflare Worker) that holds the key so it never reaches the browser.
  - **QR / deep-link sign-in** from the TheoSwap profile (`play.theoswap.io/?code=…`). This changes the TheoSwap repo and needs the user's OK.
  - **NFT images for the reveal card:** `user-items` deletes `itemData.image`. `user-nfts` does not return the NFT image either (only contract, token_id, verified, and the config's `itemData`), and its CORS only allows `https://www.theoswap.io`, so a browser game can't call it. Options: (a) the proxy fetches token metadata/image itself, (b) a small TheoSwap change adds an `nftImage` field to `user-items`. Until then the reveal card shows the AWI art.

### 3. Polish
- Sound effects and music (with a mute toggle), particles, screen shake, hit-stop.
- PWA manifest, icons, and a service worker for offline play.
- Deploy as a static site (e.g. `play.theoswap.io`).

### 4. Optional
- Capacitor app build (Android/iOS).
- Buying paid AWIs in the game.

## Art (the user downloads these; licences forbid redistributing the raw assets)
The raw packs go in `public/assets/vendor/`, which is **git-ignored**. Keep this repo private either way.
- **Heroes (skins):** gameart2d.com free sprites: "The Knight", "Ninja Adventure"/"Free Ninja", "The Robot", "Cute Girl", "Adventure Boy", "Zombie". They share idle/run/jump/slide/attack/dead animations.
- **Tiles / background:** gameart2d "Free Platformer Game Tileset" (and its Winter / Desert / Graveyard variants for biomes).
- **Enemies / pets / weapons:** craftpix.net free packs, e.g. "Free Pixel Art Enemies", "Free Pet Sprites" / "Cat & Dog" packs, "Free Weapon Icons". For coins, crates, and spikes: "Free Platformer Game Objects".
- Pack sprites into one texture atlas per skin (TexturePacker or `free-tex-packer`) to keep draw calls and load time low.

## Repo layout
```
src/
  main.ts            Phaser config
  config.ts          tunables (speeds, run length, scoring)
  loadout.ts         AWI slot model + defaults (milestone 2 fills from the API)
  scenes/            Boot, Menu, Run, GameOver
  systems/           input (tap/swipe), spawner, highscores
  art/placeholder.ts runtime-generated textures
```
