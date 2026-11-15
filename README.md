# Altered Run

A one-thumb endless runner for the phone browser (Phaser 3 + TypeScript + Vite), and TheoSwap
showcase game #1. Players' NFTs become **AWIs (Altered World Items)**: a hero skin, a weapon,
a pet and a trinket, each with real effects in the run. See [PLAN.md](PLAN.md) for the design and milestones.

```bash
npm install      # also installs the pre-commit hook
npm run dev      # http://localhost:5180  (add ?debug for the FPS meter)
npm run build    # static site in dist/
```

Controls: tap = jump (tap again in the air with the Feather trinket), swipe right = attack, swipe down = slide / fast-fall.
Keyboard: Space/Up jump, Right/X attack, Down slide.

## Art: read [ASSETS.md](ASSETS.md)

A fresh clone runs on the committed art: **CC0 art from GameArt2D** (`public/assets/cc0/`) plus
**original placeholder art** for everything else. Art from packs that **may not be redistributed**
(craftpix.net freebies) is never in this repo: [ASSETS.md](ASSETS.md) lists every file to supply
(size, frames, what it's for, which pack) and how to drop it into `public/assets/licensed/` (gitignored).

| Command | What it does |
|---|---|
| `npm run assets:status` | Which assets are licensed ● / cc0 ◆ / placeholder ○ / missing ✖ |
| `npm run assets:pack -- <key> <files…>` | Turn downloaded frames into the exact sheet the game expects |
| `npm run check-assets` | Fails if licensed art, non-CC0 art in `cc0/`, unlisted media or secrets are in git (runs on pre-commit and CI) |
| `npm run assets:docs` | Regenerate ASSETS.md from `assets.manifest.json` |
| `npm run assets:placeholders` | Regenerate the placeholder art from the manifest |

`assets.manifest.json` is the single source of truth for every image and sound. Game code only uses manifest keys.

## TheoSwap and secrets

Players tap **Connect TheoSwap**, enter the player code from their TheoSwap profile, and their NFTs
become AWIs (reveal cards, then a loadout screen). Without a code, three demo players work offline.

Copy `.env.example` to `.env` (gitignored) and set `VITE_THEOSWAP_API_KEY`. The game calls TheoSwap
directly, so Vite puts this key **in the browser build**: use the game's **test** key until a proxy is
in place. `check-assets` allows only that one `VITE_*KEY` name and still rejects other key-like
`VITE_*` names and hard-coded `apiKey` values.

## Licence

Code and placeholder art: [MIT](LICENSE). The GameArt2D art in `public/assets/cc0/` is CC0 (public domain) by its author. Other third-party art isn't included.
