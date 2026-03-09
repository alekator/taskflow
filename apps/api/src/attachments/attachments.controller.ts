import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequestUser } from '../auth/request-user.type';
import { AttachmentsService } from './attachments.service';
import { CompleteTaskAttachmentUploadDto } from './dto/complete-task-attachment-upload.dto';
import { CreateTaskAttachmentUploadDto } from './dto/create-task-attachment-upload.dto';

type AuthedRequest = Request & { user: RequestUser };

@Controller('tasks/:taskId/attachments')
@UseGuards(JwtAuthGuard)
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('uploads')
  createUpload(
    @Req() req: AuthedRequest,
    @Param('taskId') taskId: string,
    @Body() dto: CreateTaskAttachmentUploadDto,
  ) {
    return this.attachments.createUpload(
      req.user.id,
      req.user.role,
      taskId,
      dto,
    );
  }

  @Post(':attachmentId/complete')
  completeUpload(
    @Req() req: AuthedRequest,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() dto: CompleteTaskAttachmentUploadDto,
  ) {
    return this.attachments.completeUpload(
      req.user.id,
      req.user.role,
      taskId,
      attachmentId,
      dto,
    );
  }

  @Get()
  list(@Req() req: AuthedRequest, @Param('taskId') taskId: string) {
    return this.attachments.list(req.user.id, req.user.role, taskId);
  }

  @Delete(':attachmentId')
  remove(
    @Req() req: AuthedRequest,
    @Param('taskId') taskId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.attachments.remove(
      req.user.id,
      req.user.role,
      taskId,
      attachmentId,
    );
  }
}
