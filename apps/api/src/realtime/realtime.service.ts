import { Injectable } from '@nestjs/common';
import { RealtimeGateway } from './realtime.gateway';

@Injectable()
export class RealtimeService {
  constructor(private readonly gateway: RealtimeGateway) {}

  emitProjectEvent(projectId: string, type: string, payload: unknown) {
    this.gateway.emitToProject(projectId, 'project:event', {
      type,
      projectId,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  emitTaskEvent(projectId: string, type: string, payload: unknown) {
    this.gateway.emitToProject(projectId, 'task:event', {
      type,
      projectId,
      payload,
      timestamp: new Date().toISOString(),
    });
  }
}
