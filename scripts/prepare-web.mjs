import { cp } from 'node:fs/promises';

const app = new URL('../web/', import.meta.url);
const output = new URL('.next/standalone/web/', app);

// Next's standalone server needs the same public/static assets locally and in Docker.
await cp(new URL('public/', app), new URL('public/', output), { recursive: true });
await cp(new URL('.next/static/', app), new URL('.next/static/', output), { recursive: true });
