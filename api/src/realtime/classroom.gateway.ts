import { SubscribeMessage, WebSocketGateway } from '@nestjs/websockets';
import type { WsResponse } from '@nestjs/websockets';

@WebSocketGateway({ namespace: '/classroom', transports: ['websocket'] })
export class ClassroomGateway {
  // Session middleware protects this namespace; lesson membership belongs to lesson features.
  @SubscribeMessage('system:ping')
  ping(): WsResponse<{ status: string }> {
    return { event: 'system:pong', data: { status: 'ok' } };
  }
}
