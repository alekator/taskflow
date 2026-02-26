import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { getCorsOrigin } from '../config/runtime';

type ProjectRoomPayload = {
  projectId: string;
};

@WebSocketGateway({
  namespace: 'realtime',
  cors: {
    origin: getCorsOrigin(),
    credentials: true,
  },
})
export class RealtimeGateway {
  @WebSocketServer()
  server!: Server;

  @SubscribeMessage('project:join')
  handleProjectJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ProjectRoomPayload,
  ) {
    if (!body?.projectId) {
      return { ok: false };
    }

    void client.join(this.getProjectRoom(body.projectId));
    return { ok: true };
  }

  @SubscribeMessage('project:leave')
  handleProjectLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: ProjectRoomPayload,
  ) {
    if (!body?.projectId) {
      return { ok: false };
    }

    void client.leave(this.getProjectRoom(body.projectId));
    return { ok: true };
  }

  emitToProject(projectId: string, event: string, payload: unknown) {
    this.server.to(this.getProjectRoom(projectId)).emit(event, payload);
  }

  private getProjectRoom(projectId: string) {
    return `project:${projectId}`;
  }
}
