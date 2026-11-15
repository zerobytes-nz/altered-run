# CC0 art (committed)

Files here **are committed** and ship with the repo, so a fresh clone shows real art instead of placeholders.

Only art whose source pack is marked `"cc0": true` in `assets.manifest.json` may go here. Today that is
the GameArt2D freebies, which GameArt2D licenses as CC0 / public domain
(see <https://www.gameart2d.com/license.html>).

- Put files here with `npm run assets:pack -- <key> <frames...>`: it writes CC0 sources here automatically.
- Paths and pixel sizes must match the manifest (see [ASSETS.md](../../../ASSETS.md)).
- Order the game uses: `licensed/` → `cc0/` → `placeholder/`.
- `npm run check-assets` (pre-commit and CI) fails if a file here is not a manifest path, comes from a
  source that is not marked CC0, or has the wrong size.
- Art from non-CC0 packs (e.g. craftpix.net freebies) goes in `../licensed/`, which is gitignored.
