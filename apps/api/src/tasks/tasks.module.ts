import { Module } from '@nestjs/common';
import { RealtimeModule } from '../realtime/realtime.module';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
  imports: [RealtimeModule],
  controllers: [TasksController],
  providers: [TasksService],
})
export class TasksModule {}
