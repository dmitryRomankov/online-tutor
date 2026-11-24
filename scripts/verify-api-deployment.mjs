import assert from 'node:assert/strict';
import { mkdtemp, cp, writeFile, symlink, rm, readdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
const service = config.services.api;
assert.ok(service.outputDirectory, 'API needs an explicit outputDirectory to prevent dist/app.js autodetection.');
const output = join(root, service.root, service.outputDirectory);
assert.deepEqual(await readdir(output), ['app.mjs', 'swagger-ui'], 'Deploy the explicit ESM bundle and Swagger UI assets.');
const directory = await mkdtemp(join(tmpdir(), 'tutor-api-deployment-'));
try {
  await cp(output, directory, { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"type":"commonjs"}');
  await symlink(join(root, 'node_modules'), join(directory, 'node_modules'), 'dir');
  const result = spawnSync(process.execPath, ['--no-experimental-detect-module', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    const { default: server } = await import('./app.mjs');
    try {
      await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
      const base = 'http://127.0.0.1:' + server.address().port;
      const health = await fetch(base + '/api/health');
      assert.equal(health.status, 200);
      assert.deepEqual(await health.json(), { status: 'ok', service: 'api' });
      assert.equal((await fetch(base + '/api/auth/me')).status, 401);
      const docs = await fetch(base + '/api/docs');
      assert.equal(docs.status, 200);
      assert.match(await docs.text(), /swagger-ui-bundle[.]js/);
      const spec = await fetch(base + '/api/docs-json');
      assert.equal(spec.status, 200);
      assert.ok((await spec.json()).paths['/api/health']);

      for (const [asset, contentType] of [
        ['swagger-ui.css', 'text/css'],
        ['swagger-ui-bundle.js', 'javascript'],
        ['swagger-ui-standalone-preset.js', 'javascript'],
        ['swagger-ui-init.js', 'javascript'],
        ['favicon-32x32.png', 'image/png'],
      ]) {
        const response = await fetch(base + '/api/docs/' + asset);
        assert.equal(response.status, 200, asset);
        assert.ok(response.headers.get('content-type')?.includes(contentType), asset);
        assert.ok((await response.arrayBuffer()).byteLength > 0, asset);
      }
    } finally {
      if (server.listening) await new Promise(resolve => server.close(resolve));
    }
  `], {
    cwd: directory,
    env: {
      ...process.env, DATABASE_URL: '', SESSION_SECRET: '',
      CLIENT_ORIGIN: 'http://localhost:3000', AUTH_SESSION_TTL_SECONDS: '28800',
    },
    encoding: 'utf8', timeout: 30000,
  });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr + result.stdout);
  console.log('API deployment output verified: ESM boots under CommonJS scope; health=200; anonymous me=401; Swagger page, JSON and assets=200.');
} finally {
  await rm(directory, { recursive: true, force: true });
}
