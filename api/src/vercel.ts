import 'reflect-metadata';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';

const swaggerUiPath = fileURLToPath(new URL('./swagger-ui/', import.meta.url));
const app = await createApp(swaggerUiPath);
await app.init();

// Vercel owns the listener. Export the server with Socket.IO's upgrade handler attached.
export default app.getHttpServer() as Server;
