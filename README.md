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

A fresh clone runs on **original placeholder art**. The real art comes from third-party packs
(craftpix.net, gameart2d.com) that **may not be redistributed**, so it is never in this repo.
[ASSETS.md](ASSETS.md) lists every file to supply (size, frames, what it's for, which pack) and
how to drop it into `public/assets/licensed/` (gitignored).

| Command | What it does |
|---|---|
| `npm run assets:status` | Which assets are licensed ● / placeholder ○ / missing ✖ |
| `npm run assets:pack -- <key> <files…>` | Turn downloaded frames into the exact sheet the game expects |
| `npm run check-assets` | Fails if licensed art, unlisted media or secrets are in git (runs on pre-commit and CI) |
| `npm run assets:docs` | Regenerate ASSETS.md from `assets.manifest.json` |
| `npm run assets:placeholders` | Regenerate the placeholder art from the manifest |

`assets.manifest.json` is the single source of truth for every image and sound. Game code only uses manifest keys.

## Secrets

Copy `.env.example` to `.env` (gitignored). The TheoSwap API key is **never** put in the game bundle:
Vite inlines every `VITE_*` variable into the browser build, so the key belongs only in the proxy
(milestone 2). `check-assets` rejects key-like `VITE_*` names and hard-coded `apiKey` values.

## Licence

Code and placeholder art: [MIT](LICENSE). Third-party art isn't covered by this licence and isn't included.
