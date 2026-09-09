import { build } from '../../web/node_modules/vite/dist/node/index.js';
import vue from '../../web/node_modules/@vitejs/plugin-vue/dist/index.mjs';
import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { selectBank } from './select-bank.mjs';
import { adaptSource } from './adapt-source.mjs';
import { cssBaseline } from './css-baseline.mjs';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const webRoot = path.resolve(root, '../web');
const requireWeb = createRequire(path.join(webRoot, 'package.json'));
const normalize = filename => filename.replaceAll('\\', '/');
const original = JSON.parse(await readFile(path.join(webRoot, 'src/data/analysis-question-bank.json'), 'utf8'));
const metadata = JSON.parse(await readFile(path.join(webRoot, 'src/data/analysis-question-bank-meta.json'), 'utf8'));
const bank = selectBank(original, metadata.categories);
const categories = metadata.categories.filter(category => bank.some(question => question.categories.includes(category)));
const mappings = {
  'views/SettingsView.vue': 'SettingsView.vue',
  'components/DataRecoveryPanel.vue': 'DataRecoveryPanel.vue',
  'api/sync.ts': 'persistence.ts',
  'api/text-recognition.ts': 'platform.ts',
  'lib/motion.ts': 'platform.ts',
  'lib/petDebug.ts': 'platform.ts',
};
const sourceAdapter = {
  name: 'geji-isolated-platform', enforce: 'pre',
  resolveId(source, importer) {
    if (!importer || !source.startsWith('.')) return;
    const candidate = normalize(path.resolve(path.dirname(importer.split('?')[0]), source));
    for (const [from, to] of Object.entries(mappings)) {
      const target = normalize(path.join(webRoot, 'src', from));
      if (candidate === target || candidate + '.ts' === target) return path.join(root, 'src', to);
    }
  },
  async load(id) {
    const filename = normalize(id.split('?')[0]);
    if (filename.endsWith('/data/analysis-question-bank.json')) return JSON.stringify(bank);
    if (filename.endsWith('/data/analysis-question-bank-meta.json')) return JSON.stringify({ count: bank.length, categories });
    if (filename.includes('/web/src/assets/') && /\.(svg|png)$/.test(filename)) {
      const name = 'assets/pets/' + path.basename(filename);
      this.emitFile({ type: 'asset', fileName: name, source: await readFile(filename) });
      return `export default ${JSON.stringify('./' + name)}`;
    }
  },
  transform(source, id) {
    const filename = normalize(id);
    if (filename.includes('/web/src/') && !filename.includes('?') && /\.(ts|vue)$/.test(filename)) return adaptSource(source.replaceAll('\r\n', '\n'), filename);
  },
};
await build({
  configFile: false, root, base: './', publicDir: false,
  plugins: [sourceAdapter, vue()],
  define: { __MINITOOL_TEST__: process.argv.includes('--test-mode') ? 'true' : 'false', 'process.env.NODE_ENV': '"production"' },
  resolve: { alias: [
    { find: '@minitool', replacement: path.join(root, 'src') },
    { find: /^vue$/, replacement: path.join(webRoot, 'node_modules/vue/dist/vue.runtime.esm-bundler.js') },
    { find: /^pinia$/, replacement: path.join(webRoot, 'node_modules/pinia/dist/pinia.mjs') },
    { find: /^vue-router$/, replacement: path.join(webRoot, 'node_modules/vue-router/dist/vue-router.mjs') },
    { find: /^qrcode$/, replacement: path.join(webRoot, 'node_modules/qrcode/lib/browser.js') },
    { find: /^canvas-confetti$/, replacement: path.join(root, 'src/confetti.ts') },
  ] },
  build: { outDir: path.join(root, 'dist'), emptyOutDir: true, target: ['es2017', 'chrome61'], cssTarget: 'chrome61', cssCodeSplit: false, sourcemap: false,
    lib: { entry: path.join(root, 'src/main.ts'), name: 'GejiMinitool', formats: ['iife'], fileName: () => 'assets/app.js', cssFileName: 'style' },
    rollupOptions: { output: { inlineDynamicImports: true, assetFileNames: 'assets/[name][extname]' } },
  },
});
await mkdir(path.join(root, 'dist/assets'), { recursive: true });
await copyFile(path.join(root, 'src/index.html'), path.join(root, 'dist/index.html'));
await copyFile(path.join(root, 'src/compat.js'), path.join(root, 'dist/assets/compat.js'));
const cssFile = path.join(root, 'dist/assets/style.css');
await writeFile(cssFile, cssBaseline(await readFile(cssFile, 'utf8')));
await mkdir(path.join(root, 'reports'), { recursive: true });
await writeFile(path.join(root, 'reports/build.json'), JSON.stringify({ questionCount: bank.length, questionBytes: Buffer.byteLength(JSON.stringify(bank)), categories, testMode: process.argv.includes('--test-mode'), platformAcceptance: 'pending' }, null, 2));
