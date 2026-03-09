import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AsyncJobsController } from './async-jobs.controller';
import { AsyncJobsService } from './async-jobs.service';

@Global()
@Module({
  imports: [AuditModule],
  controllers: [AsyncJobsController],
  providers: [AsyncJobsService],
  exports: [AsyncJobsService],
})
export class AsyncJobsModule {}
