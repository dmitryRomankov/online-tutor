import { io } from 'socket.io-client';

// Call from a client component when entering a classroom; connect after authentication.
export function createClassroomSocket() {
  const baseUrl = (process.env.NEXT_PUBLIC_SOCKET_URL ?? 'http://localhost:3001').replace(
    /\/$/,
    ''
  );
  return io(`${baseUrl}/classroom`, {
    autoConnect: false,
    transports: ['websocket'],
    withCredentials: true,
  });
}
