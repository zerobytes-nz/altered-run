# Licensed art goes here (not in git)

Everything in this folder except this README is **gitignored**. Put your copies of the
craftpix.net / gameart2d.com art here, at the paths listed in [ASSETS.md](../../../ASSETS.md).

- Files here override `public/assets/placeholder/` one by one. Anything missing falls back to the placeholder.
- Use `npm run assets:pack -- <key> <frames...>` to produce files with the exact size the game expects.
- `npm run assets:status` shows which files are being used.
- **Never commit these files.** Their licences forbid redistribution. `npm run check-assets` blocks it.
