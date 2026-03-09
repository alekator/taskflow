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
import { CreateProjectAttachmentUploadDto } from './dto/create-project-attachment-upload.dto';

type AuthedRequest = Request & { user: RequestUser };

@Controller('projects/:projectId/attachments')
@UseGuards(JwtAuthGuard)
export class ProjectAttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('uploads')
  createUpload(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateProjectAttachmentUploadDto,
  ) {
    return this.attachments.createProjectUpload(
      req.user.id,
      req.user.role,
      projectId,
      dto,
    );
  }

  @Post(':attachmentId/complete')
  completeUpload(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
    @Body() dto: CompleteTaskAttachmentUploadDto,
  ) {
    return this.attachments.completeProjectUpload(
      req.user.id,
      req.user.role,
      projectId,
      attachmentId,
      dto,
    );
  }

  @Get()
  list(@Req() req: AuthedRequest, @Param('projectId') projectId: string) {
    return this.attachments.listProject(req.user.id, req.user.role, projectId);
  }

  @Delete(':attachmentId')
  remove(
    @Req() req: AuthedRequest,
    @Param('projectId') projectId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return this.attachments.removeProject(
      req.user.id,
      req.user.role,
      projectId,
      attachmentId,
    );
  }
}
