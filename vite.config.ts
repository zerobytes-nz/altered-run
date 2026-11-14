import { defineConfig, type Plugin } from 'vite';
import { resolveAssets, loadManifest, PUBLIC_DIR } from './scripts/lib/assets.mjs';
import path from 'node:path';

/**
 * `virtual:asset-urls` → { [manifest key]: url }. Picks the licensed file when it exists
 * with the size the manifest expects, else the committed placeholder. Decided at dev/build
 * time, so a fresh clone makes zero requests for missing licensed files.
 */
function assetUrls(): Plugin {
  const ID = 'virtual:asset-urls', RID = '\0' + ID;
  return {
    name: 'altered-run-asset-urls',
    resolveId: (id) => (id === ID ? RID : null),
    load(id) {
      if (id !== RID) return null;
      const m = loadManifest();
      const urls: Record<string, string> = {};
      for (const r of resolveAssets(m)) {
        if (r.licensed.exists && !r.licensed.sizeOk) {
          this.warn(`${r.licensedFile} is ${r.licensed.size?.width}×${r.licensed.size?.height}, expected ${r.asset.width}×${r.asset.height}: using the placeholder`);
        }
        urls[r.asset.key] = r.url;
      }
      return `export default ${JSON.stringify(urls)};`;
    },
    configureServer(server) {
      const m = loadManifest();
      const dir = path.join(PUBLIC_DIR, m.roots.licensed);
      server.watcher.add([dir, path.join(PUBLIC_DIR, m.roots.placeholder), 'assets.manifest.json']);
      const refresh = (file: string) => {
        if (!file.startsWith(PUBLIC_DIR + path.sep + 'assets') && !file.endsWith('assets.manifest.json')) return;
        const mod = server.moduleGraph.getModuleById(RID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.on('add', refresh);
      server.watcher.on('unlink', refresh);
      server.watcher.on('change', refresh);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [assetUrls()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: { output: { manualChunks: { phaser: ['phaser'] } } },
  },
  server: { port: 5180, strictPort: true },
});
