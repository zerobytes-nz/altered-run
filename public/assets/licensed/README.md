# Licensed art goes here (not in git)

Everything in this folder except this README is **gitignored**. Put your copies of art that may
**not** be redistributed (e.g. craftpix.net freebies) here, at the paths listed in [ASSETS.md](../../../ASSETS.md).
CC0 art (the GameArt2D freebies) goes in [`../cc0/`](../cc0/README.md) instead, which is committed.

- Files here override `public/assets/cc0/` and `public/assets/placeholder/` one by one. Anything missing falls back to the placeholder.
- Use `npm run assets:pack -- <key> <frames...>` to produce files with the exact size the game expects (non-CC0 sources are written here).
- `npm run assets:status` shows which files are being used.
- **Never commit these files.** Their licences forbid redistribution. `npm run check-assets` blocks it.
