import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { TasksController, WorkspaceTasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [RealtimeModule, AuditModule],
  controllers: [TasksController, WorkspaceTasksController],
  providers: [TasksService],
})
export class TasksModule {}
