import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const webRequire = createRequire(new URL('../web/package.json', import.meta.url));
const { io } = webRequire('socket.io-client');
const processes = [];

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

function start(file, args, cwd, extraEnv = {}) {
  const child = spawn(process.execPath, [file, ...args], {
    cwd, stdio: 'inherit', env: { ...process.env, ...extraEnv },
  });
  processes.push(child);
  return child;
}

async function waitFor(url, child) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error(`Server exited before ${url} was ready.`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* Wait until the HTTP listener is ready. */ }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

async function probeSocket(origin, expectConnection) {
  const socket = io('http://127.0.0.1:3001/classroom', {
    path: '/api/socket.io', transports: ['websocket'], reconnection: false, timeout: 5000,
    extraHeaders: { Origin: origin },
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket probe timed out.')), 7000);
      socket.on('connect_error', (error) => {
        clearTimeout(timer);
        if (expectConnection) reject(error); else resolve();
      });
      socket.on('connect', () => {
        if (!expectConnection) { clearTimeout(timer); reject(new Error('Untrusted socket origin was accepted.')); return; }
        socket.once('system:pong', (data) => {
          clearTimeout(timer);
          try { assert.equal(data.status, 'ok'); resolve(); } catch (error) { reject(error); }
        });
        socket.emit('system:ping');
      });
    });
  } finally { socket.disconnect(); }
}

try {
  await Promise.all([assertPortFree(3000), assertPortFree(3001)]);
  const api = start('dist/main.js', [], path.join(root, 'api'), {
    PORT: '3001', HOST: '127.0.0.1', CLIENT_ORIGIN: 'http://localhost:3000',
  });
  const web = start('.next/standalone/web/server.js', [], path.join(root, 'web'), {
    PORT: '3000', HOSTNAME: '127.0.0.1',
  });
  await Promise.all([
    waitFor('http://127.0.0.1:3001/api/health', api),
    waitFor('http://127.0.0.1:3000', web),
  ]);

  const health = await (await fetch('http://127.0.0.1:3001/api/health')).json();
  assert.equal(health.status, 'ok');
  const spec = await (await fetch('http://127.0.0.1:3001/api/docs-json')).json();
  assert.ok(spec.paths['/api/health']);
  const page = await (await fetch('http://127.0.0.1:3000')).text();
  assert.ok(page.includes('Online lessons'));
  await probeSocket('http://localhost:3000', false);
  await probeSocket('https://untrusted.example', false);
  console.log('HTTP, OpenAPI, frontend and Socket.IO smoke checks passed.');

  if (process.argv.includes('--e2e')) {
    process.env.CYPRESS_CACHE_FOLDER ??= path.join(root, '.cache/Cypress');
    const { default: cypress } = await import('cypress');
    const result = await cypress.run({ project: path.join(root, 'web'), browser: 'electron' });
    if ('failures' in result || result.totalFailed > 0) throw new Error('Cypress checks failed.');
  }
} finally {
  await Promise.all(processes.map(child => new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(); return; }
    child.once('exit', resolve);
    child.kill('SIGTERM');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    timer.unref();
  })));
}
