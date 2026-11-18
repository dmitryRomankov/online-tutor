import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import type { Server, ServerOptions } from 'socket.io';

// Under the REST prefix so a single `/api` route reaches both HTTP and Socket.IO traffic.
export const SOCKET_IO_PATH = '/api/socket.io';

export class SocketAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly clientOrigin: string
  ) {
    super(app);
  }

  override createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const socketOptions: Partial<ServerOptions> = {
      ...options,
      path: SOCKET_IO_PATH,
      cors: { origin: this.clientOrigin, credentials: true },
      allowRequest: (request, callback) => {
        const origin = request.headers.origin;
        callback(null, origin === undefined || origin === this.clientOrigin);
      },
    };
    // Nest's adapter declares full options; Socket.IO itself fills defaults for partial options.
    return super.createIOServer(port, socketOptions as ServerOptions);
  }
}
