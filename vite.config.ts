import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes dist/sw.js from src/sw/sw.template.js with the list of files to
 * precache and a version derived from their contents, so every deploy that
 * changes any file gets a new cache name and an "Update available" prompt.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'huedoku-sw',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const files: string[] = [];
      const walk = (dir: string) => {
        for (const name of readdirSync(dir)) {
          const p = join(dir, name);
          if (statSync(p).isDirectory()) walk(p);
          else files.push(relative(outDir, p).replace(/\\/g, '/'));
        }
      };
      walk(outDir);
      // iOS reads splash screens itself at install; no need to precache them.
      const precache = files.filter((f) => f !== 'sw.js' && !f.startsWith('splash/') && !f.endsWith('.map')).sort();
      const hash = createHash('sha256');
      for (const f of precache) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const template = readFileSync('src/sw/sw.template.js', 'utf8');
      const sw = template
        .replace('/*__PRECACHE__*/ []', JSON.stringify(['./', ...precache.filter((f) => f !== 'index.html')]))
        .replace('__VERSION__', version);
      writeFileSync(join(outDir, 'sw.js'), sw);
      writeFileSync(join(outDir, 'version.json'), JSON.stringify({ version, builtAt: new Date().toISOString() }));
      console.log(`[huedoku-sw] precaching ${precache.length} files, version ${version}`);
    },
  };
}

export default defineConfig({
  // Relative base works under https://<user>.github.io/huedoku/ and any other sub-path.
  base: process.env.HUEDOKU_BASE ?? './',
  plugins: [serviceWorker()],
  worker: { format: 'es' },
  build: {
    target: ['es2020', 'safari15', 'chrome100'],
    assetsInlineLimit: 0,
    sourcemap: false,
    reportCompressedSize: true,
  },
  server: { host: false },
});
