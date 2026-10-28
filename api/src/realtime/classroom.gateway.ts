import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { WsResponse } from '@nestjs/websockets';

@WebSocketGateway({ namespace: '/classroom', transports: ['websocket'] })
export class ClassroomGateway {
  // Connection probe only. Room membership and lesson events require authentication later.
  @SubscribeMessage('system:ping')
  ping(): WsResponse<{ status: string }> {
    return { event: 'system:pong', data: { status: 'ok' } };
  }
}
