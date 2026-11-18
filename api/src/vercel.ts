import 'reflect-metadata';
import type { Server } from 'node:http';
import { createApp } from './app.js';

const app = await createApp();
await app.init();

// Vercel owns the listener. Export the server with Socket.IO's upgrade handler attached.
export default app.getHttpServer() as Server;
