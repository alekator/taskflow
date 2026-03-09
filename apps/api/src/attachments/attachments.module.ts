import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AttachmentsController } from './attachments.controller';
import { ProjectAttachmentsController } from './project-attachments.controller';
import { AttachmentsService } from './attachments.service';

@Module({
  imports: [AuditModule],
  controllers: [AttachmentsController, ProjectAttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
