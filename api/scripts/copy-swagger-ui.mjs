import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const swaggerRequire = createRequire(require.resolve('@nestjs/swagger'));
const source = dirname(swaggerRequire.resolve('swagger-ui-dist/package.json'));
const output = new URL('../vercel-output/swagger-ui/', import.meta.url);
const assets = [
  'swagger-ui.css',
  'swagger-ui-bundle.js',
  'swagger-ui-standalone-preset.js',
  'favicon-16x16.png',
  'favicon-32x32.png',
  'LICENSE',
  'NOTICE',
  'swagger-ui-bundle.js.LICENSE.txt',
  'swagger-ui-standalone-preset.js.LICENSE.txt',
];

await mkdir(output, { recursive: true });
await Promise.all(assets.map((asset) => copyFile(join(source, asset), new URL(asset, output))));
