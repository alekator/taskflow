import { Module } from '@nestjs/common';
import { RequestContextModule } from '../common/request-context.module';
import { AdminAuditController, AuditController } from './audit.controller';
import { AuditService } from './audit.service';

@Module({
  imports: [RequestContextModule],
  controllers: [AuditController, AdminAuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
