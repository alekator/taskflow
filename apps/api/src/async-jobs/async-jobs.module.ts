import { Global, Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AsyncJobsController } from './async-jobs.controller';
import { AsyncJobsService } from './async-jobs.service';
import { InviteEmailDeliveryService } from './invite-email-delivery.service';

@Global()
@Module({
  imports: [AuditModule],
  controllers: [AsyncJobsController],
  providers: [AsyncJobsService, InviteEmailDeliveryService],
  exports: [AsyncJobsService],
})
export class AsyncJobsModule {}
