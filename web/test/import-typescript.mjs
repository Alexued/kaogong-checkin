import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

/** Bundle one browser-independent TypeScript module so Node can resolve extensionless imports. */
export async function importTypeScript(url) {
  const result = await build({
    entryPoints: [fileURLToPath(url)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    write: false,
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}
